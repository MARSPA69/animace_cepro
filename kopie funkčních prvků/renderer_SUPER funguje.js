// renderer.js

const DEVICE          = 'GH5200';
const SUBJECT_ID      = 'CEPRO0516';
const MAX_LOGS        = 5;
const TOTAL_DURATION  = 150; // seconds

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

// Boundaries for distance
const boundaryGreen = turf.polygonToLineString(smallPoly);
const boundaryRed   = turf.polygonToLineString(bigPoly);

// Centers for bounce targets
const greenCenter = turf.centerOfMass(smallPoly).geometry.coordinates;
const redCenter   = turf.centerOfMass(bigPoly).geometry.coordinates;

// --- Playback control state ---
let playbackSpeed = 1; // 0 = pause, 1 = normal, 2 = 2× forward, -2 = 2× rewind

// --- Incident storage ---
let incidents   = [];
let inIncident  = false;

// --- 1) Vytvoření ovládacího panelu ---
const ctrlPanel = document.createElement('div');
Object.assign(ctrlPanel.style, {
  position: 'absolute',
  top: '10px',
  left: '10px',
  zIndex: 1001,
  background: 'rgba(255,255,255,0.8)',
  padding: '4px',
  borderRadius: '4px'
});
ctrlPanel.innerHTML = `
  <button id="btn-play">▶️</button>
  <button id="btn-pause">⏸️</button>
  <button id="btn-stop">⏹️</button>
  <button id="btn-ff">⏩</button>
  <button id="btn-rw">⏪</button>
`;
document.body.appendChild(ctrlPanel);
document.getElementById('btn-play').addEventListener('click', () => playbackSpeed = 1);
document.getElementById('btn-pause').addEventListener('click', () => playbackSpeed = 0);
document.getElementById('btn-ff').addEventListener('click', () => playbackSpeed = 2);
document.getElementById('btn-rw').addEventListener('click', () => playbackSpeed = -2);
document.getElementById('btn-stop').addEventListener('click', () => {
  clearInterval(timer);
  playbackSpeed = 0;
  elapsed = 0;
  currentPt = turf.point(greenCenter);
  marker.setLatLng([greenCenter[1], greenCenter[0]]);
  incidents = [];
  updateLogPanel();
});

// --- 2) Draggable incident panel ---
const infoPanel = document.createElement('div');
Object.assign(infoPanel.style, {
  position: 'absolute',
  top: '10px',
  right: '10px',
  width: '320px',
  maxHeight: '260px',
  overflowY: 'auto',
  background: 'rgba(255,255,255,0.9)',
  border: '1px solid #ccc',
  borderRadius: '4px',
  padding: '8px',
  fontSize: '12px',
  zIndex: 1000
});
infoPanel.innerHTML = '<strong>Incident Log</strong><ul id="log-list" style="margin:4px;padding-left:16px;"></ul>';
document.body.appendChild(infoPanel);
(function(){
  let dx, dy;
  infoPanel.onmousedown = e => {
    const r = infoPanel.getBoundingClientRect();
    dx = e.clientX - r.left;
    dy = e.clientY - r.top;
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  function move(e) {
    infoPanel.style.left = e.pageX - dx + 'px';
    infoPanel.style.top  = e.pageY - dy + 'px';
  }
  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  }
})();

// --- 3) Stav a mapové vrstvy ---
let currentPt      = turf.point(greenCenter);
let goToRed        = true;
let target         = turf.point(redCenter);
let motion         = { name:'pomalá chůze', speed:0.7 };
const TOTAL_CYCLES = 7;
const SEGMENT_COUNT   = TOTAL_CYCLES * 2;
const SEGMENT_DURATION = Math.floor(TOTAL_DURATION / SEGMENT_COUNT);
let segmentTime    = SEGMENT_DURATION;
let elapsed        = 0;

// --- 4) Inicializace mapy ---
const map = L.map('map').setView([greenCenter[1], greenCenter[0]], 17);
L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19, attribution:'&copy; OSM contributors'
}).addTo(map);
L.geoJSON(smallPoly, { color:'green', weight:2, fillOpacity:0.2 }).addTo(map);
L.geoJSON(bigPoly,   { color:'red',   weight:2, fillOpacity:0   }).addTo(map);

