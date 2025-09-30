import os
import requests
from dotenv import load_dotenv

# Načti .env soubor
load_dotenv(r"C:\Users\mspan\Desktop\demo_zony_app1\.env")

api_key = os.getenv("ANTHROPIC_API_KEY")
if not api_key:
    raise ValueError("❌ API klíč nebyl nalezen v .env souboru!")

# Zavolej usage endpoint
url = "https://api.anthropic.com/v1/usage"
headers = {
    "x-api-key": api_key,
    "anthropic-version": "2023-06-01"
}

resp = requests.get(url, headers=headers)

if resp.status_code != 200:
    print("❌ Chyba při volání API:", resp.text)
    exit(1)

data = resp.json()

# Ceník pro Sonnet 3.5
PRICE_INPUT_PER_1K = 0.003   # USD
PRICE_OUTPUT_PER_1K = 0.015  # USD

for entry in data.get("data", []):
    day = entry.get("day")
    used = entry.get("credits_used", 0)
    remaining = entry.get("credits_remaining", 0)
    expiring = entry.get("credits_expiring", 0)

    print(f"📅 Den: {day}")
    print(f"💰 Utraceno: {used:.2f} USD")
    print(f"💵 Zbývá: {remaining:.2f} USD")
    print(f"⏳ Expirující: {expiring:.2f} USD")

    # Odhad počtu tokenů, které ještě můžeš zpracovat
    max_input_tokens_k = remaining / PRICE_INPUT_PER_1K
    max_output_tokens_k = remaining / PRICE_OUTPUT_PER_1K

    print("📊 Odhad pro Claude 3.5 Sonnet:")
    print(f"   • max input:  {max_input_tokens_k:,.0f} × 1K tokenů")
    print(f"   • max output: {max_output_tokens_k:,.0f} × 1K tokenů")
    print("-" * 50)

if not data.get("data"):
    print("⚠️ Žádná usage data k dispozici.")
