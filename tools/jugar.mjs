// Juega contratos enteros en un navegador de verdad (tamaño celular) y avisa si algo se rompe:
// errores de pagina, pantallas que no aparecen, scroll horizontal y, en ingles, texto que quedo en castellano.
//   node tools/jugar.mjs [contratos=3] [idioma=es]      ej: node tools/jugar.mjs 4 en
// Necesita Playwright (no es dependencia del juego): npm i -D playwright && npx playwright install chromium
// Levanta su propio servidor: no hace falta tener nada abierto.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { RAIZ } from './leer-disco.mjs';

const K = Number(process.argv[2] || 3);
const IDIOMA = process.argv[3] || 'es';

let chromium, devices;
try { ({ chromium, devices } = await import('playwright')); } catch {
  // instalado en otro lado (global): se busca en NODE_PATH
  try { ({ chromium, devices } = createRequire(import.meta.url)(createRequire(import.meta.url).resolve('playwright', { paths: (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean) }))); } catch { /* no esta */ }
}
if (!chromium) {
  console.log('⚠ Sin Playwright: no se puede jugar en el navegador. (npm i -D playwright && npx playwright install chromium)');
  process.exit(3);
}

// ---- servidor de archivos minimo
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const servidor = http.createServer((q, r) => {
  let ruta = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = path.join(RAIZ, ruta);
  if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', TIPOS[path.extname(archivo)] || 'application/octet-stream');
  fs.createReadStream(archivo).pipe(r);
});
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
const URL_JUEGO = 'http://127.0.0.1:' + servidor.address().port + '/?luces=no&idioma=' + IDIOMA;

// ---- los textos de los botones, en el idioma que se juega
const INTERFAZ = IDIOMA === 'es' ? {} : JSON.parse(fs.readFileSync(path.join(RAIZ, 'data/idiomas/' + IDIOMA + '.json'), 'utf8')).interfaz;
const T = (s) => INTERFAZ[s] || s;
const texto = (s) => 'text=' + T(s);

const problemas = [], avisos = [];
// (los acentos solos no cuentan: hay nombres propios como «Roldán»)
const CASTELLANO = /[ñ¿¡]|\b(que|con|los|las|del|para|por|una|sus|pero|como|está|vos|sin|hay|muy)\b/i;
const NO_CUENTA = new Set(['Español']);
const vistos = new Set();

const navegador = await chromium.launch();
const p = await (await navegador.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 })).newPage();
p.on('pageerror', (e) => problemas.push('Error de página: ' + e.message));
// (las imagenes que faltan no cuentan: el juego prueba variantes opcionales y sigue sin ellas; eso lo mira el inventario de arte)
p.on('response', (r) => { const u = new URL(r.url()).pathname; if (r.status() === 404 && /\.(js|mjs|css|json|html)$/.test(u) && !/idiomas\/es\.json$/.test(u)) problemas.push('No existe: ' + u); });

// Mira la pantalla actual: scroll horizontal y (en otro idioma) texto en castellano
async function mirar(pantalla) {
  await p.waitForTimeout(150);
  const { ancho, textos } = await p.evaluate(() => ({
    ancho: document.documentElement.scrollWidth - window.innerWidth,
    textos: document.body.innerText + '\n' + [...document.querySelectorAll('[aria-label],[title]')].map((e) => e.getAttribute('aria-label') || e.getAttribute('title')).join('\n')
  }));
  if (ancho > 1) problemas.push(pantalla + ': se pasa ' + ancho + ' px de ancho (scroll horizontal)');
  if (IDIOMA !== 'es') for (const l of textos.split('\n').map((x) => x.trim()).filter(Boolean)) {
    if (CASTELLANO.test(l) && !NO_CUENTA.has(l) && !vistos.has(l)) { vistos.add(l); avisos.push(pantalla + ': ¿quedó en castellano? «' + l.slice(0, 90) + '»'); }
  }
}

