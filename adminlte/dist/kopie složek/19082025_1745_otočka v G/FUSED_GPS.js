// FUSED_GPS.js — samostatný modul (globální objekt window.FUSED_GPS)
// Vstupy očekává jako už načtené <script> soubory:
//  - fixedGpsMesh / FIXED_GPS_MESH / MESH_FIXED_GPS        (síť M_GPS)
//  - BASIC_TABLE_04062025                                  (TIME, SPEED, ANCHOR1..6)
//  - MESH_FIXEDGPS_ANCHFOOTPRINT                           (mapa M_GPS -> Footprint)
//  - ANCHORID_TO_COMPASSANGLE.js (volitelně)               (sekvence kotev -> kompas)

(function () {
  const EARTH_R = 6371008.8; // m

  const CFG = {
    SNAP_DISTANCE_M: 2,      // práh přiblížení k M_GPS pro test shody
    FORCE_SNAP_M: 1.0,           // ← nový: bezpodmínečný snap na MESH, když jsme ≤ 1 m
    MATCH_THRESHOLD: 0.60,   // 60 % shody A_ID
    COMPASS_WINDOW_SEC: 20,  // pro inferenci kompasu z pořadí kotev
    START: { lat: 50.04389397, lng: 15.07552375, ts: "06:54:44" },
    TARGET_HOP_EPS_M: 0.5,   // ← když jsme blíž než 0.5 m k cíli, bereme druhý nejbližší // výchozí bod
    TURN_PROX_M: 3,          // blízkost k začátku/konce MIDAXIS pro otočku
    TURN_DROP_RATIO: 0.65,   // propad rychlosti vůči roll. průměru
    ROLL_WIN_SEC: 10,        // okno pro roll. průměr rychlosti
    TURN_COOLDOWN_SEC: 20    // po otočce ignoruj další 20 s

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
      const lat = (typeof o.lat === 'number') ? o.lat : (typeof o.LAT === 'number' ? o.LAT : o.y);
      const lon = (typeof o.lon === 'number') ? o.lon : (typeof o.lng === 'number' ? o.lng : (typeof o.LONG === 'number' ? o.LONG : o.x));
      return { id: o.id ?? o.ID ?? o.code ?? idx, lat, lng: lon, raw: o, idx };
    }).filter(o => Number.isFinite(o.lat) && Number.isFinite(o.lng));
  }

  function getFootSrc() {
    if (window.MESH_FIXEDGPS_ANCHFOOTPRINT) return window.MESH_FIXEDGPS_ANCHFOOTPRINT;
    if (typeof MESH_FIXEDGPS_ANCHFOOTPRINT !== "undefined") return MESH_FIXEDGPS_ANCHFOOTPRINT;
    return window.MESH_FIXEDGPS_ANCHFOOTPRINT || {};
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

  // ---------- Shoda A_ID ----------
  function matchPercent(aIds, mIds) {
    if (!aIds.length || !mIds.length) return 0;
    const A = new Set(aIds), B = new Set(mIds);
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return inter / A.size;
  }

  // ---------- Kompas z pořadí kotev (volitelné) ----------
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

  // ---------- Dedup TIMESTAMP (ignoruj druhý shodný čas) ----------
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

  // ---------- Footprint zdroj + vyhledání pro dané M_ID ----------
  function getFootSrc() {
    if (typeof MESH_FIXEDGPS_ANCHFOOTPRINT !== "undefined") return MESH_FIXEDGPS_ANCHFOOTPRINT;
    return window.MESH_FIXEDGPS_ANCHFOOTPRINT || {};
  }
  function footprintForId(mid, footSrc) {
    if (!footSrc) return [];
    // Array varianta
    if (Array.isArray(footSrc)) {
      // zkuste index
      if (Number.isInteger(mid) && footSrc[mid]) {
        return footSrc[mid].Footprints || footSrc[mid].Footprint || footSrc[mid].anchors || [];
      }
      // zkuste vyhledat podle id/ID/code
      const hit = footSrc.find(x => x && (x.id === mid || x.ID === mid || x.code === mid));
      if (hit) return hit.Footprints || hit.Footprint || hit.anchors || [];
      return [];
    }
    // Objekt varianta
    const node = footSrc[mid] || footSrc[String(mid)];
    if (node) return node.Footprints || node.Footprint || node.anchors || [];
    return [];
  }
  // Seřadí MESH body do monotónní trasy od startu (greedy nearest-neighbor)
  function orderMeshPath(MGPS, startLat, startLng) {
    if (!MGPS.length) return [];
    const byId = new Map(MGPS.map(m => [m.id, m]));

  // začneme bodem nejblíž ke START
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

  // Nejbližší MESH bod k dané pozici
  function nearestMGPS(lat, lng, MGPS) {
    let best = null, bestD = Infinity;
    for (const m of MGPS) {
      const d = haversine_m(lat, lng, m.lat, m.lng);
      if (d < bestD) { bestD = d; best = m; }
    }
    return { m: best, dist: bestD };
  }

  function segLenM(a,b){ return haversine_m(a.lat,a.lng,b.lat,b.lng); }

function makePathWalker(path, startLat, startLng) {
  let curr={lat:startLat,lng:startLng};
  let seg=0, t=0, dir=+1; // +1 vpřed, -1 zpět

  // najdi nejbližší segment (hrubě vzorkováním)
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
      const posM=L*t, left=posM; // kolik zbývá k začátku
      if (remain >= left-1e-6) {
        curr={lat:A.lat,lng:A.lng};
        seg = Math.max(seg-1, 0);
        t= (seg===0? 0 : 1); // když jsme na úplném startu
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
      // pokud jsme na okraji path, odraz se
      if (dir>0 && seg===path.length-2 && t>=1-1e-6) dir=-1;
      if (dir<0 && seg===0 && t<=1e-6) dir=+1;
      const before=rem;
      rem = stepOnce(rem);
      // bezpečnostní pojistka
      if (Math.abs(rem-before) < 1e-9) break;
    }
    return get();
  }

  const get = ()=>({lat:curr.lat,lng:curr.lng, seg, t, dir});
  const reverse = ()=>{ dir = -dir; };
  return { get, step, reverse, dir:()=>dir };
}



  // ======================================================================
  //                       HLAVNÍ VÝPOČETNÍ FUNKCE
  // ======================================================================
function buildFusedSeries() {
  const MGPS = getMGpsList();
  const FOOT_SRC = getFootSrc();

  const TABLESRC = (typeof BASIC_TABLE_04062025 !== "undefined")
    ? BASIC_TABLE_04062025
    : (window.BASIC_TABLE_04062025 || []);
  const rowsRaw = Array.isArray(TABLESRC) ? TABLESRC : [];

  if (!MGPS.length || !rowsRaw.length) {
    console.warn("FUSED_GPS: chybí FIXED_GPS_MESH (resp. CORR_) nebo BASIC_TABLE_04062025.");
    return [];
  }

  // — path na „kolejích“
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

  // — připrav data z tabulky
  const rows = dedupRows(rowsRaw).map(r => {
    const ts  = getRowTimestamp(r);
    const sec = parseHmsToSec(ts);
    return { ts, sec, speed: getRowSpeed(r), a_ids: readAnchors(r) };
  }).filter(x => x.sec != null).sort((a,b)=>a.sec-b.sec);

  const tableSecs = new Set(rows.map(r=>r.sec));
  const anchorsBySec = new Map(rows.map(r=>[r.sec, r.a_ids]));
  // „last known speed“ podle času
  function speedAtSec(s){
    // najdi poslední řádek s sec<=s
    let v = 0;
    for (let i=rows.length-1;i>=0;i--){
      if (rows[i].sec <= s) { v = rows[i].speed || 0; break; }
    }
    return Math.max(0, +v || 0);
  }

  const startSec = rows[0].sec;
  const endSec   = rows[rows.length-1].sec;

  // — parametry prahu
  const CROSS_EPS_M = Math.max(0.1, CFG.SNAP_DISTANCE_M || 1.0);

  const out = [];
  const perSecond = [];
  let lastHitMeshId = null;   // loguj „průsek“ jen při změně

  for (let s = startSec, prevS = startSec; s <= endSec; s++) {
    const dt = (s === startSec) ? 0 : (s - prevS);
    const v  = speedAtSec(s);           // m/s
    const stepM = v * dt;

  // 1) posun po MIDAXIS přesně jednou
    if (stepM > 0) walker.step(stepM);
    const pos = walker.get();

  // 2) nejbližší MESH (po posunu)
    const near = nearestMGPS(pos.lat, pos.lng, MGPS);

  // 3) detekce „průseku“ (cross)
    let hit = null;
    if (near.m && near.dist <= CROSS_EPS_M && near.m.id !== lastHitMeshId) {
      const a_ids = anchorsBySec.get(s) || [];
      const fp = footprintForId(near.m.id, FOOT_SRC) || [];
      const setFP = new Set(fp.map(Number).filter(Number.isFinite));
      const matched = a_ids.map(Number).filter(n => setFP.has(n));

      hit = {
        mesh_id: near.m.id,
        matched_ids: matched,
        matched_count: matched.length,
        footprint: [...setFP]
      };
      lastHitMeshId = near.m.id; // abys zapsal jen poprvé
    }

  // 4) rolling průměr rychlosti + otočka u terminálu
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
    const rec = {
      sec: s,
      timestamp: `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`,
      lat: pos.lat, lng: pos.lng,
      speed_mps: v,
      dist_to_m: near.dist,
      ...(hit ? hit : {})
    };
    perSecond.push(rec);

  // 6) výstup pro vizualizaci jen v časech z tabulky
    if (tableSecs.has(s)) {
      out.push({
        timestamp: rec.timestamp,
        time: s * 1000,
        lat: rec.lat, lng: rec.lng,
        speed_mps: rec.speed_mps,
        dist_to_m: Math.round(rec.dist_to_m * 1000) / 1000,
        mesh_id: hit?.mesh_id ?? null,
        matched_count: hit?.matched_count ?? 0,
        matched_ids: hit?.matched_ids ?? []
      });
    }

      prevS = s;
}

// export do okna pro debug/export
  window.fusedLog = { per_second: perSecond, viz_rows: out };
  return out;

  }


  // ---------- Uložení datasetu jako .js ----------
  function downloadFgpsJs(fused, filename = "F_GPS_DATASET.js") {
    const payload = {
      generated_at: new Date().toISOString(),
      note: "F_GPS synteticky vypočteno v prohlížeči",
      items: fused.map(r => ({
        TIMESTAMP: r.timestamp,
        F_GPS: { lat: r.lat, lng: r.lng },
        ANCHOR_FOOTPRINT: r.snapped ? r.anchor_footprint : null,
        MATCH_PERCENT: r.match_pct,
        DIST_TO_M: r.dist_to_m,
        M_ID: r.m_id,
        COMPASS: r.compass
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
        CFG.SNAP_DISTANCE_M = v;   // používáme jako „CROSS_EPS_M“
      }
    },
    buildFusedSeries,
    runOfflineGNSS,
    downloadFgpsJs,
    downloadFusedLog(filename = "FUSED_LOG.json") {
      const blob = new Blob([JSON.stringify(window.fusedLog || {}, null, 2)], {type:"application/json"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
    },
    _util: { haversine_m, bearing_deg, destinationPoint }
  };
})();

