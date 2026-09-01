// @area: general
// @necesita: node
//
// F7.4 · LA RONDA, Y SOBRE TODO QUE SEPA PONERSE ROJA.
//
// Un vigilante que no falla nunca es indistinguible de uno roto, y como corre desde un `.timer` que
// nadie mira, **nadie se enteraría**. Por eso aquí casi todo son casos MALOS: lo que se comprueba no
// es que sepa contar mundos, es que sepa gritar.
//
// El caso que justifica el fichero entero es §3: **una copia que dejó de hacerse hace tres semanas
// no se nota hasta el día que hace falta restaurar**. Es el fallo más caro de todo el despliegue y
// el único que no avisa solo.
//
// ⚠️ Todo pasa en `/tmp` y contra un servidor de mentira de dos líneas. ⛔ No toca el 8500 ni el 8510
// de verdad: comprobar «¿contesta?» contra la partida en vivo del dueño sería gratis, pero el día
// que este test aprenda a comprobar otra cosa ya no lo sería.

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const HERR = path.join(RAIZ, 'herramientas', 'vigilancia.py');

let ok = 0, fallos = 0;
const check = (c, m) => c ? (ok++, console.log('  ok    ' + m)) : (fallos++, console.log('  FALLO ' + m));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-vigila-'));
const FALSO = path.join(tmp, 'repo');
const DATA = path.join(FALSO, 'data');

// ⚠️ Las copias van a `/dev/shm`, que es OTRO sistema de ficheros (tmpfs), y no a un subdirectorio de
// `tmp`. No es capricho: `vigilancia.py` avisa cuando las copias caen en el mismo disco que el
// original —el error de F7.2 más fácil de cometer y el que deja la copia sirviendo para nada—, así
// que con las dos carpetas en `/tmp` el caso «no pasa nada» de §1 sale amarillo por un motivo real y
// deja de poder distinguirse del caso malo. Ese aviso se prueba aparte, en §5, y a propósito.
const shm = fs.existsSync('/dev/shm') ? '/dev/shm' : os.tmpdir();
const COPIAS = fs.mkdtempSync(path.join(shm, 'vf-vigila-copias-'));
const COPIAS_MISMO_DISCO = path.join(tmp, 'copias-mismo-disco');

// Un servidor de mentira para el «¿contesta?». Un puerto CERRADO no vale como prueba del caso bueno:
// hay que ver que un 200 de verdad lo da por bueno.
//
// ⚠️ EN OTRO PROCESO, y no un `http.createServer()` de aquí mismo. Es el fallo en el que cayó la
// primera versión de este test: todas las llamadas van con `spawnSync`, que BLOQUEA el bucle de
// eventos de Node, así que un servidor montado en este proceso no puede aceptar la conexión
// mientras dura la comprobación — y `vigilancia.py` la veía caída SIEMPRE. Los tres primeros
// apartados salían rojos por culpa del test, no del programa.
let puerto = 0;
let finge = null;

function puertoLibre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

function contesta(p) {
  return new Promise((res) => {
    const s = net.connect(p, '127.0.0.1');
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
    setTimeout(() => { s.destroy(); res(false); }, 300);
  });
}

// Una copia con la EDAD que se quiera: el nombre de la carpeta ES la fecha (ese es el trato con
// `copia_seguridad.copias()`), así que envejecerla es renombrarla, no tocar el reloj.
function copiaDeHace(horas, donde = COPIAS) {
  const d = new Date(Date.now() - horas * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const sello = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_` +
                `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  fs.mkdirSync(path.join(donde, sello), { recursive: true });
  fs.writeFileSync(path.join(donde, sello, 'MANIFIESTO.json'), '{}');
  return sello;
}

function vacia(d) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }

function corre(extra = [], destino = COPIAS) {
  const r = spawnSync('python3', [HERR, '--raiz', FALSO, '--destino', destino,
                                  '--sitio', `http://127.0.0.1:${puerto}/`,
                                  '--arbitro', `http://127.0.0.1:${puerto}/estado`,
                                  ...extra], { encoding: 'utf8' });
  return { nivel: r.status, salida: (r.stdout || '') + (r.stderr || '') };
}

