// @area: render
// @necesita: servidor, playwright
// test_menu_juego.js — F5.3: el menú de pausa (`menu-juego`).
//
//   node tests/test_menu_juego.js [url]      por defecto http://localhost:8500/map/test
//
// LO QUE DE VERDAD PROTEGE ESTE FICHERO es el §1: que Esc DEJÓ DE TIRAR LA PARTIDA. Sin menú, la
// última pulsación de Esc llama a `closeWorld()` (`app.js:3872`), que es lo contrario de lo que
// espera quien pulsa Esc en un juego. Todo lo demás de aquí son botones; eso es el producto.
//
// Y el §6 es su reverso, que importa igual: `game.menu.off()` tiene que devolver el motor byte a
// byte (ley de oro), o sea que con el menú quitado Esc vuelve a cerrar el Mundo como toda la vida.
// Un envoltorio que no se sabe quitar no cumple la ley de oro aunque funcione.
//
// ⚠️ Se corre contra `/map/test`, NUNCA contra `/map/default` ni `/map/agents`. Aun así este test no
// pone ni rompe un solo bloque: abre menús. Los POST a `/api/mundo` se interceptan igual, porque
// cerrar el Mundo (§6) dispara el guardado y no hay razón para escribir el mapa de nadie.
//
// El `fetch` de INVITAR se sirve desde `page.route`: lo que se comprueba aquí es que el menú dice
// LA COSA CORRECTA ante cada respuesta (enlace, 401, 403), no que el servidor firme bien el vale
// —de eso hay ya un test que no necesita navegador (`tests/test_invitaciones.js`)—.

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8500/map/test';
let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));

  await p.route('**/api/mundo', r => r.request().method() === 'POST' ? r.fulfill({ status: 200, body: '{"ok":true}' }) : r.continue());

  // La respuesta de `/api/invitaciones` la decide el test. Se cambia entre casos escribiendo en
  // `invita`, y así el mismo enrutado sirve para el enlace bueno y para los dos errores.
  let invita = { status: 200, body: JSON.stringify({ ok: true, enlace: 'http://prueba/map/test?invita=VALE', escritura: 'dueno' }) };
  await p.route('**/api/invitaciones', r => r.fulfill({ status: invita.status, contentType: 'application/json', body: invita.body }));

  await p.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc !== "undefined" && mc.prog && mc.grid', null, { timeout: 180000 });
  // El menú lo instala `menu-juego`, que baja `sesion-guardia`, que baja `mundo-autoarranque`: son
  // tres saltos de red, así que se espera al resultado y no a un plazo.
  await p.waitForFunction('window.game && game.menu && game.menu.estado().puesto', null, { timeout: 60000 });
  await p.waitForTimeout(1500);

  const arranque = await p.evaluate(() => ({ version: game.menu.VERSION, abierta: game.osd.abierta, mundo: !$('#mc-modal').hidden }));
  test('§0 el menú se instala solo y no abre nada al entrar', () => {
    assert(arranque.mundo, 'el Mundo no está abierto: el resto del test no probaría nada');
    assert(arranque.abierta === null, 'arranca con la pantalla «' + arranque.abierta + '» abierta');
    assert(/^v\d/.test(arranque.version || ''), 'game.menu.VERSION no dice versión: «' + arranque.version + '»');
  });

  // ── §1 · EL CASO: Esc abre la pausa y NO cierra el Mundo ────────────────────────────────────────
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  const tras = await p.evaluate(() => ({
    abierta: game.osd.abierta,
    mundo: !$('#mc-modal').hidden,
    botones: Array.from(document.querySelectorAll('#mc-osd .mc-osd-btn')).map(b => b.textContent.trim()),
    claves: Array.from(document.querySelectorAll('#mc-osd .mc-osd-btn')).map(b => b.dataset.osd || null)
  }));
  test('§1 Esc abre la pausa al PRIMER golpe y el Mundo sigue abierto', () => {
    assert(tras.mundo, 'Esc cerró el Mundo: es exactamente lo que este menú viene a evitar');
    assert(tras.abierta === 'pausa', 'no se abrió la pausa (abierta: ' + tras.abierta + ')');
  });
  test('§1 la pausa trae las cinco entradas del menú', () => {
    // La quinta cambia de rótulo según haya editor detrás o no (§8): lo que no puede faltar es la
    // entrada, no una palabra concreta.
    const esperadas = ['CONTINUAR', 'INVITAR', 'AJUSTES', 'MIS MUNDOS'];
    for (const e of esperadas) assert(tras.botones.includes(e), 'falta «' + e + '» (hay: ' + tras.botones.join(', ') + ')');
    assert(tras.botones.includes('SALIR') || tras.botones.includes('IR AL EDITOR'),
           'falta la salida (hay: ' + tras.botones.join(', ') + ')');
  });

  // ── §2 · ningún botón muerto ────────────────────────────────────────────────────────────────────
  const volcado = await p.evaluate(() => {
    const d = game.osd.dump();
    const pausa = d.pantallas.find(x => x.nombre === 'pausa');
    return { sinAccion: pausa ? pausa.sinAccion : null, falta: (pausa.botones || []).filter(x => x.falta && x.falta.length).map(x => x.texto) };
  });
  test('§2 ningún botón de la pausa se queda sin acción', () => {
    assert(volcado.sinAccion && volcado.sinAccion.length === 0,
      'botones que no hacen nada al pulsarlos: ' + JSON.stringify(volcado.sinAccion));
  });
  test('§2 las acciones declaran su entorno (game.osd.dump() no marca «falta»)', () => {
    assert(volcado.falta.length === 0, 'acciones con nombres sin resolver: ' + volcado.falta.join(', '));
  });

  // ── §2b · el choque con `miosd`, que es lo que rompió esto de verdad ─────────────────────────────
  //
  // El registro de acciones es UNO SOLO para toda la página y la clave es el texto del botón. Y
  // `mundo-autoarranque` carga primero `sesion-guardia` (que trae este menú) y DESPUÉS `miosd`, el
  // menú del dueño, que registra `AJUSTES` y `VOLAR` con esos nombres pelados. Con las claves a pelo
  // aquí, «AJUSTES» de la pausa abría las FÍSICAS de `miosd` — pasó, y así se descubrió.
  const claves = await p.evaluate(() => {
    const d = game.osd.dump();
    const de = t => (d.acciones.find(a => a.texto === t) || {}).origen || '(no registrada)';
    return { ajustes: de('AJUSTES'), volar: de('VOLAR'), mias: game.osd.acciones().filter(t => t.indexOf('PAUSA:') === 0) };
  });
  claves.pausa = tras.claves;   // lo del DOM ya se leyó arriba; aquí solo se pregunta por el registro
  test('§2b todos los botones de la pausa llevan su clave propia («pausa:…»)', () => {
    assert(claves.pausa.every(k => k && k.indexOf('pausa:') === 0),
      'hay botones identificados por su texto, que es lo que choca con otros menús: ' + JSON.stringify(claves.pausa));
    assert(claves.mias.length >= 5, 'no se registraron las acciones con prefijo: ' + JSON.stringify(claves.mias));
  });
  test('§2b y este menú NO le pisa a `miosd` sus AJUSTES ni su VOLAR', () => {
    assert(!/menu-juego/.test(claves.ajustes), 'AJUSTES (el de miosd) lo registró este menú: ' + claves.ajustes);
    assert(!/menu-juego/.test(claves.volar), 'VOLAR (el de miosd) lo registró este menú: ' + claves.volar);
  });

  // ── §3 · AJUSTES: el botón con estado, que es donde estaba el fallo ──────────────────────────────
  //
  // `game.volar` es una FUNCIÓN-VALOR: `game.volar ? …` es siempre cierto y `game.volar(!game.volar)`
  // apaga siempre. Con ese error el botón ponía «VOLAR: ON» de entrada y no volaba nunca. Por eso se
  // comprueba el ESTADO DEL MOTOR además de la etiqueta: una etiqueta que se conmuta sola sin que el
  // jugador vuele es el mismo fallo con otra cara.
  await p.evaluate(() => game.osd.pulsar('pausa:ajustes'));
  await p.waitForTimeout(200);
  const ajustes = await p.evaluate(() => ({
    titulo: document.querySelector('#mc-osd .mc-osd-title').textContent.trim(),
    etiqueta: document.querySelector('#mc-osd [data-osd="pausa:volar"]').textContent.trim(),
    volando: !!+game.volar
  }));
  test('§3 AJUSTES enseña el vuelo como está de verdad', () => {
    assert(ajustes.titulo === 'AJUSTES', 'no se pintó la pantalla de ajustes (título: ' + ajustes.titulo + ')');
    assert(ajustes.etiqueta === 'VOLAR: ' + (ajustes.volando ? 'ON' : 'OFF'),
      'la etiqueta («' + ajustes.etiqueta + '») no dice lo que hace el motor (volando: ' + ajustes.volando + ')');
  });

  const antes = ajustes.volando;
  await p.evaluate(() => game.osd.pulsar('pausa:volar'));
  await p.waitForTimeout(200);
  const trasVolar = await p.evaluate(() => ({
    etiqueta: document.querySelector('#mc-osd [data-osd="pausa:volar"]').textContent.trim(),
    volando: !!+game.volar
  }));
  test('§3 VOLAR conmuta el motor Y la etiqueta', () => {
    assert(trasVolar.volando === !antes, 'game.volar no cambió: sigue en ' + trasVolar.volando);
    assert(trasVolar.etiqueta === 'VOLAR: ' + (trasVolar.volando ? 'ON' : 'OFF'),
      'la etiqueta se quedó en «' + trasVolar.etiqueta + '»');
  });
  await p.evaluate(() => game.osd.pulsar('pausa:volar'));   // se deja el motor como estaba
  await p.waitForTimeout(150);

  const raton = await p.evaluate(async () => {
    const antes = game.mouseSpeed;
    game.osd.pulsar('pausa:raton');
    await new Promise(r => setTimeout(r, 150));
    return { antes, ahora: game.mouseSpeed, etiqueta: document.querySelector('#mc-osd [data-osd="pausa:raton"]').textContent.trim() };
  });
  test('§3 RATÓN gira la sensibilidad y la enseña', () => {
    assert(raton.ahora !== raton.antes, 'game.mouseSpeed no se movió de ' + raton.antes);
    assert(raton.etiqueta === 'RATÓN: ' + raton.ahora, 'la etiqueta dice «' + raton.etiqueta + '» y el motor ' + raton.ahora);
  });
  await p.evaluate(v => { game.mouseSpeed = v; }, raton.antes);   // se deja la sensibilidad como estaba

  await p.evaluate(() => game.osd.pulsar('pausa:volver'));
  await p.waitForTimeout(200);
  const vuelta = await p.evaluate(() => ({
    titulo: document.querySelector('#mc-osd .mc-osd-title').textContent.trim(), abierta: game.osd.abierta
  }));
  test('§3 VOLVER deja otra vez el menú de PAUSA', () => {
    assert(vuelta.abierta === 'pausa', 'la pantalla abierta es «' + vuelta.abierta + '»');
    assert(vuelta.titulo === 'PAUSA', 'el título es «' + vuelta.titulo + '»');
  });

  // ── §4 · INVITAR: el enlace se ENSEÑA, y cada error dice lo suyo ─────────────────────────────────
  const pide = async () => {
    await p.evaluate(() => game.osd.pulsar('pausa:invitar'));
    await p.waitForTimeout(300);
    return p.evaluate(() => {
      const c = document.querySelector('#mc-osd .mc-osd-panel');
      const i = c.querySelector('input');
      return { texto: c.textContent, enlace: i ? i.value : null, soloLectura: i ? i.readOnly : null };
    });
  };

  const conEnlace = await pide();
  test('§4 INVITAR enseña el enlace en una caja de solo lectura, para copiarlo a mano', () => {
    assert(conEnlace.enlace === 'http://prueba/map/test?invita=VALE', 'no salió el enlace (' + conEnlace.enlace + ')');
    assert(conEnlace.soloLectura, 'la caja del enlace no es de solo lectura: se puede editar y copiar algo que no vale');
  });
  test('§4 y avisa de que un mapa cerrado solo deja MIRAR', () => {
    assert(/MIRAR/.test(conEnlace.texto), 'con escritura «dueno» no avisa de que el invitado no podrá construir: ' + conEnlace.texto);
  });

  await p.evaluate(() => game.osd.pulsar('pausa:volver'));
  await p.waitForTimeout(150);
  invita = { status: 401, body: JSON.stringify({ necesitaEntrar: true }) };
  const con401 = await pide();
  test('§4 el 401 manda a entrar con la cuenta', () => {
    assert(/[Ee]ntra/.test(con401.texto), 'el 401 no dice qué hacer: ' + con401.texto);
  });

  await p.evaluate(() => game.osd.pulsar('pausa:volver'));
  await p.waitForTimeout(150);
  invita = { status: 403, body: JSON.stringify({ error: 'solo se invita a un mapa en el que puedas escribir' }) };
  const con403 = await pide();
  test('§4 el 403 no se confunde con el 401: no es tu mapa', () => {
    assert(/no es tuyo|no es tuy/.test(con403.texto), 'el 403 no explica que el mapa es de otro: ' + con403.texto);
    assert(!/[Ee]ntra con tu cuenta/.test(con403.texto), 'el 403 manda a entrar, que no arregla nada');
  });

  // ── §5 · CONTINUAR cierra el menú y devuelve la partida ─────────────────────────────────────────
  await p.evaluate(() => game.osd.pulsar('pausa:volver'));
  await p.waitForTimeout(150);
  await p.evaluate(() => game.osd.pulsar('pausa:continuar'));
  await p.waitForTimeout(300);
  const seguido = await p.evaluate(() => ({ abierta: game.osd.abierta, mundo: !$('#mc-modal').hidden, capa: $('#mc-osd').hidden }));
  test('§5 CONTINUAR cierra la pausa y deja la partida donde estaba', () => {
    assert(seguido.abierta === null, 'la pantalla «' + seguido.abierta + '» sigue abierta');
    assert(seguido.capa, '#mc-osd se quedó visible');
    assert(seguido.mundo, 'CONTINUAR cerró el Mundo');
  });

  // ── §6 · off() devuelve el motor byte a byte ────────────────────────────────────────────────────
  //
  // Con el menú quitado, Esc tiene que volver a hacer lo de siempre: cerrar el Mundo. Esto es lo que
  // demuestra que el snippet no dejó nada pegado —es el requisito de la ley de oro, no un extra—.
  const quitado = await p.evaluate(() => game.menu.estado());
  await p.evaluate(() => game.menu.off());
  const foto = () => p.evaluate(() => ({ puesto: game.menu.estado().puesto, mundo: !$('#mc-modal').hidden, abierta: game.osd.abierta }));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  let sinMenu = await foto();
  // ⚠️ El Esc de siempre es DE DOS PASOS cuando el ratón está capturado: el primero lo suelta
  // (`app.js:3871`) y solo el segundo cierra el Mundo. Y CONTINUAR, un poco más arriba, vuelve a
  // capturarlo. Así que aquí se permite el segundo golpe a propósito: lo que se comprueba es que
  // vuelve LA ESCALERA DE `app.js`, no que Esc cierre a la primera — eso es justo lo que hace el
  // menú, y con el menú quitado no debe pasar.
  if (sinMenu.mundo && sinMenu.abierta === null) {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
    sinMenu = await foto();
  }
  test('§6 game.menu.off() devuelve Esc a lo que hacía antes (cerrar el Mundo)', () => {
    assert(quitado.puesto, 'el menú no estaba puesto antes de quitarlo: el §6 no probaría nada');
    assert(!sinMenu.puesto, 'game.menu.estado() sigue diciendo que está puesto');
    assert(sinMenu.abierta === null, 'con el menú quitado Esc abrió «' + sinMenu.abierta + '»');
    assert(!sinMenu.mundo, 'con el menú quitado Esc ya no cierra el Mundo: queda algo del envoltorio puesto');
  });

  // ── §8 · SALIR sabe de dónde viene ──────────────────────────────────────────────────────────────
  //
  // EL CASO, tal cual lo contó el dueño: entra en modo diseño, abre el Mundo desde el editor 2D/3D,
  // hace Esc, pulsa SALIR — y aparece en la portada, sin camino de vuelta al editor.
  //
  // La causa era que SALIR hacía `location.href = '/'` siempre. En desarrollo `/` ERA el editor, así
  // que no se notaba; el día que el servidor pasó a modo público, `/` pasó a ser la portada y salir
  // del Mundo dejó de devolver al editor. Por eso este §8 comprueba las DOS caras, no una:
  //
  //   · en `/map/<slug>` (lo que ya mira todo el fichero) el botón lleva AL EDITOR **sin navegar**;
  //   · encima del editor, lo mismo: cierra la capa del Mundo — que es el último escalón que hacía
  //     Esc antes de que este menú existiera.
  //
  // ⚠️ SEGUNDA VUELTA (petición del dueño): en `/map/<slug>` esto ANTES hacía `location.href='/'`, y
  // ahí se perdía el mapa. `/map/<x>` sirve el MISMO `index.html` (server.py:1431), o sea que el
  // editor está debajo de la capa; y `mcMapName()` (app.js:21476) saca el mapa DE LA URL. Al ir a `/`
  // el icono «mundo» del editor reabría `default` en vez de volver a `empty3`. La regla nueva:
  // **desde un mapa NO se navega a ninguna parte**, se cierra la capa y la URL se conserva. Eso es lo
  // que hace posible el viaje de vuelta, y es lo que vigila este §8.
  // ⚠️ Este fichero corre ANÓNIMO, y para quien no tiene `snippet.editar_sistema` el editor es una
  // superficie de desarrollo que no debe pisar: ahí el botón sigue siendo SALIR (se comprueba abajo).
  // El caso que tenía el bug es el del DUEÑO, así que se le ponen sus permisos a mano — `sesion-guardia`
  // los guarda en el módulo justo para esto, y así el guardián no depende de montar una sesión.
  // §6 ha dejado el Mundo CERRADO (era justo lo que comprobaba). Aquí hace falta abierto y con el
  // menú puesto otra vez, que es la situación real desde la que se pulsa.
  await p.evaluate(() => openWorld());
  await p.waitForFunction('!document.getElementById("mc-modal").hidden && typeof mc !== "undefined" && mc.grid', null, { timeout: 180000 });
  await p.evaluate(() => game.menu.on());
  await p.waitForTimeout(600);

  const enMapa = await p.evaluate(() => {
    if (window.game && game.guardia) { game.guardia._antes = game.guardia.permisos; game.guardia.permisos = ['snippet.editar_sistema']; }
    return { hayEditor: game.menu.hayEditorDetras(), texto: game.menu.textoSalir(), ruta: location.pathname };
  });
  test('§8 en /map/<slug> el botón lleva AL EDITOR, no a la portada', () => {
    assert(enMapa.hayEditor === true, 'no ve el editor debajo estando en ' + URL);
    assert(enMapa.texto === 'IR AL EDITOR', 'el rótulo dice «' + enMapa.texto + '»');
  });

  // Y lo que de verdad importa: pulsarlo NO puede mover la URL, porque la URL ES el mapa.
  const rutaAntes = enMapa.ruta;
  await p.evaluate(() => game.menu.salir());
  await p.waitForTimeout(900);
  const trasSalirEnMapa = await p.evaluate(() => ({
    ruta: location.pathname,
    mundo: !document.getElementById('mc-modal').hidden,
    editor: !!document.getElementById('mas-menu'),
    mapa: mcMapName()
  }));
  test('§8 …y CONSERVA LA RUTA DEL MAPA (el viaje de vuelta)', () => {
    assert(trasSalirEnMapa.ruta === rutaAntes,
           'ha navegado a «' + trasSalirEnMapa.ruta + '»: el editor ya no sabe a qué mapa volver');
    assert(trasSalirEnMapa.mundo === false, 'la capa del Mundo sigue abierta');
    assert(trasSalirEnMapa.editor, 'el editor no está debajo');
  });

  // Y el regreso, que es el motivo de todo esto: el mismo botón «mundo» de siempre.
  await p.evaluate(() => openWorld());
  await p.waitForFunction('!document.getElementById("mc-modal").hidden && typeof mc !== "undefined" && mc.grid', null, { timeout: 180000 });
  const regreso = await p.evaluate(() => ({ ruta: location.pathname, mapa: mcMapName() }));
  test('§8 …y el icono «mundo» devuelve AL MISMO MAPA, no a «default»', () => {
    assert(regreso.mapa === trasSalirEnMapa.mapa && regreso.mapa !== 'default',
           'ha vuelto a «' + regreso.mapa + '» en vez de «' + trasSalirEnMapa.mapa + '»');
    assert(regreso.ruta === rutaAntes, 'la ruta acabó en «' + regreso.ruta + '»');
  });

  // La otra cara: sin el permiso, el editor no se ofrece. No se pulsa (navegaría y se llevaría por
  // delante lo que queda de fichero): basta con que el rótulo y la decisión sean los otros.
  const sinPermiso = await p.evaluate(() => {
    if (window.game && game.guardia) game.guardia.permisos = ['multi.entrar'];
    const r = { hayEditor: game.menu.hayEditorDetras(), texto: game.menu.textoSalir() };
    if (window.game && game.guardia) game.guardia.permisos = game.guardia._antes || [];
    return r;
  });
  test('§8 sin permiso de desarrollo, el botón vuelve a ser SALIR', () => {
    assert(sinPermiso.hayEditor === false, 'ofrece el editor a quien no tiene permiso');
    assert(sinPermiso.texto === 'SALIR', 'el rótulo dice «' + sinPermiso.texto + '»');
  });

  // La otra cara pide otra página: el editor con el Mundo COMO CAPA, que es donde estaba el fallo.
  const q = await b.newPage();
  const erroresQ = [];
  q.on('pageerror', e => erroresQ.push('EXCEPCION ' + e.message));
  // ⚠️ `new URL(...)` NO se puede usar aquí: `URL` es la constante de arriba (el mapa del test), que
  // tapa la global del navegador. Se corta a mano, que además deja ver qué se espera.
  const RAIZ = URL.match(/^https?:\/\/[^/]+/)[0];
  await q.goto(RAIZ + '/index.html?noauto=1', { waitUntil: 'load', timeout: 120000 });
  await q.waitForFunction('typeof window.openWorld === "function"', null, { timeout: 60000 });
  await q.evaluate(() => openWorld());
  await q.waitForFunction('!document.getElementById("mc-modal").hidden', null, { timeout: 180000 });
  await q.waitForFunction('window.game && game.menu && game.menu.estado().puesto', null, { timeout: 60000 });
  await q.keyboard.press('Escape');
  await q.waitForTimeout(600);
  const enEditor = await q.evaluate(() => ({
    enElEditor: game.menu.enElEditor(),
    abierta: game.osd.abierta,
    botones: Array.from(document.querySelectorAll('#mc-osd .mc-osd-btn')).map(b => b.textContent.trim())
  }));
  test('§8 encima del editor el botón se llama IR AL EDITOR', () => {
    assert(enEditor.enElEditor === true, 'no se reconoce como capa del editor');
    assert(enEditor.abierta === 'pausa', 'Esc no abrió la pausa (abierta: ' + enEditor.abierta + ')');
    assert(enEditor.botones.includes('IR AL EDITOR'),
           'no está el rótulo (hay: ' + enEditor.botones.join(', ') + ')');
  });

  await q.evaluate(() => game.menu.salir());
  await q.waitForTimeout(900);
  const salido = await q.evaluate(() => ({
    ruta: location.pathname,
    mundo: !document.getElementById('mc-modal').hidden,
    abierta: game.osd.abierta,
    editor: !!document.getElementById('mas-menu')
  }));
  test('§8 …y devuelve AL EDITOR: cierra la capa y no navega a ninguna parte', () => {
    assert(salido.ruta === '/index.html', 'ha navegado a «' + salido.ruta + '» en vez de quedarse');
    assert(salido.mundo === false, 'la capa del Mundo sigue abierta');
    assert(salido.abierta === null, 'la pantalla «' + salido.abierta + '» se ha quedado encima');
    assert(salido.editor, 'el editor no está debajo');
  });
  test('§8 sin excepciones por el camino', () => {
    assert(erroresQ.length === 0, erroresQ.join('\n        '));
  });
  await q.close();

  test('§7 nada de esto lanzó una excepción', () => {
    assert(errores.length === 0, errores.join('\n        '));
  });

  await b.close();
  console.log('\n  ' + ok + ' ok, ' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('EXPLOTÓ: ' + e.message); process.exit(1); });
