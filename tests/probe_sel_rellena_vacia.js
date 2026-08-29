// @area: mundo
// @necesita: servidor, playwright
// SONDA de «la selección VACÍA no se deja rellenar desde una ranura».
//
// Dueño (2026-08-29): «*seleccionar suelo, clic central, control arriba → sube seleccion pero nada en
// ella (vacia), clic en ranura dice "Nada que reemplazar" pero en realidad hay "aire" que reemplazar*».
//
// Dónde está: `mcSelectFill` reparte en DOS caminos y sólo uno sabe de aire.
//   · ranura con BLOQUE suelto → `mcSelectFillId`, que ya elige `mcSelForEachConAire` cuando no le piden
//     «sólo sólidos» (app.js:16943) ⇒ rellena el aire, esto YA funciona;
//   · ranura con PIEZA         → `mcSelectFillPieza`, que para resolver la clave necesita escribir una
//     primera celda y la busca SIEMPRE con `mcSelForEach` (sólidos, app.js:16906). Sin sólidos no hay
//     celda semilla, y sale por «Nada que reemplazar» aunque le hayan pedido rellenar también el aire.
// Por eso el mensaje del dueño es el de la PIEZA: el del bloque suelto sería «Nada que rellenar».
//
// Las cuatro preguntas, que son las que el arreglo puede romper:
//   §1 bloque suelto + selección vacía → rellena (línea base: tiene que ir ya, sin snippet);
//   §2 PIEZA + selección vacía         → EL FALLO;
//   §3 PIEZA + selección con sólidos   → intacto (el arreglo no puede cambiar el caso que ya iba);
//   §4 Shift+ranura (`soloSolidos`) + selección vacía → NO rellena. «Sólo sólidos» y no hay ninguno:
//      rellenar aquí convertiría el gesto de reemplazar en uno de crear, que es justo lo que no pide.
//
// Desde el 2026-08-29 el arreglo está en `app.js` (`herramientas/parche_app_sel_rellena_vacia.py`), así
// que la sonda mide EL MOTOR: el snippet que carga se aparta solo. `SNIPPET=0` lo salta del todo.
//
// Corre en `/map/empty` con el AUTOGUARDADO APAGADO —planta bloques de verdad— y se comprueba al final
// que `empty.vox` no se ha tocado.
//
//   node tests/probe_sel_rellena_vacia.js [url]
const { chromium } = require('playwright');
const fs = require('fs');

const URL = process.argv[2] || 'http://localhost:8500/map/empty?noauto=1';
const VOX = __dirname + '/../data/worlds/empty.vox';
const PIEZA = 'asset:assets/hierba-alta.vox.json';   // 153 vox en un 16³: pieza de verdad, no bloque lleno

