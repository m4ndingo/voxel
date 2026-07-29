// Dos bloques estampados que se TOCAN comparten plano: cada uno emite su propia cara ahi (mcStructGeom solo culla
// las caras internas de UNA estructura, porque `solid` sale de un solo doc). Las dos caras empatan en profundidad
// y, como las dos son estructura, las dos llevan el MISMO sesgo -> el sesgo no puede desempatarlas. De ahi la regla
// que dio el dueno: "un bloque que toca el suelo se ve bien, pero un bloque que toca otro bloque no".
//
// El arreglo es tirar la cara que da la espalda a la camara (CULL_FACE + frontFace(CW), porque las caras de
// MC_FACES estan enrolladas en horario vistas desde fuera). Este test comprueba las dos mitades:
//   1) SEGURIDAD: con el culling puesto no desaparece NINGUNA cara visible (si frontFace estuviera al reves,
//      se irian justo las de delante). Se mira un cubo suelto desde las 6 direcciones: pixel a pixel identico.
//   2) EFECTO: dos cubos de cristal pegados dejan de pintar la cara compartida dos veces.
//
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
  // Ningun test puede escribir el mundo del dueno: el autoguardado va por POST /api/mundo y aqui se corta en seco.
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
    const cubo = (clave, color) => {
      const voxels = {};
      for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) voxels[x + ',' + y + ',' + z] = color;
      roomDataCache.set(clave, Promise.resolve({ size: { x: 16, y: 16, z: 16 }, meta: { name: clave, type: 'bloque' }, voxels }));
    };
    cubo('zz-op', '#c8ccd0');      // opaco  -> pasada 1 (color por vertice)
    cubo('zz-rojo', '#ff000080');  // cristal rojo    -> pasada 3 (translucida)
    cubo('zz-azul', '#0000ff80');  // cristal azul    -> pasada 3

    const bx = Math.floor(mc.pos[0]), bz = Math.floor(mc.pos[2]);
    let sy = -1;
    for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(bx, y, bz)]) { sy = y; break; }
    out.suelo = sy;
    if (sy < 0) { out.errs.push('sin suelo bajo el jugador'); return out; }

    const gl = mc.gl, W = mc.canvas.width, H = mc.canvas.height;
    const LADO = 48, x0 = (W >> 1) - (LADO >> 1), y0 = (H >> 1) - (LADO >> 1);
    const leer = () => { const px = new Uint8Array(LADO * LADO * 4); mcRender(); gl.readPixels(x0, y0, LADO, LADO, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    const difieren = (a, c) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== c[i] || a[i + 1] !== c[i + 1] || a[i + 2] !== c[i + 2]) n++; return n; };
    const quitar = k => { const s = mc.structures.find(o => o.key === k); if (s) mcRemoveStruct(s, true); };
    // Coloca la camara a `dist` del centro, mirando hacia el (forward = [-sin(yaw)cp, sin(pitch), -cos(yaw)cp]).
    // mc.pos son los PIES: el ojo va en pos[1]+MC_EYE*mc.scale (mcViewMatrix), asi que hay que descontarlo o
    // el objetivo queda por debajo del centro del encuadre (era por que solo la vista cenital veia el cubo).
    const mirar = (cx, cy, cz, yaw, pitch, dist) => {
      const cp = Math.cos(pitch), f = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
      mc.yaw = yaw; mc.pitch = pitch;
      mc.pos[0] = cx - f[0] * dist;
      mc.pos[1] = cy - f[1] * dist - MC_EYE * mc.scale;
      mc.pos[2] = cz - f[2] * dist;
    };
    out.total = LADO * LADO;
    game.sunShade = 1;   // sin sombra proyectada: aisla lo que se mide (que caras se rasterizan)

    // ---- 1) SEGURIDAD: un cubo opaco suelto, desde las 6 direcciones, no cambia ni un pixel al cullar.
    //         Las caras traseras estaban ocultas por profundidad, asi que quitarlas no puede verse. Si el
    //         frontFace estuviera invertido se irian las DE DELANTE y esto se pondria rojo entero.
    // Alto de sobra: mirando desde abajo la camara baja ~dist, y a sy+5 se metia DENTRO del terreno.
    const cy = sy + 10;                      // flotando: se ve tambien la cara de abajo
    const C = [bx + 0.5, cy + 0.5, bz + 0.5];
    const VISTAS = [['+yaw0', 0, 0], ['+yaw90', Math.PI / 2, 0], ['+yaw180', Math.PI, 0],
                    ['+yaw270', -Math.PI / 2, 0], ['desde arriba', 0, -1.45], ['desde abajo', 0, 1.45]];
    // El fondo de cada encuadre ANTES de estampar: "se ve el cubo" = pixeles que cambian al ponerlo. Contar
    // pixeles grises no vale, cada cara lleva su propio sombreado (la de abajo es mucho mas oscura).
    const FONDOS = [];
    for (const [, yaw, pitch] of VISTAS) { mirar(C[0], C[1], C[2], yaw, pitch, 6); FONDOS.push(leer()); }

    await mcStampStruct('zz-op', bx, cy, bz, 0, true);
    out.vistas = [];
    VISTAS.forEach(([nom, yaw, pitch], i) => {
      mirar(C[0], C[1], C[2], yaw, pitch, 6);
      game.structCull = false; const SIN = leer();
      game.structCull = true;  const CON = leer();
      out.vistas.push({ nom, distintos: difieren(SIN, CON), visible: difieren(FONDOS[i], CON) });
    });
    quitar('zz-op');

    // ---- 2) EFECTO: dos cubos de cristal PEGADOS. Mirando de frente al plano que comparten, sin culling se
    //         mezclan 4 capas (cara externa e interna de cada uno); con culling solo las 2 que miran a la camara.
    //         Menos capas de tinte => el resultado se acerca al fondo. Eso demuestra que sobraba una cara.
    await mcStampStruct('zz-rojo', bx, cy, bz, 0, true);
    await mcStampStruct('zz-azul', bx + 1, cy, bz, 0, true);
    mirar(bx + 1.0, cy + 0.5, bz + 0.5, -Math.PI / 2, 0, 6);   // de frente al plano compartido (x = bx+1)

    game.structCull = true;  const G_CON = leer();
    game.structCull = false; const G_SIN = leer();
    // Fondo: el mismo encuadre sin cristales
    quitar('zz-rojo'); quitar('zz-azul');
    const FONDO = leer();
    const dist = (a, c) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - c[i]) + Math.abs(a[i + 1] - c[i + 1]) + Math.abs(a[i + 2] - c[i + 2]); return s / (a.length / 4); };
    out.cristalCambia = difieren(G_SIN, G_CON);
    out.dCon = +dist(G_CON, FONDO).toFixed(2);
    out.dSin = +dist(G_SIN, FONDO).toFixed(2);

    // ---- 3) El estado GL no se filtra: la pasada del sol y la del terreno necesitan ver TODAS las caras.
    out.cullActivo = gl.isEnabled(gl.CULL_FACE);
    out.frontFace = gl.getParameter(gl.FRONT_FACE) === gl.CCW;

    // ---- limpieza
    for (const k of ['zz-op', 'zz-rojo', 'zz-azul']) { roomDataCache.delete(k); delete mc.structs[k]; }
    game.sunShade = 0.55; game.structCull = true;
    out.limpio = !mc.structures.some(o => /^zz-/.test(o.key));
    return out;
  });

  if (r.errs && r.errs.length) r.errs.forEach(e => ok('preparacion: ' + e, false));
  console.log('\nSeguridad · el culling no puede quitar una cara visible (suelo y=' + r.suelo + ', parche ' + r.total + ' px)');
  for (const v of (r.vistas || [])) {
    ok('cubo opaco identico ' + v.nom, v.distintos === 0 && v.visible > 200,
      v.distintos + ' px distintos, ' + v.visible + ' px de cubo');
  }

  console.log('\nEfecto · dos cristales pegados dejan de pintar la cara compartida dos veces');
  ok('el culling cambia lo que se ve entre los dos cubos', r.cristalCambia > 0, r.cristalCambia + '/' + r.total + ' px');
  ok('con culling se tinta MENOS (una capa menos, no dos caras en el mismo plano)',
    r.dCon < r.dSin, 'distancia al fondo: con=' + r.dCon + ' sin=' + r.dSin);

  console.log('\nEstado GL');
  ok('CULL_FACE no queda activo al acabar el frame', r.cullActivo === false);
  ok('frontFace vuelve a CCW (el resto del render lo da por hecho)', r.frontFace === true);
  ok('limpieza: los cubos de prueba se retiran', r.limpio === true);
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\n' + '13 ok, 0 fallos');
  process.exit(fallos ? 1 : 0);
})();
