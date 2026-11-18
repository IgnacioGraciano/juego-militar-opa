// Nombres e íconos del mapa (países, regiones, provincias, ciudades, puertos y bases).
// Se dibujan en coordenadas de pantalla para que tengan siempre el mismo tamaño.
// Qué se muestra depende del zoom: de lejos países y capitales; de cerca
// provincias, ciudades, puertos y bases.

import { datos } from './datos.js';
import { smoothstep } from './camara.js';

export const FUENTE_ETIQUETAS = '"Barlow Condensed", "Arial Narrow", sans-serif';
export const FUENTE_TEXTO = '"Barlow", "Segoe UI", system-ui, sans-serif';

const TEXTO = 'rgb(245, 242, 230)';
const CONTORNO = 'rgba(10, 10, 14, 0.85)';
const PAIS_TEXTO = 'rgba(28, 24, 18, 0.82)';
const PAIS_CONTORNO = 'rgba(255, 250, 236, 0.4)';
const REGION = 'rgba(52, 44, 30, 0.62)';
const PUERTO = 'rgb(56, 115, 215)';

let usados = [];

function libre(r) {
  for (const u of usados) {
    if (r.x < u.x + u.w && u.x < r.x + r.w && r.y < u.y + u.h && u.y < r.y + r.h) return false;
  }
  return true;
}

const ocupar = (r) => usados.push(r);

function rangoCiudades(z) {
  if (z < 0.6) return 1;
  if (z < 1.0) return 3;
  if (z < 2.0) return 5;
  if (z < 4.0) return 7;
  return 8;
}

export function dibujarEtiquetas(ctx, camara) {
  const z = camara.zoom;
  const detalle = smoothstep(1.1, 2.0, z);
  const margen = 40;
  const enPantalla = (p) => p.x > -margen && p.y > -margen && p.x < camara.ancho + margen && p.y < camara.alto + margen;
  usados = [];
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';

  ciudades(ctx, camara, z, enPantalla);
  if (z >= 1.0) bases(ctx, camara, z, enPantalla);
  if (z >= 1.6) puertos(ctx, camara, z, enPantalla);
  if (detalle > 0.05) provincias(ctx, camara, enPantalla, detalle);
  if (z < 2.6) regiones(ctx, camara, z, enPantalla);
  if (detalle < 0.95) paises(ctx, camara, z, 1 - detalle);
}

function texto(ctx, t, x, y, relleno, contorno, grosor) {
  ctx.lineWidth = grosor;
  ctx.strokeStyle = contorno;
  ctx.strokeText(t, x, y);
  ctx.fillStyle = relleno;
  ctx.fillText(t, x, y);
}

// ------------------------------------------------------------------ países

function paises(ctx, camara, z, alfa) {
  const conTierra = new Set(datos.duenos);
  ctx.textAlign = 'center';
  for (const [etiqueta, p] of Object.entries(datos.paises)) {
    if (!conTierra.has(etiqueta)) continue;
    const tam = Math.max(10, Math.round(Math.min(46, Math.max(13, 48 * z)) * (p.tamano ?? 1)));
    const pos = camara.mundoAPantalla(p.posEtiqueta.x, p.posEtiqueta.y);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(((p.angulo ?? 0) * Math.PI) / 180);
    ctx.globalAlpha = alfa;
    ctx.font = `600 ${tam}px ${FUENTE_ETIQUETAS}`;
    ctx.letterSpacing = `${Math.round(tam * 0.45)}px`;
    texto(ctx, p.nombre.toUpperCase(), 0, tam * 0.35, PAIS_TEXTO, PAIS_CONTORNO, 4);
    ctx.restore();
  }
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
}

// ------------------------------------------------------------------ regiones

function regiones(ctx, camara, z, enPantalla) {
  // Grandes regiones (Andes, Patagonia, Gran Chaco...) en cursiva tenue.
  const rangoMax = z < 0.7 ? 2 : z < 1.4 ? 3 : 4;
  const alfa = 1 - smoothstep(1.8, 2.6, z);
  ctx.textAlign = 'left';
  for (const r of datos.regiones) {
    if (r.rango > rangoMax) continue;
    const pos = camara.mundoAPantalla(r.x, r.y);
    if (!enPantalla(pos)) continue;
    const tam = Math.round(Math.min(18, Math.max(11, r.ancho * z * 0.05)));
    ctx.font = `italic 500 ${tam}px ${FUENTE_ETIQUETAS}`;
    ctx.letterSpacing = '1px';
    const ancho = ctx.measureText(r.nombre).width;
    const rect = { x: pos.x - ancho / 2, y: pos.y - tam, w: ancho, h: tam * 1.3 };
    if (!libre(rect)) continue;
    ocupar(rect);
    ctx.globalAlpha = alfa;
    ctx.fillStyle = REGION;
    ctx.fillText(r.nombre, pos.x - ancho / 2, pos.y);
    ctx.globalAlpha = 1;
  }
  ctx.letterSpacing = '0px';
}

// ------------------------------------------------------------------ provincias

