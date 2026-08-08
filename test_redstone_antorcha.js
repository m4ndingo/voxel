// @area: redstone
// @necesita: servidor, playwright
// Redstone, primer circuito de verdad: una antorcha que SOLO se enciende con un bloque de redstone
// pegado. Lo que este test guarda es la union de las tres piezas, que es donde estan los fallos:
//
//   1. el motor cuelga del MATERIAL, no del voxel (una instancia por celda no cabe: 442 368 celdas)
//   2. encender = cambiar el id de la celda por el del material encendido; la LUZ va detras sola,
//      porque mcSetBlock -> mcGlowTocada mantiene el indice de emisores de la rejilla
//   3. y el viaje de vuelta: al romper la fuente la antorcha tiene que APAGARSE. Esa mitad se rompe
//      sola si la variante encendida no esta en la tabla del circuito, porque en cuanto la celda
//      cambia de material deja de ser reconocida y se queda encendida para siempre.
//
// No persiste nada: bloquea los POST y devuelve las celdas tocadas a su valor anterior.
const { chromium } = require('playwright');
const fs = require('fs');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const motor = fs.readFileSync(__dirname + '/redstone/redstone.js', 'utf8');

  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\//.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(4000);

  // El motor se inyecta desde el fichero fuente, no desde el snippet publicado: el test tiene que
  // fallar cuando se rompa redstone/redstone.js, no cuando alguien olvide re-publicarlo.
  await p.evaluate(motor);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const FUENTE = 'asset:assets/red_concrete.vox.json';
    const APAGADA = 'hab:antorcha-apagada', ENCENDIDA = 'hab:antorcha';
    if (!(mc.glowLevel > 0)) mc.glowLevel = 12;         // sin nivel de brillo no hay luz que medir

    out.hayApi = !!(window.game && game.redstone);
    if (!out.hayApi) return out;

    // Un hueco despejado: suelo con aire encima y a los lados, para poder pegar la fuente y medir luz.
    let sitio = null;
    for (let x = 12; x < mc.dim.x - 14 && !sitio; x += 3) for (let z = 12; z < mc.dim.z - 14; z += 3) {
      let gy = -1;
      for (let y = mc.dim.y - 10; y > 1; y--) if (mc.grid[mcIdx(x, y, z)]) { gy = y; break; }
      if (gy < 1) continue;
      let libre = true;
      for (let y = gy + 1; y <= gy + 5 && libre; y++) for (let d = -2; d <= 4; d++) if (mc.grid[mcIdx(x + d, y, z)]) libre = false;
      if (libre) { sitio = [x, gy + 1, z]; break; }
    }
    if (!sitio) { out.errs.push('sin sitio despejado en el mapa'); return out; }
    const [X, Y, Z] = sitio;
    out.sitio = sitio;

    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)];
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || null;   // los ids NO son estables: se compara por clave
    const luz = (x, y, z) => (mc.blockLight ? mc.blockLight[mcIdx(x, y, z)] : -1);
    const antesTorch = idEn(X, Y, Z), antesFuente = idEn(X + 1, Y, Z);
    const luzPrevia = luz(X, Y + 1, Z);

    await game.redstone.define(FUENTE, { power: 15 });
    await game.redstone.define(APAGADA, { encendida: ENCENDIDA });
    out.lista = game.redstone.lista().length;
    // La variante ENCENDIDA tambien tiene que estar en la tabla, o la antorcha no sabria volver.
    out.encendidaEnTabla = !!game.redstone._tabla[ENCENDIDA];
    out.paleta = { apagada: !!mc.name2id[APAGADA], encendida: !!mc.name2id[ENCENDIDA], fuente: !!mc.name2id[FUENTE] };

    // --- plantar la antorcha, sola: tiene que quedarse APAGADA ---
    game.setVoxel(X, Y, Z, APAGADA);
    game.redstone.tick();
    out.solaClave = claveEn(X, Y, Z);
    out.solaLuz = luz(X, Y + 1, Z);

    // --- pegarle la fuente: se enciende Y ALUMBRA ---
    game.setVoxel(X + 1, Y, Z, FUENTE);
    game.redstone.tick();
    out.conFuenteClave = claveEn(X, Y, Z);
    out.conFuenteLuz = luz(X, Y + 1, Z);
    out.potencia = game.redstone._potencia.get(X + ',' + Y + ',' + Z) || 0;

    // --- romper la fuente: se apaga y la luz se va ---
    game.setVoxel(X + 1, Y, Z, 0);
    game.redstone.tick();
    out.sinFuenteClave = claveEn(X, Y, Z);
    out.sinFuenteLuz = luz(X, Y + 1, Z);

    // --- y otra vez, para descartar que solo funcione el primer ciclo ---
    game.setVoxel(X + 1, Y, Z, FUENTE);
    game.redstone.tick();
    out.segundaClave = claveEn(X, Y, Z);
    game.setVoxel(X + 1, Y, Z, 0);
    game.redstone.tick();
    out.segundaApagadaClave = claveEn(X, Y, Z);

    // --- una fuente EN DIAGONAL no cuenta: la vecindad son las 6 caras ---
    game.setVoxel(X + 1, Y + 1, Z + 1, FUENTE);
    game.redstone.tick();
    out.diagonalClave = claveEn(X, Y, Z);
    game.setVoxel(X + 1, Y + 1, Z + 1, 0);
    game.redstone.tick();

    // --- quitar() devuelve el material a bloque tonto ---
    game.setVoxel(X + 1, Y, Z, FUENTE);
    game.redstone.tick();
    game.redstone.quitar(APAGADA);
    out.trasQuitarTabla = game.redstone._tabla[ENCENDIDA] === undefined;
    game.setVoxel(X + 1, Y, Z, 0);
    game.redstone.tick();
    out.trasQuitarClave = claveEn(X, Y, Z);   // se queda como estaba: ya no es circuito

    // --- coste: sin circuito declarado, el envoltorio de mcSetBlock no puede cobrar nada ---
    game.redstone.quitar(FUENTE);
    const antesCola = game.redstone._cola.size;
    for (let i = 0; i < 200; i++) game.setVoxel(X + 2, Y, Z, i % 2 ? 'roca' : 0);
    out.colaSinCircuito = game.redstone._cola.size - antesCola;

    // --- limpieza ---
    game.setVoxel(X + 2, Y, Z, 0);
    mcSetBlock(X, Y, Z, antesTorch);
    mcSetBlock(X + 1, Y, Z, antesFuente);
    mcRemeshAround(X - 2, Z - 2, X + 3, Z + 3);
    out.restaurado = idEn(X, Y, Z) === antesTorch && idEn(X + 1, Y, Z) === antesFuente;
    out.luzFinal = luz(X, Y + 1, Z);
    out.luzPrevia = luzPrevia;
    return out;
  });

  console.log('El motor se carga y declara el circuito');
  ok('game.redstone existe', r.hayApi === true);
  if (!r.hayApi) { console.log(JSON.stringify(r)); await b.close(); process.exit(1); }
  ok('sitio despejado', !!r.sitio, JSON.stringify(r.sitio) + (r.errs.length ? ' ' + r.errs.join(';') : ''));
  ok('los 3 materiales quedan en la paleta al declarar', r.paleta && r.paleta.apagada && r.paleta.encendida && r.paleta.fuente,
    JSON.stringify(r.paleta));
  ok('la variante encendida entra en la tabla', r.encendidaEnTabla === true);

  console.log('\nLa antorcha sola esta apagada');
  ok('sigue siendo la apagada', r.solaClave === 'hab:antorcha-apagada', r.solaClave);
  ok('y no alumbra', r.solaLuz === 0, 'luz ' + r.solaLuz);

  console.log('\nCon el bloque de redstone pegado se enciende Y alumbra');
  ok('cambia a la antorcha encendida', r.conFuenteClave === 'hab:antorcha', r.conFuenteClave);
  ok('recibe senal 15', r.potencia === 15, 'potencia ' + r.potencia);
  ok('la luz de bloque sube', r.conFuenteLuz > 0, 'luz ' + r.conFuenteLuz);

  console.log('\nAl romper la fuente vuelve a apagarse');
  ok('vuelve a la apagada', r.sinFuenteClave === 'hab:antorcha-apagada', r.sinFuenteClave);
  ok('y la luz se va', r.sinFuenteLuz === 0, 'luz ' + r.sinFuenteLuz);
  ok('el segundo encendido tambien va', r.segundaClave === 'hab:antorcha', r.segundaClave);
  ok('y el segundo apagado', r.segundaApagadaClave === 'hab:antorcha-apagada', r.segundaApagadaClave);

  console.log('\nVecindad = las 6 caras');
  ok('una fuente en diagonal no la enciende', r.diagonalClave === 'hab:antorcha-apagada', r.diagonalClave);

  console.log('\nquitar() desmonta el circuito');
  ok('se lleva tambien el alias encendido', r.trasQuitarTabla === true);
  ok('el material deja de reaccionar', r.trasQuitarClave === 'hab:antorcha', r.trasQuitarClave);

  console.log('\nSin circuito declarado, el enganche no cuesta nada');
  ok('200 escrituras no encolan ni una celda', r.colaSinCircuito === 0, r.colaSinCircuito + ' en cola');

  console.log('');
  ok('limpieza: las celdas vuelven a su valor', r.restaurado === true);
  ok('el mundo queda con la luz de partida', r.luzFinal === r.luzPrevia, r.luzFinal + ' vs ' + r.luzPrevia);
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos === 0 ? '\ntodo ok' : '\n' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();