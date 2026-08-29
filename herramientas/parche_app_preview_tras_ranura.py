#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Baja a `web/app.js` el snippet `preview-tras-ranura`, ya validado por el dueño en caliente.

Dueño (2026-08-28): «*cuando cambio de herramienta de seleccion a pico, si el pico tiene una estructura
no quiero que salga el preview hasta que de al boton de la ranura; si sigo dando botones de ranura
saldran los previews, pero si solamente cambio esa tool no tiene que salir*» · «*desde cualquier
herramienta a pico me refiero*» (pico = construir) · «*funciona correcto aplicar parche*».

CAMBIAR DE HERRAMIENTA y ELEGIR QUÉ COLOCAR son dos decisiones; el motor las trataba como una. Aquí se
separan con un pestillo (`mc.previewMudo`): cambiar de herramienta lo echa, pulsar una ranura lo quita.

5 anclas, todas idempotentes (si ya está la MARCA, no se toca nada):
  1) `structGhostAlpha:1,`            → declara el pestillo `previewMudo` en el estado `mc`
  2) antes de `mcUpdatePreview`       → mcPreviewCallada() / mcPreviewCalla() / mcPreviewHabla()
  3) la condición `on` de mcUpdatePreview → calla la MALLA translúcida
  4) `const showStruct=` en mcDrawOverlays → calla la CAJA DE HUELLA verde (las dos piezas o nada)
  5) `mc.tool=v;` en mcSetPlayerTool  → echa el pestillo SÓLO si la herramienta cambia de verdad
  6) `function mcSelectSlot()`        → lo quita: pulsar ranura = «esto es lo que quiero colocar»

  python3 herramientas/parche_app_preview_tras_ranura.py --comprobar   # ensayo, no escribe
  python3 herramientas/parche_app_preview_tras_ranura.py
"""
import os, sys, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(RAIZ, 'web', 'app.js')
MARCA = 'mcPreviewCallada'

ANCLA_ESTADO = "  structGhostAlpha:1,"
NUEVO_ESTADO = """  previewMudo:false,              // pestillo del fantasma de estructura: cambiar de herramienta lo echa, pulsar una ranura lo quita (ver mcPreviewCalla)
"""

ANCLA_HELPERS = "// Mantiene mc.preview: mientras se apunta con una ranura de estructura, construye (o reubica)"
NUEVO_HELPERS = """// El fantasma de estructura SE PIDE, NO SE IMPONE (2026-08-28, orden del dueño). Cambiar de herramienta y
// elegir qué colocar son DOS decisiones: la ranura activa se queda como estaba al irse a Seleccionar, así
// que al volver al pico aparecía media habitación translúcida delante de la cara sin que nadie la pidiera.
// El pestillo `mc.previewMudo` las separa: cambiar de herramienta lo echa (mcSetPlayerTool), pulsar una
// ranura lo quita (mcSelectSlot) —la que sea, incluso la MISMA: el jugador está diciendo «ésta, la de ahora».
// Callan LAS DOS PIEZAS del fantasma de estructura: la malla translúcida (mcUpdatePreview) y la caja de
// huella verde (mcDrawOverlays). Callar sólo una deja el contorno flotando y no arregla nada.
// ⛔ El fantasma de BLOQUE SUELTO (mc.ghostAlpha) y el de las NOTAS no se tocan: son otra cosa.
function mcPreviewCallada(){   // ¿hay ahora mismo un fantasma de estructura callado por el pestillo?
  // Colocando notas NO: ése es otro fantasma y su gesto ya es explícito (nadie entra en modo nota sin querer).
  return !!mc.previewMudo && !mc.notePlacing && !!(mc.slotStruct && mc.slotStruct[mc.sel]);
}
function mcPreviewCalla(){
  if(mc.previewMudo) return;
  mc.previewMudo = true;
  // La malla ya construida se tira AHORA: si no, el fantasma anterior se quedaría colgado hasta que algo
  // más lo invalidara, y el jugador vería justo lo que ha pedido no ver.
  if(mc.preview||mc.previewKey||mc.previewStructKey) mcClearPreview();
}
function mcPreviewHabla(){ mc.previewMudo = false; }

