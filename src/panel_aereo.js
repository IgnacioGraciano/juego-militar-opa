// Planificador de paquetes de ataque (incursiones aéreas) y resumen al final.

import { datos, nombrePais } from './datos.js';
import { $, h, miles, pct, dec, iconoUnidad, filasDatos, medidor } from './dom.js';
import { svgSilueta } from './simbolos.js';
import {
  escuadronesDe, escuadronPorId, modelo, disponibles, enAlcance, distanciaBase, interceptores, blancosEn, planPaquete,
  lanzarPaquete, TIPOS_PAQUETE, HORARIOS, ROLES, basesDe, fijarMision, cambiarBase,
} from './aviacion.js';
import { ejercito, enGuerra, mensaje } from './ejercito.js';

let plan = null;
let acc = {};

export function iniciarPanelAereo(acciones) {
  acc = acciones;
  $('paquete-cerrar').addEventListener('click', cerrarPaquete);
  $('paquete-lanzar').addEventListener('click', () => {
    if (!plan) return;
    const e = lanzarPaquete(plan);
    if (e) { mensaje(e, 'malo', plan.pais); return; }
    cerrarPaquete();
  });
}

export const paqueteActual = () => plan;

export function abrirPaquete(pais, provincia, escuadronId = null) {
  plan = planPaquete(pais, provincia);
  // Si se eligió un escuadrón en el mapa, el paquete arranca con ese solo.
  const elegido = escuadronId != null ? escuadronPorId(escuadronId) : null;
  if (elegido && !elegido.ocupado) {
    const caza = modelo(elegido.modelo).rol === 'caza';
    plan.atacantes = caza ? [] : [elegido.id];
    plan.escoltas = caza ? [elegido.id] : [];
    if (caza) plan.blanco = blancosEn(pais, provincia).includes('base') ? 'base' : plan.blanco;
  }
  $('paquete').hidden = false;
  renderPaquete();
  acc.alCambiarPanel?.();
}

export function cerrarPaquete() {
  plan = null;
  $('paquete').hidden = true;
  acc.alCambiarPanel?.();
}

