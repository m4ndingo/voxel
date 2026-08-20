// @area: editor
// @necesita: servidor, playwright
// BUG-CART1 — carteles de nota que se colaban en el DOCUMENTO del mundo.
//
// El cartel se DERIVA de `mc.notes` y va marcado `efimera`, así que `mundo.json` no debería llevar
// ninguno nunca. Pero la marca se ponía DESPUÉS del `await` de `mcStampStruct`, y estampar tarda
// (atlas, malla, a veces red): un guardado que cayera en ese hueco se llevaba el cartel al fichero. Y
// de ahí ya no salía — al cargar vuelve SIN `nota` ni `efimera`, nadie lo reconoce, y cada guardado
// añadía otro encima. En `data/worlds/test.json` había siete apilados de tres en tres.
//
// Dos mitades, y las dos hacen falta:
//   A) la marca viaja EN la llamada (`mcStampStruct(..., marca)`) ⇒ no hay hueco que aprovechar. Se
//      comprueba mirando la instancia MIENTRAS se estampa, que es justo el momento del fallo.
//   B) el motor se cura solo: un cartel sin `nota` plantado donde va el de una nota viva es basura del
//      documento y `mcSyncNoteSignsRun` lo retira (y `mcNoteSignsDesfasados` tiene que VERLO, o la
//      limpieza no llegaría a correr nunca porque todo lo demás cuadra).
//
// Lo que este guardián NO cubre: los carteles huérfanos (los de un bloque que ya no tiene nota) no se
// tocan a propósito — no se distinguen de uno puesto a mano como decoración. Ésos los quita el dueño
// con `python3 herramientas/carteles_fantasma.py --escribe`.
//
// ⚠️ El test se declara escaparate mientras trabaja (`mc.escaparate`), que es el interruptor que apaga
// los guardados (REQ-OSD3): un test sobre lo que se escribe en el fichero no puede escribir en él.

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

  const prep = await p.evaluate(async () => {
    window._cart1 = { esc: mc.escaparate };
    mc.escaparate = true;                                    // nada de guardar mientras dura esto
    let k = null;
    for (let y = 20; y < 40 && !k; y++) if (!mc.notes['5,' + y + ',5']) k = '5,' + y + ',5';
    window._cart1.k = k;
    mc.notes[k] = 'nota de prueba BUG-CART1';
    await mcSyncNoteSigns();
    return { k, origen: mcNoteSignOrigin(k).join(',') };
  });
  ok('hay una nota de trabajo con su cartel', !!prep.k, prep.k + ' → cartel en ' + prep.origen);

  console.log('\nA · el cartel nace ya marcado (no hay ventana para que un guardado lo pille)');
  const a = await p.evaluate(async () => {
    const k = window._cart1.k;
    // Se estampa un cartel A MANO por el mismo camino que la sincronización y se mira la instancia
    // ANTES de que la promesa termine: ahí es donde antes estaba sin marcar.
    const o = mcNoteSignOrigin(k);
    const marca = { efimera: true, nota: k, cartel: mcCartelFirma() };
    const pr = mcStampStruct('asset:assets/cartel.vox.json', o[0], o[1] + 4, o[2], 1, true, 1, '', marca);
    const viva = mc.structures[mc.structures.length - 1];
    const out = {
      marcadaYa: !!(viva && viva.efimera && viva.nota === k),
      enDocDurante: mcStructuresDoc().some(d => /cartel/.test(d.key) && d.y === o[1] + 4),
    };
    const s = await pr;
    // Al terminar puede que ya no exista: el repaso del bucle se lleva los carteles duplicados de una
    // misma nota, y éste lo es. Lo que importa es que en ningún momento haya entrado en el documento.
    out.docTrasEstampar = mcStructuresDoc().some(d => /cartel/.test(d.key) && d.y === o[1] + 4);
    if (s) mcRemoveStruct(s, true);
    return out;
  });
  ok('la instancia está marcada desde el primer momento', a.marcadaYa === true);
  ok('…así que un guardado a mitad de estampado NO la escribe', a.enDocDurante === false);
  ok('ni al terminar', a.docTrasEstampar === false);

  console.log('\nB · un cartel fantasma del documento se retira solo');
  const bres = await p.evaluate(async () => {
    const k = window._cart1.k, o = mcNoteSignOrigin(k);
    // Un fantasma es exactamente esto: el cartel de una nota, en su sitio, pero SIN marca (así vuelve
    // del fichero). Se mete a mano y no con `mcStampStruct` a posta: estampar es asíncrono, y el repaso
    // del bucle —que es lo que se está probando— lo barrería antes de poder mirarlo. Metiéndolo así,
    // crearlo y mirarlo pasan en el MISMO tramo síncrono y no hay carrera.
    mc.structures.push({ key: 'asset:assets/cartel.vox.json', ox: o[0], oy: o[1], oz: o[2], rot: 1, esc: 1, tinte: '',
      colVbo: null, colCount: 0, alphaVbo: null, alphaCount: 0, texVbo: null, texCount: 0,
      aabb: [o[0], o[1], o[2], o[0] + 2, o[1] + 2, o[2] + 1] });
    const out = { enDoc: mcStructuresDoc().some(d => /cartel/.test(d.key) && d.x === o[0] && d.y === o[1] && d.z === o[2]) };
    out.desfasado = mcNoteSignsDesfasados();                 // el chequeo barato tiene que verlo
    await mcSyncNoteSigns();
    out.quedanSinNota = mc.structures.filter(s => /cartel/.test(s.key) && !s.nota && s.ox === o[0] && s.oy === o[1] && s.oz === o[2]).length;
    out.sigueElBueno = mc.structures.filter(s => s.nota === k).length;
    out.docLimpio = !mcStructuresDoc().some(d => /cartel/.test(d.key) && d.x === o[0] && d.y === o[1] && d.z === o[2]);
    return out;
  });
  ok('un cartel sin marcar SÍ entra en el documento (era el bug)', bres.enDoc === true);
  ok('el chequeo barato lo ve desfasado', bres.desfasado === true);
  ok('la sincronización lo retira', bres.quedanSinNota === 0, 'quedan=' + bres.quedanSinNota);
  ok('…sin llevarse por delante el cartel bueno', bres.sigueElBueno === 1, 'buenos=' + bres.sigueElBueno);
  ok('y el documento queda limpio', bres.docLimpio === true);

  console.log('\nC · el cartel de una nota viva nunca está en el documento');
  const c = await p.evaluate(() => {
    const k = window._cart1.k;
    return { doc: mcStructuresDoc().some(d => /cartel/.test(d.key) && d.y === mcNoteSignOrigin(k)[1] && d.x === mcNoteSignOrigin(k)[0]),
             nota: !!(mcSerialize().notes || {})[k] };
  });
  ok('la nota sí se guarda', c.nota === true);
  ok('el cartel no', c.doc === false);

  // Fuera la nota de trabajo (y su cartel con ella). El escaparate se levanta ANTES de limpiar, no
  // después: es el interruptor que apaga los guardados, y con él puesto la limpieza no llegaría al
  // fichero. Se barren también las que hubiera dejado una vuelta anterior que petara a medias.
  await p.evaluate(async () => {
    mc.escaparate = window._cart1.esc;
    for (const k in mc.notes) if (/prueba BUG-CART1/.test(mc.notes[k])) {
      delete mc.notes[k]; delete mc.noteRots[k]; delete mc.noteTints[k];
    }
    await mcSyncNoteSigns();
    // Se guarda a mano (`mcSaveWorld`) en vez de encolar: `mcScheduleSave` no hace nada si el mundo va
    // en modo escaparate o con el autoguardado apagado, y entonces la basura del test se quedaría en
    // `data/worlds/test.json` para siempre — que es exactamente lo que este ticket vino a limpiar.
    mcDirtyHeader();
    await mcSaveWorld();
  });

  ok('sin errores de página', errores.length === 0, errores.join(' · '));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nOK');
  process.exit(fallos ? 1 : 0);
})();
