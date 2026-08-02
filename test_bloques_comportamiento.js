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
const VEL = 4.3;                                          // mc.speed de juguete, del orden de app.js:3835

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
  // Pista rasante: TODA la columna x=12 del suelo es placa, asi que el jugador anda sobre ella un buen
  // trecho. Con una sola celda no se distingue «me acelera mientras la piso» de «me dio un empujon».
  if (opciones.pistaRasante) for (let z = 0; z < DIM.z; z++) grid[idx(12, 4, z)] = ID_PLACA;
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
    pos: [12.5, 5, Z_PEGADO], vel: [0, 0, 0], yaw: 0, scale: 1, keys: {}, onGround: true, active: true,
    speed: VEL
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
  // Calco de mcMoveAxis (app.js:4915), auto-escalon incluido: si el eje choca se prueba a levantar al
  // jugador hasta MC_STEP y colarlo por arriba, DE GOLPE y dentro del mismo frame. Es una funcion
  // global de verdad porque el snippet la envuelve para medir el escalon donde se da.
  global.mcMoveAxis = (ai, target) => {
    const p = mc.pos, tp = [p[0], p[1], p[2]]; tp[ai] = target;
    if (!global.mcCollides(tp[0], tp[1], tp[2])) { p[ai] = target; return; }
    const stepH = MC_STEP * mc.scale, inc = Math.max(1 / T, stepH / 12);
    for (let h = inc; h <= stepH + 1e-6; h += inc) {
      if (global.mcCollides(tp[0], p[1] + h, tp[2])) continue;
      p[ai] = target; p[1] += h;
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
      // La marcha sale de mc.speed y del ∝√escala, como app.js:5060 — no de una constante: los
      // bloques con 'velocidad' actuan multiplicando justo esa propiedad durante el frame.
      const sp = mc.speed * (mc.keys['shift'] ? 0.5 : 1) * Math.sqrt(mc.scale);
      if (mc.onGround) { mc.vel[0] = fx * s * sp; mc.vel[2] = fz * s * sp; }
    }
    // ORDEN EXACTO de app.js:5089-5098, y no es un detalle: la gravedad va ANTES del horizontal, asi
    // que el frame en que se sube un escalon acaba con vel[1]=0, ny === pos[1], sin colision y por
    // tanto con onGround FALSE. Este juguete lo tenia al reves (gravedad al final) y por eso dio
    // verde un suavizado de escalon que en el juego no hacia absolutamente nada.
    mc.vel[1] -= 22 * dt;
    if (opciones.andar) {
      global.mcMoveAxis(0, mc.pos[0] + mc.vel[0] * dt);
      global.mcMoveAxis(2, mc.pos[2] + mc.vel[2] * dt);
    }
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
  function ejecutar(codigo) { (new Function(codigo || CODE))(); }
  console.log = realLog; console.warn = realWarn;

  return {
    mc, game, avisosConsola, original,
    llamadas: () => llamadas,
    // Reejecuta el snippet tal cual (lo que hace el dueno al afinar subida/bajada).
    recargar: () => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = (...a) => avisosConsola.push(a.join(' ')); ejecutar(); console.log = l; console.warn = w; },
    // Reejecuta el snippet con un define EDITADO, que es lo que hace el dueño de verdad: abre Alt+C,
    // cambia un número en los comportamientos por defecto y le da a ejecutar.
    recargarEditado: (buscar, poner) => {
      const codigo = CODE.replace(buscar, poner);
      if (codigo === CODE) throw new Error('el test no encontró qué editar en el snippet: ' + buscar);
      const l = console.log, w = console.warn;
      console.log = () => {}; console.warn = (...a) => avisosConsola.push(a.join(' '));
      try { ejecutar(codigo); } finally { console.log = l; console.warn = w; }
    },
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

  // Pero heredar NO puede pisar lo que el snippet acaba de definir, que es justo lo que hacía: el
  // dueño editaba el define de la escalera, reejecutaba, y la tabla de la pasada anterior lo volvía a
  // sobrescribir dos líneas después. El define nuevo entraba (hasta avisaba por consola) y acto
  // seguido desaparecía: lista() seguía enseñando el valor viejo y el mundo tampoco cambiaba.
  const w3 = montar({ sinEscalera: true });
  const antes = w3.game.bloques._tabla['hab:escalera'].subida;
  w3.recargarEditado('subida: 4, bajada: 5', 'subida: 30, bajada: 5');
  const despues = w3.game.bloques._tabla['hab:escalera'];
  t('editar un define y reejecutar SÍ cambia el valor (la herencia no lo pisa)',
    !!despues && despues.subida === 30, '↑' + antes + ' -> ↑' + (despues ? despues.subida : '(se perdió)'));
  t('y el cambio llega a la física, no solo a la tabla',
    w3.game.bloques._porId().some(c => c && c.subida === 30), 'la caché densa sigue con el valor viejo');
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

  // Esta clava el porqué de medir dentro de mcMoveAxis: el frame que sube un escalón acaba SIN suelo
  // (gravedad antes del horizontal ⇒ vel[1]=0 ⇒ ny===pos[1] ⇒ no choca ⇒ onGround=false). Cualquier
  // versión que vuelva a guardarse con `mc.onGround` se apagará justo en el frame que hay que suavizar.
  const w = montar({ andar: true, escalones: true, sinEscalera: true, sinPlaca: true });
  w.mc.pos = [12.5, 5, 10.5]; w.mc.vel = [0, 0, 0]; w.mc.yaw = 0; w.mc.keys['w'] = true;
  let conSuelo = null;
  for (let i = 0; i < 20 && conSuelo === null; i++) {
    const y0 = w.mc.pos[1] + (w.mc._pasoDesfase || 0);
    w.frames(1);
    if (w.mc.pos[1] + (w.mc._pasoDesfase || 0) - y0 > 0.1) conSuelo = w.mc.onGround;
  }
  t('el frame del escalón acaba SIN suelo: onGround no vale como guarda', conSuelo === false, 'onGround=' + conSuelo);

  // Y que el segundo enganche tampoco se apile al reejecutar: dos capas contarían el escalón dos
  // veces y el ojo se hundiría el doble.
  const antesMove = global.mcMoveAxis;
  w.recargar();
  t('reejecutar no apila envoltorios sobre mcMoveAxis',
    global.mcMoveAxis !== antesMove && global.mcMoveAxis._orig === antesMove._orig);
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

console.log('\nvelocidad: multiplica la marcha MIENTRAS se pisa el bloque');
{
  // Anda en linea recta sobre la pista y devuelve lo que ha avanzado. Con cfg = null la pista es un
  // bloque cualquiera, o sea la medida de control.
  const correr = (cfg, n, x) => {
    const w = montar({ andar: true, pistaRasante: true, sinEscalera: true, sinPlaca: true });
    if (cfg) w.sinRuido(() => w.game.bloques.define('hab:placa', cfg));
    w.mc.pos = [x === undefined ? 12.5 : x, 5, 10.5]; w.mc.vel = [0, 0, 0]; w.mc.yaw = 0;
    w.mc.keys['w'] = true;
    const z0 = w.mc.pos[2];
    w.frames(n);
    return { avance: z0 - w.mc.pos[2], w };
  };
  const N = 30;
  const normal = correr(null, N).avance;
  const doble = correr({ velocidad: 2 }, N);
  const medio = correr({ velocidad: 0.5 }, N).avance;

  t('sobre un bloque normal la marcha es la de siempre', Math.abs(normal - VEL * N / 60) < 1e-9,
    normal.toFixed(3) + ' bloques');
  t('velocidad ×2 avanza exactamente el doble', Math.abs(doble.avance - 2 * normal) < 1e-9,
    doble.avance.toFixed(3) + ' vs ' + normal.toFixed(3));
  t('velocidad 0.5 frena a la mitad (sirve de barro)', Math.abs(medio - normal / 2) < 1e-9,
    medio.toFixed(3));
  t('mc.speed queda como estaba: el factor no se pega ni se persiste', doble.w.mc.speed === VEL,
    'mc.speed=' + doble.w.mc.speed);

  // Lo que distingue 'velocidad' de 'impulso'/'alPisar': no es un disparo al entrar en la celda, manda
  // en TODOS los frames que el pie siga encima. Si fuera de flanco, el segundo tramo iria a marcha normal.
  const seguido = correr({ velocidad: 2 }, 60).avance;
  t('es continuo, no un disparo al entrar: 60 frames rinden el doble que 30',
    Math.abs(seguido - 2 * doble.avance) < 1e-9, seguido.toFixed(3));

  // Y manda el bloque BAJO LOS PIES, no el de al lado: en x=11 el suelo es roca normal.
  t('en la fila de al lado no acelera (cuenta lo que se pisa, no lo cercano)',
    Math.abs(correr({ velocidad: 2 }, N, 11.5).avance - normal) < 1e-9);

  // Emergente y buscado: al saltar el pie deja la pista, pero app.js conserva la inercia horizontal
  // (control de aire), asi que una pista rapida + un salto = un salto largo.
  const s = correr({ velocidad: 2 }, 10);
  const vAire = Math.abs(s.w.mc.vel[2]);
  s.w.mc.vel[1] = 8; s.w.mc.onGround = false;
  s.w.frames(3);
  t('al saltar desde la pista se conserva la velocidad ganada', Math.abs(Math.abs(s.w.mc.vel[2]) - vAire) < 1e-9,
    vAire.toFixed(2) + ' u/s en el aire');

  const w = montar();
  const antes = w.avisosConsola.length;
  t('define rechaza un factor negativo', w.sinRuido(() => w.game.bloques.define('hab:placa', { velocidad: -2 })) === null);
  t('y explica que es un factor', /factor/.test(w.avisosConsola.slice(antes).join(' ')));
  t('un material solo con velocidad es válido (no hace falta trepable ni alPisar)',
    !!w.sinRuido(() => w.game.bloques.define('hab:placa', { velocidad: 3 })));
  const filas = w.sinRuido(() => w.game.bloques.lista());
  t('lista/info lo describen con el factor y las u/s resultantes',
    /velocidad ×3 \(12\.9 u\/s\)/.test(JSON.stringify(filas) + w.avisosConsola.join(' ')),
    JSON.stringify(filas && filas[filas.length - 1]));

  // El tope existe porque app.js mueve el eje de un tiron y solo mira el AABB final: a 430 u/s se
  // atraviesan paredes. 40 es el mismo techo que ya impone el setter de game.playerSpeed.
  // 12 frames y no 30: a 40 u/s el jugador cruza el mundo de juguete (24 bloques) y se cae por el
  // borde, y entonces lo medido seria la caida. Por eso se comprueba tambien que sigue en el suelo.
  const r = correr({ velocidad: 100 }, 12);
  t('un factor absurdo se recorta a 40 u/s en vez de atravesar paredes',
    Math.abs(r.avance - 40 * 12 / 60) < 1e-9 && r.w.mc.onGround, r.avance.toFixed(3) + ' bloques');
}

// ── 11. Mirar: la pieza gira hacia el jugador ───────────────────────────────────────────────────
// Esto NO mueve al jugador: lo unico que produce es s.model, la matriz que app.js multiplica al
// dibujar esa instancia. Asi que lo que se comprueba es la matriz, que es todo lo que sale de aqui.
{
  const CABEZA = 'asset:assets/cabeza.vox.json';
  // Una pieza de 1 bloque centrada en (12.5, 6.5, 6.5), o sea 4 bloques al norte del jugador
  // (12.5, 5, ~10.7) mirando hacia -Z, que es la orientacion de origen del dibujo.
  const ponerCabeza = (w, rot) => {
    const s = { key: CABEZA, ox: 12, oy: 6, oz: 6, rot: rot || 0, aabb: [12, 6, 6, 13, 7, 7] };
    w.mc.structures.push(s);
    return s;
  };
  // Aplica la matriz (columna-mayor, como WebGL) al vector director dado.
  const gira = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z,
                                m[2] * x + m[6] * y + m[10] * z];
  const grados = (v) => Math.atan2(v[0], -v[2]) * 180 / Math.PI;
  const separa = (a, b) => Math.abs(((a - b + 540) % 360) - 180);   // distancia angular por el camino corto

  {
    const w = montar({});
    const s = ponerCabeza(w);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 50 } }));
    // El jugador esta en z~10.7, la pieza en z=6.5: le queda justo detras, o sea media vuelta.
    w.frames(1);
    t('mirar pone matriz de modelo en la instancia', !!(s.model && s.model.length === 16));
    const frente = gira(s.model, 0, 0, -1);
    t('...y el frente de la pieza apunta al jugador (media vuelta)',
      Math.abs(Math.abs(grados(frente)) - 180) < 1.5, grados(frente).toFixed(1) + '°');
    // El pivote es el centro de la pieza: girar no la debe mover de sitio.
    const c = [s.model[0] * 12.5 + s.model[4] * 6.5 + s.model[8] * 6.5 + s.model[12],
               s.model[1] * 12.5 + s.model[5] * 6.5 + s.model[9] * 6.5 + s.model[13],
               s.model[2] * 12.5 + s.model[6] * 6.5 + s.model[10] * 6.5 + s.model[14]];
    t('...girando sobre su centro: la pieza no se desplaza',
      Math.hypot(c[0] - 12.5, c[1] - 6.5, c[2] - 6.5) < 1e-4,
      c.map(v => v.toFixed(3)).join(','));
  }

  {
    // 'limites' se mide DESDE la orientacion de origen: dentro del cono la pieza sigue al jugador
    // con el angulo EXACTO, sin que el tope se lo recorte a medias.
    const RAD = Math.PI / 180;
    const w = montar({});
    const s = ponerCabeza(w);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 50, limites: { y: [-70, 70] } } }));
    // 40° a la derecha de su frente horneado (-Z), a 4 bloques de la pieza (12.5, 6.5, 6.5).
    w.mc.pos[0] = 12.5 + Math.sin(40 * RAD) * 4;
    w.mc.pos[2] = 6.5 - Math.cos(40 * RAD) * 4;
    w.frames(1);
    t('dentro del cono el giro es el exacto, no uno recortado por los limites',
      Math.abs(grados(gira(s.model, 0, 0, -1)) - 40) < 1.5,
      grados(gira(s.model, 0, 0, -1)).toFixed(1) + '°');
  }

  {
    // REPORTADO POR EL DUENO: «cuando cabeza no mira, deberia volver a su posicion natural». Con el
    // jugador CERCA pero a media vuelta, el tope de 70° antes dejaba la pieza clavada en 70° (-70,00
    // frame tras frame, mirando a la pared) hasta que te ponias delante otra vez. No poder girar mas
    // es una razon para RENDIRSE, no para quedarse en el tope como un maniqui.
    const w = montar({});
    const s = ponerCabeza(w);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 50, limites: { y: [-70, 70] } } }));
    w.frames(1);   // el jugador de partida (z~10.7) le queda justo detras: 180°, fuera del cono
    t('fuera del cono vuelve a su pose de origen en vez de clavarse en el tope',
      !s.model && s._mirarYaw === 0, 'giro ' + (s._mirarYaw || 0).toFixed(2) + '°');
  }

  {
    // ...y vuelve SUAVE, que es lo que pidio el dueno: nada de apagar la matriz de un frame para
    // otro. Se le deja enganchar al jugador dentro del cono y luego se le sale por detras.
    const RAD = Math.PI / 180;
    const w = montar({});
    const s = ponerCabeza(w);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0.15, alcance: 50, limites: { y: [-70, 70] } } }));
    w.mc.pos[0] = 12.5 + Math.sin(60 * RAD) * 4;
    w.mc.pos[2] = 6.5 - Math.cos(60 * RAD) * 4;
    w.frames(120);                                     // 2 s: engancha y se estabiliza en ~60°
    const enganchada = s._mirarYaw;
    w.mc.pos[0] = 12.5; w.mc.pos[2] = Z_PEGADO;        // ahora le sale por detras (180°)
    const camino = [];
    for (let i = 0; i < 90 && s.model; i++) { w.frames(1); camino.push(Math.abs(s._mirarYaw)); }
    const baja = camino.every((v, i) => i === 0 || v <= camino[i - 1] + 1e-9);
    t('la vuelta al reposo es progresiva, no un corte de un frame',
      Math.abs(enganchada - 60) < 1.5 && camino.length > 5 && baja && s.model === null,
      'de ' + enganchada.toFixed(1) + '° a 0 en ' + camino.length + ' frames');
  }

  {
    // REPORTADO POR EL DUENO: «al acercarme el brazo gira en el plano y entonces ya apunta al
    // jugador; el apunte se hace bien, pero a costa de girar el brazo». Es la diferencia entre
    // INCLINARSE y APUNTAR: 'mirar' orienta la CARA de la pieza (su -Z), y un brazo apunta con su
    // eje LARGO. Sin descontarlo, el brazo se inclina tantos grados como la elevacion del jugador
    // — casi nada de lejos, un barrido de golpe de cerca. Con frente:{x:-90} apunta siempre.
    // Se mide lo unico que se ve: el angulo entre la linea HOMBRO→MANO y la linea HOMBRO→JUGADOR.
    const desvio = (s, hombro, mano, jug) => {
      const m = s.model, ap = (q) => [m[0]*q[0]+m[4]*q[1]+m[8]*q[2]+m[12],
                                      m[1]*q[0]+m[5]*q[1]+m[9]*q[2]+m[13],
                                      m[2]*q[0]+m[6]*q[1]+m[10]*q[2]+m[14]];
      const t = ap(mano);
      const u = [t[0]-hombro[0], t[1]-hombro[1], t[2]-hombro[2]];
      const v = [jug[0]-hombro[0], jug[1]-hombro[1], jug[2]-hombro[2]];
      const nu = Math.hypot(u[0],u[1],u[2]), nv = Math.hypot(v[0],v[1],v[2]);
      const cos = (u[0]*v[0] + u[1]*v[1] + u[2]*v[2]) / (nu * nv);
      return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    };
    const apunta = (mirar, jug) => {
      const w = montar({});
      const s = { key: CABEZA, ox: 12, oy: 10, oz: 6, rot: 0, aabb: [12, 10, 6, 13, 12, 7] };
      w.mc.structures.push(s);
      w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: Object.assign(
        { ejes: 'xy', suavidad: 0, alcance: 60, pivote: [0.5, 2, 0.5], limites: { x: [-90, 180] } }, mirar) }));
      w.mc.pos[0] = jug[0]; w.mc.pos[1] = jug[1]; w.mc.pos[2] = jug[2];
      w.frames(1);
      return desvio(s, [12.5, 12, 6.5], [12.5, 10, 6.5], jug);
    };
    // El hombro esta en (12.5, 12, 6.5). Lejos y a ras de suelo, cerca y abajo, y por encima.
    const casos = [['lejos y a ras', [12.5, 11, 26]], ['cerca y abajo', [14, 8, 8]],
                   ['por encima', [12.5, 18, 16]], ['al otro lado', [12.5, 11, -8]]];
    let peorSin = 0, peorCon = 0, detalle = [];
    for (const [nombre, jug] of casos) {
      const sin = apunta({}, jug), con = apunta({ frente: { x: -90 } }, jug);
      peorSin = Math.max(peorSin, sin); peorCon = Math.max(peorCon, con);
      detalle.push(nombre + ' ' + Math.round(sin) + '°→' + Math.round(con) + '°');
    }
    t('sin frente vertical el brazo NO apunta al jugador (solo se inclina)', peorSin > 30,
      'se desvia hasta ' + Math.round(peorSin) + '°');
    t('frente:{x:-90} hace que el brazo APUNTE al jugador a cualquier distancia', peorCon < 2,
      detalle.join(' · '));

    // frente numerico sigue siendo el horizontal de siempre, y {y:...} es lo mismo.
    {
      const giroCon = (fr) => {
        const w = montar({});
        const s = ponerCabeza(w, 0);
        w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: Object.assign({ suavidad: 0, alcance: 50 }, fr) }));
        w.mc.pos[0] = 20; w.mc.pos[2] = 9;
        w.frames(1);
        return grados(gira(s.model, 0, 0, -1));
      };
      t('frente numerico y frente:{y:...} son lo mismo (el de siempre, horizontal)',
        Math.abs(giroCon({ frente: 40 }) - giroCon({ frente: { y: 40 } })) < 1e-9
        && Math.abs(giroCon({ frente: 40 }) - giroCon({})) > 30,
        giroCon({}).toFixed(1) + '° → ' + giroCon({ frente: 40 }).toFixed(1) + '°');
    }
  }

  {
    // REPORTADO POR EL DUENO: «en lugar de girar el hombro para apuntar con el brazo al jugador
    // apunta hacia atras». 'mirar' apunta la CARA de la pieza (su -Z), pero un brazo que cuelga
    // apunta con su eje LARGO (su -Y): el mismo cabeceo que le sube la cara a una cabeza le aparta
    // la punta al brazo, y con el jugador POR DEBAJO del hombro — el caso normal, andando por el
    // suelo — se iba al reves. Se mide la punta, que es lo que se ve, no el angulo interno.
    const brazo = (w, rot) => {
      const s = { key: CABEZA, ox: 12, oy: 10, oz: 6, rot: rot || 0, aabb: [12, 10, 6, 13, 12, 7] };
      w.mc.structures.push(s);
      return s;
    };
    // Cuanto se inclina la punta HACIA el jugador (positivo) o hacia atras (negativo).
    const inclina = (s, jug) => {
      const m = s.model, punta = [12.5, 10, 6.5];
      const t = [m[0]*punta[0]+m[4]*punta[1]+m[8]*punta[2]+m[12],
                 m[1]*punta[0]+m[5]*punta[1]+m[9]*punta[2]+m[13],
                 m[2]*punta[0]+m[6]*punta[1]+m[10]*punta[2]+m[14]];
      const ux = jug[0] - 12.5, uz = jug[2] - 6.5, n = Math.hypot(ux, uz);
      return ((t[0] - punta[0]) * ux + (t[2] - punta[2]) * uz) / n;
    };
    const caso = (sentido, jugY) => {
      const w = montar({});
      const s = brazo(w);
      w.sinRuido(() => w.game.bloques.define(CABEZA, Object.assign(
        { mirar: Object.assign({ ejes: 'xy', suavidad: 0, alcance: 50, pivote: [0.5, 2, 0.5] },
          sentido ? { sentido: sentido } : {}) })));
      const jug = [12.5, jugY, 14];
      w.mc.pos[0] = jug[0]; w.mc.pos[1] = jug[1]; w.mc.pos[2] = jug[2];
      w.frames(1);
      return inclina(s, jug);
    };
    // El hombro esta en y=12. El jugador de a pie queda POR DEBAJO: ese es el caso que fallaba.
    t('sin sentido, con el jugador por debajo del hombro la punta se va hacia atras (lo reportado)',
      caso(null, 8) < -0.2, caso(null, 8).toFixed(2));
    t('sentido:{x:-1} la manda HACIA el jugador que esta por debajo',
      caso({ x: -1 }, 8) > 0.2, caso({ x: -1 }, 8).toFixed(2));
    t('...y con el jugador por ENCIMA se invierte tambien (es un signo, no un parche a un caso)',
      caso(null, 16) > 0.2 && caso({ x: -1 }, 16) < -0.2,
      'normal ' + caso(null, 16).toFixed(2) + ' · invertido ' + caso({ x: -1 }, 16).toFixed(2));

    {
      // sentido:{y:-1} espeja el GIRO: la pieza acaba mirando al lado contrario del que mira sin el.
      const conY = (sy) => {
        const w = montar({});
        const s = ponerCabeza(w, 0);
        w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: Object.assign({ suavidad: 0, alcance: 50 },
          sy ? { sentido: { y: -1 } } : {}) }));
        w.mc.pos[0] = 20; w.mc.pos[2] = 9;
        w.frames(1);
        return grados(gira(s.model, 0, 0, -1));
      };
      t('sentido:{y:-1} espeja el giro', Math.abs(conY(false) + conY(true)) < 1.5,
        conY(false).toFixed(1) + '° vs ' + conY(true).toFixed(1) + '°');
    }
    {
      const w = montar({});
      brazo(w);
      const antes = w.avisosConsola.length;
      t('un sentido que no es 1 ni -1 no se registra',
        w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { sentido: { x: 0.5 } } })) === null);
      t('...y el aviso dice para que sirve',
        /eje largo/.test(w.avisosConsola.slice(antes).join(' ')));
    }
  }

  {
    // REPORTADO POR EL DUENO: un brazo de dos bloques giraba «centrado entre los dos», o sea por el
    // codo. El pivote es, por definicion, el UNICO punto que la matriz deja quieto: eso es lo que se
    // mide aqui, no una coordenada calculada a mano.
    const fijo = (m, x, y, z) => Math.hypot(
      m[0] * x + m[4] * y + m[8] * z + m[12] - x,
      m[1] * x + m[5] * y + m[9] * z + m[13] - y,
      m[2] * x + m[6] * y + m[10] * z + m[14] - z);
    // Un brazo: 1 ancho, 2 de alto, colgando de (12.5, [10..12], 6.5). El hombro es el extremo de
    // arriba (y=12), el centro de la caja es el codo (y=11).
    // OJO: hace falta ejes:'xy'. Con giro a secas la pieza rota sobre la vertical DEL PIVOTE, y
    // todo punto de esa vertical se queda fijo, asi que subir o bajar el enganche no cambia ni un
    // voxel de un brazo que cuelga. El pivote alto solo se nota cuando hay CABECEO.
    const ponerBrazo = (w, rot) => {
      const s = { key: CABEZA, ox: 12, oy: 10, oz: 6, rot: rot || 0, aabb: [12, 10, 6, 13, 12, 7] };
      w.mc.structures.push(s);
      return s;
    };
    {
      const w = montar({});
      const s = ponerBrazo(w);
      w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { ejes: 'xy', suavidad: 0, alcance: 50, pivote: [0.5, 2, 0.5] } }));
      w.mc.pos[0] = 20;                                  // de lado, para que tenga que girar de verdad
      w.frames(1);
      t('pivote [0.5,2,0.5] cuelga la pieza de ese punto suyo, no del centro de su caja',
        fijo(s.model, 12.5, 12, 6.5) < 1e-4 && fijo(s.model, 12.5, 11, 6.5) > 0.1,
        'hombro se mueve ' + fijo(s.model, 12.5, 12, 6.5).toFixed(4)
        + ' · codo se mueve ' + fijo(s.model, 12.5, 11, 6.5).toFixed(3));
    }
    {
      // Sin pivote sigue girando por el centro: nada de cambiarle el enganche a lo que ya funciona.
      const w = montar({});
      const s = ponerBrazo(w);
      w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { ejes: 'xy', suavidad: 0, alcance: 50 } }));
      w.mc.pos[0] = 20;
      w.frames(1);
      t('sin pivote se sigue girando por el centro de la caja (nada cambia para la cabeza)',
        fijo(s.model, 12.5, 11, 6.5) < 1e-4);
    }
    {
      // y=1.5 del objeto = el centro del bloque de arriba en una pieza de 2 de alto (mundo y=11.5),
      // que es el punto fino que hace falta cuando el extremo se queda corto.
      const w = montar({});
      const s = ponerBrazo(w);
      w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { ejes: 'xy', suavidad: 0, alcance: 50, pivote: [0.5, 1.5, 0.5] } }));
      w.mc.pos[0] = 20;
      w.frames(1);
      t('coordenadas del objeto: [0.5,1.5,0.5] engancha a media altura del bloque de arriba',
        fijo(s.model, 12.5, 11.5, 6.5) < 1e-4, 'y=11.5 se mueve ' + fijo(s.model, 12.5, 11.5, 6.5).toFixed(4));
    }
    {
      // Lo que hace que una sola linea de config sirva para las cuatro poses: el pivote se da en el
      // marco DEL DIBUJO, asi que con rot impar (donde los lados X y Z de la caja estan cambiados)
      // 'delante' tiene que seguir cayendo en la misma parte de la PIEZA, no en la misma del mundo.
      // Pieza tumbada: 1 ancho, 1 alto, 2 de fondo. z=0 del objeto = su cara -Z de origen.
      const esperado = { 0: [12.5, 10.5, 6], 1: [14, 10.5, 6.5], 2: [12.5, 10.5, 8], 3: [11, 10.5, 6.5] };
      let malas = [];
      for (const rot of [0, 1, 2, 3]) {
        const w = montar({});
        const s = { key: CABEZA, ox: 12, oy: 10, oz: 6, rot,
                    aabb: (rot & 1) ? [11, 10, 6, 14, 11, 7] : [12, 10, 6, 13, 11, 8] };
        w.mc.structures.push(s);
        w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 50, pivote: [0.5, 0.5, 0] } }));
        w.mc.pos[0] = 20; w.mc.pos[2] = 30;
        w.frames(1);
        const e = esperado[rot];
        if (fijo(s.model, e[0], e[1], e[2]) > 1e-4) malas.push('rot=' + rot);
      }
      t('el pivote va en coordenadas del OBJETO: z=0 sigue a la pieza en los cuatro rot',
        malas.length === 0, malas.length ? 'falla en ' + malas.join(', ') : 'los cuatro clavados');
    }
    {
      // REPORTADO POR EL DUENO: los dos brazos de su figura estan puestos con `rot` opuesto (uno a
      // cada lado del busto) y con el pivote en el CENTRO de la celda se despegaban del cuerpo al
      // apuntar: el punto fijo caia medio bloque fuera del busto en los dos. Poniendolo en la cara
      // (x=1 del objeto) cae en la cara que toca el busto — y con UNA sola linea de config, porque
      // el pivote va en coordenadas del objeto y a piezas opuestas les toca la cara opuesta.
      const w = montar({});
      const izq = { key: CABEZA, ox: 12, oy: 10, oz: 6, rot: 1, aabb: [12, 10, 6, 13, 12, 7] };
      const der = { key: CABEZA, ox: 12, oy: 10, oz: 10, rot: 3, aabb: [12, 10, 10, 13, 12, 11] };
      w.mc.structures.push(izq, der);
      w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { ejes: 'xy', suavidad: 0, alcance: 50, pivote: [1, 2, 0.5] } }));
      w.mc.pos[0] = 20; w.mc.pos[2] = 8.5;
      w.frames(1);
      // Las dos piezas miran al mismo hueco de en medio (z=7 y z=10), cada una por su cara.
      t('dos piezas con rot opuesto: el pivote de la cara les cae en la cara de dentro a las dos',
        fijo(izq.model, 12.5, 12, 7) < 1e-4 && fijo(der.model, 12.5, 12, 10) < 1e-4,
        'izq se mueve ' + fijo(izq.model, 12.5, 12, 7).toFixed(4)
        + ' · der se mueve ' + fijo(der.model, 12.5, 12, 10).toFixed(4));
      // La que apenas gira apenas se desplaza, mida uno el pivote donde lo mida; el destrozo se ve en
      // la que tiene que dar media vuelta (yaw ~169° aqui), que es justo la que se le despegaba al
      // dueño: con el pivote en el centro, ese centro se va UN BLOQUE ENTERO — el hueco de la captura.
      t('...y en la que da media vuelta, el centro de la celda se va un bloque entero',
        fijo(der.model, 12.5, 12, 10.5) > 0.9,
        'centro der se mueve ' + fijo(der.model, 12.5, 12, 10.5).toFixed(3)
        + ' con yaw ' + Math.round(der._mirarYaw) + '° · la otra gira solo '
        + Math.round(izq._mirarYaw) + '° y se mueve ' + fijo(izq.model, 12.5, 12, 6.5).toFixed(3));
    }
    {
      const w = montar({});
      ponerBrazo(w);
      const antes = w.avisosConsola.length;
      t('un pivote que no es [x,y,z] no se registra',
        w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { pivote: 'arriba' } })) === null);
      t('...y el aviso dice en que unidades va',
        /coordenadas del OBJETO/.test(w.avisosConsola.slice(antes).join(' ')));
    }
  }

  {
    // La misma pieza YA estampada con rot=1 (un cuarto de vuelta horneado): el giro que se le pone
    // encima tiene que descontar ese cuarto, o miraria 90° de mas.
    const w = montar({});
    const s0 = ponerCabeza(w, 0);
    const s1 = ponerCabeza(w, 1);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 50 } }));
    w.frames(1);
    // Las dos acaban mirando al jugador, asi que el giro EXTRA que reciben (que es lo unico que
    // lleva la matriz; el otro cuarto ya esta en los vertices) tiene que diferir exactamente en 90.
    const d = separa(grados(gira(s0.model, 0, 0, -1)), grados(gira(s1.model, 0, 0, -1)));
    t('una pieza estampada con rot=1 descuenta el cuarto de vuelta ya horneado',
      Math.abs(d - 90) < 1.5, 'diferencia ' + d.toFixed(1) + '°');
  }

  {
    // REPORTADO POR EL DUENO: «si salto la cabeza mira hacia abajo, si ando normal mira hacia
    // arriba». El cabeceo se aplicaba sobre el eje X del MUNDO y antes del yaw, asi que solo salia
    // bien con la pieza estampada sin girar: a media vuelta (rot=2) cabeceaba AL REVES, y de perfil
    // (rot=1/3) no cabeceaba nada, RODABA de lado. El yaw no lo delataba porque gira sobre el mismo
    // eje que lo horneado y los dos conmutan. Se prueban las cuatro poses, arriba y abajo.
    const RAD = Math.PI / 180;
    // Hay que girar la cara YA HORNEADA, no (0,0,-1): la matriz se multiplica por unos vertices que
    // vienen con sus cuartos de vuelta puestos. Mirando (0,0,-1) el error se cuela entero.
    const caraHorneada = (rot) => [Math.sin(rot * 90 * RAD), 0, -Math.cos(rot * 90 * RAD)];
    for (const rot of [0, 1, 2, 3]) {
      const alturas = {};
      for (const [caso, y] of [['saltando', 11], ['agachado', 2]]) {
        const w = montar({});
        const s = ponerCabeza(w, rot);
        w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { ejes: 'xy', suavidad: 0, alcance: 50 } }));
        w.mc.pos[1] = y;                                   // el centro de la pieza esta en 6.5
        w.frames(1);
        const c = caraHorneada(rot);
        alturas[caso] = gira(s.model, c[0], c[1], c[2]);
      }
      t('rot=' + rot + ': cabecea HACIA el jugador (ni al reves ni rodando de lado)',
        alturas.saltando[1] > 0.2 && alturas.agachado[1] < -0.2,
        'saltando y=' + alturas.saltando[1].toFixed(2) + ' · agachado y=' + alturas.agachado[1].toFixed(2));
    }
  }

  {
    // REPORTADO POR EL DUENO: «la cabeza no me mira al cargar, solo si reejecuto el snippet». Al
    // terminar de cargar, mcClearStructures (app.js:3988) hace `mc.structures=[]` y mcBake
    // (app.js:6255) apila objetos NUEVOS: mismo recuento, otras instancias. La lista de mirones se
    // quedaba con las viejas y les ponia la matriz a ellas — invisible, porque ya no se dibujan.
    const w = montar({});
    ponerCabeza(w);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 50 } }));
    w.frames(1);
    // El mundo se re-hornea COMO LO HACE app.js: no cambia el array, se desestampa cada instancia
    // (splice, app.js:5772) y se vuelve a estampar una nueva (push, app.js:6096). Neto: el MISMO
    // array, el MISMO numero de elementos, y ni un solo objeto en comun. Reemplazar el array entero
    // seria una prueba mas floja — la caza cualquier firma que mire la identidad del array.
    const arr = w.mc.structures, n0 = arr.length;
    const copias = arr.map(s => Object.assign({}, s, { model: null, _mirarYaw: undefined, _mirarPit: undefined }));
    arr.length = 0;
    copias.forEach(s => arr.push(s));
    const mismoArray = w.mc.structures === arr && arr.length === n0;
    const nueva = arr.find(s => s.key === CABEZA);
    w.frames(1);
    t('tras re-hornear el mundo la matriz va a la instancia VIVA, no a la muerta',
      !!nueva.model && mismoArray,
      'estructuras ' + arr.length + ' en el mismo array, instancia viva con matriz: ' + !!nueva.model);
  }

  {
    // Suavidad: con tau>0 el primer frame solo recorre una parte del camino, no salta al objetivo.
    const w = montar({});
    const s = ponerCabeza(w);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0.3, alcance: 50 } }));
    // El primer frame se coloca YA mirando (una pieza recien cargada no debe entrar dando un
    // volantazo), asi que el suavizado se mide MOVIENDO al jugador despues.
    w.frames(1);
    const g0 = grados(gira(s.model, 0, 0, -1));
    w.mc.pos[0] = 10.5; w.mc.pos[2] = 2.5;               // al otro lado de la pieza
    w.frames(1);
    const g1 = grados(gira(s.model, 0, 0, -1));
    w.frames(120);                                       // 2 s = casi 7 taus: ya ha llegado
    const g2 = grados(gira(s.model, 0, 0, -1));
    const meta = Math.atan2(10.5 - 12.5, -(2.5 - 6.5)) * 180 / Math.PI;
    t('con suavidad el giro no es un tiron: avanza un poco y luego llega',
      separa(g1, g0) < 20 && separa(g1, meta) > 90 && separa(g2, meta) < 2,
      'de ' + g0.toFixed(0) + '° a ' + meta.toFixed(0) + '°: tras 1 frame ' + g1.toFixed(0)
      + '°, tras 2 s ' + g2.toFixed(0) + '°');
  }

  {
    // Fuera de alcance: vuelve a la pose horneada y SUELTA la matriz, para que app.js siga por su
    // camino de siempre (sin uniform y sin inflar la caja de culling).
    const w = montar({});
    const s = ponerCabeza(w);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 1 } }));
    w.frames(2);
    t('fuera de alcance no se queda mirando al vacio: suelta la matriz', !s.model);
  }

  {
    // Quitar el comportamiento tiene que devolver la pieza a su pose horneada, no dejarla torcida.
    const w = montar({});
    const s = ponerCabeza(w);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 50 } }));
    w.frames(1);
    const teniaMatriz = !!s.model;
    w.sinRuido(() => w.game.bloques.quitar(CABEZA));
    w.frames(1);
    t('quitar() devuelve la pieza a su orientacion de origen', teniaMatriz && !s.model);
  }

  {
    // Un material de TERRENO no se puede girar: esta fundido en la malla de su chunk. Tiene que
    // avisar y NO registrarse, no fallar en silencio dentro del bucle de dibujo.
    const w = montar({});
    ponerCabeza(w);                                        // para que haya alguna estructura viva
    const antes = w.avisosConsola.length;
    const reg = w.sinRuido(() => w.game.bloques.define('hab:escalera', { mirar: true }));
    t('mirar en un material de terreno avisa y no registra nada',
      !reg && /ESTRUCTURAS/.test(w.avisosConsola.slice(antes).join(' ')),
      w.avisosConsola[w.avisosConsola.length - 1]);
  }

  {
    // El prefijo no decide nada: el mundo del dueno estampa estructuras 'hab:' (hab:cubo-trans y
    // companía), y esas tambien tienen que poder girar.
    const w = montar({ fina: true });
    w.mc.structures.forEach(e => { e.aabb = [e.ox, e.oy, e.oz, e.ox + 1, e.oy + 1, e.oz + 1]; });
    const s = w.mc.structures[0];
    const reg = w.sinRuido(() => w.game.bloques.define(s.key, { mirar: { suavidad: 0, alcance: 50 } }));
    w.frames(1);
    t('una estructura "hab:" tambien gira (el prefijo no decide, decide ser estructura)',
      !!(reg && reg.mirar && s.model), s.key);
  }

  {
    const w = montar({});
    ponerCabeza(w);                                        // define() valida la clave contra el mundo
    const antes = w.avisosConsola.length;
    const reg = w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { ejes: 'z' } }));
    t('ejes:"z" (alabeo) avisa en vez de girar de lado', !reg && /alabeo/.test(w.avisosConsola.slice(antes).join(' ')));
  }

  {
    // 'lookAt' es como se llamo al proponerlo, asi que sigue valiendo aunque el nombre sea 'mirar'.
    const w = montar({});
    ponerCabeza(w);
    const reg = w.sinRuido(() => w.game.bloques.define(CABEZA, { lookAt: { alcance: 9 } }));
    t('el nombre en ingles (lookAt) sigue valiendo como alias de mirar',
      !!(reg && reg.mirar && reg.mirar.alcance === 9));
  }

  {
    // El coste tiene que ser por pieza QUE MIRA, no por estructura del mundo: sin ningun 'mirar'
    // definido, el motor no debe tocar ni una instancia.
    const w = montar({ fina: true });
    w.frames(3);
    t('sin ningun mirar definido, ninguna estructura recibe matriz',
      w.mc.structures.every(s => !s.model), w.mc.structures.length + ' estructuras');
  }
}


