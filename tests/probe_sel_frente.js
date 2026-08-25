// Banco de pruebas de `sel-extruir-frente` SIN navegador: simula lo justo del motor (rejilla, selección,
// mcSelForEach…) y comprueba los signos, que es donde se rompen estas cosas. No sustituye probarlo en
// el mapa —aquí no hay render, ni luz, ni historial de verdad—, pero caza el eje/sentido invertido.
//
//     node tests/probe_sel_frente.js
const fs = require('fs');
const path = require('path');

const FUENTE = path.join(__dirname, '..', 'herramientas', 'snp_sel_extruir_frente.js');

function montaMundo() {
  const dim = { x: 8, y: 8, z: 8 };
  const grid = new Int32Array(dim.x * dim.y * dim.z);
  const mc = {
    dim, grid, tool: 'select', active: true, canvas: {}, yaw: Math.PI, pitch: 0,
    selCajas: [], selA: null, selSuma: false, ruedaUmbral: 30, tool_: null
  };
  Object.defineProperty(mc, 'selBox', {
    get() { const l = mc.selCajas; return l.length ? l[l.length - 1] : null; },
    set(v) { mc.selCajas = v ? [v] : []; }
  });
  return mc;
}

function arranca(mc) {
  const G = {};
  G.mcIdx = (x, y, z) => (y * mc.dim.z + z) * mc.dim.x + x;
  G.mcInside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < mc.dim.x && y < mc.dim.y && z < mc.dim.z;
  G.mcSetBlock = (x, y, z, id) => { mc.grid[G.mcIdx(x, y, z)] = id; };
  G.mcSelForEach = (fn) => {
    for (let ci = 0; ci < mc.selCajas.length; ci++) {
      const s = mc.selCajas[ci];
      const x0 = Math.min(s.a[0], s.b[0]), x1 = Math.max(s.a[0], s.b[0]);
      const y0 = Math.min(s.a[1], s.b[1]), y1 = Math.max(s.a[1], s.b[1]);
      const z0 = Math.min(s.a[2], s.b[2]), z1 = Math.max(s.a[2], s.b[2]);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        if (!G.mcInside(x, y, z)) continue;
        const id = mc.grid[G.mcIdx(x, y, z)];
        if (id) fn(x, y, z, id, ci);
      }
    }
  };
  G.mcSelCount = () => { let n = 0; G.mcSelForEach(() => n++); return n; };
  G.mcRemeshEdiciones = () => {};
  G.mcPushHist = () => {};
  G.mcScheduleSave = () => {};
  G.mcForceUnstick = () => {};
  G.mcRaycast = () => null;
  G.toast = (t) => { G._ultimoToast = t; };

  const oyentes = [];
  const W = {
    addEventListener: (t, f, o) => oyentes.push({ t, f, o }),
    removeEventListener: (t, f) => { const i = oyentes.findIndex(l => l.f === f); if (i >= 0) oyentes.splice(i, 1); }
  };
  Object.assign(W, G);
  W.game = {};
  W.window = W;
  W.document = { pointerLockElement: mc.canvas };
  W.console = console;
  W.Math = Math; W.Map = Map; W.isFinite = isFinite;

  const src = fs.readFileSync(FUENTE, 'utf8');
  const nombres = ['window', 'document', 'game', 'mc', 'console', ...Object.keys(G)];
  const fn = new Function(...nombres, src);
  const r = fn(W, W.document, W.game, mc, console, ...Object.keys(G).map(k => G[k]));
  return { W, G, oyentes, r };
}

// ── el escenario: un muro macizo en z=4..6, y una selección de 3x3 sobre su cara ────────────────────
function muro(mc) {
  mc.grid.fill(0);
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) for (let z = 4; z <= 6; z++) {
    mc.grid[(y * 8 + z) * 8 + x] = 7;               // id 7 = "piedra"
  }
}
const caja = (a, b) => ({ a: a.slice(), b: b.slice() });
const solido = (mc, x, y, z) => mc.grid[(y * 8 + z) * 8 + x];
const zDe = (s) => [Math.min(s.a[2], s.b[2]), Math.max(s.a[2], s.b[2])];

