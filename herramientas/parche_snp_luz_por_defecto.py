#!/usr/bin/env python3
# Los valores de luz que el dueño dio por buenos el 2026-08-25, tras la tanda de fotos #132-#139, fijados
# como POR DEFECTO en vez de tener que teclearlos en la consola cada vez que se recarga:
#
#   game.interiorDark = 0.15                     → web/app.js (mc.interiorDark, no toca esto)
#   game.voxelesUI.luz('luciernagas', 10)        → aquí, en `efectos-demo`
#   game.luzLey.color({saturacion: 2})           → herramientas/crea_snp_luz_ley.py (COLOR.saturacion)
#   …y el parche de la Ley PUESTO ANTES que las partículas → aquí, en `miosd`
#
# Lo de «antes» no es cosmético: `parche-luz-dia-ley` sustituye `mcDynBake` (la LUT de Radiance Cascades por
# el BFS de la Ley) y reparte el campo de cero al instalarse. Si se carga DESPUÉS de que las luciérnagas ya
# estén volando, el primer horneado que se ve todavía es el de la LUT. Cargándolo primero, todo lo que nazca
# después ya nace bajo la Ley.
#
# Idempotente por ancla, y todo o nada: si el dueño ha editado estos snippets a mano y un ancla no aparece
# EXACTAMENTE una vez, aborta sin tocar nada (los `.json` se sobrescriben con `os.replace`, atómico).
#
#   python3 herramientas/parche_snp_luz_por_defecto.py
#
# ⚠️ `interiorDark` PERSISTE en localStorage (`vf_mcInteriorDark`): en un navegador que ya lo haya guardado,
# el valor de app.js no manda. Una vez: `game.interiorDark = 0.15` (o borrar esa clave).
import json, sys, os, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNP = lambda id_: os.path.join(RAIZ, 'data', 'snippets', id_ + '.json')

# ── efectos-demo · alcance de las luciérnagas ────────────────────────────────────────────────────────
# El alcance es lo ÚNICO que sube el nivel de la semilla, y el nivel es lo que decide cuánto tinte deja
# entrar `mcLitGlow` (`mix(vec3(1.0), rgbCol, b*0.75)`). Con 6 el color se cuantiza en 6 escalones y la
# luciérnaga no se distingue del cálido de la casa; con 10, sí. Cuesta caja de BFS, no draw calls.
LUC_VIEJO = "  game.voxelesUI.material('luciernagas', { emite: true, luz: 6 });"
LUC_NUEVO = "  game.voxelesUI.material('luciernagas', { emite: true, luz: 10 });   // 10 = lo que el dueño dio por bueno (#134/#139): con 6 el color se pierde en la cuantización"

# ── miosd · la Ley antes que las partículas ──────────────────────────────────────────────────────────
OSD_VIEJO = 'const E = await game.snippet("efectos-demo");'
OSD_NUEVO = ('// La Ley de la Luz ANTES que nada: sustituye mcDynBake (LUT → BFS) y reparte el campo de cero, así\n'
             '// que todo lo que nazca luego ya nace bajo la Ley. Al revés, el primer horneado sería el de la LUT.\n'
             'await game.snippet("parche-luz-dia-ley");\n'
             'const E = await game.snippet("efectos-demo");')

TRABAJOS = [
    ('efectos-demo', 'luz: 10', [('el material de las luciérnagas', LUC_VIEJO, LUC_NUEVO)]),
    ('miosd', 'parche-luz-dia-ley', [('la carga de efectos-demo', OSD_VIEJO, OSD_NUEVO)]),
]


def main():
    hechos = []
    for id_, marca, pares in TRABAJOS:
        ruta = SNP(id_)
        if not os.path.exists(ruta):
            print('ABORTA: no existe %s' % ruta, file=sys.stderr)
            return 1
        with open(ruta, encoding='utf-8') as f:
            doc = json.load(f)
        code = doc['code']
        if marca in code:
            print('%s: ya estaba puesto («%s»), no se toca' % (id_, marca))
            continue
        for nombre, viejo, _ in pares:      # validar TODAS las anclas antes de tocar una letra
            n = code.count(viejo)
            if n != 1:
                print('ABORTA en %s: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?)'
                      % (id_, nombre, n), file=sys.stderr)
                return 1
        for _, viejo, nuevo in pares:
            code = code.replace(viejo, nuevo, 1)
        doc['code'] = code
        d = os.path.dirname(ruta)
        fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        os.replace(tmp, ruta)
        hechos.append(id_)

    print('parcheados: %s' % (', '.join(hechos) if hechos else 'nada (todo estaba ya)'))
    print('Recuerda: python3 herramientas/crea_snp_luz_ley.py  (publica parche-luz-dia-ley con saturacion 2)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