// ── 12. Rayos-X: la cuarta linea de la etiqueta ─────────────────────────────────────────────────
// app.js pinta tres lineas y deja el hueco `mcXrayExtra`; lo que se prueba aqui es lo que el snippet
// mete en ese hueco. La etiqueta es una herramienta de depuracion, asi que lo que importa no es el
// formato bonito sino que el numero que se lee sea EL de la instancia y que lo que no existe no
// aparezca como cero.
{
  const CABEZA = 'asset:assets/cabeza.vox.json';
  const ponerCabeza = (w, rot) => {
    const s = { key: CABEZA, ox: 12, oy: 6, oz: 6, rot: rot || 0, aabb: [12, 6, 6, 13, 7, 7] };
    w.mc.structures.push(s);
    return s;
  };
  const leerY = (txt) => { const m = /Y\s+(-?[\d.]+)°/.exec(txt); return m ? parseFloat(m[1]) : NaN; };

  {
    const w = montar({});
    t('el snippet engancha la cuarta linea de rayos-X al instalarse', typeof global.mcXrayExtra === 'function');
    t('un material SIN comportamiento no añade linea', global.mcXrayExtra('hab:roca', null) === '');
    t('un bloque de terreno con comportamiento la lleva',
      /trepable/.test(global.mcXrayExtra('hab:escalera', null)), global.mcXrayExtra('hab:escalera', null));
  }

  {
    // El angulo de la etiqueta es el de ESA instancia, no un promedio ni el de la config.
    const w = montar({});
    const s = ponerCabeza(w);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 50 } }));
    w.frames(1);
    const txt = global.mcXrayExtra(CABEZA, s);
    t('la estructura que mira enseña su comportamiento', /mirar/.test(txt), txt);
    t('...y el giro Y que lleva de verdad esa instancia',
      Math.abs(leerY(txt) - s._mirarYaw) < 0.1, txt + ' vs ' + s._mirarYaw.toFixed(2) + '°');
    // El alabeo NO existe (la matriz es Ry·Rx·Ry): sale como raya. Un '0°' se leeria como «esta a
    // cero ahora», y el dueño se pondria a buscar por que ese eje no se mueve.
    t('el plano Z sale como raya, no como 0°', /Z —/.test(txt) && !/Z\s+0/.test(txt), txt);
    t('los tres planos salen siempre, no solo el que gira', /X /.test(txt) && /Y /.test(txt) && /Z /.test(txt));
  }

  {
    // Sin matriz puesta la pieza esta en su pose de origen: hay que poder distinguirlo de «gira 0°
    // porque justo ahora te tiene de frente», que es lo mismo que se lee en los angulos.
    const w = montar({});
    const s = ponerCabeza(w);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 1 } }));  // fuera de alcance
    w.frames(2);
    t('una pieza que no esta girando lo dice', /en reposo/.test(global.mcXrayExtra(CABEZA, s)),
      global.mcXrayExtra(CABEZA, s));
  }

  {
    // La Y va RELATIVA a la pose horneada (asi se miden los 'limites'), asi que el horneado tiene que
    // salir aparte: sin el, dos piezas iguales con `rot` distinto enseñan el mismo numero mirando a
    // sitios opuestos.
    const w = montar({});
    const s = ponerCabeza(w, 2);                            // media vuelta horneada
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 50 } }));
    w.frames(1);
    const txt = global.mcXrayExtra(CABEZA, s);
    t('el horneado (rot) se enseña aparte del giro vivo', /origen 180°/.test(txt), txt);
  }

  {
    // Un bloque de terreno no es una instancia: no tiene angulos que enseñar aunque su material los
    // configure. Enseñar ceros ahi seria decir que ese bloque esta a 0°, y no hay tal bloque girando.
    const w = montar({});
    w.sinRuido(() => w.game.bloques.define('hab:escalera', { trepable: true, mirar: { alcance: 50 } }));
    const txt = global.mcXrayExtra('hab:escalera', null);
    t('un bloque de terreno no lleva angulos (no hay instancia)', !/Y\s+-?[\d.]+°/.test(txt), txt);
  }

  {
    // REPORTADO POR EL DUENO: dos brazos iguales, uno sigue al jugador y el otro «solo se activa
    // cuando pasas por detras». La causa no era el brazo sino el sitio: puestos con `rot` 180°
    // distinto, y como los limites se cuentan desde la pose horneada de CADA UNO, sus conos miran a
    // lados opuestos del mundo. La etiqueta tiene que decir eso, no un «en reposo» pelado.
    const w = montar({});
    const s = ponerCabeza(w, 0);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 50, limites: { y: [-30, 30] } } }));
    w.frames(2);                                              // el jugador esta DETRAS: pide ~180°
    const txt = global.mcXrayExtra(CABEZA, s);
    t('parada por el cono: la etiqueta dice cuanto pide y cual es el tope', /pide -?18[01]/.test(txt) && /cono -30\.\.30/.test(txt), txt);
  }

  {
    // El otro motivo de estar parada es la distancia, y no se puede confundir con el cono: son
    // arreglos distintos (mover la pieza / abrir 'limites' vs subir 'alcance').
    const w = montar({});
    const s = ponerCabeza(w, 0);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 2 } }));
    w.frames(2);
    const txt = global.mcXrayExtra(CABEZA, s);
    t('parada por distancia: la etiqueta dice a cuanto esta y cual es el alcance',
      /bloques, alcance 2/.test(txt) && !/cono/.test(txt), txt);
  }

  {
    // Girando no hay motivo que enseñar: si quedara pegado el de antes, la etiqueta diria que esta
    // en reposo justo mientras se mueve.
    const w = montar({});
    const s = ponerCabeza(w, 0);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 50 } }));
    w.frames(2);
    t('mientras gira no se enseña ningun motivo', !/reposo/.test(global.mcXrayExtra(CABEZA, s)),
      global.mcXrayExtra(CABEZA, s));
  }

  {
    // Dos piezas del MISMO material con `rot` 180° distinto: la de enfrente gira y la otra no, y la
    // etiqueta tiene que dejar claro que la diferencia esta en el origen horneado, no en la config.
    const w = montar({});
    const a = ponerCabeza(w, 0), bb = ponerCabeza(w, 2);
    w.sinRuido(() => w.game.bloques.define(CABEZA, { mirar: { suavidad: 0, alcance: 50, limites: { y: [-30, 30] } } }));
    w.frames(2);
    const ta = global.mcXrayExtra(CABEZA, a), tb = global.mcXrayExtra(CABEZA, bb);
    t('dos piezas iguales con rot opuesto: una gira y la otra no, y se ve por que',
      (!!bb.model && !a.model) && /pide/.test(ta) && /origen 180°/.test(tb), ta + '   ||   ' + tb);
  }

  {
    // Reejecutar el snippet no puede dejar enganchada la funcion VIEJA: leeria la tabla vieja y la
    // etiqueta enseñaria comportamientos que ya no existen (es el mismo fallo que tuvo mcUpdate).
    const w = montar({});
    const antes = global.mcXrayExtra;
    w.recargar();
    t('reejecutar el snippet reengancha la etiqueta (no se queda la vieja)',
      typeof global.mcXrayExtra === 'function' && global.mcXrayExtra !== antes);
    w.sinRuido(() => w.game.bloques.quitar('hab:escalera'));
    t('...y lo que se quita deja de salir en la etiqueta', global.mcXrayExtra('hab:escalera', null) === '');
  }
}

