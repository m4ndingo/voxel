#!/usr/bin/env python3
# Segunda vuelta del mismo encargo: la nieve seguia costando fps (dueño, 2026-08-19).
#
# Con la fase gruesa ya puesta (parche_snp_lluvia_fase_gruesa.py) y `mcVoxUIGeom` escribiendo en un
# Float32Array, el frame de la nieve quedo en 2,79 ms... de los que 1,91 eran UNA sola funcion:
#
#     _paso 2,28 ms  ·  de eso `mcFineBoxHit` 1,91 ms en 208 llamadas = 9,2 µs POR LLAMADA
#     _pinta 0,13 ms  ·  remallado 0,64 ms
#
# 9,2 µs para contestar «no hay ninguna estructura ahi» porque `mcFineBoxHit` recorre TODAS las
# estructuras y, antes de poder descartar ninguna por su caja, hace `mcStructColl(s)` de cada una:
# un acceso a `mc.structs[s.key]` mas tres cadenas de propiedades. Con 80 estructuras eso son 80
# busquedas en tabla hash por sonda, y las sondas son cientos por frame.
#
# ⛔ `mcFineBoxHit` NO SE TOCA: `test_rayo_apuntado.js` la extrae VERBATIM por texto y meterle una
# referencia nueva la revienta con ReferenceError (CLAUDE.md). Asi que el indice va DONDE PREGUNTA,
# en `sondas-mundo`: una lista plana de las cajas (AABB) de las estructuras, mas la caja global de
# todas, rehecha UNA VEZ POR FRAME. Descartar con aritmetica pura sobre esa lista es ~20 veces mas
# barato que entrar en `mcFineBoxHit`, y la caja global despacha de un golpe todo lo que cae lejos.
#
# El contrato es EXPLICITO, sin caducidades ni relojes: quien sondee en bucle llama a
# `S.refrescaEstructuras()` una vez por frame (lo hace `particulas-voxel` al empezar `paso`). Quien
# no lo llame —la espada, que sondea una vez y ya— no tiene indice y va por el camino de siempre,
# que sigue ahi intacto. El indice NUNCA contesta que si por su cuenta: solo evita preguntar.
#
#   python3 herramientas/parche_snp_indice_estructuras.py
#   ...y publicarlos:
#     curl -X POST localhost:8500/api/snippets -d @data/snippets/sondas-mundo.json
#     curl -X POST localhost:8500/api/snippets -d @data/snippets/particulas-voxel.json
import json, sys, os, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONDAS = os.path.join(RAIZ, 'data', 'snippets', 'sondas-mundo.json')
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
MARCA = 'refrescaEstructuras'

# ── 1 · `sondas-mundo`: el índice y su uso ───────────────────────────────────────────────────────
S_VIEJO = """// ¿Y en mc.structures (las piezas sueltas, las salas, lo estampado)?
function solidoEstructura(x, y, z){
  const caja = (typeof mcFineBoxHit === 'function') ? (mcFineBoxHit._orig || mcFineBoxHit) : null;
  if(!caja) return false;
  const fx = Math.floor(x*MC_T), fy = Math.floor(y*MC_T), fz = Math.floor(z*MC_T);
  return !!caja(fx, fy, fz, fx, fy, fz);
}"""

S_NUEVO = """// ── ÍNDICE GRUESO DE ESTRUCTURAS ────────────────────────────────────────────────────────────────
// Las cajas (AABB, en voxeles finos) de lo que hay estampado, en un array plano de 6 en 6, más la
// caja de todas juntas. Sirve para UNA cosa: no entrar en `mcFineBoxHit` cuando no hace falta.
//
// ⚠️ Por qué hace falta: `mcFineBoxHit` recorre TODAS las estructuras y, para poder descartar una
// por su caja, antes hace `mcStructColl(s)` — un acceso a `mc.structs[s.key]` y tres cadenas de
// propiedades. Con 80 estructuras eso costaba 9,2 µs POR SONDA, y la nieve hace cientos por frame:
// 1,91 ms de los 2,28 que tardaba el paso completo. Aquí es aritmética pura sobre un array plano.
//
// ⚠️ El índice NO contesta nunca que SÍ hay materia: solo dice «ni te molestes». La respuesta buena
// la sigue dando `mcFineBoxHit`, intacta. Por eso, si algo falla o no se ha refrescado, se pregunta
// como siempre: quedarse sin índice es lento, no incorrecto.
//
// ⛔ Y por eso NO se parchea `mcFineBoxHit` para meterle esto dentro: `test_rayo_apuntado.js` la
// extrae VERBATIM por texto y una referencia nueva ahí dentro la revienta con ReferenceError.
let _cajas = null, _gx0 = 0, _gy0 = 0, _gz0 = 0, _gx1 = -1, _gy1 = -1, _gz1 = -1;

// Se llama UNA VEZ POR FRAME, y el que sondea en bucle es quien la llama (`particulas-voxel` al
// empezar su paso). Sin relojes ni caducidades: dentro de un frame el mundo estampado no se mueve,
// y entre frames se rehace — son ~80 iteraciones, lo que costaba UNA sonda de las de antes.
function refrescaEstructuras(){
  if(typeof mc === 'undefined' || !mc.structures || typeof mcStructColl !== 'function'){ _cajas = null; return 0; }
  const c = [];
  _gx0 = _gy0 = _gz0 = Infinity; _gx1 = _gy1 = _gz1 = -Infinity;
  for(const s of mc.structures){
    if(s._isHeldTool) continue;                 // la herramienta en la mano no es mundo quieto
    const g = mcStructColl(s); if(!g) continue;
    const d = g.fdim, E = (s.esc === undefined) ? 1 : s.esc,
          x0 = s.ox*MC_T, y0 = s.oy*MC_T, z0 = s.oz*MC_T,
          x1 = x0 + d[0]*E - 1, y1 = y0 + d[1]*E - 1, z1 = z0 + d[2]*E - 1;
    c.push(x0, y0, z0, x1, y1, z1);
    if(x0 < _gx0) _gx0 = x0; if(y0 < _gy0) _gy0 = y0; if(z0 < _gz0) _gz0 = z0;
    if(x1 > _gx1) _gx1 = x1; if(y1 > _gy1) _gy1 = y1; if(z1 > _gz1) _gz1 = z1;
  }
  _cajas = c;
  return c.length / 6;
}

// ¿Merece la pena preguntar por esta caja fina? `true` sin índice: el que no lo refresca no pierde.
function _puedePillar(fx0, fy0, fz0, fx1, fy1, fz1){
  const c = _cajas; if(!c) return true;
  if(fx1 < _gx0 || fx0 > _gx1 || fy1 < _gy0 || fy0 > _gy1 || fz1 < _gz0 || fz0 > _gz1) return false;
  for(let i = 0; i < c.length; i += 6)
    if(fx1 >= c[i] && fx0 <= c[i+3] && fy1 >= c[i+1] && fy0 <= c[i+4] && fz1 >= c[i+2] && fz0 <= c[i+5])
      return true;
  return false;
}

// ¿Y en mc.structures (las piezas sueltas, las salas, lo estampado)?
function solidoEstructura(x, y, z){
  const caja = (typeof mcFineBoxHit === 'function') ? (mcFineBoxHit._orig || mcFineBoxHit) : null;
  if(!caja) return false;
  const fx = Math.floor(x*MC_T), fy = Math.floor(y*MC_T), fz = Math.floor(z*MC_T);
  if(!_puedePillar(fx, fy, fz, fx, fy, fz)) return false;
  return !!caja(fx, fy, fz, fx, fy, fz);
}"""

