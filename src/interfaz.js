// Interfaz sobre el mapa: reloj, resumen del país, ficha de provincia, panel de tropas,
// planificador de Operaciones, decisiones entre fases y registro de eventos.
// Usa los elementos de index.html. Las acciones las resuelve principal.js.

import { datos, nombrePais } from './datos.js';
import {
  tiempo, SEGUNDOS_POR_DIA, alternarPausa, acelerar, frenar, fijarVelocidad,
  textoFecha, textoFechaCorta, textoHora, textoZona,
} from './tiempo.js';
import {
  ejercito, tipos, enGuerra, enemigosDe, brigadaPorId, cuerpoPorId, costoBrigada, puedeReclutar,
  leyDe, horasRestantes, relevarGeneral, calcularRuta,
} from './ejercito.js';
import {
  operaciones, operacionesActivas, ejesPosibles, brigadasDisponibles, calcularCalidad, predecir,
  reconocida, anchoFrente, POSTURAS, FASES,
} from './operaciones.js';
import { $, h, miles, dec, pct, chipPais, iconoUnidad } from './dom.js';
import { suministroEn, zona, NOMBRE_ZONA, provinciaApta, depositosDe, describirDeposito, capitalDe } from './suministro.js';
import { escuadronesDe, disponibles as avionesListos, enAlcance, modelo, blancosEn } from './aviacion.js';
import { actualizarBarra } from './panel_pais.js';

const TERRENO = { llanura: 'Llanura', ciudad: 'Ciudad', selva: 'Selva', 'montaña': 'Montaña' };

let acc = {}; // acciones de principal.js

export function iniciarInterfaz(acciones) {
  acc = acciones;
  $('escenario').textContent = datos.escenario.nombre;

  const barras = $('barras');
  SEGUNDOS_POR_DIA.forEach((seg, i) => {
    barras.append(h('button', {
      class: 'pip', type: 'button', style: `--alto:${6 + i * 3}px`,
      title: `Velocidad ${i + 1}: un día cada ${String(seg).replace('.', ',')} s`, 'aria-label': `Velocidad ${i + 1}`,
      onclick: () => fijarVelocidad(i + 1),
    }));
  });
  $('pausa').addEventListener('click', alternarPausa);
  $('mas').addEventListener('click', acelerar);
  $('menos').addEventListener('click', frenar);

  tiempo.eventos.addEventListener('hora', actualizarReloj);
  tiempo.eventos.addEventListener('estado', actualizarReloj);
  ejercito.eventos.addEventListener('mensaje', (e) => agregarMensaje(e.detail));
  ejercito.eventos.addEventListener('decision', (e) => { if (e.detail.pais === datos.escenario.pais_jugador) mostrarDecision(e.detail); });
  actualizarReloj();
  actualizarResumen();
}

const ICONO_SEGUIR = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z"/></svg>';
const ICONO_PAUSA = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.5h2.6v9H2.5zM6.9 1.5h2.6v9H6.9z"/></svg>';

export function actualizarReloj() {
  $('fecha').textContent = textoFechaCorta();
  $('fecha').title = textoFecha();
  $('hora').textContent = `${textoHora()} · ${textoZona()}`;
  const p = $('pausa');
  p.innerHTML = tiempo.pausado ? ICONO_SEGUIR : ICONO_PAUSA;
  p.setAttribute('aria-label', tiempo.pausado ? 'Seguir' : 'Pausa');
  p.title = `${tiempo.pausado ? 'Seguir' : 'Pausa'} (Espacio)`;
  $('reloj').classList.toggle('en-pausa', tiempo.pausado);
  [...$('barras').children].forEach((b, i) => b.classList.toggle('activa', i < tiempo.velocidad));
  $('velocidad').textContent = `Vel. ${tiempo.velocidad}`;
}

// ------------------------------------------------------------------ resumen del país

export function actualizarResumen() {
  const jugador = datos.escenario.pais_jugador;
  actualizarBarra();
  const ops = operacionesActivas(jugador);
  const lista = $('lista-operaciones');
  lista.hidden = !ops.length;
  lista.replaceChildren(...ops.map((op) => h('button', {
    type: 'button', class: `op ${op.estado === 'decision' ? 'espera' : ''}`,
    onclick: () => (op.estado === 'decision' ? mostrarDecision(op) : acc.centrarEn(op.objetivos[op.objetivoActual])),
  }, h('b', {}, datos.provincias[op.objetivos[op.objetivoActual]].nombre), ' ', estadoOperacion(op))));
}

