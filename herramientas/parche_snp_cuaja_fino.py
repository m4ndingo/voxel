#!/usr/bin/env python3
# «Puedo querer acumular cualquier tipo de particula en el mapa, no solo nieve. El motor tiene que
#  manejar voxels de 1x1x1 dentro de su mallado, colocarlos tal y como se hace con los de 16x16x16»
#  (dueño, 2026-08-19).
#
# Corrige el parche anterior (`parche_snp_nieve_malla.py`), que cuajaba en un MATERIAL del mundo: el
# copo de 1/16 se convertia en un bloque de 16^3 al tocar el suelo y se veia el salto —lo caz el dueño—.
#
# Ahora `cuaja: true` no depende de ningun material: la particula se hornea en el mallado del mundo
# TAL CUAL ES, un voxel de 1/16 con su propio color (`game.volatiles.ponFino`). Sirve igual para nieve,
# ceniza, sangre o hojarasca; el efecto no tiene que declarar nada.
#
# Y sigue sin costar fps: lo horneado va troceado POR CHUNK, con su VBO ya en la GPU, asi que un frame
# con 8000 voxeles acumulados es un drawArrays por chunk y cero bytes subidos — contra los 10,8 ms por
# frame que costaria la misma acumulacion en `game.voxelesUI`, que se rehace entera cada frame.
#
#   python3 herramientas/parche_snp_cuaja_fino.py
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/particulas-voxel.json
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/efectos-demo.json
import json, sys, os, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
EFECTOS = os.path.join(RAIZ, 'data', 'snippets', 'efectos-demo.json')
MARCA_PARTIC = 'ponFino'
MARCA_EFECTOS = 'cuaja: true'

CFG_V = """  // ── CUAJAR EN LA MALLA DEL MUNDO ───────────────────────────────────────────────────────────────
  // Nombre de material (`'nieve'`) ⇒ el que se posa DEJA de ser partícula y se convierte en un bloque
  // volátil del mundo. Es la única forma de que la escena se llene de verdad: aquí en la capa de
  // adorno lo posado se remalla entero cada frame (1,28 µs por voxel ⇒ 8 000 copos = 10,8 ms/frame),
  // y en la malla del mundo cuesta UN remallado de chunk y después 0 por frame, para siempre.
  // El .vox del dueño no se entera: `game.volatiles` apunta el id que había y es ése el que se guarda.
  // Con `cuaja` puesto, `dura` es lo que la nieve aguanta EN EL SUELO y `tope` solo limita lo que VUELA.
  cuaja: '',
  cuajaCapas: 1,         // sin torres: si debajo ya hay `capas` de lo mismo, el copo se derrite
  cuajaTope: 4000,       // bloques cuajados a la vez como mucho; pasado eso se derrite lo más viejo"""
CFG_N = """  // ── CUAJAR EN EL MALLADO DEL MUNDO ─────────────────────────────────────────────────────────────
  // El que se posa DEJA de ser partícula y se hornea en el mallado del mundo TAL CUAL ES: el mismo
  // voxel de 1/16 y el mismo color. No hay material de por medio ⇒ vale para nieve, ceniza, sangre o
  // lo que sea, y no hay salto visible al tocar el suelo (que es lo que pasaba cuajando en un bloque
  // de 16³: «se convierte en un bloque de 16x16x16», el dueño).
  //
  // Es la única forma de que la escena se llene de verdad. Aquí, en la capa viva, lo posado se remalla
  // ENTERO cada frame y se sube a la GPU cada frame: 1,28 µs por voxel ⇒ 8 000 copos = 10,8 ms/frame.
  // Horneado va troceado por chunk, con su VBO ya subido: cae un copo y se rehace SOLO su chunk, una
  // vez, y los demás frames son un drawArrays. El coste por frame no depende de cuántos haya.
  //
  // No se guarda en el .vox del dueño: los voxeles finos no son materia, son adorno del mundo.
  // Con `cuaja` puesto, `dura` es lo que la alfombra aguanta EN EL SUELO y `tope` solo limita lo que VUELA.
  cuaja: false,
  cuajaTope: 20000,      // voxeles cuajados a la vez como mucho; pasado eso se derrite lo más viejo"""

