// FUSED_GPS.js — samostatný modul (globální objekt window.FUSED_GPS)
// Vstupy očekává jako už načtené <script> soubory:
//  - fixedGpsMesh / FIXED_GPS_MESH / MESH_FIXED_GPS        (síť M_GPS)
//  - BASIC_TABLE_04062025                                  (TIME, SPEED, ANCHOR1..6)
//  - MESH_FIXEDGPS_ANCHFOOTPRINT                           (mapa M_GPS -> Footprint)
//  - MIDAXIS.js                                            (středová osa; "koleje")
//  - ANCHORID_TO_COMPASSANGLE.js (volitelně)               (sekvence kotev -> kompas)

// Global state for tracking crossing mode - when vehicle is near intersection points
// CROSS_MODE removed - using crossMode object instead

(function () {
  const EARTH_R = 6371008.8; // m

  // Configuration object containing all processing parameters
  const CFG = {
    SNAP_DISTANCE_M:    1,     // Distance threshold for M_GPS proximity matching (also used as CROSS_EPS_M)
    FORCE_SNAP_M:       1.0,   // (currently unused, kept for debugging purposes)
    MATCH_THRESHOLD:    0.20,  // 20% anchor ID match threshold (currently used for info only)
    COMPASS_WINDOW_SEC: 20,    // Optional compass calculation window
    START: { lat: 50.04389397, lng: 15.07552375, ts: "06:54:44" }, // Starting position and time
    CROSS_POINTS: [
    { name: "A/B/F", lat: 50.04428936316578, lng: 15.073755198140931, segA: "A", segF: "F" },
    { name: "G/B/B_mezzanin", lat: 50.04444421683579, lng: 15.072979748050967, segG: "G", segB: "B" }
    ],
    // Terminal turn detection parameters (for dead-end handling)
    TURN_PROX_M:        3,     // Proximity to terminal for turn detection
    TURN_DROP_RATIO:    0.65,  // Speed drop ratio relative to rolling average (triggers turn)
    ROLL_WIN_SEC:       10,    // Rolling window size for speed averaging
    TURN_COOLDOWN_SEC:  20,    // Cooldown period after turn to prevent oscillation

    // Time matching parameters: F_GPS (1 Hz) vs table TIME (every 3-4 seconds)
    MATCH_TOL_SEC:      4,      // Time window for finding nearest TIME entry
    MATCH_LOOKAHEAD_SEC: 25   // Forward-looking window for anchor matching (seconds) - ZVĚTŠENO
  };

  // ---------- Utility functions: time and geospatial calculations ----------
  
  // Convert HH:MM:SS time string to seconds since midnight
  function parseHmsToSec(hms) {
    if (!hms) return null;
    const s = String(hms).trim();
    const m = s.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
  }

  // Calculate distance between two geographic points using Haversine formula
  function haversine_m(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const dφ = (lat2 - lat1) * Math.PI / 180;
    const dλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.sqrt(a));
  }

  // Calculate bearing (direction) from point 1 to point 2 in degrees
  function bearing_deg(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const λ1 = lon1 * Math.PI / 180, λ2 = lon2 * Math.PI / 180;
    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    let θ = Math.atan2(y, x) * 180 / Math.PI;
    if (θ < 0) θ += 360;
    return θ;
  }

  // Calculate destination point given starting position, bearing, and distance
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

  // Utility function to get unique values from array
  const uniq = (arr) => [...new Set(arr)];

  // ---------- Dataset structure reading functions ----------
  
  // Extract latitude/longitude from various data formats (flexible coordinate parsing)
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

  // Load and normalize M_GPS mesh data from various possible global variables
  function getMGpsList() {
    let src = [];
    if (typeof fixedGpsMesh !== "undefined") src = fixedGpsMesh;
    else if (typeof FIXED_GPS_MESH !== "undefined") src = FIXED_GPS_MESH;
    else if (typeof MESH_FIXED_GPS !== "undefined") src = MESH_FIXED_GPS;
    else if (window.fixedGpsMesh) src = window.fixedGpsMesh;

    // Normalize mesh data structure and filter out invalid coordinates
    return (src || []).map((o, idx) => {
      const ll = getLatLng(o);
      return { id: o.id ?? o.ID ?? o.code ?? idx, lat: ll?.lat, lng: ll?.lng, raw: o, idx };
    }).filter(o => Number.isFinite(o.lat) && Number.isFinite(o.lng));
  }
// ---------- Footprint data source ----------
// Load footprint mapping data from various possible global variables
function getFootSrc() {
  // Prefer uppercase variable names first
  if (typeof MESH_FIXEDGPS_ANCHFOOTPRINT !== "undefined") return MESH_FIXEDGPS_ANCHFOOTPRINT;
  if (window.MESH_FIXEDGPS_ANCHFOOTPRINT) return window.MESH_FIXEDGPS_ANCHFOOTPRINT;

  // Try camelCase variant from dataset
  if (window.meshFixedGpsAnchFootprint) return window.meshFixedGpsAnchFootprint;

  // Tolerate typo with ANCHOR instead of ANCH
  if (window.MESH_FIXEDGPS_ANCHORFOOTPRINT) return window.MESH_FIXEDGPS_ANCHORFOOTPRINT;

  return [];
}

  // Extract speed value from table row, trying various possible field names
  function getRowSpeed(row) {
    const cands = ["SPEED", "speed", "VEL", "velocity", "v"];
    for (const k of cands) if (k in row && typeof row[k] === "number") return row[k];
    for (const k of cands) if (k in row) { const n = Number(row[k]); if (Number.isFinite(n)) return n; }
    return 0;
  }

  // Get path points from MIDAXIS data or fallback to ordered mesh points
  function getPathPoints(MGPS) {
    if (Array.isArray(window.MIDAXIS) && window.MIDAXIS.length > 1) {
      // Use predefined MIDAXIS path (railway tracks)
      return window.MIDAXIS.map(p => {
        const lat = (typeof p.lat === 'number') ? p.lat : (typeof p.LAT === 'number' ? p.LAT : p.Y || p.y);
        const lon = (typeof p.lon === 'number') ? p.lon : (typeof p.LON === 'number' ? p.LON : p.LONG || p.X || p.x);
        return { lat, lng: lon };
      }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    }
    // Fallback: order mesh points as path
    return orderMeshPath(MGPS, CFG.START.lat, CFG.START.lng).map(m => ({ lat: m.lat, lng: m.lng }));
  }

// ---------- Timestamp extraction helper ----------
// Extract timestamp from various possible formats in table rows
function getRowTimestamp(r) {
  if (r.TIME) return r.TIME;            // Direct from dataset
  if (r.ts) return r.ts;                // Already computed
  if (typeof r.timestamp === 'string') {
    return r.timestamp.includes('T')
      ? r.timestamp.slice(11, 19)       // Extract HH:MM:SS from ISO format
      : r.timestamp;
  }
  return "00:00:00";  // Fallback místo null
}


  // Extract anchor IDs from table row, trying various field name patterns
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

  // ---------- Anchor ID matching (informational) ----------
  // Calculate percentage of matching anchor IDs between two sets
  function matchPercent(aIds, mIds) {
    if (!aIds.length || !mIds.length) return 0;
    const A = new Set(aIds), B = new Set(mIds);
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return inter / A.size;
  }

  // ---------- Compass inference (optional) ----------
  // Infer compass direction based on anchor sequence patterns
  function inferCompassAt(timeSec, rowsBySec) {
    try {
      const bySeq = window.ANCHOR_TO_COMPASS_BY_SEQUENCE || {};
      const w = CFG.COMPASS_WINDOW_SEC;
      const seqSeen = [];
      const seen = new Set();
      // Collect anchor sequence within time window
      for (let t = timeSec - w; t <= timeSec + w; t++) {
        const rows = rowsBySec.get(t) || [];
        const ids = uniq(rows.flatMap(readAnchors));
        for (const id of ids) if (!seen.has(id)) { seen.add(id); seqSeen.push(id); }
      }
      const key = seqSeen.join("-");
      if (bySeq[key]) return { ...bySeq[key], code: 10, sequenceKey: key };
      const keyRev = [...seqSeen].reverse().join("-");
      if (bySeq[keyRev]) return { ...bySeq[keyRev], code: 11, sequenceKey: keyRev };
      // Try partial matches for first 3 anchors
      for (const k of Object.keys(bySeq)) {
        const arr = k.split("-").map(Number);
        if (arr.length >= 3 && key.includes(arr.slice(0, 3).join("-"))) return { ...bySeq[k], code: 10, sequenceKey: k };
        if (arr.length >= 3 && keyRev.includes(arr.slice(0, 3).join("-"))) return { ...bySeq[k], code: 11, sequenceKey: k };
      }
    } catch { /* ignore */ }
    return null;
  }

  // ---------- Remove duplicate timestamps ----------
  // Remove consecutive rows with identical timestamps to avoid processing duplicates
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

  // ---------- Footprint lookup ----------
  // Find footprint (anchor list) for a given mesh ID
function footprintForId(mid, footSrc) {
  if (!footSrc) return [];
  // Array of objects: search by id/ID/code property
  if (Array.isArray(footSrc)) {
    const hit = footSrc.find(x => x && (x.id === mid || x.ID === mid || x.code === mid));
    if (hit) return hit.Footprints || hit.Footprint || hit.anchors || [];
    return [];
  }
  // Object dictionary
  const node = footSrc[mid] || footSrc[String(mid)];
  if (node) return node.Footprints || node.Footprint || node.anchors || [];
  return [];
}


  // ---------- Order mesh points as fallback path ----------
  // Create ordered path from mesh points using nearest-neighbor algorithm
  function orderMeshPath(MGPS, startLat, startLng) {
    if (!MGPS.length) return [];
    const byId = new Map(MGPS.map(m => [m.id, m]));
    // Find starting point closest to given coordinates
    let current = MGPS.reduce((best, m) => {
      const d = haversine_m(startLat, startLng, m.lat, m.lng);
      return (!best || d < best.d) ? { m, d } : best;
    }, null).m;
    const unvisited = new Set(MGPS.map(m => m.id));
    const ordered = [];
    unvisited.delete(current.id);
    ordered.push(current);
    // Greedy nearest-neighbor path construction
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

  // ---------- Find nearest MESH point ----------
  // Find the closest mesh point to given coordinates
  function nearestMGPS(lat, lng, MGPS) {
    let best = null, bestD = Infinity;
    for (const m of MGPS) {
      const d = haversine_m(lat, lng, m.lat, m.lng);
      if (d < bestD) { bestD = d; best = m; }
    }
    return { m: best, dist: bestD };
  }

  // ---------- Path walker along "tracks" ----------
  // Calculate segment length in meters
  function segLenM(a,b){ return haversine_m(a.lat,a.lng,b.lat,b.lng); }

  // Create a walker that moves along a predefined path (railway tracks)
  function makePathWalker(path, startLat, startLng) {
    let curr={lat:startLat,lng:startLng};
    let seg=0, t=0, dir=+1; // +1 forward, -1 backward

    // Initialize walker position by finding nearest point on path
    (function locateNearest(){
      let best={d:Infinity, seg:0, t:0};
      for (let i=0;i<path.length-1;i++){
        const A=path[i], B=path[i+1];
        const L=segLenM(A,B);
        const br=bearing_deg(A.lat,A.lng,B.lat,B.lng);
        // Sample 10 points along each segment to find closest
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

    // Move walker by specified distance along path
    function stepOnce(remain){
      const A=path[seg], B=path[seg+1];
      const L=segLenM(A,B);
      if (dir>0){ // Moving forward
        const posM=L*t, left=Math.max(0,L-posM);
        if (remain >= left-1e-6) {
          // Move to end of current segment and advance to next
          curr={lat:B.lat,lng:B.lng};
          seg = Math.min(seg+1, path.length-2);
          t=0;
          return remain-left;
        } else {
          // Move within current segment
          const br=bearing_deg(curr.lat,curr.lng,B.lat,B.lng);
          curr=destinationPoint(curr.lat,curr.lng,br,remain);
          t += remain/L;
          return 0;
        }
      } else { // Moving backward
        const posM=L*t, left=posM;
        if (remain >= left-1e-6) {
          // Move to start of current segment and go to previous
          curr={lat:A.lat,lng:A.lng};
          seg = Math.max(seg-1, 0);
          t= (seg===0? 0 : 1);
          return remain-left;
        } else {
          // Move within current segment
          const br=bearing_deg(curr.lat,curr.lng,A.lat,A.lng);
          curr=destinationPoint(curr.lat,curr.lng,br,remain);
          t -= remain/L;
          return 0;
        }
      }
    }

    // Main step function - move walker by distance, handling path endpoints
    function step(distM){
      let rem = distM;
      while (rem>0) {
        // Reverse direction at path endpoints (terminal handling)
        if (dir>0 && seg===path.length-2 && t>=1-1e-6) dir=-1;
        if (dir<0 && seg===0 && t<=1e-6) dir=+1;
        const before=rem;
        rem = stepOnce(rem);
        // Prevent infinite loops
        if (Math.abs(rem-before) < 1e-9) break;
      }
      return get();
    }

    // Walker API functions
    const get = ()=>({lat:curr.lat,lng:curr.lng, seg, t, dir});
    const reverse = ()=>{ dir = -dir; };
    return { get, step, reverse, dir:()=>dir };
  }

  // ---------- Simple visualization log download ----------
  // Download processed GPS data as JSON file for analysis
  function downloadFusedLog(filename) {
    try {
      const rows = (window.fusedLog && Array.isArray(window.fusedLog.viz_rows))
        ? window.fusedLog.viz_rows : [];

      if (!rows.length) {
        alert("Log is empty (run Offline GNSS first).");
        return;
      }

      // Format data for export
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
      alert("Error generating log: " + e.message);
    }
  }

  // ---------- Main calculation function ----------
function buildFusedSeries() {
  console.log("🚀 [BUILD-START] buildFusedSeries called");

  console.log(`⚙️ [CONFIG] SNAP_DIST: ${CFG.SNAP_DISTANCE_M}, LOOKAHEAD: ${CFG.MATCH_LOOKAHEAD_SEC}`);
  console.log(`⚙️ [CONFIG] CROSS_EPS: ${CFG.SNAP_DISTANCE_M}, MATCH_TOL: ${CFG.MATCH_TOL_SEC}`);

  const MGPS = getMGpsList();
  const FOOT_SRC = getFootSrc();
  console.log("FOOT_SRC:", Array.isArray(FOOT_SRC) ? `array(${FOOT_SRC.length})` : typeof FOOT_SRC);

  const TABLESRC = (typeof BASIC_TABLE_04062025 !== "undefined")
    ? BASIC_TABLE_04062025
    : (window.BASIC_TABLE_04062025 || []);
  const rowsRaw = Array.isArray(TABLESRC) ? TABLESRC : [];

  rowsRaw.forEach(r => {
    if (r.TIME && !r.ts) {
      r.ts = r.TIME;
      r.sec = toSeconds(r.TIME);
    }
  });

  console.log("🔍 [DEBUG] MGPS.length=", MGPS.length, "rowsRaw.length=", rowsRaw.length);
  if (!MGPS.length || !rowsRaw.length) {
    console.warn("FUSED_GPS: Missing FIXED_GPS_MESH or BASIC_TABLE_04062025.");
    console.warn("🔍 [DEBUG] MGPS:", MGPS, "rowsRaw:", rowsRaw);
    return [];
  }

  const PATH = getPathPoints(MGPS);
  const walker = makePathWalker(PATH, CFG.START.lat, CFG.START.lng);
  

  const rollWin = CFG.ROLL_WIN_SEC || 10;
  const q = [];
  let qSum = 0;
  function pushSpeed(v){
    const val = Math.max(0, +v || 0);
    q.push(val); qSum += val;
    while (q.length > rollWin) qSum -= q.shift();
  }
  function rollAvg(){ return q.length ? (qSum / q.length) : 0; }


  const rows = dedupRows(rowsRaw).map(r => {
    const ts  = getRowTimestamp(r);
    const sec = parseHmsToSec(ts);
    return { ts, sec, speed: getRowSpeed(r), a_ids: readAnchors(r) };
  }).filter(x => x.sec != null).sort((a,b)=>a.sec-b.sec);

  if (!rows.length) return [];

  const tableSecs = new Set(rows.map(r=>r.sec));
  const anchorsBySec = new Map(rows.map(r=>[r.sec, r.a_ids]));
  
  // CROSS MODE state tracking
let crossMode = {
  active: false,
  crossing: null,
  decision: null,
  targetMesh: null,
  startTime: null,
  waiting: false
};
if (!window.FUSED_GPS) window.FUSED_GPS = {};
window.FUSED_GPS.crossMode = crossMode;

  // === Time domain z BASIC_TABLE + kurzor po řádcích (MUSÍ být před použitím) ===
  const startSec = rows.length ? rows[0].sec : 0;           // ← ŘÁDEK 477 - NOVÝ
  const endSec   = rows.length ? rows[rows.length - 1].sec : 0;  // ← ŘÁDEK 478 - NOVÝ
  const CROSS_EPS_M = Math.max(0.1, Number(CFG.SNAP_DISTANCE_M) || 1.0);

  function speedAtSec(s){
    let v = 0;
    for (let i=rows.length-1;i>=0;i--){
      if (rows[i].sec <= s) { v = rows[i].speed || 0; break; }
    }
    return Math.max(0, +v || 0);
  }

   // Převod "HH:MM:SS" → ms od půlnoci
function parseTimeToMs(str) {
  if (!str || typeof str !== "string") return NaN;
  const parts = str.split(":");
  if (parts.length !== 3) return NaN;
  const [hh, mm, ss] = parts.map(Number);
  if ([hh, mm, ss].some(n => isNaN(n))) return NaN;
  return ((hh * 3600) + (mm * 60) + ss) * 1000;
}

  // --- hlavní smyčka ---
// --- ROW-BASED loop (no 1Hz counter) ---
const out = [];
const perSecond = [];  // necháváme pro kompatibilitu exportu/logů
let lastSec = rows[0].sec;            // pro výpočet dt mezi řádky
let turnCooldown = 0;

for (let i = 0; i < rows.length; i++) {
  const baseRow = rows[i];
  const s       = baseRow.sec;              // používáme jen pro logy & time
  const dt      = Math.max(0, s - lastSec); // delta sekund mezi řádky
  const v       = Math.max(0, +baseRow.speed || 0);  // m/s z řádku
  const stepM   = v * dt;

  // 1) posun po MIDAXIS
  if (stepM > 0) walker.step(stepM);
  const pos = walker.get();

  // 2) nejbližší MESH
  const near = nearestMGPS(pos.lat, pos.lng, MGPS);

  // 3) výchozí pozice
  let latFinal = pos.lat;
  let lngFinal = pos.lng;

  // 4) RAW ID JEN Z ŘÁDKU (žádné lookupy podle času!)
  const rawIds = baseRow.a_ids || [];

  // 5) Shoda s footprintem (pokud u Mesh bodu)
  let hit = null;
  if (near && near.m && near.dist <= Math.max(0.1, Number(CFG.SNAP_DISTANCE_M) || 1.0)) {
    const fp    = footprintForId(near.m.id, FOOT_SRC) || [];
    const setFP = new Set(fp.map(Number).filter(Number.isFinite));
    const matched = rawIds.map(Number).filter(n => setFP.has(n));
    hit = {
      mesh_id: near.m.id,
      matched_ids: matched,
      matched_count: matched.length,
      footprint: [...setFP],
      raw_ids: rawIds
    };
  }

  // 6) aktivace CROSS MODE blízko křižovatky (10 m)
  if (!crossMode.active) {
    for (const cross of CFG.CROSS_POINTS) {
      const d = haversine_m(latFinal, lngFinal, cross.lat, cross.lng);
      if (d < 10) {
        crossMode.active    = true;
        crossMode.crossing  = cross;
        crossMode.decision  = null;
        crossMode.startTime = s;
        window.FUSED_GPS.crossMode = crossMode;
        // snapni marker na střed křižovatky při čekání
        latFinal = cross.lat;
        lngFinal = cross.lng;
        break;
      }
    }
  } else {
    // jsme v CROSS MODE → rozhodování jen podle recentních řádků (±15 s kolem s)
    const timeWindow = 15;
    const startWin   = s - timeWindow;
    const endWin     = s + timeWindow;

    let seenA = false, seenF = false, seen13Later = false;

    for (let j = 0; j < rows.length; j++) {
      const rj = rows[j];
      if (rj.sec < startWin) continue;
      if (rj.sec > endWin)   break;
      // A = 11/12/13, F = 37/38/45
      if (rj.a_ids?.some(id => id === 11 || id === 12 || id === 13)) seenA = true;
      if (rj.a_ids?.some(id => id === 37 || id === 38 || id === 45)) seenF = true;
    }
    // predikce 13 vpřed (do +25 s)
    for (let j = i; j < rows.length && rows[j].sec <= s + 25; j++) {
      if (rows[j].a_ids?.includes(13)) { seen13Later = true; break; }
    }

    let decision = null;
    if (seen13Later || seenA) {
      decision = "A";
    } else if (seenF) {
      // čekáme max 30 s, pak fallback F
      const waited = crossMode.startTime ? (s - crossMode.startTime) : 0;
      decision = (waited >= 30) ? "F" : null;
    } else {
      decision = null;
    }

    if (decision === "A") {
      // přesun na vstup do A (tvá helper funkce)
      const entry = findSegmentAEntryPoint(latFinal, lngFinal);
      latFinal = entry.lat; lngFinal = entry.lng;
      crossMode.active = false; crossMode.decision = "A"; crossMode.crossing = null;
      window.FUSED_GPS.crossMode = crossMode;
    } else if (decision === "F") {
      const edge = findTargetPolygonEdge(decision, latFinal, lngFinal);
      if (edge) {
        latFinal = edge.lat; lngFinal = edge.lng;
        crossMode.active = false; crossMode.decision = "F"; crossMode.crossing = null;
        window.FUSED_GPS.crossMode = crossMode;
      }
    } else {
      // waiting → držíme střed křižovatky
      latFinal = crossMode.crossing.lat;
      lngFinal = crossMode.crossing.lng;
    }
  }

  // 7) záznam jednoho “řádkového” rec
  const rec = {
    sec: s,
    timeStr: baseRow.ts,
    time: s * 1000,             // milliseconds od půlnoci (stačí pro tvé HUD)
    lat: latFinal,
    lng: lngFinal,
    speed_mps: v,
    dist_to_m: near ? near.dist : null,
    ...(hit ? hit : {}),
    raw_ids: rawIds,
    crossDecision: crossMode.decision || null,
    crossDebugHtml: null,
    crossMode: {
      active: !!crossMode.active,
      crossing: crossMode.crossing || null,
      decision: crossMode.decision || null
    }
  };

  // Debug – ať vidíš, že startuješ u 06:54:44
  if (i < 5) {
    console.log(`[ROW-START ${i}] ts=${rec.timeStr}, raw_ids=[${rawIds.join(", ")}]`);
  }

  perSecond.push(rec);
  out.push(rec);          // vizualizuj každý řádek BASIC_TABLE

  lastSec = s;
}

// export pro renderer/uložení
window.fusedLog = { per_second: perSecond, viz_rows: out };
return out;

}

  function findClosestRow(rows, sec) {
  let best = null, bestDiff = Infinity;
  for (const r of rows) {
    const rowSec = r.sec ?? toSeconds(r.ts ?? r.TIME);
    if (rowSec == null) continue;
    const diff = Math.abs(rowSec - sec);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best;
}

function toSeconds(str) {
  if (!str || typeof str !== "string") return NaN;
  const [h, m, s] = str.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}


function extractAnchorIds(row) {
  const ids = [];
  for (let i = 1; i <= 50; i++) { // nebo podle počtu sloupců
    const val = row[`ANCHOR${i}`];
    if (val && !isNaN(val)) ids.push(Number(val));
  }
  return ids;
}

  // ---------- Save dataset as .js (with current structure) ----------
  
  function downloadFgpsJs(fused, filename = "F_GPS_DATASET.js") {
    const payload = {
      generated_at: new Date().toISOString(),
      note: "F_GPS synthetically calculated in browser",
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

  // ---------- Integration with renderer ----------
  // Main entry point for running the GPS fusion algorithm
  function runOfflineGNSS() {
    console.log("🚀 [RUN-OFFLINE] runOfflineGNSS called");
    const fused = buildFusedSeries();
    if (!Array.isArray(fused) || !fused.length) {
      alert("FUSED_GPS: Output is empty (check input datasets).");
      return;
    }
    if (typeof window.applyFusedGpsDataset === "function") {
      window.applyFusedGpsDataset(fused);
    } else {
      const ev = new CustomEvent("FUSED_GPS_READY", { detail: { fused } });
      window.dispatchEvent(ev);
    }
   }   

window.runOfflineGNSS = runOfflineGNSS;

// ---------- Expose public API ----------
window.FUSED_GPS = {
  // Configure snap distance threshold
  setSnapDistance(m) {
    const v = Number(m);
    if (Number.isFinite(v) && v > 0) {
      CFG.SNAP_DISTANCE_M = v;   // also used as CROSS_EPS_M
    }
  },

  // Core functions
  buildFusedSeries,
  runOfflineGNSS,
  downloadFgpsJs,

  // Save log in JSON format (TIME, F_GPS, SPEED_MPS, DIST_TO_M, MATCHED_IDS, MESH_ID)
  downloadFusedLog(filename) {
    const defName = `F_GPS_LOG_${new Date().toISOString().slice(0,10)}.json`;
    const outName = filename || defName;

    const rows = (window.fusedLog && Array.isArray(window.fusedLog.viz_rows))
      ? window.fusedLog.viz_rows
      : [];

    if (!rows.length) {
      alert("Log is empty (run Offline GNSS first).");
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

  // Utility functions for external use
  _util: { haversine_m, bearing_deg, destinationPoint }
};

// Configuration access and modification functions
Object.defineProperty(window.FUSED_GPS, '_CFG', {
  get: () => CFG,        // read-only – returns live reference
  enumerable: false
});

// Allow runtime configuration updates
window.FUSED_GPS.setCFG = (patch = {}) => {
  if (patch && typeof patch === 'object') Object.assign(CFG, patch);
};

  // ---------- Cross status helper ----------
  // Vrací stav CROSS MODE a vzdálenosti ke křižovatkám pro daný rec
  window.FUSED_GPS.crossStatus = function(rec) {
    if (!rec || !rec.lat || !rec.lng) return null;
    
    try {
      const CROSS_POINTS = CFG.CROSS_POINTS || [];
      if (CROSS_POINTS.length < 2) return null;

      const d1 = haversine_m(rec.lat, rec.lng, CROSS_POINTS[0].lat, CROSS_POINTS[0].lng);
      const d2 = haversine_m(rec.lat, rec.lng, CROSS_POINTS[1].lat, CROSS_POINTS[1].lng);

      return {
        mode: rec.crossMode || { active: false },   // ✅ vezme hodnotu uloženou v rec
        distances: { d1, d2 },
        anchors: rec.matched_ids || []
      };
    } catch (error) {
      console.error("❌ [CROSS-STATUS] Error:", error);
      return null;
    }
  };
})();
