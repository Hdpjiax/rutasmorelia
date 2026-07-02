import xml.etree.ElementTree as ET
from pathlib import Path
from route_pipeline.kml import parse_kml

ROOT = Path("c:/RutasMorelia")
route_kml = ROOT / "rutastransporte/01_RUTAS_DE_COMBI/13_CAFE_ORO_2_LEANDRO_VALLE/KML/Café-Oro_2_Leandro_Valle.kml"

directions = parse_kml(route_kml)
print(f"Parsed directions: {len(directions)}")
for direction in directions:
    print(f"\nDirection {direction.index}: name='{direction.name}'")
    print(f"  Total components: {len(direction.components)}")
    for comp_idx, comp in enumerate(direction.components):
        print(f"    Component {comp_idx+1}: points={len(comp)}, start={comp[0]}, end={comp[-1]}")
