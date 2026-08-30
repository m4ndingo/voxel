// @area: editor
// @necesita: node
// Guardián del ESCALADO DE PEGAR (Alt+rueda con la pieza en vuelo). Nació como el snippet
// `pegar-escala` (LEY DE ORO) y el 2026-08-30, ya dado por bueno por el dueño, bajó a `app.js`.
//
// Las funciones se extraen VERBATIM POR TEXTO de `web/app.js` (mismo truco que
// `test_rayo_apuntado.js`): así el test mide EL MOTOR, no una copia que puede envejecer. Contrapartida
// conocida: renombrar o mover ese bloque revienta este test con un `ReferenceError`, y eso es
// deliberado — avisa de que el mapa ha cambiado.
//
// QUÉ DEFIENDE, y de qué queja del dueño salió cada cosa (todas del 2026-08-30):
//   §4/§6  «*cada vez que se hace el escalado se pierde el original*» → ida y vuelta BYTE A BYTE.
//   §1-§3  «*multiplos de 16 en cualquier direccion son deseables*» → la escalera con rejilla.
//   §7     «*una figura simetrica sale asimetrica*» → simetría por construcción, 74 combinaciones.
//   §8b    «*sigo viendo huecos*» → las paredes de 1 bloque sobreviven al reducir.
//   §8c    «*las murallas se construyen con bloques que no eran los orginales*» → desempate sano.
//   §8d    «*y copie parte del suelo*» → el espejo es el de la PIEZA, no el de su caja.
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

global.window = global;
global.mc = { active: true, pasteActive: true, pasteAnchor: [0, 0, 0] };
global.clipboard = { cells: [], ancla: null };
global.MC_PASTE_ESC_TOPE = 40000;
global.toast = (t) => { global._ultimoToast = t; };

global.mcClipboardDims = function () {
  if (!clipboard || !clipboard.cells || !clipboard.cells.length) return null;
  let mx = 0, my = 0, mz = 0;
  for (const c of clipboard.cells) {
    if (c.dx > mx) mx = c.dx;
    if (c.dz > my) my = c.dz;
    if (c.dy > mz) mz = c.dy;
  }
  return { w: mx + 1, h: my + 1, d: mz + 1 };
};
global.mcPasteEscHay = () => !!(clipboard && clipboard.cells && clipboard.cells.length);
// El motor pega la pieza al origen y arrastra el agarre con ella. El stub tiene que hacer lo mismo o
// la caja medida queda descolocada y las comprobaciones de simetria mienten.
global.mcSelGuiaNormaliza = () => {
  if (!clipboard.cells || !clipboard.cells.length) return;
  let mx = Infinity, my = Infinity, mz = Infinity;
  for (const c of clipboard.cells) {
    if (c.dx < mx) mx = c.dx;
    if (c.dz < my) my = c.dz;
    if (c.dy < mz) mz = c.dy;
  }
  if (!mx && !my && !mz) return;
  for (const c of clipboard.cells) { c.dx -= mx; c.dz -= my; c.dy -= mz; }
  if (mc.pasteAnchor) { mc.pasteAnchor[0] -= mx; mc.pasteAnchor[1] -= my; mc.pasteAnchor[2] -= mz; }
};
global.mcOriDims = (w, h, p) => [w, h, p];
global.mcOriMove = () => (a, b, c) => [a, b, c];

// ── el motor, tal cual está en app.js ────────────────────────────────────────────────────────────
const APP = fs.readFileSync(path.join(raiz, 'web', 'app.js'), 'utf8');
const INI = APP.indexOf('function mcPasteEscDim(');
const FIN = APP.indexOf('// Caja de CELDAS → sus dos esquinas en voxeles FINOS.');
if (INI < 0 || FIN < 0 || FIN < INI) {
  console.log('  FALLO  no se encuentra el bloque mcPasteEsc* en web/app.js (¿se ha movido?)');
  process.exit(1);
}
// `const` a nivel de eval no cuelga de `global`; se pasan a `var` para que el bloque se vea entero.
eval(APP.slice(INI, FIN).replace(/^const /gm, 'var '));

