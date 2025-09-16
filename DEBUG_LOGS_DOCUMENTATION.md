# DEBUG LOGY - KOMPLETNÍ DOKUMENTACE

## 📋 PŘEHLED VŠECH DEBUG LOGŮ

Tento dokument obsahuje kompletní přehled všech debug logů implementovaných v `FUSED_GPS.js` pro sledování algoritmu pohybu kuličky v kritických křižovatkách.

---

## 🔴 1. HLAVNÍ CHECK LOGY (CRITICAL)

**Umístění:** `decideAtCrossing()` - začátek funkce (řádky 642-645)

**Účel:** Základní informace o stavu algoritmu při každém volání

```javascript
console.log(`🔴 [CROSS-CHECK] TIME: ${baseRow?.ts || "unknown"}, POS: ${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`);
console.log(`🔴 [CROSS-CHECK] HIT: ${hit ? `MESH=${hit.mesh_id}, ANCHORS=[${hit.matched_ids}]` : 'NO HIT'}`);
console.log(`🔴 [CROSS-CHECK] MODE: ${crossMode.active ? `ACTIVE (${crossMode.crossing?.name})` : 'INACTIVE'}`);
```

**Co sleduje:**
- Aktuální čas
- Pozici kuličky (lat, lng)
- Informace o hit objektu (mesh_id, matched_ids)
- Stav CROSS MODE

---

## 🔍 2. DETEKCE ANCHORŮ (ANCHOR DEBUG)

**Umístění:** `decideAtCrossing()` - po načtení usable dat (řádky 664-670)

**Účel:** Detailní sledování detekce konkrétních kotev

```javascript
const anchor13Detected = usable.some(u => u.ids.includes(13));
const anchor11_12Detected = usable.some(u => u.ids.some(id => [11, 12].includes(id)));
const anchor37_38_45Detected = usable.some(u => u.ids.some(id => [37, 38, 45].includes(id)));

console.log(`🔍 [ANCHOR-DEBUG] A13: ${anchor13Detected}, A11/12: ${anchor11_12Detected}, F37/38/45: ${anchor37_38_45Detected}`);
console.log(`🔍 [ANCHOR-DEBUG] ALL_USABLE: ${JSON.stringify(usable.map(u => ({ts: u.ts, ids: u.ids})))}`);
```

**Co sleduje:**
- Detekci anchoru 13 (segment A)
- Detekci anchorů 11, 12 (segment A)
- Detekci anchorů 37, 38, 45 (segment F)
- Všechny usable anchory s časovými razítky

---

## ⏰ 3. TIMING CHECK LOGY (TIMING DEBUG)

**Umístění:** `decideAtCrossing()` - po definici anchorů (řádky 676-684)

**Účel:** Sledování časových aspektů algoritmu

```javascript
const currentTime = baseRow?.ts || "00:00:00";
const isCriticalTime = currentTime >= "07:13:00" && currentTime <= "07:14:00";
const timeInCrossMode = crossMode.startTime ? (s - crossMode.startTime) : 0;

if (isCriticalTime) {
  console.log(`⏰ [TIME-DEBUG] CURRENT: ${currentTime}, IN_CROSS: ${timeInCrossMode}s`);
  console.log(`⏰ [TIME-DEBUG] TIMEOUT: ${timeInCrossMode > 30 ? 'YES' : 'NO'} (${timeInCrossMode}/30s)`);
}
```

**Co sleduje:**
- Aktuální čas
- Doba strávená v CROSS MODE
- Stav timeout (přes 30 sekund)

---

## ✅ 4. DECISION PROCESS LOGY (DECISION DEBUG)

**Umístění:** `decideAtCrossing()` - před každým return (řádky 700-747)

**Účel:** Sledování rozhodovacího procesu

```javascript
function getDecisionReason(decision, usable) {
  if (decision === "A") {
    const aAnchors = usable.flatMap(u => u.ids).filter(id => [11,12,13].includes(id));
    return `Anchor A detected: [${aAnchors.join(',')}]`;
  }
  if (decision === "F") {
    const fAnchors = usable.flatMap(u => u.ids).filter(id => [37,38,45].includes(id));
    return `Anchor F detected: [${fAnchors.join(',')}]`;
  }
  return "Waiting for anchors";
}

// Před každým return:
console.log(`✅ [DECISION] RETURN: ${decision}, REASON: ${getDecisionReason(decision, usable)}`);
```

**Co sleduje:**
- Finální rozhodnutí (A, F, null)
- Důvod rozhodnutí
- Konkrétní detekované kotvy

---

## 🚨 5. FALLBACK DETECTION LOGY (FALLBACK DEBUG)

**Umístění:** Timeout logika v hlavním loopu (řádky 885-887)

**Účel:** Sledování fallback situací

```javascript
console.log(`🚨 [FALLBACK] TIMEOUT TRIGGERED after ${s - crossMode.startTime}s`);
console.log(`🚨 [FALLBACK] LAST_ANCHORS: ${JSON.stringify(usable.slice(-3).map(u => u.ids))}`);
```

**Co sleduje:**
- Kdy se spustil timeout
- Poslední detekované kotvy před timeoutem

---

## ⚙️ 6. ZÁKLADNÍ KONFIGURAČNÍ CHECK (CONFIG DEBUG)

**Umístění:** `buildFusedSeries()` - začátek funkce (řádky 420-422)

**Účel:** Kontrola konfiguračních parametrů

```javascript
console.log(`⚙️ [CONFIG] SNAP_DIST: ${CFG.SNAP_DISTANCE_M}, LOOKAHEAD: ${CFG.MATCH_LOOKAHEAD_SEC}`);
console.log(`⚙️ [CONFIG] CROSS_EPS: ${CROSS_EPS_M}, MATCH_TOL: ${CFG.MATCH_TOL_SEC}`);
```

**Co sleduje:**
- Snap distance threshold
- Lookahead window
- Cross epsilon
- Match tolerance

---

## 🚶 7. PATH WALKER DEBUG (WALKER DEBUG)

**Umístění:** Hlavní loop - před cross mode check (řádky 798-802)

**Účel:** Sledování pozice walkeru

```javascript
if (baseRow?.ts && baseRow.ts >= "07:13:00" && baseRow.ts <= "07:14:00") {
  console.log(`🚶 [WALKER] POS: ${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}, SEG: ${pos.seg}, T: ${pos.t}`);
  console.log(`🚶 [WALKER] DIST_TO_CROSS: ${haversine_m(pos.lat, pos.lng, crossMode.crossing?.lat, crossMode.crossing?.lng)}m`);
}
```

**Co sleduje:**
- Pozici walkeru (lat, lng)
- Segment a pozici v segmentu
- Vzdálenost ke křižovatce

---

## 💥 8. ERROR BOUNDARY LOGY (ERROR DEBUG)

**Umístění:** Hlavní loop - kolem `decideAtCrossing()` (řádky 905-914)

**Účel:** Zachycení chyb

```javascript
try {
  decision = decideAtCrossing(s, { lat: latFinal, lng: lngFinal }, baseRow, hit);
} catch (error) {
  console.error(`💥 [ERROR] In decideAtCrossing at ${baseRow?.ts}: ${error.message}`);
  console.error(`💥 [ERROR] Stack: ${error.stack}`);
  decision = null; // fallback
}
```

**Co sleduje:**
- Chybové zprávy
- Stack trace
- Fallback chování

---

## 📊 9. FINAL DECISION SUMMARY (SUMMARY DEBUG)

**Umístění:** `decideAtCrossing()` - na konci funkce (řádky 742-745)

**Účel:** Finální shrnutí rozhodnutí

```javascript
console.log(`📊 [SUMMARY] TIME: ${baseRow?.ts}, DECISION: ${decision}, 
  ANCHORS: ${usable.flatMap(u => u.ids).join(',')},
  MESH: ${hit?.mesh_id || 'none'}`);
```

**Co sleduje:**
- Čas rozhodnutí
- Finální rozhodnutí
- Všechny detekované kotvy
- Mesh ID

---

## 🟢 10. VIZUÁLNÍ STATUS LOG (STATUS DEBUG)

**Umístění:** Hlavní loop - každých 5 sekund (řádky 547-558, 1024)

**Účel:** Pravidelný status přehled

```javascript
function logCrossStatus() {
  const status = crossMode.active ? 
    `CROSS MODE ACTIVE (${crossMode.crossing?.name}) for ${s - crossMode.startTime}s` : 
    "NORMAL MODE";
  
  const anchors = hit?.matched_ids?.length ? 
    `Anchors: [${hit.matched_ids.join(',')}]` : 
    "No anchors";
  
  console.log(`🟢 [STATUS] ${status} | ${anchors} | Time: ${baseRow?.ts}`);
}

// Volání každých 5 sekund
if (s % 5 === 0) logCrossStatus();
```

**Co sleduje:**
- Stav CROSS MODE
- Doba v CROSS MODE
- Aktuální detekované kotvy
- Aktuální čas

---

## ⚠️ 11. WARNING LOGY (WARNING DEBUG)

**Umístění:** Hlavní loop - po status logu (řádky 1026-1034)

**Účel:** Varování před problémy

```javascript
const shouldLogDebug = 
  crossMode.active && 
  (s - crossMode.startTime) > 10 && 
  !hit?.matched_ids?.length;

if (shouldLogDebug) {
  console.log(`⚠️ [WARNING] In CROSS MODE for ${s - crossMode.startTime}s but no anchors detected`);
}
```

**Co sleduje:**
- Dlouhé čekání v CROSS MODE bez kotev
- Potenciální problémy s detekcí

---

## 🎯 12. PREDICTION LOGY (PREDICTION DEBUG)

**Umístění:** `decideAtCrossing()` - předpověď anchoru 13 (řádky 686-698)

**Účel:** Sledování předpovědi anchoru 13

```javascript
function hasAnchor13InExtendedWindow(s) {
  const extendedWindow = 25; // 25 sekund dopředu
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].sec >= s && rows[i].sec <= s + extendedWindow) {
      if (rows[i].a_ids.includes(13)) {
        console.log(`🔮 [PREDICT-ANCHOR13] Detected anchor 13 at ${rows[i].ts} (${rows[i].sec - s}s ahead)`);
        return true;
      }
    }
  }
  return false;
}
```

**Co sleduje:**
- Předpověď anchoru 13
- Časový offset předpovědi
- Rozhodnutí na základě předpovědi

---

## 📈 JAK POUŽÍT DEBUG LOGY

### Pro kritické časy (07:13:00-07:14:00):
- Všechny debug logy jsou aktivní
- Detailní sledování každého kroku

### Pro normální provoz:
- Pouze status logy každých 5 sekund
- Warning logy při problémech

### Pro ladění:
- Sledujte sekvenci logů
- Identifikujte kde se algoritmus rozhoduje špatně
- Kontrolujte detekci kotev vs. očekávané hodnoty

---

## 🔍 KLÍČOVÉ INDIKÁTORY PROBLÉMŮ

1. **🔴 [CROSS-CHECK]**: Kontrola základního stavu
2. **🔍 [ANCHOR-DEBUG]**: Kontrola detekce kotev
3. **⏰ [TIME-DEBUG]**: Kontrola časování
4. **✅ [DECISION]**: Kontrola rozhodnutí
5. **🚨 [FALLBACK]**: Kontrola timeout situací
6. **⚠️ [WARNING]**: Varování před problémy

---

## 📝 PŘÍKLAD VÝSTUPU

```
⚙️ [CONFIG] SNAP_DIST: 1, LOOKAHEAD: 25
🔴 [CROSS-CHECK] TIME: 07:13:21, POS: 50.044289,15.073755, HIT: MESH=63, ANCHORS=[45,38], MODE: ACTIVE (A/B/F)
🔍 [ANCHOR-DEBUG] A13: false, A11/12: false, F37/38/45: true
🔍 [ANCHOR-DEBUG] ALL_USABLE: [{"ts":"07:13:21","ids":[45,38]}]
⏰ [TIME-DEBUG] CURRENT: 07:13:21, IN_CROSS: 6s
⏰ [TIME-DEBUG] TIMEOUT: NO (6/30s)
🔮 [PREDICT-ANCHOR13] Detected anchor 13 at 07:13:35 (14s ahead)
🎯 [CROSS-DECISION] Anchor 13 predicted - choosing segment A
✅ [DECISION] RETURN: A, REASON: Anchor A detected: [13]
📊 [SUMMARY] TIME: 07:13:21, DECISION: A, ANCHORS: 45,38, MESH: 63
🟢 [STATUS] CROSS MODE ACTIVE (A/B/F) for 6s | Anchors: [45,38] | Time: 07:13:21
```

---

*Dokumentace vytvořena: $(date)*
*Verze: 1.0*
*Soubor: FUSED_GPS.js*
