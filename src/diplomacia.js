// Política y diplomacia (paso 10, primera versión):
//   relaciones entre países (-100 a 100), tensión mundial, justificación de guerra,
//   voluntad nacional, alto el fuego y paz, mediación de terceros,
//   árbol nacional (decisiones con días, requisitos y efectos) y eventos con fecha.
// La coherencia vale para todos: ni el jugador ni la IA declaran la guerra sin motivo.

import { datos, nombrePais } from './datos.js';
import {
  ejercito, enGuerra, enemigosDe, declararGuerra as abrirGuerra, mensaje, avisar,
} from './ejercito.js';
import { economiaDe } from './economia.js';
import { recibirAviones } from './aviacion.js';
import { disenador, fijarTanque } from './disenador.js';
import { tiempo, fechaLocal } from './tiempo.js';
import { operaciones } from './operaciones.js';

export const diplomacia = {
  relaciones: {}, // "A|B" -> valor
  tension: 30,
  voluntad: {}, // país -> 0..100
  justificaciones: [], // {de, contra, horas, lista}
  reclamos: [], // {de, a, provincias, nombre}
  arbol: { hechos: [], enCurso: {} }, // enCurso: rama -> {id, horas}
  eventosVistos: [],
  inicioGuerra: {}, // "A|B" -> horas
  provinciasPerdidas: {}, // país -> cantidad
  acuerdos: [], // {tipo: 'comercio'|'no_agresion'|'alianza', a, b, desde}
  mejorando: [], // {de, con, horas}
  ultimaDenuncia: {}, // país -> horas
};
const RP = () => datos.reglas.diplomacia;
const clave = (a, b) => [a, b].sort().join('|');
const limitar = (x, a, b) => Math.max(a, Math.min(b, x));

export function iniciarDiplomacia() {
  const d = datos.diplomacia;
  diplomacia.relaciones = { ...(d.relaciones ?? {}) };
  for (const k of Object.keys(diplomacia.relaciones)) {
    const [a, b] = k.split('|');
    if (clave(a, b) !== k) { diplomacia.relaciones[clave(a, b)] = diplomacia.relaciones[k]; delete diplomacia.relaciones[k]; }
  }
  diplomacia.tension = d.tension_inicial ?? 25;
  diplomacia.reclamos = structuredClone(d.reclamos ?? []);
  diplomacia.voluntad = {};
  for (const p of new Set(datos.duenos)) diplomacia.voluntad[p] = d.voluntad?.[p] ?? RP().voluntad.inicial;
  diplomacia.justificaciones = [];
  diplomacia.arbol = { hechos: [], enCurso: {} };
  diplomacia.eventosVistos = [];
  diplomacia.inicioGuerra = {};
  diplomacia.provinciasPerdidas = {};
  diplomacia.acuerdos = structuredClone(d.acuerdos ?? []);
  diplomacia.mejorando = [];
  diplomacia.ultimaDenuncia = {};
  if (!escuchando) {
    datos.eventos.addEventListener('dueno', (e) => alCambiarDueno(e.detail));
    escuchando = true;
  }
}
let escuchando = false;

// ------------------------------------------------------------------ relaciones

export function relacion(a, b) {
  if (a === b) return 100;
  return diplomacia.relaciones[clave(a, b)] ?? datos.diplomacia.por_defecto ?? 0;
}

export function cambiarRelacion(a, b, delta) {
  if (a === b) return;
  diplomacia.relaciones[clave(a, b)] = limitar(relacion(a, b) + delta, -100, 100);
}

export function cambiarTension(delta) {
  diplomacia.tension = limitar(diplomacia.tension + delta, 0, 100);
}

export const tieneReclamo = (de, contra) => diplomacia.reclamos.some((r) => r.de === de && r.a === contra);
export const reclamosDe = (pais) => diplomacia.reclamos.filter((r) => r.de === pais || r.a === pais);

// ------------------------------------------------------------------ justificación de guerra

export function justificacion(de, contra) {
  return diplomacia.justificaciones.find((j) => j.de === de && j.contra === contra) ?? null;
}

export const tieneJustificacion = (de, contra) => justificacion(de, contra)?.lista === true;

export function diasJustificacion(de, contra) {
  return tieneReclamo(de, contra) ? RP().dias_justificacion_con_reclamo : RP().dias_justificacion;
}

