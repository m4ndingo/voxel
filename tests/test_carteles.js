// @area: editor
// @necesita: servidor, playwright
// REQ-CART3 · `game.carteles`: cómo se planta el cartel de una nota (escala, con o sin palo, dónde y
// mirando adónde) y desde cuándo se deja de leer su rótulo.
//
// Lo que este test guarda, que es donde está el riesgo:
//   · los cuatro ajustes son GLOBALES y no tocan `mc.notes`, que sigue siendo "clave → texto": si
//     alguien los mete por nota, cambia el formato de todos los mundo.json escritos hasta hoy;
//   · cambiar un ajuste REPLANTA los carteles ya puestos (firma en `s.cartel`) y deja UNO por nota —
//     sin la firma, cambiar la escala no se vería hasta recargar; con una firma que no sobrevive a
//     `mcRestampAll`, el cartel se replantaría en cada ciclo para siempre;
//   · el RÓTULO va con la escala: sale de `mcNoteBoardRect`, que trabaja en voxeles finos del dibujo,
//     y sin multiplicar por `s.esc` un cartel doble se rotularía en un cuarto de su tabla;
//   · en una pantalla-menú (`mc.escaparate`) el rótulo NO se desvanece: la cámara está lejos a
//     propósito para que quepa el menú, y un botón ilegible no es un botón.
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
    const CON = 'asset:assets/cartel.vox.json', SIN = 'asset:assets/cartel_tabla.vox.json';
    const notasAntes = Object.keys(mc.notes).length;
    const pos0 = mc.pos.slice(), yaw0 = mc.yaw, pitch0 = mc.pitch;
    const cfg0 = JSON.parse(JSON.stringify(mc.carteles));

    const bx = Math.floor(mc.pos[0]) + 10, bz = Math.floor(mc.pos[2]) + 10;
    let sy = 0; for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(bx, y, bz)]) { sy = y; break; }
    const cell = [bx, sy, bz], k = mcNoteKey(cell);
    if (mc.notes[k]) { out.errs.push('el sitio de prueba ya tenía nota'); return out; }
    const cartel = () => mc.structures.filter(t => t.nota === k);
    const uno = () => cartel()[0] || null;

    mc.notes[k] = 'BOTON DE PRUEBA';
    await mcSyncNoteSigns();

    // ── 1 · de fábrica: el cartel de siempre, con palo, encima del bloque ─────────────────────
    let s = uno();
    out.base = !!s && s.key === CON && s.esc === 1 && s.oy === sy + 1 && s.rot === 1;
    out.baseFirma = !!s && !!s.cartel;
    const rect0 = s ? mcNoteBoardRect(s) : null;
    out.rect0 = !!rect0;

    // ── 2 · escala: el cartel Y su rótulo ─────────────────────────────────────────────────────
    // El rótulo es la mitad del ticket: la tabla se deriva del bitset del dibujo, que no sabe nada de
    // la escala de la instancia, así que aquí es donde se ve si se coló el factor.
    game.carteles.escala = 2;
    out.desfasa2 = mcNoteSignsDesfasados();     // cambiar el ajuste tiene que pedir replantado
    await mcSyncNoteSigns();
    s = uno();
    out.esc2 = !!s && s.esc === 2;
    out.esc2Uno = cartel().length === 1;        // replantado, no duplicado
    const rect2 = s ? mcNoteBoardRect(s) : null;
    out.rect2 = !!rect2;
    if (rect0 && rect2) {
      const an0 = rect0.h1 - rect0.h0, an2 = rect2.h1 - rect2.h0;
      const al0 = rect0.v1 - rect0.v0, al2 = rect2.v1 - rect2.v0;
      out.rectAncho = Math.abs(an2 - an0 * 2) < 0.05;
      out.rectAlto = Math.abs(al2 - al0 * 2) < 0.05;
      out.rectRel = an0 / al0;
    }
    // y sigue siendo apuntable: el rótulo doble no sirve de nada si el botón deja de resolver a su nota
    const a = s ? s.aabb : [0, 0, 0, 0, 0, 0];
    let celdas = 0, anclan = 0;
    for (let x = Math.floor(a[0]); x <= Math.ceil(a[3]) - 1; x++)
      for (let y = Math.floor(a[1]); y <= Math.ceil(a[4]) - 1; y++)
        for (let z = Math.floor(a[2]); z <= Math.ceil(a[5]) - 1; z++) {
          celdas++; const q = mcNoteAnchor([x, y, z]); if (q && mcNoteKey(q) === k) anclan++;
        }
    out.escAncla = celdas > 0 && anclan === celdas;
    game.carteles.escala = 1; await mcSyncNoteSigns();

    // ── 3 · sin palo: otro dibujo, y la tabla es TODO el cartel ───────────────────────────────
    game.carteles.palo = false;
    await mcSyncNoteSigns();
    s = uno();
    out.sinPalo = !!s && s.key === SIN;
    out.sinPaloUno = cartel().length === 1;
    const rectS = s ? mcNoteBoardRect(s) : null;
    out.sinPaloRect = !!rectS;
    // con palo la tabla es la mitad de arriba; sin palo empieza en el suelo de su propia celda
    out.sinPaloEntero = !!rectS && !!rect0 && (rectS.v0 - (sy + 1)) < (rect0.v0 - (sy + 1)) - 0.4;
    game.carteles.palo = true; await mcSyncNoteSigns();

    // ── 4 · desvío y giro ─────────────────────────────────────────────────────────────────────
    game.carteles.desvio = [0, 0, 0];
    await mcSyncNoteSigns();
    s = uno();
    out.desvio = !!s && s.ox === bx && s.oy === sy && s.oz === bz;
    game.carteles.desvio = [0, 1, 0];
    game.carteles.giro = 5;
    await mcSyncNoteSigns();
    s = uno();
    out.giro = !!s && s.rot === 5;
    out.giroUno = cartel().length === 1;
    game.carteles.giro = 1; await mcSyncNoteSigns();

    // ── 5 · la firma sobrevive a un re-estampado ──────────────────────────────────────────────
    // mcRestampAll sustituye CADA instancia por un objeto nuevo (BUG-AG3). Si la firma no viaja en el
    // relevo, el repaso ve el cartel desfasado y lo replanta una vez por ciclo, para siempre.
    await mcRestampAll();
    out.trasRestamp = !mcNoteSignsDesfasados();
    out.trasRestampUno = cartel().length === 1;

    // ── 6 · la distancia de lectura ───────────────────────────────────────────────────────────
    out.distDef = mc.noteTextDist;              // ×1,5 del 14 de antes, a petición del dueño
    s = uno();
    const rect = s ? mcNoteBoardRect(s) : null;
    if (rect) {
      const hm = (rect.h0 + rect.h1) / 2, vm = (rect.v0 + rect.v1) / 2;
      const ponte = d => {
        if (rect.na === 0) { mc.pos[0] = rect.n1 + d; mc.pos[2] = hm; mc.yaw = -Math.PI / 2; }
        else { mc.pos[2] = rect.n1 + d; mc.pos[0] = hm; mc.yaw = 0; }
        mc.pos[1] = vm - MC_EYE * (mc.scale || 1); mc.pitch = 0; mcRender();
      };
      ponte(2.5); out.cerca = mc.noteTextN;
      ponte(mc.noteTextDist * (mc.scale || 1) + 5); out.lejos = mc.noteTextN;
      // el mismo sitio, pero siendo una pantalla-menú: ahí no se desvanece nunca
      mc.escaparate = true; ponte(mc.noteTextDist * (mc.scale || 1) + 5); out.menuLejos = mc.noteTextN;
      ponte(mc.noteTextDist * (mc.scale || 1) * 4); out.menuMuyLejos = mc.noteTextN;
      mc.escaparate = false;
    }

    // ── 7 · nada de esto toca el documento del mundo ──────────────────────────────────────────
    out.notaEnDoc = !!(mcSerialize().notes || {})[k];
    out.cartelFueraDelDoc = !mcStructuresDoc().some(d => d.key === CON || d.key === SIN);

    // deshacer
    mc.noteCell = cell.slice(); mcDeleteNote();
    mc.carteles = cfg0; await mcSyncNoteSigns();
    mc.pos[0] = pos0[0]; mc.pos[1] = pos0[1]; mc.pos[2] = pos0[2]; mc.yaw = yaw0; mc.pitch = pitch0;
    out.limpio = !mc.notes[k] && !mc.structures.some(t => t.nota === k);
    out.notasIgual = Object.keys(mc.notes).length === notasAntes;
    return out;
  });

  if (r.errs && r.errs.length) { console.log('  FALLA  preparación: ' + r.errs.join(' · ')); fallos++; }

  console.log('\nDe fábrica');
  ok('cartel con palo, encima del bloque, escala 1, giro 1', r.base);
  ok('y lleva la firma de los ajustes con que se plantó', r.baseFirma);
  ok('la tabla se deriva del dibujo', r.rect0);

  console.log('\ngame.carteles.escala');
  ok('cambiarla marca los carteles como desfasados', r.desfasa2);
  ok('el cartel se replanta a escala 2', r.esc2);
  ok('y queda UNO, no dos', r.esc2Uno);
  ok('el rótulo mide el doble de ancho', r.rectAncho, 'relación ancho/alto ' + (r.rectRel || 0).toFixed(2));
  ok('el rótulo mide el doble de alto', r.rectAlto);
  ok('el cartel grande sigue resolviendo a su nota', r.escAncla);

  console.log('\ngame.carteles.palo');
  ok('sin palo se planta el dibujo de solo tabla', r.sinPalo);
  ok('y queda UNO', r.sinPaloUno);
  ok('la tabla se sigue derivando', r.sinPaloRect);
  ok('y ocupa el cartel entero, no la mitad de arriba', r.sinPaloEntero);

  console.log('\ngame.carteles.desvio / .giro');
  ok('desvio [0,0,0] mete el cartel en la celda del bloque', r.desvio);
  ok('giro 5 planta el cartel girado', r.giro);
  ok('y queda UNO', r.giroUno);

  console.log('\nLa firma sobrevive a mcRestampAll');
  ok('tras re-estampar no hay carteles desfasados', r.trasRestamp);
  ok('y sigue habiendo UNO', r.trasRestampUno);

  console.log('\nDistancia de lectura');
  ok('de fábrica son 21 bloques (14 × 1,5)', r.distDef === 21, r.distDef);
  ok('de cerca el rótulo se pinta', r.cerca > 0, r.cerca);
  ok('pasada la distancia se apaga', r.lejos === 0, r.lejos);
  ok('en una pantalla-menú no se apaga', r.menuLejos > 0, r.menuLejos);
  ok('…ni de mucho más lejos', r.menuMuyLejos > 0, r.menuMuyLejos);

  console.log('\nNada de esto se persiste');
  ok('la nota sí está en el documento', r.notaEnDoc);
  ok('el cartel no', r.cartelFueraDelDoc);
  ok('y el mundo queda como estaba', r.limpio && r.notasIgual);

  ok('sin errores de página', errores.length === 0, errores.join(' | '));
  console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'TODO OK'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
