#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""`sel-guia-preseleccion`: los ✚/▬ de la guía también con la selección A MEDIO HACER (1 solo clic).

Dueño (2026-08-28): «*cuando se hace una seleccion solamente con un click ya se puede hacer shift o
control rueda, sin esperar al segundo, pero eso no muestra los -+ y deberia*».

El motor ya trata ese caso en la rueda: con esquina fijada (`mc.selA`) y sin caja confirmada
(`mc.selBox`), Ctrl/⇧+rueda AUTO-CONFIRMA la caja con el bloque apuntado como esquina B y extruye
(`app.js`, «*Si hay esquina fijada (1 clic) pero aún no hay caja confirmada…*»). La guía, en cambio,
pedía caja hecha (`mcSelGuiaHayPieza`), así que el gesto funcionaba A CIEGAS: se extruía sin haber visto
por dónde. Aquí se dibuja sobre LA MISMA caja que se confirmaría —esquina fijada + celda apuntada—, con
la misma cuenta del rayo que hace la rueda, para que lo pintado y lo que pasará sean lo mismo.

Parcheo EN CALIENTE (Ley de Oro): no toca `app.js`. Envuelve las cuatro puertas de la guía y la caja
fantasma entra por ellas; el dibujo, los topes y los glifos son los del motor, aquí no se repite nada.

  game.selGuiaPre.on() / .off() / .conmutar() / .estado() / .caja()

Publica por POST /api/snippets (papelera + escritura atómica), nunca escribiendo el .json a mano.
"""
import json, os, sys, urllib.request, urllib.error

API = os.environ.get('VOXEL_API', 'http://localhost:8500')
ID = 'sel-guia-preseleccion'
NOMBRE = '🎯 Selección · los ✚/▬ también con un solo clic (caja a medio hacer)'

CODE = r"""// ── 🎯 sel-guia-preseleccion · la guía ✚/▬ con la selección A MEDIO HACER ─────────────────────────
//
// Dueño (2026-08-28): «*cuando se hace una seleccion solamente con un click ya se puede hacer shift o
// control rueda, sin esperar al segundo, pero eso no muestra los -+ y deberia*».
//
// EL DESAJUSTE. Con un clic hay ESQUINA FIJADA (`mc.selA`) pero todavía no hay CAJA (`mc.selBox`). La
// rueda de `app.js` ya sabe qué hacer con eso: auto-confirma la caja tomando el bloque apuntado como
// esquina B y extruye. La guía no: pedía caja hecha, así que el gesto salía a ciegas —justo el gesto
// para el que se hizo la guía—.
//
// LA CAJA FANTASMA es LA MISMA que confirmaría la rueda: `mc.selA` + la celda del rayo, y si el rayo no
// da en nada, `mc.selA` consigo misma (una celda), que es lo que hace el motor. Se calcula con el mismo
// `mcRaycast()` y la misma condición `cell[1] >= 0`, no con una cuenta parecida: si lo pintado y lo que
// pasará al girar la rueda no salen de la misma línea, la guía miente en cuanto una de las dos cambie.
//
// POR DÓNDE ENTRA. Cuatro envolturas, ninguna copia de la lógica del motor:
//   mcSelGuiaHayPieza → «hay pieza» también si hay fantasma (si no, `mcSelGuiaToca` corta y no se pinta)
//   mcSelGuiaCeldas   → tras las cajas de verdad, suelta las celdas de la fantasma (con `ci` propio)
//   mcSelGuiaFirma    → la fantasma se mueve con la MIRA: sin meterla en la firma, se pintaría una vez
//                       y se quedaría clavada mientras el jugador apunta a otro sitio
//   mcSelGuiaRepinta  → limpia la caché del rayo al empezar el frame (la del motor hace igual con el
//                       cúmulo en vuelo)
// La silueta, los topes, los glifos y el color los pone el motor: aquí sólo se le dan más celdas.
//
// ⚠️ `ci` (índice de caja) va en la clave de cada fila a propósito: dos cajas pueden compartir fila a
// distinta profundidad y son dos caras, no una (REQ-SEL1). La fantasma es una caja más ⇒ `ci` propio,
// el siguiente a las de verdad. Con Shift+clic (`mc.selSuma`) la rueda la AÑADE a las que ya hay, así
// que se dibujan todas: las confirmadas por su cuenta y la fantasma por la suya.
//
// ⛔ NO SE TOCA `app.js` (Ley de Oro): esto nace aislado y se valida en caliente.

