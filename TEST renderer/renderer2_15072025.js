
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
const boundaryGreen = turf.polygonToLineString(smallPoly);
const boundaryRed   = turf.polygonToLineString(bigPoly);
const greenCenter   = turf.centerOfMass(smallPoly).geometry.coordinates;
const redCenter     = turf.centerOfMass(bigPoly).geometry.coordinates;

// --- 1) Ovládací panel ---
let playbackSpeed = 1;
const ctrlPanel = document.createElement('div');
Object.assign(ctrlPanel.style,{
  position:'absolute', top:'10px', left:'10px', zIndex:1001,
  background:'rgba(255,255,255,0.8)', padding:'4px', borderRadius:'4px'
});
ctrlPanel.innerHTML=`
  <button id="btn-play">▶️</button>
  <button id="btn-pause">⏸️</button>
  <button id="btn-stop">⏹️</button>
  <button id="btn-ff">⏩</button>
  <button id="btn-rw">⏪</button>
`;
document.body.appendChild(ctrlPanel);
document.getElementById('btn-play').onclick=() => playbackSpeed=1;
document.getElementById('btn-pause').onclick=() => playbackSpeed=0;
document.getElementById('btn-ff').onclick=() => playbackSpeed=2;
document.getElementById('btn-rw').onclick=() => playbackSpeed=-2;
document.getElementById('btn-stop').onclick=()=>{
  clearInterval(timer);
  playbackSpeed=0; elapsed=0;
  currentPt=turf.point(greenCenter);
  marker.setLatLng([greenCenter[1],greenCenter[0]]);
  incidents=[]; updateLogPanel();
};

// --- 2) Panel incidentů ---
let incidents = [], inIncident=false, prevInRed=false;
const infoPanel = document.createElement('div');
Object.assign(infoPanel.style,{
  position:'absolute', top:'10px', right:'10px',
  width:'320px', maxHeight:'260px', overflowY:'auto',
  background:'rgba(255,255,255,0.9)',border:'1px solid #ccc',
  borderRadius:'4px',padding:'8px',fontSize:'12px',zIndex:1000
});
infoPanel.innerHTML=`<strong>Incident Log</strong>
  <ul id="log-list" style="margin:4px;padding-left:16px;"></ul>`;
document.body.appendChild(infoPanel);
(function(){
  let dx,dy;
  infoPanel.onmousedown=e=>{
    const r=infoPanel.getBoundingClientRect();
    dx=e.clientX-r.left; dy=e.clientY-r.top;
    document.addEventListener('mousemove',move);
    document.addEventListener('mouseup',up);
  };
  function move(e){
    infoPanel.style.left=e.pageX-dx+'px';
    infoPanel.style.top=e.pageY-dy+'px';
  }
  function up(){
    document.removeEventListener('mousemove',move);
    document.removeEventListener('mouseup',up);
  }
})();

// --- 3) Inicializace mapy + marker ---
const map = L.map('map').setView([greenCenter[1],greenCenter[0]],17);
L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19, attribution:'&copy; OSM contributors'
}).addTo(map);
L.geoJSON(smallPoly,{color:'green',weight:2,fillOpacity:0.2}).addTo(map);
L.geoJSON(bigPoly,  {color:'red',  weight:2,fillOpacity:0   }).addTo(map);
const marker = L.circleMarker([greenCenter[1],greenCenter[0]],{
  radius:6,color:'black',fillOpacity:1
}).addTo(map)
  .bindPopup('',{autoClose:false,closeOnClick:false})
  .openPopup();

// --- 4) Demo časová osa (7 cyklů) ---
const demoTimeline = [];
let t = 0;
for(let cycle=0; cycle<7; cycle++){
  demoTimeline.push({start:t,end:t+5,   motion:{name:'pomalá chůze',speed:0.7}, zone:'green'});
  demoTimeline.push({start:t+5,end:t+10, motion:{name:'rychlá chůze',speed:1.4}, zone:'green'});
  demoTimeline.push({start:t+10,end:t+15,motion:{name:'běh',speed:3.0}, zone:'green'});
  demoTimeline.push({start:t+15,end:t+20,motion:{name:'stání',speed:0}, zone:'green'});
  t+=20;
  demoTimeline.push({start:t,end:t+5,   motion:{name:'běh',speed:3.0}, zone:'crossGreen2Red'});
  demoTimeline.push({start:t+5,end:t+10, motion:{name:'pomalá chůze',speed:0.7}, zone:'red'});
  demoTimeline.push({start:t+10,end:t+15,motion:{name:'stání',speed:0}, zone:'red'});
  demoTimeline.push({start:t+15,end:t+20,motion:{name:'pomalá chůze',speed:0.7}, zone:'red'});
  demoTimeline.push({start:t+20,end:t+25,motion:{name:'rychlá chůze',speed:1.4}, zone:'red'});
  t+=25;
  demoTimeline.push({start:t,end:t+5,   motion:{name:'běh',speed:3.0}, zone:'crossRed2Green'});
  demoTimeline.push({start:t+5,end:t+10, motion:{name:'pomalá chůze',speed:0.7}, zone:'green'});
  demoTimeline.push({start:t+10,end:t+15,motion:{name:'rychlá chůze',speed:1.4}, zone:'green'});
  demoTimeline.push({start:t+15,end:t+20,motion:{name:'běh',speed:3.0}, zone:'green'});
  demoTimeline.push({start:t+20,end:t+25,motion:{name:'stání',speed:0}, zone:'green'});
  t+=25;
}

