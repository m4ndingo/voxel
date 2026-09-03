// Sonda de `fichas-plantilla`: que la foto sacada desde el juego NO salga negra y llegue a la ficha.
const { chromium } = require('playwright');
const BASE = process.env.VOXEL_URL || 'http://localhost:8577';

(async () => {
  const nav = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const pag = await nav.newPage();
  pag.on('console', m => { if (/fichas-plantilla/.test(m.text())) console.log('  [nav]', m.text()); });
  pag.on('pageerror', e => console.log('  ⛔', e.message));

  await pag.goto(BASE + '/map/test', { waitUntil: 'load', timeout: 60000 });
  await pag.waitForTimeout(9000);
  console.log('mundo abierto:', await pag.evaluate(() => typeof mc !== 'undefined' && !!mc.active));

  const r = await pag.evaluate(async () => {
    await game.snippet('fichas-plantilla');
    const url = await game.fichas.retrato('construye-badlands');
    // ¿Es negra? Se mira la imagen que ha quedado en el servidor, píxel a píxel.
    const img = await new Promise((ok, mal) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url + '?v=' + Date.now();
    });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').drawImage(img, 0, 0);
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let suma = 0, distintos = new Set();
    for (let i = 0; i < d.length; i += 4 * 997) { suma += d[i] + d[i + 1] + d[i + 2]; distintos.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); }
    return { url, w: img.width, h: img.height, brillo: Math.round(suma / (d.length / (4 * 997)) / 3), colores: distintos.size };
  });
  console.log('foto subida:', r.url, r.w + '×' + r.h, '· brillo medio', r.brillo, '· colores distintos', r.colores);
  console.log(r.w === 720 && r.h === 1280 ? '  ✓ proporción de teléfono' : '  ⛔ proporción');
  console.log(r.brillo > 12 && r.colores > 8 ? '  ✓ NO es negra: el mcRender síncrono funcionó' : '  ⛔ la foto salió negra/plana');

  await nav.close();
})();
