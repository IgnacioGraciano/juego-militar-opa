// Dibuja las tropas (fichas con símbolo militar), rutas de marcha y flechas de las
// Operaciones, en coordenadas de pantalla. También resuelve los clics sobre las fichas.

import { datos } from './datos.js';
import { geo, aLonLat } from './geo.js';
import { ejercito, avanceTramo, enGuerra } from './ejercito.js';
import { operaciones } from './operaciones.js';
import { FUENTE_ETIQUETAS } from './etiquetas.js';
import { dibujarPictograma, dibujarSilueta } from './simbolos.js';
import { aviacion, modelo } from './aviacion.js';
import { suministro } from './suministro.js';
import { tiempo } from './tiempo.js';
import { marina, totalBarcos, posicionFlota } from './marina.js';

const ANCHO = 34;
const ALTO = 22;
const ORDEN_TIPOS = ['blindada', 'mecanizada', 'montana', 'infanteria'];
const BRONCE = 'rgb(226, 196, 120)';

let fichas = []; // zonas clicables: {x, y, w, h, ids, pais, provincia} o {escuadron}
let posiciones = []; // {id, x, y} de cada brigada dibujada
// Desde este zoom cada brigada tiene su propia ficha.
export const ZOOM_INDIVIDUAL = 1.5;

export function fichaEn(x, y) {
  for (let k = fichas.length - 1; k >= 0; k--) {
    const f = fichas[k];
    if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return f;
  }
  return null;
}

