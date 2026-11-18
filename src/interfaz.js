// Interfaz sobre el mapa: reloj y velocidad, ayuda, ficha de la provincia elegida
// y nombre de la provincia bajo el cursor. Usa los elementos de index.html.

import { datos, nombrePais, ciudadesDe, puertosDe, basesDe } from './datos.js';
import {
  tiempo, SEGUNDOS_POR_DIA, alternarPausa, acelerar, frenar, fijarVelocidad,
  textoFecha, textoHora, textoZona,
} from './tiempo.js';

const TIPOS = {
  Province: 'Provincia', State: 'Estado', Department: 'Departamento', Region: 'Región',
  'Federal District': 'Distrito federal', 'Capital District': 'Distrito capital',
  'Federal Dependency': 'Dependencia federal', 'Capital City': 'Ciudad capital',
  'Autonomous City': 'Ciudad autónoma', District: 'Distrito', 'Federal Territory': 'Territorio federal',
  Intendancy: 'Intendencia', Commissiary: 'Comisaría', 'Overseas department': 'Departamento de ultramar',
  'Overseas region': 'Región de ultramar', 'Constitutional Province': 'Provincia constitucional',
  'National Territory': 'Territorio nacional',
};

const $ = (id) => document.getElementById(id);
const miles = (n) => Math.round(n).toLocaleString('es-AR');

export function iniciarInterfaz({ alSoltar }) {
  const jugador = datos.escenario.pais_jugador;
  $('escenario').textContent = datos.escenario.nombre;
  $('pais-jugador').textContent = nombrePais(jugador);
  const color = datos.paises[jugador]?.color;
  if (color) $('pais-jugador').style.setProperty('--pais', color);

  // Barras de velocidad
  const barras = $('barras');
  SEGUNDOS_POR_DIA.forEach((seg, i) => {
    const b = document.createElement('button');
    b.className = 'barra';
    b.type = 'button';
    b.style.setProperty('--alto', `${8 + i * 3}px`);
    b.title = `Velocidad ${i + 1}: un día cada ${String(seg).replace('.', ',')} s`;
    b.setAttribute('aria-label', `Velocidad ${i + 1}`);
    b.addEventListener('click', () => fijarVelocidad(i + 1));
    barras.appendChild(b);
  });
  $('pausa').addEventListener('click', alternarPausa);
  $('mas').addEventListener('click', acelerar);
  $('menos').addEventListener('click', frenar);
  $('cerrar-ficha').addEventListener('click', alSoltar);

  tiempo.eventos.addEventListener('hora', actualizarReloj);
  tiempo.eventos.addEventListener('estado', actualizarReloj);
  actualizarReloj();
}

export function actualizarReloj() {
  $('fecha').textContent = textoFecha();
  $('hora').textContent = `${textoHora()} · ${textoZona()}`;
  const p = $('pausa');
  p.textContent = tiempo.pausado ? 'Seguir' : 'Pausa';
  p.setAttribute('aria-pressed', String(tiempo.pausado));
  $('reloj').classList.toggle('en-pausa', tiempo.pausado);
  [...$('barras').children].forEach((b, i) => b.classList.toggle('activa', i < tiempo.velocidad));
  $('velocidad').textContent = `Vel. ${tiempo.velocidad}`;
}

export function mostrarCursor(i) {
  const el = $('cursor');
  if (i < 0) {
    el.hidden = true;
    return;
  }
  const p = datos.provincias[i];
  el.textContent = `${p.nombre} · ${nombrePais(datos.duenos[i])}`;
  el.hidden = false;
}

export function mostrarProvincia(i) {
  const ficha = $('ficha');
  if (i < 0) {
    ficha.hidden = true;
    return;
  }
  const p = datos.provincias[i];
  const dueno = datos.duenos[i];
  $('ficha-nombre').textContent = p.nombre;
  const pais = $('ficha-pais');
  pais.textContent = nombrePais(dueno);
  pais.style.setProperty('--pais', datos.paises[dueno]?.color ?? '#888');

  const filas = [];
  if (dueno !== p.pais) filas.push(['Pertenecía a', nombrePais(p.pais)]);
  if (p.tipo) filas.push(['Tipo', TIPOS[p.tipo] ?? p.tipo]);
  filas.push(['Superficie', `${miles(p.area_km2)} km²`]);
  filas.push(['Costa', p.costera ? 'Sí' : 'No']);
  const ciudades = ciudadesDe(i).slice(0, 4).map((c) => c.nombre);
  if (ciudades.length) filas.push(['Ciudades', ciudades.join(', ')]);
  const puertos = puertosDe(i).map((q) => q.nombre);
  if (puertos.length) filas.push(['Puertos', puertos.join(', ')]);
  const bases = basesDe(i).map((b) => b.nombre);
  if (bases.length) filas.push(['Bases', bases.join(', ')]);
  const vecinos = p.vecinos
    .filter((v) => datos.indiceProvincia.has(v))
    .map((v) => datos.provincias[datos.indiceProvincia.get(v)].nombre);
  if (vecinos.length) filas.push(['Limita con', vecinos.join(', ')]);

  const dl = $('ficha-datos');
  dl.replaceChildren();
  for (const [k, v] of filas) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  }
  ficha.hidden = false;
}
