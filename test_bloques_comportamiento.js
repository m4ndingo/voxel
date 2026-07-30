// Bloques con comportamiento: el material manda, no el voxel.
// Se carga el snippet 'mundo-autoarranque' con stubs minimos (sin navegador) y se comprueba que el
// envoltorio de mcUpdate hace lo que dice: trepar contra un material trepable, disparar alPisar UNA
// sola vez al cambiar de celda, y no tocar nada cuando el material no tiene comportamiento.
// Lo que mas importa aqui son las dos trampas que costarian caro en vivo:
//   · el envoltorio tiene que ser IDEMPOTENTE (reejecutar el snippet al afinar subida/bajada
//     apilaria envoltorios y duplicaria la velocidad en cada pasada);
//   · un alPisar que lanza NO puede escupir una linea por frame (§22) ni tumbar mcTick.
const fs = require('fs');

let ok = 0, fail = 0;
const t = (n, c, extra) => {
  if (c) { ok++; console.log('  ok  ' + n + (extra ? '   (' + extra + ')' : '')); }
  else { fail++; console.log('  FALLA  ' + n + (extra ? '   (' + extra + ')' : '')); }
};

const CODE = JSON.parse(fs.readFileSync('data/snippets/mundo-autoarranque.json', 'utf8')).code;

// ── Mundo de juguete: una pared de escalera en z=11 y una placa suelta en el suelo ──────────────
// La escalera es SOLIDA (esa fue la decision de diseno), asi que el jugador sube pegado a ella.
const DIM = { x: 24, y: 24, z: 24 };
const ID_ROCA = 1, ID_ESC = 2, ID_MUELLE = 3, ID_PLACA = 4;
const CLAVES = [null, 'asset:assets/roca.vox.json', 'hab:escalera', 'hab:muelle', 'hab:placa'];
// En el juego mcMoveAxis empuja al jugador contra la pared hasta que su AABB la toca; aquí el
// mcUpdate de juguete no mueve en horizontal, así que se le coloca ya PEGADO (centro = 11 - medio
// ancho). Sin esto el sondeo del pecho (medio ancho + holgura = 0,38) no llega a la celda z=11.
// El epsilon importa: mcMoveAxis solo confirma posiciones SIN colisión, así que el borde del cuerpo
// queda estrictamente por debajo de 11. Con z+0,3 = 11,0 exacto, floor() da 11 y el propio jugador
// «colisiona» con la escalera en la que se apoya, que es lo que bloqueaba el trepado.
const Z_PEGADO = 11 - 0.3 - 1e-4;

// ── Estructuras finas: la mitad del mundo que NO esta en mc.grid ────────────────────────────────
// Un asset solo entra en la rejilla si es un 16³ MACIZO (app.js:4006); escalera.json tiene 160
// voxels, asi que en el mundo del dueno es una ESTRUCTURA FINA. La primera version de la prueba
// solo montaba bloques de rejilla y por eso daba verde con la escalera de verdad sin funcionar.
// Geometria en voxeles FINOS (1/16 de bloque), indexada como app.js: (y*fdim[2]+z)*fdim[0]+x.
const T = 16;
function geomPanel() {                                    // 16x1x16 en el editor -> 16x16x1 en el mundo
  const fdim = [T, T, 1], bits = new Uint8Array(T * T);   // (world = (ax,az,ay): la plancha queda de pie)
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) bits[(y * fdim[2]) * fdim[0] + x] = 1;
  return { fdim, bits };
}
// La escalera DE VERDAD (data/habitantes/escalera.json): panel con dos largueros llenos (x=0,1 y
// x=14,15) y peldanos cada 4 voxeles finos. Entre peldano y peldano hay AIRE en todo el centro, que
// es justo por lo que sondear a una altura fija solo agarraba en los largueros.
function geomEscaleraReal() {
  const fdim = [T, T, 1], bits = new Uint8Array(T * T);
  for (let y = 0; y < T; y++) {
    const peldano = (y % 4 === 1 || y % 4 === 2);
    for (let x = 0; x < T; x++)
      if (peldano || x < 2 || x >= T - 2) bits[y * fdim[0] + x] = 1;
  }
  return { fdim, bits };
}
function geomLosa() {                                     // placa de presion: 1/16 de alto
  const fdim = [T, 1, T], bits = new Uint8Array(T * T);
  for (let z = 0; z < T; z++) for (let x = 0; x < T; x++) bits[z * fdim[0] + x] = 1;
  return { fdim, bits };
}
function geomMediaLosa() {                                // peldano de MEDIO bloque: 8 voxeles finos
  const fdim = [T, T / 2, T], bits = new Uint8Array(T * (T / 2) * T).fill(1);
  return { fdim, bits };
}
const GEOM = {
  'hab:escalera': geomPanel(), 'hab:escalera-real': geomEscaleraReal(),
  'hab:placa': geomLosa(), 'hab:media': geomMediaLosa()
};

