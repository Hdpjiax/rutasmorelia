"""Rebuild route 13 directly from its authoritative KML coordinates.

This route is intentionally excluded from Valhalla matching.  The KML contains
two components per direction around the Periferico Oriente interchange; they
must remain separate so no synthetic connector is drawn through local streets.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from route_pipeline.kml import parse_kml


KML_DIR = (
    ROOT
    / "rutastransporte"
    / "01_RUTAS_DE_COMBI"
    / "13_CAFE_ORO_2_LEANDRO_VALLE"
    / "KML"
)
OUTPUT = ROOT / "apps" / "web" / "public" / "routes" / "13.geojson"
INDEX = OUTPUT.parent / "index.json"


def feature(direction_index: int, lines: list[list[tuple[float, float]]]) -> dict:
    direction = "ida" if direction_index == 0 else "vuelta"
    title = "Ida" if direction_index == 0 else "Vuelta"
    return {
        "type": "Feature",
        "properties": {
            "id": f"13_{direction_index}",
            "routeId": "13",
            "routeName": "Café - Oro 2 (Leandro Valle)",
            "direction": direction,
            "directionIndex": direction_index + 1,
            "color": "#8B4513",
            "casingColor": "#222222",
            "transportType": "combi",
            "name": title,
            "geometrySource": "official-kml-explicit-coordinates",
            "matchingEngine": "none",
        },
        "geometry": {
            "type": "MultiLineString",
            "coordinates": [
                [[round(lon, 7), round(lat, 7)] for lon, lat in line]
                for line in lines
            ],
        },
    }


def main() -> None:
    kml = next(KML_DIR.glob("*.kml"))
    directions = parse_kml(kml)
    if len(directions) != 2 or any(len(item.components) != 2 for item in directions):
        raise RuntimeError("Route 13 KML must contain two directions with two components each")

    document = {
        "type": "FeatureCollection",
        "features": [feature(index, item.components) for index, item in enumerate(directions)],
    }
    payload = (json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    OUTPUT.write_bytes(payload)

    digest = hashlib.sha256(payload).hexdigest()
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    route = next(item for item in index["routes"] if str(item["id"]) == "13")
    route["geojsonFile"] = f"/routes/13.geojson?v={digest[:12]}"
    route["artifactSha256"] = digest
    route["algorithm"] = "official-kml-explicit-coordinates"
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} ({digest})")


if __name__ == "__main__":
    main()
