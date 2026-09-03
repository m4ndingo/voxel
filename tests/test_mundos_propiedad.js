// @area: general
// @necesita: node
//
// Guardián de F3.1-F3.4: «cada mapa tiene dueño, y el dueño decide quién lo ve y quién escribe».
//
// Hasta hoy un mundo NACÍA DE VISITAR UNA URL y no había forma de borrarlo: mil URLs eran 700 MB y
// ningún usuario podía tirar su propio mapa. Y «privado» no existía: quien supiera el nombre
// entraba. Aquí se comprueba la parte que no se ve en pantalla y que por eso se rompe sin ruido.
//
// Las dos distinciones caras, que son las que este test existe para vigilar:
//
//   · `enlace` NO es `publico`. Con enlace se ENTRA pero no se ENCUENTRA: quien tiene la URL pasa,
//     y el mapa no sale en ningún listado. Si un día `sale_en_listados` empieza a devolver true
//     para `enlace`, todos los mapas «solo para mis amigos» quedan en el escaparate y nadie se
//     entera hasta que alguien los ve.
//   · Un mapa que no se puede ver contesta **404, no 403**. Un 403 confirmaría que existe, y «qué
//     mapas privados tiene ese» no es asunto de nadie.
//
// ⚠️ Levanta SU PROPIO servidor en modo público y en otro puerto, como `test_permisos_api.js`, con
// `VOXELFORGE_USUARIOS`/`PERFILES`/`MUNDOS_META` en un directorio temporal. Los MUNDOS, en cambio,
// SÍ aterrizan en `data/worlds/` de verdad: `WORLDS` cuelga de `BASE` y no se puede desviar. Por eso
// todos se llaman `zz-test-*` y se recogen en el `finally`, pase lo que pase.

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PUERTO = +(process.argv[2] || 8596);
const TOKEN = 'zz-token-de-prueba';
const SECRETO = 'zz-secreto-de-prueba-que-no-vale-para-nada';

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

const datosTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-mundos-'));
const USUARIOS = path.join(datosTmp, 'usuarios');
const META = path.join(datosTmp, 'mundos_meta');

const hijo = spawn('python3', [path.join(RAIZ, 'server.py'), String(PUERTO)], {
  cwd: RAIZ, stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env,
         VOXELFORGE_PUBLICO: '1',
         VOXELFORGE_TOKEN: TOKEN,
         VOXELFORGE_SECRETO_SESION: SECRETO,
         VOXELFORGE_USUARIOS: USUARIOS,
         VOXELFORGE_PERFILES: path.join(datosTmp, 'perfiles'),
         VOXELFORGE_MUNDOS_META: META,
         // Y el registro de F7.3, que en público se enciende solo y por defecto escribe en el REPO.
         VOXELFORGE_REGISTRO: path.join(datosTmp, 'registro', 'acceso.log') },
});

// Los mapas que hay que recoger sí o sí. Se apuntan ANTES de comprobar nada: si una comprobación
// revienta a mitad, el mapa ya está creado y alguien tiene que llevárselo igual.
const CREADOS = [];
const listaDe = (r) => (r.d || []).map((m) => m.nombre || m.name || m.slug);
const meta = (slug) => { try { return JSON.parse(fs.readFileSync(path.join(META, slug + '.json'), 'utf8')); }
                         catch (e) { return null; } };
// Los dos ficheros, como los cuenta el servidor: la cabecera son kilobytes y el `.vox` son megas.
const pesaMapa = (slug) => ['.json', '.vox'].reduce((n, ext) => {
  try { return n + fs.statSync(path.join(RAIZ, 'data', 'worlds', slug + ext)).size; } catch (e) { return n; }
}, 0);

// `permisos_mas` cuenta por cuenta: es la mitad de F1.3 que ningún test tocaba todavía («una cuenta
// concreta podría crear snippets propios pero no modificar otros», dijo el dueño). Aquí se usa
// porque el perfil de partida es `cuarentena`, que solo juega, y el panel que lo haría bien es F9.
function dale(uid, permisos, extra = {}) {
  const fp = path.join(USUARIOS, uid + '.json');
  const u = JSON.parse(fs.readFileSync(fp, 'utf8'));
  u.permisos_mas = permisos;
  Object.assign(u, extra);
  fs.writeFileSync(fp, JSON.stringify(u, null, 2));
}

