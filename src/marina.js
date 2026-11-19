// Marina (paso 9, primera versión). El mar se divide en zonas. Las flotas tienen
// misiones (patrullar, bloquear, escoltar, en puerto) y no se mueve barco por barco.
// Controlar una zona permite bloquear al enemigo y llevar tropas por mar.
// Combate naval en 3 pasos: detección, ataque aéreo y misiles, artillería.

import { datos, nombrePais } from './datos.js';
import { distanciaKm } from './geo.js';
import { enGuerra, mensaje, avisar } from './ejercito.js';
import { aviacion, modelo, disponibles, poderAtaque } from './aviacion.js';

export const marina = {
  flotas: [], // {id, pais, nombre, zona, barcos: {clase: n}, mision, viaje: {ruta: [zonas], horas} | null}
  control: {}, // zona -> país que la controla (o null)
  siguienteId: 1,
};
const RM = () => datos.reglas.marina;
const clase = (k) => datos.barcos.clases[k];
const azar = () => Math.random();

export function iniciarMarina() {
  marina.flotas = [];
  for (const [pais, lista] of Object.entries(datos.escenario.flotas ?? {})) {
    for (const f of lista) {
      if (!datos.zonas[f.zona]) continue;
      marina.flotas.push({ id: marina.siguienteId++, pais, nombre: f.nombre, zona: f.zona, barcos: { ...f.barcos }, mision: f.mision ?? 'patrullar', viaje: null });
    }
  }
  calcularControl();
}

// ------------------------------------------------------------------ consultas

export const flotaPorId = (id) => marina.flotas.find((f) => f.id === id);
export const flotasDe = (pais) => marina.flotas.filter((f) => f.pais === pais);
export const totalBarcos = (f) => Object.values(f.barcos).reduce((s, n) => s + n, 0);
export const barcosDe = (pais) => flotasDe(pais).reduce((s, f) => s + totalBarcos(f), 0);

export function poderFlota(f, atributo) {
  let s = 0;
  for (const [k, n] of Object.entries(f.barcos)) s += (clase(k)?.[atributo] ?? 0) * n;
  return s;
}

export const capacidadTransporte = (f) => poderFlota(f, 'capacidad');
const superficie = (f) => Object.entries(f.barcos).some(([k, n]) => n > 0 && !clase(k).sigilo);

// Zona más cercana a un punto del mapa (para hacer clic en el mar).
export function zonaEn(x, y, maxKm = 900) {
  let mejor = null;
  let d = Infinity;
  for (const z of Object.values(datos.zonas)) {
    const k = distanciaKm(x, y, z.x, z.y);
    if (k < d) { d = k; mejor = z; }
  }
  return d <= maxKm ? mejor : null;
}

// Camino entre zonas (búsqueda en anchura).
export function rutaZonas(desde, hasta) {
  const previo = { [desde]: null };
  const cola = [desde];
  while (cola.length) {
    const z = cola.shift();
    if (z === hasta) break;
    for (const v of datos.zonas[z].vecinas) if (!(v in previo)) { previo[v] = z; cola.push(v); }
  }
  if (!(hasta in previo)) return null;
  const ruta = [];
  for (let z = hasta; z !== desde; z = previo[z]) ruta.unshift(z);
  return ruta;
}

function velocidadFlota(f) {
  const nudos = Math.min(...Object.entries(f.barcos).filter(([, n]) => n > 0).map(([k]) => clase(k).nudos));
  return nudos * RM().km_por_nudo_por_dia / 24; // km por hora
}

// ------------------------------------------------------------------ órdenes

export function ordenarFlota(f, zonaDestino) {
  if (f.zona === zonaDestino) { f.viaje = null; return null; }
  const ruta = rutaZonas(f.zona, zonaDestino);
  if (!ruta) return 'No hay camino por mar.';
  f.viaje = { ruta, recorrido: 0 };
  avisar('marina');
  return null;
}

export function fijarMisionFlota(f, mision) {
  f.mision = mision;
  calcularControl();
  avisar('marina');
}

