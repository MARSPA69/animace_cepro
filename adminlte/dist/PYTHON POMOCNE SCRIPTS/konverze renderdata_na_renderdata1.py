import json

# Cesty k souborům
input_path = r"C:\Users\mspan\Desktop\demo_zony_app1\RENDERERDATA.json"
output_path = r"C:\Users\mspan\Desktop\demo_zony_app1\RENDERERDATA1.json"

# Načti původní JSON
with open(input_path, "r", encoding="utf-8") as f:
    data = json.load(f)

# Zde můžeš případně upravit každý záznam (např. změna formátu timestamp atd.)
converted_data = []
for record in data:
    converted_data.append({
        "timestamp": record["timestamp"],
        "lat": record["lat"],
        "lng": record["lng"]
    })

# Ulož nový JSON
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(converted_data, f, indent=2)

print("Soubor byl úspěšně převeden a uložen jako RENDERERDATA1.json")