(async () => {
try {
  puerto = await puertoLibre();
  finge = spawn('python3', ['-m', 'http.server', String(puerto), '--bind', '127.0.0.1'],
                { cwd: tmp, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await contesta(puerto)); i++)
    await new Promise((r) => setTimeout(r, 100));
  check(await contesta(puerto), `el servidor de mentira está en pie (127.0.0.1:${puerto})`);

  fs.mkdirSync(path.join(DATA, 'worlds'), { recursive: true });
  for (const m of ['zz-uno', 'zz-dos', 'zz-tres']) {
    fs.writeFileSync(path.join(DATA, 'worlds', m + '.json'), '{"format":"voxelworld-2"}');
    fs.writeFileSync(path.join(DATA, 'worlds', m + '.vox'), Buffer.alloc(2048, 1));
  }
  console.log('\n§1 con todo en su sitio, sale con 0 y cuenta lo que hay');
  copiaDeHace(2);
  const c1 = corre(['--json']);
  check(c1.nivel === 0, `nivel 0 cuando no pasa nada (${c1.nivel})\n        ${c1.salida.trim()}`);
  const j = JSON.parse(c1.salida);
  check(j.mundos === 3, `cuenta los mundos por su cabecera .json, no por ficheros (${j.mundos})`);
  check(j.bytes_datos >= 3 * 2048, `pesa data/ sin llamar a du (${j.bytes_datos} B)`);
  check(j.alarmas.length === 0 && j.avisos.length === 0,
        `y no se inventa ninguna queja (${[...j.alarmas, ...j.avisos].join(' · ') || 'ninguna'})`);

  console.log('\n§2 sin ninguna copia, ALARMA (no aviso)');
  vacia(COPIAS);
  const c2 = corre();
  check(c2.nivel === 2, `nivel 2 (${c2.nivel})`);
  check(/NO HAY NINGUNA COPIA/.test(c2.salida), 'y lo dice con todas las letras');

  console.log('\n§3 el fallo que no se nota: la copia que dejó de hacerse');
  vacia(COPIAS); copiaDeHace(30);
  const c3 = corre();
  check(c3.nivel === 1, `una copia de hace 30 h es AVISO, no alarma (${c3.nivel})`);
  vacia(COPIAS); copiaDeHace(24 * 21);
  const c3b = corre();
  check(c3b.nivel === 2, `una de hace tres semanas es ALARMA (${c3b.nivel})`);
  check(/última copia es de hace/.test(c3b.salida), 'y dice cuánto hace, que es el dato que duele');

  // La de las 3:30 lleva `RandomizedDelaySec=20m`: si el umbral fuera 24 h clavadas, este guardián
  // se pondría amarillo alguna madrugada sin que pasara nada y acabaría ignorándose.
  vacia(COPIAS); copiaDeHace(25);
  check(corre().nivel === 0, 'y 25 h NO se queja: el margen del RandomizedDelaySec está contado');

  console.log('\n§4 un puerto que no contesta es alarma');
  vacia(COPIAS); copiaDeHace(1);
  const muerto = spawnSync('python3', [HERR, '--raiz', FALSO, '--destino', COPIAS,
                                       '--sitio', `http://127.0.0.1:${puerto}/`,
                                       '--arbitro', 'http://127.0.0.1:9/'], { encoding: 'utf8' });
  const sal = (muerto.stdout || '') + (muerto.stderr || '');
  check(muerto.status === 2, `nivel 2 con el árbitro caído (${muerto.status})`);
  check(/no contesta/.test(sal) && /127\.0\.0\.1:9/.test(sal), 'y dice CUÁL de los dos es');
  check(/en \d+ ms/.test(sal), 'sin dejar de informar del que sí contesta');

  console.log('\n§5 las copias en el mismo disco que el original: aviso, no silencio');
  // Ahora SÍ a propósito, en un destino que cae bajo `tmp` igual que `data/`. Es el error de F7.2 más
  // fácil de cometer y el que hace que la copia no sirva para lo único que de verdad pasa: una copia
  // en el mismo disco protege del borrado por accidente y de nada más.
  fs.mkdirSync(COPIAS_MISMO_DISCO, { recursive: true });
  copiaDeHace(1, COPIAS_MISMO_DISCO);
  const c5 = corre(['--json'], COPIAS_MISMO_DISCO);
  const j5 = JSON.parse(c5.salida);
  check(/MISMA partición/.test(j5.disco_copias), `lo detecta (${j5.disco_copias})`);
  check(c5.nivel === 1 && j5.avisos.some((a) => /mismo disco/.test(a)),
        `y lo dice como aviso (nivel ${c5.nivel})`);
} finally {
  if (finge) finge.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(COPIAS, { recursive: true, force: true });   // vive fuera de `tmp`: se recoge aparte
}

console.log(`\n${ok} ok, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
})();
