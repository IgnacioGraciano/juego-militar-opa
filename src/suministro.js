// Suministro por depósitos y rutas (guion: Suministro).
//
//   El suministro sale de la capital y llega a cada depósito por las provincias propias
//   (por tren rinde mucho más). Cada depósito cubre un radio: verde (bien), amarillo
//   (justo) o rojo (cortado). Fuera de la zona verde las tropas se desgastan de a poco.
//   Si el enemigo toma una provincia de la ruta o la bombardea, la ruta se corta.

import { datos } from './datos.js';
import { distanciaKm } from './geo.js';
import { ejercito, mensaje, avisar, enemigosDe } from './ejercito.js';

export const suministro = {
  depositos: [], // {id, pais, provincia, horas (construcción), fueraDeServicio (días), conectado, alimentacion, ruta}
  valores: {}, // país -> Float32Array con el suministro de cada provincia (0 a 1)
  centrales: {}, // país -> provincia de la capital (depósito central) o -1
  rutasCentrales: {}, // país -> {deposito id -> [provincias]} para dibujar
  dano: null, // daño a rutas y vías por provincia (0 a 1), por bombardeos
  siguienteId: 1,
};
const RS = () => datos.reglas.suministro;
const limitar = (x, a, b) => Math.max(a, Math.min(b, x));

export function capitalDe(pais) {
  const c = datos.ciudades.find((x) => x.capital === 'pais' && datos.provincias[datos.indiceProvincia.get(x.provincia)]?.pais === pais);
  if (!c) return -1;
  const i = datos.indiceProvincia.get(c.provincia);
  return datos.duenos[i] === pais ? i : -1;
}

const tienePuerto = (j) => datos.puertos.some((p) => p.provincia === datos.provincias[j].id);

export function provinciaApta(pais, j) {
  if (j < 0 || datos.duenos[j] !== pais) return 'Tiene que ser una provincia tuya.';
  if (!datos.provincias[j].tren && !tienePuerto(j)) return 'Hace falta tren o puerto.';
  if (suministro.depositos.some((d) => d.provincia === j && d.pais === pais)) return 'Ya hay un depósito.';
  if (capitalDe(pais) === j) return 'La capital ya es el depósito central.';
  if (depositosDe(pais).length >= RS().depositos_maximos) return `Máximo ${RS().depositos_maximos} depósitos.`;
  return null;
}

export const depositosDe = (pais) => suministro.depositos.filter((d) => d.pais === pais);

export function construirDeposito(pais, j, inmediato = false) {
  const error = provinciaApta(pais, j);
  if (error) return error;
  suministro.depositos.push({
    id: suministro.siguienteId++,
    pais,
    provincia: j,
    horas: inmediato ? 0 : RS().dias_construccion * 24,
    fueraDeServicio: 0,
    conectado: false,
    alimentacion: 0,
    ruta: [],
  });
  if (!inmediato) mensaje(`Se empezó a armar un depósito en ${datos.provincias[j].nombre} (${RS().dias_construccion} días).`, 'info', pais);
  recalcular(pais);
  avisar('suministro');
  return null;
}

export function quitarDeposito(id) {
  const d = suministro.depositos.find((x) => x.id === id);
  suministro.depositos = suministro.depositos.filter((x) => x.id !== id);
  if (d) recalcular(d.pais);
  avisar('suministro');
}

// Al empezar: la capital y depósitos donde quedan más tropas lejos de un depósito
// (de a uno: cada nuevo cubre a las que el anterior no cubría).
export function iniciarSuministro() {
  suministro.depositos = [];
  suministro.dano = new Float32Array(datos.provincias.length);
  const radio = RS().radio_verde_km;
  const dist = (a, b) => {
    const p = datos.provincias[a].centroPos;
    const q = datos.provincias[b].centroPos;
    return distanciaKm(p.x, p.y, q.x, q.y);
  };
  for (const pais of new Set(datos.duenos)) {
    const capital = capitalDe(pais);
    const tropas = ejercito.brigadas.filter((b) => b.pais === pais).map((b) => b.provincia);
    const cubiertas = new Set(tropas.filter((t) => capital >= 0 && dist(t, capital) <= radio));
    for (let k = 0; k < RS().depositos_iniciales; k++) {
      const aptas = datos.provincias.filter((p) => !provinciaApta(pais, p.indice));
      let mejor = null;
      let mejorPuntaje = 0;
      for (const p of aptas) {
        const puntaje = tropas.filter((t, i) => !cubiertas.has(t) && dist(t, p.indice) <= radio * 1.2).length + (p.tren ? 0.1 : 0);
        if (puntaje > mejorPuntaje) { mejor = p; mejorPuntaje = puntaje; }
      }
      if (!mejor || mejorPuntaje < 1) break;
      construirDeposito(pais, mejor.indice, true);
      for (const t of tropas) if (dist(t, mejor.indice) <= radio * 1.2) cubiertas.add(t);
    }
  }
  recalcularTodo();
}

