"""Build Naranja routes from rutasdecombi PDFs only (no rutastransporte KML)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from route_pipeline.config import NARANJA_CODES, ROUTES
from route_pipeline.pipeline import build_route
from route_pipeline.publish import approve, publish


def main() -> int:
    extract = ROOT / "tools" / "extract_rutasdecombi_shapes.py"
    python = ROOT / ".venv-valhalla" / "Scripts" / "python.exe"
    subprocess.run([str(python), str(extract)], check=True)

    routes = [
        route
        for route in ROUTES.values()
        if route.code in NARANJA_CODES and route.source_kind == "pdf-moovit" and route.kml.is_file()
    ]
    routes.sort(key=lambda item: int(item.code))
    if not routes:
        print("Ejecute primero tools/extract_rutasdecombi_shapes.py")
        return 1

    summary: list[dict] = []
    exit_code = 0
    for route in routes:
        print(f"\n=== {route.code} {route.name} (pdf-moovit) ===")
        try:
            _output, report = build_route(route)
            passed = bool(report.get("quality_pass"))
            print(json.dumps({"quality_pass": passed, "source": str(route.kml)}, ensure_ascii=False))
            if not passed:
                exit_code = 2
                summary.append({"code": route.code, "status": "failed_validation"})
                continue
            approve(route, reviewer="pipeline-pdf-moovit", pdf_reviewed=True)
            has_supabase = bool(
                (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL"))
                and (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY"))
            )
            published = publish(route, skip_supabase=not has_supabase)
            summary.append({"code": route.code, "status": "published", "path": str(published)})
        except Exception as error:
            exit_code = 1
            print(f"ERROR {route.code}: {error}", file=sys.stderr)
            summary.append({"code": route.code, "status": "error", "error": str(error)})

    report_path = ROOT / "work" / "route-pipeline" / "naranja-pdf-batch-report.json"
    report_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())