#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Baja a `app.js` la guía visual de extrusión validada en el snippet `sel-guia-extrusion` (REQ-EXTRU5).

Dueño (2026-08-28): «*necesito un nuevo snippet parche en caliente para saber visualmente hacia donde se
crece o encoge la pieza con shift y control presionados en la herramienta de seleccion […] al igual que
hacen los brackets si empujar o traer con shift o hacer crecer o decrecer con control va a sumar o
restar en cada direccion posible*»; y, tras probarlo: «*funciona correcto, comprobado, aplicar parche a
app.js*» + «*aunque no esta bien centrado del todo*» (el centrado se corrigió ANTES de bajar esto).

Pegando (Ctrl+V) el gesto NO va sobre la caja de origen sino sobre EL CÚMULO EN VUELO, donde caería
ahora mismo, y allí Ctrl/⇧+rueda lo engordan o lo adelgazan por la cara marcada: «*pegando sí hay
extrusión que predecir, pero donde se está pegando la pieza, no de donde se copió*» y «*con desaparecer
sigue funcionando control+rueda en la seleccion previa*» (dueño, 2026-08-28). Validado en el snippet y
aprobado: «*funcionan correctos ambos […] aplicalos a app.js*».

Qué cambia respecto al snippet: aquí no hace falta envolver `mcUpdate` —el repintado se llama desde el
sitio donde el motor ya arma el dibujo de la selección— y el mando se reduce a `game.selGuia`.

Idempotente por MARCA. Aborta si cualquier ancla no aparece EXACTAMENTE una vez. Escritura atómica.

  python3 herramientas/parche_app_sel_guia_extrusion.py [--comprobar]
"""
import os, sys, tempfile

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'app.js')
APP = os.path.normpath(APP)
MARCA = 'function mcSelGuiaRepinta('

# ── 1) las funciones ────────────────────────────────────────────────────────────────────────────────
ANCLA_FUN = '// Ctrl+C: vuelca la caja seleccionada a `clipboard`'

FUNCIONES = r"""// REQ-EXTRU5 · LA GUÍA: al dejar pulsado Shift o Ctrl con Seleccionar, la selección enseña POR DÓNDE va
// a crecer (✚ verde, la celda que la rueda llenaría) y POR DÓNDE a encoger (▬ rojo, pegado a la piel del
// bloque que la rueda se comería). Orden del dueño (2026-08-28): «*saber visualmente hacia donde se crece
// o encoge la pieza con shift y control presionados […] al igual que hacen los brackets*».
//
// Se pintan LOS DOS A LA VEZ porque la rueda gira en los dos sentidos, y se pinta LA SILUETA —marca a
// marca, el bloque que da la cara de cada columna/fila, igual que recorre el extrusor— y no una capa
// plana: sobre una pared irregular, una plancha mentiría.
//
// LA REGLA ES UNA SOLA, y por eso esto no repite los cuatro extrusores. Los cuatro hacen lo mismo con
// distinta cara: se quedan con el bloque más lejano de cada fila EN EL SENTIDO DE TRABAJO `out`, se lo
// comen, o ponen uno en `cara + out`. De ahí sale toda la tabla:
//
//        gesto            cara de trabajo   out         suma con   resta con   extrusor
//   Ctrl normal           la CIMA           +Y          rueda ↑    rueda ↓     mcSelExtruir
//   Ctrl cara opuesta     el SUELO          −Y          rueda ↓    rueda ↑     mcSelExtruirAbajo
//   Shift normal          la que TE MIRA    −sN (a ti)  rueda ↓    rueda ↑     mcSelExtruirFrente
//   Shift cara opuesta    el FONDO          +sN         rueda ↑    rueda ↓     mcSelExtruirFondo
//
// ⚠️ Ojo con los dos Shift: ahí «suma» es la rueda ABAJO (traer hacia ti). No es un despiste copiando
// Ctrl — son los sentidos INVERSOS a posta desde REQ-EXTRU2. Y Ctrl gana a Shift si se pulsan los dos,
// que es lo que hace la rueda más abajo (`extru = e.ctrlKey && …` se mira primero).
//
// La celda verde se salta si cae fuera del mundo, que es exactamente lo que hace el extrusor con su
// `continue`: si ahí no va a poner nada, prometerlo sería mentir.
const MC_SELGUIA_FINOS = 16;      // voxeles finos por bloque (MC_VOX = 1/16 de unidad de mundo)
const MC_SELGUIA_GROSOR = 5;      // lado del cubo de cada trazo, en finos: a 5 los trazos se tocan y sueldan
// ⚠️ UN VOXEL DE LA CAPA UI NO ESTÁ CENTRADO EN SU COORDENADA: `mcVoxUIGeom` planta el cubo con la
// ESQUINA en `q*paso` y lo hace crecer `grosor` finos hacia +. Por eso los trazos van en ESQUINAS
// medidas desde la esquina del bloque, y no como ±5 alrededor del centro (8): eso fue el primer intento
// y salía corrido 2,5 finos —lo vio el dueño de un vistazo: «*aunque no esta bien centrado del todo*»—.
// Con grosor 5, un glifo centrado son tres trazos en 0, 5 y 10: ocupa 0..15 de los 16 de la celda.
const MC_SELGUIA_MAS   = [[5,5],[0,5],[10,5],[5,0],[5,10]];
const MC_SELGUIA_MENOS = [[0,5],[5,5],[10,5]];
const MC_SELGUIA_PUNTO = [[5,5]];
const MC_SELGUIA_DACENTRO = (MC_SELGUIA_FINOS - MC_SELGUIA_GROSOR - 1) >> 1;   // 5 · ✚ centrado en la celda ganada
const MC_SELGUIA_DAPIEL   = MC_SELGUIA_FINOS - 3;                              // 13 · ▬ mordiendo la piel: 3 dentro, 2 fuera
const MC_SELGUIA_GRUPOS = ['sel-guia-mas', 'sel-guia-menos', 'sel-guia-mueve'];
const MC_SELGUIA_VERDE = '#2fe36a', MC_SELGUIA_ROJO = '#ff3b30', MC_SELGUIA_CIAN = '#35d6ff';
const MC_SELGUIA_TOPE_GLIFO = 220;   // más caras que esto ⇒ un punto por celda en vez del glifo (legible igual, y barato)
const MC_SELGUIA_TOPE_VOX = 4000;    // tope duro: por encima se dibuja una de cada N celdas

