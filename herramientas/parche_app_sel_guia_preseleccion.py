#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Baja a `app.js` la CAJA FANTASMA de la guía ✚/▬, validada en el snippet `sel-guia-preseleccion`.

Dueño (2026-08-28): «*cuando se hace una seleccion solamente con un click ya se puede hacer shift o
control rueda, sin esperar al segundo, pero eso no muestra los -+ y deberia*»; y tras probarlo:
«*funciona, aplicar el parche*».

La rueda de `app.js` ya trataba ese momento: con esquina fijada (`mc.selA`) y sin caja confirmada
(`mc.selBox`), Ctrl/⇧+rueda AUTO-CONFIRMA la caja con el bloque apuntado como esquina B y extruye. La
guía pedía caja hecha, así que el gesto salía A CIEGAS — justo el gesto para el que se hizo la guía.

Qué cambia respecto al snippet: nada de envolturas. La fantasma entra por dentro de las cuatro funciones
que el snippet envolvía, y su caché vive en `mc._selGuiaPre` (estado en `mc`, nunca en closure).

Idempotente por MARCA. Aborta si cualquier ancla no aparece EXACTAMENTE una vez. Escritura atómica.
Guardián: `tests/probe_sel_guia_pre.js` (sobre el snippet; el motor hace lo mismo bloque a bloque).

  python3 herramientas/parche_app_sel_guia_preseleccion.py [--comprobar]
"""
import os, sys, tempfile

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'app.js')
MARCA = 'function mcSelGuiaFantasma('

# 1) La fantasma y su recorrido, justo antes de la puerta que la deja entrar.
ANCLA_HAYPIEZA = """// Hay DOS piezas que pueden llevar el gesto y NO se solapan: pegando manda el cúmulo en vuelo (y la
// herramienta da igual, que se pega con cualquiera); si no, la caja de Seleccionar.
function mcSelGuiaHayPieza(){
  return mc.pasteActive ? !!mcSelGuiaPiezaEnVuelo()          // sin sitio donde caer, sin promesa
                        : !!(mc.tool==='select' && mc.selBox);
}"""

FANTASMA = """// LA CAJA FANTASMA: la selección A MEDIO HACER, con UN SOLO CLIC. Dueño (2026-08-28): «*cuando se hace
// una seleccion solamente con un click ya se puede hacer shift o control rueda, sin esperar al segundo,
// pero eso no muestra los -+ y deberia*». Con un clic hay ESQUINA FIJADA (`mc.selA`) pero todavía no hay
// CAJA (`mc.selBox`), y la rueda de más abajo ya sabe qué hacer con eso: auto-confirma tomando el bloque
// apuntado como esquina B. La guía pedía caja hecha ⇒ el gesto salía a ciegas.
// ⚠️ SALE DEL MISMO `mcRaycast()` QUE LA RUEDA, y con la misma condición `cell[1] >= 0`: si lo pintado y
// lo que va a pasar no salen de la misma cuenta, la guía miente en cuanto una de las dos cambie.
// La caché lleva SELLO además de durar un frame: por frame basta para el juego (la mira se mueve sola y
// `mcSelGuiaRepinta` la tira al empezar), pero quien pregunte FUERA del frame vería la caja del frame
// anterior — fijar la esquina y preguntar sin que pase un frame devolvía la selección de antes.
// Una caja de un clic es pequeña por definición, pero el rayo puede dar lejísimos y salir media rejilla:
// recorrerla entera cada frame congelaría el juego, así que pasado el tope no se promete nada (los topes
// de glifos del dibujo van DESPUÉS de este, que es el del recorrido).
const MC_SELGUIA_TOPE_PRE = 200000;

function mcSelGuiaSelloPre(){
  return (mc.pasteActive ? 1 : 0) + '|' + mc.tool + '|' + (mc.selA ? mc.selA.join(',') : '-') +
         '|' + (mc.selBox ? 1 : 0) + '|' + mc.selCajas.length + '|' + (mc.gridGen|0);
}

