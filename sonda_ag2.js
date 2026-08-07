// Sonda de medición para BUG-AG2 / BUG-AG1 — NO es un test, es un metro.
// Pregunta: cuando hay una placa de redstone (lámina de 1 voxel, atravesable) apoyada en el suelo,
// ¿qué ven las tres funciones por las que pasa un agente articulado, y qué ve el jugador?
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('EXCEPCION ' + e.message));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\//.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.bloques && game.esqueletos', null, { timeout: 120000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { pasos: [] };
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;

    // hueco de aire con suelo debajo
    let caja = null;
    for (let y = 5; y < 40 && !caja; y++)
      for (let x = 14; x < mc.dim.x - 8 && !caja; x += 3)
        for (let z = 14; z < mc.dim.z - 8 && !caja; z += 3) {
          let libre = true;
          for (let i = 0; i < 4 && libre; i++) for (let j = 0; j < 4 && libre; j++)
            for (let k = 0; k < 4 && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) return { err: 'sin hueco' };
    const [X, Y, Z] = caja;
    out.caja = caja;

    // suelo macizo bajo la caja
    const suelo = mc.name2id['hab:roca'] || mc.name2id['dirt'] || mc.name2id['grass'] || 1;
    out.sueloClave = mc.blockKey[suelo];
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) mcSetBlock(X + i, Y - 1, Z + k, suelo);

    // la placa, en la celda de aire justo encima del suelo
    if (!mc.name2id['hab:placa']) { try { await game.addMaterial('hab:placa'); } catch (e) { out.errPlaca = e.message; } }
    const idPlaca = mc.name2id['hab:placa'] || 0;
    out.idPlaca = idPlaca;
    if (!idPlaca) return out;
    mcSetBlock(X + 2, Y, Z + 2, idPlaca);
    await new Promise(r => setTimeout(r, 800));

    // ── lo que ve el MOTOR sobre la celda de la placa ──
    out.mcSolid_placa = mcSolid(X + 2, Y, Z + 2);
    out.mcSolidWalk_placa = typeof mcSolidWalk === 'function' ? mcSolidWalk(X + 2, Y, Z + 2) : 'n/a';
    out.atraviesa = !!(mc.atraviesa && mc.atraviesa[idPlaca]);
    out.atraviesaDoc = !!(mc.atraviesaDoc && mc.atraviesaDoc[idPlaca]);
    const g = mc._geoFina && mc._geoFina[idPlaca];
    out.geoFina = g ? { fdim: g.fdim, tieneBits: !!g.bits } : null;
    if (g && g.bits) {
      // altura real ocupada dentro de la celda, en voxels finos
      const d = g.fdim; let alto = 0;
      for (let fy = 0; fy < d[1]; fy++) {
        let hay = false;
        for (let fz = 0; fz < d[2] && !hay; fz++) for (let fx = 0; fx < d[0] && !hay; fx++)
          if (g.bits[(fy * d[2] + fz) * d[0] + fx]) hay = true;
        if (hay) alto = fy + 1;
      }
      out.altoRealVoxels = alto;
    }

    // ── lo que ve el AGENTE ──
    out.mcSurfaceNear_sobre_placa = mcSurfaceNear(X + 2, Z + 2, Y, 1, 3);
    out.mcSurfaceNear_al_lado = mcSurfaceNear(X + 1, Z + 2, Y, 1, 3);
    out.esperado_agente_y = out.mcSurfaceNear_sobre_placa + 1;

    // ── lo que ve el JUGADOR: mcTerrenoChoca con una caja apoyada en Y (encima de la placa) ──
    const HW = MC_HW * (mc.scale || 1), PH = MC_PH * (mc.scale || 1);
    out.jugador_choca_en_Y = mcTerrenoChoca(X + 2.5, Y, Z + 2.5, HW, PH);          // pies EN la celda de la placa
    out.jugador_choca_en_Ymas1 = mcTerrenoChoca(X + 2.5, Y + 1, Z + 2.5, HW, PH);  // un bloque más arriba

    // limpieza
    mcSetBlock(X + 2, Y, Z + 2, 0);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) mcSetBlock(X + i, Y - 1, Z + k, 0);
    return out;
  });

  console.log(JSON.stringify(r, null, 2));
  await b.close();
})();
