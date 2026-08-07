#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BUG-AG4 · La solidez de un agente sigue a la MATRIZ, no solo al desplazamiento.

Hasta ahora, de las 6 piezas de un zombie solo el TORSO era solido: la solidez de una pieza movida
la ponia el envoltorio de mcFineBoxHit restando `s._sig` a la caja de consulta, y `_sig` solo lo
lleva la raiz. Todo lo demas (cabeza, brazos, piernas) era un fantasma. El dueño se lo encontro
subiendose encima: «puedo subirme al torso de un agente pero no a su cabeza, que parecería sólida
pero no, la traspaso al subirme encima y caigo en el torso».

No era un descuido: estaba escrito a proposito, porque el rig GIRA las piezas y restar un vector
solo sabe trasladar — una caja que no acompaña al dibujo es peor que ninguna caja.

Lo que cambia aqui es esa premisa. Cada pieza YA tiene su matriz de mundo (`s.model`, compuesta por
esqueletosPaso), y es un giro RIGIDO: su 3x3 es ortonormal, asi que la inversa es la TRASPUESTA y no
hay nada que invertir de verdad. Se pasa la caja de consulta por esa inversa y alli la pieza vuelve a
estar en su celda de estampado, donde el bitset de siempre vale tal cual. La caja acompaña al dibujo
por construccion, que era justo lo que faltaba.

Las piezas con `seguir` (las que NO son de un rig) siguen por el camino de siempre, byte por byte:
son traslacion pura y el bucle caliente no tiene por que pagar una matriz.

El snippet lo edita EN VIVO el dueño ⇒ este parche es idempotente y aborta si un ancla no aparece
exactamente una vez.

⚠️ ORDEN: va DESPUES de parche_snp_escala_agente.py, porque sus anclas ya cuentan con el `E = s.esc`
que aquel mete en el bucle. Sobre un snippet recien puesto, primero aquel y luego este:

    python3 parche_snp_escala_agente.py
    python3 parche_snp_solidez_piezas.py