function mcSelGuiaGesto(modo){
  const op = !!mc.selOpuesta;
  if(modo === 'ctrl') return { eje:1, out:op?-1:1, nombre:op?'−Y (suelo)':'+Y (cima)',
                               ruedaMas:op?'abajo':'arriba', ruedaMenos:op?'arriba':'abajo' };
  const m = mcEjeMirada(), out = op ? m.sN : -m.sN;
  return { eje:m.eje, out, nombre:(out>0?'+':'−')+'XYZ'[m.eje]+(op?' (fondo)':' (hacia ti)'),
           ruedaMas:op?'arriba':'abajo', ruedaMenos:op?'abajo':'arriba', mirada:m.nombre };
}

// La cara de trabajo: por cada fila, el bloque más lejano en el sentido `out`. La fila es (caja, las
// otras dos coordenadas) y NO sólo las coordenadas: dos cajas pueden caer sobre la misma fila a
// distinta profundidad y son dos caras, no una — el mismo motivo por el que los extrusores meten `ci`
// en la clave (REQ-SEL1).
// PEGANDO (Ctrl+V) el gesto NO va sobre la selección sino sobre EL CÚMULO EN VUELO, y en el sitio donde
// caería ahora mismo. Dueño (2026-08-28): «*pegando sí hay extrusión que predecir, pero donde se está
// pegando la pieza, no de donde se copió*». `mcPasteOrigen` es el ÚNICO que sabe dónde cae (agarre +
// postura), así que se le pregunta a él en vez de rehacer la cuenta; si él no lo sabe —nada a la vista—,
// no hay nada que prometer. La caché dura UN frame: con la tecla pulsada esto se pregunta dos veces por
// frame (la firma y el cálculo) y serían dos rayos por uno.
function mcSelGuiaPiezaEnVuelo(){
  if(mc._selGuiaVuelo) return mc._selGuiaVuelo.v;
  let v = null;
  if(mc.pasteActive && clipboard && clipboard.cells && clipboard.cells.length)
    v = mcPasteOrigen(mcRaycast(mcReach(), true)) || null;
  mc._selGuiaVuelo = { v };
  return v;
}

