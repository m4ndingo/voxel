/* Genera las PIEZAS del perro articulado como assets voxel del servidor.
   Hermano de make_zombie.js: mismas reglas, otro bicho. Lo que cambia de verdad es que el perro es
   un CUADRÚPEDO — el torso va tumbado (largo en el eje de fondo) y las cuatro patas cuelgan de él —,
   así que aquí se ve si el motor de esqueletos era de verdad agnóstico o si estaba pensado para algo
   con dos piernas.
   Salida: assets/{cabeza,torso,pata,cola}-perro.vox.json + actualiza assets/index.json
   Uso: node make_perro.js

   Ejes del asset (app.js:4100, mcStructCells) — world=(ax,az,ay):
     X = ancho (izquierda↔derecha)   Y = fondo (y=0 es el FRENTE, mira al -Z del mundo)   Z = ALTO

   ⚠️ NINGUNA pieza puede llegar a 4096 voxels: un asset de 1×1×1 bloque con ≥4096 voxels macizos es
   TERRENO (`blockLike`, app.js:4126) y el terreno no se puede animar. Aquí no hay riesgo (la pieza
   más gorda es el torso, 8×14×8 = 896), pero la comprobación se hace igual al final.

   ⚠️ `type: 'textura'` NO es un capricho: es lo que hace que abrir la pieza en el editor y guardarla
   vuelva a `/api/assets` y no a `/api/habitantes`, o sea lo que deja reponer un pivote con 📍 sin que
   la pieza se convierta en otra cosa. Es el mismo tipo que llevan las del zombie. */
const fs = require('fs');
const path = require('path');

const MC_TILE = 16;   // voxels finos por bloque de mundo, igual que app.js

// ── Paleta (perro marrón de pueblo, con collar rojo para que se lea que es de alguien) ─────────
const C = {
  pelo:    '#8a6237', peloS: '#6f4d2b', peloD: '#573c21', peloL: '#a97b4c',
  vientre: '#d8bd94', vientreS: '#bda078',
  hocico:  '#4a3324', nariz: '#241a15',
  ojo:     '#141013', brillo: '#e8e4dc',
  lengua:  '#c4626b', orejaIn: '#a8705e',
  almohadilla: '#332822',
  collar:  '#a8342f', chapa: '#d9c06a',
};

// Ruido determinista: las manchas tienen que salir IGUALES en cada ejecución, o regenerar los
// assets ensuciaría el diff sin cambiar nada de verdad.
const moteado = (x, y, z, n) => ((x * 73 + y * 151 + z * 31 + x * y * 7 + z * z * 3) % n);

// Una pieza = su propia rejilla. Copiado de make_zombie.js a propósito: son dos generadores
// independientes y compartir un helper entre ellos ataría el perro a los retoques del zombie.
function pieza(dx, dy, dz) {
  const V = new Map();
  const K = (x, y, z) => x + ',' + y + ',' + z;
  const dentro = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < dx && y < dy && z < dz;
  const set = (x, y, z, c) => { if (dentro(x, y, z)) V.set(K(x, y, z), c); };
  const del = (x, y, z) => V.delete(K(x, y, z));
  const box = (x0, x1, y0, y1, z0, z1, c) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, c);
  };
  // Espejo en X: las dos mitades de un bicho son la misma, y escribirlas dos veces es la forma
  // habitual de que dejen de serlo al retocar una.
  const symbox = (x0, x1, y0, y1, z0, z1, c) => { box(x0, x1, y0, y1, z0, z1, c); box(dx - 1 - x1, dx - 1 - x0, y0, y1, z0, z1, c); };
  const superficie = (x, y, z) => x === 0 || y === 0 || z === 0 || x === dx - 1 || y === dy - 1 || z === dz - 1;
  const manchar = (n, c, z0, z1) => {
    for (let x = 0; x < dx; x++) for (let y = 0; y < dy; y++) for (let z = (z0 | 0); z <= (z1 === undefined ? dz - 1 : z1); z++) {
      if (superficie(x, y, z) && V.has(K(x, y, z)) && moteado(x, y, z, n) === 0) set(x, y, z, c);
    }
  };
  return { dx, dy, dz, V, set, del, box, symbox, manchar };
}

