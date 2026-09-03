#!/usr/bin/env python3
# @area: snippets
#
# REQ-COGER1 · `alCoger`: el disparador es acercarse, no romper.
#
# EL PORQUE (el dueño, 2026-08-31), sobre la ballesta de `mundo-autoarranque`: «eso es "alRomper",
# me gustaria que fuese "alCoger", que seria como acercarse al objeto lo suficiente como para cogerlo
# con el personaje, sin necesidad de romper». Romper una ballesta para equiparsela no es coger nada:
# es picarla. Coger es andar hasta ella.
#
# Es el hermano de `alRomper` (REQ-ROMPE1) con OTRO disparador y el MISMO contrato: se dispara una
# vez, con la pieza ya fuera de en medio, y recibe `{x,y,z,ori,clave,claveExacta,tipo,cfg}`. Un
# snippet que hoy cuelga de `alRomper` funciona en `alCoger` sin tocar una linea.
#
# LAS TRES DECISIONES QUE CUESTAN CARO CAMBIAR (van comentadas tambien en el codigo):
#   1. Distancia de CAJA A CAJA, no de centro a centro. Una ballesta estampada es una estructura
#      fina de 1/16 de bloque: medir centros la haria cogible desde dentro de la pared de al lado, o
#      no cogible nunca, segun donde la plantaran. Con AABB, `alcance` significa piel.
#   2. La pieza se retira ANTES de llamar. Coger ES llevarselo; y ademas es lo que impide que el
#      mismo objeto dispare doce veces por segundo mientras sigues encima.
#   3. Se sondea a 12 Hz, no cada frame. A 10 u/s son 0,8 bloques entre sondeos —muy por debajo del
#      cuerpo del jugador, no se cuela nada—, y barrer `mc.structures` 60 veces por segundo en un
#      mapa estampado es justo lo que se lleva los 120 FPS.
#
# ⛔ LAS DOS VIAS DE SIEMPRE. Un material vive en `mc.grid` (si el asset es un 16³ macizo) o en
# `mc.structures` (si tiene forma), y CUAL de las dos cambia de mapa en mapa (BUG-STR1). Las dos se
# miran, o el bioma donde la ballesta cayo en la otra via no coge nada y no falla nada.
#
# ⛔ Idempotente y POR ANCLA. Un snippet del Mundo tiene DOS COPIAS VIVAS, asi que esto nunca
# reescribe el fichero entero — solo sustituye sus anclas. Publica por `POST /api/snippets`, que es
# lo que da papelera y escritura atomica.
#
#     python3 herramientas/parche_snp_alcoger.py --comprobar
#     python3 herramientas/parche_snp_alcoger.py
#     VOXEL_URL=http://localhost:8577 python3 herramientas/parche_snp_alcoger.py --sitio ...
import argparse
import json
import re
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'mundo-autoarranque'

# El cuerpo nuevo. Se cuela ENTERO delante de `envolverGolpe`, que es el vecino natural: los dos son
# «un gesto del jugador dispara el comportamiento de un material».
#
# ⛔ VA ENTRE MARCAS, y no es adorno. Su ancla (`function envolverGolpe`) sigue estando aunque el
# bloque ya se haya metido, asi que la comprobacion de idempotencia de los demas cambios —«¿esta ya
# el texto nuevo?»— aqui no sirve: en cuanto se toca una coma del cuerpo, el texto nuevo deja de
# estar, el ancla sigue ahi, y la segunda pasada meteria un SEGUNDO recogerCercanos que taparia al
# primero. Con las marcas, cada pasada quita el bloque anterior ENTERO y pone el de ahora.
MARCA_INI = '  // ==AL-COGER== · REQ-COGER1 (bloque generado por herramientas/parche_snp_alcoger.py)'
MARCA_FIN = '  // ==FIN AL-COGER=='

