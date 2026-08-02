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
  await p.route('**/api/agentes*', r => r.request().method() === 'GET' ? r.continue() : r.abort());

  await p.goto(URL, { timeout: 60000 });
  await p.click('[data-tab="agentes"]');
  await p.waitForFunction('window.game && game.esqueletos && !document.querySelector("#ag-modal").hidden',
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
    async function conmutar(t, on) { const l = marca(t); if (!l) { avisos.push(t); return; }
      const c = l.querySelector('input');
      if (!!c.checked !== !!on) { c.checked = !!on; c.dispatchEvent(new Event('change', { bubbles: true })); await pausa(); } }
    const clave = n => 'asset:assets/' + n + '.vox.json';

    // 0) Un agente YA GUARDADO enseña su conducta en el formulario (los campos LEEN, no solo escriben).
    await agCargar('zombie'); await new Promise(r => setTimeout(r, 400));
    const delZombie = { distancia: leer('se para a (bloques)'), deteccion: leer('detección (bloques)'),
                        velocidad: leer('velocidad (bloques/s)'), cadencia: leer('pasos por bloque'),
                        alto: leer('alto') };

    // 1) El catálogo tiene que ofrecer PIEZAS DE AGENTE, o no hay nada que montar.
    const cat = await agCatalogo();
    const ofrece = n => cat.some(c => c.key === clave(n));

    // 2) Un agente nuevo, montado a mano con el formulario.
    document.querySelector('#ag-new').click(); await pausa();
    const nom = document.querySelector('#ag-nombre');
    nom.value = 'ZZ prueba panel'; nom.dispatchEvent(new Event('change', { bubbles: true })); await pausa();
    await opcion('dibujo', clave('torso-perro'));
    await num('detección (bloques)', 11);
    await num('se para a (bloques)', 3.5);
    await num('velocidad (bloques/s)', 2.4);
    await num('pasos por bloque', 1.8);
    await conmutar('caja de choque a medida', true);
    await num('ancho', 0.5); await num('fondo', 1); await num('alto', 1.25);

    document.querySelector('#ag-add').click(); await pausa();
    await num('nombre', 'cabeza');
    await opcion('dibujo', clave('cabeza-perro'));
    await terna('en (x, alto, z)', [0, 0.1875, -0.5]);
    await conmutar(' te mira', true);
    await num('alcance (bloques)', 9);
    await num('tope del cuello (±°)', 55);

    document.querySelector('#ag-add').click(); await pausa();
    await num('nombre', 'pata');
    await opcion('dibujo', clave('pata-perro'));
    await terna('en (x, alto, z)', [0, -0.5625, 0.0625]);
    await conmutar(' se articula', true);
    await opcion('eje', 'x');
    await num('pivote nº', 1); await num('base (te ve)', 0); await num('reposo', 0);
    await num('amplitud', 32); await num('desfase (grados)', 180);

    await new Promise(r => setTimeout(r, 500));            // que `preparar` (va por red) acabe
    const doc = JSON.parse(JSON.stringify(agDoc));

    // 3) El preview lo dibuja, y con «anda» la imagen cambia.
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

    return { avisos, doc, delZombie, quieto, anima, partes: agPl ? agPl.partes.length : 0,
             ofrece: { torso: ofrece('torso-perro'), pata: ofrece('pata-perro'),
                       brazoZombie: ofrece('brazo-zombie'), habitantes: cat.some(c => c.key.slice(0, 4) === 'hab:') },
             tags: [...document.querySelectorAll('#ag-piezas .ap-tag')].map(e => e.textContent) };
  });

  console.log('\n  el formulario del panel');
  test('ofrece las piezas del perro en el desplegable de dibujos', () =>
    assert(r.ofrece.torso && r.ofrece.pata, 'el catálogo no ofrece torso-perro/pata-perro'));
  test('ofrece TAMBIÉN las del zombie (eran invisibles por ser type:textura)', () =>
    assert(r.ofrece.brazoZombie, 'el catálogo no ofrece brazo-zombie'));
  test('no se ha comido el resto del catálogo', () => assert(r.ofrece.habitantes, 'no hay habitantes en el catálogo'));
  test('no le falta ningún campo de los que pide un agente completo', () =>
    assert(!r.avisos.length, 'campos que el formulario no tiene: ' + r.avisos.join(', ')));

  console.log('\n  lo que sale escrito en el documento');
  test('la raíz es el dibujo elegido', () =>
    assert(r.doc.raiz.pieza === 'asset:assets/torso-perro.vox.json', 'raíz = ' + r.doc.raiz.pieza));
  test('seguir: detección, distancia y velocidad', () =>
    assert(r.doc.seguir && r.doc.seguir.deteccion === 11 && r.doc.seguir.distancia === 3.5
        && r.doc.seguir.velocidad === 2.4, JSON.stringify(r.doc.seguir)));
  test('andar: pasos por bloque', () => assert(r.doc.andar && r.doc.andar.cadencia === 1.8, JSON.stringify(r.doc.andar)));
  test('cuerpo: la caja de choque a medida', () =>
    assert(r.doc.cuerpo && r.doc.cuerpo.ancho === 0.5 && r.doc.cuerpo.fondo === 1 && r.doc.cuerpo.alto === 1.25,
      JSON.stringify(r.doc.cuerpo)));
  test('mirar: alcance y tope del cuello, en la pieza y no en la raíz', () => {
    const c = r.doc.piezas[0];
    assert(c.mirar && c.mirar.alcance === 9, JSON.stringify(c.mirar));
    assert(c.mirar.limites.y[0] === -55 && c.mirar.limites.y[1] === 55, 'límites ' + JSON.stringify(c.mirar.limites));
    assert(!r.doc.raiz.mirar, 'la raíz no lleva mirar: hacia dónde encara lo decide la persecución');
  });
  test('articula: eje, pivote y desfase', () => {
    const a = r.doc.piezas[1].articula;
    assert(a && a.eje === 'x' && a.pivote === 1 && a.amplitud === 32 && a.fase === 180, JSON.stringify(a));
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

  console.log('\n  el preview');
  test('dibuja las 3 piezas del agente recién montado', () => assert(r.partes === 3, 'partes = ' + r.partes));
  test('pinta algo (no es un lienzo en negro)', () => assert(r.quieto > 5000, 'píxeles pintados = ' + r.quieto));
  test('con «anda» la imagen cambia', () => assert(r.anima, 'el preview no se movió al encender «anda»'));
  test('sin excepciones en la página', () => assert(!errores.length, errores.slice(0, 3).join(' | ')));

  console.log('\n' + ok + ' ok, ' + fallos + ' fallos');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
