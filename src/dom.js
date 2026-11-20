// Ayudas para armar la interfaz HTML.

import { datos, nombrePais } from './datos.js';
import { svgPictograma } from './simbolos.js';

export const $ = (id) => document.getElementById(id);
export const miles = (n) => Math.round(n).toLocaleString('es-AR');
export const dec = (n, d = 2) => n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (n) => `${Math.round(n * 100)} %`;
export const plata = (millones) => (Math.abs(millones) >= 1000
  ? `US$ ${dec(millones / 1000, 1)} mil M`
  : `US$ ${miles(millones)} M`);

// Crea un elemento: h('div', {class: 'x', onclick}, 'texto', otroElemento)
export function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of hijos.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

export const chipPais = (pais, onclick = null) => h(onclick ? 'button' : 'span', {
  class: `pais-chip${onclick ? ' boton-chip' : ''}`,
  type: onclick ? 'button' : null,
  style: `--pais:${datos.paises[pais]?.color ?? '#888'}`,
  title: onclick ? `Ver ${nombrePais(pais)}` : null,
  onclick,
}, nombrePais(pais));

// Ficha de unidad para las listas: pictograma sobre el color del país.
export function iconoUnidad(tipo, pais, titulo = '') {
  const el = h('span', { class: 'simbolo', style: `--pais:${datos.paises[pais]?.color ?? '#3d6d93'}` });
  el.append(svgPictograma(tipo, titulo));
  return el;
}

export function medidor(fraccion, clase = '') {
  return h('span', { class: `medidor ${clase}` }, h('i', { style: `width:${Math.round(Math.max(0, Math.min(1, fraccion)) * 100)}%` }));
}

export const filasDatos = (filas) => filas.filter(Boolean).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]);

// Globo de ayuda al pasar el mouse: contenido() devuelve {titulo, filas: [[k, v]], nota}.
export function conGlobo(el, contenido) {
  const mostrar = () => {
    const g = $('globo');
    if (!g) return;
    const c = contenido();
    g.replaceChildren(...[
      c.titulo ? h('b', {}, c.titulo) : null,
      ...(c.filas ?? []).filter(Boolean).map(([k, v]) => h('div', { class: 'globo-fila' }, h('span', {}, k), h('span', {}, v))),
      c.nota ? h('div', { class: 'tenue', style: 'margin-top:4px' }, c.nota) : null].filter(Boolean));
    g.hidden = false;
    const r = el.getBoundingClientRect();
    const a = g.getBoundingClientRect();
    g.style.left = `${Math.max(6, Math.min(innerWidth - a.width - 6, r.left + r.width / 2 - a.width / 2))}px`;
    g.style.top = `${r.bottom + 8}px`;
  };
  const ocultar = () => { const g = $('globo'); if (g) g.hidden = true; };
  el.addEventListener('mouseenter', mostrar);
  el.addEventListener('mouseleave', ocultar);
  el.addEventListener('focus', mostrar);
  el.addEventListener('blur', ocultar);
  el.addEventListener('click', ocultar);
  return el;
}
