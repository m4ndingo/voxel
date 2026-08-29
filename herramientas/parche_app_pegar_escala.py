#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# «funcionan bien los dos parches, aplicarlos app.js "sel-rellena-vacia" y "pegar-escala"» (dueño,
# 2026-08-29).
#
# El gesto nació como snippet `pegar-escala` (LEY DE ORO: aislado, validado en caliente, y sólo cuando el
# dueño lo da por bueno baja al motor). Ya está dado por bueno: esto lo baja.
#
# QUÉ ES
#   Con la pieza EN VUELO (Ctrl+V), Alt+rueda la escala: arriba ×2, abajo ÷2 (dueño, 2026-08-28:
#   «*alt+rueda sirva para escalar x2 (rueda arriba) y dividir (rueda abajo) el objeto*»), y con Alt
#   pulsado se ve lo que va a pasar antes de girar la rueda («*alguna previsualizacion cuando se pulse
#   alt … como hacen shift y control al dejarse pulsados*»).
#
# QUÉ DEJA EN web/app.js
#   1. El bloque `mcPasteEsc*` detrás de `mcSelGuiaRepinta`: escalar el portapapeles (con el agarre), la
#      caja que promete Alt y su dibujo.
#   2. Tres líneas en la rueda del canvas — un gesto más (`esc`) al lado de `pega`/`extru`/`extruF`.
#   3. Alt anotado en los DOS oyentes de teclado que ya lleva la guía de Shift/Ctrl, y borrado en el
#      mismo `blur`/`focus` que borra el modo.
#   4. Los dos grupos de la capa UI con su grosor y su material, junto a los de la guía.
#
# LO QUE EL MOTOR HACE MEJOR QUE EL SNIPPET (y por qué esto no es un copia-pega):
#   · LA RUEDA. El snippet tenía que colgar su propio `wheel` en CAPTURA sobre `window` y cortar el
#     evento con `stopPropagation()` para que el mismo gesto no girara además la herramienta en mano.
#     Aquí es un gesto más de la rueda del canvas: entra en el mismo acumulador (`mc._ruedaAcum`, con el
#     mismo `mc.ruedaUmbral`) y en el mismo reparto, así que media muesca no puede escalar, cambiar de
#     gesto vacía el acumulador y no hay dos oyentes peleándose por el evento. Se van con él
#     `mc._escAcum` y `mc._escGesto`, que eran el acumulador de repuesto.
#   · EL ALT. El snippet ponía tres oyentes más (keydown/keyup/blur) para saber si la tecla está
#     pulsada; el motor ya los tiene para `mc.selGuiaModo` —y ya resuelven el caso feo, perder el foco
#     con la tecla pulsada— así que Alt se anota ahí mismo, en la misma línea.
#   · LA GUÍA. El snippet envolvía `mcSelGuiaRepinta` (`_escOrig`); aquí se llama desde dentro, justo
#     después de tirar la caché del frame, para que la caja de Alt y la guía de Shift/Ctrl salgan del
#     MISMO rayo (`mcSelGuiaPiezaEnVuelo` lo cachea por frame). Firma y grupos siguen aparte: son dos
#     promesas distintas y se apagan por separado.
#
# LO QUE NO BAJA: `game.pegarEscala` (on/off/estado/tope). Era el mando para poder quitarlo en caliente;
# un gesto del motor no se desinstala. El tope pasa a ser `MC_PASTE_ESC_TOPE`, una constante al lado de
# las demás.
#
# ⛔ LO QUE NO SE TOCA: `mcPasteOrigen`. La previsualización REHACE su cuenta con las dimensiones y el
#    agarre ya escalados en vez de escalar el portapapeles para preguntar — una promesa no puede
#    modificar lo que se va a plantar.
#
# Idempotente: si la marca ya está en app.js, no toca nada. Todo o nada: cada ancla tiene que aparecer
# EXACTAMENTE una vez o aborta sin escribir.
#
#   python3 herramientas/parche_app_pegar_escala.py
#
# ⚠️ Después: regenerar SYMBOLS.md (guardián tests/test_symbols_sync.js) — el parche añade funciones.
import os
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(RAIZ, 'web', 'app.js')

