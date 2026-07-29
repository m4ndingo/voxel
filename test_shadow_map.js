// Verificación headless del MAPA DE SOMBRA del sol vertical (app.js).
// No hay GPU aquí, así que se comprueban las dos cosas que sí se pueden comprobar sin ella:
//   1) COHERENCIA DE LOS SHADERS: que cada varying que usa un fragment shader lo escriba su vertex shader, y que
//      cada uniforme que se busca con getUniformLocation exista en el fuente. Son los fallos que de verdad pasan
//      (un varying que falta compila como error, un uniforme mal escrito da null y falla en silencio).
//   2) EL ALGORITMO: un puerto del mapa de altura + sunFactor, con las CONSTANTES LEIDAS DE app.js (no copiadas),
//      sobre la escena exacta de la captura que reporto el dueno: suelo llano, un cubo encima y una nube tapando.
// Escenarios sacados de los fallos reales: «un cubo solo se ve oscurecido por arriba», «salen esquinas de los
// bloques sin sombrear» y «hay zonas mas iluminadas en algunos puntos del suelo junto al bloque».
const fs = require('fs');
const SRC = fs.readFileSync('/root/voxel/app.js', 'utf8');

let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); ok++; console.log('  ok  ' + nombre); }
  catch (e) { fallos++; console.log('FALLO ' + nombre + '\n      ' + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m); }

// ------------------------------------------------------------------ los fuentes GLSL, verbatim de app.js
function glsl(nombre) {
  const m = SRC.match(new RegExp('^const ' + nombre + '=`([\\s\\S]*?)`;', 'm'));
  if (!m) throw new Error('no encuentro ' + nombre + ' en app.js');
  return m[1];
}
const LIB = glsl('MC_SUN_LIB');
const PROGRAMAS = [
  { n: 'terreno',            vs: 'MC_VS',        fs: 'MC_FS',        loc: 'mcLocOf' },
  { n: 'terreno opaco',      vs: 'MC_VS',        fs: 'MC_FS_OPAQUE', loc: 'mcLocOf' },
  { n: 'estructuras',        vs: 'MC_STRUCT_VS', fs: 'MC_STRUCT_FS', loc: 'mcBuildStructProgram' },
  { n: 'estructuras tex',    vs: 'MC_STEX_VS',   fs: 'MC_STEX_FS',   loc: 'mcBuildStructTexProgram' },
];

// ------------------------------------------------------------------ 1 · coherencia de los shaders
test('los cuatro programas consultan el mapa de sombra', () => {
  for (const p of PROGRAMAS) {
    const fsSrc = glsl(p.fs);
    assert(fsSrc.includes('${MC_SUN_LIB}'), p.n + ': su fragment shader no incluye MC_SUN_LIB');
    assert(/sunFactor\(vWorld\)/.test(fsSrc), p.n + ': no llama a sunFactor(vWorld)');
  }
});

test('cada varying del FS lo escribe su VS', () => {
  for (const p of PROGRAMAS) {
    const vsSrc = glsl(p.vs), fsSrc = glsl(p.fs);
    const declara = s => (s.match(/varying\s+(?:highp\s+|mediump\s+|lowp\s+)?\w+\s+(\w+)/g) || [])
      .map(d => d.match(/(\w+)$/)[1]);
    for (const v of declara(fsSrc)) {
      assert(declara(vsSrc).includes(v), p.n + ': el FS declara ' + v + ' y el VS no');
      assert(new RegExp('\\b' + v + '\\s*=').test(vsSrc), p.n + ': el VS declara ' + v + ' pero no lo asigna');
    }
  }
});

test('vWorld es la posicion de MUNDO, no la de vista', () => {
  for (const p of PROGRAMAS) {
    const vsSrc = glsl(p.vs);
    assert(/vWorld\s*=\s*aPos\s*;/.test(vsSrc),
      p.n + ': vWorld deberia ser aPos tal cual (el mapa se indexa en coordenadas de mundo)');
  }
});

