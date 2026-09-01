# F9 · EL PANEL DEL DUEÑO, por web y no por consola.
#
# Petición literal del dueño: «necesito tener mi sección de admin para los permisos de usuarios y
# mapas y todo lo que sea administración que sea vía web, no consola».
#
# Aquí vive la LÓGICA; el enrutado está en `server.py` y la pantalla en `web/panel.html`. Se parte
# así por lo de siempre en este repo: `server.py` ya tiene cuatro `do_*` largas y una rama más de
# 200 líneas ahí dentro no la revisa nadie.
#
# ⛔ REGLA QUE NO SE PUEDE ROMPER: este módulo NO decide si te dejan entrar. Eso lo hace la matriz
# `PERMISO_POR_RUTA` de `server.py` con el permiso `panel.usar`, ANTES de llamar aquí. Si algún día
# alguien llama a estas funciones desde otro sitio, tiene que volver a comprobarlo — por eso todas
# reciben ya al usuario resuelto y ninguna lo busca por su cuenta.
#
# ⚠️ Y una segunda que cuesta cara de aprender: `panel.perfiles` es EL PERMISO QUE REPARTE PERMISOS.
# Quien lo tenga puede darse a sí mismo cualquier otro editando su propio perfil. Por eso las
# funciones que tocan perfiles y cuentas lo exigen aparte de `panel.usar`, y por eso hay dos
# candados (`_no_te_dispares`) que impiden que alguien se quite a sí mismo el acceso al panel o se
# ascienda: un panel que se puede cerrar por dentro deja al dueño fuera de su propio servidor.

import os
import shutil
import time

from . import sesion
from . import mundos_meta


# ── Cuentas ─────────────────────────────────────────────────────────────────────────────────────

def cuentas():
    """Todas, con lo que el panel necesita pintar. ⛔ Nunca `sal` ni `hash`."""
    out = []
    for u in sesion.todos():
        out.append({
            'uid': u.get('uid'),
            'nombre': u.get('nombre'),
            'perfil': u.get('perfil'),
            'creado': u.get('creado'),
            'permisos_mas': sorted(u.get('permisos_mas') or []),
            'permisos_menos': sorted(u.get('permisos_menos') or []),
            # El efectivo va calculado y no lo recalcula el navegador: la suma
            # (perfil + mas − menos) tiene una sola definición y vive en `sesion.permisos_de`.
            'permisos': sorted(sesion.permisos_de(u)),
            'cuota': u.get('cuota') or dict(sesion.CUOTA_POR_DEFECTO),
            'gen': u.get('gen', 1),
            'mapas': len(mundos_meta.de(u.get('uid'))),
        })
    return out


def _no_te_dispares(quien, uid, perfil_nuevo, menos_nuevo):
    """Motivo por el que este cambio dejaría al dueño fuera, o '' si no.

    Solo mira el caso de tocarse A UNO MISMO. Que un dueño degrade a otro es su decisión; que se
    degrade a sí mismo sin querer es un servidor al que ya no se entra por web — y el arreglo pasa
    por editar un JSON a mano, que es exactamente lo que este panel viene a quitar.
    """
    if not quien or quien.get('uid') != uid:
        return ''
    simulado = dict(quien)
    if perfil_nuevo is not None:
        simulado['perfil'] = perfil_nuevo
    if menos_nuevo is not None:
        simulado['permisos_menos'] = menos_nuevo
    if 'panel.usar' not in sesion.permisos_de(simulado):
        return ('ese cambio te quitaría a ti mismo `panel.usar` y no podrías volver a entrar al '
                'panel. Hazlo desde otra cuenta de dueño si de verdad lo quieres.')
    return ''


