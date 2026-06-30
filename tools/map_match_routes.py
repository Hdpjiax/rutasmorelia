"""Align official route geometries to the current OpenStreetMap road centerlines.

The script is intentionally offline-first and auditable: it downloads OSM highway
ways through Overpass, keeps a cache, writes GeoJSON previews and emits SQL files.
It never connects with a privileged database key and never mutates production.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import time
from pathlib import Path
from typing import Any, Iterable

import requests
import networkx as nx
from shapely.geometry import LineString, Point, shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / "apps/mobile/src/config/env.ts"
DEFAULT_CACHE = ROOT / "geo-cache/osm"
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
EXCLUDED_HIGHWAYS = {
    "bridleway", "construction", "corridor", "cycleway", "footway",
    "path", "proposed", "raceway", "steps",
}


def read_public_config() -> tuple[str, str]:
    text = ENV_FILE.read_text(encoding="utf-8")
    url = re.search(r"supabaseUrl:\s*'([^']+)'", text)
    key = re.search(r"supabasePublishableKey:\s*'([^']+)'", text)
    if not url or not key:
        raise RuntimeError("No se encontró la configuración pública de Supabase")
    return url.group(1), key.group(1)


def fetch_routes(route_ids: list[int] | None) -> list[dict[str, Any]]:
    base_url, key = read_public_config()
    query = "select=id,route_id,name,geometry,source_geometry,routes!inner(name,is_active,validation_status)"
    query += "&routes.is_active=eq.true&routes.validation_status=eq.validated"
    if route_ids:
        query += "&route_id=in.(" + ",".join(map(str, route_ids)) + ")"
    response = requests.get(
        f"{base_url}/rest/v1/route_variants?{query}",
        headers={"apikey": key, "Accept": "application/json"}, timeout=120,
    )
    response.raise_for_status()
    routes = response.json()
    for route in routes:
        if route.get("source_geometry"):
            route["geometry"] = route["source_geometry"]
    return routes


def geometry_lines(geometry: dict[str, Any]) -> list[list[list[float]]]:
    if geometry["type"] == "LineString":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiLineString":
        return geometry["coordinates"]
    raise ValueError(f"Geometría no soportada: {geometry['type']}")


def route_bbox(routes: Iterable[dict[str, Any]], padding: float = 0.002) -> tuple[float, float, float, float]:
    points = [p for route in routes for line in geometry_lines(route["geometry"]) for p in line]
    return (
        min(p[1] for p in points) - padding,
        min(p[0] for p in points) - padding,
        max(p[1] for p in points) + padding,
        max(p[0] for p in points) + padding,
    )


def tiles(bbox: tuple[float, float, float, float], size: float) -> Iterable[tuple[float, float, float, float]]:
    south, west, north, east = bbox
    lat = south
    while lat < north:
        lon = west
        while lon < east:
            yield lat, lon, min(lat + size, north), min(lon + size, east)
            lon += size
        lat += size


def fetch_osm_tile(bbox: tuple[float, float, float, float], cache_dir: Path) -> dict[str, Any]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_key = "_".join(f"{value:.5f}" for value in bbox).replace("-", "m")
    cache_file = cache_dir / f"roads_{cache_key}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))

    south, west, north, east = bbox
    query = f"""[out:json][timeout:180];
