#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""F7.2 · copias de seguridad de lo irremplazable, con la restauración probada.

    python3 herramientas/copia_seguridad.py                 # una copia en $VOXELFORGE_COPIAS
    python3 herramientas/copia_seguridad.py --listar
    python3 herramientas/copia_seguridad.py --verificar <copia>
    python3 herramientas/copia_seguridad.py --restaurar <copia> --a <dir vacío>

⚠️ Una copia sin restauración probada NO es una copia. Por eso `--restaurar` y `--verificar` viven
aquí y no en un README: el criterio de cierre del plan es literalmente «restaurar una copia de
`data/worlds` en una carpeta vacía y que el mundo arranque», y eso lo comprueba
`tests/test_copia_seguridad.js` en cada pasada.

── El problema de verdad: UN MUNDO SON DOS FICHEROS ────────────────────────────────────────────────
`<slug>.json` (cabecera, kilobytes) y `<slug>.vox` (rejilla, megas), y el `.vox` se escribe EN SITIO
(seek+write de dos bytes por bloque puesto), no con el `atomic_write` de la casa. Copiar el par con el
servidor vivo puede pillarlo a medias.

El plan proponía coger `voxfmt._cerrojo`. ⛔ **No se puede desde aquí**: ese cerrojo es un
`threading.Lock` DENTRO del proceso del servidor, y esto es otro proceso — cogerlo aquí sería coger
un candado distinto y creerse protegido, que es peor que no tener ninguno.

Lo que sí se puede, y es lo que se hace: **no evitar el desgarro, DETECTARLO**. La escritura en sitio
solo puede dejar la copia con unos bloques viejos (nunca un fichero estructuralmente roto); el único
desgarro que importa es el de tamaño, cuando alguien redimensiona el mundo entre que se copia la
cabecera y la rejilla. Eso lo caza `voxfmt.completo()` —que es la MISMA función con la que el
servidor decide si un mundo es utilizable— y entonces el par se vuelve a copiar. Si tras varios
intentos sigue sin cuadrar, la copia se marca INCOMPLETA y el proceso sale con error: una copia que
miente sobre su estado es peor que no tenerla.

