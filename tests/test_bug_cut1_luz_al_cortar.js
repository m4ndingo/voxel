// BUG-CUT1 — «*cuando se cortan los bloques (control+x) no se refrescan/repintan las caras de los bloques
// que estaban por detras de los recortados […] se ven huecos sin textura o transparentes en lugar de la
// textura de los bloques esperada. si se cambia la tool de construir y se borra o crea un bloque entonces
// sí se repintan, pero deberia hacerse solo justo despues del control+x*» (dueño, 2026-08-20).
//
// La causa no era el mallado, era LA LUZ. Cortar, pegar, rotar y rellenar escriben `mc.grid` a pelo (van
// por miles de celdas y juntan sus propios `edits`), así que se saltaban el contador de topología
// `mc.gridGen` que sí lleva mcSetBlock. Sin ese contador, mcRemeshAround entiende que solo cambió el
// COLOR: re-malla, pero no llama a mcRelightBox. Las caras que el corte deja al aire se pintan entonces
// con el skylight que tenían enterradas —0, negro— hasta que pones o rompes un bloque cerca (eso sí pasa
// por mcSetBlock, sube gridGen, y de rebote re-ilumina la zona).
//
// El arreglo vive en mcRemeshEdiciones, que es la puerta común de todas las operaciones en bloque, y usa
// el MISMO predicado que mcSetBlock (mcCambiaTopologia): dos predicados distintos aquí es exactamente el
// bug que describe CLAUDE.md, el mundo editado dejando de parecerse al recién cargado.
//
// Se trabaja en /map/test, con `mc.escaparate` puesto y devolviendo el terreno celda a celda.

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

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"',
    null, { timeout: 180000 });
  await p.waitForTimeout(1500);

  console.log('\nA · el predicado de topología es UNO, y lo comparten mcSetBlock y las ráfagas');
  const a = await p.evaluate(() => ({
    existe: typeof mcCambiaTopologia === 'function' && typeof mcTopologiaDeEdiciones === 'function',
    aireASolido: mcCambiaTopologia(0, 1),
    solidoAAire: mcCambiaTopologia(1, 0),
    mismoTipo: mcCambiaTopologia(1, 1),
    rafagaCuenta: (() => { const g = mc.gridGen | 0; mcTopologiaDeEdiciones([{ before: 1, after: 0 }]); return (mc.gridGen | 0) !== g; })(),
    rafagaSoloColor: (() => { const g = mc.gridGen | 0; mcTopologiaDeEdiciones([{ before: 1, after: 1 }]); return (mc.gridGen | 0) === g; })(),
  }));
  ok('las dos funciones existen', a.existe);
  ok('quitar un bloque cambia la topología', a.solidoAAire);
  ok('ponerlo también', a.aireASolido);
  ok('cambiar de material sin más, no', a.mismoTipo === false);
  ok('una ráfaga con un hueco sube gridGen', a.rafagaCuenta);
  ok('una ráfaga que solo repinta, no', a.rafagaSoloColor);

  console.log('\nB · Ctrl+X re-ilumina el hueco que deja (el bug del dueño)');
  const t = await p.evaluate(() => {
    // Se cava un pozo de 3×3×3 en terreno macizo, con cielo abierto encima: si el corte re-ilumina, las
    // celdas del pozo pasan de estar a oscuras (enterradas) a recibir el cielo entero.
    const X = 40, Z = 40;
    const sy = mcSurfaceY(X + 1, Z + 1);            // primera celda de aire sobre el terreno
    const y1 = sy - 1, y0 = sy - 3;                 // tres capas de terreno macizo
    window._cut1 = { orig: [], X, Z, y0, y1 };
    for (let x = X - 1; x <= X + 3; x++) for (let z = Z - 1; z <= Z + 3; z++) for (let y = y0 - 1; y <= y1 + 2; y++) {
      if (mcInside(x, y, z)) window._cut1.orig.push([x, y, z, mc.grid[mcIdx(x, y, z)]]);
    }
    // Maciza la zona, con mcSetBlock (esto es el decorado: que la luz quede bien asentada antes de cortar)
    const lock = mc.histLock; mc.histLock = true;
    const id = mc.grid.find(v => v > 0) || 1;
    const edits = [];
    for (let x = X - 1; x <= X + 3; x++) for (let z = Z - 1; z <= Z + 3; z++) for (let y = y0; y <= y1; y++) {
      const before = mc.grid[mcIdx(x, y, z)];
      if (before === id) continue;
      mcSetBlock(x, y, z, id); edits.push({ x, y, z, before, after: id });
    }
    mcRemeshEdiciones(edits);
    mc.histLock = lock;

    const mide = () => mc.light[mcIdx(X + 1, y0 + 1, Z + 1)];   // el centro del futuro pozo
    const antes = mide();
    mc.tool = 'select'; mc.selA = null;
    mc.selBox = { a: [X, y0, Z], b: [X + 2, y1, Z + 2] };
    const gen = mc.gridGen | 0;
    mcCutSelection();
    const despues = mide();
    // Y lo que de verdad promete el arreglo: la luz incremental del corte es la MISMA que saldría de
    // recalcular el mundo entero. Cuánto vale da igual (depende del terreno de /map/test); lo que no puede
    // pasar es que el mundo editado deje de parecerse al recién cargado.
    mcComputeLight();
    return { antes, despues, aPelo: mide(), subioGen: (mc.gridGen | 0) !== gen, vacio: mc.grid[mcIdx(X + 1, y0 + 1, Z + 1)] === 0, max: MC_MAXLIGHT };
  });
  ok('antes de cortar, la celda está enterrada y a oscuras', t.antes === 0, 'luz=' + t.antes);
  ok('Ctrl+X deja el hueco vacío', t.vacio);
  ok('…y cuenta el cambio de topología', t.subioGen);
  ok('…y la luz del hueco se recalcula SOLA, sin tocar otro bloque', t.despues > 0, 'luz=' + t.despues + ' (antes ' + t.antes + ')');
  ok('…con el MISMO valor que un recálculo entero', t.despues === t.aPelo, 'incremental=' + t.despues + ' · entero=' + t.aPelo);

  // limpieza: el terreno EXACTAMENTE como estaba
  await p.evaluate(() => {
    mc.selBox = null; mc.selA = null;
    const lock = mc.histLock; mc.histLock = true;
    const edits = [];
    for (const [x, y, z, id] of window._cut1.orig) {
      const before = mc.grid[mcIdx(x, y, z)];
      if (before === id) continue;
      mcSetBlock(x, y, z, id); edits.push({ x, y, z, before, after: id });
    }
    mcRemeshEdiciones(edits);
    mc.histLock = lock;
  });

  ok('ni un error de página en toda la pasada', errores.length === 0, errores.join(' · '));
  await b.close();
  console.log('\n' + (fallos ? fallos + ' fallos' : 'todo en verde'));
  process.exit(fallos ? 1 : 0);
})();
