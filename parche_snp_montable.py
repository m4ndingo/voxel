#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-MNT1 · Ir MONTADO en una pieza de un agente articulado.

El dueño: «cuando construimos los npcs se les dieron habilidades a algunos como "passengers: true",
es posible que para un agente articulado le pueda dar esta habilidad a su cabeza desde scripting
ahora mismo?». No lo era: `passengers` (app.js:10966) vive dentro de mcAgentsSmoothUpdate, que
recorre `mc.agents` — los NPC-CUBO. Un agente articulado no esta ahi: sus miembros son estructuras
finas de mc.structures movidas por s.model. Ademas isMounted() esta cableado a la caja 1x1x1 del cubo
(rx+0.1..rx+0.9, ry+1.9..ry+2.5), cotas que no significan nada para una cabeza con matriz propia.

Subirse encima YA funcionaba (las piezas de rig son solidas). Lo que faltaba es que te LLEVE.

Y va entero aqui, sin tocar app.js, porque esto es comportamiento de agentes (CLAUDE.md §0) y porque
`esqueletosPaso` ya tiene todo lo que hace falta: corre por frame, compone la matriz de cada miembro
y es LO ULTIMO del frame del jugador (despues de la fisica, de pisar y de suavizarPaso), asi que
mover mc.pos ahi es la ultima palabra — mismo sitio en la cadena que ocupa el acarreo del cubo.

    game.esqueletos.montable(1, 'cabeza');          // el zombie #1 te lleva en la cabeza
    game.esqueletos.montable(1, 'cabeza', false);   // ya no

⚠️ El acarreo es RIGIDO, no una traslacion: L = Rᵀ·(p − t) con la matriz del frame anterior, y
p' = R'·L + t' con la de este. Asi el giro tambien te lleva (orbitas con la pieza) en vez de dejarte
resbalar cuando la cabeza se vuelve. Es la misma traspuesta que usa la atribucion del «abrazo»
(REQ-DBG2) y la solidez de las piezas movidas (BUG-AG4): en este motor, todo lo que pregunta «donde
esta esto respecto de una pieza movida» pasa por ahi.

El snippet lo edita EN VIVO el dueño ⇒ parche idempotente, con MARCA por cambio (ver
parche_snp_atasco.py: saltarse un cambio por su texto completo lo duplica en cuanto otro se lo
reescribe por dentro) y aborta si un ancla no aparece exactamente una vez.

