// @area: editor
// @necesita: servidor, playwright
// El cartel de las notas: una nota se ve como assets/cartel.vox.json plantado sobre su bloque, y ese
// cartel responde a la tecla N (ver/editar/borrar) igual que el bloque anotado.
//
// Lo que este test guarda, que es donde está el riesgo:
//   · el cartel se DERIVA de mc.notes (aparece y desaparece con ella) y va marcado `efimera`, así que
//     mundo.json sigue llevando solo notas — si algún día se persistiera, habría dos fuentes de verdad;
//   · apuntar al cartel (2×2 celdas ENCIMA del bloque) resuelve a la nota, que es lo único que hace
//     que mirarlo enseñe el texto y que la N abra la nota buena en vez de una nueva en el aire;
//   · game.noteSigns=false devuelve el post-it de siempre y retira los carteles.
// No persiste nada: bloquea el POST del mundo y deja las notas como estaban.
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
    const K = 'asset:assets/cartel.vox.json';
    const notasAntes = Object.keys(mc.notes).length;

    // Un sitio despejado: sobre el suelo, lejos de lo que el dueño tenga montado en /map/test.
    const bx = Math.floor(mc.pos[0]) + 8, bz = Math.floor(mc.pos[2]) + 8;
    let sy = 0; for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(bx, y, bz)]) { sy = y; break; }
    const cell = [bx, sy, bz], k = mcNoteKey(cell);
    if (mc.notes[k]) { out.errs.push('el sitio de prueba ya tenía nota'); return out; }
    const TXT = 'nota de prueba del cartel';

    // ── 1 · la nota planta el cartel ──────────────────────────────────────────────────────────
    mc.notes[k] = TXT;
    await mcSyncNoteSigns();
    const s = mc.structures.find(t => t.nota === k);
    out.hayCartel = !!s;
    out.esCartel = !!s && s.key === K;
    out.efimera = !!s && s.efimera === true;
    out.encima = !!s && s.ox === bx && s.oy === sy + 1 && s.oz === bz;
    out.enElDoc = mcStructuresDoc().some(d => d.key === K && d.y === sy + 1 && d.x === bx && d.z === bz);
    out.notaEnElDoc = !!(mcSerialize().notes || {})[k];

    // ── 2 · apuntar al cartel es apuntar a la nota ────────────────────────────────────────────
    const a = s ? s.aabb : [0, 0, 0, 0, 0, 0];
    const celdas = [];
    for (let x = Math.floor(a[0]); x <= Math.ceil(a[3]) - 1; x++)
      for (let y = Math.floor(a[1]); y <= Math.ceil(a[4]) - 1; y++)
        for (let z = Math.floor(a[2]); z <= Math.ceil(a[5]) - 1; z++) celdas.push([x, y, z]);
    out.celdas = celdas.length;
    out.anclaTodas = celdas.length > 0 && celdas.every(c => { const q = mcNoteAnchor(c); return q && mcNoteKey(q) === k; });
    out.anclaFuera = mcNoteAnchor([bx, sy + 4, bz]) === null;          // el aire de al lado no es la nota
    out.anclaBloque = mcNoteKey(mcNoteAnchor(cell) || []) === k;       // y el bloque anotado sigue valiendo
    out.notaCelda = cell.join(',');
    // Un cartel no corta el paso: si lo cortara, anotar el bloque que pisas te dejaría encerrado, y un
    // agente que va dejando notas se levantaría un muro a su espalda.
    // Se mide EN el plano del cartel (canto en z=bz) y contra el poste (x=bx+1), que es por donde se
    // pasa de verdad; a media celda de distancia no chocaría ni siendo macizo.
    out.choca = mcCollides(bx + 1, sy + 1, bz) || mcCollides(bx + 0.5, sy + 1, bz);
    out.chocaPie = mcCollides(bx + 0.5, sy + 1, bz + 0.5);              // de pie sobre el bloque anotado

    // ── 3 · la N sobre el cartel abre ESA nota ────────────────────────────────────────────────
    const pos0 = mc.pos.slice(), yaw0 = mc.yaw, pitch0 = mc.pitch;
    mc.pos[0] = bx + 1; mc.pos[1] = sy + 1; mc.pos[2] = bz - 3;         // delante de la tabla
    mc.yaw = Math.PI; mc.pitch = 0;                                     // mirando hacia +Z
    const ojo = mc.pos[1] + MC_EYE * (mc.scale || 1);
    mc.pitch = Math.atan2((sy + 2.5) - ojo, 3);                         // a la altura de la tabla
    const hit = mcRaycast(mcReach(), true);
    out.rayoDaEnElCartel = !!hit && !!mcNoteAnchor(hit.cell) && mcNoteKey(mcNoteAnchor(hit.cell)) === k;
    out.rayoCelda = hit ? hit.cell.join(',') : null;
    mcUpdateNoteView();
    mcOpenNote();
    out.panelAbierto = !document.getElementById('mc-note').hidden;
    out.panelTexto = document.getElementById('mc-note-text').value;
    out.panelCelda = mc.noteCell ? mc.noteCell.join(',') : null;
    out.borrarVisible = !document.getElementById('mc-note-del').hidden;
    mcCloseNote();

    // ── 3b · el TEXTO escrito en la tabla ─────────────────────────────────────────────────────
    // La tabla no se declara en ningún sitio: se DERIVA de la forma de la pieza estampada, así que lo
    // primero que hay que guardar es que sale la de arriba (y no el poste). Después, lo que pidió el
    // dueño: de cerca se lee en el cartel y «de muy lejos no haría falta». Y el visor de debajo de la
    // mira solo se calla cuando el rótulo se lee ENTERO y de tamaño legible — que quepa no basta.
    const rect = s ? mcNoteBoardRect(s) : null;
    out.rect = !!rect;
    out.rectArriba = !!rect && rect.v0 > sy + 1;                  // la tabla es la mitad de arriba, no el poste
    out.rectFino = !!rect && (rect.n1 - rect.n0) <= 0.2;          // y es un plano, no un bloque
    if (rect) {
      const hm = (rect.h0 + rect.h1) / 2, vm = (rect.v0 + rect.v1) / 2;
      const ponte = d => {
        if (rect.na === 0) { mc.pos[0] = rect.n1 + d; mc.pos[2] = hm; mc.yaw = -Math.PI / 2; }
        else { mc.pos[2] = rect.n1 + d; mc.pos[0] = hm; mc.yaw = 0; }
        mc.pos[1] = vm - MC_EYE * (mc.scale || 1); mc.pitch = 0; mcRender();
      };
      ponte(2.5);
      out.cerca = mc.noteTextN; out.releva = mc._noteTextDrawn.has(k);
      ponte(mc.noteTextDist * (mc.scale || 1) + 5);
      out.lejos = mc.noteTextN;
      // Una parrafada cabe, pero encogida hasta el borrón. Fueron 40 repeticiones hasta que REQ-CART1
      // dejó de tirar tamaño en la rejilla de múltiplos de 9: con 40 el rótulo pasó de 6,9 px a 13,5 px
      // de pantalla por letra a esta distancia, o sea que ya SE LEE y relevar al visor es lo correcto.
      // Lo que este caso vigila es el rótulo ilegible, así que el borrón hay que buscarlo más lejos:
      // 120 repeticiones dan 8,2 px, por debajo de MC_NOTE_TEXT_LEGIBLE (10) y sin llegar al recorte.
      mc.notes[k] = TXT + '. ' + 'lorem ipsum '.repeat(120);
      ponte(2.5);
      out.largoCerca = mc.noteTextN; out.largoReleva = mc._noteTextDrawn.has(k);
      // Guardián de REQ-CART1 por el otro lado: una nota larga NORMAL (271 caracteres, de las que el
      // dueño escribe) tiene que leerse desde 2,5 m. Ocupaba 0,070 del alto de la tabla porque el
      // cuerpo óptimo (25,2 px sobre un lienzo fijo de 256) se redondeaba a 18; hoy el lienzo se elige
      // para que el múltiplo de 9 caiga justo y sube a 0,096.
      mc.notes[k] = 'Esta es una nota larga de las que el dueño escribe cuando quiere dejar constancia de algo en el mundo, con varias frases seguidas y sin puntos y aparte, para ver hasta dónde encoge el rótulo antes de que haya que acercarse al cartel para poder leerlo bien.';
      ponte(2.5);
      out.realFrac = mcNoteTexture(mc.notes[k], (rect.h1 - rect.h0) / (rect.v1 - rect.v0)).frac;
      out.realReleva = mc._noteTextDrawn.has(k);
      mc.notes[k] = TXT;
      game.noteText = false; ponte(2.5); out.apagado = mc.noteTextN; game.noteText = true;
    }

    // ── 4 · el interruptor y la retirada ──────────────────────────────────────────────────────
    game.noteSigns = false; await mcSyncNoteSigns();
    out.sinCarteles = !mc.structures.some(t => t.nota);
    game.noteSigns = true; await mcSyncNoteSigns();
    out.vuelven = mc.structures.some(t => t.nota === k);

    // ── 5 · borrar la nota se lleva el cartel ─────────────────────────────────────────────────
    mc.noteCell = cell.slice(); mcDeleteNote(); await mcSyncNoteSigns();
    out.notaBorrada = !mc.notes[k];
    out.cartelRetirado = !mc.structures.some(t => t.nota === k);
    out.sinRestos = !mc.structures.some(t => t.key === K && t.ox === bx && t.oy === sy + 1 && t.oz === bz);

    mc.pos[0] = pos0[0]; mc.pos[1] = pos0[1]; mc.pos[2] = pos0[2]; mc.yaw = yaw0; mc.pitch = pitch0;
    out.notasIgual = Object.keys(mc.notes).length === notasAntes;
    return out;
  });

  if (r.errs && r.errs.length) { console.log('  FALLA  preparación: ' + r.errs.join(' · ')); fallos++; }
  console.log('\nLa nota planta el cartel');
  ok('aparece una estructura atada a la nota', r.hayCartel);
  ok('y es el cartel del dueño', r.esCartel);
  ok('marcada efímera (no la guarda mundo.json)', r.efimera);
  ok('plantada sobre el bloque anotado', r.encima);
  ok('el documento del mundo NO la lleva', r.enElDoc === false);
  ok('la nota sí sigue en el documento', r.notaEnElDoc);

  console.log('\nApuntar al cartel es apuntar a la nota');
  ok('el cartel ocupa 4 celdas', r.celdas === 4, r.celdas + ' celda(s)');
  ok('todas resuelven a la nota', r.anclaTodas);
  ok('el bloque anotado también', r.anclaBloque);
  ok('y el aire de al lado no', r.anclaFuera);
  ok('y no corta el paso (se atraviesa)', r.choca === false);

  console.log('\nLa tecla N sobre el cartel');
  ok('el rayo de apuntado da en el cartel', r.rayoDaEnElCartel, 'celda ' + r.rayoCelda);
  ok('abre el panel', r.panelAbierto);
  ok('con el texto de la nota', r.panelTexto === 'nota de prueba del cartel', JSON.stringify(r.panelTexto));
  ok('sobre la celda de la nota, no la del cartel', r.panelCelda === r.notaCelda, r.panelCelda + ' vs ' + r.notaCelda);
  ok('y con «Borrar» a mano', r.borrarVisible);

  console.log('\nEl texto escrito en la tabla');
  ok('la tabla se deriva de la forma de la pieza', r.rect);
  ok('es la mitad de arriba, no el poste', r.rectArriba);
  ok('y es un plano fino, no un bloque', r.rectFino);
  ok('de cerca el rótulo se dibuja', r.cerca >= 1, 'dibujados=' + r.cerca);   // el mapa trae más notas: >=1
  ok('y releva al visor de la mira', r.releva);
  ok('de muy lejos no se dibuja', r.lejos === 0, 'dibujados=' + r.lejos);
  ok('una parrafada también se dibuja', r.largoCerca >= 1, 'dibujados=' + r.largoCerca);
  ok('…pero encogida NO releva al visor', r.largoReleva === false);
  ok('una nota larga normal aprovecha la tabla', r.realFrac >= 0.09, 'frac=' + (r.realFrac || 0).toFixed(4));
  ok('…y por tanto se lee desde 2,5 m', r.realReleva === true);
  ok('game.noteText=false lo apaga', r.apagado === 0, 'dibujados=' + r.apagado);

  console.log('\nEl interruptor y el borrado');
  ok('game.noteSigns=false retira los carteles', r.sinCarteles);
  ok('…y en true vuelven', r.vuelven);
  ok('borrar la nota la borra', r.notaBorrada);
  ok('…y se lleva el cartel', r.cartelRetirado);
  ok('sin dejar la estructura suelta', r.sinRestos);
  ok('el mapa queda con las notas de partida', r.notasIgual);
  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));

  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\ntodo ok');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();