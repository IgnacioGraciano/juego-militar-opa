// Diseñador de equipamiento (paso 8, primera versión): se editan aviones y tanques
// reales existentes cambiando motor, armas, blindaje y equipos. Cada cambio cuesta
// puntos de diseño. El diseño nuevo se puede comprar o fabricar por contrato, y los
// escuadrones existentes se pueden reconvertir.

import { datos } from './datos.js';
import { mensaje, avisar } from './ejercito.js';
import { economiaDe } from './economia.js';
import { aviacion, modelo, olvidarModelo } from './aviacion.js';
import { tiempo } from './tiempo.js';

export const disenador = {
  disenos: [], // {clave, pais, tipo: 'avion'|'tanque', base, nombre, opciones}
  puntosExtra: {}, // país -> puntos de diseño ganados en el árbol nacional
  tanqueEnUso: {}, // país -> clave del tanque en producción
  siguiente: 1,
};
const RD = () => datos.reglas.disenador;

export function iniciarDisenador() {
  disenador.disenos = [];
  disenador.puntosExtra = {};
  disenador.tanqueEnUso = { ...(datos.escenario.tanques ?? {}) };
}

// ------------------------------------------------------------------ puntos

export function puntosDisponibles(pais, tipo) {
  const e = economiaDe(pais);
  const sector = tipo === 'avion' ? 'aeronautica' : 'metalmecanica';
  const nivel = e?.sectores[sector] ?? 0;
  return Math.floor(RD().puntos_base + nivel * RD().puntos_por_nivel + (disenador.puntosExtra[pais] ?? 0));
}

// ------------------------------------------------------------------ aviones

// Calcula el avión resultante a partir del modelo base y las opciones elegidas.
// opciones: {motor: 'original'|'potente'|'economico', agregados: {clave: true}}
export function calcularAvion(claveBase, opciones) {
  const base = datos.aviones.modelos[claveBase];
  const r = RD().avion;
  const m = { ...base };
  let puntos = 0;
  let costo = 1;
  const motor = r.motor[opciones.motor ?? 'original'];
  puntos += motor.puntos;
  m.velocidad_kmh = Math.round(m.velocidad_kmh * (motor.velocidad ?? 1));
  m.radio_km = Math.round(m.radio_km * (motor.radio ?? 1));
  costo *= motor.costo ?? 1;
  for (const [clave, activo] of Object.entries(opciones.agregados ?? {})) {
    if (!activo) continue;
    const a = r.agregados[clave];
    if (!a) continue;
    // Lo que el avión ya trae no cuesta puntos.
    const yaLoTiene = (clave === 'radar' && base.todo_tiempo) || base[clave] === true;
    if (!yaLoTiene) { puntos += a.puntos; costo *= a.costo ?? 1; }
    if (clave === 'canones' || clave === 'misiles_cortos' || clave === 'misiles_largos') m[clave] = true;
    if (clave === 'radar') { m.todo_tiempo = true; m.noche = true; }
    if (a.radio) m.radio_km = Math.round(m.radio_km * a.radio);
    if (a.maniobra) m.maniobra = Math.max(0.1, m.maniobra + a.maniobra);
    if (a.velocidad) m.velocidad_kmh = Math.round(m.velocidad_kmh * a.velocidad);
    if (a.blindaje) m.blindaje = a.blindaje;
    if (a.contramedidas) m.contramedidas = a.contramedidas;
  }
  const errores = [];
  if (m.misiles_largos && !m.todo_tiempo) errores.push('Los misiles de alcance medio necesitan radar.');
  m.costo = Math.round(base.costo * costo * 10) / 10;
  return { modelo: m, puntos, errores };
}

export function crearDisenoAvion(pais, claveBase, nombre, opciones) {
  const { modelo: m, puntos, errores } = calcularAvion(claveBase, opciones);
  if (errores.length) return errores[0];
  if (puntos > puntosDisponibles(pais, 'avion')) return 'No alcanzan los puntos de diseño.';
  if (!nombre?.trim()) return 'Ponele un nombre al diseño.';
  const clave = `dis${disenador.siguiente++}_${claveBase}`;
  datos.aviones.modelos[clave] = { ...m, nombre: nombre.trim(), diseno: true, base: claveBase, pais_diseno: pais };
  olvidarModelo(clave);
  disenador.disenos.push({ clave, pais, tipo: 'avion', base: claveBase, nombre: nombre.trim(), opciones: structuredClone(opciones) });
  mensaje(`Nuevo diseño: ${nombre.trim()} (sobre el ${datos.aviones.modelos[claveBase].nombre}). Ya se puede encargar por contrato.`, 'bueno', pais);
  avisar('diseno');
  return null;
}