COGER = MARCA_INI + """
  // ── REQ-COGER1 · coger acercandose ───────────────────────────────────────────────────────────
  // El hermano de alRomper con otro disparador: aqui no hay pico, ni mira, ni rayo. Hay CUERPO y
  // distancia. El contrato del evento es el mismo, a proposito: un snippet colgado de alRomper se
  // pasa a alCoger sin tocar una linea.
  //
  // Separacion en un eje entre dos segmentos: 0 si se solapan. La distancia entre dos cajas es la
  // norma de las tres separaciones. Es punto-a-caja generalizado, y es lo unico que mide bien una
  // pieza fina: su centro puede estar a un bloque de ti con la pieza rozandote.
  function sepEje(a0, a1, b0, b1) {
    if (b0 > a1) return b0 - a1;
    if (a0 > b1) return a0 - b1;
    return 0;
  }
  function distCajas(a, b) {
    var dx = sepEje(a[0], a[3], b[0], b[3]);
    var dy = sepEje(a[1], a[4], b[1], b[4]);
    var dz = sepEje(a[2], a[5], b[2], b[5]);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  // mc.pos son los PIES (mismo criterio que pieEn), y el cuerpo escala con mc.scale: un jugador
  // encogido tiene que acercarse mas, que es lo que se ve en pantalla.
  function cajaJugador() {
    var esc = num(mc.scale, 1), hw = HW * esc, ph = PH * esc, p = mc.pos;
    return [p[0] - hw, p[1], p[2] - hw, p[0] + hw, p[1] + ph, p[2] + hw];
  }
  // ⛔ LA TRAMPA DE `mc.structures`: NO TODO LO QUE HAY AHI ES DEL MUNDO.
  // La herramienta que llevas en la mano ES una instancia mas de la lista (`mc._heldToolStruct`,
  // app.js:14461) y app.js le clava `ox/oy/oz = mc.pos` en cada frame (app.js:14473). O sea que esta
  // SIEMPRE a distancia CERO de ti. Sin este filtro, coger una ballesta la equipaba y 80 ms despues
  // el propio sondeo se «cogia» la de la mano y la sacaba de mc.structures: la mano se quedaba vacia
  // y no habia forma de volver a verla, ni siquiera lanzando el snippet a mano. Parecia que el asset
  // se hubiera borrado al cogerlo; lo que se borraba era el DIBUJO DE LA MANO.
  // El criterio es el mismo que ya usa app.js para separarlas (mcLuzDiag, app.js:12314), y tambien
  // se salta la vista previa, que es una pieza que aun no esta puesta.
  function noEsDelMundo(s) {
    return !s || s === mc._heldToolStruct || s.mano || s.held || (mc.preview && s === mc.preview);
  }
  // En try/catch con aviso acotado, como alPisar y alRomper: un snippet invitado que lance no puede
  // dejar al jugador sin fisica. Y se DEVUELVE lo que devuelva (REQ-UNDO1b).
  function dispararAlCoger(cfg, b) {
    try {
      return cfg.alCoger({ x: b.x, y: b.y, z: b.z, ori: b.ori, clave: b.clave,
                           claveExacta: b.claveExacta, tipo: b.tipo, cfg: cfg });
    } catch (e) {
      console.warn('alCoger de "' + b.clave + '": ' + (e && e.message ? e.message : e));
    }
    return null;
  }
  function retirarCogido(it) {
    if (it.b.tipo === 'estructura') {
      if (typeof mcRemoveStruct !== 'function' || mc.structures.indexOf(it.s) < 0) return false;
      mcRemoveStruct(it.s, true);   // callado: el aviso lo da quien coge, si es que quiere darlo
      return true;
    }
    if (typeof mcSetBlock !== 'function') return false;
    mcSetBlock(it.b.x, it.b.y, it.b.z, 0);
    return true;
  }
  function recogerCercanos() {
    if (!hayCogibles || typeof mc === 'undefined' || !mc.pos || !mc.grid) return;
    var t = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (mc._cogerT && t - mc._cogerT < COGER_MS) return;
    mc._cogerT = t;
    var caja = cajaJugador(), antes = mc._cogerDentro || {}, ahora = {}, lista = [];
    // 1) Estructuras finas: la mitad del mundo que NO esta en la rejilla.
    var ests = mc.structures || null;
    if (ests && ests.length && typeof mcStructColl === 'function') {
      for (var i = 0; i < ests.length; i++) {
        var s = ests[i];
        if (noEsDelMundo(s)) continue;
        var cfgE = cfgDeClave(s.key);
        if (!cfgE || !cfgE.alCoger) continue;
        var g = mcStructColl(s);
        if (!g || !g.fdim) continue;
        var d = g.fdim;
        var cs = [s.ox, s.oy, s.oz,
                  s.ox + d[0] / MC_T, s.oy + d[1] / MC_T, s.oz + d[2] / MC_T];
        if (distCajas(caja, cs) > cfgE.alcance) continue;
        var idE = 'e|' + s.key + '|' + s.ox + ',' + s.oy + ',' + s.oz;
        ahora[idE] = 1;
        lista.push({ id: idE, cfg: cfgE, s: s,
                     b: { tipo: 'estructura', clave: claveBase(s.key), claveExacta: s.key,
                          x: s.ox, y: s.oy, z: s.oz, ori: s.rot | 0 } });
      }
    }
    // 2) La rejilla, en la caja de celdas que el mayor `alcance` alcanza. Sin `alcanceCoger` esto
    //    seria un barrido del mundo; con el son un puñado de celdas y sale gratis.
    var r = alcanceCoger;
    var x0 = Math.floor(caja[0] - r), x1 = Math.floor(caja[3] + r);
    var y0 = Math.floor(caja[1] - r), y1 = Math.floor(caja[4] + r);
    var z0 = Math.floor(caja[2] - r), z1 = Math.floor(caja[5] + r);
    for (var x = x0; x <= x1; x++) {
      for (var y = y0; y <= y1; y++) {
        for (var z = z0; z <= z1; z++) {
          var bid = idEn(x, y, z);
          if (!bid) continue;
          var cfgR = cfgDeId(bid);
          if (!cfgR || !cfgR.alCoger) continue;
          if (distCajas(caja, [x, y, z, x + 1, y + 1, z + 1]) > cfgR.alcance) continue;
          // El GIRO sale de la CLAVE en la rejilla y de `s.rot` en la estructura, igual que en
          // blancoDelPico. ⛔ Nunca abrir los bits mano: hay 24 posturas desde @16.
          var k = (mc.blockKey && mc.blockKey[bid]) || '';
          var m = /@(\\d{1,2})$/.exec(k);
          var idR = 'r|' + x + ',' + y + ',' + z;
          ahora[idR] = 1;
          lista.push({ id: idR, cfg: cfgR, s: null,
                       b: { tipo: 'rejilla', clave: claveBase(k), claveExacta: k,
                            x: x, y: y, z: z, ori: m ? (+m[1]) : 0 } });
        }
      }
    }
    mc._cogerDentro = ahora;
    // El FLANCO va aparte del consumo: con `consume:false` la pieza se queda puesta (un pulsador que
    // se toca al pasar) y sin flanco dispararia doce veces por segundo mientras sigues al lado.
    var tocado = false, tocadaCabecera = false;
    for (var n = 0; n < lista.length; n++) {
      var it = lista[n];
      if (antes[it.id]) continue;
      if (it.cfg.consume) {
        if (!retirarCogido(it)) continue;   // si no se pudo retirar, no se ha cogido: no se dispara
        delete ahora[it.id];
        tocado = true;
        if (it.b.tipo === 'estructura') tocadaCabecera = true;
      }
      dispararAlCoger(it.cfg, it.b);
    }
    // mcRemoveStruct(quiet) y mcSetBlock no guardan por su cuenta; se guarda UNA vez y no por pieza.
    if (tocadaCabecera && typeof mcDirtyHeader === 'function') mcDirtyHeader();
    if (tocado && typeof mcScheduleSave === 'function') mcScheduleSave();
  }
""" + MARCA_FIN + """

"""

