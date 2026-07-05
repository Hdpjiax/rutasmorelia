"""Surgical c1.jpg correction for route 39 — no Valhalla rebuild."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTES = ROOT / "apps" / "web" / "public" / "routes"
INDEX = ROUTES / "index.json"
WORK = ROOT / "work" / "route-pipeline" / "naranja-1-la-soledad"


def _round_point(point: list[float]) -> list[float]:
    return [round(point[0], 6), round(point[1], 6)]


def _find_index(line: list[list[float]], target: list[float], start: int = 0) -> int:
    tx, ty = target
    for index in range(start, len(line)):
        lon, lat = line[index]
        if abs(lon - tx) < 1e-5 and abs(lat - ty) < 1e-5:
            return index
    raise ValueError(f"Anchor not found: {target}")


def _find_optional(line: list[list[float]], target: list[float], start: int = 0) -> int | None:
    try:
        return _find_index(line, target, start)
    except ValueError:
        return None


def correct_route_39(line: list[list[float]]) -> tuple[list[list[float]], list[dict]]:
    audit: list[dict] = []
    points = [_round_point(point) for point in line]

    # c1.jpg: quitar el trazo negro (MEX-15 / lng < -101.1905) y usar el corredor
    # verde por calles que ya existe en el sentido de vuelta (-101.188).
    west_start = _find_index(points, [-101.191037, 19.706359])
    west_end = _find_index(points, [-101.190504, 19.695903], west_start)
    street_start = _find_index(points, [-101.189038, 19.707154])
    street_end = _find_index(points, [-101.190497, 19.696463])
    street_slice = [_round_point(point) for point in points[street_start : street_end - 1 : -1]]
    points = points[:west_start] + street_slice + points[west_end + 1 :]
    audit.append({
        "reason": "c1_remove_black_mex15_use_green_street_corridor",
        "removed_indices": [west_start, west_end],
        "replacement_points": len(street_slice),
    })

    # c1.jpg: quitar el bucle verde incorrecto cerca del Tecnológico.
    loop_start = _find_index(points, [-101.181257, 19.727752])
    loop_end = _find_index(points, [-101.181193, 19.731311], loop_start)
    replacement = [
        [-101.181257, 19.727752],
        [-101.181530, 19.731970],
        [-101.181480, 19.732070],
        [-101.181450, 19.732050],
    ]
    points = points[:loop_start] + replacement + points[loop_end + 1 :]
    audit.append({
        "reason": "c1_remove_green_tecnologico_loop",
        "removed_indices": [loop_start + 1, loop_end],
        "replacement_points": len(replacement),
    })

    spike = _find_optional(points, [-101.191170, 19.722449])
    if spike is not None:
        points.pop(spike)
        audit.append({
            "reason": "c1_remove_black_out_and_back_spike",
            "removed_index": spike,
        })

    return points, audit


def write_route(document: dict, algorithm: str) -> str:
    payload = (json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    digest = hashlib.sha256(payload).hexdigest()
    for path in (ROUTES / "39.geojson", WORK / "39.geojson"):
        if path.parent.is_dir():
            path.write_bytes(payload)
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    item = next(route for route in index["routes"] if str(route["id"]) == "39")
    item["geojsonFile"] = f"/routes/39.geojson?v={digest[:12]}"
    item["artifactSha256"] = digest
    item["algorithm"] = algorithm
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return digest


def main() -> None:
    document = json.loads((ROUTES / "39.geojson").read_text(encoding="utf-8"))
    feature = document["features"][0]
    line = feature["geometry"]["coordinates"][0]
    before = len(line)
    corrected, audit = correct_route_39(line)
    feature["geometry"]["coordinates"][0] = corrected
    feature["properties"]["reviewedCorrection"] = "c1-remove-black-use-green-street"
    digest = write_route(document, "reviewed-naranja-39-c1-v1")
    print(json.dumps({
        "points_before": before,
        "points_after": len(corrected),
        "artifact_sha256": digest,
        "audit": audit,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()