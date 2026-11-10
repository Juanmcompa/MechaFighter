// Ayudante local: un modelo de Ollama que lee archivos del proyecto por su cuenta y devuelve solo el resumen.
// Sirve para que Claude delegue tareas simples (resumir, buscar, borradores de texto) sin gastar su contexto.
//
// Funciona por archivos, sin red entre Claude y la PC:
//   .agente-local/pedidos/<id>.json     lo que se pide
//   .agente-local/respuestas/<id>.json  lo que contesto el modelo
//   .agente-local/estado.json           si esta prendido y que modelos hay
//
// En la PC (una vez, y dejarlo abierto):   node tools/agente-local.mjs
//   opcional:  node tools/agente-local.mjs --modelo qwen2.5-coder:14b --ollama http://localhost:11434
// Para pedir algo (lo usa Claude):          node tools/agente-local.mjs pedir "resumi src/campana/plan.js"
//   opciones de pedir: --dir carpeta  --modelo M  --turnos 10  --tokens 2000  --pensar  --sin-archivos  --espera 300
// Sin dependencias: solo Node 18 o mas nuevo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(RAIZ, '.agente-local');
const PEDIDOS = path.join(BASE, 'pedidos');
const RESPUESTAS = path.join(BASE, 'respuestas');
const ESTADO = path.join(BASE, 'estado.json');
const MAX_LECTURA = 12000; // caracteres por lectura (mas que eso satura a los modelos chicos)
const IGNORAR = new Set(['node_modules', '.git', '.agente-local', 'out', '.wrangler']);

const args = process.argv.slice(2);
function opcion(nombre, porDefecto = null) {
  const i = args.indexOf('--' + nombre);
  if (i < 0) return porDefecto;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}
function bandera(nombre) {
  const i = args.indexOf('--' + nombre);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}
const leerJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Pedir (lado de Claude): deja el pedido y espera la respuesta ----------

async function pedir() {
  const dir = opcion('dir', '.');
  const modelo = opcion('modelo');
  const turnos = Number(opcion('turnos', 10));
  const tokens = Number(opcion('tokens', 2000));
  const espera = Number(opcion('espera', 300));
  const pensar = bandera('pensar');
  const sinArchivos = bandera('sin-archivos');
  const tarea = args.slice(1).join(' ').trim();
  if (!tarea) { console.error('Falta la tarea.'); process.exit(2); }
  const estado = leerJson(ESTADO);
  if (!estado || Math.abs(Date.now() - estado.latido) > 90000) {
    console.error('El ayudante local no esta prendido. En la PC: node tools/agente-local.mjs');
    process.exit(3);
  }
  fs.mkdirSync(PEDIDOS, { recursive: true });
  const id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  // se escribe con otro nombre y se renombra: el que atiende nunca lee un archivo a medias
  const tmp = path.join(PEDIDOS, id + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify({ id, tarea, dir, modelo, turnos, tokens, pensar, sinArchivos }));
  fs.renameSync(tmp, path.join(PEDIDOS, id + '.json'));
  const salida = path.join(RESPUESTAS, id + '.json');
  for (let t = 0; t < espera * 2; t++) {
    await dormir(500);
    const r = leerJson(salida);
    if (!r) continue;
    if (!r.ok) { console.error('Error del ayudante: ' + r.error); process.exit(1); }
    console.log(r.texto);
    console.error(`[${r.modelo} · ${r.turnos} turnos · ${Math.round(r.ms / 1000)} s · leyo: ${r.herramientas.join(', ') || 'nada'}]`);
    return;
  }
  console.error('El ayudante no contesto en ' + espera + ' s.');
  process.exit(4);
}

// ---------- Herramientas que puede usar el modelo (solo leer, solo dentro del proyecto) ----------

function dentro(base, relativo) {
  const destino = path.resolve(base, String(relativo || '.'));
  if (destino !== RAIZ && !destino.startsWith(RAIZ + path.sep)) throw new Error('fuera del proyecto');
  return destino;
}

