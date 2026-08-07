#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BUG-AG9 + BUG-AG10 · lo que un agente articulado PUEDE ver.

El dueño: «hay un bug en cuanto a qué puede ver un agente articulado cuando te mira (es una
capacidad), si me pongo encima de su cabeza no debería verme puesto que los ojos no pueden mirar en
ese ángulo z, y tampoco si paso por detrás de él no debería poder verme para comenzar a seguirme».

Son dos capacidades distintas y por eso son dos arreglos distintos:

  BUG-AG9 · `mirar` (por PIEZA) medía un solo ángulo, el horizontal: `Math.atan2(ddx, -ddz)`. La
    `ddy` estaba calculada y solo servía para la distancia, así que el cono era un CILINDRO infinito
    hacia arriba y hacia abajo: subírsele a la cabeza dejaba el objetivo casi vertical y la pieza
    seguía encarándote como si nada. Ahora `limites.x` (hermano del `y` que ya existía) es el tope
    del cuello arriba/abajo, y fuera de él la pieza NO se pinza —pinzar la dejaría clavada en el
    tope, o sea sigue mirándote— sino que vuelve a reposo, que es lo que quiere decir «desde ahí no
    te ve».

  BUG-AG10 · `seguir` (del BICHO entero) detectaba en una ESFERA: bastaba estar dentro de
    `deteccion`. Pasarle por la espalda le hacía darse la vuelta y perseguirte sin haberte visto
    nunca. Ahora hay `vision` (ángulo total del cono, 180 por defecto) y solo decide EMPEZAR: una
    vez en faena (g.por !== 1) manda el radio, porque el bicho ya se está girando hacia ti y volver
    a medir el ángulo lo haría parpadear justo en el borde del cono.

Válvula de escape en los dos sentidos, como manda la casa: `mirar:{ limites:{ x:[-90,90] } }`
devuelve el cilindro de antes y `seguir:{ vision:360 }` devuelve la esfera; y estrecharlos es igual
de fácil. Los defectos van ENCENDIDOS porque el motor ya tenía la señal que distingue los casos
(`ddy` y el giro del cuerpo) y solo le faltaba mirarla.

Reparto de siempre (CLAUDE.md §0): las casillas del editor son UI y van en app.js, que solo escribe
las claves del documento; **quien las aplica es esta librería**.

⚠️ El snippet lo edita EN VIVO el dueño: cada cambio lleva su MARCA idempotente y se aborta si el
ancla no aparece exactamente una vez.

    python3 parche_snp_vision_agentes.py [--dry-run]
