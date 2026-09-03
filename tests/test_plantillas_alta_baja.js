// @area: general
// @necesita: servidor
// REQ-PLANT3 · Alta y baja de plantillas del carrusel, y los dos topes de tamaño de cada ficha.
//
// Petición del dueño (2026-09-02): «*sobre las plantillas no se ve / entiende cuál es el método para
// dar de alta una nueva o borrar una existente*». La respuesta del programa es que **no hay catálogo
// que mantener**: el carrusel es «los snippets que llevan una `ficha` dentro». Eso hace el alta
// trivial (publicas el generador con su ficha y aparece) pero deja la baja sin sitio, y lo que se
// probó primero —quitarle la `ficha`— dejaba la plantilla fuera TAMBIÉN del panel, o sea sin vuelta
// atrás. Por eso la baja es la marca `oculta` y esto es lo que vigila este test:
//
// · dada de baja, **desaparece del carrusel** (`/api/plantillas`, que es lo que ve el jugador)…
// · …pero **sigue en el panel** (`/api/panel/plantillas`), que es de donde se devuelve;
// · el `code` del generador **no se toca** (dar de baja no es borrar: el snippet sigue funcionando);
// · `savedAt` tampoco, porque es la clave por la que se ORDENA la lista del editor de código;
// · y `lado`/`ladoMax` se guardan desde el panel, que es el tope que evita repetir el «borrame-6»
//   (un bioma denso a 256×256 dejó al navegador sin memoria).
//
// Necesita el servidor vivo:  python3 server.py 8500     (otro puerto: node test_plantillas_alta_baja.js 8599)
// Sólo toca la ficha de UNA plantilla y la deja exactamente como estaba, pase lo que pase.
const http = require('http');
// El panel pide `panel.usar`: contra un 8500 en modo público, sin identificarse esto ni siquiera
// arrancaba («no hay panel en el 8500 (HTTP 401)»). Sin token (desarrollo) no añade nada.
const { cabecerasDueno } = require('./_token');

let fallos = 0;
const ok = (nom, cond, extra) => {
  console.log((cond ? '  ok  ' : '  FALLA  ') + nom + (extra ? '   (' + extra + ')' : ''));
  if (!cond) fallos++;
};
const PUERTO = +(process.argv[2] || 8500);

function pide(metodo, ruta, cuerpo) {
  return new Promise((res, rej) => {
    const datos = cuerpo === undefined ? null : Buffer.from(JSON.stringify(cuerpo), 'utf8');
    const r = http.request({
      host: '127.0.0.1', port: PUERTO, path: ruta, method: metodo,
      headers: cabecerasDueno(datos ? { 'Content-Type': 'application/json', 'Content-Length': datos.length } : {})
    }, (rp) => {
      let b = ''; rp.setEncoding('utf8');
      rp.on('data', (c) => { b += c; });
      rp.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} res({ code: rp.statusCode, d: j, raw: b }); });
    });
    r.on('error', rej);
    if (datos) r.write(datos);
    r.end();
  });
}

const enCarrusel = async (id) => ((await pide('GET', '/api/plantillas')).d.plantillas || []).some((p) => p.id === id);
const enPanel = async (id) => ((await pide('GET', '/api/panel/plantillas')).d.plantillas || []).find((p) => p.id === id);
// El snippet entero, para comprobar que la baja no ha rozado el código.
const doc = async (id) => (await pide('GET', '/api/snippets/' + encodeURIComponent(id))).d || {};

