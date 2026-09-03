// @area: general
// @necesita: servidor, playwright
// La chapa de identidad (`web/quien.js`) — «¿con qué cuenta estoy aquí?».
//
// Petición del dueño: «*hay que poner algo en el editor 2d/3d y básicamente en todas las pantallas,
// menos en las del mapa, para saber con qué usuario se está logueado o si es el dueño con el token de
// diseñador*».
//
// Lo que vigila este test, que es lo que se rompe solo:
// · ⛔ **`/map/<slug>` NO lleva chapa, y `/map` SÍ.** Los dos salen del mismo `index.html`
//   (`server.py`: `/map` → `mapas.html`, `/map/<algo>` → `index.html`), así que quien decide es una
//   expresión regular dentro de `quien.js`. Una regex de más — `^/map(/|$)` — apagaba la chapa en el
//   selector de mundos; una de menos la enciende encima del juego. Las dos se ven sólo probándolo.
// · **el DUEÑO se distingue del usuario, y las tres puertas del dueño entre sí**: token de diseñador,
//   galleta de modo diseño y modo desarrollo (sin token, donde `_es_dueno` dice que sí a cualquiera).
//   Ese último es el que engaña, y por eso `GET /api/yo` devuelve `via`.
//
// Contra el :8500 que ya esté levantado. No escribe nada: sólo mira páginas.

const { chromium } = require('playwright');
const http = require('http');

// Por defecto el :8500 de siempre, pero se puede apuntar a un servidor de usar y tirar
// (`node test_chapa_identidad.js 8577`): el puerto estaba escrito a fuego y probar un cambio
// obligaba a reiniciar el servidor bueno.
const BASE = 'http://localhost:' + (process.argv[2] || process.env.VOXEL_PUERTO || 8500);
const TOKEN = (process.env.VOXELFORGE_TOKEN || '').trim();
let ok = 0, fallos = 0;

function t(texto, cond, extra) {
  if (cond) { ok++; console.log('  ok     ' + texto + (extra ? '   (' + extra + ')' : '')); }
  else { fallos++; console.log('  FALLA  ' + texto + (extra ? '   (' + extra + ')' : '')); }
}

function pide(ruta, cabeceras) {
  return new Promise(res => {
    http.get(BASE + ruta, { headers: cabeceras || {} }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch { res(null); } });
    }).on('error', () => res(null));
  });
}

// El texto de la chapa, o null si no hay chapa. `null` y «está pero vacía» son cosas distintas.
async function chapa(p, url) {
  await p.goto(BASE + url, { waitUntil: 'load', timeout: 60000 });
  try {
    await p.waitForSelector('#vf-quien', { timeout: 3000 });
  } catch { return null; }
  return (await p.textContent('#vf-quien') || '').replace(/\s+/g, ' ').trim();
}