// Las celdas del gesto, en coordenadas de MUNDO. Ojo al remapeo del portapapeles, que es el del editor:
// pieza-X = `dx`, pieza-Y (altura) = `dz`, pieza-Z (profundidad) = `dy`, igual que en `mcClipboardDims`.
// ⛔ PEGANDO NO HAY RESPALDO: si el cúmulo no tiene dónde caer, no se marca NADA. Caer aquí en la
// selección sería el bug de origen otra vez, disfrazado de «por si acaso».
function mcSelGuiaCeldas(cb){
  if(mc.pasteActive){
    const org = mcSelGuiaPiezaEnVuelo();
    if(!org) return null;
    for(const cel of clipboard.cells){
      const q = org.mueve(cel.dx, cel.dz, cel.dy);
      cb(org.ox+q[0], org.oy+q[1], org.oz+q[2], 0);
    }
    return org;
  }
  mcSelForEach((x,y,z,id,ci)=>cb(x,y,z,ci));
  return null;
}

function mcSelGuiaCalcula(modo){
  const g = mcSelGuiaGesto(modo), eje = g.eje, out = g.out;
  const cara = new Map();
  const vuelo = mcSelGuiaCeldas((x,y,z,ci)=>{
    const p = eje===0 ? x : (eje===1 ? y : z);
    const k = ci+':'+(eje===0 ? y+','+z : (eje===1 ? x+','+z : x+','+y));
    const v = cara.get(k);
    if(!v || (out>0 ? p>v.p : p<v.p)) cara.set(k, {x,y,z,p});
  });
  const mas=[], menos=[];
  for(const c of cara.values()){
    menos.push([c.x, c.y, c.z]);
    const x = c.x+(eje===0?out:0), y = c.y+(eje===1?out:0), z = c.z+(eje===2?out:0);
    if(mcInside(x,y,z)) mas.push([x,y,z]);       // fuera del mundo el extrusor hace `continue`: no se promete
  }
  return { modo, eje, out, cara:g, mas, menos, vacia:cara.size===0, pegando:!!vuelo };
}

// ── la ACCIÓN sobre la pieza en vuelo (REQ-EXTRU5) ────────────────────────────────────────────────
// El cúmulo se guarda SIN ROTAR y el gesto viene en ejes de MUNDO ⇒ primero se traduce el eje. `mueve`
// es afín, así que el eje de la pieza que alimenta un eje de mundo sale probando un paso en cada uno
// (tres restas, y sólo al girar la rueda): no hay tabla inversa en el motor y no merece la pena añadirla.
function mcSelGuiaEjePieza(mueve, eje){
  const o = mueve(0,0,0);
  for(let k=0; k<3; k++){
    const p=[0,0,0]; p[k]=1;
    const q = mueve(p[0], p[1], p[2]);
    if(q[eje] !== o[eje]) return { k, signo: q[eje] > o[eje] ? 1 : -1 };
  }
  return null;
}

// Engordar por el lado bajo deja celdas en −1, y tanto `mcClipboardDims` como el agarre cuentan desde 0.
// Se recorre la pieza al origen Y EL AGARRE CON ELLA: el agarre es la celda que se clava en la mira, así
// que moverlo igual es lo que mantiene la pieza quieta en la mano mientras le sale la capa nueva.
function mcSelGuiaNormaliza(){
  let mx=Infinity, my=Infinity, mz=Infinity;
  for(const c of clipboard.cells){
    if(c.dx<mx) mx=c.dx; if(c.dz<my) my=c.dz; if(c.dy<mz) mz=c.dy;
  }
  if(!isFinite(mx) || (mx===0 && my===0 && mz===0)) return;
  for(const c of clipboard.cells){ c.dx-=mx; c.dz-=my; c.dy-=mz; }
  const a = mc.pasteAnchor;                      // ejes de la pieza: [x, y(altura), z] = [dx, dz, dy]
  if(a){ a[0]=Math.max(0,a[0]-mx); a[1]=Math.max(0,a[1]-my); a[2]=Math.max(0,a[2]-mz); }
  if(a && clipboard.ancla) clipboard.ancla = a.slice();   // el agarre heredado se corre con la pieza
}