test('los uniformes que se buscan existen en el fuente', () => {
  const enLib = ['uSunMap', 'uSunOrg', 'uSunDim', 'uSunShade', 'uEye', 'uSunProbe'];
  for (const u of enLib) assert(new RegExp('uniform[^;]*\\b' + u + '\\b').test(LIB), 'MC_SUN_LIB no declara ' + u);
  // ...y que mcLocOf / los dos mcBuild*Program los piden todos (si no, la localizacion sale null y no se manda nada)
  for (const fn of ['mcLocOf', 'mcBuildStructProgram', 'mcBuildStructTexProgram']) {
    const cuerpo = SRC.slice(SRC.indexOf('function ' + fn), SRC.indexOf('function ' + fn) + 1200);
    for (const u of enLib) assert(cuerpo.includes("'" + u + "'"), fn + ' no busca ' + u);
  }
  // La distancia de la sonda es regulable en vivo: el shader la toma del uniform, no de un literal.
  assert(/vec3 p=w\+n\*uSunProbe;/.test(LIB), 'MC_SUN_LIB no muestrea en w+n*uSunProbe');
  // y que alguien lo suba de verdad en cada frame
  assert(/gl\.uniform1f\(L\.uSunProbe,\s*mc\.sunProbe\)/.test(SRC), 'mcSunUniforms no sube mc.sunProbe');
});

test('el programa del sol solo usa aPos (sirve para los tres formatos de vertice)', () => {
  const vsSrc = glsl('MC_SUN_VS');
  const attrs = (vsSrc.match(/attribute\s+\w+\s+(\w+)/g) || []).map(a => a.match(/(\w+)$/)[1]);
  assert(attrs.length === 1 && attrs[0] === 'aPos', 'el VS del sol usa ' + attrs.join(',') + ' y solo deberia usar aPos');
  // los tres strides con los que se dibuja en la pasada del sol
  const pasada = SRC.slice(SRC.indexOf('function mcRenderShadow'), SRC.indexOf('function mcSunUniforms'));
  for (const st of ['6*4', '9*4', '10*4']) assert(pasada.includes(st), 'la pasada del sol no dibuja con stride ' + st);
});

test('el mapa se muestrea con NEAREST (la altura va empaquetada, interpolarla la inventa)', () => {
  const init = SRC.slice(SRC.indexOf('function mcInitShadow'), SRC.indexOf('function mcFreeShadow'));
  assert((init.match(/gl\.NEAREST/g) || []).length === 2, 'mcInitShadow deberia poner NEAREST en MIN y MAG');
  assert(!/gl\.LINEAR/.test(init), 'hay filtrado LINEAR en el mapa de sombra');
});

test('el pase translucido NO proyecta sombra (un cristal no hace un agujero negro)', () => {
  const pasada = SRC.slice(SRC.indexOf('function mcRenderShadow'), SRC.indexOf('function mcSunUniforms'));
  assert(!/alphaVbo/.test(pasada), 'la pasada del sol dibuja alphaVbo');
  assert(/colVbo/.test(pasada) && /texVbo/.test(pasada), 'la pasada del sol no dibuja las estructuras opacas');
  assert(/mc\.agents/.test(pasada), 'la pasada del sol no dibuja los agentes');
  assert(/mc\.chunks/.test(pasada), 'la pasada del sol no dibuja el terreno');
});

// ------------------------------------------------------------------ 2 · el algoritmo, con las constantes de app.js
// Se leen del GLSL para que cambiar el shader sin tocar el test se note.
// La distancia de la sonda ya no es un literal del shader: es el uniform uSunProbe (game.sunProbe), asi que su
// valor se lee del default de mc y el test de arriba comprueba que el shader lo reciba.
const mOFF = SRC.match(/\n\s*sunProbe:\s*([\d.]+)\s*,/);
if (!mOFF) throw new Error('no se encuentra el default mc.sunProbe en app.js');
const OFF  = parseFloat(mOFF[1]);                                        // cuanto se sale la muestra de la cara
const BIAS = parseFloat(LIB.match(/p\.y\s*<\s*top-([\d.]+)/)[1]);         // margen contra el acne
const DIM  = { x: 96, y: 40, z: 96 };
// El volumen del sol NO es el mundo: mcSunFrustum le añade MC_SUN_MARGIN a los lados (y hueco arriba) para que
// lo que sobresale del terreno tambien quede registrado. El mapa se indexa con origen + tamano, no con mc.dim.
const MARGEN = parseFloat(SRC.match(/const MC_SUN_MARGIN\s*=\s*([\d.]+)/)[1]);
const ORG  = { x: -MARGEN,          y: -1,               z: -MARGEN };
const SPAN = { x: DIM.x + 2 * MARGEN, y: DIM.y + 2 + MARGEN, z: DIM.z + 2 * MARGEN };

