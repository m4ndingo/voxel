// Sonda de un solo uso (BUG-STR1 → BUG-RS10): ¿el piston empuja ya un hab:cubo-trans PUESTO CON EL CLIC
// DERECHO? Se hace el camino entero del dueno —ranura + mcPlace, no setVoxel a mano— porque la diferencia
// entre antes y despues esta justo ahi: setVoxel siempre escribio en mc.grid (quejandose), y era mcPlace
// quien desviaba el cubo a mc.structures, donde el piston no le ve.
//
// node sonda_str1_piston.js   ·   no persiste nada
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.redstone && game.redstone.tick', null, { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const R = game.redstone, CUBO = 'hab:cubo-trans';
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const base = k => { const i = String(k || '').lastIndexOf('@'); return i > 0 ? k.slice(0, i) : k; };
    const claveEn = (x, y, z) => base(mc.blockKey[idEn(x, y, z)] || '');
    const ticks = n => { for (let i = 0; i < n; i++) R.tick(); };
    const FUENTE = 'asset:assets/bloque_redstone.vox.json', LOSA = 'asset:assets/adoquin.vox.json';
    for (const k of [LOSA, FUENTE, 'hab:piston', 'hab:piston-on', 'hab:piston-cabeza', CUBO])
      try { await game.addMaterial(k); } catch (e) { out.errs.push(k + ': ' + e.message); }
    await mcStructCells(CUBO);
    out.cabe = mcCabeEnRejilla(CUBO);

    // solar de aire con suelo
    const AN = 12, AL = 6, PR = 5;
    let caja = null;
    for (let y = 6; y < Math.min(40, mc.dim.y - AL - 2) && !caja; y++)
      for (let x = 12; x < mc.dim.x - AN - 4 && !caja; x += 4)
        for (let z = 12; z < mc.dim.z - PR - 4 && !caja; z += 4) {
          let libre = true;
          for (let i = 0; i < AN && libre; i++) for (let j = -1; j < AL && libre; j++)
            for (let k = 0; k < PR && libre; k++) if (idEn(x + i, y + j, z + k)) libre = false;
          if (libre) caja = [x, y, z];
        }
    if (!caja) { out.errs.push('sin solar'); return out; }
    const [X, Y, Z] = caja, ZP = Z + 2;
    const tocadas = new Map();
    const pon = (x, y, z, mat) => {
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, idEn(x, y, z));
      mcSetBlock(x, y, z, mat === 0 ? 0 : mcResolveMat(mat));
    };
    const guarda = { pos: mc.pos.slice(), sel: mc.sel, slot: mc.slotStruct.slice(), yaw: mc.yaw,
                     pitch: mc.pitch, reach: mc.reach, estr: mc.structures.length };
    try {
      for (let i = 0; i < AN; i++) for (let k = 0; k < PR; k++) pon(X + i, Y - 1, Z + k, LOSA);
      out.ids = { losa: mcResolveMat(LOSA), fuente: mcResolveMat(FUENTE), piston: mcResolveMat('hab:piston'), cubo: mcResolveMat(CUBO) };
      out.sueloPuesto = claveEn(X + 3, Y - 1, ZP);

      await new Promise(s => setTimeout(s, 400));

      // El cubo, puesto COMO EL DUENO: ranura de estructura + clic derecho.
      mc.slotStruct[mc.sel] = CUBO;
      mc.pos = [X + 3.5, Y + 4, ZP + 0.5]; mc.vel = [0, 0, 0]; game.pitch = -89; mc.reach = 16;
      mc.previewGiro = 0; mc.previewCara = 0; mc.useOldStructBuild = false;
      tocadas.set((X + 3) + ',' + Y + ',' + ZP, idEn(X + 3, Y, ZP));
      await new Promise(s => requestAnimationFrame(s));
      await new Promise(s => requestAnimationFrame(s));
      mcPlace();
      await new Promise(s => setTimeout(s, 800));
      out.enRejilla = claveEn(X + 3, Y, ZP) === CUBO;
      out.claveDiana = claveEn(X + 3, Y, ZP);
      out.comoEstructura = mc.structures.filter(s => s.key === CUBO &&
        Math.abs(s.ox - (X + 3)) < 2 && Math.abs(s.oz - ZP) < 2).length;
      mc.pos = [X + 9.5, Y + 1, ZP + 0.5]; mc.vel = [0, 0, 0];   // lejos, que no estorbe

      // Piston mirando a +X, con el cubo justo delante de donde saldra la cabeza.
      pon(X + 1, Y, ZP, FUENTE);
      pon(X + 2, Y, ZP, 'hab:piston');
      R.revisarCaja(X - 1, Y - 2, Z - 1, X + AN, Y + AL, Z + PR);
      ticks(40);
      out.cabeza = claveEn(X + 3, Y, ZP);
      out.dondeAcabaElCubo = { enX3: claveEn(X + 3, Y, ZP), enX4: claveEn(X + 4, Y, ZP) };
      out.empujado = claveEn(X + 4, Y, ZP) === CUBO;
    } finally {
      for (const s of mc.structures.filter(s => s.key === CUBO &&
        Math.abs(s.ox - (X + 3)) < 3 && Math.abs(s.oz - ZP) < 3)) mcRemoveStruct(s, true);
      for (const [c, id] of tocadas) { const [x, y, z] = c.split(',').map(Number); mcSetBlock(x, y, z, id); }
      for (let dx = 0; dx < AN; dx++) for (let dy = -1; dy < AL; dy++) for (let dz = 0; dz < PR; dz++) {
        const c = (X + dx) + ',' + (Y + dy) + ',' + (Z + dz);
        if (!tocadas.has(c)) mcSetBlock(X + dx, Y + dy, Z + dz, 0);
      }
      mc.pos = guarda.pos; mc.sel = guarda.sel; mc.slotStruct = guarda.slot; mc.yaw = guarda.yaw;
      mc.pitch = guarda.pitch; mc.reach = guarda.reach; mc.vel = [0, 0, 0];
      mcMeshAll();
      out.estructurasDeSobra = mc.structures.length - guarda.estr;
    }
    return out;
  });

  console.log(JSON.stringify(r, null, 2));
  console.log('errores de pagina:', errores.join(' | ') || 'ninguno');
  await b.close();
})();
