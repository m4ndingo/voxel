// @area: general
// @necesita: playwright
//
// Las tres pegas que el dueño encontró de camino a crear un mundo (2026-09-03), que son tres
// síntomas del mismo error: la portada creaba mundos por su cuenta en vez de mandar al único sitio
// que sabe hacerlo.
//
//   1. «Crear un mundo» de la portada abría un `prompt()` y mandaba SOLO el nombre a
//      `/api/mundos/crear`. Sin plantilla el mapa nace `generado:false` y nadie lo construye después
//      —quien lo levanta es `generador-mundo` desde el autoarranque, y necesita saber qué generar—,
//      así que el jugador aterrizaba en un mundo VACÍO y daba el juego por roto. Ahora es un enlace
//      al asistente de `/map` (REQ-PLANT1), que es donde se elige plantilla, tamaño y ambiente.
//   2. Elegida la plantilla, el cursor se queda donde estaba y lo único que falta por teclear es el
//      nombre. Va solo.
//   3. Al pulsar CREAR, el mensaje de error empujaba el asistente entero hacia arriba.
//
// ⚠️ EL §3 ES EL QUE MERECE EL FICHERO, y lo que mide no es lo que parece. NO hay desplazamiento de
// la ventana (`scrollY` se queda en 0, se comprobó): lo que se movía era el PANEL, porque el mensaje
// vivía dentro del pie con un `min-height` de una línea y el texto lo escribe el SERVIDOR. Con la
// frase de la cuota —tres líneas— el pie crecía 39 px y la tira de fichas encogía otros tantos. Por
// eso el test manda un error LARGO a propósito: con «no se ha podido crear» el salto es de 3 px y
// pasa por ruido, que es exactamente cómo se coló. Reservar más hueco sólo cambiaría el tamaño del
// salto; el arreglo es que el mensaje no ocupe sitio.
//
// Levanta SU PROPIO servidor en modo público (los usuarios y el registro de mapas van a un temporal,
// los snippets y las plantillas son los del repo) y no crea ningún mundo: el POST se intercepta.

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const PUERTO = +(process.argv[2] || 8598);
const SITIO = 'http://localhost:' + PUERTO;
const SECRETO = 'zz-secreto-de-prueba-que-no-vale-para-nada';

// Larga a propósito: es la que rompía la maqueta. Sale de la cuota, que es el error que de verdad se
// va a encontrar quien use esto.
const ERROR_LARGO = 'Ya has llegado a tu cuota de 5 mundos y a los 100 MB que tienes asignados: '
                  + 'borra alguno de los tuyos desde este mismo listado antes de crear otro.';

let ok = 0, fallos = 0;
const check = (c, m, extra) => c
  ? (ok++, console.log('  ok     ' + m + (extra ? '   (' + extra + ')' : '')))
  : (fallos++, console.log('  FALLO  ' + m + (extra ? '   (' + extra + ')' : '')));

function pide(metodo, ruta, cuerpo) {
  return new Promise((res, rej) => {
    const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo), 'utf8');
    const headers = datos ? { 'Content-Type': 'application/json', 'Content-Length': datos.length } : {};
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

const datosTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-asis-'));
const USUARIOS = path.join(datosTmp, 'usuarios');

const hijo = spawn('python3', [path.join(RAIZ, 'server.py'), String(PUERTO)], {
  cwd: RAIZ, stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env,
         VOXELFORGE_PUBLICO: '1',
         VOXELFORGE_TOKEN: 'zz-token-de-prueba',
         VOXELFORGE_SECRETO_SESION: SECRETO,
         VOXELFORGE_USUARIOS: USUARIOS,
         VOXELFORGE_PERFILES: path.join(datosTmp, 'perfiles'),
         VOXELFORGE_MUNDOS_META: path.join(datosTmp, 'mundos_meta'),
         VOXELFORGE_REGISTRO: path.join(datosTmp, 'registro', 'acceso.log') },
});

// El perfil de partida es `cuarentena`, que sólo juega: sin esto la portada ni siquiera pinta el
// botón. Es el mismo atajo de `test_mundos_propiedad.js` (el panel que lo haría bien es F9).
function dale(uid, permisos) {
  const fp = path.join(USUARIOS, uid + '.json');
  const u = JSON.parse(fs.readFileSync(fp, 'utf8'));
  u.permisos_mas = permisos;
  fs.writeFileSync(fp, JSON.stringify(u, null, 2));
}

const geo = () => {
  const pie = document.querySelector('.asis-pie');
  const tira = document.querySelector('.asis-tira');
  const err = document.querySelector('#a-err');
  return {
    y: window.scrollY,
    pieTop: Math.round(pie.getBoundingClientRect().top),
    pieAlto: Math.round(pie.getBoundingClientRect().height),
    tiraAlto: Math.round(tira.getBoundingClientRect().height),
    errAlto: Math.round(err.getBoundingClientRect().height),
    errTexto: err.textContent,
  };
};

