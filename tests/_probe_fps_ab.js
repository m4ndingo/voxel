// A/B de diagnóstico: cuánto cuesta el reflejo de entorno (`mcRenderRefl`) en un mapa cargado.
// Sólo lee y mide; las escrituras al mapa se abortan desde Playwright.
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8599/map/default';

const mideNFrames = (N) => new Promise((listo) => {
  const gl = mc.gl, cubos = new Map();
  const orig = gl.drawArrays.bind(gl);
  let vivo = true;
  gl.drawArrays = function (m, f, c) {
    if (vivo) {
      const pila = (new Error().stack || '').split('\n');
      const q = (pila[2] || '?').trim().replace(/^at\s+/, '').replace(/\s*\(.*$/, '');
      const x = cubos.get(q) || { n: 0, v: 0 };
      x.n++; x.v += c | 0; cubos.set(q, x);
    }
    return orig(m, f, c);
  };
  const t0 = performance.now();
  let n = 0;
  const tic = () => {
    if (++n < N) return requestAnimationFrame(tic);
    vivo = false;
    const ms = performance.now() - t0;
    gl.drawArrays = orig;
    const t = [...cubos.values()].reduce((a, x) => ({ n: a.n + x.n, v: a.v + x.v }), { n: 0, v: 0 });
    listo({
      msPorFrame: +(ms / n).toFixed(1), fps: +(n * 1000 / ms).toFixed(1),
      draws: Math.round(t.n / n), vertices: Math.round(t.v / n),
      top: [...cubos.entries()].map(([q, c]) => q + ' ' + Math.round(c.n / n) + 'd/' + Math.round(c.v / n / 1000) + 'kv')
        .slice(0, 8),
    });
  };
  requestAnimationFrame(tic);
});

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
  await p.route('**/api/mundo**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
  await p.route('**/api/mapa**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));

  await p.goto(URL, { waitUntil: 'load', timeout: 240000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active', null, { timeout: 240000 });
  let prev = -1, quieto = 0;
  for (let i = 0; i < 180 && quieto < 6; i++) {
    await p.waitForTimeout(1000);
    const n = await p.evaluate(() => (mc.chunks ? mc.chunks.size : 0));
    quieto = (n === prev) ? quieto + 1 : 0; prev = n;
  }
  console.log(URL + '  ·  chunks=' + prev + '  estructuras='
    + await p.evaluate(() => mc.structures.length) + '  geoFina='
    + await p.evaluate(() => (mc._geoFina ? Object.keys(mc._geoFina).length : 0)));

  await p.addScriptTag({ content: 'window.__mide = ' + mideNFrames.toString() + ';' });

  for (const [rotulo, prep] of [
    ['CON reflejo de entorno (como está)', () => {}],
    ['SIN reflejo de entorno  game.reflejoEntorno(0)', () => game.reflejoEntorno(0)],
    ['…y además sin sombras     game.sombras(0)', () => { if (game.sombras) game.sombras(0); }],
  ]) {
    await p.evaluate(prep);
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => window.__mide(10));
    console.log('\n' + rotulo);
    console.log('  ' + r.msPorFrame + ' ms/frame (' + r.fps + ' fps) · ' + r.draws + ' draws · '
      + r.vertices.toLocaleString('es') + ' vértices');
    console.log('  ' + r.top.join(' | '));
  }
  await b.close();
})();
