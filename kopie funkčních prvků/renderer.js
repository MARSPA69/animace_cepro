// renderer.js

const DEVICE     = 'GH5200';
const SUBJECT_ID = 'CEPRO0516';
const MAX_LOGS   = 5;
const TOTAL_DURATION = 150; // seconds total animation

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

// Incident storage
let incidents = [];
let currentIncident = null;
let inIncident = false; // track if currently inside an incident

// Create draggable incident panel
const infoPanel = document.createElement('div');
Object.assign(infoPanel.style, {
  position:'absolute', top:'10px', right:'10px', width:'320px', maxHeight:'260px', overflowY:'auto',
  background:'rgba(255,255,255,0.9)', border:'1px solid #ccc', borderRadius:'4px', padding:'8px', fontSize:'12px', zIndex:1000
});
infoPanel.innerHTML = '<strong>Incident Log</strong><ul id="log-list" style="margin:4px;padding-left:16px;"></ul>';
document.body.appendChild(infoPanel);
(function(){
  let dx, dy;
  infoPanel.onmousedown = e => {
    const rect = infoPanel.getBoundingClientRect(); dx = e.clientX-rect.left; dy = e.clientY-rect.top;
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  function move(e){ infoPanel.style.left = e.pageX-dx+'px'; infoPanel.style.top = e.pageY-dy+'px'; }
  function up(){ document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }
})();

// Initialize map at center of smallPoly
const center = turf.centerOfMass(smallPoly).geometry.coordinates;
const map = L.map('map').setView([center[1], center[0]], 17);
L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OSM contributors' }).addTo(map);
L.geoJSON(smallPoly, { color: 'green', weight: 2, fillOpacity: 0.2 }).addTo(map);
L.geoJSON(bigPoly,   { color: 'red',   weight: 2, fillOpacity: 0   }).addTo(map);

// Movement categories and segment durations
const categories = [ {name:'stání', speed:0}, {name:'pomalá chůze', speed:0.5}, {name:'rychlá chůze', speed:1.0}, {name:'běh', speed:1.5} ];
const durations  = [3,5,7,11,15];

// Build random route starting inside green
let route = [], elapsed = 0;
let ptCur = turf.point(center);
while (elapsed < TOTAL_DURATION) {
  let dur = durations[Math.floor(Math.random()*durations.length)];
  if (elapsed + dur > TOTAL_DURATION) dur = TOTAL_DURATION - elapsed;
  const {name, speed} = categories[Math.floor(Math.random()*categories.length)];
  const bearing = Math.random()*360;
  for (let t=0; t<dur; t++) {
    ptCur = speed > 0
      ? turf.destination(ptCur, speed/1000, bearing, { units: 'kilometers' })
      : ptCur;
    route.push({ pt: ptCur, motion: name, speed });
  }
  elapsed += dur;
}

// Create marker & bind popup
const marker = L.circleMarker([center[1], center[0]], { radius: 6, color: 'black', fillOpacity: 1 }).addTo(map);
marker.bindPopup('', { autoClose: false, closeOnClick: false }).openPopup();

// Animation loop with robust incident logic
let idx = 0;
let wasInGreen = true;
let wasInRed   = false;
const timer = setInterval(() => {
  if (idx >= route.length) return clearInterval(timer);
  const { pt, motion, speed } = route[idx++];
  const [lng, lat] = pt.geometry.coordinates;
  marker.setLatLng([lat, lng]);

  const inGreen = turf.booleanPointInPolygon(pt, smallPoly);
  const inRed   = turf.booleanPointInPolygon(pt, bigPoly);
  const boundaryPoly = inGreen ? smallPoly : bigPoly;
  const dist = turf.pointToLineDistance(pt, turf.polygonToLine(boundaryPoly), { units: 'meters' }).toFixed(1);

  // LogIN: enter red from green, and not already in incident
  if (inRed && !inIncident && wasInGreen) {
    inIncident = true;
    console.log('>> LogIN', lat, lng, motion);
    currentIncident = {
      inDate: new Date(),
      inCoords: `${lat.toFixed(6)},${lng.toFixed(6)}`,
      inMotion: motion,
      inDist: dist
    };
  }

  // LogOUT: return green from red, and currently in incident
  if (inGreen && inIncident && wasInRed) {
    inIncident = false;
    console.log('<< LogOUT', lat, lng, motion);
    currentIncident.outDate   = new Date();
    currentIncident.outCoords = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    currentIncident.outMotion = motion;
    currentIncident.outDist   = dist;
    currentIncident.duration  = Math.round((currentIncident.outDate - currentIncident.inDate)/1000);
    currentIncident.id        = SUBJECT_ID;
    incidents.push(currentIncident);
    if (incidents.length > MAX_LOGS) incidents.shift();
    currentIncident = null;
    updateLogPanel();
  }

  wasInGreen = inGreen;
  wasInRed   = inRed;

  // Popup content
  const statusText = inGreen
    ? '<span style="color:green">Pohyb v povolené zóně</span>'
    : '<span style="color:red">INCIDENT - pohyb v zakázané zóně</span>';
  const popupHtml = `
    <div style="font-size:12px;">
      <b>${statusText}</b><br/>
      ${new Date().toLocaleTimeString()}<br/>
      ${lat.toFixed(6)}, ${lng.toFixed(6)}<br/>
      ID: ${SUBJECT_ID}<br/>
      Pohyb: ${motion} (${speed.toFixed(2)} m/s)<br/>
      Vzdálenost: ${dist} m
    </div>
  `;
  marker.setPopupContent(popupHtml).openPopup();
}, 1000);

// Update incident panel display
function updateLogPanel() {
  const ul = document.getElementById('log-list'); ul.innerHTML = '';
  incidents.forEach(inc => {
    const liIn  = document.createElement('li');
    liIn.textContent  = `IN: ${inc.inDate.toISOString().split('T')[0]}; ${inc.inDate.toTimeString().split(' ')[0]}; ${inc.inCoords}; ${inc.inMotion}; dist: ${inc.inDist} m`;
    ul.appendChild(liIn);
    const liOut = document.createElement('li');
    liOut.textContent = `OUT: ${inc.outDate.toISOString().split('T')[0]}; ${inc.outDate.toTimeString().split(' ')[0]}; ${inc.outCoords}; ${inc.outMotion}; dist: ${inc.outDist} m`;
    ul.appendChild(liOut);
    const liDur = document.createElement('li');
    liDur.textContent = `DURATION: ${inc.duration} s`;
    ul.appendChild(liDur);
    ul.appendChild(document.createElement('hr'));
  });
}
