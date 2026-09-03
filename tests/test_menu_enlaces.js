// @area: editor
// @necesita: servidor, playwright
//
// Los enlaces del menú «⋯» a las otras páginas del sitio, y los rótulos que los agrupan.
// Lo que vigila este guardián no es que existan (eso se ve mirando), sino las cinco cosas que se
// rompen en silencio y no se notan hasta que alguien pierde trabajo:
//
//   · Son `<a href>` de verdad, no botones con un `onclick`. Un botón no ofrece «abrir en pestaña
//     nueva» ni «copiar dirección», y el clic central no hace nada.
//   · `target="_blank"` — el editor tiene trabajo SIN GUARDAR; navegar fuera en la misma pestaña
//     lo tira. Y con `_blank` es obligado `rel="noopener"`: sin él la pestaña nueva recibe
//     `window.opener` y puede reescribir la de origen. La ÚNICA excepción es la Portada, que es
//     «salir de aquí» y va a propósito en la misma pestaña.
//   · No llevan `data-tab`, que es lo que hace que el enrutador de `app.js` los ignore y deje pasar
//     el clic en vez de intentar abrir una pestaña interna inexistente.
//   · La ruta acaba en barra. Sin ella el servidor estático contesta 301, y un 301 en `target=_blank`
//     es un viaje de más en cada clic.
//   · Las entradas con permiso (`data-solo-si`) se ven SI Y SOLO SI se tiene el permiso, y el
//     rótulo de un grupo entero escondido se esconde con él (`data-solo-si-alguno`). Un rótulo
//     flotando sobre un hueco no rompe nada, y por eso nadie lo arregla nunca.
const { chromium } = require('/root/voxel/node_modules/playwright');

let fallos = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if(!c) fallos++; };

// `permiso` = lo que hace falta para verlo; sin él, la entrada TIENE que estar escondida. Quién
// esconde es `web/style.css` y quién destapa es `sesion-guardia` poniendo `data-puede` en el <html>
// con lo que devuelve `GET /api/yo` — así que este test vale igual con sesión y sin ella.
const ESPERADOS = [
  { ruta:'/menu.html',         nueva:false },
  { ruta:'/menu.html#crear',   nueva:false, permiso:'mundo.crear' },
  { ruta:'/menu.html#invitar', nueva:false, permiso:'multi.invitar' },
  { ruta:'/map/',      nueva:true },
  { ruta:'/fotos',     nueva:true },
  { ruta:'/videos',    nueva:true },
  { ruta:'/wiki/',     nueva:true },
  { ruta:'/panel',     nueva:true, permiso:'panel.usar' },
  { ruta:'/images/',   nueva:true, permiso:'asset.subir' },
];
// Rótulo o disparador de submenú → los permisos de su grupo. Se ve si se tiene ALGUNO; con ninguno,
// se esconde. `Diseño` sigue siendo un rótulo suelto (`.menu-titulo`) y no un submenú a propósito:
// son dos entradas con atajo de teclado (Alt+C / Alt+A) y esconderlas tras un clic más las mata.
// `Mundos` no pide permiso porque «Mundos ↗» no lo pide: el grupo nunca se queda vacío.
const ROTULOS = {
  'Diseño':         ['snippet.editar_sistema', 'agente.editar'],
};
const SUBMENUS = {
  'Este objeto':    null,   // sin permiso: siempre visible
  'Mundos':         null,
  'El sitio':       null,
  'Administración': ['panel.usar', 'asset.subir'],
};

