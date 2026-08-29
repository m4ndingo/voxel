#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""`construye-casa`: la casita del refugio, plantada DONDE y COMO le digan.

Dueño (2026-08-28, en el chat del mundo): «*me gustaria tener los scripts que genera esa estructura,
añadelo como snippet*». La casa nació en `multi/refugio2.js`, un guion de usar y tirar con las
coordenadas pegadas dentro que se mandaba al navegador por `multi/manda_js.py`. Aquí se queda como
snippet de verdad: con sitio y giro por argumento, invocable desde otro snippet o desde la consola.

    game.snippet('construye-casa', { x: 13, y: 15, z: 28, ori: 0 });

Y sobre todo, es lo que ejecuta el bloque-sorpresa al romperse con el pico (`alRomper`, añadido a
`game.bloques` con `herramientas/parche_snp_al_romper.py`):

    game.bloques.define('oro', { alRomper(c){ game.snippet('construye-casa', c); } });

`c` ya trae `{x, y, z, ori, clave}`, así que asociar la casa a un bloque es pasarle lo que le dieron.

Publica por POST /api/snippets (papelera + escritura atómica), nunca escribiendo el .json a mano.
"""
import json, os, sys, urllib.request, urllib.error

API = os.environ.get('VOXEL_API', 'http://localhost:8500')
ID = 'construye-casa'
NOMBRE = '🏠 Construye Casa · sitio y giro por argumento'

CODE = r"""// ── 🏠 construye-casa ──
// Cabaña de 7×7 con tejado a dos aguas, zócalo y esquinas de roca, hastiales de tablón, chimenea,
// ventanas con dintel y un porche con dos farolillos. Se llama con el sitio y el giro:
//
//     game.snippet('construye-casa', { x:13, y:15, z:28, ori:0 });
//
// `opts` es lo que entrega game.snippet(...) — y es EXACTAMENTE la ficha que pasa `alRomper` cuando
// rompes el bloque-sorpresa con el pico, así que no hay que traducir nada entre uno y otro.
(function () {
  'use strict';
  var o = (typeof opts !== 'undefined' && opts) ? opts : {};

  // ── EL SITIO ──────────────────────────────────────────────────────────────────────────────────
  // `x/z` es el centro de la casa. `y` es la celda del bloque que la disparó, o sea la que estaba
  // APOYADA en el suelo: el suelo se busca DESDE AHÍ HACIA ABAJO, que es lo único honesto cuando el
  // terreno no es plano — y lo único posible cuando esa celda ya es aire, porque romperla es lo que
  // nos ha traído aquí.
  var A = Math.floor(Number(o.x)), B = Math.floor(Number(o.z)), Y0 = Math.floor(Number(o.y));
  if (!isFinite(A) || !isFinite(B) || !isFinite(Y0)) {
    throw new Error('construye-casa: hacen falta {x, y, z} (los da alRomper, o se escriben a mano)');
  }
  var R = Math.max(2, Math.min(Math.floor(Number(o.radio) || 3), 8));   // 3 = la casa de 7×7

  // ── EL GIRO ───────────────────────────────────────────────────────────────────────────────────
  // Sale de las 24 posturas y se decodifica con mcOriParts. ⛔ Nada de `(ori|0)&15`: ese era el código
  // de cuando sólo había 16 y a partir de @16 elige la postura equivocada (BUG-ROT2). De las tres
  // partes sólo interesa el yaw — una casa volcada de lado no es una casa.
  var q = (typeof mcOriParts === 'function') ? (mcOriParts(o.ori | 0)[2] & 3) : 0;
  // Y el sentido del giro es EL DEL MOTOR (la parte lineal de mcRotXZ, con la huella ya centrada):
  // así la puerta acaba mirando hacia donde miraba el bloque y no hacia su espejo.
  function gira(dx, dz) {
    switch (q) {
      case 1:  return [-dz, dx];
      case 2:  return [-dx, -dz];
      case 3:  return [dz, -dx];
      default: return [dx, dz];
    }
  }

  // ⛔ Sólo materiales de la paleta de ESTE mundo, y preguntados POR NOMBRE. Un id escrito a mano que
  // no exista no falla: pinta aire, y la casa sale medio invisible sin que nada avise.
  function mat(nombre) {
    var i = mc.blockKey.indexOf(mcClaveDeNombre(nombre));
    if (i < 0) throw new Error('construye-casa: la paleta de este mundo no tiene "' + nombre + '"');
    return i;
  }
  var ROCA = mat('roca'), TABL = mat('tablones'), ADOQ = mat('adoquin'),
      LUZ = mat('farolillo-zen'), AIRE = 0;

  // Todo se piensa en coordenadas LOCALES (dx, dz desde el centro) y se gira al escribir: es lo que
  // hace que el giro salga gratis en cada pieza, incluidos el tejado, la puerta y la chimenea.
  var n = 0;
  function pon(dx, y, dz, id) { var p = gira(dx, dz); mcSetBlock(A + p[0], y, B + p[1], id); n++; }
  function suelo(dx, dz) {
    var p = gira(dx, dz);
    for (var y = Y0; y >= 0; y--) if (mcSolidWalk(A + p[0], y, B + p[1])) return y;
    return 0;
  }
  var g = suelo(0, 0);   // la altura se PREGUNTA con la misma sonda con la que anda el jugador

  // EL tejado a dos aguas, en una sola función: la cumbrera corre en X local y cae hacia ±Z. De aquí
  // sale TODO lo demás —el alto del muro, el triángulo del hastial y hasta dónde vaciar el interior—,
  // que es justo lo que hace que casen sin cuadrar nada a mano.
  // Un escalón por bloque (45°): el primer intento subía 2 en 3 y desde fuera seguía leyéndose como
  // una losa plana. El alero (a > R) se queda a la altura de la última fila del faldón, haciendo de
  // tabla; si siguiera bajando se metería en la fila del dintel de la puerta.
  function alturaTecho(dz) { return g + 4 + Math.max(0, R - Math.abs(dz)); }

  for (var dx = -R; dx <= R; dx++) for (var dz = -R; dz <= R; dz++) {
    var esquina = Math.abs(dx) === R && Math.abs(dz) === R;
    var muro = Math.abs(dx) === R || Math.abs(dz) === R;
    var techo = alturaTecho(dz);
    pon(dx, g, dz, TABL);                                        // tarima
    for (var y = g + 1; y < techo; y++) {
      if (!muro) { pon(dx, y, dz, AIRE); continue; }              // interior vaciado
      // Zócalo y esquinas de roca; de g+4 para arriba ya es el triángulo del hastial, en tablón.
      pon(dx, y, dz, esquina || y === g + 1 ? ROCA : (y > g + 3 ? TABL : ADOQ));
    }
    pon(dx, techo, dz, dz === 0 ? ROCA : TABL);                   // cumbrera de roca, faldón de tablón
  }

  // Alero y repisa del zócalo: un anillo por fuera, una celda más. Es lo que hace que la casa se lea
  // como casa y no como una caja — sombra bajo el tejado y una línea de sombra al pie del muro.
  // El anillo se VACÍA antes de posar el alero: este snippet se puede correr dos veces sobre el mismo
  // sitio, y con otro radio (o tras subir la cumbrera) el alero viejo se quedaría flotando suelto.
  for (var d = -R - 1; d <= R + 1; d++) {
    [[d, -R - 1], [d, R + 1], [-R - 1, d], [R + 1, d]].forEach(function (p) {
      for (var y2 = g + 1; y2 <= g + R + 5; y2++) pon(p[0], y2, p[1], AIRE);
      pon(p[0], g, p[1], ROCA);
      pon(p[0], alturaTecho(p[1]), p[1], TABL);
    });
  }

  // Puerta (2 de alto) con jambas y dintel de roca, en el lado +Z local. Va DESPUÉS del bucle: son
  // huecos y marcos que sobrescriben el muro recién levantado.
  pon(0, g + 1, R, AIRE); pon(0, g + 2, R, AIRE);
  pon(-1, g + 1, R, ROCA); pon(-1, g + 2, R, ROCA);
  pon(1, g + 1, R, ROCA); pon(1, g + 2, R, ROCA);
  pon(0, g + 3, R, ROCA);

  // Ventanas: tres huecos seguidos a la altura de los ojos en las otras tres paredes, con dintel de
  // roca encima. Sin cristal en la paleta, un hueco ancho es la única ventana honesta.
  for (var k = -1; k <= 1; k++) {
    pon(k, g + 2, -R, AIRE);  pon(k, g + 3, -R, ROCA);
    pon(-R, g + 2, k, AIRE);  pon(-R, g + 3, k, ROCA);
    pon(R, g + 2, k, AIRE);   pon(R, g + 3, k, ROCA);
  }

  // Porche: losa de roca delante de la puerta y dos farolillos sobre pie, uno a cada lado.
  for (var px = -1; px <= 1; px++) for (var pz = 1; pz <= 2; pz++) pon(px, g, R + pz, ROCA);
  [-2, 2].forEach(function (lx) {
    pon(lx, g, R + 1, ROCA);
    pon(lx, g + 1, R + 1, ROCA);
    pon(lx, g + 2, R + 1, LUZ);
  });

  // Chimenea adosada al hastial, subiendo una fila por encima de la cumbrera. En dz=-2 aposta: en el
  // centro taparía la ventana de ese lado. Es lo que remata la silueta — una casa con dos aguas y
  // chimenea se lee como casa desde lejos, aunque no haya fuego dentro.
  for (var cy = g + 1; cy <= g + R + 5; cy++) pon(R + 1, cy, -2, ROCA);

  // Dentro: dos farolillos colgados bajo la cumbrera, no uno en medio (uno solo deja las esquinas
  // negras). A la altura del alero, que es donde cuelgan sin meterse en el faldón.
  pon(-2, g + R + 2, 0, LUZ); pon(2, g + R + 2, 0, LUZ);

  // ⚠️ SIN ESTO SE CONSTRUYE INVISIBLE. `mcSetBlock` escribe la rejilla y apunta la celda en
  // `mcDirty`, pero `mcDirty` es la cola de GUARDADO (`app.js:8695`), no el remallado: el chunk no se
  // vuelve a mallar solo. Lo dice el propio motor —«quien las pone es responsable de llamar a
  // remallar»— y el camino normal del jugador (`mcDoAction`) ya lo hace por su cuenta. Costó un buen
  // rato descubrirlo: la rejilla y el rayo de apuntado SÍ tenían los bloques (el cursor se enganchaba
  // a un muro invisible), así que todo lo medible decía que la casa estaba construida.
  // El margen se toma CUADRADO alrededor del centro: así vale para los cuatro giros sin pensar.
  var M = R + 3;
  mcRemeshAround(A - M, B - M, A + M, B + M);

  return { centro: [A, B], suelo: g, giro: q, bloques: n, cumbrera: alturaTecho(0), alero: alturaTecho(R) };
})()
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
