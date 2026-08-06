// ══════════════════════════════════════════════════════════════════════════════════════════════
// REDSTONE · ARRANQUE — lo que carga el mundo solo, en cada mapa
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// `mundo-autoarranque` llama a este fichero y a ninguno más: aquí se carga el motor y se declaran
// los circuitos POR DEFECTO. Para añadir un material nuevo al redstone del mundo, se toca la tabla
// DEFECTOS de aquí abajo y ya está — ni el motor ni el autoarranque se abren.
//
// ⚠️ Todo se declara con `precargar:false` A PROPÓSITO. Esto corre en TODOS los mapas, y dar de alta
// un material que ese mundo no usa cuesta un mcMeshAll (~3 873 ms en 512×40×512) por carga a cambio
// de nada. Sin precarga el coste es cero: si el material no está en la paleta, ninguna celda puede
// tener su id, así que el circuito no existe. Y si aparece, el motor carga lo que falte la primera
// vez que haya que encender algo (cargarYReintentar), una sola vez y con aviso.
// ──────────────────────────────────────────────────────────────────────────────────────────────

(async function () {
  'use strict';

  // Los circuitos de serie del mundo. clave del material → cfg (ver redstone.js).
  //
  // ⚠️ Aquí VIVÍA 'asset:assets/red_concrete.vox.json': { power: 15 } — el hormigón rojo como fuente.
  // Se quitó a petición del dueño: era decoración haciendo de fuente permanente, así que cualquier
  // pared roja del mundo daba 15 y no había forma de mirar un circuito y saber de dónde salía la
  // señal. La fuente de verdad es ahora 'asset:assets/bloque_redstone.vox.json' (moteado, se
  // distingue del hormigón liso), y se declara con el resto de piezas en redstone-piezas.js.
  // No hace falta que esté en esta tabla: el arranque carga las piezas justo aquí abajo.
  var DEFECTOS = {
    'hab:antorcha-apagada': { encendida: 'hab:antorcha' },  // antorcha que solo enciende con señal
  };

  if (typeof mc === 'undefined' || !mc.grid) return;                      // no estamos en el Mundo

  async function ejecutarSnippet(id) {
    var r = await fetch('/api/snippets/' + id, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' al pedir /api/snippets/' + id);
    var d = await r.json();
    if (!d || typeof d.code !== 'string' || !d.code.trim()) throw new Error('el snippet «' + id + '» no trae código');
    var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    return new AsyncFunction(d.code)();
  }

  try { await ejecutarSnippet('redstone'); }
  catch (e) { console.warn('[redstone-arranque] no he podido cargar el motor: ' + e.message); return; }
  if (!window.game || !game.redstone) { console.warn('[redstone-arranque] el motor no dejó game.redstone'); return; }

  Object.keys(DEFECTOS).forEach(function (k) {
    var cfg = {};
    for (var p in DEFECTOS[k]) cfg[p] = DEFECTOS[k][p];
    cfg.precargar = false;
    game.redstone.define(k, cfg);
  });

  // Las piezas (cable, palanca, placa, puerta, repetidor) van en su propio fichero: son combinaciones
  // de capacidades del motor, no motor, y así se añade una sin abrir ni el motor ni esto. Si falla,
  // el redstone básico sigue en pie — por eso el try es aparte y no aborta.
  try { await ejecutarSnippet('redstone-piezas'); }
  catch (e) { console.warn('[redstone-arranque] piezas no cargadas: ' + e.message); }

  // La tabla queda a la vista para quien quiera los mismos circuitos CON precarga (el demo lo hace:
  // planta la antorcha al momento y necesita los dos materiales en la paleta antes del primer clic).
  game.redstone.defectos = DEFECTOS;

  // Un mundo puede traer el circuito ya montado en disco. Sin este repaso, una antorcha guardada
  // encendida junto a un bloque que ya no está se quedaría encendida hasta que alguien la tocara.
  // Solo cuesta algo si de verdad hay celdas del circuito: la cola filtra por material.
  if (game.redstone.repasarMundo) game.redstone.repasarMundo();

  console.log('[redstone] arranque: ' + Object.keys(DEFECTOS).length + ' circuito(s) de serie · game.redstone.lista()');
})();