// ── 13. Piezas espejo: apuntar sin darse media vuelta (sinVolteo) ───────────────────────────────
// REPORTADO POR EL DUENO: sus dos brazos son el MISMO dibujo puesto con `rot` opuesto. Apuntar la
// CARA de los dos al mismo sitio obliga a uno a girar 180° sobre si mismo: llegaba apuntando bien
// pero «con los dedos del reves», y para llegar barria por la espalda en vez de subir por delante.
// La misma flecha se apunta con DOS posturas — (giro, cab) y (giro+180, 180-cab-2*frenteX) — y la
// segunda deja la pieza en su orientacion de origen y sube por cabeceo, que es lo que hace un hombro.
{
  const BRAZO = 'asset:assets/brazo.vox.json';
  const RAD = Math.PI / 180;
  const gira = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z,
                                m[2] * x + m[6] * y + m[10] * z];
  const norm = (v) => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; };
  const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // Dos brazos colgando a los lados de un busto, con `rot` opuesto: es como estan en el mundo del
  // dueño. Sus hombros (el punto fijo del pivote [1,2,0.5]) caen en (12.5,12,7) y (12.5,12,10).
  const ponerBrazos = (w) => {
    const izq = { key: BRAZO, ox: 12, oy: 10, oz: 6,  rot: 1, aabb: [12, 10, 6, 13, 12, 7] };
    const der = { key: BRAZO, ox: 12, oy: 10, oz: 10, rot: 3, aabb: [12, 10, 10, 13, 12, 11] };
    w.mc.structures.push(izq, der);
    return { izq, der, hombro: { izq: [12.5, 12, 7], der: [12.5, 12, 10] } };
  };
  // Con frente:{x:-90} el cabeceo se cuenta desde el brazo COLGANDO: 0 = colgando, 90 = horizontal,
  // 180 = tieso hacia arriba. Por eso el tope de arriba aqui es 180 y no 90; con 90 el brazo no
  // podria pasar de la horizontal ni aunque el jugador se le suba encima (que es, de hecho, lo que
  // hace el limite [30,90] que el dueño tiene puesto en el mundo: sube hasta la horizontal y para).
  const CFG = { ejes: 'xy', suavidad: 0, alcance: 50, pivote: [1, 2, 0.5], frente: { x: -90 },
                limites: { y: [-180, 180], x: [0, 180] } };
  // Un brazo que cuelga apunta con su eje LARGO hacia abajo, asi que su flecha es la (0,-1,0) del
  // dibujo — y esa no la toca el horneado, porque girar sobre Y deja la vertical quieta. La
  // direccion a la que de verdad apunta la pieza es entonces la matriz aplicada a (0,-1,0).
  const apunta = (s) => norm(gira(s.model, 0, -1, 0));
  // El «pulgar»: el eje izquierda-derecha DE LA PIEZA. Al cabecear no se mueve (Rx lo deja quieto),
  // asi que si aparece del reves es que la pieza se ha dado media vuelta. Es literalmente lo que
  // vio el dueño. Va en coordenadas de la malla YA horneada: Ry(rot·90)·(1,0,0).
  const pulgar = (s) => {
    const a = (s.rot & 3) * 90 * RAD;
    return norm(gira(s.model, Math.cos(a), 0, -Math.sin(a)));
  };
  const pulgarEnReposo = (s) => { const a = (s.rot & 3) * 90 * RAD; return [Math.cos(a), 0, -Math.sin(a)]; };

  {
    // Lo esencial: las dos posturas apuntan EXACTAMENTE igual. Si esto falla, el arreglo no arregla
    // nada — el brazo espejo dejaria de seguir al jugador, que es peor que llegar girado.
    const w = montar({});
    const b = ponerBrazos(w);
    w.sinRuido(() => w.game.bloques.define(BRAZO, { mirar: Object.assign({ sinVolteo: true }, CFG) }));
    w.mc.pos[0] = 24; w.mc.pos[1] = 11; w.mc.pos[2] = 8.5;   // delante de los dos, casi a su altura
    w.frames(1);
    const dIzq = punto(apunta(b.izq), norm([w.mc.pos[0] - b.hombro.izq[0], w.mc.pos[1] - b.hombro.izq[1], w.mc.pos[2] - b.hombro.izq[2]]));
    const dDer = punto(apunta(b.der), norm([w.mc.pos[0] - b.hombro.der[0], w.mc.pos[1] - b.hombro.der[1], w.mc.pos[2] - b.hombro.der[2]]));
    t('con sinVolteo los dos brazos siguen apuntando al jugador', dIzq > 0.999 && dDer > 0.999,
      'izq ' + dIzq.toFixed(4) + ' · der ' + dDer.toFixed(4));
    t('...y ninguno se da media vuelta sobre si mismo',
      Math.abs(b.izq._mirarYaw) <= 90 && Math.abs(b.der._mirarYaw) <= 90,
      'izq yaw ' + Math.round(b.izq._mirarYaw) + '° · der yaw ' + Math.round(b.der._mirarYaw) + '°');
    t('...y el pulgar de los dos sigue apuntando al mismo lado que en reposo',
      punto(pulgar(b.izq), pulgarEnReposo(b.izq)) > 0.99 && punto(pulgar(b.der), pulgarEnReposo(b.der)) > 0.99,
      'izq ' + punto(pulgar(b.izq), pulgarEnReposo(b.izq)).toFixed(3)
        + ' · der ' + punto(pulgar(b.der), pulgarEnReposo(b.der)).toFixed(3));
  }

  {
    // El defecto que reporto el dueño, para que no vuelva sin que nadie se entere: SIN sinVolteo uno
    // de los dos apunta igual de bien pero llega con el pulgar del reves.
    const w = montar({});
    const b = ponerBrazos(w);
    w.sinRuido(() => w.game.bloques.define(BRAZO, { mirar: CFG }));
    w.mc.pos[0] = 24; w.mc.pos[1] = 11; w.mc.pos[2] = 8.5;
    w.frames(1);
    const gira180 = Math.abs(b.izq._mirarYaw) > 90 || Math.abs(b.der._mirarYaw) > 90;
    const alReves = punto(pulgar(b.izq), pulgarEnReposo(b.izq)) < -0.9
                 || punto(pulgar(b.der), pulgarEnReposo(b.der)) < -0.9;
    t('sin sinVolteo (lo de antes) uno de los dos SI se da media vuelta y saca el pulgar del reves',
      gira180 && alReves, 'izq yaw ' + Math.round(b.izq._mirarYaw) + '° · der yaw ' + Math.round(b.der._mirarYaw) + '°');
  }

  {
    // El brazo espejo tiene que SUBIR, no barrer en horizontal: con el jugador delante y por encima
    // del hombro, la punta se va hacia arriba y hacia el, y su giro se queda pegado a cero.
    const w = montar({});
    const b = ponerBrazos(w);
    w.sinRuido(() => w.game.bloques.define(BRAZO, { mirar: Object.assign({ sinVolteo: true }, CFG) }));
    w.mc.pos[0] = 20; w.mc.pos[1] = 16; w.mc.pos[2] = 8.5;   // delante y mas alto que el hombro
    w.frames(1);
    const esp = b.izq._mirarVolteada ? b.izq : b.der;          // el que esta puesto del reves
    const dir = apunta(esp);
    t('el brazo espejo sube por delante (la punta va hacia arriba y hacia el jugador)',
      dir[1] > 0.15 && dir[0] > 0.5 && Math.abs(esp._mirarYaw) < 15,
      'punta (' + dir.map((v) => v.toFixed(2)).join(', ') + ') con yaw ' + Math.round(esp._mirarYaw) + '°');
  }

  {
    // Plantarse justo en la frontera entre las dos posturas no puede hacer aletear la pieza: son
    // igual de validas ahi, y sin banda muerta el brazo se pasaria el rato dandose la vuelta.
    // Con el hombro izquierdo en (12.5,12,7) y su origen horneado a 90°, el jugador al norte (mismo
    // x, mas z) le cae justo a 90° de giro pedido, que es la frontera pelada.
    const w = montar({});
    const b = ponerBrazos(w);
    w.sinRuido(() => w.game.bloques.define(BRAZO, { mirar: Object.assign({ sinVolteo: true }, CFG) }));
    const en = (grados) => {   // coloca al jugador en el rumbo que pide ESE giro para el brazo izq
      const th = (grados + 90) * RAD;
      w.mc.pos[0] = 12.5 + Math.sin(th) * 20; w.mc.pos[1] = 12; w.mc.pos[2] = 7 - Math.cos(th) * 20;
      w.frames(1);
      return b.izq._mirarVolteada;
    };
    const enLaRaya = en(90), pasada = en(105), volviendo = en(95), fuera = en(70);
    t('la banda muerta evita el aleteo: en la raya no voltea, y una vez volteada aguanta',
      enLaRaya === false && pasada === true && volviendo === true && fuera === false,
      [enLaRaya, pasada, volviendo, fuera].join(' '));
  }

  {
    // sinVolteo sin cabeceo no es «casi bien», es apuntar al lado contrario: la media vuelta se
    // compensa con el cabeceo y sin eje x no hay con que.
    const w = montar({});
    ponerBrazos(w);
    const antes = w.avisosConsola.length;
    t('sinVolteo sin ejes:"xy" no se registra',
      w.sinRuido(() => w.game.bloques.define(BRAZO, { mirar: { sinVolteo: true, alcance: 50 } })) === null);
    t('...y el aviso explica que hace falta el cabeceo',
      /sinVolteo necesita ejes/.test(w.avisosConsola.slice(antes).join(' ')),
      w.avisosConsola.slice(antes).join(' '));
  }

  {
    // En rayos-X hay que poder distinguir «esta en su postura de siempre» de «esta en la otra», o
    // los angulos de la etiqueta no se pueden leer: un cabeceo negativo no es un error, es la otra.
    const w = montar({});
    const b = ponerBrazos(w);
    w.sinRuido(() => w.game.bloques.define(BRAZO, { mirar: Object.assign({ sinVolteo: true }, CFG) }));
    w.mc.pos[0] = 24; w.mc.pos[1] = 11; w.mc.pos[2] = 8.5;
    w.frames(1);
    const volteado = b.izq._mirarVolteada ? b.izq : b.der, normal = b.izq._mirarVolteada ? b.der : b.izq;
    t('la etiqueta marca con ↺ la pieza que esta en la otra postura, y solo esa',
      /↺/.test(global.mcXrayExtra(BRAZO, volteado)) && !/↺/.test(global.mcXrayExtra(BRAZO, normal)),
      global.mcXrayExtra(BRAZO, volteado) + '   ||   ' + global.mcXrayExtra(BRAZO, normal));
    t('...y el resumen del material dice que lleva sinVolteo',
      /sinVolteo/.test(global.mcXrayExtra(BRAZO, normal)), global.mcXrayExtra(BRAZO, normal));
  }
}

