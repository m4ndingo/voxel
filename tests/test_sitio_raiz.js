// @area: general
// @necesita: servidor
//
// Guardián de la mudanza del 2026-08-13: el sitio (los .html/.js/.css) bajó de la raíz del repo a
// `web/`, y las URL NO cambiaron — `/app.js` sigue siendo `/app.js`. Quien decide de qué carpeta de
// disco sale cada URL es `Handler.translate_path` en `server.py`, por el PRIMER TRAMO de la ruta:
// `assets`, `data`, `wiki` e `images` salen del repo; todo lo demás, de `web/`.
//
// Eso se rompe en silencio de dos maneras, y las dos se notan tarde:
//
//   · Alguien añade una carpeta que el navegador pide por URL y no la mete en `RAIZ_URL`: 404 en
//     producción, y en local no se ve porque el fichero SÍ está en disco.
//   · Alguien vuelve a servir el repo entero, y `/server.py`, `/PLAN.md` o `/tests/` quedan
//     publicados por HTTP. Es la mitad del motivo de la mudanza.
//
// Las URL de la primera parte NO van escritas a mano: se sacan de los `href=`/`src=` de las páginas
// reales, así que una página nueva con un enlace nuevo entra sola en la comprobación.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PUERTO = +(process.argv[2] || 8500);
const HOST = 'http://localhost:' + PUERTO;

let ok = 0, fallos = 0;
const check = (c, m) => c ? (ok++, console.log('  ok  ' + m)) : (fallos++, console.log('  FALLO  ' + m));

// Las páginas que sirve el sitio, con la carpeta desde la que las sirve `server.py`.
const PAGINAS = ['web/index.html', 'web/fotos.html', 'web/mapas.html',
                 'images/index.html', 'wiki/index.html'];

// Toda URL absoluta que una página pide al cargar. Se descartan las que llevan `${…}` (se arman en
// tiempo de ejecución con datos que aquí no existen) y las anclas.
function urlsDe(pagina) {
  const html = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
  const out = new Set();
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    if (!m[1].includes('${') && !m[1].startsWith('//')) out.add(m[1]);
  }
  return [...out];
}

const pedidas = new Map();               // url -> páginas que la piden
for (const p of PAGINAS) {
  for (const u of urlsDe(p)) pedidas.set(u, (pedidas.get(u) || []).concat(p));
}

// Lo que NO puede estar servido: el código y los documentos de trabajo. Se piden por su URL
// «natural», la que tendría cualquiera que probase a mirar.
const VETADAS = ['/server.py', '/servidor/mundos.py', '/servidor/voxfmt.py', '/PLAN.md',
                 '/CLAUDE.md', '/tests/test_sitio_raiz.js', '/correr_tests.js', '/package.json',
                 '/redstone/redstone.js', '/herramientas/parche_snp1.py',
                 '/web/app.js', '/web/index.html'];   // ...y `web/` no se puede pedir dos veces

const estado = async (u) => (await fetch(HOST + u, { redirect: 'manual' })).status;

