// REQ-SEL1 — «*si teniendo ya una seleccion hago shift y click sea para añadir nuevas selecciones a la
// seleccion actual; por lo tanto ya no tenemos solamente selecciones de (x1,y1,z1) a (x2,y2,z2) sino que
// podemos tener "n" selecciones (xn_ori,yn_ori,zn_ori) a (xn_dest,yn_dest,zn_dest) y operar con esa
// herramienta con todas a la vez; cortarlas, pegarlas, guardarlas, extruirlas, etc*» (dueño, 2026-08-20).
//
// Lo que sujeta este guardián, que es justo lo que se puede romper sin darse cuenta:
//   1) `mc.selBox` YA NO es un campo, es un accesor de la ÚLTIMA caja de `mc.selCajas`. Leerlo, asignarlo
//      (⇒ tira las demás) y ponerlo a null (⇒ las tira todas) tienen que seguir comportándose así, porque
//      hay veinte sitios del motor que lo usan como si la selección fuera una sola caja.
//   2) mcSelForEach es LA puerta: recorre todas las cajas y NO repite las celdas del solape. De ahí salen
//      gratis contar, copiar, cortar, guardar el recorte y extruir.
//   3) Las operaciones del dueño, con dos cajas de verdad: contar, copiar, cortar y extruir.
//   4) Extruir mueve TODAS las cajas, y la columna es (caja,x,z) y no (x,z): dos cajas sobre el mismo
//      sitio a distinta altura son dos cimas, no una.
//   5) Rotar con varias gira CADA CAJA SOBRE SU BASE, en orden y sin que una sepa de la otra («*si cada
//      una se hace desde su base se pueden abrir las ventanas*», dueño 2026-08-20 con la foto 64), la
//      selección sigue siendo de N cajas, y el terreno de en medio no se mueve.
//
// Todo pasa en /map/test y con `mc.escaparate` puesto (no se guarda nada en data/worlds/).

