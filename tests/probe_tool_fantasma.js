// Banco de pruebas de `tool-fantasma` SIN navegador: un contexto WebGL de mentira que APUNTA todas las
// llamadas, para comprobar lo que de verdad rompe la pantalla si sale mal — que el fantasma se dibuje
// con depthFunc(GREATER) y que ese GREATER se reponga a LESS antes de devolver el control (dejarlo
// puesto borra media escena a partir de ahí).
//
//     node tests/probe_tool_fantasma.js
const fs = require('fs');
const path = require('path');

const FUENTE = path.join(__dirname, '..', 'herramientas', 'snp_tool_fantasma.js');

const GL_CONST = {
  TRIANGLES: 4, BLEND: 3042, SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771,
  LESS: 513, GREATER: 516, FLOAT: 5126, ARRAY_BUFFER: 34962,
  CULL_FACE: 2884, BACK: 1029, CW: 2304, CCW: 2305, POLYGON_OFFSET_FILL: 32823
};

function glFalso() {
  const log = [];
  const gl = Object.assign({}, GL_CONST);
  const apunta = (n) => (...a) => { log.push({ f: n, a }); };
  for (const n of ['useProgram', 'uniformMatrix4fv', 'uniform1f', 'vertexAttrib3f', 'vertexAttrib1f',
                   'bindBuffer', 'vertexAttribPointer', 'drawArrays', 'enable', 'disable',
                   'blendFunc', 'depthMask', 'depthFunc', 'polygonOffset', 'frontFace', 'cullFace',
                   'enableVertexAttribArray', 'disableVertexAttribArray']) gl[n] = apunta(n);
  gl._log = log;
  return gl;
}

function monta({ conHerramienta = true, rompe = false } = {}) {
  const gl = glFalso();
  const herramienta = {
    _isHeldTool: true, model: new Array(16).fill(0),
    colVbo: 'VBO_COL', colCount: 36,
    texVbo: 'VBO_TEX', texCount: 12,
    alphaVbo: 'VBO_ALPHA', alphaCount: 6
  };
  const mc = {
    gl, structProg: 'PROG', structBias: 1, structCull: true,
    structLoc: { aPos: 0, aColor: 1, aShade: 2, aEmit: 3, aAlpha: 4,
                 uProj: 'uProj', uView: 'uView', uModel: 'uModel', uClipY: 'uClipY' },
    _heldToolStruct: conHerramienta ? herramienta : null,
    _heldToolKey: 'varita-de-selecci-n'
  };

  const G = {};
  G.mcModelOf = (s) => { if (rompe) throw new Error('boom'); return s.model; };
  G.mcAttribs = (list) => { for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i); for (const l of list) gl.enableVertexAttribArray(l); };
  G.mcStructGL = (on) => { if (on) { gl.enable(gl.CULL_FACE); } else { gl.disable(gl.CULL_FACE); } };
  G.toast = () => {};
  G.mcDrawVoxUI = function (pj, view) { gl._log.push({ f: 'ORIGINAL_mcDrawVoxUI', a: [pj, view] }); return 'orig'; };

  const W = { game: {}, console: { warn: (...a) => W._avisos.push(a.join(' ')) }, _avisos: [] };
  Object.assign(W, G);
  W.window = W;

  const src = fs.readFileSync(FUENTE, 'utf8');
  const nombres = ['window', 'game', 'mc', 'console', 'Math', ...Object.keys(G)];
  const fn = new Function(...nombres, src);
  const r = fn(W, W.game, mc, W.console, Math, ...Object.keys(G).map(k => G[k]));
  return { W, gl, mc, herramienta, r };
}

let ok = 0, fallos = 0;
function comprueba(que, cond, detalle) {
  if (cond) { ok++; console.log('  ok  ' + que + (detalle ? '   · ' + detalle : '')); }
  else { fallos++; console.log('  FALLA  ' + que + (detalle ? '   · ' + detalle : '')); }
}
const nombres = (log) => log.map(l => l.f);
const busca = (log, f) => log.filter(l => l.f === f);