// ── 14. Pivotes DIBUJADOS en el editor (herramienta 📍) ─────────────────────────────────────────
// PEDIDO POR EL DUENO: elegir el pivote desde el editor en vez de contarlo a mano en el snippet.
// El editor guarda `pivotes` (celdas de SU rejilla) como clave de primer nivel del JSON del objeto.
// Toda la prueba esta en la TRADUCCION a coordenadas del objeto, donde hay tres trampas y cada una
// cuelga el brazo de un sitio distinto:
//   · el editor es Z-arriba y el Mundo Y-arriba (el eje Y del dibujo es la PROFUNDIDAD);
//   · el origen es la ESQUINA DE CELDA que contiene el minimo, no el minimo (lo mismo que mallar);
//   · el punto es el CENTRO de la celda marcada, no su esquina.
// Y hay una cuarta que no es de cuentas: el JSON viaja por red, asi que la resolucion es ASINCRONA
// y la pieza tiene que arrancar girando sobre el centro de su caja sin romperse mientras llega.
async function seccionPivotes() {
  const BRAZO = 'asset:assets/brazo.vox.json';
  const CFG = { ejes: 'xy', suavidad: 0, alcance: 50, frente: { x: -90 },
                limites: { y: [-180, 180], x: [0, 180] } };
  // Un brazo de 1x2x1 bloques = 16x16x32 voxels del editor. `o` desplaza el contenido en X para
  // poder probar que el origen es la celda y no el minimo.
  const dibujo = (pivotes, o) => {
    o = o || 0;
    const v = {};
    v[o + ',0,0'] = '#fff';
    v[(o + 15) + ',15,31'] = '#fff';
    return { voxels: v, pivotes: pivotes };
  };
  const esperar = () => new Promise(r => setImmediate(r));
  const cerca = (a, b) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  let doc = dibujo([]);
  global.getRoomData = (clave) => Promise.resolve(clave === BRAZO ? doc : { voxels: {} });
  const avisos = [];
  // La resolucion cae FUERA del define (es una promesa), asi que el aviso llega con la consola ya
  // restaurada: hay que capturarla alrededor de la espera, no alrededor de la llamada.
  const definir = async (w, mirar) => {
    const cw = console.warn, cl = console.log;
    console.warn = (...a) => avisos.push(a.join(' '));
    console.log = () => {};
    try {
      const n = w.game.bloques.define(BRAZO, { mirar: mirar });
      await esperar();
      return n;
    } finally { console.warn = cw; console.log = cl; }
  };
  const conBrazos = () => {
    const w = montar({});
    const izq = { key: BRAZO, ox: 12, oy: 10, oz: 6,  rot: 1, aabb: [12, 10, 6, 13, 12, 7] };
    const der = { key: BRAZO, ox: 12, oy: 10, oz: 10, rot: 3, aabb: [12, 10, 10, 13, 12, 11] };
    w.mc.structures.push(izq, der);
    return { w, izq, der };
  };
  // El hombro de un brazo 1x2x1: el voxel de arriba del todo, pegado a la cara que toca el busto y
  // centrado en profundidad. En coordenadas del objeto es el CENTRO de esa celda.
  const HOMBRO = [15, 8, 31];
  const HOMBRO_OBJ = [15.5 / 16, 31.5 / 16, 8.5 / 16];

  console.log('\nEl pivote nº1 dibujado sale de la rejilla del editor');
  {
    doc = dibujo([HOMBRO]);
    const n = await definir(conBrazos().w, Object.assign({ pivote: 1 }, CFG));
    t('pivote:1 se traduce a coordenadas del objeto (la Z del editor es la altura del mundo)',
      cerca(n.mirar.piv, HOMBRO_OBJ), JSON.stringify(n.mirar.piv));
    t('...y sin pedir ninguno se usa el PRIMERO dibujado',
      cerca((await definir(conBrazos().w, Object.assign({}, CFG))).mirar.piv, HOMBRO_OBJ));
  }

  console.log('\nSe elige por NUMERO, que es el que el editor pinta al lado');
  {
    doc = dibujo([HOMBRO, [0, 8, 0]]);
    const n = await definir(conBrazos().w, Object.assign({ pivote: 2 }, CFG));
    t('pivote:2 coge el segundo, no el primero',
      cerca(n.mirar.piv, [0.5 / 16, 0.5 / 16, 8.5 / 16]), JSON.stringify(n.mirar.piv));
    const antes = avisos.length;
    const n5 = await definir(conBrazos().w, Object.assign({ pivote: 5 }, CFG));
    t('pedir un nº que no existe avisa y deja la pieza girando sobre su centro',
      n5.mirar.piv === null && /pivote nº5/.test(avisos.slice(antes).join(' ')),
      avisos.slice(antes).join(' '));
    const w0 = conBrazos().w;
    t('...y un nº menor que 1 se rechaza en el define (no es un indice)',
      w0.sinRuido(() => w0.game.bloques.define(BRAZO, { mirar: Object.assign({ pivote: 0 }, CFG) })) === null);
  }

  console.log('\nEl origen es la CELDA del minimo, no el minimo');
  {
    // Un dibujo que empieza en x=20 vive en la celda 16..31: su esquina es 16, no 20. Si se tomara
    // el minimo, el pivote se correria 4/16 de bloque y el brazo colgaria fuera del hombro.
    doc = dibujo([[20, 8, 31]], 20);
    const n = await definir(conBrazos().w, Object.assign({ pivote: 1 }, CFG));
    t('un dibujo desplazado dentro de su celda conserva su posicion RELATIVA',
      cerca(n.mirar.piv, [4.5 / 16, 31.5 / 16, 8.5 / 16]), JSON.stringify(n.mirar.piv));
  }

  console.log('\nEl pivote escrito a mano sigue mandando sobre el dibujado');
  {
    doc = dibujo([[0, 0, 0]]);
    const n = await definir(conBrazos().w, Object.assign({ pivote: [1, 2, 0.5] }, CFG));
    t('un literal [x,y,z] no lo pisa el dibujo', cerca(n.mirar.piv, [1, 2, 0.5]),
      JSON.stringify(n.mirar.piv));
    doc = dibujo([]);
    const sin = await definir(conBrazos().w, Object.assign({}, CFG));
    t('un objeto SIN pivotes dibujados no rompe nada: gira sobre el centro de su caja',
      sin.mirar.piv === null);
  }

  console.log('\nEl pivote dibujado manda de verdad en el giro, no solo en la tabla');
  {
    // Lo unico que prueba que esto sirve para algo: la MATRIZ que sale. Dibujado y escrito a mano
    // en el mismo punto tienen que dar exactamente la misma pose; si no, la traduccion es decorado.
    doc = dibujo([HOMBRO]);
    const a = conBrazos();
    await definir(a.w, Object.assign({ pivote: 1 }, CFG));
    a.w.mc.pos[0] = 24; a.w.mc.pos[1] = 11; a.w.mc.pos[2] = 8.5;
    a.w.frames(1);
    const dibujada = a.izq.model && Array.from(a.izq.model);
    doc = dibujo([]);
    const b = conBrazos();
    await definir(b.w, Object.assign({ pivote: HOMBRO_OBJ.slice() }, CFG));
    b.w.mc.pos[0] = 24; b.w.mc.pos[1] = 11; b.w.mc.pos[2] = 8.5;
    b.w.frames(1);
    const manual = b.izq.model && Array.from(b.izq.model);
    const IDENT = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    t('la pose con el pivote dibujado es la misma que con ese punto escrito a mano',
      !!dibujada && !!manual && dibujada.every((v, i) => Math.abs(v - manual[i]) < 1e-9),
      JSON.stringify(dibujada) + ' vs ' + JSON.stringify(manual));
    t('...y no es la matriz identidad (el pivote se esta usando de verdad)',
      !!dibujada && dibujada.some((v, i) => Math.abs(v - IDENT[i]) > 1e-6));
  }
}