function valorPorDistancia(d) {
  const r = RS();
  if (d <= r.radio_verde_km) return r.valor_verde;
  if (d <= r.radio_amarillo_km) return r.valor_verde + (r.valor_amarillo - r.valor_verde) * ((d - r.radio_verde_km) / (r.radio_amarillo_km - r.radio_verde_km));
  if (d <= r.radio_maximo_km) return r.valor_amarillo + (r.valor_rojo - r.valor_amarillo) * ((d - r.radio_amarillo_km) / (r.radio_maximo_km - r.radio_amarillo_km));
  return r.valor_rojo * 0.6;
}

// Dijkstra por provincias del país. inicios: [{j, d}]. costo(c) devuelve km efectivos.
function caminos(pais, inicios, costo, extenderAfuera = false) {
  const n = datos.provincias.length;
  const dist = new Float64Array(n).fill(Infinity);
  const previo = new Int32Array(n).fill(-1);
  const hecho = new Uint8Array(n);
  for (const { j, d } of inicios) if (d < dist[j]) dist[j] = d;
  for (;;) {
    let u = -1;
    let mejor = Infinity;
    for (let i = 0; i < n; i++) if (!hecho[i] && dist[i] < mejor) { mejor = dist[i]; u = i; }
    if (u < 0) break;
    hecho[u] = 1;
    if (datos.duenos[u] !== pais) continue; // se llega a la provincia ajena pero no se sigue
    for (const c of datos.provincias[u].conexiones) {
      if (hecho[c.j]) continue;
      if (datos.duenos[c.j] !== pais && !extenderAfuera) continue;
      const d = mejor + costo(c);
      if (d < dist[c.j]) { dist[c.j] = d; previo[c.j] = u; }
    }
  }
  return { dist, previo };
}

export function recalcular(pais) {
  const r = RS();
  const n = datos.provincias.length;
  const valores = new Float32Array(n);
  const capital = capitalDe(pais);
  suministro.centrales[pais] = capital;
  const dano = suministro.dano;

  // Países con el territorio principal fuera del mapa (Malvinas, Guayana Francesa): llegan por mar.
  if (capitalOriginal(pais) < 0) {
    for (let j = 0; j < n; j++) if (datos.duenos[j] === pais) valores[j] = r.valor_amarillo;
    suministro.valores[pais] = valores;
    return;
  }

  // 1. Rutas desde la capital hasta cada depósito
  const costoRuta = (c) => c.km * (c.tren ? r.factor_tren : 1) * (c.estrecho ? r.factor_estrecho : 1) * (1 + 3 * dano[c.j]);
  const desdeCapital = capital >= 0 ? caminos(pais, [{ j: capital, d: 0 }], costoRuta) : null;
  const fuentes = capital >= 0 ? [{ j: capital, d: 0 }] : [];
  for (const d of depositosDe(pais)) {
    d.ruta = [];
    d.conectado = false;
    d.alimentacion = 0;
    if (d.horas > 0 || d.fueraDeServicio > 0 || datos.duenos[d.provincia] !== pais || !desdeCapital) continue;
    const km = desdeCapital.dist[d.provincia];
    if (!Number.isFinite(km)) continue;
    d.conectado = true;
    d.alimentacion = km <= r.linea_larga_km ? 1 : limitar(1 - 0.6 * ((km - r.linea_larga_km) / (r.linea_maxima_km - r.linea_larga_km)), 0.4, 1);
    for (let v = d.provincia; v !== -1; v = desdeCapital.previo[v]) d.ruta.unshift(v);
    fuentes.push({ j: d.provincia, d: (1 - d.alimentacion) * r.radio_amarillo_km });
  }

  // 2. Cobertura de cada fuente (también un paso dentro de territorio enemigo, para atacar)
  if (fuentes.length) {
    const cobertura = caminos(pais, fuentes, (c) => c.km * (c.tren ? 0.7 : 1) * (1 + 2 * dano[c.j]), true);
    for (let j = 0; j < n; j++) if (Number.isFinite(cobertura.dist[j])) valores[j] = valorPorDistancia(cobertura.dist[j]);
  }
  suministro.valores[pais] = valores;
}