function estadoOperacion(op) {
  if (op.estado === 'reuniendo') return 'reuniendo tropas';
  if (op.estado === 'preparando') return `preparación (${Math.ceil(op.horasPreparacion / 24)} d)`;
  if (op.estado === 'decision') return 'esperando tu orden';
  return FASES[op.fase].toLowerCase();
}

// ------------------------------------------------------------------ cursor

export function mostrarCursor(i, texto = null) {
  const el = $('cursor');
  if (i < 0 && !texto) { el.hidden = true; return; }
  el.textContent = texto ?? `${datos.provincias[i].nombre} · ${nombrePais(datos.duenos[i])}`;
  el.hidden = false;
}

export function mostrarModo(texto) {
  const el = $('modo');
  el.hidden = !texto;
  el.textContent = texto ?? '';
}

// ------------------------------------------------------------------ ficha de provincia

export function mostrarProvincia(i) {
  const ficha = $('ficha');
  if (i < 0) { ficha.hidden = true; return; }
  const jugador = datos.escenario.pais_jugador;
  const p = datos.provincias[i];
  const dueno = datos.duenos[i];
  const propia = dueno === jugador;
  const filas = [
    ['Terreno', `${TERRENO[p.terreno]} · frente de ${anchoFrente(i)} brigadas`],
    ['Costa', p.costera ? 'Sí' : 'No'],
  ];
  if (dueno !== p.pais) filas.unshift(['Ocupada', `Era de ${nombrePais(p.pais)}`]);
  const suministroAca = suministroEn(jugador, i);
  if (propia || suministroAca > 0) filas.push(['Tu suministro', `${NOMBRE_ZONA[zona(suministroAca)]} (${pct(suministroAca)})`]);
  if (p.tren) filas.push(['Tren', 'Sí']);
  const deposito = depositosDe(jugador).find((d) => d.provincia === i);
  if (deposito) filas.push(['Depósito', describirDeposito(deposito)]);
  else if (capitalDe(jugador) === i) filas.push(['Depósito', 'Central (capital)']);

  // Tropas en la provincia
  const aqui = ejercito.brigadas.filter((b) => b.provincia === i);
  const propias = aqui.filter((b) => b.pais === jugador);
  const otras = aqui.filter((b) => b.pais !== jugador);
  if (propias.length) filas.push(['Tus tropas', `${propias.length} brigada(s), ${miles(propias.reduce((s, b) => s + b.efectivos, 0))} hombres`]);
  if (otras.length) {
    const visto = !enGuerra(jugador, dueno) || reconocida(jugador, i);
    filas.push([`Tropas de ${nombrePais(otras[0].pais)}`, visto
      ? `${otras.length} brigada(s), ${miles(otras.reduce((s, b) => s + b.efectivos, 0))} hombres`
      : 'Sin reconocer (acercá tropas para verlas)']);
  } else if (!propias.length) filas.push(['Tropas', 'Ninguna']);

  const acciones = [];
  if (propia && !deposito && capitalDe(jugador) !== i) {
    const error = provinciaApta(jugador, i);
    acciones.push(h('button', { type: 'button', class: 'boton', disabled: !!error, title: error ?? '', onclick: () => acc.construirDeposito(i) },
      h('b', {}, 'Armar un depósito'), h('small', {}, error ?? `${datos.reglas.suministro.dias_construccion} días`)));
  }
  if (!propia && enGuerra(jugador, dueno) && escuadronesDe(jugador).some((e) => enAlcance(e, i))) {
    acciones.push(h('button', { type: 'button', class: 'boton', onclick: () => acc.paqueteSobre(i) },
      h('b', {}, 'Ataque aéreo…'), h('small', {}, blancosEn(jugador, i).length ? 'Base, rutas, tropas o depósito' : 'Rutas')));
  }
  if (propia && p.pais === jugador) {
    const mano = ejercito.manoDeObra[jugador] ?? 0;
    acciones.push(h('div', { class: 'rotulo' }, `Reclutar · mano de obra ${miles(mano)}`));
    acciones.push(h('div', { class: 'botones-reclutar' }, ...Object.entries(tipos()).map(([clave, t]) => {
      const c = costoBrigada(jugador, clave);
      const error = puedeReclutar(jugador, clave, i);
      return h('button', {
        type: 'button', class: 'boton', disabled: !!error, title: error ?? `Entrenamiento ${Math.round(c.entrenamiento * 100)} %`,
        onclick: () => acc.reclutar(clave, i),
      }, h('span', { class: 'reclutar-tipo' }, iconoUnidad(clave, jugador), h('b', {}, t.nombre)), h('small', {}, `${miles(c.efectivos)} h · ${c.equipo} equipo · ${c.dias} d`));
    })));
  } else if (!propia && !enGuerra(jugador, dueno)) {
    acciones.push(h('button', { type: 'button', class: 'boton', onclick: () => acc.abrirPais(dueno, 'resumen') },
      h('b', {}, `Guerra y paz con ${nombrePais(dueno)}…`), h('small', {}, 'Justificación, declaración de guerra, relaciones')));
  } else if (enGuerra(jugador, dueno)) {
    const ejes = ejesPosibles(jugador, i);
    acciones.push(h('button', {
      type: 'button', class: 'boton principal', disabled: !ejes.length,
      title: ejes.length ? '' : 'Tiene que estar pegada a una provincia tuya',
      onclick: () => acc.planear(i),
    }, 'Planear una operación acá'));
    if (!ejes.length) acciones.push(h('p', { class: 'nota' }, 'Para atacarla tiene que limitar con una provincia tuya.'));
  }

  $('ficha-nombre').textContent = p.nombre;
  $('ficha-pais').replaceWith(Object.assign(chipPais(dueno, () => acc.abrirPais(dueno)), { id: 'ficha-pais' }));
  $('ficha-datos').replaceChildren(...filas.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  $('ficha-acciones').replaceChildren(...acciones);
  ficha.hidden = false;
}

// ------------------------------------------------------------------ tropas elegidas

function estadoBrigada(b) {
  if (b.formacion) return `En formación: ${Math.ceil(b.formacion.horas / 24)} días`;
  if (b.operacion) return 'En una operación';
  if (b.mov) {
    const destino = datos.provincias[b.mov.ruta.at(-1)].nombre;
    const hrs = horasRestantes(b);
    return `Marchando a ${destino} (${hrs < 24 ? `${Math.ceil(hrs)} h` : `${dec(hrs / 24, 1)} d`})`;
  }
  return b.atrincheramiento > 0.02 ? `Atrincherada +${Math.round(b.atrincheramiento * 100)} %` : 'Lista';
}

export function mostrarTropas(ids) {
  const panel = $('tropas');
  const lista = [...ids].map(brigadaPorId).filter(Boolean);
  if (!lista.length) { panel.hidden = true; return; }
  const cuerpos = [...new Set(lista.map((b) => b.cuerpo))].map(cuerpoPorId).filter(Boolean);
  $('tropas-titulo').textContent = lista.length === 1 ? lista[0].nombre : `${lista.length} brigadas`;
  $('tropas-lista').replaceChildren(...lista.map((b) => h('li', {
    class: lista.length > 1 ? 'clicable' : '',
    title: lista.length > 1 ? 'Clic: quedarse solo con esta brigada' : null,
    onclick: lista.length > 1 ? () => acc.soloEsta(b.id) : null,
  },
    iconoUnidad(b.tipo, b.pais, tipos()[b.tipo].nombre),
    h('div', { class: 'tropa' },
      h('div', { class: 'tropa-nombre' }, b.nombre),
      h('div', { class: 'tropa-datos' }, `${miles(b.efectivos)} h · entrenamiento ${Math.round(b.entrenamiento * 100)} % · ${datos.provincias[b.provincia].nombre}`),
      h('div', { class: 'tropa-datos' }, `${estadoBrigada(b)} · suministro ${NOMBRE_ZONA[zona(suministroEn(b.pais, b.provincia))].toLowerCase()}`),
      h('div', { class: 'barra-org', title: `Organización ${Math.round(b.organizacion * 100)} %` }, h('i', { style: `width:${Math.round(b.organizacion * 100)}%` }))),
    lista.length > 1 ? h('button', { type: 'button', class: 'quitar', title: 'Sacar de la selección', 'aria-label': 'Sacar de la selección', onclick: (ev) => { ev.stopPropagation(); acc.quitarDeSeleccion(b.id); } }, '×') : null,
  )));
  $('tropas-cuerpos').replaceChildren(...cuerpos.map((c) => h('div', { class: 'cuerpo' },
    h('span', {}, `${c.nombre}: ${c.general.nombre} `, h('span', { class: 'estrellas', title: `Experiencia ${c.general.experiencia} de 5` }, '★'.repeat(c.general.experiencia) + '☆'.repeat(5 - c.general.experiencia))),
    h('button', { type: 'button', class: 'mini', onclick: () => { relevarGeneral(c); mostrarTropas(ids); } }, 'Relevar'))));
  panel.hidden = false;
}

// ------------------------------------------------------------------ planificador de Operaciones

let plan = null;
let temporizador = null;

export function abrirPlan(p) {
  plan = p;
  renderPlan();
  $('plan').hidden = false;
}

export function cerrarPlan() {
  plan = null;
  $('plan').hidden = true;
}

export const planActual = () => plan;

export function renderPlan() {
  if (!plan) return;
  const jugador = plan.pais;
  const objetivo = plan.objetivos[0];
  const ejes = ejesPosibles(jugador, objetivo);
  const disponibles = brigadasDisponibles(jugador);
  const enEje = (b) => b.provincia === plan.eje || datos.provincias[objetivo].conexiones.some((c) => c.j === b.provincia && datos.duenos[c.j] === jugador);
  const filas = disponibles
    .map((b) => {
      const r = enEje(b) ? { horas: 0 } : calcularRuta(b, plan.eje);
      return { b, horas: r ? r.horas : Infinity };
    })
    .filter((x) => Number.isFinite(x.horas))
    .sort((x, y) => x.horas - y.horas)
    .slice(0, 24);

  $('plan-titulo').textContent = `Operación sobre ${datos.provincias[objetivo].nombre}`;
  $('plan-objetivos').replaceChildren(...plan.objetivos.map((o, k) => h('span', { class: 'objetivo' },
    `${k + 1}. ${datos.provincias[o].nombre}`,
    k > 0 ? h('button', { type: 'button', class: 'mini', 'aria-label': 'Quitar objetivo', onclick: () => { plan.objetivos.splice(k, 1); cambioPlan(); } }, '×') : null)));

  const selEje = $('plan-eje');
  selEje.replaceChildren(...ejes.map((j) => h('option', { value: j, selected: j === plan.eje }, `${datos.provincias[j].nombre} (${TERRENO[datos.provincias[j].terreno].toLowerCase()})`)));
  selEje.onchange = () => { plan.eje = Number(selEje.value); cambioPlan(); };

  $('plan-fuerzas').replaceChildren(...filas.map(({ b, horas }) => {
    const rol = plan.fuerzas.includes(b.id) ? 'ataca' : plan.reservas.includes(b.id) ? 'reserva' : 'no';
    const sel = h('select', { 'aria-label': `Rol de ${b.nombre}`, onchange: (e) => {
      plan.fuerzas = plan.fuerzas.filter((id) => id !== b.id);
      plan.reservas = plan.reservas.filter((id) => id !== b.id);
      if (e.target.value === 'ataca') plan.fuerzas.push(b.id);
      if (e.target.value === 'reserva') plan.reservas.push(b.id);
      cambioPlan();
    } }, h('option', { value: 'no', selected: rol === 'no' }, 'No va'), h('option', { value: 'ataca', selected: rol === 'ataca' }, 'Ataca'), h('option', { value: 'reserva', selected: rol === 'reserva' }, 'Reserva'));
    return h('li', { class: rol }, iconoUnidad(b.tipo, b.pais),
      h('div', { class: 'tropa' }, h('div', { class: 'tropa-nombre' }, b.nombre),
        h('div', { class: 'tropa-datos' }, `${miles(b.efectivos)} h · org. ${Math.round(b.organizacion * 100)} % · ${horas === 0 ? 'en el frente' : `llega en ${dec(horas / 24, 1)} d`}`)),
      sel);
  }));
  if (!filas.length) $('plan-fuerzas').replaceChildren(h('li', { class: 'nota' }, 'No hay brigadas disponibles que puedan llegar al eje.'));

  $('plan-posturas').replaceChildren(...Object.entries(POSTURAS()).map(([clave, p]) => h('label', { class: 'postura' },
    h('input', { type: 'radio', name: 'postura', value: clave, checked: plan.postura === clave, onchange: () => { plan.postura = clave; cambioPlan(); } }),
    h('span', {}, h('b', {}, p.nombre), h('small', {}, p.texto)))));

  const dias = $('plan-dias');
  dias.value = plan.diasPreparacion;
  const textoDias = () => `${plan.diasPreparacion} ${plan.diasPreparacion === 1 ? 'día' : 'días'}`;
  $('plan-dias-valor').textContent = textoDias();
  dias.oninput = () => { plan.diasPreparacion = Number(dias.value); $('plan-dias-valor').textContent = textoDias(); cambioPlan(false); };
  for (const fase of ['preparacion', 'ruptura']) {
    const c = $(`plan-art-${fase}`);
    c.checked = plan.artilleria[fase];
    c.onchange = () => { plan.artilleria[fase] = c.checked; cambioPlan(false); };
  }

  // Aviación: escuadrones propios libres que llegan al objetivo
  plan.aviacion ??= [];
  plan.aviacionFases ??= { preparacion: true, ruptura: true, explotacion: true };
  const enAlcanceYa = escuadronesDe(jugador).filter((e) => !e.ocupado && enAlcance(e, objetivo));
  $('plan-aviacion').replaceChildren(
    ...(enAlcanceYa.length ? enAlcanceYa.map((e) => h('label', { class: 'fila-check' },
      h('input', { type: 'checkbox', checked: plan.aviacion.includes(e.id), onchange: (ev) => {
        plan.aviacion = plan.aviacion.filter((id) => id !== e.id);
        if (ev.target.checked) plan.aviacion.push(e.id);
        cambioPlan(false);
      } }),
      iconoUnidad('avion', e.pais),
      h('span', {}, h('b', {}, e.nombre), h('small', {}, `${avionesListos(e)} listos · ${modelo(e.modelo).rol === 'caza' ? 'superioridad aérea' : 'ataque a tierra'}`))))
      : [h('p', { class: 'nota' }, 'Ningún escuadrón libre llega a este objetivo.')]),
    h('div', { class: 'artilleria' }, ...[['preparacion', 'Bombardeo en la preparación'], ['ruptura', 'Apoyo cercano en la ruptura'], ['explotacion', 'Persecución en la explotación']]
      .map(([fase, texto]) => h('label', {}, h('input', { type: 'checkbox', checked: plan.aviacionFases[fase], onchange: (ev) => { plan.aviacionFases[fase] = ev.target.checked; cambioPlan(false); } }), ` ${texto}`))),
  );
  actualizarPrediccion();
}

function cambioPlan(redibujar = true) {
  if (redibujar) renderPlan();
  else actualizarPrediccion();
  acc.planCambio?.();
}

function actualizarPrediccion() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    if (!plan) return;
    const cal = calcularCalidad(plan);
    $('plan-calidad').textContent = `${cal.total} %`;
    $('plan-factores').replaceChildren(...cal.factores.map((f) => h('li', { title: f.nota },
      h('span', {}, f.nombre), h('span', { class: 'medidor' }, h('i', { style: `width:${Math.round((f.valor / f.max) * 100)}%` })),
      h('small', {}, f.nota))));
    const pr = plan.fuerzas.length && plan.eje >= 0 ? predecir(plan) : null;
    const caja = $('plan-prediccion');
    if (!pr) { caja.replaceChildren(h('p', { class: 'nota' }, 'Elegí tropas para ver la predicción.')); return; }
    const res = datos.reglas.combate.resultados;
    caja.replaceChildren(
      h('p', { class: 'probable' }, 'Resultado probable de la ruptura: ', h('b', {}, res.find((r) => r.clave === pr.probable).nombre)),
      h('ul', { class: 'probabilidades' }, ...res.map((r) => h('li', { class: r.clave },
        h('span', {}, r.nombre), h('span', { class: 'medidor' }, h('i', { style: `width:${Math.round(pr.probabilidades[r.clave] * 100)}%` })),
        h('small', {}, `${Math.round(pr.probabilidades[r.clave] * 100)} %`)))),
      pr.superioridad != null ? h('p', { class: 'nota' }, `Superioridad aérea estimada: ${pct(pr.superioridad)}${pr.superioridad >= 0.7 ? ' (dominás el aire)' : pr.superioridad < 0.3 ? ' (el enemigo domina el aire)' : ''}.`) : null,
      h('p', { class: 'nota' }, `Ventaja esperada ${dec(pr.ventajaMedia)} (raíz del poder de ataque sobre el de defensa, por el azar). `,
        pr.visto ? `Enemigo confirmado: ${pr.defensores} brigada(s).` : 'Fuerza enemiga estimada: sin reconocer, puede haber más o menos tropas.'),
      h('div', { class: 'multiplicadores' },
        h('div', {}, h('div', { class: 'rotulo' }, 'Ataque'), ...pr.multAtaque.map(([k, v]) => h('div', { class: v > 1.001 ? 'sube' : v < 0.999 ? 'baja' : '' }, k, h('b', {}, `×${dec(v)}`)))),
        h('div', {}, h('div', { class: 'rotulo' }, 'Defensa'), ...pr.multDefensa.map(([k, v]) => h('div', { class: v > 1.001 ? 'baja' : '' }, k, h('b', {}, `×${dec(v)}`))))),
    );
  }, 120);
}

