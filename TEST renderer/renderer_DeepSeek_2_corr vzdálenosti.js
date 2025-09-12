// renderer.js

const DEVICE          = 'GH5200';
const SUBJECT_ID      = 'CEPRO0516';
const MAX_LOGS        = 5;
const TOTAL_DURATION  = 150; // celkem 2:30 = 150s

// --- 0) Polygony a hranice ---
const smallPoly = turf.polygon([[
  [15.075519858,50.043912514],
  [15.074799748,50.044046404],
  [15.074768592,50.043977296],
  [15.075488702,50.043843406],
  [15.075519858,50.043912514]
]]);
const bigPoly = turf.polygon([[
  [15.075727943926456,50.04388804959012],
  [15.075224730800906,50.042617280800906],
  [15.07073961061566,50.04362254814566],
  [15.071383540315411,50.04527173490499],
  [15.074150934405235,50.044943464042994],
  [15.075796531691852,50.04469774951073],
  [15.075972570666634,50.04463428875933],
  [15.075727943926456,50.04388804959012]
]]);
const greenCenter   = turf.centerOfMass(smallPoly).geometry.coordinates;
const redCenter     = turf.centerOfMass(bigPoly).geometry.coordinates;

// Funkce pro výpočet vzdálenosti k nejbližšímu bodu smallPoly
function getDistToSmallPoly(point) {
  const ring = smallPoly.geometry.coordinates[0];
  let minDistance = Infinity;
  
  for (const coord of ring) {
    const vertex = turf.point(coord);
    const d = turf.distance(point, vertex, {units: 'meters'});
    if (d < minDistance) minDistance = d;
  }
  
  return minDistance;
}

// --- 1) Ovládací panel s vylepšenými rychlostmi ---
let playbackSpeed = 1; // 0 = pause, 1 = norm, 5 = 5x, -5 = 5x zpět
const ctrlPanel = document.createElement('div');
Object.assign(ctrlPanel.style,{
  position:'absolute', top:'10px', left:'10px', zIndex:1001,
  background:'rgba(255,255,255,0.8)', padding:'8px', borderRadius:'8px',
  display:'flex', flexWrap:'wrap', gap:'5px', maxWidth:'250px'
});
ctrlPanel.innerHTML=`
  <button id="btn-rw5" title="5x zpět">⏪⏪</button>
  <button id="btn-rw" title="2x zpět">⏪</button>
  <button id="btn-stop" title="Stop">⏹️</button>
  <button id="btn-play" title="Play">▶️</button>
  <button id="btn-pause" title="Pauza">⏸️</button>
  <button id="btn-ff" title="2x vpřed">⏩</button>
  <button id="btn-ff5" title="5x vpřed">⏩⏩</button>
  <div style="width:100%;margin-top:5px;text-align:center">
    Rychlost: <span id="speed-display">1x</span>
  </div>
`;
document.body.appendChild(ctrlPanel);

document.getElementById('btn-play').onclick=() => {
  playbackSpeed = 1;
  document.getElementById('speed-display').textContent = '1x';
};
document.getElementById('btn-pause').onclick=() => {
  playbackSpeed = 0;
  document.getElementById('speed-display').textContent = '0x (pauza)';
};
document.getElementById('btn-ff').onclick=() => {
  playbackSpeed = 2;
  document.getElementById('speed-display').textContent = '2x';
};
document.getElementById('btn-ff5').onclick=() => {
  playbackSpeed = 5;
  document.getElementById('speed-display').textContent = '5x';
};
document.getElementById('btn-rw').onclick=() => {
  playbackSpeed = -2;
  document.getElementById('speed-display').textContent = '2x zpět';
};
document.getElementById('btn-rw5').onclick=() => {
  playbackSpeed = -5;
  document.getElementById('speed-display').textContent = '5x zpět';
};
document.getElementById('btn-stop').onclick=()=>{
  clearInterval(timer);
  playbackSpeed = 0;
  elapsed = 0;
  currentPt = turf.point(greenCenter);
  marker.setLatLng([greenCenter[1], greenCenter[0]]);
  incidents = [];
  updateLogPanel();
  document.getElementById('speed-display').textContent = '0x (stop)';
};

