import pandas as pd
from pathlib import Path

# ----- VSTUP / VÝSTUP -----
INPUT_XLSX = r"C:\Users\mspan\Desktop\BASIC_TABLE.xlsx"
OUTPUT_JS  = r"C:\Users\mspan\Desktop\demo_zony_app1\adminlte\dist\BASIC_TABLE_04062025.js"
CONST_NAME = "BASIC_TABLE_04062025"

# ----- ČTENÍ -----
df = pd.read_excel(INPUT_XLSX, dtype=str)  # čteme jako text, typy převedeme sami

# Očekávané zdrojové názvy sloupců
expected_cols = ["TIME","SPEED","X","Y","Z","KOTVA1","KOTVA2","KOTVA3","KOTVA4","KOTVA5","KOTVA6"]
# Normalizace názvů sloupců (odstraní mezery, sjednotí velikost písmen)
df.columns = [str(c).strip().upper() for c in df.columns]

# Zajistíme existenci všech sloupců
for c in expected_cols:
    if c not in df.columns:
        df[c] = None

# Ponecháme jen potřebné sloupce a jejich pořadí
df = df[expected_cols]

# TIME: ponecháme jako řetězec (HH:MM:SS)
df["TIME"] = df["TIME"].astype(str).str.strip()

# Numerické sloupce – koerce na číslo, chyby -> NaN
num_cols = ["SPEED","X","Y","Z","KOTVA1","KOTVA2","KOTVA3","KOTVA4","KOTVA5","KOTVA6"]
for c in num_cols:
    df[c] = pd.to_numeric(df[c].astype(str).str.replace(",", "."), errors="coerce")

# Slučování duplicitních TIME:
# - použijeme agregaci "max" po vyplnění NaN nulou (prakticky „první nenulová“,
#   a když jsou dvě hodnoty, vezme vyšší; to je OK pro slučování akcelerometru+kotvy)
df_agg = (
    df.assign(**{c: df[c].fillna(0) for c in num_cols})
      .groupby("TIME", as_index=False)[["SPEED","X","Y","Z","KOTVA1","KOTVA2","KOTVA3","KOTVA4","KOTVA5","KOTVA6"]]
      .max()
)

# Převod NaN -> 0 (pro jistotu) a typy
df_agg = df_agg.fillna(0)

# SPEED necháme float (např. 0.976996), ostatní zaokrouhlíme na int
int_cols = ["X","Y","Z","KOTVA1","KOTVA2","KOTVA3","KOTVA4","KOTVA5","KOTVA6"]
for c in int_cols:
    df_agg[c] = df_agg[c].round().astype(int)

# Přejmenování KOTVA -> ANCHOR
df_agg = df_agg.rename(columns={
    "KOTVA1":"ANCHOR1",
    "KOTVA2":"ANCHOR2",
    "KOTVA3":"ANCHOR3",
    "KOTVA4":"ANCHOR4",
    "KOTVA5":"ANCHOR5",
    "KOTVA6":"ANCHOR6",
})

# Pořadí výstupních sloupců
out_cols = ["TIME","SPEED","X","Y","Z","ANCHOR1","ANCHOR2","ANCHOR3","ANCHOR4","ANCHOR5","ANCHOR6"]
df_agg = df_agg[out_cols].copy()

# Převedeme na pole objektů (list of dicts)
records = df_agg.to_dict(orient="records")

# Sestavení JS souboru
# Výstup bude: const BASIC_TABLE_04062025 = [ {...}, {...}, ... ];
def to_js_value(v):
    # Řetězce dáme do uvozovek, čísla necháme bez uvozovek
    if isinstance(v, str):
        # Escapování backslashů a uvozovek
        v = v.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{v}"'
    return str(v)

lines = []
lines.append(f"const {CONST_NAME} = [")
for rec in records:
    parts = []
    for k in out_cols:
        parts.append(f'{k}: {to_js_value(rec[k])}')
    lines.append("  { " + ", ".join(parts) + " },")
lines.append("];")
js_text = "\n".join(lines)

# Zápis na disk
Path(OUTPUT_JS).parent.mkdir(parents=True, exist_ok=True)
with open(OUTPUT_JS, "w", encoding="utf-8") as f:
    f.write(js_text)

print(f"Hotovo. Vytvořeno: {OUTPUT_JS} (proměnná {CONST_NAME})")
