console.log('ANCHORS:', ANCHORS);

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


const DEVICE = 'GH5200';
const SUBJECT_ID = 'CEPRO0516';
const MAX_LOGS = 5;
const TIME_STEP = 100; // 100 ms

// --- helpers pro režimy a čas ---
// --- režimy a čas ---
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
  bothActive = false;

  // Zastav oba BOTH timery (bez ohledu na stav)
  if (bothTimerF) { clearTimeout(bothTimerF); bothTimerF = null; }
  if (bothTimerB) { clearTimeout(bothTimerB); bothTimerB = null; }

  // Odstraň markery
  if (window.markerF) { try { window.markerF.closePopup?.(); } catch {} map.removeLayer(window.markerF); window.markerF = null; }
  if (window.markerB) { try { window.markerB.closePopup?.(); } catch {} map.removeLayer(window.markerB); window.markerB = null; }

  // Zavři případný společný popup/panel
  if (window.bothPopup) { window.leafletMap.closePopup(window.bothPopup); window.bothPopup = null; }

  // Vyčisti panel vlevo
  const panel = document.getElementById('ball-info-content');
  if (panel) panel.innerHTML = '';
}


function updateFgpsPopup(fData) {
  if (!window.markerF) return;
  const kmh = Number.isFinite(fData.speed_mps) ? (fData.speed_mps*3.6).toFixed(1) : '—';
  const timeStr = new Date(fData.time).toLocaleTimeString();
  const popupContent = `
    <div style="font-size:11px">
      <b>F_GPS</b><br>
      <b>Čas:</b> ${timeStr}<br>
      <b>Souřadnice:</b> ${fData.lat.toFixed(6)}, ${fData.lng.toFixed(6)}<br>
      <b>Rychlost:</b> ${kmh} km/h
    </div>
  `;
  
  if (window.markerF.getPopup()) {
    window.markerF.getPopup().setContent(popupContent);
  } else {
    window.markerF.bindPopup(popupContent).openPopup();
  }
}

function updateGnssPopup(bData) {
  if (!window.markerB) return;
  const kmh = Number.isFinite(fData.speed_mps) ? (fData.speed_mps*3.6).toFixed(1) : '—';
  const timeStr = new Date(bData.time).toLocaleTimeString();
  const popupContent = `
    <div style="font-size:11px">
      <b>GNSS</b><br>
      <b>Čas:</b> ${timeStr}<br>
      <b>Souřadnice:</b> ${bData.lat.toFixed(6)}, ${bData.lng.toFixed(6)}<br>
      <b>Rychlost:</b> ${kmh} km/h
    </div>
  `;
  
  if (window.markerB.getPopup()) {
    window.markerB.getPopup().setContent(popupContent);
  } else {
    window.markerB.bindPopup(popupContent).openPopup();
  }
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
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
    maxZoom: 19, 
    attribution: '&copy; OpenStreetMap contributors',  // ← čárka na konci!
    noWrap: true                                        // ← správně oddělené čárkou od předchozího
  }).addTo(map);
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
      // robustní parsování času
      let tms = null;
      if (typeof d.time === 'number' && Number.isFinite(d.time)) {
        tms = d.time; // už ms
      } else if (typeof d.timestamp === 'string') {
        // přijmi i "HH:MM:SS" i "1970-01-01T...Z"
        const ts = d.timestamp.includes('T')
          ? d.timestamp
          : `1970-01-01T${d.timestamp}Z`;
        const ms = Date.parse(ts);
        if (!Number.isNaN(ms)) tms = ms;
      } else if (typeof d.TIMESTAMP === 'string') {
        const ts = d.TIMESTAMP.includes('T')
          ? d.TIMESTAMP
          : `1970-01-01T${d.TIMESTAMP}Z`;
        const ms = Date.parse(ts);
        if (!Number.isNaN(ms)) tms = ms;
      }

      // fallback – když se nepodaří čas, dej lineární +1s od 0 (ať to aspoň jede)
      if (tms == null) tms = 0;

      const lat = +d.lat;
      const lng = +d.lng;
      return {
        point: turf.point([lng, lat]),
        time: new Date(tms),
        lat,
        lng,
        speed_mps:     (d.speed_mps ?? null),
        dist_to_m:     (d.dist_to_m ?? null),
        mesh_id:       (d.mesh_id ?? null),
        matched_count: (d.matched_count ?? 0),
        matched_ids:   Array.isArray(d.matched_ids) ? d.matched_ids : []
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
    incidentLog.push({ inDate: new Date(), outDate: null, duration: null });
    updateIncidentBoxes();
  }
  // Opustili jsme červenou zónu
  if (!inRed && prevInRed) {
    prevInRed = false;
    const last = incidentLog[incidentLog.length - 1];
    last.outDate  = new Date();
    last.duration = Math.round((last.outDate - last.inDate) / 1000);
    updateIncidentBoxes();
  }
