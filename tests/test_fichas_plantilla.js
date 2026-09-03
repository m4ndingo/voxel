// @area: general
// @necesita: servidor
// REQ-PLANT2 · gestionar las fichas del carrusel de «mundo nuevo»: la foto y los metadatos.
//
// Lo que de verdad se prueba aqui son las dos preguntas del dueno, que no son de interfaz:
//
//   1. «como asocio una foto a una ficha»  → subirla al panel, y ademas basta con que el fichero se
//      llame como la ficha: la foto se resuelve CONTRA EL DISCO en cada peticion del catalogo, no se
//      copia dentro de la ficha.
//   2. «que pasa si se borra la foto»      → la tarjeta vuelve a su marcador y NO se rompe nada.
//      Este es el caso que se rompe solo el dia que alguien «optimice» guardando la ruta.
//
// Y de propina lo caro de arreglar tarde: que guardar los metadatos NO toque el `code` del generador
// (son 9 KB de JS que construyen el bioma; perderlos es perder el bioma) y que la zona de imagenes
// sea de verdad una zona — ni un SVG disfrazado ni una ruta fuera de ella.
//
// Necesita el servidor vivo:  python3 server.py 8500     (otro puerto: node test_fichas_plantilla.js 8599)
// Solo escribe con ids `zz-test-…` y los retira al acabar, incluso si algo falla.
const http = require('http');
// Todo lo de `/api/panel/*` pide `panel.usar`: contra un 8500 en modo público, sin identificarse
// esto daba 18 fallos que parecían del panel y eran 401. Sin token (desarrollo) no añade nada.
const { cabecerasDueno } = require('./_token');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};
const PUERTO = +(process.argv[2] || 8500);
const SID = 'zz-test-ficha-' + Date.now();