const HERRAMIENTAS = [
  { type: 'function', function: { name: 'leer_archivo', description: 'Lee un archivo de texto del proyecto. Devuelve hasta 12000 caracteres desde "desde" (por defecto 0). Si el archivo es mas largo, avisa y se puede seguir leyendo con "desde".',
    parameters: { type: 'object', properties: { ruta: { type: 'string', description: 'Ruta relativa a la carpeta de trabajo' }, desde: { type: 'integer', description: 'Caracter desde donde leer' } }, required: ['ruta'] } } },
  { type: 'function', function: { name: 'listar_carpeta', description: 'Lista los archivos y carpetas de una carpeta del proyecto.',
    parameters: { type: 'object', properties: { ruta: { type: 'string', description: 'Ruta relativa a la carpeta de trabajo ("." para la raiz)' } }, required: ['ruta'] } } },
  { type: 'function', function: { name: 'buscar', description: 'Busca un texto (sin distinguir mayusculas) en los archivos de una carpeta y sus subcarpetas. Devuelve archivo:linea: texto, hasta 60 resultados.',
    parameters: { type: 'object', properties: { texto: { type: 'string' }, ruta: { type: 'string', description: 'Carpeta donde buscar ("." para todo)' } }, required: ['texto'] } } }
];

function usar(base, nombre, a) {
  try {
    if (nombre === 'leer_archivo') {
      const f = dentro(base, a.ruta);
      const todo = fs.readFileSync(f, 'utf8');
      const desde = Math.max(0, Number(a.desde) || 0);
      const parte = todo.slice(desde, desde + MAX_LECTURA);
      const resto = todo.length - desde - parte.length;
      return parte + (resto > 0 ? `\n\n[... faltan ${resto} caracteres: segui con desde=${desde + parte.length}]` : '');
    }
    if (nombre === 'listar_carpeta') {
      const f = dentro(base, a.ruta);
      return fs.readdirSync(f, { withFileTypes: true }).filter((e) => !IGNORAR.has(e.name))
        .map((e) => (e.isDirectory() ? e.name + '/' : e.name + ' (' + fs.statSync(path.join(f, e.name)).size + ' bytes)')).join('\n') || '(vacia)';
    }
    if (nombre === 'buscar') {
      const aguja = String(a.texto || '').toLowerCase();
      if (!aguja) return 'Falta el texto.';
      const hallados = [];
      const recorrer = (carpeta) => {
        for (const e of fs.readdirSync(carpeta, { withFileTypes: true })) {
          if (hallados.length >= 60 || IGNORAR.has(e.name)) continue;
          const f = path.join(carpeta, e.name);
          if (e.isDirectory()) { recorrer(f); continue; }
          if (!/\.(js|mjs|json|css|html|md|txt|sh|py)$/.test(e.name) || fs.statSync(f).size > 600000) continue;
          fs.readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
            if (hallados.length < 60 && linea.toLowerCase().includes(aguja)) hallados.push(path.relative(base, f).replace(/\\/g, '/') + ':' + (i + 1) + ': ' + linea.trim().slice(0, 160));
          });
        }
      };
      recorrer(dentro(base, a.ruta || '.'));
      return hallados.join('\n') || 'Sin resultados.';
    }
    return 'Herramienta desconocida: ' + nombre;
  } catch (e) {
    return 'Error: ' + e.message;
  }
}

// ---------- Atender (lado de la PC): el bucle del agente contra Ollama ----------

const SISTEMA = 'Sos un ayudante que trabaja sobre los archivos de un proyecto (un videojuego en HTML y JavaScript, con datos en JSON). ' +
  'Usa las herramientas para leer lo que necesites; no inventes contenido de archivos que no leiste. ' +
  'Cuando termines, contesta en español, corto y concreto: solo lo que se pidio, con rutas y numeros de linea cuando ayuden. No pegues archivos enteros.';

async function chat(url, cuerpo) {
  const llamar = (c) => fetch(url + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) });
  let r = await llamar(cuerpo);
  // los modelos que no razonan rechazan el campo "think": se reintenta sin el
  if (r.status === 400 && 'think' in cuerpo) { const { think, ...sin } = cuerpo; r = await llamar(sin); }
  if (!r.ok) throw new Error('Ollama contesto ' + r.status + ': ' + (await r.text()).slice(0, 300));
  return r.json();
}

