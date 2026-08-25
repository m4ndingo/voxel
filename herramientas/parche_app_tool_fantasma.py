#!/usr/bin/env python3
# «aplica los 2 parches a app.js: tool-fantasma y sel-extruir-frente» (dueño, 2026-08-25). Éste es el
# primero de los dos; el otro es `parche_app_sel_frente.py`.
#
# El efecto nació como snippet `tool-fantasma` (LEY DE ORO: aislado, validado en caliente, y solo cuando
# el dueño lo da por bueno baja al motor). Ya está dado por bueno («esta correcta»): esto lo baja.
#
# QUÉ ES
#   REQ-TOOLGHOST · La herramienta en primera persona es una estructura de verdad (mc._heldToolStruct):
#   recibe prueba de profundidad como todo lo demás, así que pegado a una pared el trozo tapado no se
#   dibuja y la herramienta aparece CORTADA. Esto le devuelve ese trozo en «fantasma»: gris claro, plano
#   y translúcido.
#
#       Visible → como siempre.   Tapado por un bloque → silueta gris translúcida.
#
# CÓMO, sin recompilar un solo shader: ATRIBUTOS CONSTANTES. `disableVertexAttribArray` (vía mcAttribs)
# + `vertexAttrib*f` dan a un atributo un valor fijo para todos los vértices, así que se dibuja la MISMA
# geometría con el programa de estructuras del motor y aEmit=1 ⇒ el FS hace `mix(iluminado, vColor, em)`
# = vColor pelado, y su línea de niebla va multiplicada por (1.0 - em) ⇒ tampoco hay niebla. La salida es
# exactamente vec4(vColor, vAlpha). Con `depthFunc(GREATER)` pasa solo lo que queda DETRÁS de lo pintado.
#
# QUÉ DEJA EN web/app.js
#   1. `mcToolFantasma(pj, view)` justo antes de `mcDrawVoxUI`, que es su vecina de trabajo.
#   2. La llamada, JUSTO DESPUÉS de `mcDrawVoxUI(pj, view)` en mcRender — ANTES de las pasadas de
#      estructuras, que es lo delicado: ahí la profundidad tiene el terreno pero la herramienta AÚN NO SE
#      HA DIBUJADO, así que «detrás de lo pintado» significa «detrás de un bloque» y nada más. Después de
#      las estructuras, la herramienta ya habría escrito su profundidad y el fantasma saldría también
#      donde la herramienta SE TAPA A SÍ MISMA: una neblina gris por encima del pico entero.
#   3. `mc.toolFantasma` / `toolFantasmaAlpha` / `toolFantasmaColor` + sus `game.*` con persistencia,
#      al lado de game.toolAlphaFix, que es el mando hermano (el otro arreglo de la pieza en la mano).
#   4. Su fila en la tabla de ayuda de `game`.
#
# LO QUE NO BAJA: `game.toolFantasma.on()/off()/estado()` del snippet. En el motor el interruptor es el
# `game.toolFantasma = true/false` de siempre, como el resto de rasgos del render.
#
# ES IDEMPOTENTE (mira la MARCA) y TODO O NADA: comprueba las anclas antes de escribir, y escribe con
# temp + os.replace. Se puede volver a lanzar sin miedo:
#
#     python3 herramientas/parche_app_tool_fantasma.py
#
# Después: regenerar SYMBOLS.md (tests/test_symbols_sync.js) — el parche añade una función.
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(RAIZ, 'web', 'app.js')

MARCA = 'function mcToolFantasma('

