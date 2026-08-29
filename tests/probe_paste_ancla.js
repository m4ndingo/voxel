// Sonda del snippet `paste-ancla` (herramientas/crea_snp_paste_ancla.py).
//
// Dueño (2026-08-28): «*cuando se copia y se pega, si se habia elegido un ancla al copiar (con control
// apuntando un bloque), al pegar se pierde y no deberia*».
//
// Hay DOS agarres en el motor y no se hablaban: `mc.selPivote` (Seleccionar, celda de mundo absoluta, es
// sobre lo que gira R) y `mc.pasteAnchor` (Pegar, celda relativa a la esquina mínima de la pieza y SIN
// rotar). Copiar tiraba el primero y pegar estrenaba el segundo en [0,0,0]. El snippet los une.
//
// LA PRUEBA DE VERDAD no mira el agarre guardado, mira DÓNDE CAE LA PIEZA: se congela el cúmulo sobre
// una celda concreta (Ctrl, `mc.pasteCtrlFreeze`) y se exige que EL BLOQUE DEL AGARRE sea el que aterriza
// ahí. Eso es lo que el dueño ve; un [1,2,0] guardado en una variable no prueba nada por sí solo.
//
//   §1 sin agarre       · el pegado sigue clavándose por la esquina mínima, como toda la vida
//   §2 con agarre       · el bloque señalado al copiar es el que cae en la mira
//   §3 cortar           · Ctrl+X hereda igual que Ctrl+C
//   §4 fuera de la caja · un agarre que no es de esta pieza NO se hereda (y no ensucia el portapapeles)
//   §5 girando          · el agarre se guarda sin rotar ⇒ sigue siendo el mismo bloque tras R
//   §6 reelegir         · cambiar el agarre pegando (Ctrl) se recuerda para el siguiente Ctrl+V
//   §7 off()            · quitado el snippet se van los envoltorios, pero el agarre sigue: vive en el motor
//
// Corre sobre /map/empty?noauto=1 con el autoguardado APAGADO y comprueba al final que empty.vox no se
// ha tocado.  Uso: node tests/probe_paste_ancla.js [url]

const fs = require('fs');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty?noauto=1';
const VOX = __dirname + '/../data/worlds/empty.vox';
const SNIPPET = JSON.parse(fs.readFileSync(__dirname + '/../data/snippets/paste-ancla.json', 'utf8')).code;

const fallos = [];
function comprueba(nombre, ok, detalle) {
  if (ok) console.log('  ok   · ' + nombre);
  else { console.log('  FALLA· ' + nombre + (detalle ? ' → ' + detalle : '')); fallos.push(nombre); }
}

