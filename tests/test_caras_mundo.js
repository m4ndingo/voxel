// @area: caras
// @necesita: servidor, playwright
// La mascara de caras tiene que llegar al MALLADO del Mundo, no solo al editor.
//
// Aqui lo que se puede desincronizar es el GIRO: mcStructGeom rota las coordenadas con dos llamadas a
// mcRotXZ (vuelco + giro), y las caras tienen que rotar con ellas. La permutacion se deriva de esas
// mismas dos llamadas (mcFacePerm), asi que el test no comprueba una tabla: comprueba la geometria
// que sale del mallador — donde acaba el plano superviviente cuando la pieza se tumba.
//
// No persiste nada: inyecta los documentos en roomDataCache y no estampa en el mundo del dueno.
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
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\/(mundo|habitantes)/.test(url)) {
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return orig(u, o);
    };
  });
  await p.goto('http://localhost:8500/map/agents', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(2000);

  const r = await p.evaluate(async () => {
    const out = {};
    // Un documento sintetico: `vox` son los voxels y `caras` la mascara, tal como salen del editor.
    let n = 0;
    const doc = (vox, caras, size) => {
      const key = 'zz-caras-' + (++n);
      const d = { size: size || { x: 16, y: 16, z: 16 }, meta: { name: key, type: 'objeto' }, voxels: vox };
      if (caras) d.caras = caras;
      roomDataCache.set(key, Promise.resolve(d));
      mc.structs[key] = undefined;
      return key;
    };

    // ── §1 un voxel suelto: 6 caras sin mascara, las que digas con ella ────────
    const uno = { '2,2,2': '#88cc44' };
    out.sinMascara = (await mcStructGeom(doc(uno), 0)).colCount / 6;      // 6 vertices por cara
    out.mascaraCero = (await mcStructGeom(doc(uno, { '2,2,2': 0 }), 0)).colCount / 6;
    // Ojo con el x2: un voxel con mascara ya no es un cubo cerrado, asi que cada cara que le queda se
    // emite DOS veces, una por bobinado. Sin eso el plano desaparece al mirarlo por detras (CULL_FACE).
    out.soloDos = (await mcStructGeom(doc(uno, { '2,2,2': 1 | (1 << 1) }), 0)).colCount / 6;

    // ── §1c las dos copias son el mismo cuadro del reves, con el enves hundido en su voxel ──
    // El anverso se queda EXACTO en el plano del voxel; el enves se mete mc.carasInset voxels finos
    // hacia DENTRO. Ese pelo es lo que le da prioridad al anverso cuando dos piezas con mascara se
    // pegan: si los dos cuadros cayeran en el mismo plano, el ganador lo decidiria el orden de dibujo
    // (mezcla de texturas). Con el hundido a 0 vuelven a coincidir, y eso tambien se comprueba.
    const TILE = (typeof MC_TILE === 'number' ? MC_TILE : 16);
    const INSET = 0.08, hundido = INSET / TILE;                           // en voxels de mundo
    mc.carasInset = INSET;
    const unaCara = await mcStructGeom(doc({ '4,4,4': '#88cc44' }, { '4,4,4': 1 }), 0);
    const cubo = await mcStructGeom(doc({ '4,4,4': '#88cc44' }), 0);      // el mismo voxel entero: su centro
    const nor = (q) => {                                                  // normal del primer triangulo
      const v = unaCara.colLocal, P = i => [0, 1, 2].map(a => v[(q + i) * 9 + a]);
      const [a, b, c] = [P(0), P(1), P(2)], u = b.map((x, i) => x - a[i]), w = c.map((x, i) => x - a[i]);
      return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    };
    const vert = (m, i) => [0, 1, 2].map(a => m.colLocal[i * 9 + a]);
    const centro = (m, q, n) => { const c = [0, 0, 0];
      for (let i = 0; i < n; i++) { const V = vert(m, q + i); for (let a = 0; a < 3; a++) c[a] += V[a] / n; }
      return c; };
    const pos = (q, d) => { const s = [];
      for (let i = 0; i < 6; i++) s.push(vert(unaCara, q + i).map((x, a) => (x - (d ? d[a] : 0)).toFixed(6)).join(','));
      return s.sort().join(' '); };
    out.unaCaraQuads = unaCara.colCount / 6;
    const c0 = centro(unaCara, 0, 6), c6 = centro(unaCara, 6, 6), cc = centro(cubo, 0, cubo.colCount);
    const d = c6.map((x, a) => x - c0[a]);                                // lo que se ha movido el enves
    out.mismoCuadroCorrido = unaCara.colCount === 12 && pos(0) === pos(6, d);
    out.hundidoJusto = Math.abs(Math.hypot(d[0], d[1], d[2]) - hundido) < 1e-6 &&
      d.filter(x => Math.abs(x) > 1e-9).length === 1;                     // un solo eje: el de la cara
    out.hundidoHaciaDentro = d.reduce((t, x, a) => t + x * (cc[a] - c0[a]), 0) > 0;
    const [n0, n1] = [nor(0), nor(6)];
    out.normalOpuesta = n0.some(x => Math.abs(x) > 1e-9) && n0.every((x, i) => Math.abs(x + n1[i]) < 1e-6);
    mc.carasInset = 0;                                                    // con el pelo apagado, coinciden
    const sinHundir = await mcStructGeom(doc({ '4,4,4': '#88cc44' }, { '4,4,4': 1 }), 0);
    const posS = (q) => { const s = [];
      for (let i = 0; i < 6; i++) s.push(vert(sinHundir, q + i).join(','));
      return s.sort().join(' '); };
    out.sinHundirMismoSitio = sinHundir.colCount === 12 && posS(0) === posS(6);

    // ── §1b y CUAL apaga: el bit i tiene que quitar MC_FACES[i], no su opuesta ─
    // Contar caras no distingue «apago +X» de «apago -X»: las dos dan la misma cuenta. Aqui cada quad se
    // clasifica por DONDE esta (su centro se sale del centro del voxel por el eje y el signo de su cara),
    // no por su bobinado, que es facil de interpretar del reves.
    const ladoDeCadaCara = async (caras) => {
      const m = await mcStructGeom(doc({ '8,8,8': '#88cc44' }, caras && { '8,8,8': caras }), 0);
      const v = m.colLocal, cen = [];
      for (let q = 0; q < m.colCount; q += 6) {
        let sx = 0, sy = 0, sz = 0;
        for (let i = 0; i < 6; i++) { sx += v[(q + i) * 9]; sy += v[(q + i) * 9 + 1]; sz += v[(q + i) * 9 + 2]; }
        cen.push([sx / 6, sy / 6, sz / 6]);
      }
      const c = [0, 1, 2].map(a => cen.reduce((s, q) => s + q[a], 0) / (cen.length || 1));
      return cen.map(q => {
        const d = [q[0] - c[0], q[1] - c[1], q[2] - c[2]], ab = d.map(Math.abs);
        const i = ab.indexOf(Math.max(...ab)), s = [0, 0, 0];
        s[i] = Math.sign(d[i]);
        return s.join(',');
      }).sort();
    };
    const MCDIR = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    const seis = await ladoDeCadaCara(null);
    out.seisLados = seis;
    out.porBit = [];
    for (let i = 0; i < 6; i++) {
      const quedan = await ladoDeCadaCara(63 ^ (1 << i));
      const falta = seis.filter(x => !quedan.includes(x));
      out.porBit.push({ bit: i, esperada: MCDIR[i].join(','), falta: falta.join(' ') });
    }

    // ── §2 girar no cambia CUANTAS caras hay ──────────────────────────────────
    const kg = doc(uno, { '2,2,2': 1 });                                   // solo la cara 0 (+Z del asset = +Y del mundo)
    out.porRot = [];
    for (const rot of [0, 1, 2, 3, 4, 8, 12, 5]) out.porRot.push((await mcStructGeom(kg, rot)).colCount / 6);

    // ── §3 girar cambia DONDE esta ────────────────────────────────────────────
    // Un solo plano horizontal (+Y). Sin vuelco sigue horizontal: sus 6 vertices comparten la Y.
    // Con vuelco de un cuarto (tilt=1, bits 2-3 del rot) tiene que quedarse vertical: comparten Z.
    mc.carasInset = 0;   // el hundido del enves separaria los 6 vertices por 1/200 de bloque y aqui
                         // lo que se mide es DONDE cae el plano al girar, no el desempate de profundidad
    const plano = (rot) => mcStructGeom(kg, rot).then(m => {
      const v = m.colLocal, ejes = [[], [], []];
      for (let i = 0; i < m.colCount; i++) for (let a = 0; a < 3; a++) ejes[a].push(v[i * 9 + a]);
      return ejes.map(e => e.every(x => Math.abs(x - e[0]) < 1e-6));      // ¿constante en ese eje?
    });
    out.sinVuelco = await plano(0);
    out.conVuelco = await plano(1 << 2);

    // ── §4 la mata de hierba: dos planos cruzados que se ven de los dos lados ──
    // Cada voxel del plano deja encendidas solo sus dos caras opuestas.
    const cruz = {}, cruzCaras = {};
    for (let z = 0; z < 8; z++) {
      for (let i = 0; i < 8; i++) { cruz[i + ',' + i + ',' + z] = '#4a8b2c'; cruzCaras[i + ',' + i + ',' + z] = (1 << 2) | (1 << 3); }
    }
    const km = doc(cruz, cruzCaras);
    const mm = await mcStructGeom(km, 0);
    out.cruzCaras = mm.colCount / 6;
    out.cruzSinMascara = (await mcStructGeom(doc(cruz), 0)).colCount / 6;

    // ── §5 un 16³ macizo con mascara NO puede colarse en la rejilla ────────────
    const macizo = {};
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) macizo[x + ',' + y + ',' + z] = '#777777';
    out.macizoEsBloque = (await mcStructCells(doc(macizo))).blockLike;
    out.macizoConCarasNoEsBloque = (await mcStructCells(doc(macizo, { '0,0,15': 0 }))).blockLike;

    // ── §6 la mascara no toca la colision: bits sale de la ocupacion real ─────
    const bitsSin = (await mcStructGeom(doc(uno), 0)).bits;
    const bitsCon = (await mcStructGeom(doc(uno, { '2,2,2': 0 }), 0)).bits;
    out.bitsIguales = bitsSin.length === bitsCon.length && bitsSin.every((x, i) => x === bitsCon[i]);
    out.bitsNoVacio = bitsCon.some(x => x === 1);
    return out;
  });

  console.log('\n§1 la mascara decide cuantas caras emite el mallador');
  ok('sin mascara, un voxel suelto emite sus 6 caras', r.sinMascara === 6, 'caras=' + r.sinMascara);
  ok('mascara 0 = no emite ninguna cara', r.mascaraCero === 0, 'caras=' + r.mascaraCero);
  ok('mascara de 2 bits = 2 caras, a dos lados cada una', r.soloDos === 4, 'caras=' + r.soloDos);

  console.log('\n§1c el enves es el mismo cuadro, del reves y hundido un pelo');
  ok('una cara encendida emite dos cuadros', r.unaCaraQuads === 2, 'cuadros=' + r.unaCaraQuads);
  ok('el enves es el anverso corrido en bloque (mismo cuadro, no otro)', r.mismoCuadroCorrido);
  ok('corrido justo mc.carasInset y en un solo eje', r.hundidoJusto);
  ok('y hacia DENTRO del voxel (si fuera hacia fuera, taparia a la pieza de al lado)', r.hundidoHaciaDentro);
  ok('y sus normales son opuestas (si no, el culling se los comeria a los dos)', r.normalOpuesta);
  ok('con mc.carasInset=0 vuelven a caer en el mismo sitio', r.sinHundirMismoSitio);

  console.log('\n§1b cada bit apaga SU cara, no la de enfrente');
  ok('un voxel suelto emite las seis caras, una por lado', r.seisLados.length === 6 && new Set(r.seisLados).size === 6,
    'lados=' + r.seisLados.join(' '));
  for (const b of r.porBit) {
    ok('el bit ' + b.bit + ' apaga la cara ' + b.esperada, b.falta === b.esperada,
      'desaparecio=' + (b.falta || '(ninguna)'));
  }

  console.log('\n§2 girar la pieza no crea ni destruye caras');
  ok('la misma cuenta en los 8 giros probados', r.porRot.every(x => x === 2), 'caras por rot=' + r.porRot.join(','));

  console.log('\n§3 la cara gira CON la pieza (esto es lo que una tabla a mano rompe)');
  ok('sin vuelco, el plano es horizontal (Y constante)', r.sinVuelco[1] && !r.sinVuelco[0] && !r.sinVuelco[2],
    'constante en [x,y,z]=' + r.sinVuelco.join(','));
  ok('con un cuarto de vuelco, el plano queda vertical (Z constante)', r.conVuelco[2] && !r.conVuelco[1],
    'constante en [x,y,z]=' + r.conVuelco.join(','));

  console.log('\n§4 la mata de hierba: dos caras por voxel, no seis');
  ok('la cruz enmascarada emite muchas menos caras que la maciza', r.cruzCaras < r.cruzSinMascara,
    'con mascara=' + r.cruzCaras + ' sin mascara=' + r.cruzSinMascara);
  ok('la cruz enmascarada emite alguna cara (no desaparece)', r.cruzCaras > 0, 'caras=' + r.cruzCaras);

  console.log('\n§5 un 16³ macizo con mascara pasa a ser estructura fina');
  ok('sin mascara sigue siendo bloque de terreno', r.macizoEsBloque === true);
  ok('con mascara deja de serlo (o perderia la mascara en silencio)', r.macizoConCarasNoEsBloque === false);

  console.log('\n§6 la mascara es SOLO visual: la colision no se entera');
  ok('bits sale igual con y sin mascara', r.bitsIguales);
  ok('bits sigue marcando el voxel como solido', r.bitsNoVacio);

  ok('sin errores de pagina', errores.length === 0, errores.join(' | '));
  await b.close();
  console.log('\n' + (fallos ? fallos + ' fallos' : 'todo ok'));
  process.exit(fallos ? 1 : 0);
})();