export function renderPaquete() {
  if (!plan) return;
  const j = plan.objetivo;
  const p = datos.provincias[j];
  $('paquete-titulo').textContent = `Incursión sobre ${p.nombre}`;
  const blancos = blancosEn(plan.pais, j);
  if (!blancos.includes(plan.blanco)) plan.blanco = blancos[0] ?? 'rutas';
  const tipos = TIPOS_PAQUETE();
  $('paquete-blancos').replaceChildren(...(blancos.length ? blancos : ['rutas']).map((b) => h('label', { class: 'postura' },
    h('input', { type: 'radio', name: 'blanco', checked: plan.blanco === b, onchange: () => { plan.blanco = b; renderPaquete(); } }),
    h('span', {}, h('b', {}, tipos[b].nombre), h('small', {}, tipos[b].texto)))));

  const lista = escuadronesDe(plan.pais).filter((e) => !e.ocupado && disponibles(e) > 0);
  $('paquete-escuadrones').replaceChildren(...lista.map((e) => {
    const m = modelo(e.modelo);
    const llega = enAlcance(e, j);
    const rol = plan.atacantes.includes(e.id) ? 'ataque' : plan.escoltas.includes(e.id) ? 'escolta' : 'no';
    return h('li', { class: llega ? rol : 'no' },
      iconoAvion(e),
      h('div', { class: 'tropa' },
        h('div', { class: 'tropa-nombre' }, e.nombre),
        h('div', { class: 'tropa-datos' }, `${ROLES[m.rol]} · ${disponibles(e)} listos · ${miles(distanciaBase(e, j))} km de ${miles(m.radio_km)}${m.noche ? ' · vuela de noche' : ''}`)),
      llega
        ? h('select', { 'aria-label': `Rol de ${e.nombre}`, onchange: (ev) => {
          plan.atacantes = plan.atacantes.filter((id) => id !== e.id);
          plan.escoltas = plan.escoltas.filter((id) => id !== e.id);
          if (ev.target.value === 'ataque') plan.atacantes.push(e.id);
          if (ev.target.value === 'escolta') plan.escoltas.push(e.id);
          renderPaquete();
        } }, h('option', { value: 'no', selected: rol === 'no' }, 'No va'), h('option', { value: 'ataque', selected: rol === 'ataque' }, 'Ataque'), h('option', { value: 'escolta', selected: rol === 'escolta' }, 'Escolta'))
        : h('small', { class: 'tenue' }, 'Fuera de alcance'));
  }));
  if (!lista.length) $('paquete-escuadrones').replaceChildren(h('li', { class: 'nota' }, 'No hay escuadrones libres con aviones listos.'));

  $('paquete-horarios').replaceChildren(...Object.entries(HORARIOS()).map(([k, v]) => h('label', { class: 'postura' },
    h('input', { type: 'radio', name: 'horario', checked: plan.horario === k, onchange: () => { plan.horario = k; renderPaquete(); } }),
    h('span', {}, h('b', {}, v.nombre)))));
  const bajo = $('paquete-bajo');
  bajo.checked = plan.vueloBajo;
  bajo.onchange = () => { plan.vueloBajo = bajo.checked; renderPaquete(); };

  // Lo que se sabe del blanco
  const cazas = interceptores(plan.pais, j);
  const avionesEnemigos = cazas.reduce((s, e) => s + disponibles(e), 0);
  const tropas = ejercito.brigadas.filter((b) => b.provincia === j && enGuerra(plan.pais, b.pais)).length;
  const c = datos.reglas.aviacion.combate_aereo;
  const deteccion = c.deteccion * (plan.vueloBajo ? c.deteccion_vuelo_bajo / c.deteccion : 1) * (plan.horario === 'noche' ? c.deteccion_noche : 1);
  const sinNoche = plan.horario === 'noche' && plan.atacantes.some((id) => !modelo(escuadronesDe(plan.pais).find((e) => e.id === id)?.modelo)?.noche);
  $('paquete-info').replaceChildren(...[
    h('dl', { class: 'datos' }, ...filasDatos([
      ['Cazas enemigos en alerta', avionesEnemigos ? `${avionesEnemigos} aviones pueden interceptar` : 'Ninguno llega'],
      ['Chance de que nos detecten', avionesEnemigos ? pct(deteccion) : '—'],
      ['Antiaéreos', tropas ? `${tropas} brigada(s) en la provincia${plan.vueloBajo ? ' (más peligrosos volando bajo)' : ''}` : 'Pocos'],
    ])),
    sinNoche ? h('p', { class: 'malo' }, 'Algunos aviones de ataque no tienen equipo nocturno: de noche apuntan mal.') : null,
    !enGuerra(plan.pais, datos.duenos[j]) ? h('p', { class: 'malo' }, `No estás en guerra con ${nombrePais(datos.duenos[j])}.`) : null,
  ].filter(Boolean));
  $('paquete-lanzar').disabled = !plan.atacantes.length || !enGuerra(plan.pais, datos.duenos[j]);
}

// Resumen al final de la incursión (no pausa el juego).
export function mostrarResumenIncursion(v) {
  const r = v.resumen;
  if (!r || v.pais !== datos.escenario.pais_jugador) return;
  const caja = $('decision');
  caja.replaceChildren(h('div', { class: 'panel dialogo', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'incursion-titulo' },
    h('div', { class: 'rotulo' }, `Paquete de ataque · ${r.blanco}`),
    h('h2', { id: 'incursion-titulo' }, r.titulo),
    ...r.lineas.map((l) => h('p', {}, l)),
    h('dl', { class: 'datos' }, ...filasDatos([['Aviones perdidos', String(r.perdidas)], ['Enemigos derribados', String(r.derribados)]])),
    h('div', { class: 'botones' }, h('button', { type: 'button', class: 'boton principal', onclick: () => { caja.hidden = true; } }, 'Cerrar')),
  ));
  caja.hidden = false;
}


// ------------------------------------------------------------------ tarjetas de avión

const MAXIMOS = () => {
  const ms = Object.keys(datos.aviones.modelos).map(modelo);
  return {
    velocidad: Math.max(...ms.map((m) => m.velocidad_kmh)),
    radio: Math.max(...ms.map((m) => m.radio_km)),
    aire: Math.max(...ms.map((m) => m.aire)),
    ataque: Math.max(...ms.map((m) => m.ataque)),
  };
};

// Ficha chica con la silueta del avión sobre el color del país.
export function iconoAvion(e, clase = '') {
  const el = h('span', { class: `icono-avion ${clase}`, style: `--pais:${datos.paises[e.pais]?.color ?? '#3d6d93'}` });
  el.append(svgSilueta(modelo(e.modelo).silueta, modelo(e.modelo).nombre));
  return el;
}

