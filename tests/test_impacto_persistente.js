// @area: general
// @necesita: servidor, playwright
//
// REQ-IMPACTO2 · lo que el dueño vio al probar `alImpactar` de verdad (2026-09-03):
//
//   1. «aunque sale el toast, no desaparece el farolillo […] si rompo un bloque si desaparece».
//      Y era un fallo: `retirarCogido` borraba la celda con `mcSetBlock`, que NO REMALLA
//      (app.js:8105). El bloque estaba borrado y el chunk lo seguia dibujando. El pico no lo tenia
//      porque `mcBreak` remalla el solo, de ahi que solo pasara con la flecha.
//
//   2. «cuando desaparece es persistente, si recargo el mapa ya no lo tengo mas, me gustaria que al
//      refrescar pudiese volver a aparecer, que sea algo que pueda controlar con alguna otra
//      variable» → `persistente`, por defecto true.
//
// COMO SE COMPRUEBA QUE «VUELVE AL RECARGAR» SIN RECARGAR: recargar el mapa aqui costaria un
// segundo `goto` y un mundo entero, y ademas dependeria del autoguardado. Lo que decide de verdad
// si vuelve es DONDE queda apuntada la celda: `persistente:false` la mete en la CAPA VOLATIL
// (`mc.volatil`, app.js:8152), que apunta el id que habia y hace que quien guarde escriba ESE y no
// el 0. Si la celda esta en `mc.volatil` con su id original, el fichero conserva el bloque. Eso es
// lo que se mira, y es una afirmacion mas fuerte que un recargado que podria colar por casualidad.
//
// ⛔ Planta y recoge en /map/test. Nunca en /map/default ni /map/agents.
//
// ⚠️ /map/test ESTA VACIO: `mc.grid` es todo aire y el jugador cae hasta y=0. Este test daba por
// hecho que habia suelo bajo los pies, asi que §1, §2 y §4 median el vacio y fallaban las ocho
// comprobaciones sin que el motor tuviera nada roto. Ahora CADA SECCION PLANTA LO SUYO con
// `setVoxel` (la puerta buena: valida y remalla; la de abajo, `mcSetBlock`, ni remalla ni valida el
// indice — app.js:8105) en una celda propia y fija, y lo recoge al salir. Nada depende ya de donde
// acabe cayendo el jugador.
//
// Hubo un flaky aqui (~1 de cada 6, «clave= id=0») que parecia una carrera de tiempo y no lo era:
// era una carrera DE ARRANQUE. La explicacion vive junto al `mc.active` del waitForFunction de §0.
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || process.env.VOXEL_PUERTO || 8500);

// ⏱️ EL PRESUPUESTO SE IMPONE, NO SE CONFIA. Este test llego a colgarse 9 minutos y hubo que
// matarlo a mano; el dueño lo zanjo el 2026-09-03: «que no tarde mas de 1 minuto». La causa de que
// se pueda colgar es concreta: `p.evaluate()` NO TIENE TIMEOUT (al contrario que `goto` o
// `waitForFunction`), asi que si el codigo de dentro no resuelve —`game.snippet()` devuelve una
// promesa— la espera es eterna y sin decir donde. De ahi los dos relojes de abajo.
const TOPE_MS = 60000;        // el minuto del dueño, para el test entero
const TOPE_PASO_MS = 15000;   // y ningun ida y vuelta al navegador puede pasar de aqui

let ok = 0, fail = 0;
const T0 = Date.now();
const seg = () => ('    ' + ((Date.now() - T0) / 1000).toFixed(1)).slice(-6) + 's ';
const paso = (n) => console.log('\n' + seg() + n);
const t = (n, c, extra) => {
  if (c) { ok++; console.log(seg() + '  ok  ' + n + (extra ? '   (' + extra + ')' : '')); }
  else { fail++; console.log(seg() + '  FALLA  ' + n + (extra ? '   (' + extra + ')' : '')); }
};

const despertador = setTimeout(() => {
  console.log('\n' + seg() + '  FALLA  ⏱️ el test paso de ' + (TOPE_MS / 1000) + 's: se corta aqui.\n'
    + '   Mira el ultimo §  impreso: lo que sigue a ese paso es lo que no vuelve.');
  process.exit(1);
}, TOPE_MS);