function montar(opciones) {
  opciones = opciones || {};
  const grid = new Uint8Array(DIM.x * DIM.y * DIM.z);
  const idx = (x, y, z) => x + y * DIM.x + z * DIM.x * DIM.y;
  for (let x = 0; x < DIM.x; x++) for (let z = 0; z < DIM.z; z++) grid[idx(x, 4, z)] = ID_ROCA;   // suelo
  // Con opciones.fina la escalera NO va en la rejilla: va como estructura fina, como en el mundo real.
  if (!opciones.fina && !opciones.sinEscalera)
    for (let x = 0; x < DIM.x; x++) for (let y = 5; y < 20; y++) grid[idx(x, y, 11)] = ID_ESC;    // pared trepable
  // La placa vive a 2 celdas por detras de la escalera: en la rejilla de juguete es un bloque MACIZO,
  // asi que tapa el camino de quien retrocede. Las pruebas que miden el retroceso la quitan.
  if (!opciones.sinPlaca && !opciones.placaRasante) grid[idx(12, 5, 9)] = ID_PLACA;                // placa sobre el suelo
  // Placa RASANTE: sustituye un bloque del suelo, asi que se pisa andando sin tropezar con un escalon.
  // Es como se pone un trampolin de Quake, y lo que hace falta para probar que conserva la inercia.
  if (opciones.placaRasante) grid[idx(12, 4, 9)] = ID_PLACA;
  if (opciones.muelle) for (let y = 5; y < 20; y++) grid[idx(10, y, 11)] = ID_MUELLE;             // trepable mas rapido
  if (opciones.techo) for (let x = 0; x < DIM.x; x++) for (let z = 0; z < 11; z++) grid[idx(x, 9, z)] = ID_ROCA;

  // Instancias finas (ox,oy,oz en bloques, como app.js:6101). La escalera fina es una columna de
  // paneles pegados a la cara z=11, o sea el mismo sitio que ocupaba la pared de rejilla.
  const structures = [];
  const claveFina = opciones.real ? 'hab:escalera-real' : 'hab:escalera';
  if (opciones.fina && !opciones.sinEscalera) for (let oy = 5; oy < 20; oy++) structures.push({ key: claveFina, ox: 12, oy, oz: 11, rot: 0 });
  // La placa fina se apoya en el suelo (bloque y=4, o sea techo en y=5) y ocupa solo 1/16 de alto.
  if (opciones.placaFina) { grid[idx(12, 5, 9)] = 0; structures.push({ key: 'hab:placa', ox: 12, oy: 5, oz: 9, rot: 0 }); }
  // Escalera de PELDANOS de medio bloque (8 voxeles finos), como la que enseño el dueno: cada
  // peldano cabe de sobra en MC_STEP, asi que app.js lo sube solo y de golpe. Cimas: 5.5, 6.0, 6.5.
  // El ultimo peldano sigue como meseta hasta el borde del mundo: si acabara en z=7 el jugador se
  // caeria por el otro lado a mitad de prueba y la medida seria de la caida, no de la subida.
  if (opciones.escalones) for (let x = 0; x < DIM.x; x++) {
    structures.push({ key: 'hab:media', ox: x, oy: 5, oz: 9, rot: 0 });
    grid[idx(x, 5, 8)] = ID_ROCA;
    for (let z = 7; z >= 0; z--) {
      grid[idx(x, 5, z)] = ID_ROCA;
      structures.push({ key: 'hab:media', ox: x, oy: 6, oz: z, rot: 0 });
    }
  }

  const mc = {
    dim: DIM, grid, blockKey: CLAVES.slice(), catalog: [], structures, notes: {}, agents: new Map(),
    pos: [12.5, 5, Z_PEGADO], vel: [0, 0, 0], yaw: 0, scale: 1, keys: {}, onGround: true, active: true
  };
  global.mc = mc;
  global.window = global;
  global.MC_TILE = T;
  global.MC_STEP = 0.6;                                   // app.js:4912
  global.mcIdx = (x, y, z) => idx(x, y, z);
  global.mcInside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < DIM.x && y < DIM.y && z < DIM.z;
  global.mcStructColl = (s) => GEOM[s.key] || null;
  // Calco de mcFineBoxHit (app.js:4935): ¿alguna estructura ocupa la caja fina dada?
  const finaEnCaja = (fx0, fy0, fz0, fx1, fy1, fz1) => {
    for (const s of structures) {
      const g = GEOM[s.key]; if (!g) continue;
      const d = g.fdim;
      const x0 = Math.max(fx0 - s.ox * T, 0), x1 = Math.min(fx1 - s.ox * T, d[0] - 1); if (x0 > x1) continue;
      const y0 = Math.max(fy0 - s.oy * T, 0), y1 = Math.min(fy1 - s.oy * T, d[1] - 1); if (y0 > y1) continue;
      const z0 = Math.max(fz0 - s.oz * T, 0), z1 = Math.min(fz1 - s.oz * T, d[2] - 1); if (z0 > z1) continue;
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) if (g.bits[(y * d[2] + z) * d[0] + x]) return true;
    }
    return false;
  };
  // Colision de juguete: el AABB del jugador (0.6x0.6x1.8) contra celdas no vacias. Es la misma
  // forma que mcCollides (app.js:4965) recortada a lo que necesita la prueba.
  global.mcCollides = (px, py, pz) => {
    const HW = 0.3 * mc.scale, PH = 1.8 * mc.scale;
    for (let x = Math.floor(px - HW); x <= Math.floor(px + HW); x++)
      for (let y = Math.floor(py); y <= Math.floor(py + PH - 1e-4); y++)
        for (let z = Math.floor(pz - HW); z <= Math.floor(pz + HW); z++)
          if (global.mcInside(x, y, z) && grid[idx(x, y, z)]) return true;
    // Y a resolucion FINA contra las estructuras, igual que mcCollides (app.js:4965).
    if (structures.length &&
        finaEnCaja(Math.floor((px - HW) * T), Math.floor(py * T), Math.floor((pz - HW) * T),
                   Math.floor((px + HW) * T), Math.floor((py + PH - 1e-4) * T), Math.floor((pz + HW) * T))) return true;
    return false;
  };
  // mcUpdate original de juguete: gravedad + resolución vertical, calcando app.js:5093-5098. Sin la
  // resolución el jugador atraviesa el suelo y no llega a tocar nada (así falló la primera versión).
  // Cuenta sus llamadas para detectar envoltorios apilados.
  let llamadas = 0;
  const VEL = 4.3;                                          // marcha, del orden de app.js:5059
  // Escalon automatico, calco de mcMoveAxis (app.js:4915): si el eje esta bloqueado se prueba a
  // levantar al jugador hasta MC_STEP y, si arriba cabe, sube DE GOLPE dentro del mismo frame. Ese
  // tiron es justo lo que se quiere suavizar. Solo con opciones.escalones, para no cambiar de
  // comportamiento las pruebas que ya existian.
  const subirEscalon = (nx, nz, eje) => {
    if (!opciones.escalones) return;
    const stepH = MC_STEP * mc.scale, inc = Math.max(1 / T, stepH / 12);
    for (let h = inc; h <= stepH + 1e-6; h += inc) {
      if (global.mcCollides(nx, mc.pos[1] + h, nz)) continue;
      mc.pos[eje] = eje === 0 ? nx : nz;
      mc.pos[1] += h;
      if (mc.vel[1] < 0) mc.vel[1] = 0;
      mc.onGround = true;
      return;
    }
  };
  global.mcUpdate = function (dt) {
    llamadas++;
    // Con opciones.andar tambien se mueve en horizontal (eje a eje, como mcMoveAxis): hace falta
    // para ver si el jugador se despega de la escalera al retroceder.
    if (opciones.andar) {
      const fx = -Math.sin(mc.yaw), fz = -Math.cos(mc.yaw);
      const s = (mc.keys['w'] ? 1 : 0) - (mc.keys['s'] ? 1 : 0);
      // Mismo reparto que app.js:5069-5088 (air-control estilo Quake): en el SUELO la velocidad horizontal
      // se reescribe desde las teclas; en el AIRE se conserva INTACTA (inercia del salto). Sin esto, una
      // prueba de trampolín daría verde sin probar nada: el jugador se movería por teclas también volando.
      if (mc.onGround) { mc.vel[0] = fx * s * VEL; mc.vel[2] = fz * s * VEL; }
      const nx = mc.pos[0] + mc.vel[0] * dt, nz = mc.pos[2] + mc.vel[2] * dt;
      if (!global.mcCollides(nx, mc.pos[1], mc.pos[2])) mc.pos[0] = nx; else subirEscalon(nx, mc.pos[2], 0);
      if (!global.mcCollides(mc.pos[0], mc.pos[1], nz)) mc.pos[2] = nz; else subirEscalon(mc.pos[0], nz, 2);
    }
    mc.vel[1] -= 22 * dt;
    const ny = mc.pos[1] + mc.vel[1] * dt;
    if (!global.mcCollides(mc.pos[0], ny, mc.pos[2])) { mc.pos[1] = ny; mc.onGround = false; }
    else { if (mc.vel[1] < 0) mc.onGround = true; mc.vel[1] = 0; }
  };
  const original = global.mcUpdate;

  const game = { tp: () => {}, toastHistory: [] };
  global.game = game;

  const avisosConsola = [];
  const realLog = console.log, realWarn = console.warn;
  console.log = () => {};                                   // el snippet se presenta al cargarse (§22)
  console.warn = (...a) => avisosConsola.push(a.join(' '));
  ejecutar();
  function ejecutar() { (new Function(CODE))(); }
  console.log = realLog; console.warn = realWarn;

  return {
    mc, game, avisosConsola, original,
    llamadas: () => llamadas,
    // Reejecuta el snippet tal cual (lo que hace el dueno al afinar subida/bajada).
    recargar: () => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = (...a) => avisosConsola.push(a.join(' ')); ejecutar(); console.log = l; console.warn = w; },
    // Silencia warn Y log: define() informa por log cuando resuelve un nombre corto ("roca" → asset:…),
    // y esa línea es útil en la consola del navegador pero ruido en la salida del test.
    sinRuido: (fn) => {
      const w = console.warn, l = console.log;
      console.warn = (...a) => avisosConsola.push(a.join(' '));
      console.log = (...a) => avisosConsola.push(a.join(' '));
      try { return fn(); } finally { console.warn = w; console.log = l; }
    },
    frames: (n, dt) => { for (let i = 0; i < n; i++) global.mcUpdate(dt || 1 / 60); }
  };
}

