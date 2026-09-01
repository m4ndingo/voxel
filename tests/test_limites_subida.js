// @area: general
// @necesita: servidor
//
// Guardián del tope de cuerpo (F0.3 del plan de publicación, 2026-08-31).
//
// Hasta ahora `_read()` hacía `self.rfile.read(n)` con la `n` que declarase el cliente, y sólo las
// fotos, los vídeos y los iconos miraban su tamaño. O sea: un `curl` con un `Content-Length` enorme
// se llevaba por delante la RAM del proceso, y un POST SIN `Content-Length` se colaba tratándose
// como cuerpo vacío. Las dos cosas se cierran en `_cuerpo_cabe`, ANTES de leer un solo byte.
//
// Por eso este test manda las cabeceras A PELO por un socket y NO manda el cuerpo: lo que se
// comprueba es justamente que el servidor decide con lo declarado, sin llegar a leer. Si algún día
// alguien mueve la comprobación a después del `read()`, este fichero se queda colgado esperando —
// y ese plantón ES el fallo.
//
// ⚠️ El tope NO es único: cada ruta tiene el suyo (`_tope_cuerpo`, server.py). Un mundo entero son
// megas legítimos; un snippet de 512 MB no lo es. Aquí se prueban los cuatro escalones.

const net = require('net');
const http = require('http');

const PUERTO = +(process.argv[2] || 8500);
let ok = 0, fallos = 0;
const check = (c, m) => c ? (ok++, console.log('  ok    ' + m)) : (fallos++, console.log('  FALLO ' + m));

const MB = 1024 * 1024;

// Petición cruda: cabeceras sí, cuerpo NO. Devuelve el código de la línea de estado.
// El plazo corto es a propósito: si el servidor se pone a esperar el cuerpo que nunca llega, lo que
// queremos es enterarnos, no que el test tarde un minuto en morirse.
function cabezaSola(metodo, ruta, cabeceras) {
  return new Promise((res, rej) => {
    const s = net.connect(PUERTO, '127.0.0.1');
    let b = '';
    const corta = setTimeout(() => { s.destroy(); res(0); }, 4000);   // 0 = se quedó esperando
    s.on('connect', () => {
      const lineas = [`${metodo} ${ruta} HTTP/1.1`, `Host: 127.0.0.1:${PUERTO}`,
                      'Content-Type: application/json'].concat(cabeceras);
      s.write(lineas.join('\r\n') + '\r\n\r\n');
    });
    s.on('data', (c) => {
      b += c;
      const fin = b.indexOf('\r\n');
      if (fin > 0) { clearTimeout(corta); s.destroy(); res(+(b.slice(0, fin).split(' ')[1] || 0)); }
    });
    s.on('error', (e) => { clearTimeout(corta); rej(e); });
    s.on('close', () => { clearTimeout(corta); if (!b) res(0); });
  });
}

// Petición normal, con su cuerpo de verdad (para comprobar que lo legítimo sigue pasando).
function pide(metodo, ruta, cuerpo) {
  return new Promise((res, rej) => {
    const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo), 'utf8');
    const r = http.request({ host: '127.0.0.1', port: PUERTO, path: ruta, method: metodo,
      headers: datos ? { 'Content-Type': 'application/json', 'Content-Length': datos.length } : {} },
      (rp) => { let b = ''; rp.setEncoding('utf8'); rp.on('data', (c) => { b += c; });
                rp.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {}
                                     res({ code: rp.statusCode, d: j, raw: b }); }); });
    r.on('error', rej);
    if (datos) r.write(datos);
    r.end();
  });
}

const PIEZA = 'zz-test-limites';

(async () => {
  console.log('\n§1 cada ruta tiene su tope, y se decide con lo DECLARADO (sin leer el cuerpo)');
  for (const [ruta, mb, porque] of [
    ['/api/snippets',    3, 'un snippet no pasa de 2 MB (el mayor del repo, mundo-autoarranque, son 308 KB)'],
    ['/api/mundo/edits', 8, '/edits es un delta, no un mundo entero: tope 4 MB'],
    ['/api/asignaciones', 1, 'lo que no tiene tope propio se queda en el general de 512 KB'],
    ['/api/fotos',      64, 'ni las fotos son barra libre: FOTO_MAX_BYTES son 24 MB'],
  ]) {
    const s = await cabezaSola('POST', ruta, [`Content-Length: ${mb * MB}`, 'Connection: close']);
    check(s === 413, `POST ${ruta} declarando ${mb} MB → ${s || 'nada (¡se quedó leyendo el cuerpo!)'} · ${porque}`);
  }

  console.log('\n§2 el tope NO es único: por debajo del suyo, la ruta contesta lo que le toque');
  // Aquí el cuerpo se manda de verdad, porque la ruta va a leerlo. 1 MB pasa del tope general
  // (512 KB) y no del de las fotos: si alguien aplanase los escalones a un solo número, esto sería
  // un 413 y las capturas del juego dejarían de guardarse.
  const gordo = await pide('POST', '/api/fotos', { relleno: 'x'.repeat(MB) });
  check(gordo.code === 400, `POST /api/fotos con 1 MB → ${gordo.code} (400 «falta png», no 413)`);

  console.log('\n§3 sin Content-Length no se escribe (era la puerta de atrás del tope)');
  check(await cabezaSola('POST', '/api/snippets', ['Connection: close']) === 411,
        'POST sin Content-Length → 411');
  check(await cabezaSola('PATCH', '/api/assets/zz', ['Connection: close']) === 411,
        'PATCH sin Content-Length → 411');
  check(await cabezaSola('POST', '/api/snippets', ['Content-Length: dos megas', 'Connection: close']) === 400,
        'Content-Length que no es un número → 400 (y no un ValueError que tumbe el hilo)');

  console.log('\n§4 el DELETE no lleva cuerpo, y no se le puede exigir uno');
  const sd = await cabezaSola('DELETE', '/api/snippets/zz-test-inexistente', ['Connection: close']);
  check(sd !== 411 && sd !== 0, `DELETE sin Content-Length → ${sd} (no 411)`);

  console.log('\n§5 lo legítimo sigue pasando (el guardia no puede ser un muro)');
  const alta = await pide('POST', '/api/snippets',
    { id: PIEZA, name: 'ZZ límites', code: '// pieza de usar y tirar del test de límites\n' });
  check(alta.code === 200, `POST pequeño a /api/snippets → ${alta.code}`);
  const baja = await pide('DELETE', '/api/snippets/' + PIEZA);
  check(baja.code === 200, `y se recoge la basura: DELETE ${PIEZA} → ${baja.code}`);

  console.log(`\n${ok} ok, ${fallos} fallos` + (fallos ? '' : ' — TODO OK'));
  process.exit(fallos ? 1 : 0);
})();
