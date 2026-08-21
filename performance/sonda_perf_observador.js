// ¿Cuánto cuesta MIRAR? El 2026-08-20 armar el profiler a `perfVerbosity = 3` dejó el juego a
// 0,1-1,0 fps: las hojas (`mcInside` ~30 M llamadas, `mcIdx` ~15 M) estaban envueltas con dos
// `performance.now()` cada una. Esta sonda es el guardián de que eso no vuelva: alterna verbosidad
// 0 y 3 y exige que el observador no se coma más de la mitad de los fps, y que el volcado traiga la
// tabla de hojas con sus cuentas (que es el dato que se quería de ellas).
//
// ⚠️ Bajo SwiftShader el frame está limitado por GPU (~10 fps clavados en /map/plan): un ahorro de
// CPU es invisible AQUÍ. Lo que sí se ve es un desastre como el de 0,1 fps, que es lo que se vigila.
// Uso: node performance/sonda_perf_observador.js [mapa] [segundos por toma]
const { chromium } = require('playwright');

const mediana = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const log = [];
  p.on('console', m => { const t = m.text(); log.push(t); if (/^\[perf\]/.test(t)) console.log(t); });
  p.on('pageerror', e => console.log('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  const mapa = process.argv[2] || 'plan';
  const segs = +(process.argv[3] || 6);
  await p.goto('http://localhost:8500/map/' + mapa, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(15000);   // que pase el mallado inicial, o la 1ª toma miente

  await p.evaluate(() => { window._fpsN = 0; const r = window.requestAnimationFrame; (function bucle(){ window._fpsN++; r(bucle); })(); });
  const mide = async (nombre, verb) => {
    await p.evaluate(v => { game.perfVerbosity = v; game.perfAssert = v ? 60 : 0; game.perfContinuo = !!v; }, verb);
    await p.waitForTimeout(1500);
    const t0 = await p.evaluate(() => [window._fpsN, performance.now()]);
    await p.waitForTimeout(segs * 1000);
    const t1 = await p.evaluate(() => [window._fpsN, performance.now()]);
    const fps = (t1[0] - t0[0]) / ((t1[1] - t0[1]) / 1000);
    console.log('  ' + fps.toFixed(2).padStart(6) + ' fps  ' + nombre);
    return fps;
  };

  console.log('== /map/' + mapa + ' · ' + segs + ' s por toma · rondas alternadas ==');
  await mide('0· calentamiento (se descarta)', 0);
  const off = [], on = [];
  for (let i = 1; i <= 3; i++) {
    off.push(await mide(i + '· perfVerbosity 0 (apagado)', 0));
    on.push(await mide(i + '· perfVerbosity 3 (armado)', 3));
  }

  // Un volcado con verbosidad 3 puesta, para ver la tabla de hojas.
  await p.evaluate(() => { game.perfVerbosity = 3; game.perfAssert = 60; });
  await p.waitForTimeout(2000);
  await p.evaluate(() => game.perfDump.forzar());
  await p.waitForTimeout(1500);
  const texto = log.join('\n');

  const fOff = mediana(off), fOn = mediana(on);
  const coste = (1 - fOn / fOff) * 100;
  console.log('\n== veredicto ==');
  console.log('  apagado   mediana ' + fOff.toFixed(2) + ' fps');
  console.log('  armado v3 mediana ' + fOn.toFixed(2) + ' fps');
  console.log('  el observador se come ' + coste.toFixed(0) + ' % de los fps');

  const pruebas = [
    ['v3 no congela (>50 % de los fps de v0)', fOn > fOff * 0.5],
    ['tabla de hojas calientes', /hojas calientes/.test(texto)],
    ['cuenta de mcInside', /mcInside\s+\d+ llamadas/.test(texto)],
    ['cuenta de mcIdx', /mcIdx\s+\d+ llamadas/.test(texto)],
    ['las hojas NO salen en la tabla cronometrada', !/^\[perf\]\s+mcInside\s+\d+\s+\d+\.\d\d/m.test(texto)],
  ];
  console.log('\n== comprobaciones ==');
  let mal = 0;
  for (const [n, ok] of pruebas) { if (!ok) mal++; console.log('  ' + (ok ? 'ok  ' : 'FALLA ') + n); }
  await b.close();
  process.exit(mal ? 1 : 0);
})();