(async () => {
  console.log(`\n§1 las ${pedidas.size} URL que piden las páginas del sitio contestan 200`);
  check(pedidas.size >= 8, `hay URL que comprobar (${pedidas.size} sacadas de ${PAGINAS.length} páginas)`);
  for (const [u, quien] of [...pedidas].sort()) {
    const s = await estado(u);
    check(s === 200, `${u} → ${s}   (la pide ${quien.join(', ')})`);
  }

  console.log('\n§2 el editor y el motor siguen en su URL de siempre, sin barra ni prefijo nuevo');
  for (const u of ['/', '/app.js', '/style.css', '/scrollbars.css', '/iconos.js',
                   '/mapas.html', '/fotos.html', '/index.html']) {
    const s = await estado(u);
    check(s === 200, `${u} → ${s}`);
  }

  console.log('\n§3 el código NO se sirve por HTTP');
  for (const u of VETADAS) {
    const s = await estado(u);
    check(s === 404, `${u} → ${s}`);
  }

  console.log('\n§4 y lo que sí sale del repo (los datos) sigue saliendo');
  // `/performance/*.js` entró en `RAIZ_URL` el 2026-08-21: son sondas de consola, y se cargan con
  // `await import('/performance/<sonda>.js')` en vez de pegar 35 KB a mano.
  for (const u of ['/assets/index.json', '/data/ui/ranuras.json', '/wiki/wiki.js', '/images/',
                   '/performance/consola_donde_va_el_frame.js']) {
    const s = await estado(u);
    check(s === 200, `${u} → ${s}`);
  }

  console.log('\n§5 ninguna carpeta se lista, ni en desarrollo');
  // `SimpleHTTPRequestHandler` trae listado de carpeta de serie, y con `data` en `RAIZ_URL` eso era
  // un índice navegable de `data/tickets/` (capturas y conversaciones del dueño), `data/informes/`
  // y 1,5 GB de `data/habitantes_trash/`. `list_directory` devuelve 404 — 404 y no 403, para que no
  // se pueda distinguir «existe pero no te lo doy» de «no existe».
  for (const u of ['/data/', '/data/tickets/', '/data/habitantes_trash/', '/data/worlds/', '/assets/']) {
    const s = await estado(u);
    check(s === 404, `${u} → ${s}`);
  }
  check(await estado('/images/') === 200, '/images/ → 200 (esa sí, porque tiene su index.html)');

  console.log('\n§6 en modo público `data/` deja de servirse entero (servidor propio, puerto aparte)');
  // Este trozo necesita su propio servidor: el cierre lo enciende `VOXELFORGE_PUBLICO=1`, y el 8500
  // de desarrollo tiene que seguir sirviendo `/performance/` y `/data/tickets/` como siempre.
  const PUB = PUERTO + 90;
  // `VOXELFORGE_SECRETO_SESION` NO es decorado: en modo público `server.py` se niega a arrancar sin
  // él (firma las cookies de sesión; sin secreto, cualquiera se firma la suya). Sin esta línea el
  // hijo hacía `sys.exit` al instante y el fallo salía como «no levantó en el 8689», que no dice
  // nada. Por eso el `stderr` se queda a la vista en vez de irse a `ignore`: el próximo motivo por
  // el que este servidor no arranque también será una línea de Python que merece leerse.
  const hijo = spawn('python3', [path.join(RAIZ, 'server.py'), String(PUB)],
                     { cwd: RAIZ, stdio: ['ignore', 'ignore', 'inherit'],
                       env: { ...process.env, VOXELFORGE_PUBLICO: '1',
                              VOXELFORGE_SECRETO_SESION: 'secreto-de-pruebas-test-sitio-raiz' } });
  try {
    await arranca(PUB);
    const pub = async (u) => {
      const r = await fetch(`http://localhost:${PUB}${u}`, { redirect: 'manual' }).catch(() => null);
      return r ? r.status : 0;
    };
    for (const [u, esperado, porque] of [
      ['/data/tickets/BUG-AG3/contexto.md', 404, 'los tickets son del dueño, no del público'],
      ['/data/habitantes_trash/', 404, 'la papelera, menos todavía'],
      ['/performance/consola_donde_va_el_frame.js', 404, 'las sondas son de desarrollo'],
      ['/data/ui/marca-64.png', 200, 'los iconos SÍ: el sitio los pide'],
      ['/data/fotos/0001_test_20260805-103938.png', 200, 'y la galería de fotos también'],
      ['/assets/index.json', 200, 'y los assets, que es de donde salen los nombres cortos'],
      ['/app.js', 200, 'el motor se sigue sirviendo, faltaría más'],
    ]) {
      const s = await pub(u);
      check(s === esperado, `[público] ${u} → ${s} (esperado ${esperado}) · ${porque}`);
    }
  } finally {
    hijo.kill();
  }

  console.log(`\n${ok} ok / ${fallos} fallos` + (fallos ? '' : '  ·  TODO OK'));
  process.exit(fallos ? 1 : 0);
})();

// Esperar a que el hijo conteste, en vez de dormir un número inventado de segundos: en una máquina
// cargada el `sleep 2` falla de vez en cuando y nadie sabe por qué.
async function arranca(puerto, intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    const r = await fetch(`http://localhost:${puerto}/app.js`, { method: 'HEAD' }).catch(() => null);
    if (r) return true;
    await new Promise((r2) => setTimeout(r2, 100));
  }
  throw new Error(`el servidor de pruebas no levantó en el ${puerto}`);
}
