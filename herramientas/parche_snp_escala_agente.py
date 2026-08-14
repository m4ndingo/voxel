#!/usr/bin/env python3
"""REQ-AGESC1 · «escala del agente», para hacer enanos y gigantes.

El dueño edita data/snippets/mundo-autoarranque.json EN VIVO, así que esto es un parche idempotente:
se puede correr las veces que haga falta y sobre una copia ya parcheada no cambia nada.

Qué toca, y por qué esas cinco costuras y no otras. Un agente articulado no es una malla: es un
puñado de piezas estampadas por separado y colocadas unas respecto a otras. Escalarlo es, por tanto,
escalar DOS cosas a la vez — la geometría de cada pieza y las distancias entre ellas. Si se escala
solo lo primero el bicho se desmonta (cabeza flotando, piernas metidas en el torso).

  1. ESC     · lee def.escala una vez, acotado (un 0 o un negativo harían desaparecer al agente).
  2. baseY   · la altura de los pies se mide desde `en`, así que también escala.
  3. P       · la posición de cada pieza = separación entre piezas.
  4. piv     · el pivote viene en bloques dentro de la caja de la pieza; si la caja crece y él no,
               el brazo gira sobre un punto que ya no es su hombro.
  5. estampe · mcStampStruct(..., ESC) — la escala de la malla y del bitset (app.js, REQ-AGESC1).

rig.esc queda guardado en el rig para que el resto (física, empuje, editor) pueda consultarlo.

El PREVIEW del editor (prepararEsqueleto) NO escala: la escala es del juego. Ver REVERTIR, abajo.
"""
import json
import os
import sys
import tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data', 'snippets', 'mundo-autoarranque.json')

