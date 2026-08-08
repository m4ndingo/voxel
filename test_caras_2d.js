// @area: caras
// @necesita: servidor, playwright
// La herramienta «Caras» en la vista de Capas (2D).
//
// En 3D hay que apuntar a una cara de verdad, y hay caras a las que sencillamente no se llega: la de
// debajo y las que dan al fondo quedan tapadas por el propio objeto, y para alcanzarlas hay que girar
// la vista hasta encontrar el angulo. En Capas la celda enseña las seis a la vez, asi que se elige
// cualquiera sin girar nada — pero a cambio hay que repartir un cuadrado de doce pixeles entre seis
// caras, y ahi esta todo el riesgo de esto.
//
// El reparto es el inverso EXACTO del dibujo (`carasZona2d` es la unica definicion de las dos cosas):
// los cuatro bordes son las caras de los lados, el punto del centro es la de debajo y el resto de la
// celda la de arriba. Se marca donde se ve la marca, que es lo unico que se puede aprender mirando.
//
// Lo que se prueba aqui es justo eso — que pulsar dentro de la zona donde se PINTA una cara marca esa
// cara y no otra —, mas que el gesto es el mismo que en 3D y que las marcas son los mismos datos.
//
// No guarda nada: trabaja sobre el objeto en memoria y no llama a save().
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

