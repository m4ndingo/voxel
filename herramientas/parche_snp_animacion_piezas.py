#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-ANIM1 · Capacidad de animación procedimental / matemática de voxels y piezas para avatares y agentes."""
import json, os, sys

RUTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'data', 'snippets', 'mundo-autoarranque.json')

def aplicar():
    if not os.path.exists(RUTA):
        print(f"Error: no existe {RUTA}", file=sys.stderr)
        return False
    with open(RUTA, 'r', encoding='utf-8') as f:
        data = json.load(f)

    code = data.get('code', '')

    VIEJO_PASO = """        if (P.anim) {
          var eje = String(P.anim.eje || 'y').toLowerCase();
          var lenZ = Math.max(0.001, aa[5] - aa[2]), minZ = (aa[2] - (s.oz || 0));
          var lenY = Math.max(0.001, aa[4] - aa[1]), minY = (aa[1] - (s.oy || 0));
          var esVert = (lenY > lenZ * 1.2);
          var lenSp = esVert ? lenY : lenZ, minSp = esVert ? minY : minZ;
          if (P.anim.sentido === 'tentaculos' || P.anim.tipo === 'calamar') lenSp = -lenSp;
          var factorModo = (P.anim.modo === 'movimiento') ? rig.andando : 1.0;
          var ampRad = (P.anim.amplitud || 25) * GRADO;
          var axisCode = (eje === 'x' ? 2.0 : 1.0);
          s._animSpine = [ampRad, (P.anim.frecuencia || 1.5), lenSp, minSp];
          s._animState = [rig.animT, (P.anim.fase || 0) * GRADO, factorModo, axisCode];
        } else if (s._animState) {
          s._animState = null;
        }"""

    NUEVO_PASO = """        if (P.anim) {
          var eje = String(P.anim.eje || 'y').toLowerCase();
          var lenZ = Math.max(0.001, aa[5] - aa[2]), minZ = aa[2];
          var lenY = Math.max(0.001, aa[4] - aa[1]), minY = aa[1];
          var esVert = (lenY > lenZ * 1.2);
          var lenSp = esVert ? lenY : lenZ, minSp = esVert ? minY : minZ;
          if (P.anim.sentido === 'tentaculos' || P.anim.tipo === 'calamar') lenSp = -lenSp;
          var factorModo = (P.anim.modo === 'movimiento') ? rig.andando : 1.0;
          var ampRad = (P.anim.amplitud || 25) * GRADO;
          var axisCode = (esVert ? 2.0 : 1.0);
          s._animSpine = [ampRad, (P.anim.frecuencia || 1.5), lenSp, minSp];
          s._animState = [rig.animT, (P.anim.fase || 0) * GRADO, factorModo, axisCode];
        } else if (s._animState) {
          s._animState = null;
        }"""

    if VIEJO_PASO in code:
        code = code.replace(VIEJO_PASO, NUEVO_PASO, 1)

    data['code'] = code
    with open(RUTA, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    print("Actualización de coordenadas mundiales exactas para VBO aplicada con éxito")
    return True

if __name__ == '__main__':
    aplicar()
