"""Scan all route folders and extract metadata from KML files."""

from __future__ import annotations

import csv
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUTAS_DIR = ROOT / "rutastransporte"
OUTPUT = ROOT / "tools" / "routes_manifest.csv"

KML_NS = "http://www.opengis.net/kml/2.2"

COLOR_WORDS = [
    "AMARILLA", "AMARILLO", "AZUL", "CAFE", "CORAL", "CREMA", "GRIS",
    "GUINDA", "MORADA", "MORADO", "NARANJA", "NEGRA", "NEGRO",
    "ORO_VERDE", "ORO", "PALOMA_AZUL", "ROJA", "ROJO", "ROSA",
    "VERDE", "DORADO", "ALBERCA",
]

COLOR_HEX_MAP: dict[str, str] = {
    "AMARILLA": "#FFC800", "AMARILLO": "#FFC800",
    "AZUL": "#004E98",
    "CAFE": "#8B4513",
    "CORAL": "#FF6F61",
    "CREMA": "#F9DCC4",
    "GRIS": "#808080",
    "GUINDA": "#611240",
    "MORADA": "#8238EA", "MORADO": "#8238EA",
    "NARANJA": "#FF5500",
    "NEGRA": "#000000", "NEGRO": "#000000",
    "ORO_VERDE": "#A8A800",
    "ORO": "#D1BE3C",
    "PALOMA_AZUL": "#00A9E6",
    "ROJA": "#A80000", "ROJO": "#A80000",
    "ROSA": "#FF00C5",
    "VERDE": "#70A800",
    "DORADO": "#D1BE3C",
    "ALBERCA": "#FFC800",
}

COLOR_LETTER_MAP: dict[str, str] = {
    "AMARILLA": "A", "AMARILLO": "A", "AZUL": "A", "CAFE": "C",
    "CORAL": "C", "CREMA": "C", "GRIS": "G", "GUINDA": "G",
    "MORADA": "M", "MORADO": "M", "NARANJA": "N", "NEGRA": "N", "NEGRO": "N",
    "ORO_VERDE": "O", "ORO": "O", "PALOMA_AZUL": "P",
    "ROJA": "R", "ROJO": "R", "ROSA": "R",
    "VERDE": "V", "DORADO": "D", "ALBERCA": "A",
}

def abgr_to_hex(abgr: str) -> str:
    if len(abgr) != 8:
        return ""
    r, g, b = abgr[6:8], abgr[4:6], abgr[2:4]
    return f"#{r}{g}{b}".upper()

def extract_route_number(name: str) -> str:
    m = re.match(r"(\d+)_", name)
    return m.group(1) if m else ""

def find_kml(folder: Path) -> Path | None:
    for sub in folder.iterdir():
        if sub.is_dir() and sub.name.upper().startswith("KML"):
            for f in sorted(sub.iterdir()):
                if f.suffix.lower() == ".kml":
                    return f
    for f in folder.iterdir():
        if f.suffix.lower() == ".kml":
            return f
    return None

def fix_kml_xml(raw: bytes) -> bytes:
    if b"xmlns:xsi" not in raw[:500]:
        raw = raw.replace(b"<kml ", b'<kml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ')
    return raw

def extract_color_from_folder(folder_name: str) -> tuple[str, str, str]:
    upper = folder_name.upper().split("_", 1)[1] if "_" in folder_name else folder_name
    upper = upper.upper()
    for word in COLOR_WORDS:
        if word in upper:
            hex_c = COLOR_HEX_MAP.get(word, "")
            letter = COLOR_LETTER_MAP.get(word, word[0])
            return word.capitalize(), hex_c, letter
    return "", "", "?"

def extract_kml_color(filepath: Path) -> str:
    try:
        raw = filepath.read_bytes()
        raw = fix_kml_xml(raw)
        root = ET.fromstring(raw)
        ns = KML_NS
        for style in root.iter(f"{{{ns}}}Style"):
            ls = style.find(f"{{{ns}}}LineStyle")
            if ls is not None:
                c = ls.find(f"{{{ns}}}color")
                if c is not None and c.text:
                    return abgr_to_hex(c.text.strip())
    except Exception:
        pass
    return ""