export function fabricarJustificacion(de, contra) {
  if (enGuerra(de, contra)) return 'Ya están en guerra.';
  if (tieneAcuerdo(de, contra, 'no_agresion') || tieneAcuerdo(de, contra, 'alianza')) return `Hay un ${tieneAcuerdo(de, contra, 'alianza') ? 'alianza' : 'pacto de no agresión'} con ${nombrePais(contra)}: primero hay que romperlo.`;
  if (justificacion(de, contra)) return 'Ya hay una justificación en marcha o lista.';
  const dias = diasJustificacion(de, contra);
  diplomacia.justificaciones.push({ de, contra, horas: dias * 24, lista: false });
  cambiarTension(RP().tension_por_justificacion);
  cambiarRelacion(de, contra, -10);
  const j = datos.escenario.pais_jugador;
  if (contra === j) {
    mensaje(`Según fuentes diplomáticas, el gobierno de ${nombrePais(de)} prepara reclamos y argumentos para justificar una guerra contra nuestro país. Tendría listo el pretexto en unos ${dias} días.`, 'malo', j, {
      seccion: 'Diplomacia', titular: `${nombrePais(de)} busca un pretexto para la guerra`, bajada: 'La Cancillería pide prudencia, pero las Fuerzas Armadas toman nota.',
    });
  } else if (de === j) mensaje(`Se empieza a fabricar una justificación contra ${nombrePais(contra)} (${dias} días).`, 'info', j, 'aviso');
  avisar('diplomacia');
  return null;
}

function darJustificacion(de, contra) {
  const j = justificacion(de, contra);
  if (j) { j.lista = true; j.horas = 0; } else diplomacia.justificaciones.push({ de, contra, horas: 0, lista: true });
}

export function puedeDeclarar(de, contra) {
  if (de === contra) return 'No.';
  if (enGuerra(de, contra)) return 'Ya están en guerra.';
  if (tieneAcuerdo(de, contra, 'no_agresion') || tieneAcuerdo(de, contra, 'alianza')) return `Hay un acuerdo con ${nombrePais(contra)} que lo impide.`;
  if (!tieneJustificacion(de, contra)) return `Hace falta una justificación de guerra contra ${nombrePais(contra)}.`;
  return null;
}

export function declararGuerra(de, contra) {
  const e = puedeDeclarar(de, contra);
  if (e) return e;
  abrirGuerra(de, contra);
  diplomacia.inicioGuerra[clave(de, contra)] = tiempo.horas;
  diplomacia.justificaciones = diplomacia.justificaciones.filter((j) => !(j.de === de && j.contra === contra));
  cambiarTension(RP().tension_por_guerra);
  const conReclamo = tieneReclamo(de, contra);
  for (const p of new Set(datos.duenos)) {
    if (p === de || p === contra) continue;
    cambiarRelacion(p, de, conReclamo ? RP().relacion_terceros_por_guerra_con_reclamo : RP().relacion_terceros_por_guerra);
  }
  cambiarRelacion(de, contra, -40);
  // El atacado se defiende con más ganas.
  diplomacia.voluntad[contra] = limitar((diplomacia.voluntad[contra] ?? 60) + 8, 0, 100);
  // Los aliados del atacado entran en la guerra.
  for (const aliado of aliadosDe(contra)) {
    if (aliado === de || enGuerra(aliado, de)) continue;
    abrirGuerra(aliado, de);
    diplomacia.inicioGuerra[clave(aliado, de)] = tiempo.horas;
  }
  avisar('diplomacia');
  return null;
}

// ------------------------------------------------------------------ acciones diplomáticas

const RA = () => RP().acciones;
export const acuerdoEntre = (a, b, tipo) => diplomacia.acuerdos.find((x) => x.tipo === tipo && clave(x.a, x.b) === clave(a, b));
export const tieneAcuerdo = (a, b, tipo) => !!acuerdoEntre(a, b, tipo);
export const acuerdosDe = (pais) => diplomacia.acuerdos.filter((x) => x.a === pais || x.b === pais);
export const aliadosDe = (pais) => acuerdosDe(pais).filter((x) => x.tipo === 'alianza').map((x) => (x.a === pais ? x.b : x.a));
export const mejorandoCon = (de, con) => diplomacia.mejorando.find((m) => m.de === de && m.con === con);

