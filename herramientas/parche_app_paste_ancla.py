#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Baja a `app.js` la herencia del AGARRE al pegar, validada en el snippet `paste-ancla`.

Dueño (2026-08-28): «*cuando se copia y se pega, si se habia elegido un ancla al copiar (con control
apuntando un bloque), al pegar se pierde y no deberia*»; y tras probarlo: «*funcionan correctos ambos
el-guia-extrusion y paste-ancla, aplicalos a app.js*».

Había DOS agarres que no se hablaban: `mc.selPivote` (Seleccionar, Ctrl + apuntar, celda de mundo
absoluta, es sobre lo que gira R) y `mc.pasteAnchor` (Pegar, celda de la pieza relativa a su esquina
mínima y SIN rotar). Copiar tiraba el primero y pegar estrenaba el segundo en [0,0,0]. Son el mismo
punto contado de dos maneras: aquí se traduce uno en otro.

Qué cambia respecto al snippet: nada de envolturas. El agarre se calcula donde se llena el portapapeles
y el bucle desaparece — reelegirlo pegando se guarda en el keyup que ya lo fija, que es su sitio.

Idempotente por MARCA. Aborta si cualquier ancla no aparece EXACTAMENTE una vez. Escritura atómica.
Guardián: `tests/probe_paste_ancla.js` (sobre el snippet; el motor hace lo mismo bloque a bloque).

  python3 herramientas/parche_app_paste_ancla.py [--comprobar]
