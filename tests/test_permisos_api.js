// @area: general
// @necesita: node
//
// LA MATRIZ. El test que dice si se puede publicar o no (F1 del plan, 2026-08-31).
//
// Hasta hoy no había NI UNO de seguridad, y «permisos» era una palabra: `POST /api/snippets` era
// anónimo, y ese snippet lo baja `mcAutoarranque()` y lo pasa por `new AsyncFunction(code)` en
// ámbito global, en el navegador de CADA visitante y en TODOS los mapas. Un `curl` valía por
// ejecución de JavaScript persistente en la sesión de todo el mundo.
//
// Se recorre la matriz entera en TRES identidades — anónimo, cuarentena y dueño — porque los tres
// fallos posibles son distintos y sólo se ven comparando: que el anónimo pueda (agujero), que el
// registrado no pueda lo suyo (producto roto) y que el dueño no pueda nada (servidor inútil).
//
// ⚠️ Levanta SU PROPIO servidor, en modo público y en otro puerto, con `--datos` a un directorio
// temporal. Tres motivos, los tres a base de haberse equivocado antes:
//   · el 8500 de desarrollo NO tiene los permisos encendidos (`es_publico()` es False) y aquí no se
//     probaría nada;
//   · el registro escribe cuentas de verdad en `data/usuarios/`, y las de un test no van ahí;
//   · reiniciar el 8500 echa al dueño de su propia partida.

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PUERTO = +(process.argv[2] || 8597);
const TOKEN = 'zz-token-de-prueba';
const SECRETO = 'zz-secreto-de-prueba-que-no-vale-para-nada';

let ok = 0, fallos = 0;
const check = (c, m) => c ? (ok++, console.log('  ok    ' + m)) : (fallos++, console.log('  FALLO ' + m));

// `agente` solo lo usa §10: por defecto va sin él, que en Node 18 es una conexión NUEVA por
// petición — justo lo que hace falta para que cada comprobación de la matriz sea independiente.
function pide(metodo, ruta, { cuerpo, cookie, token, agente } = {}) {
  return new Promise((res, rej) => {
    const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo), 'utf8');
    const headers = {};
    if (datos) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = datos.length; }
    if (cookie) headers['Cookie'] = cookie;
    if (token) headers['X-VoxelForge-Token'] = token;
    const opciones = { host: '127.0.0.1', port: PUERTO, path: ruta, method: metodo, headers };
    if (agente) opciones.agent = agente;
    const r = http.request(opciones, (rp) => {
      let b = ''; rp.setEncoding('utf8');
      rp.on('data', (c) => { b += c; });
      rp.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch (e) {}
        const sc = rp.headers['set-cookie'];
        res({ code: rp.statusCode, d: j, raw: b, cookie: sc ? sc[0].split(';')[0] : null });
      });
    });
    r.on('error', rej);
    if (datos) r.write(datos);
    r.end();
  });
}

async function arranca(intentos = 80) {
  for (let i = 0; i < intentos; i++) {
    const r = await pide('GET', '/api/yo').catch(() => null);
    if (r) return true;
    await new Promise((f) => setTimeout(f, 100));
  }
  throw new Error('el servidor de pruebas no levantó en el ' + PUERTO);
}

const datosTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-permisos-'));
const hijo = spawn('python3', [path.join(RAIZ, 'server.py'), String(PUERTO)], {
  cwd: RAIZ, stdio: 'ignore',
  env: { ...process.env,
         VOXELFORGE_PUBLICO: '1',
         VOXELFORGE_TOKEN: TOKEN,
         VOXELFORGE_SECRETO_SESION: SECRETO,
         VOXELFORGE_USUARIOS: path.join(datosTmp, 'usuarios'),
         VOXELFORGE_PERFILES: path.join(datosTmp, 'perfiles'),
         // El registro de mundos, también al temporal (§9b planta una ficha ahí). Sin esto, el
         // test le mete al dueño un `zz-plantilla.json` en `data/mundos_meta/` del repo.
         VOXELFORGE_MUNDOS_META: path.join(datosTmp, 'mundos_meta'),
         // ⚠️ El registro TAMBIÉN al temporal. En público se enciende solo (F7.3) y su ruta por
         // defecto es `data/registro/` DEL REPO: sin esta línea cada pasada de los tests le deja
         // al dueño un fichero de accesos falsos creciendo en su árbol de trabajo.
         VOXELFORGE_REGISTRO: path.join(datosTmp, 'registro', 'acceso.log') },
});

