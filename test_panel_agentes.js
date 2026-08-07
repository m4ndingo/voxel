// test_panel_agentes.js — que el panel de Agentes pueda DESCRIBIR un bicho entero, no solo su esqueleto.
//
// Lo que se prueba aquí y en ningún otro sitio: que un agente nuevo se puede montar **con el
// formulario**, sin escribir JSON a mano. Dos cosas se descubrieron montando el perro y las dos son
// invisibles hasta que alguien lo intenta:
//
//   · el desplegable de dibujos filtraba `type:'textura'` para no ofrecer los 34 azulejos de 1×1…
//     y las piezas de agente SON de ese tipo (para que al editarlas se guarden en assets/ y se les
//     pueda reponer el pivote con 📍). Resultado: en el panel no había ni un brazo del zombie, o
//     sea que no se podía montar ningún agente nuevo. Ahora entra también el grupo «Agentes».
//   · el formulario solo tocaba PIEZAS. `seguir` (a qué distancia se para), `andar` (pasos por
//     bloque) y `mirar` (la cabeza girándose) no tenían campo, así que el bicho salía del panel sin
//     conducta y con los valores por defecto de la librería.
//
// No guarda nada: monta el documento en memoria y lo lee de `agDoc`. Los POST se bloquean igual.
//   node test_panel_agentes.js [url]        por defecto http://localhost:8500/

