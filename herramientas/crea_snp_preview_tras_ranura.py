#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""`preview-tras-ranura`: cambiar de herramienta NO enseña el fantasma de la estructura; hay que pedirlo
pulsando una ranura.

Dueño (2026-08-28): «*cuando cambio de herramienta de seleccion a pico, si el pico tiene una estructura
no quiero que salga el preview hasta que de al boton de la ranura; si sigo dando botones de ranura
saldran los previews, pero si solamente cambio esa tool no tiene que salir*» y «*desde cualquier
herramienta a pico me refiero*» (pico = construir).

Cambiar de herramienta y elegir qué colocar son DOS decisiones. El motor las juntaba: con una estructura
en la ranura activa, el simple hecho de coger el pico plantaba media habitación translúcida delante de la
cara. Aquí el fantasma se calla al cambiar de herramienta y vuelve en cuanto se pulsa una ranura (la que
sea, incluso la misma), que es cuando el jugador ha dicho QUÉ quiere colocar.

Se callan LAS DOS PIEZAS del fantasma de estructura (lo que `game.structGhostAlpha` llama así): la malla
translúcida (`mc.preview`) y la caja de huella verde. Dejar una de las dos sería no arreglar nada.
⛔ NO se toca el fantasma de bloque suelto ni el de las notas: el dueño habló de estructuras.

Parcheo EN CALIENTE (Ley de Oro): no toca `app.js`.

  game.previewRanura.on() / .off() / .conmutar() / .estado()

Publica por POST /api/snippets (papelera + escritura atómica), nunca escribiendo el .json a mano.
"""
import json, os, sys, urllib.request, urllib.error

API = os.environ.get('VOXEL_API', 'http://localhost:8500')
ID = 'preview-tras-ranura'
NOMBRE = '🫥 Construir · el fantasma de estructura no sale al cambiar de herramienta, sino al pulsar ranura'

CODE = r"""// ── 🫥 preview-tras-ranura · el fantasma de estructura se pide, no se impone ──────────────────────
//
// Dueño (2026-08-28): «*cuando cambio de herramienta de seleccion a pico, si el pico tiene una estructura
// no quiero que salga el preview hasta que de al boton de la ranura; si sigo dando botones de ranura
// saldran los previews, pero si solamente cambio esa tool no tiene que salir*» · «*desde cualquier
// herramienta a pico me refiero*».
//
// CAMBIAR DE HERRAMIENTA Y ELEGIR QUÉ COLOCAR SON DOS DECISIONES, y el motor las trataba como una: la
// ranura activa se queda como estaba al irse a Seleccionar, así que al volver al pico aparecía media
// habitación translúcida delante de la cara sin que nadie la hubiese pedido. El pestillo `mc._previewMudo`
// separa las dos: cambiar de herramienta lo echa, pulsar una ranura lo quita.
//
// SE CALLAN LAS DOS PIEZAS del fantasma de estructura —lo que `game.structGhostAlpha` llama así en el
// motor—: la MALLA translúcida (`mc.preview`, la construye `mcUpdatePreview`) y la CAJA DE HUELLA verde
// (`structLines`, la dibuja `mcDrawOverlays`). Callar sólo una deja el contorno flotando y no arregla
// nada. ⛔ El fantasma de BLOQUE SUELTO (`game.ghostAlpha`) y el de las NOTAS no se tocan: son otra cosa
// y el dueño habló de estructuras.
//
// QUIÉN LO QUITA. `mcSelectSlot` es la puerta ÚNICA por la que pasa «he pulsado una ranura», venga de la
// tecla 1-9, del clic en la hotbar o de elegir un bloque en el selector (`mcAssignSlot`). Por eso el
// pestillo se levanta ahí y no en un `mc.sel` que cambie solo: pulsar la MISMA ranura también cuenta —el
// jugador está diciendo «esta, la de ahora», y merece ver lo que va a plantar.
//
// ⚠️ SÓLO SI LA HERRAMIENTA CAMBIA DE VERDAD: `mcSetPlayerTool` se llama también para reafirmar la que ya
// hay (la rueda de herramientas, la consola, un snippet). Callar el fantasma que el jugador acaba de
// pedir, porque algo reafirmó la herramienta que ya tenía, sería el mismo fallo al revés.
//
// ⛔ NO SE TOCA `app.js` (Ley de Oro): esto nace aislado y se valida en caliente.

const W = window;
if(typeof mc === 'undefined' || typeof W.mcUpdatePreview !== 'function' || typeof W.mcDrawOverlays !== 'function'){
  toast('preview-tras-ranura: este motor no trae la vista-previa de estructuras. Nada que hacer.', 6);
  return 'preview-tras-ranura · sin vista-previa en el motor';
}
// YA BAJADO A `app.js` (2026-08-28, tras validarlo el dueño): el pestillo vive en el motor —`mcPreviewCallada`
// / `mcPreviewCalla` / `mcPreviewHabla`, guardián `tests/test_preview_ranura.js`—. Envolver encima duplicaría
// el trabajo y volvería a apagar el fantasma que la ranura acaba de encender. Este snippet se aparta.
if(typeof W.mcPreviewCallada === 'function'){
  return 'preview-tras-ranura · ya está en app.js (mcPreviewCallada); el snippet se aparta';
}

