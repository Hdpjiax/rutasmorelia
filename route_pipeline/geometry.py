from __future__ import annotations

import math
from collections.abc import Iterable

Coordinate = tuple[float, float]
EARTH_RADIUS_M = 6_371_008.8


def distance_m(a: Coordinate, b: Coordinate) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlon, dlat = lon2 - lon1, lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def interpolate(a: Coordinate, b: Coordinate, fraction: float) -> Coordinate:
    return (a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction)


def deduplicate(points: Iterable[Coordinate], tolerance_m: float = 0.15) -> list[Coordinate]:
    result: list[Coordinate] = []
    for point in points:
        if not result or distance_m(result[-1], point) > tolerance_m:
            result.append(point)
    return result


def densify(points: list[Coordinate], spacing_m: float) -> list[Coordinate]:
    if len(points) < 2:
        return points[:]
    result = [points[0]]
    for start, end in zip(points, points[1:]):
        length = distance_m(start, end)
        count = max(1, math.ceil(length / spacing_m))
        result.extend(interpolate(start, end, index / count) for index in range(1, count + 1))
    return deduplicate(result)


def line_length_m(points: list[Coordinate]) -> float:
    return sum(distance_m(a, b) for a, b in zip(points, points[1:]))


def bearing(a: Coordinate, b: Coordinate) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    y = math.sin(lon2 - lon1) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(lon2 - lon1)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def angle_delta(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)


def structural_anchors(points: list[Coordinate], turn_degrees: float = 35.0) -> list[int]:
    if len(points) < 3:
        return list(range(len(points)))
    anchors = [0]
    for index in range(1, len(points) - 1):
        if angle_delta(bearing(points[index - 1], points[index]), bearing(points[index], points[index + 1])) >= turn_degrees:
            anchors.append(index)
    anchors.append(len(points) - 1)
    return sorted(set(anchors))


def percentile(values: list[float], percentage: float) -> float:
    if not values:
        return math.inf
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentage
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def point_segment_distance_m(point: Coordinate, start: Coordinate, end: Coordinate) -> float:
    lat0 = math.radians(point[1])
    scale_x = 111_320.0 * math.cos(lat0)
    scale_y = 110_540.0
    px, py = 0.0, 0.0
    ax, ay = (start[0] - point[0]) * scale_x, (start[1] - point[1]) * scale_y
    bx, by = (end[0] - point[0]) * scale_x, (end[1] - point[1]) * scale_y
    dx, dy = bx - ax, by - ay
    denominator = dx * dx + dy * dy
    t = 0.0 if denominator == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / denominator))
    return math.hypot(ax + t * dx - px, ay + t * dy - py)


def distances_to_line(points: list[Coordinate], line: list[Coordinate]) -> list[float]:
    if len(line) < 2:
        return [math.inf] * len(points)
    return [min(point_segment_distance_m(point, a, b) for a, b in zip(line, line[1:])) for point in points]


def analyze_polyline(points: list[Coordinate]) -> dict[str, float]:
    if len(points) < 3:
        return {"directness": 1.0, "total_turn": 0.0, "max_turn": 0.0, "roundness": 0.0}
    total_turn = 0.0
    max_turn = 0.0
    for index in range(1, len(points) - 1):
        turn = angle_delta(bearing(points[index - 1], points[index]), bearing(points[index], points[index + 1]))
        if turn > 3.0:
            total_turn += turn
        max_turn = max(max_turn, turn)
    directness = distance_m(points[0], points[-1]) / max(1.0, line_length_m(points))
    return {
        "directness": directness,
        "total_turn": total_turn,
        "max_turn": max_turn,
        "roundness": total_turn * (1.0 - directness),
    }


def _rdp_indices(points: list[Coordinate], tolerance_m: float) -> list[int]:
    if len(points) <= 2:
        return list(range(len(points)))
    start, end = points[0], points[-1]
    furthest_index = 0
    furthest_distance = 0.0
    for index in range(1, len(points) - 1):
        distance = point_segment_distance_m(points[index], start, end)
        if distance > furthest_distance:
            furthest_distance = distance
            furthest_index = index
    if furthest_distance <= tolerance_m:
        return [0, len(points) - 1]
    left = _rdp_indices(points[: furthest_index + 1], tolerance_m)
    right = _rdp_indices(points[furthest_index:], tolerance_m)
    return left[:-1] + [index + furthest_index for index in right]


