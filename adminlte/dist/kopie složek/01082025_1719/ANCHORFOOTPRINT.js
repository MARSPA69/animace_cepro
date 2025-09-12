;(function(){
  const FOOTPRINTS = window.meshFixedGpsAnchFootprint || [];
  const fixedMesh   = window.fixedGpsMesh || [];
  
  let mapInstance = null;  // Uložíme referenci na mapu
  let drawn = false;       // Příznak, zda byly vrstvy již vykresleny

  function init(map) {
    // Uložíme mapu pro pozdější použití
    if (!mapInstance && map) {
      mapInstance = map;
    }

    // Pokud již byly vrstvy vykresleny nebo nemáme mapu, nic neděláme
    if (drawn || !mapInstance) {
      return;
    }

    // Vykreslíme footprinty
    FOOTPRINTS.forEach(fp => {
      L.circleMarker([fp.lat, fp.lon], {
        radius: 4,
        color: '#ffc107',
        fillColor: '#ffc107',
        fillOpacity: 0.3
      }).addTo(mapInstance);
    });

    // Vykreslíme mesh body
    fixedMesh.forEach(pt => {
      L.circleMarker([pt.lat, pt.lon], {
        radius: 3,
        color: '#28a745',
        fillColor: '#28a745',
        fillOpacity: 0.6
      }).addTo(mapInstance);
    });

    drawn = true; // Označíme, že vrstvy byly vykresleny
  }

  // Funkce pro zobrazení/skrytí mesh bodů
  function showMesh(on) {
    if (!mapInstance) return;
    
    mapInstance.eachLayer(layer => {
      if (layer.options && layer.options.fillColor === '#28a745') {
        on ? mapInstance.addLayer(layer) : mapInstance.removeLayer(layer);
      }
    });
  }

  // Zbytek API funkcí (zůstává stejný)
  function showFootprints(on) {}
  function isRunning() { return false; }
  function startReplay(ds) {}
  function startSynthetic(cfg) {}
  function stop() {}
  function tick() { return { lat:null, lon:null, matched:false }; }

  window.AF = { init, showFootprints, showMesh, isRunning, startReplay, startSynthetic, stop, tick };
})();