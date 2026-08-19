#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REQ-SNP-LIB2 · `particulas-voxel`: el motor que estaba dentro de la espada, sacado a librería.

Dueño: «*el snippet "herramienta-espada" se ha vuelto muy grande […] me gustaria saber que se puede
externalizar […] para hacerlo mas ligero y entendible*».

Medido antes de tocar nada: `herramienta-espada` eran 271 líneas, de las cuales 170 (63%) eran el
motor de sangre… y de esas 170, solo 12 eran SANGRE (los colores y el tuning). El resto es un
simulador genérico de voxeles que caen. Aquí está ese resto, una vez, para todos.

    const P = await game.snippet('particulas-voxel');
    game.sangre = P.crea({ grupo:'sangre', chorro:22, dura:30, colores:[[0.78,0.08,0.08], …] });
    game.sangre.salpica([x,y,z]);

La física (subpasos, rebote, atasco, vuelo en tiempo simulado, descanso en tiempo de reloj) y las
tres trampas que costaron una tarde en REQ-SANGRE1 quedan escritas UNA vez. Las sondas del mundo no
están aquí: se piden a `sondas-mundo`, que es la otra mitad de la misma limpieza.

Publica por POST /api/snippets (papelera + escritura atómica), nunca escribiendo el .json a mano.
"""
import json, os, sys, urllib.request, urllib.error

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = os.environ.get('VOXEL_API', 'http://localhost:8500')

ID = 'particulas-voxel'
NOMBRE = '✨ Partículas de voxel (librería)'

CODE = r"""// ── ✨ particulas-voxel · LIBRERÍA: voxeles que saltan, caen y se quedan ──────────────────────────
// No hace nada al correr. Se usa desde otro snippet:
//
//     const P = await game.snippet('particulas-voxel');
//     const chispas = P.crea({ grupo:'chispas', chorro:14, dura:2, colores:[[1,0.85,0.3]] });
//     chispas.salpica([x, y, z]);
//
// Salió de REQ-SANGRE1: la sangre de la espada eran 170 líneas, de las que solo 12 hablaban de
// sangre. Esto es las otras 158. Un efecto nuevo son ~8 líneas de configuración.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────
// DÓNDE SE DIBUJA
// En `game.voxelesUI`, la capa de ADORNO: cubos de color de 1/16 de bloque que **no son mundo** — no
// colisionan, no se guardan, no salen en la foto del mapa y se pierden al recargar. Cada efecto pide
// su `grupo`, así que limpiar uno no toca a los demás ni a lo que haya plantado nadie a mano.
// ⚠️ `mcVoxUIGeom` remalla la capa ENTERA en cuanto algo cambia, así que:
//    · se repinta el grupo entero cada frame (llevar la cuenta voxel a voxel no ahorraría nada), y
//    · el bucle solo la ensucia los frames en los que algo se ha movido de verdad. Con todo posado
//      no cuesta nada, y en cuanto no queda ninguna partícula el rAF SE APAGA SOLO.
//
// UN SOLO BUCLE PARA TODOS LOS EFECTOS
// No es un rAF por efecto: hay uno global (`window.__vfParticulas`) que recorre los sistemas vivos.
// Diez efectos a la vez siguen siendo un requestAnimationFrame. Reejecutar este snippet cancela el
// bucle anterior, así se puede retunear desde el editor sin dejar dos simulaciones peleándose.

const M = window.__vfParticulas || (window.__vfParticulas = { sistemas: [], raf: 0, on: false });
if(M.raf) cancelAnimationFrame(M.raf);
M.on = false;

const S = await game.snippet('sondas-mundo');    // ⬅️ las sondas por FORMA viven en su propio fichero