// ── Torso · 8×14×8 · la RAÍZ, y va TUMBADO (14 de fondo, 8 de alto) ──────────────────────────
function torso() {
  const p = pieza(8, 14, 8), { box, set, symbox } = p;
  box(0, 7, 0, 13, 0, 7, C.pelo);
  symbox(0, 0, 0, 13, 2, 7, C.peloS);          // costados en sombra
  box(0, 7, 13, 13, 0, 7, C.peloS);            // grupa
  box(0, 7, 0, 13, 0, 1, C.vientre);           // barriga clara
  symbox(0, 0, 3, 9, 0, 1, C.vientreS);
  p.manchar(19, C.peloD, 2);
  symbox(0, 1, 5, 8, 3, 6, C.peloL);           // mancha en el costado

  box(0, 7, 0, 1, 0, 7, C.collar);             // collar: el anillo entero de la primera rodaja
  box(3, 4, 0, 0, 0, 0, C.chapa);              // la chapita, colgando por debajo
  return p;
}

// ── Cabeza · 8×9×11 · cráneo + hocico + orejas ───────────────────────────────────────────────
// Lleva UN pivote en el cuello (parte baja trasera): la cabeza de un perro gira sobre el cuello,
// no sobre el centro de su caja, y con el hocico tan largo la diferencia se ve de lejos.
function cabeza() {
  const p = pieza(8, 9, 11), { box, set, del, symbox } = p;
  box(0, 7, 2, 8, 0, 7, C.pelo);               // cráneo
  box(0, 7, 2, 8, 7, 7, C.peloD);              // testuz
  symbox(0, 0, 2, 8, 0, 7, C.peloS);
  box(2, 5, 5, 8, 0, 1, C.vientre);            // papada

  box(2, 5, 0, 2, 1, 4, C.hocico);             // hocico
  box(2, 5, 0, 0, 1, 1, C.hocico);
  box(3, 4, 0, 0, 4, 4, C.nariz);              // trufa
  box(3, 4, 0, 0, 1, 1, C.lengua);             // un trozo de lengua asomando
  symbox(1, 1, 2, 2, 4, 5, C.ojo);             // ojos en la cara del cráneo, a los lados del hocico
  symbox(1, 2, 2, 2, 6, 6, C.peloL);           // las cejas claras de casi todos los perros marrones

  symbox(0, 1, 4, 6, 8, 10, C.pelo);           // orejas
  symbox(0, 1, 4, 4, 8, 9, C.orejaIn);
  symbox(0, 0, 4, 6, 10, 10, C.peloD);

  p.manchar(23, C.peloD, 2, 7);
  for (const y of [2, 8]) for (const z of [0, 7]) { del(0, y, z); del(7, y, z); }
  return p;
}

// ── Pata · 3×4×9 · dos pivotes en caras opuestas (cadera izq / der) ──────────────────────────
// Una sola pieza para las cuatro patas: lo que las distingue es su `en` y su desfase, que es
// justamente para lo que existe un rig por INSTANCIA y no por material.
function pata() {
  const p = pieza(3, 4, 9), { box } = p;
  box(0, 2, 0, 3, 0, 8, C.pelo);
  box(0, 2, 0, 3, 6, 8, C.peloS);              // el muslo, en sombra bajo el cuerpo
  box(0, 2, 0, 3, 0, 1, C.vientre);            // calcetín claro
  box(0, 2, 0, 3, 0, 0, C.almohadilla);        // almohadilla
  p.manchar(17, C.peloD, 2);
  return p;
}

