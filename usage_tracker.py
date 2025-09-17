import anthropic
import json
import os
from datetime import datetime
from dotenv import load_dotenv


# načtení .env souboru
load_dotenv("C:/Users/mspan/Desktop/demo_zony_app1/.env")

api_key = os.getenv("ANTHROPIC_API_KEY")
if not api_key:
    raise RuntimeError("❌ API key není nastavený – zkontroluj .env soubor")

# správná inicializace klienta
client = anthropic.Anthropic(api_key=api_key)

LOG_FILE = "C:/Users/mspan/Desktop/demo_zony_app1/usage_log.json"

def ask_claude(prompt):
    models_to_try = [
        "claude-3-5-sonnet-20240620",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229"
    ]
    response = None
    used_model = None

    for model in models_to_try:
        try:
            response = client.messages.create(
                model=model,
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}],
            )
            used_model = model
            break
        except anthropic.NotFoundError:
            print(f"❌ Model {model} není dostupný, zkouším další...")
            continue

    if response is None:
        raise RuntimeError("❌ Žádný z modelů nebyl dostupný")

    reply = response.content[0].text
    ...


    # Logování usage + modelu
    usage_entry = {
        "timestamp": datetime.now().isoformat(),
        "prompt": prompt,
        "reply": reply,
        "used_model": used_model,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
    }

    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            logs = json.load(f)
    else:
        logs = []

    logs.append(usage_entry)

    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(logs, f, indent=2, ensure_ascii=False)

    return reply
