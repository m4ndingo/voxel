// @area: general
// @necesita: node
//
// F7.2 · LA COPIA, Y SOBRE TODO LA RESTAURACIÓN.
//
// «Una copia sin restauración probada no es una copia» es la frase del plan, y este fichero es lo
// que hace que deje de ser una frase: el criterio de cierre nº6 para publicar es literalmente
// «restaurar una copia de `data/worlds` en una carpeta vacía y que el mundo arranque», y eso se
// comprueba en §3 con la MISMA función con la que el servidor decide si un mundo es utilizable
// (`voxfmt.completo`), no con un `ls`.
//
// Los tres fallos que se vigilan, que son distintos entre sí:
//   · que la copia no lleve algo (§1) — se descubre el día que hace falta;
//   · que la copia se lleve un mundo DESGARRADO y no lo diga (§2) — el peor, porque parece verde;
//   · que la poda se lleve la última copia buena (§4) — el que convierte la red en un agujero.
//
// ⚠️ Todo pasa en `/tmp`: se fabrica un repo de mentira con su `data/`. No toca ni `data/` de verdad
// ni levanta servidor — un mundo aquí son dos ficheros, y eso se puede fabricar a mano.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const HERR = path.join(RAIZ, 'herramientas', 'copia_seguridad.py');

let ok = 0, fallos = 0;
const check = (c, m) => c ? (ok++, console.log('  ok    ' + m)) : (fallos++, console.log('  FALLO ' + m));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-copia-'));
const FALSO = path.join(tmp, 'repo');
const DATA = path.join(FALSO, 'data');
const COPIAS = path.join(tmp, 'copias');

function corre(...args) {
  const r = spawnSync('python3', [HERR, '--raiz', FALSO, '--destino', COPIAS, ...args],
                      { encoding: 'utf8' });
  return { code: r.status, salida: (r.stdout || '') + (r.stderr || '') };
}

// Un mundo voxelworld-2 SON DOS FICHEROS, y el `.vox` mide exactamente x*y*z*2 bytes. Fabricarlo a
// mano es justamente lo que deja probar el desgarro de §2 sin tocar nada de verdad.
function mundo(slug, x, y, z, { bytes } = {}) {
  fs.writeFileSync(path.join(DATA, 'worlds', slug + '.json'), JSON.stringify({
    format: 'voxelworld-2', dim: { x, y, z },
    palette: ['air', 'asset:assets/roca.vox.json'], structures: [],
  }));
  fs.writeFileSync(path.join(DATA, 'worlds', slug + '.vox'),
                   Buffer.alloc(bytes === undefined ? x * y * z * 2 : bytes, 1));
}

