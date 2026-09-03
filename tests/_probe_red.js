// Sonda de RED (scratch, no la corre el runner). Mide lo que el dueño ve en el inspector al cargar
// un mapa: cuantas peticiones, cuantos 404, y cuantos documentos se bajan MAS DE UNA VEZ.
// Uso:  node tests/_probe_red.js [mapa] [puerto]
const { chromium } = require('playwright');
const MAPA = process.argv[2] || 'zz-red';
const BASE = 'http://localhost:' + (process.argv[3] || 8577);

(async () => {
  const nav = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await nav.newPage();
  const req = [];           // {url, status, bytes}
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e).slice(0, 160)));
  p.on('console', (m) => { if (m.type() === 'error') errores.push('[console] ' + m.text().slice(0, 160)); });
  p.on('response', async (r) => {
    let bytes = 0;
    try { bytes = Number((await r.allHeaders())['content-length'] || 0); } catch (e) {}
    req.push({ url: r.url().replace(BASE, ''), status: r.status(), bytes: bytes });
  });

  const t0 = Date.now();
  await p.goto(BASE + '/map/' + MAPA + (process.argv[4] || ''), { waitUntil: 'load', timeout: 90000 });
  // Esperar a que el mundo termine de cargar del todo (el overlay se quita al final de openWorld).
  await p.waitForFunction(() => typeof mc !== 'undefined' && mc.active, null, { timeout: 90000 })
    .catch(() => console.log('  (aviso: mc.active no llego a true)'));
  await p.waitForTimeout(6000);   // dejar correr el autoarranque y la reparacion de texturas
  const ms = Date.now() - t0;

  const n404 = req.filter((r) => r.status === 404);
  const veces = {};
  req.forEach((r) => { if (r.status === 200) veces[r.url] = (veces[r.url] || 0) + 1; });
  const repes = Object.entries(veces).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  const kb = req.reduce((a, r) => a + r.bytes, 0) / 1024;

  console.log('\n=== /map/' + MAPA + ' · ' + ms + ' ms ===');
  console.log('peticiones : ' + req.length + '   (' + kb.toFixed(0) + ' KB declarados)');
  console.log('404        : ' + n404.length);
  console.log('repetidas  : ' + repes.length + ' documento(s)');
  console.log('errores JS : ' + errores.length);

  if (n404.length) {
    console.log('\n--- los 404 ---');
    const porUrl = {};
    n404.forEach((r) => { porUrl[r.url] = (porUrl[r.url] || 0) + 1; });
    Object.entries(porUrl).sort((a, b) => b[1] - a[1])
      .forEach(([u, n]) => console.log('  ' + String(n).padStart(2) + '×  ' + u));
  }
  if (repes.length) {
    console.log('\n--- bajadas mas de una vez ---');
    repes.slice(0, 25).forEach(([u, n]) => console.log('  ' + n + '×  ' + u));
  }
  if (errores.length) {
    console.log('\n--- errores ---');
    errores.slice(0, 10).forEach((e) => console.log('  ' + e));
  }

  await nav.close();
})().catch((e) => { console.error('⛔ ' + e.message); process.exit(1); });
