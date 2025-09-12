#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os, re, json, sys
from math import cos, radians

# === VSTUP/VÝSTUP (výchozí cesty – můžeš je přepsat argumenty) ===
MIDAXIS_JS = r"C:\Users\mspan\Desktop\demo_zony_app1\adminlte\dist\MIDAXIS.js"
FIXED_JS   = r"C:\Users\mspan\Desktop\demo_zony_app1\adminlte\dist\FIXED_GPS_MESH.js"
FOOT_JS    = r"C:\Users\mspan\Desktop\demo_zony_app1\adminlte\dist\MESH_FIXEDGPS_ANCHFOOTPRINT.js"

OUT_FIXED  = r"C:\Users\mspan\Desktop\demo_zony_app1\adminlte\dist\CORR_FIXED_GPS_MESH.js"
OUT_FOOT   = r"C:\Users\mspan\Desktop\demo_zony_app1\adminlte\dist\CORR_MESH_FIXEDGPS_ANCHFOOTPRINT.js"


# ---------- Pomocné parsování .js → JSON ----------
def strip_comments(s: str) -> str:
    s = re.sub(r'//.*?$', '', s, flags=re.MULTILINE)
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.DOTALL)
    return s

def js_value_from_assignment(text: str) -> str:
    # vezmi substring mezi prvním "=" a posledním ";"
    if "=" in text and ";" in text:
        start = text.index("=") + 1
        end = text.rfind(";")
        return text[start:end].strip()
    return text.strip()

def js_like_to_json(s: str) -> str:
    s = strip_comments(s).strip()
    s = js_value_from_assignment(s)

    # nahraď single quotes → double quotes
    s = re.sub(r"'", r'"', s)

    # přidej uvozovky k nequoted klíčům { key: ... } → { "key": ... }
    s = re.sub(r'([{\s,])([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', s)

    # true/false/null → JSON
    s = s.replace("undefined", "null").replace("NaN", "null")
    s = s.replace("Infinity", "null").replace("-Infinity", "null")
    s = re.sub(r'\btrue\b', 'true', s)
    s = re.sub(r'\bfalse\b', 'false', s)
    s = re.sub(r'\bnull\b', 'null', s)

    # odstraň závěrečné čárky před } ]
    s = re.sub(r',\s*([}\]])', r'\1', s)

    return s

def load_js_data(path: str):
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    js = js_like_to_json(raw)
    try:
        return json.loads(js)
    except json.JSONDecodeError as e:
        # přímo zkusit JSON uvnitř window.X = {...};
        # jako poslední pokus vyextrahuj nejdelší JSON blok mezi prvním { a posledním } / [ a ]
        raise RuntimeError(f"JSON parse fail for {path}: {e}\n--- snippet start ---\n{js[:500]}\n--- end ---")

# ---------- Geo nástroje (lokální metrické XY) ----------
EARTH_R = 6371000.0

def latlon_to_xy(lat, lon, lat0, lon0):
    x = (lon - lon0) * cos(radians(lat0)) * EARTH_R
    y = (lat - lat0) * EARTH_R
    return (x, y)

def xy_to_latlon(x, y, lat0, lon0):
    lat = y / EARTH_R + lat0
    lon = x / (EARTH_R * cos(radians(lat0))) + lon0
    return (lat, lon)

def nearest_project_on_polyline(pt_xy, line_xy, seg_labels):
    """Najde nejbližší projekci bodu na polyline a vrátí (proj_xy, dist2, idx_seg, label)."""
    px, py = pt_xy
    best = None
    for i in range(len(line_xy) - 1):
        ax, ay = line_xy[i]
        bx, by = line_xy[i+1]
        vx, vy = (bx - ax), (by - ay)
        wx, wy = (px - ax), (py - ay)
        denom = vx*vx + vy*vy
        t = 0.0 if denom == 0 else max(0.0, min(1.0, (wx*vx + wy*vy) / denom))
        qx, qy = (ax + t*vx, ay + t*vy)
        dx, dy = (px - qx), (py - qy)
        d2 = dx*dx + dy*dy
        if (best is None) or (d2 < best[1]):
            best = ((qx, qy), d2, i, seg_labels[i])
    return best  # (proj_xy, dist2, seg_index, label_at_segment_start)

