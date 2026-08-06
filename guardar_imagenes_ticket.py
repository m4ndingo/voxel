#!/usr/bin/env python3
"""Rescata las capturas que el dueño adjunta en el chat y las deja en data/tickets/<ID>/.

    python3 guardar_imagenes_ticket.py BUG-GAL1            # las del último mensaje con imágenes
    python3 guardar_imagenes_ticket.py BUG-GAL1 --uuid ded1fb70
    python3 guardar_imagenes_ticket.py --listar            # qué mensajes con imágenes hay

Por qué existe: un ticket se abre hoy y se resuelve semanas después, cuando la conversación donde
venían las capturas ya no está en contexto. Claude Code guarda cada imagen pegada en el transcript
de la sesión (.claude/projects/-root/*.jsonl) como base64, así que no hay que pedírselas otra vez al
dueño: se extraen de ahí y se dejan junto al resto de lo que sobrevive al chat.

Escribe también un `contexto.md` con el texto del mensaje y la fecha, para que la captura no quede
huérfana: una imagen sin el enunciado al lado obliga a adivinar qué se estaba mirando.
"""
import argparse
import base64
import glob
import json
import os
import sys

TRANSCRIPTS = '/root/.claude/projects/-root/*.jsonl'
DESTINO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'tickets')
EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif'}


def mensajes_con_imagen():
    """Todos los mensajes del dueño que llevan imagen, del más viejo al más nuevo."""
    fuera = []
    for f in sorted(glob.glob(TRANSCRIPTS), key=os.path.getmtime):
        with open(f, encoding='utf-8') as fh:
            for linea in fh:
                try:
                    d = json.loads(linea)
                except ValueError:
                    continue
                m = d.get('message') or {}
                if m.get('role') != 'user':
                    continue
                c = m.get('content')
                if not isinstance(c, list):
                    continue
                imgs = [b for b in c if isinstance(b, dict) and b.get('type') == 'image']
                if not imgs:
                    continue
                texto = ' '.join(b.get('text', '') for b in c if isinstance(b, dict) and b.get('type') == 'text')
                fuera.append({'uuid': d.get('uuid', ''), 'ts': d.get('timestamp', ''),
                              'texto': texto.strip(), 'imgs': imgs, 'fichero': f})
    return fuera


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ticket', nargs='?', help='ID del ticket, p. ej. BUG-GAL1')
    ap.add_argument('--uuid', help='prefijo del uuid del mensaje (por defecto: el último con imágenes)')
    ap.add_argument('--listar', action='store_true')
    a = ap.parse_args()

    todos = mensajes_con_imagen()
    if a.listar or not a.ticket:
        for m in todos[-25:]:
            print('%s  %s  %d img  %s' % (m['uuid'][:8], m['ts'][:19], len(m['imgs']), m['texto'][:90]))
        return 0

    if a.uuid:
        cand = [m for m in todos if m['uuid'].startswith(a.uuid)]
        if not cand:
            print('no hay ningún mensaje con imágenes cuyo uuid empiece por «%s»' % a.uuid, file=sys.stderr)
            return 1
        msg = cand[-1]
    else:
        msg = todos[-1]

    dir_ = os.path.join(DESTINO, a.ticket)
    os.makedirs(dir_, exist_ok=True)
    nombres = []
    for i, b in enumerate(msg['imgs'], 1):
        src = b.get('source', {})
        ext = EXT.get(src.get('media_type', ''), 'png')
        ruta = os.path.join(dir_, '%02d.%s' % (i, ext))
        with open(ruta, 'wb') as fh:
            fh.write(base64.b64decode(src.get('data', '')))
        nombres.append(os.path.basename(ruta))
        print('  ✓ %s  (%.0f KB)' % (ruta, os.path.getsize(ruta) / 1024))

    with open(os.path.join(dir_, 'contexto.md'), 'w', encoding='utf-8') as fh:
        fh.write('# %s · capturas del dueño\n\n' % a.ticket)
        fh.write('- **Fecha**: %s\n- **Mensaje**: `%s`\n- **Imágenes**: %s\n\n' %
                 (msg['ts'][:19], msg['uuid'], ', '.join(nombres)))
        fh.write('## Lo que dijo el dueño al adjuntarlas\n\n> %s\n' %
                 msg['texto'].replace('\n', '\n> '))
    print('  ✓ %s/contexto.md' % dir_)
    return 0


if __name__ == '__main__':
    sys.exit(main())
