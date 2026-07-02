from route_pipeline.kml import parse_kml
from pathlib import Path

kml_path = Path("c:/RutasMorelia/rutastransporte/01_RUTAS_DE_COMBI/46_NARANJA_3_TRICO-METROPOLIS/KML_naranja3_trico/Naranja_3_Trico_Metropolis_kml.kml")
directions = parse_kml(kml_path)

comp = directions[0].components[0]
print("Direction 1 (Idx 110 to 160):")
for idx in range(110, 160):
    if idx < len(comp):
        lng, lat = comp[idx]
        print(f"Idx {idx}: {lng:.6f}, {lat:.6f}")
