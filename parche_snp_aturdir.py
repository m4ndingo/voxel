#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BUG-AG5 · «Shock»: un agente recien empujado no anda durante un rato.

El dueño lo reporto asi: «cuando un agente es empujado por el piston redstone, si el agente sigue
avanzando en direccion al piston acaba ganando el movimiento del agente sobre el empuje del piston,
por lo que si por ejemplo tenia que desplazarlo 16 al final del movimiento puede que no llegue a ese
valor o se suba encima del piston abierto. Lo ideal es que al ser empujado el agente por el piston el
agente se quede unos instantes, por ejemplo un segundo, en "shock", sin moverse».

Son dos dueños del mismo cuerpo en el mismo frame: `apartar()` del piston (que llama a
game.esqueletos.desplazar) y `pasoSeguir` de la libreria (que le hace andar). El piston da su
empujon de una vez, pero el agente recupera terreno andando frame tras frame; y andando CONTRA la
cabeza recien salida, `asentar()` la trata como un escalon y se le sube encima.

Lo que se añade aqui es la CAPACIDAD, no la politica: `game.esqueletos.aturdir(rig, segundos)`. Quien
empuja decide si aturde y cuanto (el piston lo hace en redstone/redstone-piezas.js). Al reves —que
desplazar() aturdiera solo— romperia el contrato de desplazar, que es un primitivo de un solo tiro, y
meteria una regla del piston dentro del motor de agentes (CLAUDE.md §0).

⚠️ El shock NO se implementa saltandose pasoSeguir. Esa funcion, ademas de andar, hace la cuenta de
`nDesplazados` que mantiene vivas las envolturas de colision: saltarsela convertiria al agente en un
fantasma justo mientras lo empujan. Se la llama con dt = 0, que es lo mismo que «este frame no ha
pasado tiempo para el»: el paso sale exactamente 0, `g.por`/`g.pide` se siguen actualizando (te ve
igual, solo que no se mueve) y la cuenta se hace. Gratis salen ademas las piernas quietas, porque el
ciclo de andar avanza con la distancia recorrida.

Lo que NO se congela: la gravedad, el bote, el patinaje y el golpe (rig.mov), que corren con el dt de
verdad. Un shock que apagara la gravedad dejaria al bicho flotando si lo empujan sobre un borde.

El snippet lo edita EN VIVO el dueño ⇒ este parche es idempotente y aborta si un ancla no aparece
exactamente una vez.

ORDEN: independiente de parche_snp_escala_agente.py y parche_snp_solidez_piezas.py — ninguna de sus
anclas se toca con las de aquellos. Da igual antes que despues.
"""
import json
import os
import sys
import tempfile

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    'data', 'snippets', 'mundo-autoarranque.json')

# (nombre, original, parcheado) — cada uno se salta si `parcheado` ya esta.
CAMBIOS = [

    ('cabecera: aturdir() en la chuleta de la API',
     "//   game.esqueletos.desplazar(rig, dx,dy,dz)    ← muevelo con la colision de siempre; false si no cabe\n",
     "//   game.esqueletos.desplazar(rig, dx,dy,dz)    ← muevelo con la colision de siempre; false si no cabe\n"
     "//   game.esqueletos.aturdir(rig, segundos)      ← «me han empujado»: deja de andar ese rato\n"),

    ('ATURDIR_DEF: cuanto dura un shock si no se dice',
     "  var EMP_FUERZA = 8, EMP_FRENO = 0.15, EMP_SALTO = 4.5;\n",
     "  var EMP_FUERZA = 8, EMP_FRENO = 0.15, EMP_SALTO = 4.5;\n"
     "  var ATURDIR_DEF = 1;   // segundos de shock por defecto (BUG-AG5): el «por ejemplo un segundo»\n"),

    ('crear: rig.aturdido',
     "      mov: null,   // lo que el cuerpo lleva encima (golpe, bote, caida, patinaje); null = pegado al suelo\n",
     "      mov: null,   // lo que el cuerpo lleva encima (golpe, bote, caida, patinaje); null = pegado al suelo\n"
     "      aturdido: 0, // segundos que le quedan sin andar por su cuenta (BUG-AG5); la fisica sigue\n"),

    ('esqueletosPaso: el shock se descuenta y el paso vale 0',
     "      var mar = (pie && rig.fis.marcha && pie.cfg && pie.cfg.velocidad) ? pie.cfg.velocidad : 1;\n"
     "      pasoSeguir(sr, rig.cuerpo, g, G, dt, hay, tx, ty, tz,\n"
     "                 rig.fis ? { fac: mar, drop: rig.fis.caida } : null);\n",
     "      var mar = (pie && rig.fis.marcha && pie.cfg && pie.cfg.velocidad) ? pie.cfg.velocidad : 1;\n"
     "      // Aturdido (BUG-AG5): el paso se da con dt = 0, NO se salta. pasoSeguir es tambien quien\n"
     "      // cuenta `nDesplazados`, o sea quien mantiene vivas las envolturas de colision: saltarsela\n"
     "      // volveria fantasma al agente justo en el frame en que lo estan empujando. Con dt = 0 el\n"
     "      // avance sale exactamente 0, la cuenta se hace y `g.por`/`g.pide` se siguen actualizando —\n"
     "      // te sigue viendo, solo que no se mueve. Y como el ciclo de andar avanza con la DISTANCIA,\n"
     "      // las piernas se paran solas sin una linea mas.\n"
     "      var dtPaso = dt;\n"
     "      if (rig.aturdido > 0) { rig.aturdido -= dt; if (rig.aturdido < 0) rig.aturdido = 0; dtPaso = 0; }\n"
     "      pasoSeguir(sr, rig.cuerpo, g, G, dtPaso, hay, tx, ty, tz,\n"
     "                 rig.fis ? { fac: mar, drop: rig.fis.caida } : null);\n"),

    ('lista(): la columna del shock',
     "      alto: rig.mov ? Math.round(rig.mov.alto * 100) / 100 : 0,\n",
     "      alto: rig.mov ? Math.round(rig.mov.alto * 100) / 100 : 0,\n"
     "      shock: Math.round((rig.aturdido || 0) * 100) / 100,   // «no anda» != «no puede llegar»\n"),

    ('la API: aturdir()',
     "    lista: esqueletos_,\n",
     "    lista: esqueletos_,\n"
     "    // «Me han empujado, me quedo quieto un rato». La capacidad la pone la LIBRERIA y la politica\n"
     "    // la pone quien empuja: el piston llama a esto justo despues de desplazar() (BUG-AG5). Va\n"
     "    // aparte de desplazar a proposito — aquello es un primitivo de un solo tiro, y hay quien\n"
     "    // mueve a un agente (un script colocandolo) sin querer dejarlo tonto un segundo.\n"
     "    // Se queda con el plazo MAS LARGO: un segundo empujon no puede acortar el shock del primero.\n"
     "    // aturdir(rig, 0) lo despierta ahora mismo, que es la valvula en el otro sentido.\n"
     "    aturdir: function (rig, segundos) {\n"
     "      var r = rigDe(rig);\n"
     "      if (!r) { console.warn('game.esqueletos.aturdir: no hay ning\\u00fan agente con id ' + rig + '.'); return false; }\n"
     "      var s = num(segundos, ATURDIR_DEF);\n"
     "      if (!(s > 0)) { r.aturdido = 0; return true; }\n"
     "      if (s > (r.aturdido || 0)) r.aturdido = s;\n"
     "      return true;\n"
     "    },\n"),
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
