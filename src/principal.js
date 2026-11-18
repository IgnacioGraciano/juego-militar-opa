// Arranque del juego: carga los datos, arma el mapa y maneja el mouse, el teclado,
// las órdenes a las tropas y el dibujo.

import { datos, cargarDatos, provinciaEn } from './datos.js';
import { Camara } from './camara.js';
import { Mapa } from './mapa.js';
import { dibujarEtiquetas } from './etiquetas.js';
import { dibujarUnidades, fichaEn } from './unidades.js';
import {
  tiempo, iniciarTiempo, avanzarTiempo, alternarPausa, fijarVelocidad, acelerar, frenar, posicionSol,
} from './tiempo.js';
import {
  ejercito, generarEjercitos, actualizarHora, ordenarMovimiento, enemigosEn, enGuerra, declararGuerra,
  reclutar, brigadaPorId, calcularRuta, mensaje,
} from './ejercito.js';
import {
  operaciones, actualizarOperaciones, planInicial, lanzarOperacion, decidir, ejesPosibles,
} from './operaciones.js';
import {
  iniciarInterfaz, actualizarReloj, actualizarResumen, mostrarCursor, mostrarProvincia, mostrarTropas,
  mostrarModo, abrirPlan, cerrarPlan, planActual, renderPlan, operacionesPendientes,
} from './interfaz.js';

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
let jugador = '';

// Estado de la interacción
const estado = {
  modo: 'normal', // 'normal' | 'mover' | 'objetivo' (elegir provincia a atacar) | 'plan'
  seleccion: new Set(), // ids de brigadas propias elegidas
  provincia: -1, // provincia con la ficha abierta
  rutaVista: null,
};

const marcar = () => { sucio = true; };

// ------------------------------------------------------------------ tamaño y dibujo

function ajustarTamano() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = lienzo.getBoundingClientRect();
  lienzo.width = Math.max(1, Math.round(r.width * dpr));
  lienzo.height = Math.max(1, Math.round(r.height * dpr));
  camara.fijarTamano(r.width, r.height);
  marcar();
}

function dibujar() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLOR_FONDO;
  ctx.fillRect(0, 0, camara.ancho, camara.alto);
  const z = camara.zoom * dpr;
  ctx.setTransform(z, 0, 0, z, dpr * (camara.ancho / 2 - camara.x * camara.zoom), dpr * (camara.alto / 2 - camara.y * camara.zoom));
  mapa.dibujar(ctx, camara, posicionSol());
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dibujarEtiquetas(ctx, camara);
  dibujarUnidades(ctx, camara, { jugador, seleccion: estado.seleccion, plan: planActual(), rutaVista: estado.rutaVista });
}

// ------------------------------------------------------------------ paneles

function refrescarPaneles() {
  mostrarTropas(estado.seleccion);
  const conTropas = estado.seleccion.size > 0;
  if (conTropas) mostrarProvincia(-1);
  else mostrarProvincia(estado.provincia);
  mapa.seleccionada = conTropas ? -1 : estado.provincia;
  actualizarResumen();
  marcar();
}

function fijarModo(modo) {
  estado.modo = modo;
  estado.rutaVista = null;
  mostrarModo({
    mover: 'Elegí el destino · Esc para cancelar',
    objetivo: 'Elegí la provincia enemiga a atacar · Esc para cancelar',
    plan: null,
    normal: null,
  }[modo]);
  marcar();
}

function elegirProvincia(i) {
  estado.seleccion.clear();
  estado.provincia = i;
  refrescarPaneles();
}

function elegirTropas(ids, sumar) {
  if (!sumar) estado.seleccion.clear();
  for (const id of ids) {
    if (sumar && estado.seleccion.has(id)) estado.seleccion.delete(id);
    else estado.seleccion.add(id);
  }
  estado.provincia = -1;
  refrescarPaneles();
}

