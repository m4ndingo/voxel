#!/usr/bin/env python3
"""`pideRemallado` mallaba el mundo DOS veces (defecto #2 del cuelgue de ~9 s al entrar).

Medido con `/tmp/perf3.js` en el mapa por defecto (512x40x512):

    t= 9653  1979 ms  mcMeshAll   <- mundo-autoarranque (pideRemallado)
    t=13749  1941 ms  mcMeshAll   <- mcRestampAll (app.js:16572), disparado por el de arriba

`pideRemallado` hace `mcMeshAll()` y acto seguido `mcRestampAll()`, y `mcRestampAll` termina con su
PROPIO `mcMeshAll()` cuando la luz de bloque ha cambiado. Al arrancar SIEMPRE ha cambiado: la foto
`mc.blockLightMeshed` con la que compara viene del bake de `openWorld`, hecho antes de que las
instancias de estructura tuvieran `emitFinos`. O sea que el primer mallado —dos segundos— se tira
entero a la basura, siempre.

Este parche restampa PRIMERO y solo malla si el restamp no llego a mallar. Saberlo no es adivinar:
`mcMeshAll` deja `mc.blockLightMeshed` en un array NUEVO cada vez (app.js:12264, `.slice()`), asi
que basta comparar la referencia. El terreno acaba mallado exactamente una vez, y con las tablas de
luz y la luz de bloque ya definitivas — antes el primer mallado usaba las de en medio.

Tambien engancha el snippet `perf-mallado` (memoriza `mcComputeLight`, agrupa `mcCalientaFina`)
junto al resto de autoarranques del mundo.

Idempotente: si ya esta puesto, no toca nada.
Uso:  python3 herramientas/parche_snp_perf_remallado.py [--publicar]
"""
import json
import os
import sys
import tempfile
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNIP = os.path.join(RAIZ, 'data', 'snippets', 'mundo-autoarranque.json')
MARCA = 'PERF-MALLADO'

VIEJO = """      var t = performance.now();
      mcMeshAll();
      // Con .catch para que un fallo del re-horneado no salga como 'unhandled rejection' sin nombre.
      if (mc.structures && mc.structures.length && typeof mcRestampAll === 'function') {
        Promise.resolve(mcRestampAll()).catch(function (e) {
          console.warn('game.bloques: no he podido re-hornear las estructuras tras cambiar la luz.', e);
        });
      }
      // Que se vea lo que cuesta y cuantos define se ahorraron: era trabajo invisible que solo se
      // notaba como 'el mapa fps tarda mucho'.
      console.log('game.bloques: mundo remallado en ' + (performance.now() - t).toFixed(0) + ' ms · '
        + n + ' define(s) agrupados en 1 pasada.');"""

NUEVO = """      var t = performance.now();
      // ==PERF-MALLADO== Esto era `mcMeshAll(); mcRestampAll();` y costaba DOS mallados del mundo
      // entero (1979 + 1941 ms medidos en el mapa por defecto, 512x40x512). `mcRestampAll` acaba
      // con su propio `mcMeshAll()` si la luz de bloque cambio (app.js:16572), y al arrancar SIEMPRE
      // cambia: la foto con la que compara (`mc.blockLightMeshed`) viene del bake de `openWorld`,
      // hecho antes de que las instancias tuvieran `emitFinos`. El primer mallado se tiraba entero.
      //
      // Ahora se restampa primero y solo se malla si el restamp no llego a hacerlo. No hay que
      // adivinarlo: `mcMeshAll` deja `mc.blockLightMeshed` en un array NUEVO cada vez
      // (app.js:12264, `.slice()`), asi que si la referencia sigue siendo la misma es que no paso.
      // Ademas el unico mallado que queda usa ya las tablas de luz definitivas — antes el primero
      // se hacia con las de en medio, otra razon para que no sirviera de nada.
      var avisa = function () {
        // Que se vea lo que cuesta y cuantos define se ahorraron: era trabajo invisible que solo se
        // notaba como 'el mapa fps tarda mucho'.
        console.log('game.bloques: mundo remallado en ' + (performance.now() - t).toFixed(0) + ' ms · '
          + n + ' define(s) agrupados en 1 pasada.');
      };
      if (!(mc.structures && mc.structures.length && typeof mcRestampAll === 'function')) {
        mcMeshAll(); avisa(); return;
      }
      var luzAntes = mc.blockLightMeshed;
      // Con .catch para que un fallo del re-horneado no salga como 'unhandled rejection' sin nombre.
      Promise.resolve(mcRestampAll()).then(function () {
        if (mc.blockLightMeshed === luzAntes) mcMeshAll();   // el restamp no llego a re-mallar el terreno
      }, function (e) {
        console.warn('game.bloques: no he podido re-hornear las estructuras tras cambiar la luz.', e);
        mcMeshAll();                                         // que el terreno no se quede con la luz vieja
      }).then(avisa);"""

