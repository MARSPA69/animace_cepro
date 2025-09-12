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

// Incident storage
let incidents = [];
let currentIncident = null;
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
const mapCenter = turf.centerOfMass(smallPoly).geometry.coordinates;
const map = L.map('map').setView([mapCenter[1], mapCenter[0]], 17);
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
let currentPt = turf.point(mapCenter);
const marker = L.circleMarker([mapCenter[1], mapCenter[0]], { radius:6, color:'black', fillOpacity:1 }).addTo(map);
marker.bindPopup('', { autoClose:false, closeOnClick:false }).openPopup();

// Animation state
let elapsed = 0;
let motion = categories[0];
let motionTime = 0;
let bearing = Math.random()*360;

const timer = setInterval(() => {
  if (elapsed >= TOTAL_DURATION) return clearInterval(timer);

  // Change motion when duration expires
  if (motionTime <= 0) {
    const idx = Math.floor(Math.random()*categories.length);
    motion = categories[idx];
    motionTime = Math.floor(Math.random()*15)+5; // 5–19s per segment
    bearing = Math.random()*360;
  }

  // Compute next point based on haversine (km per second = speed/1000)
  currentPt = turf.destination(
    currentPt,
    motion.speed/1000,
    bearing,
    { units:'kilometers' }
  );

  const [lng, lat] = currentPt.geometry.coordinates;
  marker.setLatLng([lat, lng]);

  // Zone status and distance
  const inGreen = turf.booleanPointInPolygon(currentPt, smallPoly);
  const inRed   = turf.booleanPointInPolygon(currentPt, bigPoly) && !inGreen;
  const distance = turf.pointToLineDistance(
    currentPt,
    inGreen ? boundaryGreen : boundaryRed,
    { units:'meters' }
  ).toFixed(1);

  // Incident logic
  if (inGreen && inIncident) {
    // LogOUT
    inIncident = false;
    const inc = incidents[incidents.length-1];
    inc.outDate = new Date();
    inc.outCoords = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    inc.outMotion = motion.name;
    inc.outDist = distance;
    inc.duration = Math.round((inc.outDate - inc.inDate)/1000);
    inc.id = SUBJECT_ID;
    console.log('<<< Incident END', inc);
    updateLogPanel();
  }
  if (inRed && !inIncident && elapsed>5) {
    // LogIN (after initial 5s in green)
    inIncident = true;
    const curr = {
      inDate: new Date(),
      inCoords: `${lat.toFixed(6)},${lng.toFixed(6)}`,
      inMotion: motion.name,
      inDist: distance
    };
    incidents.push(curr);
    if (incidents.length>MAX_LOGS) incidents.shift();
    console.log('>>> Incident START', curr);
    updateLogPanel();
  }

  // Update popup
  const statusText = inGreen
    ? '<span style="color:green">Pohyb v povolené zóně</span>'
    : '<span style="color:red">INCIDENT - pohyb v zakázané zóně</span>';
  const html = `<div style="font-size:12px;"><b>${statusText}</b><br/>`+
               `${new Date().toLocaleTimeString()}<br/>`+
               `${lat.toFixed(6)}, ${lng.toFixed(6)}<br/>`+
               `ID: ${SUBJECT_ID}<br/>`+
               `Pohyb: ${motion.name} (${motion.speed.toFixed(2)} m/s)<br/>`+
               `Vzdálenost: ${distance} m</div>`;
  marker.setPopupContent(html).openPopup();

  motionTime--; elapsed++;
}, 1000);

// Update incident panel
function updateLogPanel() {
  const ul = document.getElementById('log-list'); ul.innerHTML = '';
  incidents.forEach(inc => {
    const li1 = document.createElement('li');
    li1.textContent = `IN: ${inc.inDate.toISOString().split('T')[0]} ${inc.inDate.toTimeString().split(' ')[0]}; ` +
                      `${inc.inCoords}; ${inc.inMotion}; ${inc.inDist}m`;
    ul.appendChild(li1);
    if (inc.outDate) {
      const li2 = document.createElement('li');
      li2.textContent = `OUT: ${inc.outDate.toISOString().split('T')[0]} ${inc.outDate.toTimeString().split(' ')[0]}; ` +
                        `${inc.outCoords}; ${inc.outMotion}; ${inc.outDist}m`;
      const li3 = document.createElement('li');
      li3.textContent = `DURATION: ${inc.duration} sekund`;
      ul.appendChild(li2);
      ul.appendChild(li3);
    }
    ul.appendChild(document.createElement('hr'));
  });
}
