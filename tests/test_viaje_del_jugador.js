// @area: general
// @necesita: node
//
// CRITERIO DE CIERRE Nº4 del plan del multiverso, de una sola pasada:
// «un jugador crea un mapa desde el menú, invita por enlace, construyen los dos, y lo borra».
//
// ⚠️ Esto NO repite a `test_mundos_propiedad.js` ni a `test_invitaciones.js`, y la diferencia es la
// razón de que exista. Aquellos comprueban cada MECANISMO por separado y, para llegar al trozo que
// les interesa, usan atajos que un jugador no tiene: el token del dueño y `/api/panel/*`. Un
// mecanismo puede estar perfecto y el VIAJE seguir roto, porque en medio hay un paso que nadie
// puede dar con lo que un jugador lleva encima. Eso es lo que caza este guardián.
//
// La regla de este fichero, y lo único que hay que respetar al tocarlo:
//   ⛔ NADIE usa `token:` ni `/api/panel/*` salvo §1, donde el dueño saca a Ana de cuarentena.
//      Ese paso ES del dueño por diseño (registro abierto pero en cuarentena) y por eso está
//      marcado y aislado. Todo lo demás va con la galleta del jugador y nada más. Si para arreglar
//      este test hace falta un `token:` en cualquier otra sección, el arreglo está mal: lo que se
//      ha encontrado es un viaje que el jugador no puede hacer solo.
//
// Y comprueba lo que ninguno de los otros dos mira: que los bloques que ponen los DOS acaben de
// verdad en el mundo (§5), no solo que la petición conteste 200.
//
// Levanta su propio servidor en modo público y en otro puerto, por lo de siempre: el 8500 no tiene
// los permisos encendidos y reiniciarlo echa al dueño de su partida.

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PUERTO = +(process.argv[2] || 8595);
const TOKEN = 'zz-token-de-prueba';
const SECRETO = 'zz-secreto-de-prueba-que-no-vale-para-nada';
const MAPA = 'zz-viaje-casa';

let ok = 0, fallos = 0;
function check(cond, msg) {
  if (cond) { ok++; console.log('  ok   ' + msg); }
  else { fallos++; console.log('  FALLO ' + msg); }
}

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
        res({ code: rp.statusCode, d: j, raw: b.slice(0, 300), cookie: sc ? sc[0].split(';')[0] : null });
      });
    });
    r.on('error', rej);
    if (datos) r.write(datos);
    r.end();
  });
}

// Igual que `pide` pero devuelve los BYTES: `/api/mundo/vox` es un Uint16 denso, no JSON.
function bytes(ruta, cookie) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: PUERTO, path: ruta, method: 'GET',
                             headers: cookie ? { Cookie: cookie } : {} }, (rp) => {
      const trozos = [];
      rp.on('data', (c) => trozos.push(c));
      rp.on('end', () => res(rp.statusCode === 200 ? Buffer.concat(trozos) : null));
    });
    r.on('error', rej);
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

const datosTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-viaje-'));
const hijo = spawn('python3', [path.join(RAIZ, 'server.py'), String(PUERTO)], {
  cwd: RAIZ, stdio: 'ignore',
  env: { ...process.env,
         VOXELFORGE_PUBLICO: '1',
         VOXELFORGE_TOKEN: TOKEN,
         VOXELFORGE_SECRETO_SESION: SECRETO,
         VOXELFORGE_USUARIOS: path.join(datosTmp, 'usuarios'),
         VOXELFORGE_PERFILES: path.join(datosTmp, 'perfiles'),
         VOXELFORGE_MUNDOS_META: path.join(datosTmp, 'mundos_meta'),
         VOXELFORGE_REGISTRO: path.join(datosTmp, 'registro', 'acceso.log') },
});

