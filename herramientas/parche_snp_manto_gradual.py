#!/usr/bin/env python3
# «Los copos desaparecen cuando caen en el suelo, y al cabo de 1 minuto o asi, aparece todo el manto de
#  golpe, que no es realista» (dueño, 2026-08-19).
#
# Dos causas distintas, las dos medidas:
#
# 1. EL MANTO APARECIA A CUADROS. El manto marcaba sus chunks sucios pero los remallaba `cuajaRitmo`/
#    `cuajaChunks`, o sea 1 chunk cada 0,25 s. Ese ritmo se calibro para los bloques volatiles de 16^3,
#    que cuestan ~2 ms por chunk. Un chunk FINO cuesta 0,17 ms (medido, 218 cajas). Con 36 chunks eso
#    era una pasada completa cada 9 s y cada pasada plantaba un cuadrado de 16x16 bloques de una vez:
#    el «de golpe» del dueño era literalmente eso, chunks apareciendo enteros.
#    Ahora el manto tiene su propio presupuesto (`mantoChunks` cada `mantoRitmo`): 6 chunks cada 0,1 s
#    = mapa entero refrescado cada 0,6 s por ~0,3 ms/frame.
#
# 2. UNA COLUMNA PASABA DE NADA A BALDOSA BLANCA ENTERA. El primer paso ya era una caja de 16x1x16, o
#    sea la cara del bloque tapada del todo. Aunque salieran en orden aleatorio, cada una aparecia como
#    un cuadrado blanco perfecto. Ahora la columna crece por FORMA antes que por espesor:
#      paso 1 → mancha de 8x8 (media baldosa, descentrada segun la columna)
#      paso 2 → 12x12
#      paso 3+ → 16x16 y a partir de ahi ENGORDA hacia arriba
#    Son 2 pasos mas por columna, o sea la nevada se ve cuajar en vez de encenderse.
#
# 3. Y los copos posados dejan de fundirse en 1 s: aguantan `dura` sobre el manto (6 s) y se desvanecen
#    despacio, que es lo que hace que se vea que TOCAN el suelo en vez de esfumarse.
#
#   python3 herramientas/parche_snp_manto_gradual.py
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
MARCA = 'mantoForma'

CFG_V = """  mantoRadio: 0,         // radio en bloques alrededor del jugador; 0 = TODO el mapa
  mantoPorFrame: 400,    // columnas que cambian como mucho en un frame, para que no dé un tirón"""
CFG_N = """  mantoRadio: 0,         // radio en bloques alrededor del jugador; 0 = TODO el mapa
  mantoPorFrame: 400,    // columnas que cambian como mucho en un frame, para que no dé un tirón
  // ⚠️ El manto NO usa `cuajaRitmo`/`cuajaChunks`: ése es el presupuesto de los bloques volátiles de
  // 16³, que cuestan ~2 ms de remallado cada uno. Un chunk FINO cuesta 0,17 ms (medido, 218 cajas),
  // doce veces menos. Con el ritmo de los gordos el mapa tardaba 9 s en refrescarse entero y la nieve
  // salía A CUADRADOS DE CHUNK — el «aparece todo de golpe» del dueño era eso, literalmente.
  mantoChunks: 6,        // chunks finos remallados por pasada
  mantoRitmo: 0.1,       // segundos entre esas pasadas"""

