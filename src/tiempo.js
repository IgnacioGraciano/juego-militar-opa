// Reloj del juego: tiempo real con pausa y 5 velocidades.
// El juego avanza de a una hora (el combate se calcula por hora de juego).
// La hora interna es UTC; se muestra en la hora local del escenario.

// Segundos reales que dura un día de juego en cada velocidad (1 a 5).
export const SEGUNDOS_POR_DIA = [12, 7, 4, 2, 0.5];
const MAX_HORAS_POR_CUADRO = 24;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const tiempo = {
  pausado: true,
  velocidad: 3,
  horas: 0, // horas de juego desde el inicio del escenario
  fraccion: 0, // fracción de la hora en curso (0 a 1)
  inicioUtc: 0, // milisegundos UTC del inicio
  zonaHoraria: 0,
  acumulado: 0,
  eventos: new EventTarget(),
};

export function iniciarTiempo(escenario) {
  tiempo.zonaHoraria = escenario.zona_horaria ?? 0;
  const [a, m, d] = (escenario.fecha_inicio ?? '1978-01-01').split('-').map(Number);
  const horaLocal = escenario.hora_inicio ?? 0;
  tiempo.inicioUtc = Date.UTC(a, m - 1, d, horaLocal - tiempo.zonaHoraria);
  tiempo.horas = 0;
}

function avisar(tipo) {
  tiempo.eventos.dispatchEvent(new Event(tipo));
}

// Se llama en cada cuadro con los segundos transcurridos.
export function avanzarTiempo(dt) {
  if (tiempo.pausado) return;
  const segPorHora = SEGUNDOS_POR_DIA[tiempo.velocidad - 1] / 24;
  tiempo.acumulado += dt;
  let pasos = 0;
  while (tiempo.acumulado >= segPorHora && pasos < MAX_HORAS_POR_CUADRO) {
    tiempo.acumulado -= segPorHora;
    pasos++;
    tiempo.horas++;
    avisar('hora');
    if (fechaLocal().getUTCHours() === 0) avisar('dia');
  }
  if (pasos === MAX_HORAS_POR_CUADRO) tiempo.acumulado = 0;
  tiempo.fraccion = Math.min(1, tiempo.acumulado / segPorHora);
}

export function alternarPausa() {
  tiempo.pausado = !tiempo.pausado;
  avisar('estado');
}

export function fijarVelocidad(v) {
  tiempo.velocidad = Math.max(1, Math.min(SEGUNDOS_POR_DIA.length, v));
  avisar('estado');
}

export const acelerar = () => fijarVelocidad(tiempo.velocidad + 1);
export const frenar = () => fijarVelocidad(tiempo.velocidad - 1);

// ------------------------------------------------------------------ consultas

export function msUtc() {
  return tiempo.inicioUtc + tiempo.horas * 3600e3;
}

// Fecha local como Date cuyos campos UTC son la hora local (getUTCHours, etc.).
export function fechaLocal() {
  return new Date(msUtc() + tiempo.zonaHoraria * 3600e3);
}

export function textoFecha() {
  const f = fechaLocal();
  return `${f.getUTCDate()} de ${MESES[f.getUTCMonth()]} de ${f.getUTCFullYear()}`;
}

export function textoHora() {
  return `${String(fechaLocal().getUTCHours()).padStart(2, '0')}:00`;
}

export function textoZona() {
  const z = tiempo.zonaHoraria;
  return `UTC${z >= 0 ? '+' : '−'}${Math.abs(z)}`;
}

// Posición del sol: {lon, lat} del punto donde está en el cénit.
// Aproximación suficiente para el día y la noche del mapa.
export function posicionSol() {
  return posicionSolEn(msUtc() + tiempo.fraccion * 3600e3);
}

export function posicionSolEn(ms) {
  const f = new Date(ms);
  const inicioAnio = Date.UTC(f.getUTCFullYear(), 0, 1);
  const dia = (ms - inicioAnio) / 86400e3; // días desde el 1 de enero (con decimales)
  const declinacion = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dia + 10));
  const horaUtc = f.getUTCHours() + f.getUTCMinutes() / 60;
  let lon = -15 * (horaUtc - 12);
  lon = ((lon + 540) % 360) - 180;
  return { lon, lat: declinacion };
}