let nav = null;
(async () => {
  try {
    await arranca();
    const alta = await pide('POST', '/api/registro', { nombre: 'zz asis', clave: 'contrasena123' });
    if (alta.code !== 200) throw new Error('no se pudo dar de alta la cuenta de prueba: ' + alta.code);
    dale('zz-asis', ['mundo.crear']);

    nav = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
    const ctx = await nav.newContext({ viewport: { width: 1200, height: 700 } });
    await ctx.addCookies([{ name: 'vf_sid', value: alta.cookie.split('=')[1], domain: 'localhost', path: '/' }]);
    const p = await ctx.newPage();
    const errores = [];
    p.on('pageerror', (e) => errores.push(String(e)));
    // ⛔ El `prompt()` de antes: si vuelve, aquí se ve. Sin este manejador Playwright lo descarta
    // solo y el test pasaría tan contento con el fallo delante.
    const dialogos = [];
    p.on('dialog', (d) => { dialogos.push(d.type() + ': ' + d.message()); d.dismiss().catch(() => {}); });

    console.log('\n§1 la portada MANDA al asistente; no crea mundos ella');
    await p.goto(SITIO + '/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForSelector('#crear', { timeout: 20000 });
    const boton = await p.evaluate(() => {
      const c = document.getElementById('crear');
      return { tag: c.tagName, href: c.getAttribute('href') };
    });
    // Un enlace de verdad, no un botón con `onclick`: así vale el clic central y «abrir en pestaña
    // nueva», que en una portada es lo normal.
    check(boton.tag === 'A', '«Crear un mundo» es un <a>, no un <button>', boton.tag);
    check(boton.href === '/map?nuevo=1', 'y apunta al asistente de /map', boton.href);

    await p.click('#crear');
    await p.waitForSelector('.asis', { timeout: 30000 });
    check(dialogos.length === 0, 'ni un prompt() por el camino', dialogos.join(' · '));
    check(await p.$$eval('.asis .ficha', (f) => f.length) >= 2,
          'el asistente abre con su carrusel de plantillas');
    // Se gasta al usarlo: si se quedara en la barra, volver atrás desde el mundo recién creado —o
    // recargar tras cancelar— reabriría el asistente encima del listado.
    check(!(await p.evaluate(() => location.search)).includes('nuevo'),
          '…y `?nuevo=1` desaparece de la barra', await p.evaluate(() => location.search));

    console.log('\n§2 elegida la plantilla, el cursor va al nombre');
    await p.evaluate(() => { document.getElementById('a-nom').blur(); });
    const yAntes = await p.evaluate(() => window.scrollY);
    await p.click('.asis .ficha:not(.sel)');
    await p.waitForTimeout(700);           // `centra()` desplaza la tira con `behavior:'smooth'`
    check(await p.evaluate(() => document.activeElement && document.activeElement.id) === 'a-nom',
          'el foco está en el recuadro del nombre');
    check(await p.evaluate(() => document.querySelector('.asis .ficha.sel') !== null),
          'y la ficha pulsada queda seleccionada');
    // `focus()` sin `preventScroll` arrastra a todos los ancestros, que es la enfermedad del §3.
    check(await p.evaluate(() => window.scrollY) === yAntes, 'y enfocar no ha desplazado la página');

    console.log('\n§3 el mensaje de error NO mueve el asistente');
    await p.route('**/api/mundos/crear', (r) => r.fulfill({
      status: 409, contentType: 'application/json', body: JSON.stringify({ error: ERROR_LARGO }),
    }));
    await p.fill('#a-nom', 'zz-asistente-ui');
    const antes = await p.evaluate(geo);
    await p.click('#a-crear');
    await p.waitForFunction('document.querySelector("#a-err").textContent.length > 40', null, { timeout: 15000 });
    await p.waitForTimeout(400);
    const despues = await p.evaluate(geo);

    check(despues.errTexto === ERROR_LARGO, 'el error del servidor se lee entero');
    check(despues.errAlto > 40, '…y ocupa varias líneas, que es el caso que rompía', despues.errAlto + 'px');
    check(despues.pieTop === antes.pieTop,
          'el pie no se mueve ni un píxel', antes.pieTop + ' → ' + despues.pieTop);
    check(despues.tiraAlto === antes.tiraAlto,
          'ni encoge la tira de fichas', antes.tiraAlto + ' → ' + despues.tiraAlto);
    check(despues.y === antes.y && despues.y === 0, 'ni se desplaza la ventana', 'scrollY ' + despues.y);
    check(await p.evaluate(() => !document.getElementById('a-crear').disabled),
          'y CREAR vuelve a estar disponible para reintentar');

    console.log('\n§4 sin errores en la página');
    check(errores.length === 0, 'ningún pageerror', errores.join(' · '));
  } finally {
    if (nav) await nav.close().catch(() => {});
    hijo.kill();
    fs.rmSync(datosTmp, { recursive: true, force: true });
  }

  console.log(`\n${ok} ok, ${fallos} fallos` + (fallos ? '' : '  —  TODO OK'));
  process.exit(fallos ? 1 : 0);
})().catch((e) => { hijo.kill(); console.error(e); process.exit(1); });
