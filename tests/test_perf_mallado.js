// @area: render
// @necesita: servidor, playwright
// Entrar a un mapa costaba ~9 s con el hilo principal clavado ("se puede jugar, pero trabado a 0 fps"). Dos causas,
// las dos de trabajo REPETIDO, ninguna de dibujar:
//
//   1. `mcComputeLight` es una funcion PURA de (rejilla + tablas de luz + dim + interiorDark) y se llamaba 5 veces
//      por entrada con las mismas entradas: ~1 s de skylight tirado cada vez. El snippet `perf-mallado` la memoriza
//      por firma, y ademas agrupa los `mcMeshAll` que `mcCalientaFina` hacia UNO POR MATERIAL fino que llegaba tarde.
//   2. `pideRemallado` (en `mundo-autoarranque`) hacia `mcMeshAll()` y acto seguido `mcRestampAll()`, que termina con
//      su PROPIO `mcMeshAll()` cuando la luz de bloque ha cambiado — y al arrancar SIEMPRE ha cambiado. El primer
//      mallado, dos segundos, se tiraba entero. Ahora se restampa primero y solo se malla si el restamp no llego.
//
// Este guardian vigila lo unico que puede empeorar con esos dos atajos: **que la luz salga distinta** o **que el
// terreno se quede a medio mallar**. Por eso no mide milisegundos (eso miente en cualquier maquina cargada): compara
// la luz celda a celda contra la funcion original y comprueba que forzar un mallado mas no cambia nada.
//
// No persiste nada: bloquea los POST, devuelve las celdas que toca y deja el memo como estaba.
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
  await p.waitForTimeout(8000);   // que el autoarranque acabe: los `define` y su remallado van despues de la carga

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const iguales = (a, c) => {
      if (!a || !c || a.length !== c.length) return false;
      for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) return false;
      return true;
    };
    const huella = a => { let h = 0x811c9dc5; if (!a) return 'nula'; for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619); return (h >>> 0) + '/' + a.length; };
    const quads = () => { let q = 0, f = 0; for (const ch of mc.chunks.values()) { q += ch.count | 0; f += (ch.finoCount | 0) + (ch.finoACount | 0); } return { q, f }; };

    // ── 1 · lo instala el autoarranque, no este test ──────────────────────────────────────────────────────
    // Es la mitad del guardian: si el enganche de `mundo-autoarranque` se pierde en un merge, el snippet sigue
    // publicado y verde por su cuenta, pero ya no lo usa nadie.
    out.instaladoSolo = !!(window.game && game.perfMallado);
    if (!out.instaladoSolo) { out.errs.push('el autoarranque no engancho perf-mallado'); return out; }
    out.estadoInicial = game.perfMallado.estado();

    // ── 2 · se planta terreno propio: `/map/test` viene vacio ────────────────────────────────────────────
    // Sin un solo voxel solido no hay sombra que calcular ni cara que mallar, y todo lo de abajo pasaria por
    // el lado bueno sin comprobar nada (0 quads == 0 quads). Se guarda cada celda para devolverla al final.
    const pausa = mc.paused; mc.paused = true;               // congela agentes y fluidos, que mueven la rejilla
    const rejVirgen = huella(mc.grid);
    const MAT = 1;                                         // el primer material real de la paleta
    const plantadas = [];
    const X0 = 8, Z0 = 8, Y0 = 2;
    for (let x = X0; x < X0 + 16; x++) for (let z = Z0; z < Z0 + 16; z++) for (let y = Y0; y < Y0 + 3; y++) {
      const i = mcIdx(x, y, z);
      plantadas.push([i, mc.grid[i]]);
      mc.grid[i] = MAT;
    }
    out.plantadas = plantadas.length;
    game.perfMallado.olvidar();                              // la rejilla ya no es la de la firma guardada
    mcComputeLight();
    mcMeshAll();

    // La malla que queda es la definitiva: mallar otra vez no puede cambiarla. Es lo que garantiza que el
    // nuevo orden de `pideRemallado` (restampar y mallar UNA vez) no deja el terreno a medias.
    const rejAntes = huella(mc.grid), luzAntes = huella(mc.light), mallaAntes = quads();
    mcMeshAll();
    const mallaDespues = quads();
    out.hayGeometria = mallaAntes.q > 0;
    out.rejillaQuieta = rejAntes === huella(mc.grid);
    out.luzYaDefinitiva = luzAntes === huella(mc.light);
    out.mallaYaDefinitiva = mallaAntes.q === mallaDespues.q && mallaAntes.f === mallaDespues.f;
    out.quads = [mallaAntes.q, mallaDespues.q];
    out.finos = [mallaAntes.f, mallaDespues.f];

    // ── 3 · la luz memorizada es la MISMA, celda a celda ──────────────────────────────────────────────────
    const orig = mcComputeLight._orig;
    out.hayOriginal = typeof orig === 'function';
    game.perfMallado.olvidar();
    mcComputeLight();                                        // fallo de firma: la calcula de verdad
    const memorizada = mc.light.slice();
    orig.call(window);                                       // y ahora la verdad, sin memo por medio
    out.luzIgual = iguales(mc.light, memorizada);
    out.celdas = mc.light.length;

    // ── 4 · un acierto NO recalcula, y el resultado sigue en pie ──────────────────────────────────────────
    // Se cuenta con los contadores del snippet, no con el reloj: los milisegundos mienten en una maquina cargada.
    const a0 = game.perfMallado.estado().luz;
    mcComputeLight(); mcComputeLight();
    const a1 = game.perfMallado.estado().luz;
    out.aciertos = a1.aciertos - a0.aciertos;
    out.fallosDeMas = a1.fallos - a0.fallos;
    out.luzIgualTrasAciertos = iguales(mc.light, memorizada);

    // ── 5 · si la rejilla cambia, la firma FALLA y se recalcula ───────────────────────────────────────────
    // Lo caro de un memo no es que sea lento: es que devuelva luz vieja. Se vacian celdas solidas de verdad y
    // se guarda su valor para dejarlas como estaban.
    const tocadas = [];
    for (let i = 0; i < mc.grid.length && tocadas.length < 400; i++) if (mc.grid[i]) { tocadas.push([i, mc.grid[i]]); mc.grid[i] = 0; }
    out.celdasVaciadas = tocadas.length;
    const b0 = game.perfMallado.estado().luz;
    mcComputeLight();
    out.recalculoTrasCambio = game.perfMallado.estado().luz.fallos - b0.fallos === 1;
    const memoTrasCambio = mc.light.slice();
    orig.call(window);
    out.luzIgualTrasCambio = iguales(mc.light, memoTrasCambio);
    out.luzCambioDeVerdad = !iguales(memoTrasCambio, memorizada);   // si no cambia, el caso no probaba nada

    for (const [i, v] of tocadas) mc.grid[i] = v;            // se devuelve la rejilla
    game.perfMallado.olvidar();
    mcComputeLight();
    out.luzRestaurada = iguales(mc.light, memorizada);

    // ── 6 · off() devuelve el motor byte a byte (ley de oro) ──────────────────────────────────────────────
    const finaOrig = mcCalientaFina._orig;
    game.perfMallado.off();
    out.offDevuelveOriginal = (window.mcComputeLight === orig) && (window.mcCalientaFina === finaOrig);
    out.offLoDice = game.perfMallado.estado().luz.puesta === false;
    game.perfMallado.on();
    out.onVuelveAPoner = game.perfMallado.estado().luz.puesta === true && mcComputeLight._orig === orig;

    // ── 7 · se recoge lo plantado: el mapa queda como se lo encontro ──────────────────────────────────────
    for (const [i, v] of plantadas) mc.grid[i] = v;
    out.rejillaVirgen = huella(mc.grid) === rejVirgen;
    game.perfMallado.olvidar();
    mcComputeLight();
    mcMeshAll();
    out.mallaVacia = quads().q === 0;
    mc.paused = pausa;
    out.estadoFinal = game.perfMallado.estado();
    return out;
  });

  // El parche de `pideRemallado` vive dentro de `mundo-autoarranque`, en un closure al que no se llega desde la
  // pagina. Se comprueba donde SI se puede: en el snippet publicado, que es lo que baja cada visitante. Un merge
  // que se lleve el parche por delante cae aqui.
  const auto = await (await fetch('http://localhost:8500/api/snippets/mundo-autoarranque')).json();
  const codigo = (auto && auto.code) || '';

  if (r.errs && r.errs.length) r.errs.forEach(e => ok('preparacion: ' + e, false));

  console.log('\nEl autoarranque publicado lleva los dos parches');
  ok('mundo-autoarranque se descarga', codigo.length > 1000, codigo.length + ' bytes');
  ok('pideRemallado malla UNA vez (marca PERF-MALLADO)', codigo.includes('==PERF-MALLADO=='));
  ok('decide mirando mc.blockLightMeshed, no adivinando', codigo.includes('mc.blockLightMeshed === luzAntes'));
  ok('engancha perf-mallado, y lo primero', codigo.includes('==PERF-MALLADO-ENGANCHE==') &&
    codigo.indexOf('==PERF-MALLADO-ENGANCHE==') < codigo.indexOf('game.bloques.define'));
  ok('con red de seguridad si el snippet no esta publicado', /catch[^]{0,120}perf-mallado no se pudo cargar/.test(codigo));

  console.log('\nLo engancha el autoarranque (no este test)');
  ok('game.perfMallado existe al entrar al mapa', r.instaladoSolo === true,
    r.estadoInicial ? r.estadoInicial.version + ' · ' + r.estadoInicial.luz.aciertos + ' aciertos / ' + r.estadoInicial.luz.fallos + ' fallos en la carga' : '');
  // En un mapa vacio no hay nada que ahorrar; lo que se guarda aqui es que la memoria estaba PUESTA desde el
  // principio de la carga (lo que cuesta caro es engancharla tarde: llega con la tabla vacia y no ahorra nada).
  ok('la memoria ya estaba puesta durante la carga', !!(r.estadoInicial && r.estadoInicial.luz.puesta &&
    (r.estadoInicial.luz.aciertos + r.estadoInicial.luz.fallos) > 0),
    r.estadoInicial ? r.estadoInicial.luz.msAhorrados + ' ms de skylight ahorrados, ' + r.estadoInicial.fina.malladosAhorrados + ' mallados agrupados' : '');

  console.log('\nEl terreno queda mallado del todo (nuevo orden de pideRemallado)');
  ok('se planto terreno para tener algo que mallar', r.hayGeometria === true, r.plantadas + ' celdas plantadas');
  ok('la rejilla no se movio durante la medida', r.rejillaQuieta === true);
  ok('la malla que hay ya es la definitiva', r.mallaYaDefinitiva === true,
    'quads ' + JSON.stringify(r.quads) + ' · finos ' + JSON.stringify(r.finos));
  ok('y la luz tambien', r.luzYaDefinitiva === true);

  console.log('\nLa luz memorizada es la de siempre');
  ok('la original sigue guardada en _orig', r.hayOriginal === true);
  ok('identica celda a celda', r.luzIgual === true, r.celdas + ' celdas');
  ok('un acierto no recalcula', r.aciertos === 2 && r.fallosDeMas === 0, r.aciertos + ' aciertos, ' + r.fallosDeMas + ' fallos');
  ok('y no estropea la luz que ya habia', r.luzIgualTrasAciertos === true);

  console.log('\nSi la rejilla cambia, la firma falla y se recalcula');
  ok('se vaciaron celdas solidas de verdad', r.celdasVaciadas === 400, r.celdasVaciadas + ' celdas');
  ok('el cambio altera la luz (el caso prueba algo)', r.luzCambioDeVerdad === true);
  ok('el memo NO la da por buena', r.recalculoTrasCambio === true);
  ok('y lo recalculado es identico a la original', r.luzIgualTrasCambio === true);

  console.log('\nReversible byte a byte (ley de oro)');
  ok('off() devuelve mcComputeLight y mcCalientaFina originales', r.offDevuelveOriginal === true);
  ok('y el estado lo cuenta', r.offLoDice === true);
  ok('on() lo vuelve a poner', r.onVuelveAPoner === true);

  console.log('');
  ok('limpieza: la luz vuelve a su valor', r.luzRestaurada === true);
  ok('limpieza: el mapa queda sin lo plantado', r.rejillaVirgen === true && r.mallaVacia === true);
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos === 0 ? '\ntodo ok' : '\n' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();
