#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-EXTRU4 · baja a `app.js` la CARA OPUESTA de la herramienta Seleccionar.

Dueño (2026-08-28): «*si un bloque esta en el aire se le podrian poner patas seleccionando sus bloques,
clic central, y luego control+abajo*» · «*seguir empujando hacia adelante pero rellenando con los bloques
seleccionados (por ejemplo para construir puentes)*» → y, tras probar el snippet: «*esta correcto,
aplicar parche a app.js*».

Nació como snippet `sel-cara-opuesta` (Ley de Oro), validado por `tests/probe_sel_cara_opuesta.js`.

QUÉ CAMBIA (4 sitios):
  1. tres funciones nuevas antes de `mcCopySelection`: `mcSelExtruirAbajo`, `mcSelExtruirFondo` y
     `mcSelConmutaCaraOpuesta`;
  2. `mcSelExtruir` despacha a la de abajo cuando `mc.selOpuesta`;
  3. `mcSelExtruirFrente` despacha a la del fondo igual;
  4. el clic CENTRAL conmuta el modo con la herramienta Seleccionar puesta.

⛔ NO TOCA las guardas de `!edits.length` ni las de `!col.size`/`!fila.size` (REQ-EXTRU3): son de otra
cosa y las protege la regla del dueño del 2026-08-20.

