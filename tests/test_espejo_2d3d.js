// GUARDIÁN · las cuatro vistas del editor tienen que mirar el modelo DESDE EL MISMO LADO.
//
// Queja del dueño (2026-08-25): «*hay una discrepancia entre el editor 2d y 3d, los dibujos salen
// espejados: como se diseña en la vista 2d, al ir a la vista 3d sale espejado; si es de izq→der sale de
// der→izq*». No era un espejo: el botón «Frontal» ponía `view3d.yaw = 0`, y con yaw=0 la profundidad de
// +Y sale POSITIVA (+Y se aleja) ⇒ la cámara queda en −Y, asomada por el borde de ARRIBA del plano de
// Capas, y desde ahí la izquierda y la derecha se cambian. El arreglo es `MC_FRONTAL_YAW = Math.PI`.
//
// Esto lo vigila para siempre: NO reimplementa el editor, LEE los tres números de web/app.js (el yaw del
// «Frontal» y el yaw/pitch de la vista libre) y comprueba con las fórmulas del motor —copiadas abajo
// VERBATIM— que un voxel que en 2D cae a la derecha cae a la derecha en las cuatro vistas.
//
// Si alguien devuelve el «Frontal» a 0 (o toca el `-x1` de project3d creyendo que ÉSE era el espejo,
// que no lo es), este guardián se pone rojo.
//
//     node tests/test_espejo_2d3d.js
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'web', 'app.js');
const src = fs.readFileSync(APP, 'utf8');

let ok = 0, fallos = 0;
function comprueba(que, cond, detalle) {
  if (cond) { ok++; console.log('  ok  ' + que + (detalle ? '   · ' + detalle : '')); }
  else { fallos++; console.log('  FALLA  ' + que + (detalle ? '   · ' + detalle : '')); }
}