// LA MISMA REGLA QUE DIBUJA LA GUÍA, aplicada al portapapeles: por cada fila, la celda más lejana en el
// sentido `out`. Engordar la copia un paso más allá (con su material); adelgazar se la come.
function mcSelGuiaCreceEncoge(paso, modo){
  if(!mc.pasteActive || !clipboard || !clipboard.cells || !clipboard.cells.length) return false;
  const g = mcSelGuiaGesto(modo), dims = mcClipboardDims();
  if(!g || !dims) return false;
  const ep = mcSelGuiaEjePieza(mcOriMove(mcPasteOri(), dims.w, dims.h, dims.d), g.eje);
  if(!ep) return false;
  const k = ep.k, out = g.out * ep.signo;
  const crece = (paso > 0) === (g.ruedaMas === 'arriba');
  const filas = new Map();
  for(const c of clipboard.cells){
    const p = [c.dx, c.dz, c.dy], q = p[k];
    const f = p[(k+1)%3] + ',' + p[(k+2)%3];
    const v = filas.get(f);
    if(!v || (out>0 ? q>v.q : q<v.q)) filas.set(f, {c, q, p});
  }
  if(!filas.size) return false;
  if(crece){
    for(const v of filas.values()){
      const p = v.p.slice(); p[k] += out;
      clipboard.cells.push(Object.assign({}, v.c, { dx:p[0], dz:p[1], dy:p[2] }));
    }
  } else {
    const fuera = new Set();
    for(const v of filas.values()) fuera.add(v.c);
    if(fuera.size >= clipboard.cells.length){ toast('La pieza se quedaría sin un solo bloque'); return false; }
    clipboard.cells = clipboard.cells.filter(c => !fuera.has(c));
  }
  mcSelGuiaNormaliza();
  mc._selGuiaVuelo = null;                       // la pieza es otra: dónde cae hay que rehacerlo
  mc._pasteCache = null;                         // la vista previa lleva la geometría dentro
  mc.selGuiaFirma = null;                        // y repinta ya, sin esperar a que se mueva la mira
  const d = mcClipboardDims();
  toast('Pegar: la pieza '+(crece?'engorda':'adelgaza')+' por '+g.nombre+' · '+
        clipboard.cells.length+' bloque(s), '+d.w+'×'+d.h+'×'+d.d, 3);
  return true;
}

// `da` = esquina del trazo por el EJE DE TRABAJO, en finos desde la esquina de la celda (puede ser
// negativa: el ▬ de una cara «hacia −» se planta un poco por fuera del bloque).
function mcSelGuiaGlifo(cel, eje, da, trazos, color, grupo){
  const F = MC_SELGUIA_FINOS, b = [cel[0]*F, cel[1]*F, cel[2]*F];
  const uv = eje===0 ? [2,1] : (eje===1 ? [0,2] : [0,1]);
  for(const t of trazos){
    const p = [b[0], b[1], b[2]];
    p[eje] += da; p[uv[0]] += t[0]; p[uv[1]] += t[1];
    game.voxelesUI.pon(p[0], p[1], p[2], color, grupo);
  }
  return trazos.length;
}

// La cara «hacia −» es el espejo de la «hacia +»: si por arriba el ▬ va en 13..18, por abajo va en
// −2..3. Así no hay dos números que ajustar a mano.
function mcSelGuiaDaPiel(out){
  return out>0 ? MC_SELGUIA_DAPIEL : (MC_SELGUIA_FINOS - MC_SELGUIA_DAPIEL - MC_SELGUIA_GROSOR);
}

function mcSelGuiaLimpia(){ for(const g of MC_SELGUIA_GRUPOS) game.voxelesUI.limpia(g); }