// Barras de velocidad, alcance, combate aéreo y ataque, comparadas con el mejor avión.
export function barrasAvion(m) {
  const mx = MAXIMOS();
  const fila = (nombre, v, max, texto) => h('div', { class: 'barra-dato' }, h('span', {}, nombre), medidor(v / max), h('b', {}, texto));
  return h('div', { class: 'barras-avion' },
    fila('Velocidad', m.velocidad_kmh, mx.velocidad, `${miles(m.velocidad_kmh)} km/h`),
    fila('Alcance', m.radio_km, mx.radio, `${miles(m.radio_km)} km`),
    fila('Combate aéreo', m.aire, mx.aire, dec(m.aire)),
    fila('Ataque a tierra', m.ataque, mx.ataque, dec(m.ataque)));
}

export function etiquetasAvion(m) {
  const t = [ROLES[m.rol]];
  if (m.misiles_largos) t.push('Misiles de alcance medio');
  else if (m.misiles_cortos) t.push('Misiles de corto alcance');
  if (m.noche) t.push('Vuela de noche');
  if (m.todo_tiempo) t.push('Radar');
  return h('div', { class: 'etiquetas' }, ...t.map((x) => h('span', { class: 'etiqueta' }, x)));
}

// ------------------------------------------------------------------ escuadrón elegido

export function mostrarEscuadron(id) {
  const panel = $('escuadron');
  const e = id != null ? escuadronPorId(id) : null;
  if (!e) { panel.hidden = true; return; }
  const m = modelo(e.modelo);
  const propio = e.pais === datos.escenario.pais_jugador;
  const listos = disponibles(e);
  const bases = basesDe(e.pais);
  panel.replaceChildren(
    h('div', { class: 'ficha-cabeza' },
      h('div', { class: 'silueta-grande', style: `--pais:${datos.paises[e.pais]?.color ?? '#3d6d93'}` }, svgSilueta(m.silueta, m.nombre)),
      h('div', { class: 'cabeza-texto' },
        h('div', { class: 'rotulo' }, `Escuadrón · ${datos.bases[e.base].nombre}`),
        h('h2', {}, m.nombre),
        etiquetasAvion(m)),
      h('button', { type: 'button', class: 'cerrar', 'aria-label': 'Soltar escuadrón', onclick: () => acc.soltarEscuadron() }, '×')),
    h('div', { class: 'tarjetas tres' },
      h('div', { class: 'tarjeta' }, h('span', { class: 'rotulo' }, 'Aviones'), h('b', {}, String(e.aviones)), h('small', {}, `${listos} listos hoy`)),
      h('div', { class: 'tarjeta' }, h('span', { class: 'rotulo' }, 'Pilotos'), h('b', {}, pct(e.experiencia)), h('small', {}, 'de experiencia')),
      h('div', { class: 'tarjeta' }, h('span', { class: 'rotulo' }, 'Estado'), h('b', {}, e.ocupado ? 'En misión' : e.mision === 'alerta' ? 'Alerta' : 'Reposo'), h('small', {}, e.ocupado ? '' : 'en la base'))),
    barrasAvion(m),
    propio ? h('div', { class: 'controles-escuadron' },
      h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Misión' },
        ...[['alerta', 'En alerta'], ['reposo', 'En reposo']].map(([k, t]) => h('button', {
          type: 'button', 'aria-pressed': String(e.mision === k), onclick: () => { fijarMision(e, k); mostrarEscuadron(id); },
        }, t))),
      h('label', { class: 'campo' }, h('span', {}, 'Base'), h('select', { onchange: (ev) => { const err = cambiarBase(e, Number(ev.target.value)); if (err) $('escuadron-error').textContent = err; mostrarEscuadron(id); acc.alCambiarPanel?.(); } },
        ...bases.map((b) => h('option', { value: b.indice, selected: b.indice === e.base }, b.nombre)))),
      h('p', { class: 'malo', id: 'escuadron-error' }),
      h('div', { class: 'acciones fila' },
        h('button', { type: 'button', class: 'boton principal', disabled: !!e.ocupado || !listos, onclick: () => acc.atacarConEscuadron() }, 'Atacar…'),
        h('button', { type: 'button', class: 'boton', disabled: !!e.ocupado, onclick: () => acc.modoBase() }, 'Cambiar de base')),
      h('p', { class: 'nota' }, 'Clic derecho en una provincia enemiga: ataque. En una provincia tuya con base: mudar el escuadrón. En alerta intercepta a los aviones enemigos dentro del círculo.'))
      : h('p', { class: 'nota' }, `Escuadrón de ${nombrePais(e.pais)}.`),
  );
  panel.hidden = false;
}
