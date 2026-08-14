#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BUG-AG11 · si le vas MONTADO encima, el agente ni te ve ni gira sobre sí mismo.

El dueño, tras cerrar BUG-AG9/BUG-AG10: «dada la cabeza del agente, teniendo en cuenta que quiero
montarme encima, qué parámetros tendría que poner para que una vez dentro no me vea? porque he hecho
varias pruebas y no lo consigo» y «puse "tope arriba y abajo (±°) = 0" y lo que hace es dar vueltas
en círculo si me subo a su cabeza».

La respuesta honesta era «ninguno», y por dos motivos independientes:

  1. `seguir.vision` no llega: el cono solo decide EMPEZAR (g.por === 1). Montado estás a ~0 bloques,
     o sea dentro de `deteccion`, así que el bicho está permanentemente en faena y el cono ni se
     consulta. Es el diseño de BUG-AG10 y no se toca.
  2. `mirar.limites.x` calla el CUELLO, no la persecución. Por eso ponerlo a 0 dejaba la cabeza
     quieta y el cuerpo dando vueltas: son dos mecanismos distintos.

Y las vueltas no eran un efecto secundario, eran un caso DEGENERADO. Con el objetivo justo encima
del eje, la distancia horizontal es ~0: la meta «a `distancia` de ti» sale de `dx/d` con `d ≈ 0`, o
sea en una dirección de puro ruido, y el giro del cuerpo sale de `atan2(≈0, ≈0)`, que es ruido
también. Encima, `distancia: 1.2` le pide APARTARSE de ti — pero al apartarse te lleva consigo y el
error nunca se satisface. Resultado: gira sin parar y te pasea.

Los dos arreglos, y ninguno es un parámetro nuevo (CLAUDE.md: si el motor ya calcula la señal que
distingue los casos, el comportamiento razonable va POR DEFECTO):

  A. Montado = invisible. `llevarPasajero()` ya deja dicho `P.llevando` al final del frame, así que
     el motor YA SABE que te lleva encima; solo faltaba mirarlo. Un rig que te lleva te trata como
     no visible: ni persigue (`ciego`, la misma puerta que «te he perdido de vista») ni te encara con
     el cuello (`mirar`). Vale para las dos capacidades a la vez porque «no te ve» es una sola cosa.
     Solo contra el JUGADOR: con `objetivo:[x,y,z]` fijo, llevarte encima es ser un vehículo y debe
     seguir su camino.
  B. Guardia del giro degenerado, aparte y general: sin distancia horizontal no hay hacia dónde
     mirar, así que el cuerpo se queda como está en vez de perseguir el ruido de `atan2(0,0)`. Esto
     arregla también el caso de subirse a una pieza que NO es montable, donde `llevando` es false.

⚠️ Lo que NO hace, por corrección del dueño: montado NO se libra de `volver`. El primer intento lo
dejaba clavado en el sitio para que `game.esqueletos.desplazar()` pudiera pasearlo — y eso, dijo, es
otra capacidad: «"montado" no es lo mismo que "cabalgable"; si fuese cabalgable tiene sentido que se
quede quieto y que además pueda moverlo; si estás montado y no te ve, pues que sea como tonto y
vuelva a su ancla». Así que vuelve a su ancla contigo puesto. **`cabalgable` no existe todavía.**

Válvula de escape: bajarte. No hay bandera para «que me vea mientras me lleva» porque el estado es
observable (`game.esqueletos.lista()` pone «te lleva encima» en la columna `estado`) y volver a él es
dar un paso.

⚠️ El snippet lo edita EN VIVO el dueño: cada cambio lleva su MARCA idempotente y se aborta si el
ancla no aparece exactamente una vez.

    python3 parche_snp_agente_montado.py [--dry-run]
