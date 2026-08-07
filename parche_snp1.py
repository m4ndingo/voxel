#!/usr/bin/env python3
"""BUG-SNP1 · parche IDEMPOTENTE sobre data/snippets/mundo-autoarranque.json.

Ese snippet no tiene fichero fuente en el repo (a diferencia de los de `redstone/`, que se publican
con make_snippets.js) y el dueño lo edita EN VIVO desde el modal Alt+C. Por eso el parche se aplica
por sustitución de texto exacto y se puede volver a lanzar sin duplicar nada: si ya está puesto, sale
diciéndolo y no toca el fichero.

⚠️ Si el modal Alt+C está abierto en el navegador del dueño con una copia anterior, su próximo
«guardar» se lleva esto por delante. Hay que avisarle.

Qué mete (ver PLAN.md · BUG-SNP1):
  1. `parecidos()` — distancia de edición, para separar «te has equivocado escribiendo» de
     «todavía no está en este mundo».
  2. `resolver()` marca `aplazable` cuando no hay NADA parecido.
  3. `pendientes` — las definiciones aplazadas se guardan enteras y se aplican solas cuando el
     material aparece en la paleta. Es lo que arregla la pérdida de comportamiento.
  4. `reconstruirCache()` promueve las pendientes cuando la paleta cambia de tamaño.
  5. `quitar()` y `lista()` se enteran de las pendientes.
"""
import json, sys, io

RUTA = 'data/snippets/mundo-autoarranque.json'
MARCA = 'BUG-SNP1'

# ── (clave, viejo, nuevo) ─────────────────────────────────────────────────────────────────────
PARCHES = []

PARCHES.append(('resolver', """  function resolver(clave) {
    var conocidas = clavesConocidas();""", """  // Distancia de edicion acotada: solo hace falta saber si dos nombres estan a <=N retoques, no
  // cuanto exactamente, asi que se corta en cuanto se pasa. Es lo que separa un typo ('eskalera',
  // a 1 de 'escalera') de un material que simplemente no se ha colocado todavia ('hielo', que no
  // se parece a nada de la paleta de un mundo vacio). Ver BUG-SNP1.
  function distancia(a, b, tope) {
    if (Math.abs(a.length - b.length) > tope) return tope + 1;
    var fila = [], i, j;
    for (j = 0; j <= b.length; j++) fila[j] = j;
    for (i = 1; i <= a.length; i++) {
      var ant = fila[0], mejor = fila[0] = i;
      for (j = 1; j <= b.length; j++) {
        var val = Math.min(fila[j] + 1, fila[j - 1] + 1, ant + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        ant = fila[j]; fila[j] = val;
        if (val < mejor) mejor = val;
      }
      if (mejor > tope) return tope + 1;                   // ninguna fila posterior puede bajar de aqui
    }
    return fila[b.length];
  }
  // El tope crece con el nombre: en 'cable' (5 letras) un cambio ya es otra palabra, en 'escalera'
  // (8) dos siguen siendo el mismo dedo torcido.
  function parecidos(a, b) {
    if (!a || !b) return false;
    var tope = Math.max(1, Math.min(2, Math.floor(Math.max(a.length, b.length) / 4)));
    return distancia(a, b, tope) <= tope;
  }
  function resolver(clave) {
    var conocidas = clavesConocidas();"""))

PARCHES.append(('resolver-error', """    var pistas = conocidas.filter(function (k) { return k.indexOf(clave) >= 0; });
    return { error: 'no existe el material "' + clave + '". '
      + (pistas.length ? '¿Querías ' + pistas.map(function (p) { return '"' + p + '"'; }).join(' o ') + '?'
                       : 'Ponte encima y usa game.bloques.info() para ver su clave exacta.') };
  }""", """    var pistas = conocidas.filter(function (k) { return k.indexOf(clave) >= 0; });
    if (!pistas.length) pistas = conocidas.filter(function (k) { return parecidos(nombreCorto(k), corto); });
    // BUG-SNP1: sin nada parecido NO es un error, es «todavia no esta en este mundo». La paleta solo
    // lleva lo COLOCADO (+ hotbar + los 6 de serie), asi que en /map/empty cualquier material del
    // disco «no existe» — y el aviso de antes decia justo eso, once veces y con traza de pila.
    if (!pistas.length) return { aplazable: true, error: '"' + clave + '" no esta en este mundo todavia' };
    return { error: 'no existe el material "' + clave + '". ¿Querías '
      + pistas.map(function (p) { return '"' + p + '"'; }).join(' o ') + '?' };
  }"""))