// Atajos que en app.js no existen porque allí no hacen falta: aquí dan a los §§ una forma legible.
const E = {
  rejilla(n) { mc._pegEscRejilla = Math.max(1, n | 0); },
  relleno(f) { mc._pegEscRelleno = f; },
  estado() { return { nivel: mc._pegEsc ? mc._pegEsc.nivel : null }; },
  // La escalera entera de una pieza, sin tocar el portapapeles: qué tamaño deja cada muesca de rueda.
  escalera(w, h, d, desde, hasta) {
    const r = {};
    for (let n = -(desde || 2); n <= (hasta || 2); n++) {
      if (!n) continue;
      const m = mcPasteEscMeta({ w: w, h: h, d: d }, n);
      r[(n > 0 ? '+' : '') + n] = m.w + '×' + m.h + '×' + m.d;
    }
    return r;
  }
};

let ok = 0, fallos = 0;
const check = (c, m) => c ? (ok++, console.log('  ok    ' + m)) : (fallos++, console.log('  FALLO  ' + m));


console.log('\n§1 escalera del dueño: 20x20x20 (rejilla 8)');
E.rejilla(8);
const e8 = E.escalera(20, 20, 20);
console.log('   ', JSON.stringify(e8));
check(e8['-1'] === '16×16×16', 'abajo 1 -> 16x16x16 (no 10x10x10)');
check(e8['-2'] === '8×8×8', 'abajo 2 -> 8x8x8');
check(e8['+1'] === '24×24×24', 'arriba 1 -> 24x24x24');
check(e8['+2'] === '48×48×48', 'arriba 2 -> 48x48x48');

console.log('\n§2 la misma con rejilla 16 (la palabra literal del encargo)');
E.rejilla(16);
const e16 = E.escalera(20, 20, 20);
console.log('   ', JSON.stringify(e16));
check(e16['-1'] === '16×16×16', 'abajo 1 -> 16x16x16');
check(e16['+1'] === '32×32×32', 'arriba 1 -> 32x32x32 (con 16 NO da 24)');

console.log('\n§3 no cubico 20x50x10: se fija UN eje, los otros en proporcion');
E.rejilla(8);
const nc = E.escalera(20, 50, 10, 1, 1);
console.log('   ', JSON.stringify(nc));
check(nc['+1'] === '24×60×12', 'arriba -> 24x60x12 (d=24/20=1,2 · la cuenta del dueño)');

console.log('\n§3b la rejilla AJUSTA el escalon, no lo sustituye por uno mayor');
// Lo cazó `probe_pegar_escala.js` al graduar el parche: una pieza de 2x1x1 saltaba a 8x4x4 (x4)
// porque cuadrar a la rejilla la multiplicaba por 4. Cuadrar solo vale si cuesta menos que el x2/÷2.
E.rejilla(8);
const chica = E.escalera(2, 1, 1, 1, 1);
console.log('   ', JSON.stringify(chica));
check(chica['+1'] === '4×2×2', 'una pieza de 2x1x1 sube a 4x2x2, no a 8x4x4');
const media = E.escalera(20, 20, 20, 1, 1);
check(media['+1'] === '24×24×24', 'y donde cuadrar SI sale a cuenta, se sigue cuadrando (20 -> 24)');

console.log('\n§4 IDA Y VUELTA: 1 -> 0.5 -> 1 devuelve el ORIGINAL exacto');
// pieza irregular de 20x20x20, con materiales variados y huecos: si se remuestreara al volver,
// los materiales y los huecos saldrian distintos.
const orig = [];
for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) for (let z = 0; z < 20; z++)
  if ((x * 7 + y * 3 + z) % 5 !== 0) orig.push({ dx: x, dz: y, dy: z, c: (x + y * 2 + z * 3) % 9 });
clipboard.cells = orig.map(c => Object.assign({}, c));
const firma = a => a.map(c => c.dx + ',' + c.dz + ',' + c.dy + ':' + c.c).sort().join('|');
const antes = firma(clipboard.cells);
console.log('    original:', clipboard.cells.length, 'bloques', JSON.stringify(mcClipboardDims()));

mcPasteEscala(0.5);
const bajado = mcClipboardDims();
console.log('    tras ÷:  ', clipboard.cells.length, 'bloques', JSON.stringify(bajado));
check(bajado.w === 16 && bajado.h === 16 && bajado.d === 16, 'el paso abajo cuadra a 16x16x16');

mcPasteEscala(2);
const vuelto = mcClipboardDims();
console.log('    tras ×:  ', clipboard.cells.length, 'bloques', JSON.stringify(vuelto));
check(firma(clipboard.cells) === antes, 'vuelve el original BYTE A BYTE (celdas y materiales)');
check(E.estado().nivel === 0, 'el nivel vuelve a 0');

