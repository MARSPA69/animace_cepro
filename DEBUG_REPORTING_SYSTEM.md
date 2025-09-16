# DEBUG REPORTING SYSTEM - DOKUMENTACE

## 📋 PŘEHLED SYSTÉMU

Debug Reporting System je kompletní řešení pro sběr, analýzu a export debug logů do PDF reportů. Systém automaticky zachytává všechny console.log, console.error a console.warn zprávy a umožňuje jejich export do strukturovaného PDF reportu.

---

## 🚀 INSTALACE A SPUŠTĚNÍ

### **Automatické spuštění:**
- Systém se spustí automaticky při načtení stránky
- Debug logování začne okamžitě po inicializaci
- Všechny console zprávy jsou zachytávány a kategorizovány

### **Manuální ovládání:**
```javascript
// Spuštění logování
window.DebugReporting.startLogging();

// Zastavení logování
window.DebugReporting.stopLogging();

// Generování reportu
window.DebugReporting.generateDebugReport();
```

---

## 🎯 FUNKCIONALITA

### **1. AUTOMATICKÝ SBĚR LOGŮ**
- **Zachytávání:** Všechny console.log, console.error, console.warn
- **Kategorizace:** Automatická podle emoji a prefixů
- **Časové razítko:** Přesné časové označení každého logu
- **Metadata:** Extrakce dat (souřadnice, anchor IDs, mesh ID)

### **2. KATEGORIZACE LOGŮ**
```javascript
LOG_CATEGORIES = {
  '🔴': 'CRITICAL',           // Kritické stavy
  '🔍': 'ANCHOR_DEBUG',       // Detekce kotev
  '⏰': 'TIMING_DEBUG',       // Časové aspekty
  '✅': 'DECISION_DEBUG',     // Rozhodovací proces
  '🚨': 'FALLBACK_DEBUG',     // Fallback situace
  '⚙️': 'CONFIG_DEBUG',       // Konfigurace
  '🚶': 'WALKER_DEBUG',       // Pozice walkeru
  '💥': 'ERROR_DEBUG',        // Chyby a výjimky
  '📊': 'SUMMARY_DEBUG',      // Finální shrnutí
  '🟢': 'STATUS_DEBUG',       // Status informace
  '⚠️': 'WARNING_DEBUG',      // Varování
  '🔮': 'PREDICTION_DEBUG',   // Předpovědi
  '🚀': 'BUILD_START',        // Spuštění
  '🔄': 'LOOP',               // Hlavní smyčka
  '🎯': 'TARGET',             // Cíle
  '🚪': 'EXIT',               // Ukončení
  '🚦': 'CROSS_MODE'          // CROSS MODE
}
```

### **3. PDF REPORT GENEROVÁNÍ**
- **Strukturovaný obsah:** Logy seskupené podle kategorií
- **Statistiky:** Počet chyb, varování, kritických stavů
- **Metadata:** Čas session, celkový počet logů
- **Čitelný formát:** Časové razítko + zpráva

---

## 🎨 UŽIVATELSKÉ ROZHRANÍ

### **Sidebar Menu:**
```
📊 Reporting
├── 📋 Simple Tables
├── 🐛 Debug Reports      ← NOVÝ
└── 📈 Charts & Tables    ← NOVÝ
```

### **Funkce Buttonů:**
- **🐛 Debug Reports:** Generuje a stáhne PDF report
- **📈 Charts & Tables:** Placeholder pro budoucí rozšíření

---

## 📊 STRUKTURA PDF REPORTU

### **1. COVER PAGE**
```
DEBUG LOG REPORT
Generated: 15.01.2025 14:30:25
Session: 15.01.2025 14:25:10 - 15.01.2025 14:30:25
Total Logs: 1,247
Errors: 3
Warnings: 12
Critical: 45
```

### **2. KATEGORIE LOGŮ**
```
CRITICAL (45 logs)
14:25:15: 🔴 [CROSS-CHECK] TIME: 07:13:21, POS: 50.044289,15.073755...
14:25:16: 🔴 [CROSS-CHECK] HIT: MESH=63, ANCHORS=[45,38]...

ANCHOR_DEBUG (234 logs)
14:25:15: 🔍 [ANCHOR-DEBUG] A13: false, A11/12: false, F37/38/45: true...
14:25:16: 🔍 [ANCHOR-DEBUG] ALL_USABLE: [{"ts":"07:13:21","ids":[45,38]}]...

DECISION_DEBUG (89 logs)
14:25:20: ✅ [DECISION] RETURN: A, REASON: Anchor A detected: [13]...
14:25:21: ✅ [CROSS-DECISION] Detected segment A anchors at t=07:13:35...
```

