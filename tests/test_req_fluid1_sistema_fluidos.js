// @area=fluidos
// @necesita=servidor
// Test de verificación de REQ-FLUID1: Sistema de fluidos estilo Minecraft (Agua y Lava)

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  let pass = 0, fail = 0;
  function t(name, cond, info) {
    if (cond) {
      console.log('  ok  ' + name + (info ? '   (' + info + ')' : ''));
      pass++;
    } else {
      console.log('  FAIL ' + name + (info ? '   (' + info + ')' : ''));
      fail++;
    }
  }

  try {
    await page.goto('http://localhost:8500/map/test', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game && window.game.fluidos && mc && mc.grid, null, { timeout: 15000 });
    await page.evaluate(async () => { if(window.game && game.addMaterial) { await game.addMaterial('agua'); await game.addMaterial('lava'); } });

    // 1. Verificación de propiedades de bloques y fluidos
    const propTests = await page.evaluate(() => {
      const g = game.fluidos;
      const airProps = g.getProps(0);
      const stoneProps = g.getProps('roca');
      const waterSource = g.getProps('hab:agua');
      const waterFlowing = g.getProps('hab:agua-3');
      const lavaSource = g.getProps('hab:lava');
      const lavaFlowing = g.getProps('hab:lava-2');

      return {
        air: airProps.isReplaceable && !airProps.isFluid && airProps.fluidType === 'NONE',
        stone: !stoneProps.isReplaceable && !stoneProps.isFluid && stoneProps.fluidType === 'NONE',
        waterSrc: waterSource.isReplaceable && waterSource.isFluid && waterSource.fluidType === 'WATER' && waterSource.fluidLevel === 0,
        waterFlow: waterFlowing.isReplaceable && waterFlowing.isFluid && waterFlowing.fluidType === 'WATER' && waterFlowing.fluidLevel === 3,
        lavaSrc: lavaSource.isReplaceable && lavaSource.isFluid && lavaSource.fluidType === 'LAVA' && lavaSource.fluidLevel === 0,
        lavaFlow: lavaFlowing.isReplaceable && lavaFlowing.isFluid && lavaFlowing.fluidType === 'LAVA' && lavaFlowing.fluidLevel === 2
      };
    });

    t('AIR tiene isReplaceable=true e isFluid=false', propTests.air);
    t('Bloque sólido roca tiene isReplaceable=false e isFluid=false', propTests.stone);
    t('Agua origen (hab:agua) tiene isFluid=true, level=0 y type=WATER', propTests.waterSrc);
    t('Agua fluida (hab:agua-3) tiene isFluid=true, level=3 y type=WATER', propTests.waterFlow);
    t('Lava origen (hab:lava) tiene isFluid=true, level=0 y type=LAVA', propTests.lavaSrc);
    t('Lava fluida (hab:lava-2) tiene isFluid=true, level=2 y type=LAVA', propTests.lavaFlow);

    // 2. Verificación de flujo vertical y horizontal
    const flowResult = await page.evaluate(() => {
      // Limpiar zona de pruebas (5, 5, 5) a (5, 1, 5)
      for (let y = 1; y <= 5; y++) {
        mcSetBlock(5, y, 5, 0);
        mcSetBlock(6, y, 5, 0);
        mcSetBlock(4, y, 5, 0);
      }
      // Suelo sólido en y=1
      mcSetBlock(5, 1, 5, mcResolveMat('roca'));
      mcSetBlock(6, 1, 5, mcResolveMat('roca'));
      mcSetBlock(4, 1, 5, mcResolveMat('roca'));
      // Suelo en y=2 limpia para que el agua caiga desde y=4 a y=2
      mcSetBlock(5, 2, 5, 0);
      mcSetBlock(6, 2, 5, 0);
      mcSetBlock(4, 2, 5, 0);

      // Colocar agua origen en (5, 4, 5)
      game.fluidos.setFluid(5, 4, 5, 'WATER', 0);
      // `tick(true)` = «dame UN paso», que es lo que esta prueba mide. Sin el `true` se pide «un paso
      // si toca», y desde la optimizacion a 120 FPS solo toca cada 90 ms de reloj: tres tick() seguidos
      // daban un solo paso y el agua se quedaba arriba. La cadencia sigue viva para el bucle de frame.
      game.fluidos.tick(true); // Tick 1: cae a (5, 3, 5)
      const step1Below = game.fluidos.info(5, 3, 5);

      game.fluidos.tick(true); // Tick 2: cae a (5, 2, 5)
      const step2Below = game.fluidos.info(5, 2, 5);

      game.fluidos.tick(true); // Tick 3: al haber suelo en y=1, se extiende a (6, 2, 5) y (4, 2, 5)
      const step3Side = game.fluidos.info(6, 2, 5);
      return {
        step1: step1Below.isFluid && step1Below.fluidLevel === 1,
        step2: step2Below.isFluid && step2Below.fluidLevel === 1,
        step3: step3Side.isFluid && step3Side.fluidLevel === 2
      };
    });

    t('Flujo vertical: el agua cae verticalmente con nivel=1', flowResult.step1 && flowResult.step2);
    t('Flujo horizontal: al llegar al suelo se extiende horizontalmente con nivel=2', flowResult.step3);

    // 3. Verificación de recesión y desaparición
    const recedeResult = await page.evaluate(() => {
      // Quitar fuente de (5, 4, 5)
      mcSetBlock(5, 4, 5, 0);
      game.fluidos.tick(true); // (5, 3, 5) pierde fuente y desaparece
      game.fluidos.tick(true); // (5, 2, 5) pierde fuente y desaparece
      game.fluidos.tick(true); // (6, 2, 5) pierde fuente y desaparece

      const f4 = game.fluidos.info(5, 4, 5);
      const f3 = game.fluidos.info(5, 3, 5);
      const f2 = game.fluidos.info(5, 2, 5);
      const fSide = game.fluidos.info(6, 2, 5);

      return !f4.isFluid && !f3.isFluid && !f2.isFluid && !fSide.isFluid;
    });

    t('Recesión: al quitar el origen todos los bloques de fluido fluyentes desaparecen', recedeResult);

    // 4. Caso de integración: Verificación de puente de pistón (Requirement 4)
    const pistonTest = await page.evaluate(async () => {
      // ⚠️ `tick(true)` NO es «un paso del mundo»: procesa 32 celdas como mucho y se corta a las 8 si
      // lleva más de 1,2 ms de reloj (`app.js`, el bucle de `tick`). Cuántas llamadas hacen falta
      // depende, pues, de lo que quede en la cola y de lo rápida que vaya la máquina — y aquí quedaban
      // las celdas del agua de la sección anterior. Por eso este bloque salía 10 ok / 2 fallos en una
      // pasada y 11 ok / 1 fallo en la siguiente (2026-09-02): el test medía el presupuesto del tick.
      // Los ticks contados de arriba se quedan como están, que allí el número de pasos SÍ es el examen;
      // aquí lo que se prueba es que la roca tapa y que al quitarla el origen vuelve a llenar.
      const asienta = () => { for (let i = 0; i < 200 && game.fluidos.queueSize(); i++) game.fluidos.tick(true); };
      asienta();

      // 1. Colocar LAVA_SOURCE (nivel 0) en (10, 2, 10)
      mcSetBlock(10, 1, 10, mcResolveMat('roca')); // Suelo bajo lava en (10, 0, 10)
      mcSetBlock(10, 0, 10, mcResolveMat('roca'));
      mcSetBlock(11, 0, 10, mcResolveMat('roca'));
      mcSetBlock(10, 2, 10, 0);
      mcSetBlock(10, 1, 10, 0);

      game.fluidos.setFluid(10, 2, 10, 'LAVA', 0);
      asienta(); // cae a (10, 1, 10) y se extiende a (11, 1, 10)

      const lavaBefore = game.fluidos.info(10, 1, 10);

      // 2. Colocar bloque STONE (roca) en (10, 1, 10) reemplazando la lava
      mcSetBlock(10, 1, 10, mcResolveMat('roca'));
      asienta();

      const stonePushed = game.fluidos.info(10, 1, 10);
      const lavaSideAfterStone = game.fluidos.info(11, 1, 10);

      // 3. Retirar el bloque STONE dejando AIR en (10, 1, 10)
      mcSetBlock(10, 1, 10, 0);
      asienta(); // el origen de (10, 2, 10) vuelve a llenar (10, 1, 10) con lava

      const lavaRefilled = game.fluidos.info(10, 1, 10);

      return {
        lavaBefore: lavaBefore.isFluid,
        stonePushed: !stonePushed.isFluid && stonePushed.key.includes('roca'),
        lavaRefilled: lavaRefilled.isFluid && lavaRefilled.fluidType === 'LAVA'
      };
    });

    t('Puente de pistón: la lava fluía antes del bloqueo', pistonTest.lavaBefore);
    t('Puente de pistón: la roca reemplaza directamente la celda de lava sin error', pistonTest.stonePushed);
    t('Puente de pistón: al retirar la roca dejando AIR, el origen vuelve a llenar la celda con lava', pistonTest.lavaRefilled);

  } catch (err) {
    console.error('Error durante la ejecución del test:', err);
    fail++;
  } finally {
    await browser.close();
    console.log(`\nResumen REQ-FLUID1: ${pass} ok, ${fail} fallos.\n`);
    process.exit(fail === 0 ? 0 : 1);
  }
})();
