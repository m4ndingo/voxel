// @area: general
// @necesita: servidor, playwright
// test_navegador.js — lo unico que prueba de verdad que los shaders COMPILAN.
//
// Los demas tests (test_shadow_map.js) leen el GLSL de app.js y comprueban el algoritmo en JS: son utiles,
// pero no compilan una sola linea de GLSL. El fallo real de la primera version del mapa de sombra
// ("'dFdx' : no matching overloaded function found" en WebGL2) paso los 18 tests y dejo la pantalla en negro.
//
// Aqui se abre el Mundo en un Chromium de verdad (WebGL sobre SwiftShader) y se mira la consola.
//
//   npm i -D playwright@1.47.2 && npx playwright install chromium     (ya hecho en esta maquina)
//   node test_navegador.js [url]        por defecto http://localhost:8500/map/agents
//
// Ojo: SwiftShader es software puro, asi que los fps de aqui NO valen para nada. El rendimiento se mide
// en el navegador del dueño y con DevTools CERRADO.

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/agents';
let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [], avisos = [];
  p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); if (m.type() === 'warning') avisos.push(m.text()); });
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));

  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog', { timeout: 120000 });
  await p.waitForTimeout(4000);   // unos cuantos frames: el mapa de sombra se dibuja en el primer render

  const info = await p.evaluate(() => ({
    gl2: !!mc.gl2, deriv: !!mc.deriv, sunShade: mc.sunShade, shadowSize: mc.shadowSize,
    tieneMapa: !!(mc.shadow && mc.shadow.tex), sombraSize: mc.shadow ? mc.shadow.size : 0,
    chunks: mc.chunks ? Object.keys(mc.chunks).length : 0,
    // Pixel del centro del lienzo. Hay que redibujar AQUI MISMO: una vez el navegador compone el frame, el
    // contenido del framebuffer por defecto queda indefinido (sale 0,0,0) porque no hay preserveDrawingBuffer.
    centro: (() => {
      mcRender();
      const gl = mc.gl, w = mc.canvas.width, h = mc.canvas.height, px = new Uint8Array(4);
      gl.readPixels((w / 2) | 0, (h / 2) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return [px[0], px[1], px[2]];
    })(),
    cielo: [Math.round(MC_SKY[0] * 255), Math.round(MC_SKY[1] * 255), Math.round(MC_SKY[2] * 255)],
  }));

  const glsl = errores.filter(t => /shader|program|GLSL|compil/i.test(t));

  console.log('\n--- ' + URL + ' ---');
  console.log('  WebGL2=' + info.gl2 + '  derivadas=' + info.deriv + '  sunShade=' + info.sunShade +
              '  shadowSize=' + info.shadowSize + '/' + info.sombraSize + '  chunks=' + info.chunks);
  console.log('  pixel central=' + info.centro.join(',') + '   (cielo=' + info.cielo.join(',') + ')\n');

  test('los shaders compilan y linkan (ni un error de shader/program en consola)', () => {
    assert(glsl.length === 0, glsl.length + ' errores de GLSL, el primero:\n        ' + (glsl[0] || '').split('\n').slice(0, 6).join('\n        '));
  });
  test('no hay ninguna otra excepcion en la consola', () => {
    const otros = errores.filter(t => !glsl.includes(t));
    assert(otros.length === 0, otros.slice(0, 3).join(' | ').slice(0, 400));
  });
  test('hay derivadas, o sea sombra de sol (si esto falla en una GPU real es que el driver es de museo)', () => {
    assert(info.deriv, 'mc.deriv=false: sunFactor compila a return 1.0 y no hay sombra');
  });
  test('el mapa de sombra se ha creado', () => {
    assert(info.tieneMapa, 'no hay textura de sombra (mc.sun.tex)');
  });
  test('el Mundo se dibuja: el centro del lienzo NO es el color de fondo', () => {
    const d = Math.abs(info.centro[0] - info.cielo[0]) + Math.abs(info.centro[1] - info.cielo[1]) + Math.abs(info.centro[2] - info.cielo[2]);
    assert(d > 12, 'el centro es el cielo (' + info.centro.join(',') + '): o no hay nada delante, o el shader no pinta');
  });

  // Lo de arriba prueba que compila; esto prueba que el mapa de sombra CONTIENE la geometria. Se pone una
  // losa flotante en una columna, se lee el texel de esa columna y se comprueba que la altura guardada sube.
  // Se escribe con mcSetBlock+mcMeshChunk a pelo (nada de mcSetVoxel) para NO tocar el mundo del disco:
  // no se programa guardado y al final se deshace.
  const losa = await p.evaluate(() => {
    const X = (mc.dim.x / 2) | 0, Z = (mc.dim.z / 2) | 0, ALTO = mc.dim.y - 4;
    const S = mc.shadow, gl = mc.gl, size = S.size;
    // mismo encuadre que mcSunFrustum: el mapa cubre el mundo MAS un margen (MC_SUN_MARGIN)
    const M = MC_SUN_MARGIN, org = [-M, -1, -M];
    const span = [mc.dim.x + 2 * M, mc.dim.y + 2 + M, mc.dim.z + 2 * M];
    const tex = (v, e) => Math.min(size - 1, Math.max(0, Math.floor((v + 0.5 - org[e]) / span[e] * size)));
    const px = tex(X, 0), pz = tex(Z, 2);
    const leer = () => {
      mcShadowDirty(); mcRenderShadow();
      gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo);
      const b = new Uint8Array(4); gl.readPixels(px, pz, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return (b[0] / 255 + b[1] / 255 / 255) * span[1] + org[1];   // el mismo desempaquetado que sunFactor
    };
    const antes = leer();
    const previo = mc.grid[mcIdx(X, ALTO, Z)];
    mcSetBlock(X, ALTO, Z, 1);
    mcMeshChunk((X / MC_CHUNK) | 0, (Z / MC_CHUNK) | 0);
    const conLosa = leer();
    mcSetBlock(X, ALTO, Z, previo);                                   // se deshace: el mundo del disco no se ha tocado
    mcMeshChunk((X / MC_CHUNK) | 0, (Z / MC_CHUNK) | 0);
    const despues = leer();
    return { antes, conLosa, despues, ALTO, dimY: mc.dim.y };
  });
  console.log('  altura en el mapa de sombra: sin losa=' + losa.antes.toFixed(2) +
              '  con losa a y=' + losa.ALTO + ' → ' + losa.conLosa.toFixed(2) +
              '  al quitarla=' + losa.despues.toFixed(2) + '\n');

  test('la pasada del sol mete la geometria en el mapa: una losa flotante sube la altura de su columna', () => {
    assert(losa.conLosa > losa.antes + 1, 'la losa a y=' + losa.ALTO + ' no cambio el mapa (' +
      losa.antes.toFixed(2) + ' → ' + losa.conLosa.toFixed(2) + ')');
    assert(Math.abs(losa.conLosa - (losa.ALTO + 1)) < 0.05, 'la altura guardada (' + losa.conLosa.toFixed(3) +
      ') no es la cara de arriba de la losa (' + (losa.ALTO + 1) + '): el empaquetado de 16 bits o la proyeccion estan mal');
  });
  test('el mapa vuelve a su sitio al quitar la losa (no se queda pegado)', () => {
    assert(Math.abs(losa.despues - losa.antes) < 0.05, losa.antes.toFixed(2) + ' → ' + losa.despues.toFixed(2));
  });

  // Y esto es LA prueba: que el suelo que queda bajo un techo se ve mas oscuro EN PANTALLA. Se pone un techo
  // sobre el jugador, se mira al suelo y se compara el mismo pixel con la sombra apagada (sunShade=1) y puesta.
  const vista = await p.evaluate(() => {
    const gl = mc.gl, w = mc.canvas.width, h = mc.canvas.height;
    const X = Math.round(mc.pos[0]), Z = Math.round(mc.pos[2]), Y = Math.round(mc.pos[1]) + 5;
    const pitch0 = mc.pitch, shade0 = mc.sunShade, previos = [];
    const centro = () => {
      mcShadowDirty(); mcRender();
      const px = new Uint8Array(4); gl.readPixels((w / 2) | 0, (h / 2) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return [px[0], px[1], px[2]];
    };
    mc.pitch = -1.4;                                        // mirando casi a los pies
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const x = X + dx, z = Z + dz; if (!mcInside(x, Y, z)) continue;
      previos.push([x, z, mc.grid[mcIdx(x, Y, z)]]); mcSetBlock(x, Y, z, 1);
    }
    for (let cx = ((X - 3) / MC_CHUNK) | 0; cx <= ((X + 3) / MC_CHUNK) | 0; cx++)
      for (let cz = ((Z - 3) / MC_CHUNK) | 0; cz <= ((Z + 3) / MC_CHUNK) | 0; cz++) mcMeshChunk(cx, cz);
    mc.sunShade = 1;   const alSol = centro();              // sombra apagada
    mc.sunShade = 0.55; const enSombra = centro();          // sombra puesta
    for (const [x, z, prev] of previos) mcSetBlock(x, Y, z, prev);   // se deshace: el disco no se toca
    for (let cx = ((X - 3) / MC_CHUNK) | 0; cx <= ((X + 3) / MC_CHUNK) | 0; cx++)
      for (let cz = ((Z - 3) / MC_CHUNK) | 0; cz <= ((Z + 3) / MC_CHUNK) | 0; cz++) mcMeshChunk(cx, cz);
    mc.pitch = pitch0; mc.sunShade = shade0; mcShadowDirty();
    return { alSol, enSombra, techo: Y, celdas: previos.length };
  });
  const lum = c => (c[0] + c[1] + c[2]) / 3;
  console.log('  suelo bajo un techo de ' + vista.celdas + ' bloques (y=' + vista.techo + '): al sol ' +
              vista.alSol.join(',') + ' → en sombra ' + vista.enSombra.join(',') +
              '   (x' + (lum(vista.enSombra) / Math.max(1, lum(vista.alSol))).toFixed(2) + ')\n');

  test('EN PANTALLA: el suelo bajo un techo sale mas oscuro que sin sombra', () => {
    assert(lum(vista.enSombra) < lum(vista.alSol) * 0.95,
      'no se oscurecio nada: ' + vista.alSol.join(',') + ' → ' + vista.enSombra.join(','));
  });
  test('la sombra no se pasa: oscurece, no pinta negro', () => {
    assert(lum(vista.enSombra) > lum(vista.alSol) * 0.35,
      'demasiado oscuro (' + vista.enSombra.join(',') + '): sunShade=0.55 no puede bajar de eso');
  });

  // Un cuerpo que se desliza entre celdas (la nube) tiene que arrastrar su sombra. Se comprobaba solo al
  // mallar, y la malla a escala de la libreria de agentes se construye por su cuenta sin pasar por el
  // mcAgentMesh de app.js: la sombra se quedaba clavada donde estuvo la nube y solo saltaba al poner un bloque.
  const mueve = await p.evaluate(() => {
    const a = game.defineAgent({ id: '__test_sombra', name: 'test', block: 'stone', autostart: false, onTick() {} });
    if (!a) return { error: 'game.defineAgent devolvio null' };
    for (let i = 0; i < 4; i++) mcAgentsSmoothUpdate(0.016);   // el cuerpo se asienta (el material se resuelve tarde)
    mc.shadow.dirty = false; mc.shadow.moved = false;
    mcAgentsSmoothUpdate(0.016);                 // quieto ⇒ el mapa se reutiliza
    const quieto = mc.shadow.dirty || mc.shadow.moved;
    a.x += 4;                                    // ahora hay destino: el cuerpo se desliza hacia el
    mcAgentsSmoothUpdate(0.016);
    const moviendo = mc.shadow.moved;
    // Y no basta con que se marque: tiene que acabar rehorneandose de verdad. Con el freno a 0 eso es inmediato.
    const freno = mc.shadowMoveMs; mc.shadowMoveMs = 0;
    mc.shadow.lastBake = 0;
    mcRenderShadow();
    const horneado = mc.shadow.lastBake > 0;
    mc.shadowMoveMs = freno;
    game.removeAgent('__test_sombra');
    return { quieto, moviendo, horneado };
  });

  test('un cuerpo que se desliza entre celdas caduca el mapa de sombra', () => {
    assert(!mueve.error, mueve.error);
    // Andar marca `moved` (via lenta, estrangulada a mc.shadowMoveMs) en vez de `dirty`: rehacer el mapa entero en
    // cada frame porque alguien da un paso costaba ~20 ms/frame. Ver test_sombra_movil.js.
    assert(mueve.moviendo === true, 'el agente se movio y el mapa no se marco: la sombra se queda clavada');
    assert(mueve.horneado === true, 'se marco el movimiento pero el mapa no llego a rehornearse nunca');
  });
  test('...y si no se mueve nadie, el mapa se reutiliza (la sombra sigue siendo gratis en escena quieta)', () => {
    assert(mueve.quieto === false, 'el mapa se rehace cada frame sin que se mueva nada');
  });

  // Rayos-X dibuja ahora el rayo de apuntado (segmento magenta + cubo en el impacto + celda que lo para +
  // celda donde iria el bloque). Eso es un camino de dibujo nuevo, con LINES y sin test de profundidad:
  // aqui se comprueba que no revienta en un GL de verdad y que mcRayoInfo cuadra con mcRaycast.
  const rayo = await p.evaluate(() => {
    const errs = [];
    const antes = mc.xray;
    try {
      mc.xray = true;
      mcUpdatePreview();                       // construye y sube la geometria del overlay
      const r = mcRayoInfo();
      const hit = mcRaycast(mcReach(), true);
      const fijo = game.rayoFijo();            // congela
      mcUpdatePreview();                       // y se vuelve a dibujar, ahora con el rayo fijo
      const habiaFijo = !!mc.rayFijo;
      game.rayoFijo();                         // suelta
      const suelto = !mc.rayFijo;
      return { errs, hayRayo: !!r, coincide: !!r && !!hit && r.cell != null &&
               r.cell.join() === hit.cell.join(), habiaFijo, suelto, glErr: mc.gl.getError(),
               place: r && r.place, cell: r && r.cell, normal: hit && hit.normal, fijoDevuelve: !!fijo };
    } catch (e) { errs.push(e.message); return { errs }; }
    finally { mc.xray = antes; mc.rayFijo = null; }
  });

  test('rayos-X dibuja el rayo de apuntado sin reventar', () => {
    assert(rayo.errs.length === 0, 'excepcion: ' + rayo.errs[0]);
    assert(rayo.glErr === 0, 'gl.getError()=' + rayo.glErr + ' tras dibujar el rayo');
  });
  test('mcRayoInfo coincide con mcRaycast y sabe donde iria el bloque', () => {
    assert(rayo.hayRayo, 'mcRayoInfo devolvio null dentro del Mundo');
    if (rayo.cell) {
      assert(rayo.coincide, 'mcRayoInfo y mcRaycast no golpean la misma celda');
      // place = cell + normal: la celda pegada a la cara golpeada, que es donde cae el bloque nuevo.
      assert(rayo.place.every((v, i) => v === rayo.cell[i] + rayo.normal[i]),
        'place=' + rayo.place + ' no es cell+normal (' + rayo.cell + ' + ' + rayo.normal + ')');
    }
  });
  test('game.rayoFijo() congela el rayo y vuelve a soltarlo', () => {
    assert(rayo.habiaFijo === true, 'game.rayoFijo() no dejo mc.rayFijo puesto');
    assert(rayo.suelto === true, 'la segunda llamada no solto el rayo');
  });

  // Segunda pasada: el MISMO fuente compilado como ESSL 1.00. En WebGL1 las derivadas van por extension y la
  // directiva tiene que ser la primera linea; es un camino distinto de mcGLSL y hay que compilarlo tambien.
  const p1 = await b.newPage();
  const errores1 = [];
  p1.on('console', m => { if (m.type() === 'error') errores1.push(m.text()); });
  p1.on('pageerror', e => errores1.push('EXCEPCION ' + e.message));
  await p1.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, o) { return t === 'webgl2' ? null : orig.call(this, t, o); };
  });
  await p1.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p1.waitForFunction('typeof mc !== "undefined" && mc.prog', { timeout: 120000 });
  await p1.waitForTimeout(3000);
  const info1 = await p1.evaluate(() => ({ gl2: !!mc.gl2, deriv: !!mc.deriv, mapa: !!(mc.shadow && mc.shadow.tex) }));
  const glsl1 = errores1.filter(t => /shader|program|GLSL|compil/i.test(t));
  console.log('  [WebGL1 forzado] gl2=' + info1.gl2 + '  derivadas=' + info1.deriv + '  mapa=' + info1.mapa + '\n');

  test('en WebGL1 (ESSL 1.00 + OES_standard_derivatives) tambien compila', () => {
    assert(!info1.gl2, 'no se forzo WebGL1');
    assert(glsl1.length === 0, glsl1.length + ' errores de GLSL:\n        ' + (glsl1[0] || '').split('\n').slice(0, 6).join('\n        '));
    assert(info1.deriv && info1.mapa, 'sin derivadas o sin mapa de sombra en WebGL1');
  });

  await b.close();
  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('no se pudo ejecutar:', e.message.split('\n')[0]); process.exit(1); });