"""Batch process all routes: snap to OSM roads and generate GeoJSON.

Usage: python tools/batch_process.py [--skip-osm]
  --skip-osm: Skip OSM snapping, use raw KML coordinates (faster for testing)
"""

from __future__ import annotations

import csv
import json
import math
import os
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "tools" / "routes_manifest.csv"
OUTPUT_DIR = ROOT / "apps" / "web" / "public" / "routes"
BUILD_SCRIPT = ROOT / "tools" / "build_route.py"

KML_NS = "http://www.opengis.net/kml/2.2"

SWAP_DIRECTIONS_MAP = {
    "4": True,  # Amarilla 2
}

TARGET_ROUTE_IDS = {"2", "3", "4", "5", "78", "79"}

COLOR_WORDS = {
    "AMARILLA": ("Amarillo", "#FFC800", "A"),
    "AMARILLO": ("Amarillo", "#FFC800", "A"),
    "AZUL": ("Azul", "#004E98", "A"),
    "CAFE": ("Café", "#8B4513", "C"),
    "CORAL": ("Coral", "#FF6F61", "C"),
    "CREMA": ("Crema", "#F9DCC4", "C"),
    "GRIS": ("Gris", "#808080", "G"),
    "GUINDA": ("Guinda", "#611240", "G"),
    "MORADA": ("Morada", "#8238EA", "M"),
    "MORADO": ("Morada", "#8238EA", "M"),
    "NARANJA": ("Naranja", "#FF5500", "N"),
    "NEGRA": ("Negra", "#000000", "N"),
    "NEGRO": ("Negra", "#000000", "N"),
    "ORO_VERDE": ("Oro Verde", "#A8A800", "O"),
    "ORO": ("Oro", "#D1BE3C", "O"),
    "PALOMA_AZUL": ("Paloma Azul", "#00A9E6", "P"),
    "ROJA": ("Roja", "#A80000", "R"),
    "ROJO": ("Roja", "#A80000", "R"),
    "ROSA": ("Rosa", "#FF00C5", "R"),
    "VERDE": ("Verde", "#70A800", "V"),
    "VERDES": ("Verde", "#70A800", "V"),
    "DORADO": ("Dorado", "#D1BE3C", "D"),
    "ALBERCA": ("Alberca", "#FFC800", "A"),
}

def hex_to_color_name(hex_color: str) -> tuple[str, str]:
    h = hex_color.upper().lstrip("#")
    if len(h) != 6:
        return ("", "?")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    max_v = max(r, g, b)
    if max_v < 30:
        return ("Negra", "N")
    if r > 200 and g < 100 and b < 100:
        return ("Roja", "R")
    if r > 200 and g > 150 and b < 80:
        return ("Naranja", "N")
    if r > 200 and g > 180 and b < 100:
        return ("Amarillo", "A")
    if g > 150 and r < 100 and b < 100:
        return ("Verde", "V")
    if b > 150 and r < 100 and g < 100:
        return ("Azul", "A")
    if r > 150 and b > 150 and g < 100:
        return ("Morada", "M")
    if r > 200 and b > 200:
        return ("Rosa", "R")
    if r > 150 and g > 150 and b > 150:
        return ("Gris", "G")
    return (hex_color, "?")

def get_color_info(folder_name: str, kml_hex: str) -> tuple[str, str, str]:
    upper = folder_name.upper()
    for word, (cname, chex, cleft) in sorted(COLOR_WORDS.items(), key=lambda x: -len(x[0])):
        if word in upper:
            return cname, chex, cleft
    if kml_hex:
        cname, cleft = hex_to_color_name(kml_hex)
        return cname, kml_hex, cleft
    return ("", "?", "")

def extract_kml_color(filepath: Path) -> str:
    try:
        raw = filepath.read_bytes()
        if b"xmlns:xsi" not in raw[:500]:
            raw = raw.replace(b"<kml ", b'<kml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ')
        root = ET.fromstring(raw)
        ns = KML_NS
        for style in root.iter(f"{{{ns}}}Style"):
            ls = style.find(f"{{{ns}}}LineStyle")
            if ls is not None:
                c = ls.find(f"{{{ns}}}color")
                if c is not None and c.text:
                    abgr = c.text.strip()
                    if len(abgr) == 8:
                        return f"#{abgr[6:8]}{abgr[4:6]}{abgr[2:4]}".upper()
    except Exception:
        pass
    return ""

def extract_kml_coordinates(filepath: Path) -> list[list[list[float]]]:
    """Extract all LineString coordinates from KML, return list of paths."""
    try:
        raw = filepath.read_bytes()
        if b"xmlns:xsi" not in raw[:500]:
            raw = raw.replace(b"<kml ", b'<kml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ')
        root = ET.fromstring(raw)
    except Exception:
        return []

    ns = KML_NS
    paths = []
    for ls in root.iter(f"{{{ns}}}LineString"):
        coords_el = ls.find(f"{{{ns}}}coordinates")
        if coords_el is not None and coords_el.text:
            pts = []
            for token in coords_el.text.strip().split():
                parts = token.strip().split(",")
                if len(parts) >= 2:
                    try:
                        pts.append([float(parts[0]), float(parts[1])])
                    except ValueError:
                        pass
            if pts:
                paths.append(pts)
    return paths

def haversine_km(coords):
    total = 0.0
    for i in range(len(coords) - 1):
        lon1, lat1 = coords[i]
        lon2, lat2 = coords[i+1]
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
        total += 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return round(total, 4)

