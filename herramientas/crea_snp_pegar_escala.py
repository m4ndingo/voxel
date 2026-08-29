#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""`pegar-escala`: con la pieza en vuelo (Ctrl+V), Alt+rueda la escala ×2 / ÷2.

Dueño (2026-08-28): «*si en el mapa hago control+c para copiarme unos bloques y luego hago control+v,
empieza el modo preview, me gustaria que alt+rueda sirva para escalar x2 (rueda arriba) y dividir
(rueda abajo) el objeto*». Y detrás: «*si puede tener alguna previsualizacion cuando se pulse alt que
indique que se va a modificar su tamaño como hacen shift y control al dejarse pulsados*».

Parcheo EN CALIENTE (Ley de Oro): ni una línea de `app.js`. Dos costuras y ninguna más:

  · el `wheel` se atiende en CAPTURA sobre `window`, ANTES de que llegue al `#mc-canvas` de `app.js`:
    ese Alt+rueda hoy gira la herramienta en mano (`mcRuedaHerramienta`), así que hay que cortarle el
    paso o el jugador escalaría la pieza y cambiaría de herramienta con el mismo gesto;
  · la previsualización se cuelga de `mcSelGuiaRepinta`, que es el sitio donde el motor ya refresca la
    guía ✚/▬ de Shift/Ctrl: una vez por frame y con el estado del frame.

    game.pegarEscala.on() / .off() / .estado() / .tope

Publica por POST /api/snippets (papelera + escritura atómica), nunca escribiendo el .json a mano.
"""
import json, os, sys, urllib.request, urllib.error

API = os.environ.get('VOXEL_API', 'http://localhost:8500')
ID = 'pegar-escala'
NOMBRE = '⤢ Pegar escala · Alt+rueda ×2 / ÷2 la pieza en vuelo'

CODE = r"""// ── ⤢ pegar-escala · Alt+rueda escala la pieza en vuelo (Ctrl+V) ─────────────────────────────────
//
// Dueño (2026-08-28): «*me gustaria que alt+rueda sirva para escalar x2 (rueda arriba) y dividir
// (rueda abajo) el objeto*» · «*si puede tener alguna previsualizacion cuando se pulse alt que indique
// que se va a modificar su tamaño como hacen shift y control al dejarse pulsados*».
//
// QUÉ ESCALA. El portapapeles, no el mundo: `clipboard.cells` (offsets `dx`=x, `dz`=altura, `dy`=fondo).
// ×2 = cada celda se convierte en las 8 de su cubo; ÷2 = cada cubo de 8 se convierte en una celda, y el
// material que se queda es el MÁS REPETIDO de las 8. Elegir «la primera» sería más corto pero haría que
// el resultado dependiera del orden en que se copió, que no es una propiedad de la pieza.
//
// EL AGARRE VIAJA CON ELLA (`mc.pasteAnchor`, en ejes de pieza [dx, dz, dy]): se escala igual, así que
// la celda clavada en la mira sigue siendo la misma y la pieza no salta de sitio al crecer.
//
// ⚠️ NO se toca `app.js`, y el `wheel` va en CAPTURA sobre `window` a propósito: el manejador del
// `#mc-canvas` (app.js:24249) no filtra el Alt, así que sin `stopPropagation` este mismo gesto giraría
// además la herramienta en mano. Capturar arriba y cortar es lo único que deja el gesto limpio sin
// reescribir aquel manejador.
'use strict';

if (typeof mc === 'undefined' || !mc || typeof game === 'undefined') {
  return 'pegar-escala: esto es del Mundo (/map/<nombre>), aquí no hay motor';
}
if (game.pegarEscala && game.pegarEscala.off) game.pegarEscala.off();   // re-ejecutable: desinstalar antes de instalar

var F = 16;                                   // voxeles finos por bloque (los de game.voxelesUI)
var GRUPOS = ['esc-guia-mas', 'esc-guia-menos'];
var VERDE = (typeof MC_SELGUIA_VERDE !== 'undefined') ? MC_SELGUIA_VERDE : '#2fe36a';
var ROJO  = (typeof MC_SELGUIA_ROJO  !== 'undefined') ? MC_SELGUIA_ROJO  : '#ff3b30';
var TOPE_VOX = 1800;                          // voxeles de la previsualización: por encima, aristas más sueltas
var GROSOR = 4;                               // lado del cubo de cada trazo, en finos
var PIEL = 2;                                 // finos que la sombra se sale de la pieza para no quedar dentro

