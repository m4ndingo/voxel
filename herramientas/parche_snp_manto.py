#!/usr/bin/env python3
# «Los copos volando se ven correctamente, lo que no es correcto es donde se estan cuajando: si te
#  sales de ese area que se ve no cuajan y deberian» (dueño, 2026-08-19, sobre la foto #60).
#
# Medido en /map/test con 120 s de nieve: lo cuajado ocupaba 26x28 bloques —justo la caja de siembra,
# `radio: 13`— y dentro solo cubria el 2,6 % del suelo (6,5 celdas finas por bloque, de 256). O sea un
# recuadro salpicado, que es lo que se ve en la foto.
#
# La causa es que el manto era LA SUMA DE LOS COPOS: un copo = un voxel de 1/16. Tapar un bloque pide
# 256 copos AHI MISMO, y tapar la escena, millones. Subir `radio`/`porSegundo` solo hace el recuadro
# mas grande, igual de salpicado, y cuesta fps en los copos que vuelan (que el dueño dice que estan
# bien y no se tocan).
#
# Asi que se separan las dos cosas que eran una:
#   - los COPOS siguen igual: efecto local alrededor del jugador, y al posarse se funden (`dura` corta).
#   - el MANTO del suelo pasa a ser un CAMPO DE ESPESOR por columna de bloque, que sube con el tiempo
#     en todo el mapa a la vez y en orden aleatorio, asi que la escena se llena entera y con el borde
#     deshilachado en vez de un recuadro.
#
# Se apoya en la caja fina que se acaba de añadir al motor (`game.volatiles.ponCajaFina`): una columna
# nevada es UNA entrada y 12 triangulos, no 256 voxeles sueltos. Sin eso el manto no cabe en memoria.
#
#   python3 herramientas/parche_snp_manto.py
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/particulas-voxel.json
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/efectos-demo.json

import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
EFECTOS = os.path.join(RAIZ, 'data', 'snippets', 'efectos-demo.json')
MARCA_PARTIC = 'manto:'
MARCA_EFECTOS = 'manto:'

# ── 1. La config ─────────────────────────────────────────────────────────────────────────────────
CFG_V = """  cuajaTope: 20000,      // voxeles cuajados a la vez como mucho; pasado eso se derrite lo más viejo"""
CFG_N = """  cuajaTope: 20000,      // voxeles cuajados a la vez como mucho; pasado eso se derrite lo más viejo
  // ── EL MANTO ─────────────────────────────────────────────────────────────────────────────────
  // `cuaja` hornea CADA COPO donde cayó, y eso sirve para lo disperso (unas gotas de sangre, cuatro
  // chispas). Para NEVAR NO SIRVE, y está medido: un copo es un voxel de 1/16, o sea 1/256 de la cara
  // de un bloque; con 55 copos/s durante 2 minutos salía un recuadro de 26×28 bloques —la caja de
  // siembra— cubierto al 2,6 %. Es lo que cazó el dueño en la foto #60.
  //
  // El manto NO es la suma de los copos. Es un espesor por COLUMNA DE BLOQUE que sube con el tiempo
  // en toda la zona a la vez, en orden aleatorio: la escena se llena entera y el borde queda
  // deshilachado en vez de recto. Los copos son el efecto que ves caer; el manto es lo que cuaja.
  //
  // Cada columna es UNA caja fina de 16×espesor×16 (`game.volatiles.ponCajaFina`), o sea 12
  // triángulos. De voxeles sueltos serían 256 entradas por bloque y el mapa entero no cabría.
  manto: 0,              // espesor máximo en 1/16 de bloque (0 = este efecto no cuaja manto). 4 ≈ MC
  mantoEn: 50,           // segundos de nevada hasta llegar a ese espesor
  mantoDura: 120,        // segundos en derretirse del todo cuando para de nevar
  mantoRadio: 0,         // radio en bloques alrededor del jugador; 0 = TODO el mapa
  mantoPorFrame: 400,    // columnas que cambian como mucho en un frame, para que no dé un tirón"""

