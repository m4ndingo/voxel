#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-ROMPE1 · `alRomper`: el pico como disparador, parche IDEMPOTENTE sobre mundo-autoarranque.

Dueño (2026-08-28): «*vamos a añadir un comportamiento nuevo a un bloque que deseemos en
"mundo-autoarranque" y es que al destruir un bloque que indiquemos con el pico se ejecute un snippet
y le pase la posicion y orientacion de ese bloque. Asi puedo asociar a un bloque X un comportamiento
que sea: ejecutar snippet construye casa al romperse*».

Queda como una propiedad más de `game.bloques.define`, hermana de `alPisar`:

    game.bloques.define('oro', { alRomper(c){ game.snippet('construye-casa', c); } });

`c` = { x, y, z, ori, clave, claveExacta, tipo, cfg } — la celda y el giro del bloque que se acaba de
romper. Se leen ANTES de romperlo: después la celda es aire y no queda ni la clave ni la postura.

DÓNDE se engancha, y por qué no en otro sitio:
  · `mcBreak` (app.js) es el pico. Pero YA está envuelta por este mismo snippet (`envolverGolpe`, el
    clic izquierdo sobre un agente), así que ⛔ NO se añade una segunda envoltura: se amplía la que
    hay. Dos costuras sobre la misma función se pisan al reejecutar el snippet, porque la
    reinstalación desenvuelve por `_orig` y se llevaría la otra por delante.
  · El rayo es EL MISMO que marcha `mcBreak` (mismo ojo, mismo paso de 1/16, mismo alcance) y en el
    mismo orden —estructuras antes que terreno—, o el disparo se lo llevaría un bloque que no es el
    que se rompe.
  · Cero líneas de `app.js` (LEY DE ORO, `docs/desarrollo-desacoplado.md`): el motor no sabe qué es
    `alRomper`; sigue siendo un intérprete de propiedades.