(async () => {
  const nav = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const p = await nav.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));

  // Un `p.evaluate` colgado deja el test mudo y eterno. Aqui muere con nombre y sitio.
  const ev = async (donde, fn, arg) => {
    let reloj;
    try {
      return await Promise.race([
        p.evaluate(fn, arg),
        new Promise((_, no) => {
          reloj = setTimeout(() => no(new Error(
            donde + ': el navegador no contesto en ' + (TOPE_PASO_MS / 1000) + 's')), TOPE_PASO_MS);
        })
      ]);
    } finally { clearTimeout(reloj); }
  };

  paso('§0 · abriendo /map/test?noauto=1');
  await p.goto(BASE + '/map/test?noauto=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => typeof window.game !== 'undefined' && window.game.bloques,
    null, { timeout: 30000 });
  paso('§0 · lanzando mundo-autoarranque a mano');
  await ev('§0 snippet', () => game.snippet('mundo-autoarranque'));
  // Se espera a la CAPACIDAD, no al reloj: el `waitForTimeout(1500)` de antes era una apuesta que
  // sobraba casi entera (todo queda listo ~40 ms despues de resolver el snippet) y que aun asi no
  // habria garantizado nada el dia que tardase mas.
  //
  // ⚠️ `mc.active` NO es adorno: es EL cerrojo. `window.setVoxel` (app.js:22275) enruta por el:
  // con `mc.active` falso manda la escritura al EDITOR (`_editSetVoxel` → `state.voxels`), no a la
  // rejilla del mundo — y `mc.active` se pone a true en la ULTIMA linea de openWorld (:22747),
  // despues del autoarranque. Sin esperarlo, §1 fallaba ~1 de cada 6 con «clave= id=0»: la plantada
  // no se perdia, se iba ENTERA al modelo del editor, y por eso ningun margen de espera la traia.
  await p.waitForFunction(() => typeof game.bloques.info === 'function'
    && typeof game.bloques.impacto === 'function'
    && typeof window.setVoxel === 'function' && !!mc.grid
    && mc.active === true, null, { timeout: TOPE_PASO_MS });

  // Una celda propia y fija por seccion, lejos del jugador y bien dentro del mundo (96×40×96).
  const CELDA = { s1: [40, 5, 40], s2: [42, 5, 40], s3: [44, 5, 40], s4: [46, 5, 40] };

  // Plantar bien tiene dos esperas, y las dos hacen falta. Se instala una sola vez en `window`
  // porque cada `p.evaluate` va en su propio ambito y no se pueden compartir funciones de aqui.
  await ev('§0 utileria', () => {
    window.plantaBloque = async function (bx, by, bz) {
      // Se planta por la CLAVE que este mundo YA tiene en su paleta: no hay nada que resolver ni
      // que descargar, asi que la escritura no puede acabar aplazada en `mcPendCel` esperando una
      // textura (mcMatPendiente, app.js:22096). El sondeo de abajo cubre justo ese aplazamiento si
      // algun dia la clave elegida lo necesitara.
      // (El flaky que se investigo aqui NO era esto: era `mc.active` — ver §0.)
      const clave = (mc.blockKey || []).find((k) => k);
      if (!clave) throw new Error('la paleta del mundo esta vacia: no hay nada que plantar');
      setVoxel(bx, by, bz, clave);
      const t0 = performance.now();
      while (!mc.grid[mcIdx(bx, by, bz)] && performance.now() - t0 < 3000) {
        await new Promise((r) => setTimeout(r, 25));
      }
      // Y se le deja drenar el remallado que deja en cola (80 ms, mcFlushBuild), para que el espia
      // de §1 no apunte como remesh del impacto el de la propia plantada.
      await new Promise((r) => setTimeout(r, 150));
      return mc.grid[mcIdx(bx, by, bz)];
    };
  });

  // ── §1 · el fallo del dueño: romper con la flecha tiene que REMALLAR ────────────────────────────
  paso('§1 · rejilla · persistente por defecto: se borra Y se remalla');
  const r1 = await ev('§1', async ([bx, by, bz]) => {
    const out = {};
    await plantaBloque(bx, by, bz);
    const idx = mcIdx(bx, by, bz), idAntes = mc.grid[idx];
    const clave = mc.blockKey[idAntes] || '';
    out.clave = clave; out.idAntes = idAntes;
    if (!clave) { out.error = 'setVoxel no planto nada en ' + [bx, by, bz]; return out; }
    // El espia: `mcRemeshAround` es EXACTAMENTE lo que faltaba, asi que se cuenta a el.
    const orig = window.mcRemeshAround; let veces = 0;
    window.mcRemeshAround = function () { veces++; return orig.apply(this, arguments); };
    game.bloques.define(clave, { nota: 'zz-test', alImpactar: 'romper' });
    out.res = game.bloques.impacto(bx + 0.5, by + 0.5, bz + 0.5);
    window.mcRemeshAround = orig;
    out.veces = veces;
    out.idDespues = mc.grid[idx];
    out.enVolatil = !!(mc.volatil && mc.volatil.has(idx));
    // recoger: la celda la planto este test, asi que se devuelve a AIRE (el impacto ya la vacio;
    // esto solo cierra el caso de que no llegara a romperse). Por NOMBRE, nunca por id.
    setVoxel(bx, by, bz, 'aire');
    game.bloques.quitar(clave);
    return out;
  }, CELDA.s1);
  t('§1 la celda queda a 0', r1.idDespues === 0, 'clave=' + r1.clave + ' id=' + r1.idAntes);
  t('§1 …y se REMALLA (era el fallo: se borraba sin mallar)', r1.veces >= 1, 'mcRemeshAround ×' + r1.veces);
  t('§1 …y NO va a la capa volatil: persistente es el defecto', r1.enVolatil === false);
  t('§1 el despacho se da por hecho', !!(r1.res && r1.res.listo && r1.res.accion === 'romper'),
    r1.res && r1.res.accion);

  // ── §2 · persistente:false · fuera de la vista, no del fichero ─────────────────────────────────
  paso('§2 · rejilla · persistente:false: se va de la vista, se queda en el fichero');
  const r2 = await ev('§2', async ([bx, by, bz]) => {
    const out = {};
    await plantaBloque(bx, by, bz);
    const idx = mcIdx(bx, by, bz), idAntes = mc.grid[idx];
    const clave = mc.blockKey[idAntes] || '';
    out.clave = clave; out.idAntes = idAntes;
    if (!clave) { out.error = 'setVoxel no planto nada en ' + [bx, by, bz]; return out; }
    game.bloques.define(clave, { nota: 'zz-test', alImpactar: 'romper', persistente: false });
    out.res = game.bloques.impacto(bx + 0.5, by + 0.5, bz + 0.5);
    out.idDespues = mc.grid[idx];
    out.apuntado = (mc.volatil && mc.volatil.has(idx)) ? mc.volatil.get(idx) : null;
    out.info = (game.bloques.lista() || []).length;
    // recoger
    if (typeof mcQuitaVolatil === 'function') mcQuitaVolatil(bx, by, bz);
    setVoxel(bx, by, bz, 'aire');
    game.bloques.quitar(clave);
    return out;
  }, CELDA.s2);
  t('§2 desaparece de la vista (la celda queda a 0)', r2.idDespues === 0, 'clave=' + r2.clave);
  t('§2 …pero el fichero conserva el bloque: queda apuntado en mc.volatil',
    r2.apuntado === r2.idAntes, 'apuntado=' + r2.apuntado + ' original=' + r2.idAntes);
  t('§2 …y el despacho se da igual', !!(r2.res && r2.res.listo), r2.res && r2.res.accion);

  // ── §3 · estructuras: la asimetria, dicha tal cual ─────────────────────────────────────────────
  paso('§3 · estructura fina · persistente decide si se GUARDA la cabecera');
  const r3 = await ev('§3', async ([bx, by, bz]) => {
    const out = {};
    const clave = 'asset:assets/farolillo-zen.vox.json';
    const espia = () => {
      const o = window.mcDirtyHeader; let n = 0;
      window.mcDirtyHeader = function () { n++; return o.apply(this, arguments); };
      return { fin: () => { window.mcDirtyHeader = o; return n; } };
    };
    // (a) persistente por defecto → la cabecera se marca sucia: la perdida es firme
    await game.stamp('farolillo-zen', bx, by, bz, 0);
    game.bloques.define(clave, { nota: 'zz-test', alImpactar: 'romper' });
    out.puesta = mc.structures.filter((s) => s.ox === bx && s.oy === by && s.oz === bz).length;
    let e = espia();
    out.resA = game.bloques.impacto(bx + 0.5, by + 0.5, bz + 0.5);
    out.sucioA = e.fin();
    out.quedaA = mc.structures.filter((s) => s.ox === bx && s.oy === by && s.oz === bz).length;

    // (b) persistente:false → NO se marca: al recargar la pieza vuelve
    await game.stamp('farolillo-zen', bx, by, bz, 0);
    game.bloques.define(clave, { nota: 'zz-test', alImpactar: 'romper', persistente: false });
    e = espia();
    out.resB = game.bloques.impacto(bx + 0.5, by + 0.5, bz + 0.5);
    out.sucioB = e.fin();
    out.quedaB = mc.structures.filter((s) => s.ox === bx && s.oy === by && s.oz === bz).length;
    game.bloques.quitar(clave);
    return out;
  }, CELDA.s3);
  t('§3 la estructura se planto', r3.puesta === 1, 'puesta=' + r3.puesta);
  t('§3 (a) persistente → la estructura se va', r3.quedaA === 0 && !!(r3.resA && r3.resA.listo));
  t('§3 (a) …y la cabecera se marca sucia: la perdida es firme', r3.sucioA >= 1,
    'mcDirtyHeader ×' + r3.sucioA);
  t('§3 (b) persistente:false → tambien se va de la vista', r3.quedaB === 0);
  t('§3 (b) …pero la cabecera NO se marca: al recargar vuelve', r3.sucioB === 0,
    'mcDirtyHeader ×' + r3.sucioB);

  // ── §4 · info() es el descubridor ──────────────────────────────────────────────────────────────
  paso('§4 · game.bloques.info() lo cuenta');
  const r4 = await ev('§4', async ([bx, by, bz]) => {
    await plantaBloque(bx, by, bz);
    const clave = mc.blockKey[mc.grid[mcIdx(bx, by, bz)]] || '';
    // ⚠️ `info()` mira BAJO LOS PIES DEL JUGADOR (`materialEn(p[0], p[1]-EPS_PIE, p[2])`), no una
    // celda cualquiera: hay que PONERSE ENCIMA del bloque plantado o la fila sale «(aire) · —».
    // En este mapa vacio el jugador cae a y=0, asi que bajo sus pies no hay mundo siquiera.
    const antes = mc.pos.slice();
    mc.pos[0] = bx + 0.5; mc.pos[1] = by + 1; mc.pos[2] = bz + 0.5;
    game.bloques.define(clave, { nota: 'zz-test', alImpactar: 'romper', persistente: false });
    // ⚠️ `info()` DEVUELVE la tabla (la pinta console.table, no console.log): espiar console.log
    // aqui no captura nada y el test mentiria diciendo que falta.
    const filas = game.bloques.info() || [];
    game.bloques.quitar(clave);
    mc.pos[0] = antes[0]; mc.pos[1] = antes[1]; mc.pos[2] = antes[2];
    setVoxel(bx, by, bz, 'aire');
    return filas.map((f) => f.donde + ': ' + f.comportamiento).join('\n');
  }, CELDA.s4);
  t('§4 info() dice «persistente:false (vuelve al recargar)»',
    /persistente:false/.test(r4), (r4.match(/persistente:false[^\n]*/) || [''])[0]);

  paso('§5 · sin errores de consola');
  t('§5 cero errores JS', errores.length === 0, errores.slice(0, 2).join(' | '));

  clearTimeout(despertador);
  console.log('\n' + seg() + ok + ' ok, ' + fail + ' fallos');
  await nav.close();
  process.exit(fail ? 1 : 0);
})();