// ── ¿hay pieza en vuelo? ─────────────────────────────────────────────────────────────────────────
function pegando() {
  return !!(mc.active && mc.pasteActive && !mc.escaparate &&
            clipboard && clipboard.cells && clipboard.cells.length);
}

// Dimensiones de la pieza al escalar por `f`: ×2 es el doble; ÷2 es el índice máximo partido, +1 (una
// pieza de 5 de ancho ocupa 0..4 ⇒ 0..2 ⇒ 3), y nunca baja de 1.
function dimEscalada(n, f) { return f > 1 ? n * 2 : (((n - 1) >> 1) + 1); }

// ── el cambio de verdad ──────────────────────────────────────────────────────────────────────────
function escala(f) {
  if (!pegando()) return false;
  var cells = clipboard.cells, d = mcClipboardDims(), out, i, j, k, c;
  if (!d) return false;
  if (f > 1) {
    var tope = game.pegarEscala.tope | 0;
    if (cells.length * 8 > tope) {
      toast('×2 dejaría ' + (cells.length * 8) + ' bloques (tope ' + tope +
            ' · game.pegarEscala.tope)', 4);
      return false;
    }
    out = [];
    for (var n = 0; n < cells.length; n++) {
      c = cells[n];
      for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) for (k = 0; k < 2; k++)
        out.push(Object.assign({}, c, { dx: c.dx * 2 + i, dy: c.dy * 2 + j, dz: c.dz * 2 + k }));
    }
  } else {
    if (d.w === 1 && d.h === 1 && d.d === 1) { toast('Un solo bloque: ya no se puede dividir', 3); return false; }
    var cubos = new Map();
    for (var m = 0; m < cells.length; m++) {
      c = cells[m];
      var cl = (c.dx >> 1) + ',' + (c.dy >> 1) + ',' + (c.dz >> 1);
      var g = cubos.get(cl);
      if (g) g.push(c); else cubos.set(cl, [c]);
    }
    out = [];
    cubos.forEach(function (g, cl) {
      var p = cl.split(',');
      out.push(Object.assign({}, manda(g), { dx: +p[0], dy: +p[1], dz: +p[2] }));
    });
  }
  clipboard.cells = out;
  // El agarre en ejes de pieza es [dx, dz, dy] (app.js:17412): se escala como las celdas o dejaría de
  // señalar el mismo punto de la pieza.
  var a = mc.pasteAnchor;
  if (a) {
    var nd = { w: dimEscalada(d.w, f), h: dimEscalada(d.h, f), d: dimEscalada(d.d, f) };
    a[0] = tope0(f > 1 ? a[0] * 2 : (a[0] >> 1), nd.w);
    a[1] = tope0(f > 1 ? a[1] * 2 : (a[1] >> 1), nd.h);
    a[2] = tope0(f > 1 ? a[2] * 2 : (a[2] >> 1), nd.d);
    if (clipboard.ancla) clipboard.ancla = a.slice();
  }
  mcSelGuiaNormaliza();          // deja la esquina mínima en 0 y arrastra el agarre con ella
  mc._pasteCache = null;         // la geometría de la vista previa va dentro: rehacerla
  mc._selGuiaVuelo = null;       // …y la guía de Shift/Ctrl mide contra la pieza
  mc.selGuiaFirma = null;
  mc._escFirma = null;           // la previsualización de Alt, también
  var dd = mcClipboardDims();
  toast('Pegar escala ' + (f > 1 ? '×2' : '÷2') + ' · ' + clipboard.cells.length +
        ' bloque(s) · ' + dd.w + '×' + dd.h + '×' + dd.d, 3);
  return true;
}

function tope0(v, n) { return Math.min(Math.max(v | 0, 0), Math.max(0, n - 1)); }

// De las 8 celdas que se funden en una, manda la del material más repetido (empate: la primera vista).
function manda(g) {
  if (g.length === 1) return g[0];
  var cuenta = new Map(), mejor = g[0], nMejor = 0;
  for (var i = 0; i < g.length; i++) {
    var k = String(g[i].c), n = (cuenta.get(k) || 0) + 1;
    cuenta.set(k, n);
    if (n > nMejor) { nMejor = n; mejor = g[i]; }
  }
  return mejor;
}