way[\"highway\"]({south},{west},{north},{east});
out tags geom;"""
    last_error: Exception | None = None
    for attempt in range(4):
        url = OVERPASS_URLS[attempt % len(OVERPASS_URLS)]
        try:
            response = requests.post(
                url, data={"data": query},
                headers={"User-Agent": "ViaMorelia-route-alignment/1.0"}, timeout=240,
            )
            response.raise_for_status()
            payload = response.json()
            cache_file.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
            time.sleep(1)
            return payload
        except (requests.RequestException, ValueError) as error:
            last_error = error
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Overpass no respondió para {bbox}: {last_error}")


def fetch_roads(bbox: tuple[float, float, float, float], cache_dir: Path, tile_size: float) -> list[dict[str, Any]]:
    ways: dict[int, dict[str, Any]] = {}
    tile_list = list(tiles(bbox, tile_size))
    for index, tile in enumerate(tile_list, 1):
        print(f"OSM {index}/{len(tile_list)} {tile}", flush=True)
        for element in fetch_osm_tile(tile, cache_dir).get("elements", []):
            highway = element.get("tags", {}).get("highway")
            if element.get("type") == "way" and highway not in EXCLUDED_HIGHWAYS and len(element.get("geometry", [])) >= 2:
                ways[element["id"]] = element
    return list(ways.values())


class RoadIndex:
    def __init__(self, ways: list[dict[str, Any]], center_lat: float, center_lon: float):
        self.center_lat = center_lat
        self.center_lon = center_lon
        self.cos_lat = math.cos(math.radians(center_lat))
        self.segments: list[LineString] = []
        self.way_ids: list[int] = []
        self.highways: list[str] = []
        self.segment_nodes: list[tuple[tuple[float, float], tuple[float, float]]] = []
        self.graph = nx.Graph()
        self.node_xy: dict[tuple[float, float], tuple[float, float]] = {}

        # 1. Build initial graph from all ways
        for way in ways:
            lonlat = [(round(node["lon"], 7), round(node["lat"], 7)) for node in way["geometry"]]
            for start_node, end_node in zip(lonlat, lonlat[1:]):
                if start_node != end_node:
                    start = self.to_xy(*start_node)
                    end = self.to_xy(*end_node)
                    length = math.dist(start, end)
                    current = self.graph.get_edge_data(start_node, end_node)
                    if current is None or length < current["weight"]:
                        self.graph.add_edge(start_node, end_node, weight=length)

        # 2. Prune small disconnected components (e.g. size < 15) to prevent snaps to isolated lanes
        components = list(nx.connected_components(self.graph))
        nodes_to_remove = set()
        for c in components:
            if len(c) < 15:
                nodes_to_remove.update(c)
        self.graph.remove_nodes_from(nodes_to_remove)

        # 3. Populate segments and mapping tables for remaining connected edges
        for way in ways:
            lonlat = [(round(node["lon"], 7), round(node["lat"], 7)) for node in way["geometry"]]
            coords = [self.to_xy(*node) for node in lonlat]
            for start, end, start_node, end_node in zip(coords, coords[1:], lonlat, lonlat[1:]):
                if start != end:
                    if self.graph.has_edge(start_node, end_node):
                        self.segments.append(LineString((start, end)))
                        self.way_ids.append(way["id"])
                        self.highways.append(way.get("tags", {}).get("highway", "road"))
                        self.segment_nodes.append((start_node, end_node))
                        self.node_xy[start_node] = start
                        self.node_xy[end_node] = end
        self.tree = STRtree(self.segments)

    def to_xy(self, lon: float, lat: float) -> tuple[float, float]:
        return ((lon - self.center_lon) * 111_320 * self.cos_lat, (lat - self.center_lat) * 110_540)

    def to_lonlat(self, x: float, y: float) -> list[float]:
        return [round(x / (111_320 * self.cos_lat) + self.center_lon, 7), round(y / 110_540 + self.center_lat, 7)]

    def simplify_line(self, coordinates: list[list[float]], tolerance_m: float) -> list[list[float]]:
        projected = LineString(self.to_xy(point[0], point[1]) for point in coordinates)
        simplified = projected.simplify(tolerance_m, preserve_topology=False)
        return [self.to_lonlat(x, y) for x, y in simplified.coords]

    def snap_candidates(
        self,
        coord: list[float],
        tangent: tuple[float, float],
        max_distance: float,
        limit: int = 12,
    ) -> list[tuple[float, tuple[list[float], float, int, int]]]:
        point = Point(self.to_xy(coord[0], coord[1]))
        candidates = self.tree.query(point.buffer(max_distance))
        ranked: list[tuple[float, float, int, Point]] = []
        tx, ty = tangent
        tangent_norm = math.hypot(tx, ty) or 1
        for raw_index in candidates:
            index = int(raw_index)
            segment = self.segments[index]
            distance = point.distance(segment)
            (x1, y1), (x2, y2) = segment.coords
            road_dx, road_dy = x2 - x1, y2 - y1
            road_norm = math.hypot(road_dx, road_dy) or 1
            direction_match = abs((tx * road_dx + ty * road_dy) / (tangent_norm * road_norm))
            score = distance + (1 - direction_match) * 10
            snapped = segment.interpolate(segment.project(point))
            ranked.append((score, distance, index, snapped))
        ranked.sort(key=lambda candidate: candidate[:2])
        return [
            (score, (self.to_lonlat(snapped.x, snapped.y), distance, self.way_ids[index], index))
            for score, distance, index, snapped in ranked[:limit]
            if distance <= max_distance
        ]

    def snap(self, coord: list[float], tangent: tuple[float, float], max_distance: float) -> tuple[list[float], float, int, int] | None:
        candidates = self.snap_candidates(coord, tangent, max_distance, limit=1)
        return candidates[0][1] if candidates else None

    def road_path(
        self,
        previous: tuple[list[float], float, int, int],
        current: tuple[list[float], float, int, int],
    ) -> tuple[list[list[float]], float] | None:
        previous_coord, _, _, previous_index = previous
        current_coord, _, _, current_index = current
        if previous_index == current_index:
            return [previous_coord, current_coord], math.dist(self.to_xy(*previous_coord), self.to_xy(*current_coord))

        previous_nodes = self.segment_nodes[previous_index]
        current_nodes = self.segment_nodes[current_index]
        previous_xy = self.to_xy(*previous_coord)
        current_xy = self.to_xy(*current_coord)
        best: tuple[float, list[tuple[float, float]]] | None = None

        for exit_node in previous_nodes:
            exit_cost = math.dist(previous_xy, self.node_xy[exit_node])
            for entry_node in current_nodes:
                entry_cost = math.dist(current_xy, self.node_xy[entry_node])
                try:
                    node_path = nx.astar_path(
                        self.graph,
                        exit_node,
                        entry_node,
                        heuristic=lambda left, right: math.dist(self.node_xy[left], self.node_xy[right]),
                        weight="weight",
                    )
                except (nx.NetworkXNoPath, nx.NodeNotFound):
                    continue
                network_cost = sum(
                    self.graph[left][right]["weight"] for left, right in zip(node_path, node_path[1:])
                )
                cost = exit_cost + network_cost + entry_cost
                if best is None or cost < best[0]:
                    best = cost, node_path

        if best is None:
            return None
        output = [previous_coord]
        output.extend([list(node) for node in best[1]])
        output.append(current_coord)
        deduplicated = [output[0]]
        for coord in output[1:]:
            if coord != deduplicated[-1]:
                deduplicated.append(coord)
        return deduplicated, best[0]


def tangent(coords: list[list[float]], index: int, roads: RoadIndex) -> tuple[float, float]:
    before = roads.to_xy(*coords[max(0, index - 1)])
    after = roads.to_xy(*coords[min(len(coords) - 1, index + 1)])
    return after[0] - before[0], after[1] - before[1]


def line_length_m(coords: list[list[float]], roads: RoadIndex) -> float:
    return sum(math.dist(roads.to_xy(*left), roads.to_xy(*right)) for left, right in zip(coords, coords[1:]))


def merge_source_lines(geometry: dict[str, Any], roads: RoadIndex, join_distance_m: float = 75.0) -> list[list[list[float]]]:
    candidates: list[list[list[float]]] = []
    seen: set[tuple[tuple[float, float], ...]] = set()
    for raw_line in geometry_lines(geometry):
        if line_length_m(raw_line, roads) < 15:
            continue
        canonical = tuple((round(point[0], 6), round(point[1], 6)) for point in raw_line)
        reverse = tuple(reversed(canonical))
        key = min(canonical, reverse)
        if key not in seen:
            seen.add(key)
            candidates.append(raw_line)

    chains: list[list[list[float]]] = []
    while candidates:
        seed_index = max(range(len(candidates)), key=lambda index: line_length_m(candidates[index], roads))
        chain = candidates.pop(seed_index)[:]
        changed = True
        while changed and candidates:
            changed = False
            chain_start = roads.to_xy(*chain[0])
            chain_end = roads.to_xy(*chain[-1])
            options: list[tuple[float, str, int]] = []
            for index, line in enumerate(candidates):
                start = roads.to_xy(*line[0])
                end = roads.to_xy(*line[-1])
                # Option 1: chain + line (append normal)
                options.append((math.dist(chain_end, start), "append_normal", index))
                # Option 2: chain + reversed(line) (append reversed)
                options.append((math.dist(chain_end, end), "append_reversed", index))
                # Option 3: line + chain (prepend normal)
                options.append((math.dist(end, chain_start), "prepend_normal", index))
                # Option 4: reversed(line) + chain (prepend reversed)
                options.append((math.dist(start, chain_start), "prepend_reversed", index))
            distance, operation, index = min(options)
            if distance <= join_distance_m:
                line = candidates.pop(index)
                if operation == "append_normal":
                    chain.extend(line[1:] if chain[-1] == line[0] else line)
                elif operation == "append_reversed":
                    rev_line = list(reversed(line))
                    chain.extend(rev_line[1:] if chain[-1] == rev_line[0] else rev_line)
                elif operation == "prepend_normal":
                    chain = line[:-1] + chain if line[-1] == chain[0] else line + chain
                elif operation == "prepend_reversed":
                    rev_line = list(reversed(line))
                    chain = rev_line[:-1] + chain if rev_line[-1] == chain[0] else rev_line + chain
                changed = True
        chains.append(chain)
    return chains


def densify_line(coords: list[list[float]], roads: RoadIndex, spacing_m: float = 15.0) -> list[list[float]]:
    output = [coords[0]]
    for left, right in zip(coords, coords[1:]):
        left_xy = roads.to_xy(*left)
        right_xy = roads.to_xy(*right)
        distance = math.dist(left_xy, right_xy)
        steps = max(1, math.ceil(distance / spacing_m))
        for step in range(1, steps + 1):
            ratio = step / steps
            output.append(roads.to_lonlat(
                left_xy[0] + (right_xy[0] - left_xy[0]) * ratio,
                left_xy[1] + (right_xy[1] - left_xy[1]) * ratio,
            ))
    return output


def align_route(route: dict[str, Any], roads: RoadIndex, max_distance: float, simplify_meters: float) -> tuple[dict[str, Any], dict[str, Any]]:
    output_lines: list[list[list[float]]] = []
    shifts: list[float] = []
    way_ids: set[int] = set()
    total = 0
    snapped_count = 0
    disconnected_transitions = 0
    graph_distance = 0.0
    transition_diagnostics: list[dict[str, Any]] = []
    source_lines = merge_source_lines(route["geometry"], roads)

    for source_line in source_lines:
        # Simplify the source line first to remove tiny GPS spikes, jitters, and overshoots
        if len(source_line) > 2:
            proj_source = LineString(roads.to_xy(*p) for p in source_line)
            simplified_source = proj_source.simplify(6.0, preserve_topology=True)
            simplified_coords = [roads.to_lonlat(x, y) for x, y in simplified_source.coords]
        else:
            simplified_coords = source_line
        line = densify_line(simplified_coords, roads)
        T = len(line)
        if T == 0:
            continue

        candidate_lists = []
        for index, coord in enumerate(line):
            candidates = roads.snap_candidates(coord, tangent(line, index, roads), max_distance, limit=8)
            if not candidates:
                # Dummy candidate for unmapped areas
                dummy_cand = (coord, 0.0, -1, -1)
                candidates = [(max_distance + 15.0, dummy_cand)]
            candidate_lists.append(candidates)

        total += T

        # Viterbi DP arrays
        # dp[t][i] = min cost to reach candidate i at step t
        # parent[t][i] = index of best predecessor candidate at step t-1
        dp = []
        parent = []

        # Initialize t = 0
        dp.append([c[0] for c in candidate_lists[0]])
        parent.append([-1] * len(candidate_lists[0]))

        for t in range(1, T):
            prev_candidates = candidate_lists[t-1]
            curr_candidates = candidate_lists[t]
            source_dist = math.dist(roads.to_xy(*line[t-1]), roads.to_xy(*line[t]))

            t_dp = []
            t_parent = []

            for curr_idx, (curr_emission, curr_cand) in enumerate(curr_candidates):
                best_score = float('inf')
                best_prev_idx = -1

                for prev_idx, (prev_emission, prev_cand) in enumerate(prev_candidates):
                    # Check connection
                    path = None
                    if prev_cand[3] != -1 and curr_cand[3] != -1:
                        path = roads.road_path(prev_cand, curr_cand)

                    if path is None:
                        # Direct connection fallback (OSM gap or dummy candidate)
                        euclidean_dist = math.dist(roads.to_xy(*prev_cand[0]), roads.to_xy(*curr_cand[0]))
                        # Large penalty if they are both valid roads but disconnected (tramos rotos)
                        # No penalty (or small) if one of them is a dummy candidate
                        penalty = 1500.0 if (prev_cand[3] != -1 and curr_cand[3] != -1) else 100.0
                        transition_cost = abs(euclidean_dist - source_dist) * 0.9 + euclidean_dist * 0.05 + penalty
                    else:
                        _, path_distance = path
                        transition_cost = abs(path_distance - source_dist) * 0.9 + path_distance * 0.05

                    score = dp[t-1][prev_idx] + transition_cost
                    if score < best_score:
                        best_score = score
                        best_prev_idx = prev_idx

                t_dp.append(best_score + curr_emission)
                t_parent.append(best_prev_idx)

            dp.append(t_dp)
            parent.append(t_parent)

        # Reconstruct path
        best_last_idx = min(range(len(candidate_lists[-1])), key=lambda idx: dp[-1][idx])
        selected = []
        curr_idx = best_last_idx
        for t in range(T - 1, -1, -1):
            selected.append(candidate_lists[t][curr_idx][1])
            curr_idx = parent[t][curr_idx]
        selected.reverse()

        # Build coordinates output
        output: list[list[float]] = [selected[0][0]]
        for transition_index, (previous, current) in enumerate(zip(selected, selected[1:])):
            source_dist = math.dist(roads.to_xy(*line[transition_index]), roads.to_xy(*line[transition_index + 1]))
            path = None
            if previous[3] != -1 and current[3] != -1:
                path = roads.road_path(previous, current)

            if path is None:
                # If there's a gap, draw a straight line directly to the next point
                output.append(current[0])
                if previous[3] != -1 and current[3] != -1:
                    disconnected_transitions += 1
            else:
                path_coords, path_distance = path
                graph_distance += path_distance
                if path_distance > max(50, source_dist * 3):
                    transition_diagnostics.append({
                        "path_m": round(path_distance, 1),
                        "source_m": round(source_dist, 1),
                        "source": line[transition_index],
                        "matched": previous[0],
                        "next_matched": current[0],
                        "ways": [previous[2], current[2]],
                    })
                output.extend(path_coords[1:])

        for match in selected:
            if match[3] != -1:
                snapped_count += 1
                shifts.append(match[1])
                way_ids.add(match[2])

        if len(output) >= 2:
            output_lines.append(roads.simplify_line(output, simplify_meters))

    geometry_type = "LineString" if len(output_lines) == 1 else "MultiLineString"
    aligned = {
        "type": geometry_type,
        "coordinates": output_lines[0] if geometry_type == "LineString" else output_lines,
    }
    road_distances: list[float] = []
    for output_line in output_lines:
        projected_line = LineString(roads.to_xy(*coord) for coord in output_line)
        for sample_index in range(int(projected_line.length / 2) + 1):
            sample = projected_line.interpolate(min(sample_index * 2, projected_line.length))
            nearby = roads.tree.query(sample.buffer(2))
            road_distances.append(min((sample.distance(roads.segments[int(index)]) for index in nearby), default=999.0))
    sorted_road_distances = sorted(road_distances)
    road_p95 = sorted_road_distances[min(len(sorted_road_distances) - 1, int(len(sorted_road_distances) * 0.95))] if sorted_road_distances else 999.0
    road_max = max(road_distances, default=999.0)
    snapped_percent = round(snapped_count * 100 / total, 2)
    quality_pass = snapped_percent >= 98 and disconnected_transitions == 0 and road_max <= 0.5 and shape(aligned).is_valid
    metrics = {
        "method": "osm_connected_graph_match_v3",
        "osm_source": "OpenStreetMap via Overpass",
        "points_total": total,
        "points_snapped": snapped_count,
        "snapped_percent": snapped_percent,
        "mean_shift_m": round(sum(shifts) / len(shifts), 3) if shifts else None,
        "max_shift_m": round(max(shifts), 3) if shifts else None,
        "osm_ways_used": len(way_ids),
        "max_allowed_shift_m": max_distance,
        "simplify_tolerance_m": simplify_meters,
        "output_points": sum(len(line) for line in output_lines),
        "source_parts": len(geometry_lines(route["geometry"])),
        "merged_paths": len(source_lines),
        "disconnected_transitions": disconnected_transitions,
        "graph_distance_m": round(graph_distance, 1),
        "long_transition_count": len(transition_diagnostics),
        "max_transition_m": max((item["path_m"] for item in transition_diagnostics), default=0),
        "long_transition_examples": sorted(transition_diagnostics, key=lambda item: item["path_m"], reverse=True)[:10],
        "road_sample_count": len(road_distances),
        "road_mean_distance_m": round(sum(road_distances) / len(road_distances), 3) if road_distances else None,
        "road_p95_distance_m": round(road_p95, 3),
        "road_max_distance_m": round(road_max, 3),
        "quality_pass": quality_pass,
    }
    return aligned, metrics


def dollar_json(value: Any) -> str:
    return "$geo$" + json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "$geo$"


def geometry_sql(geometry: dict[str, Any]) -> str:
    if geometry["type"] == "LineString":
        return f"ST_GeomFromText($wkt$%s$wkt$,4326)" % shape(geometry).wkt
    parts = []
    for index, coordinates in enumerate(geometry["coordinates"]):
        line_wkt = LineString(coordinates).wkt
        parts.append(f"ST_GeomFromText($line{index}${line_wkt}$line{index}$,4326)")
    return "ST_Multi(ST_Collect(ARRAY[" + ",".join(parts) + "]))"


def write_outputs(routes: list[dict[str, Any]], aligned: list[tuple[dict[str, Any], dict[str, Any]]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    sql_dir = output_dir / "sql"
    sql_dir.mkdir(parents=True, exist_ok=True)
    features = []
    statements = ["begin;"]
    report = []
    for route, (geometry, metrics) in zip(routes, aligned):
        report.append({"variant_id": route["id"], "route_id": route["route_id"], "name": route["routes"]["name"], **metrics})
        features.append({"type": "Feature", "properties": report[-1], "geometry": geometry})
        statement = (
            "update public.route_variants set "
            f"geometry={geometry_sql(geometry)},"
            f"alignment_metadata={dollar_json(metrics)}::jsonb,alignment_updated_at=now() "
            f"where id={int(route['id'])} and source_geometry is not null;"
        )
        if metrics["quality_pass"]:
            statements.append(statement)
            (sql_dir / f"route_{int(route['route_id'])}.sql").write_text("begin;\n" + statement + "\ncommit;\n", encoding="utf-8")
    statements.append("commit;")
    (output_dir / "matched_routes.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False), encoding="utf-8"
    )
    (output_dir / "alignment_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "apply_matched_routes.sql").write_text("\n".join(statements), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--route-ids", help="IDs separados por coma; omitir para todas las rutas activas")
    parser.add_argument("--max-distance", type=float, default=30.0)
    parser.add_argument("--simplify-meters", type=float, default=0.25)
    parser.add_argument("--tile-size", type=float, default=0.15)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "geo-cache/matched")
    args = parser.parse_args()

    route_ids = [int(value) for value in args.route_ids.split(",")] if args.route_ids else None
    routes = fetch_routes(route_ids)
    if not routes:
        raise RuntimeError("No se encontraron rutas")
    bbox = route_bbox(routes)
    ways = fetch_roads(bbox, args.cache_dir, args.tile_size)
    center_lat = (bbox[0] + bbox[2]) / 2
    center_lon = (bbox[1] + bbox[3]) / 2
    road_index = RoadIndex(ways, center_lat, center_lon)
    print(f"{len(routes)} rutas, {len(ways)} vías OSM, {len(road_index.segments)} segmentos", flush=True)
    aligned = [align_route(route, road_index, args.max_distance, args.simplify_meters) for route in routes]
    write_outputs(routes, aligned, args.output_dir)
    for route, (_, metrics) in zip(routes, aligned):
        print(route["route_id"], route["routes"]["name"], json.dumps(metrics, ensure_ascii=False))


if __name__ == "__main__":
    main()