// ── 15. Pivote AUTOMATICO y giros propios de cada pivote ────────────────────────────────────────
// PEDIDO POR EL DUENO: «en funcion de donde se pegue la estructura se activa ese pivote», y ademas
// «el pivote 1 puede funcionar de una manera en cuanto giro y limites y el 2 de otra».
// Lo que prueba que esto sirve no es que se elija UN pivote, sino que dos piezas del MISMO material
// elijan pivotes DISTINTOS: contra que esta pegada cada una no lo dice el material, es cosa de la
// instancia (el brazo del dueno tiene sus dos pivotes en caras opuestas justo por eso). Y hay tres
// trampas que no se ven desde el codigo:
//   · la normal con la que se estampo NO se guarda, asi que el contacto hay que deducirlo del mundo;
//   · un panel de 1/16 pegado a ras es contacto: se sondea medio voxel fino MAS ALLA del plano de
//     la cara, no el centro de la celda vecina, que para un panel fino cae en aire;
//   · `rot` lleva VUELCO ademas de giro (bits 2-3), asi que el «abajo» del dibujo puede acabar
//     tocando de lado; mirar solo rot&3 elige el pivote equivocado.
async function seccionPivoteAuto() {
  const BRAZO = 'asset:assets/brazo.vox.json';
  const CFG = { ejes: 'xy', suavidad: 0, alcance: 50, frente: { x: -90 },
                limites: { y: [-180, 180], x: [0, 180] } };
  const AUTO = (extra) => Object.assign({ pivote: 'auto' }, CFG, extra || {});
  // Mismo brazo de 1x2x1 bloques que §14, con un pivote en cada cara que interesa. Los numeros son
  // los que el editor pinta al lado: 1 = +X, 2 = -X, 3 = abajo.
  const dibujo = (pivotes) => {
    const v = {};
    v['0,0,0'] = '#fff';
    v['15,15,31'] = '#fff';
    return { voxels: v, pivotes: pivotes };
  };
  const P_MASX = [15, 8, 16], P_MENX = [0, 8, 16], P_ABAJO = [8, 8, 0];
  const OBJ_MENX = [0.5 / 16, 16.5 / 16, 8.5 / 16];
  let doc = dibujo([P_MASX, P_MENX]);
  global.getRoomData = (clave) => Promise.resolve(clave === BRAZO ? doc : { voxels: {} });
  const avisos = [];
  const esperar = () => new Promise(r => setImmediate(r));
  const cerca = (a, b) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  // El dibujo llega por red: los pivotes (y con ellos la config de cada uno) no existen hasta que
  // se resuelve la promesa, asi que hay que esperar DESPUES del define, igual que en §14.
  const definir = async (w, mirar) => {
    const cw = console.warn, cl = console.log;
    console.warn = (...a) => avisos.push(a.join(' '));
    console.log = () => {};
    try {
      const n = w.game.bloques.define(BRAZO, { mirar: mirar });
      await esperar();
      return n;
    } finally { console.warn = cw; console.log = cl; }
  };
  // Un mundo limpio (solo el suelo, en y=4) donde ir poniendo piezas y sus vecinos a mano.
  const mundo = () => {
    const w = montar({ sinEscalera: true, sinPlaca: true });
    const idx = global.mcIdx;
    w.roca = (x, y, z) => { w.mc.grid[idx(x, y, z)] = ID_ROCA; };
    w.quitar = (x, y, z) => { w.mc.grid[idx(x, y, z)] = 0; };
    // La huella YA girada, como mcOriDims (app.js:4181): con vuelco impar, altura y profundidad
    // se cambian el sitio. El aabb va de esquina a esquina, igual que en §14.
    w.pieza = (ox, oy, oz, rot) => {
      const d = ((rot >> 2) & 1) ? [1, 1, 2] : [1, 2, 1];
      const s = { key: BRAZO, ox: ox, oy: oy, oz: oz, rot: rot || 0,
                  aabb: [ox, oy, oz, ox + d[0], oy + d[1], oz + d[2]] };
      w.mc.structures.push(s);
      return s;
    };
    return w;
  };
  const mirando = (w) => { w.mc.pos[0] = 24; w.mc.pos[1] = 11; w.mc.pos[2] = 8.5; w.frames(1); };

  console.log('\nLa cara por la que se pega elige el pivote, instancia a instancia');
  {
    doc = dibujo([P_MASX, P_MENX]);
    const w = mundo();
    w.roca(12, 10, 6); w.roca(12, 11, 6);                 // el «cuerpo» al que se pegan los brazos
    const izq = w.pieza(11, 10, 6), der = w.pieza(13, 10, 6);
    const n = await definir(w, AUTO());
    mirando(w);
    t('dos piezas iguales pegadas por caras opuestas cogen pivotes distintos',
      izq._pivAuto === 1 && der._pivAuto === 2, 'izq nº' + izq._pivAuto + ' · der nº' + der._pivAuto);
    t('...y el punto que se usa es el de ESA cara',
      cerca(n.mirar.porPivote[der._pivAuto].piv, OBJ_MENX),
      JSON.stringify(n.mirar.porPivote[der._pivAuto].piv));
  }

  console.log('\nY manda en la POSE, no solo en la etiqueta');
  {
    // Lo unico que prueba que la eleccion sirve para algo: la matriz. Con el pivote automatico
    // tiene que salir exactamente la misma que escribiendo a mano el nº de la cara pegada.
    doc = dibujo([P_MASX, P_MENX]);
    const pose = async (mirar) => {
      const w = mundo();
      w.roca(12, 10, 6); w.roca(12, 11, 6);
      const s = w.pieza(13, 10, 6);
      await definir(w, mirar);
      mirando(w);
      return s.model && Array.from(s.model);
    };
    const auto = await pose(AUTO()), dos = await pose(Object.assign({ pivote: 2 }, CFG));
    const uno = await pose(Object.assign({ pivote: 1 }, CFG));
    t('la pose con pivote automático es la del nº2, el de la cara pegada',
      !!auto && !!dos && auto.every((v, i) => Math.abs(v - dos[i]) < 1e-9),
      JSON.stringify(auto) + ' vs ' + JSON.stringify(dos));
    t('...y NO la del nº1, el de la cara que queda al aire',
      !!uno && !!auto && auto.some((v, i) => Math.abs(v - uno[i]) > 1e-6));
  }

  console.log('\nNo tocar nada, o tocar por donde no hay pivote, no es un error');
  {
    doc = dibujo([P_MASX, P_MENX]);
    const w = mundo();
    const suelta = w.pieza(4, 12, 4);                     // en el aire, sin nada alrededor
    w.roca(8, 10, 5); w.roca(8, 11, 5);
    const deCanto = w.pieza(8, 10, 6);                    // pegada por -Z, y ahi no hay pivote dibujado
    await definir(w, AUTO());
    mirando(w);
    t('una pieza que no toca nada cae al nº1 (lo mismo que no poner pivote)',
      suelta._pivAuto === 1 && suelta._pivCara === -1,
      'nº' + suelta._pivAuto + ' · cara ' + suelta._pivCara);
    t('...y tocar por una cara SIN pivote dibujado tampoco cuenta',
      deCanto._pivAuto === 1 && deCanto._pivCara === -1,
      'nº' + deCanto._pivAuto + ' · cara ' + deCanto._pivCara);
  }

  console.log('\nCon varios contactos gana la cara con más superficie pegada');
  {
    doc = dibujo([P_MASX, P_MENX, P_ABAJO]);
    const w = mundo();
    w.roca(21, 10, 6);                                    // media cara por +X
    w.roca(19, 10, 6); w.roca(19, 11, 6);                 // la cara entera por -X
    const s = w.pieza(20, 10, 6);
    // Empate a una celda: por -X (la cara tiene dos) y por abajo (que tiene una y esta entera).
    w.roca(15, 10, 6); w.roca(16, 9, 6);
    const e = w.pieza(16, 10, 6);
    await definir(w, AUTO());
    mirando(w);
    t('media cara pegada pierde contra una cara entera', s._pivAuto === 2 && s._pivCara === 0,
      'nº' + s._pivAuto + ' · cara ' + s._pivCara);
    t('a igual superficie manda el suelo sobre los lados', e._pivAuto === 3 && e._pivCara === 2,
      'nº' + e._pivAuto + ' · cara ' + e._pivCara);
  }

  console.log('\nLa cara es la del MUNDO, con el giro Y el vuelco ya aplicados');
  {
    doc = dibujo([P_MASX, P_MENX, P_ABAJO]);
    const w = mundo();
    w.roca(9, 10, 6); w.roca(9, 11, 6);
    const derecha = w.pieza(10, 10, 6, 0);                // sin girar: su -X es el -X del mundo
    w.roca(9, 14, 6); w.roca(9, 15, 6);
    const alReves = w.pieza(10, 14, 6, 2);                // media vuelta: por ahi asoma su +X
    w.roca(6, 12, 7);
    const tumbada = w.pieza(6, 12, 8, 4);                 // vuelco de un cuarto: su «abajo» mira al -Z
    await definir(w, AUTO());
    mirando(w);
    t('media vuelta (rot 2) cambia qué cara del dibujo está pegada',
      derecha._pivAuto === 2 && alReves._pivAuto === 1,
      'derecha nº' + derecha._pivAuto + ' · al revés nº' + alReves._pivAuto);
    t('con vuelco (rot 4) el «abajo» del dibujo toca DE LADO y aun así es el pivote de abajo',
      tumbada._pivAuto === 3 && tumbada._pivCara === 4,
      'nº' + tumbada._pivAuto + ' · cara ' + tumbada._pivCara);
  }

  console.log('\nCada pivote con sus propios giros y límites');
  {
    doc = dibujo([P_MASX, P_MENX]);
    const w = mundo();
    w.roca(12, 10, 6); w.roca(12, 11, 6);
    const izq = w.pieza(11, 10, 6), der = w.pieza(13, 10, 6);
    // El hombro nº1 con el cono cerrado y el nº2 con el de siempre: mismo material, misma config,
    // y aun asi una pieza sigue al jugador y la otra se queda en su sitio.
    const n = await definir(w, AUTO({ pivotes: { 1: { limites: { y: [-5, 5] } } } }));
    mirando(w);
    t('el pivote nº1 se rinde por SU cono y el nº2 sigue mirando, con el mismo material',
      izq._mirarPor === 2 && der._mirarPor === 0,
      'izq por ' + izq._mirarPor + ' · der por ' + der._mirarPor);
    t('...y lo común (alcance, objetivo) no hay que repetirlo en cada bloque',
      n.mirar.vars[1].alcance === 50 && n.mirar.vars[1].objetivo === 'jugador');
    t('...y el bloque solo pisa lo suyo: la base se queda con su cono',
      n.mirar.vars[1].limY[1] === 5 && n.mirar.limY[1] === 180,
      n.mirar.vars[1].limY + ' vs ' + n.mirar.limY);
  }

  console.log('\nLos avisos dicen qué falta y dónde se pone');
  {
    doc = dibujo([P_MASX, P_MENX]);
    const w = mundo(); w.pieza(11, 10, 6);
    const antes = avisos.length;
    await definir(w, AUTO({ pivotes: { 3: { alcance: 4 } } }));
    const dicho = avisos.slice(antes).join(' ');
    t('un bloque para un pivote que el dibujo no trae avisa y dice con qué herramienta ponerlo',
      /nº3/.test(dicho) && /📍/.test(dicho), dicho);

    doc = dibujo([]);
    const w2 = mundo(); w2.pieza(11, 10, 6);
    const antes2 = avisos.length;
    await definir(w2, AUTO());
    t('pivote:"auto" sin ningún pivote dibujado avisa (y no rompe: gira sobre su centro)',
      /no tiene ningun pivote dibujado/.test(avisos.slice(antes2).join(' ')),
      avisos.slice(antes2).join(' '));

    const w3 = mundo(); w3.pieza(11, 10, 6);              // si no hay ninguna, la clave no existe aun
    const r = w3.sinRuido(() => w3.game.bloques.define(BRAZO, { mirar: Object.assign({ pivotes: [{}, {}] }, CFG) }));
    t('pivotes como lista se rechaza: se indexa por el NÚMERO que pinta el editor',
      r === null && /NUMERO del pivote|objeto \{ 1:/.test(w3.avisosConsola.join(' ')),
      w3.avisosConsola.slice(-1)[0]);
  }

  console.log('\nSi el mundo cambia, repivotar() vuelve a mirar contra qué está pegada cada pieza');
  {
    doc = dibujo([P_MASX, P_MENX]);
    const w = mundo();
    w.roca(12, 10, 6); w.roca(12, 11, 6);
    const s = w.pieza(11, 10, 6);
    await definir(w, AUTO());
    mirando(w);
    const antes = s._pivAuto;
    w.quitar(12, 10, 6); w.quitar(12, 11, 6);
    w.roca(10, 10, 6); w.roca(10, 11, 6);                 // ahora el cuerpo está al otro lado
    w.frames(1);
    t('el contacto se resuelve UNA vez: mover el mundo no lo recalcula por frame',
      s._pivAuto === antes, 'sigue en el nº' + s._pivAuto);
    w.sinRuido(() => w.game.bloques.repivotar());
    w.frames(1);
    t('...y repivotar() la pone al día', antes === 1 && s._pivAuto === 2,
      'antes nº' + antes + ' · ahora nº' + s._pivAuto);
  }

  {
    // Lo que salio en el Mundo de verdad y no en el de juguete: el brazo del dueno estaba definido
    // con `pivote:1`, y al redefinirlo con 'auto' desde la consola no se movia ni una pieza — el
    // numero elegido vive cacheado en la instancia y nadie lo borraba. Parecia que 'auto' no existia.
    doc = dibujo([P_MASX, P_MENX]);
    const w = mundo();
    w.roca(12, 10, 6); w.roca(12, 11, 6);
    const s = w.pieza(13, 10, 6);
    await definir(w, Object.assign({ pivote: 1 }, CFG));
    mirando(w);
    const conUno = s._pivAuto;
    await definir(w, AUTO());
    w.frames(1);
    t('redefinir el material vuelve a elegir pivote sin tener que llamar a repivotar()',
      conUno === 1 && s._pivAuto === 2, 'con pivote:1 era nº' + conUno + ' · con auto nº' + s._pivAuto);
  }

  console.log('\nRayos-X dice cuál le ha tocado a cada pieza y por qué cara');
  {
    // Dos piezas del mismo material girando distinto parecen un error hasta que la etiqueta dice
    // por que: sin esto, la funcion pedida se lee como un fallo.
    doc = dibujo([P_MASX, P_MENX]);
    const w = mundo();
    w.roca(12, 10, 6); w.roca(12, 11, 6);
    const der = w.pieza(13, 10, 6);
    const suelta = w.pieza(4, 12, 4);
    await definir(w, AUTO());
    mirando(w);
    t('la etiqueta de la pieza pegada nombra el pivote y la cara',
      /pivote nº2 \(pegada por -X\)/.test(global.mcXrayExtra(BRAZO, der)), global.mcXrayExtra(BRAZO, der));
    t('...y la que no toca nada lo dice, en vez de fingir que eligió',
      /no toca nada/.test(global.mcXrayExtra(BRAZO, suelta)), global.mcXrayExtra(BRAZO, suelta));
    t('lista() avisa de que ese material lleva el pivote automático',
      /pivote automático/.test(JSON.stringify(w.sinRuido(() => w.game.bloques.lista()))));
  }

  console.log('\nReejecutar el snippet no pierde lo escrito a mano');
  {
    doc = dibujo([P_MASX, P_MENX]);
    const w = mundo();
    w.roca(12, 10, 6); w.roca(12, 11, 6);
    w.pieza(13, 10, 6);
    const n = await definir(w, AUTO({ sentido: { x: -1 }, pivotes: { 2: { limites: { y: [-5, 5] } } } }));
    // Esto es literalmente lo que hace el bloque `heredado` del final del snippet: re-definir con el
    // cfg YA NORMALIZADO. Si la normalizacion no sabe leerse a si misma, lo definido en la consola
    // se degrada solo al reejecutar y la pieza cambia de postura sin que nadie haya tocado nada.
    const m = w.sinRuido(() => w.game.bloques.define(BRAZO, n)).mirar;
    t('el pivote automático sobrevive a la reejecución', m.pivAuto === true);
    t('...y los giros propios de cada pivote también', !!m.vars && m.vars[2].limY[1] === 5,
      JSON.stringify(m.vars && m.vars[2] && m.vars[2].limY));
    t('...y el frente VERTICAL, que es lo que hace apuntar a un brazo en vez de solo inclinarse',
      m.frenteX === -90, String(m.frenteX));
    t('...y el sentido invertido', m.senX === -1, String(m.senX));
  }
}

// §16 'seguir': la pieza se DESPLAZA. Es la primera capacidad que mueve una estructura de sitio, y
// mover una estructura en este motor tiene dos mitades que se pueden desincronizar: lo que se VE (la
// matriz s.model, que app.js ya respeta al dibujar y al cullear) y lo que se TOCA (el bitset fino,
// que app.js sondea con base s.ox y no tiene ni idea de la matriz). Casi todo lo de aqui abajo mide
// que las dos mitades siguen pegadas: que choca donde se la ve y NO donde estaba.
const GUARDIAN = 'hab:guardian', GUARDIAN2 = 'hab:guardian2';
// §17 necesita EXACTAMENTE el mismo mundo de juguete que §16 (las globales que 'seguir' envuelve,
// mcCollides de verdad, suelo de roca en y=4): un esqueleto no es mas que varias piezas de 'seguir'
// pegadas. En vez de duplicar el montaje, §16 lo deja aqui al empezar.
let utilSeguir = null;
function geomCubo() {                                     // 1x1x1 macizo en voxeles finos
  const fdim = [T, T, T], bits = new Uint8Array(T * T * T).fill(1);
  return { fdim, bits };
}
async function seccionSeguir() {
  GEOM[GUARDIAN] = geomCubo(); GEOM[GUARDIAN2] = geomCubo();

  // El mundo de juguete de §15 no trae las globales que 'seguir' necesita (mcSolid, mcSurfaceNear,
  // mcFineBoxHit, mcStructAt): son justo las que el snippet envuelve, asi que aqui se montan con la
  // MISMA forma que en app.js. Y se montan ANTES de montar(), porque el snippet se ejecuta dentro y
  // envuelve lo que encuentre. Ojo con mcCollides: el de montar() llama a su copia local de
  // mcFineBoxHit, que se salta el envoltorio; se sustituye para que la prueba pase por donde de
  // verdad pasa el jugador.
  const globales = () => {
    global.mcSolid = (x, y, z) => y < 0 ? true
      : (global.mcInside(x, y, z) ? global.mc.grid[global.mcIdx(x, y, z)] !== 0 : false);
    global.mcSurfaceNear = (x, z, y0, climb, drop) => {    // calco de app.js:7093
      if (!global.mcInside(x, 0, z)) return -1;
      const H = DIM.y, maxUp = climb === undefined ? 1 : climb, maxDown = drop === undefined ? 3 : drop;
      for (let d = 0; d <= Math.max(maxUp, maxDown); d++) {
        const cand = [];
        if (d <= maxUp) cand.push(y0 + d);
        if (d > 0 && d <= maxDown) cand.push(y0 - d);
        for (const y of cand) {
          if (y < 0 || y >= H) continue;
          if (global.mc.grid[global.mcIdx(x, y, z)] && (y + 1 >= H || !global.mc.grid[global.mcIdx(x, y + 1, z)])) return y;
        }
      }
      return -1;
    };
    global.mcFineBoxHit = (fx0, fy0, fz0, fx1, fy1, fz1) => {   // calco de app.js:5060
      for (const s of global.mc.structures) {
        const g = global.mcStructColl(s); if (!g) continue;     // ← la global, para que el envoltorio cuente
        const d = g.fdim, bx = s.ox * T, by = s.oy * T, bz = s.oz * T;
        const x0 = Math.max(fx0 - bx, 0), x1 = Math.min(fx1 - bx, d[0] - 1); if (x0 > x1) continue;
        const y0 = Math.max(fy0 - by, 0), y1 = Math.min(fy1 - by, d[1] - 1); if (y0 > y1) continue;
        const z0 = Math.max(fz0 - bz, 0), z1 = Math.min(fz1 - bz, d[2] - 1); if (z0 > z1) continue;
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) if (g.bits[(y * d[2] + z) * d[0] + x]) return true;
      }
      return false;
    };
    global.mcStructAt = (px, py, pz) => {                       // calco de app.js:5794
      const fx = Math.floor(px * T), fy = Math.floor(py * T), fz = Math.floor(pz * T);
      for (const s of global.mc.structures) {
        const g = global.mcStructColl(s); if (!g) continue;
        const d = g.fdim, lx = fx - s.ox * T, ly = fy - s.oy * T, lz = fz - s.oz * T;
        if (lx < 0 || ly < 0 || lz < 0 || lx >= d[0] || ly >= d[1] || lz >= d[2]) continue;
        if (g.bits[(ly * d[2] + lz) * d[0] + lx]) return s;
      }
      return null;
    };
  };
  const colisionDeVerdad = () => {                          // calco de app.js:5090, via la global envuelta
    global.mcCollides = (px, py, pz) => {
      const HW = 0.3 * global.mc.scale, PH = 1.8 * global.mc.scale;
      for (let x = Math.floor(px - HW); x <= Math.floor(px + HW); x++)
        for (let y = Math.floor(py); y <= Math.floor(py + PH - 1e-4); y++)
          for (let z = Math.floor(pz - HW); z <= Math.floor(pz + HW); z++)
            if (global.mcInside(x, y, z) && global.mc.grid[global.mcIdx(x, y, z)]) return true;
      return global.mcFineBoxHit(Math.floor((px - HW) * T), Math.floor(py * T), Math.floor((pz - HW) * T),
                                 Math.floor((px + HW) * T), Math.floor((py + PH - 1e-4) * T), Math.floor((pz + HW) * T));
    };
  };
  // Suelo de roca en y=4, o sea que se pisa a partir de y=5. Las piezas son cubos de 1x1x1.
  const mundo = () => {
    globales();
    const w = montar({ sinEscalera: true, sinPlaca: true });
    colisionDeVerdad();
    const idx = global.mcIdx;
    w.roca = (x, y, z) => { w.mc.grid[idx(x, y, z)] = ID_ROCA; };
    w.quitar = (x, y, z) => { w.mc.grid[idx(x, y, z)] = 0; };
    w.pieza = (ox, oz, clave) => {
      const s = { key: clave || GUARDIAN, ox: ox, oy: 5, oz: oz, rot: 0,
                  aabb: [ox, 5, oz, ox + 1, 6, oz + 1] };
      w.mc.structures.push(s);
      return s;
    };
    w.jugador = (x, z) => { w.mc.pos[0] = x; w.mc.pos[1] = 5; w.mc.pos[2] = z; };
    w.def = (clave, cfg) => w.sinRuido(() => w.game.bloques.define(clave, cfg));
    return w;
  };
  const centro = (s) => {
    const a = s.aabb, g = s._sig || { x: 0, y: 0, z: 0 };
    return [(a[0] + a[3]) / 2 + g.x, (a[1] + a[4]) / 2 + g.y, (a[2] + a[5]) / 2 + g.z];
  };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // Con ejes:'xz' el motor mide en planta, asi que el test tambien: si midiera en 3D estaria
  // exigiendo una distancia que depende del alto de la pieza, no la que se le pidio.
  const planta = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const alJugador = (s, w) => planta(centro(s), w.mc.pos);
  const ido = (s) => { const g = s._sig || { x: 0, y: 0, z: 0 }; return Math.hypot(g.x, g.y, g.z); };
  // Sin suavizado el paso es velocidad*dt limpio: las cuentas del test son las del motor, no una
  // exponencial que hay que perseguir con margenes.
  const SIGO = { objetivo: 'jugador', deteccion: 20, distancia: 2.5, velocidad: 12, suavidad: 0, correa: 0 };
  const cfg = (extra) => Object.assign({}, SIGO, extra || {});
  utilSeguir = { mundo, centro, planta, ido };   // §17 monta su mundo con esto mismo

  console.log('\nPersigue al jugador y se para a la distancia que se le pide');
  {
    const w = mundo();
    const s = w.pieza(6, 10);
    w.jugador(16, 10.5);
    w.def(GUARDIAN, { seguir: cfg() });
    const antes = alJugador(s, w);
    w.frames(120);
    t('la pieza se ha acercado al jugador', alJugador(s, w) < antes - 5,
      antes.toFixed(2) + ' → ' + alJugador(s, w).toFixed(2));
    t('...y se para A la distancia pedida, no encima', Math.abs(alJugador(s, w) - 2.5) < 0.05,
      alJugador(s, w).toFixed(3));
    const parada = ido(s);
    w.frames(60);
    t('...y ahi se queda: llegar no es rebasar y volver', Math.abs(ido(s) - parada) < 1e-6);
    t('el ancla NO se toca: es lo que se guarda en mundo.json', s.ox === 6 && s.oy === 5 && s.oz === 10,
      s.ox + ',' + s.oy + ',' + s.oz);
    t('y el desplazamiento va en la matriz, en la última columna',
      !!s.model && Math.abs(s.model[12] - s._sig.x) < 1e-6 && Math.abs(s.model[14] - s._sig.z) < 1e-6);
    // Acercarse mas de la cuenta: la distancia es un SITIO donde estar, no un minimo.
    w.jugador(centro(s)[0] + 1, 10.5);
    w.frames(60);
    t('si te le acercas de más, retrocede hasta su distancia', Math.abs(alJugador(s, w) - 2.5) < 0.15,
      alJugador(s, w).toFixed(3));
  }

  console.log('\nLa detección es un radio: fuera no arranca, y al salir se vuelve al ancla');
  {
    const w = mundo();
    const s = w.pieza(6, 10);
    w.jugador(20, 10.5);                                   // a 14 de la pieza, con deteccion 8
    w.def(GUARDIAN, { seguir: cfg({ deteccion: 8, volver: true }) });
    w.frames(60);
    t('fuera del radio de detección no se mueve', ido(s) < 1e-6, ido(s).toFixed(3));
    t('...y lo dice: "fuera de alcance"', s._sig.por === 1, String(s._sig.por));
    w.jugador(11, 10.5);                                   // ahora a ~4.5: dentro
    w.frames(60);
    t('al entrar en el radio, arranca', ido(s) > 1.5, ido(s).toFixed(2));
    t('...y lo dice: "persiguiendo"', s._sig.por === 0, String(s._sig.por));
    w.jugador(23, 10.5);                                   // fuera otra vez
    w.frames(180);
    t('al salir del radio se rinde y vuelve al ancla', ido(s) < 1e-6, ido(s).toFixed(3));
    t('...y en el ancla se QUITA la matriz, para que app.js recupere su camino corto', s.model === null);
  }
  {
    const w = mundo();
    const s = w.pieza(6, 10);
    w.jugador(20, 10.5);
    w.def(GUARDIAN, { seguir: cfg({ deteccion: 8, volver: false }) });
    w.frames(30);
    w.jugador(11, 10.5); w.frames(60);
    const donde = ido(s);
    w.jugador(23, 10.5); w.frames(120);
    t('con volver:false se queda donde la dejaste', Math.abs(ido(s) - donde) < 1e-6,
      donde.toFixed(2) + ' → ' + ido(s).toFixed(2));
  }

  console.log('\nLa correa: no se aleja del ancla más de lo que se le deja');
  {
    const w = mundo();
    const s = w.pieza(6, 10);
    w.jugador(20, 10.5);
    w.def(GUARDIAN, { seguir: cfg({ deteccion: 0, correa: 3 }) });   // deteccion 0 = siempre
    w.frames(180);
    t('la correa pinza el desplazamiento', Math.abs(ido(s) - 3) < 0.05, ido(s).toFixed(3));
    t('...y lo dice: "con la correa tensa"', s._sig.por === 2, String(s._sig.por));
    t('deteccion:0 es "siempre", no "nunca"', ido(s) > 2.9);
  }

  console.log('\nUna pieza puede seguir a OTRA, y dos que se persiguen no cuelgan el frame');
  {
    const w = mundo();
    const b = w.pieza(8, 10, GUARDIAN2);                   // B sigue al jugador
    const a = w.pieza(4, 10, GUARDIAN);                    // A sigue a B
    w.jugador(20, 10.5);
    w.def(GUARDIAN2, { seguir: cfg({ objetivo: 'jugador', distancia: 2.5 }) });
    w.def(GUARDIAN, { seguir: cfg({ objetivo: GUARDIAN2, distancia: 1.5 }) });
    w.frames(240);
    t('la cadena A→B→jugador se resuelve entera', Math.abs(planta(centro(b), w.mc.pos) - 2.5) < 0.2,
      planta(centro(b), w.mc.pos).toFixed(2));
    t('...y A se queda a su distancia de B, no de ti', Math.abs(dist(centro(a), centro(b)) - 1.5) < 0.2,
      dist(centro(a), centro(b)).toFixed(2));
  }
  {
    const w = mundo();
    const a = w.pieza(4, 10, GUARDIAN), b = w.pieza(14, 10, GUARDIAN2);
    w.jugador(2, 2);
    w.def(GUARDIAN, { seguir: cfg({ objetivo: GUARDIAN2, deteccion: 0, distancia: 2 }) });
    w.def(GUARDIAN2, { seguir: cfg({ objetivo: GUARDIAN, deteccion: 0, distancia: 2 }) });
    w.frames(300);                                         // si el ciclo colgara, esto no volveria
    t('A↔B mutuo no cuelga y converge a su distancia', Math.abs(dist(centro(a), centro(b)) - 2) < 0.3,
      dist(centro(a), centro(b)).toFixed(2));
    t('...sin dispararse a ningún lado', isFinite(ido(a)) && isFinite(ido(b)) && ido(a) < 12 && ido(b) < 12,
      ido(a).toFixed(1) + ' / ' + ido(b).toFixed(1));
    // Una pieza no se persigue a si misma: si lo hiciera, la instancia mas cercana de su propia clave
    // seria ella y se quedaria intentando ponerse a `distancia` de su propio centro, para siempre.
    const w2 = mundo();
    const solo = w2.pieza(6, 10);
    w2.jugador(2, 2);
    w2.def(GUARDIAN, { seguir: cfg({ objetivo: GUARDIAN, deteccion: 0 }) });
    w2.frames(60);
    t('una pieza sola que persigue a su propia clave se queda quieta', ido(solo) < 1e-6, ido(solo).toFixed(3));
  }

  console.log('\nCon ejes:"xz" la Y la manda el suelo, no el objetivo');
  {
    const w = mundo();
    for (let x = 10; x < 20; x++) for (let z = 8; z < 13; z++) w.roca(x, 5, z);   // meseta de un bloque
    const s = w.pieza(6, 10);
    w.jugador(16, 10.5);
    w.def(GUARDIAN, { seguir: cfg({ velocidad: 4 }) });
    w.frames(300);
    t('sube el escalón de roca en vez de estrellarse contra él', s._sig.y > 0.9 && s._sig.y < 1.1,
      s._sig.y.toFixed(2));
    t('...y sigue llegando a su distancia', Math.abs(alJugador(s, w) - 2.5) < 0.2, alJugador(s, w).toFixed(2));
  }
  {
    const w = mundo();
    for (let x = 9; x < 14; x++) for (let z = 8; z < 13; z++) w.quitar(x, 4, z);  // abismo
    const s = w.pieza(6, 10);
    w.jugador(20, 10.5);
    w.def(GUARDIAN, { seguir: cfg({ velocidad: 4 }) });
    w.frames(300);
    // El abismo va de x=9 a x=13. Se asoma (la huella puede volar sobre el vacío mientras le quede
    // una columna con suelo, como un bloque en un borde) pero no lo cruza: sin pathing no hay puente.
    t('no se tira por un abismo: se asoma al borde y ahí se queda', centro(s)[0] < 9.6,
      centro(s)[0].toFixed(2));
    t('...y no se cae (la Y sigue siendo la del suelo de partida)', Math.abs(s._sig.y) < 1e-6,
      s._sig.y.toFixed(3));
    t('...y lo dice: "bloqueada"', s._sig.por === 3, String(s._sig.por));
  }

  console.log('\nNo atraviesa el terreno: se para y resbala por la pared');
  {
    const w = mundo();
    for (let y = 5; y < 9; y++) for (let z = 0; z < DIM.z; z++) w.roca(10, y, z);  // muro alto en x=10
    const s = w.pieza(6, 10);
    w.jugador(16, 10.5);
    w.def(GUARDIAN, { seguir: cfg({ velocidad: 4 }) });
    w.frames(240);
    t('un muro más alto de lo que sube la para', centro(s)[0] < 10, centro(s)[0].toFixed(2));
    t('...y NO se ha metido dentro del muro', !global.mcSolid(Math.floor(centro(s)[0]), 5, Math.floor(centro(s)[2])));
  }
  {
    // Muro corto: la X esta cerrada pero la Z no. Resbalar es que el eje libre siga avanzando.
    const w = mundo();
    for (let y = 5; y < 9; y++) for (let z = 9; z < 12; z++) w.roca(10, y, z);
    const s = w.pieza(6, 10);
    w.jugador(16, 4.5);                                    // detras del muro y desplazado en Z
    w.def(GUARDIAN, { seguir: cfg({ velocidad: 4 }) });
    w.frames(240);
    t('con la X cerrada, resbala por la Z en vez de clavarse', centro(s)[2] < 8.5,
      centro(s)[2].toFixed(2));
    t('...y acaba rodeando el muro', centro(s)[0] > 10, centro(s)[0].toFixed(2));
  }

  console.log('\nLo que se ve y lo que se toca: la pieza es sólida DONDE SE LA VE');
  {
    const w = mundo();
    const s = w.pieza(6, 10);
    w.jugador(16, 10.5);
    w.def(GUARDIAN, { seguir: cfg() });
    w.frames(120);
    const c = centro(s), anc = [6.5, 5.5, 10.5];
    t('la pieza se ha ido del ancla', dist(c, anc) > 3, dist(c, anc).toFixed(2));
    t('choca donde se la VE', global.mcCollides(c[0], 5, c[2]));
    t('...y ya NO choca en el ancla, donde no hay nada que ver', !global.mcCollides(anc[0], 5, anc[2]));
    t('mcStructAt la encuentra en su sitio nuevo (para romperla donde está)',
      global.mcStructAt(c[0], c[1], c[2]) === s);
    t('...y no la encuentra en el ancla', global.mcStructAt(anc[0], anc[1], anc[2]) === null);
    // Y no te embute: la pieza para antes de solapar tu caja, no te expulsa el motor.
    t('no te ha metido dentro: el jugador no está en colisión',
      !global.mcCollides(w.mc.pos[0], w.mc.pos[1], w.mc.pos[2]));
    // Recogerla la devuelve al ancla, y con ella la solidez — en el acto, sin esperar un frame: si
    // hiciera falta un frame habria un instante en que la pieza no choca ni donde estaba ni donde
    // esta. (Y despues sigue teniendo su cfg, asi que vuelve a arrancar: recoger no es apagar.)
    w.sinRuido(() => w.game.bloques.recoger());
    t('recoger() la devuelve al ancla en el acto', ido(s) < 1e-6);
    t('...y la solidez vuelve con ella, sin un frame de fantasma',
      global.mcCollides(anc[0], 5, anc[2]) && !global.mcCollides(c[0], 5, c[2]));
    w.frames(60);
    t('...pero no la apaga: con su cfg puesto, vuelve a perseguirte', ido(s) > 3, ido(s).toFixed(2));
  }

  console.log('\n"seguir" y "mirar" en la misma pieza: gira Y se desplaza');
  {
    const w = mundo();
    const s = w.pieza(6, 10);
    w.jugador(16, 10.5);
    w.def(GUARDIAN, { seguir: cfg(), mirar: { objetivo: 'jugador', ejes: 'y', suavidad: 0, alcance: 50 } });
    w.frames(120);
    const m = s.model;
    // La composición correcta es girar sobre el pivote y DESPUÉS trasladar. m[12..14] no es el
    // desplazamiento a secas (matrizGiro ya mete ahí la compensación del pivote), así que lo que se
    // mide es el efecto: sin pivote propio se gira sobre el centro, o sea que el centro del ancla
    // pasado por la matriz tiene que caer justo en el centro desplazado. Al revés (trasladar y luego
    // girar) la pieza orbitaría el pivote en vez de perseguir, y esto lo cazaría.
    const a = s.aabb, c0 = [(a[0] + a[3]) / 2, (a[1] + a[4]) / 2, (a[2] + a[5]) / 2];
    const pasado = !m ? null : [0, 1, 2].map(r => m[r] * c0[0] + m[4 + r] * c0[1] + m[8 + r] * c0[2] + m[12 + r]);
    t('la matriz lleva la pieza a donde dice el desplazamiento', !!pasado
      && dist(pasado, centro(s)) < 1e-4, pasado ? pasado.map(v => v.toFixed(2)).join(',') : 'sin matriz');
    t('...y el giro sigue estando (la matriz no es una traslación pura)',
      !!m && (Math.abs(m[0] - 1) > 1e-3 || Math.abs(m[2]) > 1e-3),
      m ? m[0].toFixed(3) + '/' + m[2].toFixed(3) : 'sin matriz');
    t('...y aun así se acerca a su distancia', Math.abs(alJugador(s, w) - 2.5) < 0.2,
      alJugador(s, w).toFixed(2));
  }

  console.log('\nReejecutar el snippet no apila envoltorios ni acelera la persecución');
  {
    const w = mundo();
    const s = w.pieza(6, 10);
    w.jugador(20, 10.5);
    w.def(GUARDIAN, { seguir: cfg({ velocidad: 6 }) });
    w.frames(1);
    const paso1 = ido(s);
    w.recargar();
    w.def(GUARDIAN, { seguir: cfg({ velocidad: 6 }) });     // el dueño reejecuta y vuelve a definir
    const antes = ido(s);
    w.frames(1);
    t('un frame avanza lo mismo después de reejecutar', Math.abs((ido(s) - antes) - paso1) < 1e-3,
      paso1.toFixed(4) + ' vs ' + (ido(s) - antes).toFixed(4));
    t('los envoltorios de colisión no se apilan',
      global.mcFineBoxHit._orig && !global.mcFineBoxHit._orig._seguir);
    t('...ni el de mcStructColl', global.mcStructColl._orig && !global.mcStructColl._orig._seguir);
    t('...ni el de mcStructAt', global.mcStructAt._orig && !global.mcStructAt._orig._seguir);
    // Y la normalizacion tiene que saber leerse a si misma: el snippet re-define con el cfg YA
    // normalizado al heredar la tabla, y si eso cambiara los numeros la pieza cambiaria de velocidad
    // sola en cada recarga (ya paso con senX/senY de 'mirar').
    w.pieza(2, 2, GUARDIAN2);                              // para que el objetivo por clave resuelva
    const n1 = w.def(GUARDIAN, { seguir: cfg({ velocidad: 6, objetivo: GUARDIAN2 }) }).seguir;
    const n2 = w.def(GUARDIAN, { seguir: n1 }).seguir;
    t('el cfg normalizado se puede volver a normalizar sin cambiar', JSON.stringify(n1) === JSON.stringify(n2),
      JSON.stringify(n1) + ' vs ' + JSON.stringify(n2));
  }

  console.log('\nQuitar el comportamiento recoge la pieza: nada de fantasmas permanentes');
  {
    const w = mundo();
    const s = w.pieza(6, 10);
    w.jugador(16, 10.5);
    w.def(GUARDIAN, { seguir: cfg() });
    w.frames(120);
    t('(de partida está desplazada)', ido(s) > 3);
    w.sinRuido(() => w.game.bloques.quitar(GUARDIAN));
    w.frames(2);
    t('al quitar "seguir" la pieza vuelve al ancla', ido(s) < 1e-6 && !s._sig);
    t('...y vuelve a ser sólida ahí', global.mcCollides(6.5, 5, 10.5));
    t('...y se le quita la matriz', s.model === null);
  }
  {
    const w = mundo();
    const s = w.pieza(6, 10);
    w.jugador(16, 10.5);
    w.def(GUARDIAN, { seguir: cfg() });
    w.frames(120);
    w.def(GUARDIAN, { trepable: true });                    // redefinir SIN seguir
    w.frames(2);
    t('redefinir sin "seguir" también la recoge', ido(s) < 1e-6 && !s._sig);
  }

  console.log('\nSustituir las instancias (mcRestampAll) no deja piezas muertas moviéndose');
  {
    const w = mundo();
    const viejo = w.pieza(6, 10);
    w.jugador(16, 10.5);
    w.def(GUARDIAN, { seguir: cfg() });
    w.frames(120);
    const donde = ido(viejo);
    // Esto es lo que hace mcRestampAll: la lista se rehace con instancias NUEVAS y las viejas se tiran.
    w.mc.structures.length = 0;
    const nuevo = w.pieza(6, 10);
    w.frames(1);
    t('la instancia nueva arranca en su ancla, no hereda el desplazamiento', ido(nuevo) < 0.5,
      ido(nuevo).toFixed(3));
    t('...y a la vieja, fuera de la lista, ya no la toca nadie', Math.abs(ido(viejo) - donde) < 1e-6);
  }

  console.log('\nLo que "seguir" NO acepta lo dice, en vez de moverse raro');
  {
    const w = mundo();
    w.pieza(6, 10);
    // El aviso se recoge y se juzga DESPUÉS de devolver la consola: si t() imprimiera con la consola
    // amordazada, la sección entera saldría en blanco y parecería que no hay pruebas.
    const prueba = (cfgMalo) => {
      const avisos = [];
      const cw = console.warn, cl = console.log;
      console.warn = (...a) => avisos.push(a.join(' ')); console.log = () => {};
      let r;
      try { r = w.game.bloques.define(cfgMalo.clave || GUARDIAN, cfgMalo.cfg); }
      finally { console.warn = cw; console.log = cl; }
      return { r, aviso: avisos.join(' | ') };
    };
    let p = prueba({ clave: 'asset:assets/roca.vox.json', cfg: { seguir: { objetivo: 'jugador' } } });
    t('seguir en un material que no es estructura se rechaza', p.r === null && /ESTRUCTURAS/.test(p.aviso), p.aviso);
    p = prueba({ cfg: { seguir: { objetivo: 'hab:no-existe' } } });
    t('un objetivo que no existe se rechaza, y dice cuál', p.r === null && /no-existe/.test(p.aviso), p.aviso);
    p = prueba({ cfg: { seguir: { ejes: 'x' } } });
    t('ejes:"x" se rechaza: perseguir en un solo eje no es perseguir', p.r === null && /ejes/.test(p.aviso), p.aviso);
    p = prueba({ cfg: { seguir: { deteccion: 4, distancia: 6 } } });
    t('distancia mayor que detección avisa de que así no se movería nunca',
      /no se movera nunca/.test(p.aviso), p.aviso);
    p = prueba({ cfg: {} });
    t('un define vacío sigue avisando de que no hace nada, ahora nombrando seguir',
      /seguir/.test(p.aviso), p.aviso);
  }

  console.log('\nEl informe cuenta quién persigue a quién y por qué está parada');
  {
    const w = mundo();
    const s = w.pieza(6, 10);
    w.jugador(20, 10.5);
    w.def(GUARDIAN, { seguir: cfg({ deteccion: 0, correa: 3 }) });
    w.frames(180);
    const filas = w.sinRuido(() => w.game.bloques.seguidores());
    t('seguidores() lista la pieza con su ancla y su estado',
      filas.length === 1 && filas[0].ancla === '6,5,10' && filas[0].estado === 'con la correa tensa',
      JSON.stringify(filas[0]));
    t('...y dice que es sólida donde se la ve', filas[0].solida_donde_se_ve === true);
    const res = w.sinRuido(() => w.game.bloques.lista()).find(f => f.clave === GUARDIAN).comportamiento;
    t('lista() cuenta a quién persigue y con qué números', /seguir a el jugador/.test(res)
      && /correa 3/.test(res), res);
    // La cuarta linea de rayos-X: dos piezas iguales, una pegada al jugador y otra parada a medio
    // camino, y por que no se adivina mirando la pantalla.
    const etiqueta = global.mcXrayExtra(GUARDIAN, s);
    t('la etiqueta de rayos-X dice cuánto se ha ido y por qué está parada',
      /seguir: a 3 del ancla/.test(etiqueta) && /correa tensa/.test(etiqueta), etiqueta);
  }
}

