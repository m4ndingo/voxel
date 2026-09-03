#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-PLANT1 · publica `generador-mundo` y lo engancha al final de `mundo-autoarranque`.

EL PROBLEMA QUE RESUELVE. El asistente de mundo nuevo (`web/mapas.html`) deja elegido un bioma, pero
quien construye ese bioma es JS que corre en el NAVEGADOR (los `construye-*` llaman a `game.*`), así
que `/api/mundos/crear` no puede hacerlo: sólo puede dejar apuntado en `data/mundos_meta/<slug>.json`
QUÉ plantilla se pidió y un `generado: false`. Este corredor es la otra mitad — al entrar al mapa
pregunta si está a medias y, si lo está, lo construye y avisa al servidor.

Que la marca viva en el servidor y no en la URL es lo que cumple la orden del dueño de **no dejarlo a
medias**: si el jugador cierra la pestaña mientras se genera, al volver a entrar sigue marcado y se
genera otra vez. Y es idempotente por el otro lado: un mapa ya generado contesta `generado: true` y
esto no hace nada, que es el caso de todas las entradas a todos los mapas menos una.

⛔ **LAS DOS ENVOLTURAS, Y POR QUÉ NO SE TOCA EL CÓDIGO DE LOS GENERADORES.** Los cinco `construye-*`
rematan con `await game.wipeMap(); await game.resizeWorld(128, N, 128);` escrito a fuego. Tal cual:

  1. `wipeMap()` sin `force` saca un `confirm()` del navegador — en mitad de un asistente de juego,
     un diálogo de «¿borrar TODOS los bloques?» sobre un mapa recién creado y vacío.
  2. `resizeWorld(128,…)` **deshace el tamaño que el jugador acaba de elegir**, y en silencio.

La salida es la ley de oro aplicada al pie de la letra: durante la generación se envuelven las dos
funciones guardando `_orig`, y al terminar se devuelven **byte a byte** en un `finally`. No se edita
el `code` de ningún generador — que además son de otro autor y no tienen por qué saber de esto.
De la envoltura del tamaño sale sólo el LADO: el ALTO se lo queda el generador, que es suyo y sabe
cuánto necesita (badlands pide 48, montañas 40).

    python3 herramientas/parche_snp_generador_mundo.py
    python3 herramientas/parche_snp_generador_mundo.py --ver     # sólo enseña lo que haría