CAMBIOS = [
    (
        'VERSION (cambia la costura de mcUpdate)',
        "  var VERSION = 'v1.40';",
        "  var VERSION = 'v1.41';",
    ),
    (
        'define() reconoce alCoger, alcance y consume',
        """      alRomper: (typeof cfg.alRomper === 'function') ? cfg.alRomper : null,""",
        """      alRomper: (typeof cfg.alRomper === 'function') ? cfg.alRomper : null,
      // REQ-COGER1 · el CUERPO como disparador: «acercarse al objeto lo suficiente como para cogerlo,
      // sin necesidad de romper» (el dueño). Mismo contrato que alRomper: una vez, con la pieza ya
      // retirada, y con la celda y el giro que tenia.
      alCoger: (typeof cfg.alCoger === 'function') ? cfg.alCoger : null,
      // A cuantos bloques de PIEL, no de centro a centro (ver distCajas): un centro no dice nada de
      // una pieza fina de 1/16 de grosor. 0.6 es «lo tienes justo delante».
      alcance: Math.abs(num(cfg.alcance, 0.6)),
      // Coger es LLEVARSELO. `consume:false` deja la pieza puesta —un pulsador que se toca al pasar—
      // y entonces manda el flanco: no se repite hasta que te alejas y vuelves.
      consume: (cfg.consume !== false),""",
    ),
    (
        'el aviso de «no hace nada» cuenta alCoger',
        """    if (!norm.trepable && !norm.alPisar && !norm.alRomper && !norm.alSeguirPisando && !norm.impulso && !norm.velocidad && !norm.deslizamiento && !norm.mirar && !norm.seguir && !norm.atravesable && !norm.luzPasa && !norm.luzTapa && norm.recibeSombra && norm.proyectaSombra && !norm.viento) {
      console.warn('game.bloques.define("' + clave + '"): sin trepable, atravesable, luz, impulso, velocidad, deslizamiento, seguir, alPisar, alSeguirPisando ni alRomper no hace nada.');""",
        """    if (!norm.trepable && !norm.alPisar && !norm.alRomper && !norm.alCoger && !norm.alSeguirPisando && !norm.impulso && !norm.velocidad && !norm.deslizamiento && !norm.mirar && !norm.seguir && !norm.atravesable && !norm.luzPasa && !norm.luzTapa && norm.recibeSombra && norm.proyectaSombra && !norm.viento) {
      console.warn('game.bloques.define("' + clave + '"): sin trepable, atravesable, luz, impulso, velocidad, deslizamiento, seguir, alPisar, alSeguirPisando, alRomper ni alCoger no hace nada.');""",
    ),
    (
        'game.bloques.info() lo enseña',
        """    if (cfg.alRomper) partes.push('alRomper');""",
        """    if (cfg.alRomper) partes.push('alRomper');
    if (cfg.alCoger) partes.push('alCoger a ' + cfg.alcance + (cfg.consume ? '' : ' (no se lo lleva)'));""",
    ),
    (
        'la cuarta linea de rayos-X lo enseña',
        """    if (cfg.alRomper) p.push('alRomper');""",
        """    if (cfg.alRomper) p.push('alRomper');
    if (cfg.alCoger) p.push('alCoger ' + cfg.alcance);""",
    ),
    (
        'las banderas de sondeo (hayCogibles / alcanceCoger)',
        """  var hayPisables = false;        // ...y si nadie tiene alPisar ni impulso, ni se sondea (lo pone reconstruirCache)""",
        """  var hayPisables = false;        // ...y si nadie tiene alPisar ni impulso, ni se sondea (lo pone reconstruirCache)
  // REQ-COGER1 · lo mismo para coger, y por el mismo motivo: sin un solo material con alCoger no se
  // barre mc.structures ni las celdas de alrededor. `alcanceCoger` es el mayor de todos y es lo que
  // acota esa caja de celdas; sin el, el barrido de la rejilla no tendria borde.
  var hayCogibles = false;
  var alcanceCoger = 0;
  var COGER_MS = 80;       // 12 Hz: a 10 u/s son 0,8 bloques entre sondeos, muy por debajo del cuerpo""",
    ),
    (
        'reconstruirCache calcula las dos',
        """    hayPisables = Object.keys(tabla).some(function (k) { return tabla[k].alPisar || tabla[k].alSeguirPisando || tabla[k].impulso; });""",
        """    hayPisables = Object.keys(tabla).some(function (k) { return tabla[k].alPisar || tabla[k].alSeguirPisando || tabla[k].impulso; });
    hayCogibles = false; alcanceCoger = 0;
    Object.keys(tabla).forEach(function (k) {
      if (!tabla[k].alCoger) return;
      hayCogibles = true;
      if (tabla[k].alcance > alcanceCoger) alcanceCoger = tabla[k].alcance;
    });""",
    ),
    (
        'el cuerpo de recogerCercanos()',
        """  function envolverGolpe() {""",
        COGER + """  function envolverGolpe() {""",
    ),
    (
        'la costura: se sondea despues de la fisica del pie',
        """      pisar(pieAntes, velAntes);""",
        """      pisar(pieAntes, velAntes);
      recogerCercanos();  // REQ-COGER1 · despues de pisar: mc.pos ya es el de ESTE frame""",
    ),
    (
        'la ballesta se coge en vez de picarse',
        """    'ballesta': { nota: 'Sorpresa: una ballesta!',
      alRomper: function (c) { return game.snippet('herramienta-ballesta', c);  } },""",
        """    // REQ-COGER1 · la primera que se coge andando: el dueño no queria picar una ballesta para
    // equiparsela. `alcance` generoso porque esta a ras de suelo y se llega por arriba.
    'ballesta': { nota: 'Acercate y la coges',
      alcance: 1.2,
      alCoger: function (c) { return game.snippet('herramienta-ballesta', c); } },""",
    ),
]