# El enganche del snippet nuevo, LO PRIMERO despues del guardia de sesion.
#
# El sitio importa y se pago aprendiendolo: puesto al final (junto a `texturas-embebidas`) la
# memoria de `mcComputeLight` se instala DESPUES del remallado de los 203 `define`, o sea con la
# tabla vacia, y el primer horneado que podria aprovecharla —el de los carteles de nota, a los 24 s—
# la encuentra vacia y se paga 1129 ms de skylight otra vez. Instalada aqui, el remallado de los
# `define` deja la firma buena guardada y ese horneado sale gratis.
#
# ⚠️ Va CON `await` a proposito, al reves que `sesion-guardia`: si no se espera al fetch, los
# `define` de abajo corren antes y `pideRemallado` (que va en una microtarea) llega antes que la
# memoria. Son unos milisegundos contra los 305 KB de snippet que vienen detras.
ANCLA_SNP = '// ==FIN-GUARDIA-SESION=='
NUEVO_SNP = (ANCLA_SNP + '\n\n'
             '// ==PERF-MALLADO-ENGANCHE==\n'
             '// Memoriza `mcComputeLight` (funcion pura de rejilla+tablas: ~1 s cada llamada, y se\n'
             '// llamaba 5 veces por entrada) y agrupa los `mcMeshAll` que `mcCalientaFina` hacia\n'
             '// UNO POR MATERIAL fino que llegaba tarde. Reversible: `game.perfMallado.off()`.\n'
             '//\n'
             '// El try/catch NO sobra: esto es lo primero del autoarranque y `game.snippet` rechaza\n'
             '// si el fichero no esta publicado. Sin el, un 404 aqui se lleva por delante TODO lo de\n'
             '// abajo — bloques, redstone, fluidos, menu — y el mapa se abre pelado. Perder la\n'
             '// memoria de luz solo cuesta segundos; perder el autoarranque cuesta el mundo.\n'
             'try { await game.snippet("perf-mallado", { noshow: true }); }\n'
             "catch (e) { console.warn('perf-mallado no se pudo cargar; se sigue sin memoria de luz:', e && e.message); }\n"
             '// ==FIN-PERF-MALLADO-ENGANCHE==')

# Enganches de versiones anteriores de este mismo parche, para poder re-aplicarlo encima.
PREVIOS = [
    # v1: al final, junto a `texturas-embebidas` (tarde: la memoria llegaba despues del remallado)
    ('await game.snippet("texturas-embebidas", { noshow: true });\n'
     '// PERF-MALLADO · memoriza mcComputeLight (funcion pura de rejilla+tablas, ~1 s cada\n'
     '// llamada) y agrupa los mcMeshAll que mcCalientaFina hacia UNO POR MATERIAL.\n'
     'await game.snippet("perf-mallado", { noshow: true });',
     'await game.snippet("texturas-embebidas", { noshow: true });'),
    # v2: ya arriba, pero sin red de seguridad si el snippet no esta publicado
    (ANCLA_SNP + '\n\n'
     '// ==PERF-MALLADO-ENGANCHE==\n'
     '// Memoriza `mcComputeLight` (funcion pura de rejilla+tablas: ~1 s cada llamada, y se\n'
     '// llamaba 5 veces por entrada) y agrupa los `mcMeshAll` que `mcCalientaFina` hacia\n'
     '// UNO POR MATERIAL fino que llegaba tarde. Reversible: `game.perfMallado.off()`.\n'
     'await game.snippet("perf-mallado", { noshow: true });\n'
     '// ==FIN-PERF-MALLADO-ENGANCHE==',
     ANCLA_SNP),
]



def main():
    with open(SNIP, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    cambios = []

    if MARCA in code:
        print('ya estaba parcheado (pideRemallado); nada que hacer')
    else:
        if code.count(VIEJO) != 1:
            sys.exit('ancla no encontrada o ambigua (%d) en pideRemallado' % code.count(VIEJO))
        code = code.replace(VIEJO, NUEVO)
        cambios.append('pideRemallado: un solo mallado')

    for antes, despues in PREVIOS:              # deshace enganches de versiones anteriores
        if antes in code:
            code = code.replace(antes, despues)
            cambios.append('retirado un enganche viejo')

    if 'PERF-MALLADO-ENGANCHE' in code:
        print('ya estaba enganchado perf-mallado; nada que hacer')
    else:
        if code.count(ANCLA_SNP) != 1:
            sys.exit('ancla del enganche no encontrada o ambigua (%d)' % code.count(ANCLA_SNP))
        code = code.replace(ANCLA_SNP, NUEVO_SNP)
        cambios.append('enganche de perf-mallado (lo primero)')

    if cambios:
        doc['code'] = code
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(SNIP), suffix='.tmp')
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        os.replace(tmp, SNIP)
        print('parcheado %s (%s)' % (SNIP, ' + '.join(cambios)))

    if '--publicar' in sys.argv:
        tok = ''
        try:
            with open('/root/voxelforge.env', encoding='utf-8') as f:
                for ln in f:
                    if ln.startswith('VOXELFORGE_TOKEN='):
                        tok = ln.split('=', 1)[1].strip()
        except OSError:
            pass
        req = urllib.request.Request(
            'http://localhost:8500/api/snippets',
            data=json.dumps(doc, ensure_ascii=False).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'X-VoxelForge-Token': tok},
            method='POST')
        with urllib.request.urlopen(req, timeout=60) as r:
            print('publicado:', r.read().decode('utf-8')[:200])


if __name__ == '__main__':
    main()
