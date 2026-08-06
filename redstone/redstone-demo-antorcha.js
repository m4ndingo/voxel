// ══════════════════════════════════════════════════════════════════════════════════════════════
// REDSTONE · DEMO «la antorcha que solo se enciende con redstone al lado»
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Este fichero es el CIRCUITO, no el motor. Todo lo que sabe de antorchas está aquí; redstone.js
// solo mueve señal. Por eso son dos ficheros: para tocar la demo no hace falta abrir el motor.
//
//   1. carga redstone.js (el motor) por su snippet, igual que hace agente-nube
//   2. declara el BLOQUE DE REDSTONE como FUENTE (power 15)
//   3. declara «hab:antorcha-apagada» como receptor que se enciende cambiando a «hab:antorcha»
//   4. planta UNA antorcha apagada en un hueco delante de ti y te pone el bloque de redstone en la mano
//
// Cómo se prueba: pon el bloque rojo pegado a la antorcha → se enciende Y ALUMBRA. Rómpelo → se
// apaga. La luz va sola porque encender = cambiar el material de la celda, y ésa es exactamente la
// operación que ya mantiene el índice de emisores de la rejilla (mcGlowTocada + mcComputeBlockLight).
//
//   game.redstone.demo()        → replanta la antorcha (donde estés mirando)
//   game.redstone.demoQuitar()  → la retira y deja la celda como estaba (aire)
//   game.redstone.info()        → qué hay en la celda que apuntas y con cuánta señal
// ──────────────────────────────────────────────────────────────────────────────────────────────

