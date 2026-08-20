// @area: mundo
// @necesita: servidor, playwright
// BUG-GLOW6 — la luz DINÁMICA atravesaba los sólidos (seis notas del dueño en /map/bugfinder que son el mismo fallo:
// estrellas alumbrando un cuarto cerrado, la espada de luz iluminando el otro lado del muro, la espada metida dentro
// de un bloque alumbrando fuera, y una pared de 2 bloques filtrando menos que una de 1).
//
// Lo que hay que entender para leer este test (docs/luz-y-sombra.md): hay DOS luces artificiales y solo una
// respetaba la materia. La **horneada** (mcComputeBlockLight) es un BFS por el aire, así que un muro la para. La
// **dinámica** (mcDynSync → uDynPos) se sumaba en el fragmento por distancia y ángulo, sin preguntar por lo que
// hubiera en medio.
//
// El arreglo son DOS mitades y este guardián prueba las dos por separado, porque ninguna sola llega:
//   A) por luz, en la CPU — `mcLuzLibre` recorre las celdas entre la luz y el ojo con la MISMA tabla que gobierna la
//      difusión de la luz horneada (`mcTablaLuz`), y `mcDynSync` no sube la que no ve. Esto apaga el cuarto cerrado.
//   B) por fragmento, en el shader — una cara no recibe la luz que le da por detrás (`uDynCara`). Esto arregla el
//      grosor de la pared. Aquí solo se comprueba el cableado del uniforme: lo que pinta un shader no se mide desde
//      JS, y montar una comparación de píxeles con swiftshader daría un verde que no vale nada.
//
// Y el mando: `game.luzOcluye` tiene que devolver el comportamiento viejo sin recargar (el dueño quiere poder medir
// fps con y sin), sin re-sembrar luz ni re-mallar nada.

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
  // Los 404 de recursos (iconos que un mundo de pruebas no tiene) son ruido de siempre y no son de este ticket:
  // lo que sí importa es que un shader que no compile grita por consola, y eso sí se recoge.
  p.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('console: ' + m.text());
  });

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"',
    null, { timeout: 180000 });
  await p.waitForTimeout(1500);

  // Si el shader no compilara, nada de lo de abajo existiría: mc.prog es la prueba de que el #ifdef SUN_DERIV nuevo
  // no ha roto el GLSL ni en WebGL2 ni en la rama de WebGL1.
  ok('los shaders siguen compilando', await p.evaluate(() => !!(mc.prog && mc.loc)));

  console.log('\nA · mcLuzLibre: qué hay entre dos puntos');
  const a = await p.evaluate(() => {
    // Sitio de trabajo: una fila de celdas de aire bien arriba, lejos del terreno.
    const y = mc.dim.y - 4, x = 8, z = 8;
    const idAntes = [];
    for (let i = 0; i < 6; i++) idAntes.push(mc.grid[mcIdx(x, y, z + i)]);
    window._g6 = { x, y, z, idAntes };
    const P = mcTablaLuz();
    const A = [x + 0.5, y + 0.5, z + 0.5], B = [x + 0.5, y + 0.5, z + 5.5];
    const out = { aire: mcLuzLibre(A[0], A[1], A[2], B[0], B[1], B[2], P) };

    // Un bloque sólido justo en medio.
    const solido = mcClaveDeNombre ? 1 : 1;                    // el id 1 de la paleta: piedra, opaco
    mcSetBlock(x, y, z + 3, solido);
    const P2 = mcTablaLuz();
    out.tapado = mcLuzLibre(A[0], A[1], A[2], B[0], B[1], B[2], P2);
    out.pasaId = P2[solido];                                   // 0 = ese id NO deja pasar la luz

    // La misma pared, pero declarando a mano que ese material deja pasar la luz: la oclusión dinámica tiene que
    // usar la MISMA tabla que la horneada, o el mundo tendría dos ideas de qué es opaco.
    const P3 = P2.slice(); P3[solido] = 1;
    out.vidriera = mcLuzLibre(A[0], A[1], A[2], B[0], B[1], B[2], P3);

    // La luz DENTRO del bloque: «*si meto la espada dentro de este bloque, se ilumina fuera? no es realista*».
    out.dentro = mcLuzLibre(x + 0.5, y + 0.5, z + 3.5, B[0], B[1], B[2], P2);

    // Y sin nada en medio pero al revés (el orden de los extremos no puede cambiar la respuesta).
    out.alReves = mcLuzLibre(B[0], B[1], B[2], A[0], A[1], A[2], P2);
    return out;
  });
  ok('por el aire se ve', a.aire === true);
  ok('el id sólido de prueba no deja pasar la luz', a.pasaId === 0, 'P[1]=' + a.pasaId);
  ok('un bloque en medio tapa', a.tapado === false);
  ok('si ese material dejara pasar la luz, no taparía', a.vidriera === true);
  ok('una luz metida DENTRO de un sólido no sale', a.dentro === false);
  ok('el recorrido es simétrico', a.alReves === false);

  console.log('\nB · mcDynSync no sube al shader una luz que no ve al ojo');
  const bres = await p.evaluate(async () => {
    const g = window._g6;
    // El ojo se lleva al aire de arriba (y se devuelve al final): así el escenario es el mismo siempre, mire donde
    // mire el mundo guardado. Se apunta la posición para restaurarla.
    g.pos = mc.pos.slice();
    mc.pos = [g.x + 0.5, g.y - MC_EYE * mc.scale + 0.5, g.z + 0.5];

    // Una luz de game.voxelesUI a cinco celdas, en línea recta. Se inyecta por donde las lee mcDynSync en vez de
    // dibujar estrellas de verdad: lo que se prueba es el filtro, no la capa de voxeles.
    const luz = [g.x + 0.5, g.y + 0.5, g.z + 5.5, MC_MAXLIGHT];
    const pon = () => { mc._voxUILuz = luz.slice(); mc.voxUISucio = false; };
    // El desvanecido (MC_DYN_FUNDE) tarda ~0,18 s: se envejece el reloj interno para que el fundido acabe de una.
    const sync = () => { pon(); mcDynSync(); mc._dynVisT = performance.now() - 5000; pon(); mcDynSync(); };

    const nivelDeLaLuz = () => {
      for (let i = 0; i < (mc._dynN | 0); i++) {
        if (Math.abs(mc._dynArr[i * 4] - luz[0]) < 0.01 && Math.abs(mc._dynArr[i * 4 + 2] - luz[2]) < 0.01)
          return mc._dynArr[i * 4 + 3];
      }
      return null;
    };

    const out = {};
    mcSetBlock(g.x, g.y, g.z + 3, 0);                          // se quita la pared del tramo A
    sync(); out.sinPared = nivelDeLaLuz();

    mcSetBlock(g.x, g.y, g.z + 3, 1);                          // y se vuelve a poner
    sync(); out.conPared = nivelDeLaLuz();

    game.luzOcluye = false;                                    // el mando devuelve el comportamiento viejo
    sync(); out.apagado = nivelDeLaLuz();
    game.luzOcluye = true;
    sync(); out.reencendido = nivelDeLaLuz();
    return out;
  });
  ok('sin pared, la luz llega entera al shader', bres.sinPared === 15 || bres.sinPared > 0, 'nivel=' + bres.sinPared);
  ok('con una pared en medio, no se sube', bres.conPared === 0, 'nivel=' + bres.conPared);
  ok('con game.luzOcluye=false vuelve a atravesarla', bres.apagado > 0, 'nivel=' + bres.apagado);
  ok('y volver a encenderlo la apaga otra vez', bres.reencendido === 0, 'nivel=' + bres.reencendido);

  console.log('\nC · el fundido: encender no es un salto de un frame');
  // Se llega aquí con la luz tapada y ya a 0 (fin del tramo B), que es justo el punto de partida que hace falta:
  // una luz que se ESTRENA nace con su valor y no funde (si no, cada estrella que entra en las plazas aparecería
  // subiendo de negro). Lo que funde es la que ya estaba y CAMBIA de estado, que es el caso de cruzar una puerta.
  const c = await p.evaluate(() => {
    const g = window._g6;
    const luz = [g.x + 0.5, g.y + 0.5, g.z + 5.5, MC_MAXLIGHT];
    const pon = () => { mc._voxUILuz = luz.slice(); mc.voxUISucio = false; };
    const nivel = () => { for (let i = 0; i < (mc._dynN | 0); i++)
      if (Math.abs(mc._dynArr[i * 4 + 2] - luz[2]) < 0.01) return mc._dynArr[i * 4 + 3]; return null; };
    pon(); mcDynSync();
    const parte = nivel();
    mcSetBlock(g.x, g.y, g.z + 3, 0);                          // se abre el hueco: la luz pasa de tapada a vista
    // Un frame de 30 ms sobre los 180 del fundido: tiene que quedarse a MEDIO camino, ni 0 ni el nivel pleno.
    mc._dynVisT = performance.now() - 30;
    pon(); mcDynSync();
    const medio = nivel();
    mc._dynVisT = performance.now() - 5000;                    // y al rato, encendida del todo
    pon(); mcDynSync();
    return { parte, medio, fin: nivel(), max: MC_MAXLIGHT };
  });
  ok('se parte de la luz tapada', c.parte === 0, 'nivel=' + c.parte);
  ok('al abrir el hueco sube a media asta, no de golpe', c.medio > 0 && c.medio < c.max, 'nivel=' + c.medio + '/' + c.max);
  ok('y acaba encendida del todo', c.fin === c.max, 'nivel=' + c.fin);

  console.log('\nD · la mitad del shader está cableada');
  const d = await p.evaluate(() => {
    const gl = mc.gl;
    const out = { loc: !!(mc.loc && mc.loc.uDynCara), struct: !!(mc.structLoc && mc.structLoc.uDynCara) };
    // Se lee el uniforme de vuelta de la GPU: es la única forma honrada de saber que el mando LLEGA al shader.
    gl.useProgram(mc.prog);
    out.encendido = gl.getUniform(mc.prog, mc.loc.uDynCara);
    out.cerca = gl.getUniform(mc.prog, mc.loc.uDynCerca);
    return out;
  });
  ok('el uniforme existe en el shader del terreno', d.loc === true);
  ok('y en el de estructuras', d.struct === true);
  ok('game.luzOcluye llega a la GPU encendido', d.encendido === 1, 'uDynCara=' + d.encendido);
  ok('con su margen de cortesía para el emisor de la mano', d.cerca > 0 && d.cerca < 1, 'uDynCerca=' + d.cerca);

  // Se devuelve el mundo como estaba: los bloques que tocó el test y la posición del jugador. /map/test es de
  // pruebas, pero dejar basura dentro es lo que costó BUG-CART1.
  await p.evaluate(async () => {
    const g = window._g6;
    for (let i = 0; i < g.idAntes.length; i++) mcSetBlock(g.x, g.y, g.z + i, g.idAntes[i]);
    if (g.pos) mc.pos = g.pos;
    mc._voxUILuz = null; mc.voxUISucio = true;
    mcDirtyHeader();
    await mcSaveWorld();
  });

  ok('sin errores de página', errores.length === 0, errores.join(' · '));

  await b.close();
  console.log(fallos ? '\n' + fallos + ' FALLOS' : '\nOK');
  process.exit(fallos ? 1 : 0);
})();
