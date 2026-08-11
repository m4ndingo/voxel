// @area: general
// @necesita: servidor, playwright
// test_giro_navegador.js — la matriz de modelo por instancia (s.model), en un navegador de verdad.
//
// Esto NO se puede probar headless. test_bloques_comportamiento.js comprueba que el snippet CALCULA
// bien la matriz (angulos, limites, pivote), pero la matriz no sirve de nada si app.js no la mete en
// el shader o si el frustum borra la pieza al girarla. Aqui se abre el Mundo en Chromium (WebGL sobre
// SwiftShader), se toca s.model y se miran los pixeles.
//
//   node test_giro_navegador.js [url]        por defecto http://localhost:8500/map/agents
//
// El POST a /api/mundo se bloquea: el mundo del dueno no se toca (todo lo que se cambia aqui vive en
// memoria y se restaura).

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
  const errores = [];
  p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  // El mundo del dueno no se guarda pase lo que pase (misma guarda que test_navegador.js).
  await p.addInitScript(() => {
    const f = window.fetch;
    window.fetch = (u, o) => (o && String(o.method).toUpperCase() === 'POST' && String(u).includes('/api/mundo'))
      ? Promise.resolve(new Response('{"bloqueado":true}')) : f(u, o);
  });

  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.structures', { timeout: 120000 });
  await p.waitForTimeout(4000);

  const r = await p.evaluate(() => {
    // Huella de la imagen: hay que redibujar en el MISMO evaluate, porque una vez compuesto el frame
    // el framebuffer por defecto queda indefinido (no hay preserveDrawingBuffer).
    const huella = () => {
      mcRender();
      const gl = mc.gl, w = mc.canvas.width, h = mc.canvas.height;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) { s = (s * 31 + px[i] + px[i + 1] * 3 + px[i + 2] * 7) | 0; n += px[i]; }
      return { hash: s, suma: n };
    };
    const ident = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

    // Se busca una estructura y se planta la camara delante mirandola de frente (yaw=0 mira a -Z,
    // app.js:5061), a la altura de su centro.
    const ests = mc.structures.filter(s => s.aabb && (s.colCount || s.texCount || s.alphaCount));
    if (!ests.length) return { sinEstructuras: true, total: mc.structures.length };
    let elegida = null, base = null, oculta = null;
    for (const s of ests) {
      const a = s.aabb, cx = (a[0] + a[3]) / 2, cy = (a[1] + a[4]) / 2, cz = (a[2] + a[5]) / 2;
      mc.pos[0] = cx; mc.pos[1] = cy - 1.0; mc.pos[2] = cz + 4;
      mc.yaw = 0; mc.pitch = 0;
      const con = huella();
      // "¿Se ve?" = apagarla cambia la imagen. Es la unica forma honesta de saber que la tengo en
      // pantalla: si no la veo, comparar antes/despues del giro no demostraria nada.
      const cc = s.colCount, tc = s.texCount, ac = s.alphaCount;
      s.colCount = s.texCount = s.alphaCount = 0;
      const sin = huella();
      s.colCount = cc; s.texCount = tc; s.alphaCount = ac;
      if (sin.hash !== con.hash) { elegida = s; base = con; oculta = sin; break; }
    }
    if (!elegida) return { noVisible: true, probadas: ests.length };

    const a = elegida.aabb;
    const c = [(a[0] + a[3]) / 2, (a[1] + a[4]) / 2, (a[2] + a[5]) / 2];

    // 1) La identidad tiene que dar EXACTAMENTE la imagen de siempre: si no, poner el uniform ya
    //    estaria cambiando el dibujo de todo el mundo que no gira.
    elegida.model = ident();
    const conIdent = huella();

    // 2) Una traslacion tiene que MOVER la pieza: es lo que demuestra que uModel llega al shader y no
    //    se queda en una variable que nadie lee.
    const m = ident(); m[12] = 0; m[13] = 40; m[14] = 0;   // 40 bloques hacia arriba: se va de la vista
    elegida.model = m;
    const movida = huella();

    // 3) Un giro de un cuarto de vuelta alrededor de su centro tambien tiene que cambiar la imagen.
    const g = ident(), ang = Math.PI / 2, cg = Math.cos(ang), sg = Math.sin(ang);
    g[0] = cg; g[2] = sg; g[8] = -sg; g[10] = cg;
    g[12] = c[0] - (g[0] * c[0] + g[8] * c[2]);
    g[14] = c[2] - (g[2] * c[0] + g[10] * c[2]);
    elegida.model = g;
    const girada = huella();

    // 4) Culling: la caja de una pieza girada no cabe en su aabb sin girar, asi que hay que inflarla o
    //    el frustum la borra al asomar por el borde. Se compara la decision de mcChunkVisible (la caja
    //    cruda) con la de mcStructVisible (la caja inflada) sobre el MISMO visor que usa el dibujo.
    const pv = mat4.mul(mcProjMatrix().m, mcViewMatrix());
    // Se barre hacia el lateral hasta dar con la distancia donde la caja CRUDA ya se salio del visor:
    // ahi es donde la inflada tiene que seguir diciendo que si, y es el unico sitio donde la prueba
    // distingue una cosa de la otra (mas cerca las dos dicen si, mas lejos las dos dicen no).
    let cullOK = { encontrado: false };
    for (let d = 2; d < 60; d += 0.25) {
      const falsa = { aabb: [c[0] + d, c[1] - 3, c[2] - 3, c[0] + d + 6, c[1] + 3, c[2] + 3], model: null };
      const cruda = mcChunkVisible(falsa, pv);
      // El giro es alrededor del centro de la PROPIA caja, que es el contrato del snippet: si se gira
      // sobre un punto ajeno la pieza orbita y entonces la caja inflada apunta a otro sitio.
      const gp = new Float32Array(g), fx = c[0] + d + 3, fz = c[2];
      gp[12] = fx - (gp[0] * fx + gp[8] * fz);
      gp[14] = fz - (gp[2] * fx + gp[10] * fz);
      falsa.model = gp;
      const inflada = mcStructVisible(falsa, pv);
      if (!cruda) { cullOK = { encontrado: true, d, cruda, inflada }; break; }
    }

    elegida.model = null;
    const restaurada = huella();

    return {
      clave: elegida.key, celda: [elegida.ox, elegida.oy, elegida.oz],
      base, oculta, conIdent, movida, girada, restaurada, cullOK
    };
  });

  const glsl = errores.filter(t => /shader|program|GLSL|compil/i.test(t));

  console.log('\n--- ' + URL + ' ---');
  if (r.sinEstructuras) { console.log('  el mundo no tiene ninguna estructura dibujable (' + r.total + ' en total): no hay nada que girar'); await b.close(); process.exit(1); }
  if (r.noVisible) { console.log('  ninguna de las ' + r.probadas + ' estructuras se pudo poner en pantalla'); await b.close(); process.exit(1); }
  console.log('  pieza: ' + r.clave + ' en ' + r.celda.join(',')
    + (r.cullOK.encontrado ? '   ·  la caja cruda sale del visor a ' + r.cullOK.d + ' bloques de lado' : '') + '\n');

  test('no hay ni un error de GLSL con uModel en los dos programas de estructura', () => {
    assert(glsl.length === 0, glsl.length + ' errores: ' + (glsl[0] || '').split('\n')[0]);
  });
  test('sin matriz, la pieza se ve (apagarla cambia la imagen)', () => {
    assert(r.base.hash !== r.oculta.hash, 'la imagen no cambia al apagar la pieza: no la tengo en pantalla');
  });
  test('la IDENTIDAD dibuja exactamente lo mismo que no poner matriz', () => {
    assert(r.conIdent.hash === r.base.hash, 'poner la identidad ya cambia el dibujo (hash ' + r.conIdent.hash + ' vs ' + r.base.hash + ')');
  });
  test('uModel llega al shader: una traslacion mueve la pieza de sitio', () => {
    assert(r.movida.hash !== r.base.hash, 'trasladar 40 bloques no cambia un solo pixel: el uniform no se esta usando');
  });
  test('un cuarto de vuelta cambia el dibujo (el giro se ve)', () => {
    assert(r.girada.hash !== r.base.hash, 'girar 90° no cambia la imagen');
  });
  test('quitar la matriz devuelve la pieza a su sitio (no se queda pegada)', () => {
    assert(r.restaurada.hash === r.base.hash, 'tras poner model=null la imagen no vuelve a ser la de partida');
  });
  test('el culling infla la caja de una pieza girada en vez de borrarla', () => {
    assert(r.cullOK.encontrado, 'no se encontro ninguna distancia donde la caja cruda salga del visor');
    assert(r.cullOK.cruda === false && r.cullOK.inflada === true,
      'a ' + r.cullOK.d + ' bloques la caja cruda dice ' + r.cullOK.cruda + ' y la inflada ' + r.cullOK.inflada
      + ': la inflada tenia que seguir dibujando la pieza girada');
  });

  console.log('\n' + (fallos ? fallos + ' fallo(s)' : ok + ' ok, 0 fallos'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('no se pudo ejecutar:', e.message.split('\n')[0]); process.exit(1); });