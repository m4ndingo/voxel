// ══════════════════════════════════════════════════════════════════════════════════════════════
// REDSTONE · PIEZAS — cable, placa, puerta, palanca, botón, repetidor, inversor, pistón y bloque
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
//   puerta       se abre con señal y se cruza; son  redstone: alRecibirSeñal (aquí abajo)
//                DOS celdas que se mueven juntas    +  bloques: atravesable
//   repetidor    reemite a 15 con retraso           redstone: retardo + mira
//   inversor     luce cuando NO le llega señal      redstone: invertida + mira
//   bloque de    entrega 15 por sus seis caras y    redstone: emite (y nada más)
//   redstone     no se apaga nunca
//   pistón       empuja un bloque una celda         redstone: alRecibirSeñal (aquí abajo)
//
// O sea: CERO maquinaria nueva salvo en las dos piezas que MUEVEN MATERIA —el pistón y la puerta—,
// que son las que usan `alRecibirSeñal`, el hueco que el motor deja para lo que él no sabe hacer.
// Las dos únicas cosas que no existían eran el tiempo (`retardo`) y la idea de que una celda pueda
// ser una ENTRADA (`manual`), y las dos están en el motor porque las dos son señal. La puerta es el
// ejemplo más claro de dónde está la frontera: que se ABRA es redstone (cambio de material), que se
// CRUCE es física (game.bloques.atravesable), y ninguna de las dos mitades sabe de la otra.
//
// ⚠️ Todo con precargar:false — esto corre en TODOS los mapas (ver la cabecera de redstone-arranque).
// ──────────────────────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  if (typeof window.game === 'undefined' || !game.redstone) return;

  var MS_PULSO = 1200;   // lo que aguantan pisada la placa y pulsado el botón

  // ── 0. el pistón ───────────────────────────────────────────────────────────────────────────
  // La única pieza que no se monta combinando capacidades del motor: las demás encienden, conducen
  // o esperan, y ésta MUEVE MATERIA. Por eso es la primera que usa `alRecibirSeñal`, que es el único
  // hueco que el motor deja para que una pieza haga algo que él no sabe hacer.
  //
  // ⚠️ Va con DOS define(), uno por material, en vez de con `encendida`. No es un capricho: con
  // `encendida` el motor cambia el bloque ÉL (redstone.js:448) antes de avisar, así que un pistón
  // que no puede extenderse —contra el borde del mundo, o con dos bloques delante— ya se habría
  // pintado abierto, y devolverlo a su sitio no aguanta: escribir la celda la vuelve a encolar como
  // «estrenada» (redstone.js:265) y la siguiente pasada la re-abre saltándose el atajo de
  // `nivel === antes`. Registrando los dos materiales por separado, `apagada` es cada uno sí mismo,
  // el motor no toca nada, y quien decide si se extiende es el callback — que es quien sabe si cabe.
  var CABEZA = 'hab:piston-cabeza';
  var CABEZA_PEG = 'hab:piston-pegajoso-cabeza';

  // Bases reconocidas como pistón (normal y pegajoso)
  var ES_PISTON = { 'hab:piston': 1, 'hab:piston-on': 1, 'hab:piston-pegajoso': 1, 'hab:piston-pegajoso-on': 1 };
  var ES_PISTON_PEGAJOSO = { 'hab:piston-pegajoso': 1, 'hab:piston-pegajoso-on': 1 };

  function baseDe(k) { var i = k ? k.lastIndexOf('@') : -1; return i < 0 ? (k || '') : k.slice(0, i); }
  // La postura ENTERA, sin recortar: son 24 y no 16 (mcOriNorm manda). Quedarse con cuatro bits no
  // deja el pistón «casi bien», lo convierte en otro pistón: el puesto mirando arriba se acostaba
  // (BUG-RS7). Un sufijo que no sea una postura conocida se lee como «sin girar», nunca como otra.
  function oriDe(k) {
    var i = k ? String(k).lastIndexOf('@') : -1;
    if (i < 0) return 0;
    var n = +String(k).slice(i + 1);
    if (!isFinite(n)) return 0;
    return (typeof mcOriNorm === 'function') ? mcOriNorm(n) : ((n >= 0 && n <= 23) ? (n | 0) : 0);
  }

  // Hacia dónde empuja. NO sale de una tabla escrita a mano: es el +X del dibujo —donde está la
  // placa— pasado por la postura con mcOriPerm, que usa la MISMA composición con la que app.js gira
  // la geometría al estampar. Una tabla a mano se desincroniza de lo que se ve la primera vez que
  // alguien toque el giro; esto no puede. Con las 24 posturas el empuje ya puede ser vertical.
  var CARA_DIR = [[0,1,0], [0,-1,0], [1,0,0], [-1,0,0], [0,0,1], [0,0,-1]];   // MC_FACES, en orden
  function frenteDe(ori) {
    if (typeof mcOriPerm === 'function') return CARA_DIR[mcOriPerm(ori)[2]];   // MC_FACES[2] = +X
    var a = mcRotXZ(1, 0, ori & 3, 2, 2), o = mcRotXZ(0, 0, ori & 3, 2, 2);    // respaldo: solo horizontal
    return [a[0] - o[0], 0, a[1] - o[1]];
  }

  var avisados = {};
  function unaVez(k, msg) {
    if (avisados[k]) return; avisados[k] = true;
    if (typeof toast === 'function') toast(msg);   // por toast, no por consola: el dueño juega en el móvil
  }

  // Ningún material del snippet se precarga (`precargar: false`, más abajo): dar de alta uno rehornea
  // paleta y atlas, y eso no lo puede pagar el arranque de los mundos que no tienen circuito. En la
  // rejilla solo está lo COLOCADO, así que el cuerpo abierto y la cabeza no existen hasta la primera
  // extensión de la partida. Se cargan aquí y la extensión se reintenta sola al llegar — extender es
  // idempotente, así que llegar tarde no rompe nada. Es lo mismo que hace cargarYReintentar() del
  // motor para las piezas que sí usan `encendida`.
  var cargando = {};
  function idDe(base, ori, reintentar) {
    var k = ori ? base + '@' + ori : base, id = mc.name2id[k];
    if (id) return id;
    if (!cargando[k] && typeof game.addMaterial === 'function') {
      cargando[k] = true;
      game.addMaterial(k).then(function () { cargando[k] = false; reintentar(); },
        function (e) { cargando[k] = false; unaVez('mat:' + k, 'no he podido cargar «' + k + '»: ' + e.message); });
    }
    return 0;
  }

  // El motor solo re-malla lo que ha tocado ÉL (redstone.js:421), y aquí las celdas que cambian están
  // una y dos casillas más allá: sin esto el bloque se mueve en la rejilla y en pantalla no pasa nada.
  function remallar(celdas) {
    var x0 = celdas[0][0], x1 = x0, z0 = celdas[0][2], z1 = z0;
    for (var i = 1; i < celdas.length; i++) {
      var c = celdas[i];
      if (c[0] < x0) x0 = c[0]; else if (c[0] > x1) x1 = c[0];
      if (c[2] < z0) z0 = c[2]; else if (c[2] > z1) z1 = c[2];
    }
    mcRemeshAround(x0, z0, x1, z1);
    if (typeof mcScheduleSave === 'function') mcScheduleSave();
  }

  // El pistón mueve materia, y quien está delante también es materia (BUG-RS9). Sin esto la cabeza
  // se escribía DENTRO del jugador y el solape lo resolvía la auto-curación de mcUpdate, que tira de
  // mcUnstick — y mcUnstick solo sabe buscar salida HACIA ARRIBA: el primer hueco de aire sobre la
  // cabeza recién extendida es justo la cota de montarse encima, así que el pistón te aupaba en vez
  // de empujarte. Es el mismo problema, y la misma solución, que mcAgentShove con las embestidas.
  //
  // No hace falta saber la caja del jugador ni la forma de la cabeza: se le pregunta a mcCollides,
  // que ya sabe las dos cosas y además a la escala del jugador. Por eso esto va DESPUÉS de escribir
  // los bloques: antes, las celdas barridas son aire y no habría contra qué chocar.
  function apartar(d, ax, ay, az, bx, by, bz, celdas) {
    apartarJugador(d, ax, ay, az, bx, by, bz);
    apartarAgentes(d, celdas);
  }

  function apartarJugador(d, ax, ay, az, bx, by, bz) {
    if (typeof mcCollides !== 'function' || !mc.pos) return;
    var p = mc.pos;
    // BUG-RS13 · El jugador se empuja si está en la celda barrida por la cabeza/bloque o si choca
    var enRango = (Math.abs(p[0] - (ax + 0.5)) < 0.9 && Math.abs(p[2] - (az + 0.5)) < 0.9 && p[1] >= ay - 0.5 && p[1] <= ay + 1.8) ||
                  (bx !== undefined && Math.abs(p[0] - (bx + 0.5)) < 0.9 && Math.abs(p[2] - (bz + 0.5)) < 0.9 && p[1] >= by - 0.5 && p[1] <= by + 1.8);
    var chocando = mcCollides(p[0], p[1], p[2]);
    if (!enRango && !chocando) return;   // no estaba en el camino del pistón

    var paso = 1 / MC_TILE, tope = 2 + 2 * (mc.scale || 1);
    for (var t = paso; t <= tope + 1e-6; t += paso) {
      var nx = p[0] + d[0] * t, ny = p[1] + d[1] * t, nz = p[2] + d[2] * t;
      if (mcCollides(nx, ny, nz)) continue;
      p[0] = nx; p[1] = ny; p[2] = nz;
      if (d[1] && mc.vel) { mc.vel[1] = 0; mc.onGround = false; }   // te levanta él, no tu caída
      return;
    }
  }

  // Y lo mismo para los agentes articulados (BUG-AG1): también son cuerpos. Aquí ni siquiera había
  // un mal desenlace que corregir — la cabeza se escribía DENTRO del bicho y nadie se daba por
  // enterado, que es literalmente «no se ven afectados por los pistones».
  //
  // Con `mc.pos` bastaba mcCollides; aquí no hay nada equivalente, porque la caja de un agente son
  // estructuras estampadas y su colisión es asunto de la librería. Así que se pregunta y se manda por
  // la API (enCaja / desplazar) en vez de leerle las tripas: la pieza no sabe —ni tiene por qué— cómo
  // se mueve una raíz.
  function apartarAgentes(d, celdas) {
    var E = window.game && game.esqueletos;
    if (!E || typeof E.enCaja !== 'function' || typeof E.desplazar !== 'function') return;
    if (!celdas || !celdas.length) return;
    var x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (var i = 0; i < celdas.length; i++) {
      var c = celdas[i];
      x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); z0 = Math.min(z0, c[2]);
      x1 = Math.max(x1, c[0] + 1); y1 = Math.max(y1, c[1] + 1); z1 = Math.max(z1, c[2] + 1);
    }
    var pillados = E.enCaja(x0, y0, z0, x1, y1, z1);
    if (!pillados.length) return;
    // Distancias CRECIENTES desde donde está, y se acepta el primer hueco — exactamente el barrido
    // del jugador de arriba. No vale encadenar pasitos de 1/16 comprobando cada uno: cuando esto
    // corre, la cabeza ya está escrita y él ya está embutido en ella, así que el primer pasito
    // tampoco cabe y el bucle se rendía en el primer intento. Los agentes salían sin empujar.
    var paso = 1 / MC_TILE, tope = 3 * MC_TILE;
    for (var k = 0; k < pillados.length; k++) {
      var rig = pillados[k];
      for (var t = 1; t <= tope; t++) {
        if (E.desplazar(rig, d[0] * paso * t, d[1] * paso * t, d[2] * paso * t)) break;
      }
      // Si no cabe en ninguna, está aplastado contra la pared de enfrente: se queda donde está,
      // igual que el jugador. Colarlo DENTRO de la pared sería peor.
      //
      // Y el «shock» (BUG-AG5): el empujón es de un tiro, pero el bicho anda cada frame, así que
      // volvía sobre sus pasos y se comía el desplazamiento — o, andando CONTRA la cabeza recién
      // salida, la trataba como un escalón y se subía encima. Un rato sin andar y el pistón gana.
      // Se aturde AUNQUE no haya cabido: ahí es cuando más falta hace, porque si no se pasaría el
      // rato empotrándose contra la pared de enfrente.
      //
      // La duración vive aquí, en la PIEZA, no en el motor de agentes: la librería solo pone la
      // capacidad (§0). Se lee en cada empujón, así que game.redstone.shockPiston = 0 lo apaga y
      // 2 lo alarga, desde la consola y sin recargar.
      if (typeof E.aturdir === 'function') E.aturdir(rig, shockPiston());
    }
  }
  // El valor por defecto es el que pidió el dueño: «por ejemplo un segundo».
  function shockPiston() {
    var v = game.redstone.shockPiston;
    return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : 1;
  }

  // Extender o recoger. Se llama con el estado que TOCA, no con el que hay, y comprueba el mundo
  // antes de escribir: así vale igual para el flanco de la señal y para el reintento de la carga.
  function accionar(x, y, z, extender) {
    if (!mcInside(x, y, z)) return;
    var clave = mc.blockKey[mc.grid[mcIdx(x, y, z)]] || '';
    var base = baseDe(clave);
    if (!ES_PISTON[base]) return;   // ya no hay pistón
    var pegajoso = !!ES_PISTON_PEGAJOSO[base];
    var ori = oriDe(clave), d = frenteDe(ori);   // empuja hacia donde MIRA, en las 24 posturas
    var ax = x + d[0], ay = y + d[1], az = z + d[2];        // donde va la cabeza
    var bx = ax + d[0], by = ay + d[1], bz = az + d[2];     // donde va lo empujado
    // ⚠️ Empuja lo que hay en mc.grid, que es una celda con un id. Una ESTRUCTURA estampada
    // (mc.structures) ocupa varias celdas y no vive en la rejilla: delante del pistón se ve como aire
    // y la cabeza se le mete dentro. Límite conocido de la v1, no un descuido.
    var reintentar = function () { accionar(x, y, z, extender); };
    var baseOff = pegajoso ? 'hab:piston-pegajoso' : 'hab:piston';
    var baseOn  = pegajoso ? 'hab:piston-pegajoso-on' : 'hab:piston-on';
    var cab     = pegajoso ? CABEZA_PEG : CABEZA;
    var idCuerpo = idDe(extender ? baseOn : baseOff, ori, reintentar);
    if (!idCuerpo) return;                                   // aún no está en la paleta: se reintenta sola
    var tocadas = [];
    var bloquesAMover = [];

    if (extender) {
      var idCab = idDe(cab, ori, reintentar);
      if (!idCab) return;                                    // aún no está en la paleta: se reintenta sola
      if (!mcInside(ax, ay, az)) return;                     // contra el borde del mundo no se abre
      var enA = mc.grid[mcIdx(ax, ay, az)];
      if (enA === idCab) return;                             // ya estaba extendido

      // Nueva lógica: empujar hasta 12 bloques seguidos
      var actualX = ax, actualY = ay, actualZ = az;
      var esExtensible = false;

      while (bloquesAMover.length <= 12) {
        if (!mcInside(actualX, actualY, actualZ)) break;     // borde del mundo alcanzado
        var id = mc.grid[mcIdx(actualX, actualY, actualZ)] || 0;
        var esInamovible = (id > 0 && mc.inamovibleDoc && mc.inamovibleDoc[id] === 1);
        if (esInamovible) {
          esExtensible = false;
          break;
        }

        var claveCurrent = (mc.blockKey[id] || '').toLowerCase();
        var esFluidoCurrent = id > 0 && (claveCurrent.indexOf('agua') >= 0 || claveCurrent.indexOf('water') >= 0 ||
                              claveCurrent.indexOf('lava') >= 0 || (game.fluidos && game.fluidos.esFluido && game.fluidos.esFluido(actualX, actualY, actualZ)));

        var esReemplazable = (typeof mcIsReplaceable === 'function')
          ? mcIsReplaceable(id, actualX, actualY, actualZ)
          : (id === 0 || esFluidoCurrent);

        if (esReemplazable || esFluidoCurrent) {
          esExtensible = true;
          break;
        }

        bloquesAMover.push({
          x: actualX,
          y: actualY,
          z: actualZ,
          id: id
        });

        actualX += d[0];
        actualY += d[1];
        actualZ += d[2];
      }

      if (!esExtensible) return; // Si no hay celda libre/reemplazable o supera 12 bloques, no se extiende.

      // Mover los bloques de atrás hacia adelante
      for (var k = bloquesAMover.length - 1; k >= 0; k--) {
        var b = bloquesAMover[k];
        var destX = b.x + d[0], destY = b.y + d[1], destZ = b.z + d[2];
        var enAMover = b.id;
        var claveA = mc.blockKey[b.id] || '';
        var baseA = baseDe(claveA);

        // BUG-RS13 · Al empujar una placa/botón encendido, se restaura a su estado desaccionado
        if (baseA === 'hab:placa-on') {
          var idOff = idDe('hab:placa', oriDe(claveA), reintentar);
          if (idOff) enAMover = idOff;
        } else if (baseA === 'hab:boton-on') {
          var idOff = idDe('hab:boton', oriDe(claveA), reintentar);
          if (idOff) enAMover = idOff;
        }

        mcSetBlock(destX, destY, destZ, enAMover);
        tocadas.push([destX, destY, destZ]);
        if (typeof game !== 'undefined' && game.fluidos && typeof game.fluidos.onBlockChange === 'function') {
          game.fluidos.onBlockChange(b.x, b.y, b.z, b.id, 0);
          game.fluidos.onBlockChange(destX, destY, destZ, 0, enAMover);
        }
      }

      // Escribir la cabeza en ax, ay, az (pisa lo que hubiera, por ejemplo, agua/lava/aire)
      mcSetBlock(ax, ay, az, idCab);
      tocadas.push([ax, ay, az]);
      if (typeof game !== 'undefined' && game.fluidos && typeof game.fluidos.onBlockChange === 'function') {
        game.fluidos.onBlockChange(ax, ay, az, enA, idCab);
      }
    } else {
      // ── Retracción ──
      // Verificar que la cabeza sigue ahí (normal O pegajosa según el tipo)
      if (!mcInside(ax, ay, az)) return;
      var baseCabAhora = baseDe(mc.blockKey[mc.grid[mcIdx(ax, ay, az)]] || '');
      if (baseCabAhora !== CABEZA && baseCabAhora !== CABEZA_PEG) return;

      // Pistón pegajoso: antes de quitar la cabeza, tirar del bloque que está delante de ella.
      // Solo tira de UN bloque (como Minecraft), y solo si no es inamovible.
      if (pegajoso && mcInside(bx, by, bz)) {
        var idDelante = mc.grid[mcIdx(bx, by, bz)] || 0;
        if (idDelante > 0) {
          var esInamov = mc.inamovibleDoc && mc.inamovibleDoc[idDelante] === 1;
          // No tira de otro pistón extendido, ni de inamovibles, ni de fluidos (agua/lava)
          var claveDelante = (mc.blockKey[idDelante] || '').toLowerCase();
          var esFluido = claveDelante.indexOf('agua') >= 0 || claveDelante.indexOf('water') >= 0 ||
                         claveDelante.indexOf('lava') >= 0 || (typeof mcIsReplaceable === 'function' && mcIsReplaceable(idDelante, bx, by, bz)) ||
                         (game.fluidos && ((game.fluidos.isFluid && game.fluidos.isFluid(idDelante, bx, by, bz)) || (game.fluidos.esFluido && game.fluidos.esFluido(bx, by, bz))));
          var baseDel = baseDe(mc.blockKey[idDelante] || '');
          var esOtroPiston = baseDel === 'hab:piston-on' || baseDel === 'hab:piston-pegajoso-on'
                          || baseDel === CABEZA || baseDel === CABEZA_PEG;
          if (!esInamov && !esOtroPiston && !esFluido) {
            // Mover el bloque de (bx,by,bz) a (ax,ay,az) — la cabeza aún está ahí, se pisa
            var idHeadOld = mc.grid[mcIdx(ax, ay, az)];
            mcSetBlock(ax, ay, az, idDelante);
            mcSetBlock(bx, by, bz, 0);
            tocadas.push([ax, ay, az]);
            tocadas.push([bx, by, bz]);
            if (typeof game !== 'undefined' && game.fluidos && typeof game.fluidos.onBlockChange === 'function') {
              game.fluidos.onBlockChange(ax, ay, az, idHeadOld, idDelante);
              game.fluidos.onBlockChange(bx, by, bz, idDelante, 0);
            }
          } else {
            // Inamovible, fluido o pistón extendido: solo recoge la cabeza sin tirar del fluido/bloque
            var idHeadOld = mc.grid[mcIdx(ax, ay, az)];
            mcSetBlock(ax, ay, az, 0);
            tocadas.push([ax, ay, az]);
            if (typeof game !== 'undefined' && game.fluidos && typeof game.fluidos.onBlockChange === 'function') {
              game.fluidos.onBlockChange(ax, ay, az, idHeadOld, 0);
            }
          }
        } else {
          // No hay nada delante: solo recoge la cabeza
          var idHeadOld = mc.grid[mcIdx(ax, ay, az)];
          mcSetBlock(ax, ay, az, 0);
          tocadas.push([ax, ay, az]);
          if (typeof game !== 'undefined' && game.fluidos && typeof game.fluidos.onBlockChange === 'function') {
            game.fluidos.onBlockChange(ax, ay, az, idHeadOld, 0);
          }
        }
      } else {
        // Pistón NORMAL: solo recoge su cabeza
        var idHeadOld = mc.grid[mcIdx(ax, ay, az)];
        mcSetBlock(ax, ay, az, 0);
        tocadas.push([ax, ay, az]);
        if (typeof game !== 'undefined' && game.fluidos && typeof game.fluidos.onBlockChange === 'function') {
          game.fluidos.onBlockChange(ax, ay, az, idHeadOld, 0);
        }
      }

      // Despertar agentes apoyados encima de la cabeza o bloque retraído para forzar su caída
      if (game.esqueletos && game.esqueletos.enCaja) {
        var agentesArriba = game.esqueletos.enCaja(ax - 0.6, ay, az - 0.6, ax + 1.6, ay + 3.0, az + 1.6);
        if (agentesArriba && agentesArriba.length) {
          for (var ag = 0; ag < agentesArriba.length; ag++) {
            if (agentesArriba[ag].mov) agentesArriba[ag].mov.alto += 0.01;
            else game.esqueletos.aturdir(agentesArriba[ag], 0.01);
          }
        }
      }

      // Notificar en la línea del eje para despertar a pistones bloqueados
      for (var i = 1; i <= 13; i++) {
        var nx1 = ax + d[0] * i, ny1 = ay + d[1] * i, nz1 = az + d[2] * i;
        if (mcInside(nx1, ny1, nz1)) {
          var id1 = mc.grid[mcIdx(nx1, ny1, nz1)] || 0;
          var key1 = mc.blockKey[id1] || '';
          if (ES_PISTON[baseDe(key1)]) {
            game.redstone.revisar(nx1, ny1, nz1);
          }
        }
        var nx2 = ax - d[0] * i, ny2 = ay - d[1] * i, nz2 = az - d[2] * i;
        if (mcInside(nx2, ny2, nz2)) {
          var id2 = mc.grid[mcIdx(nx2, ny2, nz2)] || 0;
          var key2 = mc.blockKey[id2] || '';
          if (ES_PISTON[baseDe(key2)]) {
            game.redstone.revisar(nx2, ny2, nz2);
          }
        }
      }
    }

    // Al abrirse, `tocadas` son exactamente las celdas que acaban de volverse macizas: la cabeza y,
    // si empujó algo, la celda a la que fue a parar. Se copian AQUÍ, antes de meter la del cuerpo,
    // que no es barrido (ahí ya había pistón).
    var barridas = extender ? tocadas.slice() : null;

    if (mc.grid[mcIdx(x, y, z)] !== idCuerpo) { mcSetBlock(x, y, z, idCuerpo); tocadas.push([x, y, z]); }
    // Con la geometría ya en su sitio (cabeza y cuerpo): a quien se haya quedado dentro, se le empuja.
    if (extender) {
      var ultimoDestX = undefined, ultimoDestY = undefined, ultimoDestZ = undefined;
      if (bloquesAMover && bloquesAMover.length > 0) {
        var ult = bloquesAMover[bloquesAMover.length - 1];
        ultimoDestX = ult.x + d[0];
        ultimoDestY = ult.y + d[1];
        ultimoDestZ = ult.z + d[2];
      }
      apartar(d, ax, ay, az, ultimoDestX, ultimoDestY, ultimoDestZ, barridas);
    }
    if (tocadas.length) {
      remallar(tocadas);
      for (var tIdx = 0; tIdx < tocadas.length; tIdx++) {
        game.redstone.revisar(tocadas[tIdx][0], tocadas[tIdx][1], tocadas[tIdx][2]);
      }
    }
    game.redstone.revisar(x, y, z);
  }

  // `alRecibirSeñal` salta con CUALQUIER cambio de nivel, y un 15 → 14 no es un flanco: el pistón ya
  // estaba fuera y tiene que quedarse fuera. Lo que cuenta es cruzar el umbral.
  function empujar(celda, nivel, antes) {
    var clave = mc.blockKey[mc.grid[mcIdx(celda.x, celda.y, celda.z)]] || '';
    var base = baseDe(clave);
    var cfg = game.redstone._tabla ? game.redstone._tabla[clave] : null;
    var nivelEfectivo = nivel;

    // Un pistón NO se activa por su frente/cabeza (el bloque empujado o bloque de redstone desplegado).
    if (cfg && cfg.noCaraFrontal) {
      var ori = oriDe(clave), d = frenteDe(ori);
      var ax = celda.x + d[0], ay = celda.y + d[1], az = celda.z + d[2];
      var bx = ax + d[0], by = ay + d[1], bz = az + d[2];
      
      // Medir la señal que llega a celda únicamente desde las 5 caras que NO son la frontal d
      var dirsLocal = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
      var maxOtras5 = 0;
      for (var i = 0; i < 6; i++) {
        var nx = celda.x + dirsLocal[i][0], ny = celda.y + dirsLocal[i][1], nz = celda.z + dirsLocal[i][2];
        if (nx === ax && ny === ay && nz === az) continue;
        if (nx === bx && ny === by && nz === bz) continue;
        if (dirsLocal[i][0] === d[0] && dirsLocal[i][1] === d[1] && dirsLocal[i][2] === d[2]) continue;
        var c = cfgEn(nx, ny, nz);
        if (c) {
          var s = salidaDe(nx, ny, nz, c, i ^ 1);
          if (s > maxOtras5) maxOtras5 = s;
        } else if (bloqueEnergizable(nx, ny, nz)) {
          // Un bloque solido adyacente a celda no debe tomar energia del bloque de RS situado en ax/bx
          var sb = 0;
          for (var j = 0; j < 6; j++) {
            var nnx = nx + dirsLocal[j][0], nny = ny + dirsLocal[j][1], nnz = nz + dirsLocal[j][2];
            if (nnx === celda.x && nny === celda.y && nnz === celda.z) continue;
            if (nnx === ax && nny === ay && nnz === az) continue;
            if (nnx === bx && nny === by && nnz === bz) continue;
            var c2 = cfgEn(nnx, nny, nnz);
            if (!c2) continue;
            var s2 = salidaDe(nnx, nny, nnz, c2, j ^ 1);
            if (s2 > sb) sb = s2;
          }
          if (sb > maxOtras5) maxOtras5 = sb;
        }
      }
      nivelEfectivo = maxOtras5;
    }

    var estaExtendido = (base === 'hab:piston-on' || base === 'hab:piston-pegajoso-on');
    // Si el pistón está extendido, ignorar la cara frontal nos asegura que el bloque de redstone pegado
    // no lo mantenga encendido. Sin embargo, si nivel (la señal externa global que entra al pistón)
    // cae a 0, o si maxOtras5 es 0, el pistón debe retraerse.
    var ahora = (nivelEfectivo >= 1);
    if (ahora !== estaExtendido) {
      accionar(celda.x, celda.y, celda.z, ahora);
    }
  }

  // ── 0 bis. la puerta de dos celdas ─────────────────────────────────────────────────────────
  // Una puerta de una celda se cruza agachando la cámara, así que el dueño subió su dibujo a 24 de
  // alto. Y con eso dejó de ser redstone (BUG-RS6). No es culpa del circuito: mcCabeEnRejilla exige
  // que una pieza quepa en UNA celda para poder entrar en mc.grid, y 24 son celda y media. Lo que no
  // cabe lo estampa el clic derecho como ESTRUCTURA suelta, y una estructura no tiene celda, ni
  // vecinos, ni señal — no hay dónde enchufarla.
  //
  // La salida NO es enseñarle redstone a las estructuras: son un draw call cada una y el dueño las
  // descartó por lentas. Es apilar DOS CELDAS de rejilla, `hab:puerta` abajo y `hab:puerta-alta`
  // encima (las parte redstone/partir_puerta.py del mismo dibujo), con la condición que puso él:
  // tienen que moverse AL UNÍSONO. Media puerta abierta es peor que una puerta lenta.
  //
  // «Al unísono» aquí es literal: la misma pasada, la misma llamada a mcRemeshAround, un fotograma.
  // Por eso la mitad de arriba NO es una pieza de redstone —no tiene señal propia, no conduce, no
  // hace cola— sino un material normal que escribe la de abajo. Y por eso la de abajo va con DOS
  // define() en vez de con `encendida`, igual que el pistón y por lo mismo: si el motor le cambiara
  // el bloque ÉL antes de avisar (redstone.js:448), la hoja de abajo ya estaría abierta mientras la
  // de arriba espera a que su material acabe de cargar. Decidiendo aquí, si falta algo no se mueve
  // NINGUNA de las dos y se reintenta entero.
  //
  // Esto jubila el apaño anterior, que era darle `conduce` a la puerta para que la hoja de arriba se
  // alimentase de la de abajo. Costaba un `perdida: 1` obligatorio (con 0 las dos hojas se sostenían
  // la una a la otra y la puerta no se cerraba jamás), abría con un tick de diferencia y al final
  // justo del alcance abría solo la mitad. Ya no hace falta, y encima una puerta de Minecraft
  // tampoco conduce señal.
  var ES_BAJA = { 'hab:puerta': 1, 'hab:puerta-abierta': 1 };
  var ES_ALTA = { 'hab:puerta-alta': 1, 'hab:puerta-alta-abierta': 1 };

  function claveEn(x, y, z) {
    return mcInside(x, y, z) ? (mc.blockKey[mc.grid[mcIdx(x, y, z)]] || '') : '';
  }

  function moverPuerta(x, y, z, abrir) {
    if (!ES_BAJA[baseDe(claveEn(x, y, z))]) return;   // ya no hay puerta ahí: la han roto o cambiado
    var ori = oriDe(claveEn(x, y, z));
    var reintentar = function () { moverPuerta(x, y, z, abrir); };
    // La orientación se ARRASTRA a las dos hojas: una puerta puesta con '@3' se abre en '@3', y la
    // mitad de arriba tiene que girar con ella o queda cruzada sobre el vano.
    var idAbajo = idDe(abrir ? 'hab:puerta-abierta' : 'hab:puerta', ori, reintentar);
    if (!idAbajo) return;                             // aún no está en la paleta: se reintenta sola

    // Arriba solo se toca si de verdad hay media puerta. Una puerta de una sola celda sigue siendo
    // legítima —es la de antes— y lo que el dueño haya puesto ahí encima no se pisa: esto MUEVE una
    // puerta, no la construye.
    var ay = y + 1, idArriba = 0;
    if (ES_ALTA[baseDe(claveEn(x, ay, z))]) {
      idArriba = idDe(abrir ? 'hab:puerta-alta-abierta' : 'hab:puerta-alta', ori, reintentar);
      if (!idArriba) return;                          // ⚠️ sin la de arriba no se mueve NINGUNA
    }

    var tocadas = [];
    if (mc.grid[mcIdx(x, y, z)] !== idAbajo) { mcSetBlock(x, y, z, idAbajo); tocadas.push([x, y, z]); }
    if (idArriba && mc.grid[mcIdx(x, ay, z)] !== idArriba) {
      mcSetBlock(x, ay, z, idArriba); tocadas.push([x, ay, z]);
    }
    if (tocadas.length) remallar(tocadas);
  }

  // Mismo umbral que el pistón: 15 → 14 no es un flanco, la puerta ya estaba abierta.
  function abrirPuerta(celda, nivel, antes) {
    var ahora = nivel >= 1, era = antes >= 1;
    if (ahora !== era) moverPuerta(celda.x, celda.y, celda.z, ahora);
  }

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
    // La puerta ocupa DOS celdas pero es UNA puerta: alimentas la de abajo y ella arrastra a la de
    // arriba en la misma pasada (ver «0 bis»). Los dos materiales van registrados por separado y sin
    // `encendida` a propósito — quien mueve las dos hojas es el callback, y tiene que poder negarse.
    // Ojo con quitar cualquiera de los dos: si la puerta abierta dejara de ser circuito se caería de
    // la cola y no volvería a cerrarse nunca.
    'hab:puerta':          { alRecibirSeñal: abrirPuerta },
    'hab:puerta-abierta':  { alRecibirSeñal: abrirPuerta },

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
    // `encendida`/`apagada`), así que un bloque de redstone puesto se queda como me está para siempre.
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

    // Pistón. Los DOS materiales llevan la misma configuración a propósito: no son «apagado» y
    // «encendido» de una pareja (para eso está `encendida`), son dos estados que gestiona el callback,
    // y los dos tienen que seguir siendo circuito o el pistón extendido se caería de la cola y no se
    // recogería jamás. Sin `encendida`, `apagada` es cada uno sí mismo y el motor no le toca el bloque.
    // Ver el bloque de arriba para el porqué.
    //
    // En Minecraft un pistón NO se activa desde su cara frontal (la cabeza).
    'hab:piston':        { alRecibirSeñal: empujar, _forzar: true, noCaraFrontal: true },
    'hab:piston-on':     { alRecibirSeñal: empujar, _forzar: true, noCaraFrontal: true },
    'hab:piston-cabeza': {},
    // Pistón pegajoso (REQ-RS15): misma lógica que el normal, pero al retraerse tira del bloque
    // que tenía delante. Los CUATRO materiales registrados (cuerpo off, cuerpo on, cabeza, cabeza)
    // por la misma razón que el pistón normal: si solo fuera uno se caería de la cola.
    'hab:piston-pegajoso':        { alRecibirSeñal: empujar, _forzar: true, noCaraFrontal: true },
    'hab:piston-pegajoso-on':     { alRecibirSeñal: empujar, _forzar: true, noCaraFrontal: true },
    'hab:piston-pegajoso-cabeza': {},

    // Bloque observador (Observer): detecta un cambio DELANTE y emite 15 por DETRÁS un instante.
    // Los dibujos viven en assets/; hab: se registra por si aparecen en la galería de habitantes.
    // ⚠️ `encendida` del asset tiene que ser el asset-on, no hab: — si no, al disparar se pedía un
    // material que no existe y el pulso no salía nunca (solo estaba en la paleta el off).
    'hab:observador':                       { encendida: 'hab:observador-on', soloAlAtras: true },
    'hab:observador-on':                    { emite: 15, encendida: 'hab:observador-on', apagada: 'hab:observador', soloAlAtras: true },
    'asset:assets/observador.vox.json':     { encendida: 'asset:assets/observador-on.vox.json', soloAlAtras: true },
    'asset:assets/observador-on.vox.json':  { emite: 15, encendida: 'asset:assets/observador-on.vox.json', apagada: 'asset:assets/observador.vox.json', soloAlAtras: true },
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
    // Las DOS hojas de la puerta abierta, o te comes la de arriba con la cabeza al pasar.
    ['hab:cable', 'hab:cable-on', 'hab:placa', 'hab:placa-on',
     'hab:puerta-abierta', 'hab:puerta-alta-abierta',
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
  var VERSION = 'piezas-1.4';
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
    + ' (cable, palanca, botón, placa, puerta, repetidor, inversor, pistón, pistón pegajoso, bloque de redstone, observador)'
    + ' · clic derecho o CENTRAL conmuta las manuales');
})();