(async () => {
  console.log('\n§1 · qué dice /api/yo de por dónde eres el dueño');
  const anon = await pide('/api/yo');
  // ⚠️ «Sin sesión no eres dueño» sólo es cierto si el servidor TIENE puerta. En modo desarrollo
  // (sin `VOXELFORGE_TOKEN` y sin modo público) `_es_dueno()` dice que sí a cualquiera, que es
  // justamente lo que la chapa tiene que confesar diciendo `via: 'desarrollo'`. Dar eso por fallo
  // dejaba este test en rojo permanente contra el servidor de trabajo, y un test que siempre falla
  // no lo mira nadie: lo que se comprueba es que el servidor **no lo disfrace de sesión**.
  if (anon && anon.via === 'desarrollo') {
    t('el servidor no tiene puerta, y lo DICE en vez de fingir una sesión',
      anon.dueno === true && anon.anonimo === true, JSON.stringify(anon.yo && anon.yo.nombre));
  } else {
    t('un anónimo no es dueño y no trae `via`', anon && !anon.dueno && !anon.via, JSON.stringify(anon));
  }
  if (TOKEN) {
    const dueno = await pide('/api/yo', { 'X-VoxelForge-Token': TOKEN });
    t('con el token, `via` dice «token» y no sólo «dueño»', dueno && dueno.dueno === true && dueno.via === 'token',
      dueno && dueno.via);
  } else {
    // Sin token exportado no se puede probar la puerta del token, pero sí que el servidor no miente
    // llamando «token» a lo que es desarrollo.
    t('sin VOXELFORGE_TOKEN en el entorno, esta parte se salta a propósito', true, 'exporta el token para probarla');
  }

  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  try {
    console.log('\n§2 · la chapa se ve en las pantallas, y dice quién eres');
    for (const url of ['/', '/map', '/fotos', '/videos', '/panel']) {
      const c = await chapa(p, url);
      t('«' + url + '» lleva chapa', c !== null, c);
    }
    const portada = await chapa(p, '/');
    t('…y sin sesión pone que no la hay', /sin entrar|dueño|desarrollo/.test(portada || ''), portada);
    // ⚠️ Y el «entrar» LLEVA a algún sitio. Apuntaba a `/menu`, que es un 404: `server.py` enruta
    // `/panel`, `/map`, `/fotos` y `/videos`, pero la portada no tiene ruta corta. Un enlace roto en
    // la chapa no da error en ninguna parte — sólo no pasa nada al pulsarlo.
    const destino = await p.evaluate(() => {
      const a = document.querySelector('#vf-quien a');
      return a ? fetch(a.href, { credentials: 'same-origin' }).then(r => r.status) : 0;
    });
    t('el enlace de «entrar» lleva a una página que existe', destino === 200 || destino === 0, 'HTTP ' + destino);

    console.log('\n§3 ⛔ en el MAPA no se pinta (es el juego), pero en el selector sí');
    const enJuego = await chapa(p, '/map/test');
    t('«/map/test» NO lleva chapa', enJuego === null, enJuego);
    const enSelector = await chapa(p, '/map');
    t('…y «/map» a secas, que es el selector de mundos, SÍ', enSelector !== null, enSelector);

    if (TOKEN) {
      console.log('\n§4 · en modo diseño la chapa lo DICE, y dice por qué puerta');
      // La galleta de modo diseño (F5.8) abre lo mismo que el token pero desde el navegador. Si la
      // chapa las llamara igual, no habría forma de saber desde dónde estás abriendo el editor.
      const r = await p.evaluate(async (tk) => {
        const res = await fetch('/api/disena', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tk }), credentials: 'same-origin'
        });
        return res.status;
      }, TOKEN);
      t('el navegador entra en modo diseño', r === 200, 'HTTP ' + r);
      const c = await chapa(p, '/');
      t('la chapa pone «dueño», no un nombre de usuario', /dueño/.test(c || ''), c);
      t('…y dice que es por la galleta de modo diseño, no por el token', /modo diseño/.test(c || ''), c);
      t('en el mapa sigue sin pintarse, aunque seas el dueño', (await chapa(p, '/map/test')) === null);
    }

    console.log('\n§5 ⛔ la chapa no tapa NADA que se pueda pulsar');
    // La primera versión flotaba abajo a la izquierda en todas las pantallas y en el editor se comía
    // un botón de la paleta de herramientas. Se ve mirando qué hay DEBAJO, no mirando la captura.
    for (const url of ['/', '/map', '/menu.html', '/panel', '/fotos', '/videos']) {
      await p.goto(BASE + url, { waitUntil: 'load', timeout: 60000 });
      await p.waitForSelector('#vf-quien', { timeout: 5000 }).catch(() => {});
      const tapa = await p.evaluate(() => {
        const c = document.getElementById('vf-quien');
        if (!c) return ['(no hay chapa)'];
        const r = c.getBoundingClientRect();
        const puntos = [[r.x + r.width / 2, r.y + r.height / 2], [r.x + 3, r.y + 3],
                        [r.right - 3, r.y + 3], [r.x + 3, r.bottom - 3], [r.right - 3, r.bottom - 3]];
        const malos = [];
        for (const [x, y] of puntos) {
          for (const e of document.elementsFromPoint(x, y)) {
            if (c.contains(e)) continue;                       // lo suyo no cuenta
            if (/^(BUTTON|A|INPUT|SELECT|LABEL)$/.test(e.tagName)) malos.push(e.tagName + '#' + (e.id || e.className));
          }
        }
        return malos;
      });
      t('«' + url + '» no tapa nada pulsable', tapa.length === 0 || tapa[0] === '(no hay chapa)', tapa.join(', '));
    }

    console.log('\n§5b ⛔ JUGANDO no se pinta, y en las cabeceras va CENTRADA');
    // Las dos son órdenes del dueño (2026-09-02): «*es el único sitio que no tiene que mostrar el
    // cartucho en toda la aplicación*» y «*cuando salga en otras páginas lo quiero centrado*».
    // ⚠️ Mirar la ruta NO basta: el juego se abre DENTRO de «/» (`#mc-modal`), sin cambiar de URL.
    await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForSelector('#vf-quien', { timeout: 5000 }).catch(() => {});
    const sitio = await p.evaluate(() => {
      const c = document.getElementById('vf-quien'); if (!c) return null;
      const r = c.getBoundingClientRect();
      return Math.abs((r.left + r.width / 2) - innerWidth / 2);
    });
    t('en «/» la chapa está centrada', sitio !== null && sitio < 40, sitio + ' px del centro');
    await p.click('.tab-mundo').catch(() => {});
    await p.waitForFunction(() => !document.getElementById('mc-modal').hidden, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const jugando = await p.evaluate(() => ({
      modal: !document.getElementById('mc-modal').hidden,
      display: getComputedStyle(document.getElementById('vf-quien') || document.body).display,
    }));
    t('con el Mundo abierto la chapa NO se pinta', jugando.modal && jugando.display === 'none',
      'modal=' + jugando.modal + ' display=' + jugando.display);

    console.log('\n§5c ⛔ y en el EDITOR DE CÓDIGO tampoco');
    // Segunda orden del dueño (2026-09-02): «*en el editor de código tampoco quiero ver el
    // cartucho*». Es la misma trampa que el Mundo — `#snip-modal` se abre dentro de «/» y tapa la
    // página entera, pero el `z-index` de la chapa la dejaba flotando encima del código.
    await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
    await p.waitForSelector('#vf-quien', { timeout: 5000 }).catch(() => {});
    const codigo = await p.evaluate(async () => {
      const m = document.getElementById('snip-modal');
      if (!m) return { hay: false };
      m.hidden = false;                                   // lo que hace Alt+C, sin depender del atajo
      await new Promise(r => setTimeout(r, 300));
      const d = getComputedStyle(document.getElementById('vf-quien') || document.body).display;
      m.hidden = true;
      await new Promise(r => setTimeout(r, 300));
      return { hay: true, abierto: d, cerrado: getComputedStyle(document.getElementById('vf-quien') || document.body).display };
    });
    t('con el editor de código abierto la chapa NO se pinta', !codigo.hay || codigo.abierto === 'none',
      'display=' + codigo.abierto);
    t('…y al cerrarlo vuelve', !codigo.hay || codigo.cerrado !== 'none', 'display=' + codigo.cerrado);

    console.log('\n§6 · con una cuenta, la chapa pone el nombre y el perfil');
    // Se le pone a `/api/yo` la respuesta de un jugador en vez de registrar una cuenta de verdad:
    // el registro escribe en `data/usuarios/` del repo y ahí no se limpia solo. Lo que se prueba
    // aquí es lo que la chapa HACE con esa respuesta, que es la parte que se rompe al tocarla.
    await p.route('**/api/yo', ruta => ruta.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ anonimo: false, yo: { uid: 'zz-ana', nombre: 'Ana', perfil: 'jugador' } })
    }));
    const conCuenta = await chapa(p, '/');
    t('sale el nombre de la cuenta', /Ana/.test(conCuenta || ''), conCuenta);
    t('…y el perfil, que es lo que decide qué puede hacer', /jugador/.test(conCuenta || ''), conCuenta);
    t('…y NO se le llama dueño', !/dueño|desarrollo/.test(conCuenta || ''), conCuenta);
    await p.unroute('**/api/yo');
  } finally {
    await b.close();
  }

  console.log('\n' + ok + ' ok / ' + fallos + ' fallos · ' + (fallos ? 'HAY FALLOS' : 'TODO OK'));
  process.exit(fallos ? 1 : 0);
})();
