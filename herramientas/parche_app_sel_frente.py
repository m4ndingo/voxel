#!/usr/bin/env python3
# «aplica el parche sel-extruir-frente a app.js» (dueño, 2026-08-25).
#
# El gesto nació como snippet `sel-extruir-frente` (LEY DE ORO: aislado, validado en caliente, y solo
# cuando el dueño lo da por bueno baja al motor). Ya está dado por bueno («funciona correcto»): esto lo
# baja.
#
# QUÉ ES
#   REQ-EXTRU2 · Shift+rueda con la herramienta Seleccionar y una caja confirmada, hermano del Ctrl+rueda
#   que ya existe (REQ-EXTRU1) pero por el eje HORIZONTAL que se mira en vez de por Y:
#
#       Shift + rueda ARRIBA → HUNDE: se lleva la capa que te da la cara ⇒ profundiza cavidades
#       Shift + rueda ABAJO  → TRAE : pone una capa hacia ti           ⇒ acerca el muro / alarga el túnel
#
#   Los sentidos son los INVERSOS de Ctrl (allí arriba construye y abajo cava). Es lo que pidió el dueño.
#
# QUÉ DEJA EN web/app.js
#   1. `mcSelExtruirFrente(dir)`, al lado de `mcSelExtruir` — calcada de ella pero por FILAS a lo largo
#      del eje que se mira, quedándose con el bloque que da la cara en vez de con el más alto.
#   2. Cinco retoques en el oyente de rueda de #mc-canvas para que Shift entre por ahí. En el motor NO
#      hace falta el oyente en `window` con captura que usaba el snippet: eso existía solo para
#      adelantarse al del canvas desde fuera. Aquí se edita el del canvas y ya está.
#
# LO QUE NO BAJA: `game.selFrente` (on/off/estado). Era el mando del snippet para poder apagarlo en
# caliente; Ctrl+rueda tampoco tiene mando, y un gesto del motor no lo necesita.
#
# Idempotente: si `mcSelExtruirFrente` ya está en app.js, no toca nada. Todo o nada: cada ancla tiene
# que aparecer EXACTAMENTE una vez o aborta sin escribir.
#
#   python3 herramientas/parche_app_sel_frente.py
#
# ⚠️ Después: regenerar SYMBOLS.md (guardián tests/test_symbols_sync.js) — el parche añade una función.
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(RAIZ, 'web', 'app.js')

MARCA = 'function mcSelExtruirFrente('

