#!/usr/bin/env python3
# «Si se destruye un bloque que tiene un manto de nieve encima, la nieve deberia caer al suelo, no
#  quedarse flotando» (dueño, 2026-08-19).
#
# El manto calcula la altura de cada columna UNA vez (`mantoConstruye`, ~5 ms de bajada por todo el
# mapa) y luego solo mueve el espesor. Si picas el bloque de debajo, la baldosa se queda donde estaba
# el techo del bloque: flotando.
#
# Se anade un repaso POR TURNOS. Es O(1) por columna —`mcTapaCara` donde se apoya, mas una lectura de
# la celda de encima— y la bajada cara solo la paga la columna que ha cambiado, o sea las cuatro que
# acabas de picar. Con `mantoRevisaPorFrame: 600` y 7 839 columnas, el mapa entero se repasa en ~13
# frames: la nieve cae al cuarto de segundo de romper el bloque.
#
# Se hace asi, y no enganchandose a «romper bloque», porque:
#   - no hay que tocar `app.js` ni envolver nada del motor, y
#   - vale igual para lo que NO es el pico: una explosion, el agua que sube, otro snippet que planta.
#
# Ademas cubre el caso contrario: si pones un bloque ENCIMA de la nieve, la baldosa sube a su techo.
# Y si la columna se queda sin suelo o se moja, se retira (`y = -1`) y `mantoPon` la ignora.
#
# De paso se borra un comentario duplicado que dejo `parche_snp_copo_fluido.py` (el viejo de
# `mantoFluido`, que ya no describe nada).
#
#   python3 herramientas/parche_snp_manto_repasa.py
#   curl -X POST localhost:8500/api/snippets -H 'Content-Type: application/json' \
#        --data-binary @data/snippets/particulas-voxel.json

import json
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTIC = os.path.join(RAIZ, 'data', 'snippets', 'particulas-voxel.json')
MARCA = 'mantoRevisaPorFrame'

CFG_V = """  mantoChunks: 6,        // chunks finos remallados por pasada"""
CFG_N = """  mantoRevisaPorFrame: 600, // columnas que se repasan por frame, por si el mundo ha cambiado
  mantoChunks: 6,        // chunks finos remallados por pasada"""

EST_V = """  const Mto = { x:null, y:null, z:null, orden:null, esp:null, n:0, nivel:0, p:0, radio:-1, remallado:0 };"""
EST_N = """  const Mto = { x:null, y:null, z:null, orden:null, esp:null, n:0, nivel:0, p:0, radio:-1,
                remallado:0, rev:0 };"""

# Comentario huérfano que quedó del parche del fluido.
DUP_V = """  // ¿Esta celda es líquido? Lo pregunta `game.fluidos`, que es quien sabe de niveles (`hab:agua-3`) y
  // de tipos. ⛔ NUNCA por el nombre del material: antes esto era un /agua|water|lava/ sobre la clave,
  // y el motor lo prohíbe expresamente («aquí no se reconoce ningún material por su nombre»).
  // ¿Hay líquido en esta celda?"""
DUP_N = """  // ¿Hay líquido en esta celda?"""

# `mantoPon` tiene que ignorar la columna retirada: con `y = -1` la caja saldría en y = 0.
PON_V = """  function mantoPon(i, e){
    const v = mantoForma(i, Mto.esp[i]);"""
PON_N = """  function mantoPon(i, e){
    if(Mto.y[i] < 0){ Mto.esp[i] = 0; return; }    // columna retirada (sin suelo o mojada): no hay dónde
    const v = mantoForma(i, Mto.esp[i]);"""

REV_V = """  function manto(dt, ahora){
    if(!mantoOn()){ if(Mto.n) mantoLimpia(); return; }
    if(!Mto.n || Mto.radio !== (C.mantoRadio | 0)) if(!mantoConstruye()) return;"""
REV_N = """  // ⛏️ EL MUNDO SE EDITA MIENTRAS NIEVA. La altura de cada columna se calcula una vez y luego solo se
  // mueve el espesor; si picas el bloque de debajo, la baldosa se queda FLOTANDO donde estaba su techo
  // (el dueño). Así que las columnas se repasan POR TURNOS y la que ha cambiado se vuelve a sentar
  // sobre lo que haya ahora.
  //
  // El repaso es O(1) por columna: `mcTapaCara` donde se apoya y una lectura de la celda de encima. La
  // bajada cara —la de `mantoConstruye`— la paga solo la columna que ha cambiado, o sea las cuatro que
  // acabas de picar. Con 600 por frame y 7 839 columnas el mapa entero se repasa en ~13 frames.
  //
  // ⚠️ No se engancha a «romper bloque» a propósito: así vale igual para una explosión, para el agua
  // que sube o para lo que plante otro snippet, y no hay que envolver nada del motor.
  function mantoRevisa(){
    const cuantos = Math.min(Mto.n, C.mantoRevisaPorFrame | 0);
    if(cuantos <= 0) return;
    const dim = mc.dim;
    for(let k = 0; k < cuantos; k++){
      const i = Mto.rev; Mto.rev = (Mto.rev + 1) % Mto.n;
      const x = Mto.x[i], y = Mto.y[i], z = Mto.z[i];
      if(y < 0) continue;                          // ya retirada
      // Sin novedad: sigue apoyada y sigue con el hueco de encima libre. Éste es el caso del 99,9 %
      // de las columnas y es lo único que se paga por frame.
      if(mcTapaCara(x, y, z) && !mc.grid[mcIdx(x, y + 1, z)]) continue;
      let ny = mcSurfaceY(x, z), moja = false;     // ha cambiado: se vuelve a bajar, como al construir
      while(ny >= 0){
        if(mantoFluido(x, ny, z)){ moja = true; break; }
        if(mcTapaCara(x, ny, z)) break;
        ny--;
      }
      if(ny === y && !moja) continue;              // era una planta o algo que no aguanta: sigue igual
      const e = Mto.esp[i];
      mantoPon(i, 0);                              // quita la baldosa de donde estaba
      Mto.y[i] = (moja || ny < 0 || ny >= dim.y - 1) ? -1 : ny;
      mantoPon(i, e);                              // y la pone abajo con el MISMO espesor (o nada)
    }
  }
  function manto(dt, ahora){
    if(!mantoOn()){ if(Mto.n) mantoLimpia(); return; }
    if(!Mto.n || Mto.radio !== (C.mantoRadio | 0)) if(!mantoConstruye()) return;
    mantoRevisa();"""

CON_V = """    Mto.esp = new Uint8Array(n); Mto.n = n; Mto.nivel = 0; Mto.p = 0; Mto.radio = R;"""
CON_N = """    Mto.esp = new Uint8Array(n); Mto.n = n; Mto.nivel = 0; Mto.p = 0; Mto.radio = R; Mto.rev = 0;"""

PARES = [('config', CFG_V, CFG_N), ('estado', EST_V, EST_N), ('duplicado', DUP_V, DUP_N),
         ('pon', PON_V, PON_N), ('construye', CON_V, CON_N), ('repaso', REV_V, REV_N)]


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


if __name__ == '__main__':
    sys.exit(parchea(PARTIC, PARES, MARCA))
