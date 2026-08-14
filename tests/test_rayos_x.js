// @area: render
// @necesita: node
// Arnes headless para el VOLUMEN DE RAYOS-X del Mundo (mcXrayVolume de app.js).
//
// Extrae la funcion VERBATIM de app.js y la corre contra un mundo de juguete. Lo que se comprueba es
// que dibuje EXACTAMENTE los mismos voxels finos que la version ingenua de antes —una pregunta por
// voxel a TODAS las estructuras— pero sin pagar |caja del jugador| x |estructuras del mundo|. Aquello
// eran ~17 600 voxels x 48 estructuras = 850 000 pruebas POR FRAME (17 ms medidos en el mundo del
// dueño, el frame entero) y crecia con scale**3: el dueño lo reporto como «rayos-X va muy lento».
'use strict';
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync(__dirname + '/../web/app.js', 'utf8');
// Cada funcion de nivel superior de app.js acaba con '}' en la columna 0.
function extraer(nombre) {
  const ini = src.indexOf('\nfunction ' + nombre + '(');
  if (ini < 0) throw new Error('no encuentro function ' + nombre + ' en app.js');
  const fin = src.indexOf('\n}', ini);
  if (fin < 0) throw new Error('no encuentro el final de ' + nombre);
  return src.slice(ini + 1, fin + 3);
}

let ok = 0, fallos = 0;
function t(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ok  ' + nombre + (detalle ? '   (' + detalle + ')' : '')); }
  else { fallos++; console.log('  FALLA ' + nombre + (detalle ? '   (' + detalle + ')' : '')); }
}

// ── Mundo de juguete ───────────────────────────────────────────────────────────
// Suelo de rejilla y, junto al jugador, una escalera fina de 1/16 de grosor con largueros y peldaños
// (la forma del escalera.json de verdad: casi toda hueco). Ademas, un monton de estructuras LEJOS,
// que son las que hacian que el coste creciera aunque no se vieran.
const T = 16, DIM = { x: 32, y: 32, z: 32 };
const ID_ROCA = 1;
const MC_HW = 0.3, MC_PH = 1.8;

function panel() {   // panel YZ de 1 voxel fino de grosor: largueros en los bordes + peldaños 2 de cada 4
  const fdim = [1, T, T];
  const bits = new Uint8Array(fdim[0] * fdim[1] * fdim[2]);
  for (let y = 0; y < T; y++) for (let z = 0; z < T; z++)
    if ((y % 4 === 1 || y % 4 === 2) || z < 2 || z >= T - 2) bits[(y * fdim[2] + z) * fdim[0]] = 1;
  return { fdim, bits };
}

function macizo() {  // un 16**3 lleno: el peor caso, y el que dispara el numero de cajas dibujadas
  const fdim = [T, T, T];
  return { fdim, bits: new Uint8Array(fdim[0] * fdim[1] * fdim[2]).fill(1) };
}

// Cuenta cada lectura de bits: si el recorte por estructura funciona, las de lejos no se tocan NUNCA.
function espiar(g) {
  const lecturas = { n: 0 };
  const bits = new Proxy(g.bits, { get(o, k) { if (k !== 'length') lecturas.n++; return o[k]; } });
  return { g: { fdim: g.fdim, bits }, lecturas };
}

