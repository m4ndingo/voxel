// @area: editor
// @necesita: servidor
// La IDENTIDAD de un asset es su RUTA dentro de `assets/`, no el nombre del fichero.
//
// El bug que cierra esto lo cazo el dueno usando el editor (2026-08-27): «abro
// "asset:assets/trees_mock/pino.vox.json" lo modifico, le doy a guardar y me lo crea como
// "asset:assets/pino.vox.json"; le doy borrar el antiguo, y en lugar de quedar el nuevo borra ese».
// Dos sintomas, UNA causa: el catalogo sacaba el id del NOMBRE del fichero (`pino`) y tiraba la carpeta.
// A partir de ahi todo el servidor creia que `trees_mock/pino` y `pino` eran el mismo asset, y cada
// camino que reconstruia la ruta (`assets/<id>.vox.json`) apuntaba a la raiz. Guardar escribia el de la
// raiz; borrar «el antiguo» borraba ese mismo, o sea el recien guardado.
//
// Y no eran duplicados que sobraran: en la galeria del dueno conviven `trees_mock/cerezo` («Cerezo»,
// 2165 vox) y `cerezo` («Gran Cerezo Imperial», 34102 vox). Son dos dibujos DISTINTOS que el id viejo
// aplastaba en uno. Por eso la cura es separar ids, no borrar ficheros.
//
// ⛔ Y hay una consecuencia de seguridad: si el id admite `/`, admite `..`. Por el id pasan un POST que
// ESCRIBE y un DELETE que BORRA, asi que `_asset_path` devuelve `None` para todo lo que se salga de
// `assets/` y sus cuatro llamantes tienen que tratarlo. Eso tambien se prueba aqui.
//
// Necesita el servidor vivo:  python3 server.py 8500     (otro puerto: node test_assets_subcarpeta.js 8599)
// Solo escribe dentro de `assets/test_subcarpeta/` y lo retira al acabar.
const http = require('http');
const fs = require('fs');
const path = require('path');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};
const PUERTO = +(process.argv[2] || 8500);

function pide(metodo, ruta, cuerpo) {
  return new Promise((res, rej) => {
    const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo), 'utf8');
    const r = http.request({
      host: '127.0.0.1', port: PUERTO, path: ruta, method: metodo,
      headers: datos ? { 'Content-Type': 'application/json', 'Content-Length': datos.length } : {}
    }, (rp) => {
      let b = ''; rp.setEncoding('utf8');
      rp.on('data', (c) => { b += c; });
      rp.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} res({ code: rp.statusCode, d: j, raw: b }); });
    });
    r.on('error', rej);
    if (datos) r.write(datos);
    r.end();
  });
}

const CARPETA = 'test_subcarpeta';
const dibujo = (nombre, color) => ({
  format: 'voxelforge-1', size: 2, meta: { name: nombre },
  voxels: { '0,0,0': color, '1,0,0': color }
});
const enDisco = (rel) => fs.existsSync(path.join('assets', rel));
const limpia = () => {
  for (const rel of [CARPETA, '.']) {
    const dir = path.join('assets', rel);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('test-arbol') || f.startsWith('test-piedra')) fs.unlinkSync(path.join(dir, f));
    }
  }
  if (fs.existsSync(path.join('assets', CARPETA))) {
    try { fs.rmdirSync(path.join('assets', CARPETA)); } catch (e) {}
  }
};