(Al reves aborta con «esperaba 1 aparicion, encontradas 0», que es lo que tiene que hacer. Y al
partir el bucle de `golpe` en dos ramas deja de aparecer literal el texto que aquel parche usaba para
saber si ya estaba puesto: por eso aquellas costuras llevan ahora una MARCA aparte.)
"""
import json
import os
import sys
import tempfile

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    'data', 'snippets', 'mundo-autoarranque.json')

# (nombre, original, parcheado) — cada uno se salta si `parcheado` ya esta.
CAMBIOS = [

    ('nPosadas: el contador de piezas que van por matriz',
     "  var nDesplazados = 0;          // salida rapida de las envolturas de colision: 0 => no tocan nada\n",
     "  var nDesplazados = 0;          // salida rapida de las envolturas de colision: 0 => no tocan nada\n"
     "  // Y su gemelo para los rigs. Son DOS contadores y no uno porque son dos caminos distintos:\n"
     "  // `seguir` traslada (se le resta el vector) y un rig POSA (se pasa por la inversa de su\n"
     "  // matriz). Sumados en uno solo, un mundo con un zombie quieto pondria a barrer al otro.\n"
     "  var nPosadas = 0;              // piezas de un rig con matriz viva este frame\n"),

    ('esqueletosPaso: nPosadas se recuenta cada frame, antes de la salida rapida',
     "  function esqueletosPaso(dt) {\n"
     "    if (!esqueletos.length || typeof mc === 'undefined' || !mc.structures || !mc.pos) return;\n",
     "  function esqueletosPaso(dt) {\n"
     "    // A cero ANTES de la salida rapida: si no, al quitar el ultimo agente el contador se quedaria\n"
     "    // clavado y las envolturas de colision seguirian barriendo mc.structures para siempre.\n"
     "    nPosadas = 0;\n"
     "    if (!esqueletos.length || typeof mc === 'undefined' || !mc.structures || !mc.pos) return;\n"),

    ('esqueletosPaso: cada pieza posada se cuenta',
     "        var m = matrizDe(s);\n"
     "        matrizPieza(m, mYaw, aa, s.rot, P.piv, P.art, P.o, P.giroMira, rig.fase, rig.activo, rig.andando);\n"
     "        m[12] += g.x; m[13] += g.y; m[14] += g.z;                     // ...y esto, T(g)·(lo de antes)\n",
     "        var m = matrizDe(s);\n"
     "        matrizPieza(m, mYaw, aa, s.rot, P.piv, P.art, P.o, P.giroMira, rig.fase, rig.activo, rig.andando);\n"
     "        m[12] += g.x; m[13] += g.y; m[14] += g.z;                     // ...y esto, T(g)·(lo de antes)\n"
     "        nPosadas++;   // esta pieza ya tiene matriz: la solidez de golpe()/envAt la sacara de ahi\n"),

    ('crear: def.solidez, la valvula de escape',
     "      horneado: 0, eje: [0, 0, 0], cuerpo: null, G: null, esc: ESC, plantado: [x, y, z]\n",
     "      horneado: 0, eje: [0, 0, 0], cuerpo: null, G: null, esc: ESC, plantado: [x, y, z],\n"
     "      // Con que piezas choca el JUGADOR (no con que choca el agente: eso es `cuerpo`). Por\n"
     "      // defecto todas, que es lo que se ve. `solidez:'raiz'` vuelve al comportamiento viejo\n"
     "      // (solo el torso) por si un brazo en movimiento resulta molesto de verdad jugando.\n"
     "      soloRaiz: String(def.solidez || '') === 'raiz'\n"),

    ('golpe/envAt: la caja de consulta pasa por la inversa de la matriz',
     "    // 2. Y aparece donde esta: se resta el desplazamiento a la caja de consulta y se prueba el mismo\n",
     "    // Una pieza de un rig no se limita a trasladarse: el rig la GIRA sobre su articulacion. Su\n"
     "    // matriz de mundo (s.model, la compone esqueletosPaso) es un giro RIGIDO, asi que la solidez\n"
     "    // no sale desplazando la caja de consulta sino pasandola por la INVERSA de esa matriz: alli la\n"
     "    // pieza vuelve a su celda de estampado y el bitset de siempre vale tal cual. Esto es lo que\n"
     "    // permite que la cabeza y las extremidades sean solidas DONDE SE LAS VE (BUG-AG4) sin\n"
     "    // inventarse ninguna caja — la caja ES el dibujo, no una aproximacion a su lado.\n"
     "    //\n"
     "    // La 3x3 de una matriz de pieza es ortonormal (solo giros), asi que su inversa es la\n"
     "    // TRASPUESTA: no hay que invertir nada. Se pasan las 8 esquinas y se toma su caja en local.\n"
     "    // Exacto en los cuartos de vuelta; en los angulos intermedios sale un pelo mas grande, que es\n"
     "    // el lado seguro (antes sobrar que faltar: lo que falta se traspasa).\n"
     "    var enLocal = new Float64Array(6);       // reusada: esto se llama varias veces por frame y por eje\n"
     "    function cajaEnLocal(m, T, fx0, fy0, fz0, fx1, fy1, fz1) {\n"
     "      var tx = m[12] * T, ty = m[13] * T, tz = m[14] * T;\n"
     "      var x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;\n"
     "      for (var c = 0; c < 8; c++) {\n"
     "        // El +1 no es un desliz: fx1 es el INDICE de un voxel fino y la caja llega a su borde lejano.\n"
     "        var px = ((c & 1) ? fx1 + 1 : fx0) - tx,\n"
     "            py = ((c & 2) ? fy1 + 1 : fy0) - ty,\n"
     "            pz = ((c & 4) ? fz1 + 1 : fz0) - tz;\n"
     "        var qx = m[0] * px + m[1] * py + m[2] * pz;    // R^T · p, por columnas\n"
     "        var qy = m[4] * px + m[5] * py + m[6] * pz;\n"
     "        var qz = m[8] * px + m[9] * py + m[10] * pz;\n"
     "        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;\n"
     "        if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;\n"
     "        if (qz < z0) z0 = qz; if (qz > z1) z1 = qz;\n"
     "      }\n"
     "      enLocal[0] = x0; enLocal[1] = y0; enLocal[2] = z0;\n"
     "      enLocal[3] = x1; enLocal[4] = y1; enLocal[5] = z1;\n"
     "      return enLocal;\n"
     "    }\n"
     "    // Una pieza entra en el sondeo fino si la mueve algo: el vector de `seguir` o la matriz de un\n"
     "    // rig. Devuelve 0 (no), 1 (traslacion) o 2 (matriz), que es lo que decide la rama de abajo.\n"
     "    function comoSeMueve(s) {\n"
     "      if (s._rig) {\n"
     "        if (!s.model) return 0;                                  // recien creada, aun sin posar\n"
     "        if (s._rig.soloRaiz && !s._rigRaiz) return 0;             // valvula: solo el torso\n"
     "        return 2;\n"
     "      }\n"
     "      return desplazada(s) ? 1 : 0;\n"
     "    }\n"
     "\n"
     "    // 2. Y aparece donde esta: se resta el desplazamiento a la caja de consulta y se prueba el mismo\n"),

    ('golpe: la rama de rig, y la de siempre intacta',
     "        var s = ests[i];\n"
     "        if (!desplazada(s)) continue;\n"
     "        var cAtr = tabla[s.key]; if (cAtr && cAtr.atravesable) continue;\n"
     "        var g = origColl(s); if (!g) continue;\n"
     "        var q = s._sig, d = g.fdim, E = s.esc || 1;\n"
     "        var bx = s.ox * T + Math.round(q.x * T), by = s.oy * T + Math.round(q.y * T), bz = s.oz * T + Math.round(q.z * T);\n"
     "        // El bitset es el de la pieza a tamaño 1: la caja del mundo baja a coordenadas de la pieza\n"
     "        // dividiendo por la escala. Con esc 1 el divisor sobra y el bucle caliente queda igual.\n"
     "        var x0, x1, y0, y1, z0, z1;\n"
     "        if (E === 1) {\n",
     "        var s = ests[i];\n"
     "        var mueve = comoSeMueve(s);\n"
     "        if (!mueve) continue;\n"
     "        var cAtr = tabla[s.key]; if (cAtr && cAtr.atravesable) continue;\n"
     "        var g = origColl(s); if (!g) continue;\n"
     "        var d = g.fdim, E = s.esc || 1;\n"
     "        var x0, x1, y0, y1, z0, z1;\n"
     "        if (mueve === 2) {\n"
     "          // Rig: la caja va a coordenadas de la pieza por la inversa, y de ahi a indices. Los\n"
     "          // bordes se redondean HACIA FUERA (floor abajo, ceil arriba) porque lo que se pregunta\n"
     "          // es que voxeles TOCA la caja, no en cual cae su esquina.\n"
     "          var L = cajaEnLocal(s.model, T, fx0, fy0, fz0, fx1, fy1, fz1);\n"
     "          var ax = s.ox * T, ay = s.oy * T, az = s.oz * T;\n"
     "          x0 = Math.max(Math.floor((L[0] - ax) / E), 0); x1 = Math.min(Math.ceil((L[3] - ax) / E) - 1, d[0] - 1);\n"
     "          y0 = Math.max(Math.floor((L[1] - ay) / E), 0); y1 = Math.min(Math.ceil((L[4] - ay) / E) - 1, d[1] - 1);\n"
     "          z0 = Math.max(Math.floor((L[2] - az) / E), 0); z1 = Math.min(Math.ceil((L[5] - az) / E) - 1, d[2] - 1);\n"
     "        } else {\n"
     "          // `seguir`: traslacion pura. Byte por byte lo de siempre, solo que sangrado un nivel mas.\n"
     "          var q = s._sig;\n"
     "          var bx = s.ox * T + Math.round(q.x * T), by = s.oy * T + Math.round(q.y * T), bz = s.oz * T + Math.round(q.z * T);\n"
     "          // El bitset es el de la pieza a tamaño 1: la caja del mundo baja a coordenadas de la pieza\n"
     "          // dividiendo por la escala. Con esc 1 el divisor sobra y el bucle caliente queda igual.\n"
     "          if (E === 1) {\n"),

    ('golpe: la rama de siempre, un nivel mas adentro',
     "          x0 = Math.max(fx0 - bx, 0); x1 = Math.min(fx1 - bx, d[0] - 1);\n"
     "          y0 = Math.max(fy0 - by, 0); y1 = Math.min(fy1 - by, d[1] - 1);\n"
     "          z0 = Math.max(fz0 - bz, 0); z1 = Math.min(fz1 - bz, d[2] - 1);\n"
     "        } else {\n"
     "          x0 = Math.max(Math.floor((fx0 - bx) / E), 0); x1 = Math.min(Math.floor((fx1 - bx) / E), d[0] - 1);\n"
     "          y0 = Math.max(Math.floor((fy0 - by) / E), 0); y1 = Math.min(Math.floor((fy1 - by) / E), d[1] - 1);\n"
     "          z0 = Math.max(Math.floor((fz0 - bz) / E), 0); z1 = Math.min(Math.floor((fz1 - bz) / E), d[2] - 1);\n"
     "        }\n"
     "        if (x0 > x1 || y0 > y1 || z0 > z1) continue;\n",
     "            x0 = Math.max(fx0 - bx, 0); x1 = Math.min(fx1 - bx, d[0] - 1);\n"
     "            y0 = Math.max(fy0 - by, 0); y1 = Math.min(fy1 - by, d[1] - 1);\n"
     "            z0 = Math.max(fz0 - bz, 0); z1 = Math.min(fz1 - bz, d[2] - 1);\n"
     "          } else {\n"
     "            x0 = Math.max(Math.floor((fx0 - bx) / E), 0); x1 = Math.min(Math.floor((fx1 - bx) / E), d[0] - 1);\n"
     "            y0 = Math.max(Math.floor((fy0 - by) / E), 0); y1 = Math.min(Math.floor((fy1 - by) / E), d[1] - 1);\n"
     "            z0 = Math.max(Math.floor((fz0 - bz) / E), 0); z1 = Math.min(Math.floor((fz1 - bz) / E), d[2] - 1);\n"
     "          }\n"
     "        }\n"
     "        if (x0 > x1 || y0 > y1 || z0 > z1) continue;\n"),

    ('envBox: la salida rapida cuenta tambien los rigs',
     "      if (!nDesplazados) return false;\n"
     "      return golpe(fx0, fy0, fz0, fx1, fy1, fz1);\n",
     "      if (!nDesplazados && !nPosadas) return false;\n"
     "      return golpe(fx0, fy0, fz0, fx1, fy1, fz1);\n"),

    ('envAt: romper una pieza de rig donde se la ve',
     "      var s = origAt(px, py, pz);\n"
     "      if (s || !nDesplazados) return s;\n"
     "      var T = MC_T, fx = Math.floor(px * T), fy = Math.floor(py * T), fz = Math.floor(pz * T);\n"
     "      var ests = mc.structures;\n"
     "      for (var i = 0; i < ests.length; i++) {\n"
     "        var e = ests[i];\n"
     "        if (!desplazada(e)) continue;\n"
     "        var g = origColl(e); if (!g) continue;\n"
     "        var q = e._sig, d = g.fdim, E = e.esc || 1;\n"
     "        var lx = fx - (e.ox * T + Math.round(q.x * T)), ly = fy - (e.oy * T + Math.round(q.y * T)), lz = fz - (e.oz * T + Math.round(q.z * T));\n"
     "        if (E !== 1) { lx = Math.floor(lx / E); ly = Math.floor(ly / E); lz = Math.floor(lz / E); }\n",
     "      var s = origAt(px, py, pz);\n"
     "      if (s || (!nDesplazados && !nPosadas)) return s;\n"
     "      var T = MC_T, fx = Math.floor(px * T), fy = Math.floor(py * T), fz = Math.floor(pz * T);\n"
     "      var ests = mc.structures;\n"
     "      for (var i = 0; i < ests.length; i++) {\n"
     "        var e = ests[i];\n"
     "        var mueve = comoSeMueve(e);\n"
     "        if (!mueve) continue;\n"
     "        var g = origColl(e); if (!g) continue;\n"
     "        var d = g.fdim, E = e.esc || 1, lx, ly, lz;\n"
     "        if (mueve === 2) {\n"
     "          // Aqui el punto es UNO, no una caja: se pasa por la inversa y se trunca. Sin esto habria\n"
     "          // que apuntar al brazo donde estaba estampado para romperlo, no donde lo ves.\n"
     "          var m = e.model, ux = px * T - m[12] * T, uy = py * T - m[13] * T, uz = pz * T - m[14] * T;\n"
     "          lx = Math.floor((m[0] * ux + m[1] * uy + m[2] * uz - e.ox * T) / E);\n"
     "          ly = Math.floor((m[4] * ux + m[5] * uy + m[6] * uz - e.oy * T) / E);\n"
     "          lz = Math.floor((m[8] * ux + m[9] * uy + m[10] * uz - e.oz * T) / E);\n"
     "        } else {\n"
     "          var q = e._sig;\n"
     "          lx = fx - (e.ox * T + Math.round(q.x * T)); ly = fy - (e.oy * T + Math.round(q.y * T)); lz = fz - (e.oz * T + Math.round(q.z * T));\n"
     "          if (E !== 1) { lx = Math.floor(lx / E); ly = Math.floor(ly / E); lz = Math.floor(lz / E); }\n"
     "        }\n"),

    ('envColl: el comentario ya no dice que las extremidades sean fantasmas',
     "    // Y con ella se van las EXTREMIDADES de un agente articulado, que no son solidas nunca: el rig\n"
     "    // las GIRA y estos envoltorios solo saben trasladar, asi que su caja no acompañaria al dibujo —\n"
     "    // y una caja invisible donde no hay brazo es peor que ningun brazo. El agente choca por su\n"
     "    // raiz, que si lleva _sig y si es solida donde se la ve.\n",
     "    // Y con ella se van las piezas de un agente articulado: su ancla es la celda donde se las\n"
     "    // estampo, y el rig las dibuja en otro sitio. Su solidez la pone golpe(), abajo, pasando la\n"
     "    // caja por la inversa de su matriz (BUG-AG4). Esto de aqui solo apaga el ancla vacia.\n"),
]


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc.get('code')
    if not isinstance(code, str):
        sys.exit('%s no tiene "code": ¿es el snippet que creo que es?' % RUTA)

    hechos, saltados = [], []
    for nombre, original, nuevo in CAMBIOS:
        if nuevo in code:
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
