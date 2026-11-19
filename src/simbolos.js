// Pictogramas de las unidades: el mismo dibujo sirve para el mapa (Canvas) y
// para los paneles (SVG). Están en una grilla de 24 x 16.
//   infantería = soldado, montaña = soldado con montañas, mecanizada = camión,
//   blindada = tanque, avión = silueta de avión, depósito = cajón.

const CIRCULO = (cx, cy, r) => `M${cx + r} ${cy}a${r} ${r} 0 1 1 ${-2 * r} 0a${r} ${r} 0 1 1 ${2 * r} 0z`;

const SOLDADO = `${CIRCULO(12, 3.2, 2.1)}M9.4 6.2h5.2l1.4 5.1h-1.9l-.7-2.6v6.9h-1.9v-4.4h-.9v4.4H8.7V8.7l-.7 2.6H6.1z`;

export const PICTOGRAMAS = {
  infanteria: SOLDADO,
  montana: `M0.5 15.5L6 6.5l2.6 4.2L11 7l5.4 8.5z${CIRCULO(18.2, 4.6, 1.7)}M16.2 7h4l1.1 4h-1.5l-.5-2v5.5h-1.5V11h-.7v3.5h-1.5V9l-.5 2h-1.5z`,
  mecanizada: `M1 4.5h12.5v8H1zM14.5 7h4.6l3.4 3.6v1.9h-8z${CIRCULO(5, 13.6, 1.9)}${CIRCULO(18, 13.6, 1.9)}`,
  blindada: `M7.5 4h7.5l1.6 3.2H6zM15 4.9h8v1.3h-8zM3 8.2h18l2 3.3H1zM2.4 12.3h19.2a1.8 1.8 0 0 1 0 3.6H2.4a1.8 1.8 0 0 1 0-3.6z`,
  avion: 'M12 0.5l1.4 4.2v2.7l9.6 4.1v1.6l-9.6-2.1v3.4l2.6 1.9v1.2L12 16.4l-4 1.1v-1.2l2.6-1.9v-3.4L1 13.1v-1.6l9.6-4.1V4.7z',
  deposito: 'M3 6l9-4.5L21 6v9H3zM6 9h12v1.4H6zM6 12h12v1.4H6z',
  // Barco de guerra visto de costado
  barco: 'M1 10.5h22l-3 4.5H4zM6 7h9v3.5H6zM8.5 4h3.5v3H8.5zM15 8.2h5v1H15zM10 1.5h1v2.5h-1z',
};

const cache = new Map();
function camino(clave) {
  if (!cache.has(clave)) cache.set(clave, new Path2D(PICTOGRAMAS[clave] ?? PICTOGRAMAS.infanteria));
  return cache.get(clave);
}

// Dibuja el pictograma dentro del rectángulo (x, y, ancho, alto), centrado.
export function dibujarPictograma(ctx, clave, x, y, ancho, alto, color = '#fff', contorno = 'rgba(0,0,0,0.55)') {
  const escala = Math.min(ancho / 24, alto / 16);
  ctx.save();
  ctx.translate(x + (ancho - 24 * escala) / 2, y + (alto - 16 * escala) / 2);
  ctx.scale(escala, escala);
  ctx.lineJoin = 'round';
  if (contorno) {
    ctx.strokeStyle = contorno;
    ctx.lineWidth = 1.6 / escala;
    ctx.stroke(camino(clave));
  }
  ctx.fillStyle = color;
  ctx.fill(camino(clave), 'nonzero');
  ctx.restore();
}

// SVG en línea para los paneles HTML.
export function svgPictograma(clave, titulo = '') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 -0.5 24 17');
  svg.setAttribute('class', 'pictograma');
  svg.setAttribute('aria-hidden', titulo ? 'false' : 'true');
  if (titulo) {
    const t = document.createElementNS(ns, 'title');
    t.textContent = titulo;
    svg.append(t);
  }
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', PICTOGRAMAS[clave] ?? PICTOGRAMAS.infanteria);
  svg.append(p);
  return svg;
}

