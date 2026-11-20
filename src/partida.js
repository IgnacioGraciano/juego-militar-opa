// Guardar y cargar (paso 12). La partida se guarda en el navegador (3 ranuras) o como
// un código de texto que se puede copiar y pegar para pasarla a otra compu.

import { datos } from './datos.js';
import { tiempo, textoFecha } from './tiempo.js';
import { ejercito } from './ejercito.js';
import { operaciones } from './operaciones.js';
import { suministro, recalcularTodo } from './suministro.js';
import { aviacion, olvidarModelo } from './aviacion.js';
import { economia } from './economia.js';
import { disenador } from './disenador.js';
import { marina, calcularControl } from './marina.js';
import { diplomacia } from './diplomacia.js';

const VERSION = 1;
const PREFIJO = 'sudamerica1978_ranura_';

// JSON con Map, Set, Float32Array y referencias a escuadrones (en los vuelos).
function reemplazar(clave, v) {
  if (v instanceof Map) return { __map: [...v] };
  if (v instanceof Set) return { __set: [...v] };
  if (v instanceof Float32Array) return { __f32: [...v] };
  if (clave === 'e' && v && typeof v === 'object' && 'modelo' in v && 'base' in v) return { __esc: v.id };
  return v;
}
function revivir(_clave, v) {
  if (v && typeof v === 'object') {
    if ('__map' in v) return new Map(v.__map);
    if ('__set' in v) return new Set(v.__set);
    if ('__f32' in v) return Float32Array.from(v.__f32);
  }
  return v;
}

export function capturar(camara) {
  const modelosPropios = Object.fromEntries(Object.entries(datos.aviones.modelos).filter(([, m]) => m.diseno));
  const tanquesPropios = Object.fromEntries(Object.entries(datos.tanques.modelos).filter(([, m]) => m.diseno));
  return {
    version: VERSION,
    escenario: datos.escenario.nombre,
    fecha: textoFecha(),
    duenos: datos.duenos,
    paisOriginal: datos.provincias.map((p) => p.pais),
    reclutamiento: datos.escenario.reclutamiento,
    tiempo: { horas: tiempo.horas, velocidad: tiempo.velocidad, acumulado: tiempo.acumulado },
    camara: camara ? { x: camara.x, y: camara.y, zoom: camara.zoom } : null,
    ejercito: { brigadas: ejercito.brigadas, cuerpos: ejercito.cuerpos, manoDeObra: ejercito.manoDeObra, equipo: ejercito.equipo, guerras: ejercito.guerras, siguienteId: ejercito.siguienteId },
    operaciones,
    suministro: { depositos: suministro.depositos, dano: suministro.dano, siguienteId: suministro.siguienteId },
    aviacion: { escuadrones: aviacion.escuadrones, vuelos: aviacion.vuelos, pilotos: aviacion.pilotos, siguienteId: aviacion.siguienteId },
    economia,
    disenador,
    modelosPropios,
    tanquesPropios,
    marina: { flotas: marina.flotas, siguienteId: marina.siguienteId },
    diplomacia,
  };
}

export const serializar = (camara) => JSON.stringify(capturar(camara), reemplazar);

// Vuelve a poner el estado guardado en todos los módulos.
export function restaurar(texto, camara) {
  const p = JSON.parse(texto, revivir);
  if (p.version !== VERSION) throw new Error('La partida es de otra versión del juego.');
  for (let i = 0; i < datos.duenos.length; i++) {
    datos.duenos[i] = p.duenos[i];
    datos.provincias[i].pais = p.paisOriginal[i];
  }
  datos.escenario.reclutamiento = p.reclutamiento;
  Object.assign(tiempo, p.tiempo, { pausado: true });
  Object.assign(ejercito, p.ejercito);
  operaciones.lista = p.operaciones.lista;
  // Partidas de antes del combate continuo: las operaciones por fases pasan a batalla.
  for (const op of operaciones.lista) {
    if (op.estado === 'fase' || op.estado === 'decision') Object.assign(op, { estado: 'combate', horasBatalla: op.horasBatalla ?? 0, horasBombardeo: 0, balance: 0.5 });
    op.tomadas ??= [];
    op.reservas ??= [];
  }
  operaciones.siguienteId = p.operaciones.siguienteId;
  Object.assign(suministro, p.suministro);
  Object.assign(datos.aviones.modelos, p.modelosPropios);
  for (const k of Object.keys(p.modelosPropios)) olvidarModelo(k);
  Object.assign(datos.tanques.modelos, p.tanquesPropios);
  Object.assign(aviacion, p.aviacion);
  for (const v of aviacion.vuelos) for (const g of v.grupos) g.e = aviacion.escuadrones.find((e) => e.id === g.e.__esc) ?? g.e;
  Object.assign(economia, p.economia);
  Object.assign(disenador, p.disenador);
  Object.assign(marina, p.marina);
  Object.assign(diplomacia, p.diplomacia);
  if (camara && p.camara) {
    Object.assign(camara, p.camara);
    camara.zoomObjetivo = camara.zoom;
    camara.limitar();
  }
  recalcularTodo();
  calcularControl();
  return p;
}

// ------------------------------------------------------------------ ranuras del navegador

export function leerRanura(n) {
  try {
    const t = localStorage.getItem(PREFIJO + n);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

export function guardarEnRanura(n, camara) {
  try {
    localStorage.setItem(PREFIJO + n, JSON.stringify({ fecha: textoFecha(), guardado: new Date().toLocaleString('es-AR'), datos: serializar(camara) }));
    return null;
  } catch {
    return 'El navegador no deja guardar (modo privado o sin espacio). Usá el código de partida.';
  }
}

export function cargarRanura(n, camara) {
  const r = leerRanura(n);
  if (!r) return 'La ranura está vacía.';
  restaurar(r.datos, camara);
  return null;
}

// ------------------------------------------------------------------ código de partida

async function comprimir(texto) {
  if (typeof CompressionStream === 'undefined') return `T${btoa(unescape(encodeURIComponent(texto)))}`;
  const flujo = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(flujo).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `G${btoa(bin)}`;
}

async function descomprimir(codigo) {
  const c = codigo.trim();
  if (c[0] === 'T') return decodeURIComponent(escape(atob(c.slice(1))));
  const bin = atob(c.slice(1));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(flujo).text();
}

export const codigoPartida = (camara) => comprimir(serializar(camara));

export async function cargarCodigo(codigo, camara) {
  restaurar(await descomprimir(codigo), camara);
}