(async () => {
  const mtimeAntes = fs.statSync(VOX).mtimeMs;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('typeof mc!=="undefined" && mc.prog && mc.grid && mc.active && typeof game!=="undefined"', null, { timeout: 180000 });
  await page.waitForTimeout(4000);

  const conSnippet = process.env.SNIPPET !== '0';
  let arranque = '(sin snippet: se mide el motor pelado)';
  if (conSnippet) {
    arranque = await page.evaluate(async () => {
      const r = await fetch('/api/snippets/sel-rellena-vacia');
      if (!r.ok) return '(no publicado todavía)';
      const snp = await r.json();
      const AF = Object.getPrototypeOf(async function () {}).constructor;
      return await new AF(snp.code)();
    });
  }
  console.log('   arranque: ' + arranque);

  const r = await page.evaluate(async PIEZA => {
    game.autosave(false);                       // ⛔ nada de esta sonda llega al disco
    const out = {};
    mc.tool = 'select';

    // Los toast son la respuesta del motor al gesto: se recogen para poder citarlos.
    const dichos = [];
    const toastOrig = window.toast;
    window.toast = function (t) { dichos.push(t); return toastOrig.apply(this, arguments); };

    const cx = mc.dim.x >> 1, cz = mc.dim.z >> 1;
    let suelo = -1;
    for (let y = mc.dim.y - 1; y >= 0; y--) if (mc.grid[mcIdx(cx, y, cz)]) { suelo = y; break; }
    const huella = () => { let n = 0; for (let i = 0; i < mc.grid.length; i++) if (mc.grid[i]) n++; return n; };
    // ⚠️ `mc.selBox` NO se asigna: es una VISTA de `mc.selCajas` (app.js:7757, `set` hace
    // `selCajas=[v]`), así que `mc.selBox=true` deja la selección en `[true]` y revienta mcSelForEach.
    const caja = (a, b) => { mc.selCajas = [{ a: a.slice(), b: b.slice() }]; mc.selA = null; };
    const solidos = () => { let n = 0; mcSelForEach(() => n++); return n; };
    // Devolver la caja al aire entre sección y sección (no hay `mcSelectDelete` en el motor).
    const vaciar = () => {
      const c = mc.selCajas[0]; if (!c) return;
      for (let x = Math.min(c.a[0], c.b[0]); x <= Math.max(c.a[0], c.b[0]); x++)
        for (let y = Math.min(c.a[1], c.b[1]); y <= Math.max(c.a[1], c.b[1]); y++)
          for (let z = Math.min(c.a[2], c.b[2]); z <= Math.max(c.a[2], c.b[2]); z++)
            if (mcInside(x, y, z)) mcSetBlock(x, y, z, 0);
    };
    // Un gesto completo: se vacía el buzón de toast, se llama y se cuenta qué cambió en la rejilla.
    // La pieza puede contestar «aún se está cargando — vuelve a pulsar»; eso no es el fallo que se mide,
    // así que se vuelve a pulsar (que es lo que haría el dueño) hasta que conteste otra cosa.
    const dormir = ms => new Promise(r => setTimeout(r, ms));
    const gesto = async (i, soloSolidos) => {
      for (let intento = 0; intento < 12; intento++) {
        dichos.length = 0;
        const h = huella();
        const dev = mcSelectFill(i, soloSolidos);
        const res = { devuelve: dev, puestos: huella() - h, dentro: solidos(), dijo: dichos.slice(), intentos: intento + 1 };
        if (!res.dijo.some(t => /cargando/.test(t))) return res;
        await dormir(250);
      }
      return { devuelve: null, puestos: 0, dentro: solidos(), dijo: ['(se quedó cargando)'], intentos: 12 };
    };

    const alto = suelo + 8;                     // ocho por encima del suelo: ahí sólo hay aire
    out.escena = { suelo, alto, bloques: huella() };

    // ── §1 · bloque suelto + selección vacía ────────────────────────────────────────────────────
    mc.hotbar[0] = 1; mc.slotStruct[0] = null;  // id 1 = el primer material de la paleta
    caja([cx, alto, cz], [cx + 1, alto + 1, cz + 1]);
    out.vacia = solidos();                      // 0, o la sonda no está midiendo lo que cree
    out.bloqueEnVacia = await gesto(0);
    vaciar();                                   // se deja el aire como estaba para el siguiente §

    // ── §2 · PIEZA + selección vacía (EL FALLO) ─────────────────────────────────────────────────
    // ⚠️ Hay que ESPERAR a que la pieza esté cargada: `mcCabeEnRejilla` mira `mc.structs[k].w`, y si
    // aún no está lanza la carga y contesta `false` — la sonda salía por «ocupa más de un bloque»
    // sin llegar nunca al fallo que venía a medir.
    mc.slotStruct[1] = PIEZA; mc.hotbar[1] = 0;
    await mcStructCells(PIEZA).catch(() => {});
    out.piezaCabe = mcCabeEnRejilla(PIEZA);
    out.piezaDims = mc.structs[PIEZA] ? [mc.structs[PIEZA].w, mc.structs[PIEZA].h, mc.structs[PIEZA].d] : null;
    caja([cx, alto, cz], [cx + 1, alto + 1, cz + 1]);
    out.piezaEnVacia = await gesto(1);
    vaciar();

    // ── §3 · PIEZA + selección CON sólidos: esto ya iba, no puede cambiar ───────────────────────
    caja([cx, suelo, cz], [cx + 1, suelo, cz + 1]);
    out.solidosAntes = solidos();
    out.piezaEnLlena = await gesto(1);

    // ── §4 · Shift+ranura sobre selección vacía: «sólo sólidos», y no hay ──────────────────────
    caja([cx, alto + 4, cz], [cx + 1, alto + 5, cz + 1]);
    out.piezaSoloSolidos = await gesto(1, true);

    // ── §5 · el iterador prestado SE DEVUELVE ──────────────────────────────────────────────────
    // Lo único de este parche que podría envenenar el motor entero: `mcSelForEach` es LA puerta de los
    // sólidos de la selección (contar, pintar, copiar, cortar, guardar un recorte, app.js:16964).
    // Dejarlo apuntando al iterador CON AIRE haría que copiar una caja se llevara también el vacío.
    out.iteradorDevuelto = window.mcSelForEach !== window.mcSelForEachConAire &&
                           /if\(id\)/.test(String(window.mcSelForEach).replace(/\s/g, ''));
    out.hayMando = typeof game.selRellenaVacia !== 'undefined';
    if (out.hayMando) {
      out.off = game.selRellenaVacia.off();
      out.desenvuelto = !game.selRellenaVacia.puesto() && !mcSelectFillPieza._rellenaVacia;
    }
    window.toast = toastOrig;
    return out;
  }, PIEZA);

  console.log('   ' + JSON.stringify(r, null, 1).replace(/\n/g, '\n   '));

  // Se juzga por `dentro` —cuántos sólidos quedan en la caja al final— y no por `puestos`, que sólo
  // mide el último intento: la pieza puede pedir un segundo clic («aún se está cargando — vuelve a
  // pulsar», del motor), y entonces la primera pulsación ya plantó la celda semilla.
  const ok = {
    '§1 bloque suelto rellena la vacía (8/8)': r.bloqueEnVacia.dentro === 8,
    '§2 PIEZA rellena la vacía (8/8)': r.piezaEnVacia.dentro === 8,
    '§3 PIEZA sobre sólidos, intacta (4/4)': r.piezaEnLlena.dentro === 4,
    '§4 Shift NO rellena la vacía (0)': r.piezaSoloSolidos.dentro === 0 && r.piezaSoloSolidos.puestos === 0,
    '§5 mcSelForEach devuelto y desinstalación limpia':
        r.iteradorDevuelto && (!r.hayMando || r.desenvuelto)
  };
  let bien = true;
  for (const k in ok) { if (!ok[k]) bien = false; console.log('   ' + (ok[k] ? 'ok  ' : 'MAL ') + k); }
  console.log('\n   ' + (bien ? 'OK' : 'MAL') + ' · rellenar la selección vacía desde una ranura');

  await browser.close();
  console.log('   empty.vox intacto · ' + (mtimeAntes === fs.statSync(VOX).mtimeMs));
  process.exit(bien ? 0 : 1);
})();
