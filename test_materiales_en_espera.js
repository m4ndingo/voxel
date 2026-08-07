// BUG-SNP1 · abrir /map/empty escupia once «game.bloques.define: no existe el material "X"» seguidos,
// cada uno con su traza de pila, y ahogaba el informe de carga. El aviso ademas MENTIA: el material
// existe en el disco, lo que pasa es que la paleta de un mundo solo lleva lo COLOCADO. Y detras del
// ruido habia un fallo funcional callado: la definicion se tiraba, asi que colocar el material despues
// ya no le devolvia su comportamiento en toda la sesion.
//
// Aqui se comprueba en el navegador de verdad, que es donde vive el sintoma. La logica fina (aplazar,
// promover, quitar, typos) va en test_bloques_comportamiento.js, sobre el mundo de juguete.
// No persiste nada: los POST a la API van bloqueados.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const msgs = [];
  p.on('console', m => msgs.push({ t: m.type(), txt: m.text() }));
  p.on('pageerror', e => msgs.push({ t: 'pageerror', txt: String(e) }));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\//.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });

  // /map/empty es el peor caso a proposito: sin nada colocado, la paleta es la minima que puede haber.
  await p.goto('http://localhost:8500/map/empty', { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid && window.game && game.bloques',
    null, { timeout: 240000 });
  await p.waitForTimeout(8000);

  const avisosDefine = msgs.filter(m => /game\.bloques\.define/.test(m.txt));
  ok('abrir un mundo vacío no deja ni un aviso de define', avisosDefine.length === 0,
    avisosDefine.map(m => m.txt.split('\n')[0]).join(' | '));
  ok('no hay errores de página', !msgs.some(m => m.t === 'pageerror'),
    msgs.filter(m => m.t === 'pageerror').map(m => m.txt).join(' | '));

  // Una linea por RAFAGA, no una por material. Salen dos porque son dos snippets independientes
  // (mundo-autoarranque y redstone-piezas), cada uno con su propia tanda de defines.
  const espera = msgs.filter(m => /en espera/.test(m.txt));
  ok('y en su lugar una línea por tanda, no una por material', espera.length > 0 && espera.length <= 3,
    espera.length + ' línea(s)');

  const r = await p.evaluate(() => {
    const filas = game.bloques.lista();
    const pend = game.bloques._pendientes();
    const enEspera = filas.filter(f => /espera/.test(f.comportamiento)).map(f => f.clave);
    // La escalera SI esta en la paleta de /map/empty (es de las de serie), asi que tiene que estar
    // definida de verdad y no en espera: la espera no puede tragarse lo que si existe.
    const esc = game.bloques._tabla['hab:escalera'];
    return {
      paleta: mc.blockKey.filter(Boolean).length,
      pend, enEspera, total: filas.length,
      escalera: esc ? { trepable: esc.trepable, subida: esc.subida } : null,
    };
  });

  ok('hay materiales apuntados en espera, no perdidos', r.pend.length > 0, r.pend.join(' '));
  ok('lista() los enseña todos, para que se vean desde fuera',
    r.enEspera.length === r.pend.length && r.pend.every(k => r.enEspera.indexOf(k) >= 0),
    'lista dice ' + r.enEspera.length + ' de ' + r.pend.length);
  const suma = espera.reduce((s, m) => s + parseInt(/: (\d+) material/.exec(m.txt)[1], 10), 0);
  ok('...y entre todas suman exactamente lo que espera', suma === r.pend.length,
    suma + ' anunciados vs ' + r.pend.length + ' en espera');
  ok('hab:escalera, que SÍ está en la paleta, queda definida de verdad',
    !!r.escalera && r.escalera.trepable === true && r.escalera.subida > 0,
    r.escalera ? '↑' + r.escalera.subida : 'no está');
  ok('...y no figura entre las que esperan', r.pend.indexOf('hab:escalera') < 0);

  console.log('\n' + (fallos ? fallos + ' fallo(s)' : 'todo ok') + ' · paleta de /map/empty: '
    + r.paleta + ' materiales · ' + r.pend.length + ' en espera');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
