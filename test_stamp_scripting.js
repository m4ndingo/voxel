// Plantar hojas desde un script tiene que costar lo que cuesta en Minecraft: casi nada.
//
// `leaves` es una cáscara 16³ con 694 máscaras de `caras` y `atravesable`. Puesta A MANO va como pieza
// fina (mcPlace → mcStampStruct) y se ve bien; desde scripting, setVoxel escribe en mc.grid y salía como
// CUBO MACIZO. La primera respuesta fue game.stamp (una estructura por hoja): fiel, pero 2000 hojas son
// 2000 draw calls y ~2,4 s, y el snippet del dueño se colgaba. La buena es hacer que el TERRENO sea fiel:
//   1) buildTexFaces respeta `caras` ⇒ la textura del bloque sale con AGUJEROS (alpha 0 ⇒ discard).
//   2) mcTapaCara: un bloque de recorte NO tapa la cara del vecino ⇒ no se pela la cara interior de una
//      copa (hojas «fancy» de Minecraft). Cuesta vértices, NO draw calls.
//   3) mc.atraviesaDoc: el "atravesable" del documento también vale en la rejilla.
// Así, lo que setVoxel avisa se reduce a lo que de verdad no cabe en una celda: la FORMA (una mata en
// cruz) y el alpha real. game.stamp sigue existiendo para esas piezas.
// No persiste nada: bloquea el POST del mundo y retira lo que coloca.
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
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u || '');
      if (String(((o || {}).method) || 'GET').toUpperCase() === 'POST' && /\/api\/(mundo|habitantes)/.test(url))
        return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto('http://localhost:8500/map/agents', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    // Los avisos son media prueba, así que se capturan los dos canales. El toast importa tanto como la
    // consola: el dueño construye desde el móvil y ahí un console.warn no se ve.
    const toasts = [], warns = [];
    const toastOrig = window.toast, warnOrig = console.warn;
    window.toast = (m) => { toasts.push(String(m)); };
    console.warn = (...a) => { warns.push(a.join(' ')); };
    // Solo los AVISOS: setVoxel emite además su propio resumen por ráfaga («N bloques colocados»), así que
    // contar todos los toasts mediría el resumen y no lo que este test mira.
    const avisos = () => toasts.filter(t => t.indexOf('game.stamp(') >= 0);
    const espera = async (cond) => { for (let i = 0; i < 60 && !cond(); i++) await new Promise(r => setTimeout(r, 50)); };
    const vertices = () => { let v = 0; for (const c of mc.chunks.values()) v += c.count || 0; return v; };

    try {
      // 'leaves' no está en la paleta por defecto: sin esto mcResolveMat caería a roca y el test no miraría nada.
      await game.addMaterial('leaves');
      const idHoja = mcResolveMat('leaves'), idRoca = mcResolveMat('roca');
      out.claveHoja = mc.blockKey[idHoja] || null;
      const rec = await mcStructCells(out.claveHoja);
      out.hojaEsFinaAMano = rec.blockLike === false;   // a mano sigue yendo como pieza fina, a propósito
      out.hojaPielCubre = rec.pielCubre === true;      // …pero su piel cubre el cubo: el terreno la dibuja fiel
      out.hojaConCaras = rec.conCaras === true;
      out.hojaAtravesable = rec.atravesable === true;

      // ── §1 · el bloque de RECORTE: la máscara llega a la textura del terreno ──
      out.esRecorte = !!(mc.recorte && mc.recorte[idHoja]);
      out.rocaNoEsRecorte = !!(mc.recorte && !mc.recorte[idRoca]);
      out.atlasHasAlpha = mc.atlasHasAlpha === true;   // ⇒ el shader del terreno hace discard
      const tf = buildTexFaces(await getTexDef(out.claveHoja));
      out.texturaConAgujeros = tf.hueco === true;
      out.texelesTransparentes = tf.faces.map(cv => {
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let t = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 0) t++;
        return t;
      });
      out.las6CarasTienenAgujeros = out.texelesTransparentes.every(n => n > 0);

      // ── §2 · mcTapaCara: una hoja no tapa, una roca sí; y mcSolid queda intacto ──
      // Un sitio vacío y alto: la copa de pruebas no puede tocar lo que el dueño tenga construido.
      // …y DENTRO de la rejilla: fuera de límites setVoxel y game.stamp devuelven false sin decir nada, y
      // entonces el conteo de piezas mediría el borde del mundo en vez de lo que se quiere medir.
      const bx = Math.min(Math.floor(mc.dim.x / 2) + 40, mc.dim.x - 12);
      const bz = Math.min(Math.floor(mc.dim.z / 2) + 40, mc.dim.z - 12);
      const ay = mc.dim.y - 10;
      out.dim = [mc.dim.x, mc.dim.y, mc.dim.z];
      let libre = true;
      for (let i = -1; i <= 10; i++) for (let j = -8; j <= 7; j++)
        if (!mcInside(bx + i, ay + j, bz) || mc.grid[mcIdx(bx + i, ay + j, bz)] !== 0) libre = false;
      out.celdaLibre = libre;

      const v0 = vertices();
      beginBatch(); setVoxel(bx, ay, bz, 'leaves'); setVoxel(bx + 1, ay, bz, 'leaves'); endBatch();
      await espera(() => vertices() !== v0);
      mcMeshAll();
      out.dosHojasVerts = vertices() - v0;             // 12 caras: ninguna se pela contra la otra
      out.hojaNoTapa = mcTapaCara(bx, ay, bz) === false;
      out.hojaSigueSiendoSolida = mcSolid(bx, ay, bz) === true;   // raycast / romper / poner: intacto
      out.hojaNoFrena = mcSolidWalk(bx, ay, bz) === false;        // andar: se cruza (mc.atraviesaDoc)
      // …y sin mc.recorte la pregunta vuelve a ser mcSolid pelado (coste cero cuando nadie tiene agujeros)
      const recOrig = mc.recorte; mc.recorte = null;
      out.sinRecorteTapaComoAntes = mcTapaCara(bx, ay, bz) === true;
      mc.recorte = recOrig;
      beginBatch(); setVoxel(bx, ay, bz, 0); setVoxel(bx + 1, ay, bz, 0); endBatch();
      await new Promise(r => setTimeout(r, 300)); mcMeshAll();

      const v1 = vertices();
      beginBatch(); setVoxel(bx, ay, bz, 'roca'); setVoxel(bx + 1, ay, bz, 'roca'); endBatch();
      await espera(() => vertices() !== v1);
      mcMeshAll();
      out.dosRocasVerts = vertices() - v1;             // 10 caras: la compartida sí se pela
      out.rocaTapa = mcTapaCara(bx, ay, bz) === true;
      out.rocaFrena = mcSolidWalk(bx, ay, bz) === true;
      beginBatch(); setVoxel(bx, ay, bz, 0); setVoxel(bx + 1, ay, bz, 0); endBatch();
      await new Promise(r => setTimeout(r, 300)); mcMeshAll();

      // ── §3 · el aviso, re-encuadrado a lo que DE VERDAD no cabe ──
      // La hoja ya no avisa: el terreno la dibuja fiel.
      const nAntesHoja = avisos().length;
      beginBatch(); for (let i = 0; i < 6; i++) setVoxel(bx + i, ay + 2, bz, 'leaves'); endBatch();
      await new Promise(r => setTimeout(r, 700));
      out.hojaSinAviso = avisos().length === nAntesHoja;
      out.hojaEnRejilla = mc.grid[mcIdx(bx, ay + 2, bz)] === idHoja;
      out.hojaNoCreaEstructura = true;
      beginBatch(); for (let i = 0; i < 6; i++) setVoxel(bx + i, ay + 2, bz, 0); endBatch();
      await new Promise(r => setTimeout(r, 300)); mcMeshAll();

      // La mata tampoco: su piel NO cubre el cubo. Pero de ésa ya no hay nada que avisar, porque CABE en una
      // celda y el mallador emite su GEOMETRÍA DE VERDAD dentro de la malla del chunk (mc.finoRejilla /
      // mcTablaFina) en vez de aplastar su silueta contra las 4 paredes de un cubo lleno.
      await game.addMaterial('hierba-alta');
      const idMata = mcResolveMat('hierba-alta');
      out.claveMata = mc.blockKey[idMata] || null;
      const recMata = await mcStructCells(out.claveMata);
      out.mataNoCubre = recMata.pielCubre === false;
      out.mataEsFina = !!(mc.finoRejilla && mc.finoRejilla[idMata] === 1);
      const nAntesMata = avisos().length;
      const nEstrMata = mc.structures.length;
      setVoxel(bx, ay + 4, bz, 'hierba-alta');
      await new Promise(r => setTimeout(r, 700));
      out.mataSinAviso = avisos().length === nAntesMata;
      out.mataWarnVacio = warns.filter(w => w.indexOf('hierba-alta') >= 0).length === 0;
      out.mataEnRejilla = mc.grid[mcIdx(bx, ay + 4, bz)] === idMata;
      out.mataSinPieza = mc.structures.length === nEstrMata;
      // La geometría fina va en su PROPIO lote del chunk (finoVbo/finoAVbo, dibujado con mc.structProg): no
      // engorda el buffer del terreno y aun así entra en la malla. Se mide sobre el chunk donde acaba de caer.
      mcMeshAll();
      const chM = mc.chunks.get((bx >> 4) + ',' + (bz >> 4));
      out.mataGeomReal = !!(mcTablaFina() || {})[idMata];
      out.finoEnLote = !!(chM && (chM.finoCount + chM.finoACount) > 0);
      for (let i = 1; i <= 5; i++) setVoxel(bx + i, ay + 4, bz, 'hierba-alta');
      await new Promise(r => setTimeout(r, 600));
      out.avisoNoSeRepite = avisos().length === nAntesMata;
      const nAntesRoca = avisos().length;
      setVoxel(bx, ay + 6, bz, 'roca');
      await new Promise(r => setTimeout(r, 500));
      out.rocaSinAviso = avisos().length === nAntesRoca;
      beginBatch();
      for (let i = 0; i <= 5; i++) setVoxel(bx + i, ay + 4, bz, 0);
      setVoxel(bx, ay + 6, bz, 0);
      endBatch();
      await new Promise(r => setTimeout(r, 300)); mcMeshAll();

      // ── §4 · el precio de la otra vía, para poder elegir con números ──
      const celdas = [];
      for (let i = 0; i < 200; i++) celdas.push([bx + (i % 10), ay - 4 - ((i / 100) | 0), bz + (((i / 10) | 0) % 10)]);
      out.celdasDentro = celdas.every(c => mcInside(c[0], c[1], c[2]));
      const chunksAntes = [...mc.chunks.values()].filter(c => c.count).length;
      let t0 = performance.now();
      beginBatch(); for (const c of celdas) setVoxel(c[0], c[1], c[2], 'leaves'); endBatch();
      out.msSetVoxel200 = Math.round(performance.now() - t0);
      await new Promise(r => setTimeout(r, 400)); mcMeshAll();
      out.setVoxelDrawCallsExtra = [...mc.chunks.values()].filter(c => c.count).length - chunksAntes;
      for (const c of celdas) mcSetBlock(c[0], c[1], c[2], 0);
      mcMeshAll();

      const antes = mc.structures.length;
      t0 = performance.now();
      beginBatch(); for (const c of celdas) await game.stamp('leaves', c[0], c[1], c[2]); endBatch();
      out.msStamp200 = Math.round(performance.now() - t0);
      out.stampDrawCalls200 = mc.structures.length - antes;

      // ── §5 · game.stamp sigue siendo la vía fiel para lo que NO cabe en una celda ──
      const s = mc.structures[mc.structures.length - 1];
      out.stampClave = s && s.key;
      out.stampTieneMalla = !!s && (s.colCount + s.texCount + s.alphaCount) > 0;
      const g = s && mcStructColl(s);
      out.stampTieneBits = !!(g && g.bits);                                     // null ⇒ desaparece del apuntado
      out.stampBitsCeros = !!(g && g.bits && !g.bits.some(v => v));             // no choca
      out.stampAimOcupado = !!(g && (g.bitsAim || g.bits) && (g.bitsAim || g.bits).some(v => v));   // sí se apunta
      for (let i = mc.structures.length - 1; i >= antes; i--) mcRemoveStruct(mc.structures[i], true);
      out.stampFuera = (await game.stamp('leaves', -50, ay, bz)) === false;

      // ── §6 · mc.atraviesaDoc lo hornea mcBuildPalette desde el propio .vox.json ──
      out.atravDoc = !!(mc.atraviesaDoc && mc.atraviesaDoc[idHoja]);
      out.atravDocRoca = !(mc.atraviesaDoc && mc.atraviesaDoc[idRoca]);

      // ── limpieza ──
      await new Promise(r => setTimeout(r, 400));
      let sucio = 0;
      for (let i = -1; i <= 10; i++) for (let j = -8; j <= 7; j++)
        if (mc.grid[mcIdx(bx + i, ay + j, bz)] !== 0) sucio++;
      out.limpioRejilla = sucio === 0;
      out.limpioEstructuras = mc.structures.length === antes;
    } catch (e) {
      out.errs.push(String(e && e.stack || e));
    } finally {
      window.toast = toastOrig; console.warn = warnOrig;
    }
    return out;
  });

  if (r.errs && r.errs.length) r.errs.forEach(e => console.log('ERROR ' + e));

  console.log('\nPremisa · leaves = cáscara con `caras` + `atravesable`');
  ok('la clave es la del asset', r.claveHoja === 'asset:assets/leaves.vox.json', r.claveHoja);
  ok('trae máscara de caras', r.hojaConCaras === true);
  ok('y es atravesable', r.hojaAtravesable === true);
  ok('a mano sigue yendo como pieza fina (no blockLike)', r.hojaEsFinaAMano === true);
  ok('pero su piel cubre el cubo ⇒ el terreno la dibuja fiel', r.hojaPielCubre === true);
  ok('la celda de pruebas está dentro del mundo y vacía', r.celdaLibre === true, 'mundo ' + (r.dim || []).join('×'));

  console.log('\n§1 la máscara llega a la textura del terreno (bloque de RECORTE)');
  ok('buildTexFaces devuelve hueco=true', r.texturaConAgujeros === true);
  ok('las 6 caras tienen texeles transparentes', r.las6CarasTienenAgujeros === true, JSON.stringify(r.texelesTransparentes));
  ok('el atlas conmuta el shader a discard', r.atlasHasAlpha === true);
  ok('mc.recorte marca la hoja', r.esRecorte === true);
  ok('…y NO marca la roca', r.rocaNoEsRecorte === true);

  console.log('\n§2 mcTapaCara · un bloque de recorte no pela la cara del vecino');
  ok('la hoja no tapa', r.hojaNoTapa === true);
  ok('la roca sí tapa', r.rocaTapa === true);
  ok('dos hojas pegadas emiten sus 12 caras', r.dosHojasVerts === 12 * 6, r.dosHojasVerts + ' vértices');
  ok('dos rocas pegadas solo 10 (la compartida se pela)', r.dosRocasVerts === 10 * 6, r.dosRocasVerts + ' vértices');
  ok('mcSolid queda intacto: la hoja sigue siendo sólida', r.hojaSigueSiendoSolida === true);
  ok('con mc.recorte=null, mcTapaCara es mcSolid pelado', r.sinRecorteTapaComoAntes === true);

  console.log('\n§3 el aviso de setVoxel, solo para lo que de verdad no cabe');
  ok('la hoja YA NO avisa (el terreno es fiel)', r.hojaSinAviso === true);
  ok('y queda en la rejilla como terreno', r.hojaEnRejilla === true);
  ok('la mata no cubre el cubo', r.mataNoCubre === true);
  ok('…pero cabe en una celda, así que va marcada como fina', r.mataEsFina === true);
  ok('…y el mallador tiene su geometría de verdad', r.mataGeomReal === true);
  ok('y por eso YA NO avisa, ni por toast…', r.mataSinAviso === true);
  ok('…ni por consola', r.mataWarnVacio === true);
  ok('la mata se queda en la rejilla', r.mataEnRejilla === true);
  ok('sin crear una pieza suelta (que costaría un draw call)', r.mataSinPieza === true);
  ok('su geometría entra en el lote fino del chunk', r.finoEnLote === true);
  ok('y sigue sin avisar por voxel en un bucle', r.avisoNoSeRepite === true);
  ok('un material macizo normal no avisa nada', r.rocaSinAviso === true);

  console.log('\n§4 el precio de cada vía (200 hojas)');
  ok('las 200 celdas caen dentro de la rejilla', r.celdasDentro === true);
  ok('setVoxel no añade NI UN draw call', r.setVoxelDrawCallsExtra === 0, r.msSetVoxel200 + ' ms');
  ok('game.stamp añade uno POR PIEZA', r.stampDrawCalls200 === 200,
    r.stampDrawCalls200 + ' estructuras, ' + r.msStamp200 + ' ms');
  ok('y es mucho más lento', r.msStamp200 > r.msSetVoxel200 * 3,
    'setVoxel ' + r.msSetVoxel200 + ' ms vs stamp ' + r.msStamp200 + ' ms');

  console.log('\n§5 game.stamp sigue siendo la vía fiel para lo que no cabe en una celda');
  ok('coloca una estructura fina', !!r.stampClave, r.stampClave);
  ok('tiene malla (se ve)', r.stampTieneMalla === true);
  ok('bits existe y NO es null (si no, desaparece del apuntado)', r.stampTieneBits === true);
  ok('bits son ceros: no choca (atravesable del documento)', r.stampBitsCeros === true);
  ok('bitsAim sí está ocupado: se apunta y se rompe', r.stampAimOcupado === true);
  ok('fuera de límites devuelve false', r.stampFuera === true);

  console.log('\n§6 mc.atraviesaDoc · el "atravesable" del documento en la rejilla');
  ok('la hoja está marcada', r.atravDoc === true);
  ok('la roca no', r.atravDocRoca === true);
  ok('la hoja NO frena al andar', r.hojaNoFrena === true);
  ok('la roca sí frena', r.rocaFrena === true);

  console.log('\nLimpieza');
  ok('la rejilla queda como estaba', r.limpioRejilla === true);
  ok('y no queda ninguna estructura de prueba', r.limpioEstructuras === true);
  ok('sin errores de página', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos === 0 ? '\ntodo ok' : '\n' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();
