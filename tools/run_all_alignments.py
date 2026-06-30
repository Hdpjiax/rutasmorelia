import sys
import json
from pathlib import Path

# Add tools directory to path to import map_match_routes
sys.path.append(str(Path(__file__).resolve().parent))
import map_match_routes as mmr

def main():
    print("Fetching all routes from Supabase...", flush=True)
    all_routes = mmr.fetch_routes(None)
    print(f"Found {len(all_routes)} active validated routes.", flush=True)
    
    # Sort routes by route_id
    all_routes.sort(key=lambda r: r["route_id"])
    
    batch_size = 10
    total_routes = len(all_routes)
    
    # Initialize unified SQL list
    global_sql_statements = ["begin;"]
    global_features = []
    global_reports = []
    
    for i in range(0, total_routes, batch_size):
        batch = all_routes[i:i+batch_size]
        batch_ids = [r["route_id"] for r in batch]
        print(f"\n=== Processing Batch {i//batch_size + 1}: Routes {batch_ids} ===", flush=True)
        
        try:
            bbox = mmr.route_bbox(batch)
            cache_dir = mmr.DEFAULT_CACHE
            tile_size = 0.15
            
            print(f"  Fetching OSM roads for batch bbox: {bbox}...", flush=True)
            ways = mmr.fetch_roads(bbox, cache_dir, tile_size)
            
            center_lat = (bbox[0] + bbox[2]) / 2
            center_lon = (bbox[1] + bbox[3]) / 2
            
            print(f"  Building road index with {len(ways)} ways...", flush=True)
            road_index = mmr.RoadIndex(ways, center_lat, center_lon)
            
            print(f"  Aligning {len(batch)} routes...", flush=True)
            aligned = []
            for route in batch:
                print(f"    Aligning route {route['route_id']} ({route['routes']['name']})...", flush=True)
                aligned_geom, metrics = mmr.align_route(route, road_index, 30.0, 0.25)
                aligned.append((aligned_geom, metrics))
                
                status_str = "PASS" if metrics["quality_pass"] else "FAIL"
                print(f"      Snapped: {metrics['snapped_percent']}%, Gaps: {metrics['disconnected_transitions']}, Quality: {status_str}", flush=True)
                
                # Accumulate globally if it passed quality check
                if metrics["quality_pass"]:
                    statement = (
                        "update public.route_variants set "
                        f"geometry={mmr.geometry_sql(aligned_geom)},"
                        f"alignment_metadata={mmr.dollar_json(metrics)}::jsonb,alignment_updated_at=now() "
                        f"where id={int(route['id'])} and source_geometry is not null;"
                    )
                    global_sql_statements.append(statement)
                
                global_reports.append({"variant_id": route["id"], "route_id": route["route_id"], "name": route["routes"]["name"], **metrics})
                global_features.append({"type": "Feature", "properties": global_reports[-1], "geometry": aligned_geom})
                
            # Write output directory for this batch
            batch_output_dir = mmr.ROOT / f"geo-cache/batch-{batch_ids[0]:03d}-{batch_ids[-1]:03d}"
            print(f"  Writing outputs to {batch_output_dir.name}...", flush=True)
            mmr.write_outputs(batch, aligned, batch_output_dir)
            
        except Exception as e:
            print(f"  Error processing batch: {e}", flush=True)
            
    # Write unified outputs
    global_sql_statements.append("commit;")
    matched_dir = mmr.ROOT / "geo-cache/matched"
    matched_dir.mkdir(parents=True, exist_ok=True)
    
    print("\nWriting unified output files to geo-cache/matched...", flush=True)
    (matched_dir / "apply_all_matched_routes.sql").write_text("\n".join(global_sql_statements), encoding="utf-8")
    (matched_dir / "all_matched_routes.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": global_features}, ensure_ascii=False), encoding="utf-8"
    )
    (matched_dir / "all_alignment_report.json").write_text(json.dumps(global_reports, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Done!", flush=True)

if __name__ == "__main__":
    main()
