"""Remove published Naranja route geometry from local CDN and Supabase."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from route_pipeline.config import NARANJA_CODES, PUBLIC_ROUTES

INDEX_PATH = PUBLIC_ROUTES / "index.json"
WORK_ROOT = ROOT / "work" / "route-pipeline"


def purge_local() -> list[str]:
    removed: list[str] = []
    for code in sorted(NARANJA_CODES, key=int):
        geojson = PUBLIC_ROUTES / f"{code}.geojson"
        if geojson.is_file():
            geojson.unlink()
            removed.append(str(geojson))

    if INDEX_PATH.is_file():
        index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        before = len(index.get("routes") or [])
        index["routes"] = [route for route in index.get("routes") or [] if str(route.get("id")) not in NARANJA_CODES]
        INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"index.json: {before} -> {len(index['routes'])} rutas")

    if WORK_ROOT.is_dir():
        for slug_dir in WORK_ROOT.iterdir():
            if not slug_dir.is_dir():
                continue
            for code in NARANJA_CODES:
                for pattern in (f"{code}.geojson", "source.geojson", "validation.json", "approval.json"):
                    candidate = slug_dir / pattern
                    if candidate.is_file():
                        candidate.unlink()
                        removed.append(str(candidate))
    return removed


def main() -> int:
    removed = purge_local()
    print(f"Eliminados {len(removed)} archivos locales de rutas Naranja.")
    print("Códigos:", ", ".join(sorted(NARANJA_CODES, key=int)))
    print("Para Supabase ejecute la migración:")
    print("  supabase/migrations/20260707120000_purge_naranja_routes.sql")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())