// Qué tan dispuesto está 'pais' a firmar con 'de': devuelve null si acepta o el motivo si no.
export function rechazoAcuerdo(pais, de, tipo) {
  const r = RA()[tipo];
  if (enGuerra(pais, de)) return 'Están en guerra.';
  if (tieneAcuerdo(pais, de, tipo)) return 'Ya hay un acuerdo así.';
  if (relacion(pais, de) < r.relacion_minima) return `${nombrePais(pais)} no acepta: hace falta relación ${r.relacion_minima > 0 ? '+' : ''}${r.relacion_minima} o más.`;
  if (tipo !== 'comercio' && (justificacion(pais, de) || justificacion(de, pais))) return 'Hay una justificación de guerra de por medio.';
  if (tipo === 'alianza' && enemigosDe(pais).some((x) => !enGuerra(de, x))) return `${nombrePais(pais)} está en guerra y quiere aliados que ya peleen a su lado.`;
  return null;
}

export function proponerAcuerdo(de, con, tipo) {
  const no = rechazoAcuerdo(con, de, tipo);
  if (no) return no;
  diplomacia.acuerdos.push({ tipo, a: de, b: con, desde: tiempo.horas });
  if (RA()[tipo].tension) cambiarTension(RA()[tipo].tension);
  cambiarRelacion(de, con, 5);
  const nombre = RA()[tipo].nombre;
  const j = datos.escenario.pais_jugador;
  if (tipo === 'comercio') mensaje(`${nombre} con ${nombrePais(con)}.`, 'bueno', j, 'aviso');
  else mensaje(`${nombrePais(de)} y ${nombrePais(con)} firmaron un ${nombre.toLowerCase()}.${tipo === 'alianza' ? ' Si uno es atacado, el otro entra en la guerra.' : ' Ninguno puede declararle la guerra al otro mientras dure.'}`, 'bueno', null, {
    seccion: 'Diplomacia', titular: tipo === 'alianza' ? `Alianza entre ${nombrePais(de)} y ${nombrePais(con)}` : `Pacto de no agresión con ${nombrePais(de === j ? con : de)}`,
    bajada: tipo === 'alianza' ? 'Los dos gobiernos se comprometen a defenderse mutuamente.' : 'Las cancillerías celebran el entendimiento.',
  });
  avisar('diplomacia');
  return null;
}

export function romperAcuerdo(de, con, tipo) {
  const x = acuerdoEntre(de, con, tipo);
  if (!x) return 'No hay acuerdo.';
  diplomacia.acuerdos = diplomacia.acuerdos.filter((y) => y !== x);
  cambiarRelacion(de, con, RA().romper.relacion);
  if (tipo !== 'comercio') cambiarTension(RA().romper.tension);
  mensaje(`Se rompió el ${RA()[tipo].nombre.toLowerCase()} con ${nombrePais(con)}.`, 'malo', datos.escenario.pais_jugador, 'aviso');
  avisar('diplomacia');
  return null;
}

export function mejorarRelaciones(de, con) {
  if (mejorandoCon(de, con)) { diplomacia.mejorando = diplomacia.mejorando.filter((m) => !(m.de === de && m.con === con)); avisar('diplomacia'); return null; }
  if (enGuerra(de, con)) return 'Están en guerra.';
  if (diplomacia.mejorando.filter((m) => m.de === de).length >= RA().mejorar.simultaneas) return `Como mucho ${RA().mejorar.simultaneas} misiones diplomáticas a la vez.`;
  diplomacia.mejorando.push({ de, con, horas: RA().mejorar.dias * 24 });
  avisar('diplomacia');
  return null;
}

export function enviarAyuda(de, con) {
  const r = RA().ayuda;
  const e = economiaDe(de);
  if (!e) return 'Sin economía.';
  if (enGuerra(de, con)) return 'Están en guerra.';
  if (e.fondosMilitares < r.fondos) return `Hacen falta ${r.fondos} millones de fondos militares.`;
  e.fondosMilitares -= r.fondos;
  const otro = economiaDe(con);
  if (otro) otro.equipo += r.equipo;
  cambiarRelacion(de, con, r.relacion);
  mensaje(`Se mandó ayuda militar a ${nombrePais(con)}: ${r.equipo} juegos de equipo.`, 'bueno', de, 'aviso');
  avisar('diplomacia');
  avisar('economia');
  return null;
}

export const diasParaDenunciar = (de) => Math.max(0, Math.ceil(((diplomacia.ultimaDenuncia[de] ?? -1e9) + RA().onu.dias_espera * 24 - tiempo.horas) / 24));

