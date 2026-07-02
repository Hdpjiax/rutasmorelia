import os
import csv

manifest_path = "c:/RutasMorelia/tools/routes_manifest.csv"
if os.path.exists(manifest_path):
    with open(manifest_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("code") == "46":
                print(f"Route 46 KML path: {row.get('kml')}")
                print(f"Slug: {row.get('slug')}")
else:
    print("Manifest does not exist at", manifest_path)