# (nombre, viejo, nuevo) — cada uno se salta si `nuevo` ya está presente.
CAMBIOS = [
    ('ESC: se lee la escala una vez',
     "    x = Math.round(num(x, 0)); y = Math.round(num(y, 0)); z = Math.round(num(z, 0));\n",
     "    x = Math.round(num(x, 0)); y = Math.round(num(y, 0)); z = Math.round(num(z, 0));\n"
     "    // Escala del agente (REQ-AGESC1): enanos y gigantes. Multiplica la geometria de cada pieza Y las\n"
     "    // distancias entre ellas, que es lo que hace que el bicho crezca entero en vez de desmontarse.\n"
     "    // Acotada a proposito: un 0 o un negativo lo harian desaparecer sin decir por que.\n"
     "    var ESC = num(def.escala, 1);\n"
     "    if (!(ESC > 0)) ESC = 1;\n"
     "    ESC = Math.max(0.1, Math.min(8, ESC));\n"),

    ('baseY: los pies se miden en `en`, que ahora escala',
     "    var baseY = y - pies;                       // altura (fraccionaria) de la esquina de la raiz\n",
     "    var baseY = y - pies * ESC;                 // altura (fraccionaria) de la esquina de la raiz (ya escalada)\n"),

    ('P: la separacion entre piezas escala con el agente',
     "        var P = [x + num(en[0], 0), baseY + num(en[1], 0), z + num(en[2], 0)];\n",
     "        var P = [x + num(en[0], 0) * ESC, baseY + num(en[1], 0) * ESC, z + num(en[2], 0) * ESC];\n"),

    ('piv + estampado: el pivote y la malla, a escala',
     "          return mcStampStruct(parte.clave, cel[0], cel[1], cel[2], parte.rot, true);\n",
     "          // El pivote va en bloques DENTRO de la caja de la pieza. Si la caja crece y el no, el brazo\n"
     "          // gira sobre un punto que ya no es su hombro: se le aplica la misma escala que a la malla.\n"
     "          if (parte.piv && ESC !== 1) parte.piv = [parte.piv[0] * ESC, parte.piv[1] * ESC, parte.piv[2] * ESC];\n"
     "          return mcStampStruct(parte.clave, cel[0], cel[1], cel[2], parte.rot, true, ESC);\n"),

    ('cuerpo: la caja con la que CHOCA tambien escala',
     "        var hw = Math.abs(num(C.ancho, 0.6)) * 0.5, hd = Math.abs(num(C.fondo, num(C.ancho, 0.6))) * 0.5;\n"
     "        var alto = Math.abs(num(C.alto, b[4] - b[1]));\n",
     "        // def.cuerpo viene en BLOQUES absolutos (la caja esbelta para que quepa por una puerta), asi que\n"
     "        // hay que escalarla a mano: si no, un gigante se veria enorme y chocaria como un zombie normal.\n"
     "        var hw = Math.abs(num(C.ancho, 0.6)) * 0.5 * ESC, hd = Math.abs(num(C.fondo, num(C.ancho, 0.6))) * 0.5 * ESC;\n"
     "        // El alto por defecto es la union de las piezas, que YA viene escalada: escalarlo otra vez lo\n"
     "        // aplicaria dos veces. Solo escala el alto que pide el documento.\n"
     "        var alto = (C.alto === undefined || C.alto === null) ? (b[4] - b[1]) : Math.abs(num(C.alto, 0)) * ESC;\n"),

    # ── Las piezas DESPLAZADAS (v1.18). Un agente articulado es exactamente eso: piezas con `_sig`.
    # El snippet re-implementa aqui el bucle de g.bits (no puede llamar a mcFineBoxHit: esa mira las
    # piezas en su ancla, no donde se las dibuja), asi que la correccion de escala hay que repetirla.
    # Sin esto un gigante se ve enorme pero frena —y se deja romper— con el bulto de un zombie normal.
    ('golpe: la pieza desplazada frena a su escala',
     "        var q = s._sig, d = g.fdim;\n"
     "        var bx = s.ox * T + Math.round(q.x * T), by = s.oy * T + Math.round(q.y * T), bz = s.oz * T + Math.round(q.z * T);\n"
     "        var x0 = Math.max(fx0 - bx, 0), x1 = Math.min(fx1 - bx, d[0] - 1); if (x0 > x1) continue;\n"
     "        var y0 = Math.max(fy0 - by, 0), y1 = Math.min(fy1 - by, d[1] - 1); if (y0 > y1) continue;\n"
     "        var z0 = Math.max(fz0 - bz, 0), z1 = Math.min(fz1 - bz, d[2] - 1); if (z0 > z1) continue;\n",
     "        var q = s._sig, d = g.fdim, E = s.esc || 1;\n"
     "        var bx = s.ox * T + Math.round(q.x * T), by = s.oy * T + Math.round(q.y * T), bz = s.oz * T + Math.round(q.z * T);\n"
     "        // El bitset es el de la pieza a tamaño 1: la caja del mundo baja a coordenadas de la pieza\n"
     "        // dividiendo por la escala. Con esc 1 el divisor sobra y el bucle caliente queda igual.\n"
     "        var x0, x1, y0, y1, z0, z1;\n"
     "        if (E === 1) {\n"
     "          x0 = Math.max(fx0 - bx, 0); x1 = Math.min(fx1 - bx, d[0] - 1);\n"
     "          y0 = Math.max(fy0 - by, 0); y1 = Math.min(fy1 - by, d[1] - 1);\n"
     "          z0 = Math.max(fz0 - bz, 0); z1 = Math.min(fz1 - bz, d[2] - 1);\n"
     "        } else {\n"
     "          x0 = Math.max(Math.floor((fx0 - bx) / E), 0); x1 = Math.min(Math.floor((fx1 - bx) / E), d[0] - 1);\n"
     "          y0 = Math.max(Math.floor((fy0 - by) / E), 0); y1 = Math.min(Math.floor((fy1 - by) / E), d[1] - 1);\n"
     "          z0 = Math.max(Math.floor((fz0 - bz) / E), 0); z1 = Math.min(Math.floor((fz1 - bz) / E), d[2] - 1);\n"
     "        }\n"
     "        if (x0 > x1 || y0 > y1 || z0 > z1) continue;\n",
     # Marca: BUG-AG4 parte este bucle en dos ramas y lo sangra un nivel mas, pero este comentario
     # sobrevive igual a los dos parches. Es lo que dice «la escala ya esta puesta aqui».
     "// dividiendo por la escala. Con esc 1 el divisor sobra y el bucle caliente queda igual.\n"),

    ('envAt: y se deja romper donde se la ve, a su escala',
     "        var q = e._sig, d = g.fdim;\n"
     "        var lx = fx - (e.ox * T + Math.round(q.x * T)), ly = fy - (e.oy * T + Math.round(q.y * T)), lz = fz - (e.oz * T + Math.round(q.z * T));\n",
     "        var q = e._sig, d = g.fdim, E = e.esc || 1;\n"
     "        var lx = fx - (e.ox * T + Math.round(q.x * T)), ly = fy - (e.oy * T + Math.round(q.y * T)), lz = fz - (e.oz * T + Math.round(q.z * T));\n"
     "        if (E !== 1) { lx = Math.floor(lx / E); ly = Math.floor(ly / E); lz = Math.floor(lz / E); }\n",
     # Marca: BUG-AG4 sangra esta linea un nivel mas. Sin el margen izquierdo vale para las dos.
     "if (E !== 1) { lx = Math.floor(lx / E); ly = Math.floor(ly / E); lz = Math.floor(lz / E); }"),

    ('rig.esc: el resto del motor puede consultarla',
     "      horneado: 0, eje: [0, 0, 0], cuerpo: null, G: null, plantado: [x, y, z]\n",
     "      horneado: 0, eje: [0, 0, 0], cuerpo: null, G: null, esc: ESC, plantado: [x, y, z]\n",
     # Marca: BUG-AG4 le añade una coma al final para colgar `soloRaiz` detras.
     "cuerpo: null, G: null, esc: ESC, plantado: [x, y, z]"),
]