function soltarTodo() {
  if (estado.modo === 'plan') { cerrarPlan(); fijarModo('normal'); return; }
  if (estado.modo !== 'normal') { fijarModo('normal'); return; }
  if (estado.seleccion.size) { estado.seleccion.clear(); refrescarPaneles(); return; }
  elegirProvincia(-1);
}

// ------------------------------------------------------------------ órdenes

const tropasElegidas = () => [...estado.seleccion].map(brigadaPorId).filter(Boolean);

function moverElegidas(destino) {
  const errores = [];
  for (const b of tropasElegidas()) {
    const e = ordenarMovimiento(b, destino);
    if (e) errores.push(e);
  }
  if (errores.length) mensaje(errores[0], 'malo', jugador);
  refrescarPaneles();
}

// Orden con clic derecho: mover, o atacar con la plantilla rápida si hay enemigos.
function ordenSobre(destino) {
  if (destino < 0 || !estado.seleccion.size) return;
  if (enemigosEn(jugador, destino).length) {
    const plan = planInicial(jugador, destino, tropasElegidas());
    if (plan.eje < 0) { mensaje('Para atacar esa provincia tiene que limitar con una provincia tuya.', 'malo', jugador); return; }
    plan.rapida = true;
    plan.diasPreparacion = 0;
    plan.artilleria = { preparacion: false, ruptura: true, explotacion: false };
    const e = lanzarOperacion(plan);
    if (e) mensaje(e, 'malo', jugador);
    estado.seleccion.clear();
    refrescarPaneles();
    return;
  }
  moverElegidas(destino);
}

function abrirPlanSobre(objetivo, preferidas = tropasElegidas()) {
  if (!enGuerra(jugador, datos.duenos[objetivo])) return;
  if (!ejesPosibles(jugador, objetivo).length) {
    mensaje('Para atacar esa provincia tiene que limitar con una provincia tuya.', 'malo', jugador);
    return;
  }
  abrirPlan(planInicial(jugador, objetivo, preferidas));
  fijarModo('plan');
}

// Clic sobre el mapa mientras se arma un plan: sumar o sacar objetivos.
function clicEnPlan(i) {
  const plan = planActual();
  if (!plan || i < 0) return;
  const k = plan.objetivos.indexOf(i);
  if (k > 0) plan.objetivos.splice(k, 1);
  else if (k < 0 && enGuerra(jugador, datos.duenos[i])) {
    const ultimo = plan.objetivos.at(-1);
    if (datos.provincias[ultimo].conexiones.some((c) => c.j === i)) plan.objetivos.push(i);
    else mensaje('Los objetivos de la explotación tienen que ir pegados uno al otro.', 'malo', jugador);
  } else if (ejesPosibles(jugador, plan.objetivos[0]).includes(i)) plan.eje = i;
  renderPlan();
  marcar();
}

const acciones = {
  reclutar: (tipo, prov) => {
    const e = reclutar(jugador, tipo, prov);
    if (e) mensaje(e, 'malo', jugador);
    refrescarPaneles();
  },
  declararGuerra: (pais) => {
    declararGuerra(jugador, pais);
    refrescarPaneles();
  },
  planear: (prov) => abrirPlanSobre(prov),
  decidir: (op, eleccion) => {
    decidir(op, eleccion);
    refrescarPaneles();
    const otra = operacionesPendientes()[0];
    if (otra) setTimeout(() => ejercito.eventos.dispatchEvent(new CustomEvent('decision', { detail: otra })), 50);
  },
  quitarDeSeleccion: (id) => { estado.seleccion.delete(id); refrescarPaneles(); },
  centrarEn: (prov) => {
    const c = datos.provincias[prov].centroPos;
    camara.x = c.x;
    camara.y = c.y;
    camara.limitar();
    marcar();
  },
  planCambio: marcar,
};