const POR_DEFECTO = {
  grupo: 'particulas',   // su sitio en game.voxelesUI; dos efectos con el mismo grupo se pisan
  activa: true,
  chorro: 20,            // cuántas salen por cada salpica()
  dura: 8,               // segundos POSADA en el suelo, de reloj
  desvanece: 2,          // los últimos N de esos segundos, oscureciéndose
  grav: 24,              // bloques/s². Negativa = sube (humo)
  fuerza: 5.5,           // velocidad de salida
  hacia: 'mirada',       // 'mirada' (rebota hacia el jugador), 'radial' (esfera), 'arriba' (columna)
  rebote: 0.22,          // cuánto conserva al chocar
  roza: 0.45,            // cuánto conserva EN HORIZONTAL al tocar suelo
  parada: 1.1,           // por debajo de esta velocidad vertical, se posa
  disperso: 0.14,        // radio del punto de salida, en bloques
  tope: 500,             // partículas vivas como mucho
  vuelo: 8,              // segundos volando como mucho, en tiempo SIMULADO
  posarse: true,         // false = no se posa nunca; al tocar algo, desaparece (chispas, humo)
  deriva: 0,             // vaivén horizontal mientras cae, en bloques/s (la nieve, no la lluvia)
  derivaHz: 0.5,         // cada cuánto cambia de lado ese vaivén
  colores: [[1, 1, 1]],

  // ── EMISIÓN CONTINUA (ambiente: nieve, lluvia, ceniza) ──────────────────────────────────────
  // Con `porSegundo > 0` el sistema deja de ser un chorro y pasa a llover sobre el jugador: cada
  // frame siembra partículas nuevas en una caja que VIAJA CON ÉL, así que el efecto no se queda
  // atrás al andar y no hay que sembrar el mapa entero (que es lo que lo haría inviable).
  porSegundo: 0,         // 0 = no es ambiente, es un chorro (salpica)
  radio: 14,             // media anchura de esa caja, en bloques
  alto: 12,              // a qué altura sobre el jugador aparecen
  fondo: 24              // por debajo de jugador−fondo se recogen (se han ido por un barranco)
};