FUNCION = r'''// REQ-EXTRU2 · Shift+rueda con una caja confirmada: hermano de mcSelExtruir, pero por el eje HORIZONTAL
// al que se mira en vez de por Y (orden del dueño, 2026-08-25: «*en un muro profundizar cavidades con
// shift+ruedaarriba y traer muros/tuneles hacia mi […] con shift+rueda abajo*»).
//   rueda ARRIBA → HUNDE: se lleva la capa que da la cara ⇒ la cavidad se hace más profunda
//   rueda ABAJO  → TRAE : pone una capa hacia el jugador  ⇒ el muro se acerca / el túnel se alarga
// ⚠️ Son los sentidos INVERSOS de Ctrl (allí arriba construye y abajo cava). A propósito: aquí «arriba»
// es alejarse y «abajo» acercarse, que es como se lee el gesto mirando de frente a una pared.
// Trabaja por FILAS (las dos coordenadas que no son el eje) y SIEMPRE por el bloque que DA LA CARA, igual
// que mcSelExtruir trabaja por columnas y por el más alto: así una selección sobre una pared irregular
// entra y sale siguiendo su propia silueta en vez de dejar una plancha plana.
// El eje se recalcula EN CADA MUESCA, no se recuerda: el jugador se gira y el gesto se gira con él.
function mcEjeMirada(){
  // Convenio de app.js (el de mcRaycast y compañía): adelante = [-sin(yaw)·cos(pitch), …, -cos(yaw)·cos(pitch)].
  // Aquí solo importa el horizontal, así que el coseno del pitch (positivo salvo mirando en vertical) no cambia
  // qué eje gana ni su signo. `sN` apunta AL FRENTE, o sea alejándose del jugador.
  const fx = -Math.sin(mc.yaw||0), fz = -Math.cos(mc.yaw||0);
  if(Math.abs(fx) >= Math.abs(fz)) return { eje:0, sN: fx>=0?1:-1, nombre: fx>=0?'+X':'-X' };
  return { eje:2, sN: fz>=0?1:-1, nombre: fz>=0?'+Z':'-Z' };
}
function mcSelExtruirFrente(dir){
  if(mc.tool!=='select' || !mc.selBox || !dir) return false;
  const dentro = dir>0;                                   // rueda arriba = hundir · rueda abajo = traer
  const m = mcEjeMirada(), eje = m.eje, sN = m.sN;
  const lim = eje===0 ? mc.dim.x : mc.dim.z;
  // Una sola pasada por la selección quedándose con el bloque de cada FILA que da a la cara. La fila es
  // (caja, las otras dos coordenadas) y NO solo las coordenadas: dos cajas pueden caer sobre la misma fila
  // a distinta profundidad y son dos caras, no una — el mismo motivo por el que mcSelExtruir mete `ci` en
  // la clave de la columna (REQ-SEL1).
  const fila=new Map();
  mcSelForEach((x,y,z,id,ci)=>{
    const p = eje===0 ? x : z;
    const k = ci+':'+y+','+(eje===0?z:x), v=fila.get(k);
    if(!v || (sN>0 ? p<v.p : p>v.p)) fila.set(k,{x,y,z,p,id});   // «cerca» = el menor si se mira a +, el mayor si a −
  });
  if(!fila.size){ toast('La selección no tiene bloques: nada que '+(dentro?'hundir':'traer')); return false; }
  const edits=[];
  for(const c of fila.values()){
    if(dentro){
      mcSetBlock(c.x,c.y,c.z,0);                          // se lleva la capa de la cara; la siguiente muesca ve la de detrás
      edits.push({x:c.x,y:c.y,z:c.z,before:c.id,after:0});
    } else {
      const x=c.x-(eje===0?sN:0), z=c.z-(eje===2?sN:0);   // justo delante, hacia el jugador
      if(!mcInside(x,c.y,z)) continue;                    // borde del mundo
      const before=mc.grid[mcIdx(x,c.y,z)];
      mcSetBlock(x,c.y,z,c.id);                           // mcSetBlock y no mc.grid[..]=: es un cambio de
      edits.push({x,y:c.y,z,before,after:c.id});          // TOPOLOGÍA y tiene que re-iluminar (mc.gridGen)
    }                                                     // con SU material: un muro de varios viene entero
  }
  // Si NINGUNA fila pudo escribir no ha pasado nada, y la caja tampoco se mueve: moverla sería mentir. Es
  // la misma regla que mcSelExtruir aprendió a la fuerza (una muesca y su contraria dejan los bloques como
  // estaban). Ojo: eso vale para los BLOQUES; la CAJA no recupera su profundidad, porque hundir con
  // profundidad 1 la mueve entera y traer después crece solo por el borde activo ⇒ queda de 2. Mismo
  // comportamiento que Ctrl en Y, y se deja igual a posta: que los gestos hermanos difieran confunde más.
  if(!edits.length){ toast(dentro?'Nada que hundir':'No cabe nada más hacia ti'); return false; }
  mc._selCajasBeforeEdit = mc.selCajas.map(s=>({ a:s.a.slice(), b:s.b.slice() }));
  for(const s of mc.selCajas){
    const p0=Math.min(s.a[eje],s.b[eje]), p1=Math.max(s.a[eje],s.b[eje]);
    const cerca = ((sN>0)===(s.a[eje]<=s.b[eje])) ? s.a : s.b;      // la esquina que da la cara
    const lejos = (cerca===s.a) ? s.b : s.a;
    if(dentro){ const np = sN>0 ? Math.min(lim-1,p0+1) : Math.max(0,p1-1);
                cerca[eje]=np; if(sN>0 ? p1<np : p0>np) lejos[eje]=np; }   // profundidad 1 ⇒ la caja entera avanza
    else cerca[eje] = sN>0 ? Math.max(0,p0-1) : Math.min(lim-1,p1+1);
  }
  mcRemeshEdiciones(edits); mcPushHist({t:'bb', edits}); mcScheduleSave();
  toast((dentro?'Hundido':'Traído')+' — '+edits.length+' bloque(s) · eje '+m.nombre);
  if(!dentro) mcForceUnstick();                           // traer el muro puede dejar al jugador dentro
  return true;
}
'''

