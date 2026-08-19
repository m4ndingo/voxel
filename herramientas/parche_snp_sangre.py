#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-SANGRE1 · Salpicadura de voxeles rojos al golpear a un agente articulado con la espada.

Dueño: «*ya se ve dónde es el golpe. Ahora lo que quiero es que detectes las coordenadas exactas en
el mapa para que donde se ha dado el golpe, uses la función de pintar voxels de 1x1x1 de color rojo
y hagas un efecto de como si le saltase sangre al agente cuando le golpean con la espada. Que caigan
los voxels/sangre al suelo y se queden por ahí tirados al menos 30 segundos*».

Las coordenadas exactas ya las da BUG-AG19: `game.esqueletos.enLaMira().punto`. Lo que falta es el
efecto, y va entero en el snippet de la herramienta (§ Agentes, orden 2) — cero líneas de `app.js`:

  · `game.sangre` = motor de gotas. Viven en `game.voxelesUI` (capa de adorno: voxeles de color de
    1/16 de bloque que NO son mundo — no colisionan, no se guardan, no salen en la foto del mapa),
    en su **grupo propio** `sangre`, así que limpiarlas no toca lo que haya plantado nadie más.
  · Saltan del punto del tajo hacia el jugador, caen con gravedad, chocan contra el terreno y las
    piezas finas, y se quedan tiradas `game.sangre.dura` segundos (30 por defecto).
  · La capa se remalla ENTERA cuando algo cambia, así que el bucle solo la ensucia los frames en los
    que algo se mueve; posadas no cuestan nada y sin gotas el rAF se apaga solo.

