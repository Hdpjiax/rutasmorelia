from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from .config import QualityThresholds
import math
from .geometry import (
    Coordinate,
    clean_matched_geometry,
    deduplicate,
    densify,
    distance_m,
    interpolate,
    segment_route_at_turns,
    structural_anchors,
)


class TraceActor(Protocol):
    def trace_attributes(self, request: dict[str, Any]) -> dict[str, Any]: ...

    def route(self, request: dict[str, Any]) -> dict[str, Any]: ...

    def locate(self, request: dict[str, Any]) -> dict[str, Any]: ...


@dataclass
class MatchedComponent:
    coordinates: list[Coordinate]
    edges: list[dict[str, Any]] = field(default_factory=list)
    matched_points: list[dict[str, Any]] = field(default_factory=list)
    search_radius_m: int = 0
    source_points: int = 0
    anchor_indices: list[int] = field(default_factory=list)


def create_actor(config_path: Path) -> TraceActor:
    try:
        from valhalla import Actor
    except ImportError as error:
        raise RuntimeError(
            "pyvalhalla no está instalado. Ejecute con .venv-valhalla\\Scripts\\python.exe"
        ) from error
    return Actor(config_path)


def _decode_shape(encoded: str) -> list[Coordinate]:
    try:
        from valhalla.utils.decode_polyline import decode_polyline
    except ImportError as error:
        raise RuntimeError("No se encontró el decodificador de pyvalhalla") from error
    return [(float(lon), float(lat)) for lon, lat in decode_polyline(encoded, precision=6, order="lnglat")]


def _parse_response(response: dict[str, Any] | str) -> dict[str, Any]:
    if isinstance(response, str):
        return json.loads(response)
    return response


def _route_request(locations: list[Coordinate], thresholds: QualityThresholds) -> dict[str, Any]:
    return {
        "locations": [{"lon": lon, "lat": lat} for lon, lat in locations],
        "costing": "auto",
        "costing_options": {"auto": {"ignore_oneways": thresholds.ignore_oneways}},
        "directions_options": {"units": "kilometers"},
    }


def _decode_trip_shape(response: dict[str, Any]) -> list[Coordinate]:
    trip = response.get("trip") or {}
    coordinates: list[Coordinate] = []
    for leg in trip.get("legs") or []:
        encoded = leg.get("shape")
        if isinstance(encoded, str):
            coordinates.extend(_decode_shape(encoded))
    return deduplicate(coordinates)


def _locate_snap(actor: TraceActor, point: Coordinate, radius_m: int) -> Coordinate:
    response = _parse_response(actor.locate({"locations": [{"lon": point[0], "lat": point[1]}], "costing": "auto"}))
    candidates = response[0].get("edges") or []
    best = point
    best_distance = float("inf")
    for edge in candidates:
        snapped = (float(edge["correlated_lon"]), float(edge["correlated_lat"]))
        distance = distance_m(point, snapped)
        if distance <= radius_m and distance < best_distance:
            best = snapped
            best_distance = distance
    return best


def _trace_request(points: list[Coordinate], radius_m: int, thresholds: QualityThresholds) -> dict[str, Any]:
    return {
        "shape": [{"lon": lon, "lat": lat} for lon, lat in points],
        # Official transit KML is the direction authority. Some OSM ways have
        # a one-way orientation that conflicts with that trace; strict bus
        # costing then invents kilometre-long detours. Keep bus-accessible road
        # edges while allowing the matcher to follow the KML orientation.
        "costing": "auto",
        "costing_options": {"auto": {"ignore_oneways": thresholds.ignore_oneways}},
        "shape_match": "map_snap",
        "trace_options": {
            "search_radius": radius_m,
            "gps_accuracy": max(5, min(radius_m, 20)),
            "breakage_distance": thresholds.breakage_distance_m,
            "interpolation_distance": int(thresholds.densify_m),
        },
        "filters": {
            "action": "include",
            "attributes": [
                "shape",
                "edge.id",
                "edge.way_id",
                "edge.begin_shape_index",
                "edge.end_shape_index",
                "edge.names",
                "edge.road_class",
                "edge.traversability",
                "edge.roundabout",
                "edge.bridge",
                "edge.tunnel",
                "matched.point",
                "matched.edge_index",
                "matched.distance_along_edge",
                "matched.distance_from_trace_point",
            ],
        },
    }


def _chunks(points: list[Coordinate], thresholds: QualityThresholds) -> list[list[Coordinate]]:
    maximum, overlap = thresholds.max_trace_points, thresholds.overlap_points
    if len(points) <= maximum:
        return [points]
    result: list[list[Coordinate]] = []
    start = 0
    while start < len(points) - 1:
        end = min(len(points), start + maximum)
        result.append(points[start:end])
        if end == len(points):
            break
        start = end - overlap
    return result