// ── 1. Trepar ───────────────────────────────────────────────────────────────────────────────────
console.log('\nAvanzar contra la escalera sube; retroceder baja');
{
  const w = montar();
  // yaw=0 ⇒ el frente es -Z... pero la pared esta en z=11 y el jugador en z=10.5, o sea a +Z.
  // Se mira hacia +Z poniendo yaw=PI (fwd = [-sin, -cos] = [0, +1]).
  w.mc.yaw = Math.PI;
  const y0 = w.mc.pos[1];
  w.mc.keys['w'] = true;
  w.frames(60);                                   // 1 segundo avanzando contra ella
  const subio = w.mc.pos[1] - y0;
  t('subir ≈ subida(4 u/s) durante 1 s', Math.abs(subio - 4) < 0.35, 'subió ' + subio.toFixed(2));

  w.mc.keys['w'] = false; w.mc.keys['s'] = true;
  const y1 = w.mc.pos[1];
  w.frames(30);                                   // medio segundo retrocediendo
  const bajo = y1 - w.mc.pos[1];
  // Tolerancia CERRADA a proposito: en caida libre 0,5 s son 2,75 y con ±0,35 la prueba daba por
  // buena una bajada que en realidad era despenarse (asi paso desapercibido que el sondeo con S
  // miraba la celda de detras, o sea aire).
  t('bajar ≈ bajada(5 u/s) durante 0,5 s', Math.abs(bajo - 2.5) < 0.05, 'bajó ' + bajo.toFixed(2));
  t('bajar es agarrarse, no caerse', Math.abs(bajo - 2.75) > 0.15, 'la caída libre daría 2.75');
}

console.log('\nBajar no despega al jugador de la escalera');
{
  // Con S el jugador ANDA hacia atras: sin sujecion se separa de la pared en tres frames y el
  // sondeo deja de encontrarla. El envoltorio anula esa componente mientras esta agarrado.
  const w = montar({ andar: true });
  w.mc.yaw = Math.PI;
  w.mc.keys['w'] = true; w.frames(60);                    // sube primero
  const y1 = w.mc.pos[1], z1 = w.mc.pos[2];
  w.mc.keys['w'] = false; w.mc.keys['s'] = true;
  w.frames(30);
  t('sigue bajando a su velocidad pese a andar hacia atrás', Math.abs((y1 - w.mc.pos[1]) - 2.5) < 0.05,
    'bajó ' + (y1 - w.mc.pos[1]).toFixed(2));
  t('no se despega de la escalera', Math.abs(w.mc.pos[2] - z1) < 0.01,
    'z ' + z1.toFixed(2) + ' -> ' + w.mc.pos[2].toFixed(2));
}

console.log('\nAl pie de la escalera se aterriza, no se queda flotando');
{
  const w = montar({ andar: true });
  w.mc.yaw = Math.PI;
  w.mc.keys['s'] = true;
  w.frames(120);                                          // 2 s bajando: la escalera empieza en y=5
  t('acaba apoyado en el suelo', w.mc.onGround === true && Math.abs(w.mc.pos[1] - 5) < 0.02,
    'y=' + w.mc.pos[1].toFixed(2) + ' onGround=' + w.mc.onGround);
}

console.log('\nLa escalera REAL es una estructura fina, no un bloque de rejilla');
{
  // Este es el caso del mundo del dueno: rayos-X decia «estructura · guardada · hab:escalera» y
  // el trepado no hacia nada porque el sondeo solo miraba mc.grid (ahi solo hay aire).
  const w = montar({ fina: true, andar: true });
  w.mc.yaw = Math.PI;
  t('la rejilla NO sabe nada de la escalera', w.mc.grid[12 + 6 * DIM.x + 11 * DIM.x * DIM.y] === 0);
  const filas = w.sinRuido(() => w.game.bloques.info());
  const delante = filas.find(f => f.donde.startsWith('delante'));
  t('info() la ve igualmente y la llama por su clave', delante.clave === 'hab:escalera' && delante.tipo === 'estructura',
    delante.clave + ' (' + delante.tipo + ')');
  const y0 = w.mc.pos[1];
  w.mc.keys['w'] = true; w.frames(60);
  t('y se sube por ella a su velocidad', Math.abs((w.mc.pos[1] - y0) - 4) < 0.05, 'subió ' + (w.mc.pos[1] - y0).toFixed(2));
  t('el panel de 1/16 no deja atravesarlo', w.mc.pos[2] < 11, 'z=' + w.mc.pos[2].toFixed(3));
  // Coronar: la escalera acaba en y=20. Sondeando solo al pecho, el agarre se pierde con los pies en
  // 19,1 — 0,9 por debajo del remate, más de lo que sube el auto-escalón (0,6) ⇒ no se puede salir
  // arriba. Con el sondeo también a los pies se llega al ras del rellano.
  // Se mide la cota MÁXIMA, no la final: el panel no tiene rellano donde quedarse, así que al coronar
  // el jugador sigue andando y cae al otro lado. Lo que se comprueba es hasta dónde llega el agarre.
  let cima = w.mc.pos[1];
  for (let i = 0; i < 300; i++) { w.frames(1); if (w.mc.pos[1] > cima) cima = w.mc.pos[1]; }
  t('se trepa hasta el remate, no 0,9 por debajo', cima > 19.5, 'llegó a y=' + cima.toFixed(2) + ' (escalera hasta 20)');
}

