#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import math
from pathlib import Path

import pandas as pd

# === CESTY (případně uprav) ===
INPUT_XLSX = r"C:\Users\mspan\Desktop\ANCHORID_TO_COMPASSANGLE.xlsx"
OUTPUT_JS  = r"C:\Users\mspan\Desktop\Data do DEMOZONY\ANCHORID_TO_COMPASSANGLE.js"

# === KONFIG ===
ANGLE_TOLERANCE = 15  # ± tolerance v ° kolem středového kompasového úhlu

# --- Pomoc: normalizace názvů sloupců ---
def norm(s: str) -> str:
    return (s or "").strip().lower()

# --- Najdi názvy sloupců tolerantně ---
def resolve_columns(df: pd.DataFrame):
    cols = {norm(c): c for c in df.columns}

    def pickup(*cands):
        for cand in cands:
            k = norm(cand)
            if k in cols:
                return cols[k]
        # fallback: najdi dle "startswith" z kandidátů
        for raw in df.columns:
            n = norm(raw)
            if any(n.startswith(norm(c)) for c in cands):
                return raw
        raise KeyError(f"Sloupec {cands} nebyl v Excelu nalezen. Nalezené sloupce: {list(df.columns)}")

    col_code   = pickup("code")
    col_seq    = pickup("posloupnost - trend v pořadí kotev by id", "sequence", "posloupnost")
    col_angle  = pickup("compass angle in grades +/- 15 grades", "compass angle", "angle")
    col_card   = pickup("cardinal direction", "direction", "cardinal")

    return col_code, col_seq, col_angle, col_card

# --- Parse sekvence "41,42,9,..." -> [41,42,9,...] ---
def parse_sequence(val) -> list[int]:
    if pd.isna(val):
        return []
    # povol nechtěné znaky (mezery, tečky, středníky), rozdělení primárně čárkou
    raw = str(val).replace(";", ",")
    parts = [p.strip() for p in raw.split(",") if p.strip() != ""]
    seq = []
    for p in parts:
        # odstraň případné závorky / text
        p2 = "".join(ch for ch in p if ch.isdigit() or ch == "-")
        if p2 == "" or p2 == "-":
            continue
        try:
            seq.append(int(p2))
        except ValueError:
            # ignoruj nečíselné úlomky
            continue
    return seq

# --- normalizace směru (Cardinal) ---
def norm_cardinal(s):
    s = (s or "").strip().upper()
    # sjednoť formy (např. "W-N-W" -> "WNW")
    s = s.replace("-", "")
    return s

# --- wrap úhlu do 0–359 ---
def wrap_deg(a: float) -> float:
    a = a % 360
    if a < 0:
        a += 360
    return a

def main():
    # Načti Excel
    df = pd.read_excel(INPUT_XLSX)

    col_code, col_seq, col_angle, col_card = resolve_columns(df)

    rows = []
    for _, r in df.iterrows():
        code = r[col_code]
        seq  = parse_sequence(r[col_seq])
        if pd.isna(r[col_angle]):
            continue
        try:
            angle = float(r[col_angle])
        except Exception:
            continue
        cardinal = norm_cardinal(r[col_card])

        min_deg = wrap_deg(angle - ANGLE_TOLERANCE)
        max_deg = wrap_deg(angle + ANGLE_TOLERANCE)

        rows.append({
            "code": int(code) if pd.notna(code) and str(code).isdigit() else code,
            "sequence": seq,
            "sequenceKey": "-".join(str(x) for x in seq),
            "compass_deg": round(angle, 6),
            "min_deg": round(min_deg, 6),
            "max_deg": round(max_deg, 6),
            "direction": cardinal
        })

    # Sestav mapu pro rychlé lookupy podle sekvence
    by_seq = {row["sequenceKey"]: {
        "code": row["code"],
        "compass_deg": row["compass_deg"],
        "min_deg": row["min_deg"],
        "max_deg": row["max_deg"],
        "direction": row["direction"]
    } for row in rows if row["sequenceKey"]}

    # JS šablona (ES module)
    js = """// AUTO-GENERATED from ANCHORID_TO_COMPASSANGLE.xlsx
// Generation parameters: ANGLE_TOLERANCE = %(tol)d

export const ANCHOR_TO_COMPASS_TABLE = %(table)s;

export const ANCHOR_TO_COMPASS_BY_SEQUENCE = %(byseq)s;

/**
 * Najde kompasový směr/úhel pro danou sekvenci kotev.
 * @param {number[]} seq - např. [41,42,9,43,10,47]
 * @returns {{code:any, compass_deg:number, min_deg:number, max_deg:number, direction:string}|null}
 */
export function findCompassForSequence(seq) {
  if (!Array.isArray(seq) || seq.length === 0) return null;
  const key = seq.join("-");
  return ANCHOR_TO_COMPASS_BY_SEQUENCE[key] ?? null;
}
""" % {
        "tol": ANGLE_TOLERANCE,
        "table": json.dumps(rows, ensure_ascii=False, indent=2),
        "byseq": json.dumps(by_seq, ensure_ascii=False, indent=2)
    }

    Path(OUTPUT_JS).parent.mkdir(parents=True, exist_ok=True)
    Path(OUTPUT_JS).write_text(js, encoding="utf-8")

    print(f"✅ Hotovo. Vytvořen soubor: {OUTPUT_JS}")
    print(f"Počet záznamů: {len(rows)}")
    if len(rows) == 0:
        print("⚠️ Upozornění: Nebyly načteny žádné validní řádky. Zkontroluj názvy sloupců a hodnoty v Excelu.")

if __name__ == "__main__":
    main()
