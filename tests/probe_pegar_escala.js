// @area: mundo
// @necesita: servidor, playwright
// SONDA de Alt+rueda escala la pieza en vuelo de Ctrl+V (`mcPasteEscala` / `mcPasteEscGuia`).
// Nació midiendo el snippet `pegar-escala`; el dueño lo dio por bueno el 2026-08-29 y bajó a app.js
// (`herramientas/parche_app_pegar_escala.py`), así que ahora mide EL MOTOR PELADO: no se carga nada.
// Dueño (2026-08-28): «*alt+rueda … escalar x2 (rueda arriba) y dividir (rueda abajo)*» + «*alguna
// previsualizacion cuando se pulse alt … como hacen shift y control*».
//
// NO TOCA EL MUNDO: el portapapeles se rellena mano y la pieza se CONGELA con el gesto que ya existe
// (`mc.pasteCtrlHeld` + `mc.pasteCtrlFreeze`, el Ctrl del pegado), así que no hace falta ni rayo ni
// terreno ni plantar nada — y por tanto no hay nada que limpiar después.
//
// Se comprueban las cuatro cosas que pueden salir mal:
//   1. ×2 son las 8 celdas de cada cubo y ÷2 las funde ⇒ ida y vuelta tiene que devolver LA MISMA pieza
//      (mismos materiales en el mismo sitio), que es lo único que prueba que la mayoría no se inventa nada;
//   2. el AGARRE se escala con ella (si no, la pieza salta de sitio al crecer);
//   3. la rosca de herramientas NO se lleva el gesto (Alt+rueda giraba la herramienta: `mc.ruedaTool`);
//   4. con Alt pulsado se pinta la guía: caja verde = lo que dejaría rueda arriba; en rojo, rueda abajo
//      —y esa NO es sólo una caja, porque el ÷2 cae dentro de la pieza y la capa UI se dibuja CON el
//      mundo: es su sombra estampada en las seis caras. Por eso se cuenta en PIXELES (punto 5) y no en
//      voxeles puestos: la version con caja a secas plantaba los voxeles y no se veia nada.
//
// ⚠️ El navegador de pruebas no engancha el pointer lock (hace falta gesto de usuario de verdad), y el
// manejador exige `document.pointerLockElement === mc.canvas` igual que el del motor. Se finge SOLO
// aquí, para poder mandar la rueda.
//
//   node tests/probe_pegar_escala.js [url]
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active && typeof game!=="undefined"', null, { timeout: 180000 });
  await page.waitForTimeout(3000);

  const enElMotor = await page.evaluate(() => typeof mcPasteEscala === 'function');
  console.log('   en el motor: ' + enElMotor + (enElMotor ? '' : '  ⇐ falta parche_app_pegar_escala.py'));

  const r = await page.evaluate(() => {
    const out = {};
    Object.defineProperty(document, 'pointerLockElement', { get: () => mc.canvas, configurable: true });

    // ── pieza de prueba: dos celdas en fila, cada una de un material ──────────────────────────────
    const k1 = mc.blockKey[1], k2 = mc.blockKey[2] || mc.blockKey[1];
    clipboard = { cells: [{ dx: 0, dy: 0, dz: 0, c: 'tex:' + k1 },
                          { dx: 1, dy: 0, dz: 0, c: 'tex:' + k2 }], gx: 0, gy: 0, ancla: [0, 0, 0] };
    mcPasteWorld();
    mc.pasteAnchor = [1, 0, 0];                 // agarre en la 2ª celda: tiene que viajar con la escala
    // Congelar la pieza donde el Ctrl del pegado la dejaría: sin esto haría falta un rayo que acierte.
    const CEL = [mc.pos[0] | 0, (mc.pos[1] | 0) + 2, mc.pos[2] | 0];
    mc.pasteCtrlHeld = true; mc.pasteCtrlFreeze = CEL.slice();
    mc._selGuiaVuelo = null;
    const foto = () => {
      const d = mcClipboardDims();
      return { n: clipboard.cells.length, dims: [d.w, d.h, d.d], ancla: (mc.pasteAnchor || []).slice(),
               celdas: clipboard.cells.map(c => c.dx + ',' + c.dz + ',' + c.dy + '=' + c.c).sort() };
    };
    out.antes = foto();

    // ── 3. la rueda de app.js no se entera ────────────────────────────────────────────────────────
    mc.ruedaTool = true;                        // con esto, Alt+rueda giraría la herramienta en mano
    const herrAntes = mc.tool;
    const rueda = dy => mc.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, altKey: true, bubbles: true, cancelable: true }));

    rueda(-200); out.x2 = foto();               // rueda arriba → ×2
    rueda(-200); out.x4 = foto();               // otra vez → ×4
    rueda(200);  out.div2 = foto();             // rueda abajo → ÷2
    rueda(200);  out.vuelta = foto();           // y otra → debería ser la pieza original
    out.herramientaIntacta = (mc.tool === herrAntes);
    out.idaYVuelta = JSON.stringify(out.vuelta.celdas) === JSON.stringify(out.antes.celdas) &&
                     JSON.stringify(out.vuelta.ancla) === JSON.stringify(out.antes.ancla);

    // ── 4. la previsualización de Alt ─────────────────────────────────────────────────────────────
    const caja = g => {
      const m = mc.voxUI && mc.voxUI.get(g);
      if (!m || !m.size) return null;
      let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (const k of m.keys()) {
        const p = k.split(',').map(Number);
        for (let i = 0; i < 3; i++) { if (p[i] < lo[i]) lo[i] = p[i]; if (p[i] > hi[i]) hi[i] = p[i]; }
      }
      return { n: m.size, cel: lo.map(v => Math.floor(v / 16)), lado: hi.map((v, i) => Math.round((v - lo[i] + 1) / 16)) };
    };
    mc._escAlt = false; mc._escFirma = null; mcSelGuiaRepinta();
    out.sinAlt = { verde: caja('paste-esc-mas'), roja: caja('paste-esc-menos') };
    mc._escAlt = true; mc._escFirma = null; mc._selGuiaVuelo = null; mcSelGuiaRepinta();
    out.conAlt = { verde: caja('paste-esc-mas'), roja: caja('paste-esc-menos'), pieza: foto().dims, clavada: CEL };

    out.tope = MC_PASTE_ESC_TOPE;
    return out;
  });

  // Foto: la pieza en vuelo delante de la cámara con Alt pulsado (caja verde = ×2, roja = ÷2).
  await page.evaluate(() => {
    // Hay que buscar EL AIRE: el jugador de /map/empty arranca con la cara pegada al terreno y subir a
    // ojo lo deja dentro de una loma — la foto sale de la cara interior de un bloque. Se busca el techo
    // del terreno bajo sus pies y se vuela cinco por encima.
    const px = mc.pos[0] | 0, pz = mc.pos[2] | 0;
    let suelo = 1;
    for (let y = 0; y < 64; y++) if (mcInside(px, y, pz) && mc.grid[mcIdx(px, y, pz)]) suelo = y;
    mc.volar = true; mc.pitch = -0.45; mc.reach = 24;   // alcance largo: la pieza cae LEJOS y cabe entera
    mc.pos[0] = px + 0.5; mc.pos[1] = suelo + 9; mc.pos[2] = pz + 0.5;
    // Y la pieza se deja donde la ponga EL RAYO, como en el juego: congelarla a mano acaba metiéndola
    // dentro de una loma, y una pieza enterrada no se ve (la capa UI se dibuja CON el mundo).
    mc.pasteCtrlHeld = false; mc.pasteCtrlFreeze = null;
    window.__diag = { suelo: suelo, pos: mc.pos.slice(), mira: !!mcRaycast(mcReach(), true) };
    mcPasteEscala(2); mcPasteEscala(2);       // 8×4×4: una caja de 2×1×1 no se ve en foto
    mc._escAlt = true; mc._escFirma = null; mc._selGuiaVuelo = null; mc._pasteCache = null;
  });
  await page.waitForTimeout(1200);

  // ── 5. la guía del ÷2 SE VE ───────────────────────────────────────────────────────────────────
  // No basta con que los voxeles esten puestos: la capa UI se dibuja CON el mundo, y la caja del ÷2 va
  // DENTRO de la pieza en vuelo, asi que la primera version los plantaba todos y la pantalla salia con
  // CERO pixeles rojos — el 4 de arriba en verde y la guia invisible. Se cuenta en la pantalla de
  // verdad (`readPixels`, como `test_luz_global.js`) y no en el mapa de voxeles.
  const rojoEnPantalla = () => page.evaluate(() => {
    mcRender();
    const gl = mc.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let n = 0;
    for (let i = 0; i < buf.length; i += 4)
      if (buf[i] > 110 && buf[i + 1] < 80 && buf[i + 2] < 80 && buf[i] - buf[i + 1] > 60) n++;
    return n;
  });
  const rojo = await rojoEnPantalla();
  const rojoSinAlt = await page.evaluate(async () => {
    mc._escAlt = false; mc._escFirma = null; mcSelGuiaRepinta(); mcRender();
    const gl = mc.gl, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let n = 0;
    for (let i = 0; i < buf.length; i += 4)
      if (buf[i] > 110 && buf[i + 1] < 80 && buf[i + 2] < 80 && buf[i] - buf[i + 1] > 60) n++;
    return n;
  });
  await page.evaluate(() => { mc._escAlt = true; mc._escFirma = null; mcSelGuiaRepinta(); });
  await page.waitForTimeout(400);
  r.rojoVisible = rojo;
  r.rojoSinAlt = rojoSinAlt;
  console.log('   pixeles rojos en pantalla: con Alt ' + rojo + ' · sin Alt ' + rojoSinAlt);

  console.log('   diag: ' + JSON.stringify(await page.evaluate(() => window.__diag)));
  await page.screenshot({ path: '/tmp/pegar_escala.png' });
  console.log('   foto: /tmp/pegar_escala.png');

  // Al SOLTAR Alt la promesa se borra sola: la firma pasa a '' y el repinta limpia los dos grupos. Es
  // lo que antes probaba la desinstalación del snippet — en el motor no hay nada que desinstalar, pero
  // dejarse la caja pintada al soltar la tecla sería el mismo fallo.
  r.trasAlt = await page.evaluate(() => {
    mc._escAlt = false; mc._selGuiaVuelo = null; mcSelGuiaRepinta();
    const n = g => { const m = mc.voxUI && mc.voxUI.get(g); return (m && m.size) ? m.size : 0; };
    const t = { verde: n('paste-esc-mas'), roja: n('paste-esc-menos') };
    mcPasteCancel();
    return t;
  });

  console.log('   ' + JSON.stringify(r, null, 1).replace(/\n/g, '\n   '));
  const bien = r.herramientaIntacta && r.idaYVuelta &&
               r.x2.n === r.antes.n * 8 && !r.sinAlt.verde && r.conAlt.verde && r.conAlt.roja &&
               r.rojoVisible > 500 && r.rojoSinAlt === 0 &&
               enElMotor && !r.trasAlt.verde && !r.trasAlt.roja;
  console.log('\n   ' + (bien ? 'OK' : 'MAL') + ' · ×2/÷2, agarre, la rosca no se lo lleva, guía de Alt (visible) y se borra al soltar');
  await browser.close();
  process.exit(bien ? 0 : 1);
})();
