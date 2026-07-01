from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from .config import QualityThresholds
from .geometry import Coordinate, deduplicate, densify, distance_m, structural_anchors


class TraceActor(Protocol):
    def trace_attributes(self, request: dict[str, Any]) -> dict[str, Any]: ...


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


def _trace_request(points: list[Coordinate], radius_m: int, thresholds: QualityThresholds) -> dict[str, Any]:
    return {
        "shape": [{"lon": lon, "lat": lat} for lon, lat in points],
        # Official transit KML is the direction authority. Some OSM ways have
        # a one-way orientation that conflicts with that trace; strict bus
        # costing then invents kilometre-long detours. Keep bus-accessible road
        # edges while allowing the matcher to follow the KML orientation.
        "costing": "bus",
        "costing_options": {"bus": {"ignore_oneways": True}},
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


def match_component(actor: TraceActor, source: list[Coordinate], thresholds: QualityThresholds) -> MatchedComponent:
    observations = densify(source, thresholds.densify_m)
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


def actor_version(actor: TraceActor) -> dict[str, Any]:
    status = getattr(actor, "status", None)
    if status is None:
        return {}
    try:
        value = status()
        return value if isinstance(value, dict) else json.loads(value)
    except Exception:
        return {}