// ── §17 Esqueletos: un agente articulado (y el primero es el zombie) ───────────────────────────
// 'seguir' mueve UNA pieza; un esqueleto mueve SEIS y tiene que hacerlas parecer un solo bicho. Lo
// que se prueba aqui no es que se dibuje (eso es cosa de test_esqueleto_navegador.js), sino las
// cuatro cosas que se rompen sin que nadie las vea:
//   · que las piezas sigan siendo un CUERPO RIGIDO (dos centros de giro mal compuestos y el brazo
//     se despega del hombro en cuanto el cuerpo gira);
//   · que el vaiven vaya con la DISTANCIA RECORRIDA y no con el reloj (pedalear contra una pared);
//   · que `andando` (se mueve) y `activo` (te ve) sean DOS interruptores distintos — confundirlos es
//     el zombie que se desliza de lado con las piernas rectas al volverse a su sitio (v1.20);
//   · que sobrevivan a un mcRestampAll, que sustituye cada instancia por otra nueva.
// Se prueba con el DOCUMENTO DE VERDAD (el de agente-zombie.json) y con los ASSETS DE VERDAD: si
// alguien regenera las piezas con otras medidas o mueve un pivote, esto se entera.
const CLAVE_Z = (n) => 'asset:assets/' + n + '-zombie.vox.json';
const DOCS_Z = {};
function cargarPiezasZombie() {
  for (const n of ['torso', 'cabeza', 'brazo', 'pierna']) {
    const clave = CLAVE_Z(n), doc = JSON.parse(fs.readFileSync('assets/' + n + '-zombie.vox.json', 'utf8'));
    DOCS_Z[clave] = doc;
    // El editor es Z-arriba y el Mundo Y-arriba: el `y` del dibujo es la PROFUNDIDAD (mcStructGeom).
    // Aqui solo importan las MEDIDAS y que la caja este llena; la orientacion del dibujo no se prueba.
    const s = doc.size, fdim = [s.x, s.z, s.y];
    const bits = new Uint8Array(fdim[0] * fdim[1] * fdim[2]);
    for (const k in doc.voxels) {
      const q = k.split(','), ax = +q[0], ay = +q[1], az = +q[2];
      bits[(az * fdim[2] + ay) * fdim[0] + ax] = 1;
    }
    GEOM[clave] = { fdim, bits };
  }
  global.getRoomData = (clave) => Promise.resolve(DOCS_Z[clave] || null);
}
// El documento del zombie sale del SNIPPET, no de una copia: una replica en el test daria verde con
// el zombie de verdad roto. Se recorta el trozo que va de las constantes al cierre del literal.
function docZombie() {
  const codigo = JSON.parse(fs.readFileSync('data/snippets/agente-zombie.json', 'utf8')).code;
  const i = codigo.indexOf('const CENTRO_X'), j = codigo.indexOf('\n};', codigo.indexOf('const ZOMBIE'));
  if (i < 0 || j < 0) throw new Error('§17 no encuentra el documento ZOMBIE dentro de agente-zombie.json');
  return new Function(codigo.slice(i, j + 3) + '\nreturn ZOMBIE;')();
}