FUNCION = r'''// REQ-TOOLGHOST · Lo TAPADO de la herramienta en mano, en rayos X (orden del dueño, 2026-08-25: «*cuando
// parte de la herramienta no se ve porque la tapa [un bloque] quiero que la parte tapada salga en modo
// "fantasma"*»). La herramienta es una estructura de verdad y recibe prueba de profundidad, así que
// pegado a una pared el trozo escondido no se dibuja y la pieza sale cortada; esto lo devuelve en gris
// claro translúcido. Va JUSTO DESPUÉS de mcDrawVoxUI y ANTES de las pasadas de estructuras, y ahí está
// todo el asunto: en ese punto la profundidad lleva el terreno pero la herramienta AÚN NO, así que
// «detrás de lo pintado» es «detrás de un bloque» y nada más. Movida detrás de las estructuras, la
// herramienta ya habría escrito su propia profundidad y saldría fantasma también donde SE TAPA A SÍ
// MISMA: una neblina gris por encima del pico entero. Luego el motor pinta encima la parte visible con su
// pasada normal y cada trozo queda en su sitio.
// No recompila NINGÚN shader: se dibuja la misma geometría con el programa de estructuras y todo menos la
// posición va en ATRIBUTOS CONSTANTES (mcAttribs apaga los arrays y vertexAttrib*f pone el valor fijo).
// LIMITACIÓN CONOCIDA: no escribe profundidad y no ordena, así que donde la pieza tiene varias capas de
// grosor el gris se acumula y se ve más denso. A propósito: ordenar por distancia obligaría a rehacer el
// VBO cada frame (es el mismo motivo por el que existe BUG-TOOL3), y en una silueta translúcida ese
// engrosamiento se lee como volumen. Se ajusta con game.toolFantasmaAlpha.
// Los tres lotes de una estructura: `aPos` son SIEMPRE los 3 primeros floats del vértice, así que con el
// stride correcto y desplazamiento 0 se leen los tres con el mismo programa — aunque el lote texturado
// tenga otro layout (aPos+aTile+aRect+aShade), que aquí da igual porque lo demás va constante.
const MC_TF_LOTES = [
  { vbo:'colVbo',   n:'colCount',   stride: 9*4 },
  { vbo:'texVbo',   n:'texCount',   stride:10*4 },
  { vbo:'alphaVbo', n:'alphaCount', stride: 9*4 }
];
function mcToolFantasma(pj, view){
  if(!mc.toolFantasma) return;
  const s = mc._heldToolStruct;                 // null cuando no hay herramienta o está escondida
  if(!s || !mc.structProg) return;
  const gl = mc.gl, SL = mc.structLoc;
  if(!gl || !SL) return;
  let hay=false; for(const L of MC_TF_LOTES) if(s[L.n] && s[L.vbo]){ hay=true; break; }
  if(!hay) return;

  const c = mc.toolFantasmaColor || [0.85,0.88,0.94];
  const al = isFinite(+mc.toolFantasmaAlpha) ? Math.max(0,Math.min(1,+mc.toolFantasmaAlpha)) : 0.30;

  mcStructGL(true);                             // culling y sesgo, igual que las pasadas de estructuras
  gl.useProgram(mc.structProg);
  gl.uniformMatrix4fv(SL.uProj,false,pj.m); gl.uniformMatrix4fv(SL.uView,false,view);
  gl.uniformMatrix4fv(SL.uModel,false,mcModelOf(s));
  if(SL.uClipY) gl.uniform1f(SL.uClipY, -1000.0);   // el FS descarta por uClipY si vale > -999

  // Solo la POSICIÓN sale del buffer; el resto son constantes.
  mcAttribs([SL.aPos]);
  gl.vertexAttrib3f(SL.aColor, c[0], c[1], c[2]);
  gl.vertexAttrib1f(SL.aShade, 1.0);            // mcViento(1.0)=0 ⇒ SIN viento: con el bit puesto el
                                                // fantasma ondearía respecto de la herramienta real
  gl.vertexAttrib1f(SL.aEmit,  1.0);            // ⇒ color pelado, sin luz ni niebla
  gl.vertexAttrib1f(SL.aAlpha, al);

  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.depthFunc(gl.GREATER);                     // ⬅ LA línea: solo lo que queda DETRÁS de lo ya pintado

  for(const L of MC_TF_LOTES){
    const n=s[L.n], vbo=s[L.vbo];
    if(!n || !vbo) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.vertexAttribPointer(SL.aPos, 3, gl.FLOAT, false, L.stride, 0);
    gl.drawArrays(gl.TRIANGLES, 0, n);
  }

  // Devolver el estado como estaba: esta pasada va EN MEDIO del frame. Dejarse el GREATER puesto borra
  // media escena a partir de aquí (es el mismo pisotón que BUG-FLUID6, por el otro lado).
  gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND);
  mcStructGL(false);
}
'''

