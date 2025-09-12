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

// Centers for bounce targets
const greenCenter = turf.centerOfMass(smallPoly).geometry.coordinates; // [lng, lat]
const redCenter   = turf.centerOfMass(bigPoly).geometry.coordinates;   // [lng, lat]

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

// Initialize map - Leaflet uses [lat, lng]
const map = L.map('map').setView([greenCenter[1], greenCenter[0]], 17);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { // ZMĚNA: https místo http
  maxZoom: 19, 
  attribution: '&copy; OSM contributors'
}).addTo(map);
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
let currentCoords = [...greenCenter]; // [lng, lat]
const marker = L.circleMarker([greenCenter[1], greenCenter[0]], { 
  radius: 6,
  color: 'black',
  fillColor: '#ff0000',
  fillOpacity: 1
}).addTo(map);

// Calculate initial distance - OPRAVA: správný formát pro Turf.js
const initialPoint = turf.point(greenCenter);
const boundaryGreen = turf.polygonToLineString(smallPoly);
const initialDist = turf.distance(initialPoint, boundaryGreen, { units: 'meters' }).toFixed(2);

const now = new Date();
const initialPopup = `<div style="font-size:12px; min-width:200px;">
  <b><span style="color:green">Pohyb v povolené zóně</span></b><br>
  Čas: ${now.toLocaleTimeString()}<br>
  Pozice: ${greenCenter[1].toFixed(6)}, ${greenCenter[0].toFixed(6)}<br>
  ID: ${SUBJECT_ID}<br>
  Pohyb: ${categories[1].name} (${categories[1].speed.toFixed(2)} m/s)<br>
  Vzdálenost k zóně: ${initialDist} m
</div>`;
marker.bindPopup(initialPopup, { autoClose: false, closeOnClick: false }).openPopup();

// Animation state
let elapsed = 0;
let segmentTime = Math.floor(Math.random() * 6) + 10; // 10-15s
let motion = categories[1]; // pomalá chůze
let currentDirection = Math.random() * 2 * Math.PI; // random direction in radians

// Haversine function to calculate new position
function movePoint(lon, lat, distance, direction) {
  const R = 6371000; // Earth's radius in meters
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  
  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(distance / R) + 
    Math.cos(latRad) * Math.sin(distance / R) * Math.cos(direction)
  );
  
  const newLonRad = lonRad + Math.atan2(
    Math.sin(direction) * Math.sin(distance / R) * Math.cos(latRad),
    Math.cos(distance / R) - Math.sin(latRad) * Math.sin(newLatRad)
  );
  
  return [
    newLonRad * 180 / Math.PI,
    newLatRad * 180 / Math.PI
  ];
}

const timer = setInterval(() => {
  if (elapsed >= TOTAL_DURATION) {
    clearInterval(timer);
    marker.setPopupContent("Animation completed!");
    return;
  }

  // Change direction and motion after segment time
  if (segmentTime <= 0) {
    segmentTime = Math.floor(Math.random() * 6) + 10; // 10-15s
    currentDirection = Math.random() * 2 * Math.PI; // new random direction
    
    // Choose motion based on current zone
    const currentPoint = turf.point(currentCoords);
    const inGreen = turf.booleanPointInPolygon(currentPoint, smallPoly);
    const inRed = turf.booleanPointInPolygon(currentPoint, bigPoly) && !inGreen;
    
    if (inGreen) {
      // In green zone: slow or fast walk
      motion = Math.random() > 0.5 ? categories[1] : categories[2];
    } else if (inRed) {
      // In red zone: run
      motion = categories[3];
    } else {
      // Outside zones: fast walk
      motion = categories[2];
    }
  }

  // Calculate new position using haversine formula
  const distanceToMove = motion.speed; // meters per second
  const [newLng, newLat] = movePoint(
    currentCoords[0], 
    currentCoords[1], 
    distanceToMove, 
    currentDirection
  );
  
  currentCoords = [newLng, newLat];
  
  // Update marker position
  marker.setLatLng([newLat, newLng]);

  // Check zones - OPRAVA: vytvořit nový bod pro kontrolu
  const currentPoint = turf.point(currentCoords);
  const boundaryGreen = turf.polygonToLineString(smallPoly); // Předefinovat
  const inGreen = turf.booleanPointInPolygon(currentPoint, smallPoly);
  const inRed = turf.booleanPointInPolygon(currentPoint, bigPoly) && !inGreen;
  const distToGreen = turf.distance(currentPoint, boundaryGreen, { units: 'meters' }).toFixed(2);

  // Incident detection
  const now = new Date();
  if (inRed) {
    if (!inIncident) {
      // Start new incident
      inIncident = true;
      incidents.push({
        inDate: now,
        inCoords: `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`,
        inMotion: motion.name,
        inDist: distToGreen,
        outDate: null,
        outCoords: null,
        outMotion: null,
        outDist: null,
        duration: null
      });
      if (incidents.length > MAX_LOGS) incidents.shift();
      updateLogPanel();
    }
  } else if (inIncident) {
    // End incident
    inIncident = false;
    const lastIncident = incidents[incidents.length - 1];
    lastIncident.outDate = now;
    lastIncident.outCoords = `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`;
    lastIncident.outMotion = motion.name;
    lastIncident.outDist = distToGreen;
    lastIncident.duration = Math.floor((lastIncident.outDate - lastIncident.inDate) / 1000);
    updateLogPanel();
  }

  // Update popup
  const status = inGreen
    ? '<span style="color:green">Pohyb v povolené zóně</span>'
    : inRed
      ? '<span style="color:red">INCIDENT - pohyb v zakázané zóně</span>'
      : '<span style="color:orange">Pohyb mimo zóny</span>';

  const popupContent = `<div style="font-size:12px; min-width:200px;">
    <b>${status}</b><br>
    Čas: ${now.toLocaleTimeString()}<br>
    Pozice: ${newLat.toFixed(6)}, ${newLng.toFixed(6)}<br>
    ID: ${SUBJECT_ID}<br>
    Pohyb: ${motion.name} (${motion.speed.toFixed(2)} m/s)<br>
    Vzdálenost k zóně: ${distToGreen} m
  </div>`;
  
  marker.setPopupContent(popupContent);

  segmentTime--;
  elapsed++;
}, 1000);

// Update incident panel
function updateLogPanel() {
  const ul = document.getElementById('log-list');
  if (!ul) return;
  
  ul.innerHTML = '';
  
  incidents.forEach(incident => {
    const inItem = document.createElement('li');
    inItem.textContent = `IN: ${incident.inDate.toLocaleTimeString()} - ${incident.inCoords} (${incident.inMotion})`;
    ul.appendChild(inItem);
    
    if (incident.outDate) {
      const outItem = document.createElement('li');
      outItem.textContent = `OUT: ${incident.outDate.toLocaleTimeString()} - ${incident.outCoords} (${incident.outMotion})`;
      ul.appendChild(outItem);
      
      const durationItem = document.createElement('li');
      durationItem.textContent = `DURATION: ${incident.duration} sekund`;
      durationItem.style.fontWeight = 'bold';
      ul.appendChild(durationItem);
    } else {
      const ongoing = document.createElement('li');
      ongoing.textContent = "PRŮBĚŽNÝ INCIDENT...";
      ongoing.style.color = 'red';
      ul.appendChild(ongoing);
    }
    
    ul.appendChild(document.createElement('hr'));
  });
}