// ------------------------------------------------------------------ siluetas de aviones
// Vistos desde arriba, nariz hacia arriba, en una grilla de 32 x 32. Cada modelo
// dice su forma en data/aviones.json ("silueta").
export const SILUETAS = {
  // Ala delta (Mirage, Dagger)
  delta: 'M16 1L17.6 7L18 13L29.5 26L18.4 26.2L18 29.5H14L13.6 26.2L2.5 26L14 13L14.4 7Z',
  // Delta chica con cola (A-4 Skyhawk)
  delta_cola: 'M16 2L17.6 7L17.9 12L27.5 19.5V22L17.9 21L17.6 25.5L21.5 28.5V30.5H10.5V28.5L14.4 25.5L14.1 21L4.5 22V19.5L14.1 12L14.4 7Z',
  // Ala en flecha (Hunter, Jaguar)
  flecha: 'M16 1L17.5 6L17.8 11.5L28.5 20.5V22.5L17.8 19L17.6 25L22.5 29V30.5H9.5V29L14.4 25L14.2 19L3.5 22.5V20.5L14.2 11.5L14.5 6Z',
  // Ala chica trapezoidal con misiles en las puntas (F-5)
  f5: 'M16 1L17.2 7L17.4 13L26 18.4V21L17.4 19.6L17.3 25L21.5 28.5V30H10.5V28.5L14.7 25L14.6 19.6L6 21V18.4L14.6 13L14.8 7ZM26 13.5h1v8h-1zM5 13.5h1v8H5z',
  // Ala larga en flecha (Su-22)
  ala_larga: 'M16 1L17.6 7L18 10.5L20 11.5L30.5 23.5L29.5 25L18.2 18.5L18 25L23 29V30.5H9V29L14 25L13.8 18.5L2.5 25L1.5 23.5L12 11.5L14 10.5L14.4 7Z',
  // Ala recta con tanques en las puntas (A-37, T-33, Xavante)
  recta: 'M16 2L17.4 6L17.6 12L29 13.2L29.4 15.8L17.6 16.6L17.4 24L22 25.6V27.6H10V25.6L14.6 24L14.4 16.6L2.6 15.8L3 13.2L14.4 12L14.6 6ZM28.5 11.5h2.2v6h-2.2zM1.3 11.5h2.2v6H1.3z',
  // Bimotor a hélice con cola en T (Pucará)
  bimotor_helice: 'M2.5 12h27v3.6h-27zM15 2h2l.8 4v20l-.8 3h-2l-.8-3V6zM8 8.5h3.2v9.5H8zM20.8 8.5H24v9.5h-3.2zM6.2 7.8h6.8v1.1H6.2zM19 7.8h6.8v1.1H19zM10.5 27h11v2.2h-11z',
  // Bombardero bimotor (Canberra)
  bombardero: 'M1 13.2L31 13.2L30 17.6L2 17.6ZM15 1h2l1 4v22l-1 4h-2l-1-4V5zM6.8 9.5h3.4v10.5H6.8zM21.8 9.5h3.4v10.5h-3.4zM9.5 26.5h13v2.6h-13z',
  // Monomotor a hélice (AT-6)
  helice: 'M2 12.5L30 12.5L29 15.5L3 15.5ZM14.8 3h2.4v24h-2.4zM11 2h10v1.3H11zM11 25h10v2.2H11z',
};

const cacheSiluetas = new Map();
function caminoSilueta(forma) {
  if (!cacheSiluetas.has(forma)) cacheSiluetas.set(forma, new Path2D(SILUETAS[forma] ?? SILUETAS.flecha));
  return cacheSiluetas.get(forma);
}

// Dibuja la silueta centrada en (cx, cy), de 'tam' píxeles, girada 'angulo' radianes.
export function dibujarSilueta(ctx, forma, cx, cy, tam, color = '#fff', angulo = 0, contorno = 'rgba(0,0,0,0.6)') {
  const k = tam / 32;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angulo);
  ctx.scale(k, k);
  ctx.translate(-16, -16);
  ctx.lineJoin = 'round';
  if (contorno) {
    ctx.strokeStyle = contorno;
    ctx.lineWidth = 2 / k;
    ctx.stroke(caminoSilueta(forma));
  }
  ctx.fillStyle = color;
  ctx.fill(caminoSilueta(forma));
  ctx.restore();
}

export function svgSilueta(forma, titulo = '') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('class', 'silueta');
  if (titulo) {
    const t = document.createElementNS(ns, 'title');
    t.textContent = titulo;
    svg.append(t);
  } else svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', SILUETAS[forma] ?? SILUETAS.flecha);
  svg.append(p);
  return svg;
}
