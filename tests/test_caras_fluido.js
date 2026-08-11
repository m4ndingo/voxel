// @area: render
// @necesita: servidor, playwright
// REQ-FLUID4 (fases 1-2) — «quiero que parezca agua también desde fuera».
//
// Lo que se comprueba es que una masa de fluido deja de ser una REJILLA DE CUBOS translúcidos. El
// camino de cubo (mc.grid → atlas) ya no dibujaba las caras internas; el camino FINO no, y agua y lava
// van SIEMPRE por el fino porque son translúcidas. Resultado: cada cara interior se mezclaba sobre la
// anterior y se veía el borde de cada cubo dentro del lago.
//
// Se mide la MALLA (nº de caras del VBO translúcido del chunk), no una variable de estado: es lo único
// que distingue «no lo dibujo» de «lo dibujo y no se nota». La válvula mc.sinCullingFluido devuelve el
// comportamiento viejo, así que cada aserción se compara contra su propio antes.
//
// Los dos invariantes que hay que no romper:
//   · lo que NO es fluido sale con la MISMA malla con y sin válvula (tapadas = 0);
//   · el culling compara TIPO de fluido, no id: hab:agua y hab:agua-3 son ids distintos de la misma
//     agua, y agua contra lava son tipos distintos y sí se ven.
//
// Y la regresión que destapó todo esto: los niveles de fluido (agua-1 … agua-7) se apendan a la paleta
// DESPUÉS de que mcBuildPalette hornee mc.finoRejilla, y escribir en un Uint8Array pasado su longitud
// no hace nada. El nivel perdía «me dibujo con mi geometría fina» y volvía al camino de cubo, o sea un
// cubo azul OPACO (el atlas de terreno se hornea sin alpha) en medio de un lago translúcido.
//
// No persiste nada: bloquea los POST y devuelve las celdas tocadas.
//
//   node test_caras_fluido.js [url]        por defecto http://localhost:8500/map/test
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
function ok(cond, msg, extra) {
  if (!cond) fallos++;
  console.log((cond ? '  ok  ' : '  FALLA  ') + msg + (extra ? '   [' + extra + ']' : ''));
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes|assets|agentes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.fluidos && game.fluidos.info', null, { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [], pasos: {} };
    const esperar = ms => new Promise(s => setTimeout(s, ms));

    // Toda celda que se toca queda anotada aquí con su id ORIGINAL, y se restaura al final.
    const previo = new Map();
    const poner = (x, y, z, mat) => {
      const k = x + ',' + y + ',' + z;
      if (!previo.has(k)) previo.set(k, mc.grid[mcIdx(x, y, z)] | 0);
      game.setVoxel(x, y, z, mat);
    };

    // El chunk que se mide. Se elige por coordenada, no por índice, para que el test no dependa de
    // MC_CHUNK.
    const cx = 40, cz = 40;
    const clave = Math.floor(cx / MC_CHUNK) + ',' + Math.floor(cz / MC_CHUNK);
    // Caras del VBO translúcido y del opaco del chunk. Los count son VÉRTICES (stride 9), 6 por quad.
    const caras = () => {
      const ch = mc.chunks.get(clave);
      return ch ? { alpha: (ch.finoACount || 0) / 6, opaco: (ch.finoCount || 0) / 6 } : { alpha: -1, opaco: -1 };
    };
    // Re-malla de verdad y espera: mcMeshChunk está throttleado y tiene caché LRU por firma.
    const remallar = async () => { mcMeshAll(); await esperar(2500); };

    // El material hay que resolverlo antes de plantarlo: mcResolveMat es quien mete el asset en la
    // paleta, y hasta que no está, setVoxel('agua') cae al relleno sin decir nada.
    mcResolveMat('agua'); mcResolveMat('lava');
    await esperar(1500);

    let suelo = 0;
    for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(cx, y, cz)]) { suelo = y; break; }
    const fondo = suelo + 1, alto = 3, sup = fondo + alto;
    const R = 4;                                   // interior (2R+1)² = 9×9
    out.suelo = suelo;

    // Una charca estanca: si el agua se escapa se reparte por medio mundo en niveles finísimos y deja
    // de medirse lo que se quiere medir.
    const charca = async (mat) => {
      for (let x = cx - R - 1; x <= cx + R + 1; x++) for (let z = cz - R - 1; z <= cz + R + 1; z++) {
        const borde = (x < cx - R || x > cx + R || z < cz - R || z > cz + R);
        poner(x, fondo - 1, z, 'roca');
        for (let y = fondo; y < sup; y++) poner(x, y, z, borde ? 'roca' : mat);
        for (let y = sup; y <= sup + 2; y++) poner(x, y, z, 0);
      }
      await esperar(3000);                         // la paleta del cliente entra por detrás
      await remallar();
    };

    // ── 1 · la charca de agua: solo la superficie ───────────────────────────────────────────────
    await charca('agua');
    const T = mcTablaFluido();
    let celdas = 0;
    for (let x = cx - R; x <= cx + R; x++) for (let z = cz - R; z <= cz + R; z++)
      for (let y = fondo; y < sup; y++) { const id = mc.grid[mcIdx(x, y, z)]; if (id && T && T[id]) celdas++; }
    out.celdas = celdas;
    out.conCulling = caras();

    mc.sinCullingFluido = true; await remallar();
    out.sinCulling = caras();
    mc.sinCullingFluido = false; await remallar();
    out.reCulling = caras();

    out.expuestas = (2 * R + 1) * (2 * R + 1);     // solo la lámina de arriba: el resto lo tapa la roca

    // ── 2 · TIPO, no id: el lago tiene niveles distintos y sigue siendo una sola masa ───────────
    out.ids = [];
    for (let id = 1; id < mc.blockKey.length; id++) {
      const k = mc.blockKey[id];
      if (!k || !/agua|lava/.test(k)) continue;
      out.ids.push({ k, tipo: T ? (T[id] || '') : null, fina: !!(mc._geoFina && mc._geoFina[id]) });
    }

    // ── 3 · agua contra lava son tipos distintos: esa cara SÍ se ve ─────────────────────────────
    // Media charca de lava pegada a la de agua: la pared que las separa tiene que seguir emitiendo.
    const antesMezcla = caras().alpha;
    for (let z = cz - R; z <= cz; z++) for (let x = cx - R; x <= cx + R; x++)
      for (let y = fondo; y < sup; y++) poner(x, y, z, 'lava');
    await esperar(3000); await remallar();
    out.mezcla = caras();
    out.antesMezcla = antesMezcla;
    // La expectativa se DERIVA de lo que hay de verdad en la rejilla: el simulador reparte niveles y
    // puede dejar huecos, así que un número escrito a mano mediría el simulador, no el culling.
    // Cara expuesta = la que da a algo que no es el MISMO tipo de fluido (y no la tapa un cubo).
    const T2 = mcTablaFluido();
    const tipoEn = (x, y, z) => {
      if (!mcInside(x, y, z)) return null;
      const id = mc.grid[mcIdx(x, y, z)] | 0;
      return id ? (T2 && T2[id] ? T2[id] : 'SOLIDO') : 'AIRE';
    };
    // La regla, re-derivada aquí a mano contra la rejilla de verdad: una cara sobra si la tapa un cubo
    // (con el bloque lleno) o si al otro lado está el MISMO fluido — arriba/abajo siempre, y de lado
    // solo si el vecino llega tan alto como uno mismo (si no, asoma una franja y hay que dibujarla).
    let esperadas = 0, agua = 0, lava = 0;
    for (let x = cx - R; x <= cx + R; x++) for (let z = cz - R; z <= cz + R; z++) for (let y = fondo; y < sup; y++) {
      const t = tipoEn(x, y, z);
      if (t !== 'WATER' && t !== 'LAVA') continue;
      if (t === 'WATER') agua++; else lava++;
      const fH = mcGetFluidHeight(x, y, z);
      for (let f = 0; f < 6; f++) {
        const d = MC_FACES[f].dir, ax = x + d[0], ay = y + d[1], az = z + d[2];
        if (fH >= 0.999 ? mcTapaCara(ax, ay, az) : (f === 1 && y > 0 && mcTapaCara(ax, ay, az))) continue;
        if (tipoEn(ax, ay, az) !== t) { esperadas++; continue; }
        if (f < 2) continue;                                        // vertical: siempre se tapan
        if (mcGetFluidHeight(ax, ay, az) < fH - 1e-6) esperadas++;   // el vecino no llega: asoma
      }
    }
    out.mezclaEsperada = esperadas;
    out.mezclaCeldas = { agua, lava };

    // ── 4 · lo que no es fluido no cambia ni un vértice ─────────────────────────────────────────
    // Se vacía la charca y se llena de un material fino NO fluido; la malla tiene que salir igual
    // con y sin válvula.
    for (let x = cx - R; x <= cx + R; x++) for (let z = cz - R; z <= cz + R; z++)
      for (let y = fondo; y < sup; y++) poner(x, y, z, 0);
    await esperar(2000);
    for (let x = cx - R; x <= cx + R; x++) for (let z = cz - R; z <= cz + R; z++)
      poner(x, fondo, z, 'flor-roja');
    await esperar(2000); await remallar();
    const noFluidoA = caras();
    mc.sinCullingFluido = true; await remallar();
    const noFluidoB = caras();
    mc.sinCullingFluido = false; await remallar();
    out.noFluido = { conValvula: noFluidoB, sinValvula: noFluidoA };

    // ── 5 · BUG-FLUID4: una pieza fina dentro del líquido no deja caras sueltas ─────────────────
    // mcTapaCara dice `false` sobre TODA celda fina (la regla de las hojas «fancy»), así que el fluido
    // emitía las 5 caras que rodean a la flor: láminas translúcidas marcando el hueco, que es lo que
    // el dueño fotografió. Se mide con TAPA para que toda celda esté llena (fH=1) y el número no lo
    // mueva el simulador, y se compara contra el MISMO sitio ocupado por roca — el vecino macizo es
    // la referencia de «así se ve cuando está bien».
    const R5 = 2, yc = fondo + 1;                  // interior 5×5, la celda que se cambia va en medio
    const charcaTapada = async (mat) => {
      for (let x = cx - R5 - 1; x <= cx + R5 + 1; x++) for (let z = cz - R5 - 1; z <= cz + R5 + 1; z++) {
        const borde = (x < cx - R5 || x > cx + R5 || z < cz - R5 || z > cz + R5);
        poner(x, fondo - 1, z, 'roca');
        for (let y = fondo; y < sup; y++) poner(x, y, z, borde ? 'roca' : mat);
        poner(x, sup, z, 'roca');                  // la tapa
      }
      await esperar(3000); await remallar();
    };
    out.finaDentro = {};
    for (const mat of ['agua', 'lava']) {
      await charcaTapada(mat);
      const lleno = caras().alpha;                 // sin nada dentro: todas las caras son internas
      poner(cx, yc, cz, 'roca');
      await esperar(2000); await remallar();
      const conRoca = caras().alpha;
      poner(cx, yc, cz, 'flor-roja');
      await esperar(2000); await remallar();
      const conFina = caras().alpha;
      mc.sinCullingFluido = true; await remallar();
      const finaSinCulling = caras().alpha;
      mc.sinCullingFluido = false; await remallar();
      out.finaDentro[mat] = { lleno, conRoca, conFina, finaSinCulling };
    }

    // ── 0 · devolver el mundo ───────────────────────────────────────────────────────────────────
    for (const [k, id] of previo) { const q = k.split(',').map(Number); mcSetBlock(q[0], q[1], q[2], id); }
    if (typeof game.fluidos.rebuild === 'function') game.fluidos.rebuild();
    await esperar(1500); await remallar();
    let malas = 0;
    for (const [k, id] of previo) { const q = k.split(',').map(Number); if ((mc.grid[mcIdx(q[0], q[1], q[2])] | 0) !== id) malas++; }
    out.restauradas = { total: previo.size, malas };
    out.errsPagina = (window.__errs || []).length;
    return out;
  });

  console.log('\n§1 · una charca de agua emite SOLO su superficie');
  ok(r.celdas > 0, 'la charca tiene agua de verdad', r.celdas + ' celdas');
  ok(r.conCulling.alpha === r.expuestas,
    'con culling salen exactamente las caras expuestas',
    r.conCulling.alpha + ' caras, esperadas ' + r.expuestas);
  ok(r.sinCulling.alpha === r.celdas * 6,
    'sin culling (la válvula) vuelven las 6 caras por celda',
    r.sinCulling.alpha + ' caras, ' + r.celdas + '×6 = ' + (r.celdas * 6));
  ok(r.sinCulling.alpha > r.conCulling.alpha * 5,
    'o sea: el lago-rejilla dibujaba un orden de magnitud más',
    (r.sinCulling.alpha / Math.max(1, r.conCulling.alpha)).toFixed(1) + '×');
  ok(r.reCulling.alpha === r.conCulling.alpha,
    'y quitar la válvula devuelve la misma malla (no hay estado pegado)',
    r.reCulling.alpha + ' vs ' + r.conCulling.alpha);

  console.log('\n§2 · los NIVELES del fluido siguen yendo por el camino fino');
  // Es la regresión de fondo: sin ella el nivel se dibuja como cubo del atlas, que se hornea SIN alpha.
  const niveles = r.ids.filter(i => /-[1-7]$/.test(i.k));
  ok(r.ids.length > 0, 'hay materiales de fluido en la paleta', r.ids.map(i => i.k).join(' '));
  ok(niveles.length > 0, 'y la charca ha generado al menos un nivel', niveles.map(i => i.k).join(' '));
  ok(niveles.every(i => i.fina), 'todos los niveles tienen geometría fina (no son cubos proyectados)',
    niveles.map(i => i.k + '=' + i.fina).join(' '));
  ok(r.ids.every(i => i.tipo === 'WATER' || i.tipo === 'LAVA'),
    'y todos se reconocen como fluido por TIPO', r.ids.map(i => i.k + '→' + i.tipo).join(' '));

  console.log('\n§3 · agua contra lava son tipos distintos: esa cara NO se tapa');
  ok(r.mezcla.alpha === r.mezclaEsperada,
    'media charca de lava: sale la pared que las separa, por los dos lados',
    r.mezcla.alpha + ' caras, esperadas ' + r.mezclaEsperada +
    ' (' + r.mezclaCeldas.agua + ' agua + ' + r.mezclaCeldas.lava + ' lava)');
  ok(r.mezcla.alpha > r.antesMezcla,
    'y son MÁS caras que con una sola masa (si se taparan entre sí, saldrían menos)',
    r.antesMezcla + ' → ' + r.mezcla.alpha);

  console.log('\n§4 · lo que no es fluido sale exactamente igual');
  ok(r.noFluido.sinValvula.alpha === r.noFluido.conValvula.alpha &&
     r.noFluido.sinValvula.opaco === r.noFluido.conValvula.opaco,
    'una flor da la misma malla con y sin válvula (tapadas = 0)',
    JSON.stringify(r.noFluido.sinValvula) + ' vs ' + JSON.stringify(r.noFluido.conValvula));

  console.log('\n§5 · una pieza fina dentro del líquido se ve como un vecino macizo (BUG-FLUID4)');
  for (const mat of ['agua', 'lava']) {
    const c = r.finaDentro[mat];
    ok(c.conFina === c.conRoca,
      `${mat}: la pieza fina no emite ni una cara más que la roca`,
      `[fina ${c.conFina} · roca ${c.conRoca}]`);
    // Anti-falso-verde: si el arreglo cullease de más, TODO daría 0 y el test pasaría sin mirar nada.
    ok(c.lleno === 0 && c.conRoca > 0,
      `${mat}: y sigue habiendo caras que emitir donde toca`,
      `[charca llena ${c.lleno} · con un hueco ocupado ${c.conRoca}]`);
    ok(c.finaSinCulling > c.conFina,
      `${mat}: la válvula sigue devolviendo el lago-rejilla`,
      `[${c.finaSinCulling} vs ${c.conFina}]`);
  }

  console.log('\n§0 · el mundo del dueño queda como estaba');
  ok(r.restauradas.malas === 0, 'todas las celdas restauradas',
    r.restauradas.total - r.restauradas.malas + '/' + r.restauradas.total);
  ok(r.errs.length === 0, 'sin errores dentro de la página', r.errs.join(' | '));
  ok(errores.length === 0, 'sin errores de página', errores.join(' | '));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' fallos' : '\nTODO OK');
  process.exit(fallos ? 1 : 0);
})();
