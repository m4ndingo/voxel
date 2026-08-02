// test_esqueleto_navegador.js — un agente articulado (el zombie) en un navegador de verdad.
//
// test_bloques_comportamiento.js §17 prueba que el motor CALCULA bien el esqueleto (cuerpo rigido,
// vaiven por distancia, giro, colision), pero sobre un mundo de juguete: ahi no hay ni shaders ni
// mundo.json. Lo que solo se puede comprobar aqui es lo que pasa cuando el rig se junta con app.js:
//
//   · que las 6 piezas SE DIBUJAN (pixeles, no `mc.structures.length`);
//   · que sus matrices llegan al shader (moverlas mueve la imagen);
//   · que NO entran en mcSerialize() — o sea, que un guardado no las dejaria clavadas en mundo.json;
//   · que plantar un zombie no dispara ningun guardado;
//   · que quitar() devuelve el mundo pixel a pixel a como estaba.
//
//   node test_esqueleto_navegador.js [url]        por defecto http://localhost:8500/map/agents
//
// Se ejecuta el SNIPPET DE VERDAD (data/snippets/agente-zombie.json, servido por /api/snippets), no
// una copia. Los POST a /api/mundo y /api/habitantes se bloquean: el mundo del dueno no se toca.

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/agents';
let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok    ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [], escrituras = [];
  p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  // Cinturón de red: aunque el codigo intentara guardar, no sale nada de aqui.
  p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const escribe = o && String(o.method).toUpperCase() !== 'GET';
      if (escribe && (String(u).includes('/api/mundo') || String(u).includes('/api/habitantes'))) {
        (window.__bloqueados = window.__bloqueados || []).push(String(u));
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      return orig(u, o);
    };
  });

  await p.goto(URL, { timeout: 60000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.structures', { timeout: 120000 });
  await p.waitForFunction('window.game && game.esqueletos && game.esqueletos.crear', { timeout: 60000 });
  await p.waitForTimeout(3000);

  // 1) Se planta el zombie ejecutando su snippet tal cual, con los contadores de guardado puestos ANTES.
  const plantado = await p.evaluate(async () => {
    window.__guardados = 0; window.__programados = 0;
    const save = window.mcSaveWorld, sched = window.mcScheduleSave;
    window.mcSaveWorld = function () { window.__guardados++; return Promise.resolve(); };
    window.mcScheduleSave = function () { window.__programados++; };
    window.__restaurarGuardado = () => { window.mcSaveWorld = save; window.mcScheduleSave = sched; };

    const antes = {
      estructuras: mc.structures.length,
      serial: mcSerialize().structures.length,
      voxels: Object.keys(mcSerialize().voxels).length
    };
    const r = await fetch('/api/snippets/agente-zombie');
    if (!r.ok) return { sinSnippet: true, estado: r.status };
    const doc = await r.json();
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    try { await new AsyncFunction(doc.code)(); }
    catch (e) { return { reventado: String(e && e.message || e) }; }
    // El snippet estampa por red: se espera a que el rig tenga sus 6 piezas.
    for (let i = 0; i < 200 && !(game.esqueletos._vivos[0] && game.esqueletos._vivos[0].partes.every(P => P.s)); i++)
      await new Promise(res => setTimeout(res, 50));
    const rig = game.esqueletos._vivos[0];
    if (!rig) return { sinRig: true };
    return {
      antes, piezas: rig.partes.length,
      claves: rig.partes.map(P => P.clave),
      conS: rig.partes.filter(P => !!P.s).length,
      efimeras: rig.partes.filter(P => P.s && P.s.efimera).length,
      dibujables: rig.partes.filter(P => P.s && (P.s.colCount || P.s.texCount || P.s.alphaCount)).length,
      despues: { estructuras: mc.structures.length, serial: mcSerialize().structures.length,
                 voxels: Object.keys(mcSerialize().voxels).length }
    };
  });

  if (plantado.sinSnippet) { console.log('  no se pudo leer /api/snippets/agente-zombie (' + plantado.estado + ')'); await b.close(); process.exit(1); }
  if (plantado.reventado) { console.log('  el snippet del zombie revento: ' + plantado.reventado); await b.close(); process.exit(1); }
  if (plantado.sinRig) { console.log('  el snippet no dejo ningun agente vivo'); await b.close(); process.exit(1); }

  // Un respiro con el tick VIVO antes de congelarlo: las matrices las escribe el paso del rig, y las
  // piezas acaban de estamparse (mcRestampAll las sustituye por objetos nuevos, sin s.model). Congelando
  // aqui mismo se fotografiaria el unico instante en que el esqueleto todavia no ha compuesto nada.
  await p.waitForTimeout(1500);

  // 2) Los pixeles. Se CONGELA el tick (mcUpdate a no-op) para que dos renders seguidos den lo mismo:
  //    con el bucle vivo el zombie te persigue entre huella y huella y ningun hash seria comparable.
  const pintado = await p.evaluate(() => {
    const orig = window.mcUpdate;
    window.mcUpdate = function () {};
    try {
      const huella = () => {
        mcRender();
        const gl = mc.gl, w = mc.canvas.width, h = mc.canvas.height;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let s = 0;
        for (let i = 0; i < px.length; i += 4) s = (s * 31 + px[i] + px[i + 1] * 3 + px[i + 2] * 7) | 0;
        return s;
      };
      const rig = game.esqueletos._vivos[0], R = rig.partes[0], g = R.s._sig;
      const a = R.s.aabb;
      const c = [(a[0] + a[3]) / 2 + g.x, (a[1] + a[4]) / 2 + g.y, (a[2] + a[5]) / 2 + g.z];
      const cuentas = rig.partes.map(P => [P.s.colCount, P.s.texCount, P.s.alphaCount]);
      const apagar = (on) => rig.partes.forEach((P, i) => {
        P.s.colCount = on ? cuentas[i][0] : 0;
        P.s.texCount = on ? cuentas[i][1] : 0;
        P.s.alphaCount = on ? cuentas[i][2] : 0;
      });

      // Se busca un sitio desde el que el zombie ocupe pixeles: «se ve» = apagarlo cambia la imagen.
      // Es la unica comprobacion honesta; contar estructuras no dice nada de lo que hay en pantalla.
      let visto = null;
      const sitios = [[0, 4], [0, -4], [4, 0], [-4, 0], [0, 7], [3, 3]];
      for (const [dx, dz] of sitios) {
        mc.pos[0] = c[0] + dx; mc.pos[1] = c[1] + 0.2; mc.pos[2] = c[2] + dz;
        // El frente de la camara es (-sin yaw, ·, -cos yaw) (app.js:5691): para MIRAR al zombie desde
        // c+(dx,dz) hace falta yaw = atan2(dx, dz). Con atan2(-dx,-dz) sale medio giro de mas y las seis
        // pruebas se hacen de espaldas al bicho — todas dan «no se ve» con el zombie perfectamente pintado.
        mc.yaw = Math.atan2(dx, dz); mc.pitch = 0;
        const con = huella();
        apagar(false); const sin = huella(); apagar(true);
        const otra = huella();
        if (con !== sin && con === otra) { visto = { dx, dz, con, sin }; break; }
      }
      if (!visto) return { noVisible: true };

      // Las matrices llegan al shader: subir las 6 piezas 40 bloques tiene que cambiar el dibujo, y
      // devolverlas tiene que dejarlo EXACTAMENTE como estaba.
      const copias = rig.partes.map(P => P.s.model ? new Float32Array(P.s.model) : null);
      const conMatriz = rig.partes.every(P => !!P.s.model);
      rig.partes.forEach(P => { if (P.s.model) P.s.model[13] += 40; });
      const arriba = huella();
      rig.partes.forEach((P, i) => { if (copias[i]) P.s.model.set(copias[i]); });
      const vuelta = huella();

      return { visto, conMatriz, arriba, vuelta, base: visto.con, apagado: visto.sin,
               camara: [mc.pos[0], mc.pos[1], mc.pos[2], mc.yaw] };
    } finally { window.mcUpdate = orig; }
  });

  // 3) Quitar: el mundo tiene que quedar como estaba, pixel a pixel.
  const quitado = await p.evaluate(() => {
    const orig = window.mcUpdate;
    window.mcUpdate = function () {};
    try {
      const huella = () => {
        mcRender();
        const gl = mc.gl, w = mc.canvas.width, h = mc.canvas.height;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let s = 0;
        for (let i = 0; i < px.length; i += 4) s = (s * 31 + px[i] + px[i + 1] * 3 + px[i + 2] * 7) | 0;
        return s;
      };
      const rig = game.esqueletos._vivos[0];
      const cuentas = rig.partes.map(P => [P.s.colCount, P.s.texCount, P.s.alphaCount]);
      rig.partes.forEach(P => { P.s.colCount = 0; P.s.texCount = 0; P.s.alphaCount = 0; });
      const sinZombie = huella();
      rig.partes.forEach((P, i) => { P.s.colCount = cuentas[i][0]; P.s.texCount = cuentas[i][1]; P.s.alphaCount = cuentas[i][2]; });
      const piezas = rig.partes.map(P => P.s);
      const n = game.esqueletos.quitar(rig);
      const tras = huella();
      const r = {
        retiradas: n, vivos: game.esqueletos._vivos.length,
        sinZombie, tras,
        estructuras: mc.structures.length,
        serial: mcSerialize().structures.length,
        voxels: Object.keys(mcSerialize().voxels).length,
        sueltas: mc.structures.filter(s => s._rig || s.efimera).length,
        enArray: piezas.filter(s => mc.structures.indexOf(s) >= 0).length,
        guardados: window.__guardados, programados: window.__programados,
        bloqueados: (window.__bloqueados || []).length
      };
      window.__restaurarGuardado();
      return r;
    } finally { window.mcUpdate = orig; }
  });

  // 4) La POSE que dibujará el panel del editor (fase 3). Aquí no se dibuja: lo que se comprueba es
  //    lo único que el mundo de juguete no puede decir — que la caja que la librería le calcula a
  //    cada pieza es la MISMA que le sale a app.js al mallarla, en las cuatro orientaciones.
  //    No es cosmético: esa caja es el centro de giro por defecto y el encuadre del preview, así que
  //    si no coincide el brazo del panel gira por un sitio y el del juego por otro.
  //    El brazo del zombie vale de conejillo justo porque NO llena su celda (5×5×14 de 16³): girado
  //    180° el contenido se va contra la otra pared de la celda y la caja pasa a medir un bloque
  //    entero. Con el atajo de «intercambiar X y Z si rot es impar» esto daría mal en 3 de 4.
  const medidas = await p.evaluate(async () => {
    const CLAVE = 'asset:assets/brazo-zombie.vox.json';
    const out = [];
    for (let rot = 0; rot < 4; rot++) {
      const pl = await game.esqueletos.preparar({
        nombre: 'regla', raiz: { nombre: 'pieza', pieza: CLAVE, rot: rot }, piezas: []
      });
      const g = await mcStructGeom(CLAVE, rot);
      out.push({
        rot,
        lib: pl && pl.partes[0] ? pl.partes[0].lados.slice() : null,
        app: [g.fdim[0] / 16, g.fdim[1] / 16, g.fdim[2] / 16],
        aa: pl && pl.partes[0] ? Array.from(pl.partes[0].aa) : null,
        estructuras: mc.structures.length
      });
    }
    return { out, vivos: game.esqueletos._vivos.length };
  });

  const glsl = errores.filter(t => /shader|program|GLSL|compil/i.test(t));

  console.log('\n--- ' + URL + ' ---');
  console.log('  ' + plantado.piezas + ' piezas · cámara en ' + (pintado.camara || []).slice(0, 3).map(v => v && v.toFixed(1)).join(',')
    + ' · ' + plantado.antes.serial + ' estructuras en el mundo');

  test('ningún error de shader al meter un esqueleto en escena', () => {
    assert(glsl.length === 0, glsl.length + ' error(es) GLSL: ' + (glsl[0] || '').split('\n')[0]);
  });
  test('el snippet planta las 6 piezas del zombie', () => {
    assert(plantado.piezas === 6, 'el rig tiene ' + plantado.piezas + ' piezas');
    assert(plantado.conS === 6, 'solo ' + plantado.conS + ' encontraron su instancia estampada');
  });
  test('las 6 quedan marcadas efímeras', () => {
    assert(plantado.efimeras === 6, 'solo ' + plantado.efimeras + ' llevan s.efimera');
  });
  test('las 6 tienen malla que dibujar', () => {
    assert(plantado.dibujables === 6, 'solo ' + plantado.dibujables + ' tienen vértices');
  });
  test('mcSerialize NO las mete en el mundo (mundo.json queda igual)', () => {
    assert(plantado.despues.serial === plantado.antes.serial,
      'las estructuras serializadas pasan de ' + plantado.antes.serial + ' a ' + plantado.despues.serial);
    assert(plantado.despues.estructuras === plantado.antes.estructuras + 6,
      'en memoria tenían que estar: ' + plantado.antes.estructuras + ' → ' + plantado.despues.estructuras);
  });
  test('...y no toca ni un voxel de la rejilla', () => {
    assert(plantado.despues.voxels === plantado.antes.voxels,
      'los voxels del mundo pasan de ' + plantado.antes.voxels + ' a ' + plantado.despues.voxels);
  });
  test('el zombie SE VE (apagarlo cambia los píxeles)', () => {
    assert(!pintado.noVisible, 'no se encontró ninguna posición desde la que se dibuje');
    assert(pintado.base !== pintado.apagado, 'apagar las 6 piezas no cambia un solo píxel');
  });
  test('todas las piezas llevan matriz, también la raíz', () => {
    assert(pintado.conMatriz, 'alguna pieza del rig se quedó sin s.model');
  });
  test('las matrices llegan al shader (subirlas 40 bloques mueve el dibujo)', () => {
    assert(pintado.arriba !== pintado.base, 'trasladar las 6 matrices no cambia la imagen: uModel no se está usando');
  });
  test('y devolverlas deja la imagen exactamente igual', () => {
    assert(pintado.vuelta === pintado.base, 'la imagen no vuelve a ser la de partida');
  });
  test('quitar() retira las 6 piezas', () => {
    assert(quitado.retiradas === 6, 'retiró ' + quitado.retiradas);
    assert(quitado.enArray === 0, quitado.enArray + ' siguen en mc.structures');
    assert(quitado.vivos === 0, 'quedan ' + quitado.vivos + ' agentes vivos');
    assert(quitado.sueltas === 0, quitado.sueltas + ' estructuras se quedaron marcadas de rig o efímeras');
  });
  test('...y el mundo queda pixel a pixel como estaba', () => {
    assert(quitado.tras === quitado.sinZombie, 'la imagen sin el zombie no coincide con la de después de quitarlo');
    assert(quitado.estructuras === plantado.antes.estructuras,
      'quedan ' + quitado.estructuras + ' estructuras y había ' + plantado.antes.estructuras);
    assert(quitado.serial === plantado.antes.serial && quitado.voxels === plantado.antes.voxels,
      'mcSerialize no coincide con el de partida');
  });
  test('plantar y quitar un zombie NO dispara ningún guardado', () => {
    assert(quitado.programados === 0, 'se programaron ' + quitado.programados + ' guardados');
    assert(quitado.guardados === 0, 'se llamó ' + quitado.guardados + ' veces a mcSaveWorld');
    assert(quitado.bloqueados === 0, 'la red intentó ' + quitado.bloqueados + ' escritura(s) (bloqueadas)');
  });

  test('la caja que la librería mide es la que app.js malla, en las 4 orientaciones', () => {
    for (const m of medidas.out) {
      assert(!!m.lib, 'rot ' + m.rot + ': preparar() no montó la pieza');
      for (let k = 0; k < 3; k++) assert(Math.abs(m.lib[k] - m.app[k]) < 1e-9,
        'rot ' + m.rot + ', eje ' + 'xyz'[k] + ': la librería dice ' + m.lib[k] + ' y app.js ' + m.app[k]);
    }
    // Y que el conejillo sirve de algo: si girarlo no cambiara la caja, esto pasaría sin probar nada.
    const anchos = medidas.out.map((m) => m.lib[0]);
    assert(new Set(anchos).size > 1, 'girar el brazo no cambia su caja (' + anchos.join(' ') + '): el test no prueba nada');
  });
  test('preparar() no planta nada ni deja agentes vivos', () => {
    assert(medidas.vivos === 0, 'quedan ' + medidas.vivos + ' agentes vivos');
    assert(medidas.out.every((m) => m.estructuras === quitado.estructuras),
      'mc.structures cambió al preparar una plantilla');
    assert(medidas.out[0].aa.slice(0, 3).every((v) => v === 0), 'la raíz no arranca en el origen');
  });

  console.log('\n' + (fallos ? fallos + ' fallo(s)' : ok + ' ok, 0 fallos'));
  await b.close();
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('no se pudo ejecutar:', e.message.split('\n')[0]); process.exit(1); });
