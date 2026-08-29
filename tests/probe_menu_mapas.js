const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  await p.goto('http://localhost:8531/map/', { waitUntil: 'networkidle' });
  await p.waitForSelector('.card');

  const card = p.locator('.card[data-nombre="zz-prueba-ren"]');
  await card.click({ button: 'right' });
  await p.waitForSelector('.menu');
  console.log('menú:', await p.locator('.menu button').allTextContents());

  // default: Renombrar tiene que estar deshabilitado
  await p.keyboard.press('Escape');
  await p.locator('.card[data-nombre="default"]').click({ button: 'right' });
  console.log('default · renombrar disabled =',
    await p.locator('.menu button[data-a="renombrar"]').isDisabled());
  await p.keyboard.press('Escape');

  // Duplicar con nombre "sucio": el slug se enseña antes de aceptar
  await card.click({ button: 'right' });
  await p.locator('.menu button[data-a="duplicar"]').click();
  await p.waitForSelector('.dlg');
  console.log('valor por defecto:', await p.locator('#dlg-n').inputValue());
  await p.fill('#dlg-n', 'ZZ Menú Prueba!!');
  console.log('slug avisado:', await p.locator('#dlg-slug').textContent());
  await p.fill('#dlg-n', 'empty');
  console.log('choque:', await p.locator('#dlg-err').textContent(),
              '· botón bloqueado =', await p.locator('#dlg-si').isDisabled());
  await p.fill('#dlg-n', 'zz-menu-prueba');
  await p.locator('#dlg-si').click();
  await p.waitForSelector('.card[data-nombre="zz-menu-prueba"]', { timeout: 20000 });
  console.log('DUPLICADO en el listado sin recargar ✓');

  // Renombrar el duplicado
  await p.locator('.card[data-nombre="zz-menu-prueba"]').click({ button: 'right' });
  await p.locator('.menu button[data-a="renombrar"]').click();
  await p.fill('#dlg-n', 'zz-menu-renombrado');
  await p.locator('#dlg-si').click();
  await p.waitForSelector('.card[data-nombre="zz-menu-renombrado"]', { timeout: 20000 });
  console.log('RENOMBRADO ✓ · el nombre viejo sigue =',
    await p.locator('.card[data-nombre="zz-menu-prueba"]').count());
  await b.close();
})();