"""
import json
import os
import sys
import tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data', 'snippets', 'mundo-autoarranque.json')

CAMBIOS = [

    # ── A · montado encima = no te ve (persecución) ──────────────────────────────────────────
    ('esqueletosPaso(): montado encima no te ve',
     'BUG-AG11 · si te lleva ENCIMA',
     "      var ciego = G.vision < 360 && G.objetivo === 'jugador' && g.por === 1\n"
     "                  && Math.abs(rig.angObj) > G.vision * 0.5;\n",
     "      // BUG-AG11 · si te lleva ENCIMA no te ve. Ir montado no es estar delante ni detras: es\n"
     "      // su punto ciego de verdad, y ademas la persecucion ahi DEGENERA — a distancia ~0 la\n"
     "      // meta «a `distancia` de ti» sale de dx/d con d ~ 0, o sea en una direccion cualquiera,\n"
     "      // y encima al apartarse te lleva consigo, asi que el error no se satisface nunca: gira\n"
     "      // sobre si mismo y te pasea. `llevando` lo deja puesto llevarPasajero() al final del\n"
     "      // frame anterior, que es justo lo que hace falta aqui.\n"
     "      // Solo contra el JUGADOR: con un objetivo fijo, llevarte encima es ser un vehiculo y\n"
     "      // tiene que seguir su camino.\n"
     "      var montado = G.objetivo === 'jugador' && !!rig.llevando;\n"
     "      g.montado = montado;                  // lo lee la tabla de game.esqueletos()\n"
     "      var ciego = montado || (G.vision < 360 && G.objetivo === 'jugador' && g.por === 1\n"
     "                  && Math.abs(rig.angObj) > G.vision * 0.5);\n"),

    # ── A quater · montado NO se excluye de `volver`: eso seria «cabalgable» ────────────────
    ('pasoSeguir(): montado no cambia lo que hace volver',
     'BUG-AG11 · montado NO se excluye',
     "      if (G.volver && !G.quieto) { mx = ax; my = ay; mz = az; }   // a casa\n",
     "      // BUG-AG11 · montado NO se excluye de aqui. «Montado» es solo que vas encima; si no te\n"
     "      // ve, se comporta como el tonto que es y vuelve a su ancla contigo puesto. Quedarse\n"
     "      // quieto y dejarse llevar seria «cabalgable», que es OTRA capacidad y no existe aun.\n"
     "      if (G.volver && !G.quieto) { mx = ax; my = ay; mz = az; }   // a casa\n"),

    # ── B · el giro degenerado cuando el objetivo esta justo encima del eje ──────────────────
    ('esqueletosPaso(): sin distancia horizontal no hay hacia donde girar',
     'BUG-AG11 · sin distancia HORIZONTAL',
     "      if (g.por !== 1 && hay) giroObj = wrap180(Math.atan2(tx - cxr, -(tz - czr)) / GRADO - rig.horneado);\n",
     "      // BUG-AG11 · sin distancia HORIZONTAL no hay hacia donde girar: justo encima del eje\n"
     "      //    atan2(0, 0) es ruido y el cuerpo se pondria a dar vueltas. Se queda como este (o,\n"
     "      //    si anda, mirando hacia donde va, que es la rama de abajo). Va aparte de `montado`\n"
     "      //    a proposito: subirse a una pieza que NO es montable cae aqui igual.\n"
     "      var hdx = tx - cxr, hdz = tz - czr;\n"
     "      if (g.por !== 1 && hay && hdx * hdx + hdz * hdz > 1e-4) giroObj = wrap180(Math.atan2(hdx, -hdz) / GRADO - rig.horneado);\n"),

    # ── A bis · el cuello tampoco te encara si te lleva ──────────────────────────────────────
    ('mirar: el cuello tampoco te encara si te lleva encima',
     'BUG-AG11 · el cuello tampoco',
     "          if (hay && (ddx * ddx + ddy * ddy + ddz * ddz) <= L.alcance * L.alcance\n"
     "                  && alto >= L.limX[0] && alto <= L.limX[1]) {\n",
     "          // BUG-AG11 · el cuello tampoco. `limites.x` solo callaba el cuello y `vision` solo\n"
     "          // la persecucion, asi que sin esto no habia NINGUNA combinacion de parametros que\n"
     "          // significara «montado encima no me ves»: la cabeza te seguia encarando desde otra\n"
     "          // pieza aunque el cuerpo ya se hubiera rendido.\n"
     "          if (hay && !montado && (ddx * ddx + ddy * ddy + ddz * ddz) <= L.alcance * L.alcance\n"
     "                  && alto >= L.limX[0] && alto <= L.limX[1]) {\n"),

    # ── A ter · quien pone rig.llevando ──────────────────────────────────────────────────────
    ('el bucle de piezas recalcula rig.llevando',
     'BUG-AG11 · lo recalcula el bucle',
     "      for (var i = 0; i < rig.partes.length; i++) {\n"
     "        var P = rig.partes[i], s = P.s, aa = s && s.aabb;\n",
     "      rig.llevando = false;                  // BUG-AG11 · lo recalcula el bucle de aqui abajo\n"
     "      for (var i = 0; i < rig.partes.length; i++) {\n"
     "        var P = rig.partes[i], s = P.s, aa = s && s.aabb;\n"),

    ('llevarPasajero() sube su resultado al rig',
     'BUG-AG11 · y sube al rig',
     "        if (P.montable) P.llevando = llevarPasajero(P, m, aa);\n",
     "        // BUG-AG11 · y sube al rig: «te lleva encima» es del BICHO, no de la pieza. Se lee en\n"
     "        // el frame siguiente, arriba del todo, antes de decidir si te persigue.\n"
     "        if (P.montable) { P.llevando = llevarPasajero(P, m, aa); if (P.llevando) rig.llevando = true; }\n"),

    # ── La tabla lo dice, que si no «fuera de alcance» a 0 bloques parece averiado ───────────
    ('game.esqueletos(): estado «te lleva encima»',
     'BUG-AG11 · «fuera de alcance» a 0',
     "               a: Math.round(g.pide * 10) / 10, estado: POR_SIG[g.por],\n",
     "               a: Math.round(g.pide * 10) / 10,\n"
     "               // BUG-AG11 · «fuera de alcance» a 0,3 bloques parece averiado: lo que pasa es\n"
     "               // que le vas montado encima y desde ahi no te ve. Va en el estado y no en una\n"
     "               // columna aparte porque es la RAZON de ese estado, no un dato mas.\n"
     "               estado: g.montado ? 'te lleva encima' : POR_SIG[g.por],\n"),
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
            print('ABORTA: el ancla de «%s» aparece %d veces (esperaba 1).' % (nombre, n))
            print('  El snippet lo edita el dueño en vivo: revisa a mano antes de insistir.')
            return 2
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