let ok = 0, fallos = 0;
function comprueba(que, cond, detalle) {
  if (cond) { ok++; console.log('  ok  ' + que + (detalle ? '   · ' + detalle : '')); }
  else { fallos++; console.log('  FALLA  ' + que + (detalle ? '   · ' + detalle : '')); }
}

console.log('\n§0 · el eje sale de la mirada, y se recalcula en cada muesca');
{
  const mc = montaMundo();
  const { W } = arranca(mc);
  const sel = W.game.selFrente;
  mc.yaw = Math.PI;      comprueba('mirando a +Z', sel.eje().nombre === '+Z', sel.eje().nombre);
  mc.yaw = 0;            comprueba('mirando a -Z', sel.eje().nombre === '-Z', sel.eje().nombre);
  mc.yaw = -Math.PI / 2; comprueba('mirando a +X', sel.eje().nombre === '+X', sel.eje().nombre);
  mc.yaw = Math.PI / 2;  comprueba('mirando a -X', sel.eje().nombre === '-X', sel.eje().nombre);
}

console.log('\n§1 · Shift+rueda ARRIBA hunde: se come la cara y la caja avanza hacia dentro');
{
  const mc = montaMundo(); muro(mc);
  const { W } = arranca(mc);
  mc.yaw = Math.PI;                                   // mirando hacia +Z ⇒ la cara del muro es z=4
  mc.selBox = caja([2, 1, 4], [4, 3, 4]);
  W.game.selFrente.extruye(+1);
  comprueba('la capa z=4 de la selección ha desaparecido',
    solido(mc, 3, 2, 4) === 0, 'z4=' + solido(mc, 3, 2, 4));
  comprueba('lo de detrás (z=5) sigue ahí', solido(mc, 3, 2, 5) === 7);
  comprueba('fuera de la selección no se toca nada', solido(mc, 0, 2, 4) === 7);
  comprueba('la caja avanzó a z=5 (profundidad 1 ⇒ se mueve entera)',
    String(zDe(mc.selBox)) === '5,5', 'z=' + zDe(mc.selBox));

  W.game.selFrente.extruye(+1);                       // segunda muesca: cavidad más profunda
  comprueba('la segunda muesca se come z=5', solido(mc, 3, 2, 5) === 0);
  comprueba('la caja va por z=6', String(zDe(mc.selBox)) === '6,6', 'z=' + zDe(mc.selBox));
}

console.log('\n§2 · Shift+rueda ABAJO trae: pone capa hacia ti y la caja te sigue');
{
  const mc = montaMundo(); muro(mc);
  const { W } = arranca(mc);
  mc.yaw = Math.PI;
  mc.selBox = caja([2, 1, 4], [4, 3, 4]);
  W.game.selFrente.extruye(-1);
  comprueba('aparece capa en z=3 (hacia ti)', solido(mc, 3, 2, 3) === 7, 'z3=' + solido(mc, 3, 2, 3));
  comprueba('conserva el material de su fila', solido(mc, 2, 1, 3) === 7);
  comprueba('la cara de origen (z=4) sigue puesta', solido(mc, 3, 2, 4) === 7);
  comprueba('fuera de la selección, z=3 sigue vacío', solido(mc, 0, 2, 3) === 0);
  comprueba('la caja creció hacia ti: z=3..4', String(zDe(mc.selBox)) === '3,4', 'z=' + zDe(mc.selBox));
}

