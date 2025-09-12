// renderer.js

const DEVICE     = 'GH5200';
const SUBJECT_ID = 'CEPRO0516';
const MAX_LOGS   = 5;
const TOTAL_DURATION = 150; // seconds

// Define polygons
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

// Boundaries for distance
const boundaryGreen = turf.polygonToLineString(smallPoly);
const boundaryRed   = turf.polygonToLineString(bigPoly);

// Centers for bounce targets
const greenCenter = turf.centerOfMass(smallPoly).geometry.coordinates;
const redCenter   = turf.centerOfMass(bigPoly).geometry.coordinates;

// Incident storage
let incidents = [];
let inIncident = false;

// Create draggable incident panel
const infoPanel = document.createElement('div');
Object.assign(infoPanel.style, {
  position:'absolute', top:'10px', right:'10px', width:'320px', maxHeight:'260px', overflowY:'auto',
  background:'rgba(255,255,255,0.9)', border:'1px solid #ccc', borderRadius:'4px', padding:'8px', fontSize:'12px', zIndex:1000
});
infoPanel.innerHTML = '<strong>Incident Log</strong><ul id="log-list" style="margin:4px;padding-left:16px;"></ul>';
document.body.appendChild(infoPanel);
(function(){ let dx, dy; infoPanel.onmousedown = e => { const rect = infoPanel.getBoundingClientRect(); dx = e.clientX - rect.left; dy = e.clientY - rect.top; document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); }; function move(e){ infoPanel.style.left = e.pageX-dx+'px'; infoPanel.style.top = e.pageY-dy+'px'; } function up(){ document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }})();

// Initialize map
const map = L.map('map').setView([greenCenter[1], greenCenter[0]], 17);
L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OSM contributors' }).addTo(map);
L.geoJSON(smallPoly, { color: 'green', weight: 2, fillOpacity: 0.2 }).addTo(map);
L.geoJSON(bigPoly,   { color: 'red',   weight: 2, fillOpacity: 0   }).addTo(map);

// Movement categories (m/s)
const categories = [
  { name:'stání', speed:0 },
  { name:'pomalá chůze', speed:0.7 },
  { name:'rychlá chůze', speed:1.4 },
  { name:'běh', speed:3.0 }
];

// Marker setup
let currentPt = turf.point(greenCenter);
const marker = L.circleMarker([greenCenter[1], greenCenter[0]], { radius:6, color:'black', fillOpacity:1 }).addTo(map);
marker.bindPopup('', { autoClose:false, closeOnClick:false }).openPopup();

// Animation state
let elapsed = 0;
// první segment 10–20 s mířící do červené
let segmentTime = Math.floor(Math.random() * 11) + 10;
let goToRed = true;                       // startujeme směrem do červené
let target = turf.point(redCenter);
let motion = categories[1];               // pomalá chůze v zelené

const timer = setInterval(() => {
  if (elapsed >= TOTAL_DURATION) {
    clearInterval(timer);
    return;
  }

  // 1) Pohyb podle bearingu a speed
  const bear = turf.bearing(currentPt, target);
  currentPt = turf.destination(currentPt, motion.speed / 1000, bear, { units: 'kilometers' });
  const [lng, lat] = currentPt.geometry.coordinates;
  marker.setLatLng([lat, lng]);

  // 2) Výpočet zóny a vzdálenosti
  const inGreen = turf.booleanPointInPolygon(currentPt, smallPoly);
  const inRed   = turf.booleanPointInPolygon(currentPt, bigPoly) && !inGreen;
  const distTo  = turf.pointToLineDistance(currentPt,
                   inGreen ? boundaryGreen : boundaryRed,
                   { units: 'meters' })
                   .toFixed(1);

  // 3) Incident logika
  // Konec incidentu: Red→Green
  if (inGreen && inIncident) {
    inIncident = false;
    const inc = incidents[incidents.length - 1];
    inc.outDate   = new Date();
    inc.outCoords = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    inc.outMotion = motion.name;
    inc.outDist   = distTo;
    inc.duration  = Math.round((inc.outDate - inc.inDate) / 1000);
    inc.id        = SUBJECT_ID;
    updateLogPanel();
  }
  // Začátek incidentu: Green→Red
  if (inRed && !inIncident) {
    inIncident = true;
    const curr = {
      inDate:   new Date(),
      inCoords: `${lat.toFixed(6)},${lng.toFixed(6)}`,
      inMotion: motion.name,
      inDist:   distTo
    };
    incidents.push(curr);
    if (incidents.length > MAX_LOGS) incidents.shift();
    updateLogPanel();
  }

  // 4) Přepnutí cíle po uplynutí segmentu
  if (segmentTime <= 0) {
    goToRed = !goToRed;
    target = turf.point(goToRed ? redCenter : greenCenter);
    segmentTime = Math.floor(Math.random() * 11) + 10;
    motion = goToRed
      ? categories[Math.floor(Math.random() * 2) + 2]   // běh v červené
      : categories[Math.floor(Math.random() * 2) + 1];  // chůze v zelené
  }

  // 5) Aktualizace popupu
  const status = inGreen
    ? '<span style="color:green">Pohyb v povolené zóně</span>'
    : '<span style="color:red">INCIDENT - pohyb v zakázané zóně</span>';
  const popup = `
    <div style="font-size:12px;">
      <b>${status}</b><br/>
      ${new Date().toLocaleTimeString()}<br/>
      ${lat.toFixed(6)}, ${lng.toFixed(6)}<br/>
      ID: ${SUBJECT_ID}<br/>
      Pohyb: ${motion.name} (${motion.speed.toFixed(2)} m/s)<br/>
      Vzdálenost: ${distTo} m
    </div>`;
  marker.setPopupContent(popup).openPopup();

  // 6) Snížení čítačů
  segmentTime--;
  elapsed++;
}, 1000);


// Update incident panel
function updateLogPanel() {
  const ul = document.getElementById('log-list'); ul.innerHTML='';
  incidents.forEach(inc => {
    const li1 = document.createElement('li');
    li1.textContent = `IN: ${inc.inDate.toISOString().split('T')[0]} ` +
                      `${inc.inDate.toTimeString().split(' ')[0]}; ${inc.inCoords}; ${inc.inMotion}; ${inc.inDist}m`;
    ul.appendChild(li1);
    if (inc.outDate) {
      const li2 = document.createElement('li');
      li2.textContent = `OUT: ${inc.outDate.toISOString().split('T')[0]} ` +
                        `${inc.outDate.toTimeString().split(' ')[0]}; ${inc.outCoords}; ${inc.outMotion}; ${inc.outDist}m`;
      ul.appendChild(li2);
      const li3 = document.createElement('li');
      li3.textContent = `DURATION: ${inc.duration} sekund`;
      ul.appendChild(li3);
    }
    ul.appendChild(document.createElement('hr'));
  });
}