def simplify_rdp(points: list[Coordinate], tolerance_m: float) -> list[Coordinate]:
    if len(points) <= 2:
        return points[:]
    indices = _rdp_indices(points, tolerance_m)
    return [points[index] for index in indices]


def segment_route_at_turns(
    points: list[Coordinate],
    *,
    densify_step_m: float = 8.0,
    turn_threshold_deg: float = 12.0,
    straight_chunk_m: float = 420.0,
    turn_window: int = 7,
) -> list[tuple[str, list[Coordinate]]]:
    """Split a trace into straight / turn / roundabout segments for axis-aware matching."""
    if len(points) < 3:
        return [("turn", points[:])]
    dense = densify(points, densify_step_m)
    turns = [0.0] * len(dense)
    for index in range(1, len(dense) - 1):
        turns[index] = angle_delta(bearing(dense[index - 1], dense[index]), bearing(dense[index], dense[index + 1]))

    zones: list[tuple[int, int]] = []
    for index in range(1, len(turns) - 1):
        if turns[index] >= turn_threshold_deg:
            zones.append((max(0, index - turn_window), min(len(dense) - 1, index + turn_window + 1)))
    zones.sort()
    merged: list[tuple[int, int]] = []
    for zone in zones:
        if merged and zone[0] <= merged[-1][1] + 10:
            merged[-1] = (merged[-1][0], max(merged[-1][1], zone[1]))
        else:
            merged.append(zone)

    segments: list[tuple[str, list[Coordinate]]] = []
    cursor = 0

    def push_straight(start: int, end: int) -> None:
        index = start
        while index < end:
            chunk_end = index + 1
            meters = 0.0
            while chunk_end < end and meters < straight_chunk_m:
                meters += distance_m(dense[chunk_end - 1], dense[chunk_end])
                chunk_end += 1
            segments.append(("straight", dense[index : max(index + 2, chunk_end)]))
            index = max(index + 1, chunk_end - 1)

    for zone_start, zone_end in merged:
        if zone_start > cursor + 1:
            push_straight(cursor, zone_start)
        source = dense[zone_start : zone_end + 1]
        analysis = analyze_polyline(source)
        mode = "roundabout" if analysis["total_turn"] > 160.0 and analysis["directness"] < 0.88 else "turn"
        segments.append((mode, source))
        cursor = zone_end
    if cursor < len(dense) - 1:
        push_straight(cursor, len(dense) - 1)
    return [segment for segment in segments if len(segment[1]) > 1]


def clean_matched_geometry(
    matched: list[Coordinate],
    source: list[Coordinate],
    mode: str = "turn",
) -> list[Coordinate]:
    """Remove lateral spikes and out-and-back noise while keeping road axis continuity."""
    if len(matched) < 3:
        return matched[:]
    current = matched[:]
    lateral_limit = 14.0 if mode == "straight" else 28.0
    ratio_limit = 1.18 if mode == "straight" else 1.75
    max_span = 220.0 if mode == "straight" else 95.0
    for _ in range(5):
        output = [current[0]]
        for index in range(1, len(current) - 1):
            anchor = output[-1]
            point = current[index]
            next_point = current[index + 1]
            ab = distance_m(anchor, point)
            bc = distance_m(point, next_point)
            ac = distance_m(anchor, next_point)
            angle = angle_delta(bearing(point, anchor), bearing(point, next_point))
            lateral = min(distances_to_line([point], source))
            if mode == "straight" and lateral > lateral_limit:
                continue
            if ab + bc > ac * ratio_limit and ac < max_span:
                continue
            if angle > 145.0 and ac < 95.0:
                continue
            if ab < 3.0 or bc < 3.0:
                continue
            output.append(point)
        output.append(current[-1])
        current = deduplicate(output)
    tolerance = 4.0 if mode == "straight" else (2.5 if mode == "roundabout" else 3.5)
    return simplify_rdp(current, tolerance)

