// REQ-RED1 · sonda de diagnostico (scratch): imprime TODAS las peticiones de una carga EN ORDEN
// CRONOLOGICO, con su marca de tiempo. Es la que enseño que la carga hacia DOS pasadas sobre la misma
// paleta y que la segunda arrancaba 50 ms despues de cargarse el snippet `texturas-embebidas`.
// Sin el orden temporal, los contadores de `_probe_red.js` dicen QUE se repite pero no QUIEN lo causa.
const { chromium } = require('playwright');
(async () => {
  const nav = await chromium.launch({ args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
  const p = await nav.newPage();
  const req = [];
  p.on('request', (r) => req.push({ t: Date.now(), url: r.url().replace('http://localhost:8577',''), tipo: r.resourceType() }));
  const t0 = Date.now();
  await p.goto('http://localhost:8577/map/zz-red?noauto=1', { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => typeof mc !== 'undefined' && mc.active, null, { timeout: 90000 }).catch(()=>{});
  await p.waitForTimeout(4000);
  req.forEach((r,i) => console.log(String(i).padStart(3), String(r.t-t0).padStart(6)+'ms', r.tipo.padEnd(10), r.url));
  await nav.close();
})();
