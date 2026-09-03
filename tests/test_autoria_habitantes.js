// @area: general
// @necesita: node
//
// REQ-ASSET1 · De quién es cada habitante, y quién lo ve.
//
// Palabras del dueño: «un usuario que se acaba de crear, cuando accede a los bloques de las ranuras
// ve los assets de tipo "hab:" que son del dueño; debería ver los suyos y los del mundo, pero no los
// de otros usuarios».
//
// Se prueba con DOS cuentas distintas y no con una, porque los tres fallos posibles sólo se ven
// comparando: que Ana vea lo de Bea (el agujero del ticket), que Ana no vea lo suyo (producto roto)
// y que nadie vea lo del mundo (mapas con agujeros — la trampa de los heredados, ver §5).
//
// ⚠️ Levanta SU PROPIO servidor en modo público, en otro puerto y con TODAS las carpetas de datos
// desviadas a un temporal — incluida `VOXELFORGE_HABITANTES`. Sin eso, cada pasada le dejaría al
// dueño dibujos `zz-*` en su galería y una copia de cada uno en la papelera.

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
const check = (c, m) => c ? (ok++, console.log('  ok    ' + m)) : (fallos++, console.log('  FALLO ' + m));

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

// Un dibujo mínimo con el mismo aspecto que manda el editor.
const dibujo = (nombre) => ({ meta: { name: nombre, type: 'objeto' }, size: 4, voxels: { '0,0,0': '#fff' } });

const datosTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-autoria-'));
const HABS = path.join(datosTmp, 'habitantes');
fs.mkdirSync(HABS, { recursive: true });

const hijo = spawn('python3', [path.join(RAIZ, 'server.py'), String(PUERTO)], {
  cwd: RAIZ, stdio: 'ignore',
  env: { ...process.env,
         VOXELFORGE_PUBLICO: '1',
         VOXELFORGE_TOKEN: TOKEN,
         VOXELFORGE_SECRETO_SESION: SECRETO,
         VOXELFORGE_HABITANTES: HABS,
         VOXELFORGE_USUARIOS: path.join(datosTmp, 'usuarios'),
         VOXELFORGE_PERFILES: path.join(datosTmp, 'perfiles'),
         VOXELFORGE_MUNDOS_META: path.join(datosTmp, 'mundos_meta'),
         VOXELFORGE_REGISTRO: path.join(datosTmp, 'registro', 'acceso.log') },
});

const ids = (r) => (r.d || []).map((h) => h.id).sort();

