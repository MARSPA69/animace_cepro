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

  if (window.timer) {
    clearTimeout(window.timer);
    window.timer = null;
  }

  if (window.marker && map?.removeLayer)  {
    map.removeLayer(window.marker);
    window.marker = null;
  }

  const infoBox = document.getElementById('ball-info-content');
  if (infoBox) infoBox.innerHTML = '';
}

function startAnimation() {
  resetAnimationState();

  if (!window.realData || !Array.isArray(window.realData)) {
    console.error("Nejsou načtena reálná data pro animaci.");
    return;
  }

  animationData = window.realData
    .filter(d => d && typeof d.lat === 'number' && typeof d.lng === 'number' && typeof d.timestamp === 'string')
    .map(d => ({
      point: turf.point([d.lng, d.lat]),
      time: new Date(d.timestamp),
      lat: d.lat,
      lng: d.lng
    }));



// renderer.js

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
  [15.0747774879861,50.0439940454987],
  [15.073886377953,50.0442231354994],
  [15.073900282052,50.0442579645001],
  [15.0747913920189,50.0440288745009],
  [15.0747774879861,50.0439940454987]
]]);

const segB_poly = turf.polygon([[
  [15.0737810795654,50.044276150576],
  [15.0730153095503,50.0444181405764],
  [15.0730254904534,50.0444534994233],
  [15.0737912604384,50.0443115094237],
  [15.0737810795654,50.044276150576]
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

const bigPoly = turf.polygon([[
  [15.075727943926456,50.04388804959012],
  [15.075249589393858, 50.04257702347922],
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
map = window.map = L.map('map').setView([greenCenter[1], greenCenter[0]], 17);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',  // ← čárka na konci!
  noWrap: true                                        // ← správně oddělené čárkou od předchozího
}).addTo(map);

// Omezení rozsahu panování maxBounds
window.map.setMaxBounds([
  [48.5, 12.0],  // jihozápadní roh
  [51.1, 18.9]   // severovýchodní roh
]);

L.geoJSON(smallPoly,     { color:'#28a745', weight:3, fillOpacity:0.3 }).bindPopup('Povolená zóna').addTo(map);
L.geoJSON(segA_poly,     { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_A poly').addTo(map);
L.geoJSON(segB_poly,     { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_B poly').addTo(map);
L.geoJSON(segB_mez_poly, { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_B_mez poly').addTo(map);
L.geoJSON(segC_poly,     { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_C poly').addTo(map);
L.geoJSON(bigPoly,       { color:'#dc3545', weight:3, dashArray:'5,10', fillOpacity:0 }).bindPopup('Zakázaná zóna').addTo(map);

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

const marker = L.circleMarker([greenCenter[1], greenCenter[0]], {
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
    turf.booleanPointInPolygon(point, segC_poly)
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
const exportBtn = document.createElement('button');
exportBtn.textContent = "Exportovat incidenty";
exportBtn.style = "margin-top:10px; font-size:11px; padding:5px 10px; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer;";
exportBtn.onclick = () => {
  const blob = new Blob([JSON.stringify(incidents, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `incident_log_${today}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
infoPanel.appendChild(exportBtn);

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

  idx = 0; // nebo currentIndex
  animationActive = true;

  window.marker = L.circleMarker([animationData[0].lat, animationData[0].lng], {
    radius: 7,
    color: "#000",
    fillColor: "#00bfff",
    fillOpacity: 0.9
  }).addTo(map);
  
  

const step = () => {
  // jediná podmínka, která případně animaci zastaví
  if (!animationActive || idx >= animationData.length - 1 || playbackSpeed <= 0) {
    if (window.timer) {
      clearTimeout(window.timer);
      window.timer = null;    // umožní RUN po pauze
    }
    return;
  }
  const rec  = animationData[idx];
  const next = animationData[idx + 1];
  const delay = Math.max(10, (next.time - rec.time) / playbackSpeed);

  let speedKmh   = 0;
  let motionType = "neurčeno";

  if (idx > 0) {
    const prev   = animationData[idx - 1];
    const distKm = turf.distance(turf.point([prev.lng, prev.lat]), rec.point, { units: 'kilometers' });
    const dt     = (rec.time - prev.time) / 1000;
    if (dt > 0) {
      const mps = (distKm * 1000) / dt;
      speedKmh  = mps * 3.6;
      if (mps < 0.1)        motionType = "stání";
      else if (speedKmh < 1) motionType = "pomalá chůze";
      else if (speedKmh <= 5) motionType = "rychlá chůze";
      else if (speedKmh <= 8) motionType = "běh";
      else                    motionType = "sprint";
    }
  }
  
    window.marker.setLatLng([rec.lat, rec.lng]);
    updateAnchorColors(L.latLng(rec.lat, rec.lng));
    checkIncidents(rec.point);

    const inGreen = (
      turf.booleanPointInPolygon(rec.point, smallPoly) ||
      turf.booleanPointInPolygon(rec.point, segA_poly) ||
      turf.booleanPointInPolygon(rec.point, segB_poly) ||
      turf.booleanPointInPolygon(rec.point, segB_mez_poly) ||
      turf.booleanPointInPolygon(rec.point, segC_poly)
    );
    const inRed = turf.booleanPointInPolygon(rec.point, bigPoly) && !inGreen;

    if (followBall) map.panTo([rec.lat, rec.lng], { animate: true, duration: 0.5 });

    document.getElementById('ball-info-content').innerHTML = `
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
      <b>Vzdál. k zóně:</b> ${getDistToSmallPoly(rec.point).toFixed(1)} m
    `;

    idx++;
    window.timer = setTimeout(step, delay);
};

    window.animationStep = step;
  step();

}

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

// ← Odtud už běží loadDay na globální úrovni

function loadDay(n) {
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
      if (Array.isArray(window.realData)) {
        startAnimation();
      } else {
        alert("Data nebyla správně načtena.");
      }
    };  // ← toto je klíčové

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

window.addEventListener("DOMContentLoaded", () => {
  // Šablonová tlačítka
  document.getElementById("startBtn")?.addEventListener("click",  () => { playbackSpeed = 1;  updateSpeedDisplay(); });
  document.getElementById("pauseBtn")?.addEventListener("click",  () => { playbackSpeed = 0;  updateSpeedDisplay(); });
  document.getElementById("fasterBtn")?.addEventListener("click", () => { playbackSpeed = 2;  updateSpeedDisplay(); });
  document.getElementById("slowerBtn")?.addEventListener("click", () => { playbackSpeed = -1; updateSpeedDisplay(); });
  document.getElementById("stopBtn")?.addEventListener("click",   () => { location.reload(); });

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
  const exportBtn = document.getElementById("exportLogBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
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
  const mapEl      = document.getElementById('map');
  const btnFs      = document.getElementById('btn-fullscreen');
  const btnRest    = document.getElementById('btn-restore');

  if (mapWrapper && mapEl && btnFs && btnRest) {
    btnFs.addEventListener('click', () => {
      Object.assign(mapWrapper.style, {
        position: 'fixed', top:'0', left:'0', width:'100vw', height:'100vh', zIndex:'9999'
      });
      mapEl.style.width  = '100%';
      mapEl.style.height = '100%';
      map.invalidateSize();
      btnFs.style.display   = 'none';
      btnRest.style.display = 'inline-block';
    });
    btnRest.addEventListener('click', () => {
      Object.assign(mapWrapper.style, {
        position:'relative', width:'', height:'', zIndex:''
      });
      mapEl.style.width  = '';
      mapEl.style.height = '';
      map.invalidateSize();
      btnRest.style.display = 'none';
      btnFs.style.display   = 'inline-block';
    });
  }

  // RUN
document.getElementById('startBtn')?.addEventListener('click', () => {
  if (!animationActive) {
    startAnimation();
  } else {
    playbackSpeed = 1;
    if (!window.timer) window.animationStep();
  }
});

  // PAUSE
document.getElementById('pauseBtn')?.addEventListener('click', () => {
  playbackSpeed = 0;
  updateSpeedDisplay();
  if (window.timer) {
    clearTimeout(window.timer);
    window.timer = null;                  // aby RUN poznal pauzu
  }
});

  // STOP - kompletní reset
  document.getElementById("stopBtn")?.addEventListener("click", () => {
    resetAnimationState();
    incidentLog = []; // Přidaný reset incidentů
    incidents = [];
    updateLogPanel();
  });

  // FWD - zrychlení (oddělená logika)
document.getElementById('fasterBtn')?.addEventListener('click', () => {
  speedIdx = Math.min(speeds.length - 1, speedIdx + 1);
  playbackSpeed = speeds[speedIdx];
  updateSpeedDisplay();
  if (!window.timer && animationActive && playbackSpeed > 0) window.animationStep();
});

  // SLOWER - zpomalení (oddělená logika)
document.getElementById('slowerBtn')?.addEventListener('click', () => {
  speedIdx = Math.max(0, speedIdx - 1);
  playbackSpeed = speeds[speedIdx];
  updateSpeedDisplay();
  if (!window.timer && animationActive && playbackSpeed > 0) window.animationStep();
});

// 5. Přidaná funkce pro aktualizaci zobrazení rychlosti
function updateSpeedDisplay() {
  const speedDisplay = document.getElementById('speed-display');
  if (speedDisplay) {
    speedDisplay.textContent = `${playbackSpeed.toFixed(1)}×`;
  }
}
});