function capitalOriginal(pais) {
  const c = datos.ciudades.find((x) => x.capital === 'pais' && datos.provincias[datos.indiceProvincia.get(x.provincia)]?.pais === pais);
  return c ? datos.indiceProvincia.get(c.provincia) : -1;
}

export function recalcularTodo() {
  for (const pais of new Set([...datos.duenos, ...ejercito.brigadas.map((b) => b.pais)])) recalcular(pais);
}

// Suministro de un país en una provincia (0 a 1).
export function suministroEn(pais, j) {
  const v = suministro.valores[pais];
  if (!v) return 1;
  return v[j] ?? 0;
}

export function zona(v) {
  const r = RS();
  return v >= r.umbral_verde ? 'verde' : v >= r.umbral_amarillo ? 'amarillo' : 'rojo';
}

export const NOMBRE_ZONA = { verde: 'Bien abastecida', amarillo: 'Justa', rojo: 'Cortada o lejos' };

// Multiplicador de recuperación de organización según el suministro.
export function factorRecuperacion(pais, j) {
  const z = zona(suministroEn(pais, j));
  return z === 'verde' ? 1 : z === 'amarillo' ? RS().recuperacion_amarilla : 0;
}

// ------------------------------------------------------------------ paso del tiempo

export function actualizarHoraSuministro() {
  let cambio = false;
  for (const d of suministro.depositos) {
    if (d.horas > 0) {
      d.horas--;
      if (d.horas === 0) {
        mensaje(`Depósito listo en ${datos.provincias[d.provincia].nombre}.`, 'bueno', d.pais);
        recalcular(d.pais);
        cambio = true;
      }
    }
  }
  if (cambio) avisar('suministro');
}

const avisados = new Set();

export function actualizarDiaSuministro() {
  const r = RS();
  for (let j = 0; j < suministro.dano.length; j++) suministro.dano[j] = Math.max(0, suministro.dano[j] - r.dano_rutas_recuperacion_por_dia);
  for (const d of suministro.depositos) if (d.fueraDeServicio > 0) d.fueraDeServicio--;
  // Depósitos que quedaron en territorio enemigo se pierden.
  for (const d of [...suministro.depositos]) {
    if (datos.duenos[d.provincia] !== d.pais) {
      mensaje(`Se perdió el depósito de ${datos.provincias[d.provincia].nombre}.`, 'malo', d.pais);
      suministro.depositos = suministro.depositos.filter((x) => x !== d);
    }
  }
  recalcularTodo();

  // Desgaste gradual fuera de la zona verde (en tiempo de paz las guarniciones se abastecen solas).
  const dr = r.desgaste_rojo;
  for (const b of ejercito.brigadas) {
    if (b.formacion || !enemigosDe(b.pais).length) continue;
    const z = zona(suministroEn(b.pais, b.provincia));
    if (z === 'rojo') {
      b.efectivos *= 1 - dr.efectivos_por_dia;
      b.moral = Math.max(0.3, b.moral - dr.moral_por_dia);
      b.organizacion = Math.min(b.organizacion, dr.organizacion_maxima);
      if (b.pais === datos.escenario.pais_jugador && !avisados.has(b.id)) {
        avisados.add(b.id);
        mensaje(`La ${b.nombre} está sin suministro en ${datos.provincias[b.provincia].nombre}: pierde fuerza y moral.`, 'malo', b.pais);
      }
    } else avisados.delete(b.id);
  }
  avisar('suministro');
}

export function danarRutas(j, cantidad) {
  suministro.dano[j] = Math.min(0.9, suministro.dano[j] + cantidad);
  recalcularTodo();
  avisar('suministro');
}

export function describirDeposito(d) {
  if (d.horas > 0) return `En construcción: ${Math.ceil(d.horas / 24)} días`;
  if (d.fueraDeServicio > 0) return `Fuera de servicio por bombardeo: ${d.fueraDeServicio} días`;
  if (!d.conectado) return 'Cortado: no hay ruta propia hasta la capital';
  return d.alimentacion >= 0.99 ? 'Conectado' : `Conectado por una ruta larga (${Math.round(d.alimentacion * 100)} %)`;
}

