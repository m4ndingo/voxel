#!/usr/bin/env python3
# «Quiero que caigan los copos y toda la escena se llene de nieve acumulada si el tiempo de duracion del
#  copo es alto, y que no caigan los fps» + «que tal hornear la nieve en la malla del mundo y marcarlo de
#  alguna manera como sucio / volatil de forma que no necesite siquiera guardarse en el mapa» (dueño,
#  2026-08-19). Esto es su idea, tal cual.
#
# El problema, en una linea: la capa de adorno `game.voxelesUI` se remalla ENTERA cada frame y cuesta
# 1,28 us por voxel, asi que acumular a escala de paisaje ahi es imposible por construccion — 8000 copos
# posados son 10,8 ms/frame. En la MALLA DEL MUNDO el mismo copo cuesta un remallado de chunk UNA vez y
# 0 por frame despues, para siempre, dan igual 8000 que 80000.
#
# Lo que se anade:
#   · `app.js`  -> `game.volatiles` (celdas que estan en la malla pero NO en el fichero). Va aparte.
#   · `cuaja: 'nieve'` -> el copo que se posa deja de ser particula y se hornea como bloque volatil.
#     `dura` pasa a ser lo que aguanta la nieve EN EL SUELO, y `tope` solo limita lo que VUELA.
#   · `cuajaCapas: 1` -> sin torres: si debajo ya hay nieve, el copo se derrite en vez de apilarse.
#   · `cuajaRitmo` -> se agrupan los remallados: 20 copos posados cuestan UN remallado, no veinte.
#
#   python3 herramientas/parche_snp_nieve_malla.py
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/particulas-voxel.json
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/efectos-demo.json
import json, sys, os, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
EFECTOS = os.path.join(RAIZ, 'data', 'snippets', 'efectos-demo.json')
MARCA_PARTIC = 'cuajaCapas'
MARCA_EFECTOS = "cuaja: 'nieve'"   # ⛔ 'cuaja:' a secas no vale: la lluvia ya dice «NO cuaja:» en un comentario

# ── 1. config nueva ───────────────────────────────────────────────────────────────────────────────
CFG_V = """  grosorPosada: 0,
  vuelo: 8,              // segundos volando como mucho, en tiempo SIMULADO"""
CFG_N = """  grosorPosada: 0,
  // ── CUAJAR EN LA MALLA DEL MUNDO ───────────────────────────────────────────────────────────────
  // Nombre de material (`'nieve'`) ⇒ el que se posa DEJA de ser partícula y se convierte en un bloque
  // volátil del mundo. Es la única forma de que la escena se llene de verdad: aquí en la capa de
  // adorno lo posado se remalla entero cada frame (1,28 µs por voxel ⇒ 8 000 copos = 10,8 ms/frame),
  // y en la malla del mundo cuesta UN remallado de chunk y después 0 por frame, para siempre.
  // El .vox del dueño no se entera: `game.volatiles` apunta el id que había y es ése el que se guarda.
  // Con `cuaja` puesto, `dura` es lo que la nieve aguanta EN EL SUELO y `tope` solo limita lo que VUELA.
  cuaja: '',
  cuajaCapas: 1,         // sin torres: si debajo ya hay `capas` de lo mismo, el copo se derrite
  cuajaTope: 4000,       // bloques cuajados a la vez como mucho; pasado eso se derrite lo más viejo
  cuajaRitmo: 0.25,      // segundos entre remallados: agrupa la ráfaga en una pasada
  // ⬅️ EL MANDO DE FPS. Remallar un chunk cuesta ~2 ms y una nevada ensucia 9 a la vez: de golpe son
  // 43 ms por segundo, de uno en uno 8. Lo único que se pierde es que un chunk tarde un par de
  // segundos en enseñar su nieve, y la nieve cae despacio de todas formas.
  cuajaChunks: 1,        // chunks remallados por pasada como mucho (0 = todos)
  vuelo: 8,              // segundos volando como mucho, en tiempo SIMULADO"""

# ── 2. el estado y las tres funciones, en crea() ──────────────────────────────────────────────────
CREA_V = """  function posa(g, ahora){ g.vx = g.vy = g.vz = 0; g.posada = ahora; }
"""
CREA_N = """  function posa(g, ahora){ g.vx = g.vy = g.vz = 0; g.posada = ahora; }

  // ── Lo cuajado (ver `cuaja` en la config) ───────────────────────────────────────────────────────
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

# ── 3. paso(): derretir al principio, hornear al posarse ──────────────────────────────────────────
PASO_V = """    if(S.refrescaEstructuras) S.refrescaEstructuras();
    let cambia = false;"""
PASO_N = """    if(S.refrescaEstructuras) S.refrescaEstructuras();
    const CJ = cuajaOn();      // id del material que cuaja, o 0 si este efecto no cuaja
    deshiela(ahora);
    let cambia = false;"""

HORNEA_V = """        g.x = nx; g.y = ny; g.z = nz; g.atasco = 0;
      }
      // Se ha ido por un barranco"""
