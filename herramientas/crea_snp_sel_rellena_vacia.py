#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""`sel-rellena-vacia`: una selección VACÍA se rellena desde la ranura, aunque la ranura lleve una pieza.

Dueño (2026-08-29): «*seleccionar suelo, clic central, control arriba → sube seleccion pero nada en ella
(vacia), clic en ranura dice "Nada que reemplazar" pero en realidad hay "aire" que reemplazar*»,
«*parece que si tiene 16x16x16 voxels funciona, pero si tiene menos no, y deberia*» y «*si seleccionas
un solido, y luego uno que no lo es, entonces sí deja; vamos que se puede hacer con un paso extra, no
deberia requerirse*».

Parcheo EN CALIENTE (Ley de Oro): envuelve `mcSelectFillPieza` sin tocar `app.js`.

Desde el 2026-08-29 el arreglo vive en `app.js` (`herramientas/parche_app_sel_rellena_vacia.py`, el
dueño lo dio por bueno). El snippet se queda para poder probarlo en un app.js viejo, y `on()` se aparta
solo si ve que el motor ya sabe del aire (`yaEnElMotor`).

    game.selRellenaVacia.on() / .off() / .conmutar() / .estado()

Publica por POST /api/snippets (papelera + escritura atómica), nunca escribiendo el .json a mano.
"""
import json, os, sys, urllib.request, urllib.error

API = os.environ.get('VOXEL_API', 'http://localhost:8500')
ID = 'sel-rellena-vacia'
NOMBRE = '▦ Selección vacía · la ranura la rellena aunque lleve una pieza'

CODE = r"""// ── ▦ sel-rellena-vacia · rellenar una selección VACÍA desde la ranura ────────────────────────────
//
// Dueño (2026-08-29): «*sube seleccion pero nada en ella (vacia), clic en ranura dice "Nada que
// reemplazar" pero en realidad hay "aire" que reemplazar*»; «*si tiene 16x16x16 voxels funciona, pero
// si tiene menos no*»; «*si seleccionas un solido, y luego uno que no lo es, entonces sí deja … se
// puede hacer con un paso extra, no deberia requerirse*».
//
// Las tres frases son EL MISMO fallo visto desde tres sitios, y explican por qué el reparto de
// `mcSelectFill` (app.js:16876) manda a la ranura por uno de dos caminos:
//
//   · 16³ MACIZO → es `blockLike`, va a `mc.hotbar` como un id de la paleta y lo atiende
//     `mcSelectFillId`, que YA elige `mcSelForEachConAire` cuando no le piden «sólo sólidos»
//     (app.js:16943). Por eso el cubo lleno funciona.
//   · MENOS DE 16³ → es una PIEZA, va a `mc.slotStruct` y lo atiende `mcSelectFillPieza`. Ésa, para
//     resolver la clave a un id, necesita ESCRIBIR UNA PRIMERA CELDA por el camino de plantar mano
//     (`mcPonEnRejilla`, el único que da de alta la clave en la paleta), y la busca siempre con
//     `mcSelForEach` —sólidos— en app.js:16906. Sin un solo sólido no hay celda semilla, y sale por
//     «Nada que reemplazar» aunque le hayan pedido rellenar también el aire.
//
// Y de ahí el «paso extra» del dueño: rellenar antes con un sólido le deja a la pieza la semilla que le
// faltaba. O sea que la intención («rellena también el aire») ya estaba escrita y bien resuelta en
// `mcSelectFillId`; lo único que no la respeta es la BÚSQUEDA DE LA SEMILLA.
//
// EL ARREGLO, por tanto, es de una línea: que la semilla pueda salir del aire cuando el gesto es
// «rellena todo». No se reimplementa nada — se le presta a `mcSelectFillPieza` el iterador CON AIRE
// mientras dura la llamada, y el original hace su trabajo de siempre. Es preferible a copiar aquí las
// 30 líneas del original, que se quedarían congeladas y ciegas a los arreglos que vengan después.
//
// ⛔ SE TOCA SÓLO EL CASO ROTO. Se aparta y deja pasar la llamada tal cual si:
//   · piden `soloSolidos` (Shift+ranura): «sólo sólidos» y no hay ninguno ⇒ no rellenar. Convertir ahí
//     un gesto de REEMPLAZAR en uno de CREAR sería inventarse lo que el dueño no ha pedido;
//   · la caja YA tiene sólidos: ese camino funciona hoy y no puede cambiar de comportamiento;
//   · no hay herramienta Seleccionar ni caja.
//
// El iterador se presta y se devuelve en `try/finally`: si el original se va por una excepción, dejar
// `mcSelForEach` apuntando al de aire envenenaría a TODO el que lo use después (contar, pintar, copiar,
// cortar, guardar un recorte — es LA puerta de los sólidos de la selección, app.js:16964).

