// @area: materiales
// @necesita: servidor, playwright
// test_cuentagotas.js — REQ-PICK4: la herramienta «cuentagotas» (pick block).
//
// Lo que se guarda aquí es lo que costaría caro romper:
//   1. P rota Construir → Pintar → Seleccionar → Cuentagotas → Construir (el ciclo se cierra).
//   2. Pillar mete en la ranura ACTIVA la clave del bloque apuntado, con nombre de espacio y sin `@ori`.
//   3. Pillar NO toca el mundo: ni rompe, ni coloca, ni deja entrada en el historial (los DOS botones).
//   3b. Tras pillar, la mano queda en **Pintar** y el botón queda SUELTO (si no, ese mismo clic pintaría).
//   4. Si el material ya está en el cajón, se SELECCIONA esa ranura en vez de duplicarlo encima.
//   5. Funciona igual sobre una pieza fina de `mc.structures` que sobre un bloque de `mc.grid`.
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  let fallos = 0;
  const ok = (c, t, e) => { if (!c) fallos++; console.log((c ? '  ok   ' : '  FALLA ') + t + (e !== undefined ? '   · ' + e : '')); };

  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  // El mundo de pruebas no se guarda: el test planta bloques y los quita, pero un POST a medias dejaría
  // basura en `data/` si el navegador muriera antes de deshacer.
  await p.route('**/api/mundo**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && mc.grid && typeof game!=="undefined"', null, { timeout: 180000 });
  await p.waitForTimeout(2000);

  // ── 1) el ciclo de la tecla P ────────────────────────────────────────────────────────────────────
  const ciclo = await p.evaluate(() => {
    const v = []; game.playerTool = 'build';
    for (let i = 0; i < 4; i++) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true })); v.push(mc.tool); }
    return v;
  });
  ok(JSON.stringify(ciclo) === JSON.stringify(['paint', 'select', 'pick', 'build']),
    'P rota Construir → Pintar → Seleccionar → Cuentagotas → Construir', ciclo.join(' → '));

  const r = await p.evaluate(async () => {
    const out = {};
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)] || 0;
    const und = [];
    const pon = (x, y, z, id) => { und.push([x, y, z, idEn(x, y, z)]); mcSetBlock(x, y, z, id | 0); };
    const res = async (c) => { for (const k of c) { if (mc.name2id[k]) return mc.name2id[k]; try { await game.addMaterial(k); } catch (e) {} if (mc.name2id[k]) return mc.name2id[k]; } return 0; };

    // Un material que NO esté ya en la hotbar, para poder afirmar que el cuentagotas lo trajo él.
    const idFlor = await res(['asset:assets/flor-roja.vox.json', 'flor-roja']);
    const idRoca = await res(['roca', 'asset:assets/roca.vox.json']);
    if (!idFlor || !idRoca) return { err: 'sin materiales (flor-roja / roca)' };
    out.claveFlor = mc.blockKey[idFlor];

    // Hay que medir en un hueco DE VERDAD: `/map/test` tiene cosas plantadas, y la primera pasada de
    // este test pilló `demo-hojas-sin-caras` porque el rayo tropezaba antes de llegar al objetivo.
    // Se busca una columna de chunk vacía, se planta ahí al jugador y se limpia el pasillo del rayo.
    const CH = MC_CHUNK, Y = 30;
    let X = 0, Z = 0, libreOk = false;
    for (let cx = 1; cx < 5 && !libreOk; cx++) for (let cz = 1; cz < 5 && !libreOk; cz++) {
      let libre = true;
      for (let i = 0; i < CH && libre; i += 2) for (let k = 0; k < CH && libre; k += 2)
        for (let j = -1; j < 6 && libre; j++) if (idEn(cx * CH + i, Y + j, cz * CH + k)) libre = false;
      if (libre) { X = cx * CH + 8; Z = cz * CH + 12; libreOk = true; }
    }
    if (!libreOk) return { err: 'sin chunk libre en /map/test' };

    // La postura se RE-FIJA antes de cada clic: el mundo sigue corriendo entre `await`s y el jugador,
    // que aquí está en el aire, se cae. Sin esto el segundo clic apunta a otro sitio.
    const ty = Math.floor(Y + MC_EYE), tz = Z - 3;
    // Pitch hacia abajo a propósito: una flor NO llena su celda, y el cuentagotas usa el recorte fino
    // de `mcRejillaSolidAt` igual que el pico. Mirando horizontal el rayo le pasa por encima — que es
    // justo lo que debe pasar, y por eso se apunta a su geometría y no a su celda.
    // Pillar deja la herramienta en **Pintar**, así que cada clic de este test tiene que volver a armar
    // el cuentagotas — si no, el segundo clic pinta el bloque en vez de pillarlo.
    const mirar = () => { mc.pos[0] = X + 0.5; mc.pos[1] = Y; mc.pos[2] = Z + 0.5; mc.yaw = 0; mc.pitch = -0.15; game.playerTool = 'pick'; mc.heldBtn = 2; };
    mirar();
    for (let d = 0; d <= 4; d++) for (let j = -1; j <= 1; j++) pon(X, ty + j, Z - d, 0);   // pasillo del rayo, despejado
    pon(X, ty, tz, idFlor);

    // Vaciar la hotbar y dejar la ranura 3 activa, para ver que el material cae EN LA ACTIVA.
    for (let i = 0; i < mc.hotbar.length; i++) { mc.hotbar[i] = 0; mc.slotStruct[i] = null; }
    mc.hotbar[0] = idRoca; mc.sel = 2; mcBuildHotbar(); mcSelectSlot();

    // ── 2 y 3) pillar sin tocar el mundo ──────────────────────────────────────────────────────────
    const histAntes = mc.hist ? mc.hist.length : 0;
    const idAntes = idEn(X, ty, tz), nStructAntes = mc.structures.length;
    game.playerTool = 'pick';
    mirar(); mcDoAction(0);                          // botón IZQUIERDO: con 'build' esto habría roto el bloque
    await new Promise(s => setTimeout(s, 400));
    out.slotTrasIzq = mc.blockKey[mc.hotbar[2]] || mc.slotStruct[2] || null;
    out.selTrasIzq = mc.sel;
    out.toolTrasPillar = mc.tool;          // pillar deja la mano en Pintar (petición del dueño)
    out.heldLimpio = mc.heldBtn === -1;    // …y suelta el botón, o el mismo clic seguiría pintando
    out.idIntacto = idEn(X, ty, tz) === idAntes;
    out.structIntactas = mc.structures.length === nStructAntes;
    out.histIntacto = (mc.hist ? mc.hist.length : 0) === histAntes;

    // botón DERECHO: con 'build' habría colocado un bloque al lado; aquí tiene que pillar y nada más.
    const vecinoAntes = idEn(X, ty, tz + 1);
    mirar(); mcDoAction(2);
    await new Promise(s => setTimeout(s, 400));
    out.nadaColocado = idEn(X, ty, tz + 1) === vecinoAntes;
    out.histIntacto2 = (mc.hist ? mc.hist.length : 0) === histAntes;

    // ── 4) si ya está en el cajón, se selecciona esa ranura ───────────────────────────────────────
    mc.sel = 5; mcSelectSlot();
    const nOcupadasAntes = mc.hotbar.filter(x => x).length;
    mirar(); mcDoAction(0);
    await new Promise(s => setTimeout(s, 400));
    out.selReutilizada = mc.sel;
    out.ranura5Vacia = !mc.hotbar[5] && !mc.slotStruct[5];
    out.sinDuplicar = mc.hotbar.filter(x => x).length === nOcupadasAntes;

    // ── 5) lo mismo sobre una pieza de `mc.structures` (otra rama de la marcha, otra fuente de clave)
    pon(X, ty, tz, 0);                                          // fuera la flor: en su sitio va una pieza estampada
    out.clavePieza = 'asset:assets/observador.vox.json';
    await game.stamp(out.clavePieza, X, ty, tz, 0);
    await new Promise(s => setTimeout(s, 600));
    const pieza = mc.structures.find(s => s.ox === X && s.oy === ty && s.oz === tz);
    out.piezaPuesta = !!pieza;
    mc.sel = 7; mcSelectSlot();
    const nStructPrevio = mc.structures.length;
    mirar(); mcDoAction(0);
    await new Promise(s => setTimeout(s, 600));
    out.slotPieza = mc.slotStruct[7] || mc.blockKey[mc.hotbar[7]] || null;
    out.piezaSigueAhi = mc.structures.length === nStructPrevio;
    if (pieza) mcRemoveStruct(pieza, true);

    for (const [x, y, z, id] of und.slice().reverse()) mcSetBlock(x, y, z, id);
    return out;
  });

  if (r.err) { console.log('  ' + r.err); await b.close(); process.exit(1); }
  console.log('\nREQ-PICK4 · cuentagotas (pick block)\n');

  const base = k => typeof k === 'string' ? k.replace(/@\d{1,2}$/, '') : k;
  ok(r.slotTrasIzq && base(r.slotTrasIzq) === base(r.claveFlor),
    'el material apuntado cae en la ranura activa, con espacio de nombres', r.slotTrasIzq + ' vs ' + r.claveFlor);
  ok(r.slotTrasIzq && !/@\d/.test(r.slotTrasIzq), 'y sin el `@ori` pegado (el giro lo pone la mano con R)', r.slotTrasIzq);
  ok(r.selTrasIzq === 2, 'no cambia de ranura al pillar en una vacía', 'sel=' + r.selTrasIzq);
  ok(r.toolTrasPillar === 'paint', 'tras pillar, la herramienta pasa sola a Pintar', 'tool=' + r.toolTrasPillar);
  ok(r.heldLimpio, 'y suelta el botón: el mismo clic no se queda pintando ni estampa al soltar');
  ok(r.idIntacto, 'el clic IZQUIERDO no rompe el bloque');
  ok(r.structIntactas, 'ni retira estructuras');
  ok(r.histIntacto, 'ni deja entrada en el historial de deshacer');
  ok(r.nadaColocado, 'el clic DERECHO no coloca nada');
  ok(r.histIntacto2, 'y tampoco toca el historial');
  ok(r.selReutilizada === 2, 'si el material ya está en el cajón, salta a esa ranura', 'sel=' + r.selReutilizada);
  ok(r.ranura5Vacia, 'y no lo duplica encima de la ranura que estaba activa');
  ok(r.sinDuplicar, 'el número de ranuras ocupadas no crece');
  ok(r.piezaPuesta, 'se estampa una pieza de mc.structures para la segunda rama');
  ok(r.slotPieza && base(r.slotPieza) === r.clavePieza, 'también pilla el material de una pieza estampada', r.slotPieza + ' vs ' + r.clavePieza);
  ok(r.piezaSigueAhi, 'y no la retira del mundo');
  ok(errores.length === 0, 'sin excepciones en la página', errores.join(' | ') || 'ninguna');

  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
