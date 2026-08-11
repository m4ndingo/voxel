// ══════════════════════════════════════════════════════════════════════════════════════════════
// REDSTONE · el motor. Señal por MATERIAL, estado por CELDA, propagación por COLA.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Este fichero NO sabe qué es una antorcha ni una lámpara: solo mueve señal. Quién es fuente y quién
// receptor se declara desde fuera con game.redstone.define(...). El demo vive en otro snippet.
//
// Las tres decisiones de diseño, y por qué:
//
// 1. UN OBJETO POR VOXEL NO CABE. 96×48×96 = 442 368 celdas; el motor guarda un id de paleta por
//    celda, no un objeto. Así que el comportamiento cuelga del MATERIAL (una entrada por tipo, como
//    game.bloques) y lo único por celda es el NIVEL de señal, en un Map DISPERSO que solo tiene
//    entradas donde hay circuito. Un mundo sin redstone gasta exactamente cero.
//
// 2. LA VECINDAD ES UNA COLA, NO UNA LLAMADA. Notificar a los 6 vecinos en recursión convierte un
//    cable largo en una cascada que se come el frame (y un anillo de cable, en un cuelgue). Se
//    encolan y se drenan en el tick, con tope por drenado. Es lo que hace Minecraft.
//
// 3. LOS DOS MATERIALES DE UNA LÁMPARA SE DAN DE ALTA EN define(), NO AL ENCENDERSE. Dar de alta un
//    material nuevo cuesta 3 873 ms en un mundo de 512×40×512 (mcBuildPalette re-hornea la paleta y
//    el atlas crece ⇒ mcMeshAll). Pagarlo en el primer clic sería un congelado de 4 s en mitad del
//    juego; pagarlo al declarar el circuito es una vez y a la vista.
//
// 4. UN BLOQUE MACIZO CUALQUIERA TRANSPORTA (r1.2). Un muro no es una pieza de circuito, pero lo que
//    tiene pegado se alimenta a través de él — es la regla de Minecraft y la que esperaba el dueño:
//    «una antorcha pegada a un bloque que recibe energía debería enterarse». No hay estado nuevo: la
//    energía del bloque se calcula al vuelo desde sus seis vecinos (energiaDeBloque) y NUNCA se
//    encadena bloque → bloque, lo que acota el coste a un salto y evita que un cable suelto energice
//    un muro entero. La asimetría que lo hace sano es FUERTE/DÉBIL: un cable energiza el bloque solo
//    DÉBILMENTE y otro cable no lee lo débil, así que dos tendidos separados por un bloque no se
//    contagian saltándose la pérdida. Válvula de escape: game.redstone.aislante(clave).
//
// ── API ───────────────────────────────────────────────────────────────────────────────────────
//   game.redstone.define('asset:assets/bloque_redstone.vox.json', { emite: 15 }) // fuente
//   game.redstone.define('hab:antorcha-apagada', { encendida: 'hab:antorcha' }) // receptor
//   game.redstone.define('hab:cable', { conduce: { perdida: 1 }, encendida: 'hab:cable-on' })
//   game.redstone.define('hab:repetidor', { retardo: 2, encendida: 'hab:repetidor-on', emite: 15 })
//   game.redstone.define('hab:palanca', { manual: true, encendida: 'hab:palanca-on', emite: 15 })
//   game.redstone.define('hab:placa', { alRecibirSeñal(c, n) { … } })           // receptor a medida
//   game.redstone.quitar(clave) · game.redstone.lista()
//   game.redstone.aislante('hab:cristal')  // ese material deja de transportar la señal (ver abajo)
//   game.redstone.info(x,y,z)      // ← el descubridor: qué material hay ahí y con cuánta señal
//   game.redstone.revisar(x,y,z)   // encola esa celda a mano (depuración)
//   game.redstone.tick()           // drena la cola ya (los tests no esperan al rAF)
//   game.redstone.conmutar(x,y,z)  // gira un material `manual` (palanca, botón, placa)
//   game.redstone.encender(x,y,z, on)
//
// ── ¿ES TURING-COMPLETO? ──────────────────────────────────────────────────────────────────────
// Sí, con la misma letra pequeña que Minecraft. Hacen falta tres cosas y aquí están las tres:
//
//   1. UN JUEGO DE PUERTAS COMPLETO. `invertida` da el NOT y el cable da el OR (cada celda se
//      queda con el MÁXIMO de sus vecinas), así que NOT(a OR b) = NOR, y NOR por sí sola genera
//      cualquier función booleana. No hace falta añadir AND/XOR: se construyen.
//   2. TIEMPO. Sin retardo todo el circuito se estabiliza dentro de la misma pasada, y una
//      realimentación no es un reloj sino un bucle combinacional (el guardia de oscilación la
//      corta). `retardo` reparte el cambio entre pasadas: con él un inversor realimentado es un
//      RELOJ de verdad, y de ahí salen biestables, registros de desplazamiento y contadores.
//      Es la pieza que convierte lógica combinacional en lógica SECUENCIAL — o sea, en máquina.
//   3. MEMORIA. Dos NOR cruzados = biestable SR; una fila de biestables = cinta.
//
// La letra pequeña: la cinta es mc.dim.x·y·z celdas, o sea FINITA. Un mundo de 96×48×96 es un
// autómata linealmente acotado, no una máquina de Turing con cinta infinita — exactamente la
// misma salvedad que se le pone a Minecraft, a una FPGA o a cualquier ordenador real. Turing
// completo «módulo memoria acotada»: agranda el mundo y sube el techo, sin tocar el motor.
// ──────────────────────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  var VERSION = 'r1.3';         // r1.3: el repaso de arranque suelta las entradas de pulso pegadas (BUG-RS25)
  var MAX_POR_DRENADO = 4096;   // tope por pasada: un circuito enorme se reparte entre frames, no cuelga
  var MAX_CAMBIOS_POR_CELDA = 8;// una celda que cambia más veces que esto en una pasada está oscilando

  if (typeof window.game === 'undefined') { console.error('[redstone] no hay game: ¿es esta la pestaña del Mundo?'); return; }
  if (typeof mc === 'undefined' || !mc.grid) { console.error('[redstone] el Mundo no está cargado. Entra en 🌍 Mundo y vuelve a ejecutar.'); return; }

  // ── tabla por material ──────────────────────────────────────────────────────────────────────
  // clave larga ('hab:x' / 'asset:assets/x.vox.json') → cfg. La consulta por celda tiene que ser un
  // índice de array, así que se cachea id→cfg y se invalida por mc.blockKey.length — el mismo truco
  // que game.bloques y mcXnameCache. Un id de paleta NO es estable entre cargas; la clave sí.
  var tabla = Object.create(null);
  // Los AISLANTES viven en su propia tabla y no en `tabla` a propósito: un aislante no es una pieza de
  // circuito, y meterlo en `tabla` lo metería en la cola y le gastaría una entrada de `potencia` para
  // no hacer nada. Aquí solo responde a una pregunta: «¿este bloque lleva la señal a lo que tiene
  // pegado?». Ver energiaDeBloque.
  var aislantes = Object.create(null);
  var porId = null, aisId = null, porIdLen = -1;

  function cacheIds() {
    if (porId && porIdLen === mc.blockKey.length) return porId;
    porId = new Array(mc.blockKey.length).fill(null);
    aisId = new Uint8Array(mc.blockKey.length);
    for (var id = 1; id < mc.blockKey.length; id++) {
      var k = mc.blockKey[id];
      if (!k) continue;
      var cfg = tabla[k] || tabla[claveBase(k)];   // 'flor@1' hereda de 'flor': el giro no cambia el circuito
      if (cfg) porId[id] = cfg;
      if (aislantes[k] || aislantes[claveBase(k)] || (mc.aislanteDoc && mc.aislanteDoc[id])) aisId[id] = 1;
    }
    porIdLen = mc.blockKey.length;
    return porId;
  }
  function claveBase(k) { var i = String(k).lastIndexOf('@'); return i > 0 ? k.slice(0, i) : k; }
  function invalidar() { porId = null; aisId = null; porIdLen = -1; }

  // ── estado por celda: DISPERSO ──────────────────────────────────────────────────────────────
  var potencia = new Map();     // 'x,y,z' → nivel 0..15 que RECIBE esa celda (solo donde hay circuito)
  var cola = new Map();         // 'x,y,z' → [x,y,z]; Map y no array: deduplica sola
  // Las celdas con `retardo` no se aplican en la pasada en que se deciden: esperan aquí. Es lo que
  // da TIEMPO al circuito, y sin tiempo no hay lógica secuencial (ver la nota de Turing arriba).
  var esperando = new Map();    // 'x,y,z' → { x, y, z, nivel, cuando } — cuenta atrás en pasadas
  var pasada = 0;               // el «reloj» del circuito: una pasada de drenar() = un tic
  var apagones = new Map();     // 'x,y,z' → id de setTimeout de un `pulso` en curso
  // Flancos ACUMULADOS mientras un observador está en pulso. Un observador que recibe un cambio
  // delante mientras él mismo está encendido no puede re-encenderse (ya está on), pero el flanco
  // no se puede perder: se anota aquí y se procesa al terminar el pulso. Esto es lo que permite
  // (a) propagar los DOS flancos (subida y bajada) de un observador vecino a lo largo de una
  // cadena — sin esto solo llega el primero, BUG-RS21 —, y (b) montar relojes cara a cara al
  // estilo Minecraft: dos observadores enfrentados se re-disparan mutuamente cada pulso.
  var pendientesObs = new Map();
  var drenando = false;
  var yoEscribiendo = false;    // centinela: mis propios mcSetBlock no vuelven a encolar
  // Salida rápida: sin materiales declarados, el envoltorio de mcSetBlock es una llamada de más y
  // nada más. Una ráfaga de TNT de 1000 bloques no puede pagar un Map.set por vecino si no hay
  // circuito ninguno. Va aquí arriba a propósito: el envoltorio lo lee y declararlo después solo
  // funcionaba por el izado de var (valía undefined), que es exactamente el bug que no se ve.
  var hayCircuito = false;

  var DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

  function cl(x, y, z) { return x + ',' + y + ',' + z; }
  function dentro(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < mc.dim.x && y < mc.dim.y && z < mc.dim.z; }
  function idEn(x, y, z) { return dentro(x, y, z) ? mc.grid[mcIdx(x, y, z)] : 0; }
  function cfgEn(x, y, z) { var id = idEn(x, y, z); return id ? cacheIds()[id] : null; }
  function claveEn(x, y, z) { return mc.blockKey[idEn(x, y, z)] || null; }

  // ¿Está ENCENDIDA la celda? Para un material con pareja (apagada/encendida) el estado no se guarda
  // en ningún sitio: ES la clave que hay en la rejilla. Por eso sobrevive a recargar el mundo — no
  // hay estado que persistir, ya está en el mapa. Sin pareja, «encendida» es siempre.
  function encendidaEn(x, y, z, cfg) {
    if (!cfg.encendida) return true;
    // Por BASE, no por clave exacta: una pieza girada vale 'hab:antorcha@3' y compararla contra
    // 'hab:antorcha' diría que está apagada siempre. El giro no cambia el estado.
    return claveBase(claveEn(x, y, z) || '') === claveBase(cfg.encendida);
  }

  // ── por dónde ESCUCHA una pieza ─────────────────────────────────────────────────────────────
  // Una antorcha de Minecraft no mira a sus seis lados: está PEGADA a un bloque, escucha solo por ahí
  // y emite por los otros cinco. Esa asimetría no es un detalle estético — es lo que impide que una
  // pieza se realimente a sí misma a través del cable que ella misma alimenta, y por tanto lo único
  // que faltaba para poder cerrar un anillo de inversores y tener MEMORIA (un biestable).
  //
  // El lado no se guarda en ninguna tabla: sale de la POSTURA, que ya vive en la clave ('hab:antorcha@3').
  // Por eso sobrevive a guardar y recargar el mundo sin que el motor persista nada.
  var NOMDIR = ['+X', '−X', '+Y', '−Y', '+Z', '−Z'];   // para que info() hable en cristiano
  // ⚠️ La postura entera, SIN recortarla. Son 24 (mcOriNorm manda), no 16, y quedarse con unos pocos
  // bits no deja la pieza «casi bien»: la convierte en OTRA postura. Una palanca puesta de las nuevas
  // se giraba sola al accionarla y, siendo una plaquita fina, aparecía en otro sitio de su celda
  // (BUG-RS8); y un pistón apuntando hacia arriba se acostaba en cuanto el motor le repasaba la celda
  // (BUG-RS7). Un sufijo que no sea una postura conocida se lee como «sin girar», nunca como otra.
  function oriDe(k) {
    var i = String(k).lastIndexOf('@');
    if (i < 0) return 0;
    var n = +String(k).slice(i + 1);
    if (!isFinite(n)) return 0;
    return (typeof mcOriNorm === 'function') ? mcOriNorm(n) : ((n >= 0 && n <= 23) ? (n | 0) : 0);
  }
  // Cambiar de material NO puede cambiar cómo está puesta la pieza. Todo cambio de bloque de una
  // celda pasa por aquí para devolverle su orientación; si no, encender una placa la endereza.
  function conOri(quiero, x, y, z) {
    var k = claveEn(x, y, z);
    var hasOri = String(k).lastIndexOf('@') >= 0;
    var ori = oriDe(k);
    return hasOri ? claveBase(quiero) + '@' + ori : quiero;
  }
  // Hacia dónde MIRA una pieza. Su frente es el +X de su dibujo, y a dónde va ese +X con la postura
  // puesta lo dice el motor (mcOriPerm), que lo saca de la MISMA composición con la que gira los
  // voxels: así lo que la pieza escucha no se puede separar de cómo se la ve. Ahora el frente puede
  // ser +Y o −Y —una pieza mirando al techo—, que es justo lo que la tabla horizontal no sabía decir.
  var CARA2DIR = [2, 3, 0, 1, 4, 5];   // índice en MC_FACES (+Y,−Y,+X,−X,+Z,−Z) → índice en DIRS
  var FRENTE = [0, 4, 1, 5];           // respaldo sin motor delante: giro 0..3 → +X, +Z, −X, −Z
  function frenteDeOri(ori) {
    if (typeof mcOriPerm !== 'function') return FRENTE[ori & 3];
    return CARA2DIR[mcOriPerm(ori)[2]];   // MC_FACES[2] = +X = el frente del dibujo
  }
  function frenteDe(x, y, z) { return frenteDeOri(oriDe(claveEn(x, y, z))); }
  function atrasDe(x, y, z) { return frenteDe(x, y, z) ^ 1; }   // DIRS se empareja 0/1, 2/3, 4/5

  // Lo que una celda PRESENTA a sus vecinos. Separarlo de lo que RECIBE es lo que permite el cable:
  // una fuente entrega lo suyo siempre, una lámpara-fuente solo cuando está encendida, y un cable
  // entrega su propio nivel — que es justamente lo que recibe.
  // `hacia` es el índice de DIRS en el que está quien pregunta, visto desde esta celda.
  function salidaDe(x, y, z, cfg, hacia) {
    if (!cfg) return 0;
    if (cfg.mira && hacia !== undefined && hacia === atrasDe(x, y, z)) return 0;  // no emite por su espalda
    // `soloAlFrente` es MÁS estrecho que `mira`, y la diferencia es la que hay entre una antorcha y un
    // repetidor. La antorcha está pegada a un bloque: escucha por ahí y alumbra los otros CINCO lados
    // (eso es lo que hace que un anillo de antorchas sea memoria). El repetidor no reparte: entra por
    // detrás y sale por delante, y nada más. Sin esto un repetidor alimenta de lado el cable de al
    // lado, y una fila de repetidores puestos hombro con hombro se contagia entre sí.
    if (cfg.soloAlFrente && hacia !== undefined && hacia !== frenteDe(x, y, z)) return 0;
    if (cfg.soloAlAtras && hacia !== undefined && hacia !== atrasDe(x, y, z)) return 0;
    if (cfg.conduce) return potencia.get(cl(x, y, z)) || 0;
    if (!cfg.emite) return 0;
    return encendidaEn(x, y, z, cfg) ? cfg.emite : 0;
  }

  // ── bloques macizos como transporte ─────────────────────────────────────────────────────────
  // Lo que pedía el ticket: «los bloques que reciben energía de redstone deben energizarse, por lo
  // tanto una antorcha pegada a un bloque que recibe energía debería enterarse». Un bloque normal no
  // es una pieza de circuito, pero SÍ es un puente.
  //
  // Sin estado nuevo: la energía del bloque NO se guarda en `potencia`, se calcula al vuelo mirando
  // sus seis vecinos. Y NUNCA bloque → bloque: eso acota el coste a un salto y evita el efecto dominó
  // de un muro entero energizado por un cable suelto.
  function bloqueEnergizable(x, y, z) {
    var id = idEn(x, y, z);
    if (!id) return false;              // aire
    if (cacheIds()[id]) return false;   // es circuito: ya tiene sus propias reglas, no hace de puente
    if (mc && mc.blockKey) {
      var key = mc.blockKey[id];
      if (key) {
        var kLow = key.toLowerCase();
        if (kLow.indexOf('agua') >= 0 || kLow.indexOf('water') >= 0 || kLow.indexOf('lava') >= 0) {
          return false; // Los fluidos no conducen redstone
        }
      }
    }
    return !aisId[id];
  }

  // FUERTE contra DÉBIL, que es la parte que no se puede saltar: un CABLE energiza el bloque solo
  // DÉBILMENTE, y otro cable no lee la energía débil. Sin esa asimetría, dos tendidos separados por un
  // bloque se contagiarían saltándose la pérdida — y peor, un cable se realimentaría a través del
  // bloque que él mismo alimenta y el tendido no bajaría de nivel nunca. Todo lo demás (antorcha,
  // palanca, repetidor) energiza FUERTE, y de ahí sale justo el caso del ticket.
  //
  // `aceptaDebil` lo decide quien pregunta: el cable dice que no, cualquier otra pieza dice que sí
  // (una lámpara bajo un cable se enciende, y una antorcha pegada a ese bloque se entera).
  // (sx,sy,sz) es quien pregunta, y se excluye: nadie se alimenta a sí mismo a través de un bloque.
  function energiaDeBloque(bx, by, bz, aceptaDebil, sx, sy, sz) {
    var n = 0;
    for (var j = 0; j < 6; j++) {
      var nx = bx + DIRS[j][0], ny = by + DIRS[j][1], nz = bz + DIRS[j][2];
      if (nx === sx && ny === sy && nz === sz) continue;
      var c = cfgEn(nx, ny, nz);
      if (!c) continue;                              // nunca bloque → bloque
      if (c.conduce && !aceptaDebil) continue;
      var s = salidaDe(nx, ny, nz, c, j ^ 1);        // el bloque está, para él, en la dirección j^1
      if (s > n) n = s;
    }
    return n;
  }

  // ── la cola ─────────────────────────────────────────────────────────────────────────────────
  // ESTRENADAS: celdas cuyo MATERIAL acaba de cambiar. Hay que evaluarlas aunque la señal que
  // reciben no haya cambiado, porque lo que ha cambiado es el otro lado de la ecuación: una antorcha
  // invertida recién puesta recibe 0, que es lo mismo que recibía el aire que había antes, y con el
  // atajo de «nivel igual → nada que hacer» se quedaría apagada para siempre. Solo crece cuando de
  // verdad se escribe un bloque de circuito, así que no le cuesta nada al mundo normal.
  var estrenadas = new Set();
  function encolar(x, y, z, estrena) {
    if (!dentro(x, y, z)) return;
    var k = cl(x, y, z);
    cola.set(k, [x, y, z]);
    if (estrena) estrenadas.add(k);
    pedirDrenado();
  }
  // Lo que llama el envoltorio de mcSetBlock cuando una celda ha cambiado. FILTRA antes de encolar:
  // solo entran en la cola las celdas que son circuito (o que lo eran y hay que limpiarles la señal).
  // Es lo que deja el motor a coste cero en un mundo normal, y hace falta porque desde que redstone
  // se carga solo esto corre en TODAS las escrituras de rejilla: una explosión de 1000 bloques serían
  // 7000 Map.set y un drenado de 7000 celdas para no hacer nada. Filtrando son 7 lecturas de array
  // por bloque y la cola se queda vacía. Semánticamente es lo mismo: drenar() ya descarta las celdas
  // sin cfg, así que encolarlas solo servía para descartarlas más tarde.
  //
  // Desde r1.2 el aviso salta a DOS celdas a través de un bloque macizo: lo que cuelga del otro lado
  // del bloque se alimenta por él y con un solo salto no se enteraría nunca — se vería como «la
  // lámpara no se apaga hasta que le doy un clic».
  //
  // ⚠️ Y salta SIEMPRE, no solo cuando quien cambia es circuito. Es tentador ahorrarse el segundo
  // salto en el caso «cambia un bloque normal», pero «¿era esta celda circuito?» no se puede
  // responder después de la escritura: una FUENTE (una palanca) no deja entrada en `potencia`, así
  // que al arrancarla parecía un bloque cualquiera y la lámpara del otro lado del muro se quedaba
  // encendida. El filtro que de verdad importa sigue en pie: solo se ENCOLA lo que tiene cfg, así
  // que la ráfaga del TNT sigue dejando la cola vacía; lo que sube son lecturas de array (7 → 43).
  // ¿Esta cfg es un observador (apagado o encendido, hab: o asset:)?
  function esObservador(c) {
    if (!c || !c._clave) return false;
    var b = claveBase(c._clave);
    return b === 'hab:observador' || b === 'hab:observador-on'
      || b === 'asset:assets/observador.vox.json' || b === 'asset:assets/observador-on.vox.json';
  }
  // Pareja on/off del observador según si la celda es asset o hab. Los ficheros reales viven en
  // assets/; hab: se conserva por si alguien los genera en la galería.
  function parejaObservador(clave) {
    var b = claveBase(clave || '');
    if (b.indexOf('asset:') === 0) {
      return {
        on: 'asset:assets/observador-on.vox.json',
        off: 'asset:assets/observador.vox.json'
      };
    }
    return { on: 'hab:observador-on', off: 'hab:observador' };
  }
  // Pulso del observador: se enciende un instante (~100 ms) y emite 15 por DETRÁS. Si el material
  // encendido aún no está en la paleta (precargar:false), se carga y se reintenta — sin eso el
  // disparo fallaba en silencio al colocar el observador desde la galería (solo bajaba el off).
  //
  // Contrato con la propagación (BUG-RS21):
  // - En reposo (apagones vacío): enciende ahora, agenda apagado a 100 ms.
  // - En pulso: NO descartar. Anotar en pendientesObs y re-disparar al terminar el pulso. Así
  //   propagan los dos flancos (subida y bajada) del vecino a lo largo de una cadena de
  //   observadores, y dos observadores enfrentados oscilan a 100 ms (reloj cara a cara).
  // - Recursión síncrona (dos observadores mirándose se llaman entre sí desde el mismo frame):
  //   se corta con la marca temporal `apagones.set('obs:'+k, 1)` que se pone ANTES de notificar.
  //   La segunda llamada síncrona ve apagones y cae por la rama de pendientesObs.
  function dispararObservador(nx, ny, nz, c) {
    var kObs = cl(nx, ny, nz);
    if (apagones.has('obs:' + kObs)) {
      // Ya en pulso: anotar el flanco y re-disparar cuando el pulso actual termine.
      pendientesObs.set(kObs, true);
      return;
    }
    var par = parejaObservador(c._clave);
    var quieroOn = conOri(par.on, nx, ny, nz);
    var quieroOff = conOri(par.off, nx, ny, nz);
    // La variante ORIENTADA manda: cambiar de material (off→on→off) no puede cambiar cómo está puesta
    // la pieza. Un fallback al par.on sin girar (que sí suele estar en la paleta, porque cargarlo
    // desde la galería lo registra) escribe la clave sin `@n` en la celda, y el observador encendido
    // aparece apuntando a otro sitio — BUG-RS19 secuela: hasta BUG-RS19 los observadores no cabían
    // en la rejilla girados, así que este camino nunca se activaba con @n; ahora sí.
    var idOn = mc.name2id ? mc.name2id[quieroOn] : 0;
    var idOff = mc.name2id ? mc.name2id[quieroOff] : 0;
    // La celda YA es el off: si la clave orientada no está indexada, vale el id actual.
    if (!idOff) idOff = idEn(nx, ny, nz);
    if (!idOn) {
      // Se carga la ORIENTADA (mcAltaVariante la registra sin re-hornear el atlas si la base está).
      cargarYReintentar(quieroOn, nx, ny, nz, function () {
        var c2 = cfgEn(nx, ny, nz);
        if (c2 && esObservador(c2)) dispararObservador(nx, ny, nz, c2);
      });
      return;
    }
    if (!idOff) return;

    // Marca temporal ANTES de escribir y notificar: si la cascada notifica a un observador que
    // acaba mirando a éste (caso cara a cara), la re-entrada síncrona ve apagones=true y cae por
    // pendientesObs en vez de recursionar hasta colgar el navegador.
    apagones.set('obs:' + kObs, 1);

    yoEscribiendo = true;
    try { mcSetBlock(nx, ny, nz, idOn); } finally { yoEscribiendo = false; }
    potencia.set(kObs, 15);
    if(api.pulsoVisible !== false) remallar([[nx, ny, nz]]);   // PERF-RS1: si el pulso no se ve, no mesh
    encolar(nx, ny, nz, true);
    encolarPuenteando(nx, ny, nz);
    // BUG-RS20: el envoltorio de mcSetBlock se saltó encolarVecinos por yoEscribiendo, así que hay
    // que notificar a mano a los observadores que tenían a esta celda delante. Un observador que
    // acaba de disparar YA es ese «cambio delante» para su vecino de atrás.
    notificarObservadoresVecinos(nx, ny, nz);
    var dirAtras = atrasDe(nx, ny, nz);
    var rx = nx + DIRS[dirAtras][0], ry = ny + DIRS[dirAtras][1], rz = nz + DIRS[dirAtras][2];
    var cRx = cfgEn(rx, ry, rz);
    if (cRx) {
      encolar(rx, ry, rz, true);
      if (typeof cRx.alRecibirSeñal === 'function') {
        var ant = potencia.get(cl(rx, ry, rz)) || 0;
        try { cRx.alRecibirSeñal({ x: rx, y: ry, z: rz, clave: mc.blockKey[idEn(rx, ry, rz)] }, 15, ant); } catch (e) {}
      }
    }
    pedirDrenado();

    var obsX = nx, obsY = ny, obsZ = nz, idOffFinal = idOff;
    // Sustituye la marca temporal por el timer de apagado real.
    apagones.set('obs:' + kObs, setTimeout(function () {
      yoEscribiendo = true;
      try { mcSetBlock(obsX, obsY, obsZ, idOffFinal); } finally { yoEscribiendo = false; }
      potencia.delete(kObs);
      if(api.pulsoVisible !== false) remallar([[obsX, obsY, obsZ]]);   // PERF-RS1: si el pulso no se ve, no mesh
      encolar(obsX, obsY, obsZ, true);
      encolarPuenteando(obsX, obsY, obsZ);
      // LIBERAR apagones ANTES de notificar. La bajada del pulso es un flanco legítimo: los
      // observadores vecinos que estén en pulso (típico en cadena B→A: al bajar B, A puede estar
      // aún en su primer pulso) tienen que poder anotar el flanco en pendientesObs. Si liberáramos
      // después, la anotación se saltaría este flanco. Como estamos DENTRO del setTimeout de este
      // observador, no puede re-entrar síncronamente a sí mismo aquí.
      apagones.delete('obs:' + kObs);
      // BUG-RS20: el flanco de bajada del observador también es un cambio de bloque, así que hay
      // que notificar a los observadores vecinos aquí también. Sin esto, la propagación funcionaría
      // en el disparo pero no en el pulso completo (encendido→apagado), dejando a los observadores
      // en cadena parpadeando desincronizados.
      notificarObservadoresVecinos(obsX, obsY, obsZ);
      var dirAtrasOff = atrasDe(obsX, obsY, obsZ);
      var rxOff = obsX + DIRS[dirAtrasOff][0], ryOff = obsY + DIRS[dirAtrasOff][1], rzOff = obsZ + DIRS[dirAtrasOff][2];
      var cRxOff = cfgEn(rxOff, ryOff, rzOff);
      if (cRxOff) {
        encolar(rxOff, ryOff, rzOff, true);
        if (typeof cRxOff.alRecibirSeñal === 'function') {
          var antOff = potencia.get(cl(rxOff, ryOff, rzOff)) || 15;
          try { cRxOff.alRecibirSeñal({ x: rxOff, y: ryOff, z: rzOff, clave: mc.blockKey[idEn(rxOff, ryOff, rzOff)] }, 0, antOff); } catch (e) {}
        }
      }
      pedirDrenado();
      // Si durante el pulso se acumularon flancos (BUG-RS21), procesar UNO ahora — se re-dispara
      // como un nuevo pulso. Con la cadencia natural de 100 ms el observador «reacciona a la
      // subida y a la bajada» del vecino y la antorcha final ve 2 parpadeos por cada evento.
      if (pendientesObs.has(kObs)) {
        pendientesObs.delete(kObs);
        var c2 = cfgEn(obsX, obsY, obsZ);
        if (c2 && esObservador(c2)) dispararObservador(obsX, obsY, obsZ, c2);
      }
    }, 100));
  }

  // `sinFlanco` = la celda hay que repasarla pero NO ha cambiado de bloque, así que no hay nada que
  // observar (ver encender()). Todo lo demás sigue igual: lo que se salta es el flanco, no el repaso.
  function encolarVecinos(x, y, z, sinFlanco) {
    if (cfgEn(x, y, z) || potencia.has(cl(x, y, z))) encolar(x, y, z, true);    // esta es la que estrena
    encolarPuenteando(x, y, z);
    if (!sinFlanco) notificarObservadoresVecinos(x, y, z);
  }

  // Un cambio de bloque en (x,y,z) dispara los observadores vecinos que le tengan a él DELANTE.
  // Extraído de encolarVecinos porque las escrituras del propio motor (dispararObservador) van
  // protegidas por yoEscribiendo=true —para no re-encolarse a sí mismas—, y ese mismo centinela
  // hace que el envoltorio de mcSetBlock salte encolarVecinos. Sin este helper, un observador que
  // cambia de estado no puede propagar su cambio a otro observador que lo tenga delante (BUG-RS20).
  // La cascada A→B→A no se hace infinita: apagones.has(...) al principio de dispararObservador
  // corta las re-entradas mientras dura el pulso de un observador ya disparado.
  function notificarObservadoresVecinos(x, y, z) {
    for (var i = 0; i < 6; i++) {
      var nx = x + DIRS[i][0], ny = y + DIRS[i][1], nz = z + DIRS[i][2];
      var c = cfgEn(nx, ny, nz);
      if (!c || !esObservador(c)) continue;
      var dirFrente = frenteDe(nx, ny, nz);
      // El observador mira hacia la celda tocada: su frente = opuesto al vector vecino→observador
      if (DIRS[dirFrente][0] === -DIRS[i][0] && DIRS[dirFrente][1] === -DIRS[i][1] && DIRS[dirFrente][2] === -DIRS[i][2]) {
        dispararObservador(nx, ny, nz, c);
      }
    }
  }

  // Vecinos de circuito, y los de más allá de un bloque macizo. Nunca encadena bloque → bloque, así
  // que el techo son 6 + 6·6 lecturas de array.
  function encolarPuenteando(x, y, z) {
    for (var i = 0; i < 6; i++) {
      var nx = x + DIRS[i][0], ny = y + DIRS[i][1], nz = z + DIRS[i][2];
      if (cfgEn(nx, ny, nz)) { encolar(nx, ny, nz); continue; }
      if (!bloqueEnergizable(nx, ny, nz)) continue;
      for (var j = 0; j < 6; j++) {
        if (j === (i ^ 1)) continue;                                            // por ahí acabo de venir
        var mx = nx + DIRS[j][0], my = ny + DIRS[j][1], mz = nz + DIRS[j][2];
        if (cfgEn(mx, my, mz)) encolar(mx, my, mz);
      }
    }
  }

  var pendiente = 0;
  function pedirDrenado() {
    if (pendiente || (!cola.size && !esperando.size)) return;   // `esperando` también reclama pasadas
    pendiente = requestAnimationFrame(function () { pendiente = 0; drenar(); });
  }

  // Coalescencia de re-mallado (PERF-RS1). Un pulso de observador (dispararObservador) llamaba a
  // `remallar([[nx,ny,nz]])` inmediatamente tras cada mcSetBlock, dos veces por pulso (subida y
  // bajada). Con la cadena de 2^N pulsos que introducen BUG-RS20/21, se llamaba a mcRemeshAround
  // 2·2^N veces por evento, cada una re-mallando un chunk 16×48×16 (y sus vecinos). Ahora todas las
  // celdas tocadas en el mismo tick del event loop se acumulan aquí y se procesan al terminar el
  // rAF con UNA sola llamada, con la caja envolvente. `drenar()` mantiene su `tocadas[]` local pero
  // lo vuelca también aquí — un único punto de re-mallado.
  var tocadasRemallar = [];
  var rafRemallar = 0;
  function procesarRemallar() {
    rafRemallar = 0;
    if (!tocadasRemallar.length) return;
    var x0 = tocadasRemallar[0][0], x1 = x0, z0 = tocadasRemallar[0][2], z1 = z0;
    for (var i = 1; i < tocadasRemallar.length; i++) {
      var t = tocadasRemallar[i];
      if (t[0] < x0) x0 = t[0]; else if (t[0] > x1) x1 = t[0];
      if (t[2] < z0) z0 = t[2]; else if (t[2] > z1) z1 = t[2];
    }
    tocadasRemallar.length = 0;
    mcRemeshAround(x0, z0, x1, z1);
    if (typeof mcScheduleSave === 'function') mcScheduleSave();
  }
  function pedirRemallar(x, y, z) {
    tocadasRemallar.push([x, y, z]);
    if (!rafRemallar) rafRemallar = requestAnimationFrame(procesarRemallar);
  }

  // Cuánta señal LLEGA a una celda desde sus vecinos: el máximo de lo que presentan los 6.
  //
  // La pérdida del cable se cobra SOLO en el salto cable→cable, que es la regla de Minecraft y la que
  // da el tendido de 15 bloques: una palanca deja el primer cable a 15, el siguiente a 14… y una
  // lámpara pegada a un cable de nivel 3 ve 3, no 2. Cobrarla en todo salto haría que un cable largo
  // encendiera lámparas con un nivel distinto según por dónde se mire.
  function señalQueLlega(x, y, z, cfgYo) {
    var yoCable = !!(cfgYo && cfgYo.conduce), n = 0;
    var atras = (cfgYo && cfgYo.mira) ? atrasDe(x, y, z) : -1;   // −1 = escucho por los seis lados
    for (var i = 0; i < 6; i++) {
      if (atras >= 0 && i !== atras) continue;                   // solo escucha por su espalda
      var nx = x + DIRS[i][0], ny = y + DIRS[i][1], nz = z + DIRS[i][2];
      var c = cfgEn(nx, ny, nz);
      if (!c) {
        // El vecino no es una pieza, pero un bloque macizo transporta lo que recibe por el otro lado.
        // Al cable solo le vale la energía FUERTE; a cualquier otra pieza le vale también la débil.
        if (bloqueEnergizable(nx, ny, nz)) {
          var sb = energiaDeBloque(nx, ny, nz, !yoCable, x, y, z);
          if (sb > n) n = sb;                                    // sin pérdida: no es un salto cable→cable
        }
        continue;
      }
      var s = salidaDe(nx, ny, nz, c, i ^ 1);                    // yo estoy, para él, en la dirección i^1
      if (s && yoCable && c.conduce) s -= c.conduce.perdida;
      if (s > n) n = s;
    }
    return n;
  }

  // Un repaso arranca con `forzar`: al cargar el mundo, `potencia` está vacía, así que una lámpara
  // guardada ENCENDIDA cuya fuente ya no existe daría nivel 0 === antes 0 y se saltaría — quedándose
  // encendida para siempre. Con forzar se aplica igual, y aplicar() no toca nada si ya está bien.
  var forzar = false;

  function drenar() {
    if (drenando || (!cola.size && !esperando.size)) return;
    drenando = true;
    pasada++;
    var tocadas = [];       // celdas cuyo bloque cambió: hay que re-mallar y re-alumbrar
    var cambios = new Map();// clave → veces que ha cambiado de estado en ESTE drenado (anti-oscilación)
    var repesca = new Map();// cables que el flanco de bajada tiró a 0 teniendo señal de verdad
    var n = 0;

    // Las que han cumplido su cuenta atrás vuelven a la cola marcadas: esta vez SÍ se aplican. Se
    // recalcula el nivel en vez de usar el que se guardó, porque la entrada ha podido cambiar
    // durante la espera y lo que vale es lo que hay AHORA.
    var vencidas = null;
    if (esperando.size) esperando.forEach(function (e, k) {
      if (e.cuando > pasada) return;
      esperando.delete(k);
      (vencidas || (vencidas = new Set())).add(k);
      cola.set(k, [e.x, e.y, e.z]);
    });

    try {
      while ((cola.size || repesca.size) && n++ < MAX_POR_DRENADO) {
        // La repesca solo entra cuando la cola se ha vaciado: para entonces el desplome ya ha
        // terminado y las vecinas presentan su valor DEFINITIVO, que es justo lo que le faltaba
        // saber al cable para decidir si de verdad se queda a cero.
        if (!cola.size) { repesca.forEach(function (q, k) { cola.set(k, q); }); repesca.clear(); }
        var it = cola.entries().next().value;
        cola.delete(it[0]);
        var estrena = estrenadas.delete(it[0]);   // se consume aquí: aunque la celda ya no sea circuito
        var p = it[1], x = p[0], y = p[1], z = p[2];
        var cfg = cfgEn(x, y, z);
        if (!cfg) { potencia.delete(it[0]); continue; }          // ahí ya no hay nada del circuito
        if (esObservador(cfg)) {
          continue; // Los observadores no calculan señal de entrada: su pulso lo dispara el cambio delante
        }

        var nivel = señalQueLlega(x, y, z, cfg);
        var antes = potencia.get(it[0]) || 0;

        // FLANCO DE BAJADA DEL CABLE — el problema clásico del tendido. Al quitar la fuente, cada
        // celda sigue viendo a su vecina con el nivel VIEJO, calcula uno menos y se queda encendida:
        // el cable se alimentaría a sí mismo. La salida es no fiarse de una bajada: la celda cae a 0
        // y avisa a sus vecinas, que caen también, hasta que una fuente de verdad vuelve a rellenar
        // el tendido en la misma pasada. Converge porque solo las fuentes crean señal.
        //
        // ⚠️ Y REPESCA, que es la otra mitad de la regla. «Hasta que una fuente vuelva a rellenar el
        // tendido» no pasa solo: las vecinas avisan cuando CAMBIAN, y una vecina que ya tenía el
        // valor bueno no cambia, así que no avisa a nadie. El cable que se tiró a 0 por un desplome
        // que no le tocaba se quedaba a 0 PARA SIEMPRE, con su propio recálculo diciendo 12. Se veía
        // en el biestable del ejemplo 6: al soltar el botón de RESET el anillo se moría entero y el
        // bit se le olvidaba. Así que si el cable tenía señal de verdad, se anota y se vuelve a mirar
        // cuando la cola se vacíe.
        if (cfg.conduce && nivel < antes) {
          if (nivel > 0) repesca.set(it[0], it[1]);
          nivel = 0;
        }

        // Una celda que ha cumplido su espera se aplica aunque el nivel salga igual: es el flanco lo
        // que ha vencido, no el valor.
        // Se CONSUME al usarla, no se consulta: una celda puede volver a la cola dentro de la misma
        // pasada (su propio cambio despierta a la vecina, que la despierta a ella), y si la marca
        // siguiera puesta la segunda visita también se saltaría el retardo — el reloj se convertiría
        // en el bucle combinacional que el retardo venía justamente a evitar.
        var vence = !!(vencidas && vencidas.delete(it[0]));
        if (nivel === antes && !vence && !estrena && !cfg._forzar && !forzar) continue; // nada que hacer

        // RETARDO — la celda decide ahora y actúa DESPUÉS. Mientras espera no toca `potencia`, así
        // que sigue presentando a sus vecinas el valor viejo: eso es exactamente lo que hace un
        // repetidor de Minecraft, y es lo que separa el cambio de la causa que lo provocó. Sin esta
        // separación un inversor realimentado se resuelve dentro de la misma pasada (bucle
        // combinacional → se funde); con ella es un reloj, y con relojes hay lógica secuencial.
        // Una celda ESTRENADA no espera: acaban de ponerla y lo que hace es tomar su estado inicial,
        // no reaccionar a un cambio. Un repetidor recién puesto que se quedara dos pasadas en blanco
        // parecería roto, y además el atajo de abajo lo habría descartado por «ya va camino de eso».
        if (cfg.retardo && !vence && !estrena) {
          var yaVa = esperando.get(it[0]);
          if ((yaVa ? yaVa.nivel : antes) === nivel) continue;   // ya va camino de ese valor
          esperando.set(it[0], { x: x, y: y, z: z, nivel: nivel, cuando: pasada + cfg.retardo });
          continue;
        }

        // Un inversor realimentado (dos antorchas mirándose) es un RELOJ, y es legítimo — pero uno
        // hecho sin querer dejaría la cola viva para siempre a un rAF por vuelta. Se corta como en
        // Minecraft: la celda que cambia demasiadas veces en la misma pasada se «funde» y se avisa.
        var veces = (cambios.get(it[0]) || 0) + 1;
        cambios.set(it[0], veces);
        if (veces > MAX_CAMBIOS_POR_CELDA) {
          avisaUnaVez('osc:' + it[0], 'circuito oscilando en ' + it[0] + ': lo paro aquí (¿un inversor realimentado?)');
          continue;
        }

        if (nivel > 0) potencia.set(it[0], nivel); else potencia.delete(it[0]);

        if (aplicar(x, y, z, cfg, nivel, antes)) tocadas.push([x, y, z]);
        // El cambio puede alimentar (o dejar de alimentar) a los de al lado — y a los del otro lado de
        // un bloque macizo, que ahora hace de puente.
        if (cfg.emite || cfg.encendida || cfg.conduce || cfg.propaga) encolarPuenteando(x, y, z);
      }
    } finally { drenando = false; forzar = false; }

    if (tocadas.length) remallar(tocadas);
    // Queda cola, o quedan cuentas atrás: en ambos casos hace falta otra pasada. Un reloj vive
    // justo de esto — su cola se vacía y lo que lo mantiene en marcha es `esperando`.
    if (cola.size || esperando.size) pedirDrenado();
  }

  // ── aplicar el efecto a una celda ───────────────────────────────────────────────────────────
  // Devuelve true si CAMBIÓ el bloque (y por tanto hay que re-mallar / re-alumbrar).
  function aplicar(x, y, z, cfg, nivel, antes) {
    var cambio = false;
    // El umbral es lo que separa una lámpara (1) de un comparador (2, 3…); invertida es la antorcha
    // de verdad de Minecraft, que luce cuando NO recibe — y es la que convierte esto en un NOR y deja
    // construir puertas lógicas. Las dos cosas son un campo, no un tipo de bloque aparte.
    var encendido = cfg.invertida ? (nivel < cfg.umbral) : (nivel >= cfg.umbral);
    // `manual` = la celda es una ENTRADA del circuito (palanca, botón, placa): su estado lo pone el
    // jugador con conmutar(), no la señal que le llega. Sigue avisando a las vecinas y sigue
    // emitiendo, pero nadie le cambia el bloque por debajo — si no, el drenado la apagaría sola.
    if ((cfg.encendida || cfg.apagada) && !cfg.manual) {
      // Lámpara: encendida y apagada son DOS MATERIALES (como redstone_lamp / lit_redstone_lamp en
      // Minecraft). Cambiar el id de la celda es lo que mueve la luz: mcSetBlock llama a
      // mcGlowTocada, que mantiene el índice de emisores de la rejilla, y mcComputeBlockLight
      // siembra desde ahí. O sea que «encender» y «alumbrar» son la MISMA operación.
      var quiero = encendido ? cfg.encendida : cfg.apagada;
      if (quiero) {
        // La orientación se ARRASTRA (ver conOri): una antorcha puesta con '@3' tiene que encenderse
        // en '@3', o al encenderse se enderezaría sola y además dejaría de escuchar por donde
        // escuchaba.
        quiero = conOri(quiero, x, y, z);
        var id = mc.name2id[quiero];
        if (id && mc.grid[mcIdx(x, y, z)] !== id) {
          yoEscribiendo = true;
          try { mcSetBlock(x, y, z, id); } finally { yoEscribiendo = false; }
          cambio = true;
        } else if (!id) cargarYReintentar(quiero, x, y, z);
      }
    }
    if (typeof cfg.alRecibirSeñal === 'function' && nivel !== antes) {
      try { cfg.alRecibirSeñal({ x: x, y: y, z: z, clave: mc.blockKey[idEn(x, y, z)] }, nivel, antes); }
      catch (e) { avisaUnaVez('cb:' + cfg._clave, 'alRecibirSeñal de «' + cfg._clave + '» ha lanzado: ' + e.message); }
    }
    return cambio;
  }

  // Red de seguridad para los circuitos declarados SIN precarga (los del autoarranque): si al
  // encender falta el material en la paleta, se carga ahora y se vuelve a encolar la celda. Se paga
  // una vez y solo en el mundo donde de verdad hay circuito — que es justo lo que no se puede pagar
  // en el arranque de todos los mundos. game.addMaterial re-hornea paleta y atlas, así que avisa.
  var cargando = Object.create(null), reintentado = Object.create(null);
  function cargarYReintentar(clave, x, y, z, luego) {
    // El reintento va FORZADO. drenar() apunta la potencia ANTES de llamar a aplicar(), así que al
    // volver la celda ya tiene su nivel y `nivel === antes` la descartaría: la señal habría llegado
    // pero el bloque no habría cambiado nunca. Con forzar se aplica igual, y aplicar() no hace nada
    // si resulta que ya estaba bien.
    //
    // `luego` es para las entradas manuales, que no se arreglan por la cola (ver encender): ahí lo
    // que se repite es el gesto. UNA vez — si tras cargar el material sigue sin estar en la paleta,
    // repetir el gesto volvería a pedir la carga y se quedaría dando vueltas.
    var reintenta = function () {
      if (typeof luego === 'function') {
        if (reintentado[clave]) { avisaUnaVez('mat:' + clave, '«' + clave + '» no aparece en la paleta ni tras cargarlo'); return; }
        reintentado[clave] = true;
        luego();
        if (mc.name2id[clave]) delete reintentado[clave];   // salió bien: no se estorba a la próxima
        return;
      }
      invalidar(); forzar = true; encolar(x, y, z);
    };
    if (cargando[clave]) { cargando[clave].then(reintenta); return; }
    avisaUnaVez('carga:' + clave, 'cargando «' + clave + '» por primera vez (tarda un momento)');
    cargando[clave] = game.addMaterial(clave).then(reintenta)
      .catch(function (e) { avisaUnaVez('mat:' + clave, 'no he podido cargar «' + clave + '»: ' + e.message); });
  }

  // Un solo re-mallado para TODO el drenado, no uno por lámpara: la caja de mcRemeshAround acepta
  // dos esquinas, así que un circuito entero cuesta lo que su caja envolvente.
  // PERF-RS1: no llama a mcRemeshAround directamente — vuelca las celdas al buffer coalescido de
  // pedirRemallar, que agenda UNA sola re-mallada al final del rAF con la caja envolvente de todo
  // lo tocado en el mismo tick. Sin esto, una cadena de N observadores costaba 2·2^N llamadas.
  function remallar(tocadas) {
    for (var i = 0; i < tocadas.length; i++) tocadasRemallar.push(tocadas[i]);
    if (!rafRemallar) rafRemallar = requestAnimationFrame(procesarRemallar);
  }

  var avisados = Object.create(null);
  function avisaUnaVez(k, msg) {
    if (avisados[k]) return; avisados[k] = true;
    console.warn('[redstone] ' + msg);
    if (typeof toast === 'function') toast('redstone: ' + msg);   // el dueño juega en el móvil
  }

  // ── el enganche: TODA escritura de la rejilla pasa por mcSetBlock ────────────────────────────
  // Es el embudo de poner, romper, pintar, deshacer/rehacer, setVoxel y la carga diferida de una
  // textura. Los caminos que NO pasan por aquí son los de generar/cargar el mundo entero, que
  // escriben mc.grid directamente — y ahí no queremos notificaciones: se revisa al final, no 10⁷ veces.
  // Reejecutar este snippet DESENVUELVE el anterior por _orig en vez de apilar otro (si no, cada
  // recarga multiplicaría el trabajo por cada escritura del mundo).
  var previo = window.mcSetBlock && window.mcSetBlock._redstone ? window.mcSetBlock : null;
  var origSet = previo ? previo._orig : window.mcSetBlock;
  var envuelto = function (x, y, z, id) {
    if (yoEscribiendo || !hayCircuito) return origSet(x, y, z, id);
    var antes = dentro(x, y, z) ? mc.grid[mcIdx(x, y, z)] : -1;
    var r = origSet(x, y, z, id);
    if (antes !== -1 && mc.grid[mcIdx(x, y, z)] !== antes) encolarVecinos(x, y, z);
    return r;
  };
  envuelto._redstone = VERSION;
  envuelto._orig = origSet;
  window.mcSetBlock = envuelto;

  // ── API pública ─────────────────────────────────────────────────────────────────────────────
  var api = {
    version: VERSION,
    // PERF-RS1: si `false`, los pulsos del observador NO disparan re-mallado del chunk. El circuito
    // sigue funcionando (mc.grid cambia, la señal se propaga, la antorcha conectada se enciende),
    // pero el observador NO cambia visualmente durante el pulso. Ahorra 1 mcMeshChunk por flanco:
    // ~2 ms/flanco en GPU real, 10× en SwiftShader. Poner a false si los fps caen con muchos
    // observadores; poner a true (defecto) para el efecto visual del pulso.
    pulsoVisible: true,

    define: function (clave, cfg) {
      if (!clave || typeof clave !== 'string') { console.warn('[redstone] define(clave, cfg): falta la clave'); return null; }
      cfg = cfg || {};
      // ── el vocabulario ──────────────────────────────────────────────────────────────────────
      // Seis campos planos, sin `type` ni enums de acción: un material es un CONJUNTO DE
      // CAPACIDADES, no uno de cuatro tipos. `emite` lo hace fuente, `encendida` lo hace lámpara,
      // `conduce` lo hace cable, y nada impide que sea las tres — una antorcha encendida es lámpara
      // Y fuente a la vez, que es justo lo que un discriminador de tipo no sabría decir.
      var nivelValido = function (v, pordef) { v = +v; return isFinite(v) ? Math.max(0, Math.min(15, v)) : pordef; };
      var c = {
        _clave: clave,
        emite: nivelValido(cfg.emite !== undefined ? cfg.emite : cfg.power, 0),
        umbral: Math.max(1, nivelValido(cfg.umbral, 1)),   // señal mínima que cuenta como encendido
        invertida: !!cfg.invertida,              // luce cuando NO recibe (la antorcha de Minecraft)
        conduce: cfg.conduce ? { perdida: Math.max(0, Math.min(15, +(cfg.conduce.perdida !== undefined ? cfg.conduce.perdida : 1))) }
                             : null,
        encendida: cfg.encendida || null,
        apagada: cfg.apagada || clave,          // por defecto, «apagada» es este mismo material
        retardo: Math.max(0, Math.min(64, Math.floor(+cfg.retardo || 0))),  // pasadas de espera
        manual: !!cfg.manual,                   // ENTRADA del circuito: la gira el jugador, no la señal
        pulso: Math.max(0, Math.floor(+cfg.pulso || 0)),                    // ms hasta soltarse sola
        mira: !!cfg.mira,                       // escucha solo por su espalda (el giro de la clave)
        soloAlFrente: !!cfg.soloAlFrente,       // …y además emite SOLO por delante (el repetidor)
        soloAlAtras: !!cfg.soloAlAtras,         // …y además emite SOLO por detrás (el observador)
        propaga: !!cfg.propaga,
        alRecibirSeñal: typeof cfg.alRecibirSeñal === 'function' ? cfg.alRecibirSeñal
                      : (typeof cfg.alRecibirSenal === 'function' ? cfg.alRecibirSenal : null)
      };
      tabla[clave] = c;
      // La variante ENCENDIDA se registra con la misma cfg. Sin esto la lámpara se enciende y ya no
      // vuelve: al cambiar el id de la celda, su clave pasa a ser la encendida, cfgEn() no la
      // encuentra en la tabla y la celda se cae del circuito — no se apagaría jamás. Minecraft
      // registra redstone_lamp y lit_redstone_lamp como dos bloques del mismo comportamiento.
      if (c.encendida && c.encendida !== clave) tabla[c.encendida] = c;
      hayCircuito = true;
      invalidar();
      c.power = c.emite;   // el nombre viejo, por si algo de fuera lo lee
      // `callado`: la misma pieza se registra una vez por espacio de nombres (hab: y asset:), y
      // anunciar las dos sería doblar el arranque en líneas que dicen lo mismo.
      if (!cfg.callado) console.log('[redstone] ' + clave + (c.emite ? ' · emite ' + c.emite : '')
        + (c.conduce ? ' · cable (pérdida ' + c.conduce.perdida + ')' : '')
        + (c.encendida ? ' · se enciende como ' + c.encendida : '')
        + (c.invertida ? ' · INVERTIDA (luce sin señal)' : '')
        + (c.umbral > 1 ? ' · umbral ' + c.umbral : '')
        + (c.retardo ? ' · retardo ' + c.retardo + ' pasada(s)' : '')
        + (c.mira ? ' · MIRA (escucha solo por su espalda; el giro vive en la clave)' : '')
        + (c.soloAlFrente ? ' · SOLO AL FRENTE (no emite de lado ni hacia arriba)' : '')
        + (c.manual ? ' · MANUAL (entrada: conmutar' + (c.pulso ? ', se suelta en ' + c.pulso + ' ms' : '') + ')' : '')
        + (c.alRecibirSeñal ? ' · con alRecibirSeñal' : ''));
      // precargar:false — para declarar circuitos en el AUTOARRANQUE, que corre en todos los mundos.
      // Dar de alta un material que ese mundo no usa costaría un mcMeshAll (~3 873 ms en 512×40×512)
      // en cada carga, a cambio de nada. Sin precarga, un mundo sin redstone no paga un solo ms: sin
      // el material en la paleta ninguna celda puede tener su id. Si algún día aparece, la carga la
      // hace cargarYReintentar() en el momento de encender, una vez.
      if (cfg.precargar === false) return null;

      // Los dos materiales, cargados YA (ver decisión 3 de la cabecera). Es asíncrono, así que se
      // devuelve la promesa: quien planta el circuito debe esperarla o el primer clic no encontrará
      // el material encendido y solo saldría el aviso.
      var faltan = [clave];
      if (c.encendida) faltan.push(c.encendida);
      if (c.apagada && c.apagada !== clave) faltan.push(c.apagada);
      var p = Promise.all(faltan.map(function (k) {
        return mc.name2id[k] ? Promise.resolve(mc.name2id[k])
                             : game.addMaterial(k).catch(function (e) {
                                 avisaUnaVez('mat:' + k, 'no he podido cargar «' + k + '»: ' + e.message); return 0; });
      })).then(function (ids) { invalidar(); return ids; });
      return p;
    },

    quitar: function (clave) {
      if (!tabla[clave]) { console.warn('[redstone] «' + clave + '» no estaba definido'); return false; }
      var c = tabla[clave];
      delete tabla[clave];
      if (c.encendida && tabla[c.encendida] === c) delete tabla[c.encendida];   // y su alias encendido
      hayCircuito = Object.keys(tabla).length > 0;
      invalidar();
      return true;
    },

    // Válvula de escape del transporte por bloques macizos: un material declarado AISLANTE no lleva la
    // señal a lo que tenga pegado. Vive aquí y no en `define` porque un aislante no es una pieza de
    // circuito: no entra en la cola ni gasta una entrada de `potencia`, solo deja de hacer de puente.
    //   game.redstone.aislante('hab:cristal')          ← deja de transportar
    //   game.redstone.aislante('hab:cristal', false)   ← vuelve a transportar
    //   game.redstone.aislante()                       ← los que hay
    aislante: function (clave, si) {
      if (clave === undefined) return Object.keys(aislantes);
      if (si === undefined) si = true;
      if (si) aislantes[clave] = true; else delete aislantes[clave];
      invalidar();
      if (hayCircuito) api.repasarMundo();   // lo que ya iba por ese material tiene que enterarse
      return !!si;
    },

    lista: function () {
      return Object.keys(tabla).map(function (k) {
        var c = tabla[k];
        return { clave: k, emite: c.emite, umbral: c.umbral, invertida: c.invertida,
                 cable: c.conduce ? c.conduce.perdida : null, conduce: !!c.conduce,
                 encendida: c.encendida, retardo: c.retardo, manual: c.manual, pulso: c.pulso,
                 mira: c.mira, soloAlFrente: c.soloAlFrente,
                 alRecibirSeñal: !!c.alRecibirSeñal };
      });
    },

    // El descubridor: plántate delante y pregunta. Sin esto, depurar un circuito que no enciende es
    // a ciegas — y saber si la celda tiene el material que crees es la mitad de las veces la respuesta.
    info: function (x, y, z) {
      if (x === undefined) { var a = game.aim ? game.aim() : null; if (!a) { console.warn('[redstone] info(x,y,z)'); return null; } x = a[0]; y = a[1]; z = a[2]; }
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      var id = idEn(x, y, z), k = mc.blockKey[id] || null, cfg = cfgEn(x, y, z);
      var vec = DIRS.map(function (d, i) {
        var nx = x + d[0], ny = y + d[1], nz = z + d[2], c2 = cfgEn(nx, ny, nz);
        var e = { d: d.join(','), hacia: NOMDIR[i], clave: claveEn(nx, ny, nz),
                  salida: salidaDe(nx, ny, nz, c2, i ^ 1) };
        // Un bloque macizo no es circuito pero SÍ transporta, así que su energía es media respuesta a
        // «le llega corriente y no enciende». `debil` es lo que sacan los cables y solo lo leen las
        // piezas que no son cable; `fuerte` lo lee todo, cable incluido.
        if (!c2 && bloqueEnergizable(nx, ny, nz)) {
          e.bloque = { fuerte: energiaDeBloque(nx, ny, nz, false, x, y, z),
                       debil: energiaDeBloque(nx, ny, nz, true, x, y, z) };
        }
        return e;
      });
      // Por dónde ESCUCHA y por dónde EMITE, dicho con todas las letras. Sin esto, una pieza girada
      // que no enciende no se distingue de una pieza rota: se ve el cable pegado, se ve que da 15, y
      // no hay forma de saber que ese lado no es el suyo. Costó un ticket entero (BUG-RS2), donde
      // cinco repetidores en fila alimentados todos por el mismo lado tenían cuatro giros distintos
      // y solo encendían los dos que de verdad daban la espalda al cable.
      var escucha = cfg && cfg.mira ? atrasDe(x, y, z) : -1;
      var frente = cfg && (cfg.mira || cfg.soloAlFrente) ? frenteDe(x, y, z) : -1;
      var desperdiciada = escucha < 0 ? [] : vec.filter(function (v, i) { return i !== escucha && v.salida > 0; });
      var r = { pos: [x, y, z], clave: k, esCircuito: !!cfg, recibe: potencia.get(cl(x, y, z)) || 0,
                llega: señalQueLlega(x, y, z, cfg), saca: salidaDe(x, y, z, cfg),
                encendida: cfg ? encendidaEn(x, y, z, cfg) : null,
                escuchaPor: !cfg ? null : (escucha < 0 ? 'los 6 lados' : NOMDIR[escucha]),
                emitePor: !cfg || !cfg.emite ? null
                        : (cfg.soloAlFrente ? NOMDIR[frente]
                        : (escucha < 0 ? 'los 6 lados' : 'los 5 lados menos ' + NOMDIR[escucha])),
                // La pregunta que de verdad se hace quien mira: «le llega corriente, ¿por qué no enciende?»
                pista: desperdiciada.length && !señalQueLlega(x, y, z, cfg)
                     ? 'tiene señal por ' + desperdiciada.map(function (v) { return v.hacia; }).join(' y ')
                       + ', pero esta pieza solo escucha por ' + NOMDIR[escucha]
                       + ' (gírala con R hasta que su espalda dé al cable)'
                     : null,
                vecinos: vec, enCola: cola.has(cl(x, y, z)),
                // Cuánto le queda por esperar: sin esto un repetidor «que no hace nada» es un misterio.
                esperando: esperando.has(cl(x, y, z)) ? (esperando.get(cl(x, y, z)).cuando - pasada) : 0 };
      console.log('[redstone]', r);
      return r;
    },

    revisar: function (x, y, z) { encolarVecinos(Math.floor(x), Math.floor(y), Math.floor(z)); return true; },

    // ── entradas del circuito ───────────────────────────────────────────────────────────────────
    // Una palanca no es «otro tipo de bloque»: es un material `manual` con pareja apagada/encendida,
    // igual que la lámpara. La única diferencia es QUIÉN decide su estado — aquí, quien llame a esto.
    // Por eso el gesto (clic derecho, pisar, un temporizador) vive FUERA del motor: el motor solo
    // sabe girar la celda y avisar a las vecinas.
    encender: function (x, y, z, on) {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      var cfg = cfgEn(x, y, z);
      if (!cfg) return false;
      if (!cfg.manual) { avisaUnaVez('man:' + cfg._clave, '«' + cfg._clave + '» no es manual: su estado lo decide la señal, no encender()'); return false; }
      if (!cfg.encendida) { avisaUnaVez('par:' + cfg._clave, '«' + cfg._clave + '» no tiene pareja `encendida`: no hay nada que girar'); return false; }
      if (on === undefined) on = true;
      // Con la orientación puesta (ver conOri): una placa colocada con vuelco se ponía DE PIE al
      // pisarla, y al soltarse se quedaba de pie, porque aquí se cambiaba a la clave a pelo.
      var quiero = conOri(on ? cfg.encendida : cfg.apagada, x, y, z);
      var id = mc.name2id[quiero];
      // Un material `manual` no se arregla volviendo a encolar la celda —aplicar() no le toca el
      // bloque a propósito—, así que hay que repetir el GESTO cuando termine la carga. Sin esto, la
      // primera vez que se toca una palanca recién puesta en un mapa no pasa absolutamente nada.
      var self = this;
      if (!id) { cargarYReintentar(quiero, x, y, z, function () { self.encender(x, y, z, on); }); return false; }

      var k = cl(x, y, z);
      if (apagones.has(k)) { clearTimeout(apagones.get(k)); apagones.delete(k); }
      var cambia = mc.grid[mcIdx(x, y, z)] !== id;
      if (cambia) {
        yoEscribiendo = true;
        try { mcSetBlock(x, y, z, id); } finally { yoEscribiendo = false; }
        remallar([[x, y, z]]);
      }
      // Sin cambio de bloque NO hay flanco, y un observador solo reacciona a flancos. La celda sí
      // se re-encola (el circuito puede estar por repasar: es lo que hace útil re-encender algo ya
      // encendido), pero se salta notificarObservadoresVecinos, que es lo que encolarVecinos añade
      // de más. Se veía en cuanto algo re-encendía a ritmo lo que ya estaba encendido —una placa de
      // presión sosteniéndose mientras la pisas—: el observador que la miraba pulsaba a ese ritmo
      // sin que la placa hubiera cambiado jamás de estado (BUG-RS22).
      encolarVecinos(x, y, z, !cambia);
      pedirDrenado();

      // `pulso` la suelta sola: es la diferencia entre una palanca (se queda) y un botón o una placa
      // de presión (vuelven). En milisegundos y no en pasadas a propósito — esto lo mide el jugador.
      if (on && cfg.pulso) {
        var self = this;
        apagones.set(k, setTimeout(function () { apagones.delete(k); self.encender(x, y, z, false); }, cfg.pulso));
      }
      return true;
    },

    // Como encender(), pero al revés y SIN protestar: conmutar() es «gírala si se puede», que es lo
    // que quiere quien engancha un clic derecho a todas las celdas del mundo. Devolver false calladita
    // deja al que llama seguir con su comportamiento normal.
    conmutar: function (x, y, z) {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      var cfg = cfgEn(x, y, z);
      if (!cfg || !cfg.manual || !cfg.encendida) return false;
      return this.encender(x, y, z, !encendidaEn(x, y, z, cfg));
    },

    // ¿Se puede girar a mano esta celda? La misma guarda que conmutar(), pero SIN girar nada: la
    // usa el gesto (redstone-piezas) para apuntar con manga ancha a las entradas.
    esManual: function (x, y, z) {
      var cfg = cfgEn(Math.floor(x), Math.floor(y), Math.floor(z));
      return !!(cfg && cfg.manual && cfg.encendida);
    },

    // Repaso de todo el mundo, para el arranque: un mapa puede traer el circuito ya montado en disco
    // y `potencia` nace vacía, así que hay que mirarlo una vez. Devuelve cuántas celdas del circuito
    // ha encontrado.
    //
    // ⚠️ La guarda de arriba es la que hace esto viable: un barrido de mc.grid cuesta ~60 ms en
    // 512×40×512, y NO se puede pagar en cada carga de cada mundo. Pero si ningún material del
    // circuito está en la paleta, ninguna celda puede tener su id — así que no hay nada que buscar y
    // se sale sin tocar la rejilla. Un mundo sin redstone cuesta un bucle sobre la paleta (~50).
    repasarMundo: function () {
      var ids = cacheIds(), hay = false;
      for (var i = 1; i < ids.length; i++) if (ids[i]) { hay = true; break; }
      if (!hay) return 0;

      // Las celdas que este repaso DESATASCA (observador y placa/botón guardados encendidos). Se
      // escriben en la rejilla a pelo, sin pasar por mcSetBlock, así que la malla no se entera sola:
      // hay que remallarlas al final o el mundo enseña la placa pisada con nadie encima.
      var g = mc.grid, NX = mc.dim.x, NY = mc.dim.y, NZ = mc.dim.z, n = 0, retocadas = [];
      for (var z = 0; z < NZ; z++) for (var y = 0; y < NY; y++) {
        var fila = y * NX + z * NX * NY;
        for (var x = 0; x < NX; x++) {
          var id = g[fila + x];
          var cfg = ids[id];
          if (!cfg) continue;
          // El observador-on es un pulso momentáneo (~100 ms) que nunca debería persistir en disco.
          // Si el mundo se guardó con uno encendido, se devuelve a off para no atascarlo para siempre.
          // Solo se toca si la variante ORIENTADA de off está en la paleta: caer al par.off sin girar
          // dejaría el observador con la orientación cambiada (BUG-RS19 secuela).
          if (esObservador(cfg) && claveBase(mc.blockKey[id] || '').indexOf('-on') > 0) {
            var par = parejaObservador(cfg._clave);
            var idOff = mc.name2id[conOri(par.off, x, y, z)];
            if (idOff && idOff !== id) { g[fila + x] = idOff; retocadas.push([x, y, z]); }
          }
          // La misma enfermedad, y por la misma razón, en las entradas de PULSO (placa, botón).
          // El estado de una pieza con pareja ES la clave de la rejilla (ver encendidaEn), y eso es
          // justo lo que hace que una palanca sobreviva a recargar el mundo sin persistir nada. Pero
          // a una placa no la suelta su clave: la suelta un setTimeout de `apagones`, que es memoria
          // de ESTA sesión y no se guarda con el mundo. Un mundo guardado con la placa pisada vuelve
          // con la celda en `-on`, sin temporizador que la suelte y sin nadie que se vaya a bajar de
          // ella: pegada para siempre, alimentando su puerta con nadie encima (BUG-RS25).
          // Con nadie encima, una entrada de pulso está apagada POR DEFINICIÓN; y si de verdad hay
          // alguien, su latido (`alSeguirPisando`, redstone-piezas) la re-enciende en el mismo frame.
          // `conOri` por lo mismo que arriba: la placa puede estar puesta con vuelco y caer a la
          // clave sin girar la pondría de pie.
          if (cfg.manual && cfg.pulso && cfg.encendida && claveBase(mc.blockKey[id] || '') === claveBase(cfg.encendida)) {
            var idSuelta = mc.name2id[conOri(cfg.apagada, x, y, z)];
            if (idSuelta && idSuelta !== id) { g[fila + x] = idSuelta; retocadas.push([x, y, z]); }
          }
          cola.set(cl(x, y, z), [x, y, z]); n++;
        }
      }
      if (retocadas.length) remallar(retocadas);
      if (n) { forzar = true; pedirDrenado(); console.log('[redstone] repaso: ' + n + ' celda(s) de circuito'
        + (retocadas.length ? ' · ' + retocadas.length + ' desatascada(s)' : '')); }
      return n;
    },

    // Drena YA, sin esperar al rAF. Es lo que usan los tests (y va bien para depurar a mano).
    tick: function () { if (pendiente) { cancelAnimationFrame(pendiente); pendiente = 0; } drenar(); if (rafRemallar) { cancelAnimationFrame(rafRemallar); procesarRemallar(); } return cola.size; },

    // Re-evalúa una caja entera. Hace falta al PLANTAR un circuito con setVoxel: durante el lote las
    // escrituras se encolan, pero si el material aún no estaba en la paleta la celda quedó pendiente.
    revisarCaja: function (x0, y0, z0, x1, y1, z1) {
      for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) for (var z = z0; z <= z1; z++) encolar(x, y, z, true);
      return cola.size;
    },

    _tabla: tabla, _potencia: potencia, _cola: cola, _esperando: esperando,
    _encolarVecinos: encolarVecinos,
    _pasada: function () { return pasada; }
  };

  // ── Rayos-X: el NIVEL de señal, celda a celda ───────────────────────────────────────────────
  // Lo pidió el dueño: «una línea que indique el power del bloque». Es lo único de un circuito que
  // no se ve mirándolo — la clave de la rejilla dice si una lámpara está encendida, pero no con
  // cuánto, y un cable a 1 y otro a 14 son el mismo bloque. Hasta ahora había que ir celda por
  // celda con .info(x,y,z); con rayos-X puestos el tendido entero se lee de un vistazo y se ve
  // DÓNDE muere la señal.
  //
  // Qué se enseña, y por qué son dos casos y no uno:
  //   pieza de circuito → «⚡ recibe» y, si saca algo distinto, «⚡ recibe → saca». Una fuente es
  //     «⚡ 0 → 15» (no recibe nada y entrega 15) y un repetidor «⚡ 9 → 15», que es justo la
  //     pregunta de por qué el tendido de después no se acorta.
  //   bloque macizo cualquiera → solo si de verdad está haciendo de puente (r1.2). Se marca la
  //     energía DÉBIL como tal, porque un cable no la lee: «le llega 12 débil y la lámpara de al
  //     lado enciende pero el cable no» deja de ser un misterio. Un «⚡ 0» en cada piedra del
  //     entorno serían ~245 etiquetas de ruido, así que el 0 no se pinta.
  function señalRayosX(x, y, z) {
    var cfg = cfgEn(x, y, z);
    if (cfg) {
      var recibe = potencia.get(cl(x, y, z)) || 0, saca = salidaDe(x, y, z, cfg);
      var ret = cfg.retardo ? ' (' + cfg.retardo + 't)' : '';
      return '⚡ ' + recibe + (saca !== recibe ? ' → ' + saca : '') + ret;
    }
    if (!bloqueEnergizable(x, y, z)) {
      var id = idEn(x, y, z);
      if (id && aisId && aisId[id]) return '🚫 aislante';
      return '';
    }
    var fuerte = energiaDeBloque(x, y, z, false);
    if (fuerte) return '⚡ ' + fuerte;
    var debil = energiaDeBloque(x, y, z, true);
    return debil ? '⚡ ' + debil + ' débil' : '';
  }

  // El hueco mcXrayExtra de app.js ya lo ocupa `mundo-autoarranque` (comportamientos y giros), y ahí
  // hay una ASIMETRÍA que es la que obliga a envolver en vez de asignar: aquel snippet hace
  // `window.mcXrayExtra = etiquetaRayosX` a pelo. Se ejecuta ANTES que este fichero (nos carga él,
  // vía redstone-arranque), así que envolver desde aquí encadena bien; y si se re-ejecuta y borra el
  // envoltorio, vuelve a cargarnos y se rehace solo. El sello _redstone evita apilarlo dos veces
  // cuando el que se re-ejecuta es este fichero.
  function envolverRayosX() {
    var antes = window.mcXrayExtra;
    if (typeof antes !== 'function') antes = null;
    else if (antes._redstone === VERSION) antes = antes._orig;      // re-ejecución: sustituir, no apilar
    var envuelto = function (clave, s, x, y, z) {
      var t = antes ? (antes(clave, s, x, y, z) || '') : '';
      // Solo bloques de rejilla: `s` es una estructura fina y el motor no las ve (idEn lee mc.grid),
      // así que su celda de origen contendría otra cosa y la cifra sería mentira.
      if (s || !hayCircuito || x === undefined) return t;
      var n = señalRayosX(x, y, z);
      return n ? (t ? t + '\n' + n : n) : t;
    };
    envuelto._redstone = VERSION;
    envuelto._orig = antes;
    window.mcXrayExtra = envuelto;
  }
  envolverRayosX();

  // PERF-RS1 · REQ-PERF1: auto-instrumentación. Cuando el profiler está activo, las funciones
  // internas críticas del motor de redstone se reasignan a versiones envueltas que suman tiempo en
  // el mismo acumulador de frame que ve `game.perfDump()`. Coste cuando el profiler está apagado:
  // 1 comparación por llamada (dentro de `game._perfMedir`). El motor de redstone dispara mucho
  // trabajo entre `mcTick` (setTimeouts de pulsos, cascadas de dispararObservador...) que era
  // invisible al profiler global. Con esto sí sale en el volcado como `rs.dispararObservador`, etc.
  if (typeof game !== 'undefined' && typeof game._perfMedir === 'function') {
    var _rsw = function (nombre, fn) {
      return function () {
        var self = this, args = arguments;
        return game._perfMedir(nombre, function () { return fn.apply(self, args); });
      };
    };
    dispararObservador = _rsw('rs.dispararObservador', dispararObservador);
    encolarVecinos = _rsw('rs.encolarVecinos', encolarVecinos);
    notificarObservadoresVecinos = _rsw('rs.notificarObservadoresVecinos', notificarObservadoresVecinos);
    drenar = _rsw('rs.drenar', drenar);
    procesarRemallar = _rsw('rs.procesarRemallar', procesarRemallar);
    encolarPuenteando = _rsw('rs.encolarPuenteando', encolarPuenteando);
    aplicar = _rsw('rs.aplicar', aplicar);
  }

  window.game.redstone = api;
  console.log('[redstone] ' + VERSION + ' listo. game.redstone.define(...) · .info(x,y,z) · .lista()');
})();
