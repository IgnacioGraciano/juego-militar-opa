// Arranque del juego: carga los datos, arma el mapa y maneja el mouse, el teclado,
// las órdenes a las tropas y el dibujo.

import { datos, cargarDatos, provinciaEn } from './datos.js';
import { Camara } from './camara.js';
import { Mapa } from './mapa.js';
import { dibujarEtiquetas } from './etiquetas.js';
import { dibujarUnidades, fichaEn, posicionesBrigadas } from './unidades.js';
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
import { iniciarEconomia, actualizarDiaEconomia } from './economia.js';
import {
  iniciarSuministro, actualizarHoraSuministro, actualizarDiaSuministro, recalcularTodo, construirDeposito,
} from './suministro.js';
import {
  iniciarAviacion, actualizarHoraAviacion, actualizarDiaAviacion, escuadronPorId, modelo as modeloAvion, basesDe, cambiarBase,
} from './aviacion.js';
import { iniciarPanelPais, abrirPais, cerrarPais, paisAbierto, refrescarPais, actualizarBarra } from './panel_pais.js';
import { iniciarDisenador, actualizarReconversiones } from './disenador.js';
import { iniciarMarina, actualizarHoraMarina, actualizarDiaMarina, zonaEn, ordenarFlota, flotaPorId } from './marina.js';
import {
  iniciarDiplomacia, actualizarHoraDiplomacia, actualizarDiaDiplomacia, declararGuerra as declararConJustificacion,
} from './diplomacia.js';
import { actualizarDiaIA } from './ia.js';
import {
  iniciarPanelMarina, mostrarFlota, mostrarEvento, mostrarMediacion, mostrarPropuestaPaz, mostrarCombateNaval, mostrarMenuPartida,
} from './panel_marina.js';
import {
  iniciarPanelAereo, abrirPaquete, cerrarPaquete, paqueteActual, renderPaquete, mostrarResumenIncursion, mostrarEscuadron,
} from './panel_aereo.js';

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
  escuadron: null, // id del escuadrón elegido
  flota: null, // id de la flota elegida
  caja: null, // selección con caja: {x0, y0, x1, y1} en pantalla
  alcance: null, // {x, y, km}: círculo de alcance de un escuadrón
  alcanceFijo: false,
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
  dibujarUnidades(ctx, camara, {
    jugador, seleccion: estado.seleccion, plan: planActual(), rutaVista: estado.rutaVista, vista: mapa.vista, alcance: alcanceVisible(),
    escuadron: estado.escuadron, flota: estado.flota,
  });
  if (estado.caja) {
    const c = estado.caja;
    const x = Math.min(c.x0, c.x1);
    const y = Math.min(c.y0, c.y1);
    ctx.fillStyle = 'rgba(226, 196, 120, 0.12)';
    ctx.fillRect(x, y, Math.abs(c.x1 - c.x0), Math.abs(c.y1 - c.y0));
    ctx.strokeStyle = 'rgba(226, 196, 120, 0.95)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(c.x1 - c.x0), Math.abs(c.y1 - c.y0));
    ctx.setLineDash([]);
  }
}

// El círculo de alcance: el del escuadrón elegido, o el que se muestra desde un panel.
function alcanceVisible() {
  if (estado.alcance) return estado.alcance;
  const e = estado.escuadron != null ? escuadronPorId(estado.escuadron) : null;
  if (!e) return null;
  const b = datos.bases[e.base];
  return { x: b.x, y: b.y, km: modeloAvion(e.modelo).radio_km };
}

// ------------------------------------------------------------------ paneles

function refrescarPaneles() {
  if (estado.escuadron != null && !escuadronPorId(estado.escuadron)) estado.escuadron = null;
  if (estado.flota != null && !flotaPorId(estado.flota)) estado.flota = null;
  mostrarTropas(estado.seleccion);
  mostrarEscuadron(estado.escuadron);
  mostrarFlota(estado.flota);
  const conTropas = estado.seleccion.size > 0 || estado.escuadron != null || estado.flota != null;
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
    blanco: 'Elegí la provincia enemiga a atacar desde el aire · Esc para cancelar',
    base: 'Elegí una provincia tuya con base aérea · Esc para cancelar',
    objetivo: 'Elegí la provincia enemiga a atacar · Esc para cancelar',
    plan: null,
    normal: null,
  }[modo]);
  marcar();
}

function elegirProvincia(i) {
  estado.seleccion.clear();
  estado.escuadron = null;
  estado.flota = null;
  estado.provincia = i;
  refrescarPaneles();
}

