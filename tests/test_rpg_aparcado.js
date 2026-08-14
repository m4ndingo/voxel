// @area: editor
// @necesita: servidor, playwright
//
// La línea de RPG (Mapa y Jugar) está APARCADA: el código sigue ahí, pero la puerta está cerrada.
// Este guardián fija las tres cosas que el dueño pidió: que no quede rótulo «RPG» a la vista, que
// las dos entradas no salgan en el menú, y que el interruptor `game.rpg.enabled` las devuelva.
// Comprueba también que `irA` está vedado de verdad y no solo escondido: a una vista se llega
// también desde un snippet o desde la consola, y esconder el botón no cierra la puerta.
const { chromium } = require('/root/voxel/node_modules/playwright');

let fallos = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if(!c) fallos++; };

(async () => {
  const b = await chromium.launch({ args:['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport:{ width:1280, height:900 } });
  const errores = [];
  p.on('console', m => { if(m.type() === 'error') errores.push(m.text()); });
  try {
    // `?noauto=1`: la raíz ejecuta el snippet de autoarranque del dueño, que hoy navega a otro mapa.
    await p.goto('http://localhost:8500/?noauto=1', { waitUntil:'networkidle' });
    await p.waitForFunction("typeof window.game !== 'undefined'");

    // 1. Ni un «RPG» a la vista: ni en el título, ni en la marca, ni en ningún texto de la página.
    const rpg = await p.evaluate(() => ({
      titulo: document.title,
      marca: (document.querySelector('.brand small') || {}).textContent || '',
      enTexto: /\bRPG\b/i.test(document.body.innerText)
    }));
    ok(!/\brpg\b/i.test(rpg.titulo), 'el título no dice RPG → ' + JSON.stringify(rpg.titulo));
    ok(!/\brpg\b/i.test(rpg.marca), 'la marca no dice RPG → ' + JSON.stringify(rpg.marca));
    ok(!rpg.enTexto, 'no queda ningún RPG en el texto de la página');

    // 2. Apagado por defecto, y las dos entradas fuera del menú.
    // «⋯» es un CONMUTADOR: hay que abrirlo solo si está cerrado, o la segunda visita lo cierra.
    const abrirMas = () => p.evaluate(() => {
      if(document.getElementById('mas-menu').hidden) document.getElementById('btn-mas').click();
    });

    await abrirMas();
    const ini = await p.evaluate(() => {
      const vis = [...document.querySelectorAll('#mas-menu .menu-item')]
        .filter(e => e.offsetParent !== null).map(e => e.dataset.tab || e.id);
      return { enabled: game.rpg.enabled, vistas: game.rpg.vistas(), visibles: vis };
    });
    ok(ini.enabled === false, 'game.rpg.enabled arranca en false');
    ok(ini.vistas.includes('mapa') && ini.vistas.includes('jugar'),
       'game.rpg.vistas() deriva del HTML lo aparcado → ' + JSON.stringify(ini.vistas));
    ok(!ini.visibles.includes('mapa'), 'Mapa no sale en el menú');
    ok(!ini.visibles.includes('jugar'), 'Jugar no sale en el menú');
    ok(ini.visibles.includes('codigo') && ini.visibles.includes('agentes'),
       'el resto del menú sigue igual → ' + JSON.stringify(ini.visibles));

    // 3. La puerta está cerrada, no solo escondida: llamar al enrutador no abre nada.
    const forzado = await p.evaluate(() => {
      irA('mapa'); irA('jugar');
      return { mapa: !document.getElementById('mapa-modal').hidden, jugando: !!window.playing };
    });
    ok(!forzado.mapa, 'irA("mapa") no abre el overlay estando aparcado');
    ok(!forzado.jugando, 'irA("jugar") no arranca el modo jugar estando aparcado');

    // 4. El interruptor las devuelve.
    await p.evaluate(() => { game.rpg.enabled = true; });
    await abrirMas();
    const on = await p.evaluate(() => {
      const vis = [...document.querySelectorAll('#mas-menu .menu-item')]
        .filter(e => e.offsetParent !== null).map(e => e.dataset.tab || e.id);
      return { enabled: game.rpg.enabled, visibles: vis };
    });
    ok(on.enabled === true, 'game.rpg.enabled = true queda en true');
    ok(on.visibles.includes('mapa') && on.visibles.includes('jugar'),
       'y las dos entradas vuelven al menú → ' + JSON.stringify(on.visibles));

    // 5. `'off'` es una cadena VERDADERA en JS: si no se trata, encendería lo que se quiere apagar.
    const off = await p.evaluate(() => { game.rpg.enabled = 'off'; return game.rpg.enabled; });
    ok(off === false, "game.rpg.enabled = 'off' apaga (no lo toma por verdadero)");

    ok(errores.length === 0, 'consola limpia' + (errores.length ? ': ' + errores.join(' | ') : ''));
  } finally {
    await b.close();
  }
  console.log(fallos ? '\nFALLOS: ' + fallos : '\nOK');
  process.exit(fallos ? 1 : 0);
})();
