#!/usr/bin/env python3
# @area: snippets
#
# REQ-MULTI3 · el menu de pausa gana MULTIJUGADOR, y encenderlo deja de ser cosa del dueño.
#
# LO QUE PIDIO EL DUEÑO (2026-09-03), tres cosas:
#   a) que Esc no lleve directo a INVITAR, sino a un MULTIJUGADOR con «activar/desactivar» dentro,
#      y con INVITAR ahi tambien;
#   b) que un jugador normal PUEDA encender el multijugador (hoy no puede);
#   c) que al invitar queden LOS DOS dentro, no solo el invitado.
#
# POR QUE (b) NO SE PODIA, medido. `multi-verse` entra por `entra()` (multi-verse:2004), y esa
# funcion pregunta el SECRETO de la partida salvo que ya haya un vale para este mapa:
#
#     const conVale = !!valeDelMapa();
#     if (!conVale && !pide('secreto', 'Secreto de la partida (lo dice multi/servidor_multi.py …
#
# El secreto es la credencial del que ARRANCA el arbitro, o sea del dueño. Un jugador no lo tiene y
# no debe tenerlo — es una llave del servidor entero, no de un mapa (`multi/LEEME.md:920`). Asi que
# «activar multijugador» era, para todos los demas, un dialogo sin respuesta posible. No es que
# faltara el permiso: `jugador` YA trae `multi.entrar` y `multi.invitar` (servidor/sesion.py:101).
# Faltaba la CREDENCIAL que si es suya.
#
# EL ARREGLO: encender = pedirse un vale para el mapa en el que ya puedes escribir. `POST
# /api/invitaciones` lo firma el servidor (server.py:2189) y solo si puedes escribir ahi
# (server.py:2205), que es exactamente la condicion que queremos: enciendes el multijugador de TU
# mapa. El vale se deja donde `multi-verse` lo busca y `entra()` ya no pregunta nada.
#
# POR QUE (c) PASABA. `invitacion-multi` arranca el cliente al que llega con `?invita=` — el
# INVITADO. El que invita no llega por ningun sitio: sigue en su mapa, sin cliente, y su enlace le
# manda gente que no ve. Ahora INVITAR enciende tambien al anfitrion, con el mismo vale que acaba de
# firmar el servidor: una sola peticion, el enlace para el otro y la entrada para mi.
#
# ⛔ CERO LINEAS DE `app.js`, y ni una de `multi-verse`: esto es UN MENU. Lo unico que se toma
# prestado de `multi-verse` es DONDE guarda el vale, y va anotado en los dos sitios con un guardian
# que falla si dejan de coincidir (`tests/test_menu_juego.js` §9).
#
# ⛔ Idempotente y POR ANCLA. Un snippet publicado tiene DOS COPIAS VIVAS, asi que esto nunca
# reescribe el fichero entero — solo sustituye sus anclas. Publica por `POST /api/snippets`.
#
#     python3 herramientas/parche_snp_menu_multijugador.py --comprobar
#     python3 herramientas/parche_snp_menu_multijugador.py
import argparse
import json
import os
import sys
import urllib.request

SITIO = 'http://127.0.0.1:8500'
SNIP = 'menu-juego'
TOKEN = (os.environ.get('VOXELFORGE_TOKEN') or '').strip()

