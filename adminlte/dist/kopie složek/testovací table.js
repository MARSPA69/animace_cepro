function checkIncidents(point) {
  // Zjistíme, jestli je v zelené zóně
  const inGreen = (
    turf.booleanPointInPolygon(point, smallPoly) ||
    turf.booleanPointInPolygon(point, segA_poly) ||
    turf.booleanPointInPolygon(point, segB_poly) ||
    turf.booleanPointInPolygon(point, segB_mez_poly) ||
    turf.booleanPointInPolygon(point, segC_poly) ||
    turf.booleanPointInPolygon(point, segD_poly) ||
    turf.booleanPointInPolygon(point, segE_poly) ||
    turf.booleanPointInPolygon(point, segF_poly) ||
    turf.booleanPointInPolygon(point, segG_poly)
  );
  // Zjistíme, jestli je v červené zóně mimo zelenou
  const inRed = turf.booleanPointInPolygon(point, bigPoly) && !inGreen;

  // �� DEBUG: Kontrola časových proměnných
  console.log("🔍 [INCIDENT-DEBUG] point:", point?.geometry?.coordinates, "inGreen:", inGreen, "inRed:", inRed, "prevInRed:", prevInRed);
  console.log("🔍 [INCIDENT-DEBUG] _lastRecMs:", window._lastRecMs, "isFinite:", Number.isFinite(window._lastRecMs), "_lastRecStr:", window._lastRecStr);

  // Vstoupili jsme do červené zóny
  if (inRed && !prevInRed) {
    prevInRed = true;
    console.log("🚨 [INCIDENT-IN] Vstup do červené zóny - inMs:", window._lastRecMs, "inStr:", window._lastRecStr);
    incidentLog.push({ inMs: window._lastRecMs, inStr: window._lastRecStr, outMs: null, outStr: null, duration: null });
    updateIncidentBoxes();
  }
  // Opustili jsme červenou zónu
  if (!inRed && prevInRed) {
    prevInRed = false;
    const last = incidentLog[incidentLog.length - 1];
    last.outMs    = window._lastRecMs;
    last.outStr   = window._lastRecStr;
    last.duration = Math.round((last.outMs - last.inMs) / 1000);
    console.log("✅ [INCIDENT-OUT] Výstup z červené zóny - outMs:", window._lastRecMs, "outStr:", window._lastRecStr, "duration:", last.duration, "calc:", `(${last.outMs} - ${last.inMs}) / 1000 = ${last.duration}`);
    updateIncidentBoxes();
  }
}


//  Definice checkIncidents 
/**
 * Kontroluje vstup/výstup z červené zóny a aktualizuje incidentLog.
 * @param {Object} point GeoJSON point ({ type: 'Feature', geometry: { type:'Point', coordinates:[lng,lat] } })
 */
function checkIncidents(point) {
  // Zjistíme, jestli je v zelené zóně
  const inGreen = (
    turf.booleanPointInPolygon(point, smallPoly) ||
    turf.booleanPointInPolygon(point, segA_poly) ||
    turf.booleanPointInPolygon(point, segB_poly) ||
    turf.booleanPointInPolygon(point, segB_mez_poly) ||
    turf.booleanPointInPolygon(point, segC_poly) ||
    turf.booleanPointInPolygon(point, segD_poly) ||
    turf.booleanPointInPolygon(point, segE_poly) ||
    turf.booleanPointInPolygon(point, segF_poly) ||
    turf.booleanPointInPolygon(point, segG_poly)
  );
  // Zjistíme, jestli je v červené zóně mimo zelenou
  const inRed = turf.booleanPointInPolygon(point, bigPoly) && !inGreen;

  // Vstoupili jsme do červené zóny
  if (inRed && !prevInRed) {
    prevInRed = true;
    incidentLog.push({ inMs: window._lastRecMs, inStr: window._lastRecStr, outMs: null, outStr: null, duration: null });
    updateIncidentBoxes();
  }
  // Opustili jsme červenou zónu
  if (!inRed && prevInRed) {
    prevInRed = false;
    const last = incidentLog[incidentLog.length - 1];
    last.outMs    = window._lastRecMs;
    last.outStr   = window._lastRecStr;
    last.duration = Math.round((last.outMs - last.inMs) / 1000);
    updateIncidentBoxes();
  }
}

// Incident panel 
const infoPanel = document.createElement('div');
infoPanel.id = "infoPanel";
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
