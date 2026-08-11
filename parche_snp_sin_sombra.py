#!/usr/bin/env python3
# REQ-SHADOW2 · «algunos materiales como white-wool quiero que tengan propiedades de iluminacion que
# sean que no tengan "receive shadows" ni "cast shadows" para poder hacer unas nubes semirealistas
# con esos materiales. que sea algo configurable a nivel de autorun por si quiero elegir otro
# material».
#
# app.js expone la capacidad (mc.sinSombra por id de bloque y mc.sinSombraKey por clave, con dos
# bits: 1 = no recibe, 2 = no proyecta) y este snippet decide a QUE material se le aplica, igual que
# con mc.atraviesa y mc.traspasaLuz. En el motor no se cablea ningun material: el dueño elige.
#
#     game.bloques.define('hab:white-wool', { recibeSombra:false, proyectaSombra:false });
#
# OJO con lo que NO es obvio y es lo que hace que la nube funcione: en el Mundo hay DOS sombras.
# `proyectaSombra:false` solo saca la pieza del MAPA DE SOMBRA DEL SOL; un bloque macizo sigue
# TAPANDO la luz del cielo (skylight), que es la otra, y la nube dejaria igualmente su pegote oscuro
# en el suelo. Por eso aqui `proyectaSombra:false` implica `luz:'pasa'` mientras no se diga `luz`
# explicitamente.
#
# El dueño edita este snippet EN VIVO, asi que el parche es IDEMPOTENTE: si ya esta puesto, no toca
# nada y lo dice. Solo cambia `code`; el resto del documento se reescribe tal cual.
import json, sys, os, tempfile

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    'data/snippets/mundo-autoarranque.json')

MARCA = 'REQ-SHADOW2'

# ── 1 · la chuleta de la cabecera ────────────────────────────────────────────────────────────────
DOC_VIEJO = """//   game.bloques.define('asset:assets/leaves.vox.json', { luz:'pasa' });  ← la luz del cielo lo atraviesa (hojas)
"""
DOC_NUEVO = """//   game.bloques.define('asset:assets/leaves.vox.json', { luz:'pasa' });  ← la luz del cielo lo atraviesa (hojas)
//   game.bloques.define('hab:white-wool', { recibeSombra:false, proyectaSombra:false });  ← nubes: ni se
//                                 oscurece ni deja sombra debajo (proyectaSombra:false ya implica luz:'pasa')
"""

# ── 2 · la firma anterior, al lado de la de la luz ───────────────────────────────────────────────
VAR_VIEJO = """  var luzFirma = '';    // que ids dejaban pasar la luz la ultima vez, para no remallar el mundo sin motivo
"""
VAR_NUEVO = """  var luzFirma = '';    // que ids dejaban pasar la luz la ultima vez, para no remallar el mundo sin motivo
  var sombFirma = '';   // idem para las banderas de sombra (REQ-SHADOW2): remallar cuesta, y cambian poco
  // Las dos banderas de REQ-SHADOW2 empaquetadas como las espera app.js. Por defecto todo recibe y
  // proyecta, o sea 0, que es lo que deja las tablas en null y el coste en cero.
  function bitsSombra(cfg) {
    if (!cfg) return 0;
    return (cfg.recibeSombra === false ? 1 : 0) | (cfg.proyectaSombra === false ? 2 : 0);
  }
"""

# ── 3 · reconstruirCache: llenar las dos tablas ──────────────────────────────────────────────────
CACHE_VIEJO = """    var atrav = null;   // se crea solo si algun material es atravesable
    var luzP = null, luzIds = [];   // idem para la luz del cielo (mc.traspasaLuz)
    for (var id = 1; id < bk.length; id++) {
      var cfg = cfgDeClave(bk[id]);
      if (cfg) porId[id] = cfg;
      if (cfg && cfg.atravesable) { if (!atrav) atrav = new Uint8Array(bk.length); atrav[id] = 1; }"""
