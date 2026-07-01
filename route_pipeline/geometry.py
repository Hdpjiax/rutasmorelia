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