S_VIEJO2 = """  const caja = (typeof mcFineBoxHit === 'function') ? (mcFineBoxHit._orig || mcFineBoxHit) : null;
  if(caja && caja(Math.floor(Math.min(x0,x1)*MC_T), Math.floor(Math.min(y0,y1)*MC_T),
                  Math.floor(Math.min(z0,z1)*MC_T), Math.floor(Math.max(x0,x1)*MC_T),
                  Math.floor(Math.max(y0,y1)*MC_T), Math.floor(Math.max(z0,z1)*MC_T))) return false;
  return true;"""

S_NUEVO2 = """  const caja = (typeof mcFineBoxHit === 'function') ? (mcFineBoxHit._orig || mcFineBoxHit) : null;
  if(caja){
    const a = Math.floor(Math.min(x0,x1)*MC_T), b = Math.floor(Math.min(y0,y1)*MC_T),
          c = Math.floor(Math.min(z0,z1)*MC_T), d = Math.floor(Math.max(x0,x1)*MC_T),
          e = Math.floor(Math.max(y0,y1)*MC_T), f = Math.floor(Math.max(z0,z1)*MC_T);
    if(_puedePillar(a, b, c, d, e, f) && caja(a, b, c, d, e, f)) return false;
  }
  return true;"""

S_VIEJO3 = "return { solido, solidoRejilla, solidoEstructura, cajaVacia, geoFina, suelo, MC_T,"
S_NUEVO3 = ("return { solido, solidoRejilla, solidoEstructura, cajaVacia, refrescaEstructuras,\n"
            "  geoFina, suelo, MC_T,")

S_VIEJO4 = """                   rejilla: (typeof mcSolidWalk === 'function') ? 'mcSolidWalk ✅' : 'mcSolid (peor)' }; } };"""
S_NUEVO4 = """                   rejilla: (typeof mcSolidWalk === 'function') ? 'mcSolidWalk ✅' : 'mcSolid (peor)',
                   indiceEstructuras: _cajas ? (_cajas.length/6) + ' cajas ✅' : 'sin refrescar (camino lento)' }; } };"""

# ── 2 · `particulas-voxel`: refrescar el índice una vez por frame ────────────────────────────────
P_VIEJO = """  function paso(dt, ahora){
    let cambia = false;"""
P_NUEVO = """  function paso(dt, ahora){
    // Una vez por frame, para las cientos de sondas de este bucle: la lista de cajas de lo estampado.
    // Es el contrato de `sondas-mundo` — sin esta línea todo sigue funcionando, solo que cada sonda
    // vuelve a recorrer `mc.structures` entera (medido: 9,2 µs por sonda, 1,91 ms por frame).
    if(S.refrescaEstructuras) S.refrescaEstructuras();
    let cambia = false;"""


def parchea(ruta, pares):
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']
    if MARCA in code:
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
    r = parchea(SONDAS, [('solidoEstructura()', S_VIEJO, S_NUEVO),
                         ('la sonda de estructuras de cajaVacia()', S_VIEJO2, S_NUEVO2),
                         ('el return de sondas-mundo', S_VIEJO3, S_NUEVO3),
                         ('el info() de sondas-mundo', S_VIEJO4, S_NUEVO4)])
    if r:
        return r
    return parchea(PARTIC, [('la cabecera de paso()', P_VIEJO, P_NUEVO)])


if __name__ == '__main__':
    sys.exit(main())