def guarda_cuenta(quien, d):
    """Aplica cambios a una cuenta. Devuelve (dict_para_el_panel, None) o (None, motivo)."""
    uid = str(d.get('uid') or '')
    u = sesion.carga(uid)
    if not u:
        return None, 'esa cuenta no existe'

    perfil_nuevo = d.get('perfil')
    if perfil_nuevo is not None:
        if perfil_nuevo not in [p.get('nombre') for p in sesion.perfiles()]:
            return None, f'no existe el perfil «{perfil_nuevo}»'

    # ⛔ Solo permisos del vocabulario. Sin este filtro el panel podría escribir en el fichero
    # `permisos_mas: ["borrarlo-todo"]`, que no significa nada y que el día que alguien invente ese
    # permiso de verdad se lo encontraría ya concedido a quien lo tecleó.
    def limpia(clave):
        if d.get(clave) is None:
            return None
        return sorted(set(d[clave]) & set(sesion.PERMISOS))

    mas, menos = limpia('permisos_mas'), limpia('permisos_menos')

    motivo = _no_te_dispares(quien, uid, perfil_nuevo, menos)
    if motivo:
        return None, motivo

    if perfil_nuevo is not None:
        u['perfil'] = perfil_nuevo
    if mas is not None:
        u['permisos_mas'] = mas
    if menos is not None:
        u['permisos_menos'] = menos
    if isinstance(d.get('cuota'), dict):
        cuota = dict(u.get('cuota') or sesion.CUOTA_POR_DEFECTO)
        for k in ('mapas', 'bytes', 'habitantes', 'fotos'):
            if isinstance(d['cuota'].get(k), int) and d['cuota'][k] >= 0:
                cuota[k] = d['cuota'][k]
        u['cuota'] = cuota
    # Revocar sesiones = subir `gen`. Es lo que hace que echar a alguien surta efecto AHORA y no
    # cuando le caduque la cookie: la firma lleva el `gen` dentro y deja de cuadrar.
    if d.get('revocar'):
        u['gen'] = int(u.get('gen', 1)) + 1

    sesion.guarda(u)
    return {'uid': u['uid'], 'perfil': u['perfil'], 'permisos': sorted(sesion.permisos_de(u)),
            'gen': u.get('gen', 1)}, None


# ── Perfiles ────────────────────────────────────────────────────────────────────────────────────

def perfiles():
    """Los perfiles + el vocabulario entero, que es lo que el panel pinta como casillas.

    El vocabulario va aquí y no quemado en el HTML a propósito: el día que se añada un permiso, el
    panel lo enseña solo. Un panel con una lista de permisos copiada a mano es un panel que miente
    en cuanto alguien toca `sesion.PERMISOS`.
    """
    return {'perfiles': sesion.perfiles(), 'vocabulario': list(sesion.PERMISOS),
            'cuota_por_defecto': dict(sesion.CUOTA_POR_DEFECTO)}


def guarda_perfil(quien, d):
    nombre = str(d.get('nombre') or '').strip().lower()
    if not nombre or not nombre.replace('-', '').replace('_', '').isalnum():
        return None, 'el nombre del perfil solo admite letras, números, guion y guion bajo'
    permisos = sorted(set(d.get('permisos') or []) & set(sesion.PERMISOS))

    # El mismo candado que en las cuentas, por el otro lado: quitarle `panel.usar` al perfil que
    # llevas puesto tiene el mismo final que quitártelo a ti.
    if quien and quien.get('perfil') == nombre:
        simulado = dict(quien)
        if 'panel.usar' not in (set(permisos) | set(simulado.get('permisos_mas') or [])) - set(simulado.get('permisos_menos') or []):
            return None, ('ese perfil es el tuyo y te dejaría sin `panel.usar`: no podrías volver a '
                          'entrar al panel')

    sesion.siembra_perfiles()
    fp = os.path.join(sesion.PERFILES, nombre + '.json')
    sesion._guarda({'nombre': nombre, 'descripcion': str(d.get('descripcion') or '')[:200],
                    'permisos': permisos}, fp)
    return {'nombre': nombre, 'permisos': permisos}, None


def borra_perfil(nombre):
    """Fuera, salvo que alguien lo lleve puesto.

    No es una comprobación de cortesía: si se borra un perfil que alguien tiene, `sesion.perfil()`
    cae en el respaldo de la semilla y esa cuenta pasa a tener los permisos de un perfil que el
    dueño creía haber quitado. Es el mismo «está en uso, no se borra» de F2, aplicado a permisos.
    """
    nombre = str(nombre or '')
    if nombre in sesion.PERFILES_SEMILLA:
        return 'los perfiles de partida no se borran: edítalos'
    puestos = [u.get('uid') for u in sesion.todos() if u.get('perfil') == nombre]
    if puestos:
        return f'lo llevan puesto {len(puestos)} cuenta(s): {", ".join(puestos[:6])}'
    fp = os.path.join(sesion.PERFILES, nombre + '.json')
    if not os.path.exists(fp):
        return 'no existe'
    os.remove(fp)
    return ''


# ── Mundos ──────────────────────────────────────────────────────────────────────────────────────