const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8500/';
let ok = 0, fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log('  ok    ' + nombre); ok++; }
  catch (e) { console.log('  FALLO ' + nombre + '\n        ' + e.message); fallos++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const cerca = (a, b, e, msg) => assert(Math.abs(a - b) <= e, msg + ' (' + a + ' vs ' + b + ')');

(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('EXCEPCION ' + e.message));
  await p.route('**/api/mundo', r => r.request().method() === 'GET' ? r.continue() : r.abort());
  await p.route('**/api/habitantes*', r => r.request().method() === 'GET' ? r.continue() : r.abort());
  // Los guardados siguen abortados (este fichero no escribe en data/agentes/), pero se anota lo que
  // el panel HABRÍA mandado: es la única forma de comprobar «Guardar como…» sin crear un agente.
  const enviados = [];
  await p.route('**/api/agentes*', r => {
    if (r.request().method() === 'GET') return r.continue();
    let d = null; try { d = JSON.parse(r.request().postData() || 'null'); } catch (e) {}
    enviados.push({ metodo: r.request().method(), doc: d });
    return r.abort();
  });

  await p.goto(URL, { timeout: 60000 });
  // REQ-NAV1 · «🦴 Agentes» ya no está en la barra: vive dentro del menú «⋯», que hay que abrir antes.
  await p.click('#btn-mas');
  await p.click('[data-tab="agentes"]');
  await p.waitForFunction('window.game && game.esqueletos && typeof agDoc !== "undefined" && agDoc && !document.querySelector("#ag-modal").hidden',
    null, { timeout: 60000 });

  const r = await p.evaluate(async () => {
    const pausa = () => new Promise(r => setTimeout(r, 0));
    const avisos = [];
    const flds = () => [...document.querySelectorAll('#ag-form .ag-fld')];
    const fld = t => flds().find(l => l.firstChild && l.firstChild.nodeValue && l.firstChild.nodeValue.trim() === t)
                 || flds().find(l => l.textContent.trim().startsWith(t));
    const marca = t => flds().find(l => l.textContent.trim() === t.trim());
    const leer = t => { const l = fld(t); return l ? +l.querySelector('input').value : null; };
    async function num(t, v) { const l = fld(t); if (!l) { avisos.push(t); return; }
      const i = l.querySelector('input'); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); await pausa(); }
    async function opcion(t, v) { const l = fld(t); if (!l) { avisos.push(t); return; }
      const s = l.querySelector('select');
      for (let i = 0; i < 40 && ![...s.options].some(o => o.value === v); i++) await new Promise(r => setTimeout(r, 25));
      if (![...s.options].some(o => o.value === v)) { avisos.push(t + ' no ofrece ' + v); return; }
      s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); await pausa(); }
    async function terna(t, v) { const l = fld(t); if (!l) { avisos.push(t); return; }
      const ins = [...l.querySelectorAll('input')]; ins.forEach((i, k) => i.value = v[k]);
      ins[2].dispatchEvent(new Event('change', { bubbles: true })); await pausa(); }
    const tarjeta = c => document.querySelector('#ag-form .ag-cap[data-cap="' + c + '"]');
    const resumen = c => { const d = tarjeta(c); return d ? d.querySelector('.resumen').textContent : null; };
    const gris = t => { const l = fld(t); return !!(l && l.querySelector('input.def')); };
    // Una capacidad se enciende por su tarjeta (`empuje`, `fisica`…) y una casilla suelta por su
    // etiqueta; el interruptor de la tarjeta es el PRIMER input, que está en la cabecera.
    async function conmutar(t, on) { const l = marca(t) || tarjeta(t); if (!l) { avisos.push(t); return; }
      const c = l.querySelector('input[type=checkbox]');
      if (!!c.checked !== !!on) { c.checked = !!on; c.dispatchEvent(new Event('change', { bubbles: true })); await pausa(); } }
    const clave = n => 'asset:assets/' + n + '.vox.json';

    // 0) Un agente YA GUARDADO enseña su conducta en el formulario (los campos LEEN, no solo escriben).
    await agCargar('zombie'); await new Promise(r => setTimeout(r, 400));
    const delZombie = { distancia: leer('se para a (bloques)'), deteccion: leer('detección (bloques)'),
                        velocidad: leer('velocidad (bloques/s)'), cadencia: leer('pasos por bloque'),
                        alto: leer('alto') };

    // 0 bis) «Guardar como…» sobre el zombie. Los POST van abortados en este fichero, así que aquí
    // NO se escribe nada en data/agentes/: lo que se comprueba es el documento que SALE hacia el
    // servidor (sin `id`, con el nombre nuevo — que es lo que hace que el fichero sea otro) y que al
    // fallar el guardado el panel deshace el cambio en vez de quedarse apuntando al fichero que no es.
    const guardarComo = { nombreOriginal: agDoc.nombre, idOriginal: agDoc.id };
    const promptOrig = window.prompt, confirmOrig = window.confirm;
    let sugerido = null;
    window.prompt = (msg, def) => { sugerido = def; return 'ZZ copia de prueba'; };
    window.confirm = () => true;
    document.querySelector('#ag-save-as').click();
    await new Promise(r => setTimeout(r, 500));
    guardarComo.sugerido = sugerido;
    guardarComo.idTrasFallo = agDoc.id;
    guardarComo.nombreTrasFallo = agDoc.nombre;
    guardarComo.campoTrasFallo = document.querySelector('#ag-nombre').value;
    // …y un nombre que ya existe se PREGUNTA antes de pisarlo; decir que no lo deja todo igual.
    let preguntado = false;
    window.prompt = () => 'Zombie';
    window.confirm = () => { preguntado = true; return false; };
    document.querySelector('#ag-save-as').click();
    await new Promise(r => setTimeout(r, 300));
    guardarComo.preguntaAntesDePisar = preguntado;
    guardarComo.idTrasCancelar = agDoc.id;
    window.prompt = promptOrig; window.confirm = confirmOrig;

    // 1) El catálogo tiene que ofrecer PIEZAS DE AGENTE, o no hay nada que montar.
    const cat = await agCatalogo();
    const ofrece = n => cat.some(c => c.key === clave(n));

    // 2) Un agente nuevo, montado a mano con el formulario.
    document.querySelector('#ag-new').click(); await pausa();
    const nom = document.querySelector('#ag-nombre');
    nom.value = 'ZZ prueba panel'; nom.dispatchEvent(new Event('change', { bubbles: true })); await pausa();
    await opcion('dibujo', clave('torso-perro'));
    await num('detección (bloques)', 11);
    await num('campo de visión (°)', 90);
    await num('se para a (bloques)', 3.5);
    await num('velocidad (bloques/s)', 2.4);
    await num('pasos por bloque', 1.8);
    await conmutar('cuerpo', true);
    await num('ancho', 0.5); await num('fondo', 1); await num('alto', 1.25);

    document.querySelector('#ag-add').click(); await pausa();
    await num('nombre', 'cabeza');
    await opcion('dibujo', clave('cabeza-perro'));
    await terna('en (x, alto, z)', [0, 0.1875, -0.5]);
    await conmutar('mirar', true);
    await num('alcance (bloques)', 9);
    await num('tope del cuello (±°)', 55);
    await num('tope arriba y abajo (±°)', 40);

    document.querySelector('#ag-add').click(); await pausa();
    await num('nombre', 'pata');
    await opcion('dibujo', clave('pata-perro'));
    await terna('en (x, alto, z)', [0, -0.5625, 0.0625]);
    await conmutar('articula', true);
    await opcion('eje', 'x');
    await num('pivote nº', 1); await num('base (te ve)', 0); await num('reposo', 0);
    await num('amplitud', 32); await num('desfase (grados)', 180);

    // 2 bis) La ayuda de cada campo (el dueño: «no queda claro qué es cada una de estas opciones»).
    // Se mira con la tarjeta de `articula` ABIERTA, que es la que la pedía.
    const conAyuda = ['eje', 'pivote nº', 'base (te ve)', 'reposo', 'amplitud', 'desfase (grados)',
                      'nombre', 'dibujo', 'rot (¼ de vuelta)', 'en (x, alto, z)'];
    const ayudas = conAyuda.map(t => {
      const l = fld(t);
      if (!l) return { t, falta: true };
      const b = l.querySelector('.ag-i'), n = l.querySelector('.ag-tip');
      return { t, titulo: (l.title || '').length, boton: !!b, nota: !!n,
               // Las dos vías dicen LO MISMO: el globo del navegador y el desplegable del móvil no
               // pueden divergir, o el que edite en el móvil leerá otra cosa.
               iguales: !!(b && n) && l.title === n.textContent,
               // El rótulo de verdad sigue siendo el primer nodo: el «?» va detrás, no lo ensucia.
               rotulo: l.firstChild && l.firstChild.nodeValue && l.firstChild.nodeValue.trim() === t };
    });
    // El mecanismo: la nota está oculta y la abre el FOCO del «?» (en el móvil no hay hover), sin
    // tocar el valor del campo — el botón vive dentro del <label> y podría robarle el clic.
    const lAmp = fld('amplitud');
    const vis = l => getComputedStyle(l.querySelector('.ag-tip')).display !== 'none';
    const pista = { cerrada: !vis(lAmp) };
    lAmp.querySelector('.ag-i').focus();
    pista.abre = vis(lAmp);
    lAmp.querySelector('.ag-i').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await pausa();
    pista.valorIntacto = leer('amplitud') === 32;
    lAmp.querySelector('.ag-i').blur();
    pista.cierra = !vis(fld('amplitud'));

    await new Promise(r => setTimeout(r, 500));            // que `preparar` (va por red) acabe
    const doc = JSON.parse(JSON.stringify(agDoc));

    document.querySelector('#ag-piezas li').click(); await pausa();   // las capacidades cuelgan de la RAÍZ

    // 3) Las capacidades que hasta ahora no tenían campo: `empuje` (v1.25) y `fisica` (v1.26).
    //    Abrir el panel NO debe escribirlas: los valores por defecto viven en la librería.
    const sinTocar = { empuje: agDoc.empuje === undefined, fisica: agDoc.fisica === undefined };
    const porDefecto = { fuerza: leer('fuerza (bloques/s)'), freno: leer('freno (s)'),
                         brinco: leer('brinco (bloques/s)'), peso: leer('peso (÷ impulso, 1 = como tú)'),
                         caida: leer('caída máxima (bloques)'),
                         gris: gris('fuerza (bloques/s)') && gris('caída máxima (bloques)') };
    await num('fuerza (bloques/s)', 3);                    // tocarlo SÍ la escribe, y solo esa clave
    const trasTocar = JSON.parse(JSON.stringify(agDoc.empuje || null));
    await conmutar('empuje', false);                       // apagado = aguanta el golpe sin moverse
    const empApagado = JSON.parse(JSON.stringify(agDoc.empuje || null));
    await conmutar('empuje', true);                        // y encenderlo vuelve a borrar la clave
    const empEncendido = agDoc.empuje === undefined;
    await conmutar('el trampolín lo lanza (impulso)', false);
    const fisParcial = JSON.parse(JSON.stringify(agDoc.fisica || null));
    await conmutar('fisica', false);
    const fisApagada = agDoc.fisica;
    await conmutar('fisica', true);
    const fisEncendida = agDoc.fisica === undefined;
    const trepa = (() => { const l = marca('trepa por las escaleras (todavía no)');
                           return l ? l.querySelector('input').disabled : null; })();
    // El objetivo: para un RIG solo valen el jugador y un punto fijo (seguir a otra CLAVE busca la
    // instancia más cercana con ese material, y un esqueleto no es una instancia).
    const objetivos = [...fld('objetivo').querySelectorAll('option')].map(o => o.value);
    await opcion('objetivo', 'punto');
    const objPunto = Array.isArray(agDoc.seguir.objetivo);
    await terna('punto (x, alto, z)', [5, 6, 7]);
    const objTerna = JSON.stringify(agDoc.seguir.objetivo);
    await opcion('objetivo', 'jugador');
    const objBorrado = agDoc.seguir.objetivo === undefined;

    const resumenes = { seguir: resumen('seguir'), andar: resumen('andar'),
                        empuje: resumen('empuje'), cuerpo: resumen('cuerpo') };
    const chips = [...document.querySelectorAll('#ag-chips .ag-chip')].map(e => e.textContent);

    // 4) El preview lo dibuja, y con «anda» la imagen cambia.
    const cv = document.querySelector('#ag-canvas'), g = cv.getContext('2d', { willReadFrequently: true });
    const pintados = () => { const d = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) n++; return n; };
    document.querySelector('#ag-activo').checked = false;
    document.querySelector('#ag-andando').checked = false;
    await new Promise(r => setTimeout(r, 200));
    const quieto = pintados(), foto = cv.toDataURL();
    document.querySelector('#ag-andando').checked = true;
    await new Promise(r => setTimeout(r, 500));
    const anima = cv.toDataURL() !== foto;

    return { avisos, doc, delZombie, quieto, anima, guardarComo, partes: agPl ? agPl.partes.length : 0,
             objetivos, objPunto, objTerna, objBorrado,
             sinTocar, porDefecto, trasTocar, empApagado, empEncendido, fisParcial, fisApagada,
             fisEncendida, trepa, resumenes, chips, ayudas, pista,
             ofrece: { torso: ofrece('torso-perro'), pata: ofrece('pata-perro'),
                       brazoZombie: ofrece('brazo-zombie'), habitantes: cat.some(c => c.key.slice(0, 4) === 'hab:'),
                       // Un `type:'textura'` que NO está en el grupo Agentes: es lo que guarda el
                       // editor al copiar una pieza, y justo lo que el filtro viejo escondía.
                       bloqueDeConstruccion: ofrece('adoquin') },
             grupos: (() => { const l = fld('dibujo'); if (!l) return [];
                              return [...l.querySelectorAll('select > optgroup')].map(g => g.label); })(),
             // Cada grupo, con sus nombres tal cual salen: el test los reordena por su cuenta y
             // compara, que es la unica forma de ver si el desplegable llega ya ordenado.
             porGrupo: (() => { const l = fld('dibujo'); if (!l) return {}; const o = {};
                                for (const g of l.querySelectorAll('select > optgroup'))
                                  o[g.label] = [...g.children].map(e => e.textContent);
                                return o; })(),
             tags: [...document.querySelectorAll('#ag-piezas .ap-tag')].map(e => e.textContent) };
  });

  // El foco a mano de ahí arriba prueba la regla de CSS; esto prueba que un DEDO llega a ella, que es
  // como se usa: un clic de verdad sobre un <button> dentro de un <label> tiene que quedarse el foco
  // y no rebotar al control del campo. Vale cualquier campo con ayuda de los que haya en pantalla.
  const unaAyuda = p.locator('#ag-form .ag-i').first();
  const suNota = p.locator('#ag-form label.ag-fld:has(.ag-i)').first().locator('.ag-tip');
  const notaAntesDelClic = await suNota.isVisible();
  await unaAyuda.click();
  const notaTrasElClic = await suNota.isVisible();

  console.log('\n  el formulario del panel');
  test('ofrece las piezas del perro en el desplegable de dibujos', () =>
    assert(r.ofrece.torso && r.ofrece.pata, 'el catálogo no ofrece torso-perro/pata-perro'));
  test('ofrece TAMBIÉN las del zombie (eran invisibles por ser type:textura)', () =>
    assert(r.ofrece.brazoZombie, 'el catálogo no ofrece brazo-zombie'));
  test('no se ha comido el resto del catálogo', () => assert(r.ofrece.habitantes, 'no hay habitantes en el catálogo'));
  test('ofrece también un bloque de construcción (una pieza copiada y guardada NO se esconde)', () =>
    assert(r.ofrece.bloqueDeConstruccion, 'el catálogo no ofrece adoquin: el desplegable vuelve a esconder piezas'));
  test('el desplegable reparte en grupos y Agentes va el primero', () =>
    assert(r.grupos.length > 1 && r.grupos[0] === 'Agentes', 'grupos = ' + JSON.stringify(r.grupos)));
  console.log('\n  guardar como…');
  const g = r.guardarComo;
  test('propone un nombre que NO pisa a nadie', () =>
    assert(g.sugerido && g.sugerido !== 'zombie', 'sugirió ' + JSON.stringify(g.sugerido)));
  test('lo que sale hacia el servidor va SIN `id` y con el nombre nuevo (por eso el fichero es otro)', () => {
    const env = enviados.filter(e => e.doc && e.doc.nombre === 'ZZ copia de prueba');
    assert(env.length === 1, 'guardados con el nombre nuevo: ' + env.length);
    assert(!('id' in env[0].doc), 'llevaba id=' + JSON.stringify(env[0].doc.id) + ': habría pisado el original');
    assert(env[0].doc.raiz && env[0].doc.raiz.pieza, 'la copia va sin raíz: no es el mismo bicho');
  });
  test('si el guardado falla, el panel vuelve al agente original (no se queda apuntando a otro fichero)', () =>
    assert(g.idTrasFallo === g.idOriginal && g.nombreTrasFallo === g.nombreOriginal &&
           g.campoTrasFallo === g.nombreOriginal,
           'quedó id=' + g.idTrasFallo + ' nombre=' + g.nombreTrasFallo + ' campo=' + g.campoTrasFallo));
  test('avisa antes de pisar un agente que ya existe, y cancelar no toca nada', () =>
    assert(g.preguntaAntesDePisar && g.idTrasCancelar === g.idOriginal,
           'preguntó=' + g.preguntaAntesDePisar + ' id=' + g.idTrasCancelar));
  test('cancelar el aviso no manda NADA al servidor', () =>
    assert(!enviados.some(e => e.doc && e.doc.nombre === 'Zombie'), 'se mandó la copia cancelada'));

  test('dentro de cada grupo los nombres salen ordenados', () => {
    const cmp = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
    for (const g of Object.keys(r.porGrupo)) {
      const hay = r.porGrupo[g], debe = hay.slice().sort(cmp.compare);
      assert(hay.join('|') === debe.join('|'),
             'el grupo «' + g + '» no está ordenado:\n        es  ' + hay.join(', ') +
             '\n        debe ' + debe.join(', '));
    }
    assert(Object.keys(r.porGrupo).length > 1, 'no se han leído los grupos del desplegable');
  });
  test('no le falta ningún campo de los que pide un agente completo', () =>
    assert(!r.avisos.length, 'campos que el formulario no tiene: ' + r.avisos.join(', ')));

  console.log('\n  lo que sale escrito en el documento');
  test('la raíz es el dibujo elegido', () =>
    assert(r.doc.raiz.pieza === 'asset:assets/torso-perro.vox.json', 'raíz = ' + r.doc.raiz.pieza));
  test('seguir: detección, distancia y velocidad', () =>
    assert(r.doc.seguir && r.doc.seguir.deteccion === 11 && r.doc.seguir.distancia === 3.5
        && r.doc.seguir.velocidad === 2.4, JSON.stringify(r.doc.seguir)));
  // BUG-AG10 · el campo de visión: la detección dejó de ser una esfera y esto es lo que lo escribe.
  test('seguir: campo de visión', () =>
    assert(r.doc.seguir && r.doc.seguir.vision === 90, JSON.stringify(r.doc.seguir)));
  test('andar: pasos por bloque', () => assert(r.doc.andar && r.doc.andar.cadencia === 1.8, JSON.stringify(r.doc.andar)));
  test('cuerpo: la caja de choque a medida', () =>
    assert(r.doc.cuerpo && r.doc.cuerpo.ancho === 0.5 && r.doc.cuerpo.fondo === 1 && r.doc.cuerpo.alto === 1.25,
      JSON.stringify(r.doc.cuerpo)));
  test('mirar: alcance y tope del cuello, en la pieza y no en la raíz', () => {
    const c = r.doc.piezas[0];
    assert(c.mirar && c.mirar.alcance === 9, JSON.stringify(c.mirar));
    assert(c.mirar.limites.y[0] === -55 && c.mirar.limites.y[1] === 55, 'límites ' + JSON.stringify(c.mirar.limites));
    // BUG-AG9 · el cono vertical, y sobre todo que escribir uno NO borre el otro: el setter de
    // antes hacía `mir.limites = {y:[...]}` y el segundo campo se llevaba por delante al primero.
    assert(c.mirar.limites.x[0] === -40 && c.mirar.limites.x[1] === 40, 'límites ' + JSON.stringify(c.mirar.limites));
    assert(!r.doc.raiz.mirar, 'la raíz no lleva mirar: hacia dónde encara lo decide la persecución');
  });
  test('articula: eje, pivote y desfase', () => {
    const a = r.doc.piezas[1].articula;
    assert(a && a.eje === 'x' && a.pivote === 1 && a.amplitud === 32 && a.fase === 180, JSON.stringify(a));
  });
  test('cada campo del formulario explica QUÉ ES, y lo dice igual por las dos vías', () => {
    const mal = r.ayudas.filter(a => a.falta || !a.titulo || !a.boton || !a.nota || !a.iguales || !a.rotulo);
    assert(!mal.length, 'campos sin ayuda o con ayuda a medias: ' + JSON.stringify(mal));
  });
  test('la ayuda está plegada, la abre el «?» y no le toca el valor al campo', () => {
    assert(r.pista.cerrada, 'la ayuda ya salía desplegada y tapa el formulario entero');
    assert(r.pista.abre, 'el foco del «?» no despliega la ayuda (en el móvil no hay hover: es la única vía)');
    assert(r.pista.valorIntacto, 'pulsar el «?» cambió el valor del campo: el <label> le robó el clic');
    assert(r.pista.cierra, 'la ayuda no se cierra al salir el foco');
    assert(!notaAntesDelClic && notaTrasElClic,
      'con un clic de verdad la ayuda no se abre (antes ' + notaAntesDelClic + ', después ' + notaTrasElClic + ')');
  });
  test('el `en` de cada pieza, en bloques', () =>
    assert(JSON.stringify(r.doc.piezas[0].en) === '[0,0.1875,-0.5]', JSON.stringify(r.doc.piezas[0].en)));
  test('la lista etiqueta cada pieza por lo que hace', () =>
    assert(r.tags.join(',') === 'raíz,mira,cabecea', r.tags.join(',')));

  console.log('\n  los campos también LEEN un agente guardado');
  test('el zombie enseña su distancia (1.2) y su cadencia (0.7)', () => {
    cerca(r.delZombie.distancia, 1.2, 1e-6, 'distancia del zombie');
    cerca(r.delZombie.cadencia, 0.7, 1e-6, 'cadencia del zombie');
    cerca(r.delZombie.deteccion, 14, 1e-6, 'detección del zombie');
  });
  test('…y el alto de su caja de choque (2.5625)', () => cerca(r.delZombie.alto, 2.5625, 1e-6, 'alto del zombie'));

  console.log('\n  las capacidades del bicho entero');
  test('un agente nuevo no lleva escritas `empuje` ni `fisica`…', () =>
    assert(r.sinTocar.empuje && r.sinTocar.fisica, JSON.stringify(r.sinTocar)));
  test('…pero el panel enseña los valores que va a usar la librería, en gris', () => {
    cerca(r.porDefecto.fuerza, 8, 1e-6, 'fuerza');
    cerca(r.porDefecto.freno, 0.15, 1e-6, 'freno');
    cerca(r.porDefecto.brinco, 4.5, 1e-6, 'brinco');
    cerca(r.porDefecto.peso, 1, 1e-6, 'peso');
    cerca(r.porDefecto.caida, 12, 1e-6, 'caída máxima');
    assert(r.porDefecto.gris, 'los valores por defecto no salen marcados como tales (.def)');
  });
  test('tocar un campo escribe la clave, y solo esa', () =>
    assert(r.trasTocar && r.trasTocar.fuerza === 3 && Object.keys(r.trasTocar).length === 1,
      JSON.stringify(r.trasTocar)));
  test('apagar «empujable» es fuerza 0 y brinco 0 (aguanta el golpe)', () =>
    assert(r.empApagado && r.empApagado.fuerza === 0 && r.empApagado.salto === 0,
      JSON.stringify(r.empApagado)));
  test('volver a encenderla borra la clave (el defecto vive en la librería)', () =>
    assert(r.empEncendido, 'la clave `empuje` se quedó escrita'));
  test('una casilla suelta de física escribe solo su clave', () =>
    assert(r.fisParcial && r.fisParcial.impulso === false && Object.keys(r.fisParcial).length === 1,
      JSON.stringify(r.fisParcial)));
  test('apagar la física entera es `fisica:false`, y encenderla la borra', () =>
    assert(r.fisApagada === false && r.fisEncendida, 'fisica = ' + JSON.stringify(r.fisApagada)));
  test('«trepa por las escaleras» sale apagada y BLOQUEADA (aún no existe)', () =>
    assert(r.trepa === true, 'la casilla de trepar no está deshabilitada: ' + r.trepa));
  test('el objetivo ofrece jugador y punto fijo, y NO «otro material» (un rig no es una instancia)', () =>
    assert(r.objetivos.join(',') === 'jugador,punto', r.objetivos.join(',')));
  test('elegir «un punto fijo» escribe unas coordenadas editables, y volver al jugador las borra', () => {
    assert(r.objPunto, 'el objetivo no se volvió un punto');
    assert(r.objTerna === '[5,6,7]', r.objTerna);
    assert(r.objBorrado, 'la clave `objetivo` se quedó escrita al volver al jugador');
  });
  test('el resumen de la tarjeta plegada dice la verdad', () => {
    assert(/11/.test(r.resumenes.seguir) && /3\.5/.test(r.resumenes.seguir), r.resumenes.seguir);
    assert(/1\.8/.test(r.resumenes.andar), r.resumenes.andar);
    assert(/0\.5/.test(r.resumenes.cuerpo) && /1\.25/.test(r.resumenes.cuerpo), r.resumenes.cuerpo);
  });
  // 7 desde REQ-MNT2 («te lleva encima»). El número va a mano a propósito: si alguien añade una
  // capacidad y no la cuenta aquí, el chip se le puede quedar sin salir y nadie se entera.
  test('los chips del preview cuentan las 7 capacidades', () => {
    assert(r.chips.length === 7, r.chips.join(' | '));
    assert(r.chips.some(c => /te ve a 11/.test(c)), r.chips.join(' | '));
    assert(r.chips.some(c => /pisa como tú/.test(c)), r.chips.join(' | '));
    assert(r.chips.some(c => /🧍/.test(c)), r.chips.join(' | '));
  });

  console.log('\n  el preview');
  test('dibuja las 3 piezas del agente recién montado', () => assert(r.partes === 3, 'partes = ' + r.partes));
  test('pinta algo (no es un lienzo en negro)', () => assert(r.quieto > 5000, 'píxeles pintados = ' + r.quieto));
  test('con «anda» la imagen cambia', () => assert(r.anima, 'el preview no se movió al encender «anda»'));
  test('sin excepciones en la página', () => assert(!errores.length, errores.slice(0, 3).join(' | ')));

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