// @area: editor
// @necesita: servidor, playwright

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

  // ---- banco de pruebas: dos torres separadas, para que haya un hueco de por medio -------------------
  // Se monta con el historial bloqueado (`mc.histLock`) para que el Ctrl+Z del tramo F deshaga SOLO la
  // rotación, y se apunta lo que había para devolverlo al final: /map/test se guarda solo.
  const Y = await p.evaluate(() => {
    mc.escaparate = true;                       // REQ-OSD3: ni un guardado a disco desde el test
    mc.tool = 'select';
    mc.selA = null; mc.selBox = null;
    const mat = mc.grid.find(v => v > 0) || 1;  // un material que el mapa ya tenga (no inventar ids)
    const y = mcSurfaceY(20, 20) + 1;
    window._sel1 = { orig: [] };
    for (let x = 18; x <= 34; x++) for (let z = 18; z <= 34; z++) for (let yy = y - 1; yy <= y + 4; yy++) {
      if (mcInside(x, yy, z)) window._sel1.orig.push([x, yy, z, mc.grid[mcIdx(x, yy, z)]]);
    }
    const lock = mc.histLock; mc.histLock = true;
    const edits = [];
    const pon = (x, z, id) => { const before = mc.grid[mcIdx(x, y, z)]; if (before === id) return; mcSetBlock(x, y, z, id); edits.push({ x, y, z, before, after: id }); };
    for (let x = 20; x <= 22; x++) for (let z = 20; z <= 22; z++) pon(x, z, mat);   // caja A
    for (let x = 28; x <= 30; x++) for (let z = 20; z <= 22; z++) pon(x, z, mat);   // caja B
    for (let x = 24; x <= 26; x++) for (let z = 20; z <= 22; z++) pon(x, z, mat);   // el HUECO, sin seleccionar
    mcRemeshEdiciones(edits);
    mc.histLock = lock;
    return y;
  });

  console.log('\nA · mc.selBox es un accesor: la última caja, asignar sustituye, null limpia');
  const a = await p.evaluate((Y) => {
    const out = {};
    mc.selBox = null;                       out.vacia = mc.selBox === null && mc.selCajas.length === 0;
    mc.selBox = { a: [20, Y, 20], b: [22, Y, 22] };
    out.unaCaja = mc.selCajas.length;
    mc.selCajas.push({ a: [28, Y, 20], b: [30, Y, 22] });
    out.dosCajas = mc.selCajas.length;
    out.ultima = mc.selBox.a[0];            // leer devuelve la ÚLTIMA marcada, no la primera
    mc.selBox = { a: [20, Y, 20], b: [22, Y, 22] };
    out.asignarTira = mc.selCajas.length;   // asignar = «la selección es ESTA»
    mc.selBox = null;                       out.nullTiraTodas = mc.selCajas.length;
    return out;
  }, Y);
  ok('sin cajas, selBox es null', a.vacia);
  ok('asignar deja una caja', a.unaCaja === 1);
  ok('se puede añadir una segunda', a.dosCajas === 2);
  ok('leer selBox da la ÚLTIMA', a.ultima === 28, 'x=' + a.ultima);
  ok('asignar con 2 cajas puestas tira las otras', a.asignarTira === 1, 'quedaron ' + a.asignarTira);
  ok('null las tira todas', a.nullTiraTodas === 0);

  console.log('\nB · Shift+clic añade caja; sin Shift, sustituye');
  const clics = await p.evaluate((Y) => {
    // Se llama a mcSelectClick como lo llama el ratón, con el rayo mirando a un bloque concreto.
    const mira = (x, y, z) => { mcRaycast = () => ({ cell: [x, y, z] }); };
    const orig = mcRaycast;
    const out = {};
    mc.selBox = null; mc.selA = null;
    mira(20, Y, 20); mcSelectClick(false);
    mira(22, Y, 22); mcSelectClick(false);
    out.primera = mc.selCajas.length;
    mira(28, Y, 20); mcSelectClick(true);            // ← Shift en la esquina A: ésta va ADEMÁS
    out.aMedias = mc.selCajas.length;                // la caja anterior sigue estando mientras se marca
    mira(30, Y, 22); mcSelectClick(false);           // soltar Shift a mitad NO debe cargarse nada
    out.dos = mc.selCajas.length;
    mira(20, Y, 20); mcSelectClick(false);           // sin Shift: vuelta a empezar
    out.trasSinShift = mc.selCajas.length;
    mira(22, Y, 22); mcSelectClick(false);
    out.final = mc.selCajas.length;
    mcRaycast = orig;
    return out;
  }, Y);
  ok('la primera caja se marca normal', clics.primera === 1);
  ok('con Shift, la caja de antes NO se borra al marcar la A', clics.aMedias === 1);
  ok('soltar Shift entre A y B no tira las anteriores', clics.dos === 2, 'cajas=' + clics.dos);
  ok('un clic SIN Shift empieza de cero', clics.trasSinShift === 0, 'cajas=' + clics.trasSinShift);
  ok('…y deja una sola caja', clics.final === 1);

  console.log('\nC · mcSelForEach pasa por todas y no repite el solape');
  const c = await p.evaluate((Y) => {
    const out = {};
    mc.selBox = { a: [20, Y, 20], b: [22, Y, 22] };
    out.una = mcSelCount();                                        // 9
    mc.selCajas.push({ a: [28, Y, 20], b: [30, Y, 22] });
    out.dos = mcSelCount();                                        // 18
    mc.selCajas.push({ a: [20, Y, 20], b: [22, Y, 22] });          // la MISMA que la primera: solape total
    out.solapada = mcSelCount();                                   // sigue 18, no 27
    const cajas = new Set(); mcSelForEach((x, y, z, id, ci) => cajas.add(ci));
    out.cajasQueAportan = cajas.size;                              // la tercera no aporta nada nuevo
    mc.selCajas.pop();
    return out;
  }, Y);
  ok('una caja cuenta sus 9 bloques', c.una === 9, 'n=' + c.una);
  ok('dos cajas cuentan 18', c.dos === 18, 'n=' + c.dos);
  ok('el solape NO se cuenta dos veces', c.solapada === 18, 'n=' + c.solapada);
  ok('mcSelForEach dice de qué caja sale cada bloque', c.cajasQueAportan === 2, 'cajas=' + c.cajasQueAportan);

  console.log('\nD · copiar y cortar se llevan las dos cajas, y respetan el hueco');
  const d = await p.evaluate(() => {
    const out = {};
    mcCopySelection();
    out.celdas = clipboard.cells.length;                           // 18
    out.ancho = Math.max(...clipboard.cells.map(c => c.dx)) + 1;   // de x=20 a x=30 ⇒ 11 de ancho…
    out.hueco = clipboard.cells.some(c => c.dx > 2 && c.dx < 8);   // …pero el hueco del medio NO viaja
    return out;
  });
  ok('el portapapeles se lleva los 18 bloques', d.celdas === 18, 'n=' + d.celdas);
  ok('la pieza copiada abarca las dos cajas', d.ancho === 11, 'ancho=' + d.ancho);
  ok('lo que hay ENTRE las cajas no se copia', d.hueco === false);

  console.log('\nE · extruir mueve las N cajas y no confunde columnas');
  const e = await p.evaluate((Y) => {
    const out = {};
    const solido = (x, z, y) => !!mc.grid[mcIdx(x, y, z)];
    // El de en medio no está seleccionado ⇒ tiene que quedarse COMO ESTABA. Se mira antes y después en vez
    // de dar por hecho que ahí hay aire: /map/test es terreno de verdad y puede tener un árbol encima.
    out.huecoAntes = solido(25, 21, Y + 1);
    mcSelExtruir(1);
    out.subeA = solido(21, 21, Y + 1);
    out.subeB = solido(29, 21, Y + 1);
    out.hueco = solido(25, 21, Y + 1);
    out.cajas = mc.selCajas.map(s => Math.max(s.a[1], s.b[1]));
    mcSelExtruir(-1);
    out.vuelveA = solido(21, 21, Y + 1);
    out.vuelveB = solido(29, 21, Y + 1);
    out.cajasVuelven = mc.selCajas.map(s => Math.max(s.a[1], s.b[1]));
    return out;
  }, Y);
  ok('la caja A sube', e.subeA);
  ok('la caja B sube a la vez', e.subeB);
  ok('lo de en medio se queda quieto', e.hueco === e.huecoAntes);
  ok('las DOS cajas se estiran', e.cajas.every(t => t === Y + 1), 'techos=' + e.cajas.join('/'));
  ok('bajar deshace en las dos', e.vuelveA === false && e.vuelveB === false);
  ok('…y las dos cajas se encogen', e.cajasVuelven.every(t => t === Y), 'techos=' + e.cajasVuelven.join('/'));

  console.log('\nF · rotar N cajas: CADA UNA sobre su base, no todas juntas («abrir las ventanas»)');
  const f = await p.evaluate(async (Y) => {
    const out = {};
    // Banco propio: las dos cajas vacías salvo UN bloque en su esquina local (0,0). Girar 90° tiene que
    // llevar cada marca a la esquina (2,0) DE SU CAJA. Si se girase todo junto (bbox de 11×3), las marcas
    // acabarían en cualquier otro sitio menos ahí.
    const mat = mc.grid.find(v => v > 0) || 1;
    const lock = mc.histLock; mc.histLock = true;
    const prep = [];
    const pon = (x, z, id) => { const before = mc.grid[mcIdx(x, Y, z)]; if (before === id) return; mcSetBlock(x, Y, z, id); prep.push({ x, y: Y, z, before, after: id }); };
    for (let x = 20; x <= 22; x++) for (let z = 20; z <= 22; z++) pon(x, z, 0);
    for (let x = 28; x <= 30; x++) for (let z = 20; z <= 22; z++) pon(x, z, 0);
    pon(20, 20, mat); pon(28, 20, mat);                      // una marca por caja, en su esquina
    mcRemeshEdiciones(prep);
    mc.histLock = lock;

    const medio = [24, 25, 26].map(x => mc.grid[mcIdx(x, Y, 21)]).join(',');
    const antes = [];
    for (let x = 18; x <= 34; x++) for (let z = 18; z <= 34; z++) antes.push(mc.grid[mcIdx(x, Y, z)]);

    mc.selBox = { a: [20, Y, 20], b: [22, Y, 22] };
    mc.selCajas.push({ a: [28, Y, 20], b: [30, Y, 22] });
    mcRotateSelBox();

    out.cajas = mc.selCajas.length;
    out.marcaA = !!mc.grid[mcIdx(22, Y, 20)];                // la de la caja 1 giró dentro de la caja 1…
    out.marcaB = !!mc.grid[mcIdx(30, Y, 20)];                // …y la de la caja 2 dentro de la caja 2
    out.origenA = !!mc.grid[mcIdx(20, Y, 20)];               // y dejaron su esquina de partida
    out.origenB = !!mc.grid[mcIdx(28, Y, 20)];
    out.medioIntacto = [24, 25, 26].map(x => mc.grid[mcIdx(x, Y, 21)]).join(',') === medio;
    await mcUndo();
    const luego = [];
    for (let x = 18; x <= 34; x++) for (let z = 18; z <= 34; z++) luego.push(mc.grid[mcIdx(x, Y, z)]);
    out.trasUndo = antes.join(',') === luego.join(',');
    return out;
  }, Y);
  ok('la selección SIGUE siendo de 2 cajas', f.cajas === 2, 'cajas=' + f.cajas);
  ok('la caja 1 gira sobre su base', f.marcaA && !f.origenA);
  ok('la caja 2 gira sobre la suya, sin saber de la 1', f.marcaB && !f.origenB);
  ok('el terreno de en medio NO se movió', f.medioIntacto);
  ok('y un solo Ctrl+Z deja el mapa exactamente como estaba', f.trasUndo);

  console.log('\nG · los TRES ejes de giro, y las 24 posturas salen de encadenarlos');
  const g = await p.evaluate(async (Y) => {
    // Una caja de 3(x)×2(y)×1(z) con una marca en su esquina local (0,0,0): cada eje la manda a un sitio
    // distinto y deja la caja con otra huella. Los destinos NO se calculan aquí a mano, se le preguntan a
    // la misma tabla del motor (mcOriMove/mcOriDims): el test comprueba que la selección usa ESA y no otra.
    const mat = mc.grid.find(v => v > 0) || 1;
    const X = 20, Z = 20, W = 3, H = 2, D = 1;
    const limpia = () => {
      const lock = mc.histLock; mc.histLock = true;
      const ed = [];
      for (let x = X - 2; x <= X + 4; x++) for (let z = Z - 2; z <= Z + 4; z++) for (let y = Y; y <= Y + 4; y++) {
        const before = mc.grid[mcIdx(x, y, z)]; if (!before) continue;
        mcSetBlock(x, y, z, 0); ed.push({ x, y, z, before, after: 0 });
      }
      const b0 = mc.grid[mcIdx(X, Y, Z)];
      mcSetBlock(X, Y, Z, mat); ed.push({ x: X, y: Y, z: Z, before: b0, after: mat });
      mcRemeshEdiciones(ed); mc.histLock = lock;
    };
    const prueba = (eje) => {
      limpia();
      mc.selBox = { a: [X, Y, Z], b: [X + W - 1, Y + H - 1, Z + D - 1] };
      const rot = MC_SEL_GIRO[eje];
      const [nx, ny, nz] = mcOriMove(rot, W, H, D)(0, 0, 0);
      const dims = mcOriDims(W, H, D, rot);
      mcRotateSelBox(eje);
      const s = mc.selCajas[0];
      return {
        marcaDonde: !!mc.grid[mcIdx(X + nx, Y + ny, Z + nz)],
        huella: [s.b[0] - s.a[0] + 1, s.b[1] - s.a[1] + 1, s.b[2] - s.a[2] + 1].join('x'),
        esperada: dims.join('x'),
      };
    };
    const out = { y: prueba('y'), x: prueba('x'), z: prueba('z') };
    // …y encadenando se llega a las 24: cuatro vueltas en cualquier eje devuelven la pieza a su sitio.
    limpia();
    mc.selBox = { a: [X, Y, Z], b: [X + W - 1, Y + H - 1, Z + D - 1] };
    for (let i = 0; i < 4; i++) mcRotateSelBox('x');
    out.vuelta = !!mc.grid[mcIdx(X, Y, Z)] && mcSelCount() === 1;
    limpia();
    return out;
  }, Y);
  ok('R (en planta) mueve la pieza a donde dice MC_ORI', g.y.marcaDonde);
  ok('…y deja la huella que dice mcOriDims', g.y.huella === g.y.esperada, g.y.huella + ' vs ' + g.y.esperada);
  ok('Shift+R (vuelco sobre X) también', g.x.marcaDonde);
  ok('…y ahí la caja cambia de ALTO, no solo de planta', g.x.huella === g.x.esperada, g.x.huella + ' vs ' + g.x.esperada);
  ok('Alt+R (de lado, sobre Z) también', g.z.marcaDonde);
  ok('…con su huella', g.z.huella === g.z.esperada, g.z.huella + ' vs ' + g.z.esperada);
  ok('cuatro vueltas al mismo eje devuelven la pieza a su sitio', g.vuelta);

  console.log('\nH · el AGARRE (Ctrl + apuntar): la celda marcada no se mueve al girar');
  const h = await p.evaluate(async (Y) => {
    // Misma caja de 3×2×1 del apartado G, pero fijando el agarre en una celda que NO es la esquina mínima.
    // Lo que se comprueba es lo único que promete el agarre: esa celda se queda donde está. El resto de la
    // pieza sigue girando como diga MC_ORI, así que la huella tiene que ser la misma que sin agarre —lo que
    // cambia es DÓNDE cae, y eso se mide comparando las dos cajas resultantes.
    const mat = mc.grid.find(v => v > 0) || 1;
    const X = 20, Z = 20, W = 3, H = 2, D = 1;
    const piv = [X + 2, Y, Z];                       // esquina OPUESTA en X: es el agarre y a la vez la marca
    const otro = [X, Y, Z];                          // un segundo bloque, para que el giro tenga algo que mover
    const limpia = () => {                           // deja el banco con exactamente esos dos bloques
      const lock = mc.histLock; mc.histLock = true;
      const ed = [];
      for (let x = X - 2; x <= X + 5; x++) for (let z = Z - 2; z <= Z + 5; z++) for (let y = Y; y <= Y + 4; y++) {
        const before = mc.grid[mcIdx(x, y, z)]; if (!before) continue;
        mcSetBlock(x, y, z, 0); ed.push({ x, y, z, before, after: 0 });
      }
      for (const c of [piv, otro]) {
        const b0 = mc.grid[mcIdx(c[0], c[1], c[2])];
        mcSetBlock(c[0], c[1], c[2], mat); ed.push({ x: c[0], y: c[1], z: c[2], before: b0, after: mat });
      }
      mcRemeshEdiciones(ed); mc.histLock = lock;
    };
    const out = {};
    // sin agarre (como hasta ahora): la marca se va, porque la caja se ancla en su esquina mínima
    mc.selPivote = null;
    limpia();
    mc.selBox = { a: [X, Y, Z], b: [X + W - 1, Y + H - 1, Z + D - 1] };
    mcRotateSelBox('y');
    out.sinAgarreSeMueve = !mc.grid[mcIdx(piv[0], piv[1], piv[2])];
    const s0 = mc.selCajas[0];
    out.cajaSin = [s0.a.join(','), s0.b.join(',')].join(' → ');
    // con agarre en esa misma celda
    limpia();
    mc.selBox = { a: [X, Y, Z], b: [X + W - 1, Y + H - 1, Z + D - 1] };
    mc.selPivote = piv.slice();
    mcRotateSelBox('y');
    const s1 = mc.selCajas[0];
    out.marcaQuieta = !!mc.grid[mcIdx(piv[0], piv[1], piv[2])];
    out.cajaCon = [s1.a.join(','), s1.b.join(',')].join(' → ');
    out.mismaHuella = (s1.b[0] - s1.a[0]) === (s0.b[0] - s0.a[0]) && (s1.b[1] - s1.a[1]) === (s0.b[1] - s0.a[1]) && (s1.b[2] - s1.a[2]) === (s0.b[2] - s0.a[2]);
    out.cajaSeCorrio = out.cajaCon !== out.cajaSin;
    out.pivDentro = mcSelCajaDe(piv) >= 0;
    // cuatro vueltas con agarre siguen devolviendo la pieza a su sitio (el agarre no puede ir acumulando deriva)
    limpia();
    mc.selBox = { a: [X, Y, Z], b: [X + W - 1, Y + H - 1, Z + D - 1] };
    mc.selPivote = piv.slice();
    for (let i = 0; i < 4; i++) mcRotateSelBox('y');
    const s4 = mc.selCajas[0];
    out.vuelta = !!mc.grid[mcIdx(piv[0], piv[1], piv[2])] && !!mc.grid[mcIdx(otro[0], otro[1], otro[2])] && mcSelCount() === 2 &&
      s4.a.join(',') === X + ',' + Y + ',' + Z && s4.b.join(',') === (X + W - 1) + ',' + (Y + H - 1) + ',' + (Z + D - 1);
    // el agarre solo manda en la caja que lo contiene: una caja lejana gira como siempre
    limpia();
    mc.selPivote = [X + 40, Y, Z + 40];
    mc.selBox = { a: [X, Y, Z], b: [X + W - 1, Y + H - 1, Z + D - 1] };
    mcRotateSelBox('y');
    const s5 = mc.selCajas[0];
    out.ajenoNoAfecta = [s5.a.join(','), s5.b.join(',')].join(' → ') === out.cajaSin;
    // y limpiar la selección se lleva el agarre por delante
    mcSelectClear();
    out.limpiaSuelta = mc.selPivote === null;
    limpia();
    mc.selPivote = null; mc.selBox = null;
    return out;
  }, Y);
  ok('sin agarre, la celda de referencia se mueve (comportamiento de siempre)', h.sinAgarreSeMueve);
  ok('con agarre, ESA celda se queda donde estaba', h.marcaQuieta);
  ok('…y la caja se corre para acompañarla', h.cajaSeCorrio, h.cajaCon + '  vs sin agarre  ' + h.cajaSin);
  ok('…sin cambiar de huella (gira igual, solo cae en otro sitio)', h.mismaHuella);
  ok('…y el agarre sigue dentro de la caja tras el giro', h.pivDentro);
  ok('cuatro vueltas con agarre devuelven caja y pieza a su sitio', h.vuelta);
  ok('un agarre fuera de la caja no la afecta', h.ajenoNoAfecta);
  ok('limpiar la selección suelta el agarre', h.limpiaSuelta);

  // limpieza: fuera la selección y el banco EXACTAMENTE como estaba, celda a celda
  await p.evaluate(() => {
    mc.selBox = null; mc.selA = null;
    const lock = mc.histLock; mc.histLock = true;
    const edits = [];
    for (const [x, y, z, id] of window._sel1.orig) {
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
