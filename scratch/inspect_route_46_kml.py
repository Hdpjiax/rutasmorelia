from route_pipeline.kml import parse_kml
from pathlib import Path

kml_path = Path("c:/RutasMorelia/rutastransporte/01_RUTAS_DE_COMBI/46_NARANJA_3_TRICO-METROPOLIS/KML_naranja3_trico/Naranja_3_Trico_Metropolis_kml.kml")
directions = parse_kml(kml_path)

print(f"Total directions parsed: {len(directions)}")
for d in directions:
    print(f"Direction {d.index}: name={d.name}, components count={len(d.components)}")
    for idx, comp in enumerate(d.components):
        print(f"  Component {idx}: {len(comp)} coordinates")
        # Print first and last coordinates
        print(f"    Start: {comp[0]}")
        print(f"    End: {comp[-1]}")
