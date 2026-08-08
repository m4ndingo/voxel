// @area: editor
// @necesita: node
// Arnes headless para el RAYO DE APUNTADO del Mundo (mcRaycast / mcStructRayHit de app.js).
//
// Extrae las funciones VERBATIM de app.js y las corre contra un mundo de juguete. Lo que se comprueba
// es que el rayo NO se pare en la caja de una estructura donde solo hay aire: una escalera es casi
// toda hueco dentro de su celda, y darla por solida entera hacia que el bloque nuevo saliera flotando
// delante de ella en vez de pegarse a la pared del fondo, que es donde se estaba apuntando.
'use strict';
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
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
// Pared maciza de rejilla en x=10. Delante, en la celda x=9, una escalera fina (1/16 de grosor)
// pegada a la cara de la pared: largueros en los bordes y peldanos en 2 de cada 4 filas, igual que
// el escalera.json de verdad. El ojo mira en +X desde x=5.
const T = 16, DIM = { x: 24, y: 24, z: 24 };
const ID_ROCA = 1;

function montar(opciones = {}) {
  const grid = new Uint16Array(DIM.x * DIM.y * DIM.z);
  const idx = (x, y, z) => x + y * DIM.x + z * DIM.x * DIM.y;
  for (let y = 0; y < DIM.y; y++) for (let z = 0; z < DIM.z; z++) grid[idx(10, y, z)] = ID_ROCA;  // la pared del fondo

  // Escalera fina: panel YZ de 1 voxel de grosor en x, en el ULTIMO voxel fino de la celda x=9,
  // o sea pegada a la cara de la pared.
  const fdim = [1, T, T];
  const bits = new Uint8Array(fdim[0] * fdim[1] * fdim[2]);
  const lleno = (y, z) => (y % 4 === 1 || y % 4 === 2) || z < 2 || z >= T - 2;   // peldanos + largueros
  for (let y = 0; y < T; y++) for (let z = 0; z < T; z++) if (lleno(y, z)) bits[(y * fdim[2] + z) * fdim[0]] = 1;

  const sandbox = {
    Math, console, MC_TILE: T,
    mc: {
      grid, pos: [5, 8, 8.5], pitch: 0, yaw: -Math.PI / 2, scale: 1,   // yaw=-PI/2 => mirando a +X
      structures: opciones.sinEscalera ? [] : [{ key: 'hab:escalera', ox: 9, oy: 8, oz: 8, fx: T - 1 }],
    },
    MC_EYE: 1.6,
    mcReach: () => 8,
    mcInside: (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < DIM.x && y < DIM.y && z < DIM.z,
    mcIdx: idx,
    // La estructura vive en el ultimo voxel fino de su celda: se desplaza ox a fino y se suma fx.
    mcStructColl: (s) => ({ fdim, bits }),
  };
  // ox/oy/oz de mcFineBoxHit estan en CELDAS; el panel ocupa el voxel fino T-1 dentro de la celda x=9,
  // asi que se monta como una estructura cuyo origen fino ya incluye ese desplazamiento.
  sandbox.mc.structures.forEach(s => { s.ox = 9 + (T - 1) / T; });
  vm.createContext(sandbox);
  vm.runInContext(
    extraer('mcSolid') + extraer('mcFineBoxHit') + extraer('mcFineSolidAt') +
    // El apuntado va por sus propias sondas (leen bitsAim, no bits); el mcStructColl de juguete de arriba
    // solo trae `bits`, que es justo el caso «g fabricado por un tercero» que el `||` tiene que aguantar.
    extraer('mcAimBoxHit') + extraer('mcAimSolidAt') +
    extraer('mcRaycast') + extraer('mcStructRayHit') + extraer('mcStructCellSolid'), sandbox);
  return sandbox;
}

// ── 1. El rayo pasa por los huecos de la escalera ──────────────────────────────
console.log('\nEl rayo atraviesa el aire de una estructura y llega a la pared del fondo');
{
  const w = montar();
  // Altura de un HUECO entre peldanos: y%4 === 0 o 3, y con z en el centro (fuera de los largueros).
  // El ojo esta en y=8+1.6=9.6 => voxel fino y=153 => 153%16=9, 9%4=1 => eso es peldano. Se busca un hueco.
  let yHueco = null;
  for (let fy = 8 * T; fy < 9 * T; fy++) { const r = (fy - 8 * T) % 4; if (r === 0 || r === 3) { yHueco = fy; break; } }
  w.mc.pos[1] = yHueco / T + 0.01 - MC_EYE_DE(w);
  const hit = w.mcRaycast(8, true);
  t('el rayo llega a la pared de rejilla, no a la caja de la escalera',
    hit && hit.cell[0] === 10, hit ? 'celda x=' + hit.cell[0] + ' fina=' + hit.fina : 'sin impacto');
  t('y la normal apunta hacia el jugador, para pegar el bloque a la pared',
    hit && hit.normal[0] === -1, hit ? 'normal=' + JSON.stringify(hit.normal) : 'sin impacto');
  t('el bloque nuevo iria pegado a la pared (x=9), no flotando',
    hit && hit.cell[0] + hit.normal[0] === 9, hit ? 'x=' + (hit.cell[0] + hit.normal[0]) : 'sin impacto');
  // Fija la regresion: la celda de la escalera SI da solida por AABB (es lo que miraba el codigo viejo
  // y por lo que el rayo se paraba ahi), pero el rayo NO cruza ningun voxel fino lleno. Si algun dia
  // estas dos vuelven a coincidir, el bloque flotante ha vuelto.
  const oy = Math.floor(w.mc.pos[1] + MC_EYE_DE(w));
  t('la caja de la escalera si es solida (es la trampa del codigo viejo)',
    w.mcStructCellSolid(9, oy, 8) === true);
  t('pero el rayo no cruza ningun voxel fino lleno de esa celda',
    w.mcStructRayHit(9, oy, 8, [w.mc.pos[0], w.mc.pos[1] + MC_EYE_DE(w), w.mc.pos[2]], [1, 0, 0], 4) === -1);
}
function MC_EYE_DE(w) { return 1.6 * w.mc.scale; }

// ── 2. Apuntando a un peldano SI se para en la escalera ────────────────────────
console.log('\nApuntando a un peldano el rayo si se para en la escalera');
{
  const w = montar();
  let yLleno = null;
  for (let fy = 8 * T; fy < 9 * T; fy++) { const r = (fy - 8 * T) % 4; if (r === 1) { yLleno = fy; break; } }
  w.mc.pos[1] = yLleno / T + 0.03 - MC_EYE_DE(w);
  const hit = w.mcRaycast(8, true);
  t('se para en la celda de la escalera', hit && hit.cell[0] === 9,
    hit ? 'celda x=' + hit.cell[0] : 'sin impacto');
  t('y marca que el impacto fue en geometria fina', hit && hit.fina === true,
    hit ? 'fina=' + hit.fina : 'sin impacto');
}

// ── 3. Sin hitStruct la estructura es invisible al rayo ────────────────────────
console.log('\nSin hitStruct el rayo ignora las estructuras por completo');
{
  const w = montar();
  const hit = w.mcRaycast(8, false);
  t('llega siempre a la pared', hit && hit.cell[0] === 10, hit ? 'celda x=' + hit.cell[0] : 'sin impacto');
}

// ── 4. El impacto trae punto y distancia ───────────────────────────────────────
console.log('\nEl impacto trae el punto exacto y la distancia');
{
  const w = montar({ sinEscalera: true });
  const hit = w.mcRaycast(8, true);
  t('la distancia es la que hay hasta la cara de la pared', hit && Math.abs(hit.dist - 5) < 1e-6,
    hit ? 'dist=' + hit.dist.toFixed(4) : 'sin impacto');
  t('el punto cae exactamente en la cara x=10', hit && Math.abs(hit.point[0] - 10) < 1e-6,
    hit ? 'x=' + hit.point[0].toFixed(4) : 'sin impacto');
  t('y el punto esta sobre el rayo, a la altura del ojo', hit && Math.abs(hit.point[1] - (w.mc.pos[1] + 1.6)) < 1e-6,
    hit ? 'y=' + hit.point[1].toFixed(4) : 'sin impacto');
}

// ── 5. Nada delante: sin impacto ───────────────────────────────────────────────
console.log('\nSin nada al alcance no hay impacto');
{
  const w = montar({ sinEscalera: true });
  w.mc.yaw = Math.PI / 2;                                    // mirando a -X, hacia el vacio
  const hit = w.mcRaycast(4, true);
  t('devuelve null', hit === null, 'hit=' + JSON.stringify(hit));
}

console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);