// ── la rueda ─────────────────────────────────────────────────────────────────────────────────────
function rueda(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey || !pegando()) return;
  if (document.pointerLockElement !== mc.canvas) return;
  e.preventDefault();
  e.stopPropagation();                        // ⛔ si no, el mismo gesto gira además la herramienta en mano
  // Mismo acumulador y mismo umbral que la rueda del motor: media muesca no puede escalar nada, y quien
  // haya tocado `mc.ruedaUmbral` esperará que valga también aquí.
  if (mc._escGesto !== 'esc') { mc._escGesto = 'esc'; mc._escAcum = 0; }
  mc._escAcum = (mc._escAcum || 0) + e.deltaY;
  var umbral = (isFinite(+mc.ruedaUmbral) && +mc.ruedaUmbral > 0) ? +mc.ruedaUmbral : 30;
  if (Math.abs(mc._escAcum) < umbral) return;
  var paso = mc._escAcum > 0 ? -1 : 1;        // deltaY > 0 = rueda hacia abajo
  mc._escAcum = 0;
  escala(paso > 0 ? 2 : 0.5);
}

// ── la previsualización de Alt ───────────────────────────────────────────────────────────────────
// Shift y Ctrl prometen celda a celda (✚ verde / ▬ rojo) porque tocan UNA capa. Alt cambia la pieza
// entera, así que lo que se promete es la CAJA: en verde la que dejaría la rueda arriba (×2) y en rojo
// la que dejaría la rueda abajo (÷2). Mismo verde y mismo rojo que la guía: es el mismo idioma.
function alto() { return !!mc._escAlt; }

// Dónde caería la pieza escalada: LA MISMA CUENTA que `mcPasteOrigen` (agarre + postura), con las
// dimensiones y el agarre ya escalados. Se rehace aquí en vez de escalar `clipboard` para preguntar:
// una previsualización no puede modificar lo que se va a plantar.
function cajaSi(org, f) {
  var d = org.dims, ori = org.ori;
  var w = dimEscalada(d.w, f), h = dimEscalada(d.h, f), p = dimEscalada(d.d, f);
  var r = mcOriDims(w, h, p, ori), mueve = mcOriMove(ori, w, h, p);
  var a = mc.pasteAnchor || [0, 0, 0];
  var q = mueve(tope0(f > 1 ? a[0] * 2 : (a[0] >> 1), w),
                tope0(f > 1 ? a[1] * 2 : (a[1] >> 1), h),
                tope0(f > 1 ? a[2] * 2 : (a[2] >> 1), p));
  // `base` = la celda clavada en la mira: la que el motor ya calculó para la pieza sin escalar.
  var base = [org.ox + org.anchor[0], org.oy + org.anchor[1], org.oz + org.anchor[2]];
  var o = [base[0] - q[0], base[1] - q[1], base[2] - q[2]];
  return { a: o, b: [o[0] + r[0] - 1, o[1] + r[1] - 1, o[2] + r[2] - 1] };
}

// Caja de CELDAS → sus dos esquinas en voxeles FINOS.
function enFinos(caja) {
  return [[caja.a[0] * F, caja.a[1] * F, caja.a[2] * F],
          [(caja.b[0] + 1) * F - 1, (caja.b[1] + 1) * F - 1, (caja.b[2] + 1) * F - 1]];
}

// Paso adaptativo: una caja grande se dibuja punteada en vez de tragarse la capa UI entera (la línea
// seguida de un 64³ son 12 000 voxeles, y `mcDrawArr` sube la capa ENTERA a la GPU cada frame).
// `porEje` = cuántos trazos paralelos lleva cada eje, que es lo que multiplica el gasto.
function pasoDe(p0, p1, porEje) {
  var largo = (p1[0] - p0[0]) + (p1[1] - p0[1]) + (p1[2] - p0[2]) + 3;
  return Math.max(GROSOR, Math.ceil(largo * porEje / Math.max(1, TOPE_VOX)));
}

