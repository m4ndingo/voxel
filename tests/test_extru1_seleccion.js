// @area: editor
// @necesita: servidor, playwright
// REQ-EXTRU1 — «*me gustaria hacer una extrusion con la herramienta de seleccion, podria ser
// seleccionar, y una vez seleccionado, usar shift+wheel up o down, para estruir hacia arriba o hacia
// abajo (hacia abajo cavaria)*» (nota del dueño en /map/bugfinder, 56,14,71).
//
// Lo que sujeta este guardián:
//   1) Va por COLUMNAS, no por capas: sobre terreno desigual la extrusión sigue la SILUETA (cada
//      columna crece desde su propio techo). Si alguien lo cambia a «una plancha sobre y1» este test
//      lo canta: la columna alta y las bajas acaban a distinta altura a propósito.
//   2) La caja se estira una celda, así que la muesca SIGUIENTE sigue subiendo (o cavando) sola. Sin
//      eso, la segunda vuelta re-escribiría lo mismo y el gesto solo serviría una vez.
//   3) Arriba construye, abajo CAVA, y los DOS por el techo de cada columna ⇒ una muesca arriba seguida
//      de una abajo deja los bloques como estaban (tramo G). Corrección del dueño del 2026-08-20 (fotos
//      62 y 63): la v1 cavaba por el SUELO de la caja, así que bajar ni deshacía lo subido ni se veía
//      —se comía un bloque enterrado— y la caja crecía hacia abajo en vez de bajar. Deshacer de verdad
//      sigue siendo Ctrl+Z (un gesto 'bb', un solo mcUndo: tramo C).
//   4) El cableado real de la rueda: Ctrl + rueda con la herramienta Seleccionar extruye AUNQUE la
//      rosca de herramientas (REQ-TOOL6, `mc.ruedaTool`) esté apagada, y sin Ctrl no hace nada. El
//      dueño lo pidió en Ctrl el 2026-08-20 (nació en Shift, que se le quedó para añadir cajas).
//
// ⚠️ Trampa del tramo D: el manejador exige puntero capturado (`document.pointerLockElement`), que en
// un navegador sin cabeza no llega solo; se finge con un getter y se quita al final.
// Se trabaja en /map/test y sobre celdas que el propio test vacía antes: no toca el mundo del dueño.

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

  // Banco de pruebas: 3×3 columnas con una más alta, y aire limpio por encima. Se monta con mcSetBlock
  // + mcRemeshEdiciones (sin historial: mc.histLock) para que el Ctrl+Z del tramo C deshaga SOLO la
  // extrusión y no el decorado.
  const base = await p.evaluate(() => {
    const X = 8, Z = 8, Y = 12;                 // esquina del banco, lejos de donde aparece el jugador
    const id = mc.grid.find(v => v > 0) || 1;   // un material que el mapa ya tenga (no inventar ids)
    // Copia de lo que había: al final se devuelve celda a celda, que /map/test se guarda solo.
    window._extru1 = { X, Y, Z, orig: [] };
    for (let x = X; x < X + 3; x++) for (let z = Z; z < Z + 3; z++) for (let y = Y - 8; y <= Y + 8; y++) {
      if (mcInside(x, y, z)) window._extru1.orig.push([x, y, z, mc.grid[mcIdx(x, y, z)]]);
    }
    const lock = mc.histLock; mc.histLock = true;
    const edits = [];
    for (let x = X; x < X + 3; x++) for (let z = Z; z < Z + 3; z++) for (let y = Y - 6; y <= Y + 6; y++) {
      const nuevo = (y <= Y) ? id : 0;          // maciza hasta Y (para poder cavar), aire por encima
      const before = mc.grid[mcIdx(x, y, z)];
      if (before === nuevo) continue;
      mcSetBlock(x, y, z, nuevo); edits.push({ x, y, z, before, after: nuevo });
    }
    // La columna de la esquina sobresale una celda: es la que delata si la extrusión aplana.
    { const before = mc.grid[mcIdx(X, Y + 1, Z)]; mcSetBlock(X, Y + 1, Z, id); edits.push({ x: X, y: Y + 1, z: Z, before, after: id }); }
    mcRemeshEdiciones(edits);
    mc.histLock = lock;
    mc.tool = 'select'; mc.selA = null;
    mc.selBox = { a: [X, Y, Z], b: [X + 2, Y + 1, Z + 2] };
    return { X, Z, Y, id, hist: mc.hist.length };
  });
  const { X, Z, Y, id } = base;
  const celda = (x, y, z) => p.evaluate(([x, y, z]) => mc.grid[mcIdx(x, y, z)], [x, y, z]);
  const cajaY = () => p.evaluate(() => [Math.min(mc.selBox.a[1], mc.selBox.b[1]), Math.max(mc.selBox.a[1], mc.selBox.b[1])]);

  console.log('\nA · Ctrl+rueda arriba extruye SIGUIENDO LA SILUETA, columna a columna');
  const a1 = await p.evaluate(() => mcSelExtruir(1));
  ok('mcSelExtruir(1) hace algo', a1 === true);
  ok('la columna alta creció desde SU techo (Y+2)', await celda(X, Y + 2, Z) === id);
  ok('las bajas desde el suyo (Y+1), no aplanadas contra la alta', await celda(X + 2, Y + 1, Z + 2) === id);
  ok('…y no se coló nada en el hueco de al lado (Y+2)', await celda(X + 2, Y + 2, Z + 2) === 0);
  ok('la caja se estiró una celda hacia arriba', (await cajaY())[1] === Y + 2, 'tope=' + (await cajaY())[1]);

  console.log('\nB · la muesca siguiente sigue subiendo sin volver a seleccionar');
  const b2 = await p.evaluate(() => mcSelExtruir(1));
  ok('la segunda vuelta también escribe', b2 === true);
  ok('la columna alta va por Y+3', await celda(X, Y + 3, Z) === id);
  ok('las bajas por Y+2', await celda(X + 2, Y + 2, Z + 2) === id);
  ok('y la caja por Y+3', (await cajaY())[1] === Y + 3);

  console.log('\nC · un gesto = un Ctrl+Z');
  const antesHist = await p.evaluate(() => mc.hist.length);
  await p.evaluate(async () => { await mcUndo(); });
  await p.waitForTimeout(300);
  ok('deshacer una vez borra la segunda extrusión entera', await celda(X, Y + 3, Z) === 0 && await celda(X + 2, Y + 2, Z + 2) === 0);
  ok('…y deja la primera en pie (no se comió dos gestos)', await celda(X, Y + 2, Z) === id);
  ok('el historial baja de uno en uno', await p.evaluate(() => mc.hist.length) === antesHist - 1);

  console.log('\nD · hacia abajo CAVA, y cada muesca baja un piso');
  const d = await p.evaluate(() => {
    mc.selBox = { a: [8, 12, 8], b: [10, 12, 10] };        // una sola capa: la de arriba del banco
    const r1 = mcSelExtruir(-1);
    const tras1 = { y12: mc.grid[mcIdx(8, 12, 8)], caja: Math.min(mc.selBox.a[1], mc.selBox.b[1]) };
    const r2 = mcSelExtruir(-1);
    const tras2 = { y11: mc.grid[mcIdx(8, 11, 8)], caja: Math.min(mc.selBox.a[1], mc.selBox.b[1]) };
    return { r1, r2, tras1, tras2 };
  });
  ok('la primera muesca vacía la capa seleccionada', d.r1 === true && d.tras1.y12 === 0);
  ok('la caja baja con ella', d.tras1.caja === Y - 1, 'suelo=' + d.tras1.caja);
  ok('la segunda cava el piso de abajo (no repite el mismo)', d.r2 === true && d.tras2.y11 === 0);
  ok('y la caja sigue bajando', d.tras2.caja === Y - 2, 'suelo=' + d.tras2.caja);

  console.log('\nE · sin caja, o con caja vacía, no pasa nada');
  const e = await p.evaluate(() => {
    const out = {};
    const guarda = mc.selBox;
    mc.selBox = null;                    out.sinCaja = mcSelExtruir(1);
    mc.selBox = { a: [8, 30, 8], b: [10, 30, 10] };        // aire puro
    out.vacia = mcSelExtruir(1);
    mc.tool = 'build'; mc.selBox = guarda; out.otraHerramienta = mcSelExtruir(1);
    mc.tool = 'select';
    return out;
  });
  ok('sin caja devuelve false', e.sinCaja === false);
  ok('caja sin bloques, false (y no revienta)', e.vacia === false);
  ok('con otra herramienta, false', e.otraHerramienta === false);

  console.log('\nF · el cableado de la rueda: Ctrl manda, y la rosca apagada no estorba');
  const f = await p.evaluate(async () => {
    const out = {};
    const rosca = mc.ruedaTool, tool = mc.tool;
    mc.ruedaTool = false;                                  // REQ-TOOL6 apagado a propósito
    mc.tool = 'select';
    mc.selBox = { a: [8, 12, 8], b: [10, 13, 10] };
    Object.defineProperty(document, 'pointerLockElement', { get: () => mc.canvas, configurable: true });
    const rueda = (deltaY, mod) => mc.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, ctrlKey: mod === 'ctrl', shiftKey: mod === 'shift', bubbles: true, cancelable: true }));
    // Se mide la columna (10,10) —una de las bajas—: la de la esquina tiene encima lo que dejó el tramo A
    // y una extrusión no pisa lo que ya hay, así que ahí el contador no se movería.
    const alturaDe = () => { let n = 0; for (let y = 0; y < mc.dim.y; y++) if (mc.grid[mcIdx(10, y, 10)]) n++; return n; };
    const antes = alturaDe();
    rueda(-20, 'ctrl');  out.mediaMuesca = alturaDe() - antes;   // por debajo del umbral (30): todavía nada
    rueda(-20, 'ctrl');  out.muescaEntera = alturaDe() - antes;  // acumulado 40 ⇒ un paso
    const tras = alturaDe();
    rueda(-120, null);   out.pelada = alturaDe() - tras;         // a pelo y con la rosca apagada: nada
    rueda(-120, 'shift'); out.conShift = alturaDe() - tras;      // Shift ya NO extruye: es de añadir cajas
    out.herramienta = mc.tool;                                   // …y tampoco cambió de herramienta
    delete document.pointerLockElement;
    mc.ruedaTool = rosca; mc.tool = tool;
    return out;
  });
  ok('media muesca no extruye (umbral de rueda respetado)', f.mediaMuesca === 0, 'delta=' + f.mediaMuesca);
  ok('la muesca entera sí, con la rosca de herramientas APAGADA', f.muescaEntera === 1, 'delta=' + f.muescaEntera);
  ok('la rueda a pelo no extruye', f.pelada === 0, 'delta=' + f.pelada);
  ok('Shift+rueda tampoco: desde el 2026-08-20 el gesto es Ctrl', f.conShift === 0, 'delta=' + f.conShift);
  ok('y ninguna de las dos cambia de herramienta (rosca apagada)', f.herramienta === 'select');

  console.log('\nG · subir y bajar SON inversos (corrección del dueño, fotos 62/63)');
  // Property test: fotografía las tres columnas ENTERAS (de y=0 al techo), da una muesca arriba y otra
  // abajo, y exige volver al mismo sitio. Rehace el banco antes, porque los tramos de arriba han cavado y
  // extruido y aquí hace falta saber qué hay: macizo hasta Y, aire limpio encima.
  const g = await p.evaluate((base) => {
    const { X, Y, Z, id } = base;
    const rehaz = (techo) => {                   // techo: celda que se pone SOBRE la selección, o 0 = aire
      const lock = mc.histLock; mc.histLock = true;
      const edits = [];
      for (let x = X; x < X + 3; x++) for (let z = Z; z < Z + 3; z++) for (let y = Y - 6; y <= Y + 6; y++) {
        const nuevo = (y <= Y + 1) ? id : (y === Y + 2 ? techo : 0);   // macizo hasta la cima de la caja
        const before = mc.grid[mcIdx(x, y, z)];
        if (before === nuevo) continue;
        mcSetBlock(x, y, z, nuevo); edits.push({ x, y, z, before, after: nuevo });
      }
      mcRemeshEdiciones(edits); mc.histLock = lock;
      mc.tool = 'select'; mc.selA = null;
      mc.selBox = { a: [X, Y, Z], b: [X + 2, Y + 1, Z + 2] };
    };
    const foto = () => { const s = []; for (let x = X; x < X + 3; x++) for (let z = Z; z < Z + 3; z++) for (let y = 0; y < mc.dim.y; y++) s.push(mc.grid[mcIdx(x, y, z)]); return s.join(','); };
    const caja = () => Math.min(mc.selBox.a[1], mc.selBox.b[1]) + '..' + Math.max(mc.selBox.a[1], mc.selBox.b[1]);
    const out = {};
    rehaz(0);
    out.antes = foto(); out.cajaAntes = caja();
    mcSelExtruir(1);
    out.subido = foto(); out.cajaArriba = caja();
    mcSelExtruir(-1);
    out.despues = foto(); out.cajaDespues = caja();
    // Y el caso que se colaba: con algo justo encima, arriba no cabe NADA. Entonces no puede moverse la
    // caja, o el «bajar» de vuelta se come el bloque ajeno que estorbaba.
    rehaz(id);
    out.tapadoAntes = foto(); out.cajaTapada = caja();
    out.subeTapado = mcSelExtruir(1);
    out.tapadoTrasSubir = foto(); out.cajaTrasSubir = caja();
    return out;
  }, base);
  ok('la muesca de arriba cambia algo (si no, el test no prueba nada)', g.subido !== g.antes);
  ok('la caja crece por el techo al subir', g.cajaArriba === (base.Y) + '..' + (base.Y + 2), 'caja=' + g.cajaArriba);
  ok('bajar deja los bloques EXACTAMENTE como estaban', g.despues === g.antes);
  ok('…y la caja vuelve a su sitio, encogiendo por arriba', g.cajaDespues === g.cajaAntes, 'caja=' + g.cajaDespues + ' (antes ' + g.cajaAntes + ')');
  ok('con la selección tapada, subir devuelve false', g.subeTapado === false);
  ok('…no toca ni un bloque', g.tapadoTrasSubir === g.tapadoAntes);
  ok('…y la caja NO sube (si no, el bajar de vuelta se comería el bloque de arriba)', g.cajaTrasSubir === g.cajaTapada, 'caja=' + g.cajaTrasSubir + ' (antes ' + g.cajaTapada + ')');

  // Dejar el banco EXACTAMENTE como estaba (la copia del principio): /map/test se guarda solo.
  await p.evaluate(() => {
    const lock = mc.histLock; mc.histLock = true;
    const edits = [];
    for (const [x, y, z, antes] of window._extru1.orig) {
      const before = mc.grid[mcIdx(x, y, z)];
      if (before === antes) continue;
      mcSetBlock(x, y, z, antes); edits.push({ x, y, z, before, after: antes });
    }
    mcRemeshEdiciones(edits); mc.histLock = lock;
    mc.selBox = null; mc.selA = null; mc.hist.length = 0; mc.histRedo.length = 0;
    mcScheduleSave();
  });

  ok('sin errores de página', errores.length === 0, errores.join(' · '));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nOK');
  process.exit(fallos ? 1 : 0);
})();
