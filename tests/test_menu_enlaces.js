// @area: editor
// @necesita: servidor, playwright
//
// Los cuatro enlaces del menú «⋯» a las otras páginas del sitio: /map/, /fotos, /images/ y /wiki/.
// Lo que vigila este guardián no es que existan (eso se ve mirando), sino las cuatro cosas que se
// rompen en silencio y no se notan hasta que alguien pierde trabajo:
//
//   · Son `<a href>` de verdad, no botones con un `onclick`. Un botón no ofrece «abrir en pestaña
//     nueva» ni «copiar dirección», y el clic central no hace nada.
//   · `target="_blank"` — el editor tiene trabajo SIN GUARDAR; navegar fuera en la misma pestaña
//     lo tira. Y con `_blank` es obligado `rel="noopener"`: sin él la pestaña nueva recibe
//     `window.opener` y puede reescribir la de origen.
//   · No llevan `data-tab`, que es lo que hace que el enrutador de `app.js` los ignore y deje pasar
//     el clic en vez de intentar abrir una pestaña interna inexistente.
//   · La ruta acaba en barra. Sin ella el servidor estático contesta 301, y un 301 en `target=_blank`
//     es un viaje de más en cada clic.
const { chromium } = require('/root/voxel/node_modules/playwright');

let fallos = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if(!c) fallos++; };

const ESPERADOS = ['/map/', '/fotos', '/images/', '/wiki/'];

(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport:{ width:1280, height:900 } });
  const errores = [];
  p.on('console', m => { if(m.type() === 'error') errores.push(m.text()); });
  try {
    // `?noauto=1`: la raíz ejecuta el snippet de autoarranque del dueño, que hoy navega a otro mapa.
    await p.goto('http://localhost:8500/?noauto=1', { waitUntil:'networkidle' });
    await p.waitForFunction("typeof window.game !== 'undefined'");

    // «⋯» es un CONMUTADOR: abrirlo solo si está cerrado, o la segunda visita lo cierra.
    await p.evaluate(() => {
      if(document.getElementById('mas-menu').hidden) document.getElementById('btn-mas').click();
    });
    await p.waitForFunction("!document.getElementById('mas-menu').hidden");

    const enlaces = await p.evaluate(() =>
      [...document.querySelectorAll('#mas-menu a.menu-item')].map(a => ({
        href: a.getAttribute('href'),
        target: a.getAttribute('target'),
        rel: a.getAttribute('rel') || '',
        tab: a.getAttribute('data-tab'),
        texto: (a.childNodes[0].textContent || '').trim(),
        visible: !!a.offsetParent,
        subrayado: getComputedStyle(a).textDecorationLine
      })));

    console.log('\n§1 · los enlaces están y son enlaces de verdad');
    ok(enlaces.length === ESPERADOS.length,
       `hay ${ESPERADOS.length} <a> en el menú → ` + enlaces.length);
    for (const ruta of ESPERADOS) {
      const a = enlaces.find(e => e.href === ruta);
      ok(!!a, 'existe el enlace a ' + ruta + (a ? ' («' + a.texto + '»)' : ''));
      if(!a) continue;
      ok(a.visible, ruta + ' · se ve en el menú');
      ok(a.target === '_blank', ruta + ' · abre en pestaña nueva → target=' + a.target);
      ok(/\bnoopener\b/.test(a.rel), ruta + ' · lleva rel=noopener → rel=' + JSON.stringify(a.rel));
      ok(a.tab === null, ruta + ' · sin data-tab (el enrutador lo deja pasar)');
      ok(a.subrayado === 'none', ruta + ' · sin subrayado, como el resto del menú');
    }

    console.log('\n§2 · las rutas contestan 200 y no 301 (la barra final)');
    for (const ruta of ESPERADOS) {
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
    ok(despues.url === '/', 'seguimos en el editor → ' + despues.url);
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