function mcSelGuiaFantasma(){
  const sello = mcSelGuiaSelloPre();
  if(mc._selGuiaPre && mc._selGuiaPre.sello === sello) return mc._selGuiaPre.v;
  let v = null;
  if(!mc.pasteActive && mc.tool==='select' && mc.selA && !mc.selBox){
    const near = mcRaycast();                                // el mismo rayo que la rueda de aquí abajo
    const b = (near && near.cell[1] >= 0) ? near.cell.slice() : mc.selA.slice();
    const a = mc.selA.slice();
    const vol = (Math.abs(a[0]-b[0])+1) * (Math.abs(a[1]-b[1])+1) * (Math.abs(a[2]-b[2])+1);
    if(vol <= MC_SELGUIA_TOPE_PRE) v = { a, b, vol };
  }
  mc._selGuiaPre = { sello, v };
  return v;
}

// Sus celdas CON BLOQUE, igual que `mcSelForEach` hace con las cajas de verdad: el aire no da cara, y un
// ✚ colgando de la nada prometería lo que el extrusor no va a hacer.
function mcSelGuiaCeldasFantasma(f, cb, ci){
  const x0=Math.min(f.a[0],f.b[0]), x1=Math.max(f.a[0],f.b[0]);
  const y0=Math.min(f.a[1],f.b[1]), y1=Math.max(f.a[1],f.b[1]);
  const z0=Math.min(f.a[2],f.b[2]), z1=Math.max(f.a[2],f.b[2]);
  for(let x=x0; x<=x1; x++) for(let y=y0; y<=y1; y++) for(let z=z0; z<=z1; z++){
    if(!mcInside(x,y,z)) continue;
    if(!mc.grid[mcIdx(x,y,z)]) continue;
    cb(x,y,z,ci);
  }
}

// Hay TRES piezas que pueden llevar el gesto y NO se solapan: pegando manda el cúmulo en vuelo (y la
// herramienta da igual, que se pega con cualquiera); si no, la caja de Seleccionar, y a falta de caja
// hecha, la fantasma del primer clic.
function mcSelGuiaHayPieza(){
  return mc.pasteActive ? !!mcSelGuiaPiezaEnVuelo()          // sin sitio donde caer, sin promesa
                        : !!((mc.tool==='select' && mc.selBox) || mcSelGuiaFantasma());
}"""

# 2) Las celdas: la fantasma es UNA CAJA MÁS, con su propio `ci`.
ANCLA_CELDAS = """  mcSelForEach((x,y,z,id,ci)=>cb(x,y,z,ci));
  return null;
}"""

CELDAS = """  mcSelForEach((x,y,z,id,ci)=>cb(x,y,z,ci));
  // …y la fantasma detrás, como una caja más. `ci` propio (el siguiente a las de verdad) porque va en la
  // clave de cada fila: dos cajas pueden compartir fila a distinta profundidad y son dos caras, no una
  // (REQ-SEL1). Con Shift+clic (`mc.selSuma`) la rueda la AÑADE a las que ya hay ⇒ se dibujan todas.
  const f = mcSelGuiaFantasma();
  if(f) mcSelGuiaCeldasFantasma(f, cb, mc.selCajas.length);
  return null;
}"""

# 3) La firma: la fantasma se mueve CON LA MIRA. Sin esto se pintaría una vez y se quedaría clavada.
ANCLA_FIRMA = """  if(mc.selGuiaModo === 'shift') s += '|' + mcEjeMirada().nombre;
  return s;
}"""

FIRMA = """  const f = mcSelGuiaFantasma();          // la fantasma sigue a la MIRA: fuera de la firma se clavaría
  if(f) s += '|pre:' + f.a.join(',') + '/' + f.b.join(',');
  if(mc.selGuiaModo === 'shift') s += '|' + mcEjeMirada().nombre;
  return s;
}"""

# 4) Frame nuevo, rayo nuevo: un solo `mcRaycast` por frame, igual que el cúmulo en vuelo.
ANCLA_REPINTA = """  mc._selGuiaVuelo = null;                       // frame nuevo: el cúmulo ya no está donde estaba"""

REPINTA = """  mc._selGuiaVuelo = null;                       // frame nuevo: el cúmulo ya no está donde estaba
  mc._selGuiaPre = null;                         // …y la mira, que arrastra la caja fantasma"""

CAMBIOS = [
    ('la caja fantasma y su recorrido', ANCLA_HAYPIEZA, FANTASMA),
    ('las celdas: una caja más', ANCLA_CELDAS, CELDAS),
    ('la firma sigue a la mira', ANCLA_FIRMA, FIRMA),
    ('un rayo por frame', ANCLA_REPINTA, REPINTA),
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
