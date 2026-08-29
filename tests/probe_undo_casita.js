// @area: mundo
// @necesita: servidor, playwright
// SONDA: por qué la `z` no deshace el bloque-con-comportamiento «casita» y la casa que levanta.
//
// La cadena que TIENE que cumplirse (REQ-UNDO1b) es:
//   1. `alRomper` devuelve la promesa de `game.snippet('construye-casa', c)`   ← snippet
//   2. el envoltorio de `mcBreak` la devuelve hacia arriba                     ← snippet
//   3. `mcDoAction` hace `mcTrasRomper(mcBreak())` y la espera                 ← app.js
//   4. el roto se absorbe en el lote y sale UNA entrada {t:'bb'}               ← app.js
// Aquí no se afirma nada todavía: se mira ESLABÓN A ESLABÓN cuál se rompe, porque el dueño dice que
// la `z` sigue sin funcionar y el sitio del fallo decide el arreglo.
//
//   node tests/probe_undo_casita.js [url]
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { const t = m.text(); if (/snippet|casita|construye/i.test(t)) console.log('[console]', t.slice(0, 200)); });
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active && typeof game!=="undefined"', null, { timeout: 180000 });
  await page.waitForTimeout(6000);

  const P = o => console.log('   ' + o);

  console.log('\n0 · ¿está el mundo como hace falta?');
  P(JSON.stringify(await page.evaluate(() => ({
    autoarranque: !!(window.mcBreak && String(mcBreak).indexOf('dispararAlRomper') >= 0),
    casitaDefinida: (() => { try { return Object.keys(game.bloques.info() || {}).some(k => /casita/.test(k)); } catch (e) { return 'ERR:' + e.message; } })(),
    hayTrasRomper: typeof window.mcTrasRomper,
    hayApuntaLote: typeof window.mcApuntaLote
  }))));

  console.log('\n1 · se planta la casita delante del jugador y se apunta');
  P(JSON.stringify(await page.evaluate(() => {
    const x = Math.floor(mc.pos[0]), y = Math.floor(mc.pos[1]), z = Math.floor(mc.pos[2]) - 2;
    setVoxel(x, y, z, 'casita');
    window.__C = [x, y, z];
    mc.yaw = Math.PI; mc.pitch = 0;                       // yaw=PI mira a +Z; la casita está en -Z…
    mc.yaw = 0;                                           // …con yaw=0 el frente es -Z, que es donde está
    return { casita: [x, y, z], puesta: mcNombreMat ? mcNombreMat(mc.grid[mcIdx(x, y, z)]) : mc.grid[mcIdx(x, y, z)] };
  })));
  await page.waitForTimeout(1500);

  console.log('\n2 · a qué apunta el rayo (si no apunta a la casita, todo lo demás no dice nada)');
  P(JSON.stringify(await page.evaluate(() => {
    const b = (typeof mcAimBlock === 'function') ? mcAimBlock() : (typeof mcRayo === 'function' ? mcRayo() : null);
    return { blanco: b ? { x: b.x, y: b.y, z: b.z, clave: b.clave || b.key } : null, esperado: window.__C };
  })));

  console.log('\n3 · se rompe por la puerta real (lo mismo que hace mcDoAction) y se mira la promesa');
  P(JSON.stringify(await page.evaluate(async () => {
    const antes = mc.hist.length;
    const p = mcBreak();
    const esPromesa = !!(p && typeof p.then === 'function');
    mcTrasRomper(p);
    const trasRomper = { esPromesa, hist: mc.hist.length, rotoPend: !!window.mcRotoPend, enCurso: !!window.mcRompeEnCurso };
    if (esPromesa) { try { await p; } catch (e) { trasRomper.promesaFallo = String(e && e.message || e); } }
    return { antes, trasRomper };
  })));

  await page.waitForTimeout(6000);        // que la casa acabe de construirse y se vuelque el lote

  console.log('\n4 · qué ha quedado en el historial (esto es lo que la `z` va a deshacer)');
  P(JSON.stringify(await page.evaluate(() => ({
    total: mc.hist.length,
    cola: mc.hist.slice(-4).map(e => e.t === 'bb' ? { t: 'bb', n: e.edits.length } : { t: e.t, x: e.x, y: e.y, z: e.z }),
    lote: window.mcLote ? window.mcLote.length : null,
    enCurso: !!window.mcRompeEnCurso,
    pendCarga: (typeof mcPendCarga !== 'undefined' && mcPendCarga) ? mcPendCarga.size : null
  }))));

  console.log('\n5 · UNA `z`: ¿vuelve la casita y se va la casa?');
  const casaAntes = await page.evaluate(() => {
    let n = 0; const c = window.__C;
    for (let x = c[0] - 8; x <= c[0] + 8; x++) for (let y = c[1] - 1; y <= c[1] + 10; y++)
      for (let z = c[2] - 8; z <= c[2] + 8; z++) if (mc.grid[mcIdx(x, y, z)]) n++;
    return n;
  });
  await page.evaluate(async () => { await mcUndo(); });
  await page.waitForTimeout(3000);
  P(JSON.stringify(await page.evaluate(c0 => {
    const c = window.__C; let n = 0;
    for (let x = c[0] - 8; x <= c[0] + 8; x++) for (let y = c[1] - 1; y <= c[1] + 10; y++)
      for (let z = c[2] - 8; z <= c[2] + 8; z++) if (mc.grid[mcIdx(x, y, z)]) n++;
    return {
      solidosAntesDeLaZ: c0, solidosDespues: n,
      casitaHaVuelto: /casita/.test(String(mcNombreMat ? mcNombreMat(mc.grid[mcIdx(c[0], c[1], c[2])]) : '')),
      histTotal: mc.hist.length
    };
  }, casaAntes)));

  console.log('\n6 · se recoge todo lo plantado');
  P(JSON.stringify(await page.evaluate(() => {
    const c = window.__C; let n = 0;
    for (let x = c[0] - 8; x <= c[0] + 8; x++) for (let y = c[1] - 1; y <= c[1] + 10; y++)
      for (let z = c[2] - 8; z <= c[2] + 8; z++) if (mc.grid[mcIdx(x, y, z)]) { mcSetBlock(x, y, z, 0); n++; }
    if (typeof mcRemeshAround === 'function') mcRemeshAround(c[0], c[1], c[2]);
    if (typeof mcScheduleSave === 'function') mcScheduleSave();
    return { recogidos: n };
  })));
  await page.waitForTimeout(5000);
  await browser.close();
})();
