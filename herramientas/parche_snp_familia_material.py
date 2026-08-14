#!/usr/bin/env python3
# BUG-SNP2 · falso positivo de BUG-SNP1: al abrir /map/empty, el snippet cantaba
#
#     game.bloques.define: no existe el material "hab:placa-on". ¿Querías "hab:palanca-on"?
#
# `hab:placa-on` existe de verdad (data/habitantes/placa-on.json); lo que pasa es que en un mundo
# vacio no esta COLOCADO, o sea que no esta en la paleta, y tendria que esperar en silencio. Pero
# `parecidos()` encuentra `hab:palanca-on` a distancia 2 (placa-on -> palaca-on -> palanca-on) y el
# tope en palabras de 8+ letras es 2, asi que lo lee como dedo torcido.
#
# El arreglo NO es apretar la distancia (romperia los typos de verdad), sino mirar una señal que la
# heuristica no estaba usando y que decide el caso sin ambiguedad: `placa` YA esta en la paleta, asi
# que `placa-on` es de su FAMILIA. El guion detras de un nombre conocido marca familia en todo el
# proyecto: placa/placa-on, cable/cable-on, boton/boton-on, puerta/puerta-abierta,
# antorcha/antorcha-apagada. 'palanca-on' no es pariente de 'placa', que es justo lo que distingue.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE: si ya esta puesto, no toca
# nada y lo dice. Solo cambia `code`; el resto del documento se reescribe tal cual.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data/snippets/mundo-autoarranque.json')

MARCA = 'function deLaFamilia('

AYUDA = '''  // ¿`corto` es un PARIENTE de algo que ya esta en la paleta? Un guion detras de un nombre conocido
  // marca familia en todo el proyecto: placa/placa-on, cable/cable-on, puerta/puerta-abierta,
  // antorcha/antorcha-apagada. 'palanca-on' NO es pariente de 'placa' (BUG-SNP2).
  function deLaFamilia(corto, conocidas) {
    for (var i = 0; i < conocidas.length; i++) {
      var k = nombreCorto(conocidas[i]);
      if (k && k !== corto && corto.indexOf(k + '-') === 0) return true;
    }
    return false;
  }
'''

# Ojo al punto de insercion: JUSTO ANTES del comentario de `parecidos`, no entre el comentario y su
# funcion — ese comentario explica el tope de la distancia y se quedaria huerfano.
ANCLA = '''  // El tope crece con el nombre:'''

VIEJO = '''    if (!pistas.length) pistas = conocidas.filter(function (k) { return parecidos(nombreCorto(k), corto); });'''

NUEVO = '''    // BUG-SNP2: `hab:placa-on` se cantaba como dedo torcido de `hab:palanca-on`. Antes de mirar
    // parecidos hay una señal que decide el caso sin ambiguedad: si `placa` ya esta en la paleta,
    // `placa-on` es un pariente suyo que todavia no se ha colocado, no otra palabra mal escrita.
    if (!pistas.length && deLaFamilia(corto, conocidas)) {
      return { aplazable: true, error: '"' + clave + '" no esta en este mundo todavia' };
    }
    if (!pistas.length) pistas = conocidas.filter(function (k) { return parecidos(nombreCorto(k), corto); });'''


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    faltan = [n for n, v in (('el fallback a parecidos() de resolver()', VIEJO),
                             ('parecidos (ancla)', ANCLA)) if v not in code]
    if faltan:
        print('ABORTA: no encuentro ' + ', '.join(faltan)
              + ' (¿lo editó el dueño?). No se toca el snippet.', file=sys.stderr)
        return 1

    code = code.replace(ANCLA, AYUDA + ANCLA, 1)
    code = code.replace(VIEJO, NUEVO, 1)
    doc['code'] = code

    # Guardado atomico, como todo lo que escribe en data/.
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: un material de la familia de otro conocido espera en silencio, no se canta como typo')
    return 0


if __name__ == '__main__':
    sys.exit(main())
