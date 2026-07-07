"""Audit KML ida/vuelta labels across rutastransporte."""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from route_pipeline.direction import direction_kind, normalize_route_directions
from route_pipeline.kml import parse_shape_file

MANIFEST = ROOT / "tools" / "routes_manifest.csv"
REPORT = ROOT / "work" / "route-pipeline" / "kml-direction-audit.json"


def main() -> int:
    if not MANIFEST.is_file():
        print(f"Falta {MANIFEST}")
        return 1

    findings: list[dict] = []
    with MANIFEST.open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            kml_rel = (row.get("kml_path") or "").strip()
            if not kml_rel:
                continue
            kml_path = ROOT / kml_rel
            if not kml_path.is_file():
                continue
            try:
                raw = parse_shape_file(kml_path)
            except Exception as error:
                findings.append({
                    "code": row.get("route_id"),
                    "name": row.get("route_name"),
                    "kml": kml_rel,
                    "error": str(error),
                })
                continue
            labels = [{"index": item.index, "name": item.name, "kind": direction_kind(item.name)} for item in raw]
            normalized = normalize_route_directions(raw)
            swapped = False
            if len(raw) == 2 and len(normalized) == 2:
                swapped = raw[0].name != normalized[0].name or raw[1].name != normalized[1].name
            findings.append({
                "code": row.get("route_id"),
                "name": row.get("route_name"),
                "kml": kml_rel,
                "raw_labels": labels,
                "normalized_labels": [item.name for item in normalized],
                "reorder_needed": swapped,
            })

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(findings, ensure_ascii=False, indent=2), encoding="utf-8")
    suspicious = [item for item in findings if item.get("reorder_needed") or any(
        label.get("kind") == "unknown" for label in item.get("raw_labels", [])
    )]
    print(f"Auditadas {len(findings)} rutas. Sospechosas: {len(suspicious)}")
    print(f"Reporte: {REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())