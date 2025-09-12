import pandas as pd
import json

# Cesty k souborům
input_excel = r"C:\Users\mspan\Desktop\Data do DEMOZONY\GNSS kotev.xlsx"
output_js = r"C:\Users\mspan\Desktop\Data do DEMOZONY\ANCHOR.js"

# Načtení Excel souboru
df = pd.read_excel(input_excel)

# Ošetření názvů sloupců
df.columns = [col.strip().upper() for col in df.columns]

# Přejmenování sloupců na požadovaný formát
df = df.rename(columns={
    'ANCHOR_NUMBER': 'anchorNumber',
    'LAT': 'lat',
    'LONG': 'lng'
})

# Výběr a převod na seznam slovníků
records = df[['anchorNumber', 'lat', 'lng']].to_dict(orient="records")

# Vytvoření JS souboru
js_content = "const ANCHOR = " + json.dumps(records, indent=2) + ";"

# Uložení do souboru
with open(output_js, "w", encoding="utf-8") as f:
    f.write(js_content)

print(f"Hotovo! Uloženo do: {output_js}")
