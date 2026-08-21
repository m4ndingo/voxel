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

const RAIZ = path.join(__dirname, '..');
const HOST = 'http://localhost:8500';

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

  console.log(`\n${ok} ok / ${fallos} fallos` + (fallos ? '' : '  ·  TODO OK'));
  process.exit(fallos ? 1 : 0);
})();
