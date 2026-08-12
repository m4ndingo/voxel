// @area: caras
// @necesita: servidor, playwright
// La herramienta «Caras» del editor: clic sobre una CARA (no sobre una celda) la MARCA.
//
// Marcar es decir que se muestra, no que se quita: en cuanto un voxel tiene una marca, cualquier cara
// suya sin marcar se considera oculta. De ahi la regla que mas se prueba aqui — la primera marca de un
// voxel intacto lo deja con ESA sola cara —, porque sin ella no habria forma de decirlo: un voxel sin
// marcas se dibuja entero, asi que ir marcando sobre las seis ya visibles no cambiaria nada.
//
// El punto delicado es que ocultar una cara no puede ser irreversible: el picking va por faceVisIso,
// que es la misma funcion que decide si se pinta, asi que una cara oculta dejaria de existir tambien
// para el raton y no habria forma de recuperarla. Por eso con la herramienta puesta las ocultas
// siguen viendose (en fantasma) y siguen siendo clicables.
//
// No guarda nada: trabaja sobre el objeto en memoria y no llama a save().
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
  // ?noauto=1 = el editor a pelo: sin el snippet 'editor-autoarranque' del dueño, que puede navegar a otro mapa.
  await p.goto('http://localhost:8500/?noauto=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof state !== "undefined" && typeof setTool === "function"', { timeout: 60000 });

  // Un voxel suelto en medio de la rejilla, en modo 3D: todas sus caras estan expuestas.
  await p.evaluate(() => {
    load(new Map(), { name: 'zz-herramienta-caras', type: 'objeto' });
    setSize(16, 16, 16);
    edit(() => setVoxel(8, 8, 8, '#ff8800'));
    if (typeof setMode === 'function') setMode('3d'); else document.querySelector('[data-mode="3d"]')?.click();
  });
  await p.waitForTimeout(600);

  // ── §1 el boton existe en los DOS sitios ─────────────────────────────────────
  console.log('\n§1 la herramienta esta donde tiene que estar');
  const botones = await p.evaluate(() => ({
    panel: !!document.querySelector('#tools .tool[data-tool="caras"]'),
    flotante: !!document.querySelector('#tool-float .tool[data-tool="caras"]'),
  }));
  ok('boton en el panel izquierdo', botones.panel);
  ok('boton en la barra flotante 3D (si no, en movil no existe)', botones.flotante);

  const porTecla = await p.evaluate(() => {
    setTool('paint');
    // Sobre body, no sobre document: el manejador mira e.target.matches para no robar teclas a los <input>.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    return state.tool;
  });
  ok('la tecla A la selecciona', porTecla === 'caras', 'tool=' + porTecla);

  // El derecho sobre el BOTON devuelve las seis a todo el objeto, igual que sobre el de «Seleccion»
  // deselecciona todo. Y nunca abre el menu del navegador: si saliera, la herramienta pareceria rota.
  const derEnBoton = async (donde) => p.evaluate((d) => {
    const b = document.querySelector((d === 'panel' ? '#tools' : '#tool-float') + ' .tool[data-tool="caras"]');
    const menu = !b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    return { sinMenu: menu, quedan: state.caras.size };
  }, donde);

  await p.evaluate(() => edit(() => { setCaraMask(8, 8, 8, 1); setVoxel(9, 8, 8, '#00ff88'); setCaraMask(9, 8, 8, 4); }));
  const desdePanel = await derEnBoton('panel');
  ok('el boton del panel no abre el menu del navegador', desdePanel.sinMenu === true);
  ok('y devuelve las seis a TODO el objeto, no solo a un voxel', desdePanel.quedan === 0,
    'quedan=' + desdePanel.quedan);

  // Es un solo paso de deshacer, como el resto de lo que hace la herramienta.
  const trasUndo = await p.evaluate(() => { undo(); return { n: state.caras.size, uno: caraMask(8, 8, 8) }; });
  ok('deshacer recupera las marcas de golpe', trasUndo.n === 2 && trasUndo.uno === 1,
    'n=' + trasUndo.n + ' mascara=' + trasUndo.uno);

  const desdeFlotante = await derEnBoton('flotante');
  ok('el de la barra flotante hace lo mismo', desdeFlotante.sinMenu === true && desdeFlotante.quedan === 0,
    'quedan=' + desdeFlotante.quedan);

  await p.evaluate(() => {
    load(new Map(), { name: 'zz-herramienta-caras', type: 'objeto' }); setSize(16, 16, 16);
    edit(() => setVoxel(8, 8, 8, '#ff8800')); setTool('caras'); drawEdit3d();
  });

  // ── §2 clic sobre una cara ───────────────────────────────────────────────────
  console.log('\n§2 el botón fija la operación: izquierdo marca la cara apuntada, derecho la desmarca');
  // Se clica en el CENTRO de una cara concreta, calculado con la misma proyeccion que usa el editor.
  // Hacen falta DOS caras distintas para probar que la segunda marca SUMA en vez de sustituir.
  const centro = await p.evaluate(() => {
    setTool('caras');
    drawEdit3d();
    const g = project3d(edit3d.width, edit3d.height, view3d);
    const caras = g.front.map((x, i) => (x ? i : -1)).filter(i => i >= 0);
    const r = edit3d.getBoundingClientRect();
    const punto = fi => {
      const q = facePoly3d(g, { x: 8, y: 8, z: 8 }, fi);
      const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
      const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
      return { fi, clientX: r.left + cx / edit3d.width * r.width, clientY: r.top + cy / edit3d.height * r.height };
    };
    return { a: punto(caras[0]), b: punto(caras[1]) };
  });

  const clicEn = async (c, opts = {}) => {
    await p.evaluate(({ x, y, o }) => {
      const ev = (t, b) => edit3d.dispatchEvent(new PointerEvent(t, {
        clientX: x, clientY: y, button: b, buttons: b === 2 ? 2 : 1,
        shiftKey: !!o.shift, bubbles: true, cancelable: true, pointerId: 1,
      }));
      ev('pointerdown', o.derecho ? 2 : 0); ev('pointerup', o.derecho ? 2 : 0);
    }, { x: c.clientX, y: c.clientY, o: opts });
    await p.waitForTimeout(120);
  };
  const clic = (opts = {}) => clicEn(centro.a, opts);

  // El corazon del modelo: la PRIMERA marca de un voxel intacto es «de este quiero SOLO esta». Sin esa
  // excepcion no habria forma de decirlo, porque un voxel sin marcas se dibuja entero y marcar sobre las
  // seis ya puestas no cambiaria nada. Se lee bien porque el rojo va sobre la cara que marcas.
  await clic();
  let m = await p.evaluate(() => caraMask(8, 8, 8));
  ok('la primera marca deja el voxel con ESA sola cara', m === (1 << centro.a.fi),
    'mascara=' + m + ' cara=' + centro.a.fi);

  // Idempotente a proposito: si conmutara, un arrastre que vuelve sobre la misma cara la dejaria
  // parpadeando segun cuantas veces pase el raton por encima.
  await clic();
  m = await p.evaluate(() => caraMask(8, 8, 8));
  ok('insistir con el izquierdo la deja marcada, no la desmarca', m === (1 << centro.a.fi), 'mascara=' + m);

  // A partir de ahi la segunda SUMA: si sustituyera, no habria forma de marcar mas de una cara por voxel.
  await clicEn(centro.b);
  m = await p.evaluate(() => caraMask(8, 8, 8));
  ok('la segunda marca se suma a la primera', m === ((1 << centro.a.fi) | (1 << centro.b.fi)),
    'mascara=' + m + ' caras=' + centro.a.fi + ',' + centro.b.fi);

  // Y el derecho quita SOLO la apuntada: la otra sigue donde estaba.
  await clic({ derecho: true });
  m = await p.evaluate(() => caraMask(8, 8, 8));
  ok('el derecho desmarca justo la cara apuntada', m === (1 << centro.b.fi), 'mascara=' + m);

  // ── §3 devolver las seis ─────────────────────────────────────────────────────
  console.log('\n§3 Shift+clic devuelve las seis caras de golpe');
  await p.evaluate(() => { state.caras = new Map(); setCaraMask(8, 8, 8, 0); drawEdit3d(); });
  await clic({ shift: true });
  m = await p.evaluate(() => caraMask(8, 8, 8));
  ok('Shift+clic devuelve las seis', m === 63, 'mascara=' + m);

  await p.evaluate(() => { state.caras = new Map(); drawEdit3d(); });
  await clic({ derecho: true });
  m = await p.evaluate(() => caraMask(8, 8, 8));
  // Con la regla del objeto, desmarcar lo que no esta marcado no hace nada: un dibujo intacto no
  // tiene ni una marca, asi que el derecho no tiene de donde quitar. Para vaciarle una cara a un
  // cubo el camino es Shift+clic (las seis) y luego el derecho, que es lo que prueba la linea de
  // arriba. Lo que NO puede pasar es que el derecho deje el voxel con una sola cara.
  ok('el derecho sobre un dibujo intacto no marca nada (no hay de donde quitar)',
    m === 63 && !(await p.evaluate(() => state.caras.size)), 'mascara=' + m);

  // ── §4 el historial ──────────────────────────────────────────────────────────
  console.log('\n§4 entra en el historial');
  await p.evaluate(() => { state.caras = new Map(); drawEdit3d(); });
  await clic();
  const trasDeshacer = await p.evaluate(() => { const antes = caraMask(8, 8, 8); undo(); return { antes, ahora: caraMask(8, 8, 8) }; });
  ok('deshacer devuelve la cara', trasDeshacer.antes !== 63 && trasDeshacer.ahora === 63,
    'antes=' + trasDeshacer.antes + ' ahora=' + trasDeshacer.ahora);

  // ── §5 el arrastre pinta caras ───────────────────────────────────────────────
  // Cara a cara esto es inservible: una mata de hierba son decenas de caras. El arrastre barre.
  console.log('\n§5 arrastrar barre todas las caras que toca, y es UN solo paso de deshacer');
  const fila = await p.evaluate(() => {
    // Una fila de voxels, y el centro en pantalla de la misma cara de cada uno: el recorrido del raton.
    load(new Map(), { name: 'zz-herramienta-caras-fila', type: 'objeto' });
    setSize(16, 16, 16);
    edit(() => { for (let x = 4; x <= 11; x++) setVoxel(x, 8, 8, '#ff8800'); });
    setTool('caras'); drawEdit3d();
    const g = project3d(edit3d.width, edit3d.height, view3d);
    const fi = g.front.findIndex(x => x);
    const r = edit3d.getBoundingClientRect(), pts = [];
    for (let x = 4; x <= 11; x++) {
      const q = facePoly3d(g, { x, y: 8, z: 8 }, fi);
      const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
      const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
      pts.push({ x: r.left + cx / edit3d.width * r.width, y: r.top + cy / edit3d.height * r.height });
    }
    return { fi, pts };
  });

  const barrer = async (derecho) => p.evaluate(({ pts, der }) => {
    const b = der ? 2 : 0;
    const ev = (t, q, btn) => edit3d.dispatchEvent(new PointerEvent(t, {
      clientX: q.x, clientY: q.y, button: btn === undefined ? b : btn, buttons: der ? 2 : 1,
      bubbles: true, cancelable: true, pointerId: 1,
    }));
    ev('pointerdown', pts[0]);
    for (let i = 1; i < pts.length; i++) ev('pointermove', pts[i], -1);
    ev('pointerup', pts[pts.length - 1]);
    return state.caras.size;
  }, { pts: fila.pts, der: derecho });

  await p.evaluate(() => { state.caras = new Map(); drawEdit3d(); });
  const tocadas = await barrer(false);
  await p.waitForTimeout(120);
  ok('un arrastre con el izquierdo marca caras de varios voxels, no solo del primero', tocadas > 1,
    'voxels con mascara=' + tocadas + ' de ' + fila.pts.length);

  const unSoloPaso = await p.evaluate(() => { undo(); return state.caras.size; });
  ok('deshacer una vez borra el trazo entero (no voxel a voxel)', unSoloPaso === 0, 'quedan=' + unSoloPaso);

  // El trazo izquierdo dejo cada voxel con una sola cara marcada; el derecho quita esa misma, o sea que se
  // quedan sin ninguna. La entrada NO desaparece: mascara 0 es «este voxel no muestra nada», un estado
  // legitimo y distinto de «no lo he tocado».
  await p.evaluate(() => { redo(); drawEdit3d(); });
  await barrer(true);
  await p.waitForTimeout(120);
  const trasDerecho = await p.evaluate(() => [...state.caras.values()]);
  // Quitar la ultima marca borra la entrada, y quedarse sin ninguna es exactamente «este dibujo no
  // tiene caras marcadas»: vuelve a verse entero. Por eso lo que se comprueba es que el Map se
  // queda VACIO, no que guarde ocho ceros — un cero guardado seria un voxel invisible.
  ok('el mismo arrastre con el derecho quita las que habia marcado',
    trasDerecho.length === 0, 'mascaras=[' + trasDerecho.join(',') + ']');

  // ── §6 con un dedo ───────────────────────────────────────────────────────────
  // En un movil no hay boton derecho ni Shift: si la operacion la fijara solo el boton, una cara
  // apagada no habria forma de recuperarla salvo deshaciendo.
  console.log('\n§6 en tactil la operacion la decide el voxel por el que empiezas');
  const dedo = async () => p.evaluate(({ pts }) => {
    const ev = (t, q) => edit3d.dispatchEvent(new PointerEvent(t, {
      clientX: q.x, clientY: q.y, button: 0, buttons: 1, pointerType: 'touch',
      bubbles: true, cancelable: true, pointerId: 1,
    }));
    ev('pointerdown', pts[0]);
    for (let i = 1; i < pts.length; i++) ev('pointermove', pts[i]);
    ev('pointerup', pts[pts.length - 1]);
    return state.caras.size;
  }, { pts: fila.pts });

  // El trazo alterna segun la cara por la que empiezas: sobre una puesta desmarca, y el mismo gesto
  // repetido la devuelve. Sin esto, en el movil desmarcar seria un viaje solo de ida.
  await p.evaluate(() => { state.caras = new Map(); drawEdit3d(); });
  const dedoQuita = await dedo();
  await p.waitForTimeout(120);
  ok('empezando en una cara puesta, el dedo la desmarca', dedoQuita > 1, 'voxels con mascara=' + dedoQuita);

  await dedo();
  await p.waitForTimeout(120);
  const dedoDevuelve = await p.evaluate(() => [...state.caras.values()]);
  ok('y el mismo gesto encima la devuelve', dedoDevuelve.length === 0, 'mascaras=' + dedoDevuelve.join(','));

  // ── §7 el resaltado ──────────────────────────────────────────────────────────
  // Lo que se va a tocar es UNA cara, asi que resaltar el cubo entero obliga a adivinar cual de las tres
  // visibles se marcaria. Con la herramienta puesta se resalta la cara, y SOLO la cara.
  console.log('\n§7 el cursor resalta la cara apuntada, no el voxel entero');
  const mover = async (tool) => p.evaluate(({ t, pt }) => {
    setTool(t);
    edit3d.dispatchEvent(new PointerEvent('pointermove', {
      clientX: pt.x, clientY: pt.y, button: -1, buttons: 0, bubbles: true, cancelable: true, pointerId: 1,
    }));
    return null;
  }, { t: tool, pt: fila.pts[3] });

  // El amarillo (#ffe23a) es exclusivo del recuadro del voxel: si aparece, se esta dibujando el cubo.
  const amarillo = () => p.evaluate(() => {
    const d = edit3d.getContext('2d').getImageData(0, 0, edit3d.width, edit3d.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 130) n++;
    return n;
  });

  await p.evaluate(() => { state.caras = new Map(); drawEdit3d(); });
  await mover('caras');
  await p.waitForTimeout(150);
  const conCaras = await p.evaluate(() => ({
    cara: hoverCara3d && { fi: hoverCara3d.fi, x: hoverCara3d.x },
    voxel: hover3d,
  }));
  ok('con «Caras» se resalta una cara concreta', !!(conCaras.cara && conCaras.cara.fi >= 0),
    'cara=' + JSON.stringify(conCaras.cara));
  ok('y no el voxel entero', conCaras.voxel === null, 'hover3d=' + JSON.stringify(conCaras.voxel));
  ok('no queda ni un pixel del recuadro amarillo', (await amarillo()) === 0);

  // Y el resaltado tiene que VERSE. El rojo encendido del trazo es #ff5b4e: lo que lo distingue del
  // naranja del propio dibujo (#ff8800) es el canal AZUL, que en el naranja es 0 — sin ese filtro el test
  // pasaria solo con los voxels pintados y no probaria nada.
  const rojoVivo = () => p.evaluate(() => {
    const d = edit3d.getContext('2d').getImageData(0, 0, edit3d.width, edit3d.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 230 && d[i + 1] > 60 && d[i + 1] < 140 && d[i + 2] > 40 && d[i + 2] < 130) n++;
    }
    return n;
  });
  ok('la cara apuntada se marca en rojo encendido', (await rojoVivo()) > 0);

  await p.evaluate(() => { edit3d.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true })); });
  await p.waitForTimeout(150);
  const traslLeave = { rojo: await rojoVivo(), estado: await p.evaluate(() => hoverCara3d) };
  ok('y se apaga al salir del lienzo', traslLeave.rojo === 0 && traslLeave.estado === null,
    'rojo=' + traslLeave.rojo + ' hoverCara3d=' + JSON.stringify(traslLeave.estado));
  await mover('caras');
  await p.waitForTimeout(150);

  // Y al cambiar de herramienta el resaltado vuelve a ser el de siempre, sin quedarse el anterior pegado.
  await mover('paint');
  await p.waitForTimeout(150);
  const conPincel = await p.evaluate(() => ({ cara: hoverCara3d, voxel: !!hover3d }));
  ok('con otra herramienta vuelve el recuadro del voxel', conPincel.voxel === true);
  ok('y el resaltado de cara no se queda pegado', conPincel.cara === null,
    'hoverCara3d=' + JSON.stringify(conPincel.cara));
  ok('el recuadro amarillo si se dibuja con las demas', (await amarillo()) > 0);

  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));
  await b.close();
  console.log('\n' + (fallos ? fallos + ' fallos' : 'todo ok'));
  process.exit(fallos ? 1 : 0);
})();