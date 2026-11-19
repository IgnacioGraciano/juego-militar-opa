// Ejército terrestre: brigadas, cuerpos con su general, mano de obra, reclutamiento,
// movimiento por provincias y guerras.
//
// Los ejércitos de arranque salen de una fórmula (data/reglas/ejercito.json) con los
// datos de Correlates of War del año del escenario. Es una estimación para probar las
// mecánicas; después se reemplaza por los registros reales de cada país.

import { datos, cambiarDueno, nombrePais } from './datos.js';
import { hayEquipo, gastarEquipo, equipoPorTipo } from './economia.js';
import { factorRecuperacion, zona, suministroEn } from './suministro.js';

export const ejercito = {
  brigadas: [],
  cuerpos: [],
  manoDeObra: {}, // país -> hombres disponibles para reclutar
  equipo: {}, // país -> calidad del equipo (1 = promedio de la región)
  guerras: new Set(), // "ARG|CHL"
  eventos: new EventTarget(),
  siguienteId: 1,
};

const R = () => datos.reglas.ejercito;
export const tipos = () => R().tipos;

const ROMANOS = [['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90], ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]];
export function romano(n) {
  let s = '';
  for (const [r, v] of ROMANOS) while (n >= v) { s += r; n -= v; }
  return s;
}

const SUFIJO = { infanteria: 'de Infantería', montana: 'de Montaña', mecanizada: 'Mecanizada', blindada: 'Blindada' };

export function avisar(tipo, detalle) {
  ejercito.eventos.dispatchEvent(new CustomEvent(tipo, { detail: detalle }));
}

// Mensaje para el registro de la pantalla. tono: 'info', 'bueno' o 'malo'.
export function mensaje(texto, tono = 'info', pais = null) {
  avisar('mensaje', { texto, tono, pais });
}

// Generador de números al azar con semilla (mismo escenario = mismos ejércitos).
function azarConSemilla(texto) {
  let a = 0;
  for (const c of texto) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) + 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const limitar = (x, a, b) => Math.max(a, Math.min(b, x));

export function anioEscenario() {
  return Number((datos.escenario.fecha_inicio ?? '1978').slice(0, 4));
}

// Dato de Correlates of War de un país para un año. Si falta ese año, usa el más
// cercano anterior (o el primero posterior si no hay anteriores).
export function datoHistorico(pais, anio, campo) {
  const serie = datos.historico.paises?.[pais];
  if (!serie) return null;
  let antes = null, despues = null;
  for (const [a, reg] of Object.entries(serie)) {
    if (reg[campo] == null) continue;
    const n = Number(a);
    if (n <= anio && (!antes || n > antes.n)) antes = { n, v: reg[campo] };
    if (n > anio && (!despues || n < despues.n)) despues = { n, v: reg[campo] };
  }
  return (antes ?? despues)?.v ?? null;
}

// ------------------------------------------------------------------ guerras

const claveGuerra = (a, b) => [a, b].sort().join('|');

export function enGuerra(a, b) {
  return a !== b && ejercito.guerras.has(claveGuerra(a, b));
}

export function enemigosDe(pais) {
  const out = [];
  for (const k of ejercito.guerras) {
    const [a, b] = k.split('|');
    if (a === pais) out.push(b);
    else if (b === pais) out.push(a);
  }
  return out;
}

export function declararGuerra(a, b) {
  if (enGuerra(a, b) || a === b) return;
  ejercito.guerras.add(claveGuerra(a, b));
  mensaje(`${nombrePais(a)} le declara la guerra a ${nombrePais(b)}.`, 'malo');
  avisar('cambio');
}

// ------------------------------------------------------------------ consultas

export const brigadaPorId = (id) => ejercito.brigadas.find((b) => b.id === id);
export const cuerpoPorId = (id) => ejercito.cuerpos.find((c) => c.id === id);

// Brigadas paradas en una provincia (las que van de paso cuentan en la que salieron).
export function brigadasEn(provincia, filtro = () => true) {
  return ejercito.brigadas.filter((b) => b.provincia === provincia && filtro(b));
}

export function enemigosEn(pais, provincia) {
  return brigadasEn(provincia, (b) => enGuerra(pais, b.pais));
}

export function generalDe(b) {
  return cuerpoPorId(b.cuerpo)?.general ?? { nombre: 'Sin general', experiencia: 1 };
}

export function puedeEntrar(pais, j) {
  const d = datos.duenos[j];
  return d === pais || enGuerra(pais, d);
}

export function velocidadKmHora(b, conexion) {
  const t = datos.provincias[conexion.j].terreno;
  const m = R().movimiento;
  let v = tipos()[b.tipo].km_dia * (m[t]?.[b.tipo] ?? 1);
  if (conexion.estrecho) v *= m.estrecho;
  if (conexion.rio) v *= m.rio;
  return v / 24;
}

// Camino más rápido (en horas) entre la provincia de la brigada y el destino.
// No pasa por provincias neutrales ni por provincias con tropas enemigas.
export function calcularRuta(b, destino, desde = b.provincia) {
  if (desde === destino) return { ruta: [], horas: 0 };
  const n = datos.provincias.length;
  const horas = new Float64Array(n).fill(Infinity);
  const previo = new Int32Array(n).fill(-1);
  const hecho = new Uint8Array(n);
  horas[desde] = 0;
  for (;;) {
    let u = -1;
    let mejor = Infinity;
    for (let i = 0; i < n; i++) if (!hecho[i] && horas[i] < mejor) { mejor = horas[i]; u = i; }
    if (u < 0 || u === destino) break;
    hecho[u] = 1;
    for (const c of datos.provincias[u].conexiones) {
      if (hecho[c.j] || !puedeEntrar(b.pais, c.j)) continue;
      if (enemigosEn(b.pais, c.j).length) continue;
      const h = mejor + c.km / velocidadKmHora(b, c);
      if (h < horas[c.j]) { horas[c.j] = h; previo[c.j] = u; }
    }
  }
  if (!Number.isFinite(horas[destino])) return null;
  const ruta = [];
  for (let v = destino; v !== desde; v = previo[v]) ruta.unshift(v);
  return { ruta, horas: horas[destino] };
}

// ------------------------------------------------------------------ creación

function nuevaBrigada(pais, tipo, provincia, extra = {}) {
  const t = tipos()[tipo];
  const ley = R().reclutamiento[datos.escenario.reclutamiento?.[pais] ?? 'servicio_militar'];
  const numero = ejercito.brigadas.filter((b) => b.pais === pais).length + 1;
  const efectivos = extra.efectivos ?? t.efectivos;
  const b = {
    id: ejercito.siguienteId++,
    pais,
    tipo,
    nombre: extra.nombre ?? `${romano(numero)} Brigada ${SUFIJO[tipo]}`,
    provincia,
    efectivos,
    efectivosMax: efectivos,
    entrenamiento: extra.entrenamiento ?? ley.entrenamiento,
    equipo: ejercito.equipo[pais] ?? 1,
    moral: 1,
    organizacion: 1,
    atrincheramiento: 0,
    cuerpo: null,
    mov: null, // {ruta: [provincias], recorrido: km del tramo actual}
    formacion: null, // {horas, total}
    operacion: null,
    enCombate: false,
  };
  ejercito.brigadas.push(b);
  return b;
}

function nuevoCuerpo(pais, experiencia) {
  const n = ejercito.cuerpos.filter((c) => c.pais === pais).length + 1;
  const c = {
    id: ejercito.siguienteId++,
    pais,
    nombre: `${romano(n)} Cuerpo de Ejército`,
    general: { nombre: `Comandante del ${romano(n)} Cuerpo`, experiencia, xp: 0 },
  };
  ejercito.cuerpos.push(c);
  return c;
}

function provinciaCapital(pais) {
  const c = datos.ciudades.find((x) => x.capital === 'pais' && datos.duenos[datos.indiceProvincia.get(x.provincia)] === pais);
  return c ? datos.indiceProvincia.get(c.provincia) : -1;
}

export function generarEjercitos() {
  ejercito.brigadas = [];
  ejercito.cuerpos = [];
  ejercito.manoDeObra = {};
  ejercito.equipo = {};
  const anio = anioEscenario();
  const est = R().estimacion;
  const esc = datos.escenario;
  const paises = [...new Set(datos.duenos)];

  // Calidad del equipo: gasto por soldado comparado con la mediana de la región.
  const riqueza = {};
  for (const p of paises) {
    const g = datoHistorico(p, anio, 'gasto');
    const m = datoHistorico(p, anio, 'militares');
    if (g && m) riqueza[p] = g / m;
  }
  const valores = Object.values(riqueza).sort((a, b) => a - b);
  const mediana = valores[Math.floor(valores.length / 2)] || 1;
  for (const p of paises) ejercito.equipo[p] = riqueza[p] ? limitar(Math.sqrt(riqueza[p] / mediana), 0.75, 1.25) : 0.9;

  // Población por provincia (ciudades actuales: solo sirve como peso relativo)
  const poblacion = new Map();
  for (const c of datos.ciudades) {
    const i = datos.indiceProvincia.get(c.provincia);
    poblacion.set(i, (poblacion.get(i) ?? 0) + c.poblacion_actual);
  }

  for (const pais of paises) {
    const azar = azarConSemilla(`${pais}-${anio}`);
    const ley = R().reclutamiento[esc.reclutamiento?.[pais] ?? 'servicio_militar'];
    const provincias = datos.provincias.filter((_, i) => datos.duenos[i] === pais);
    const areaTotal = provincias.reduce((s, p) => s + p.area_km2, 0);
    // Sin dato de población: estimación por superficie (20 habitantes por km²).
    const pob = (datoHistorico(pais, anio, 'poblacion') ?? areaTotal * 0.02) * 1000;
    ejercito.manoDeObra[pais] = Math.round((pob * ley.por_anio * R().reclutamiento.reserva_inicial_meses) / 12);

    const nuevas = [];
    if (esc.guarniciones?.[pais]) {
      // Territorio principal fuera del mapa: guarniciones escritas a mano.
      for (const g of esc.guarniciones[pais]) {
        const i = datos.indiceProvincia.get(g.provincia);
        if (i !== undefined) nuevas.push(nuevaBrigada(pais, g.tipo, i, g));
      }
    } else {
      // Sin registro: 0,4 % de la población bajo bandera.
      const militares = datoHistorico(pais, anio, 'militares') ?? (pob / 1000) * 0.004;
      const n = Math.max(1, Math.round((militares * 1000 * est.proporcion_ejercito * est.proporcion_en_brigadas) / est.efectivos_por_brigada));
      const mec = est.mecanizacion;
      const t = limitar((anio - mec.desde_anio) / (mec.hasta_anio - mec.desde_anio), 0, 1);
      const parteMovil = limitar(t * mec.maximo * ejercito.equipo[pais], 0, 0.6);
      const areaMontana = provincias.filter((p) => p.terreno === 'montaña').reduce((s, p) => s + p.area_km2, 0);
      const parteMontana = Math.min(est.montana_maximo, (areaMontana / areaTotal) * est.montana_por_terreno);
      let nBlindadas = Math.round(n * parteMovil * est.parte_blindada);
      let nMecanizadas = Math.round(n * parteMovil) - nBlindadas;
      let nMontana = Math.round(n * parteMontana);
      while (nBlindadas + nMecanizadas + nMontana > n) {
        if (nMontana > 0) nMontana--;
        else if (nMecanizadas > 0) nMecanizadas--;
        else nBlindadas--;
      }
      const lista = [
        ...Array(nBlindadas).fill('blindada'), ...Array(nMecanizadas).fill('mecanizada'),
        ...Array(nMontana).fill('montana'), ...Array(n - nBlindadas - nMecanizadas - nMontana).fill('infanteria'),
      ];

      // Dónde arranca cada una: capital, fronteras con rivales y provincias pobladas.
      const capital = provinciaCapital(pais);
      const rivales = new Set(esc.rivales?.[pais] ?? []);
      const maxPob = Math.max(1, ...provincias.map((p) => poblacion.get(p.indice) ?? 0));
      const pesos = new Map();
      for (const p of provincias) {
        let w = 0.3 + est.peso_poblacion * ((poblacion.get(p.indice) ?? 0) / maxPob);
        if (p.indice === capital) w += est.peso_capital;
        if (p.conexiones.some((c) => rivales.has(datos.duenos[c.j]))) w += est.peso_frontera_rival;
        pesos.set(p.indice, w);
      }
      for (const tipo of lista) {
        let total = 0;
        const cand = provincias.map((p) => {
          let w = pesos.get(p.indice);
          if (tipo === 'montana') w *= p.terreno === 'montaña' ? 3 : 0.3;
          if (tipo === 'mecanizada' || tipo === 'blindada') w *= p.terreno === 'llanura' ? 2 : 0.4;
          total += w;
          return [p.indice, w];
        });
        let r = azar() * total;
        let elegida = cand[0][0];
        for (const [i, w] of cand) { r -= w; if (r <= 0) { elegida = i; break; } }
        pesos.set(elegida, pesos.get(elegida) / 1.8); // repartir, no amontonar
        nuevas.push(nuevaBrigada(pais, tipo, elegida, { entrenamiento: limitar(ley.entrenamiento + (azar() - 0.5) * 0.1, 0, 1) }));
      }
    }

    // Cuerpos: brigadas cercanas juntas, de a 'brigadas_por_cuerpo'.
    nuevas.sort((a, b) => datos.provincias[a.provincia].centroPos.y - datos.provincias[b.provincia].centroPos.y);
    for (let k = 0; k < nuevas.length; k += est.brigadas_por_cuerpo) {
      const c = nuevoCuerpo(pais, 1 + Math.floor(azar() * 3));
      for (const b of nuevas.slice(k, k + est.brigadas_por_cuerpo)) b.cuerpo = c.id;
    }
  }
  avisar('cambio');
}

// ------------------------------------------------------------------ reclutamiento

export function leyDe(pais) {
  const clave = datos.escenario.reclutamiento?.[pais] ?? 'servicio_militar';
  return { clave, ...R().reclutamiento[clave] };
}

export function costoBrigada(pais, tipo) {
  const ley = leyDe(pais);
  return { efectivos: tipos()[tipo].efectivos, dias: ley.dias_formacion, entrenamiento: ley.entrenamiento, equipo: equipoPorTipo(tipo) };
}

export function puedeReclutar(pais, tipo, provincia) {
  if (datos.duenos[provincia] !== pais) return 'Solo se recluta en provincias propias.';
  if (datos.provincias[provincia].pais !== pais) return 'No se recluta en territorio ocupado.';
  const c = costoBrigada(pais, tipo);
  if ((ejercito.manoDeObra[pais] ?? 0) < c.efectivos) return 'No alcanza la mano de obra.';
  if (!hayEquipo(pais, tipo)) return `Falta equipo (${c.equipo} juego/s): firmá un contrato de equipo para brigadas.`;
  return null;
}

export function reclutar(pais, tipo, provincia) {
  const error = puedeReclutar(pais, tipo, provincia);
  if (error) return error;
  const c = costoBrigada(pais, tipo);
  ejercito.manoDeObra[pais] -= c.efectivos;
  gastarEquipo(pais, tipo);
  const b = nuevaBrigada(pais, tipo, provincia);
  b.formacion = { horas: c.dias * 24, total: c.dias * 24 };
  b.organizacion = 0;
  // Al cuerpo con tropas más cerca; si está lleno, uno nuevo.
  const mismos = ejercito.brigadas.filter((x) => x.pais === pais && x !== b && x.cuerpo);
  const cerca = mismos.sort((x, y) => distanciaCentros(x.provincia, provincia) - distanciaCentros(y.provincia, provincia))[0];
  const cuerpo = cerca ? cuerpoPorId(cerca.cuerpo) : null;
  if (cuerpo && mismos.filter((x) => x.cuerpo === cuerpo.id).length < R().estimacion.brigadas_por_cuerpo + 2) b.cuerpo = cuerpo.id;
  else b.cuerpo = nuevoCuerpo(pais, 1).id;
  mensaje(`Se empezó a formar la ${b.nombre} en ${datos.provincias[provincia].nombre} (${c.dias} días).`, 'info', pais);
  avisar('cambio');
  return null;
}

function distanciaCentros(a, b) {
  const p = datos.provincias[a].centroPos;
  const q = datos.provincias[b].centroPos;
  return Math.hypot(p.x - q.x, p.y - q.y);
}

// ------------------------------------------------------------------ movimiento

// Devuelve un texto de error o null si se pudo ordenar.
export function ordenarMovimiento(b, destino) {
  if (b.formacion) return `${b.nombre} todavía está en formación.`;
  if (b.operacion) return `${b.nombre} está en una operación.`;
  if (enemigosEn(b.pais, destino).length) return `Hay tropas enemigas en ${datos.provincias[destino].nombre}: para atacar hay que armar una Operación.`;
  const r = calcularRuta(b, destino);
  if (!r) return `${b.nombre} no tiene camino por tierra hasta ${datos.provincias[destino].nombre}.`;
  b.mov = r.ruta.length ? { ruta: r.ruta, recorrido: 0 } : null;
  b.atrincheramiento = 0;
  avisar('cambio');
  return null;
}

// Fracción recorrida del tramo actual (0 a 1) para dibujar.
export function avanceTramo(b) {
  if (!b.mov) return 0;
  const c = datos.provincias[b.provincia].conexiones.find((x) => x.j === b.mov.ruta[0]);
  return c ? Math.min(1, b.mov.recorrido / c.km) : 0;
}

export function horasRestantes(b) {
  if (!b.mov) return 0;
  let h = 0;
  let desde = b.provincia;
  b.mov.ruta.forEach((j, k) => {
    const c = datos.provincias[desde].conexiones.find((x) => x.j === j);
    if (c) h += (c.km - (k === 0 ? b.mov.recorrido : 0)) / velocidadKmHora(b, c);
    desde = j;
  });
  return h;
}

function moverUnaHora(b) {
  const sig = b.mov.ruta[0];
  const c = datos.provincias[b.provincia].conexiones.find((x) => x.j === sig);
  if (!c || !puedeEntrar(b.pais, sig)) {
    b.mov = null;
    return;
  }
  b.mov.recorrido += velocidadKmHora(b, c);
  if (b.mov.recorrido < c.km) return;
  if (enemigosEn(b.pais, sig).length) {
    b.mov = null;
    mensaje(`${b.nombre} se frenó: hay tropas enemigas en ${datos.provincias[sig].nombre}.`, 'malo', b.pais);
    return;
  }
  b.provincia = sig;
  b.mov.ruta.shift();
  b.mov.recorrido = 0;
  if (datos.duenos[sig] !== b.pais && enGuerra(b.pais, datos.duenos[sig])) ocupar(sig, b.pais);
  if (!b.mov.ruta.length) {
    b.mov = null;
    avisar('llegada', b);
  }
}

export function ocupar(provincia, pais) {
  const antes = datos.duenos[provincia];
  cambiarDueno(provincia, pais);
  const p = datos.provincias[provincia];
  mensaje(`${nombrePais(pais)} ocupa ${p.nombre} (antes de ${nombrePais(antes)}).`, pais === datos.escenario.pais_jugador ? 'bueno' : 'malo');
}

// Saca a las brigadas de una provincia hacia una vecina propia. Devuelve las destruidas.
export function retirar(brigadas, desde, atacante) {
  const destruidas = [];
  for (const b of brigadas) {
    const opciones = datos.provincias[desde].conexiones
      .filter((c) => datos.duenos[c.j] === b.pais && !enemigosEn(b.pais, c.j).length)
      .map((c) => {
        const t = datos.provincias[c.j].terreno;
        return { c, puntaje: (t === 'montaña' ? 2 : t === 'selva' || t === 'ciudad' ? 1.5 : 1) * (c.rio ? 1.5 : 1) };
      })
      .sort((x, y) => y.puntaje - x.puntaje);
    if (!opciones.length) {
      destruidas.push(b);
      continue;
    }
    b.provincia = opciones[0].c.j;
    b.mov = null;
    b.atrincheramiento = 0;
    b.organizacion = Math.min(b.organizacion, 0.1);
  }
  for (const b of destruidas) eliminarBrigada(b, `${b.nombre} quedó rodeada y se rindió ante ${nombrePais(atacante)}.`);
  return destruidas;
}

export function eliminarBrigada(b, motivo) {
  ejercito.brigadas = ejercito.brigadas.filter((x) => x !== b);
  if (motivo) mensaje(motivo, b.pais === datos.escenario.pais_jugador ? 'malo' : 'bueno');
  avisar('cambio');
}

// ------------------------------------------------------------------ generales

export function nivelPorXp(xp) {
  const niveles = R().generales.xp_por_nivel;
  let n = 1;
  niveles.forEach((umbral, i) => { if (xp >= umbral) n = i + 1; });
  return n;
}

export function ganarExperiencia(cuerpoId) {
  const c = cuerpoPorId(cuerpoId);
  if (!c) return;
  const g = c.general;
  g.xp += R().generales.xp_por_fase;
  const nivel = Math.max(g.experiencia, nivelPorXp(g.xp));
  if (nivel > g.experiencia) {
    g.experiencia = Math.min(5, nivel);
    mensaje(`${g.nombre} sube a experiencia ${g.experiencia}.`, 'bueno', c.pais);
  }
  if (Math.random() < R().generales.probabilidad_muerte_por_fase) {
    mensaje(`Murió en combate el ${g.nombre}. Lo reemplaza un oficial con menos experiencia.`, 'malo', c.pais);
    relevarGeneral(c, false);
  }
}

export function relevarGeneral(c, avisarRelevo = true) {
  const viejo = c.general.nombre;
  c.general = { nombre: `${c.general.nombre.replace(/ \(\d+\)$/, '')} (${(c.relevos = (c.relevos ?? 1) + 1)})`, experiencia: 1, xp: 0 };
  if (avisarRelevo) mensaje(`Se relevó al ${viejo}. El nuevo comandante tiene experiencia 1.`, 'info', c.pais);
  avisar('cambio');
}

// ------------------------------------------------------------------ paso del tiempo

export function actualizarHora(horas) {
  const rec = R().recuperacion;
  for (const b of [...ejercito.brigadas]) {
    if (b.formacion) {
      b.formacion.horas--;
      if (b.formacion.horas <= 0) {
        b.formacion = null;
        b.organizacion = 0.6;
        mensaje(`La ${b.nombre} está lista en ${datos.provincias[b.provincia].nombre}.`, 'bueno', b.pais);
        avisar('cambio');
      }
      continue;
    }
    if (b.mov) moverUnaHora(b);
    if (!b.enCombate) {
      b.organizacion = Math.min(1, b.organizacion + rec.organizacion_por_hora * factorRecuperacion(b.pais, b.provincia));
      if (!b.mov && !b.operacion) b.atrincheramiento = Math.min(rec.atrincheramiento_maximo, b.atrincheramiento + rec.atrincheramiento_por_dia / 24);
    }
    b.enCombate = false;
  }
  if (horas % 24 === 0) actualizarDia();
}

function actualizarDia() {
  const rr = R().reclutamiento;
  const anio = anioEscenario();
  for (const pais of Object.keys(ejercito.manoDeObra)) {
    const ley = leyDe(pais);
    const pob = (datoHistorico(pais, anio, 'poblacion') ?? 1000) * 1000;
    ejercito.manoDeObra[pais] += Math.round((pob * ley.por_anio) / 365);
  }
  // Refuerzos: completar brigadas en territorio propio que no están peleando.
  for (const b of ejercito.brigadas) {
    if (b.formacion || b.efectivos >= b.efectivosMax || datos.duenos[b.provincia] !== b.pais) continue;
    if (zona(suministroEn(b.pais, b.provincia)) === 'rojo') continue;
    const falta = Math.min(rr.refuerzos_por_dia, b.efectivosMax - b.efectivos, ejercito.manoDeObra[b.pais] ?? 0);
    b.efectivos += falta;
    ejercito.manoDeObra[b.pais] -= falta;
    b.moral = Math.min(1, b.moral + R().recuperacion.moral_por_dia);
  }
  avisar('dia');
}