"""
import os, sys, tempfile

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'app.js')
MARCA = 'function mcAnclaDeCopia('

# 1) El traductor, justo antes de quien lo usa.
ANCLA_FUN = 'function mcCopySelection(){'

FUNCION = """// El AGARRE elegido en Seleccionar (`mc.selPivote`, Ctrl + apuntar) y el del pegado (`mc.pasteAnchor`)
// son EL MISMO PUNTO contado de dos maneras: uno es una celda de mundo absoluta y el otro va relativo a
// la esquina mínima de la pieza, sin rotar, en los ejes que da `mcClipboardDims` (w=x, h=y, d=z). Aquí
// se traduce al copiar, y se cuelga del PORTAPAPELES —que es lo que viaja—, no de `mc`: el editor
// reasigna `clipboard` entero cuando copia por su lado, así que su copia nace sin agarre sin que haya
// que limpiar nada. Fuera de la pieza no se hereda: un agarre que se quedó de otra selección dejaría el
// cúmulo colgando de un punto que no señaló nadie, que es peor que pegar por la esquina.
// ⛔ Se llama DESPUÉS de llenar `clipboard`: mide contra la pieza recién copiada, no contra la anterior.
function mcAnclaDeCopia(minx, miny, minz){        // mins en MUNDO: x, y (altura), z
  const p = mc.selPivote;
  if(!p) return null;
  const d = mcClipboardDims();
  if(!d) return null;
  const a = [p[0]-minx, p[1]-miny, p[2]-minz];
  if(a[0]<0 || a[0]>=d.w || a[1]<0 || a[1]>=d.h || a[2]<0 || a[2]>=d.d) return null;
  return a;
}
"""

# 2) Copiar (Ctrl+C). Ojo a los nombres de las cotas, que son del convenio del EDITOR: `miny` es la z de
#    mundo y `minz` la y (altura). Se pasan a `mcAnclaDeCopia` en orden de mundo: x, y, z.
ANCLA_COPIA = """              gx:Math.floor((maxx-minx)/2), gy:Math.floor((maxy-miny)/2) };
  toast(raw.length+' bloque(s) copiados"""

COPIA = """              gx:Math.floor((maxx-minx)/2), gy:Math.floor((maxy-miny)/2) };
  clipboard.ancla = mcAnclaDeCopia(minx, minz, miny);   // el agarre viaja con la pieza (mundo: x, y, z)
  toast(raw.length+' bloque(s) copiados"""

# 3) Cortar (Ctrl+X). Mismo trato: el corte vacía la selección, pero las cotas ya están tomadas.
ANCLA_CORTE = """              gx:Math.floor((maxx-minx)/2), gy:Math.floor((maxy-miny)/2) };
  if(edits.length){"""

CORTE = """              gx:Math.floor((maxx-minx)/2), gy:Math.floor((maxy-miny)/2) };
  clipboard.ancla = mcAnclaDeCopia(minx, minz, miny);   // el agarre viaja con la pieza (mundo: x, y, z)
  if(edits.length){"""

# 4) Pegar (Ctrl+V): el agarre heredado en vez de la esquina mínima de siempre.
ANCLA_PEGA = """  mc.pasteAnchor = [0, 0, 0];       // agarre: esquina mínima, como se ha pegado siempre"""

PEGA = """  // Agarre: el que se eligió al copiar si la pieza trae uno; si no, la esquina mínima, como siempre.
  // `mcPasteOrigen` ya lo recorta contra (w,h,d), así que un agarre heredado nunca cae fuera de la pieza.
  mc.pasteAnchor = (clipboard.ancla && clipboard.ancla.length===3) ? clipboard.ancla.slice() : [0, 0, 0];"""

# 5) …y avisar de que se hereda, que si no parece que la pieza se pega descolocada.
ANCLA_TOAST = """  toast('Pegar: mueve la mira para posicionar · Clic dcho planta (sigue cargado) · R cara, Shift+R giro · Clic izq suelta');"""

TOAST = """  toast('Pegar: mueve la mira para posicionar · Clic dcho planta (sigue cargado) · R cara, Shift+R giro · Clic izq suelta');
  if(clipboard.ancla) toast('Se pega por el agarre elegido al copiar ['+mc.pasteAnchor.join(', ')+'] · Ctrl + apuntar lo cambia', 5);"""

# 6) Reelegir el agarre PEGANDO (Ctrl + apuntar, keyup) también se recuerda: lo que se sujeta con la mano
#    es la pieza, no ese pegado suelto, y el siguiente Ctrl+V tiene que nacer con él.
ANCLA_KEYUP = """      const sin = mcPasteAnchorDesdeRotado(dims, mcPasteOri(), mc.pasteAnchorHover);
      if(sin) mc.pasteAnchor = sin;"""

KEYUP = """      const sin = mcPasteAnchorDesdeRotado(dims, mcPasteOri(), mc.pasteAnchorHover);
      if(sin){ mc.pasteAnchor = sin; if(clipboard) clipboard.ancla = sin.slice(); }   // y se recuerda"""

CAMBIOS = [
    ('el traductor mcAnclaDeCopia', ANCLA_FUN, FUNCION + ANCLA_FUN),
    ('copiar (Ctrl+C) guarda el agarre', ANCLA_COPIA, COPIA),
    ('cortar (Ctrl+X) guarda el agarre', ANCLA_CORTE, CORTE),
    ('pegar (Ctrl+V) lo hereda', ANCLA_PEGA, PEGA),
    ('el aviso de que se hereda', ANCLA_TOAST, TOAST),
    ('reelegirlo pegando se recuerda', ANCLA_KEYUP, KEYUP),
]


def main():
    solo_comprobar = '--comprobar' in sys.argv
    src = open(APP, encoding='utf-8').read()

    if MARCA in src:
        print('Ya estaba aplicado (marca «%s» presente). No se toca nada.' % MARCA)
        return 0

    for nombre, ancla, _ in CAMBIOS:
        n = src.count(ancla)
        if n != 1:
            print('ABORTA · el ancla de «%s» aparece %d veces (se esperaba 1):\n  %s'
                  % (nombre, n, ancla.splitlines()[0][:100]), file=sys.stderr)
            return 1

    out = src
    for nombre, ancla, nuevo in CAMBIOS:
        out = out.replace(ancla, nuevo, 1)
        print('  · %s' % nombre)

    if solo_comprobar:
        print('Anclas OK (%d). Con --comprobar no se escribe.' % len(CAMBIOS))
        return 0

    d = os.path.dirname(APP)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.app.js.', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(out)
        os.replace(tmp, APP)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    print('Aplicado a %s (%d → %d líneas)' % (APP, src.count('\n') + 1, out.count('\n') + 1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
