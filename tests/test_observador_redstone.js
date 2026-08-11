// @area: redstone
// Test del Bloque Observador (Observer)
// Verifica que cuando ocurre un cambio delante de su cara frontal, emite un pulso de redstone (nivel 15) por su parte trasera.

const { chromium } = require('playwright');
const fs = require('fs');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const motor = fs.readFileSync(__dirname + '/redstone/redstone.js', 'utf8');
  const piezas = fs.readFileSync(__dirname + '/redstone/redstone-piezas.js', 'utf8');

  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();

  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForTimeout(2000);
  await p.evaluate(motor);
  await p.evaluate(piezas);

  const res = await p.evaluate(async () => {
    const out = { log: [] };
    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)];
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || null;

    // Cargar materiales si no están
    const matObs = 'hab:observador@0', matObsOn = 'hab:observador-on@0', matRoca = 'hab:roca@0', matCable = 'hab:cable@0';
    for (const m of ['hab:observador', 'hab:observador-on', 'hab:roca', 'hab:cable', 'hab:cable-on']) {
      if (!mc.name2id[m]) {
        try { await game.addMaterial(m); } catch(e){}
      }
    }

    // Buscar zona libre
    let ox = 10, oy = 10, oz = 10;
    // Colocar observador en (ox, oy, oz) orientado a @0 (frente a +X (11,10,10), trasera a -X (9,10,10))
    const idObs = mc.name2id['hab:observador@0'] || mc.name2id['hab:observador'];
    const idCable = mc.name2id['hab:cable@0'] || mc.name2id['hab:cable'];
    const idRoca = mc.name2id['hab:roca@0'] || mc.name2id['hab:roca'];

    mcSetBlock(ox, oy, oz, idObs);
    mcSetBlock(ox - 1, oy, oz, idCable); // Parte trasera (-X)

    // Inicialmente no emite
    const potInicial = game.redstone._potencia.get((ox - 1) + ',' + oy + ',' + oz) || 0;
    out.potInicial = potInicial;

    // Cambiar bloque enfrente (+X)
    mcSetBlock(ox + 1, oy, oz, idRoca);

    // Procesar la cola de redstone para propalar la señal al cable trasero
    game.redstone.tick();

    // Estado inmediatamente durante el pulso
    out.potDurantePulso = game.redstone._potencia.get(ox + ',' + oy + ',' + oz) || 0;
    out.potTraseraDurantePulso = game.redstone._potencia.get((ox - 1) + ',' + oy + ',' + oz) || 0;
    out.claveDurante = claveEn(ox, oy, oz);
    out.frenteObs = game.redstone.info ? game.redstone.info(ox, oy, oz) : null;
    out.cableInfo = game.redstone.info ? game.redstone.info(ox - 1, oy, oz) : null;

    // Esperar a que pase el pulso (150ms)
    await new Promise(r => setTimeout(r, 150));
    out.potTraseraDespues = game.redstone._potencia.get((ox - 1) + ',' + oy + ',' + oz) || 0;
    out.claveDespues = claveEn(ox, oy, oz);

    return out;
  });

  ok('Observador arranca apagado sin emision', res.potInicial === 0, 'potencia=' + res.potInicial);
  ok('Al cambiar bloque enfrente, se activa (hab:observador-on)', res.claveDurante.indexOf('hab:observador-on') >= 0, 'clave=' + res.claveDurante);
  ok('Emite señal 15 a su parte trasera durante el pulso', res.potTraseraDurantePulso === 15, 'potencia trasera=' + res.potTraseraDurantePulso);
  ok('Tras el pulso (~100ms) vuelve a apagarse (hab:observador)', res.claveDespues.indexOf('hab:observador-on') < 0, 'clave final=' + res.claveDespues);

  await b.close();
  process.exit(fallos ? 1 : 0);
})();