(async () => {
  await arranca();
  try {
    console.log('\n§1 el modo público está de verdad encendido (o el resto del test miente)');
    const yo0 = await pide('GET', '/api/yo');
    check(yo0.code === 200 && yo0.d.anonimo === true && !yo0.d.dueno,
          `GET /api/yo sin nada → anónimo (${JSON.stringify(yo0.d && yo0.d.anonimo)})`);
    check((yo0.d.permisos || []).length === 0, 'y sin un solo permiso');

    console.log('\n§2 alta, entrada y salida');
    const alta = await pide('POST', '/api/registro', { cuerpo: { nombre: 'Zz Jugador', clave: 'contrasena123' } });
    check(alta.code === 200, `POST /api/registro → ${alta.code}`);
    check(alta.cookie && alta.cookie.startsWith('vf_sid='), 'y devuelve la cookie de sesión ya puesta');
    check(alta.d && alta.d.yo && alta.d.yo.perfil === 'cuarentena',
          `nace en CUARENTENA (perfil: ${alta.d && alta.d.yo && alta.d.yo.perfil})`);
    check(alta.raw.indexOf('hash') < 0 && alta.raw.indexOf('sal') < 0,
          'y la respuesta no lleva ni el hash ni la sal de la contraseña');
    const CUAR = alta.cookie;

    const repe = await pide('POST', '/api/registro', { cuerpo: { nombre: 'zz jugador', clave: 'otracosa123' } });
    check(repe.code === 400, `el mismo nombre otra vez → ${repe.code} (y no una cuenta que pisa a la otra)`);

    const malaClave = await pide('POST', '/api/entrar', { cuerpo: { nombre: 'Zz Jugador', clave: 'no-es-esa' } });
    check(malaClave.code === 401, `entrar con la clave mal → ${malaClave.code}`);
    const noExiste = await pide('POST', '/api/entrar', { cuerpo: { nombre: 'zz-fantasma', clave: 'loquesea1' } });
    check(noExiste.code === 401 && noExiste.d.error === malaClave.d.error,
          'y «no existe» dice EXACTAMENTE lo mismo que «clave mal» (si no, es una lista de cuentas)');

    const bien = await pide('POST', '/api/entrar', { cuerpo: { nombre: 'Zz Jugador', clave: 'contrasena123' } });
    check(bien.code === 200 && bien.cookie, `entrar con la clave buena → ${bien.code}`);

    const yoCuar = await pide('GET', '/api/yo', { cookie: CUAR });
    check(yoCuar.d && yoCuar.d.anonimo === false && yoCuar.d.yo.uid === 'zz-jugador',
          `GET /api/yo con cookie → ${yoCuar.d && yoCuar.d.yo && yoCuar.d.yo.uid}`);
    check(JSON.stringify((yoCuar.d.yo || {}).permisos) === JSON.stringify(['multi.entrar']),
          `cuarentena puede jugar y NADA más: ${JSON.stringify((yoCuar.d.yo || {}).permisos)}`);

    console.log('\n§3 la bomba: POST /api/snippets');
    // El §1 del plan. Si alguna de estas tres líneas se pone en verde por el motivo equivocado,
    // publicar es regalar el navegador de todos los visitantes.
    const cuerpoSnip = { cuerpo: { id: 'zz-test-permisos', name: 'ZZ', code: '// nada\n' } };
    const anon = await pide('POST', '/api/snippets', cuerpoSnip);
    check(anon.code === 401, `anónimo → ${anon.code} (401: «no sé quién eres»)`);
    const cuar = await pide('POST', '/api/snippets', { ...cuerpoSnip, cookie: CUAR });
    check(cuar.code === 403, `cuarentena → ${cuar.code} (403: «sé quién eres y no puedes»)`);
    const dueno = await pide('POST', '/api/snippets', { ...cuerpoSnip, token: TOKEN });
    check(dueno.code === 200, `dueño con token → ${dueno.code}`);
    if (dueno.code === 200) {
      const baja = await pide('DELETE', '/api/snippets/zz-test-permisos', { token: TOKEN });
      check(baja.code === 200, 'y se recoge la basura');
    }
    const borraAnon = await pide('DELETE', '/api/snippets/mundo-autoarranque');
    check(borraAnon.code === 401 || borraAnon.code === 403,
          `y un anónimo tampoco BORRA el autoarranque → ${borraAnon.code}`);

    console.log('\n§4 401 y 403 no son lo mismo, y el navegador necesita distinguirlos');
    check(anon.d && anon.d.necesitaEntrar === true, 'el 401 dice «necesitaEntrar»: el menú enseña el formulario');
    check(cuar.d && cuar.d.necesitaEntrar === false, 'el 403 dice que no: enseñar el formulario ahí sería mentir');
    check(cuar.d && cuar.d.permiso === 'snippet.editar_sistema',
          `y los dos dicen QUÉ permiso faltaba (${cuar.d && cuar.d.permiso})`);

    console.log('\n§5 el vocabulario y los perfiles de partida');
    const yoDueno = await pide('GET', '/api/yo', { token: TOKEN });
    check(yoDueno.d && yoDueno.d.dueno === true, 'el token da el rol de dueño sin tener cuenta');
    for (const p of ['mundo.crear', 'snippet.editar_sistema', 'panel.perfiles', 'multi.entrar']) {
      check((yoDueno.d.yo.permisos || []).includes(p), `el dueño tiene «${p}»`);
    }
    check(!(yoCuar.d.yo.permisos || []).includes('snippet.crear_propio'),
          '⚠️ «snippet.crear_propio» nace APAGADO para todos (F-E sin decidir)');

    // ── El candado de F-E ─────────────────────────────────────────────────────────────────────
    // Que NAZCA apagado (la línea de arriba) solo dice que nadie lo tiene HOY. Esto comprueba lo
    // otro: que el dueño no puede DARLO ni por descuido ni a propósito, que es lo que convierte la
    // recomendación de `docs/codigo-de-usuario.md` en algo que no hay que acordarse de cumplir.
    // Las tres puertas: los `permisos_mas` de una cuenta, un perfil nuevo, y mover la cuenta a un
    // perfil que ya lo llevase.
    const porCuenta = await pide('POST', '/api/panel/cuenta',
      { token: TOKEN, cuerpo: { uid: 'zz-jugador', permisos_mas: ['snippet.crear_propio'] } });
    check(porCuenta.code === 400, `dárselo a una cuenta → ${porCuenta.code} (400, no 200)`);
    check(/candado de F-E/.test((porCuenta.d && porCuenta.d.error) || ''),
          'y dice que es el candado de F-E, no un «no existe» cualquiera');

    const porPerfil = await pide('POST', '/api/panel/perfil',
      { token: TOKEN, cuerpo: { nombre: 'zz-codigueros', permisos: ['multi.entrar', 'snippet.crear_propio'] } });
    check(porPerfil.code === 400, `meterlo en un perfil nuevo → ${porPerfil.code}`);

    const yoCuar2 = await pide('GET', '/api/yo', { cookie: CUAR });
    check(!(((yoCuar2.d || {}).yo || {}).permisos || []).includes('snippet.crear_propio'),
          'y después de los dos intentos la cuenta sigue sin el permiso');
    // Que el candado no sea un «di que no a todo»: el mismo camino con otro permiso tiene que ir.
    const otro = await pide('POST', '/api/panel/cuenta',
      { token: TOKEN, cuerpo: { uid: 'zz-jugador', permisos_mas: ['foto.subir'] } });
    check(otro.code === 200, `pero «foto.subir» por el mismo sitio sí → ${otro.code} (el caso prueba algo)`);
    await pide('POST', '/api/panel/cuenta', { token: TOKEN, cuerpo: { uid: 'zz-jugador', permisos_mas: [] } });

    console.log('\n§6 la matriz entera, en las tres identidades');
    // Cada fila: [método, ruta, anónimo, cuarentena, dueño]. 401 = «entra»; 403 = «no puedes».
    // El dueño tiene que poder: un servidor donde el dueño tampoco puede es un servidor roto, y ese
    // fallo se descubre tarde porque «todo da 403» parece que está bien cerrado.
    //
    // ⚠️ Las rutas llevan `/zz-nada` pegado A PROPÓSITO. Este test levanta su servidor con
    // `VOXELFORGE_USUARIOS`/`PERFILES` en un temporal, pero el resto de `data/` NO se puede desviar:
    // esas rutas cuelgan de `BASE`, que es el directorio de `server.py` (`server.py:12-28`). Sin el
    // sufijo, la fila del dueño escribía DE VERDAD en el repo — `POST /api/habitantes {}` devolvía
    // 200 y dejaba un `data/habitantes/objeto.json`, y encima en una carpeta que está bajo la regla
    // «de aquí no se borra nada», así que limpiarlo no es un `rm`.
    //
    // El sufijo no debilita nada porque las dos capas miran cosas distintas: el permiso se resuelve
    // por PREFIJO (`PERMISO_POR_RUTA`, longest-prefix ⇒ `/api/habitantes/zz-nada` sigue exigiendo
    // `habitante.guardar`) y el despacho de `do_POST` es por IGUALDAD (`ruta_post == '/api/...'`),
    // así que cae al 404 final sin tocar el disco. Anónimo y cuarentena siguen viendo 401/403
    // porque el guardia corre ANTES del despacho; el dueño lo cruza y ve un 404, que es exactamente
    // lo que la fila afirma: al dueño no lo para el permiso.
    for (const [metodo, ruta, eAnon, eCuar, eDueno] of [
      ['POST',   '/api/mundo/cabecera/zz-nada', 401, 403, null],
      ['POST',   '/api/mundos/crear/zz-nada',   401, 403, null],
      ['POST',   '/api/assets/zz-nada',         401, 403, null],
      ['POST',   '/api/habitantes/zz-nada',     401, 403, null],
      ['POST',   '/api/agentes/zz-nada',        401, 403, null],
      ['POST',   '/api/fotos/zz-nada',          401, 403, null],
      ['POST',   '/api/videos/zz-nada',         401, 403, null],
      // Borrar NO es editar: esta fila cae en `('/api/mundos', 'mundo.borrar_propio', …, ('DELETE',))`
      // y no en la de `mundo.editar_propio`, que es la que atrapa al POST del mismo prefijo. Si
      // alguien quita la columna de métodos, harían falta los DOS permisos para una sola acción y
      // el panel del dueño pasaría a mentir: conceder «borrar» no dejaría borrar.
      ['DELETE', '/api/mundos/zz-nada', 401, 403, null],
      ['DELETE', '/api/assets/zz-nada', 401, 403, null],
      ['DELETE', '/api/habitantes/zz-nada', 401, 403, null],
      ['PATCH',  '/api/assets/zz-nada', 401, 403, null],
    ]) {
      const a = await pide(metodo, ruta, { cuerpo: {} });
      check(a.code === eAnon, `${metodo} ${ruta} · anónimo → ${a.code} (esperado ${eAnon})`);
      const c = await pide(metodo, ruta, { cuerpo: {}, cookie: CUAR });
      check(c.code === eCuar, `${metodo} ${ruta} · cuarentena → ${c.code} (esperado ${eCuar})`);
      const d = await pide(metodo, ruta, { cuerpo: {}, token: TOKEN });
      check(d.code !== 401 && d.code !== 403,
            `${metodo} ${ruta} · dueño → ${d.code} (lo que sea menos 401/403)`);
    }

    console.log('\n§7 lo que NO está en la tabla también está cerrado');
    // La propiedad que de verdad protege a largo plazo: una ruta de escritura nueva nace prohibida,
    // porque quien la añada dentro de seis meses no se va a acordar de PERMISO_POR_RUTA.
    for (const ruta of ['/api/inventada-hoy', '/api/mapa', '/api/ui', '/api/namespace']) {
      const a = await pide('POST', ruta, { cuerpo: {} });
      check(a.code === 401 || a.code === 403, `POST ${ruta} · anónimo → ${a.code}`);
      const c = await pide('POST', ruta, { cuerpo: {}, cookie: CUAR });
      check(c.code === 401 || c.code === 403, `POST ${ruta} · cuarentena → ${c.code}`);
    }

    console.log('\n§8 leer sigue siendo libre (el juego tiene que poder jugarse)');
    for (const ruta of ['/api/mundos', '/api/snippets', '/app.js']) {
      const r = await pide('GET', ruta);
      check(r.code === 200, `GET ${ruta} · anónimo → ${r.code}`);
    }

    console.log('\n§9 el freno y el origen siguen puestos en público');
    const cruzado = await pide('POST', '/api/registro',
      { cuerpo: { nombre: 'zz-otro', clave: 'contrasena123' } });
    check(cruzado.code === 200 || cruzado.code === 400, 'sin Origin se pasa (curl y herramientas/ no lo mandan)');

    console.log('\n§9b REQ-PLANT1 · la plantilla de un mapa se puede preguntar SIN ser el dueño');
    // ⚠️ El fallo que trae esta sección (2026-09-03): la rama de `/api/mundos/<slug>/plantilla`
    // usaba una `q` que se creaba 40 líneas MÁS ABAJO ⇒ `UnboundLocalError` ⇒ 500 y la conexión
    // cerrada sin respuesta. Y no lo veía nadie, porque el `and` es perezoso: `_es_dueno()` iba
    // primero y al dueño le devolvía 200 sin llegar a tocar `q`. Sólo reventaba con un JUGADOR,
    // que es justo quien crea mapas desde la portada. El corredor `generador-mundo` da el `fetch`
    // por perdido y se calla, así que el resultado era un mapa vacío y ni un error en pantalla.
    //
    // Por eso lo que se comprueba primero es que CONTESTE. Un `pide()` que rechaza (ECONNRESET) es
    // exactamente el fallo, y sin este `catch` saldría como una excepción del test y no como rojo.
    // ⛔ NO se llama a `/api/mundos/crear`: eso escribiría un `.json` + un `.vox` de 1,7 MB en
    // `data/worlds/` DEL REPO en cada pasada (el registro sí va al temporal, los mundos no). Esta
    // rama no abre el mundo — sólo lee el registro y el snippet —, así que la ficha se planta a
    // mano en el `VOXELFORGE_MUNDOS_META` temporal y el test no deja nada detrás.
    const alta2 = await pide('POST', '/api/registro', { cuerpo: { nombre: 'Zz Cartografo', clave: 'contrasena123' } });
    const JUG = alta2.cookie;
    await pide('POST', '/api/panel/cuenta', { cuerpo: { uid: 'zz-cartografo', perfil: 'jugador' }, token: TOKEN });
    const slug = 'zz-plantilla';
    fs.mkdirSync(path.join(datosTmp, 'mundos_meta'), { recursive: true });
    fs.writeFileSync(path.join(datosTmp, 'mundos_meta', slug + '.json'), JSON.stringify({
      slug, dueno: 'zz-cartografo', visibilidad: 'privado', escritura: 'dueno', codigo: '',
      invitados: [], destacado: false, plantilla: 'construye-oceanos-y-playas', especial: '',
      generado: false, creado: '2026-09-03T00:00:00',
    }));
    const rp = await pide('GET', `/api/mundos/${slug}/plantilla`, { cookie: JUG })
      .catch((e) => ({ code: 0, err: String(e && e.message) }));
    check(rp.code !== 0, 'el dueño del mapa recibe una RESPUESTA (no una conexión cortada) → ' +
                         (rp.code || rp.err));
    check(rp.code === 200 && rp.d && rp.d.generado === false && rp.d.plantilla === 'construye-oceanos-y-playas',
          `…y dice qué plantilla y que está a medias → ${rp.code} generado=${rp.d && rp.d.generado}`);
    check(!!(rp.d && rp.d.ficha && (rp.d.ficha.frases || []).length),
          'con la ficha dentro, que es lo que pinta la pantalla de carga sin otra petición');
    // Un extraño tampoco puede tumbar el proceso: 403, con respuesta.
    const ajeno = await pide('GET', `/api/mundos/${slug}/plantilla`, { cookie: CUAR })
      .catch((e) => ({ code: 0, err: String(e && e.message) }));
    check(ajeno.code === 403, `y un mapa privado ajeno → ${ajeno.code || ajeno.err} (no revela la plantilla)`);
    // Marcar «generado» es del dueño del mapa, y sin eso se volvería a generar en cada entrada.
    const marca = await pide('POST', `/api/mundos/${slug}/generado`, { cuerpo: {}, cookie: JUG });
    check(marca.code === 200, `POST /api/mundos/${slug}/generado · su dueño → ${marca.code}`);
    const marcaAjena = await pide('POST', '/api/mundos/' + slug + '/generado', { cuerpo: {}, cookie: CUAR });
    check(marcaAjena.code === 401 || marcaAjena.code === 403,
          `…y un extraño no lo marca → ${marcaAjena.code}`);

    console.log('\n§10 la identidad NO se pega al socket (keep-alive)');
    // ⚠️ Todo lo de arriba abre una conexión por petición, y por eso no veía este fallo: el resto
    // del fichero podría estar verde con la sesión rota en el navegador, que SIEMPRE reaprovecha la
    // conexión. `quien()` cachea en `self`, y con HTTP/1.1 un handler sirve muchas peticiones ⇒ la
    // identidad de la primera se quedaba pegada a las demás. Entrar no surtía efecto hasta que el
    // socket moría, y —lo grave— SALIR tampoco: seguías siendo el que acababa de salir.
    // Se prueba con un `http.Agent({keepAlive:true, maxSockets:1})`, que fuerza el socket compartido.
    const ag = new (require('http').Agent)({ keepAlive: true, maxSockets: 1 });
    const anon1 = await pide('GET', '/api/yo', { agente: ag });
    const conCookie = await pide('GET', '/api/yo', { cookie: CUAR, agente: ag });
    check(anon1.d && anon1.d.anonimo === true, 'la 1ª del socket, sin cookie → anónimo');
    check(conCookie.d && conCookie.d.anonimo === false && conCookie.d.yo.uid === 'zz-jugador',
          `la 2ª por el MISMO socket, con cookie → ${conCookie.d && conCookie.d.yo && conCookie.d.yo.uid} (no «anónimo» pegado)`);
    const salir = await pide('POST', '/api/salir', { cuerpo: {}, cookie: CUAR, agente: ag });
    const trasSalir = await pide('GET', '/api/yo', { agente: ag });
    check(salir.code === 200 && trasSalir.d && trasSalir.d.anonimo === true,
          '…y tras /api/salir por ese socket ya no queda nadie dentro');
    ag.destroy();
  } finally {
    hijo.kill();
    fs.rmSync(datosTmp, { recursive: true, force: true });
  }

  console.log(`\n${ok} ok, ${fallos} fallos` + (fallos ? '' : ' — TODO OK'));
  process.exit(fallos ? 1 : 0);
})().catch((e) => { hijo.kill(); console.error(e); process.exit(1); });