// --- 2) Panel incidentů ---
let incidents = [], prevInRed = false;
const infoPanel = document.createElement('div');
Object.assign(infoPanel.style,{
  position:'absolute', top:'10px', right:'10px',
  width:'320px', maxHeight:'260px', overflowY:'auto',
  background:'rgba(255,255,255,0.9)', border:'1px solid #ccc',
  borderRadius:'8px', padding:'12px', fontSize:'12px', zIndex:1000,
  boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
});
infoPanel.innerHTML=`
  <div style="display:flex; justify-content:space-between; align-items:center;">
    <strong>Incident Log</strong>
    <button id="clear-logs" style="font-size:10px; padding:2px 5px;">Vymazat</button>
  </div>
  <ul id="log-list" style="margin:8px 0; padding-left:16px;"></ul>
`;
document.body.appendChild(infoPanel);

// Přidání funkce pro vymazání logů
document.getElementById('clear-logs').onclick = () => {
  incidents = [];
  updateLogPanel();
};

// Drag and drop pro panel
(function(){
  let dx, dy, dragging = false;
  infoPanel.onmousedown = e => {
    if (e.target.id !== 'clear-logs') {
      const r = infoPanel.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      dragging = true;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      infoPanel.style.opacity = '0.8';
    }
  };
  
  function move(e) {
    if (dragging) {
      infoPanel.style.left = (e.pageX - dx) + 'px';
      infoPanel.style.top = (e.pageY - dy) + 'px';
    }
  }
  
  function up() {
    dragging = false;
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    infoPanel.style.opacity = '';
  }
})();

// --- 3) Inicializace mapy + marker ---
const map = L.map('map').setView([greenCenter[1], greenCenter[0]], 17);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, 
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Přidání polygonů s popisky
L.geoJSON(smallPoly, {
  color: '#28a745',
  weight: 3,
  fillColor: '#90ee90',
  fillOpacity: 0.3
}).bindPopup('Povolená zóna (green)').addTo(map);

L.geoJSON(bigPoly, {
  color: '#dc3545',
  weight: 3,
  dashArray: '5, 10',
  fillOpacity: 0
}).bindPopup('Zakázaná zóna (red)').addTo(map);

// Vylepšený marker
const marker = L.circleMarker([greenCenter[1], greenCenter[0]], {
  radius: 8,
  color: '#000',
  weight: 1.5,
  fillColor: '#007bff',
  fillOpacity: 1
}).addTo(map)
  .bindPopup('', {autoClose: false, closeOnClick: false})
  .openPopup();

// Přidání středů zón
L.circleMarker([greenCenter[1], greenCenter[0]], {
  radius: 4,
  color: '#28a745',
  fillOpacity: 1
}).bindPopup('Střed povolené zóny').addTo(map);

L.circleMarker([redCenter[1], redCenter[0]], {
  radius: 4,
  color: '#dc3545',
  fillOpacity: 1
}).bindPopup('Střed zakázané zóny').addTo(map);

// --- 4) Nová demo časová osa (7 cyklů) ---
const demoTimeline = [];
let t = 0;