console.log('\n§1 · al cargar se envuelve mcDrawVoxUI y sigue llamando al original');
{
  const { W, gl } = monta();
  comprueba('mcDrawVoxUI quedó envuelta', typeof W.mcDrawVoxUI._orig === 'function');
  W.mcDrawVoxUI({ m: 'PROJ' }, 'VIEW');
  comprueba('el original se llamó', busca(gl._log, 'ORIGINAL_mcDrawVoxUI').length === 1);
  comprueba('y devuelve lo que devolvía el original', W.mcDrawVoxUI({ m: 'P' }, 'V') === 'orig');
}

console.log('\n§2 · el fantasma se pinta con depthFunc(GREATER) y se repone LESS');
{
  const { W, gl } = monta();
  gl._log.length = 0;
  W.mcDrawVoxUI({ m: 'PROJ' }, 'VIEW');
  const df = busca(gl._log, 'depthFunc').map(l => l.a[0]);
  comprueba('hay un depthFunc(GREATER)', df.includes(GL_CONST.GREATER), 'depthFunc=' + df);
  comprueba('el ÚLTIMO depthFunc es LESS (o la escena se borra)',
    df[df.length - 1] === GL_CONST.LESS, 'último=' + df[df.length - 1]);

  const orden = nombres(gl._log);
  const iG = orden.indexOf('depthFunc');
  const iDraw = orden.indexOf('drawArrays');
  const iLess = orden.lastIndexOf('depthFunc');
  comprueba('el GREATER va ANTES de dibujar', iG < iDraw, iG + ' < ' + iDraw);
  comprueba('el LESS va DESPUÉS de dibujar', iLess > iDraw, iLess + ' > ' + iDraw);

  const dm = busca(gl._log, 'depthMask').map(l => l.a[0]);
  comprueba('no escribe profundidad, y la repone', dm[0] === false && dm[dm.length - 1] === true, 'depthMask=' + dm);
  comprueba('deja el BLEND apagado', busca(gl._log, 'disable').some(l => l.a[0] === GL_CONST.BLEND));
}

console.log('\n§3 · el color sale PELADO: aEmit=1 (sin luz ni niebla) y aColor gris');
{
  const { W, gl } = monta();
  gl._log.length = 0;
  W.mcDrawVoxUI({ m: 'P' }, 'V');
  const a1 = busca(gl._log, 'vertexAttrib1f');
  const emit = a1.find(l => l.a[0] === 3);
  const shade = a1.find(l => l.a[0] === 2);
  const alpha = a1.find(l => l.a[0] === 4);
  const col = busca(gl._log, 'vertexAttrib3f')[0];
  comprueba('aEmit = 1.0 exacto (2.0 sería el reflejo del agua)', emit && emit.a[1] === 1.0, emit && String(emit.a[1]));
  comprueba('aShade = 1.0 ⇒ mcViento(1)=0, sin viento', shade && shade.a[1] === 1.0, shade && String(shade.a[1]));
  comprueba('aAlpha = 0.30 por defecto', alpha && Math.abs(alpha.a[1] - 0.30) < 1e-9, alpha && String(alpha.a[1]));
  comprueba('aColor es un gris (los 3 canales parecidos y claros)',
    col && Math.max(...col.a.slice(1)) - Math.min(...col.a.slice(1)) < 0.15 && col.a[1] > 0.6,
    col && col.a.slice(1).join(','));
  comprueba('solo aPos sale del buffer (1 solo enableVertexAttribArray)',
    busca(gl._log, 'enableVertexAttribArray').length === 1);
}

