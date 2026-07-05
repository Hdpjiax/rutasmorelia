"""Extract route shapes from rutasdecombi PDFs via embedded Moovit links.

The PDFs are Moovit line exports: they do not contain lat/lon, but each file
embeds the canonical tripplan URL for that route. This script reads only the
PDFs in rutasdecombi/ and writes raw LineString GeoJSON under rutasdecombi/sources/.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

import fitz

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "rutasdecombi"
OUT_DIR = PDF_DIR / "sources"
MANIFEST_PATH = PDF_DIR / "routes.json"

ROUTE_META = {
    "Naranja 1 [Issste].pdf": {"code": "38", "name": "Naranja 1 ISSSTE"},
    "Naranja 1 [La Soledad].pdf": {"code": "39", "name": "Naranja 1 [La Soledad]"},
    "Naranja 2 [3 De Agosto].pdf": {"code": "40", "name": "Naranja 2 [3 De Agosto]"},
    "NARANJA 2 (↔ Santa Fe).pdf": {"code": "41", "name": "Naranja 2 Santa Fe"},
    "Naranja 3 [Centro - Puerta Del Sol].pdf": {"code": "42", "name": "Naranja 3 [Centro - Puerta Del Sol]"},
    "Naranja 3 [Sta. María - Erandeni].pdf": {"code": "44", "name": "Naranja 3 [Sta. María - Erandeni]"},
    "Naranja 3 [Sta. María - Ita].pdf": {"code": "45", "name": "Naranja 3 [Sta. María - Ita]"},
    "Naranja 3 [Trico - Metrópolis].pdf": {"code": "46", "name": "Naranja 3 [Trico - Metrópolis]"},
}


def decode_polyline(value: str, precision: int = 5) -> list[tuple[float, float]]:
    coordinates: list[tuple[float, float]] = []
    index = latitude = longitude = 0
    factor = 10**precision
    while index < len(value):
        deltas: list[int] = []
        for _ in range(2):
            result = shift = 0
            while True:
                byte = ord(value[index]) - 63
                index += 1
                result |= (byte & 31) << shift
                shift += 5
                if byte < 32:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        latitude += deltas[0]
        longitude += deltas[1]
        coordinates.append((longitude / factor, latitude / factor))
    return coordinates


def moovit_url_from_pdf(pdf_path: Path) -> str:
    document = fitz.open(pdf_path)
    try:
        for page in document:
            for link in page.get_links():
                uri = link.get("uri", "")
                if "tripplan/morelia" in uri and "/lines/" in uri:
                    return uri.split("&af_sub8")[0]
    finally:
        document.close()
    raise ValueError(f"No se encontró enlace Moovit en {pdf_path.name}")


def fetch_moovit_shape(url: str) -> tuple[list[tuple[float, float]], list[dict]]:
    request = Request(url, headers={"User-Agent": "ViaMorelia PDF route extractor"})
    page = urlopen(request, timeout=45).read().decode("utf-8")
    match = re.search(r'<script id="serverApp-state" type="application/json">(.*?)</script>', page, re.S)
    if not match:
        raise RuntimeError(f"Moovit no devolvió geometría para {url}")
    state = json.loads(match.group(1))
    option = state["appState"]["line"]["lineDirections"][0]["lineOptions"][0]
    coordinates = decode_polyline(option["shape"]["encodedShape"])
    stops = option.get("stops") or []
    return coordinates, stops


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    routes: list[dict] = []
    for pdf_name, meta in ROUTE_META.items():
        pdf_path = PDF_DIR / pdf_name
        if not pdf_path.is_file():
            raise FileNotFoundError(f"Falta PDF: {pdf_path}")
        moovit_url = moovit_url_from_pdf(pdf_path)
        coordinates, stops = fetch_moovit_shape(moovit_url)
        source_path = OUT_DIR / f"{meta['code']}.source.geojson"
        geojson = {
            "type": "FeatureCollection",
            "properties": {
                "source": "rutasdecombi-pdf-moovit",
                "pdf": pdf_name,
                "moovit_url": moovit_url,
                "extracted_at": datetime.now(timezone.utc).isoformat(),
                "point_count": len(coordinates),
                "stop_count": len(stops),
            },
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "route_code": meta["code"],
                        "route_name": meta["name"],
                        "direction": "ida",
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[lon, lat] for lon, lat in coordinates],
                    },
                }
            ],
        }
        source_path.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")
        routes.append({
            "code": meta["code"],
            "name": meta["name"],
            "color": "#EC5400",
            "color_name": "Naranja",
            "color_letter": "N",
            "transport_type": "combi",
            "pdf_path": f"rutasdecombi/{pdf_name}",
            "moovit_url": moovit_url,
            "source_geojson": f"rutasdecombi/sources/{meta['code']}.source.geojson",
            "point_count": len(coordinates),
            "stop_count": len(stops),
        })
        print(f"{meta['code']} {meta['name']}: {len(coordinates)} puntos desde {pdf_name}")

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "pdf-only",
        "routes": routes,
    }
    MANIFEST_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Manifest: {MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())