function mcSelGuiaDibuja(m){
  mcSelGuiaLimpia();
  let n = 0;
  if(m.vacia){
    // Caja vacía: el extrusor no crea ni destruye, MUEVE la caja entera (REQ-EXTRU3, mcSelMueveVacia).
    // Pintar verde/rojo sería falso, así que va un ▬ CIAN en la cara de trabajo: «esto se mueve».
    for(const s of mc.selCajas){
      const lo = [Math.min(s.a[0],s.b[0]), Math.min(s.a[1],s.b[1]), Math.min(s.a[2],s.b[2])];
      const hi = [Math.max(s.a[0],s.b[0]), Math.max(s.a[1],s.b[1]), Math.max(s.a[2],s.b[2])];
      const cel = [(lo[0]+hi[0])>>1, (lo[1]+hi[1])>>1, (lo[2]+hi[2])>>1];
      cel[m.eje] = m.out>0 ? hi[m.eje] : lo[m.eje];
      n += mcSelGuiaGlifo(cel, m.eje, mcSelGuiaDaPiel(m.out), MC_SELGUIA_MENOS, MC_SELGUIA_CIAN, MC_SELGUIA_GRUPOS[2]);
    }
    return n;
  }
  const total = m.mas.length + m.menos.length;
  const completo = total <= MC_SELGUIA_TOPE_GLIFO;
  const tMas = completo ? MC_SELGUIA_MAS : MC_SELGUIA_PUNTO;
  const tMenos = completo ? MC_SELGUIA_MENOS : MC_SELGUIA_PUNTO;
  const paso = Math.max(1, Math.ceil(total*(tMas.length+tMenos.length)/MC_SELGUIA_TOPE_VOX));
  for(let i=0; i<m.mas.length; i+=paso)
    n += mcSelGuiaGlifo(m.mas[i], m.eje, MC_SELGUIA_DACENTRO, tMas, MC_SELGUIA_VERDE, MC_SELGUIA_GRUPOS[0]);
  for(let i=0; i<m.menos.length; i+=paso)
    n += mcSelGuiaGlifo(m.menos[i], m.eje, mcSelGuiaDaPiel(m.out), tMenos, MC_SELGUIA_ROJO, MC_SELGUIA_GRUPOS[1]);
  return n;
}

// Mismas condiciones de entrada que la rueda: Ctrl manda sobre Shift, y Shift sólo cuenta a secas.
function mcSelGuiaModoDe(e){
  if(e.ctrlKey) return 'ctrl';
  if(e.shiftKey && !e.altKey && !e.metaKey) return 'shift';
  return '';
}

// Hay DOS piezas que pueden llevar el gesto y NO se solapan: pegando manda el cúmulo en vuelo (y la
// herramienta da igual, que se pega con cualquiera); si no, la caja de Seleccionar.
function mcSelGuiaHayPieza(){
  return mc.pasteActive ? !!mcSelGuiaPiezaEnVuelo()          // sin sitio donde caer, sin promesa
                        : !!(mc.tool==='select' && mc.selBox);
}
function mcSelGuiaToca(){
  return !!(mc.selGuia !== false && mc.selGuiaModo && mc.active && mcSelGuiaHayPieza());
}

// NO se recalcula cada frame: sólo si cambia la FIRMA. Girar la cabeza cambia el eje de Shift (y por eso
// la mirada entra en la firma); quieto, una selección grande no cuesta nada porque no se vuelve a mirar.
function mcSelGuiaFirma(){
  if(!mcSelGuiaToca()) return '';
  let s = mc.selGuiaModo + '|' + (mc.selOpuesta?1:0) + '|' + (mc.gridGen|0);
  if(mc.pasteActive){
    // La pieza VUELA: su sitio cambia con la mira, así que la firma lleva dónde cae y cómo está puesta.
    const o = mcSelGuiaPiezaEnVuelo();
    if(!o) return '';
    s += '|pega:'+o.ox+','+o.oy+','+o.oz+'/'+o.ori+'/'+clipboard.cells.length+
         '/'+o.dims.w+','+o.dims.h+','+o.dims.d;
  } else {
    for(const c of mc.selCajas) s += '|' + c.a.join(',') + '/' + c.b.join(',');
  }
  if(mc.selGuiaModo === 'shift') s += '|' + mcEjeMirada().nombre;
  return s;
}

function mcSelGuiaRepinta(){
  mc._selGuiaVuelo = null;                       // frame nuevo: el cúmulo ya no está donde estaba
  const f = mcSelGuiaFirma();
  if(f === mc.selGuiaFirma) return;
  mc.selGuiaFirma = f;
  if(!f){ mcSelGuiaLimpia(); mc.selGuiaUltimo = null; return; }
  mc.selGuiaUltimo = mcSelGuiaCalcula(mc.selGuiaModo);
  mc.selGuiaUltimo.voxeles = mcSelGuiaDibuja(mc.selGuiaUltimo);
}