console.log('\n§5 el motor original destruia: se comprueba el contraste');
// reproduccion del ÷2/×2 del motor sobre los mismos datos
let m = orig.map(c => Object.assign({}, c));
const cubos = new Map();
for (const c of m) {
  const k = (c.dx >> 1) + ',' + (c.dz >> 1) + ',' + (c.dy >> 1);
  if (!cubos.has(k)) cubos.set(k, []);
  cubos.get(k).push(c);
}
let m2 = [];
cubos.forEach((g, k) => { const p = k.split(','); m2.push(Object.assign({}, g[0], { dx: +p[0], dz: +p[1], dy: +p[2] })); });
let m3 = [];
for (const c of m2) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++)
  m3.push(Object.assign({}, c, { dx: c.dx * 2 + i, dz: c.dz * 2 + j, dy: c.dy * 2 + k }));
check(firma(m3) !== antes, 'el camino viejo NO devolvia el original (el bug que se arregla)');
console.log('    viejo: ' + m3.length + ' bloques vs original ' + orig.length);

console.log('\n§6 ida y vuelta larga: -2 y de vuelta a 0');
clipboard.cells = orig.map(c => Object.assign({}, c));
delete mc._pegEsc;
mcPasteEscala(0.5); mcPasteEscala(0.5);
console.log('    nivel -2:', JSON.stringify(mcClipboardDims()), clipboard.cells.length, 'bloques');
mcPasteEscala(2); mcPasteEscala(2);
check(firma(clipboard.cells) === antes, 'desde el nivel -2 tambien vuelve el original exacto');

console.log('\n§7 SIMETRIA: lo simetrico sigue simetrico');
// Pieza deliberadamente simetrica en los tres ejes, con huecos y varios materiales: una cruz/esfera
// hueca dentro de 21x21x21 (impar, para que haya centro exacto).
function construyeSimetrica(L) {
  const c = (L - 1) / 2, out = [];
  for (let x = 0; x < L; x++) for (let y = 0; y < L; y++) for (let z = 0; z < L; z++) {
    const dx = x - c, dy = y - c, dz = z - c;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const brazo = (Math.abs(dx) < 2 && Math.abs(dy) < 2) || (Math.abs(dy) < 2 && Math.abs(dz) < 2) ||
                  (Math.abs(dx) < 2 && Math.abs(dz) < 2);
    if (r > c - 0.5 || (!brazo && r > 3)) continue;
    // material simetrico: depende solo de distancias absolutas
    out.push({ dx: x, dz: y, dy: z, c: (Math.abs(dx) + Math.abs(dy) * 2 + Math.abs(dz) * 3) % 6 });
  }
  // el portapapeles real viene pegado al origen (mcSelGuiaNormaliza); aqui hay que hacerlo a mano o
  // la caja no es ajustada y el espejo se calcula desplazado
  const mnx = Math.min(...out.map(c => c.dx)), mny = Math.min(...out.map(c => c.dz)), mnz = Math.min(...out.map(c => c.dy));
  for (const c of out) { c.dx -= mnx; c.dz -= mny; c.dy -= mnz; }
  return out;
}
// ¿es simetrica la pieza que hay ahora en el portapapeles, en los 3 ejes, forma Y material?
function esSimetrica(cells, d) {
  const m = new Map();
  for (const c of cells) m.set(c.dx + ',' + c.dz + ',' + c.dy, String(c.c));
  let malos = 0;
  for (const c of cells) {
    const esp = [(d.w - 1 - c.dx) + ',' + c.dz + ',' + c.dy,
                 c.dx + ',' + (d.h - 1 - c.dz) + ',' + c.dy,
                 c.dx + ',' + c.dz + ',' + (d.d - 1 - c.dy)];
    for (const e of esp) if (m.get(e) !== String(c.c)) malos++;
  }
  return malos;
}

// Patron simetrico por construccion y que TOCA las seis caras, para que la caja sea exacta.
function cubaSimetrica(L) {
  const out = [];
  for (let x = 0; x < L; x++) for (let y = 0; y < L; y++) for (let z = 0; z < L; z++) {
    const a = Math.min(x, L - 1 - x), b = Math.min(y, L - 1 - y), d = Math.min(z, L - 1 - z);
    if ((a + b + d) % 3 === 0) continue;                 // huecos, tambien simetricos
    out.push({ dx: x, dz: y, dy: z, c: (a + b * 2 + d * 3) % 5 });
  }
  return out;
}

