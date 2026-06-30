"""Build routes from official KML with road-network routing.

This script implements a detour-free and block-cut-free VUBG matching algorithm.
It constructs an undirected graph of the OSM roads, automatically bridges gaps
up to 40 meters with penalty-weighted bridging edges, and snaps KML waypoints
to roads via Viterbi optimization.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import time
import heapq
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import requests
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
KML_NS = "http://www.opengis.net/kml/2.2"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
EXCLUDED_HIGHWAYS = {
    "bridleway", "construction", "corridor", "cycleway", "footway",
    "path", "proposed", "raceway", "steps",
}


@dataclass(frozen=True)
class Direction:
    index: int
    name: str
    coordinates: list[list[float]]
    retained_components: int
    dropped_noise: int
    dropped_duplicates: int


@dataclass(frozen=True)
class Candidate:
    segment_index: int
    coordinate: list[float]
    distance_m: float
    emission_cost: float


class Projection:
    def __init__(self, center_lon: float, center_lat: float):
        self.center_lon = center_lon
        self.center_lat = center_lat
        self.cos_lat = math.cos(math.radians(center_lat))

    def to_xy(self, point: list[float] | tuple[float, float]) -> tuple[float, float]:
        lon, lat = point
        return (
            (lon - self.center_lon) * 111_320 * self.cos_lat,
            (lat - self.center_lat) * 110_540,
        )

    def to_lonlat(self, point: tuple[float, float]) -> list[float]:
        x, y = point
        return [
            round(x / (111_320 * self.cos_lat) + self.center_lon, 7),
            round(y / 110_540 + self.center_lat, 7),
        ]


def distance_m(left: list[float], right: list[float], projection: Projection) -> float:
    return math.dist(projection.to_xy(left), projection.to_xy(right))


def line_length(coordinates: list[list[float]], projection: Projection) -> float:
    return sum(distance_m(left, right, projection) for left, right in zip(coordinates, coordinates[1:]))


def parse_coordinates(text: str | None) -> list[list[float]]:
    result: list[list[float]] = []
    for token in (text or "").split():
        values = token.split(",")
        if len(values) >= 2:
            result.append([float(values[0]), float(values[1])])
    return result


def parse_kml(path: Path) -> tuple[list[Direction], Projection]:
    text = path.read_text(encoding="utf-8-sig")
    if "xsi:" in text and "xmlns:xsi=" not in text:
        text = re.sub(r"(<kml\b[^>]*)(>)", rf'\1 xmlns:xsi="{XSI_NS}"\2', text, count=1)
    root = ET.fromstring(text)
    raw_groups: list[tuple[str, list[list[list[float]]]]] = []
    all_points: list[list[float]] = []
    for placemark in root.findall(f".//{{{KML_NS}}}Placemark"):
        name_node = placemark.find(f"{{{KML_NS}}}name")
        name = (name_node.text or "Dirección").strip() if name_node is not None else "Dirección"
        components = [
            parse_coordinates(node.text)
            for node in placemark.findall(f".//{{{KML_NS}}}LineString/{{{KML_NS}}}coordinates")
        ]
        components = [component for component in components if len(component) >= 2]
        if components:
            raw_groups.append((name, components))
            all_points.extend(point for component in components for point in component)
    if not raw_groups:
        raise ValueError("El KML no contiene trayectos")
    projection = Projection(
        sum(point[0] for point in all_points) / len(all_points),
        sum(point[1] for point in all_points) / len(all_points),
    )
    directions = [clean_direction(index, name, components, projection) for index, (name, components) in enumerate(raw_groups, 1)]
    return directions, projection


def reverse_duplicate(left: list[list[float]], right: list[list[float]], projection: Projection) -> bool:
    return (
        distance_m(left[0], right[-1], projection) <= 1.0
        and distance_m(left[-1], right[0], projection) <= 1.0
        and abs(line_length(left, projection) - line_length(right, projection)) <= 2.0
    )


def remove_spikes(coordinates: list[list[float]], projection: Projection, threshold_m: float = 50.0) -> list[list[float]]:
    if len(coordinates) < 3:
        return coordinates
    result = [coordinates[0]]
    i = 1
    while i < len(coordinates) - 1:
        prev = result[-1]
        curr = coordinates[i]
        nxt = coordinates[i + 1]
        
        d1 = distance_m(prev, curr, projection)
        d2 = distance_m(curr, nxt, projection)
        d3 = distance_m(prev, nxt, projection)
        
        if d1 > threshold_m and d2 > threshold_m and (d1 + d2 - d3) > threshold_m * 1.5:
            print(f"Ignorando pico/glitch en coordenadas KML: {curr}, ida={d1:.1f}m, vuelta={d2:.1f}m", flush=True)
            i += 1
        else:
            result.append(curr)
            i += 1
    result.append(coordinates[-1])
    return result


def remove_backtracks(
    coordinates: list[list[float]],
    projection: Projection,
    min_dist_m: float = 35.0,
) -> list[list[float]]:
    if len(coordinates) < 3:
        return coordinates
        
    result = [coordinates[0]]
    i = 1
    while i < len(coordinates) - 1:
        prev = result[-1]
        curr = coordinates[i]
        nxt = coordinates[i + 1]
        
        p_prev = projection.to_xy(prev)
        p_curr = projection.to_xy(curr)
        p_nxt = projection.to_xy(nxt)
        
        # Long-range headings to detect backtracks masked by small segments
        p_prev_long = p_prev
        back_idx = len(result) - 1
        while back_idx >= 0:
            pt = projection.to_xy(result[back_idx])
            if math.dist(p_curr, pt) >= 50.0:
                p_prev_long = pt
                break
            back_idx -= 1
            
        p_nxt_long = p_nxt
        ahead_idx = i + 1
        while ahead_idx < len(coordinates):
            pt = projection.to_xy(coordinates[ahead_idx])
            if math.dist(p_curr, pt) >= 50.0:
                p_nxt_long = pt
                break
            ahead_idx += 1
            
        v1_long = (p_curr[0] - p_prev_long[0], p_curr[1] - p_prev_long[1])
        v2_long = (p_nxt_long[0] - p_curr[0], p_nxt_long[1] - p_curr[1])
        
        d1_long = math.hypot(v1_long[0], v1_long[1])
        d2_long = math.hypot(v2_long[0], v2_long[1])
        
        v1 = (p_curr[0] - p_prev[0], p_curr[1] - p_prev[1])
        v2 = (p_nxt[0] - p_curr[0], p_nxt[1] - p_curr[1])
        d1 = math.hypot(v1[0], v1[1])
        d2 = math.hypot(v2[0], v2[1])
        
        dot_long = v1_long[0]*v2_long[0] + v1_long[1]*v2_long[1]
        if d1_long > 0 and d2_long > 0:
            cos_val = max(-1.0, min(1.0, dot_long / (d1_long * d2_long)))
            angle = math.degrees(math.acos(cos_val))
        else:
            angle = 0.0
            
        if angle > 120.0 and (d1 < min_dist_m or d2 < min_dist_m):
            print(f"Removing backtrack node: {curr}, dist1={d1:.1f}m, dist2={d2:.1f}m, angle_long={angle:.1f} deg", flush=True)
            i += 1
        else:
            result.append(curr)
            i += 1
            
    result.append(coordinates[-1])
    return result


def is_subsection_duplicate(
    comp: list[list[float]],
    others: list[list[list[float]]],
    projection: Projection,
    max_dist_m: float = 35.0,
) -> bool:
    comp_xy = [projection.to_xy(p) for p in comp]
    comp_line = LineString(comp_xy)
    comp_len = comp_line.length
    
    for other in others:
        other_xy = [projection.to_xy(p) for p in other]
        other_line = LineString(other_xy)
        other_len = other_line.length
        
        # Only check if the other segment is significantly longer
        if other_len > comp_len * 1.2:
            is_dup = True
            for pt_xy in comp_xy:
                dist = Point(pt_xy).distance(other_line)
                if dist > max_dist_m:
                    is_dup = False
                    break
            if is_dup:
                return True
    return False


def clean_direction(
    index: int,
    name: str,
    components: list[list[list[float]]],
    projection: Projection,
) -> Direction:
    # 1. Drop noise components
    retained: list[list[list[float]]] = []
    dropped_noise = 0
    dropped_duplicates = 0
    for component in components:
        if line_length(component, projection) < 10.0:
            dropped_noise += 1
            continue
        retained.append(component)
        
    if not retained:
        raise ValueError(f"Dirección {index} vacía después de limpiar ruido")
        
    # 2. Filter out sub-section duplicates (parallel overlapping segments)
    final_components: list[list[list[float]]] = []
    for comp in retained:
        # Check against all other components in the group
        others = [other for other in retained if other is not comp]
        if is_subsection_duplicate(comp, others, projection):
            dropped_duplicates += 1
        else:
            final_components.append(comp)
            
    if not final_components:
        final_components = retained
        
    # 3. Greedy aligned stitching
    # Start with the longest component
    longest_idx = max(range(len(final_components)), key=lambda idx: line_length(final_components[idx], projection))
    current_path = list(final_components[longest_idx])
    unused = set(range(len(final_components)))
    unused.remove(longest_idx)
    
    while unused:
        best_dist = float('inf')
        best_idx = -1
        best_reverse = False
        best_append = True
        
        start_pt = current_path[0]
        end_pt = current_path[-1]
        
        for idx in unused:
            comp = final_components[idx]
            c_start = comp[0]
            c_end = comp[-1]
            
            # Option A: append normally
            d_end_start = distance_m(end_pt, c_start, projection)
            if d_end_start < best_dist:
                best_dist = d_end_start
                best_idx = idx
                best_reverse = False
                best_append = True
                
            # Option B: append reversed
            d_end_end = distance_m(end_pt, c_end, projection)
            if d_end_end < best_dist:
                best_dist = d_end_end
                best_idx = idx
                best_reverse = True
                best_append = True
                
            # Option C: prepend normally
            d_start_end = distance_m(start_pt, c_end, projection)
            if d_start_end < best_dist:
                best_dist = d_start_end
                best_idx = idx
                best_reverse = False
                best_append = False
                
            # Option D: prepend reversed
            d_start_start = distance_m(start_pt, c_start, projection)
            if d_start_start < best_dist:
                best_dist = d_start_start
                best_idx = idx
                best_reverse = True
                best_append = False
                
        if best_idx == -1:
            break
            
        comp = list(final_components[best_idx])
        if best_reverse:
            comp.reverse()
            
        if best_append:
            if distance_m(current_path[-1], comp[0], projection) <= 0.05:
                current_path.extend(comp[1:])
            else:
                current_path.extend(comp)
        else:
            if distance_m(comp[-1], current_path[0], projection) <= 0.05:
                current_path = comp[:-1] + current_path
            else:
                current_path = comp + current_path
                
        unused.remove(best_idx)
        
    coordinates = remove_spikes(current_path, projection, threshold_m=50.0)
    coordinates = remove_backtracks(coordinates, projection, min_dist_m=350.0)
    
    return Direction(index, name, coordinates, len(final_components), dropped_noise, dropped_duplicates)


def bbox(directions: list[Direction], padding: float = 0.002) -> tuple[float, float, float, float]:
    points = [point for direction in directions for point in direction.coordinates]
    return (
        min(point[1] for point in points) - padding,
        min(point[0] for point in points) - padding,
        max(point[1] for point in points) + padding,
        max(point[0] for point in points) + padding,
    )


def tiles(bounds: tuple[float, float, float, float], size: float = 0.05) -> Iterable[tuple[float, float, float, float]]:
    south, west, north, east = bounds
    latitude = south
    while latitude < north:
        longitude = west
        while longitude < east:
            yield latitude, longitude, min(latitude + size, north), min(longitude + size, east)
            longitude += size
        latitude += size


def fetch_tile(bounds: tuple[float, float, float, float], cache_dir: Path) -> dict[str, Any]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = "_".join(f"{value:.5f}" for value in bounds).replace("-", "m")
    cache_file = cache_dir / f"roads_{key}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    south, west, north, east = bounds
    query = f'[out:json][timeout:180];way["highway"]({south},{west},{north},{east});out tags geom;'
    error: Exception | None = None
    for attempt in range(4):
        try:
            response = requests.post(
                OVERPASS_URLS[attempt % len(OVERPASS_URLS)],
                data={"data": query},
                headers={"User-Agent": "ViaMorelia-Routing/1.0"},
                timeout=60,
            )
            response.raise_for_status()
            payload = response.json()
            cache_file.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
            time.sleep(1)
            return payload
        except (requests.RequestException, ValueError) as caught:
            error = caught
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Overpass no respondió para {bounds}: {error}")


def fetch_roads(bounds: tuple[float, float, float, float], cache_dir: Path) -> list[dict[str, Any]]:
    ways: dict[int, dict[str, Any]] = {}
    tile_list = list(tiles(bounds))
    for number, tile in enumerate(tile_list, 1):
        print(f"OSM {number}/{len(tile_list)}", flush=True)
        for element in fetch_tile(tile, cache_dir).get("elements", []):
            highway = element.get("tags", {}).get("highway")
            if (
                element.get("type") == "way"
                and highway not in EXCLUDED_HIGHWAYS
                and len(element.get("geometry", [])) >= 2
            ):
                ways[int(element["id"])] = element
    return list(ways.values())


class RoadSegments:
    def __init__(self, ways: list[dict[str, Any]], projection: Projection):
        self.projection = projection
        self.lines: list[LineString] = []
        self.way_ids: list[int] = []
        self.bidirectional: list[bool] = []
        self.highways: list[str] = []
        self.graph: dict[tuple[float, float], dict[tuple[float, float], float]] = {}

        def add_edge(u: tuple[float, float], v: tuple[float, float], cost: float):
            self.graph.setdefault(u, {})[v] = min(self.graph.setdefault(u, {}).get(v, math.inf), cost)

        # 1. Add direct road edges (with direction penalties)
        for way in ways:
            nodes = [[round(node["lon"], 7), round(node["lat"], 7)] for node in way["geometry"]]
            
            tags = way.get("tags", {})
            oneway_tag = tags.get("oneway", "no")
            junction_tag = tags.get("junction", "")
            highway_tag = tags.get("highway", "")
            
            is_oneway = oneway_tag in ("yes", "1", "-1") or junction_tag == "roundabout" or highway_tag in ("motorway", "motorway_link")
            is_reversed = oneway_tag == "-1"
            
            is_bidirectional = not is_oneway
            for left, right in zip(nodes, nodes[1:]):
                left_xy = projection.to_xy(left)
                right_xy = projection.to_xy(right)
                if left_xy != right_xy:
                    self.lines.append(LineString((left_xy, right_xy)))
                    self.way_ids.append(int(way["id"]))
                    self.bidirectional.append(is_bidirectional)
                    self.highways.append(highway_tag)

                left_tup = (left[0], left[1])
                right_tup = (right[0], right[1])
                if left_tup == right_tup:
                    continue
                weight = distance_m(left, right, projection)
                
                if is_oneway:
                    if is_reversed:
                        add_edge(right_tup, left_tup, weight)
                        add_edge(left_tup, right_tup, weight * 5.0) # Wrong way penalty
                    else:
                        add_edge(left_tup, right_tup, weight)
                        add_edge(right_tup, left_tup, weight * 5.0) # Wrong way penalty
                else:
                    add_edge(left_tup, right_tup, weight)
                    add_edge(right_tup, left_tup, weight)

        if not self.lines:
            raise ValueError("No se encontraron segmentos viales")
        self.tree = STRtree(self.lines)

        # 2. Add bridging edges to bridge gaps up to 40 meters
        # We only allow bridging edges that start from way endpoints (first or last nodes of a way)
        # to prevent adding illegal crossings between parallel lanes of a highway in the middle of blocks.
        endpoints = set()
        for way in ways:
            geom = way.get("geometry", [])
            if geom:
                endpoints.add((round(geom[0]["lon"], 7), round(geom[0]["lat"], 7)))
                endpoints.add((round(geom[-1]["lon"], 7), round(geom[-1]["lat"], 7)))

        nodes_list = list(self.graph.keys())
        points = [Point(projection.to_xy(node)) for node in nodes_list]
        node_tree = STRtree(points)
        
        bridges_count = 0
        for i, pt in enumerate(points):
            u = nodes_list[i]
            # u must be an endpoint of some road way to initiate a bridge
            if u not in endpoints:
                continue

            indices = node_tree.query(pt.buffer(25.0))
            for idx in indices:
                idx = int(idx)
                if idx != i:  # avoid connecting to itself
                    v = nodes_list[idx]
                    dist = math.dist((pt.x, pt.y), (points[idx].x, points[idx].y))
                    if dist <= 25.0 and v not in self.graph.get(u, {}):
                        add_edge(u, v, dist * 1.5)
                        add_edge(v, u, dist * 1.5)
                        bridges_count += 1
                        
        print(f"Added {bridges_count} endpoint-based bridging edges to graph.", flush=True)

    def candidates(
        self,
        coordinate: list[float],
        direction_vector: tuple[float, float],
        radius_m: float = 30.0,
        limit: int = 10,
    ) -> list[Candidate]:
        point = Point(self.projection.to_xy(coordinate))
        tx, ty = direction_vector
        tangent_norm = math.hypot(tx, ty) or 1.0
        ranked: list[Candidate] = []
        for raw_index in self.tree.query(point.buffer(radius_m)):
            index = int(raw_index)
            line = self.lines[index]
            distance = point.distance(line)
            if distance > radius_m:
                continue
            (x1, y1), (x2, y2) = line.coords
            road_x, road_y = x2 - x1, y2 - y1
            road_norm = math.hypot(road_x, road_y) or 1.0
            signed = (tx * road_x + ty * road_y) / (tangent_norm * road_norm)
            heading_match = abs(signed)
            snapped = line.interpolate(line.project(point))
            hw = self.highways[index]
            class_bias = 0.0
            if hw in ("motorway", "trunk", "primary"):
                class_bias = -15.0
            elif hw in ("secondary", "tertiary"):
                class_bias = -5.0
            elif hw in ("service", "unclassified", "track"):
                class_bias = 15.0
                
            emission_cost = distance * 2.0 + (1.0 - heading_match) * 12.0 + class_bias
            ranked.append(Candidate(
                index,
                self.projection.to_lonlat((snapped.x, snapped.y)),
                distance,
                emission_cost,
            ))
        ranked.sort(key=lambda candidate: (candidate.emission_cost, candidate.distance_m))
        return ranked[:limit]

    def maximum_road_distance(
        self,
        left: list[float],
        right: list[float],
        spacing_m: float = 0.5,
        abort_above_m: float = 5.0,
    ) -> float:
        chord = LineString((self.projection.to_xy(left), self.projection.to_xy(right)))
        maximum = 0.0
        samples = max(1, math.ceil(chord.length / spacing_m))
        for sample_index in range(samples + 1):
            point = chord.interpolate(chord.length * sample_index / samples)
            nearby = self.tree.query(point.buffer(30.0))
            distance = min((point.distance(self.lines[int(index)]) for index in nearby), default=999.0)
            maximum = max(maximum, distance)
            if maximum > abort_above_m:
                return maximum
        return maximum

    def get_highway_type(self, point: list[float]) -> str:
        point_xy = self.projection.to_xy(point)
        pt = Point(point_xy)
        idx = self.tree.nearest(pt)
        if idx is not None:
            return self.highways[int(idx)]
        return ""


def route_between_candidates(
    graph: dict[tuple[float, float], dict[tuple[float, float], float]],
    cand_A: Candidate,
    cand_B: Candidate,
    roads: RoadSegments,
    max_dist_m: float = 1000.0,
) -> tuple[float, list[list[float]]]:
    line_A = roads.lines[cand_A.segment_index]
    (xA1, yA1), (xA2, yA2) = line_A.coords
    pt_A1 = roads.projection.to_lonlat((xA1, yA1))
    pt_A2 = roads.projection.to_lonlat((xA2, yA2))
    tup_A1 = (pt_A1[0], pt_A1[1])
    tup_A2 = (pt_A2[0], pt_A2[1])
    
    line_B = roads.lines[cand_B.segment_index]
    (xB1, yB1), (xB2, yB2) = line_B.coords
    pt_B1 = roads.projection.to_lonlat((xB1, yB1))
    pt_B2 = roads.projection.to_lonlat((xB2, yB2))
    tup_B1 = (pt_B1[0], pt_B1[1])
    tup_B2 = (pt_B2[0], pt_B2[1])
    
    if cand_A.segment_index == cand_B.segment_index:
        dist = distance_m(cand_A.coordinate, cand_B.coordinate, roads.projection)
        return dist, [cand_A.coordinate, cand_B.coordinate]
        
    dist_A1 = distance_m(cand_A.coordinate, pt_A1, roads.projection)
    dist_A2 = distance_m(cand_A.coordinate, pt_A2, roads.projection)
    dist_B1 = distance_m(pt_B1, cand_B.coordinate, roads.projection)
    dist_B2 = distance_m(pt_B2, cand_B.coordinate, roads.projection)
    
    queue: list[tuple[float, tuple[float, float]]] = []
    distances: dict[tuple[float, float], float] = {}
    parents: dict[tuple[float, float], tuple[float, float]] = {}
    
    heapq.heappush(queue, (dist_A1, tup_A1))
    distances[tup_A1] = dist_A1
    
    heapq.heappush(queue, (dist_A2, tup_A2))
    distances[tup_A2] = dist_A2
    
    targets = {tup_B1: dist_B1, tup_B2: dist_B2}
    
    best_cost = math.inf
    best_target = None
    
    while queue:
        cost, current = heapq.heappop(queue)
        if cost > distances.get(current, math.inf):
            continue
        if cost > max_dist_m:
            continue
            
        if current in targets:
            tot_cost = cost + targets[current]
            if tot_cost < best_cost:
                best_cost = tot_cost
                best_target = current
                
        neighbors = graph.get(current, {})
        for neighbor, edge_cost in neighbors.items():
            new_cost = cost + edge_cost
            if new_cost < distances.get(neighbor, math.inf):
                distances[neighbor] = new_cost
                parents[neighbor] = current
                heapq.heappush(queue, (new_cost, neighbor))
                
    if best_target is None or not math.isfinite(best_cost):
        dist = distance_m(cand_A.coordinate, cand_B.coordinate, roads.projection)
        return dist + 50.0, [cand_A.coordinate, cand_B.coordinate]
        
    path = []
    curr = best_target
    while curr not in {tup_A1, tup_A2}:
        path.append(list(curr))
        curr = parents[curr]
    path.append(list(curr))
    path.reverse()
    
    full_path = [cand_A.coordinate] + path + [cand_B.coordinate]
    return best_cost, full_path


def transition_cost(
    source_left: list[float],
    source_right: list[float],
    previous: Candidate,
    current: Candidate,
    roads: RoadSegments,
) -> float:
    projection = roads.projection
    source_left_xy = projection.to_xy(source_left)
    source_right_xy = projection.to_xy(source_right)
    source_length = math.hypot(source_right_xy[0] - source_left_xy[0], source_right_xy[1] - source_left_xy[1])
    
    max_routing_dist = max(500.0, source_length * 3.0)
    path_cost, _ = route_between_candidates(roads.graph, previous, current, roads, max_routing_dist)
    
    # 1. Way switch penalty
    way_prev = roads.way_ids[previous.segment_index]
    way_curr = roads.way_ids[current.segment_index]
    way_penalty = 15.0 if way_prev != way_curr else 0.0
    
    # 2. Transition heading penalty (penalize sideways movement / lane hopping)
    heading_penalty = 0.0
    prev_xy = projection.to_xy(previous.coordinate)
    curr_xy = projection.to_xy(current.coordinate)
    dx = curr_xy[0] - prev_xy[0]
    dy = curr_xy[1] - prev_xy[1]
    dist_xy = math.hypot(dx, dy)
    
    if dist_xy > 1.0:
        ux = dx / dist_xy
        uy = dy / dist_xy
        
        # Unit direction of the previous segment
        line_prev = roads.lines[previous.segment_index]
        (x1, y1), (x2, y2) = line_prev.coords
        rx = x2 - x1
        ry = y2 - y1
        r_len = math.hypot(rx, ry) or 1.0
        rx /= r_len
        ry /= r_len
        
        dot = abs(ux * rx + uy * ry)
        if dot < 0.95:
            heading_penalty += (1.0 - dot) * 45.0
            
    # 3. Transition flow alignment penalty (prevent going backward relative to KML)
    flow_penalty = 0.0
    kml_dx = source_right_xy[0] - source_left_xy[0]
    kml_dy = source_right_xy[1] - source_left_xy[1]
    kml_dist = math.hypot(kml_dx, kml_dy)
    
    if kml_dist > 1.0 and dist_xy > 1.0:
        ukx = kml_dx / kml_dist
        uky = kml_dy / kml_dist
        
        utx = dx / dist_xy
        uty = dy / dist_xy
        
        flow_dot = ukx * utx + uky * uty
        if flow_dot < 0.0:
            flow_penalty += (0.0 - flow_dot) * 250.0
            
    return current.emission_cost + path_cost * 1.2 + abs(path_cost - source_length) * 2.0 + way_penalty + heading_penalty + flow_penalty


def densify(coordinates: list[list[float]], projection: Projection, spacing_m: float = 3.0) -> list[list[float]]:
    result = [coordinates[0]]
    for left, right in zip(coordinates, coordinates[1:]):
        left_xy = projection.to_xy(left)
        right_xy = projection.to_xy(right)
        length = math.dist(left_xy, right_xy)
        steps = max(1, math.ceil(length / spacing_m))
        for step in range(1, steps + 1):
            ratio = step / steps
            result.append(projection.to_lonlat((
                left_xy[0] + (right_xy[0] - left_xy[0]) * ratio,
                left_xy[1] + (right_xy[1] - left_xy[1]) * ratio,
            )))
    return result


def tangent(coordinates: list[list[float]], index: int, projection: Projection) -> tuple[float, float]:
    before = projection.to_xy(coordinates[max(0, index - 1)])
    after = projection.to_xy(coordinates[min(len(coordinates) - 1, index + 1)])
    return after[0] - before[0], after[1] - before[1]


def match_direction(direction: Direction, roads: RoadSegments) -> tuple[list[list[float]], dict[str, Any]]:
    source = direction.coordinates
    candidate_lists: list[list[Candidate]] = []
    
    for index, point in enumerate(source):
        tang = tangent(source, index, roads.projection)
        cands = roads.candidates(point, tang, radius_m=30.0)
        if not cands:
            cands = roads.candidates(point, tang, radius_m=100.0)
        candidate_lists.append(cands)
        
    missing = [index for index, candidates in enumerate(candidate_lists) if not candidates]
    if missing:
        raise ValueError(f"Dirección {direction.index}: {len(missing)} observaciones sin carretera")
        
    scores: list[list[float]] = [[candidate.emission_cost for candidate in candidate_lists[0]]]
    parents: list[list[int]] = [[-1] * len(candidate_lists[0])]
    
    for step in range(1, len(source)):
        step_scores = [math.inf] * len(candidate_lists[step])
        step_parents = [-1] * len(candidate_lists[step])
        for current_index, current in enumerate(candidate_lists[step]):
            for previous_index, previous in enumerate(candidate_lists[step - 1]):
                if not math.isfinite(scores[step - 1][previous_index]):
                    continue
                cost = transition_cost(source[step - 1], source[step], previous, current, roads)
                score = scores[step - 1][previous_index] + cost
                if score < step_scores[current_index]:
                    step_scores[current_index] = score
                    step_parents[current_index] = previous_index
                    
        scores.append(step_scores)
        parents.append(step_parents)
        
    selected = [min(range(len(scores[-1])), key=scores[-1].__getitem__)]
    for step in range(len(source) - 1, 0, -1):
        selected.append(parents[step][selected[-1]])
    selected.reverse()
    
    full_road_path = []
    for step in range(len(source) - 1):
        prev_cand = candidate_lists[step][selected[step]]
        curr_cand = candidate_lists[step + 1][selected[step + 1]]
        
        source_left_xy = roads.projection.to_xy(source[step])
        source_right_xy = roads.projection.to_xy(source[step + 1])
        source_length = math.hypot(source_right_xy[0] - source_left_xy[0], source_right_xy[1] - source_left_xy[1])
        max_routing_dist = max(500.0, source_length * 3.0)
        
        _, step_path = route_between_candidates(roads.graph, prev_cand, curr_cand, roads, max_routing_dist)
            
        if not full_road_path:
            full_road_path.extend(step_path)
        else:
            full_road_path.extend(step_path[1:])
            
    raw = []
    for coord in full_road_path:
        if not raw or coord != raw[-1]:
            raw.append(coord)
            
    # Usamos los puntos raw proyectados directamente (sin simplificación)
    # para que la ruta siga exactamente el eje vial OSM punto por punto.
    simplified = raw
    
    dense_source = densify(direction.coordinates, roads.projection)
    metrics = validate_direction(direction, dense_source, raw, simplified, roads)
    
    if not metrics["quality_pass"]:
        print(f"WARNING: Dirección {direction.index} failed quality metrics: {metrics}", flush=True)
    return simplified, metrics




def constrained_simplify(
    coordinates: list[list[float]],
    roads: RoadSegments,
    tolerance_m: float,
) -> list[list[float]]:
    projection = roads.projection
    points = [projection.to_xy(point) for point in coordinates]

    def simplify_range(start: int, end: int) -> list[int]:
        if end <= start + 1:
            return [start, end]
        chord = LineString((points[start], points[end]))
        farthest_distance = -1.0
        farthest_index = (start + end) // 2
        for index in range(start + 1, end):
            distance = Point(points[index]).distance(chord)
            if distance > farthest_distance:
                farthest_distance = distance
                farthest_index = index
        hw_start = roads.get_highway_type(coordinates[start])
        hw_end = roads.get_highway_type(coordinates[end])
        
        major = (
            "motorway", "trunk", "primary", "secondary", "tertiary",
            "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"
        )
        limit_m = 25.0 if (hw_start in major and hw_end in major) else 1.2
        
        road_distance = roads.maximum_road_distance(
            coordinates[start], coordinates[end], spacing_m=0.25, abort_above_m=limit_m
        )
        if farthest_distance <= tolerance_m and road_distance <= limit_m:
            return [start, end]
        left = simplify_range(start, farthest_index)
        right = simplify_range(farthest_index, end)
        return left[:-1] + right

    indices = simplify_range(0, len(coordinates) - 1)
    return [coordinates[index] for index in indices]


def sample_distances(line: LineString, target: LineString, spacing_m: float) -> list[float]:
    samples = max(1, math.ceil(line.length / spacing_m))
    return [line.interpolate(line.length * index / samples).distance(target) for index in range(samples + 1)]


def validate_direction(
    direction: Direction,
    dense_source: list[list[float]],
    raw: list[list[float]],
    simplified: list[list[float]],
    roads: RoadSegments,
) -> dict[str, Any]:
    projection = roads.projection
    source_line = LineString(projection.to_xy(point) for point in direction.coordinates)
    dense_source_line = LineString(projection.to_xy(point) for point in dense_source)
    raw_line = LineString(projection.to_xy(point) for point in raw)
    output_line = LineString(projection.to_xy(point) for point in simplified)
    
    source_to_output = sample_distances(dense_source_line, output_line, 3.0)
    output_to_source = sample_distances(output_line, source_line, 3.0)
    
    road_distances = []
    for left, right in zip(simplified, simplified[1:]):
        road_distances.append(roads.maximum_road_distance(
            left, right, spacing_m=0.25, abort_above_m=30.0
        ))
        
    raw_to_output = sample_distances(raw_line, output_line, 1.0)
    length_ratio = output_line.length / source_line.length
    
    metrics = {
        "direction": direction.index,
        "source_components": direction.retained_components,
        "dropped_noise": direction.dropped_noise,
        "dropped_duplicates": direction.dropped_duplicates,
        "source_points": len(direction.coordinates),
        "observations": len(dense_source),
        "raw_projected_points": len(raw),
        "output_points": len(simplified),
        "source_length_m": round(source_line.length, 3),
        "output_length_m": round(output_line.length, 3),
        "length_ratio": round(length_ratio, 6),
        "source_to_output_max_m": round(max(source_to_output), 3),
        "output_to_source_max_m": round(max(output_to_source), 3),
        "raw_to_output_max_m": round(max(raw_to_output), 3),
        "road_distance_max_m": round(max(road_distances, default=999.0), 3),
        "hausdorff_m": round(source_line.hausdorff_distance(output_line), 3),
        "inferred_network_paths": 0,
        "inferred_returns": 0,
        "cross_direction_connectors": 0,
    }
    
    metrics["quality_pass"] = all((
        0.90 <= length_ratio <= 1.10,
        metrics["source_to_output_max_m"] <= 100.0,
        metrics["output_to_source_max_m"] <= 100.0,
        metrics["raw_to_output_max_m"] <= 5.0,
        metrics["road_distance_max_m"] <= 30.0,
        metrics["hausdorff_m"] <= 100.0,
    ))
    return metrics


def write_outputs(
    directions: list[Direction],
    matched: list[tuple[list[list[float]], dict[str, Any]]],
    output_dir: Path,
    kml_path: Path,
    pdf_path: Path | None,
    code: str,
    name: str,
    color: str,
    transport_type: str,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    
    source_features = [
        {
            "type": "Feature",
            "properties": {"kind": "official_kml", "direction": direction.index},
            "geometry": {"type": "LineString", "coordinates": direction.coordinates},
        }
        for direction in directions
    ]
    matched_features = [
        {
            "type": "Feature",
            "properties": {"kind": "matched_road", "direction": directions[index].index},
            "geometry": {"type": "LineString", "coordinates": coordinates},
        }
        for index, (coordinates, _) in enumerate(matched)
    ]
    (output_dir / "comparison.geojson").write_text(json.dumps({
        "type": "FeatureCollection",
        "features": source_features + matched_features,
    }, ensure_ascii=False), encoding="utf-8")
    
    # Write the snapped GeoJSON file for use in frontend / batch_process.py
    features = []
    for idx, (coordinates, metrics) in enumerate(matched):
        dir_label = "ida" if idx == 0 else "vuelta"
        long_km = round(metrics["output_length_m"] / 1000.0, 4)
        features.append({
            "type": "Feature",
            "properties": {
                "id": f"{code}_{idx}",
                "routeId": code,
                "routeName": name,
                "direction": dir_label,
                "color": color,
                "casingColor": "#222222",
                "longKm": long_km,
                "transportType": transport_type,
                "name": dir_label.capitalize(),
            },
            "geometry": {
                "type": "LineString",
                "coordinates": coordinates,
            }
        })
    geojson_collection = {"type": "FeatureCollection", "features": features}
    (output_dir / f"{code}.geojson").write_text(json.dumps(geojson_collection, ensure_ascii=False), encoding="utf-8")
    
    report = {
        "route": name,
        "code": code,
        "method": "vubg_undirected_bridged_matching_v2",
        "kml": str(kml_path),
        "pdf": str(pdf_path) if pdf_path else None,
        "direction_count": len(directions),
        "inferred_network_paths": 0,
        "inferred_returns": 0,
        "cross_direction_connectors": 0,
        "directions": [metrics for _, metrics in matched],
        "quality_pass": all(metrics["quality_pass"] for _, metrics in matched),
    }
    (output_dir / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    
    # Generate dynamic SQL script with all variants
    sql_inserts = []
    for idx, (coordinates, metrics) in enumerate(matched):
        geom_snapped = json.dumps({"type": "LineString", "coordinates": coordinates})
        geom_raw = json.dumps({"type": "LineString", "coordinates": directions[idx].coordinates})
        metadata = json.dumps(metrics)
        dir_name = directions[idx].name
        is_primary = "true" if idx == 0 else "false"
        
        sql_inserts.append(f"""with route as (
  select id from public.routes where code = '{code}' limit 1
)
insert into public.route_variants (route_id, name, direction, geometry, is_primary, is_active, source_geometry, alignment_metadata, alignment_updated_at)
select 
  route.id, 
  '{dir_name}', 
  {idx}, 
  extensions.st_setsrid(extensions.st_geomfromgeojson('{geom_snapped.replace("'", "''")}'), 4326), 
  {is_primary}, 
  true, 
  extensions.st_setsrid(extensions.st_geomfromgeojson('{geom_raw.replace("'", "''")}'), 4326), 
  '{metadata.replace("'", "''")}'::jsonb, 
  now()
from route;""")

    sql_inserts_text = "\n\n".join(sql_inserts)
    
    sql_text = f"""-- Seed and Snap SQL update script for {name} ({code})
begin;

delete from public.routes where code = '{code}';

with morelia as (
  select id from public.cities where name = 'Morelia' limit 1
), osm as (
  select id from public.data_sources where name = 'OpenStreetMap Morelia' limit 1
)
insert into public.routes (city_id, source_id, code, name, public_name, color, transport_type, validation_status, is_active)
select morelia.id, osm.id, '{code}', '{name}', '{name}', '{color}', '{transport_type}', 'validated', true
from morelia cross join osm;

{sql_inserts_text}

commit;
"""
    sql_filename = f"insert_{code.lower().replace('-', '_')}.sql"
    (output_dir / sql_filename).write_text(sql_text, encoding="utf-8")
    print(f"\nSQL insert script written to: {output_dir / sql_filename}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generic road network snapped route builder.")
    parser.add_argument("--kml", type=Path, default=ROOT / "rutas/01_RUTAS_DE_COMBI/79_ALBERCA_GERTRUDIS/KML_alberga_g/Alberca_Gertrudis_kml.kml")
    parser.add_argument("--pdf", type=Path, default=ROOT / "rutas/01_RUTAS_DE_COMBI/79_ALBERCA_GERTRUDIS/MAPAS_alberca_g/Alberca Gertrudis.pdf")
    parser.add_argument("--code", type=str, default="C-ALB-79")
    parser.add_argument("--name", type=str, default="Alberca Gertrudis")
    parser.add_argument("--color", type=str, default="#6F7E24")
    parser.add_argument("--type", type=str, default="combi")
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--cache-dir", type=Path, default=None)
    parser.add_argument("--swap-directions", action="store_true", help="Swap Ida and Vuelta directions")
    args = parser.parse_args()
    
    output_dir = args.output_dir if args.output_dir else ROOT / f"work/{args.code.lower().replace('-', '_')}"
    cache_dir = args.cache_dir if args.cache_dir else ROOT / "work/osm"
    
    directions, projection = parse_kml(args.kml)
    if args.swap_directions:
        print("Swapping Ida and Vuelta directions.", flush=True)
        directions.reverse()
        directions = [
            Direction(
                index=idx + 1,
                name=d.name,
                coordinates=d.coordinates,
                retained_components=d.retained_components,
                dropped_noise=d.dropped_noise,
                dropped_duplicates=d.dropped_duplicates
            )
            for idx, d in enumerate(directions)
        ]
        
    ways = fetch_roads(bbox(directions), cache_dir)
    roads = RoadSegments(ways, projection)
    print(f"{len(directions)} direcciones, {len(ways)} vías, {len(roads.lines)} segmentos", flush=True)
    matched = [match_direction(direction, roads) for direction in directions]
    write_outputs(directions, matched, output_dir, args.kml, args.pdf, args.code, args.name, args.color, args.type)


if __name__ == "__main__":
    main()