(async () => {
  try {
    await arranca();

    console.log('\n§1 dos cuentas, y los permisos ajustados CUENTA POR CUENTA');
    const altaAna = await pide('POST', '/api/registro', { cuerpo: { nombre: 'zz ana', clave: 'contrasena123' } });
    const altaBob = await pide('POST', '/api/registro', { cuerpo: { nombre: 'zz bob', clave: 'contrasena123' } });
    check(altaAna.code === 200 && altaBob.code === 200, `alta de las dos cuentas (${altaAna.code}/${altaBob.code})`);
    const ANA = altaAna.cookie, BOB = altaBob.cookie;

    dale('zz-ana', ['mundo.crear', 'mundo.editar_propio', 'mundo.borrar_propio'], { cuota: { mapas: 3 } });
    dale('zz-bob', ['mundo.editar_propio']);          // puede escribir donde le dejen, pero no crear
    const yoAna = await pide('GET', '/api/yo', { cookie: ANA });
    check((yoAna.d.yo.permisos || []).includes('mundo.crear'),
          `«mundo.crear» llega por permisos_mas sin cambiarle el perfil (${yoAna.d.yo.perfil})`);
    const bobCrea = await pide('POST', '/api/mundos/crear', { cuerpo: { nombre: 'zz-test-de-bob' }, cookie: BOB });
    check(bobCrea.code === 403, `y bob, que no lo tiene, NO crea → ${bobCrea.code} (esperado 403)`);

    console.log('\n§2 ana crea un mapa: es suyo, y cuenta contra su cuota');
    CREADOS.push('zz-test-prop');
    const cre = await pide('POST', '/api/mundos/crear', { cuerpo: { nombre: 'zz-test-prop' }, cookie: ANA });
    check(cre.code === 200 && cre.d.nombre === 'zz-test-prop', `POST /api/mundos/crear → ${cre.code}`);
    check(meta('zz-test-prop') && meta('zz-test-prop').dueno === 'zz-ana',
          `el registro lateral dice de quién es (${meta('zz-test-prop') && meta('zz-test-prop').dueno})`);
    check(fs.existsSync(path.join(RAIZ, 'data', 'worlds', 'zz-test-prop.vox')),
          '…y el mapa nace COMPLETO (.json + .vox), no a medias');
    const yo2 = await pide('GET', '/api/yo', { cookie: ANA });
    check(yo2.d.gastado && yo2.d.gastado.mapas === 1 && (yo2.d.mapas || []).includes('zz-test-prop'),
          `/api/yo lo cuenta para pintar «1 de 3» (${yo2.d.gastado && yo2.d.gastado.mapas})`);

    console.log('\n§3 nace PRIVADO: para bob no existe (404 a propósito, no 403)');
    const ve = await pide('GET', '/api/mundo?map=zz-test-prop', { cookie: BOB });
    check(ve.code === 404, `GET /api/mundo de bob → ${ve.code} (404: un 403 confirmaría que existe)`);
    const escribe = await pide('POST', '/api/mundo/edits?map=zz-test-prop',
                               { cuerpo: { edits: [[1, 1, 1, 'asset:assets/roca.vox.json']] }, cookie: BOB });
    check(escribe.code === 404, `y escribir tampoco → ${escribe.code}`);
    const mia = await pide('GET', '/api/mundo?map=zz-test-prop', { cookie: ANA });
    check(mia.code === 200, `…pero ana entra en el suyo → ${mia.code}`);
    let lista = await pide('GET', '/api/mundos', { cookie: BOB });
    check(!listaDe(lista).includes('zz-test-prop'), 'y no sale en el listado de bob');

    console.log('\n§4 `enlace`: se ENTRA pero no se ENCUENTRA — la distinción cara');
    let pat = await pide('PATCH', '/api/mundos/zz-test-prop', { cuerpo: { visibilidad: 'enlace' }, cookie: ANA });
    check(pat.code === 200 && pat.d.meta.visibilidad === 'enlace', `PATCH visibilidad → ${pat.code}`);
    check((await pide('GET', '/api/mundo?map=zz-test-prop', { cookie: BOB })).code === 200,
          'bob, que tiene el enlace, entra');
    lista = await pide('GET', '/api/mundos', { cookie: BOB });
    check(!listaDe(lista).includes('zz-test-prop'),
          '⚠️ …y AUN ASÍ no sale en su listado (si sale, «solo para mis amigos» está en el escaparate)');
    check((await pide('GET', '/api/mundo?map=zz-test-prop')).code === 200,
          'y un anónimo con el enlace también: el enlace es discreción, no seguridad');

    console.log('\n§5 `publico` sí sale en el listado; el código de acceso abre un privado');
    pat = await pide('PATCH', '/api/mundos/zz-test-prop', { cuerpo: { visibilidad: 'publico' }, cookie: ANA });
    lista = await pide('GET', '/api/mundos', { cookie: BOB });
    check(pat.code === 200 && listaDe(lista).includes('zz-test-prop'), 'con `publico` aparece en el listado');
    await pide('PATCH', '/api/mundos/zz-test-prop', { cuerpo: { visibilidad: 'privado', codigo: 'abre-sesamo' }, cookie: ANA });
    check((await pide('GET', '/api/mundo?map=zz-test-prop', { cookie: BOB })).code === 404,
          'vuelto a privado, bob otra vez no lo ve');
    check((await pide('GET', '/api/mundo?map=zz-test-prop&codigo=abre-sesamo', { cookie: BOB })).code === 200,
          '…pero con `?codigo=` entra (es una llave que se comparte a propósito)');
    check((await pide('GET', '/api/mundo?map=zz-test-prop&codigo=otro', { cookie: BOB })).code === 404,
          'y con el código equivocado, no');

    console.log('\n§6 ver no es escribir: la escritura se abre aparte');
    await pide('PATCH', '/api/mundos/zz-test-prop', { cuerpo: { visibilidad: 'publico', codigo: '' }, cookie: ANA });
    const edit = { edits: [[1, 1, 1, 'asset:assets/roca.vox.json']] };
    check((await pide('POST', '/api/mundo/edits?map=zz-test-prop', { cuerpo: edit, cookie: BOB })).code === 403,
          'mapa público + escritura `dueno` ⇒ bob mira → 403 (y aquí sí es 403: ya sabe que existe)');
    await pide('PATCH', '/api/mundos/zz-test-prop', { cuerpo: { escritura: 'todos' }, cookie: ANA });
    check((await pide('POST', '/api/mundo/edits?map=zz-test-prop', { cuerpo: edit, cookie: BOB })).code === 200,
          'con escritura `todos`, bob construye');
    await pide('PATCH', '/api/mundos/zz-test-prop', { cuerpo: { escritura: 'invitados' }, cookie: ANA });
    check((await pide('POST', '/api/mundo/edits?map=zz-test-prop', { cuerpo: edit, cookie: BOB })).code === 403,
          'con `invitados` y sin estar invitado, otra vez no');

    console.log('\n§7 se invita POR NOMBRE y se guarda POR UID');
    pat = await pide('PATCH', '/api/mundos/zz-test-prop', { cuerpo: { invitados: ['Zz Bob'] }, cookie: ANA });
    check(pat.code === 200 && JSON.stringify(pat.d.meta.invitados) === JSON.stringify(['zz-bob']),
          `«Zz Bob» se guarda como «zz-bob» (${JSON.stringify(pat.d.meta.invitados)})`);
    check((await pide('POST', '/api/mundo/edits?map=zz-test-prop', { cuerpo: edit, cookie: BOB })).code === 200,
          'y ya invitado, bob construye');
    const fantasma = await pide('PATCH', '/api/mundos/zz-test-prop',
                                { cuerpo: { invitados: ['zz-nadie'] }, cookie: ANA });
    check(fantasma.code === 400 && (fantasma.d.desconocidos || []).includes('zz-nadie'),
          `invitar a quien no existe → ${fantasma.code} y dice a quién no conoce`);
    check(JSON.stringify(meta('zz-test-prop').invitados) === JSON.stringify(['zz-bob']),
          '…y el 400 no ha tocado la lista buena (o una errata borraría a los invitados)');

    console.log('\n§8 el PATCH es del AUTOR, y hay cosas que ni el autor puede');
    const patBob = await pide('PATCH', '/api/mundos/zz-test-prop', { cuerpo: { visibilidad: 'privado' }, cookie: BOB });
    check(patBob.code === 403, `bob, invitado y con escritura, NO cambia la visibilidad → ${patBob.code}`);
    const borraBob = await pide('DELETE', '/api/mundos/zz-test-prop', { cookie: BOB });
    check(borraBob.code === 403 && fs.existsSync(path.join(RAIZ, 'data', 'worlds', 'zz-test-prop.json')),
          `…ni lo borra → ${borraBob.code}, y el mapa sigue en disco`);
    const destaca = await pide('PATCH', '/api/mundos/zz-test-prop', { cuerpo: { destacado: true }, cookie: ANA });
    check(destaca.code === 403,
          `⛔ ni ana se destaca sola → ${destaca.code} (la portada sería de quien más pulsara el botón)`);
    check((await pide('PATCH', '/api/mundos/zz-test-prop', { cuerpo: { destacado: true }, token: TOKEN })).code === 200,
          '…y el dueño del servidor sí');
    const mal = await pide('PATCH', '/api/mundos/zz-test-prop', { cuerpo: { visibilidad: 'medio-privado' }, cookie: ANA });
    check(mal.code === 400, `una visibilidad inventada → ${mal.code} (y no un silencioso «privado»)`);
    check(meta('zz-test-prop').dueno === 'zz-ana' && !!meta('zz-test-prop').creado,
          'y después de ocho PATCH el registro conserva dueño y fecha (se toca campo a campo)');

    console.log('\n§8b F6.4 · el sitio de aparición lo mueve el DUEÑO del mapa, no quien construye');
    // Construir y decidir dónde aparece TODO EL MUNDO no son lo mismo: con `escritura:todos`,
    // cualquiera podía plantar el spawn dentro de la roca y dejar el mapa inservible sin romper nada.
    const wf = path.join(RAIZ, 'data', 'worlds', 'zz-test-prop.json');
    const spawnDe = () => { try { return JSON.stringify(JSON.parse(fs.readFileSync(wf, 'utf8')).spawn); }
                            catch (e) { return '(ilegible)'; } };
    const antesSpawn = spawnDe();
    const cabBob = await pide('POST', '/api/mundo/cabecera?map=zz-test-prop',
                              { cuerpo: { spawn: { x: 1, y: 2, z: 3 } }, cookie: BOB });
    check(cabBob.code === 200 && cabBob.d.spawnIgnorado === true,
          `bob, que sí construye, NO mueve el spawn → ${cabBob.code} spawnIgnorado=${cabBob.d.spawnIgnorado}`);
    check(spawnDe() === antesSpawn, `…y en disco sigue el de antes ${antesSpawn}`);
    const cabAna = await pide('POST', '/api/mundo/cabecera?map=zz-test-prop',
                              { cuerpo: { spawn: { x: 1, y: 2, z: 3 } }, cookie: ANA });
    check(cabAna.code === 200 && !cabAna.d.spawnIgnorado && /"x":1\b/.test(spawnDe()),
          `la dueña sí lo mueve → ${cabAna.code} ${spawnDe()}`);
    // ⚠️ LO QUE NO PUEDE PASAR: que negarle el spawn le quite a bob lo que sí es suyo. `mcScheduleSave`
    // manda la cabecera ENTERA (spawn + estructuras + notas) desde cada navegador y cada vez, así que
    // un 403 seco aquí dejaría a los invitados sin poder guardar nada. Se cae el campo, no el guardado.
    const cabMixta = await pide('POST', '/api/mundo/cabecera?map=zz-test-prop',
                                { cuerpo: { spawn: { x: 9, y: 9, z: 9 }, notes: { '1,1,1': 'zz-hola' } },
                                  cookie: BOB });
    check(cabMixta.code === 200 && cabMixta.d.spawnIgnorado === true && /"x":1\b/.test(spawnDe()) &&
          fs.readFileSync(wf, 'utf8').includes('zz-hola'),
          'y su nota SÍ se guarda en esa MISMA petición (se cae el campo, no el guardado)');

    console.log('\n§8c F6.5 · el MANDO (echar y callar en el 8510) se lo lleva solo el dueño del mapa');
    // Esta es la mitad de `server.py` de F6.5; la del árbitro la prueba `multi/probe_echa_calla.py`.
    // ⛔ Lo que sostiene todo: el mando es OTRA cosa que el vale de invitación. El vale se COMPARTE
    // por enlace, así que si echar se autorizara con él, bob echaría a ana de su propio mapa con el
    // mismísimo enlace que ella le mandó. Aquí se comprueba que ni siquiera se lo dan.
    const mandoAna = await pide('GET', '/api/mundos/zz-test-prop/mando', { cookie: ANA });
    check(mandoAna.code === 200 && /^zz-test-prop\.[^.]*\.\d+\.[0-9a-f]+$/.test(mandoAna.d.mando || ''),
          `la dueña lo pide y se lo dan → ${mandoAna.code}`, mandoAna.d.mando);
    const mandoBob = await pide('GET', '/api/mundos/zz-test-prop/mando', { cookie: BOB });
    check(mandoBob.code === 403,
          `⛔ bob, que está invitado Y construye ahí, NO manda → ${mandoBob.code}`);
    check((await pide('GET', '/api/mundos/zz-test-prop/mando')).code === 403,
          'ni un anónimo, claro');
    check((await pide('GET', '/api/mundos/zz-no-existe-nada/mando')).code === 404,
          'y de un mapa que no existe no hay mando que dar (404, no un 200 vacío)');

    console.log('\n§9 los mundos HEREDADOS (los 33 de siempre) siguen cerrados para todos');
    check((await pide('GET', '/api/mundo?map=default', { cookie: BOB })).code === 404,
          'ana y bob no ven «default»: sin registro ⇒ privado y de solo lectura');
    check((await pide('PATCH', '/api/mundos/default', { cuerpo: { visibilidad: 'publico' }, cookie: BOB })).code === 403,
          '…y nadie se lo apropia con un PATCH (abrirlos es trabajo del panel, F9)');
    check((await pide('GET', '/api/mundo?map=default', { token: TOKEN })).code === 200,
          'el dueño del servidor entra en el suyo, claro');

    console.log('\n§10 la cuota y los nombres cogidos');
    CREADOS.push('zz-test-prop-2', 'zz-test-otro');
    const repe = await pide('POST', '/api/mundos/crear', { cuerpo: { nombre: 'zz-test-prop' }, cookie: ANA });
    check(repe.code === 200 && repe.d.nombre === 'zz-test-prop-2' && repe.d.renombrado === true,
          `el nombre cogido se resuelve solo → «${repe.d && repe.d.nombre}» (los slugs son globales)`);
    check((await pide('POST', '/api/mundos/crear', { cuerpo: { nombre: 'zz-test-otro' }, cookie: ANA })).code === 200,
          'el tercero cabe (cuota: 3)');
    const cuarto = await pide('POST', '/api/mundos/crear', { cuerpo: { nombre: 'zz-test-cuarto' }, cookie: ANA });
    check(cuarto.code === 409 && !fs.existsSync(path.join(RAIZ, 'data', 'worlds', 'zz-test-cuarto.json')),
          `el cuarto → ${cuarto.code} y NO se ha escrito nada (la cuota se mira ANTES de escribir)`);
    check((await pide('POST', '/api/mundos/crear', { cuerpo: { nombre: 'default' }, cookie: ANA })).code === 409,
          '⛔ y «default», el mundo sagrado, no se pisa por nombre');

    console.log('\n§11 F3.4 · la cuota de BYTES, que es la que llena el disco de verdad');
    // El tope de mapas no protege nada por sí solo: cinco mapas son cinco ficheros, pero un mapa
    // pide su tamaño en la `dim` y ahí es donde caben los gigas. Y el coste se calcula de la
    // DIMENSIÓN, no del cuerpo: estos POST son de un par de KB y piden rejillas enormes.
    const yoBytes = await pide('GET', '/api/yo', { cookie: ANA });
    check(yoBytes.d.gastado.bytes > 700 * 1024,
          `/api/yo dice lo que ocupa, no solo cuántos son (${yoBytes.d.gastado.bytes} B en 3 mapas)`);
    dale('zz-ana', ['mundo.crear', 'mundo.editar_propio', 'mundo.borrar_propio'],
         { cuota: { mapas: 3, bytes: 4 * 1024 * 1024 } });
    const gordo = { dim: { x: 400, y: 200, z: 400 }, voxels: {} };      // 32 M celdas × 2 B = 61 MB de .vox
    const lleno = await pide('POST', '/api/mundo?map=zz-test-otro', { cuerpo: gordo, cookie: ANA });
    check(lleno.code === 409, `un mapa de 400×200×400 con 4 MB de cuota → ${lleno.code} (esperado 409)`);
    check(pesaMapa('zz-test-otro') < 2 * 1024 * 1024,
          '⚠️ …y NO se ha escrito (una cuota que avisa y deja pasar no es una cuota)');
    const cabe = { dim: { x: 32, y: 32, z: 32 }, voxels: { '1,1,1': 'asset:assets/roca.vox.json' } };
    check((await pide('POST', '/api/mundo?map=zz-test-otro', { cuerpo: cabe, cookie: ANA })).code === 200,
          'uno que cabe, sí');
    check((await pide('POST', '/api/mundo?map=zz-test-otro', { cuerpo: cabe, cookie: ANA })).code === 200,
          '…y guardarlo OTRA VEZ también (o a la tercera pasada del editor no podría guardar lo suyo)');
    check(lleno.d.cuota && lleno.d.cuota.usados > 0 && lleno.d.cuota.pedido > 50 * 1024 * 1024,
          `y el 409 trae los números para poder decir cuánto sitio queda (${JSON.stringify(lleno.d.cuota)})`);
    // ⛔ Aquí NO se comprueba «al dueño del servidor no le frena la cuota» mandándole un mundo
    // gigante: `WORLDS` y `WORLDFILE` cuelgan de `BASE` y no se pueden desviar, así que el único
    // mapa sin dueño registrado a mano sería `default` — el mundo sagrado del dueño, `data/mundo.json`.
    // Un test que lo pisa con 400×200×400 destruiría trabajo de verdad. Lo cubre `_lleno_o_409`
    // volviendo False en cuanto no hay uid, y es una línea que se lee de un vistazo.

    console.log('\n§12 ana borra lo suyo y el registro se va con el mapa');
    const baja = await pide('DELETE', '/api/mundos/zz-test-otro', { cookie: ANA });
    check(baja.code === 200, `DELETE de su propio mapa → ${baja.code}`);
    check(meta('zz-test-otro') === null, '…y el registro lateral desaparece (si no, el slug queda cogido para siempre)');
    const tras = await pide('GET', '/api/yo', { cookie: ANA });
    check(tras.d.gastado.mapas === 2, `y la cuota se libera (${tras.d.gastado.mapas} de 3)`);
  } finally {
    // Recogida. Los mundos SÍ se escriben en `data/worlds/` de verdad (WORLDS cuelga de BASE y no
    // se puede desviar), así que esto no es cortesía: es lo que evita dejarle basura al dueño.
    for (const slug of CREADOS) {
      await pide('DELETE', '/api/mundos/' + slug, { token: TOKEN }).catch(() => {});
      for (const ext of ['.json', '.vox']) {
        try { fs.unlinkSync(path.join(RAIZ, 'data', 'worlds', slug + ext)); } catch (e) {}
      }
    }
    hijo.kill();
    fs.rmSync(datosTmp, { recursive: true, force: true });
  }

  console.log(`\n${ok} ok, ${fallos} fallos` + (fallos ? '' : '  —  TODO OK'));
  process.exit(fallos ? 1 : 0);
})().catch((e) => { hijo.kill(); console.error(e); process.exit(1); });