document.getElementById('cerrar-ficha').addEventListener('click', () => elegirProvincia(-1));
document.getElementById('cerrar-tropas').addEventListener('click', () => { estado.seleccion.clear(); fijarModo('normal'); refrescarPaneles(); });
document.getElementById('tropas-mover').addEventListener('click', () => fijarModo('mover'));
document.getElementById('tropas-atacar').addEventListener('click', () => fijarModo('objetivo'));
document.getElementById('plan-cerrar').addEventListener('click', () => { cerrarPlan(); fijarModo('normal'); });
function lanzar(rapida) {
  const plan = planActual();
  if (!plan) return;
  if (rapida) {
    plan.rapida = true;
    plan.diasPreparacion = 0;
  }
  const e = lanzarOperacion(plan);
  if (e) { mensaje(e, 'malo', jugador); return; }
  cerrarPlan();
  fijarModo('normal');
  estado.seleccion.clear();
  refrescarPaneles();
  if (tiempo.pausado) mensaje('La operación está lista. Sacá la pausa para que empiece.', 'info', jugador);
}
document.getElementById('plan-lanzar').addEventListener('click', () => lanzar(false));
document.getElementById('plan-rapida').addEventListener('click', () => lanzar(true));

// ------------------------------------------------------------------ mouse y pantalla táctil

const punteros = new Map(); // pointerId -> {x, y}
let inicio = null; // {x, y, boton, shift} del primer puntero apretado
let arrastrando = false;
let pellizco = null;