// Mapa de altura del sol. Con geometria de cajas alineadas a los ejes y proyeccion ortografica vertical, el
// resultado de la GPU es exactamente esto: por texel, el techo mas alto que lo cubre. Se cuantiza a 16 bits
// EXACTAMENTE como el shader (empaquetado en dos canales de 8) para que el test note un fallo de precision.
function empaqueta(h) {                                     // h normalizado 0..1 -> dos bytes
  let ex = h % 1, ey = (h * 255) % 1;
  ex -= ey / 255;
  return [Math.round(ex * 255), Math.round(ey * 255)];      // <- la cuantizacion a RGBA8 que hace la textura
}
function desempaqueta(b) { return b[0] / 255 + (b[1] / 255) / 255; }

function mapaDeSombra(cajas, size) {
  const T = new Float64Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const wx = ORG.x + (i + 0.5) / size * SPAN.x, wz = ORG.z + (j + 0.5) / size * SPAN.z;
    let top = ORG.y;
    for (const c of cajas)
      if (wx >= c.x0 && wx < c.x1 && wz >= c.z0 && wz < c.z1 && c.y1 > top) top = c.y1;
    T[i + j * size] = desempaqueta(empaqueta((top - ORG.y) / SPAN.y));
  }
  return { T, size };
}
// sunFactor, linea a linea como en MC_SUN_LIB.
function sunFactor(mapa, w, n, sunShade) {
  if (sunShade >= 1) return 1;
  const p = [w[0] + n[0] * OFF, w[1] + n[1] * OFF, w[2] + n[2] * OFF];
  const u = (p[0] - ORG.x) / SPAN.x, v = (p[2] - ORG.z) / SPAN.z;
  if (u < 0 || u > 1 || v < 0 || v > 1) return 1;
  const i = Math.min(mapa.size - 1, Math.max(0, Math.floor(u * mapa.size)));
  const j = Math.min(mapa.size - 1, Math.max(0, Math.floor(v * mapa.size)));
  const top = mapa.T[i + j * mapa.size] * SPAN.y + ORG.y;
  return p[1] < top - BIAS ? sunShade : 1;
}

// La escena de la captura: suelo llano a y=14 (cara superior 15), un cubo encima, y una nube tapando.
const GH = 14, SUELO = { x0: 0, x1: DIM.x, z0: 0, z1: DIM.z, y1: GH + 1 };
const CUBO  = { x0: 48, x1: 49, z0: 48, z1: 49, y1: GH + 2 };            // un unico bloque, como dijo el dueno
const NUBE  = { x0: 40, x1: 60, z0: 40, z1: 60, y1: 30 };
const MAPA  = mapaDeSombra([SUELO, CUBO, NUBE], 2048);
const SH = 0.55;

// Las seis caras del cubo (48,15,48), muestreadas en varios puntos de cada una.
function puntosDeCara(caja, eje, signo) {
  const pts = [], N = 7;
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    const fa = (a + 0.5) / N, fb = (b + 0.5) / N;
    if (eje === 1) pts.push([caja.x0 + fa, signo > 0 ? caja.y1 : caja.y1 - 1, caja.z0 + fb]);
    else if (eje === 0) pts.push([signo > 0 ? caja.x1 : caja.x0, caja.y1 - 1 + fa, caja.z0 + fb]);
    else pts.push([caja.x0 + fa, caja.y1 - 1 + fb, signo > 0 ? caja.z1 : caja.z0]);
  }
  return pts;
}
const CARAS = [[1, 1, '+Y'], [0, 1, '+X'], [0, -1, '-X'], [2, 1, '+Z'], [2, -1, '-Z']];

