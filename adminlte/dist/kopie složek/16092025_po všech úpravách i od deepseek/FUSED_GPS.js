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
  return null;
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
  // Build fused GPS series by combining mesh data, table data, and path walking
  function buildFusedSeries() {
    console.log("🚀 [BUILD-START] buildFusedSeries called");
    
    // 6. Základní Konfigurační Check (CONFIG DEBUG)
    console.log(`⚙️ [CONFIG] SNAP_DIST: ${CFG.SNAP_DISTANCE_M}, LOOKAHEAD: ${CFG.MATCH_LOOKAHEAD_SEC}`);
    console.log(`⚙️ [CONFIG] CROSS_EPS: ${CROSS_EPS_M}, MATCH_TOL: ${CFG.MATCH_TOL_SEC}`);
    const MGPS = getMGpsList();
    const FOOT_SRC = getFootSrc();
      console.log("FOOT_SRC:", Array.isArray(FOOT_SRC) ? `array(${FOOT_SRC.length})` : typeof FOOT_SRC);

    // Load table data with anchor readings and timestamps
    const TABLESRC = (typeof BASIC_TABLE_04062025 !== "undefined")
      ? BASIC_TABLE_04062025
      : (window.BASIC_TABLE_04062025 || []);
    const rowsRaw = Array.isArray(TABLESRC) ? TABLESRC : [];

    console.log("🔍 [DEBUG] MGPS.length=", MGPS.length, "rowsRaw.length=", rowsRaw.length);
    if (!MGPS.length || !rowsRaw.length) {
      console.warn("FUSED_GPS: Missing FIXED_GPS_MESH or BASIC_TABLE_04062025.");
      console.warn("🔍 [DEBUG] MGPS:", MGPS, "rowsRaw:", rowsRaw);
      return [];
    }

    // Initialize path and walker for movement simulation
    const PATH = getPathPoints(MGPS);
    const walker = makePathWalker(PATH, CFG.START.lat, CFG.START.lng);
    const startNode = PATH[0];
    const endNode   = PATH[PATH.length-1];

    // Rolling window for speed averaging (used for turn detection)
    const rollWin = CFG.ROLL_WIN_SEC || 10;
    const q = [];
    let qSum = 0;
    function pushSpeed(v){
      const val = Math.max(0, +v || 0);
      q.push(val); qSum += val;
      while (q.length > rollWin) qSum -= q.shift();
    }
    function rollAvg(){ return q.length ? (qSum / q.length) : 0; }

    let turnCooldown = 0; // in seconds

    // --- Prepare table data ---
    // Process and normalize table rows with timestamps, speeds, and anchor IDs
  const rows = dedupRows(rowsRaw).map(r => {
    const ts  = getRowTimestamp(r);    // Always returns HH:MM:SS or 00:00:00
    const sec = parseHmsToSec(ts);
    return { ts, sec, speed: getRowSpeed(r), a_ids: readAnchors(r) };
  }).filter(x => x.sec != null).sort((a,b)=>a.sec-b.sec);

    if (!rows.length) return [];

    // Create lookup structures for efficient time-based queries
    const tableSecs = new Set(rows.map(r=>r.sec));
    const anchorsBySec = new Map(rows.map(r=>[r.sec, r.a_ids]));
    const tableSecList = [...tableSecs].sort((a,b)=>a - b);

    // Initialize main processing loop variables
    const startSec = rows[0].sec;
    const endSec   = rows[rows.length-1].sec;
    const out = [];           // Output for visualization (table timestamps only)
    const perSecond = [];     // Full 1Hz debug log
    let lastHitMeshId = null; // Avoid logging same MESH multiple times consecutively
    const CROSS_EPS_M = Math.max(0.1, Number(CFG.SNAP_DISTANCE_M) || 1.0);

    // Get speed value at specific time (interpolated from table data)
    function speedAtSec(s){
      let v = 0;
      for (let i=rows.length-1;i>=0;i--){
        if (rows[i].sec <= s) { v = rows[i].speed || 0; break; }
      }
      return Math.max(0, +v || 0);
    }
    
    // Find anchor IDs around specific time using multiple strategies
    function anchorIdsAroundSec(s) {
  // 1) Exact match at time s
  if (anchorsBySec.has(s)) {
    const a = anchorsBySec.get(s);
    if (Array.isArray(a) && a.length) return a;
  }

  // 2) Nearest within ±MATCH_TOL_SEC tolerance
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

  // 3) Forward-looking window up to MATCH_LOOKAHEAD_SEC - take first row with anchors
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

    // --- CROSSING decision logic ---
    // Predefined intersection points where route decisions are made
    const CROSS_POINTS = [
      { name: "A/B/F", lat: 50.04428936316578, lng: 15.073755198140931, segA: "A", segF: "F" },
      { name: "G/B/B_mezzanin", lat: 50.04444421683579, lng: 15.072979748050967, segG: "G", segB: "B" }
    ];
    CFG.CROSS_POINTS = CROSS_POINTS;
  // CROSS MODE state tracking - ROZŠÍŘENÉ O WAITING FLAG
  let crossMode = {
    active: false,
    crossing: null,
    decision: null,
    targetMesh: null,
    startTime: null,
    waiting: false  // NOVÝ FLAG pro renderer
  };
    
    // Expose crossMode to window.FUSED_GPS for debugging
    if (!window.FUSED_GPS) window.FUSED_GPS = {};
    window.FUSED_GPS.crossMode = crossMode;

    // 10. Vizuální Status Log (STATUS DEBUG)
    function logCrossStatus() {
      const status = crossMode.active ? 
        `CROSS MODE ACTIVE (${crossMode.crossing?.name}) for ${s - crossMode.startTime}s` : 
        "NORMAL MODE";
      
      const anchors = hit?.matched_ids?.length ? 
        `Anchors: [${hit.matched_ids.join(',')}]` : 
        "No anchors";
      
      console.log(`🟢 [STATUS] ${status} | ${anchors} | Time: ${baseRow?.ts}`);
    }

    // Expose crossMode and distances to renderer (moved to end of file)

    // Calculate average speed over last N seconds
    function avgSpeedAround(s, N = 10) {
      let sum = 0, cnt = 0;
      for (let i = Math.max(0, s-N); i <= Math.min(endSec, s+N); i++) {
        const v = speedAtSec(i);
        if (Number.isFinite(v)) { sum += v; cnt++; }
      }
      return cnt > 0 ? sum/cnt : 1.0; // fallback 1 m/s
    }

  // Find target polygon edge center based on crossing decision
  function findTargetPolygonEdge(decision, lat, lng) {
    // Get polygon for the target segment
    let polygon = null;
    switch(decision) {
      case 'A': polygon = window.segA_poly; break;
      case 'B': polygon = window.segB_poly; break;
      case 'F': polygon = window.segF_poly; break;
      case 'G': polygon = window.segG_poly; break;
      default: return null;
    }
    
    if (!polygon || !polygon.coordinates || !polygon.coordinates[0]) return null;
    
    const coords = polygon.coordinates[0]; // First ring of polygon
    let closestEdge = null;
    let minDist = Infinity;
    let closestEdgeCenter = null;
    
    // Find closest edge of polygon
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      
      // Calculate edge center
      const edgeCenterLat = (p1[1] + p2[1]) / 2;
      const edgeCenterLng = (p1[0] + p2[0]) / 2;
      
      // Calculate distance from current position to edge center
      const dist = haversine_m(lat, lng, edgeCenterLat, edgeCenterLng);
      
      if (dist < minDist) {
        minDist = dist;
        closestEdge = { p1, p2 };
        closestEdgeCenter = { lat: edgeCenterLat, lng: edgeCenterLng };
      }
    }
    
    console.log(`🎯 [TARGET-EDGE] Segment ${decision}, closest edge center: lat=${closestEdgeCenter.lat.toFixed(6)}, lng=${closestEdgeCenter.lng.toFixed(6)}`);
    
    return closestEdgeCenter;
  }

  // NOVÁ FUNKCE: Najdi vstupní bod pro segment A
  function findSegmentAEntryPoint(currentLat, currentLng) {
    const segA_coords = [
      [15.0747774879861,50.0439940454987],  // Roh 1
      [15.073886377953,50.0442231354994],   // Roh 2  
      [15.073900282052,50.0442579645001],   // Roh 3
      [15.0747913920189,50.0440288745009]   // Roh 4
    ];
    
    // Najdi dva nejbližší rohy k aktuální pozici
    let minDist1 = Infinity, minDist2 = Infinity;
    let closest1 = null, closest2 = null;
    
    for (let i = 0; i < segA_coords.length; i++) {
      const dist = haversine_m(currentLat, currentLng, segA_coords[i][1], segA_coords[i][0]);
      if (dist < minDist1) {
        minDist2 = minDist1;
        closest2 = closest1;
        minDist1 = dist;
        closest1 = i;
      } else if (dist < minDist2) {
        minDist2 = dist;
        closest2 = i;
      }
    }
    
    // Vypočti střed spojnice dvou nejbližších rohů
    const roh1 = segA_coords[closest1];
    const roh2 = segA_coords[closest2];
    const midLat = (roh1[1] + roh2[1]) / 2;
    const midLng = (roh1[0] + roh2[0]) / 2;
    
    console.log(`🎯 [SEGMENT-A-ENTRY] Closest corners: ${closest1+1}, ${closest2+1}, entry point: lat=${midLat.toFixed(6)}, lng=${midLng.toFixed(6)}`);
    
    return { lat: midLat, lng: midLng };
  }

    // --- Decision making at intersections ---
    
    function decideAtCrossing(s, pos, baseRow, hit) {
  // 1. Hlavní Check Logy (CRITICAL)
  console.log(`🔴 [CROSS-CHECK] TIME: ${baseRow?.ts || "unknown"}, POS: ${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`);
  console.log(`🔴 [CROSS-CHECK] HIT: ${hit ? `MESH=${hit.mesh_id}, ANCHORS=[${hit.matched_ids}]` : 'NO HIT'}`);
  console.log(`🔴 [CROSS-CHECK] MODE: ${crossMode.active ? `ACTIVE (${crossMode.crossing?.name})` : 'INACTIVE'}`);

  const nearCross = CROSS_POINTS.find(c => haversine_m(pos.lat, pos.lng, c.lat, c.lng) < 10);
  if (!nearCross) return null;

  // ZMĚNA: Použijte delší časové okno pro hledání anchorů
  const usable = [];
  const timeWindow = 15; // Zvětšeno na 15 sekund
  
  for (let i = 0; i < rows.length; i++) {
    if (Math.abs(rows[i].sec - s) <= timeWindow) {
      usable.push({ ts: rows[i].ts, ids: rows[i].a_ids });
    }
  }

  // ZMĚNA: Definice anchorů pro segment A
  const segA_anchors = new Set([11, 12, 13]);
  const segF_anchors = new Set([37, 38, 45]);
  
  // 2. Detekce Anchorů (ANCHOR DEBUG)
  const anchor13Detected = usable.some(u => u.ids.includes(13));
  const anchor11_12Detected = usable.some(u => u.ids.some(id => [11, 12].includes(id)));
  const anchor37_38_45Detected = usable.some(u => u.ids.some(id => [37, 38, 45].includes(id)));

  console.log(`🔍 [ANCHOR-DEBUG] A13: ${anchor13Detected}, A11/12: ${anchor11_12Detected}, F37/38/45: ${anchor37_38_45Detected}`);
  console.log(`🔍 [ANCHOR-DEBUG] ALL_USABLE: ${JSON.stringify(usable.map(u => ({ts: u.ts, ids: u.ids})))}`);
  
  // ZMĚNA: Prioritně hledejte ANY anchor ze segmentu A (ne jen všechny)
  const hasAnySegmentA = usable.some(u => u.ids.some(id => segA_anchors.has(id)));
  const hasAnySegmentF = usable.some(u => u.ids.some(id => segF_anchors.has(id)));
  
  // 3. Timing Check Logy (TIMING DEBUG)
  const currentTime = baseRow?.ts || "00:00:00";
  const isCriticalTime = currentTime >= "07:13:00" && currentTime <= "07:14:00";
  const timeInCrossMode = crossMode.startTime ? (s - crossMode.startTime) : 0;

  if (isCriticalTime) {
    console.log(`⏰ [TIME-DEBUG] CURRENT: ${currentTime}, IN_CROSS: ${timeInCrossMode}s`);
    console.log(`⏰ [TIME-DEBUG] TIMEOUT: ${timeInCrossMode > 30 ? 'YES' : 'NO'} (${timeInCrossMode}/30s)`);
  }

  // Speciální detekce pro anchor 13 s delším lookahead
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

  // 4. Decision Process Logy (DECISION DEBUG) - Pomocná funkce pro reason
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

  // Použijte předpověď anchoru 13
  if (hasAnchor13InExtendedWindow(s)) {
    const decision = "A";
    console.log(`🎯 [CROSS-DECISION] Anchor 13 predicted - choosing segment A`);
    console.log(`✅ [DECISION] RETURN: ${decision}, REASON: ${getDecisionReason(decision, usable)}`);
    return decision;
  }

  // ZMĚNA: Pokud detekujeme JAKÝKOLIV anchor ze segmentu A, jdeme do A
  if (hasAnySegmentA) {
    const decision = "A";
    console.log(`✅ [CROSS-DECISION] Detected segment A anchors at t=${baseRow?.ts}`);
    console.log(`✅ [DECISION] RETURN: ${decision}, REASON: ${getDecisionReason(decision, usable)}`);
    return decision;
  }

  // ZMĚNA: Pokud detekujeme JEN segment F anchor a žádný A, jdeme do F
  if (hasAnySegmentF && !hasAnySegmentA) {
    const decision = "F";
    console.log(`⚠️ [CROSS-DECISION] Detected only segment F anchors at t=${baseRow?.ts}`);
    console.log(`✅ [DECISION] RETURN: ${decision}, REASON: ${getDecisionReason(decision, usable)}`);
    return decision;
  }

  // Pokud nejsou žádné relevantní kotvy, pokračuj v čekání
  const decision = null;
  console.log(`⏳ [CROSS-DECISION] Waiting for anchors at t=${baseRow?.ts}`);
  console.log(`✅ [DECISION] RETURN: ${decision}, REASON: ${getDecisionReason(decision, usable)}`);
  
  // 9. Final Decision Summary (SUMMARY DEBUG)
  console.log(`📊 [SUMMARY] TIME: ${baseRow?.ts}, DECISION: ${decision}, 
    ANCHORS: ${usable.flatMap(u => u.ids).join(',')},
    MESH: ${hit?.mesh_id || 'none'}`);
  
  return decision;
}


    // Main processing loop: simulate vehicle movement second by second
    for (let s = startSec, prevS = startSec; s <= endSec; s++) {
      if (s % 100 === 0) console.log(`🔄 [LOOP] s=${s}, startSec=${startSec}, endSec=${endSec}`);
      const dt    = (s === startSec) ? 0 : (s - prevS);
      const v     = speedAtSec(s);         // m/s
      const stepM = v * dt;

      // 1) Move walker along MIDAXIS path based on speed
      if (stepM > 0) walker.step(stepM);
      const pos = walker.get();

      // 2) Find nearest MESH point — this creates `near` object
      const near = nearestMGPS(pos.lat, pos.lng, MGPS);

      // 3) Detect "crossing" (anchor match) when close to mesh point
      let hit = null;
      if (near && near.m && near.dist <= CROSS_EPS_M) {
        const a_ids = anchorIdsAroundSec(s);              // anchors from table around time s
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

        // Optional debug logging:
        console.log(`CROSS t=${s} mesh=${near.m.id} d=${near.dist.toFixed(2)} a_ids=`, a_ids, 'matched=', matched);
      }

      // 4) Rolling average + terminal turn detection
      pushSpeed(v);
      const dStart = haversine_m(pos.lat,pos.lng, startNode.lat,startNode.lng);
      const dEnd   = haversine_m(pos.lat,pos.lng, endNode.lat,  endNode.lng);
      const nearTerminal = (dStart <= (CFG.TURN_PROX_M||3)) || (dEnd <= (CFG.TURN_PROX_M||3));
      const avg = rollAvg();
      if (turnCooldown > 0) turnCooldown--;
      // Reverse direction at terminals when speed drops significantly
      if (nearTerminal && avg > 0 && v <= (CFG.TURN_DROP_RATIO||0.65) * avg && turnCooldown === 0) {
        walker.reverse();
        turnCooldown = CFG.TURN_COOLDOWN_SEC || 20;
      }

      // 7. Path Walker Debug (WALKER DEBUG)
      if (baseRow?.ts && baseRow.ts >= "07:13:00" && baseRow.ts <= "07:14:00") {
        console.log(`🚶 [WALKER] POS: ${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}, SEG: ${pos.seg}, T: ${pos.t}`);
        console.log(`🚶 [WALKER] DIST_TO_CROSS: ${haversine_m(pos.lat, pos.lng, crossMode.crossing?.lat, crossMode.crossing?.lng)}m`);
      }

      // 5) Record 1Hz to debug log - building REC object
      let latFinal = pos.lat;
      let lngFinal = pos.lng;

      // --- CROSS MODE continuation logic removed - using original F_GPS ---

      // DISABLED: Old anchor snapping logic during CROSS MODE
      // This was interfering with the new CROSS MODE algorithm
      // Only allow anchor snapping when NOT in CROSS MODE
      if (!crossMode.active && hit && hit.matched_count >= 2 && near && near.dist > CROSS_EPS_M) {
        const fpAnchors = (hit.matched_ids || [])
          .map(id => MGPS.find(m => m.id === id))
          .filter(Boolean);

        if (fpAnchors.length) {
          let best = null;
          let bestDist = Infinity;
          for (const a of fpAnchors) {
            const d = haversine_m(pos.lat, pos.lng, a.lat, a.lng);
            if (d < bestDist) {
              bestDist = d;
              best = a;
            }
          }

          if (best && bestDist > 5) {  // smaller tolerance, e.g. 5 m
            latFinal = best.lat;
            lngFinal = best.lng;
            console.log("⚠️ Snap to nearest matched anchor:", best.id, "dist", bestDist.toFixed(2));
          }
        }
      } else if (crossMode.active && hit && hit.matched_count >= 2) {
        // Log anchor detection during CROSS MODE for debugging
        console.log(`🔍 [CROSS-MODE-ANCHORS] Detected anchors: [${hit.matched_ids.join(',')}] at mesh_id=${hit.mesh_id}`);
      }
      // Find baseRow exactly or last smaller one
    
      const baseRow = (() => {
        let found = null;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].sec <= s) { found = rows[i]; break; }
        }
        return found;
      })();

      // --- CROSS MODE kontrola ---
      if (baseRow?.ts && baseRow.ts >= "06:54:44" && baseRow.ts <= "07:15:10") {
        console.log(`[CROSS-STATUS] crossMode.active=${crossMode.active}, time=${baseRow?.ts}, s=${s}, baseRow.sec=${baseRow?.sec}`);
        console.log(`[LATLNG-DEBUG] latFinal=${latFinal.toFixed(6)}, lngFinal=${lngFinal.toFixed(6)}, pos.lat=${pos.lat.toFixed(6)}, pos.lng=${pos.lng.toFixed(6)}`);
        if (crossMode.active) {
          console.log(`[CROSS-MODE-DEBUG] crossing=${crossMode.crossing?.name}, decision=${crossMode.decision}, waiting=${crossMode.waiting}`);
        }
      }
      if (!crossMode.active) {
        for (const cross of CROSS_POINTS) {
         const d = haversine_m(latFinal, lngFinal, cross.lat, cross.lng);
         console.log(`[CROSS-CHECK] ${cross.name}: distance=${d.toFixed(2)}m from latFinal=${latFinal.toFixed(6)}, lngFinal=${lngFinal.toFixed(6)}`);
         if (d < 10) {
           crossMode.active = true;
           crossMode.crossing = cross;
           crossMode.startTime = s;
           console.log("🚦 Enter CROSS MODE:", cross.name, "at sec", s, "ts=", baseRow?.ts);

           // ✅ Aktualizovat window.FUSED_GPS.crossMode
           window.FUSED_GPS.crossMode = crossMode;

    // snap přímo na střed
           latFinal = cross.lat;
           lngFinal = cross.lng;
           break;
        }
      }

      } else {
        // DISABLED: Automatic CROSS MODE exit based on distance
        // Let the new algorithm in decideAtCrossing() handle CROSS MODE exit
        // when it detects segment A/F anchors or timeout occurs
        
        // Optional: Log distance for debugging (but don't exit CROSS MODE)
        const d = haversine_m(latFinal, lngFinal, crossMode.crossing.lat, crossMode.crossing.lng);
        if (baseRow?.ts && baseRow.ts >= "07:12:00" && baseRow.ts <= "07:15:00") {
          console.log(`[CROSS-DISTANCE] ${crossMode.crossing.name}: distance=${d.toFixed(2)}m (CROSS MODE stays active)`);
        }
        
        // ZMĚNA: Delší timeout pro čekání na anchor 13
        const ANCHOR_WAIT_TIMEOUT = 40; // Zvětšeno na 40 sekund
        if (crossMode.startTime && (s - crossMode.startTime) > ANCHOR_WAIT_TIMEOUT) {
          // 5. Fallback Detection Logy (FALLBACK DEBUG)
          console.log(`🚨 [FALLBACK] TIMEOUT TRIGGERED after ${s - crossMode.startTime}s`);
          console.log(`🚨 [FALLBACK] LAST_ANCHORS: ${JSON.stringify(usable.slice(-3).map(u => u.ids))}`);
          console.log("⏰ [ANCHOR-TIMEOUT] Anchor detection timeout - using fallback to segment A");
          crossMode.active = false;
          crossMode.crossing = null;
          crossMode.decision = "A"; // Fallback na segment A po timeoutu
          crossMode.targetMesh = null;
          crossMode.waiting = false;
          window.FUSED_GPS.crossMode = crossMode;
        }
      }

      if (crossMode.active) {
        // 8. Error Boundary Logy (ERROR DEBUG)
        let decision = null;
        try {
          // Předat hit objekt do decideAtCrossing místo baseRow
          decision = decideAtCrossing(s, { lat: latFinal, lng: lngFinal }, baseRow, hit);
        } catch (error) {
          console.error(`💥 [ERROR] In decideAtCrossing at ${baseRow?.ts}: ${error.message}`);
          console.error(`💥 [ERROR] Stack: ${error.stack}`);
          decision = null; // fallback
        }

        if (decision === "A") {
          // NOVÁ LOGIKA: Přesun na segment A
          const entryPoint = findSegmentAEntryPoint(latFinal, lngFinal);
          
          console.log(`🎯 [SEGMENT-A-TRANSITION] Moving to segment A entry point: lat=${entryPoint.lat.toFixed(6)}, lng=${entryPoint.lng.toFixed(6)}`);
          
          // Nastav novou pozici
          latFinal = entryPoint.lat;
          lngFinal = entryPoint.lng;
          
          // UKONČI CROSS MODE a vrať se k normálnímu F_GPS procesu
          crossMode.active = false;
          crossMode.crossing = null;
          crossMode.decision = "A";
          crossMode.targetMesh = null;
          crossMode.waiting = false;  // Ukonči čekání
          
          // Aktualizuj window.FUSED_GPS.crossMode
          window.FUSED_GPS.crossMode = crossMode;
          
          console.log(`🚪 [CROSS-MODE-EXIT] Exited CROSS MODE, returning to normal F_GPS process`);
          
        } else if (decision === "F") {
          // Původní logika pro segment F
          const targetEdge = findTargetPolygonEdge(decision, latFinal, lngFinal);
          if (targetEdge) {
            crossMode.targetMesh = targetEdge;
            crossMode.decision = "F";
            crossMode.waiting = false;  // Ukonči čekání
            
            console.log("🎯 Target polygon edge center for segment:", decision, "lat:", targetEdge.lat.toFixed(6), "lng:", targetEdge.lng.toFixed(6));
            
            latFinal = targetEdge.lat;
            lngFinal = targetEdge.lng;
            
            crossMode.active = false;
            window.FUSED_GPS.crossMode = crossMode;
          }
        } else {
          // Čekáme na anchor IDs → držíme se středu křižovatky
          latFinal = crossMode.crossing.lat;
          lngFinal = crossMode.crossing.lng;
          crossMode.waiting = true;  // Nastav čekání
          
          console.log("⏳ Waiting for decision at", crossMode.crossing.name, "sec", s);
        }
        
        // Aktualizuj window.FUSED_GPS.crossMode vždy
        window.FUSED_GPS.crossMode = crossMode;
      }

      // --- Calculate timestamp interpolated directly from number s
      const hh   = String(Math.floor(s / 3600)).padStart(2, "0");
      const mm   = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      const ss   = String(s % 60).padStart(2, "0");
      const ts   = `${hh}:${mm}:${ss}`;

      // --- CROSS režim: rozhodnutí na základě anchor IDs ---
      let crossDecision = null;
      let crossDebugHtml = null;

      // Použij rozhodnutí z CROSS MODE pokud existuje
      if (crossMode.decision) {
        crossDecision = crossMode.decision;
        crossDebugHtml = `<b>${crossMode.crossing.name}</b> @ ${baseRow?.ts}<br>Decision=${crossDecision}`;
      }

      // --- původní rec ---
      const rec = {
        sec: s,
        timeStr: baseRow?.ts || "00:00:00",
        lat: latFinal,
        lng: lngFinal,
        speed_mps: v,
        dist_to_m: near ? near.dist : null,
        ...(hit ? hit : {}),
        crossDecision,
        crossDebugHtml,
        crossMode: {
          active: !!crossMode?.active,
          crossing: crossMode?.crossing || null,
          decision: crossMode?.decision || null
        }
      };


      // DEBUG for first 10 seconds
      if (s - startSec < 10) {
        console.log(
          `[DBG] s=${s}, ts=${baseRow?.ts}, baseRow.ts=${baseRow?.ts}, ` +
          `lat=${latFinal.toFixed(6)}, lng=${lngFinal.toFixed(6)}, speed=${rec.speed_mps}`
        );
      }

      // Volání status logu každých 5 sekund
      if (s % 5 === 0) logCrossStatus();

      // Logujte pouze když je něco špatně
      const shouldLogDebug = 
        crossMode.active && 
        (s - crossMode.startTime) > 10 && 
        !hit?.matched_ids?.length;

      if (shouldLogDebug) {
        console.log(`⚠️ [WARNING] In CROSS MODE for ${s - crossMode.startTime}s but no anchors detected`);
      }

      perSecond.push(rec);

      // 6) Visual output only at table timestamps
      if (tableSecs.has(s)) {
        out.push(rec);
        console.log("ADDING FUSED ROW", s, "timeStr=", rec.timeStr);
      }
      prevS = s;
    }
    
    // Export to window for debug/export
    window.fusedLog = { per_second: perSecond, viz_rows: out };
    return out;
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
  const CROSS_POINTS = CFG.CROSS_POINTS || [];
  if (CROSS_POINTS.length < 2) return null;

  const d1 = haversine_m(rec.lat, rec.lng, CROSS_POINTS[0].lat, CROSS_POINTS[0].lng);
  const d2 = haversine_m(rec.lat, rec.lng, CROSS_POINTS[1].lat, CROSS_POINTS[1].lng);

  return {
    mode: rec.crossMode || { active: false },   // ✅ vezme hodnotu uloženou v rec
    distances: { d1, d2 },
    anchors: rec.matched_ids || []
  };
};
})();