function posLocal(e) {
  const r = lienzo.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function clic(p, boton, shift) {
  const m = camara.pantallaAMundo(p.x, p.y);
  const prov = provinciaEn(m.x, m.y);
  if (boton === 2) { ordenSobre(prov); return; }
  if (estado.modo === 'mover') { if (prov >= 0) moverElegidas(prov); fijarModo('normal'); return; }
  if (estado.modo === 'objetivo') {
    fijarModo('normal');
    if (prov >= 0 && enGuerra(jugador, datos.duenos[prov])) abrirPlanSobre(prov);
    else mensaje('Elegí una provincia de un país con el que estés en guerra.', 'malo', jugador);
    return;
  }
  if (estado.modo === 'plan') { clicEnPlan(prov); return; }
  const ficha = fichaEn(p.x, p.y);
  if (ficha && ficha.pais === jugador) { elegirTropas(ficha.ids, shift); return; }
  elegirProvincia(prov);
}

function previsualizarRuta(p) {
  const b = tropasElegidas().find((x) => !x.formacion && !x.operacion);
  if (!b || (estado.modo !== 'normal' && estado.modo !== 'mover')) {
    if (estado.rutaVista) { estado.rutaVista = null; marcar(); }
    return;
  }
  const m = camara.pantallaAMundo(p.x, p.y);
  const prov = provinciaEn(m.x, m.y);
  if (prov < 0 || prov === b.provincia) { estado.rutaVista = null; marcar(); return; }
  if (estado.rutaVista?.at(-1) === prov) return;
  const r = calcularRuta(b, prov);
  estado.rutaVista = r ? [b.provincia, ...r.ruta] : null;
  marcar();
}

lienzo.addEventListener('pointerdown', (e) => {
  lienzo.setPointerCapture(e.pointerId);
  const p = posLocal(e);
  punteros.set(e.pointerId, p);
  if (punteros.size === 1) {
    inicio = { ...p, boton: e.button, shift: e.shiftKey };
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
    const m = camara.pantallaAMundo(p.x, p.y);
    const prov = provinciaEn(m.x, m.y);
    if (prov !== mapa.bajoCursor) {
      mapa.bajoCursor = prov;
      mostrarCursor(prov);
      marcar();
    }
    lienzo.style.cursor = fichaEn(p.x, p.y) ? 'pointer' : estado.modo !== 'normal' && estado.modo !== 'plan' ? 'crosshair' : prov >= 0 ? 'pointer' : 'grab';
    previsualizarRuta(p);
    return;
  }
  const anterior = punteros.get(e.pointerId);
  punteros.set(e.pointerId, p);
  if (punteros.size === 2 && pellizco) {
    const [a, b] = [...punteros.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    camara.zoomHacia((pellizco.zoom * d) / pellizco.distancia / camara.zoomObjetivo, (a.x + b.x) / 2, (a.y + b.y) / 2);
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
    if (e.type === 'pointerup' && !arrastrando && inicio && (inicio.boton === 0 || inicio.boton === 2)) {
      clic(posLocal(e), inicio.boton, inicio.shift);
    }
    inicio = null;
    arrastrando = false;
  }
}
lienzo.addEventListener('pointerup', soltar);
lienzo.addEventListener('pointercancel', soltar);
lienzo.addEventListener('pointerleave', () => {
  if (punteros.size === 0 && mapa.bajoCursor >= 0) {
    mapa.bajoCursor = -1;
    mostrarCursor(-1);
    marcar();
  }
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
  if (!document.getElementById('decision').hidden && k !== 'escape') return;
  if (k === ' ' || k === 'p') {
    if (e.target.closest?.('button')) e.target.blur();
    alternarPausa();
  } else if (k >= '1' && k <= '5') fijarVelocidad(Number(k));
  else if (k === '+' || k === '=') acelerar();
  else if (k === '-') frenar();
  else if (k === 'n') { mapa.nocheActiva = !mapa.nocheActiva; marcar(); }
  else if (k === 'escape') soltarTodo();
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
  if (!tiempo.pausado && (mapa.nocheActiva || ejercito.brigadas.some((b) => b.mov))) marcar();

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

// Cada hora de juego: tropas, operaciones y paneles.
let horasDesdePanel = 0;
function alPasarHora() {
  actualizarHora(tiempo.horas);
  actualizarOperaciones();
  marcar();
  // Los paneles se refrescan cada 6 horas de juego (o cuando pasa algo).
  if (++horasDesdePanel >= 6) {
    horasDesdePanel = 0;
    refrescarPaneles();
    if (planActual()) renderPlan();
  }
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
  jugador = datos.escenario.pais_jugador;
  document.documentElement.style.setProperty('--pais-jugador', datos.paises[jugador]?.color ?? '#3d6d93');
  iniciarTiempo(datos.escenario);
  generarEjercitos();
  mapa.reconstruir();
  datos.eventos.addEventListener('dueno', () => { mapa.reconstruir(); marcar(); });
  ejercito.eventos.addEventListener('cambio', () => {
    for (const id of [...estado.seleccion]) if (!brigadaPorId(id)) estado.seleccion.delete(id);
    refrescarPaneles();
  });
  tiempo.eventos.addEventListener('hora', alPasarHora);
  iniciarInterfaz(acciones);

  ajustarTamano();
  new ResizeObserver(ajustarTamano).observe(lienzo);
  const pj = datos.paises[jugador];
  camara.configurar(datos.limites, pj ? pj.posEtiqueta : { x: 0, y: 0 }, ZOOM_INICIAL);
  if (guardado.camara) {
    Object.assign(camara, guardado.camara);
    camara.zoomObjetivo = camara.zoom;
  }
  mapa.nocheActiva = guardado.nocheActiva ?? true;
  window.claude?.hot?.snapshot?.(() => ({
    camara: { x: camara.x, y: camara.y, zoom: camara.zoom },
    nocheActiva: mapa.nocheActiva,
  }));

  document.getElementById('carga').hidden = true;
  lienzo.style.cursor = 'grab';
  refrescarPaneles();
  actualizarReloj();
  requestAnimationFrame(cuadro);
  // Para pruebas desde la consola del navegador.
  window.juego = { datos, camara, mapa, tiempo, ejercito, operaciones, estado, acciones, elegirTropas, ordenSobre, abrirPlanSobre, lanzar };
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(arrancar);
else arrancar(hot?.data ?? {});
