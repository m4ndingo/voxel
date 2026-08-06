// ══════════════════════════════════════════════════════════════════════════════════════════════
// REDSTONE · PIEZAS — cable, placa de presión, puerta, palanca, botón, repetidor y bloque de redstone
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Las piezas van APARTE del motor porque no son motor: el motor sabe de señal (quién emite, quién
// conduce, cuánto se pierde, cuánto se tarda) y no sabe qué es una puerta. Aquí solo se combinan
// capacidades que ya existen. Merece la pena mirar la columna de la derecha:
//
//   pieza        lo que hace                        de dónde sale
//   ───────────  ────────────────────────────────   ─────────────────────────────────────────────
//   cable        lleva la señal y pierde 1 por      redstone: conduce
//                bloque
//   palanca      la enciende el jugador y se queda  redstone: manual  +  clic derecho (aquí abajo)
//   botón        igual pero se suelta sola          redstone: manual + pulso
//   placa        se enciende al pisarla             redstone: manual + pulso  +  bloques: alPisar
//   puerta       se abre con señal y se cruza       redstone: encendida  +  bloques: atravesable
//   repetidor    reemite a 15 con retraso           redstone: retardo + mira
//   inversor     luce cuando NO le llega señal      redstone: invertida + mira
//   bloque de    entrega 15 por sus seis caras y    redstone: emite (y nada más)
//   redstone     no se apaga nunca
//
// O sea: CERO maquinaria nueva. Las dos únicas cosas que no existían eran el tiempo (`retardo`) y la
// idea de que una celda pueda ser una ENTRADA (`manual`), y las dos están en el motor porque las dos
// son señal. La puerta es el ejemplo más claro de dónde está la frontera: que se ABRA es redstone
// (cambio de material), que se CRUCE es física (game.bloques.atravesable), y ninguna de las dos
// mitades sabe de la otra.
//
// ⚠️ Todo con precargar:false — esto corre en TODOS los mapas (ver la cabecera de redstone-arranque).
// ──────────────────────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  if (typeof window.game === 'undefined' || !game.redstone) return;

  var MS_PULSO = 1200;   // lo que aguantan pisada la placa y pulsado el botón

  // ── 1. la señal ────────────────────────────────────────────────────────────────────────────
  var CIRCUITOS = {
    // Cable. La pérdida de 1 por salto es la de Minecraft: da tendidos de 15 bloques de alcance.
    'hab:cable':     { conduce: { perdida: 1 }, encendida: 'hab:cable-on' },

    // Entradas. Las tres son el MISMO material manual con pareja; solo cambia quién las suelta:
    // la palanca se queda como la dejes, el botón y la placa se sueltan solos.
    'hab:palanca':   { manual: true, emite: 15, encendida: 'hab:palanca-on' },
    'hab:boton':     { manual: true, emite: 15, encendida: 'hab:boton-on', pulso: MS_PULSO },
    'hab:placa':     { manual: true, emite: 15, encendida: 'hab:placa-on', pulso: MS_PULSO },

    // Salidas.
    // La puerta ocupa DOS celdas pero es UNA puerta, y `conduce` es lo que hace que las dos hojas se
    // pongan de acuerdo: alimentas la de abajo y la señal sube sola a la de arriba. Sin esto había
    // que llevarle un cable a cada hoja, y el de la hoja de arriba salía FLOTANDO en el aire a media
    // altura — algo que en Minecraft no se ve nunca, porque allí una puerta es un solo bloque y se
    // abre entera.
    // ⚠️ `perdida` tiene que ser 1, y esto costó un fallo: con 0 las dos hojas se sostienen la una a
    // la otra para siempre. Sin pérdida no hay gradiente, así que al soltar la placa cada hoja sigue
    // viendo un 15 en la de al lado y ninguna de las dos baja nunca — una puerta que no se cierra.
    // El precio de perder 1 es que una puerta al FINAL justo del alcance (le llega un 1) abriría solo
    // la hoja de abajo; eso se arregla como todo lo demás, con un repetidor.
    'hab:puerta':    { encendida: 'hab:puerta-abierta', conduce: { perdida: 1 } },

    // Repetidor: reemite a 15 (recupera el tendido) y llega tarde a propósito. El retraso NO es
    // decoración — es lo que permite realimentar sin que el circuito se resuelva dentro de la misma
    // pasada, y por tanto lo que permite relojes, biestables y contadores.
    // `mira` NO es un adorno aquí: sin él el repetidor también emite hacia atrás, o sea hacia el
    // cable que le da de comer, y se queda alimentándose a sí mismo para siempre en cuanto se
    // enciende una vez. Un repetidor que no se puede apagar no es un repetidor, es un cerrojo.
    // `soloAlFrente` termina ese trabajo, y es lo que le faltaba (BUG-RS2): con `mira` a secas el
    // repetidor seguía repartiendo por los otros CINCO lados, así que dos puestos hombro con hombro
    // se alimentaban de costado y una fila entera se contagiaba. Entra por detrás, sale por delante.
    'hab:repetidor': { emite: 15, encendida: 'hab:repetidor-on', retardo: 2, mira: true, soloAlFrente: true },

    // Inversor (la antorcha de Minecraft): luce cuando NO le llega señal. Es el NOT, y con el OR que
    // ya hace el cable da un NOR — con NOR sola se construye cualquier función booleana, así que no
    // hacen falta piezas AND ni XOR: se montan. También escucha solo por su espalda, y ESO es lo que
    // permite cerrar un anillo de inversores sin que se realimente a sí mismo: o sea, la memoria.
    // Aquí NO va `soloAlFrente`: una antorcha alumbra los cinco lados que no son su espalda, y de eso
    // vive el anillo de antorchas que hace de memoria. Ésa es la diferencia con el repetidor.
    'hab:inversor':  { invertida: true, emite: 15, encendida: 'hab:inversor-on', retardo: 1, mira: true },

    // Bloque de redstone: una fuente que NO se apaga. Es la única pieza sin pareja encendida/apagada
    // y sin `manual`, y eso no es un descuido — es la definición: no hay estado que guardar porque
    // no hay dos estados. `aplicar()` no le toca el material nunca (solo cambia el bloque cuando hay
    // `encendida`/`apagada`), así que un bloque de redstone puesto se queda como está para siempre.
    //
    // Sin `mira` ni `soloAlFrente` a propósito: reparte 15 por sus SEIS caras. Es lo contrario del
    // repetidor y es lo que lo hace útil como cimiento — pegas cable a cualquier lado y arranca a 15.
    //
    // ⚠️ Un repetidor ENCIMA no se enciende, y no es un fallo: un repetidor solo escucha por su
    // espalda (`mira`), que es horizontal. En Minecraft pasa exactamente lo mismo — el bloque de
    // debajo de un repetidor es solo soporte. Para alimentarlo, el bloque va DETRÁS.
    //
    // Ojo con no confundirlo con 'asset:assets/red_concrete.vox.json', que es decoración y no emite
    // nada: si un hormigón rojo enciende algo es porque alguien le ha pegado un cable y hace de
    // puente, como cualquier otro bloque macizo (r1.2). Por eso éste va moteado y aquél es liso.
    'asset:assets/bloque_redstone.vox.json': { emite: 15 },
  };

  Object.keys(CIRCUITOS).forEach(function (k) {
    var cfg = {};
    for (var p in CIRCUITOS[k]) cfg[p] = CIRCUITOS[k][p];
    cfg.precargar = false;
    game.redstone.define(k, cfg);
  });

  // ── 2. la física ───────────────────────────────────────────────────────────────────────────
  // El cable y la placa son láminas de 1 voxel: sin esto tropiezas con ellas al andar. La puerta
  // abierta se cruza — que es toda la gracia de abrirla.
  if (game.bloques && game.bloques.define) {
    ['hab:cable', 'hab:cable-on', 'hab:placa', 'hab:placa-on', 'hab:puerta-abierta',
     'hab:boton', 'hab:boton-on']
      .forEach(function (k) { game.bloques.define(k, { atravesable: true }); });

    // La placa se enciende al pisarla. alPisar se dispara al ENTRAR en la celda, así que no hay
    // forma de saber que te has bajado: por eso la placa lleva `pulso` y se suelta sola. Es un botón
    // de suelo más que una placa de peso, y prefiero eso a una placa que se quede pegada.
    game.bloques.define('hab:placa', {
      atravesable: true,
      alPisar: function (c) { game.redstone.encender(c.x, c.y, c.z, true); },
    });
  }

  // ── 3. el gesto ────────────────────────────────────────────────────────────────────────────
  var VERSION = 'piezas-1.2';
  var ALCANCE = 6;

  // ⚠️ Apuntar a una palanca NO se puede dejar en manos de game.aim(). El rayo del motor trabaja en
  // CELDAS: da por sólida la celda entera en cuanto tiene bloque, y aquí casi todo son láminas de
  // 1/16 — un cable plano tapa su celda de arriba abajo aunque el rayo le pase un palmo por encima.
  // Medido a dos bloques de la palanca del ejemplo 1: el cable de delante se comía el cabeceo de
  // −50° a −24° y la palanca solo respondía en una ventana de 8°. De ahí el «no sé cómo darle».
  // Esto marcha el rayo a resolución FINA contra el mismo bitset con el que el jugador choca
  // (mc._geoFina, lo que app.js llama en mcTerrenoChoca), así que se para en la materia de VERDAD.
  function miraFina(alcance) {
    if (!mc.active || !mc.grid) return null;
    var cp = Math.cos(mc.pitch), T = MC_TILE;
    var dx = -Math.sin(mc.yaw) * cp, dy = Math.sin(mc.pitch), dz = -Math.cos(mc.yaw) * cp;
    var ox = mc.pos[0], oy = mc.pos[1] + MC_EYE * (mc.scale || 1), oz = mc.pos[2];
    var GEO = mc._geoFina, paso = 1 / T, n = Math.ceil((alcance || ALCANCE) / paso);
    for (var i = 1; i <= n; i++) {
      var t = i * paso, x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      var cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
      if (!mcInside(cx, cy, cz)) return null;
      var id = mc.grid[mcIdx(cx, cy, cz)];
      if (!id) continue;
      // Manga ancha para las ENTRADAS: a una palanca, un botón o una placa les vale la celda entera.
      // Es la distinción de Minecraft entre el «hitbox» y la malla, y aquí no es un capricho: la
      // varilla de la palanca es de 1/16 y encima SE MUEVE al girarla (se inclina al otro lado), así
      // que apuntando al voxel exacto la enciendes y a la siguiente ya no le das — el rayo se cuela
      // por el hueco que acaba de dejar. Lo demás (el cable, que es lo que estorba) sigue midiéndose
      // fino, que es de lo que iba todo esto.
      if (game.redstone.esManual(cx, cy, cz)) return [cx, cy, cz];
      var g = GEO && GEO[id];
      if (g && g.bits) {
        // La celda es fina: solo cuenta si el rayo cruza un voxel LLENO. Si pasa por el hueco, sigue.
        var d = g.fdim;
        var fx = Math.floor(x * T) - cx * T, fy = Math.floor(y * T) - cy * T, fz = Math.floor(z * T) - cz * T;
        if (fx < 0 || fy < 0 || fz < 0 || fx >= d[0] || fy >= d[1] || fz >= d[2]) continue;
        if (!g.bits[(fy * d[2] + fz) * d[0] + fx]) continue;
      }
      return [cx, cy, cz];
    }
    return null;
  }

  // «Si lo que hay donde apunto es manual, gíralo». Genérico: una palanca nueva funciona sin volver
  // por aquí. Devuelve false calladita si no había nada que conmutar.
  function conmutarApuntada() {
    var a = miraFina(ALCANCE);
    return !!(a && game.redstone.conmutar(a[0], a[1], a[2]));
  }

  // Para depurar el «no consigo darle»: game.redstone.apuntada() dice a qué celda apunta el rayo FINO
  // (game.aim() contesta con la celda gorda, que es justo la que engaña). Sin esto la única forma de
  // saber por qué un clic no coge la palanca es a ojo.
  game.redstone.apuntada = function (alcance) { return miraFina(alcance); };

  // Clic derecho: se envuelve mcUseRight en vez de tocar app.js (el motor del Mundo es agnóstico a
  // lo que planten los snippets, y esto es un snippet).
  if (typeof window.mcUseRight === 'function' && window.mcUseRight._redstone !== VERSION) {
    var orig = window.mcUseRight._orig || window.mcUseRight;
    var envuelto = function () {
      // conmutar() no protesta cuando la celda no es manual, así que el clic derecho no se pierde
      // nunca: si no había palanca, se pone bloque como siempre.
      if (conmutarApuntada()) return;
      return orig.apply(this, arguments);
    };
    envuelto._redstone = VERSION;
    envuelto._orig = orig;
    window.mcUseRight = envuelto;
  }

  // Y el botón CENTRAL, que es el que pidió el dueño: solo conmuta, nunca pone un bloque. El derecho
  // hace las dos cosas (si no hay palanca, construye), así que a un palmo de un circuito montado un
  // fallo de puntería te deja un bloque encima del cable. app.js ignora el botón 1 a propósito
  // (`if(e.button!==0 && e.button!==2) return`, app.js:10259), así que aquí no se pisa nada suyo.
  var cv = document.getElementById('mc-canvas');
  if (cv) {
    if (cv._redstoneMedio) cv.removeEventListener('mousedown', cv._redstoneMedio);
    var medio = function (e) {
      if (e.button !== 1 || !mc.active || document.pointerLockElement !== mc.canvas) return;
      e.preventDefault();                       // si no, el navegador entra en autoscroll
      if (!conmutarApuntada() && typeof toast === 'function') toast('ahí no hay nada que conmutar');
    };
    cv.addEventListener('mousedown', medio);
    cv._redstoneMedio = medio;
  }

  console.log('[redstone] piezas: ' + Object.keys(CIRCUITOS).length
    + ' (cable, palanca, botón, placa, puerta, repetidor, inversor, bloque de redstone)'
    + ' · clic derecho o CENTRAL conmuta las manuales');
})();
