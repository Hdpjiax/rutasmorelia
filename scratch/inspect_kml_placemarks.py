import re
from pathlib import Path

ROOT = Path("c:/RutasMorelia")
kml_path = ROOT / "rutastransporte/01_RUTAS_DE_COMBI/13_CAFE_ORO_2_LEANDRO_VALLE/KML/Café-Oro_2_Leandro_Valle.kml"

content = kml_path.read_text(encoding="utf-8")

# Let's find all placemarks globally, allowing attributes
placemarks = re.findall(r'<Placemark\b[^>]*>(.*?)</Placemark>', content, re.DOTALL)
print(f"Total Placemarks globally: {len(placemarks)}")

for idx, pm in enumerate(placemarks):
    pm_name_match = re.search(r'<name>(.*?)</name>', pm)
    pm_name = pm_name_match.group(1) if pm_name_match else f"Placemark {idx}"
    linestrings = re.findall(r'<LineString\b[^>]*>(.*?)</LineString>', pm, re.DOTALL)
    print(f"  Placemark {idx}: {pm_name} | LineStrings: {len(linestrings)}")
    for ls_idx, ls in enumerate(linestrings):
        coordinates_match = re.search(r'<coordinates>(.*?)</coordinates>', ls, re.DOTALL)
        if coordinates_match:
            coordinates = coordinates_match.group(1).strip().split()
            print(f"    LineString {ls_idx}: coordinates count = {len(coordinates)}")
            print(f"      Start: {coordinates[0]} | End: {coordinates[-1]}")