// --- 5) Marker setup ---
const marker = L.circleMarker([greenCenter[1], greenCenter[0]], {
  radius:6, color:'black', fillOpacity:1
})
.addTo(map)
.bindPopup('', { autoClose:false, closeOnClick:false })
.openPopup();

// --- 6) Smyčka animace s playbackSpeed ---
const timer = setInterval(() => {
  if (elapsed >= TOTAL_DURATION) {
    clearInterval(timer);
    return;
  }
  if (playbackSpeed === 0) return;

  for (let step = 0; step < Math.abs(playbackSpeed); step++) {
    // 6.1) Flip cíle pokud segmentTime vypršel
    if (segmentTime <= 0) {
      goToRed = !goToRed;
      target = turf.point(goToRed ? redCenter : greenCenter);
      segmentTime = Math.floor(Math.random() * 11) + 10;
      motion = goToRed
        ? { name:'běh', speed:3.0 }
        : { name:'rychlá chůze', speed:1.4 };
    }

    // 6.2) Pohyb ke targetu
    const bear = turf.bearing(currentPt, target);
    currentPt = turf.destination(currentPt, motion.speed/1000, bear, { units:'kilometers' });
    const [lng, lat] = currentPt.geometry.coordinates;
    marker.setLatLng([lat, lng]);

    // 6.3) Zóna & distance
    const inGreen = turf.booleanPointInPolygon(currentPt, smallPoly);
    const inRed   = turf.booleanPointInPolygon(currentPt, bigPoly) && !inGreen;
    const distTo  = turf.pointToLineDistance(
      currentPt,
      inGreen ? boundaryGreen : boundaryRed,
      { units:'meters' }
    ).toFixed(1);

    // 6.4) Incident logika (přechody)
    if (inRed && !inIncident) {
      inIncident = true;
      incidents.push({
        inDate:   new Date(),
        inCoords: `${lat.toFixed(6)},${lng.toFixed(6)}`,
        inMotion: motion.name,
        inDist:   distTo,
        id:       SUBJECT_ID
      });
      if (incidents.length > MAX_LOGS) incidents.shift();
      updateLogPanel();
    }
    if (!inRed && inIncident) {
      inIncident = false;
      const inc = incidents[incidents.length - 1];
      inc.outDate   = new Date();
      inc.outCoords = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      inc.outMotion = motion.name;
      inc.outDist   = distTo;
      inc.duration  = Math.round((inc.outDate - inc.inDate)/1000);
      updateLogPanel();
    }

    // 6.5) Popup update
    const status = inGreen
      ? '<span style="color:green">Pohyb v povolené zóně</span>'
      : '<span style="color:red">INCIDENT - pohyb v zakázané zóně</span>';
    marker.setPopupContent(`
      <div style="font-size:12px;">
        <b>${status}</b><br/>
        ${new Date().toLocaleTimeString()}<br/>
        ${lat.toFixed(6)}, ${lng.toFixed(6)}<br/>
        ID: ${SUBJECT_ID}<br/>
        Pohyb: ${motion.name} (${motion.speed.toFixed(2)} m/s)<br/>
        Vzdálenost: ${distTo} m
      </div>
    `).openPopup();

    // 6.6) Decrement counters
    segmentTime--;
    elapsed += (playbackSpeed > 0 ? 1 : -1);
  }
}, 1000);

// --- 7) Update incident panel ---
function updateLogPanel() {
  const ul = document.getElementById('log-list');
  ul.innerHTML = '';
  incidents.forEach(inc => {
    const li1 = document.createElement('li');
    li1.textContent = `IN:  ${inc.inDate.toISOString().slice(0,10)} ${inc.inDate.toTimeString().slice(0,8)}; ${inc.inCoords}; ${inc.inMotion}; ${inc.inDist}m`;
    ul.appendChild(li1);
    if (inc.outDate) {
      const li2 = document.createElement('li');
      li2.textContent = `OUT: ${inc.outDate.toISOString().slice(0,10)} ${inc.outDate.toTimeString().slice(0,8)}; ${inc.outCoords}; ${inc.outMotion}; ${inc.outDist}m`;
      ul.appendChild(li2);
      const li3 = document.createElement('li');
      li3.textContent = `DURATION: ${inc.duration} sekund`;
      ul.appendChild(li3);
    }
    ul.appendChild(document.createElement('hr'));
  });
}
