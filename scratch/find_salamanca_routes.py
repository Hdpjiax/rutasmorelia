import os
import json

routes_dir = "c:/RutasMorelia/apps/web/public/routes"
target_lat_min, target_lat_max = 19.740, 19.750
target_lng_min, target_lng_max = -101.192, -101.182

matching_routes = []

for file in os.listdir(routes_dir):
    if file.endswith(".geojson"):
        filepath = os.path.join(routes_dir, file)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            found = False
            for feature in data.get("features", []):
                geom = feature.get("geometry", {})
                gtype = geom.get("type")
                coords = geom.get("coordinates", [])
                
                if gtype == "LineString":
                    for lng, lat in coords:
                        if target_lat_min <= lat <= target_lat_max and target_lng_min <= lng <= target_lng_max:
                            found = True
                            break
                elif gtype == "MultiLineString":
                    for line in coords:
                        for lng, lat in line:
                            if target_lat_min <= lat <= target_lat_max and target_lng_min <= lng <= target_lng_max:
                                found = True
                                break
                if found:
                    break
            if found:
                matching_routes.append(file)
        except Exception as e:
            print(f"Error reading {file}: {e}")

print("Matching geojson files:")
for r in matching_routes:
    print(r)