(async () => {
  limpia();

  // ── Alta en subcarpeta: el id LLEVA la carpeta ──────────────────────────────────────────────
  const post = await pide('POST', '/api/assets', { ...dibujo('test arbol', '#0a0'), id: CARPETA + '/test-arbol' });
  ok('POST en subcarpeta responde el id CON su carpeta', post.code === 200 && post.d && post.d.id === CARPETA + '/test-arbol',
    post.d && (post.d.id || post.d.error));
  ok('...y el fichero cae en la subcarpeta', enDisco(CARPETA + '/test-arbol.vox.json'));
  // ⛔ Este es EL sintoma que denuncio el dueno: el gemelo fantasma en la raiz.
  ok('...y NO se crea el gemelo en la raiz de assets/', !enDisco('test-arbol.vox.json'));

  // ── Re-guardar (que es lo que hace «Guardar» del editor) pisa el MISMO fichero ──────────────
  const re = await pide('POST', '/api/assets', { ...dibujo('test arbol', '#00a'), id: CARPETA + '/test-arbol' });
  ok('re-guardar devuelve el mismo id', re.code === 200 && re.d.id === CARPETA + '/test-arbol', re.d && re.d.id);
  ok('...sigue sin haber gemelo en la raiz', !enDisco('test-arbol.vox.json'));
  const leido = await pide('GET', '/api/assets/' + CARPETA + '/test-arbol');
  ok('GET por el id con carpeta sirve el dibujo', leido.code === 200 && !!leido.d && !!leido.d.voxels, leido.code);
  ok('...y es la version NUEVA, no la primera', leido.d && leido.d.voxels['0,0,0'] === '#00a',
    leido.d && leido.d.voxels && leido.d.voxels['0,0,0']);

  // ── Dos assets con el mismo nombre de fichero son DOS assets ────────────────────────────────
  // (el caso «Cerezo» / «Gran Cerezo Imperial» de la galeria del dueno, en pequeno)
  const raiz = await pide('POST', '/api/assets', { ...dibujo('test arbol de la raiz', '#a00'), id: 'test-arbol' });
  ok('el homonimo de la raiz se guarda aparte', raiz.code === 200 && raiz.d.id === 'test-arbol', raiz.d && raiz.d.id);
  ok('...y ahora existen LOS DOS ficheros', enDisco('test-arbol.vox.json') && enDisco(CARPETA + '/test-arbol.vox.json'));
  const dentro = await pide('GET', '/api/assets/' + CARPETA + '/test-arbol');
  ok('...sin pisarse: el de la subcarpeta conserva lo suyo', dentro.d.voxels['0,0,0'] === '#00a',
    dentro.d.voxels['0,0,0']);
  const fuera = await pide('GET', '/api/assets/test-arbol');
  ok('...y el de la raiz lo suyo', fuera.d.voxels['0,0,0'] === '#a00', fuera.d.voxels['0,0,0']);

  // ── El catalogo: un id por fichero, y el id ES la ruta ──────────────────────────────────────
  const lista = await pide('GET', '/api/assets');
  ok('GET /api/assets responde una lista', lista.code === 200 && Array.isArray(lista.d), lista.code);
  const cat = lista.d || [];
  const dupes = cat.map(a => a.id).filter((v, i, t) => t.indexOf(v) !== i);
  ok('ningun id repetido en todo el catalogo', dupes.length === 0, dupes.join(' '));
  // Sin esto, el cliente (que arma `asset:assets/<id>.vox.json`) apunta a un fichero que no existe:
  // asi es como quedaron colgados `asset:assets/roble.vox.json` y `asset:assets/yellow.vox.json`.
  const descuadre = cat.filter(a => a.file !== 'assets/' + a.id + '.vox.json');
  ok('el id de cada asset reconstruye su fichero', descuadre.length === 0,
    descuadre.slice(0, 3).map(a => a.id + ' != ' + a.file).join(' · '));
  ok('...y el catalogo trae el de la subcarpeta con su carpeta',
    cat.some(a => a.id === CARPETA + '/test-arbol'));
  // El id lleva la carpeta; el ROTULO no, que nadie quiere leer «Test_Subcarpeta/Test-Piedra».
  fs.writeFileSync(path.join('assets', CARPETA, 'test-piedra.vox.json'),
    JSON.stringify({ format: 'voxelforge-1', size: 2, voxels: { '0,0,0': '#888' } }));
  const lista2 = await pide('GET', '/api/assets');
  const piedra = (lista2.d || []).find(a => a.id === CARPETA + '/test-piedra');
  ok('un .vox.json suelto en subcarpeta entra al catalogo con su ruta', !!piedra);
  ok('...pero su nombre visible sale del fichero, sin la carpeta', !!piedra && piedra.name === 'Test Piedra',
    piedra && piedra.name);

  // ── Borrar el de la subcarpeta borra ESE ────────────────────────────────────────────────────
  // El segundo sintoma del dueno: «le doy borrar el antiguo, y en lugar de quedar el nuevo borra ese».
  const del = await pide('DELETE', '/api/assets/' + CARPETA + '/test-arbol');
  ok('DELETE del id con carpeta responde ok', del.code === 200, del.code);
  ok('...y se lleva el de la subcarpeta', !enDisco(CARPETA + '/test-arbol.vox.json'));
  ok('...⛔ y NO el homonimo de la raiz', enDisco('test-arbol.vox.json'));
  const quedan = await pide('GET', '/api/assets');
  ok('el catalogo ya no lo lista', !(quedan.d || []).some(a => a.id === CARPETA + '/test-arbol'));
  ok('...pero si al de la raiz', (quedan.d || []).some(a => a.id === 'test-arbol'));

  // ── ⛔ Salirse de assets/ no se permite: por aqui se ESCRIBE y se BORRA ──────────────────────
  const centinela = 'assets/../PLAN.md';                 // un fichero de verdad, fuera de assets/
  const antesCentinela = fs.statSync('PLAN.md').size;
  for (const malo of ['../PLAN', '..%2f..%2fPLAN', CARPETA + '/../../PLAN']) {
    const w = await pide('POST', '/api/assets', { ...dibujo('fuga', '#fff'), id: malo });
    ok('POST con id que se sale (' + malo + ') no escribe fuera', w.code !== 200 || (w.d && w.d.id && !w.d.id.includes('..')),
      w.code + ' ' + JSON.stringify(w.d && (w.d.id || w.d.error)));
    const b = await pide('DELETE', '/api/assets/' + malo);
    ok('DELETE con ese id no borra fuera (' + malo + ')', b.code !== 200, b.code);
  }
  // Un ENLACE que apunta fuera: esto NO lo caza mirar el id (ningun tramo empieza por punto, no hay
  // `..` por ningun lado), solo lo caza resolver la ruta de verdad con `realpath`. Es la razon de que
  // las dos comprobaciones de `_asset_path` sean dos y no una.
  fs.symlinkSync('/tmp', path.join('assets', 'test_link'));
  const salto = await pide('POST', '/api/assets', { ...dibujo('fuga', '#fff'), id: 'test_link/test-arbol' });
  ok('POST a traves de un enlace que sale de assets/ se rechaza', salto.code !== 200, salto.code);
  ok('...y no escribe en el destino del enlace', !fs.existsSync('/tmp/test-arbol.vox.json'));
  fs.unlinkSync(path.join('assets', 'test_link'));

  ok('PLAN.md sigue intacto despues de los intentos', fs.statSync('PLAN.md').size === antesCentinela);
  ok('no ha aparecido ningun PLAN.vox.json por ahi', !fs.existsSync('PLAN.vox.json') && !enDisco('../PLAN.vox.json'));
  // ⛔ Ni adefesios DENTRO: escapar no escapaba, pero `..%2f..%2fPLAN` perdia los `%` al limpiarlo y
  // se colaba como `..2f..2fPLAN.vox.json` en la galeria y en el indice. Un id no empieza por punto.
  const feos = fs.readdirSync('assets').filter(f => f.startsWith('.'));
  ok('ni adefesios dentro de assets/ (nada que empiece por punto)', feos.length === 0, feos.join(' '));
  const idxTxt = fs.readFileSync('assets/index.json', 'utf8');
  ok('...ni en el indice', !idxTxt.includes('2fPLAN'));

  // ── Limpieza: esto no deja nada suyo detras ─────────────────────────────────────────────────
  await pide('DELETE', '/api/assets/test-arbol');
  await pide('DELETE', '/api/assets/' + CARPETA + '/test-piedra');
  limpia();
  ok('no queda ningun test-* suelto en assets/', !enDisco('test-arbol.vox.json') && !enDisco(CARPETA));
  const fin = await pide('GET', '/api/assets');
  ok('ni en el catalogo', !(fin.d || []).some(a => String(a.id).startsWith('test-') || String(a.id).includes(CARPETA)));

  console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\n36 ok, 0 fallos');
  process.exit(fallos ? 1 : 0);
})();
