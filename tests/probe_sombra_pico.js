// @area: render
// @necesita: servidor, playwright
// SONDA (no guardián): reproduce las fotos #118/#119 (mapa `empty`, de DÍA, pico de piedra en la
// mano) y comprueba si al moverse MÍNIMAMENTE desaparece la sombra que proyecta el pico.
//
// El pico lleva 6 voxeles emisivos de nivel 15 (`reparto.mano: 6` en la ficha de las dos fotos), así
// que su «sombra» es la zona de hierba que su propia luz NO alcanza. La pregunta es si esa zona
// PARPADEA al mover el emisor una fracción de bloque — que es justo lo que la Ley promete que no
// pasa (Mandamiento 5: la posición fina va a la siembra) y lo que el dueño está viendo.
//
// Se barren desplazamientos diminutos y en cada paso se cuentan los PÍXELES OSCUROS del cuadrante
// donde cae el pico. El pico en sí no se mueve respecto a la cámara, así que su propia silueta
// aporta una constante: todo lo que VARÍE en esa cuenta es la sombra apareciendo y desapareciendo.
//
//   node tests/probe_sombra_pico.js [url]
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty';
const FOTO = {                                   // ficha de la foto #118
  pos: [43.04, 15, 40.65], yaw: -40, pitch: -52,
  tool: 'asset:assets/pico-de-piedra-mango-azul.vox.json',
  luzGlobal: 0.85, glowFocus: 0.2, glowGain: 0.6, glowLevel: 15
};
const PASO = 1 / 32;         // paso fino (2 subniveles), pero el barrido CRUZA fronteras de celda:
const PASOS = 44;            // ⇒ 1,37 bloques desde x=43,04 · dentro de la celda 43, la frontera, y la 44

const SNIPPET = execFileSync('python3', [__dirname + '/../herramientas/crea_snp_luz_ley.py', '--ver'],
  { encoding: 'utf8', cwd: __dirname + '/..' });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"', null, { timeout: 180000 });
  await page.waitForTimeout(6000);

  const escena = await page.evaluate(f => {
    mc.yaw = f.yaw * Math.PI / 180; mc.pitch = f.pitch * Math.PI / 180;
    mc.hotbar[mc.sel] = f.tool;                       // el pico en la mano, como en la foto
    game.luzGlobal = f.luzGlobal; game.glowFocus = f.glowFocus;
    game.glowGain = f.glowGain; game.glowLevel = f.glowLevel;
    window.__pon = dx => {                            // desplazamiento diminuto en X
      mc.pos[0] = f.pos[0] + dx; mc.pos[1] = f.pos[1]; mc.pos[2] = f.pos[2];
      if (mc.vel) { mc.vel[0] = mc.vel[1] = mc.vel[2] = 0; }
    };
    window.__pon(0);
    // Cuenta cuántos horneados REALES ocurren (no cuántos se piden): la firma se salta los que no
    // hacen falta, y sin este contador no se sabe si lo que cambia en pantalla viene de un rehorneado.
    // Hay que re-envolver TRAS cada on()/off(): el snippet reasigna window.mcDynBake y se lleva esto.
    window.__bakes = 0;
    window.__cuenta = () => {
      const orig = window.mcDynBake;
      window.mcDynBake = function () { const s = mc._dynSig; const r = orig.apply(this, arguments); if (mc._dynSig !== s) window.__bakes++; return r; };
    };
    window.__cuenta();
    return { tool: mc.hotbar[mc.sel] };
  }, FOTO);
  console.log('escena ·', JSON.stringify(escena));

  await page.evaluate(async code => {
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    await new AsyncFunction('opts', 'args', code)({}, {});
  }, SNIPPET);

  // El pico cae abajo-derecha en este encuadre. Se cuentan los píxeles OSCUROS de ese cuadrante.
  await page.evaluate(() => {
    window.__mide = () => {
      const cv = mc.canvas, off = document.createElement('canvas');
      off.width = cv.width; off.height = cv.height;
      off.getContext('2d').drawImage(cv, 0, 0);
      const W = cv.width, H = cv.height;
      const d = off.getContext('2d').getImageData(W >> 1, H >> 1, W >> 1, (H >> 1) - 40).data;
      const lum = [];
      for (let i = 0; i < d.length; i += 4) lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      const orden = [...lum].sort((a, b) => a - b), med = orden[orden.length >> 1];
      let oscuros = 0, suma = 0;
      for (const v of lum) { suma += v; if (v < med * 0.75) oscuros++; }   // sombra = notablemente bajo la mediana
      // Y el CAMPO en la celda de hierba que el dueño apunta en las dos fichas: [43,14,39].
      const nivelSuelo = mcDynNivel(43, 15, 39);
      return { oscuros, lumMedia: +(suma / lum.length).toFixed(2), nivelSuelo, bakes: window.__bakes };
    };
  });

  const res = {};
  // SINLUZ es el CONTROL y sin él la sonda no vale: el pico se balancea al andar, así que una
  // oscilación en la cuenta de píxeles oscuros puede ser su propia silueta y no la sombra. Si el
  // vaivén sigue ahí con la luz dinámica apagada, no lo causa ningún bake.
  for (const cual of ['LEY', 'LUT', 'SINLUZ']) {
    await page.evaluate(c => {
      game.luzDinamica = (c !== 'SINLUZ');
      if (c !== 'SINLUZ') { c === 'LEY' ? game.luzLey.on() : game.luzLey.off(); }
      window.__cuenta();
    }, cual);
    await page.waitForTimeout(2000);
    const serie = [];
    for (let i = 0; i <= PASOS; i++) {
      await page.evaluate(dx => window.__pon(dx), i * PASO);
      await page.waitForTimeout(450);
      serie.push(await page.evaluate(() => window.__mide()));
    }
    const osc = serie.map(s => s.oscuros), niv = serie.map(s => s.nivelSuelo);
    res[cual] = {
      // Si la sombra desaparece y vuelve, esta cuenta salta; si es estable, apenas se mueve.
      oscuros_min: Math.min(...osc), oscuros_max: Math.max(...osc),
      oscuros_salto: Math.max(...osc) - Math.min(...osc),
      oscuros_relativo: +((Math.max(...osc) - Math.min(...osc)) / Math.max(1, Math.max(...osc))).toFixed(3),
      nivelSuelo_min: Math.min(...niv), nivelSuelo_max: Math.max(...niv),
      horneados_en_el_barrido: serie[serie.length - 1].bakes - serie[0].bakes,
      serie_oscuros: osc, serie_nivelSuelo: niv
    };
    // Los DOS extremos, en imagen: si la sombra es lo que va y viene, se ve al ponerlas al lado.
    for (const [etq, idx] of [['claro', osc.indexOf(Math.min(...osc))], ['oscuro', osc.indexOf(Math.max(...osc))]]) {
      await page.evaluate(dx => window.__pon(dx), idx * PASO);
      await page.waitForTimeout(700);
      await page.screenshot({ path: 'data/fotos/mini/_probe_pico_' + cual + '_' + etq + '.png' });
    }
    res[cual].pasos_de_las_capturas = { claro: osc.indexOf(Math.min(...osc)), oscuro: osc.indexOf(Math.max(...osc)) };
  }
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
})();