E.rejilla(8);
const sim = construyeSimetrica(21);
clipboard.cells = sim.map(c => Object.assign({}, c));
delete mc._pegEsc;
check(esSimetrica(clipboard.cells, mcClipboardDims()) === 0, 'la pieza de partida es simetrica (' + sim.length + ' bloques)');

for (const paso of [[0.5, 'abajo 1'], [0.5, 'abajo 2'], [2, 'vuelta 1'], [2, 'vuelta 2'], [2, 'arriba 1'], [2, 'arriba 2']]) {
  mcPasteEscala(paso[0]);
  const d = mcClipboardDims(), malos = esSimetrica(clipboard.cells, d);
  check(malos === 0, paso[1] + ' -> ' + d.w + '×' + d.h + '×' + d.d + ' sigue simetrico (' +
        clipboard.cells.length + ' bloques' + (malos ? ', ' + malos + ' fallos' : '') + ')');
}

console.log('\n§7b barrido: tamanos pares e impares, rejillas 8 y 16, niveles -2..+2');
let barridoMal = 0, barridoN = 0;
for (const G of [8, 16]) {
  E.rejilla(G);
  for (const L of [12, 15, 16, 17, 19, 20, 21, 24, 31]) {
    const pieza = cubaSimetrica(L);
    for (const nivs of [[0.5], [0.5, 0.5], [2], [2, 2], [0.5, 2, 2]]) {
      clipboard.cells = pieza.map(c => Object.assign({}, c));
      delete mc._pegEsc;
      mc.pasteAnchor = [0, 0, 0];
      let salta = false;
      for (const f of nivs) if (!mcPasteEscala(f)) { salta = true; break; }
      if (salta) continue;
      const d = mcClipboardDims(), malos = esSimetrica(clipboard.cells, d);
      barridoN++;
      if (malos) {
        barridoMal++;
        if (barridoMal <= 5) console.log('    ASIMETRICO  rejilla ' + G + '  ' + L + '³  pasos ' +
                                         JSON.stringify(nivs) + ' -> ' + d.w + '×' + d.h + '×' + d.d + '  (' + malos + ')');
      }
    }
  }
}
check(barridoMal === 0, barridoN + ' combinaciones de tamano/rejilla/nivel, todas simetricas');

console.log('\n§8 reducir NO engorda la pieza ni tapa huecos');
// una capa hueca: al bajar por mayoria el hueco central debe seguir hueco
clipboard.cells = []; delete mc._pegEsc;
const marco = [];
for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) for (let z = 0; z < 20; z++)
  if (x < 3 || x > 16 || y < 3 || y > 16 || z < 3 || z > 16) marco.push({ dx: x, dz: y, dy: z, c: 1 });
clipboard.cells = marco.map(c => Object.assign({}, c));
mcPasteEscala(0.5);
const hueco = clipboard.cells.some(c => c.dx === 8 && c.dz === 8 && c.dy === 8);
check(!hueco, 'el centro hueco de una caja hueca 20³ sigue hueco tras bajar a 16³');

console.log('\n§9 ida y vuelta sigue siendo exacta tras el cambio');
clipboard.cells = orig.map(c => Object.assign({}, c));
delete mc._pegEsc;
mcPasteEscala(0.5); mcPasteEscala(2);
check(firma(clipboard.cells) === antes, 'divide y multiplica devuelve el original exacto');

console.log('\n§8b las PAREDES FINAS sobreviven (foto del dueno del 2026-08-30)');
// Torre hueca de pared 1 con tejado macizo. Por mayoria pura la pared nunca llega al 50 % y la torre
// se evapora dejando el tejado flotando: es exactamente lo que se veia rodeado en amarillo.
clipboard.cells = []; delete mc._pegEsc;
const torre = [];
for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 16; y++) {
  const borde = (x === 0 || x === 15 || z === 0 || z === 15);
  if (y === 15) torre.push({ dx: x, dz: y, dy: z, c: 2 });        // tejado macizo
  else if (borde) torre.push({ dx: x, dz: y, dy: z, c: 1 });      // muro de 1 bloque
}
clipboard.cells = torre.map(c => Object.assign({}, c));
mcPasteEscala(0.5);
const bajo = clipboard.cells, dimB = mcClipboardDims();
check(dimB.h === 8, 'la torre conserva su altura al reducir (8, no un munon): ' + dimB.h);
let murosVivos = 0;
for (let y = 0; y < 7; y++) if (bajo.some(c => c.dz === y)) murosVivos++;
check(murosVivos === 7, 'las 7 capas de muro siguen ahi (' + murosVivos + ')');
const anillo = bajo.filter(c => c.dz === 3);
check(anillo.length === 8 * 8 - 6 * 6, 'a media altura el muro sigue siendo un anillo cerrado de 1 (' +
      anillo.length + ' de ' + (8 * 8 - 6 * 6) + ')');
