import os
import json
from datetime import datetime
from dotenv import load_dotenv
import anthropic

# ---- 1. Načtení API klíče ----
load_dotenv("C:/Users/mspan/Desktop/demo_zony_app1/.env")
api_key = os.getenv("ANTHROPIC_API_KEY")

if not api_key:
    raise RuntimeError("❌ API key není nastavený – zkontroluj .env soubor")

client = anthropic.Anthropic(api_key=api_key)

# ---- 2. Cesty k logům ----
import os
from datetime import datetime

# Dynamické cesty podle data
TODAY = datetime.now().strftime("%Y-%m-%d")
LOGS_DIR = "C:/Users/mspan/Desktop/demo_zony_app1/logs"
TODAY_DIR = os.path.join(LOGS_DIR, TODAY)

# Vytvoř dnešní složku pokud neexistuje
os.makedirs(TODAY_DIR, exist_ok=True)

DEBUG_LOG = os.path.join(TODAY_DIR, "logs_feed.json")   # export z debug-reporting.js
FEEDBACK_LOG = os.path.join(TODAY_DIR, "feedback_log.json")

# ---- 3. Funkce na dotaz do Claude ----
def ask_claude(prompt):
    response = client.messages.create(
        model="claude-3-5-haiku-20241022",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text

# ---- 4. Hlavní smyčka ----
def main():
    if not os.path.exists(DEBUG_LOG):
        print(f"⚠️ Soubor {DEBUG_LOG} neexistuje, spusť nejdřív debug-reporting.js")
        return

    with open(DEBUG_LOG, "r", encoding="utf-8") as f:
        logs = json.load(f)

    if not logs:
        print("⚠️ Žádné logy k anotaci")
        return

    feedbacks = []
    if os.path.exists(FEEDBACK_LOG):
        with open(FEEDBACK_LOG, "r", encoding="utf-8") as f:
            feedbacks = json.load(f)

    for log in logs:
        msg = log.get("message", "")
        certainty = log.get("certainty", 1.0)  # placeholder – můžeš přidat do debug-reportingu
        ts = log.get("timestamp", "N/A")

        # Jen pokud si agent není jistý
        if certainty < 0.5:
            print(f"\n🕒 {ts} | {msg}")
            # TEST MODE: Automatické odpovědi místo input()
            if "45, 38" in msg:
                user_fb = "NE"  # Overlap kotvy, čekat
            elif "38, 37, 45" in msg:
                user_fb = "NE"  # Overlap kotvy, čekat
            elif "12, 11, 45, 13" in msg:
                user_fb = "ANO"  # Segment A kotvy, jet do A
            else:
                user_fb = "NE"  # Default: čekat
            
            print(f"🤖 TEST MODE: Automatická odpověď: {user_fb}")
            # user_fb = input("👉 Mám pokračovat? [ANO/NE/PROČ]: ").strip()

            fb_entry = {
                "timestamp": datetime.now().isoformat(),
                "log_time": ts,
                "message": msg,
                "feedback": user_fb
            }
            feedbacks.append(fb_entry)

            # Po feedbacku zkusíme navrhnout opravu
            try:
                suggestion = ask_claude(
                    f"""
                    Máme log: {msg}
                    Uživatel řekl: {user_fb}
                    Navrhni konkrétní změnu v souborech FUSED_GPS.js, renderer.js nebo index.html.
                    Buď praktický a uveď blok kódu.
                    """
                )
                print("\n🤖 Návrh od Claude:")
                print(suggestion)
                fb_entry["suggestion"] = suggestion
            except Exception as e:
                print("❌ Nepodařilo se získat návrh od Claude:", e)

    # Ulož feedbacky
    with open(FEEDBACK_LOG, "w", encoding="utf-8") as f:
        json.dump(feedbacks, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Feedback uložen do {FEEDBACK_LOG}")

if __name__ == "__main__":
    main()
