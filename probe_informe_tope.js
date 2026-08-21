// Comprobación de que los informes de luz CORREN y de que sus números reaccionan (no de que midan bien): si petan
// o si salen 0 en todo, el dueño gastaría fotos para nada. No busca diferencias entre escenas: eso son sus fotos.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/bugfinder2';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('  ERROR DE PÁGINA: ' + e.message));
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof game!=="undefined" && game.informes && mc.grid && mc.active', null, { timeout: 180000 });
  await p.waitForTimeout(3000);

  for (const f of [0.2, 0.5, 1]) {
    const r = await p.evaluate((f) => {
      mc.glowFocus = f; mc._dynSig = null; mcDynSync();
      const out = {};
      for (const n of ['luz-campo', 'luz-tope', 'luz-agujeros']) {
        const t0 = performance.now();
        try { out[n] = { ms: +(performance.now() - t0).toFixed(1), r: game.informes.corre(n) }; }
        catch (e) { out[n] = { err: String(e && e.stack || e) }; }
        out[n].ms = +(performance.now() - t0).toFixed(1);
      }
      return out;
    }, f);
    console.log('\n================ focus = ' + f + ' ================');
    for (const n of Object.keys(r)) {
      if (r[n].err) { console.log(n + '  PETA: ' + r[n].err); continue; }
      const d = r[n].r;
      console.log(n + '  (' + r[n].ms + ' ms)');
      if (n === 'luz-campo') console.log('   desvío BFS↔ley máx ' + d.desvio.max + ' medio ' + d.desvio.medio +
        ' · ' + d.totales.encendidas + '/' + d.totales.celdas + ' encendidas · suma ' + d.totales.sumaBFS);
      if (n === 'luz-tope') console.log('   recortadas ' + d.totales.recortadasEnAireLibre + '/' + d.totales.enAireLibre +
        ' · niveles perdidos ' + d.recorte.recorteEnAireLibre + ' · peor −' + d.recorte.peor +
        ' · SIN procedencia ' + d.totales.sinHaz + '/' + d.totales.celdasConLuz + ' · escalones ' + d.escalones.cuantos + ' · camino sobra medio ' + d.caminoVsRecta.medio + ' peor ' + d.caminoVsRecta.peor);
      if (n === 'luz-agujeros') { console.log('   agujeros ' + d.totales.agujeros + '/' + d.totales.conVisionDirecta +
        ' · falta ' + d.hueco.luzQueFalta + ' · peor −' + d.hueco.peor + ' · frente muerto ' + d.totales.muertosPorElCamino);
        if (d.peores[0]) console.log('   peor: ' + JSON.stringify({ c: d.peores[0].c, bfs: d.peores[0].bfs,
          ley: d.peores[0].ley, seMuereEn: d.peores[0].seMuereEn })); }
    }
  }
  await b.close();
})();