console.log('\n§4 · dibuja los TRES lotes (color, textura y alfa) con su stride');
{
  const { W, gl } = monta();
  gl._log.length = 0;
  W.mcDrawVoxUI({ m: 'P' }, 'V');
  const draws = busca(gl._log, 'drawArrays');
  comprueba('3 drawArrays', draws.length === 3, draws.length + '');
  comprueba('con los recuentos de la herramienta',
    String(draws.map(d => d.a[2])) === '36,12,6', String(draws.map(d => d.a[2])));
  const ptr = busca(gl._log, 'vertexAttribPointer');
  comprueba('el lote texturado usa stride 40 y los otros 36',
    String(ptr.map(p => p.a[4])) === '36,40,36', String(ptr.map(p => p.a[4])));
  comprueba('aPos siempre en el desplazamiento 0', ptr.every(p => p.a[5] === 0));
}

console.log('\n§5 · sin herramienta en mano no se toca la GPU');
{
  const { W, gl } = monta({ conHerramienta: false });
  gl._log.length = 0;
  W.mcDrawVoxUI({ m: 'P' }, 'V');
  comprueba('no dibuja nada', busca(gl._log, 'drawArrays').length === 0);
  comprueba('ni cambia el depthFunc', busca(gl._log, 'depthFunc').length === 0);
  comprueba('pero el original se llamó igual', busca(gl._log, 'ORIGINAL_mcDrawVoxUI').length === 1);
}

console.log('\n§6 · si peta, se apaga solo (no deja el mundo negro ni el GL a medias)');
{
  const { W, gl } = monta({ rompe: true });
  gl._log.length = 0;
  const r = W.mcDrawVoxUI({ m: 'P' }, 'V');
  comprueba('no propaga la excepción', r === 'orig');
  comprueba('se ha desenvuelto solo', W.mcDrawVoxUI._orig === undefined);
  comprueba('y lo dice por consola', W._avisos.some(a => /se apaga solo/.test(a)));
  comprueba('estado() confirma que está fuera', W.game.toolFantasma.estado().puesto === false);
}

console.log('\n§7 · on/off/alpha/color');
{
  const { W } = monta();
  comprueba('off() desenvuelve', (W.game.toolFantasma.off(), W.mcDrawVoxUI._orig === undefined));
  comprueba('y el original vuelve a estar en su sitio', W.mcDrawVoxUI({ m: 'P' }, 'V') === 'orig');
  W.game.toolFantasma.on();
  comprueba('on() vuelve a envolver', typeof W.mcDrawVoxUI._orig === 'function');
  comprueba('alpha(0.5) se guarda', W.game.toolFantasma.alpha(0.5) === 0.5);
  comprueba('alpha se acota a [0,1]', W.game.toolFantasma.alpha(9) === 1);
  comprueba('color(...) se guarda', String(W.game.toolFantasma.color(1, 1, 1)) === '1,1,1');
  comprueba('estado() dice lo que hay',
    W.game.toolFantasma.estado().herramienta === 'varita-de-selecci-n');
}

console.log('\n§8 · re-ejecutar el snippet NO apila dos envolturas (se pintaría el doble de denso)');
{
  const { W, gl } = monta();
  const src = fs.readFileSync(FUENTE, 'utf8');
  // segunda pasada sobre el MISMO window, como haría un alt+c repetido
  const G = { mcModelOf: (s) => s.model, mcAttribs: W.mcAttribs, mcStructGL: W.mcStructGL,
              toast: () => {}, mcDrawVoxUI: W.mcDrawVoxUI };
  const nombres2 = ['window', 'game', 'mc', 'console', 'Math', ...Object.keys(G)];
  new Function(...nombres2, src)(W, W.game, W._mc || monta().mc, W.console, Math, ...Object.keys(G).map(k => G[k]));
  gl._log.length = 0;
  W.mcDrawVoxUI({ m: 'P' }, 'V');
  comprueba('sigue habiendo UNA sola llamada al original',
    busca(gl._log, 'ORIGINAL_mcDrawVoxUI').length === 1,
    busca(gl._log, 'ORIGINAL_mcDrawVoxUI').length + '');
}

console.log('\n' + ok + ' ok / ' + fallos + ' fallos' + (fallos ? '' : '  ·  TODO OK'));
process.exit(fallos ? 1 : 0);