MANDOS = r'''try{ const a=localStorage.getItem('vf_mcToolFantasma'); if(a!=null) mc.toolFantasma=(a==='1'); }catch(e){}
try{ const a=localStorage.getItem('vf_mcToolFantasmaAlpha'); if(a!=null) mc.toolFantasmaAlpha=+a; }catch(e){}
try{ const a=JSON.parse(localStorage.getItem('vf_mcToolFantasmaColor')||'null'); if(Array.isArray(a)&&a.length===3) mc.toolFantasmaColor=a.map(Number); }catch(e){}
// game.toolFantasma = el trozo de la pieza en la mano que TAPA un bloque se dibuja igualmente, en gris
// translúcido (REQ-TOOLGHOST, ver mcToolFantasma). false = como antes, la herramienta sale cortada.
// game.toolFantasmaAlpha (0..1) y game.toolFantasmaColor ([r,g,b] 0..1) ajustan el tono: donde la pieza es
// gruesa el gris se acumula, así que bajar el alfa es lo que suele querer verse.
Object.defineProperty(game,'toolFantasma',{ enumerable:true, get:()=>mc.toolFantasma,
  set:v=>{ v=!!v; mc.toolFantasma=v; try{localStorage.setItem('vf_mcToolFantasma', v?'1':'0');}catch(e){} return v; } });
Object.defineProperty(game,'toolFantasmaAlpha',{ enumerable:true, get:()=>mc.toolFantasmaAlpha,
  set:v=>{ v=Math.max(0,Math.min(1, isFinite(+v)?+v:0.30)); mc.toolFantasmaAlpha=v; try{localStorage.setItem('vf_mcToolFantasmaAlpha',v);}catch(e){} return v; } });
Object.defineProperty(game,'toolFantasmaColor',{ enumerable:true, get:()=>mc.toolFantasmaColor.slice(),
  set:v=>{ if(Array.isArray(v)&&v.length===3){ mc.toolFantasmaColor=v.map(n=>+n||0); try{localStorage.setItem('vf_mcToolFantasmaColor',JSON.stringify(mc.toolFantasmaColor));}catch(e){} } return mc.toolFantasmaColor; } });
'''

# (ancla, texto nuevo) — cada ancla tiene que salir EXACTAMENTE una vez.
CAMBIOS = [
    # 1 · la configuración, al lado de su hermano toolAlphaFix
    ("  toolAlphaFix:true,              // herramienta en mano con voxeles translúcidos:",
     "  toolFantasma:true,              // la parte de la herramienta en mano que TAPA un bloque se dibuja igual, en gris translúcido, en vez de salir cortada (game.toolFantasma; false = como antes)\n"
     "  toolFantasmaAlpha:0.30,         // transparencia de ese fantasma (game.toolFantasmaAlpha, 0..1): donde la pieza es gruesa el gris se acumula, ver mcToolFantasma\n"
     "  toolFantasmaColor:[0.85,0.88,0.94],  // su color plano (game.toolFantasmaColor, [r,g,b] 0..1): blanco frío, se despega del terreno sin cantar\n"
     "  toolAlphaFix:true,              // herramienta en mano con voxeles translúcidos:"),

    # 2 · la función, justo antes de mcDrawVoxUI, que es su vecina de trabajo
    ("// Los cubos de game.voxelesUI son CUERPOS SÓLIDOS DEL MUNDO",
     FUNCION + "// Los cubos de game.voxelesUI son CUERPOS SÓLIDOS DEL MUNDO"),

    # 3 · la llamada: pegada a mcDrawVoxUI y ANTES de las estructuras (ver cabecera de la función)
    ("  mcDrawVoxUI(pj, view);\n",
     "  mcDrawVoxUI(pj, view);\n"
     "  // REQ-TOOLGHOST · y aquí mismo el fantasma de lo tapado de la herramienta: tiene que ir ANTES de las\n"
     "  // pasadas de estructuras, cuando la profundidad lleva el terreno pero NO la herramienta todavía.\n"
     "  mcToolFantasma(pj, view);\n"),

    # 4 · los mandos de game, detrás de los de toolAlphaFix
    ("try{ const g=JSON.parse(localStorage.getItem('vf_mcSelVoxeles')||'null');",
     MANDOS + "try{ const g=JSON.parse(localStorage.getItem('vf_mcSelVoxeles')||'null');"),

    # 5 · la tabla de ayuda
    ("  toolAlphaFix:   ['herramienta','arregla el alfa de la pieza en la mano'],",
     "  toolAlphaFix:   ['herramienta','arregla el alfa de la pieza en la mano'],\n"
     "  toolFantasma:   ['herramienta','lo tapado de la pieza en la mano, en gris translúcido'],\n"
     "  toolFantasmaAlpha:['herramienta','transparencia de ese fantasma'],\n"
     "  toolFantasmaColor:['herramienta','color plano de ese fantasma'],"),
]


def main():
    with open(APP, encoding='utf-8') as f:
        src = f.read()

    if MARCA in src:
        print('app.js: tool-fantasma ya estaba puesto, no se toca')
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
    print('app.js: tool-fantasma puesto ✅  (%d retoques)' % len(CAMBIOS))
    print('        ahora: regenera SYMBOLS.md y pasa tests/test_symbols_sync.js')
    return 0


if __name__ == '__main__':
    sys.exit(main())