function elegirFlota(id) {
  estado.seleccion.clear();
  estado.provincia = -1;
  estado.escuadron = null;
  estado.flota = id;
  refrescarPaneles();
}

function elegirEscuadron(id) {
  estado.seleccion.clear();
  estado.provincia = -1;
  estado.flota = null;
  estado.escuadron = id;
  estado.alcance = null;
  estado.alcanceFijo = false;
  refrescarPaneles();
}

function elegirTropas(ids, sumar) {
  estado.escuadron = null;
  estado.flota = null;
  if (!sumar) estado.seleccion.clear();
  for (const id of ids) {
    if (sumar && estado.seleccion.has(id)) estado.seleccion.delete(id);
    else estado.seleccion.add(id);
  }
  estado.provincia = -1;
  refrescarPaneles();
}

function soltarTodo() {
  if (!document.getElementById('ayuda').hidden) { document.getElementById('ayuda').hidden = true; return; }
  if (!document.getElementById('menu-partida').hidden) { document.getElementById('menu-partida').hidden = true; return; }
  if (paqueteActual()) { cerrarPaquete(); return; }
  if (paisAbierto()) { cerrarPais(); return; }
  if (estado.alcanceFijo) { estado.alcance = null; estado.alcanceFijo = false; marcar(); return; }
  if (estado.modo === 'plan') { cerrarPlan(); fijarModo('normal'); return; }
  if (estado.modo !== 'normal') { fijarModo('normal'); return; }
  if (estado.seleccion.size || estado.escuadron != null || estado.flota != null) {
    estado.seleccion.clear();
    estado.escuadron = null;
    estado.flota = null;
    refrescarPaneles();
    return;
  }
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
  if (destino >= 0 && estado.escuadron != null) { ordenAerea(destino); return; }
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

// Clic derecho con un escuadrón elegido: en una provincia propia con base, se muda;
// en una provincia enemiga, se arma un paquete de ataque con ese escuadrón.
function ordenAerea(destino) {
  const e = escuadronPorId(estado.escuadron);
  if (!e) return;
  if (datos.duenos[destino] === jugador) {
    const base = basesDe(jugador).find((b) => b.provincia === destino);
    if (!base) { mensaje(`${datos.provincias[destino].nombre} no tiene base aérea.`, 'malo', jugador); return; }
    const err = cambiarBase(e, base.indice);
    if (err) mensaje(err, 'malo', jugador);
    else mensaje(`El ${e.nombre} se muda a ${base.nombre}.`, 'info', jugador);
    refrescarPaneles();
    return;
  }
  if (enGuerra(jugador, datos.duenos[destino])) {
    abrirPaquete(jugador, destino, e.id);
    return;
  }
  mensaje('Solo se ataca a países con los que estás en guerra.', 'malo', jugador);
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
    const e = declararConJustificacion(jugador, pais);
    if (e) mensaje(e, 'malo', jugador);
    refrescarPaneles();
  },
  pausar: () => {
    if (!tiempo.pausado) { tiempo.pausado = true; tiempo.eventos.dispatchEvent(new Event('estado')); }
  },
  elegirFlota: (id) => { cerrarPais(); elegirFlota(id); },
  soltarFlota: () => { estado.flota = null; refrescarPaneles(); },
  alCargar: () => {
    estado.seleccion.clear();
    estado.escuadron = null;
    estado.flota = null;
    mapa.reconstruir();
    document.getElementById('menu-partida').hidden = true;
    actualizarReloj();
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
  abrirPais: (pais, pestana) => abrirPais(pais, pestana),
  construirDeposito: (prov) => {
    const e = construirDeposito(jugador, prov);
    if (e) mensaje(e, 'malo', jugador);
    refrescarPaneles();
  },
  paqueteSobre: (prov) => {
    cerrarPlan();
    abrirPaquete(jugador, prov, estado.escuadron);
    fijarModo('normal');
  },
  elegirBlancoAereo: () => {
    cerrarPais();
    fijarModo('blanco');
  },
  mostrarAlcance: (e, fijo = false) => {
    if (!e) {
      if (!estado.alcanceFijo) { estado.alcance = null; marcar(); }
      return;
    }
    const b = datos.bases[e.base];
    estado.alcance = { x: b.x, y: b.y, km: modeloAvion(e.modelo).radio_km };
    estado.alcanceFijo = fijo;
    if (fijo) {
      camara.x = b.x;
      camara.y = b.y;
      camara.limitar();
    }
    marcar();
  },
  fijarVista: (vista) => fijarVista(vista),
  elegirYCentrar: (id) => {
    const b = brigadaPorId(id);
    if (!b) return;
    cerrarPais();
    elegirTropas([id], false);
    acciones.centrarEn(b.provincia);
  },
  alCambiarPanel: marcar,
  soloEsta: (id) => elegirTropas([id], false),
  elegirEscuadron: (id) => elegirEscuadron(id),
  soltarEscuadron: () => { estado.escuadron = null; refrescarPaneles(); },
  modoBase: () => fijarModo('base'),
  atacarConEscuadron: () => { fijarModo('blanco'); },
};

function fijarVista(vista) {
  mapa.vista = vista;
  for (const b of document.querySelectorAll('.vistas button')) b.setAttribute('aria-pressed', String(b.dataset.vista === vista));
  marcar();
}
for (const b of document.querySelectorAll('.vistas button')) b.addEventListener('click', () => fijarVista(b.dataset.vista));
document.getElementById('boton-partida').addEventListener('click', (e) => {
  const m = document.getElementById('menu-partida');
  if (m.hidden) { acciones.pausar(); mostrarMenuPartida(camara); } else m.hidden = true;
  e.currentTarget.setAttribute('aria-expanded', String(!m.hidden));
});
document.getElementById('boton-ayuda').addEventListener('click', (e) => {
  const a = document.getElementById('ayuda');
  a.hidden = !a.hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!a.hidden));
});

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
  if (boton === 2 && estado.flota != null) {
    const f = flotaPorId(estado.flota);
    const z = zonaEn(m.x, m.y);
    if (f && z) {
      const e = ordenarFlota(f, z.clave);
      if (e) mensaje(e, 'malo', jugador);
      refrescarPaneles();
    }
    return;
  }
  if (boton === 2) { ordenSobre(prov); return; }
  if (estado.modo === 'mover') { if (prov >= 0) moverElegidas(prov); fijarModo('normal'); return; }
  if (estado.modo === 'objetivo') {
    fijarModo('normal');
    if (prov >= 0 && enGuerra(jugador, datos.duenos[prov])) abrirPlanSobre(prov);
    else mensaje('Elegí una provincia de un país con el que estés en guerra.', 'malo', jugador);
    return;
  }
  if (estado.modo === 'blanco') {
    fijarModo('normal');
    if (prov >= 0 && enGuerra(jugador, datos.duenos[prov])) acciones.paqueteSobre(prov);
    else mensaje('Elegí una provincia de un país con el que estés en guerra.', 'malo', jugador);
    return;
  }
  if (estado.modo === 'plan') { clicEnPlan(prov); return; }
  if (estado.modo === 'base') {
    fijarModo('normal');
    if (prov >= 0) ordenAerea(prov);
    return;
  }
  const ficha = fichaEn(p.x, p.y);
  if (ficha?.flota != null) {
    if (ficha.pais === jugador) elegirFlota(ficha.flota);
    else abrirPais(ficha.pais, 'marina');
    return;
  }
  if (ficha?.escuadron != null) {
    if (ficha.pais === jugador) elegirEscuadron(ficha.escuadron);
    else abrirPais(ficha.pais, 'aviacion');
    return;
  }
  if (ficha && ficha.pais === jugador) { elegirTropas(ficha.ids, shift); return; }
  if (estado.alcanceFijo) { estado.alcance = null; estado.alcanceFijo = false; }
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
    inicio = { ...p, boton: e.button, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, mouse: e.pointerType === 'mouse' };
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
    // Con el botón izquierdo del mouse se arma una caja para elegir tropas (como en HOI4);
    // con el derecho o el del medio, o con el dedo, se mueve el mapa.
    if (inicio.mouse && inicio.boton === 0 && (estado.modo === 'normal' || estado.modo === 'mover')) {
      estado.caja = { x0: inicio.x, y0: inicio.y, x1: p.x, y1: p.y };
      lienzo.style.cursor = 'crosshair';
    } else lienzo.style.cursor = 'grabbing';
  }
  if (arrastrando && estado.caja) {
    estado.caja.x1 = p.x;
    estado.caja.y1 = p.y;
    marcar();
  } else if (arrastrando) {
    camara.desplazarPantalla(p.x - anterior.x, p.y - anterior.y);
    marcar();
  }
});

