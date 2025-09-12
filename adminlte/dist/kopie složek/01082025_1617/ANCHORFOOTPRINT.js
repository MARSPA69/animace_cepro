;(function(){
  // ANCHORFOOTPRINT.js – vykreslí footprinty a mesh body na mapu

  const FOOTPRINTS = window.meshFixedGpsAnchFootprint;
  const fixedMesh   = window.fixedGpsMesh;
  let map;

  function init(m) {
    // Accept the passed-in map or fallback to global window.leafletMap
    map = (m && typeof m.addLayer === 'function') ? m : window.leafletMap;
    if (!map || typeof map.addLayer !== 'function') {
      console.error('ANCHORFOOTPRINT.init: no valid map, got:', m, window.leafletMap);
      return;
    }

    // Draw footprint points
    FOOTPRINTS.forEach(fp => {
      L.circleMarker([fp.lat, fp.lon], {
        radius: 4,
        color: '#ffc107',
        fillColor: '#ffc107',
        fillOpacity: 0.3
      }).addTo(map);
    });

    // Draw mesh points
    fixedMesh.forEach(pt => {
      L.circleMarker([pt.lat, pt.lon], {
        radius: 3,
        color: '#28a745',
        fillColor: '#28a745',
        fillOpacity: 0.6
      }).addTo(map);
    });
  }

  // Stubs for additional API methods
  function showFootprints(on) {}
  function showMesh(on) {}
  function isRunning() { return false; }
  function startReplay(ds) {}
  function startSynthetic(cfg) {}
  function stop() {}
  function tick() { return { lat: null, lon: null, matched: false }; }

  // Export API
  window.AF = {
    init,
    showFootprints,
    showMesh,
    isRunning,
    startReplay,
    startSynthetic,
    stop,
    tick
  };
})();
