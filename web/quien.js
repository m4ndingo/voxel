/* La chapa de identidad: «¿con qué cuenta estoy aquí?».
 *
 * Petición del dueño: «*hay que poner algo en el editor 2d/3d y básicamente en todas las pantallas,
 * menos en las del mapa, para saber con qué usuario se está logueado o si es el dueño con el token de
 * diseñador*». Lo caro de esto no es pintarlo, son dos cosas:
 *
 * · ⛔ **En el mapa no se pinta.** `/map/<slug>` sirve el MISMO `index.html` que el editor (server.py),
 *   así que no basta con no incluir el script: se comprueba la ruta aquí. El mapa es el juego, y
 *   encima lo usan las pantallas del OSD como escaparate por iframe (`?osd=1`); una chapa flotando
 *   sobre el menú del juego se vería en la portada y en la intro.
 * · **Dice CÓMO eres el dueño, no solo que lo eres.** Son tres puertas distintas y se confunden a
 *   ojo: el token de diseñador por cabecera, la galleta de modo diseño (F5.8) y el **modo desarrollo**,
 *   donde no hay token configurado y `_es_dueno()` dice que sí a todo el mundo. Ese tercero es el que
 *   engaña: en desarrollo la chapa diría «dueño» a cualquiera que abriera la página, y quien lo lea
 *   creería estar viendo una sesión que no existe. Lo distingue `via` en `GET /api/yo`.
 *
 * Es una isla: se trae su propio CSS y no depende de nada de la página que lo incluye, porque lo
 * incluyen seis pantallas con hojas de estilo distintas (`index`, `menu`, `mapas`, `panel`, `fotos`,
 * `videos`). Si `/api/yo` falla, no pinta nada — una chapa que miente es peor que ninguna.
 */