test('el cubo bajo la nube se oscurece en LAS CINCO caras que se ven, no solo la tapa', () => {
  for (const [eje, signo, nombre] of CARAS) {
    const n = [0, 0, 0]; n[eje] = signo;
    for (const p of puntosDeCara(CUBO, eje, signo)) {
      const f = sunFactor(MAPA, p, n, SH);
      assert(f === SH, 'la cara ' + nombre + ' del cubo se ha quedado al sol en (' +
        p.map(v => v.toFixed(2)).join(',') + '): factor ' + f);
    }
  }
});

test('NO salen esquinas ni bordes sin sombrear: la cara entera da el mismo valor', () => {
  // El fallo «salen esquinas de los bloques sin sombrear» venia de que la sombra era un quad con alpha
  // interpolado que se desvanecia en el borde. Aqui no hay quad: cada fragmento decide solo.
  for (const [eje, signo, nombre] of CARAS) {
    const n = [0, 0, 0]; n[eje] = signo;
    const vals = new Set(puntosDeCara(CUBO, eje, signo).map(p => sunFactor(MAPA, p, n, SH)));
    assert(vals.size === 1, 'la cara ' + nombre + ' tiene ' + vals.size + ' valores distintos: ' + [...vals]);
  }
});

test('NO hay zonas mas iluminadas en el suelo junto al bloque', () => {
  // El otro fallo de la captura: el alpha se muestreaba bilinealmente y promediaba celdas SOLIDAS (que valian 1),
  // asi que el suelo pegado al cubo se aclaraba. Se barre el anillo de suelo alrededor del cubo, medio texel a
  // medio texel, y todo tiene que estar igual de oscuro.
  const n = [0, 1, 0];
  for (let dx = -2; dx <= 3; dx += 0.05) for (const dz of [-2, -1, 0, 1, 2, 3]) {
    const x = CUBO.x0 + dx, z = CUBO.z0 + dz + 0.5;
    if (x >= CUBO.x0 && x < CUBO.x1 && z >= CUBO.z0 && z < CUBO.z1) continue;   // eso es la tapa del cubo, no el suelo
    const f = sunFactor(MAPA, [x, GH + 1, z], n, SH);
    assert(f === SH, 'punto claro en el suelo junto al cubo: (' + x.toFixed(2) + ',' + z.toFixed(2) + ') = ' + f);
  }
});

test('fuera de la nube todo esta al sol, y el borde de la sombra cae donde debe', () => {
  const n = [0, 1, 0];
  assert(sunFactor(MAPA, [NUBE.x0 - 3, GH + 1, 50], n, SH) === 1, 'suelo fuera de la nube en sombra');
  assert(sunFactor(MAPA, [NUBE.x0 + 3, GH + 1, 50], n, SH) === SH, 'suelo bajo la nube al sol');
  // el borde, con la resolucion del mapa (2048 texeles sobre 96 bloques = 1/21 de bloque)
  let borde = null;
  for (let x = NUBE.x0 - 1; x < NUBE.x0 + 1; x += 0.005)
    if (borde === null && sunFactor(MAPA, [x, GH + 1, 50], n, SH) === SH) borde = x;
  assert(Math.abs(borde - NUBE.x0) < 0.06, 'el borde de la sombra cae en ' + borde.toFixed(3) + ' y la nube empieza en ' + NUBE.x0);
});

test('un bloque apoyado en el suelo NO se sombrea a si mismo (nada de acne)', () => {
  const soloSuelo = mapaDeSombra([SUELO, CUBO], 2048);
  const n = [0, 1, 0];
  for (const p of puntosDeCara(CUBO, 1, 1))
    assert(sunFactor(soloSuelo, p, n, SH) === 1, 'la tapa del cubo se sombrea a si misma en ' + p);
  for (let x = 40; x < 56; x += 0.13)
    assert(sunFactor(soloSuelo, [x, GH + 1, 60], n, SH) === 1, 'el suelo llano se sombrea solo en x=' + x);
});

