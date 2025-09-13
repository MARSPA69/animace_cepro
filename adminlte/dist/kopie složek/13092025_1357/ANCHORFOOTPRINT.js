;(function(){
  // ANCHORFOOTPRINT.js – vykreslí footprinty a mesh body na mapu

  const FOOTPRINTS = window.meshFixedGpsAnchFootprint || [];
  const fixedMesh   = window.meshFixedGpsAnchFootprint || [];
  const meshMarkers = [];

  let _map = null;
  let _drawn = false;

  /**
   * Initialize footprint and mesh rendering on the given Leaflet map.
   * @param {L.Map} mapInstance - A valid Leaflet Map instance.
   */
  function init(mapInstance) {
    if (!_map) {
      if (!mapInstance || typeof mapInstance.addLayer !== 'function') {
        console.error('ANCHORFOOTPRINT.init: expected a Leaflet Map on first call, got:', mapInstance);
        return;
      }
      _map = mapInstance;
    }
    if (_drawn) return;
    _drawn = true;

    // Draw mesh markers
  fixedMesh.forEach(pt => {
    const m = L.circleMarker([pt.lat, pt.lon], {
      radius: 3,
      color: '#28a745',
      fillColor: '#28a745',
      fillOpacity: 0.6
    });
    m.data = pt;          // {lat, lon, Footprints, Segment}
    meshMarkers.push(m);
   });
   window.meshMeshMarkers = meshMarkers;
  }

  // Stubs for additional API methods
  function showFootprints(on) {}
  function showMesh(on) {
   meshMarkers.forEach(m => {
     if (on) {
       m.addTo(_map);          // přidej na mapu
     } else {
       _map.removeLayer(m);    // odeber z mapy
     }
   });
  }
  function isRunning() { return false; }
  function startReplay(ds) {}
  function startSynthetic(cfg) {}
  function stop() {}
  function tick() { return { lat: null, lon: null, matched: false }; }

  // Expose API
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
