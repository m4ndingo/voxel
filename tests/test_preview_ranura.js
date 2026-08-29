// @area: mundo
// @necesita: servidor, playwright
// GUARDIÁN · el fantasma de estructura SE PIDE, NO SE IMPONE: cambiar de herramienta NO enseña la
// estructura que lleve la ranura activa; hay que pedirla pulsando una ranura.
//
// Dueño (2026-08-28): «*cuando cambio de herramienta de seleccion a pico, si el pico tiene una estructura
// no quiero que salga el preview hasta que de al boton de la ranura; si sigo dando botones de ranura
// saldran los previews, pero si solamente cambio esa tool no tiene que salir*» · «*desde cualquier
// herramienta a pico me refiero*» (pico = construir).
//
// Lo que sujeta este guardián:
//   1) LAS DOS PIEZAS del fantasma de estructura callan a la vez: la MALLA translúcida (`mc.preview`, de
//      `mcUpdatePreview`) y la CAJA DE HUELLA verde (`structLines`, dentro de `mcDrawOverlays`). La huella
//      NO depende de la malla —se dibuja desde `mc.slotStruct[mc.sel]` y el rayo—, así que callar sólo una
//      dejaría el contorno flotando: sería no arreglar nada.
//   2) El pestillo se echa SÓLO si la herramienta cambia de verdad. `mcSetPlayerTool` se llama también para
//      reafirmar la que ya hay (rueda, consola, snippets): callar el fantasma que el jugador acaba de pedir
//      sería el mismo fallo al revés.
//   3) La puerta de vuelta es `mcSelectSlot` —la ÚNICA por la que pasa «he pulsado una ranura», venga de la
//      tecla 1-9, del clic en la hotbar o del selector—, y pulsar la MISMA ranura también cuenta.
//   4) El fantasma de las NOTAS no se calla: es otro y su gesto ya es explícito.
//   5) Callar no toca el mundo: ni `mc.gridGen`, ni el historial, ni las estructuras plantadas.
//
// ⚠️ Se falsean el RAYO (sin cabeza el jugador no apunta a nada) y el PUNTERO CAPTURADO (`mcMandoActivo`).
// La estructura es de mentira, metida en `roomDataCache`: nada de esto toca el disco.
//
// Va a `/map/empty` con AUTOGUARDADO APAGADO y comprueba al final que `empty.vox` no se ha movido.
//
//   node tests/test_preview_ranura.js [url]
const fs = require('fs');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty?noauto=1';
const VOX = __dirname + '/../data/worlds/empty.vox';

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

  const prep = await page.evaluate(() => {
    game.autosave(false);                      // ⛔ nada de este test llega al disco

    const cx = mc.dim.x >> 1, cz = mc.dim.z >> 1;
    let suelo = -1;
    for (let y = mc.dim.y - 1; y >= 0; y--) { if (mc.grid[mcIdx(cx, y, cz)]) { suelo = y; break; } }

    // Estructura de mentira en la caché de habitaciones: `mc.slotStruct[slot]` la da por buena y ni el
    // disco ni la red se enteran.
    const clave = 'zz-preview-sala';
    const celdas = [];
    for (let i = 0; i < 20; i++) celdas.push([i % 2, 0, (i / 2) | 0].join(',') + ',0,0');
    roomDataCache.set(clave, Promise.resolve({ size: { x: 32, y: 16, z: 16 }, cells: celdas }));
    delete mc.structs[clave];

    mc.sel = 0;
    mc.slotStruct[mc.sel] = clave;
    mc._guardada = false;
    mc.previewGiro = 0; mc.previewCara = 0;
    mcSetPlayerTool('build');                  // el pico, que es de quien habló el dueño

    // El mundo tiene que «mandar» (pointer-lock) o ni la malla ni la huella se calculan.
    Object.defineProperty(document, 'pointerLockElement', { get: () => mc.canvas, configurable: true });
    mc.active = true;

    window.__diana = [cx, suelo, cz];
    window.__rayoOrig = window.mcRaycast;
    window.mcRaycast = () => ({ cell: window.__diana.slice(), normal: [0, 1, 0], face: [0, 1, 0] });

    // Deja la malla construida y dice si la hay. `mcUpdatePreview` es asíncrona: se espera de verdad.
    window.__hayMalla = async () => { await mcUpdatePreview(); return !!mc.preview; };

    // La CAJA DE HUELLA verde no es observable desde fuera (`structLines` es local a `mcDrawOverlays`), así
    // que se espía la subida al VBO: sus vértices llevan el verde 0.42,1,0.55 y, con una estructura en la
    // ranura, ése es el único array del frame que lo lleva (el hueco adyacente va por la rama `else`).
    // ⚠️ `mcDrawOverlays` NO se puede llamar a mano: necesita las matrices del frame, que son locales del
    // render. Se espera a FRAMES DE VERDAD (dos: el primero puede venir ya lanzado). El navegador de pruebas
    // va a ~1,4 fps, así que cada medición cuesta más de un segundo.
    window.__frames = 0;
    const dibujaOrig = window.mcDrawOverlays;
    window.mcDrawOverlays = function () { window.__frames++; return dibujaOrig.apply(this, arguments); };

    window.__pintaHuella = async () => {
      const orig = window.mcDrawArr;
      let vista = false;
      window.mcDrawArr = function (SL, arr, mode) {
        for (let i = 3; i < arr.length; i += 7) {
          if (arr[i] === 0.42 && arr[i + 1] === 1 && arr[i + 2] === 0.55) { vista = true; break; }
        }
        return orig.apply(this, arguments);
      };
      const f0 = window.__frames, t0 = performance.now();
      await new Promise(res => {
        (function espera() {
          if (window.__frames >= f0 + 2 || performance.now() - t0 > 20000) return res();
          requestAnimationFrame(espera);
        })();
      });
      window.mcDrawArr = orig;
      return (window.__frames > f0) ? vista : 'SIN FRAMES';
    };

    return { suelo, clave, esEstructura: !!mc.slotStruct[mc.sel], manda: mcMandoActivo(),
             hayPestillo: typeof mcPreviewCallada === 'function' };
  });
  console.log('preparado ·', JSON.stringify(prep));
  if (prep.suelo < 0) { console.log('sin terreno en /map/empty'); process.exit(1); }
  comprueba('la ranura lleva una ESTRUCTURA (no un bloque suelto)', prep.esEstructura);
  comprueba('el mundo manda (puntero capturado)', prep.manda === true);
  comprueba('el motor trae el pestillo (mcPreviewCallada)', prep.hayPestillo === true);

  console.log('\n§1 · sin cambiar de herramienta, el fantasma sale como siempre');
  const base = await page.evaluate(async () => {
    mcSelectSlot();                              // pestillo suelto: nadie ha cambiado nada
    return { malla: await __hayMalla(), huella: await __pintaHuella(), callado: mcPreviewCallada(), tool: mc.tool };
  });
  comprueba('la herramienta es el pico (construir)', base.tool === 'build', base.tool);
  comprueba('no está callado', base.callado === false);
  comprueba('sale la malla translúcida', base.malla === true);
  comprueba('sale la caja de huella verde', base.huella === true, JSON.stringify(base.huella));

  console.log('\n§2 · cambiar de herramienta lo calla (y tira al momento el que hubiera)');
  const calla = await page.evaluate(async () => {
    await __hayMalla();                          // que haya malla ANTES de cambiar
    const antes = !!mc.preview;
    mcSetPlayerTool('select');
    const trasSalir = !!mc.preview;              // la que había se tira YA, no se queda colgada
    mcSetPlayerTool('build');
    return { antes, trasSalir, malla: await __hayMalla(), huella: await __pintaHuella(),
             pestillo: !!mc.previewMudo, callado: mcPreviewCallada() };
  });
  comprueba('había malla antes de cambiar', calla.antes === true);
  comprueba('cambiar de herramienta la tira al momento', calla.trasSalir === false);
  comprueba('…y al volver al pico NO vuelve sola', calla.malla === false);
  comprueba('…el pestillo queda echado', calla.pestillo === true && calla.callado === true);

  console.log('\n§3 · mientras calla, la CAJA DE HUELLA verde tampoco se dibuja');
  comprueba('la huella calla con la malla (las dos piezas o ninguna)', calla.huella === false,
            JSON.stringify(calla.huella));

  console.log('\n§4-§6 · la ranura lo devuelve; reafirmar la herramienta no lo calla');
  const ranura = await page.evaluate(async () => {
    const out = { calladoAntes: mcPreviewCallada() };
    mc.sel = 0; mcSelectSlot();                  // §4 pulsar una ranura = «esto quiero colocar»
    out.trasRanura = await __hayMalla();
    out.huellaTrasRanura = await __pintaHuella();

    mcSetPlayerTool('paint'); mcSetPlayerTool('build');
    out.calladoOtraVez = !(await __hayMalla());
    mcSelectSlot();                              // §5 la MISMA ranura, sin tocar mc.sel, también cuenta
    out.trasLaMisma = await __hayMalla();

    mcSetPlayerTool('build');                    // §6 reafirmar la que YA hay no calla nada
    out.trasReafirmar = await __hayMalla();
    return out;
  });
  comprueba('venía callado', ranura.calladoAntes === true);
  comprueba('pulsar la ranura devuelve la malla', ranura.trasRanura === true);
  comprueba('…y la caja de huella', ranura.huellaTrasRanura === true, JSON.stringify(ranura.huellaTrasRanura));
  comprueba('cambiar de herramienta lo vuelve a callar', ranura.calladoOtraVez === true);
  comprueba('pulsar la MISMA ranura también lo devuelve', ranura.trasLaMisma === true);
  comprueba('reafirmar la herramienta que ya hay NO lo calla', ranura.trasReafirmar === true);

  console.log('\n§7 · colocando una nota el fantasma no se calla (es otro)');
  const nota = await page.evaluate(() => {
    mcSetPlayerTool('select'); mcSetPlayerTool('build');    // pestillo echado
    const callado = mcPreviewCallada();
    mc.notePlacing = true;
    const conNota = mcPreviewCallada();
    mc.notePlacing = false;
    return { callado, conNota };
  });
  comprueba('con el pestillo echado, la estructura calla', nota.callado === true);
  comprueba('…pero el fantasma de la nota no', nota.conNota === false);

  console.log('\n§8 · callar no cambia el mundo');
  const quieto = await page.evaluate(async () => {
    const g0 = mc.gridGen | 0, h0 = mc.hist.length, s0 = mc.structures.length;
    mcSetPlayerTool('select'); mcSetPlayerTool('build');
    await __hayMalla(); await __pintaHuella();
    mcSelectSlot();
    await __hayMalla(); await __pintaHuella();
    return { gen: (mc.gridGen | 0) === g0, hist: mc.hist.length === h0, estr: mc.structures.length === s0 };
  });
  comprueba('el terreno no se ha tocado (mc.gridGen)', quieto.gen);
  comprueba('el historial no ha crecido', quieto.hist);
  comprueba('no se ha plantado ninguna estructura', quieto.estr);

  await page.evaluate(() => { window.mcRaycast = window.__rayoOrig; });
  await browser.close();

  const mtimeDespues = fs.statSync(VOX).mtimeMs;
  comprueba('empty.vox no se ha tocado', mtimeAntes === mtimeDespues);

  console.log(fallos.length ? '\n' + fallos.length + ' FALLOS: ' + fallos.join(' · ') : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})();