function colorPais(pais, oscurecer = 0.25) {
  const [r, g, b] = datos.paises[pais]?.rgb ?? [128, 128, 128];
  const k = 1 - oscurecer;
  const c = (v) => Math.min(255, Math.round(v * k));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

const centroPantalla = (camara, prov) => {
  const c = datos.provincias[prov].centroPos;
  return camara.mundoAPantalla(c.x, c.y);
};

export function dibujarUnidades(ctx, camara, vista) {
  fichas = [];
  posiciones = [];
  const { jugador, seleccion, plan, rutaVista } = vista;
  ctx.save();

  if (vista.vista === 'suministro') dibujarRutasSuministro(ctx, camara, jugador);
  dibujarDepositos(ctx, camara, jugador, vista.vista === 'suministro');
  dibujarBasesAereas(ctx, camara, jugador, vista.escuadron);
  if (vista.alcance) dibujarAlcance(ctx, camara, vista.alcance);
  dibujarVuelos(ctx, camara, jugador);
  dibujarMar(ctx, camara, jugador, vista.flota);

  // Flechas de las Operaciones en curso
  for (const op of operaciones.lista) {
    if (op.pais !== jugador || op.estado === 'terminada') continue;
    const desde = op.fase === 'explotacion' ? op.ejeExplotacion : op.eje;
    const hasta = op.objetivos[op.objetivoActual];
    if (desde == null || desde < 0 || hasta == null) continue;
    const etiqueta = op.estado === 'reuniendo' ? 'Reuniendo tropas'
      : op.estado === 'preparando' ? `Preparación: ${Math.ceil(op.horasPreparacion / 24)} d`
        : op.estado === 'decision' ? 'Esperando orden' : op.fase === 'preparacion' ? 'Bombardeo' : op.fase === 'ruptura' ? 'Ruptura' : 'Explotación';
    flecha(ctx, centroPantalla(camara, desde), centroPantalla(camara, hasta), {
      color: op.estado === 'fase' ? 'rgba(214, 72, 52, 0.95)' : BRONCE,
      discontinua: op.estado === 'reuniendo' || op.estado === 'preparando',
      etiqueta,
    });
  }

  // Plan que se está armando
  if (plan && plan.eje >= 0) {
    let desde = plan.eje;
    plan.objetivos.forEach((o, k) => {
      flecha(ctx, centroPantalla(camara, desde), centroPantalla(camara, o), { color: BRONCE, discontinua: true, etiqueta: k === 0 ? 'Eje principal' : null });
      desde = o;
    });
  }
  if (plan) plan.objetivos.forEach((o, k) => marcaObjetivo(ctx, centroPantalla(camara, o), k + 1));

  // Ruta que se previsualiza al pasar el mouse con tropas elegidas
  if (rutaVista?.length > 1) linea(ctx, rutaVista.map((p) => centroPantalla(camara, p)), 'rgba(255, 245, 210, 0.9)', true, true);

  // Rutas de las brigadas propias en marcha
  const enMarcha = ejercito.brigadas.filter((b) => b.mov && b.pais === jugador);
  for (const b of enMarcha) {
    const pos = posicionBrigada(camara, b);
    const puntos = [pos, ...b.mov.ruta.map((p) => centroPantalla(camara, p))];
    linea(ctx, puntos, seleccion.has(b.id) ? 'rgba(255, 245, 210, 0.95)' : 'rgba(255, 245, 210, 0.55)', true, true);
  }

  // Fichas: de lejos agrupadas por provincia y país; de cerca, una por brigada.
  // Las que marchan van sueltas sobre su ruta.
  const individual = camara.zoom >= ZOOM_INDIVIDUAL;
  const porProvincia = new Map();
  for (const b of ejercito.brigadas) {
    const visible = b.pais === jugador || enGuerra(jugador, b.pais) || camara.zoom >= 1.0;
    if (!visible) continue;
    if (b.mov && b.pais === jugador) {
      dibujarFicha(ctx, posicionBrigada(camara, b), [b], seleccion);
      continue;
    }
    if (!porProvincia.has(b.provincia)) porProvincia.set(b.provincia, []);
    porProvincia.get(b.provincia).push(b);
  }
  for (const [prov, lista] of porProvincia) {
    lista.sort((a, b) => (a.pais === jugador) - (b.pais === jugador) || a.pais.localeCompare(b.pais) || a.id - b.id).reverse();
    const c = centroPantalla(camara, prov);
    // Grupos a dibujar: cada brigada sola (de cerca) o una ficha por país (de lejos)
    let grupos;
    if (individual) grupos = lista.map((b) => [b]);
    else {
      const m = new Map();
      for (const b of lista) { if (!m.has(b.pais)) m.set(b.pais, []); m.get(b.pais).push(b); }
      grupos = [...m.values()];
    }
    const cols = Math.min(individual ? 4 : 3, grupos.length);
    const filas = Math.ceil(grupos.length / cols);
    const pasoX = ANCHO + 5;
    const pasoY = ALTO + 9;
    const x0 = c.x - ((cols - 1) * pasoX) / 2;
    const y0 = c.y - 24 - ((filas - 1) * pasoY) / 2;
    grupos.forEach((g, k) => {
      const pos = { x: x0 + (k % cols) * pasoX, y: y0 + Math.floor(k / cols) * pasoY };
      dibujarFicha(ctx, pos, g, seleccion);
    });
    if (lista.some((b) => b.enCombate)) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - 24, Math.max(24, (cols * pasoX) / 2 + 8), Math.max(20, (filas * pasoY) / 2 + 8), 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(230, 70, 50, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

// Posiciones en pantalla de las brigadas propias (para la selección con caja).
export function posicionesBrigadas() {
  return posiciones;
}

function posicionBrigada(camara, b) {
  const a = datos.provincias[b.provincia].centroPos;
  const d = datos.provincias[b.mov.ruta[0]].centroPos;
  const t = avanceTramo(b);
  return camara.mundoAPantalla(a.x + (d.x - a.x) * t, a.y + (d.y - a.y) * t - 0);
}

function dibujarFicha(ctx, centro, lista, seleccion) {
  const x = Math.round(centro.x - ANCHO / 2);
  const y = Math.round(centro.y - ALTO / 2);
  const pais = lista[0].pais;
  const tipo = ORDEN_TIPOS.find((t) => lista.some((b) => b.tipo === t)) ?? 'infanteria';
  const elegida = lista.some((b) => seleccion.has(b.id));
  const formando = lista.every((b) => b.formacion);
  fichas.push({ x: x - 2, y: y - 2, w: ANCHO + 4, h: ALTO + 8, ids: lista.map((b) => b.id), pais, provincia: lista[0].provincia });
  for (const b of lista) posiciones.push({ id: b.id, pais, x: centro.x, y: centro.y });

  ctx.globalAlpha = formando ? 0.55 : 1;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(x + 1, y + 2, ANCHO, ALTO);
  ctx.fillStyle = colorPais(pais);
  ctx.fillRect(x, y, ANCHO, ALTO);
  ctx.lineWidth = elegida ? 2.5 : 1;
  ctx.strokeStyle = elegida ? BRONCE : 'rgba(10, 10, 10, 0.9)';
  ctx.strokeRect(x + 0.5, y + 0.5, ANCHO - 1, ALTO - 1);
  dibujarPictograma(ctx, tipo, x + 3, y + 2, ANCHO - 6, ALTO - 4);

  // Organización promedio
  const org = lista.reduce((s, b) => s + b.organizacion, 0) / lista.length;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y + ALTO + 1, ANCHO, 4);
  ctx.fillStyle = org > 0.6 ? 'rgb(120, 200, 110)' : org > 0.3 ? 'rgb(230, 190, 70)' : 'rgb(220, 80, 60)';
  ctx.fillRect(x + 1, y + ALTO + 2, (ANCHO - 2) * org, 2);

  if (lista.length > 1) {
    ctx.beginPath();
    ctx.arc(x + ANCHO, y, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.strokeStyle = BRONCE;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `600 11px ${FUENTE_ETIQUETAS}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(lista.length), x + ANCHO, y + 4);
    ctx.textAlign = 'left';
  }
  ctx.globalAlpha = 1;
}

function linea(ctx, puntos, color, discontinua, punta) {
  if (puntos.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(puntos[0].x, puntos[0].y);
  for (const p of puntos.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 4;
  ctx.setLineDash(discontinua ? [7, 5] : []);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);
  if (punta) puntaFlecha(ctx, puntos.at(-2), puntos.at(-1), color, 9);
}

function puntaFlecha(ctx, a, b, color, tam) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - tam * Math.cos(ang - 0.45), b.y - tam * Math.sin(ang - 0.45));
  ctx.lineTo(b.x - tam * Math.cos(ang + 0.45), b.y - tam * Math.sin(ang + 0.45));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Flecha gruesa curva para las Operaciones.
function flecha(ctx, a, b, { color, discontinua, etiqueta }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const largo = Math.hypot(dx, dy);
  if (largo < 8) return;
  const control = { x: (a.x + b.x) / 2 - dy * 0.18, y: (a.y + b.y) / 2 + dx * 0.18 };
  const fin = { x: b.x - (dx / largo) * 14, y: b.y - (dy / largo) * 14 };
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(control.x, control.y, fin.x, fin.y);
  ctx.setLineDash(discontinua ? [10, 6] : []);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.setLineDash([]);
  puntaFlecha(ctx, control, { x: b.x, y: b.y }, color, 16);
  if (etiqueta) {
    const m = { x: 0.25 * a.x + 0.5 * control.x + 0.25 * fin.x, y: 0.25 * a.y + 0.5 * control.y + 0.25 * fin.y };
    ctx.font = `600 12px ${FUENTE_ETIQUETAS}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(etiqueta.toUpperCase(), m.x, m.y - 8);
    ctx.fillStyle = '#fff';
    ctx.fillText(etiqueta.toUpperCase(), m.x, m.y - 8);
    ctx.textAlign = 'left';
  }
}

function marcaObjetivo(ctx, p, n) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = BRONCE;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.font = `600 13px ${FUENTE_ETIQUETAS}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = BRONCE;
  ctx.fillText(String(n), p.x, p.y + 4.5);
  ctx.textAlign = 'left';
}

// ------------------------------------------------------------------ suministro

function dibujarRutasSuministro(ctx, camara, jugador) {
  const central = suministro.centrales[jugador];
  for (const d of suministro.depositos) {
    if (d.pais !== jugador || !d.ruta.length) continue;
    const puntos = d.ruta.map((p) => centroPantalla(camara, p));
    linea(ctx, puntos, 'rgba(120, 210, 110, 0.9)', false, false);
  }
  for (const d of suministro.depositos) {
    if (d.pais !== jugador || d.conectado || d.horas > 0 || central < 0) continue;
    linea(ctx, [centroPantalla(camara, central), centroPantalla(camara, d.provincia)], 'rgba(230, 80, 60, 0.9)', true, false);
  }
}

// Depósitos propios: verde si llega el suministro, amarillo en obra, rojo cortado.
function dibujarDepositos(ctx, camara, jugador, destacar) {
  if (!destacar && camara.zoom < 0.9) return;
  const dibujar = (prov, estado, esCentral) => {
    const c = centroPantalla(camara, prov);
    const x = c.x - 9;
    const y = c.y + 8;
    const color = estado === 'ok' ? 'rgb(150, 220, 120)' : estado === 'obra' ? 'rgb(230, 200, 110)' : 'rgb(235, 100, 80)';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - 2, y - 1, 22, 16);
    dibujarPictograma(ctx, 'deposito', x, y, 18, 13, color, null);
    if (esCentral) {
      ctx.strokeStyle = BRONCE;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 2.5, y - 1.5, 23, 17);
    }
  };
  const central = suministro.centrales[jugador];
  if (central >= 0) dibujar(central, 'ok', true);
  for (const d of suministro.depositos) {
    if (d.pais !== jugador) continue;
    dibujar(d.provincia, d.horas > 0 ? 'obra' : d.conectado && !d.fueraDeServicio ? 'ok' : 'cortado', false);
  }
}

// ------------------------------------------------------------------ aviación

// Cada escuadrón es una ficha en su base, con la silueta de su avión y la cantidad.
function dibujarBasesAereas(ctx, camara, jugador, escuadronElegido) {
  const porBase = new Map();
  for (const e of aviacion.escuadrones) {
    if (e.pais !== jugador && !enGuerra(jugador, e.pais) && camara.zoom < 1.2) continue;
    if (!porBase.has(e.base)) porBase.set(e.base, []);
    porBase.get(e.base).push(e);
  }
  for (const [base, lista] of porBase) {
    const b = datos.bases[base];
    const p = camara.mundoAPantalla(b.x, b.y);
    lista.forEach((e, k) => {
      const x = Math.round(p.x + 9);
      const y = Math.round(p.y - 12 - k * 22);
      const elegido = e.id === escuadronElegido;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + 1, y + 2, 46, 19);
      ctx.fillStyle = colorPais(e.pais, 0.35);
      ctx.fillRect(x, y, 46, 19);
      ctx.lineWidth = elegido ? 2.5 : 1;
      ctx.strokeStyle = elegido ? BRONCE : 'rgba(10,10,10,0.9)';
      ctx.strokeRect(x + 0.5, y + 0.5, 45, 18);
      dibujarSilueta(ctx, modelo(e.modelo).silueta, x + 10, y + 9.5, 17, e.ocupado ? 'rgba(255,255,255,0.55)' : '#fff');
      ctx.font = `600 12px ${FUENTE_ETIQUETAS}`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(String(e.aviones), x + 22, y + 14);
      fichas.push({ x, y, w: 46, h: 19, ids: [], escuadron: e.id, pais: e.pais, base });
    });
    // Punto de la base
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// Círculo de alcance (en km) alrededor de un punto del mapa.
function dibujarAlcance(ctx, camara, { x, y, km }) {
  const lat = (aLonLat(x, y).lat * Math.PI) / 180;
  const rx = ((km * geo.escala) / (111.32 * Math.cos(lat))) * camara.zoom;
  const ry = ((km * geo.escala) / (111.32 * Math.cos(0.8 * lat))) * camara.zoom;
  const c = camara.mundoAPantalla(x, y);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(226, 196, 120, 0.08)';
  ctx.fill();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = 'rgba(226, 196, 120, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
}

function dibujarVuelos(ctx, camara, jugador) {
  for (const v of aviacion.vuelos) {
    if (v.pais !== jugador) continue;
    const destino = centroPantalla(camara, v.plan.objetivo);
    const ahora = tiempo.horas + tiempo.fraccion;
    for (const [k, g] of v.grupos.entries()) {
      const b = datos.bases[g.e.base];
      const origen = camara.mundoAPantalla(b.x, b.y);
      let t = 0;
      if (v.estado === 'ida') t = (ahora - v.salida) / Math.max(1, v.llegada - v.salida);
      else if (v.estado === 'vuelta') t = 1 - (ahora - v.llegada) / Math.max(1, v.regreso - v.llegada);
      t = Math.max(0, Math.min(1, t));
      if (k === 0) linea(ctx, [origen, destino], 'rgba(255, 245, 210, 0.6)', true, v.estado !== 'vuelta');
      if (v.estado === 'esperando') continue;
      const pos = { x: origen.x + (destino.x - origen.x) * t, y: origen.y + (destino.y - origen.y) * t + k * 6 };
      const ang = Math.atan2(destino.y - origen.y, destino.x - origen.x) + (v.estado === 'vuelta' ? Math.PI : 0) + Math.PI / 2;
      dibujarSilueta(ctx, modelo(g.e.modelo).silueta, pos.x, pos.y, 22, colorPais(g.e.pais, -0.3), ang);
    }
    // Estallido sobre el blanco en la hora del ataque
    if (v.estado === 'vuelta' && ahora - v.llegada < 2) {
      ctx.beginPath();
      ctx.arc(destino.x, destino.y, 10 + (ahora - v.llegada) * 10, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 150, 60, 0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ marina

function dibujarMar(ctx, camara, jugador, flotaElegida) {
  // Nombres de las zonas marítimas y quién las controla
  if (camara.zoom < 2.6) {
    ctx.textAlign = 'center';
    for (const z of Object.values(datos.zonas)) {
      const p = camara.mundoAPantalla(z.x, z.y);
      if (p.x < -100 || p.y < -50 || p.x > camara.ancho + 100 || p.y > camara.alto + 50) continue;
      const dueno = marina.control[z.clave];
      ctx.font = `italic 500 13px ${FUENTE_ETIQUETAS}`;
      ctx.fillStyle = 'rgba(190, 215, 240, 0.55)';
      ctx.fillText(z.nombre.toUpperCase(), p.x, p.y + 30);
      if (dueno) {
        ctx.fillStyle = colorPais(dueno, 0);
        ctx.globalAlpha = 0.8;
        ctx.fillRect(p.x - 14, p.y + 34, 28, 3);
        ctx.globalAlpha = 1;
      }
    }
    ctx.textAlign = 'left';
  }
  // Flotas: una ficha por flota en su zona (o navegando)
  const porZona = new Map();
  for (const f of marina.flotas) {
    if (!totalBarcos(f)) continue;
    if (f.pais !== jugador && !enGuerra(jugador, f.pais) && camara.zoom < 0.9) continue;
    const pos = posicionFlota(f);
    const k = f.viaje ? `v${f.id}` : f.zona;
    if (!porZona.has(k)) porZona.set(k, []);
    porZona.get(k).push({ f, pos });
  }
  for (const lista of porZona.values()) {
    lista.forEach(({ f, pos }, i) => {
      const c = camara.mundoAPantalla(pos.x, pos.y);
      const x = Math.round(c.x - 22 + (i % 3) * 46 - ((Math.min(lista.length, 3) - 1) * 46) / 2);
      const y = Math.round(c.y - 10 - Math.floor(i / 3) * 24);
      const elegida = f.id === flotaElegida;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + 1, y + 2, 44, 20);
      ctx.fillStyle = colorPais(f.pais, 0.35);
      ctx.fillRect(x, y, 44, 20);
      ctx.lineWidth = elegida ? 2.5 : 1;
      ctx.strokeStyle = elegida ? BRONCE : 'rgba(10,10,10,0.9)';
      ctx.strokeRect(x + 0.5, y + 0.5, 43, 19);
      dibujarPictograma(ctx, 'barco', x + 2, y + 2, 22, 16);
      ctx.font = `600 12px ${FUENTE_ETIQUETAS}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(String(totalBarcos(f)), x + 26, y + 14.5);
      if (f.viaje && f.pais === jugador) {
        linea(ctx, [{ x: c.x, y: c.y }, ...f.viaje.ruta.map((z) => camara.mundoAPantalla(datos.zonas[z].x, datos.zonas[z].y))], 'rgba(170, 210, 255, 0.8)', true, true);
      }
      fichas.push({ x, y, w: 44, h: 20, ids: [], flota: f.id, pais: f.pais });
    });
  }
}
