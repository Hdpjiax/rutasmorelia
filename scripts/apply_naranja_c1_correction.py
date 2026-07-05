"""Apply c1.jpg Tecnológico crossing correction to all Naranja routes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / "apps" / "web" / "public" / "routes"
INDEX = ROUTES / "index.json"
WORK = ROOT / "work" / "route-pipeline"
NARANJA_CODES = ("38", "39", "40", "41", "42", "44", "45", "46")
LOOP_REPLACEMENT = [
    [-101.181257, 19.727752],
    [-101.181530, 19.731970],
    [-101.181480, 19.732070],
    [-101.181450, 19.732050],
]
ALGORITHM = "reviewed-naranja-c1-v1"


def _round_point(point: list[float]) -> list[float]:
    return [round(point[0], 6), round(point[1], 6)]


def _near(point: list[float], target: list[float], tol: float = 1e-4) -> bool:
    return abs(point[0] - target[0]) <= tol and abs(point[1] - target[1]) <= tol


def _find_mex15_excursion(points: list[list[float]]) -> tuple[int, int] | None:
    candidates: list[tuple[int, int, int]] = []
    index = 0
    while index < len(points):
        if not _near(points[index], [-101.19058, 19.707654], tol=2e-4):
            index += 1
            continue
        west_start = index + 1
        while west_start < len(points) and points[west_start][0] >= -101.1910:
            west_start += 1
        if west_start >= len(points) or points[west_start][0] >= -101.1910:
            index += 1
            continue
        west_end = west_start
        while west_end + 1 < len(points) and points[west_end + 1][0] < -101.1905:
            west_end += 1
        if west_end - west_start < 5:
            index += 1
            continue
        candidates.append((west_start, west_end, west_end - west_start + 1))
        index = west_end + 1
    if not candidates:
        return None
    return max(candidates, key=lambda item: item[2])[:2]


def _street_corridor_slice(
    points: list[list[float]],
    *,
    lat_hi: float,
    lat_lo: float,
) -> list[list[float]]:
    corridor = [
        _round_point(point)
        for point in points
        if -101.1912 < point[0] < -101.1878 and lat_lo - 0.002 <= point[1] <= lat_hi + 0.002
    ]
    if len(corridor) < 4:
        return []
    ordered = sorted(
        {(point[0], point[1]): point for point in corridor}.values(),
        key=lambda point: (-point[1], point[0]),
    )
    trimmed: list[list[float]] = []
    for point in ordered:
        if not trimmed:
            trimmed.append(point)
            continue
        if abs(point[1] - trimmed[-1][1]) < 1e-6 and abs(point[0] - trimmed[-1][0]) < 1e-6:
            continue
        trimmed.append(point)
    return [point for point in trimmed if lat_lo <= point[1] <= lat_hi + 0.001]


def _correct_mex15(points: list[list[float]], audit: list[dict]) -> list[list[float]]:
    excursion = _find_mex15_excursion(points)
    if excursion is None:
        return points
    west_start, west_end = excursion
    lat_hi = points[west_start - 1][1] if west_start > 0 else points[west_start][1]
    lat_lo = points[west_end + 1][1] if west_end + 1 < len(points) else points[west_end][1]
    street_slice = _street_corridor_slice(points, lat_hi=max(lat_hi, lat_lo), lat_lo=min(lat_hi, lat_lo))
    if len(street_slice) < 4:
        if west_end + 1 < len(points):
            points = points[:west_start] + points[west_end + 1 :]
            audit.append({
                "reason": "c1_remove_short_black_mex15_spike",
                "removed_indices": [west_start, west_end],
            })
        return points
    points = points[:west_start] + street_slice + points[west_end + 1 :]
    audit.append({
        "reason": "c1_remove_black_mex15_use_green_street_corridor",
        "removed_indices": [west_start, west_end],
        "replacement_points": len(street_slice),
    })
    return points


def _find_tecnologico_loop(points: list[list[float]]) -> tuple[int, int] | None:
    for index in range(1, len(points) - 1):
        lon, lat = points[index]
        if not (-101.183 <= lon <= -101.1800):
            continue
        if not (19.7284 <= lat <= 19.7295):
            continue
        if points[index - 1][1] <= lat + 0.0007:
            continue
        if points[index + 1][1] <= lat + 0.0007:
            continue
        loop_start = index - 1
        while loop_start > 0:
            if _near(points[loop_start], [-101.181257, 19.727752], tol=8e-4):
                break
            if points[loop_start][1] < 19.7279 and -101.1825 <= points[loop_start][0] <= -101.1800:
                break
            loop_start -= 1
        loop_end = index + 1
        while loop_end + 1 < len(points):
            if points[loop_end][1] >= 19.7310:
                break
            loop_end += 1
        if loop_end <= loop_start:
            continue
        return loop_start, loop_end
    return None


def _correct_loop(points: list[list[float]], audit: list[dict]) -> list[list[float]]:
    loop = _find_tecnologico_loop(points)
    if loop is None:
        anchor = next((i for i, point in enumerate(points) if _near(point, [-101.181257, 19.727752])), None)
        if anchor is None:
            return points
        loop_start = anchor
        loop_end = loop_start + 1
        while loop_end < len(points) and points[loop_end][1] < 19.7318:
            loop_end += 1
        if loop_end - loop_start < 4:
            return points
    else:
        loop_start, loop_end = loop
    replacement = [_round_point(point) for point in LOOP_REPLACEMENT]
    points = points[:loop_start] + replacement + points[loop_end + 1 :]
    audit.append({
        "reason": "c1_remove_green_tecnologico_loop",
        "removed_indices": [loop_start + 1, loop_end],
        "replacement_points": len(replacement),
    })
    return points


def _scrub_mex15_artifacts(points: list[list[float]], audit: list[dict]) -> list[list[float]]:
    removed = 0
    cleaned: list[list[float]] = []
    for point in points:
        if point[0] < -101.1910 and 19.704 <= point[1] <= 19.708:
            removed += 1
            continue
        cleaned.append(point)
    if removed:
        audit.append({
            "reason": "c1_scrub_remaining_black_mex15_points",
            "removed_points": removed,
        })
    return cleaned


def _remove_optional_spike(points: list[list[float]], audit: list[dict]) -> list[list[float]]:
    for index, point in enumerate(points):
        if _near(point, [-101.191170, 19.722449]):
            points.pop(index)
            audit.append({
                "reason": "c1_remove_black_out_and_back_spike",
                "removed_index": index,
            })
            break
    return points


def correct_naranja_line(line: list[list[float]]) -> tuple[list[list[float]], list[dict]]:
    audit: list[dict] = []
    points = [_round_point(point) for point in line]
    points = _correct_mex15(points, audit)
    points = _correct_loop(points, audit)
    points = _scrub_mex15_artifacts(points, audit)
    points = _remove_optional_spike(points, audit)
    return points, audit


def _slug_for_code(code: str) -> str | None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    for route in index.get("routes") or []:
        if str(route.get("id")) == code:
            name = route.get("name") or ""
            slug = name.lower()
            for ch in "[]()":
                slug = slug.replace(ch, " ")
            slug = "-".join("".join(ch if ch.isalnum() else "-" for ch in slug).split("-"))
            return slug.strip("-") or None
    return None


def write_route(code: str, document: dict) -> str:
    payload = (json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    digest = hashlib.sha256(payload).hexdigest()
    (ROUTES / f"{code}.geojson").write_bytes(payload)
    slug = _slug_for_code(code)
    if slug:
        work_dir = WORK / slug
        if work_dir.is_dir():
            (work_dir / f"{code}.geojson").write_bytes(payload)
    return digest


def main() -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    results: list[dict] = []
    for code in NARANJA_CODES:
        path = ROUTES / f"{code}.geojson"
        if not path.is_file():
            results.append({"code": code, "status": "missing"})
            continue
        document = json.loads(path.read_text(encoding="utf-8"))
        feature = document["features"][0]
        line = feature["geometry"]["coordinates"][0]
        before = len(line)
        corrected, audit = correct_naranja_line(line)
        if before == len(corrected) and not audit:
            results.append({"code": code, "status": "unchanged", "points": before})
            continue
        feature["geometry"]["coordinates"][0] = corrected
        feature["properties"]["reviewedCorrection"] = "c1-remove-black-use-green-street"
        digest = write_route(code, document)
        item = next(route for route in index["routes"] if str(route["id"]) == code)
        item["geojsonFile"] = f"/routes/{code}.geojson?v={digest[:12]}"
        item["artifactSha256"] = digest
        item["algorithm"] = ALGORITHM
        results.append({
            "code": code,
            "status": "updated",
            "points_before": before,
            "points_after": len(corrected),
            "audit": audit,
        })
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()