export function denunciarOnu(de, contra) {
  const r = RA().onu;
  if (diasParaDenunciar(de) > 0) return `Hay que esperar ${diasParaDenunciar(de)} días para otra denuncia.`;
  diplomacia.ultimaDenuncia[de] = tiempo.horas;
  cambiarTension(r.tension);
  cambiarRelacion(de, contra, r.relacion);
  for (const p of new Set(datos.duenos)) if (p !== de && p !== contra) cambiarRelacion(p, contra, r.relacion_terceros);
  if (enemigosDe(contra).length) cambiarVoluntad(contra, r.voluntad_enemiga);
  mensaje(`Ante la Asamblea General, ${nombrePais(de)} denunció a ${nombrePais(contra)}. Varios países expresaron su preocupación y ${nombrePais(contra)} queda más aislado.`, 'info', de, {
    seccion: 'Internacionales', titular: `${nombrePais(de)} denuncia a ${nombrePais(contra)} en la ONU`, bajada: 'Debate encendido en Nueva York.',
  });
  avisar('diplomacia');
  return null;
}

function actualizarDiaAcuerdos() {
  const r = RA();
  for (const m of diplomacia.mejorando) {
    m.horas -= 24;
    cambiarRelacion(m.de, m.con, r.mejorar.por_dia);
  }
  diplomacia.mejorando = diplomacia.mejorando.filter((m) => m.horas > 0 && !enGuerra(m.de, m.con));
  for (const x of diplomacia.acuerdos) {
    if (x.tipo !== 'comercio') continue;
    for (const p of [x.a, x.b]) { const e = economiaDe(p); if (e) e.divisas += r.comercio.divisas_por_dia; }
    if (Math.round((tiempo.horas - x.desde) / 24) % 30 === 0) cambiarRelacion(x.a, x.b, r.comercio.relacion_por_mes);
  }
  // Una guerra entre dos países rompe sus acuerdos.
  diplomacia.acuerdos = diplomacia.acuerdos.filter((x) => !enGuerra(x.a, x.b));
}

// ------------------------------------------------------------------ voluntad, paz y mediación

export function voluntad(pais) {
  return diplomacia.voluntad[pais] ?? RP().voluntad.inicial;
}

function cambiarVoluntad(pais, delta) {
  diplomacia.voluntad[pais] = limitar(voluntad(pais) + delta, 0, 100);
}

function alCambiarDueno(provincia) {
  const nuevo = datos.duenos[provincia];
  const original = datos.provincias[provincia].pais;
  if (nuevo !== original) {
    cambiarVoluntad(original, RP().voluntad.por_provincia_perdida);
    cambiarVoluntad(nuevo, RP().voluntad.por_provincia_ganada);
  }
}

export function sumarBajasVoluntad(pais, bajas) {
  cambiarVoluntad(pais, (bajas / 1000) * RP().voluntad.por_cada_1000_bajas);
}

// Puntaje de la guerra para 'pais' contra 'enemigo': provincias ocupadas de cada lado.
export function puntajeGuerra(pais, enemigo) {
  let favor = 0;
  let contra = 0;
  datos.provincias.forEach((p, i) => {
    if (p.pais === enemigo && datos.duenos[i] === pais) favor += 1 + p.area_km2 / 100000;
    if (p.pais === pais && datos.duenos[i] === enemigo) contra += 1 + p.area_km2 / 100000;
  });
  return favor - contra;
}

// ¿Acepta 'pais' la propuesta? tipo: 'alto_el_fuego' (cada uno se queda con lo que tiene)
// o 'cesion' (las provincias ocupadas pasan al que las ocupa).
export function aceptaPaz(pais, proponente, tipo) {
  const v = voluntad(pais);
  const puntaje = puntajeGuerra(pais, proponente);
  if (tipo === 'alto_el_fuego') return v < RP().paz.alto_el_fuego_voluntad || puntaje > 0 || (v < 70 && puntaje >= 0);
  return v < RP().paz.cesion_voluntad || puntaje < -3;
}