(async function () {
  'use strict';

  var FUENTE    = 'asset:assets/bloque_redstone.vox.json'; // bloque de redstone: 16³ macizo ⇒ bloque de terreno
  var APAGADA   = 'hab:antorcha-apagada';                 // copia de la antorcha SIN los 12 voxels emisores
  var ENCENDIDA = 'hab:antorcha';                         // la del dueño, intacta

  function aviso(msg) { console.warn('[demo-antorcha] ' + msg); if (typeof toast === 'function') toast(msg); }

  if (typeof mc === 'undefined' || !mc.grid || !mc.active) { aviso('abre 🌍 Mundo y vuelve a ejecutar'); return; }

  // Las pruebas van al mapa de test y solo al mapa de test: esto PLANTA un voxel.
  if (!/^\/map\/test(\/|$)/.test(location.pathname)) {
    aviso('esta demo solo se planta en /map/test (estás en ' + location.pathname + ')');
    return;
  }

  // ── 1 · el motor, desde su propio fichero ───────────────────────────────────────────────────
  // Mismo cargador que usa agente-nube: un snippet puede pedir otro por la API y ejecutarlo en el
  // ámbito global, que es lo que le da acceso a mc / mcSetBlock / game.
  async function ejecutarSnippet(id) {
    var r = await fetch('/api/snippets/' + id, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' al pedir /api/snippets/' + id);
    var d = await r.json();
    if (!d || typeof d.code !== 'string' || !d.code.trim()) throw new Error('el snippet «' + id + '» no trae código');
    var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    return new AsyncFunction(d.code)();
  }
  try { await ejecutarSnippet('redstone-arranque'); }
  catch (e) { aviso('no he podido cargar el motor «redstone»: ' + e.message); return; }
  if (!game.redstone) { aviso('el motor se cargó pero no dejó game.redstone'); return; }

  // ── 2 y 3 · el circuito ─────────────────────────────────────────────────────────────────────
  // El arranque ya lo declaró, pero SIN precargar los materiales (corre en todos los mundos y no
  // puede pagar un mcMeshAll por cada uno). Aquí sí hacen falta cargados YA: la antorcha se planta
  // a continuación, y si el primer clic llega antes no tendría a qué cambiarse. define() vuelve a
  // declarar lo mismo con precarga; se ESPERAN las promesas.
  await game.redstone.define(FUENTE, { power: 15 });
  await game.redstone.define(APAGADA, { encendida: ENCENDIDA });

  // ── 4 · plantar la antorcha ─────────────────────────────────────────────────────────────────
  var DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  var plantada = null;

  // Hueco libre: suelo sólido con 3 celdas de aire encima. NO se despeja nada — el mapa de test no
  // se borra, así que la demo busca sitio en vez de hacérselo.
  function huecoEn(x, z, yRef) {
    var alto = Math.min(yRef + 3, mc.dim.y - 4);
    for (var y = alto; y >= 1; y--)
      if (game.getVoxel(x, y, z) && !game.getVoxel(x, y + 1, z)
          && !game.getVoxel(x, y + 2, z) && !game.getVoxel(x, y + 3, z)) return y + 1;
    return null;
  }
  function buscarSitio() {
    var dx = -Math.sin(mc.yaw), dz = -Math.cos(mc.yaw), yRef = Math.floor(mc.pos[1]);
    for (var d = 3; d <= 10; d++) {
      for (var lado = 0; lado <= d; lado++) {
        for (var s = -1; s <= 1; s += 2) {
          var x = Math.floor(mc.pos[0] + dx * d - dz * lado * s);
          var z = Math.floor(mc.pos[2] + dz * d + dx * lado * s);
          var y = huecoEn(x, z, yRef);
          if (y !== null) return [x, y, z];
          if (!lado) break;                   // lado 0 es el mismo punto con s=+1 y s=-1
        }
      }
    }
    return null;
  }

  function plantar(x, y, z) {
    if (x === undefined) {
      var p = buscarSitio();
      if (!p) { aviso('no encuentro un hueco con suelo delante de ti; muévete y repite game.redstone.demo()'); return null; }
      x = p[0]; y = p[1]; z = p[2];
    }
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    game.setVoxel(x, y, z, APAGADA);
    plantada = [x, y, z];
    // Re-evaluar la celda Y sus 6 vecinos: si ya hubiera un bloque rojo pegado, la antorcha tiene
    // que nacer encendida. La escritura de arriba también la encola, pero pedirlo explícito es lo
    // que hace que replantar junto a un circuito ya montado no dependa del orden.
    game.redstone.revisarCaja(x - 1, Math.max(0, y - 1), z - 1, x + 1, y + 1, z + 1);
    return plantada;
  }

  function quitar() {
    if (!plantada) { aviso('no hay antorcha de la demo plantada'); return false; }
    game.setVoxel(plantada[0], plantada[1], plantada[2], 0);
    plantada = null;
    return true;
  }

  game.redstone.demo = plantar;
  game.redstone.demoQuitar = quitar;

  var pos = plantar();
  if (!pos) return;

  // El bloque de redstone, en la mano. El dueño está en el móvil: si tiene que abrir el selector y
  // buscarlo en la galería, la demo ya no es «ponle un bloque al lado».
  try {
    var libre = -1;
    for (var i = 0; i < mc.hotbar.length; i++) if (!mc.hotbar[i]) { libre = i; break; }
    if (libre < 0) libre = mc.hotbar.length - 1;          // sin ranura libre, la última
    await mcAssignSlot(libre, FUENTE, 'Bloque de Redstone');
  } catch (e) { aviso('no he podido dejarte el bloque de redstone en la hotbar: ' + e.message + ' (cógelo a mano de la galería)'); }

  // Girarle la vista hacia la antorcha, sin moverle: un tp puede dejarle dentro de algo, y como se
  // planta buscando hueco puede haber quedado un poco de lado. El convenio de yaw es el de
  // game.aim(): la mirada es [-sin(yaw), ·, -cos(yaw)].
  mc.yaw = Math.atan2(-(pos[0] + 0.5 - mc.pos[0]), -(pos[2] + 0.5 - mc.pos[2]));

  aviso('🔦 Antorcha apagada en ' + pos.join(',') + ' · pon el bloque rojo pegado y se enciende');
  console.log('[demo-antorcha] listo. Circuito:', game.redstone.lista());
})();
