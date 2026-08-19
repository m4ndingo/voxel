#!/usr/bin/env python3
# «Quiero que se usen lonchas del asset "assets/snow.vox.json" para hacer la alfombra de nieve; se ha
#  de poder seleccionar el bloque de donde se sacaran las lonchas» (dueño, 2026-08-19).
#
# La alfombra pasa de ser un color plano a copiar una LONCHA de un dibujo de 16³:
#
#   mantoDe: 'assets/snow.vox.json'   ⬅️ el bloque del que se sacan las lonchas. Vale lo mismo que
#                                        acepta `game.stamp` (nombre corto, 'asset:…', 'hab:…'): lo
#                                        resuelve `mcStampSrc`, o sea el resolutor del motor.
#   mantoLoncha: 0                    ⬅️ que loncha, contando desde la cara de ARRIBA del dibujo
#   mantoDetalle: 2                   ⬅️ con que resolucion se copia: 1 = un color por bloque, 2 = 2x2,
#                                        4 = 4x4, 16 = celda a celda
#
# ⚠️ POR QUE NO SE COPIA SIEMPRE CELDA A CELDA, que es lo que el dueño pediria si no hubiera numeros:
# cada caja de la capa fina son ~1 KB de geometria, y una alfombra de mapa entero son ~7 800 columnas.
#   detalle  1 →   7 800 cajas (~8 MB)   ← lo que habia hasta ahora, un color por bloque
#   detalle  2 →  31 000 cajas (~31 MB)  ← el nuevo por defecto: se ve el grano del dibujo
#   detalle  4 → 125 000 cajas (~125 MB)
#   detalle 16 → 2 000 000 cajas (~2 GB) ← no cabe, y por eso existe `mantoTope`
# Si el detalle pedido no cabe en `mantoTope` cajas, se baja al que quepa y se avisa por consola. Con
# `mantoRadio` (alfombra solo alrededor del jugador) hay menos columnas y cabe mas detalle.
#
# El mosaico se calcula UNA vez y es el mismo para todas las columnas; lo que las diferencia sigue
# siendo el tinte de `mantoColor` (±6 %), que es lo que impide que se vea repetido bloque a bloque.
#
# ⚠️ En el dibujo la clave es 'x, profundidad, ALTURA' (el editor tiene la Z arriba, ver mcStructGeom),
# asi que la loncha se elige por el TERCER numero de la clave, no por el segundo.
#
#   python3 herramientas/parche_snp_manto_loncha.py
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

CFG_V = """  mantoRevisaPorFrame: 600, // columnas que se repasan por frame, por si el mundo ha cambiado"""
CFG_N = """  // ⬅️ DE DÓNDE SALE EL DIBUJO DE LA ALFOMBRA. Vacío = color plano (el de `colores`). Con un bloque
  // —'assets/snow.vox.json', 'nieve', 'hab:…': lo mismo que acepta `game.stamp`— se le sacan LONCHAS
  // y la alfombra se pinta con ellas.
  mantoDe: '',
  mantoLoncha: 0,        // qué loncha, contando desde la cara de ARRIBA del dibujo (0 = la de arriba)
  // Con qué resolución se copia la loncha: 1 = un color por bloque, 2 = mosaico 2×2, 4 = 4×4,
  // 16 = celda a celda. ⚠️ CUESTA EL CUADRADO, ver `mantoTope`.
  mantoDetalle: 2,
  // Techo de cajas de TODA la alfombra. Cada caja de la capa fina son ~1 KB de geometría, así que un
  // mapa entero (~7 800 columnas) son 7 800 cajas a detalle 1, 31 000 a detalle 2, 125 000 a 4 y dos
  // MILLONES celda a celda. Si el detalle pedido no cabe, se baja al que quepa y se avisa una vez.
  // Con `mantoRadio` hay menos columnas y cabe más detalle.
  mantoTope: 40000,
  mantoRevisaPorFrame: 600, // columnas que se repasan por frame, por si el mundo ha cambiado"""