// ------------------------------------------------------------------ control de zonas

// Controla una zona el país con flota de superficie en misión (no en puerto) si no hay
// flotas de superficie enemigas en la misma zona.
export function calcularControl() {
  marina.control = {};
  for (const z of Object.keys(datos.zonas)) {
    const aqui = marina.flotas.filter((f) => f.zona === z && !f.viaje && f.mision !== 'puerto' && totalBarcos(f) > 0);
    let dueno = null;
    for (const f of aqui) {
      const rivales = aqui.some((g) => enGuerra(f.pais, g.pais) && superficie(g));
      if (!rivales && (superficie(f) || !dueno)) { dueno = f.pais; break; }
    }
    marina.control[z] = dueno;
  }
}

// ¿El país bloquea esta zona al enemigo?
export function bloqueaZona(pais, zona) {
  return marina.flotas.some((f) => f.pais === pais && f.zona === zona && f.mision === 'bloquear' && !f.viaje && totalBarcos(f) > 0)
    && marina.control[zona] === pais;
}

// Suministro por mar de una provincia costera: baja si un enemigo bloquea alguna de sus zonas
// (salvo que el dueño escolte en esa zona).
export function factorBloqueo(pais, j) {
  let f = 1;
  for (const z of Object.values(datos.zonas)) {
    if (!z.costeras.includes(j)) continue;
    const bloqueada = marina.flotas.some((fl) => enGuerra(pais, fl.pais) && bloqueaZona(fl.pais, z.clave));
    if (!bloqueada) continue;
    const escolta = marina.flotas.some((fl) => fl.pais === pais && fl.zona === z.clave && fl.mision === 'escoltar' && !fl.viaje);
    f = Math.min(f, escolta ? 1 - RM().bloqueo_suministro / 2 : 1 - RM().bloqueo_suministro);
  }
  return f;
}

// Zonas que el enemigo le bloquea a un país (para las divisas).
export function zonasBloqueadas(pais) {
  return Object.keys(datos.zonas).filter((z) => datos.zonas[z].costeras.some((j) => datos.duenos[j] === pais)
    && marina.flotas.some((fl) => enGuerra(pais, fl.pais) && bloqueaZona(fl.pais, z)));
}

// Pasos por mar para tropas: entre provincias costeras propias o enemigas de una zona que el
// país controla, si tiene una flota con transportes ahí.
export function enlacesMaritimos(pais, desde) {
  const out = [];
  if (!datos.provincias[desde].costera) return out;
  for (const z of Object.values(datos.zonas)) {
    if (!z.costeras.includes(desde) || marina.control[z.clave] !== pais) continue;
    if (!marina.flotas.some((f) => f.pais === pais && f.zona === z.clave && !f.viaje && capacidadTransporte(f) > 0)) continue;
    const a = datos.provincias[desde].centroPos;
    for (const j of z.costeras) {
      if (j === desde) continue;
      const b = datos.provincias[j].centroPos;
      out.push({ j, km: distanciaKm(a.x, a.y, b.x, b.y), maritimo: true, zona: z.clave });
    }
  }
  return out;
}

// ------------------------------------------------------------------ combate naval

// Poder aéreo que llega a una zona: escuadrones de ataque en alerta con alcance + aviones embarcados.
function aireSobreZona(pais, z) {
  let p = 0;
  for (const e of aviacion.escuadrones) {
    if (e.pais !== pais || e.ocupado || e.mision !== 'alerta') continue;
    const b = datos.bases[e.base];
    if (distanciaKm(b.x, b.y, z.x, z.y) > Math.min(modelo(e.modelo).radio_km, RM().alcance_aereo_km)) continue;
    p += poderAtaque(e, Math.ceil(disponibles(e) / 2));
  }
  for (const f of marina.flotas) if (f.pais === pais && f.zona === z.clave && !f.viaje) p += poderFlota(f, 'hangar') * 0.25;
  return p;
}

