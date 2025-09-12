# build_cepro_glb.py
# Požadované balíčky: osmnx, geopandas, shapely, numpy, pyproj, trimesh, pandas

import os
import numpy as np
import pandas as pd
import geopandas as gpd
import osmnx as ox
from shapely.geometry import Polygon, MultiPolygon
from pyproj import Transformer
import trimesh
from shapely.geometry import LineString
from osmnx import features as ox_features, graph as ox_graph
from shapely.geometry import Polygon, MultiPolygon, LineString, box


# 1) Nastav "lokální rámec" – zvolíme referenční bod (střed areálu ČEPRO)
#    dosadíš vlastní (lat0, lon0) – cca uprostřed zájmové oblasti
lat0 = 50.044116475669576
lon0 = 15.07317131801285


# --- Vytvoř malý bbox kolem originu (např. 200 m na každou stranu) ---
dx = 200.0  # metry na východ/západ
dy = 200.0  # metry na sever/jih
m_per_deg_lat = 111320.0
m_per_deg_lon = 111320.0 * np.cos(np.radians(lat0))

dlat = dy / m_per_deg_lat
dlon = dx / m_per_deg_lon

south = lat0 - dlat
north = lat0 + dlat
west  = lon0 - dlon
east  = lon0 + dlon

# kontrola pořadí/hodnot
assert north > south and east > west, "bbox pořadí/hodnoty jsou špatně"

# --- polygon v pořadí (minx, miny, maxx, maxy) = (lon_w, lat_s, lon_e, lat_n)
poly_wgs84 = box(west, south, east, north)

# (volitelné) logy a timeouty
ox.settings.log_console = True
ox.settings.timeout = 180

# Lokální ENU (east, north, up) vůči (lat0, lon0) – použijeme projekci azimuthal equidistant (ETRS89)
# Pro malou oblast je to přesné a jednoduché.
proj_geo = "EPSG:4326"
proj_loc = f"+proj=aeqd +lat_0={lat0} +lon_0={lon0} +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
to_local = Transformer.from_crs(proj_geo, proj_loc, always_xy=True)

# --- 1) bbox správně (N, S, E, W) ---
# --- BBOX (OSMnx 2.x chce pořadí: N, S, E, W) ---
north = 50.044827365037605
south = 50.043469071229985
east  = 15.074222604864042   # východněji (větší)
west  = 15.071931382969396   # západněji (menší)

# tuple pro OSMnx
bbox = (north, south, east, west)

tags = {"building": True}
buildings = ox_features.features_from_polygon(poly_wgs84, tags)
G = ox_graph.graph_from_polygon(poly_wgs84, network_type="drive")
roads_gdf = ox.graph_to_gdfs(G, nodes=False, edges=True)


# 4) Vyrob 3D mesh budov (extruze footprintu)
def polygon_to_prism_mesh(poly: Polygon, height: float) -> trimesh.Trimesh:
    # půdorys do lokálních metrů
    x, y = poly.exterior.coords.xy
    X, Y = [], []
    for lon, lat in zip(x, y):
        ex, ny = to_local.transform(lon, lat)
        X.append(ex); Y.append(ny)
    # uzavřený polygon
    path = np.column_stack([X, Y])
    if not np.allclose(path[0], path[-1]):
        path = np.vstack([path, path[0]])

    # trimesh: extrude_polygon očekává shapely polygon v metrech
    poly_local = Polygon(path)
    if not poly_local.is_valid or poly_local.area <= 0:
        raise ValueError("Invalid/empty polygon")

    # extruze nahoru (height v metrech)
    mesh = trimesh.creation.extrude_polygon(poly_local, height)
    return mesh

def get_building_height(attrs) -> float:
    # OSM může mít 'height' nebo 'building:levels'; fallback 6 m
    h = attrs.get("height")
    if isinstance(h, str) and h.strip().endswith("m"):
        try:
            return float(h.strip()[:-1])
        except:
            pass
    try:
        return float(h)
    except:
        pass
    # levels * 3 m
    levels = attrs.get("building:levels")
    try:
        return float(levels) * 3.0
    except:
        return 6.0

meshes = []

for i, row in buildings.iterrows():
    geom = row.geometry
    if geom is None:
        continue
    h = get_building_height(row)
    try:
        if isinstance(geom, Polygon):
            meshes.append(polygon_to_prism_mesh(geom, h))
        elif isinstance(geom, MultiPolygon):
            for part in geom.geoms:
                meshes.append(polygon_to_prism_mesh(part, h))
    except Exception:
        # některé footprinty můžou být degenerované
        continue

# 5) Cesty: převeď na tenké „proužky“ (extruze polyline na nízký hranol)
def line_to_strip_mesh(line, width=4.0, height=0.2):
    # převod vrcholů do lokálních metrů
    coords_local = [to_local.transform(lon, lat) for lon, lat in np.array(line.coords)]
    ls_local = LineString(coords_local)
    poly = ls_local.buffer(width/2.0, cap_style=2, join_style=2)
    return trimesh.creation.extrude_polygon(poly, height)

for _, r in roads_gdf.iterrows():
    geom = r.geometry
    try:
        if geom is None:
            continue
        if geom.geom_type == "LineString":
            meshes.append(line_to_strip_mesh(geom))
        elif geom.geom_type == "MultiLineString":
            for seg in geom.geoms:
                meshes.append(line_to_strip_mesh(seg))
    except Exception:
        continue

# 6) Spoj vše do jedné scény a ulož jako GLB
scene = trimesh.Scene()
for m in meshes:
    # lehké šedé zbarvení v materiálu
    m.visual = trimesh.visual.ColorVisuals(m, vertex_colors=[200, 200, 200, 255])
    scene.add_geometry(m)

# Export GLB
out_glb = "cepro_scene.glb"
scene.export(out_glb)

# 7) Zapiš meta JSON pro JS (origin a jednoduché převody)
meta = {
    "origin": {"lat0": lat0, "lon0": lon0},
    "proj": "local aeqd (meters)",
}
pd.Series(meta).to_json("cepro_meta.json")
print(f"Exported: {out_glb}, meta: cepro_meta.json")
print("buildings:", len(buildings), "roads:", len(roads_gdf))
