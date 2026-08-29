// @area: editor
// @necesita: servidor, playwright
// SONDA: «la vista 2D no coincide con la 3D ni con el preview de arriba a la derecha» (dueño,
// 2026-08-28). Manda la 2D, que es donde se dibujan textos y rotulos.
//
// Las tres vistas leen el MISMO `state.voxels`, asi que la discrepancia solo puede estar en COMO cada
// una lo coloca:
//   2D  (drawEdit)     px(x)=originX+x*cell, py(y)=originY+y*cell   → +X derecha, +Y abajo
//   iso (drawIsoFaces) sx=(rx-ry)*S+ox, sy=(rx+ry)*h-z*V+oy,  [rx,ry]=rotXY(x,y,state.rot)
//
// Modelo que no admite empate: cuatro celdas de colores puros, una por esquina de un 2×2×1. Se lee el
// pixel del centro de cada celda en 2D y el del centro del rombo superior en el iso, y se dice QUE
// esquina se ve donde deberia estar cada una.
//
// Dos medidas del iso a proposito:
//   · rot=0 → si ya falla aqui, el desajuste es de EJES (una vista tiene la Y al reves que la otra);
//   · rot=1 → si solo falla aqui, lo que no gira es la CARA: `isoFace` pide siempre las caras 0/2/4,
//     que son las del modelo SIN girar.
//
// ⚠️ `?noauto=1` NO es opcional: sin el, el autoarranque del editor se va al Mundo y la sonda mide el
// mapa en vez del editor (la primera version saco una foto de un bosque).
// ⚠️ Y el iso se lee en modo '3d': en 'Capas' el preview pinta encima el rombo translucido del corte
// (rgba(95,215,255,0.28)) y todos los colores salen entintados de azul.
//
//   node tests/probe_2d_vs_iso.js [url]
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/?noauto=1';

const ESQUINAS = [
  { n: 'x0y0', x: 0, y: 0, c: '#ff0000' },   // rojo
  { n: 'x1y0', x: 1, y: 0, c: '#00ff00' },   // verde
  { n: 'x0y1', x: 0, y: 1, c: '#0000ff' },   // azul
  { n: 'x1y1', x: 1, y: 1, c: '#ffff00' }    // amarillo
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof state!=="undefined" && state.voxels && typeof setMode==="function"', null, { timeout: 120000 });
  await page.waitForTimeout(3000);            // que termine de restaurarse el ultimo modelo…

  const P = (t, o) => console.log('\n' + t + '\n   ' + JSON.stringify(o, null, 1));

  const r = await page.evaluate(async esq => {
    const dormir = ms => new Promise(r => setTimeout(r, ms));
    // …y SOLO ENTONCES se planta el modelo de prueba: la restauracion del ultimo objeto llega tarde y
    // si se planta antes se lo lleva por delante (la primera version medía 300 voxels ajenos).
    const planta = () => {
      setSize(2, 2, 1);
      state.voxels.clear(); state.caras.clear();
      for (const e of esq) state.voxels.set(e.x + ',' + e.y + ',0', e.c);
      state.layer = 0; state.rot = 0;
    };
    planta(); await dormir(600); planta(); await dormir(300);

    const hex = (cv, X, Y) => {
      const d = cv.getContext('2d').getImageData(X, Y, 1, 1).data;
      return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
    };
    // No se comparan colores exactos: cada vista sombrea a su manera (la cara de arriba del iso lleva
    // factor 1.10). Se compara CUAL de los cuatro es el mas parecido, que es una pregunta que el
    // sombreado no cambia porque los cuatro son primarios saturados.
    const cerca = px => {
      const p = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
      const A = p(px);
      let mej = null, dm = 1e9;
      for (const e of esq) {
        const B = p(e.c), d = (A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2;
        if (d < dm) { dm = d; mej = e.n; }
      }
      return mej + ' (' + px + ')';
    };

    const salida = { voxelsEnElModelo: state.voxels.size };

    // ── 2D: centro de cada celda ────────────────────────────────────────────────────────────────
    setMode('layers'); await dormir(400);      // setMode pinta SINCRONO (render() solo encola un rAF)
    const g = viewGeom();
    salida['2D'] = {};
    for (const e of esq) {
      salida['2D'][e.n] = cerca(hex(editCv, Math.round(g.originX + (e.x + 0.5) * g.cell),
                                           Math.round(g.originY + (e.y + 0.5) * g.cell)));
    }

    // ── iso (el preview de arriba a la derecha) ─────────────────────────────────────────────────
    setMode('3d'); await dormir(600);
    const leeIso = () => {
      drawIso();
      const gg = isoGeom;                      // la deja drawIso: misma proyeccion que se acaba de pintar
      if (!gg) return 'sin isoGeom (¿preview apagado?)';
      const out = {};
      for (const e of esq) {
        const [rx, ry] = rotXY(e.x, e.y, state.rot);
        out[e.n] = cerca(hex(isoCv, Math.round((rx - ry) * gg.S + gg.ox),
                                    Math.round((rx + ry) * gg.h + gg.oy)));
      }
      return out;
    };
    salida['iso rot0'] = leeIso();
    state.rot = 1; salida['iso rot1'] = leeIso();
    state.rot = 0; drawIso();
    salida.contexto = { modo: mode, SX, SY, SZ, lienzo2D: [editCv.width, editCv.height], lienzoIso: [isoCv.width, isoCv.height] };
    setMode('layers');
    return salida;
  }, ESQUINAS);

  P('cada casilla dice QUE ESQUINA se ve donde deberia estar esa esquina', r);
  await page.screenshot({ path: '/tmp/probe_2d_vs_iso.png' });
  console.log('\n   foto: /tmp/probe_2d_vs_iso.png');
  await browser.close();
})();
