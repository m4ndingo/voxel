// REQ-COGER1 · acercarse a la ballesta la coge, sin picarla. Planta y recoge en /map/test.
const { chromium } = require('playwright');
const BASE = process.env.VOXEL_URL || 'http://localhost:8577';

(async () => {
  const nav = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await nav.newPage();
  p.on('console', (m) => { if (m.type() === 'error' || /alCoger|ballesta/i.test(m.text())) console.log('  [nav]', m.text().slice(0, 200)); });
  await p.goto(BASE + '/map/test?noauto=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => typeof window.game !== 'undefined' && window.game.bloques, null, { timeout: 30000 });

  // El autoarranque no corre con ?noauto=1: se lanza mano para tener el motor SIN nada mas.
  await p.evaluate(() => game.snippet('mundo-autoarranque'));
  await p.waitForTimeout(1500);

  console.log('VERSION mcUpdate :', await p.evaluate(() => window.mcUpdate && window.mcUpdate._bloques));
  console.log('ficha ballesta   :', await p.evaluate(() => {
    const i = game.bloques.info ? null : null;
    return JSON.stringify(Object.keys(game.bloques.lista ? {} : {}));
  }).catch(() => 'n/a'));

  // 1) La definicion existe y es alCoger, no alRomper.
  const def = await p.evaluate(() => {
    const t = game.bloques && game.bloques.dump ? game.bloques.dump() : null;
    return t ? JSON.stringify(t).slice(0, 300) : 'sin dump';
  });
  console.log('dump             :', def);

  // 2) Planta una ballesta a 3 bloques del jugador y camina hacia ella.
  const res = await p.evaluate(async () => {
    const out = { pasos: [] };
    if (typeof mc === 'undefined' || !mc.active) { out.error = 'el Mundo no esta activo'; return out; }
    const x = Math.floor(mc.pos[0]) + 3, z = Math.floor(mc.pos[2]);
    const y = (typeof mcSurfaceY === 'function') ? mcSurfaceY(x, z) : Math.floor(mc.pos[1]);
    out.celda = [x, y, z];
    let cogido = null;
    game.bloques.define('ballesta', { nota: 'prueba', alcance: 1.2, alCoger: (c) => { cogido = c; } });
    await game.stamp('ballesta', x, y, z);
    out.estructuras = mc.structures ? mc.structures.length : 0;
    out.enRejilla = (typeof mcGetVoxel === 'function') ? (mc.blockKey[mc.grid[mcIdx(x, y, z)]] || '') : '?';

    // Andar hacia ella a mano, moviendo mc.pos y dejando correr mcUpdate.
    for (let i = 0; i < 40 && !cogido; i++) {
      mc.pos[0] += 0.1;
      mcUpdate(0.016);
      await new Promise((r) => setTimeout(r, 20));
    }
    out.cogido = cogido ? { tipo: cogido.tipo, clave: cogido.clave, x: cogido.x, y: cogido.y, z: cogido.z } : null;
    out.estructurasDespues = mc.structures ? mc.structures.length : 0;
    return out;
  });
  console.log('resultado        :', JSON.stringify(res, null, 2));
  console.log(res.cogido ? '✓ se cogio al acercarse' : '⛔ NO se cogio');

  await nav.close();
  process.exit(res.cogido ? 0 : 1);
})();