function montar(opciones = {}) {
  const grid = new Uint16Array(DIM.x * DIM.y * DIM.z);
  const idx = (x, y, z) => x + y * DIM.x + z * DIM.x * DIM.y;
  for (let x = 0; x < DIM.x; x++) for (let z = 0; z < DIM.z; z++) grid[idx(x, 7, z)] = ID_ROCA;   // suelo

  const cerca = opciones.macizo ? macizo() : panel();
  const geom = new Map();
  const estructuras = [];
  if (!opciones.sinCerca) {
    const s = { key: 'hab:escalera', ox: 16, oy: 8, oz: 16 };
    estructuras.push(s); geom.set(s, cerca);
  }
  // Estructuras lejanas: mismas geometrias, al otro extremo del mundo. Espiadas una a una.
  const espias = [];
  for (let i = 0; i < (opciones.lejos || 0); i++) {
    const s = { key: 'hab:lejos' + i, ox: 1, oy: 20, oz: 1 + (i % 8) };
    const e = espiar(panel());
    estructuras.push(s); geom.set(s, e.g); espias.push(e.lecturas);
  }

  const sandbox = {
    Math, console, MC_TILE: T, MC_HW, MC_PH,
    mc: { grid, pos: [16.5, 8, 16.5], scale: 1, structures: estructuras },
    mcInside: (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < DIM.x && y < DIM.y && z < DIM.z,
    mcIdx: idx,
    mcStructColl: (s) => geom.get(s),
  };
  vm.createContext(sandbox);
  // mcPushBoxEdges, no mcPushBoxTris: desde REQ-XR1 el volumen son ARISTAS. Si algún día vuelve a
  // haber relleno hay que cambiar las dos cosas a la vez, el extraer() y el VBOX de aquí abajo.
  vm.runInContext(extraer('mcPushBoxEdges') + extraer('mcFineBoxHit') + extraer('mcFineSolidAt') +
                  extraer('mcXrayVolume'), sandbox);

  // La version INGENUA de antes, punto por punto, como referencia de lo que hay que dibujar.
  sandbox.ingenua = () => {
    const p = sandbox.mc.pos, HW = MC_HW * sandbox.mc.scale, PH = MC_PH * sandbox.mc.scale, M = 0.35;
    const fx0 = Math.floor((p[0] - HW - M) * T), fx1 = Math.floor((p[0] + HW + M) * T);
    const fy0 = Math.floor((p[1] - M) * T), fy1 = Math.floor((p[1] + PH + M) * T);
    const fz0 = Math.floor((p[2] - HW - M) * T), fz1 = Math.floor((p[2] + HW + M) * T);
    const out = new Set();
    for (let x = fx0; x <= fx1; x++) for (let y = fy0; y <= fy1; y++) for (let z = fz0; z <= fz1; z++)
      if (sandbox.mcFineSolidAt(x, y, z)) out.add(x + ',' + y + ',' + z);
    return out;
  };
  // Los voxels finos que DIBUJA app.js hoy: cajas NARANJAS (1, 0.55, 0.1) del array de triangulos.
  // Las rojas (0.95, 0.2, 0.2) son bloques de la rejilla y aqui no pintan nada.
  sandbox.dibujadas = () => {
    const a = []; sandbox.mcXrayVolume(a);
    const ESTR = 7, VBOX = 24, out = new Set();   // 12 aristas × 2 vértices (era 36 = 12 tris × 3)
    for (let i = 0; i < a.length; i += ESTR * VBOX) {
      if (Math.abs(a[i + 3] - 1) > 1e-6 || Math.abs(a[i + 4] - 0.55) > 1e-6) continue;
      out.add(Math.round(a[i] * T) + ',' + Math.round(a[i + 1] * T) + ',' + Math.round(a[i + 2] * T));
    }
    return out;
  };
  sandbox.espias = espias;
  return sandbox;
}

const iguales = (a, b) => a.size === b.size && [...a].every(v => b.has(v));

// ── 1. Dibuja lo mismo que la version ingenua ──────────────────────────────────
console.log('\nRayos-X dibuja EXACTAMENTE los mismos voxels finos que preguntando uno a uno');
{
  for (const esc of [1, 4]) for (const dz of [0, 0.4, -0.6]) {
    const w = montar();
    w.mc.scale = esc; w.mc.pos = [16.5, 8, 16.5 + dz];
    const i = w.ingenua(), d = w.dibujadas();
    t('escala ' + esc + ', z ' + (16.5 + dz).toFixed(1) + ': mismo conjunto de voxels',
      iguales(i, d), i.size + ' voxels');
  }
  const w = montar({ macizo: true });
  const i = w.ingenua(), d = w.dibujadas();
  t('y con una estructura 16³ maciza tambien (el peor caso)', iguales(i, d), i.size + ' voxels');
}

// ── 2. Ya no se pregunta voxel a voxel ─────────────────────────────────────────
console.log('\nEl coste ya no es |caja del jugador| x |estructuras|');
{
  const w = montar();
  let llamadas = 0;
  const real = w.mcFineSolidAt;
  w.mcFineSolidAt = (x, y, z) => { llamadas++; return real(x, y, z); };
  w.mcXrayVolume([]);
  t('mcXrayVolume no llama a mcFineSolidAt ni una sola vez', llamadas === 0, llamadas + ' llamadas');

  // Con el jugador a escala 4 la caja crece x64 en voxels finos. Si el barrido fuera por voxel, el
  // trabajo se multiplicaria por 64 aunque no haya mas geometria cerca; con el recorte, no.
  const chico = montar({ sinCerca: true, lejos: 1 });
  chico.mcXrayVolume([]);
  const grande = montar({ sinCerca: true, lejos: 1 });
  grande.mc.scale = 4;
  grande.mcXrayVolume([]);
  t('el jugador a escala 4 no multiplica el trabajo si no hay geometria cerca',
    chico.espias[0].n === 0 && grande.espias[0].n === 0,
    'lecturas escala 1: ' + chico.espias[0].n + ', escala 4: ' + grande.espias[0].n);
}

// ── 3. Las estructuras lejanas no cuestan ──────────────────────────────────────
console.log('\nUna estructura al otro lado del mundo no se toca');
{
  const w = montar({ lejos: 200 });
  const d = w.dibujadas();
  const leidas = w.espias.reduce((n, e) => n + e.n, 0);
  t('200 estructuras lejos: ni una lectura de sus voxels', leidas === 0, leidas + ' lecturas');
  t('y lo que se dibuja es solo la escalera de al lado', iguales(w.ingenua(), d), d.size + ' voxels');
}

console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);