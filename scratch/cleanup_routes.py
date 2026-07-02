import json
from pathlib import Path

ROOT = Path("c:/RutasMorelia")
ROUTES_DIR = ROOT / "apps" / "web" / "public" / "routes"

# Delete all geojson files except 79.geojson
count = 0
for file in ROUTES_DIR.glob("*.geojson"):
    if file.name != "79.geojson":
        file.unlink()
        count += 1

print(f"Deleted {count} geojson files (preserved 79.geojson).")

# Reset index.json to only contain route 79
index_path = ROUTES_DIR / "index.json"
if index_path.is_file():
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
        # Filter routes to keep only ID 79
        preserved_routes = [r for r in data.get("routes", []) if str(r.get("id")) == "79"]
        data["routes"] = preserved_routes
        index_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Reset index.json to preserve only route 79.")
    except Exception as e:
        print(f"Error resetting index.json: {e}")