Idempotente; publica por POST /api/snippets y cae al fichero si el servidor no está en pie.
"""
import json, os, sys, urllib.request, urllib.error

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUTA = os.path.join(RAIZ, 'data', 'snippets', 'herramienta-espada.json')
API = os.environ.get('VOXEL_API', 'http://localhost:8500')
MARCA = 'game.sangre'

# ── 1. el tajo salpica ─────────────────────────────────────────────────────────────────────────
A_VIEJO = """    if(h){
      const zona = h.alto > 0.75 ? 'en lo alto' : (h.alto < 0.3 ? 'abajo' : 'a media altura');
      toast('\U0001f5e1️ Tajo #' + game.espada.golpes + ' a ' + h.texto + ' · ' + zona
            + ' (voxel ' + h.local.join(',') + ' de ' + h.dim.join('×') + ')');
      return;
    }"""
A_NUEVO = """    if(h){
      // 🩸 Y aquí es donde sirve de algo saber el punto exacto: la sangre sale DE la herida.
      game.sangre.salpica(h.punto);
      const zona = h.alto > 0.75 ? 'en lo alto' : (h.alto < 0.3 ? 'abajo' : 'a media altura');
      toast('\U0001f5e1️ Tajo #' + game.espada.golpes + ' a ' + h.texto + ' · ' + zona
            + ' (voxel ' + h.local.join(',') + ' de ' + h.dim.join('×') + ')');
      return;
    }"""

# ── 2. el motor de gotas, antes de ponerse la espada en la mano ────────────────────────────────
B_VIEJO = """// …y a la mano.
game.playerTool = 'espada';"""
MOTOR = """// ── \U0001fa78 Sangre: gotas de voxel que saltan, caen y se quedan tiradas ────────────────────
// El sitio del golpe lo da BUG-AG19 (`game.esqueletos.enLaMira().punto`); esto es lo que se dibuja
// ahí. Las gotas viven en `game.voxelesUI`, la capa de ADORNO: voxeles de color de 1/16 de bloque
// que **no son mundo** — no colisionan, no se guardan, no salen en la foto del mapa y se pierden al
// recargar. Grupo propio (`sangre`), así que limpiarlas no toca lo que haya plantado nadie más.
//
// ⚠️ `mcVoxUIGeom` remalla la capa ENTERA cuando algo cambia, así que el bucle solo la ensucia los
// frames en los que algo se ha movido de verdad: con todas las gotas posadas no cuesta nada, y en
// cuanto no queda ninguna el rAF se apaga solo. `game.sangre.activa = false` lo apaga entero.
(function(){
  const S = window.__sangre || (window.__sangre = {});
  if(S.raf) cancelAnimationFrame(S.raf);          // reejecutar el snippet no deja dos bucles vivos
  S.on = false; S.gotas = [];
  if(game.voxelesUI) game.voxelesUI.limpia('sangre');

  const CFG = {
    activa: true,
    chorro: 22,        // cuántas gotas saltan por tajo
    dura: 30,          // segundos que se quedan en el suelo (lo que pidió el dueño)
    desvanece: 4,      // los últimos N de esos segundos se van oscureciendo hasta desaparecer
    grav: 24,          // bloques/s² — más que la del jugador: son gotas, no sacos
    fuerza: 5.5,       // velocidad de salida
    rebote: 0.22,      // cuánto conserva al chocar
    tope: 500,         // gotas vivas como mucho; las más viejas se van antes de tiempo
    vuelo: 8,          // segundos volando como mucho (una que se cae al vacío no se queda ahí)
    colores: [[0.78,0.08,0.08],[0.66,0.05,0.05],[0.88,0.15,0.12],[0.55,0.03,0.03],[0.83,0.23,0.11]]
  };

  // ¿Hay algo sólido en este punto? Terreno por bloques y piezas finas/decorado por voxel fino: las
  // dos preguntas, porque una gota que atraviesa una mesa canta mucho.
  //
  // ⚠️ A PROPÓSITO se le pregunta a la sonda SIN ENVOLVER (`mcFineBoxHit._orig`). La envuelta por
  // `mundo-autoarranque` incluye a los agentes articulados, y con ella las gotas se posaban sobre el
  // propio bicho (medido: 9 de 22 «posadas» a los 0,1 s, a y≈16,4, sin haber caído) — y el bicho
  // luego se va andando y deja la mancha flotando en el aire. La sangre choca con el mundo QUIETO.
  // ⚠️ Y la rejilla se pregunta por FORMA, no por celda. `mcSolid` contesta «¿hay materia en esta
  // celda?», que para una antorcha, una flor o un repetidor es `true` en el cubo ENTERO: la gota se
  // posaba sobre una caja invisible de 1×1×1 flotando alrededor de la antorcha (foto #56 del dueño).
  // La forma de verdad está en `mc._geoFina` (bits en 1/16 por id de material), que es justo lo que
  // mira `mcTerrenoChoca` para chocar al jugador ⇒ la sangre cae por donde el jugador se cuela.
  function solido(x, y, z){
    if(y < 0) return true;                                          // el fondo del mundo
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    const rej = (typeof mcSolidWalk === 'function') ? mcSolidWalk : (typeof mcSolid === 'function' ? mcSolid : null);
    if(rej && rej(bx, by, bz)){
      const g = (typeof mc !== 'undefined' && mc._geoFina && typeof mcIdx === 'function')
        ? mc._geoFina[mc.grid[mcIdx(bx, by, bz)]] : null;
      if(!g || !g.bits) return true;                                // celda maciza de verdad: el cubo entero
      const d = g.fdim, T = MC_TILE;
      const fx = Math.floor(x*T) - bx*T, fy = Math.floor(y*T) - by*T, fz = Math.floor(z*T) - bz*T;
      if(fx >= 0 && fy >= 0 && fz >= 0 && fx < d[0] && fy < d[1] && fz < d[2]
         && g.bits[(fy*d[2] + fz)*d[0] + fx]) return true;          // ha dado en el palo de la antorcha
      // hueco de la pieza fina: aquí no hay nada, la gota sigue cayendo
    }
    const caja = (typeof mcFineBoxHit === 'function') ? (mcFineBoxHit._orig || mcFineBoxHit) : null;
    if(caja){
      const T = 1 / MC_VOX, fx = Math.floor(x*T), fy = Math.floor(y*T), fz = Math.floor(z*T);
      if(caja(fx, fy, fz, fx, fy, fz)) return true;
    }
    return false;
  }

  function posa(g, ahora){ g.vx = g.vy = g.vz = 0; g.posada = ahora; }

  // Un paso de la simulación. Devuelve si ALGO ha cambiado (o sea, si hay que repintar).
  function paso(dt, ahora){
    const V = S.gotas; let cambia = false;
    for(let i = V.length - 1; i >= 0; i--){
      const g = V[i];
      if(g.posada){
        const vida = ahora - g.posada;
        if(vida >= CFG.dura){ V.splice(i, 1); cambia = true; continue; }
        // El desvanecido es lo único que hace trabajar a una gota quieta, y solo al final.
        const f = (vida > CFG.dura - CFG.desvanece)
                ? Math.max(0.15, (CFG.dura - vida) / CFG.desvanece) : 1;
        if(f !== g.f){ g.f = f; cambia = true; }
        continue;
      }
      // ⚠️ El vuelo se cuenta en tiempo SIMULADO (sumando `dt`), no de reloj. Con `dt` acotado, en
      // una máquina a pocos fps un segundo de reloj es una fracción de segundo de caída: midiendo
      // por reloj se mataban gotas que aún estaban en el aire (medido: 16 de 22 en swiftshader).
      // El descanso en el suelo, en cambio, SÍ es de reloj: «30 segundos» son 30 segundos.
      if((g.vuela = (g.vuela || 0) + dt) > CFG.vuelo){ V.splice(i, 1); cambia = true; continue; }
      // Subpasos de como mucho medio voxel fino: a 5 bloques/s un frame entero se salta el suelo.
      const v = Math.hypot(g.vx, g.vy, g.vz);
      const n = Math.max(1, Math.min(24, Math.ceil(v * dt / (MC_VOX * 0.5))));
      const h = dt / n;
      for(let k = 0; k < n; k++){
        g.vy -= CFG.grav * h;
        const nx = g.x + g.vx*h, ny = g.y + g.vy*h, nz = g.z + g.vz*h;
        if(solido(nx, ny, nz)){
          if(solido(g.x, ny, g.z)){                      // suelo (o techo): rebota poco y se frena
            g.vy = -g.vy * CFG.rebote; g.vx *= 0.45; g.vz *= 0.45;
            if(Math.abs(g.vy) < 1.1){ posa(g, ahora); break; }
          }else{                                          // pared: se escurre por ella
            if(solido(nx, g.y, g.z)) g.vx = -g.vx * CFG.rebote;
            if(solido(g.x, g.y, nz)) g.vz = -g.vz * CFG.rebote;
          }
          // Y la salida de emergencia: en un rincón puede tocar en diagonal sin que ninguna de las
          // dos ramas de arriba la pose, y entonces se queda rebotando contra la esquina sin avanzar
          // hasta que `vuelo` la mata. Si no ha avanzado en 12 subpasos seguidos, se posa y ya.
          if((g.atasco = (g.atasco || 0) + 1) > 12){ posa(g, ahora); break; }
          continue;                                       // este subpaso no avanza
        }
        g.x = nx; g.y = ny; g.z = nz; g.atasco = 0;
      }
      cambia = true;
    }
    return cambia;
  }

  // Se repinta el grupo entero: son pocas y así no hay que llevar la cuenta de qué voxel ocupaba
  // cada gota el frame anterior. `tam` de la capa es global, así que el paso se lee de ella.
  function pinta(){
    const U = game.voxelesUI; if(!U) return;
    U.limpia('sangre');
    const p = MC_VOX * Math.max(1, U.tam | 0);
    for(const g of S.gotas){
      const c = g.col, f = g.f === undefined ? 1 : g.f;
      U.pon(Math.floor(g.x/p), Math.floor(g.y/p), Math.floor(g.z/p), [c[0]*f, c[1]*f, c[2]*f], 'sangre');
    }
  }

  function arranca(){
    if(S.on) return;
    S.on = true;
    let prev = performance.now();
    const tick = () => {
      if(!S.on) return;
      const t = performance.now(), dt = Math.min(0.05, (t - prev) / 1000); prev = t;
      if(CFG.activa && paso(dt, t / 1000)) pinta();
      if(!S.gotas.length){ S.on = false; if(game.voxelesUI) game.voxelesUI.limpia('sangre'); return; }
      S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
  }

  game.sangre = Object.assign(CFG, {
    // salpica(punto) — punto del mundo, tal cual lo devuelve game.esqueletos.enLaMira().punto
    salpica(p){
      if(!CFG.activa || !p || !game.voxelesUI) return 0;
      const ahora = performance.now() / 1000, V = S.gotas;
      // Hacia DÓNDE: al revés de la mirada (por donde ha entrado el filo) y hacia arriba.
      const cp = Math.cos(mc.pitch || 0);
      const hx = Math.sin(mc.yaw || 0) * cp, hz = Math.cos(mc.yaw || 0) * cp;
      for(let i = 0; i < CFG.chorro; i++){
        const f = CFG.fuerza * (0.35 + Math.random() * 0.9);
        V.push({
          x: p[0] + (Math.random()-0.5) * 0.14,
          y: p[1] + (Math.random()-0.5) * 0.14,
          z: p[2] + (Math.random()-0.5) * 0.14,
          vx: hx * f + (Math.random()-0.5) * CFG.fuerza * 0.9,
          vy: (0.3 + Math.random() * 0.9) * CFG.fuerza * 0.75,
          vz: hz * f + (Math.random()-0.5) * CFG.fuerza * 0.9,
          col: CFG.colores[(Math.random() * CFG.colores.length) | 0],
          nace: ahora, posada: 0, f: 1
        });
      }
      while(V.length > CFG.tope) V.shift();
      arranca();
      return CFG.chorro;
    },
    limpia(){ S.gotas.length = 0; S.on = false; if(S.raf) cancelAnimationFrame(S.raf);
              if(game.voxelesUI) game.voxelesUI.limpia('sangre'); return 0; },
    info(){ let posadas = 0;
            for(const g of S.gotas) if(g.posada) posadas++;
            return { vivas: S.gotas.length, posadas, volando: S.gotas.length - posadas,
                     bucle: S.on, activa: CFG.activa, dura: CFG.dura, chorro: CFG.chorro }; }
  });
})();

"""
B_NUEVO = MOTOR + B_VIEJO

CAMBIOS = [('el tajo salpica', A_VIEJO, A_NUEVO), ('motor de gotas', B_VIEJO, B_NUEVO)]

# El motor es un bloque contiguo entre estas dos marcas. Re-ejecutar el parche lo SUSTITUYE entero en
# vez de rendirse: así se puede iterar sobre el efecto (fuerza, gravedad, colores) sin dejar restos ni
# tener que rehacer el snippet a mano.
INICIO = '// ── \U0001fa78 Sangre:'
FIN = '// …y a la mano.'


def aplicar():
    if not os.path.exists(RUTA):
        print('Error: no existe %s' % RUTA, file=sys.stderr); return False
    with open(RUTA, 'r', encoding='utf-8') as f:
        data = json.load(f)
    code = data.get('code', '')

    if MARCA in code:
        i, j = code.find(INICIO), code.find(FIN)
        if i < 0 or j < i:
            print('Error: game.sangre está pero no encuentro sus marcas; nada escrito.', file=sys.stderr)
            return False
        if code[i:j] == MOTOR:
            print('Ya aplicado y sin cambios: no se toca nada.'); return True
        code = code[:i] + MOTOR + code[j:]
        print('game.sangre ya estaba: se SUSTITUYE el motor entero.')
    else:
        for nombre, viejo, nuevo in CAMBIOS:
            n = code.count(viejo)
            if n != 1:
                print('Error: el ancla «%s» aparece %d veces (esperaba 1). Nada escrito.' % (nombre, n),
                      file=sys.stderr)
                return False
            code = code.replace(viejo, nuevo, 1)

    data['code'] = code
    cuerpo = json.dumps(data, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(API + '/api/snippets', data=cuerpo, method='POST',
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        print('Publicado por POST /api/snippets · game.sangre (REQ-SANGRE1)')
        return True
    except (urllib.error.URLError, OSError) as e:
        print('Servidor no disponible (%s); escribiendo el fichero.' % e, file=sys.stderr)
        tmp = RUTA + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, RUTA)
        print('Escrito %s (REQ-SANGRE1)' % RUTA)
        return True


if __name__ == '__main__':
    sys.exit(0 if aplicar() else 1)