async function resolver(url, modeloPorDefecto, pedido) {
  const inicio = Date.now();
  const modelo = pedido.modelo || modeloPorDefecto;
  const base = dentro(RAIZ, pedido.dir || '.');
  const mensajes = [{ role: 'system', content: SISTEMA }, { role: 'user', content: pedido.tarea }];
  const usadas = [];
  const turnos = Math.max(1, Math.min(30, pedido.turnos || 10));
  for (let t = 1; t <= turnos; t++) {
    const ultimo = t === turnos;
    const cuerpo = { model: modelo, messages: mensajes, stream: false, think: !!pedido.pensar, options: { temperature: 0.2, num_predict: pedido.tokens || 2000, num_ctx: 16384 } };
    if (!pedido.sinArchivos && !ultimo) cuerpo.tools = HERRAMIENTAS;
    if (ultimo && !pedido.sinArchivos) mensajes.push({ role: 'user', content: 'No quedan mas lecturas. Contesta ahora con lo que tenes.' });
    const m = (await chat(url, cuerpo)).message || {};
    const llamadas = m.tool_calls || [];
    if (!llamadas.length) return { ok: true, texto: (m.content || '').trim(), turnos: t, herramientas: usadas, modelo, ms: Date.now() - inicio };
    mensajes.push(m);
    for (const c of llamadas) {
      const nombre = c.function && c.function.name;
      let a = (c.function && c.function.arguments) || {};
      if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
      usadas.push(nombre + '(' + (a.ruta || a.texto || '') + ')');
      console.log('   [turno ' + t + '] ' + usadas.at(-1));
      mensajes.push({ role: 'tool', tool_name: nombre, content: usar(base, nombre, a) });
    }
  }
  return { ok: false, error: 'se quedo sin turnos', turnos, herramientas: usadas, modelo, ms: Date.now() - inicio };
}

async function atender() {
  const url = (opcion('ollama', process.env.OLLAMA_HOST || 'http://localhost:11434')).replace(/\/$/, '').replace(/^(?!http)/, 'http://');
  let modelo = opcion('modelo', process.env.MODELO_LOCAL || null);
  fs.mkdirSync(PEDIDOS, { recursive: true });
  fs.mkdirSync(RESPUESTAS, { recursive: true });
  let modelos = [];
  try {
    modelos = ((await (await fetch(url + '/api/tags')).json()).models || []).map((m) => ({ nombre: m.name, gb: Math.round((m.size || 0) / 1e8) / 10, parametros: (m.details || {}).parameter_size || '' }));
  } catch (e) {
    console.error('No pude hablar con Ollama en ' + url + ' (' + e.message + '). ¿Esta abierto?');
    process.exit(1);
  }
  if (!modelos.length) { console.error('Ollama no tiene modelos. Probá: ollama pull qwen2.5-coder:7b'); process.exit(1); }
  if (!modelo) {
    // sin indicar: uno que sepa usar herramientas, si hay; si no, el primero
    const preferidos = [/qwen.*coder/, /qwen/, /devstral|codestral/, /llama3\.[1-9]/, /mistral|gemma3|phi4/];
    modelo = (preferidos.map((re) => modelos.find((m) => re.test(m.nombre))).find(Boolean) || modelos[0]).nombre;
  }
  console.log('Ayudante local prendido · modelo: ' + modelo + ' · Ollama: ' + url);
  console.log('Modelos: ' + modelos.map((m) => m.nombre).join(', '));
  console.log('Dejá esta ventana abierta. Ctrl+C para apagarlo.\n');
  const latir = (ocupado = null) => fs.writeFileSync(ESTADO, JSON.stringify({ latido: Date.now(), modelo, modelos, ocupado }, null, 1));
  latir();
  // respuestas viejas: se limpian al arrancar
  for (const f of fs.readdirSync(RESPUESTAS)) if (Date.now() - fs.statSync(path.join(RESPUESTAS, f)).mtimeMs > 3600000) fs.rmSync(path.join(RESPUESTAS, f), { force: true });
  for (;;) {
    const cola = fs.readdirSync(PEDIDOS).filter((f) => f.endsWith('.json')).sort();
    if (!cola.length) { latir(); await dormir(1000); continue; }
    const archivo = path.join(PEDIDOS, cola[0]);
    const pedido = leerJson(archivo);
    fs.rmSync(archivo, { force: true });
    if (!pedido || !pedido.id || !pedido.tarea) continue;
    console.log('→ ' + pedido.tarea.slice(0, 100));
    latir(pedido.id);
    const pulso = setInterval(() => latir(pedido.id), 5000); // una respuesta larga no tiene que parecer apagado
    let r;
    try { r = await resolver(url, modelo, pedido); } catch (e) { r = { ok: false, error: e.message, turnos: 0, herramientas: [], modelo: pedido.modelo || modelo, ms: 0 }; }
    clearInterval(pulso);
    const tmp = path.join(RESPUESTAS, pedido.id + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(r));
    fs.renameSync(tmp, path.join(RESPUESTAS, pedido.id + '.json'));
    console.log((r.ok ? '✓ ' : '✗ ' + r.error + ' · ') + Math.round(r.ms / 1000) + ' s\n');
  }
}

if (args[0] === 'pedir') await pedir();
else await atender();
