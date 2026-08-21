// ¿Sale en perfDump lo que gastan los snippets DIBUJANDO? Caso de referencia: `particulas-voxel`,
// que no pinta nada propio — llena `game.voxelesUI` y es app.js quien re-malla y re-sube la capa
// ENTERA cada frame. Esta sonda enciende un sistema de partículas gordo, fuerza un volcado y
// comprueba que aparecen (a) la tabla de la capa viva, (b) el rAF del snippet y (c) mcDrawVoxUI.
// Uso: node performance/sonda_voxui_perf.js [mapa] [grosor]
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const log = [];
  p.on('console', m => { const t = m.text(); log.push(t); if (/^\[perf\]/.test(t)) console.log(t); });
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/snippets/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  const mapa = process.argv[2] || 'plan';
  const grosor = +(process.argv[3] || 8);
  await p.goto('http://localhost:8500/map/' + mapa, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(15000);   // que pase el mallado inicial: si no, el volcado sale lleno de arranque

  // Encender partículas a mano: la librería es eso, una librería; nadie la arranca sola.
  const arranque = await p.evaluate(async (grosor) => {
    const P = await game.snippet('particulas-voxel');
    const s = P.crea({ grupo: 'sonda', chorro: 200, tope: 4000, dura: 60, grosorPosada: grosor });
    const o = [mc.px, mc.py + 2, mc.pz];
    for (let i = 0; i < 8; i++) s.salpica(o);   // ⚠️ salpica(punto) — un array, no tres argumentos
    P.arranca();
    return { sistemas: P.info(), grupos: [...mc.voxUI.keys()] };
  }, grosor);
  console.log('== arranque ==', JSON.stringify(arranque));

  await p.waitForTimeout(4000);

  const antes = await p.evaluate(() => {
    game.perfAssert = 60; game.perfVerbosity = 2;
    return { fps: Math.round(mc.fps || 0), grupos: [...mc.voxUI].map(([k, m]) => [k, m.size, mcVoxUIGrosor(k)]) };
  });
  console.log('== capa viva antes del volcado ==', JSON.stringify(antes));

  // ⚠️ nada de vaciar `log` antes de forzar: `forzar()` vuelca el frame EN CURSO, y justo después de
  // un volcado automático ese acumulador está vacío. Se recogen todos los volcados y se juzga el bulto.
  await p.waitForTimeout(2000);
  await p.evaluate(() => game.perfDump.forzar());
  await p.waitForTimeout(1500);

  const texto = log.join('\n');
  const pruebas = [
    ['tabla de la capa viva', /capa VIVA/],
    ['fila del grupo `sonda`', /\bsonda\b/],
    ['aviso de grosor ×N³', /grosor\s*\d+\s*⇒/],
    ['pista de A\/B', /voxelesUI\.limpia/],
    ['mcDrawVoxUI medido', /mcDrawVoxUI/],
    ['rAF del snippet', /rAF:/],
    ['(resto de mcTick)', /resto de mcTick/],
  ];
  console.log('\n== comprobaciones ==');
  let mal = 0;
  for (const [n, re] of pruebas) { const ok = re.test(texto); if (!ok) mal++; console.log('  ' + (ok ? 'ok  ' : 'FALLA ') + n); }

  // A/B: apagar la capa y ver si vuelven los fps. Es la prueba que el dueño pide poder hacer.
  const ab = await p.evaluate(async () => {
    const f0 = mc.fps;
    game.voxelesUI.limpia('sonda');
    await new Promise(r => setTimeout(r, 3000));
    return { antes: Math.round(f0 || 0), despues: Math.round(mc.fps || 0) };
  });
  console.log('\n== A/B game.voxelesUI.limpia("sonda") ==', JSON.stringify(ab));

  await b.close();
  process.exit(mal ? 1 : 0);
})();