// Un PNG y un JPEG de verdad, minimos: lo que se comprueba en el servidor son los BYTES de cabecera.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function pide(metodo, ruta, cuerpo) {
  return new Promise((res, rej) => {
    const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo), 'utf8');
    const r = http.request({
      host: '127.0.0.1', port: PUERTO, path: ruta, method: metodo,
      headers: cabecerasDueno(datos ? { 'Content-Type': 'application/json', 'Content-Length': datos.length } : {})
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

const enCatalogo = async () => ((await pide('GET', '/api/plantillas')).d.plantillas || []).find(p => p.id === SID);
const enPanel = async () => ((await pide('GET', '/api/panel/plantillas')).d.plantillas || []).find(p => p.id === SID);

// El `code` es lo que hay que conservar: un generador de mentira, pero con el mismo papel.
const CODIGO = 'function zzConstruye(){ /* esto es el bioma: si desaparece, no hay mundo */ }\nzzConstruye();\n';

(async () => {
  console.log('\n§1 una ficha nace en el catalogo, sin foto todavia');
  await pide('POST', '/api/snippets', {
    id: SID, name: 'Bioma de prueba', code: CODIGO,
    ficha: { titulo: 'Bioma de prueba', descripcion: 'de usar y tirar', etiquetas: ['🧪 test'], orden: 950 }
  });
  let c = await enCatalogo();
  ok('la ficha sale en /api/plantillas', !!c, c && c.ficha.titulo);
  ok('y sin foto: la tarjeta se pinta con su marcador', c && c.ficha.foto === '', c && JSON.stringify(c.ficha.foto));
  ok('el panel la marca «sin foto»', (await enPanel() || {}).sinFoto === true);

  console.log('\n§2 asociar una foto es subirla al panel');
  let r = await pide('POST', '/api/panel/plantilla/foto', { id: SID, dato: 'data:image/png;base64,' + PNG });
  ok('POST /api/panel/plantilla/foto → 200', r.code === 200, r.raw.slice(0, 90));
  ok('devuelve la ruta en la zona segura', (r.d.r || '').startsWith('/data/ui/plantillas/'), r.d.r);
  c = await enCatalogo();
  ok('y el carrusel la pinta sin tocar los metadatos', c && c.ficha.foto === '/data/ui/plantillas/' + SID + '.png',
     c && c.ficha.foto);
  ok('la imagen se sirve de verdad', (await pide('GET', '/data/ui/plantillas/' + SID + '.png')).code === 200);

  // Subir otra en distinto formato no puede dejar las dos: `foto_de` busca por orden de extension y
  // devolveria la vieja, asi que la foto nueva no apareceria nunca.
  r = await pide('POST', '/api/panel/plantilla/foto', { id: SID, dato: 'data:image/jpeg;base64,' + JPEG });
  ok('cambiar de formato retira el fichero anterior', r.d.r === '/data/ui/plantillas/' + SID + '.jpg' &&
     (await pide('GET', '/data/ui/plantillas/' + SID + '.png')).code === 404, r.d.r);

  console.log('\n§3 ⛔ si la foto desaparece, NO se rompe nada');
  r = await pide('DELETE', '/api/panel/plantilla/foto/' + SID);
  ok('DELETE de la foto → 200 y dice que se llevo', r.code === 200 && (r.d.quitadas || []).length === 1,
     JSON.stringify(r.d));
  c = await enCatalogo();
  ok('el catalogo devuelve foto:"" (marcador), no una ruta muerta', c && c.ficha.foto === '', c && c.ficha.foto);
  ok('la ficha sigue ahi, entera', c && c.ficha.titulo === 'Bioma de prueba');

  console.log('\n§4 los metadatos se cambian sin tocar el generador');
  const antes = (await pide('GET', '/api/snippets/' + SID)).d.code;
  r = await pide('POST', '/api/panel/plantilla', {
    id: SID, ficha: { titulo: 'Bioma retocado', descripcion: 'otra cosa', etiquetas: ['a', 'b'],
                      frases: ['Cargando…'], orden: 951 }
  });
  ok('POST /api/panel/plantilla → 200', r.code === 200, r.raw.slice(0, 90));
  const desp = (await pide('GET', '/api/snippets/' + SID)).d.code;
  ok('⛔ el `code` del generador sale byte a byte', antes === desp && desp === CODIGO, (desp || '').length + ' B');
  c = await enCatalogo();
  ok('y el carrusel ya dice lo nuevo', c && c.ficha.titulo === 'Bioma retocado' && c.ficha.frases[0] === 'Cargando…');

  console.log('\n§5 la zona de imagenes es una ZONA');
  r = await pide('POST', '/api/panel/plantilla/foto', { id: SID, dato: Buffer.from('<svg onload=alert(1)>').toString('base64') });
  ok('un SVG disfrazado de imagen → rechazado', r.code === 400, r.code + ' ' + (r.d && r.d.error));
  r = await pide('POST', '/api/panel/plantilla', { id: SID, ficha: { titulo: 'x', foto: '/data/../../etc/passwd' } });
  ok('una foto fuera de la zona segura → rechazada', r.code === 400, r.code + ' ' + (r.d && r.d.error));
  r = await pide('POST', '/api/panel/plantilla', { id: 'vacio', ficha: { titulo: 'x' } });
  ok('los textos de las fichas del programa no se tocan', r.code === 400, r.code + ' ' + (r.d && r.d.error));
  r = await pide('POST', '/api/panel/plantilla', { id: 'zz-no-existe-nada', ficha: { titulo: 'x' } });
  ok('un id que no existe no crea nada', r.code === 400 &&
     (await pide('GET', '/api/snippets/zz-no-existe-nada')).code === 404, r.code);
})()
  .catch(e => { console.error(e); fallos++; })
  .then(async () => {
    await pide('DELETE', '/api/panel/plantilla/foto/' + SID);       // la limpieza va SIEMPRE
    await pide('DELETE', '/api/snippets/' + SID);
    const quedan = ((await pide('GET', '/api/plantillas')).d.plantillas || []).filter(p => p.id.startsWith('zz-test-'));
    ok('\n  limpieza: no queda ninguna ficha zz-test-', quedan.length === 0, JSON.stringify(quedan.map(p => p.id)));
    console.log('\n' + (fallos ? '❌' : '✅') + '  ' + fallos + ' fallos');
    process.exit(fallos ? 1 : 0);
  });
