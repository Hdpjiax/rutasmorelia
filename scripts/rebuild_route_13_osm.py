"""Rebuild Café Oro 2 from its cleaned KML corridor and legal OSM edges."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from route_pipeline.config import DATA_ROOT, QualityThresholds
from route_pipeline.valhalla_engine import create_actor, match_component
from scripts.apply_reviewed_route_corrections import INDEX, ROUTES


def main() -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))

    route_path = ROUTES / "13.geojson"
    document = json.loads(route_path.read_text(encoding="utf-8"))

    actor = create_actor(DATA_ROOT / "valhalla.json")
    thresholds = QualityThresholds()
    matched_components = 0
    for feature in document["features"]:
        rebuilt = []
        for line in feature["geometry"]["coordinates"]:
            matched = match_component(actor, [tuple(point) for point in line], thresholds)
            rebuilt.append([
                [round(longitude, 7), round(latitude, 7)]
                for longitude, latitude in matched.coordinates
            ])
            matched_components += 1
        feature["geometry"]["coordinates"] = rebuilt
        feature["properties"]["geometrySource"] = "pdf-kml-corridor-rematched-to-osm"
        feature["properties"]["matchingEngine"] = "pyvalhalla-map-snap-legal-oneways"
        feature["properties"]["reviewedCorrection"] = "no-spikes-no-offroad-shortcuts"

    payload = (json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    route_path.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()
    item = next(route for route in index["routes"] if str(route["id"]) == "13")
    item["geojsonFile"] = f"/routes/13.geojson?v={digest[:12]}"
    item["artifactSha256"] = digest
    item["algorithm"] = "pdf-kml-clean-corridor-osm-rematch-v3"
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Published route 13 ({matched_components} components, {digest})")


if __name__ == "__main__":
    main()