// Trazo punteado entre dos puntos finos que sólo difieren en `eje`.
function linea(a, b, eje, paso, color, grupo) {
  var q = [a[0], a[1], a[2]], t = a[eje];
  while (true) {
    if (t > b[eje]) t = b[eje];
    q[eje] = t;
    game.voxelesUI.pon(q[0], q[1], q[2], color, grupo);
    if (t >= b[eje]) return;
    t += paso;
  }
}

// Las 12 aristas de una caja.
function aristas(p0, p1, paso, color, grupo) {
  for (var eje = 0; eje < 3; eje++) {
    var u = (eje + 1) % 3, v = (eje + 2) % 3;
    for (var iu = 0; iu < 2; iu++) for (var iv = 0; iv < 2; iv++) {
      var a = [0, 0, 0], b = [0, 0, 0];
      a[eje] = p0[eje]; b[eje] = p1[eje];
      a[u] = b[u] = iu ? p1[u] : p0[u];
      a[v] = b[v] = iv ? p1[v] : p0[v];
      linea(a, b, eje, paso, color, grupo);
    }
  }
}

// La caja del ÷2 va DENTRO de la pieza en vuelo, y la capa UI se dibuja CON el mundo (la tapa lo que
// tenga delante) ⇒ enterrada ahí no se ve NI UNA arista: la sonda midió CERO pixeles rojos en la foto.
// Sacarla «un pelo» tampoco vale, porque no está un pelo dentro sino media pieza. Así que su promesa se
// pinta donde sí hay superficie que mirar: el rectángulo que va a ocupar, estampado en las SEIS caras de
// la pieza —su sombra ortogonal— mordiendo la piel como los ▬ de Shift/Ctrl (`MC_SELGUIA_DAPIEL`, que
// existe por este mismo motivo). Mires desde donde mires tienes una cara delante, y en ella el tamaño
// que va a quedar.
function sombra(p0, p1, piel, paso, color, grupo) {
  for (var eje = 0; eje < 3; eje++) {
    var u = (eje + 1) % 3, v = (eje + 2) % 3;
    for (var lado = 0; lado < 2; lado++) {
      var t = lado ? piel[1][eje] + PIEL : piel[0][eje] - PIEL;
      for (var i = 0; i < 2; i++) {
        var a = [0, 0, 0], b = [0, 0, 0];          // los dos trazos en dirección u
        a[eje] = b[eje] = t;
        a[v] = b[v] = i ? p1[v] : p0[v];
        a[u] = p0[u]; b[u] = p1[u];
        linea(a, b, u, paso, color, grupo);
        var c = [0, 0, 0], d = [0, 0, 0];          // y los dos en dirección v
        c[eje] = d[eje] = t;
        c[u] = d[u] = i ? p1[u] : p0[u];
        c[v] = p0[v]; d[v] = p1[v];
        linea(c, d, v, paso, color, grupo);
      }
    }
  }
}

function limpia() { for (var i = 0; i < GRUPOS.length; i++) game.voxelesUI.limpia(GRUPOS[i]); }

// NO se recalcula cada frame: sólo si cambia la firma, igual que `mcSelGuiaRepinta`. Quieto con Alt
// pulsado, esto no cuesta nada; la mira lo mueve y entonces sí se rehace.
function pinta() {
  var on = alto() && pegando();
  // `mcSelGuiaPiezaEnVuelo` es EL que sabe dónde cae la pieza (agarre + postura) y cachea su rayo por
  // frame: preguntándole no hay un segundo rayo ni una segunda cuenta que pueda discrepar de la guía.
  var org = on ? mcSelGuiaPiezaEnVuelo() : null;
  var d = org ? org.dims : null;
  var firma = org ? (org.ox + ',' + org.oy + ',' + org.oz + '/' + org.ori + '/' +
                     d.w + ',' + d.h + ',' + d.d + '/' + clipboard.cells.length) : '';
  if (firma === mc._escFirma) return;
  mc._escFirma = firma;
  limpia();
  if (!firma) return;
  // Rueda arriba: la caja del ×2 cae POR FUERA de la pieza, se ve ella sola.
  var mas = enFinos(cajaSi(org, 2));
  aristas(mas[0], mas[1], pasoDe(mas[0], mas[1], 4), VERDE, GRUPOS[0]);
  // Rueda abajo: la caja del ÷2 va dentro ⇒ además de la caja, su sombra en las seis caras de la pieza.
  var menos = enFinos(cajaSi(org, 0.5));
  var piel = enFinos({ a: [org.ox, org.oy, org.oz],
                       b: [org.ox + org.rw - 1, org.oy + org.rh - 1, org.oz + org.rd - 1] });
  var paso = pasoDe(menos[0], menos[1], 12);             // 4 aristas + 8 trazos de sombra por eje
  aristas(menos[0], menos[1], paso, ROJO, GRUPOS[1]);
  sombra(menos[0], menos[1], piel, paso, ROJO, GRUPOS[1]);
}

