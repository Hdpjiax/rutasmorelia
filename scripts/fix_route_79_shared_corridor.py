"""Make Alberca Gertrudis ida share the marked corridor with vuelta.

The correction is deliberately local. Both paths already meet at the same
OSM nodes, so the lower ida segment is replaced with the reverse of the
validated vuelta segment between those nodes. No matcher or interpolation is
used and the remainder of route 79 is left untouched.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTE = ROOT / "apps" / "web" / "public" / "routes" / "79.geojson"
INDEX = ROUTE.parent / "index.json"

IDA_START = (-101.199561, 19.739563)
IDA_END = (-101.204294, 19.740101)
VUELTA_START = (-101.204294, 19.740101)
VUELTA_END = (-101.199561, 19.739563)
TOLERANCE = 0.000002


def point_index(line: list[list[float]], target: tuple[float, float]) -> int:
    matches = [
        index
        for index, point in enumerate(line)
        if abs(point[0] - target[0]) <= TOLERANCE
        and abs(point[1] - target[1]) <= TOLERANCE
    ]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one match for {target}, found {matches}")
    return matches[0]


def main() -> None:
    document = json.loads(ROUTE.read_text(encoding="utf-8"))
    ida = next(f for f in document["features"] if f["properties"]["direction"] == "ida")
    vuelta = next(f for f in document["features"] if f["properties"]["direction"] == "vuelta")
    ida_line = ida["geometry"]["coordinates"][1]
    vuelta_line = vuelta["geometry"]["coordinates"][5]

    ida_start = point_index(ida_line, IDA_START)
    ida_end = point_index(ida_line, IDA_END)
    vuelta_start = point_index(vuelta_line, VUELTA_START)
    vuelta_end = point_index(vuelta_line, VUELTA_END)

    shared = list(reversed(vuelta_line[vuelta_start : vuelta_end + 1]))
    # Use the complete vuelta slice, including its endpoints. This guarantees
    # both directions occupy exactly the same coordinates throughout the
    # marked corridor rather than leaving a short diagonal at Camino Real.
    replacement = shared
    ida_line[ida_start : ida_end + 1] = replacement
    ida["properties"]["sharedCorridorWithVuelta"] = True

    payload = (json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    ROUTE.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()

    index = json.loads(INDEX.read_text(encoding="utf-8"))
    route = next(item for item in index["routes"] if str(item["id"]) == "79")
    route["geojsonFile"] = f"/routes/79.geojson?v={digest[:12]}"
    route["artifactSha256"] = digest
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated route 79 shared corridor ({digest})")


if __name__ == "__main__":
    main()
