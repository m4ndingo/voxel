// @area: general
// @necesita: node
//
// Guardián de F7.3: el servidor apunta lo que pasa — y NO apunta lo que abriría puertas.
//
// Hasta hoy `log_message` era `pass`: no quedaba rastro de nada. Publicando, eso es la diferencia
// entre poder contar lo que pasó y solo sospecharlo (punto 5 de «lo mínimo para no publicar una
// bomba»). Pero un registro es un fichero que sobrevive al incidente y que acabará copiado a otro
// disco (F7.2), así que **lo que entre ya no se puede desdecir**, y esa es la mitad que se vigila
// aquí: contraseñas, cookies de sesión y códigos de acceso NO pueden aparecer en él.
//
// Si alguien añade un parámetro nuevo que sea una llave (un `?vale=`, un `?clave=`), tiene que
// añadirlo a `TACHAR` en `servidor/registro.py`. Este test es lo que se lo va a recordar.

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PUERTO = +(process.argv[2] || 8594);
const TOKEN = 'zz-token-de-prueba';
const SECRETO = 'zz-secreto-de-prueba-que-no-vale-para-nada';
const CLAVE = 'contrasena-secretisima-123';

let ok = 0, fallos = 0;
const check = (c, m) => c ? (ok++, console.log('  ok     ' + m)) : (fallos++, console.log('  FALLO  ' + m));

function pide(metodo, ruta, { cuerpo, cookie, token } = {}) {
  return new Promise((res, rej) => {
    const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo), 'utf8');
    const headers = {};
    if (datos) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = datos.length; }
    if (cookie) headers['Cookie'] = cookie;
    if (token) headers['X-VoxelForge-Token'] = token;
    const r = http.request({ host: '127.0.0.1', port: PUERTO, path: ruta, method: metodo, headers }, (rp) => {
      let b = ''; rp.setEncoding('utf8');
      rp.on('data', (c) => { b += c; });
      rp.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        const sc = rp.headers['set-cookie'];
        res({ code: rp.statusCode, d: j, cookie: sc ? sc[0].split(';')[0] : null });
      });
    });
    r.on('error', rej);
    if (datos) r.write(datos);
    r.end();
  });
}

const datosTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-registro-'));
const LOG = path.join(datosTmp, 'registro', 'acceso.log');
const lee = () => { try { return fs.readFileSync(LOG, 'utf8'); } catch (e) { return ''; } };
const lineas = (trozo) => lee().split('\n').filter((l) => l.includes(trozo));

const hijo = spawn('python3', [path.join(RAIZ, 'server.py'), String(PUERTO)], {
  cwd: RAIZ, stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env,
         VOXELFORGE_PUBLICO: '1',
         VOXELFORGE_TOKEN: TOKEN,
         VOXELFORGE_SECRETO_SESION: SECRETO,
         VOXELFORGE_USUARIOS: path.join(datosTmp, 'usuarios'),
         VOXELFORGE_PERFILES: path.join(datosTmp, 'perfiles'),
         VOXELFORGE_MUNDOS_META: path.join(datosTmp, 'mundos_meta'),
         VOXELFORGE_REGISTRO: LOG },
});

(async () => {
  try {
    for (let i = 0; i < 80; i++) {
      const r = await pide('GET', '/api/yo').catch(() => null);
      if (r) break;
      await new Promise((f) => setTimeout(f, 100));
    }

    console.log('\n§1 se apunta, y con las cinco cosas que sirven de algo');
    check(fs.existsSync(LOG), 'el fichero existe (antes de F7.3 no había ninguno)');
    const yo = lineas('/api/yo')[0] || '';
    check(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d /.test(yo), `la línea empieza por la fecha · ${yo.slice(0, 60)}`);
    check(/ 127\.0\.0\.1 /.test(yo), 'con la IP, que es lo único que queda de quien no tiene nombre');
    check(/ GET \/api\/yo 200 \d+ms$/.test(yo.trim()), 'y método, ruta, código y milisegundos');

    console.log('\n§2 ⛔ la contraseña NO entra en el fichero');
    const alta = await pide('POST', '/api/registro', { cuerpo: { nombre: 'zz reg', clave: CLAVE } });
    check(alta.code === 200, `alta de prueba (${alta.code})`);
    check(lineas('/api/registro').length === 1, 'el alta se apunta (es de las que más importa saber)');
    check(lee().indexOf(CLAVE) < 0, '…y la contraseña NO está en el registro (el cuerpo no se apunta nunca)');
    check(lee().indexOf(alta.cookie.split('=')[1]) < 0,
          '…ni la cookie de sesión (quien leyera el registro entraría como cualquiera de ellos)');

    console.log('\n§3 quién hizo qué: el uid, que dice lo mismo y no abre nada');
    await pide('GET', '/api/yo', { cookie: alta.cookie });
    check(lineas(' zz-reg GET /api/yo').length >= 1, 'una petición con sesión sale con su uid');
    check(lineas(' - GET /api/yo').length >= 1, 'y una anónima sale con «-», no en blanco');
    await pide('GET', '/api/mundos', { token: TOKEN });
    check(lineas('dueño GET /api/mundos').length >= 1, 'y la del dueño del servidor se distingue');

    console.log('\n§4 ⛔ el código de acceso de un mapa se TACHA');
    // Viaja en la URL a propósito (`?codigo=`, F3.1) y es la llave del mapa. Una URL en un fichero
    // de texto es una llave olvidada encima de la mesa, y esta se copia a otro disco cada noche.
    await pide('GET', '/api/mundo?map=zz-nada&codigo=abre-sesamo');
    check(lee().indexOf('abre-sesamo') < 0, 'el valor no aparece por ningún lado');
    check(lineas('codigo=(tachado)').length === 1, '…pero SÍ se ve que venía uno (tachado, no borrado)');
    check(lineas('map=zz-nada').length >= 1, 'y el resto de la query se conserva: sin ella la línea no dice nada');

    console.log('\n§5 los cien GET de una carga NO ahogan el fichero');
    // Abrir el Mundo son más de cien ficheros estáticos. Apuntarlos no informa: esconde, y rota el
    // registro cada dos visitas justo cuando hacía falta mirar atrás.
    const antes = lee().split('\n').length;
    await pide('GET', '/style.css');
    await pide('GET', '/app.js');
    check(lee().split('\n').length === antes, 'un GET de `/style.css` y otro de `/app.js` no dejan línea');
    await pide('GET', '/no-existe-esto.css');
    // UNA línea, no dos: `send_error` llama a `log_error` y luego a `send_response`, y apuntar en
    // los dos sitios daba el doble de fichero para contar la misma cosa.
    check(lineas('no-existe-esto').length === 1, '…pero el que FALLA sí, y una sola vez');
    check(/404 .*File not found/.test(lineas('no-existe-esto')[0] || ''),
          '…con el motivo pegado, que es lo que explica los 404 que nadie entiende');
    const escribe = await pide('POST', '/api/snippets', { cuerpo: { id: 'zz-reg-no', code: '//' }, cookie: alta.cookie });
    check(escribe.code === 403 && lineas('POST /api/snippets 403').length === 1,
          `y todo intento de ESCRIBIR, pase o no (${escribe.code})`);
  } finally {
    hijo.kill();
    fs.rmSync(datosTmp, { recursive: true, force: true });
  }

  console.log(`\n${ok} ok, ${fallos} fallos` + (fallos ? '' : '  —  TODO OK'));
  process.exit(fallos ? 1 : 0);
})().catch((e) => { hijo.kill(); console.error(e); process.exit(1); });
