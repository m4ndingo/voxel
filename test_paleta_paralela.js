// PERF-MC3 · abrir /map/empty (CERO voxels) costaba 2178 ms en el host del dueño, y el 81 % era bajar
// los 15 documentos de la paleta EN SERIE: cada vuelta del bucle esperaba su fetch entera antes de pedir
// la siguiente. De propina, el cartel decia «(0/15)» durante los 868 ms del primer bloque y enseñaba el
// nombre del bloque YA terminado, no el que estaba bajando: parecia un cuelgue justo cuando mas trabajo
// habia. Aqui se fija lo uno y lo otro en el navegador de verdad.
//
// Lo que se mide NO es «cuanto tarda» (eso depende de la maquina y del dia) sino la FORMA: que las
// peticiones se SOLAPAN en el tiempo, que la paleta resultante es la misma de antes, y que el aviso de
// progreso llega antes de trabajar el bloque. No persiste nada: los POST a la API van bloqueados.
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
    // Cada fetch queda apuntada con su instante de SALIDA y de LLEGADA: con eso se sabe si dos se
    // pisaron en el tiempo o si una espero a que acabara la otra, que es justo lo que se corrige.
    window.__red = [];
    const t0 = performance.now(), orig = window.fetch;
    window.fetch = function (u, o) {
      const url = String((u && u.url) || u);
      if (o && String(o.method || 'GET').toUpperCase() === 'POST' && /\/api\//.test(url))
        return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      const reg = { url, ini: performance.now() - t0, fin: Infinity };
      window.__red.push(reg);
      const marca = () => { reg.fin = performance.now() - t0; };
      return orig(u, o).then(r => { marca(); return r; }, e => { marca(); throw e; });
    };
  });

  // El cartel de carga se lee capturandolo mientras pasa: cuando la promesa de goto vuelve, ya no esta.
  await p.addInitScript(() => {
    window.__carteles = [];
    const armar = () => {
      if (typeof mcShowLoading !== 'function') return setTimeout(armar, 5);
      const orig = mcShowLoading;
      window.mcShowLoading = function (txt) { window.__carteles.push(String(txt)); return orig.apply(this, arguments); };
    };
    armar();
  });

  await p.goto('http://localhost:8500/map/empty', { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.active && mc.grid', null, { timeout: 240000 });
  await p.waitForTimeout(6000);

  const r = await p.evaluate(() => ({
    red: window.__red.map(x => ({ url: x.url.replace(/^https?:\/\/[^/]+/, ''), ini: x.ini, fin: x.fin })),
    carteles: window.__carteles,
    paleta: mc.blockKey.filter(Boolean),
    bloques: (mc.blocks || []).map(x => ({ key: x.key, name: x.name })),
  }));

  // ── A · las descargas de la paleta se solapan ────────────────────────────────────────────────────
  // Un documento de material es o un asset (/assets/*.vox.json) o un habitante (/api/habitantes/<id>).
  const claves = new Set(r.bloques.map(x => x.key.replace(/^(asset:|hab:)/, '').replace(/@\d+$/, '')));
  const docs = r.red.filter(x => /\.vox\.json$|\/api\/habitantes\/./.test(x.url))
                    .filter(x => [...claves].some(k => x.url.indexOf(k) >= 0));
  ok('se piden los documentos de la paleta', docs.length >= 4, docs.length + ' de ' + r.bloques.length + ' bloques');

  const solapa = (a, c) => a.ini < c.fin && c.ini < a.fin;
  const conSolape = docs.filter(a => docs.some(c => c !== a && solapa(a, c)));
  ok('...y salen SOLAPADAS, no una detrás de otra',
    conSolape.length === docs.length, conSolape.length + ' de ' + docs.length + ' se pisan con otra');

  // La prueba dura es CUANTAS hay en vuelo a la vez. No vale exigir que salgan todas de golpe: el
  // navegador solo abre ~6 conexiones por host, y encima el editor esta pidiendo lo suyo por el mismo
  // sitio, asi que las ultimas esperan turno aunque el codigo ya las haya soltado. Yendo en serie este
  // numero seria 1 por definicion.
  const hitos = [];
  for (const d of docs) { hitos.push([d.ini, 1]); hitos.push([d.fin, -1]); }
  hitos.sort((a, c) => a[0] - c[0]);
  let vivas = 0, pico = 0;
  for (const [, delta] of hitos) { vivas += delta; if (vivas > pico) pico = vivas; }
  ok('hay varias EN VUELO a la vez (en serie el pico sería 1)', pico >= 4, 'pico de ' + pico + ' simultáneas');

  // Aqui NO se mide el reloj de pared contra la suma de las partes: en localhost cada peticion dura
  // 2-35 ms y lo que domina el reloj es la cola de conexiones del navegador, no el codigo que se
  // cambio. Seria una medida frágil que aprueba y suspende sola. El pico de arriba es la buena.

  // ── B · la paleta resultante no cambia ───────────────────────────────────────────────────────────
  // Es el criterio de aceptacion del ticket: mas rapido, mismo resultado. El orden importa porque el
  // id de bloque es la posicion en mc.blockKey, y los mundos guardados llevan ids dentro.
  ok('la paleta sale completa', r.paleta.length === r.bloques.length,
    r.paleta.length + ' materiales vs ' + r.bloques.length + ' bloques');
  ok('...y EN EL MISMO ORDEN que la lista de bloques (el id es la posición)',
    r.paleta.every((k, i) => k === r.bloques[i].key),
    r.paleta.slice(0, 4).join(' ') + '…');
  ok('sin claves repetidas', new Set(r.paleta).size === r.paleta.length);

  // ── C · el cartel no se queda clavado ────────────────────────────────────────────────────────────
  const bloqueCartel = r.carteles.filter(t => /Preparando bloques/.test(t));
  ok('el cartel va nombrando los bloques', bloqueCartel.length >= r.bloques.length,
    bloqueCartel.length + ' avisos para ' + r.bloques.length + ' bloques');

  // Lo que fallaba: el nombre que se enseñaba era el del bloque ya terminado. Ahora el PRIMER aviso con
  // nombre tiene que ser el del PRIMER bloque, y llegar todavia con el contador a 0.
  const conNombre = bloqueCartel.filter(t => /\(\d+\/\d+\)\s+\S/.test(t));
  const primero = conNombre[0] || '';
  ok('el primer aviso ya dice qué bloque está bajando, con el contador aún a 0',
    /\(0\//.test(primero) && primero.indexOf(r.bloques[0].name) >= 0,
    JSON.stringify(primero));

  // Y hay dos avisos por bloque (empezar y acabar), asi que el contador se mueve mientras se trabaja.
  ok('...y cada bloque avisa dos veces: al empezar y al acabar',
    bloqueCartel.length >= r.bloques.length * 2 - 1,
    bloqueCartel.length + ' avisos');

  // ── D · nadie pide dos veces lo mismo ────────────────────────────────────────────────────────────
  // Tres inicializadores del editor (galeria, catalogo de bloques y catalogo de texturas) arrancan a la
  // vez y pedian cada uno su /api/habitantes. Ahora comparten la peticion EN VUELO.
  const listas = r.red.filter(x => /\/api\/habitantes$/.test(x.url));
  ok('/api/habitantes se pide UNA vez, no una por inicializador', listas.length === 1,
    listas.length + ' petición(es)');

  const veces = {};
  for (const x of docs) veces[x.url] = (veces[x.url] || 0) + 1;
  const repes = Object.entries(veces).filter(([, n]) => n > 1);
  ok('ningún documento de material se baja dos veces', repes.length === 0,
    repes.map(([u, n]) => u + '×' + n).join(' '));

  ok('sin errores de página', errores.length === 0, errores.join(' | '));

  console.log('\n' + (fallos ? fallos + ' fallo(s)' : 'todo ok') + ' · ' + r.bloques.length
    + ' bloques · ' + docs.length + ' documentos, ' + conSolape.length + ' solapados');
  await b.close();
  process.exit(fallos ? 1 : 0);
})();
