#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# «el parche funciona correctamente, aplicar a app.js» (dueño, 2026-08-28).
#
# El arreglo nació como snippet `sel-mueve-vacia` (LEY DE ORO: aislado, validado en caliente, y sólo
# cuando el dueño lo da por bueno baja al motor). Ya está dado por bueno: esto lo baja.
#
# QUÉ ES
#   REQ-EXTRU3 · Con la herramienta Seleccionar, Ctrl+rueda y Shift+rueda MUEVEN la caja aunque no tenga
#   ni un bloque dentro. Antes el motor soltaba «La selección no tiene bloques: nada que cavar» y dejaba
#   el marco colgado en el aire, sin manera de bajarlo al suelo salvo volviendo a marcar las dos
#   esquinas (dueño: «*no importa si no tiene bloques, la seleccion ha de moverse igualmente*»).
#
# QUÉ DEJA EN web/app.js
#   1. `mcSelMueveVacia(eje, paso, adonde, gesto)` al lado de `mcSelCount` — traslada TODAS las cajas
#      una celda por un eje, o dice que no si el conjunto toca el borde del mundo.
#   2. Las dos guardas de «no tiene bloques» (una en `mcSelExtruir`, otra en `mcSelExtruirFrente`)
#      pasan de avisar y plantarse a llamarla.
#
# ⛔ LO QUE NO SE TOCA: la OTRA guarda de cada una, `if(!edits.length)`. Ahí SÍ hay bloques pero ninguno
#    se pudo escribir, y no mover la caja es una regla del dueño de 2026-08-20 («*un wup seguido de un
#    wdown debería dejar los bloques iguales que como estaban al ppo*»). Confundir las dos guardas es EL
#    error fácil de este arreglo: se parecen y están a veinte líneas una de otra.
#
# LO QUE NO BAJA: `game.selVacia` (on/off/estado). Era el mando del snippet para apagarlo en caliente;
# ni Ctrl+rueda ni Shift+rueda tienen mando, y un gesto del motor no lo necesita.
#
# EL MOTOR LO HACE MÁS BARATO QUE EL SNIPPET: el snippet tenía que recorrer la selección por su cuenta
# ANTES de cada muesca para saber si estaba vacía (`hayBloques()`), porque desde fuera no hay otra
# manera. Aquí la respuesta ya está hecha — `col`/`fila` salen de la única pasada que da el original —
# así que la comprobación no cuesta nada y desaparece el segundo barrido.
#
# Idempotente: si `mcSelMueveVacia` ya está en app.js, no toca nada. Todo o nada: cada ancla tiene que
# aparecer EXACTAMENTE una vez o aborta sin escribir.
#
#   python3 herramientas/parche_app_sel_vacia.py
#
# ⚠️ Después: regenerar SYMBOLS.md (guardián tests/test_symbols_sync.js) — el parche añade una función.
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(RAIZ, 'web', 'app.js')

MARCA = 'function mcSelMueveVacia('