// ------------------------------------------------------------------ decisiones entre fases

export function mostrarDecision(op) {
  const d = op.decision;
  if (!d) return;
  const caja = $('decision');
  const res = datos.reglas.combate.resultados.find((r) => r.clave === d.resultado);
  const titulo = d.resultado === 'preparacion' ? 'Terminó la preparación' : `${FASES[d.fase]}: ${res?.nombre ?? ''}`;
  const filas = [];
  if (d.ventaja != null && d.ventaja > 0) filas.push(['Ventaja media', dec(d.ventaja)]);
  if (d.defensores != null) filas.push(['Defensores en la provincia', `${d.defensores} brigada(s)`]);
  filas.push(['Tus bajas', miles(d.bajasPropias)], ['Bajas enemigas', miles(d.bajasEnemigas)]);
  if (d.reacciones) filas.push(['Reacción enemiga', `trae ${d.reacciones} brigada(s) de refuerzo`]);
  if (d.aire) filas.push(['Aviación', d.aire]);
  const hayReservas = op.reservas.length > 0;
  const botones = [];
  const cerrar = (eleccion) => { caja.hidden = true; if (eleccion) acc.decidir(op, eleccion); };
  if (d.final || op.estado === 'terminada') botones.push(['Cerrar', null, 'principal']);
  else if (d.siguiente === 'fin') botones.push(['Terminar la operación', 'seguir', 'principal']);
  else {
    const seguir = { ruptura: 'Seguir: ruptura', explotacion: 'Explotar con las tropas mecanizadas y blindadas', ruptura_siguiente: 'Seguir al próximo objetivo' }[d.siguiente];
    botones.push([seguir, 'seguir', 'principal']);
    if (hayReservas) botones.push([`Meter las reservas (${op.reservas.length}) y seguir`, 'reservas', '']);
    botones.push([d.siguiente === 'explotacion' ? 'Quedarse acá' : 'Cortar la operación', 'cortar', 'peligro']);
  }
  caja.replaceChildren(h('div', { class: 'panel dialogo', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'decision-titulo' },
    h('div', { class: 'rotulo' }, `Operación sobre ${datos.provincias[op.objetivos[0]].nombre} · ${d.provincia}`),
    h('h2', { id: 'decision-titulo' }, titulo),
    h('p', {}, d.texto),
    h('dl', { class: 'datos' }, ...filas.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    h('div', { class: 'botones' }, ...botones.map(([t, e, cl]) => h('button', { type: 'button', class: `boton ${cl}`, onclick: () => cerrar(e) }, t))),
  ));
  caja.hidden = false;
  caja.querySelector('.boton')?.focus();
}

// ------------------------------------------------------------------ registro de eventos

function agregarMensaje({ texto, tono, pais }) {
  const jugador = datos.escenario.pais_jugador;
  if (pais && pais !== jugador) return;
  const reg = $('registro');
  const el = h('li', { class: tono }, h('span', { class: 'cuando' }, `${textoFecha()} · `), texto);
  reg.append(el);
  while (reg.children.length > 6) reg.firstElementChild.remove();
  reg.hidden = false;
}

export function operacionesPendientes() {
  return operaciones.lista.filter((o) => o.estado === 'decision' && o.pais === datos.escenario.pais_jugador);
}
