// @area: editor
// @necesita: servidor, playwright
// SONDA de `data/snippets/sel-cara-auto.json` (LEY DE ORO: validar en caliente antes de tocar app.js).
//
// Dueño (2026-08-29): «*se ha de detectar si hay aire para estruir solamente en uno de los lados y
// priorizar esa direccion sin necesidad de hacer clic con el boton central […] Si hay aire en mas una
// direccion arriba/abajo para control presionado, o adelante/hacia atras con shift presionado, no seria
// necesario priorizar nada*».
//
// Lo que se comprueba:
//   §1 Ctrl · suelo (aire arriba)      → cara NORMAL   · §2 Ctrl · techo (aire abajo) → cara OPUESTA
//   §3 Ctrl · aire en los DOS lados    → no se prioriza (null) y `mc.selOpuesta` NO se toca
//   §4 Ctrl · sin aire en ninguno      → tampoco
//   §5 Shift · acantilado (aire al frente)  → cara del FONDO · §6 Shift · cornisa (aire hacia ti) → ENFRENTE
//   §7 el cableado de verdad: la rueda construye hacia el aire aunque venga mal puesta de antes
//   §8 el clic central sigue mandando: marca la selección a mano y el automático no la vuelve a tocar
//   §10 con UN SOLO clic (caja fantasma, sin confirmar) también decide — el fallo que trajo la v2
//   §9 off() devuelve las cuatro funciones al motor
//
// Se trabaja en /map/test, sobre celdas que la propia sonda vacía antes y DEVUELVE al final.
// Puerto 8514 a propósito: el 8500 es el servidor del dueño y una sonda no se lo reinicia.

const { chromium } = require('playwright');

