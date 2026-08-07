#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-DBG2 · El toast «Atascado» dice POR QUE, y si es un agente dice CUAL y QUE PIEZA.

El dueño lo pidio asi: «cuando aparece el toast "Atascado - ..." deberia de aparecer el motivo,
muchas veces queda claro que el atasco es por agente, deberia de haber una depuracion que indique
el motivo o mas bien, por que estas atascado, ocurre que un agente al avanzar con sus brazos
extendidos te atasca (es como un abrazo)». Y luego lo concreto: «si es una parte de un agente
quiero saber el agente y su parte».

Ahi esta el reparto de trabajo, y es la razon de que este parche exista en vez de resolverlo todo
en app.js: el motor sabe que le estorba UNA ESTRUCTURA FINA y sabe su clave cruda
('asset:assets/brazo-zombie.vox.json'), pero no tiene ni idea de que esa instancia concreta es el
brazo izquierdo del zombie de la esquina — la tabla de rigs vive aqui, en el snippet.

app.js abre el hueco `mcStuckExtra(s) => 'texto' | {texto,agente,agenteId}` (mismo trato que
mcXrayExtra: NO es un envoltorio, es un hueco vacio, asi que asignarlo no apila nada y ejecutar el
snippet dos veces no duplica nada) y lo llama UNA vez por atasco, en el flanco — no por frame.

El snippet lo edita EN VIVO el dueño ⇒ este parche es idempotente y aborta si un ancla no aparece
exactamente una vez.

⚠️ IDEMPOTENCIA: cada cambio se salta por su MARCA, no por su texto completo. Se hizo al reves y
duplico `quienAtasca` en el snippet vivo: el cambio 1 dejo de reconocerse a si mismo en cuanto el
cambio 2 le reescribio dos lineas por dentro, pero su ancla (`function etiquetaRayosX`) seguia ahi,
asi que volvio a insertar el bloque entero — y en JS gana la ultima declaracion, o sea la version
VIEJA. La marca es una cadena corta que solo existe si ese cambio ya paso y que los siguientes NO
tocan, asi que sobrevive a que le reescriban las tripas.