let vivo = false;
const ENVUELTAS = ['mcSetPlayerTool', 'mcSelectSlot', 'mcUpdatePreview', 'mcDrawOverlays'];

// ¿hay ahora mismo un fantasma de estructura que callar? Colocando notas NO: ése es otro fantasma y su
// gesto ya es explícito (nadie entra en modo nota sin querer).
function callado(){
  return !!mc._previewMudo && !mc.notePlacing && !!(mc.slotStruct && mc.slotStruct[mc.sel]);
}

function calla(){
  if(mc._previewMudo) return;
  mc._previewMudo = true;
  // La malla ya construida se tira AHORA: si no, se quedaría el fantasma anterior colgado hasta que
  // algo más la invalidara, y el jugador vería justo lo que ha pedido no ver.
  if(typeof mcClearPreview === 'function' && (mc.preview || mc.previewKey || mc.previewStructKey)) mcClearPreview();
}

function habla(){ mc._previewMudo = false; }

function desenvuelve(nombre){
  let f = W[nombre];
  while(f && f._previewRanura){ W[nombre] = f._orig; f = W[nombre]; }
}

function envuelve(nombre, hecha){
  desenvuelve(nombre);                                   // recargar el snippet no apila envolturas
  const orig = W[nombre];
  const nueva = hecha(orig);
  nueva._previewRanura = true;
  nueva._orig = orig;
  W[nombre] = nueva;
}

function on(){
  if(vivo) return 'ya estaba';
  envuelve('mcSetPlayerTool', orig => function(){
    const antes = mc.tool;
    const r = orig.apply(this, arguments);
    if(mc.tool !== antes) calla();                       // sólo si CAMBIA de verdad
    return r;
  });
  envuelve('mcSelectSlot', orig => function(){
    habla();                                             // pulsar ranura = «esto quiero colocar»
    return orig.apply(this, arguments);
  });
  envuelve('mcUpdatePreview', orig => async function(){
    if(callado()){
      if(mc.preview || mc.previewKey || mc.previewStructKey) mcClearPreview();
      return;
    }
    return orig.apply(this, arguments);
  });
  // La caja de huella se dibuja dentro de `mcDrawOverlays` y sólo si `mc.structGhostAlpha > 0`. Se pone a
  // cero SÓLO durante esa llamada (con `finally`, que un fallo del render no deje el mundo sin fantasmas
  // para siempre): así no se pisa el ajuste del dueño ni se apaga el fantasma de las notas, que lo mira
  // por su cuenta en otro momento del frame.
  envuelve('mcDrawOverlays', orig => function(){
    if(!callado() || !(mc.structGhostAlpha > 0)) return orig.apply(this, arguments);
    const guardada = mc.structGhostAlpha;
    mc.structGhostAlpha = 0;
    try { return orig.apply(this, arguments); }
    finally { mc.structGhostAlpha = guardada; }
  });
  vivo = true;
  mc._previewMudo = false;                               // se arranca hablando: aún no ha cambiado nada
  return 'puesto';
}

function off(){
  if(!vivo) return 'ya estaba quitado';
  for(const n of ENVUELTAS) desenvuelve(n);
  vivo = false;
  mc._previewMudo = false;
  return 'quitado';
}

function conmutar(){ return vivo ? off() : on(); }

function estado(){
  return {
    activo: vivo,
    callado: callado(),
    pestillo: !!mc._previewMudo,
    herramienta: mc.tool,
    ranura: mc.sel,
    estructuraEnRanura: (mc.slotStruct && mc.slotStruct[mc.sel]) || null,
    mallaViva: !!mc.preview,
    alfaFantasma: mc.structGhostAlpha,
    colocandoNota: !!mc.notePlacing,
    ayuda: 'Cambia de herramienta y el fantasma calla; pulsa una ranura (1-9 o clic) y vuelve.'
  };
}

W.game.previewRanura = { on, off, conmutar, estado };

const r = on();
toast('🫥 El fantasma de estructura ya no sale al cambiar de herramienta: pulsa su ranura · game.previewRanura.off()', 6);
return 'preview-tras-ranura · ' + r;
"""


def publicar():
    data = {'id': ID, 'name': NOMBRE, 'code': CODE}
    cuerpo = json.dumps(data, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(API + '/api/snippets', data=cuerpo, method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        print('Publicado por POST /api/snippets · %s' % ID)
        return True
    except (urllib.error.URLError, OSError) as e:
        print('No se pudo publicar por HTTP (%s). El servidor tiene que estar en pie: '
              'python3 server.py 8500' % e, file=sys.stderr)
        return False


if __name__ == '__main__':
    sys.exit(0 if publicar() else 1)
