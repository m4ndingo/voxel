#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-SNP-LIB1 · `sondas-mundo`: preguntarle al mundo por FORMA y no por celda, una sola vez.

Dueño: «*el snippet "herramienta-espada" se ha vuelto muy grande, posiblemente tenga codigo
reutilizable, me gustaria saber que se puede externalizar por ejemplo en otro snippet que se llame
con game.snippet(...) para hacerlo mas ligero y entendible*» — y, sobre la ubicación, «*b)*»: fichero
propio, NO dentro de `base-npc-skills.json`, porque esto no sirve a agentes sino a cualquiera.

Por qué existe: la pregunta «¿hay materia DE VERDAD en este punto?» estaba reimplementada TRES veces
en el repo, cada una descubierta por su cuenta y a base de un bug distinto:

  · `mundo-autoarranque.json:1703`  chocar un agente   → «no respetan el cuerpo real de los bloques»
  · `redstone-piezas.json:738`      apuntar una palanca → «no sé cómo darle»
  · `herramienta-espada.json:137`   posar una gota      → foto #56 del dueño (la caja invisible)

Las tres hacen lo mismo y las tres lo comentan como un hallazgo. Aquí queda escrita UNA vez.
Este snippet no hace nada al correr: es una LIBRERÍA, devuelve su API.

    const S = await game.snippet('sondas-mundo');
    S.solido(x, y, z)            // ¿materia sólida en este punto del mundo? (rejilla + estructuras)
    S.solidoRejilla(x, y, z)     // solo el terreno (mc.grid), por forma
    S.solidoEstructura(x, y, z)  // solo mc.structures, con la sonda SIN envolver
    S.geoFina(bx, by, bz)        // el bitset 1/16 de esa celda, o null si es un cubo macizo
    S.suelo(x, y, z, maxCaida)   // la Y de la primera superficie por debajo, o null

Publica por POST /api/snippets (papelera + escritura atómica), nunca escribiendo el .json a mano.
"""
import json, os, sys, urllib.request, urllib.error

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, 'data', 'snippets', 'sondas-mundo.json')
API = os.environ.get('VOXEL_API', 'http://localhost:8500')

ID = 'sondas-mundo'
NOMBRE = '📐 Sondas del mundo (librería)'

CODE = r"""// ── 📐 sondas-mundo · LIBRERÍA: preguntarle al mundo por FORMA, no por celda ──────────────────────
// No hace nada al correr. Se usa desde otro snippet:
//
//     const S = await game.snippet('sondas-mundo');
//     if(S.solido(x, y, z)) …
//
// ────────────────────────────────────────────────────────────────────────────────────────────────
// POR QUÉ EXISTE ESTE FICHERO
//
// «¿Hay materia aquí?» tiene DOS respuestas en este motor y elegir la fácil es un bug con nombre:
//
//   · `mcSolid(x,y,z)` contesta POR CELDA: «¿el id de esta celda es != 0?». Para una antorcha, una
//     flor, una placa de presión o un repetidor eso es `true` en el CUBO ENTERO de 1×1×1, aunque el
//     dibujo ocupe cuatro voxeles. Quien se crea esa respuesta se encuentra el mundo lleno de
//     CAJAS INVISIBLES: el agente choca con el aire que hay encima de una alfombra, el rayo de la
//     palanca se para antes de tocarla, y la sangre se queda flotando alrededor de la antorcha.
//   · La forma de verdad está en `mc._geoFina[id]` = `{bits, fdim}`: el bitset del dibujo a 1/16,
//     que es lo que consulta `mcTerrenoChoca` (app.js) para chocar al JUGADOR. Preguntando aquí,
//     lo que sondees se cuela exactamente por donde se cuela el jugador — que es la definición
//     práctica de «realista» en este mundo.
//
// Esto estaba reimplementado tres veces (agentes en `mundo-autoarranque`, rayo fino en
// `redstone-piezas`, gotas en `herramienta-espada`), cada una encontrada a base de su propio bug.
// Aquí queda una sola vez. Si encuentras una cuarta copia, bórrala y llama a esto.
//
// ⚠️ DOS AVISOS QUE CUESTAN CARO
//
//  1. `mc.structures` se sondea con `mcFineBoxHit._orig`, la versión SIN ENVOLVER. La envuelta por
//     `mundo-autoarranque` incluye las piezas de los agentes articulados (eso es BUG-AG19, y para
//     apuntarles está bien), pero un agente ANDA: lo que se apoye en él se queda flotando en el aire
//     cuando se va. Estas sondas contestan por el mundo QUIETO. Quien quiera agentes tiene
//     `game.esqueletos.enPunto(x,y,z)`, que es la pregunta de al lado y está hecha para eso.
//  2. La rejilla se pregunta con `mcSolidWalk`, no con `mcSolid` — la misma elección que hace
//     `mcTerrenoChoca`. Una hierba atravesable o una placa se ven, se apuntan y se rompen, pero no
//     frenan; si frenasen, cualquier cosa que caiga se posaría sobre una brizna de hierba.
//     ⛔ Y `mcSolid` NO se parchea nunca: lo comparten el mallado, el rayo y romper/poner.

