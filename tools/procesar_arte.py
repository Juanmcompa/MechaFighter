"""Procesa el arte generado (arte/fuentes/) y lo deja listo para el juego (assets/).

    python3 tools/procesar_arte.py

Hace falta Python con pillow, numpy y scipy. Por cada hoja:
  1. separa las piezas del fondo magenta (aunque sea JPG y el magenta no sea exacto);
  2. las achica a su tamano real de pixel art (las imagenes de la IA vienen "agrandadas") y reduce los colores,
     para que queden pixeles nitidos de 8 bits;
  3. calcula el punto de enganche de cada pieza (hombro de los brazos, cadera de las piernas);
  4. de las partes de mecha hace la version roja (enemigos) y verde cambiando solo los azules.
Escribe assets/mecha/<color>/<parte>.png, assets/mecha/sprites.json, assets/retratos/<n>.png,
assets/terreno/ y assets/unidades/ (vehiculos y drones enteros).

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


def piezas(nombre, dilatar=None):
    ruta = os.path.join(FUENTES, nombre + '.jpg')
    if not os.path.exists(ruta):
        ruta = ruta[:-4] + '.png'
    img = Image.open(ruta).convert('RGB')
    a = np.asarray(img)
    alto, ancho = a.shape[:2]
    solido = ndimage.binary_opening(~fondo_magenta(a), iterations=2)
    lab, n = ndimage.label(ndimage.binary_dilation(solido, iterations=dilatar if dilatar is not None else int(ancho * 0.006)))
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
    # 'factor': escala fija de la hoja (pixeles de juego por pixel de la hoja), asi las piezas guardan su tamano relativo
    escala = ESCALA * (spec['factor'] if 'factor' in spec else spec['ancho'] / w if 'ancho' in spec else spec['alto'] / h)
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


# ---------- Terreno ----------
# Nano Banana le agrega un rotulo abajo a cada pieza: por eso aca se recorta con cajas fijas (en pixeles de la hoja
# original de 1408x768) en vez de detectar las piezas. Si se regenera una hoja, revisar estas cajas.
TERRENO_TEXTURAS = [  # (id, x0, y0, x1, y1)
    ('piso_a', 17, 17, 347, 347), ('piso_b', 364, 17, 694, 347), ('rejilla', 712, 17, 1042, 347), ('concreto', 1061, 17, 1391, 347),
    ('muro_a', 17, 398, 345, 726), ('muro_b', 364, 398, 692, 726), ('acido', 790, 470, 966, 646), ('franjas', 1061, 398, 1389, 726),
]
TERRENO_OBJETOS = [  # baja = media cobertura, alta = cobertura total
    ('cajones', 'baja', 17, 20, 348, 341), ('barriles', 'baja', 366, 20, 690, 341),
    ('bolsas', 'baja', 712, 20, 1045, 341), ('barrera', 'baja', 1061, 20, 1388, 341),
    ('contenedor', 'alta', 17, 398, 348, 722), ('pilar', 'alta', 366, 398, 690, 722),
    ('generador', 'alta', 712, 398, 1045, 722), ('vigas', 'alta', 1061, 398, 1388, 722),
]
TERRENO_DETALLES_FILAS = [(40, 312), (440, 676)]  # franjas de la hoja de detalles sin los rotulos
CASILLA = 32  # pixeles de juego por casilla (se guarda al doble, como las partes)


def magenta_amplio(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    return (r > 120) & (b > 120) & (g < 110) & (r - g > 70) & (b - g > 70)


def a_pixeles(rgb, mascara, w, h, colores=16):
    chico = Image.fromarray(rgb).resize((w, h), Image.BOX)
    q = np.asarray(chico.quantize(colors=colores, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB'))
    if mascara is None:
        return np.dstack([q, np.full((h, w), 255, np.uint8)])
    m = np.asarray(Image.fromarray((mascara * 255).astype(np.uint8)).resize((w, h), Image.BOX)) > 120
    return np.dstack([q, (m * 255).astype(np.uint8)])


def recortar_objeto(a, caja, lado_max):
    x0, y0, x1, y1 = caja
    sub = a[y0:y1, x0:x1].copy()
    solido = ndimage.binary_opening(~magenta_amplio(sub), iterations=2)
    ys, xs = np.nonzero(solido)
    if not len(xs):
        return None
    sub, solido = sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1], solido[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    sub[~solido] = (7, 11, 8)
    h, w = solido.shape
    k = lado_max / max(w, h)
    return a_pixeles(sub, solido, max(1, round(w * k)), max(1, round(h * k)))


def terreno():
    base = os.path.join(FUENTES, 'terreno-')
    if not os.path.exists(base + 'texturas.png'):
        return 0
    out = os.path.join(SALIDA, 'terreno')
    os.makedirs(out, exist_ok=True)
    lado = CASILLA * ESCALA
    man = {'casilla': lado, 'texturas': [], 'objetos': {}, 'detalles': []}
    a = np.asarray(Image.open(base + 'texturas.png').convert('RGB'))
    for pid, x0, y0, x1, y1 in TERRENO_TEXTURAS:
        Image.fromarray(a_pixeles(a[y0:y1, x0:x1], None, lado, lado), 'RGBA').save(os.path.join(out, pid + '.png'))
        man['texturas'].append(pid)
    if os.path.exists(base + 'coberturas.png'):
        a = np.asarray(Image.open(base + 'coberturas.png').convert('RGB'))
        for pid, tipo, *caja in TERRENO_OBJETOS:
            img = recortar_objeto(a, caja, round(lado * 0.94))
            if img is not None:
                Image.fromarray(img, 'RGBA').save(os.path.join(out, 'obj_' + pid + '.png'))
                man['objetos'].setdefault(tipo, []).append('obj_' + pid)
    if os.path.exists(base + 'detalles.png'):
        a = np.asarray(Image.open(base + 'detalles.png').convert('RGB'))
        n = 0
        for y0, y1 in TERRENO_DETALLES_FILAS:
            franja = a[y0:y1]
            solido = ndimage.binary_opening(~magenta_amplio(franja), iterations=1)
            lab, _ = ndimage.label(ndimage.binary_dilation(solido, iterations=14))
            cajas = sorted((s[1].start, s[0].start, s[1].stop, s[0].stop) for s in ndimage.find_objects(lab)
                           if (s[1].stop - s[1].start) * (s[0].stop - s[0].start) > 1500)
            for x0, yy0, x1, yy1 in cajas:
                img = recortar_objeto(franja, (x0, yy0, x1, yy1), round(lado * 0.7))
                if img is None:
                    continue
                n += 1
                nombre = 'det_%02d' % n
                Image.fromarray(img, 'RGBA').save(os.path.join(out, nombre + '.png'))
                man['detalles'].append(nombre)
    with open(os.path.join(out, 'terreno.json'), 'w') as f:
        json.dump(man, f, indent=1)
    return len(man['texturas']) + sum(len(v) for v in man['objetos'].values()) + len(man['detalles'])


# ---------- Unidades enteras (vehiculos y drones) ----------
# Una imagen por unidad, mirando para arriba (como las partes). 'frente': para donde mira en la hoja.
# 'color': rojo = se recolorea como enemigo. Escribe assets/unidades/<id>.png y unidades.json.
UNIDADES = {
    'unidades-transporte': [
        ('transporte_carga', {'alto': 36, 'frente': 'arriba'}),
        ('transporte_combustible', {'alto': 36, 'frente': 'arriba'}),
        ('transporte_lona', {'alto': 36, 'frente': 'arriba'}),
    ],
    'unidades-drones-1': [
        ('dron_artillado', {'alto': 23, 'frente': 'abajo', 'color': 'rojo'}),
        ('dron_cazador', {'alto': 25, 'frente': 'abajo', 'color': 'rojo'}),
        ('dron_rotativo', {'alto': 27, 'frente': 'abajo', 'color': 'rojo'}),
        ('dron_bombardero', {'alto': 23, 'frente': 'abajo', 'color': 'rojo'}),
        ('dron_pesado_b', {'alto': 30, 'frente': 'abajo', 'color': 'rojo'}),
        ('dron_vigia_b', {'alto': 24, 'frente': 'abajo', 'color': 'rojo'}),
    ],
    'unidades-drones-2': [
        ('dron_vigia', {'ancho': 23, 'frente': 'abajo', 'color': 'rojo'}),
        ('dron_pesado', {'ancho': 27, 'frente': 'arriba', 'color': 'rojo'}),
        ('dron_centinela', {'ancho': 27, 'frente': 'arriba', 'color': 'rojo'}),
    ],
}


def limpiar(img):
    # las helices borrosas dejan pixeles teñidos de magenta: afuera; y las motas sueltas tambien
    img = img.copy()
    for y in range(img.shape[0]):
        for x in range(img.shape[1]):
            r, g, b, al = img[y, x]
            if al:
                h, s_, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                if 0.75 <= h <= 0.97 and s_ > 0.22:
                    img[y, x, 3] = 0
    lab, n = ndimage.label(img[..., 3] > 0)
    if n > 1:
        tam = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        for i, t in enumerate(tam):
            if t < 6:
                img[lab == i + 1, 3] = 0
    return img


# Infanteria: hormiguitas (unos 7 px de juego) con una escala fija por hoja; los caidos, cuerpos y manchas.
FIGURA = 0.033
CAIDO = 0.03
UNIDADES['infanteria-piratas'] = [('pirata_%02d' % (i + 1), {'factor': FIGURA, 'frente': 'arriba'}) for i in range(10)]
UNIDADES['infanteria-guerrilla'] = [('guerrilla_%02d' % (i + 1), {'factor': FIGURA, 'frente': 'arriba'}) for i in range(10)]
UNIDADES['infanteria-caidos'] = [('caido_%02d' % (i + 1), {'factor': CAIDO, 'frente': 'arriba'}) for i in range(6)] + [
    ('caido_quemado', {'factor': CAIDO, 'frente': 'arriba'}), ('tirado_rifle', {'factor': CAIDO, 'frente': 'arriba'}),
    ('tirado_casco', {'factor': CAIDO, 'frente': 'arriba'}), ('mancha_1', {'factor': CAIDO, 'frente': 'arriba'}),
    ('mancha_2', {'factor': CAIDO, 'frente': 'arriba'}), ('mancha_quemado', {'factor': CAIDO, 'frente': 'arriba'})]
# hojas con las piezas muy juntas: se separan con menos dilatacion
DILATAR = {'infanteria-piratas': 4, 'infanteria-guerrilla': 4, 'infanteria-caidos': 4}


def unidades():
    out = os.path.join(SALIDA, 'unidades')
    man = {'_escala': ESCALA}
    for nombre, lista in UNIDADES.items():
        if not any(os.path.exists(os.path.join(FUENTES, nombre + ext)) for ext in ('.jpg', '.png')):
            continue
        a, solido, cajas = piezas(nombre, DILATAR.get(nombre))
        if len(cajas) != len(lista):
            sys.exit('%s: encontre %d piezas y esperaba %d.' % (nombre, len(cajas), len(lista)))
        os.makedirs(out, exist_ok=True)
        for caja, item in zip(cajas, lista):
            if not item:
                continue
            pid, spec = item
            # recorte justo a lo opaco (el ruido del fondo agranda las cajas)
            x0, y0, x1, y1 = caja
            ys, xs = np.nonzero(solido[y0:y1, x0:x1])
            caja = [x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1]
            img = limpiar(reducir(a, solido, caja, spec))
            if spec.get('frente') == 'abajo':
                img = img[::-1, ::-1].copy()  # media vuelta: todas miran para arriba
            img = recolorear(img, COLORES.get(spec.get('color', 'azul')))
            Image.fromarray(img, 'RGBA').save(os.path.join(out, pid + '.png'))
            man[pid] = {'w': img.shape[1], 'h': img.shape[0]}
    if len(man) > 1:
        with open(os.path.join(out, 'unidades.json'), 'w') as f:
            json.dump(man, f, indent=1, sort_keys=True)
    return len(man) - 1


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
    print(len(manifiesto) - 1, 'partes ·', retratos(), 'retratos ·', terreno(), 'piezas de terreno ·', unidades(), 'unidades')


if __name__ == '__main__':
    main()