CREA_V = """  // ── Lo cuajado (ver `cuaja` en la config) ───────────────────────────────────────────────────────
  const Q = [];              // lo horneado, en orden de antigüedad y plano: [x, y, z, cuándo, …]
  let cuajaId = 0, pedido = false, sucio = false, ultRemalla = 0;
  // Id del material EN ESTE MUNDO. Puede no estar en la paleta todavía: se pide una vez y hasta que
  // llegue no se cuaja nada (el copo se posa como siempre; nadie se queda esperando).
  function cuajaOn(){
    if(!C.cuaja || typeof mc === 'undefined' || !mc.grid || !game.volatiles) return 0;
    const k = mcClaveDeNombre(C.cuaja);
    if(cuajaId && mc.blockKey[cuajaId] === k) return cuajaId;
    const id = mc.blockKey.indexOf(k);
    if(id > 0) return (cuajaId = id);
    if(!pedido && game.addMaterial){ pedido = true; game.addMaterial(k).catch(e => console.warn('[particulas] cuaja:', e)); }
    return 0;
  }
  function hornea(g, ahora){
    const id = cuajaId, x = Math.floor(g.x), y = Math.floor(g.y), z = Math.floor(g.z);
    // Sin torres. Un copo que cae sobre nieve se posa un bloque más arriba, y sin esto la nevada
    // acabaría construyendo columnas hasta el cielo en vez de una alfombra.
    for(let k = 1; k <= C.cuajaCapas; k++){
      if(mc.grid[mcIdx(x, y - k, z)] !== id) break;
      if(k === C.cuajaCapas) return false;
    }
    if(!game.volatiles.pon(x, y, z, id)) return false;   // ya estaba: no se apunta dos veces
    Q.push(x, y, z, ahora); sucio = true;
    return true;
  }
  // Derretir lo viejo y remallar la ráfaga. Va aparte del paso porque es lo ÚNICO caro de esto: sin
  // agrupar, cada copo que se posa pagaría su propio remallado de chunk.
  function deshiela(ahora){
    if(!Q.length && !sucio) return;
    let n = 0;
    while(Q.length && (ahora - Q[3] >= C.dura || Q.length / 4 > C.cuajaTope)){
      game.volatiles.quita(Q[0], Q[1], Q[2]); Q.splice(0, 4); sucio = true;
      if(++n > 400) break;     // un deshielo grande se reparte entre frames en vez de dar un tirón
    }
    if(sucio && ahora - ultRemalla >= C.cuajaRitmo){
      sucio = game.volatiles.remalla(C.cuajaChunks) > 0;   // devuelve los que QUEDAN por remallar
      ultRemalla = ahora;
    }
  }
  function deshielaTodo(){
    while(Q.length){ if(game.volatiles) game.volatiles.quita(Q[0], Q[1], Q[2]); Q.splice(0, 4); }
    if(game.volatiles) game.volatiles.remalla();
    sucio = false;
  }
"""
CREA_N = """  // ── Lo cuajado (ver `cuaja` en la config) ───────────────────────────────────────────────────────
  // La cola es PLANA y en orden de llegada: [fx, fy, fz, cuándo, …] en unidades de 1/16 de bloque, las
  // mismas de `game.voxelesUI`. Plana porque son decenas de miles y un objeto por copo son decenas de
  // miles de objetos; en orden porque derretir es siempre por la cabeza, nunca hay que buscar.
  const Q = [];
  let sucio = false, ultRemalla = 0;
  function cuajaOn(){ return !!(C.cuaja && game.volatiles && game.volatiles.ponFino); }
  // El copo se hornea DONDE ESTÁ y COMO ESTÁ: misma celda fina, mismo color. Por eso no se ve el
  // cambio — para el ojo no pasa nada, solo deja de moverse.
  function hornea(g, ahora){
    const p = 1 / S.MC_T;
    const fx = Math.floor(g.x/p), fy = Math.floor(g.y/p), fz = Math.floor(g.z/p);
    // Dos copos en la misma celda fina son UN voxel: la capa es un mapa por celda. Eso es también lo
    // que impide que se apilen torres, porque lo horneado no es sólido y el siguiente copo cae hasta
    // el mismo sitio.
    if(!game.volatiles.ponFino(fx, fy, fz, g.col)) return false;
    Q.push(fx, fy, fz, ahora); sucio = true;
    return true;
  }
  // Derretir lo viejo y remallar la ráfaga. Va aparte del paso porque es lo ÚNICO caro de esto: sin
  // agrupar, cada copo que se posa pagaría su propio remallado de chunk.
  function deshiela(ahora){
    if(!Q.length && !sucio) return;
    let n = 0;
    while(Q.length && (ahora - Q[3] >= C.dura || Q.length / 4 > C.cuajaTope)){
      game.volatiles.quitaFino(Q[0], Q[1], Q[2]); Q.splice(0, 4); sucio = true;
      if(++n > 400) break;     // un deshielo grande se reparte entre frames en vez de dar un tirón
    }
    if(sucio && ahora - ultRemalla >= C.cuajaRitmo){
      sucio = game.volatiles.remalla(C.cuajaChunks) > 0;   // devuelve los que QUEDAN por remallar
      ultRemalla = ahora;
    }
  }
  function deshielaTodo(){
    while(Q.length){ if(game.volatiles) game.volatiles.quitaFino(Q[0], Q[1], Q[2]); Q.splice(0, 4); }
    if(game.volatiles) game.volatiles.remalla();
    sucio = false;
  }
"""