# ── 2. El campo de espesor ───────────────────────────────────────────────────────────────────────
CREA_V = """  function deshielaTodo(){
    while(Q.length){ if(game.volatiles) game.volatiles.quitaFino(Q[0], Q[1], Q[2]); Q.splice(0, 4); }
    if(game.volatiles) game.volatiles.remalla();
    sucio = false;
  }
"""
CREA_N = """  function deshielaTodo(){
    while(Q.length){ if(game.volatiles) game.volatiles.quitaFino(Q[0], Q[1], Q[2]); Q.splice(0, 4); }
    if(game.volatiles) game.volatiles.remalla();
    sucio = false;
  }

  // ── EL MANTO (ver `manto` en la config) ─────────────────────────────────────────────────────────
  // Un espesor por columna de bloque. `nivel` va de 0 a `manto` y es el espesor MEDIO; las columnas
  // no suben todas la vez, suben en un orden barajado fijo, así que en mitad de la nevada hay claros
  // y manchas y el borde no es recto. Barajar UNA vez y guardar el orden es lo que hace que esto sea
  // O(lo que cambia) y no O(columnas) por frame.
  //
  // El truco de la posición: `mp` es «cuántos pasos de columna se han dado ya», y un paso es subirle
  // 1/16 a UNA columna. Paso s ⇒ columna `orden[s % N]`, espesor `(s/N|0)+1`. Subiendo, s avanza;
  // derritiendo, retrocede por el mismo camino. No hay que buscar nada ni ordenar nada.
  const Mto = { x:null, y:null, z:null, orden:null, esp:null, n:0, nivel:0, p:0, radio:-1 };
  function mantoOn(){ return !!(C.manto > 0 && game.volatiles && game.volatiles.ponCajaFina
                                && typeof mc !== 'undefined' && mc.grid); }

  // Se construye una vez (y otra si cambia el radio o el mundo). `mcSurfaceY` es O(alto) y esto son
  // miles de columnas: ~5 ms de una sentada, contra hacerlo por frame que sería inviable.
  function mantoConstruye(){
    const dim = mc.dim, R = C.mantoRadio | 0;
    let x0 = 0, x1 = dim.x - 1, z0 = 0, z1 = dim.z - 1;
    if(R > 0){
      const px = Math.floor(mc.pos[0]), pz = Math.floor(mc.pos[2]);
      x0 = Math.max(0, px - R); x1 = Math.min(dim.x - 1, px + R);
      z0 = Math.max(0, pz - R); z1 = Math.min(dim.z - 1, pz + R);
    }
    const xs = [], ys = [], zs = [];
    for(let z = z0; z <= z1; z++) for(let x = x0; x <= x1; x++){
      const y = mcSurfaceY(x, z);
      if(y < 0 || y >= dim.y - 1) continue;        // columna vacía, o llena hasta el techo
      // No nieva sobre el agua: se ve fatal y además el agua se mueve.
      const k = mc.blockKey[mc.grid[mcIdx(x, y, z)]] || '';
      if(/agua|water|lava/i.test(k)) continue;
      xs.push(x); ys.push(y); zs.push(z);
    }
    const n = xs.length;
    Mto.x = Int32Array.from(xs); Mto.y = Int32Array.from(ys); Mto.z = Int32Array.from(zs);
    Mto.esp = new Uint8Array(n); Mto.n = n; Mto.nivel = 0; Mto.p = 0; Mto.radio = R;
    // Fisher-Yates: el orden en que van blanqueando. Sin esto la nieve avanzaría en barrido, como una
    // persiana de norte a sur, que es peor que el recuadro.
    const o = new Int32Array(n);
    for(let i = 0; i < n; i++) o[i] = i;
    for(let i = n - 1; i > 0; i--){ const j = (Math.random() * (i + 1)) | 0; const t = o[i]; o[i] = o[j]; o[j] = t; }
    Mto.orden = o;
    return n;
  }

  // El color del manto: el del efecto, con una pizca de variación por columna. Sin la variación una
  // alfombra plana de un solo blanco se ve como un plástico.
  function mantoColor(i){
    const c = C.colores[i % C.colores.length], v = 0.94 + ((i * 2654435761) >>> 28) / 255;
    return [Math.min(1, c[0] * v), Math.min(1, c[1] * v), Math.min(1, c[2] * v)];
  }
  function mantoPon(i, e){
    const T = S.MC_T;                              // 16 celdas finas por bloque
    const fx = Mto.x[i] * T, fz = Mto.z[i] * T, fy = (Mto.y[i] + 1) * T;
    if(e > 0) game.volatiles.ponCajaFina(fx, fy, fz, T, e, T, mantoColor(i));
    else      game.volatiles.quitaFino(fx, fy, fz);
    Mto.esp[i] = e;
  }

  function manto(dt, ahora){
    if(!mantoOn()){ if(Mto.n) mantoLimpia(); return; }
    if(!Mto.n || Mto.radio !== (C.mantoRadio | 0)) if(!mantoConstruye()) return;
    const N = Mto.n;
    // Nevando sube, parado baja. El manto NO depende de dónde caigan los copos: por eso cuaja también
    // donde no estás mirando, que es justo lo que faltaba.
    const sube = C.porSegundo > 0;
    Mto.nivel += (sube ? C.manto / Math.max(0.1, C.mantoEn) : -C.manto / Math.max(0.1, C.mantoDura)) * dt;
    Mto.nivel = Math.max(0, Math.min(C.manto, Mto.nivel));
    let objetivo = Math.round(Mto.nivel * N), tope = C.mantoPorFrame | 0;
    if(objetivo === Mto.p) return;
    while(Mto.p < objetivo && tope-- > 0){ const s = Mto.p++; mantoPon(Mto.orden[s % N], (s / N | 0) + 1); }
    while(Mto.p > objetivo && tope-- > 0){ const s = --Mto.p; mantoPon(Mto.orden[s % N], (s / N | 0)); }
    sucio = true;                                  // que `deshiela` lo remalle a su ritmo, troceado
  }
  function mantoLimpia(){
    if(Mto.n && game.volatiles) for(let i = 0; i < Mto.n; i++) if(Mto.esp[i]) mantoPon(i, 0);
    Mto.n = 0; Mto.nivel = 0; Mto.p = 0; Mto.radio = -1;
    Mto.x = Mto.y = Mto.z = Mto.orden = Mto.esp = null;
    if(game.volatiles) game.volatiles.remalla();
  }
"""