function provincias(ctx, camara, enPantalla, alfa) {
  const tam = 13;
  ctx.font = `500 ${tam}px ${FUENTE_ETIQUETAS}`;
  ctx.letterSpacing = '0.5px';
  ctx.globalAlpha = alfa;
  for (const p of datos.provincias) {
    const pos = camara.mundoAPantalla(p.centroPos.x, p.centroPos.y);
    if (!enPantalla(pos)) continue;
    const ancho = ctx.measureText(p.nombre).width;
    const rect = { x: pos.x - ancho / 2, y: pos.y - tam, w: ancho, h: tam * 1.3 };
    if (!libre(rect)) continue;
    ocupar(rect);
    texto(ctx, p.nombre, pos.x - ancho / 2, pos.y, 'rgba(255,255,255,0.8)', 'rgba(0,0,0,0.6)', 3);
  }
  ctx.globalAlpha = 1;
  ctx.letterSpacing = '0px';
}

// ------------------------------------------------------------------ ciudades

function ciudades(ctx, camara, z, enPantalla) {
  const rangoMax = rangoCiudades(z);
  const tam = z >= 1 ? 14 : 13;
  ctx.font = `500 ${tam}px ${FUENTE_TEXTO}`;
  ctx.textAlign = 'left';
  // Vienen ordenadas por importancia: las primeras ganan el lugar.
  for (const c of datos.ciudades) {
    const mostrar = c.capital === 'pais' || c.rango <= rangoMax || (c.capital === 'provincia' && z >= 1);
    if (!mostrar) continue;
    const pos = camara.mundoAPantalla(c.x, c.y);
    if (!enPantalla(pos)) continue;
    const radio = c.capital === 'pais' ? 4 : 2.5;
    const punto = { x: pos.x - radio, y: pos.y - radio, w: radio * 2, h: radio * 2 };
    if (!libre(punto)) continue;
    ocupar(punto);
    if (c.capital === 'pais') {
      ctx.fillStyle = '#000';
      ctx.fillRect(punto.x - 1, punto.y - 1, punto.w + 2, punto.h + 2);
      ctx.fillStyle = 'rgb(255, 228, 130)';
      ctx.fillRect(punto.x, punto.y, punto.w, punto.h);
    } else {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radio + 1, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radio, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
    const ancho = ctx.measureText(c.nombre).width;
    const rect = { x: pos.x + radio + 3, y: pos.y - tam * 0.75, w: ancho, h: tam * 1.2 };
    if (libre(rect)) {
      ocupar(rect);
      texto(ctx, c.nombre, pos.x + radio + 3, pos.y + tam * 0.35, TEXTO, CONTORNO, 3.5);
    }
  }
}

// ------------------------------------------------------------------ puertos y bases

function puertos(ctx, camara, z, enPantalla) {
  const conNombre = z >= 3;
  for (const p of datos.puertos) {
    const pos = camara.mundoAPantalla(p.x, p.y);
    if (!enPantalla(pos)) continue;
    iconoAncla(ctx, pos.x, pos.y, 1, PUERTO);
    if (conNombre) textoChico(ctx, p.nombre, pos.x + 9, pos.y + 4, 'rgb(205, 225, 255)');
  }
}

function bases(ctx, camara, z, enPantalla) {
  const conNombre = z >= 2.5;
  for (const b of datos.bases) {
    const pos = camara.mundoAPantalla(b.x, b.y);
    if (!enPantalla(pos)) continue;
    const rgb = datos.paises[b.pais]?.rgb ?? [128, 128, 128];
    const color = `rgb(${rgb.map((v) => Math.min(255, v + 50)).join(',')})`;
    if (b.tipo === 'aerea') iconoAvion(ctx, pos.x, pos.y, color);
    else if (b.tipo === 'aeronaval') {
      iconoAvion(ctx, pos.x, pos.y, color);
      iconoAncla(ctx, pos.x + 7, pos.y + 5, 0.7, PUERTO);
    } else iconoAncla(ctx, pos.x, pos.y, 1.1, color);
    if (conNombre) {
      ctx.font = `500 12px ${FUENTE_TEXTO}`;
      const rect = { x: pos.x + 10, y: pos.y - 14, w: ctx.measureText(b.nombre).width, h: 14 };
      if (libre(rect)) {
        ocupar(rect);
        textoChico(ctx, b.nombre, pos.x + 10, pos.y - 4, 'rgb(255, 236, 205)');
      }
    }
  }
}

function iconoAvion(ctx, x, y, color) {
  const s = 6;
  ctx.beginPath();
  ctx.arc(x, y, s + 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  const pts = [[0, -1], [0.9, 0.3], [0.25, 0.15], [0.45, 0.9], [0, 0.6], [-0.45, 0.9], [-0.25, 0.15], [-0.9, 0.3]];
  ctx.beginPath();
  pts.forEach(([a, b], i) => (i ? ctx.lineTo(x + a * s, y + b * s) : ctx.moveTo(x + a * s, y + b * s)));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#000';
  ctx.stroke();
}

function iconoAncla(ctx, x, y, escala, color) {
  const s = 5 * escala;
  ctx.beginPath();
  ctx.arc(x, y, s + 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, s + 0.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.7);
  ctx.lineTo(x, y + s * 0.6);
  ctx.moveTo(x - s * 0.4, y - s * 0.35);
  ctx.lineTo(x + s * 0.4, y - s * 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y + s * 0.05, s * 0.55, (20 * Math.PI) / 180, (160 * Math.PI) / 180);
  ctx.stroke();
}

function textoChico(ctx, t, x, y, color) {
  ctx.font = `500 12px ${FUENTE_TEXTO}`;
  texto(ctx, t, x, y, color, CONTORNO, 3);
}
