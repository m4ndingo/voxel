// @area: mundo
// @necesita: servidor, playwright
// SONDA (no guardián) del snippet `preview-tras-ranura`: cambiar de herramienta NO enseña el fantasma de
// la estructura que lleve la ranura activa; hay que pedirlo pulsando una ranura.
//
// ⚠️ HISTÓRICA: el dueño lo validó y el 2026-08-28 el pestillo BAJÓ A `app.js` (`mcPreviewCallada`), así que
// el snippet se aparta y §1 —«sin el parche sale el fantasma»— ya no puede darse. La sonda se salta sola;
// quien manda ahora es el guardián `tests/test_preview_ranura.js`. Se conserva por trazabilidad.
//
// Dueño (2026-08-28): «*cuando cambio de herramienta de seleccion a pico, si el pico tiene una estructura
// no quiero que salga el preview hasta que de al boton de la ranura; si sigo dando botones de ranura
// saldran los previews, pero si solamente cambio esa tool no tiene que salir*».
//
// Se prueban LAS DOS PIEZAS del fantasma de estructura, porque callar una sola no arregla nada:
// la MALLA translúcida (`mc.preview`, de `mcUpdatePreview`) y la CAJA DE HUELLA verde (dentro de
// `mcDrawOverlays`, que sólo la pinta si `mc.structGhostAlpha > 0`).
//
// ⚠️ Se falsean el RAYO (sin cabeza el jugador no apunta a nada) y el PUNTERO CAPTURADO (`mcMandoActivo`).
// La estructura es de mentira, metida en `roomDataCache`: nada toca el disco.
//
//   §1 el bug        · sin el parche, cambiar de herramienta ya planta el fantasma
//   §2 se calla      · con el parche, cambiar de herramienta no lo planta (y tira el que hubiera)
//   §3 la huella     · mientras calla, la caja verde tampoco se dibuja (y el ajuste del dueño se repone)
//   §4 la ranura     · pulsar una ranura lo devuelve
//   §5 la misma      · pulsar la MISMA ranura también cuenta
//   §6 reafirmar     · poner la herramienta que ya estaba NO lo calla
//   §7 las notas     · colocando una nota el fantasma no se calla (es otro, y su gesto ya es explícito)
//   §8 se quita      · off() devuelve las funciones del motor intactas
//   §9 no toca nada  · mirar no edita: `mc.gridGen` y el historial quedan igual
//
// Corre en `/map/empty` con el AUTOGUARDADO APAGADO y comprueba que `empty.vox` no se toca.
//
//   node tests/probe_preview_ranura.js [url]
const fs = require('fs');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty?noauto=1';
const VOX = __dirname + '/../data/worlds/empty.vox';
const SNIPPET = JSON.parse(fs.readFileSync(__dirname + '/../data/snippets/preview-tras-ranura.json', 'utf8')).code;

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

  // El pestillo ya está en el motor ⇒ el snippet se aparta y §1 no puede darse. Sonda histórica: se salta.
  if (await page.evaluate(() => typeof window.mcPreviewCallada === 'function')) {
    console.log('SALTADA · el pestillo ya vive en app.js (mcPreviewCallada); manda tests/test_preview_ranura.js');
    await browser.close();
    process.exit(0);
  }

  const prep = await page.evaluate(() => {
    game.autosave(false);                      // ⛔ nada de esta sonda llega al disco

    const cx = mc.dim.x >> 1, cz = mc.dim.z >> 1;
    let suelo = -1;
    for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(cx, y, cz)]) { suelo = y; break; }

    // Estructura de mentira, DE DOS CELDAS DE ANCHO para que sea estructura de verdad y no un bloque
    // suelto (`blockLike`): así `mc.slotStruct[slot]` la acepta, que es lo que dispara el fantasma.
    const clave = 'zz-preview-sala';
    const vox = {};
    for (let i = 0; i < 20; i += 2) vox[i + ',0,0'] = '#8899aa';
    roomDataCache.set(clave, Promise.resolve({ size: { x: 32, y: 16, z: 16 }, meta: { name: clave, type: 'objeto' }, voxels: vox }));
    delete mc.structs[clave];

    mc.sel = 0;
    mc.slotStruct[mc.sel] = clave;
    mc._guardada = false;
    mc.previewGiro = 0; mc.previewCara = 0;

    // El puntero capturado (mcMandoActivo) y el rayo: sin cabeza no hay ni lo uno ni lo otro.
    Object.defineProperty(document, 'pointerLockElement', { get: () => mc.canvas, configurable: true });
    window.__diana = [cx, suelo, cz];
    window.__rayoOrig = window.mcRaycast;
    window.mcRaycast = () => ({ cell: window.__diana.slice(), normal: [0, 1, 0], face: [0, 1, 0] });

    // Deja el fantasma construido y dice si lo hay. `mcUpdatePreview` es asíncrona: se espera de verdad.
    window.__hayFantasma = async () => { await mcUpdatePreview(); return !!mc.preview; };

    // Las escrituras a `mc.structGhostAlpha` durante una llamada: así se ve si la caja de huella queda
    // apagada (0) mientras se dibuja y si el ajuste del dueño se repone después.
    window.__espiaAlfa = fn => {
      let v = mc.structGhostAlpha;
      const escritas = [];
      Object.defineProperty(mc, 'structGhostAlpha', {
        get: () => v, set: x => { v = x; escritas.push(x); }, configurable: true
      });
      try { fn(); } catch (e) { escritas.push('ERROR:' + e.message); }
      delete mc.structGhostAlpha;
      mc.structGhostAlpha = v;
      return { escritas, final: mc.structGhostAlpha };
    };

    return { suelo, clave, esEstructura: !!mc.slotStruct[mc.sel], activo: !!mc.active, manda: mcMandoActivo() };
  });
  console.log('preparado ·', JSON.stringify(prep));
  if (prep.suelo < 0) { console.log('sin terreno en /map/empty'); process.exit(1); }
  comprueba('la ranura lleva una ESTRUCTURA (no un bloque suelto)', prep.esEstructura);
  comprueba('el mundo manda (puntero capturado)', prep.manda === true);

  console.log('\n§1 · el bug: SIN el parche, cambiar de herramienta ya planta el fantasma');
  const bug = await page.evaluate(async () => {
    mcSetPlayerTool('select');
    mcSetPlayerTool('build');
    return { fantasma: await __hayFantasma(), tool: mc.tool };
  });
  comprueba('con el pico puesto sale el fantasma sin pedirlo', bug.fantasma === true, JSON.stringify(bug));

  console.log('\n§0 · carga del snippet, como lo carga el motor (web/app.js:4586)');
  const arranque = await page.evaluate(async code => {
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    const r = await new AsyncFunction('opts', 'args', code)({}, {});
    return { dicho: r, hayApi: !!(window.game && game.previewRanura), activo: game.previewRanura.estado().activo };
  }, SNIPPET);
  console.log('snippet cargado ·', JSON.stringify(arranque.dicho));
  comprueba('expone game.previewRanura y queda puesto', arranque.hayApi && arranque.activo === true);

  console.log('\n§2 · con el parche, cambiar de herramienta lo calla');
  const call = await page.evaluate(async () => {
    await __hayFantasma();                       // que haya fantasma ANTES de cambiar
    const antes = !!mc.preview;
    mcSetPlayerTool('select');
    const trasSalir = !!mc.preview;              // el que había se tira al momento, no se queda colgado
    mcSetPlayerTool('build');
    return { antes, trasSalir, despues: await __hayFantasma(), estado: game.previewRanura.estado() };
  });
  comprueba('había fantasma antes de cambiar', call.antes === true);
  comprueba('cambiar de herramienta lo tira al momento', call.trasSalir === false);
  comprueba('…y al volver al pico NO vuelve solo', call.despues === false);
  comprueba('…y el estado lo dice (pestillo echado)', call.estado.pestillo === true && call.estado.callado === true);

  console.log('\n§3 · mientras calla, la caja de huella verde tampoco se dibuja');
  const huella = await page.evaluate(() => {
    const callado = __espiaAlfa(() => { try { mcDrawOverlays(null, null); } catch (e) {} });
    game.previewRanura.off(); game.previewRanura.on();      // pestillo suelto, mismo escenario
    const hablando = __espiaAlfa(() => { try { mcDrawOverlays(null, null); } catch (e) {} });
    mcSetPlayerTool('select'); mcSetPlayerTool('build');    // vuelve a callar para las secciones siguientes
    return { callado: callado.escritas.filter(v => typeof v === 'number'), finalCallado: callado.final,
             hablando: hablando.escritas.filter(v => typeof v === 'number') };
  });
  comprueba('callando, el alfa se pone a 0 durante el dibujo', huella.callado[0] === 0, JSON.stringify(huella.callado));
  comprueba('…y se repone al salir (el ajuste del dueño es suyo)', huella.finalCallado > 0, 'alfa=' + huella.finalCallado);
  comprueba('hablando, no se toca el alfa', huella.hablando.length === 0, JSON.stringify(huella.hablando));

  console.log('\n§4-§6 · pulsar ranura lo devuelve; reafirmar la herramienta no lo calla');
  const ranura = await page.evaluate(async () => {
    const out = { calladoAntes: game.previewRanura.estado().callado };
    mc.sel = 0; mcSelectSlot();                        // ← «he pulsado una ranura»
    out.trasRanura = await __hayFantasma();
    // §5 la MISMA ranura, sin cambiar mc.sel: el jugador dice «ésta, la de ahora»
    mcSetPlayerTool('select'); mcSetPlayerTool('build');
    out.calladoOtraVez = !(await __hayFantasma());
    mcSelectSlot();
    out.trasLaMisma = await __hayFantasma();
    // §6 reafirmar la herramienta que ya está puesta NO debe callar el fantasma recién pedido
    mcSetPlayerTool('build');
    out.trasReafirmar = await __hayFantasma();
    return out;
  });
  comprueba('estaba callado', ranura.calladoAntes === true);
  comprueba('pulsar la ranura devuelve el fantasma', ranura.trasRanura === true);
  comprueba('cambiar de herramienta lo vuelve a callar', ranura.calladoOtraVez === true);
  comprueba('pulsar la MISMA ranura también lo devuelve', ranura.trasLaMisma === true);
  comprueba('reafirmar la herramienta no lo calla', ranura.trasReafirmar === true);

  console.log('\n§7 · colocando una nota el fantasma no se calla (es otro)');
  const nota = await page.evaluate(() => {
    mcSetPlayerTool('select'); mcSetPlayerTool('build');   // pestillo echado
    const callado = game.previewRanura.estado().callado;
    mc.notePlacing = true;
    const conNota = game.previewRanura.estado().callado;
    mc.notePlacing = false;
    return { callado, conNota };
  });
  comprueba('con el pestillo echado, la estructura calla', nota.callado === true);
  comprueba('…pero el fantasma de la nota no', nota.conNota === false);

  console.log('\n§8 · off() devuelve el motor intacto');
  const q = await page.evaluate(async () => {
    game.previewRanura.off();
    const limpias = !window.mcSetPlayerTool._previewRanura && !window.mcSelectSlot._previewRanura &&
      !window.mcUpdatePreview._previewRanura && !window.mcDrawOverlays._previewRanura;
    mcSetPlayerTool('select'); mcSetPlayerTool('build');
    const vuelveElBug = await __hayFantasma();          // sin parche, el comportamiento de siempre
    game.previewRanura.on();
    return { limpias, vuelveElBug, activo: game.previewRanura.estado().activo };
  });
  comprueba('las funciones del motor quedan SIN envoltura', q.limpias);
  comprueba('…y vuelve el comportamiento de siempre', q.vuelveElBug === true);
  comprueba('…y on() lo devuelve', q.activo === true);

  console.log('\n§9 · mirar no edita');
  const quieto = await page.evaluate(async () => {
    const g0 = mc.gridGen | 0, h0 = mc.hist.length, e0 = mc.structures.length;
    mcSetPlayerTool('select'); mcSetPlayerTool('build');
    await __hayFantasma(); mcSelectSlot(); await __hayFantasma();
    return { gen: (mc.gridGen | 0) === g0, hist: mc.hist.length === h0, estr: mc.structures.length === e0 };
  });
  comprueba('la topología no cambia (mc.gridGen)', quieto.gen);
  comprueba('el historial tampoco', quieto.hist);
  comprueba('…ni se estampa nada por el camino', quieto.estr);

  await page.evaluate(() => { window.mcRaycast = window.__rayoOrig; game.previewRanura.off(); });
  await browser.close();

  const mtimeDespues = fs.statSync(VOX).mtimeMs;
  comprueba('empty.vox no se ha tocado', mtimeAntes === mtimeDespues);

  console.log(fallos.length ? '\n' + fallos.length + ' FALLOS: ' + fallos.join(' · ') : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})();