// Reconvertir un escuadrón a un diseño nuevo: cuesta plata y lo deja fuera de servicio unos días.
export function costoReconversion(e, claveNueva) {
  const nuevo = modelo(claveNueva);
  return Math.round(nuevo.costo * RD().reconversion_parte_del_costo * e.aviones);
}

export function reconvertir(e, claveNueva) {
  const eco = economiaDe(e.pais);
  if (e.ocupado) return 'El escuadrón está ocupado.';
  const costo = costoReconversion(e, claveNueva);
  if (eco && eco.fondosMilitares < costo) return `Hacen falta ${costo} millones de fondos militares.`;
  if (eco) eco.fondosMilitares -= costo;
  e.ocupado = 'reconversion';
  e.reconversion = { modelo: claveNueva, hasta: tiempo.horas + RD().dias_reconversion * 24 };
  mensaje(`El ${e.nombre} entra a reconversión: ${RD().dias_reconversion} días.`, 'info', e.pais);
  avisar('aviacion');
  return null;
}

export function actualizarReconversiones() {
  for (const e of aviacion.escuadrones) {
    if (e.ocupado !== 'reconversion' || tiempo.horas < e.reconversion.hasta) continue;
    e.modelo = e.reconversion.modelo;
    e.nombre = e.nombre.replace(/·.*$/, `· ${modelo(e.modelo).nombre}`);
    e.ocupado = null;
    e.reconversion = null;
    mensaje(`El ${e.nombre} terminó la reconversión.`, 'bueno', e.pais);
  }
}

export const disenosDe = (pais, tipo) => disenador.disenos.filter((d) => d.pais === pais && d.tipo === tipo);

// ------------------------------------------------------------------ tanques

export function calcularTanque(claveBase, opciones) {
  const base = datos.tanques.modelos[claveBase];
  const r = RD().tanque;
  const t = { ...base };
  let puntos = 0;
  let costo = 1;
  for (const [clave, activo] of Object.entries(opciones.agregados ?? {})) {
    if (!activo) continue;
    const a = r.agregados[clave];
    puntos += a.puntos;
    costo *= a.costo ?? 1;
    if (a.ataque) t.ataque = Math.round(t.ataque * a.ataque * 100) / 100;
    if (a.defensa) t.defensa = Math.round(t.defensa * a.defensa * 100) / 100;
    if (a.velocidad) t.velocidad_kmh = Math.round(t.velocidad_kmh * a.velocidad);
  }
  t.costo = Math.round(base.costo * costo * 10) / 10;
  return { tanque: t, puntos, errores: [] };
}

export function crearDisenoTanque(pais, claveBase, nombre, opciones) {
  const { tanque, puntos } = calcularTanque(claveBase, opciones);
  if (puntos > puntosDisponibles(pais, 'tanque')) return 'No alcanzan los puntos de diseño.';
  if (!nombre?.trim()) return 'Ponele un nombre al diseño.';
  const clave = `dist${disenador.siguiente++}_${claveBase}`;
  datos.tanques.modelos[clave] = { ...tanque, nombre: nombre.trim(), diseno: true, base: claveBase, fabricable_en: [pais] };
  disenador.disenos.push({ clave, pais, tipo: 'tanque', base: claveBase, nombre: nombre.trim(), opciones: structuredClone(opciones) });
  mensaje(`Nuevo diseño de tanque: ${nombre.trim()}.`, 'bueno', pais);
  avisar('diseno');
  return null;
}

// Tanque en producción: lo usan las brigadas blindadas y mecanizadas nuevas.
export function fijarTanque(pais, clave) {
  disenador.tanqueEnUso[pais] = clave;
  mensaje(`Las brigadas blindadas y mecanizadas nuevas usarán el ${datos.tanques.modelos[clave].nombre}.`, 'info', pais);
  avisar('diseno');
}

export function tanqueDe(pais) {
  return datos.tanques.modelos[disenador.tanqueEnUso[pais] ?? 'm4'] ?? datos.tanques.modelos.m4;
}

// Multiplicador del equipo de una brigada blindada o mecanizada según su tanque.
export function factorTanque(pais) {
  const t = tanqueDe(pais);
  return Math.sqrt((t.ataque + t.defensa) / 2);
}
