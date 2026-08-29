#!/usr/bin/env python3
# @area: mundo
#
# REQ-UNDO1 · Que `z` deshaga TAMBIEN lo que construye un snippet.
#
# EL FALLO (el dueño, 2026-08-28): rompes `hab:casita`, se levanta la casa, pulsas `z` y «no hace nada».
# Si hace: `mcBreak` apunta el bloque roto (app.js:16250) y ese vuelve. Lo que no vuelve es la casa,
# porque `mcSetVoxel` (app.js:21081) NO llama a `mcPushHist` NUNCA. Para el historial la casa no ha
# existido, asi que el bloque reaparece DENTRO de ella y parece que la tecla esta rota.
#
# LA ORDEN DEL DUEÑO, y es la que fija el sitio del arreglo (2026-08-28):
#   «el mcPushHist deberia de ser algo a nivel interno»
#   «los snippet tienen que ser lo mas agnosticos posibles a como funciona el motor, usar llamadas
#    sencillas sin conocer tantos detalles internos como estructuras, undos, etc.»
#   «si hace falta refactoriza app.js para que sin tocar el snippet de la casa funcione correctamente»
# Por eso esto NO se resuelve en el snippet: `construye-casa` se queda como esta, llamando a `setVoxel`
# y nada mas. Un snippet que hiciera `mc.hist.pop()` seria justo lo contrario de lo que se pide.
#
# LA IDEA, que no inventa maquinaria nueva: el motor YA agrupa las escrituras de script en un lote
# (`mcBuildBox`/`mcBuildN`, con volcado a los 80 ms de silencio) y ya lo cierra en UN sitio,
# `mcFlushBuild` (app.js:20990), que es quien re-malla y guarda. Ese lote ES el gesto. Solo faltaba que
# apuntara el antes/despues de cada celda y lo empujara al historial al cerrarse.
#
# LAS TRES PIEDRAS (cada una es un cambio de los de abajo, y ninguna es opcional):
#
#  1. EL MATERIAL PUEDE LLEGAR TARDE. Si no esta en la paleta, `mcSetVoxel` solo apunta la celda
#     (`mcPendCel`) y la escribe cuando aterriza la textura, por OTRO camino (app.js:21059) que tambien
#     acaba en `mcFlushBuild`. Se apunta en los dos sitios, y el lote NO se cierra mientras queden
#     cargas en vuelo (`mcPendCarga.size`): si se cerrara antes, la casa saldria partida en dos o tres
#     entradas de historial y harian falta tres `z` para deshacerla.
#
#  2. EL CLIC DERECHO CANCELA EL VOLCADO. `mcPonEnRejilla` (app.js:16362) limpia `mcBuildT/N/Box`
#     cuando no habia escrituras de script esperando, asi que ahi `mcFlushBuild` NO llega a correr. Un
#     lote abierto se quedaria colgado y se filtraria a la construccion siguiente, mezclando bloques que
#     no tienen nada que ver. Se limpia tambien el lote en ese punto.
#
#  3. EL BLOQUE ROTO Y LA CASA SON UN SOLO GESTO. El dueño lo pidio explicito: «deberia volver a salir
#     el bloque y desaparecer la casa» — UNA `z`, no dos. `mcBreak` ya empujo su `{t:'b'}` cuando el
#     `alRomper` arranca la construccion, asi que al abrirse un lote se mira si la ultima entrada del
#     historial es un roto RECIENTE y, si lo es, se absorbe como primera celda del lote.
#     ⚠️ Es una heuristica de VENTANA (`MC_LOTE_ABSORBE_MS`), no una relacion de causa demostrada: el
#     despacho de `alRomper` vive en el snippet `mundo-autoarranque` y no le dice nada al motor. Si
#     algun dia `alRomper` devuelve su promesa y el motor la espera, esto se cae y se hace de verdad.
#
# ⛔ Idempotente y POR ANCLA: cada ancla se exige EXACTA y UNA sola vez; si `app.js` cambio debajo,
# para en seco en vez de dejarlo a medias. Escritura atomica (temp + os.replace).
#
#     python3 herramientas/parche_app_undo_construccion.py --comprobar   # dice que haria, no toca nada
#     python3 herramientas/parche_app_undo_construccion.py
import argparse
import os
import sys

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'app.js')