// --- 5) Smyčka animace (vylepšená pro FF/RW) ---
let currentPt = turf.point(greenCenter);
let elapsed   = 0;

const timer = setInterval(()=>{
  if(elapsed>=TOTAL_DURATION){ clearInterval(timer); return; }
  if(playbackSpeed===0) return;

  elapsed += playbackSpeed > 0 ? 1 : -1;
  elapsed = Math.max(0, Math.min(TOTAL_DURATION, elapsed));

  const phase = demoTimeline.find(d=> elapsed>=d.start && elapsed<d.end ) || demoTimeline[demoTimeline.length-1];
  const { motion, zone } = phase;
  const effSpeed = motion.speed * Math.abs(playbackSpeed);

  let bearingTarget;
  if(zone==='crossGreen2Red')      bearingTarget = redCenter;
  else if(zone==='crossRed2Green') bearingTarget = greenCenter;
  else bearingTarget = zone==='green'
    ? turf.nearestPointOnLine(boundaryGreen, currentPt).geometry.coordinates
    : turf.nearestPointOnLine(boundaryRed,   currentPt).geometry.coordinates;

  const bear = turf.bearing(currentPt, turf.point(bearingTarget));
  currentPt = turf.destination(currentPt, effSpeed/1000, bear, { units:'kilometers' });
  const [lng, lat] = currentPt.geometry.coordinates;
  marker.setLatLng([lat, lng]);

  const inGreen = turf.booleanPointInPolygon(currentPt, smallPoly);
  const inRed   = turf.booleanPointInPolygon(currentPt, bigPoly) && !inGreen;
  if(inRed && !prevInRed){
    incidents.push({
      inDate:   new Date(),
      inCoords: `${lat.toFixed(6)},${lng.toFixed(6)}`,
      inMotion: motion.name,
      inDist:   turf.pointToLineDistance(currentPt, turf.polygonToLineString(smallPoly), {units:'meters'}).toFixed(1),
      id: SUBJECT_ID
    });
    if(incidents.length>MAX_LOGS) incidents.shift();
    updateLogPanel();
  }
  if(!inRed && prevInRed){
    const inc = incidents[incidents.length-1];
    inc.outDate   = new Date();
    inc.outCoords = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    inc.outMotion = motion.name;
    inc.outDist   = turf.pointToLineDistance(currentPt, turf.polygonToLineString(bigPoly), {units:'meters'}).toFixed(1);
    inc.duration  = Math.round((inc.outDate-inc.inDate)/1000);
    updateLogPanel();
  }
  prevInRed = inRed;

  const status = inGreen
    ? '<span style="color:green">Pohyb v povolené zóně</span>'
    : '<span style="color:red">INCIDENT v zakázané zóně</span>';
  marker.setPopupContent(`
    <div style="font-size:12px;">
      <b>${status}</b><br/>
      ${new Date().toLocaleTimeString()}<br/>
      ${lat.toFixed(6)}, ${lng.toFixed(6)}<br/>
      ID: ${SUBJECT_ID}<br/>
      Pohyb: ${motion.name}<br/>
      Vzdálenost: ${incidents.length?incidents[incidents.length-1].inDist:'0'} m
    </div>
  `).openPopup();
}, 1000);

// --- 6) Update panelu ---
function updateLogPanel(){
  const ul=document.getElementById('log-list');
  ul.innerHTML='';
  incidents.forEach(inc=>{
    const li1=document.createElement('li');
    li1.textContent = `IN:  ${inc.inDate.toISOString().slice(0,10)} ${inc.inDate.toTimeString().slice(0,8)}; ${inc.inCoords}; ${inc.inMotion}; ${inc.inDist}m`;
    ul.appendChild(li1);
    if(inc.outDate){
      const li2=document.createElement('li');
      li2.textContent = `OUT: ${inc.outDate.toISOString().slice(0,10)} ${inc.outDate.toTimeString().slice(0,8)}; ${inc.outCoords}; ${inc.outMotion}; ${inc.outDist}m`;
      ul.appendChild(li2);
      const li3=document.createElement('li');
      li3.textContent = `DURATION: ${inc.duration} sekund`;
      ul.appendChild(li3);
    }
    ul.appendChild(document.createElement('hr'));
  });
}