const MC_T = (typeof MC_TILE === 'number') ? MC_TILE : 16;   // 1/16 de bloque, el voxel fino

// El bitset de esa celda, o null si es un cubo macizo normal (o no hay nada fino en este mundo).
function geoFina(bx, by, bz){
  if(typeof mc === 'undefined' || !mc._geoFina || !mc.grid || typeof mcIdx !== 'function') return null;
  if(typeof mcInside === 'function' && !mcInside(bx, by, bz)) return null;
  const g = mc._geoFina[mc.grid[mcIdx(bx, by, bz)]];
  return (g && g.bits) ? g : null;
}

// ¿Materia sólida en este punto, mirando SOLO el terreno (mc.grid)?
function solidoRejilla(x, y, z){
  if(y < 0) return true;                                   // el suelo del mundo, sólido hacia abajo
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
  const rej = (typeof mcSolidWalk === 'function') ? mcSolidWalk
            : (typeof mcSolid === 'function' ? mcSolid : null);
  if(!rej || !rej(bx, by, bz)) return false;
  const g = geoFina(bx, by, bz);
  if(!g) return true;                                      // celda maciza de verdad: el cubo entero
  const d = g.fdim;
  const fx = Math.floor(x*MC_T) - bx*MC_T,
        fy = Math.floor(y*MC_T) - by*MC_T,
        fz = Math.floor(z*MC_T) - bz*MC_T;
  if(fx < 0 || fy < 0 || fz < 0 || fx >= d[0] || fy >= d[1] || fz >= d[2]) return false;
  return !!g.bits[(fy*d[2] + fz)*d[0] + fx];               // el palo de la antorcha, y nada más
}

// ¿Y en mc.structures (las piezas sueltas, las salas, lo estampado)?
function solidoEstructura(x, y, z){
  const caja = (typeof mcFineBoxHit === 'function') ? (mcFineBoxHit._orig || mcFineBoxHit) : null;
  if(!caja) return false;
  const fx = Math.floor(x*MC_T), fy = Math.floor(y*MC_T), fz = Math.floor(z*MC_T);
  return !!caja(fx, fy, fz, fx, fy, fz);
}

// Las dos preguntas juntas, que es lo que quiere casi todo el mundo.
function solido(x, y, z){
  return solidoRejilla(x, y, z) || solidoEstructura(x, y, z);
}

// La Y de la primera superficie sólida por DEBAJO de este punto (el sitio donde se posaría algo que
// cae ahí), o null si no hay nada en `maxCaida` bloques. Va a paso de voxel fino: no se salta una
// alfombra de un voxel, que es justo lo que se busca al usar estas sondas.
function suelo(x, y, z, maxCaida){
  const n = Math.ceil((maxCaida || 64) * MC_T);
  for(let i = 1; i <= n; i++){
    const yy = y - i / MC_T;
    if(yy < 0) return 0;
    if(solido(x, yy, z)) return Math.floor(yy * MC_T + 1) / MC_T;
  }
  return null;
}

return { solido, solidoRejilla, solidoEstructura, geoFina, suelo, MC_T,
  info(){ return { geoFinaEnEsteMundo: !!(typeof mc !== 'undefined' && mc._geoFina),
                   sondaEstructuras: (typeof mcFineBoxHit === 'function')
                     ? (mcFineBoxHit._orig ? 'mcFineBoxHit._orig (sin envolver) ✅' : 'mcFineBoxHit (no envuelta)')
                     : 'no hay',
                   rejilla: (typeof mcSolidWalk === 'function') ? 'mcSolidWalk ✅' : 'mcSolid (peor)' }; } };
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
