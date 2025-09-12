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

const DEVICE = 'GH5200';
const SUBJECT_ID = 'CEPRO0516';
const MAX_LOGS = 5;
const TIME_STEP = 100; // 100 ms

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
    window.AF.init(leafletMap);
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



window.meshMarkers = fixedGpsMesh.map(pt => 
  L.circleMarker([pt.lat, pt.lon], {
    radius: 3,
    color: '#28a745',
    fillColor: '#28a745',
    opacity: 0.6,
    fillOpacity: 0.6
  })
);

// helper pro show/hide
window.showMesh = on=>{
  window.meshMarkers.forEach(m=> on?map.addLayer(m):map.removeLayer(m));
};
showMesh(false);

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

window.marker = L.circleMarker([greenCenter[1], greenCenter[0]], {
  radius: 4, color: '#000000', weight: 1.5, fillColor: '#000000', fillOpacity: 1
}).addTo(map);

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
  if (!window.leafletMap) {
    console.error("Mapa není k dispozici, nelze spustit animaci.");
    return;
  } 

  if (!window.realData || !Array.isArray(window.realData)) {
    console.error("Nejsou načtena reálná data pro animaci.");
    return;
  }

  // Resetujeme pouze pokud jsme na konci nebo při prvním spuštění
  if (idx >= animationData.length - 1 || animationData.length === 0) {
    resetAnimationState();
    
    animationData = window.realData
      .filter(d => d && typeof d.lat === 'number' && typeof d.lng === 'number' && typeof d.timestamp === 'string')
      .map(d => ({
        point: turf.point([d.lng, d.lat]),
        time: new Date(d.timestamp),
        lat: d.lat,
        lng: d.lng
      }));
  }

  if (!window.marker) {
    window.marker = L.circleMarker([animationData[0].lat, animationData[0].lng], {
      radius: 7,
      color: "#000",
      fillColor: "#00bfff",
      fillOpacity: 0.9
    }).addTo(map);
  }

  animationData = window.realData
    .filter(d => d && typeof d.lat === 'number' && typeof d.lng === 'number' && typeof d.timestamp === 'string')
    .map(d => ({
      point: turf.point([d.lng, d.lat]),
      time: new Date(d.timestamp),
      lat: d.lat,
      lng: d.lng
    }));

  if (animationData.length === 0) {
    console.warn("Žádná data pro animaci.");
    return;
  }

  animationActive = true;
  playbackSpeed = 1;
  updateSpeedDisplay();

  if (idx >= animationData.length - 1 || idx === 0) {
    idx = 0;                               // začínáme od nuly
  }                          // začínáme od prvního záznamu
  window.timer = setTimeout(step, 0);  // (může být i prosté step();)
}
window.startAnimation = startAnimation;   // zpřístupní do globálu

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
}

const step = () => {
  if (!animationActive || idx >= animationData.length - 1 || playbackSpeed <= 0) {
    if (window.timer) {
      clearTimeout(window.timer);
      window.timer = null;
    }
    return;
  }

  const rec = animationData[idx];
  const next = animationData[idx + 1];
  const delay = Math.max(10, (next.time - rec.time) / playbackSpeed);

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
  if (ballInfo) {
    ballInfo.innerHTML = `
      <b style="color:${inRed ? '#dc3545' : inGreen ? '#28a745' : '#6c757d'}">
        ${inRed ? 'INCIDENT v zakázané zóně'
                : inGreen ? 'V povolené zóně'
                          : 'Mezi zónami'}
      </b>
      <hr style="margin:5px 0">
      <b>Čas:</b> ${rec.time.toLocaleTimeString()}<br>
      <b>Souřadnice:</b> ${rec.lat.toFixed(6)}, ${rec.lng.toFixed(6)}<br>
      <b>ID:</b> ${SUBJECT_ID}<br>
      <b>Typ pohybu:</b> ${motionType}<br>
      <b>Rychlost:</b> ${speedKmh.toFixed(1)} km/h<br>
      <b>Vzdál. k zóně:</b> ${getDistToSmallPoly(rec.point).toFixed(1)} m
    `;
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
    if (Array.isArray(window.realData) && window.realData.length > 0) {
      resetAnimationState();
      startAnimation();
      applyChannel();          // (zobrazí/skryje mesh podle selectu)
    } else {
      alert("Data nebyla správně načtena.");
    }
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
  if (!infoPanel) return;
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

  // ─── ZDE ZAČÍNÁ TVÁ ZMĚNA ────────────────────────────────────────────────
  // Vytvoříme nový graf a vykreslíme ho
  const chart = new ApexCharts(
    document.querySelector("#revenue-chart"),
    options
  );
  chart.render();
  window.incidentChart = chart;
  
}

function applyChannel() {
  const mode   = document.getElementById('channelSelect')?.value || 'none';
  const meshOn = mode === 'mesh';

  // zapínáme / vypínáme jen mesh
  if (window.AF?.showMesh) {
    window.AF.showMesh(meshOn);
  } else if (typeof window.showMesh === 'function') {   // 🔹 fallback
    window.showMesh(meshOn);
  }
}

window.addEventListener("DOMContentLoaded", () => {
    const mapDiv = document.getElementById('leafletMap');
    if (!mapDiv) {
    console.error('#leafletMap nenalezen v DOM!');
    return;             // přeruší, aby se .style nevolal na null
  }

  // Šablonová tlačítka
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


// START
  document.getElementById('startBtn')?.addEventListener('click', () => {
    playbackSpeed = 1;
    updateSpeedDisplay();
    startAnimation();
  });

// PAUSE
  document.getElementById('pauseBtn')?.addEventListener('click', () => {
    animationActive = false;
    playbackSpeed = 0;
    if (window.timer) {
      clearTimeout(window.timer);
      window.timer = null;
    }
    updateSpeedDisplay();
  });

// STOP
  document.getElementById('stopBtn')?.addEventListener('click', () => {
    resetAnimationState();
    updateSpeedDisplay();
    if (window.marker && animationData.length > 0) {
      window.marker.setLatLng([animationData[0].lat, animationData[0].lng]);
    }
  });

// FASTER
document.getElementById('fasterBtn')?.addEventListener('click', () => {
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
  speedIdx = Math.max(0, speedIdx - 1);
  playbackSpeed = speeds[speedIdx];
  updateSpeedDisplay();
  
  // Restart animace pokud je pozastavená
  if (!animationActive && idx < animationData.length - 1 && !window.timer) {
    animationActive = true;
    step();
  }
});

  const channelSel = document.getElementById("channelSelect");
  if (channelSel) {
    channelSel.addEventListener("change", applyChannel);
  }
});