"""

ANCLA_MALLA = ("  const on = mc.active && !mc._guardada && (isNotePlace || (!mcToolPasiva() && sk)) "
               "&& mcMandoActivo() && mc.structGhostAlpha>0;")
NUEVO_MALLA = ("  const on = mc.active && !mc._guardada && (isNotePlace || (!mcToolPasiva() && sk)) "
               "&& mcMandoActivo() && mc.structGhostAlpha>0 && !mcPreviewCallada();")

ANCLA_HUELLA = "  const showStruct=structLines.length && mc.structGhostAlpha>0;"
NUEVO_HUELLA = ("  const showStruct=structLines.length && mc.structGhostAlpha>0 && !mcPreviewCallada();"
                "   // el pestillo calla la caja de huella igual que la malla: las dos piezas o ninguna")

ANCLA_TOOL = "  v=(v==='box'||v==='paint'||v==='select'||v==='pick'||mcHerrDef(v))?v:'build'; mc.tool=v;"
NUEVO_TOOL = """  const toolAntes = mc.tool;
  v=(v==='box'||v==='paint'||v==='select'||v==='pick'||mcHerrDef(v))?v:'build'; mc.tool=v;
  // ⚠️ SÓLO SI CAMBIA DE VERDAD: aquí se entra también para reafirmar la herramienta que ya hay (la rueda,
  // la consola, un snippet). Callar el fantasma que el jugador acaba de pedir sería el mismo fallo al revés.
  if(mc.tool !== toolAntes) mcPreviewCalla();"""

ANCLA_SLOT = "function mcSelectSlot(){ "
NUEVO_SLOT = "function mcSelectSlot(){ mcPreviewHabla();   // pulsar ranura = «esto es lo que quiero colocar»: devuelve el fantasma de estructura\n  "


def sustituye_una(txt, ancla, nuevo, etiqueta):
    n = txt.count(ancla)
    if n != 1:
        print('ANCLA «%s»: aparece %d veces (esperaba 1). No se toca nada.' % (etiqueta, n), file=sys.stderr)
        return None
    return txt.replace(ancla, nuevo, 1)


def main():
    comprobar = '--comprobar' in sys.argv
    with open(APP, encoding='utf-8') as f:
        txt = f.read()
    if MARCA in txt:
        print('Ya aplicado (encontrada la marca «%s»). Nada que hacer.' % MARCA)
        return 0
    antes = len(txt)

    pasos = [
        (ANCLA_ESTADO, NUEVO_ESTADO + ANCLA_ESTADO, 'estado mc.previewMudo'),
        (ANCLA_HELPERS, NUEVO_HELPERS + ANCLA_HELPERS, 'mcPreviewCallada/Calla/Habla'),
        (ANCLA_MALLA, NUEVO_MALLA, 'malla translúcida (mcUpdatePreview)'),
        (ANCLA_HUELLA, NUEVO_HUELLA, 'caja de huella (mcDrawOverlays)'),
        (ANCLA_TOOL, NUEVO_TOOL, 'cambio de herramienta (mcSetPlayerTool)'),
        (ANCLA_SLOT, NUEVO_SLOT, 'pulsar ranura (mcSelectSlot)'),
    ]
    for ancla, nuevo, etiqueta in pasos:
        txt = sustituye_una(txt, ancla, nuevo, etiqueta)
        if txt is None:
            return 1
        print('  ok · %s' % etiqueta)

    print('%d anclas · %+d bytes' % (len(pasos), len(txt) - antes))
    if comprobar:
        print('--comprobar: no se ha escrito nada.')
        return 0

    d = os.path.dirname(APP)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.app.js.', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(txt)
        os.replace(tmp, APP)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    print('Escrito %s' % APP)
    return 0


if __name__ == '__main__':
    sys.exit(main())