for(let cycle = 0; cycle < 7; cycle++) {
  // 1) Green fáze (20s)
  demoTimeline.push({start: t, end: t+5, motion: {name: 'pomalá chůze', speed: 0.7}, zone: 'green'});
  demoTimeline.push({start: t+5, end: t+10, motion: {name: 'rychlá chůze', speed: 1.4}, zone: 'green'});
  demoTimeline.push({start: t+10, end: t+15, motion: {name: 'běh', speed: 3.0}, zone: 'green'});
  demoTimeline.push({start: t+15, end: t+20, motion: {name: 'stání', speed: 0}, zone: 'green'});
  t += 20;
  
  // 2) Přechod do Red (5s) + Red fáze (25s)
  demoTimeline.push({start: t, end: t+5, motion: {name: 'běh', speed: 3.0}, zone: 'crossGreen2Red'});
  demoTimeline.push({start: t+5, end: t+10, motion: {name: 'pomalá chůze', speed: 0.7}, zone: 'red'});
  demoTimeline.push({start: t+10, end: t+15, motion: {name: 'stání', speed: 0}, zone: 'red'});
  demoTimeline.push({start: t+15, end: t+20, motion: {name: 'pomalá chůze', speed: 0.7}, zone: 'red'});
  demoTimeline.push({start: t+20, end: t+30, motion: {name: 'rychlá chůze', speed: 1.4}, zone: 'red'});
  t += 25;
  
  // 3) Přechod do Green (5s) + Green fáze (20s)
  demoTimeline.push({start: t, end: t+5, motion: {name: 'běh', speed: 3.0}, zone: 'crossRed2Green'});
  demoTimeline.push({start: t+5, end: t+10, motion: {name: 'pomalá chůze', speed: 0.7}, zone: 'green'});
  demoTimeline.push({start: t+10, end: t+15, motion: {name: 'rychlá chůze', speed: 1.4}, zone: 'green'});
  demoTimeline.push({start: t+15, end: t+20, motion: {name: 'běh', speed: 3.0}, zone: 'green'});
  demoTimeline.push({start: t+20, end: t+25, motion: {name: 'stání', speed: 0}, zone: 'green'});
  t += 25;
}

// --- 5) Vylepšená smyčka animace s plynulým pohybem ---
let currentPt = turf.point(greenCenter);
let elapsed = 0;
const TIME_STEP = 100; // 100ms = 0.1s pro plynulejší pohyb

const timer = setInterval(() => {
  if (elapsed >= TOTAL_DURATION && playbackSpeed > 0) {
    playbackSpeed = 0;
    document.getElementById('speed-display').textContent = '0x (konec)';
    return;
  }
  
  if (playbackSpeed === 0) return; // pauza
  
  // Výpočet časového kroku s ohledem na rychlost přehrávání
  const timeStep = TIME_STEP / 1000; // převod na sekundy
  const speedFactor = Math.abs(playbackSpeed);
  
  // Provedeme více kroků pro vyšší rychlosti
  for (let i = 0; i < speedFactor; i++) {
    elapsed += (playbackSpeed > 0 ? timeStep : -timeStep);
    
    // Ošetření hranic
    if (elapsed < 0) elapsed = 0;
    if (elapsed > TOTAL_DURATION) {
      elapsed = TOTAL_DURATION;
      break;
    }
    
    // Najít aktivní fázi
    const phase = demoTimeline.find(d => elapsed >= d.start && elapsed < d.end) 
                || demoTimeline[demoTimeline.length - 1];
    const { motion, zone } = phase;
    
    // Pohybový krok
    let destPoint;
    const speedKmPerSec = motion.speed / 3600; // km/s (rychlost v km/h děleno 3600)
    
    // Logika pohybu podle zóny
    switch(zone) {
      case 'green':
        destPoint = turf.destination(
          currentPt, 
          speedKmPerSec * timeStep, 
          turf.bearing(currentPt, turf.point(greenCenter)),
          {units: 'kilometers'}
        );
        break;
      case 'red':
        destPoint = turf.destination(
          currentPt, 
          speedKmPerSec * timeStep, 
          turf.bearing(currentPt, turf.point(redCenter)),
          {units: 'kilometers'}
        );
        break;
      case 'crossGreen2Red':
        destPoint = turf.destination(
          currentPt, 
          speedKmPerSec * timeStep, 
          turf.bearing(currentPt, turf.point(redCenter)),
          {units: 'kilometers'}
        );
        break;
      case 'crossRed2Green':
        destPoint = turf.destination(
          currentPt, 
          speedKmPerSec * timeStep, 
          turf.bearing(currentPt, turf.point(greenCenter)),
          {units: 'kilometers'}
        );
        break;
    }
    
    currentPt = destPoint;
    const [lng, lat] = currentPt.geometry.coordinates;
    marker.setLatLng([lat, lng]);
    
    // Detekce incidentů
    const inGreen = turf.booleanPointInPolygon(currentPt, smallPoly);
    const inRed = turf.booleanPointInPolygon(currentPt, bigPoly) && !inGreen;
    
    // Vypočítat aktuální vzdálenost k smallPoly
    const currentDist = getDistToSmallPoly(currentPt).toFixed(1);
    
    if (inRed && !prevInRed) {
      // LogIN - vstup do červené zóny
      incidents.push({
        inDate: new Date(),
        inCoords: `${lat.toFixed(6)},${lng.toFixed(6)}`,
        inMotion: motion.name,
        inDist: currentDist,
        id: SUBJECT_ID
      });
      if (incidents.length > MAX_LOGS) incidents.shift();
      updateLogPanel();
    }
    
    if (!inRed && prevInRed) {
      // LogOUT - výstup z červené zóny
      const inc = incidents[incidents.length - 1];
      if (inc) {
        inc.outDate = new Date();
        inc.outCoords = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        inc.outMotion = motion.name;
        inc.outDist = currentDist;
        inc.duration = Math.round((inc.outDate - inc.inDate) / 1000);
        updateLogPanel();
      }
    }
    
    prevInRed = inRed;
    
    // Aktualizace popupu
    const status = inGreen
      ? '<span style="color:#28a745">Pohyb v povolené zóně</span>'
      : '<span style="color:#dc3545">INCIDENT v zakázané zóně</span>';
    
    marker.setPopupContent(`
      <div style="font-size:12px; min-width:220px">
        <b>${status}</b><hr style="margin:5px 0">
        <b>Čas:</b> ${new Date().toLocaleTimeString()}<br>
        <b>Souřadnice:</b> ${lat.toFixed(6)}, ${lng.toFixed(6)}<br>
        <b>ID:</b> ${SUBJECT_ID}<br>
        <b>Pohyb:</b> ${motion.name}<br>
        <b>Vzdálenost k zóně:</b> ${currentDist} m
      </div>
    `).openPopup();
  }
}, TIME_STEP); // interval 100ms

