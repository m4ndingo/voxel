// @area: mundo
// @necesita: servidor, playwright
// SONDA: ¿se solapan DOS reconstrucciones de paleta cuando se plantan de golpe la pieza recta y sus
// variantes giradas en un mapa que no tenía ninguna de las tres?
//
// La sospecha (2026-08-28) es una CARRERA, no un orden mal puesto:
//   · `mcAddBlock` tiene un camino rápido para las variantes (`mcAltaVariante`) que exige que la BASE
//     ya esté en `mc.blockKey` y marcada fina. Mientras la base se está horneando, `mc.blockKey` está
//     VACÍO (mcBuildPaletteImpl lo vacía en su línea 1), así que la variante no encuentra la base…
//   · …y se va por el camino largo: otro `mcBuildPalette` EN PARALELO. Las dos hornadas terminan con
//     `mc.finoRejilla = fino` (app.js:9750), su tabla local: gana la última en acabar y la otra tabla,
//     con o sin los ids girados, se pierde.
// Se mide el solape y quién escribe la última tabla; no se toca nada del motor.
//
//   node tests/probe_paleta_carrera.js [url] [pieza]
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty';
const CANDIDATOS = process.argv[3] ? [process.argv[3]]
  : ['seiheki', 'minisilla', 'chokurei', 'escalera', 'llama-decoracion', 'mini-lampara', 'rejilla'];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active && typeof game!=="undefined"', null, { timeout: 180000 });
  await page.waitForTimeout(6000);

  const P = (t, o) => console.log('\n' + t + '\n   ' + JSON.stringify(o));

  const elegido = await page.evaluate(cands => {
    for (const n of cands) {
      const k = mcClaveDeNombre(n);
      if (!k || !/^hab:/.test(k)) continue;
      if ((mc.blockKey || []).some(b => mcClaveBase(String(b)) === k)) continue;
      return { nombre: n, clave: k };
    }
    return null;
  }, CANDIDATOS);
  P('0 · pieza que este mapa nunca ha tenido', elegido);
  if (!elegido) { console.log('\n⛔ sin candidato limpio.'); await browser.close(); return; }

  // Sondas de solo lectura sobre las dos funciones que se sospechan.
  await page.evaluate(() => {
    window.__diario = [];
    window.__pico = 0;
    let vivas = 0;
    const bp = window.mcBuildPalette;
    window.mcBuildPalette = function (...a) {
      const n = ++vivas; if (n > window.__pico) window.__pico = n;
      const t0 = performance.now();
      window.__diario.push({ ev: 'paleta:entra', vivas: n, bloques: mc.blocks.length, t: Math.round(t0) });
      const r = bp.apply(this, a);
      return Promise.resolve(r).finally(() => {
        vivas--;
        window.__diario.push({ ev: 'paleta:sale', vivas, bloques: mc.blocks.length, ms: Math.round(performance.now() - t0) });
      });
    };
    const av = window.mcAltaVariante;
    if (typeof av === 'function') window.mcAltaVariante = async function (vk) {
      const base = mcClaveBase(vk), idB = mc.blockKey.indexOf(base);
      const r = await av.apply(this, arguments);
      window.__diario.push({ ev: 'variante', clave: vk, idBase: idB, salida: r });
      return r;
    };
  });

  const C = await page.evaluate(k => {
    const x = Math.floor(mc.pos[0]), y = Math.floor(mc.pos[1]), z = Math.floor(mc.pos[2]) - 5;
    setVoxel(x + 1, y, z, k);                    // RECTA
    setVoxel(x - 1, y, z, mcClaveConOri(k, 2));  // @2
    setVoxel(x - 3, y, z, mcClaveConOri(k, 3));  // @3
    window.__R = [x + 1, y, z]; window.__G = [x - 1, y, z]; window.__G3 = [x - 3, y, z];
    return { recta: window.__R, girada2: window.__G, girada3: window.__G3 };
  }, elegido.clave);
  P('1 · puestas las tres seguidas', C);
  await page.waitForTimeout(9000);

  P('2 · diario de la paleta (pico>1 = SE SOLAPAN)', await page.evaluate(() => ({
    pico: window.__pico, diario: window.__diario
  })));

  P('3 · cómo ha quedado cada una', await page.evaluate(() => {
    const mira = c => {
      const id = mc.grid[mcIdx(c[0], c[1], c[2])], k = id ? mc.blockKey[id] : null;
      return { id, clave: k, fino: !!(mc.finoRejilla && mc.finoRejilla[id]), geo: !!(mc._geoFina && mc._geoFina[id]) };
    };
    return {
      recta: mira(window.__R), girada2: mira(window.__G), girada3: mira(window.__G3),
      largoFinoRejilla: mc.finoRejilla ? mc.finoRejilla.length : null,
      bloques: mc.blocks.length
    };
  }));

  console.log('\n4 · se recoge lo plantado');
  console.log('   ' + JSON.stringify(await page.evaluate(() => {
    let n = 0;
    for (const c of [window.__R, window.__G, window.__G3]) if (mc.grid[mcIdx(c[0], c[1], c[2])]) { mcSetBlock(c[0], c[1], c[2], 0); n++; }
    if (typeof mcRemeshAround === 'function') mcRemeshAround(window.__G[0], window.__G[1], window.__G[2]);
    if (typeof mcScheduleSave === 'function') mcScheduleSave();
    return { recogidos: n };
  })));
  await page.waitForTimeout(5000);
  await browser.close();
})();
