#!/usr/bin/env python3
# BUG-RS22 · «el observador mirando una placa de presión pisada pulsa solo cada ~1 s».
#
# La causa no es el observador: `alPisar` es un FLANCO (salta al ENTRAR en la celda) y no existe el
# flanco contrario, así que la placa se sostiene con su `pulso`. Cuando el pulso vence, la placa se
# suelta, el despachador vuelve a verla como celda+clave NUEVA y la re-enciende el mismo frame: el
# observador ve ese ciclo y pulsa. Aquí se añade la capacidad que faltaba, `alSeguirPisando(c)`, que
# se dispara CADA tick mientras la entidad siga dentro (o encima) de la celda, para que el material
# pueda re-armarse solo sin cambiar de estado.
#
# El snippet tiene DOS COPIAS VIVAS (CLAUDE.md): ésta es la del dueño, editada en vivo, así que se
# parchea quirúrgicamente y NUNCA se reescribe entero. Idempotente por MARCA: correrlo dos veces
# dice «nada que hacer».
#
#   python3 parche_snp_placa.py
import json, os, sys, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data/snippets/mundo-autoarranque.json')

# (marca, viejo, nuevo). La MARCA es un trozo del texto nuevo que no está en el viejo: si ya
# aparece en el fichero, ese cambio está puesto y se salta.
CAMBIOS = [

    # ── 1 · la cabecera de opciones, que es lo que lee el dueño ───────────────────────────────
    ('alSeguirPisando(c) (CADA tick',
     "  //             alPisar(c) (UNA vez al entrar en la celda; c.quien = 'jugador' | 'agente')",
     "  //             alPisar(c) (UNA vez al entrar en la celda; c.quien = 'jugador' | 'agente')\n"
     "  //             alSeguirPisando(c) (CADA tick mientras siga dentro; mismo payload, sin `veces`)"),

    # ── 2 · el normalizador de define() ───────────────────────────────────────────────────────
    ("alSeguirPisando: (typeof cfg.alSeguirPisando",
     "      alPisar: (typeof cfg.alPisar === 'function') ? cfg.alPisar : null,",
     "      alPisar: (typeof cfg.alPisar === 'function') ? cfg.alPisar : null,\n"
     "      // Continuo, no de flanco: lo que sostiene una placa de presion mientras la ocupas.\n"
     "      alSeguirPisando: (typeof cfg.alSeguirPisando === 'function') ? cfg.alSeguirPisando : null,"),

    # ── 3 · «no hace nada»: sin esto, un define() que SOLO trae la capacidad nueva se rechaza ──
    ('!norm.alSeguirPisando',
     "    if (!norm.trepable && !norm.alPisar && !norm.impulso && !norm.velocidad && !norm.deslizamiento && !norm.mirar && !norm.seguir && !norm.atravesable && !norm.luzPasa && !norm.luzTapa) {\n"
     "      console.warn('game.bloques.define(\"' + clave + '\"): sin trepable, atravesable, luz, impulso, velocidad, deslizamiento, seguir ni alPisar no hace nada.');",
     "    if (!norm.trepable && !norm.alPisar && !norm.alSeguirPisando && !norm.impulso && !norm.velocidad && !norm.deslizamiento && !norm.mirar && !norm.seguir && !norm.atravesable && !norm.luzPasa && !norm.luzTapa) {\n"
     "      console.warn('game.bloques.define(\"' + clave + '\"): sin trepable, atravesable, luz, impulso, velocidad, deslizamiento, seguir, alPisar ni alSeguirPisando no hace nada.');"),

    # ── 4 · el interruptor del sondeo: si nadie escucha, la celda de los pies ni se mira ───────
    ('tabla[k].alSeguirPisando',
     "    hayPisables = Object.keys(tabla).some(function (k) { return tabla[k].alPisar || tabla[k].impulso; });",
     "    hayPisables = Object.keys(tabla).some(function (k) { return tabla[k].alPisar || tabla[k].alSeguirPisando || tabla[k].impulso; });"),

    # ── 5 · el ayudante compartido + el disparo del JUGADOR ───────────────────────────────────
    ('function seguirPisando(donde',
     "    if (dentro && !(abajo && dentro.celda === abajo.celda)) cfg = pisarCelda(dentro, dentroPrev, velEntrada) || cfg;\n"
     "    dentroPrev = dentro;\n"
     "    return cfg;\n"
     "  }",
     "    if (dentro && !(abajo && dentro.celda === abajo.celda)) cfg = pisarCelda(dentro, dentroPrev, velEntrada) || cfg;\n"
     "    dentroPrev = dentro;\n"
     "    // ...y lo CONTINUO, que es otra pregunta: no «has entrado» sino «sigues ahi». Se salta la\n"
     "    // de dentro cuando cae en la misma celda que la de abajo, igual que arriba.\n"
     "    seguirPisando(abajo, 'jugador', null);\n"
     "    if (dentro && !(abajo && dentro.celda === abajo.celda)) seguirPisando(dentro, 'jugador', null);\n"
     "    return cfg;\n"
     "  }\n"
     "  // ── Quedarse encima: `alSeguirPisando` ────────────────────────────────────────────────────\n"
     "  // `alPisar` es un FLANCO: salta al ENTRAR en la celda y nunca mas. Con solo eso no se puede\n"
     "  // sostener un estado, porque el flanco contrario NO EXISTE: nadie avisa de que te has bajado.\n"
     "  // Una placa de presion tenia que apañarse soltandose sola pasado su `pulso`, y el despachador\n"
     "  // la volvia a encender el mismo frame (el flanco es celda+CLAVE, y la clave la acababa de\n"
     "  // cambiar ella misma): el observador que la miraba veia ese ciclo como un cambio de estado y\n"
     "  // pulsaba cada ~1 s con el jugador quieto encima — BUG-RS22. Esto es lo contrario de alPisar:\n"
     "  // se dispara CADA tick mientras la entidad siga dentro (o encima), asi el material re-arma lo\n"
     "  // suyo por su cuenta y el bloque no parpadea. Sin `veces`: para contar esta alPisar.\n"
     "  // Acepta las dos formas de payload que hay en el snippet: la del jugador (pieEn/pieDentro,\n"
     "  // que trae el material en `.m`) y la de los agentes (tocaPie, que lo trae plano).\n"
     "  function seguirPisando(donde, quien, agente) {\n"
     "    if (!donde) return;\n"
     "    var m = donde.m || donde, cfg = m.cfg;\n"
     "    if (!cfg || !cfg.alSeguirPisando) return;\n"
     "    var c = donde.celda.split(',');\n"
     "    try {\n"
     "      cfg.alSeguirPisando({ x: +c[0], y: +c[1], z: +c[2], clave: m.clave, cfg: cfg,\n"
     "                            pos: donde.pos || mc.pos, quien: quien, agente: agente || null });\n"
     "    } catch (e) {\n"
     "      avisar('el alSeguirPisando de ' + m.clave + ' lanzó: ' + (e && e.message ? e.message : e));\n"
     "    }\n"
     "  }"),

    # ── 6 · el disparo de los AGENTES, en el mismo sitio que su alPisar ────────────────────────
    ("seguirPisando(abajo, 'agente'",
     "    dispararPisada(rig, 'pisoAbajo', abajo);\n"
     "    dispararPisada(rig, 'pisoDentro', (abajo && dentro && dentro.celda === abajo.celda) ? null : dentro);\n"
     "  }",
     "    dispararPisada(rig, 'pisoAbajo', abajo);\n"
     "    dispararPisada(rig, 'pisoDentro', (abajo && dentro && dentro.celda === abajo.celda) ? null : dentro);\n"
     "    // Y lo continuo, que un bicho tambien sostiene una placa mientras siga encima. La valvula\n"
     "    // de escape es la misma de arriba: fisica:{placas:false} apaga las dos cosas a la vez.\n"
     "    var quienAg = { id: rig.id, nombre: rig.nombre };\n"
     "    seguirPisando(abajo, 'agente', quienAg);\n"
     "    if (!(abajo && dentro && dentro.celda === abajo.celda)) seguirPisando(dentro, 'agente', quienAg);\n"
     "  }"),

    # ── 7 · las dos etiquetas de diagnostico (game.bloques.lista() y rayos-X) ──────────────────
    ("partes.push('alSeguirPisando')",
     "    if (cfg.alPisar) partes.push('alPisar');",
     "    if (cfg.alPisar) partes.push('alPisar');\n"
     "    if (cfg.alSeguirPisando) partes.push('alSeguirPisando');"),

    ("p.push('sigue pisando')",
     "    if (cfg.alPisar) p.push('alPisar');",
     "    if (cfg.alPisar) p.push('alPisar');\n"
     "    if (cfg.alSeguirPisando) p.push('sigue pisando');"),
]


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    hechos, saltados = [], []
    for marca, viejo, nuevo in CAMBIOS:
        etiqueta = marca[:38]
        if marca in code:
            saltados.append(etiqueta)
            continue
        n = code.count(viejo)
        if n != 1:
            print('ABORTA: el ancla de «%s» aparece %d veces (esperaba 1). No se toca nada.' % (etiqueta, n))
            return 1
        code = code.replace(viejo, nuevo, 1)
        hechos.append(etiqueta)

    if not hechos:
        print('nada que hacer: los %d cambios ya estaban puestos.' % len(saltados))
        return 0

    doc['code'] = code
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.snp-', suffix='.json')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        os.replace(tmp, RUTA)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise

    print('aplicados %d cambio(s):' % len(hechos))
    for h in hechos:
        print('  + ' + h)
    if saltados:
        print('ya estaban (%d): %s' % (len(saltados), ', '.join(saltados)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