// ── Cola · 4×8×4 · un pivote en la base, para menearse sobre la VERTICAL (eje 'y') ───────────
function cola() {
  const p = pieza(4, 8, 4), { box } = p;
  box(0, 3, 0, 3, 0, 3, C.pelo);               // arranque grueso
  box(1, 2, 4, 7, 1, 2, C.pelo);               // y se afila
  box(1, 2, 6, 7, 1, 2, C.vientre);            // punta blanca
  p.manchar(11, C.peloS, 0);
  return p;
}

// ── Escritura ────────────────────────────────────────────────────────────────────────────────
// La huella en bloques y `blockLike` se calculan EXACTAMENTE como mcStructCells (app.js:4102-4127).
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

const dir = path.join(__dirname, 'assets');
fs.mkdirSync(dir, { recursive: true });
const idxPath = path.join(dir, 'index.json');
let idx = [];
try { idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')); } catch (e) { }

const PIEZAS = [
  { id: 'torso-perro', name: 'Torso de perro', role: 'Pieza de agente · raíz del esqueleto (tumbada: 14 de fondo)', p: torso(), pivotes: null },
  { id: 'cabeza-perro', name: 'Cabeza de perro', role: 'Pieza de agente · cabeza (pivote 1 = el cuello)', p: cabeza(), pivotes: [[4, 7, 1]] },
  { id: 'pata-perro', name: 'Pata de perro', role: 'Pieza de agente · pata (pivote 1 = cadera +X, 2 = cadera -X)', p: pata(), pivotes: [[2, 2, 8], [0, 2, 8]] },
  { id: 'cola-perro', name: 'Cola de perro', role: 'Pieza de agente · cola (pivote 1 = el arranque; menea sobre el eje y)', p: cola(), pivotes: [[2, 0, 2]] },
];

let fallo = false;
for (const pz of PIEZAS) {
  const { p } = pz, hu = huella(p);
  const meta = { name: pz.name, type: 'textura', role: pz.role, description: 'Pieza articulable del perro. Generada por make_perro.js.' };
  const out = { format: 'voxelforge-1', size: { x: p.dx, y: p.dy, z: p.dz }, meta, voxels: Object.fromEntries(p.V) };
  if (pz.pivotes) out.pivotes = pz.pivotes;
  const file = 'assets/' + pz.id + '.vox.json';
  fs.writeFileSync(path.join(__dirname, file), JSON.stringify(out, null, 2));

  idx = idx.filter(a => a.id !== pz.id);
  idx.push({ id: pz.id, name: pz.name, role: pz.role, type: 'textura', size: { x: p.dx, y: p.dy, z: p.dz }, file, icon: '🐕', group: 'Agentes' });

  console.log(pz.id.padEnd(13), (p.dx + '×' + p.dy + '×' + p.dz).padEnd(8), String(hu.nvox).padStart(4) + ' voxels',
    '· huella ' + hu.w + '×' + hu.h + '×' + hu.d,
    '· ' + (p.dx / MC_TILE) + '×' + (p.dy / MC_TILE) + '×' + (p.dz / MC_TILE) + ' bloques',
    '· blockLike=' + hu.blockLike, hu.blockLike ? '  ⚠️ SERÍA TERRENO: NO SE PUEDE ANIMAR' : '');
  if (hu.blockLike) fallo = true;
}
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2));

// Las cuentas del muñeco montado, para no tener que sacarlas a mano al escribir el documento.
const patas = 9 / MC_TILE, cuerpo = 8 / MC_TILE, cab = 11 / MC_TILE, enCab = 0.1875;
console.log('\nDe pie: patas ' + patas + ' + torso ' + cuerpo + ' = ' + (patas + cuerpo) + ' bloques a la cruz;'
  + ' con la cabeza (en ' + enCab + ') llega a ' + (patas + enCab + cab).toFixed(4) + '. El jugador mide 1.8.');
if (fallo) { console.error('Alguna pieza sería terreno. Bájale un lado a 15 o quítale voxels.'); process.exit(1); }
