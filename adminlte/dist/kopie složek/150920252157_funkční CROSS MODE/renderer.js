console.log('ANCHORS:', ANCHORS);
console.log('🔍 [RENDERER-START] renderer.js loaded and ready!');

// 1. Inicializace globálních proměnných (přidej na začátek)
let incidentLog = [];
let idx = 0; // třeba hned po načtení skriptu
let incidents = [];
let prevInRed = false;
let playbackSpeed = 1; 
let followBall = false;
let animationActive = false;
let currentIndex = 0; // Přidaná globální proměnná pro sledování pozice
let animationData = []; // Ukládá načtená data pro animaci
let map;
let anchorActive = false;
// — pro správu zvýraznění —
let prevMeshMarker   = null;   // poslední „hitu“ bod
let prevFootAnchors  = [];     // kotvy zvýrazněné naposled
// Obě kuličky GNSS vs OFFLINE
let fusedData = [];      // F_GPS syntetika (z FUSED_GPS.js)
let benchData = [];      // GNSS benchmark (tvá původní realData)
let bothActive = false;
let bothTimer = null;
let pendingBoth = false; // <<< NOVÉ
let bothIdx = 0;         // <- přidaný globální index
let gnssMaster = [];   // trvalá kopie GNSS z RENDERERDATA*.js (nikdy ji nepřepisuj)
let bothTimerF = null;  // timer F_GPS smyčky
let bothTimerB = null;  // timer GNSS smyčky
let bothActiveF = false;   // F_GPS běží?
let bothActiveB = false;   // GNSS běží?
let uiTimer = null;
let lastUi = { fIdx: -1, bIdx: -1 };
let fgpsIdx = 0;   // index F_GPS pro BOTH
let gnssIdx = 0;   // index GNSS pro BOTH
let ANCHOR_TO_SEG = null;

// --- vždy vrátí hezký časový string, nikdy Date ani ms
function getRecTimeStr(rec) {
  return rec?.timeStr || "00:00:00";
}


// BASIC time index & anchors – jediný zdroj času HH:MM:SS

(function(){
  const BASIC = window.BASIC_TABLE_04062025 || window.BASIC_TABLE || [];

  let BASIC_SECS = [];
  const BASIC_SEC_TO_STR = new Map();

  function buildBasicIndex(){
    BASIC_SECS = [];
    BASIC_SEC_TO_STR.clear();
    (BASIC || []).forEach(r=>{
      const t = String(r.TIME || r.time || r.Timestamp || r.timestamp || '').trim();
      const m = t.match(/^(\d{2}):(\d{2}):(\d{2})$/);
      if (!m) return;
      const hh = +m[1], mm = +m[2], ss = +m[3];
      const s = hh*3600 + mm*60 + ss;
      BASIC_SECS.push(s);
      BASIC_SEC_TO_STR.set(s, t);
    });
    BASIC_SECS.sort((a,b)=>a-b);
  }

  function secOfDayUTC(ms){
    const d = new Date(ms);
    return d.getUTCHours()*3600 + d.getUTCMinutes()*60 + d.getUTCSeconds();
  }

  function nearestBasicSecondFromMs(ms){
    if (!BASIC_SECS.length) return null;
    const s = secOfDayUTC(ms);
    let best = BASIC_SECS[0], bestD = Math.abs(BASIC_SECS[0]-s);
    for (let i=1;i<BASIC_SECS.length;i++){
      const d = Math.abs(BASIC_SECS[i]-s);
      if (d < bestD) { best = BASIC_SECS[i]; bestD = d; }
      if (!bestD) break;
    }
    return best;
  }

  function basicTimeStrFromMs(ms){
    const sec = nearestBasicSecondFromMs(ms);
    return (sec!=null && BASIC_SEC_TO_STR.get(sec)) || '00:00:00';
  }

  function anchorsAtSecondOfDay(sec){
    const s = ((sec%86400)+86400)%86400;
    const row = (BASIC||[]).find(r=>{
      const t = String(r.TIME || r.time || r.Timestamp || r.timestamp || '').trim();
      const [hh,mm,ss] = t.split(':').map(Number);
      return Number.isFinite(hh) && Number.isFinite(mm) && Number.isFinite(ss)
             && (hh*3600+mm*60+ss) === s;
    });
    if (!row) return [];
    const ids = [];
    for (const k in row){
      if (/^ANCHOR\d+$/i.test(k)) {
        const v = Number(row[k]);
        if (Number.isFinite(v) && v>0) ids.push(v);
      }
    }
    return ids;
  }

  // PUBLIC: kotvy nejblíž datasetové sekundě
  function anchorsNearest(ms, maxWindowSec=5){
    if (!BASIC_SECS.length) return [];
    const base = nearestBasicSecondFromMs(ms);
    if (base==null) return [];
    for (let dt=0; dt<=maxWindowSec; dt++){
      for (const sign of (dt===0?[1]:[1,-1])) {
        const s = base + sign*dt;
        const ids = anchorsAtSecondOfDay(s);
        if (ids.length) return ids;
      }
    }
    return [];
  }

  // PUBLIC: dopředné okno (28–35 s, max 6 řádků) pro křižovatky
  function anchorsWindowForward(ms, horizonSec=28, maxRows=6){
    if (!BASIC_SECS.length) return new Map();
    const start = nearestBasicSecondFromMs(ms);
    if (start==null) return new Map();
    const counts = new Map();
    let taken = 0;
    for (let t=0; t<=horizonSec && taken<maxRows; t+=4) {
      const sec = start + t;
      const ids = anchorsAtSecondOfDay(sec);
      if (ids.length) {
        ids.forEach(id => counts.set(id, (counts.get(id)||0) + 1));
        taken++;
      }
    }
    return counts;
  }

  // Expose do globálu (a zároveň přepíšeme staré verze, viz níž)
  window.basicTimeStrFromMs = basicTimeStrFromMs;
  window.anchorsNearest = anchorsNearest;
  window.anchorsWindowForward = anchorsWindowForward;

  // inicializace indexu
  buildBasicIndex();
})();

let _hudPrevF = null;
let _hudPrevB = null;
let BASIC_TIME_OFFSET_SEC = 0; // posun mezi UTC ms a TIME z BASIC_TABLE (sekundy)

function secWrap(s){ s%=86400; return s<0 ? s+86400 : s; } // 0..86399
// --- ČAS A FORMÁTOVÁNÍ ---
const TIME_MODE = 'CET'; // 'BASIC' (= přesně HH:MM:SS z datasetu) nebo 'CET'

function hhmmssUTC(ms) {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2,'0');
  const mm = String(d.getUTCMinutes()).padStart(2,'0');
  const ss = String(d.getUTCSeconds()).padStart(2,'0');
  return `${hh}:${mm}:${ss}`;
}

function fmtTime(ms) {
  if (TIME_MODE === 'BASIC') {
    // přesně co máme v datasetech – HH:MM:SS (UTC)
    return hhmmssUTC(ms);
  } else {
    // CET (letní) – zobrazuj vždy „skutečný“ lokální čas pro Prahu
    return new Intl.DateTimeFormat('cs-CZ', {
      timeZone: 'Europe/Prague',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(new Date(ms));
  }
}


// Vypočte, o kolik má F_GPS počkat navíc, aby platilo:
// time(F) ≈ time(GNSS) - FGPS_LAG_MS
function extraDelayToKeepLag() {
  const fT = fusedData[Math.min(fIdx, fusedData.length-1)]?.time;
  const bT = benchData[Math.min(bIdx, benchData.length-1)]?.time;
  if (fT == null || bT == null) return 0;
  const want = (msOf(bT) - FGPS_LAG_MS) - msOf(fT); // >0 => F_GPS má čekat
  return Math.max(0, want / (playbackSpeed || 1));
}

function scheduleNextF(optExtraMs = 0) {
  if (!bothActiveF || fIdx >= fusedData.length - 1) return;

  const cur  = fusedData[fIdx];
  const next = fusedData[fIdx + 1];
  const ct = msOf(cur.time), nt = msOf(next.time);
  const base = Math.max(10, (nt - ct) / (playbackSpeed || 1));
  const keepLag = extraDelayToKeepLag();

bothTimerF = setTimeout(() => {
    if (!bothActiveF) return;
    fIdx = Math.min(fIdx + 1, fusedData.length - 1);
    maybeSnapFgps(fIdx);
    const f = fusedData[fIdx];
    window.markerF?.setLatLng([f.lat, f.lng]);
    
    updateFgpsHud(f);
    updateBothInfoPanel(fIdx, bIdx);
    scheduleNextF(); 
  }, base + optExtraMs + keepLag);
}

function tickGNSS() {
  if (!bothActiveB || bIdx >= benchData.length - 1) return;

  const cur  = benchData[bIdx];
  const next = benchData[bIdx + 1];
  const ct = msOf(cur.time), nt = msOf(next.time);
  const delay = Math.max(10, (nt - ct) / (playbackSpeed || 1));

  window.markerB?.setLatLng([cur.lat, cur.lng]);
  updateGnssHud(cur);
  updateBothInfoPanel(fIdx, bIdx);

  bIdx++;
  bothTimerB = setTimeout(tickGNSS, delay);
}

const DEVICE = 'GH5200';
const SUBJECT_ID = 'CEPRO0516';
const MAX_LOGS = 5;
const TIME_STEP = 100; // 100 ms

// --- helpers pro režimy a čas ---
const getMode = () => document.getElementById('channelSelect')?.value || 'none';
const toDate  = v => (v instanceof Date ? v : new Date(v));

function stopSingle() {
  animationActive = false;
  if (window.timer) { clearTimeout(window.timer); window.timer = null; }
  if (window.marker) { map.removeLayer(window.marker); window.marker = null; }

  // zavřít všechny malé pop-upy
  if (window.fgpsPopup) { window.leafletMap.closePopup(window.fgpsPopup); window.fgpsPopup = null; }
  if (window.meshPopup) { window.leafletMap.closePopup(window.meshPopup); window.meshPopup = null; }
  if (window.marker && typeof window.marker.closePopup === 'function') window.marker.closePopup();

  // vyčistit panely
  const panel = document.getElementById('ball-info-content');
  if (panel) panel.innerHTML = '';
  const meshExtra = document.getElementById('mesh-extra');
  if (meshExtra) meshExtra.innerHTML = '';
}

function stopBoth() {
  bothActiveF = false;
  bothActiveB = false;

  if (bothTimerF) { clearTimeout(bothTimerF); bothTimerF = null; }
  if (bothTimerB) { clearTimeout(bothTimerB); bothTimerB = null; }

  if (window.markerF) { window.markerF.closePopup?.(); map.removeLayer(window.markerF); window.markerF = null; }
  if (window.markerB) { window.markerB.closePopup?.(); map.removeLayer(window.markerB); window.markerB = null; }

  const info = document.getElementById('ball-info-content');
  if (info) info.innerHTML = '';
}

function stopBothUiLoop() {
  if (uiTimer) { clearInterval(uiTimer); uiTimer = null; }
  lastUi = { fIdx: -1, bIdx: -1 };
}

//  Polygony a hranice 
const smallPoly = turf.polygon([[
  [15.075519858,50.043912514],
  [15.074799748,50.044046404],
  [15.074768592,50.043977296],
  [15.075488702,50.043843406],
  [15.075519858,50.043912514]
]]);

const segA_poly = turf.polygon([[
  [15.0747701624822,50.043976693719],
  [15.0737390201568,50.0442493957959],
  [15.0737675753748,50.0443189283527],
  [15.0747987175384,50.0440462262791],
  [15.0747701624822,50.043976693719]
]]);

const segB_poly = turf.polygon([[
  [15.0737610345635,50.0442789782296],
  [15.0730114760654,50.044400320607],
  [15.0730293239477,50.0444713193921],
  [15.0737788824008,50.0443499770162],
  [15.0737610345635,50.0442789782296]
]]);

const segB_mez_poly = turf.polygon([[
  [15.072990878784,50.0444275249694],
  [15.0728274786461,50.0447037349699],
  [15.0728755413631,50.0447220450251],
  [15.0730389412252,50.0444458350256],
  [15.072990878784,50.0444275249694]
]]);

const segC_poly = turf.polygon([[
  [15.0728422411958,50.0446968044753],
  [15.0713931511793,50.0449006144759],
  [15.0714009288235,50.0449362255239],
  [15.0728500188071,50.0447324155245],
  [15.0728422411958,50.0446968044753]
]]);

const segD_poly = turf.polygon([[
  [15.071411655835627,50.044884150691],
  [15.071298169991584,50.0448369547227],
  [15.07095474,50.04382224],
  [15.07101623,50.04366028],
  [15.0709605430806,50.043619868146],
  [15.0708711190437,50.04381700387166],
  [15.071218548368051,50.044845313281876 ],
  [15.07142641,50.04493727],
  [15.071411655835627,50.044884150691]
]]);

const segE_poly = turf.polygon([[
  [15.0710030314732,50.0436465120522],
  [15.0731181113489,50.0431643520551],
  [15.073070808598997,50.04308264426717],
  [15.0709782085448,50.0435763879463],
  [15.0710030314732,50.0436465120522]
]]);

const segF_poly = turf.polygon([[
  [15.0730636509037,50.0431491730548],
  [15.073562577545603,50.04390482933399],
  [15.073557002822772,50.044008677819065],
  [15.073691807213686,50.04429237169013],
  [15.073795035278138,50.04425646836316],
  [15.073590456550148,50.043793818805135],
  [15.073188490264348,50.04312089824383],
  [15.0730636509037,50.0431491730548]
]]);

const segG_poly = turf.polygon([[
  [15.0730213840772,50.0444183778868],
  [15.072814703534,50.0439125478856],
  [15.0727113164368,50.0439397520913],
  [15.0729179958936,50.0444455820901],
  [15.0730213840772,50.0444183778868]
]]);

const bigPoly = turf.polygon([[
  [15.075727943926456,50.04388804959012],
  [15.075249589393858, 50.04257702347922],
  [15.074182829796284, 50.04276210930031],
  [15.070730312300423, 50.04361316223831],
  [15.071374535291428, 50.04529912573759],
  [15.074150934405235,50.044943464042994],
  [15.075836433650503, 50.044672798581],
  [15.075972570666634,50.04463428875933],
  [15.075727943926456,50.04388804959012]
]]);

const greenCenter = turf.centerOfMass(smallPoly).geometry.coordinates;
const redCenter   = turf.centerOfMass(bigPoly).geometry.coordinates;

function getDistToSmallPoly(point) {
  const ring = smallPoly.geometry.coordinates[0];
  return Math.min(...ring.map(coord => turf.distance(point, turf.point(coord), {units: 'meters'})));
}

// --- Mapa a marker ---
  map = L.map('leafletMap').setView([greenCenter[1], greenCenter[0]], 17);
  window.leafletMap = map;

// místo původního OSM podkladu
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri',
  maxZoom: 20,
  noWrap: true
}).addTo(window.leafletMap);




  if (window.AF && typeof window.AF.init === 'function') {
  window.AF.init(window.leafletMap || map);
  }