(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport:{ width:1280, height:900 } });
  const errores = [];
  p.on('console', m => { if(m.type() === 'error') errores.push(m.text()); });
  try {
    // `?noauto=1`: el editor ejecuta el snippet de autoarranque del dueño, que hoy navega a otro mapa.
    // Y `/index.html` explícito, NO `/`: en modo público la raíz sirve la PORTADA a quien no es
    // dueño (`server.py:1442`), y allí no hay editor ni menú «⋯» que mirar — el test se quedaba
    // esperando un `window.game` que no iba a llegar.
    await p.goto('http://localhost:8500/index.html?noauto=1', { waitUntil:'networkidle' });
    await p.waitForFunction("typeof window.game !== 'undefined'");

    // «⋯» es un CONMUTADOR: abrirlo solo si está cerrado, o la segunda visita lo cierra.
    await p.evaluate(() => {
      if(document.getElementById('mas-menu').hidden) document.getElementById('btn-mas').click();
    });
    await p.waitForFunction("!document.getElementById('mas-menu').hidden");

    // Lo que se mide aquí es si el PERMISO lo esconde, no si su grupo está plegado: por eso se abre
    // el submenú que lo contiene mientras se mira. Plegado, `offsetParent` es null para todos y el
    // test diría que no se ve ninguno — un falso rojo que taparía el fallo de verdad.
    const enlaces = await p.evaluate(() =>
      [...document.querySelectorAll('#mas-menu a.menu-item')].map(a => {
        const grupo = a.closest('.menu-cuerpo');
        const plegado = grupo && grupo.hidden;
        if(plegado) grupo.hidden = false;
        const dato = {
          href: a.getAttribute('href'),
          target: a.getAttribute('target'),
          rel: a.getAttribute('rel') || '',
          tab: a.getAttribute('data-tab'),
          texto: (a.childNodes[0].textContent || '').trim(),
          visible: !!a.offsetParent,
          subrayado: getComputedStyle(a).textDecorationLine
        };
        if(plegado) grupo.hidden = true;
        return dato;
      }));

    // Lo que el navegador cree que puede este visitante. Es la referencia contra la que se juzga
    // qué DEBE verse: el test no exige ser dueño, exige coherencia con `/api/yo`.
    const puede = await p.evaluate(() => (document.documentElement.dataset.puede || '').split(/\s+/));
    const tiene = (ps) => !ps || ps.some(x => puede.includes(x));

    console.log('\n§1 · los enlaces están y son enlaces de verdad');
    console.log('  · permisos de este visitante: ' + (puede.filter(Boolean).join(' ') || '(ninguno)'));
    ok(enlaces.length === ESPERADOS.length,
       `hay ${ESPERADOS.length} <a> en el menú → ` + enlaces.length);
    for (const { ruta, nueva, permiso } of ESPERADOS) {
      const a = enlaces.find(e => e.href === ruta);
      ok(!!a, 'existe el enlace a ' + ruta + (a ? ' («' + a.texto + '»)' : ''));
      if(!a) continue;
      const debe = tiene(permiso ? [permiso] : null);
      ok(a.visible === debe, ruta + ' · ' + (debe ? 'se ve en el menú'
         : 'escondido, que es lo que toca sin «' + permiso + '»'));
      if (nueva) {
        ok(a.target === '_blank', ruta + ' · abre en pestaña nueva → target=' + a.target);
        ok(/\bnoopener\b/.test(a.rel), ruta + ' · lleva rel=noopener → rel=' + JSON.stringify(a.rel));
      } else {
        // Sin `_blank` no hace falta `noopener`, y exigirlo sería ruido.
        ok(a.target === null, ruta + ' · en la MISMA pestaña, a propósito → target=' + a.target);
      }
      ok(a.tab === null, ruta + ' · sin data-tab (el enrutador lo deja pasar)');
      ok(a.subrayado === 'none', ruta + ' · sin subrayado, como el resto del menú');
    }

    console.log('\n§1b · los rótulos agrupan, y no sobreviven a su grupo');
    const rotulos = await p.evaluate(() =>
      [...document.querySelectorAll('#mas-menu .menu-titulo')].map(t => ({
        texto: t.textContent.trim(),
        visible: !!t.offsetParent,
        // Un rótulo NO puede ser `.menu-item`: el enrutador hace `closest('.menu-item')` y se
        // tragaría el clic, cerrando el menú sin ir a ninguna parte.
        esItem: t.classList.contains('menu-item')
      })));
    for (const [texto, permisos] of Object.entries(ROTULOS)) {
      const t = rotulos.find(r => r.texto === texto);
      ok(!!t, 'existe el rótulo «' + texto + '»');
      if(!t) continue;
      ok(!t.esItem, '«' + texto + '» no es .menu-item (no se traga el clic)');
      ok(t.visible === tiene(permisos), '«' + texto + '» ' +
         (tiene(permisos) ? 'se ve' : 'se esconde con su grupo, sin dejar el rótulo flotando'));
    }

    console.log('\n§1c · los submenús: existen, pliegan y no se tragan el clic');
    const subs = await p.evaluate(() =>
      [...document.querySelectorAll('#mas-menu .menu-sub')].map(t => ({
        texto: (t.childNodes[0].textContent || '').trim(),
        visible: !!t.offsetParent,
        // Misma trampa que con los rótulos, y aquí es peor: `closest('.menu-item')` cerraría el
        // menú entero en el clic que iba a desplegar el grupo, y el grupo no se vería nunca.
        esItem: t.classList.contains('menu-item'),
        controla: t.getAttribute('aria-controls'),
        cuerpo: !!document.getElementById(t.getAttribute('aria-controls') || ''),
        plegado: t.getAttribute('aria-expanded') === 'false',
      })));
    for (const [texto, permisos] of Object.entries(SUBMENUS)) {
      const t = subs.find(s => s.texto === texto);
      ok(!!t, 'existe el submenú «' + texto + '»');
      if(!t) continue;
      ok(!t.esItem, '«' + texto + '» no es .menu-item (no cierra el menú al desplegarlo)');
      ok(t.cuerpo, '«' + texto + '» apunta con aria-controls a un cuerpo que existe → ' + t.controla);
      ok(t.plegado, '«' + texto + '» arranca plegado');
      ok(t.visible === tiene(permisos), '«' + texto + '» ' +
         (tiene(permisos) ? 'se ve' : 'se esconde con su grupo, sin dejar el disparador vacío'));
    }
    // La ganancia del ticket, medida: con todo plegado el menú tiene que caber de largo. 17 filas
    // seguidas era lo que se pidió arreglar, así que se cuenta lo que se VE, no lo que hay.
    const largo = await p.evaluate(() => {
      const m = document.getElementById('mas-menu');
      const vis = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      return {
        filas: [...m.querySelectorAll('.menu-item, .menu-sub')].filter(vis).length,
        alto: Math.round(m.getBoundingClientRect().height),
        tope: Math.round(window.innerHeight * 0.8),
      };
    });
    ok(largo.filas <= 10, 'plegado no pasa de 10 filas a la vista → ' + largo.filas);
    ok(largo.alto <= largo.tope, 'plegado cabe sin scroll → ' + largo.alto + 'px de ' + largo.tope);

    console.log('\n§1d · el acordeón: desplegar no cierra el menú, y solo hay uno abierto');
    await p.click('#mas-menu .menu-sub[aria-controls="sub-objeto"]');
    let A = await p.evaluate(() => ({
      menu: !document.getElementById('mas-menu').hidden,
      objeto: !document.getElementById('sub-objeto').hidden,
      nuevoVisible: !!document.getElementById('btn-nuevo').offsetParent,
    }));
    ok(A.menu, 'desplegar un grupo NO cierra el «⋯»');
    ok(A.objeto && A.nuevoVisible, '«Este objeto» se abre y enseña sus entradas');
    await p.click('#mas-menu .menu-sub[aria-controls="sub-sitio"]');
    A = await p.evaluate(() => ({
      objeto: !document.getElementById('sub-objeto').hidden,
      sitio: !document.getElementById('sub-sitio').hidden,
    }));
    ok(!A.objeto && A.sitio, 'abrir otro grupo pliega el anterior (uno a la vez)');
    await p.click('#mas-menu .menu-sub[aria-controls="sub-sitio"]');
    ok(await p.evaluate(() => document.getElementById('sub-sitio').hidden),
       'un segundo clic en el mismo lo vuelve a plegar');
    // Cerrar y reabrir el «⋯» tiene que devolverlo corto: si no, la primera vez cabe y la segunda no.
    await p.click('#mas-menu .menu-sub[aria-controls="sub-objeto"]');
    await p.keyboard.press('Escape');
    await p.evaluate(() => { if(document.getElementById('mas-menu').hidden) document.getElementById('btn-mas').click(); });
    ok(await p.evaluate(() => [...document.querySelectorAll('#mas-menu .menu-cuerpo')].every(c => c.hidden)),
       'cerrar el «⋯» pliega los grupos: al reabrirlo vuelve a estar corto');

    console.log('\n§1e · Salir: solo si hay de qué salir');
    const salir = await p.evaluate(() => {
      const b = document.getElementById('btn-salir');
      return b && { visible: !!b.offsetParent, tab: b.getAttribute('data-tab'),
                    sesion: document.documentElement.dataset.sesion };
    });
    ok(!!salir, 'existe la entrada 🚪 Salir');
    if (salir) {
      ok(salir.sesion === 'si' || salir.sesion === 'no',
         '`data-sesion` está puesto → ' + JSON.stringify(salir.sesion));
      ok(salir.visible === (salir.sesion === 'si'), 'Salir ' +
         (salir.sesion === 'si' ? 'se ve, que hay sesión'
                                : 'se esconde sin sesión (a un anónimo no se le ofrece salir)'));
      ok(salir.tab === null, 'Salir · sin data-tab (lo suyo lo hace su propio manejador)');
    }

    console.log('\n§2 · las rutas contestan 200 y no 301 (la barra final)');
    // El `#ancla` no viaja al servidor: se quita aquí para no pedir dos veces la misma página.
    for (const ruta of [...new Set(ESPERADOS.map(e => e.ruta.split('#')[0]))]) {
      const r = await p.request.get('http://localhost:8500' + ruta, { maxRedirects: 0 });
      ok(r.status() === 200, ruta + ' → ' + r.status());
    }

    console.log('\n§3 · el clic no rompe el editor');
    // El enlace se neutraliza (`target=_self` + `href=#`) solo para este comprobante: lo que se
    // vigila es que el enrutador NO lo trate como pestaña interna ni deje el editor tocado.
    // Se mira por el DOM y no por `window.state`: `state` es un `const` de módulo y NO está
    // expuesto, así que preguntarle a `window.state` devuelve siempre `undefined` y la
    // comprobación pasaría sola sin comprobar nada. El contador `#voxel-count` lo escribe
    // `updateInfo` desde ese mismo `state`, que es justo lo que se quiere vigilar.
    // Y se miran los OVERLAYS, no «qué pestaña está activa»: al cargar el editor no hay ninguna
    // activa —las tres visibles (Galería, Mundo, ⋯) abren una capa encima, no una vista— así que
    // comparar `.tab.is-active` sería comparar `null` con `null` para siempre. Lo que de verdad
    // haría un enrutador confundido por estos `<a>` es abrir uno de estos overlays.
    const CAPAS = ['hab-modal', 'mc-modal', 'snip-modal', 'mapa-modal'];
    const foto = () => p.evaluate((ids) => ({
      abiertos: ids.filter(id => { const e = document.getElementById(id); return e && !e.hidden; }),
      vox: document.getElementById('voxel-count').textContent,
      menu: document.getElementById('mas-menu').hidden,
      url: location.pathname
    }), CAPAS);
    const antes = await foto();
    await p.evaluate(() => {
      const a = document.querySelector('#mas-menu a.menu-item[href="/wiki/"]');
      a.setAttribute('href', 'javascript:void 0'); a.removeAttribute('target'); a.click();
    });
    await p.waitForTimeout(200);
    const despues = await foto();
    ok(despues.url === '/index.html', 'seguimos en el editor → ' + despues.url);
    ok(despues.abiertos.length === 0 && antes.abiertos.length === 0,
       'el clic no abrió ningún overlay → ' + JSON.stringify(despues.abiertos));
    ok(despues.vox === antes.vox, 'el modelo está intacto → ' + despues.vox);
    ok(despues.menu === true, 'y el menú «⋯» se cerró solo tras el clic');

    console.log('');
    ok(errores.length === 0, 'consola limpia' + (errores.length ? ' → ' + errores.join(' | ') : ''));
  } catch (e) {
    console.log('  ✘ excepción: ' + e.message); fallos++;
  } finally {
    await b.close();
  }
  console.log(fallos ? `\n❌  ${fallos} fallos` : '\n✅  todo ok');
  process.exit(fallos ? 1 : 0);
})();
