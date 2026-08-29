// @area: mundo
// @necesita: servidor, playwright
// SONDA: una pieza GIRADA (`…@N`) puesta en un mapa que nunca tuvo esa pieza se escribe en la rejilla
// pero NO se dibuja hasta recargar. Foto del dueño (2026-08-28): rayos-X enseña `casita@2` y `casita@3`
// en sus celdas, vacías a la vista, mientras la `casita` sin girar de al lado sí se ve.
//
// La primera sospecha (que `mc.structs` se llenara con el `@N` y el mallador leyera la base) quedó
// DESCARTADA midiéndola: salen las dos claves con dibujo. Así que aquí se mira lo siguiente hacia
// abajo —las tablas por-id que construye la paleta y el remallado— y sobre todo se mira LA PANTALLA,
// que es el único sitio donde el dueño ve el fallo.
//
// El material se elige SOLO: hace falta uno que este mapa no tenga todavía (esa es la condición del
// bug), y `casita` ya no sirve en cuanto la sonda corre una vez, porque la paleta se guarda con el
// mundo.
//
//   node tests/probe_casita_ori_structs.js [url]
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/empty';
// Se puede forzar la pieza por argumento: la del dueño es `casita`, y el bug puede ser SUYO y no
// general —`seiheki` sale bien girada—, así que hay que poder pedirla por su nombre.
const CANDIDATOS = process.argv[3] ? [process.argv[3]]
  : ['seiheki', 'minisilla', 'chokurei', 'escalera', 'llama-decoracion', 'mini-lampara', 'rejilla'];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active && typeof game!=="undefined"', null, { timeout: 180000 });
  await page.waitForTimeout(6000);

  const P = (t, o) => console.log('\n' + t + '\n   ' + JSON.stringify(o));

  const elegido = await page.evaluate(cands => {
    for (const n of cands) {
      const k = mcClaveDeNombre(n);
      if (!k || !/^hab:/.test(k)) continue;
      if ((mc.blockKey || []).some(b => mcClaveBase(String(b)) === k)) continue;   // este mapa ya lo tiene
      return { nombre: n, clave: k };
    }
    return null;
  }, CANDIDATOS);
  P('0 · pieza que este mapa NUNCA ha tenido (es la condición del bug)', elegido);
  if (!elegido) { console.log('\n⛔ todos los candidatos ya están en la paleta: hace falta un mapa limpio.'); await browser.close(); return; }

  // Las dos, lado a lado y a la vez, como en la foto: girada y recta. Se ponen en el MISMO instante
  // para que compartan la misma autocarga — así lo único que las diferencia es el `@N`.
  // LAS TRES SEGUIDAS Y SIN ESPERAR ENTRE MEDIAS, que es como lo hace el dueño a mano: colocar, girar
  // con R, colocar, girar, colocar. Esa es la diferencia con la primera versión de esta sonda, que
  // esperaba entre una y otra y por eso salía todo bien: la recta dispara la carga del material y las
  // giradas caen DENTRO de esa ventana (`mc.paletaEnObra`), que es lo único que las distingue.
  const C = await page.evaluate(k => {
    const x = Math.floor(mc.pos[0]), y = Math.floor(mc.pos[1]), z = Math.floor(mc.pos[2]) - 5;
    setVoxel(x + 1, y, z, k);                        // RECTA  (la que dispara la autocarga)
    setVoxel(x - 1, y, z, mcClaveConOri(k, 2));      // GIRADA @2
    setVoxel(x - 3, y, z, mcClaveConOri(k, 3));      // GIRADA @3
    window.__R = [x + 1, y, z]; window.__G = [x - 1, y, z]; window.__G3 = [x - 3, y, z];
    // Vista: unos pasos por detrás y mirando a -Z (yaw=0), para que las tres entren en cuadro.
    mc.pos[0] = x - 1; mc.pos[1] = y + 1; mc.pos[2] = z + 5; mc.yaw = 0; mc.pitch = -0.05;
    return { recta: window.__R, girada2: window.__G, girada3: window.__G3, paletaEnObra: !!mc.paletaEnObra };
  }, elegido.clave);
  P('1 · puestas', C);
  await page.waitForTimeout(8000);                   // que la autocarga aterrice y se remalle

  P('2 · qué dice el motor de cada una', await page.evaluate(() => {
    const mira = c => {
      const id = mc.grid[mcIdx(c[0], c[1], c[2])], k = id ? mc.blockKey[id] : null;
      return {
        id, clave: k,
        structsBase: !!(k && mc.structs[mcClaveBase(k)] && mc.structs[mcClaveBase(k)].cells),
        structsExacta: !!(k && mc.structs[k] && mc.structs[k].cells),
        finoRejilla: !!(mc.finoRejilla && mc.finoRejilla[id]),
        geoFina: !!(mc._geoFina && mc._geoFina[id]),
        cabeEnRejilla: (typeof mcCabeEnRejilla === 'function' && k) ? mcCabeEnRejilla(k) : null
      };
    };
    return { recta: mira(window.__R), girada2: mira(window.__G), girada3: mira(window.__G3) };
  }));

  await page.screenshot({ path: '/tmp/probe_ori_antes.png' });

  // EL ORÁCULO DEL DUEÑO: «si refresco entonces sí salen». Es lo único que distingue este bug de un
  // problema de estado del motor, porque todo lo medido arriba sale idéntico en la recta y en las
  // giradas. Se recarga, se vuelve a la MISMA cámara y se compara foto con foto.
  const cam = await page.evaluate(() => ({ p: [...mc.pos], yaw: mc.yaw, pitch: mc.pitch }));
  await page.reload({ waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.grid && mc.active', null, { timeout: 180000 });
  await page.waitForTimeout(9000);
  await page.evaluate(c => { mc.pos[0] = c.p[0]; mc.pos[1] = c.p[1]; mc.pos[2] = c.p[2]; mc.yaw = c.yaw; mc.pitch = c.pitch; }, cam);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/probe_ori_tras_recargar.png' });

  console.log('\n   fotos: /tmp/probe_ori_antes.png · /tmp/probe_ori_tras_recargar.png');
  console.log('   (de izquierda a derecha: GIRADA @3 · GIRADA @2 · RECTA)');
  console.log('\n(quedan 2 bloques «' + elegido.nombre + '» puestos en ' + JSON.stringify(C) + ')');
  await browser.close();
})();