def _stitch(left: MatchedComponent, right: MatchedComponent) -> MatchedComponent:
    if not left.coordinates:
        return right
    if not right.coordinates:
        return left
    best: tuple[float, int, int] | None = None
    left_start = max(0, len(left.coordinates) - 100)
    right_end = min(100, len(right.coordinates))
    for left_index in range(left_start, len(left.coordinates)):
        for right_index in range(right_end):
            gap = distance_m(left.coordinates[left_index], right.coordinates[right_index])
            if best is None or gap < best[0]:
                best = (gap, left_index, right_index)
    if best is None or best[0] > 2.0:
        raise ValueError(f"Los bloques Valhalla no comparten eje vial (separación {best[0] if best else 'N/A'} m)")
    _, left_index, right_index = best
    edge_ids = {str(edge.get("id")) for edge in left.edges if edge.get("id") is not None}
    right_first_ids = {str(edge.get("id")) for edge in right.edges[:5] if edge.get("id") is not None}
    if edge_ids and right_first_ids and not edge_ids.intersection(right_first_ids):
        # Coordinates remain the final authority because an overlap may end exactly on an adjacent edge.
        if best[0] > 0.75:
            raise ValueError("Los bloques no comparten arista ni nodo verificable")
    return MatchedComponent(
        coordinates=deduplicate(left.coordinates[: left_index + 1] + right.coordinates[right_index + 1 :]),
        edges=left.edges + right.edges,
        matched_points=left.matched_points + right.matched_points,
        search_radius_m=max(left.search_radius_m, right.search_radius_m),
        source_points=left.source_points + right.source_points,
        anchor_indices=left.anchor_indices + right.anchor_indices,
    )


def smart_densify(actor: TraceActor, points: list[Coordinate], spacing_m: float, max_offroad_m: float = 25.0) -> list[Coordinate]:
    if len(points) < 2:
        return points[:]
        
    long_segments = []
    for idx, (start, end) in enumerate(zip(points, points[1:])):
        length = distance_m(start, end)
        if length > 60.0:
            long_segments.append((idx, interpolate(start, end, 0.5)))
            
    offroad_indices = set()
    if long_segments:
        req = {
            "locations": [{"lon": pt[0], "lat": pt[1]} for _, pt in long_segments],
            "costing": "bus"
        }
        try:
            response = actor.locate(req)
            if isinstance(response, str):
                response = json.loads(response)
            for i, (idx, pt) in enumerate(long_segments):
                edges = response[i].get("edges", [])
                midpoint_dist = float("inf")
                for edge in edges:
                    d = distance_m(pt, (edge["correlated_lon"], edge["correlated_lat"]))
                    if d < midpoint_dist:
                        midpoint_dist = d
                if midpoint_dist > max_offroad_m:
                    offroad_indices.add(idx)
        except Exception:
            pass
            
    result = [points[0]]
    for idx, (start, end) in enumerate(zip(points, points[1:])):
        if idx in offroad_indices:
            result.append(end)
        else:
            length = distance_m(start, end)
            count = max(1, math.ceil(length / spacing_m))
            result.extend(interpolate(start, end, i / count) for i in range(1, count + 1))
            
    return deduplicate(result)


def _match_trace(
    actor: TraceActor,
    observations: list[Coordinate],
    thresholds: QualityThresholds,
) -> MatchedComponent:
    matched_chunks: list[MatchedComponent] = []
    for chunk in _chunks(observations, thresholds):
        last_error: Exception | None = None
        for radius in thresholds.search_radii_m:
            try:
                response = actor.trace_attributes(_trace_request(chunk, radius, thresholds))
                encoded = response.get("shape")
                coordinates = _decode_shape(encoded) if isinstance(encoded, str) else []
                edges = response.get("edges") or []
                if len(coordinates) < 2 or not edges:
                    raise ValueError("Valhalla no devolvió forma y aristas completas")
                matched_chunks.append(
                    MatchedComponent(
                        coordinates=deduplicate(coordinates),
                        edges=edges,
                        matched_points=response.get("matched_points") or [],
                        search_radius_m=radius,
                        source_points=len(chunk),
                        anchor_indices=structural_anchors(chunk),
                    )
                )
                break
            except Exception as error:  # Valhalla raises its own extension exception.
                last_error = error
        else:
            raise RuntimeError(f"No fue posible ajustar el componente con radio máximo de 50 m: {last_error}")
    result = matched_chunks[0]
    for matched in matched_chunks[1:]:
        result = _stitch(result, matched)
    return result


