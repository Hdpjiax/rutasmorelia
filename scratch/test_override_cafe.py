import sys
sys.path.append('.')
import json
from pathlib import Path
from route_pipeline.config import ROUTES
from route_pipeline.kml import parse_kml, Direction
from route_pipeline.pipeline import match_component
from route_pipeline.valhalla_engine import create_actor, actor_version
from route_pipeline.config import QualityThresholds

ROOT = Path("c:/RutasMorelia")
route = ROUTES["13-cafe-oro-2-leandro-valle"]
print(f"Testing override for route: {route.name}")

# Parse directions
raw_directions = parse_kml(route.kml)

# Swap directions since that was requested
dir1 = Direction(1, raw_directions[1].name, raw_directions[1].components)
dir2 = Direction(2, raw_directions[0].name, raw_directions[0].components)
directions = [dir1, dir2]

# Let's apply the override to the loop in original Direction 2 Component 1.
# Since we swapped them, original Direction 2 is now Direction 1!
# So we modify directions[0] (which is the new Direction 1)!
d1_components = [comp[:] for comp in directions[0].components]
c1 = d1_components[0]
print(f"Original Component 1 length: {len(c1)}")
# Remove indices 1 to 56
d1_components[0] = [c1[0]] + c1[57:]
print(f"Modified Component 1 length: {len(d1_components[0])}")

directions[0] = Direction(1, directions[0].name, d1_components)

# Run Valhalla match
actor = create_actor(ROOT / "geo-cache/valhalla/valhalla.json")
thresholds = QualityThresholds()

# Match Direction 1, Component 1
result = match_component(actor, directions[0].components[0], thresholds)
print(f"Snapping result status: {len(result.coordinates)} matched points")
print(f"Edges matched: {len(result.edges)}")

# Let's write the matched coordinates to a geojson file to inspect
geojson = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {"name": "matched"},
            "geometry": {
                "type": "LineString",
                "coordinates": [list(pt) for pt in result.coordinates]
            }
        }
    ]
}
(ROOT / "scratch/test_matched_cafe.geojson").write_text(json.dumps(geojson), encoding="utf-8")
print("Saved geojson to scratch/test_matched_cafe.geojson")
