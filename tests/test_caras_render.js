// @area: caras
// @necesita: servidor, playwright
// El EDITOR tiene que enseñar la mascara de state.caras, y de dos maneras distintas.
//
// Por defecto la cara MARCADA se pinta EN ROJO: el rojo senala lo que se QUEDA, no lo que se va. Es
// la unica direccion que se lee bien, porque el interruptor de la barra («ocultas») deja en pie
// exactamente las rojas — esa es la vista de verdad, la del Mundo. Al reves el dibujo contestaba a la
// pregunta contraria y marcar una cara parecia desmarcar las otras cinco.
//
// Lo delicado es que hay TRES sitios que deciden si una cara se pinta, no uno: faceVis3d, faceVisIso
// y una copia inlineada dentro de renderEdit3dScene. La copia inlineada es la que corre en los
// modelos PEQUENOS (por debajo de BIG3D=15000 voxels), o sea en casi todos los assets del proyecto:
// parchear solo las dos funciones dejaria un bug invisible en los tests y visible en el editor.
// Por eso aqui se cuentan PINTADAS DE VERDAD (paintFace3d / paintCaraMarcada / scanQuad), no valores
// devueltos.
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
  await p.waitForFunction('typeof state !== "undefined" && typeof renderEdit3dScene === "function"', { timeout: 60000 });

  // Instrumento: cuenta cuantas caras se pintan de verdad en un frame, por cualquiera de las dos
  // ramas, separando las que salen con SU color de las que salen marcadas en rojo. En la rama raster
  // no hay dos funciones distintas, asi que la marca se reconoce por el color (4º argumento de
  // scanQuad), que es exactamente lo que rasterCaraCol le pasa.
  await p.evaluate(() => {
    window.__cuenta = { path: 0, roja: 0, raster: 0, rasterRoja: 0 };
    const pf = window.paintFace3d, pc = window.paintCaraMarcada, sq = window.scanQuad;
    const ROJAS = new Set(CUBE_FACES.map(f => col32(CARA_APAGADA, f.s)));
    window.paintFace3d = function (...a) { window.__cuenta.path++; return pf.apply(this, a); };
    window.paintCaraMarcada = function (...a) { window.__cuenta.roja++; return pc.apply(this, a); };
    window.scanQuad = function (...a) {
      window.__cuenta.raster++;
      if (ROJAS.has(a[3])) window.__cuenta.rasterRoja++;
      return sq.apply(this, a);
    };
    // `fondo` = pixeles que se quedaron sin pintar. Es lo unico que distingue «esta cara no hacia
    // falta» de «se abrio un agujero al vacio», que es el fallo que se ve mirando la pieza de frente.
    window.__pintar = () => {
      window.__cuenta = { path: 0, roja: 0, raster: 0, rasterRoja: 0 };
      const cv = document.createElement('canvas'); cv.width = 400; cv.height = 400;
      const ctx = cv.getContext('2d');
      renderEdit3dScene(ctx, 400, 400, view3d);
      const d = ctx.getImageData(0, 0, 400, 400).data;
      let fondo = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === 0x0e && d[i + 1] === 0x11 && d[i + 2] === 0x19) fondo++;
      return { ...window.__cuenta, fondo };
    };
    // Proyeccion actual: dice que caras MIRAN a la camara (g.front), que son las unicas candidatas.
    window.__front = () => {
      const cv = document.createElement('canvas'); cv.width = 400; cv.height = 400;
      return project3d(400, 400, view3d).front.map(x => !!x);
    };
  });

  // ── §1 rama PATH (modelo pequeno: la copia inlineada) ────────────────────────
  console.log('\n§1 modelo pequeno (rama PATH, la que inlinea la visibilidad)');
  const r1 = await p.evaluate(() => {
    load(new Map(), { name: 'zz-caras', type: 'objeto' });           // lienzo vacio, 16³
    setSize(16, 16, 16);
    edit(() => setVoxel(8, 8, 8, '#ff0000'));                        // un voxel suelto: 6 caras, ninguna tapada
    // El testigo existe por la regla del OBJETO: marcar es cosa del dibujo entero, asi que para que
    // el voxel del centro «no tenga marcas» hace falta que las tenga OTRO. Con un solo voxel el caso
    // no se puede ni escribir: quitarle su ultima marca vacia el Map y el dibujo vuelve a ser normal
    // (que es justo lo que se quiere cuando no hay nada marcado).
    edit(() => setVoxel(2, 2, 2, '#00ff00'));                        // testigo, lejos y sin tapar nada
    const front = window.__front(), visibles = front.filter(Boolean).length;
    setCarasMarcar(false);                                            // primero, la vista de verdad
    const base = window.__pintar();

    state.caras = new Map();
    setCaraMask(2, 2, 2, 1 << front.indexOf(true));                    // la UNICA marca del dibujo
    const ninguna = window.__pintar();                                // el del centro, sin marcas, no pinta

    // Solo una cara encendida, y que sea de las que miran a la camara.
    const fi = front.indexOf(true);
    setCaraMask(8, 8, 8, 1 << fi);
    const una = window.__pintar();

    // El interruptor manda TAMBIEN con la herramienta «Caras» puesta: en «ocultas» no se pinta nada,
    // que es justo cuando hace falta ver como quedara en el Mundo. Lo que salva de que apagar una cara
    // sea irreversible no es dibujarla, sino que el picking la sigue encontrando: se comprueba abajo.
    setCaraMask(8, 8, 8, 0);
    const toolAntes = state.tool; state.tool = 'caras';
    const conHerramienta = window.__pintar();
    // Clic justo en el centro de la pieza, que es donde cae la cara apagada que mira a la camara.
    const g = project3d(edit3d.width, edit3d.height, view3d);
    const clic = pickFace3d(edit3d.width / 2, edit3d.height / 2, g);
    state.tool = toolAntes;
    const clicSinHerramienta = pickFace3d(edit3d.width / 2, edit3d.height / 2, g);

    // Y ahora lo de siempre: las MARCADAS en rojo, que es como se arranca.
    setCarasMarcar(true);
    const marcadas = window.__pintar();
    setCaraMask(8, 8, 8, 1 << fi);
    const marcadasUna = window.__pintar();
    return { visibles, base, ninguna, una, conHerramienta, marcadas, marcadasUna,
             clic: !!clic, clicSinHerramienta: !!clicSinHerramienta };
  });
  ok('sin mascara se pintan las caras que miran a la camara', r1.base.path === 2 * r1.visibles && r1.base.raster === 0,
    'pintadas=' + r1.base.path + ' front=' + r1.visibles + ' (dos voxels)');
  // Ésta es LA prueba de la regla del objeto: la marca esta en el testigo y quien desaparece es el
  // OTRO voxel, el que no la tiene. Queda en pie una sola cara en todo el dibujo, la marcada.
  ok('ocultas + una marca en OTRO voxel = el que no tiene marcas desaparece',
    r1.ninguna.path === 1 && r1.ninguna.roja === 0,
    'pintadas=' + r1.ninguna.path + ' rojas=' + r1.ninguna.roja);
  ok('ocultas + una cara marcada en cada uno = dos pintadas', r1.una.path === 2 && r1.una.roja === 0,
    'pintadas=' + r1.una.path + ' rojas=' + r1.una.roja);
  // En cuanto un voxel tiene mascara deja de ser un cubo cerrado y se dibuja A DOS CARAS: las seis,
  // no solo las tres que miran la camara. Por eso se cuentan 6 y no `visibles` — es la misma regla
  // que hace que, al ocultar el rojo, se vea el enves de las caras que siguen encendidas.
  ok('el interruptor manda tambien con la herramienta «Caras»: en ocultas no se pinta lo no marcado',
    r1.conHerramienta.roja === 0 && r1.conHerramienta.path === 1,
    'rojas=' + r1.conHerramienta.roja + ' con su color=' + r1.conHerramienta.path);
  ok('pero la cara apagada se sigue pudiendo clicar (apagarla no es irreversible)', r1.clic);
  ok('y solo con esa herramienta: el pincel no pesca caras que no se ven', !r1.clicSinHerramienta);
  // Sin ninguna cara marcada no hay nada que resaltar: se siguen dibujando las seis (no desaparece
  // nada, para eso esta «ocultas») pero ni una va en rojo, porque ni una sobrevivira.
  // En «marcadas» el dibujo vuelve a ser macizo: el culling de caras traseras es el de siempre, asi
  // que cada voxel suelto pinta las `front` que miran a la camara y ni una mas. Lo unico que cambia
  // es el COLOR de las marcadas — aqui solo la del testigo.
  ok('marcadas: el voxel sin marcas se pinta entero y con su color',
    r1.marcadas.roja === 1 && r1.marcadas.path === 2 * r1.visibles - 1,
    'rojas=' + r1.marcadas.roja + ' con su color=' + r1.marcadas.path + ' front=' + r1.visibles);
  // Y esta es la asercion que fija el sentido del color: se marca UNA cara y es ESA la que se pone
  // roja. Al reves —cinco rojas y la marcada con su color— era justo lo que el dueno reporto como
  // «le doy a ocultas y me quita las que queria ver».
  ok('marcadas: la marcada va en rojo y las demas con su color',
    r1.marcadasUna.roja === 2 && r1.marcadasUna.path === 2 * r1.visibles - 2,
    'rojas=' + r1.marcadasUna.roja + ' con su color=' + r1.marcadasUna.path);

  // ── §2 rama RASTER (modelo grande: faceVis3d) ────────────────────────────────
  console.log('\n§2 modelo grande (rama raster, la que va por faceVis3d)');
  const r2 = await p.evaluate(() => {
    load(new Map(), { name: 'zz-caras-grande', type: 'objeto' });
    setSize(32, 32, 32);
    const m = new Map();
    for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) m.set(x + ',' + y + ',' + z, '#3388ff');
    state.voxels = m; voxRev++;                                      // 32768 > BIG3D=15000 => rasterizador
    setCarasMarcar(false);
    const base = window.__pintar();
    // Un voxel en MITAD de la cara de arriba, con todo apagado. En mitad y no en una esquina a
    // proposito: asi esta rodeado por los cuatro costados y lo unico que puede pasar al apagarlo es
    // que asome el de debajo. Si en vez de eso se ve el fondo, es que se ha abierto un agujero.
    const front = window.__front();
    // Regla del objeto: lo que no este marcado no se dibuja, asi que para abrir UN agujero en un
    // macizo hay que marcarlo entero (63 = las seis) y quitarle a ese voxel la cara de arriba. Si se
    // marcara solo ese voxel, lo que desapareceria serian los otros 32767.
    state.caras = new Map();
    for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) setCaraMask(x, y, z, 63);
    setCaraMask(16, 16, 31, 63 ^ 1);
    const apagado = window.__pintar();
    setCarasMarcar(true);
    const marcado = window.__pintar();
    return { base, apagado, marcado, front: front.filter(Boolean).length };
  });
  ok('el modelo grande usa el rasterizador, no el path', r2.base.raster > 0 && r2.base.path === 0,
    'raster=' + r2.base.raster + ' path=' + r2.base.path);
  // Apagarle las caras a un voxel METIDO en un macizo no puede abrir un agujero al vacio: detras hay
  // mas voxels, y sus caras —que antes se cullaban contra el— pasan a dibujarse. Se ve un hueco de un
  // voxel de hondo, no el fondo. Por eso aqui se mira el FONDO y no la cuenta de caras.
  ok('ocultas: apagar un voxel de la cascara no abre un agujero al vacio',
    r2.apagado.fondo === r2.base.fondo,
    'fondo antes=' + r2.base.fondo + ' despues=' + r2.apagado.fondo);
  // Lo que queda es un hueco de un voxel de hondo: se pierde la cara de arriba del voxel apagado y
  // asoman las paredes del hueco que miran a la camara (una por cada direccion de `front`).
  ok('asoman las paredes del hueco: una cara menos, `front` mas',
    r2.apagado.raster - r2.base.raster === r2.front - 1,
    'antes=' + r2.base.raster + ' despues=' + r2.apagado.raster + ' front=' + r2.front);
  // Con el interruptor en «marcadas» la cara sin marcar SE SIGUE PINTANDO, o sea que la pieza vuelve a ser
  // maciza: el culling de siempre vale tal cual y se dibuja exactamente lo mismo que sin mascara. La
  // mascara solo cambia el COLOR de un cuadro. Se compara contra `base`, no contra `ocultas`: en ocultas
  // el hueco destapa las paredes de detras, asi que las dos cuentas tienen por que ser distintas.
  ok('marcadas: se dibuja lo mismo que sin mascara (el macizo vuelve a ser macizo)',
    r2.marcado.raster === r2.base.raster,
    'raster=' + r2.marcado.raster + ' sin mascara=' + r2.base.raster + ' rojas=' + r2.marcado.rasterRoja);
  // Aqui esta marcado TODO, asi que va en rojo todo lo que se dibuja menos una cara: justo la que se
  // le quito al voxel de en medio, que es la unica que no sobrevivira al pulsar «ocultas».
  ok('marcadas: la unica cara SIN marcar es la unica que conserva su color',
    r2.marcado.rasterRoja === r2.base.raster - 1,
    'rojas=' + r2.marcado.rasterRoja + ' de ' + r2.base.raster);
  ok('sin mascara el rasterizador no pinta ni una roja', r2.base.rasterRoja === 0,
    'rojas=' + r2.base.rasterRoja);

  // ── §3 compatibilidad: sin mascara, ni un pixel de diferencia ────────────────
  console.log('\n§3 un dibujo sin mascara se pinta EXACTAMENTE igual que antes');
  const r3 = await p.evaluate(() => {
    load(new Map(), { name: 'zz-caras-compat', type: 'objeto' });
    setSize(16, 16, 16);
    edit(() => { for (let x = 4; x < 12; x++) for (let y = 4; y < 12; y++) for (let z = 4; z < 8; z++) setVoxel(x, y, z, '#88cc44'); });
    const png = () => {
      const cv = document.createElement('canvas'); cv.width = 300; cv.height = 300;
      renderEdit3dScene(cv.getContext('2d'), 300, 300, view3d);
      return cv.toDataURL();
    };
    const sinCaras = png();
    // Poner y quitar una mascara tiene que devolver el dibujo al mismo pixel. Lo que lo devuelve es
    // QUITAR la marca (0), no poner las seis: con la regla del objeto el 63 es una marca como otra
    // cualquiera y deja el dibujo «con marcas», o sea con su cara roja en la vista de marcadas.
    setCaraMask(5, 5, 7, 1); const conCaras = png();
    setCaraMask(5, 5, 7, 0); const vuelta = png();
    return { cambia: sinCaras !== conCaras, vuelve: sinCaras === vuelta, vacio: state.caras.size === 0 };
  });
  ok('marcar una cara cambia la imagen (si no, el test no probaria nada)', r3.cambia);
  ok('quitarle la marca devuelve el pixel exacto de antes', r3.vuelve);
  ok('el 0 no se queda guardado (sin marcas, Map vacio)', r3.vacio);

  // ── §4 la vista de Capas (2D) tambien lo dice ────────────────────────────────
  // Era la unica vista que no se enteraba de la mascara: dibujaba la pieza «llena» y para saber que
  // caras le faltaban habia que pasarse a 3D.
  console.log('\n§4 en Capas (2D) las caras apagadas se marcan');
  const r4 = await p.evaluate(() => {
    load(new Map(), { name: 'zz-caras-2d', type: 'objeto' });
    setSize(16, 16, 16);
    edit(() => { for (let x = 4; x < 12; x++) for (let y = 4; y < 12; y++) setVoxel(x, y, 8, '#88cc44'); });
    state.layer = 8; setMode('capas');
    // Se cuentan las celdas que de verdad dibujan algo: la funcion se llama por cada voxel de la capa
    // y sale sin pintar en las que tienen sus seis caras (que es el caso normal).
    let marcas = 0;
    const dc = window.drawCarasCell2d;
    window.drawCarasCell2d = function (...a) {
      if (caraMask(a[0], a[1], a[2])) marcas++;   // sin ninguna marca no se pinta nada
      return dc.apply(this, a);
    };
    const png = () => { marcas = 0; drawEdit(); return { img: editCv.toDataURL(), marcas }; };

    setCarasMarcar(true);
    const limpio = png();                                            // sin mascara: nada que marcar
    state.caras = new Map();
    for (let x = 4; x < 12; x++) setCaraMask(x, 6, 8, 63 ^ 1);        // una fila marcada menos su cara de arriba
    const marcado = png();
    setCarasMarcar(false);
    const oculto = png();
    setCarasMarcar(true);
    window.drawCarasCell2d = dc;
    return { limpio, marcado, oculto };
  });
  ok('sin mascara la vista de Capas no dibuja ni una marca', r4.limpio.marcas === 0, 'marcas=' + r4.limpio.marcas);
  ok('con mascara se marca una celda por voxel enmascarado', r4.marcado.marcas === 8, 'marcas=' + r4.marcado.marcas);
  ok('y la imagen cambia de verdad (no solo la cuenta)', r4.marcado.img !== r4.limpio.img);
  ok('con el interruptor en «ocultas», Capas vuelve al pixel de antes',
    r4.oculto.marcas === 0 && r4.oculto.img === r4.limpio.img);

  // ── §5 el interruptor ────────────────────────────────────────────────────────
  console.log('\n§5 el interruptor de la barra');
  const r5 = await p.evaluate(async () => {
    // render() encola un rAF, no pinta: sin esperar al frame se leeria el estado del render anterior.
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const btn = document.querySelector('#btn-caras-ver'), box = document.querySelector('#ctrl-caras');
    load(new Map(), { name: 'zz-caras-sw', type: 'objeto' });
    setSize(16, 16, 16);
    edit(() => setVoxel(8, 8, 8, '#ff0000'));
    setTool('paint'); render(); await frame();
    const sinMascara = box.hidden;
    setCaraMask(8, 8, 8, 1); render(); await frame();
    const conMascara = box.hidden, rotulo = btn.textContent;
    btn.click();
    const trasClic = { marcar: carasMarcar, rotulo: btn.textContent, guardado: localStorage.getItem('vf_caras_marcar') };
    btn.click();
    // Y por consola, con el mismo patron que game.showFPS.
    game.carasMarcadas = false;
    const porConsola = carasMarcar;
    game.carasMarcadas();                                            // invocarlo sin argumento alterna
    return { sinMascara, conMascara, rotulo, trasClic, porConsola, final: carasMarcar };
  });
  ok('sin caras apagadas el boton no esta', r5.sinMascara === true);
  ok('con caras apagadas aparece, diciendo en que estado esta', r5.conMascara === false && /Marcadas/.test(r5.rotulo),
    'rotulo=' + r5.rotulo);
  ok('pulsarlo oculta las caras y lo dice', r5.trasClic.marcar === false && /Ocultas/.test(r5.trasClic.rotulo),
    'rotulo=' + r5.trasClic.rotulo);
  ok('la eleccion se recuerda', r5.trasClic.guardado === '0', 'localStorage=' + r5.trasClic.guardado);
  ok('game.carasMarcadas = false tambien vale', r5.porConsola === false);
  ok('game.carasMarcadas() sin argumento alterna', r5.final === true);

  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));
  await b.close();
  console.log('\n' + (fallos ? fallos + ' fallos' : 'todo ok'));
  process.exit(fallos ? 1 : 0);
})();