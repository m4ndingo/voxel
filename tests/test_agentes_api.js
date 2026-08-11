// @area: agentes
// @necesita: node
// El almacen de agentes articulados: data/agentes/<id>.json servido por /api/agentes.
// Un agente es un DOCUMENTO (que piezas, donde van, como articulan), no codigo — el motor vive en el
// snippet «mundo-autoarranque». Lo que se guarda aqui es lo que anima el bicho, asi que:
//   · el formato VA A CRECER (la fase 3 le pondra pose de reposo, sonidos, lo que sea) y un guardado
//     desde una version vieja del panel no puede tirar a la basura las claves que no entiende. Es la
//     unica prueba de esta tanda que no se ve en pantalla y la unica que cuesta un mundo detectar:
//     el bicho sigue andando igual y solo le falta el sonido, medio ano despues;
//   · NADA se borra de verdad: DELETE y renombrar mandan el fichero a la papelera;
//   · el zombie tiene que estar servido POR ID, porque desde la fase 2 el snippet ya no lo describe:
//     hace `game.esqueletos.crear('zombie', ...)` y si esto devuelve 404 no aparece ningun zombie.
//
// Necesita el servidor vivo:  python3 server.py 8500     (otro puerto: node test_agentes_api.js 8599)
// Ojo si da 404 en todo: sera un server.py arrancado ANTES de que existiera /api/agentes — Python no
// recarga el fichero solo, hay que reiniciarlo.
// Solo escribe con ids `test-…` y los retira al acabar; no toca ni al zombie ni a los habitantes.
const http = require('http');
const fs = require('fs');

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
      headers: datos ? { 'Content-Type': 'application/json', 'Content-Length': datos.length } : {}
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

// Un agente minimo pero VALIDO (raiz con pieza + piezas[]), con basura deliberada dentro: las claves
// que el servidor de hoy no conoce tienen que volver intactas.
const nuevo = (nombre) => ({
  nombre,
  raiz: { nombre: 'torso', pieza: 'asset:assets/torso-zombie.vox.json', rot: 0 },
  piezas: [{ nombre: 'cabeza', pieza: 'asset:assets/cabeza-zombie.vox.json', en: [0, 0.875, 0],
             mirar: { limites: { y: [-70, 70] }, alcance: 12 } }],
  seguir: { deteccion: 14, distancia: 1.2, velocidad: 2.2 },
  cuerpo: { ancho: 0.8, alto: 2.5 },
  // ── lo que el servidor NO conoce ──
  loQueVendra: { sonido: 'gruñido.ogg', pose: [1, 2, 3] },
  notas: ['una lista suelta'],
  ceroYFalso: [0, false, null, '']            // valores que un `if (x)` mal puesto se comeria
});

