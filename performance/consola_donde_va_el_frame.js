// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// SONDA DE CONSOLA · ¿DÓNDE SE VA EL FRAME? · reparto del tick completo, función por función
//
// De dónde sale. `consola_fps_pixeles.js` cerró la primera pregunta (2026-08-21, tirada del dueño en
// fornite-tilted-towers con el vsync YA desactivado por línea de órdenes):
//
//     referencia 62,5 fps · 16× menos píxeles −0,6 % · sin mapa de sombra +1,6 % · media distancia +0,3 %
//     ms mcRender = 1,20
//
// O sea: el frame dura ~16 ms y `mcRender` sólo gasta 1,2 de JS. **Catorce milisegundos y pico no están en
// el dibujado.** Y no son de GPU: quitar el 94 % de los píxeles no movió la aguja, y media distancia de
// dibujado tampoco, así que ni fill-rate ni geometría. Esta sonda contesta a la única pregunta que queda:
// ¿en qué se van?
//
// CÓMO REPARTE. `mcTick` (app.js:19578) es TODO el JS del frame: update, fluidos, agentes, luz dinámica,
// vista-previa, hotbar, herramienta en mano, render, notas y rayos-X. Se envuelve entero, y con eso el frame
// se parte en dos mitades que no se solapan:
//
//     frame (rAF→rAF)  =  mcTick (JS nuestro)  +  RESTO (navegador: compositor, swap, GC, espera de GPU)
//
// Y luego se envuelve cada hijo. Ojo con leer la tabla: **los hijos anidados cuentan dentro de su padre**
// (`mcRenderShadow` está dentro de `mcRender`, que está dentro de `mcTick`), así que las columnas NO suman —
// por eso la tabla marca el anidamiento con sangría y da un «no atribuido» por nivel.
//
// LO QUE SIGNIFICA CADA VEREDICTO
//   · Si RESTO es la mayor parte ⇒ no es código nuestro. Es el navegador o la GPU: con vsync quitado eso
//     apunta a que la cola de la GPU va llena (aunque no sea por píxeles: puede ser subida de texturas,
//     cambios de estado o simplemente demasiadas llamadas de dibujo) o a GC.
//   · Si el grueso está en `mcUpdate` ⇒ física, snippets de bloques con comportamiento y esqueletos.
//   · Si está en `mcDynSync`/`mcDynBake` ⇒ la luz dinámica rehace el BFS de la caja cada frame; hay un
//     candado que debería evitarlo y algo se lo salta (ver la nota de las estrellas).
//   · Si está en `mcMeshChunk` ⇒ re-mallado mientras andas: es el precio de `renderDist`, no del dibujado.
//
// ⚠️ DOS COSAS QUE FALSEAN LA MEDIDA SI NO SE CUIDAN, y las dos se cuidan aquí:
//   1 · ANDAR A MANO. Cada fase mediría un trozo distinto del mapa. El paseo lo conduce el script, con la
//       MISMA ruta que `consola_fps_pixeles.js` y `consola_luz_paseo.js`, para poder cruzar las tres tablas.
//   2 · LA MEDIA. Un re-mallado suelto de 30 ms se come la media de 150 frames. Aquí todo es MEDIANA, y
//       además se da el pico y en cuántos frames de cada cien corre cada función: una que cuesta 20 ms pero
//       sólo entra 1 de cada 60 frames no es el problema, y con media lo parecería.
//
// LO QUE TRAE LA v2 (por orden del dueño, 2026-08-21: «mete el luzDiag en la sonda esa, y lo mismo tienes que
// instrumentar mcDynBake que parece que se lleva todo el pastel»). Cuando `mcDynBake` corre, la tabla saca
// además un bloque propio con:
//   · en qué % de las llamadas HORNEA de verdad y en cuántas se va por el no-op de la firma (se distingue
//     mirando `mc._dynSig` antes y después: la media de los dos caminos juntos no describe ninguno);
//   · lo que cuesta CADA horneado, y el coste POR CELDA en ns — que es lo único comparable entre dos cajas
//     de tamaño distinto, y por tanto lo único que dice si una caja más chica sale a cuenta o no;
//   · `game.luzDiag()` entero (semillas, reparto, caja, saturación, paso del campo);
//   · y el desglose que decide el arreglo: **cuánta caja pide cada familia de emisor por separado**. Si la
//     única que se mueve —la mano— pide 4 913 celdas y se le hornean 449 442, el coste no lo pone el
//     presupuesto: lo pone que emisores con ritmos incompatibles compartan una sola caja.
//
// CÓMO SE USA
//   await sondaFrame()            · 150 frames ≈ 3 s. No toques nada mientras corre.
//   await sondaFrame(400)         · más largo, más estable.
//   sondaFrame.texto / .crudo     · la última tabla / los números (incluye .luz, .diag y .familias).
//
// ⛔ NO andes tú: te lleva el script. Restaura posición y mirada al terminar, también si peta. Y deja los
//    globales como estaban: no toca `app.js`.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────
(() => {
  'use strict';

  const CALIENTA = 20;   // frames que se tiran al entrar: el primero mete chunks nuevos en el frustum

  const num = (v, d) => (+v || 0).toFixed(d == null ? 2 : d);
  const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));
  const izq = (s, n) => ' '.repeat(Math.max(0, n - String(s).length)) + String(s);
  const mediana = a => { const b = a.slice().sort((x, y) => x - y); const n = b.length;
                         return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; };

  // ── QUIÉN SE MIDE ──────────────────────────────────────────────────────────────────────────────────────
  // `nivel` es sólo para la sangría de la tabla: dice de quién es hijo, y por tanto dentro de qué tiempo ya
  // está contado. `nota` sale cuando la función resulta ser la cara.
  const RELOJ = [
    { n: 'mcTick',               nivel: 0, nota: 'TODO el JS del frame' },
    { n: 'mcUpdate',             nivel: 1, nota: 'física del jugador + snippets de bloques + esqueletos' },
    { n: 'mcAgentsTick',         nivel: 1, nota: 'lógica de los NPC-cubo (game.defineAgent)' },
    { n: 'mcAgentsSmoothUpdate', nivel: 1, nota: 'interpolación de agentes' },
    { n: 'mcDynSync',            nivel: 1, nota: 'recogida de semillas de luz dinámica · corre TODOS los frames' },
    { n: 'mcVoxUILuces',         nivel: 2, nota: 'semillas que aporta la capa voxelesUI (estrellas)' },
    { n: 'mcDynBake',            nivel: 2, nota: 'BFS de la caja de luz dinámica' },
    { n: 'mcLuzSubAjusta',       nivel: 3, nota: 'REQ-LUZ4 · ¿hay que cambiar el paso del campo?' },
    { n: 'mcCampoLuz',           nivel: 3, nota: 'reserva y limpieza de los arrays de la caja (los fill)' },
    { n: 'mcTablaLuz',           nivel: 3, nota: 'la tabla de opacos, que se reconstruye en cada llamada a propósito' },
    { n: 'mcUploadDynTex',       nivel: 2, nota: 'subida de la caja de luz a la GPU' },
    { n: 'mcComputeBlockLight',  nivel: 1, nota: 'BFS de la luz de bloque del MUNDO entero' },
    { n: 'mcUploadBlkTex',       nivel: 1, nota: 'subida del campo del mundo entero (texImage3D)' },
    { n: 'mcUpdateHotbar',       nivel: 1, nota: '' },
    { n: 'mcRender',             nivel: 1, nota: 'dibujado (JS: llamadas a GL, no trabajo de GPU)' },
    { n: 'mcRenderShadow',       nivel: 2, nota: 'rehorneado del mapa de sombra del sol' },
    { n: 'mcRenderRefl',         nivel: 2, nota: 'reflejo del agua (segunda escena entera)' },
    { n: 'mcRenderSky',          nivel: 2, nota: '' },
    { n: 'mcDrawVoxUI',          nivel: 2, nota: 'game.voxelesUI (partículas, estrellas, sangre)' },
    { n: 'mcDrawCapas',          nivel: 2, nota: '' },
    { n: 'mcMeshChunk',          nivel: 1, nota: 're-mallado de chunk al andar · lo manda renderDist' },
    { n: 'mcUploadStructAtlas',  nivel: 1, nota: '' },
    { n: 'mcUpdateNoteView',     nivel: 1, nota: '' },
    { n: 'mcSyncNoteSigns',      nivel: 1, nota: 'carteles 3D de las notas' },
    { n: 'mcUpdateXrayLabels',   nivel: 1, nota: 'etiquetas de rayos-X' },
    // Estas dos son `async`: el reloj sólo coge lo que hacen ANTES del primer `await`, que es justo la parte
    // que bloquea el frame. Lo de después ya cae en otro tick y se contabiliza donde toque.
    { n: 'mcUpdatePreview',      nivel: 1, nota: 'async · sólo se mide el tramo síncrono' },
    { n: 'mcSyncHeldToolStruct', nivel: 1, nota: 'async · sólo se mide el tramo síncrono' },
  ];

  // ── LA RUTA · idéntica a consola_fps_pixeles.js y consola_luz_paseo.js, para poder cruzar las tablas ────
  // Todo es función de `f`, el número de frame: ni una llamada a performance.now() aquí, o dejaría de ser
  // repetible.
  const RUTA = { largo: 24, paso: 0.04, giro: 30, periodo: 180 };

  function puntoDeRuta(f, org) {
    const s = f * RUTA.paso, ciclo = 2 * RUTA.largo;
    const u = s % ciclo, d = (u <= RUTA.largo) ? u : (ciclo - u);   // onda triangular: ida y vuelta
    const x = org.pos[0] + d, z = org.pos[2];
    const sx = Math.floor(x), sz = Math.floor(z);
    let y = org.pos[1];
    if (typeof mcSurfaceY === 'function' && typeof mcInside === 'function' && mcInside(sx, 0, sz)) {
      const surf = mcSurfaceY(sx, sz);
      if (surf >= 0) y = surf + 1;
    }
    const yaw = org.yaw + (RUTA.giro * Math.PI / 180) * Math.sin(2 * Math.PI * f / RUTA.periodo);
    return [x, y, z, yaw];
  }

  // ── ENVOLVER ───────────────────────────────────────────────────────────────────────────────────────────
  // `app.js` es un script clásico, así que sus `function mcX()` de nivel superior son propiedades del objeto
  // global: reasignar `window.mcX` cambia también a quién llaman los demás desde dentro de app.js. Es el
  // mismo truco que ya usa consola_fps_pixeles.js con mcRender/mcRenderShadow. NO toca el fichero.
  //
  // ⚠️ El acumulador se vacía por frame desde el envoltorio de `mcTick`, no aquí, porque una función puede
  // correr varias veces en el mismo frame (mcMeshChunk es el caso claro): se suma dentro del frame y lo que
  // va a la lista es el TOTAL del frame, que es lo que le cuesta al frame.
  const marco = {};                       // nombre → ms acumulados en el frame en curso
  const veces = {};                       // nombre → veces llamada en el frame en curso
  const quitar = [];

  function envuelve(nombre) {
    const orig = window[nombre];
    if (typeof orig !== 'function') return false;
    // `mcDynBake` lleva envoltorio propio: además del reloj hay que saber si esa llamada REHORNEÓ de verdad o
    // se fue por el no-op de la firma, porque el coste medio no significa lo mismo en un caso que en otro.
    const espia = (nombre === 'mcDynBake') ? espiaDynBake : null;
    window[nombre] = function () {
      const antes = espia ? espia.antes(arguments) : null;
      const t0 = performance.now();
      try { return orig.apply(this, arguments); }
      finally {
        const ms = performance.now() - t0;
        marco[nombre] = (marco[nombre] || 0) + ms; veces[nombre] = (veces[nombre] || 0) + 1;
        if (espia) espia.despues(antes, ms);
      }
    };
    quitar.push(() => { window[nombre] = orig; });
    return true;
  }

  // ── LA CAJA DE LUZ DINÁMICA, POR DENTRO ────────────────────────────────────────────────────────────────
  // `mcDynBake` tiene DOS caminos con costes de otro orden y la media los mezcla en un número que no describe
  // ninguno de los dos:
  //   · NO-OP  · la firma (celdas, alcance, haz y color de cada semilla + topología + foco) no cambió ⇒ vuelve
  //              enseguida. Es lo que la Ley VII promete cuando nada se mueve.
  //   · HORNEO · algo se movió ⇒ BFS de la caja ENTERA. No hay horneado parcial: mover una semilla re-siembra
  //              el volumen de todas las demás, se hayan movido o no.
  // Se distinguen mirando `mc._dynSig` antes y después: si cambió, horneó.
  const LUZ = { llamadas: 0, horneos: 0, msHorneo: [], msNoop: [], celdas: [], semillas: [],
                // EL TESTIGO DE MC_LUZ_SUB (2026-08-21, «quito las estrellas y se caen los fps»).
                // `mcLuzSubAjusta` deriva el paso del campo del ALCANCE que haya en escena, y si cambia hace
                // `mc._blEmiSig=null; mcComputeBlockLight()` — el BFS del MUNDO ENTERO. Con estrellas (alcance
                // 40) el techo del byte lo clava en 6 y no se mueve; sin ellas manda la mano (alcance 8) y sube
                // a 8. Si el alcance máximo OSCILA de un frame a otro, ese barrido global se paga en cada
                // oscilación. Es barato de vigilar y no había forma de verlo: se mira el valor cada frame.
                sub: [], subCambios: 0 };

  const espiaDynBake = {
    antes: args => ({ sig: mc._dynSig, sem: (args[0] && args[0].length) | 0 }),
    despues: (a, ms) => {
      LUZ.llamadas++;
      if (mc._dynSig !== a.sig) { LUZ.horneos++; LUZ.msHorneo.push(ms); } else LUZ.msNoop.push(ms);
      const D = mc.dynLight;
      if (D) LUZ.celdas.push(D.W * D.H * D.P);
      LUZ.semillas.push(a.sem);
    }
  };

  // Cuánto de la caja pide cada FAMILIA de emisor, por separado. Éste es el número que decide el arreglo: si
  // la caja de la mano sola es 4 913 celdas y la de todos junta es 449 442, entonces mover la mano está
  // re-sembrando el volumen de otros — y el problema es que compartan caja, no el tamaño del presupuesto.
  // El reparto es el mismo que usa game.luzDiag: org null = capa voxelesUI, org === la herramienta = mano.
  function cajasPorFamilia() {
    const sem = mc._dynSem || [], dim = mc.dim, T = mc._heldToolStruct, G = {};
    for (const s of sem) {
      const g = (s.org == null) ? 'voxelesUI (estrellas…)' : (s.org === T ? 'mano (herramienta)' : 'estructuras');
      const a = G[g] || (G[g] = { n: 0, nivel: 0, x0: 1e9, y0: 1e9, z0: 1e9, x1: -1e9, y1: -1e9, z1: -1e9 });
      a.n++; if (s.nivel > a.nivel) a.nivel = s.nivel;
      a.x0 = Math.min(a.x0, Math.max(0, s.x - s.nivel)); a.x1 = Math.max(a.x1, Math.min(dim.x - 1, s.x + s.nivel));
      a.y0 = Math.min(a.y0, Math.max(0, s.y - s.nivel)); a.y1 = Math.max(a.y1, Math.min(dim.y - 1, s.y + s.nivel));
      a.z0 = Math.min(a.z0, Math.max(0, s.z - s.nivel)); a.z1 = Math.max(a.z1, Math.min(dim.z - 1, s.z + s.nivel));
    }
    for (const g in G) { const a = G[g]; a.celdas = (a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1) * (a.z1 - a.z0 + 1); }
    return G;
  }

  async function sondaFrame(frames) {
    frames = Math.max(60, frames | 0 || 150);
    if (typeof mc === 'undefined' || !mc.active || !mc.dim) { console.warn('sondaFrame: no hay Mundo abierto'); return; }

    const org = { pos: [mc.pos[0], mc.pos[1], mc.pos[2]], yaw: mc.yaw, pitch: mc.pitch };
    const fin = puntoDeRuta(Math.round(RUTA.largo / RUTA.paso), org);
    if (fin[0] < 1 || fin[0] >= mc.dim.x - 1) {
      console.warn('sondaFrame: la ruta se sale del mundo por el eje X (origen ' + num(org.pos[0], 1) +
                   ', largo ' + RUTA.largo + ', mundo ' + mc.dim.x + '). Ponte más al oeste.');
      return;
    }

    LUZ.llamadas = LUZ.horneos = 0; LUZ.msHorneo.length = LUZ.msNoop.length = 0;
    LUZ.celdas.length = LUZ.semillas.length = 0;
    LUZ.sub.length = 0; LUZ.subCambios = 0;

    const vivos = RELOJ.filter(r => envuelve(r.n));
    const ausentes = RELOJ.filter(r => !vivos.includes(r));
    const M = {}; for (const r of vivos) M[r.n] = { ms: [], veces: 0, frames: 0, pico: 0 };
    const dts = [];

    console.log('%csondaFrame: ' + frames + ' frames conducidos. No toques nada.', 'color:#6cf');

    try {
      await new Promise(res => {
        let n = 0, prev = 0;
        // El paseo se coloca ANTES de que corra el tick del motor, así que hay que engancharse por delante:
        // un rAF propio pedido antes que el del motor. Si el motor ya pidió el suyo este frame, el nuestro
        // entra el siguiente y sólo se pierde un frame de calentamiento.
        const paso = t => {
          const p = puntoDeRuta(n, org);
          mc.pos[0] = p[0]; mc.pos[1] = p[1]; mc.pos[2] = p[2]; mc.yaw = p[3];
          if (prev && n >= CALIENTA) {
            dts.push(t - prev);
            for (const r of vivos) {
              const ms = marco[r.n] || 0, v = veces[r.n] || 0;
              const a = M[r.n];
              a.veces += v;
              if (v) { a.frames++; a.ms.push(ms); if (ms > a.pico) a.pico = ms; }
              else a.ms.push(0);      // el 0 SÍ entra en la mediana: si sólo corre 1 de cada 10 frames, su
                                      // coste por frame ES 0 nueve veces, y eso es lo que paga el frame
            }
          }
          // El paso del campo se mira CADA frame, no dentro de `mcDynBake`: lo que se busca es si OSCILA,
          // y una oscilación se ve comparando frames consecutivos. Es una global de `app.js` y la sonda
          // corre en ámbito global, así que se lee directamente; el `typeof` es por si se pega en una
          // versión del motor que no la tenga.
          if (n >= CALIENTA && typeof MC_LUZ_SUB !== 'undefined') {
            const ult = LUZ.sub.length ? LUZ.sub[LUZ.sub.length - 1] : MC_LUZ_SUB;
            if (MC_LUZ_SUB !== ult) LUZ.subCambios++;
            LUZ.sub.push(MC_LUZ_SUB);
          }
          for (const k in marco) { marco[k] = 0; veces[k] = 0; }
          prev = t; n++;
          if (n < CALIENTA + frames + 1) requestAnimationFrame(paso); else res();
        };
        requestAnimationFrame(paso);
      });
    } finally {
      for (const q of quitar) { try { q(); } catch (e) {} }
      quitar.length = 0;
      mc.pos[0] = org.pos[0]; mc.pos[1] = org.pos[1]; mc.pos[2] = org.pos[2];
      mc.yaw = org.yaw; mc.pitch = org.pitch;
    }

    // La radiografía se toma AQUÍ, con las envolturas ya retiradas pero antes de que el dueño toque nada:
    // describe el último frame del paseo, que es uno de los medidos. Tomarla al principio describiría el
    // sitio de donde salió, que no es donde se midió.
    let diag = null, familias = null;
    try { diag = JSON.parse(JSON.stringify(game.luzDiag())); familias = cajasPorFamilia(); } catch (e) {}

    const txt = tabla(M, vivos, ausentes, dts, frames, diag, familias);
    sondaFrame.texto = txt; sondaFrame.crudo = { M, dts, luz: LUZ, diag, familias };
    console.log(txt);
    return txt;
  }

  // ── EL BLOQUE DE LA LUZ DINÁMICA ───────────────────────────────────────────────────────────────────────
  // Sale sólo si mcDynBake llegó a correr. Contesta a tres preguntas que la tabla de arriba no puede:
  // ¿cuántas veces hornea de verdad?, ¿cuánto cuesta CADA horneado (y por celda, que es lo comparable entre
  // cajas de distinto tamaño)?, y ¿de quién es el volumen que se hornea?
  function bloqueLuz(dt, diag, familias) {
    if (!LUZ.llamadas) return [];
    const L = [];
    const celdas = mediana(LUZ.celdas) || 0;
    const msH = mediana(LUZ.msHorneo), msN = mediana(LUZ.msNoop);
    const pctH = 100 * LUZ.horneos / LUZ.llamadas;

    L.push('');
    L.push('  ── LA CAJA DE LUZ DINÁMICA (mcDynBake) ' + '─'.repeat(73));
    L.push('    rehornea en .................... ' + num(pctH, 1) + ' % de las llamadas (' +
           LUZ.horneos + ' de ' + LUZ.llamadas + ')' +
           (pctH > 95 ? '   ⚠️ el no-op de la firma NO cierra nunca' : ''));
    L.push('    cada horneado cuesta ........... ' + num(msH) + ' ms' +
           (LUZ.msNoop.length ? '   (un no-op: ' + num(msN) + ' ms)' : ''));
    L.push('    caja ........................... ' + Math.round(celdas).toLocaleString('es') + ' celdas' +
           (diag && diag.caja ? '  = ' + diag.caja.tam.join('×') + ', tope ' + diag.caja.tope.toLocaleString('es') +
            (diag.caja.recortada ? ', RECORTADA hacia el ojo' : '') : ''));
    if (celdas > 0) L.push('    coste por celda ................ ' + num(1e6 * msH / celdas, 1) +
                           ' ns   (es lo único comparable entre cajas de distinto tamaño)');
    if (diag && diag.semillas) {
      const s = diag.semillas;
      L.push('    semillas ....................... ' + s.usadas + ' de ' + s.candidatas + ' candidatas, tope ' +
             s.tope + (s.saturado ? '  ⚠️ SATURADO' : ''));
      L.push('    reparto ........................ ' + Object.entries(s.reparto).map(([k, v]) => k + ' ' + v).join(' · '));
    }
    if (diag) L.push('    paso del campo ................. sub ' + diag.sub + ' (pedido ' + diag.subModo +
                     '), escalón ' + diag.escalon + ' niveles');
    if (LUZ.sub.length) {
      const vistos = [...new Set(LUZ.sub)];
      L.push('    ese paso durante el paseo ...... ' + (vistos.length === 1
        ? 'quieto en ' + vistos[0]
        : 'CAMBIA ' + LUZ.subCambios + ' veces entre {' + vistos.join(', ') + '} en ' + LUZ.sub.length + ' frames'));
      if (LUZ.subCambios > 0) {
        // Cada cambio de MC_LUZ_SUB hace `mc._blEmiSig=null; mcComputeBlockLight()` — el BFS del MUNDO
        // ENTERO, no la caja. Si oscila, se paga ese barrido global una vez por oscilación, y encima
        // `mcDynBake` sale del no-op siempre. Es un coste que NO aparece en la línea de mcDynBake.
        L.push('    ⚠️ CADA CAMBIO RELANZA EL BFS DEL MUNDO ENTERO (mcComputeBlockLight). Mira su línea');
        L.push('       en la tabla de arriba: si ha dejado de correr en 0 %, el frame se va por ahí.');
      }
    }

    // El desglose que decide el arreglo.
    if (familias && Object.keys(familias).length) {
      L.push('');
      L.push('    ¿de quién es el volumen que se hornea?');
      // El «vs. la caja» pasa del 100 % a menudo, y no es un error: la unión que pide una familia puede ser
      // varias veces el presupuesto, y por eso la caja acaba saturada o recortada hacia el ojo.
      L.push('      ' + pad('familia', 26) + pad('semillas', 10) + pad('alcance', 9) + pad('su caja sola', 22) + 'vs. la caja que se hornea');
      const tot = Math.max(1, celdas);
      for (const [g, a] of Object.entries(familias).sort((x, y) => y[1].celdas - x[1].celdas)) {
        L.push('      ' + pad(g, 26) + pad(a.n, 10) + pad(a.nivel, 9) +
               pad(a.celdas.toLocaleString('es') + ' celdas', 22) + num(100 * a.celdas / tot, 1) + ' %');
      }
      const man = familias['mano (herramienta)'];
      const otras = Object.entries(familias).filter(([g]) => g !== 'mano (herramienta)')
                          .reduce((s, [, a]) => Math.max(s, a.celdas), 0);
      if (man && otras > man.celdas * 4) {
        L.push('');
        L.push('      🎯 LA QUE SE MUEVE ES LA MÁS PEQUEÑA. La mano pide ' + man.celdas.toLocaleString('es') +
               ' celdas y se le hornean ' + Math.round(celdas).toLocaleString('es') + ' (' +
               num(celdas / man.celdas, 0) + '× de más).');
        L.push('      No hay horneado parcial: mover una semilla re-siembra el volumen de TODAS. El coste no');
        L.push('      lo pone el presupuesto, lo pone que emisores con ritmos incompatibles compartan caja.');
      }
    }
    return L;
  }

  function tabla(M, vivos, ausentes, dts, frames, diag, familias) {
    const L = [];
    const dt = mediana(dts);
    const tick = M.mcTick ? mediana(M.mcTick.ms) : 0;
    const resto = dt - tick;

    L.push('▶ ¿DÓNDE SE VA EL FRAME? · ' + (game.mapName || '?') + ' · ' + frames + ' frames conducidos');
    L.push('');
    L.push('  frame completo (rAF→rAF) ......... ' + izq(num(dt), 7) + ' ms   =  ' + num(1000 / dt, 1) + ' fps');
    L.push('  ├─ mcTick  (JS nuestro) .......... ' + izq(num(tick), 7) + ' ms   ' + izq(num(100 * tick / dt, 1) + ' %', 8));
    L.push('  └─ RESTO   (navegador / GPU) ..... ' + izq(num(resto), 7) + ' ms   ' + izq(num(100 * resto / dt, 1) + ' %', 8));
    L.push('');
    L.push('  ' + pad('función', 26) + pad('ms/frame', 10) + pad('% frame', 9) + pad('pico', 9) + pad('corre en', 10) + 'qué es');
    L.push('  ' + '─'.repeat(112));
    for (const r of vivos) {
      if (r.n === 'mcTick') continue;
      const a = M[r.n], m = mediana(a.ms);
      const cuantos = Math.round(100 * a.frames / a.ms.length);
      L.push('  ' + pad(' '.repeat((r.nivel - 1) * 2) + r.n, 26) +
             pad(num(m), 10) + pad(num(100 * m / dt, 1) + ' %', 9) +
             pad(num(a.pico), 9) + pad(cuantos + ' %', 10) + r.nota);
    }
    L.push('');
    L.push('  (la sangría marca de quién es hijo: un hijo YA está contado dentro de su padre, así que la');
    L.push('   columna no suma. «corre en» = en qué porcentaje de frames llega a entrar.)');

    // ── No atribuido: lo que gasta un padre y no explica ninguno de sus hijos medidos ──
    const sumaNivel1 = vivos.filter(r => r.nivel === 1).reduce((s, r) => s + mediana(M[r.n].ms), 0);
    const sinAtribuir = tick - sumaNivel1;
    L.push('');
    L.push('  dentro de mcTick, no atribuido a ninguna de las de arriba: ' + num(sinAtribuir) + ' ms (' +
           num(100 * sinAtribuir / dt, 1) + ' % del frame)');
    if (ausentes.length) L.push('  (no existen en este build, no se midieron: ' + ausentes.map(r => r.n).join(', ') + ')');

    for (const l of bloqueLuz(dt, diag, familias)) L.push(l);

    // ── EL VEREDICTO. Ningún porcentaje se declara sin que la dispersión lo aguante. ──
    L.push('');
    const disp = (Math.max(...dts) - Math.min(...dts)) / dt;
    if (disp > 1.5) {
      L.push('  ⚠️ MEDIDA MOVIDA: el frame va de ' + num(Math.min(...dts)) + ' a ' + num(Math.max(...dts)) +
             ' ms. La mediana aguanta, pero mira la columna «pico» antes de creerte nada.');
    }
    const peorHijo = vivos.filter(r => r.n !== 'mcTick')
                          .map(r => ({ n: r.n, m: mediana(M[r.n].ms), nota: r.nota }))
                          .sort((a, b) => b.m - a.m)[0];
    if (resto / dt > 0.5) {
      L.push('  🎯 MÁS DE MEDIO FRAME ESTÁ FUERA DE NUESTRO JS (' + num(100 * resto / dt, 1) + ' %).');
      L.push('     No lo arregla optimizar una función: es el navegador o la cola de la GPU. Y como la sonda');
      L.push('     de píxeles ya descartó fill-rate y geometría, el siguiente sospechoso son las SUBIDAS DE');
      L.push('     TEXTURA por frame (uBlkTex/uDynTex son texImage3D del mundo entero) y el número de');
      L.push('     llamadas de dibujo: game.perfDump() y el contador de draw calls, no más microoptimización.');
    } else if (peorHijo && peorHijo.m / dt > 0.15) {
      L.push('  🎯 SE LO COME ' + peorHijo.n + ': ' + num(peorHijo.m) + ' ms/frame (' +
             num(100 * peorHijo.m / dt, 1) + ' % del frame)' + (peorHijo.nota ? ' — ' + peorHijo.nota : '') + '.');
    } else {
      L.push('  🎯 NADIE SE LLEVA UN TROZO GRANDE: el coste está repartido. Eso normalmente significa que el');
      L.push('     frame lo marca el RESTO (navegador/GPU) y no hay una función culpable que perseguir.');
    }
    return L.join('\n');
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════════════
  // sondaLuzCoste() · ¿DE QUÉ DEPENDE LO QUE CUESTA UN HORNEADO?
  //
  // De dónde sale (2026-08-21). `sondaFrame` dejó `mcDynBake` en 21,4 ms y con TODOS sus hijos medidos a
  // 0,00: el gasto está en el BFS escrito en línea dentro de la función, así que no queda nada que envolver
  // sin partir `app.js`. Pero comparando dos tiradas del dueño salió algo mejor que un desglose:
  //
  //     caja 449 442 celdas (160 semillas) → 21,5 ms = 47,8 ns/celda
  //     caja  ~60 000 celdas               →  0,40 ms =  6,7 ns/celda
  //
  // 7× más caro POR CELDA en la caja grande. Si el coste fuese O(celdas), los ns/celda serían los mismos.
  // La hipótesis es que cada celda se relaja una vez por cada semilla que la alcanza ⇒ el término que manda
  // es `celdas × semillas`, no `celdas`. Y eso cambia el arreglo: si es cierto, separar la mano de las
  // estrellas no divide el coste por la razón de volúmenes, sino por bastante más.
  //
  // CÓMO SE MIDE SIN TOCAR app.js. `mcDynSync` le pasa a `mcDynBake` un array de semillas YA ORDENADO por
  // distancia al ojo. Basta con interceptarlo y entregarle un subconjunto: la caja se recalcula sola a
  // partir de las semillas que reciba, así que cada fase da su propio par (celdas, ms) y de ahí sale la
  // curva. Las fases por familia (`sólo la mano`, `sólo voxelesUI`) miden directamente **cuánto costaría el
  // arreglo antes de escribirlo**.
  //
  // ⚠️ DURANTE LA SONDA VERÁS LUCES APAGADAS. Es la medida, no un cambio: se está sembrando con menos
  //    emisores a propósito. Al terminar se restaura `mcDynBake` y se fuerza un horneado completo. Nada de
  //    esto se publica ni toca la Ley de la Luz — es un instrumento, no un apaño.
  //
  //   await sondaLuzCoste()        · 3 rondas × 7 fases × 40 frames
  //   await sondaLuzCoste(60, 4)   · más frames por fase, más rondas
  // ════════════════════════════════════════════════════════════════════════════════════════════════════════
  const FASES_LUZ = [
    { id: 'todas',  nombre: 'todas (como está)',            f: s => s },
    { id: 'n80',    nombre: 'las 80 más cercanas al ojo',   f: s => s.slice(0, 80) },
    { id: 'n40',    nombre: 'las 40 más cercanas',          f: s => s.slice(0, 40) },
    { id: 'n20',    nombre: 'las 20 más cercanas',          f: s => s.slice(0, 20) },
    { id: 'n10',    nombre: 'las 10 más cercanas',          f: s => s.slice(0, 10) },
    { id: 'mano',   nombre: 'SÓLO la mano (lo que se mueve)',    f: s => s.filter(x => x.org === mc._heldToolStruct) },
    { id: 'quieto', nombre: 'SÓLO voxelesUI (lo que no se mueve)', f: s => s.filter(x => x.org == null) },
  ];

  async function sondaLuzCoste(frames, rondas) {
    frames = Math.max(20, frames | 0 || 40);
    rondas = Math.max(2, rondas | 0 || 3);
    if (typeof mc === 'undefined' || !mc.active || !mc.dim) { console.warn('sondaLuzCoste: no hay Mundo abierto'); return; }
    if (typeof mcDynBake !== 'function') { console.warn('sondaLuzCoste: no existe mcDynBake'); return; }

    const org = { pos: [mc.pos[0], mc.pos[1], mc.pos[2]], yaw: mc.yaw, pitch: mc.pitch };
    const orig = window.mcDynBake;
    let filtro = s => s;
    const acc = { ms: [], celdas: [], sem: [] };

    window.mcDynBake = function (sem) {
      const recorte = filtro(sem || []);
      const sig = mc._dynSig;
      const t0 = performance.now();
      try { return orig.call(this, recorte); }
      finally {
        const ms = performance.now() - t0;
        if (mc._dynSig !== sig) {           // sólo cuentan los horneados de verdad; los no-op no miden nada
          acc.ms.push(ms); acc.sem.push(recorte.length);
          const D = mc.dynLight; acc.celdas.push(D ? D.W * D.H * D.P : 0);
        }
      }
    };

    const R = {}; for (const f of FASES_LUZ) R[f.id] = { ms: [], celdas: [], sem: [] };
    console.log('%csondaLuzCoste: ' + rondas + ' rondas × ' + FASES_LUZ.length + ' fases × ' + frames +
                ' frames. Vas a ver luces apagándose: es la medida. No toques nada.', 'color:#6cf');

    try {
      for (let r = 0; r < rondas; r++) {
        for (const fase of FASES_LUZ) {
          filtro = fase.f;
          mc._dynSig = null;                                    // que el primer frame de la fase hornee sí o sí
          acc.ms.length = acc.celdas.length = acc.sem.length = 0;
          await new Promise(res => {
            let n = 0;
            const paso = () => {
              const p = puntoDeRuta(n, org);
              mc.pos[0] = p[0]; mc.pos[1] = p[1]; mc.pos[2] = p[2]; mc.yaw = p[3];
              n++;
              if (n < frames) requestAnimationFrame(paso); else res();
            };
            requestAnimationFrame(paso);
          });
          const a = R[fase.id];
          if (acc.ms.length) { a.ms.push(mediana(acc.ms)); a.celdas.push(mediana(acc.celdas)); a.sem.push(mediana(acc.sem)); }
        }
      }
    } finally {
      window.mcDynBake = orig;
      mc.pos[0] = org.pos[0]; mc.pos[1] = org.pos[1]; mc.pos[2] = org.pos[2];
      mc.yaw = org.yaw; mc.pitch = org.pitch;
      mc._dynSig = null; try { mcDynSync(); } catch (e) {}     // devuelve la iluminación entera
    }

    const txt = tablaLuzCoste(R, rondas, frames);
    sondaLuzCoste.texto = txt; sondaLuzCoste.crudo = R;
    console.log(txt);
    return txt;
  }

  function tablaLuzCoste(R, rondas, frames) {
    const L = [];
    L.push('▶ ¿DE QUÉ DEPENDE UN HORNEADO? · ' + (game.mapName || '?') + ' · ' + rondas + ' rondas × ' +
           frames + ' frames, paseo conducido');
    L.push('');
    L.push('  ' + pad('semillas que recibe', 34) + pad('nº', 6) + pad('caja', 14) + pad('ms/horneado', 13) +
           pad('ns/celda', 11) + 'ns/(celda·semilla)');
    L.push('  ' + '─'.repeat(102));
    const fila = {};
    for (const f of FASES_LUZ) {
      const a = R[f.id];
      if (!a.ms.length) { L.push('  ' + pad(f.nombre, 34) + '(no llegó a hornear)'); continue; }
      const ms = mediana(a.ms), cel = mediana(a.celdas), sem = mediana(a.sem);
      fila[f.id] = { ms, cel, sem, nsC: cel ? 1e6 * ms / cel : 0, nsCS: (cel && sem) ? 1e6 * ms / (cel * sem) : 0 };
      L.push('  ' + pad(f.nombre, 34) + pad(Math.round(sem), 6) +
             pad(Math.round(cel).toLocaleString('es'), 14) + pad(num(ms), 13) +
             pad(num(fila[f.id].nsC, 1), 11) + num(fila[f.id].nsCS, 3));
    }
    L.push('');
    L.push('  (sólo se cuentan los horneados de verdad, no los no-op de la firma. La caja la recalcula el');
    L.push('   propio motor a partir de las semillas que recibe, por eso cambia en cada fila.)');
    L.push('');

    // ── EL VEREDICTO. La pregunta es cuál de las dos columnas de la derecha se queda quieta. ──
    const t = fila.todas, p = fila.n20 || fila.n40;
    if (t && p) {
      const varC = Math.abs(p.nsC - t.nsC) / Math.max(1e-9, t.nsC);
      const varCS = Math.abs(p.nsCS - t.nsCS) / Math.max(1e-9, t.nsCS);
      if (varCS < varC) {
        L.push('  🎯 EL COSTE VA COMO celdas × SEMILLAS. Los ns/celda se disparan al meter semillas, pero los');
        L.push('     ns/(celda·semilla) se quedan quietos: cada celda se relaja una vez por emisor que la');
        L.push('     alcanza. ⇒ quitar semillas de la caja vale MÁS que encogerla, y separar por familias');
        L.push('     ataca las dos cosas a la vez (menos semillas Y menos volumen).');
      } else {
        L.push('  🎯 EL COSTE VA COMO celdas. Los ns/celda se mantienen al cambiar el número de semillas ⇒ lo');
        L.push('     único que importa es el volumen, y la palanca es el presupuesto (game.luzDinCeldas).');
      }
    }
    const m = fila.mano, q = fila.quieto;
    if (m && t) {
      L.push('');
      L.push('  LO QUE COSTARÍA EL ARREGLO, MEDIDO: sembrar sólo lo que se mueve son ' + num(m.ms) + ' ms contra ' +
             num(t.ms) + ' ms de ahora (' + num(t.ms / Math.max(1e-9, m.ms), 0) + '× menos), con una caja de ' +
             Math.round(m.cel).toLocaleString('es') + ' celdas.');
      if (q) L.push('  Y lo que NO se mueve cuesta ' + num(q.ms) + ' ms — pero sólo hay que pagarlo cuando cambie ' +
                    'algo, no en cada frame.');
    }
    return L.join('\n');
  }

  window.sondaFrame = sondaFrame;
  window.sondaLuzCoste = sondaLuzCoste;
  console.log('%csondaFrame listo. NO andes tú, te lleva el script: await sondaFrame()', 'color:#6cf');
  console.log('%csondaLuzCoste listo: await sondaLuzCoste()  ← de qué depende lo que cuesta un horneado', 'color:#6cf');
})();
