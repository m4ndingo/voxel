/* Genera las PIEZAS del zombie articulado como assets voxel del servidor.
   Cada pieza es su propio asset, con su propia rejilla y con sus PIVOTES ya puestos, para que el
   motor de esqueletos las estampe y las articule sin tener que dibujar nada a mano.
   Salida: assets/{cabeza,torso,brazo,pierna}-zombie.vox.json + actualiza assets/index.json
   Uso: node herramientas/make_zombie.js

   Ejes del asset (app.js:4100, mcStructCells) — world=(ax,az,ay):
     X = ancho (izquierda↔derecha)   Y = fondo (y=0 es el FRENTE, mira al -Z del mundo)   Z = ALTO
   Es el mismo convenio que usa `mirar` para el frente, así que las piezas nacen encaradas.

   ⚠️ NINGUNA pieza puede llegar a 4096 voxels. Un asset que ocupa 1×1×1 bloque y tiene ≥4096
   voxels macizos es TERRENO (`blockLike`, app.js:4126): se funde en la malla del chunk y deja de
   ser una instancia con matriz propia, o sea deja de poder animarse. Por eso la cabeza es 15³ y no
   16³: con cualquier lado ≤15 el máximo posible es 3375 < 4096 y no puede volverse terreno por
   mucho que se rellene. (La `cabeza.vox.json` del dueño se libra por 4 voxels: 4092. Es un cable
   pelado y aquí no se repite.) Al final del script se comprueba pieza a pieza. */
const fs = require('fs');
const path = require('path');

const MC_TILE = 16;   // voxels finos por bloque de mundo, igual que app.js

// ── Paleta (zombie de Minecraft: piel verde podrida, camisa turquesa, pantalón azul) ──────────
const C = {
  piel:     '#5b8f4e', pielS: '#4a7740', pielD: '#3d6435', pielL: '#6ea25c',
  pelo:     '#2f4a2b', peloD: '#233a20',
  ojo:      '#0a0d0a', ojoBri: '#2a4d2a',
  boca:     '#2a1c1c', diente: '#d8d6c4',
  podrido:  '#7d6b4a', herida: '#6b3a32',
  camisa:   '#2f8f96', camisaS: '#246e74', camisaD: '#1b545a',
  pantalon: '#38408c', pantalonS: '#2a3069',
  bota:     '#22242b', botaS: '#171920',
};

// Ruido determinista: las manchas tienen que salir IGUALES en cada ejecución, o regenerar los
// assets ensuciaría el diff sin cambiar nada de verdad.
const moteado = (x, y, z, n) => ((x * 73 + y * 151 + z * 31 + x * y * 7 + z * z * 3) % n);

// Una pieza = su propia rejilla. Los helpers son los de make_chef.js pero atados a las dimensiones
// de ESTA pieza, porque aquí cada asset tiene un tamaño distinto y no una rejilla común.
function pieza(dx, dy, dz) {
  const V = new Map();
  const K = (x, y, z) => x + ',' + y + ',' + z;
  const dentro = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < dx && y < dy && z < dz;
  const set = (x, y, z, c) => { if (dentro(x, y, z)) V.set(K(x, y, z), c); };
  const del = (x, y, z) => V.delete(K(x, y, z));
  const box = (x0, x1, y0, y1, z0, z1, c) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, c);
  };
  // Espejo en X: las dos mitades de un cuerpo son la misma, y escribirlas dos veces es la forma
  // habitual de que dejen de serlo al retocar una.
  const symbox = (x0, x1, y0, y1, z0, z1, c) => { box(x0, x1, y0, y1, z0, z1, c); box(dx - 1 - x1, dx - 1 - x0, y0, y1, z0, z1, c); };
  // Manchas solo en la CÁSCARA: el interior no se ve nunca y ensuciarlo es gastar voxels.
  const superficie = (x, y, z) => x === 0 || y === 0 || z === 0 || x === dx - 1 || y === dy - 1 || z === dz - 1;
  const manchar = (n, c, z0, z1) => {
    for (let x = 0; x < dx; x++) for (let y = 0; y < dy; y++) for (let z = (z0 | 0); z <= (z1 === undefined ? dz - 1 : z1); z++) {
      if (superficie(x, y, z) && V.has(K(x, y, z)) && moteado(x, y, z, n) === 0) set(x, y, z, c);
    }
  };
  return { dx, dy, dz, V, set, del, box, symbox, manchar };
}

