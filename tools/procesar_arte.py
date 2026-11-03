"""Procesa el arte generado (arte/fuentes/) y lo deja listo para el juego (assets/).

    python3 tools/procesar_arte.py

Hace falta Python con pillow, numpy y scipy. Por cada hoja:
  1. separa las piezas del fondo magenta (aunque sea JPG y el magenta no sea exacto);
  2. las achica a su tamano real de pixel art (las imagenes de la IA vienen "agrandadas") y reduce los colores,
     para que queden pixeles nitidos de 8 bits;
  3. calcula el punto de enganche de cada pieza (hombro de los brazos, cadera de las piernas);
  4. de las partes de mecha hace la version roja (enemigos) y verde cambiando solo los azules.
Escribe assets/mecha/<color>/<parte>.png, assets/mecha/sprites.json y assets/retratos/<n>.png.

Si cambia el orden o la cantidad de piezas de una hoja, se ajusta HOJAS mas abajo.
"""
import colorsys
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
FUENTES = os.path.join(RAIZ, 'arte', 'fuentes')
SALIDA = os.path.join(RAIZ, 'assets')

# Cada hoja: archivo y la lista de piezas, de izquierda a derecha, tal como las detecta el script.
# None = pieza que no se usa (repetida o de referencia). 'alto' o 'ancho': tamano final en pixeles de juego.
# 'ancla': donde se engancha ('abajo' = hombro abajo, 'arriba' = cadera arriba, 'centro').
HOJAS = {
    'mecha-partes-1': [
        ('torso_ligero', {'ancho': 13, 'ancla': 'centro'}),
        ('torso_medio', {'ancho': 15, 'ancla': 'centro'}),
        ('torso_pesado', {'ancho': 20, 'ancla': 'centro'}),
        None, None, None, None, None, None, None,  # escotillas y pares de piernas: se usan las de otras hojas
    ],
    'mecha-piernas': [
        ('piernas_bipode', {'alto': 11, 'ancla': 'arriba'}),
        ('piernas_orugas', {'alto': 19, 'ancla': 'centro'}),
        ('piernas_saltarinas', {'alto': 14, 'ancla': 'arriba'}),
    ],
    'mecha-cabezas-mochilas': [
        ('cabeza_sensor', {'ancho': 8, 'ancla': 'centro'}),
        ('cabeza_optica', {'ancho': 8, 'ancla': 'centro'}),
        ('mochila_reparacion', {'ancho': 10, 'ancla': 'arriba'}),
        ('mochila_propulsor', {'ancho': 10, 'ancla': 'arriba'}),
        ('mochila_municion', {'ancho': 10, 'ancla': 'arriba'}),
        ('mochila_torreta', {'ancho': 9, 'ancla': 'arriba'}),
    ],
    'mecha-armas-1': [
        ('brazo_rifle', {'alto': 18, 'ancla': 'abajo'}),
        ('brazo_rotativa', {'alto': 15, 'ancla': 'abajo'}),
        ('brazo_canon_riel', {'alto': 20, 'ancla': 'abajo'}),
        ('brazo_lanzallamas', {'alto': 14, 'ancla': 'abajo'}),
    ],
    'mecha-armas-2': [
        ('brazo_hoja', {'alto': 18, 'ancla': 'abajo'}),
        ('brazo_lanzamisiles', {'alto': 15, 'ancla': 'abajo', 'recorte_x': (0, 0.27)}),  # viene pegado al riel repetido
        ('brazo_escudo', {'alto': 13, 'ancla': 'abajo'}),
    ],
}

# Corte a mano de piezas que vienen pegadas (fraccion del ancho de la hoja)
PEGADAS = {'mecha-armas-2': {1: (0.282, 0.55)}}

ESCALA = 2

COLORES = {'azul': None, 'rojo': 0.0, 'verde': 0.31}  # tono destino para los azules (None = sin cambio)