CACHE_NUEVO = """    var atrav = null;   // se crea solo si algun material es atravesable
    var luzP = null, luzIds = [];   // idem para la luz del cielo (mc.traspasaLuz)
    var somb = null, sombKey = null, sombIds = [];   // REQ-SHADOW2 (mc.sinSombra / mc.sinSombraKey)
    for (var id = 1; id < bk.length; id++) {
      var cfg = cfgDeClave(bk[id]);
      if (cfg) porId[id] = cfg;
      if (cfg && cfg.atravesable) { if (!atrav) atrav = new Uint8Array(bk.length); atrav[id] = 1; }
      var sb = bitsSombra(cfg);
      if (sb) { if (!somb) somb = new Uint8Array(bk.length); somb[id] = sb; sombIds.push(id + ':' + sb); }"""

# ── 4 · la mitad de las estructuras finas, que no tienen id, y los dos ganchos ───────────────────
HOOK_VIEJO = """    if (typeof mc !== 'undefined') {
      var firmaLuz = luzIds.join(',');
      var cambiaLuz = firmaLuz !== luzFirma;
      mc.traspasaLuz = luzP;
      luzFirma = firmaLuz;
      // Recalcular la luz y remallar es lo mas caro de todo el snippet, asi que solo si de verdad cambia.
      if (cambiaLuz && mc.grid && typeof mcMeshAll === 'function') {
        mcMeshAll();
        // No se puede esperar: reconstruirCache() es sincrona y la llama define(). Con .catch para que un
        // fallo del re-horneado no salga como 'unhandled rejection' sin nombre.
        if (mc.structures && mc.structures.length && typeof mcRestampAll === 'function') {
          Promise.resolve(mcRestampAll()).catch(function (e) {
            console.warn('game.bloques: no he podido re-hornear las estructuras tras cambiar la luz.', e);
          });
        }
      }
    }"""
HOOK_NUEVO = """    // Las ESTRUCTURAS finas no tienen id de bloque, asi que su mitad va por clave. Se recorre la tabla
    // entera (no la paleta) porque una pieza estampada puede no estar en mc.blockKey siquiera.
    Object.keys(tabla).forEach(function (k) {
      var sb = bitsSombra(tabla[k]);
      if (sb) { if (!sombKey) sombKey = {}; sombKey[k] = sb; sombIds.push(k + ':' + sb); }
    });
    if (typeof mc !== 'undefined') {
      var firmaLuz = luzIds.join(',');
      var cambiaLuz = firmaLuz !== luzFirma;
      mc.traspasaLuz = luzP;
      luzFirma = firmaLuz;
      // REQ-SHADOW2 · mismo trato y misma razon que la luz: las banderas se HORNEAN en el sombreado de
      // cada vertice, asi que cambiarlas obliga a rehacer mallas aunque no se haya movido un voxel.
      var firmaSomb = sombIds.join(',');
      var cambiaSomb = firmaSomb !== sombFirma;
      mc.sinSombra = somb;
      mc.sinSombraKey = sombKey;
      sombFirma = firmaSomb;
      // Recalcular la luz y remallar es lo mas caro de todo el snippet, asi que solo si de verdad cambia.
      if ((cambiaLuz || cambiaSomb) && mc.grid && typeof mcMeshAll === 'function') {
        mcMeshAll();
        // No se puede esperar: reconstruirCache() es sincrona y la llama define(). Con .catch para que un
        // fallo del re-horneado no salga como 'unhandled rejection' sin nombre.
        if (mc.structures && mc.structures.length && typeof mcRestampAll === 'function') {
          Promise.resolve(mcRestampAll()).catch(function (e) {
            console.warn('game.bloques: no he podido re-hornear las estructuras tras cambiar la luz.', e);
          });
        }
      }
      // El mapa del sol se refresca por su cuenta cuando la GEOMETRIA cambia, y aqui no cambia: una pieza
      // que deja de proyectar tiene los mismos vertices que antes. Hay que decirselo a mano.
      if (cambiaSomb && typeof mcShadowDirty === 'function') mcShadowDirty();
    }"""