# ── mantoColor / mantoForma / mantoPon → mosaico de lonchas ────────────────────────────────────────
VIEJO = """  function mantoColor(i){
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
    if(Mto.y[i] < 0){ Mto.esp[i] = 0; return; }    // columna retirada (sin suelo o mojada): no hay dónde
    const v = mantoForma(i, Mto.esp[i]);
    if(v) game.volatiles.quitaFino(v[0], v[1], v[2]);
    const q = mantoForma(i, e);
    if(q) game.volatiles.ponCajaFina(q[0], q[1], q[2], q[3], q[4], q[5], mantoColor(i));
    Mto.esp[i] = e;
  }
"""

NUEVO = """  // ── LA LONCHA DEL DIBUJO ─────────────────────────────────────────────────────────────────────
  // `mantoDe` dice de qué bloque se saca la alfombra. La loncha se copia UNA vez, a la resolución de
  // `mantoDetalle`, y el mosaico resultante es el MISMO para todas las columnas: lo que las diferencia
  // es el tinte de `mantoColor` (±6 %), que es lo que impide que se vea repetido bloque a bloque.
  //
  // ⚠️ El detalle cuesta el CUADRADO: son detalle² cajas por columna, y cada caja de la capa fina son
  // ~1 KB de geometría. Ver `mantoTope` en la config; si no cabe, se baja solo.
  const Los = { q:'', pide:'', detalle:1, col:null, avisado:false };
  function mantoLonchaQ(){
    return [C.mantoDe || '', C.mantoDetalle | 0, C.mantoLoncha | 0, C.manto | 0, Mto.n].join('|');
  }
  // El detalle que de verdad cabe: divisor de 16 y por debajo de `mantoTope` cajas.
  function mantoDetalleReal(){
    let d = C.mantoDetalle | 0;
    d = d >= 16 ? 16 : d >= 8 ? 8 : d >= 4 ? 4 : d >= 2 ? 2 : 1;
    const tope = Math.max(1, C.mantoTope | 0), n = Mto.n || 1;
    while(d > 1 && n * d * d > tope) d >>= 1;
    if(d !== (C.mantoDetalle | 0) && !Los.avisado){
      Los.avisado = true;
      console.warn('[manto] detalle ' + C.mantoDetalle + ' → ' + d + ': ' + Mto.n + ' columnas × ' +
                   ((C.mantoDetalle | 0) ** 2) + ' cajas pasan de mantoTope (' + C.mantoTope + ')');
    }
    return d;
  }
  async function mantoLonchaPide(){
    const q = mantoLonchaQ();
    if(Los.q === q || Los.pide === q) return;
    Los.pide = q;
    let col = null, D = 1;
    const nombre = String(C.mantoDe || '').trim();
    // Se resuelve con `mcStampSrc`, el MISMO resolutor que `game.stamp`: así 'nieve',
    // 'assets/snow.vox.json' y 'asset:assets/snow.vox.json' significan lo mismo aquí y allí.
    const clave = nombre && (typeof mcStampSrc === 'function') ? mcStampSrc(nombre) : null;
    const doc = clave ? await getRoomData(clave) : null;
    const vox = doc && doc.voxels;
    if(vox){
      const T = (doc.size | 0) || S.MC_T;
      D = mantoDetalleReal();
      const P = Math.max(1, T / D), sum = new Float64Array(D * D * 4);
      // ⚠️ En el dibujo la clave es 'x, PROFUNDIDAD, ALTURA' (el editor tiene la Z arriba, igual que
      // lo lee mcStructGeom), así que la loncha se elige por el TERCER número, no por el segundo.
      const alto = Math.max(1, C.manto | 0), y1 = T - 1 - (C.mantoLoncha | 0), y0 = y1 - alto + 1;
      for(const k in vox){
        let v = vox[k];
        if(typeof v !== 'string') continue;
        if(v[0] === '*') v = v.slice(1);
        if(v[0] !== '#') continue;
        const p = k.split(','), ax = +p[0], az = +p[1], ay = +p[2];
        if(ay < y0 || ay > y1) continue;
        const t = (Math.min(D - 1, (az / P) | 0) * D + Math.min(D - 1, (ax / P) | 0)) * 4;
        const n = parseInt(v.slice(1, 7), 16);
        sum[t] += (n >> 16 & 255); sum[t + 1] += (n >> 8 & 255); sum[t + 2] += (n & 255); sum[t + 3]++;
      }
      col = new Float32Array(D * D * 3);
      for(let t = 0; t < D * D; t++){
        const n = sum[t * 4 + 3] || 1;
        col[t * 3] = sum[t * 4] / n / 255; col[t * 3 + 1] = sum[t * 4 + 1] / n / 255;
        col[t * 3 + 2] = sum[t * 4 + 2] / n / 255;
      }
    }
    if(Los.pide === q) mantoRepinta(q, D, col);
  }
  // Cambiar de loncha o de detalle cambia CUÁNTAS cajas hay y DÓNDE empiezan, así que las de antes hay
  // que quitarlas con la geometría de antes: se barre entero con la vieja y se repone con la nueva.
  // Es un tirón de una vez (~7 800 columnas) y solo al cambiar el mando, no por frame.
  function mantoRepinta(q, D, col){
    const hay = Mto.n && game.volatiles;
    if(hay) for(let i = 0; i < Mto.n; i++) if(Mto.esp[i]) mantoQuita(i, Mto.esp[i]);
    Los.q = q; Los.detalle = D; Los.col = col;
    if(hay) for(let i = 0; i < Mto.n; i++) if(Mto.esp[i]) mantoPone(i, Mto.esp[i]);
  }
  // El tinte por columna. Sin él una alfombra de un solo blanco se ve como un plástico, y con la
  // loncha puesta es lo que impide que se note el mosaico repetido bloque a bloque.
  function mantoColor(i, t){
    const v = 0.94 + ((i * 2654435761) >>> 28) / 255;
    if(Los.col){ const o = (t | 0) * 3;
      return [Math.min(1, Los.col[o] * v), Math.min(1, Los.col[o + 1] * v), Math.min(1, Los.col[o + 2] * v)]; }
    const c = C.colores[i % C.colores.length];
    return [Math.min(1, c[0] * v), Math.min(1, c[1] * v), Math.min(1, c[2] * v)];
  }

  // La columna crece primero POR FORMA y luego por espesor. Sin esto el primer paso ya era una caja de
  // 16×1×16, o sea la cara del bloque tapada entera: por muy aleatorio que fuese el orden, cada columna
  // aparecía como un cuadrado blanco perfecto y la nevada se «encendía» en vez de cuajar.
  //   1 → mancha de 8×8    2 → 12×12    3 → baldosa 16×16    4+ → engorda hacia arriba
  function mantoPasos(){ return 2 + C.manto; }
  // Las cajas de la columna `i` con espesor `e`, en `Caj` (7 números por caja: x,y,z,ancho,alto,fondo y
  // qué teja del mosaico es, para el color). Devuelve cuántas. Se rellena un array de siempre en vez de
  // devolver listas: esto se llama cientos de veces por frame y una lista por llamada sería basura.
  const Caj = new Int32Array(16 * 16 * 7);
  function mantoCajas(i, e){
    if(e <= 0 || Mto.y[i] < 0) return 0;
    const T = S.MC_T, D = Los.detalle > 0 ? Los.detalle : 1, P = T / D;
    const l = e === 1 ? (T >> 1) : (e === 2 ? ((T * 3) >> 2) : T), h = e <= 2 ? 1 : e - 2;
    // Descentrada, pero SIEMPRE igual para la misma columna y paso: si la mancha bailara al crecer se
    // vería parpadear. Y el hueco (T−l) es 8, 4 y 0, así que en el último paso el offset es 0 solo.
    const s = (i * 2654435761) >>> 0, hueco = T - l;
    const ox = hueco ? (s % (hueco + 1)) : 0, oz = hueco ? ((s >>> 9) % (hueco + 1)) : 0;
    const bx = Mto.x[i] * T, by = (Mto.y[i] + 1) * T, bz = Mto.z[i] * T;
    if(D === 1){ Caj[0] = bx + ox; Caj[1] = by; Caj[2] = bz + oz;
                 Caj[3] = l; Caj[4] = h; Caj[5] = l; Caj[6] = 0; return 1; }
    // Cada teja del mosaico es una caja, recortada por la mancha del paso: así la alfombra sigue
    // cuajando poco a poco en vez de encenderse entera, con dibujo o sin él.
    let n = 0;
    for(let tz = 0; tz < D; tz++) for(let tx = 0; tx < D; tx++){
      const x0 = Math.max(tx * P, ox), x1 = Math.min((tx + 1) * P, ox + l);
      if(x1 <= x0) continue;
      const z0 = Math.max(tz * P, oz), z1 = Math.min((tz + 1) * P, oz + l);
      if(z1 <= z0) continue;
      const o = n * 7;
      Caj[o] = bx + x0; Caj[o + 1] = by; Caj[o + 2] = bz + z0;
      Caj[o + 3] = x1 - x0; Caj[o + 4] = h; Caj[o + 5] = z1 - z0; Caj[o + 6] = tz * D + tx;
      n++;
    }
    return n;
  }
  function mantoQuita(i, e){
    const n = mantoCajas(i, e);
    for(let j = 0; j < n; j++){ const o = j * 7; game.volatiles.quitaFino(Caj[o], Caj[o + 1], Caj[o + 2]); }
  }
  function mantoPone(i, e){
    const n = mantoCajas(i, e);
    for(let j = 0; j < n; j++){ const o = j * 7;
      game.volatiles.ponCajaFina(Caj[o], Caj[o + 1], Caj[o + 2], Caj[o + 3], Caj[o + 4], Caj[o + 5],
                                mantoColor(i, Caj[o + 6])); }
  }
  // Cambiar de paso puede cambiar las CLAVES (la mancha está descentrada y la baldosa no), así que se
  // quitan las de antes: se recalculan de `esp[i]`, no hay que guardarlas.
  function mantoPon(i, e){
    if(Mto.y[i] < 0){ Mto.esp[i] = 0; return; }    // columna retirada (sin suelo o mojada): no hay dónde
    mantoQuita(i, Mto.esp[i]);
    mantoPone(i, e);
    Mto.esp[i] = e;
  }
"""

