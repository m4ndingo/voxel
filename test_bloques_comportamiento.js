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
const GEOM = { 'hab:escalera': geomPanel(), 'hab:escalera-real': geomEscaleraReal(), 'hab:placa': geomLosa() };

function montar(opciones) {
  opciones = opciones || {};
  const grid = new Uint8Array(DIM.x * DIM.y * DIM.z);
  const idx = (x, y, z) => x + y * DIM.x + z * DIM.x * DIM.y;
  for (let x = 0; x < DIM.x; x++) for (let z = 0; z < DIM.z; z++) grid[idx(x, 4, z)] = ID_ROCA;   // suelo
  // Con opciones.fina la escalera NO va en la rejilla: va como estructura fina, como en el mundo real.
  if (!opciones.fina)
    for (let x = 0; x < DIM.x; x++) for (let y = 5; y < 20; y++) grid[idx(x, y, 11)] = ID_ESC;    // pared trepable
  // La placa vive a 2 celdas por detras de la escalera: en la rejilla de juguete es un bloque MACIZO,
  // asi que tapa el camino de quien retrocede. Las pruebas que miden el retroceso la quitan.
  if (!opciones.sinPlaca) grid[idx(12, 5, 9)] = ID_PLACA;                                         // placa sobre el suelo
  if (opciones.muelle) for (let y = 5; y < 20; y++) grid[idx(10, y, 11)] = ID_MUELLE;             // trepable mas rapido
  if (opciones.techo) for (let x = 0; x < DIM.x; x++) for (let z = 0; z < 11; z++) grid[idx(x, 9, z)] = ID_ROCA;

  // Instancias finas (ox,oy,oz en bloques, como app.js:6101). La escalera fina es una columna de
  // paneles pegados a la cara z=11, o sea el mismo sitio que ocupaba la pared de rejilla.
  const structures = [];
  const claveFina = opciones.real ? 'hab:escalera-real' : 'hab:escalera';
  if (opciones.fina) for (let oy = 5; oy < 20; oy++) structures.push({ key: claveFina, ox: 12, oy, oz: 11, rot: 0 });
  // La placa fina se apoya en el suelo (bloque y=4, o sea techo en y=5) y ocupa solo 1/16 de alto.
  if (opciones.placaFina) { grid[idx(12, 5, 9)] = 0; structures.push({ key: 'hab:placa', ox: 12, oy: 5, oz: 9, rot: 0 }); }

  const mc = {
    dim: DIM, grid, blockKey: CLAVES.slice(), catalog: [], structures, notes: {}, agents: new Map(),
    pos: [12.5, 5, Z_PEGADO], vel: [0, 0, 0], yaw: 0, scale: 1, keys: {}, onGround: true, active: true
  };
  global.mc = mc;
  global.window = global;
  global.MC_TILE = T;
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
  global.mcUpdate = function (dt) {
    llamadas++;
    // Con opciones.andar tambien se mueve en horizontal (eje a eje, como mcMoveAxis): hace falta
    // para ver si el jugador se despega de la escalera al retroceder.
    if (opciones.andar) {
      const fx = -Math.sin(mc.yaw), fz = -Math.cos(mc.yaw);
      const s = (mc.keys['w'] ? 1 : 0) - (mc.keys['s'] ? 1 : 0);
      if (s) {
        const nx = mc.pos[0] + fx * s * VEL * dt, nz = mc.pos[2] + fz * s * VEL * dt;
        if (!global.mcCollides(nx, mc.pos[1], mc.pos[2])) mc.pos[0] = nx;
        if (!global.mcCollides(mc.pos[0], mc.pos[1], nz)) mc.pos[2] = nz;
      }
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
    sinRuido: (fn) => { const w = console.warn; console.warn = (...a) => avisosConsola.push(a.join(' ')); try { return fn(); } finally { console.warn = w; } },
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

console.log('\ndefine avisa cuando falta el namespace');
{
  const w = montar();
  const antes = w.avisosConsola.length;
  const r = w.sinRuido(() => w.game.bloques.define('escalera', { trepable: true }));
  const aviso = w.avisosConsola.slice(antes).join(' | ');
  t('no registra la clave sin namespace', r === null && !w.game.bloques._tabla['escalera']);
  t('y sugiere la clave real', aviso.indexOf('hab:escalera') >= 0, aviso);
}

console.log('\nEl snippet trae la escalera ya definida');
{
  const w = montar();
  const cfg = w.game.bloques._tabla['hab:escalera'];
  t('hab:escalera viene configurada de fábrica', !!cfg && cfg.trepable === true && cfg.subida === 4 && cfg.bajada === 5,
    cfg ? '↑' + cfg.subida + ' ↓' + cfg.bajada : 'no está');
}

console.log(fail ? '\n' + fail + ' fallo(s)' : '\n' + ok + ' ok, 0 fallos');
process.exit(fail ? 1 : 0);
