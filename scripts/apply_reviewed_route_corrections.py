"""Apply user-reviewed local geometry corrections for routes 78, 79, 13 and 18."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / "apps/web/public/routes"
INDEX = ROUTES / "index.json"


def write_route(code: str, document: dict, algorithm: str, index: dict) -> None:
    payload = (json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    (ROUTES / f"{code}.geojson").write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()
    item = next(route for route in index["routes"] if str(route["id"]) == code)
    item["geojsonFile"] = f"/routes/{code}.geojson?v={digest[:12]}"
    item["artifactSha256"] = digest
    item["algorithm"] = algorithm


def correct_alberca(code: str, index: dict) -> None:
    path = ROUTES / f"{code}.geojson"
    document = json.loads(path.read_text(encoding="utf-8"))
    west = -101.1652
    east = -101.1470
    adjusted = 0
    for feature in document["features"]:
        if feature["properties"].get("reviewedRedCorridorApplied"):
            continue
        lines = feature["geometry"]["coordinates"]
        for line in lines:
            for point in line:
                lon, lat = point
                if west <= lon <= east and 19.6868 <= lat <= 19.6952:
                    progress = (lon - west) / (east - west)
                    taper = min(1.0, progress / 0.18, (1.0 - progress) / 0.12)
                    point[1] = round(lat - 0.00022 * max(0.0, taper), 7)
                    adjusted += 1
        feature["properties"]["reviewedRedCorridorApplied"] = True

    if adjusted < 30:
        raise RuntimeError(f"Route {code}: reviewed Alberca corridor was not found")
    for feature in document["features"]:
        feature["properties"]["reviewedCorrection"] = "south-carriageway-red-reference"
    write_route(code, document, "reviewed-alberca-red-corridor-v2", index)


def correct_coral_1(index: dict) -> None:
    path = ROUTES / "18.geojson"
    document = json.loads(path.read_text(encoding="utf-8"))
    ida = next(feature for feature in document["features"] if feature["properties"].get("direction") == "ida")
    line = ida["geometry"]["coordinates"][0]
    start_index, end_index = 195, 218
    start, end = line[start_index], line[end_index]

    replacement: list[list[float]] = []
    steps = 24
    for step in range(steps + 1):
        ratio = step / steps
        replacement.append([
            round(start[0] + (end[0] - start[0]) * ratio, 7),
            round(start[1] + (end[1] - start[1]) * ratio, 7),
        ])
    line[start_index : end_index + 1] = replacement
    ida["properties"]["reviewedCorrection"] = "madero-straight-green-reference"
    write_route("18", document, "reviewed-coral-1-straight-ida-v1", index)


def restore_cafe_oro_2(index: dict) -> None:
    source = ROOT / "work/route-pipeline/13-cafe-oro-2-leandro-valle/13.geojson"
    report = json.loads(
        (source.parent / "validation.json").read_text(encoding="utf-8")
    )
    if not report.get("quality_pass"):
        raise RuntimeError("Route 13 clean rebuild did not pass validation")
    document = json.loads(source.read_text(encoding="utf-8"))
    removed = 0
    for feature in document["features"]:
        lines = feature["geometry"]["coordinates"]
        for line_index, line in enumerate(lines):
            cleaned, count = remove_short_detours(line)
            lines[line_index] = cleaned
            removed += count
    for feature in document["features"]:
        feature["properties"]["reviewedCorrection"] = "global-short-detour-and-spike-removal"
        feature["properties"]["removedDetours"] = removed
    write_route("13", document, "reviewed-cafe-oro-2-global-clean-v2", index)


def distance_m(a: list[float], b: list[float]) -> float:
    dx = (a[0] - b[0]) * 104_500
    dy = (a[1] - b[1]) * 111_000
    return math.hypot(dx, dy)


def remove_short_detours(line: list[list[float]]) -> tuple[list[list[float]], int]:
    """Remove local out-and-back loops while preserving the route's order."""
    points = [point[:] for point in line]
    removed = 0
    changed = True
    while changed:
        changed = False
        for window in range(min(28, len(points) - 1), 3, -1):
            for start in range(0, len(points) - window):
                end = start + window
                direct = distance_m(points[start], points[end])
                if direct < 20 or direct > 420:
                    continue
                path = sum(distance_m(points[i], points[i + 1]) for i in range(start, end))
                if path < 180 or path / direct < 2.35 or path - direct < 130:
                    continue
                # The reviewed examples show these as artificial triangular or
                # saw-tooth branches. Keep both road anchors and remove only
                # the interior excursion.
                removed += end - start - 1
                points[start + 1 : end] = []
                changed = True
                break
            if changed:
                break
    return points, removed


def main() -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    correct_alberca("78", index)
    correct_alberca("79", index)
    restore_cafe_oro_2(index)
    correct_coral_1(index)
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Updated reviewed routes: 78, 79, 13, 18")


if __name__ == "__main__":
    main()
