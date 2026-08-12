// @area: general
// @necesita: servidor, playwright
// test_intro.js — REQ-INTRO1: la intro por URL (?intro=1) = vuelo automatico + menu JUGAR/CONSTRUIR.
//
//   node tests/test_intro.js [url]      por defecto http://localhost:8500/map/test
//
// El mapa de verdad de la intro es /map/fps (512x512x40, 20 MB): bajo SwiftShader no carga, asi que el
// guardian corre sobre /map/test. Lo que NO se falsea es el codigo de la intro: se sirve el snippet REAL
// `data/snippets/arranque-fps.json` bajo el nombre que le toca a este mapa (`arranque-test`), interceptando
// la peticion con p.route. Asi este test protege el snippet que el dueño va a usar, no una maqueta.
//
// Los dos casos que de verdad protege:
//   - `/map/test` A SECAS entra exactamente como siempre (§1). Ese era el trato: la intro no cambia nada.
//   - JUGAR **no recarga la pagina** (§4): el mapa ya esta cargado, y eso era el encargo literal.
//
// No escribe nada: los POST de guardado se bloquean y el mapa se deja como estaba (la intro solo mueve
// la camara).

const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8500/map/test';
const MAPA = (BASE.match(/\/map\/([^/?#]+)/) || [, 'test'])[1];
let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function abrir(b, url) {
  const p = await b.newPage();
  p.on('pageerror', e => { p.__errores.push('EXCEPCION ' + e.message); });
  p.__errores = [];
  await p.route('**/api/mundo**', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());
  // REQ-INTRO2 · el snippet NO se simula: /map/test no tiene 'arranque-test', asi que lo que corre es
  // la intro GENERICA que sirve el servidor de verdad. Aqui solo se anota QUE se pidio y CUANDO, que es
  // como se comprueba el respaldo (§2) y que volver del editor no vuelve a bajar el mundo (§7).
  p.__red = [];
  p.on('request', r => p.__red.push({ url: r.url(), metodo: r.method(), t: Date.now() }));
  // Quien se descubre y cuando. Se anota con un MutationObserver y NO muestreando cada frame: el snippet
  // de autoarranque BLOQUEA el hilo, asi que un muestreo por rAF se saltaria justo el tramo que importa.
  // Con `attributeOldValue`, cada registro se lee solo: si antes no habia `hidden`, ahora si lo hay.
  await p.addInitScript(() => {
    window.__seq = [];
    new MutationObserver(ms => {
      for (const m of ms) {
        const id = m.target.id;
        if (id === 'mc-loading' || id === 'mc-osd') window.__seq.push({ id, oculto: m.oldValue === null });
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
  });
  await p.goto(url, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.osd', null, { timeout: 60000 });
  return p;
}

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });

  // ── §1 · sin ?intro=1 no pasa absolutamente nada ────────────────────────────────────────────────
  const seca = await abrir(b, BASE);
  await seca.waitForTimeout(3000);
  const normal = await seca.evaluate(() => ({
    intro: mc._intro || null, volar: mc.volar, fantasma: mc.fantasma,
    osd: game.osd.abierta, capa: $('#mc-osd').hidden, pantallas: game.osd.pantallas().length
  }));
  test('§1 /map/' + MAPA + ' a secas entra como siempre: ni intro, ni vuelo, ni menu', () => {
    assert(!normal.intro, 'hay una intro corriendo sin pedirla');
    assert(normal.volar === false && normal.fantasma === false, 'el jugador arranca volando');
    assert(normal.osd === null && normal.capa, 'el menu OSD sale sin pedirlo');
    assert(normal.pantallas === 0, 'se han definido ' + normal.pantallas + ' pantallas sin pedirlo');
  });
  const erroresSeca = seca.__errores.slice();
  await seca.close();

  // ── §2 · con ?intro=1 arranca la intro ─────────────────────────────────────────────────────────
  const p = await abrir(b, BASE + (BASE.indexOf('?') < 0 ? '?intro=1' : '&intro=1'));
  await p.waitForFunction('mc._intro && game.osd.abierta === "intro"', null, { timeout: 60000 });
  const vistos = () => p.evaluate(() => {
    const vis = sel => { const e = $(sel); if (!e) return false; const s = getComputedStyle(e); return s.display !== 'none' && !e.hidden; };
    return { clase: document.body.classList.contains('mc-intro'), hotbar: vis('#mc-hotbar'),
             mira: vis('#mc-crosshair'), codigo: vis('#mc-code-btn'), cerrar: vis('#mc-close') };
  });
  const arranque = await p.evaluate(() => ({
    volar: mc.volar, fantasma: mc.fantasma, osd: game.osd.abierta,
    botones: Array.from($('#mc-osd').querySelectorAll('button')).map(x => x.textContent.trim()),
    acciones: game.osd.acciones()
  }));
  // Los botones de la esquina van APAGADOS por defecto (`game.showOSDbuttons`), y el dueño los tiene
  // encendidos — que es por lo que los vio durante la intro. Se encienden aquí a propósito: lo que hay
  // que comprobar es que la intro los tapa IGUAL, y que JUGAR devuelve la decisión de ese ajuste.
  await p.evaluate(() => game.showOSDbuttons(true));
  const chrome = await vistos();
  test('§2 ?intro=1 pone al jugador en vuelo fantasma', () => {
    assert(arranque.volar === true, 'mc.volar = ' + arranque.volar);
    assert(arranque.fantasma === true, 'mc.fantasma = ' + arranque.fantasma + ' (la orbita chocaria con un arbol)');
  });
  test('§2 …y abre el menu con JUGAR y CONSTRUIR', () => {
    assert(arranque.osd === 'intro', 'game.osd.abierta = ' + arranque.osd);
    assert(arranque.botones.join(',') === 'JUGAR,CONSTRUIR', 'botones = ' + arranque.botones.join(','));
    assert(arranque.acciones.indexOf('JUGAR') >= 0 && arranque.acciones.indexOf('CONSTRUIR') >= 0,
      'acciones registradas = ' + arranque.acciones.join(','));
  });

  // REQ-INTRO2 · y todo lo de arriba ha pasado en un mapa que NO tiene snippet propio: /map/test no
  // tiene 'arranque-test'. Eso es el encargo («cualquier mapa, no solo fps, acepta ?intro=1»): se pide
  // el del mapa, no esta, y se cae en la intro generica. Si algun dia alguien crea 'arranque-test', esta
  // comprobacion se apaga sola con un aviso en vez de mentir diciendo que el respaldo funciona.
  const propio = await p.evaluate(n => fetch('/api/snippets/arranque-' + n).then(r => r.status), MAPA);
  const pedidos = p.__red.filter(r => /\/api\/snippets\/arranque-/.test(r.url)).map(r => r.url.split('/').pop());
  test('§2 un mapa SIN intro propia tambien la tiene: respaldo en «arranque-intro»', () => {
    if (propio !== 404) { console.log('        (aviso: existe arranque-' + MAPA + ', el respaldo no se ejerce aqui)'); return; }
    assert(pedidos.indexOf('arranque-' + MAPA) >= 0, 'no se ha llegado a pedir la intro propia del mapa');
    assert(pedidos.indexOf('arranque-intro') >= 0, 'no se ha pedido la intro generica: pedidos = ' + pedidos.join(','));
  });

  // Durante el sobrevuelo esto no es una partida todavia, es una postal: los mandos sobran.
  test('§2 …y quita de la vista los mandos: hotbar, mira y los botones «Codigo» y «Cerrar»', () => {
    assert(chrome.clase, 'no se ha puesto la clase body.mc-intro');
    assert(!chrome.hotbar, 'la hotbar (pickerbar) sale durante la intro');
    assert(!chrome.mira, 'la mira sale durante la intro');
    assert(!chrome.codigo && !chrome.cerrar, 'los botones de la esquina salen durante la intro');
  });

  // El mundo NO se enseña a medias. `mundo-autoarranque` son 274 KB de snippet que bloquean el hilo
  // varios segundos en un mapa grande, y ese tramo estaba a la vista: primero con el visitante de pie en
  // el suelo esperando (~10 s en /map/fps), y luego —al adelantar la intro— con el menu puesto y la
  // camara congelada sin volar. Ahora el cartel de carga se queda puesto hasta que hay algo que enseñar.
  const seq = await p.evaluate(() => window.__seq.slice());
  const iOsd = seq.findIndex(s => s.id === 'mc-osd' && !s.oculto);
  const cartelPuesto = seq.filter(s => s.id === 'mc-loading' && !s.oculto).length;
  const iUltimoCartelQuitado = seq.reduce((acc, s, i) => (s.id === 'mc-loading' && s.oculto ? i : acc), -1);
  test('§2 el cartel de carga se queda puesto mientras corre el autoarranque', () =>
    assert(cartelPuesto >= 2, 'el cartel solo se ha puesto ' + cartelPuesto + ' vez/veces: no hay tramo «Preparando…»'));
  test('§2 …y el menu no se descubre hasta que el cartel se ha quitado', () => {
    assert(iOsd >= 0, 'el menu no llego a mostrarse');
    assert(iUltimoCartelQuitado >= 0 && iUltimoCartelQuitado < iOsd,
      'el menu sale con el cartel de carga todavia encima (secuencia: ' +
      seq.map(s => s.id + (s.oculto ? '−' : '+')).join(' ') + ')');
  });

  // ── §3 · la camara pasea de verdad, y por encima del terreno ───────────────────────────────────
  const a = await p.evaluate(() => mc.pos.slice());
  await p.waitForTimeout(2500);
  const vuelo = await p.evaluate((antes) => {
    const cima = (x, z) => { x = Math.floor(x); z = Math.floor(z); if (!mcInside(x, 0, z)) return -1;
      for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(x, y, z)]) return y; return -1; };
    const p2 = mc.pos.slice();
    return { movido: Math.hypot(p2[0] - antes[0], p2[2] - antes[2]), pos: p2,
             sobreElSuelo: p2[1] - (cima(p2[0], p2[2]) + 1), dentro: mcInside(Math.floor(p2[0]), 0, Math.floor(p2[2])) };
  }, a);
  test('§3 la camara se mueve sola (la animacion se genera en tiempo real)', () =>
    assert(vuelo.movido > 0.5, 'se ha movido ' + vuelo.movido.toFixed(2) + ' celdas en 2,5 s'));
  test('§3 …volando por encima del terreno y sin salirse del mapa', () => {
    assert(vuelo.dentro, 'la orbita se sale del mapa: ' + JSON.stringify(vuelo.pos));
    assert(vuelo.sobreElSuelo > 1, 'vuela a ' + vuelo.sobreElSuelo.toFixed(1) + ' celdas del suelo (¿enterrada?)');
  });

  // ── §4 · reejecutar el snippet no apila dos bucles ─────────────────────────────────────────────
  // Es la regla del envoltorio de mcUpdate: el dueño reejecuta el snippet en vivo mientras lo edita, y
  // dos bucles moviendo la misma camara se ven como un temblor que nadie sabe de donde sale.
  const doble = await p.evaluate(async () => {
    const viejo = mc._intro;
    await mcIntroArranque();              // a mano: asi la prueba el dueño mientras la edita
    const trasManual = mc._intro;
    await mcIntroArranque(true);          // la del arranque: de una sola vez
    return { mismoObjeto: trasManual === viejo, viejoVivo: viejo.viva,
             nuevoVivo: !!(trasManual && trasManual.viva), pestillo: mc._intro === trasManual };
  });
  test('§4 reejecutar la intro para la anterior en vez de apilarla', () => {
    assert(!doble.mismoObjeto, 'mc._intro no se ha renovado');
    assert(doble.viejoVivo === false, 'el bucle viejo sigue vivo moviendo la camara');
    assert(doble.nuevoVivo === true, 'el bucle nuevo no esta corriendo');
  });
  // openWorld se vuelve a ejecutar al volver del editor: sin pestillo, la intro se replantaria encima
  // de alguien que ya le dio a JUGAR y se habia puesto a jugar.
  test('§4 …pero la llamada del arranque es de UNA sola vez', () =>
    assert(doble.pestillo, 'mcIntroArranque(true) ha vuelto a montar la intro'));

  // ── §5 · JUGAR: aterriza sin recargar ──────────────────────────────────────────────────────────
  await p.evaluate(() => { window.__marca = 'esta pagina no se ha recargado'; });
  const btn = await p.waitForSelector('#mc-osd button:has-text("JUGAR")', { timeout: 10000 });
  await btn.click();
  await p.waitForTimeout(300);
  const jugando = await p.evaluate(() => {
    const x = Math.floor(mc.pos[0]), z = Math.floor(mc.pos[2]);
    return {
      marca: window.__marca, intro: mc._intro || null, volar: mc.volar, fantasma: mc.fantasma,
      osd: game.osd.abierta, capa: $('#mc-osd').hidden,
      pies: mc.pos.slice(), suelo: mcSolid(x, Math.floor(mc.pos[1]) - 1, z),
      dentroDeSolido: mcSolid(x, Math.floor(mc.pos[1]), z)
    };
  });
  test('§5 JUGAR no recarga la pagina (el mapa ya esta cargado: era el encargo)', () =>
    assert(jugando.marca === 'esta pagina no se ha recargado', 'la pagina se ha recargado'));
  test('§5 …para el bucle y devuelve el mando: sin vuelo y sin fantasma', () => {
    assert(!jugando.intro, 'la intro sigue corriendo despues de JUGAR');
    assert(jugando.volar === false, 'sigue en modo vuelo');
    assert(jugando.fantasma === false, 'sigue atravesando el terreno');
  });
  test('§5 …cierra el menu', () =>
    assert(jugando.osd === null && jugando.capa, 'el menu sigue abierto (' + jugando.osd + ')'));
  const trasJugar = await vistos();
  test('§5 …y DEVUELVE los mandos: ahi si empieza la partida', () => {
    assert(!trasJugar.clase, 'la clase body.mc-intro sigue puesta despues de JUGAR');
    assert(trasJugar.codigo && trasJugar.cerrar, 'los botones de la esquina no han vuelto');
  });
  test('§5 …y deja al jugador de pie sobre la superficie, no dentro de la roca ni en el aire', () => {
    assert(!jugando.dentroDeSolido, 'ha aterrizado DENTRO de un bloque: ' + JSON.stringify(jugando.pies));
    assert(jugando.suelo, 'no hay suelo bajo los pies: ' + JSON.stringify(jugando.pies));
  });

  // ── §6 · una tecla de moverse corta la intro ───────────────────────────────────────────────────
  await p.evaluate(() => mcIntroArranque());
  await p.waitForFunction('mc._intro && game.osd.abierta === "intro"', null, { timeout: 30000 });
  await p.keyboard.press('KeyW');
  await p.waitForTimeout(300);
  const cortada = await p.evaluate(() => ({ intro: mc._intro || null, osd: game.osd.abierta, volar: mc.volar }));
  test('§6 quien ya sabe lo que quiere no espera: una tecla de moverse cae en JUGAR', () => {
    assert(!cortada.intro, 'la tecla no ha cortado la intro');
    assert(cortada.osd === null, 'el menu sigue abierto tras teclear');
    assert(cortada.volar === false, 'sigue volando tras teclear');
  });

  // ── §7 · CONSTRUIR y la vuelta por la marca: ida y vuelta SIN recargar (REQ-INTRO2) ────────────
  // El editor 2D/3D esta DEBAJO, en la misma pagina: el Mundo es el overlay #mc-modal. Asi que ir y
  // volver no puede costar una recarga — que es volver a bajar mundo, atlas y galerias enteras.
  await p.evaluate(() => { window.__marca2 = 'ida y vuelta sin recargar'; mcIntroArranque(); });
  await p.waitForFunction('mc._intro && game.osd.abierta === "intro"', null, { timeout: 60000 });
  const t0 = Date.now();
  await (await p.waitForSelector('#mc-osd button:has-text("CONSTRUIR")', { timeout: 10000 })).click();
  await p.waitForTimeout(300);
  const editor = await p.evaluate(() => ({
    marca: window.__marca2, activo: mc.active, modal: $('#mc-modal').hidden,
    intro: mc._intro || null, osd: game.osd.abierta, volar: mc.volar,
    clicable: !!($('#marca-inicio') && $('#marca-inicio').classList.contains('clicable'))
  }));
  test('§7 CONSTRUIR descubre el editor sin recargar la pagina', () => {
    assert(editor.marca === 'ida y vuelta sin recargar', 'la pagina se ha recargado al ir al editor');
    assert(editor.modal && editor.activo === false, 'el Mundo sigue delante (modal oculto=' + editor.modal + ')');
  });
  test('§7 …y deja la intro parada detras, no corriendo a ciegas', () => {
    assert(!editor.intro, 'el bucle de la intro sigue vivo con el Mundo cerrado');
    assert(editor.osd === null, 'el menu sigue abierto (' + editor.osd + ')');
    assert(editor.volar === false, 'se ha quedado en modo vuelo');
  });
  test('§7 …y la marca «VOXELFORGE» se vuelve el camino de vuelta', () =>
    assert(editor.clicable, 'la marca no se ha marcado como pulsable: no hay forma de volver'));

  await p.click('#marca-inicio');
  await p.waitForFunction('mc.active && mc._intro && game.osd.abierta === "intro"', null, { timeout: 60000 });
  const vuelta = await p.evaluate(() => ({
    marca: window.__marca2, modal: $('#mc-modal').hidden, volar: mc.volar, fantasma: mc.fantasma,
    cartel: $('#mc-loading').hidden
  }));
  const rebajado = p.__red.filter(r => r.t >= t0 && r.metodo === 'GET' && /\/api\/mundo/.test(r.url));
  test('§7 la marca vuelve a la intro, tambien sin recargar', () => {
    assert(vuelta.marca === 'ida y vuelta sin recargar', 'la pagina se ha recargado al volver');
    assert(!vuelta.modal, 'el Mundo no ha vuelto a salir');
    assert(vuelta.volar === true && vuelta.fantasma === true, 'la intro no ha vuelto a poner el vuelo fantasma');
  });
  test('§7 …reusando el mundo que ya estaba en memoria (nada de volver a bajarlo)', () =>
    assert(rebajado.length === 0, 'se ha vuelto a descargar el mundo: ' + rebajado.map(r => r.url).join(' ')));
  test('§7 …y el cartel de carga no se queda puesto encima', () =>
    assert(vuelta.cartel, 'el cartel «Preparando el mundo…» ha quedado tapando la intro'));

  const errores = erroresSeca.concat(p.__errores);
  if (errores.length) { console.log('\nERRORES DE PAGINA:'); errores.forEach(e => console.log('  ' + e)); }
  console.log('\n' + ok + ' ok, ' + fallos + ' fallos' + (fallos || errores.length ? '' : '  ·  TODO OK'));
  await b.close();
  process.exit(fallos || errores.length ? 1 : 0);
})();