// ── instalar / desinstalar ───────────────────────────────────────────────────────────────────────
function tecla(e) { mc._escAlt = !!e.altKey; }
function foco() { mc._escAlt = false; }

// Desde el 2026-08-29 esto vive en app.js (`herramientas/parche_app_pegar_escala.py`): el dueño lo dio
// por bueno y bajó al motor. Un envoltorio encima taparía al motor —y con dos oyentes de `wheel` el
// gesto se contaría dos veces—, así que si el motor ya lo trae, aquí no se pone nada. El snippet se
// queda para poder probarlo en un app.js viejo, no para pisar al nuevo.
function yaEnElMotor() { return typeof mcPasteEscala === 'function'; }

function on() {
  if (yaEnElMotor()) return 'ya está en app.js: no se pone nada';
  if (mc._escPuesto) return 'ya estaba puesto';
  var orig = window.mcSelGuiaRepinta;
  function repinta() {
    var r = repinta._escOrig.apply(this, arguments);
    pinta();
    return r;
  }
  repinta._escOrig = orig;                     // el original vive en la envuelta, no en un closure: sin
  window.mcSelGuiaRepinta = repinta;           // esto no habría desinstalación posible
  window.addEventListener('wheel', rueda, { capture: true, passive: false });
  window.addEventListener('keydown', tecla, true);
  window.addEventListener('keyup', tecla, true);
  window.addEventListener('blur', foco);
  for (var i = 0; i < GRUPOS.length; i++) game.voxelesUI.grosor(GRUPOS[i], GROSOR);
  mc._escPuesto = true; mc._escAlt = false; mc._escFirma = null;
  return 'puesto';
}

function off() {
  if (!mc._escPuesto) return 'no estaba puesto';
  if (window.mcSelGuiaRepinta && window.mcSelGuiaRepinta._escOrig)
    window.mcSelGuiaRepinta = window.mcSelGuiaRepinta._escOrig;
  window.removeEventListener('wheel', rueda, { capture: true });
  window.removeEventListener('keydown', tecla, true);
  window.removeEventListener('keyup', tecla, true);
  window.removeEventListener('blur', foco);
  limpia();                                    // devolver el motor byte a byte incluye la capa UI
  mc._escPuesto = false; mc._escAlt = false; mc._escFirma = null; mc._escGesto = null; mc._escAcum = 0;
  return 'quitado';
}

function estado() {
  var d = pegando() ? mcClipboardDims() : null;
  return {
    puesto: !!mc._escPuesto,
    pegando: pegando(),
    alt: alto(),
    bloques: (clipboard && clipboard.cells) ? clipboard.cells.length : 0,
    tamano: d ? (d.w + '×' + d.h + '×' + d.d) : null,
    siX2: d ? (dimEscalada(d.w, 2) + '×' + dimEscalada(d.h, 2) + '×' + dimEscalada(d.d, 2)) : null,
    siDiv2: d ? (dimEscalada(d.w, .5) + '×' + dimEscalada(d.h, .5) + '×' + dimEscalada(d.d, .5)) : null,
    tope: game.pegarEscala ? game.pegarEscala.tope : null,
    gesto: 'Ctrl+V y, con la pieza en vuelo, Alt+rueda arriba ×2 / abajo ÷2'
  };
}

game.pegarEscala = { on: on, off: off, estado: estado, escala: escala, tope: 40000 };

var r = on();

toast(yaEnElMotor() ? '⤢ Pegar escala: ya está en app.js (Ctrl+V y Alt+rueda ×2 / ÷2)'
                    : '⤢ Pegar escala: con Ctrl+V, Alt+rueda ×2 / ÷2 · game.pegarEscala.off() para quitarlo', 5);

return 'pegar-escala · ' + r;
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