"""

# ── 2) el repintado, en el mismo sitio donde se arma el dibujo de la selección ──────────────────────
ANCLA_FRAME = '  // 4) Herramienta Seleccionar: caja CIAN viva de la selección confirmada'

FRAME = """  // REQ-EXTRU5 · la guía de extrusión (✚/▬) se refresca aquí, donde ya se está armando el dibujo de la
  // selección: es una vez por frame y con el estado del frame. No pinta en `selLines` —va por la capa
  // `game.voxelesUI`, que se dibuja CON el mundo y por tanto la tapan los bloques de delante, que es lo
  // que se quiere: la marca de la cara de atrás no debe verse.
  mcSelGuiaRepinta();
"""

# ── 3) los oyentes de teclado y el mando ───────────────────────────────────────────────────────────
ANCLA_KEYUP = """      toast('Agarre suelto: el giro vuelve a la esquina de la caja');
    }
  }
});"""

OYENTES = """      toast('Agarre suelto: el giro vuelve a la esquina de la caja');
    }
  }
});

// REQ-EXTRU5 · el modificador que mantiene abierta la guía de extrusión. Se lee de los MODIFICADORES DEL
// EVENTO (`e.ctrlKey`, `e.shiftKey`), nunca de un contador de pulsaciones propio: si el navegador se
// lleva el foco con Ctrl pulsado no llega el keyup y el contador se queda mintiendo para siempre.
// ⛔ Y SÓLO de keydown/keyup. Se probó a refrescar también con `mousemove` —parecía gratis— y es una
// trampa: hay `mousemove` DE CONFIANZA con movimiento (0,0) y sin los modificadores puestos, así que
// apagaban la guía a media pulsación. Tampoco hacían falta: no hay forma de cambiar de modificador sin
// un keydown o un keyup.
// Van aparte de los handlers de arriba, y en CAPTURA, a posta: esos se van por sus `return` en cuanto
// hay un selector/nota/código abierto, y aquí sólo se está anotando una tecla, sin tocar el evento.
window.addEventListener('keydown', e=>{ mc.selGuiaModo = mcSelGuiaModoDe(e); }, true);
window.addEventListener('keyup',   e=>{ mc.selGuiaModo = mcSelGuiaModoDe(e); }, true);
// Perder el foco con la tecla pulsada es el caso feo: el keyup NUNCA llega. ⚠️ `focus`/`blur` NO
// BURBUJEAN y aun así un oyente en CAPTURA sobre `window` los ve TODOS —enfocar el canvas, un input del
// OSD…—, y eso apagaría la guía a media pulsación: por eso estos dos van SIN captura y comprobando que
// el que va y viene es la VENTANA. Mismo criterio que `mc.selCtrlHeld` más arriba.
const mcSelGuiaFoco = e=>{ if(!e.target || e.target===window || e.target===document) mc.selGuiaModo=''; };
window.addEventListener('blur',  mcSelGuiaFoco);
window.addEventListener('focus', mcSelGuiaFoco);

