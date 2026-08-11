// @area: render
// @necesita: servidor, playwright
// REQ-XR1 · Rayos-X marca con ARISTAS, no con relleno.
//
// El fallo que este test impide que vuelva: el volumen se pintaba como cubos macizos con alfa
// constante 0.38, DEPTH_TEST apagado y CULL_FACE apagado. Con eso la opacidad se COMPONE (1−0.62^k,
// y cada caja cuenta DOS capas por las caras de entrada y salida), así que tres bloques en la línea
// de visión saturaban a blanco. Medido sobre el circuito del dueño antes del arreglo: la pasada
// tapaba el 92,2 % de la pantalla. Bajar el alfa no lo arregla, solo mueve dónde satura.
//
// ⚠️ El riesgo está INVERTIDO respecto al ticket original: ahora el fallo posible es «no se ve
// nada». Por eso hay cota por arriba Y por abajo — un contorno que no tapa pero tampoco marca no
// sirve para lo que el dueño quería, que era distinguir las piezas en una captura.
//
// No planta nada: solo mira y lee píxeles.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', {}, { timeout: 180000 });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(() => {
    const out = {};

    // ── 1 · la geometría es de aristas ────────────────────────────────────────────────────────
    // 24 vértices por caja = 12 aristas × 2. Con relleno serían 36 (12 triángulos × 3).
    const vol = []; mcXrayVolume(vol);
    out.verts = vol.length / 7;
    out.esAristas = out.verts > 0 && out.verts % 24 === 0;
    // Y cada segmento es paralelo a un eje: dos de las tres coordenadas coinciden. Un triángulo
    // suelto colado aquí daría segmentos en diagonal.
    let diagonales = 0;
    for (let i = 0; i < vol.length; i += 14) {
      const iguales = (vol[i] === vol[i + 7]) + (vol[i + 1] === vol[i + 8]) + (vol[i + 2] === vol[i + 9]);
      if (iguales !== 2) diagonales++;
    }
    out.diagonales = diagonales;

    // Las cotas son las EXACTAS de la celda: si volviera el margen 0.03/0.97, dos celdas vecinas
    // dibujarían dos líneas paralelas donde debería verse una sola.
    out.enRejilla = vol.every((v, i) => (i % 7) > 2 || Number.isInteger(v * 16));

    // ── 2 · lo que la pasada hace en pantalla ─────────────────────────────────────────────────
    // Plantarse sobre el suelo: el volumen es 7×5×7 alrededor de los PIES, así que mirando al
    // horizonte no entraría nada en cuadro.
    const cx = Math.floor(mc.pos[0]), cz = Math.floor(mc.pos[2]);
    let sy = 0; for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(cx, y, cz)]) { sy = y; break; }
    mc.pos[1] = sy + 1; mc.pitch = -0.45;
    const gl = mc.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const grab = () => { mcRender(); const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    const xr = mc.xray;
    mc.xray = false; const sin = grab();
    mc.xray = true;  const con = grab();
    mc.xray = xr;    mcRender();

    let tocados = 0, sumSin = 0, sumCon = 0;
    const lum = (px, i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    for (let i = 0; i < sin.length; i += 4)
      if (sin[i] !== con[i] || sin[i + 1] !== con[i + 1] || sin[i + 2] !== con[i + 2]) {
        tocados++; sumSin += lum(sin, i); sumCon += lum(con, i);
      }
    out.pct = 100 * tocados / (w * h);
    out.lumSin = sumSin / (tocados || 1);
    out.lumCon = sumCon / (tocados || 1);
    return out;
  });

  console.log('\nLa geometría del volumen');
  ok('son aristas: 24 vértices por caja, no 36', r.esAristas, r.verts + ' vértices');
  ok('y todos los segmentos van paralelos a un eje', r.diagonales === 0, r.diagonales + ' diagonales');
  ok('las cajas caen en la rejilla, sin margen que duplique líneas', r.enRejilla);

  console.log('\nLo que tapa en pantalla');
  // Antes del arreglo: 92,2 % sobre el circuito del dueño. Aquí la escena es otra, pero el orden de
  // magnitud es el que importa — un relleno saturado no baja del 50 % con el volumen en cuadro.
  ok('no tapa la escena (muy por debajo del relleno saturado)', r.pct < 20, r.pct.toFixed(1) + ' % de píxeles');
  ok('…pero SÍ se ve: no es un contorno invisible', r.pct > 0.3, r.pct.toFixed(1) + ' % de píxeles');
  ok('no blanquea lo que marca', r.lumCon < 235, 'luminancia ' + r.lumSin.toFixed(0) + ' → ' + r.lumCon.toFixed(0));

  ok('sin errores de pagina', errores.length === 0, errores.join(' · '));
  await b.close();
  console.log(fallos ? '\n' + fallos + ' fallos' : '\ntodo ok');
  process.exit(fallos ? 1 : 0);
})();