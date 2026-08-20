// @area: editor
// @necesita: servidor, playwright
// REQ-CART5 — «*me gustaria poder moverlas una vez plantadas, que tal un boton de "mover" dentro de la
// nota que me permita reposicionarla*» (nota del dueño en /map/bugfinder, 57,14,58).
//
// Lo que hay que entender para leer este test (docs/notas-y-fuente.md): **la nota es el dato y el cartel
// se deriva**. `mc.notes` va por clave `"x,y,z"`, así que la posición ES la clave y mover no es mover
// nada: es borrar una entrada y crear otra. El giro (`mc.noteRots`) y el tinte (`mc.noteTints`) son
// mapas APARTE con esa misma clave y tienen que viajar con ella, o el cartel nuevo sale del color de
// nadie y el viejo se queda huérfano en `mundo.json`.
//
// ⚠️ Trampas:
//   · Un «mover» que pierda el texto es peor que no tener el botón: `mcStartNoteMove` GUARDA antes de
//     empezar, y el tramo D comprueba justo eso — cancelar con Esc deja la nota entera donde estaba.
//   · El clic que planta pide puntero capturado, que en un navegador sin cabeza no llega; el gesto se
//     prueba por sus dos mitades (arranque y aterrizaje), y aparte se comprueba que el botón del panel
//     está cableado a la primera.
//   · Las notas del dueño NO se tocan: el test se inventa claves que estén libres y las borra al salir.

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

  // Tres claves libres: la de partida, el destino y una ocupada por otra nota (para el tramo E).
  const libres = await p.evaluate(() => {
    const libre = [];
    for (let y = 20; y < 40 && libre.length < 3; y++) {
      const k = '3,' + y + ',3';
      if (!mc.notes[k]) libre.push(k);
    }
    window._cart5 = { creadas: libre.slice() };
    return libre;
  });
  const [K0, K1, K2] = libres;
  ok('hay tres claves libres para trabajar', libres.length === 3, libres.join(' · '));
  const cel = k => k.split(',').map(Number);

  console.log('\nA · el panel enseña «Mover» solo cuando la nota EXISTE');
  const a = await p.evaluate(([K0]) => {
    const out = {};
    mcOpenNote(K0.split(',').map(Number));
    out.antes = $('#mc-note-move').hidden;                  // recién creada, aún sin texto guardado
    $('#mc-note-text').value = 'nota de prueba REQ-CART5';
    mcSetNoteTintUI('#b7e778', true);                       // verde de la paleta
    mcSetNoteRotUI(2, true);
    mcSaveNote();
    mcOpenNote(K0.split(',').map(Number));
    out.despues = $('#mc-note-move').hidden;
    out.cableado = $('#mc-note-move').onclick === mcStartNoteMove;
    mcCloseNote(false);
    return out;
  }, [K0]);
  ok('sin nota guardada, el botón está escondido', a.antes === true);
  ok('con nota, se ve', a.despues === false);
  ok('y está cableado a mcStartNoteMove', a.cableado === true);

  console.log('\nB · «Mover» guarda lo tecleado y entra en el Modo Cartel');
  const bres = await p.evaluate(([K0]) => {
    mcOpenNote(K0.split(',').map(Number));
    $('#mc-note-text').value = 'nota de prueba REQ-CART5 (retocada)';
    mcStartNoteMove();
    return {
      texto: mc.notes[K0],
      colocando: !!mc.notePlacing,
      moviendo: mc.noteMoving,
      giro: mc.notePlaceRot,
      panel: $('#mc-note').hidden,
    };
  }, [K0]);
  ok('lo tecleado se guardó ANTES de mover', /retocada/.test(bres.texto || ''), bres.texto);
  ok('se entra en el Modo Cartel (fantasma + R + Esc)', bres.colocando === true);
  ok('y se recuerda qué nota se está moviendo', bres.moviendo === K0, String(bres.moviendo));
  ok('el fantasma arranca con el giro de la nota', bres.giro === 2, 'rot=' + bres.giro);
  ok('el panel se cierra solo', bres.panel === true);

  console.log('\nC · al soltarla, la nota entera cambia de clave (texto, giro y tinte)');
  const c = await p.evaluate(async ([K0, K1]) => {
    mcMoveNoteA(K1.split(',').map(Number));                 // sin `rot`: conserva el suyo
    await mcSyncNoteSigns();
    return {
      viejoTxt: mc.notes[K0], nuevoTxt: mc.notes[K1],
      viejoRot: mc.noteRots[K0], nuevoRot: mc.noteRots[K1],
      viejoTin: mc.noteTints[K0], nuevoTin: mc.noteTints[K1],
      moviendo: mc.noteMoving, colocando: !!mc.notePlacing,
      carteles: mc.structures.filter(s => s.nota === K0).length + '/' + mc.structures.filter(s => s.nota === K1).length,
    };
  }, [K0, K1]);
  ok('el texto está en la clave nueva', /retocada/.test(c.nuevoTxt || ''), c.nuevoTxt);
  ok('…y ya no en la vieja', c.viejoTxt === undefined);
  ok('el giro viaja con ella', c.nuevoRot === 2 && c.viejoRot === undefined, 'nuevo=' + c.nuevoRot + ' viejo=' + c.viejoRot);
  ok('el tinte también (y no se queda huérfano)', c.nuevoTin === '#b7e778' && c.viejoTin === undefined, 'nuevo=' + c.nuevoTin);
  ok('el cartel se replanta solo: 0 en el sitio viejo, 1 en el nuevo', c.carteles === '0/1', c.carteles);
  ok('y el Modo Cartel se apaga al soltar', c.moviendo === null && c.colocando === false);

  console.log('\nD · cancelar (Esc) NO pierde la nota');
  const d = await p.evaluate(([K1]) => {
    mcOpenNote(K1.split(',').map(Number));
    mcStartNoteMove();
    mcCancelNotePlace();                                    // = la Esc del Modo Cartel
    return { txt: mc.notes[K1], tinte: mc.noteTints[K1], moviendo: mc.noteMoving, colocando: !!mc.notePlacing };
  }, [K1]);
  ok('la nota sigue entera donde estaba', /retocada/.test(d.txt || '') && d.tinte === '#b7e778');
  ok('y no queda ningún movimiento a medias', d.moviendo === null && d.colocando === false);

  console.log('\nE · una nota no pisa a otra');
  const e = await p.evaluate(([K1, K2]) => {
    mc.notes[K2] = 'la nota que ya estaba ahí';             // ocupa el destino
    mcOpenNote(K1.split(',').map(Number));
    mcStartNoteMove();
    mcMoveNoteA(K2.split(',').map(Number));
    return { destino: mc.notes[K2], origen: mc.notes[K1], moviendo: mc.noteMoving };
  }, [K1, K2]);
  ok('la de destino no se machaca', e.destino === 'la nota que ya estaba ahí');
  ok('y la que se movía se queda donde estaba', /retocada/.test(e.origen || ''));
  ok('el movimiento se da por terminado (no se queda pegado)', e.moviendo === null);

  console.log('\nF · mover al MISMO sitio no la borra');
  const f = await p.evaluate(([K1]) => {
    mcOpenNote(K1.split(',').map(Number));
    mcStartNoteMove();
    mcMoveNoteA(K1.split(',').map(Number));
    return { txt: mc.notes[K1], tinte: mc.noteTints[K1] };
  }, [K1]);
  ok('sigue ahí con su texto y su tinte', /retocada/.test(f.txt || '') && f.tinte === '#b7e778');

  // Fuera lo que plantó el test (y solo eso: las notas del dueño no se tocan). Se barren también los
  // carteles que se hayan quedado SUELTOS en esas mismas posiciones: una vuelta anterior de este test,
  // con la carrera de BUG-CART1 todavía sin arreglar, dejó tres clavados en `data/worlds/test.json` —
  // y ahí no hay quien los quite, porque al cargar vuelven sin `nota` y ya nadie los reconoce.
  await p.evaluate(async () => {
    const sitios = new Set(window._cart5.creadas.map(k => mcNoteSignOrigin(k).join(',')));
    for (const k of window._cart5.creadas) { delete mc.notes[k]; delete mc.noteRots[k]; delete mc.noteTints[k]; }
    mc.noteMoving = null; mcCancelNotePlace(); mcCloseNote(false);
    await mcSyncNoteSigns();
    for (const s of mc.structures.slice()) {
      if (s.nota || !/cartel/.test(s.key)) continue;
      if (sitios.has(s.ox + ',' + s.oy + ',' + s.oz)) mcRemoveStruct(s, true);
    }
    mcDirtyHeader(); mcScheduleSave();
  });
  await p.waitForTimeout(4000);                 // el guardado va con retardo: darle tiempo a salir

  ok('sin errores de página', errores.length === 0, errores.join(' · '));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nOK');
  process.exit(fallos ? 1 : 0);
})();