# ---------- Čtení různých tvarů datasetů ----------
def read_midaxis_list(obj):
    """
    Očekává list: [{segment, lat, lon}, ...]
    """
    if not isinstance(obj, list):
        raise ValueError("MIDAXIS.js neobsahuje pole.")
    out = []
    for row in obj:
        if not isinstance(row, dict): 
            continue
        seg = row.get("segment") or row.get("SEGMENT")
        lat = row.get("lat") or row.get("LAT") or row.get("y") or row.get("Y")
        lon = row.get("lon") or row.get("LON") or row.get("LONG") or row.get("x") or row.get("X")
        try:
            lat = float(lat); lon = float(lon)
        except:
            continue
        out.append({"segment": str(seg), "lat": lat, "lon": lon})
    if len(out) < 2:
        raise ValueError("MIDAXIS má méně než 2 body – nelze projektovat.")
    return out

def read_mesh_points(obj):
    """
    Vrátí seznam: [{id, lat, lon, Segment? , ...raw}], a zároveň info o původní struktuře
    """
    pts = []
    structure = {"type": None}  # 'array' nebo 'object'
    if isinstance(obj, list):
        structure["type"] = "array"
        for idx, o in enumerate(obj):
            if not isinstance(o, dict): 
                continue
            lat = o.get("lat") or o.get("LAT") or o.get("y")
            lon = o.get("lon") or o.get("lng") or o.get("LONG") or o.get("LON") or o.get("x")
            if lat is None or lon is None:
                continue
            try:
                lat = float(lat); lon = float(lon)
            except:
                continue
            pid = o.get("id") or o.get("ID") or o.get("code") or idx
            seg = o.get("Segment") or o.get("segment")
            pts.append({"id": pid, "lat": lat, "lon": lon, "Segment": seg, "raw": o, "key": idx})
    elif isinstance(obj, dict):
        structure["type"] = "object"
        for k, o in obj.items():
            if not isinstance(o, dict): 
                continue
            lat = o.get("lat") or o.get("LAT") or o.get("y")
            lon = o.get("lon") or o.get("lng") or o.get("LONG") or o.get("LON") or o.get("x")
            if lat is None or lon is None:
                continue
            try:
                lat = float(lat); lon = float(lon)
            except:
                continue
            pid = o.get("id") or o.get("ID") or o.get("code") or k
            seg = o.get("Segment") or o.get("segment")
            pts.append({"id": pid, "lat": lat, "lon": lon, "Segment": seg, "raw": o, "key": k})
    else:
        raise ValueError("Neočekávaný tvar MESH dat (ani pole, ani objekt).")
    return pts, structure

def read_footprint_map(obj):
    """
    Vrátí kolekci položek: { key, id, lat, lon, Footprints, Segment, raw }
    a popis struktury (array/object) pro správný zápis zpět.
    """
    items, structure = [], {"type": None}
    if isinstance(obj, list):
        structure["type"] = "array"
        for idx, o in enumerate(obj):
            if not isinstance(o, dict): continue
            lat = o.get("lat") or o.get("LAT") or o.get("y")
            lon = o.get("lon") or o.get("lng") or o.get("LONG") or o.get("LON") or o.get("x")
            try:
                lat = float(lat); lon = float(lon)
            except:
                continue
            items.append({
                "key": idx,
                "id": o.get("id") or o.get("ID") or o.get("code") or idx,
                "lat": lat, "lon": lon,
                "Footprints": o.get("Footprints") or o.get("Footprint") or o.get("anchors") or [],
                "Segment": o.get("Segment") or o.get("segment"),
                "raw": o
            })
    elif isinstance(obj, dict):
        structure["type"] = "object"
        for k, o in obj.items():
            if not isinstance(o, dict): continue
            lat = o.get("lat") or o.get("LAT") or o.get("y")
            lon = o.get("lon") or o.get("lng") or o.get("LONG") or o.get("LON") or o.get("x")
            try:
                lat = float(lat); lon = float(lon)
            except:
                continue
            items.append({
                "key": k,
                "id": o.get("id") or o.get("ID") or o.get("code") or k,
                "lat": lat, "lon": lon,
                "Footprints": o.get("Footprints") or o.get("Footprint") or o.get("anchors") or [],
                "Segment": o.get("Segment") or o.get("segment"),
                "raw": o
            })
    else:
        raise ValueError("Neočekávaný tvar FOOTPRINT mapy.")
    return items, structure

# ---------- Zápis výstupních .js ----------
def write_corr_fixed(points_corr, out_path):
    """
    points_corr: [{id, lat, lon, Segment}]
    """
    arr = []
    for p in points_corr:
        arr.append({
            "id": p["id"],
            "lat": round(p["lat"], 8),
            "lon": round(p["lon"], 8),
            "Segment": p.get("Segment")
        })
    js = "// AUTO-GENERATED (centerline-projected)\nwindow.CORR_FIXED_GPS_MESH = " + json.dumps(arr, ensure_ascii=False, indent=2) + ";\n"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(js)

