// renderer.js

const DEVICE = 'GH5200';
const SUBJECT_ID = 'CEPRO0516';
const MAX_LOGS = 5;
const TIME_STEP = 100; // 100 ms

// --- 0) Polygony a hranice ---
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
  [15.075224730800906,50.042617280800906],
  [15.07073961061566,50.04362254814566],
  [15.071383540315411,50.04527173490499],
  [15.074150934405235,50.044943464042994],
  [15.075796531691852,50.04469774951073],
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
const map = L.map('map').setView([greenCenter[1], greenCenter[0]], 17);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

L.geoJSON(smallPoly,     { color:'#28a745', weight:3, fillOpacity:0.3 }).bindPopup('Povolená zóna').addTo(map);
L.geoJSON(segA_poly,     { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_A poly').addTo(map);
L.geoJSON(segB_poly,     { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_B poly').addTo(map);
L.geoJSON(segB_mez_poly, { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_B_mez poly').addTo(map);
L.geoJSON(segC_poly,     { color:'#28a745', weight:2, fillOpacity:0.2 }).bindPopup('SEG_C poly').addTo(map);
L.geoJSON(bigPoly,       { color:'#dc3545', weight:3, dashArray:'5,10', fillOpacity:0 }).bindPopup('Zakázaná zóna').addTo(map);

const marker = L.circleMarker([greenCenter[1], greenCenter[0]], {
  radius: 8, color: '#000', weight: 1.5, fillColor: '#007bff', fillOpacity: 1
}).addTo(map).bindPopup('', {autoClose: false, closeOnClick: false}).openPopup();

// --- Ovládací panel ---
let playbackSpeed = 1;
let timer = null;
let incidents = [], prevInRed = false;

const ctrlPanel = document.createElement('div');
Object.assign(ctrlPanel.style, {
  position:'absolute', top:'10px', left:'10px', zIndex:1001,
  background:'rgba(255,255,255,0.8)', padding:'8px', borderRadius:'8px',
  display:'flex', flexWrap:'wrap', gap:'5px', maxWidth:'250px'
});
ctrlPanel.innerHTML = `
  <button id="btn-play">▶️</button>
  <button id="btn-pause">⏸️</button>
  <button id="btn-ff">⏩</button>
  <button id="btn-rw">⏪</button>
  <div style="width:100%;text-align:center">Rychlost: <span id="speed-display">1x</span></div>
`;
document.body.appendChild(ctrlPanel);

document.getElementById('btn-play').onclick  = () => { playbackSpeed = 1; updateSpeed(); };
document.getElementById('btn-pause').onclick = () => { playbackSpeed = 0; updateSpeed(); };
document.getElementById('btn-ff').onclick    = () => { playbackSpeed = 2; updateSpeed(); };
document.getElementById('btn-rw').onclick    = () => { playbackSpeed = -1; updateSpeed(); };

function updateSpeed() {
  document.getElementById('speed-display').textContent = (playbackSpeed === 0 ? 'pauza' : `${Math.abs(playbackSpeed)}x ${playbackSpeed > 0 ? '' : 'zpět'}`);
}

// --- Incident panel ---
const infoPanel = document.createElement('div');
Object.assign(infoPanel.style, {
  position:'absolute', top:'10px', right:'10px', width:'320px', maxHeight:'260px', overflowY:'auto',
  background:'rgba(255,255,255,0.9)', border:'1px solid #ccc',
  borderRadius:'8px', padding:'12px', fontSize:'12px', zIndex:1000,
});
infoPanel.innerHTML = `
  <div style="display:flex; justify-content:space-between;"><strong>Incident Log</strong>
    <button id="clear-logs" style="font-size:10px; padding:2px 5px;">Vymazat</button>
  </div>
  <ul id="log-list" style="margin:8px 0; padding-left:16px;"></ul>
`;
document.body.appendChild(infoPanel);
document.getElementById('clear-logs').onclick = () => { incidents = []; updateLogPanel(); };

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

// --- Animace podle RENDERERDATA1.js ---
const data = RENDERERDATA1
  .filter(d => typeof d.lat === 'number' && typeof d.lng === 'number')
  .map(d => ({
    point: turf.point([d.lng, d.lat]),
    time: new Date(d.timestamp),
    lat: d.lat,
    lng: d.lng
  }));


let idx = 0;
timer = setInterval(() => {
  if (playbackSpeed === 0) return;

  for (let i = 0; i < Math.abs(playbackSpeed); i++) {
    idx += playbackSpeed > 0 ? 1 : -1;
    if (idx < 0) idx = 0;
    if (idx >= data.length) {
      idx = data.length - 1;
      playbackSpeed = 0;
      return;
    }

    const rec = data[idx];
    const inGreen = turf.booleanPointInPolygon(rec.point, smallPoly);
    const inRed = turf.booleanPointInPolygon(rec.point, bigPoly) && !inGreen;
    const dist = getDistToSmallPoly(rec.point).toFixed(1);

    marker.setLatLng([rec.lat, rec.lng]);

    marker.setPopupContent(`
      <div style="font-size:12px; min-width:220px">
        <b style="color:${inRed ? '#dc3545' : inGreen ? '#28a745' : '#6c757d'}">
          ${inRed ? 'INCIDENT v zakázané zóně' : inGreen ? 'V povolené zóně' : 'Mezi zónami'}
        </b><hr style="margin:5px 0">
        <b>Čas:</b> ${rec.time.toLocaleTimeString()}<br>
        <b>Souřadnice:</b> ${rec.lat.toFixed(6)}, ${rec.lng.toFixed(6)}<br>
        <b>ID:</b> ${SUBJECT_ID}<br>
        <b>Vzdál. k zóně:</b> ${dist} m
      </div>
    `).openPopup();

    if (inRed && !prevInRed) {
      incidents.push({
        inDate: rec.time,
        inCoords: `${rec.lat.toFixed(6)},${rec.lng.toFixed(6)}`,
        inDist: dist
      });
      updateLogPanel();
    } else if (!inRed && prevInRed) {
      const inc = incidents[incidents.length - 1];
      if (inc && !inc.outDate) {
        inc.outDate = rec.time;
        inc.outCoords = `${rec.lat.toFixed(6)},${rec.lng.toFixed(6)}`;
        inc.outDist = dist;
        inc.duration = Math.round((inc.outDate - inc.inDate) / 1000);
        updateLogPanel();
      }
    }

    prevInRed = inRed;
  }
}, TIME_STEP);

