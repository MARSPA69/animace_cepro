import pandas as pd
import json
from datetime import datetime, time

# Cesty k souborům
input_excel = r"C:\Users\mspan\Desktop\22072025\GNSS_22072025.xlsx"
output_js = r"C:\Users\mspan\Desktop\demo_zony_app1\adminlte\dist\GNSS_22072025.js"

# Načtení Excel souboru
df = pd.read_excel(input_excel)

# Ošetření názvů sloupců
df.columns = [col.strip().upper() for col in df.columns]

# Základní datum – nastav dle datasetu
base_date = datetime(2025, 7, 22)   # pro GNSS_22072025

# Převod času na ISO formát s datem
def convert_time(t):
    if isinstance(t, str):
        t = datetime.strptime(t.strip(), "%H:%M:%S").time()
    elif isinstance(t, datetime):
        t = t.time()
    elif isinstance(t, time):
        pass  # už je to time objekt
    else:
        raise ValueError(f"Neznámý typ TIME: {t} ({type(t)})")
    return datetime.combine(base_date.date(), t)

df['timestamp'] = df['TIME'].apply(convert_time).apply(lambda dt: dt.isoformat() + "Z")
df['lat'] = df['LAT']
df['lng'] = df['LONG']

# Výběr a převod na seznam slovníků
records = df[['timestamp', 'lat', 'lng']].to_dict(orient="records")

# Vytvoření JS souboru – renderer očekává window.realData
js_content = "window.realData = " + json.dumps(records, indent=2) + ";"

# Uložení do souboru
with open(output_js, "w", encoding="utf-8") as f:
    f.write(js_content)

print(f"✅ Hotovo! Uloženo do: {output_js}")