function crea(cfg){
  const C = Object.assign({}, POR_DEFECTO, cfg || {});
  const V = [];                                    // las partículas vivas de ESTE sistema

  function posa(g, ahora){ g.vx = g.vy = g.vz = 0; g.posada = ahora; }

  // Un paso. Devuelve si ALGO ha cambiado (o sea, si hay que repintar).
  function paso(dt, ahora){
    let cambia = false;
    for(let i = V.length - 1; i >= 0; i--){
      const g = V[i];
      if(g.posada){
        const vida = ahora - g.posada;
        if(vida >= C.dura){ V.splice(i, 1); cambia = true; continue; }
        // El desvanecido es lo único que hace trabajar a una partícula quieta, y solo al final.
        const f = (vida > C.dura - C.desvanece) ? Math.max(0.15, (C.dura - vida) / C.desvanece) : 1;
        if(f !== g.f){ g.f = f; cambia = true; }
        continue;
      }
      // ⚠️ El vuelo se cuenta en tiempo SIMULADO (sumando `dt`), no de reloj. Con `dt` acotado, en
      // una máquina a pocos fps un segundo de reloj es una fracción de segundo de caída: midiendo
      // por reloj se matan partículas que aún están en el aire (medido: 16 de 22 en swiftshader).
      // El descanso en el suelo, en cambio, SÍ es de reloj: «30 segundos» son 30 segundos.
      if((g.vuela = (g.vuela || 0) + dt) > C.vuelo){ V.splice(i, 1); cambia = true; continue; }
      // Subpasos de como mucho medio voxel fino: a 5 bloques/s un frame entero se salta el suelo.
      const v = Math.hypot(g.vx, g.vy, g.vz);
      const n = Math.max(1, Math.min(24, Math.ceil(v * dt / (S.MC_T ? 0.5 / S.MC_T : 0.03))));
      const h = dt / n;
      // El vaivén de la nieve: no es física, es un empujón lateral que va y viene. Cada copo lleva
      // su propia fase (`g.fase`) o todos irían a la vez y se vería la fila.
      if(C.deriva){
        const w = (ahora + g.fase) * C.derivaHz * Math.PI * 2;
        g.vx = Math.cos(w) * C.deriva; g.vz = Math.sin(w * 0.7) * C.deriva;
      }
      for(let k = 0; k < n; k++){
        g.vy -= C.grav * h;
        const nx = g.x + g.vx*h, ny = g.y + g.vy*h, nz = g.z + g.vz*h;
        if(S.solido(nx, ny, nz)){
          if(!C.posarse){ V.splice(i, 1); cambia = true; break; }   // chispas, humo: se apagan al tocar
          if(S.solido(g.x, ny, g.z)){                 // suelo (o techo): rebota poco y se frena
            g.vy = -g.vy * C.rebote; g.vx *= C.roza; g.vz *= C.roza;
            if(Math.abs(g.vy) < C.parada){ posa(g, ahora); break; }
          }else{                                       // pared: se escurre por ella
            if(S.solido(nx, g.y, g.z)) g.vx = -g.vx * C.rebote;
            if(S.solido(g.x, g.y, nz)) g.vz = -g.vz * C.rebote;
          }
          // Y la salida de emergencia: en un rincón puede tocar en diagonal sin que ninguna de las
          // dos ramas de arriba la pose, y entonces se queda volando para siempre.
          if((g.atasco = (g.atasco || 0) + 1) > 12){ posa(g, ahora); break; }
          continue;
        }
        g.x = nx; g.y = ny; g.z = nz; g.atasco = 0;
      }
      // Se ha ido por un barranco o el jugador se ha alejado: se recoge. Sin esto, andar bajo la
      // nieve va dejando un rastro de copos vivos a la espalda y el `tope` se come el efecto.
      if(!g.posada && typeof mc !== 'undefined' && mc.pos){
        if(g.y < mc.pos[1] - C.fondo || Math.abs(g.x - mc.pos[0]) > C.radio * 2
                                     || Math.abs(g.z - mc.pos[2]) > C.radio * 2){
          V.splice(i, 1); cambia = true; continue;
        }
      }
      cambia = true;
    }
    return cambia;
  }

  // Siembra de ambiente: `porSegundo` partículas en una caja que viaja con el jugador. Se guarda el
  // resto fraccionario (`deuda`) o con dt pequeño y pocas por segundo no saldría ninguna nunca.
  let deuda = 0;
  function siembra(dt, ahora){
    if(!C.porSegundo || typeof mc === 'undefined' || !mc.pos) return false;
    deuda += C.porSegundo * dt;
    let n = Math.floor(deuda); if(n <= 0) return false;
    deuda -= n;
    if(V.length + n > C.tope) n = Math.max(0, C.tope - V.length);
    for(let i = 0; i < n; i++){
      V.push({
        x: mc.pos[0] + (Math.random()*2 - 1) * C.radio,
        y: mc.pos[1] + C.alto * (0.7 + Math.random() * 0.3),
        z: mc.pos[2] + (Math.random()*2 - 1) * C.radio,
        vx: 0, vy: -C.fuerza * (0.6 + Math.random() * 0.8), vz: 0,
        col: C.colores[(Math.random() * C.colores.length) | 0],
        fase: Math.random() * 10, nace: ahora, posada: 0, f: 1
      });
    }
    return n > 0;
  }

  // Se repinta el grupo entero: son pocas y así no hay que llevar la cuenta de qué voxel ocupaba
  // cada partícula el frame anterior. El `tam` es de la capa global, así que el paso se lee de ella.
  function pinta(){
    const U = game.voxelesUI; if(!U) return;
    U.limpia(C.grupo);
    const p = (1 / S.MC_T) * Math.max(1, U.tam | 0);
    for(const g of V){
      const c = g.col, f = g.f === undefined ? 1 : g.f;
      U.pon(Math.floor(g.x/p), Math.floor(g.y/p), Math.floor(g.z/p), [c[0]*f, c[1]*f, c[2]*f], C.grupo);
    }
  }

  // Hacia dónde salen. 'mirada' es lo de la sangre: al revés de por donde ha entrado el filo.
  function empuje(){
    if(C.hacia === 'arriba') return [0, 1, 0];
    if(C.hacia === 'radial'){
      const t = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u*u);
      return [Math.cos(t) * r, u, Math.sin(t) * r];
    }
    const cp = Math.cos(mc.pitch || 0);
    return [Math.sin(mc.yaw || 0) * cp, 0.75, Math.cos(mc.yaw || 0) * cp];
  }

  const api = Object.assign(C, {
    // salpica(punto) — punto del mundo: [x,y,z]. Devuelve cuántas han salido.
    salpica(p, cuantas){
      if(!C.activa || !p || !game.voxelesUI) return 0;
      const ahora = performance.now() / 1000, n = cuantas || C.chorro, e = empuje();
      for(let i = 0; i < n; i++){
        const f = C.fuerza * (0.35 + Math.random() * 0.9);
        V.push({
          x: p[0] + (Math.random()-0.5) * C.disperso,
          y: p[1] + (Math.random()-0.5) * C.disperso,
          z: p[2] + (Math.random()-0.5) * C.disperso,
          vx: (e[0] + (Math.random()-0.5) * 0.9) * f * 0.9,
          vy: (e[1] * (0.3 + Math.random() * 0.9)) * f * 0.75,
          vz: (e[2] + (Math.random()-0.5) * 0.9) * f * 0.9,
          col: C.colores[(Math.random() * C.colores.length) | 0],
          fase: Math.random() * 10, nace: ahora, posada: 0, f: 1
        });
      }
      while(V.length > C.tope) V.shift();
      arranca();
      return n;
    },
    // Ambiente: empieza/para la siembra continua. `enciende(0)` = parar sin borrar lo que ya cae.
    enciende(porSegundo){
      if(porSegundo !== undefined) C.porSegundo = Math.max(0, +porSegundo || 0);
      else if(!C.porSegundo) C.porSegundo = POR_DEFECTO.porSegundo || 40;
      C.activa = true; arranca(); return C.porSegundo;
    },
    para(){ C.porSegundo = 0; return this; },
    limpia(){ V.length = 0; deuda = 0; if(game.voxelesUI) game.voxelesUI.limpia(C.grupo); return 0; },
    info(){ let posadas = 0;
      for(const g of V) if(g.posada) posadas++;
      return { grupo: C.grupo, vivas: V.length, posadas, volando: V.length - posadas,
               bucle: M.on, activa: C.activa, dura: C.dura, chorro: C.chorro,
               porSegundo: C.porSegundo }; },
    _paso: paso, _siembra: siembra, _pinta: pinta, _V: V
  });

  // Un sistema con el mismo grupo SUSTITUYE al anterior: reejecutar el snippet que lo define no
  // deja dos simulaciones pintando en la misma capa.
  const ya = M.sistemas.findIndex(s => s.grupo === C.grupo);
  if(ya >= 0) M.sistemas[ya] = api; else M.sistemas.push(api);
  return api;
}

function arranca(){
  if(M.on) return;
  M.on = true;
  let prev = performance.now();
  const tick = () => {
    if(!M.on) return;
    const t = performance.now(), dt = Math.min(0.05, (t - prev) / 1000); prev = t;
    let vivas = 0, lloviendo = 0;
    for(const s of M.sistemas){
      if(!s.activa){ vivas += s._V.length; continue; }
      const sembrado = s._siembra(dt, t / 1000);
      if(s._paso(dt, t / 1000) || sembrado) s._pinta();
      vivas += s._V.length; lloviendo += s.porSegundo ? 1 : 0;
    }
    // Ni un rAF girando en vacío… pero un ambiente encendido sin partículas (aún) sigue vivo.
    if(!vivas && !lloviendo){ M.on = false; return; }
    M.raf = requestAnimationFrame(tick);
  };
  M.raf = requestAnimationFrame(tick);
}

return { crea, arranca, sistemas: M.sistemas, porDefecto: POR_DEFECTO,
  info(){ return M.sistemas.map(s => s.info()); },
  limpia(){ for(const s of M.sistemas) s.limpia(); M.on = false;
            if(M.raf) cancelAnimationFrame(M.raf); return M.sistemas.length; } };
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