// ── Cabeza · 15×15×15 (≈1 bloque, lo que pidió el dueño) ─────────────────────────────────────
function cabeza() {
  const p = pieza(15, 15, 15), { box, set, del, symbox } = p;
  box(0, 14, 0, 14, 0, 14, C.piel);
  p.manchar(9, C.pielD, 0);
  p.manchar(23, C.podrido, 0);

  box(0, 14, 0, 14, 13, 14, C.pelo);            // casquete
  box(0, 14, 11, 14, 7, 14, C.pelo);            // nuca
  box(0, 14, 0, 1, 12, 12, C.pelo);             // flequillo justo encima de la cara
  symbox(0, 0, 0, 10, 9, 12, C.pelo);           // patillas
  box(0, 14, 0, 14, 14, 14, C.peloD);

  symbox(2, 4, 0, 1, 7, 9, C.ojo);              // ojos hundidos: dos voxels de fondo
  set(4, 0, 9, C.ojoBri); set(10, 0, 9, C.ojoBri);
  symbox(1, 5, 0, 0, 10, 10, C.pielS);          // ceja
  box(6, 8, 0, 0, 5, 8, C.pielS);               // caballete de la nariz

  box(4, 10, 0, 0, 2, 3, C.boca);
  set(5, 0, 3, C.diente); set(7, 0, 3, C.diente); set(9, 0, 3, C.diente);
  box(11, 13, 0, 0, 3, 5, C.herida);            // mordisco en la mejilla
  set(12, 0, 6, C.podrido);

  for (const x of [0, 14]) for (const y of [0, 14]) for (const z of [0, 14]) del(x, y, z);
  return p;
}

// ── Torso · 12×8×14 (la RAÍZ del esqueleto) ──────────────────────────────────────────────────
function torso() {
  const p = pieza(12, 8, 14), { box, set, del, symbox } = p;
  box(0, 11, 0, 7, 0, 13, C.camisa);
  symbox(0, 0, 0, 7, 0, 13, C.camisaS);         // costados en sombra
  box(0, 11, 7, 7, 0, 13, C.camisaS);           // espalda
  p.manchar(17, C.camisaD, 0);

  box(4, 7, 2, 5, 13, 13, C.piel);              // cuello, para que la cabeza no flote
  box(3, 8, 0, 6, 12, 12, C.camisaD);           // cuello de la camisa

  box(4, 7, 0, 1, 4, 6, C.piel);                // camisa rota: barriga a la vista
  box(3, 8, 0, 0, 3, 3, C.camisaD);
  box(5, 6, 0, 0, 5, 5, C.herida);
  set(4, 0, 6, C.podrido); set(7, 0, 4, C.podrido);

  for (let x = 0; x < 12; x++) for (let y = 0; y < 8; y++) {   // bajos deshilachados
    if (moteado(x, y, 0, 3) === 0) del(x, y, 0);
  }
  return p;
}

// ── Brazo · 5×5×14 · dos pivotes en caras opuestas (hombro izq / der) ────────────────────────
function brazo() {
  const p = pieza(5, 5, 14), { box, set, del } = p;
  box(0, 4, 0, 4, 7, 13, C.camisa);             // manga
  box(0, 4, 4, 4, 7, 13, C.camisaS);
  box(0, 4, 0, 4, 0, 6, C.piel);                // antebrazo
  box(0, 4, 0, 4, 0, 1, C.pielS);               // mano
  p.manchar(11, C.pielD, 0, 6);
  p.manchar(13, C.camisaD, 7, 13);
  box(1, 3, 0, 0, 3, 4, C.herida);              // desgarro
  set(2, 0, 5, C.podrido);
  for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {   // borde de la manga deshilachado
    if (moteado(x, y, 7, 4) === 0) p.set(x, y, 7, C.piel);
  }
  return p;
}

