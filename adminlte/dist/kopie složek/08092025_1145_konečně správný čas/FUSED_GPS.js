// FUSED_GPS.js — samostatný modul (globální objekt window.FUSED_GPS)
// Vstupy očekává jako už načtené <script> soubory:
//  - fixedGpsMesh / FIXED_GPS_MESH / MESH_FIXED_GPS        (síť M_GPS)
//  - BASIC_TABLE_04062025                                  (TIME, SPEED, ANCHOR1..6)
//  - MESH_FIXEDGPS_ANCHFOOTPRINT                           (mapa M_GPS -> Footprint)
//  - MIDAXIS.js                                            (středová osa; "koleje")
//  - ANCHORID_TO_COMPASSANGLE.js (volitelně)               (sekvence kotev -> kompas)

(function () {
  const EARTH_R = 6371008.8; // m

  const CFG = {
    SNAP_DISTANCE_M:    1,     // práh přiblížení k M_GPS pro test shody (použijeme i jako CROSS_EPS_M)
    FORCE_SNAP_M:       1.0,   // (aktuálně už neskáčeme, ale nechávám pro případné ladění)
    MATCH_THRESHOLD:    0.20,  // 20 % shody A_ID (dnes nepoužíváme k rozhodování, jen info)
    COMPASS_WINDOW_SEC: 20,    // volitelné
    START: { lat: 50.04389397, lng: 15.07552375, ts: "06:54:44" },

    // otočka v terminálech (slepé konce)
    TURN_PROX_M:        3,
    TURN_DROP_RATIO:    0.65,  // pokles vůči rolling průměru (=> otočka)
    ROLL_WIN_SEC:       10,
    TURN_COOLDOWN_SEC:  20,

    // párování časů: F_GPS (1 Hz) vs tabulkové TIME (každé 3–4 s)
    MATCH_TOL_SEC:      4,      // kolik sekund okno pro „nejbližší TIME“
    MATCH_LOOKAHEAD_SEC: 35   // NOVÉ: dopředné okno (sekundy)
  };

  // ---------- Pomůcky: čas, geo ----------
  function parseHmsToSec(hms) {
    if (!hms) return null;
    const s = String(hms).trim();
    const m = s.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
  }

  function haversine_m(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const dφ = (lat2 - lat1) * Math.PI / 180;
    const dλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.sqrt(a));
  }

  function bearing_deg(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const λ1 = lon1 * Math.PI / 180, λ2 = lon2 * Math.PI / 180;
    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    let θ = Math.atan2(y, x) * 180 / Math.PI;
    if (θ < 0) θ += 360;
    return θ;
  }

  function destinationPoint(lat, lon, bearingDeg, distM) {
    const δ = distM / EARTH_R;
    const θ = bearingDeg * Math.PI / 180;
    const φ1 = lat * Math.PI / 180, λ1 = lon * Math.PI / 180;
    const sinφ1 = Math.sin(φ1), cosφ1 = Math.cos(φ1);
    const sinδ = Math.sin(δ), cosδ = Math.cos(δ);
    const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
    const φ2 = Math.asin(sinφ2);
    const y = Math.sin(θ) * sinδ * cosφ1;
    const x = cosδ - sinφ1 * sinφ2;
    const λ2 = λ1 + Math.atan2(y, x);
    return { lat: φ2 * 180 / Math.PI, lng: ((λ2 * 180 / Math.PI + 540) % 360) - 180 };
  }

  const uniq = (arr) => [...new Set(arr)];

  // ---------- Čtení struktur datasetů ----------
  function getLatLng(p) {
    if (!p) return null;
    if (typeof p.lat === "number" && typeof p.lng === "number") return { lat: p.lat, lng: p.lng };
    if (typeof p.lat === "number" && typeof p.lon === "number") return { lat: p.lat, lng: p.lon };
    if (Array.isArray(p.coords) && p.coords.length >= 2) return { lat: +p.coords[0], lng: +p.coords[1] };
    if (typeof p.y === "number" && typeof p.x === "number") return { lat: p.y, lng: p.x };
    if (Array.isArray(p) && p.length >= 2) return { lat: +p[0], lng: +p[1] };
    if (typeof p.LAT === "number" && typeof p.LONG === "number") return { lat: p.LAT, lng: p.LONG };
    return null;
  }

  function getMGpsList() {
    let src = [];
    if (typeof fixedGpsMesh !== "undefined") src = fixedGpsMesh;
    else if (typeof FIXED_GPS_MESH !== "undefined") src = FIXED_GPS_MESH;
    else if (typeof MESH_FIXED_GPS !== "undefined") src = MESH_FIXED_GPS;
    else if (window.fixedGpsMesh) src = window.fixedGpsMesh;

    return (src || []).map((o, idx) => {
      const ll = getLatLng(o);
      return { id: o.id ?? o.ID ?? o.code ?? idx, lat: ll?.lat, lng: ll?.lng, raw: o, idx };
    }).filter(o => Number.isFinite(o.lat) && Number.isFinite(o.lng));
  }
// ---------- Footprint zdroj ----------
function getFootSrc() {
  // preferuj „velký“ název, kdyby existoval
  if (typeof MESH_FIXEDGPS_ANCHFOOTPRINT !== "undefined") return MESH_FIXEDGPS_ANCHFOOTPRINT;
  if (window.MESH_FIXEDGPS_ANCHFOOTPRINT) return window.MESH_FIXEDGPS_ANCHFOOTPRINT;

  // tvoje reálná proměnná z datasetu:
  if (window.meshFixedGpsAnchFootprint) return window.meshFixedGpsAnchFootprint;

  // toleruj i překlep s ANCHOR
  if (window.MESH_FIXEDGPS_ANCHORFOOTPRINT) return window.MESH_FIXEDGPS_ANCHORFOOTPRINT;

  return [];
}

  function getRowSpeed(row) {
    const cands = ["SPEED", "speed", "VEL", "velocity", "v"];
    for (const k of cands) if (k in row && typeof row[k] === "number") return row[k];
    for (const k of cands) if (k in row) { const n = Number(row[k]); if (Number.isFinite(n)) return n; }
    return 0;
  }

  function getPathPoints(MGPS) {
    if (Array.isArray(window.MIDAXIS) && window.MIDAXIS.length > 1) {
      return window.MIDAXIS.map(p => {
        const lat = (typeof p.lat === 'number') ? p.lat : (typeof p.LAT === 'number' ? p.LAT : p.Y || p.y);
        const lon = (typeof p.lon === 'number') ? p.lon : (typeof p.LON === 'number' ? p.LON : p.LONG || p.X || p.x);
        return { lat, lng: lon };
      }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    }
    // fallback: pořadí z MESH
    return orderMeshPath(MGPS, CFG.START.lat, CFG.START.lng).map(m => ({ lat: m.lat, lng: m.lng }));
  }

  function getRowTimestamp(row) {
    const k = Object.keys(row).find(x => /timestamp/i.test(x) || /^time$/i.test(x));
    if (!k) return null;
    return String(row[k]).trim();
  }

  function readAnchors(row) {
    if (Array.isArray(row.Footprints)) {
      return uniq(row.Footprints.map(Number).filter(n => Number.isFinite(n) && n > 0));
    }
    let keys = Object.keys(row).filter(k => /^KOTVA\d+$/i.test(k));
    if (keys.length) {
      return uniq(keys.map(k => Number(row[k])).filter(n => Number.isFinite(n) && n > 0));
    }
    keys = Object.keys(row).filter(k => /^ANCHOR\d+$/i.test(k));
    if (keys.length) {
      return uniq(keys.map(k => Number(row[k])).filter(n => Number.isFinite(n) && n > 0));
    }
    return [];
  }

  // ---------- Shoda A_ID (info) ----------
  function matchPercent(aIds, mIds) {
    if (!aIds.length || !mIds.length) return 0;
    const A = new Set(aIds), B = new Set(mIds);
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return inter / A.size;
  }

  // ---------- Kompas (volitelné) ----------
  function inferCompassAt(timeSec, rowsBySec) {
    try {
      const bySeq = window.ANCHOR_TO_COMPASS_BY_SEQUENCE || {};
      const w = CFG.COMPASS_WINDOW_SEC;
      const seqSeen = [];
      const seen = new Set();
      for (let t = timeSec - w; t <= timeSec + w; t++) {
        const rows = rowsBySec.get(t) || [];
        const ids = uniq(rows.flatMap(readAnchors));
        for (const id of ids) if (!seen.has(id)) { seen.add(id); seqSeen.push(id); }
      }
      const key = seqSeen.join("-");
      if (bySeq[key]) return { ...bySeq[key], code: 10, sequenceKey: key };
      const keyRev = [...seqSeen].reverse().join("-");
      if (bySeq[keyRev]) return { ...bySeq[keyRev], code: 11, sequenceKey: keyRev };
      for (const k of Object.keys(bySeq)) {
        const arr = k.split("-").map(Number);
        if (arr.length >= 3 && key.includes(arr.slice(0, 3).join("-"))) return { ...bySeq[k], code: 10, sequenceKey: k };
        if (arr.length >= 3 && keyRev.includes(arr.slice(0, 3).join("-"))) return { ...bySeq[k], code: 11, sequenceKey: k };
      }
    } catch { /* ignore */ }
    return null;
  }

  // ---------- Dedup TIMESTAMP ----------
  function dedupRows(rawRows) {
    const rows = [];
    let prevTs = null;
    for (const r of rawRows) {
      const ts = getRowTimestamp(r);
      if (ts == null) continue;
      if (ts === prevTs) continue;
      rows.push(r);
      prevTs = ts;
    }
    return rows;
  }

  // ---------- Footprint vyhledání ----------
function footprintForId(mid, footSrc) {
  if (!footSrc) return [];
  // Pole objektů: hledej podle vlastnosti id/ID/code
  if (Array.isArray(footSrc)) {
    const hit = footSrc.find(x => x && (x.id === mid || x.ID === mid || x.code === mid));
    if (hit) return hit.Footprints || hit.Footprint || hit.anchors || [];
    return [];
  }
  // Objektový slovník
  const node = footSrc[mid] || footSrc[String(mid)];
  if (node) return node.Footprints || node.Footprint || node.anchors || [];
  return [];
}


  // ---------- Seřazení MESH jako fallback path ----------
  function orderMeshPath(MGPS, startLat, startLng) {
    if (!MGPS.length) return [];
    const byId = new Map(MGPS.map(m => [m.id, m]));
    let current = MGPS.reduce((best, m) => {
      const d = haversine_m(startLat, startLng, m.lat, m.lng);
      return (!best || d < best.d) ? { m, d } : best;
    }, null).m;
    const unvisited = new Set(MGPS.map(m => m.id));
    const ordered = [];
    unvisited.delete(current.id);
    ordered.push(current);
    while (unvisited.size) {
      let next = null, bestD = Infinity;
      for (const id of unvisited) {
        const n = byId.get(id);
        const d = haversine_m(current.lat, current.lng, n.lat, n.lng);
        if (d < bestD) { bestD = d; next = n; }
      }
      ordered.push(next);
      unvisited.delete(next.id);
      current = next;
    }
    return ordered;
  }

  // ---------- Nejbližší MESH bod ----------
  function nearestMGPS(lat, lng, MGPS) {
    let best = null, bestD = Infinity;
    for (const m of MGPS) {
      const d = haversine_m(lat, lng, m.lat, m.lng);
      if (d < bestD) { bestD = d; best = m; }
    }
    return { m: best, dist: bestD };
  }

  // ---------- Walker po „kolejích“ ----------
  function segLenM(a,b){ return haversine_m(a.lat,a.lng,b.lat,b.lng); }

  function makePathWalker(path, startLat, startLng) {
    let curr={lat:startLat,lng:startLng};
    let seg=0, t=0, dir=+1; // +1 vpřed, -1 zpět

    (function locateNearest(){
      let best={d:Infinity, seg:0, t:0};
      for (let i=0;i<path.length-1;i++){
        const A=path[i], B=path[i+1];
        const L=segLenM(A,B);
        const br=bearing_deg(A.lat,A.lng,B.lat,B.lng);
        for(let s=0;s<=10;s++){
          const tt=s/10;
          const P=destinationPoint(A.lat,A.lng,br,L*tt);
          const d=haversine_m(P.lat,P.lng,curr.lat,curr.lng);
          if(d<best.d) best={d,seg:i,t:tt};
        }
      }
      seg=best.seg; t=best.t;
      const A=path[seg], B=path[seg+1];
      const L=segLenM(A,B), br=bearing_deg(A.lat,A.lng,B.lat,B.lng);
      const P=destinationPoint(A.lat,A.lng,br,L*t);
      curr={lat:P.lat,lng:P.lng};
    })();

    function stepOnce(remain){
      const A=path[seg], B=path[seg+1];
      const L=segLenM(A,B);
      if (dir>0){
        const posM=L*t, left=Math.max(0,L-posM);
        if (remain >= left-1e-6) {
          curr={lat:B.lat,lng:B.lng};
          seg = Math.min(seg+1, path.length-2);
          t=0;
          return remain-left;
        } else {
          const br=bearing_deg(curr.lat,curr.lng,B.lat,B.lng);
          curr=destinationPoint(curr.lat,curr.lng,br,remain);
          t += remain/L;
          return 0;
        }
      } else {
        const posM=L*t, left=posM;
        if (remain >= left-1e-6) {
          curr={lat:A.lat,lng:A.lng};
          seg = Math.max(seg-1, 0);
          t= (seg===0? 0 : 1);
          return remain-left;
        } else {
          const br=bearing_deg(curr.lat,curr.lng,A.lat,A.lng);
          curr=destinationPoint(curr.lat,curr.lng,br,remain);
          t -= remain/L;
          return 0;
        }
      }
    }

    function step(distM){
      let rem = distM;
      while (rem>0) {
        if (dir>0 && seg===path.length-2 && t>=1-1e-6) dir=-1;
        if (dir<0 && seg===0 && t<=1e-6) dir=+1;
        const before=rem;
        rem = stepOnce(rem);
        if (Math.abs(rem-before) < 1e-9) break;
      }
      return get();
    }

    const get = ()=>({lat:curr.lat,lng:curr.lng, seg, t, dir});
    const reverse = ()=>{ dir = -dir; };
    return { get, step, reverse, dir:()=>dir };
  }

  // ---------- Uložení jednoduchého viz logu ----------
  function downloadFusedLog(filename) {
    try {
      const rows = (window.fusedLog && Array.isArray(window.fusedLog.viz_rows))
        ? window.fusedLog.viz_rows : [];

      if (!rows.length) {
        alert("Log je prázdný (nejdřív spusť Offline GNSS).");
        return;
      }

      const items = rows.map(r => ({
        TIME: r.timestamp,                         // "HH:MM:SS"
        F_GPS: { lat: r.lat, lng: r.lng },
        SPEED_MPS: r.speed_mps ?? null,
        DIST_TO_M: r.dist_to_m ?? null,
        MATCHED_IDS: Array.isArray(r.matched_ids) ? r.matched_ids : [],
        MESH_ID: (r.mesh_id != null) ? r.mesh_id : null
      }));

      const outName = filename || `F_GPS_${new Date().toISOString().slice(0,10)}.json`;
      const blob = new Blob([JSON.stringify(items, null, 2)], {type:"application/json;charset=utf-8"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
    } catch (e) {
      console.error("downloadFusedLog error:", e);
      alert("Chyba při generování logu: " + e.message);
    }
  }

  // ---------- Hlavní výpočet ----------
  function buildFusedSeries() {
    const MGPS = getMGpsList();
    const FOOT_SRC = getFootSrc();
      console.log("FOOT_SRC:", Array.isArray(FOOT_SRC) ? `array(${FOOT_SRC.length})` : typeof FOOT_SRC);


    const TABLESRC = (typeof BASIC_TABLE_04062025 !== "undefined")
      ? BASIC_TABLE_04062025
      : (window.BASIC_TABLE_04062025 || []);
    const rowsRaw = Array.isArray(TABLESRC) ? TABLESRC : [];

    if (!MGPS.length || !rowsRaw.length) {
      console.warn("FUSED_GPS: chybí FIXED_GPS_MESH (resp. CORR_) nebo BASIC_TABLE_04062025.");
      return [];
    }

    // „koleje“
    const PATH = getPathPoints(MGPS);
    const walker = makePathWalker(PATH, CFG.START.lat, CFG.START.lng);
    const startNode = PATH[0];
    const endNode   = PATH[PATH.length-1];

    // Rolling okno rychlostí
    const rollWin = CFG.ROLL_WIN_SEC || 10;
    const q = [];
    let qSum = 0;
    function pushSpeed(v){
      const val = Math.max(0, +v || 0);
      q.push(val); qSum += val;
      while (q.length > rollWin) qSum -= q.shift();
    }
    function rollAvg(){ return q.length ? (qSum / q.length) : 0; }

    let turnCooldown = 0; // v sekundách

    // --- připrav data z tabulky ---
    const rows = dedupRows(rowsRaw).map(r => {
      const ts  = getRowTimestamp(r);
      const sec = parseHmsToSec(ts);
      return { ts, sec, speed: getRowSpeed(r), a_ids: readAnchors(r) };
    }).filter(x => x.sec != null).sort((a,b)=>a.sec-b.sec);

    if (!rows.length) return [];

    const tableSecs = new Set(rows.map(r=>r.sec));
    const anchorsBySec = new Map(rows.map(r=>[r.sec, r.a_ids]));
    const tableSecList = [...tableSecs].sort((a,b)=>a - b);

    function speedAtSec(s){
      let v = 0;
      for (let i=rows.length-1;i>=0;i--){
        if (rows[i].sec <= s) { v = rows[i].speed || 0; break; }
      }
      return Math.max(0, +v || 0);
    }
    
    function anchorIdsAroundSec(s) {
  // 1) přesně s
  if (anchorsBySec.has(s)) {
    const a = anchorsBySec.get(s);
    if (Array.isArray(a) && a.length) return a;
  }

  // 2) nejbližší v ±MATCH_TOL_SEC
  const tol = CFG.MATCH_TOL_SEC || 2;
  let bestTs = null, bestDiff = Infinity;
  for (const ts of tableSecList) {
    const d = Math.abs(ts - s);
    if (d <= tol && d < bestDiff) { bestDiff = d; bestTs = ts; }
    if (ts > s + tol && bestDiff <= tol) break;
  }
  if (bestTs != null) {
    const a = anchorsBySec.get(bestTs);
    if (Array.isArray(a) && a.length) return a;
  }

  // 3) dopředné okno do MATCH_LOOKAHEAD_SEC – vezmi první řádek, který má kotvy
  const fwd = CFG.MATCH_LOOKAHEAD_SEC || 0;
  if (fwd > 0) {
    for (const ts of tableSecList) {
      if (ts > s && ts <= s + fwd) {
        const a = anchorsBySec.get(ts);
        if (Array.isArray(a) && a.length) return a;
      }
      if (ts > s + fwd) break;
    }
  }
  return [];
}

    const startSec = rows[0].sec;
    const endSec   = rows[rows.length-1].sec;
    const out = [];
    const perSecond = [];
    let lastHitMeshId = null; // ať nelogujeme stejnou MESH víckrát po sobě
    const CROSS_EPS_M = Math.max(0.1, Number(CFG.SNAP_DISTANCE_M) || 1.0);

for (let s = startSec, prevS = startSec; s <= endSec; s++) {
  const dt    = (s === startSec) ? 0 : (s - prevS);
  const v     = speedAtSec(s);         // m/s
  const stepM = v * dt;

  // 1) posun po MIDAXIS
  if (stepM > 0) walker.step(stepM);
  const pos = walker.get();

  // 2) NAJDI NEJBLIŽŠÍ MESH — TADY VZNIKÁ `near`
  const near = nearestMGPS(pos.lat, pos.lng, MGPS);

  // 3) detekce „průseku“ (cross)
  let hit = null;
  if (near && near.m && near.dist <= CROSS_EPS_M) {
    const a_ids = anchorIdsAroundSec(s);              // kotvy z tabulky kolem času s
    const fp    = footprintForId(near.m.id, FOOT_SRC) || [];
    const setFP = new Set(fp.map(Number).filter(Number.isFinite));
    const matched = (a_ids || []).map(Number).filter(n => setFP.has(n));

    hit = {
      mesh_id: near.m.id,
      matched_ids: matched,
      matched_count: matched.length,
      footprint: [...setFP]
    };
    lastHitMeshId = near.m.id;

    // volitelný debug:
    console.log(`CROSS t=${s} mesh=${near.m.id} d=${near.dist.toFixed(2)} a_ids=`, a_ids, 'matched=', matched);
  }

  // 4) rolling průměr + otočka u terminálu
  pushSpeed(v);
  const dStart = haversine_m(pos.lat,pos.lng, startNode.lat,startNode.lng);
  const dEnd   = haversine_m(pos.lat,pos.lng, endNode.lat,  endNode.lng);
  const nearTerminal = (dStart <= (CFG.TURN_PROX_M||3)) || (dEnd <= (CFG.TURN_PROX_M||3));
  const avg = rollAvg();
  if (turnCooldown > 0) turnCooldown--;
  if (nearTerminal && avg > 0 && v <= (CFG.TURN_DROP_RATIO||0.65) * avg && turnCooldown === 0) {
    walker.reverse();
    turnCooldown = CFG.TURN_COOLDOWN_SEC || 20;
  }

  // 5) záznam 1 Hz do ladicího logu
  const baseRow = rows.find(r => r.sec === s);
  const rec = {
    sec: s,
    timestamp: baseRow ? baseRow.ts : `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`,
    timeStr:   baseRow ? baseRow.ts : "00:00:00",   // <- přímo HH:MM:SS z BASIC_TABLE
    time: s * 1000,                                 // <- numeric ms pro výpočty
    lat: pos.lat,
    lng: pos.lng,
    speed_mps: v,
    dist_to_m: near ? near.dist : null,
    ...(hit ? hit : {})
  };
  perSecond.push(rec);

  // 6) vizuální výstup jen v časech z tabulky
  if (tableSecs.has(s)) {
    out.push(rec);
    console.log("ADDING FUSED ROW", s, "timeStr=", rec.timeStr);
  }
  prevS = s;
  }
    // export do okna pro debug/export
    window.fusedLog = { per_second: perSecond, viz_rows: out };
    return out;
  }

  // ---------- Uložení datasetu jako .js (s aktuální strukturou) ----------
  function downloadFgpsJs(fused, filename = "F_GPS_DATASET.js") {
    const payload = {
      generated_at: new Date().toISOString(),
      note: "F_GPS synteticky vypočteno v prohlížeči",
      items: fused.map(r => ({
        TIMESTAMP: r.timestamp,
        F_GPS: { lat: r.lat, lng: r.lng },
        SPEED_MPS: r.speed_mps ?? null,
        DIST_TO_M: r.dist_to_m ?? null,
        MESH_ID: (r.mesh_id != null) ? r.mesh_id : null,
        MATCHED_IDS: Array.isArray(r.matched_ids) ? r.matched_ids : []
      }))
    };
    const js = `// AUTO-GENERATED\nwindow.F_GPS_DATASET = ${JSON.stringify(payload, null, 2)};\n`;
    const blob = new Blob([js], { type: "application/javascript;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  // ---------- Integrace s rendererem ----------
  function runOfflineGNSS() {
    const fused = buildFusedSeries();
    if (!Array.isArray(fused) || !fused.length) {
      alert("FUSED_GPS: Výstup je prázdný (zkontroluj vstupní datasety).");
      return;
    }
    if (typeof window.applyFusedGpsDataset === "function") {
      window.applyFusedGpsDataset(fused);
    } else {
      const ev = new CustomEvent("FUSED_GPS_READY", { detail: { fused } });
      window.dispatchEvent(ev);
    }
  }

// ---------- Expose API ----------
window.FUSED_GPS = {
  setSnapDistance(m) {
    const v = Number(m);
    if (Number.isFinite(v) && v > 0) {
      CFG.SNAP_DISTANCE_M = v;   // používáme i jako CROSS_EPS_M
    }
  },

  buildFusedSeries,
  runOfflineGNSS,
  downloadFgpsJs,

  // Uloží log ve formátu JSON (TIME, F_GPS, SPEED_MPS, DIST_TO_M, MATCHED_IDS, MESH_ID)
  downloadFusedLog(filename) {
    const defName = `F_GPS_LOG_${new Date().toISOString().slice(0,10)}.json`;
    const outName = filename || defName;

    const rows = (window.fusedLog && Array.isArray(window.fusedLog.viz_rows))
      ? window.fusedLog.viz_rows
      : [];

    if (!rows.length) {
      alert("Log je prázdný (nejdřív spusť Offline GNSS).");
      return;
    }

    const items = rows.map(r => ({
      TIME: r.timestamp,
      F_GPS: { lat: r.lat, lng: r.lng },
      SPEED_MPS: r.speed_mps ?? null,
      DIST_TO_M: r.dist_to_m ?? null,
      MATCHED_IDS: Array.isArray(r.matched_ids) ? r.matched_ids : [],
      MESH_ID: (r.mesh_id != null) ? r.mesh_id : null
    }));

    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  },

  _util: { haversine_m, bearing_deg, destinationPoint }
};

// ⬇️⬇️⬇️ PŘIDEJ TADY (tj. těsně nad `})();`) ⬇️⬇️⬇️
Object.defineProperty(window.FUSED_GPS, '_CFG', {
  get: () => CFG,        // jen ke čtení – vrací živou referenci
  enumerable: false
});

window.FUSED_GPS.setCFG = (patch = {}) => {
  if (patch && typeof patch === 'object') Object.assign(CFG, patch);
};
// ⬆️⬆️⬆️ KONEC PŘIDANÉHO KÓDU ⬆️⬆️⬆️

})();
console.log(FUSED_GPS._CFG.MATCH_LOOKAHEAD_SEC);
