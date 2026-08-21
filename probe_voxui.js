// ¿Dónde están de verdad los emisores de la capa game.voxelesUI? Los informes de las fotos 85/86 dicen que 154 de
// las 160 semillas que ganan el reparto caen FUERA de la caja del campo y no alumbran nada. Si además están fuera
// del MUNDO, es que están gastando el presupuesto de luces sin poder aportar ni un nivel.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/bugfinder2';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active', null, { timeout: 180000 });
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const vl = mcVoxUILuces(), n = vl.length / 4;
    let dentro = 0, fuera = 0, ymin = 1e9, ymax = -1e9;
    const niveles = {};
    for (let k = 0; k < vl.length; k += 4) {
      const x = Math.floor(vl[k]), y = Math.floor(vl[k + 1]), z = Math.floor(vl[k + 2]);
      if (mcInside(x, y, z)) dentro++; else fuera++;
      ymin = Math.min(ymin, vl[k + 1]); ymax = Math.max(ymax, vl[k + 1]);
      niveles[vl[k + 3]] = (niveles[vl[k + 3]] || 0) + 1;
    }
    const sem = (mc._dynSem || []).slice(0, mc.dynLight ? mc.dynLight.luces : 0);
    let semFuera = 0; for (const s of sem) if (!mcInside(s.x, s.y, s.z)) semFuera++;
    return { dim: mc.dim, luces: n, dentro, fuera, ymin: +ymin.toFixed(2), ymax: +ymax.toFixed(2), niveles,
             semillas: sem.length, semillasFueraDelMundo: semFuera,
             candidatas: (mc._dynCand || []).length / 11, tope: MC_DYN_SEMILLAS };
  });
  console.log('mundo: ' + r.dim.x + '×' + r.dim.y + '×' + r.dim.z + '   (y válida: 0…' + (r.dim.y - 1) + ')');
  console.log('emisores de game.voxelesUI: ' + r.luces + '   dentro del mundo: ' + r.dentro + '   FUERA: ' + r.fuera);
  console.log('   su y va de ' + r.ymin + ' a ' + r.ymax + '   · alcances: ' + JSON.stringify(r.niveles));
  console.log('semillas que ganan el reparto: ' + r.semillas + ' de ' + r.candidatas + ' candidatas (tope ' + r.tope + ')');
  console.log('   de ésas, FUERA DEL MUNDO (no siembran nada): ' + r.semillasFueraDelMundo);
  await b.close();
})();