def mundos(worlds_dir):
    """Todos los mapas del disco con su registro, estén registrados o no.

    ⚠️ Se listan desde el DISCO y no desde `data/mundos_meta/`: los 33 mapas heredados no tienen
    registro (nacen con `HEREDADO`: privados y de nadie), y un panel que solo enseñara los
    registrados no enseñaría precisamente los que el dueño quiere abrir.
    """
    out = []
    if not os.path.isdir(worlds_dir):
        return out
    for fn in sorted(os.listdir(worlds_dir)):
        if not fn.endswith('.json'):
            continue
        slug = fn[:-5]
        meta = mundos_meta.lee(slug) or {}
        vox = os.path.join(worlds_dir, slug + '.vox')
        try:
            bytes_ = os.path.getsize(os.path.join(worlds_dir, fn)) + (os.path.getsize(vox) if os.path.exists(vox) else 0)
            tocado = int(os.path.getmtime(os.path.join(worlds_dir, fn)))
        except OSError:
            bytes_, tocado = 0, 0
        out.append({
            'slug': slug,
            'dueno': meta.get('dueno'),
            'visibilidad': meta.get('visibilidad', 'privado'),
            'escritura': meta.get('escritura', 'dueno'),
            'codigo': meta.get('codigo', ''),
            'destacado': bool(meta.get('destacado')),
            'invitados': meta.get('invitados') or [],
            # `heredado` es lo que el panel tiene que poder enseñar en grande: significa «este mapa
            # es de antes de que hubiera cuentas, no es de nadie y hoy no lo ve nadie».
            'heredado': bool(meta.get('heredado', True)) and not meta.get('dueno'),
            'bytes': bytes_,
            'tocado': tocado,
        })
    return out


def guarda_mundo(d):
    slug = str(d.get('slug') or '')
    if not slug:
        return None, 'falta el mapa'
    meta = mundos_meta.lee(slug) or {}
    meta['slug'] = slug
    if d.get('visibilidad') in mundos_meta.VISIBILIDADES:
        meta['visibilidad'] = d['visibilidad']
    if d.get('escritura') in mundos_meta.ESCRITURAS:
        meta['escritura'] = d['escritura']
    if d.get('codigo') is not None:
        meta['codigo'] = str(d['codigo'])[:64]
    if d.get('destacado') is not None:
        meta['destacado'] = bool(d['destacado'])
    if d.get('dueno') is not None:
        nuevo = str(d['dueno'] or '')
        if nuevo and not sesion.existe(nuevo):
            return None, f'no hay ninguna cuenta «{nuevo}»'
        meta['dueno'] = nuevo or None
    # En cuanto el panel lo toca deja de ser heredado: alguien ha decidido sobre él a propósito.
    meta['heredado'] = False
    mundos_meta.guarda(meta)
    return meta, None


# ── Salud ───────────────────────────────────────────────────────────────────────────────────────

def salud(raiz, worlds_dir, destino_copias=None):
    """Lo mismo que mira la ronda de F7.4, pero para pintarlo.

    ⚠️ NO importa `herramientas/vigilancia.py`: ese vive fuera del paquete y corre desde un timer con
    su propio aislamiento. Aquí se repiten cuatro llamadas a `os.statvfs` antes que atar la web a un
    script de operación — el día que uno de los dos cambie, el otro no se entera y eso es bueno.
    """
    data = os.path.join(raiz, 'data')
    try:
        st = os.statvfs(data)
        libres = st.f_bavail * st.f_frsize
        total = st.f_blocks * st.f_frsize
    except OSError:
        libres = total = 0
    pesa = 0
    ficheros = 0
    for base, _, nombres in os.walk(data):
        for n in nombres:
            try:
                pesa += os.lstat(os.path.join(base, n)).st_size
                ficheros += 1
            except OSError:
                pass
    n_mundos = len([f for f in os.listdir(worlds_dir) if f.endswith('.json')]) if os.path.isdir(worlds_dir) else 0
    papelera = os.path.join(data, 'papelera')
    pesa_papelera = 0
    for base, _, nombres in os.walk(papelera):
        for n in nombres:
            try:
                pesa_papelera += os.lstat(os.path.join(base, n)).st_size
            except OSError:
                pass
    ultima = None
    destino = destino_copias or os.environ.get('VOXELFORGE_COPIAS')
    if destino and os.path.isdir(destino):
        sellos = sorted([x for x in os.listdir(destino) if os.path.isdir(os.path.join(destino, x))])
        if sellos:
            ultima = sellos[-1]
    return {
        'disco_libre': libres, 'disco_total': total,
        'disco_pct': round(100.0 * libres / total, 1) if total else 0,
        'data_bytes': pesa, 'data_ficheros': ficheros,
        'mundos': n_mundos,
        'papelera_bytes': pesa_papelera,
        'cuentas': len(sesion.todos()),
        'ultima_copia': ultima,
        'ahora': int(time.time()),
    }