def run_build_route(kml_path: str, route_code: str, name: str, color: str, transport_type: str, swap_directions: bool = False) -> bool:
    cmd = [
        sys.executable, str(BUILD_SCRIPT),
        "--kml", kml_path,
        "--code", route_code,
        "--name", name,
        "--color", color,
        "--type", transport_type,
        "--output-dir", str(OUTPUT_DIR),
    ]
    if swap_directions:
        cmd.append("--swap-directions")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=str(ROOT))
        if result.returncode != 0:
            print(f"    FAILED (exit {result.returncode}): {result.stderr[:200]}")
            return False
        return True
    except subprocess.TimeoutExpired:
        print("    TIMEOUT after 5 minutes")
        return False
    except Exception as e:
        print(f"    ERROR: {e}")
        return False

def generate_fallback_geojson(kml_path: Path, route_id: str, name: str, color: str, transport_type: str, swap_directions: bool = False):
    """Generate simple GeoJSON from raw KML coordinates (no OSM snapping)."""
    paths = extract_kml_coordinates(kml_path)
    if not paths:
        print(f"    No coordinates found in KML")
        return
    if swap_directions:
        paths.reverse()

    features = []
    for i, coords in enumerate(paths):
        direction = "ida" if i == 0 else "vuelta"
        long_km = haversine_km(coords)
        features.append({
            "type": "Feature",
            "properties": {
                "id": f"{route_id}_{i}",
                "routeId": route_id,
                "routeName": name,
                "direction": direction,
                "color": color,
                "casingColor": "#222222",
                "longKm": long_km,
                "transportType": transport_type,
                "name": direction.capitalize(),
            },
            "geometry": {
                "type": "LineString",
                "coordinates": coords,
            }
        })

    output = {"type": "FeatureCollection", "features": features}
    out_path = OUTPUT_DIR / f"{route_id}.geojson"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)
    total_pts = sum(len(f["geometry"]["coordinates"]) for f in features)
    print(f"    FALLBACK GeoJSON: {len(features)} dirs, {total_pts} pts total, {long_km} km")

def ensure_geojson_exists(route_id: str):
    """Check if route geojson exists, and its size."""
    path = OUTPUT_DIR / f"{route_id}.geojson"
    if path.exists():
        size = path.stat().st_size
        if size > 1000:
            return True
    return False

def main():
    skip_osm = "--skip-osm" in sys.argv

    if not MANIFEST.exists():
        print(f"Manifest not found: {MANIFEST}")
        print("Run tools/scan_routes.py first")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(MANIFEST, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        routes = list(reader)

    print(f"Processing {len(routes)} routes...")

    index_routes = []
    success = 0
    skipped = 0
    failed = 0

    for i, route in enumerate(routes):
        route_id = route["route_id"]
        route_name = route["route_name"]
        folder_name = route["folder_name"]
        kml_rel = route["kml_path"]
        transport_type = route["transport_type"]
        kml_hex = route["color_hex"]

        if not route_id:
            route_id = folder_name.split("_")[0] if "_" in folder_name else folder_name[:10]

        # Only process target routes in our batch
        if route_id not in TARGET_ROUTE_IDS:
            continue

        color_name, color_hex, color_letter = get_color_info(folder_name, kml_hex)
        if not color_hex:
            color_hex = "#FFC800"

        kml_path = ROOT / kml_rel
        if not kml_path.exists():
            print(f"[{i+1}/{len(routes)}] {route_id:4s} | SKIP (KML not found: {kml_rel})")
            skipped += 1
            continue

        print(f"[{i+1}/{len(routes)}] {route_id:4s} | {color_hex:8s} | {route_name:40s} | ", end="", flush=True)

        swap_directions = SWAP_DIRECTIONS_MAP.get(route_id, False)

        # Force re-snapping for target routes by not skipping them
        existing = ensure_geojson_exists(route_id)
        if existing and route_id not in TARGET_ROUTE_IDS and not skip_osm:
            print(f"EXISTS (skipping)")
            success += 1
            # Use existing
            index_routes.append({
                "id": route_id,
                "name": route_name,
                "color": color_hex,
                "transportType": transport_type,
                "colorName": color_name,
                "colorLetter": color_letter,
                "geojsonFile": f"/routes/{route_id}.geojson",
            })
            continue

        if skip_osm:
            generate_fallback_geojson(kml_path, route_id, route_name, color_hex, transport_type, swap_directions)
            success += 1
        else:
            ok = run_build_route(str(kml_path), route_id, route_name, color_hex, transport_type, swap_directions)
            if ok and ensure_geojson_exists(route_id):
                print(f"OK")
                success += 1
            else:
                print(f"FALLBACK (OSM failed, using raw KML)")
                generate_fallback_geojson(kml_path, route_id, route_name, color_hex, transport_type, swap_directions)
                success += 1

        index_routes.append({
            "id": route_id,
            "name": route_name,
            "color": color_hex,
            "transportType": transport_type,
            "colorName": color_name,
            "colorLetter": color_letter,
            "geojsonFile": f"/routes/{route_id}.geojson",
        })

        # Brief pause between routes
        time.sleep(0.5)

    # Write index.json
    index = {"type": "routes-index", "routes": index_routes}
    index_path = OUTPUT_DIR / "index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"\nTotal: {success} success, {skipped} skipped, {failed} failed")
    print(f"Index written to {index_path}")

if __name__ == "__main__":
    main()
