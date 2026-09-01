// @area: general
// @necesita: node
//
// F5.6 · EL VALE DE INVITACIÓN. «Invitar en un clic» fue la petición literal del dueño, y un
// enlace que da acceso es una llave: si se firma mal, es la forma más silenciosa de abrir el
// servidor entero, porque parece que funciona exactamente igual.
//
// Lo que este guardián sostiene, y que no se ve leyendo el código:
//  · ⛔ un vale de `A` NO abre `B` — el slug va DENTRO de la firma. Si alguien saca el slug del
//    cuerpo firmado para «simplificar», el vale pasa a ser una llave maestra y NADA falla al hacerlo;
//  · un vale NO es un comodín de escritura: en un mapa `escritura: dueno` el invitado entra y MIRA.
//    Invitar a ver no puede ser invitar a tocar (F6.3);
//  · solo invita quien ya tiene acceso: sin eso, cualquiera se fabrica un vale para el mapa de otro.
//
// ⚠️ Levanta SU PROPIO servidor, en modo público y en otro puerto, por los mismos tres motivos que
// `test_permisos_api.js`: el 8500 no tiene los permisos encendidos, las cuentas de un test no van a
// `data/usuarios/`, y reiniciar el 8500 echa al dueño de su partida.

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

const datosTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-invita-'));
const hijo = spawn('python3', [path.join(RAIZ, 'server.py'), String(PUERTO)], {
  cwd: RAIZ, stdio: 'ignore',
  env: {
    ...process.env,
    VOXELFORGE_PUBLICO: '1',
    VOXELFORGE_TOKEN: TOKEN,
    VOXELFORGE_SECRETO_SESION: SECRETO,
    VOXELFORGE_USUARIOS: path.join(datosTmp, 'usuarios'),
    VOXELFORGE_PERFILES: path.join(datosTmp, 'perfiles'),
    VOXELFORGE_MUNDOS_META: path.join(datosTmp, 'mundos_meta'),
    VOXELFORGE_REGISTRO: path.join(datosTmp, 'registro', 'acceso.log'),
  },
});

// Los mapas SÍ se crean en `data/worlds/` (no hay variable para desviarlos), así que se llaman
// `zz-` y se recogen al final, pase lo que pase.
const MAPAS = ['zz-invita-casa', 'zz-invita-otro'];
function recoge() {
  for (const m of MAPAS) {
    for (const ext of ['.json', '.vox']) {
      const f = path.join(RAIZ, 'data', 'worlds', m + ext);
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {}
    }
    try { fs.unlinkSync(path.join(RAIZ, 'data', '_thumbs', m + '.json')); } catch (e) {}
  }
}