console.log('\n§3 · una muesca y su contraria dejan los bloques como estaban');
{
  const mc = montaMundo(); muro(mc);
  const { W } = arranca(mc);
  mc.yaw = Math.PI;
  mc.selBox = caja([2, 1, 4], [4, 3, 4]);
  const antes = Array.from(mc.grid);
  W.game.selFrente.extruye(+1);                        // hunde
  W.game.selFrente.extruye(-1);                        // y trae de vuelta
  const igual = antes.every((v, i) => v === mc.grid[i]);
  comprueba('hundir + traer = rejilla idéntica', igual);
  // La CAJA no vuelve a alto 1, se queda en z=4..5. No es un despiste: es el mismo defecto que ya tiene
  // Ctrl+rueda en el motor (cavar con profundidad 1 mueve la caja ENTERA, y la muesca contraria crece
  // solo por el borde activo ⇒ profundidad 2). Lo que el dueño pidió y aquí se cumple es que los
  // BLOQUES queden como estaban; el marco es una ayuda visual de dónde cae la muesca siguiente. Se
  // hereda a propósito: divergir del gesto hermano confundiría más que el defecto.
  comprueba('el borde CERCANO vuelve a z=4 (ahí cae la muesca siguiente)',
    Math.min(mc.selBox.a[2], mc.selBox.b[2]) === 4, 'z=' + zDe(mc.selBox));
}

console.log('\n§4 · mirando al otro lado, el gesto se da la vuelta solo');
{
  const mc = montaMundo(); muro(mc);
  const { W } = arranca(mc);
  mc.yaw = 0;                                          // mirando hacia -Z ⇒ la cara del muro es z=6
  mc.selBox = caja([2, 1, 6], [4, 3, 6]);
  W.game.selFrente.extruye(+1);
  comprueba('hunde por z=6, no por z=4', solido(mc, 3, 2, 6) === 0 && solido(mc, 3, 2, 4) === 7);
  comprueba('la caja retrocede a z=5', String(zDe(mc.selBox)) === '5,5', 'z=' + zDe(mc.selBox));
}

console.log('\n§5 · el eje X funciona igual');
{
  const mc = montaMundo();
  mc.grid.fill(0);
  for (let x = 4; x <= 6; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 8; z++) mc.grid[(y * 8 + z) * 8 + x] = 7;
  const { W } = arranca(mc);
  mc.yaw = -Math.PI / 2;                               // mirando hacia +X ⇒ cara en x=4
  mc.selBox = caja([4, 1, 2], [4, 3, 4]);
  W.game.selFrente.extruye(+1);
  comprueba('se come la cara x=4', mc.grid[(2 * 8 + 3) * 8 + 4] === 0);
  comprueba('x=5 sigue ahí', mc.grid[(2 * 8 + 3) * 8 + 5] === 7);
  comprueba('la caja avanza a x=5',
    String([Math.min(mc.selBox.a[0], mc.selBox.b[0]), Math.max(mc.selBox.a[0], mc.selBox.b[0])]) === '5,5');
}

console.log('\n§6 · nada que hacer = no se miente moviendo la caja');
{
  const mc = montaMundo();                             // mundo vacío: la selección no tiene bloques
  const { W } = arranca(mc);
  mc.yaw = Math.PI;
  mc.selBox = caja([2, 1, 4], [4, 3, 4]);
  const r = W.game.selFrente.extruye(+1);
  comprueba('devuelve false', r === false);
  comprueba('la caja NO se ha movido', String(zDe(mc.selBox)) === '4,4', 'z=' + zDe(mc.selBox));
}

console.log('\n§7 · on/off quita y pone el oyente (re-ejecutable sin apilar)');
{
  const mc = montaMundo();
  const { W, oyentes } = arranca(mc);
  comprueba('al cargar deja 1 oyente de wheel', oyentes.length === 1, oyentes.length + '');
  W.game.selFrente.off();
  comprueba('off() lo retira', oyentes.length === 0, oyentes.length + '');
  W.game.selFrente.on();
  comprueba('on() lo vuelve a poner', oyentes.length === 1, oyentes.length + '');
  comprueba('estado() dice que está puesto', W.game.selFrente.estado().puesto === true);
}

console.log('\n' + ok + ' ok / ' + fallos + ' fallos' + (fallos ? '' : '  ·  TODO OK'));
process.exit(fallos ? 1 : 0);