function soltar(e) {
  if (!punteros.has(e.pointerId)) return;
  punteros.delete(e.pointerId);
  if (punteros.size < 2) pellizco = null;
  if (punteros.size === 0) {
    if (estado.caja) {
      cerrarCaja(inicio.shift || inicio.ctrl);
    } else if (e.type === 'pointerup' && !arrastrando && inicio && (inicio.boton === 0 || inicio.boton === 2)) {
      clic(posLocal(e), inicio.boton, inicio.shift || inicio.ctrl);
    }
    inicio = null;
    arrastrando = false;
  }
}
// Elige las brigadas propias cuyas fichas quedaron dentro de la caja.
function cerrarCaja(sumar) {
  const c = estado.caja;
  estado.caja = null;
  const x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1);
  const y0 = Math.min(c.y0, c.y1), y1 = Math.max(c.y0, c.y1);
  const ids = posicionesBrigadas().filter((q) => q.pais === jugador && q.x >= x0 - 10 && q.x <= x1 + 10 && q.y >= y0 - 8 && q.y <= y1 + 8).map((q) => q.id);
  if (!ids.length && !sumar) { estado.seleccion.clear(); refrescarPaneles(); return; }
  if (sumar) for (const id of ids) estado.seleccion.add(id);
  else estado.seleccion = new Set(ids);
  estado.escuadron = null;
  estado.provincia = -1;
  refrescarPaneles();
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
lienzo.addEventListener('dblclick', (e) => {
  const p = posLocal(e);
  const m = camara.pantallaAMundo(p.x, p.y);
  const prov = provinciaEn(m.x, m.y);
  if (prov >= 0 && estado.modo === 'normal') abrirPais(datos.duenos[prov], 'resumen');
});
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
  else if (k === 'v') fijarVista(mapa.vista === 'suministro' ? 'politica' : 'suministro');
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
  actualizarHoraSuministro();
  actualizarHoraAviacion();
  actualizarReconversiones();
  actualizarHoraMarina();
  actualizarHoraDiplomacia();
  actualizarOperaciones();
  if (tiempo.horas % 24 === 0) {
    const dia = tiempo.horas / 24;
    actualizarDiaSuministro();
    actualizarDiaEconomia();
    actualizarDiaAviacion(dia);
    actualizarDiaMarina();
    actualizarDiaDiplomacia();
    actualizarDiaIA(dia);
  }
  marcar();
  // Los paneles se refrescan cada 6 horas de juego (o cuando pasa algo).
  if (++horasDesdePanel >= 6) {
    horasDesdePanel = 0;
    refrescarPaneles();
    refrescarPais();
    if (planActual()) renderPlan();
    if (paqueteActual()) renderPaquete();
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
  iniciarDisenador();
  generarEjercitos();
  iniciarEconomia();
  iniciarAviacion();
  iniciarMarina();
  iniciarSuministro();
  iniciarDiplomacia();
  mapa.jugador = jugador;
  mapa.reconstruir();
  datos.eventos.addEventListener('dueno', () => { mapa.reconstruir(); recalcularTodo(); marcar(); });
  ejercito.eventos.addEventListener('incursion', (e) => mostrarResumenIncursion(e.detail));
  for (const tipo of ['economia', 'aviacion', 'suministro', 'marina', 'diplomacia', 'diseno']) {
    ejercito.eventos.addEventListener(tipo, () => { actualizarBarra(); marcar(); });
  }
  ejercito.eventos.addEventListener('evento', (e) => mostrarEvento(e.detail));
  ejercito.eventos.addEventListener('mediacion', (e) => mostrarMediacion(e.detail));
  ejercito.eventos.addEventListener('propuesta_paz', (e) => mostrarPropuestaPaz(e.detail));
  ejercito.eventos.addEventListener('combate_naval', (e) => mostrarCombateNaval(e.detail));
  ejercito.eventos.addEventListener('cambio', () => {
    for (const id of [...estado.seleccion]) if (!brigadaPorId(id)) estado.seleccion.delete(id);
    refrescarPaneles();
  });
  tiempo.eventos.addEventListener('hora', alPasarHora);
  iniciarInterfaz(acciones);
  iniciarPanelPais(acciones);
  iniciarPanelAereo(acciones);
  iniciarPanelMarina(acciones);

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
  window.juego = {
    datos, camara, mapa, tiempo, ejercito, operaciones, estado, acciones, elegirTropas, ordenSobre, abrirPlanSobre, lanzar,
    abrirPais, escuadronPorId,
    modulos: {
      economia: await import('./economia.js'), aviacion: await import('./aviacion.js'), suministro: await import('./suministro.js'),
      marina: await import('./marina.js'), diplomacia: await import('./diplomacia.js'), disenador: await import('./disenador.js'),
      partida: await import('./partida.js'), operaciones: await import('./operaciones.js'),
    },
  };
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(arrancar);
else arrancar(hot?.data ?? {});