ORDEN: los cambios se aplican en cadena (2 y 4 reescriben lo que dejo 1). Independiente del resto de
parches: no comparte ni una ancla con ellos.
"""
import json
import os
import sys
import tempfile

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    'data', 'snippets', 'mundo-autoarranque.json')

# (nombre, marca, original, parcheado) — se salta si `marca` ya esta en el codigo.
CAMBIOS = [

    ('quienAtasca(): de una estructura al «brazo izq de Zombie»',
     "function quienAtasca(",
     "  function etiquetaRayosX(clave, s) {\n",
     "  // REQ-DBG2 · quien te esta atascando, dicho como lo diria una persona. app.js llama a esto con\n"
     "  // la instancia de estructura que solapa la caja del jugador; devolver '' significa «no lo se»,\n"
     "  // y entonces el motor se queda con la clave cruda, que sigue siendo mejor que nada.\n"
     "  //\n"
     "  // El caso que duele es el abrazo: dos piezas del MISMO agente te atrapan a la vez. Por eso se\n"
     "  // nombra siempre la pieza Y el agente — «el brazo izq de Zombie» y no «Zombie» a secas: con dos\n"
     "  // avisos identicos no se sabe si te agarran dos bichos o uno con los dos brazos.\n"
     "  function quienAtasca(s) {\n"
     "    if (!s) return '';\n"
     "    var rig = s._rig;\n"
     "    if (!rig) return '';                       // estructura normal (un mueble, una pared): no es cosa nuestra\n"
     "    var ps = rig.partes || [];\n"
     "    for (var i = 0; i < ps.length; i++)\n"
     "      if (ps[i].s === s) return '\\u00ab' + ps[i].nombre + '\\u00bb de ' + rig.nombre;\n"
     "    return 'una pieza de ' + rig.nombre;       // la pieza ya no esta en la lista (se esta remontando)\n"
     "  }\n"
     "\n"
     "  function etiquetaRayosX(clave, s) {\n"),

    # El dueño lo probo y se quedo igual: «no se identifica al agente que produce el atasco». Y tenia
    # razon — el aviso decia «antorcha» de personaje 1, y «personaje 1» no identifica a NADIE cuando
    # hay tres personaje 1 por el mapa: es el nombre de la definicion, no el del bicho concreto.
    ('quienAtasca(): el agente por su id de instancia, no solo por su nombre',
     "function quienEs(",
     "      if (ps[i].s === s) return '\\u00ab' + ps[i].nombre + '\\u00bb de ' + rig.nombre;\n"
     "    return 'una pieza de ' + rig.nombre;       // la pieza ya no esta en la lista (se esta remontando)\n"
     "  }\n",
     "      if (ps[i].s === s) return '\\u00ab' + ps[i].nombre + '\\u00bb de ' + quienEs(rig);\n"
     "    return 'una pieza de ' + quienEs(rig);     // la pieza ya no esta en la lista (se esta remontando)\n"
     "  }\n"
     "\n"
     "  // El id de la instancia, que ademas es ACCIONABLE: game.esqueletos.empujar(3) / .quitar(3) /\n"
     "  // .aturdir(3) aceptan justo ese numero, asi que del aviso se puede pasar a quitarselo de encima\n"
     "  // sin buscar nada. Mismo formato que ya usa el log al plantar: nombre (#id).\n"
     "  function quienEs(rig) {\n"
     "    return rig.nombre + (rig.id ? ' (#' + rig.id + ')' : '');\n"
     "  }\n"),

    ('enganchar mcStuckExtra donde se engancha mcXrayExtra',
     "window.mcStuckExtra",
     "    window.mcXrayExtra = etiquetaRayosX;\n",
     "    window.mcXrayExtra = etiquetaRayosX;\n"
     "    // Y el hueco hermano (REQ-DBG2): el motivo del toast «Atascado». Tampoco es un envoltorio.\n"
     "    window.mcStuckExtra = quienAtasca;\n"),

    # Y la ultima vuelta: el dueño miro game.atasco() y pregunto «la variable "agentes" es para
    # identificar los agentes o es otra cosa?». Era otra cosa (los NPC-cubo de mc.agents, ya
    # renombrados a `npcs` en app.js), pero destapo lo de verdad util: la identidad del agente solo
    # existia DENTRO de la frase del motivo.
    ('quienAtasca(): devolver objeto, para que el id salga como campo y no dentro de la frase',
     "function senas(",
     "      if (ps[i].s === s) return '\\u00ab' + ps[i].nombre + '\\u00bb de ' + quienEs(rig);\n"
     "    return 'una pieza de ' + quienEs(rig);     // la pieza ya no esta en la lista (se esta remontando)\n"
     "  }\n",
     "      if (ps[i].s === s) return senas(rig, '\\u00ab' + ps[i].nombre + '\\u00bb');\n"
     "    return senas(rig, 'una pieza');            // la pieza ya no esta en la lista (se esta remontando)\n"
     "  }\n"
     "\n"
     "  // Objeto y no cadena: el texto es para leerlo, `agenteId` es para USARLO. Ese numero es justo\n"
     "  // el que toman game.esqueletos.empujar(id) / .quitar(id) / .aturdir(id), y sacarlo de una frase\n"
     "  // como «brazo der» de personaje 1 (#1) obligaba a una expresion regular. app.js admite las dos\n"
     "  // formas, asi que esto no rompe a nadie que solo mire el texto.\n"
     "  function senas(rig, pieza) {\n"
     "    return { texto: pieza + ' de ' + quienEs(rig), agente: rig.nombre, agenteId: rig.id || 0 };\n"
     "  }\n"),
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