test('la cara lateral de un bloque alto SI se sombrea si su vecino esta tapado', () => {
  // Media celda hacia fuera = «el aire al que da la cara», la misma regla que mcMeshChunk. Por eso una pared
  // pegada al borde de la nube tiene un lado en sombra y el otro no, en vez de decidirse por columnas enteras.
  const pared = { x0: 39, x1: 40, z0: 45, z1: 55, y1: GH + 2 };
  const m = mapaDeSombra([SUELO, pared, NUBE], 2048);
  assert(sunFactor(m, [40, GH + 1.5, 50], [1, 0, 0], SH) === SH, 'la cara +X (mira a la nube) esta al sol');
  assert(sunFactor(m, [39, GH + 1.5, 50], [-1, 0, 0], SH) === 1,  'la cara -X (mira afuera) esta en sombra');
});

test('la sombra se desliza por subcelda (esto es lo que no podia hacer un heightmap por columna)', () => {
  const n = [0, 1, 0];
  const bordeCon = dx => {
    const m = mapaDeSombra([SUELO, { x0: 50 + dx, x1: 54 + dx, z0: 50, z1: 54, y1: 25 }], 2048);
    for (let x = 49; x < 52; x += 0.005) if (sunFactor(m, [x, GH + 1, 52], n, SH) === SH) return x;
    return null;
  };
  const b0 = bordeCon(0), b1 = bordeCon(0.37);
  assert(b0 !== null && b1 !== null, 'no encuentro el borde de la sombra');
  assert(Math.abs((b1 - b0) - 0.37) < 0.06,
    'el ocluso se movio 0.37 y la sombra ' + (b1 - b0).toFixed(3) + ' (deberia seguirlo, no saltar de celda en celda)');
});

test('el empaquetado de 16 bits sobrevive a la cuantizacion a RGBA8', () => {
  let peor = 0;
  for (let y = ORG.y; y <= ORG.y + SPAN.y; y += 0.017) {
    const h = (y - ORG.y) / SPAN.y;
    const err = Math.abs(desempaqueta(empaqueta(h)) * SPAN.y + ORG.y - y);
    if (err > peor) peor = err;
  }
  assert(peor < BIAS / 2, 'error de altura hasta ' + peor.toFixed(5) + ' bloques, y el margen es ' + BIAS);
  assert(peor < 0.01, 'con 8 bits el error seria ~0.16 bloques; aqui sale ' + peor.toFixed(5));
});

test('game.sunShade=1 apaga la sombra sin coste (ni se renderiza el mapa)', () => {
  const n = [0, 1, 0];
  assert(sunFactor(MAPA, [50, GH + 1, 50], n, 1) === 1, 'con sunShade=1 sigue habiendo sombra');
  const pasada = SRC.slice(SRC.indexOf('function mcRenderShadow'), SRC.indexOf('function mcSunUniforms'));
  assert(/mc\.sunShade>=1\s*\)\s*return null/.test(pasada), 'mcRenderShadow no se salta la pasada con sunShade=1');
  assert(/if\(uSunShade>=1\.0\) return 1\.0;/.test(LIB), 'sunFactor no sale por lo corto con uSunShade=1');
});

test('el mapa solo se rehace cuando algo se mueve', () => {
  const pasada = SRC.slice(SRC.indexOf('function mcRenderShadow'), SRC.indexOf('function mcSunUniforms'));
  assert(/if\(!S\.dirty\) return S;/.test(pasada), 'la pasada del sol no mira el flag de suciedad');
  assert(/mcShadowDirty\(\);\s*\/\/ el terreno/.test(SRC), 'mcMeshChunk no marca el mapa como sucio');
  // Un agente que anda va por la via LENTA (mcShadowMoved): rehacer el mapa entero a 144 Hz porque alguien da un
  // paso costaba ~20 ms por frame. Sigue rehaciendose, pero al ritmo de mc.shadowMoveMs. Ver test_sombra_movil.js.
  assert(/mcShadowMoved\(\);\s*\/\/ el agente/.test(SRC), 'mcAgentMesh no marca el mapa como movido');
  assert(/if\(!S\.dirty && S\.moved && ahora-\(S\.lastBake\|\|0\)>=mc\.shadowMoveMs\) S\.dirty=true;/.test(pasada),
    'la pasada del sol no promociona el movimiento a horneado');
});

