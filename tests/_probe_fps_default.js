// Sonda de diagnóstico (BUG de FPS en /map/default). NO escribe nada: todas las escrituras al mapa
// se abortan desde Playwright, así que abrir el mapa aquí no puede tocar el mundo del dueño.
// Envuelve `gl.drawArrays` y agrupa las llamadas POR QUIÉN LAS HACE (la pila), que es lo que no
// cuenta `game.perfDump()`: él dice cuántas hay, no de dónde salen.
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/default';
const FRAMES = +(process.argv[3] || 8);

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.log('PAGEERROR', String(e)));

  // ⛔ El cinturón: ni un byte al mapa del dueño.
  await p.route('**/api/mundo**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
  await p.route('**/api/mapa**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));

  await p.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active', null, { timeout: 240000 });
  // El mallado va por tandas: medir antes de que se estabilice cuenta los chunks a medio subir.
  let prev = -1, quieto = 0;
  for (let i = 0; i < 120 && quieto < 6; i++) {
    await p.waitForTimeout(1000);
    const n = await p.evaluate(() => (mc.chunks ? mc.chunks.size : 0));
    quieto = (n === prev) ? quieto + 1 : 0;
    prev = n;
    process.stdout.write('\r  chunks=' + n + ' (quieto ' + quieto + ')   ');
  }
  console.log('');

  const r = await p.evaluate((FRAMES) => new Promise((listo) => {
    const gl = mc.gl;
    const cubos = new Map();
    const orig = gl.drawArrays.bind(gl);
    let vivo = true;
    gl.drawArrays = function (mode, first, count) {
      if (vivo) {
        // La 3ª línea de la pila es quien llamó a drawArrays (0=Error, 1=este envoltorio).
        const pila = (new Error().stack || '').split('\n');
        const quien = (pila[2] || '?').trim().replace(/^at\s+/, '').replace(/\s*\(.*$/, '');
        const c = cubos.get(quien) || { n: 0, v: 0 };
        c.n++; c.v += count | 0;
        cubos.set(quien, c);
      }
      return orig(mode, first, count);
    };
    const t0 = performance.now();
    let n = 0;
    const tic = () => {
      if (++n < FRAMES) return requestAnimationFrame(tic);
      vivo = false;
      const ms = performance.now() - t0;
      gl.drawArrays = orig;
      listo({
        frames: n, ms: Math.round(ms), fps: +(n * 1000 / ms).toFixed(1),
        porFrame: [...cubos.entries()]
          .map(([q, c]) => ({ quien: q, draws: +(c.n / n).toFixed(1), vertices: Math.round(c.v / n) }))
          .sort((a, c) => c.draws - a.draws),
        chunks: mc.chunks ? mc.chunks.size : null,
        capas: mc.capa ? mc.capa.size : null,
        renderDist: mc.renderDist,
        estructuras: mc.structures ? mc.structures.length : null,
        notas: mc.notes ? mc.notes.length : null,
        agentes: mc.agents ? mc.agents.length : null,
        esqueletos: (window.game && game.esqueletos && game.esqueletos.lista) ? game.esqueletos.lista().length : null,
        geoFina: mc._geoFina ? Object.keys(mc._geoFina).length : null,
      });
    };
    requestAnimationFrame(tic);
  }), FRAMES);

  console.log(URL);
  console.log(JSON.stringify(r, null, 1));
  const tot = r.porFrame.reduce((a, x) => ({ d: a.d + x.draws, v: a.v + x.vertices }), { d: 0, v: 0 });
  console.log('\nTOTAL por frame: ' + tot.d.toFixed(0) + ' draws · ' + tot.v.toLocaleString('es') + ' vértices');
  await b.close();
})();