// Omezení rozsahu panování maxBounds
  map.setMaxBounds([[48.5, 12.0], [51.1, 18.9]]);
// polygonové vrstvy – pouze ty, bez kotev a bez CSS
  L.geoJSON(smallPoly,     { color:'#28a745', weight:3, fillOpacity:0.3 }).bindPopup('Povolená zóna').addTo(map);
  L.geoJSON(segA_poly,     { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_A poly').addTo(map);
  L.geoJSON(segB_poly,     { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_B poly').addTo(map);
  L.geoJSON(segB_mez_poly, { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_B_mez poly').addTo(map);
  L.geoJSON(segC_poly,     { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_C poly').addTo(map);
  L.geoJSON(segD_poly,     { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_D poly').addTo(map);
  L.geoJSON(segE_poly,     { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_E poly').addTo(map);
  L.geoJSON(segF_poly,     { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_F poly').addTo(map);
  L.geoJSON(segG_poly,     { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_G poly').addTo(map);
  L.geoJSON(bigPoly,       { color:'#dc3545', weight:3, dashArray:'5,10', fillOpacity:0 }).bindPopup('Zakázaná zóna').addTo(map);

// --- CROSSING DEBUG PANEL ---
// Vytvoření a přidání panelu do mapy
(function initCrossLogPanel() {
  if (!window.leafletMap) {
    console.error("❌ Map object není ještě dostupný – panel nevytvořen");
    return;
  }
  const crossLogPanel = L.control({position:'topright'});
  crossLogPanel.onAdd = function() {
    const div = L.DomUtil.create('div', 'cross-panel');
    div.id = 'crossLogPanel';
    div.style.background = 'rgba(255, 255, 255, 0)';
    div.style.padding = '12px';
    div.style.maxHeight = '150px';
    div.style.overflowY = 'auto';
    div.style.fontSize = '13px';
    div.style.marginTop = '50px';
    div.style.fontFamily = "'Inter', sans-serif";
    div.style.borderRadius = '12px';
    div.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    div.innerHTML = '<b>Cross Debug</b><br>(zatím prázdné)';
    return div;
  };
  crossLogPanel.addTo(window.leafletMap);
})();
console.log("✅ CrossLogPanel added to map, element ID:", document.getElementById('crossLogPanel') ? 'found' : 'not found');

// --- zdroje dat z <script> datasetů ---
function getMeshSrc() {
  return window.FIXED_GPS_MESH || window.MESH_FIXED_GPS || window.fixedGpsMesh || [];
}
function getFootSrc() {
  // tvoje reálné jméno je "meshFixedGpsAnchFootprint"
  return window.MESH_FIXEDGPS_ANCHFOOTPRINT
      || window.meshFixedGpsAnchFootprint
      || window.MESH_FIXEDGPS_ANCHORFOOTPRINT
      || {};
}
// bezpečný výběr souřadnic
const pickLat = o => (typeof o.lat === 'number' ? o.lat : (o.LAT ?? o.y));
const pickLng = o => {
  if (typeof o.lng === 'number') return o.lng;
  if (typeof o.lon === 'number') return o.lon;   // << důležité
  return (o.LONG ?? o.x);
};

function makeAnimSeries(src) {
  return (src || [])
    .filter(d => d && Number.isFinite(+d.lat) && Number.isFinite(+d.lng))
    .map(d => {
      // čas řešíme jednoduše:
      let tms = null;

      if (typeof d.time === 'number' && Number.isFinite(d.time)) {
        tms = d.time; // už ms od začátku
      }

      // fallback – když se nepodaří čas, dej 0
      if (tms == null) tms = 0;

      const lat = +d.lat;
      const lng = +d.lng;
      return {
        point: turf.point([lng, lat]),

        // 🔑 JEN čisté hodnoty z FUSED_GPS.js
        time: Number(d.time),        // číselně
        timeStr: d.timeStr || "00:00:00",


        lat,
        lng,
        speed_mps:     (d.speed_mps ?? null),
        dist_to_m:     (d.dist_to_m ?? null),
        mesh_id:       (d.mesh_id ?? null),
        matched_count: (d.matched_count ?? 0),
        matched_ids:   Array.isArray(d.matched_ids) ? d.matched_ids : [],
        crossMode: d.crossMode || { active: false, crossing: null, decision: null }
      };
    });
}
console.log('sample realData[0]:', window.realData && window.realData[0]);

// markerky MESH bodů (z datasetu přes getMeshSrc)
const meshSrc = getMeshSrc();
window.meshMarkers = meshSrc.map(pt => {
  const m = L.circleMarker([pickLat(pt), pickLng(pt)], {
    radius: 3,
    color: '#28a745',
    fillColor: '#28a745',
    fillOpacity: 0.6
  });
  m.data = pt; // ať máš u markeru Footprints/Segment po ruce
  return m;
});

function buildAnchorToSegmentIndex(){
  const F = getFootSrc(); // tvoje helper funkce, vrací pole nebo objekt
  const idx = new Map();  // kotva -> Set(segmentů)

  const push = (id, seg) => {
    const a = Number(id);
    if (!Number.isFinite(a) || !seg) return;
    const s = String(seg);
    if (!idx.has(a)) idx.set(a, new Set());
    idx.get(a).add(s);
  };

  if (Array.isArray(F)) {
    F.forEach(node=>{
      const seg = node.Segment || node.segment || node.SEGMENT;
      const fp  = node.Footprints || node.Footprint || node.anchors || [];
      fp.forEach(a=>push(a, seg));
    });
  } else if (F && typeof F === 'object') {
    Object.values(F).forEach(node=>{
      const seg = node.Segment || node.segment || node.SEGMENT;
      const fp  = node.Footprints || node.Footprint || node.anchors || [];
      fp.forEach(a=>push(a, seg));
    });
  }
  ANCHOR_TO_SEG = idx;
}

// ⬇️ zavolej jednou po vytvoření markerů:
buildAnchorToSegmentIndex();

let EXCLUSIVE_ANCH = new Map();
function buildExclusiveAnchors(){
  EXCLUSIVE_ANCH = new Map();
  if (!ANCHOR_TO_SEG) return;
  ANCHOR_TO_SEG.forEach((segs, id) => {
    if (segs.size === 1) EXCLUSIVE_ANCH.set(id, [...segs][0]); // kotva patří jen jednomu segmentu
  });
}
// Po vytvoření ANCHOR_TO_SEG rovnou vybuduj i EXCLUSIVE_ANCH
buildExclusiveAnchors();

// markerky MESH bodů
function toggleMesh(on){
  if (window.AF?.showMesh) window.AF.showMesh(on);     // vrstvy z ANCHORFOOTPRINT.js
  if (Array.isArray(window.meshMarkers)) {             // tvoje markerky z renderer.js
    window.meshMarkers.forEach(m => on ? map.addLayer(m) : map.removeLayer(m));
  }
  if (Array.isArray(window.meshMeshMarkers)) {         // markerky, které vytváří ANCHORFOOTPRINT.js
    window.meshMeshMarkers.forEach(m => on ? map.addLayer(m) : map.removeLayer(m));
  }
}
toggleMesh(false);

function clearMeshUI() {
  // zavřít malý popup u kuličky
  if (window.meshPopup) {
    window.leafletMap?.closePopup(window.meshPopup);
    window.meshPopup = null;
  }
  // odbarvit zvýrazněný MESH bod
  if (prevMeshMarker) {
    try { prevMeshMarker.setStyle({ color:'#28a745', fillColor:'#28a745' }); } catch {}
    prevMeshMarker = null;
  }
  // odbarvit zvýrazněné kotvy footprintu
  prevFootAnchors.forEach(a => { try { a.setStyle({ color:'blue', fillColor:'blue' }); } catch {} });
  prevFootAnchors = [];
  // smazat text v extra boxu
  const meshExtra = document.getElementById('mesh-extra');
  if (meshExtra) meshExtra.innerHTML = '';

  // info o kuličce pryč
  const ballInfo = document.getElementById('ball-info-content');
  if (ballInfo) ballInfo.innerHTML = '';
}


let anchorMode = 'with-number';

const anchorMarkers = ANCHORS.map(a => {
  const m = L.circleMarker(
    [ a.lat, a.lng ],
    {
      radius: 2,
      color: 'blue',
      fillColor: 'blue',
      fillOpacity: 1
    }
  ).addTo(map);

  // Kliknutím zobrazit tooltip s číslem
  m.on('click', () => {
    m.bindTooltip(`${a.anchorNumber}`, {
      permanent: true,
      direction: 'top',
      className: 'anchor-tooltip'
    }).openTooltip();
  });
  // Dvojklikem skrýt tooltip
  m.on('dblclick', () => {
    m.unbindTooltip();
  });
  return { id: a.anchorNumber, marker: m };
});


// Funkce pro nastavení zobrazení kotev podle módu
function updateAnchorDisplay() {
  anchorMarkers.forEach(({ id, marker }) => {
    if (anchorMode === 'none') {
      marker.setStyle({ opacity: 0, fillOpacity: 0 });
      marker.unbindTooltip();
    } else {
      marker.setStyle({ opacity: 1, fillOpacity: 1 });
    if (anchorMode === 'with-number') {
      marker.bindTooltip(`${id}`, {
      permanent: true,
      direction: 'top',
      className: 'anchor-tooltip'
     }).openTooltip();
   } else {
        marker.unbindTooltip();
      }
    }
  });
}

// Přidání ovládacího panelu pro Kotvy
const anchorControl = L.control({ position: 'topright' });
anchorControl.onAdd = () => {
  const container = L.DomUtil.create('div', 'anchor-toggle-control');
  container.innerHTML = `
    <label>Kotvy: </label>
    <select id="anchorModeSelect">
      <option value="none">NE</option>
      <option value="no-number">ANO bez čísla</option>
      <option value="with-number">ANO s číslem</option>
    </select>
  `;
  L.DomEvent.disableClickPropagation(container);
  return container;
};
anchorControl.addTo(map);

document.getElementById('anchorModeSelect').value = anchorMode;
document.getElementById('anchorModeSelect').addEventListener('change', e => {
  anchorMode = e.target.value;
  updateAnchorDisplay();
});

// Načtení výchozího zobrazení kotev
updateAnchorDisplay();


function updateAnchorColors(latlng) {
  anchorMarkers.forEach(({ marker }) => {
    const d = latlng.distanceTo(marker.getLatLng());
    marker.setStyle(d <= 7
      ? { color: 'red', fillColor: 'red' }
      : { color: 'blue', fillColor: 'blue' }
    );
  });
}

const style = document.createElement('style');
style.innerHTML = `
  .anchor-tooltip {
    background: none !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    font-size: 10px;
    font-weight: normal;
    color: black;
  }
`;
document.head.appendChild(style);

//  Definice checkIncidents 
/**
 * Kontroluje vstup/výstup z červené zóny a aktualizuje incidentLog.
 * @param {Object} point GeoJSON point ({ type: 'Feature', geometry: { type:'Point', coordinates:[lng,lat] } })
 */
function checkIncidents(point) {
  // Zjistíme, jestli je v zelené zóně
  const inGreen = (
    turf.booleanPointInPolygon(point, smallPoly) ||
    turf.booleanPointInPolygon(point, segA_poly) ||
    turf.booleanPointInPolygon(point, segB_poly) ||
    turf.booleanPointInPolygon(point, segB_mez_poly) ||
    turf.booleanPointInPolygon(point, segC_poly) ||
    turf.booleanPointInPolygon(point, segD_poly) ||
    turf.booleanPointInPolygon(point, segE_poly) ||
    turf.booleanPointInPolygon(point, segF_poly) ||
    turf.booleanPointInPolygon(point, segG_poly)
  );
  // Zjistíme, jestli je v červené zóně mimo zelenou
  const inRed = turf.booleanPointInPolygon(point, bigPoly) && !inGreen;

  // Vstoupili jsme do červené zóny
  if (inRed && !prevInRed) {
    prevInRed = true;
    incidentLog.push({ inMs: window._lastRecMs, inStr: window._lastRecStr, outMs: null, outStr: null, duration: null });
    updateIncidentBoxes();
  }
  // Opustili jsme červenou zónu
  if (!inRed && prevInRed) {
    prevInRed = false;
    const last = incidentLog[incidentLog.length - 1];
    last.outMs    = window._lastRecMs;
    last.outStr   = window._lastRecStr;
    last.duration = Math.round((last.outMs - last.inMs) / 1000);
    updateIncidentBoxes();
  }
}

// Incident panel 
const infoPanel = document.createElement('div');
infoPanel.id = "infoPanel";
Object.assign(infoPanel.style, {
  position:'absolute', top:'10px', left:'calc(100% - 340px)', width:'320px', maxHeight:'260px', overflowY:'auto',
  background:'rgba(255,255,255,0.9)', border:'1px solid #ccc',
  borderRadius:'8px', padding:'12px', fontSize:'12px', zIndex:1000,
});
infoPanel.innerHTML = `
  <div style="display:flex; justify-content:space-between;"><strong>Incident Log</strong>
    <button id="clear-logs" style="font-size:10px; padding:2px 5px;">Vymazat</button>
  </div>
  <ul id="log-list" style="margin:8px 0; padding-left:16px;"></ul>
`;

// --- Tlačítko pro export incidentů ---
const exportIncidentsBtn = document.createElement('button');
exportIncidentsBtn.textContent = "Exportovat incidenty";
exportIncidentsBtn.style = "margin-top:10px; font-size:11px; padding:5px 10px; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer;";
exportIncidentsBtn.onclick = () => {
  const blob = new Blob([JSON.stringify(incidents, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `incident_log_${today}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
infoPanel.appendChild(exportIncidentsBtn);

// --- Modern Info panel pro kuličku ---
const ballInfoPanel = document.createElement('div');
ballInfoPanel.id = 'ballInfoPanel';
ballInfoPanel.innerHTML = `
  <div class="panel-header" style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 12px 16px; border-radius: 12px 12px 0 0; font-weight: 600; font-size: 16px; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none;">
    <div class="panel-title" style="display: flex; align-items: center; gap: 8px;">
      <i class="bi bi-info-circle"></i>
      Info o kuličce
    </div>
    <div class="panel-controls" style="display: flex; gap: 4px;">
      <button class="control-btn" id="minimize-btn" title="Minimalizovat" style="width: 20px; height: 20px; border-radius: 50%; border: none; background: rgba(255, 255, 255, 0.2); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; transition: all 0.2s ease;">−</button>
      <button class="control-btn" id="close-btn" title="Zavřít" style="width: 20px; height: 20px; border-radius: 50%; border: none; background: rgba(255, 255, 255, 0.2); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; transition: all 0.2s ease;">×</button>
    </div>
  </div>
  <div class="panel-content" style="padding: 16px; max-height: 300px; overflow-y: auto; font-family: 'Inter', sans-serif;">
    <div id="ball-info-content"></div>
    <div id="mesh-extra" style="margin-top:8px; font-size:11px; color:#0d6efd"></div>
  </div>
  <div class="resize-handle" style="position: absolute; bottom: 0; right: 0; width: 20px; height: 20px; background: linear-gradient(-45deg, transparent 30%, rgba(0, 0, 0, 0.1) 30%, rgba(0, 0, 0, 0.1) 70%, transparent 70%); cursor: nw-resize; border-radius: 0 0 12px 0;"></div>
`;
document.getElementById('map-wrapper')?.appendChild(ballInfoPanel);

function _hudMps(prev, cur){
  if (!prev || !cur) return null;
  const dt = (msOf(cur.time) - msOf(prev.time)) / 1000;
  if (!(dt > 0)) return null;
  return haversine(prev.lat, prev.lng, cur.lat, cur.lng) / dt;
}

function timeLabelF(f) {
  return f?.timeStr || '—';   // vždy použij BASIC_TABLE TIME
}

function timeLabelG(b) {
  return b?.timeStr || (b?.time ? hhmmssUTC(msOf(b.time)) : '—');
}


function findIndexByTime(series, tms){
  let best=0, bestD=Infinity;
  for (let i=0;i<series.length;i++){
    const d = Math.abs(msOf(series[i].time) - tms);
    if (d < bestD) { bestD=d; best=i; }
  }
  return best;
}

// F_GPS HUD (vpravo dole)
function updateFgpsHud(f){
console.log("HUD F_GPS record:", f);
  if (!f) return;
  let mps = Number.isFinite(f.speed_mps) ? f.speed_mps : 0;
  if (!Number.isFinite(mps)) {
    const i = findIndexByTime(fusedData, msOf(f.time));
    mps = speedFromNeighbors(fusedData, i) ?? 0;
  }
  const kmh = (mps*3.6).toFixed(1);
  const seg = segmentNear(f.lat, f.lng);
  const ids = anchorsNearest(msOf(f.time));
  document.getElementById('fgps-hud').innerHTML = `
    <b>F_GPS</b><br>
    <b>Čas:</b> ${getRecTimeStr(f)}<br>
    <b>GPS:</b> ${f.lat.toFixed(6)}, ${f.lng.toFixed(6)}<br>
    <b>Segment:</b> ${seg}<br>
    <b>Rychlost:</b> ${kmh} km/h<br>
    <b>ID kotev (BASIC):</b> ${ids.length ? ids.join(', ') : '—'}
  `;
}

function updateGnssHud(b){
  if (!b) return;
  let mps = Number.isFinite(b.speed_mps) ? b.speed_mps : 0;
  if (!Number.isFinite(mps)) {
    const i = findIndexByTime(benchData, msOf(b.time));
    mps = speedFromNeighbors(benchData, i) ?? 0;
  }
  const kmh = (mps*3.6).toFixed(1);
  const seg = segmentNear(b.lat, b.lng);
  const ids = meshAnchorsNearest(b.lat, b.lng);
  document.getElementById('gnss-hud').innerHTML = `
    <b>GNSS</b><br>
    <b>Čas:</b> ${getRecTimeStr(b)}<br>
    <b>GPS:</b> ${b.lat.toFixed(6)}, ${b.lng.toFixed(6)}<br>
    <b>Segment:</b> ${seg}<br>
    <b>Rychlost:</b> ${kmh} km/h<br>
    <b>ID kotev (MESH):</b> ${ids.length ? ids.join(', ') : '—'}
  `;
}



// --- Enhanced Drag and Resize Functionality ---
(function() {
  let isDragging = false;
  let isResizing = false;
  let startX, startY, startWidth, startHeight, startLeft, startTop;
  let isMinimized = false;

  // Panel control buttons
  const minimizeBtn = document.getElementById('minimize-btn');
  const closeBtn = document.getElementById('close-btn');
  const panelHeader = ballInfoPanel.querySelector('.panel-header');
  const panelContent = ballInfoPanel.querySelector('.panel-content');
  const resizeHandle = ballInfoPanel.querySelector('.resize-handle');

  // Minimize functionality
  minimizeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    isMinimized = !isMinimized;
    if (isMinimized) {
      panelContent.style.display = 'none';
      ballInfoPanel.style.height = 'auto';
      minimizeBtn.textContent = '+';
      minimizeBtn.title = 'Rozbalit';
    } else {
      panelContent.style.display = 'block';
      ballInfoPanel.style.height = '';
      minimizeBtn.textContent = '−';
      minimizeBtn.title = 'Minimalizovat';
    }
  });

  // Close functionality
  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    ballInfoPanel.style.display = 'none';
  });

  // Function to show panel (can be called from outside)
  window.showBallInfoPanel = () => {
    ballInfoPanel.style.display = 'block';
  };

  // Drag functionality - only on header
  panelHeader.addEventListener('mousedown', (e) => {
    if (e.target.closest('.control-btn')) return; // Don't drag when clicking control buttons
    
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(window.getComputedStyle(ballInfoPanel).left, 10);
    startTop = parseInt(window.getComputedStyle(ballInfoPanel).top, 10);
    
    ballInfoPanel.classList.add('dragging');
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
  });

  // Resize functionality
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = parseInt(window.getComputedStyle(ballInfoPanel).width, 10);
    startHeight = parseInt(window.getComputedStyle(ballInfoPanel).height, 10);
    
    ballInfoPanel.classList.add('resizing');
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    e.preventDefault();
    e.stopPropagation();
  });

  function handleDrag(e) {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    const newLeft = startLeft + deltaX;
    const newTop = startTop + deltaY;
    
    // Keep panel within viewport bounds
    const mapWrapper = document.getElementById('map-wrapper');
    const mapRect = mapWrapper.getBoundingClientRect();
    const panelRect = ballInfoPanel.getBoundingClientRect();
    
    const maxLeft = mapRect.width - panelRect.width;
    const maxTop = mapRect.height - panelRect.height;
    
    ballInfoPanel.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
    ballInfoPanel.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
    ballInfoPanel.style.bottom = 'auto';
    ballInfoPanel.style.right = 'auto';
  }

  function handleResize(e) {
    if (!isResizing) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    const newWidth = Math.max(280, startWidth + deltaX); // Min width 280px
    const newHeight = Math.max(120, startHeight + deltaY); // Min height 120px
    
    ballInfoPanel.style.width = newWidth + 'px';
    ballInfoPanel.style.height = newHeight + 'px';
  }

  function stopDrag() {
    isDragging = false;
    ballInfoPanel.classList.remove('dragging');
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', stopDrag);
  }

  function stopResize() {
    isResizing = false;
    ballInfoPanel.classList.remove('resizing');
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  }

  // Prevent text selection during drag/resize
  ballInfoPanel.addEventListener('selectstart', (e) => {
    if (isDragging || isResizing) {
      e.preventDefault();
    }
  });

  // Double-click header to toggle minimize
  panelHeader.addEventListener('dblclick', () => {
    minimizeBtn?.click();
  });

})();

function updateLogPanel() {
  const ul = document.getElementById('log-list');
  ul.innerHTML = '';
  if (incidents.length === 0) {
    ul.innerHTML = '<li style="color:#6c757d; font-style:italic">Žádné incidenty</li>';
    return;
  }
  [...incidents].reverse().forEach(inc => {
    const div = document.createElement('div');
    div.style = 'margin-bottom:10px; padding:8px; background:#f8f9fa; border-left:3px solid #dc3545; border-radius:4px;';
    div.innerHTML = `
      <strong style="color:#dc3545">IN:</strong> ${inc.inStr || '—'} | ${inc.inDist}m
      <div style="font-size:11px; color:#6c757d">${inc.inCoords}</div>
      ${inc.outDate ? `
        <div><strong style="color:#28a745">OUT:</strong> ${inc.outStr || '—'} | ${inc.outDist}m</div>
        <div><strong>DÉLKA:</strong> ${inc.duration} s</div>
      ` : `<div style="color:#ffc107">● AKTIVNÍ INCIDENT</div>`}
    `;
    ul.appendChild(div);
  });
}

function startAnimation() {
  // Debug logging for troubleshooting
  console.log("startAnimation called");
  console.log("window.leafletMap:", window.leafletMap);
  console.log("window.realData:", window.realData);
  console.log("animationData length:", animationData.length);
  console.log("idx:", idx);

  // Get current animation mode from UI selector
  const currentMode = document.getElementById('channelSelect')?.value || 'none';
  console.log("startAnimation called");

  // Validate that map is available
  if (!window.leafletMap) {
    console.error("Mapa není k dispozici, nelze spustit animaci.");
    return;
  }

  // Get data source for single mode animation (GNSS/offline data)
  const rawDataSource = window.realData || [];
  if (!Array.isArray(rawDataSource) || !rawDataSource.length) {
    console.error("Nejsou načtena data pro animaci.", rawDataSource);
    return;
  }

  // Prevent single animation in BOTH mode (uses bothRun() instead)
  if (currentMode === 'both') {
    console.warn('startAnimation: režim BOTH používá bothRun().');
    return;
  }

  // Prepare animation data by converting raw data to animation series format
  animationData = makeAnimSeries(window.realData);
  if (!animationData.length) {
    console.error("Nejsou načtena reálná data pro animaci (po makeAnimSeries).");
    return;
  }

  // Create or update the main animation marker
  // In SINGLE modes (GNSS/offlinegnss) we show a black circle marker, not in BOTH mode
  if (!window.marker) {
    // Create new marker at first data point
    const firstDataPoint = animationData[0];
    window.marker = L.circleMarker([firstDataPoint.lat, firstDataPoint.lng], {
      radius: 7,
      color: "#000",
      fillColor: "#00bfff",
      fillOpacity: 0.9
    }).addTo(map);
  } else {
    // Update existing marker position to first data point
    const firstDataPoint = animationData[0];
    window.marker.setLatLng([firstDataPoint.lat, firstDataPoint.lng]);
  }

  // Initialize animation state and start playback
  animationActive = true;
  playbackSpeed = 1;
  updateSpeedDisplay();
  idx = 0;
  
  // Clear any existing timer and start new animation loop
  if (window.timer) {
    clearTimeout(window.timer);
    window.timer = null;
  }
  window.timer = setTimeout(step, 0);
}

function ensureMap() {
  if (window.leafletMap) return;
}
// ► Rychlostní stupně pro FWD/BACK
const speeds   = [1, 10, 20, 50];   // možné rychlosti přehrávání
let speedIdx   = 0;                 // aktuální index v poli speeds

function updateSpeedDisplay() {
  const el = document.getElementById('speed-display');
  if (!el) return;
  el.textContent = playbackSpeed === 1 ? '1x (real)' : `${playbackSpeed}x`;
}

function updateIncidentBoxes() {
  const countEl = document.getElementById('incident-summary-count');
  const listEl  = document.getElementById('incident-summary-list');
  if (countEl && listEl) {
    countEl.textContent = incidentLog.length;
    listEl.innerHTML = '';
    incidentLog.forEach(inc => {
      const inT  = inc.inStr || '—';
      const outT = inc.outStr || '<em>aktivní</em>';
      const li = document.createElement('li');
      li.innerHTML = `<strong>IN:</strong> ${inT}&nbsp;<strong>OUT:</strong> ${outT}&nbsp;<strong>Doba:</strong> ${inc.duration}s`;
      listEl.appendChild(li);
    });
  }
}

function resetAnimationState() {
  animationActive = false;
  playbackSpeed = 1;
  idx = 0;
  incidentLog = [];
  prevInRed = false;

  if (window.timer) {
    clearTimeout(window.timer);
    window.timer = null;
  }

  if (window.anchorBall && map) {
    map.removeLayer(window.anchorBall);
    window.anchorBall = null;
  }

  const ballInfo = document.getElementById('ball-info-content');
  if (ballInfo) ballInfo.innerHTML = '';

  bothActive = false;
  if (bothTimer) { clearTimeout(bothTimer); bothTimer = null; }

  if (window.markerF) { map.removeLayer(window.markerF); window.markerF = null; }
  if (window.markerB) { map.removeLayer(window.markerB); window.markerB = null; }
  if (window.bothPopup) { window.leafletMap.closePopup(window.bothPopup); window.bothPopup = null; }
  if (window.meshPopup) { window.leafletMap.closePopup(window.meshPopup); window.meshPopup = null; }
  clearMeshUI();

}

// ── zjisti nejbližší mesh GPS v povoleném limitu ─────────
function getNearbyMesh(lat, lon) {
  // Preferuj markery, které kreslí ANCHORFOOTPRINT.js
  const markers = (Array.isArray(window.meshMeshMarkers) && window.meshMeshMarkers.length)
    ? window.meshMeshMarkers
    : (Array.isArray(window.meshMarkers) && window.meshMarkers.length
        ? window.meshMarkers
        : null);

  if (!markers) return null;

  const LIMIT = window.meshMaxDist ?? 5;   // hledáme jen body ≤ LIMIT metrů
  let nearest = null;
  let minDist = LIMIT + 1;

  markers.forEach(m => {
    const d = window.leafletMap.distance(L.latLng(lat, lon), m.getLatLng()); // metry
    if (d <= LIMIT && d < minDist) {
      minDist = d;
      nearest = {
        marker: m,
        dist: d,
        data: m.data || {},                     // {lat, lon, Footprints, Segment, id?}
      };
    }
  });

  return nearest;
}


// --- Pomocné funkce pro shodu kotev (Offline GNSS) ---
function anchorsAtTime(hhmmss) {
  const T = BASIC || [];
  const row = T.find(r => String(r.TIME || r.time || r.Timestamp || r.timestamp).trim() === hhmmss);
  if (!row) return [];
  const ids = [];
  Object.keys(row).forEach(k => {
    if (/^ANCHOR\d+$/i.test(k)) {
      const v = Number(row[k]);
      if (Number.isFinite(v) && v > 0) ids.push(v);
    }
  });
  return ids;
}

function nearestMeshByCoords(lat, lng) {
  const SRC = getMeshSrc();
  let bestId = null, bestD = Infinity, bestLat = null, bestLng = null;
  for (const m of SRC) {
    const ml = pickLat(m);
    const mn = pickLng(m);
    if (typeof ml !== 'number' || typeof mn !== 'number') continue;
    const d = haversine(lat, lng, ml, mn);
    if (d < bestD) { bestD = d; bestId = (m.id ?? m.ID ?? m.code ?? null); bestLat = ml; bestLng = mn; }
  }
  return (bestId != null) ? { id: bestId, dist: bestD, lat: bestLat, lng: bestLng } : null;
}

function footprintForMeshId(mid) {
  const F = getFootSrc();
  if (Array.isArray(F)) {
    const hit = F.find(x => x && (x.id === mid || x.ID === mid || x.code === mid));
    if (!hit) return [];
    return hit.Footprints || hit.Footprint || hit.anchors || [];
  }
  const node = F[mid] || F[String(mid)];
  if (!node) return [];
  return node.Footprints || node.Footprint || node.anchors || [];
}

const step = () => {
  const mode = getMode();
  if (getMode() === 'both') {
  if (window.timer) { clearTimeout(window.timer); window.timer = null; }
    animationActive = false;
    return;
  }
  
  if (!animationActive || idx >= animationData.length - 1 || playbackSpeed <= 0) {
    if (window.timer) {
      clearTimeout(window.timer);
      window.timer = null;
    }
    return;
  }

const rec  = animationData[idx];
const next = animationData[idx + 1];
const recMs  = (rec.time  instanceof Date) ? rec.time.getTime()  : Number(rec.time)  || 0;
const nextMs = (next && next.time != null)
  ? ((next.time instanceof Date) ? next.time.getTime() : Number(next.time) || (recMs + 1000))
  : (recMs + 1000);

// --- CROSS MODE logic removed from renderer.js - now handled by FUSED_GPS.js ---

if (window.FUSED_GPS?.crossMode?.active) {
  console.log(`🚦 [RENDERER] CROSS MODE ACTIVE at ${rec.timeStr}, crossing=${window.FUSED_GPS.crossMode.crossing?.name}`);

// --- DEBUG: Track what drives the robot every second ---
console.log(`🔍 [RENDERER-DEBUG] rec.timeStr=${rec.timeStr}, rec.lat=${rec.lat}, rec.lng=${rec.lng}`);
if (rec.timeStr && rec.timeStr >= "07:13:00" && rec.timeStr <= "07:15:10") {
  console.log(`🔍 [ROBOT-DRIVER] ${rec.timeStr}: lat=${rec.lat.toFixed(6)}, lng=${rec.lng.toFixed(6)}, speed=${rec.speed_mps?.toFixed(3)}, mesh_id=${rec.mesh_id}, matched_count=${rec.matched_count}, matched_ids=[${rec.matched_ids?.join(',') || ''}]`);
  
  if (window.FUSED_GPS && window.FUSED_GPS.crossMode) {
    console.log(`🔍 [CROSS-MODE-STATUS] crossMode.active=${window.FUSED_GPS.crossMode.active}, crossMode.crossing=${window.FUSED_GPS.crossMode.crossing?.name || "null"}, crossMode.decision=${window.FUSED_GPS.crossMode.decision || "null"}`);
  } else {
    console.log(`🔍 [CROSS-MODE-STATUS] window.FUSED_GPS.crossMode not found!`);
  }
}
} // Close the if (window.FUSED_GPS?.crossMode?.active) block

// --- CROSSING DEBUG PANEL UPDATE ---
if (document.getElementById('crossLogPanel') && window.FUSED_GPS?.crossStatus) {
  const cs = window.FUSED_GPS.crossStatus(rec);
  if (cs) {
    const mode = cs.mode || {};
    const d1 = cs.distances.d1.toFixed(1);
    const d2 = cs.distances.d2.toFixed(1);
    const anchors = cs.anchors.length ? cs.anchors.join(", ") : "—";

    document.getElementById('crossLogPanel').innerHTML = `
      <b>CROSS 1 A/B/F</b>: MODE=${mode.active && mode.crossing?.name==="A/B/F" ? "ANO" : "NE"}<br>
      <b>CROSS 2 G/B/B_mezzanin</b>: MODE=${mode.active && mode.crossing?.name==="G/B/B_mezzanin" ? "ANO" : "NE"}<br>
      DIST TO CROSS 1: ${d1} m<br>
      DIST TO CROSS 2: ${d2} m<br>
      CROSS MODE ANCHORS: ${anchors}
    `;
  }
}

const delay  = Math.max(10, (nextMs - recMs) / (playbackSpeed || 1));


  if (mode === 'mesh') {
    meshInfo = getNearbyMesh(rec.lat, rec.lng);
  }
  // Výpočet rychlosti
  let speedKmh = 0;
  let motionType = "neurčeno";
  if (idx > 0) {
    const prev = animationData[idx - 1];
    const distKm = turf.distance(turf.point([prev.lng, prev.lat]), rec.point, { units: 'kilometers' });
    const dt = (rec.time - prev.time) / 1000;
    if (dt > 0) {
      const mps = (distKm * 1000) / dt;
      speedKmh = mps * 3.6;
      if (mps < 0.1) motionType = "stání";
      else if (speedKmh < 1) motionType = "pomalá chůze";
      else if (speedKmh <= 5) motionType = "rychlá chůze";
      else if (speedKmh <= 8) motionType = "běh";
      else motionType = "sprint";
    }
  }

  // Aktualizace hlavní kuličky
  if (window.marker) {
    window.marker.setLatLng([rec.lat, rec.lng]);
  } else {
    // Vytvoříme marker pokud neexistuje
    window.marker = L.circleMarker([rec.lat, rec.lng], {
      radius: 7,
      color: "#000",
      fillColor: "#00bfff",
      fillOpacity: 0.9
    }).addTo(map);
  }
  
// DETEKCE BLÍZKOSTI MESH GPS
let meshInfo = null;
// v těchto módech dává smysl hledat nejbližší MESH bod
if (mode === 'mesh' || mode === 'offlinegnss') {
  meshInfo = getNearbyMesh(rec.lat, rec.lng);
}

const meshExtra = document.getElementById('mesh-extra');
if (meshInfo) {
  if (prevMeshMarker && prevMeshMarker !== meshInfo.marker) {
    prevMeshMarker.setStyle({ color:'#28a745', fillColor:'#28a745' });
  }
  prevFootAnchors.forEach(a => a.setStyle({ color:'blue', fillColor:'blue' }));
  prevFootAnchors = [];

  meshInfo.marker.setStyle({ color:'#ffd400', fillColor:'#ffd400' });
  prevMeshMarker = meshInfo.marker;

const fps = meshInfo?.data?.Footprints || meshInfo?.data?.footprints || meshInfo?.data?.anchors || [];
fps.forEach(id => {
  const m = anchorMarkers.find(a => a.id === id)?.marker;
  if (m) {
    m.setStyle({ color:'#ffd400', fillColor:'#ffd400' });
    prevFootAnchors.push(m);
  }
});

  if (meshExtra){
    const segTxt = meshInfo?.data?.Segment ?? '—';
    meshExtra.innerHTML =
      `<b>MESH hit ▶</b> Footprints: ${fps.join(', ')} | Segment: ${segTxt}`;
  }

  if (!window.meshPopup) window.meshPopup = L.popup({ offset:[0,-10], closeButton:false });
  window.meshPopup
    .setLatLng([rec.lat, rec.lng])
    .setContent(
      `<div style="font-size:11px">
         <b>Footprint:</b> ${fps.join(', ')}<br>
         <b>Segment:</b> ${meshInfo?.data?.Segment ?? '—'}
       </div>`
    )
    .openOn(window.leafletMap);

} else {
  if (prevMeshMarker){
    prevMeshMarker.setStyle({ color:'#28a745', fillColor:'#28a745' });
    prevMeshMarker = null;
  }
  prevFootAnchors.forEach(a => a.setStyle({ color:'blue', fillColor:'blue' }));
  prevFootAnchors = [];
  if (meshExtra) meshExtra.innerHTML = '';
  if (window.meshPopup) window.leafletMap.closePopup(window.meshPopup);
}
  window._lastRecMs  = msOf(rec.time);
// U offline GNSS použij přímo TIME z BASIC_TABLE (rec.timeStr), jinak původní funkci
  window._lastRecStr = (mode === 'offlinegnss')
    ? (rec.timeStr || '00:00:00')
    : timeLabelG(rec);
  console.log("[_lastRecStr SET]", mode, "rec.time:", rec.time, "rec.timeStr:", rec.timeStr, "->", window._lastRecStr);

  updateAnchorColors(L.latLng(rec.lat, rec.lng));
  checkIncidents(rec.point);

  // --- KOTVOVÁ KULIČKA ---
  if (anchorActive && window.AF) {
    const res = window.AF.tick(delay);
    
    if (res.matched) {
      if (!window.anchorBall) {
        // Vytvoříme novou kotvovou kuličku
        window.anchorBall = L.circleMarker([res.lat, res.lon], {
          radius: 7,
          color: "#ff6600",
          fillColor: "#ffaa00",
          fillOpacity: 0.9
        }).addTo(map);
        
        window.anchorBall.bindTooltip(`Kotva ${res.anchorNumber}`, {
          permanent: true,
          direction: 'top',
          className: 'anchor-tooltip'
        }).openTooltip();
      } else {
        // Aktualizujeme existující kuličku
        window.anchorBall.setLatLng([res.lat, res.lon]);
      }
    } else if (window.anchorBall) {
      // Skryjeme kuličku když nejsme ukotveni
      map.removeLayer(window.anchorBall);
      window.anchorBall = null;
    }
  } else if (window.anchorBall) {
    // Skryjeme kuličku když je režim deaktivován
    map.removeLayer(window.anchorBall);
    window.anchorBall = null;
  }

  // Kontrola zón
  const inGreen = (
    turf.booleanPointInPolygon(rec.point, smallPoly) ||
    turf.booleanPointInPolygon(rec.point, segA_poly) ||
    turf.booleanPointInPolygon(rec.point, segB_poly) ||
    turf.booleanPointInPolygon(rec.point, segB_mez_poly) ||
    turf.booleanPointInPolygon(rec.point, segC_poly) ||
    turf.booleanPointInPolygon(rec.point, segD_poly) ||
    turf.booleanPointInPolygon(rec.point, segE_poly) ||
    turf.booleanPointInPolygon(rec.point, segF_poly) ||
    turf.booleanPointInPolygon(rec.point, segG_poly)
  );
  
  const inRed = turf.booleanPointInPolygon(rec.point, bigPoly) && !inGreen;

  // Automatické posouvání mapy
  if (followBall && map) {
    map.panTo([rec.lat, rec.lng], { animate: true, duration: 0.5 });
  }


// Aktualizace informačního panelu
const ballInfo = document.getElementById('ball-info-content');

// --- SPEED mps/kmh – SPOČÍTAT MIMO IF, aby to viděl i popup
let mps = 0;
if (typeof rec.speed_mps === 'number') {
  mps = rec.speed_mps;
} else if (idx > 0) {
  const prev = animationData[idx - 1];
  const distKm = turf.distance(turf.point([prev.lng, prev.lat]), rec.point, { units: 'kilometers' });
  const dt = (rec.time - prev.time) / 1000;
  if (dt > 0) mps = (distKm * 1000) / dt;
}
const kmh = mps * 3.6;

// --- DISTANCE TO NEAREST MESH – taky mimo IF
let distMesh = (typeof rec.dist_to_m === 'number') ? rec.dist_to_m : null;
if (distMesh == null && typeof getNearbyMesh === 'function') {
  const near = getNearbyMesh(rec.lat, rec.lng);
  if (near) distMesh = near.dist;
}
const distTxt = (typeof distMesh === 'number') ? `${distMesh.toFixed(2)} m` : '—';

// --- PANEL U KULIČKY
if (ballInfo) {
  // ---- shoda ID kotev (jen zobrazit) ----
  const matchHtml = (mode === 'offlinegnss' && rec.mesh_id != null)
    ? `<b>Shoda ID kotev:</b> ${
        Number.isFinite(rec.matched_count)
          ? rec.matched_count
          : (Array.isArray(rec.matched_ids) ? rec.matched_ids.length : 0)
      }${
        (Array.isArray(rec.matched_ids) && rec.matched_ids.length)
          ? ` ([${rec.matched_ids.join(', ')}])`
          : ''
      }<br><b>MESH ID:</b> ${rec.mesh_id}<br>`
    : (mode === 'offlinegnss' ? `<b>Shoda ID kotev:</b> 0<br>` : '');
  
    // ... hned nad ballInfo.innerHTML:
const when = rec.timeStr || "00:00:00";
const tStr = when;

// Determine status and badge
let statusText, statusClass;
if (mode === 'offlinegnss') {
  statusText = 'F_GPS (syntetická)';
  statusClass = 'yellow';
} else if (inRed) {
  statusText = 'INCIDENT v zakázané zóně';
  statusClass = 'red';
} else if (inGreen) {
  statusText = 'V povolené zóně';
  statusClass = 'green';
} else {
  statusText = 'Mezi zónami';
  statusClass = 'yellow';
}

ballInfo.innerHTML = `
  <div class="info-item">
    <span class="info-label">Status:</span>
    <span class="status-badge ${statusClass}">${statusText}</span>
  </div>
  <div class="info-item">
    <span class="info-label">Čas:</span>
    <span class="info-value">${tStr}</span>
  </div>
  <div class="info-item">
    <span class="info-label">Souřadnice:</span>
    <span class="info-value">${rec.lat.toFixed(6)}, ${rec.lng.toFixed(6)}</span>
  </div>
  <div class="info-item">
    <span class="info-label">Rychlost:</span>
    <span class="info-value">${mps.toFixed(2)} m/s (${kmh.toFixed(1)} km/h)</span>
  </div>
  <div class="info-item">
    <span class="info-label">Vzdál. k nejbl. MESH:</span>
    <span class="info-value">${distTxt}</span>
  </div>
  ${matchHtml ? `<div class="info-item">
    <span class="info-label">Shoda ID kotev:</span>
    <span class="info-value">${matchHtml.replace(/<[^>]*>/g, '')}</span>
  </div>` : ''}
  <div class="info-item">
    <span class="info-label">ID:</span>
    <span class="info-value">${SUBJECT_ID}</span>
  </div>
`;

  console.log("Single HUD rec:", rec, "timeStr:", rec.timeStr, "lastRecStr:", window._lastRecStr);
}

const panel = document.getElementById('crossLogPanel');
if (panel && rec.crossDebugHtml) {
  panel.innerHTML = rec.crossDebugHtml;
}

// --- POPUP nad kuličkou jen v OFFLINE GNSS
if (mode === 'offlinegnss') {
  if (!window.fgpsPopup) window.fgpsPopup = L.popup({ offset:[0,-10], closeButton:false });
  const mpsLbl = (rec.speed_mps != null) ? rec.speed_mps.toFixed(2) : (kmh/3.6).toFixed(2);
  const tStr   = (mode === 'offlinegnss') ? timeLabelF(rec) : timeLabelG(rec);
  const matchLine = (rec.mesh_id != null)
    ? `<div><b>MATCH:</b> ${rec.matched_count} ${rec.matched_count ? `([${rec.matched_ids.join(', ')}])` : ''} | <b>MESH:</b> ${rec.mesh_id}</div>`
    : `<div><b>MATCH:</b> 0</div>`;

  window.fgpsPopup
    .setLatLng([rec.lat, rec.lng])
    .setContent(
      `<div style="font-size:11px">
        <b>F_GPS</b> ${rec.lat.toFixed(5)}, ${rec.lng.toFixed(5)}<br>
        <b>TIME:</b> ${tStr}<br>
        v: ${mpsLbl} m/s · d→MESH: ${distTxt}
        ${matchLine}
      </div>`
    )
    .openOn(window.leafletMap);
} else if (window.fgpsPopup) {
  window.leafletMap.closePopup(window.fgpsPopup);
}

  // Příprava na další krok
  idx++;
  window.timer = setTimeout(step, delay);
};
window.animationStep = step;

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getVisibleAnchors() {
  return window.currentAnchors ?? [];   // zatím prázdné pole
}

// ← Odtud už běží loadDay na globální úrovni

function loadDay(n) {
  ensureMap();
  resetAnimationState();

  try {
    console.log(`✅ Zvolen den ${n}`);

    const oldScript = document.getElementById('dynamicDayScript');
    if (oldScript) oldScript.remove();

    const script = document.createElement('script');
    script.src = `./RENDERERDATA${n}.js`;
    script.id  = 'dynamicDayScript';

    // CALLBACK onload – musí končit středníkem
script.onload = () => {
  console.log(`✅ RENDERERDATA${n}.js načten`);

  if (!Array.isArray(window.realData) || !window.realData.length) {
    alert("Data nebyla správně načtena.");
    return;
  }

  // GNSS benchmark (z RENDERERDATA*.js)
  // GNSS benchmark (z RENDERERDATA*.js)
  gnssMaster = (window.realData || []).map(d => {
    const t = (typeof d.time === 'number')
      ? d.time
      : Date.parse(
          (typeof d.timestamp === 'string' && d.timestamp.includes('T'))
            ? d.timestamp
            : `1970-01-01T${String(d.timestamp).padStart(8,'0')}Z`
        );
    return {
      lat: +d.lat,
      lng: +d.lng,
      time: t,
      timeStr: d.timeStr || d.timestamp || "00:00:00",   // ← fix přenos stringu
      speed_mps: d.speed_mps ?? null
    };
  }).sort((a,b) => a.time - b.time);



benchData = gnssMaster.slice();
  const mode = document.getElementById('channelSelect')?.value || 'none';

  if (mode === 'both') {
    // V POROVNÁNÍ (obě) NIC NEAUTOSTARTUJEME
    if (typeof bothResetState === 'function') bothResetState();
    bothIdx = 0;
    if (typeof bothSetStartPositions === 'function') {
      bothSetStartPositions();  // zobrazí F_GPS i GNSS kuličku na startu
    }
    // žádný startAnimation/applyChannel tady!
    return;
  }

(function autodetectBasicOffset(){
  if (!benchData.length || !(window.BASIC_TABLE_04062025||window.BASIC_TABLE||[]).length) return;
  const candidates = [-7200, -3600, 0, 3600, 7200]; // -2h..+2h
  let bestOff = 0, bestScore = -1;

  const sample = benchData.slice(0, Math.min(180, benchData.length)); // ~prvních 3 min
  for (const off of candidates) {
    let score = 0;
    for (let i=0; i<sample.length; i+=5) {
      const s = secOfDayUTC(sample[i].time) + off;
      if (anchorsAtSecondOfDay(s).length) score++;
    }
    if (score > bestScore) { bestScore = score; bestOff = off; }
  }
  BASIC_TIME_OFFSET_SEC = bestOff;
  console.log('BASIC_TIME_OFFSET_SEC =', BASIC_TIME_OFFSET_SEC, 's');
})();

  // Single GNSS režim (klasika)
  resetAnimationState();
  startAnimation();       // jede černá kulička podle GNSS
  applyChannel();         // pouze overlaye apod., žádné autospouštění F_GPS
};


    // CALLBACK onerror – taky se středníkem na konci
    script.onerror = () => {
      console.error(`❌ Soubor RENDERERDATA${n}.js se nepodařilo načíst.`);
      alert(`Soubor RENDERERDATA${n}.js se nepodařilo načíst.`);
    };  // ← a tady

    document.body.appendChild(script);

  } catch (e) {
    console.error(`❌ Výjimka při načítání dne ${n}:`, e);
    alert(`Chyba při přepnutí na den ${n}`);
  }
}  // ← a tohle zavíráš až tady

// --- Funkce pro uložení incidentů ---
function saveIncidents() {
  if (!Array.isArray(incidentLog) || incidentLog.length === 0) {
    alert("Žádné incidenty k uložení.");
    return;
  }

  const today = new Date();
  const filename = `incident_log_${today.toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(incidentLog, null, 2)], { type: "application/json" });

  saveAs(blob, filename);

  console.log(`💾 Incidenty uloženy jako ${filename}`);
}

// --- RESET INFO PANELU ---
function resetInfoPanelPosition() {
  const panel = document.getElementById("infoPanel");
  if (!panel) return;
  panel.style.left = "20px";
  panel.style.top = "80px";
  panel.style.right = "auto";
}

// --- Drag and drop pro info panel (incident log)
(function(){
  const infoPanel = document.getElementById("infoPanel");
  if (!infoPanel) return;

  let offsetX = 0, offsetY = 0, dragging = false;

  infoPanel.onmousedown = e => {
    const rect = infoPanel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    dragging = true;
    infoPanel.style.opacity = 0.8;

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', stop);
  };

  function move(e) {
    if (!dragging) return;
    infoPanel.style.left = (e.pageX - offsetX) + "px";
    infoPanel.style.top = (e.pageY - offsetY) + "px";
    infoPanel.style.right = "auto";
  }

  function stop() {
    dragging = false;
    infoPanel.style.opacity = 1;
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', stop);
  }
})();

function drawIncidentChart(incidents) {
  const options = {
    chart: {
      type: 'bar',
      height: 350,
      toolbar: { show: false },
      fontFamily: 'sans-serif'
    },
    title: {
      text: 'Přehled incidentů – 4. 6. 2025',
      align: 'left',
      style: {
        fontSize: '18px',
        fontWeight: 'bold',
        color: '#1e1e2f'
      }
    },
    series: [{
      name: 'Trvání incidentu (s)',
      data: incidents.map(i => i.count)
    }],
    xaxis: {
      categories: incidents.map(i => i.timestamp),
      title: { text: 'Čas vstupu do zóny' },
      labels: {
        rotate: -45,
        style: { fontSize: '12px' }
      }
    },
    yaxis: {
      title: { text: 'Doba trvání (s)' }
    },
    tooltip: {
      y: { formatter: val => `${val} s` }
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: '55%',
        dataLabels: { position: 'top' }
      }
    },
    dataLabels: {
      enabled: true,
      formatter: val => `${val}s`,
      offsetY: -8,
      style: { fontSize: '12px', colors: ["#444"] }
    },
    colors: ['#008ffb']
  };

  // Pokud už graf existuje, zničíme ho před novým vykreslením
  if (window.incidentChart) {
    window.incidentChart.destroy();
  }

  // Vytvoříme nový graf a vykreslíme ho
  const chart = new ApexCharts(
    document.querySelector("#revenue-chart"),
    options
  );
  chart.render();
  window.incidentChart = chart;
  
}

window.applyFusedGpsDataset = function (fused) {
  // Kontrola vstupu
  if (!Array.isArray(fused) || !fused.length) {
    console.warn("applyFusedGpsDataset: prázdný/nesprávný fused dataset");
    return;
  }

  // Připrav F_GPS pro BOTH (vždy ms)
  fusedData = fused.map(r => ({
    lat: r.lat, lng: r.lng,
    time: (typeof r.time === 'number') ? r.time : Date.parse(`1970-01-01T${String(r.timestamp).padStart(8,'0')}Z`),
    timeStr: r.timeStr || r.timestamp || "00:00:00",   // ← doplnit!
    speed_mps: r.speed_mps ?? null,
    dist_to_m: r.dist_to_m ?? null,
    mesh_id: r.mesh_id ?? null,
    matched_count: r.matched_count ?? 0,
    matched_ids: Array.isArray(r.matched_ids) ? r.matched_ids : []
  }));


  const mode = document.getElementById('channelSelect')?.value || 'none';

  if (mode !== 'both') {
    // SINGLE offlinegnss: naplň realData a spusť klasickou animaci
  window.realData = fused.map(r => ({
    lat: r.lat, lng: r.lng,
    timestamp: r.timestamp,
    time: (typeof r.time === 'number') ? r.time : Date.parse(`1970-01-01T${String(r.timestamp).padStart(8,'0')}Z`),
    timeStr: r.timeStr || r.timestamp || "00:00:00",   // ← doplnit!
    speed_mps: r.speed_mps ?? null,
    dist_to_m: r.dist_to_m ?? null,
    mesh_id: r.mesh_id ?? null,
    matched_count: r.matched_count ?? 0,
    matched_ids: Array.isArray(r.matched_ids) ? r.matched_ids : [],
    crossMode: r.crossMode || { active: false, crossing: null, decision: null }
  }));


    if (window.timer) { clearTimeout(window.timer); window.timer = null; }
    idx = 0; 
    animationActive = false;

    console.log(`✅ FUSED_GPS dataset nahrán: ${window.realData.length} záznamů (single)`);
    startAnimation();
    return; // ← tady funkce korektně končí pro SINGLE
  }

  // BOTH – jen připrav (bez autostartu)
  console.log(`✅ FUSED_GPS dataset nahrán: ${fusedData.length} záznamů (BOTH)`);

  if (!Array.isArray(gnssMaster) || !gnssMaster.length) {
    console.warn('BOTH: GNSS (gnssMaster) není načtený – nejdřív zvol den (loadDay).');
    pendingBoth = true;
    return;
  }

  benchData = gnssMaster.slice();     // čistá kopie GNSS
  alignFusedToBenchDate();            // zarovnej jen ČAS F_GPS na den GNSS
  bothIdx = 0;
  bothSetStartPositions();            // polož obě kuličky na start
}; // ← ukončení přiřazení funkce (ne "},")

function clearMeshUI() {
  const meshExtra = document.getElementById('mesh-extra');
  if (meshExtra) meshExtra.innerHTML = '';

  if (window.meshPopup) {
    window.leafletMap.closePopup(window.meshPopup);
    window.meshPopup = null;
  }
  // vrátit zvýraznění kotev/mesh bodu
  if (prevMeshMarker) {
    prevMeshMarker.setStyle({ color:'#28a745', fillColor:'#28a745' });
    prevMeshMarker = null;
  }
  if (Array.isArray(prevFootAnchors) && prevFootAnchors.length) {
    prevFootAnchors.forEach(a => a.setStyle({ color:'blue', fillColor:'blue' }));
    prevFootAnchors = [];
  }
}

function applyChannel() {
  const mode = document.getElementById('channelSelect')?.value || 'none';

  // overlay MESH podle režimu
  const meshOn = (mode === 'mesh' || mode === 'offlinegnss' || mode === 'both');
  toggleMesh(meshOn);

  // ─── BOTH (porovnání) ─────────────────────────────────────────────
  if (mode === 'both') {
    // 1) ukliď všechno, co by mohlo běžet (oba BOTH timery + single)
    stopBoth();
    stopSingle();

    // 2) GNSS benchmark – jen čistá kopie + sort (NEparsuj znovu!)
    if (Array.isArray(gnssMaster) && gnssMaster.length) {
      benchData = gnssMaster.slice().sort((a,b) => a.time - b.time);
    } else {
      console.warn('BOTH: GNSS (gnssMaster) není připravený – nejdřív zvol den (loadDay).');
      return;
    }

    // 3) F_GPS (fusedData) spočti jen když chybí; vždy ms + sort
    if (!Array.isArray(fusedData) || !fusedData.length) {
      let fused = null;

      // a) předpočítaný dataset
      if (window.F_GPS_DATASET?.items?.length) {
        fused = window.F_GPS_DATASET.items.map(r => ({
          lat: r.F_GPS?.lat, lng: r.F_GPS?.lng,
          time: Date.parse(`1970-01-01T${String(r.TIMESTAMP).padStart(8,'0')}Z`),
          timeStr: r.TIMESTAMP || "00:00:00",   // ← doplnit!
          speed_mps: r.SPEED_MPS ?? null,
          dist_to_m: r.DIST_TO_M ?? null,
          mesh_id: r.MESH_ID ?? null,
          matched_count: Array.isArray(r.MATCHED_IDS) ? r.MATCHED_IDS.length : 0,
          matched_ids: Array.isArray(r.MATCHED_IDS) ? r.MATCHED_IDS : []
      }));
      }

      // b) fallback z FUSED_GPS.js
      if (!fused || !fused.length) {
        console.log("🔍 [RENDERER] Calling window.FUSED_GPS.buildFusedSeries() WITHOUT PARAMETERS!");
        const raw = window.FUSED_GPS?.buildFusedSeries?.() || [];
        console.log("🔍 [RENDERER] buildFusedSeries returned:", raw.length, "items");
        console.log("🔍 [RENDERER] raw[0]:", raw[0]);
        console.log("🔍 [RENDERER] raw[raw.length-1]:", raw[raw.length-1]);
        if (raw.length) {
          fused = raw.map(r => ({
          lat: r.lat, lng: r.lng,
          time: (typeof r.time === 'number') ? r.time : Date.parse(`1970-01-01T${String(r.timestamp).padStart(8,'0')}Z`),
          timeStr: r.timeStr || r.timestamp || "00:00:00",   // ← doplnit!
          speed_mps: r.speed_mps ?? null,
          dist_to_m: r.dist_to_m ?? null,
          mesh_id: r.mesh_id ?? null,
          matched_count: r.matched_count ?? 0,
          matched_ids: Array.isArray(r.matched_ids) ? r.matched_ids : []
          }));
        }
      }

      fusedData = Array.isArray(fused) ? fused.sort((a,b)=>a.time-b.time) : [];
      if (!fusedData.length) console.warn('BOTH: fusedData je prázdné – chybí vstupní datasety pro F_GPS.');
    } else {
      // když už je, tak jen zajisti setřídění
      fusedData.sort((a,b)=>a.time-b.time);
    }

    // DEBUG
    console.log('GNSS master vs fused? ', {
      gnss0: gnssMaster?.[0],
      bench0: benchData?.[0],
      fused0: fusedData?.[0],
      sameArray: benchData === fusedData
    });
    console.log('DBG applyChannel BOTH:', {
      gnss0: gnssMaster?.[0],
      bench0: benchData?.[0],
      fused0: fusedData?.[0],
      sameArray: benchData === fusedData
    });

    // 4) polož kuličky na start (nic nespouštěj)
    bothSetStartPositions();
    return;
  }

  // ─── Offline GNSS (syntetika) ─────────────────────────────────────
  if (mode === 'offlinegnss') {
    stopBoth();
    stopSingle(); // ať máš čisto
    if (typeof window.meshMaxDist === 'number' && window.FUSED_GPS?.setSnapDistance) {
      window.FUSED_GPS.setSnapDistance(window.meshMaxDist);
    }
    window.FUSED_GPS?.runOfflineGNSS?.(); // applyFusedGpsDataset → startAnimation()
    return;
  }

  // ─── Pouze MESH overlay ───────────────────────────────────────────
  if (mode === 'mesh') {
    stopBoth();
    stopSingle(); // jen overlay, žádná animace
    clearMeshUI();
    return;
  }

  // ─── default: GNSS single ─────────────────────────────────────────
  // nech běžet single (start/stop řeší loadDay()/startAnimation())
  stopBoth();
}

function anchorsAround(ms, windowSec = 5) {
  const S = windowSec * 1000;
  const set = new Set();
  for (let t = ms - S; t <= ms + S; t += 1000) {
    const d = new Date(t);
    const hh = String(d.getUTCHours()).padStart(2,'0');
    const mm = String(d.getUTCMinutes()).padStart(2,'0');
    const ss = String(d.getUTCSeconds()).padStart(2,'0');
    const ids = anchorsAtTime(`${hh}:${mm}:${ss}`) || [];
    ids.forEach(id => set.add(id));
  }
  return Array.from(set);
}

function bestSegmentForAnchors(anchorIds) {
  const src = getFootSrc(); // footprinty s .Segment a .Footprints
  const scoreBySeg = new Map();

  const list = Array.isArray(src) ? src : Object.values(src);
  for (const node of list) {
    const seg = node?.Segment ?? '—';
    const fps = node?.Footprints || node?.anchors || [];
    if (!Array.isArray(fps) || !fps.length) continue;

    const overlap = fps.filter(id => anchorIds.includes(id)).length;
    if (!overlap) continue;

    scoreBySeg.set(seg, (scoreBySeg.get(seg) || 0) + overlap);
  }

  let best = null, bestScore = 0;
  for (const [seg, sc] of scoreBySeg.entries()) {
    if (sc > bestScore) { best = seg; bestScore = sc; }
  }
  return best; // může být null
}

function nearestMeshOnSegment(lat, lng, segmentName) {
  const mesh = getMeshSrc();
  let best = null, bestD = Infinity;
  for (const m of mesh) {
    const seg = m?.Segment ?? m?.segment;
    if (segmentName && seg !== segmentName) continue;
    const ml = pickLat(m), mn = pickLng(m);
    if (!Number.isFinite(ml) || !Number.isFinite(mn)) continue;
    const d = haversine(lat, lng, ml, mn);
    if (d < bestD) { bestD = d; best = { lat: ml, lng: mn, dist: d }; }
  }
  return best;
}

function correctFgpsByAnchors(series) {
  return series.map(p => {
    const ms = (p.time instanceof Date) ? p.time.getTime() : Number(p.time);
    const ids = anchorsAround(ms, 5);        // ±5 s
    const seg = bestSegmentForAnchors(ids);  // vyber segment s největší shodou
    if (!seg) return p;                      // nic nenašlo – nech jak je

    const snap = nearestMeshOnSegment(p.lat, p.lng, seg);
    if (!snap) return p;

    return { ...p, lat: snap.lat, lng: snap.lng }; // přiklepni na správnou „kolej“
  });
}

  // Šablonová tlačítka DOM
  document.getElementById("startBtn")?.addEventListener("click",  () => { playbackSpeed = 1;  updateSpeedDisplay(); });
  document.getElementById("pauseBtn")?.addEventListener("click",  () => { playbackSpeed = 0;  updateSpeedDisplay(); });
  document.getElementById("stopBtn")?.addEventListener("click",   () => { resetAnimationState(); });

//  Načíst incidenty pro graf (JEDNOU)
document.getElementById("loadIncidentsBtn")?.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type   = "file";
  input.accept = "application/json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const raw = JSON.parse(e.target.result);
        // připrav data pro graf
        const counts = {};
        raw.forEach(inc => {
          const t   = new Date(inc.inDate);
          const key = t.toLocaleString('cs-CZ', { hour:'2-digit', minute:'2-digit' });
          counts[key] = (counts[key] || 0) + 1;
        });
        const prepared = Object.keys(counts)
          .sort((a,b) => {
            const [ah,am] = a.split(':').map(Number);
            const [bh,bm] = b.split(':').map(Number);
            return ah*60+am - (bh*60+bm);
          })
          .map(ts => ({ timestamp: ts, count: counts[ts] }));
        // vykreslíme graf
        drawIncidentChart(prepared);
      } catch (err) {
        console.error(err);
        alert("Chyba při načítání JSON: " + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
});

  // Přepínání seznamů incidentů
    document.getElementById("incident-login-count")?.addEventListener("click", () =>
      toggleBox("incident-login-list")
    );
    document.getElementById("incident-logout-count")?.addEventListener("click", () =>
      toggleBox("incident-logout-list")
    );
    document.getElementById("incident-duration")?.addEventListener("click", () =>
      toggleBox("incident-duration-list")
    );

    function toggleBox(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = element.style.display === 'none' ? 'block' : 'none';
  }
}
  // Uložit incidenty 
  document.getElementById("saveIncidentsBtn")?.addEventListener("click", () => {
    if (!window.incidents || window.incidents.length === 0) {
      alert("Žádné incidenty k uložení.");
      return;
    }
    const blob = new Blob([JSON.stringify(window.incidents, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `incident_log_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Exportovat váš incidentLog
const exportLogBtn = document.getElementById("exportLogBtn");
if (!exportLogBtn) {
  console.error("Tlačítko exportLogBtn nebylo nalezeno");
} else {
  exportLogBtn.addEventListener("click", () => {
    if (incidentLog.length === 0) {
      alert("Žádné incidenty k exportu.");
      return;
    }
    const blob = new Blob([JSON.stringify(incidentLog, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `incident_log_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

  // Vymazání incidentů dole v panelu
  const clearBtn = document.getElementById('clear-logs');
  if (clearBtn) {
    clearBtn.onclick = () => {
      incidents = [];
      updateLogPanel();
    };
  }

// ← SEM vlož kód pro Fullscreen/Restore mapy  
const mapWrapper = document.getElementById('map-wrapper');
const mapEl      = document.getElementById('leafletMap');
const btnFs      = document.getElementById('btn-fullscreen');
const btnRest    = document.getElementById('btn-restore');

if (mapWrapper && mapEl && btnFs && btnRest) {
  btnFs.addEventListener('click', () => {
    Object.assign(mapWrapper.style, {
      position: 'fixed',
      top:      '0',
      left:     '0',
      width:    '100vw',
      height:   '100vh',
      zIndex:   '9999'
    });
    mapEl.style.width  = '100%';
    mapEl.style.height = '100%';

    if (window.leafletMap) {
      window.leafletMap.invalidateSize();
    }
    btnFs.style.display   = 'none';
    btnRest.style.display = 'inline-block';
  });

  btnRest.addEventListener('click', () => {
    Object.assign(mapWrapper.style, {
      position: 'relative',
      top: '',
      left: '',
      width: '',
      height: '',
      zIndex: ''
    });

    mapEl.style.width  = '';
    mapEl.style.height = '';

    if (window.leafletMap) {
    window.leafletMap.invalidateSize();
    }
    btnRest.style.display = 'none';
    btnFs.style.display   = 'inline-block';
  });
}

// RUN
document.getElementById('startBtn')?.addEventListener('click', () => {
  const mode = getMode();
  playbackSpeed = 1; updateSpeedDisplay();

  if (mode === 'both') {
    if (bothPaused && (fIdx < fusedData.length-1 || bIdx < benchData.length-1)) {
      resumeBoth();        // viz předchozí úpravy BOTH
    } else {
      bothRun();
    }
  } else {
    // SINGLE – resume z místa
    if (Array.isArray(animationData) && animationData.length && idx < animationData.length && !animationActive) {
      animationActive = true;
      if (window.timer) { clearTimeout(window.timer); window.timer = null; }
      window.timer = setTimeout(step, 0);
    } else {
      startAnimation(); // první spuštění po loadu
    }
  }
});



// PAUSE
document.getElementById('pauseBtn')?.addEventListener('click', () => {
  const mode = getMode();
  playbackSpeed = 0; updateSpeedDisplay();

  if (mode === 'both') {
    bothPaused = true;
    bothActiveF = false; bothActiveB = false;
    if (bothTimerF) { clearTimeout(bothTimerF); bothTimerF = null; }
    if (bothTimerB) { clearTimeout(bothTimerB); bothTimerB = null; }
  } else {
    animationActive = false;
    if (window.timer) { clearTimeout(window.timer); window.timer = null; }
  }
});


// STOP
document.getElementById('stopBtn')?.addEventListener('click', () => {
  const mode = getMode();
  if (mode === 'both') {
    stopBoth();
    bothSetStartPositions();
    bothPaused = false; fIdx = 0; bIdx = 0;
  } else {
    resetAnimationState();
    if (window.marker && animationData.length) {
      window.marker.setLatLng([animationData[0].lat, animationData[0].lng]);
    }
  }
  updateSpeedDisplay();
});


// FASTER
document.getElementById('fasterBtn')?.addEventListener('click', () => {
  const inBoth = (getMode() === 'both');
  speedIdx = Math.min(speeds.length - 1, speedIdx + 1);
  playbackSpeed = speeds[speedIdx];
  updateSpeedDisplay();

  if (inBoth) {
    if (bothTimerF) { clearTimeout(bothTimerF); bothTimerF = null; }
    if (bothTimerB) { clearTimeout(bothTimerB); bothTimerB = null; }
    scheduleNextF();
    tickGNSS();
  } else if (!animationActive && idx < animationData.length - 1 && !window.timer) {
    animationActive = true; step();
  }
});

// SLOWER
document.getElementById('slowerBtn')?.addEventListener('click', () => {
  const inBoth = (getMode() === 'both');
  speedIdx = Math.max(0, speedIdx - 1);
  playbackSpeed = speeds[speedIdx];
  updateSpeedDisplay();

  if (inBoth) {
    if (bothTimerF) { clearTimeout(bothTimerF); bothTimerF = null; }
    if (bothTimerB) { clearTimeout(bothTimerB); bothTimerB = null; }
    scheduleNextF();
    tickGNSS();
  } else if (!animationActive && idx < animationData.length - 1 && !window.timer) {
    animationActive = true; step();
  }
});

document.getElementById('btn-save-fused-log')?.addEventListener('click', () => {
  const stamp = new Date().toISOString().slice(0,10);
  // 1) JSON log (běžný audit)
  window.FUSED_GPS?.downloadFusedLog?.(`F_GPS_LOG_${stamp}.json`);

  // 2) Pokud chceš i JS dataset (pro snadné <script> načítání):
  // window.FUSED_GPS?.downloadFgpsJs?.(window.fusedLog?.viz_rows ?? [], `F_GPS_${stamp}.js`);
});

// --- KONSTANTY A INDEXY ---
let fIdx = 0;
let bIdx = 0;
let bothPaused = false;

// cílené zpoždění F_GPS za GNSS (v ms)
let FGPS_LAG_MS = 35000;

// Jednotné získání ms z Date/number
const msOf = t => (t instanceof Date ? t.getTime() : Number(t));

// fallback 1Hz rychlost mezi sousedy
function speedFromNeighbors(series, i) {
  if (!series?.length || i <= 0 || i >= series.length) return null;
  const a = series[i-1], b = series[i];
  const dt = (msOf(b.time) - msOf(a.time)) / 1000;
  if (dt <= 0) return null;
  const dist = haversine(a.lat, a.lng, b.lat, b.lng);
  return dist / dt;
}

// Najdi nejlepší MESH kandidát podle průniku kotev
function bestMeshByAnchors(lat, lng, anchorIds, maxDist=25) { // hledáme v okruhu 25 m
  const markers = window.meshMeshMarkers?.length ? window.meshMeshMarkers : window.meshMarkers || [];
  if (!markers.length) return null;

  let best = null, bestScore = -1, bestDist = Infinity;
  for (const m of markers) {
    const fps = m.data?.Footprints || m.data?.anchors || [];
    if (!Array.isArray(fps) || !fps.length) continue;

    // průnik kotev
    const score = fps.filter(id => anchorIds.includes(id)).length;
    if (score <= 0) continue;

    const d = window.leafletMap.distance(L.latLng(lat,lng), m.getLatLng());
    if (d > maxDist) continue;

    // preferuj vyšší průnik a menší vzdálenost
    if (score > bestScore || (score === bestScore && d < bestDist)) {
      best = { lat: m.getLatLng().lat, lng: m.getLatLng().lng, d, score, seg: m.data?.Segment };
      bestScore = score;
      bestDist = d;
    }
  }
  return best;
}

let fgpsSegState = { current: null, lastSwitchMs: 0 };

function maybeSnapFgps(i){
  const f = fusedData[i];
  if (!f) return;
  const fMs = msOf(f.time);

  // 1) okno dopředu ~28–35 s, max 6 řádků BASIC
  const counts = anchorsWindowForward(fMs, 35, 6);  // ← 35 s, ať chytne 07:13:35
  if (!counts || counts.size === 0) return;

  // 2) skóre segmentů a volba
  const scores = segmentScoresFromAnchors(counts);
  const seg    = chooseSegment(scores);
  if (!seg) return;

  // 3) snap jen když jsme rozumně blízko kandidátnímu segmentu
  const snap = nearestMeshInSegment(seg, f.lat, f.lng);

  // --- LOG křižovatky ---
  const secLbl = timeLabelF(f);
  const top2 = [...scores.entries()].sort((a,b)=>b[1]-a[1]).slice(0,2)
               .map(([s,v])=>`${s}:${v.toFixed(2)}`).join('  ');
  const idsNow = anchorsNearest(fMs);
  console.log(`SNAP@${secLbl} idsNow=[${idsNow}] scores{${top2}} -> seg=${seg} snapDist=${snap?.dist?.toFixed(2)}`);

  // 4) přepnutí/hysteréze
  if (fgpsSegState.current !== seg) {
    fgpsSegState.current      = seg;
    fgpsSegState.lastSwitchMs = fMs;
  }

  if (snap && snap.dist <= 15) {
    fusedData[i] = { ...f, lat: snap.lat, lng: snap.lng };
  }
}


// MESH – kotvy z nejbližšího bodu (Footprints)
function meshAnchorsNearest(lat, lng) {
  const near = getNearbyMesh(lat, lng);
  const fps = near?.data?.Footprints || near?.data?.anchors || [];
  return Array.isArray(fps) ? fps : [];
}

// Reálná ΔTIME (žádné přičítání lag konstanty – to jen zkreslovalo)
function deltaTimeSeconds(f, b) {
  if (!f || !b) return 0;
  return (msOf(f.time) - msOf(b.time)) / 1000;
}


// Limit přiblížení k MESH GPS
window.meshMaxDist = 5;
const meshDistInput = document.getElementById("meshDistInput");
if (meshDistInput) {
  meshDistInput.value = window.meshMaxDist;
  meshDistInput.addEventListener("input", e => {
    const v = parseFloat(e.target.value);
    window.meshMaxDist = (isFinite(v) && v > 0) ? v : 5;
  });
}

// select "Animace"
const channelSel = document.getElementById("channelSelect");
if (channelSel) {
  channelSel.addEventListener("change", applyChannel);
}

function nearestByTime(arr, ms, tolSec = 12) {
  if (!arr.length) return null;
  const tol = tolSec * 1000;
  let best = null, bestD = Infinity;
  for (const r of arr) {
    const d = Math.abs(r.time - ms);
    if (d < bestD) { bestD = d; best = r; }
    if (bestD === 0) break;
  }
  return (best && bestD <= tol) ? best : null;
}

function bothResetState(){
  bothActive = false; bothIdx = 0;
  if (bothTimer){ clearTimeout(bothTimer); bothTimer = null; }
  // žádná černá kulička v BOTH
  if (window.marker){ map.removeLayer(window.marker); window.marker = null; }
  if (window.bothPopup) { window.leafletMap.closePopup(window.bothPopup); window.bothPopup = null; }
}

function pointIn(poly, lat, lng) {
  return turf.booleanPointInPolygon(turf.point([lng, lat]), poly);
}
function pointInGreen(lat, lng) {
  return pointIn(smallPoly, lat, lng) ||
         pointIn(segA_poly, lat, lng) ||
         pointIn(segB_poly, lat, lng) ||
         pointIn(segB_mez_poly, lat, lng) ||
         pointIn(segC_poly, lat, lng) ||
         pointIn(segD_poly, lat, lng) ||
         pointIn(segE_poly, lat, lng) ||
         pointIn(segF_poly, lat, lng) ||
         pointIn(segG_poly, lat, lng);
}
function pointInRedOnly(lat, lng) {
  return pointIn(bigPoly, lat, lng) && !pointInGreen(lat, lng);
}
function zoneBadgeFor(lat, lng) {
  if (pointInRedOnly(lat, lng)) return `<span style="color:#dc3545; font-weight:600">Zakázaná zóna</span>`;
  if (pointInGreen(lat, lng))   return `<span style="color:#28a745; font-weight:600">Povolená zóna</span>`;
  return `<span style="color:#6c757d; font-weight:600">Mimo zóny</span>`;
}
function segmentNear(lat, lng) {
  if (pointIn(segA_poly, lat, lng)) return 'SEG_A';
  if (pointIn(segB_poly, lat, lng)) return 'SEG_B';
  if (pointIn(segB_mez_poly, lat, lng)) return 'SEG_B_mez';
  if (pointIn(segC_poly, lat, lng)) return 'SEG_C';
  if (pointIn(segD_poly, lat, lng)) return 'SEG_D';
  if (pointIn(segE_poly, lat, lng)) return 'SEG_E';
  if (pointIn(segF_poly, lat, lng)) return 'SEG_F';
  if (pointIn(segG_poly, lat, lng)) return 'SEG_G';
  return '—';
}

function bothSetStartPositions(){
  if (!fusedData.length || !benchData.length) {
    console.warn('BOTH: nemám data (fusedData/benchData).');
    return;
  }
  ensureBothMarkers_NoPopups();
  window.markerF.setLatLng([fusedData[0].lat, fusedData[0].lng]);
  window.markerB.setLatLng([benchData[0].lat, benchData[0].lng]);
}

// Zarovná ČASY F_GPS na den/čas GNSS. Pozice (lat/lng) se NEMĚNÍ.
function alignFusedToBenchDate() {
  if (!Array.isArray(fusedData) || !fusedData.length) return;
  if (!Array.isArray(benchData) || !benchData.length) return;

  const K = Math.min(20, fusedData.length);
  const diffs = [];
  for (let i = 0; i < K; i++) {
    const f = fusedData[i];
    const b = benchData.find(x => Math.abs(rec.time - f.time) <= 3600 * 1000);
    if (b) diffs.push(b.time - f.time);
  }

  let offset = 0;
  if (diffs.length) {
    diffs.sort((a,b)=>a-b);
    offset = diffs[Math.floor(diffs.length/2)];
  } else {
    const bD = new Date(benchData[0].time);
    const fD = new Date(fusedData[0].time);
    const bMid = Date.UTC(bD.getUTCFullYear(), bD.getUTCMonth(), bD.getUTCDate(), 0,0,0,0);
    const fMid = Date.UTC(fD.getUTCFullYear(), fD.getUTCMonth(), fD.getUTCDate(), 0,0,0,0);
    offset = bMid - fMid;
  }

  if (offset) {
    fusedData = fusedData.map(r => ({ ...r, time: Number(r.time) + offset }));
  }
  console.log('alignFusedToBenchDate(): offset(ms)=', offset);
}

const BASIC = window.BASIC_TABLE_04062025 || window.BASIC_TABLE || [];

function parseBasicTimeToSec(txt){
  if (!txt) return null;
  const [hh,mm,ss] = String(txt).trim().split(':').map(Number);
  if ([hh,mm,ss].some(n=>!Number.isFinite(n))) return null;
  return hh*3600 + mm*60 + ss;
}


function anchorsWindowForward(ms, horizonSec=28, maxRows=6) {
  const start = secOfDayUTC(ms) + BASIC_TIME_OFFSET_SEC;
  const counts = new Map();
  let taken = 0;

  for (let t=0; t<=horizonSec && taken<maxRows; t+=4) { // BASIC má ~4–5s krok
    const ids = anchorsAtSecondOfDay(start + t);
    if (ids.length) {
      ids.forEach(id => counts.set(id, (counts.get(id)||0) + 1));
      taken++;
    }
  }
  return counts;
}


// hraniční (křižovatkové) kotvy s menší vahou
const BOUNDARY_WEIGHTS = new Map([[37,0.5],[38,0.5],[45,0.7]]);

function segmentScoresFromAnchors(counts){
  const scores = new Map();
  if (!ANCHOR_TO_SEG) return scores;

  counts.forEach((cnt, anchorId)=>{
    const segs = ANCHOR_TO_SEG.get(anchorId);
    if (!segs) return;

    // základní váha + oslabení hraničních kotev
    let w = (BOUNDARY_WEIGHTS.get(anchorId) ?? 1) * cnt;

    // pokud je kotva exkluzivní pro jediný segment, výrazně ji posil
    if (EXCLUSIVE_ANCH.has(anchorId)) w *= 2.5;

    segs.forEach(seg=>{
      scores.set(seg, (scores.get(seg)||0) + w);
    });
  });
  return scores;
}

function chooseSegment(scores){
  if (!scores || scores.size === 0) return fgpsSegState.current;

  const items = [...scores.entries()].sort((a,b)=>b[1]-a[1]);
  const [bestSeg, bestScore] = items[0];
  const [, secondScore = 0]  = items[1] || [];

  const prev     = fgpsSegState.current;
  const MARGIN   = 1.25; // 25 % nad druhým
  const MIN_ABS  = 2;    // aspoň 2 výskyty „kotva→segment“

  if (prev && bestSeg !== prev) {
    if (!(bestScore >= MARGIN * secondScore && bestScore >= MIN_ABS)) {
      return prev; // drž se minulé volby, dokud není dominance jasná
    }
  }
  return bestSeg;
}

function nearestMeshInSegment(segment, nearLat, nearLng){
  const coll = (window.meshMeshMarkers && window.meshMeshMarkers.length
                ? window.meshMeshMarkers : window.meshMarkers) || [];
  let best=null, bestD=Infinity;
  coll.forEach(m=>{
    const seg = m.data?.Segment || m.data?.segment || m.data?.SEGMENT;
    if (String(seg) !== String(segment)) return;
    const d = window.leafletMap.distance(L.latLng(nearLat, nearLng), m.getLatLng());
    if (d < bestD) { bestD = d; best = m; }
  });
  return best ? { lat: best.getLatLng().lat, lng: best.getLatLng().lng, dist: bestD } : null;
}


function bothRun() {
  if (!Array.isArray(gnssMaster) || !gnssMaster.length) {
    console.warn('BOTH: GNSS master není načten (vyber den).');
    return;
  }

  // GNSS zdroj: použij stejné zpracování jako single (plynulé!)
  const src = (Array.isArray(window.realData) && window.realData.length)
    ? makeAnimSeries(window.realData)
    : gnssMaster.map(d => ({ lat:d.lat, lng:d.lng, time:d.time, speed_mps:d.speed_mps ?? null }));

  benchData = src.map(r => ({
    lat: r.lat,
    lng: r.lng,
    time: msOf(r.time),
    speed_mps: r.speed_mps ?? null
  })).sort((a,b)=>a.time-b.time);

  // F_GPS
  if (!Array.isArray(fusedData) || !fusedData.length) {
    const raw = window.FUSED_GPS?.buildFusedSeries?.() || [];
    fusedData = raw.map(r => ({
      lat: r.lat, lng: r.lng,
      time: (typeof r.time === 'number') ? r.time : Date.parse(`1970-01-01T${String(r.timestamp).padStart(8,'0')}Z`),
      timeStr: r.timeStr || r.timestamp || "00:00:00",   // ← doplnit!
      speed_mps: r.speed_mps ?? null,
      dist_to_m: r.dist_to_m ?? null,
      mesh_id: r.mesh_id ?? null,
      matched_count: r.matched_count ?? 0,
      matched_ids: Array.isArray(r.matched_ids) ? r.matched_ids : []
    })).sort((a,b)=>a.time-b.time);

  }

  if (!benchData.length || !fusedData.length) {
    console.warn('BOTH: chybí fusedData nebo benchData');
    return;
  }

  // ČASOVÉ ZAROVNÁNÍ F_GPS → GNSS (pozice GNSS se nemění)
  alignFusedToBenchDate();

  // Čisto a markery bez popupů
  stopSingle();
  stopBoth();
  ensureBothMarkers_NoPopups();

  // startovní stav
  fIdx = 0; bIdx = 0; bothPaused = false;
  window.markerF.setLatLng([fusedData[0].lat, fusedData[0].lng]);
  window.markerB.setLatLng([benchData[0].lat, benchData[0].lng]);

  updateFgpsHud(fusedData[0]);
  updateGnssHud(benchData[0]);
  updateBothInfoPanel(0, 0);

  // start obou smyček se zachovaným lagem (lag je škálován rychlostí)
  bothActiveF = true; bothActiveB = true;
  tickGNSS();
  const initialLag = Math.max(0, FGPS_LAG_MS / (playbackSpeed || 1));
  scheduleNextF(initialLag);
}

function resumeBoth() {
  if (!fusedData.length || !benchData.length) { bothRun(); return; }
  if (!window.markerF || !window.markerB) ensureBothMarkers_NoPopups();

  bothActiveF = true; bothActiveB = true; bothPaused = false;

  // obnov HUD/INFO
  updateFgpsHud(fusedData[Math.min(fIdx, fusedData.length-1)]);
  updateGnssHud(benchData[Math.min(bIdx, benchData.length-1)]);
  updateBothInfoPanel(fIdx, bIdx);

  // znovu naplánuj s udržením lag
  if (bothTimerF) { clearTimeout(bothTimerF); bothTimerF = null; }
  if (bothTimerB) { clearTimeout(bothTimerB); bothTimerB = null; }
  scheduleNextF();          // uvnitř si dopočítá extra keepLag
  tickGNSS();
}

bothRun.__version = 'v2-independent';

  // Funkce pro pohyb GNSS kuličky
  function moveGnss() {
    if (!bothActive || bIdx >= benchData.length) return;

    const b = benchData[bIdx];
    window.markerB?.setLatLng([b.lat, b.lng]);
    updateGnssPopup(b);

    // Aktualizuj informační panel
    updateBothInfoPanel(fIdx, bIdx);

    // Výpočet zpoždění pro další krok
    const nextIdx = Math.min(bIdx + 1, benchData.length - 1);
    const delay = calculateDelay(benchData[bIdx], benchData[nextIdx]);

    bIdx++;
    bothBTimer = setTimeout(moveGnss, delay);
  }

  // Pomocná funkce pro výpočet zpoždění
  function calculateDelay(current, next) {
    const ct = current.time instanceof Date ? current.time.getTime() : Number(current.time);
    const nt = next.time    instanceof Date ? next.time.getTime()    : Number(next.time);
    const dt = (Number.isFinite(nt) && Number.isFinite(ct)) ? (nt - ct) : 0;
    return Math.max(10, dt / (playbackSpeed || 1));
  }

// Nové pomocné funkce:

function updateFgpsPopup(fData) {
  if (!window.markerF) return;
  window.markerF.bindPopup(`
    <b>F_GPS</b><br>
    <b>TIME:</b> ${getRecTimeStr(fData)}<br>
    <b>GPS:</b> ${fData.lat.toFixed(6)}, ${fData.lng.toFixed(6)}
  `);
}

function updateGnssPopup(bData) {
  if (!window.markerB) return;
  window.markerB.bindPopup(`
    <b>GNSS</b><br>
    <b>TIME:</b> ${getRecTimeStr(bData)}<br>
    <b>GPS:</b> ${bData.lat.toFixed(6)}, ${bData.lng.toFixed(6)}
  `);
}



function updateBothInfoPanel(fIndex, bIndex) {
  const info = document.getElementById('ball-info-content');
  if (!info) return;

  const f = fusedData[Math.min(fIndex, fusedData.length - 1)];
  const b = benchData[Math.min(bIndex, benchData.length - 1)];
  if (!f || !b) return;

  const f_mps = Number.isFinite(f.speed_mps) ? f.speed_mps : (speedFromNeighbors(fusedData, Math.max(1,fIndex)) ?? 0);
  const b_mps = Number.isFinite(b.speed_mps) ? b.speed_mps : (speedFromNeighbors(benchData, Math.max(1,bIndex)) ?? 0);

  const d_m   = haversine(f.lat, f.lng, b.lat, b.lng);
  const lag_s = (msOf(f.time) - msOf(b.time)) / 1000;
  const d_spd = f_mps - b_mps;

  const zoneHtmlF = zoneBadgeFor(f.lat, f.lng);
  const zoneHtmlB = zoneBadgeFor(b.lat, b.lng);

  const fAnch = anchorsNearest(msOf(f.time));     // BASIC
  const bAnch = meshAnchorsNearest(b.lat, b.lng); // MESH
  const match = fAnch.filter(id => bAnch.includes(id));

  const fTimeStr = f.timeStr || '—';
  const bTimeStr = b.timeStr || '—';


  info.innerHTML = `
    <div class="info-item">
      <span class="info-label">Režim:</span>
      <span class="status-badge yellow">Porovnání (F_GPS vs GNSS)</span>
    </div>
    <div class="info-item">
      <span class="info-label">Zóny:</span>
      <span class="info-value">${zoneHtmlF.replace(/<[^>]*>/g, '')} | ${zoneHtmlB.replace(/<[^>]*>/g, '')}</span>
    </div>
    <div class="info-item">
      <span class="info-label">ΔTIME:</span>
      <span class="info-value">${lag_s.toFixed(2)} s</span>
    </div>
    <div class="info-item">
      <span class="info-label">ΔDIST:</span>
      <span class="info-value">${d_m.toFixed(2)} m</span>
    </div>
    <div class="info-item">
      <span class="info-label">ΔSPEED:</span>
      <span class="info-value">${d_spd.toFixed(2)} m/s</span>
    </div>
    <div class="info-item">
      <span class="info-label">ID MATCH:</span>
      <span class="info-value">${match.length ? match.join(', ') : '—'}</span>
    </div>
    <div class="info-item">
      <span class="info-label">TIME (F_GPS):</span>
      <span class="info-value">${getRecTimeStr(f)}</span>
    </div>
    <div class="info-item">
      <span class="info-label">TIME (GNSS):</span>
      <span class="info-value">${getRecTimeStr(b)}</span>
    </div>
  `;
}



window.dbgAnch = (ms) => {
  const counts = anchorsWindowForward(ms, 28, 6);
  const scores = segmentScoresFromAnchors(counts);
  console.log('DBG BASIC@', fmtTime(ms),
    'counts=', [...counts.entries()],
    'scores=', [...scores.entries()],
    'chosen=', chooseSegment(scores)
  );
};

function ensureBothMarkers_NoPopups() {
  try { window.markerF?.unbindPopup?.(); window.markerF?.closePopup?.(); } catch {}
  try { window.markerB?.unbindPopup?.(); window.markerB?.closePopup?.(); } catch {}
  if (window.bothPopup) { try { window.leafletMap.closePopup(window.bothPopup); } catch {} window.bothPopup = null; }

  if (!window.markerF && fusedData.length) {
    window.markerF = L.circleMarker([fusedData[0].lat, fusedData[0].lng], {
      radius: 7, color:'#004c6d', fillColor:'#00bfff', fillOpacity:0.9
    }).addTo(map).bindTooltip('F_GPS', { permanent:true, direction:'top', className:'anchor-tooltip' });
  }
  if (!window.markerB && benchData.length) {
    window.markerB = L.circleMarker([benchData[0].lat, benchData[0].lng], {
      radius: 7, color:'#a00000', fillColor:'#ff3b30', fillOpacity:0.9
    }).addTo(map).bindTooltip('GNSS', { permanent:true, direction:'top', className:'anchor-tooltip' });
  }
}
// alias pro starší volání (kdyby někde zůstal starý název)
function ensureBothMarkers(){ ensureBothMarkers_NoPopups(); }


// OFFLINE GNSS tlačítka
document.getElementById('btn-offline-gnss')?.addEventListener('click', () => {
  // zarovnej práh snappu s UI
  if (typeof window.meshMaxDist === 'number' && window.FUSED_GPS?.setSnapDistance) {
    window.FUSED_GPS.setSnapDistance(window.meshMaxDist);
  }
  window.FUSED_GPS?.runOfflineGNSS?.();
});

document.getElementById('btn-save-fgps')?.addEventListener('click', () => {
  const fused = window.FUSED_GPS?.buildFusedSeries?.();
  if (Array.isArray(fused) && fused.length) {
    window.FUSED_GPS.downloadFgpsJs(fused, "F_GPS_DATASET.js");
  } else {
    alert("Syntetická data nejsou k dispozici.");
  }

});   // konec DOMContentLoaded
