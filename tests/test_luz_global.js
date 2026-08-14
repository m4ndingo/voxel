// @area: render
// @necesita: servidor, playwright
// REQ-ENV3 · Luz global (game.luz): oscurecer el mundo entero de noche, sin re-mallar.
//
// Se mide la PANTALLA (readPixels) mirando a plomo al suelo cercano (sin horizonte ni niebla que
// diluyan): bajar la luz oscurece el terreno en proporción, y `game.luz(1)` lo devuelve EXACTO. Por
// defecto (1) no cambia ni un float — es la disciplina de todos estos mandos.
//
//   node tests/test_luz_global.js [url]      por defecto http://localhost:8500/map/test
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
  await p.waitForFunction('window.game && game.luz && game.cieloColor', null, { timeout: 120000 });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(async () => {
    const out = {};
    const gl = mc.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const band = () => {
      mcRender();
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const y0 = (h * 0.35) | 0, y1 = (h * 0.65) | 0, x0 = (w * 0.35) | 0, x1 = (w * 0.65) | 0;
      let R = 0, G = 0, B = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; R += buf[i]; G += buf[i + 1]; B += buf[i + 2]; n++; }
      return [R / n | 0, G / n | 0, B / n | 0];
    };
    const suma = a => a[0] + a[1] + a[2];
    const d = (a, c) => Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) + Math.abs(a[2] - c[2]);

    // a plomo al suelo cercano; niebla y cielo fuera de juego
    mc.volar = true; mc.pos = [(mc.dim.x / 2) | 0, 22, (mc.dim.z / 2) | 0]; mc.vel = [0, 0, 0]; mc.yaw = 0; mc.pitch = -1.5; mc.onGround = false;
    game.niebla('off'); game.cieloColor('reset');

    game.luz(1);   out.dia = band();
    game.luz(0.3); out.oscuro = band();
    game.luz(1);   out.vuelta = band();

    out.ratio = suma(out.dia) ? +(suma(out.oscuro) / suma(out.dia)).toFixed(2) : 0;
    out.vuelveExacto = d(out.vuelta, out.dia);
    out.clampAlto = game.luz(5);
    out.clampBajo = game.luz(-1);
    out.reset = (game.luz('reset'), game.luz());
    game.luz('reset'); mc.volar = false;
    return out;
  });

  console.log('\n§1 · bajar la luz oscurece el terreno EN PROPORCIÓN (0.3 ⇒ ~30% de brillo)');
  console.log('    día ' + JSON.stringify(r.dia) + '  luz(0.3) ' + JSON.stringify(r.oscuro));
  ok(r.ratio > 0.2 && r.ratio < 0.45, 'game.luz(0.3) deja el suelo a ~1/3 de brillo', 'ratio=' + r.ratio);

  console.log('\n§2 · game.luz(1) devuelve la pantalla EXACTA (por defecto no cambia nada)');
  ok(r.vuelveExacto === 0, 'volver a luz 1 restaura el fotograma al pixel', 'Δ=' + r.vuelveExacto);

  console.log('\n§3 · el mando se comporta');
  ok(r.clampAlto === 1, 'satura arriba en 1 (pleno día)', String(r.clampAlto));
  ok(r.clampBajo === 0, 'y abajo en 0 (negro)', String(r.clampBajo));
  ok(r.reset === 1, "'reset' vuelve a 1", String(r.reset));

  console.log('\n§4 · sin excepciones en la página');
  ok(errores.length === 0, 'ninguna', errores.slice(0, 3).join(' | '));

  console.log(fallos ? ('\n' + fallos + ' FALLO(S)') : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
