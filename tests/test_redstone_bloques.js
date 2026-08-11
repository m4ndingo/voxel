// @area: redstone
// @necesita: servidor, playwright
// Redstone r1.2 — un BLOQUE MACIZO transporta la señal a lo que tiene pegado (REQ-RS4).
//
// La queja del dueño: «para redstone, los bloques que reciben energía de redstone deben energizarse,
// por lo tanto, una antorcha pegada a un bloque que recibe energía como el de la imagen debería
// encenderse; salvo que se haya indicado como bloque aislante, que de momento no hay».
//
// Esto no es «una pieza más»: cambia el modelo de propagación, porque hasta r1.1 una celda sin cfg
// era un agujero por el que no pasaba nada. Lo que se defiende aquí son las tres reglas que hacen
// que el cambio no se lleve por delante lo que ya funcionaba:
//
//   §2 TRANSPORTE  — una fuente energiza el bloque que toca, y el bloque alimenta a lo que cuelga
//                    de él por cualquiera de sus otras cinco caras. Es el caso del ticket.
//   §3 FUERTE/DÉBIL— el CABLE energiza el bloque solo DÉBILMENTE, y otro cable no lee lo débil. Sin
//                    esa asimetría dos tendidos separados por un bloque se contagiarían saltándose
//                    la pérdida, y un tendido se realimentaría a través del bloque que él alimenta.
//                    Una pieza que NO es cable (una lámpara) sí lee lo débil.
//   §4 UN SALTO    — nunca bloque → bloque: dos bloques en fila NO llevan la señal. Es lo que acota
//                    el coste y evita que un cable suelto energice un muro entero.
//
//   §5 aislante()  — la válvula de escape que pidió el dueño, en los dos sentidos.
//   §6 DESPERTAR   — el aviso salta a 2 celdas a través del bloque: si no, lo que hay al otro lado
//                    se alimenta por él y no se entera nunca (se vería como «hay que darle un clic»).
//
// El motor y las piezas se inyectan desde los FICHEROS FUENTE: el test tiene que fallar cuando se
// rompa redstone/*.js, no cuando alguien olvide re-publicar el snippet.
// No persiste nada: bloquea los POST y devuelve las celdas tocadas a su valor anterior.
//
//   node test_redstone_bloques.js

const { chromium } = require('playwright');
const fs = require('fs');