(async () => {
  const lista = await pide('GET', '/api/panel/plantillas');
  if (lista.code !== 200) { console.log('⛔ no hay panel en el ' + PUERTO + ' (HTTP ' + lista.code + ')'); process.exit(1); }
  ok('el panel manda los lados que valida el servidor', Array.isArray(lista.d.lados) && lista.d.lados.length >= 4,
    JSON.stringify(lista.d.lados));

  // ⚠️ Se elige una editable: las dos del propio programa («terreno-base», «vacio») no son snippets
  // y el servidor rechaza tocarles los textos a propósito.
  const cobaya = (lista.d.plantillas || []).find((p) => p.editable);
  if (!cobaya) { console.log('⛔ no hay ninguna plantilla de snippet con la que probar'); process.exit(1); }
  const id = cobaya.id;
  const original = JSON.parse(JSON.stringify(cobaya.ficha));
  const antes = await doc(id);
  console.log('  · cobaya: ' + id);

  try {
    ok('de partida sale en el carrusel', await enCarrusel(id));

    // ── La baja ────────────────────────────────────────────────────────────────────────────────
    const baja = await pide('POST', '/api/panel/plantilla', { id, ficha: { oculta: true } });
    ok('el panel acepta darla de baja', baja.code === 200, 'HTTP ' + baja.code + ' ' + (baja.d && baja.d.error || ''));
    ok('⛔ ya NO sale en el carrusel', !(await enCarrusel(id)));
    const fuera = await enPanel(id);
    ok('…pero SIGUE en el panel, que es de donde se devuelve', !!fuera && fuera.ficha.oculta === true);

    const despues = await doc(id);
    ok('el `code` del generador está intacto', despues.code === antes.code,
      (antes.code || '').length + ' → ' + (despues.code || '').length + ' bytes');
    ok('y `savedAt` no se ha movido (ordena la lista del editor)', despues.savedAt === antes.savedAt,
      antes.savedAt + ' → ' + despues.savedAt);

    // ── El alta, que aquí es devolverla ────────────────────────────────────────────────────────
    const alta = await pide('POST', '/api/panel/plantilla', { id, ficha: { oculta: false } });
    ok('el panel la devuelve al carrusel', alta.code === 200, 'HTTP ' + alta.code);
    ok('vuelve a salir en el carrusel', await enCarrusel(id));

    // ── Los dos topes de tamaño ────────────────────────────────────────────────────────────────
    const lado = lista.d.lados[0], maximo = lista.d.lados[1];
    const tam = await pide('POST', '/api/panel/plantilla', { id, ficha: { lado, ladoMax: maximo } });
    ok('el panel guarda los tamaños de la ficha', tam.code === 200, 'HTTP ' + tam.code);
    const conTam = await enPanel(id);
    ok('…y vuelven leídos igual', conTam && conTam.ficha.lado === lado && conTam.ficha.ladoMax === maximo,
      conTam && (conTam.ficha.lado + '/' + conTam.ficha.ladoMax));
    const enJuego = ((await pide('GET', '/api/plantillas')).d.plantillas || []).find((p) => p.id === id);
    ok('el asistente de mundo nuevo los recibe (es quien tacha los tamaños que no caben)',
      enJuego && enJuego.ficha.ladoMax === maximo, enJuego && String(enJuego.ficha.ladoMax));

    // ⛔ Un tamaño que no está en la lista no se cuela: `normaliza_ficha` lo deja en 0, que es
    // «sin límite», y colar un tope inventado sería peor que no tener tope.
    await pide('POST', '/api/panel/plantilla', { id, ficha: { ladoMax: 137 } });
    const raro = await enPanel(id);
    ok('un lado que no existe no se guarda', raro && raro.ficha.ladoMax === 0, raro && String(raro.ficha.ladoMax));
  } finally {
    // Se deja como estaba, falle lo que falle.
    await pide('POST', '/api/panel/plantilla', { id, ficha: original });
    const fin = await enPanel(id);
    ok('la ficha queda como estaba', !!fin && JSON.stringify(fin.ficha) === JSON.stringify(original),
      fin && JSON.stringify(fin.ficha));
  }

  console.log(fallos ? '\n⛔ ' + fallos + ' fallos' : '\n✓ todo ok');
  process.exit(fallos ? 1 : 0);
})();