test('el volumen del sol lleva margen, y app.js lo monta como este test lo porta', () => {
  const cuerpo = SRC.slice(SRC.indexOf('function mcSunFrustum'), SRC.indexOf('function mcSunFrustum') + 500)
    .replace(/\s+/g, '');
  assert(MARGEN > 0, 'MC_SUN_MARGIN es ' + MARGEN + ': sin margen, lo que sobresale del mundo no entra en el mapa');
  assert(cuerpo.includes('uniform3f(L.uSunOrg,-M,-1,-M)'),
    'mcSunFrustum ya no manda el origen que este test porta (ORG)');
  assert(cuerpo.includes('uniform3f(L.uSunDim,mc.dim.x+2*M,mc.dim.y+2+M,mc.dim.z+2*M)'),
    'mcSunFrustum ya no manda el tamano que este test porta (SPAN)');
});

test('un cuerpo que sobresale del mundo TAMBIEN tiene sombra debajo', () => {
  // el caso que canto el dueno: la nube colgando por el borde y su parte de fuera sin sombra abajo
  const NUBE_FUERA = { x0: 90, x1: 99, z0: 40, z1: 60, y1: 30 };   // llega a x=99 y el mundo acaba en 96
  const mapa = mapaDeSombra([SUELO, NUBE_FUERA], 512);
  const abajo = [0, -1, 0];
  for (const x of [92.5, 95.5, 97.5, 98.5]) {                      // dentro y fuera del mundo
    assert(sunFactor(mapa, [x, 29.5, 50], abajo, SH) === SH,
      'la cara de abajo en x=' + x + ' sale al sol (el mapa no llega hasta ahi)');
  }
  assert(sunFactor(mapa, [99.5, 29.5, 50], abajo, SH) === 1, 'sombra donde ya no hay cuerpo (x=99.5)');
});

test('no queda nada de la estampa vieja en app.js', () => {
  for (const resto of ['mcComputeSun', 'mcSunLit', 'sunTop', 'SOMBRA_EPS'])
    assert(!SRC.includes(resto), 'queda "' + resto + '" en app.js');
  // El sesgo de profundidad ha vuelto, pero para las pasadas de ESTRUCTURAS (mcStructGL, contra el z-fighting
  // de una cara estampada pegada a un bloque del terreno). Lo que no puede volver es a la pasada del sol, que es
  // donde lo usaba la estampa vieja: alli desplaza el mapa de altura y descuadra la sombra.
  const desde = SRC.indexOf('function mcStructGL');
  assert(desde > 0, 'no encuentro mcStructGL en app.js');
  const cuerpo = SRC.slice(desde, SRC.indexOf('\n}', desde) + 2);
  const cuenta = (s, re) => (s.match(re) || []).length;
  assert(cuenta(cuerpo, /gl\.polygonOffset/g) > 0 && cuenta(SRC, /gl\.polygonOffset/g) === cuenta(cuerpo, /gl\.polygonOffset/g),
    'hay gl.polygonOffset fuera de mcStructGL: la estampa vieja lo usaba en la pasada del sol');
  // Lo mismo para el culling: la pasada del sol dibuja el mapa de altura y necesita ver TODAS las caras. Si el
  // CULL_FACE se filtra fuera de mcStructGL, los cuerpos pierden la cara de abajo y dejan de proyectar sombra.
  assert(cuenta(cuerpo, /gl\.(enable|disable)\(gl\.CULL_FACE\)/g) === cuenta(SRC, /gl\.(enable|disable)\(gl\.CULL_FACE\)/g),
    'hay gl.CULL_FACE fuera de mcStructGL: se filtraria a la pasada del sol y del terreno');
  // Y se apaga siempre al salir, en la misma llamada que apaga el sesgo (mismo par on/off).
  assert(/else\s*\{[^}]*gl\.disable\(gl\.CULL_FACE\)/.test(cuerpo), 'mcStructGL(false) no apaga el culling');
});

console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
