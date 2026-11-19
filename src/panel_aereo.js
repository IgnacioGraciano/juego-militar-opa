// Planificador de paquetes de ataque (incursiones aéreas) y resumen al final.

import { datos, nombrePais } from './datos.js';
import { $, h, miles, pct, iconoUnidad, filasDatos } from './dom.js';
import {
  escuadronesDe, modelo, disponibles, enAlcance, distanciaBase, interceptores, blancosEn, planPaquete,
  lanzarPaquete, TIPOS_PAQUETE, HORARIOS, ROLES,
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

export function abrirPaquete(pais, provincia) {
  plan = planPaquete(pais, provincia);
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
      iconoUnidad('avion', e.pais, m.nombre),
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