# ── 5 · las dos propiedades nuevas en el define ──────────────────────────────────────────────────
NORM_VIEJO = """      luzPasa: (cfg.luz === 'pasa' || cfg.luz === true),   // la luz del cielo lo cruza: hojas, celosias, rejillas
      luzTapa: (cfg.luz === 'tapa' || cfg.luz === false),  // …y lo contrario: tapa la luz aunque sea de recorte"""
NORM_NUEVO = """      // proyectaSombra:false arrastra luz:'pasa' salvo que se diga `luz` a mano, y esto es lo que hace que
      // una nube funcione de verdad. Son DOS sombras distintas: la bandera solo saca la pieza del mapa del
      // SOL, pero un bloque macizo sigue tapando la luz del CIELO y dejaria el mismo pegote oscuro debajo.
      luzPasa: (cfg.luz === 'pasa' || cfg.luz === true ||
                (cfg.luz === undefined && cfg.proyectaSombra === false)),   // la luz del cielo lo cruza: hojas, celosias, rejillas
      luzTapa: (cfg.luz === 'tapa' || cfg.luz === false),  // …y lo contrario: tapa la luz aunque sea de recorte
      // REQ-SHADOW2 · lo normal es que un material haga las dos cosas; solo se guarda el «no».
      recibeSombra: (cfg.recibeSombra !== false),          // false = nada lo oscurece: ni el cielo ni el sol
      proyectaSombra: (cfg.proyectaSombra !== false),      // false = no deja sombra sobre lo que tiene debajo"""

# ── 6 · que un define que SOLO apaga sombras no salga como «no hace nada» ────────────────────────
GUARD_VIEJO = """    if (!norm.trepable && !norm.alPisar && !norm.alSeguirPisando && !norm.impulso && !norm.velocidad && !norm.deslizamiento && !norm.mirar && !norm.seguir && !norm.atravesable && !norm.luzPasa && !norm.luzTapa)"""
GUARD_NUEVO = """    if (!norm.trepable && !norm.alPisar && !norm.alSeguirPisando && !norm.impulso && !norm.velocidad && !norm.deslizamiento && !norm.mirar && !norm.seguir && !norm.atravesable && !norm.luzPasa && !norm.luzTapa && norm.recibeSombra && norm.proyectaSombra)"""

PARCHES = [
    ('la chuleta de la cabecera', DOC_VIEJO, DOC_NUEVO),
    ('la firma y bitsSombra', VAR_VIEJO, VAR_NUEVO),
    ('reconstruirCache (bloques de terreno)', CACHE_VIEJO, CACHE_NUEVO),
    ('los ganchos mc.sinSombra / mc.sinSombraKey', HOOK_VIEJO, HOOK_NUEVO),
    ('las propiedades del define', NORM_VIEJO, NORM_NUEVO),
    ('el aviso de define vacio', GUARD_VIEJO, GUARD_NUEVO),
]


def main():
    with open(RUTA, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc['code']

    if MARCA in code:
        print('ya estaba parcheado: no se toca nada')
        return 0

    faltan = [n for (n, v, _) in PARCHES if v not in code]
    if faltan:
        print('ABORTA: no encuentro ' + ' | '.join(faltan) + ' (¿lo editó el dueño?). '
              'No se toca el snippet.', file=sys.stderr)
        return 1

    for (_, viejo, nuevo) in PARCHES:
        code = code.replace(viejo, nuevo, 1)
    doc['code'] = code

    # Guardado atomico, como todo lo que escribe en data/.
    d = os.path.dirname(RUTA)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    os.replace(tmp, RUTA)
    print('parcheado: game.bloques.define(clave, { recibeSombra:false, proyectaSombra:false })')
    return 0


if __name__ == '__main__':
    sys.exit(main())
