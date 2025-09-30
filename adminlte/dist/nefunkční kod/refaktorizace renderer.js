// --- Funkce pro načítání datasetů ---
function loadDataset(name) {
  ensureMap();
  resetAnimationState();

  console.log(`📂 [LOAD] Dataset selected: ${name}`);

  // 1) RENDERER režim (GNSS benchmark)
  if (name.startsWith("RENDERERDATA")) {
    const oldScript = document.getElementById('dynamicDayScript');
    if (oldScript) oldScript.remove();

    const script = document.createElement('script');
    script.src = `./${name}.js`;
    script.id  = 'dynamicDayScript';

    script.onload = () => {
      console.log(`✅ ${name}.js načten`);

      if (!Array.isArray(window.realData) || !window.realData.length) {
        alert("Data nebyla správně načtena.");
        return;
      }

      gnssMaster = (window.realData || []).map(d => {
        const t = (typeof d.time === 'number')
          ? d.time
          : Date.parse(
              (typeof d.timestamp === 'string' && d.timestamp.includes('T'))
                ? d.timestamp
                : `1970-01-01T${String(d.timestamp).padStart(8,'0')}Z`
            );
        return {
          lat: +d.lat,
          lng: +d.lng,
          time: t,
          timeStr: d.timeStr || d.timestamp || "00:00:00",
          speed_mps: d.speed_mps ?? null
        };
      }).sort((a,b) => a.time - b.time);

      benchData = gnssMaster.slice();
      runSingleAnimation();   // 🔥 místo starého startAnimation()
      applyChannel();
    };

    script.onerror = () => {
      console.error(`❌ Soubor ${name}.js se nepodařilo načíst.`);
      alert(`Soubor ${name}.js se nepodařilo načíst.`);
    };

    document.body.appendChild(script);
    return;
  }

  // 2) BASIC_TABLE režim
  if (name.startsWith("BASIC_TABLE")) {
    console.log(`🚀 [OFFLINE] Spouštím FUSED_GPS s datasetem ${name}`);
    const script = document.createElement('script');
    script.src = `./${name}.js`;
    script.onload = () => {
      if (typeof runOfflineGNSS === "function") {
        runOfflineGNSS();
      } else {
        console.error("❌ runOfflineGNSS není dostupný!");
      }
    };
    document.body.appendChild(script);
    return;
  }

  // 3) BOTH režim
  if (name.startsWith("BOTH")) {
    const parts = name.split("_"); // např. BOTH_04062025
    const dateId = parts[1];
    const basicFile = `BASIC_TABLE_${dateId}.js`;
    const gnssFile  = `GNSS_${dateId}.js`; // můžeš fallbacknout na RENDERERDATA1.js

    console.log(`⚡ [BOTH] Spouštím BASIC_TABLE + GNSS pro ${dateId}`);

    const gnssScript = document.createElement('script');
    gnssScript.src = `./${gnssFile}`;
    gnssScript.onload = () => {
      console.log(`✅ ${gnssFile} načten`);
      gnssMaster = (window.realData || []).map(d => ({
        lat: +d.lat,
        lng: +d.lng,
        time: Date.parse(d.timestamp || `1970-01-01T${d.timeStr}Z`),
        timeStr: d.timeStr || d.timestamp,
        speed_mps: d.speed_mps ?? null
      }));
      benchData = gnssMaster.slice();
    };

    const basicScript = document.createElement('script');
    basicScript.src = `./${basicFile}`;
    basicScript.onload = () => {
      if (typeof runOfflineGNSS === "function") {
        runOfflineGNSS();
      }
    };

    document.body.appendChild(gnssScript);
    document.body.appendChild(basicScript);
    return;
  }

  console.warn(`⚠️ Dataset ${name} nebyl rozpoznán.`);
}





// --- Start animation (rozdělené na režimy) ---
function startAnimation() {
  if (window.parallelMode) {
    runParallelAnimation();
  } else {
    runSingleAnimation();
  }
}

