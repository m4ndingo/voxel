// @area: render
// @necesita: servidor, playwright
// Skylight incremental (mcRelightBox) · Chromium + SwiftShader
//
// El atajo de recalcular la luz solo en una caja alrededor del bloque tocado se sostiene sobre una única
// afirmación: que da EXACTAMENTE lo mismo que barrer el mundo entero. Si no fuese verdad, el fallo no se
// vería como un error sino como sombras que se quedan pegadas donde ya no toca — lo peor de depurar. Así
// que esto no mide estilo: compara mc.light celda a celda contra mcComputeLight() tras cientos de ediciones,
// incluidas las que de verdad duelen (abrir el techo de una cueva, taparlo, el borde del mundo).
//
// No escribe nada: los POST van bloqueados y al final se comprueba que el mundo queda como estaba.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/map/agents';

let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  await p.route('**/api/mundo*', r => r.request().method() === 'GET' ? r.continue() : r.abort());
  await p.route('**/api/habitantes*', r => r.request().method() === 'GET' ? r.continue() : r.abort());

  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog', { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const salida = {};
    // ⚠️ Aquí NO vale comparar mcSerialize(): este mundo tiene agentes vivos que andan solos, así que sus
    // estructuras cambian de sitio por su cuenta y el test culparía a la sonda de algo que no ha hecho (además
    // de que mcSerialize devuelve un OBJETO: con `===` siempre daría distinto). Lo que hay que vigilar es la
    // REJILLA, que es lo único que esta sonda toca: un resumen de sus bloques dentro del mundo original.
    const resumenRejilla = () => {
      let h = 2166136261;
      for (let z = 0; z < dimOriginal.z; z++) for (let y = 0; y < dimOriginal.y; y++) for (let x = 0; x < dimOriginal.x; x++)
        h = Math.imul(h ^ (mcInside(x, y, z) ? mc.grid[mcIdx(x, y, z)] : 0), 16777619);
      return h >>> 0;
    };
    const dimOriginal = { x: mc.dim.x, y: mc.dim.y, z: mc.dim.z };
    const rejillaAntes = resumenRejilla();

    // Un mundo mediano: suficiente para que la caja NO cubra el mundo entero (si lo cubriera, el test
    // pasaría sin probar nada) y bastante pequeño para comparar la rejilla cientos de veces.
    game.resizeWorld('128x40x128');
    await new Promise(res => setTimeout(res, 600));
    const d = mc.dim, NX = d.x, NY = d.y, NZ = d.z, N = NX * NY * NZ;
    salida.dim = NX + '×' + NY + '×' + NZ;
    salida.cajaMenorQueElMundo = (2 * MC_RELIGHT_R + 1) < NX;

    // Comparar el resultado incremental con el global. Devuelve null si son idénticos, o el primer desacuerdo.
    const comparar = (x, z, etiqueta) => {
      const caja = mcRelightBox(x, z);
      const inc = mc.light.slice();
      mcComputeLight();
      for (let i = 0; i < N; i++) if (inc[i] !== mc.light[i]) {
        return { etiqueta, x, z, celda: [i % NX, ((i / NX) | 0) % NY, (i / (NX * NY)) | 0],
                 incremental: inc[i], global: mc.light[i] };
      }
      // Y la caja devuelta tiene que CONTENER todo lo que cambió: es la que decide qué chunks se re-mallan,
      // y quedarse corta deja sombras viejas pintadas en pantalla.
      return { etiqueta, ok: true, caja };
    };

    // 1) Ediciones al azar por todo el mundo (poner y quitar), cada una comprobada contra el global.
    let semilla = 12345;
    const azar = n => ((semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) % n);
    const hechas = [];
    let malAzar = null, nAzar = 0;
    for (let k = 0; k < 120 && !malAzar; k++) {
      const x = 2 + azar(NX - 4), z = 2 + azar(NZ - 4), y = 1 + azar(NY - 2);
      const i = mcIdx(x, y, z), antes = mc.grid[i];
      mc.grid[i] = antes ? 0 : 1;
      hechas.push([i, antes]);
      const res = comparar(x, z, 'azar');
      nAzar++;
      if (!res.ok) malAzar = res;
    }
    salida.azar = { n: nAzar, mal: malAzar };

    // 2) Los casos que de verdad duelen. Se monta una cueva tapada y se le abre y cierra el techo: es el
    //    caso en el que la luz viaja MÁS lejos de un solo golpe (el cielo cae por la columna entera y luego
    //    se derrama por dentro), justo lo que una caja demasiado pequeña se dejaría fuera.
    const CX = 60, CZ = 60, SUELO = 8, TECHO = 14;
    for (let x = CX - 8; x <= CX + 8; x++) for (let z = CZ - 8; z <= CZ + 8; z++) {
      for (let y = SUELO; y <= TECHO; y++) {
        const i = mcIdx(x, y, z), antes = mc.grid[i];
        const borde = (x === CX - 8 || x === CX + 8 || z === CZ - 8 || z === CZ + 8 || y === SUELO || y === TECHO);
        const val = borde ? 1 : 0;
        if (antes !== val) { hechas.push([i, antes]); mc.grid[i] = val; }
      }
    }
    mcComputeLight();                                    // punto de partida limpio: la cueva, a oscuras
    const duros = [];
    const tocar = (x, y, z, val, etiqueta) => {
      const i = mcIdx(x, y, z), antes = mc.grid[i];
      if (antes !== val) { hechas.push([i, antes]); mc.grid[i] = val; }
      duros.push(comparar(x, z, etiqueta));
    };
    tocar(CX, TECHO, CZ, 0, 'abrir el techo de la cueva');
    tocar(CX, TECHO, CZ, 1, 'volver a taparlo');
    tocar(CX - 8, TECHO, CZ, 0, 'abrirlo por una esquina');
    tocar(CX - 8, TECHO, CZ, 1, 'y taparla');
    tocar(0, 12, 40, 1, 'contra la cara x=0 del mundo');      // la caja se sale del mundo: se recorta
    tocar(0, 12, 40, 0, 'y deshacerlo');
    tocar(NX - 1, 12, 40, 1, 'contra la cara x=máx');
    tocar(NX - 1, 12, 40, 0, 'y deshacerlo');
    tocar(32, 12, 32, 1, 'justo en el borde de un chunk');    // 32 = frontera de chunk (MC_CHUNK=16)
    tocar(32, 12, 32, 0, 'y deshacerlo');
    tocar(45, 1, 45, 1, 'en el fondo del mundo');
    tocar(45, 1, 45, 0, 'y deshacerlo');
    salida.duros = duros;

    // 3) Que la caja devuelta CONTIENE todo lo que cambió (lo comprobamos a mano contra el global).
    const iTecho = mcIdx(CX, TECHO, CZ);
    const antesTecho = mc.grid[iTecho];
    const luzAntes = mc.light.slice();
    mc.grid[iTecho] = antesTecho ? 0 : 1; hechas.push([iTecho, antesTecho]);
    const caja = mcRelightBox(CX, CZ);
    let fuera = null;
    for (let i = 0; i < N && !fuera; i++) if (luzAntes[i] !== mc.light[i]) {
      const x = i % NX, z = (i / (NX * NY)) | 0;
      if (!caja || x < caja[0] || x > caja[2] || z < caja[1] || z > caja[3]) fuera = { celda: [x, z], caja };
    }
    salida.cajaCompleta = { fuera, caja };

    // 4) Lo que se vino a arreglar: cuánto cuesta UNA edición en un mundo grande.
    for (let k = hechas.length - 1; k >= 0; k--) mc.grid[hechas[k][0]] = hechas[k][1];
    game.resizeWorld('512x40x512');
    await new Promise(res => setTimeout(res, 1500));
    const g = mc.dim, gx = g.x >> 1, gz = g.z >> 1;
    let gy = 1; for (let y = g.y - 1; y >= 0; y--) if (mc.grid[mcIdx(gx, y, gz)]) { gy = y + 1; break; }
    const cron = f => { const t0 = performance.now(); f(); return performance.now() - t0; };
    mc.grid[mcIdx(gx, gy, gz)] = 1;
    const tGlobal = cron(() => mcComputeLight());
    const tCaja = cron(() => mcRelightBox(gx, gz));
    const tEdicion = cron(() => mcRemeshAround(gx, gz));
    mc.grid[mcIdx(gx, gy, gz)] = 0; mcRemeshAround(gx, gz);
    salida.coste = { dim: g.x + '×' + g.y + '×' + g.z, global: +tGlobal.toFixed(1),
                     caja: +tCaja.toFixed(1), edicionEntera: +tEdicion.toFixed(1) };

    // 5) Devolver el mundo a su tamaño y comprobar que no se ha perdido nada por el camino.
    game.resizeWorld(dimOriginal.x + 'x' + dimOriginal.y + 'x' + dimOriginal.z);
    await new Promise(res => setTimeout(res, 1200));
    salida.mundoIntacto = resumenRejilla() === rejillaAntes;
    salida.dimIntacta = mc.dim.x === dimOriginal.x && mc.dim.y === dimOriginal.y && mc.dim.z === dimOriginal.z;
    return salida;
  });

  console.log('\nSkylight incremental · ' + r.dim + '\n');
  test('la caja de recálculo es MENOR que el mundo (si no, no se estaría probando nada)',
    () => assert(r.cajaMenorQueElMundo, 'la caja cubre el mundo entero: el test sería vacío'));
  test('120 ediciones al azar dan la MISMA luz que el barrido global, celda a celda',
    () => assert(!r.azar.mal, 'desacuerdo: ' + JSON.stringify(r.azar.mal)));
  for (const d of r.duros)
    test('idéntica al global · ' + d.etiqueta, () => assert(d.ok, 'desacuerdo: ' + JSON.stringify(d)));
  test('la caja devuelta contiene TODAS las celdas que cambiaron (si no, quedan sombras viejas)',
    () => assert(!r.cajaCompleta.fuera, 'cambió una celda fuera de la caja: ' + JSON.stringify(r.cajaCompleta)));

  console.log('\n  el coste, que es a lo que se venía (' + r.coste.dim + ')');
  console.log('    barrido global ' + r.coste.global + ' ms   ·   caja ' + r.coste.caja +
              ' ms   ·   edición entera (luz + malla) ' + r.coste.edicionEntera + ' ms\n');
  test('una edición cabe de sobra en un frame de 60 fps (16,7 ms)',
    () => assert(r.coste.edicionEntera < 16.7,
      'la edición entera cuesta ' + r.coste.edicionEntera + ' ms: sigue tirando frames'));
  test('la caja es al menos 20 veces más barata que el barrido global',
    () => assert(r.coste.caja * 20 < r.coste.global,
      'caja ' + r.coste.caja + ' ms vs global ' + r.coste.global + ' ms'));

  console.log('');
  test('la rejilla del mundo queda como estaba', () => {
    assert(r.dimIntacta, 'el mundo no volvió a su tamaño original');
    assert(r.mundoIntacto, 'la rejilla no volvió a su estado original: la sonda dejó bloques puestos');
  });
  test('sin excepciones en la página', () => assert(!errores.length, errores.join(' | ')));

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();