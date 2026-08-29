// @area: editor
// @necesita: servidor, playwright
// REQ-SNP-PIN · Chinchetas en el gestor de snippets: «en el editor de codigo quiero poder "pinear"
// scripts para que queden arriba (en plan chincheta)» (el dueño, 2026-08-28).
//
// El listado llega del servidor ordenado por `savedAt` descendente (`list_snips`, server.py) y
// `renderSnipList` lo pinta tal cual, asi que lo que uno usa cada dia se hunde en cuanto se guarda
// cualquier otra cosa. La chincheta sube esas fichas al principio.
//
// LO QUE DE VERDAD SE PRUEBA AQUI (lo demas es decorado):
//   · la chincheta SOLO ASCIENDE: el orden relativo del resto no se baraja (`sort` estable). Un
//     `sort` con un comparador que devolviera ±1 al tuntun mezclaria la lista y nadie lo notaria
//     hasta llevar media hora buscando un snippet que estaba dos filas mas abajo.
//   · clavarla NO abre el snippet. La ficha entera es un <button> con `onclick=snipLoad`, asi que sin
//     `stopPropagation` cada chincheta seria ademas un cambio de snippet (y perder lo que estabas
//     escribiendo si no lo habias guardado).
//   · el estado vive en `localStorage` (`vf_snipPin`) y NO en el .json: el fichero del snippet no
//     puede cambiar de `savedAt` por clavar una chincheta, porque `savedAt` es la clave del orden.
//     El test lo comprueba por los dos lados: sobrevive a un F5 y el .json sigue con su fecha.
//   · `snipOrdenaPins` ordena una COPIA: `snips` es la lista completa que consulta el guardado para
//     avisar de un id repetido; pisarla seria un aviso de colision de menos.
//   · con el buscador en marcha (`snipVista`) manda igual la chincheta, sin perder resultados.
//
// Necesita el servidor vivo:  python3 server.py 8500     (otro puerto: node test_snip_chincheta.js 8599)
// Solo crea ids `zz-pin-…` y los retira al acabar, pase lo que pase: no toca ningun snippet del dueño.
const { chromium } = require('playwright');
const http = require('http');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};
const PUERTO = +(process.argv[2] || 8500);
const BASE = 'http://localhost:' + PUERTO;

function pide(metodo, ruta, cuerpo) {
  return new Promise((res, rej) => {
    const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo), 'utf8');
    const r = http.request({
      host: '127.0.0.1', port: PUERTO, path: ruta, method: metodo,
      headers: datos ? { 'Content-Type': 'application/json', 'Content-Length': datos.length } : {}
    }, (rp) => {
      let b = ''; rp.setEncoding('utf8');
      rp.on('data', c => { b += c; });
      rp.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} res({ code: rp.statusCode, d: j }); });
    });
    r.on('error', rej);
    if (datos) r.write(datos);
    r.end();
  });
}

// Cuatro fichas de las que se sabe el orden: se guardan en este orden, y el servidor ordena por fecha
// descendente ⇒ la lista las trae d, c, b, a. La chincheta va a la ULTIMA (`zz-pin-a`), que es la que
// mas lejos esta del principio.
const IDS = ['zz-pin-a', 'zz-pin-b', 'zz-pin-c', 'zz-pin-d'];
const PIEZAS = IDS.map((id, i) => ({ id, name: 'ZZ chincheta ' + id.slice(-1).toUpperCase(),
  code: '// zzPinRarisimo ' + i + '\n' }));

// Expresion, NO funcion: `p.evaluate(<string>)` la evalua en la pagina y ademas se interpola en los
// `waitForFunction`. Definirla como `() => '...'` devolveria la CADENA y todo saldria en falso.
const LISTA_IDS = `[...document.querySelectorAll('#snip-list .snip-item')].map(b=>b.dataset.snip)`;