Idempotente: si ya está puesto, sale diciéndolo y no toca el fichero. Como el dueño edita este
snippet EN VIVO desde el modal Alt+C, hay DOS copias vivas: si tiene el modal abierto con una copia
anterior, su próximo «guardar» se lleva esto por delante. Hay que avisarle.
"""
import json, os, re, sys

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data', 'snippets', 'mundo-autoarranque.json')
MARCA = 'alRomper'
VERSION_NUEVA = 'v1.37'

# ── (clave, viejo, nuevo) ─────────────────────────────────────────────────────────────────────────
PARCHES = []

# 1 · La VERSION manda: `envolverGolpe` sólo reinstala si cambió, y sin subirla el mcBreak envuelto
#     de la sesión viva se quedaría con el código de antes.
PARCHES.append(('VERSION', "var VERSION = 'v1.36';", "var VERSION = '%s';" % VERSION_NUEVA))

# 2 · Una propiedad más del material normalizado, con el mismo trato que alPisar: una función o nada.
PARCHES.append(('normalizar', """      alPisar: (typeof cfg.alPisar === 'function') ? cfg.alPisar : null,""",
                """      alPisar: (typeof cfg.alPisar === 'function') ? cfg.alPisar : null,
      // REQ-ROMPE1 · el pico como disparador. Se dispara UNA vez, al romperlo, y recibe la celda y
      // el giro que tenia el bloque: lo justo para que el snippet invitado sepa donde plantarse.
      alRomper: (typeof cfg.alRomper === 'function') ? cfg.alRomper : null,"""))

# 3 · La guarda de «esto no hace nada»: sin sumar alRomper, definir SOLO un alRomper se rechazaba con
#     un aviso y la sorpresa no llegaba a registrarse nunca.
PARCHES.append(('guarda', """if (!norm.trepable && !norm.alPisar &&""",
                """if (!norm.trepable && !norm.alPisar && !norm.alRomper &&"""))
PARCHES.append(('guarda-texto', """alPisar ni alSeguirPisando no hace nada.""",
                """alPisar, alSeguirPisando ni alRomper no hace nada."""))

# 4 · Que se VEA en lista() y en info(): un comportamiento que no sale en el descubridor no existe.
PARCHES.append(('lista', """    if (cfg.alPisar) partes.push('alPisar');""",
                """    if (cfg.alPisar) partes.push('alPisar');
    if (cfg.alRomper) partes.push('alRomper');"""))
PARCHES.append(('info', """    if (cfg.alPisar) p.push('alPisar');""",
                """    if (cfg.alPisar) p.push('alPisar');
    if (cfg.alRomper) p.push('alRomper');"""))

# 5 · El rayo del pico y el disparo, justo antes de la envoltura que los va a usar.
PARCHES.append(('blanco', """  function envolverGolpe() {""", """  // ── REQ-ROMPE1 · que hay en la punta del pico ────────────────────────────────────────────────
  // Se repite EL MISMO rayo de mcBreak (app.js:16205): mismo ojo, mismo paso de 1/16, mismo alcance
  // y el mismo orden —estructuras primero, terreno despues—. Reimplementarlo "parecido" es como se
  // acaba disparando la sorpresa del bloque de detras: lo primero que toca el rayo es lo que se
  // rompe, y tiene que ser lo mismo que decida esto.
  //
  // El GIRO sale de sitios distintos segun donde viva el material (las dos vias de siempre):
  //   · rejilla     → de la CLAVE, que guarda la variante 'clave@n' (app.js, mcClaveConOri)
  //   · estructura  → de `s.rot`
  // En los dos casos es un codigo de las 24 posturas, listo para mcOriParts. ⛔ Nunca abrir los bits
  // a mano: `(rot>>2)&3` era el vuelco cuando solo habia 16 y hoy miente a partir de @16.
  function blancoDelPico() {
    if (typeof mc === 'undefined' || !mc.pos || !mc.grid) return null;
    var T = MC_T, esc = num(mc.scale, 1);
    var oy = mc.pos[1] + (typeof MC_EYE === 'number' ? MC_EYE : 1.62) * esc;
    var cp = Math.cos(mc.pitch || 0);
    var dx = -Math.sin(mc.yaw || 0) * cp, dy = Math.sin(mc.pitch || 0), dz = -Math.cos(mc.yaw || 0) * cp;
    var maxd = (typeof mcReach === 'function') ? mcReach() : 6 * esc, paso = 1 / T;
    for (var t = paso; t <= maxd; t += paso) {
      var px = mc.pos[0] + dx * t, py = oy + dy * t, pz = mc.pos[2] + dz * t;
      var fx = Math.floor(px * T), fy = Math.floor(py * T), fz = Math.floor(pz * T);
      if (mc.structures && mc.structures.length && typeof mcAimSolidAt === 'function'
        && mcAimSolidAt(fx, fy, fz)) {
        var s = (typeof mcStructAt === 'function') ? mcStructAt(px, py, pz) : null;
        if (s) return { tipo: 'estructura', clave: claveBase(s.key), claveExacta: s.key,
                        x: s.ox, y: s.oy, z: s.oz, ori: s.rot | 0 };
      }
      var bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
      if (typeof mcRejillaSolidAt === 'function' && mcRejillaSolidAt(fx, fy, fz)
        && !(typeof mcIsCellReplaceable === 'function' && mcIsCellReplaceable(bx, by, bz))) {
        var k = mc.blockKey[mc.grid[mcIdx(bx, by, bz)]] || '';
        var m = /@(\\d{1,2})$/.exec(k);
        return { tipo: 'rejilla', clave: claveBase(k), claveExacta: k,
                 x: bx, y: by, z: bz, ori: m ? (+m[1]) : 0 };
      }
    }
    return null;
  }
  // El disparo va DESPUES de romper (la sorpresa se abre con el bloque ya fuera de en medio, que es
  // lo que el dueño describio: «se rompe, se abre la sorpresa»), y en try/catch con aviso acotado
  // como alPisar: un snippet invitado que lance no puede dejar el pico inservible.
  function dispararAlRomper(b) {
    if (!b) return;
    var cfg = cfgDeClave(b.claveExacta || b.clave);
    if (!cfg || !cfg.alRomper) return;
    try {
      cfg.alRomper({ x: b.x, y: b.y, z: b.z, ori: b.ori, clave: b.clave,
                     claveExacta: b.claveExacta, tipo: b.tipo, cfg: cfg });
    } catch (e) {
      avisar('el alRomper de ' + b.clave + ' lanzo: ' + (e && e.message ? e.message : e));
    }
  }

  function envolverGolpe() {"""))

# 6 · La envoltura que ya existe, ampliada. NO una segunda: ver la cabecera.
PARCHES.append(('envoltura', """      var s = piezaDeAgenteEnLaMira();
      if (s && s._rig && !s._rig.quitado) { golpear(s._rig, 0); return; }
      return orig.apply(this, arguments);""",
                """      var s = piezaDeAgenteEnLaMira();
      if (s && s._rig && !s._rig.quitado) { golpear(s._rig, 0); return; }
      // REQ-ROMPE1 · lo que se va a romper se mira ANTES de romperlo: despues la celda es aire y no
      // queda ni la clave ni el giro que hay que pasarle al snippet.
      var blanco = blancoDelPico();
      var res = orig.apply(this, arguments);
      dispararAlRomper(blanco);
      return res;"""))


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('Ya estaba puesto (%s aparece en el snippet). No se toca nada.' % MARCA)
        return 0

    for clave, viejo, nuevo in PARCHES:
        n = code.count(viejo)
        if n != 1:
            print('✗ ancla «%s»: aparece %d veces, esperaba 1. No se escribe nada.' % (clave, n),
                  file=sys.stderr)
            return 1
        code = code.replace(viejo, nuevo)

    doc['code'] = code
    tmp = RUTA + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp, RUTA)
    print('Parcheado %s · %d anclas · VERSION %s' % (RUTA, len(PARCHES), VERSION_NUEVA))
    print('⚠️  Si tienes el modal Alt+C abierto con una copia anterior, tu proximo «guardar» se lo lleva.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
