// @area: general
// @necesita: node
//
// Guardián de Ciudad-MD (herramientas/md_a_ciudad.py + ciudad_a_md.py + ciudad_comun.py).
//
// Lo que protege: que el .md se pueda RECONSTRUIR desde la ciudad. Es un fallo silencioso por
// naturaleza — la ciudad sigue viéndose preciosa aunque la vuelta haya perdido un párrafo, y no se
// nota hasta que alguien confía en ella. Por eso lo que se comprueba aquí no es que el script no
// pete, es la igualdad BYTE A BYTE.
//
// §1 ida+vuelta byte a byte sobre PLAN.md con --fidelidad=exacta  (la prueba que importa)
// §2 lo mismo sobre un fixture adversario: listas anidadas, tabla, valla de código con '#', CRLF,
//    sin \n final, línea de 5000, par suplente justo en el corte de trozo, línea en blanco inicial
// §3 en --fidelidad=esqueleto vuelve el ESQUEMA de encabezados clavado (nivel, ancla, estado…)
// §4 cabecera bien formada: voxelworld-2, palette[0]===null, .vox de 2·x·y·z bytes
// §5 toda clave de paleta existe en assets/index.json (un material inventado rompe el mundo en el
//    navegador y no lo nota nadie hasta que lo abres)
// §6 ninguna nota vacía (una nota "" es una nota BORRADA para mcSyncNoteSignsRun), ninguna por
//    encima de 280 unidades UTF-16 (MC_NOTE_MAX), y pedestales y notas 1:1

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const IDA = path.join(RAIZ, 'herramientas', 'md_a_ciudad.py');
const VUELTA = path.join(RAIZ, 'herramientas', 'ciudad_a_md.py');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ciudad-md-'));

let ok = 0, fallos = 0;
const check = (cond, msg) => cond ? (ok++, console.log('  ok  ' + msg))
  : (fallos++, console.log('  FALLO  ' + msg));

const py = (script, args) => spawnSync('python3', [script, ...args], { encoding: 'utf8' });

function genera(md, mundo, extra) {
  const r = py(IDA, [md, '--mundo', mundo, '--salida', TMP, '--escribe', '--forzar', ...(extra || [])]);
  if (r.status !== 0) throw new Error(`md_a_ciudad ${mundo} salió ${r.status}:\n${r.stderr}${r.stdout}`);
  return r.stdout;
}

function regenera(mundo, extra) {
  const r = py(VUELTA, [mundo, '--salida', TMP, ...(extra || [])]);
  return r;
}

// El fixture adversario. Se escribe con \n explícitos y sin newline final a propósito: la gracia
// es que el .md NO sea un markdown de manual.
const ADVERSO = [
  '\n\n',
  '# Título con \u{1F534} emoji y ✅ done\r\n\r\n',
  'Prosa con espacios en cola   \n',
  '- uno\n  - anidado dos\n    - tres\n- cuatro *asterisco*\n\n',
  '| a | b |\n|---|---|\n| 1 | 2 |\n',
  '\n```python\n# esto NO es un encabezado\nprint("#"*3)\n```\n',
  '\n> cita uno\n> cita dos\n\n',
  '<a id="-req-x1"></a>\n\n### \u{1F7E1} REQ-X1 · algo — \u{1F7E1} abierto 2026-08-20\n\n',
  'x'.repeat(5000) + '\n',
  'a'.repeat(279) + '\u{1F534}'.repeat(30) + '\n',   // el par suplente cae justo en el corte de 280
  '\n\n\n',
  '#### planta honda\n\ncontenido\n',
  'sin salto de linea final',
].join('');

const CASOS = [
  { nombre: 'PLAN.md', md: path.join(RAIZ, 'PLAN.md'), mundo: 'test-ciudad-plan' },
  { nombre: 'fixture adversario', md: path.join(TMP, 'adverso.md'), mundo: 'test-ciudad-adverso' },
];
fs.writeFileSync(CASOS[1].md, ADVERSO);

console.log('§1-2 ida + vuelta byte a byte con --fidelidad=exacta');
const mundos = [];
for (const c of CASOS) {
  try {
    genera(c.md, c.mundo, ['--fidelidad=exacta']);
    mundos.push({ ...c, wf: path.join(TMP, c.mundo + '.json') });
    const r = regenera(c.mundo, ['--verifica', c.md]);
    check(r.status === 0, `${c.nombre}: vuelve idéntico (${fs.statSync(c.md).size} bytes)` +
      (r.status === 0 ? '' : ' -> ' + (r.stderr || '').trim().split('\n').slice(0, 3).join(' | ')));
  } catch (e) {
    check(false, `${c.nombre}: ${e.message.split('\n')[0]}`);
  }
}

