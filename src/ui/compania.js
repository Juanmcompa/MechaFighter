// La compania: todo el progreso junto. Renombre, numeros de la campana, la nodriza, lo que cambiaste en cada sector,
// como te ve cada bando y los nemesis que siguen vivos (y por que te buscan).
import { h, montar, ico, botonIcono, barraJuego, retrato } from './comun.js';
import { quien, escalonDe, textoReputacion, nivelModulo } from '../campana/brujula.js';
import { activos } from '../campana/nemesis.js';
import { barraFrente } from './sectores.js';

export function compania(app, raiz) {
  const { datos } = app;
  const p = app.partida;
  const st = p.stats || {};
  // renombre: el escalon segun el puntaje, y cuanto falta para el siguiente
  const E = datos.bandos.renombre.escalones;
  let k = 0;
  E.forEach((e, i) => { if (p.puntaje >= e.desde) k = i; });
  const sig = E[k + 1];
  const pct = sig ? Math.round(((p.puntaje - E[k].desde) * 100) / (sig.desde - E[k].desde)) : 100;
  const cerrados = p.sectores.filter((s) => s && s.cerrado).length;
  const mejoras = Object.entries(datos.nodriza.modulos).reduce((t, [id, m]) => t + Math.max(0, nivelModulo(datos, p, id) - m.inicial), 0);
  const posibles = Object.values(datos.nodriza.modulos).reduce((t, m) => t + m.niveles.length - 1 - m.inicial, 0);
  const numero = (n, t, clase = '') => h('div', { class: 'cp-num ' + clase }, h('strong', {}, String(n)), h('small', {}, t));

  // los sectores: los cerrados (quien gano), el actual (el frente) y el que sigue (sin explorar)
  const sectores = p.sectores.map((s, i) => {
    if (!s) return null;
    if (s.cerrado) {
      const g = quien(datos, s.ganador);
      const amiga = g && !g.neutral && ['confiable', 'aliada'].includes(escalonDe(datos, p, s.ganador).id);
      return h('div', { class: 'cp-sector' },
        h('div', { class: 'cp-fila' }, h('strong', {}, s.nombre), amiga ? h('span', { class: 'cp-marca bien' }, 'ZONA AMIGA') : h('span', { class: 'cp-marca' }, 'CERRADO')),
        barraFrente(datos, s, true),
        h('small', {}, (g ? 'Quedó para ' + g.nombre + '. ' : '') + 'Cayó ' + s.jefe + '.'));
    }
    if (i === p.sector) {
      return h('div', { class: 'cp-sector actual' },
        h('div', { class: 'cp-fila' }, h('strong', {}, s.nombre), h('span', { class: 'cp-marca bien' }, 'ACÁ ESTÁS')),
        barraFrente(datos, s, true),
        h('small', {}, s.bandos.map((b) => quien(datos, b).corto + ' ' + s.frente[b] + '%').join(' · ') + ' · ' + s.saltos + ' saltos'));
    }
    return null;
  });
  const def = datos.sectores.campana_base.sectores_def;
  const siguiente = def[(p.sector + 1) % def.length].nombre;

  // los bandos que ya conociste
  const conocidos = [...new Set(p.sectores.filter(Boolean).flatMap((s) => s.bandos || []))];
  const nemesis = activos(p);

  montar(raiz, h('div', { class: 'cp' },
    h('header', { class: 'br-cabeza' },
      botonIcono('atras', 'Volver al escuadrón', () => app.ir('hangar'), 'hg-volver'),
      h('div', { class: 'br-titulo' }, h('small', {}, 'COMPAÑÍA · ' + p.misionesJugadas + ' MISIONES'), h('h1', {}, p.nombreEscuadron || 'La compañía'))),
    h('section', { class: 'cp-renombre', 'aria-label': 'Renombre' },
      h('div', { class: 'cp-fila' }, h('small', {}, 'RENOMBRE'), h('strong', {}, E[k].nombre), sig ? h('em', {}, '→ ' + sig.nombre) : null),
      h('span', { class: 'cp-barra', role: 'meter', 'aria-label': 'Renombre', 'aria-valuenow': pct, 'aria-valuemax': 100 }, h('i', { style: 'width:' + pct + '%' })),
      h('small', {}, 'Más renombre: contratos más grandes y los bandos te llaman primero. También te buscan más.')),
    h('div', { class: 'cp-nums' },
      numero(st.contratos || 0, 'contratos'), numero(cerrados, cerrados === 1 ? 'sector cerrado' : 'sectores cerrados', 'bien'), numero(p.caidos.length, 'caídos', 'mal'),
      numero(st.nidos || 0, 'nidos limpiados', 'violeta'), numero(st.focos || 0, 'focos contenidos', 'amarillo'), numero(p.puntaje, 'puntos', 'ambar')),
    h('button', { class: 'cp-nave', onclick: () => app.ir('nodriza', { desde: 'compania' }) }, ico('nave'),
      h('span', {}, h('strong', {}, 'Nodriza ' + (p.nombreNave || 'Caronte')), h('small', {}, mejoras + ' de ' + posibles + ' mejoras · ' + (p.restos || 0) + ' restos de nido')), h('em', {}, 'Ver ›')),
    h('small', { class: 'fr-rotulo' }, 'LO QUE CAMBIASTE'),
    ...sectores,
    h('div', { class: 'cp-sector futuro' }, h('div', { class: 'cp-fila' }, h('strong', {}, siguiente), h('span', { class: 'cp-marca' }, 'sin explorar'))),
    h('small', { class: 'fr-rotulo' }, 'CÓMO TE VEN'),
    h('div', { class: 'cp-reps' }, ...conocidos.map((b) => {
      const q = quien(datos, b);
      return h('span', { class: 'cp-rep', style: '--c:' + q.color + ';--f:' + q.fondo }, h('strong', {}, q.corto), h('small', { class: escalonDe(datos, p, b).id }, textoReputacion(datos, p, b)));
    })),
    p.rival ? h('small', { class: 'fr-rotulo' }, 'LA COMPETENCIA') : null,
    p.rival ? h('div', { class: 'cp-sector' }, h('div', { class: 'cp-fila' }, h('strong', {}, p.rival.nombre), h('span', { class: 'cp-marca' }, p.rival.fuerza >= 50 ? 'FUERTES' : p.rival.fuerza >= 20 ? 'CRECIENDO' : 'CHICOS')),
      h('small', {}, 'Se quedaron con ' + p.rival.contratos + ' contratos que dejaste vencer. Se cruzaron ' + p.rival.cruces + (p.rival.cruces === 1 ? ' vez' : ' veces') + ' (les ganaste ' + p.rival.ganados + ').' +
        ((p.stats || {}).desertores ? ' Tienen ' + p.stats.desertores + ' ex piloto' + (p.stats.desertores > 1 ? 's tuyos.' : ' tuyo.') : ''))) : null,
    h('small', { class: 'fr-rotulo' }, nemesis.length ? 'TE BUSCAN' : 'NADIE TE BUSCA (POR AHORA)'),
    ...nemesis.map((n) => h('div', { class: 'cp-nem' }, retrato(datos, n, 'retrato-mini'),
      h('span', {}, h('strong', {}, '«' + n.apodo + '»' + (n.origen === 'oficial' ? ' · ' + n.bandoNombre : n.origen === 'desertor' ? ' · ex piloto tuyo' : '')), h('small', {}, (n.objetivoApodo ? 'Busca a «' + n.objetivoApodo + '». ' : '') + (n.historia.slice(-1)[0] || ''))))),
    barraJuego(app, 'escuadron')));
}
