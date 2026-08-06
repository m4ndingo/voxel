// Captura para el ticket REQ-XR2: la línea de señal sobre el circuito de verdad del dueño
// (/map/default). Solo mira: bloquea los POST y no escribe nada en el mundo.
//
// ⚠️ Las etiquetas de rayos-X son DOM, no canvas, así que aquí no vale el truco de
// mc.canvas.toDataURL(): hace falta un screenshot de página. Y para que la página no se mueva entre
// el evaluate y el screenshot se CONGELA el bucle (requestAnimationFrame a no-op) y se llama a
// mcRender()/mcUpdateXrayLabels() a mano.
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => console.log('PAGEERROR', String(e)));
  await p.addInitScript(() => {
    const o = window.fetch;
    window.fetch = (u, x) => {
      const url = String((u && u.url) || u);
      if (x && String(x.method || 'GET').toUpperCase() === 'POST' && /\/api\//.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return o(u, x);
    };
  });
  await p.goto('http://localhost:8500/map/default', { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 240000 });
  await p.waitForFunction('window.game && game.redstone && window.mcXrayExtra', null, { timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(8000);

  // Buscar la celda de circuito con más señal y congelar el mundo mirándola.
  const sitio = await p.evaluate(() => {
    let mejor = null;
    for (const [k, v] of game.redstone._potencia) {
      const [x, y, z] = k.split(',').map(Number);
      if (v > 0 && (!mejor || v > mejor[3])) mejor = [x, y, z, v];
    }
    if (!mejor) return null;
    window.requestAnimationFrame = () => 0;          // congelado: nada se mueve ya
    const [X, Y, Z] = mejor;
    // A 2,5 bloques: el volumen de rayos-X son 7×5×7 celdas alrededor de los PIES (R=3), así que
    // desde más lejos la celda no entra en cuadro y parece que la herramienta no hace nada.
    mc.pos[0] = X + 0.5; mc.pos[1] = Y; mc.pos[2] = Z + 2.5;
    mc.vel = [0, 0, 0];
    mc.yaw = 0; mc.pitch = -0.35;   // dir = [-sin(yaw)·cp, sin(pitch), -cos(yaw)·cp] ⇒ yaw 0 mira a −Z
    mc.xray = true;
    return { celda: mejor, info: game.redstone.info(X, Y, Z) };
  });
  if (!sitio) { console.log('no hay señal viva en este mundo'); await b.close(); process.exit(1); }
  console.log('celda ' + sitio.celda.slice(0, 3).join(',') + ' · ' + sitio.info.clave +
              ' · recibe ' + sitio.info.recibe + ' saca ' + sitio.info.saca);

  fs.mkdirSync('data/tickets/REQ-XR2', { recursive: true });
  const pinta = async (quitarEnvoltorio) => p.evaluate((quitar) => {
    const envuelto = window.mcXrayExtra;
    if (quitar) window.mcXrayExtra = envuelto._orig;      // el mismo encuadre de ayer
    mcRender(); mcUpdateXrayLabels();
    const t = [...document.querySelectorAll('.mc-xlbl')].filter(e => !e.hidden).map(e => e.textContent);
    if (quitar) window.mcXrayExtra = envuelto;
    return t;
  }, quitarEnvoltorio);

  // A 1280×720 las etiquetas salen a 9-10 px y no se leen en el png; el recorte central es el que
  // sirve para mirar el ticket.
  const ZOOM = { x: 380, y: 170, width: 540, height: 380 };
  const antes = await pinta(true);
  await p.screenshot({ path: 'data/tickets/REQ-XR2/antes.png' });
  await p.screenshot({ path: 'data/tickets/REQ-XR2/antes_zoom.png', clip: ZOOM });
  const despues = await pinta(false);
  await p.screenshot({ path: 'data/tickets/REQ-XR2/despues.png' });
  await p.screenshot({ path: 'data/tickets/REQ-XR2/despues_zoom.png', clip: ZOOM });

  console.log('etiquetas: ' + antes.length + ' · con ⚡ antes ' + antes.filter(t => /⚡/.test(t)).length +
              ', después ' + despues.filter(t => /⚡/.test(t)).length);
  console.log(despues.filter(t => /⚡/.test(t)).join('\n'));
  await b.close();
})();