def pide(url, cuerpo=None):
    pet = urllib.request.Request(url, data=cuerpo, method='POST' if cuerpo else 'GET',
                                 headers={'Content-Type': 'application/json'} if cuerpo else {})
    with urllib.request.urlopen(pet, timeout=20) as r:
        return json.loads(r.read().decode('utf-8') or '{}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--comprobar', action='store_true')
    p.add_argument('--sitio', default=SITIO)
    a = p.parse_args()

    snip = pide('%s/api/snippets/%s' % (a.sitio, SNIP))
    code = snip.get('code') or ''
    if not code:
        print('⛔ «%s» no tiene codigo (¿servidor levantado?)' % SNIP)
        return 1

    # Fuera el bloque de una pasada anterior, ENTERO y por sus marcas (ver arriba). Si no habia, no
    # hace nada; si habia, lo que sigue vuelve a ponerlo tal y como este hoy en este fichero.
    nuevo, hechos, ya = code, [], []
    viejoBloque = re.compile(re.escape(MARCA_INI) + '.*?' + re.escape(MARCA_FIN) + r'\n\n', re.S)
    nuevo, quitados = viejoBloque.subn('', nuevo)
    if quitados:
        print('   rehecho   · quitado el recogerCercanos() de la pasada anterior')

    for que, viejo, bueno in CAMBIOS:
        if bueno in nuevo:
            ya.append(que)
            continue
        n = nuevo.count(viejo)
        if n != 1:
            print('⛔ el ancla de «%s» aparece %d veces (esperaba 1).\n'
                  '   el snippet ha cambiado debajo: no lo toco.' % (que, n))
            return 2
        nuevo = nuevo.replace(viejo, bueno)
        hechos.append(que)

    for q in ya:
        print('   ya estaba · %s' % q)
    for q in hechos:
        print('   cambio    · %s' % q)
    if not hechos:
        print('nada que hacer: «%s» ya esta parcheado.' % SNIP)
        return 0
    if a.comprobar:
        print('\n--comprobar: no he tocado nada.')
        return 0

    pide('%s/api/snippets' % a.sitio,
         json.dumps({'id': SNIP, 'name': snip.get('name') or SNIP, 'code': nuevo}).encode('utf-8'))
    print('\npublicado «%s» (%d → %d caracteres)' % (SNIP, len(code), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
