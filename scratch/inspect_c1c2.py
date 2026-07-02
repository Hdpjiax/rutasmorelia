import sys
sys.path.append('.')
from route_pipeline.kml import parse_kml
from pathlib import Path

ROOT = Path("c:/RutasMorelia")
route_kml = ROOT / "rutastransporte/01_RUTAS_DE_COMBI/13_CAFE_ORO_2_LEANDRO_VALLE/KML/Café-Oro_2_Leandro_Valle.kml"

directions = parse_kml(route_kml)
d1 = directions[0]
c2 = d1.components[1]
print(f"Direction 1, Component 2: {len(c2)} points")
for idx, pt in enumerate(c2):
    print(f"  {idx}: {pt}")
