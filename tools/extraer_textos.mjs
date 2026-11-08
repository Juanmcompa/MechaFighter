// Arma el catalogo de textos de la interfaz (los escritos en el codigo) en data/interfaz.json.
// Uso: node tools/extraer_textos.mjs   (correrlo despues de cambiar textos en el codigo)
// El taller (admin.html > Textos e idiomas > interfaz) muestra este catalogo para cambiarlos o traducirlos.
import fs from 'node:fs';
import path from 'node:path';

const CARPETAS = ['src/ui', 'src/vista', 'src/campana'];
// contextos donde un texto entre comillas NO es para el jugador (clases, iconos, selectores, comparaciones...)
const NO_ES_TEXTO = /(class|clase|iconoNombre|role|type|tipo|estado|pestana|modo|accion|condicion|objetivo|encaje|rareza|color|fondo|cursor|display|sel)\s*[:=]=?=?\s*$|(querySelector(All)?|closest|getElementById|classList\.\w+|addEventListener|setAttribute|getAttribute|dataset\.\w+|startsWith|endsWith|includes|split|join|replace|ico|icono|iconoParte|retrato|existeIcono|derivar|azarAparte|azarDe|tirada|elegir|import|from|case|===|!==)\s*\(?\s*$/;

const esTexto = (s) => /[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(s) &&
  (/\s/.test(s.trim()) || /[A-ZÁÉÍÓÚÑ¡¿«»·…:!?.,]/.test(s) || /[áéíóúñ]/.test(s)) &&
  !/^[.#\[]/.test(s) && !/<\w/.test(s) && !/^(\.\/|\/|https?:)/.test(s) && !/\.(png|json|js|css|svg)$/.test(s) &&
  !/^#[0-9a-f]{3,8}$/i.test(s) && !/\.v\d+$/.test(s) && !/^[IVX]+$/.test(s) && !/^(rgba?|hsla?)\(/.test(s) && !/^[a-z0-9_-]+(\s+[a-z0-9_-]+)*$/.test(s); // (lista de clases)

const catalogo = {};
for (const dir of CARPETAS) {
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    const ruta = path.join(dir, f).replace(/\\/g, '/');
    const lineas = fs.readFileSync(ruta, 'utf8').split('\n');
    lineas.forEach((linea, i) => {
      if (linea.trim().startsWith('//')) return;
      const re = /'((?:[^'\\]|\\.)*)'/g;
      let m;
      while ((m = re.exec(linea))) {
        const s = m[1].replace(/\\'/g, "'");
        const antes = linea.slice(0, m.index);
        if (!esTexto(s) || NO_ES_TEXTO.test(antes)) continue;
        (catalogo[s] = catalogo[s] || []).push(ruta + ':' + (i + 1));
      }
    });
  }
}
const salida = {
  _ayuda: 'Catalogo de los textos de la interfaz que estan en el codigo (lo arma tools/extraer_textos.mjs; no se edita a mano). Para cambiarlos o traducirlos: admin.html > Textos e idiomas > interfaz. Los cambios van en data/idiomas/<codigo>.json > interfaz (es.json para cambiar el castellano).',
  textos: catalogo
};
fs.writeFileSync('data/interfaz.json', JSON.stringify(salida, null, 1) + '\n');
console.log(Object.keys(catalogo).length + ' textos en data/interfaz.json');
