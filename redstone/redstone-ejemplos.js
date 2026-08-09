// ══════════════════════════════════════════════════════════════════════════════════════════════
// REDSTONE · EJEMPLOS — nueve circuitos que se pueden tocar, cada uno con su cartel
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Pensado para /map/redstone, pero funciona en cualquier mapa: monta nueve parcelas en tres calles,
// cada una con un circuito COMPLETO y un cartel delante que explica qué es. El orden no es
// decorativo, es el argumento entero de por qué esto es una máquina y no una luz de navidad:
//
//   1 palanca → lámpara      entrada, cable, salida: el redstone en su versión mínima
//   2 tendido largo          la señal SE GASTA (−1 por bloque) y el repetidor la repone
//   3 puerta con placa       redstone (se abre) + física (se cruza), dos mitades que no se conocen
//   4 NOR                    juego de puertas COMPLETO: con NOR se construye cualquier lógica
//   5 reloj                  el `retardo` convierte una realimentación en TIEMPO
//   6 biestable SR           dos inversores cruzados = 1 bit → puertas + tiempo + memoria = máquina
//   7 AND                    la promesa del 4, cobrada: dos NOT y un NOR y ya hay una AND
//   8 XOR                    cinco inversores: la función que NO se saca de una sola puerta
//   9 la señal SUBE          aquí el cable es 3D (en Minecraft el polvo va por el suelo y punto)
//
// ⚠️ Los tres lazos realimentados (5, 6 y 8) llevan un repetidor de VUELTA que no es adorno: el
// cable pierde 1 por bloque y muere a los 15, así que un lazo que dé la vuelta a la parcela no
// cierra — la señal llega a cero antes de volver. Un lazo que no cierra se ve exactamente igual de
// bonito y no hace nada: el reloj no oscilaba y el biestable no se acordaba, y los dos «funcionaban»
// en la prueba porque se estaba midiendo el pulso de la palanca y no el circuito.
//
// El cartel es una NOTA colgada de la losa del suelo: el Mundo planta encima el cartel de verdad
// (assets/cartel.vox.json) y el texto sale al apuntarlo. Es el único texto que hay en el Mundo, así
// que es eso o nada. Antes el poste se levantaba a mano con tablones y la nota iba arriba del todo.
//
// Es RE-EJECUTABLE: limpia su propia zona antes de construir y solo pisa las notas de sus propios
// carteles (las notas del mundo son la bandeja del dueño, no se tocan las demás).
//
// Uso:  ▶ en el gestor de snippets, o desde la consola del Mundo.
// ──────────────────────────────────────────────────────────────────────────────────────────────