FUNCION = r'''// REQ-EXTRU3 · La caja de Seleccionar VACÍA también se mueve (dueño, 2026-08-28: «*no importa si no
// tiene bloques, la seleccion ha de moverse igualmente*»). La marcas en el aire, y sin esto el gesto se
// quedaba en un aviso: ni extruía —no hay de qué— ni bajaba el marco, así que para llevarla al suelo
// había que volver a marcar las dos esquinas.
// SE TRASLADA, NO SE ESTIRA. Con bloques dentro, mcSelExtruir mueve la caja por su borde ACTIVO (el de
// arriba, el que da la cara) porque ahí acaba de aparecer o desaparecer una capa: el marco enseña dónde
// va la muesca siguiente. Vacía no aparece ni desaparece nada, así que encoger un borde no significaría
// nada — y una caja vacía de alto 3 se quedaría quieta dos muescas antes de empezar a bajar. Viaja
// ENTERA, conservando la forma que costó marcar, hasta meterse en el terreno; en cuanto pilla un bloque
// vuelve a mandar la extrusión de siempre.
// El tope del mundo se mira sobre el CONJUNTO de cajas (REQ-SEL1): recortar caja a caja las deformaría
// y les cambiaría las distancias entre ellas, que es justo lo que una traslación no hace. O se mueven
// todas o no se mueve ninguna.
// NO HAY DESHACER de este viaje: Ctrl+Z restaura la caja sólo si va pegada a una edición
// (`mc._selCajasBeforeEdit`, que consume mcPushHist), y aquí no se edita ni un bloque. Por eso tampoco
// se toca esa variable: dejarla puesta pegaría este viaje a la SIGUIENTE edición, y el deshacer
// teletransportaría el marco.
function mcSelMueveVacia(eje, paso, adonde, gesto){
  const cajas=mc.selCajas; if(!cajas.length) return false;
  const lim = eje===0 ? mc.dim.x : (eje===1 ? mc.dim.y : mc.dim.z);
  let min=Infinity, max=-Infinity;
  for(const s of cajas){ min=Math.min(min,s.a[eje],s.b[eje]); max=Math.max(max,s.a[eje],s.b[eje]); }
  if(paso>0 ? max+paso>lim-1 : min+paso<0){ toast('La selección toca el borde del mundo: no cabe más '+adonde); return false; }
  for(const s of cajas){ s.a[eje]+=paso; s.b[eje]+=paso; }
  // El AGARRE del giro (REQ-SEL1) viaja con la caja: es una celda de mundo elegida DENTRO de la
  // selección, y si se queda atrás el motor lo da por fuera (mcSelCajaDe(...)<0) y rotar pasaría a
  // pivotar por la esquina mínima sin avisar.
  if(mc.selPivote) mc.selPivote[eje]+=paso;
  toast('Selección vacía — movida '+adonde+' (sin bloques que '+gesto+')');
  return true;
}
'''

CAMBIOS = [
    # 1 · la función nueva, justo antes de la primera que la usa
    ('function mcSelCount(){ let n=0; mcSelForEach(()=>n++); return n; }\n',
     'function mcSelCount(){ let n=0; mcSelForEach(()=>n++); return n; }\n' + FUNCION),

    # 2 · Ctrl+rueda (eje Y): arriba sube, abajo baja
    ("  if(!col.size){ toast('La selección no tiene bloques: nada que '+(arriba?'extruir':'cavar')); return false; }",
     "  // Caja vacía: no hay nada que extruir, pero se mueve igual (REQ-EXTRU3). ⚠️ No confundir con la\n"
     "  // guarda de `!edits.length` de más abajo, que SÍ tiene que dejarla quieta.\n"
     "  if(!col.size) return mcSelMueveVacia(1, arriba?1:-1, arriba?'arriba':'abajo', arriba?'extruir':'cavar');"),

    # 3 · Shift+rueda (eje de la mirada): arriba aleja, abajo acerca. `sN` apunta AL FRENTE.
    ("  if(!fila.size){ toast('La selección no tiene bloques: nada que '+(dentro?'hundir':'traer')); return false; }",
     "  // Caja vacía: se mueve igual (REQ-EXTRU3), por el eje que se mira y en el sentido del gesto —\n"
     "  // arriba se aleja (+sN), abajo se acerca. Misma advertencia que en mcSelExtruir: la guarda de\n"
     "  // `!edits.length` de más abajo es otra cosa y no se toca.\n"
     "  if(!fila.size) return mcSelMueveVacia(eje, (dentro?1:-1)*sN, dentro?'hacia dentro':'hacia ti', dentro?'hundir':'traer');"),
]


def main():
    with open(APP, encoding='utf-8') as f:
        src = f.read()
    if MARCA in src:
        print('app.js: sel-mueve-vacia ya estaba aplicado — no se toca nada')
        return 0
    # TODAS las anclas antes de escribir NINGUNA: a medio parchear el motor queda incoherente.
    for ancla, _ in CAMBIOS:
        if src.count(ancla) != 1:
            print('ABORTA: el ancla aparece %d veces, esperaba 1\n  %s'
                  % (src.count(ancla), ancla[:70]), file=sys.stderr)
            return 1
    for ancla, nuevo in CAMBIOS:
        src = src.replace(ancla, nuevo, 1)
    d = os.path.dirname(APP)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(src)
    os.replace(tmp, APP)
    print('app.js: sel-mueve-vacia aplicado (%d cambios)' % len(CAMBIOS))
    print('Ahora: regenerar SYMBOLS.md (guardián tests/test_symbols_sync.js)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