function pointInRedOnly(lat, lng) {
  const p = turf.point([lng, lat]);
  return turf.booleanPointInPolygon(p, bigPoly) && !pointInGreen(lat, lng);
}
function zoneBadgeFor(lat, lng) {
  return pointInRedOnly(lat,lng)
    ? `<span style="color:#dc3545"><b>Zakázaná zóna</b></span>`
    : `<span style="color:#28a745"><b>Povolená zóna</b></span>`;
}

function segmentNear(lat, lng) {
  const near = getNearbyMesh(lat, lng);
  return near?.data?.Segment ?? '—';
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

// --- Info panel pro kuličku ---
const ballInfoPanel = document.createElement('div');
ballInfoPanel.id = 'ballInfoPanel';
Object.assign(ballInfoPanel.style, {
  position: 'absolute',
  bottom: '10px',
  left: '10px',
  width: '280px',
  background: 'rgba(255,255,255,0.95)',
  border: '1px solid #ccc',
  borderRadius: '8px',
  padding: '10px',
  fontSize: '12px',
  zIndex: 1001,
  resize: 'both',
  overflow: 'auto',
  cursor: 'move'
});
ballInfoPanel.innerHTML = `
  <strong>Info o kuličce</strong>
  <div id="ball-info-content" style="margin-top:8px;"></div>
  <div id="mesh-extra"
       style="margin-top:6px; font-size:11px; color:#0d6efd"></div>
`;
document.getElementById('map-wrapper')?.appendChild(ballInfoPanel);

// --- Přetahování panelu ---
(function() {
  let offsetX = 0, offsetY = 0, dragging = false;
  ballInfoPanel.onmousedown = e => {
    const rect = ballInfoPanel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    dragging = true;
    ballInfoPanel.style.opacity = 0.85;
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', stop);
  };

  function move(e) {
    if (!dragging) return;
    ballInfoPanel.style.left = (e.pageX - offsetX) + 'px';
    ballInfoPanel.style.top = (e.pageY - offsetY) + 'px';
    ballInfoPanel.style.bottom = 'auto';
  }

  function stop() {
    dragging = false;
    ballInfoPanel.style.opacity = 1;
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', stop);
  }
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
      <strong style="color:#dc3545">IN:</strong> ${inc.inDate.toLocaleTimeString()} | ${inc.inDist}m
      <div style="font-size:11px; color:#6c757d">${inc.inCoords}</div>
      ${inc.outDate ? `
        <div><strong style="color:#28a745">OUT:</strong> ${inc.outDate.toLocaleTimeString()} | ${inc.outDist}m</div>
        <div><strong>DÉLKA:</strong> ${inc.duration} s</div>
      ` : `<div style="color:#ffc107">● AKTIVNÍ INCIDENT</div>`}
    `;
    ul.appendChild(div);
  });
}

function startAnimation() {
  console.log("startAnimation called");
  console.log("window.leafletMap:", window.leafletMap);
  console.log("window.realData:", window.realData);
  console.log("animationData length:", animationData.length);
  console.log("idx:", idx);

  const mode = document.getElementById('channelSelect')?.value || 'none';
  console.log("startAnimation called");

  if (!window.leafletMap) {
    console.error("Mapa není k dispozici, nelze spustit animaci.");
    return;
  }

  // zdroj pro single: window.realData
  const dataSource = window.realData || [];
  if (!Array.isArray(dataSource) || !dataSource.length) {
    console.error("Nejsou načtena data pro animaci.", dataSource);
    return;
  }

  // v BOTH se single animace nepouští
  if (mode === 'both') {
    console.warn('startAnimation: režim BOTH používá bothRun().');
    return;
  }
// připrav data pro single animaci
  animationData = makeAnimSeries(window.realData);
  if (!animationData.length) {
    console.error("Nejsou načtena reálná data pro animaci (po makeAnimSeries).");
    return;
  }


  // Marker: v SINGLE režimech (GNSS / offlinegnss) černá kulička ANO, v BOTH NE
  if (!window.marker) {
    window.marker = L.circleMarker([animationData[0].lat, animationData[0].lng], {
      radius: 7, color: "#000", fillColor: "#00bfff", fillOpacity: 0.9
    }).addTo(map);
  } else {
    window.marker.setLatLng([animationData[0].lat, animationData[0].lng]);
  }

  // Start přehrávání
  animationActive = true;
  playbackSpeed = 1;
  updateSpeedDisplay();
  idx = 0;
  if (window.timer) { clearTimeout(window.timer); window.timer = null; }
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
      const inT  = new Date(inc.inDate).toLocaleTimeString();
      const outT = inc.outDate
        ? new Date(inc.outDate).toLocaleTimeString()
        : '<em>aktivní</em>';
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
  const T = window.BASIC_TABLE_04062025 || [];
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

const delay  = Math.max(10, (nextMs - recMs) / (playbackSpeed || 1));


  let meshInfo = null;
  if (document.getElementById('channelSelect')?.value === 'mesh') {
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
const mode = document.getElementById('channelSelect')?.value || 'none';

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
  const when = (rec.time instanceof Date) ? rec.time : new Date(rec.time);
  const tStr = (rec.time instanceof Date ? rec.time : new Date(rec.time)).toLocaleTimeString();   // místo rec.time.toLocaleTimeString()

  ballInfo.innerHTML = `
    <b>${mode === 'offlinegnss' ? 'F_GPS (syntetická)' : inRed ? 'INCIDENT v zakázané zóně' : inGreen ? 'V povolené zóně' : 'Mezi zónami'}</b>
    <hr style="margin:5px 0">
    <b>Čas:</b> ${tStr}<br>
    <b>Souřadnice:</b> ${rec.lat.toFixed(6)}, ${rec.lng.toFixed(6)}<br>
    <b>Rychlost:</b> ${mps.toFixed(2)} m/s (${kmh.toFixed(1)} km/h)<br>
    <b>Vzdál. k nejbl. MESH:</b> ${distTxt}<br>
    ${matchHtml}
    <b>ID:</b> ${SUBJECT_ID}
  `;
}

// --- POPUP nad kuličkou jen v OFFLINE GNSS
if (mode === 'offlinegnss') {
  if (!window.fgpsPopup) window.fgpsPopup = L.popup({ offset:[0,-10], closeButton:false });
  const mpsLbl = (rec.speed_mps != null) ? rec.speed_mps.toFixed(2) : (kmh/3.6).toFixed(2);
  const matchLine = (rec.mesh_id != null)
    ? `<div><b>MATCH:</b> ${rec.matched_count} ${rec.matched_count ? `([${rec.matched_ids.join(', ')}])` : ''} | <b>MESH:</b> ${rec.mesh_id}</div>`
    : `<div><b>MATCH:</b> 0</div>`;

  window.fgpsPopup
    .setLatLng([rec.lat, rec.lng])
    .setContent(
      `<div style="font-size:11px">
        <b>F_GPS</b> ${rec.lat.toFixed(5)}, ${rec.lng.toFixed(5)}<br>
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
gnssMaster = (window.realData || []).map(d => {
  const t =
    (typeof d.time === 'number')
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
    time: (typeof r.time === 'number')
            ? r.time
            : Date.parse(`1970-01-01T${String(r.timestamp).padStart(8,'0')}Z`),
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
      timestamp: `1970-01-01T${String(r.timestamp).padStart(8,'0')}Z`,
      time: (typeof r.time === 'number')
              ? r.time
              : Date.parse(`1970-01-01T${String(r.timestamp).padStart(8,'0')}Z`),
      speed_mps: r.speed_mps ?? null,
      dist_to_m: r.dist_to_m ?? null,
      mesh_id: r.mesh_id ?? null,
      matched_count: r.matched_count ?? 0,
      matched_ids: Array.isArray(r.matched_ids) ? r.matched_ids : []
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
    stopBoth();       // <- místo stopSingle()+bothResetState()
    stopSingle();

    // 2) GNSS benchmark (z gnssMaster) – čistá kopie + ms + sort
    if (Array.isArray(gnssMaster) && gnssMaster.length) {
      benchData = gnssMaster.map(d => ({
        lat: d.lat,
        lng: d.lng,
        time: (typeof d.time === 'number') ? d.time : Date.parse(d.timestamp),
        speed_mps: d.speed_mps ?? null
      })).sort((a,b) => a.time - b.time);
    } else {
      console.warn('BOTH: GNSS (gnssMaster) není připravený – nejdřív zvol den (loadDay).');
      return;
    }

    // 3) F_GPS (fusedData), jen když ještě není – ms + sort
    if (!Array.isArray(fusedData) || !fusedData.length) {
      let fused = null;

      // a) předpočítaný dataset
      if (window.F_GPS_DATASET?.items?.length) {
        fused = window.F_GPS_DATASET.items.map(r => ({
          lat: r.F_GPS?.lat, lng: r.F_GPS?.lng,
          time: Date.parse(`1970-01-01T${String(r.TIMESTAMP).padStart(8,'0')}Z`),
          speed_mps: r.SPEED_MPS ?? null,
          dist_to_m: r.DIST_TO_M ?? null,
          mesh_id: r.MESH_ID ?? null,
          matched_count: Array.isArray(r.MATCHED_IDS) ? r.MATCHED_IDS.length : 0,
          matched_ids: Array.isArray(r.MATCHED_IDS) ? r.MATCHED_IDS : []
        }));
      }

      // b) fallback z FUSED_GPS.js
      if (!fused || !fused.length) {
        const raw = window.FUSED_GPS?.buildFusedSeries?.() || [];
        if (raw.length) {
          fused = raw.map(r => ({
            lat: r.lat, lng: r.lng,
            time: (typeof r.time === 'number')
                    ? r.time
                    : Date.parse(`1970-01-01T${String(r.timestamp).padStart(8,'0')}Z`),
            speed_mps: r.speed_mps ?? null,
            dist_to_m: r.dist_to_m ?? null,
            mesh_id: r.mesh_id ?? null,
            matched_count: r.matched_count ?? 0,
            matched_ids: Array.isArray(r.matched_ids) ? r.matched_ids : []
          }));
        }
      }

      fusedData = Array.isArray(fused) ? fused.sort((a,b)=>a.time-b.time) : [];
      if (!fusedData.length) {
        console.warn('BOTH: fusedData je prázdné – chybí vstupní datasety pro F_GPS.');
      }
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

    // 4) zarovnej jen časy F_GPS k dnu GNSS (souřadnice GNSS se nemění)
    alignFusedToBenchDate();

    // 5) polož kuličky na start (nic nespouštěj)
    bothSetStartPositions();
    return;
  }

  // ─── Offline GNSS (syntetika) ─────────────────────────────────────
  if (mode === 'offlinegnss') {
    stopBoth();
    if (typeof window.meshMaxDist === 'number' && window.FUSED_GPS?.setSnapDistance) {
      window.FUSED_GPS.setSnapDistance(window.meshMaxDist);
    }
    window.FUSED_GPS?.runOfflineGNSS?.(); // applyFusedGpsDataset → startAnimation()
    return;
  }

  // ─── Pouze MESH overlay ───────────────────────────────────────────
  if (mode === 'mesh') {
    stopBoth();
    clearMeshUI();
    return;
  }

  // ─── default: GNSS single ─────────────────────────────────────────
  stopBoth(); // přehrávání GNSS řeší loadDay()/startAnimation()
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
  const mode = document.getElementById('channelSelect')?.value || 'none';
  playbackSpeed = 1; updateSpeedDisplay();
  if (mode === 'both') bothRun();
  else startAnimation();
});

// PAUSE
document.getElementById('pauseBtn')?.addEventListener('click', () => {
  const mode = document.getElementById('channelSelect')?.value || 'none';
  playbackSpeed = 0; updateSpeedDisplay();

  if (mode === 'both') {
    bothActive = false;
    if (bothTimerF) { clearTimeout(bothTimerF); bothTimerF = null; }
    if (bothTimerB) { clearTimeout(bothTimerB); bothTimerB = null; }
  } else {
    animationActive = false;
    if (window.timer) { clearTimeout(window.timer); window.timer = null; }
  }
  if (mode === 'mesh') clearMeshUI();
});


// STOP
document.getElementById('stopBtn')?.addEventListener('click', () => {
  const mode = document.getElementById('channelSelect')?.value || 'none';
  if (mode === 'both') {
    stopBoth();
    bothSetStartPositions();
  } else {
    resetAnimationState();
    if (window.marker && animationData.length) {
      window.marker.setLatLng([animationData[0].lat, animationData[0].lng]);
    }
  }
  if (mode === 'mesh') clearMeshUI();
  updateSpeedDisplay();
});

// FASTER
document.getElementById('fasterBtn')?.addEventListener('click', () => {
  if (getMode() === 'both') return; 
  speedIdx = Math.min(speeds.length - 1, speedIdx + 1);
  playbackSpeed = speeds[speedIdx];
  updateSpeedDisplay();
  
  // Restart animace pokud je pozastavená
  if (!animationActive && idx < animationData.length - 1 && !window.timer) {
    animationActive = true;
    step();
  }
});

// SLOWER
document.getElementById('slowerBtn')?.addEventListener('click', () => {
  if (getMode() === 'both') return; 
  speedIdx = Math.max(0, speedIdx - 1);
  playbackSpeed = speeds[speedIdx];
  updateSpeedDisplay();
  
  // Restart animace pokud je pozastavená
  if (!animationActive && idx < animationData.length - 1 && !window.timer) {
    animationActive = true;
    step();
  }
});

document.getElementById('btn-save-fused-log')?.addEventListener('click', () => {
  const stamp = new Date().toISOString().slice(0,10);
  // 1) JSON log (běžný audit)
  window.FUSED_GPS?.downloadFusedLog?.(`F_GPS_LOG_${stamp}.json`);

  // 2) Pokud chceš i JS dataset (pro snadné <script> načítání):
  // window.FUSED_GPS?.downloadFgpsJs?.(window.fusedLog?.viz_rows ?? [], `F_GPS_${stamp}.js`);
});


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

function speedFromNeighbors(series, i) {
  if (i <= 0 || i >= series.length) return null;
  const a = series[i-1], b = series[i];
  const dt = (b.time - a.time) / 1000;
  if (dt <= 0) return null;
  const dist = haversine(a.lat, a.lng, b.lat, b.lng);
  return dist / dt;
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

// jistota, že existují oba markery i jejich pop-up
function ensureBothMarkers() {
  // F_GPS
  if (!window.markerF && fusedData.length) {
    window.markerF = L.circleMarker([fusedData[0].lat, fusedData[0].lng], {
      radius: 7, color:'#004c6d', fillColor:'#00bfff', fillOpacity:0.9
    }).addTo(map).bindTooltip('F_GPS', {permanent:true, direction:'top', className:'anchor-tooltip'});
    window.markerF.bindPopup('', { closeButton:false, autoClose:false, closeOnClick:false, offset:[0,-10] }).openPopup();
  }
  // GNSS
  if (!window.markerB && benchData.length) {
    window.markerB = L.circleMarker([benchData[0].lat, benchData[0].lng], {
      radius: 7, color:'#a00000', fillColor:'#ff3b30', fillOpacity:0.9
    }).addTo(map).bindTooltip('GNSS', {permanent:true, direction:'top', className:'anchor-tooltip'});
    window.markerB.bindPopup('', { closeButton:false, autoClose:false, closeOnClick:false, offset:[0,-10] }).openPopup();
  }
}


function bothSetStartPositions(){
  if (!fusedData.length || !benchData.length) {
    console.warn('BOTH: nemám data (fusedData/benchData).');
    return;
  }
  ensureBothMarkers();
  window.markerF?.setLatLng([fusedData[0].lat, fusedData[0].lng]).openPopup?.();
  window.markerB?.setLatLng([benchData[0].lat, benchData[0].lng]).openPopup?.();
}

// Zarovná ČASY F_GPS na den/čas GNSS. Pozice (lat/lng) se NEMĚNÍ.
function alignFusedToBenchDate() {
  if (!Array.isArray(fusedData) || !fusedData.length) return;
  if (!Array.isArray(benchData) || !benchData.length) return;

  // vezmeme K vzorků F_GPS a hledáme nejbližší GNSS v ±1h
  const K = Math.min(10, fusedData.length);
  const diffs = [];
  for (let i = 0; i < K; i++) {
    const f = fusedData[i];
    const b = benchData.find(x => Math.abs(x.time - f.time) <= 3600 * 1000);
    if (b) diffs.push(b.time - f.time);
  }

  let offset = 0;
  if (diffs.length) {
    diffs.sort((a,b)=>a-b);
    offset = diffs[Math.floor(diffs.length/2)];
  } else {
    // fallback: srovnat půlnoci dnů
    const b0 = Number(benchData[0].time);
    const f0 = Number(fusedData[0].time);
    if (Number.isFinite(b0) && Number.isFinite(f0)) {
      const bD = new Date(b0), fD = new Date(f0);
      const bMid = Date.UTC(bD.getUTCFullYear(), bD.getUTCMonth(), bD.getUTCDate(), 0,0,0,0);
      const fMid = Date.UTC(fD.getUTCFullYear(), fD.getUTCMonth(), fD.getUTCDate(), 0,0,0,0);
      offset = bMid - fMid;
    }
  }

  if (Number.isFinite(offset) && offset !== 0) {
    fusedData = fusedData.map(r => ({ ...r, time: Number(r.time) + offset }));
  }

  const b0ISO = new Date(benchData[0].time).toISOString();
  const f0BeforeISO = new Date(fusedData[0].time - offset).toISOString();
  const f0AfterISO  = new Date(fusedData[0].time).toISOString();
  console.log('alignFusedToBenchDate(): offset(ms)=', offset, { b0ISO, f0BeforeISO, f0AfterISO });
}

function bothRun() {
  // GNSS zdroj = výhradně gnssMaster → normalize + sort
  if (!Array.isArray(gnssMaster) || !gnssMaster.length) {
    console.warn('BOTH: GNSS master není načten (vyber den).');
    return;
  }

  benchData = gnssMaster.map(d => ({
    lat: d.lat,
    lng: d.lng,
    time: (typeof d.time === 'number') ? d.time : Date.parse(d.timestamp),
    speed_mps: d.speed_mps ?? null
  })).filter(x => Number.isFinite(x.time))
    .sort((a,b) => a.time - b.time);

  // F_GPS dataset (pokud ještě není)
  if (!Array.isArray(fusedData) || !fusedData.length) {
    const raw = window.FUSED_GPS?.buildFusedSeries?.() || [];
    fusedData = raw.map(r => ({
      lat: r.lat, lng: r.lng,
      time: (typeof r.time === 'number')
              ? r.time
              : Date.parse(`1970-01-01T${String(r.timestamp).padStart(8,'0')}Z`),
      speed_mps: r.speed_mps ?? null,
      dist_to_m: r.dist_to_m ?? null,
      mesh_id: r.mesh_id ?? null,
      matched_count: r.matched_count ?? 0,
      matched_ids: Array.isArray(r.matched_ids) ? r.matched_ids : []
    })).filter(x => Number.isFinite(x.time))
      .sort((a,b) => a.time - b.time);
  }

  if (!fusedData.length || !benchData.length) {
    console.warn('BOTH: chybí fusedData nebo benchData');
    return;
  }

  // Zarovnej jen čas F_GPS k dni GNSS (pozice GNSS se NEMĚNÍ)
  alignFusedToBenchDate();

  // Ukliď staré běhy
  stopSingle();
  if (bothTimerF) { clearTimeout(bothTimerF); bothTimerF = null; }
  if (bothTimerB) { clearTimeout(bothTimerB); bothTimerB = null; }
  bothActive = true;

  // Startovní pozice a popupy
  ensureBothMarkers();
  window.markerF?.setLatLng([fusedData[0].lat, fusedData[0].lng]).openPopup?.();
  window.markerB?.setLatLng([benchData[0].lat, benchData[0].lng]).openPopup?.();

  let fIdx = 0;
  let bIdx = 0;

  function delayBetween(a, b) {
    const ta = (a.time instanceof Date) ? a.time.getTime() : a.time;
    const tb = (b.time instanceof Date) ? b.time.getTime() : b.time;
    return Math.max(10, (tb - ta) / (playbackSpeed || 1));
  }

  function moveFgps() {
    if (!bothActive || fIdx >= fusedData.length) return;
    const f = fusedData[fIdx];
    window.markerF?.setLatLng([f.lat, f.lng]);
    updateFgpsPopup(f);

    updateBothInfoPanel(fIdx, bIdx); // panel používá fIdx/bIdx, nelepíme podle času

    const nextIdx = Math.min(fIdx + 1, fusedData.length - 1);
    const delay = (nextIdx === fIdx) ? 1000 : delayBetween(fusedData[fIdx], fusedData[nextIdx]);
    fIdx++;
    bothTimerF = setTimeout(moveFgps, delay);
  }

  function moveGnss() {
    if (!bothActive || bIdx >= benchData.length) return;
    const b = benchData[bIdx];
    window.markerB?.setLatLng([b.lat, b.lng]);
    updateGnssPopup(b);

    updateBothInfoPanel(fIdx, bIdx);

    const nextIdx = Math.min(bIdx + 1, benchData.length - 1);
    const delay = (nextIdx === bIdx) ? 1000 : delayBetween(benchData[bIdx], benchData[nextIdx]);
    bIdx++;
    bothTimerB = setTimeout(moveGnss, delay);
  }

  moveFgps();
  moveGnss();
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

  const timeStr = new Date(fData.time).toLocaleTimeString();
  const segF = segmentNear(fData.lat, fData.lng);
  const fKmh = ((fData.speed_mps || 0) * 3.6).toFixed(1);
  
  const mline = (fData.mesh_id != null)
    ? `<div><b>Shoda kotev:</b> ${fData.matched_count}${
        (Array.isArray(fData.matched_ids) && fData.matched_ids.length) ? ` ([${fData.matched_ids.join(', ') }])` : ''
      }</div>`
    : `<div><b>Shoda kotev:</b> 0</div>`;

  const popupContent = `
    <div style="font-size:11px">
      <b>F_GPS</b><br>
      <b>TIME:</b> ${timeStr}<br>
      <b>GPS:</b> ${fData.lat.toFixed(6)}, ${fData.lng.toFixed(6)}<br>
      <b>SEGMENT:</b> ${segF}<br>
      <b>Rychlost:</b> ${fKmh} km/h
      ${mline}
    </div>
  `;

  if (window.markerF.getPopup()) {
    window.markerF.getPopup().setContent(popupContent);
  } else {
    window.markerF.bindPopup(popupContent, { 
      closeButton: false, 
      autoClose: false, 
      closeOnClick: false, 
      offset: [0, -10] 
    }).openPopup();
  }
}

function updateGnssPopup(bData) {
  if (!window.markerB) return;

  const timeStr = new Date(bData.time).toLocaleTimeString();
  const segB = segmentNear(bData.lat, bData.lng);
  const bKmh = ((bData.speed_mps || 0) * 3.6).toFixed(1);

  const popupContent = `
    <div style="font-size:11px">
      <b>GNSS</b><br>
      <b>TIME:</b> ${timeStr}<br>
      <b>GPS:</b> ${bData.lat.toFixed(6)}, ${bData.lng.toFixed(6)}<br>
      <b>SEGMENT:</b> ${segB}<br>
      <b>Rychlost:</b> ${bKmh} km/h
    </div>
  `;

  if (window.markerB.getPopup()) {
    window.markerB.getPopup().setContent(popupContent);
  } else {
    window.markerB.bindPopup(popupContent, { 
      closeButton: false, 
      autoClose: false, 
      closeOnClick: false, 
      offset: [0, -10] 
    }).openPopup();
  }
}

function updateBothInfoPanel(fIdx, bIdx) {
  const info = document.getElementById('ball-info-content');
  if (!info) return;

  const f = fusedData[Math.min(fIdx, fusedData.length - 1)];
  const b = benchData[Math.min(bIdx, benchData.length - 1)];
  if (!f || !b) return;

  const f_mps = Number.isFinite(f.speed_mps) ? f.speed_mps : (speedFromNeighbors(fusedData, Math.max(1, fIdx) ) || 0);
  const b_mps = Number.isFinite(b.speed_mps) ? b.speed_mps : (speedFromNeighbors(benchData, Math.max(1, bIdx)) || 0);

  const d_m   = haversine(f.lat, f.lng, b.lat, b.lng);
  const lag_s = ( (f.time instanceof Date ? f.time.getTime() : f.time)
                - (b.time instanceof Date ? b.time.getTime() : b.time) ) / 1000;
  const d_spd = f_mps - b_mps;

  const fTimeStr = new Date(f.time).toLocaleTimeString();
  const bTimeStr = new Date(b.time).toLocaleTimeString();
  const zoneHtmlF = zoneBadgeFor(f.lat, f.lng);
  const zoneHtmlB = zoneBadgeFor(b.lat, b.lng);

  info.innerHTML = `
    <b>Porovnání (F_GPS vs GNSS)</b>
    <hr style="margin:5px 0">
    <div>${zoneHtmlF} &nbsp;|&nbsp; ${zoneHtmlB}</div>
    <b>ΔTIME:</b> ${lag_s.toFixed(2)} s &nbsp;·&nbsp;
    <b>ΔDIST:</b> ${d_m.toFixed(2)} m &nbsp;·&nbsp;
    <b>ΔSPEED:</b> ${d_spd.toFixed(2)} m/s
    <br>
    <b>TIME (F_GPS):</b> ${fTimeStr} &nbsp;|&nbsp; <b>TIME (GNSS):</b> ${bTimeStr}
  `;
}


function ensureBothMarkers() {
  // F_GPS marker (modrý)
  if (!window.markerF && fusedData.length) {
    window.markerF = L.circleMarker([fusedData[0].lat, fusedData[0].lng], {
      radius: 7,
      color: '#004c6d',
      fillColor: '#00bfff',
      fillOpacity: 0.9
    }).addTo(map);
  }

  // GNSS marker (červený)
  if (!window.markerB && benchData.length) {
    window.markerB = L.circleMarker([benchData[0].lat, benchData[0].lng], {
      radius: 7,
      color: '#a00000',
      fillColor: '#ff3b30',
      fillOpacity: 0.9
    }).addTo(map);
  }
}

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