# (ancla, texto nuevo) — cada ancla tiene que salir EXACTAMENTE una vez.
CAMBIOS = [
    # 1 · la función, justo antes del bloque de Ctrl+C
    ('// Ctrl+C: vuelca la caja seleccionada a ',
     FUNCION + '// Ctrl+C: vuelca la caja seleccionada a '),

    # 2 · la auto-confirmación de caja vale también para Shift
    ("  if(e.ctrlKey && mc.tool==='select' && mc.selA && !mc.selBox){",
     "  if((e.ctrlKey || (e.shiftKey && !e.altKey && !e.metaKey)) && mc.tool==='select' && mc.selA && !mc.selBox){"),

    # 3 · …y lo dice con el gesto que toca
    ("    toast(n + ' bloque(s) — auto-selección · Ctrl+rueda extruye/cava');",
     "    toast(n + ' bloque(s) — auto-selección · ' +\n"
     "          (e.shiftKey && !e.ctrlKey ? 'Shift+rueda hunde/trae' : 'Ctrl+rueda extruye/cava'));"),

    # 4 · el gesto nuevo, al lado del de Ctrl
    ("  const extru = e.ctrlKey && mc.tool==='select' && !!mc.selBox;",
     "  const extru = e.ctrlKey && mc.tool==='select' && !!mc.selBox;\n"
     "  // REQ-EXTRU2 · el mismo trato para Shift, pero hundiendo/trayendo por el eje que se mira\n"
     "  // (mcSelExtruirFrente). Sin Ctrl/Alt/Meta: Shift a secas. Shift+clic sigue siendo añadir caja\n"
     "  // (REQ-SEL1) — son gestos distintos, no se pisan.\n"
     "  const extruF = e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && mc.tool==='select' && !!mc.selBox;"),

    # 5 · dejar pasar el gesto nuevo
    ('  if(!extru && !mc.ruedaTool) return;',
     '  if(!extru && !extruF && !mc.ruedaTool) return;'),

    # 6 · el acumulador distingue ya TRES gestos, no dos
    ('  if(mc._ruedaExtru !== extru){ mc._ruedaExtru = extru; mc._ruedaAcum = 0; }',
     "  const gesto = extru ? 'y' : (extruF ? 'frente' : 'rosca');\n"
     '  if(mc._ruedaExtru !== gesto){ mc._ruedaExtru = gesto; mc._ruedaAcum = 0; }'),

    # 7 · y el reparto final
    ('  if(extru) mcSelExtruir(paso); else mcRuedaHerramienta(paso);',
     '  if(extru) mcSelExtruir(paso); else if(extruF) mcSelExtruirFrente(paso); else mcRuedaHerramienta(paso);'),
]


def main():
    with open(APP, encoding='utf-8') as f:
        src = f.read()

    if MARCA in src:
        print('app.js: sel-extruir-frente ya estaba puesto, no se toca')
        return 0

    # Todo o nada: se comprueban TODAS las anclas antes de escribir una sola.
    for ancla, _ in CAMBIOS:
        n = src.count(ancla)
        if n != 1:
            print('ABORTA: el ancla %r aparece %d veces, esperaba 1' % (ancla[:60], n), file=sys.stderr)
            return 1

    for ancla, nuevo in CAMBIOS:
        src = src.replace(ancla, nuevo, 1)

    d = os.path.dirname(APP)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(src)
    os.replace(tmp, APP)
    print('app.js: sel-extruir-frente puesto ✅  (%d retoques)' % len(CAMBIOS))
    print('        ahora: regenera SYMBOLS.md y pasa tests/test_symbols_sync.js')
    return 0


if __name__ == '__main__':
    sys.exit(main())
