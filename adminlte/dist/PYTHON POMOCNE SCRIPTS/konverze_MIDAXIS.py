#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys, os, json
from datetime import datetime
import pandas as pd

# === VÝCHOZÍ CESTY (použijí se, když nenecháš argumenty) ===
DEFAULT_IN  = r"C:\Users\mspan\Desktop\MIDAXIS.xlsx"
DEFAULT_OUT = r"C:\Users\mspan\Desktop\demo_zony_app1\adminlte\dist\MIDAXIS.js"

ALIAS_SEGMENT = ["SEGMENT", "Segment", "segment", "CODE", "Code", "code"]
ALIAS_LAT     = ["LAT", "Lat", "lat", "Y", "y"]
ALIAS_LON     = ["LON", "Lon", "lon", "LONG", "Long", "long", "X", "x"]

def pick_col(df, aliases):
    for name in aliases:
        if name in df.columns:
            return name
    return None

def to_float(x):
    if pd.isna(x):
        return None
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None

def load_xlsx(path, sheet=None):
    # Použij 0 = první list (NE None, to by vrátilo dict všech listů)
    sheet_name = 0 if sheet is None else sheet
    df = pd.read_excel(path, sheet_name=sheet_name)
    # Pro jistotu ošetři i případ, že by přesto přišel dict:
    if isinstance(df, dict):
        first_key = next(iter(df))
        df = df[first_key]
    # Zahodit úplně prázdné řádky
    df = df.dropna(how="all")
    return df

def dataframe_to_midaxis(df):
    seg_col = pick_col(df, ALIAS_SEGMENT)
    lat_col = pick_col(df, ALIAS_LAT)
    lon_col = pick_col(df, ALIAS_LON)

    missing = [n for n, c in [["SEGMENT", seg_col], ["LAT", lat_col], ["LON", lon_col]] if c is None]
    if missing:
        raise ValueError(
            "V souboru chybí povinné sloupce: " + ", ".join(missing) +
            f". Nalezené sloupce: {', '.join(map(str, df.columns))}"
        )

    out = []
    for _, row in df.iterrows():
        seg = row[seg_col]
        lat = to_float(row[lat_col])
        lon = to_float(row[lon_col])
        if seg is None or lat is None or lon is None:
            continue
        out.append({
            "segment": str(seg).strip(),
            "lat": float(f"{lat:.8f}"),
            "lon": float(f"{lon:.8f}"),
        })
    return out

def write_js(midaxis_list, out_path, source_path):
    banner = f"// AUTO-GENERATED from {os.path.basename(source_path)} on {datetime.utcnow().isoformat()}Z\n"
    js = banner + "window.MIDAXIS = " + json.dumps(midaxis_list, ensure_ascii=False, indent=2) + ";\n"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(js)

def main():
    in_path  = sys.argv[1] if len(sys.argv) >= 2 else DEFAULT_IN
    out_path = sys.argv[2] if len(sys.argv) >= 3 else DEFAULT_OUT

    print(f"[INFO] Vstup:  {in_path}")
    print(f"[INFO] Výstup: {out_path}")

    if not os.path.exists(in_path):
        print(f"[ERROR] Vstupní soubor neexistuje: {in_path}", file=sys.stderr)
        sys.exit(1)

    try:
        df = load_xlsx(in_path)
        print(f"[INFO] Nalezené sloupce: {list(df.columns)}")
        print(f"[INFO] Načteno řádků z Excelu: {len(df)}")

        items = dataframe_to_midaxis(df)
        print(f"[INFO] Validních řádků po filtru: {len(items)}")
        if not items:
            raise ValueError("Nevznikla žádná validní data (zkontroluj sloupce a prázdné řádky).")

        write_js(items, out_path, in_path)
        print(f"[OK]   Uloženo: {out_path}")
    except Exception as e:
        print("[ERROR]", e, file=sys.stderr)
        sys.exit(2)

if __name__ == "__main__":
    main()
