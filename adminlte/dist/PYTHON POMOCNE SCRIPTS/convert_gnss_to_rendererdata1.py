import pandas as pd
import json
from datetime import datetime

# Cesty k souborům
input_excel = r"C:\Users\mspan\Desktop\Data do DEMOZONY\RENDERDATA10_FBMGPS.xlsx"
output_js = r"C:\Users\mspan\Desktop\Data do DEMOZONY\RENDERERDATA10.js"

# Načtení Excel souboru
df = pd.read_excel(input_excel)

# Ošetření názvů sloupců
df.columns = [col.strip().upper() for col in df.columns]

# Základní datum (možno upravit podle potřeby)
base_date = datetime(2025, 6, 4)

# Převod času na ISO formát s datem
def convert_time(t):
    if isinstance(t, str):
        t = datetime.strptime(t.strip(), "%H:%M:%S").time()
    return datetime.combine(base_date.date(), t)

df['timestamp'] = df['TIME'].apply(convert_time).apply(lambda dt: dt.isoformat() + "Z")
df['lat'] = df['LAT']
df['lng'] = df['LONG']

# Výběr a převod na seznam slovníků
records = df[['timestamp', 'lat', 'lng']].to_dict(orient="records")

# Vytvoření JS souboru
js_content = "const RENDERERDATA5 = " + json.dumps(records, indent=2) + ";"

# Uložení do souboru
with open(output_js, "w", encoding="utf-8") as f:
    f.write(js_content)

print(f"Hotovo! Uloženo do: {output_js}")
