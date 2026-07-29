// El atlas de estructuras se apilaba con altura = nº de texturas, y la v de un texel es fila/altura. Asi que meter
// UNA textura nueva cambiaba la v de TODAS y habia que re-mallar las 48 estructuras (61 ms de los 134 que costaba
// estampar). Ahora cada clave tiene FILA FIJA (mc.structTexRow) y la altura sube de 16 en 16 filas, asi que lo ya
// horneado sigue valiendo y solo se re-malla al cruzar escalon.
//
// El riesgo del cambio es silencioso y feo: si una clave cambia de fila sin re-mallar, las estructuras se dibujan
// con la textura de otra. Por eso aqui no basta comprobar las UV: se comprueba tambien EN PIXELES que una estructura
// ya estampada no cambia de aspecto cuando entran texturas nuevas detras.
// No persiste nada: bloquea el POST del mundo y retira lo que estampa.
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
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\/mundo/.test(url)) {
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return orig(u, o);
    };
  });

  await p.goto('http://localhost:8500/map/agents', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const S = 16;
    const bx = Math.floor(mc.pos[0]), bz = Math.floor(mc.pos[2]);
    let sy = -1;
    for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(bx, y, bz)]) { sy = y; break; }
    if (sy < 0) { out.errs.push('sin suelo bajo el jugador'); return out; }

    // Cubo texturado de un color plano, para reconocerlo en pantalla.
    const registra = (key, color) => {
      const tex = {}, cubo = {};
      for (let x = 0; x < S; x++) for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) {
        tex[x + ',' + y + ',' + z] = color; cubo[x + ',' + y + ',' + z] = 'tex:' + key + '-t';
      }
      roomDataCache.set(key + '-t', Promise.resolve({ size: { x: S, y: S, z: S }, meta: { name: key + '-t', type: 'textura' }, voxels: tex }));
      roomDataCache.set(key, Promise.resolve({ size: { x: S, y: S, z: S }, meta: { name: key, type: 'bloque' }, voxels: cubo,
                                              textures: { [key + '-t']: { size: { x: S, y: S, z: S }, voxels: tex } } }));
    };
    const uvDe = k => { const u = mc.structUV && mc.structUV[k]; return u ? JSON.stringify(u) : null; };
    const puestas = [];

    // --- La primera estructura, y una foto de como se ve ----------------------------------------------------
    registra('zz-a', '#12d0a0');
    await mcStampStruct('zz-a', bx + 4, sy + 1, bz, 0, true); puestas.push('zz-a');
    // Camara mirandola de frente (yaw=0 mira a -z), un poco por encima del suelo.
    mc.yaw = 0; mc.pitch = 0; mc.vel = [0, 0, 0];
    mc.pos[0] = bx + 4.5; mc.pos[2] = bz + 6; mc.pos[1] = sy + 1.5 - MC_EYE * mc.scale;

    const gl = mc.gl, W = mc.canvas.width, H = mc.canvas.height, L = 48;
    // La camara se re-fija en cada foto: entre unas y otras hay esperas, y la fisica del bucle mueve al jugador.
    // Sin esto la comparacion mide que el jugador se ha caido, no que la textura haya cambiado.
    const foto = () => {
      mc.yaw = 0; mc.pitch = 0; mc.vel = [0, 0, 0];
      mc.pos[0] = bx + 4.5; mc.pos[2] = bz + 6; mc.pos[1] = sy + 1.5 - MC_EYE * mc.scale;
      const px = new Uint8Array(L * L * 4); mcRender();
      gl.readPixels((W >> 1) - (L >> 1), (H >> 1) - (L >> 1), L, L, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    const difiere = (a, c) => { let n = 0; for (let i = 0; i < a.length; i += 4)
      if (Math.abs(a[i] - c[i]) > 6 || Math.abs(a[i + 1] - c[i + 1]) > 6 || Math.abs(a[i + 2] - c[i + 2]) > 6) n++;
      return n; };

    const antesPx = foto();
    out.uvA0 = uvDe('zz-a-t');
    out.filaA0 = mc.structTexRow ? mc.structTexRow['zz-a-t'] : undefined;
    out.filas0 = mc.structAtlasRows;

    // --- Entra una textura NUEVA: no debe mover a la primera ------------------------------------------------
    let remallados = 0;
    const meshOrig = window.mcBuildStructMesh;
    window.mcBuildStructMesh = function () { remallados++; return meshOrig.apply(this, arguments); };

    registra('zz-b', '#d02040');
    const t0 = performance.now();
    await mcStampStruct('zz-b', bx + 4, sy + 1, bz - 3, 0, true); puestas.push('zz-b');
    out.msSegunda = Math.round(performance.now() - t0);
    out.remalladosSegunda = remallados;
    out.uvA1 = uvDe('zz-a-t');
    out.movio1 = mc.structUVMoved;
    out.difTrasNueva = difiere(antesPx, foto());

    // --- Y quitarla tampoco: el atlas no encoge -------------------------------------------------------------
    const sb = mc.structures.find(o => o.key === 'zz-b'); if (sb) mcRemoveStruct(sb, true);
    await new Promise(r => setTimeout(r, 300));
    out.uvA2 = uvDe('zz-a-t');
    out.filasTrasQuitar = mc.structAtlasRows;
    out.difTrasQuitar = difiere(antesPx, foto());

    // --- Cruzar escalon: ahi SI se mueven las UV, y entonces hay que re-mallar todo --------------------------
    // Se anaden texturas hasta que el atlas cruce de verdad el escalon (no vale calcular cuantas faltan: hay claves
    // vivas del mundo cargado que tambien ocupan fila).
    remallados = 0;
    for (let i = 0; i < 40 && mc.structAtlasRows === out.filas0; i++) {
      registra('zz-r' + i, '#3060' + (16 + i % 80).toString(16).padStart(2, '0'));
      await mcStampStruct('zz-r' + i, bx + 4 + (i % 6), sy + 1, bz - 6 - Math.floor(i / 6), 0, true);
      puestas.push('zz-r' + i);
    }
    out.filasFinal = mc.structAtlasRows;
    out.crecio = out.filasFinal > out.filas0;
    out.remalladosAlCruzar = remallados;
    out.uvA3 = uvDe('zz-a-t');
    // Lo importante: tras cruzar, la primera estructura SIGUE viendose igual (se re-mallo con las UV nuevas).
    out.difTrasCruzar = difiere(antesPx, foto());
    out.filaAFinal = mc.structTexRow ? mc.structTexRow['zz-a-t'] : undefined;

    window.mcBuildStructMesh = meshOrig;
    for (const k of puestas) {
      const s = mc.structures.find(o => o.key === k); if (s) mcRemoveStruct(s, true);
      roomDataCache.delete(k); roomDataCache.delete(k + '-t'); delete mc.structs[k];
    }
    out.limpio = !mc.structures.some(o => /^zz-/.test(o.key));
    return out;
  });

  if (r.errs && r.errs.length) r.errs.forEach(e => ok('preparacion: ' + e, false));

  console.log('\nUna textura nueva no mueve a las que ya estaban');
  ok('la estructura ya estampada conserva sus UV', r.uvA1 === r.uvA0 && r.uvA0 !== null, r.uvA0);
  ok('no se declaro movimiento de UV', r.movio1 === false);
  ok('y no se re-mallo el mundo entero', r.remalladosSegunda <= 2,
    r.remalladosSegunda + ' mallas, ' + r.msSegunda + ' ms');
  ok('EN PIXELES: la primera estructura se ve igual', r.difTrasNueva === 0, r.difTrasNueva + ' px distintos');

  console.log('\nQuitar una estructura no encoge el atlas (encogerlo moveria las UV de las demas)');
  ok('la altura del atlas no baja', r.filasTrasQuitar >= r.filas0, r.filas0 + ' -> ' + r.filasTrasQuitar);
  ok('las UV siguen intactas', r.uvA2 === r.uvA0);
  ok('EN PIXELES: sigue viendose igual', r.difTrasQuitar === 0, r.difTrasQuitar + ' px distintos');

  console.log('\nAl cruzar escalon si se re-malla todo, y el resultado se ve igual');
  ok('el atlas crecio de escalon', r.crecio === true, r.filas0 + ' -> ' + r.filasFinal);
  ok('se re-mallaron las estructuras', r.remalladosAlCruzar > 2, r.remalladosAlCruzar + ' mallas');
  ok('la clave conserva su fila (solo cambia el denominador)', r.filaAFinal === r.filaA0, 'fila ' + r.filaA0);
  ok('EN PIXELES: la primera estructura sigue viendose igual', r.difTrasCruzar === 0, r.difTrasCruzar + ' px distintos');

  ok('limpieza: las estructuras de prueba se retiran', r.limpio === true);
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\n13 ok, 0 fallos');
  process.exit(fallos ? 1 : 0);
})();
