import os
import re
import pypdf
import collections
import math

def get_resolved(obj):
    if isinstance(obj, pypdf.generic.IndirectObject):
        return get_resolved(obj.get_object())
    if isinstance(obj, pypdf.generic.DictionaryObject):
        return {k: get_resolved(v) for k, v in obj.items()}
    if isinstance(obj, pypdf.generic.ArrayObject):
        return [get_resolved(v) for v in obj]
    return obj

def simplify_points(pts, min_dist=0.00003): # ~3 meters in degrees
    if not pts:
        return []
    simplified = [pts[0]]
    for pt in pts[1:]:
        last = simplified[-1]
        dist = math.sqrt((pt[0] - last[0])**2 + (pt[1] - last[1])**2)
        if dist >= min_dist:
            simplified.append(pt)
    if len(simplified) < 2 and len(pts) >= 2:
        simplified.append(pts[-1])
    return simplified

def parse_pdf_route(pdf_path):
    reader = pypdf.PdfReader(pdf_path)
    page = reader.pages[0]
    
    vp_list = page.get('/VP')
    if not vp_list:
        return None
        
    vp = vp_list[0].get_object()
    bbox = vp['/BBox']  # [xmin, ymin, xmax, ymax]
    measure = vp['/Measure'].get_object()
    gpts = measure['/GPTS']  # [lat0, lng0, lat1, lng1, ... ]
    lpts = measure['/LPTS']
    
    xmin, ymin, xmax, ymax = bbox[0], bbox[1], bbox[2], bbox[3]
    if ymin > ymax:
        ymin, ymax = ymax, ymin
        
    lng_min = min(gpts[1], gpts[3], gpts[5], gpts[7])
    lng_max = max(gpts[1], gpts[3], gpts[5], gpts[7])
    lat_min = min(gpts[0], gpts[2], gpts[4], gpts[6])
    lat_max = max(gpts[0], gpts[2], gpts[4], gpts[6])
    
    def page_to_gps(x, y):
        u = (x - xmin) / (xmax - xmin)
        v = (ymax - y) / (ymax - ymin)
        
        lng = lng_min + u * (lng_max - lng_min)
        lat = lat_max - v * (lat_max - lat_min)
        return lng, lat

    contents = page["/Contents"].get_object()
    if isinstance(contents, pypdf.generic.ArrayObject):
        data = b"".join(item.get_object().get_data() for item in contents)
    else:
        data = contents.get_data()
        
    data_str = data.decode('utf-8', errors='ignore')
    tokens = data_str.split()
    
    paths = []
    current_subpath = []
    current_color = "0 0 0"
    
    i = 0
    n = len(tokens)
    while i < n:
        t = tokens[i]
        if t == "RG" or t == "rg":
            current_color = f"{tokens[i-3]} {tokens[i-2]} {tokens[i-1]}"
        elif t == "m":
            if current_subpath:
                paths.append((current_color, current_subpath))
            try:
                current_subpath = [(float(tokens[i-2]), float(tokens[i-1]))]
            except (ValueError, IndexError):
                current_subpath = []
        elif t == "l":
            try:
                current_subpath.append((float(tokens[i-2]), float(tokens[i-1])))
            except (ValueError, IndexError):
                pass
        elif t in ["S", "s", "f", "F", "b", "B"]:
            if current_subpath:
                paths.append((current_color, current_subpath))
                current_subpath = []
        i += 1
        
    paths_by_color = collections.defaultdict(list)
    for color, path in paths:
        is_border = False
        if len(path) == 5:
            xs = [x for x, y in path]
            ys = [y for x, y in path]
            if min(xs) <= xmin + 1 and max(xs) >= xmax - 1 and min(ys) <= ymin + 1 and max(ys) >= ymax - 1:
                is_border = True
        
        if not is_border:
            paths_by_color[color].append(path)
            
    route_color = None
    max_points = 0
    
    for color, paths_list in paths_by_color.items():
        try:
            parts = [float(c) for c in color.split()]
        except ValueError:
            continue
            
        if len(parts) == 3:
            r, g, b = parts
            if r > 0.95 and g > 0.95 and b > 0.95:
                continue
            if r > 0.9 and g < 0.15 and b < 0.15:
                continue
            if abs(r - g) < 0.08 and abs(g - b) < 0.08:
                continue
                
            total_pts = sum(len(p) for p in paths_list)
            if total_pts > max_points:
                max_points = total_pts
                route_color = color
                
    if not route_color:
        for color, paths_list in paths_by_color.items():
            total_pts = sum(len(p) for p in paths_list)
            if total_pts > max_points:
                max_points = total_pts
                route_color = color
                
    if not route_color:
        return None
        
    route_segments = paths_by_color[route_color]
    filtered_segments = []
    for seg in route_segments:
        if len(seg) < 3:
            if len(seg) == 2:
                dx = seg[1][0] - seg[0][0]
                dy = seg[1][1] - seg[0][1]
                dist = math.sqrt(dx*dx + dy*dy)
                if dist < 30:
                    continue
        filtered_segments.append(seg)
        
    if not filtered_segments:
        return None
        
    chained = list(filtered_segments[0])
    remaining = filtered_segments[1:]
    
    while remaining:
        current_end = chained[-1]
        best_idx = -1
        best_dist = float('inf')
        reverse_it = False
        
        for idx, seg in enumerate(remaining):
            d_start = math.sqrt((seg[0][0] - current_end[0])**2 + (seg[0][1] - current_end[1])**2)
            d_end = math.sqrt((seg[-1][0] - current_end[0])**2 + (seg[-1][1] - current_end[1])**2)
            
            if d_start < best_dist:
                best_dist = d_start
                best_idx = idx
                reverse_it = False
            if d_end < best_dist:
                best_dist = d_end
                best_idx = idx
                reverse_it = True
                
        if best_idx != -1:
            seg = remaining.pop(best_idx)
            if reverse_it:
                chained.extend(reversed(seg))
            else:
                chained.extend(seg)
        else:
            break
            
    gps_coords = [page_to_gps(x, y) for x, y in chained]
    simplified_coords = simplify_points(gps_coords, min_dist=0.00003)
    
    try:
        parts = [float(c) for c in route_color.split()]
        if len(parts) == 3:
            hex_color = "#{:02x}{:02x}{:02x}".format(int(parts[0]*255), int(parts[1]*255), int(parts[2]*255))
        else:
            hex_color = "#FFA500"
    except Exception:
        hex_color = "#FFA500"
        
    return {
        "color": hex_color,
        "coords": simplified_coords
    }