PARCHES.append(('pendientes', """  function reconstruirCache() {
    porId = [];""", """  // ── Definiciones EN ESPERA (BUG-SNP1) ───────────────────────────────────────────────────────
  // Rechazar una definicion porque su material no esta en la paleta era un fallo funcional callado:
  // la paleta CRECE al colocar el material, y para entonces la config ya se habia tirado. Efecto
  // concreto: en /map/empty, colocar una hab:escalera y que no trepe en toda la sesion aunque el
  // autoarranque intento darle su comportamiento al abrir. Aqui se guarda el cfg CRUDO (sin
  // normalizar: normalizar depende de la clave resuelta, que es justo lo que falta) y se vuelve a
  // pasar por define() intacto cuando el material aparece.
  var pendientes = {};      // clave literal -> cfg tal cual lo paso quien llamo
  var promoviendo = false;  // define() llama a reconstruirCache(): sin esto seria recursion infinita
  var enEsperaNuevas = [], avisoEsperaPuesto = false;
  function aplazar(clave, cfg) {
    if (!pendientes[clave]) enEsperaNuevas.push(clave);
    pendientes[clave] = cfg;
    // UNA linea por rafaga, no una por material: el arranque define once seguidas y once console.warn
    // con traza ahogan el informe de carga, que es lo unico util que hay en esa consola.
    if (avisoEsperaPuesto) return;
    avisoEsperaPuesto = true;
    setTimeout(function () {
      avisoEsperaPuesto = false;
      var n = enEsperaNuevas.length; enEsperaNuevas = [];
      if (n) console.log('game.bloques: ' + n + ' material(es) en espera (no están en este mundo todavía; '
        + 'se aplican solos al colocarlos) · game.bloques.lista()');
    }, 0);
  }
  // Un define que SI entra tiene la ultima palabra sobre el mismo material: si no, promover una espera
  // vieja lo pisaria dos lineas despues (el arranque define la cabeza antes de que exista, el dueño la
  // redefine al colocarla, y ganaba la del arranque). Se compara por clave RESUELTA porque lo que
  // espera se guardo con el nombre que escribieron ('ladrillo' vs 'hab:ladrillo').
  function olvidarEspera(bruta, resuelta) {
    delete pendientes[bruta];
    Object.keys(pendientes).forEach(function (k) {
      var r = resolver(k);
      if (!r.error && !r.aplazable && r.clave === resuelta) delete pendientes[k];
    });
  }
  function promoverPendientes() {
    if (promoviendo) return;
    var claves = Object.keys(pendientes);
    if (!claves.length) return;
    promoviendo = true;
    try {
      for (var i = 0; i < claves.length; i++) {
        var k = claves[i];
        if (resolver(k).error) continue;                   // sigue sin estar: se queda esperando
        var cfg = pendientes[k];
        delete pendientes[k];
        define(k, cfg);
      }
    } finally { promoviendo = false; }
  }
  function reconstruirCache() {
    // Solo cuando la paleta CAMBIA de tamaño: es la unica forma de que aparezca un material nuevo, y
    // asi un define() normal no barre la lista de espera por nada.
    var bkAhora = ((typeof mc !== 'undefined' && mc.blockKey) || []).length;
    if (bkAhora !== porIdLen) promoverPendientes();
    porId = [];"""))

PARCHES.append(('define', """    var res = resolver(clave);
    if (res.error) { console.warn('game.bloques.define: ' + res.error); return null; }
    if (res.alias) console.log('game.bloques.define: "' + clave + '" → ' + res.clave);
    clave = res.clave;""",
    """    var res = resolver(clave);
    if (res.aplazable) { aplazar(clave, cfg); return null; }   // BUG-SNP1: se guarda, no se tira
    if (res.error) { console.warn('game.bloques.define: ' + res.error); return null; }
    if (res.alias) console.log('game.bloques.define: "' + clave + '" → ' + res.clave);
    olvidarEspera(clave, res.clave);   // BUG-SNP1: esta definicion manda sobre la que estuviera esperando
    clave = res.clave;"""))

PARCHES.append(('quitar', """    if (!tabla[clave]) { console.warn('game.bloques.quitar: "' + clave + '" no tenía comportamiento.'); return false; }""",
    """    var esperaba = !!pendientes[clave];                    // BUG-SNP1: tambien se quita lo que espera
    if (esperaba) delete pendientes[clave];
    if (!tabla[clave]) {
      if (esperaba) return true;                           // solo estaba en espera: quitado y ya
      console.warn('game.bloques.quitar: "' + clave + '" no tenía comportamiento.'); return false;
    }"""))

PARCHES.append(('_pendientes', """    _tabla: tabla,
    _porId: function () { return porId.slice(); }         // para inspeccionar la cache densa""",
    """    _tabla: tabla,
    _pendientes: function () { return Object.keys(pendientes); },   // BUG-SNP1: lo que espera material
    _porId: function () { return porId.slice(); }         // para inspeccionar la cache densa"""))

PARCHES.append(('lista', """    var filas = Object.keys(tabla).map(function (k) {
      return { clave: k, comportamiento: resumen(tabla[k]), nota: tabla[k].nota || '' };
    });""", """    var filas = Object.keys(tabla).map(function (k) {
      return { clave: k, comportamiento: resumen(tabla[k]), nota: tabla[k].nota || '' };
    });
    // Lo que espera sale TAMBIEN aqui (BUG-SNP1): si no, un material aplazado no aparece en ningun
    // sitio y desde fuera es indistinguible de una definicion perdida, que es el fallo de partida.
    Object.keys(pendientes).forEach(function (k) {
      filas.push({ clave: k, comportamiento: 'en espera (no está en este mundo todavía)', nota: '' });
    });"""))


def main():
    doc = json.load(open(RUTA, encoding='utf-8'))
    code = doc['code']
    if MARCA in code:
        print('ya estaba parcheado (encuentro «%s» en el snippet); no toco nada.' % MARCA)
        return 0
    for nombre, viejo, nuevo in PARCHES:
        n = code.count(viejo)
        if n != 1:
            print('ABORTO: el anclaje «%s» aparece %d veces (esperaba 1). '
                  'El snippet ha cambiado; hay que rehacer el parche.' % (nombre, n), file=sys.stderr)
            return 1
        code = code.replace(viejo, nuevo)
    doc['code'] = code
    with io.open(RUTA, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('parcheado: ' + ' · '.join(p[0] for p in PARCHES))
    print('savedAt del snippet: ' + str(doc.get('savedAt')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