export function firmarPaz(a, b, tipo) {
  if (!enGuerra(a, b)) return;
  ejercito.guerras.delete(clave(a, b));
  delete diplomacia.inicioGuerra[clave(a, b)];
  // Terminan las operaciones entre los dos
  for (const op of operaciones.lista) {
    if (op.estado !== 'terminada' && ((op.pais === a && op.enemigo === b) || (op.pais === b && op.enemigo === a))) {
      op.estado = 'terminada';
      for (const id of [...op.fuerzas, ...op.reservas]) {
        const br = ejercito.brigadas.find((x) => x.id === id);
        if (br) { br.operacion = null; br.mov = null; }
      }
    }
  }
  datos.provincias.forEach((p, i) => {
    const ocupada = datos.duenos[i] !== p.pais && (datos.duenos[i] === a || datos.duenos[i] === b);
    if (!ocupada) return;
    if (tipo === 'cesion') {
      p.pais = datos.duenos[i]; // pasa a ser territorio propio del que la ocupa
      diplomacia.reclamos.push({ de: datos.provincias[i].pais === a ? b : a, a: p.pais, provincias: [p.id], nombre: p.nombre });
    }
  });
  // Tropas que quedaron en territorio del otro vuelven a casa
  for (const br of ejercito.brigadas) {
    const d = datos.duenos[br.provincia];
    if ((br.pais === a && d === b) || (br.pais === b && d === a)) {
      const casa = datos.provincias[br.provincia].conexiones.find((c) => datos.duenos[c.j] === br.pais);
      if (casa) br.provincia = casa.j;
    }
  }
  cambiarTension(-8);
  cambiarRelacion(a, b, 15);
  const nos = a === datos.escenario.pais_jugador || b === datos.escenario.pais_jugador;
  mensaje(`${nombrePais(a)} y ${nombrePais(b)} firmaron la paz. ${tipo === 'cesion' ? 'Las provincias ocupadas pasan a manos de quien las tiene.' : 'Se acordó un alto el fuego: cada uno se queda con lo que tiene.'}`, 'bueno', null, {
    seccion: nos ? 'Última hora' : 'Internacionales', titular: nos ? '¡Paz!' : `Paz entre ${nombrePais(a)} y ${nombrePais(b)}`,
    bajada: tipo === 'cesion' ? 'Se firmó un tratado con cesión de territorios.' : 'Callan las armas: rige el alto el fuego.',
  });
  avisar('cambio');
  avisar('diplomacia');
}

export function proponerPaz(de, a, tipo) {
  if (!enGuerra(de, a)) return 'No están en guerra.';
  if (aceptaPaz(a, de, tipo)) {
    firmarPaz(de, a, tipo);
    return null;
  }
  cambiarRelacion(de, a, -2);
  return `${nombrePais(a)} rechaza la propuesta (voluntad ${Math.round(voluntad(a))} %).`;
}

// ------------------------------------------------------------------ efectos (árbol y eventos)

export function aplicarEfectos(pais, ef) {
  if (!ef) return;
  const e = economiaDe(pais);
  if (ef.justificacion) darJustificacion(pais, ef.justificacion);
  if (ef.relacion) for (const [p, d] of Object.entries(ef.relacion)) cambiarRelacion(pais, p, d);
  if (ef.tension) cambiarTension(ef.tension);
  if (ef.estabilidad && e) e.estabilidad = limitar(e.estabilidad + ef.estabilidad, 0, 100);
  if (ef.voluntad) cambiarVoluntad(pais, ef.voluntad);
  if (ef.entrenamiento) for (const b of ejercito.brigadas) if (b.pais === pais) b.entrenamiento = Math.min(1, b.entrenamiento + ef.entrenamiento);
  if (ef.equipo && e) e.equipo += ef.equipo;
  if (ef.divisas && e) e.divisas += ef.divisas;
  if (ef.mano_de_obra) ejercito.manoDeObra[pais] = (ejercito.manoDeObra[pais] ?? 0) + ef.mano_de_obra;
  if (ef.puntos_diseno) disenador.puntosExtra[pais] = (disenador.puntosExtra[pais] ?? 0) + ef.puntos_diseno;
  if (ef.aviones) recibirAviones(pais, ef.aviones.modelo, ef.aviones.cantidad);
  if (ef.tanque) fijarTanque(pais, ef.tanque);
  if (ef.sector && e) for (const [s, d] of Object.entries(ef.sector)) e.sectores[s] = Math.min(10, e.sectores[s] + d);
  if (ef.fin_reclamo) diplomacia.reclamos = diplomacia.reclamos.filter((r) => !(r.de === pais && r.a === ef.fin_reclamo));
  if (ef.nodo && !diplomacia.arbol.hechos.includes(ef.nodo)) diplomacia.arbol.hechos.push(ef.nodo);
}

// ------------------------------------------------------------------ árbol nacional

