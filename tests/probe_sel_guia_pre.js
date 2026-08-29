// @area: mundo
// @necesita: servidor, playwright
// SONDA (no guardián) del snippet `sel-guia-preseleccion`: los ✚/▬ de la guía también con la selección
// A MEDIO HACER (un solo clic, esquina fijada y caja sin confirmar).
//
// Dueño (2026-08-28): «*cuando se hace una seleccion solamente con un click ya se puede hacer shift o
// control rueda, sin esperar al segundo, pero eso no muestra los -+ y deberia*».
//
// LO QUE PRUEBA DE VERDAD (§3 y §4): la guía PREDICE sobre la caja fantasma y luego se gira la RUEDA DE
// VERDAD (evento `wheel` en el canvas, con el puntero capturado fingido), que en app.js auto-confirma la
// caja con el bloque apuntado y extruye. Se exige que lo pintado y lo que pasó sean las MISMAS celdas:
// una guía que no acierte es peor que ninguna, porque el jugador se fía de ella.
//
// ⚠️ EL RAYO SE FALSEA (`mcRaycast`) para poder apuntar a una celda concreta: en un navegador sin cabeza
// el jugador no mira a ningún sitio y la caja fantasma saldría de UNA celda, que no prueba nada. Lo usan
// los dos —el snippet y la rueda de app.js—, así que siguen mirando lo mismo, que es lo que importa.
//
//   §0 carga        · expone game.selGuiaPre y queda puesto
//   §1 el agujero   · con el parche QUITADO, un clic + Ctrl no pinta nada (si no, esto no prueba nada)
//   §2 la fantasma  · con el parche, la caja fantasma = esquina fijada … bloque apuntado
//   §3 Ctrl predice · las marcas ✚ son EXACTAMENTE lo que pone la rueda (y la caja queda confirmada)
//   §4 Shift predice· lo mismo por la cara que TE MIRA (ojo: ahí ✚ es rueda ABAJO)
//   §5 se quita     · off() devuelve las funciones del motor intactas y deja de pintar
//   §6 no apila     · cargar el snippet dos veces no encadena envolturas
//   §7 no toca nada · mirar no edita: `mc.gridGen` y el historial quedan igual
//   §8 caja hecha   · con caja confirmada la guía del motor sigue como estaba (no se le estorba)
//
// Corre en `/map/empty` con el AUTOGUARDADO APAGADO y comprueba que `empty.vox` no se toca.
//
//   node tests/probe_sel_guia_pre.js [url]
const fs = require('fs');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty?noauto=1';
const VOX = __dirname + '/../data/worlds/empty.vox';
const SNIPPET = JSON.parse(fs.readFileSync(__dirname + '/../data/snippets/sel-guia-preseleccion.json', 'utf8')).code;

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

  // ── utillería que vive en la página ─────────────────────────────────────────────────────────────
  const prep = await page.evaluate(() => {
    game.autosave(false);                      // ⛔ nada de esta sonda llega al disco
    mc.tool = 'select';

    const cx = mc.dim.x >> 1, cz = mc.dim.z >> 1;
    let suelo = -1;
    for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(cx, y, cz)]) { suelo = y; break; }
    const ids = [];
    for (let y = suelo; y > suelo - 8 && y >= 0; y--) {
      const id = mc.grid[mcIdx(cx, y, cz)];
      if (id && ids.indexOf(id) < 0) ids.push(id);
    }
    window.__S = { cx, cz, suelo, ids, aire: suelo + 12 };
    window.__base = n => [6 + (n % 6) * 14, __S.aire, 6 + ((n / 6) | 0) * 14];

    // Monta celdas relativas a `base` tras vaciar una burbuja generosa alrededor (la sección anterior
    // pudo dejar algo justo al lado y la caja fantasma se lo comería sin avisar).
    window.__monta = (base, celdas) => {
      const edits = [];
      const pon = (x, y, z, v) => {
        const b = mc.grid[mcIdx(x, y, z)];
        if (b === v) return;
        mcSetBlock(x, y, z, v);
        edits.push({ x, y, z, before: b, after: v });
      };
      for (let x = -4; x <= 8; x++) for (let y = -6; y <= 8; y++) for (let z = -4; z <= 8; z++) {
        const p = [base[0] + x, base[1] + y, base[2] + z];
        if (mcInside(p[0], p[1], p[2])) pon(p[0], p[1], p[2], 0);
      }
      for (const c of celdas) pon(base[0] + c[0], base[1] + c[1], base[2] + c[2], __S.ids[0]);
      mcRemeshEdiciones(edits);
      return edits.length;
    };

    // UN SOLO CLIC: esquina fijada y caja SIN confirmar, que es el estado del que se queja el dueño.
    window.__unClic = (esquina, apuntado) => {
      mc.selCajas = [];
      mc.selA = esquina.slice();
      mc.selSuma = false;
      mc.selOpuesta = false;
      window.__apunta(apuntado);
      return { selA: mc.selA.slice(), cajaConfirmada: !!mc.selBox };
    };

    // El rayo falseado: apuntar de verdad no se puede sin cabeza. Lo miran los DOS (snippet y rueda).
    window.__rayoOrig = window.mcRaycast;
    window.__apunta = celda => {
      window.mcRaycast = celda ? (() => ({ cell: celda.slice(), face: [0, 1, 0] })) : window.__rayoOrig;
      return celda;
    };

    window.__foto = (a, b, m) => {
      const mg = m == null ? 3 : m;
      const f = new Map();
      for (let x = Math.min(a[0], b[0]) - mg; x <= Math.max(a[0], b[0]) + mg; x++)
        for (let y = Math.min(a[1], b[1]) - mg; y <= Math.max(a[1], b[1]) + mg; y++)
          for (let z = Math.min(a[2], b[2]) - mg; z <= Math.max(a[2], b[2]) + mg; z++)
            if (mcInside(x, y, z)) f.set(x + ',' + y + ',' + z, mc.grid[mcIdx(x, y, z)]);
      return f;
    };
    window.__diff = (antes, despues) => {
      const ganados = [], perdidos = [];
      for (const [k, v] of antes) {
        const w = despues.get(k);
        if (!v && w) ganados.push(k);
        if (v && !w) perdidos.push(k);
      }
      return { ganados: ganados.sort(), perdidos: perdidos.sort() };
    };
    window.__claves = lista => lista.map(c => c.join(',')).sort();
    window.__mismo = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    window.__mira = eje => {
      mc.yaw = { '+X': -Math.PI / 2, '-X': Math.PI / 2, '-Z': 0, '+Z': Math.PI }[eje];
      return mcEjeMirada().nombre;
    };

    // La rueda DE VERDAD: el manejador exige puntero capturado, que sin cabeza no llega solo.
    Object.defineProperty(document, 'pointerLockElement', { get: () => mc.canvas, configurable: true });
    window.__rueda = (deltaY, mod) => mc.canvas.dispatchEvent(new WheelEvent('wheel',
      { deltaY, ctrlKey: mod === 'ctrl', shiftKey: mod === 'shift', bubbles: true, cancelable: true }));

    return { suelo, ids, aire: __S.aire, guiaEnMotor: typeof window.mcSelGuiaHayPieza === 'function',
             fantasmaEnMotor: typeof window.mcSelGuiaFantasma === 'function' };
  });
  console.log('preparado ·', JSON.stringify(prep));
  if (prep.suelo < 0 || !prep.ids.length) { console.log('sin terreno en /map/empty: no se puede montar'); process.exit(1); }
  comprueba('el motor trae la guía ✚/▬ que este snippet amplía', prep.guiaEnMotor);

  // Aterrizado en `app.js` el 2026-08-28: el snippet se aparta y ya no hay envoltura que sondear. Lo que
  // esta sonda probaba lo sujeta ahora el tramo I de `tests/test_extru1_seleccion.js`, contra el motor.
  if (prep.fantasmaEnMotor) {
    console.log('\nEl motor ya trae la caja fantasma de serie (mcSelGuiaFantasma): esta sonda era del\n' +
      'snippet previo al aterrizaje. La cobertura vive en tests/test_extru1_seleccion.js (tramo I).');
    await browser.close();
    console.log(fallos.length ? '\n' + fallos.length + ' FALLOS' : '\nNADA QUE SONDEAR (ya está en el motor)');
    process.exit(fallos.length ? 1 : 0);
  }

  // Escalera irregular a propósito: ninguna cara es plana, así una guía que pintase una plancha falla.
  const ESCALERA = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0]];

  console.log('\n§1 · el agujero: SIN el parche, un clic + Ctrl no enseña nada');
  const sin = await page.evaluate(ESC => {
    const base = __base(0);
    __monta(base, ESC);
    const alta = [base[0] + 2, base[1] + 2, base[2]];
    __unClic(base, alta);
    mc.selGuiaModo = 'ctrl';
    return { toca: mcSelGuiaToca(), hayPieza: mcSelGuiaHayPieza(), selBox: !!mc.selBox, selA: !!mc.selA };
  }, ESCALERA);
  comprueba('hay esquina fijada y NO hay caja confirmada', sin.selA && !sin.selBox, JSON.stringify(sin));
  comprueba('…y la guía del motor no pinta (el bug del dueño)', sin.toca === false && sin.hayPieza === false);

  console.log('\n§0 · carga del snippet, como lo carga el motor (web/app.js:4586)');
  const arranque = await page.evaluate(async code => {
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    const r = await new AsyncFunction('opts', 'args', code)({}, {});
    return { dicho: r, hayApi: !!(window.game && game.selGuiaPre), estado: game.selGuiaPre.estado() };
  }, SNIPPET);
  console.log('snippet cargado ·', JSON.stringify(arranque.dicho));
  comprueba('expone game.selGuiaPre y queda puesto', arranque.hayApi && arranque.estado.activo === true);

  console.log('\n§2 · la caja fantasma va de la esquina fijada al bloque apuntado');
  const f2 = await page.evaluate(ESC => {
    const base = __base(0);
    __monta(base, ESC);
    const alta = [base[0] + 2, base[1] + 2, base[2]];
    __unClic(base, alta);
    mc.selGuiaModo = 'ctrl';
    const e = game.selGuiaPre.estado();
    return { fantasma: e.fantasma, toca: mcSelGuiaToca(), esperada: { a: base, b: alta } };
  }, ESCALERA);
  comprueba('la fantasma es esquina…apuntado',
    !!f2.fantasma && f2.fantasma.a.join(',') === f2.esperada.a.join(',') && f2.fantasma.b.join(',') === f2.esperada.b.join(','),
    JSON.stringify(f2.fantasma));
  comprueba('…y ahora la guía SÍ pinta', f2.toca === true);

  // ── §3 y §4 · la guía predice y la RUEDA cumple ─────────────────────────────────────────────────
  const casos = [
    { id: '§3 Ctrl · crece por la CIMA', modo: 'ctrl', n: 1 },
    { id: '§4 Shift · crece por la cara que TE MIRA', modo: 'shift', n: 2 }
  ];
  for (const c of casos) {
    console.log('\n' + c.id);
    const r = await page.evaluate(caso => {
      const ESC = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0]];
      const base = __base(caso.n);
      const mirada = __mira('+X');
      __monta(base, ESC);
      const alta = [base[0] + 2, base[1] + 2, base[2]];
      __unClic(base, alta);
      mc.selGuiaModo = caso.modo;

      const pred = mcSelGuiaCalcula(caso.modo);          // lo que la guía PROMETE, sobre la fantasma
      const salida = {
        mirada, cara: pred.cara.nombre, ruedaMas: pred.cara.ruedaMas,
        mas: __claves(pred.mas), menos: __claves(pred.menos), vacia: pred.vacia
      };
      const antes = __foto(base, alta);
      // …y ahora la rueda DE VERDAD, en el sentido que suma según la propia guía.
      __rueda(pred.cara.ruedaMas === 'arriba' ? -120 : 120, caso.modo);
      const diff = __diff(antes, __foto(base, alta));
      salida.ganados = diff.ganados;
      salida.perdidos = diff.perdidos;
      salida.cajaConfirmada = !!mc.selBox;
      salida.selAVacia = !mc.selA;
      salida.iguales = __mismo(salida.mas, salida.ganados);
      return salida;
    }, c);
    console.log('   ', JSON.stringify({ cara: r.cara, ruedaMas: r.ruedaMas, mas: r.mas.length, puestos: r.ganados.length }));
    comprueba(c.id + ': la guía promete marcas', r.mas.length > 0 && !r.vacia);
    comprueba(c.id + ': la rueda pone EXACTAMENTE lo prometido', r.iguales,
      'prometido=' + r.mas.join(' ') + ' · puesto=' + r.ganados.join(' '));
    comprueba(c.id + ': no se comió nada por el camino', r.perdidos.length === 0, r.perdidos.join(' '));
    comprueba(c.id + ': la rueda auto-confirmó la caja', r.cajaConfirmada && r.selAVacia);
  }

  console.log('\n§5 · off() devuelve el motor intacto y deja de pintar');
  const q = await page.evaluate(ESC => {
    const base = __base(3);
    __monta(base, ESC);
    const alta = [base[0] + 2, base[1] + 2, base[2]];
    __unClic(base, alta);
    mc.selGuiaModo = 'ctrl';
    const antes = mcSelGuiaToca();
    game.selGuiaPre.off();
    const salida = {
      antes, despues: mcSelGuiaToca(), activoTrasOff: game.selGuiaPre.estado().activo,
      limpias: !window.mcSelGuiaHayPieza._selGuiaPre && !window.mcSelGuiaCeldas._selGuiaPre &&
        !window.mcSelGuiaFirma._selGuiaPre && !window.mcSelGuiaRepinta._selGuiaPre
    };
    game.selGuiaPre.on();
    salida.vuelve = mcSelGuiaToca();
    return salida;
  }, ESCALERA);
  comprueba('con el parche pinta y sin él no', q.antes === true && q.despues === false);
  comprueba('…las funciones del motor quedan SIN envoltura', q.limpias);
  comprueba('…y off() lo dice en su estado', q.activoTrasOff === false);
  comprueba('…y on() lo devuelve', q.vuelve === true);

  console.log('\n§6 · cargar el snippet dos veces no apila envolturas');
  const dos = await page.evaluate(async code => {
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    await new AsyncFunction('opts', 'args', code)({}, {});
    let n = 0;
    for (let f = window.mcSelGuiaCeldas; f && f._selGuiaPre; f = f._orig) n++;
    return { capas: n, toca: mcSelGuiaToca() };
  }, SNIPPET);
  comprueba('una sola capa de envoltura tras recargar', dos.capas === 1, 'capas=' + dos.capas);

  console.log('\n§7 · mirar no edita');
  const quieto = await page.evaluate(ESC => {
    const base = __base(4);
    __monta(base, ESC);
    const alta = [base[0] + 2, base[1] + 2, base[2]];
    __unClic(base, alta);
    const g0 = mc.gridGen | 0, h0 = mc.hist.length;
    for (const m of ['ctrl', 'shift']) { mc.selGuiaModo = m; mcSelGuiaRepinta(); mcSelGuiaCalcula(m); }
    mc.selGuiaModo = '';
    return { gen: (mc.gridGen | 0) === g0, hist: mc.hist.length === h0 };
  }, ESCALERA);
  comprueba('la topología no cambia (mc.gridGen)', quieto.gen);
  comprueba('el historial tampoco', quieto.hist);

  console.log('\n§8 · con caja confirmada, la guía del motor sigue como estaba');
  const hecha = await page.evaluate(ESC => {
    const base = __base(5);
    __monta(base, ESC);
    const alta = [base[0] + 2, base[1] + 2, base[2]];
    __apunta(null);                                   // sin rayo: la caja de verdad no lo necesita
    mc.selA = null;
    mc.selCajas = [{ a: base.slice(), b: alta.slice() }];
    mc.selGuiaModo = 'ctrl';
    const pred = mcSelGuiaCalcula('ctrl');
    return { toca: mcSelGuiaToca(), mas: pred.mas.length, fantasma: game.selGuiaPre.estado().fantasma };
  }, ESCALERA);
  comprueba('sigue pintando con caja hecha', hecha.toca === true && hecha.mas === 3, 'mas=' + hecha.mas);
  comprueba('…y sin fantasma de por medio', hecha.fantasma === null);

  const errores = await page.evaluate(() => (window.__errores || []).length);
  comprueba('sin errores de página', !errores);
  await browser.close();

  const mtimeDespues = fs.statSync(VOX).mtimeMs;
  comprueba('empty.vox no se ha tocado', mtimeAntes === mtimeDespues);

  console.log(fallos.length ? '\n' + fallos.length + ' FALLOS: ' + fallos.join(' · ') : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})();