const PUERTO = process.env.PUERTO || 8514;
let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok   · ' : '  FALLA · ') + nom + (extra ? ' (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  // ?noauto=1: sin los snippets de autoarranque del mundo, que aquí sólo meterían ruido.
  await p.goto('http://localhost:' + PUERTO + '/map/test?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"',
    null, { timeout: 180000 });
  await p.waitForTimeout(1500);

  // ── el banco ────────────────────────────────────────────────────────────────────────────────────
  // Seis situaciones, cada una en su columna y separadas 4 celdas para que no se vean entre ellas.
  // Se monta con mc.histLock puesto: el decorado no entra en el historial.
  const base = await p.evaluate(() => {
    const X = 24, Z = 24, Y = 12;
    const id = mc.grid.find(v => v > 0) || 1;      // un material que el mapa ya tenga (no inventar ids)
    const orig = [];
    // Se guarda TODO el prisma que se va a tocar, para devolverlo tal cual al final.
    for (let x = X - 2; x <= X + 22; x++)
      for (let y = Y - 4; y <= Y + 4; y++)
        for (let z = Z - 2; z <= Z + 2; z++)
          orig.push([x, y, z, mc.grid[mcIdx(x, y, z)]]);
    // El §10 teletransporta el ojo para apuntar el rayo: se guarda dónde estaba el jugador.
    window._selAuto = { X, Y, Z, id, orig, pos: mc.pos.slice(), yaw: mc.yaw, pitch: mc.pitch };

    const lock = mc.histLock; mc.histLock = true;
    const edits = [];
    const pon = (x, y, z, v) => {
      const before = mc.grid[mcIdx(x, y, z)];
      if (before === v) return;
      mcSetBlock(x, y, z, v); edits.push({ x, y, z, before, after: v });
    };
    // Primero se vacía el prisma entero: el terreno de /map/test no debe decidir nada.
    for (let x = X - 2; x <= X + 22; x++)
      for (let y = Y - 4; y <= Y + 4; y++)
        for (let z = Z - 2; z <= Z + 2; z++) pon(x, y, z, 0);

    // §1 SUELO   (x=X)    : bloque en Y con roca debajo y aire encima
    pon(X, Y, Z, id); pon(X, Y - 1, Z, id); pon(X, Y - 2, Z, id);
    // §2 TECHO   (x=X+4)  : bloque en Y con roca encima y aire debajo
    pon(X + 4, Y, Z, id); pon(X + 4, Y + 1, Z, id); pon(X + 4, Y + 2, Z, id);
    // §3 FLOTANTE(x=X+8)  : bloque suelto, aire arriba y abajo
    pon(X + 8, Y, Z, id);
    // §4 ENTERRADO(x=X+12): bloque con roca arriba Y abajo
    pon(X + 12, Y, Z, id); pon(X + 12, Y + 1, Z, id); pon(X + 12, Y - 1, Z, id);
    // §5 ACANTILADO(x=X+16): roca detrás (−X, hacia el jugador), aire delante (+X)
    pon(X + 16, Y, Z, id); pon(X + 15, Y, Z, id);
    // §6 CORNISA (x=X+20) : roca delante (+X), aire detrás (hacia el jugador)
    pon(X + 20, Y, Z, id); pon(X + 21, Y, Z, id);
    mcRemeshEdiciones(edits);
    mc.histLock = lock;

    // Mirando a +X: mcEjeMirada() da eje 0, sN +1 ⇒ «delante» es +X y «hacia ti» es −X.
    mc.yaw = -Math.PI / 2; mc.pitch = 0;
    mc.tool = 'select'; mc.selA = null;
    return { X, Y, Z, id, eje: mcEjeMirada().nombre };
  });
  const { X, Y, Z, id } = base;
  ok('el eje de mirada es +X (el banco se lee de frente)', base.eje === '+X', base.eje);

  const r = await p.evaluate(() => game.snippet('sel-cara-auto'));
  console.log('  snippet →', r);
  ok('el snippet se puso', await p.evaluate(() => game.selAuto && game.selAuto.puesto() === true));

  // Pone la caja sobre UNA celda y devuelve lo que decidiría cada modo, sin tocar la rueda.
  const mira = (x, modo) => p.evaluate(([x, y, z, modo]) => {
    mc.selBox = { a: [x, y, z], b: [x, y, z] };
    mc.selCajas = [mc.selBox];
    game.selAuto.suelta();                          // cada caso empieza sin marca de clic central
    return game.selAuto.decide(modo);
  }, [x, Y, Z, modo]);

  console.log('\n§1 · Ctrl sobre un bloque del SUELO (aire arriba, roca abajo)');
  ok('prioriza la cara de ARRIBA (construir encima)', await mira(X, 'ctrl') === false);

  console.log('\n§2 · Ctrl sobre un bloque del TECHO (roca arriba, aire abajo)');
  ok('prioriza la cara de ABAJO (construir debajo)', await mira(X + 4, 'ctrl') === true);

  console.log('\n§3 · Ctrl sobre un bloque FLOTANTE (aire en los dos lados)');
  ok('no prioriza nada — lo pidió así el dueño', await mira(X + 8, 'ctrl') === null);

  console.log('\n§4 · Ctrl sobre un bloque ENTERRADO (sin aire en ninguno)');
  ok('tampoco prioriza nada', await mira(X + 12, 'ctrl') === null);

  console.log('\n§5 · Shift en el perfil de un ACANTILADO (aire sólo al frente)');
  ok('prioriza la cara del FONDO (crecer hacia adelante)', await mira(X + 16, 'shift') === true);

  console.log('\n§6 · Shift en una CORNISA lejana (aire sólo hacia el jugador)');
  ok('prioriza la cara de ENFRENTE (crecer hacia ti)', await mira(X + 20, 'shift') === false);

  console.log('\n§7 · el cableado de verdad: la rueda construye hacia el aire aunque venga mal puesta');
  const g = await p.evaluate(([x, y, z]) => {
    mc.selBox = { a: [x, y, z], b: [x, y, z] };
    mc.selCajas = [mc.selBox];
    game.selAuto.suelta();
    mc.selOpuesta = true;                           // MAL puesta a posta: diría «construye debajo»
    const antes = mc.selOpuesta;
    const hizo = mcSelExtruir(1);                   // Ctrl + rueda arriba
    return { antes, despues: mc.selOpuesta, hizo,
             encima: mc.grid[mcIdx(x, y + 1, z)], debajo: mc.grid[mcIdx(x, y - 2, z)] };
  }, [X, Y, Z]);
  ok('el automático corrigió la cara antes de la muesca', g.antes === true && g.despues === false);
  ok('…y el bloque salió ENCIMA, que es donde estaba el aire', g.hizo === true && g.encima === id);
  ok('…y no se cavó por abajo', g.debajo === id, 'debajo=' + g.debajo);

  console.log('\n§8 · el clic central sigue mandando: marca la selección a mano');
  const h = await p.evaluate(([x, y, z]) => {
    mc.selBox = { a: [x, y, z], b: [x, y, z] };
    mc.selCajas = [mc.selBox];
    game.selAuto.suelta();
    mcSelConmutaCaraOpuesta();                      // el dueño elige a mano
    const traselClic = mc.selOpuesta;
    const marcada = game.selAuto.estado().aMano;
    // El automático diría `false` (es el bloque del suelo del §1, con aire arriba); no debe pisarlo.
    mcSelGuiaFirma();                               // la guía corre con la tecla pulsada: aquí se aplicaría
    return { traselClic, marcada, tras: mc.selOpuesta, diria: game.selAuto.decide('ctrl') };
  }, [X + 4, Y, Z]);
  ok('el clic central deja la selección marcada a mano', h.marcada === true);
  ok('…y el automático NO le da la vuelta', h.tras === h.traselClic,
     'central=' + h.traselClic + ' tras=' + h.tras);

  console.log('\n§10 · con UN SOLO clic (caja FANTASMA, sin confirmar) — el fallo que trajo la v2');
  // Dueño (2026-08-29): «*cuando no se confirma la seleccion con un segundo clic a veces no se eligen
  // bien la dirección […] se esta eligiendo erroneamente hacia arriba cuando deberia de ser hacia
  // abajo. Si se confirma la seleccion con el segundo clic si que se orienta bien*».
  // Aquí no hay `mc.selBox`: sólo la esquina fijada del 1er clic. La fantasma es `mc.selA` → la celda
  // que APUNTA EL RAYO, así que hay que apuntar de verdad: se planta el ojo a 2,5 bloques de la celda,
  // en vertical y por el lado que está despejado, para que `mcRaycast()` caiga en ella y la fantasma
  // salga de una sola celda. (Mirar al cielo NO vale: el rayo se va lejos y la fantasma sale enorme.)
  const fant = (x, modo, desde, porArriba) => p.evaluate(([x, y, z, modo, desde, porArriba]) => {
    mc.selBox = null; mc.selCajas = []; mc.selA = [x, y, z];
    const ojo = y + (porArriba ? 2.5 : -2.5);
    mc.pos = [x + 0.5, ojo - MC_EYE * mc.scale, z + 0.5];
    mc.pitch = porArriba ? -Math.PI / 2 : Math.PI / 2;
    mc._selGuiaPre = null;
    game.selAuto.suelta();
    mc.selOpuesta = desde;                          // como venga de antes: puede estar mal puesta
    const f = mcSelGuiaFantasma();
    const dice = game.selAuto.decide(modo);
    mc.selGuiaModo = modo;
    mcSelGuiaFirma();                               // lo que corre de verdad al pintar los ✚
    return { hayFantasma: !!f, unaCelda: !!f && f.vol === 1, caja: f && (f.a + '>' + f.b),
             dice, tras: mc.selOpuesta };
  }, [x, Y, Z, modo, desde, porArriba]);

  // El techo tiene roca encima: se apunta DESDE ABAJO, que es por donde está el aire.
  const t = await fant(X + 4, 'ctrl', false, false);
  ok('hay caja fantasma de una sola celda (el rayo apunta a la celda)', t.hayFantasma && t.unaCelda,
     t.caja);
  ok('sobre el TECHO decide la cara de ABAJO', t.dice === true, 'dice=' + t.dice);
  ok('…y la guía la aplica sin segundo clic', t.tras === true, 'selOpuesta=' + t.tras);

  const s = await fant(X, 'ctrl', true, true);      // suelo, y `mc.selOpuesta` viene MAL puesta de antes
  ok('sobre el SUELO decide la cara de ARRIBA', s.dice === false, 'dice=' + s.dice);
  ok('…y corrige la que venía mal puesta', s.tras === false, 'selOpuesta=' + s.tras);

  const q = await fant(X + 8, 'ctrl', true, true);  // flotante: aire arriba y abajo
  ok('con aire en los dos lados no prioriza ni sobre la fantasma', q.dice === null);
  ok('…y no toca `mc.selOpuesta`', q.tras === true, 'selOpuesta=' + q.tras);

  await p.evaluate(() => { mc.selA = null; mc.selGuiaModo = ''; mc.pitch = 0; mc._selGuiaPre = null; });

  console.log('\n§9 · off() devuelve las cuatro funciones al motor');
  const off = await p.evaluate(() => {
    const dicho = game.selAuto.off();
    return { dicho, puesto: game.selAuto.puesto(),
             limpio: !mcSelExtruir._selAuto && !mcSelExtruirFrente._selAuto &&
                     !mcSelGuiaFirma._selAuto && !mcSelConmutaCaraOpuesta._selAuto };
  });
  console.log('  off →', off.dicho);
  ok('ya no está puesto', off.puesto === false);
  ok('ninguna de las cuatro queda envuelta', off.limpio === true);

  // ── devolver el banco ───────────────────────────────────────────────────────────────────────────
  await p.evaluate(() => {
    const s = window._selAuto, lock = mc.histLock; mc.histLock = true;
    const edits = [];
    for (const [x, y, z, v] of s.orig) {
      const before = mc.grid[mcIdx(x, y, z)];
      if (before === v) continue;
      mcSetBlock(x, y, z, v); edits.push({ x, y, z, before, after: v });
    }
    mcRemeshEdiciones(edits); mc.histLock = lock;
    mc.selBox = null; mc.selCajas = []; mc.selOpuesta = false;
    mc.pos = s.pos.slice(); mc.yaw = s.yaw; mc.pitch = s.pitch;   // el jugador, donde estaba
    mcScheduleSave();
  });
  await p.waitForTimeout(600);
  const sucio = await p.evaluate(() =>
    window._selAuto.orig.filter(([x, y, z, v]) => mc.grid[mcIdx(x, y, z)] !== v).length);
  ok('el banco queda EXACTAMENTE como estaba', sucio === 0, sucio + ' celda(s) distintas');

  ok('sin errores de página', errores.length === 0, errores.join(' | '));
  await b.close();
  console.log('\n' + (fallos ? '✗ ' + fallos + ' fallo(s)' : '✓ todo ok'));
  process.exit(fallos ? 1 : 0);
})();