// --- Single mode animace ---
function runSingleAnimation() {
  console.log("▶️ [SINGLE] Spouštím animaci GNSS datasetu");

  const currentGnssDataset =
    window.currentGnssDataset || getCurrentGnssDataset();

  if (!Array.isArray(currentGnssDataset) || !currentGnssDataset.length) {
    console.error("❌ [SINGLE] Nejsou načtena data pro animaci.");
    return;
  }

  const dataset = currentGnssDataset;
  animationData = makeAnimSeries(dataset, "GNSS");

  if (!animationData.length) {
    console.error("❌ [SINGLE] makeAnimSeries vrátil prázdný dataset.");
    return;
  }

  const firstDataPoint = animationData[0];
  if (!window.marker) {
    window.marker = L.circleMarker([firstDataPoint.lat, firstDataPoint.lng], {
      radius: 7,
      color: "#000",
      fillColor: "#00bfff",
      fillOpacity: 0.9
    }).bindPopup("Načítám data...").addTo(map);
  }

  animationActive = true;
  playbackSpeed = 1;
  updateSpeedDisplay();
  idx = 0;

  if (window.animTimer) clearTimeout(window.animTimer);
  window.animTimer = setTimeout(step, 0);
}

// --- Parallel mode animace ---
function runParallelAnimation() {
  console.log("▶️ [PARALLEL] Spouštím animaci datasetů:", Object.keys(window.parallelTracks));

  if (window.animTimer) clearTimeout(window.animTimer);

  for (const [id, track] of Object.entries(window.parallelTracks)) {
    track.idx = 0;
    if (track.marker) {
      window.leafletMap.removeLayer(track.marker);
      track.marker = null;
    }
  }

  animationActive = true;
  playbackSpeed = 1;
  updateSpeedDisplay();

  window.animTimer = setTimeout(parallelStep, 0);
}



function step() {
  if (!animationActive || idx >= animationData.length - 1 || playbackSpeed <= 0) {
    if (idx >= animationData.length - 1) {
      console.log(`🏁 [SINGLE] Animace dokončena - idx=${idx}, délka=${animationData.length}`);
    }
    if (window.animTimer) {
      clearTimeout(window.animTimer);
      window.animTimer = null;
    }
    return;
  }

  const rec = animationData[idx];
  if (window.marker) {
    window.marker.setLatLng([rec.lat, rec.lng]);
    window.marker.setPopupContent(`Čas: ${rec.timeStr}`);
  }

  // aktualizace velkého info panelu
  updateBallInfoPanel(rec, rec.speed_mps, rec.inGreen, rec.inRed);

  idx++;
  window.animTimer = setTimeout(step, 1000 / playbackSpeed);
}


function parallelStep() {
  if (!animationActive || playbackSpeed <= 0) {
    if (window.animTimer) {
      clearTimeout(window.animTimer);
      window.animTimer = null;
    }
    return;
  }

  let active = false;

  for (const [id, track] of Object.entries(window.parallelTracks)) {
    if (track.idx >= track.dataset.length) continue;

    const rec = track.dataset[track.idx];

    // marker update
    if (!track.marker) {
      track.marker = L.circleMarker([rec.lat, rec.lng], {
        radius: 6,
        color: track.color,
        fillColor: track.color,
        fillOpacity: 0.9
      }).addTo(window.leafletMap);
    } else {
      track.marker.setLatLng([rec.lat, rec.lng]);
    }

    // panel update
    if (track.panel) {
      const rows = track.panel.querySelectorAll(".info-item .info-value");
      rows[0].textContent = rec.timeStr || "—";
      rows[1].textContent = `${rec.lat.toFixed(6)}, ${rec.lng.toFixed(6)}`;
      rows[2].textContent = (rec.speed_mps ? rec.speed_mps.toFixed(2) : "0") + " m/s";

      // logika zon/incidentů → stejné jako ball-info-content
      let state = "Mimo zónu";
      if (rec.inGreen) state = "V zelené zóně";
      if (rec.inRed) state = "Incident!";
      rows[3].textContent = state;
    }

    track.idx++;
    active = true;
  }

  if (!active) {
    console.log("🏁 [PARALLEL] Všechny animace dokončeny");
    if (window.animTimer) {
      clearTimeout(window.animTimer);
      window.animTimer = null;
    }
    return;
  }

  window.animTimer = setTimeout(parallelStep, 1000 / playbackSpeed);
}


