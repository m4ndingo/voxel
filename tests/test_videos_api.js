// @area servidor
// @necesita servidor
// Test de integración para la API de vídeos de gameplay (REQ-REC1):
// - GET /videos -> sirve videos.html
// - GET /api/videos -> lista vídeos en disco
// - POST /api/videos -> sube clip de vídeo y ficha json
// - DELETE /api/videos/<id> -> mueve a papelera

const http = require('http');
const assert = require('assert');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: 8500,
      path: path,
      method: method,
      headers: Object.assign({}, headers)
    };
    // ⚠️ Este test ESCRIBE (`POST /api/videos` pide `foto.subir`), y quién es el dueño depende de
    // cómo se arrancó el servidor: sin `VOXELFORGE_TOKEN` lo es todo el mundo (desarrollo), y con
    // token —o en modo público— hay que traerlo. Sin la cabecera el POST recibe 401 y el test lo
    // cuenta como fallo de la API, que es mentira: es el test sin identificarse.
    //     export $(grep -h VOXELFORGE_TOKEN /root/voxelforge.env) && node correr_tests.js --node
    if ((process.env.VOXELFORGE_TOKEN || '').trim()) {
      opts.headers['X-VoxelForge-Token'] = process.env.VOXELFORGE_TOKEN.trim();
    }
    if (body) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log('--- Test API Vídeos (REQ-REC1) ---');

  // 1. GET /videos
  const rPage = await request('GET', '/videos');
  assert.strictEqual(rPage.status, 200, 'GET /videos debe responder 200');
  assert(rPage.body.includes('<title>Vídeos · VoxelForge</title>'), 'GET /videos debe servir videos.html');
  console.log('✓ GET /videos sirve correctamente');

  // 2. GET /api/videos
  const rList1 = await request('GET', '/api/videos');
  assert.strictEqual(rList1.status, 200, 'GET /api/videos debe responder 200');
  const vids1 = JSON.parse(rList1.body);
  assert(Array.isArray(vids1), '/api/videos debe devolver un array');
  console.log('✓ GET /api/videos responde con lista válida (total: ' + vids1.length + ')');

  // 3. POST /api/videos
  // Un payload simulado con base64 de datos de vídeo
  const dummyBuffer = Buffer.from('TEST_DUMMY_MP4_VIDEO_STREAM_DATA_VOXELFORGE');
  const dummyB64 = dummyBuffer.toString('base64');
  const fichaPrueba = {
    mapa: 'test',
    duracion: 3.5,
    ancho: 1280,
    alto: 720,
    resolucion: '1280×720',
    pos: [10, 20, 30],
    rumbo: 'Norte'
  };

  const rPost = await request('POST', '/api/videos', {
    video: dummyB64,
    ext: 'mp4',
    ficha: fichaPrueba
  });
  assert.strictEqual(rPost.status, 200, 'POST /api/videos debe responder 200');
  const postRes = JSON.parse(rPost.body);
  assert(postRes.ok === true, 'POST /api/videos debe devolver ok: true');
  assert(postRes.id, 'POST /api/videos debe devolver id asignado');
  assert(postRes.url.includes(postRes.id), 'POST /api/videos debe devolver url');
  console.log('✓ POST /api/videos guardó vídeo correctamente:', postRes.id);

  // 4. GET /api/videos después de POST
  const rList2 = await request('GET', '/api/videos');
  const vids2 = JSON.parse(rList2.body);
  const found = vids2.find(v => v.id === postRes.id);
  assert(found, 'El vídeo recién guardado debe aparecer en GET /api/videos');
  assert.strictEqual(found.mapa, 'test', 'Metadatos de mapa deben coincidir');
  assert.strictEqual(found.bytes, dummyBuffer.length, 'Bytes guardados deben coincidir');
  console.log('✓ GET /api/videos lista el vídeo creado');

  // 5. DELETE /api/videos/<id>
  const rDel = await request('DELETE', '/api/videos/' + encodeURIComponent(postRes.id));
  assert.strictEqual(rDel.status, 200, 'DELETE /api/videos/<id> debe responder 200');
  const delRes = JSON.parse(rDel.body);
  assert(delRes.ok === true, 'DELETE debe devolver ok: true');
  console.log('✓ DELETE /api/videos/' + postRes.id + ' borró a papelera correctamente');

  // 6. Verificar que ya no está en GET /api/videos
  const rList3 = await request('GET', '/api/videos');
  const vids3 = JSON.parse(rList3.body);
  assert(!vids3.some(v => v.id === postRes.id), 'El vídeo borrado ya no debe aparecer');
  console.log('✓ El vídeo borrado ya no figura en la lista');

  console.log('\n✅ TODOS LOS TESTS DE /api/videos PASARON SATISFACTORIAMENTE');
}

run().catch(err => {
  console.error('❌ Error en test_videos_api.js:', err);
  process.exit(1);
});
