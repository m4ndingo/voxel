// @area: render
// @necesita: servidor, playwright
// Rayos-X enseña el NIVEL de señal de cada celda (REQ-XR2).
//
// Lo pidió el dueño: «una línea que indique el power del bloque». Es lo único de un circuito que no
// se ve mirándolo — un cable a 1 y otro a 14 son el mismo bloque en pantalla, y hasta ahora había
// que ir celda por celda con game.redstone.info(x,y,z).
//
// El reparto de responsabilidades es lo que se comprueba aquí, porque es lo que se puede romper sin
// darse cuenta:
//   · app.js le pasa al enganche mcXrayExtra la CELDA de la etiqueta (x,y,z sueltos, no un array:
//     esto corre por etiqueta y frame). Sin eso el motor no sabe de quién le preguntan.
//   · redstone/redstone.js ENVUELVE el enganche, no lo asigna: `mundo-autoarranque` ya lo ocupa con
//     los comportamientos y los giros, y las dos líneas tienen que convivir.
//   · y no se apila: el fichero se re-ejecuta solo en cada mapa.
//
// No persiste nada: bloquea los POST y devuelve las celdas tocadas a su valor anterior.
const { chromium } = require('playwright');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = (u, o) => {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\//.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      return orig(u, o);
    };
  });
  await p.goto('http://localhost:8500/map/test', { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 180000 });
  await p.waitForFunction('window.game && game.redstone && window.mcXrayExtra', null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(4000);

  const r = await p.evaluate(async () => {
    const out = { errs: [] };
    const FUENTE = 'asset:assets/bloque_redstone.vox.json', CABLE = 'hab:cable', INVERSOR = 'hab:inversor';
    out.hayEnganche = typeof window.mcXrayExtra === 'function';
    out.sello = window.mcXrayExtra && window.mcXrayExtra._redstone;
    // El envuelto guarda debajo al de `mundo-autoarranque`. Si esto fuera null, la línea de
    // comportamientos y giros habría desaparecido sin que nadie se enterase.
    out.debajoHayOtro = typeof (window.mcXrayExtra && window.mcXrayExtra._orig) === 'function';
    if (!out.hayEnganche) return out;

    // ── el sitio: suelo despejado, como en test_redstone_arranque ──
    let sitio = null;
    for (let x = 12; x < mc.dim.x - 14 && !sitio; x += 3) for (let z = 12; z < mc.dim.z - 14; z++) {
      let gy = -1;
      for (let y = mc.dim.y - 10; y > 1; y--) if (mc.grid[mcIdx(x, y, z)]) { gy = y; break; }
      if (gy < 1) continue;
      let libre = true;
      for (let y = gy + 1; y <= gy + 4 && libre; y++) for (let d = -1; d <= 4; d++) if (mc.grid[mcIdx(x + d, y, z)]) libre = false;
      if (libre) { sitio = [x, gy + 1, z]; break; }
    }
    if (!sitio) { out.errs.push('sin sitio despejado'); return out; }
    const [X, Y, Z] = sitio;
    out.sitio = sitio;

    const idEn = (x, y, z) => mc.grid[mcIdx(x, y, z)];
    const claveEn = (x, y, z) => mc.blockKey[idEn(x, y, z)] || null;
    const CELDAS = [[X, Y, Z], [X + 1, Y, Z], [X + 2, Y, Z], [X, Y + 1, Z], [X + 2, Y + 1, Z], [X + 4, Y, Z]];
    const antes = CELDAS.map(c => idEn(c[0], c[1], c[2]));
    // Una etiqueta es siempre la de un bloque de rejilla: la clave sale de mc.blockKey, igual que en
    // mcUpdateXrayLabels.
    const eti = (x, y, z) => window.mcXrayExtra(claveEn(x, y, z), null, x, y, z) || '';

    try {
      // ── el circuito: fuente → cable → cable, con dos piedras haciendo de puente ──
      await game.addMaterial(FUENTE);
      await game.addMaterial(CABLE);
      await game.addMaterial(INVERSOR);
      // El suelo de aquí, por ID: mc.name2id va por nombre corto y estas claves son largas.
      const SUELO = idEn(X, Y - 1, Z);
      const ROCA = claveEn(X, Y - 1, Z);        // macizo, y no es circuito: el puente de r1.2
      out.roca = ROCA;
      mcSetBlock(X, Y, Z, mc.name2id[FUENTE]);
      mcSetBlock(X + 1, Y, Z, mc.name2id[CABLE]);
      mcSetBlock(X + 2, Y, Z, mc.name2id[CABLE]);
      mcSetBlock(X, Y + 1, Z, SUELO);           // encima de la FUENTE: energía fuerte
      mcSetBlock(X + 2, Y + 1, Z, SUELO);       // encima de un CABLE: energía débil
      // Un inversor suelto: no recibe nada y por eso entrega 15. Es el caso «recibe ≠ saca», que es
      // el que justifica la flecha — mirando solo el bloque no hay forma de saber que da 15.
      mcSetBlock(X + 4, Y, Z, mc.name2id[INVERSOR]);
      game.redstone.repasarMundo();
      for (let i = 0; i < 40; i++) { game.redstone.tick(); await new Promise(res => setTimeout(res, 30)); }

      out.info = CELDAS.map(c => {
        const i = game.redstone.info(c[0], c[1], c[2]);
        return { recibe: i.recibe, saca: i.saca, esCircuito: i.esCircuito };
      });
      out.eti = CELDAS.map(c => eti(c[0], c[1], c[2]));

      // Un bloque de suelo cualquiera, lejos del circuito: no puede llevar línea de señal, o el
      // volumen entero (~245 etiquetas) se llena de «⚡ 0».
      out.lejos = eti(X + 8, Y - 1, Z + 8);
      out.lejosClave = claveEn(X + 8, Y - 1, Z + 8);

      // Una ESTRUCTURA fina no la ve el motor (idEn lee mc.grid), así que su celda de origen
      // contendría otra cosa y la cifra sería mentira. Misma celda que la fuente, con `s`.
      out.estructura = window.mcXrayExtra(CABLE, { ox: X, oy: Y, oz: Z, key: CABLE }, X, Y, Z) || '';

      // Compatibilidad: los enganches viejos llaman con dos argumentos y no pueden reventar.
      out.dosArgs = window.mcXrayExtra(claveEn(X, Y, Z), null) || '';

      // ── encadenado: la línea de `mundo-autoarranque` sigue saliendo, y la nuestra debajo ──
      if (window.game.bloques) {
        game.bloques.define(ROCA, { velocidad: 2 });
        out.encadenado = eti(X, Y + 1, Z);
        game.bloques.quitar(ROCA);
        out.trasQuitar = eti(X, Y + 1, Z);
      }

      // ── app.js pasa la celda de verdad, no solo en esta llamada a mano ──
      // Se espía el enganche y se pide una vuelta de etiquetas: si mcXrayExtraTexto perdiera los
      // (x,y,z), todas las llamadas llegarían con undefined y el fallo sería invisible aquí arriba.
      const real = window.mcXrayExtra;
      const vistas = [];
      window.mcXrayExtra = function (k, s, x, y, z) { vistas.push([k, !!s, x, y, z]); return ''; };
      const xrayAntes = mc.xray;
      mc.xray = true;
      mcUpdateXrayLabels();
      mc.xray = xrayAntes;
      window.mcXrayExtra = real;
      out.espiadas = vistas.length;
      out.conCelda = vistas.filter(v => Number.isFinite(v[2]) && Number.isFinite(v[3]) && Number.isFinite(v[4])).length;

      // ── re-cargar el motor no apila envoltorios ──
      // Por `redstone-arranque` y no por `redstone` a secas: el motor a pelo nace con la tabla vacía
      // (y por tanto sin línea de señal); el arranque es el que vuelve a traer las piezas.
      const d = await (await fetch('/api/snippets/redstone-arranque', { cache: 'no-store' })).json();
      await new (Object.getPrototypeOf(async function () {}).constructor)(d.code)();
      for (let i = 0; i < 40; i++) { game.redstone.tick(); await new Promise(res => setTimeout(res, 30)); }
      out.selloTras = window.mcXrayExtra._redstone;
      out.sinApilar = !(window.mcXrayExtra._orig && window.mcXrayExtra._orig._redstone);
      out.etiTras = eti(X + 1, Y, Z);
    } finally {
      CELDAS.forEach((c, i) => mcSetBlock(c[0], c[1], c[2], antes[i]));
      mcRemeshAround(X - 2, Z - 2, X + 4, Z + 3);
      game.redstone.repasarMundo();
      game.redstone.tick();
      out.restaurado = CELDAS.every((c, i) => idEn(c[0], c[1], c[2]) === antes[i]);
    }
    return out;
  });

  console.log('El enganche de rayos-X lo comparten el snippet y el motor');
  ok('mcXrayExtra está puesto', r.hayEnganche === true);
  if (!r.hayEnganche) { console.log(JSON.stringify(r, null, 1)); await b.close(); process.exit(1); }
  ok('redstone lo ENVUELVE (sello de versión)', !!r.sello, String(r.sello));
  ok('y debajo sigue el de mundo-autoarranque', r.debajoHayOtro === true);
  if (r.errs.length) { console.log('  ' + r.errs.join(' · ')); }
  if (!r.info) { console.log(JSON.stringify(r, null, 1)); await b.close(); process.exit(1); }

  const [fuente, cable1, cable2, encimaFuente, encimaCable, inversor] = r.eti;
  const inf = r.info;
  console.log('\nCada celda de circuito enseña lo que dice game.redstone.info()   (sitio ' + r.sitio.join(',') + ')');
  ok('la fuente está a 15', fuente === '⚡ 15', JSON.stringify(fuente));
  ok('el primer cable lleva señal', /^⚡ \d+$/.test(cable1) && inf[1].recibe > 0,
    JSON.stringify(cable1) + ' · info recibe ' + inf[1].recibe);
  ok('el segundo cable, uno menos (pérdida de 1 por salto)', cable2 === '⚡ ' + (inf[1].recibe - 1),
    JSON.stringify(cable2));
  ok('recibe ≠ saca sale con flecha (un inversor suelto)', inversor === '⚡ 0 → 15',
    JSON.stringify(inversor) + ' · info ' + inf[5].recibe + '/' + inf[5].saca);
  ok('la etiqueta coincide con info() en las cuatro', [0, 1, 2, 5].every(i =>
    r.eti[i] === '⚡ ' + inf[i].recibe + (inf[i].saca !== inf[i].recibe ? ' → ' + inf[i].saca : '')),
    [0, 1, 2, 5].map(i => r.eti[i]).join(' | '));

  console.log('\nUn bloque macizo solo la enseña si de verdad está haciendo de puente');
  ok('encima de la fuente, energía FUERTE', encimaFuente === '⚡ 15', JSON.stringify(encimaFuente));
  ok('encima de un cable, marcada como DÉBIL (un cable no la lee)',
    /^⚡ \d+ débil$/.test(encimaCable), JSON.stringify(encimaCable));
  ok('un bloque lejos del circuito no lleva línea', r.lejos === '',
    r.lejosClave + ' → ' + JSON.stringify(r.lejos));

  console.log('\nLo que NO tiene que llevar la línea');
  ok('una estructura fina no (el motor solo ve la rejilla)', !/⚡/.test(r.estructura), JSON.stringify(r.estructura));
  ok('llamar con dos argumentos no revienta ni inventa señal', r.dosArgs === '', JSON.stringify(r.dosArgs));

  console.log('\nLas dos líneas conviven');
  ok('el comportamiento de mundo-autoarranque va arriba y la señal debajo',
    r.encadenado === 'velocidad ×2\n⚡ 15', JSON.stringify(r.encadenado));
  ok('al quitar el comportamiento queda solo la señal', r.trasQuitar === '⚡ 15', JSON.stringify(r.trasQuitar));

  console.log('\napp.js le pasa la celda a cada etiqueta');
  ok('mcUpdateXrayLabels llama al enganche', r.espiadas > 0, r.espiadas + ' etiquetas');
  ok('y todas llevan (x,y,z)', r.espiadas > 0 && r.conCelda === r.espiadas, r.conCelda + '/' + r.espiadas);

  console.log('\nRe-ejecutar redstone.js no apila envoltorios');
  ok('sigue sellado', r.selloTras === r.sello, String(r.selloTras));
  ok('y debajo no hay otro envoltorio nuestro', r.sinApilar === true);
  ok('la señal se sigue leyendo igual', r.etiTras === cable1, JSON.stringify(r.etiTras));

  console.log('');
  ok('limpieza: las celdas vuelven a su valor', r.restaurado === true);
  ok('sin errores de pagina', errores.length === 0);
  if (errores.length) console.log(errores.join('\n'));

  await b.close();
  console.log(fallos === 0 ? '\ntodo ok' : '\n' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
})();