(async () => {
  await arranca();
  try {
    console.log('\n§0 dos cuentas que puedan guardar dibujos');
    const a = await pide('POST', '/api/registro', { cuerpo: { nombre: 'Zz Ana', clave: 'contrasena123' } });
    const b = await pide('POST', '/api/registro', { cuerpo: { nombre: 'Zz Bea', clave: 'contrasena123' } });
    check(a.code === 200 && b.code === 200, `las dos cuentas se crean (${a.code}/${b.code})`);
    const ANA = a.cookie, BEA = b.cookie;
    // Nacen en cuarentena, que no puede guardar habitantes: se les sube a `jugador`.
    for (const uid of ['zz-ana', 'zz-bea']) {
      await pide('POST', '/api/panel/cuenta', { cuerpo: { uid, perfil: 'jugador' }, token: TOKEN });
    }
    // ⚠️ Los permisos cuelgan de `yo`, no de la raíz: `{anonimo, yo:{uid, perfil, permisos, cuota}}`.
    const yoA = await pide('GET', '/api/yo', { cookie: ANA });
    check((((yoA.d || {}).yo || {}).permisos || []).includes('habitante.guardar'),
          'y pueden guardar habitantes');

    console.log('\n§1 el documento nace con su autor dentro (ANTES no guardaba nada de quién era)');
    const g1 = await pide('POST', '/api/habitantes', { cuerpo: dibujo('Zz Silla De Ana'), cookie: ANA });
    check(g1.code === 200, `Ana guarda → ${g1.code}`);
    const enDisco = JSON.parse(fs.readFileSync(path.join(HABS, 'zz-silla-de-ana.json'), 'utf8'));
    check(enDisco.autor === 'zz-ana', `el fichero lleva autor: ${JSON.stringify(enDisco.autor)}`);

    console.log('\n§2 ⛔ EL AGUJERO DEL TICKET: Bea no ve el dibujo de Ana');
    await pide('POST', '/api/habitantes', { cuerpo: dibujo('Zz Mesa De Bea'), cookie: BEA });
    const listaB = await pide('GET', '/api/habitantes', { cookie: BEA });
    check(ids(listaB).join(',') === 'zz-mesa-de-bea',
          `la galería de Bea es sólo lo suyo: [${ids(listaB)}]`);
    const listaA = await pide('GET', '/api/habitantes', { cookie: ANA });
    check(ids(listaA).join(',') === 'zz-silla-de-ana',
          `y la de Ana sólo lo suyo: [${ids(listaA)}]`);

    console.log('\n§3 …y esconderlo de la lista no basta: por su id tampoco se baja');
    const robo = await pide('GET', '/api/habitantes/zz-silla-de-ana', { cookie: BEA });
    check(robo.code === 403, `Bea pide el de Ana por id → ${robo.code}`);
    const mio = await pide('GET', '/api/habitantes/zz-silla-de-ana', { cookie: ANA });
    check(mio.code === 200 && mio.d.meta.name === 'Zz Silla De Ana', 'y Ana sí se lo baja');
    const anon = await pide('GET', '/api/habitantes');
    check(anon.code === 200 && ids(anon).length === 0, `un anónimo no ve ninguno: [${ids(anon)}]`);

    console.log('\n§4 el nombre choca (el id es el nombre): se avisa, NO se sobrescribe');
    const choque = await pide('POST', '/api/habitantes', { cuerpo: dibujo('Zz Silla De Ana'), cookie: BEA });
    check(choque.code === 409, `Bea guarda con el nombre de Ana → ${choque.code} (no 200)`);
    const sigue = JSON.parse(fs.readFileSync(path.join(HABS, 'zz-silla-de-ana.json'), 'utf8'));
    check(sigue.autor === 'zz-ana', 'y el dibujo de Ana sigue siendo de Ana');

    console.log('\n§5 «del mundo» es un TERCER estado, no la ausencia de dueño');
    // Un heredado (sin autor) es lo que había antes del ticket: no se ve...
    fs.writeFileSync(path.join(HABS, 'zz-heredado.json'), JSON.stringify(dibujo('Zz Heredado')));
    // ...y uno marcado `compartido` sí, que es lo que hace `herramientas/adopta_habitantes.py` con
    // los que están estampados en mundos y snippets. Sin esto, esos mapas se abren con agujeros.
    const mundo = { ...dibujo('Zz Del Mundo'), compartido: true };
    fs.writeFileSync(path.join(HABS, 'zz-del-mundo.json'), JSON.stringify(mundo));
    const vistaB = await pide('GET', '/api/habitantes', { cookie: BEA });
    check(ids(vistaB).includes('zz-del-mundo'), 'Bea ve el que es del mundo');
    check(!ids(vistaB).includes('zz-heredado'), 'y NO ve el heredado sin marcar');
    const flag = (vistaB.d || []).find((h) => h.id === 'zz-del-mundo');
    check(flag && flag.compartido === true && flag.autor === '',
          'el listado dice cuál es del mundo y de quién es (para pintarlo en la galería)');

    console.log('\n§6 que sea del mundo no lo hace de todos: sólo su autor lo borra');
    const borra = await pide('DELETE', '/api/habitantes/zz-del-mundo', { cookie: BEA });
    check(borra.code === 403, `Bea borra uno heredado del mundo → ${borra.code}`);
    const ajeno = await pide('DELETE', '/api/habitantes/zz-silla-de-ana', { cookie: BEA });
    check(ajeno.code === 403, `Bea borra el de Ana → ${ajeno.code}`);
    const propio = await pide('DELETE', '/api/habitantes/zz-mesa-de-bea', { cookie: BEA });
    check(propio.code === 200, `Bea borra el suyo → ${propio.code}`);

    console.log('\n§7 el autor no se puede regalar por `curl`');
    // El editor manda el documento entero, así que el campo VIENE en el cuerpo. Hacerle caso sería
    // dejar que cualquiera se apunte la autoría de un dibujo — o que la borre al reguardar.
    const falso = { ...dibujo('Zz Robado'), autor: 'zz-ana' };
    await pide('POST', '/api/habitantes', { cuerpo: falso, cookie: BEA });
    const quien = JSON.parse(fs.readFileSync(path.join(HABS, 'zz-robado.json'), 'utf8'));
    check(quien.autor === 'zz-bea', `manda quién guarda, no lo que diga el cuerpo: ${quien.autor}`);

    console.log('\n§8 el dueño del servidor lo ve todo (si no, el panel no sirve)');
    const todo = await pide('GET', '/api/habitantes', { token: TOKEN });
    check(ids(todo).includes('zz-silla-de-ana') && ids(todo).includes('zz-heredado'),
          `con token salen todos: [${ids(todo)}]`);
  } catch (e) {
    fallos++;
    console.log('  FALLO (excepción) ' + (e && e.stack || e));
  }

  hijo.kill();
  fs.rmSync(datosTmp, { recursive: true, force: true });
  console.log(`\n${ok} ok, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})();
