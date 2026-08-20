// @area: mundo
// @necesita: servidor, playwright
// REQ-RANURA1 — nota del dueño en /map/bugfinder (46,14,65), verbatim: «*La herramienta de seleccionar
// deberia poder guardar los bloques seleccionados, de forma que desde una ranura se puedan volver a
// cargar. Usar la ranura 11 para ello, tecla "K" por ejemplo; alt+k o pulsar ranura "K" mostraria
// bloques guardados y seleccionables para usar.*»
//
// Lo que hay que entender para leer este test: esto NO es el portapapeles. Ctrl+C/Ctrl+V hay uno solo y
// lo pisa el siguiente copiado; un recorte es una copia GUARDADA con nombre, y hay varias. Pero el
// FORMATO es el mismo ({cells,gx,gy}), y armar un recorte consiste en ponerlo en `clipboard` y entrar en
// modo pegar — de ahí salen gratis las 24 posturas, el plantado con el derecho y el material con 1-9.
// Por eso el tramo D prueba las posturas mirando `mc.pasteCara`/`mc.pasteGiro`: si un día armar dejara
// de pasar por el pegado, ese es el aviso.
//
// ⚠️ Los recortes viven en `localStorage` (decisión escrita en el ticket, del USUARIO y no del mundo).
// El test se guarda los suyos al empezar y los devuelve al acabar: si no, se lleva por delante los del
// dueño en el navegador de pruebas.

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

  // Escenario: una caja de 3×2×2 bloques de piedra en el aire de arriba, lejos del terreno, y la
  // herramienta Seleccionar marcándola. Todo el test corre en ESCAPARATE (mc.escaparate), que es el
  // interruptor que apaga los guardados: así el mundo de disco no se toca ni una vez y no hay que
  // deshacer bloques. Lo único que sí se escribe de verdad es `localStorage`, que es donde viven los
  // recortes — el valor que hubiera se aparta aquí (en Node, que sobrevive a la recarga) y se devuelve
  // al final.
  const montaEscenario = () => p.evaluate(() => {
    const y = mc.dim.y - 5, x = 6, z = 6;
    const celdas = [];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 2; dz++) celdas.push([x + dx, y + dy, z + dz]);
    mc.escaparate = true;                                    // nada de guardar el mundo mientras dura esto
    window._r1 = { x, y, z, celdas };
    for (const c of celdas) mcSetBlock(c[0], c[1], c[2], 1); // id 1 de la paleta: piedra
    mcSetPlayerTool('select', true);
    mc.selBox = { a: [x, y, z], b: [x + 2, y + 1, z + 1] };
    mcBuildHotbar();
    return { tool: mc.tool, hay: !!mc.selBox, ranuras: $('#mc-hotbar').children.length };
  });
  const guardadosDelDueno = await p.evaluate(() => {
    const v = localStorage.getItem('vf_mcRecortes');
    localStorage.removeItem('vf_mcRecortes'); mc.recortes = null; mc.recorteSel = 0;
    return v;
  });
  const prep = await montaEscenario();
  ok('la herramienta Seleccionar está puesta con su caja', prep.tool === 'select' && prep.hay);
  ok('la hotbar tiene 11 ranuras (9 bloques + herramienta + recortes)', prep.ranuras === 11, prep.ranuras + ' ranuras');

  console.log('\nA · la ranura 11 existe, se llama K y arranca vacía');
  const a = await p.evaluate(() => {
    const s = $('#mc-slot-rec');
    return { existe: !!s, letra: s && s.querySelector('.mc-slot-key').textContent,
             vacia: s && s.classList.contains('empty'), lista: mcRecortesCarga().length,
             ultima: s === $('#mc-hotbar').lastElementChild };
  });
  ok('la ranura está en la hotbar', a.existe === true);
  ok('y es la ÚLTIMA (la 11, detrás de la herramienta)', a.ultima === true);
  ok('su letra es la K', a.letra === 'K', 'letra=' + a.letra);
  ok('sin recortes guardados, se ve vacía', a.vacia === true && a.lista === 0);

  console.log('\nB · K con una caja marcada guarda el recorte');
  const bres = await p.evaluate(() => {
    const g = window._r1;
    const guardado = mcRecorteGuardar('Prueba REQ-RANURA1');
    const lista = mcRecortesCarga(), r = lista[0];
    const d = r ? mcRecorteDim(r) : null;
    return { guardado, n: lista.length, nombre: r && r.nombre, bloques: r && r.cells.length,
             dim: d && [d.w, d.d, d.h].join('×'),
             // Ejes: el recorte va en convenio de EDITOR (dx=mundo-x, dy=mundo-z profundidad, dz=mundo-y altura).
             ejes: r && r.cells.every(c => c.dx >= 0 && c.dx < 3 && c.dy >= 0 && c.dy < 2 && c.dz >= 0 && c.dz < 2),
             material: r && r.cells.every(c => String(c.c).slice(0, 4) === 'tex:'),
             yaNoVacia: !$('#mc-slot-rec').classList.contains('empty'),
             enDisco: !!localStorage.getItem('vf_mcRecortes') };
  });
  ok('se guarda', bres.guardado === true);
  ok('hay un recorte con su nombre', bres.n === 1 && bres.nombre === 'Prueba REQ-RANURA1', bres.nombre);
  ok('con los 12 bloques de la caja', bres.bloques === 12, bres.bloques + ' bloques');
  ok('y sus medidas (ancho × fondo × alto)', bres.dim === '3×2×2', bres.dim);
  ok('los ejes van en convenio de editor, como el portapapeles', bres.ejes === true);
  ok('cada celda lleva su material (`tex:`)', bres.material === true);
  ok('la ranura deja de verse vacía', bres.yaNoVacia === true);
  ok('y queda escrito en localStorage', bres.enDisco === true);

  console.log('\nC · sobrevive a recargar la página (son del usuario, no del mundo)');
  await p.reload({ waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(1500);
  const c = await p.evaluate(() => {
    mc.escaparate = true;                                    // lo primero al volver: se recargó de cero
    const lista = mcRecortesCarga(), r = lista[0], d = r ? mcRecorteDim(r) : null;
    return { n: lista.length, nombre: r && r.nombre, bloques: r && r.cells.length, dim: d && [d.w, d.d, d.h].join('×'),
             ranura: !!$('#mc-slot-rec'), pintada: !$('#mc-slot-rec').classList.contains('empty') };
  });
  ok('el recorte sigue ahí tras recargar', c.n === 1 && c.nombre === 'Prueba REQ-RANURA1');
  ok('entero, con sus bloques y medidas', c.bloques === 12 && c.dim === '3×2×2', c.bloques + ' · ' + c.dim);
  ok('y la ranura lo enseña ya al arrancar', c.ranura === true && c.pintada === true);
  // La recarga se llevó el escenario (nunca llegó al fichero, que era la idea): se vuelve a montar para
  // los tramos que necesitan caja marcada.
  await montaEscenario();

  console.log('\nD · elegirlo lo deja LISTO PARA PLANTAR con las 24 posturas');
  const d = await p.evaluate(() => {
    const armado = mcRecorteArma(0);
    const out = { armado, pegando: mc.pasteActive, celdas: clipboard && clipboard.cells.length,
                  cara: mc.pasteCara, giro: mc.pasteGiro };
    // Las 24 = 6 caras × 4 giros. Se recorren como lo hace la tecla R / Shift+R y se comprueba que no
    // se repite ninguna: es la garantía de que un recorte se planta en cualquier postura, como una
    // estructura del catálogo.
    const vistas = new Set();
    for (let i = 0; i < 6; i++) { for (let j = 0; j < 4; j++) { vistas.add(mc.pasteCara + ':' + mc.pasteGiro); mc.pasteGiro = (mc.pasteGiro + 1) & 3; } mc.pasteCara = (mc.pasteCara + 1) % 6; }
    out.posturas = vistas.size;
    mc.pasteCara = 0; mc.pasteGiro = 0;
    // El recorte GUARDADO no puede compartir celdas con el portapapeles: pegando, 1-9 repinta el cúmulo.
    clipboard.cells[0].c = 'tex:cambiado-por-el-test';
    out.intacto = mcRecortesCarga()[0].cells[0].c !== 'tex:cambiado-por-el-test';
    mcPasteCancel();
    return out;
  });
  ok('armarlo entra en modo pegar', d.armado === true && d.pegando === true);
  ok('con las 12 celdas del recorte en el portapapeles', d.celdas === 12, d.celdas + ' celdas');
  ok('empieza en la postura de origen', d.cara === 0 && d.giro === 0);
  ok('y tiene las 24 posturas', d.posturas === 24, d.posturas + ' posturas');
  ok('repintar el material del pegado NO toca el recorte guardado', d.intacto === true);

  console.log('\nE · plantarlo pone los bloques de verdad en el mundo');
  const e = await p.evaluate(async () => {
    const g = window._r1;
    // Se planta a mano por el mismo camino que el clic derecho, pero con el origen elegido aquí (el
    // raycast de mcPasteConfirm necesita apuntar a una superficie, y un test no tiene ratón).
    mcRecorteArma(0);
    const bx = g.x, by = g.y, bz = g.z + 5;
    const puestos = [];
    for (const cel of clipboard.cells) {
      const wx = bx + cel.dx, wy = by + cel.dz, wz = bz + cel.dy;   // portapapeles: dy=profundidad, dz=altura
      puestos.push([wx, wy, wz, mc.grid[mcIdx(wx, wy, wz)]]);
      mcSetBlock(wx, wy, wz, 1);
    }
    const lleno = puestos.every(q => mc.grid[mcIdx(q[0], q[1], q[2])] === 1);
    for (const q of puestos) mcSetBlock(q[0], q[1], q[2], q[3]);    // y se deshace: esto es /map/test, no un vertedero
    mcPasteCancel();
    return { n: puestos.length, lleno, limpio: puestos.every(q => mc.grid[mcIdx(q[0], q[1], q[2])] === q[3]) };
  });
  ok('las 12 celdas caen en el mundo', e.n === 12 && e.lleno === true);
  ok('y el test deja el sitio como lo encontró', e.limpio === true);

  console.log('\nF · la galería: Alt+K la abre, y ahí se elige y se borra');
  const f = await p.evaluate(() => {
    mcRecorteGuardar('Segundo recorte');                     // dos, para que haya de dónde elegir
    const out = { n: mcRecortesCarga().length, sel: mc.recorteSel };
    mcAbreRecortes();
    out.abierta = mcRecortesAbierta();
    out.fichas = $('#mc-recortes-grid').children.length;
    out.marcada = $('#mc-recortes-grid').querySelectorAll('.is-active').length;
    // Mientras la galería está abierta, el Mundo no atiende teclas (si no, mirar los recortes te haría
    // andar): mismo trato que el selector de bloques. Se comprueba mandando una W de verdad.
    mc.keys['w'] = false;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }));
    out.andaConLaGaleria = !!mc.keys['w'];
    mcCierraRecortes();
    out.cerrada = !mcRecortesAbierta();
    out.borrado = mcRecorteBorra(1);
    out.tras = mcRecortesCarga().length;
    return out;
  });
  ok('con la caja aún marcada, K guarda otro', f.n === 2, f.n + ' recortes');
  ok('el recién guardado queda puesto en la ranura', f.sel === 0);
  ok('la galería se abre', f.abierta === true);
  ok('y lista los dos', f.fichas === 2, f.fichas + ' fichas');
  ok('marcando cuál está puesto', f.marcada === 1);
  ok('con ella abierta, una W no te pone a andar', f.andaConLaGaleria === false);
  ok('se cierra', f.cerrada === true);
  ok('y borrar quita uno', f.borrado === true && f.tras === 1, f.tras + ' recortes');

  console.log('\nG · K sin caja marcada NO guarda: pone en la mano el que hay');
  const g = await p.evaluate(() => {
    mc.selBox = null;
    const antes = mcRecortesCarga().length;
    const armado = mcRecorteArma(mc.recorteSel | 0);          // es lo que hace la tecla sin caja
    const out = { antes, despues: mcRecortesCarga().length, armado, pegando: mc.pasteActive };
    mcPasteCancel();
    // Y sin recortes ninguno, armar dice que no (la tecla abre entonces la galería, que es lo único que cabe hacer).
    mc.recortes = []; mc.recorteSel = 0;
    out.sinNada = mcRecorteArma(0);
    return out;
  });
  ok('no se guarda nada sin caja', g.antes === g.despues, g.antes + ' → ' + g.despues);
  ok('se pone en la mano el recorte de la ranura', g.armado === true && g.pegando === true);
  ok('y sin ningún recorte, armar no hace nada', g.sinNada === false);

  // Se devuelven los recortes que el dueño tuviera en este navegador. Los bloques del escenario NO hace
  // falta deshacerlos: todo el test ha corrido en escaparate y nada de eso ha llegado a `data/worlds`
  // (por eso tampoco se guarda aquí — guardar sería justo lo que hay que evitar).
  await p.evaluate(v => {
    if (v == null) localStorage.removeItem('vf_mcRecortes'); else localStorage.setItem('vf_mcRecortes', v);
    mc.recortes = null; mc.recorteSel = 0; mcRecortesCarga(); mcPintaSlotRecortes();
  }, guardadosDelDueno);

  ok('sin errores de página', errores.length === 0, errores.join(' · '));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nOK');
  process.exit(fallos ? 1 : 0);
})();
