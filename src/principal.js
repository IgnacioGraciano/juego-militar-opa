// Arranque del juego: carga los datos, arma el mapa y maneja el mouse, el teclado y el dibujo.

import { datos, cargarDatos, provinciaEn } from './datos.js';
import { Camara } from './camara.js';
import { Mapa } from './mapa.js';
import { dibujarEtiquetas } from './etiquetas.js';
import {
  tiempo, iniciarTiempo, avanzarTiempo, alternarPausa, fijarVelocidad, acelerar, frenar, posicionSol,
} from './tiempo.js';
import { iniciarInterfaz, actualizarReloj, mostrarCursor, mostrarProvincia } from './interfaz.js';

const ZOOM_INICIAL = 0.6;
const VELOCIDAD_TECLADO = 900; // píxeles de pantalla por segundo
const UMBRAL_ARRASTRE = 5; // píxeles para distinguir un clic de un arrastre
const COLOR_FONDO = '#2b3f52'; // parecido al mar del borde del relieve

const lienzo = document.getElementById('mapa');
const ctx = lienzo.getContext('2d');
const camara = new Camara();
const mapa = new Mapa();
let sucio = true;
let dpr = 1;

function marcar() {
  sucio = true;
}

// ------------------------------------------------------------------ tamaño

function ajustarTamano() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = lienzo.getBoundingClientRect();
  lienzo.width = Math.max(1, Math.round(r.width * dpr));
  lienzo.height = Math.max(1, Math.round(r.height * dpr));
  camara.fijarTamano(r.width, r.height);
  marcar();
}

// ------------------------------------------------------------------ dibujo

function dibujar() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLOR_FONDO;
  ctx.fillRect(0, 0, camara.ancho, camara.alto);
  const z = camara.zoom * dpr;
  ctx.setTransform(z, 0, 0, z, dpr * (camara.ancho / 2 - camara.x * camara.zoom), dpr * (camara.alto / 2 - camara.y * camara.zoom));
  mapa.dibujar(ctx, camara, posicionSol());
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dibujarEtiquetas(ctx, camara);
}

// ------------------------------------------------------------------ selección

function seleccionar(i) {
  mapa.seleccionada = i;
  mostrarProvincia(i);
  marcar();
}

function fijarBajoCursor(i) {
  if (i === mapa.bajoCursor) return;
  mapa.bajoCursor = i;
  mostrarCursor(i);
  lienzo.style.cursor = i >= 0 ? 'pointer' : 'grab';
  marcar();
}

// ------------------------------------------------------------------ mouse y pantalla táctil

const punteros = new Map(); // pointerId -> {x, y}
let inicio = null; // {x, y, boton} del primer puntero apretado
let arrastrando = false;
let pellizco = null; // {distancia, zoom}

function posLocal(e) {
  const r = lienzo.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

lienzo.addEventListener('pointerdown', (e) => {
  lienzo.setPointerCapture(e.pointerId);
  const p = posLocal(e);
  punteros.set(e.pointerId, p);
  if (punteros.size === 1) {
    inicio = { ...p, boton: e.button };
    arrastrando = false;
  } else if (punteros.size === 2) {
    const [a, b] = [...punteros.values()];
    pellizco = { distancia: Math.hypot(a.x - b.x, a.y - b.y), zoom: camara.zoom };
    arrastrando = true;
  }
});

lienzo.addEventListener('pointermove', (e) => {
  const p = posLocal(e);
  if (!punteros.has(e.pointerId)) {
    // Mouse sin apretar: resaltar la provincia bajo el cursor.
    const m = camara.pantallaAMundo(p.x, p.y);
    fijarBajoCursor(provinciaEn(m.x, m.y));
    return;
  }
  const anterior = punteros.get(e.pointerId);
  punteros.set(e.pointerId, p);
  if (punteros.size === 2 && pellizco) {
    const [a, b] = [...punteros.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const medio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    camara.zoomHacia((pellizco.zoom * d) / pellizco.distancia / camara.zoomObjetivo, medio.x, medio.y);
    camara.desplazarPantalla((p.x - anterior.x) / 2, (p.y - anterior.y) / 2);
    marcar();
    return;
  }
  if (!arrastrando && inicio && Math.hypot(p.x - inicio.x, p.y - inicio.y) > UMBRAL_ARRASTRE) {
    arrastrando = true;
    lienzo.style.cursor = 'grabbing';
  }
  if (arrastrando) {
    camara.desplazarPantalla(p.x - anterior.x, p.y - anterior.y);
    marcar();
  }
});

function soltar(e) {
  if (!punteros.has(e.pointerId)) return;
  punteros.delete(e.pointerId);
  if (punteros.size < 2) pellizco = null;
  if (punteros.size === 0) {
    if (e.type === 'pointerup' && !arrastrando && inicio && inicio.boton === 0) {
      const p = posLocal(e);
      const m = camara.pantallaAMundo(p.x, p.y);
      seleccionar(provinciaEn(m.x, m.y));
    }
    inicio = null;
    arrastrando = false;
    lienzo.style.cursor = mapa.bajoCursor >= 0 ? 'pointer' : 'grab';
  }
}
lienzo.addEventListener('pointerup', soltar);
lienzo.addEventListener('pointercancel', soltar);
lienzo.addEventListener('pointerleave', () => {
  if (punteros.size === 0) fijarBajoCursor(-1);
});
lienzo.addEventListener('contextmenu', (e) => e.preventDefault());
lienzo.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = posLocal(e);
  const pasos = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  camara.zoomHacia(Math.exp(-pasos * 0.0015), p.x, p.y);
  marcar();
}, { passive: false });