check(!bajo.some(c => c.dz === 3 && c.dx > 0 && c.dx < 7 && c.dy > 0 && c.dy < 7),
      'y el interior de la torre sigue hueco, no se ha rellenado');
const tejado = bajo.filter(c => c.dz === 7);
check(tejado.length === 64 && tejado.every(c => String(c.c) === '2'),
      'el tejado sigue macizo y apoyado, no flotando (' + tejado.length + ')');
check(anillo.every(c => String(c.c) === '1'),
      'el muro se rehace con el bloque del MURO, no con el del tejado');

console.log('\n§8c el material no depende del identificador del bloque');
// Dos materiales a partes iguales en cada trozo: el desempate no puede irse siempre al id menor.
clipboard.cells = []; delete mc._pegEsc;
const dos = [];
for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 0; y < 16; y++)
  dos.push({ dx: x, dz: y, dy: z, c: (x < 8) ? 9 : 3 });
clipboard.cells = dos.map(c => Object.assign({}, c));
mcPasteEscala(0.5);
const izq = clipboard.cells.filter(c => c.dx === 0).map(c => String(c.c));
const der = clipboard.cells.filter(c => c.dx === 7).map(c => String(c.c));
check(new Set(izq).size === 1 && new Set(der).size === 1, 'cada lado sale de un solo material');
check(izq[0] === '9' && der[0] === '3',
      'gana el material de cada lado, no el id menor en los dos (' + izq[0] + '/' + der[0] + ')');

console.log('\n§8d simetria con la pieza DESCENTRADA en su caja («y copie parte del suelo»)');
// Pieza simetrica mas suelo que sobresale por un lado: el eje de la pieza no es el de la caja.
clipboard.cells = []; delete mc._pegEsc;
const conSuelo = [];
for (let x = 0; x < 15; x++) for (let z = 0; z < 15; z++) for (let y = 1; y < 16; y++) {
  const ax = Math.abs(x - 7), az = Math.abs(z - 7);
  if (ax + az <= 7 - Math.floor(y / 3)) conSuelo.push({ dx: x, dz: y, dy: z, c: 1 });
}
for (let x = -2; x < 20; x++) for (let z = -3; z < 18; z++) conSuelo.push({ dx: x + 2, dz: 0, dy: z + 3, c: 7 });
clipboard.cells = conSuelo.map(c => Object.assign({}, c));
mcSelGuiaNormaliza();
// Mejor espejo propio de la pieza: se busca el plano (en medios bloques) que mas casa, contando
// solo las celdas cuyo reflejo cae dentro y exigiendo que abarque la mayor parte de la pieza.
const mejorEspejo = (cs) => {
  let W = 0;
  for (const c of cs) if (c.dx > W) W = c.dx;
  const m = new Map();
  for (const c of cs) m.set(c.dx + ',' + c.dz + ',' + c.dy, String(c.c));
  let top = 0, plano = null;
  for (let s = 0; s <= 2 * W; s++) {
    let ok = 0, dentro = 0;
    for (const c of cs) {
      const x2 = s - c.dx;
      if (x2 < 0 || x2 > W) continue;
      dentro++;
      if (m.get(x2 + ',' + c.dz + ',' + c.dy) === String(c.c)) ok++;
    }
    if (dentro < cs.length * 0.6) continue;
    if (ok / dentro > top) { top = ok / dentro; plano = s; }
  }
  return { nota: top, plano: plano };
};
const e0 = mejorEspejo(clipboard.cells);
check(e0.nota === 1 && e0.plano === 14, 'la pieza de partida es simetrica respecto a su propio eje');
mcPasteEscala(0.5);
const e1 = mejorEspejo(clipboard.cells);
check(e1.nota >= 0.98,
      'tras reducir sigue simetrica respecto a su eje (' + (100 * e1.nota).toFixed(1) + '% casa)');

console.log('\n' + ok + ' ok / ' + fallos + ' fallos' + (fallos ? '' : '  ·  TODO OK'));
process.exit(fallos ? 1 : 0);