export function estadoNodo(n) {
  const a = diplomacia.arbol;
  if (a.hechos.includes(n.id)) return 'hecho';
  if (Object.values(a.enCurso).some((c) => c.id === n.id)) return 'curso';
  if ((n.excluye ?? []).some((x) => a.hechos.includes(x) || Object.values(a.enCurso).some((c) => c.id === x))) return 'bloqueado';
  if (!(n.requiere ?? []).every((x) => a.hechos.includes(x))) return 'bloqueado';
  return 'disponible';
}

export function empezarNodo(id) {
  const n = datos.arbol?.nodos.find((x) => x.id === id);
  if (!n) return 'No existe.';
  if (estadoNodo(n) !== 'disponible') return 'No está disponible.';
  if (diplomacia.arbol.enCurso[n.rama]) return 'Ya hay una decisión en curso en esa rama.';
  diplomacia.arbol.enCurso[n.rama] = { id: n.id, horas: n.dias * 24, total: n.dias * 24 };
  mensaje(`Empieza: ${n.nombre} (${n.dias} días).`, 'info', datos.arbol.pais);
  avisar('diplomacia');
  return null;
}

// ------------------------------------------------------------------ paso del tiempo

export function actualizarHoraDiplomacia() {
  for (const j of diplomacia.justificaciones) {
    if (j.lista) continue;
    j.horas--;
    if (j.horas <= 0) {
      j.lista = true;
      const jug = datos.escenario.pais_jugador;
      if (j.de === jug) mensaje(`La justificación contra ${nombrePais(j.contra)} está lista. Desde el panel de ese país se puede declarar la guerra.`, 'bueno', jug, { seccion: 'Política', titular: `Listos los argumentos contra ${nombrePais(j.contra)}`, bajada: 'El gobierno ya puede pedir la declaración de guerra.' });
      else if (j.contra === jug) mensaje(`${nombrePais(j.de)} completó su justificación de guerra contra nuestro país: puede atacar en cualquier momento.`, 'malo', jug, { seccion: 'Diplomacia', titular: `${nombrePais(j.de)}, lista para atacar`, bajada: 'Ya tiene el pretexto para declararnos la guerra.' });
      avisar('diplomacia');
    }
  }
  const a = diplomacia.arbol;
  for (const [rama, c] of Object.entries(a.enCurso)) {
    c.horas--;
    if (c.horas > 0) continue;
    delete a.enCurso[rama];
    const n = datos.arbol.nodos.find((x) => x.id === c.id);
    a.hechos.push(n.id);
    aplicarEfectos(datos.arbol.pais, n.efectos);
    mensaje(`Listo: ${n.nombre}.`, 'bueno', datos.arbol.pais);
    avisar('diplomacia');
    avisar('cambio');
  }
}

export function actualizarDiaDiplomacia() {
  const rp = RP();
  // Voluntad: la guerra cansa; defender el propio suelo da fuerzas.
  for (const p of Object.keys(diplomacia.voluntad)) {
    const enemigos = enemigosDe(p);
    if (!enemigos.length) { cambiarVoluntad(p, 0.05); continue; }
    cambiarVoluntad(p, rp.voluntad.por_dia_de_guerra);
    if (datos.provincias.some((pr, i) => pr.pais === p && datos.duenos[i] !== p)) cambiarVoluntad(p, rp.voluntad.defensa_propia);
  }
  if (!ejercito.guerras.size) cambiarTension(-rp.tension_baja_por_dia);
  actualizarDiaAcuerdos();
  // Mediación: con mucha tensión, un tercero (el Papa, la ONU) ofrece mediar
  if (diplomacia.tension >= rp.mediacion.tension_minima && Math.random() < rp.mediacion.probabilidad_por_dia) {
    const jugador = datos.escenario.pais_jugador;
    const enemigo = enemigosDe(jugador)[0];
    if (enemigo) avisar('mediacion', { a: jugador, b: enemigo });
  }
  // Eventos con fecha
  const hoy = fechaLocal().toISOString().slice(0, 10);
  for (const ev of datos.eventosEscenario) {
    if (diplomacia.eventosVistos.includes(ev.id) || ev.fecha > hoy) continue;
    if (ev.requiere_nodo && !diplomacia.arbol.hechos.includes(ev.requiere_nodo)) continue;
    diplomacia.eventosVistos.push(ev.id);
    if (ev.pais === datos.escenario.pais_jugador) avisar('evento', ev);
    else aplicarEfectos(ev.pais, ev.opciones[0].efectos);
  }
}

export function elegirOpcionEvento(ev, k) {
  aplicarEfectos(ev.pais, ev.opciones[k].efectos);
  avisar('diplomacia');
  avisar('cambio');
}