async function seccionEsqueletos() {
  cargarPiezasZombie();
  const ZOMBIE = docZombie();
  const GRADO = Math.PI / 180;
  const wrap = (a) => { a %= 360; if (a > 180) a -= 360; if (a < -180) a += 360; return a; };

  // El mundo de §16 mas lo unico que un esqueleto necesita de mas: estampar y retirar piezas.
  const mundoZ = () => {
    const w = utilSeguir.mundo();
    global.mcStampStruct = (clave, x, y, z, rot) => {
      const g = GEOM[clave];
      if (!g) throw new Error('§17: no hay geometria de juguete para ' + clave);
      const d = g.fdim;
      w.mc.structures.push({ key: clave, ox: x, oy: y, oz: z, rot: (rot | 0) & 15,
                             aabb: [x, y, z, x + d[0] / T, y + d[1] / T, z + d[2] / T] });
      return Promise.resolve();          // como en app.js: no devuelve la instancia, hay que buscarla
    };
    global.mcRemoveStruct = (s) => {
      const i = w.mc.structures.indexOf(s);
      if (i >= 0) w.mc.structures.splice(i, 1);
    };
    return w;
  };
  const crear = async (w, x, y, z, def) => {
    const l = console.log, n = console.warn;                 // crear() se presenta por consola
    console.log = (...a) => w.avisosConsola.push(a.join(' '));
    console.warn = (...a) => w.avisosConsola.push(a.join(' '));
    try { return await w.game.esqueletos.crear(def || ZOMBIE, x, y, z); }
    finally { console.log = l; console.warn = n; }
  };
  // mcRestampAll sustituye CADA instancia por otra nueva en el mismo indice, sin _rig, sin _sig, sin
  // efimera y sin matriz. Es exactamente lo que pasa al terminar de cargar el mundo.
  const restampar = (w) => {
    const ests = w.mc.structures, viejas = ests.slice();
    for (let i = 0; i < ests.length; i++) {
      const v = ests[i];
      ests[i] = { key: v.key, ox: v.ox, oy: v.oy, oz: v.oz, rot: v.rot, aabb: v.aabb.slice() };
    }
    return viejas;
  };

  // El punto FIJO de cada pieza: su pivote si articula (el hombro, la cadera) y si no el centro de
  // su caja. Es el punto que su propio giro NO mueve, o sea por donde cuelga del cuerpo. Con rot=0
  // puntoPivote(a,0,piv) es a[min]+piv, que es lo que se calcula aqui.
  const anclaLocal = (P) => {
    const a = P.s.aabb;
    return P.piv ? [a[0] + P.piv[0], a[1] + P.piv[1], a[2] + P.piv[2]]
                 : [(a[0] + a[3]) / 2, (a[1] + a[4]) / 2, (a[2] + a[5]) / 2];
  };
  const conMatriz = (P, p) => {
    const m = P.s.model;
    if (!m) return p.slice();
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
            m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
            m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  };
  const armazon = (rig) => rig.partes.map((P) => conMatriz(P, anclaLocal(P)));
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // La direccion a la que apunta una pieza, medida sobre la matriz de verdad (dos puntos y una
  // resta): asi el test no tiene que reproducir el convenio de columnas de matrizGiro.
  const frente = (P) => {
    const o = conMatriz(P, [0, 0, 0]), f = conMatriz(P, [0, 0, -1]);
    return [f[0] - o[0], f[1] - o[1], f[2] - o[2]];
  };
  const rumbo = (v) => Math.atan2(v[0], -v[2]) / GRADO;
  const bajo = (P) => { const a = P.s.aabb; return [(a[0] + a[3]) / 2, a[1], (a[2] + a[5]) / 2]; };
  // Cuanto adelanta o atrasa una pieza su punta respecto de donde cuelga, en la direccion en que
  // mira el cuerpo. Es el numero que hace visible el paso: un pie delante y el otro detras.
  const zancada = (rig, P) => {
    const f = frente(rig.partes[0]), n = Math.hypot(f[0], f[2]) || 1;
    const punta = conMatriz(P, bajo(P)), colgado = conMatriz(P, anclaLocal(P));
    return ((punta[0] - colgado[0]) * f[0] + (punta[2] - colgado[2]) * f[2]) / n;
  };
  // El angulo de la articulacion, leido de la matriz de verdad. La `zancada` de arriba vale para las
  // piernas (que oscilan alrededor de 0) pero NO para los brazos: con `base:85` estan casi
  // horizontales, donde el adelantamiento va con el seno y se APLANA — ±10° dejan la punta en el
  // mismo sitio y el signo del balanceo se pierde. Un atan2 es monotono en todo el recorrido. El
  // cero da igual: lo unico que se compara son sumas y diferencias entre piezas hermanas.
  const cabeceo = (rig, P) => {
    const f = frente(P), b = frente(rig.partes[0]), n = Math.hypot(b[0], b[2]) || 1;
    return Math.atan2((f[0] * b[0] + f[2] * b[2]) / n, f[1]) / GRADO;
  };

  console.log('\nSe planta un agente articulado y sus piezas son efímeras');
  {
    const w = mundoZ();
    w.jugador(12, 8);
    const antes = w.mc.structures.length, celdas = w.mc.grid.filter((v) => v !== 0).length;
    const rig = await crear(w, 12, 5, 14);
    t('crear() devuelve el agente con sus 6 piezas', !!rig && rig.partes.length === 6);
    t('las 6 están estampadas', w.mc.structures.length === antes + 6);
    t('todas son efímeras (mcSerialize las salta ⇒ no entran en mundo.json)',
      rig.partes.every((P) => P.s && P.s.efimera === true));
    t('todas llevan su rig y sólo el torso es la raíz',
      rig.partes.every((P) => P.s._rig === rig) && rig.partes.filter((P) => P.s._rigRaiz).length === 1);
    t('ni un voxel entra en la rejilla del mundo', w.mc.grid.filter((v) => v !== 0).length === celdas);
    // El pivote de los brazos y las piernas sale del DIBUJO (herramienta 📍), no de una constante.
    t('los brazos y las piernas cuelgan del pivote dibujado, no del centro de su caja',
      rig.partes.slice(2).every((P) => !!P.piv));
    t('el pivote nº1 y el nº2 caen en caras opuestas (hombro izq / der)',
      Math.abs(rig.partes[1 + 1].piv[0] - rig.partes[2 + 1].piv[0]) > 0.2);
    t('lista() lo ve vivo', w.sinRuido(() => w.game.esqueletos.lista()).length === 1);
  }

  console.log('\nLas 6 piezas se mueven como UN SOLO CUERPO, y giran con él');
  {
    const w = mundoZ();
    w.jugador(12, 8);
    const rig = await crear(w, 12, 5, 14);
    w.frames(30);
    const A = armazon(rig);
    w.frames(60);
    const B = armazon(rig);
    let peor = 0;
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++)
      peor = Math.max(peor, Math.abs(d3(A[i], A[j]) - d3(B[i], B[j])));
    t('andando, las distancias entre piezas no cambian', peor < 1e-4, 'peor ' + peor.toExponential(1));
    t('...y de verdad se ha movido', d3(A[0], B[0]) > 0.5);

    // El cuerpo gira hacia el jugador y las extremidades ORBITAN con el: el hombro sigue pegado al
    // torso despues de girar. Con un solo centro de giro esto es justo lo que se rompe.
    const g0 = rig.giro, off0 = [B[3][0] - B[0][0], B[3][2] - B[0][2]];
    w.jugador(3, 14);                                  // ahora el jugador esta a un lado
    w.frames(240);
    const C = armazon(rig);
    const off1 = [C[3][0] - C[0][0], C[3][2] - C[0][2]];
    const gj = rig.partes[0].s._sig;
    const esperado = wrap(Math.atan2(w.mc.pos[0] - (rig.eje[0] + gj.x),
                                     -(w.mc.pos[2] - (rig.eje[2] + gj.z))) / GRADO);
    t('el cuerpo acaba mirando al jugador', Math.abs(wrap(rig.giro + rig.horneado - esperado)) < 5,
      'giro ' + rig.giro.toFixed(1) + '° vs ' + esperado.toFixed(1) + '°');
    t('la cara del torso apunta a donde dice el giro',
      Math.abs(wrap(rumbo(frente(rig.partes[0])) - rig.giro - rig.horneado)) < 1);
    const giroHombro = wrap(Math.atan2(off1[0], -off1[1]) / GRADO - Math.atan2(off0[0], -off0[1]) / GRADO);
    t('el hombro orbita con el cuerpo (mismo ángulo que ha girado el torso)',
      Math.abs(wrap(giroHombro - (rig.giro - g0))) < 2 && Math.abs(giroHombro) > 20,
      'hombro ' + giroHombro.toFixed(1) + '° · torso ' + (rig.giro - g0).toFixed(1) + '°');
    t('...sin despegarse: la distancia al torso es la misma',
      Math.abs(Math.hypot(off1[0], off1[1]) - Math.hypot(off0[0], off0[1])) < 1e-4);
  }

  console.log('\nEl vaivén avanza con la DISTANCIA recorrida, no con el reloj');
  {
    const w = mundoZ();
    w.jugador(12, 6);                                   // alineado en x: el paso es puro -Z
    const rig = await crear(w, 12, 5, 14);
    // Muro de 4 de alto: mcSurfaceNear solo le deja subir 1, asi que es un muro y no una rampa.
    for (let x = 8; x < 17; x++) for (let y = 5; y < 9; y++) w.roca(x, y, 10);   // muro por medio
    w.frames(240);                                      // choca contra el muro y se queda ahi
    // Justo enfrente, en la x que ya ocupa: si el jugador queda de lado, la meta tiene componente
    // lateral y el zombie sigue rascandose contra la pared — que es andar de verdad, no pedalear en
    // el sitio, y lo que se prueba aqui es lo segundo.
    w.jugador(rig.eje[0] + rig.partes[0].s._sig.x, 6);
    w.frames(60);
    const fase = rig.fase, andando = rig.andando, activo = rig.activo;
    const p0 = armazon(rig)[0];
    w.frames(120);                                      // dos segundos MAS de reloj, sin avanzar
    t('contra el muro deja de avanzar', d3(p0, armazon(rig)[0]) < 1e-3);
    t('la fase del paso no avanza con el reloj', Math.abs(rig.fase - fase) < 1e-9,
      'Δfase ' + Math.abs(rig.fase - fase).toExponential(1));
    t('...y las piernas se paran solas', andando < 0.01 && rig.andando < 0.01);
    t('pero te sigue viendo (la pose de brazos en alto se queda)', activo > 0.9 && rig.activo > 0.9);
    const zi = zancada(rig, rig.partes[4]), zd = zancada(rig, rig.partes[5]);
    t('parado, los dos pies están a la par', Math.abs(zi) < 0.02 && Math.abs(zd) < 0.02,
      'izq ' + zi.toFixed(3) + ' · der ' + zd.toFixed(3));
    // `base:85` es la POSE de «te veo», y no depende de andar: con las piernas paradas los brazos
    // tienen que seguir a 85° de ellas. Es el otro lado del bug de v1.20.
    t('...y los brazos siguen en alto (la pose no depende de andar)',
      Math.abs(Math.abs(cabeceo(rig, rig.partes[2]) - cabeceo(rig, rig.partes[4])) - 85) < 1,
      'brazo a ' + Math.abs(cabeceo(rig, rig.partes[2]) - cabeceo(rig, rig.partes[4])).toFixed(1) + '° de la pierna');
  }

  console.log('\nPiernas en oposición, y cada brazo en oposición a su pierna');
  {
    const w = mundoZ();
    w.jugador(12, 6);
    const rig = await crear(w, 12, 5, 18);
    w.frames(120);   // que `activo` acabe de subir: la POSE de los brazos va con el, y aun subiendo
                     // desplaza los dos por igual y la suma no seria constante por un motivo tonto
    // Dos piezas hermanas en oposicion oscilan alrededor de la MISMA base: su suma es constante y su
    // diferencia es el balanceo. Asi no hace falta saber cuanto vale la base ni donde esta el cero.
    let sumaP = null, sumaB = null, peorP = 0, peorB = 0, mayor = 0, juntos = 0, muestras = 0;
    for (let k = 0; k < 60; k++) {
      w.frames(3);
      // partes = [torso, cabeza, brazo izq, brazo der, pierna izq, pierna der]
      const bi = cabeceo(rig, rig.partes[2]), bd = cabeceo(rig, rig.partes[3]);
      const pi = cabeceo(rig, rig.partes[4]), pd = cabeceo(rig, rig.partes[5]);
      if (sumaP === null) { sumaP = pi + pd; sumaB = bi + bd; }
      peorP = Math.max(peorP, Math.abs(pi + pd - sumaP));
      peorB = Math.max(peorB, Math.abs(bi + bd - sumaB));
      mayor = Math.max(mayor, Math.abs(pi - pd));
      // El brazo izquierdo va con la pierna DERECHA (fases 180 y 180): si los dos pares se adelantan
      // hacia el mismo lado, el zombie anda como un soldadito de plomo.
      if (Math.abs(pi - pd) > 1) { muestras++; if ((bi - bd) * (pi - pd) > 0) juntos++; }
    }
    // El margen es ruido de coma flotante: el atan2 de los brazos se lee a ~85°, donde amplifica.
    t('las piernas van en oposición', peorP < 1e-4, 'peor desvío ' + peorP.toExponential(1));
    t('los brazos también', peorB < 1e-4, 'peor desvío ' + peorB.toExponential(1));
    t('y de verdad dan zancadas', mayor > 40 && muestras > 20, 'apertura ' + mayor.toFixed(1) + '°');
    t('cada brazo balancea al revés que su pierna', juntos === 0, juntos + '/' + muestras + ' a la par');
  }

  console.log('\nAl perderte vuelve a su sitio ANDANDO y mirando hacia donde va (v1.20)');
  {
    const w = mundoZ();
    w.jugador(14, 14);
    const rig = await crear(w, 20, 5, 20);
    w.frames(360);
    const g = rig.partes[0].s._sig;
    t('primero te ha perseguido', Math.hypot(g.x, g.z) > 4, 'se ha ido ' + Math.hypot(g.x, g.z).toFixed(1));
    w.jugador(2, 2);                                     // te pierde de vista (>14 de detección)
    w.frames(60);
    t('deja de verte', rig.activo < 0.05, 'activo ' + rig.activo.toFixed(3));
    t('...pero sigue andando, de vuelta a su ancla', rig.andando > 0.9,
      'andando ' + rig.andando.toFixed(2));
    const p0 = armazon(rig)[0];
    w.frames(30);
    const p1 = armazon(rig)[0];
    const marcha = rumbo([p1[0] - p0[0], 0, p1[2] - p0[2]]);
    t('anda hacia su ancla, no de lado', Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0.1
      && Math.abs(wrap(marcha - rumbo([rig.eje[0] + 0 - p1[0], 0, rig.eje[2] - p1[2]]))) < 90);
    t('y MIRA hacia donde va (no se desliza de espaldas)',
      Math.abs(wrap(rumbo(frente(rig.partes[0])) - marcha)) < 8,
      'mira ' + rumbo(frente(rig.partes[0])).toFixed(1) + '° · va ' + marcha.toFixed(1) + '°');
    t('las piernas se mueven mientras vuelve', Math.abs(zancada(rig, rig.partes[4])) > 0.05);
    // Y los brazos, que son la POSE, ya no estan en alto: `activo` y `andando` son dos cosas.
    w.frames(600);
    t('al llegar a su ancla se para del todo', rig.andando < 0.01
      && Math.hypot(rig.partes[0].s._sig.x, rig.partes[0].s._sig.z) < 0.2);
    t('parado sigue teniendo matriz (el resto fraccionario vive en ella)',
      rig.partes.every((P) => !!P.s.model));
  }

  console.log('\nSobrevive a mirarObjetivos y a que le sustituyan las instancias');
  {
    const w = mundoZ();
    w.jugador(12, 8);
    const rig = await crear(w, 12, 5, 14);
    w.def(GUARDIAN, { mirar: { ejes: 'y', alcance: 30 } });   // enciende el bucle por material
    w.pieza(3, 3, GUARDIAN);
    w.frames(60);
    t('mirarObjetivos no le quita la matriz a una pieza del rig',
      rig.partes.every((P) => !!P.s.model));

    const antes = armazon(rig)[0], viejas = restampar(w);
    w.frames(2);
    t('re-adquiere las instancias nuevas', rig.partes.every((P) =>
      w.mc.structures.indexOf(P.s) >= 0 && P.s._rig === rig && P.s.efimera === true));
    t('...y las anima (no se queda animando las muertas)', rig.partes.every((P) => !!P.s.model));
    t('las viejas se sueltan', viejas.every((v) => !v._rig));
    t('y no se teletransporta al ancla al hacerlo', d3(antes, armazon(rig)[0]) < 0.2,
      'salto ' + d3(antes, armazon(rig)[0]).toFixed(3));
  }

  console.log('\nSólido donde se le ve, hueco en el ancla, y las extremidades no chocan');
  {
    const w = mundoZ();
    w.jugador(12, 6);
    const rig = await crear(w, 12, 5, 16);
    const R = rig.partes[0], a0 = R.s.aabb.slice();
    // Quieto en su ancla el reparto se ve limpio: el torso es solido y las extremidades no. Van sin
    // colision a proposito — el rig las GIRA y los envoltorios de v1.18 solo trasladan, asi que una
    // caja que no acompaña al dibujo es peor que ninguna. El zombie choca por su torso.
    t('las extremidades no tienen colisión (giran, y el bitset no gira)',
      rig.partes.slice(1).every((P) => global.mcStructColl(P.s) === null));
    // La raiz tampoco es solida por mcStructColl, y no es un olvido: su `_sig` nace con el resto
    // fraccionario del plantado, o sea que esta «desplazada» desde el primer frame y la solidez sale
    // SIEMPRE del envoltorio de mcFineBoxHit — donde se la dibuja, no donde esta su celda.
    const g0 = R.s._sig;
    w.frames(1);   // los envoltorios tienen salida rapida por `nDesplazados`, que lo cuenta el tick
    t('la raíz es sólida desde el primer frame, donde se la dibuja',
      global.mcCollides((a0[0] + a0[3]) / 2 + g0.x, a0[1] + g0.y + 0.1, (a0[2] + a0[5]) / 2 + g0.z));
    w.frames(300);
    const g = R.s._sig;
    t('se ha ido de su ancla', Math.hypot(g.x, g.z) > 3, 'se ha ido ' + Math.hypot(g.x, g.z).toFixed(1));
    const y = a0[1] + g.y + 0.1;                        // dentro del torso y por encima del suelo
    t('sólido donde se le ve', global.mcCollides((a0[0] + a0[3]) / 2 + g.x, y, (a0[2] + a0[5]) / 2 + g.z));
    t('hueco en el ancla', !global.mcCollides((a0[0] + a0[3]) / 2, y, (a0[2] + a0[5]) / 2));
    // Desplazada, la solidez ya no sale de mcStructColl (que se apaga para no dejar un muro
    // invisible en el ancla) sino del envoltorio de mcFineBoxHit: por eso se mide con mcCollides.
    t('desplazada, el ancla deja de ser sólida por sí misma', global.mcStructColl(R.s) === null);

    const sueltas = w.mc.structures.length - 6;
    const n = w.sinRuido(() => w.game.esqueletos.quitar(rig));
    t('quitar() retira las 6 piezas', n === 6 && w.mc.structures.length === sueltas);
    t('y no deja ninguna colgada del rig', w.mc.structures.every((s) => !s._rig));
    t('lista() se queda vacía', w.game.esqueletos._vivos.length === 0);
  }
}

seccionPivotes().then(seccionPivoteAuto).then(seccionSeguir).then(seccionEsqueletos).then(() => {
  console.log(fail ? '\n' + fail + ' fallo(s)' : '\n' + ok + ' ok, 0 fallos');
  process.exit(fail ? 1 : 0);
}, (e) => { console.log('\nla sección se rompió: ' + (e && e.stack || e)); process.exit(1); });
