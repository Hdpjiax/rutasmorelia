import sys
sys.path.append('.')
import json
from pathlib import Path
from route_pipeline.config import ROUTES
from route_pipeline.kml import parse_kml, Direction
from route_pipeline.pipeline import _apply_reference_overrides, match_component
from route_pipeline.valhalla_engine import create_actor
from route_pipeline.config import QualityThresholds

ROOT = Path("c:/RutasMorelia")
actor = create_actor(ROOT / "geo-cache/valhalla/valhalla.json")
thresholds = QualityThresholds()

def test_route(route_slug):
    route = ROUTES[route_slug]
    print(f"\nTesting pipeline sequence for: {route.name}")
    raw_directions = parse_kml(route.kml)
    
    # Swap
    if route.code != "79" and len(raw_directions) == 2:
        dir1 = Direction(1, raw_directions[1].name, raw_directions[1].components)
        dir2 = Direction(2, raw_directions[0].name, raw_directions[0].components)
        directions = [dir1, dir2]
    else:
        directions = raw_directions
        
    # Apply override
    directions, overrides = _apply_reference_overrides(route, directions)
    print(f"Applied overrides count: {len(overrides)}")
    
    # Reverse
    if route.code != "79" and len(directions) == 2:
        reversed_directions = []
        for d in directions:
            rev_comps = []
            for comp in reversed(d.components):
                rev_comps.append(list(reversed(comp)))
            reversed_directions.append(Direction(d.index, d.name, rev_comps))
        directions = reversed_directions
        
    # Snapping check for Direction 1 Component 1
    c1 = directions[0].components[0]
    print(f"Direction 1, Component 1 points: {len(c1)}")
    result = match_component(actor, c1, thresholds)
    print(f"Snapped successfully: {len(result.coordinates)} points")
    
    # Check bounds
    lons = [pt[0] for pt in result.coordinates]
    print(f"Min Lon: {min(lons)} | Max Lon: {max(lons)}")

test_route("13-cafe-oro-2-leandro-valle")
test_route("3-combi-amarilla-1-centro")