(async () => {
  await arranca();
  try {
    // ── Dos cuentas y dos mapas ────────────────────────────────────────────────────────────────
    console.log('\n§1 preparar: una anfitriona con dos mapas, y un desconocido');
    const alta = await pide('POST', '/api/registro', { cuerpo: { nombre: 'Zz Ana', clave: 'contrasena123' } });
    check(alta.code === 200, `alta de la anfitriona → ${alta.code}`);
    const ANA = alta.cookie;
    const altaB = await pide('POST', '/api/registro', { cuerpo: { nombre: 'Zz Bob', clave: 'contrasena123' } });
    const BOB = altaB.cookie;

    // Nace en cuarentena y sin `mundo.crear`: se le sube a jugador con el token del dueño.
    for (const uid of ['zz-ana', 'zz-bob']) {
      await pide('POST', '/api/panel/cuenta', { cuerpo: { uid, perfil: 'jugador' }, token: TOKEN });
    }
    for (const m of MAPAS) {
      const c = await pide('POST', '/api/mundos/crear', { cuerpo: { nombre: m }, cookie: ANA });
      check(c.code === 200, `crea ${m} → ${c.code}`);
    }
    const CASA = MAPAS[0], OTRO = MAPAS[1];

    // ── Quién puede emitir ─────────────────────────────────────────────────────────────────────
    console.log('\n§2 invitar es repartir acceso: solo lo hace quien ya lo tiene');
    check((await pide('POST', '/api/invitaciones', { cuerpo: { slug: CASA } })).code === 401,
      'anónimo NO emite vales → 401');
    const ajeno = await pide('POST', '/api/invitaciones', { cuerpo: { slug: CASA }, cookie: BOB });
    check(ajeno.code === 403,
      `⛔ Bob NO invita al mapa de Ana → ${ajeno.code} (si esto da 200, cualquiera se fabrica llaves ajenas)`);
    check((await pide('POST', '/api/invitaciones', { cuerpo: { slug: 'zz-no-existe' }, cookie: ANA })).code === 404,
      'a un mapa que no existe → 404');

    const emite = await pide('POST', '/api/invitaciones', { cuerpo: { slug: CASA }, cookie: ANA });
    check(emite.code === 200, `Ana invita a su mapa → ${emite.code}`);
    check(!!(emite.d && emite.d.enlace && emite.d.enlace.indexOf('?invita=') > 0),
      `y devuelve un enlace pinchable (${emite.d && emite.d.enlace})`);
    check(!!(emite.d && emite.d.caduca && emite.d.caduca > Date.now() / 1000),
      'con fecha de caducidad en el futuro');
    const VALE = emite.d.vale;

    // ── La propiedad que lo sostiene todo ──────────────────────────────────────────────────────
    console.log('\n§3 ⛔ el vale abre UN mapa, y solo uno');
    const priv = await pide('GET', `/api/mundo?map=${CASA}`);
    check(priv.code === 404 || priv.code === 403,
      `sin vale, el mapa privado de Ana no se ve → ${priv.code}`);
    const con = await pide('GET', `/api/mundo?map=${CASA}&invita=${encodeURIComponent(VALE)}`);
    check(con.code === 200, `con el vale, se entra → ${con.code}`);

    const cruzado = await pide('GET', `/api/mundo?map=${OTRO}&invita=${encodeURIComponent(VALE)}`);
    check(cruzado.code !== 200,
      `⛔ el vale de ${CASA} NO abre ${OTRO} → ${cruzado.code} (200 aquí = llave maestra)`);

    const roto = VALE.slice(0, -1) + (VALE.slice(-1) === '0' ? '1' : '0');
    check((await pide('GET', `/api/mundo?map=${CASA}&invita=${encodeURIComponent(roto)}`)).code !== 200,
      '⛔ un vale con la firma tocada no abre nada');
    check((await pide('GET', `/api/mundo?map=${CASA}&invita=${encodeURIComponent(CASA + '.zz-ana.99999999999.' + 'f'.repeat(32))}`)).code !== 200,
      '⛔ ni uno inventado con caducidad lejana: sin la firma buena no vale');

    // ── Invitar a ver no es invitar a tocar ────────────────────────────────────────────────────
    console.log('\n§4 el vale NO es un comodín: manda la escritura del mapa');
    const edit = { edits: [[1, 1, 1, '']] };
    await pide('POST', '/api/panel/mundo', { cuerpo: { slug: CASA, escritura: 'dueno' }, token: TOKEN });
    const mira = await pide('POST', `/api/mundo/edits?map=${CASA}&invita=${encodeURIComponent(VALE)}`, { cuerpo: edit });
    // 401 y no 403 a propósito: el invitado que llega por enlace es ANÓNIMO, y a un anónimo se le
    // dice «entra», no «no puedes» (`_mundo_ok` responde `403 if u else 401`, con `necesitaEntrar`).
    check(mira.code === 401 && mira.d && mira.d.necesitaEntrar,
      `con escritura:dueno el invitado MIRA, no escribe → ${mira.code}`);
    check((await pide('GET', `/api/mundo?map=${CASA}&invita=${encodeURIComponent(VALE)}`)).code === 200,
      'pero sigue pudiendo entrar a verlo');

    await pide('POST', '/api/panel/mundo', { cuerpo: { slug: CASA, escritura: 'invitados' }, token: TOKEN });
    const toca = await pide('POST', `/api/mundo/edits?map=${CASA}&invita=${encodeURIComponent(VALE)}`, { cuerpo: edit });
    check(toca.code === 200,
      `con escritura:invitados el invitado SÍ construye → ${toca.code}`);
    const sinVale = await pide('POST', `/api/mundo/edits?map=${CASA}`, { cuerpo: edit });
    check(sinVale.code === 403 || sinVale.code === 401 || sinVale.code === 404,
      `y sin el vale, ese mismo POST se rechaza → ${sinVale.code} (el vale es lo único que cambia)`);

  } catch (e) {
    fallos++; console.log('  FALLO excepción: ' + (e && e.stack || e));
  } finally {
    hijo.kill();
    recoge();
    try { fs.rmSync(datosTmp, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n${ok} ok, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})();