Idempotente: si ya está aplicado (MARCA), sale sin hacer nada. Escritura atómica (mkstemp + os.replace).
"""
import os, sys, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(RAIZ, 'web', 'app.js')

MARCA = 'function mcSelExtruirAbajo('

# ── 1 · las tres funciones nuevas ─────────────────────────────────────────────────────────────────
ANCLA_FUN = '// Ctrl+C: vuelca la caja seleccionada'

FUNCIONES = r'''// REQ-EXTRU4 · LA CARA OPUESTA (dueño, 2026-08-28) ────────────────────────────────────────────────
// El motor trabaja SIEMPRE por una cara de la selección: la de ARRIBA con Ctrl, la que DA LA CARA al
// jugador con Shift. Y por esa cara construye en un sentido de la rueda y come en el otro. El clic
// CENTRAL cambia CUÁL ES ESA CARA: pasa a la de ABAJO y a la del FONDO.
//
//   normal          Ctrl  ↑ construye ENCIMA         · ↓ come por ARRIBA
//                   Shift ↑ come por la CARA (hueco) · ↓ construye HACIA TI
//   mc.selOpuesta   Ctrl  ↓ construye DEBAJO  ← patas de una pieza flotante
//                   Shift ↑ construye ADELANTE ← tender un puente
//
// ⛔ NO ES «invertir la rueda». Ese fue el primer intento y el dueño lo rechazó: «*no se cambia la
// direccion de la rueda, se cambia como se comporta la herramienta*». Dar la vuelta al signo deja
// Shift↑ TRAYENDO bloques hacia el jugador, que es justo lo que no quería (quería seguir empujando
// hacia adelante, pero rellenando).
//
// Las dos muescas que CONSTRUYEN (Ctrl↓ y Shift↑) son las que pidió; las dos que COMEN son su inversa,
// y no son un adorno: sin ellas se rompe la regla del dueño del 2026-08-20 —«*un wup seguido de un wdown
// debería dejar los bloques iguales que como estaban*»— dentro de este modo.
//
// El bloque nuevo se replica del que hay EN ESA CARA (`c.id`), no del de la mano: «*replicando los
// seleccionados*». Un muro de varios materiales se prolonga entero, cada columna con el suyo.
//
// La caja se estira por esa misma cara, igual que el motor hace por la suya: al construir crece una
// celda, al comer encoge una, y con grosor 1 se desplaza entera. Así la muesca siguiente ve lo recién
// puesto sin volver a marcar esquinas — que es lo que hace que las patas salgan de una tacada.

// Espejo de `mcSelExtruir`: donde aquél se queda con la CIMA de cada columna, éste con el SUELO.
// La columna es (caja, x, z) y NO (x, z): dos cajas pueden caer sobre el mismo sitio a distinta altura
// —una en el tejado y otra en el sótano— y son dos suelos, no uno (REQ-SEL1).
function mcSelExtruirAbajo(dir){
  const construye = dir<0;                                // rueda ABAJO construye: es la petición
  const col=new Map();
  mcSelForEach((x,y,z,id,ci)=>{
    const k=ci+':'+x+','+z, v=col.get(k);
    if(!v || y<v.y) col.set(k,{x,y,z,id});                 // `<`: el más BAJO (mcSelExtruir usa `>`)
  });
  // Caja vacía: la mueve el motor (REQ-EXTRU3) y en el sentido de siempre — la rueda no cambia de signo.
  if(!col.size) return mcSelMueveVacia(1, dir>0?1:-1, dir>0?'arriba':'abajo', dir>0?'quitar':'construir');
  const edits=[];
  for(const c of col.values()){
    if(construye){
      const y=c.y-1;
      if(!mcInside(c.x,y,c.z)) continue;                   // suelo del mundo
      const before=mc.grid[mcIdx(c.x,y,c.z)];
      mcSetBlock(c.x,y,c.z,c.id);                          // mcSetBlock y no mc.grid[..]=: es un cambio
      edits.push({x:c.x,y,z:c.z,before,after:c.id});       // de TOPOLOGÍA y tiene que re-iluminar
    } else {
      mcSetBlock(c.x,c.y,c.z,0);
      edits.push({x:c.x,y:c.y,z:c.z,before:c.id,after:0});
    }
  }
  // Si NINGUNA columna pudo escribir no ha pasado nada, y la caja tampoco se mueve: moverla sería mentir.
  if(!edits.length){ toast(construye?'No cabe nada más abajo':'Nada que quitar por abajo'); return false; }
  mc._selCajasBeforeEdit = mc.selCajas.map(s=>({ a:s.a.slice(), b:s.b.slice() }));
  for(const s of mc.selCajas){
    const y0=Math.min(s.a[1],s.b[1]), y1=Math.max(s.a[1],s.b[1]);
    const baja = (s.a[1]<=s.b[1]) ? s.a : s.b;             // la esquina que sujeta el SUELO de la caja
    const alta = (baja===s.a) ? s.b : s.a;
    if(construye) baja[1]=Math.max(0, y0-1);               // crece una celda hacia abajo
    else { const ny=Math.min(mc.dim.y-1, y0+1); baja[1]=ny; if(y1<ny) alta[1]=ny; }
  }                                                        // alto 1 ⇒ la caja entera sube y sigue comiendo
  mcRemeshEdiciones(edits); mcPushHist({t:'bb', edits}); mcScheduleSave();
  toast((construye?'Patas — ':'Quitado por abajo — ')+edits.length+' bloque(s)');
  if(construye) mcForceUnstick();                          // construir bajo los pies puede dejarte dentro
  return true;
}
// Espejo de `mcSelExtruirFrente`: donde aquél se queda con el bloque que DA LA CARA, éste con el del
// FONDO, y en vez de comérselo pone uno más allá. El eje se recalcula EN CADA MUESCA, como el motor: te
// giras y el puente se gira contigo.
function mcSelExtruirFondo(dir){
  const construye = dir>0;                                 // rueda ARRIBA construye hacia adelante
  const m = mcEjeMirada(), eje = m.eje, sN = m.sN;         // `sN` apunta AL FRENTE (alejándose)
  const lim = eje===0 ? mc.dim.x : mc.dim.z;
  const fila=new Map();
  mcSelForEach((x,y,z,id,ci)=>{
    const p = eje===0 ? x : z;
    const k=ci+':'+y+','+(eje===0?z:x), v=fila.get(k);
    if(!v || (sN>0 ? p>v.p : p<v.p)) fila.set(k,{x,y,z,p,id});   // el del FONDO (el motor coge el de cerca)
  });
  if(!fila.size) return mcSelMueveVacia(eje, (dir>0?1:-1)*sN, dir>0?'hacia dentro':'hacia ti', dir>0?'construir':'quitar');
  const edits=[];
  for(const c of fila.values()){
    if(construye){
      const x=c.x+(eje===0?sN:0), z=c.z+(eje===2?sN:0);    // una celda MÁS ALLÁ del fondo
      if(!mcInside(x,c.y,z)) continue;                     // borde del mundo
      const before=mc.grid[mcIdx(x,c.y,z)];
      mcSetBlock(x,c.y,z,c.id);                            // con SU material: un muro de varios va entero
      edits.push({x,y:c.y,z,before,after:c.id});
    } else {
      mcSetBlock(c.x,c.y,c.z,0);
      edits.push({x:c.x,y:c.y,z:c.z,before:c.id,after:0});
    }
  }
  if(!edits.length){ toast(construye?'No cabe nada más adelante':'Nada que quitar por el fondo'); return false; }
  mc._selCajasBeforeEdit = mc.selCajas.map(s=>({ a:s.a.slice(), b:s.b.slice() }));
  for(const s of mc.selCajas){
    const p0=Math.min(s.a[eje],s.b[eje]), p1=Math.max(s.a[eje],s.b[eje]);
    const cerca = ((sN>0)===(s.a[eje]<=s.b[eje])) ? s.a : s.b;   // la esquina que da la cara
    const lejos = (cerca===s.a) ? s.b : s.a;
    if(construye) lejos[eje] = sN>0 ? Math.min(lim-1,p1+1) : Math.max(0,p0-1);
    else { const np = sN>0 ? Math.max(0,p1-1) : Math.min(lim-1,p0+1);
           lejos[eje]=np; if(sN>0 ? p0>np : p1<np) cerca[eje]=np; }   // grosor 1 ⇒ retrocede entera
  }
  mcRemeshEdiciones(edits); mcPushHist({t:'bb', edits}); mcScheduleSave();
  toast((construye?'Puente — ':'Quitado por el fondo — ')+edits.length+' bloque(s) · eje '+m.nombre);
  if(construye) mcForceUnstick();
  return true;
}
// El conmutador. Vive en `mc.selOpuesta` (no se persiste: al recargar se vuelve a lo normal, que un modo
// escondido que sobrevive a la recarga es indistinguible de un motor roto).
// ⚠️ El clic central lo comparte con REDSTONE (`redstone/redstone-piezas.js`, conmuta palancas), que
// escucha en `window` en CAPTURA y llega antes. Por eso esto sólo mira con la herramienta Seleccionar;
// aun así, clic central apuntando a una palanca conmuta la palanca TAMBIÉN.
function mcSelConmutaCaraOpuesta(){
  mc.selOpuesta = !mc.selOpuesta;
  toast(mc.selOpuesta ? 'CARA OPUESTA · Ctrl↓ pone patas debajo · Shift↑ tiende puente hacia adelante'
                      : 'Normal · Ctrl↑ construye encima · Shift↑ hace hueco', 4);
  return mc.selOpuesta;
}
'''

# ── 2, 3, 4 · los despachos y el clic central ─────────────────────────────────────────────────────
CAMBIOS = [
    ("function mcSelExtruir(dir){\n"
     "  if(mc.tool!=='select' || !mc.selBox || !dir) return false;\n",
     "function mcSelExtruir(dir){\n"
     "  if(mc.tool!=='select' || !mc.selBox || !dir) return false;\n"
     "  if(mc.selOpuesta) return mcSelExtruirAbajo(dir);        // REQ-EXTRU4 · clic central: cara de abajo\n"),

    ("function mcSelExtruirFrente(dir){\n"
     "  if(mc.tool!=='select' || !mc.selBox || !dir) return false;\n",
     "function mcSelExtruirFrente(dir){\n"
     "  if(mc.tool!=='select' || !mc.selBox || !dir) return false;\n"
     "  if(mc.selOpuesta) return mcSelExtruirFondo(dir);        // REQ-EXTRU4 · clic central: cara del fondo\n"),

    ("  if(e.button===1){ e.preventDefault(); return; }\n",
     "  if(e.button===1){ e.preventDefault();\n"
     "    if(mc.tool==='select') mcSelConmutaCaraOpuesta();     // REQ-EXTRU4 · conmuta la cara de trabajo\n"
     "    return; }\n"),
]


def main():
    src = open(APP, encoding='utf-8').read()

    if MARCA in src:
        print('Ya estaba aplicado (%s). No se toca nada.' % MARCA.strip())
        return True

    # Ancla de las funciones nuevas
    if src.count(ANCLA_FUN) != 1:
        print('ABORTA: el ancla de las funciones aparece %d veces, no 1 (%r)'
              % (src.count(ANCLA_FUN), ANCLA_FUN), file=sys.stderr)
        return False
    src = src.replace(ANCLA_FUN, FUNCIONES + ANCLA_FUN, 1)

    # Los tres cambios en su sitio, cada uno comprobado por separado
    for viejo, nuevo in CAMBIOS:
        n = src.count(viejo)
        if n != 1:
            print('ABORTA: un ancla aparece %d veces, no 1:\n%s' % (n, viejo), file=sys.stderr)
            return False
        src = src.replace(viejo, nuevo, 1)

    # Escritura atómica: nunca un app.js a medias, que lo sirve el servidor en vivo.
    d = os.path.dirname(APP)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.app.js.', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(src)
        os.replace(tmp, APP)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    print('Aplicado REQ-EXTRU4 a %s' % APP)
    return True


if __name__ == '__main__':
    sys.exit(0 if main() else 1)
