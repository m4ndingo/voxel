#!/usr/bin/env python3
# @area: mundo
#
# REQ-UNDO1b · Quitar la heuristica de reloj: el roto y lo que levanta se unen POR CAUSA.
#
# DE DONDE VIENE. `parche_app_undo_construccion.py` dejo el historial funcionando, pero unia el bloque
# roto con la casa por una VENTANA DE TIEMPO (`MC_LOTE_ABSORBE_MS`, 2 s): «si se construye algo justo
# despues de romper, sera por eso». Funciona, pero es adivinar. El dueño lo corto en seco (2026-08-28):
#   «haz que alRomper devuelva su promesa»
#
# LA CADENA, que ahora es de verdad y no de reloj:
#   1. `alRomper` DEVUELVE la promesa de `game.snippet(...)`   (snippet `mundo-autoarranque`)
#   2. el envoltorio de `mcBreak` la devuelve hacia arriba      (mismo snippet)
#   3. `mcDoAction` —que es de app.js— la recibe y la espera    (esto)
# Asi el motor sabe EXACTAMENTE cuando ha terminado la construccion, y el gesto se cierra cuando de
# verdad ha acabado, no cuando vence un cronometro.
#
# ⚠️ Y sigue sin pedirle al snippet que sepa nada de deshacer: devolver una promesa es lo que hace
# cualquier funcion asincrona. En ningun sitio del snippet aparece `hist`, `gesto` ni `undo` — que es
# la condicion que puso el dueño: «los snippet tienen que ser lo mas agnosticos posibles».
#
# DOS VARIABLES, y hacen falta las dos separadas:
#   · `mcRotoPend`     = la entrada `{t:'b'}` del roto que todavia puede absorberse en el lote.
#                        Se compara POR IDENTIDAD contra la cima del historial: si algo mas empujo
#                        entremedias, ya no es la cima y no se absorbe. Cero adivinacion.
#   · `mcRompeEnCurso` = la construccion sigue en marcha. Impide que un volcado intermedio cierre el
#                        gesto a medias y parta la casa en dos entradas (dos `z`).
#
#     python3 herramientas/parche_app_undo_promesa.py --comprobar
#     python3 herramientas/parche_app_undo_promesa.py
import argparse
import os
import sys

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'app.js')

CAMBIOS = [
    (
        'fuera el cronometro, dentro las dos banderas de causa',
        """const MC_LOTE_ABSORBE_MS=2000;   // ventana para dar por causado por un roto lo que se construye tras el
let mcLote=null, mcLoteCelda=null;""",
        """let mcLote=null, mcLoteCelda=null;
// REQ-UNDO1b · el roto y lo que levanta son UN gesto, y se sabe por CAUSA y no por reloj: `mcBreak`
// devuelve la promesa del `alRomper` que haya disparado (la pone el snippet `mundo-autoarranque`), asi
// que aqui se sabe cuando termina la construccion de verdad.
let mcRotoPend=null;        // entrada {t:'b'} del roto que aun puede absorberse en el lote
let mcRompeEnCurso=false;   // la construccion sigue: NO cerrar el gesto todavia o saldria partido""",
    ),
    (
        'absorber el roto por identidad, no porque sea reciente',
        """    const u=mc.hist[mc.hist.length-1];
    if(u && u.t==='b' && (Date.now()-(u.ms||0))<MC_LOTE_ABSORBE_MS){
      mc.hist.pop();""",
        """    // Se compara POR IDENTIDAD contra la cima: si algo empujo entremedias, ese roto ya no manda.
    if(mcRotoPend && mc.hist[mc.hist.length-1]===mcRotoPend){
      const u=mcRotoPend; mcRotoPend=null;
      mc.hist.pop();""",
    ),
    (
        'el gesto no se cierra mientras la construccion sigue',
        """  if(!mcLote) return;
  if(mcPendCarga.size) return;                  // aun llegan materiales: el gesto no ha terminado""",
        """  if(!mcLote) return;
  if(mcRompeEnCurso) return;                    // el alRomper que lo causo aun no ha terminado
  if(mcPendCarga.size) return;                  // aun llegan materiales: el gesto no ha terminado""",
    ),
    (
        'mcDoAction espera lo que devuelva mcBreak',
        """  if(btn===0) mcBreak(); else if(btn===2) mcUseRight(); mcRevealHotbar();   // dibujar/romper trae la hotbar de vuelta""",
        """  if(btn===0) mcTrasRomper(mcBreak()); else if(btn===2) mcUseRight(); mcRevealHotbar();   // dibujar/romper trae la hotbar de vuelta""",
    ),
    (
        'mcTrasRomper: engancha el roto con lo que ese roto levante',
        """function mcBreak(){""",
        """// REQ-UNDO1b · Lo que `mcBreak` haya devuelto. Sin `mundo-autoarranque` cargado devuelve undefined y
// esto no hace nada: un roto normal sigue siendo su propia entrada de historial, como siempre.
// Con el snippet cargado devuelve la promesa del `alRomper`, y entonces el roto queda «abierto» hasta
// que la construccion acabe, para que los dos sean UNA sola entrada y una sola `z`.
function mcTrasRomper(p){
  const u=mc.hist[mc.hist.length-1];
  mcRotoPend=(u && u.t==='b') ? u : null;
  if(!(p && typeof p.then==='function')){ mcRotoPend=null; return; }   // nadie construyo nada
  mcRompeEnCurso=true;
  // `fin` corre TAMBIEN si el alRomper revienta: un snippet invitado que lance no puede dejar el
  // historial bloqueado para siempre (seria peor que el bug que esto arregla).
  const fin=()=>{ mcRompeEnCurso=false; mcRotoPend=null; mcCierraLote(); };
  Promise.resolve(p).then(fin, fin);
}
function mcBreak(){""",
    ),
    (
        'la marca de hora ya no la usa nadie',
        """  if(en.ms===undefined) en.ms=Date.now();        // REQ-UNDO1: la usa mcApuntaLote para absorber el roto
""",
        """""",
    ),
]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--comprobar', action='store_true')
    p.add_argument('--app', default=APP)
    a = p.parse_args()

    src = open(a.app, encoding='utf-8').read()
    nuevo, hechos, ya = src, [], []

    for que, viejo, bueno in CAMBIOS:
        if bueno and bueno in nuevo:
            ya.append(que)
            continue
        n = nuevo.count(viejo)
        if n != 1:
            print('⛔ el ancla de «%s» aparece %d veces (esperaba 1).\n'
                  '   ¿has aplicado antes parche_app_undo_construccion.py? No lo toco.' % (que, n))
            return 2
        nuevo = nuevo.replace(viejo, bueno)
        hechos.append(que)

    for q in ya:
        print('   ya estaba · %s' % q)
    for q in hechos:
        print('   cambio    · %s' % q)
    if not hechos:
        print('nada que hacer.')
        return 0
    if a.comprobar:
        print('\n--comprobar: no he tocado nada.')
        return 0

    tmp = a.app + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(nuevo)
    os.replace(tmp, a.app)
    print('\naplicado en %s (%d → %d caracteres)' % (a.app, len(src), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
