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
route = ROUTES["13-cafe-oro-2-leandro-valle"]
print(f"Testing original directions (no swap, no reverse) for: {route.name}")

raw_directions = parse_kml(route.kml)

# Apply overrides to original directions:
# original Direction 1 (Placemark 0) has loop in Component 2 (LineString 1: 44 points)
# original Direction 2 (Placemark 1) has loop in Component 1 (LineString 0: 81 points)

d1_comps = [comp[:] for comp in raw_directions[0].components]
c2 = d1_comps[1]
print(f"Original D1 C2 length: {len(c2)}")
d1_comps[1] = c2[:4] + c2[11:]
print(f"Modified D1 C2 length: {len(d1_comps[1])}")
raw_directions[0] = Direction(1, raw_directions[0].name, d1_comps)

d2_comps = [comp[:] for comp in raw_directions[1].components]
c1 = d2_comps[0]
print(f"Original D2 C1 length: {len(c1)}")
c1_temp = [c1[0]] + c1[57:]
if len(c1_temp) >= 24:
    d2_comps[0] = c1_temp[:14] + c1_temp[22:]
print(f"Modified D2 C1 length: {len(d2_comps[0])}")
raw_directions[1] = Direction(2, raw_directions[1].name, d2_comps)

directions = raw_directions

# Run snapping
actor = create_actor(ROOT / "geo-cache/valhalla/valhalla.json")
thresholds = QualityThresholds()

for d in directions:
    print(f"\nSnapping Direction {d.index} ({d.name}):")
    for comp_idx, comp in enumerate(d.components):
        result = match_component(actor, comp, thresholds)
        print(f"  Component {comp_idx+1}: matched {len(result.coordinates)} points")
        print(f"  Start: {result.coordinates[0]} | End: {result.coordinates[-1]}")
