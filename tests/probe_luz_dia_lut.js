// @area: render
// @necesita: servidor, playwright
// SONDA (no guardián): reproduce el encuadre de la foto #115 (mapa `empty`, de DÍA) y comprueba que
// el snippet `parche-luz-dia-ley` quita el manchón de luz que la Radiance Cascades LUT deja a los
// pies del jugador a pleno sol.
//
// El snippet se carga TAL CUAL lo cargaría el motor (`new AsyncFunction(code)`), y los dos
// escenarios se ALTERNAN varias rondas (la 1ª toma tras cargar no vale) midiendo:
//   · CERCA — franja de suelo DENTRO de la caja de luz (donde debe notarse)
//   · LEJOS — franja de suelo junto al horizonte, FUERA de la caja (control: si esto también
//             cambia, lo que se movió es la escena entera y la medida no vale nada)
//
//   node tests/probe_luz_dia_lut.js [url]
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty';
const FOTO = { pos: [48.5, 15, 48.5], yaw: 69, pitch: -21 };
const RONDAS = 3;

// El código del snippet, generado en el momento (así la sonda prueba lo que se va publicar).
const SNIPPET = execFileSync('python3', [__dirname + '/../herramientas/crea_snp_luz_ley.py', '--ver'],
  { encoding: 'utf8', cwd: __dirname + '/..' });

const mediana = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"', null, { timeout: 120000 });
  await page.waitForTimeout(6000);

  await page.evaluate(f => {
    mc.pos[0] = f.pos[0]; mc.pos[1] = f.pos[1]; mc.pos[2] = f.pos[2];
    mc.yaw = f.yaw * Math.PI / 180; mc.pitch = f.pitch * Math.PI / 180;
    window.__mide = () => {
      const D = mc.dynLight;
      let maxA = 0, nz = 0;
      if (D) for (let i = 0; i < D.vol; i++) { const a = D.BL[i * 4 + 3]; if (a) { nz++; if (a > maxA) maxA = a; } }
      const cv = mc.canvas, off = document.createElement('canvas');
      off.width = cv.width; off.height = cv.height;
      const c2 = off.getContext('2d'); c2.drawImage(cv, 0, 0);
      const W = cv.width, H = cv.height;
      const franja = (y0, y1) => {
        const d = c2.getImageData(0, y0, W, y1 - y0).data;
        let r = 0, g = 0, b = 0; const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        return [+(r / n).toFixed(2), +(g / n).toFixed(2), +(b / n).toFixed(2)];
      };
      return {
        maxByte: maxA, celdas: nz, caja: D ? [D.W, D.H, D.P] : null,
        cerca: franja(H - 200, H - 60),          // suelo a los pies, dentro de la caja
        lejos: franja((H >> 1) - 40, (H >> 1))   // suelo junto al horizonte, control fuera de la caja
      };
    };
  }, FOTO);

  // Se carga como lo carga el motor: el cuerpo de un AsyncFunction (web/app.js:4586).
  const arranque = await page.evaluate(async code => {
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    await new AsyncFunction('opts', 'args', code)({}, {});
    return { hayApi: !!(window.game && game.luzLey), diag: game.luzLey && game.luzLey.diag() };
  }, SNIPPET);
  console.log('snippet cargado ·', JSON.stringify({ hayApi: arranque.hayApi, bake: arranque.diag.bake,
    dentroDeLaLey: arranque.diag.dentroDeLaLey, hazRespetado: arranque.diag.hazRespetado }));

  // El emisor de la mano PULSA (las semillas cambian de color solas), y los dos bakes no re-siembran
  // con la misma cadencia — la LUT no mete el color en su firma y la Ley sí. Una toma suelta cae en
  // una fase cualquiera y no mide nada: hay que tomar VARIAS por escenario, alternar rondas, y
  // quedarse con la MEDIANA de la diferencia CERCA−LEJOS, que además cancela cualquier deriva global.
  const tomas = { LEY: [], LUT: [] };
  const diags = {};
  for (let ronda = 0; ronda <= RONDAS; ronda++) {
    for (const cual of ['LEY', 'LUT']) {
      diags[cual] = await page.evaluate(c => (c === 'LEY' ? game.luzLey.on() : game.luzLey.off()), cual);
      await page.waitForTimeout(1500);
      for (let k = 0; k < 4; k++) {
        await page.waitForTimeout(700);
        const m = await page.evaluate(() => window.__mide());
        if (ronda === 0) continue;                                   // ronda 0 = calentamiento, se tira
        m.dif = [0, 1, 2].map(i => m.cerca[i] - m.lejos[i]);          // lo que la caja de luz añade al suelo
        tomas[cual].push(m);
      }
      if (ronda === 1) await page.screenshot({ path: 'data/fotos/mini/_probe_' + cual + '.png' });
    }
  }

  const resumen = {};
  for (const cual of ['LEY', 'LUT']) {
    const t = tomas[cual], d = diags[cual];
    resumen[cual] = {
      maxByte: mediana(t.map(x => x.maxByte)), techoLegal: d.techoLegalDelByte,
      dentroDeLaLey: d.dentroDeLaLey, hazRespetado: d.hazRespetado,
      celdasConLuz: mediana(t.map(x => x.celdas)), caja: t[0].caja,
      tomas: t.length,
      cerca: [0, 1, 2].map(i => +mediana(t.map(x => x.cerca[i])).toFixed(2)),
      lejos_CONTROL: [0, 1, 2].map(i => +mediana(t.map(x => x.lejos[i])).toFixed(2)),
      // Lo que la caja de luz le añade al suelo, ya descontada la escena (mediana de CERCA−LEJOS)
      aporteDeLaCaja: [0, 1, 2].map(i => +mediana(t.map(x => x.dif[i])).toFixed(2)),
      // Dispersión del aporte entre tomas idénticas: cuánto TIEMBLA el campo con la escena quieta
      temblorDelAporte_G: +(Math.max(...t.map(x => x.dif[1])) - Math.min(...t.map(x => x.dif[1]))).toFixed(2)
    };
  }
  resumen.aporte_LUT_menos_LEY = [0, 1, 2].map(i =>
    +(resumen.LUT.aporteDeLaCaja[i] - resumen.LEY.aporteDeLaCaja[i]).toFixed(2));

  // COSTE · lo que tarda UNA siembra forzada de la caja. Ojo: no son fps. En el mundo real la
  // firma hace que esto no corra cada frame, así que es el peor caso, no el gasto por cuadro.
  resumen.ms_por_siembra_forzada = await page.evaluate(async () => {
    const out = {};
    for (const cual of ['LEY', 'LUT']) {
      cual === 'LEY' ? game.luzLey.on() : game.luzLey.off();
      const sem = mc._dynSem || [];
      const t = [];
      for (let i = 0; i < 24; i++) { mc._dynSig = null; const a = performance.now(); mcDynBake(sem); t.push(performance.now() - a); }
      t.sort((x, y) => x - y);
      out[cual] = +t[t.length >> 1].toFixed(3);   // mediana
    }
    return out;
  });
  console.log(JSON.stringify(resumen, null, 2));
  console.log('capturas -> data/fotos/mini/_probe_LEY.png · _probe_LUT.png');
  await browser.close();
})();
