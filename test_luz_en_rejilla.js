// Una antorcha SE VEIA encendida pero no alumbraba nada en cuanto dejaba de ser una estructura suelta y pasaba a
// la rejilla (clic derecho -> setVoxel). El motivo: mcComputeBlockLight sembraba la luz recorriendo SOLO
// mc.structures y leyendo sus emitCells; una pieza en mc.grid no esta en esa lista, asi que no existia como foco.
// Ahora la rejilla tiene su propio indice de emisores (mcGlowCeldas) y la siembra es la misma para las dos vias.
//
// Este test guarda las dos mitades: que la rejilla ilumine IGUAL que la estructura (es el caso que funcionaba antes
// de la mudanza y no puede empeorar), y que el indice sea incremental de verdad —poner y romper una antorcha no
// puede costar un barrido de la rejilla entera, que es lo que hacia inviable la solucion ingenua—.
// No persiste nada: bloquea los POST y devuelve cada celda a su valor anterior.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\//.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const ANTORCHA = 'hab:antorcha', FLOR = 'asset:assets/flor-roja.vox.json';
    if (!(mc.glowLevel > 0)) mc.glowLevel = 12;          // sin nivel de brillo no hay luz que medir

    // Un hueco despejado: una columna de suelo con aire encima y a los lados, para que la luz se vea propagar.
    let sitio = null;
    for (let x = 12; x < mc.dim.x - 14 && !sitio; x += 3) for (let z = 12; z < mc.dim.z - 14; z += 3) {
      let gy = -1;
      for (let y = mc.dim.y - 10; y > 1; y--) if (mc.grid[mcIdx(x, y, z)]) { gy = y; break; }
      if (gy < 1) continue;
      let libre = true;
      for (let y = gy + 1; y <= gy + 6 && libre; y++) for (let d = 0; d < 10; d++) if (mc.grid[mcIdx(x + d, y, z)]) libre = false;
      if (libre) { sitio = [x, gy, z]; break; }
    }
    if (!sitio) { out.errs.push('sin sitio despejado en el mapa'); return out; }
    const [X, GY, Z] = sitio;
    out.sitio = sitio;
    // Perfil de luz de bloque a lo largo del pasillo, a partir de la celda de la pieza: [foco, +1, +2, +3].
    const perfil = (x, y, z) => [0, 1, 2, 3].map(d => (mc.blockLight ? mc.blockLight[mcIdx(x + d, y, z)] : -1));

    await game.addMaterial(ANTORCHA);
    const idAnt = mc.blockKey.indexOf(ANTORCHA);
    out.finaEmisiva = !!(mc._glowIds && mc._glowIds[idAnt]);   // la geometria fina YA trae emitCells: solo faltaba mirarlos

    // --- 1. En la REJILLA (setVoxel): tiene que alumbrar ---------------------------------------------------
    const antes = mc.grid[mcIdx(X, GY + 1, Z)];
    out.luzPrevia = perfil(X, GY + 1, Z);
    await game.setVoxel(X, GY + 1, Z, ANTORCHA); mcMeshAll();
    out.hasGlowRejilla = mc.hasGlow;
    out.luzRejilla = perfil(X, GY + 1, Z);
    out.indice = mc._glowCeldas ? mc._glowCeldas.size : -1;
    out.indiceCelda = !!(mc._glowCeldas && mc._glowCeldas.has(mcIdx(X, GY + 1, Z)));

    // --- 2. Y al romperla, se apaga ------------------------------------------------------------------------
    mcSetBlock(X, GY + 1, Z, antes); mcMeshAll();
    out.luzTrasRomper = perfil(X, GY + 1, Z);
    out.indiceTrasRomper = mc._glowCeldas ? mc._glowCeldas.size : -1;

    // --- 3. La MISMA antorcha estampada suelta: el perfil tiene que coincidir ------------------------------
    const n0 = mc.structures.length;
    await mcStampStruct(ANTORCHA, X + 5, GY + 1, Z, 0, true);
    out.estampadas = mc.structures.length - n0;
    out.luzEstructura = perfil(X + 5, GY + 1, Z);
    for (const s of mc.structures.filter(o => o.key === ANTORCHA)) mcRemoveStruct(s, true);

    // --- 4. Una pieza fina NO emisiva no enciende nada -----------------------------------------------------
    await game.addMaterial(FLOR);
    const antesFlor = mc.grid[mcIdx(X, GY + 1, Z)];
    await game.setVoxel(X, GY + 1, Z, FLOR); mcMeshAll();
    out.luzFlor = perfil(X, GY + 1, Z);
    out.indiceFlor = mc._glowCeldas ? mc._glowCeldas.size : -1;
    mcSetBlock(X, GY + 1, Z, antesFlor); mcMeshAll();

    // --- 5. El indice es incremental: poner/romper no re-barre la rejilla ----------------------------------
    // Se cuenta cuantas veces se rehace el indice de cero (el unico barrido O(celdas) que existe). Con la
    // antorcha ya conocida por la paleta, 20 ediciones tienen que costar CERO barridos.
    let barridos = 0;
    const firmaOrig = Object.getOwnPropertyDescriptor(mc, '_glowFirma');
    let firma = mc._glowFirma;
    Object.defineProperty(mc, '_glowFirma', { configurable: true, get: () => firma, set: v => { if (v !== firma) barridos++; firma = v; } });
    for (let i = 0; i < 20; i++) { await game.setVoxel(X, GY + 1, Z, ANTORCHA); mcMeshAll(); mcSetBlock(X, GY + 1, Z, antes); mcMeshAll(); }
    delete mc._glowFirma;
    if (firmaOrig) Object.defineProperty(mc, '_glowFirma', firmaOrig); else mc._glowFirma = firma;
    out.barridos = barridos;

    // limpieza: la celda vuelve a lo que habia y no queda ninguna estructura de prueba
    mcSetBlock(X, GY + 1, Z, antes); mcMeshAll();
    out.celdaRestaurada = mc.grid[mcIdx(X, GY + 1, Z)] === antes;
    out.limpio = !mc.structures.some(o => o.key === ANTORCHA);
    out.luzFinal = perfil(X, GY + 1, Z);
    return out;
  });

  if (r.errs && r.errs.length) r.errs.forEach(e => ok('preparacion: ' + e, false));
  const suma = a => (a || []).reduce((s, v) => s + v, 0);

  console.log('\nUna antorcha PUESTA EN LA REJILLA (setVoxel) alumbra');
  ok('su geometria fina cuenta como emisiva', r.finaEmisiva);
  ok('mc.hasGlow se enciende', r.hasGlowRejilla === true);
  ok('el pasillo se ilumina', suma(r.luzRejilla) > 0, 'antes ' + JSON.stringify(r.luzPrevia) + ' -> ' + JSON.stringify(r.luzRejilla));
  ok('y la luz baja al alejarse (se propaga, no es un punto)', r.luzRejilla && r.luzRejilla[1] > r.luzRejilla[3], JSON.stringify(r.luzRejilla));
  ok('la celda entra en el indice de emisores', r.indiceCelda === true, r.indice + ' celda(s)');

  console.log('\nAl romperla se apaga');
  ok('la luz vuelve a como estaba', JSON.stringify(r.luzTrasRomper) === JSON.stringify(r.luzPrevia),
    JSON.stringify(r.luzPrevia) + ' vs ' + JSON.stringify(r.luzTrasRomper));
  ok('y sale del indice', r.indiceTrasRomper === 0, r.indiceTrasRomper + ' celda(s)');

  console.log('\nRejilla y estructura alumbran IGUAL (es el caso que ya funcionaba)');
  ok('se estampo la de contraste', r.estampadas === 1);
  ok('mismo perfil de luz', JSON.stringify(r.luzRejilla) === JSON.stringify(r.luzEstructura),
    'rejilla ' + JSON.stringify(r.luzRejilla) + ' vs estructura ' + JSON.stringify(r.luzEstructura));

  console.log('\nUna pieza fina no emisiva sigue sin encender nada');
  ok('la flor no alumbra', suma(r.luzFlor) === 0, JSON.stringify(r.luzFlor));
  ok('ni entra en el indice', r.indiceFlor === 0, r.indiceFlor + ' celda(s)');

  console.log('\nEl indice es incremental (poner/romper no barre la rejilla)');
  ok('20 ediciones = 0 re-barridos', r.barridos === 0, r.barridos + ' barridos');

  console.log('');
  ok('limpieza: la celda vuelve a su valor', r.celdaRestaurada === true);
  ok('limpieza: no queda ninguna estructura de prueba', r.limpio === true);
  ok('el mundo queda con la luz de partida', JSON.stringify(r.luzFinal) === JSON.stringify(r.luzPrevia));
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos === 0 ? '\ntodo ok' : '\n' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();