CAMBIOS = [
    (
        'VERSION v1.1 → v1.2 (el menú cambia de forma)',
        """M.VERSION = 'v1.1';""",
        """M.VERSION = 'v1.2';""",
    ),
    (
        'la pausa lleva a MULTIJUGADOR, no directa a INVITAR',
        """    M.boton('invitar', 'INVITAR') +
    M.boton('ajustes', 'AJUSTES') +""",
        """    M.boton('multi', 'MULTIJUGADOR') +
    M.boton('ajustes', 'AJUSTES') +""",
    ),
    (
        'la pantalla MULTIJUGADOR, encender/apagar, y el VOLVER de INVITAR que vuelve AQUÍ',
        """M.panelInvita = function (enlace, escritura, error) {
  if (error) {
    return '<div class="mc-osd-panel">' +
      '<div class="mc-osd-title">INVITAR</div>' +
      '<p ' + M.NOTA + '>' + M.escapa(error) + '</p>' +
      M.boton('volver', 'VOLVER') +
      '</div>';
  }""",
        """// ── 👥 MULTIJUGADOR ────────────────────────────────────────────────────────────────────────────
//
// Antes INVITAR colgaba de la pausa y era lo único que había del multijugador. Ahora cuelgan de aquí
// las DOS cosas que se pueden hacer con él, que es lo que pidió el dueño: entrar y traer a alguien.
//
// ⛔ El rótulo dice LO QUE VA A PASAR AL PULSAR, no el estado. «ACTIVAR» cuando estoy fuera,
// «DESACTIVAR» cuando estoy dentro; el estado se lee en la nota de arriba, que es donde se lee. Un
// botón que ponga «MULTIJUGADOR: ON» obliga a adivinar si eso es lo que hay o lo que hará.
M.panelMulti = function (aviso) {
  const dentro = M.multiPuesto();
  return '<div class="mc-osd-panel">' +
    '<div class="mc-osd-title">MULTIJUGADOR</div>' +
    '<p ' + M.NOTA + '>' + M.escapa(aviso || M.notaMulti()) + '</p>' +
    M.boton('multi-onoff', dentro ? 'DESACTIVAR MULTIJUGADOR' : 'ACTIVAR MULTIJUGADOR') +
    M.boton('invitar', 'INVITAR') +
    M.boton('volver', 'VOLVER') +
    '</div>';
};

// `game.multi` solo existe si `multi-verse` está cargado, y estar cargado no es estar dentro: `sal()`
// lo deja puesto y desconectado. Lo que manda es `estado().activo`.
M.multiPuesto = function () {
  try { return !!(G.multi && G.multi.estado && G.multi.estado().activo); } catch (e) { return false; }
};

M.notaMulti = function () {
  if (!M.multiPuesto()) return 'Estás jugando a solas en «' + M.mapa() + '».';
  let otros = 0;
  try { otros = G.multi.estado().otrosAhora || 0; } catch (e) {}
  return otros ? ('Dentro, y ahora mismo hay ' + otros + ' más.') : 'Dentro. Todavía no hay nadie más.';
};

// ⛔ LA MISMA LLAVE QUE `multi-verse` (su `LLAVE_VALE`, línea 61), y por eso está anotada en los dos
// sitios: es sessionStorage, o sea que el vale no sobrevive a cerrar la pestaña, que es lo que se
// quiere de una llave de la casa de otro. Si una de las dos cambia sola, encender deja de funcionar
// sin que nada falle — lo vigila `tests/test_menu_juego.js` §9.
M.LLAVE_VALE = 'vf_multi_vale:';

M.guardaVale = function (vale) {
  try { sessionStorage.setItem(M.LLAVE_VALE + M.mapa(), vale); return true; } catch (e) { return false; }
};

// Una sola petición para las dos cosas: el `enlace` es para el otro y el `vale` es para mí. Pedir dos
// veces daría dos vales distintos por el mismo motivo, y el segundo no serviría para nada.
M.pideVale = function () {
  return fetch('/api/invitaciones', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: M.mapa() }),
  }).then(function (r) {
    return r.json().catch(function () { return {}; })
      .then(function (d) { return { ok: r.ok, codigo: r.status, d: d || {} }; });
  });
};

// ⛔ AQUÍ ESTÁ (b): un jugador normal no tiene el secreto del árbitro y no debe tenerlo, pero SÍ
// puede pedirse un vale del mapa en el que ya escribe. Con el vale puesto, `entra()` no pregunta ni
// el secreto ni la dirección (multi-verse:2010), así que encender es un botón y no un cuestionario.
//
// `game.snippet('multi-verse')` acaba llamando a `entra()` él solo; si ya estaba cargado se llama a
// `entra()` y no se recarga el snippet, que montaría un segundo cliente sobre el mismo `mcUpdate`.
M.enciende = function () {
  if (M.multiPuesto()) return Promise.resolve('ya estabas dentro');
  return M.pideVale().then(function (r) {
    if (!r.ok) throw new Error(M.porQueNo(r.codigo, r.d));
    if (!r.d.vale) throw new Error('el servidor no ha devuelto vale');
    M.guardaVale(r.d.vale);
    if (G.multi && G.multi.entra) return G.multi.entra();
    return G.snippet('multi-verse');
  });
};

M.apaga = function () {
  try { if (G.multi && G.multi.sal) G.multi.sal(); } catch (e) {}
  return true;
};

// El botón no puede quedarse mudo mientras vuela la petición y el socket: encender pasa por el
// servidor y por el árbitro, y eso es medio segundo largo en el que un menú quieto parece roto.
M.conmutaMulti = function () {
  if (M.multiPuesto()) { M.apaga(); return Promise.resolve(G.osd.html(M.panelMulti())); }
  G.osd.html(M.panelMulti('Entrando…'));
  return M.enciende()
    .then(function () { G.osd.html(M.panelMulti()); })
    .catch(function (e) { G.osd.html(M.panelMulti('No se ha podido entrar: ' + (e && e.message))); });
};

M.panelInvita = function (enlace, escritura, error) {
  if (error) {
    return '<div class="mc-osd-panel">' +
      '<div class="mc-osd-title">INVITAR</div>' +
      '<p ' + M.NOTA + '>' + M.escapa(error) + '</p>' +
      M.boton('volver-multi', 'VOLVER') +
      '</div>';
  }""",
    ),
    (
        'el enlace vuelve a MULTIJUGADOR y dice si ya estás dentro',
        """    '<p ' + M.NOTA + '>Selecciónalo y cópialo.</p>' +
    M.boton('volver', 'VOLVER') +
    '</div>';
};""",
        """    '<p ' + M.NOTA + '>Selecciónalo y cópialo.</p>' +
    '<p ' + M.NOTA + '>' + M.escapa(M.notaMulti()) + '</p>' +
    M.boton('volver-multi', 'VOLVER') +
    '</div>';
};""",
    ),
    (
        'invitar enciende también al anfitrión (c)',
        """M.invitar = function () {
  return fetch('/api/invitaciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: M.mapa() }),
  }).then(function (r) {
    return r.json().catch(function () { return {}; })
      .then(function (d) { return { ok: r.ok, codigo: r.status, d: d || {} }; });
  }).then(function (r) {
    if (r.ok) return G.osd.html(M.panelInvita(r.d.enlace, r.d.escritura));
    return G.osd.html(M.panelInvita(null, null, M.porQueNo(r.codigo, r.d)));
  }).catch(function (e) {
    G.osd.html(M.panelInvita(null, null, 'No se ha podido hablar con el servidor: ' + e.message));
  });
};""",
        """// ⛔ AQUÍ ESTÁ (c). Invitar era firmar un enlace y quedarse fuera: el invitado entraba en
// multijugador (lo arranca `invitacion-multi` al ver el `?invita=`) y el anfitrión seguía a solas en
// su propio mapa, mandando gente a una fiesta a la que él no iba. Ahora el MISMO vale que se firma
// para el enlace me mete a mí, que es lo que pidió el dueño: «lo lógico es que ambos estén».
//
// Encender va sin `await` y con `.catch()`: que el árbitro esté caído no puede impedir que se enseñe
// el enlace, que es lo que el jugador vino a buscar y sigue siendo válido.
M.invitar = function () {
  return M.pideVale().then(function (r) {
    if (!r.ok) return G.osd.html(M.panelInvita(null, null, M.porQueNo(r.codigo, r.d)));
    if (r.d.vale) M.guardaVale(r.d.vale);
    G.osd.html(M.panelInvita(r.d.enlace, r.d.escritura));
    // Y el anfitrión dentro. Se repinta al acabar porque la nota dice si estoy o no, y cuando esto
    // termina ya no dice lo mismo que cuando se pintó.
    if (r.d.vale && !M.multiPuesto()) {
      Promise.resolve(M.enciende())
        .then(function () { if (G.osd.abierta === 'pausa') G.osd.html(M.panelInvita(r.d.enlace, r.d.escritura)); })
        .catch(function (e) { console.warn('👥 menu-juego: invité pero no pude entrar yo:', e && e.message); });
    }
  }).catch(function (e) {
    G.osd.html(M.panelInvita(null, null, 'No se ha podido hablar con el servidor: ' + e.message));
  });
};""",
    ),
    (
        'las acciones nuevas: abrir la pantalla, conmutar, y volver a ella',
        """  G.osd.alPulsar(M.CLAVE + 'invitar', function () { M.invitar(); }, yo);""",
        """  G.osd.alPulsar(M.CLAVE + 'multi', function () { G.osd.html(M.panelMulti()); }, yo);
  G.osd.alPulsar(M.CLAVE + 'multi-onoff', function () { M.conmutaMulti(); }, yo);
  G.osd.alPulsar(M.CLAVE + 'volver-multi', function () { G.osd.html(M.panelMulti()); }, yo);
  G.osd.alPulsar(M.CLAVE + 'invitar', function () { M.invitar(); }, yo);""",
    ),

    # ---- v1.3: la pantalla decia «Dentro» antes de estarlo -------------------------------------
    (
        'VERSION v1.2 → v1.3 (la nota deja de adelantarse al socket)',
        """M.VERSION = 'v1.2';""",
        """M.VERSION = 'v1.3';""",
    ),
    (
        'la nota distingue «conectando» de «dentro», y saber qué pantalla se ve',
        """M.notaMulti = function () {
  if (!M.multiPuesto()) return 'Estás jugando a solas en «' + M.mapa() + '».';
  let otros = 0;
  try { otros = G.multi.estado().otrosAhora || 0; } catch (e) {}
  return otros ? ('Dentro, y ahora mismo hay ' + otros + ' más.') : 'Dentro. Todavía no hay nadie más.';
};""",
        """// ⛔ «activo» NO es «conectado». `entra()` levanta la bandera ANTES de que exista el socket, y si el
// árbitro rechaza el apretón la baja `onclose` un rato después (multi-verse:1923) — que es justo lo
// que pasa cuando al árbitro le falta `VOXELFORGE_SECRETO_SESION` y no verifica ningún vale. Decir
// «Dentro» mientras la conexión vuela es prometer algo que todavía puede no ocurrir.
M.notaMulti = function () {
  let e = null;
  try { e = (G.multi && G.multi.estado) ? G.multi.estado() : null; } catch (er) {}
  if (!e || !e.activo) return 'Estás jugando a solas en «' + M.mapa() + '».';
  // Los cuatro nombres salen de `estado()` en multi-verse, que traduce `ws.readyState`.
  if (e.socket === 'conectando' || e.socket === 'sin socket') return 'Conectando con el servidor de multijugador…';
  if (e.socket !== 'abierto') return 'Se ha cortado la conexión con el servidor de multijugador.';
  const otros = e.otrosAhora || 0;
  return otros ? ('Dentro, y ahora mismo hay ' + otros + ' más.') : 'Dentro. Todavía no hay nadie más.';
};

// Qué pantalla se está viendo AHORA. `game.osd.abierta` dice «pausa» para TODAS las de este menú, así
// que no sirve para decidir un repintado tardío: el título sí. Sin esto, la vuelta de encender borra
// el enlace de INVITAR justo cuando lo estás copiando.
M.enPantalla = function (titulo) {
  try {
    const t = document.querySelector('#mc-osd .mc-osd-title');
    return !!t && t.textContent.trim() === titulo;
  } catch (e) { return false; }
};""",
    ),
    (
        'conmutar solo repinta si sigues en MULTIJUGADOR',
        """    .then(function () { G.osd.html(M.panelMulti()); })
    .catch(function (e) { G.osd.html(M.panelMulti('No se ha podido entrar: ' + (e && e.message))); });""",
        """    .then(function () { if (M.enPantalla('MULTIJUGADOR')) G.osd.html(M.panelMulti()); })
    .catch(function (e) {
      if (M.enPantalla('MULTIJUGADOR')) G.osd.html(M.panelMulti('No se ha podido entrar: ' + (e && e.message)));
    });""",
    ),
    (
        'y el repintado de INVITAR mira su propio título, no «pausa»',
        """        .then(function () { if (G.osd.abierta === 'pausa') G.osd.html(M.panelInvita(r.d.enlace, r.d.escritura)); })""",
        """        .then(function () { if (M.enPantalla('INVITAR')) G.osd.html(M.panelInvita(r.d.enlace, r.d.escritura)); })""",
    ),
]