console.log('\nSe trepa por los PELDAÑOS, no solo por los largueros');
{
  // El fallo que reportó el dueño: «al andar hacia el bloque escalera no puede subir por los
  // escalones, solamente por los laterales». Sondeando a una altura fija, en el centro del panel el
  // pecho cae en el hueco entre peldaños la mitad de las veces ⇒ el agarre parpadea y el jugador se
  // traba. El jugador va centrado en x=12,5 (a 8 voxeles finos del borde: pleno hueco).
  const w = montar({ fina: true, real: true, andar: true });
  w.sinRuido(() => w.game.bloques.define('hab:escalera-real', { trepable: true, subida: 4, bajada: 5 }));
  w.mc.yaw = Math.PI;
  const y0 = w.mc.pos[1];
  let bajadas = 0, prev = y0;
  w.mc.keys['w'] = true;
  for (let i = 0; i < 60; i++) { w.frames(1); if (w.mc.pos[1] < prev - 1e-9) bajadas++; prev = w.mc.pos[1]; }
  t('sube igual estando frente a un hueco entre peldaños', Math.abs((w.mc.pos[1] - y0) - 4) < 0.05,
    'subió ' + (w.mc.pos[1] - y0).toFixed(2));
  t('la subida es continua: no se traba ni recae', bajadas === 0, bajadas + ' frame(s) hacia abajo');
}

console.log('\nCon S siempre se puede soltar la escalera');
{
  // «cuando das a s (hacia atrás) a veces no se libera, se queda pegado»: al anular el retroceso
  // también con los pies en el suelo, el jugador no podía alejarse nunca de la escalera.
  const w = montar({ fina: true, real: true, andar: true, sinPlaca: true });   // sin la placa, que haría de muro
  w.sinRuido(() => w.game.bloques.define('hab:escalera-real', { trepable: true, subida: 4, bajada: 5 }));
  w.mc.yaw = Math.PI;
  w.frames(30);                                            // aterriza al pie de la escalera
  const z0 = w.mc.pos[2];
  w.mc.keys['s'] = true; w.frames(30);
  t('en el suelo, S aleja al jugador de la escalera', z0 - w.mc.pos[2] > 1,
    'retrocedió ' + (z0 - w.mc.pos[2]).toFixed(2));
  t('y aterriza de verdad, sin quedarse colgado', w.mc.onGround === true);
}

console.log('\nAl soltar la tecla uno se queda COLGADO, no se cae');
{
  // «si dejo de pulsar se cae al suelo»: subir exigía una sola tirada sin pausas, y cualquier pausa
  // era una caída desde lo alto.
  const w = montar({ fina: true, real: true, andar: true });
  w.sinRuido(() => w.game.bloques.define('hab:escalera-real', { trepable: true, subida: 4, bajada: 5 }));
  w.mc.yaw = Math.PI;
  w.mc.keys['w'] = true; w.frames(60);                     // un segundo trepando
  const yArriba = w.mc.pos[1];
  t('ha subido antes de soltar', yArriba > 8, 'y=' + yArriba.toFixed(2));
  w.mc.keys['w'] = false; w.frames(120);                   // dos segundos sin tocar nada
  t('sigue colgado a la misma altura', Math.abs(w.mc.pos[1] - yArriba) < 0.05,
    'y=' + w.mc.pos[1].toFixed(2) + ' (soltó en ' + yArriba.toFixed(2) + ')');
  t('y no ha caído al suelo', w.mc.pos[1] > 8, 'y=' + w.mc.pos[1].toFixed(2));
  // Y desde colgado y quieto se sigue pudiendo bajar y subir.
  w.mc.keys['s'] = true; w.frames(30);
  t('desde colgado, S vuelve a bajar', w.mc.pos[1] < yArriba - 2, 'y=' + w.mc.pos[1].toFixed(2));
}

console.log('\nColgado NO engancha a quien está de pie en el suelo');
{
  // El agarre sin tecla solo sostiene a quien YA venía agarrado: si no, plantarse al lado de una
  // escalera dejaría al jugador flotando y sin poder saltar.
  const w = montar({ fina: true, real: true, andar: true, sinPlaca: true });
  w.sinRuido(() => w.game.bloques.define('hab:escalera-real', { trepable: true, subida: 4, bajada: 5 }));
  w.mc.yaw = Math.PI;
  w.frames(60);                                            // quieto al pie de la escalera, sin tocar nada
  t('de pie junto a la escalera sigue en el suelo', w.mc.onGround === true && Math.abs(w.mc.pos[1] - 5) < 0.02,
    'y=' + w.mc.pos[1].toFixed(2) + ' onGround=' + w.mc.onGround);
  // Y tras trepar un poco y volver abajo con S, se aterriza en vez de quedar flotando a un pelo.
  w.mc.keys['w'] = true; w.frames(10); w.mc.keys['w'] = false;
  w.mc.keys['s'] = true; w.frames(60); w.mc.keys['s'] = false; w.frames(30);
  t('tras bajar del todo se queda apoyado, no flotando', w.mc.onGround === true,
    'y=' + w.mc.pos[1].toFixed(2) + ' onGround=' + w.mc.onGround);
}

console.log('\nCon espacio se salta desde la escalera');
{
  // Colgado, mc.onGround queda en false, así que el salto de app.js (exige onGround) no dispararía
  // nunca: sin salida de emergencia, de una escalera solo se sale soltando la tecla.
  const w = montar({ fina: true, real: true, andar: true });
  w.sinRuido(() => w.game.bloques.define('hab:escalera-real', { trepable: true, subida: 4, bajada: 5 }));
  w.mc.yaw = Math.PI;
  w.mc.keys['w'] = true; w.frames(30);
  w.mc.keys[' '] = true; w.frames(1);
  t('el espacio suelta el agarre y da impulso', w.mc.vel[1] > 0, 'vel[1]=' + w.mc.vel[1].toFixed(2));
  const v1 = w.mc.vel[1]; w.frames(1);
  t('mantenerlo pulsado NO reimpulsa (no se vuela)', w.mc.vel[1] < v1, 'vel[1]=' + w.mc.vel[1].toFixed(2));
}

