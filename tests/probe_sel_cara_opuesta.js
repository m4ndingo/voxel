// @area: mundo
// @necesita: servidor, playwright
// SONDA (no guardián) del snippet `sel-cara-opuesta`: el clic CENTRAL pasa la herramienta Seleccionar a
// construir por la cara de ABAJO (patas) y la del FONDO (puentes).
//
// Dueño (2026-08-28), corrigiendo el primer intento: «*no se cambia la direccion de la rueda, se cambia
// como se comporta la herramienta […] si un bloque esta en el aire se le podrian poner patas
// seleccionando sus bloques, clic central, y luego control+abajo*» · «*seguir empujando hacia adelante
// pero rellenando con los bloques seleccionados (por ejemplo para construir puentes)*».
//
// Nació validando el snippet `sel-cara-opuesta`; desde que el dueño lo dio por bueno («*esta correcto,
// aplicar parche a app.js*») mide EL MOTOR (REQ-EXTRU4: `mcSelExtruirAbajo`, `mcSelExtruirFondo` y
// `mcSelConmutaCaraOpuesta`). Por eso llama a `mcSelExtruir`/`mcSelExtruirFrente` a pelo —que es lo que
// hace la rueda en app.js:23568— y NO carga el snippet: éste se aparta solo al ver la función en app.js,
// y §8 comprueba justamente eso.
//
// ⛔ TODO PASA EN EL AIRE, sobre bloques puestos por la sonda, y CADA SECCIÓN EN SU SITIO (`dx`). La
// sonda anterior reusaba la misma columna de terreno en todas y las de después se encontraban el suelo
// ya cavado: daban 0 y parecía fallo del parche cuando era del montaje. Además el caso del dueño ES un
// bloque flotando, así que el aire es el escenario de verdad.
//
//   §1 patas       · Ctrl↓ pone bloque DEBAJO, con SU material, y repitiendo crecen
//   §2 puente      · Shift↑ pone bloque MÁS ALLÁ (se aleja), no hacia el jugador
//   §3 inversos    · Ctrl↑ come por abajo · Shift↓ come por el fondo
//   §4 ida y vuelta· Ctrl↓ y Ctrl↑ dejan los bloques como estaban (regla del dueño, 2026-08-20)
//   §5 modo normal · con el modo APAGADO el motor queda intacto (Ctrl↑ sigue construyendo encima)
//   §6 materiales  · dos bloques distintos → cada pata replica el suyo («*replicando los seleccionados*»)
//   §7 clic central· UN clic = UNA conmutación, y mudo fuera de Seleccionar
//   §8 el snippet  · `sel-cara-opuesta` se APARTA al ver la función en el motor (no envuelve nada)
//
// Corre en `/map/empty` con el AUTOGUARDADO APAGADO y comprueba que `empty.vox` no se toca.
//
//   node tests/probe_sel_cara_opuesta.js [url]
const fs = require('fs');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty?noauto=1';
const VOX = __dirname + '/../data/worlds/empty.vox';

