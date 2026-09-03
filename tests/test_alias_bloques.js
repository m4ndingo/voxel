// @area: general
// @necesita: servidor, playwright
//
// BUG-SNP8 — «la ficha promete "espada" y el comportamiento me obliga a escribir el nombre largo».
//
// La ficha de `assets/espada-de-diamante.vox.json` dice que valen los tres nombres: `espada` (corto),
// `espada-de-diamante` (id) y «espada de diamante» (rótulo). Era verdad para el motor —`setVoxel` y
// `mcClaveDeNombre` resuelven el alias— y mentira para `game.bloques.define`, que se fabricaba su
// propio nombre corto partiendo la clave por `:` y `/` y nunca miraba `assets/index.json`.
//
// ⚠️ LO QUE HACE ÚTIL A ESTE TEST no es la línea que va bien, son las tres que tienen que SEGUIR mal.
// El arreglo pregunta al motor, y `mcClaveDeNombre` devuelve `'hab:'+nombre` para CUALQUIER cosa que
// no conozca (`app.js:9320`): si esa respuesta se diera por buena, toda errata pasaría a ser una
// clave válida y morirían en silencio los avisos de BUG-SNP1 («todavía no está en este mundo») y
// BUG-SNP2 (la familia). Por eso §3 y §4 valen tanto como §1.
//
// Se corre en `/map/test`, que es donde se prueba (⛔ nunca en `/map/default` ni `/map/agents`), y no
// planta ni un voxel: las dos espadas están en el catálogo del mapa, que es lo único que hace falta.

const { chromium } = require('playwright');

const DIAMANTE = 'asset:assets/espada-de-diamante.vox.json';
const LUZ = 'asset:assets/espada-de-luz.vox.json';

let ok = 0, fallos = 0;
const check = (c, m, extra) => c
  ? (ok++, console.log('  ok    ' + m + (extra ? '   (' + extra + ')' : '')))
  : (fallos++, console.log('  FALLO ' + m + (extra ? '   (' + extra + ')' : '')));

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.active && typeof game!=="undefined"',
    null, { timeout: 180000 });
  // `mc.active` llega ANTES que el autoarranque, y `game.bloques` lo monta él: sin esta espera el
  // test mediría contra un mundo que todavía no tiene ni la función que se está probando.
  await p.waitForFunction('typeof game!=="undefined" && game.bloques && typeof game.bloques.define==="function"',
    null, { timeout: 180000 });
  await p.waitForTimeout(1200);

  const r = await p.evaluate(() => {
    // Un comportamiento DE VERDAD: `define` devuelve `null` y avisa si la ficha no hace nada (nota y
    // alcance solos no son comportamiento), y ese `null` se confundiría con el de «no te encuentro».
    const cfg = () => ({ nota: 'Acercate y la coges', alcance: 1, consume: false, alCoger: function () {} });
    const clave = (x) => (x && x.clave) || null;
    return {
      corto: clave(game.bloques.define('espada', cfg())),
      largo: clave(game.bloques.define('asset:assets/espada-de-diamante.vox.json', cfg())),
      id: clave(game.bloques.define('espada-de-diamante', cfg())),
      otra: clave(game.bloques.define('espada-de-luz', cfg())),
      typo: game.bloques.define('espadda', cfg()),
      inventado: game.bloques.define('zz-esto-no-existe', cfg()),
      motor: (typeof mcClaveDeNombre === 'function') ? mcClaveDeNombre('espada') : null,
      // ⛔ La prueba de que no se está aceptando el `'hab:'+n` de la caída: ese nombre no existe en
      // ningún sitio y el motor contesta `hab:zz-esto-no-existe` tan tranquilo.
      caida: (typeof mcClaveDeNombre === 'function') ? mcClaveDeNombre('zz-esto-no-existe') : null,
    };
  });

  console.log('\n§1 el nombre corto de la ficha activa la pieza');
  check(r.corto === DIAMANTE, 'define("espada") → la espada de diamante', r.corto);
  check(r.largo === DIAMANTE, 'y la clave entera sigue valiendo, claro', r.largo);
  check(r.id === DIAMANTE, 'y el id del fichero también', r.id);

  console.log('\n§2 el alias no se lleva por delante a la pieza de al lado');
  // Las dos espadas se ven la una a la otra por subcadena: si el arreglo resolviera por parecido en
  // vez de por la tabla del motor, `espada-de-luz` acabaría siendo la de diamante (o al revés).
  check(r.otra === LUZ, 'define("espada-de-luz") → la espada de luz', r.otra);

  console.log('\n§3 ⛔ una errata SIGUE siendo una errata (BUG-SNP1/BUG-SNP2)');
  check(r.typo === null, 'define("espadda") no cuela', JSON.stringify(r.typo));
  check(r.inventado === null, 'define("zz-esto-no-existe") tampoco', JSON.stringify(r.inventado));

  console.log('\n§4 …y esto es lo que habría pasado fiándose del motor a ciegas');
  check(r.motor === DIAMANTE, 'el motor sí sabe el alias (es de donde se saca)', r.motor);
  check(r.caida === 'hab:zz-esto-no-existe',
        'pero contesta `hab:<lo que sea>` a lo que no conoce: por eso se cruza con la paleta', r.caida);

  console.log('\n§5 sin errores en la página');
  check(errores.length === 0, 'ningún pageerror', errores.join(' · '));

  await b.close();
  console.log(`\n${ok} ok, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})();