(async () => {
  const mtimeAntes = fs.statSync(VOX).mtimeMs;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.grid && typeof game!=="undefined"',
    null, { timeout: 180000 });
  await page.waitForTimeout(4000);

  // ── utillería que vive en la página ─────────────────────────────────────────────────────────────
  await page.evaluate(() => {
    game.autosave(false);                      // ⛔ nada de esta sonda llega al disco
    mc.tool = 'select';

    const cx = mc.dim.x >> 1, cz = mc.dim.z >> 1;
    let suelo = -1;
    for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(cx, y, cz)]) { suelo = y; break; }
    const ids = [];
    for (let y = suelo; y > suelo - 8 && y >= 0; y--) {
      const id = mc.grid[mcIdx(cx, y, cz)];
      if (id && ids.indexOf(id) < 0) ids.push(id);
    }
    window.__S = { cx, cz, suelo, ids, aire: suelo + 12 };
    window.__base = n => [6 + (n % 6) * 14, __S.aire, 6 + ((n / 6) | 0) * 14];   // en rejilla y en el aire

    // La PIEZA de todas las secciones: una L de 3 bloques, asimétrica a propósito para que se note si el
    // agarre se va al bloque de al lado, y con el material del terreno (nada inventado).
    window.__P = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];

    window.__monta = (base, celdas) => {
      const edits = [];
      const pon = (x, y, z, v) => {
        const b = mc.grid[mcIdx(x, y, z)];
        if (b === v) return;
        mcSetBlock(x, y, z, v);
        edits.push({ x, y, z, before: b, after: v });
      };
      for (let x = -4; x <= 8; x++) for (let y = -6; y <= 8; y++) for (let z = -4; z <= 8; z++) {
        const p = [base[0] + x, base[1] + y, base[2] + z];
        if (mcInside(p[0], p[1], p[2])) pon(p[0], p[1], p[2], 0);
      }
      for (const c of celdas) pon(base[0] + c[0], base[1] + c[1], base[2] + c[2], __S.ids[0]);
      mcRemeshEdiciones(edits);
      return edits.length;
    };

    window.__selecciona = (base, celdas) => {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const c of celdas) for (let i = 0; i < 3; i++) {
        const v = base[i] + c[i];
        if (v < lo[i]) lo[i] = v;
        if (v > hi[i]) hi[i] = v;
      }
      mc.tool = 'select';
      mc.selCajas = [{ a: lo.slice(), b: hi.slice() }];
      mc.selA = null;
      return { a: lo, b: hi };
    };

    // Prepara el escenario y devuelve el sitio donde se va a congelar el cúmulo (lejos del original).
    window.__escenario = (n, pivote) => {
      const base = __base(n);
      __monta(base, __P);
      __selecciona(base, __P);
      mc.selPivote = pivote ? [base[0] + pivote[0], base[1] + pivote[1], base[2] + pivote[2]] : null;
      mc.pasteCara = 0; mc.pasteGiro = 0;
      return { base, congela: [base[0] + 5, base[1], base[2]] };
    };

    // DÓNDE CAE la pieza: se congela el cúmulo en `celda` (que es justo lo que hace Ctrl pegando) y se
    // pregunta al motor —`mcPasteOrigen`, el único que sabe— qué celda de la pieza aterriza ahí.
    window.__aterriza = celda => {
      mc.pasteCtrlHeld = true;
      mc.pasteCtrlFreeze = celda.slice();
      const org = mcPasteOrigen(null);
      mc.pasteCtrlHeld = false;
      mc.pasteCtrlFreeze = null;
      if (!org) return null;
      const puestas = clipboard.cells.map(c => {
        const q = org.mueve(c.dx, c.dz, c.dy);
        return [org.ox + q[0], org.oy + q[1], org.oz + q[2]];
      });
      // La pieza es una L de 3 celdas: se devuelve cuál de ellas (en ejes de pieza) cae en `celda`.
      const i = puestas.findIndex(p => p[0] === celda[0] && p[1] === celda[1] && p[2] === celda[2]);
      const c = i < 0 ? null : clipboard.cells[i];
      return { enLaMira: c ? [c.dx, c.dz, c.dy] : null, celdas: puestas.length,
               agarre: mc.pasteAnchor ? mc.pasteAnchor.slice() : null };
    };
  });

  const prep = await page.evaluate(() => ({ suelo: __S.suelo, ids: __S.ids.length }));
  if (prep.suelo < 0 || !prep.ids) { console.log('sin terreno en /map/empty: no hay nada que probar'); process.exit(1); }

  // ── §1 · SIN AGARRE, TODO COMO SIEMPRE ──────────────────────────────────────────────────────────
  // Antes de nada: lo que ya funcionaba tiene que seguir igual. Sin pivote, la celda que se clava en la
  // mira es la esquina mínima [0,0,0] de la pieza, que es como ha pegado el motor toda la vida.
  // ── carga del snippet, como lo carga el motor (web/app.js:4586) ─────────────────────────────────
  const arranque = await page.evaluate(async code => {
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    const r = await new AsyncFunction('opts', 'args', code)({}, {});
    return { dicho: r, hayApi: !!(window.game && game.pasteAncla),
             puesto: !!(game.pasteAncla && game.pasteAncla.puesto()) };
  }, SNIPPET);
  console.log('snippet cargado ·', JSON.stringify(arranque));
  comprueba('el snippet expone game.pasteAncla y queda puesto', arranque.hayApi && arranque.puesto);

  console.log('\n§1 sin agarre: la esquina mínima');
  const sin = await page.evaluate(() => {
    const e = __escenario(0, null);
    mcCopySelection(); mcPasteWorld();
    const r = __aterriza(e.congela);
    mcPasteCancel();
    return { r, ancla: clipboard.ancla || null };
  });
  console.log('  ' + JSON.stringify(sin));
  comprueba('§1 sin agarre elegido, se clava por la esquina mínima [0,0,0]',
    !!sin.r && JSON.stringify(sin.r.enLaMira) === '[0,0,0]', JSON.stringify(sin.r));
  comprueba('§1 y el portapapeles no se inventa ningún agarre', sin.ancla === null, JSON.stringify(sin.ancla));

  // ── §2 · EL BUG DEL DUEÑO ───────────────────────────────────────────────────────────────────────
  // Agarre en el bloque de arriba de la L (pieza [0,1,0]). Al pegar, ESE bloque es el que tiene que caer
  // en la mira; antes caía la esquina mínima y la pieza aparecía descolgada un bloque más abajo.
  console.log('\n§2 con agarre: el bloque elegido es el que cae en la mira');
  const con = await page.evaluate(() => {
    const e = __escenario(1, [0, 1, 0]);
    mcCopySelection(); mcPasteWorld();
    const r = __aterriza(e.congela);
    mcPasteCancel();
    return { r, ancla: clipboard.ancla || null };
  });
  console.log('  ' + JSON.stringify(con));
  comprueba('§2 el agarre elegido al copiar viaja al portapapeles',
    JSON.stringify(con.ancla) === '[0,1,0]', JSON.stringify(con.ancla));
  comprueba('§2 y al pegar cae en la mira EL BLOQUE DEL AGARRE, no la esquina',
    !!con.r && JSON.stringify(con.r.enLaMira) === '[0,1,0]', JSON.stringify(con.r));

  // ── §3 · CORTAR HEREDA IGUAL ────────────────────────────────────────────────────────────────────
  // Ctrl+X vacía la selección: si el agarre se calculara DESPUÉS de llamar al motor, el barrido ya no
  // encontraría un solo bloque y saldría [0,0,0] sin que nada fallara a gritos.
  console.log('\n§3 cortar (Ctrl+X) hereda el agarre igual que copiar');
  const corta = await page.evaluate(() => {
    const e = __escenario(2, [1, 0, 0]);
    mcCutSelection(); mcPasteWorld();
    const r = __aterriza(e.congela);
    mcPasteCancel();
    return { r, ancla: clipboard.ancla || null, vaciado: !mc.grid[mcIdx(e.base[0], e.base[1], e.base[2])] };
  });
  console.log('  ' + JSON.stringify(corta));
  comprueba('§3 el corte se llevó los bloques (es el caso peor: la selección queda vacía)',
    corta.vaciado, JSON.stringify(corta.vaciado));
  comprueba('§3 y aun así el agarre es el elegido, no la esquina',
    JSON.stringify(corta.ancla) === '[1,0,0]' && !!corta.r && JSON.stringify(corta.r.enLaMira) === '[1,0,0]',
    JSON.stringify(corta));

  // ── §4 · UN AGARRE QUE NO ES DE ESTA PIEZA NO SE HEREDA ─────────────────────────────────────────
  // El pivote puede haberse quedado de una selección anterior. Heredarlo sería peor que no heredar nada:
  // la pieza saldría descolgada por un punto que no señaló nadie.
  console.log('\n§4 agarre de otra pieza: no se hereda');
  const fuera = await page.evaluate(() => {
    const e = __escenario(3, null);
    mc.selPivote = [e.base[0] + 40, e.base[1], e.base[2]];   // lejísimos, fuera de la caja
    mcCopySelection(); mcPasteWorld();
    const r = __aterriza(e.congela);
    mcPasteCancel();
    return { r, ancla: clipboard.ancla || null };
  });
  console.log('  ' + JSON.stringify(fuera));
  comprueba('§4 el agarre de fuera de la caja se descarta', fuera.ancla === null, JSON.stringify(fuera.ancla));
  comprueba('§4 y el pegado vuelve a la esquina mínima',
    !!fuera.r && JSON.stringify(fuera.r.enLaMira) === '[0,0,0]', JSON.stringify(fuera.r));

  // ── §5 · GIRAR NO MUEVE EL AGARRE ───────────────────────────────────────────────────────────────
  // El agarre se guarda SIN ROTAR (ejes de la pieza) justo para esto: «lo sujeto por este bloque» sigue
  // siendo ese bloque al tumbar la pieza con R. Guardarlo ya rotado era más corto y saltaba de sitio.
  console.log('\n§5 girar la pieza no cambia de bloque el agarre');
  const gira = await page.evaluate(() => {
    const e = __escenario(4, [0, 1, 0]);
    mcCopySelection(); mcPasteWorld();
    const antes = __aterriza(e.congela);
    mc.pasteGiro = 1;                                  // ⇧R: un cuarto de vuelta
    const despues = __aterriza(e.congela);
    mc.pasteCara = 2; mc.pasteGiro = 0;                // R: otra cara
    const volcada = __aterriza(e.congela);
    mcPasteCancel();
    return { antes, despues, volcada };
  });
  console.log('  ' + JSON.stringify(gira));
  comprueba('§5 tras ⇧R sigue cayendo en la mira el mismo bloque de la pieza',
    !!gira.despues && JSON.stringify(gira.despues.enLaMira) === '[0,1,0]', JSON.stringify(gira.despues));
  comprueba('§5 y tras R (otra cara) también',
    !!gira.volcada && JSON.stringify(gira.volcada.enLaMira) === '[0,1,0]', JSON.stringify(gira.volcada));

  // ── §6 · REELEGIR EL AGARRE PEGANDO SE RECUERDA ─────────────────────────────────────────────────
  // Cambiar el agarre con Ctrl mientras se pega ocurre en un oyente de `app.js` que no se puede envolver;
  // el snippet lo copia de vuelta al portapapeles desde el bucle. Aquí se simula ese cambio y se exige
  // que el SIGUIENTE Ctrl+V ya nazca con él.
  console.log('\n§6 el agarre reelegido pegando se recuerda para el siguiente Ctrl+V');
  await page.evaluate(() => {
    const e = __escenario(5, [0, 1, 0]);
    mcCopySelection(); mcPasteWorld();
    mc.pasteAnchor = [1, 0, 0];                        // lo que deja el keyup de Ctrl en app.js
    window.__e6 = e;
  });
  await page.waitForTimeout(2500);                     // un par de vueltas del bucle (va a ~1,4 fps)
  const recuerda = await page.evaluate(() => {
    const guardado = clipboard.ancla ? clipboard.ancla.slice() : null;
    mcPasteCancel();
    mcPasteWorld();                                    // segundo pegado: tiene que nacer con el nuevo
    const r = __aterriza(__e6.congela);
    mcPasteCancel();
    return { guardado, r };
  });
  console.log('  ' + JSON.stringify(recuerda));
  comprueba('§6 el bucle guarda en el portapapeles el agarre reelegido',
    JSON.stringify(recuerda.guardado) === '[1,0,0]', JSON.stringify(recuerda.guardado));
  comprueba('§6 y el siguiente pegado nace con él',
    !!recuerda.r && JSON.stringify(recuerda.r.enLaMira) === '[1,0,0]', JSON.stringify(recuerda.r));

  // ── §7 · off() DEVUELVE EL MOTOR COMO ESTABA ────────────────────────────────────────────────────
  console.log('\n§7 off()');
  const apagado = await page.evaluate(() => {
    const dicho = game.pasteAncla.off();
    const e = __escenario(6, [0, 1, 0]);
    mcCopySelection(); mcPasteWorld();
    const r = __aterriza(e.congela);
    mcPasteCancel();
    return { dicho, r, puesto: game.pasteAncla.puesto(),
             enElMotor: typeof mcAnclaDeCopia === 'function',
             limpio: typeof mcPasteWorld === 'function' && !mcPasteWorld._pasteAncla };
  });
  console.log('  ' + JSON.stringify(apagado));
  comprueba('§7 off() desenrosca los envoltorios', !apagado.puesto && apagado.limpio, JSON.stringify(apagado));
  // Hasta que el agarre bajó a `app.js` (`mcAnclaDeCopia`), aquí se exigía volver a la esquina mínima:
  // sin snippet no había quien eligiera el agarre. Ahora el motor YA lo hace por su cuenta, así que
  // apagar el snippet quita los envoltorios pero NO el comportamiento — y eso es lo que se comprueba.
  comprueba('§7 …pero el agarre sigue, que ya vive en el motor',
    apagado.enElMotor && !!apagado.r && JSON.stringify(apagado.r.enLaMira) === '[0,1,0]',
    JSON.stringify(apagado.r));

  const mtimeDespues = fs.statSync(VOX).mtimeMs;
  comprueba('empty.vox intacto (autoguardado apagado)', mtimeAntes === mtimeDespues,
    mtimeAntes + ' → ' + mtimeDespues);

  await browser.close();
  console.log(fallos.length ? '\n' + fallos.length + ' FALLO(S): ' + fallos.join(' · ') : '\ntodo ok');
  process.exit(fallos.length ? 1 : 0);
})();
