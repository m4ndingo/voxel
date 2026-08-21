// Comprueba la cadena de REQ-INF1: que data/informes/*.js se cargan, se registran y calculan sin petar,
// y enseña el resumen de cada uno (que es lo que acabará en la ficha de la foto).
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/bugfinder2';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof game!=="undefined" && game.informes && mc.grid && mc.active', null, { timeout: 180000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(async () => {
    await game.informes.carga();
    const lista = game.informes.lista();
    const out = {};
    for (const i of lista) {
      const t0 = performance.now();
      try {
        const d = game.informes.corre(i.nombre);
        const inf = [...(new Map())];   // (solo para no arrastrar el Map fuera del evaluate)
        out[i.nombre] = { ok: true, ms: +(performance.now() - t0).toFixed(0), pesado: i.pesado,
                          bytes: JSON.stringify(d).length, muestra: d };
      } catch (e) { out[i.nombre] = { ok: false, error: String(e && e.stack || e) }; }
    }
    return { lista, out };
  });
  console.log('informes registrados: ' + r.lista.map(i => i.nombre + (i.pesado ? ' (pesado)' : '')).join(', ') || '(NINGUNO)');
  for (const n of Object.keys(r.out)) {
    const o = r.out[n];
    if (!o.ok) { console.log('\n✗ ' + n + ': ' + o.error.split('\n').slice(0, 3).join(' | ')); continue; }
    console.log('\n✓ ' + n + '  (' + o.ms + ' ms, ' + (o.bytes / 1024).toFixed(1) + ' kB)');
    const d = o.muestra;
    if (n === 'luz-semillas') console.log('   ' + d.candidatas + ' cand / ' + d.usadas + ' usadas · saturado=' + d.saturado + ' · corte=' + JSON.stringify(d.corte) + ' · ' + JSON.stringify(d.porOrigen));
    if (n === 'luz-campo') {
      console.log('   desvío BFS↔ley máx ' + (d.desvio && d.desvio.max) + ' (' + (d.desvio && d.desvio.enResoluciones) + '× resolución), medio ' + (d.desvio && d.desvio.medio));
      console.log('   centro ' + JSON.stringify(d.centro) + ' · ' + JSON.stringify(d.totales) + ' · caja ' + JSON.stringify(d.caja));
      for (const o of (d.peores || []).slice(0, 8)) console.log('     ' + JSON.stringify(o.c).padEnd(16) + ' bfs=' + String(o.bfs).padEnd(7) + ' ley=' + String(o.ley).padEnd(7) + ' dif=' + o.dif);
    }
    if (n === 'luz-barrido' && d.girar) {
      console.log('   girar : salto/celda ' + d.girar.saltoCelda + ' · anisotropía ' + d.girar.anisotropia + ' · desvío ley ' + d.girar.desvioLeyMax);
      console.log('   cruzar: salto/celda ' + d.cruzar.saltoCelda + ' · ' + d.cruzar.dondeCelda);
    }
  }
  if (errs.length) console.log('\nERRORES DE PÁGINA: ' + errs.slice(0, 3).join(' | '));
  await b.close();
})();