(function () {
  'use strict';

  // El mapa es el juego. Ni chapa, ni cuando la página va dentro de un iframe de escaparate del OSD.
  // ⚠️ `/map` y `/map/` a secas NO son el mapa: son el SELECTOR de mundos (`mapas.html`, server.py),
  // que es una pantalla como las demás y sí lleva chapa. El juego es `/map/<slug>`, con nombre.
  if (/^\/map\/.+/.test(location.pathname)) return;
  if (window.top !== window.self) return;

  var CSS = [
    '#vf-quien{position:fixed; left:10px; bottom:10px; z-index:9998; display:flex; align-items:center;',
    '  gap:6px; padding:5px 10px; border-radius:999px; font:12px/1.2 system-ui,sans-serif;',
    '  background:rgba(18,20,26,0.86); color:#dfe3ea; border:1px solid rgba(255,255,255,0.14);',
    '  box-shadow:0 2px 10px rgba(0,0,0,0.35); backdrop-filter:blur(3px); user-select:none}',
    '#vf-quien b{font-weight:600; color:#fff}',
    '#vf-quien .vf-quien-perfil{opacity:0.65}',
    '#vf-quien a{color:#7fb2ff; text-decoration:none; border-bottom:1px dotted rgba(127,178,255,0.5)}',
    '#vf-quien a:hover{color:#a8ccff}',
    /* El dueño se distingue de un vistazo: es la sesión desde la que se rompen cosas. */
    '#vf-quien.vf-dueno{background:rgba(58,38,12,0.9); border-color:rgba(255,186,74,0.45); color:#ffe0ad}',
    '#vf-quien.vf-dueno b{color:#ffc978}',
    /* Y el modo desarrollo se distingue del dueño de verdad: ahí no hay puerta que valga. */
    '#vf-quien.vf-desarrollo{background:rgba(12,44,38,0.9); border-color:rgba(90,220,190,0.4); color:#b8f0e2}',
    '#vf-quien.vf-desarrollo b{color:#7fe6c9}',
    /* Dentro de una cabecera deja de flotar: ver `acomoda()`. */
    'header.vf-con-chapa{position:relative}',
    /* CENTRADA, y por eso ABSOLUTA (orden del dueño, 2026-09-02: «*lo quiero centrado*»).
       ⛔ Centrar con márgenes automáticos NO vale en la barra del editor: `.tabs` ya tiene un
       `margin-left:auto` y dos márgenes automáticos en el mismo flex se REPARTEN el hueco, así que
       los botones se quedaban a media barra en vez de pegados a la derecha. Fuera del reparto, la
       chapa se centra sola y el borde derecho vuelve a ser de los botones. */
    '#vf-quien.vf-en-cab{position:absolute; left:50%; top:50%; bottom:auto;',
    '  transform:translate(-50%,-50%); max-width:min(46vw,520px); overflow:hidden;',
    '  white-space:nowrap; text-overflow:ellipsis}',
    /* Sin cabecera va en el FLUJO, al final de la página: flotando tapaba un botón (ver `acomoda`). */
    '#vf-quien.vf-en-flujo{position:static; left:auto; bottom:auto; align-self:center; margin:14px auto}',
    /* ⛔ CON UNA PANTALLA ENCIMA NO SE PINTA: ver `calladaBajoLasPantallas()`. */
    '#vf-quien.vf-callada{display:none}'
  ].join('\n');

  /* Dónde se cuelga la chapa. ⛔ La primera versión la dejaba SIEMPRE flotando abajo la izquierda, y
   * en el editor tapaba un botón de la paleta de herramientas (`BUTTON.tool`, comprobado con
   * `elementsFromPoint`): una chapa informativa que te come un botón es un fallo, no un detalle.
   * Así que se mete en la CABECERA, que es donde no puede solapar nada porque entra en el reparto:
   *   · cabecera flex (`index.html`, `panel.html`) → un hijo más, empujado a la derecha;
   *   · cabecera de bloque (`mapas`, `fotos`, `videos`, con el H1 ocupando el ancho pero el texto
   *     a la izquierda) → pegada arriba a la derecha, dentro de la cabecera;
   *   · sin cabecera (`menu.html`, que es una tarjeta centrada) → al FINAL DE LA PÁGINA, en el
   *     flujo: flotando abajo a la izquierda tapaba el primer botón de la tarjeta (`BUTTON#bot`).
   */
  function acomoda(caja) {
    var host = document.querySelector('header');
    if (!host) { caja.classList.add('vf-en-flujo'); return document.body.appendChild(caja); }
    host.classList.add('vf-con-chapa');
    // Centrada y FUERA DEL REPARTO del flex: así no le quita el borde derecho a los botones.
    caja.classList.add('vf-en-cab');
    host.appendChild(caja);
  }

  /* ⛔ CON UNA PANTALLA ENCIMA NO SE PINTA. La chapa vive en la cabecera, pero su `z-index` la deja
   * por encima de todo, así que sigue flotando sobre las pantallas que tapan la página entera. Son
   * dos, las dos por orden del dueño (2026-09-02):
   *   · el **Mundo** (`#mc-modal`) — «*es el único sitio que no tiene que mostrar el cartucho*»;
   *   · el **editor de código** (`#snip-modal`) — «*en el editor de código tampoco quiero ver el
   *     cartucho*»: ahí lo que se lee es código, y la chapa se le pone encima.
   *
   * ⚠️ Mirar la ruta NO vale para ninguna de las dos: las dos se abren DENTRO de `/`, sin cambiar
   * de URL. Se mira el `hidden` de cada pantalla, que es lo que de verdad significa «está abierta»,
   * y se vigila con un `MutationObserver` porque abrirlas y cerrarlas es sólo quitar y poner ese
   * atributo. Aquí, y no en `app.js`: el motor no tiene por qué saber que existe una chapa.
   */
  var PANTALLAS = ['mc-modal', 'snip-modal'];

  function calladaBajoLasPantallas(caja) {
    var vistas = PANTALLAS.map(function (id) { return document.getElementById(id); })
                          .filter(function (e) { return e; });
    if (!vistas.length) return;
    var mira = function () {
      caja.classList.toggle('vf-callada', vistas.some(function (e) { return !e.hidden; }));
    };
    mira();
    try {
      var ojo = new MutationObserver(mira);
      vistas.forEach(function (e) { ojo.observe(e, { attributes: true, attributeFilter: ['hidden'] }); });
    } catch (e) { /* sin observador, al menos el estado de la carga es el bueno */ }
  }

  function pinta(clase, icono, texto, cola, titulo) {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    var caja = document.createElement('div');
    caja.id = 'vf-quien';
    if (clase) caja.className = clase;
    caja.title = titulo || '';
    caja.appendChild(document.createTextNode(icono + ' '));
    var b = document.createElement('b');
    b.textContent = texto;
    caja.appendChild(b);
    if (cola) { caja.appendChild(document.createTextNode(' ')); caja.appendChild(cola); }
    acomoda(caja);
    calladaBajoLasPantallas(caja);
  }

  function trozo(texto, clase) {
    var s = document.createElement('span');
    s.className = clase || 'vf-quien-perfil';
    s.textContent = texto;
    return s;
  }

  function enlace(texto, href) {
    var a = document.createElement('a');
    a.href = href;
    a.textContent = texto;
    return a;
  }

  function arranca() {
    fetch('/api/yo', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        if (d.dueno) {
          // Las tres puertas del dueño, que NO son la misma cosa aunque abran igual.
          var via = d.via || 'token';
          if (via === 'desarrollo') {
            return pinta('vf-desarrollo', '🔧', 'modo desarrollo',
              trozo('· sin token: cualquiera manda'),
              'Este servidor no tiene VOXELFORGE_TOKEN configurado y no está en modo público, así que ' +
              'todo el que abra esta página es el dueño. No es una sesión: es que no hay puerta.');
          }
          return pinta('vf-dueno', '🔑', 'dueño',
            trozo(via === 'galleta' ? '· modo diseño' : '· token de diseñador'),
            via === 'galleta'
              ? 'Entraste en modo diseño desde el navegador; la galleta caduca a los 7 días.'
              : 'La petición lleva el token del dueño en la cabecera X-VoxelForge-Token.');
        }
        if (!d.anonimo && d.yo) {
          var perfil = d.yo.perfil || '';
          return pinta('', '👤', d.yo.nombre || 'sin nombre',
            perfil ? trozo('· ' + perfil) : null,
            'Sesión iniciada' + (perfil ? ' con el perfil «' + perfil + '»' : '') + '.');
        }
        // ⚠️ `/menu.html`, con extensión: `/menu` a secas es un 404 (`server.py` enruta `/panel`,
        // `/map`, `/fotos` y `/videos`, pero la portada NO tiene ruta corta — a quien no es dueño se
        // la sirve `/`, y a quien lo es `/` le da el editor).
        pinta('', '👤', 'sin entrar', enlace('· entrar', '/menu.html'),
          'Nadie ha iniciado sesión en este navegador.');
      })
      .catch(function () { /* sin respuesta, sin chapa: ver la cabecera */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca);
  else arranca();
})();