const W = window;
if(typeof mc === 'undefined' || typeof W.mcSelGuiaHayPieza !== 'function'){
  toast('sel-guia-preseleccion: este motor no trae la guía ✚/▬ (REQ-EXTRU5). Nada que ampliar.', 6);
  return 'sel-guia-preseleccion · sin guía en el motor';
}
// APROBADO Y ATERRIZADO (2026-08-28, «*funciona, aplicar el parche*»): `app.js` ya trae la fantasma. Este
// snippet se aparta en vez de envolver: envolviendo, la caja se recorrería DOS VECES por frame —hasta el
// tope, 200 000 celdas— para pintar exactamente lo mismo. Se queda por la Ley de Oro (así nació y así se
// valida contra un motor sin el parche), no porque haga falta.
if(typeof W.mcSelGuiaFantasma === 'function'){
  W.game.selGuiaPre = {
    on: () => 'el motor ya lo trae', off: () => 'el motor ya lo trae', conmutar: () => 'el motor ya lo trae',
    caja: () => (typeof mcSelGuiaFantasma === 'function' ? mcSelGuiaFantasma() : null),
    estado: () => ({ activo: false, enElMotor: true, fantasma: mcSelGuiaFantasma(),
                     ayuda: 'Aterrizado en app.js: un clic con Seleccionar y mantén Shift o Ctrl.' })
  };
  toast('sel-guia-preseleccion: este motor YA lo trae de serie (aterrizado en app.js). Snippet innecesario.', 6);
  return 'sel-guia-preseleccion · ya está en el motor';
}

// Una caja de 1 clic es pequeña por definición, pero el rayo puede caer lejísimos y dar una caja de
// medio mundo: recorrerla entera cada frame congelaría el juego. Pasado el tope no se promete nada —el
// motor tiene sus propios topes de glifos, este es el del RECORRIDO, que va antes.
const TOPE_VOL = 200000;
const ENVUELTAS = ['mcSelGuiaHayPieza', 'mcSelGuiaCeldas', 'mcSelGuiaFirma', 'mcSelGuiaRepinta'];

let vivo = false;
let cacheF = null;                 // caché de UN frame: `mcSelGuiaRepinta` la tira al empezar

// La caché lleva SELLO además de durar un frame. Por frame basta para el juego (la mira se mueve sola y
// `mcSelGuiaRepinta` la tira al empezar), pero quien pregunte FUERA del frame —una sonda, la consola, el
// propio `estado()`— vería la caja del frame anterior: fijar la esquina y preguntar sin que haya pasado
// un frame por medio devolvía la selección de antes. Con sello, cambiar de herramienta, de esquina o de
// terreno la invalida al momento; el rayo se sigue tirando una vez por frame, que es lo que costaba.
function selloFantasma(){
  return (mc.pasteActive ? 1 : 0) + '|' + mc.tool + '|' + (mc.selA ? mc.selA.join(',') : '-') +
         '|' + (mc.selBox ? 1 : 0) + '|' + mc.selCajas.length + '|' + (mc.gridGen | 0);
}

// La caja que la rueda confirmaría AHORA MISMO, o null si no estamos en ese momento.
function cajaFantasma(){
  const sello = selloFantasma();
  if(cacheF && cacheF.sello === sello) return cacheF.v;
  let v = null;
  if(!mc.pasteActive && mc.tool === 'select' && mc.selA && !mc.selBox){
    const near = mcRaycast();                                  // el mismo rayo que la rueda de app.js
    const b = (near && near.cell[1] >= 0) ? near.cell.slice() : mc.selA.slice();
    const a = mc.selA.slice();
    const vol = (Math.abs(a[0]-b[0])+1) * (Math.abs(a[1]-b[1])+1) * (Math.abs(a[2]-b[2])+1);
    if(vol <= TOPE_VOL) v = { a, b, vol };
  }
  cacheF = { sello, v };
  return v;
}