console.log('\nalPisar también funciona sobre una placa fina');
{
  const w = montar({ placaFina: true });
  const pisadas = [];
  w.sinRuido(() => w.game.bloques.define('hab:placa', { alPisar: (c) => pisadas.push(c.clave + '@' + c.x + ',' + c.y + ',' + c.z) }));
  w.mc.pos[0] = 12.5; w.mc.pos[2] = 9.5; w.mc.pos[1] = 6;      // cae sobre la placa
  w.frames(60);
  t('se apoya encima de la placa (1/16 de alto)', Math.abs(w.mc.pos[1] - (5 + 1 / 16)) < 0.02, 'y=' + w.mc.pos[1].toFixed(3));
  t('la placa fina dispara alPisar una vez', pisadas.length === 1, pisadas.join(' | ') || 'ninguna');
}

console.log('\nCada material lleva sus propias velocidades');
{
  const w = montar({ muelle: true });
  w.sinRuido(() => w.game.bloques.define('hab:muelle', { trepable: true, subida: 9, bajada: 2 }));
  w.mc.yaw = Math.PI;
  w.mc.pos = [12.5, 5, Z_PEGADO];  const yEsc = w.mc.pos[1];
  w.mc.keys['w'] = true; w.frames(60);
  const conEscalera = w.mc.pos[1] - yEsc;
  w.mc.pos = [10.5, 5, Z_PEGADO]; w.mc.vel = [0, 0, 0];  const yMue = w.mc.pos[1];
  w.frames(60);
  const conMuelle = w.mc.pos[1] - yMue;
  t('el muelle (9 u/s) sube más que la escalera (4 u/s)', conMuelle > conEscalera * 1.8,
    'escalera ' + conEscalera.toFixed(2) + ' vs muelle ' + conMuelle.toFixed(2));
}

console.log('\nNo se trepa dentro de un techo');
{
  // Techo macizo en y=9 (el hueco útil es y=5..9). Trepando 4 u/s durante 2 s la escalera daría de
  // sobra para atravesarlo: tiene que frenar sola, sin ayuda de nadie.
  const w = montar({ techo: true });
  w.mc.yaw = Math.PI;
  const y0 = w.mc.pos[1];
  w.mc.keys['w'] = true;
  w.frames(120);
  const techoAbajo = 9;                            // la cabeza (pies + 1,8) no puede pasar de aquí
  t('sube de verdad, pero se para bajo el techo',
    w.mc.pos[1] > y0 && w.mc.pos[1] + 1.8 <= techoAbajo + 1e-6,
    'subió de ' + y0 + ' a ' + w.mc.pos[1].toFixed(2) + ' (cabeza en ' + (w.mc.pos[1] + 1.8).toFixed(2) + ')');
  t('queda agarrado: la gravedad no se acumula', w.mc.vel[1] === 0, 'vel[1]=' + w.mc.vel[1]);
}

console.log('\nUn material sin comportamiento deja la física intacta');
{
  const w = montar();
  w.mc.yaw = 0;                                   // mirando a -Z: enfrente hay aire, no la escalera
  w.mc.pos = [12.5, 8, 15.5]; w.mc.vel = [0, 0, 0];
  w.mc.keys['w'] = true;
  w.frames(60);
  t('cae y aterriza en el suelo como sin el snippet', w.mc.pos[1] >= 5 && w.mc.pos[1] < 6,
    'y=' + w.mc.pos[1].toFixed(2));
  t('aterriza de verdad (onGround), sin quedarse agarrado a nada', w.mc.onGround === true);
}

// ── 2. Pisar ────────────────────────────────────────────────────────────────────────────────────
console.log('\nalPisar se dispara al CAMBIAR de celda, no cada frame');
{
  const w = montar();
  const pisos = [];
  w.sinRuido(() => w.game.bloques.define('hab:placa', { alPisar: c => pisos.push(c) }));
  w.mc.pos = [12.5, 8, 9.5]; w.mc.vel = [0, 0, 0];   // cae DESDE ARRIBA: pisar se dispara en el flanco    // justo encima de la placa (12,5,9)
  w.frames(60);                                        // cae y se queda quieto encima de la placa
  t('se dispara una sola vez al llegar', pisos.length === 1, pisos.length + ' disparo(s)');
  t('el contexto trae la celda y la clave exacta',
    pisos.length === 1 && pisos[0].clave === 'hab:placa' && pisos[0].x === 12 && pisos[0].y === 5 && pisos[0].z === 9,
    pisos.length ? pisos[0].clave + ' @ ' + pisos[0].x + ',' + pisos[0].y + ',' + pisos[0].z : '—');
  w.frames(120);                                       // sigue quieto encima otros 2 segundos
  t('quedarse quieto encima NO lo vuelve a disparar', pisos.length === 1, pisos.length + ' disparo(s)');
}

// Se pisa el trampolín ANDANDO, no dejándose caer encima. La placa rasante forma parte del suelo, así
// que el jugador entra en su celda a ras de y=5 y la cima medida es SOLO lo que empuja la placa. Medirlo
// soltándolo desde y=7 daba un falso rojo: la cima arrancaba en 7 y con impulso 8 (que sube 1,45) el
// jugador nunca pasaba de la altura desde la que se le había soltado. El mundo de juguete no encaja al
// suelo al aterrizar, así que andar por el llano es la única forma de despegar desde una y exacta.
function salto(cfg, esc) {
  const w = montar({ andar: true, placaRasante: true, sinEscalera: true });   // a escala 4 el cuerpo
  w.sinRuido(() => w.game.bloques.define('hab:placa', cfg));                  // no cabe junto a la pared
  w.mc.scale = esc || 1;
  w.mc.pos = [12.5, 5, 10.5]; w.mc.vel = [0, 0, 0];        // de pie en el llano, celda y media antes
  w.mc.yaw = 0;                                            // fwd = -z: anda hacia la placa (celda z=9)
  w.mc.keys['w'] = true;
  let cima = 5;                                            // la cara de la placa, no la altura de salida
  for (let i = 0; i < 120; i++) { w.frames(1); if (w.mc.pos[1] > cima) cima = w.mc.pos[1]; }
  return { alto: cima - 5, w };                            // altura ganada sobre la cara de la placa
}

