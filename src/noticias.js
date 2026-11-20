// Noticias y avisos.
//   Noticia: lo importante (guerras, paz, eventos históricos, pérdidas de territorio,
//   propuestas). Sale en el centro con forma de diario, pausa el juego al aparecer y lo
//   reanuda al cerrarla (si estaba corriendo). Si llegan varias juntas, hacen cola.
//   Aviso: un renglón abajo que se va solo (errores de órdenes, resultados de ataques).
//   Lo demás (contratos, construcciones, etc.) no se muestra.

import { datos, nombrePais } from './datos.js';
import { tiempo, fechaLocal } from './tiempo.js';
import { ejercito } from './ejercito.js';
import { $, h, filasDatos } from './dom.js';

const DIARIO = 'El Centinela del Sur';
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const cola = [];
let mostrando = null;
let reanudar = false;
let acc = {};

export function iniciarNoticias(acciones) {
  acc = acciones;
  ejercito.eventos.addEventListener('mensaje', (e) => {
    const { texto, tono, pais, importancia } = e.detail;
    const jugador = datos.escenario.pais_jugador;
    if (pais && pais !== jugador) return;
    if (importancia === 'aviso') aviso(texto, tono);
    else if (importancia?.perdida != null) provinciaPerdida(importancia.perdida, importancia.quien);
    else if (importancia && typeof importancia === 'object') publicar({ ...importancia, parrafos: importancia.parrafos ?? [texto], tono });
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mostrando && !mostrando.botones?.length) cerrar();
  });
}

const pausar = (si) => {
  if (tiempo.pausado === si) return;
  tiempo.pausado = si;
  tiempo.eventos.dispatchEvent(new Event('estado'));
};

// nota: {seccion, titular, bajada, parrafos, filas, botones: [[texto, accion, clase]], tono}
export function publicar(nota) {
  cola.push(nota);
  if (!mostrando) siguiente();
}

export const hayNoticia = () => !!mostrando;

function siguiente() {
  mostrando = cola.shift() ?? null;
  const caja = $('diario');
  if (!mostrando) {
    caja.hidden = true;
    if (reanudar) { reanudar = false; pausar(false); }
    acc.alCambiarPanel?.();
    return;
  }
  if (!tiempo.pausado) { reanudar = true; pausar(true); }
  caja.replaceChildren(pagina(mostrando));
  caja.hidden = false;
  caja.querySelector('button')?.focus();
}

function cerrar(accion) {
  accion?.();
  siguiente();
}

function fechaDiario() {
  const f = fechaLocal();
  return `${DIAS[f.getUTCDay()]} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]} de ${f.getUTCFullYear()}`;
}

function pagina(n) {
  const largo = (n.parrafos ?? []).join(' ').length > 420;
  const botones = n.botones?.length ? n.botones : [['Cerrar', null, 'principal']];
  return h('article', { class: `diario ${n.tono ?? ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'diario-titular' },
    h('header', { class: 'diario-cabecera' },
      h('div', { class: 'diario-lema' }, h('span', {}, `Año ${f2(fechaLocal().getUTCFullYear() - 1921)} · N.º ${f2(Math.floor(tiempo.horas / 24) + 18412)}`), h('span', {}, 'Edición de la tarde')),
      h('div', { class: 'diario-nombre' }, DIARIO),
      h('div', { class: 'diario-fecha' }, h('span', {}, 'Buenos Aires'), h('span', {}, fechaDiario()), h('span', {}, 'Precio: $ 600'))),
    n.seccion ? h('div', { class: 'diario-seccion' }, n.seccion) : null,
    h('h2', { id: 'diario-titular', class: 'diario-titular' }, n.titular),
    n.bajada ? h('p', { class: 'diario-bajada' }, n.bajada) : null,
    h('div', { class: `diario-cuerpo${largo ? ' columnas' : ''}` }, ...(n.parrafos ?? []).map((p) => h('p', {}, p))),
    n.filas?.length ? h('dl', { class: 'diario-datos' }, ...filasDatos(n.filas)) : null,
    h('footer', { class: 'diario-botones' }, ...botones.map(([t, f, cl]) => h('button', {
      type: 'button', class: `sello ${cl ?? ''}`, onclick: () => cerrar(f),
    }, t))),
    cola.length ? h('div', { class: 'diario-mas' }, `${cola.length} ${cola.length === 1 ? 'noticia más' : 'noticias más'}`) : null,
  );
}

const f2 = (n) => n.toLocaleString('es-AR');

// ------------------------------------------------------------------ avisos breves

const vigentes = new Map(); // texto -> elemento (no repetir el mismo aviso)

export function aviso(texto, tono = 'info') {
  if (!texto) return;
  const lista = $('avisos');
  vigentes.get(texto)?.remove();
  const el = h('li', { class: tono }, texto);
  vigentes.set(texto, el);
  lista.append(el);
  while (lista.children.length > 3) lista.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('fuera');
    setTimeout(() => { el.remove(); if (vigentes.get(texto) === el) vigentes.delete(texto); }, 400);
  }, tono === 'malo' ? 5000 : 4000);
}

// Pérdidas de territorio: se juntan las del mismo día en una sola noticia.
let perdidas = [];
let temporizador = null;
export function provinciaPerdida(prov, quien) {
  perdidas.push({ prov, quien });
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    const lista = perdidas;
    perdidas = [];
    const nombres = lista.map((x) => datos.provincias[x.prov].nombre);
    const enemigo = nombrePais(lista[0].quien);
    publicar({
      seccion: 'Frente de batalla',
      titular: lista.length === 1 ? `Cayó ${nombres[0]}` : `Caen ${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`,
      bajada: `Tropas de ${enemigo} ocupan territorio nacional.`,
      parrafos: [`El Estado Mayor confirmó la pérdida de ${lista.length === 1 ? 'la provincia' : 'las provincias'} de ${nombres.join(', ')}. Las fuerzas propias se repliegan a nuevas posiciones.`],
      tono: 'malo',
    });
  }, 30);
}