// ⚠️ `WORLDS` es la ÚNICA que no se puede desviar: está fija en `server.py:21`, así que el mapa se
// crea en el `data/worlds/` de verdad aunque todo lo demás vaya a un temporal. §7 lo borra por API
// (que es parte del viaje) y esto remata por si el viaje se cortó a la mitad. De ahí el `zz-`.
function limpia() {
  for (const ext of ['.json', '.vox']) {
    const f = path.join(RAIZ, 'data', 'worlds', MAPA + ext);
    if (fs.existsSync(f)) fs.rmSync(f, { force: true });
  }
}

(async () => {
  await arranca();

  // ── §1 · el alta, y la cuarentena que de verdad frena ────────────────────────────────────────
  console.log('\n§1 · Ana se registra y NO puede crear nada hasta que el dueño la deja');
  const altaAna = await pide('POST', '/api/registro', { cuerpo: { nombre: 'Zz Ana Viaje', clave: 'ana-clave-larga' } });
  const ANA = altaAna.cookie;
  check(altaAna.code === 200 && !!ANA, 'Ana se da de alta y se lleva su galleta');
  check((altaAna.d && altaAna.d.yo && altaAna.d.yo.perfil) === 'cuarentena',
        'nace en cuarentena, no en jugador  (perfil=' + (altaAna.d && altaAna.d.yo && altaAna.d.yo.perfil) + ')');

  const enCuarentena = await pide('POST', '/api/mundos/crear', { cuerpo: { nombre: MAPA }, cookie: ANA });
  check(enCuarentena.code === 403,
        'en cuarentena crear un mapa da 403: la cuarentena no es decorativa  (' + enCuarentena.code + ')');

  const altaBob = await pide('POST', '/api/registro', { cuerpo: { nombre: 'Zz Bob Viaje', clave: 'bob-clave-larga' } });
  const BOB = altaBob.cookie;
  check(altaBob.code === 200 && !!BOB, 'Bob también se da de alta');

  // ⛔ EL ÚNICO PASO DEL DUEÑO EN TODO EL FICHERO. Ver la cabecera antes de añadir otro.
  //    A Bob se le deja EN CUARENTENA a propósito: §4 sostiene que a un invitado le basta el
  //    enlace, sin que el dueño tenga que tocarle el perfil. Si hiciera falta subirle de nivel,
  //    «invitar en un clic» no existiría — serían dos clics y una gestión del dueño.
  const sube = await pide('POST', '/api/panel/cuenta',
                          { cuerpo: { uid: altaAna.d.yo.uid, perfil: 'jugador' }, token: TOKEN });
  check(sube.code === 200, 'el dueño saca a Ana de cuarentena desde el panel');

  // ── §2 · crear el mapa, como desde el menú ───────────────────────────────────────────────────
  console.log('\n§2 · Ana crea su mapa (lo que hace el botón Crear de /map)');
  const crea = await pide('POST', '/api/mundos/crear', { cuerpo: { nombre: MAPA }, cookie: ANA });
  check(crea.code === 200, 'crea el mapa con su galleta y nada más  (' + crea.code + ')');
  const slug = (crea.d && crea.d.slug) || MAPA;
  check(slug === MAPA, 'y le toca el slug que pidió  (' + slug + ')');

  const yo = await pide('GET', '/api/yo', { cookie: ANA });
  check(yo.code === 200 && yo.d && yo.d.gastado && yo.d.gastado.mapas === 1,
        '`/api/yo` ya lo cuenta en su cuota: es lo que pinta el «3 de 5»  (gastado.mapas=' +
        (yo.d && yo.d.gastado && yo.d.gastado.mapas) + ')');

  // ── §3 · invitar en un clic ──────────────────────────────────────────────────────────────────
  console.log('\n§3 · Ana reparte el enlace (el botón INVITAR del menú de pausa)');
  const inv = await pide('POST', '/api/invitaciones', { cuerpo: { slug: MAPA }, cookie: ANA });
  check(inv.code === 200, 'emite el vale con su galleta  (' + inv.code + ')');
  const enlace = (inv.d && (inv.d.enlace || inv.d.url)) || '';
  const vale = (inv.d && inv.d.vale) || (enlace.match(/[?&]invita=([^&]+)/) || [])[1] || '';
  check(!!vale, 'y el vale viene dentro  (' + (enlace || JSON.stringify(inv.d)).slice(0, 90) + ')');

  // Lo que de verdad se le manda a un amigo es el ENLACE. Si no trae el slug, el amigo no llega.
  check(enlace.indexOf(MAPA) >= 0, 'el enlace apunta al mapa, no solo a la portada');

  // ── §4 · el invitado llega, todavía en cuarentena ────────────────────────────────────────────
  console.log('\n§4 · Bob llega por el enlace SIN que nadie le suba de nivel');
  const dev = encodeURIComponent(vale);
  const sinVale = await pide('GET', `/api/mundo?map=${MAPA}`, { cookie: BOB });
  check(sinVale.code === 403 || sinVale.code === 404,
        'sin el enlace, el mapa de Ana no se le abre  (' + sinVale.code + ')');
  const conVale = await pide('GET', `/api/mundo?map=${MAPA}&invita=${dev}`, { cookie: BOB });
  check(conVale.code === 200, 'con el enlace entra, y sigue en cuarentena  (' + conVale.code + ')');

  // ── §5 · construyen LOS DOS, y se comprueba en el mundo ──────────────────────────────────────
  console.log('\n§5 · construyen los dos (y los bloques acaban de verdad en el mundo)');
  // Por defecto un mapa nace en `escritura: dueno` ⇒ invitar es invitar a MIRAR. Que Ana pueda
  // abrirlo a los invitados con su sola galleta es parte del viaje: si esto necesitara el panel,
  // «invita y construid» sería cosa del dueño del servidor.
  const abre = await pide('PATCH', `/api/mundos/${MAPA}`, { cuerpo: { escritura: 'invitados' }, cookie: ANA });
  check(abre.code === 200, 'Ana abre su mapa a los invitados sin pasar por el panel  (' + abre.code + ')');

  // ⚠️ Un edit es `[x, y, z, clave]` — una LISTA, y la clave es una cadena de la paleta. Con un
  // `{x,y,z,v}` el servidor contesta 200 y no escribe nada: `aplicar_edits` se salta en silencio lo
  // que no reconoce (`voxfmt.py:298`). Por eso aquí no vale mirar el código de respuesta.
  const ROCA = 'asset:assets/roca.vox.json';
  const ponAna = await pide('POST', `/api/mundo/edits?map=${MAPA}`,
                            { cuerpo: { edits: [[4, 20, 4, ROCA]] }, cookie: ANA });
  check(ponAna.code === 200 && ponAna.d && ponAna.d.aplicadas === 1,
        'Ana pone un bloque en su mapa  (aplicadas=' + (ponAna.d && ponAna.d.aplicadas) + ')');

  const ponBob = await pide('POST', `/api/mundo/edits?map=${MAPA}&invita=${dev}`,
                            { cuerpo: { edits: [[6, 20, 6, ROCA]] }, cookie: BOB });
  check(ponBob.code === 200 && ponBob.d && ponBob.d.aplicadas === 1,
        'Bob pone el suyo con el vale  (aplicadas=' + (ponBob.d && ponBob.d.aplicadas) + ')');

  // ⚠️ LA COMPROBACIÓN QUE FALTABA, y la razón de que este fichero exista. Un 200 dice «te he oído»,
  // no «lo he guardado», y `aplicadas` es lo que el servidor CREE. Esto va a la rejilla de verdad:
  // si las escrituras de los dos se pisaran (último gana, que es el riesgo declarado del plan con
  // 10-20 jugadores), faltaría un bloque y las dos peticiones habrían contestado 200 igual.
  const cab = await pide('GET', `/api/mundo?map=${MAPA}&invita=${dev}`, { cookie: BOB });
  const dim = (cab.d && (cab.d.size || cab.d.dim)) || null;
  const rejilla = await bytes(`/api/mundo/vox?map=${MAPA}&invita=${dev}`, BOB);
  const idx = (x, y, z) => x + y * dim.x + z * dim.x * dim.y;
  const celda = (x, y, z) => rejilla.readUInt16LE(2 * idx(x, y, z));
  check(!!dim && !!rejilla, 'se relee la rejilla densa del mundo  (dim=' + JSON.stringify(dim) + ')');
  const hayAna = !!dim && celda(4, 20, 4) !== 0;
  const hayBob = !!dim && celda(6, 20, 6) !== 0;
  check(hayAna && hayBob,
        'y en el .vox ESTÁN LOS DOS: ninguno se ha comido al otro  (ana=' +
        hayAna + ' bob=' + hayBob + ')');

  // ── §6 · lo que el vale NO abre ──────────────────────────────────────────────────────────────
  console.log('\n§6 · el enlace es una llave de UNA puerta');
  const borraBob = await pide('DELETE', `/api/mundos/${MAPA}`, { cookie: BOB });
  check(borraBob.code === 403,
        'Bob NO puede borrar el mapa de Ana aunque esté invitado  (' + borraBob.code + ')');
  const snipBob = await pide('POST', '/api/snippets',
                             { cuerpo: { id: 'zz-viaje-colado', code: '// no' }, cookie: BOB });
  check(snipBob.code === 403 || snipBob.code === 401,
        'ni publicar un snippet: el invitado sigue siendo cuarentena  (' + snipBob.code + ')');

  // ── §7 · y Ana lo borra ──────────────────────────────────────────────────────────────────────
  console.log('\n§7 · Ana borra su mapa (sin esto el multiverso no está terminado)');
  const borra = await pide('DELETE', `/api/mundos/${MAPA}`, { cookie: ANA });
  check(borra.code === 200, 'lo borra con su galleta  (' + borra.code + ')');
  // Lo que importa no es el número exacto, es que Bob NO recupere lo que Ana borró. Un 404 o un
  // mundo recién nacido y vacío valen los dos; lo que no vale es que le siga saliendo la casa.
  const tras = await pide('GET', `/api/mundo?map=${MAPA}&invita=${dev}`, { cookie: BOB });
  const rejillaTras = await bytes(`/api/mundo/vox?map=${MAPA}&invita=${dev}`, BOB);
  const sigueAhi = !!rejillaTras && !!dim
                   && rejillaTras.length === 2 * dim.x * dim.y * dim.z
                   && rejillaTras.readUInt16LE(2 * idx(4, 20, 4)) !== 0;
  check(!sigueAhi,
        'y el enlace que repartió ya no devuelve lo construido  (' + tras.code +
        (rejillaTras ? ', rejilla de ' + rejillaTras.length + ' B' : ', sin rejilla') + ')');

  const yo2 = await pide('GET', '/api/yo', { cookie: ANA });
  check(yo2.d && yo2.d.gastado && yo2.d.gastado.mapas === 0,
        'la cuota se le devuelve: si no, borrar no libera y la cuota es una trampa  (gastado.mapas=' +
        (yo2.d && yo2.d.gastado && yo2.d.gastado.mapas) + ')');

  // El par se mueve a la papelera, NO se destruye: es la regla del repo.
  const enPapelera = fs.existsSync(path.join(RAIZ, 'data', 'papelera', 'mundos'))
    && fs.readdirSync(path.join(RAIZ, 'data', 'papelera', 'mundos')).some((f) => f.indexOf(MAPA) >= 0);
  check(enPapelera, 'y el mundo está en `data/papelera/mundos/`, no destruido');
})()
  .catch((e) => { fallos++; console.log('  FALLO excepción: ' + (e && e.message)); })
  .finally(() => {
    hijo.kill();
    limpia();
    fs.rmSync(datosTmp, { recursive: true, force: true });
    console.log(`\n${ok} ok, ${fallos} fallos` + (fallos ? '' : '  ·  TODO OK'));
    process.exit(fallos ? 1 : 0);
  });