console.log('\nTrampolín (impulso): pisarlo lanza al jugador como el salto, con la fuerza que se le diga');
{
  // Es el salto de app.js (velocidad vertical + onGround=false) pero sin pulsar espacio y con fuerza a
  // medida. La placa es RASANTE (parte del suelo, techo en y=5), como un trampolín de Quake.
  const a = salto({ impulso: 8 }).alto, b = salto({ impulso: 16 }).alto;
  // h = v²/2g con g=22 ⇒ 8 u/s ≈ 1,45 bloques; 16 u/s ≈ 5,8.
  t('con impulso 8 sube ~1,45 bloques', Math.abs(a - 64 / 44) < 0.15, 'subió ' + a.toFixed(2));
  t('con impulso 16 sube ~5,8: la fuerza es ajustable', Math.abs(b - 256 / 44) < 0.25, 'subió ' + b.toFixed(2));
  t('el doble de impulso da el CUÁDRUPLE de altura (h = v²/2g), no el doble',
    b > 3.5 * a, 'subidas: ' + a.toFixed(2) + ' vs ' + b.toFixed(2));
}

console.log('\nEl trampolín conserva la inercia horizontal (tiro parabólico, no salto vertical)');
{
  const w = montar({ andar: true, placaRasante: true });
  w.sinRuido(() => w.game.bloques.define('hab:placa', { impulso: 14 }));
  w.mc.yaw = 0;                                            // fwd = -z: anda desde z=10,7 hacia la placa en z=9
  w.mc.keys['w'] = true;
  w.frames(6);                                             // coge carrerilla por el suelo
  const vz = w.mc.vel[2];
  let despegado = false, zDespegue = 0;
  for (let i = 0; i < 40 && !despegado; i++) {
    w.frames(1);
    if (!w.mc.onGround && w.mc.vel[1] > 0) { despegado = true; zDespegue = w.mc.pos[2]; }
  }
  t('llevaba velocidad horizontal al pisar la placa', Math.abs(vz) > 1, 'vel[2]=' + vz.toFixed(2));
  t('la placa lo lanza hacia arriba al pasar por encima', despegado === true);
  // Lo que pidió el dueño: en el aire, SIN tocar teclas, se sigue avanzando por inercia.
  w.mc.keys['w'] = false;
  const zSuelta = w.mc.pos[2], vzAire = w.mc.vel[2];
  w.frames(15);
  t('sin tocar teclas en el aire sigue avanzando: es inercia, no teclado',
    Math.abs(w.mc.pos[2] - zSuelta) > 0.5, 'avanzó ' + Math.abs(w.mc.pos[2] - zSuelta).toFixed(2) + ' en z');
  t('y la velocidad horizontal es la que llevaba al despegar, intacta',
    Math.abs(vzAire - vz) < 1e-9, 'al pisar ' + vz.toFixed(3) + ' → en el aire ' + vzAire.toFixed(3));
}

console.log('\nEl trampolín rebota al volver a caer y escala con el tamaño');
{
  const w = montar({ andar: true, placaRasante: true });
  w.sinRuido(() => w.game.bloques.define('hab:placa', { impulso: 10 }));
  w.mc.pos[2] = 9.5; w.mc.pos[1] = 7;
  let despegues = 0, subiendoPrev = false;
  for (let i = 0; i < 400; i++) {
    w.frames(1);
    const subiendo = w.mc.vel[1] > 5;
    if (subiendo && !subiendoPrev) despegues++;
    subiendoPrev = subiendo;
  }
  t('al volver a caer sobre la placa te vuelve a lanzar', despegues >= 2, despegues + ' despegue(s)');

  const c1 = salto({ impulso: 8 }, 1).alto, c4 = salto({ impulso: 8 }, 4).alto;
  t('la altura escala con el tamaño (∝√escala ⇒ x4 de escala = x4 de altura)',
    Math.abs(c4 / c1 - 4) < 0.4, 'escala 1 sube ' + c1.toFixed(2) + ', escala 4 sube ' + c4.toFixed(2));
}

console.log('\nEl trampolín se puede pedir en bloques de altura, y convive con alPisar');
{
  const cuatro = salto({ altura: 4 }).alto;
  t('altura:4 sube ~4 bloques (azúcar para pensar en bloques, no en u/s)',
    Math.abs(cuatro - 4) < 0.2, 'subió ' + cuatro.toFixed(2));

  let veces = 0;
  const r = salto({ impulso: 9, alPisar() { veces++; } });
  t('impulso y alPisar conviven en el mismo material', veces >= 1 && r.alto > 1,
    veces + ' alPisar, subió ' + r.alto.toFixed(2));

  const w3 = montar({ andar: true, placaRasante: true });
  let reg = null;
  w3.sinRuido(() => { reg = w3.game.bloques.define('hab:placa', { impulso: 9 }); });
  t('define solo con impulso es válido (no dice «no hace nada»)', reg !== null);
  t('y lista() lo resume con la altura que alcanza', /impulso/.test(w3.game.bloques._resumen
    ? w3.game.bloques._resumen(reg) : 'impulso'), 'cfg.impulso=' + (reg && reg.impulso));
}

console.log('\nUn alPisar roto no rompe el frame ni inunda la consola');
{
  const w = montar();
  w.sinRuido(() => w.game.bloques.define('hab:placa', { alPisar: () => { throw new Error('boom'); } }));
  w.mc.pos = [12.5, 8, 9.5]; w.mc.vel = [0, 0, 0];   // cae DESDE ARRIBA: pisar se dispara en el flanco
  const antes = w.avisosConsola.length;
  w.sinRuido(() => w.frames(180));                     // 3 segundos: 180 oportunidades de gritar
  const nuevos = w.avisosConsola.slice(antes).filter(m => m.indexOf('boom') >= 0);
  t('el bucle sigue vivo pese a la excepción', w.llamadas() === 180, w.llamadas() + ' llamadas');
  t('avisa UNA vez, no una por frame', nuevos.length === 1, nuevos.length + ' aviso(s)');
  t('el aviso queda guardado en game.bloques.avisos()',
    w.game.bloques.avisos().some(a => a.indexOf('boom') >= 0), w.game.bloques.avisos().join(' | '));
}

// ── 3. La maquinaria ────────────────────────────────────────────────────────────────────────────
console.log('\nReejecutar el snippet no apila envoltorios');
{
  const w = montar();
  w.mc.yaw = Math.PI;
  const y0 = w.mc.pos[1];
  w.mc.keys['w'] = true; w.frames(60);
  const unaVez = w.mc.pos[1] - y0;

  w.recargar(); w.recargar();                          // el dueño afinando subida/bajada
  w.mc.pos = [12.5, 5, Z_PEGADO]; w.mc.vel = [0, 0, 0];
  const y1 = w.mc.pos[1];
  w.frames(60);
  const tresVeces = w.mc.pos[1] - y1;
  t('tras 3 ejecuciones la subida es la misma, no el triple',
    Math.abs(tresVeces - unaVez) < 0.2, unaVez.toFixed(2) + ' -> ' + tresVeces.toFixed(2));
  t('el mcUpdate original se llama una sola vez por frame', w.llamadas() === 120, w.llamadas() + ' llamadas en 120 frames');
}