Idempotente por partida doble: el corredor se republica igual y el enganche se salta si ya está el
ancla. ⚠️ El enganche va **al final** de `mundo-autoarranque` a propósito: construir un bioma quiere
los bloques con comportamiento, los fluidos y las partículas ya montados, no a medio montar.
"""
import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNIPS = os.path.join(RAIZ, 'data', 'snippets')
BASE = os.environ.get('VOXEL_URL', 'http://localhost:8500')
TOKEN = os.environ.get('VOXELFORGE_TOKEN', '').strip()

SID = 'generador-mundo'
ANCLA = '// ==GENERADOR-MUNDO=='
FIN = '// ==FIN-GENERADOR-MUNDO=='

ENGANCHE = ANCLA + '''
// REQ-PLANT1 · (parche_snp_generador_mundo.py — no editar a mano)
// LO ÚLTIMO DEL AUTOARRANQUE, y tiene que serlo: si este mapa se creó con una plantilla y todavía no
// se ha construido, esto lo construye — y construir un bioma quiere el mundo ya montado (bloques con
// comportamiento, fluidos, partículas), no a medias. En un mapa ya generado no hace nada: una
// pregunta al servidor y fuera.
try { await game.snippet("''' + SID + '''", { noshow: true }); }
catch (e) { console.warn('generador-mundo no se pudo cargar:', e && e.message); }
''' + FIN

CODIGO = r'''// generador-mundo · REQ-PLANT1 · construye el mapa que el asistente dejó pedido.
//
// Lo llama `mundo-autoarranque` AL FINAL, en cada entrada a cada mapa. Casi siempre la respuesta del
// servidor es «ya está generado» y esto termina en una petición.
//
// EL REPARTO. `/api/mundos/crear` guarda el mapa y apunta la plantilla, pero no puede construirla:
// los `construye-*` son JS que llama a `game.*` y eso sólo existe aquí. Así que el servidor deja
// `generado: false` y este corredor lo cierra. Si la pestaña se cierra a mitad, la marca sigue
// puesta y al volver a entrar se genera otra vez — que es lo que pidió el dueño: no dejarlo a medias.

const slug = (typeof mcMapName === 'function' ? mcMapName() : '') || 'default';

// El código de acceso viaja si lo hay: un mapa con código no contesta sin él, y perderlo aquí
// convertiría «entrar con la llave» en «entrar y no generarse nunca».
const _cod = new URLSearchParams(location.search).get('codigo');
const _url = '/api/mundos/' + encodeURIComponent(slug) + '/plantilla'
           + (_cod ? '?codigo=' + encodeURIComponent(_cod) : '');

let plan = null;
try {
  const r = await fetch(_url, { cache: 'no-store' });
  if (r.ok) plan = await r.json();
} catch (e) { /* sin red no se genera nada; el mapa se abre como esté */ }

// `generado`, un 403 o un servidor viejo sin esta ruta: los tres significan «aquí no hay nada que
// hacer», y ninguno es un error que merezca ruido en la consola de un jugador.
if (!plan || plan.generado) return;
if (!plan.plantilla && !plan.especial) return;

const ficha = plan.ficha || {};
const frases = (ficha.frases && ficha.frases.length) ? ficha.frases : ['Construyendo el mundo…'];

// ⛔⛔ LO MÁS IMPORTANTE DE ESTE FICHERO: NO SE PUEDE GENERAR AQUÍ MISMO.
//
// `app.js:22247` reparte el `setVoxel` global según una bandera:
//
//     window.setVoxel = (x,y,z,c) => (mc && mc.active && mc.grid) ? mcSetVoxel(...) : _editSetVoxel(...);
//
// …y `mc.active` NO se pone a `true` hasta DOCE LÍNEAS DESPUÉS del `await mcAutoarranque()` que nos
// trae hasta aquí (`openWorld`, app.js:22707 y 22719). O sea: durante todo el autoarranque, cada
// `setVoxel` de un generador va a parar **al objeto del editor**, no al mapa.
//
// Y no falla: construye entero, en el sitio equivocado, sin una queja. Se descubrió porque la sonda
// veía «done» a los 2 segundos y `mc.grid` con CERO voxels. Es el mismo aviso que `game.wipeMap`
// lleva escrito en su comentario desde siempre — «setVoxel, que según el Mundo esté abierto o no,
// editaría el objeto del editor, no el mapa».
//
// ⛔ Y esperar aquí a la bandera es un INTERBLOQUEO: `openWorld` está parado en el `await` de este
// autoarranque, así que nadie va a poner `mc.active` mientras esperamos. Por eso la generación se
// lanza EN PARALELO y este snippet devuelve el control enseguida: openWorld sigue, activa el Mundo,
// y la tarea de abajo —que estaba esperando justo eso— arranca.
(async function construyeCuandoElMundoEsteVivo() {
  for (let i = 0; i < 1200 && !(typeof mc !== 'undefined' && mc.active && mc.grid); i++) {
    await new Promise(function (r) { setTimeout(r, 50); });
  }
  if (!(typeof mc !== 'undefined' && mc.active && mc.grid)) {
    console.warn('[generador-mundo] el Mundo no llegó a abrirse; no se genera nada (el mapa sigue pendiente).');
    return;
  }
  await construye();
})();
return;

async function construye() {

// ── La pantalla de carga ────────────────────────────────────────────────────────────────────────
// Se ENCIENDE, no sólo se actualiza: para cuando llegamos aquí, `openWorld` ya terminó y la quitó.
// Las frases van rotando porque generar un bioma son entre 3 y 30 segundos, y un cartel quieto
// tanto rato parece la pestaña colgada. `mcShowLoading` se calla solo en el escaparate.
let _i = 0, _reloj = null;
const _di = (txt) => { try { if (typeof mcShowLoading === 'function') mcShowLoading(txt); } catch (e) {} };
_di(frases[0]);
_reloj = setInterval(() => { _i = (_i + 1) % frases.length; _di(frases[_i]); }, 2600);

// ── Las dos envolturas (ley de oro: se guardan y se devuelven byte a byte) ───────────────────────
//
// ⛔ NO se edita el `code` de los `construye-*`. Rematan con `await game.wipeMap(); await
// game.resizeWorld(128, N, 128);` a fuego, y eso saca un `confirm()` en mitad del asistente y pisa
// el tamaño que el jugador acaba de elegir. Se envuelven aquí, durante la generación y nada más.
//
// `mc.dim.x` ES el lado elegido: el mundo ya viene descargado del servidor cuando corre el
// autoarranque, y `/api/mundos/crear` lo creó con el `dim` que se pidió en el asistente.
const lado = (mc && mc.dim && mc.dim.x) ? mc.dim.x : 0;
const _wipe = game.wipeMap, _resize = game.resizeWorld;

game.wipeMap = function (nombre, force) {
  // El mapa se acaba de crear y está vacío: no hay nada que confirmar, y el diálogo sólo asusta.
  return _wipe.call(this, nombre, true);
};
game.wipeMap._orig = _wipe;

game.resizeWorld = function (x, y, z) {
  // Sólo se impone el LADO. El ALTO es del generador, que sabe cuánto necesita (48 en badlands para
  // las agujas, 40 en montañas); imponerlo aquí sería decapitar sus cumbres.
  if (lado && typeof x === 'number') return _resize.call(this, lado, y, lado);
  return _resize.apply(this, arguments);
};
game.resizeWorld._orig = _resize;

// ── Construir ───────────────────────────────────────────────────────────────────────────────────
let bien = true;
try {
  if (plan.especial === 'vacio') {
    // No hay nada que hacer y es a propósito: «mapa vacío» es el mundo tal y como nace.
  } else if (plan.especial === 'terreno') {
    // ⛔ SIN ARGUMENTOS. `game.buildTerrain(true)` entra por `mcGenFlat()`, que es un mundo de
    // 96×40×96 escrito a fuego: desharía el tamaño elegido. Sin argumentos rellena el aire hasta
    // Y=14 respetando el `dim` que ya tiene el mapa, que es justo lo que se quiere.
    game.buildTerrain();
  } else if (plan.plantilla) {
    await game.snippet(plan.plantilla);
    await asienta();
  }
} catch (e) {
  bien = false;
  console.error('[generador-mundo] la plantilla «' + (plan.plantilla || plan.especial) + '» falló:', e);
  try { game.toast('No se pudo generar el mundo: ' + (e && e.message ? e.message : e)); } catch (e2) {}
} finally {
  clearInterval(_reloj);
  game.wipeMap = _wipe;                 // byte a byte, pase lo que pase
  game.resizeWorld = _resize;
}

// ⛔ Un fallo NO se marca como generado: el mapa se queda pendiente y al volver a entrar se
// reintenta. Marcarlo dejaría un mundo medio construido y sin forma de distinguirlo de uno acabado.
if (!bien) { try { mcHideLoading(); } catch (e) {} return; }

// ── Cerrar: guardar de verdad y AVISAR ──────────────────────────────────────────────────────────
//
// ⚠️ El orden importa y no es intercambiable. `mcScheduleSave()` es diferido (900 ms), así que
// marcar «generado» antes de que el POST del mundo haya vuelto deja la puerta a un mapa marcado como
// terminado y vacío en disco si la pestaña se cierra en ese hueco. Se espera al guardado DE VERDAD.
_di('Guardando el mundo…');
try { if (typeof mcSaveWorld === 'function') await mcSaveWorld(); }
catch (e) { console.warn('[generador-mundo] el guardado se quejó:', e); }

try {
  await fetch('/api/mundos/' + encodeURIComponent(slug) + '/generado',
              { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
} catch (e) {
  // Quedarse sin marcar sólo cuesta generar otra vez a la próxima entrada. Es el fallo barato de
  // los dos, y por eso el orden es éste.
  console.warn('[generador-mundo] no se pudo marcar como generado:', e);
}

try { mcHideLoading(); } catch (e) {}
console.log('[generador-mundo] «' + slug + '» construido con «' + (plan.plantilla || plan.especial) + '».');

}   // fin de construye()

// ── Esperar a que el generador termine DE VERDAD ────────────────────────────────────────────────
//
// ⚠️ `await game.snippet(...)` NO garantiza que haya terminado, y no es un descuido de este código:
// `construye-monta-as` remata con `buildNaturalMountains(0, 0, 0, {…});` **sin `await`**, siendo una
// `async function`. Devuelve la promesa sin esperarla, imprime «done» y sale. Sin esto, el corredor
// guardaba y marcaba «generado» sobre un mundo a medio construir — o vacío del todo.
//
// No se arregla en el generador a propósito: son de otro autor, hay cinco, y esperar aquí vale para
// todos, incluidos los que se publiquen mañana. La espera es por ASENTAMIENTO —la rejilla deja de
// crecer— porque es lo único observable desde fuera sin saber qué hace cada uno por dentro.
async function asienta() {
  const cuenta = () => {
    if (typeof mcVoxelsEnRejilla === 'function') return mcVoxelsEnRejilla();
    let n = 0; for (let i = 0; i < mc.grid.length; i++) if (mc.grid[i]) n++; return n;
  };
  let previo = -1, quietas = 0;
  // Tope de 4 minutos: un mundo de 512 con árboles tarda lo suyo, pero colgarse aquí para siempre
  // dejaría al jugador mirando el cartel de carga sin salida.
  for (let i = 0; i < 480 && quietas < 4; i++) {
    await new Promise(function (r) { setTimeout(r, 500); });
    const ahora = cuenta();
    quietas = (ahora === previo) ? quietas + 1 : 0;
    previo = ahora;
  }
  // Dos segundos seguidos sin un solo voxel nuevo = el generador terminó (o no puso nada, que se
  // nota igual y sale en el `console.log` del final).
  console.log('[generador-mundo] asentado en ' + previo.toLocaleString('es') + ' voxels.');
}
'''


def _post(cuerpo):
    datos = json.dumps(cuerpo, ensure_ascii=False).encode('utf-8')
    pet = urllib.request.Request(BASE + '/api/snippets', data=datos, method='POST',
                                 headers={'Content-Type': 'application/json'})
    if TOKEN:
        pet.add_header('X-VoxelForge-Token', TOKEN)
    with urllib.request.urlopen(pet, timeout=30) as r:
        r.read()


def publica_corredor(ver):
    ruta = os.path.join(SNIPS, SID + '.json')
    viejo = None
    if os.path.exists(ruta):
        try:
            with open(ruta, encoding='utf-8') as f:
                viejo = json.load(f)
        except ValueError:
            viejo = None
    if viejo and viejo.get('code') == CODIGO:
        print(f'  = {SID}: ya está al día')
        return True
    if ver:
        print(f'  ~ {SID}: {"se actualizaría" if viejo else "se publicaría"} ({len(CODIGO)} B)')
        return True
    # `protegido` es infraestructura, no gusto: sin este corredor los mapas nuevos se quedan a
    # medias para siempre, así que el DELETE tiene que negarse (F2.1).
    _post({'id': SID, 'name': 'Generador de mundo (plantillas)', 'code': CODIGO,
           'categoria': 'sistema', 'protegido': True})
    print(f'  ✓ {SID}: publicado ({len(CODIGO)} B)')
    return True


def engancha(ver):
    ruta = os.path.join(SNIPS, 'mundo-autoarranque.json')
    with open(ruta, encoding='utf-8') as f:
        doc = json.load(f)
    code = doc.get('code', '')
    if ANCLA in code:
        print('  = mundo-autoarranque: ya lo llama')
        return True
    if ver:
        print(f'  ~ mundo-autoarranque: le añadiría el enganche al final ({len(code)} B intactos)')
        return True
    nuevo = code.rstrip('\n') + '\n\n' + ENGANCHE + '\n'
    cuerpo = {'id': 'mundo-autoarranque', 'name': doc.get('name') or 'mundo-autoarranque',
              'code': nuevo}
    for k in ('categoria',):
        if doc.get(k):
            cuerpo[k] = doc[k]
    if doc.get('protegido') is True:
        cuerpo['protegido'] = True
    _post(cuerpo)
    print(f'  ✓ mundo-autoarranque: enganchado ({len(code)} → {len(nuevo)} B)')
    return True


def main():
    ver = '--ver' in sys.argv
    print(f'Corredor de plantillas → {BASE}' + ('  (sólo mirar)' if ver else ''))
    try:
        ok = publica_corredor(ver) and engancha(ver)
    except urllib.error.HTTPError as e:
        print(f'  ⛔ HTTP {e.code} — {e.read()[:300].decode("utf-8", "replace")}')
        return 1
    except Exception as e:
        print(f'  ⛔ {e}')
        return 1
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
