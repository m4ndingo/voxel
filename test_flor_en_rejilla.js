// Una flor pintada con setVoxel tiene que verse como la flor del documento y seguir costando 0 draw calls.
//
// Proyectar el dibujo sobre las 6 caras del cubo solo es fiel si la piel CUBRE la celda (`leaves` va de 0
// a 15). Una flor vive en x 6..10: aplastada contra las paredes se veia como cuatro tiras separadas con un
// cuadrado oscuro debajo. La salida no es sacarla de la rejilla —una pieza suelta cuesta 1 draw call, y 200
// flores medidas fueron 397 ms frente a 60— sino que el MALLADOR emita su geometria de verdad dentro de la
// malla del chunk, en el lote fino que dibuja mc.structProg (color por vertice, no atlas de terreno).
//
// Lo que se comprueba aqui es justo esa frontera: que la senal automatica (`rec.pielCubre`) marca las flores
// y NO los bloques normales, que la celda fina deja de emitir su cubo, que 200 flores no anaden ni una
// instancia ni un lote por flor, y que la valvula mano manda en los dos sentidos.
//
// No persiste nada: bloquea el POST del mundo y devuelve a su sitio todas las celdas que toca.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  await p.route('**/api/habitantes', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(3000);

  // ── §1 la senal automatica: quien no llena su celda, y solo ese ─────────────
  console.log('\n§1 mc.finoRejilla sale de `pielCubre`, no de una lista a mano');
  const r1 = await p.evaluate(() => {
    const out = { flores: [], llenos: [] };
    out.hayTabla = !!mc.finoRejilla;
    for (let id = 1; id < mc.blockKey.length; id++) {
      const k = mc.blockKey[id] || '';
      const fino = !!(mc.finoRejilla && mc.finoRejilla[id]);
      if (/flor/.test(k)) out.flores.push({ k, fino });
      // Los de terreno de toda la vida y `leaves`, que es una cascara pegada a las paredes: esos SI se
      // proyectan bien sobre el cubo, y marcarlos seria pagar geometria por nada.
      if (/^(grass|dirt|stone|sand|leaves|wood|water)$/.test(k)) out.llenos.push({ k, fino });
    }
    return out;
  });
  ok('el mundo tiene la tabla horneada', r1.hayTabla === true);
  ok('hay flores en la paleta de /map/test', r1.flores.length > 0, r1.flores.length + ' flores');
  ok('todas las flores van marcadas como finas', r1.flores.every(f => f.fino),
    r1.flores.map(f => f.k.replace(/^asset:assets\//, '') + '=' + f.fino).join(' '));
  ok('los bloques que SI llenan la celda no se marcan', r1.llenos.every(f => !f.fino),
    r1.llenos.map(f => f.k + '=' + f.fino).join(' ') || 'ninguno en la paleta');

  // ── §2/§3/§4/§5 sobre una franja de aire alta, que se devuelve intacta ──────
  const r2 = await p.evaluate(async () => {
    const out = {};
    const idFlor = mc.blockKey.findIndex(k => /flor/.test(k || ''));
    out.claveFlor = mc.blockKey[idFlor];
    const g = mc.finoGeom[out.claveFlor];
    out.hayGeom = !!(g && (g.colCount || g.alphaCount));
    if (!out.hayGeom) return out;

    // Franja de aire en lo alto del mundo: no hay que adivinar el relieve y la luz es plena.
    const CH = MC_CHUNK, cx = Math.floor(mc.dim.x / 2 / CH), cz = Math.floor(mc.dim.z / 2 / CH);
    const x0 = cx * CH + 3, z0 = cz * CH + 3, y0 = mc.dim.y - 3;
    const celdas = [];
    for (let dz = 0; dz < 10; dz++) for (let dx = 0; dx < 10; dx++) {
      const x = x0 + dx, z = z0 + dz;
      if (mcInside(x, y0, z) && mc.grid[mcIdx(x, y0, z)] === 0) celdas.push([x, y0, z]);
    }
    out.celdasLibres = celdas.length;
    const restaurar = celdas.map(([x, y, z]) => [x, y, z, mc.grid[mcIdx(x, y, z)]]);
    const rehacer = () => { mcMeshChunk(cx, cz); return mc.chunks.get(cx + ',' + cz); };
    const finoDe = ch => (ch.finoCount | 0) + (ch.finoACount | 0);
    const guardaValvulas = { extra: mc.finoExtra, auto: mc.finoRejilla ? mc.finoRejilla.slice() : null };
    mc.finoExtra = new Uint8Array(mc.blockKey.length + 1);

    try {
      // ── §2 una celda fina NO emite su cubo ────────────────────────────────
      const vacio = rehacer();
      out.terrenoVacio = vacio.count; out.finoVacio = finoDe(vacio);
      const [fx, fy, fz] = celdas[0];
      mcSetBlock(fx, fy, fz, idFlor);
      const conFlor = rehacer();
      out.terrenoConFlor = conFlor.count;
      out.finoConFlor = finoDe(conFlor);
      out.geomEsperada = (g.colCount | 0) + (g.alphaCount | 0);
      // §5: no es un cubo, no tapa la cara del vecino. La comparacion honrada es contra un bloque MACIZO
      // en la misma celda: la flor proyectada como cubo tampoco taparia, pero por otra razon (es de
      // RECORTE, como `leaves`), asi que sola no probaria nada.
      out.tapaSiendoFina = mcTapaCara(fx, fy, fz);
      const idMacizo = mc.blockKey.findIndex((k, id) =>
        id > 0 && k && !(mc.finoRejilla && mc.finoRejilla[id]) && !(mc.recorte && mc.recorte[id]));
      out.claveMacizo = mc.blockKey[idMacizo];
      mcSetBlock(fx, fy, fz, idMacizo); rehacer();
      out.tapaSiendoMacizo = mcTapaCara(fx, fy, fz);
      mcSetBlock(fx, fy, fz, idFlor); rehacer();

      // ── §6 y frena por su FORMA, no como un cubo de 16/16 ─────────────────
      // Es lo que rompia al construir con el clic derecho: una pieza baja pasaba a ser un muro de bloque
      // entero y ya no se podia pasar por encima. La flor no sirve de conejillo (es `atravesable`: no frena
      // NUNCA), asi que se usa la diana, que es literalmente una placa de UN voxel de alto y solida.
      await game.addMaterial('diana');
      const idPlaca = mcResolveMat('diana'), clavePlaca = mc.blockKey[idPlaca];
      let gp = null;
      for (let i = 0; i < 25 && !(gp = mc.finoGeom[clavePlaca]); i++) await new Promise(r => setTimeout(r, 100));
      out.placaFina = !!(gp && mc.finoRejilla && mc.finoRejilla[idPlaca]);
      const D = gp ? gp.fdim : [16, 16, 16];
      let alto = -1;
      if (gp) for (let y = 0; y < D[1]; y++) for (let z = 0; z < D[2]; z++) for (let x = 0; x < D[0]; x++)
        if (gp.bits[(y * D[2] + z) * D[0] + x]) alto = Math.max(alto, y);
      out.altoFino = alto + 1;                                         // en 1/16 de bloque
      mcSetBlock(fx, fy, fz, idPlaca); rehacer(); mcTablaFina();       // mc._geoFina es lo que mira la colision
      out.chocaAlPie = mcCollides(fx + 0.5, fy, fz + 0.5);             // de pie EN la celda: la placa esta ahi
      out.pasaPorEncima = !mcCollides(fx + 0.5, fy + (alto + 1) / 16, fz + 0.5);   // justo encima: se pisa y se pasa
      mc.finoExtra[idPlaca] = 2; rehacer(); mcTablaFina();             // …proyectada como cubo, a esa misma altura frena
      out.comoCuboFrena = mcCollides(fx + 0.5, fy + (alto + 1) / 16, fz + 0.5);
      mc.finoExtra[idPlaca] = 0;
      mcSetBlock(fx, fy, fz, idFlor); rehacer(); mcTablaFina();

      // ── §4 la valvula: 2 = vuelve a ser el cubo proyectado ────────────────
      mc.finoExtra[idFlor] = 2;
      const comoCubo = rehacer();
      out.terrenoComoCubo = comoCubo.count; out.finoComoCubo = finoDe(comoCubo);
      // …y 1 manda aunque la senal automatica diga que no (asi se rescata un material mal clasificado)
      mc.finoExtra[idFlor] = 1;
      if (mc.finoRejilla) mc.finoRejilla[idFlor] = 0;
      const forzada = rehacer();
      out.finoForzada = finoDe(forzada); out.terrenoForzada = forzada.count;
      mc.finoExtra[idFlor] = 0;
      if (mc.finoRejilla) mc.finoRejilla[idFlor] = 1;

      // ── §3 100 flores: ni una instancia, ni un lote por flor ──────────────
      out.estructurasAntes = mc.structures.length;
      for (const [x, y, z] of celdas) mcSetBlock(x, y, z, idFlor);
      const muchas = rehacer();
      out.estructurasDespues = mc.structures.length;
      out.finoMuchas = finoDe(muchas);
      out.terrenoMuchas = muchas.count;
      out.lotesConGeom = 0;
      mc.chunks.forEach(ch => { if (ch.finoCount) out.lotesConGeom++; if (ch.finoACount) out.lotesConGeom++; });
    } finally {
      for (const [x, y, z, id] of restaurar) mcSetBlock(x, y, z, id);
      mc.finoExtra = guardaValvulas.extra;
      if (guardaValvulas.auto) mc.finoRejilla = guardaValvulas.auto;
      mcMeshChunk(cx, cz);
      out.celdasRestauradas = restaurar.every(([x, y, z, id]) => mc.grid[mcIdx(x, y, z)] === id);
      out.finoTrasRestaurar = finoDe(mc.chunks.get(cx + ',' + cz));
    }
    return out;
  });

  console.log('\n§2 la celda fina cambia de camino: geometria real en vez de cubo');
  ok('la geometria de la flor esta horneada', r2.hayGeom === true, r2.claveFlor);
  ok('hay sitio libre donde probar', r2.celdasLibres === 100, r2.celdasLibres + ' celdas');
  ok('el terreno del chunk no crece ni una cara', r2.terrenoConFlor === r2.terrenoVacio,
    r2.terrenoVacio + ' → ' + r2.terrenoConFlor);
  ok('y sale exactamente la geometria del documento', r2.finoConFlor - r2.finoVacio === r2.geomEsperada,
    '+' + (r2.finoConFlor - r2.finoVacio) + ' de ' + r2.geomEsperada);

  console.log('\n§5 una celda fina no tapa la cara de su vecino (no es un cubo)');
  ok('mcTapaCara dice que no sobre la flor', r2.tapaSiendoFina === false);
  ok('…y que si sobre un bloque macizo en esa misma celda', r2.tapaSiendoMacizo === true, r2.claveMacizo);

  console.log('\n§6 la celda fina frena por su forma, no como un cubo de 16/16');
  ok('la placa de un voxel va por el camino fino', r2.placaFina === true);
  ok('y mide lo que dice su dibujo, no un bloque', r2.altoFino > 0 && r2.altoFino < 16, r2.altoFino + '/16 de alto');
  ok('de pie en la celda, la placa frena', r2.chocaAlPie === true);
  ok('justo por encima de ella se pasa', r2.pasaPorEncima === true);
  ok('…y proyectada como cubo NO se pasaba (la regresion que arregla esto)', r2.comoCuboFrena === true);

  console.log('\n§4 mc.finoExtra manda en los dos sentidos');
  ok('con 2 vuelve a proyectarse como cubo (el terreno crece)', r2.terrenoComoCubo > r2.terrenoVacio,
    r2.terrenoVacio + ' → ' + r2.terrenoComoCubo);
  ok('…y ya no hay geometria fina', r2.finoComoCubo === r2.finoVacio);
  ok('con 1 sale la geometria aunque la senal automatica diga que no', r2.finoForzada > r2.finoVacio);
  ok('…y entonces el terreno no emite el cubo', r2.terrenoForzada === r2.terrenoVacio);

  console.log('\n§3 100 flores: 0 draw calls por flor');
  ok('no se crea ni una instancia suelta', r2.estructurasDespues === r2.estructurasAntes,
    r2.estructurasAntes + ' → ' + r2.estructurasDespues);
  ok('las 100 caben en los lotes del chunk', r2.finoMuchas - r2.finoVacio === r2.geomEsperada * 100,
    (r2.finoMuchas - r2.finoVacio) + ' vertices');
  ok('y son un punado de lotes, no 100', r2.lotesConGeom <= 4, r2.lotesConGeom + ' lotes en todo el mundo');
  ok('el terreno sigue sin emitir cubos', r2.terrenoMuchas === r2.terrenoVacio);

  console.log('\n§0 el mundo del dueno queda como estaba');
  ok('todas las celdas restauradas', r2.celdasRestauradas === true);
  ok('y el chunk vuelve a su geometria fina de partida', r2.finoTrasRestaurar === r2.finoVacio,
    r2.finoVacio + ' → ' + r2.finoTrasRestaurar);

  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));
  await b.close();
  console.log('\n' + (fallos ? fallos + ' fallos' : 'todo ok'));
  process.exit(fallos ? 1 : 0);
})();
