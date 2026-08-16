// @area: render
// @necesita: node
// REQ-ENV5 · Reflejos realistas en fluidos: reflejar objetos del entorno, nubes y terreno en la superficie del agua

const fs = require('fs');
const path = require('path');

let okCount = 0, failCount = 0;
function ok(cond, msg, extra) {
  if (cond) { okCount++; console.log('  ok  ' + msg + (extra ? '   · ' + extra : '')); }
  else { failCount++; console.log('  FALLA ' + msg + (extra ? '   · ' + extra : '')); }
}

console.log('=== TEST REQ-ENV5 · Reflejos realistas del entorno en fluidos ===\n');

// 1. Cargar contexto simulado de app.js
const appCode = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');

console.log('§1 Verificación estática de shaders y uniformes en app.js');
ok(appCode.includes('uniform sampler2D uReflTex;'), 'MC_STRUCT_FS incluye sampler2D uReflTex');
ok(appCode.includes('uniform float uReflEntorno;'), 'MC_STRUCT_FS incluye float uReflEntorno');
ok(appCode.includes('uniform vec2 uScreenSize;'), 'MC_STRUCT_FS incluye vec2 uScreenSize');
ok(appCode.includes('uniform float uReflOndas;'), 'MC_STRUCT_FS incluye float uReflOndas');
ok(appCode.includes('uniform float uReflSubacuatico;'), 'MC_STRUCT_FS incluye float uReflSubacuatico');
ok(appCode.includes('uniform float uReflAbsorcion;'), 'MC_STRUCT_FS incluye float uReflAbsorcion');
ok(appCode.includes('uReflTex:gl.getUniformLocation(p,\'uReflTex\')'), 'mcBuildStructProgram mapea uReflTex');
ok(appCode.includes('uReflEntorno:gl.getUniformLocation(p,\'uReflEntorno\')'), 'mcBuildStructProgram mapea uReflEntorno');
ok(appCode.includes('uScreenSize:gl.getUniformLocation(p,\'uScreenSize\')'), 'mcBuildStructProgram mapea uScreenSize');
ok(appCode.includes('uReflOndas:gl.getUniformLocation(p,\'uReflOndas\')'), 'mcBuildStructProgram mapea uReflOndas');
ok(appCode.includes('uReflSubacuatico:gl.getUniformLocation(p,\'uReflSubacuatico\')'), 'mcBuildStructProgram mapea uReflSubacuatico');
ok(appCode.includes('uReflAbsorcion:gl.getUniformLocation(p,\'uReflAbsorcion\')'), 'mcBuildStructProgram mapea uReflAbsorcion');

console.log('\n§2 Verificación de funciones de reflejo planar en app.js');
ok(appCode.includes('function mcInitRefl()'), 'Existe mcInitRefl');
ok(appCode.includes('function mcFreeRefl()'), 'Existe mcFreeRefl');
ok(appCode.includes('function mcReflTexDummy()'), 'Existe mcReflTexDummy');
ok(appCode.includes('function mcDetectWaterY()'), 'Existe mcDetectWaterY');
ok(appCode.includes('function mcRenderRefl('), 'Existe mcRenderRefl');

console.log('\n§3 Verificación de geometría de la cámara especular (matemática de reflexión planar)');
// Simulación de matrices para verificar que un punto en el plano de agua proyecta a las mismas coordenadas de pantalla
const mat4 = {
  ident(){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  mul(a,b){ const o=new Float32Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++){ let s=0; for(let k=0;k<4;k++) s+=a[k*4+r]*b[c*4+k]; o[c*4+r]=s; }
    return o; },
  perspective(fovy,aspect,near,far){ const f=1/Math.tan(fovy/2), nf=1/(near-far);
    return new Float32Array([ f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0 ]); },
  translate(x,y,z){ const m=mat4.ident(); m[12]=x; m[13]=y; m[14]=z; return m; },
  rotX(a){ const c=Math.cos(a),s=Math.sin(a); const m=mat4.ident(); m[5]=c;m[6]=s;m[9]=-s;m[10]=c; return m; },
  rotY(a){ const c=Math.cos(a),s=Math.sin(a); const m=mat4.ident(); m[0]=c;m[2]=-s;m[8]=s;m[10]=c; return m; },
};

function projPoint(m, p) {
  const x = p[0], y = p[1], z = p[2], w = 1.0;
  const cx = m[0]*x + m[4]*y + m[8]*z + m[12]*w;
  const cy = m[1]*x + m[5]*y + m[9]*z + m[13]*w;
  const cz = m[2]*x + m[6]*y + m[10]*z + m[14]*w;
  const cw = m[3]*x + m[7]*y + m[11]*z + m[15]*w;
  return [cx / cw, cy / cw, cz / cw];
}

const waterY = 14;
const eyePos = [20, 18, 30];
const yaw = 0.4, pitch = -0.3; // mirando hacia abajo hacia el agua
const proj = mat4.perspective(Math.PI / 3, 16 / 9, 0.1, 100);

const viewOrig = mat4.mul(mat4.rotX(-pitch), mat4.mul(mat4.rotY(-yaw), mat4.translate(-eyePos[0], -eyePos[1], -eyePos[2])));
const pvOrig = mat4.mul(proj, viewOrig);

// Cámara reflejada
const mirrEyeY = 2 * waterY - eyePos[1];
const mirrPitch = -pitch;
const viewRefl = mat4.mul(mat4.rotX(-mirrPitch), mat4.mul(mat4.rotY(-yaw), mat4.translate(-eyePos[0], -mirrEyeY, -eyePos[2])));
const pvRefl = mat4.mul(proj, viewRefl);