# ── 3. Engancharlo al paso, al recuento y al limpia ──────────────────────────────────────────────
PASO_V = """    const CJ = cuajaOn();      // id del material que cuaja, o 0 si este efecto no cuaja
    deshiela(ahora);"""
PASO_N = """    const CJ = cuajaOn();      // id del material que cuaja, o 0 si este efecto no cuaja
    manto(dt, ahora);          // el suelo: no depende de los copos, ver `manto` en la config
    deshiela(ahora);"""

CUENTA_V = """    cuajadas(){ return Q.length / 4; },"""
CUENTA_N = """    cuajadas(){ return Q.length / 4 + Mto.p; },"""

LIMPIA_V = """      deshielaTodo();"""
LIMPIA_N = """      mantoLimpia();
      deshielaTodo();"""

# ── 4. efectos-demo: la nieve deja de cuajar copo copo y pasa a manto ────────────────────────────
NIEVE_V = """  // ⛔ NO cuaja en `nieve` (bloque macizo): el copo de 1/16 se convertía en un cubo de 16³ de golpe
  // y se veía («cuando hace contacto con el suelo se convierte en un bloque de 16x16x16», el dueño).
  // `capa-de-nieve` son las 2 lonchas de arriba de ese mismo bloque, así que el motor la trata como
  // geometría FINA: una alfombra de 2/16 de alto que se pisa por encima, como el snow layer de MC.
  cuaja: 'capa-de-nieve', dura: 90, desvanece: 6,"""
NIEVE_N = """  // ⬅️ Lo que cuaja es el MANTO, no el copo. Cuajando copo copo salía un recuadro de 26×28 bloques
  // (la caja de siembra) cubierto al 2,6 % — la foto #60 del dueño. Un copo es 1/256 de la cara de un
  // bloque: por muchos que eches, eso no es nieve en el suelo, es caspa.
  // El manto sube por su cuenta en TODO el mapa mientras nieva, así que cuaja también donde no estás.
  manto: 4, mantoEn: 50, mantoDura: 120, mantoRadio: 0,
  // Y el copo posado ya no tiene que durar: se funde en el manto en un segundo y deja de costar.
  cuaja: false, dura: 1.5, desvanece: 1.0,"""

PARES_PARTIC = [('config', CFG_V, CFG_N), ('manto', CREA_V, CREA_N),
                ('paso', PASO_V, PASO_N), ('cuenta', CUENTA_V, CUENTA_N),
                ('limpia', LIMPIA_V, LIMPIA_N)]
PARES_EFECTOS = [('nieve', NIEVE_V, NIEVE_N)]


def parchea(ruta, pares, marca):
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    if marca in code:
        print('ya estaba: %s' % os.path.basename(ruta))
        return 0
    for nombre, viejo, nuevo in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA en %s: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?).'
                  % (os.path.basename(ruta), nombre, n), file=sys.stderr)
            return 1
    for nombre, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code
    d = os.path.dirname(ruta)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)
    print('parcheado: %s' % os.path.basename(ruta))
    return 0


def main():
    return (parchea(PARTIC, PARES_PARTIC, MARCA_PARTIC)
            or parchea(EFECTOS, PARES_EFECTOS, MARCA_EFECTOS))


if __name__ == '__main__':
    sys.exit(main())