def write_corr_foot(items_corr, structure, out_path):
    """
    items_corr: [{key, id, lat, lon, Footprints, Segment}]
    """
    if structure["type"] == "array":
        out = []
        for it in items_corr:
            o = dict(it.get("raw", {}))  # zachovej další pole, ale přepíšeme lat/lon/Segment
            o["id"] = it["id"]
            o["lat"] = round(it["lat"], 8)
            o["lon"] = round(it["lon"], 8)
            # sjednoť název na Footprints
            o["Footprints"] = list(it.get("Footprints", []))
            o["Segment"] = it.get("Segment")
            out.append(o)
    else:  # object
        out = {}
        for it in items_corr:
            o = dict(it.get("raw", {}))
            o["id"] = it["id"]
            o["lat"] = round(it["lat"], 8)
            o["lon"] = round(it["lon"], 8)
            o["Footprints"] = list(it.get("Footprints", []))
            o["Segment"] = it.get("Segment")
            out[it["key"]] = o

    js = "// AUTO-GENERATED (centerline-projected)\nwindow.CORR_MESH_FIXEDGPS_ANCHFOOTPRINT = " + json.dumps(out, ensure_ascii=False, indent=2) + ";\n"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(js)

# ---------- Hlavní běh ----------
def main():
    # dovol přepsat cesty argumenty: midaxis, fixed, foot, out_fixed, out_foot
    midaxis = sys.argv[1] if len(sys.argv) >= 2 else MIDAXIS_JS
    fixed   = sys.argv[2] if len(sys.argv) >= 3 else FIXED_JS
    foot    = sys.argv[3] if len(sys.argv) >= 4 else FOOT_JS
    out_f   = sys.argv[4] if len(sys.argv) >= 5 else OUT_FIXED
    out_map = sys.argv[5] if len(sys.argv) >= 6 else OUT_FOOT

    print("[INFO] MIDAXIS:", midaxis)
    print("[INFO] FIXED:  ", fixed)
    print("[INFO] FOOTMAP:", foot)

    # načti datasety
    midaxis_raw = load_js_data(midaxis)
    fixed_raw   = load_js_data(fixed)
    foot_raw    = load_js_data(foot)

    axis = read_midaxis_list(midaxis_raw)
    mesh_pts, mesh_struct = read_mesh_points(fixed_raw)
    foot_items, foot_struct = read_footprint_map(foot_raw)

    # referenční bod (lokální projekce)
    lat0 = sum(p["lat"] for p in axis) / len(axis)
    lon0 = sum(p["lon"] for p in axis) / len(axis)

    axis_xy = [latlon_to_xy(p["lat"], p["lon"], lat0, lon0) for p in axis]
    seg_labels = [p["segment"] for p in axis]

    # 1) oprava FIXED_GPS_MESH
    corr_fixed = []
    for p in mesh_pts:
        p_xy = latlon_to_xy(p["lat"], p["lon"], lat0, lon0)
        (q_xy, d2, idx_seg, seg_label) = nearest_project_on_polyline(p_xy, axis_xy, seg_labels)
        q_lat, q_lon = xy_to_latlon(q_xy[0], q_xy[1], lat0, lon0)
        corr_fixed.append({
            "id": p["id"],
            "lat": q_lat,
            "lon": q_lon,
            "Segment": seg_label
        })

    # 2) oprava MESH_FIXEDGPS_ANCHFOOTPRINT (přepíšem jen lat/lon/Segment, Footprints zachováme)
    corr_foot = []
    for it in foot_items:
        p_xy = latlon_to_xy(it["lat"], it["lon"], lat0, lon0)
        (q_xy, d2, idx_seg, seg_label) = nearest_project_on_polyline(p_xy, axis_xy, seg_labels)
        q_lat, q_lon = xy_to_latlon(q_xy[0], q_xy[1], lat0, lon0)
        corr_foot.append({
            "key": it["key"],
            "id": it["id"],
            "lat": q_lat,
            "lon": q_lon,
            "Footprints": it["Footprints"],
            "Segment": seg_label,
            "raw": it["raw"]
        })

    # zápis
    write_corr_fixed(corr_fixed, out_f)
    write_corr_foot(corr_foot, foot_struct, out_map)

    print(f"[OK] CORR_FIXED_GPS_MESH → {out_f}")
    print(f"[OK] CORR_MESH_FIXEDGPS_ANCHFOOTPRINT → {out_map}")

if __name__ == "__main__":
    main()