### **3. STATISTIKY**
- **Celkový počet logů**
- **Počet chyb**
- **Počet varování**
- **Počet kritických stavů**
- **Doba trvání session**

---

## 🔧 TECHNICKÉ DETAILLY

### **Použité knihovny:**
- **jsPDF 2.5.1** - generování PDF
- **Moment.js 2.29.4** - práce s časem
- **Lodash 4.17.21** - utility funkce
- **Chart.js 3.9.1** - grafy (pro budoucí rozšíření)
- **Toastr 2.1.4** - notifikace

### **Soubory:**
- `adminlte/dist/debug-reporting.js` - hlavní systém
- `adminlte/dist/index.html` - UI integrace
- PDF reporty se stahují do defaultního download adresáře

### **Formát názvu souboru:**
```
Log report_YYYY_DD_MM.pdf
Příklad: Log report_2025_15_01.pdf
```

---

## 📈 PŘÍKLAD POUŽITÍ

### **1. Spuštění aplikace:**
```javascript
// Systém se spustí automaticky
🔧 [DEBUG-REPORTING] Initializing debug reporting system...
🔧 [DEBUG-REPORTING] System initialized and logging started
🚀 [DEBUG-REPORTING] Debug logging started at 15.01.2025 14:25:10
```

### **2. Běh aplikace:**
```javascript
// Všechny debug logy jsou zachytávány
🔴 [CROSS-CHECK] TIME: 07:13:21, POS: 50.044289,15.073755
🔍 [ANCHOR-DEBUG] A13: false, A11/12: false, F37/38/45: true
✅ [DECISION] RETURN: A, REASON: Anchor A detected: [13]
```

### **3. Generování reportu:**
```javascript
// Kliknutí na "Debug Reports" v sidebaru
📊 [DEBUG-REPORTING] Generating debug report...
⏹️ [DEBUG-REPORTING] Debug logging stopped at 15.01.2025 14:30:25
📊 [DEBUG-REPORTING] Total logs captured: 1,247
💾 [DEBUG-REPORTING] PDF downloaded as: Log report_2025_15_01.pdf
```

---

## 🎯 VÝHODY SYSTÉMU

### **1. AUTOMATIZACE**
- ✅ Automatické spuštění při načtení
- ✅ Automatické zachytávání všech logů
- ✅ Automatická kategorizace

### **2. UŽIVATELSKÁ PŘÍVĚTIVOST**
- ✅ Jednoduché ovládání přes sidebar
- ✅ Toast notifikace o stavu
- ✅ Automatické stažení PDF

### **3. ANALÝZA DAT**
- ✅ Strukturované seskupení logů
- ✅ Statistiky a přehledy
- ✅ Časové razítko každého logu

### **4. ROZŠÍŘITELNOST**
- ✅ Připraveno pro Charts & Tables
- ✅ Modulární architektura
- ✅ Snadné přidávání nových kategorií

---

## 🔮 BUDOUCÍ ROZŠÍŘENÍ

### **Charts & Tables:**
- Interaktivní grafy detekce kotev
- Timeline kritických událostí
- Tabulky s detaily rozhodnutí
- Export do různých formátů (CSV, JSON)

### **Pokročilé funkce:**
- Filtrování logů před exportem
- Porovnání více session
- Automatické odesílání reportů
- Dashboard s real-time statistikami

---

## 🚨 ŘEŠENÍ PROBLÉMŮ

### **PDF se negeneruje:**
1. Zkontrolujte konzoli pro chyby
2. Ověřte, že jsou načteny všechny knihovny
3. Zkontrolujte, že je aktivní debug logování

### **Logy se nezachytávají:**
1. Ověřte, že je systém inicializován
2. Zkontrolujte, že je aktivní logování
3. Ověřte, že console.log funguje

### **Toast notifikace se nezobrazují:**
1. Zkontrolujte, že je načtena toastr knihovna
2. Ověřte CSS styly pro toastr

---

## 📝 PŘÍKLAD KONFIGURACE

```javascript
// Vlastní konfigurace
window.DebugReporting.LOG_CATEGORIES['🆕'] = 'CUSTOM_CATEGORY';

// Přidání vlastní kategorie
window.DebugReporting.addCustomCategory('🆕', 'CUSTOM_CATEGORY');

// Vlastní formát názvu souboru
window.DebugReporting.generateFileName = function() {
  return `Custom_Report_${Date.now()}.pdf`;
};
```

---

*Dokumentace vytvořena: 15.01.2025*
*Verze systému: 1.0*
*Kompatibilita: Chrome, Firefox, Safari, Edge*