"""
import json
import os
import sys
import tempfile

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    'data', 'snippets', 'mundo-autoarranque.json')

CAMBIOS = [

    # ── BUG-AG9 · el tope vertical del cuello ────────────────────────────────────────────────
    ('normalizarMirada(): limites.x = el tope arriba/abajo',
     'BUG-AG9 · el tope VERTICAL',
     "  function normalizarMirada(m) {\n"
     "    if (!m) return null;\n"
     "    var lim = (m.limites && m.limites.y) || [-70, 70];\n"
     "    return { alcance: Math.abs(num(m.alcance, 12)),\n"
     "             limY: [num(lim[0], -70), num(lim[1], 70)],\n"
     "             suavidad: Math.abs(num(m.suavidad, 0.12)) };\n"
     "  }\n",
     "  function normalizarMirada(m) {\n"
     "    if (!m) return null;\n"
     "    var lim = (m.limites && m.limites.y) || [-70, 70];\n"
     "    // BUG-AG9 · el tope VERTICAL, hermano del horizontal y con el mismo defecto a proposito: un\n"
     "    // cuello que puede mirar recto arriba ES el bug —subirsele a la cabeza y que te siga\n"
     "    // encarando—. Para el cilindro infinito de antes, `mirar: { limites: { x: [-90, 90] } }`.\n"
     "    var limV = (m.limites && m.limites.x) || [-70, 70];\n"
     "    return { alcance: Math.abs(num(m.alcance, 12)),\n"
     "             limY: [num(lim[0], -70), num(lim[1], 70)],\n"
     "             limX: [num(limV[0], -70), num(limV[1], 70)],\n"
     "             suavidad: Math.abs(num(m.suavidad, 0.12)) };\n"
     "  }\n"),

    ('esqueletosPaso(): fuera del cono vertical, la pieza vuelve a reposo',
     'BUG-AG9 · fuera del cono vertical',
     "          var obj = 0;\n"
     "          if (hay && (ddx * ddx + ddy * ddy + ddz * ddz) <= L.alcance * L.alcance) {\n"
     "            obj = pinza(wrap180(Math.atan2(ddx, -ddz) / GRADO - (s.rot & 3) * 90 - rig.giro), L.limY[0], L.limY[1]);\n"
     "          }\n",
     "          // BUG-AG9 · fuera del cono vertical no te ve. `ddy` ya estaba aqui y solo se gastaba en\n"
     "          // la distancia, asi que el cono era un CILINDRO: encima de su cabeza el objetivo queda\n"
     "          // casi a 90 y la pieza te seguia encarando. Y NO se pinza como el horizontal: pinzar\n"
     "          // deja la cabeza clavada en el tope, o sea mirandote igual. Se va a reposo.\n"
     "          var obj = 0, alto = Math.atan2(ddy, Math.sqrt(ddx * ddx + ddz * ddz)) / GRADO;\n"
     "          if (hay && (ddx * ddx + ddy * ddy + ddz * ddz) <= L.alcance * L.alcance\n"
     "                  && alto >= L.limX[0] && alto <= L.limX[1]) {\n"
     "            obj = pinza(wrap180(Math.atan2(ddx, -ddz) / GRADO - (s.rot & 3) * 90 - rig.giro), L.limY[0], L.limY[1]);\n"
     "          }\n"),

    # ── BUG-AG10 · el cono de vision del bicho entero ────────────────────────────────────────
    ('normalizarSeguir(): sabe si la pide un rig o un material',
     'clave, g, paraRig',
     "  function normalizarSeguir(clave, g) {\n",
     # `paraRig` existe solo para poder avisar: un material con `seguir` no tiene una cara con la
     # que mirar, asi que aceptarle `vision` en silencio seria una opcion que no hace nada.
     "  function normalizarSeguir(clave, g, paraRig) {\n"),

    ('normalizarSeguir(): vision = el cono en el que EMPIEZA a perseguirte',
     'BUG-AG10 · el cono de vision',
     "    var det = Math.abs(num(g.deteccion, 16));\n"
     "    var dis = Math.abs(num(g.distancia, 2.5));\n",
     "    var det = Math.abs(num(g.deteccion, 16));\n"
     "    var dis = Math.abs(num(g.distancia, 2.5));\n"
     "    // BUG-AG10 · el cono de vision. `deteccion` es un RADIO, o sea una ESFERA: sin esto, pasarle\n"
     "    // por la espalda dentro del radio bastaba para que se diera la vuelta y te persiguiera sin\n"
     "    // haberte visto. Es el angulo TOTAL (180 = solo lo que tiene delante); 360 = la esfera de\n"
     "    // antes. Solo decide EMPEZAR: lo demas esta en esqueletosPaso.\n"
     "    var vis = Math.max(0, Math.min(360, num(g.vision, 180)));\n"
     "    if (!paraRig && g.vision !== undefined)\n"
     "      console.warn('game.bloques.define(\"' + clave + '\"): vision solo la miran los agentes '\n"
     "        + 'articulados (game.esqueletos). Una estructura con seguir no tiene cara con la que '\n"
     "        + 'mirar: su radio de deteccion sigue siendo una esfera.');\n"),

    ('normalizarSeguir(): vision viaja en el objeto normalizado',
     'vision: vis,',
     "      deteccion: det,                           // radio en que arranca la persecucion (0 = siempre)\n",
     "      deteccion: det,                           // radio en que arranca la persecucion (0 = siempre)\n"
     "      vision: vis,                              // grados de cono para EMPEZAR (360 = esfera); solo rigs\n"),

    ('pasoSeguir(): admite un ciego que no depende de la distancia',
     ', F, ciego)',
     "  function pasoSeguir(s, a, g, G, dt, hay, tx, ty, tz, F) {\n",
     # Ultimo parametro a proposito: el camino por material llama con 10 argumentos y le llega
     # undefined, o sea que no cambia ni un float.
     "  function pasoSeguir(s, a, g, G, dt, hay, tx, ty, tz, F, ciego) {\n"),

    ('pasoSeguir(): ciego entra por la misma puerta que «te he perdido de vista»',
     '|| ciego ||',
     "    if (G.quieto || !hay || (G.deteccion > 0 && d > G.deteccion)) {\n",
     # Va DESPUES de `g.pide = d`, que por eso no se toca: el diagnostico tiene que seguir diciendo
     # a que distancia estas aunque no te vea. Si no, la tabla pondria «a 0 bloques» y mentiria.
     "    if (G.quieto || !hay || ciego || (G.deteccion > 0 && d > G.deteccion)) {\n"),

    ('esqueletosPaso(): mide el angulo al objetivo y decide si lo tiene delante',
     'rig.angObj',
     "      var G = rig.G, hay = true, tx = 0, ty = 0, tz = 0;\n"
     "      if (G.objetivo === 'jugador') { tx = p[0]; ty = p[1]; tz = p[2]; }\n"
     "      else { tx = G.objetivo[0]; ty = G.objetivo[1]; tz = G.objetivo[2]; }\n",
     "      var G = rig.G, hay = true, tx = 0, ty = 0, tz = 0;\n"
     "      if (G.objetivo === 'jugador') { tx = p[0]; ty = p[1]; tz = p[2]; }\n"
     "      else { tx = G.objetivo[0]; ty = G.objetivo[1]; tz = G.objetivo[2]; }\n"
     "      // BUG-AG10 · a cuantos grados de su NARIZ esta el objetivo. El cuerpo mira a\n"
     "      // rig.giro + rig.horneado (es la misma cuenta del punto 3, al reves), y se guarda en el rig\n"
     "      // porque es lo que hace legible la tabla de game.esqueletos(): «estado: fuera de alcance,\n"
     "      // a 3 bloques» solo se entiende si al lado pone «frente: 178°».\n"
     "      var vdx = tx - (rig.eje[0] + g.x), vdz = tz - (rig.eje[2] + g.z);\n"
     "      rig.angObj = (vdx * vdx + vdz * vdz > 1e-8)\n"
     "        ? wrap180(Math.atan2(vdx, -vdz) / GRADO - rig.horneado - rig.giro) : 0;\n"
     "      // El cono solo decide EMPEZAR. Ya en faena (g.por !== 1) manda el radio: el bicho se esta\n"
     "      // girando hacia ti, asi que volver a medir el angulo lo dejaria parpadeando en el borde —\n"
     "      // te pierde, deja de girar, te vuelve a coger. Perderte es salir del RADIO.\n"
     "      var ciego = G.vision < 360 && g.por === 1 && Math.abs(rig.angObj) > G.vision * 0.5;\n"),

    ('esqueletosPaso(): el ciego llega al paso',
     ': null, ciego);',
     "      pasoSeguir(sr, rig.cuerpo, g, G, dtPaso, hay, tx, ty, tz,\n"
     "                 rig.fis ? { fac: mar, drop: rig.fis.caida } : null);\n",
     "      pasoSeguir(sr, rig.cuerpo, g, G, dtPaso, hay, tx, ty, tz,\n"
     "                 rig.fis ? { fac: mar, drop: rig.fis.caida } : null, ciego);\n"),

    ('crearEsqueleto(): normalizarSeguir sabe que es para un rig',
     ': def.seguir, true);',
     "      rig.G = normalizarSeguir(R.s.key, quieto || def.seguir === undefined ? true : def.seguir);\n",
     "      rig.G = normalizarSeguir(R.s.key, quieto || def.seguir === undefined ? true : def.seguir, true);\n"),

    ('crearEsqueleto(): el rehecho por porClave no se deja la vision por el camino',
     'vision: rig.G.vision',
     "        rig.G = normalizarSeguir(R.s.key, { deteccion: rig.G.deteccion, distancia: rig.G.distancia,\n"
     "          velocidad: rig.G.velocidad, correa: rig.G.correa, volver: rig.G.volver, ejes: rig.G.ejes,\n"
     "          suavidad: rig.G.suavidad });\n",
     # Este rehecho copia campo a campo, asi que TODO campo nuevo de normalizarSeguir hay que
     # traerlo aqui a mano o se pierde en silencio justo en el caso raro.
     "        rig.G = normalizarSeguir(R.s.key, { deteccion: rig.G.deteccion, distancia: rig.G.distancia,\n"
     "          velocidad: rig.G.velocidad, correa: rig.G.correa, volver: rig.G.volver, ejes: rig.G.ejes,\n"
     "          suavidad: rig.G.suavidad, vision: rig.G.vision }, true);\n"),

    # Descubierto corriendo test_agente_aturdido.js: cuatro casos en rojo, todos con «no se movio».
    # Los bancos que llevan un agente a un PUNTO (el del piston, el de montarse encima) le ponen el
    # objetivo detras y el bicho se quedaba clavado para siempre.
    ('esqueletosPaso(): el cono es cosa del JUGADOR, no de un punto fijo',
     "G.objetivo === 'jugador' && g.por === 1",
     "      var ciego = G.vision < 360 && g.por === 1 && Math.abs(rig.angObj) > G.vision * 0.5;\n",
     "      // Y solo cuando el objetivo es el JUGADOR. Con un punto fijo «no lo ve» no es raro: es un\n"
     "      // ATASCO. El cuerpo solo se gira mientras persigue (punto 3), asi que un punto a su espalda\n"
     "      // no entraria en el cono jamas y el bicho se quedaria plantado de por vida. El jugador no\n"
     "      // tiene ese problema porque se mueve solo: si quiere que le vea, se pone delante.\n"
     "      var ciego = G.vision < 360 && G.objetivo === 'jugador' && g.por === 1\n"
     "                  && Math.abs(rig.angObj) > G.vision * 0.5;\n"),

    ('normalizarSeguir(): el comentario de vision dice a quien se le aplica',
     'solo rigs y solo tras el jugador',
     "      vision: vis,                              // grados de cono para EMPEZAR (360 = esfera); solo rigs\n",
     "      vision: vis,                              // grados de cono para EMPEZAR (360 = esfera);\n"
     "                                                // solo rigs y solo tras el jugador (ver esqueletosPaso)\n"),

    ('game.esqueletos(): la tabla dice a cuantos grados te tiene',
     'frente: Math.round',
     "               a: Math.round(g.pide * 10) / 10, estado: POR_SIG[g.por],\n",
     "               a: Math.round(g.pide * 10) / 10, estado: POR_SIG[g.por],\n"
     "               // BUG-AG10 · sin esto, un bicho que te tiene a 3 bloques y pone «fuera de alcance»\n"
     "               // parece averiado. 0° = te tiene de frente; ±180° = estas a su espalda.\n"
     "               frente: Math.round(rig.angObj || 0) + '°',\n"),

    ('la cabecera del documento ensena los dos limites nuevos',
     'x:[-70,70]',
     "  //         mirar:{ limites:{ y:[-70,70] }, alcance:12 } },        // gira hacia el jugador\n",
     "  //         mirar:{ limites:{ y:[-70,70], x:[-70,70] }, alcance:12 } },  // gira hacia el jugador\n"
     "  //                          //  y = cuanto tuerce el cuello a los lados; x = arriba y abajo\n"),

    ('la cabecera del documento ensena la vision',
     'vision:180',
     "  //     seguir: { deteccion:14, distancia:1.2, velocidad:2.2 },    // lo mismo que game.bloques\n",
     "  //     seguir: { deteccion:14, distancia:1.2, velocidad:2.2,\n"
     "  //               vision:180 },                                    // el cono en el que te ve (360 = esfera)\n"),
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
