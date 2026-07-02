import xml.etree.ElementTree as ET
from pathlib import Path
import json

ROOT = Path("c:/RutasMorelia")
KML_PATH = ROOT / "rutastransporte/01_RUTAS_DE_COMBI/13_CAFE_ORO_2_LEANDRO_VALLE/KML/Café-Oro_2_Leandro_Valle.kml"

text = KML_PATH.read_text(encoding="utf-8-sig")
import re
text = re.sub(r"(<kml\b[^>]*)(>)", r'\1 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\2', text, count=1)
root = ET.fromstring(text)
ns = "http://www.opengis.net/kml/2.2"

pms = root.findall(f".//{{{ns}}}Placemark")
for idx, pm in enumerate(pms):
    name_node = pm.find(f"{{{ns}}}name")
    name = name_node.text.strip() if name_node is not None else "None"
    coords_node = pm.find(f".//{{{ns}}}LineString/{{{ns}}}coordinates")
    if coords_node is not None:
        coords = [tuple(map(float, c.split(",")[:2])) for c in coords_node.text.strip().split()]
        print(f"\nPlacemark {idx+1}: name='{name}', coords_count={len(coords)}")
        print(f"  Start: {coords[0]} | End: {coords[-1]}")
        
        # Let's check coordinates around the loop (lon -101.154 to -101.150, lat 19.695 to 19.702)
        loop_points = [(i, c) for i, c in enumerate(coords) if -101.156 <= c[0] <= -101.150 and 19.695 <= c[1] <= 19.702]
        print(f"  Loop candidates count: {len(loop_points)}")
        if loop_points:
            print(f"  Loop candidates range of indices: {loop_points[0][0]} to {loop_points[-1][0]}")
            # print some of them around the middle
            mid = len(loop_points) // 2
            print(f"  Sample candidates: {loop_points[max(0, mid-5):min(len(loop_points), mid+5)]}")
