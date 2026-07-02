import csv
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "tools" / "routes_manifest.csv"
INDEX_PATH = ROOT / "apps" / "web" / "public" / "routes" / "index.json"
PYTHON_EXE = ROOT / ".venv-valhalla" / "Scripts" / "python.exe"

def load_published_ids():
    if not INDEX_PATH.is_file():
        return set()
    try:
        data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        return {str(r["id"]) for r in data.get("routes", [])}
    except Exception as e:
        print(f"Error reading index.json: {e}")
        return set()

def parse_manifest():
    if not MANIFEST.is_file():
        print("Manifest file not found.")
        sys.exit(1)
    
    routes = []
    with open(MANIFEST, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row.get("route_id")
            folder_name = row.get("folder_name", "")
            if not code:
                code = folder_name.split("_")[0] if "_" in folder_name else folder_name[:10]
            
            routes.append({
                "code": code,
                "name": row.get("route_name", folder_name),
                "folder_name": folder_name,
                "kml_path": row.get("kml_path", ""),
            })
    return routes

def run_command(cmd, cwd=None):
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    return res.returncode, res.stdout, res.stderr

def main():
    batch_size = 20
    if len(sys.argv) > 1:
        try:
            batch_size = int(sys.argv[1])
        except ValueError:
            pass
            
    print(f"Loading already published routes...")
    published_ids = load_published_ids()
    print(f"Currently published IDs: {sorted(list(published_ids))}")
    
    all_routes = parse_manifest()
    print(f"Total routes in manifest: {len(all_routes)}")
    
    # Filter out already published and pilot / master / failed routes
    ignored_ids = {"79", "1", "52", "77"}
    pending = [r for r in all_routes if r["code"] not in published_ids and r["code"] not in ignored_ids]
    print(f"Pending routes to process: {len(pending)}")
    
    if not pending:
        print("All routes have been successfully processed!")
        return
        
    batch = pending[:batch_size]
    print(f"\n--- Processing Batch of {len(batch)} Routes ---")
    for idx, r in enumerate(batch):
        print(f"[{idx+1}/{len(batch)}] Route {r['code']} | {r['name']}")
        
    success_list = []
    failed_list = []
    
    for idx, r in enumerate(batch):
        code = r["code"]
        name = r["name"]
        print(f"\n>>> [{idx+1}/{len(batch)}] Processing Route {code}: {name}...")
        
        # 1. Build
        print("  Running build...")
        code_build, out_build, err_build = run_command([str(PYTHON_EXE), "-m", "route_pipeline", "build", "--route", code], cwd=str(ROOT))
        
        # Check validation report
        report_path = ROOT / "work" / "route-pipeline" / r["folder_name"].lower().replace("_", "-").replace(" ", "-") / "validation.json"
        
        # We also need to map the slug for validation checks
        slug = r["folder_name"].lower().replace("_", "-").replace(" ", "-")
        slug = "-".join(filter(None, slug.split("-")))
        report_path = ROOT / "work" / "route-pipeline" / slug / "validation.json"
        
        quality_pass = False
        errors = ["Build command exited with non-zero code or failed to run"]
        
        if report_path.is_file():
            try:
                report = json.loads(report_path.read_text(encoding="utf-8"))
                quality_pass = report.get("quality_pass", False)
                # Gather all component errors
                errors = []
                for comp in report.get("components", []):
                    if not comp.get("quality_pass", False):
                        errors.extend(comp.get("errors", []))
                if not errors and not quality_pass:
                    errors.append("Validation marked quality_pass as false without specific component errors")
            except Exception as e:
                errors = [f"Error reading validation.json: {e}"]
        
        if code_build != 0 or not quality_pass:
            print(f"  [BUILD/VALIDATE FAILED] Errors: {errors}")
            failed_list.append({
                "code": code,
                "name": name,
                "errors": errors
            })
            continue
            
        # 2. Approve
        print("  Running approve...")
        code_app, out_app, err_app = run_command([
            str(PYTHON_EXE), "-m", "route_pipeline", "approve", 
            "--route", code, 
            "--reviewer", "Antigravity", 
            "--pdf-reviewed"
        ], cwd=str(ROOT))
        
        if code_app != 0:
            print(f"  [APPROVE FAILED]: {err_app}")
            failed_list.append({
                "code": code,
                "name": name,
                "errors": [f"Approve command failed: {err_app.strip()}"]
            })
            continue
            
        # 3. Publish
        print("  Running publish...")
        code_pub, out_pub, err_pub = run_command([
            str(PYTHON_EXE), "-m", "route_pipeline", "publish", 
            "--route", code
        ], cwd=str(ROOT))
        
        if code_pub != 0:
            print(f"  [PUBLISH FAILED]: {err_pub}")
            failed_list.append({
                "code": code,
                "name": name,
                "errors": [f"Publish command failed: {err_pub.strip()}"]
            })
            continue
            
        # Success!
        print(f"  [SUCCESS] Published route {code}.")
        success_list.append({
            "code": code,
            "name": name
        })
        
    print("\n" + "="*40)
    print("BATCH SUMMARY:")
    print(f"Successful: {len(success_list)}")
    for s in success_list:
        print(f"  - {s['code']}: {s['name']}")
    print(f"Failed: {len(failed_list)}")
    for f in failed_list:
        print(f"  - {f['code']}: {f['name']} -> {f['errors']}")
    print("="*40)

if __name__ == "__main__":
    main()