function hundir(f, impactos, preferirSubmarinos = false) {
  const hundidos = {};
  let resto = impactos;
  const orden = Object.keys(f.barcos).filter((k) => f.barcos[k] > 0)
    .sort((a, b) => (preferirSubmarinos ? (clase(b).sigilo ? 1 : 0) - (clase(a).sigilo ? 1 : 0) : 0) || azar() - 0.5);
  for (const k of orden) {
    while (f.barcos[k] > 0 && resto >= clase(k).resistencia * (0.7 + azar() * 0.6)) {
      resto -= clase(k).resistencia;
      f.barcos[k]--;
      hundidos[k] = (hundidos[k] ?? 0) + 1;
    }
  }
  return hundidos;
}

const textoHundidos = (h) => Object.entries(h).map(([k, n]) => `${n} ${clase(k).nombre.toLowerCase()}${n > 1 ? 's' : ''}`).join(', ');

function combateEnZona(z, ladoA, ladoB) {
  const r = RM();
  const fa = marina.flotas.filter((f) => f.zona === z.clave && !f.viaje && f.pais === ladoA && totalBarcos(f) > 0);
  const fb = marina.flotas.filter((f) => f.zona === z.clave && !f.viaje && f.pais === ladoB && totalBarcos(f) > 0);
  if (!fa.length || !fb.length) return null;
  const suma = (lista, at) => lista.reduce((s, f) => s + poderFlota(f, at), 0);
  const lineas = [];
  // 1. Detección: radar, aviones de reconocimiento y submarinos
  const detA = suma(fa, 'deteccion') + aireSobreZona(ladoA, z) * 0.3;
  const detB = suma(fb, 'deteccion') + aireSobreZona(ladoB, z) * 0.3;
  const primeroA = detA * (0.8 + azar() * 0.4) >= detB * (0.8 + azar() * 0.4);
  lineas.push(`Detección: ${nombrePais(primeroA ? ladoA : ladoB)} encuentra primero a la flota enemiga.`);
  // 2. Ataque aéreo y misiles
  const golpe = (atac, def, primero) => {
    const ofensa = (suma(atac, 'antibuque') + aireSobreZona(atac[0].pais, z)) * (primero ? r.primer_golpe : 1);
    const defensa = suma(def, 'antiaereo') * r.defensa_antiaerea_por_punto;
    return Math.max(0, ofensa * r.impactos_por_punto * (0.7 + azar() * 0.6) - defensa);
  };
  const impA = golpe(fa, fb, primeroA);
  const impB = golpe(fb, fa, !primeroA);
  // 3. Artillería, si los dos tienen barcos de superficie
  const artA = fa.some(superficie) && fb.some(superficie) ? suma(fa, 'artilleria') * 0.08 * azar() : 0;
  const artB = fa.some(superficie) && fb.some(superficie) ? suma(fb, 'artilleria') * 0.08 * azar() : 0;
  // Submarinos: atacan si no los detectan; los antisubmarinos los cazan
  const subsA = suma(fa, 'antibuque') > 0 ? fa.reduce((s, f) => s + Object.entries(f.barcos).filter(([k]) => clase(k).sigilo).reduce((t, [k, n]) => t + n * clase(k).sigilo, 0), 0) : 0;
  const subsB = fb.reduce((s, f) => s + Object.entries(f.barcos).filter(([k]) => clase(k).sigilo).reduce((t, [k, n]) => t + n * clase(k).sigilo, 0), 0);
  const cazaA = suma(fa, 'antisubmarino') * 0.06 * azar();
  const cazaB = suma(fb, 'antisubmarino') * 0.06 * azar();
  const hundidosB = {};
  const hundidosA = {};
  const acumular = (dest, h) => { for (const [k, n] of Object.entries(h)) dest[k] = (dest[k] ?? 0) + n; };
  for (const f of fb) acumular(hundidosB, hundir(f, (impA + artA + subsA * 0.25) / fb.length));
  for (const f of fa) acumular(hundidosA, hundir(f, (impB + artB + subsB * 0.25) / fa.length));
  for (const f of fb) acumular(hundidosB, hundir(f, cazaA / fb.length, true));
  for (const f of fa) acumular(hundidosA, hundir(f, cazaB / fa.length, true));
  lineas.push(`Ataque aéreo y misiles: ${impA.toFixed(1)} impactos de ${nombrePais(ladoA)}, ${impB.toFixed(1)} de ${nombrePais(ladoB)}.`);
  if (artA || artB) lineas.push('Las flotas se cruzaron y hubo duelo de artillería.');
  if (Object.keys(hundidosA).length) lineas.push(`${nombrePais(ladoA)} pierde: ${textoHundidos(hundidosA)}.`);
  if (Object.keys(hundidosB).length) lineas.push(`${nombrePais(ladoB)} pierde: ${textoHundidos(hundidosB)}.`);
  if (!Object.keys(hundidosA).length && !Object.keys(hundidosB).length) lineas.push('No hubo hundimientos.');
  return { zona: z.nombre, ladoA, ladoB, lineas, hundidosA, hundidosB };
}

