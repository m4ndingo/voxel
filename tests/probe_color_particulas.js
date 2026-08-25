// @area: render
// @necesita: servidor, playwright
// SONDA (no guardián): comprueba que `game.luzLey.color()` hace que las partículas de la capa
// `game.voxelesUI` (las luciérnagas del santuario) alumbren de SU color y no del cálido de la casa.
//
// Se mide EL CAMPO, no píxeles: para cada celda encendida de `mc.dynLight` se saca su color
// normalizado (rgb/a), que es exactamente lo que el shader lee en `mcLitGlow` como `rgbCol`. Sin
// color propio, `mcLuzSiembra` reparte el cálido (1 · 0,85 · 0,50); con él, debe irse hacia el color
// de la luciérnaga. El control es `color(false)`: tiene que dar el cálido clavado.
//
//   node tests/probe_color_particulas.js [url]
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/santuario-zen';
const SNIPPET = execFileSync('python3', [__dirname + '/../herramientas/crea_snp_luz_ley.py', '--ver'],
  { encoding: 'utf8', cwd: __dirname + '/..' });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"', null, { timeout: 180000 });
  await page.waitForTimeout(12000);

  await page.evaluate(async code => {
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    await new AsyncFunction('opts', 'args', code)({}, {});
    // Color medio del CAMPO, normalizado igual que lo hace el shader (rgb/a). Se pesa por `a` para
    // que las celdas casi apagadas no metan ruido: son las que peor resuelven el cociente.
    window.__color = () => {
      const D = mc.dynLight; if (!D) return null;
      let r = 0, g = 0, b = 0, peso = 0, celdas = 0;
      for (let i = 0; i < D.vol; i++) {
        const a = D.BL[i * 4 + 3]; if (a < 4) continue;
        r += D.BL[i * 4] / a * a; g += D.BL[i * 4 + 1] / a * a; b += D.BL[i * 4 + 2] / a * a;
        peso += a; celdas++;
      }
      if (!peso) return null;
      const n = [r / peso, g / peso, b / peso];
      return { rgbNormalizado: n.map(v => +v.toFixed(3)), celdas,
               // El cálido de la casa es (1 · 0,85 · 0,50): la distancia a él dice si cambió algo.
               distanciaAlCalido: +Math.hypot(n[0] - 1, n[1] - 0.85, n[2] - 0.5).toFixed(3) };
    };
  }, SNIPPET);

  // El color que de verdad tienen las luciérnagas, leído de mc.voxUI: sin esto no se sabe hacia
  // dónde DEBERÍA irse el campo, y la sonda sólo diría «cambió», que no es comprobar nada.
  const real = await page.evaluate(() => {
    if (!mc.voxUI) return null;
    const out = {};
    for (const [nombre, m] of mc.voxUI) {
      let r = 0, g = 0, b = 0, n = 0;
      for (const [, c] of m) { r += c[0]; g += c[1]; b += c[2]; n++; }
      if (n) out[nombre] = { voxeles: n, color: [+(r / n).toFixed(3), +(g / n).toFixed(3), +(b / n).toFixed(3)] };
    }
    return out;
  });
  console.log('color REAL de cada grupo de voxelesUI ·', JSON.stringify(real));

  const res = {};
  for (const [etq, v] of [['color_OFF', false], ['color_50%', 0.5], ['color_ON', 1]]) {
    await page.evaluate(x => { game.luzLey.on(); game.luzLey.color(x); }, v);
    await page.waitForTimeout(2500);
    const d = await page.evaluate(() => {
      const g = game.luzLey.diag();
      return { campo: window.__color(), pintadas: g.semillasPintadasConSuColor,
               sinColor: g.semillasSinColorPropio, semillas: g.semillas };
    });
    res[etq] = d;
  }
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
})();