// --- 6) Update panelu incidentů ---
function updateLogPanel() {
  const ul = document.getElementById('log-list');
  ul.innerHTML = '';
  
  if (incidents.length === 0) {
    ul.innerHTML = '<li style="color:#6c757d; font-style:italic">Žádné incidenty</li>';
    return;
  }
  
  // Zobrazujeme incidenty od nejnovějšího
  [...incidents].reverse().forEach(inc => {
    const container = document.createElement('div');
    container.style.marginBottom = '10px';
    container.style.padding = '8px';
    container.style.background = '#f8f9fa';
    container.style.borderRadius = '4px';
    container.style.borderLeft = '3px solid #dc3545';
    
    const inInfo = document.createElement('div');
    inInfo.innerHTML = `
      <strong style="color:#dc3545">IN:</strong> 
      ${inc.inDate.toLocaleString()} | 
      ${inc.inMotion} | 
      ${inc.inDist}m
      <div style="font-size:11px; color:#6c757d">${inc.inCoords}</div>
    `;
    container.appendChild(inInfo);
    
    if (inc.outDate) {
      const outInfo = document.createElement('div');
      outInfo.style.marginTop = '5px';
      outInfo.innerHTML = `
        <strong style="color:#28a745">OUT:</strong> 
        ${inc.outDate.toLocaleString()} | 
        ${inc.outMotion} | 
        ${inc.outDist}m
        <div style="font-size:11px; color:#6c757d">${inc.outCoords}</div>
      `;
      container.appendChild(outInfo);
      
      const durationInfo = document.createElement('div');
      durationInfo.style.marginTop = '5px';
      durationInfo.innerHTML = `
        <strong>DÉLKA:</strong> ${inc.duration} sekund
      `;
      container.appendChild(durationInfo);
    } else {
      const activeInfo = document.createElement('div');
      activeInfo.style.marginTop = '5px';
      activeInfo.innerHTML = `<span style="color:#ffc107">●</span> AKTIVNÍ INCIDENT`;
      container.appendChild(activeInfo);
    }
    
    ul.appendChild(container);
  });
}