// ------------------------------------------------------------------ teclado

const teclas = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    teclas.add(k);
    e.preventDefault();
    return;
  }
  if (e.repeat) return;
  if (k === ' ' || k === 'p') {
    if (e.target.closest?.('button')) e.target.blur();
    alternarPausa();
  } else if (k >= '1' && k <= '5') fijarVelocidad(Number(k));
  else if (k === '+' || k === '=') acelerar();
  else if (k === '-') frenar();
  else if (k === 'n') {
    mapa.nocheActiva = !mapa.nocheActiva;
    marcar();
  } else if (k === 'escape') seleccionar(-1);
  else return;
  e.preventDefault();
});
window.addEventListener('keyup', (e) => teclas.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => teclas.clear());

// ------------------------------------------------------------------ bucle

let ultimo = performance.now();
function cuadro(ahora) {
  const dt = Math.min(0.1, (ahora - ultimo) / 1000);
  ultimo = ahora;

  avanzarTiempo(dt);
  if (!tiempo.pausado && mapa.nocheActiva) marcar();

  let dx = 0, dy = 0;
  if (teclas.has('a') || teclas.has('arrowleft')) dx += 1;
  if (teclas.has('d') || teclas.has('arrowright')) dx -= 1;
  if (teclas.has('w') || teclas.has('arrowup')) dy += 1;
  if (teclas.has('s') || teclas.has('arrowdown')) dy -= 1;
  if (dx || dy) {
    const n = Math.hypot(dx, dy);
    camara.desplazarPantalla((dx / n) * VELOCIDAD_TECLADO * dt, (dy / n) * VELOCIDAD_TECLADO * dt);
    marcar();
  }
  if (camara.actualizar(dt)) marcar();

  if (sucio) {
    sucio = false;
    dibujar();
  }
  requestAnimationFrame(cuadro);
}

// ------------------------------------------------------------------ arranque

async function arrancar(guardado = {}) {
  try {
    await cargarDatos();
    await Promise.all([mapa.cargarRelieve(), document.fonts?.ready]);
  } catch (err) {
    console.error(err);
    document.getElementById('carga').textContent = `No se pudo cargar el juego: ${err.message}`;
    return;
  }
  iniciarTiempo(datos.escenario);
  mapa.reconstruir();
  datos.eventos.addEventListener('dueno', () => {
    mapa.reconstruir();
    marcar();
  });
  iniciarInterfaz({ alSoltar: () => seleccionar(-1) });

  ajustarTamano();
  new ResizeObserver(ajustarTamano).observe(lienzo);
  const jugador = datos.paises[datos.escenario.pais_jugador];
  camara.configurar(datos.limites, jugador ? jugador.posEtiqueta : { x: 0, y: 0 }, ZOOM_INICIAL);

  // Volver al estado anterior si la página se actualizó con el juego abierto.
  if (guardado.camara) {
    Object.assign(camara, guardado.camara);
    camara.zoomObjetivo = camara.zoom;
  }
  if (guardado.tiempo) {
    Object.assign(tiempo, guardado.tiempo);
    actualizarReloj();
  }
  if (Number.isInteger(guardado.seleccionada)) seleccionar(guardado.seleccionada);
  mapa.nocheActiva = guardado.nocheActiva ?? true;

  window.claude?.hot?.snapshot?.(() => ({
    camara: { x: camara.x, y: camara.y, zoom: camara.zoom },
    tiempo: { horas: tiempo.horas, velocidad: tiempo.velocidad, pausado: tiempo.pausado },
    seleccionada: mapa.seleccionada,
    nocheActiva: mapa.nocheActiva,
  }));

  document.getElementById('carga').hidden = true;
  lienzo.style.cursor = 'grab';
  marcar();
  requestAnimationFrame(cuadro);
  // Para pruebas desde la consola del navegador.
  window.juego = { datos, camara, mapa, tiempo, seleccionar };
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(arrancar);
else arrancar(hot?.data ?? {});
