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
    # Rebuild directly from KML coordinates as they are authoritative and clean
    from scripts.build_route_13_from_kml import KML_DIR, feature
    from route_pipeline.kml import parse_kml
    
    kml = next(KML_DIR.glob("*.kml"))
    directions = parse_kml(kml)
    if len(directions) != 2 or any(len(item.components) != 2 for item in directions):
        raise RuntimeError("Route 13 KML must contain two directions with two components each")

    document = {
        "type": "FeatureCollection",
        "features": [feature(index, item.components) for index, item in enumerate(directions)],
    }
    write_route("13", document, "official-kml-explicit-coordinates", index)


def restore_guinda_2(index: dict) -> None:
    from route_pipeline.kml import parse_kml
    kml_path = ROOT / "rutastransporte" / "01_RUTAS_DE_COMBI" / "31_GUINDA_2" / "KML" / "Guinda_2.kml"
    directions = parse_kml(kml_path)
    features = []
    for idx, item in enumerate(directions):
        direction = "ida" if idx == 0 else "vuelta"
        title = "Ida" if idx == 0 else "Vuelta"
        features.append({
            "type": "Feature",
            "properties": {
                "id": f"31_{idx}",
                "routeId": "31",
                "routeName": "Guinda 2",
                "direction": direction,
                "directionIndex": idx + 1,
                "color": "#611240",
                "casingColor": "#222222",
                "transportType": "combi",
                "name": title,
                "geometrySource": "official-kml-explicit-coordinates",
                "matchingEngine": "none",
            },
            "geometry": {
                "type": "MultiLineString",
                "coordinates": [
                    [[round(lon, 7), round(lat, 7)] for lon, lat in component]
                    for component in item.components
                ],
            },
        })
    document = {
        "type": "FeatureCollection",
        "features": features,
    }
    write_route("31", document, "official-kml-explicit-coordinates", index)


def restore_route_from_kml(code: str, index: dict) -> None:
    from route_pipeline.config import ROUTES
    from route_pipeline.kml import parse_kml
    
    route = next(r for r in ROUTES.values() if r.code == code)
    directions = parse_kml(route.kml)
    
    features = []
    for idx, item in enumerate(directions):
        direction = "ida" if idx == 0 else "vuelta"
        title = "Ida" if idx == 0 else "Vuelta"
        features.append({
            "type": "Feature",
            "properties": {
                "id": f"{code}_{idx}",
                "routeId": code,
                "routeName": route.name,
                "direction": direction,
                "directionIndex": idx + 1,
                "color": route.color,
                "casingColor": "#222222",
                "transportType": route.transport_type,
                "name": title,
                "geometrySource": "official-kml-explicit-coordinates",
                "matchingEngine": "none",
            },
            "geometry": {
                "type": "MultiLineString",
                "coordinates": [
                    [[round(lon, 7), round(lat, 7)] for lon, lat in component]
                    for component in item.components
                ],
            },
        })
    document = {
        "type": "FeatureCollection",
        "features": features,
    }
    write_route(code, document, "official-kml-explicit-coordinates", index)


def restore_naranja_routes(index: dict) -> None:
    from route_pipeline.config import ROUTES
    from route_pipeline.kml import parse_shape_file
    
    naranja_codes_to_restore = {"38", "40", "41", "42", "44", "45", "46"}
    
    for code in naranja_codes_to_restore:
        route = next(r for r in ROUTES.values() if r.code == code)
        directions = parse_shape_file(route.kml)
        
        features = []
        for idx, item in enumerate(directions):
            direction = "ida" if idx == 0 else "vuelta"
            title = "Ida" if idx == 0 else "Vuelta"
            features.append({
                "type": "Feature",
                "properties": {
                    "id": f"{code}_{idx}",
                    "routeId": code,
                    "routeName": route.name,
                    "direction": direction,
                    "directionIndex": idx + 1,
                    "color": route.color,
                    "casingColor": "#222222",
                    "transportType": route.transport_type,
                    "name": title,
                    "geometrySource": "official-kml-explicit-coordinates",
                    "matchingEngine": "none",
                },
                "geometry": {
                    "type": "MultiLineString",
                    "coordinates": [
                        [[round(lon, 7), round(lat, 7)] for lon, lat in component]
                        for component in item.components
                    ],
                },
            })
        document = {
            "type": "FeatureCollection",
            "features": features,
        }
        write_route(code, document, "official-kml-explicit-coordinates", index)




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
    restore_route_from_kml("78", index)
    correct_alberca("79", index)
    restore_cafe_oro_2(index)
    correct_coral_1(index)
    restore_guinda_2(index)
    restore_route_from_kml("84", index)
    restore_route_from_kml("85", index)
    restore_route_from_kml("28", index)
    restore_route_from_kml("F8", index)
    restore_route_from_kml("25", index)
    restore_route_from_kml("86", index)
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Updated reviewed routes: 78, 79, 13, 18, 31, 84, 85, 28, F8, 25, 86")


if __name__ == "__main__":
    main()
