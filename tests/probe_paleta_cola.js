// @area: mundo
// @necesita: servidor, playwright
// SONDA de ARREGLO (no de diagnóstico): el diagnóstico ya está hecho en `probe_paleta_carrera.js`
// —tres `mcBuildPalette` a la vez, `mc.finoRejilla` de 32 casillas para 33 bloques, y la base
// `hab:<pieza>` metida en la paleta POR TRIPLICADO—. Aquí se prueba EN CALIENTE el arreglo antes de
// tocar `app.js` (LEY DE ORO): poner las altas de material EN FILA.
//
// El arreglo es una cola de una sola posición alrededor de `mcAddBlock`. Con ella:
//   · la guarda `mc.blockKey.indexOf(key)` vuelve a servir (nadie vacía la paleta a media pregunta) ⇒
//     no hay duplicados de la base;
//   · cuando le toca a `…@2`, la base YA está dada de alta y marcada fina ⇒ `mcAltaVariante` coge su
//     camino rápido y la variante nace con su geometría (`mc.finoGeom`) y su casilla en `finoRejilla`.
//
//   node tests/probe_paleta_cola.js [url] [pieza]
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty';
const CANDIDATOS = process.argv[3] ? [process.argv[3]]
  : ['chokurei', 'seiheki', 'minisilla', 'escalera', 'llama-decoracion', 'mini-lampara', 'rejilla'];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
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
  if (!elegido) { console.log('\n⛔ sin candidato limpio: hace falta un mapa que no la tenga en su paleta.'); await browser.close(); return; }

  // ── EL PARCHE EN CALIENTE ─────────────────────────────────────────────────────────────────────
  await page.evaluate(() => {
    window.__pico = 0; let vivas = 0;
    const bp = window.mcBuildPalette;
    window.mcBuildPalette = function (...a) {
      const n = ++vivas; if (n > window.__pico) window.__pico = n;
      return Promise.resolve(bp.apply(this, a)).finally(() => { vivas--; });
    };
    const orig = window.mcAddBlock;
    let cola = Promise.resolve();
    window.mcAddBlock = function (key, name) {
      const mio = cola.catch(() => {}).then(() => orig.call(this, key, name));
      cola = mio.catch(() => {});
      return mio;
    };
  });

  const C = await page.evaluate(k => {
    const x = Math.floor(mc.pos[0]), y = Math.floor(mc.pos[1]), z = Math.floor(mc.pos[2]) - 5;
    setVoxel(x + 1, y, z, k);                        // RECTA
    setVoxel(x - 1, y, z, mcClaveConOri(k, 2));      // @2
    setVoxel(x - 3, y, z, mcClaveConOri(k, 3));      // @3
    window.__R = [x + 1, y, z]; window.__G = [x - 1, y, z]; window.__G3 = [x - 3, y, z];
    mc.pos[0] = x - 1; mc.pos[1] = y + 1; mc.pos[2] = z + 5; mc.yaw = 0; mc.pitch = -0.05;
    return { recta: window.__R, girada2: window.__G, girada3: window.__G3 };
  }, elegido.clave);
  P('1 · puestas las tres seguidas', C);
  await page.waitForTimeout(10000);

  P('2 · resultado (lo que hay que ver: pico=1, clave correcta en cada celda, fino/geo true, 1 sola base)', await page.evaluate(n => {
    const mira = c => {
      const id = mc.grid[mcIdx(c[0], c[1], c[2])], k = id ? mc.blockKey[id] : null;
      return { id, clave: k, fino: !!(mc.finoRejilla && mc.finoRejilla[id]), geo: !!(mc._geoFina && mc._geoFina[id]) };
    };
    return {
      pico: window.__pico,
      recta: mira(window.__R), girada2: mira(window.__G), girada3: mira(window.__G3),
      copiasEnPaleta: (mc.blockKey || []).filter(k => String(k) === 'hab:' + n).length,
      largoFinoRejilla: mc.finoRejilla ? mc.finoRejilla.length : null,
      bloques: mc.blocks.length
    };
  }, elegido.nombre));

  await page.screenshot({ path: '/tmp/probe_cola_antes.png' });
  const cam = await page.evaluate(() => ({ p: [...mc.pos], yaw: mc.yaw, pitch: mc.pitch }));
  await page.reload({ waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active', null, { timeout: 180000 });
  await page.waitForTimeout(9000);
  await page.evaluate(c => { mc.pos[0] = c.p[0]; mc.pos[1] = c.p[1]; mc.pos[2] = c.p[2]; mc.yaw = c.yaw; mc.pitch = c.pitch; }, cam);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/probe_cola_tras_recargar.png' });
  console.log('\n   fotos: /tmp/probe_cola_antes.png · /tmp/probe_cola_tras_recargar.png  (izq→dcha: @3 · @2 · RECTA)');

  console.log('\n3 · se recoge lo plantado');
  console.log('   ' + JSON.stringify(await page.evaluate(cs => {
    let n = 0;
    for (const c of cs) if (mc.grid[mcIdx(c[0], c[1], c[2])]) { mcSetBlock(c[0], c[1], c[2], 0); n++; }
    if (typeof mcRemeshAround === 'function') mcRemeshAround(cs[1][0], cs[1][1], cs[1][2]);
    if (typeof mcScheduleSave === 'function') mcScheduleSave();
    return { recogidos: n };
  }, [C.recta, C.girada2, C.girada3])));
  await page.waitForTimeout(5000);
  await browser.close();
})();
