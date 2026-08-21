// Reproduce EXACTAMENTE el pegote de 4 líneas del dueño y mira qué sale por consola.
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const log = [];
  p.on('console', m => { const t = m.text(); if (t.startsWith('[perf]')) log.push(t); });
  p.on('pageerror', e => log.push('EXC ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/mundo/**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && game && game.perfAssert!==undefined', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  // ── EL PEGOTE DEL DUEÑO, en un solo turno de consola ───────────────────────
  const pegote = await p.evaluate(() => {
    const antes = [];
    game.perfAssert = 60;
    game.perfVerbosity = 2;
    game.perfContinuo = true;
    game.perfDump();
    return { lastDump: !!window._perfState && !!_perfState.lastDump,
             armed: !!window._perfState && _perfState.armed,
             wrapping: !!window._perfState && _perfState.wrapping,
             glEnvuelto: !!(mc.gl && mc.gl.drawArrays._perf),
             renEnvuelto: !!(mc.gl && mc.gl.drawArrays._ren),
             fpsAhora: mc.fps, antes };
  });
  console.log('== tras el pegote (mismo turno) ==');
  console.log(JSON.stringify(pegote, null, 1));
  console.log('logs [perf] hasta aquí:', JSON.stringify(log, null, 1));

  // ── Ahora dejamos correr frames de verdad ─────────────────────────────────
  const nLog = log.length;
  await p.waitForTimeout(4000);
  console.log('\n== tras 4 s de frames ==');
  console.log('líneas [perf] nuevas:', log.length - nLog);
  for (const l of log.slice(nLog, nLog + 25)) console.log(l);

  // ── Y el camino corto: forzar ─────────────────────────────────────────────
  const n2 = log.length;
  await p.evaluate(() => game.perfDump.forzar());
  await p.waitForTimeout(500);
  console.log('\n== game.perfDump.forzar() ==');
  for (const l of log.slice(n2, n2 + 25)) console.log(l);

  const fin = await p.evaluate(() => {
    game.perfAssert = 0;
    const a = { drawArraysLimpio: !mc.gl.drawArrays._perf, bufferDataLimpio: !mc.gl.bufferData._perf };
    // Convivencia con REQ-REN1: showRendered envuelve ENCIMA y el profiler no debe llevárselo.
    game.showRendered = true;
    game.perfAssert = 60; game.perfVerbosity = 2;
    a.trasPerfSigueRen = !!mc.gl.drawArrays._ren || !!(mc.gl.drawArrays._perf);
    game.perfAssert = 0;
    a.renSobrevive = !!mc.gl.drawArrays._ren;
    game.showRendered = false;
    a.todoLimpio = !mc.gl.drawArrays._ren && !mc.gl.drawArrays._perf;
    return a;
  });
  console.log('\n== apagado ==', JSON.stringify(fin, null, 1));
  await b.close();
})();