let jugados = 0;
try {
  await p.goto(URL_JUEGO);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForSelector('.portada'); await mirar('portada');
  await p.click(texto('Nueva campaña')); await p.waitForSelector('.hc'); await mirar('hangar');

  for (let k = 0; k < K; k++) {
    // brujula: el primer destino que tenga contrato
    await p.click('.hg-tab >> nth=3'); await p.waitForSelector('.br-radar'); await mirar('brújula');
    const nodos = await p.locator('.br-nodo').count();
    let hay = false;
    for (let i = 0; i < nodos && !hay; i++) { await p.click('.br-nodo >> nth=' + i, { timeout: 4000 }); hay = (await p.locator(texto('Ver contrato')).count()) > 0; }
    if (!hay) { avisos.push('Vuelta ' + (k + 1) + ': no había contratos a la vista (se corta acá)'); break; }
    await p.click(texto('Ver contrato')); await p.waitForSelector('.ct'); await mirar('contrato');
    await p.click('.ct-pie .boton.principal'); await p.waitForTimeout(300);
    // quizas pasa algo en el salto
    if (await p.locator('.opcion-dilema').count()) {
      await mirar('suceso');
      await p.click('.opcion-dilema:not([disabled]) >> nth=-1');
      await p.waitForSelector(texto('Seguir el salto')); await mirar('suceso (resultado)');
      await p.click(texto('Seguir el salto'));
    }
    await p.waitForSelector(texto('Plan de despliegue')); await mirar('preparación');
    await p.click(texto('Plan de despliegue')); await p.waitForSelector('.pl-mapa'); await mirar('plan');
    await p.click('.hg-desplegar .boton'); await p.waitForTimeout(500);
    if (await p.locator(texto('Saltar')).count()) await p.click(texto('Saltar'));
    for (let t = 0; t < 4 && !(await p.locator('canvas.campo').count()); t++) {
      const b = p.locator('button.principal').first();
      if (await b.count()) await b.click();
      await p.waitForTimeout(500);
    }
    await p.waitForSelector('canvas.campo', { timeout: 15000 });
    await p.click('.cr-orden >> nth=1').catch(() => {}); // una orden por radio
    await p.click('[aria-label="' + T('Ver el final') + '"]');
    await p.waitForSelector(texto('Ver informe'), { timeout: 60000 }); await mirar('batalla');
    await p.click(texto('Ver informe')); await p.waitForSelector('.inf-carta'); await mirar('informe');
    jugados++;
    await p.click('.inf-hangar').catch(() => p.click('.inf-pie .boton.principal'));
    await p.waitForTimeout(400);
    if (!(await p.locator('.hc').count())) break; // se termino la campaña
  }
  if (await p.locator('.hc').count()) {
    await p.click('.hc-nombre >> nth=0'); await mirar('ficha del piloto');
    await p.click('.hg-volver'); await p.click('.hg-compania'); await p.waitForSelector('.cp'); await mirar('compañía');
  }
} catch (e) {
  const pantalla = await p.evaluate(() => (document.querySelector('h1') || {}).textContent || '?').catch(() => '?');
  problemas.push('Se trabó en «' + pantalla.trim() + '»: ' + e.message.split('\n')[0]);
  await p.screenshot({ path: path.join(RAIZ, 'jugar-error.png') }).catch(() => {});
}
await navegador.close();
servidor.close();

for (const a of [...new Set(avisos)]) console.log('  ⚠ ' + a);
for (const x of problemas) console.log('  ✗ ' + x);
console.log((problemas.length ? '✗ ' : '✓ ') + 'Navegador (' + IDIOMA + '): ' + jugados + ' de ' + K + ' contratos jugados' + (problemas.length ? ', ' + problemas.length + ' problema(s)' + (fs.existsSync(path.join(RAIZ, 'jugar-error.png')) ? ' · captura en jugar-error.png' : '') : ''));
process.exit(problemas.length ? 1 : 0);
