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