(async () => {
  // ── El zombie, servido por id ───────────────────────────────────────────────────────────────
  const lista0 = await pide('GET', '/api/agentes');
  ok('GET /api/agentes responde una lista', lista0.code === 200 && Array.isArray(lista0.d), lista0.code);
  const z = (lista0.d || []).find((a) => a.id === 'zombie');
  ok('el zombie esta en el listado', !!z, z ? z.nombre + ', ' + z.piezas + ' piezas' : 'no esta');
  ok('el listado cuenta la raiz como pieza', !!z && z.piezas === 6, z && z.piezas);

  const zdoc = await pide('GET', '/api/agentes/zombie');
  ok('GET /api/agentes/zombie sirve el documento', zdoc.code === 200 && !!zdoc.d && !!zdoc.d.raiz);
  ok('...con sus 5 piezas y la raiz', !!zdoc.d && Array.isArray(zdoc.d.piezas) && zdoc.d.piezas.length === 5
    && zdoc.d.raiz.pieza === 'asset:assets/torso-zombie.vox.json');
  // Servido == fichero: si algun dia el GET filtrara campos, el bicho del navegador dejaria de ser
  // el del disco y el test §17 (que lee el fichero) daria verde con el mundo roto.
  const enDisco = JSON.parse(fs.readFileSync('data/agentes/zombie.json', 'utf8'));
  ok('lo servido es exactamente el fichero', JSON.stringify(zdoc.d) === JSON.stringify(enDisco));

  ok('un id que no existe da 404', (await pide('GET', '/api/agentes/no-existe-jamas')).code === 404);

  // ── Guardar: las claves desconocidas VIAJAN ─────────────────────────────────────────────────
  const doc = nuevo('test agente uno');
  const post = await pide('POST', '/api/agentes', doc);
  ok('POST guarda y devuelve el id (slug del nombre)', post.code === 200 && post.d && post.d.id === 'test-agente-uno',
    post.d && post.d.id);
  ok('...y la marca de tiempo', !!(post.d && post.d.savedAt));

  const leido = await pide('GET', '/api/agentes/test-agente-uno');
  ok('vuelve entero', leido.code === 200 && !!leido.d);
  ok('el servidor le pone id y savedAt', leido.d.id === 'test-agente-uno' && !!leido.d.savedAt);
  ok('las claves desconocidas sobreviven',
    JSON.stringify(leido.d.loQueVendra) === JSON.stringify(doc.loQueVendra)
    && JSON.stringify(leido.d.notas) === JSON.stringify(doc.notas));
  ok('...incluidos los 0, false, null y ""',
    JSON.stringify(leido.d.ceroYFalso) === JSON.stringify(doc.ceroYFalso));
  ok('y lo conocido no se toca', JSON.stringify(leido.d.piezas) === JSON.stringify(doc.piezas)
    && JSON.stringify(leido.d.seguir) === JSON.stringify(doc.seguir));

  // Volver a guardar respalda la version anterior en vez de perderla.
  // Se mira la marca de tiempo del respaldo MAS NUEVO de este fichero, no cuantos hay en total: la
  // papelera esta acotada a MAX_TRASH_FILES=30 POR ORIGEN, asi que a partir de la trigesima vez que
  // se corre este test entra uno y sale otro, el total no sube y el test fallaba sin que nada
  // estuviera roto (el respaldo se hacia igual).
  const suyos = () => fs.readdirSync('data/habitantes_trash')
    .filter(f => f.endsWith('__test-agente-uno.json')).sort();
  const antes = suyos().pop() || '';
  await pide('POST', '/api/agentes', { ...doc, cuerpo: { ancho: 0.9, alto: 2.5 } });
  const rel = await pide('GET', '/api/agentes/test-agente-uno');
  ok('re-guardar pisa el documento', rel.d.cuerpo.ancho === 0.9);
  ok('...pero respalda el anterior en la papelera', (suyos().pop() || '') > antes);

  // ── Lo invalido se rechaza (y no deja fichero) ──────────────────────────────────────────────
  ok('sin raiz: 400', (await pide('POST', '/api/agentes', { nombre: 'test malo', piezas: [] })).code === 400);
  ok('sin piezas[]: 400', (await pide('POST', '/api/agentes',
    { nombre: 'test malo', raiz: { pieza: 'asset:x' } })).code === 400);
  ok('raiz sin pieza: 400', (await pide('POST', '/api/agentes',
    { nombre: 'test malo', raiz: {}, piezas: [] })).code === 400);
  ok('un rechazo no crea el fichero', !fs.existsSync('data/agentes/test-malo.json'));

  // ── Renombrar mueve el fichero ──────────────────────────────────────────────────────────────
  const pat = await pide('PATCH', '/api/agentes/test-agente-uno', { nombre: 'test agente dos' });
  ok('PATCH renombra y devuelve el id nuevo', pat.code === 200 && pat.d.id === 'test-agente-dos', pat.d && pat.d.id);
  const dos = await pide('GET', '/api/agentes/test-agente-dos');
  ok('el documento esta en el id nuevo', dos.code === 200 && dos.d.nombre === 'test agente dos');
  ok('...con sus claves desconocidas todavia dentro',
    JSON.stringify(dos.d.loQueVendra) === JSON.stringify(doc.loQueVendra));
  ok('y el id viejo ya no responde', (await pide('GET', '/api/agentes/test-agente-uno')).code === 404);

  // ── Borrar es mandar a la papelera ──────────────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 15));
  const antesDel = fs.readdirSync('data/habitantes_trash').length;
  const delRes = await pide('DELETE', '/api/agentes/test-agente-dos');
  ok('DELETE responde ok', delRes.code === 200);
  ok('...y ya no existe', (await pide('GET', '/api/agentes/test-agente-dos')).code === 404);
  const trashFiles = fs.readdirSync('data/habitantes_trash');
  const enPapelera = trashFiles.some(f => f.endsWith('__test-agente-dos.json'));
  ok('...pero esta en la papelera, no borrado', enPapelera);
  ok('borrar lo que no hay da 404', (await pide('DELETE', '/api/agentes/no-existe-jamas')).code === 404);

  // ── El zombie sigue intacto despues de todo el trajin ───────────────────────────────────────
  const zfin = await pide('GET', '/api/agentes/zombie');
  ok('el zombie no se ha movido', zfin.code === 200 && JSON.stringify(zfin.d) === JSON.stringify(enDisco));
  ok('y no queda ningun test-* suelto',
    fs.readdirSync('data/agentes').filter((f) => f.startsWith('test-')).length === 0,
    fs.readdirSync('data/agentes').join(' '));

  console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\n30 ok, 0 fallos');
  process.exit(fallos ? 1 : 0);
})();