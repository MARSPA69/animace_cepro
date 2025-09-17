import os
import json
from dotenv import load_dotenv
from anthropic import Anthropic
from usage_tracker import ask_claude


# Načíst .env soubor
load_dotenv("C:/Users/mspan/Desktop/demo_zony_app1/.env")

api_key = os.getenv("ANTHROPIC_API_KEY")
print("DEBUG: API_KEY načtený?", bool(api_key))

if not api_key:
    raise RuntimeError("❌ API key není načtený – zkontroluj .env soubor")

# 🔑 Správná inicializace klienta
client = Anthropic(api_key=api_key)

def main():
    prompt = "Testovací dotaz – napiš jednu větu, že funguje připojení k API."
    try:
        reply = ask_claude(prompt)
        print("✅ Claude odpověděl:")
        print(reply)

        # --- načíst poslední záznam z usage_log.json ---
        log_path = os.path.join("C:/Users/mspan/Desktop/demo_zony_app1", "usage_log.json")
        if os.path.exists(log_path):
            with open(log_path, "r", encoding="utf-8") as f:
                logs = json.load(f)
            last = logs[-1]
            print("\n📊 Poslední záznam z usage_log.json:")
            print(f"Model: {last['used_model']}")
            print(f"Vstupní tokeny: {last['input_tokens']}")
            print(f"Výstupní tokeny: {last['output_tokens']}")
            print(f"Celkem tokenů: {last['total_tokens']}")
            print(f"Čas: {last['timestamp']}")
        else:
            print("⚠️ Soubor usage_log.json zatím neexistuje.")

    except Exception as e:
        print("❌ Chyba při volání:", e)

if __name__ == "__main__":
    main()
