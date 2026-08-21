// ¿Por qué se remalla el mundo entero cada medio segundo con la escena en reposo?
// Hipótesis: mcNoteSignsDesfasados() no llega a estar NUNCA satisfecho, así que mcSyncNoteSignsRun
// vuelve a plantar carteles cada ciclo, y cada cartel es emisivo ⇒ mcRestampAll + mcMeshAll.
// Uso: node performance/sonda_carteles_bucle.js [mapa]
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  const mapa = process.argv[2] || 'plan';
  await p.goto('http://localhost:8500/map/' + mapa, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(8000);

  const foto = () => p.evaluate(() => {
    const notas = Object.keys(mc.notes || {});
    const carteles = mc.structures.filter(s => s.nota);
    const dentro = notas.filter(k => { const o = mcNoteSignOrigin(k); return mcInside(o[0], o[1], o[2]); });
    return {
      notas: notas.length,
      carteles: carteles.length,
      objetivo: Math.min(notas.length, 64),
      notasFueraDelMundo: notas.length - dentro.length,
      desfasados: mcNoteSignsDesfasados(),
      estructuras: mc.structures.length,
      fps: Math.round(mc.fps || 0),
    };
  });

  const a = await foto();
  console.log('== estado en reposo ==');
  console.log(JSON.stringify(a, null, 1));

  // Cuántas veces se re-planta en 10 s de quietud absoluta.
  await p.evaluate(() => {
    window._c = { stamps: 0, meshAll: 0, sync: 0 };
    const s0 = window.mcStampStruct, m0 = window.mcMeshAll, y0 = window.mcSyncNoteSigns;
    window.mcStampStruct = function (...x) { window._c.stamps++; return s0.apply(this, x); };
    window.mcMeshAll = function (...x) { window._c.meshAll++; return m0.apply(this, x); };
    window.mcSyncNoteSigns = function (...x) { window._c.sync++; return y0.apply(this, x); };
  });
  await p.waitForTimeout(10000);
  const c = await p.evaluate(() => window._c);
  console.log('\n== 10 s QUIETO ==');
  console.log(JSON.stringify(c, null, 1), '← si esto no es 0, el mundo se está rehaciendo solo');

  const z = await foto();
  console.log('\n== y sigue igual de desfasado ==');
  console.log(JSON.stringify(z, null, 1));
  await b.close();
})();