ORDEN: independiente del resto de parches. No comparte ni una ancla con ellos.
"""
import json
import os
import sys
import tempfile

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    'data', 'snippets', 'mundo-autoarranque.json')

# (nombre, marca, original, parcheado) — se salta si `marca` ya esta en el codigo.
CAMBIOS = [

    ('llevarPasajero(): el acarreo rigido, con la matriz de antes y la de ahora',
     "function llevarPasajero(",
     "  function esqueletosPaso(dt) {\n",
     "  // ── Ir MONTADO en una pieza (REQ-MNT1) ───────────────────────────────────────────────────────\n"
     "  // Subirse encima de un miembro ya funcionaba —son solidos donde se les ve—, pero el bicho se iba\n"
     "  // andando por debajo y te dejaba plantado en el aire. Esto es lo que faltaba: que te LLEVE.\n"
     "  //\n"
     "  // Holguras, las dos en bloques. El margen horizontal no es cosmetico: la caja de una pieza\n"
     "  // movida se redondea hacia fuera (el «abrazo» de REQ-DBG2) y los pies no caen en el mismo sitio\n"
     "  // dos frames seguidos, asi que sin margen te bajarias del carro cada dos por tres.\n"
     "  var MONTA_MARGEN = 0.30;                    // cuanto puedes sobresalir de la tapa\n"
     "  var MONTA_ALTO = 0.60;                      // ventana sobre la tapa donde cuenta como «encima»\n"
     "  var MONTA_SALTO = 2;                        // de mas que esto no es que se mueva: es que la han\n"
     "                                              // reestampado (readquirir) y no hay que salir volando\n"
     "\n"
     "  // La matriz se REUSA cada frame (ver matrizDe), asi que la de antes hay que copiarla antes de\n"
     "  // recomponerla o se compara una matriz consigo misma y el acarreo sale siempre cero.\n"
     "  function guardarPose(P, m) {\n"
     "    var q = P._m0 || (P._m0 = new Float32Array(16));\n"
     "    q.set(m);\n"
     "    P._m0ok = m[15] === 1;                    // 0 = recien creada, todavia no compuesta\n"
     "  }\n"
     "\n"
     "  function llevarPasajero(P, m, a) {\n"
     "    var q = P._m0;\n"
     "    if (!q || !P._m0ok) return false;         // primer frame con matriz: no hay con que comparar\n"
     "    var p = mc.pos;\n"
     "    // La Y FISICA, no la pintada: suavizarPaso baja mc.pos[1] para el ojo y deja la real aparte.\n"
     "    // Midiendo sobre la pintada, un escalon reciente te bajaria del carro sin haberte movido.\n"
     "    var py = mc._pasoDesfase ? mc._pasoReal : p[1];\n"
     "    // Donde estabas EN LA PIEZA, con la matriz del frame ANTERIOR: L = Rᵀ·(p − t), por columnas.\n"
     "    var dx = p[0] - q[12], dy = py - q[13], dz = p[2] - q[14];\n"
     "    var lx = q[0] * dx + q[1] * dy + q[2] * dz;\n"
     "    var ly = q[4] * dx + q[5] * dy + q[6] * dz;\n"
     "    var lz = q[8] * dx + q[9] * dy + q[10] * dz;\n"
     "    // ...y se compara contra su aabb, que esta en ESE espacio local. Encima de la tapa (a[4]),\n"
     "    // no dentro: si los pies estan por debajo no vas montado, te esta empotrando.\n"
     "    if (lx < a[0] - MONTA_MARGEN || lx > a[3] + MONTA_MARGEN) return false;\n"
     "    if (lz < a[2] - MONTA_MARGEN || lz > a[5] + MONTA_MARGEN) return false;\n"
     "    if (ly < a[4] - 0.10 || ly > a[4] + MONTA_ALTO) return false;\n"
     "    // El mismo punto suyo, ahora: p' = R'·L + t'. Rigido, o sea que el GIRO tambien te lleva —\n"
     "    // orbitas con la pieza en vez de resbalarte cuando la cabeza se vuelve.\n"
     "    var nx = m[0] * lx + m[4] * ly + m[8] * lz + m[12];\n"
     "    var ny = m[1] * lx + m[5] * ly + m[9] * lz + m[13];\n"
     "    var nz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];\n"
     "    var ex = nx - p[0], ey = ny - py, ez = nz - p[2];\n"
     "    var d2 = ex * ex + ey * ey + ez * ez;\n"
     "    if (d2 < 1e-10) return true;              // quieta: montado, pero nada que mover\n"
     "    if (d2 > MONTA_SALTO * MONTA_SALTO) return false;\n"
     "    // No EMPEORAR, que no es lo mismo que «no chocar»: de pie encima ya rozas la caja inflada de\n"
     "    // la pieza, asi que exigir un destino limpio no te subiria jamas. Se rechaza solo el caso\n"
     "    // honesto: ahora no chocas y ahi si. Entonces te quedas donde estas y te bajas del carro.\n"
     "    if (typeof mcCollides === 'function' && mcCollides(nx, ny, nz) && !mcCollides(p[0], py, p[2]))\n"
     "      return false;\n"
     "    p[0] = nx; p[2] = nz;\n"
     "    p[1] += ey;                               // por DELTA: sumar borraria el desfase del ojo\n"
     "    if (mc._pasoDesfase) mc._pasoReal += ey;\n"
     "    return true;\n"
     "  }\n"
     "\n"
     "  function esqueletosPaso(dt) {\n"),

    ('esqueletosPaso(): copiar la pose antes y llevar al pasajero despues',
     "P.montable",
     "        var m = matrizDe(s);\n"
     "        matrizPieza(m, mYaw, aa, s.rot, P.piv, P.art, P.o, P.giroMira, rig.fase, rig.activo, rig.andando);\n"
     "        m[12] += g.x; m[13] += g.y; m[14] += g.z;                     // ...y esto, T(g)·(lo de antes)\n",
     "        var m = matrizDe(s);\n"
     "        if (P.montable) guardarPose(P, m);                           // ANTES: matrizDe reusa el array\n"
     "        matrizPieza(m, mYaw, aa, s.rot, P.piv, P.art, P.o, P.giroMira, rig.fase, rig.activo, rig.andando);\n"
     "        m[12] += g.x; m[13] += g.y; m[14] += g.z;                     // ...y esto, T(g)·(lo de antes)\n"
     "        // Y despues, con las dos matrices en la mano. Va aqui dentro y no en un barrido aparte\n"
     "        // porque la de antes solo existe en este punto del bucle.\n"
     "        if (P.montable) P.llevando = llevarPasajero(P, m, aa);\n"),

    ('game.esqueletos.montable(rig, pieza, si)',
     "montable: function (",
     "    lista: esqueletos_,\n",
     "    lista: esqueletos_,\n"
     "    // Ir montado encima de una pieza. Es de la INSTANCIA y no del material a proposito: la cabeza\n"
     "    // de ESE zombie, no todas las cabezas del mapa — que es justo la diferencia con game.bloques,\n"
     "    // donde el comportamiento cuelga del material. Sin tercer argumento, enciende.\n"
     "    montable: function (rig, pieza, si) {\n"
     "      var r = rigDe(rig);\n"
     "      if (!r) { console.warn('game.esqueletos.montable: no hay ningún agente ' + rig + '.'); return false; }\n"
     "      var ps = r.partes || [], enc = null, nombres = [];\n"
     "      for (var i = 0; i < ps.length; i++) { nombres.push(ps[i].nombre); if (ps[i].nombre === pieza) enc = ps[i]; }\n"
     "      if (!enc) {\n"
     "        console.warn('game.esqueletos.montable: «' + pieza + '» no es una pieza de ' + r.nombre +\n"
     "                     '. Tiene: ' + nombres.join(', ') + '.');\n"
     "        return false;\n"
     "      }\n"
     "      enc.montable = (si === undefined) ? true : !!si;\n"
     "      if (!enc.montable) { enc._m0 = null; enc._m0ok = false; enc.llevando = false; }\n"
     "      return enc.montable;\n"
     "    },\n"),

    ('la chuleta de la cabecera',
     "//   game.esqueletos.montable(",
     "//   game.esqueletos.enCaja(x0,y0,z0, x1,y1,z1)  ← quien tiene el cuerpo dentro de esa caja\n",
     "//   game.esqueletos.montable(id, 'cabeza')      ← subete encima y TE LLEVA (giro incluido: orbitas\n"
     "//                                 con la pieza). Subirse ya se podia; lo que faltaba era que te\n"
     "//                                 llevase. montable(id, 'cabeza', false) lo apaga.\n"
     "//   game.esqueletos.enCaja(x0,y0,z0, x1,y1,z1)  ← quien tiene el cuerpo dentro de esa caja\n"),
]


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc.get('code')
    if not isinstance(code, str):
        sys.exit('%s no tiene "code": ¿es el snippet que creo que es?' % RUTA)

    hechos, saltados = [], []
    for nombre, marca, original, nuevo in CAMBIOS:
        if marca in code:
            saltados.append(nombre)
            continue
        n = code.count(original)
        if n != 1:
            sys.exit('ANCLA "%s": esperaba 1 aparicion, encontradas %d. El dueño ha editado el snippet '
                     'por debajo; revisa a mano antes de insistir.' % (nombre, n))
        code = code.replace(original, nuevo)
        hechos.append(nombre)

    if not hechos:
        print('nada que hacer: el snippet ya estaba parcheado (%d cambios)' % len(saltados))
        return

    doc['code'] = code
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(RUTA), suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)

    for n in hechos:
        print('  ✓ ' + n)
    for n in saltados:
        print('  · ya estaba: ' + n)


if __name__ == '__main__':
    main()
