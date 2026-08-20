// @area: render
// @necesita: servidor, playwright
// BUG-GLOW8 — «la iluminación debe de ser real y consistente para todo el motor, no puede haber apaños o trucos
// para quedar bien» (el dueño, 2026-08-20, sobre los 2 voxels emisivos del mango de la varita de selección).
//
// Hasta ese día había DOS leyes de luz artificial y la costura se veía:
//   · la del MUNDO — BFS por el aire (mcComputeBlockLight): para en la materia, cae a saltos de celda, tiñe con el
//     color del voxel;
//   · la de lo que SE MUEVE — un punto analítico en el shader (uDynPos/uDynDir): esfera euclídea perfecta, ciega a
//     la materia, blanco cálido fijo, y apagada ENTERA en cuanto el emisivo caía en celda sólida.
// De ahí las 4 quejas, verbatim: «*sale una especie de "círculo" que es imposible*», «*si la voy metiendo más, se
// va la luz*», «*lo que ilumina está en el mango, no está dentro del bloque*», «*se nota demasiado que es un
// "truco visual"*».
//
// El arreglo NO es mejorar el segundo modelo: es BORRARLO. La ley se escribe una vez (mcLuzSiembra + mcLuzDifunde)
// y la usan los dos campos que hay — el del mundo y el de la CAJA que sigue a lo que se mueve (mcDynBake) —, que
// se mezclan por max() en el shader igual que dos antorchas dentro de un mismo campo.
//
// Por eso el test que importa es el 3: sembrar el MISMO emisor de las dos maneras y exigir que salga el MISMO
// número en TODAS las celdas. Si alguien vuelve a meter una regla aparte para lo que se mueve, ahí revienta.
// (Y de paso vigila los índices: la caja tiene los suyos y la rejilla los suyos, y confundirlos es EL bug de
// esta pieza.)
//
//   node tests/test_glow8_luz_una_sola.js [url]      por defecto http://localhost:8500/map/test

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   · ' + extra : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  // Los 404 de recursos (iconos que un mundo de pruebas no tiene) son ruido de siempre. Un shader que no compile
  // sí grita por consola, y eso es justo lo que hay que recoger.
  p.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('console: ' + m.text());
  });

  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && typeof game!=="undefined"',
    null, { timeout: 180000 });
  await p.waitForTimeout(2000);

  console.log('\n1 · el motor sigue en pie');
  ok('los shaders compilan', await p.evaluate(() => !!(mc.prog && mc.loc)));
  ok('la caja de luz móvil está cableada al shader (uDynTex/uDynBox0/uDynOn)',
    await p.evaluate(() => !!(mc.loc && mc.loc.uDynTex !== undefined && mc.loc.uDynBox0 !== undefined && mc.loc.uDynOn !== undefined)));

  console.log('\n2 · ya no hay una segunda ley que mantener');
  const muertos = await p.evaluate(() => ({
    mcLuzLibre: typeof mcLuzLibre,                       // el rayo ojo→luz que juzgaba la luz entera desde el ojo
    uDynPos: mc.loc ? mc.loc.uDynPos : undefined,        // los 8 focos analíticos
    uDynCerca: mc.loc ? mc.loc.uDynCerca : undefined,    // el margen de 0,6 bloques que dibujaba el disco de borde duro
    uDynCara: mc.loc ? mc.loc.uDynCara : undefined,
    campo: typeof mcCampoLuz,
    siembra: typeof mcLuzSiembra,
    difunde: typeof mcLuzDifunde,
  }));
  ok('mcLuzLibre borrada (juzgaba la luz entera desde el ojo)', muertos.mcLuzLibre === 'undefined', muertos.mcLuzLibre);
  ok('sin uDynPos: se acabaron los focos analíticos', muertos.uDynPos === undefined || muertos.uDynPos === null);
  ok('sin uDynCerca: se acabó el disco de borde duro', muertos.uDynCerca === undefined || muertos.uDynCerca === null);
  ok('la ley única existe (mcCampoLuz/mcLuzSiembra/mcLuzDifunde)',
    muertos.campo === 'function' && muertos.siembra === 'function' && muertos.difunde === 'function');

  // Los sitios de trabajo NO se pueden cablear a mano: /map/test tiene terreno y luces propias, y una coordenada
  // fija cae dentro de una pared o dentro del halo de otra antorcha —así fallaron las tres primeras versiones de
  // este test—. Se buscan en vivo: un hueco de aire con la caja LIMPIA de luz de bloque ajena, para que lo que se
  // compare sea solo nuestro emisor.
  await p.evaluate(() => {
    window._g8 = {
      sitioLimpio(nivel, radioAire) {
        const PASA = mcTablaLuz(), BL = mc.blockLight;
        const aire = (x, y, z) => mcInside(x, y, z) && !!PASA[mc.grid[mcIdx(x, y, z)]];
        const luz = (x, y, z) => (BL && mcInside(x, y, z)) ? BL[mcIdx(x, y, z) * 4 + 3] : 0;
        for (let y = mc.dim.y - 2; y >= 2; y--)
          for (let x = nivel + 1; x < mc.dim.x - nivel - 1; x += 3)
            for (let z = nivel + 1; z < mc.dim.z - nivel - 1; z += 3) {
              let bien = true;
              for (let d = -radioAire; d <= radioAire && bien; d++)
                if (!aire(x + d, y, z) || !aire(x, y, z + d) || !aire(x, y + d, z)) bien = false;
              if (!bien) continue;
              for (let dx = -nivel; dx <= nivel && bien; dx++)
                for (let dy = -nivel; dy <= nivel && bien; dy++)
                  for (let dz = -nivel; dz <= nivel && bien; dz++)
                    if (luz(x + dx, y + dy, z + dz)) bien = false;
              if (bien) return { x, y, z };
            }
        return null;
      }
    };
  });

  console.log('\n3 · EL TEST · el mismo emisor, quieto o moviéndose, da el MISMO número en todas las celdas');
  const nucleo = await p.evaluate(async () => {
    const out = { errs: [] };
    // Un emisivo del catálogo, con su haz y su color: así se prueba la ley entera (tinte y anisotropía incluidos),
    // no solo una bola blanca.
    let id = 0; for (const k in mc._glowIds) if (mc._glowIds[k]) { id = +k; break; }
    if (!id) { out.errs.push('el mundo de pruebas no trae ningún material emisivo'); return out; }
    const G = mc._glowIds[id];
    out.id = id; out.haz = Array.from(G.emitDir).slice(0, 3); out.col = Array.from(G.emitCol).slice(0, 3);

    // El alcance se baja a 8 para esta comparación: la caja de un alcance 15 no cabe por encima del terreno de
    // /map/test sin rozar las luces que el mapa ya trae. La ley que se prueba es la misma con 8 que con 15.
    const glowAntes = mc.glowLevel;
    mc.glowLevel = 8;
    const nivel = 8;
    out.nivel = nivel;

    mcComputeBlockLight();
    const sitio = window._g8.sitioLimpio(nivel, 3);
    if (!sitio) { mc.glowLevel = glowAntes; out.errs.push('no hay ningún hueco limpio en el mapa para medir'); return out; }
    const { x, y, z } = sitio;
    out.celda = [x, y, z];

    // (a) La línea base: sin nuestro emisor, en esta caja no hay luz de bloque de nadie más, o la comparación
    // estaría midiendo otra cosa.
    // En NIVELES, como mcDynNivel: desde BUG-GLOW8c el byte guarda nivel×MC_LUZ_SUB (subniveles), y lo que este
    // test compara es la LEY, no la codificación. Un emisor plantado cae en el centro exacto de su celda ⇒ todos
    // sus valores son múltiplos de SUB ⇒ la división es exacta y la comparación sigue siendo por igualdad estricta.
    const lvlMundo = (X, Y, Z) => {
      const BL = mc.blockLight; if (!BL) return 0;
      if (!mcInside(X, Y, Z)) return 0;
      return BL[mcIdx(X, Y, Z) * 4 + 3] / MC_LUZ_SUB;
    };
    let sucias = 0;
    for (let dx = -nivel; dx <= nivel; dx++) for (let dy = -nivel; dy <= nivel; dy++) for (let dz = -nivel; dz <= nivel; dz++)
      if (lvlMundo(x + dx, y + dy, z + dz)) sucias++;
    out.baseSucia = sucias;

    // (b) QUIETO: el emisor plantado en la rejilla → campo del mundo.
    const idAntes = mc.grid[mcIdx(x, y, z)];
    mcSetBlock(x, y, z, id);
    mcComputeBlockLight();
    const quieto = [];
    for (let dx = -nivel; dx <= nivel; dx++) for (let dy = -nivel; dy <= nivel; dy++) for (let dz = -nivel; dz <= nivel; dz++)
      quieto.push(lvlMundo(x + dx, y + dy, z + dz));

    // (c) MOVIÉNDOSE: el mismo emisor, misma celda, mismo haz, mismo color → campo de la caja. El bloque sigue
    // puesto a propósito: las dos siembras tienen que ver EXACTAMENTE el mismo mundo para poder compararse.
    mcDynBake([{ x, y, z, nivel, haz: out.haz, col: out.col }]);
    const D = mc.dynLight;
    out.caja = D ? { x0: D.x0, y0: D.y0, z0: D.z0, W: D.W, H: D.H, P: D.P, luces: D.luces } : null;
    const movil = [];
    for (let dx = -nivel; dx <= nivel; dx++) for (let dy = -nivel; dy <= nivel; dy++) for (let dz = -nivel; dz <= nivel; dz++)
      movil.push(mcDynNivel(x + dx, y + dy, z + dz));

    // (d) Comparación celda a celda.
    let iguales = 0, distintas = 0, encendidas = 0;
    const muestra = [];
    for (let i = 0; i < quieto.length; i++) {
      if (quieto[i]) encendidas++;
      if (quieto[i] === movil[i]) iguales++;
      else { distintas++; if (muestra.length < 8) muestra.push({ i, quieto: quieto[i], movil: movil[i] }); }
    }
    out.iguales = iguales; out.distintas = distintas; out.encendidas = encendidas; out.muestra = muestra;

    mcSetBlock(x, y, z, idAntes);
    mc.glowLevel = glowAntes;
    mc._dynSig = null;
    mcComputeBlockLight();
    return out;
  });
  if (nucleo.errs.length) nucleo.errs.forEach(e => ok(e, false));
  console.log('     material ' + nucleo.id + ' · haz ' + JSON.stringify(nucleo.haz) + ' · color ' + JSON.stringify(nucleo.col) +
    ' · alcance ' + nucleo.nivel + ' · caja ' + JSON.stringify(nucleo.caja));
  ok('la línea base está limpia (ninguna otra luz en la zona)', nucleo.baseSucia === 0, nucleo.baseSucia + ' celdas ya encendidas');
  ok('el emisor plantado enciende la zona', nucleo.encendidas > 50, nucleo.encendidas + ' celdas');
  ok('MISMO número en TODAS las celdas, quieto o moviéndose', nucleo.distintas === 0,
    nucleo.distintas + ' celdas distintas' + (nucleo.muestra && nucleo.muestra.length ? ' · p.ej. ' + JSON.stringify(nucleo.muestra) : ''));

  console.log('\n4 · la materia para la luz que se mueve, igual que para la plantada');
  const muro = await p.evaluate(() => {
    const out = {};
    const nivel = 8;
    const sitio = window._g8.sitioLimpio(nivel, 5);
    if (!sitio) { out.err = 'sin hueco'; return out; }
    const { x, y, z } = sitio;
    out.celda = [x, y, z];
    // Sin nada en medio: la luz cae de celda en celda. La siembra pinta el emisor y sus 6 vecinos a nivel pleno,
    // así que el escalón empieza en el 2º paso: 8,8,7,6,5,4… Eso ES la ley de la luz de bloque, no una esfera.
    mc._dynSig = null;
    mcDynBake([{ x, y, z, nivel, haz: [0, 0, 0], col: null }]);
    out.libre = mcDynNivel(x, y, z + 4);
    out.perfil = [0, 1, 2, 3, 4, 5, 8].map(d => mcDynNivel(x, y, z + d));

    // Ahora el emisor se ENCIERRA en una cáscara de piedra de 3×3×3. Un solo bloque no vale de prueba: la luz lo
    // rodea, y hace bien —eso es difusión de verdad—. Encerrado, fuera no puede quedar NI UN nivel: es el «cuarto
    // cerrado» que el dueño vio iluminado desde fuera. Y no lo para un rayo aparte, lo para que el BFS no cruza lo
    // que mcTablaLuz llama opaco: la MISMA tabla que gobierna la luz del mundo.
    const shell = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dy && !dz) continue;
      shell.push([x + dx, y + dy, z + dz, mc.grid[mcIdx(x + dx, y + dy, z + dz)]]);
      mcSetBlock(x + dx, y + dy, z + dz, 1);
    }
    mc._dynSig = null;                                   // el mundo ha cambiado: hay que re-sembrar
    mcDynBake([{ x, y, z, nivel, haz: [0, 0, 0], col: null }]);
    out.pasaPiedra = mcTablaLuz()[1];
    let fuera = 0, maxFuera = 0;
    for (let dx = -nivel; dx <= nivel; dx++) for (let dy = -nivel; dy <= nivel; dy++) for (let dz = -nivel; dz <= nivel; dz++) {
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && Math.abs(dz) <= 1) continue;   // dentro de la cáscara: no cuenta
      const n = mcDynNivel(x + dx, y + dy, z + dz);
      if (n) { fuera++; if (n > maxFuera) maxFuera = n; }
    }
    out.fuera = fuera; out.maxFuera = maxFuera;
    for (const [sx, sy, sz, id] of shell) mcSetBlock(sx, sy, sz, id);
    mc._dynSig = null;
    return out;
  });
  ok('sin muro, la luz móvil llega', muro.libre > 0, 'nivel ' + muro.libre + ' en ' + JSON.stringify(muro.celda));
  ok('la luz CAE de celda en celda (no es una esfera analítica)',
    muro.perfil && muro.perfil[1] === 8 && muro.perfil[2] === 7 && muro.perfil[3] === 6 && muro.perfil[4] === 5,
    'perfil ' + JSON.stringify(muro.perfil));
  ok('la piedra es opaca para mcTablaLuz', !muro.pasaPiedra);
  ok('encerrado en piedra, NO se escapa ni un nivel al otro lado', muro.fuera === 0,
    muro.fuera + ' celdas encendidas fuera, máx ' + muro.maxFuera);

  console.log('\n5 · «lo que ilumina está en el mango, no está dentro del bloque»');
  // La queja literal: al meter la varita dentro de un bloque, la luz se iba ENTERA. Un emisor dentro de la materia
  // no se apaga — alumbra sus vecinos de aire, exactamente igual que una antorcha enterrada en la roca.
  const dentro = await p.evaluate(() => {
    const out = {};
    const nivel = 8;
    const sitio = window._g8.sitioLimpio(nivel, 3);
    if (!sitio) { out.err = 'sin hueco'; return out; }
    const { x, y, z } = sitio;
    out.celda = [x, y, z];
    const idAntes = mc.grid[mcIdx(x, y, z)];
    mcSetBlock(x, y, z, 1);                              // el emisor cae DENTRO de un sólido
    mc._dynSig = null;
    mcDynBake([{ x, y, z, nivel, haz: [0, 0, 0], col: null }]);
    out.enElSolido = mcDynNivel(x, y, z);                // la muestra que tiñe la cara a ras
    out.vecinoAire = mcDynNivel(x + 1, y, z);            // …y el aire de al lado SÍ se alumbra
    out.aDos = mcDynNivel(x + 2, y, z);
    mcSetBlock(x, y, z, idAntes);
    mc._dynSig = null;
    return out;
  });
  ok('el emisor dentro de un sólido NO se apaga entero', dentro.vecinoAire > 0, 'vecino de aire = ' + dentro.vecinoAire);
  ok('…y sigue alumbrando hacia fuera', dentro.aDos > 0 && dentro.aDos < dentro.vecinoAire,
    'a 1: ' + dentro.vecinoAire + ', a 2: ' + dentro.aDos);

  console.log('\n6 · game.luzDinamica sigue conmutando (el dueño quiere poder medir fps sin ella)');
  const mando = await p.evaluate(() => {
    const out = {};
    const sitio = window._g8.sitioLimpio(8, 3) || { x: 20, y: mc.dim.y - 2, z: 20 };
    const { x, y, z } = sitio, nivel = 8;
    game.luzDinamica = false; mc._dynSig = null;
    mcDynBake([{ x, y, z, nivel, haz: [0, 0, 0], col: null }]);
    out.apagada = !!mc.dynLight;
    game.luzDinamica = true; mc._dynSig = null;
    mcDynBake([{ x, y, z, nivel, haz: [0, 0, 0], col: null }]);
    out.encendida = !!mc.dynLight;
    out.valor = game.luzDinamica;
    return out;
  });
  ok('game.luzDinamica=false no siembra nada', mando.apagada === false);
  ok('game.luzDinamica=true la repone', mando.encendida === true);

  console.log('\n8 · BUG-GLOW8b · la luz se DESLIZA, no salta de bloque en bloque');
  // «va a saltos, estaría genial que fuese más continua» (el dueño, 2026-08-20, ya con la luz nueva puesta).
  // El BFS solo entiende de celdas, así que el campo SIEMPRE está sembrado en floor(pos). Lo que se arregla es
  // dónde se LEE: se corre el muestreo por el resto sub-celda. El invariante que lo demuestra es que la posición
  // efectiva de la luz (centro de la celda + desplazamiento) sigue a la posición real SIN escalones — y en
  // particular no da un tirón al cruzar de celda, porque ahí la celda sube 1 y el resto salta de +0.5 a −0.5.
  const desliz = await p.evaluate(() => {
    const out = { pasos: [] };
    const sitio = window._g8.sitioLimpio(8, 3) || { x: 20, y: mc.dim.y - 2, z: 20 };
    const { y, z } = sitio, nivel = 8;
    game.luzSuave = true;
    for (let i = 0; i <= 16; i++) {
      const fx = sitio.x + i * 0.25;                     // barre 4 celdas en pasos de 1/4
      mc._dynSig = null;
      mcDynBake([{ x: Math.floor(fx), y, z, fx, fy: y + 0.5, fz: z + 0.5, nivel, haz: [0, 0, 0], col: null }]);
      const D = mc.dynLight;
      out.pasos.push({ fx, efectiva: D ? Math.floor(fx) + 0.5 + D.offx : null });
    }
    // Y con el mando apagado, la luz vuelve a leerse en el centro de la celda (salta).
    game.luzSuave = false;
    const fx = sitio.x + 0.9;
    mc._dynSig = null;
    mcDynBake([{ x: Math.floor(fx), y, z, fx, fy: y + 0.5, fz: z + 0.5, nivel, haz: [0, 0, 0], col: null }]);
    out.offApagado = mc.dynLight ? mc.dynLight.offx : null;
    game.luzSuave = true;
    return out;
  });
  const errMax = Math.max(...desliz.pasos.map(s => Math.abs(s.efectiva - s.fx)));
  let saltoMax = 0;
  for (let i = 1; i < desliz.pasos.length; i++)
    saltoMax = Math.max(saltoMax, Math.abs(desliz.pasos[i].efectiva - desliz.pasos[i - 1].efectiva));
  ok('la luz se lee donde de verdad está el emisor', errMax < 1e-6, 'error máx ' + errMax);
  ok('ni un tirón al cruzar de celda (pasos de 0,25 → saltos de 0,25)', Math.abs(saltoMax - 0.25) < 1e-6,
    'salto máx ' + saltoMax);
  ok('game.luzSuave=false vuelve al centro de la celda', desliz.offApagado === 0, 'off ' + desliz.offApagado);

  // Fotos 66/67 del dueño: mismo sitio, 15° de giro, y el mango de la espada de luz se apaga mientras la mancha
  // del suelo salta de sitio. La causa era que el desplazamiento se tomaba del PRIMER emisor de la lista y
  // mcDynSync ordena por distancia al ojo: una espada son ~10 voxels emisivos, girar cambiaba cuál iba primero y
  // el muestreo daba un tirón de un bloque entero. Ahora sale del centro de masas ⇒ el orden no puede afectarlo.
  const giro = await p.evaluate(() => {
    const sitio = window._g8.sitioLimpio(8, 3) || { x: 20, y: mc.dim.y - 2, z: 20 };
    const { x, y, z } = sitio;
    // Una "hoja" de emisores como la de la espada, a fracciones distintas de celda.
    const hoja = [];
    for (let i = 0; i < 6; i++) {
      const fx = x + 0.37 + i * 0.31, fy = y + 0.62, fz = z + 0.44;
      hoja.push({ x: Math.floor(fx), y: Math.floor(fy), z: Math.floor(fz), fx, fy, fz, nivel: 8, haz: [0, 0, 0], col: null });
    }
    const off = () => { mc._dynSig = null; mcDynBake(hoja.slice()); const D = mc.dynLight; return D ? [D.offx, D.offy, D.offz] : null; };
    const a = off();
    hoja.reverse();                                      // el giro, en lo único que el giro cambiaba: el ORDEN
    const b = off();
    hoja.sort(() => 0.5 - Math.random());
    const c = off();
    return { a, b, c };
  });
  const mismo = (u, v) => u && v && u.every((n, i) => Math.abs(n - v[i]) < 1e-9);
  ok('reordenar los emisores NO mueve la luz (fotos 66/67: girar en el sitio)',
    mismo(giro.a, giro.b) && mismo(giro.a, giro.c),
    JSON.stringify(giro.a) + ' vs ' + JSON.stringify(giro.b) + ' vs ' + JSON.stringify(giro.c));

  console.log('\n7 · sin errores de página');
  ok('ni un error en consola', errores.length === 0, errores.slice(0, 4).join(' | '));

  await b.close();
  console.log('\n' + (fallos ? '✗ ' + fallos + ' fallo(s)' : '✓ todo en verde'));
  process.exit(fallos ? 1 : 0);
})();