// Las celdas CON BLOQUE de la fantasma, igual que `mcSelForEach` hace con las cajas de verdad: el aire
// no da cara, y prometer un ✚ colgando de la nada sería prometer lo que el extrusor no va a hacer.
function celdasDeLaFantasma(f, cb, ci){
  const x0 = Math.min(f.a[0], f.b[0]), x1 = Math.max(f.a[0], f.b[0]);
  const y0 = Math.min(f.a[1], f.b[1]), y1 = Math.max(f.a[1], f.b[1]);
  const z0 = Math.min(f.a[2], f.b[2]), z1 = Math.max(f.a[2], f.b[2]);
  for(let x = x0; x <= x1; x++) for(let y = y0; y <= y1; y++) for(let z = z0; z <= z1; z++){
    if(!mcInside(x, y, z)) continue;
    if(!mc.grid[mcIdx(x, y, z)]) continue;
    cb(x, y, z, ci);
  }
}

function desenvuelve(nombre){
  let f = W[nombre];
  while(f && f._selGuiaPre){ W[nombre] = f._orig; f = W[nombre]; }
}

function envuelve(nombre, hecha){
  desenvuelve(nombre);                                   // recargar el snippet no apila envolturas
  const orig = W[nombre];
  const nueva = hecha(orig);
  nueva._selGuiaPre = true;
  nueva._orig = orig;
  W[nombre] = nueva;
}

function on(){
  if(vivo) return 'ya estaba';
  envuelve('mcSelGuiaHayPieza', orig => function(){
    return !!orig.apply(this, arguments) || !!cajaFantasma();
  });
  envuelve('mcSelGuiaCeldas', orig => function(cb){
    const f = mc.pasteActive ? null : cajaFantasma();
    const r = orig.call(this, cb);                        // primero las cajas de verdad
    if(f) celdasDeLaFantasma(f, cb, mc.selCajas.length);  // …y la fantasma como una caja más
    return r;
  });
  envuelve('mcSelGuiaFirma', orig => function(){
    const s = orig.apply(this, arguments);
    if(!s) return s;                                      // guía apagada o sin gesto: no se pinta nada
    const f = cajaFantasma();
    return f ? s + '|pre:' + f.a.join(',') + '/' + f.b.join(',') : s;
  });
  envuelve('mcSelGuiaRepinta', orig => function(){
    cacheF = null;                                        // un rayo por frame, como el cúmulo en vuelo
    return orig.apply(this, arguments);
  });
  vivo = true;
  mc.selGuiaFirma = null;                                 // que el próximo frame repinte sí o sí
  return 'puesto';
}

function off(){
  if(!vivo) return 'ya estaba quitado';
  for(const n of ENVUELTAS) desenvuelve(n);
  cacheF = null;
  vivo = false;
  mc.selGuiaFirma = null;
  if(typeof mcSelGuiaLimpia === 'function' && !mcSelGuiaToca()) mcSelGuiaLimpia();
  return 'quitado';
}

function conmutar(){ return vivo ? off() : on(); }
function caja(){ cacheF = null; const f = cajaFantasma(); return f ? { a: f.a, b: f.b, celdas: f.vol } : null; }

function estado(){
  cacheF = null;
  const f = cajaFantasma();
  return {
    activo: vivo,
    guiaDelMotor: (mc.selGuia !== false),
    herramienta: mc.tool,
    esquinaFijada: mc.selA ? mc.selA.slice() : null,
    cajaConfirmada: !!mc.selBox,
    sumando: !!mc.selSuma,
    fantasma: f ? { a: f.a, b: f.b, celdas: f.vol } : null,
    modo: mc.selGuiaModo || '(ninguno)',
    dibujando: !!mc.selGuiaFirma,
    marcasMas: mc.selGuiaUltimo ? mc.selGuiaUltimo.mas.length : 0,
    marcasMenos: mc.selGuiaUltimo ? mc.selGuiaUltimo.menos.length : 0,
    topeVolumen: TOPE_VOL,
    ayuda: 'Un clic con Seleccionar y mantén Shift o Ctrl: los ✚/▬ salen ya sobre la caja que se confirmaría.'
  };
}

W.game.selGuiaPre = { on, off, conmutar, estado, caja };

const r = on();
toast('🎯 Con UN solo clic (sin confirmar caja) Shift/Ctrl ya enseñan ✚/▬ · game.selGuiaPre.off()', 6);
return 'sel-guia-preseleccion · ' + r;
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
