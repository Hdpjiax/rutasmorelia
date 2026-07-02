"""Publish the complete, freshly rebuilt Alberca Gertrudis artifact.

This intentionally replaces the whole public route.  It prevents older local
corridor patches from deleting components or merging ida and vuelta.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "work/route-pipeline/alberca-gertrudis/79.geojson"
REPORT = ROOT / "work/route-pipeline/alberca-gertrudis/validation.json"
ROUTE = ROOT / "apps/web/public/routes/79.geojson"
INDEX = ROUTE.parent / "index.json"


def main() -> None:
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    if not report.get("quality_pass"):
        raise RuntimeError("The rebuilt route did not pass validation")

    document = json.loads(SOURCE.read_text(encoding="utf-8"))
    directions = {
        feature["properties"]["direction"]: feature
        for feature in document["features"]
    }
    if set(directions) != {"ida", "vuelta"}:
        raise RuntimeError("The rebuilt route must contain ida and vuelta")
    if len(directions["ida"]["geometry"]["coordinates"]) != 2:
        raise RuntimeError("The complete ida geometry is missing components")
    if len(directions["vuelta"]["geometry"]["coordinates"]) != 5:
        raise RuntimeError("The complete vuelta geometry is missing components")

    for feature in document["features"]:
        feature["properties"]["publicationSource"] = "full-rebuild-kml-pdf-valhalla"
        feature["properties"].pop("corridorSource", None)
        feature["properties"].pop("sharedCorridorWithVuelta", None)

    payload = (json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    ROUTE.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()

    index = json.loads(INDEX.read_text(encoding="utf-8"))
    item = next(route for route in index["routes"] if str(route["id"]) == "79")
    item["geojsonFile"] = f"/routes/79.geojson?v={digest[:12]}"
    item["artifactSha256"] = digest
    item["algorithm"] = "full-rebuild-kml-pdf-valhalla-v4"
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Published complete route 79: {digest}")


if __name__ == "__main__":
    main()