(async () => {
  const mtimeAntes = fs.statSync(VOX).mtimeMs;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.grid && typeof game!=="undefined"',
    null, { timeout: 180000 });
  await page.waitForTimeout(4000);

  const prep = await page.evaluate(() => {
    game.autosave(false);                      // ⛔ nada de esta sonda llega al disco
    mc.tool = 'select';
    const cx = mc.dim.x >> 1, cz = mc.dim.z >> 1;
    let suelo = -1;
    for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(cx, y, cz)]) { suelo = y; break; }
    // Dos materiales distintos de verdad, sacados del propio terreno (césped/tierra o lo que haya).
    const ids = [];
    for (let y = suelo; y > suelo - 8 && y >= 0; y--) {
      const id = mc.grid[mcIdx(cx, y, cz)];
      if (id && ids.indexOf(id) < 0) ids.push(id);
    }
    const ALTO = suelo + 20;                   // bien alto: aire seguro, lejos del terreno
    window.__S = { cx, cz, suelo, ALTO, idA: ids[0] || 1, idB: ids[1] || ids[0] || 1 };
    window.__huella = () => { let n = 0; for (let i = 0; i < mc.grid.length; i++) if (mc.grid[i]) n++; return n; };
    window.__caja = (a, b) => { mc.selCajas = [{ a: a.slice(), b: b.slice() }]; mc.selA = null; };
    window.__en = (x, y, z) => mc.grid[mcIdx(x, y, z)];
    // Un bloque solo, flotando: el caso que describió el dueño. Devuelve su sitio y lo deja seleccionado.
    window.__vuela = (dx, id) => {
      const S = window.__S, x = S.cx + dx, y = S.ALTO, z = S.cz;
      mcSetBlock(x, y, z, id || S.idA);
      mcRemeshAround(x - 3, z - 3, x + 3, z + 3);
      window.__caja([x, y, z], [x, y, z]);
      return { x, y, z };
    };
    // El `mousedown` de app.js (app.js:23512) exige pointer-lock, y en headless no lo hay. Se finge sólo
    // eso —lo único que falta— en vez de renunciar a probar el gesto, que es justo la petición.
    Object.defineProperty(document, 'pointerLockElement', { get: () => mc.canvas, configurable: true });
    return { dim: [mc.dim.x, mc.dim.y, mc.dim.z], suelo, ALTO, ids, bloques: window.__huella(), autosave: game.autosave() };
  });
  console.log('escena ·', JSON.stringify(prep));
  if (prep.suelo < 0) { console.log('SIN SUELO en el centro: la sonda no vale'); await browser.close(); return; }

  const enElMotor = await page.evaluate(() => typeof mcSelExtruirAbajo === 'function'
    && typeof mcSelExtruirFondo === 'function' && typeof mcSelConmutaCaraOpuesta === 'function');
  console.log('REQ-EXTRU4 en app.js ·', enElMotor);
  if (!enElMotor) { console.log('ESTE app.js NO LLEVA REQ-EXTRU4: falta parche_app_sel_cara_opuesta.py'); await browser.close(); return; }

  const res = await page.evaluate(() => {
    const S = window.__S, out = {};
    out.arranque = { caraOpuesta: !!mc.selOpuesta };

    // ── §5 (primero, con el modo aún APAGADO) · el motor normal queda intacto ─────────────────────
    let p = __vuela(0);
    let h = __huella();
    mcSelExtruir(+1);
    out.normalArribaSigueConstruyendo = { puso: __huella() - h, encima: __en(p.x, p.y + 1, p.z) === S.idA };

    mcSelConmutaCaraOpuesta();                           // ⟵ a partir de aquí, CARA OPUESTA
    out.caraOpuesta = !!mc.selOpuesta;

    // ── §1 · PATAS: Ctrl↓ construye DEBAJO, con su material, y repitiendo crece ───────────────────
    p = __vuela(4);
    h = __huella();
    const r1 = mcSelExtruir(-1);
    const pata1 = __en(p.x, p.y - 1, p.z);
    const r2 = mcSelExtruir(-1);                         // sin volver a marcar esquinas: la caja siguió
    const pata2 = __en(p.x, p.y - 2, p.z);
    out.patas = {
      devuelve: r1 === true && r2 === true,
      puso: __huella() - h,                              // +2 esperado
      primeraPata: pata1 === S.idA,                      // replica el material seleccionado
      segundaPata: pata2 === S.idA,                      // la caja se estiró: la 2ª muesca sigue abajo
      elOriginalSigue: __en(p.x, p.y, p.z) === S.idA,    // no se ha movido nada, sólo se ha añadido
      nadaArriba: !__en(p.x, p.y + 1, p.z)               // ⛔ y NO construye hacia arriba (el fallo de v1)
    };

    // ── §2 · PUENTE: Shift↑ construye MÁS ALLÁ, alejándose ────────────────────────────────────────
    mc.yaw = -Math.PI / 2; mc.pitch = 0;                 // mirando a +X ⇒ sN = +1, comprobable a mano
    const eje = mcEjeMirada();
    p = __vuela(8);
    h = __huella();
    const r3 = mcSelExtruirFrente(+1);
    const tramo1 = __en(p.x + 1, p.y, p.z);
    mcSelExtruirFrente(+1);
    const tramo2 = __en(p.x + 2, p.y, p.z);
    out.puente = {
      eje: eje.nombre, sN: eje.sN, devuelve: r3 === true,
      puso: __huella() - h,                              // +2 esperado
      primerTramo: tramo1 === S.idA,
      segundoTramo: tramo2 === S.idA,                    // se estira hacia adelante muesca a muesca
      nadaHaciaMi: !__en(p.x - 1, p.y, p.z)              // ⛔ NO hacia el jugador (el fallo de v1)
    };

    // ── §3 · Los inversos: Ctrl↑ come por abajo · Shift↓ come por el fondo ────────────────────────
    p = __vuela(12);
    mcSelExtruir(-1);                                    // una pata
    h = __huella();
    mcSelExtruir(+1);                                    // y se la come por abajo
    const seComioLaPata = !__en(p.x, p.y - 1, p.z) && (__huella() - h) === -1;
    p = __vuela(16);
    mcSelExtruirFrente(+1);                              // un tramo
    h = __huella();
    mcSelExtruirFrente(-1);                              // y se lo come por el fondo
    out.inversos = { ctrlArribaComePorAbajo: seComioLaPata,
                     shiftAbajoComePorElFondo: !__en(p.x + 1, p.y, p.z) && (__huella() - h) === -1 };

    // ── §4 · Ida y vuelta deja los bloques como estaban (regla del dueño, 2026-08-20) ─────────────
    p = __vuela(20);
    h = __huella();
    mcSelExtruir(-1); mcSelExtruir(+1);
    out.idaYVuelta = __huella() - h;                     // 0 esperado

    // ── §6 · Cada columna replica SU material ────────────────────────────────────────────────────
    if (S.idA !== S.idB) {
      const a = __vuela(24, S.idA);
      mcSetBlock(a.x + 1, a.y, a.z, S.idB);
      mcRemeshAround(a.x - 3, a.z - 3, a.x + 4, a.z + 3);
      __caja([a.x, a.y, a.z], [a.x + 1, a.y, a.z]);      // los dos a la vez
      mcSelExtruir(-1);
      out.materiales = { distintos: true,
                         izquierda: __en(a.x, a.y - 1, a.z) === S.idA,
                         derecha: __en(a.x + 1, a.y - 1, a.z) === S.idB };
    } else {
      out.materiales = { distintos: false, nota: 'el terreno de /map/empty es de un solo material' };
    }

    // ── §7 · El clic central conmuta UNA vez, y sólo con Seleccionar ─────────────────────────────
    const clic = () => mc.canvas.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true }));
    const antes = !!mc.selOpuesta;
    clic(); const trasUno = !!mc.selOpuesta;
    clic(); const trasDos = !!mc.selOpuesta;
    mc.tool = 'brush';
    const previo = !!mc.selOpuesta;
    clic();
    out.clicCentral = { conmutaUna: trasUno === !antes, vuelve: trasDos === antes,
                        mudoFueraDeSeleccion: !!mc.selOpuesta === previo };
    mc.tool = 'select';
    return out;
  });

  // ── §8 · El snippet viejo se APARTA al ver la función en el motor ──────────────────────────────
  // `sel-cara-opuesta` sigue publicado (es el original de la Ley de Oro y sirve para probar cambios en
  // caliente). Si alguien lo carga con alt+c sobre este app.js tiene que decirlo y NO envolver nada: un
  // envoltorio congelado encima taparía al motor y los arreglos posteriores dejarían de notarse.
  const snippet = await page.evaluate(async () => {
    const dicho = await game.snippet('sel-cara-opuesta');
    if (!mc.selOpuesta) mcSelConmutaCaraOpuesta();
    const p = __vuela(28);
    const h = __huella();
    mcSelExtruir(-1);                                    // sigue mandando el motor: una sola pata
    return {
      dicho,
      sinEnvolver: !mcSelExtruir._selOp && !mcSelExtruirFrente._selOp,
      sinMando: typeof game.selOpuesta === 'undefined',
      unaSolaPata: (__huella() - h) === 1 && !!__en(p.x, p.y - 1, p.z)
    };
  });

  console.log('\n' + JSON.stringify(res, null, 2));
  console.log('el snippet se aparta ·', JSON.stringify(snippet));

  await page.waitForTimeout(1000);
  await browser.close();
  console.log('empty.vox intacto ·', fs.statSync(VOX).mtimeMs === mtimeAntes);
})();