// ── los números, leídos de app.js ───────────────────────────────────────────────────────────────────
const mFrontal = src.match(/const\s+MC_FRONTAL_YAW\s*=\s*([^;]+);/);
const mLibre = src.match(/const\s+view3d\s*=\s*\{\s*yaw:\s*(-?[\d.]+)\s*,\s*pitch:\s*(-?[\d.]+)/);
const mToggle = src.match(/camSaved=\{yaw:view3d\.yaw,\s*pitch:view3d\.pitch\};\s*view3d\.yaw=([^;]+);\s*view3d\.pitch=([^;]+);/);
const mRotP = src.match(/const\s+x1\s*=\s*X\*cy\s*-\s*Y\*sy,\s*y1\s*=\s*X\*sy\s*\+\s*Y\*cy;\s*\n\s*return\s*\[(-?x1)/);

console.log('\n§0 · los tres números siguen donde el guardián sabe leerlos');
comprueba('MC_FRONTAL_YAW está declarada', !!mFrontal, mFrontal && mFrontal[1].trim());
comprueba('view3d trae yaw/pitch de la vista libre', !!mLibre, mLibre && (mLibre[1] + ' / ' + mLibre[2]));
comprueba('toggleCamFront usa MC_FRONTAL_YAW, no un número suelto',
  !!mToggle && mToggle[1].trim() === 'MC_FRONTAL_YAW', mToggle && mToggle[1].trim());
comprueba('project3d sigue con su `-x1` (NO es el espejo: quitarlo rompe las otras tres vistas)',
  !!mRotP, mRotP && mRotP[1]);
if (!mFrontal || !mLibre || !mToggle) {
  console.log('\n' + ok + ' ok / ' + (fallos + 1) + ' fallos  ·  no se puede seguir sin esos números');
  process.exit(1);
}

const YAW_FRONTAL = Function('return (' + mFrontal[1] + ')')();
const YAW_LIBRE = parseFloat(mLibre[1]), PITCH_LIBRE = parseFloat(mLibre[2]);
const PITCH_FRONTAL = Function('return (' + mToggle[2] + ')')();

// ── las fórmulas del editor, VERBATIM ───────────────────────────────────────────────────────────────
// 2D · drawEdit:      const px=(x)=>originX+x*cell, py=(y)=>originY+y*cell;
const px2d = (x, cell) => x * cell;
// ISO · drawIsoFaces: const pos=v=>[(v.rx-v.ry)*S+ox, …]     (rot=0 ⇒ rx=x, ry=y)
const pxIso = (x, y, S) => (x - y) * S;
// 3D · project3d/rotP: const x1=X*cy - Y*sy, y1=X*sy + Y*cy;
//                      return [-x1, y1*cp - Z*sp, y1*sp + Z*cp];
function rotP3d(X, Y, Z, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = X * cy - Y * sy, y1 = X * sy + Y * cy;
  return [-x1, y1 * cp - Z * sp, y1 * sp + Z * cp];   // [u(derecha), profundidad(al fondo), w(arriba)]
}

// El modelo: una marca en la punta del brazo que va hacia +X. En Capas cae claramente a la DERECHA del
// centro; eso es lo que el dueño dibuja y lo que las demás vistas tienen que respetar.
const C = { x: 2, y: 2, z: 0 }, M = { x: 5, y: 0, z: 0 };
const lado = v => v > 1e-6 ? 'DERECHA' : (v < -1e-6 ? 'IZQUIERDA' : 'centro');
const u3d = (yaw, pitch) => rotP3d(M.x - C.x, M.y - C.y, M.z - C.z, yaw, pitch)[0];
// Profundidad de +Y = rotP(0,1,0)[1] = cos(yaw)·cos(pitch). Negativa ⇒ +Y viene HACIA la cámara ⇒ se
// mira el modelo desde el mismo lado que en Capas.
const dY = (yaw, pitch) => Math.cos(yaw) * Math.cos(pitch);

console.log('\n§1 · la referencia: en Capas (2D) la marca cae a la DERECHA');
{
  const d = px2d(M.x, 10) - px2d(C.x, 10);
  comprueba('2D · marca a la derecha', d > 0, 'dx=' + d.toFixed(2) + ' → ' + lado(d));
}

console.log('\n§2 · la miniatura iso coincide');
{
  const d = pxIso(M.x, M.y, 10) - pxIso(C.x, C.y, 10);
  comprueba('iso · marca a la derecha', d > 0, 'dx=' + d.toFixed(2) + ' → ' + lado(d));
}

console.log('\n§3 · la vista 3D libre por defecto coincide');
{
  const u = u3d(YAW_LIBRE, PITCH_LIBRE), d = dY(YAW_LIBRE, PITCH_LIBRE);
  comprueba('3D libre · marca a la derecha', u > 0, 'u=' + u.toFixed(3) + ' → ' + lado(u));
  comprueba('3D libre · se mira desde el lado de Capas (+Y hacia la cámara)', d < 0, 'profundidad(+Y)=' + d.toFixed(3));
}

console.log('\n§4 · el botón «Frontal» coincide — AQUÍ estaba el fallo que veía el dueño');
{
  const u = u3d(YAW_FRONTAL, PITCH_FRONTAL), d = dY(YAW_FRONTAL, PITCH_FRONTAL);
  comprueba('3D frontal · marca a la derecha, como en Capas', u > 0,
    'yaw=' + YAW_FRONTAL.toFixed(4) + '  u=' + u.toFixed(3) + ' → ' + lado(u));
  comprueba('3D frontal · se mira desde el lado de Capas (+Y hacia la cámara)', d < 0,
    'profundidad(+Y)=' + d.toFixed(3) + (d > 0 ? '  ⇒ la cámara está en −Y: el «Frontal» volvió a 0' : ''));
  comprueba('3D frontal · sigue siendo ortogonal de frente (pitch 0)', PITCH_FRONTAL === 0, 'pitch=' + PITCH_FRONTAL);
}

console.log('\n' + ok + ' ok / ' + fallos + ' fallos' + (fallos ? '' : '  ·  TODO OK'));
process.exit(fallos ? 1 : 0);
