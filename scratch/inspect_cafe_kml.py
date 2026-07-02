import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path("c:/RutasMorelia")
KML_PATH = ROOT / "rutastransporte/01_RUTAS_DE_COMBI/13_CAFE_ORO_2_LEANDRO_VALLE/KML/Café-Oro_2_Leandro_Valle.kml"

text = KML_PATH.read_text(encoding="utf-8-sig")
# Add namespace if needed
import re
text = re.sub(r"(<kml\b[^>]*)(>)", r'\1 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\2', text, count=1)
root = ET.fromstring(text)
ns = "http://www.opengis.net/kml/2.2"

pms = root.findall(f".//{{{ns}}}Placemark")
print(f"Found {len(pms)} placemarks")

for idx, pm in enumerate(pms):
    name_node = pm.find(f"{{{ns}}}name")
    name = name_node.text.strip() if name_node is not None else "None"
    coords_node = pm.find(f".//{{{ns}}}LineString/{{{ns}}}coordinates")
    if coords_node is not None:
        coords = [tuple(map(float, c.split(",")[:2])) for c in coords_node.text.strip().split()]
        print(f"Placemark {idx+1}: name='{name}', coords_count={len(coords)}")
        # Print some sample coordinates near Avenida Acueducto (e.g. lon between -101.16 and -101.15)
        sample = [c for c in coords if -101.16 <= c[0] <= -101.14 and 19.69 <= c[1] <= 19.71]
        print(f"  Coordinates in region: {len(sample)}")
        if sample:
            print(f"  First few in region: {sample[:5]}")
            # Find the indices of these coordinates in the original list
            indices = [i for i, c in enumerate(coords) if -101.16 <= c[0] <= -101.14 and 19.69 <= c[1] <= 19.71]
            print(f"  Indices in list: {indices[:10]} ... {indices[-10:]}")
