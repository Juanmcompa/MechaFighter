// Hoja de servicio: lee el registro de una batalla y saca los momentos que vale la pena recordar de cada piloto
// (su primera baja, a quien salvo, cuando huyo, como cayo). Son los que despues cuenta el hangar y el memorial.
// No cambia nada del combate: solo mira lo que paso.

const MAX_MOMENTOS = 12;

// pilotosPorRef: Map id de piloto -> piloto (como estaba ANTES de la mision). Devuelve:
//   { momentos: Map ref -> [texto], caida: Map ref -> texto }
export function momentosDeMision(registro, mision, sector, pilotosPorRef) {
  const ficha = new Map();       // id de unidad -> ficha
  const vida = new Map();        // id de unidad -> vida actual
  const ultimaAnulacion = new Map();
  const momentos = new Map();
  const caida = new Map();
  const bajas = new Map();
  const yaDijo = new Set();
  const donde = mision.nombre + ' (sector ' + sector + ')';

  const ref = (id) => { const f = ficha.get(id); return f && f.bando === 0 && f.tipo === 'piloto' ? f.ref : null; };
  const nombre = (id) => (ficha.get(id) || {}).nombre || 'alguien';
  const anotar = (r, texto, unaVez = null) => {
    if (!r) return;
    if (unaVez) { if (yaDijo.has(r + unaVez)) return; yaDijo.add(r + unaVez); }
    if (!momentos.has(r)) momentos.set(r, []);
    momentos.get(r).push(texto);
  };

  for (const e of registro) {
    switch (e.tipo) {
      case 'aparece': ficha.set(e.u, e.ficha); vida.set(e.u, e.ficha.vida ?? e.ficha.vidaMax); break;
      case 'dispara': if (e.acierta) vida.set(e.o, (vida.get(e.o) || 0) - e.danio); break;
      case 'esquirla': vida.set(e.u, (vida.get(e.u) || 0) - e.danio); break;
      case 'vida': vida.set(e.u, e.vida); break;
      case 'repara': {
        const antes = e.vida - e.cant;
        const f = ficha.get(e.o);
        if (f && f.bando === 0 && antes < f.vidaMax * 0.25) anotar(ref(e.u), 'Salvó a ' + f.nombre + ' cuando estaba por caer, en ' + donde + '.', 'salvo' + e.o);
        vida.set(e.o, e.vida);
        break;
      }
      case 'anula': {
        ultimaAnulacion.set(e.u, { motivo: e.motivo, t: e.t });
        const r = ref(e.u);
        if (e.motivo === 'huye_en_panico') anotar(r, 'Huyó en pánico en ' + donde + '.', 'huyo');
        if (e.motivo === 'se_quiebra') anotar(r, 'Se quebró bajo el fuego en ' + donde + '.', 'quebro');
        if (e.motivo === 'corre_a_cubrir') {
          const p = pilotosPorRef.get(r);
          const v = p && p.vinculo ? pilotosPorRef.get(p.vinculo) : null;
          anotar(r, 'Corrió a cubrir a ' + (v ? v.apodo : 'un compañero') + ' en ' + donde + '.', 'cubrio');
        }
        break;
      }
      case 'muere': {
        const asesino = e.por ? ref(e.por) : null;
        const victima = ficha.get(e.u);
        if (asesino) {
          bajas.set(asesino, (bajas.get(asesino) || 0) + 1);
          const p = pilotosPorRef.get(asesino);
          if (p && (p.bajas || 0) === 0 && bajas.get(asesino) === 1) anotar(asesino, 'Primera baja: un ' + victima.nombre + ', en ' + donde + '.');
          if (victima.rol === 'lider') anotar(asesino, 'Derribó al líder enemigo en ' + donde + '.');
        }
        const r = ref(e.u);
        if (r) {
          // como cayo: lo ultimo que estaba haciendo cuenta la historia
          const ua = ultimaAnulacion.get(e.u);
          const reciente = ua && e.t - ua.t < 40 ? ua.motivo : null;
          const quien = e.por ? nombre(e.por) : null;
          let texto;
          if (reciente === 'corre_a_cubrir') {
            const p = pilotosPorRef.get(r);
            const v = p && p.vinculo ? pilotosPorRef.get(p.vinculo) : null;
            texto = 'Cayó corriendo a cubrir a ' + (v ? v.apodo : 'un compañero');
          } else if (reciente === 'huye_en_panico') texto = 'Cayó tratando de escapar';
          else if (reciente === 'abre_paso') texto = 'Cayó abriéndole paso al transporte';
          else texto = quien ? 'Cayó ante un ' + quien : 'Cayó en combate';
          caida.set(r, texto + ', en ' + donde + '.');
        }
        break;
      }
    }
  }
  for (const [r, n] of bajas) if (n >= 3) anotar(r, 'Bajó ' + n + ' enemigos en ' + donde + '.');
  return { momentos, caida };
}

// Suma los momentos nuevos a la hoja del piloto, sin pasarse del maximo (se van los mas viejos,
// pero la primera baja queda siempre: es la que se recuerda).
export function sumarAHoja(piloto, textos) {
  piloto.hoja = (piloto.hoja || []).concat(textos);
  while (piloto.hoja.length > MAX_MOMENTOS) {
    const i = piloto.hoja.findIndex((t) => !t.startsWith('Primera baja'));
    piloto.hoja.splice(i < 0 ? 0 : i, 1);
  }
}
