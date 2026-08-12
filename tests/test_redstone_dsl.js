// @area: redstone
// @necesita: servidor, playwright
// Redstone r1.1 — el vocabulario nuevo (`retardo`, `manual`, `pulso`) y las piezas que salen de él.
//
// Lo que de verdad se defiende aquí es la respuesta a «¿es esto Turing-completo?», que se apoya en
// tres patas y cada una tiene su bloque de casos:
//
//   §5 NOR      — `invertida` + el OR del cable = un juego de puertas COMPLETO (con NOR se construye
//                 cualquier función booleana, así que no hacen falta AND ni XOR como piezas).
//   §6 RELOJ    — `retardo` reparte el cambio entre pasadas. Sin él una realimentación se resuelve
//                 dentro de la misma pasada y el guardia anti-oscilación la funde (§7): eso es
//                 lógica combinacional. Con él es un reloj, y con reloj hay lógica SECUENCIAL.
//   §8 MEMORIA  — dos inversores cruzados = biestable: se queda en el estado en el que lo dejas.
//                 Combinacional + tiempo + memoria = máquina. (La cinta es mc.dim y por tanto
//                 finita: autómata linealmente acotado, la misma letra pequeña que Minecraft.)
//
// El motor y las piezas se inyectan desde los FICHEROS FUENTE: el test tiene que fallar cuando se
// rompa redstone/*.js, no cuando alguien olvide re-publicar el snippet.
// No persiste nada: bloquea los POST y devuelve las celdas tocadas a su valor anterior.
const { chromium } = require('playwright');
const fs = require('fs');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const motor  = fs.readFileSync(__dirname + '/../redstone/redstone.js', 'utf8');
  const piezas = fs.readFileSync(__dirname + '/../redstone/redstone-piezas.js', 'utf8');
  // La version se SACA de la fuente que acabamos de leer, no se clava aqui: lo que hay que
  // comprobar es que el mundo corre ESTE motor y no un snippet publicado viejo. Con el literal
  // escrito a mano, el test fallaba en cada subida de VERSION sin que nada estuviera roto.
  const VERSION = (motor.match(/VERSION\s*=\s*'([^']+)'/) || [])[1];

  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\//.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
    window.__avisos = [];
    const warn = console.warn.bind(console);
    console.warn = (...a) => { window.__avisos.push(a.join(' ')); warn(...a); };
  });
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(4000);
  await p.evaluate(motor);
  await p.evaluate(piezas);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const R = game.redstone;
    out.version = R.version;

    // ── un hueco de AIRE ────────────────────────────────────────────────────────────────────────
    // Los circuitos de este test van colgados en el aire a propósito: una celda de redstone no
    // necesita apoyo, y buscar aire despejado es mucho más fiable que buscar suelo con sitio arriba.
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)];
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || null;
    let caja = null;
    const AN = 14, AL = 6, PR = 6;
    for (let y = mc.dim.y - AL - 2; y > 4 && !caja; y--)
      for (let x = 4; x < mc.dim.x - AN - 4 && !caja; x += 2)
        for (let z = 4; z < mc.dim.z - PR - 4; z += 2) {
          let libre = true;
          for (let dx = -1; dx <= AN && libre; dx++) for (let dy = -1; dy <= AL; dy++)
            for (let dz = -1; dz <= PR; dz++) if (idEn(x + dx, y + dy, z + dz)) { libre = false; break; }
          if (libre) { caja = [x, y, z]; break; }
        }
    if (!caja) { out.errs.push('sin hueco de aire donde montar el circuito'); return out; }
    const [X, Y, Z] = caja;
    out.caja = caja;

    // Las piezas se cargan de verdad: esto comprueba de paso que los .vox.json generados existen.
    const CLAVES = ['hab:cable', 'hab:cable-on', 'hab:palanca', 'hab:palanca-on',
                    'hab:repetidor', 'hab:repetidor-on', 'hab:antorcha-apagada', 'hab:antorcha'];
    for (const k of CLAVES) if (!mc.name2id[k]) {
      try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga ' + k + ': ' + e.message); }
    }
    out.cargadas = CLAVES.filter(k => !!mc.name2id[k]);

    const tocadas = new Map();                 // para devolverlo todo como estaba
    const pon = (x, y, z, clave) => {
      const k = x + ',' + y + ',' + z;
      if (!tocadas.has(k)) tocadas.set(k, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, clave ? mc.name2id[clave] : 0);
    };
    const ticks = n => { for (let i = 0; i < n; i++) R.tick(); };

    // ── §1 · el vocabulario llega a la tabla ───────────────────────────────────────────────────
    const lst = () => R.lista();
    const busca = k => lst().find(c => c.clave === k) || null;
    out.cable = busca('hab:cable');
    out.palanca = busca('hab:palanca');
    out.repetidor = busca('hab:repetidor');
    out.puerta = busca('hab:puerta');

    // ── §2 · CABLE: la señal viaja y pierde 1 por salto ────────────────────────────────────────
    // Fuente en X, cable en X+1..X+5. El nivel de una celda del tendido es lo que RECIBE.
    const FUENTE = 'hab:palanca';               // una palanca encendida es la fuente más honesta
    pon(X, Y, Z, 'hab:palanca-on');
    for (let i = 1; i <= 5; i++) pon(X + i, Y, Z, 'hab:cable');
    R.revisarCaja(X, Y, Z, X + 5, Y, Z);
    ticks(4);
    out.tendido = [1, 2, 3, 4, 5].map(i => R._potencia.get((X + i) + ',' + Y + ',' + Z) || 0);
    out.cableLuce = claveEn(X + 1, Y, Z);

    // ── §3 · FLANCO DE BAJADA: al quitar la fuente el tendido cae ENTERO ────────────────────────
    pon(X, Y, Z, null);
    ticks(6);
    out.tendidoTrasQuitar = [1, 2, 3, 4, 5].map(i => R._potencia.get((X + i) + ',' + Y + ',' + Z) || 0);
    out.cableApagado = claveEn(X + 1, Y, Z);
    for (let i = 1; i <= 5; i++) pon(X + i, Y, Z, null);

    // ── §4 · MANUAL: la palanca la gira el jugador, y el drenado NO se la lleva por delante ─────
    pon(X, Y, Z, 'hab:palanca');
    R.revisar(X, Y, Z); ticks(2);
    out.palancaInicial = claveEn(X, Y, Z);
    out.conmutaOk = R.conmutar(X, Y, Z);
    out.palancaTrasConmutar = claveEn(X, Y, Z);
    ticks(5);                                   // ← aquí es donde una celda no-manual se apagaría sola
    out.palancaAguanta = claveEn(X, Y, Z);
    R.conmutar(X, Y, Z); ticks(2);
    out.palancaTrasSegundoClic = claveEn(X, Y, Z);
    // Y sobre algo que no es manual, conmutar dice que no sin tocar nada ni protestar.
    pon(X + 1, Y, Z, 'hab:cable');
    out.conmutaNoManual = R.conmutar(X + 1, Y, Z);
    pon(X + 1, Y, Z, null);

    // ── §5 · NOR: `invertida` + el OR del cable = juego de puertas completo ─────────────────────
    // Antorcha en el centro con una palanca a cada lado. Luce solo si NINGUNA está encendida.
    const T = [X + 8, Y, Z], A = [X + 7, Y, Z], B = [X + 9, Y, Z];
    R.define('hab:antorcha-apagada', { encendida: 'hab:antorcha', invertida: true, emite: 15, precargar: false });
    const norCon = (a, b) => {
      pon(A[0], A[1], A[2], a ? 'hab:palanca-on' : 'hab:palanca');
      pon(B[0], B[1], B[2], b ? 'hab:palanca-on' : 'hab:palanca');
      R.revisarCaja(A[0], Y, Z, B[0], Y, Z);
      ticks(6);
      return claveEn(T[0], T[1], T[2]) === 'hab:antorcha';   // ¿luce?
    };
    pon(T[0], T[1], T[2], 'hab:antorcha-apagada');
    out.nor = [norCon(0, 0), norCon(1, 0), norCon(0, 1), norCon(1, 1)];
    [T, A, B].forEach(c => pon(c[0], c[1], c[2], null));
    ticks(3);

    // ── §6 · RELOJ: `retardo` convierte una realimentación en TIEMPO ────────────────────────────
    // Antorcha invertida con un cable pegado que le devuelve su propia salida. Sin retardo eso es un
    // bucle combinacional (§7); con retardo, parpadea.
    // ⚠️ Se vacía el buzón de avisos ANTES de montar el reloj, igual que en §7. Sin esto lo que se
    // mira no son los avisos de ESTE circuito sino todos los que lleve el mapa desde que abrió, y en
    // /map/test hay circuitos del dueño: el «no se funde» fallaba por culpa de un aviso de otro
    // circuito que está a 40 bloques y no tiene nada que ver.
    window.__avisos.length = 0;
    const RT = [X, Y + 2, Z], RC = [X + 1, Y + 2, Z];
    R.define('hab:antorcha-apagada', { encendida: 'hab:antorcha', invertida: true, emite: 15, retardo: 2, precargar: false });
    pon(RT[0], RT[1], RT[2], 'hab:antorcha-apagada');
    pon(RC[0], RC[1], RC[2], 'hab:cable');
    R.revisarCaja(RT[0], RT[1], RT[2], RC[0], RC[1], RC[2]);
    let anterior = claveEn(RT[0], RT[1], RT[2]), cambios = 0;
    const historia = [];
    for (let i = 0; i < 60; i++) {
      R.tick();
      const ahora = claveEn(RT[0], RT[1], RT[2]);
      if (ahora !== anterior) { cambios++; anterior = ahora; historia.push(i); }
    }
    out.relojCambios = cambios;
    out.relojHistoria = historia.slice(0, 8);
    out.relojSigueVivo = R._esperando.size > 0 || R._cola.size > 0;
    out.relojSinFundir = !window.__avisos.some(a => /oscilando/.test(a));
    // Un repetidor SIN retardo no espera; con retardo, `info` lo cuenta.
    out.esperandoInfo = R.info(RT[0], RT[1], RT[2]).esperando;

    // ── §7 · sin retardo, la misma realimentación se FUNDE (y no cuelga) ────────────────────────
    R.define('hab:antorcha-apagada', { encendida: 'hab:antorcha', invertida: true, emite: 15, precargar: false });
    window.__avisos.length = 0;
    R._potencia.delete(RT.join(',')); R._potencia.delete(RC.join(','));
    R.revisarCaja(RT[0], RT[1], RT[2], RC[0], RC[1], RC[2]);
    const t0 = performance.now();
    ticks(3);
    out.msFundido = +(performance.now() - t0).toFixed(1);
    out.avisaOscilacion = window.__avisos.some(a => /oscilando/.test(a));
    [RT, RC].forEach(c => pon(c[0], c[1], c[2], null));
    ticks(2);

    // ── §8 · MEMORIA: un biestable de verdad, y hace falta `mira` ──────────────────────────────
    // Anillo de dos inversores: A → B → C → D → A. Lo que lo hace posible es que una antorcha
    // escuche SOLO por su espalda (`mira`, y el lado sale del giro de la clave): sin eso, A leería el
    // mismo cable B que ella alimenta, se realimentaría a sí misma y el anillo no sería un biestable
    // sino un oscilador. A escucha por +Z (giro 3) y C por −Z (giro 1).
    //
    //     D ← C          A y C invierten;  B y D son cable.
    //     ↓   ↑          A = NO(D) = NO(C) ;  C = NO(B) = NO(A)  ⇒ dos estados estables = UN BIT.
    //     A → B
    R.define('hab:antorcha-apagada', { encendida: 'hab:antorcha', invertida: true, emite: 15, mira: true, retardo: 1, precargar: false });
    for (const k of ['hab:antorcha-apagada@3', 'hab:antorcha@3', 'hab:antorcha-apagada@1', 'hab:antorcha@1'])
      if (!mc.name2id[k]) { try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga ' + k); } }
    const A2 = [X, Y + 4, Z],     B2 = [X + 1, Y + 4, Z];
    const C2 = [X + 1, Y + 4, Z + 1], D2 = [X, Y + 4, Z + 1];
    const SET = [X + 1, Y + 5, Z];                       // palanca pegada solo al cable B
    const RST = [X, Y + 5, Z + 1];                       // palanca pegada solo al cable D
    const lee = () => [claveEn(A2[0], A2[1], A2[2]), claveEn(C2[0], C2[1], C2[2])];
    // El anillo NO se prueba desde el arranque en seco: con los dos inversores apagados nace en su
    // punto metaestable y, como los dos avanzan con el mismo `retardo`, bascularían al unísono. Eso
    // no es un fallo del motor — un biestable real tampoco elige solo al darle corriente: hay que
    // ponerlo. Así que se le da SET desde el principio y lo que se mide es lo único que importa:
    // que al RETIRAR la fuente el anillo se quede donde lo dejaron, y que con RESET se quede en el
    // otro sitio. Dos estados que sobreviven a quien los puso = UN BIT.
    pon(A2[0], A2[1], A2[2], 'hab:antorcha-apagada@3');
    pon(C2[0], C2[1], C2[2], 'hab:antorcha-apagada@1');
    pon(B2[0], B2[1], B2[2], 'hab:cable');
    pon(D2[0], D2[1], D2[2], 'hab:cable');
    pon(SET[0], SET[1], SET[2], 'hab:palanca-on');
    R.revisarCaja(X, Y + 4, Z, X + 1, Y + 5, Z + 1);
    ticks(20);
    out.bitTrasSet = lee();
    // Al retirar el SET el anillo se queda donde estaba: eso es acordarse.
    pon(SET[0], SET[1], SET[2], null);
    ticks(20);
    out.bitRecordado = lee();
    ticks(20);
    out.bitEstable = String(lee()) === String(out.bitRecordado);   // y no deriva al seguir corriendo
    out.bitOpuestos = /apagada/.test(out.bitRecordado[0]) !== /apagada/.test(out.bitRecordado[1]);
    // RESET por el otro lado del anillo: mismo circuito, estado contrario, y también se queda.
    pon(RST[0], RST[1], RST[2], 'hab:palanca-on');
    ticks(20);
    pon(RST[0], RST[1], RST[2], null);
    ticks(20);
    out.bitRecordado2 = lee();
    out.bitDosEstados = String(out.bitRecordado2) !== String(out.bitRecordado);
    [A2, B2, C2, D2, SET, RST].forEach(c => pon(c[0], c[1], c[2], null));
    ticks(3);

    // ── §9 · PULSO: la placa se suelta sola ────────────────────────────────────────────────────
    R.define('hab:palanca', { manual: true, emite: 15, encendida: 'hab:palanca-on', pulso: 120, precargar: false });
    pon(X, Y + 4, Z, 'hab:palanca');
    R.encender(X, Y + 4, Z, true);
    out.pulsoDentro = claveEn(X, Y + 4, Z);
    await new Promise(res => setTimeout(res, 400));
    ticks(2);
    out.pulsoFuera = claveEn(X, Y + 4, Z);

    // ── limpieza ──────────────────────────────────────────────────────────────────────────────
    R._esperando.clear(); R._cola.clear();
    let sucias = 0;
    tocadas.forEach(t => { mcSetBlock(t[0], t[1], t[2], t[3]); if (idEn(t[0], t[1], t[2]) !== t[3]) sucias++; });
    mcRemeshAround(X - 2, Z - 2, X + 14, Z + 8);
    out.limpio = sucias === 0;
    return out;
  });

  if (r.errs && r.errs.length) console.log('  · ' + r.errs.join('\n  · '));
  console.log('Motor ' + VERSION + ' — vocabulario');
  ok('la version es la de la fuente', r.version === VERSION, r.version + ' vs ' + VERSION);
  ok('las 8 piezas cargan de la galeria', (r.cargadas || []).length === 8, (r.cargadas || []).join(' '));
  ok('el cable se declara como conductor', !!(r.cable && r.cable.conduce), JSON.stringify(r.cable));
  ok('la palanca se declara manual', !!(r.palanca && r.palanca.manual), JSON.stringify(r.palanca));
  ok('el repetidor lleva retardo', !!(r.repetidor && r.repetidor.retardo >= 1), JSON.stringify(r.repetidor));
  ok('la puerta esta declarada', !!r.puerta);

  console.log('\nCable — la senal viaja y se gasta');
  ok('el tendido pierde 1 por salto', JSON.stringify(r.tendido) === '[15,14,13,12,11]', JSON.stringify(r.tendido));
  ok('y el cable con senal LUCE', r.cableLuce === 'hab:cable-on', r.cableLuce);
  console.log('\nFlanco de bajada — al quitar la fuente cae el tendido ENTERO');
  ok('ninguna celda se queda alimentandose sola', JSON.stringify(r.tendidoTrasQuitar) === '[0,0,0,0,0]', JSON.stringify(r.tendidoTrasQuitar));
  ok('y el cable vuelve a su material apagado', r.cableApagado === 'hab:cable', r.cableApagado);

  console.log('\nManual — la palanca es una ENTRADA, no un resultado');
  ok('nace apagada', r.palancaInicial === 'hab:palanca', r.palancaInicial);
  ok('conmutar() la enciende', r.conmutaOk === true && r.palancaTrasConmutar === 'hab:palanca-on', r.palancaTrasConmutar);
  ok('el drenado NO se la lleva por delante', r.palancaAguanta === 'hab:palanca-on', r.palancaAguanta);
  ok('el segundo clic la apaga', r.palancaTrasSegundoClic === 'hab:palanca', r.palancaTrasSegundoClic);
  ok('conmutar() sobre algo no-manual dice que no', r.conmutaNoManual === false);

  console.log('\nNOR (invertida + el OR del cable) — juego de puertas COMPLETO');
  ok('0,0 → luce', r.nor[0] === true);
  ok('1,0 → apagada', r.nor[1] === false);
  ok('0,1 → apagada', r.nor[2] === false);
  ok('1,1 → apagada', r.nor[3] === false, JSON.stringify(r.nor));

  console.log('\nRetardo — realimentar deja de ser un bucle y pasa a ser TIEMPO');
  ok('la realimentacion parpadea (es un reloj)', r.relojCambios >= 4, r.relojCambios + ' cambios en 60 pasadas, en ' + JSON.stringify(r.relojHistoria));
  ok('y sigue en marcha al acabar', r.relojSigueVivo === true);
  ok('sin que salte el guardia de oscilacion', r.relojSinFundir === true);
  ok('info() dice cuanto le queda de espera', typeof r.esperandoInfo === 'number');
  console.log('\n…y sin retardo la misma realimentacion se funde, sin colgar');
  ok('el guardia avisa', r.avisaOscilacion === true);
  ok('y la pasada termina rapido', r.msFundido < 500, r.msFundido + ' ms');

  console.log('\nMemoria — dos inversores cruzados = un bit');
  ok('el par se asienta en estados opuestos', r.bitOpuestos === true, JSON.stringify(r.bitRecordado));
  // Lo que separa un biestable de un cable: que el estado sobreviva a la fuente que lo puso.
  ok('al quitar el SET se acuerda (eso es el bit)',
    String(r.bitRecordado) === String(r.bitTrasSet), JSON.stringify(r.bitRecordado));
  ok('y se queda ahi (no deriva)', r.bitEstable === true, JSON.stringify(r.bitRecordado));
  ok('el RESET lo deja en el OTRO estado, y tambien se acuerda',
    r.bitDosEstados === true, JSON.stringify(r.bitRecordado2));

  console.log('\nPulso — el boton/placa se suelta solo');
  ok('al encender queda pulsado', r.pulsoDentro === 'hab:palanca-on', r.pulsoDentro);
  ok('y se suelta al vencer el pulso', r.pulsoFuera === 'hab:palanca', r.pulsoFuera);

  console.log('');
  ok('el mundo queda como estaba', r.limpio === true);
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos === 0 ? '\ntodo ok' : '\n' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();