MARCA = 'function mcPasteEscala('

BLOQUE = r'''
// ── ⤢ ALT+RUEDA ESCALA LA PIEZA EN VUELO (Ctrl+V) ────────────────────────────────────────────────
// Dueño (2026-08-28): «*alt+rueda sirva para escalar x2 (rueda arriba) y dividir (rueda abajo) el
// objeto*» · «*si puede tener alguna previsualizacion cuando se pulse alt que indique que se va
// modificar su tamaño como hacen shift y control al dejarse pulsados*».
//
// QUÉ SE ESCALA: el portapapeles, no el mundo — `clipboard.cells` (offsets `dx`=x, `dz`=altura,
// `dy`=fondo). ×2 = cada celda se convierte en las 8 de su cubo; ÷2 = cada cubo de 8 se convierte en
// una celda, y el material que se queda es el MÁS REPETIDO de las ocho. Elegir «la primera» sería más
// corto pero haría que el resultado dependiera del orden en que se copió, que no es una propiedad de
// la pieza.
const MC_PASTE_ESC_TOPE = 40000;   // bloques: por encima, el ×2 no se hace (una pieza mediana se va a millones)
const MC_PASTE_ESC_GRUPOS = ['paste-esc-mas', 'paste-esc-menos'];
const MC_PASTE_ESC_TOPE_VOX = 1800;  // voxeles de la promesa: pasado esto, las aristas salen punteadas
const MC_PASTE_ESC_GROSOR = 4;       // lado del cubo de cada trazo, en finos
const MC_PASTE_ESC_PIEL = 2;         // finos que la sombra se sale de la pieza para no quedar dentro

function mcPasteEscHay(){
  return !!(mc.active && mc.pasteActive && !mc.escaparate &&
            clipboard && clipboard.cells && clipboard.cells.length);
}

// Dimensiones de la pieza al escalar por `f`: ×2 es el doble; ÷2 es el índice máximo partido, +1 (una
// pieza de 5 de ancho ocupa 0..4 ⇒ 0..2 ⇒ 3), y nunca baja de 1.
function mcPasteEscDim(n, f){ return f > 1 ? n * 2 : (((n - 1) >> 1) + 1); }
function mcPasteEscTope0(v, n){ return Math.min(Math.max(v|0, 0), Math.max(0, n - 1)); }

// De las 8 celdas que se funden en una, manda la del material más repetido (empate: la primera vista).
function mcPasteEscManda(g){
  if(g.length === 1) return g[0];
  const cuenta = new Map();
  let mejor = g[0], nMejor = 0;
  for(let i = 0; i < g.length; i++){
    const k = String(g[i].c), n = (cuenta.get(k) || 0) + 1;
    cuenta.set(k, n);
    if(n > nMejor){ nMejor = n; mejor = g[i]; }
  }
  return mejor;
}

function mcPasteEscala(f){
  if(!mcPasteEscHay()) return false;
  const cells = clipboard.cells, d = mcClipboardDims();
  if(!d) return false;
  let out;
  if(f > 1){
    if(cells.length * 8 > MC_PASTE_ESC_TOPE){
      toast('×2 dejaría ' + (cells.length*8) + ' bloques: pasa del tope (' + MC_PASTE_ESC_TOPE + ')', 4);
      return false;
    }
    out = [];
    for(const c of cells)
      for(let i=0;i<2;i++) for(let j=0;j<2;j++) for(let k=0;k<2;k++)
        out.push(Object.assign({}, c, { dx:c.dx*2+i, dy:c.dy*2+j, dz:c.dz*2+k }));
  } else {
    if(d.w===1 && d.h===1 && d.d===1){ toast('Un solo bloque: ya no se puede dividir', 3); return false; }
    const cubos = new Map();
    for(const c of cells){
      const cl = (c.dx>>1) + ',' + (c.dy>>1) + ',' + (c.dz>>1);
      const g = cubos.get(cl);
      if(g) g.push(c); else cubos.set(cl, [c]);
    }
    out = [];
    cubos.forEach((g, cl) => {
      const p = cl.split(',');
      out.push(Object.assign({}, mcPasteEscManda(g), { dx:+p[0], dy:+p[1], dz:+p[2] }));
    });
  }
  clipboard.cells = out;
  // El agarre en ejes de pieza es [dx, dz, dy] (mcAnclaDeCopia): se escala como las celdas o dejaría de
  // señalar el mismo punto de la pieza, y ésta saltaría de sitio justo al crecer.
  const a = mc.pasteAnchor;
  if(a){
    const nd = { w:mcPasteEscDim(d.w,f), h:mcPasteEscDim(d.h,f), d:mcPasteEscDim(d.d,f) };
    a[0] = mcPasteEscTope0(f>1 ? a[0]*2 : (a[0]>>1), nd.w);
    a[1] = mcPasteEscTope0(f>1 ? a[1]*2 : (a[1]>>1), nd.h);
    a[2] = mcPasteEscTope0(f>1 ? a[2]*2 : (a[2]>>1), nd.d);
    if(clipboard.ancla) clipboard.ancla = a.slice();
  }
  mcSelGuiaNormaliza();          // deja la esquina mínima en 0 y arrastra el agarre con ella
  mc._pasteCache = null;         // la geometría de la vista previa va dentro: hay que rehacerla
  mc._selGuiaVuelo = null;       // …y la guía de Shift/Ctrl mide contra la pieza
  mc.selGuiaFirma = null;
  mc._escFirma = null;           // la promesa de Alt, también
  const dd = mcClipboardDims();
  toast('Pegar escala ' + (f>1 ? '×2' : '÷2') + ' · ' + clipboard.cells.length +
        ' bloque(s) · ' + dd.w + '×' + dd.h + '×' + dd.d, 3);
  return true;
}

// ── la promesa de Alt ────────────────────────────────────────────────────────────────────────────
// Shift y Ctrl prometen celda a celda (✚ verde / ▬ rojo) porque tocan UNA capa. Alt cambia la pieza
// entera, así que lo que se promete es la CAJA: en verde la que dejaría la rueda arriba (×2) y en rojo
// la que dejaría la rueda abajo (÷2). Mismo verde y mismo rojo que la guía: es el mismo idioma.
//
// Dónde caería la pieza escalada: LA MISMA CUENTA que `mcPasteOrigen` (agarre + postura), con las
// dimensiones y el agarre ya escalados. Se rehace aquí en vez de escalar el portapapeles para
// preguntar: una promesa no puede modificar lo que se va a plantar.
function mcPasteEscCaja(org, f){
  const d = org.dims, ori = org.ori;
  const w = mcPasteEscDim(d.w,f), h = mcPasteEscDim(d.h,f), p = mcPasteEscDim(d.d,f);
  const r = mcOriDims(w, h, p, ori), mueve = mcOriMove(ori, w, h, p);
  const a = mc.pasteAnchor || [0,0,0];
  const q = mueve(mcPasteEscTope0(f>1 ? a[0]*2 : (a[0]>>1), w),
                  mcPasteEscTope0(f>1 ? a[1]*2 : (a[1]>>1), h),
                  mcPasteEscTope0(f>1 ? a[2]*2 : (a[2]>>1), p));
  // `base` = la celda clavada en la mira: la que el motor ya calculó para la pieza sin escalar.
  const base = [org.ox+org.anchor[0], org.oy+org.anchor[1], org.oz+org.anchor[2]];
  const o = [base[0]-q[0], base[1]-q[1], base[2]-q[2]];
  return { a:o, b:[o[0]+r[0]-1, o[1]+r[1]-1, o[2]+r[2]-1] };
}

// Caja de CELDAS → sus dos esquinas en voxeles FINOS.
function mcPasteEscFinos(caja){
  const F = MC_SELGUIA_FINOS;
  return [[caja.a[0]*F, caja.a[1]*F, caja.a[2]*F],
          [(caja.b[0]+1)*F-1, (caja.b[1]+1)*F-1, (caja.b[2]+1)*F-1]];
}

// Paso adaptativo: una caja grande se dibuja punteada en vez de tragarse la capa UI entera (la línea
// seguida de un 64³ son 12 000 voxeles, y `mcDrawArr` sube la capa ENTERA a la GPU cada frame).
// `porEje` = cuántos trazos paralelos lleva cada eje, que es lo que multiplica el gasto.
function mcPasteEscPaso(p0, p1, porEje){
  const largo = (p1[0]-p0[0]) + (p1[1]-p0[1]) + (p1[2]-p0[2]) + 3;
  return Math.max(MC_PASTE_ESC_GROSOR, Math.ceil(largo*porEje/Math.max(1, MC_PASTE_ESC_TOPE_VOX)));
}

// Trazo punteado entre dos puntos finos que sólo difieren en `eje`.
function mcPasteEscLinea(a, b, eje, paso, color, grupo){
  const q = [a[0], a[1], a[2]];
  let t = a[eje];
  for(;;){
    if(t > b[eje]) t = b[eje];
    q[eje] = t;
    game.voxelesUI.pon(q[0], q[1], q[2], color, grupo);
    if(t >= b[eje]) return;
    t += paso;
  }
}

// Las 12 aristas de una caja.
function mcPasteEscAristas(p0, p1, paso, color, grupo){
  for(let eje = 0; eje < 3; eje++){
    const u = (eje+1)%3, v = (eje+2)%3;
    for(let iu = 0; iu < 2; iu++) for(let iv = 0; iv < 2; iv++){
      const a = [0,0,0], b = [0,0,0];
      a[eje] = p0[eje]; b[eje] = p1[eje];
      a[u] = b[u] = iu ? p1[u] : p0[u];
      a[v] = b[v] = iv ? p1[v] : p0[v];
      mcPasteEscLinea(a, b, eje, paso, color, grupo);
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
function mcPasteEscSombra(p0, p1, piel, paso, color, grupo){
  for(let eje = 0; eje < 3; eje++){
    const u = (eje+1)%3, v = (eje+2)%3;
    for(let lado = 0; lado < 2; lado++){
      const t = lado ? piel[1][eje]+MC_PASTE_ESC_PIEL : piel[0][eje]-MC_PASTE_ESC_PIEL;
      for(let i = 0; i < 2; i++){
        const a = [0,0,0], b = [0,0,0];              // los dos trazos en dirección u
        a[eje] = b[eje] = t;
        a[v] = b[v] = i ? p1[v] : p0[v];
        a[u] = p0[u]; b[u] = p1[u];
        mcPasteEscLinea(a, b, u, paso, color, grupo);
        const c = [0,0,0], d = [0,0,0];              // y los dos en dirección v
        c[eje] = d[eje] = t;
        c[u] = d[u] = i ? p1[u] : p0[u];
        c[v] = p0[v]; d[v] = p1[v];
        mcPasteEscLinea(c, d, v, paso, color, grupo);
      }
    }
  }
}

function mcPasteEscLimpia(){ for(const g of MC_PASTE_ESC_GRUPOS) game.voxelesUI.limpia(g); }

// NO se redibuja cada frame: sólo si cambia la FIRMA, igual que `mcSelGuiaRepinta`. Quieto con Alt
// pulsado esto no cuesta nada; la mira mueve la pieza y entonces sí se rehace.
// Va con FIRMA Y GRUPOS PROPIOS, no dentro de la guía de Shift/Ctrl: son dos promesas distintas (una
// habla de una capa, la otra de la pieza entera) y se encienden y apagan por separado.
function mcPasteEscGuia(){
  // `mcSelGuiaPiezaEnVuelo` es EL que sabe dónde cae la pieza (agarre + postura) y cachea su rayo por
  // frame: preguntándole no hay un segundo rayo ni una segunda cuenta que pueda discrepar de la guía.
  const org = (mc._escAlt && mcPasteEscHay()) ? mcSelGuiaPiezaEnVuelo() : null;
  const d = org ? org.dims : null;
  const firma = org ? (org.ox+','+org.oy+','+org.oz+'/'+org.ori+'/'+
                       d.w+','+d.h+','+d.d+'/'+clipboard.cells.length) : '';
  if(firma === mc._escFirma) return;
  mc._escFirma = firma;
  mcPasteEscLimpia();
  if(!firma) return;
  // Rueda arriba: la caja del ×2 cae POR FUERA de la pieza, se ve ella sola.
  const mas = mcPasteEscFinos(mcPasteEscCaja(org, 2));
  mcPasteEscAristas(mas[0], mas[1], mcPasteEscPaso(mas[0], mas[1], 4), MC_SELGUIA_VERDE, MC_PASTE_ESC_GRUPOS[0]);
  // Rueda abajo: la caja del ÷2 va dentro ⇒ además de la caja, su sombra en las seis caras de la pieza.
  const menos = mcPasteEscFinos(mcPasteEscCaja(org, 0.5));
  const piel = mcPasteEscFinos({ a:[org.ox, org.oy, org.oz],
                                 b:[org.ox+org.rw-1, org.oy+org.rh-1, org.oz+org.rd-1] });
  const paso = mcPasteEscPaso(menos[0], menos[1], 12);      // 4 aristas + 8 trazos de sombra por eje
  mcPasteEscAristas(menos[0], menos[1], paso, MC_SELGUIA_ROJO, MC_PASTE_ESC_GRUPOS[1]);
  mcPasteEscSombra(menos[0], menos[1], piel, paso, MC_SELGUIA_ROJO, MC_PASTE_ESC_GRUPOS[1]);
}
'''

