// @area: render
// @necesita: servidor, playwright
// REQ-FLUID5 · La lámina de agua refleja el cielo (enfoque 1: Fresnel + color de cielo).
//
// Lo que se comprueba NO es una variable, es la PANTALLA: se lee el framebuffer con readPixels sobre
// la MISMA cámara con el reflejo encendido y apagado (game.reflejoAgua 1 vs 0), así que lo único que
// puede mover un píxel es el reflejo. La marca de «cara reflectante» se hornea en el canal emit al
// mallar (cara superior del agua = emit 2) y el uniforme uReflejo la escala en vivo, así que encender
// y apagar NO re-malla: por eso se puede medir ON/OFF sin reconstruir nada.
//
// Tres controles lo aíslan de un simple «tinte plano»:
//   · A RASANTE (mirando casi a ras del agua) el reflejo muerde → la pantalla se aclara y azula hacia
//     el color del cielo;
//   · en PICADO (a plomo) el Fresnel es ~0 → apenas cambia: prueba que depende del ÁNGULO;
//   · la LAVA no cambia ni encendida ni apagada: prueba que el reflejo es SOLO del agua.
//
// No persiste nada: bloquea los POST y restaura los bloques tocados.
//   node tests/test_reflejo_agua.js [url]        por defecto http://localhost:8500/map/test
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
function ok(cond, msg, extra) {
  if (!cond) fallos++;
  console.log((cond ? '  ok  ' : '  FALLA  ') + msg + (extra ? '   · ' + extra : ''));
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes|assets|agentes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.fluidos && game.reflejoAgua', null, { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const esperar = (ms) => new Promise(res => setTimeout(res, ms));
    const gl = mc.gl;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;

    // Color medio de una banda horizontal de la pantalla (fracciones de alto). readPixels exige que el
    // frame se haya dibujado en el MISMO evaluate, así que siempre mcRender() antes.
    function banda(y0f, y1f) {
      mcRender();
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const y0 = (h * y0f) | 0, y1 = (h * y1f) | 0;
      let r = 0, g = 0, bl = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; r += buf[i]; g += buf[i + 1]; bl += buf[i + 2]; n++; }
      return [r / n | 0, g / n | 0, bl / n | 0];
    }
    const dist = (a, c) => Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) + Math.abs(a[2] - c[2]);
    const suma = (a) => a[0] + a[1] + a[2];

    // ── una charca grande y cerrada, con fondo de roca (oscuro) para que el reflejo se lea encima ────
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const tocadas = new Map();
    const set = (x, y, z, nombre) => {
      if (!mcInside(x, y, z)) return;
      const c = x + ',' + y + ',' + z;
      if (!tocadas.has(c)) tocadas.set(c, [x, y, z, idEn(x, y, z)]);
      game.setVoxel(x, y, z, nombre);   // por NOMBRE: resuelve y autocarga el material (como test_nadar)
    };
    mcResolveMat('agua'); mcResolveMat('lava');

    const X = (mc.dim.x / 2) | 0, Z = (mc.dim.z / 2) | 0, RAD = 18;
    let Y = 8; for (let y = mc.dim.y - 1; y > 4; y--) { if (idEn(X, y, Z)) { Y = y + 1; break; } }   // sobre el suelo
    out.centro = [X, Y, Z];

    const construir = async (mat) => {
      for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
      tocadas.clear();
      for (let i = -RAD; i <= RAD; i++) for (let k = -RAD; k <= RAD; k++) set(X + i, Y, Z + k, 'roca');       // fondo
      for (let i = -RAD; i <= RAD; i++) { set(X + i, Y + 1, Z - RAD, 'roca'); set(X + i, Y + 1, Z + RAD, 'roca'); }
      for (let k = -RAD; k <= RAD; k++) { set(X - RAD, Y + 1, Z + k, 'roca'); set(X + RAD, Y + 1, Z + k, 'roca'); }
      for (let i = -RAD + 1; i <= RAD - 1; i++) for (let k = -RAD + 1; k <= RAD - 1; k++) set(X + i, Y + 1, Z + k, mat);   // lámina
      mcRemeshAround(X - RAD - 2, Z - RAD - 2, X + RAD + 2, Z + RAD + 2);
      await esperar(3000);   // que el fluido asiente y remalle
      mcRemeshAround(X - RAD - 2, Z - RAD - 2, X + RAD + 2, Z + RAD + 2);
      await esperar(500);
    };

    const mira = (px, py, pz, yaw, pitch) => { mc.volar = true; mc.pos = [px, py, pz]; mc.vel = [0, 0, 0]; mc.yaw = yaw; mc.pitch = pitch; mc.onGround = false; };
    const rasante = () => mira(X, Y + 2.6, Z - RAD + 1, Math.PI, -0.10);   // ojo bajo, mirando a través de la lámina
    const picado = () => mira(X, Y + 16, Z, 0, -1.45);                     // a plomo sobre el centro

    const medir = async (mat) => {
      await construir(mat);
      const m = {};
      rasante(); game.reflejoAgua(0); m.rasOFF = banda(0.35, 0.65); game.reflejoAgua(1); m.rasON = banda(0.35, 0.65);
      picado();  game.reflejoAgua(0); m.picOFF = banda(0.35, 0.65); game.reflejoAgua(1); m.picON = banda(0.35, 0.65);
      m.dRas = dist(m.rasOFF, m.rasON); m.dPic = dist(m.picOFF, m.picON);
      return m;
    };

    out.cielo = Array.from(mcCieloEf);
    out.agua = await medir('agua');

    // ── knobs del playground (REQ-FLUID5, a petición del dueño): sobre la MISMA charca de agua ──────
    // Se mide a rasante, que es donde el reflejo muerde. La comparación es «¿el rojo gana al azul?»:
    // el cielo por defecto es azul (b>r), así que si el reflejo se vuelve rojo, r-b sube.
    const rojez = (c) => c[0] - c[2];
    rasante(); game.reflejoAgua('reset'); game.reflejoAgua(1); out.knobSky = banda(0.35, 0.65);
    rasante(); game.reflejoColor([1, 0, 0]); out.knobColorRojo = banda(0.35, 0.65);   // reflejar rojo
    game.reflejoColor('cielo');
    rasante(); game.cieloColor('#ff2020'); out.knobCieloRojo = banda(0.35, 0.65);      // cielo rojo → reflejo rojo
    game.cieloColor('reset');
    out.rojezSky = rojez(out.knobSky); out.rojezColor = rojez(out.knobColorRojo); out.rojezCielo = rojez(out.knobCieloRojo);
    out.apiCurva = game.reflejoCurva();
    out.apiOpac = game.reflejoOpacidad();
    out.apiColorTrasReset = (game.reflejoAgua('reset'), game.reflejoColor());
    out.apiCieloTrasReset = game.cieloColor();

    out.lava = await medir('lava');
    out.agua.sumaRasOFF = suma(out.agua.rasOFF); out.agua.sumaRasON = suma(out.agua.rasON);
    out.agua.azulRasOFF = out.agua.rasOFF[2] - out.agua.rasOFF[0]; out.agua.azulRasON = out.agua.rasON[2] - out.agua.rasON[0];

    out.clampAlto = game.reflejoAgua(5);
    out.clampBajo = game.reflejoAgua(-1);
    out.reset = (game.reflejoAgua('reset'), game.reflejoAgua());

    game.reflejoAgua('reset');
    mc.volar = false;
    for (const [, v] of tocadas) mcSetBlock(v[0], v[1], v[2], v[3]);
    mcRemeshAround(X - RAD - 2, Z - RAD - 2, X + RAD + 2, Z + RAD + 2);
    return out;
  });

  if (r.errs && r.errs.length) console.log('ERRORES DE MONTAJE: ' + r.errs.join(' · '));
  const A = r.agua || {}, L = r.lava || {};
  console.log('\ncentro: ' + JSON.stringify(r.centro) + '   cielo: ' + JSON.stringify(r.cielo));

  console.log('\n§1 · el agua a rasante refleja el cielo (encender el reflejo mueve la pantalla)');
  console.log('    rasante OFF ' + JSON.stringify(A.rasOFF) + '  ON ' + JSON.stringify(A.rasON));
  ok(A.dRas > 8, 'a rasante, encender el reflejo cambia la pantalla de verdad', 'Δ=' + (A.dRas || 0));
  ok(A.sumaRasON > A.sumaRasOFF, 'y la aclara (tira al color del cielo, más claro que el fondo)',
    'ON ' + A.sumaRasON + ' vs OFF ' + A.sumaRasOFF);
  ok(A.azulRasON > A.azulRasOFF, 'y la azula (el cielo es azul)', 'b-r ON ' + A.azulRasON + ' vs OFF ' + A.azulRasOFF);

  console.log('\n§2 · en picado el Fresnel es ~0: casi no cambia (reflejo por ÁNGULO, no un velo plano)');
  console.log('    picado  OFF ' + JSON.stringify(A.picOFF) + '  ON ' + JSON.stringify(A.picON));
  ok(A.dPic < A.dRas * 0.5, 'a plomo el reflejo muerde mucho menos que a rasante',
    'picado Δ=' + (A.dPic || 0) + '  rasante Δ=' + (A.dRas || 0));

  console.log('\n§3 · la LAVA no refleja (el reflejo es solo del agua)');
  console.log('    lava rasante OFF ' + JSON.stringify(L.rasOFF) + '  ON ' + JSON.stringify(L.rasON));
  ok(L.dRas < 4, 'encender/apagar el reflejo no toca la lava', 'Δ=' + (L.dRas || 0));

  console.log('\n§4 · el tunable game.reflejoAgua se comporta');
  ok(r.clampAlto && r.clampAlto.fuerza === 1, 'satura la fuerza arriba en 1', JSON.stringify(r.clampAlto));
  ok(r.clampBajo && r.clampBajo.fuerza === 0, 'y abajo en 0 (0 = apagado, la válvula)', JSON.stringify(r.clampBajo));
  ok(r.reset && r.reset.fuerza === 0.5, 'reset vuelve al 0.5 por defecto', JSON.stringify(r.reset));

  console.log('\n§5 · los mandos nuevos: reflejoColor y cieloColor tiñen el reflejo');
  console.log('    sky ' + JSON.stringify(r.knobSky) + '  colorRojo ' + JSON.stringify(r.knobColorRojo) + '  cieloRojo ' + JSON.stringify(r.knobCieloRojo));
  ok(r.rojezColor > r.rojezSky, 'game.reflejoColor([1,0,0]) hace que el agua refleje rojo (r-b sube)',
    'r-b color ' + r.rojezColor + ' vs cielo ' + r.rojezSky);
  ok(r.rojezCielo > r.rojezSky, 'game.cieloColor rojo tiñe de rojo el reflejo (y el fondo)',
    'r-b cielo ' + r.rojezCielo + ' vs azul ' + r.rojezSky);
  ok(r.apiCurva === 5 && r.apiOpac === 1, 'reflejoCurva/reflejoOpacidad leen sus valores', 'curva ' + r.apiCurva + ' opac ' + r.apiOpac);
  ok(r.apiColorTrasReset === 'cielo', 'reset devuelve el reflejo al color del cielo', String(r.apiColorTrasReset));
  ok(JSON.stringify(r.apiCieloTrasReset) === JSON.stringify([0.549, 0.776, 1]), 'cieloColor(reset) vuelve a MC_SKY', JSON.stringify(r.apiCieloTrasReset));

  console.log('\n§6 · sin excepciones en la página');
  ok(errores.length === 0, 'ninguna', errores.slice(0, 3).join(' | '));

  console.log(fallos ? ('\n' + fallos + ' FALLO(S)') : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
