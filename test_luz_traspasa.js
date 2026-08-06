// Materiales que DEJAN PASAR LA LUZ DEL CIELO (`game.bloques.define(clave,{luz:'pasa'})`).
//
// El problema real del dueno: `leaves` estampada como BLOQUE se ve NEGRA por dentro, y la MISMA pieza estampada como
// estructura fina se ve iluminada. No es el mapa de sombras del sol, es el skylight: un bloque ocupa la celda 16³ y
// corta la difusion (mc.light=0 dentro → factor interiorDark^1 = x0,1), mientras que la estructura fina deja la celda
// como AIRE y la luz la cruza (mc.light=15 → x1).
//
// Lo que guarda este test:
//   §1  mc.traspasaLuz a null (lo normal) = EXACTAMENTE la luz de antes, celda a celda. Es el criterio de aceptacion.
//   §2  con luz:'pasa' la luz se difunde por dentro de la masa; sin el, el interior es 0.
//   §3  el dosel SIGUE dando sombra a lo que tiene debajo (no se abre la columna de cielo) — decision del dueno.
//   §4  mcRelightBox (incremental) coincide con mcComputeLight (global) tambien con bloques permeables.
//   §5  quitar() lo devuelve a opaco, y define() sobre un material que no esta en la paleta no revienta.
//   §6  lo que se VE: brillo medio de la pantalla con la camara metida dentro de la masa, antes y despues.
//
// No persiste nada: bloquea los POST y deja la rejilla como estaba.
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
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\/(mundo|habitantes|assets|agentes)/.test(url)) {
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return orig(u, o);
    };
  });

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.active && mc.grid', { timeout: 120000 });
  await p.waitForFunction('typeof game !== "undefined" && game.bloques && typeof game.bloques.define === "function"', { timeout: 60000 });
  await p.waitForTimeout(3000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const D = mc.dim, NX = D.x, NY = D.y, NZ = D.z;
    const idx = (x, y, z) => x + y * NX + z * NX * NY;

    // Un hueco de aire alto y despejado, lejos del jugador, donde montar la masa de hojas. Se busca una columna
    // con suelo para que el "debajo del dosel" de §3 sea terreno de verdad y no el vacio del borde.
    let bx = -1, bz = -1, sy = -1;
    for (let x = 8; x < NX - 8 && bx < 0; x += 3) for (let z = 8; z < NZ - 8; z += 3) {
      let top = -1;
      for (let y = NY - 1; y >= 0; y--) if (mc.grid[idx(x, y, z)]) { top = y; break; }
      if (top < 1 || top > NY - 14) continue;
      let libre = true;                                    // 7x7x12 de aire por encima
      for (let dx = -3; dx <= 3 && libre; dx++) for (let dz = -3; dz <= 3 && libre; dz++)
        for (let dy = 1; dy <= 12; dy++) if (mc.grid[idx(x + dx, top + dy, z + dz)]) { libre = false; break; }
      if (libre) { bx = x; bz = z; sy = top; break; }
    }
    if (bx < 0) { out.errs.push('no encuentro sitio despejado para la masa de hojas'); return out; }
    out.sitio = [bx, sy, bz];

    // Material de la masa. Usa el que ya haya en la paleta (id 1 sirve): lo que se prueba es el GANCHO por id,
    // no la textura. `mc.blockKey[id]` es la clave exacta que entiende game.bloques.define.
    const hojaId = 1;
    const hojaKey = mc.blockKey[hojaId];
    if (!hojaKey) { out.errs.push('la paleta no tiene el id 1'); return out; }
    out.hojaKey = hojaKey;

    const R = 3, ALTO = 6, y0 = sy + 3;                    // masa maciza 7x6x7, separada 3 del suelo (dosel)
    const previo = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) for (let dy = 0; dy < ALTO; dy++) {
      const i = idx(bx + dx, y0 + dy, bz + dz);
      previo.push([i, mc.grid[i]]);
      mc.grid[i] = hojaId;
    }
    const dentro = idx(bx, y0 + Math.floor(ALTO / 2), bz);          // corazon de la masa
    const debajo = idx(bx, sy + 1, bz);                             // aire justo encima del suelo, bajo el dosel
    const lejos = idx(bx + R + 4, y0 + 2, bz);                      // aire abierto de control, fuera de la masa

    // --- §1 · sin traspasaLuz, la luz es la de SIEMPRE ---------------------------------------------------------
    game.bloques.quitar(hojaKey);
    mcComputeLight();
    const base = mc.light.slice();
    out.opacoDentro = base[dentro];
    out.opacoDebajo = base[debajo];
    out.opacoLejos = base[lejos];
    out.ganchoNull = (mc.traspasaLuz === null || mc.traspasaLuz === undefined);
    mcComputeLight();                                               // dos veces seguidas = identico (determinista)
    out.repetible = mc.light.every((v, i) => v === base[i]);

    // --- §2 · con luz:'pasa', la luz entra en la masa ----------------------------------------------------------
    game.bloques.define(hojaKey, { luz: 'pasa' });
    out.ganchoPuesto = !!(mc.traspasaLuz && mc.traspasaLuz[hojaId] === 1);
    mcComputeLight();
    out.pasaDentro = mc.light[dentro];
    out.pasaDebajo = mc.light[debajo];
    out.pasaLejos = mc.light[lejos];

    // El aire de FUERA de la masa no puede haber perdido luz por esto (solo puede ganar o quedarse igual).
    let bajoFuera = 0;
    for (let i = 0; i < base.length; i++) if (mc.grid[i] === 0 && mc.light[i] < base[i]) bajoFuera++;
    out.aireQuePierdeLuz = bajoFuera;

    // --- §4 · el incremental coincide con el global ------------------------------------------------------------
    // Se toca un bloque dentro de la masa y se compara mcRelightBox contra un mcComputeLight completo.
    const tocado = idx(bx + 1, y0 + 1, bz + 1);
    mc.grid[tocado] = 0;
    mcRelightBox(bx + 1, bz + 1);
    const inc = mc.light.slice();
    mcComputeLight();
    let dif = 0, primera = null;
    for (let i = 0; i < inc.length; i++) if (inc[i] !== mc.light[i]) { dif++; if (primera === null) primera = i; }
    out.incrementalDif = dif;
    if (primera !== null) out.incrementalPrimera = [primera % NX, ((primera / NX) | 0) % NY, (primera / (NX * NY)) | 0, inc[primera], mc.light[primera]];
    mc.grid[tocado] = hojaId;

    // --- §5 · quitar() vuelve a opaco, y una clave desconocida no revienta --------------------------------------
    game.bloques.quitar(hojaKey);
    mcComputeLight();
    out.trasQuitarDentro = mc.light[dentro];
    out.trasQuitarIgualQueBase = mc.light.every((v, i) => v === base[i]);
    try {
      game.bloques.define('zz:material-que-no-existe', { luz: 'pasa' });
      out.claveDesconocidaOk = true;
    } catch (e) { out.claveDesconocidaOk = false; out.errs.push('define con clave desconocida lanzo: ' + e); }
    game.bloques.quitar('zz:material-que-no-existe');

    // --- §6 · lo que se VE: brillo medio con la camara DENTRO de la masa ----------------------------------------
    const gl = mc.gl, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const buf = new Uint8Array(W * H * 4);
    const brillo = () => {
      mcRender();                                                   // readPixels exige render en el MISMO evaluate
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let s = 0;
      for (let i = 0; i < buf.length; i += 4) s += (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
      return s / (W * H);
    };
    // Hay que meterse en un HUECO dentro de la masa, no en el macizo: las caras interiores de una masa maciza no se
    // mallan (el greedy solo emite la cara que da a aire), asi que desde dentro no se veria la masa sino el mundo de
    // fuera y la medida saldria identica. La foto #2 del dueno es justo esto: un hueco de aire rodeado de hojas,
    // cuya celda de aire tiene luz 0 y por eso las caras que lo miran se hornean negras.
    const HR = 1;                                                   // hueco 3x3x3 en el corazon de la masa
    const cy = y0 + Math.floor(ALTO / 2);
    for (let dx = -HR; dx <= HR; dx++) for (let dy = -HR; dy <= HR; dy++) for (let dz = -HR; dz <= HR; dz++)
      mc.grid[idx(bx + dx, cy + dy, bz + dz)] = 0;
    const hueco = idx(bx, cy, bz);

    const posPrev = mc.pos.slice(), yawPrev = mc.yaw, pitchPrev = mc.pitch;
    mc.pos[0] = bx + 0.5; mc.pos[1] = cy; mc.pos[2] = bz + 0.5;
    mc.yaw = 0; mc.pitch = 0;

    mcMeshAll();                                                    // opaco (quitar() ya lo dejo asi)
    out.huecoOpaco = mc.light[hueco];
    out.brilloOpaco = brillo();
    game.bloques.define(hojaKey, { luz: 'pasa' });
    mcMeshAll();
    out.huecoPasa = mc.light[hueco];
    out.brilloPasa = brillo();

    // --- §7 · el DEFECTO: un bloque de recorte deja pasar la luz sin declarar nada ------------------------------
    // El criterio es mc.recorte (lo hornea mcBuildPalette): la textura tiene agujeros = se ve a traves.
    game.bloques.quitar(hojaKey);
    out.recortes = [];
    for (let id = 1; id < mc.blockKey.length; id++)
      if (mc.recorte && mc.recorte[id]) out.recortes.push(mc.blockKey[id]);
    const recorteId = out.recortes.length ? mc.blockKey.indexOf(out.recortes[0]) : -1;
    out.hojaEsMaciza = !(mc.recorte && mc.recorte[hojaId]);   // el material de la masa NO es de recorte (control)

    if (recorteId > 0) {
      // Se rehace la masa con el material de recorte y NO se declara nada: tiene que salir iluminada sola.
      for (const [i] of previo) mc.grid[i] = recorteId;
      for (let dx = -HR; dx <= HR; dx++) for (let dy = -HR; dy <= HR; dy++) for (let dz = -HR; dz <= HR; dz++)
        mc.grid[idx(bx + dx, cy + dy, bz + dz)] = 0;
      mcComputeLight();
      out.defectoHueco = mc.light[hueco];
      out.defectoDebajo = mc.light[debajo];
      // …y `luz:'tapa'` tiene que poder devolverlo a opaco, que es la valvula de escape.
      game.bloques.define(out.recortes[0], { luz: 'tapa' });
      out.tapaEscrito = !!(mc.traspasaLuz && mc.traspasaLuz[recorteId] === 2);
      mcComputeLight();
      out.tapaHueco = mc.light[hueco];
      game.bloques.quitar(out.recortes[0]);
      mcComputeLight();
      out.trasQuitarTapaHueco = mc.light[hueco];
    }

    // Limpieza: material a opaco, rejilla como estaba, camara donde estaba.
    game.bloques.quitar(hojaKey);
    for (const [i, v] of previo) mc.grid[i] = v;
    mc.pos[0] = posPrev[0]; mc.pos[1] = posPrev[1]; mc.pos[2] = posPrev[2];
    mc.yaw = yawPrev; mc.pitch = pitchPrev;
    mcMeshAll();
    return out;
  });

  console.log('\nsitio de la masa (x,suelo,z):', r.sitio, ' material:', r.hojaKey, '\n');
  for (const e of r.errs || []) console.log('  FALLA  ' + e), fallos++;

  console.log('§1 · sin el gancho, nada cambia');
  ok('mc.traspasaLuz arranca a null (coste cero)', r.ganchoNull);
  ok('dentro de una masa de bloques la luz es 0', r.opacoDentro === 0, 'luz=' + r.opacoDentro);
  ok('el aire de control tiene luz plena', r.opacoLejos === 15, 'luz=' + r.opacoLejos);
  ok('mcComputeLight es determinista', r.repetible);

  console.log('\n§2 · con luz:"pasa" la luz entra');
  ok('el snippet escribe mc.traspasaLuz[id]=1', r.ganchoPuesto);
  ok('la luz se difunde DENTRO de la masa', r.pasaDentro > 0, 'luz=' + r.pasaDentro + ' (antes 0)');
  ok('ninguna celda de aire PIERDE luz', r.aireQuePierdeLuz === 0, r.aireQuePierdeLuz + ' celdas');

  console.log('\n§3 · el dosel sigue dando sombra (decision del dueno)');
  ok('bajo el dosel la luz NO es plena', r.pasaDebajo < 15, 'luz=' + r.pasaDebajo + ', al aire libre ' + r.pasaLejos);
  ok('el aire abierto sigue a 15', r.pasaLejos === 15, 'luz=' + r.pasaLejos);

  console.log('\n§4 · el incremental coincide con el global');
  ok('mcRelightBox == mcComputeLight con bloques permeables', r.incrementalDif === 0,
    r.incrementalDif + ' celdas distintas' + (r.incrementalPrimera ? ', 1a en ' + r.incrementalPrimera.slice(0, 3) + ' inc=' + r.incrementalPrimera[3] + ' glob=' + r.incrementalPrimera[4] : ''));

  console.log('\n§5 · se puede deshacer');
  ok('quitar() devuelve el interior a 0', r.trasQuitarDentro === 0, 'luz=' + r.trasQuitarDentro);
  ok('quitar() devuelve la luz EXACTA de §1', r.trasQuitarIgualQueBase);
  ok('define() sobre una clave que no esta en la paleta no revienta', r.claveDesconocidaOk);

  console.log('\n§6 · lo que se ve desde dentro (la foto #2 del dueno)');
  ok('el hueco rodeado de hojas estaba a oscuras', r.huecoOpaco === 0, 'luz=' + r.huecoOpaco);
  ok('con luz:"pasa" el hueco recibe luz', r.huecoPasa > 0, 'luz=' + r.huecoPasa);
  ok('las hojas se ven MAS CLARAS desde dentro', r.brilloPasa > r.brilloOpaco * 1.5,
    'brillo ' + r.brilloOpaco.toFixed(1) + ' -> ' + r.brilloPasa.toFixed(1));

  console.log('\n§7 · por defecto: si se ve a traves, la luz pasa');
  ok('el material de control NO es de recorte', r.hojaEsMaciza, r.hojaKey);
  ok('hay algun material de recorte en la paleta', (r.recortes || []).length > 0, (r.recortes || []).join(', '));
  if ((r.recortes || []).length) {
    ok('el hueco se ilumina SIN declarar nada', r.defectoHueco > 0, 'luz=' + r.defectoHueco);
    ok('…y aun asi el dosel sigue sombreando', r.defectoDebajo < 15, 'luz=' + r.defectoDebajo);
    ok('luz:"tapa" escribe el 2 en el gancho', r.tapaEscrito);
    ok('luz:"tapa" devuelve el hueco a oscuras', r.tapaHueco === 0, 'luz=' + r.tapaHueco);
    ok('quitar() vuelve al defecto (iluminado)', r.trasQuitarTapaHueco > 0, 'luz=' + r.trasQuitarTapaHueco);
  }

  ok('sin errores de pagina', errores.length === 0, errores.slice(0, 3).join(' | '));

  await b.close();
  console.log('\n' + (fallos ? fallos + ' FALLOS' : 'todo ok'));
  process.exit(fallos ? 1 : 0);
})();
