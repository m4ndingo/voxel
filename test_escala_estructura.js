// SONDA de REQ-AGESC1 (escala libre de agentes). Todo el diseño descansa en UNA suposición: que escalar una
// instancia estampada es multiplicar la posición local ANTES de trasladarla al mundo, dentro de
// mcBuildStructMesh, sin tocar la caché de geometría (que va por key+rot y NO conoce la escala).
//
// Esto lo comprueba EN PÍXELES, que es la única forma de saber que el shader traga: una malla que se sube con
// posiciones escaladas puede compilar, dibujarse y salir negra o del revés. Se mide el bulto en pantalla de la
// MISMA estructura a esc=1, 1.4 (no entero, que es lo que pidió el dueño) y 0.5.
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

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const S = 16, KEY = 'zz-esc';
    const bx = Math.floor(mc.pos[0]), bz = Math.floor(mc.pos[2]);
    let sy = -1;
    for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(bx, y, bz)]) { sy = y; break; }
    if (sy < 0) { out.errs.push('sin suelo bajo el jugador'); return out; }

    // Media caja: 8 de ancho por 16 de alto por 8 de fondo. NO llega a 4096 voxels, así que mcStructPrepare la
    // deja como estructura FINA (mc.structures) en vez de proyectarla a un bloque de mc.grid — que es justo el
    // camino que tienen los agentes articulados.
    const vox = {};
    for (let x = 0; x < 8; x++) for (let y = 0; y < S; y++) for (let z = 0; z < 8; z++) vox[x + ',' + y + ',' + z] = '#12d0a0';
    roomDataCache.set(KEY, Promise.resolve({ size: { x: S, y: S, z: S }, meta: { name: KEY, type: 'bloque' }, voxels: vox }));

    const ox = bx + 4, oy = sy + 1, oz = bz;
    await mcStampStruct(KEY, ox, oy, oz, 0, true);
    const s = mc.structures.find(o => o.key === KEY);
    if (!s) { out.errs.push('no se estampó'); return out; }
    out.esFina = !!(s.colCount || s.texCount);

    // Cámara de frente y cerca, para que la pieza (media caja: 0.5 bloques de lado) ocupe pantalla de sobra.
    const gl = mc.gl, W = mc.canvas.width, H = mc.canvas.height;
    const encuadra = () => { mc.yaw = 0; mc.pitch = 0; mc.vel = [0, 0, 0];
      mc.pos[0] = ox + 0.25; mc.pos[2] = oz + 3; mc.pos[1] = oy + 0.25 - MC_EYE * mc.scale; };
    const foto = () => { encuadra(); const px = new Uint8Array(W * H * 4); mcRender();
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    // El bulto de la pieza NO se mide por color (el turquesa se confunde con el terreno): se mide como los
    // píxeles que CAMBIAN al apagar la instancia. Eso es exactamente lo que la pieza tapa en pantalla.
    const bulto = () => {
      const c = [s.colCount, s.alphaCount, s.texCount];
      s.colCount = s.alphaCount = s.texCount = 0;
      const vacio = foto();
      s.colCount = c[0]; s.alphaCount = c[1]; s.texCount = c[2];
      const con = foto();
      let n = 0;
      for (let i = 0; i < con.length; i += 4)
        if (Math.abs(con[i] - vacio[i]) > 6 || Math.abs(con[i + 1] - vacio[i + 1]) > 6 || Math.abs(con[i + 2] - vacio[i + 2]) > 6) n++;
      return n;
    };
    const reescala = async (E) => {
      for (const v of [s.colVbo, s.alphaVbo, s.texVbo]) if (v) gl.deleteBuffer(v);
      Object.assign(s, await mcBuildStructMesh(KEY, ox, oy, oz, s.rot, E));
    };

    out.px1 = bulto();
    out.aabb1 = s.aabb.slice();

    await reescala(1.4);
    out.px14 = bulto();
    out.aabb14 = s.aabb.slice();
    out.esc14 = s.esc;

    await reescala(0.5);
    out.px05 = bulto();
    out.aabb05 = s.aabb.slice();

    // Y volver a 1 tiene que devolver EXACTAMENTE la foto de partida: el camino esc===1 no puede haber cambiado.
    await reescala(1);
    out.px1bis = bulto();
    out.aabb1bis = s.aabb.slice();

    // --- Y la pieza tiene que CHOCAR y dejarse APUNTAR donde se ve, no donde estaría a tamaño 1 -------------
    // La media caja llega, a escala 1, hasta x = ox+0.5 (8 de 16 voxels finos). A escala 1.4 llega a ox+0.7.
    // Se sondea un punto que solo está dentro de la versión grande: 0.6 bloques desde el origen.
    const T = MC_TILE;
    const sonda = (dx) => { const f = (v) => Math.floor(v * T);
      return { choca: mcFineSolidAt(f(ox + dx), f(oy + 0.25), f(oz + 0.25)),
               apunta: mcAimSolidAt(f(ox + dx), f(oy + 0.25), f(oz + 0.25)),
               quien: !!mcStructAt(ox + dx, oy + 0.25, oz + 0.25) }; };
    await reescala(1);
    out.dentro1 = sonda(0.25);      // dentro de las dos versiones
    out.fuera1 = sonda(0.6);        // fuera de la pequeña
    await reescala(1.4);
    out.dentro14 = sonda(0.25);
    out.fuera14 = sonda(0.6);       // ...pero DENTRO de la grande
    await reescala(1);

    out.glErr = gl.getError();
    mcRemoveStruct(s, true); roomDataCache.delete(KEY); delete mc.structs[KEY];
    out.limpio = !mc.structures.some(o => o.key === KEY);
    return out;
  });

  if (r.errs && r.errs.length) r.errs.forEach(e => ok('preparación: ' + e, false));

  console.log('\nLa pieza de la sonda es una estructura fina (el camino de los agentes)');
  ok('se estampó como malla fina', r.esFina === true);
  ok('se ve algo a escala 1', r.px1 > 500, r.px1 + ' px');

  console.log('\nEscala LIBRE no entera (1.4)');
  ok('la instancia recuerda su escala', r.esc14 === 1.4, String(r.esc14));
  ok('se sigue viendo (no pantalla negra ni malla del revés)', r.px14 > 500, r.px14 + ' px');
  // A 1.4 la pieza es 1.4× en ancho y alto ⇒ ~1.96× de área en pantalla. Se admite holgura por el recorte
  // del viewport y por el suelo que tapa la base.
  ok('ocupa MÁS pantalla que a escala 1', r.px14 > r.px1 * 1.3, r.px1 + ' → ' + r.px14 + ' px');
  ok('el AABB crece ×1.4', r.aabb14 && Math.abs((r.aabb14[4] - r.aabb14[1]) - (r.aabb1[4] - r.aabb1[1]) * 1.4) < 1e-4,
    JSON.stringify(r.aabb1) + ' → ' + JSON.stringify(r.aabb14));
  ok('el AABB sigue anclado en el origen', r.aabb14 && r.aabb14[0] === r.aabb1[0] && r.aabb14[1] === r.aabb1[1] && r.aabb14[2] === r.aabb1[2]);

  console.log('\nEscala 0.5 (el enano)');
  ok('se sigue viendo', r.px05 > 100, r.px05 + ' px');
  ok('ocupa MENOS pantalla que a escala 1', r.px05 < r.px1 * 0.8, r.px1 + ' → ' + r.px05 + ' px');

  console.log('\nVolver a 1 no deja rastro (el camino de siempre no ha cambiado)');
  ok('mismo bulto en pantalla que al principio', Math.abs(r.px1bis - r.px1) <= 2, r.px1 + ' vs ' + r.px1bis);
  ok('mismo AABB', JSON.stringify(r.aabb1bis) === JSON.stringify(r.aabb1));

  console.log('\nEl bulto FÍSICO acompaña al bulto visible (si no, un gigante se atraviesa por los bordes)');
  ok('a escala 1 choca por dentro', r.dentro1 && r.dentro1.choca === true);
  ok('a escala 1 NO choca a 0.6 bloques (la pieza acaba en 0.5)', r.fuera1 && r.fuera1.choca === false);
  ok('a escala 1.4 sigue chocando por dentro', r.dentro14 && r.dentro14.choca === true);
  ok('a escala 1.4 SÍ choca a 0.6 bloques (ahora llega a 0.7)', r.fuera14 && r.fuera14.choca === true);
  ok('y ahí también se deja apuntar', r.fuera14 && r.fuera14.apunta === true);
  ok('y mcStructAt sabe de quién es ese voxel', r.fuera14 && r.fuera14.quien === true);
  ok('a escala 1 ese punto no era de nadie', r.fuera1 && r.fuera1.quien === false);

  console.log('\nHigiene');
  ok('sin error de GL', r.glErr === 0, 'gl.getError=' + r.glErr);
  ok('la sonda se retiró del mundo', r.limpio === true);
  ok('sin errores de página', errores.length === 0, errores.join(' | '));

  console.log('\n' + (fallos ? fallos + ' FALLO(S)' : 'TODO OK'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
