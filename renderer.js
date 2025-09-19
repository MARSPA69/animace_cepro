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

// --- CROSS MODE panel ---
const crossModePanel = document.createElement('div');
Object.assign(crossModePanel.style, {
  position:'absolute', top:'10px', left:'calc(100% - 680px)', width:'320px', maxHeight:'200px',
  background:'rgba(255,255,255,0.9)', border:'1px solid #007bff',
  borderRadius:'8px', padding:'12px', fontSize:'12px', zIndex:1000,
});
crossModePanel.innerHTML = `
  <div style="display:flex; justify-content:space-between;"><strong>CROSS MODE Status</strong></div>
  <div id="cross-mode-status" style="margin:8px 0; padding:8px; background:#f8f9fa; border-radius:4px;">
    <div>🚪 Normální režim</div>
  </div>
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

document.body.appendChild(infoPanel);
document.body.appendChild(crossModePanel);
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

function updateCrossModePanel() {
  const statusDiv = document.getElementById('cross-mode-status');
  if (!statusDiv) return;
  
  if (window.FUSED_GPS?.crossMode) {
    const crossMode = window.FUSED_GPS.crossMode;
    let statusHtml = "";
    
    if (crossMode.active) {
      if (crossMode.waiting) {
        statusHtml = `
          <div style="color:#ffc107; font-weight:bold">⏳ Čekání na kotvy...</div>
          <div style="font-size:11px; color:#6c757d">Crossing: ${crossMode.crossing?.name || "null"}</div>
          <div style="font-size:11px; color:#6c757d">Timeout: 07:13:35</div>
        `;
      } else if (crossMode.decision === "A") {
        statusHtml = `
          <div style="color:#28a745; font-weight:bold">✅ ANO – Segment A</div>
          <div style="font-size:11px; color:#6c757d">Přesun na segment A dokončen</div>
        `;
      } else if (crossMode.decision === "F") {
        statusHtml = `
          <div style="color:#dc3545; font-weight:bold">⚠️ Segment F (fallback)</div>
          <div style="font-size:11px; color:#6c757d">Fallback po timeout</div>
        `;
      } else {
        statusHtml = `
          <div style="color:#17a2b8; font-weight:bold">🚦 CROSS MODE aktivní</div>
          <div style="font-size:11px; color:#6c757d">Crossing: ${crossMode.crossing?.name || "null"}</div>
        `;
      }
    } else {
      statusHtml = `<div style="color:#6c757d">🚪 Normální režim</div>`;
    }
    
    statusDiv.innerHTML = statusHtml;
  } else {
    statusDiv.innerHTML = `<div style="color:#6c757d">🚪 Normální režim</div>`;
  }
}

// --- Univerzální datový manager ---
class UniversalDataManager {
  constructor() {
    this.dataSources = {
      gnss: null,           // RENDERER1-10 data
      offline: null,        // BASIC_TABLE data
      fused: null          // Výsledek FUSED_GPS zpracování
    };
    
    this.animationMode = 'single'; // 'single', 'both', 'comparison'
    this.currentData = [];
    this.gnssData = [];
    this.offlineData = [];
  }
  
  // Detekce typu datového zdroje
  detectDataSource(data) {
    if (Array.isArray(data)) {
      const firstItem = data[0];
      
      // GNSS data - mají přímo lat/lng
      if (firstItem && typeof firstItem.lat === 'number' && typeof firstItem.lng === 'number') {
        return 'gnss';
      }
      
      // BASIC_TABLE data - mají TIME, SPEED, ANCHOR1-6
      if (firstItem && firstItem.TIME && typeof firstItem.SPEED === 'number') {
        return 'offline';
      }
      
      // FUSED_GPS data - mají crossMode, raw_ids, atd.
      if (firstItem && (firstItem.crossMode || firstItem.raw_ids)) {
        return 'fused';
      }
    }
    
    return 'unknown';
  }
  
  // Nastavení datového zdroje podle typu
  setDataSource(data, sourceType = null) {
    const detectedType = sourceType || this.detectDataSource(data);
    
    switch (detectedType) {
      case 'gnss':
        this.dataSources.gnss = data;
        this.gnssData = this.normalizeGnssData(data);
        break;
        
      case 'offline':
        this.dataSources.offline = data;
        // Offline data se zpracují přes FUSED_GPS
        this.processOfflineData(data);
        break;
        
      case 'fused':
        this.dataSources.fused = data;
        this.offlineData = this.normalizeFusedData(data);
        break;
        
      default:
        console.warn('❌ [DATA-MANAGER] Neznámý typ dat:', detectedType);
    }
    
    this.updateCurrentData();
  }
  
  // Normalizace GNSS dat (RENDERER1-10)
  normalizeGnssData(gnssData) {
    return gnssData.map(item => ({
      point: turf.point([item.lng, item.lat]),
      time: new Date(item.timestamp),
      lat: item.lat,
      lng: item.lng,
      source: 'gnss',
      raw_ids: [],
      crossMode: { active: false },
      matched_ids: []
    }));
  }
  
  // Normalizace FUSED_GPS dat
  normalizeFusedData(fusedData) {
    return fusedData.map(item => ({
      point: turf.point([item.lng, item.lat]),
      time: this.parseTimeString(item.timeStr),
      lat: item.lat,
      lng: item.lng,
      source: 'offline',
      raw_ids: item.raw_ids || [],
      crossMode: item.crossMode || { active: false },
      matched_ids: item.matched_ids || [],
      speed_mps: item.speed_mps || 0,
      dist_to_m: item.dist_to_m || null,
      mesh_id: item.mesh_id || null
    }));
  }
  
  // Bezpečná konverze HH:MM:SS na Date
  parseTimeString(timeStr) {
    if (!timeStr) return new Date();
    
    // Pokud je to už Date objekt
    if (timeStr instanceof Date) return timeStr;
    
    // Pokud je to ISO string
    if (timeStr.includes('T') || timeStr.includes('-')) {
      return new Date(timeStr);
    }
    
    // Pokud je to HH:MM:SS
    if (timeStr.match(/^\d{1,2}:\d{2}:\d{2}$/)) {
      const [hours, minutes, seconds] = timeStr.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes, seconds, 0);
      return date;
    }
    
    // Fallback
    return new Date(timeStr);
  }
  
  // Zpracování OFFLINE dat přes FUSED_GPS
  processOfflineData(offlineData) {
    console.log('🔄 [DATA-MANAGER] Zpracovávám OFFLINE data přes FUSED_GPS...');
    
    // Nastavit BASIC_TABLE pro FUSED_GPS
    window.BASIC_TABLE_04062025 = offlineData;
    
    // Spustit FUSED_GPS zpracování
    if (window.FUSED_GPS && window.FUSED_GPS.runOfflineGNSS) {
      window.FUSED_GPS.runOfflineGNSS();
    } else {
      console.error('❌ [DATA-MANAGER] FUSED_GPS není dostupný');
    }
  }
  
  // Aktualizace aktuálních dat podle režimu
  updateCurrentData() {
    switch (this.animationMode) {
      case 'single':
        // Použít aktivní zdroj
        if (this.dataSources.fused) {
          this.currentData = this.offlineData;
        } else if (this.dataSources.gnss) {
          this.currentData = this.gnssData;
        }
        break;
        
      case 'both':
        // Kombinace obou zdrojů
        this.currentData = this.mergeDataSources();
        break;
        
      case 'comparison':
        // Porovnávací režim - střídání mezi zdroji
        this.currentData = this.createComparisonData();
        break;
    }
    
    console.log(`📊 [DATA-MANAGER] Aktuální data: ${this.currentData.length} záznamů (${this.animationMode})`);
  }
  
  // Sloučení datových zdrojů pro režim "Obě"
  mergeDataSources() {
    const merged = [];
    const gnssData = this.gnssData || [];
    const offlineData = this.offlineData || [];
    
    // Najít časové překryvy a sloučit
    for (const gnssItem of gnssData) {
      const offlineItem = this.findClosestByTime(gnssItem.time, offlineData);
      
      merged.push({
        ...gnssItem,
        offline: offlineItem,
        hasOffline: !!offlineItem,
        hasGnss: true
      });
    }
    
    // Přidat offline data bez GNSS protějšku
    for (const offlineItem of offlineData) {
      const hasGnss = merged.some(item => 
        Math.abs(item.time.getTime() - offlineItem.time.getTime()) < 1000
      );
      
      if (!hasGnss) {
        merged.push({
          ...offlineItem,
          gnss: null,
          hasOffline: true,
          hasGnss: false
        });
      }
    }
    
    // Seřadit podle času
    return merged.sort((a, b) => a.time.getTime() - b.time.getTime());
  }
  
  // Vytvoření porovnávacích dat
  createComparisonData() {
    const comparison = [];
    const gnssData = this.gnssData || [];
    const offlineData = this.offlineData || [];
    
    // Střídavě přidávat GNSS a OFFLINE data
    const maxLength = Math.max(gnssData.length, offlineData.length);
    
    for (let i = 0; i < maxLength; i++) {
      if (i < gnssData.length) {
        comparison.push({
          ...gnssData[i],
          comparisonType: 'gnss'
        });
      }
      
      if (i < offlineData.length) {
        comparison.push({
          ...offlineData[i],
          comparisonType: 'offline'
        });
      }
    }
    
    return comparison;
  }
  
  // Najít nejbližší záznam podle času
  findClosestByTime(targetTime, dataArray, tolerance = 5000) { // Zvýšeno na 5s pro GNSS vs OFFLINE
    let closest = null;
    let minDiff = Infinity;
    
    for (const item of dataArray) {
      const diff = Math.abs(targetTime.getTime() - item.time.getTime());
      if (diff < tolerance && diff < minDiff) {
        minDiff = diff;
        closest = item;
      }
    }
    
    return closest;
  }
  
  // Nastavení režimu animace
  setAnimationMode(mode) {
    this.animationMode = mode;
    this.updateCurrentData();
    console.log(`🎬 [DATA-MANAGER] Režim animace nastaven na: ${mode}`);
  }
  
  // Získání aktuálních dat
  getCurrentData() {
    return this.currentData;
  }
  
  // Získání informací o zdrojích
  getDataSourceInfo() {
    return {
      gnss: {
        available: !!this.dataSources.gnss,
        count: this.gnssData.length
      },
      offline: {
        available: !!this.dataSources.offline,
        count: this.offlineData.length
      },
      fused: {
        available: !!this.dataSources.fused,
        count: this.offlineData.length
      },
      current: {
        mode: this.animationMode,
        count: this.currentData.length
      }
    };
  }
}

// Globální instance
window.universalDataManager = new UniversalDataManager();

// --- Animace podle RENDERERDATA1.js ---
let data = [];
let dataManager = window.universalDataManager;

// Hook pro FUSED_GPS data
window.applyFusedGpsDataset = function(fusedData) {
  console.log("✅ [RENDERER] Přijat fused dataset:", fusedData.length, "záznamů");
  dataManager.setDataSource(fusedData, 'fused');
  data = dataManager.getCurrentData();
  idx = 0; // reset indexu
};

// Hook pro GNSS data
window.applyGnssDataset = function(gnssData) {
  console.log("✅ [RENDERER] Přijat GNSS dataset:", gnssData.length, "záznamů");
  dataManager.setDataSource(gnssData, 'gnss');
  data = dataManager.getCurrentData();
  idx = 0; // reset indexu
};

// Event listener pro FUSED_GPS_READY (fallback)
window.addEventListener('FUSED_GPS_READY', (event) => {
  const fusedData = event.detail.fused;
  const mode = event.detail.mode || 'single';
  console.log("✅ [RENDERER] Přijat FUSED_GPS_READY event:", fusedData.length, "záznamů, mode:", mode);
  dataManager.setDataSource(fusedData, 'fused');
  data = dataManager.getCurrentData();
  idx = 0; // reset indexu
});

// Fallback pro RENDERERDATA1
try {
  if (typeof RENDERERDATA1 !== 'undefined' && Array.isArray(RENDERERDATA1)) {
    dataManager.setDataSource(RENDERERDATA1, 'gnss');
    data = dataManager.getCurrentData();
    console.log("✅ Načteno datových bodů:", data.length);
    console.log("🔹 První bod:", data[0]);
  } else {
    console.warn("⚠️ RENDERERDATA1 není dostupný, čekám na data...");
  }
} catch (err) {
  console.error("❌ CHYBA při načítání dat:", err.message);
}



let idx = 0;
document.addEventListener('DOMContentLoaded', () => {
  // Aktualizovat data z dataManageru
  data = dataManager.getCurrentData();
  console.log('Počet datových bodů:', data.length);
  if (data.length > 0) console.log('První bod:', data[0]);
  let lastPan = 0;
  timer = setInterval(() => {
  if (playbackSpeed === 0) return;

  // Aktualizovat data z dataManageru před každým cyklem
  data = dataManager.getCurrentData();

  for (let i = 0; i < Math.abs(playbackSpeed); i++) {
    idx += playbackSpeed > 0 ? 1 : -1;
    if (idx < 0) idx = 0;
    if (idx >= data.length) {
      idx = data.length - 1;
      playbackSpeed = 0;
      return;
    }

    
const rec = data[idx];
const prev = data[idx - 1];
let speedKmh = 0;
let motionType = "neurčeno";

if (prev) {
  const dist = turf.distance(turf.point([prev.lng, prev.lat]), rec.point, { units: 'kilometers' }); // km
  const dt = (rec.time - prev.time) / 1000; // s
  if (dt > 0) {
    const mps = dist * 1000 / dt;  // m/s
    speedKmh = mps * 3.6; // km/h
    if (mps < 0.1) motionType = "stání";
    else if (speedKmh < 1.0) motionType = "pomalá chůze";
    else if (speedKmh >= 2 && speedKmh <= 5) motionType = "rychlá chůze";
    else if (speedKmh > 5 && speedKmh <= 8) motionType = "běh";
    else if (speedKmh > 8) motionType = "sprint";
    else motionType = "chůze";
  }
}

    const inGreen = (
  turf.booleanPointInPolygon(rec.point, smallPoly) ||
  turf.booleanPointInPolygon(rec.point, segA_poly) ||
  turf.booleanPointInPolygon(rec.point, segB_poly) ||
  turf.booleanPointInPolygon(rec.point, segB_mez_poly) ||
  turf.booleanPointInPolygon(rec.point, segC_poly)
);
    const inRed = turf.booleanPointInPolygon(rec.point, bigPoly) && !inGreen;
    const dist = getDistToSmallPoly(rec.point).toFixed(1);

    marker.setLatLng([rec.lat, rec.lng]);
    if (Date.now() - lastPan > 1000) {
      map.panTo([rec.lat, rec.lng], { animate: true, duration: 0.5 });
      lastPan = Date.now();
    }

    // CROSS MODE status pro popup
    let crossModeStatus = "";
    if (window.FUSED_GPS?.crossMode) {
      const crossMode = window.FUSED_GPS.crossMode;
      if (crossMode.active) {
        if (crossMode.waiting) {
          crossModeStatus = "<br><b style='color:#ffc107'>⏳ CROSS MODE: Čekání na kotvy...</b>";
        } else if (crossMode.decision === "A") {
          crossModeStatus = "<br><b style='color:#28a745'>✅ CROSS MODE: Segment A</b>";
        } else if (crossMode.decision === "F") {
          crossModeStatus = "<br><b style='color:#dc3545'>⚠️ CROSS MODE: Segment F (fallback)</b>";
        } else {
          crossModeStatus = "<br><b style='color:#17a2b8'>🚦 CROSS MODE: Aktivní</b>";
        }
      }
    }

    // Získat informace o datovém zdroji
    const dataSourceInfo = dataManager.getDataSourceInfo();
    const sourceInfo = rec.source ? ` (${rec.source})` : '';
    
    marker.setPopupContent(`
      <div style="font-size:12px; min-width:220px">
        <b style="color:${inRed ? '#dc3545' : inGreen ? '#28a745' : '#6c757d'}">
          ${inRed ? 'INCIDENT v zakázané zóně' : inGreen ? 'V povolené zóně' : 'Mezi zónami'}
        </b><hr style="margin:5px 0">
        <b>Čas:</b> ${rec.time.toLocaleTimeString()}${sourceInfo}<br>
        <b>Souřadnice:</b> ${rec.lat.toFixed(6)}, ${rec.lng.toFixed(6)}<br>
        <b>ID:</b> ${SUBJECT_ID}<br>
        <b>Typ pohybu:</b> ${motionType}<br>
        <b>Vzdál. k zóně:</b> ${dist} m<br>
        <b>RAW IDs:</b> [${rec.raw_ids && rec.raw_ids.length > 0 ? rec.raw_ids.join(", ") : "none"}]<br>
        <b>Matched IDs:</b> [${rec.matched_ids && rec.matched_ids.length > 0 ? rec.matched_ids.join(", ") : "none"}]<br>
        <b>Režim:</b> ${dataSourceInfo.current.mode} (${dataSourceInfo.current.count} záznamů)${crossModeStatus}
      </div>
    `).openPopup();

    // Aktualizuj CROSS MODE panel
    updateCrossModePanel();

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
});



// --- Drag and drop pro info panel (incident log)
(function(){
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