def pide(url, cuerpo=None):
    pet = urllib.request.Request(url, data=cuerpo, method='POST' if cuerpo else 'GET',
                                 headers={'Content-Type': 'application/json'} if cuerpo else {})
    # En modo publico `POST /api/snippets` es solo del dueño (F0.4): sin token, 401.
    if TOKEN:
        pet.add_header('X-VoxelForge-Token', TOKEN)
    with urllib.request.urlopen(pet, timeout=20) as r:
        return json.loads(r.read().decode('utf-8') or '{}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--comprobar', action='store_true')
    p.add_argument('--sitio', default=SITIO)
    a = p.parse_args()

    snip = pide('%s/api/snippets/%s' % (a.sitio, SNIP))
    code = snip.get('code') or ''
    if not code:
        print('⛔ «%s» no tiene codigo (¿servidor levantado?)' % SNIP)
        return 1

    nuevo, hechos, ya = code, [], []
    for que, viejo, bueno in CAMBIOS:
        if bueno in nuevo:
            ya.append(que)
            continue
        n = nuevo.count(viejo)
        if n != 1:
            print('⛔ el ancla de «%s» aparece %d veces (esperaba 1).\n'
                  '   el snippet ha cambiado debajo: no lo toco.' % (que, n))
            return 2
        nuevo = nuevo.replace(viejo, bueno)
        hechos.append(que)

    for q in ya:
        print('   ya estaba · %s' % q)
    for q in hechos:
        print('   cambio    · %s' % q)
    if not hechos:
        print('nada que hacer: «%s» ya esta parcheado.' % SNIP)
        return 0
    if a.comprobar:
        print('\n--comprobar: no he tocado nada.')
        return 0

    # ⛔ El documento se manda ENTERO: el POST lo rearma de cero y lo que no viaje se PIERDE.
    cuerpo = {'id': SNIP, 'name': snip.get('name') or SNIP, 'code': nuevo}
    for campo in ('categoria', 'ficha'):
        if snip.get(campo):
            cuerpo[campo] = snip[campo]
    if snip.get('protegido') is True:
        cuerpo['protegido'] = True
    pide('%s/api/snippets' % a.sitio, json.dumps(cuerpo, ensure_ascii=False).encode('utf-8'))
    print('\npublicado «%s» (%d → %d caracteres)' % (SNIP, len(code), len(nuevo)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
