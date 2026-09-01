// @area: general
// @necesita: playwright
//
// F4 · LAS SUPERFICIES DE DESARROLLO, ESCONDIDAS POR PERMISO.
//
// Lo que se prueba aquí es la CORTINA, no la cerradura. La cerradura es F1 y la vigila
// `tests/test_permisos_api.js`: `POST /api/snippets` contesta 403 a quien no tenga
// `snippet.editar_sistema` aunque abra el panel desde la consola. Esto es lo otro — que a un
// invitado no se le enseñe una puerta que no puede abrir — y son tres piezas que se rompen por
// separado:
//
//   1. `web/index.html` pregunta `GET /api/yo` y deja `<html data-puede="…">`.
//   2. `web/style.css` esconde `[data-solo-si=<permiso>]` mientras ese permiso no esté en la lista.
//   3. el snippet `sesion-guardia` tapa los ATAJOS (Alt+C, Alt+D, Alt+A), que es lo único de las
//      tres que el CSS no puede hacer.
//
// ⚠️ La dirección importa y por eso se comprueba en las DOS identidades: nace ESCONDIDO y el
// permiso lo DESTAPA. Al revés —pintarlo y que un snippet lo quite después— habría medio segundo
// con el panel de Código a la vista, que es justamente lo que el plan quería evitar sin tocar
// `app.js`. Un test que solo mirase «el invitado no lo ve» lo cumpliría igual un CSS que lo esconda
// para TODOS, dueño incluido; de ahí §4.
//
// ⚠️ Levanta SU PROPIO servidor en modo público y en otro puerto, como `test_permisos_api.js`: el
// 8500 de desarrollo no tiene los permisos encendidos y allí no se probaría nada. La cuenta se
// asciende escribiendo `permisos_mas` en su fichero, que es la mitad de F1.3 («una cuenta concreta
// podría crear snippets propios») y de paso demuestra por qué la regla del CSS va por PERMISO y no
// por rol: aquí no hay ningún rol «dueno» de por medio.

const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const PUERTO = +(process.argv[2] || 8593);
const BASE = 'http://127.0.0.1:' + PUERTO;
const SECRETO = 'zz-secreto-de-prueba-que-no-vale-para-nada';
const SNIP_PRUEBA = 'zz-test-roles-ui';

let ok = 0, fallos = 0;
const check = (c, m) => c ? (ok++, console.log('  ok    ' + m)) : (fallos++, console.log('  FALLO ' + m));

function pide(metodo, ruta, { cuerpo, cookie } = {}) {
  return new Promise((res, rej) => {
    const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo), 'utf8');
    const headers = {};
    if (datos) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = datos.length; }
    if (cookie) headers['Cookie'] = cookie;
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

async function arranca(intentos = 80) {
  for (let i = 0; i < intentos; i++) {
    const r = await pide('GET', '/api/yo').catch(() => null);
    if (r) return true;
    await new Promise((f) => setTimeout(f, 100));
  }
  throw new Error('el servidor de pruebas no levantó en el ' + PUERTO);
}

const datosTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-roles-'));
const USUARIOS = path.join(datosTmp, 'usuarios');
const hijo = spawn('python3', [path.join(RAIZ, 'server.py'), String(PUERTO)], {
  cwd: RAIZ, stdio: 'ignore',
  env: { ...process.env,
         VOXELFORGE_PUBLICO: '1',
         VOXELFORGE_SECRETO_SESION: SECRETO,
         VOXELFORGE_USUARIOS: USUARIOS,
         VOXELFORGE_PERFILES: path.join(datosTmp, 'perfiles'),
         VOXELFORGE_MUNDOS_META: path.join(datosTmp, 'mundos_meta'),
         VOXELFORGE_REGISTRO: path.join(datosTmp, 'registro', 'acceso.log') },
});

// F1.3 cuenta por cuenta: sin panel (eso es F9) se escribe en su fichero, que es lo mismo que hará
// el panel. `/api/yo` lee la cuenta en cada petición ⇒ basta con recargar la página.
function dale(uid, permisos) {
  const fp = path.join(USUARIOS, uid + '.json');
  const u = JSON.parse(fs.readFileSync(fp, 'utf8'));
  u.permisos_mas = permisos;
  fs.writeFileSync(fp, JSON.stringify(u, null, 2));
}

