// @area: editor
// @necesita: servidor, playwright
// REQ-CART4 · El TINTE del cartel, por nota: el panel de la `N` deja elegir un color (los seis de
// post-it o cualquier RGB) y el cartel entero se tinta de él.
//
// Lo que este test guarda, que es donde está el riesgo:
//   · el tinte va en su PROPIO mapa (`mc.noteTints`), como el giro: `mc.notes` sigue siendo
//     "clave → TEXTO" en todos los mundo.json escritos hasta hoy, y meterle un objeto dentro
//     cambiaría el formato para todos;
//   · el color está HORNEADO en la malla de la instancia, así que tiene que sobrevivir a
//     `mcRestampAll` — si no, editar un bloque al lado devolvería el cartel a madera;
//   · cambiar el tinte REPLANTA el cartel (y deja UNO), igual que cambiar la escala;
//   · el panel previsualiza EN VIVO y `Cancelar` devuelve el color de antes: sin eso, probar un
//     color dejaría el cartel pintado aunque el dueño se lo pensara;
//   · y el tinte se guarda con la nota (`noteTints` en el documento) y se va con ella al borrarla.
//
// No toca el mundo: intercepta los POST de /api/mundo y deshace la nota de prueba al final.
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
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\/mundo/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(2500);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const notasAntes = Object.keys(mc.notes).length;
    const bx = Math.floor(mc.pos[0]) + 12, bz = Math.floor(mc.pos[2]) + 12;
    let sy = 0; for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(bx, y, bz)]) { sy = y; break; }
    const cell = [bx, sy, bz], k = mcNoteKey(cell);
    if (mc.notes[k]) { out.errs.push('el sitio de prueba ya tenía nota'); return out; }
    const cartel = () => mc.structures.filter(t => t.nota === k);

    // ── 1 · normalizar el color: es la única puerta (un snippet puede escribir mc.noteTints) ──
    out.norm = ['#ABC', 'aabbcc', '#ffe066'].map(v => mcNoteTinteNorm(v)).join(' ');
    out.normOk = out.norm === '#aabbcc #aabbcc #ffe066';
    out.normBasura = ['', 'verde', '#12345', null, 7].every(v => mcNoteTinteNorm(v) === '');

    // ── 2 · tintar CONSERVA el relieve: dos grises distintos no salen del mismo color ─────────
    const T = mcNoteTinteRGB('#b7e778');
    const claro = mcTintaColor(T, 0.8, 0.8, 0.8), oscuro = mcTintaColor(T, 0.3, 0.3, 0.3);
    out.relieve = claro[1] > oscuro[1] + 0.1;
    out.verdeEsVerde = claro[1] > claro[0] && claro[1] > claro[2];      // el verde manda sobre R y B
    out.enRango = [...claro, ...oscuro].every(c => c >= 0 && c <= 1);

    // ── 3 · sin tinte: el cartel de siempre ───────────────────────────────────────────────────
    mc.notes[k] = 'CARTEL DE PRUEBA';
    await mcSyncNoteSigns();
    out.sinTinte = (cartel()[0] || {}).tinte === '';

    // ── 4 · poner tinte replanta el cartel, y queda UNO ───────────────────────────────────────
    mc.noteTints[k] = '#8fd3ff';
    out.desfasa = mcNoteSignsDesfasados();
    await mcSyncNoteSigns();
    out.conTinte = (cartel()[0] || {}).tinte === '#8fd3ff';
    out.uno = cartel().length === 1;
    out.yaNoDesfasa = !mcNoteSignsDesfasados();

    // ── 5 · el color está horneado en la malla ⇒ tiene que sobrevivir a re-estampar ───────────
    await mcRestampAll();
    out.trasRestamp = (cartel()[0] || {}).tinte === '#8fd3ff';
    out.trasRestampUno = cartel().length === 1;
    out.trasRestampDesfase = !mcNoteSignsDesfasados();

    // ── 6 · el panel de la N: muestras, previa en vivo y Cancelar ─────────────────────────────
    mcOpenNote(cell);
    const btns = [...document.querySelectorAll('.mc-note-tint-btn')].map(x => x.dataset.tint);
    out.muestras = btns.length === MC_NOTE_TINTES.length + 1;          // los 6 de post-it + «sin tinte»
    out.muestrasSonLaTabla = MC_NOTE_TINTES.every(t => btns.includes(t.hex));
    out.hayPicker = !!document.querySelector('#mc-note-tint-color');
    out.activaLaPuesta = (document.querySelector('.mc-note-tint-btn.active') || {}).dataset.tint === '#8fd3ff';
    document.querySelector('.mc-note-tint-btn[data-tint="#ffb3c1"]').click();
    await mcSyncNoteSigns();
    out.previaViva = mc.noteTints[k] === '#ffb3c1' && (cartel()[0] || {}).tinte === '#ffb3c1';
    mcCloseNote(true);                                                  // Cancelar
    await mcSyncNoteSigns();
    out.cancelarDevuelve = mc.noteTints[k] === '#8fd3ff' && (cartel()[0] || {}).tinte === '#8fd3ff';

    // …y Guardar lo fija (incluido «sin tinte», que es borrar la entrada)
    mcOpenNote(cell);
    document.querySelector('.mc-note-tint-btn[data-tint=""]').click();
    mcSaveNote();
    await mcSyncNoteSigns();
    out.guardarSinTinte = mc.noteTints[k] === undefined && (cartel()[0] || {}).tinte === '';

    // ── 7 · se guarda con la nota, en su propio mapa ──────────────────────────────────────────
    mc.noteTints[k] = '#ffe066'; await mcSyncNoteSigns();
    const doc = mcSerialize();
    out.enDoc = doc.noteTints && doc.noteTints[k] === '#ffe066';
    out.notasSiguenSiendoTexto = Object.values(doc.notes).every(v => typeof v === 'string');

    // ── 8 · borrar la nota se lleva el tinte ─────────────────────────────────────────────────
    mc.noteCell = cell.slice(); mcDeleteNote();
    await mcSyncNoteSigns();
    out.limpio = !mc.notes[k] && mc.noteTints[k] === undefined && !mc.structures.some(t => t.nota === k);
    out.notasIgual = Object.keys(mc.notes).length === notasAntes;
    return out;
  });

  if (r.errs && r.errs.length) { console.log('  FALLA  preparación: ' + r.errs.join(' · ')); fallos++; }

  console.log('\nEl color que se escribe');
  ok('«#ABC», «aabbcc» y «#ffe066» normalizan a #rrggbb', r.normOk, r.norm);
  ok('lo que no es un color se queda en «sin tinte»', r.normBasura);

  console.log('\nTintar conserva el dibujo');
  ok('un tono claro sigue saliendo más claro que uno oscuro', r.relieve);
  ok('un tinte verde tira a verde', r.verdeEsVerde);
  ok('y el color no se sale de [0,1]', r.enRango);

  console.log('\nEl cartel');
  ok('sin tinte se planta el dibujo tal cual', r.sinTinte);
  ok('poner tinte marca el cartel como desfasado', r.desfasa);
  ok('se replanta con el color', r.conTinte);
  ok('y queda UNO, no dos', r.uno);
  ok('y ya no pide replantado', r.yaNoDesfasa);

  console.log('\nEl color está horneado en la malla');
  ok('sobrevive a mcRestampAll', r.trasRestamp);
  ok('sigue habiendo UNO', r.trasRestampUno);
  ok('y no queda pidiendo replantado para siempre', r.trasRestampDesfase);

  console.log('\nEl panel de la N');
  ok('salen las muestras de post-it y la de «sin tinte»', r.muestras);
  ok('las muestras SON MC_NOTE_TINTES, no una copia en el HTML', r.muestrasSonLaTabla);
  ok('y hay selector de color a medida', r.hayPicker);
  ok('al abrir viene marcado el tinte puesto', r.activaLaPuesta);
  ok('elegir un color se ve EN VIVO en el cartel', r.previaViva);
  ok('Cancelar devuelve el que había', r.cancelarDevuelve);
  ok('Guardar «sin tinte» quita el color', r.guardarSinTinte);

  console.log('\nSe guarda con la nota');
  ok('el tinte va en noteTints del documento', r.enDoc);
  ok('y las notas siguen siendo "clave → texto"', r.notasSiguenSiendoTexto);
  ok('borrar la nota se lleva tinte y cartel', r.limpio);
  ok('y el mundo queda como estaba', r.notasIgual);

  ok('sin errores de página', errores.length === 0, errores.join(' | '));
  console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'TODO OK'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
