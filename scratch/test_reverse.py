import sys
sys.path.append('.')
import json
from pathlib import Path
from route_pipeline.config import ROUTES
from route_pipeline.kml import parse_kml, Direction
from route_pipeline.pipeline import match_component
from route_pipeline.valhalla_engine import create_actor
from route_pipeline.config import QualityThresholds

ROOT = Path("c:/RutasMorelia")
route = ROUTES["3-combi-amarilla-1-centro"]
print(f"Testing coordinate reversal for route: {route.name}")

# Parse directions
raw_directions = parse_kml(route.kml)

# Swap and reverse!
directions = []
for idx, raw_dir in enumerate(reversed(raw_directions)):
    # Reverse components and reverse coordinate order in each component
    reversed_components = []
    for comp in reversed(raw_dir.components):
        reversed_components.append(list(reversed(comp)))
    directions.append(Direction(idx + 1, raw_dir.name, reversed_components))

# Let's inspect Direction 1 Component 1 coordinates
c1 = directions[0].components[0]
print(f"Direction 1 (Ida), Component 1 points: {len(c1)}")
print(f"  Start: {c1[0]} | End: {c1[-1]}")

# Run Valhalla match
actor = create_actor(ROOT / "geo-cache/valhalla/valhalla.json")
thresholds = QualityThresholds()

result = match_component(actor, c1, thresholds)
print(f"Matched {len(result.coordinates)} points")
print(f"Start matched: {result.coordinates[0]} | End matched: {result.coordinates[-1]}")