// ── Pierna · 5×5×12 · dos pivotes en caras opuestas (cadera izq / der) ───────────────────────
function pierna() {
  const p = pieza(5, 5, 12), { box, set, del } = p;
  box(0, 4, 0, 4, 2, 11, C.pantalon);
  box(0, 4, 4, 4, 2, 11, C.pantalonS);
  box(0, 4, 0, 4, 0, 1, C.bota);
  box(0, 4, 0, 4, 0, 0, C.botaS);
  p.manchar(13, C.pantalonS, 2, 11);
  box(1, 3, 0, 0, 5, 6, C.piel);                // rodilla asomando por el roto
  set(2, 0, 6, C.herida);
  return p;
}

// ── Escritura ────────────────────────────────────────────────────────────────────────────────
// La huella en bloques y `blockLike` se calculan EXACTAMENTE como mcStructCells (app.js:4102-4127),
// para que el aviso salte aquí y no en el navegador con el zombie ya medio montado.
function huella(p) {
  const celdas = new Set();
  let w = 0, h = 0, d = 0;
  for (const k of p.V.keys()) {
    const [ax, ay, az] = k.split(',').map(Number);
    const cx = Math.floor(ax / MC_TILE), cy = Math.floor(az / MC_TILE), cz = Math.floor(ay / MC_TILE);
    celdas.add(cx + ',' + cy + ',' + cz);
    if (cx + 1 > w) w = cx + 1; if (cy + 1 > h) h = cy + 1; if (cz + 1 > d) d = cz + 1;
  }
  const nvox = p.V.size;
  return { w, h, d, nvox, blockLike: (w <= 1 && h <= 1 && d <= 1 && nvox >= MC_TILE * MC_TILE * MC_TILE) };
}

const dir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(dir, { recursive: true });
const idxPath = path.join(dir, 'index.json');
let idx = [];
try { idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')); } catch (e) { }

const PIEZAS = [
  { id: 'cabeza-zombie', name: 'Cabeza de zombie', role: 'Pieza de agente · cabeza (15³, gira sobre el centro de su caja)', p: cabeza(), pivotes: null },
  { id: 'torso-zombie', name: 'Torso de zombie', role: 'Pieza de agente · raíz del esqueleto', p: torso(), pivotes: null },
  { id: 'brazo-zombie', name: 'Brazo de zombie', role: 'Pieza de agente · brazo (pivote 1 = hombro +X, 2 = hombro -X)', p: brazo(), pivotes: [[4, 2, 13], [0, 2, 13]] },
  { id: 'pierna-zombie', name: 'Pierna de zombie', role: 'Pieza de agente · pierna (pivote 1 = cadera +X, 2 = cadera -X)', p: pierna(), pivotes: [[4, 2, 11], [0, 2, 11]] },
];

let fallo = false;
for (const pz of PIEZAS) {
  const { p } = pz, hu = huella(p);
  const meta = { name: pz.name, type: 'textura', role: pz.role, description: 'Pieza articulable del zombie. Generada por make_zombie.js.' };
  const out = { format: 'voxelforge-1', size: { x: p.dx, y: p.dy, z: p.dz }, meta, voxels: Object.fromEntries(p.V) };
  if (pz.pivotes) out.pivotes = pz.pivotes;
  const file = 'assets/' + pz.id + '.vox.json';
  fs.writeFileSync(path.join(__dirname, '..', file), JSON.stringify(out, null, 2));

  idx = idx.filter(a => a.id !== pz.id);
  idx.push({ id: pz.id, name: pz.name, role: pz.role, type: 'textura', size: { x: p.dx, y: p.dy, z: p.dz }, file, icon: '🧟', group: 'Agentes' });

  const alto = (p.dz / MC_TILE).toFixed(3);
  console.log(pz.id.padEnd(14), p.dx + '×' + p.dy + '×' + p.dz, String(hu.nvox).padStart(5) + ' voxels',
    '· huella ' + hu.w + '×' + hu.h + '×' + hu.d, '· alto ' + alto + ' bloques',
    '· blockLike=' + hu.blockLike, hu.blockLike ? '  ⚠️ SERÍA TERRENO: NO SE PUEDE ANIMAR' : '');
  if (hu.blockLike) fallo = true;
}
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2));

const altoTotal = (15 + 14 + 12) / MC_TILE;
console.log('\nAlto del zombie de pie: 15+14+12 = 41 voxels = ' + altoTotal.toFixed(4) + ' bloques (el jugador mide 1.8).');
if (fallo) { console.error('Alguna pieza sería terreno. Bájale un lado a 15 o quítale voxels.'); process.exit(1); }