MARCA = 'REQ-UNDO1'

CAMBIOS = [
    (
        'el lote de historial: variables y ayudantes',
        """let mcBuildT=0, mcBuildN=0, mcBuildBox=null;""",
        """let mcBuildT=0, mcBuildN=0, mcBuildBox=null;
// --- REQ-UNDO1 · el lote de escrituras de script TAMBIEN va al historial -------------------------
// `mcSetVoxel` no apuntaba nada, asi que una casa levantada por un snippet era invisible para `z`.
// El lote de construccion que ya existe (mcBuildBox/mcBuildN) hace de GESTO: se abre con la primera
// celda, absorbe las siguientes y se cierra en `mcFlushBuild` como UNA entrada {t:'bb'}.
const MC_LOTE_ABSORBE_MS=2000;   // ventana para dar por causado por un roto lo que se construye tras el
let mcLote=null, mcLoteCelda=null;
// Una celda escrita N veces es UNA entrada: el `before` de la PRIMERA y el `after` de la ULTIMA. Sin
// esto, deshacer una celda repintada la dejaria en el estado intermedio.
function mcApuntaLote(x,y,z,before,after){
  if(mc.histLock) return;                       // deshacer/rehacer escriben: no se re-apuntan a si mismos
  if(before===after) return;                    // sin cambio real
  if(!mcLote){
    mcLote=[]; mcLoteCelda=new Map();
    // ¿venimos de romper un bloque con comportamiento? Entonces el roto y lo que se levanta son el
    // MISMO gesto y una sola `z` tiene que deshacer los dos (orden del dueño, 2026-08-28).
    const u=mc.hist[mc.hist.length-1];
    if(u && u.t==='b' && (Date.now()-(u.ms||0))<MC_LOTE_ABSORBE_MS){
      mc.hist.pop();
      mcLote.push({x:u.x,y:u.y,z:u.z,before:u.before,after:u.after});
      mcLoteCelda.set(u.x+','+u.y+','+u.z, mcLote[0]);
    }
  }
  const k=x+','+y+','+z, e=mcLoteCelda.get(k);
  if(e){ e.after=after; return; }
  const n={x,y,z,before,after};
  mcLoteCelda.set(k,n); mcLote.push(n);
}
function mcOlvidaLote(){ mcLote=null; mcLoteCelda=null; }
// Se cierra cuando NO queda textura en vuelo: si se cerrara antes, las celdas que esperaban material
// caerian en otra entrada y la casa necesitaria dos o tres `z`.
function mcCierraLote(){
  if(!mcLote) return;
  if(mcPendCarga.size) return;                  // aun llegan materiales: el gesto no ha terminado
  const edits=mcLote.filter(e=>e.before!==e.after);
  mcOlvidaLote();
  if(edits.length) mcPushHist({t:'bb', edits});
}""",
    ),
    (
        'mcFlushBuild cierra el lote (es el unico sitio donde acaba una rafaga)',
        """  if(mc.active) mcUnstick(); mcScheduleSave();""",
        """  if(mc.active) mcUnstick(); mcScheduleSave();
  mcCierraLote();                               // REQ-UNDO1: la rafaga termina aqui ⇒ una entrada de historial""",
    ),
    (
        'mcSetVoxel apunta el antes/despues de cada celda',
        """  mcSetBlock(x,y,z, id); mcBuildN++; mcMarcaBuild(x,z);""",
        """  const _antesLote=mc.grid[mcIdx(x,y,z)];       // REQ-UNDO1
  mcSetBlock(x,y,z, id); mcBuildN++; mcMarcaBuild(x,z);
  mcApuntaLote(x,y,z,_antesLote,id);            // REQ-UNDO1""",
    ),
    (
        'la textura que llega tarde tambien se apunta',
        """      mcSetBlock(+p[0],+p[1],+p[2], id); mcMarcaBuild(+p[0],+p[2]); n++;""",
        """      const _lx=+p[0], _ly=+p[1], _lz=+p[2], _antesLote=mc.grid[mcIdx(_lx,_ly,_lz)];   // REQ-UNDO1
      mcSetBlock(_lx,_ly,_lz, id); mcMarcaBuild(_lx,_lz); n++;
      mcApuntaLote(_lx,_ly,_lz,_antesLote,id);  // REQ-UNDO1""",
    ),
    (
        'una carga que falla no puede dejar el lote abierto para siempre',
        """    mcPendCarga.delete(key); mcOlvidaPendientes(key);
    console.warn('setVoxel: no he podido cargar «'+key+'»', e);""",
        """    mcPendCarga.delete(key); mcOlvidaPendientes(key);
    mcCierraLote();                             // REQ-UNDO1: si no, el gesto se queda abierto y se filtra al siguiente
    console.warn('setVoxel: no he podido cargar «'+key+'»', e);""",
    ),
    (
        'el clic derecho cancela el volcado ⇒ tiene que cancelar el lote',
        """  if(!pendientes && !mc.batching){ clearTimeout(mcBuildT); mcBuildT=0; mcBuildN=0; mcBuildBox=null; mcMat2id={};""",
        """  // REQ-UNDO1: aqui NO llega a correr `mcFlushBuild`, asi que el lote hay que soltarlo a mano o se
  // queda abierto y se cuela en la construccion siguiente. El clic ya lleva su propio `mcPushHist`.
  if(!pendientes && !mc.batching){ mcOlvidaLote();
    clearTimeout(mcBuildT); mcBuildT=0; mcBuildN=0; mcBuildBox=null; mcMat2id={};""",
    ),
    (
        'sellar la hora en cada entrada (la ventana de absorcion la necesita)',
        """  mc.hist.push(en); if(mc.hist.length>MC_HIST_MAX) mc.hist.shift(); mc.histRedo.length=0;""",
        """  if(en.ms===undefined) en.ms=Date.now();        // REQ-UNDO1: la usa mcApuntaLote para absorber el roto
  mc.hist.push(en); if(mc.hist.length>MC_HIST_MAX) mc.hist.shift(); mc.histRedo.length=0;""",
    ),
]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--comprobar', action='store_true', help='decir que haria y salir sin tocar nada')
    p.add_argument('--app', default=APP)
    a = p.parse_args()

    src = open(a.app, encoding='utf-8').read()
    nuevo, hechos, ya = src, [], []

    for que, viejo, bueno in CAMBIOS:
        if bueno in nuevo:
            ya.append(que)
            continue
        n = nuevo.count(viejo)
        if n != 1:
            print('⛔ el ancla de «%s» aparece %d veces (esperaba 1).\n'
                  '   app.js ha cambiado debajo: no lo toco, mira a mano.' % (que, n))
            return 2
        nuevo = nuevo.replace(viejo, bueno)
        hechos.append(que)

    for q in ya:
        print('   ya estaba · %s' % q)
    for q in hechos:
        print('   cambio    · %s' % q)
    if not hechos:
        print('nada que hacer: app.js ya tiene %s.' % MARCA)
        return 0
    if a.comprobar:
        print('\n--comprobar: no he tocado nada. Quita la bandera para aplicarlo.')
        return 0

    tmp = a.app + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(nuevo)
    os.replace(tmp, a.app)
    print('\naplicado en %s (%d → %d caracteres)' % (a.app, len(src), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
