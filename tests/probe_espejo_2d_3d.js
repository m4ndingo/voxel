// @area: editor
// @necesita: servidor, playwright
// SONDA: «hago giro en X y el rotulo que en 2D pone TNTT, en el preview 3D y en el editor 3D sale en
// ESPEJO» (dueño, 2026-08-28). Manda la 2D, que es donde se dibujan los textos.
//
// VEREDICTO (2026-08-28): NO HAY ESPEJO, era el TNT pintado en la cara de ABAJO — «esta ok, es que
// estaba pintando en la cara de abajo y no me di cuenta» (dueño). Un rotulo en la cara -Z se mira en 2D
// POR DETRAS (las capas se ven desde arriba, atravesando la pieza) y en 3D por fuera: sale al reves y
// el motor esta haciendo lo correcto. La sonda se queda como prueba de que las tres vistas concuerdan.
//
// Con colores planos y celdas sueltas (`probe_2d_vs_iso.js`) las tres vistas coinciden, asi que aqui no
// se miden celdas: se PINTA UNA LETRA y se mira. La letra es una `F`, que no tiene ninguna simetria: si
// una vista la enseña al reves, se ve a simple vista y no hace falta interpretar coordenadas.
//
// El montaje repite el gesto del dueño: cubo macizo con la `F` en una cara VERTICAL (+Y), giro en X con
// el mismo `rotateModel('x',1)` del boton ⇕X — que lleva esa cara a la de arriba— y foto de las tres
// vistas para compararlas entre si.
//
// ⚠️ `?noauto=1` NO es opcional: sin el, el editor autoarranca al Mundo y la sonda fotografia el mapa.
//
//   node tests/probe_espejo_2d_3d.js [url]
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/?noauto=1';

// 'F' de 5×7 (fila 0 = arriba). Sin simetrias: el espejo canta.
const F = ['11111', '10000', '10000', '11110', '10000', '10000', '10000'];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof state!=="undefined" && state.voxels && typeof setMode==="function"', null, { timeout: 120000 });
  await page.waitForTimeout(3000);           // deja que termine de restaurarse el ultimo objeto…

  const info = await page.evaluate(async F => {
    const dormir = ms => new Promise(r => setTimeout(r, ms));
    const N = 9;
    // …y SOLO ENTONCES se planta: la restauracion llega tarde y se lleva por delante el modelo.
    const planta = () => {
      setSize(N, N, N);
      state.voxels.clear(); state.caras.clear();
      for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) for (let z = 0; z < N; z++)
        state.voxels.set(x + ',' + y + ',' + z, '#b0301f');
      // La 'F' en la cara +Y (y=N-1), leida de frente desde +Y: columna → +X, fila → hacia abajo (-Z).
      for (let r = 0; r < F.length; r++) for (let c = 0; c < F[r].length; c++)
        if (F[r][c] === '1') state.voxels.set((c + 2) + ',' + (N - 1) + ',' + (N - 2 - r), '#ffffff');
      state.layer = N - 1; state.rot = 0;
    };
    planta(); await dormir(600); planta(); await dormir(300);
    // El mismo gesto del dueño: el boton ⇕X. La cara +Y sube a la de arriba (z=N-1).
    rotateModel('x', 1);
    state.layer = SZ - 1;
    setMode('layers'); await dormir(600);
    return { tam: [SX, SY, SZ], capa: state.layer + 1, de: SZ, rot: state.rot, vox: state.voxels.size };
  }, F);

  console.log('   ' + JSON.stringify(info));
  await page.screenshot({ path: '/tmp/espejo_capas.png' });        // 2D + preview iso, juntos
  await page.evaluate(() => setMode('3d'));
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/espejo_3d.png' });           // editor 3D + preview iso
  console.log('   fotos: /tmp/espejo_capas.png  /tmp/espejo_3d.png');
  await browser.close();
})();
