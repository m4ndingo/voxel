// @area: editor
// @necesita: servidor, playwright
// REQ-CART2 · El PANEL DOM de la nota (tecla N), no el cartel 3D: que se lea.
//
// El ticket eran dos quejas distintas y el test las separa igual que el arreglo:
//   · «la ventana es muy pequeña»  → ancho del diálogo y cuántas LÍNEAS enseña el textarea sin
//     desplazar. La captura del dueño enseñaba 4 líneas y media de una nota de agente larguísima;
//   · «las letras son demasiado pequeñas» → el cuerpo. Pixeloid solo es nítida en múltiplos de 9
//     (font-size/9 es su píxel de diseño), así que el escalón por debajo de 18 es 9 y no hay nada en
//     medio. Por eso game.noteFont REDONDEA en vez de aceptar cualquier número: es lo que impide
//     dejar el panel borroso sin enterarse.
//
// Y el guardián de móvil: el móvil ya estaba a 18px antes del ticket, o sea que a 390 px esto no
// puede empeorar. No toca el mundo ni las notas: solo enseña el panel y lee estilos calculados.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};
const casi = (a, b, tol) => Math.abs(a - b) <= (tol || 1);

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(1500);

  // Medir el panel abierto. Se enseña a mano (hidden=false) en vez de por mcOpenNote(): lo que se mide
  // es CSS, y así no hace falta un bloque apuntado ni se toca mc.noteCell.
  const medir = () => p.evaluate(() => {
    const dlg = document.querySelector('#mc-note');
    const ta  = document.querySelector('#mc-note-text');
    const vw  = document.querySelector('#mc-noteview');
    const abierto = dlg.hidden; if (abierto) dlg.hidden = false;
    vw.hidden = false; vw.textContent = 'nota de prueba';
    const cs = getComputedStyle(ta), cv = getComputedStyle(vw);
    const fs = parseFloat(cs.fontSize), lh = fs * 1.8;
    const r = {
      fs, fsCabecera: parseFloat(getComputedStyle(document.querySelector('.mc-note-head')).fontSize),
      fsVisor: parseFloat(cv.fontSize),
      ancho: dlg.getBoundingClientRect().width,
      anchoVisor: parseFloat(cv.maxWidth),
      altoTextarea: ta.clientHeight,
      lineas: ta.clientHeight / lh,
      vpW: innerWidth, vpH: innerHeight,
    };
    vw.hidden = true; if (abierto) dlg.hidden = true;
    return r;
  });

  // ── 1 · escritorio ────────────────────────────────────────────────────────────────────────────
  await p.setViewportSize({ width: 1280, height: 720 });
  const d = await medir();
  console.log('\nEscritorio (1280×720)');
  ok('el cuerpo es 18px, no los 9 de antes', d.fs === 18, d.fs + 'px');
  ok('…y múltiplo de 9 (o Pixeloid sale borrosa)', d.fs % 9 === 0);
  ok('la cabecera va al mismo cuerpo', d.fsCabecera === 18, d.fsCabecera + 'px');
  ok('el diálogo mide 720px', casi(d.ancho, 720, 2), Math.round(d.ancho) + 'px');
  // Lo que de verdad se pedía: la captura del ticket enseñaba 4,5 líneas.
  ok('el textarea enseña ~10 líneas sin desplazar', d.lineas >= 9.5, d.lineas.toFixed(1) + ' líneas');
  ok('y eso es más del doble que antes del ticket', d.lineas > 4.5 * 2, '4,5 → ' + d.lineas.toFixed(1));
  ok('el visor de nota también sube a 18px', d.fsVisor === 18, d.fsVisor + 'px');
  ok('…y se ensancha con el panel', casi(d.anchoVisor, 432, 2), Math.round(d.anchoVisor) + 'px');

  // ── 2 · móvil: no puede empeorar, ya estaba a 18 ───────────────────────────────────────────────
  await p.setViewportSize({ width: 390, height: 844 });
  const m = await medir();
  console.log('\nMóvil (390×844) — no puede empeorar: ya estaba a 18px');
  ok('sigue a 18px', m.fs === 18, m.fs + 'px');
  ok('el diálogo cabe en el viewport', m.ancho <= 390 && m.ancho >= 340, Math.round(m.ancho) + 'px');
  ok('sigue enseñando ~10 líneas', m.lineas >= 9.5, m.lineas.toFixed(1) + ' líneas');
  ok('y el textarea no se come la pantalla (tope 46vh)', m.altoTextarea <= 844 * 0.46 + 1,
     Math.round(m.altoTextarea) + 'px de ' + m.vpH);

  // ── 3 · el tunable, en vivo y redondeando ──────────────────────────────────────────────────────
  await p.setViewportSize({ width: 1280, height: 720 });
  const t = await p.evaluate(() => {
    const out = {};
    const dlg = document.querySelector('#mc-note');
    const cerrado = dlg.hidden; dlg.hidden = false;   // oculto mide 0 de ancho: hay que enseñarlo para medirlo
    const fs = () => parseFloat(getComputedStyle(document.querySelector('#mc-note-text')).fontSize);
    game.noteFont = 27;  out.subido = game.noteFont; out.subidoCSS = fs();
    game.noteFont = 20;  out.redondea = game.noteFont;               // 20 → 18, no 20
    game.noteFont = 100; out.tope = game.noteFont;                   // clamp arriba
    game.noteFont = 1;   out.suelo = game.noteFont;                  // clamp abajo
    out.guardado = localStorage.getItem('vf_mcNoteFont');
    game.noteWidth = 900; out.ancho = dlg.getBoundingClientRect().width;
    out.anchoGuardado = localStorage.getItem('vf_mcNoteWidth');
    game.noteFont = 18; game.noteWidth = 720;                        // dejarlo como estaba
    out.vueltaFS = fs(); out.vueltaW = dlg.getBoundingClientRect().width;
    dlg.hidden = cerrado;
    return out;
  });
  console.log('\ngame.noteFont / game.noteWidth (por consola, en vivo)');
  ok('subir el cuerpo llega al CSS sin recargar', t.subido === 27 && t.subidoCSS === 27, t.subidoCSS + 'px');
  ok('20 se redondea a 18 (nunca fuera de la rejilla de 9)', t.redondea === 18, '20 → ' + t.redondea);
  ok('con topes arriba y abajo', t.tope === 45 && t.suelo === 9, t.suelo + '…' + t.tope);
  ok('y persiste en localStorage', t.guardado !== null, 'vf_mcNoteFont=' + t.guardado);
  ok('el ancho también se mueve en vivo', casi(t.ancho, 900, 2), Math.round(t.ancho) + 'px');
  ok('…y también persiste', t.anchoGuardado !== null, 'vf_mcNoteWidth=' + t.anchoGuardado);
  ok('vuelve a los valores de serie', t.vueltaFS === 18 && casi(t.vueltaW, 720, 2));

  ok('sin errores de pagina', errores.length === 0, errores.join(' · '));
  await b.close();
  console.log(fallos ? '\n' + fallos + ' fallos' : '\ntodo ok');
  process.exit(fallos ? 1 : 0);
})();