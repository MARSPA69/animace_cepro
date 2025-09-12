import pandas as pd
import json
from datetime import datetime

# Cesty
input_file = r"C:\Users\mspan\Desktop\DATA_ADMINLTE_04062025\DATA_TEST_ENTRY_A.xlsx"
output_file = r"C:\Users\mspan\Desktop\RENDERERDATA.json"

# Načti data
df = pd.read_excel(input_file)

# Převod čárek na tečky a na float
df["LAT"] = df["LAT"].astype(str).str.replace(",", ".").astype(float)
df["LON"] = df["LON"].astype(str).str.replace(",", ".").astype(float)

# Funkce pro vytvoření ISO timestampu
def to_iso8601(row):
    # Pokud je datum objekt typu datetime
    if isinstance(row["DATE"], pd.Timestamp):
        date_str = row["DATE"].strftime("%Y-%m-%d")
    else:
        # např. "04.06.2025"
        date_str = datetime.strptime(row["DATE"], "%d.%m.%Y").strftime("%Y-%m-%d")

    # Pokud je čas objekt typu datetime.time
    if isinstance(row["TIME"], pd.Timestamp):
        time_str = row["TIME"].strftime("%H:%M:%S")
    else:
        time_str = str(row["TIME"])

    # Spoj a převeď do ISO formátu
    dt_obj = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M:%S")
    return dt_obj.strftime("%Y-%m-%dT%H:%M:%SZ")

# Aplikuj funkci
df["timestamp"] = df.apply(to_iso8601, axis=1)

# Připrav data do struktury
data = [
    {"timestamp": row["timestamp"], "lat": row["LAT"], "lng": row["LON"]}
    for _, row in df.iterrows()
]

# Ulož JSON
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("✅ Soubor RENDERERDATA.json byl úspěšně vytvořen.")