console.log('\n§3 --fidelidad=esqueleto devuelve el esquema de encabezados');
// El esquema se saca con el MISMO particionador que usa la ida: si se compara con un regex propio
// se está probando el regex, no la ciudad.
const RE_ENC = /^ {0,3}(#{1,6})\s+(.*)$/;
const RE_ANCLA = /^\s*<a\s+id="([^"]*)"\s*><\/a>\s*$/;
function esquema(texto) {
  const fuera = [];
  const lineas = texto.split('\n');
  let ancla = '';
  for (const l of lineas) {
    const a = RE_ANCLA.exec(l);
    if (a) { ancla = a[1]; continue; }
    const m = RE_ENC.exec(l);
    if (m) { fuera.push(`${m[1].length}|${ancla}|${m[2].trim()}`); ancla = ''; continue; }
    if (l.trim()) ancla = '';
  }
  return fuera;
}
try {
  genera(path.join(RAIZ, 'PLAN.md'), 'test-ciudad-esq', ['--fidelidad=esqueleto']);
  const r = regenera('test-ciudad-esq');
  const salida = (r.stdout || '').replace(/^<!--[\s\S]*?-->\n/, '');
  const orig = esquema(fs.readFileSync(path.join(RAIZ, 'PLAN.md'), 'utf8'));
  const vuelto = esquema(salida);
  const distinto = orig.findIndex((v, i) => v !== vuelto[i]);
  check(r.status === 0 && orig.length === vuelto.length && distinto < 0,
    `PLAN.md: ${orig.length} encabezados vuelven clavados (nivel, ancla, título)` +
    (distinto >= 0 ? ` -> #${distinto}: ${JSON.stringify(orig[distinto])} vs ${JSON.stringify(vuelto[distinto])}`
      : orig.length !== vuelto.length ? ` -> ${orig.length} vs ${vuelto.length}` : ''));
  mundos.push({ nombre: 'PLAN.md esqueleto', mundo: 'test-ciudad-esq', wf: path.join(TMP, 'test-ciudad-esq.json') });
} catch (e) {
  check(false, `esqueleto: ${e.message.split('\n')[0]}`);
}

console.log('\n§4 la cabecera del mundo está bien formada');
for (const m of mundos) {
  const cab = JSON.parse(fs.readFileSync(m.wf, 'utf8'));
  const vox = m.wf.replace(/\.json$/, '.vox');
  const esperado = 2 * cab.dim.x * cab.dim.y * cab.dim.z;
  const real = fs.statSync(vox).size;
  check(cab.format === 'voxelworld-2' && cab.palette[0] === null && real === esperado,
    `${m.nombre}: voxelworld-2, palette[0]=null, .vox ${real} = 2·${cab.dim.x}·${cab.dim.y}·${cab.dim.z}` +
    (real === esperado ? '' : ` -> esperaba ${esperado}`) +
    (cab.palette[0] === null ? '' : ` -> palette[0]=${JSON.stringify(cab.palette[0])}`));
}

console.log('\n§5 toda clave de paleta existe en assets/index.json');
const idx = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets', 'index.json'), 'utf8'));
const conocidos = new Set((Array.isArray(idx) ? idx : idx.items).map((a) => (typeof a === 'string' ? a : a.id)));
for (const m of mundos) {
  const cab = JSON.parse(fs.readFileSync(m.wf, 'utf8'));
  const malas = cab.palette.slice(1).filter((k) => {
    const mm = /^asset:assets\/(.+)\.vox\.json$/.exec(k || '');
    return !mm || !conocidos.has(mm[1]);
  });
  check(malas.length === 0, `${m.nombre}: ${cab.palette.length - 1} materiales, todos del catálogo` +
    (malas.length ? ' -> ' + malas.join(', ') : ''));
}

console.log('\n§6 las notas cumplen lo que el motor da por hecho');
const u16 = (s) => { let n = 0; for (const c of s) n += c.codePointAt(0) > 0xffff ? 2 : 1; return n; };
for (const m of mundos) {
  const cab = JSON.parse(fs.readFileSync(m.wf, 'utf8'));
  const textos = Object.values(cab.notes || {});
  const vacias = textos.filter((t) => !t).length;
  const largas = textos.filter((t) => u16(t) > 280);
  check(textos.length > 0 && vacias === 0 && largas.length === 0,
    `${m.nombre}: ${textos.length} notas, 0 vacías, la mayor ${Math.max(0, ...textos.map(u16))} ≤ 280 UTF-16` +
    (vacias ? ` -> ${vacias} vacías (= notas BORRADAS)` : '') +
    (largas.length ? ` -> ${largas.length} pasan de MC_NOTE_MAX` : ''));

  // pedestales y notas 1:1: toda nota cae sobre un voxel sólido, o el cartel no se planta
  const vox = fs.readFileSync(m.wf.replace(/\.json$/, '.vox'));
  const { x: dx, y: dy } = cab.dim;
  const huecas = Object.keys(cab.notes || {}).filter((k) => {
    const [x, y, z] = k.split(',').map(Number);
    return vox.readUInt16LE(2 * (x + y * dx + z * dx * dy)) === 0;
  });
  check(huecas.length === 0, `${m.nombre}: toda nota tiene su pedestal debajo` +
    (huecas.length ? ` -> ${huecas.length} en el aire: ${huecas.slice(0, 3).join(' ')}` : ''));
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${ok} ok, ${fallos} fallos` + (fallos ? '' : '  ·  TODO OK'));
process.exit(fallos ? 1 : 0);
