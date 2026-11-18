// Dibuja las tropas (fichas con símbolo militar), rutas de marcha y flechas de las
// Operaciones, en coordenadas de pantalla. También resuelve los clics sobre las fichas.

import { datos } from './datos.js';
import { ejercito, avanceTramo, enGuerra } from './ejercito.js';
import { operaciones } from './operaciones.js';
import { FUENTE_ETIQUETAS } from './etiquetas.js';

const ANCHO = 30;
const ALTO = 20;
const ORDEN_TIPOS = ['blindada', 'mecanizada', 'montana', 'infanteria'];
const BRONCE = 'rgb(226, 196, 120)';

let fichas = []; // zonas clicables: {x, y, w, h, ids, pais, provincia}

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
  return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
}

const centroPantalla = (camara, prov) => {
  const c = datos.provincias[prov].centroPos;
  return camara.mundoAPantalla(c.x, c.y);
};

export function dibujarUnidades(ctx, camara, vista) {
  fichas = [];
  const { jugador, seleccion, plan, rutaVista } = vista;
  ctx.save();

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

  // Fichas: agrupadas por provincia y país; las que marchan, sueltas.
  const grupos = new Map();
  for (const b of ejercito.brigadas) {
    const visible = b.pais === jugador || enGuerra(jugador, b.pais) || camara.zoom >= 1.0;
    if (!visible) continue;
    if (b.mov && b.pais === jugador) {
      dibujarFicha(ctx, posicionBrigada(camara, b), [b], seleccion);
      continue;
    }
    const k = `${b.provincia}|${b.pais}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(b);
  }
  const porProvincia = new Map();
  for (const [k, lista] of grupos) {
    const prov = Number(k.split('|')[0]);
    if (!porProvincia.has(prov)) porProvincia.set(prov, []);
    porProvincia.get(prov).push(lista);
  }
  for (const [prov, listas] of porProvincia) {
    listas.sort((a, b) => (a[0].pais === jugador ? -1 : b[0].pais === jugador ? 1 : 0));
    const c = centroPantalla(camara, prov);
    const totalAncho = listas.length * (ANCHO + 6) - 6;
    listas.forEach((lista, i) => {
      const pos = { x: c.x - totalAncho / 2 + i * (ANCHO + 6) + ANCHO / 2, y: c.y - 24 };
      dibujarFicha(ctx, pos, lista, seleccion);
    });
    const enCombate = listas.some((l) => l.some((b) => b.enCombate));
    if (enCombate) {
      ctx.beginPath();
      ctx.arc(c.x, c.y - 24, Math.max(22, totalAncho / 2 + 10), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(230, 70, 50, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
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

  ctx.globalAlpha = formando ? 0.55 : 1;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(x + 1, y + 2, ANCHO, ALTO);
  ctx.fillStyle = colorPais(pais);
  ctx.fillRect(x, y, ANCHO, ALTO);
  ctx.lineWidth = elegida ? 2.5 : 1;
  ctx.strokeStyle = elegida ? BRONCE : 'rgba(10, 10, 10, 0.9)';
  ctx.strokeRect(x + 0.5, y + 0.5, ANCHO - 1, ALTO - 1);
  simbolo(ctx, x + 6, y + 4, ANCHO - 12, ALTO - 8, tipo);

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

// Símbolos militares (estilo OTAN): infantería = X, blindada = óvalo,
// mecanizada = X con óvalo, montaña = X con triángulo.
function simbolo(ctx, x, y, w, h, tipo) {
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x, y, w, h);
  ctx.beginPath();
  if (tipo !== 'blindada') {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y);
    ctx.lineTo(x, y + h);
  }
  if (tipo === 'blindada' || tipo === 'mecanizada') {
    ctx.moveTo(x + w * 0.85, y + h / 2);
    ctx.ellipse(x + w / 2, y + h / 2, w * 0.35, h * 0.3, 0, 0, Math.PI * 2);
  }
  ctx.stroke();
  if (tipo === 'montana') {
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 3.5, y + h);
    ctx.lineTo(x + w / 2, y + h - 4.5);
    ctx.lineTo(x + w / 2 + 3.5, y + h);
    ctx.closePath();
    ctx.fill();
  }
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