MANTO_V = """  function mantoColor(i){
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
"""
MANTO_N = """  function mantoColor(i){
    const c = C.colores[i % C.colores.length], v = 0.94 + ((i * 2654435761) >>> 28) / 255;
    return [Math.min(1, c[0] * v), Math.min(1, c[1] * v), Math.min(1, c[2] * v)];
  }

  // La columna crece primero POR FORMA y luego por espesor. Sin esto el primer paso ya era una caja de
  // 16×1×16, o sea la cara del bloque tapada entera: por muy aleatorio que fuese el orden, cada columna
  // aparecía como un cuadrado blanco perfecto y la nevada se «encendía» en vez de cuajar.
  //   1 → mancha de 8×8    2 → 12×12    3 → baldosa 16×16    4+ → engorda hacia arriba
  function mantoPasos(){ return 2 + C.manto; }
  function mantoForma(i, e){
    if(e <= 0) return null;
    const T = S.MC_T, l = e === 1 ? (T >> 1) : (e === 2 ? ((T * 3) >> 2) : T), h = e <= 2 ? 1 : e - 2;
    // Descentrada, pero SIEMPRE igual para la misma columna y paso: si la mancha bailara al crecer se
    // vería parpadear. Y el hueco (T−l) es 8, 4 y 0, así que en el último paso el offset es 0 solo.
    const s = (i * 2654435761) >>> 0, hueco = T - l;
    const ox = hueco ? (s % (hueco + 1)) : 0, oz = hueco ? ((s >>> 9) % (hueco + 1)) : 0;
    return [Mto.x[i] * T + ox, (Mto.y[i] + 1) * T, Mto.z[i] * T + oz, l, h, l];
  }
  // Cambiar de paso puede cambiar la CLAVE (la mancha está descentrada y la baldosa no), así que se
  // quita la de antes: la clave vieja se recalcula de `esp[i]`, no hay que guardarla.
  function mantoPon(i, e){
    const v = mantoForma(i, Mto.esp[i]);
    if(v) game.volatiles.quitaFino(v[0], v[1], v[2]);
    const q = mantoForma(i, e);
    if(q) game.volatiles.ponCajaFina(q[0], q[1], q[2], q[3], q[4], q[5], mantoColor(i));
    Mto.esp[i] = e;
  }
"""

PASO_V = """    const N = Mto.n;
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
  }"""
PASO_N = """    const N = Mto.n, PASOS = mantoPasos();
    // Nevando sube, parado baja. El manto NO depende de dónde caigan los copos: por eso cuaja también
    // donde no estás mirando, que es justo lo que faltaba.
    const sube = C.porSegundo > 0;
    Mto.nivel += (sube ? PASOS / Math.max(0.1, C.mantoEn) : -PASOS / Math.max(0.1, C.mantoDura)) * dt;
    Mto.nivel = Math.max(0, Math.min(PASOS, Mto.nivel));
    const objetivo = Math.round(Mto.nivel * N);
    let tope = C.mantoPorFrame | 0;
    while(Mto.p < objetivo && tope-- > 0){ const s = Mto.p++; mantoPon(Mto.orden[s % N], (s / N | 0) + 1); }
    while(Mto.p > objetivo && tope-- > 0){ const s = --Mto.p; mantoPon(Mto.orden[s % N], (s / N | 0)); }
    // Presupuesto PROPIO de remallado, no el de los bloques gordos: ver `mantoChunks` en la config.
    if(ahora - Mto.remallado >= C.mantoRitmo){
      game.volatiles.remalla(C.mantoChunks | 0);
      Mto.remallado = ahora;
    }
  }"""

EST_V = """  const Mto = { x:null, y:null, z:null, orden:null, esp:null, n:0, nivel:0, p:0, radio:-1 };"""
EST_N = """  const Mto = { x:null, y:null, z:null, orden:null, esp:null, n:0, nivel:0, p:0, radio:-1, remallado:0 };"""

# ── efectos-demo: el copo posado aguanta sobre el manto en vez de fundirse en un segundo ─────────
NIEVE_V = """  // Y el copo posado ya no tiene que durar: se funde en el manto en un segundo y deja de costar.
  cuaja: false, dura: 1.5, desvanece: 1.0,"""
NIEVE_N = """  // El copo posado se queda un rato SOBRE el manto y se apaga despacio: con 1,5 s parecía que el copo
  // se esfumaba al tocar el suelo («los copos desaparecen cuando caen en el suelo», el dueño). A 55/s
  // esto son ~330 posados vivos = 0,4 ms/frame en la capa de adorno, que es barato y se ve.
  cuaja: false, dura: 6, desvanece: 3,"""

PARES_PARTIC = [('config', CFG_V, CFG_N), ('estado', EST_V, EST_N),
                ('forma', MANTO_V, MANTO_N), ('paso', PASO_V, PASO_N)]
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
    return (parchea(PARTIC, PARES_PARTIC, MARCA)
            or parchea(EFECTOS, PARES_EFECTOS, 'los copos desaparecen'))


if __name__ == '__main__':
    sys.exit(main())