// Punto arbitrario en la superficie del agua
const waterP = [22, waterY, 25];
const ndcOrig = projPoint(pvOrig, waterP);
const ndcRefl = projPoint(pvRefl, waterP);

const diffX = Math.abs(ndcOrig[0] - ndcRefl[0]);
// En NDC la coordenada Y se invierte (-y), que al pasar a UV de textura (suv.y = 1.0 - suvOrig.y) calza 1:1
const suvOrigY = ndcOrig[1] * 0.5 + 0.5;
const suvReflY = ndcRefl[1] * 0.5 + 0.5;
const diffY = Math.abs(suvOrigY - (1.0 - suvReflY));
ok(diffX < 1e-4, 'Coordenada X en pantalla coincide exactamente entre cámara real y reflejada', 'Δx=' + diffX);
ok(diffY < 1e-4, 'Coordenada Y en textura (1.0 - suv.y) mapea exactamente al punto de reflexión', 'Δy=' + diffY);

console.log('\n§4 Verificación de los tunables de consola (game.reflejoEntorno, game.reflejoOndas, game.reflejoPlanoY, game.reflejoSubacuatico)');
const sandbox = {
  game: {},
  MC_SKY: [0.5, 0.7, 1.0],
  MC_EYE: 1.62,
  console: { log: ()=>{}, warn: ()=>{} }
};

const sliceCode = appCode.slice(appCode.indexOf('const MC_AGUA_REFLEJO_DEF'), appCode.indexOf('game.cieloColor = function'));
const fnSetup = new Function('sandbox', `
  with(sandbox) {
    ${sliceCode}
  }
`);
try {
  fnSetup(sandbox);
  const g = sandbox.game;
  ok(typeof g.reflejoEntorno === 'function', 'game.reflejoEntorno existe');
  ok(typeof g.reflejoOndas === 'function', 'game.reflejoOndas existe');
  ok(typeof g.reflejoPlanoY === 'function', 'game.reflejoPlanoY existe');
  ok(typeof g.reflejoBase === 'function', 'game.reflejoBase existe');
  ok(typeof g.reflejoCausticas === 'function', 'game.reflejoCausticas existe');
  ok(typeof g.reflejoSubacuatico === 'function', 'game.reflejoSubacuatico existe');
  ok(typeof g.reflejoAbsorcion === 'function', 'game.reflejoAbsorcion existe');

  g.reflejoEntorno(false);
  ok(g.reflejoEntorno() === 0, 'reflejoEntorno(false) apaga a 0');
  g.reflejoEntorno(true);
  ok(g.reflejoEntorno() === 1, 'reflejoEntorno(true) enciende a 1');

  g.reflejoOndas(2.5);
  ok(g.reflejoOndas() === 2.5, 'reflejoOndas fija 2.5');
  g.reflejoOndas(25);
  ok(g.reflejoOndas() === 25, 'reflejoOndas permite subir a más de 10 (ej. 25)');

  g.reflejoBase(0.2);
  ok(g.reflejoBase() === 0.2, 'reflejoBase fija 0.2');

  g.reflejoCausticas(1.5);
  ok(g.reflejoCausticas() === 1.5, 'reflejoCausticas fija 1.5');

  g.reflejoSubacuatico(2.0);
  ok(g.reflejoSubacuatico() === 2.0, 'reflejoSubacuatico fija 2.0');
  g.reflejoSubacuatico(false);
  ok(g.reflejoSubacuatico() === 0, 'reflejoSubacuatico(false) apaga a 0');

  g.reflejoAbsorcion(2.0);
  ok(g.reflejoAbsorcion() === 2.0, 'reflejoAbsorcion fija 2.0');
  g.reflejoAbsorcion(false);
  ok(g.reflejoAbsorcion() === 0, 'reflejoAbsorcion(false) apaga a 0');

  const py = g.reflejoPlanoY(12);
  ok(py === 12, 'reflejoPlanoY fija 12', 'obtenido: ' + py);
  ok(g.reflejoPlanoY('auto') === null, 'reflejoPlanoY("auto") vuelve a null');

  const r = g.reflejoAgua('reset');
  ok(r.fuerza === 0.65, 'reflejoAgua("reset") restaura fuerza a 0.65');
  ok(r.curva === 3.0, 'reflejoAgua("reset") restaura curva a 3.0');
  ok(r.opacidad === 0.95, 'reflejoAgua("reset") restaura opacidad a 0.95');
  ok(r.base === 0.2, 'reflejoAgua("reset") restaura base a 0.2');
  ok(r.entorno === 0.7, 'reflejoAgua("reset") restaura entorno a 0.7');
  ok(r.ondas === 1, 'reflejoAgua("reset") restaura ondas a 1');
  ok(r.causticas === 0.05, 'reflejoAgua("reset") restaura causticas a 0.05');
  ok(r.subacuatico === 0.5, 'reflejoAgua("reset") restaura subacuatico a 0.5');
  ok(r.absorcion === 1, 'reflejoAgua("reset") restaura absorcion a 1');
} catch (e) {
  ok(false, 'Error ejecutando tunables de reflejo: ' + e.message);
}

console.log(failCount ? ('\n' + failCount + ' FALLOS') : '\nTODO OK');
process.exit(failCount ? 1 : 0);