// El mando. La guía va PUESTA de fábrica (es el gesto que pidió el dueño); `activa(false)` la apaga sin
// tocar nada más, y `marcas(modo)` la calcula SIN pintar y sin tener la tecla pulsada — que es la puerta
// para la consola y para la sonda `tests/probe_sel_guia.js`.
game.selGuia = {
  activa(v){
    if(v===undefined) return mc.selGuia !== false;
    mc.selGuia = !!v;
    if(!mc.selGuia){ mc.selGuiaModo=''; mc.selGuiaFirma=null; mc.selGuiaUltimo=null; mcSelGuiaLimpia(); }
    return mc.selGuia;
  },
  marcas(m){
    const usa = m || mc.selGuiaModo;
    if(!usa || !mcSelGuiaHayPieza()) return null;
    return mcSelGuiaCalcula(usa==='ctrl' ? 'ctrl' : 'shift');
  },
  estado(){
    const g = mc.selGuiaModo ? mcSelGuiaGesto(mc.selGuiaModo) : null, u = mc.selGuiaUltimo;
    return { activa:(mc.selGuia!==false), modo:(mc.selGuiaModo||'(ninguno)'), dibujando:!!mc.selGuiaFirma,
             caraOpuesta:!!mc.selOpuesta, herramienta:mc.tool, cajas:mc.selCajas.length, hayCaja:!!mc.selBox,
           pegando:!!mc.pasteActive,                       // pegando el gesto va sobre la pieza en vuelo,
           piezaBloques:(mc.pasteActive && clipboard && clipboard.cells) ? clipboard.cells.length : 0,
           piezaCabe:mc.pasteActive ? !!mcSelGuiaPiezaEnVuelo() : null,      // no sobre la de origen
             cara:g?g.nombre:null, sumaConRueda:g?g.ruedaMas:null, restaConRueda:g?g.ruedaMenos:null,
             marcasMas:u?u.mas.length:0, marcasMenos:u?u.menos.length:0, cajaVacia:u?u.vacia:null,
             voxelesPintados:u?(u.voxeles|0):0, grupos:MC_SELGUIA_GRUPOS,
             ayuda:'Mantén Shift o Ctrl con Seleccionar y una caja hecha. ✚ verde = ahí pone · ▬ rojo = eso se come.' };
  }
};
// El grosor y el material de los grupos sobreviven a `limpia()`, así que se ponen UNA vez: un ✚ son 5
// voxeles gordos, no 625 finos (⛔ nunca apilar voxeles: `mcDrawArr` sube la capa entera cada frame).
// `emite` es brillo GRATIS —no ilumina nada— para que la marca se lea en un sótano; `luz:0` para no
// meter un foco en la escena, que sí costaría.
for(const g of MC_SELGUIA_GRUPOS){
  game.voxelesUI.grosor(g, MC_SELGUIA_GROSOR);
  game.voxelesUI.material(g, { emite:true, luz:0 });
}"""

# 4) La rueda. Pegando, Ctrl/⇧ dejan de extruir la caja de ORIGEN —que sigue viva y seleccionada aunque
#    el cúmulo esté volando a diez metros— y pasan a engordar/adelgazar la pieza en vuelo. En el snippet
#    esto había que robárselo al canvas con un oyente en captura; aquí es una rama más, en su sitio.
ANCLA_RUEDA = """  const extru = e.ctrlKey && mc.tool==='select' && !!mc.selBox;
  // REQ-EXTRU2 · el mismo trato para Shift, pero hundiendo/trayendo por el eje que se mira
  // (mcSelExtruirFrente). Sin Ctrl/Alt/Meta: Shift a secas. Shift+clic sigue siendo añadir caja
  // (REQ-SEL1) — son gestos distintos, no se pisan.
  const extruF = e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && mc.tool==='select' && !!mc.selBox;
  if(e.ctrlKey){ e.preventDefault(); if(mc.selCtrlHeld) mc.selCtrlUsado = true; }   // este Ctrl ya tiene dueño: al soltarlo no fija agarre
  if(!extru && !extruF && !mc.ruedaTool) return;
  e.preventDefault();
  // El acumulador es el mismo para los dos gestos, pero se vacía al cambiar de gesto: media muesca de
  // rosca a medias no puede acabar extruyendo (ni al revés).
  const gesto = extru ? 'y' : (extruF ? 'frente' : 'rosca');
  if(mc._ruedaExtru !== gesto){ mc._ruedaExtru = gesto; mc._ruedaAcum = 0; }
  mc._ruedaAcum = (mc._ruedaAcum || 0) + e.deltaY;
  const umbral = (isFinite(+mc.ruedaUmbral) && +mc.ruedaUmbral > 0) ? +mc.ruedaUmbral : 30;
  if(Math.abs(mc._ruedaAcum) < umbral) return;
  const paso = mc._ruedaAcum > 0 ? -1 : 1;   // deltaY > 0 = rosca hacia abajo = bajar en la escalera
  mc._ruedaAcum = 0;
  if(extru) mcSelExtruir(paso); else if(extruF) mcSelExtruirFrente(paso); else mcRuedaHerramienta(paso);"""

RUEDA = """  // REQ-EXTRU5 · PEGANDO (Ctrl+V) manda EL CÚMULO EN VUELO: Ctrl/⇧+rueda lo engordan o lo adelgazan por
  // la cara que marca la guía, y ⛔ NO extruyen la caja de origen, que sigue viva y seleccionada aunque
  // la pieza esté volando lejos. Dueño (2026-08-28): «*con desaparecer sigue funcionando control+rueda
  // en la seleccion previa*». Manda sobre los dos extrusores: pegando no hay nada más que hacer con Ctrl.
  const pega = !!mc.pasteActive && (e.ctrlKey || (e.shiftKey && !e.altKey && !e.metaKey));
  const extru = !pega && e.ctrlKey && mc.tool==='select' && !!mc.selBox;
  // REQ-EXTRU2 · el mismo trato para Shift, pero hundiendo/trayendo por el eje que se mira
  // (mcSelExtruirFrente). Sin Ctrl/Alt/Meta: Shift a secas. Shift+clic sigue siendo añadir caja
  // (REQ-SEL1) — son gestos distintos, no se pisan.
  const extruF = !pega && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && mc.tool==='select' && !!mc.selBox;
  if(e.ctrlKey){ e.preventDefault(); if(mc.selCtrlHeld) mc.selCtrlUsado = true; }   // este Ctrl ya tiene dueño: al soltarlo no fija agarre
  if(!pega && !extru && !extruF && !mc.ruedaTool) return;
  e.preventDefault();
  // El acumulador es el mismo para los dos gestos, pero se vacía al cambiar de gesto: media muesca de
  // rosca a medias no puede acabar extruyendo (ni al revés).
  const gesto = pega ? ('pega:'+(e.ctrlKey?'ctrl':'shift')) : (extru ? 'y' : (extruF ? 'frente' : 'rosca'));
  if(mc._ruedaExtru !== gesto){ mc._ruedaExtru = gesto; mc._ruedaAcum = 0; }
  mc._ruedaAcum = (mc._ruedaAcum || 0) + e.deltaY;
  const umbral = (isFinite(+mc.ruedaUmbral) && +mc.ruedaUmbral > 0) ? +mc.ruedaUmbral : 30;
  if(Math.abs(mc._ruedaAcum) < umbral) return;
  const paso = mc._ruedaAcum > 0 ? -1 : 1;   // deltaY > 0 = rosca hacia abajo = bajar en la escalera
  mc._ruedaAcum = 0;
  if(pega) mcSelGuiaCreceEncoge(paso, e.ctrlKey ? 'ctrl' : 'shift');
  else if(extru) mcSelExtruir(paso); else if(extruF) mcSelExtruirFrente(paso); else mcRuedaHerramienta(paso);"""

CAMBIOS = [
    ('las funciones de la guía', ANCLA_FUN, FUNCIONES + ANCLA_FUN),
    ('el repintado por frame', ANCLA_FRAME, FRAME + ANCLA_FRAME),
    ('los oyentes y game.selGuia', ANCLA_KEYUP, OYENTES),
    ('la rueda: pegando, la pieza en vuelo', ANCLA_RUEDA, RUEDA),
]


def main():
    solo_comprobar = '--comprobar' in sys.argv
    src = open(APP, encoding='utf-8').read()

    if MARCA in src:
        print('Ya estaba aplicado (marca «%s» presente). No se toca nada.' % MARCA)
        return 0

    # Toda ancla, EXACTAMENTE una vez: si app.js ha cambiado bajo los pies, se para antes de escribir.
    for nombre, ancla, _ in CAMBIOS:
        n = src.count(ancla)
        if n != 1:
            print('ABORTA · el ancla de «%s» aparece %d veces (se esperaba 1):\n  %s'
                  % (nombre, n, ancla.splitlines()[0][:100]), file=sys.stderr)
            return 1

    out = src
    for nombre, ancla, nuevo in CAMBIOS:
        out = out.replace(ancla, nuevo, 1)
        print('  · %s' % nombre)

    if solo_comprobar:
        print('Anclas OK (%d). Con --comprobar no se escribe.' % len(CAMBIOS))
        return 0

    # Escritura atómica: temp en el mismo directorio + os.replace.
    d = os.path.dirname(APP)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.app.js.', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(out)
        os.replace(tmp, APP)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    print('Aplicado a %s (%d → %d líneas)' % (APP, src.count('\n') + 1, out.count('\n') + 1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