def _anchor_points_for_routing(source: list[Coordinate], mode: str) -> list[Coordinate]:
    if len(source) <= 2:
        return source[:]
    if mode == "straight":
        dense = densify(source, 70.0)
        indices = structural_anchors(dense, turn_degrees=18.0)
        if len(indices) < 3:
            step = max(1, len(dense) // 6)
            indices = list(range(0, len(dense), step))
            if indices[-1] != len(dense) - 1:
                indices.append(len(dense) - 1)
        return [dense[index] for index in sorted(set(indices))]
    indices = structural_anchors(source, turn_degrees=14.0)
    return [source[index] for index in indices]


def _match_segment_hybrid(
    actor: TraceActor,
    segment_source: list[Coordinate],
    mode: str,
    thresholds: QualityThresholds,
) -> MatchedComponent:
    segment_thresholds = _thresholds_for_segment(mode, thresholds)
    snap_radius = min(segment_thresholds.search_radii_m)

    if mode in {"straight", "turn"} and len(segment_source) >= 3:
        anchor_points = _anchor_points_for_routing(segment_source, mode)
        snapped = [_locate_snap(actor, point, snap_radius) for point in anchor_points]
        try:
            response = _parse_response(actor.route(_route_request(snapped, segment_thresholds)))
            routed = _decode_trip_shape(response)
            cleaned = clean_matched_geometry(routed, segment_source, mode)
            if len(cleaned) >= 2:
                return MatchedComponent(
                    coordinates=cleaned,
                    edges=[],
                    search_radius_m=snap_radius,
                    source_points=len(segment_source),
                    anchor_indices=structural_anchors(segment_source),
                )
        except Exception:
            pass

    observations = smart_densify(actor, segment_source, segment_thresholds.densify_m)
    matched = _match_trace(actor, observations, segment_thresholds)
    cleaned = clean_matched_geometry(matched.coordinates, segment_source, mode)
    return MatchedComponent(
        coordinates=cleaned or matched.coordinates,
        edges=matched.edges,
        matched_points=matched.matched_points,
        search_radius_m=matched.search_radius_m,
        source_points=matched.source_points,
        anchor_indices=matched.anchor_indices,
    )


def _thresholds_for_segment(mode: str, base: QualityThresholds) -> QualityThresholds:
    if mode == "straight":
        return QualityThresholds(
            densify_m=min(6.0, base.densify_m),
            search_radii_m=tuple(min(radius, 35) for radius in base.search_radii_m),
            p95_distance_m=min(base.p95_distance_m, 18.0),
            max_distance_m=min(base.max_distance_m, 40.0),
            endpoint_distance_m=base.endpoint_distance_m,
            max_trace_points=base.max_trace_points,
            overlap_points=base.overlap_points,
            breakage_distance_m=base.breakage_distance_m,
            ignore_oneways=base.ignore_oneways,
        )
    if mode == "roundabout":
        return QualityThresholds(
            densify_m=min(5.0, base.densify_m),
            search_radii_m=base.search_radii_m,
            p95_distance_m=max(base.p95_distance_m, 35.0),
            max_distance_m=max(base.max_distance_m, 90.0),
            endpoint_distance_m=max(base.endpoint_distance_m, 60.0),
            max_trace_points=min(1200, base.max_trace_points),
            overlap_points=base.overlap_points,
            breakage_distance_m=min(base.breakage_distance_m, 80),
            ignore_oneways=base.ignore_oneways,
        )
    return base


def match_component(
    actor: TraceActor,
    source: list[Coordinate],
    thresholds: QualityThresholds,
    *,
    segmented: bool = False,
) -> MatchedComponent:
    if not segmented or len(source) < 12:
        observations = smart_densify(actor, source, thresholds.densify_m)
        matched = _match_trace(actor, observations, thresholds)
        cleaned = clean_matched_geometry(matched.coordinates, source, "turn")
        return MatchedComponent(
            coordinates=cleaned or matched.coordinates,
            edges=matched.edges,
            matched_points=matched.matched_points,
            search_radius_m=matched.search_radius_m,
            source_points=matched.source_points,
            anchor_indices=matched.anchor_indices,
        )

    segments = segment_route_at_turns(
        source,
        densify_step_m=max(5.0, thresholds.densify_m),
        turn_threshold_deg=12.0,
        straight_chunk_m=380.0,
    )
    stitched_coords: list[Coordinate] = []
    stitched_edges: list[dict[str, Any]] = []
    stitched_points: list[dict[str, Any]] = []
    max_radius = 0
    total_source_points = 0
    anchor_indices: list[int] = []

    for mode, segment_source in segments:
        matched = _match_segment_hybrid(actor, segment_source, mode, thresholds)
        cleaned = matched.coordinates
        if stitched_coords and cleaned:
            if distance_m(stitched_coords[-1], cleaned[0]) < 0.2:
                cleaned = cleaned[1:]
        offset = len(stitched_coords)
        stitched_coords.extend(cleaned)
        stitched_edges.extend(matched.edges)
        stitched_points.extend(matched.matched_points)
        max_radius = max(max_radius, matched.search_radius_m)
        total_source_points += matched.source_points
        anchor_indices.extend(index + offset for index in matched.anchor_indices)

    return MatchedComponent(
        coordinates=deduplicate(stitched_coords),
        edges=stitched_edges,
        matched_points=stitched_points,
        search_radius_m=max_radius,
        source_points=total_source_points,
        anchor_indices=anchor_indices,
    )


def actor_version(actor: TraceActor) -> dict[str, Any]:
    status = getattr(actor, "status", None)
    if status is None:
        return {}
    try:
        value = status()
        return value if isinstance(value, dict) else json.loads(value)
    except Exception:
        return {}