CAMBIOS = [
    # 1 · el bloque entero, detrás de mcSelGuiaRepinta (de quien cuelga la promesa de Alt)
    ('  mc.selGuiaUltimo = mcSelGuiaCalcula(mc.selGuiaModo);\n'
     '  mc.selGuiaUltimo.voxeles = mcSelGuiaDibuja(mc.selGuiaUltimo);\n'
     '}\n',
     '  mc.selGuiaUltimo = mcSelGuiaCalcula(mc.selGuiaModo);\n'
     '  mc.selGuiaUltimo.voxeles = mcSelGuiaDibuja(mc.selGuiaUltimo);\n'
     '}\n' + BLOQUE),

    # 2 · la promesa de Alt se pinta desde el mismo frame de la guía, y ANTES de sus `return`: tiene
    #     firma propia, así que las salidas de la otra no pueden dejarla colgada. Aquí la caché del rayo
    #     está recién tirada ⇒ las dos promesas miran el mismo sitio.
    ('  mc._selGuiaPre = null;                         // …y la mira, que arrastra la caja fantasma\n'
     '  const f = mcSelGuiaFirma();',
     '  mc._selGuiaPre = null;                         // …y la mira, que arrastra la caja fantasma\n'
     '  mcPasteEscGuia();                              // la caja de Alt (escalar la pieza en vuelo): otra firma, otros grupos\n'
     '  const f = mcSelGuiaFirma();'),

    # 3 · la rueda: un gesto más, al lado de pega/extru/extruF
    ('  const extru = !pega && e.ctrlKey && mc.tool===\'select\' && !!mc.selBox;',
     '  const extru = !pega && e.ctrlKey && mc.tool===\'select\' && !!mc.selBox;\n'
     '  // ALT+rueda ESCALA la pieza en vuelo: arriba ×2, abajo ÷2 (dueño, 2026-08-28). Va aquí y no en un\n'
     '  // oyente aparte para entrar en el MISMO acumulador que los demás: media muesca no puede escalar, y\n'
     '  // cambiar de gesto lo vacía. Sin Ctrl ni Meta, así que no se pisa con `pega` (que los exige).\n'
     '  const esc = e.altKey && !e.ctrlKey && !e.metaKey && mcPasteEscHay();'),

    ('  if(!pega && !extru && !extruF && !mc.ruedaTool) return;',
     '  if(!pega && !esc && !extru && !extruF && !mc.ruedaTool) return;'),

    ("  const gesto = pega ? ('pega:'+(e.ctrlKey?'ctrl':'shift')) : (extru ? 'y' : (extruF ? 'frente' : 'rosca'));",
     "  const gesto = esc ? 'esc' : (pega ? ('pega:'+(e.ctrlKey?'ctrl':'shift')) : (extru ? 'y' : (extruF ? 'frente' : 'rosca')));"),

    # ⛔ El `esc` manda sobre la rosca de herramientas: con la pieza volando, Alt+rueda escala y NO cambia
    #    de herramienta (el snippet lo conseguía cortando el evento con stopPropagation).
    ("  if(pega) mcSelGuiaCreceEncoge(paso, e.ctrlKey ? 'ctrl' : 'shift');",
     "  if(esc) mcPasteEscala(paso > 0 ? 2 : 0.5);\n"
     "  else if(pega) mcSelGuiaCreceEncoge(paso, e.ctrlKey ? 'ctrl' : 'shift');"),

    # 4 · Alt se anota donde ya se anota el modificador de la guía: mismos oyentes, mismo criterio (de los
    #     MODIFICADORES DEL EVENTO, nunca de un contador propio) y mismo apagado al perder el foco.
    ("window.addEventListener('keydown', e=>{ mc.selGuiaModo = mcSelGuiaModoDe(e); }, true);\n"
     "window.addEventListener('keyup',   e=>{ mc.selGuiaModo = mcSelGuiaModoDe(e); }, true);",
     "window.addEventListener('keydown', e=>{ mc.selGuiaModo = mcSelGuiaModoDe(e); mc._escAlt = !!e.altKey; }, true);\n"
     "window.addEventListener('keyup',   e=>{ mc.selGuiaModo = mcSelGuiaModoDe(e); mc._escAlt = !!e.altKey; }, true);"),

    ("const mcSelGuiaFoco = e=>{ if(!e.target || e.target===window || e.target===document) mc.selGuiaModo=''; };",
     "const mcSelGuiaFoco = e=>{ if(!e.target || e.target===window || e.target===document){ mc.selGuiaModo=''; mc._escAlt=false; } };"),

    # 5 · los grupos de la capa UI: grosor y material se ponen UNA vez y sobreviven a limpia()
    ('for(const g of MC_SELGUIA_GRUPOS){\n'
     '  game.voxelesUI.grosor(g, MC_SELGUIA_GROSOR);\n'
     '  game.voxelesUI.material(g, { emite:true, luz:0 });\n'
     '}',
     'for(const g of MC_SELGUIA_GRUPOS){\n'
     '  game.voxelesUI.grosor(g, MC_SELGUIA_GROSOR);\n'
     '  game.voxelesUI.material(g, { emite:true, luz:0 });\n'
     '}\n'
     '// Los de la caja de Alt van más finos (es una caja, no un glifo) pero con el mismo brillo gratis.\n'
     'for(const g of MC_PASTE_ESC_GRUPOS){\n'
     '  game.voxelesUI.grosor(g, MC_PASTE_ESC_GROSOR);\n'
     '  game.voxelesUI.material(g, { emite:true, luz:0 });\n'
     '}'),
]


def main():
    with open(APP, encoding='utf-8') as f:
        src = f.read()
    if MARCA in src:
        print('app.js: pegar-escala ya estaba aplicado — no se toca nada')
        return 0
    # TODAS las anclas antes de escribir NINGUNA: a medio parchear el motor queda incoherente.
    for ancla, _ in CAMBIOS:
        if src.count(ancla) != 1:
            print('ABORTA: el ancla aparece %d veces, esperaba 1\n  %s'
                  % (src.count(ancla), ancla[:70]), file=sys.stderr)
            return 1
    for ancla, nuevo in CAMBIOS:
        src = src.replace(ancla, nuevo, 1)
    d = os.path.dirname(APP)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(src)
    os.replace(tmp, APP)
    print('app.js: pegar-escala aplicado (%d cambios)' % len(CAMBIOS))
    print('Ahora: regenerar SYMBOLS.md (guardián tests/test_symbols_sync.js)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