console.log('\nReejecutar el snippet REINSTALA la física, no solo la API');
{
  // El fallo que reportó el dueño: definía un trampolín, lista()/info() lo enseñaban tal cual
  // («impulso ↑12 (~3.3 bloques)») y el bloque no lanzaba nada. La guarda de idempotencia dejaba
  // puesto el envoltorio VIEJO, que sigue leyendo SU tabla por closure; la ejecución nueva creaba una
  // tabla que no miraba nadie. Se detecta definiendo DESPUÉS de recargar: si la física no se
  // reinstala, lo definido a partir de ahí no existe para el mundo.
  const w = montar({ andar: true, placaRasante: true, sinEscalera: true });
  w.recargar();                                            // Alt+C otra vez, con el snippet editado
  w.sinRuido(() => w.game.bloques.define('hab:placa', { impulso: 12 }));
  w.mc.pos = [12.5, 5, 10.5]; w.mc.vel = [0, 0, 0]; w.mc.yaw = 0; w.mc.keys['w'] = true;
  let cima = 5;
  for (let i = 0; i < 120; i++) { w.frames(1); if (w.mc.pos[1] > cima) cima = w.mc.pos[1]; }
  t('un material definido TRAS reejecutar el snippet sí lanza de verdad',
    cima - 5 > 2, 'subió ' + (cima - 5).toFixed(2));

  // Y al revés: reejecutar no debe borrar lo que el dueño ya tenía puesto.
  const w2 = montar();
  w2.sinRuido(() => w2.game.bloques.define('hab:muelle', { trepable: true, subida: 9, bajada: 2 }));
  w2.recargar();
  const heredado = w2.game.bloques._tabla['hab:muelle'];
  t('y lo definido ANTES sobrevive a la reejecución', !!heredado && heredado.subida === 9,
    heredado ? '↑' + heredado.subida : 'se perdió');
}

console.log('\nLa caché densa se reconstruye cuando crece la paleta');
{
  const w = montar();
  t('la escalera resuelve por id antes de tocar la paleta', w.game.bloques._porId()[ID_ESC] != null);
  w.mc.blockKey.push('hab:nuevo');                     // mcAddBlock apenda: la paleta crece
  w.sinRuido(() => w.game.bloques.define('hab:nuevo', { trepable: true, subida: 7 }));
  const cache = w.game.bloques._porId();
  t('el material nuevo entra en la caché con su id', cache[5] && cache[5].subida === 7,
    'id 5 -> ' + (cache[5] ? cache[5].clave : 'nada'));
  t('y la escalera sigue resolviendo', cache[ID_ESC] && cache[ID_ESC].clave === 'hab:escalera');
}

console.log('\ndefine acepta el nombre corto mientras no haya dos materiales que se llamen igual');
{
  // Lo que pidió el dueño: «podría ser "arena" en lugar de la ruta larga». El nombre corto es la clave
  // sin namespace, sin carpeta y sin extensión; lo que se REGISTRA es siempre la clave larga, que es la
  // que traen los voxels del mundo.
  const w = montar();
  const r = w.sinRuido(() => w.game.bloques.define('roca', { impulso: 5 }));
  t('"roca" registra asset:assets/roca.vox.json, sin escribir la ruta entera',
    r !== null && !!w.game.bloques._tabla['asset:assets/roca.vox.json'] && !w.game.bloques._tabla['roca'],
    r && r.clave);
  const r2 = w.sinRuido(() => w.game.bloques.define('escalera', { trepable: true, subida: 7 }));
  t('"escalera" registra hab:escalera, sin escribir el namespace',
    r2 !== null && w.game.bloques._tabla['hab:escalera'].subida === 7 && !w.game.bloques._tabla['escalera']);
  t('y el bloque del mundo lo encuentra por su id (que es lo que se consulta por frame)',
    w.game.bloques._porId()[ID_ROCA] && w.game.bloques._porId()[ID_ROCA].impulso === 5);

  // Con nombre corto se puede quitar igual que se puso.
  t('quitar("roca") también entiende el nombre corto',
    w.sinRuido(() => w.game.bloques.quitar('roca')) === true &&
    !w.game.bloques._tabla['asset:assets/roca.vox.json']);
}

console.log('\ndefine se planta si el nombre corto es ambiguo o no existe');
{
  const w = montar();
  w.mc.blockKey.push('asset:assets/escalera.vox.json');  // ahora hay DOS «escalera» en el mundo
  const antes = w.avisosConsola.length;
  const r = w.sinRuido(() => w.game.bloques.define('escalera', { trepable: true }));
  const aviso = w.avisosConsola.slice(antes).join(' | ');
  t('con dos materiales llamados «escalera» no elige por el dueño', r === null);
  t('y enseña los dos candidatos para que desempate',
    aviso.indexOf('hab:escalera') >= 0 && aviso.indexOf('asset:assets/escalera.vox.json') >= 0, aviso);

  const antes2 = w.avisosConsola.length;
  const r2 = w.sinRuido(() => w.game.bloques.define('ladrillo', { trepable: true }));
  const aviso2 = w.avisosConsola.slice(antes2).join(' | ');
  t('un material que no existe sigue sin registrarse', r2 === null && !w.game.bloques._tabla['ladrillo']);
  t('y el aviso manda usar info() para ver la clave exacta', /info\(\)/.test(aviso2), aviso2);
}

console.log('\nEl snippet trae la escalera ya definida');
{
  const w = montar();
  const cfg = w.game.bloques._tabla['hab:escalera'];
  t('hab:escalera viene configurada de fábrica', !!cfg && cfg.trepable === true && cfg.subida === 4 && cfg.bajada === 5,
    cfg ? '↑' + cfg.subida + ' ↓' + cfg.bajada : 'no está');
}

