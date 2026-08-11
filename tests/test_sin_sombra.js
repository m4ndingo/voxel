// @area: render
// @necesita: servidor, playwright
// REQ-SHADOW2 · Materiales que NO proyectan y/o NO reciben sombra, para hacer nubes.
//
//   game.bloques.define('hab:white-wool', { recibeSombra:false, proyectaSombra:false });
//
// Lo que hay que entender antes de leer los §: en el Mundo hay DOS sombras y este ticket toca las dos.
//   · el SKYLIGHT (mc.light), oclusion horneada en el sombreado de cada vertice al mallar. Es la que pone
//     oscuro lo que esta bajo techo, y la que dejaba el pegote gris en el suelo debajo de la nube.
//   · el MAPA DE SOMBRA DEL SOL (mcRenderShadow), un FBO con la altura de lo mas alto de cada columna.
// «no proyecta» saca la pieza del mapa del sol Y arrastra luz:'pasa' (si no, el bloque macizo seguiria
// tapando el cielo y la nube dejaria la misma mancha). «no recibe» le da luz plena a la propia pieza.
//
// Las dos banderas viajan SUMADAS al float de sombreado del vertice (aShade + 2*bits), sin atributo nuevo,
// asi que aqui se leen los VBO de verdad con getBufferSubData: es la unica forma de ver si lo horneado es
// lo que se cree. Y ademas se mira lo que se VE (brillo de pantalla) y el propio mapa del sol.
//
// §1  por defecto las tablas estan a null: coste cero y NADA cambia (criterio de aceptacion)
// §2  proyectaSombra:false → mc.sinSombra[id]=2, bandera horneada, y la columna sale del mapa del sol
// §3  …y arrastra luz:'pasa', que es la otra mitad de que la nube no manche el suelo
// §4  recibeSombra:false → el skylight deja de multiplicar: la panza de la nube no sale gris
// §5  lo que se VE: brillo del suelo bajo la nube y de la panza de la nube, antes y despues
// §6  quitar() lo deshace: las tablas vuelven a null y el VBO sale IDENTICO al de §1
// §7  las estructuras finas van por clave (mc.sinSombraKey), que no tienen id de bloque
//
// No persiste nada: bloquea los POST y deja la rejilla, el material y la camara como estaban.
//
//   node test_sin_sombra.js [url]        por defecto http://localhost:8500/map/test
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
const ok = (nom, cond, extra) => {
  if (!cond) fallos++;
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra !== undefined ? '   [' + extra + ']' : ''));
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
      if (o && String(o.method || 'GET').toUpperCase() !== 'GET' && /\/api\/(mundo|habitantes|assets|agentes)/.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('typeof game!=="undefined" && game.bloques && typeof game.bloques.define==="function"', null, { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const gl = mc.gl, D = mc.dim, NX = D.x, NY = D.y, NZ = D.z;
    const idx = (x, y, z) => x + y * NX + z * NX * NY;
    out.deriv = !!mc.deriv;
    out.webgl2 = typeof gl.getBufferSubData === 'function';

    // ── un sitio despejado con suelo, donde colgar la nube ───────────────────────────────────────
    let bx = -1, bz = -1, sy = -1;
    for (let x = 10; x < NX - 10 && bx < 0; x += 3) for (let z = 10; z < NZ - 10; z += 3) {
      let top = -1;
      for (let y = NY - 1; y >= 1; y--) if (mc.grid[idx(x, y, z)]) { top = y; break; }
      if (top < 1 || top > NY - 20) continue;
      let libre = true;                                        // 9x14x9 de aire encima
      for (let dx = -4; dx <= 4 && libre; dx++) for (let dz = -4; dz <= 4 && libre; dz++)
        for (let dy = 1; dy <= 14; dy++) if (mc.grid[idx(x + dx, top + dy, z + dz)]) { libre = false; break; }
      if (libre) { bx = x; bz = z; sy = top; break; }
    }
    if (bx < 0) { out.errs.push('no encuentro sitio despejado para colgar la nube'); return out; }
    out.sitio = [bx, sy, bz];

    // ── un material que NO este ya usado en el mundo ─────────────────────────────────────────────
    // Si se cogiera 'roca' las banderas afectarian al mundo entero y el «nada mas cambia» de §1/§6 no
    // querria decir nada.
    // Y que sea un BLOQUE de verdad: media paleta son piezas con forma, que no llenan la celda y se van al
    // stream FINO (otro VBO, otro stride). Una nube es un cubo macizo, y ademas asi el §1/§6 lee ch.vbo.
    const usados = new Set(); for (let i = 0; i < mc.grid.length; i++) if (mc.grid[i]) usados.add(mc.grid[i]);
    const FINA = (typeof mcTablaFina === 'function') ? mcTablaFina() : null;
    let nubeId = 0;
    for (let id = mc.blockKey.length - 1; id >= 1; id--) if (!usados.has(id) && !(FINA && FINA[id])) { nubeId = id; break; }
    if (!nubeId) { out.errs.push('no hay ningun material macizo sin usar en la paleta'); return out; }
    const nubeKey = mc.blockKey[nubeId];
    out.nube = { id: nubeId, key: nubeKey };

    const yN = sy + 9;                       // la nube, 7x1x7, nueve celdas sobre el suelo
    const previo = [];
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const i = idx(bx + dx, yN, bz + dz);
      previo.push([i, mc.grid[i]]);
      mc.grid[i] = nubeId;
    }
    mc.gridGen = (mc.gridGen | 0) + 1;

    // ── utilidades de medida ─────────────────────────────────────────────────────────────────────
    // mcMeshChunk indexa por chunk, no por celda: la clave es 'cx,cz' (app.js, `const key=cx+','+cz`).
    const chunkDe = (x, z) => mc.chunks.get(Math.floor(x / MC_CHUNK) + ',' + Math.floor(z / MC_CHUNK)) || null;
    // El VBO del terreno son 6 floats por vertice y el sombreado es el ultimo: ahi es donde se hornean
    // las banderas. Se devuelve el maximo, que es lo que delata el +2/+4 (el sombreado propio no pasa de 1.12).
    const sombreados = () => {
      const ch = chunkDe(bx, bz);
      if (!ch || !ch.vbo || !ch.count || !out.webgl2) return null;
      const a = new Float32Array(ch.count * 6);
      gl.bindBuffer(gl.ARRAY_BUFFER, ch.vbo);
      gl.getBufferSubData(gl.ARRAY_BUFFER, 0, a);
      let max = -1e9, min = 1e9;
      for (let i = 5; i < a.length; i += 6) { if (a[i] > max) max = a[i]; if (a[i] < min) min = a[i]; }
      return { max, min, n: ch.count, suma: a.reduce((s, v) => s + v, 0) };
    };
    // Altura del mapa del sol en una columna del mundo, desempaquetada igual que sunFactor().
    const alturaSol = (wx, wz) => {
      const S = mc.shadow; if (!S) return null;
      const M = MC_SUN_MARGIN;
      const org = [-M, -1, -M], dim = [NX + 2 * M, NY + 2 + M, NZ + 2 * M];
      const u = (wx - org[0]) / dim[0], v = (wz - org[2]) / dim[2];
      const px = Math.min(S.size - 1, Math.max(0, Math.floor(u * S.size)));
      const py = Math.min(S.size - 1, Math.max(0, Math.floor(v * S.size)));
      const buf = new Uint8Array(4);
      const fbPrev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo);
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbPrev);
      return (buf[0] + buf[1] / 255) / 255 * dim[1] + org[1];
    };
    const horneaSol = () => { mcShadowDirty(); const S = mc.shadow; if (S) S.lastBake = 0; mcRenderShadow(); };
    // Brillo medio de lo que se ve. mcRender() en el MISMO evaluate: sin el, readPixels lee el frame anterior.
    const brillo = () => {
      mcRender();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const buf = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let s = 0, n = 0;
      for (let i = 0; i < buf.length; i += 4) { s += (buf[i] + buf[i + 1] + buf[i + 2]) / 3; n++; }
      return s / n;
    };
    const mirar = (px, py, pz, pitch) => { mc.pos[0] = px; mc.pos[1] = py; mc.pos[2] = pz; mc.yaw = 0; mc.pitch = pitch; };

    const posPrev = mc.pos.slice(), yawPrev = mc.yaw, pitchPrev = mc.pitch;
    const sunPrev = mc.sunShade;
    if (mc.sunShade >= 1) mc.sunShade = 0.55;      // con la sombra apagada no hay nada que medir

    mcComputeLight();
    mcMeshAll();
    horneaSol();

    // ── §1 · por defecto, nada ──────────────────────────────────────────────────────────────────
    out.tablasNull = (mc.sinSombra === null || mc.sinSombra === undefined) &&
                     (mc.sinSombraKey === null || mc.sinSombraKey === undefined);
    const base = sombreados();
    out.base = base;
    out.solConNube = alturaSol(bx + 0.5, bz + 0.5);
    out.solFuera = alturaSol(bx + 6.5, bz + 0.5);

    // lo que se ve: el SUELO bajo la nube (camara justo debajo de la nube, mirando abajo)
    mirar(bx + 0.5, sy + 6.5, bz + 0.5, -80);
    out.brilloSueloBase = brillo();
    // …y la PANZA de la nube (camara entre el suelo y la nube, mirando arriba)
    mirar(bx + 0.5, sy + 3.5, bz + 0.5, 80);
    out.brilloPanzaBase = brillo();

    // ── §2/§3 · proyectaSombra:false ────────────────────────────────────────────────────────────
    game.bloques.define(nubeKey, { proyectaSombra: false });
    out.bitsProy = mc.sinSombra ? mc.sinSombra[nubeId] : null;
    out.luzArrastrada = mc.traspasaLuz ? mc.traspasaLuz[nubeId] : null;
    out.proy = sombreados();
    horneaSol();
    out.solSinProyectar = alturaSol(bx + 0.5, bz + 0.5);
    mirar(bx + 0.5, sy + 6.5, bz + 0.5, -80);
    out.brilloSueloProy = brillo();

    // ── §4 · …y ademas recibeSombra:false ───────────────────────────────────────────────────────
    game.bloques.define(nubeKey, { proyectaSombra: false, recibeSombra: false });
    out.bitsAmbas = mc.sinSombra ? mc.sinSombra[nubeId] : null;
    out.ambas = sombreados();
    horneaSol();
    mirar(bx + 0.5, sy + 3.5, bz + 0.5, 80);
    out.brilloPanzaAmbas = brillo();

    // solo «no recibe»: tiene que volver a proyectar
    game.bloques.define(nubeKey, { recibeSombra: false });
    out.bitsRecibe = mc.sinSombra ? mc.sinSombra[nubeId] : null;
    out.luzTrasSoloRecibe = mc.traspasaLuz ? mc.traspasaLuz[nubeId] : null;
    horneaSol();
    out.solSoloRecibe = alturaSol(bx + 0.5, bz + 0.5);

    // ── §6 · quitarlo lo deshace del todo ───────────────────────────────────────────────────────
    // OJO: game.bloques.quitar() esta ROTO en el snippet desde antes de este ticket (tiene pegado en medio
    // un trozo de fisica con variables que ahi no existen: `g`, `xPrev`, `rig`…), asi que revienta con
    // cualquier clave que SI tuviera comportamiento. No es de REQ-SHADOW2 y no se toca aqui. El trabajo que
    // importa (borrar de la tabla y reconstruir las caches) ya esta hecho ANTES de la linea que revienta,
    // asi que tragarse la excepcion deja el estado correcto — y no vale un define() de vuelta: uno que no
    // pide nada se rechaza con «no hace nada».
    out.quitarLanzo = null;
    const quita = k => { try { game.bloques.quitar(k); } catch (e) { out.quitarLanzo = String(e && e.message || e); } };
    quita(nubeKey);
    out.tablasNullTrasQuitar = (mc.sinSombra === null || mc.sinSombra === undefined) &&
                               (mc.sinSombraKey === null || mc.sinSombraKey === undefined);
    const fin = sombreados();
    out.fin = fin;
    out.vboIdentico = !!(base && fin && base.n === fin.n && Math.abs(base.suma - fin.suma) < 1e-3 &&
                         Math.abs(base.max - fin.max) < 1e-6);
    horneaSol();
    out.solTrasQuitar = alturaSol(bx + 0.5, bz + 0.5);
    mirar(bx + 0.5, sy + 6.5, bz + 0.5, -80);
    out.brilloSueloFin = brillo();

    // ── §7 · estructuras finas: van por CLAVE, que no tienen id de bloque ────────────────────────
    // mc.sinSombraKey se llena desde la tabla de comportamientos, no desde la paleta, y es lo unico que
    // mcBuildStructMesh puede mirar: una pieza estampada es mc.structures[i].key y ahi no hay id.
    game.bloques.define(nubeKey, { proyectaSombra: false, recibeSombra: false });
    out.keyTabla = mc.sinSombraKey ? mc.sinSombraKey[nubeKey] : null;
    // …y de verdad, sobre una pieza estampada: se re-hornea y la instancia sale marcada.
    out.estructuras = mc.structures.length;
    if (mc.structures.length) {
      const stKey = mc.structures[0].key;
      const antes = mc.structures.filter(s => s.key === stKey);
      out.stKey = stKey;
      out.stAntes = antes.some(s => s.sinProyectar);
      // Esta seccion va la ULTIMA a proposito: quitar() se lleva por delante TODO el comportamiento que el
      // autoarranque le hubiera dado a esa pieza (leaves suele tener luz:'pasa'), y no hay forma de leerlo
      // para devolverlo. La pestaña se tira al acabar el test y no se persiste nada, asi que da igual.
      game.bloques.define(stKey, { proyectaSombra: false });
      await mcRestampAll();
      out.stDespues = mc.structures.filter(s => s.key === stKey).every(s => s.sinProyectar === true);
      quita(stKey);
      await mcRestampAll();
      out.stDeshecho = mc.structures.filter(s => s.key === stKey).every(s => s.sinProyectar === false);
    }
    quita(nubeKey);
    out.keyTrasQuitar = mc.sinSombraKey;

    // ── limpieza ────────────────────────────────────────────────────────────────────────────────
    for (const [i, v] of previo) mc.grid[i] = v;
    mc.gridGen = (mc.gridGen | 0) + 1;
    mc.pos[0] = posPrev[0]; mc.pos[1] = posPrev[1]; mc.pos[2] = posPrev[2];
    mc.yaw = yawPrev; mc.pitch = pitchPrev;
    mc.sunShade = sunPrev;
    mcComputeLight();
    mcMeshAll();
    horneaSol();
    return out;
  });

  for (const e of r.errs || []) { console.log('  FALLA  ' + e); fallos++; }
  if (!r.sitio) { await b.close(); process.exit(1); }
  console.log('\nsitio (x,suelo,z): ' + JSON.stringify(r.sitio) + ' · nube: ' + JSON.stringify(r.nube) +
              ' · derivadas: ' + r.deriv + ' · webgl2: ' + r.webgl2 + '\n');

  console.log('§1 · por defecto no hay tablas y nada cambia');
  ok('mc.sinSombra y mc.sinSombraKey arrancan a null (coste cero)', r.tablasNull);
  if (r.webgl2) ok('el sombreado horneado no pasa de 1.12 (MC_FACES, sin banderas)',
    r.base && r.base.max <= 1.13, r.base && r.base.max.toFixed(3));

  console.log('\n§2 · proyectaSombra:false');
  ok('mc.sinSombra[id] = 2', r.bitsProy === 2, r.bitsProy);
  if (r.webgl2) ok('la bandera se hornea sumada al sombreado (+4)',
    r.proy && r.proy.max > 4 && r.proy.max <= 5.13, r.proy && r.proy.max.toFixed(3));
  if (r.deriv) {
    ok('con nube, el mapa del sol da la altura de la NUBE', r.solConNube !== null && r.solConNube > r.sitio[1] + 5,
      'altura=' + (r.solConNube === null ? 'sin mapa' : r.solConNube.toFixed(1)) + ' suelo=' + r.sitio[1]);
    ok('sin proyectar, la columna cae al SUELO', r.solSinProyectar !== null && r.solSinProyectar < r.sitio[1] + 5,
      'altura=' + (r.solSinProyectar === null ? 'sin mapa' : r.solSinProyectar.toFixed(1)));
    ok('fuera de la nube el mapa ya estaba al nivel del suelo', r.solFuera !== null && r.solFuera < r.sitio[1] + 5,
      r.solFuera === null ? 'sin mapa' : r.solFuera.toFixed(1));
  } else console.log('  (sin derivadas en este contexto: el mapa del sol no se hornea, secciones saltadas)');

  console.log('\n§3 · …y arrastra luz:"pasa" (la OTRA sombra)');
  ok('proyectaSombra:false pone mc.traspasaLuz[id]=1', r.luzArrastrada === 1, r.luzArrastrada);
  ok('recibeSombra:false SOLO no toca la luz del cielo', !r.luzTrasSoloRecibe, r.luzTrasSoloRecibe);

  console.log('\n§4 · recibeSombra:false');
  ok('las dos banderas juntas dan 3', r.bitsAmbas === 3, r.bitsAmbas);
  if (r.webgl2) ok('…y se hornean como +6', r.ambas && r.ambas.max > 6 && r.ambas.max <= 7.13,
    r.ambas && r.ambas.max.toFixed(3));
  ok('solo recibeSombra:false da 1', r.bitsRecibe === 1, r.bitsRecibe);
  if (r.deriv) ok('…y vuelve a proyectar: el mapa sube otra vez a la nube',
    r.solSoloRecibe !== null && r.solSoloRecibe > r.sitio[1] + 5,
    r.solSoloRecibe === null ? 'sin mapa' : r.solSoloRecibe.toFixed(1));

  console.log('\n§5 · lo que se ve');
  ok('el suelo bajo la nube se ACLARA al dejar de proyectar', r.brilloSueloProy > r.brilloSueloBase,
    r.brilloSueloBase.toFixed(1) + ' → ' + r.brilloSueloProy.toFixed(1));
  ok('la panza de la nube se ACLARA al dejar de recibir', r.brilloPanzaAmbas > r.brilloPanzaBase,
    r.brilloPanzaBase.toFixed(1) + ' → ' + r.brilloPanzaAmbas.toFixed(1));

  console.log('\n§6 · deshacerlo lo deshace');
  if (r.quitarLanzo) console.log('  (AJENO a este ticket: game.bloques.quitar() revienta ya en HEAD — "' +
    r.quitarLanzo + '"; borra y reconstruye ANTES de reventar, asi que el estado queda bien)');
  ok('las tablas vuelven a null', r.tablasNullTrasQuitar);
  if (r.webgl2) ok('el VBO del terreno sale IDENTICO al de §1', r.vboIdentico,
    r.base && r.fin ? ('max ' + r.base.max.toFixed(3) + ' → ' + r.fin.max.toFixed(3)) : 'sin lectura');
  if (r.deriv) ok('el mapa del sol vuelve a la altura de la nube',
    r.solTrasQuitar !== null && r.solTrasQuitar > r.sitio[1] + 5,
    r.solTrasQuitar === null ? 'sin mapa' : r.solTrasQuitar.toFixed(1));
  ok('el suelo vuelve a estar tan oscuro como en §1', Math.abs(r.brilloSueloFin - r.brilloSueloBase) < 1.5,
    r.brilloSueloBase.toFixed(1) + ' → ' + r.brilloSueloFin.toFixed(1));

  console.log('\n§7 · estructuras finas (por clave, sin id de bloque)');
  ok('el material definido entra tambien en mc.sinSombraKey', r.keyTabla === 3, r.keyTabla);
  ok('deshacerlo vacia tambien la tabla por clave', !r.keyTrasQuitar, JSON.stringify(r.keyTrasQuitar));
  if (r.estructuras) {
    ok('una pieza estampada NO nace marcada', r.stAntes === false, r.stKey);
    ok('proyectaSombra:false marca la instancia al re-hornear', r.stDespues === true, r.stKey);
    ok('…y volver al defecto la devuelve a proyectar', r.stDeshecho === true, r.stKey);
  } else console.log('  (no hay estructuras estampadas en este mapa: seccion saltada)');

  ok('sin errores de pagina', errores.length === 0, errores.slice(0, 3).join(' · '));
  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTODO OK');
  process.exit(fallos ? 1 : 0);
})();