(async function () {
  'use strict';

  if (typeof mc === 'undefined' || !mc.grid) { console.warn('[ejemplos] abre el Mundo primero'); return; }
  if (!window.game || !game.redstone) { console.warn('[ejemplos] no hay motor de redstone'); return; }
  var R = game.redstone;

  // ── el terreno donde se monta ──────────────────────────────────────────────────────────────
  var SUELO = 14;        // el mundo plano de serie termina en hierba a y=14…
  var Y = SUELO + 1;     // …y los circuitos van encima, a ras de suelo
  var ANCHO = 26, FONDO = 16;                       // tamaño de una parcela
  // ⚠️ Las dos calles de atrás NO cambian de sitio al abrir una tercera, y no es pereza: las notas
  // de los carteles van indexadas por coordenada, así que una parcela que se mueve deja su nota
  // vieja colgada en la bandeja del dueño para siempre. La calle nueva se abre DELANTE (z menor),
  // que es además por donde se entra.
  var COLS = [4, 33, 62], FILAS = [30, 52, 72];     // 3 columnas × 3 filas dentro de un mundo de 96

  var LOSA   = 'asset:assets/adoquin.vox.json';     // el suelo de cada parcela, para que se vea dónde acaba
  var MURO   = 'asset:assets/ladrillo_piedra.vox.json';
  var LAMPARA_OFF = 'hab:antorcha-apagada', LAMPARA_ON = 'hab:antorcha';

  // Aquí sí se precarga (al revés que en el arranque): esto no corre en todos los mapas, corre
  // cuando alguien pide los ejemplos, y sin el material en la paleta setVoxel pondría ROCA en su
  // sitio sin que se note hasta que miras el circuito y no funciona nada.
  var CLAVES = [LOSA, MURO, LAMPARA_OFF, LAMPARA_ON,
                'hab:cable', 'hab:cable-on', 'hab:palanca', 'hab:palanca-on',
                'hab:boton', 'hab:boton-on', 'hab:placa', 'hab:placa-on',
                'hab:puerta', 'hab:puerta-abierta', 'hab:puerta-alta', 'hab:puerta-alta-abierta',
                'hab:repetidor', 'hab:repetidor-on',
                'hab:inversor', 'hab:inversor-on',
                'hab:piston-pegajoso', 'hab:piston-pegajoso-on', 'hab:piston-pegajoso-cabeza',
                'asset:assets/bloque_redstone.vox.json',
                // Las giradas son OTRA entrada de paleta («hab:repetidor@2»), no la misma con un
                // atributo: si no se precargan, la pieza de vuelta de los lazos sale ROCA.
                'hab:repetidor@2', 'hab:repetidor-on@2', 'hab:inversor@2', 'hab:inversor-on@2',
                'hab:piston-pegajoso@2', 'hab:piston-pegajoso-on@2'];
  // ⚠️ `mc.name2id` NO vale para saber si un material está cargado: indexa por MOTE corto («adoquin»)
  // y un asset entra en la paleta con su clave larga («asset:assets/adoquin.vox.json»), así que
  // preguntar por la clave da null aunque esté puesto. Quien sabe la verdad es la paleta.
  function cargado(k) { return mc.name2id[k] > 0 || mc.blockKey.indexOf(k) > 0; }
  for (var i = 0; i < CLAVES.length; i++) {
    if (cargado(CLAVES[i])) continue;
    try { await game.addMaterial(CLAVES[i]); } catch (e) { /* se comprueba abajo */ }
  }
  var faltan = CLAVES.filter(function (k) { return !cargado(k); });
  if (faltan.length) {
    console.error('[ejemplos] faltan materiales: ' + faltan.join(', ')
      + '\n  las piezas se generan con: python3 redstone/make_piezas.py');
    if (window.toast) toast('Faltan materiales: ' + faltan[0]);
    return;
  }

  // ── el pincel ──────────────────────────────────────────────────────────────────────────────
  // Cada parcela se dibuja en coordenadas LOCALES (0..25, 0..15) y `marco` las traduce. Un circuito
  // se lee así como un plano, que es la única forma de revisar a mano si dos cables se tocan.
  var P = null;                                     // parcela activa: {x, z, n}
  function pon(px, pz, clave, dy) { setVoxel(P.x + px, Y + (dy || 0), P.z + pz, clave); }
  function fila(px0, px1, pz, clave, dy) { for (var x = px0; x <= px1; x++) pon(x, pz, clave, dy); }
  function columna(px, pz0, pz1, clave, dy) { for (var z = pz0; z <= pz1; z++) pon(px, z, clave, dy); }

  var carteles = [];                                // [x, y, z, texto] — se cuelgan al final, de golpe
  // El cartel ya no se levanta a mano con bloques: una nota planta SOLA el cartel del dueño
  // (assets/cartel.vox.json) encima de su bloque, así que basta con colgar la nota de la losa del
  // suelo, en la esquina de entrada de la parcela.
  function cartel(texto) {
    // Se borra de paso la nota vieja, la del poste de tablones, que iba dos bloques más arriba: una
    // nota sobrevive a que le quiten el bloque, así que sin esto se quedaría flotando ahí para
    // siempre —con su cartel— y contando en la bandeja del dueño.
    delete mc.notes[(P.x + 1) + ',' + (Y + 2) + ',' + (P.z + 1)];
    carteles.push([P.x + 1, SUELO, P.z + 1, texto]);
  }

  // `alto` es cuánto se despeja por encima del suelo. 5 le sobra a un circuito plano; el 9, que se
  // va hacia arriba, pide sitio para la torre.
  function parcela(n, alto) {
    P = { x: COLS[n % 3], z: FILAS[(n / 3) | 0], n: n };
    // Limpiar ANTES de construir es lo que lo hace re-ejecutable: si un circuito cambia de forma,
    // los restos del anterior no se quedan ahí cortocircuitando el nuevo.
    for (var dy = 0; dy < (alto || 5); dy++)
      for (var px = 0; px < ANCHO; px++)
        for (var pz = 0; pz < FONDO; pz++) setVoxel(P.x + px, Y + dy, P.z + pz, 0);
    for (px = 0; px < ANCHO; px++)
      for (pz = 0; pz < FONDO; pz++) setVoxel(P.x + px, SUELO, P.z + pz, LOSA);
  }

  beginBatch();

  // ── 1 · lo básico: entrada, cable, salida ──────────────────────────────────────────────────
  parcela(0);
  cartel('1 · INTERRUPTOR Y LÁMPARA. Lo mínimo que es un circuito: una ENTRADA (la palanca), un '
       + 'CABLE que lleva la señal y una SALIDA (la lámpara). Clic derecho en la palanca para '
       + 'subirla. El cable se enciende por donde pasa la corriente, así que se ve viajar.');
  pon(4, 8, 'hab:palanca');
  fila(5, 9, 8, 'hab:cable');
  pon(10, 8, LAMPARA_OFF);

  // ── 2 · la señal se gasta, y el repetidor la repone ────────────────────────────────────────
  // Dos tendidos idénticos de 20 bloques con la misma palanca subida. El de arriba no llega: la
  // única diferencia es el repetidor del de abajo, y eso es justo lo que se quiere enseñar.
  parcela(1);
  cartel('2 · EL CABLE SE GASTA. Los dos tendidos salen de una palanca subida. El cable pierde 1 de '
       + 'fuerza por bloque: a los 15 se queda a cero y la lámpara de arriba NO llega a encender. El '
       + 'de abajo lleva un repetidor en medio, que vuelve a poner la señal a 15 (y tarda 2 pasadas).');
  pon(1, 5, 'hab:palanca-on');
  fila(2, 21, 5, 'hab:cable');
  pon(22, 5, LAMPARA_OFF);
  pon(1, 10, 'hab:palanca-on');
  fila(2, 8, 10, 'hab:cable');
  pon(9, 10, 'hab:repetidor');                      // sin giro = escucha por −X y emite hacia +X
  fila(10, 21, 10, 'hab:cable');
  pon(22, 10, LAMPARA_OFF);

  // ── 3 · puerta automática: redstone por un lado, física por el otro ────────────────────────
  parcela(2);
  cartel('3 · PUERTA AUTOMÁTICA. Pisa la placa y la puerta se abre sola; la placa se suelta al '
       + 'segundo (pulso) y la puerta se cierra detrás de ti. Que se ABRA es redstone (cambia de '
       + 'material); que se pueda CRUZAR es física (atravesable). Ninguna mitad sabe de la otra.');
  for (var dy = 0; dy <= 2; dy++) fila(2, 14, 8, MURO, dy);   // el muro, con su hueco de puerta
  pon(8, 8, 'hab:puerta');                          // una puerta son DOS celdas: abajo la de
  pon(8, 8, 'hab:puerta-alta', 1);                  // redstone, encima la que ella arrastra
  pon(8, 11, 'hab:placa');
  columna(8, 9, 10, 'hab:cable');                   // el cable llega solo a la hoja de ABAJO, la
                                                    // única con señal: la de arriba la mueve ella en
                                                    // la misma pasada (BUG-RS6, ver piezas)

  // ── 4 · NOR: el juego de puertas completo ──────────────────────────────────────────────────
  parcela(3);
  cartel('4 · NOR, Y CON ESTA SE CONSTRUYEN TODAS. La lámpara luce solo si NINGUNA palanca está '
       + 'subida. El cable hace el OR (se queda con la señal más fuerte de sus vecinas) y el '
       + 'inversor hace el NOT. Con NOR sola se monta cualquier lógica: AND, XOR… no hacen falta '
       + 'más piezas, se construyen.');
  pon(5, 7, 'hab:palanca');
  pon(5, 9, 'hab:palanca');
  fila(5, 7, 8, 'hab:cable');
  pon(8, 8, 'hab:inversor-on');                     // sin señal, un inversor luce: nace encendido
  pon(9, 8, LAMPARA_ON);

  // ── 5 · reloj: el retardo convierte un bucle en tiempo ─────────────────────────────────────
  // Nace PARADO a propósito (la palanca sujeta la entrada del inversor a 15). Un reloj guardado en
  // marcha estaría cambiando de material varias veces por segundo en cuanto alguien abre el mapa,
  // y eso es re-mallar un chunk sin parar a cambio de nada mientras nadie lo mira.
  parcela(4);
  cartel('5 · RELOJ. Baja la palanca y el anillo se pone a parpadear solo. Un inversor alimentado '
       + 'por sí mismo a través de 8 repetidores no se puede estabilizar nunca. Sin retardo esto no '
       + 'sería un reloj sino un bucle que el motor corta. Con reloj hay lógica SECUENCIAL.');
  pon(3, 4, 'hab:inversor');
  pon(3, 3, LAMPARA_OFF);                           // la lámpara cuelga del costado del inversor
  fila(4, 11, 4, 'hab:repetidor');                  // ocho en fila: 2 pasadas cada uno = el periodo
  columna(12, 4, 7, 'hab:cable');
  // La VUELTA mide 17 bloques de cable y el cable solo llega a 15: sin el repetidor de (4,7) la
  // señal se apagaba DOS celdas antes de la espalda del inversor y el anillo nunca cerraba. El
  // inversor se quedaba encendido fijo y lo único que se veía al tocar la palanca era el pulso de la
  // palanca — dos estados, un cambio, ningún reloj. Mira a −X (el sufijo @2), o sea escucha por su
  // lado +X, que es por donde le llega la vuelta.
  fila(5, 11, 7, 'hab:cable');
  pon(4, 7, 'hab:repetidor@2');
  fila(2, 3, 7, 'hab:cable');
  columna(2, 4, 6, 'hab:cable');                    // y vuelve a la ESPALDA del inversor, en (2,4)
  pon(6, 8, 'hab:palanca-on');                      // el freno: sujeta el anillo a 15 y no oscila

  // ── 6 · memoria: dos inversores cruzados = 1 bit ───────────────────────────────────────────
  // El anillo se guarda ya en un estado válido (A encendido, C apagado). Con los dos apagados el
  // anillo nace en su punto metaestable y los dos bascularían a la vez: un biestable de verdad
  // tampoco elige solo al darle corriente, hay que ponerlo.
  parcela(5);
  cartel('6 · MEMORIA: DOS INVERSORES CRUZADOS = 1 BIT. Pulsa SET (el botón de delante): la lámpara '
       + 'se enciende y SIGUE encendida cuando el botón se suelta solo. RESET (el de detrás) la '
       + 'apaga, y también se queda. El circuito se ACUERDA sin nadie que lo sujete. '
       + 'Puertas + reloj + memoria = una máquina.');
  pon(3, 4, 'hab:inversor-on');                     // A
  fila(4, 9, 4, 'hab:cable');
  pon(10, 4, 'hab:inversor');                       // C
  columna(11, 4, 7, 'hab:cable');
  // Mismo repetidor de vuelta que en el 5, y por lo mismo: la vuelta mide más de 15 y sin él llegaba
  // a CERO a la espalda de A. El anillo no cerraba, así que A no se podía apagar y el bit no era un
  // bit: al soltar el botón de RESET la lámpara se volvía a encender sola.
  fila(5, 10, 7, 'hab:cable');
  pon(4, 7, 'hab:repetidor@2');
  fila(2, 3, 7, 'hab:cable');
  columna(2, 4, 6, 'hab:cable');                    // …y de vuelta a la espalda de A
  pon(6, 3, LAMPARA_ON);                            // el bit, a la vista
  pon(4, 5, 'hab:boton');                           // SET  — toca el lazo de ida
  pon(8, 8, 'hab:boton');                           // RESET — toca el lazo de vuelta

  // ── 7 · T-Flip-Flop (Selector / Reloj por bloque flotante) ──────────────────────────────────
  // Convierte un pulso corto (botón) en una señal permanente ON/OFF alternando la posición de un
  // BLOQUE DE REDSTONE mediante un pistón pegajoso. Al pulsar el botón, el pistón da un toque rápido
  // empujando o retirando el bloque de redstone de la línea de señal.
  parcela(6);
  cartel('7 · T-FLIP-FLOP CON PISTÓN PEGAJOSO. Un pulso corto del botón conmuta el estado entre ON y '
       + 'OFF de forma permanente. El pistón pegajoso desplaza el bloque de redstone alternativamente '
       + 'hacia la línea del circuito, reteniendo la señal.');
  pon(3, 7, 'hab:boton');                           // Entrada por botón
  pon(4, 7, 'hab:cable');
  pon(5, 7, 'hab:piston-pegajoso');                 // Pistón pegajoso (mira a +X)
  pon(6, 7, 'asset:assets/bloque_redstone.vox.json');
  fila(8, 11, 7, 'hab:cable');
  pon(12, 7, LAMPARA_OFF);

  // ── 8 · XOR: el interruptor de pasillo ─────────────────────────────────────────────────────
  // La función que NO sale de una sola puerta, y la que todo el mundo tiene en casa: dos
  // interruptores, una lámpara, y cualquiera de los dos la cambia. XOR = NOR(NOR(a,b), AND(a,b)):
  // luce cuando NO están las dos abajo y NO están las dos arriba, o sea con exactamente una.
  //
  // Lo interesante de montarlo aquí no es la lógica, es el CABLEADO: `a` tiene que llegar a dos
  // sitios distintos SIN que los dos se enteren el uno del otro, y las dos ramas se cruzan.
  //
  // ⚠️ Aquí había un «puente»: la salida del NOR subía dos celdas y cruzaba la parcela POR EL AIRE
  // hasta la AND. Funcionaba —dos celdas separadas por un hueco no se tocan— y era exactamente lo
  // que en Minecraft no se ve nunca: un cable flotando sin nada que lo sujete. La vuelta se da
  // ahora por el SUELO, rodeando por delante, que es como se resuelve de verdad. Sale más larga
  // que 15, así que se lleva su repetidor de vuelta como los lazos 5 y 6.
  parcela(7);
  cartel('8 · XOR: EL INTERRUPTOR DE PASILLO. Dos palancas y una lámpara: cualquiera de las dos la '
       + 'cambia, como la luz de una escalera. Luce con UNA subida, no con ninguna y no con las dos. '
       + 'Son cinco inversores. Fíjate en el cable que rodea por delante: es la vuelta larga, y por '
       + 'eso lleva un repetidor a mitad de camino.');
  pon(3, 4, 'hab:palanca');                         // A
  pon(3, 10, 'hab:palanca');                        // B
  columna(3, 5, 9, 'hab:cable');                    // A y B empalmados = a O b
  pon(2, 7, 'hab:inversor-on@2');                   // NOR(a,b) — mira a −X, escucha por su lado +X
  pon(4, 4, 'hab:cable');                           // la otra rama de A, sin tocar el empalme
  pon(5, 4, 'hab:inversor-on');                     // NO a
  pon(4, 10, 'hab:cable');                          // la otra rama de B
  pon(5, 10, 'hab:inversor-on');                    // NO b
  columna(6, 4, 10, 'hab:cable');                   // NO a  O  NO b
  pon(7, 7, 'hab:inversor');                        // …invertido = AND(a,b)
  pon(8, 7, 'hab:cable');
  pon(1, 7, 'hab:cable');                           // salida del NOR, que ahora tiene que CRUZAR
  columna(1, 2, 6, 'hab:cable');                    // baja por el costado izquierdo hasta el frente
  fila(2, 4, 2, 'hab:cable');                       // y rodea por delante, pegada al suelo
  pon(5, 2, 'hab:repetidor');                       // a las 15 celdas se ha gastado: se repone
  fila(6, 9, 2, 'hab:cable');
  columna(9, 3, 6, 'hab:cable');                    // sube por el costado derecho
  pon(9, 7, 'hab:cable');                           // y se empalma con la AND
  pon(10, 7, 'hab:inversor');                       // NOR de los dos = XOR
  pon(11, 7, LAMPARA_OFF);

  // ── 9 · la señal sube ──────────────────────────────────────────────────────────────────────
  // En Minecraft el polvo de redstone es plano: va por el suelo, y para subir un piso hay que hacer
  // una escalera de bloques. Aquí no — una celda tiene seis vecinas y dos de ellas están arriba y
  // abajo, así que un cable sube en vertical sin ceremonia. El repetidor, en cambio, NO: `mira` se
  // calcula en horizontal (ver atrasDe), así que para reponer la señal a media altura hay que
  // sacarla de lado, pasarla por el repetidor y volver a subir. De ahí el escalón del medio.
  parcela(8, 23);
  cartel('9 · LA SEÑAL SUBE. Aquí el cable es 3D: trepa por la pared sin escalera, cosa que en '
       + 'Minecraft no se puede. Se gasta igual (1 por bloque), así que a media altura hay un '
       + 'repetidor — y como el repetidor escucha de lado, la señal sale, se repone y vuelve a subir.');
  for (dy = 0; dy < 22; dy++) fila(5, 9, 5, MURO, dy);   // la pared que sujeta el tendido
  pon(4, 4, 'hab:palanca');
  pon(5, 4, 'hab:cable');
  for (dy = 0; dy <= 10; dy++) pon(6, 4, 'hab:cable', dy);   // primer tramo: llega arriba a 4
  pon(7, 4, 'hab:repetidor', 10);                            // el escalón: escucha de lado, repone a 15
  for (dy = 10; dy <= 20; dy++) pon(8, 4, 'hab:cable', dy);  // segundo tramo
  pon(8, 4, LAMPARA_OFF, 21);                                // el farol, visible desde toda la calle

  // ── el cartel de la entrada ────────────────────────────────────────────────────────────────
  // Estuvo en z=46 mientras las calles eran dos. Al abrir la tercera por delante se ha mudado, y el
  // sitio viejo se limpia a mano: si no, quedan el poste y —peor— su nota, que seguiría contando en
  // la bandeja del dueño aunque no haya nada donde leerla.
  for (dy = 0; dy < 4; dy++) for (var d2 = -1; d2 <= 1; d2++) setVoxel(48 + d2, Y + dy, 46, 0);
  delete mc.notes[48 + ',' + (Y + 2) + ',' + 46];

  var EX = 48, EZ = 24;
  for (dy = 0; dy < 4; dy++) for (d2 = -1; d2 <= 1; d2++) setVoxel(EX + d2, Y + dy, EZ, 0);
  delete mc.notes[EX + ',' + (Y + 2) + ',' + EZ];        // la del poste de tablones de antes
  carteles.push([EX, SUELO, EZ, 'MUNDO REDSTONE · nueve circuitos que se pueden tocar. De izquierda a '
    + 'derecha y de delante a atrás: 1 lámpara · 2 el cable se gasta · 3 puerta con placa · 4 NOR · '
    + '5 reloj · 6 memoria · 7 AND · 8 XOR · 9 la señal sube. Cada uno tiene su cartel. '
    + 'Clic derecho (o el botón CENTRAL) para accionar palancas y botones.']);

  endBatch();

  // ── los carteles ───────────────────────────────────────────────────────────────────────────
  // Solo se escriben las notas de MIS carteles: las notas del mundo son la bandeja del dueño y aquí
  // no se borra ninguna que no sea de un poste de éstos.
  carteles.forEach(function (c) { mc.notes[c[0] + ',' + c[1] + ',' + c[2]] = c[3]; });
  mc.spawn = { x: EX, y: Y, z: EZ - 4 };
  if (typeof mcDirtyHeader === 'function') mcDirtyHeader();

  // ── asentar el circuito y guardar ──────────────────────────────────────────────────────────
  // El repaso mira el mundo entero y le pone a cada celda la señal que le toca; las pasadas son
  // para que los retardos (repetidores, inversores) lleguen a su sitio antes de guardar, y no se
  // guarde un estado a medio propagar que luego pegue un salto al abrir el mapa.
  if (R.repasarMundo) R.repasarMundo();
  for (i = 0; i < 60; i++) R.tick();
  if (typeof mcMeshAll === 'function') mcMeshAll();

  var guardado = false;
  if (game.saveWorld) guardado = await game.saveWorld();
  console.log('[ejemplos] 9 circuitos + ' + carteles.length + ' carteles en «'
    + (typeof mcMapName === 'function' ? mcMapName() || 'default' : '?') + '»'
    + (guardado === false ? ' · NO se pudo guardar' : ' · guardado'));
  if (window.toast) toast('Ejemplos de redstone montados');
})();