console.log('\nSubida de escalones: el cuerpo salta, el ojo lo alcanza');
{
  // Sube la escalera de peldaños de medio bloque y anota, frame a frame, la y FÍSICA (con la que se
  // colisiona) y la y PINTADA (la que ve la cámara). Con suavizado son distintas; sin él, la misma.
  const subir = (tau, dt, n) => {
    const w = montar({ andar: true, escalones: true, sinEscalera: true, sinPlaca: true });
    w.sinRuido(() => w.game.bloques.pasoSuave(tau));
    w.mc.pos = [12.5, 5, 10.5]; w.mc.vel = [0, 0, 0]; w.mc.yaw = 0; w.mc.keys['w'] = true;
    const fisica = [], pintada = [], desfase = [];
    for (let i = 0; i < n; i++) {
      w.frames(1, dt);
      pintada.push(w.mc.pos[1]);
      desfase.push(w.mc._pasoDesfase || 0);
      fisica.push(w.mc.pos[1] + (w.mc._pasoDesfase || 0));
    }
    return { fisica, pintada, desfase, w };
  };
  const tiron = (a) => a.reduce((m, y, i) => (i && y - a[i - 1] > m ? y - a[i - 1] : m), 0);
  const N = 90;
  const crudo = subir(0, 1 / 60, N);
  const suave = subir(0.06, 1 / 60, N);

  t('el cuerpo corona los tres peldaños (5 → 6,5)', Math.abs(crudo.fisica[N - 1] - 6.5) < 1e-9,
    'y=' + crudo.fisica[N - 1].toFixed(3));
  t('sin suavizar, la cámara pega tirones de medio bloque', Math.abs(tiron(crudo.pintada) - 0.5) < 1e-9,
    '+' + tiron(crudo.pintada).toFixed(3));

  // Esta es la que importa: si el suavizado tocase la física, el juego se sentiría distinto.
  const identica = crudo.fisica.every((y, i) => y === suave.fisica[i]);
  t('suavizar NO cambia la física: la misma y de verdad en los 90 frames', identica);
  t('pero la cámara ya no da el tirón', tiron(suave.pintada) < 0.2, '+' + tiron(suave.pintada).toFixed(3));
  t('el ojo nunca se queda más de un escalón por detrás', Math.max(...suave.desfase) <= 0.6 + 1e-9,
    'máx ' + Math.max(...suave.desfase).toFixed(3));
  t('y siempre por DEBAJO del cuerpo, nunca por encima', Math.min(...suave.desfase) >= 0);

  // Coronado y quieto: el ojo tiene que acabar de subir, no quedarse hundido para siempre.
  suave.w.mc.keys['w'] = false;
  suave.w.frames(15);                                     // 0,25 s
  t('parado un cuarto de segundo, el ojo alcanza al cuerpo',
    (suave.w.mc._pasoDesfase || 0) === 0 && Math.abs(suave.w.mc.pos[1] - 6.5) < 1e-9,
    'y=' + suave.w.mc.pos[1].toFixed(4));
}

console.log('\nEl suavizado no depende de los fps ni se traga un teletransporte');
{
  // Mismo desfase inicial, mismo tiempo simulado, dos frecuencias de frame: tiene que quedar lo mismo.
  const trasQuietoY = (dt, frames) => {
    const w = montar({ escalones: true, sinEscalera: true, sinPlaca: true });
    w.mc.pos = [12.5, 5, 10.5];
    w.mc._pasoDesfase = 0.5; w.mc._pasoReal = 5; w.mc.pos[1] = 4.5; w.mc._pasoY = 4.5;
    w.frames(frames, dt);
    return w.mc._pasoDesfase || 0;
  };
  const a30 = trasQuietoY(1 / 30, 6), a120 = trasQuietoY(1 / 120, 24);   // 0,2 s los dos
  t('a 30 y a 120 fps queda el mismo desfase tras 0,2 s', Math.abs(a30 - a120) < 1e-9,
    a30.toFixed(5) + ' vs ' + a120.toFixed(5));
  t('y a los 0,2 s ya casi no queda nada que subir', a30 < 0.02, a30.toFixed(4));

  // Si alguien mueve al jugador por su cuenta (game.tp, un respawn, un alPisar), el desfase pendiente
  // ya no significa nada: sumarlo lo dejaría medio bloque por encima de donde lo mandaron.
  const w = montar({ escalones: true, sinEscalera: true, sinPlaca: true });
  w.mc.pos = [12.5, 5, 10.5];
  w.mc._pasoDesfase = 0.5; w.mc._pasoReal = 5; w.mc.pos[1] = 4.5; w.mc._pasoY = 4.5;
  w.mc.pos = [12.5, 9, 10.5];                             // «game.tp» a media altura
  w.frames(1);
  t('un teletransporte tira el desfase pendiente en vez de sumarlo', (w.mc._pasoDesfase || 0) === 0);
  t('y el jugador cae desde donde lo mandaron, no medio bloque más arriba', w.mc.pos[1] < 9 && w.mc.pos[1] > 8.9,
    'y=' + w.mc.pos[1].toFixed(3));

  // Saltar también sube de golpe, pero eso el jugador lo pidió: no se suaviza.
  w.mc.pos = [12.5, 5, 10.5]; w.mc.vel = [0, 8, 0]; w.mc.onGround = false;
  w.frames(1);
  t('un salto no se suaviza (sube porque el dueño lo pidió)', (w.mc._pasoDesfase || 0) === 0);
}

console.log('\npasoSuave: se ajusta, se apaga y sobrevive a reejecutar el snippet');
{
  const w = montar({ escalones: true, sinEscalera: true, sinPlaca: true });
  t('de fábrica el escalón viene suavizado', w.game.bloques.pasoSuave() === 0.06, '' + w.game.bloques.pasoSuave());
  w.sinRuido(() => w.game.bloques.pasoSuave(0.1));
  w.recargar();                                           // Alt+C otra vez
  t('lo que ajustó el dueño sobrevive a la reejecución', w.game.bloques.pasoSuave() === 0.1, '' + w.game.bloques.pasoSuave());

  const antes = w.avisosConsola.length;
  w.sinRuido(() => w.game.bloques.pasoSuave(-3));
  t('un valor absurdo se rechaza y no deja el ojo colgado',
    w.game.bloques.pasoSuave() === 0.1 && w.avisosConsola.slice(antes).join(' ').indexOf('segundos') >= 0);

  // Apagarlo con un desfase pendiente tiene que devolver al jugador a su y de verdad, no dejarlo hundido.
  w.mc.pos = [12.5, 5, 10.5];
  w.mc._pasoDesfase = 0.5; w.mc._pasoReal = 5; w.mc.pos[1] = 4.5; w.mc._pasoY = 4.5;
  w.sinRuido(() => w.game.bloques.pasoSuave(0));
  t('apagarlo repone la y de verdad al instante', w.mc.pos[1] === 5 && (w.mc._pasoDesfase || 0) === 0,
    'y=' + w.mc.pos[1]);
}

console.log(fail ? '\n' + fail + ' fallo(s)' : '\n' + ok + ' ok, 0 fallos');
process.exit(fail ? 1 : 0);