# ── efectos-demo: la nieve ya no nombra material ──────────────────────────────────────────────────
NIEVE_V = """  // ⛔ NO cuaja en `nieve` (bloque macizo): el copo de 1/16 se convertía en un cubo de 16³ de golpe
  // y se veía («cuando hace contacto con el suelo se convierte en un bloque de 16x16x16», el dueño).
  // `capa-de-nieve` son las 2 lonchas de arriba de ese mismo bloque, así que el motor la trata como
  // geometría FINA: una alfombra de 2/16 de alto que se pisa por encima, como el snow layer de MC.
  cuaja: 'capa-de-nieve', dura: 90, desvanece: 6,"""
NIEVE_N = """  // ⬅️ CUAJA: el copo que toca el suelo se hornea en el mallado del mundo tal cual es —el mismo voxel
  // de 1/16 y el mismo blanco—, deja de ser partícula y ya no cuesta nada por frame. Por eso la escena
  // se llena entera sin que se muevan los fps, y por eso no se ve ningún salto al posarse.
  // `dura` es lo que la alfombra aguanta EN EL SUELO; súbela y nieva más rato antes de derretirse.
  cuaja: true, dura: 90, desvanece: 6,"""

PARES_PARTIC = [('la config de cuaja', CFG_V, CFG_N), ('el estado de lo cuajado', CREA_V, CREA_N)]
PARES_EFECTOS = [('la config de la nieve', NIEVE_V, NIEVE_N)]


def parchea(ruta, pares, marca):
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    if marca in code:
        print('ya estaba parcheado, no se toca: ' + os.path.basename(ruta))
        return 0
    for nombre, viejo, _ in pares:
        n = code.count(viejo)
        if n != 1:
            print('ABORTA en %s: «%s» aparece %d veces, esperaba 1 (¿lo editó el dueño?).'
                  % (os.path.basename(ruta), nombre, n), file=sys.stderr)
            return 1
    for _, viejo, nuevo in pares:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code
    d = os.path.dirname(ruta)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)
    print('parcheado: ' + os.path.basename(ruta))
    return 0


def main():
    return (parchea(PARTIC, PARES_PARTIC, MARCA_PARTIC)
            or parchea(EFECTOS, PARES_EFECTOS, MARCA_EFECTOS))


if __name__ == '__main__':
    sys.exit(main())
