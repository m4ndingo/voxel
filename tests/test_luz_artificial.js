// @area: render
// @necesita: servidor, playwright
// REQ-ENV4 · La luz artificial (antorchas) alumbra de noche también al aire libre.
//
// Antes, `game.luz` (modo noche) apagaba TODO por igual y una antorcha no destacaba en la calle. Ahora
// la luz de bloque va en una textura 3D que el shader lee por posición, y la exposición de noche la
// RESISTE: `mix(uExpo, 1.0, luzDeBloque)`. Se mide la PANTALLA (readPixels) en dos sitios de la misma
// pared: pegado a una antorcha (real, un voxel emisivo `*#…`) y lejos de ella.
//
// La prueba de que funciona: al bajar la luz, el sitio con antorcha **retiene** su brillo mientras el
// lejano se oscurece. Es una textura 3D ⇒ solo WebGL2; el guardián corre bajo SwiftShader (WebGL2).
//
//   node tests/test_luz_artificial.js [url]      por defecto http://localhost:8500/map/test
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
  await p.waitForFunction('window.game && game.luz && game.setVoxel', null, { timeout: 120000 });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    out.gl2 = mc.gl2;
    const gl = mc.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const esperar = ms => new Promise(res => setTimeout(res, ms));
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const tocadas = new Map();
    const set = (x, y, z, m) => { if (!mcInside(x, y, z)) return; const c = x + ',' + y + ',' + z; if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]); game.setVoxel(x, y, z, m); };

    const X = (mc.dim.x / 2 | 0) - 16, Z = (mc.dim.z / 2) | 0, Y = 16;
    // suelo + pared larga al fondo (+z). La «antorcha» se planta como luz de bloque directa en mc.blockLight
    // (una celda con nivel alto y su halo): así se prueba EXACTAMENTE lo que añade REQ-ENV4 —la textura 3D y el
    // shader—, sin depender de cómo se defina un material emisivo. La difusión real (mcComputeBlockLight) es
    // preexistente y tiene sus propios tests.
    for (let i = -2; i <= 34; i++) for (let k = -2; k <= 3; k++) set(X + i, Y - 1, Z + k, 'roca');
    for (let i = -2; i <= 34; i++) for (let j = 0; j <= 6; j++) set(X + i, Y + j, Z + 3, 'roca');
    mcRemeshAround(X - 4, Z - 4, X + 36, Z + 6);
    if (!mc.blockLight && typeof mcComputeBlockLight === 'function') mcComputeBlockLight();
    if (!mc.blockLight) { out.errs.push('sin mc.blockLight'); return out; }
    const MAXL = 15, tx = X, ty = Y + 2, tz = Z + 2;   // antorcha pegada a la pared, en un extremo
    for (let dx = -6; dx <= 6; dx++) for (let dy = -5; dy <= 6; dy++) for (let dz = -6; dz <= 1; dz++) {
      const x = tx + dx, y = ty + dy, z = tz + dz; if (!mcInside(x, y, z)) continue;
      const d = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
      const lv = Math.max(0, MAXL - d * 2); if (lv > 0) mc.blockLight[mcIdx(x, y, z)] = lv;
    }
    mc.hasGlow = true; mc._blkTexDirty = true;
    await esperar(200);

    out.hasGlow = mc.hasGlow;
    out.maxBL = (() => { let m = 0; for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const x = X + dx, y = Y + dy, z = Z + 1; if (mcInside(x, y, z)) m = Math.max(m, mc.blockLight ? mc.blockLight[mcIdx(x, y, z)] : 0); } return m; })();

    const brillo = () => {
      mcRender();
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let s = 0, n = 0;
      for (let y = (h * 0.35) | 0; y < (h * 0.65) | 0; y++) for (let x = (w * 0.4) | 0; x < (w * 0.6) | 0; x++) { const i = (y * w + x) * 4; s += buf[i] + buf[i + 1] + buf[i + 2]; n++; }
      return s / n;
    };
    const mirar = (px) => { mc.volar = true; mc.pos = [px, Y + 2, Z - 3]; mc.vel = [0, 0, 0]; mc.yaw = Math.PI; mc.pitch = -0.02; mc.onGround = false; };

    // pegado a la antorcha
    mirar(X);
    game.luz(1); out.cercaDia = +brillo().toFixed(0);
    game.luz(0.2); out.cercaNoche = +brillo().toFixed(0);
    // lejos (otro extremo de la pared, sin luz de bloque)
    mirar(X + 30);
    game.luz(1); out.lejosDia = +brillo().toFixed(0);
    game.luz(0.2); out.lejosNoche = +brillo().toFixed(0);

    out.retCerca = +(out.cercaNoche / Math.max(1, out.cercaDia)).toFixed(2);
    out.retLejos = +(out.lejosNoche / Math.max(1, out.lejosDia)).toFixed(2);

    game.luz('reset'); mc.volar = false;
    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    if (typeof mcComputeBlockLight === 'function') mcComputeBlockLight();
    mcRemeshAround(X - 4, Z - 4, X + 36, Z + 6);
    return out;
  });

  console.log('WebGL2: ' + r.gl2);
  console.log('\n§1 · hay luz de bloque alrededor de la antorcha (y corremos en WebGL2)');
  ok(r.gl2 === true, 'el guardián corre en WebGL2 (la textura 3D lo necesita)');
  ok(r.hasGlow === true && r.maxBL > 0, 'la luz de bloque llega a la pared', 'maxBL=' + r.maxBL);

  console.log('\n§2 · de noche, la antorcha RESISTE el apagado; la calle a oscuras no');
  console.log('    cerca ' + r.cercaDia + '→' + r.cercaNoche + ' (ret ' + r.retCerca + ')   ·   lejos ' + r.lejosDia + '→' + r.lejosNoche + ' (ret ' + r.retLejos + ')');
  ok(r.retLejos < 0.4, 'lejos de la antorcha la noche oscurece de verdad', 'retención ' + r.retLejos);
  ok(r.retCerca > r.retLejos + 0.2, 'pegado a la antorcha se retiene MUCHO más el brillo (la antorcha alumbra)',
    'cerca ' + r.retCerca + ' vs lejos ' + r.retLejos);
  ok(r.cercaNoche > r.lejosNoche, 'de noche, el sitio con antorcha acaba más brillante que el lejano', r.cercaNoche + ' vs ' + r.lejosNoche);

  console.log('\n§3 · sin excepciones en la página');
  ok(errores.length === 0, 'ninguna', errores.slice(0, 3).join(' | '));

  console.log(fallos ? ('\n' + fallos + ' FALLO(S)') : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