// El editor pinta la galería y el Mundo compila GLSL; nada de eso hace falta aquí, pero la página
// tiene que haber corrido `app.js` entera para que exista `game`. `?noauto=1` salta el autoarranque
// del editor —que hoy redirige a otro mapa— y por eso `sesion-guardia` se lanza a mano en §3; que
// los autoarranques lo lancen de verdad se comprueba en §5, que no necesita navegador.
const IR = { waitUntil: 'load', timeout: 120000 };

(async () => {
  await arranca();
  const alta = await pide('POST', '/api/registro', { cuerpo: { nombre: 'Zz Ui', clave: 'contrasena123' } });
  if (alta.code !== 200 || !alta.cookie) throw new Error('no se pudo dar de alta la cuenta: ' + alta.code);
  const uid = alta.d.yo.uid;

  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext();
  await ctx.addCookies([{ name: 'vf_sid', value: alta.cookie.split('=')[1],
                          domain: '127.0.0.1', path: '/' }]);
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));

  // `hidden` ya pone `display:none` por la hoja del navegador, así que para ver si es NUESTRA regla
  // la que esconde hay que quitarlo un instante y devolverlo.
  const displaySin = (sel) => p.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return '(no está)';
    const tenia = el.hidden; el.hidden = false;
    const d = getComputedStyle(el).display;
    el.hidden = tenia;
    return d;
  }, sel);

  try {
    console.log('\n§1 en cuarentena: la página sabe quién eres y no destapa nada');
    await p.goto(BASE + '/?noauto=1', IR);
    const puede1 = await p.evaluate(() => document.documentElement.dataset.puede);
    check(puede1 !== undefined, `<html data-puede> está puesto (${JSON.stringify(puede1)})`);
    check(!/snippet\.editar_sistema/.test(puede1 || ''), 'y NO trae snippet.editar_sistema');

    check(await p.$eval('[data-tab="codigo"]', (e) => getComputedStyle(e).display) === 'none',
          'la entrada 🧩 Código del menú no se enseña');
    check(await p.$eval('[data-tab="agentes"]', (e) => getComputedStyle(e).display) === 'none',
          'la entrada 🦴 Agentes tampoco');
    check(await displaySin('#snip-modal') === 'none',
          'y el panel de código sigue escondido aunque le quiten el `hidden` a mano');
    check(await displaySin('#ag-modal') === 'none', 'ídem el de agentes');

    console.log('\n§2 esconder no es prohibir: el servidor contesta igual');
    const post = await p.evaluate(async (id) => {
      const r = await fetch('/api/snippets', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: 'zz', code: '/* zz */' }) });
      return r.status;
    }, SNIP_PRUEBA);
    check(post === 403, `POST /api/snippets desde la propia página → ${post}`);
    check(!fs.existsSync(path.join(RAIZ, 'data', 'snippets', SNIP_PRUEBA + '.json')),
          'y no ha aparecido el fichero (403 que además PARA, no 403 que avisa)');

    console.log('\n§3 los atajos: lo único que el CSS no puede tapar');
    await p.evaluate(() => window.game.snippet('sesion-guardia'));
    const est = await p.evaluate(() => window.game.guardia.estado());
    check(est && est.puesto === true, 'sesion-guardia queda instalado');
    check((est.tapados || []).some((t) => /Alt\+C/.test(t)) && (est.tapados || []).some((t) => /Alt\+A/.test(t)),
          `y declara tapados: ${JSON.stringify(est.tapados)}`);

    await p.keyboard.press('Alt+KeyC');
    await p.waitForTimeout(400);
    check(await p.$eval('#snip-modal', (e) => e.hidden) === true,
          'Alt+C no abre el panel de código (`#snip-modal` sigue con `hidden`)');

    // Reejecutar el snippet NO puede apilar un segundo manejador: el estado vive en `game.guardia`
    // y no en el ámbito de la ejecución, justo para poder encontrar el anterior y quitarlo.
    await p.evaluate(() => window.game.snippet('sesion-guardia'));
    await p.keyboard.press('Alt+KeyC');
    await p.waitForTimeout(400);
    check(await p.$eval('#snip-modal', (e) => e.hidden) === true, 'y ejecutarlo dos veces sigue igual');

    console.log('\n§4 el anti-falso-verde: con el permiso, TODO esto se destapa');
    // Sin esto, un CSS que escondiera el panel para todo el mundo —dueño incluido— pasaría §1 tan
    // contento y el editor quedaría inservible sin que ningún guardián dijera nada.
    check(await p.evaluate(() => window.game.guardia.off()) === true,
          'game.guardia.off() retira el manejador (y devuelve el motor byte a byte: no había nada envuelto)');
    await p.keyboard.press('Alt+KeyC');
    await p.waitForTimeout(600);
    check(await p.$eval('#snip-modal', (e) => e.hidden) === false,
          'ahora Alt+C SÍ llega al editor ⇒ el test estaba apuntando a algo');

    dale(uid, ['snippet.editar_sistema', 'agente.editar', 'asset.subir', 'asset.borrar']);
    await p.goto(BASE + '/?noauto=1', IR);
    const puede2 = await p.evaluate(() => document.documentElement.dataset.puede);
    check(/snippet\.editar_sistema/.test(puede2 || ''), `data-puede ya lo trae (${JSON.stringify(puede2)})`);
    check(await p.$eval('[data-tab="codigo"]', (e) => getComputedStyle(e).display) !== 'none',
          'la entrada 🧩 Código vuelve a enseñarse');
    check(await p.$eval('[data-tab="agentes"]', (e) => getComputedStyle(e).display) !== 'none',
          'y la de 🦴 Agentes');
    check(await displaySin('#snip-modal') !== 'none', 'y el panel de código ya no lo tapa el CSS');

    await p.evaluate(() => window.game.snippet('sesion-guardia'));
    const est2 = await p.evaluate(() => window.game.guardia.estado());
    check(est2 && est2.puesto === false && (est2.tapados || []).length === 0,
          'sesion-guardia no tapa NINGÚN atajo a quien puede usarlos');
    await p.keyboard.press('Alt+KeyC');
    await p.waitForTimeout(600);
    check(await p.$eval('#snip-modal', (e) => e.hidden) === false, 'y Alt+C abre el panel');

    const post2 = await p.evaluate(async (id) => {
      const r = await fetch('/api/snippets', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: 'zz roles ui', code: '/* zz */' }) });
      return r.status;
    }, SNIP_PRUEBA);
    check(post2 === 200, `y el servidor ya deja guardar → ${post2}`);

    console.log('\n§5 el enganche: sin esto, el guardia no lo lanza nadie');
    // El fallo que este trozo caza es el de olvidarse: `parche_snp_guardia.py` es idempotente y no
    // avisa de nada al volver a pasarlo, así que nada más recordaría que hay que pasarlo.
    for (const sid of ['mundo-autoarranque', 'editor-autoarranque']) {
      const doc = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'snippets', sid + '.json'), 'utf8'));
      const veces = (doc.code.match(/==GUARDIA-SESION==/g) || []).length;
      check(veces === 1 && /game\.snippet\('sesion-guardia'\)/.test(doc.code),
            `«${sid}» lanza sesion-guardia, y una sola vez (anclas: ${veces})`);
      check(doc.code.indexOf('==GUARDIA-SESION==') < 200,
            '  …y al PRINCIPIO: al final de 300 KB llegaría tarde, y tras un `location.href` no llegaría');
    }
    const guardia = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'snippets', 'sesion-guardia.json'), 'utf8'));
    check(guardia.protegido === true,
          '`sesion-guardia` se declara protegido en su propio fichero (F2.1: nadie lo borra sin querer)');

    check(errores.length === 0, `la página no lanzó ninguna excepción${errores.length ? ': ' + errores[0] : ''}`);
  } finally {
    // El snippet de §4 lo escribe el servidor de pruebas en `data/snippets/` DE VERDAD: `SNIPS`
    // cuelga de `BASE` y no se puede desviar por entorno, igual que `data/worlds/`.
    const suyo = path.join(RAIZ, 'data', 'snippets', SNIP_PRUEBA + '.json');
    if (fs.existsSync(suyo)) fs.unlinkSync(suyo);
    await b.close().catch(() => {});
    hijo.kill();
    fs.rmSync(datosTmp, { recursive: true, force: true });
  }

  console.log(`\n${ok} ok, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); hijo.kill(); process.exit(1); });
