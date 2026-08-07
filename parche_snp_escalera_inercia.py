#!/usr/bin/env python3
# BUG-ESC1 · «la escalera, cuando se sube y hay movimiento lateral, este se conserva, por lo que es
# dificil subir por ella; si subo ladeado a ella sin darle a avanzar, por ella se mueve solo el
# jugador y tiende a caerse. Al montar en la escalera no deberia de haber ninguna inercia».
#
# La causa NO esta en el codigo de trepar: esta en QUE RAMA de app.js corre mientras cuelgas.
# `aplicarTrepado` deja `mc.onGround = false` (agarrado no pisas nada, y asi la gravedad no se
# acumula), y app.js elige el mando horizontal justo por ahi:
#
#     if(mc.onGround || !mc.airControl){ ...  vel = teclas * velocidad, y 0 si no hay teclas
#     } else { ...                            air-strafe estilo Quake: la velocidad NO se reescribe
#
# O sea que colgado se entra SIEMPRE por la rama de aire, que ni reescribe la velocidad desde las
# teclas ni tiene rozamiento: la velocidad lateral con la que llegaste a la escalera se conserva
# entera, frame tras frame, y te saca de ella sin que toques nada. Es exactamente lo reportado.
#
# Arreglo: agarrado, el mando horizontal es el de TIERRA. Se le dice a `orig(dt)` por que rama tiene
# que salir y nada mas; quien decide el `onGround` de verdad sigue siendo la fisica (y `aplicarTrepado`
# justo despues). Y NO se pierde el saltar de lado desde la escalera: con espacio pulsado
# `sondearAgarre()` devuelve null, asi que no hay agarre, no se toca nada, y el impulso lateral es el
# que marquen A/D en ese momento.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE: si ya esta puesto, no toca
# nada y lo dice. Solo cambia `code`; el resto del documento se reescribe tal cual.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    'data/snippets/mundo-autoarranque.json')

MARCA = 'BUG-ESC1'

VIEJO = '''      try {
        orig(dt);                                         // la fisica de siempre, intacta
      } finally {'''

NUEVO = '''      // BUG-ESC1 · agarrado a una escalera el mando horizontal es el de TIERRA, no el del aire.
      // aplicarTrepado deja mc.onGround en false (colgado no se pisa nada, y asi la gravedad no se
      // acumula), y app.js reparte el mando horizontal justo por ese booleano: con onGround la
      // velocidad se REESCRIBE desde las teclas cada frame (y es 0 exacto sin teclas); sin el se va
      // al air-strafe estilo Quake, que no la reescribe y en el aire no tiene rozamiento. Colgado se
      // entraba siempre por ahi, asi que la velocidad lateral con la que llegabas a la escalera se
      // conservaba entera y te sacaba de ella sin tocar una tecla.
      //
      // Se toca SOLO el rato que dura orig(dt): quien decide el onGround de verdad sigue siendo la
      // fisica, y aplicarTrepado lo vuelve a poner en false justo despues. Y no se pierde el saltar
      // de lado desde la escalera: con espacio pulsado sondearAgarre() devuelve null, o sea que no
      // hay agarre, esto no se ejecuta, y el impulso lateral es el que marquen A/D en ese momento.
      if (agarre && !mc.onGround) mc.onGround = true;
      try {
        orig(dt);                                         // la fisica de siempre, intacta
      } finally {'''


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    if VIEJO not in code:
        print('ABORTA: no encuentro la llamada a orig(dt) del envoltorio de mcUpdate '
              '(¿lo editó el dueño?). No se toca el snippet.', file=sys.stderr)
        return 1

    code = code.replace(VIEJO, NUEVO, 1)
    doc['code'] = code

    # Guardado atomico, como todo lo que escribe en data/.
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: colgado de una escalera manda el horizontal de tierra (sin inercia lateral)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