def parse_kml_description(filepath: Path) -> dict:
    result = {"route_name": "", "route_type": "", "length_km": 0.0, "coord_count": 0, "placemark_name": ""}
    try:
        raw = filepath.read_bytes()
        raw = fix_kml_xml(raw)
        root = ET.fromstring(raw)
    except Exception:
        return result

    ns = KML_NS
    for pm in root.iter(f"{{{ns}}}Placemark"):
        name_el = pm.find(f"{{{ns}}}name")
        if name_el is not None and name_el.text and not result["placemark_name"]:
            result["placemark_name"] = name_el.text.strip()

        desc = pm.find(f"{{{ns}}}description")
        if desc is not None and desc.text:
            text = desc.text
            gap = r"\s*</td>\s*<td[^>]*>"
            m = re.search(r"RUTA" + gap + r"([^<]+)", text)
            if m:
                result["route_name"] = m.group(1).strip()
            m = re.search(r"TIPO" + gap + r"([^<]+)", text)
            if m:
                result["route_type"] = m.group(1).strip()
            m = re.search(r"LONG_KM" + gap + r"([0-9.]+)", text)
            if m:
                result["length_km"] = float(m.group(1))

        for coords in pm.iter(f"{{{ns}}}coordinates"):
            if coords.text:
                pts = coords.text.strip().split()
                result["coord_count"] += len(pts)

    return result

def get_transport_type(route_type: str, placemark_name: str, category: str) -> str:
    t = route_type or placemark_name
    if t:
        return t
    if "FORANEOS" in category.upper():
        return "Autobús"
    return "Microbús"

def main():
    rows = []
    combi_counter: dict[str, int] = {}

    for top in sorted(RUTAS_DIR.iterdir()):
        if not top.is_dir():
            continue
        is_foraneo = "FORANEOS" in top.name.upper()

        for folder in sorted(top.iterdir()):
            if not folder.is_dir():
                continue

            folder_name = folder.name
            route_number = extract_route_number(folder_name)

            # Skip duplicate numbers between combi/foraneo by prefixing foraneo
            if is_foraneo and route_number:
                route_number = f"F{route_number}"

            kml_path = find_kml(folder)
            if not kml_path:
                print(f"  [SKIP] No KML found in {folder_name}")
                continue

            # Extract color from folder name
            color_name, color_hex_folder, color_letter = extract_color_from_folder(folder_name)

            # Extract KML color
            color_hex_kml = extract_kml_color(kml_path)

            # Prefer folder-derived color, fall back to KML color
            color_hex = color_hex_folder or color_hex_kml or "#FFC800"
            if not color_name:
                color_name = color_hex

            # Get description data
            meta = parse_kml_description(kml_path)
            route_name = meta["route_name"] or folder_name.split("_", 1)[1] if "_" in folder_name else folder_name
            transport_type = get_transport_type(meta["route_type"], meta["placemark_name"], top.name)

            rows.append({
                "route_id": route_number,
                "folder_name": folder_name,
                "route_name": route_name,
                "color_name": color_name,
                "color_hex": color_hex,
                "color_letter": color_letter,
                "transport_type": transport_type,
                "length_km": round(meta["length_km"], 4) if meta["length_km"] else 0,
                "coord_count": meta["coord_count"],
                "placemark_name": meta["placemark_name"],
                "kml_path": str(kml_path.relative_to(ROOT)),
                "category": top.name,
            })

            print(f"  [OK]   {route_number:4s} | {color_name:12s} | {color_hex:8s} | {color_letter} | {route_name:40s} | {transport_type:12s} | {meta['length_km']:7.2f}km | {kml_path.name}")

    # Write CSV
    fieldnames = ["route_id", "folder_name", "route_name", "color_name", "color_hex", "color_letter", "transport_type", "length_km", "coord_count", "placemark_name", "kml_path", "category"]
    with open(OUTPUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nTotal: {len(rows)} routes written to {OUTPUT}")
    print(f"Combi: {sum(1 for r in rows if 'FORANEOS' not in r['category'].upper())}")
    print(f"Foraneo: {sum(1 for r in rows if 'FORANEOS' in r['category'].upper())}")

if __name__ == "__main__":
    main()