const NOMBRE = ['+Z arriba', '-Z debajo', '+X derecha', '-X izquierda', '+Y abajo', '-Y arriba'];

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.goto('http://localhost:8500/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof state !== "undefined" && typeof setTool === "function"', { timeout: 60000 });

  // Un voxel suelto en la capa 8, en modo Capas.
  const preparar = () => p.evaluate(() => {
    load(new Map(), { name: 'zz-caras-2d', type: 'objeto' });
    setSize(16, 16, 16);
    state.layer = 8;
    edit(() => setVoxel(8, 8, 8, '#ff8800'));
    if (typeof setMode === 'function') setMode('2d'); else document.querySelector('[data-mode="2d"]')?.click();
    setTool('caras');
    drawEdit();
  });
  await preparar();
  await p.waitForTimeout(400);

  // El punto de cliente que cae en el CENTRO DE MASAS de la zona donde se pinta la cara `fi` del voxel
  // (x,y). Se calcula con las mismas funciones que dibujan, no con numeros a mano: si el reparto
  // cambiara, este test seguiria apuntando a donde se pinta y no habria que reescribirlo.
  //
  // Con una excepcion, la de arriba (fi=0): su zona es la celda entera porque lo que pinta es un tinte
  // por DEBAJO de las otras cinco, asi que su centro de masas cae dentro del punto del enves. El sitio
  // donde ese tinte se ve a solas es el sobrante — ni franja de borde ni punto central —, y ahi es
  // donde hay que pulsar. Se elige a 3/10 de la esquina: fuera de las franjas (16% del lado) y fuera
  // del punto (radio 14,4% del lado, y de la esquina al centro hay un 28%).
  const puntoDe = (x, y, fi) => p.evaluate(({ x, y, fi }) => {
    const b = viewGeom();
    const gap = Math.max(0, Math.min(1.5, b.cell * 0.06));
    const X = b.originX + x * b.cell + gap, Y = b.originY + y * b.cell + gap, L = b.cell - 2 * gap;
    let cx, cy;
    if (fi === 0) { cx = X + L * 0.3; cy = Y + L * 0.3; }
    else {
      const z = carasZona2d(fi, X, Y, L);
      cx = z.r ? z.r[0] + z.r[2] / 2 : z.c[0];
      cy = z.r ? z.r[1] + z.r[3] / 2 : z.c[1];
    }
    const r = editCv.getBoundingClientRect();
    return { clientX: r.left + cx / editCv.width * r.width, clientY: r.top + cy / editCv.height * r.height };
  }, { x, y, fi });

  const evento = async (tipo, c, opts = {}) => p.evaluate(({ t, x, y, o }) => {
    editCv.dispatchEvent(new PointerEvent(t, {
      clientX: x, clientY: y,
      button: o.derecho ? 2 : 0, buttons: t === 'pointerup' ? 0 : (o.derecho ? 2 : 1),
      shiftKey: !!o.shift, pointerType: o.tactil ? 'touch' : 'mouse',
      bubbles: true, cancelable: true, pointerId: 1,
    }));
  }, { t: tipo, x: c.clientX, y: c.clientY, o: opts });

  const clicEn = async (c, opts = {}) => {
    await evento('pointerdown', c, opts);
    await evento('pointerup', c, opts);
    await p.waitForTimeout(90);
  };
  const clicCara = async (x, y, fi, opts = {}) => clicEn(await puntoDe(x, y, fi), opts);
  const mascara = (x, y) => p.evaluate(({ x, y }) => caraMaskRaw(x, y, 8), { x, y });

  // ── §1 cada zona de la celda marca SU cara ───────────────────────────────────
  // La prueba de fondo: si dos zonas se solaparan, o si el centro no ganara al borde, aqui saldrian
  // dos caras marcadas o la que no es. Se hace una a una sobre un voxel limpio para que la mascara
  // resultante sea exactamente un bit y no haya duda de cual.
  console.log('\n§1 las seis zonas de la celda dan las seis caras');
  for (let fi = 0; fi < 6; fi++) {
    await p.evaluate(() => { state.caras = new Map(); drawEdit(); });
    await clicCara(8, 8, fi);
    const m = await mascara(8, 8);
    ok('pulsar donde se pinta ' + NOMBRE[fi] + ' marca esa cara y solo esa', m === (1 << fi),
      'mascara=' + m + ' esperada=' + (1 << fi));
  }

  // Y las marcas se acumulan: la segunda no sustituye a la primera.
  await p.evaluate(() => { state.caras = new Map(); drawEdit(); });
  await clicCara(8, 8, 2);
  await clicCara(8, 8, 3);
  let m = await mascara(8, 8);
  ok('la segunda cara se suma a la primera (un voxel con dos lados = un plano)', m === ((1 << 2) | (1 << 3)),
    'mascara=' + m);

  // ── §2 mismo gesto que en 3D ─────────────────────────────────────────────────
  console.log('\n§2 el gesto es el mismo que en la vista 3D');
  await clicCara(8, 8, 2, { derecho: true });
  m = await mascara(8, 8);
  ok('el derecho desmarca justo la zona pulsada', m === (1 << 3), 'mascara=' + m);

  await p.evaluate(() => { state.caras = new Map(); drawEdit(); });
  await clicCara(8, 8, 0, { shift: true });
  m = await mascara(8, 8);
  ok('Shift+clic devuelve las seis', m === 63, 'mascara=' + m);

  // En tactil no hay boton derecho, asi que manda el estado de la zona por la que empiezas.
  await p.evaluate(() => { state.caras = new Map(); edit(() => setCaraMask(8, 8, 8, 1 << 4)); drawEdit(); });
  await clicCara(8, 8, 4, { tactil: true });
  m = await mascara(8, 8);
  ok('con el dedo, empezar sobre una cara puesta la quita', m === 0, 'mascara=' + m);
  await clicCara(8, 8, 4, { tactil: true });
  m = await mascara(8, 8);
  ok('y el mismo gesto encima la devuelve', m === (1 << 4), 'mascara=' + m);

  // ── §3 el arrastre barre, y es UN paso de deshacer ───────────────────────────
  // Cara a cara esto es inservible: una mata de hierba son decenas de caras.
  console.log('\n§3 arrastrar barre la misma cara de todos los voxels que toca');
  await p.evaluate(() => {
    load(new Map(), { name: 'zz-caras-2d', type: 'objeto' }); setSize(16, 16, 16);
    state.layer = 8;
    edit(() => { for (let x = 4; x < 10; x++) setVoxel(x, 8, 8, '#00ff88'); });
    setTool('caras'); drawEdit();
  });
  const camino = [];
  for (let x = 4; x < 10; x++) camino.push(await puntoDe(x, 8, 0));
  await evento('pointerdown', camino[0]);
  for (const c of camino.slice(1)) await evento('pointermove', c);
  await evento('pointerup', camino[camino.length - 1]);
  await p.waitForTimeout(150);
  const barrido = await p.evaluate(() => {
    let n = 0; for (let x = 4; x < 10; x++) if (caraMaskRaw(x, 8, 8) === 1) n++;
    return n;
  });
  ok('el arrastre marca la cara de arriba de los seis, no solo del primero', barrido === 6, 'voxels=' + barrido + ' de 6');

  const trasUndo = await p.evaluate(() => { undo(); return state.caras.size; });
  ok('deshacer una vez borra el trazo entero, no voxel a voxel', trasUndo === 0, 'quedan=' + trasUndo);

  // ── §4 solo sobre voxels que existen ─────────────────────────────────────────
  console.log('\n§4 una celda vacia no tiene caras que marcar');
  const enVacio = await p.evaluate(() => state.caras.size);
  await clicCara(1, 1, 0);
  const trasVacio = await p.evaluate(() => state.caras.size);
  ok('pulsar sobre una celda vacia no crea ninguna marca', trasVacio === enVacio,
    'antes=' + enVacio + ' despues=' + trasVacio);

  // ── §5 el resalte sigue a la ZONA, no a la celda ─────────────────────────────
  // El motivo de que este manejador no pueda reutilizar el «¿ha cambiado de celda?» del resto de
  // herramientas: dentro de UNA celda el cursor pasa del borde al centro sin que `hover` se mueva, y
  // el resalte se quedaria clavado en la primera zona que tocaste.
  console.log('\n§5 el resalte se mueve dentro de la misma celda');
  await preparar();
  await p.waitForTimeout(250);
  const zonas = [];
  for (const fi of [0, 3, 1, 2]) {
    await evento('pointermove', await puntoDe(8, 8, fi));
    await p.waitForTimeout(60);
    zonas.push(await p.evaluate(() => hoverCara2d && { x: hoverCara2d.x, y: hoverCara2d.y, fi: hoverCara2d.fi }));
  }
  ok('el resalte sigue la zona sin salir de la celda',
    zonas.every((z, i) => z && z.x === 8 && z.y === 8 && z.fi === [0, 3, 1, 2][i]),
    JSON.stringify(zonas));

  // Y se apaga al salir del lienzo, o se quedaria una zona encendida a destiempo.
  await p.evaluate(() => { editCv.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true })); });
  ok('se apaga al salir del lienzo', (await p.evaluate(() => hoverCara2d)) === null);

  // Con otra herramienta no se dibuja: el resalte es de «Caras», no del lienzo.
  await p.evaluate(() => { setTool('paint'); drawEdit(); });
  ok('al cambiar de herramienta no se queda pegado', (await p.evaluate(() => hoverCara2d)) === null);

  // ── §6 son los mismos datos que la vista 3D ──────────────────────────────────
  // Si 2D y 3D escribieran en sitios distintos, todo lo de arriba pasaria igual y la herramienta
  // seguiria sin servir para nada.
  console.log('\n§6 lo marcado en Capas es lo que ve la vista 3D');
  await preparar();
  await p.waitForTimeout(250);
  await clicCara(8, 8, 1);   // la de DEBAJO, que es justo la que en 3D cuesta alcanzar
  const cruce = await p.evaluate(() => {
    setMode('3d'); drawEdit3d();
    return { mask: caraMask(8, 8, 8), pintada: caraOn(8, 8, 8, 1), otra: caraOn(8, 8, 8, 0) };
  });
  ok('la vista 3D lee la cara marcada desde Capas', cruce.mask === 2 && cruce.pintada === true,
    'mascara=' + cruce.mask);
  ok('y las no marcadas siguen sin estarlo', cruce.otra === false);

  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));

  console.log('\n' + (fallos ? fallos + ' FALLOS' : 'todo ok'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})();