(function () {
  var ID = 'sel-rellena-vacia';

  // Si algún día esto entra en app.js, el envoltorio sobra: un envoltorio congelado encima taparía al
  // motor y los arreglos posteriores dejarían de notarse. Se mira si el original ya sabe del aire.
  function yaEnElMotor() {
    return typeof mcSelectFillPieza === 'function' &&
           /mcSelForEachConAire/.test(String(mcSelectFillPieza));
  }

  function cuentaSolidos() {
    var n = 0;
    try { mcSelForEach(function () { n++; }); } catch (e) { return -1; }
    return n;
  }

  function envuelto(sk, quien, soloSolidos) {
    var orig = mcSelectFillPieza._rellenaVacia;
    // Todo lo que no sea EL caso roto pasa de largo, sin tocar nada.
    if (soloSolidos || mc.tool !== 'select' || !mc.selBox || cuentaSolidos() !== 0)
      return orig.apply(this, arguments);
    var previo = window.mcSelForEach;
    window.mcSelForEach = window.mcSelForEachConAire;
    try { return orig.apply(this, arguments); }
    finally { window.mcSelForEach = previo; }
  }

  function puesto() { return typeof mcSelectFillPieza === 'function' && !!mcSelectFillPieza._rellenaVacia; }

  function on() {
    if (yaEnElMotor()) return 'ya está en app.js: no se envuelve nada';
    if (puesto()) return 'ya estaba puesto';
    if (typeof mcSelectFillPieza !== 'function' || typeof mcSelForEachConAire !== 'function')
      return 'este app.js no tiene mcSelectFillPieza/mcSelForEachConAire: no se toca nada';
    var orig = window.mcSelectFillPieza;
    window.mcSelectFillPieza = envuelto;
    window.mcSelectFillPieza._rellenaVacia = orig;
    return 'puesto';
  }

  function off() {
    if (!puesto()) return 'no estaba puesto';
    window.mcSelectFillPieza = mcSelectFillPieza._rellenaVacia;
    return 'quitado';
  }

  function conmutar() { return puesto() ? off() : on(); }

  function estado() {
    return { puesto: puesto(), yaEnElMotor: yaEnElMotor(),
             herramienta: mc.tool, hayCaja: !!mc.selBox,
             solidosEnLaCaja: mc.selBox ? cuentaSolidos() : null,
             gesto: 'Con la selección vacía, clic en una ranura (o su número) la rellena; ' +
                    'Shift+ranura sigue siendo sólo-sólidos' };
  }

  game.selRellenaVacia = { on: on, off: off, conmutar: conmutar, estado: estado, puesto: puesto };

  var r = on();
  toast('▦ Selección vacía: la ranura la rellena aunque lleve una pieza · game.selRellenaVacia.off() para quitarlo', 5);
  window.__selRellenaVacia = ID + ' · ' + r;
})();

return window.__selRellenaVacia;
"""


def publicar():
    data = {'id': ID, 'name': NOMBRE, 'code': CODE}
    cuerpo = json.dumps(data, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(API + '/api/snippets', data=cuerpo, method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        print('Publicado por POST /api/snippets · %s' % ID)
        return True
    except (urllib.error.URLError, OSError) as e:
        print('No se pudo publicar por HTTP (%s). El servidor tiene que estar en pie: '
              'python3 server.py 8500' % e, file=sys.stderr)
        return False


if __name__ == '__main__':
    sys.exit(0 if publicar() else 1)