// ------------------------------------------------------------------ paso del tiempo

export function actualizarHoraMarina() {
  for (const f of marina.flotas) {
    if (!f.viaje || !totalBarcos(f)) continue;
    const sig = f.viaje.ruta[0];
    const a = datos.zonas[f.zona];
    const b = datos.zonas[sig];
    f.viaje.recorrido += velocidadFlota(f);
    if (f.viaje.recorrido >= distanciaKm(a.x, a.y, b.x, b.y)) {
      f.zona = sig;
      f.viaje.ruta.shift();
      f.viaje.recorrido = 0;
      if (!f.viaje.ruta.length) {
        f.viaje = null;
        mensaje(`La ${f.nombre} llegó a ${datos.zonas[f.zona].nombre}.`, 'info', f.pais);
        calcularControl();
      }
    }
  }
}

export function actualizarDiaMarina() {
  // Un combate por día en cada zona donde hay flotas enemigas
  for (const z of Object.values(datos.zonas)) {
    const paises = [...new Set(marina.flotas.filter((f) => f.zona === z.clave && !f.viaje && totalBarcos(f) > 0 && f.mision !== 'puerto').map((f) => f.pais))];
    for (let i = 0; i < paises.length; i++) {
      for (let k = i + 1; k < paises.length; k++) {
        if (!enGuerra(paises[i], paises[k])) continue;
        const r = combateEnZona(z, paises[i], paises[k]);
        if (r) {
          const jugador = datos.escenario.pais_jugador;
          if (r.ladoA === jugador || r.ladoB === jugador) avisar('combate_naval', r);
          mensaje(`Combate naval en ${z.nombre}. ${r.lineas.slice(-2).join(' ')}`, 'info', null);
        }
      }
    }
  }
  marina.flotas = marina.flotas.filter((f) => totalBarcos(f) > 0);
  calcularControl();
}

export function posicionFlota(f) {
  const a = datos.zonas[f.zona];
  if (!f.viaje) return { x: a.x, y: a.y };
  const b = datos.zonas[f.viaje.ruta[0]];
  const t = Math.min(1, f.viaje.recorrido / Math.max(1, distanciaKm(a.x, a.y, b.x, b.y)));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}


// Pasos por mar para el suministro: entre provincias costeras de zonas que el país controla.
export function enlacesSuministroMar(pais, desde) {
  const out = [];
  if (!datos.provincias[desde].costera) return out;
  for (const z of Object.values(datos.zonas)) {
    if (!z.costeras.includes(desde) || marina.control[z.clave] !== pais) continue;
    const a = datos.provincias[desde].centroPos;
    for (const j of z.costeras) {
      if (j === desde) continue;
      const b = datos.provincias[j].centroPos;
      out.push({ j, km: distanciaKm(a.x, a.y, b.x, b.y), maritimo: true });
    }
  }
  return out;
}