def fondo_magenta(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    return (r > 140) & (b > 140) & (g < 130) & (np.abs(r - b) < 100) & (r - g > 60)


def piezas(nombre):
    img = Image.open(os.path.join(FUENTES, nombre + '.jpg')).convert('RGB')
    a = np.asarray(img)
    alto, ancho = a.shape[:2]
    solido = ndimage.binary_opening(~fondo_magenta(a), iterations=2)
    lab, n = ndimage.label(ndimage.binary_dilation(solido, iterations=int(ancho * 0.006)))
    cajas = []
    for i, s in enumerate(ndimage.find_objects(lab)):
        if (lab[s] == i + 1).sum() < ancho * ancho * 0.0004:
            continue
        cajas.append([s[1].start, s[0].start, s[1].stop, s[0].stop])
    cajas.sort()
    for i, (x0, x1) in PEGADAS.get(nombre, {}).items():
        c = cajas[i]
        cajas[i] = [int(ancho * x0), c[1], int(ancho * x1), c[3]]
    return a, solido, cajas


def reducir(a, solido, caja, spec):
    x0, y0, x1, y1 = caja
    recorte = a[y0:y1, x0:x1].copy()
    # el fondo se pinta del color del contorno: al achicar, el borde queda oscuro y no magenta
    recorte[~solido[y0:y1, x0:x1]] = (10, 15, 44)
    rgb = Image.fromarray(recorte)
    mascara = Image.fromarray((solido[y0:y1, x0:x1] * 255).astype(np.uint8))
    w, h = rgb.size
    # ESCALA: las medidas de HOJAS estan en pixeles de una grilla de 24 por casilla; se guarda al doble de detalle
    escala = ESCALA * (spec['ancho'] / w if 'ancho' in spec else spec['alto'] / h)
    nw, nh = max(1, round(w * escala)), max(1, round(h * escala))
    chico = rgb.resize((nw, nh), Image.BOX)
    m = np.asarray(mascara.resize((nw, nh), Image.BOX)) > 110
    # pocos colores: aspecto de 8 bits
    q = chico.quantize(colors=14, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    rgba = np.dstack([np.asarray(q), (m * 255).astype(np.uint8)])
    return rgba


def ancla(rgba, tipo):
    alfa = rgba[..., 3] > 0
    ys, xs = np.nonzero(alfa)
    h = rgba.shape[0]
    if tipo == 'abajo':  # el hombro: centro de lo opaco en el cuarto de abajo
        sel = ys >= h * 0.72
        return [round(float(xs[sel].mean()), 1), round(float(ys[sel].mean()), 1)]
    if tipo == 'arriba':
        sel = ys <= h * 0.25
        return [round(float(xs[sel].mean()), 1), 0.0]
    return [round(rgba.shape[1] / 2, 1), round(h / 2, 1)]


def recolorear(rgba, tono):
    if tono is None:
        return rgba
    out = rgba.copy()
    for y in range(out.shape[0]):
        for x in range(out.shape[1]):
            r, g, b, al = out[y, x]
            if not al:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.5 <= h <= 0.72 and s > 0.18:  # solo los azules; grises, amarillos y rojos quedan
                nr, ng, nb = colorsys.hsv_to_rgb(tono, min(1, s * 1.1), v)
                out[y, x, :3] = [round(nr * 255), round(ng * 255), round(nb * 255)]
    return out


def retratos():
    ruta = os.path.join(FUENTES, 'retratos-1.jpg')
    if not os.path.exists(ruta):
        return 0
    paleta = [(0x0A, 0x0F, 0x2C), (0x1B, 0x2F, 0x7A), (0x2E, 0x55, 0xC9), (0x6F, 0x9B, 0xFF), (0xD6, 0xE4, 0xFF)]
    pal_img = Image.new('P', (1, 1))
    pal_img.putpalette([c for rgb in paleta for c in rgb] + [0] * (768 - 15))
    os.makedirs(os.path.join(SALIDA, 'retratos'), exist_ok=True)
    n = 0
    for hoja in sorted(f for f in os.listdir(FUENTES) if f.startswith('retratos-') and not f.startswith('retratos-jefes')):
        a = np.asarray(Image.open(os.path.join(FUENTES, hoja)).convert('RGB'))
        lab, k = ndimage.label(ndimage.binary_opening(~fondo_magenta(a), iterations=3))
        cajas = []
        for i, s in enumerate(ndimage.find_objects(lab)):
            if (lab[s] == i + 1).sum() > a.shape[0] * a.shape[1] * 0.05:
                cajas.append((s[0].start // 100, s[1].start, s))  # filas primero, despues columnas
        cajas.sort()
        for _, _, s in cajas:
            pieza = Image.fromarray(a[s]).resize((48, 54), Image.BOX)
            pieza = pieza.quantize(palette=pal_img, dither=Image.NONE).convert('RGB')
            n += 1
            pieza.save(os.path.join(SALIDA, 'retratos', '%02d.png' % n))
    return n


def main():
    manifiesto = {'_escala': ESCALA}
    for nombre, lista in HOJAS.items():
        if not os.path.exists(os.path.join(FUENTES, nombre + '.jpg')):
            print('falta', nombre, '(se saltea)')
            continue
        a, solido, cajas = piezas(nombre)
        if len(cajas) != len(lista):
            sys.exit('%s: encontre %d piezas y esperaba %d. Pedile a la IA que las separe mas.' % (nombre, len(cajas), len(lista)))
        for caja, item in zip(cajas, lista):
            if not item:
                continue
            pid, spec = item
            base = reducir(a, solido, caja, spec)
            for color, tono in COLORES.items():
                carpeta = os.path.join(SALIDA, 'mecha', color)
                os.makedirs(carpeta, exist_ok=True)
                Image.fromarray(recolorear(base, tono), 'RGBA').save(os.path.join(carpeta, pid + '.png'))
            manifiesto[pid] = {'w': base.shape[1], 'h': base.shape[0], 'ancla': ancla(base, spec['ancla'])}
            print('  %-20s %2dx%-2d ancla %s' % (pid, base.shape[1], base.shape[0], manifiesto[pid]['ancla']))
    with open(os.path.join(SALIDA, 'mecha', 'sprites.json'), 'w') as f:
        json.dump(manifiesto, f, indent=1, sort_keys=True)
    print(len(manifiesto), 'partes ·', retratos(), 'retratos')


if __name__ == '__main__':
    main()