(async () => {
  for (const s of PIEZAS) { await pide('POST', '/api/snippets', s); await new Promise(r => setTimeout(r, 1100)); }
  const fechas0 = Object.fromEntries((await Promise.all(
    IDS.map(async id => [id, ((await pide('GET', '/api/snippets/' + id)).d || {}).savedAt]))));

  const nav = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await nav.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));

  // `?noauto=1`: por la raiz, el autoarranque del dueño puede llevarse la pagina a otro mapa.
  await p.goto(BASE + '/?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof renderSnipList==="function" && typeof snipOrdenaPins==="function"',
    null, { timeout: 120000 });
  await p.evaluate(() => localStorage.removeItem('vf_snipPin'));
  await p.evaluate(async () => { await openSnips(); });
  await p.waitForFunction(`document.querySelectorAll('#snip-list .snip-item').length>4`, null, { timeout: 60000 });

  console.log('\n§1 · cada ficha lleva UNA chincheta, y ninguna clavada de salida');
  const a1 = await p.evaluate(() => {
    const it = [...document.querySelectorAll('#snip-list .snip-item')];
    return { n: it.length, pins: it.filter(b => b.querySelectorAll('.snip-pin').length === 1).length,
      onces: document.querySelectorAll('#snip-list .snip-pin.is-on').length,
      rol: (document.querySelector('#snip-list .snip-pin') || {}).tagName };
  });
  ok('todas las fichas tienen chincheta', a1.pins === a1.n && a1.n > 4, JSON.stringify(a1));
  ok('ninguna clavada con el localStorage vacio', a1.onces === 0);
  // Un <button> dentro de otro <button> no es HTML valido: el parser lo saca del padre y la ficha se
  // parte en dos. Por eso la chincheta es un <span role=button>.
  ok('la chincheta es un SPAN, no un <button> anidado', a1.rol === 'SPAN', String(a1.rol));

  const antes = await p.evaluate(LISTA_IDS);
  ok('el servidor las trae por fecha descendente (d,c,b,a)',
    antes.indexOf('zz-pin-d') < antes.indexOf('zz-pin-c')
    && antes.indexOf('zz-pin-c') < antes.indexOf('zz-pin-b')
    && antes.indexOf('zz-pin-b') < antes.indexOf('zz-pin-a'),
    IDS.map(i => i + '@' + antes.indexOf(i)).join(' '));

  console.log('\n§2 · clavarla sube la ficha al principio, y no abre el snippet');
  const abiertoAntes = await p.evaluate(() => snipCur);
  await p.evaluate(() => {
    document.querySelector('#snip-list .snip-item[data-snip="zz-pin-a"] .snip-pin').click();
  });
  await p.waitForTimeout(300);
  const despues = await p.evaluate(LISTA_IDS);
  ok('la fijada es la PRIMERA de la lista', despues[0] === 'zz-pin-a', despues.slice(0, 3).join(' '));
  ok('no se pierde ni se duplica ninguna ficha', despues.length === antes.length
    && new Set(despues).size === despues.length, antes.length + ' → ' + despues.length);
  ok('clavarla NO cambia el snippet abierto', (await p.evaluate(() => snipCur)) === abiertoAntes,
    abiertoAntes + ' → ' + (await p.evaluate(() => snipCur)));
  ok('la chincheta queda encendida, y solo esa',
    (await p.evaluate(() => document.querySelectorAll('#snip-list .snip-pin.is-on').length)) === 1);
  ok('aria-pressed lo cuenta', (await p.evaluate(() =>
    document.querySelector('#snip-list .snip-item[data-snip="zz-pin-a"] .snip-pin').getAttribute('aria-pressed'))) === 'true');

  console.log('\n§3 · SOLO ASCIENDE: el orden relativo del resto no se baraja');
  ok('los demas quedan como estaban',
    JSON.stringify(despues.slice(1)) === JSON.stringify(antes.filter(i => i !== 'zz-pin-a')),
    despues.slice(1, 4).join(' ') + ' vs ' + antes.filter(i => i !== 'zz-pin-a').slice(0, 3).join(' '));

  console.log('\n§4 · el estado es de la VISTA: localStorage, y el .json no se toca');
  ok('vf_snipPin guarda el id', JSON.parse(await p.evaluate(() => localStorage.getItem('vf_snipPin')) || '[]')
    .includes('zz-pin-a'), String(await p.evaluate(() => localStorage.getItem('vf_snipPin'))));
  const fechas1 = Object.fromEntries((await Promise.all(
    IDS.map(async id => [id, ((await pide('GET', '/api/snippets/' + id)).d || {}).savedAt]))));
  // Si esto se guardara con un POST, `savedAt` cambiaria... y `savedAt` es la clave del orden.
  ok('ningun snippet ha cambiado de savedAt', JSON.stringify(fechas0) === JSON.stringify(fechas1),
    JSON.stringify(fechas1));
  const ja = (await pide('GET', '/api/snippets/zz-pin-a')).d || {};
  ok('el .json sigue con sus cuatro campos de siempre, sin uno nuevo de chincheta',
    ['id', 'name', 'code', 'savedAt'].every(k => k in ja) && Object.keys(ja).length === 4,
    JSON.stringify(Object.keys(ja)));

  console.log('\n§5 · `snipOrdenaPins` ordena una COPIA (no pisa `snips` ni `snipVista`)');
  const a5 = await p.evaluate(() => {
    const orig = snips.map(s => s.id);
    const sal = snipOrdenaPins(snips);
    return { intacto: JSON.stringify(snips.map(s => s.id)) === JSON.stringify(orig),
      otra: sal !== snips, primero: sal[0] && sal[0].id };
  });
  ok('`snips` sigue en su orden', a5.intacto);
  ok('devuelve otro array', a5.otra);
  ok('con la fijada delante', a5.primero === 'zz-pin-a', String(a5.primero));

  console.log('\n§6 · con el buscador en marcha manda igual la chincheta');
  await p.evaluate(async () => { await snipBusca('zzPinRarisimo'); });
  await p.waitForFunction(`${LISTA_IDS}.length===4`, null, { timeout: 20000 });
  const a6 = await p.evaluate(LISTA_IDS);
  ok('salen los cuatro resultados, ni uno menos', a6.length === 4 && IDS.every(i => a6.includes(i)), a6.join(' '));
  ok('la fijada, la primera tambien aqui', a6[0] === 'zz-pin-a', a6.join(' '));
  await p.evaluate(() => snipVerTodos());
  await p.waitForTimeout(300);

  console.log('\n§7 · recargar la pagina conserva las chinchetas');
  await p.reload({ waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof renderSnipList==="function"', null, { timeout: 120000 });
  await p.evaluate(async () => { await openSnips(); });
  await p.waitForFunction(`document.querySelectorAll('#snip-list .snip-item').length>4`, null, { timeout: 60000 });
  ok('tras F5 sigue arriba', (await p.evaluate(LISTA_IDS))[0] === 'zz-pin-a',
    (await p.evaluate(LISTA_IDS)).slice(0, 3).join(' '));

  console.log('\n§8 · quitarla la devuelve a su sitio de siempre');
  await p.evaluate(() => {
    document.querySelector('#snip-list .snip-item[data-snip="zz-pin-a"] .snip-pin').click();
  });
  await p.waitForTimeout(300);
  const a8 = await p.evaluate(LISTA_IDS);
  ok('vuelve el orden por fecha, exacto', JSON.stringify(a8) === JSON.stringify(antes),
    a8.slice(0, 3).join(' ') + ' vs ' + antes.slice(0, 3).join(' '));
  ok('vf_snipPin queda vacio', (await p.evaluate(() => localStorage.getItem('vf_snipPin'))) === '[]',
    String(await p.evaluate(() => localStorage.getItem('vf_snipPin'))));

  ok('sin errores de pagina', errores.length === 0, errores.slice(0, 3).join(' | '));
  await nav.close();
})()
  .catch(e => { console.error(e); fallos++; })
  .then(async () => {
    for (const s of PIEZAS) await pide('DELETE', '/api/snippets/' + s.id);   // la limpieza va SIEMPRE
    const quedan = ((await pide('GET', '/api/snippets')).d || []).filter(s => s.id.startsWith('zz-pin-'));
    ok('\n  limpieza: no queda ningun zz-pin-', quedan.length === 0, JSON.stringify(quedan.map(s => s.id)));
    console.log('\n' + (fallos ? '❌' : '✅') + '  ' + fallos + ' fallos');
    process.exit(fallos ? 1 : 0);
  });
