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
route = ROUTES["13-cafe-oro-2-leandro-valle"]
print(f"Testing both overrides for route: {route.name}")

raw_directions = parse_kml(route.kml)

# Let's apply corrections directly to raw_directions (before swap and reverse)
# raw_directions[0] is original Direction 1
# raw_directions[1] is original Direction 2

# Override 1: original Direction 1 Component 2 (remove loop at indices 4 to 10)
d1_comps = [comp[:] for comp in raw_directions[0].components]
c2 = d1_comps[1]
print(f"Original D1 C2 length: {len(c2)}")
d1_comps[1] = c2[:4] + c2[11:]
print(f"Modified D1 C2 length: {len(d1_comps[1])}")
raw_directions[0] = Direction(1, raw_directions[0].name, d1_comps)

# Override 2: original Direction 2 Component 1 (remove loop 1 at indices 1 to 56, and loop 2 at indices 70 to 77)
d2_comps = [comp[:] for comp in raw_directions[1].components]
c1 = d2_comps[0]
print(f"Original D2 C1 length: {len(c1)}")
# Remove indices 1 to 56: c1_temp = [c1[0]] + c1[57:]
c1_temp = [c1[0]] + c1[57:]
# Now c1_temp has indices: 0 (original 0) and 1..23 (original 57..79)
# Wait, original 70 to 77 are now at indices:
# original 70 is c1_temp[14] (since 70 - 56 = 14)
# original 77 is c1_temp[21] (since 77 - 56 = 21)
# Let's check coordinates:
# c1_temp[13] should be original 69
# c1_temp[14..21] is the loop
# c1_temp[22] is original 78
# c1_temp[23] is original 79
# Let's verify by printing c1_temp elements:
print("c1_temp coordinates:")
for idx, pt in enumerate(c1_temp):
    print(f"  {idx}: {pt}")

# So we want to keep c1_temp[:14] + c1_temp[22:]
d2_comps[0] = c1_temp[:14] + c1_temp[22:]
print(f"Modified D2 C1 length: {len(d2_comps[0])}")
raw_directions[1] = Direction(2, raw_directions[1].name, d2_comps)

# Now apply swap and reverse
dir1 = Direction(1, raw_directions[1].name, raw_directions[1].components)
dir2 = Direction(2, raw_directions[0].name, raw_directions[0].components)
directions = [dir1, dir2]

reversed_directions = []
for d in directions:
    rev_comps = []
    for comp in reversed(d.components):
        rev_comps.append(list(reversed(comp)))
    reversed_directions.append(Direction(d.index, d.name, rev_comps))
directions = reversed_directions

# Run snapping
actor = create_actor(ROOT / "geo-cache/valhalla/valhalla.json")
thresholds = QualityThresholds()

# Match and check both directions
for d in directions:
    print(f"\nSnapping Direction {d.index}:")
    for comp_idx, comp in enumerate(d.components):
        result = match_component(actor, comp, thresholds)
        print(f"  Component {comp_idx+1}: matched {len(result.coordinates)} points")