HORNEA_N = """        g.x = nx; g.y = ny; g.z = nz; g.atasco = 0;
      }
      // Se acaba de posar y este efecto cuaja: se hornea en la malla del mundo y deja de ser
      // partícula. Con esto lo posado no ocupa `tope` ni se repinta: el copo se paga UNA vez.
      if(CJ && g.posada){ hornea(g, ahora); V.splice(i, 1); cambia = true; continue; }
      // Se ha ido por un barranco"""

# ── 4. limpia() deshiela, e info() cuenta ─────────────────────────────────────────────────────────
LIMPIA_V = """    limpia(){ V.length = 0; deuda = 0;
      if(game.voxelesUI){ game.voxelesUI.limpia(C.grupo); game.voxelesUI.limpia(GP); }
      return 0; },"""
LIMPIA_N = """    limpia(){ V.length = 0; deuda = 0;
      deshielaTodo();          // lo cuajado es del mundo: si no se quita aquí, se queda ahí para siempre
      if(game.voxelesUI){ game.voxelesUI.limpia(C.grupo); game.voxelesUI.limpia(GP); }
      return 0; },
    // Bloques cuajados vivos. Lo mira el bucle global: mientras queden hay que seguir dando pasos
    // aunque no vuele ni un copo, o la última nevada no se derretiría nunca.
    cuajadas(){ return Q.length / 4; },"""

# ── 5. el bucle global no se apaga con nieve en el suelo ──────────────────────────────────────────
RAF_V = """      vivas += s._V.length; lloviendo += s.porSegundo ? 1 : 0;"""
RAF_N = """      vivas += s._V.length + (s.cuajadas ? s.cuajadas() : 0); lloviendo += s.porSegundo ? 1 : 0;"""

# ── 6. efectos-demo: la nieve cuaja de verdad ─────────────────────────────────────────────────────
NIEVE_V = """  dura: 25, desvanece: 6,          // ⬅️ CUAJA: se queda posada en el suelo 25 s antes de irse
  // ⛔ `tope` NO se sube para que la alfombra dure: lo posado se remalla con la capa entera cada frame
  // (1,28 µs por voxel), así que 1 600 costaban 1,73 ms/frame contra 0,60 — la caída de fps que se veía.
  // Acumular es cosa de la MALLA DEL MUNDO, no de este cupo. Aquí `tope` solo limita lo que VUELA.
  vuelo: 30, parada: 0.25, rebote: 0.02, roza: 0.1, tope: 420,
  // ⛔ `grosorPosada` a 0 a propósito: engordar el copo al tocar el suelo tapaba más por el mismo voxel,
  // pero se ve crecer y no parece nieve («no tiene ninguna utilidad ni parece realista», el dueño).
  grosorPosada: 0,"""
NIEVE_N = """  // ⬅️ La nieve CUAJA EN EL MUNDO: el copo que toca el suelo se convierte en un bloque de nieve de
  // verdad (volátil: se ve, se pisa, y NO se guarda en el .vox del dueño). Por eso la escena se llena
  // entera y los fps no se mueven — un bloque cuesta un remallado de chunk y luego nada, mientras que
  // en la capa de adorno costaba 1,28 µs por copo Y POR FRAME.
  // `dura` es ahora lo que la alfombra aguanta EN EL SUELO, no lo que vive un copo posado.
  // ⛔ NO cuaja en `nieve` (bloque macizo): el copo de 1/16 se convertía en un cubo de 16³ de golpe
  // y se veía («cuando hace contacto con el suelo se convierte en un bloque de 16x16x16», el dueño).
  // `capa-de-nieve` son las 2 lonchas de arriba de ese mismo bloque, así que el motor la trata como
  // geometría FINA: una alfombra de 2/16 de alto que se pisa por encima, como el snow layer de MC.
  cuaja: 'capa-de-nieve', dura: 90, desvanece: 6,
  // Y `tope` ya solo limita lo que VUELA (lo posado deja de ser partícula), así que 420 sobra de largo.
  vuelo: 30, parada: 0.25, rebote: 0.02, roza: 0.1, tope: 420,
  grosorPosada: 0,"""

PARES_PARTIC = [
    ('la config por defecto', CFG_V, CFG_N),
    ('el estado de lo cuajado', CREA_V, CREA_N),
    ('la cabecera de paso()', PASO_V, PASO_N),
    ('el posarse de paso()', HORNEA_V, HORNEA_N),
    ('limpia()', LIMPIA_V, LIMPIA_N),
    ('el bucle global', RAF_V, RAF_N),
]
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
