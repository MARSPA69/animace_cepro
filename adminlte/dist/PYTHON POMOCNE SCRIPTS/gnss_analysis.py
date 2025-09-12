# gnss_analysis.py
# -*- coding: utf-8 -*-
"""
Krok 1 – analýza jen z GNSS.
Vytvoří JSONL log segmentů s popisem změn jízdy / chůze.

Vstup:  Podklad_analyza_GNSS_04062025.xlsx  (TIME, lat, lon, speed …)
Výstup: gnss_events.jsonl                   (řádek = jeden úsek)

Autor: 28 Jul 2025
"""
import json, math
from pathlib import Path

import numpy as np
import pandas as pd

# ------------ CESTY K SOUBORŮM ------------------------------------------
GNSS_PATH   = r"C:\Users\mspan\Desktop\Podklad_analyza_GNSS_04062025.xlsx"
OUTPUT_PATH = r"C:\Users\mspan\Desktop\gnss_events.jsonl"


# ------------ PARAMETRY PRAHŮ -------------------------------------------
TURN_SLOW     = 10   # °/s
TURN_FAST     = 30   # °/s
JERK_SMOOTH   = 0.2  # m/s³
JERK_UNEVEN   = 1.0  # m/s³
SPEED_STOP    = 0.2  # m/s
GRADE_MILD    = 0.02 # 2 %
GRADE_STEEP   = 0.06 # 6 %
R_EARTH       = 6371000  # m

# ========================================================================
def haversine(lat1, lon1, lat2, lon2):
    dlat, dlon = map(math.radians, (lat2 - lat1, lon2 - lon1))
    lat1, lat2 = map(math.radians, (lat1, lat2))
    a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 2*R_EARTH*math.asin(math.sqrt(a))

def bearing(lat1, lon1, lat2, lon2):
    y = math.sin(math.radians(lon2 - lon1))*math.cos(math.radians(lat2))
    x = (math.cos(math.radians(lat1))*math.sin(math.radians(lat2))
         - math.sin(math.radians(lat1))*math.cos(math.radians(lat2))
         * math.cos(math.radians(lon2 - lon1)))
    ang = math.degrees(math.atan2(y, x))
    return (ang + 360) % 360      # 0-360

def ang_diff(a, b):                     # krátká podepsaná odchylka
    return ((b - a + 180) % 360) - 180

# ------------ KLASIFIKAČNÍ PRAVIDLA --------------------------------------
def dir_label(dh):                  # doprava / doleva / rovně
    return "straight" if abs(dh) < 10 else ("right" if dh > 0 else "left")

def turn_style(rate):
    rate = abs(rate)
    if rate < TURN_SLOW:  return "slow"
    if rate < TURN_FAST:  return "fast"
    return "sharp"

def motion_state(speed, jerk):
    if speed < SPEED_STOP:                    return "stop"
    if speed < 0:                             return "reverse"
    if abs(jerk) < JERK_SMOOTH:               return "forward_smooth"
    if abs(jerk) < JERK_UNEVEN:               return "forward_uneven"
    return "forward_jerky"

def slope_state(grade):
    if abs(grade) < GRADE_MILD:               return "flat"
    tag = "uphill_" if grade > 0 else "downhill_"
    return tag + ("mild" if abs(grade) < GRADE_STEEP else "steep")

# ========================================================================
def load_gnss(path: str) -> pd.DataFrame:
    df = pd.read_excel(path, decimal=",")
    df = df.rename(columns={
        "TIME": "timestamp",
        "TIMESTAMP": "timestamp",
        "REF GNSS LAT": "lat",
        "REF GNSS LONG": "lon",
        "Real speed (m/s)": "speed",
        "SPEED (m/s)": "speed",
    })
    df["timestamp"] = pd.to_datetime(df["timestamp"].astype(str), errors="coerce")
    df = df[["timestamp", "lat", "lon", "speed"]].dropna().sort_values("timestamp")
    return df.reset_index(drop=True)

def enrich(df: pd.DataFrame) -> pd.DataFrame:
    # Δt
    df["dt"] = df["timestamp"].diff().dt.total_seconds().fillna(1.0)

    # bearing & distance
    bearings, dists = [0.0], [0.0]
    for i in range(1, len(df)):
        lat1, lon1 = df.loc[i-1, ["lat", "lon"]]
        lat2, lon2 = df.loc[i,   ["lat", "lon"]]
        bearings.append(bearing(lat1, lon1, lat2, lon2))
        dists.append(haversine(lat1, lon1, lat2, lon2))
    df["bearing"]  = bearings
    df["dist"]     = dists

    # derivační veličiny
    df["dhdg"]     = df["bearing"].diff().apply(lambda x: ang_diff(0, x)).fillna(0)
    df["ang_rate"] = df["dhdg"] / df["dt"]
    df["acc"]      = df["speed"].diff() / df["dt"]
    df["jerk"]     = df["acc"].diff() / df["dt"]
    df[["acc", "jerk"]] = df[["acc", "jerk"]].fillna(0)

    # bez výšky → grade = 0
    df["grade"]    = 0.0

    # kategorizace
    df["direction"]    = df["dhdg"].apply(dir_label)
    df["turn_style"]   = df["ang_rate"].apply(turn_style)
    df["motion_state"] = df.apply(lambda r: motion_state(r["speed"], r["jerk"]), axis=1)
    df["slope_state"]  = df["grade"].apply(slope_state)
    return df

def segment_events(df: pd.DataFrame):
    keys = ["direction", "turn_style", "motion_state", "slope_state"]
    prev = {k: df.loc[0, k] for k in keys}
    seg_start = 0
    events = []

    for i in range(1, len(df)):
        changed = any(df.loc[i, k] != prev[k] for k in keys)
        if changed:
            events.append(build_event(df, seg_start, i-1, prev))
            seg_start = i
            prev = {k: df.loc[i, k] for k in keys}
    events.append(build_event(df, seg_start, len(df)-1, prev))
    return events

def build_event(df, i0, i1, lbls):
    start = df.loc[i0]
    end   = df.loc[i1]
    return {
        "start_time": start["timestamp"].isoformat(),
        "end_time":   end["timestamp"].isoformat(),
        "start_lat":  float(start["lat"]),
        "start_lon":  float(start["lon"]),
        "end_lat":    float(end["lat"]),
        "end_lon":    float(end["lon"]),
        "duration_s": float((end["timestamp"]-start["timestamp"]).total_seconds()),
        "distance_m": float(df.loc[i0:i1, "dist"].sum()),
        **lbls
    }

# ========================================================================
def main():
    print("▶  Loading GNSS …")
    df = load_gnss(GNSS_PATH)
    if df.empty:
        raise RuntimeError("GNSS file is empty or columns not recognised.")

    print("▶  Computing features …")
    df = enrich(df)

    print("▶  Segmenting events …")
    events = segment_events(df)

    print(f"▶  Writing {len(events)} events → {OUTPUT_PATH}")
    out = Path(OUTPUT_PATH)
    with out.open("w", encoding="utf-8") as f:
        for ev in events:
            json.dump(ev, f, ensure_ascii=False)
            f.write("\n")
    print("✓  Done.")

if __name__ == "__main__":
    main()