── Qué se copia ────────────────────────────────────────────────────────────────────────────────────
Lo irremplazable, no lo reproducible. `data/_thumbs/` (caché, se rehornea sola) y
`data/habitantes_trash/` (1,5 GB de deshacer corto) se quedan fuera a propósito.
`data/fotos/` SÍ entra aunque el plan no la nombrara: son 130 MB de capturas del dueño con la ficha
quemada dentro, y no se rehacen. Sale barato porque las copias comparten ficheros por enlace duro
(`rsync --link-dest`): la 2ª copia de 300 MB ocupa lo que haya cambiado, no 300 MB.
"""
import argparse, json, os, re, shutil, subprocess, sys, time

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
from servidor import voxfmt                                    # noqa: E402

# Orden a propósito: lo más pequeño e irremplazable primero, para que una copia interrumpida por
# falta de disco se haya llevado ya las cuentas y los snippets antes de morir con los mundos.
CARPETAS = ('usuarios', 'perfiles', 'mundos_meta', 'agentes', 'snippets', 'habitantes',
            'papelera', 'fotos', 'worlds')
SUELTOS = ('mundo.json', 'mapa.json')                          # el mundo por defecto y el mapa de habitaciones

DIARIAS, SEMANALES = 7, 4
SELLO = re.compile(r'^\d{4}-\d\d-\d\d_\d{6}$')
INTENTOS_PAR = 3


def copias(destino):
    """Las copias TERMINADAS, de más vieja a más nueva. Una `.parcial` no cuenta: es el motivo de que
    el nombre definitivo se ponga al final, con un `os.rename` — así una copia interrumpida no puede
    pasar por buena ni servir de `--link-dest` a la siguiente."""
    try:
        return sorted(d for d in os.listdir(destino) if SELLO.match(d)
                      and os.path.isdir(os.path.join(destino, d)))
    except OSError:
        return []


def _rsync(src, dst, enlaza=None):
    if not os.path.exists(src):
        return False
    os.makedirs(os.path.dirname(dst.rstrip('/')) or dst, exist_ok=True)
    cmd = ['rsync', '-a', '--delete']
    if enlaza and os.path.isdir(enlaza):
        cmd.append('--link-dest=' + os.path.abspath(enlaza))
    cmd += [src.rstrip('/') + '/', dst.rstrip('/') + '/']
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
    return True


def revisa_mundos(carpeta):
    """[(slug, ok)] de cada mundo de `carpeta`, con el mismo criterio que usa el servidor."""
    salida = []
    for f in sorted(os.listdir(carpeta)) if os.path.isdir(carpeta) else []:
        if not f.endswith('.json'):
            continue
        salida.append((f[:-5], voxfmt.completo(os.path.join(carpeta, f))))
    return salida


def copia(raiz, destino):
    datos = os.path.join(raiz, 'data')
    if not os.path.isdir(datos):
        print('ABORTA: no hay %s' % datos, file=sys.stderr)
        return 1
    os.makedirs(destino, exist_ok=True)
    previas = copias(destino)
    enlaza = os.path.join(destino, previas[-1]) if previas else None

    # ⚠️ Dos copias en el MISMO SEGUNDO colisionan, y `os.rename` sobre un directorio que ya existe
    # revienta: la copia se perdería entera y con un traceback en vez de un mensaje. Pasa en las
    # pruebas y pasa con un cron mal puesto. El sello tiene resolución de segundo a propósito —es lo
    # que lo hace legible y lo que sabe leer `poda()`— así que se corre al siguiente hueco libre en
    # vez de ensuciar el formato.
    ahora = time.time()
    sello = time.strftime('%Y-%m-%d_%H%M%S', time.localtime(ahora))
    while os.path.exists(os.path.join(destino, sello)):
        ahora += 1
        sello = time.strftime('%Y-%m-%d_%H%M%S', time.localtime(ahora))
    parcial = os.path.join(destino, sello + '.parcial')
    if os.path.exists(parcial):
        shutil.rmtree(parcial)
    os.makedirs(parcial)

    llevadas = []
    for c in CARPETAS:
        if _rsync(os.path.join(datos, c), os.path.join(parcial, c),
                  os.path.join(enlaza, c) if enlaza else None):
            llevadas.append(c)
    for f in SUELTOS:
        orig = os.path.join(datos, f)
        if os.path.exists(orig):
            shutil.copy2(orig, os.path.join(parcial, f))
            llevadas.append(f)

    # La verificación, y el reintento del par desgarrado. Se recopia SOLO ese mundo: volver a pasar
    # los 167 MB porque un mapa se redimensionó a mitad sería regalar la ventana de que se desgarre
    # otro.
    mundos_dst = os.path.join(parcial, 'worlds')
    rotos = [s for s, ok in revisa_mundos(mundos_dst) if not ok]
    for intento in range(INTENTOS_PAR):
        if not rotos:
            break
        print('  reintento %d: %s' % (intento + 1, ', '.join(rotos)))
        for slug in rotos:
            for ext in ('.json', '.vox'):
                o = os.path.join(datos, 'worlds', slug + ext)
                d = os.path.join(mundos_dst, slug + ext)
                if os.path.exists(o):
                    if os.path.exists(d):
                        os.unlink(d)           # ⚠️ el enlace duro apunta a la copia ANTERIOR: escribir
                    shutil.copy2(o, d)         #    encima la corrompería también
        rotos = [s for s, ok in revisa_mundos(mundos_dst) if not ok]

    todos = revisa_mundos(mundos_dst)
    manifiesto = {
        'sello': sello,
        'fecha': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'raiz': os.path.abspath(raiz),
        'carpetas': llevadas,
        'enlazada_a': previas[-1] if previas else None,
        'mundos': {'total': len(todos), 'ok': sum(1 for _, ok in todos if ok),
                   'incompletos': [s for s, ok in todos if not ok]},
        'bytes': sum(os.path.getsize(os.path.join(d, f))
                     for d, _, fs in os.walk(parcial) for f in fs),
        'git': _git_head(raiz),
        'completa': not any(not ok for _, ok in todos),
    }
    with open(os.path.join(parcial, 'MANIFIESTO.json'), 'w', encoding='utf-8') as f:
        json.dump(manifiesto, f, ensure_ascii=False, indent=2)

    final = os.path.join(destino, sello)
    os.rename(parcial, final)                  # a partir de aquí ya cuenta como copia
    poda(destino)

    mb = manifiesto['bytes'] / (1024 * 1024)
    print('copia %s · %d carpetas · %d/%d mundos ok · %.1f MB'
          % (sello, len(llevadas), manifiesto['mundos']['ok'], manifiesto['mundos']['total'], mb))
    if not manifiesto['completa']:
        print('⚠️ INCOMPLETA: %s' % ', '.join(manifiesto['mundos']['incompletos']), file=sys.stderr)
        return 2
    return 0


def _git_head(raiz):
    try:
        return subprocess.run(['git', '-C', raiz, 'rev-parse', '--short', 'HEAD'],
                              capture_output=True, text=True, timeout=10).stdout.strip() or None
    except Exception:
        return None


def poda(destino):
    """Se quedan las `DIARIAS` últimas y, de lo anterior, la más nueva de cada semana ISO hasta
    `SEMANALES`. ⚠️ Podar es lo único aquí que BORRA, así que la lista de lo que se salva se calcula
    entera antes de tocar nada: una poda que borra mientras decide es la que se lleva la última copia
    buena el día que hay un fichero raro por medio."""
    todas = copias(destino)
    salvadas = set(todas[-DIARIAS:])
    porsemana = {}
    for c in todas[:-DIARIAS] if len(todas) > DIARIAS else []:
        semana = time.strftime('%G-W%V', time.strptime(c[:10], '%Y-%m-%d'))
        porsemana[semana] = c                                  # ordenadas ⇒ se queda la más nueva
    salvadas.update(sorted(porsemana.values())[-SEMANALES:])
    for c in todas:
        if c not in salvadas:
            shutil.rmtree(os.path.join(destino, c), ignore_errors=True)
            print('  podada %s' % c)
    return sorted(salvadas)


def verifica(copia_dir):
    todos = revisa_mundos(os.path.join(copia_dir, 'worlds'))
    man = {}
    try:
        with open(os.path.join(copia_dir, 'MANIFIESTO.json'), encoding='utf-8') as f:
            man = json.load(f)
    except Exception:
        print('⚠️ sin MANIFIESTO.json: esto no es una copia terminada', file=sys.stderr)
    malos = [s for s, ok in todos if not ok]
    print('%s · %d mundos · %d ok · %d incompletos%s'
          % (os.path.basename(copia_dir.rstrip('/')), len(todos), len(todos) - len(malos), len(malos),
             ('  ' + ', '.join(malos)) if malos else ''))
    for c in man.get('carpetas', []):
        if not os.path.exists(os.path.join(copia_dir, c)):
            print('⚠️ el manifiesto dice «%s» y no está' % c, file=sys.stderr)
            return 2
    return 2 if malos or not man else 0


def restaura(copia_dir, a, forzar=False):
    """⛔ Nunca sobre `data/` en uso. Se restaura a una carpeta VACÍA y se mira; llevarla a su sitio
    es un `mv` que hace una persona con el servidor parado, no este script con el servidor vivo."""
    if os.path.exists(a) and os.listdir(a) and not forzar:
        print('ABORTA: «%s» no está vacía. Restaurar encima es como no tener copia.' % a, file=sys.stderr)
        return 1
    os.makedirs(a, exist_ok=True)
    for c in CARPETAS:
        o = os.path.join(copia_dir, c)
        if os.path.isdir(o):
            _rsync(o, os.path.join(a, c))
    # El manifiesto viaja con lo restaurado. No es adorno: es lo que dice de QUÉ copia salió esto y
    # en qué commit estaba el repo, y es lo primero que se quiere saber cuando lo que se está
    # mirando es el resultado de un desastre. Además `verifica()` lo exige, y con razón.
    for f in list(SUELTOS) + ['MANIFIESTO.json']:
        o = os.path.join(copia_dir, f)
        if os.path.exists(o):
            shutil.copy2(o, os.path.join(a, f))
    print('restaurada en %s' % a)
    return verifica(a) if os.path.isdir(os.path.join(a, 'worlds')) else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--raiz', default=RAIZ, help='el repo del que se copia (por defecto, éste)')
    ap.add_argument('--destino', default=os.environ.get('VOXELFORGE_COPIAS')
                    or '/var/backups/voxelforge', help='dónde viven las copias · $VOXELFORGE_COPIAS')
    ap.add_argument('--listar', action='store_true')
    ap.add_argument('--verificar', metavar='COPIA')
    ap.add_argument('--restaurar', metavar='COPIA')
    ap.add_argument('--a', metavar='DIR', help='destino de --restaurar (carpeta vacía)')
    ap.add_argument('--forzar', action='store_true', help='restaurar sobre una carpeta con cosas')
    a = ap.parse_args()

    def resuelve(nombre):
        return nombre if os.path.isdir(nombre) else os.path.join(a.destino, nombre)

    if a.listar:
        for c in copias(a.destino):
            try:
                with open(os.path.join(a.destino, c, 'MANIFIESTO.json'), encoding='utf-8') as f:
                    m = json.load(f)
                print('%s  %6.1f MB  %d/%d mundos%s' % (c, m['bytes'] / (1024 * 1024),
                      m['mundos']['ok'], m['mundos']['total'], '' if m['completa'] else '  ⚠️ INCOMPLETA'))
            except Exception:
                print('%s  (sin manifiesto)' % c)
        return 0
    if a.verificar:
        return verifica(resuelve(a.verificar))
    if a.restaurar:
        if not a.a:
            print('ABORTA: --restaurar necesita --a <dir vacío>', file=sys.stderr)
            return 1
        return restaura(resuelve(a.restaurar), a.a, a.forzar)
    return copia(a.raiz, a.destino)


if __name__ == '__main__':
    sys.exit(main())
