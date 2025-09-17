# AI Agent pro GPS Navigaci

## 🎯 Účel
AI agent se učí z vašich rozhodnutí na křižovatkách a postupně se zlepšuje v navigaci.

## 🚀 Instalace

### 1. Instalace Python závislostí
```bash
pip install -r requirements.txt
```

### 2. Nastavení OpenAI API klíče
1. Vytvořte soubor `.env` v této složce
2. Přidejte řádek: `OPENAI_API_KEY=your_actual_api_key_here`
3. Získejte API klíč na: https://platform.openai.com/api-keys

### 3. Spuštění
```bash
python agent.py
```

## 📁 Struktura souborů
- `agent.py` - Hlavní AI agent
- `config.py` - Konfigurace
- `feedback_log.json` - Uložené feedbacky
- `decision_rules.json` - Naučená pravidla
- `requirements.txt` - Python závislosti

## 🤖 Jak to funguje
1. Agent sleduje debug logy z `debug-reporting.js`
2. Když neví rozhodnutí → zeptá se vás
3. Vy odpovíte (ANO/NE/PROČ)
4. Agent se naučí a příště už ví

## 📊 Formát feedbacku
- **ANO** - jedu do segmentu F
- **NE** - čekám na další kotvy  
- **PROČ** - vysvětli mi situaci

## 🔧 Konfigurace
Upravte `config.py` pro změnu nastavení:
- `CONFIDENCE_THRESHOLD` - minimální důvěra pro automatické rozhodnutí
- `MAX_FEEDBACK_HISTORY` - maximální počet feedback záznamů
- `ASK_USER_DELAY` - zpoždění před dotazem na uživatele