def clean_name(filename):
    name = os.path.splitext(filename)[0]
    return name.strip()

def clean_code(name, transport_type):
    sanitized = re.sub(r'[^a-zA-Z0-9\s-]', '', name)
    sanitized = sanitized.upper().replace(' ', '_').replace('-', '_')
    return f"{transport_type.upper()}_{sanitized}"[:50]

def main():
    folders = [
        ("01_RUTAS_DE_COMBI", "combi"),
        ("02_RUTAS_DE_AUTOBUSES_FORANEOS", "bus")
    ]
    
    sql_statements = []
    sql_statements.append("-- Generated routes import script")
    sql_statements.append("BEGIN;")
    
    total_processed = 0
    total_imported = 0
    
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    
    for folder_rel, t_type in folders:
        folder_path = os.path.join(root_dir, folder_rel)
        print(f"Processing folder: {folder_path} ({t_type})")
        if not os.path.exists(folder_path):
            print(f"Directory {folder_path} does not exist!")
            continue
            
        for fname in os.listdir(folder_path):
            if not fname.lower().endswith('.pdf'):
                continue
                
            # Skip general maps
            if "transporte" in fname.lower() and "público" in fname.lower():
                print(f"Ignoring general map file: {fname}")
                continue
                
            pdf_path = os.path.join(folder_path, fname)
            total_processed += 1
            
            try:
                result = parse_pdf_route(pdf_path)
                if not result or not result["coords"]:
                    print(f"Skipped {fname} - No geometry found")
                    continue
                    
                name = clean_name(fname)
                code = clean_code(name, t_type)
                color = result["color"]
                coords = result["coords"]
                
                coord_str = ", ".join(f"{lng:.6f} {lat:.6f}" for lng, lat in coords)
                linestring = f"LINESTRING({coord_str})"
                
                sql_statements.append(f"""
-- Route: {name}
INSERT INTO public.routes (city_id, source_id, code, name, color, transport_type, validation_status)
VALUES (1, 2, '{code}', '{name}', '{color}', '{t_type}', 'validated')
ON CONFLICT (city_id, code) DO UPDATE 
SET color = EXCLUDED.color, name = EXCLUDED.name, validation_status = 'validated';

INSERT INTO public.route_variants (route_id, name, direction, geometry, is_primary)
VALUES (
  (SELECT id FROM public.routes WHERE code = '{code}' AND city_id = 1),
  'Principal', 0,
  extensions.st_geomfromtext('{linestring}', 4326),
  true
)
ON CONFLICT (route_id, name, direction) DO UPDATE 
SET geometry = EXCLUDED.geometry;
""")
                total_imported += 1
                
            except Exception as e:
                print(f"Error processing {fname}: {e}")
                
    sql_statements.append("COMMIT;")
    sql_content = "\n".join(sql_statements)
    
    sql_file_path = os.path.join(root_dir, "import_routes.sql")
    with open(sql_file_path, "w", encoding="utf-8") as f:
        f.write(sql_content)
        
    print(f"Successfully generated {sql_file_path}")
    print(f"Total processed: {total_processed}, Successfully imported: {total_imported}")

if __name__ == "__main__":
    main()