// La lámpara del test: un receptor puro (solo `encendida`), que es la pieza más limpia para medir
// «¿te ha llegado la señal?». No hay ninguna en redstone-piezas.js, así que se declara aquí. Las dos
// claves se repiten dentro y fuera del navegador porque el evaluate no comparte ámbito con Node.
const LAMPARA = 'hab:diana', LAMPARA_ON = 'hab:rejilla';

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const motor  = fs.readFileSync(__dirname + '/redstone/redstone.js', 'utf8');
  const piezas = fs.readFileSync(__dirname + '/redstone/redstone-piezas.js', 'utf8');

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

    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)];
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || null;

    // ── un hueco de AIRE, igual que en test_redstone_dsl ────────────────────────────────────────
    // Aquí los bloques macizos se ponen A MANO: lo que se mide es justamente quién toca a quién, y
    // montarlo sobre el suelo de verdad dejaría vecinos que no he puesto yo.
    let caja = null;
    const AN = 14, AL = 8, PR = 6;
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

    const LAMPARA = 'hab:diana', LAMPARA_ON = 'hab:rejilla';   // ver la nota de arriba, fuera del evaluate
    const CLAVES = ['hab:cable', 'hab:cable-on', 'hab:palanca', 'hab:palanca-on',
                    'hab:antorcha-apagada', 'hab:antorcha', LAMPARA, LAMPARA_ON];
    for (const k of CLAVES) if (!mc.name2id[k]) {
      try { await game.addMaterial(k); } catch (e) { out.errs.push('no carga ' + k + ': ' + e.message); }
    }
    out.faltan = CLAVES.filter(k => !mc.name2id[k]);
    R.define(LAMPARA, { encendida: LAMPARA_ON, precargar: false });
    // La antorcha del ticket: `invertida` + `mira`, o sea escucha SOLO por su espalda. Sin giro (@0)
    // la espalda da a −X, que es donde se pone el muro.
    R.define('hab:antorcha-apagada', { encendida: 'hab:antorcha', invertida: true, emite: 15, mira: true, precargar: false });

    // El MURO: un material cualquiera que NO sea circuito. Se busca en la paleta ya horneada para no
    // pagar el re-horneado de mcBuildPalette, que en un mundo grande son segundos.
    // ⚠️ `mc.name2id[k] === id` no es redundante: en mc.blockKey hay claves que no se pueden plantar
    // con mcSetBlock, y plantar `undefined` deja la celda en AIRE sin quejarse — o sea, un muro que no
    // existe y un test que aprueba por el motivo equivocado.
    const declarados = new Set(R.lista().map(c => c.clave));
    let MURO = null;
    for (let id = 1; id < mc.blockKey.length && !MURO; id++) {
      const k = mc.blockKey[id];
      if (!k || mc.name2id[k] !== id) continue;
      if (declarados.has(k) || declarados.has(String(k).split('@')[0])) continue;
      if (/cable|antorcha|palanca|lampara|repetidor|placa|boton|puerta|diana|rejilla/.test(k)) continue;
      MURO = k;
    }
    if (!MURO) { out.errs.push('no hay ningun material ajeno al circuito en la paleta'); return out; }
    out.muro = MURO;

    const tocadas = new Map();
    const pon = (x, y, z, clave) => {
      const k = x + ',' + y + ',' + z;
      if (!tocadas.has(k)) tocadas.set(k, [x, y, z, idEn(x, y, z)]);
      mcSetBlock(x, y, z, clave ? mc.name2id[clave] : 0);
    };
    const ticks = n => { for (let i = 0; i < n; i++) R.tick(); };
    const señal = (x, y, z) => R._potencia.get(x + ',' + y + ',' + z) || 0;
    const base = k => k ? String(k).split('@')[0] : k;
    // Entre bloque y bloque se deja el escenario como estaba: cada §  monta su propia figura y no
    // debe heredar vecinos del anterior — que es justo el tipo de error que este motor esconde bien.
    const limpia = () => {
      tocadas.forEach(t => mcSetBlock(t[0], t[1], t[2], t[3]));
      R._cola.clear(); R._esperando.clear(); R._potencia.clear();
    };

    // ══ §2 · TRANSPORTE: palanca → MURO → lámpara al otro lado ═════════════════════════════════
    // La forma exacta del ticket. La palanca energiza el muro FUERTE; la lámpara cuelga de la cara
    // opuesta y tiene que enterarse. Antes de r1.2 la lámpara veía un vecino sin cfg y se quedaba a 0.
    pon(X, Y, Z, 'hab:palanca-on');
    pon(X + 1, Y, Z, MURO);
    pon(X + 2, Y, Z, LAMPARA);
    R.revisarCaja(X, Y, Z, X + 2, Y, Z);
    ticks(4);
    out.lamparaTrasMuro = { clave: claveEn(X + 2, Y, Z), señal: señal(X + 2, Y, Z) };

    // Y la cara de al lado del muro también, que es «lo que tenga pegado», no «lo que esté enfrente».
    pon(X + 1, Y + 1, Z, LAMPARA);
    R.revisar(X + 1, Y + 1, Z); ticks(3);
    out.lamparaEncima = claveEn(X + 1, Y + 1, Z);

    // Al quitar la fuente se apaga: el bloque no guarda energía, se calcula al vuelo.
    pon(X, Y, Z, null);
    ticks(6);
    out.lamparaTrasQuitar = claveEn(X + 2, Y, Z);
    limpia();

    // ══ §2b · el caso literal del ticket: una ANTORCHA pegada al muro se entera ════════════════
    // La antorcha es `invertida`: sola LUCE, y pegada a un muro energizado se APAGA. Lo que se mide
    // es que se ENTERE — que era justo lo que no pasaba, porque el muro no tiene cfg y hasta r1.1
    // señalQueLlega saltaba a los vecinos sin cfg sin mirarlos.
    pon(X + 1, Y, Z, MURO);
    pon(X + 2, Y, Z, 'hab:antorcha-apagada');     // sin giro: su espalda da a −X, o sea al muro
    R.revisar(X + 2, Y, Z); ticks(4);
    out.antorchaSola = base(claveEn(X + 2, Y, Z));
    pon(X, Y, Z, 'hab:palanca-on');               // energiza el muro por el otro lado
    ticks(6);
    out.antorchaConMuro = base(claveEn(X + 2, Y, Z));
    out.antorchaVe = R.info(X + 2, Y, Z);
    limpia();

    // ══ §3 · FUERTE / DÉBIL ════════════════════════════════════════════════════════════════════
    // (a) cable → muro → cable NO pasa. Si pasara, dos tendidos se contagiarían saltándose la
    //     pérdida, y un tendido se realimentaría a través del muro que él mismo alimenta.
    pon(X, Y, Z, 'hab:palanca-on');
    pon(X + 1, Y, Z, 'hab:cable');
    pon(X + 2, Y, Z, MURO);
    pon(X + 3, Y, Z, 'hab:cable');
    R.revisarCaja(X, Y, Z, X + 3, Y, Z);
    ticks(6);
    out.cableTrasMuro = { antes: señal(X + 1, Y, Z), despues: señal(X + 3, Y, Z) };

    // (b) …pero una LÁMPARA sí lee lo débil: es la mitad de la regla que enciende cosas bajo un cable.
    pon(X + 2, Y + 1, Z, LAMPARA);
    R.revisar(X + 2, Y + 1, Z); ticks(3);
    out.lamparaSobreMuroDeCable = claveEn(X + 2, Y + 1, Z);
    limpia();

    // (c) el tendido largo no cambia de nivel por tener muro debajo: la pérdida se sigue cobrando
    //     solo en el salto cable→cable. Es la regresión que más duele si fuerte/débil se rompe.
    pon(X, Y, Z, 'hab:palanca-on');
    for (let i = 1; i <= 5; i++) { pon(X + i, Y, Z, 'hab:cable'); pon(X + i, Y - 1, Z, MURO); }
    R.revisarCaja(X, Y - 1, Z, X + 5, Y, Z);
    ticks(8);
    out.tendidoSobreSuelo = [1, 2, 3, 4, 5].map(i => señal(X + i, Y, Z));
    limpia();

    // ══ §4 · UN SOLO SALTO: dos muros en fila no llevan la señal ═══════════════════════════════
    pon(X, Y, Z, 'hab:palanca-on');
    pon(X + 1, Y, Z, MURO);
    pon(X + 2, Y, Z, MURO);
    pon(X + 3, Y, Z, LAMPARA);
    R.revisarCaja(X, Y, Z, X + 3, Y, Z);
    ticks(6);
    out.dosMuros = claveEn(X + 3, Y, Z);
    limpia();

    // ══ §5 · aislante() en los dos sentidos ════════════════════════════════════════════════════
    pon(X, Y, Z, 'hab:palanca-on');
    pon(X + 1, Y, Z, MURO);
    pon(X + 2, Y, Z, LAMPARA);
    R.revisarCaja(X, Y, Z, X + 2, Y, Z);
    ticks(4);
    out.aisAntes = claveEn(X + 2, Y, Z);
    R.aislante(MURO); ticks(4);
    out.aisDespues = claveEn(X + 2, Y, Z);
    out.aisLista = R.aislante();
    R.aislante(MURO, false); ticks(4);
    out.aisQuitado = claveEn(X + 2, Y, Z);
    limpia();

    // ══ §6 · DESPERTAR a 2 celdas: la lámpara ya estaba puesta cuando llegó la fuente ══════════
    // Sin el salto a 2, poner la palanca avisa al muro (que no es circuito y no hace nada) y la
    // lámpara del otro lado no se entera hasta que alguien la toca. Aquí NO se llama a revisar():
    // lo único que corre es el aviso automático de mcSetBlock.
    pon(X + 1, Y, Z, MURO);
    pon(X + 2, Y, Z, LAMPARA);
    R.revisar(X + 2, Y, Z); ticks(3);
    out.despiertaAntes = claveEn(X + 2, Y, Z);
    pon(X, Y, Z, 'hab:palanca-on');               // solo esto: sin revisar()
    ticks(6);
    out.despiertaTrasPoner = claveEn(X + 2, Y, Z);
    pon(X, Y, Z, null);                           // y el apagado también tiene que viajar
    ticks(6);
    out.despiertaTrasQuitar = claveEn(X + 2, Y, Z);
    limpia();

    // ══ §7 · coste: una ráfaga de bloques normales sigue sin encolar nada ══════════════════════
    // El salto a 2 es solo para quien ES circuito. Si se aplicara a todo, poner un TNT de 1000
    // voxels serían 36 lecturas por voxel en vez de 6.
    R._cola.clear();
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) pon(X + (i % 12), Y + 3 + ((i / 12) | 0) % 3, Z + (i % 5), MURO);
    out.rafagaCola = R._cola.size;
    out.rafagaMs = performance.now() - t0;
    limpia();

    // ── limpieza final ────────────────────────────────────────────────────────────────────────
    let sucias = 0;
    tocadas.forEach(t => { mcSetBlock(t[0], t[1], t[2], t[3]); if (idEn(t[0], t[1], t[2]) !== t[3]) sucias++; });
    mcRemeshAround(X - 2, Z - 2, X + 16, Z + 10);
    out.limpio = sucias === 0;
    return out;
  });

  if (r.errs && r.errs.length) console.log('  · ' + r.errs.join('\n  · '));
  console.log('\n--- Redstone r1.2 · los bloques macizos transportan (muro: ' + r.muro + ') ---\n');
  ok('la version es la nueva', r.version === 'r1.2', r.version);
  ok('las piezas del test cargan de la galeria', (r.faltan || []).length === 0, 'faltan: ' + (r.faltan || []).join(' '));

  console.log('\n§2 · un bloque energizado alimenta lo que tiene pegado (el ticket)');
  ok('la lampara al otro lado del muro se enciende',
    r.lamparaTrasMuro && r.lamparaTrasMuro.clave === LAMPARA_ON, JSON.stringify(r.lamparaTrasMuro));
  ok('y le llega el nivel entero, sin perdida', r.lamparaTrasMuro && r.lamparaTrasMuro.señal === 15,
    JSON.stringify(r.lamparaTrasMuro));
  ok('vale cualquier cara del muro, no solo la de enfrente', r.lamparaEncima === LAMPARA_ON, r.lamparaEncima);
  ok('al quitar la fuente se apaga (el bloque no guarda estado)',
    r.lamparaTrasQuitar === LAMPARA, r.lamparaTrasQuitar);
  ok('una antorcha pegada al muro SE ENTERA (r1.1 le daba 0)',
    !!r.antorchaVe && r.antorchaVe.llega === 15, JSON.stringify(r.antorchaVe && r.antorchaVe.llega));
  ok('info() enseña la energia del muro para poder depurarlo',
    !!(r.antorchaVe && (r.antorchaVe.vecinos || []).some(v => v.bloque && v.bloque.fuerte === 15)),
    JSON.stringify((r.antorchaVe && r.antorchaVe.vecinos || []).filter(v => v.bloque)));

  console.log('\n§3 · fuerte / debil — el cable energiza DEBIL y no se lee a si mismo');
  ok('cable → muro → cable NO pasa', r.cableTrasMuro && r.cableTrasMuro.despues === 0,
    JSON.stringify(r.cableTrasMuro));
  ok('pero una lampara sobre ese mismo muro SI se enciende',
    r.lamparaSobreMuroDeCable === LAMPARA_ON, r.lamparaSobreMuroDeCable);
  ok('un tendido con suelo debajo sigue perdiendo 1 por salto',
    JSON.stringify(r.tendidoSobreSuelo) === '[15,14,13,12,11]', JSON.stringify(r.tendidoSobreSuelo));

  console.log('\n§4 · nunca bloque → bloque');
  ok('dos muros en fila no llevan la senal', r.dosMuros === LAMPARA, r.dosMuros);

  console.log('\n§5 · aislante() — la valvula de escape que pidio el dueno');
  ok('de partida el muro transporta', r.aisAntes === LAMPARA_ON, r.aisAntes);
  ok('declararlo aislante lo corta', r.aisDespues === LAMPARA, r.aisDespues);
  ok('y aislante() lo lista', (r.aisLista || []).includes(r.muro), JSON.stringify(r.aisLista));
  ok('quitarlo lo devuelve a transportar', r.aisQuitado === LAMPARA_ON, r.aisQuitado);

  console.log('\n§6 · el aviso salta a 2 celdas a traves del muro');
  ok('parte apagada', r.despiertaAntes === LAMPARA, r.despiertaAntes);
  ok('poner la fuente la enciende SIN tocarla', r.despiertaTrasPoner === LAMPARA_ON, r.despiertaTrasPoner);
  ok('y quitarla la apaga', r.despiertaTrasQuitar === LAMPARA, r.despiertaTrasQuitar);

  console.log('\n§7 · una rafaga de bloques normales sigue costando lo mismo');
  ok('600 escrituras de un material ajeno no encolan ni una celda', r.rafagaCola === 0, r.rafagaCola + ' en cola');
  ok('y son rapidas', r.rafagaMs < 250, r.rafagaMs.toFixed(1) + ' ms (SwiftShader)');

  console.log('');
  ok('limpieza: las celdas vuelven a su valor', r.limpio === true);
  ok('sin errores de pagina', errores.length === 0, errores[0]);

  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLOS' : '\ntodo ok');
  process.exit(fallos ? 1 : 0);
})();