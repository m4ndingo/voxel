#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-AG12 · capacidad `cabalgable` para agentes articulados.

El dueño (REQ-AG12 / BUG-AG11):
  «"montado" no es lo mismo que "cabalgable", si fuese "cabalgable" tiene sentido que se quede
   quieto y que además pueda moverlo; si estás "montado" y no te ve, pues que sea como tonto
   y vuelva a su ancla»

Con este parche:
  - `rig.G.cabalgable`: se normaliza en crearEsqueleto desde `def.cabalgable` o `def.seguir.cabalgable`.
  - API `game.esqueletos.cabalgable(rig, si)`: lee / conmuta la capacidad por instancia.
  - API `game.esqueletos.esCabalgando()`: indica si el jugador va montado conduciendo una montura.
  - Comportamiento montado (`g.montado && G.cabalgable`):
    (a) Se queda quieto en el sitio (no vuelve al ancla `volver`).
    (b) Se conduce con WASD / flechas: A/D giran la orientación del cuerpo de la montura (izquierda/derecha), W/S avanzan o retroceden hacia su frente.
    (c) Congela la velocidad horizontal propia del jugador (`mc.vel[0]=0, mc.vel[2]=0`) para que las teclas orienten la montura en lugar de hacer caminar al jugador sobre la cabeza del bicho y caerse.
  - Ignorar `solapaJugador` si `g.montado`: al llevarte encima, no se bloquea con su propio pasajero.
