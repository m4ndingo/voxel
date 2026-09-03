// ¿Sigue habiendo flashazo? Se vigila `#mc-loading` cada 30 ms desde antes de que exista: si en algún
// momento se APAGA y luego vuelve a encenderse, ese hueco es el mundo vacío que veía el dueño.
const { chromium } = require('playwright');
const BASE = process.env.VOXEL_URL || 'http://localhost:8577';
const SLUG = 'zz-flash-' + Date.now();

(async () => {
  const http = require('http');
  const pide = (m, ruta, cuerpo) => new Promise((ok, mal) => {
    const u = new URL(BASE); const datos = cuerpo ? Buffer.from(JSON.stringify(cuerpo)) : null;
    const r = http.request({ host: u.hostname, port: u.port, path: ruta, method: m,
      headers: datos ? { 'Content-Type': 'application/json', 'Content-Length': datos.length } : {} },
      (rp) => { let b = ''; rp.on('data', c => b += c); rp.on('end', () => ok(b)); });
    r.on('error', mal); if (datos) r.write(datos); r.end();
  });
  console.log(await pide('POST', '/api/mundos/crear', { nombre: SLUG, lado: 96, plantilla: 'terreno-base' }));

  const nav = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const pag = await nav.newPage();
  pag.on('console', m => { if (/generador-mundo/.test(m.text())) console.log('  [nav]', m.text()); });
  await pag.goto(BASE + '/map/' + SLUG, { waitUntil: 'commit', timeout: 60000 });
  const muestras = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const v = await pag.evaluate(() => {
      const e = document.getElementById('mc-loading');
      const tapa = document.body.classList.contains('app-tapada') ? '+tapa' : '';
      return !e ? 'no-existe' : ((e.hidden ? 'apagada' : 'ENCENDIDA') + tapa);
    }).catch(() => 'navegando');
    if (!muestras.length || muestras[muestras.length - 1][0] !== v) muestras.push([v, Date.now() - t0]);
    if (muestras.length > 2 && v === 'apagada' && Date.now() - t0 > 12000) break;
    await new Promise(r => setTimeout(r, 30));
  }
  console.log('secuencia:', muestras.map(m => m[0] + '@' + m[1] + 'ms').join(' → '));
  // El primer encendido es el normal (la página acaba de cargar). Lo que se busca es un SEGUNDO
  // encendido: eso es el hueco en el que se veía el mundo vacío.
  const enc = muestras.map(m => m[0].replace('+tapa', '')).filter(v => v === 'ENCENDIDA' || v === 'apagada');
  let saltos = -1;
  for (let i = 1; i < enc.length; i++) if (enc[i] === 'ENCENDIDA' && enc[i - 1] === 'apagada') saltos++;
  if (saltos < 0) saltos = 0;
  console.log('mcHideLoading al final:', await pag.evaluate(
    () => (window.mcHideLoading && window.mcHideLoading._sinFlash) ? '⛔ SIGUE ENVUELTO' : '✓ devuelto byte a byte'));
  console.log(saltos === 0 ? '  ✓ sin flashazo: la carga no se apaga y se vuelve a encender'
                           : '  ⛔ FLASHAZO: se apagó y volvió a encenderse ' + saltos + ' vez/veces');
  await nav.close();
  console.log(await pide('DELETE', '/api/mundos/' + SLUG));
})();
