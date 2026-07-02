import sys
sys.path.append('.')
from route_pipeline.kml import parse_kml
from pathlib import Path

ROOT = Path("c:/RutasMorelia")
route_kml = ROOT / "rutastransporte/01_RUTAS_DE_COMBI/13_CAFE_ORO_2_LEANDRO_VALLE/KML/Café-Oro_2_Leandro_Valle.kml"

directions = parse_kml(route_kml)
d2 = directions[1]
c1 = d2.components[0]
print(f"Direction 2, Component 1: {len(c1)} points")
for idx, pt in enumerate(c1):
    print(f"  {idx}: {pt}")
