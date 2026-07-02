from route_pipeline.kml import parse_kml
from pathlib import Path
import json

kml_path = Path("c:/RutasMorelia/rutastransporte/01_RUTAS_DE_COMBI/46_NARANJA_3_TRICO-METROPOLIS/KML_naranja3_trico/Naranja_3_Trico_Metropolis_kml.kml")
directions = parse_kml(kml_path)

# Let's inspect coordinates around Salamanca intersection
target_lat_min, target_lat_max = 19.740, 19.750
target_lng_min, target_lng_max = -101.192, -101.182

for d in directions:
    print(f"=== Direction {d.index} ===")
    comp = d.components[0]
    for idx, (lng, lat) in enumerate(comp):
        if target_lat_min <= lat <= target_lat_max and target_lng_min <= lng <= target_lng_max:
            # Print index, coordinates, and let's check a window of 10 points
            print(f"Idx: {idx} | Lng: {lng:.6f}, Lat: {lat:.6f}")