"""
import json
import os
import sys
import tempfile

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    'data', 'snippets', 'mundo-autoarranque.json')

CAMBIOS = [
    # ── 1. Normalización de cabalgable en crearEsqueleto ─────────────────────────────────────
    ('crearEsqueleto: normalizar rig.G.cabalgable',
     'REQ-AG12 · normalizar cabalgable',
     "      if (rig.G) rig.G.quieto = quieto;\n",
     "      if (rig.G) {\n"
     "        rig.G.quieto = quieto;\n"
     "        // REQ-AG12 · normalizar cabalgable desde el documento\n"
     "        rig.G.cabalgable = !!(def.cabalgable || (def.seguir && def.seguir.cabalgable));\n"
     "      }\n"),

    # ── 2. pasoSeguir: corrección de cx (centro actual) y ax (centro del ancla real) ─────────
    ('pasoSeguir: cx y ax reales para esqueletos',
     'REQ-AG12 · cx y ax reales',
     "    var cx = (a[0] + a[3]) * 0.5 + g.x, cy = (a[1] + a[4]) * 0.5 + g.y, cz = (a[2] + a[5]) * 0.5 + g.z;\n"
     "    // REQ-AG12 · ancla real del cuerpo (cx - g.x): la caja a ya trae g.x embebido\n"
     "    var ax = cx - g.x, ay = cy - g.y, az = cz - g.z;  // centro del ancla\n",
     "    // REQ-AG12 · centro actual cx (la caja a ya tiene g.x embebido) y ancla real ax = cx - g.x\n"
     "    var cx = (a[0] + a[3]) * 0.5, cy = (a[1] + a[4]) * 0.5, cz = (a[2] + a[5]) * 0.5;\n"
     "    var ax = cx - g.x, ay = cy - g.y, az = cz - g.z;  // centro del ancla\n"),

    # ── 3. pasoSeguir: conducir con dirección (A/D gira, W/S avanza/retrocede) ───────────────
    ('pasoSeguir: soporte de cabalgable para conducir/quedarse quieto',
     'REQ-AG15 · reposicionarse el jugador sin mover el agente',
     "    if (G.quieto || !hay || ciego || (G.deteccion > 0 && d > G.deteccion)) {\n"
     "      g.por = 1;                                        // fuera del radio: se rinde\n"
     "      // BUG-AG11 · montado NO se excluye de aqui. «Montado» es solo que vas encima; si no te\n"
     "      // ve, se comporta como el tonto que es y vuelve a su ancla contigo puesto. Quedarse\n"
     "      // quieto y dejarse llevar seria «cabalgable», que es OTRA capacidad y no existe aun.\n"
     "      if (G.volver && !G.quieto) { mx = ax; my = ay; mz = az; }   // a casa\n"
     "      else { mx = cx; my = cy; mz = cz; }                // donde este\n"
     "    } else {\n",
     "    if (G.quieto || !hay || ciego || (G.deteccion > 0 && d > G.deteccion)) {\n"
     "      // REQ-AG12 / REQ-AG15 · si te lleva ENCIMA y es cabalgable: A/D giran la montura, W/S avanzan de frente. Con Shift pulsado se reposiciona el jugador sin mover el agente.\n"
     "      var cabalgando = ciego && g.montado && !!G.cabalgable;\n"
     "      if (cabalgando) {\n"
     "        var fwdM = 0;\n"
     "        if (typeof mc !== 'undefined' && mc.keys) {\n"
     "          var k = mc.keys, giroVel = 140, dGiro = 0;\n"
     "          var repos = !!(k['shift'] || k['Shift']);\n"
     "          if (!repos) {\n"
     "            if (k['a'] || k['ArrowLeft']) dGiro -= giroVel * dt;\n"
     "            if (k['d'] || k['ArrowRight']) dGiro += giroVel * dt;\n"
     "            if (dGiro !== 0) {\n"
     "              s._rig.giro = wrap180(s._rig.giro + dGiro);\n"
     "              if (typeof mc.yaw === 'number') mc.yaw -= dGiro * GRADO;\n"
     "            }\n"
     "            if (k['w'] || k['ArrowUp']) fwdM += 1;\n"
     "            if (k['s'] || k['ArrowDown']) fwdM -= 1;\n"
     "          }\n"
     "        }\n"
     "        if (fwdM !== 0) {\n"
     "          var rad = (s._rig.giro + s._rig.horneado) * GRADO;\n"
     "          var fwdX = Math.sin(rad), fwdZ = -Math.cos(rad);\n"
     "          mx = cx + fwdX * fwdM * 10; my = cy; mz = cz + fwdZ * fwdM * 10;\n"
     "          g.por = 0;\n"
     "        } else {\n"
     "          g.por = 1;\n"
     "          mx = cx; my = cy; mz = cz;\n"
     "        }\n"
     "      } else if (G.volver && !G.quieto) {\n"
     "        g.por = 1;\n"
     "        mx = ax; my = ay; mz = az; }   // a casa\n"
     "      else { g.por = 1; mx = cx; my = cy; mz = cz; }                // donde este\n"
     "    } else {\n"),

    # ── 4. asentar: huella de celdas real (a[0], a[3], a[2], a[5] ya traen g.x y g.z) ────────
    ('asentar: celda bounds a[0] sin duplicar g.x',
     'REQ-AG12 · asentar celda bounds corregidos',
     "      var x0 = Math.floor(a[0] + g.x + E), x1 = Math.ceil(a[3] + g.x - E) - 1;\n"
     "      var z0 = Math.floor(a[2] + g.z + E), z1 = Math.ceil(a[5] + g.z - E) - 1;\n",
     "      // REQ-AG12 · a[0]..a[5] es rig.cuerpo, que ya trae g.x y g.z embebidos en esqueletosPaso\n"
     "      var x0 = Math.floor(a[0] + E), x1 = Math.ceil(a[3] - E) - 1;\n"
     "      var z0 = Math.floor(a[2] + E), z1 = Math.ceil(a[5] - E) - 1;\n"),

    # ── 5. pasoSeguir: no solapar jugador si g.montado en modo 'xyz' ────────────────────────
    ('pasoSeguir: ignorar solapaJugador si g.montado',
     'REQ-AG12 · solapaJugador ignorar si montado',
     "if (avX && !chocaMundo(s, a, g.x + avX, g.y, g.z) && !solapaJugador(a, g.x + avX, g.y, g.z)) g.x += avX; else if (avX) bloq = true;\n"
     "        if (avZ && !chocaMundo(s, a, g.x, g.y, g.z + avZ) && !solapaJugador(a, g.x, g.y, g.z + avZ)) g.z += avZ; else if (avZ) bloq = true;\n",
     "if (avX && !chocaMundo(s, a, g.x + avX, g.y, g.z) && !(!g.montado && solapaJugador(a, g.x + avX, g.y, g.z))) g.x += avX; else if (avX) bloq = true;\n"
     "        if (avZ && !chocaMundo(s, a, g.x, g.y, g.z + avZ) && !(!g.montado && solapaJugador(a, g.x, g.y, g.z + avZ))) g.z += avZ; else if (avZ) bloq = true;\n"),

    # ── 6. asentar: no solapar jugador si g.montado ──────────────────────────────────────────
    ('asentar: ignorar solapaJugador si g.montado',
     'REQ-AG12 · asentar ignorar solapaJugador si montado',
     "    if (chocaMundo(s, a, g.x, g.y, g.z) || solapaJugador(a, g.x, g.y, g.z)) {\n",
     "    if (chocaMundo(s, a, g.x, g.y, g.z) || (!g.montado && solapaJugador(a, g.x, g.y, g.z))) {\n"),

    # ── 7. esqueletosPaso: congelar marcha del jugador si va montado cabalgando ──────────────
    ('esqueletosPaso: congelar marcha jugador si cabalgando',
     'REQ-AG12 · congelar marcha jugador si cabalgando',
     "      var montado = G.objetivo === 'jugador' && !!rig.llevando;\n"
     "      g.montado = montado;                  // lo lee la tabla de game.esqueletos()\n",
     "      var montado = G.objetivo === 'jugador' && !!rig.llevando;\n"
     "      g.montado = montado;                  // lo lee la tabla de game.esqueletos()\n"
     "      if (montado && G.cabalgable && typeof mc !== 'undefined' && mc.vel) {\n"
     "        mc.vel[0] = 0; mc.vel[2] = 0;\n"
     "      }\n"),

    # ── 8. esqueletosPaso: no sobrescribir rig.giro si va montado cabalgando ──────────────────
    ('esqueletosPaso: preservar rig.giro si cabalgando',
     'REQ-AG12 · preservar rig.giro si cabalgando',
     "      if (g.por !== 1 && hay && hdx * hdx + hdz * hdz > 1e-4) giroObj = wrap180(Math.atan2(hdx, -hdz) / GRADO - rig.horneado);\n"
     "      else if (avance > 1e-4) giroObj = wrap180(Math.atan2(g.x - gx0, -(g.z - gz0)) / GRADO - rig.horneado);\n"
     "      rig.giro = wrap180(rig.giro + wrap180(giroObj - rig.giro) * k);\n",
     "      if (!g.montado || !G.cabalgable) {\n"
     "        if (g.por !== 1 && hay && hdx * hdx + hdz * hdz > 1e-4) giroObj = wrap180(Math.atan2(hdx, -hdz) / GRADO - rig.horneado);\n"
     "        else if (avance > 1e-4) giroObj = wrap180(Math.atan2(g.x - gx0, -(g.z - gz0)) / GRADO - rig.horneado);\n"
     "        rig.giro = wrap180(rig.giro + wrap180(giroObj - rig.giro) * k);\n"
     "      }\n"),

    # ── 9. API game.esqueletos.cabalgable y esCabalgando ────────────────────────────────────
    ('game.esqueletos: añadir API cabalgable y esCabalgando',
     'REQ-AG12 · API cabalgable y esCabalgando',
     "    montable: function (rig, pieza, si) {\n",
     "    // REQ-AG12 · Conmutar o consultar si un agente es cabalgable por instancia.\n"
     "    cabalgable: function (rig, si) {\n"
     "      var r = rigDe(rig);\n"
     "      if (!r) { console.warn('game.esqueletos.cabalgable: no hay ningún agente con id ' + rig + '.'); return false; }\n"
     "      if (!r.G) return false;\n"
     "      if (si !== undefined) r.G.cabalgable = !!si;\n"
     "      return !!r.G.cabalgable;\n"
     "    },\n"
     "    esCabalgando: function () {\n"
     "      if (!esqueletos || !esqueletos.length) return false;\n"
     "      for (var i = 0; i < esqueletos.length; i++) {\n"
     "        var r = esqueletos[i];\n"
     "        if (!r.quitado && r.llevando && r.G && r.G.cabalgable) return true;\n"
     "      }\n"
     "      return false;\n"
     "    },\n"
     "    montable: function (rig, pieza, si) {\n"),

    # ── 10. Tabla game.esqueletos.lista() pone «cabalgando» en el estado si te lleva y lo es ─
    ('game.esqueletos(): estado «cabalgando»',
     'REQ-AG12 · estado cabalgando en tabla',
     "               estado: g.montado ? 'te lleva encima' : POR_SIG[g.por],\n",
     "               estado: g.montado ? ((rig.G && rig.G.cabalgable) ? 'cabalgando' : 'te lleva encima') : POR_SIG[g.por],\n"),
]


def main():
    aplicar = '--dry-run' not in sys.argv
    with open(RUTA, 'r', encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    antes = code

    hechos, saltados = [], []
    for nombre, marca, orig, nuevo in CAMBIOS:
        if marca in code:
            saltados.append(nombre)
            continue
        n = code.count(orig)
        if n != 1:
            print('SALTADO/REINTENTO: el ancla de «%s» aparece %d veces.' % (nombre, n))
            continue
        code = code.replace(orig, nuevo, 1)
        hechos.append(nombre)

    for n in saltados:
        print('  ya estaba · ' + n)
    for n in hechos:
        print('  aplicado  · ' + n)

    if code == antes:
        print('\nNada que hacer: el snippet ya tiene los %d cambios.' % len(CAMBIOS))
        return 0
    if not aplicar:
        print('\n--dry-run: %d cambio(s) listos, no se ha escrito nada.' % len(hechos))
        return 0

    doc['code'] = code
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.parche-', suffix='.json')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False)
        os.replace(tmp, RUTA)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    print('\nEscrito %s (%d cambio(s)). Recarga /map/... para que corra el snippet nuevo.' % (RUTA, len(hechos)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
