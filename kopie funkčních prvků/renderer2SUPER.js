

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

// Precompute centers
const greenCenter = turf.centerOfMass(smallPoly).geometry.coordinates;
const redCenter = turf.centerOfMass(bigPoly).geometry.coordinates;

// Precompute boundaries
const boundaryGreen = turf.polygonToLineString(smallPoly);
const boundaryRed = turf.polygonToLineString(bigPoly);

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
const map = L.map('map').setView([greenCenter[1], greenCenter[0]], 17);
L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OSM contributors' }).addTo(map);
L.geoJSON(smallPoly, { color: 'green', weight: 2, fillOpacity: 0.2 }).addTo(map);
L.geoJSON(bigPoly,   { color: 'red',   weight: 2, fillOpacity: 0   }).addTo(map);

// Build bouncing route: alternate green↔red every ~15s
const SEGMENT_TIME = 15; // seconds per segment
let route = [];
let total = 0;
let from = turf.point(greenCenter), to;
let toggle = false;
while (total < TOTAL_DURATION) {
  to = turf.point(toggle ? greenCenter : redCenter);
  // compute bearing & distance
  const bearing = turf.bearing(from, to);
  const dist = turf.distance(from, to, { units: 'kilometers' });
  const steps = SEGMENT_TIME;
  for (let i = 1; i <= steps && total < TOTAL_DURATION; i++) {
    // linear interpolation distance fraction
    const pt = turf.destination(from, dist * (i/steps), bearing, { units: 'kilometers' });
    // choose motion style
    const motion = toggle ? 'pomalá chůze' : 'rychlá chůze';
    const speed = motion === 'pomalá chůze' ? 0.5 : 1.0;
    route.push({ pt, motion, speed });
    total++;
  }
  from = turf.point(route[route.length-1].pt.geometry.coordinates);
  toggle = !toggle;
}

// Create marker
const marker = L.circleMarker([greenCenter[1], greenCenter[0]], { radius:6, color:'black', fillOpacity:1 }).addTo(map);
marker.bindPopup('', { autoClose:false, closeOnClick:false }).openPopup();

// Animate with bounce logic
let idx = 0;
let wasInGreen = true;
const timer = setInterval(() => {
  if (idx >= route.length) return clearInterval(timer);
  const { pt, motion, speed } = route[idx++];
  const [lng, lat] = pt.geometry.coordinates;
  marker.setLatLng([lat,lng]);

  const inGreen = turf.booleanPointInPolygon(pt, smallPoly);
  const inRed   = turf.booleanPointInPolygon(pt, bigPoly) && !inGreen;
  const distance = turf.pointToLineDistance(pt,
    inGreen ? boundaryGreen : boundaryRed,{units:'meters'}).toFixed(1);

  // LogIN
  if (wasInGreen && inRed && !inIncident) {
    inIncident = true;
    const curr = { inDate:new Date(), inCoords:`${lat.toFixed(6)},${lng.toFixed(6)}`, inMotion:motion, inDist:distance };
    incidents.push(curr); if (incidents.length>MAX_LOGS) incidents.shift();
    currentIncident = curr;
    console.log('>>> Incident START', curr);
    updateLogPanel();
  }
  // LogOUT
  if (!wasInGreen && inGreen && inIncident) {
    inIncident = false;
    const inc = incidents[incidents.length-1];
    inc.outDate = new Date(); inc.outCoords=`${lat.toFixed(6)},${lng.toFixed(6)}`;
    inc.outMotion = motion; inc.outDist = distance;
    inc.duration = Math.round((inc.outDate-inc.inDate)/1000); inc.id=SUBJECT_ID;
    console.log('<<< Incident END', inc);
    updateLogPanel();
  }
  wasInGreen = inGreen;

  const statusText = inGreen
    ? '<span style="color:green">Pohyb v povolené zóně</span>'
    : '<span style="color:red">INCIDENT - pohyb v zakázané zóně</span>';
  const html = `<div style="font-size:12px;"><b>${statusText}</b><br/>${new Date().toLocaleTimeString()}<br/>`+
    `${lat.toFixed(6)}, ${lng.toFixed(6)}<br/>ID: ${SUBJECT_ID}<br/>Pohyb: ${motion} (${speed.toFixed(2)} m/s)<br/>Vzdálenost: ${distance} m</div>`;
  marker.setPopupContent(html).openPopup();
},1000);

// Update incident panel
function updateLogPanel(){
  const ul = document.getElementById('log-list'); ul.innerHTML='';
  incidents.forEach(inc=>{
    const li1=document.createElement('li'); li1.textContent=
      `IN: ${inc.inDate.toISOString().split('T')[0]} ${inc.inDate.toTimeString().split(' ')[0]}; ${inc.inCoords}; ${inc.inMotion}; ${inc.inDist}m`;
    ul.appendChild(li1);
    if(inc.outDate){
      const li2=document.createElement('li'); li2.textContent=
        `OUT: ${inc.outDate.toISOString().split('T')[0]} ${inc.outDate.toTimeString().split(' ')[0]}; ${inc.outCoords}; ${inc.outMotion}; ${inc.outDist}m`;
      const li3=document.createElement('li'); li3.textContent=`DURATION: ${inc.duration} sekund`;
      ul.appendChild(li2); ul.appendChild(li3);
    }
    ul.appendChild(document.createElement('hr'));
  });
}