try {
  for (const c of ['worlds', 'snippets', 'usuarios', 'perfiles', 'habitantes', 'agentes', 'fotos'])
    fs.mkdirSync(path.join(DATA, c), { recursive: true });
  mundo('zz-uno', 4, 4, 4);
  mundo('zz-dos', 8, 2, 8);
  fs.writeFileSync(path.join(DATA, 'snippets', 'zz-snip.json'), '{"id":"zz-snip","code":"// hola"}');
  fs.writeFileSync(path.join(DATA, 'usuarios', 'zz-ana.json'), '{"uid":"zz-ana","hash":"x"}');
  fs.writeFileSync(path.join(DATA, 'mundo.json'), '{"format":"voxelforge-1"}');

  console.log('\n§1 la copia se lleva lo irremplazable, y lo dice en un manifiesto');
  const c1 = corre();
  check(c1.code === 0, `una copia limpia sale con 0 (${c1.code})\n        ${c1.salida.trim()}`);
  const sellos = fs.readdirSync(COPIAS).filter((d) => /^\d{4}-/.test(d));
  check(sellos.length === 1, `y deja UNA carpeta (${sellos.join(', ')})`);
  const dir1 = path.join(COPIAS, sellos[0]);
  const man = JSON.parse(fs.readFileSync(path.join(dir1, 'MANIFIESTO.json'), 'utf8'));
  check(man.completa === true && man.mundos.ok === 2 && man.mundos.total === 2,
        `manifiesto: ${man.mundos.ok}/${man.mundos.total} mundos ok`);
  for (const q of ['worlds/zz-uno.json', 'worlds/zz-uno.vox', 'snippets/zz-snip.json',
                   'usuarios/zz-ana.json', 'mundo.json'])
    check(fs.existsSync(path.join(dir1, q)), `está ${q}`);
  check(!fs.readdirSync(COPIAS).some((d) => d.endsWith('.parcial')),
        'y no queda ningún «.parcial» (el nombre bueno se pone al final, con un rename)');

  console.log('\n§2 un mundo DESGARRADO no puede pasar por bueno');
  // El `.vox` con menos bytes de los que dice la cabecera es exactamente lo que deja un
  // redimensionado a medias, y es el único desgarro que importa: la escritura en sitio no puede
  // romper el fichero, solo dejarlo con bloques viejos.
  fs.truncateSync(path.join(DATA, 'worlds', 'zz-dos.vox'), 10);
  const c2 = corre();
  check(c2.code === 2, `la copia sale con 2, no con 0 (${c2.code})`);
  check(/INCOMPLETA/.test(c2.salida) && /zz-dos/.test(c2.salida),
        'y dice EN VOZ ALTA cuál es el mundo que no cuadra');
  const dir2 = path.join(COPIAS, fs.readdirSync(COPIAS).filter((d) => /^\d{4}-/.test(d)).sort().pop());
  const man2 = JSON.parse(fs.readFileSync(path.join(dir2, 'MANIFIESTO.json'), 'utf8'));
  check(man2.completa === false && man2.mundos.incompletos.includes('zz-dos'),
        'el manifiesto lo deja escrito (una copia que miente es peor que no tenerla)');
  check(man2.mundos.ok === 1, 'y el mundo sano sí se copió: un desgarro no tira la copia entera');

  console.log('\n§3 el criterio de cierre nº6: restaurar en una carpeta vacía y que valga');
  fs.copyFileSync(path.join(dir1, 'worlds', 'zz-dos.vox'), path.join(DATA, 'worlds', 'zz-dos.vox'));
  const destino = path.join(tmp, 'restaurado');
  const c3 = corre('--restaurar', sellos[0], '--a', destino);
  check(c3.code === 0, `restaurar la copia buena sale con 0 (${c3.code})\n        ${c3.salida.trim()}`);
  check(/2 ok/.test(c3.salida), 'y verifica los DOS mundos al restaurar, no solo los lista');
  check(fs.readFileSync(path.join(destino, 'worlds', 'zz-uno.vox')).length === 4 * 4 * 4 * 2,
        'la rejilla restaurada mide lo que dice su cabecera');
  check(fs.readFileSync(path.join(destino, 'snippets', 'zz-snip.json'), 'utf8').includes('hola'),
        'y los snippets vuelven enteros (1,7 MB, lo más irremplazable del repo)');

  const c3b = corre('--restaurar', sellos[0], '--a', destino);
  check(c3b.code === 1 && /no está vacía/.test(c3b.salida),
        'restaurar encima de algo se NIEGA sin --forzar (restaurar sobre `data/` en uso es como no tener copia)');

  console.log('\n§4 la poda: 7 diarias + 4 semanales, y nunca la última buena');
  const podadero = path.join(tmp, 'podadero');
  fs.mkdirSync(podadero);
  const dias = [];
  for (let i = 0; i < 40; i++) {                       // 40 días seguidos de copias
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    const s = d.toISOString().slice(0, 10) + '_030000';
    fs.mkdirSync(path.join(podadero, s));
    fs.writeFileSync(path.join(podadero, s, 'MANIFIESTO.json'), '{}');
    dias.push(s);
  }
  const r4 = spawnSync('python3', ['-c',
    'import sys; sys.path.insert(0, sys.argv[1]);' +
    'import importlib.util as u; e=u.spec_from_file_location("c", sys.argv[2]); m=u.module_from_spec(e);' +
    'e.loader.exec_module(m); print("\\n".join(m.poda(sys.argv[3])))',
    RAIZ, HERR, podadero], { encoding: 'utf8' });
  const quedan = fs.readdirSync(podadero).sort();
  check(r4.status === 0, `la poda corre (${(r4.stderr || '').trim()})`);
  check(quedan.length <= 11 && quedan.length >= 10,
        `quedan ${quedan.length} copias de 40 (7 diarias + hasta 4 semanales)`);
  check(quedan[quedan.length - 1] === dias[dias.length - 1],
        'y la MÁS NUEVA sigue ahí (si la poda se lleva ésa, la red es un agujero)');
  check(dias.slice(-7).every((d) => quedan.includes(d)), 'las 7 últimas diarias, todas');
  const viejas = quedan.filter((q) => !dias.slice(-7).includes(q));
  check(viejas.length >= 3 && new Set(viejas).size === viejas.length,
        `y ${viejas.length} semanales más atrás: ${viejas.join(' ')}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${ok} ok, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