# La petición de la loncha va DESPUÉS de construir (necesita saber cuántas columnas hay para el tope).
PIDE_V = """    if(!Mto.n || Mto.radio !== (C.mantoRadio | 0)) if(!mantoConstruye()) return;
    mantoRevisa();"""
PIDE_N = """    if(!Mto.n || Mto.radio !== (C.mantoRadio | 0)) if(!mantoConstruye()) return;
    if(Los.q !== mantoLonchaQ()) mantoLonchaPide().catch(e => console.warn('[manto] loncha', e));
    mantoRevisa();"""

INFO_V = """               porSegundo: C.porSegundo, manto: C.manto }; },"""
INFO_N = """               porSegundo: C.porSegundo, manto: C.manto, mantoDe: C.mantoDe,
               mantoDetalle: Los.detalle, mantoCajas: Mto.n * Los.detalle * Los.detalle }; },"""

# ── efectos-demo: la nevada pasa a usar las lonchas del bloque de nieve ────────────────────────────
NIEVE_V = """  manto: 2, mantoEn: 50, mantoDura: 120, mantoRadio: 0,"""
NIEVE_N = """  manto: 2, mantoEn: 50, mantoDura: 120, mantoRadio: 0,
  // La alfombra se pinta con LONCHAS del bloque de nieve, no con un blanco inventado: se le copia la
  // loncha de arriba y se pone en el suelo. `mantoDetalle: 2` = mosaico de 2×2 por bloque (31 000
  // cajas en un mapa entero); a 4 se ve más grano y cuesta cuatro veces más — ver `mantoTope`.
  mantoDe: 'assets/snow.vox.json', mantoLoncha: 0, mantoDetalle: 2,"""

PARES_PARTIC = [('config', CFG_V, CFG_N), ('mosaico', VIEJO, NUEVO),
                ('pide', PIDE_V, PIDE_N), ('info', INFO_V, INFO_N)]
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
    return (parchea(PARTIC, PARES_PARTIC, 'mantoDetalle')
            or parchea(EFECTOS, PARES_EFECTOS, 'mantoDe'))


if __name__ == '__main__':
    sys.exit(main())
