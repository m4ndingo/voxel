// El token del dueño, para los tests que ESCRIBEN. No es un test: es una pieza compartida
// (por eso el `_` delante — `correr_tests.js` solo recoge `test_*.js`).
//
// Por qué existe: quién es el dueño depende de cómo se arrancó el servidor. En desarrollo lo es
// todo el mundo y estos tests vivieron años sin token; contra un 8500 en **modo público**
// (`VOXELFORGE_PUBLICO=1`) un anónimo recibe 401 en cuanto intenta escribir. Y entonces el test no
// falla diciendo «no me dejan»: falla diciendo *«la protección no deja borrar lo que está en uso»*,
// que es justo lo que dice comprobar. Un 401 disfrazado de fallo real es peor que un fallo.
//
// Antes esto se resolvía pidiendo al humano `export VOXELFORGE_TOKEN=$(grep …)` antes de correr la
// suite. Olvidarlo era el caso NORMAL, no el raro, así que el aviso lo daba el runner y el fallo lo
// pagaban los tests. Ahora se lee solo, del mismo sitio del que decía el aviso.
//
// ⛔ El token se lee EN CADA EJECUCIÓN de `/root/voxelforge.env` (modo 600). Nunca se copia a un
// fichero del repo, ni se imprime, ni se pasa por la línea de órdenes (donde lo vería cualquier
// `ps`): viaja en la cabecera `X-VoxelForge-Token` y en el entorno de los procesos hijo.
const fs = require('fs');

const ENV_DUENO = '/root/voxelforge.env';

// Devuelve el token, o '' si no hay ninguno (desarrollo sin token: el anónimo ya es el dueño, y los
// tests deben correr igual — por eso esto NUNCA lanza ni aborta).
function tokenDueno() {
  const delEntorno = (process.env.VOXELFORGE_TOKEN || '').trim();
  if (delEntorno) return delEntorno;  // manda el entorno: permite probar con otro token a propósito

  try {
    const m = fs.readFileSync(ENV_DUENO, 'utf8').match(/^VOXELFORGE_TOKEN=(.*)$/m);
    return m ? m[1].trim() : '';
  } catch (e) {
    return '';  // no existe o no se puede leer (otra máquina, otro usuario): se sigue sin token
  }
}

// Las cabeceras de una petición de dueño. Sin token devuelve `{}`, que es lo correcto en desarrollo.
function cabecerasDueno(extra) {
  const t = tokenDueno();
  return Object.assign({}, extra || {}, t ? { 'X-VoxelForge-Token': t } : {});
}

module.exports = { tokenDueno, cabecerasDueno, ENV_DUENO };
