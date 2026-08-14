// Sonda pura (Node, sin navegador) — verifica el arreglo de BUG-RS19 en mcRecFina.
//
// Replica del calculo de mcStructCells (app.js:6325) sobre cada asset y lo pasa por las dos versiones
// de mcRecFina: la VIEJA (que dejaba al observador fuera) y la NUEVA. Confirma que:
//   · con la NUEVA, el observador es fino  (⇒ mcEsFinaEnRejilla=true ⇒ cabe girado)
//   · con la VIEJA, el observador NO era fino (⇒ el bug del ticket)
//   · los perfiles vecinos (cubo-trans, agua, hierba, flor, hierba-alta) no cambian
const fs = require('fs');
const path = require('path');
const T = 16, T2 = T * T;

function colorAlpha(v) {
  if (typeof v !== 'string' || v.length < 9) return 1;
  const s = v[0] === '*' ? v.slice(1) : v;
  if (s.length === 9 || s.length === 10) {
    const a = parseInt(s.slice(7, 9), 16);
    if (Number.isFinite(a)) return a / 255;
  }
  return 1;
}

function perfil(archivo) {
  const j = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const src = j.voxels || {};
  const pX = new Uint8Array(T2), pY = new Uint8Array(T2), pZ = new Uint8Array(T2);
  let w = 0, h = 0, d = 0, nvox = 0, translucido = false;
  const seen = new Set();
  for (const k in src) {
    const p = k.split(','), ax = +p[0], ay = +p[1], az = +p[2], v = src[k];
    if (v == null) continue;
    nvox++;
    if (ax >= 0 && ay >= 0 && az >= 0 && ax < T && ay < T && az < T) {
      pX[ay * T + az] = 1; pY[ax * T + az] = 1; pZ[ax * T + ay] = 1;
    }
    if (!translucido && typeof v === 'string' && v.length >= 9 && colorAlpha(v) < 1) translucido = true;
    // celdas de 16³
    const cx = Math.floor(ax / T), cy = Math.floor(az / T), cz = Math.floor(ay / T);
    const ck = cx + ',' + cy + ',' + cz;
    if (!seen.has(ck)) seen.add(ck);
    if (cx + 1 > w) w = cx + 1;
    if (cy + 1 > h) h = cy + 1;
    if (cz + 1 > d) d = cz + 1;
  }
  const conCaras = !!(j.caras && Object.keys(j.caras).length);
  let nX = 0, nY = 0, nZ = 0;
  for (let i = 0; i < T2; i++) { nX += pX[i]; nY += pY[i]; nZ += pZ[i]; }
  const pielCubre = (w <= 1 && h <= 1 && d <= 1 && nX === T2 && nY === T2 && nZ === T2);
  const blockLike = (w <= 1 && h <= 1 && d <= 1 && nvox >= T * T * T && !translucido && !conCaras && !j.atravesable);
  return { archivo: path.basename(archivo), w, h, d, nvox, translucido, conCaras, pielCubre, blockLike, atravesable: !!j.atravesable };
}

// las dos versiones de mcRecFina, para el A/B
function recFinaVieja(r) {
  if (!r || r.w == null) return false;
  if (r.w > 1 || r.h > 1 || r.d > 1) return false;
  if (r.blockLike) return false;
  if (!r.pielCubre) return true;
  return !!r.translucido && !r.conCaras;
}
function recFinaNueva(r) {
  if (!r || r.w == null) return false;
  if (r.w > 1 || r.h > 1 || r.d > 1) return false;
  if (r.blockLike) return false;
  if (!r.pielCubre) return true;
  return !r.conCaras;
}

const casos = [
  { ruta: 'assets/observador.vox.json',      esperado: true,  motivo: 'BUG-RS19: casi macizo (4092 vox), pielCubre, ni translucido ni caras' },
  { ruta: 'assets/observador-on.vox.json',   esperado: true,  motivo: 'la variante encendida vive igual: si una gira, la otra tambien' },
  { ruta: 'assets/bloque_redstone.vox.json', esperado: false, motivo: 'macizo estricto (4096 vox): blockLike, proyeccion al cubo' },
  { ruta: 'assets/cubo-trans.vox.json',      esperado: true,  motivo: 'BUG-STR1: translucido, sigue por ruta fina' },
  { ruta: 'assets/lava.vox.json',            esperado: false, motivo: '16³ macizo opaco: blockLike, proyeccion' },
  { ruta: 'assets/hierba.vox.json',          esperado: false, motivo: '16³ macizo opaco: blockLike, proyeccion' },
  { ruta: 'assets/hierba-alta.vox.json',     esperado: true,  motivo: 'pielCubre=false: pieza fina desde siempre' },
  { ruta: 'data/habitantes/cable.json',      esperado: true,  motivo: 'pielCubre=false: pieza fina desde siempre' },
  { ruta: 'data/habitantes/repetidor.json',  esperado: true,  motivo: 'idem' },
  { ruta: 'data/habitantes/piston.json',     esperado: true,  motivo: 'idem' },
];

let fallos = 0;
console.log(''.padEnd(38) + '|      vieja         |      nueva      | veredicto');
console.log(''.padEnd(38) + '| pielC  block  fina | pielC  block  fina|');
console.log('-'.repeat(103));
for (const c of casos) {
  try {
    const r = perfil(c.ruta);
    const fv = recFinaVieja(r);
    const fn = recFinaNueva(r);
    const ok = fn === c.esperado;
    if (!ok) fallos++;
    const row = path.basename(c.ruta).padEnd(38) +
      '| ' + String(r.pielCubre).padEnd(6) + String(r.blockLike).padEnd(7) + String(fv).padEnd(6) +
      '| ' + String(r.pielCubre).padEnd(6) + String(r.blockLike).padEnd(7) + String(fn).padEnd(6) +
      '| ' + (ok ? 'OK' : 'FALLA') + ' — ' + c.motivo;
    console.log(row);
  } catch (e) {
    fallos++;
    console.log(path.basename(c.ruta).padEnd(38) + '| ERROR: ' + e.message);
  }
}
console.log('-'.repeat(103));
console.log('\n== CAMBIOS de VIEJA→NUEVA (solo el observador debe moverse) ==');
for (const c of casos) {
  try {
    const r = perfil(c.ruta);
    const fv = recFinaVieja(r), fn = recFinaNueva(r);
    if (fv !== fn) console.log(' * ' + path.basename(c.ruta) + ': ' + fv + ' → ' + fn);
  } catch (e) {}
}
console.log('\n' + (fallos ? 'FALLOS: ' + fallos : 'TODO OK'));
process.exit(fallos ? 1 : 0);