# ── El preview del editor (prepararEsqueleto) NO lee la escala. BUG-AG6.
#
# Esto estuvo escalado y se deshizo a peticion del dueño: «no haría falta tener ahí en cuenta la
# escala, debería verse como siempre, la escala es en el juego». A escala 2 el maniquí salia
# DESMONTADO (cabeza, torso, piernas y brazos separados) y el panel es un maniquí, no el Mundo — que
# ya divergen a proposito en otra cosa (aqui la fase de andar la lleva el reloj y no la distancia).
#
# Van aparte de CAMBIOS porque son una VUELTA ATRAS, y ahi la comprobacion de idempotencia se
# invierte: el texto original es SUBCADENA del parcheado, asi que el `if nuevo in code` de arriba
# daria siempre "ya estaba" y no revertiria nunca. Se pregunta por lo parcheado, no por lo limpio.
#
# (nombre, parcheado, original) — cada uno se salta si `parcheado` ya no esta.
REVERTIR = [
    ('preview: la escala ya no se lee en prepararEsqueleto',
     "    for (var i = 0; i < def.piezas.length; i++) if (def.piezas[i] && def.piezas[i].pieza) brutas.push(def.piezas[i]);\n"
     "    // Misma escala y mismos topes que crearEsqueleto: el preview no puede enseñar otro tamaño que el Mundo.\n"
     "    var ESCP = num(def.escala, 1);\n"
     "    if (!(ESCP > 0)) ESCP = 1;\n"
     "    ESCP = Math.max(0.1, Math.min(8, ESCP));\n",
     "    for (var i = 0; i < def.piezas.length; i++) if (def.piezas[i] && def.piezas[i].pieza) brutas.push(def.piezas[i]);\n"),

    ('preview: la caja de cada pieza y su separacion, sin escalar',
     "          var L = ladosDeDibujo(c, rot);\n"
     "          if (ESCP !== 1) { ex *= ESCP; ey *= ESCP; ez *= ESCP; L = [L[0] * ESCP, L[1] * ESCP, L[2] * ESCP]; }\n",
     "          var L = ladosDeDibujo(c, rot);\n"),

    ('preview: el pivote, sin escalar',
     "          if (piv && ESCP !== 1) piv = [piv[0] * ESCP, piv[1] * ESCP, piv[2] * ESCP];\n"
     "          partes.push({\n"
     "            nombre: q.nombre || ('pieza ' + idx), clave: String(q.pieza), rot: rot,\n",
     "          partes.push({\n"
     "            nombre: q.nombre || ('pieza ' + idx), clave: String(q.pieza), rot: rot,\n"),
]


def main():
    if not os.path.exists(RUTA):
        sys.exit('no encuentro ' + RUTA)
    with open(RUTA, encoding='utf-8') as fh:
        doc = json.load(fh)
    code = doc['code']

    hechos, saltados = [], []
    for cambio in CAMBIOS:
        # La 4ª pieza, opcional, es la MARCA de «esto ya esta puesto». Hace falta cuando un parche
        # POSTERIOR reescribe el mismo bloque: parche_snp_solidez_piezas.py (BUG-AG4) parte el bucle
        # de `golpe` en dos ramas, y entonces `nuevo` ya no aparece literal aunque la escala siga ahi.
        # Sin marca, este parche abortaria contra un snippet perfectamente correcto. Se pregunta por
        # el trozo que sobrevive a los dos, no por el bloque entero.
        nombre, viejo, nuevo = cambio[0], cambio[1], cambio[2]
        marca = cambio[3] if len(cambio) > 3 else nuevo
        if marca in code:
            saltados.append(nombre)
            continue
        n = code.count(viejo)
        if n != 1:
            sys.exit('ANCLA "%s": esperaba 1 aparicion, encontradas %d. El dueño ha editado el snippet '
                     'por debajo; revisa a mano antes de insistir.' % (nombre, n))
        code = code.replace(viejo, nuevo)
        hechos.append(nombre)

    for nombre, parcheado, original in REVERTIR:
        n = code.count(parcheado)
        if n == 0:
            saltados.append(nombre)
            continue
        if n != 1:
            sys.exit('ANCLA "%s": esperaba 1 aparicion, encontradas %d. El dueño ha editado el snippet '
                     'por debajo; revisa a mano antes de insistir.' % (nombre, n))
        code = code.replace(parcheado, original)
        hechos.append(nombre)

    if not hechos:
        print('nada que hacer: el snippet ya estaba parcheado (%d cambios)' % len(saltados))
        return

    doc['code'] = code
    # Escritura atomica: el dueño puede tener el snippet abierto y el servidor sirviendolo.
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as fh:
            json.dump(doc, fh, ensure_ascii=False)
        os.replace(tmp, RUTA)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise

    for h in hechos:
        print('  ✓ ' + h)
    for s in saltados:
        print('  · ya estaba: ' + s)


if __name__ == '__main__':
    main()
