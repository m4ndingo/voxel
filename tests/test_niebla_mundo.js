// @area: render
// @necesita: servidor, playwright
// REQ-ENV2 · Niebla atmosférica de FUERA del agua (game.niebla).
//
// Hasta ahora la niebla de fuera del agua iba atada a renderDist y no había mando; los ambientes
// NIEBLA/TORMENTA la pedían. Se mide la PANTALLA (readPixels), no una variable: con la niebla puesta,
// el terreno lejano tira hacia el color del cielo; apagada, la pantalla vuelve EXACTA a como estaba
// (fuera del agua no debe cambiar nada por defecto).
//
//   node tests/test_niebla_mundo.js [url]      por defecto http://localhost:8500/map/test
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
function ok(c, m, x) { if (!c) fallos++; console.log((c ? '  ok  ' : '  FALLA  ') + m + (x ? '   · ' + x : '')); }

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const o = window.fetch;
    window.fetch = (u, i) => {
      const s = String((u && u.url) || u);
      if (i && String(i.method || 'GET').toUpperCase() !== 'GET' && /\/api\//.test(s))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return o(u, i);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.niebla && game.cieloColor', null, { timeout: 120000 });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(async () => {
    const out = {};
    const gl = mc.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const band = () => {
      mcRender();
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const y0 = (h * 0.45) | 0, y1 = (h * 0.62) | 0;
      let R = 0, G = 0, B = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; R += buf[i]; G += buf[i + 1]; B += buf[i + 2]; n++; }
      return [R / n | 0, G / n | 0, B / n | 0];
    };
    const d = (a, c) => Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) + Math.abs(a[2] - c[2]);

    // Mirando casi horizontal sobre la pradera, con un cielo gris bien distinto del verde del terreno.
    mc.volar = true; mc.pos = [(mc.dim.x / 2) | 0, 20, (mc.dim.z / 2) | 0]; mc.vel = [0, 0, 0]; mc.yaw = 0; mc.pitch = -0.15; mc.onGround = false;
    const gris = [0.72, 0.75, 0.78];
    game.cieloColor(gris);
    out.cielo255 = gris.map(x => Math.round(x * 255));

    game.niebla('off'); out.sin = band();
    game.niebla({ near: 3, far: 20, tinte: 0.16 }); out.con = band();
    out.cfg = game.niebla();
    game.niebla('off'); out.trasOff = band();

    out.delta = d(out.sin, out.con);
    out.acercaAlCielo = d(out.con, out.cielo255) < d(out.sin, out.cielo255);
    out.offVuelve = d(out.trasOff, out.sin);
    // clamp: far<=near se corrige a far>near
    out.clampFar = game.niebla({ near: 30, far: 10 });
    game.niebla('off');
    game.cieloColor('reset'); mc.volar = false;
    return out;
  });

  console.log('cielo (gris): ' + JSON.stringify(r.cielo255));
  console.log('\n§1 · la niebla acerca el terreno lejano al color del cielo');
  console.log('    sin ' + JSON.stringify(r.sin) + '  con ' + JSON.stringify(r.con));
  ok(r.delta > 15, 'poner niebla cambia la pantalla de verdad', 'Δ=' + r.delta);
  ok(r.acercaAlCielo, 'y lo hace TIÑENDO hacia el cielo (no un color cualquiera)');
  ok(r.cfg && r.cfg.near === 3 && r.cfg.far === 20, 'game.niebla({...}) guarda su config', JSON.stringify(r.cfg));

  console.log('\n§2 · apagarla deja la pantalla EXACTA a como estaba (fuera del agua no cambia nada)');
  ok(r.offVuelve < 4, "game.niebla('off') restaura el fotograma sin niebla", 'Δ con el original = ' + r.offVuelve);

  console.log('\n§3 · far tiene que ser mayor que near (o la rampa se rompe)');
  ok(r.clampFar && r.clampFar.far > r.clampFar.near, 'far<=near se corrige a far>near', JSON.stringify(r.clampFar));

  console.log('\n§4 · sin excepciones en la página');
  ok(errores.length === 0, 'ninguna', errores.slice(0, 3).join(' | '));

  console.log(fallos ? ('\n' + fallos + ' FALLO(S)') : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
