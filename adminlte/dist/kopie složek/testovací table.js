  // --- hlavní smyčka ---
// --- HLAVNÍ SMYČKA: sekvenční čtení řádek místo hledání podle času ---
let currentRowIndex = 0;
let baseRow = rows[0];

for (let i = 0; i < rows.length; i++) {
  const baseRow = rows[i];     // vždy vezme aktuální řádek
  const s = baseRow.sec;       // sekundový ekvivalent jen pro výpočty

  const v = speedAtSec(s);
  const stepM = v * (i === 0 ? 0 : (rows[i].sec - rows[i - 1].sec));

  if (stepM > 0) walker.step(stepM);
  const pos = walker.get();

  const near = nearestMGPS(pos.lat, pos.lng, MGPS);

  let latFinal = pos.lat;
  let lngFinal = pos.lng;
  let crossDecision = null;
  let crossDebugHtml = null;

  let hit = null;
  const a_ids = baseRow.a_ids || [];
  if (near && near.m && near.dist <= CROSS_EPS_M) {
    const fp    = footprintForId(near.m.id, FOOT_SRC) || [];
    const setFP = new Set(fp.map(Number).filter(Number.isFinite));
    const matched = (a_ids || []).map(Number).filter(n => setFP.has(n));

    hit = {
      mesh_id: near.m.id,
      matched_ids: matched,
      matched_count: matched.length,
      footprint: [...setFP],
      raw_ids: a_ids
    };
    lastHitMeshId = near.m.id;

    console.log(`CROSS t=${s} mesh=${near.m.id} d=${near.dist.toFixed(2)} a_ids=`, a_ids, 'matched=', matched);
  }

  const rec = {
    sec: s,
    timeStr: baseRow.ts || "00:00:00",
    time: parseTimeToMs(baseRow.ts || "00:00:00"),
    lat: latFinal,
    lng: lngFinal,
    speed_mps: v,
    dist_to_m: near ? near.dist : null,
    ...(hit ? hit : {}),
    raw_ids: a_ids,
    crossDecision,
    crossDebugHtml,
    crossMode: {
      active: !!crossMode?.active,
      crossing: crossMode?.crossing || null,
      decision: crossMode?.decision || null
    }
  };

  perSecond.push(rec);
  out.push(rec);

  console.log(`🟢 [RAW-ID] ts=${baseRow.ts}, raw_ids=[${a_ids.join(", ")}]`);
}

  window.fusedLog = { per_second: perSecond, viz_rows: out };
  return out;
}