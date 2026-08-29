// @area: editor
// @necesita: servidor, playwright
// SONDA (segunda parte de `probe_2d_vs_iso.js`): con COLORES PLANOS la 2D y el iso coinciden a rot 0 y
// a rot 1, o sea que las celdas caen donde toca. Lo del dueño son texturas con texto, asi que aqui se
// mira lo unico que queda: la IMAGEN DE LA CARA.
//
// Como se pinta la cara de arriba (+Z, indice 0) en cada sitio:
//   2D  drawVoxCell : ectx.drawImage(fc.faces[0], X,Y,W,H)   → col imagen = +X pantalla, fila = +Y
//   iso isoFace     : cuadrilatero [[sx,sy-h],[sx+S,sy],[sx,sy+h],[sx-S,sy]] y drawTexFace mapea
//                     col imagen a (p1-p0)=(+S,+h)=+rx  y  fila imagen a (p3-p0)=(-S,+h)=+ry
// …con [rx,ry]=rotXY(x,y,state.rot). La imagen `faces[0]` esta horneada en coordenadas DEL MODELO
// (buildTexFaces: du=+X, dv=+Y), asi que si el iso la estira sobre los ejes YA GIRADOS sin girarla
// tambien, el dibujo de la cara se queda quieto mientras la pieza gira.
//
// Para que la respuesta no dependa de ningun asset, la textura se inyecta a mano: 4³, con una marca
// BLANCA en una sola esquina (x=0,y=0) sobre fondo negro. Se pregunta en que cuadrante de la cara
// aparece la marca en cada vista.
//
//   node tests/probe_2d_vs_iso_textura.js [url]
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/?noauto=1';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof state!=="undefined" && state.voxels && typeof setMode==="function"', null, { timeout: 120000 });
  await page.waitForTimeout(3000);

  const r = await page.evaluate(async () => {
    const dormir = ms => new Promise(r => setTimeout(r, ms));
    const CLAVE = 'asset:__sonda_marca.vox.json';

    // Textura 4³ NEGRA con la columna (x=0,y=0) BLANCA: una sola esquina marcada, sin simetrias.
    const vox = {};
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++)
      vox[x + ',' + y + ',' + z] = (x === 0 && y === 0) ? '#ffffff' : '#101010';
    texDefs.set(CLAVE, { format: 'voxelforge-1', size: 4, voxels: vox });
    texFaceCache.delete(CLAVE);

    // Un solo voxel con esa textura, en un modelo 1×1×1: nada mas que mirar.
    const planta = () => {
      setSize(1, 1, 1);
      state.voxels.clear(); state.caras.clear();
      state.voxels.set('0,0,0', 'tex:' + CLAVE);
      state.layer = 0; state.rot = 0;
    };
    planta(); await dormir(600); planta(); await dormir(300);

    const blanco = (cv, X, Y) => {
      const d = cv.getContext('2d').getImageData(X, Y, 1, 1).data;
      return d[0] > 140 && d[1] > 140 && d[2] > 140;
    };
    // ¿En que esquina de la cara esta la marca? Se sondean las cuatro y se devuelve la que sale blanca.
    const cuadrante = (cv, cx, cy, du, dv) => {
      const q = [];
      for (const [a, b, n] of [[0.25, 0.25, 'col- fila-'], [0.75, 0.25, 'col+ fila-'],
                               [0.25, 0.75, 'col- fila+'], [0.75, 0.75, 'col+ fila+']]) {
        const X = Math.round(cx + (a - 0.5) * du[0] + (b - 0.5) * dv[0]);
        const Y = Math.round(cy + (a - 0.5) * du[1] + (b - 0.5) * dv[1]);
        if (blanco(cv, X, Y)) q.push(n);
      }
      return q.join('+') || '(no se ve la marca)';
    };

    const salida = { textura: CLAVE, cara0EsMasZ: true };

    // ── 2D ──────────────────────────────────────────────────────────────────────────────────────
    setMode('layers'); await dormir(500);
    const g = viewGeom();
    // La celda: col imagen = +X pantalla (du), fila imagen = +Y pantalla (dv).
    salida['2D'] = cuadrante(editCv, g.originX + 0.5 * g.cell, g.originY + 0.5 * g.cell,
                             [g.cell, 0], [0, g.cell]);

    // ── iso ─────────────────────────────────────────────────────────────────────────────────────
    setMode('3d'); await dormir(700);
    const leeIso = () => {
      drawIso();
      const gg = isoGeom; if (!gg) return 'sin isoGeom';
      const [rx, ry] = rotXY(0, 0, state.rot);
      const cx = (rx - ry) * gg.S + gg.ox, cy = (rx + ry) * gg.h + gg.oy;
      // En el rombo de arriba: col imagen va a (+S,+h) y fila imagen a (-S,+h).
      return cuadrante(isoCv, cx, cy, [gg.S, gg.h], [-gg.S, gg.h]);
    };
    salida['iso rot0'] = leeIso();
    state.rot = 1; salida['iso rot1'] = leeIso();
    state.rot = 2; salida['iso rot2'] = leeIso();
    state.rot = 0; drawIso();
    setMode('layers');
    return salida;
  });

  console.log('\n¿en que esquina de la cara de arriba cae la marca blanca (x=0,y=0)?');
  console.log('   ' + JSON.stringify(r, null, 1).replace(/\n/g, '\n   '));
  console.log('\n   Lo correcto: la 2D manda. Si el iso no la mueve al cambiar rot, la textura');
  console.log('   no gira con la pieza (isoFace pide siempre la cara 0 sin girar la imagen).');
  await page.screenshot({ path: '/tmp/probe_2d_vs_iso_textura.png' });
  console.log('\n   foto: /tmp/probe_2d_vs_iso_textura.png');
  await browser.close();
})();
