// Barra superior (datos del país del jugador) y panel de país con pestañas.
// Se abre tocando un país: el propio desde la barra, cualquiera desde la ficha de una
// provincia, con doble clic en el mapa o con la lista del panel.

import { datos, nombrePais } from './datos.js';
import { $, h, miles, dec, pct, plata, chipPais, iconoUnidad, medidor, filasDatos } from './dom.js';
import { svgPictograma, svgSilueta } from './simbolos.js';
import {
  ejercito, tipos, enGuerra, enemigosDe, leyDe, horasRestantes, relevarGeneral, datoHistorico, anioEscenario, mensaje, avisar,
} from './ejercito.js';
import {
  economia, economiaDe, poblacion, capacidad, cotizar, firmarContrato, cancelarContrato, textoProducto,
  fijarImpuestos, fijarGastoMilitar, invertir, costoInversion, factorRepuestos, consumoRepuestos, nombreProveedor, embargo,
} from './economia.js';
import { aviacion, escuadronesDe, modelo, disponibles, basesDe, fijarMision, avionesDe } from './aviacion.js';
import { iconoAvion, barrasAvion, etiquetasAvion } from './panel_aereo.js';
import { depositosDe, describirDeposito, quitarDeposito, capitalDe, suministroEn, zona, NOMBRE_ZONA } from './suministro.js';
import { marina, flotasDe, totalBarcos, barcosDe, fijarMisionFlota } from './marina.js';
import {
  diplomacia, relacion, voluntad, justificacion, tieneJustificacion, diasJustificacion, fabricarJustificacion,
  declararGuerra, proponerPaz, reclamosDe, estadoNodo, empezarNodo, puntajeGuerra,
} from './diplomacia.js';
import {
  disenador, puntosDisponibles, calcularAvion, crearDisenoAvion, disenosDe, reconvertir, costoReconversion,
  calcularTanque, crearDisenoTanque, fijarTanque, tanqueDe,
} from './disenador.js';

const PESTANAS = [
  ['resumen', 'Resumen'],
  ['ejercito', 'Ejército'],
  ['aviacion', 'Aviación'],
  ['marina', 'Marina'],
  ['economia', 'Economía'],
  ['suministro', 'Suministro'],
  ['diplomacia', 'Diplomacia'],
  ['decisiones', 'Decisiones', true],
  ['diseno', 'Diseño', true],
];

let acc = {};
let actual = { pais: null, pestana: 'resumen' };
let pedido = { producto: 'equipo', tipo: 'estatal', cantidad: 2, modelo: null, proveedor: 'USA', base: null };
let diseno = { tipo: 'avion', base: null, nombre: '', motor: 'original', agregados: {} };

const jugador = () => datos.escenario.pais_jugador;
const RE = () => datos.reglas.economia;

export function iniciarPanelPais(acciones) {
  acc = acciones;
  $('pais-cerrar').addEventListener('click', cerrarPais);
  const sel = $('pais-elegir');
  const paises = Object.keys(datos.paises).filter((p) => datos.duenos.includes(p));
  sel.replaceChildren(...paises.map((p) => h('option', { value: p }, nombrePais(p))));
  sel.addEventListener('change', () => abrirPais(sel.value, actual.pestana));
  const j = jugador();
  $('pais-jugador').replaceWith(Object.assign(chipPais(j), { id: 'pais-jugador' }));
  $('barra-pais').addEventListener('click', () => (actual.pais === j ? cerrarPais() : abrirPais(j, 'resumen')));
  actualizarBarra();
}

// ------------------------------------------------------------------ barra superior

export function actualizarBarra() {
  const j = jugador();
  const e = economiaDe(j);
  const brigadas = ejercito.brigadas.filter((b) => b.pais === j);
  const indicadores = [
    ['ejercito', 'Mano de obra', miles(ejercito.manoDeObra[j] ?? 0), leyDe(j).nombre],
    ['ejercito', 'Brigadas', String(brigadas.length), `${miles(brigadas.reduce((s, b) => s + b.efectivos, 0))} hombres`],
    ['aviacion', 'Aviones', String(avionesDe(j)), `${escuadronesDe(j).length} escuadrones`],
    ['marina', 'Barcos', String(barcosDe(j)), `${flotasDe(j).length} flotas`],
    e && ['economia', 'Fondos', plata(e.fondosMilitares), `Fondos militares. Gasto militar ${dec(e.gastoMilitar * 100, 1)} % del PBI`],
    e && ['economia', 'Divisas', plata(e.divisas), 'Para compras en el exterior'],
    e && ['resumen', 'Estabilidad', `${Math.round(e.estabilidad)} %`, 'Baja con impuestos altos, gasto militar alto, guerra y bajas', e.estabilidad < 35],
    ['diplomacia', 'Tensión', `${Math.round(diplomacia.tension)} %`, 'Tensión mundial: sube con justificaciones y guerras', diplomacia.tension > 60],
  ].filter(Boolean);
  $('indicadores').replaceChildren(...indicadores.map(([pestana, nombre, valor, ayuda, alerta]) => h('button', {
    type: 'button', class: `indicador${alerta ? ' alerta' : ''}`, title: ayuda, onclick: () => abrirPais(j, pestana),
  }, h('span', { class: 'rotulo' }, nombre), h('b', {}, valor))));
  const enemigos = enemigosDe(j);
  $('barra-guerra').hidden = !enemigos.length;
  $('barra-guerra').replaceChildren(h('span', { class: 'rotulo' }, 'En guerra'), ...enemigos.map((p) => chipPais(p, () => abrirPais(p, 'resumen'))));
}

// ------------------------------------------------------------------ panel

export function abrirPais(pais, pestana = 'resumen') {
  const propio = pais === jugador();
  if (!propio && PESTANAS.find(([k]) => k === pestana)?.[2]) pestana = 'resumen';
  actual = { pais, pestana };
  $('pais').hidden = false;
  $('pais-elegir').value = pais;
  $('pais-franja').style.setProperty('--pais', datos.paises[pais]?.color ?? '#888');
  $('pais-titulo').replaceWith(Object.assign(chipPais(pais), { id: 'pais-titulo' }));
  $('pais-sub').textContent = propio ? 'Tu país' : enGuerra(jugador(), pais) ? 'En guerra con vos' : 'Otro país';
  $('pais-pestanas').replaceChildren(...PESTANAS.filter(([, , soloPropio]) => propio || !soloPropio).map(([clave, nombre]) => h('button', {
    type: 'button', role: 'tab', 'data-pestana': clave, 'aria-selected': String(clave === pestana), onclick: () => abrirPais(actual.pais, clave),
  }, nombre)));
  renderPestana();
  acc.alCambiarPanel?.();
}

export function cerrarPais() {
  actual.pais = null;
  $('pais').hidden = true;
  acc.alCambiarPanel?.();
}

export const paisAbierto = () => actual.pais;

// Se llama seguido (cada pocas horas de juego). No rehace la pestaña mientras se escribe en ella.
export function refrescarPais() {
  if (!actual.pais) return;
  const activo = document.activeElement;
  if ($('pais-contenido').contains(activo) && activo.matches('input, select, textarea')) return;
  renderPestana();
}

function renderPestana() {
  const cont = $('pais-contenido');
  const pais = actual.pais;
  const contenido = {
    resumen: pestanaResumen, ejercito: pestanaEjercito, aviacion: pestanaAviacion, marina: pestanaMarina,
    economia: pestanaEconomia, suministro: pestanaSuministro, diplomacia: pestanaDiplomacia,
    decisiones: pestanaDecisiones, diseno: pestanaDiseno,
  }[actual.pestana](pais);
  const scroll = cont.scrollTop;
  cont.replaceChildren(...[contenido].flat().filter(Boolean));
  cont.scrollTop = scroll;
}

const seccion = (titulo, ...hijos) => h('section', {}, h('h3', {}, titulo), ...hijos);
const datosDl = (filas) => h('dl', { class: 'datos' }, ...filasDatos(filas));
const tarjeta = (rotulo, valor, sub = '', extra = null) => h('div', { class: 'tarjeta' }, h('span', { class: 'rotulo' }, rotulo), h('b', { title: typeof valor === 'string' ? valor : null }, valor), sub ? h('small', { title: sub }, sub) : null, extra);
const tarjetas = (lista, tres = false) => h('div', { class: `tarjetas${tres ? ' tres' : ''}` }, ...lista.filter(Boolean));
const repintar = () => renderPestana();

// ------------------------------------------------------------------ Resumen

function pestanaResumen(pais) {
  const e = economiaDe(pais);
  const anio = anioEscenario();
  const pob = poblacion(pais);
  const brigadas = ejercito.brigadas.filter((b) => b.pais === pais);
  const rivales = datos.escenario.rivales?.[pais] ?? [];
  const enemigos = enemigosDe(pais);
  const out = [];
  out.push(tarjetas([
    tarjeta('Población', pob ? `${dec(pob / 1e6, 1)} M` : '—', 'habitantes'),
    e ? tarjeta('PBI', plata(e.pbi), `${miles((e.pbi * 1e6) / Math.max(1, pob))} US$ por habitante`) : tarjeta('Economía', 'Fuera del mapa', 'no se simula'),
    e ? tarjeta('Estabilidad', `${Math.round(e.estabilidad)} %`, '', medidor(e.estabilidad / 100, e.estabilidad < 35 ? 'mal' : '')) : null,
    tarjeta('Voluntad nacional', `${Math.round(voluntad(pais))} %`, enemigos.length ? 'Si se quiebra, busca la paz' : '', medidor(voluntad(pais) / 100, voluntad(pais) < 30 ? 'mal' : 'bien')),
    tarjeta('Ejército', `${brigadas.length} brigadas`, `${miles(brigadas.reduce((s, b) => s + b.efectivos, 0))} hombres`),
    tarjeta('Aviación', `${avionesDe(pais)} aviones`, `${escuadronesDe(pais).length} escuadrones`),
    tarjeta('Marina', `${barcosDe(pais)} barcos`, `${flotasDe(pais).length} flotas`),
    e ? tarjeta('Gasto militar', `${dec(e.gastoMilitar * 100, 1)} %`, `del PBI · ${plata(e.pbi * e.gastoMilitar)} por año`) : null,
  ]));
  const filas = [
    ['Militares en total', datoHistorico(pais, anio, 'militares') ? `${miles(datoHistorico(pais, anio, 'militares') * 1000)} (todas las fuerzas)` : 'Sin dato'],
    ['Reclutamiento', leyDe(pais).nombre],
    rivales.length ? ['Rivales', h('span', { class: 'chips' }, ...rivales.map((r) => chipPais(r, () => abrirPais(r))))] : null,
    enemigos.length ? ['En guerra con', h('span', { class: 'chips' }, ...enemigos.map((r) => chipPais(r, () => abrirPais(r))))] : null,
    pais !== jugador() ? ['Relación con vos', `${relacion(pais, jugador()) > 0 ? '+' : ''}${Math.round(relacion(pais, jugador()))}`] : null,
  ];
  out.push(seccion('Situación', datosDl(filas)));
  if (pais !== jugador()) out.push(accionesDiplomaticas(pais));
  out.push(h('p', { class: 'nota' }, `Población, militares y gasto: Correlates of War (${anio}). PBI de 1978 aproximado, a verificar.`));
  return out;
}

// Botones de guerra y paz frente a otro país.
function accionesDiplomaticas(pais) {
  const j = jugador();
  const caja = h('section', {}, h('h3', {}, 'Guerra y paz'));
  const err = (e) => { if (e) mensaje(e, 'malo', j); repintar(); acc.alCambiarPanel?.(); };
  if (enGuerra(j, pais)) {
    const puntaje = puntajeGuerra(j, pais);
    caja.append(datosDl([['Marcha de la guerra', puntaje > 0 ? 'A tu favor' : puntaje < 0 ? 'En contra' : 'Pareja'], ['Su voluntad', `${Math.round(voluntad(pais))} %`]]));
    caja.append(h('div', { class: 'acciones fila' },
      h('button', { type: 'button', class: 'boton', onclick: () => err(proponerPaz(j, pais, 'alto_el_fuego')) }, 'Proponer alto el fuego'),
      h('button', { type: 'button', class: 'boton', onclick: () => err(proponerPaz(j, pais, 'cesion')) }, 'Exigir lo ocupado')));
    caja.append(h('p', { class: 'nota' }, 'Alto el fuego: cada uno se queda con lo que tiene. Exigir lo ocupado: las provincias que ocupaste pasan a ser tuyas. Lo aceptan si su voluntad nacional está baja o si van perdiendo.'));
    return caja;
  }
  const just = justificacion(j, pais);
  if (tieneJustificacion(j, pais)) {
    caja.append(h('p', {}, `Tenés justificación de guerra contra ${nombrePais(pais)}.`));
    caja.append(h('button', { type: 'button', class: 'boton peligro', onclick: () => { err(declararGuerra(j, pais)); acc.declaro?.(pais); } }, `Declarar la guerra a ${nombrePais(pais)}`));
  } else if (just) {
    caja.append(h('p', {}, `Fabricando una justificación: faltan ${Math.ceil(just.horas / 24)} días.`), medidor(1 - just.horas / (diasJustificacion(j, pais) * 24)));
  } else {
    caja.append(h('button', { type: 'button', class: 'boton', onclick: () => err(fabricarJustificacion(j, pais)) },
      h('b', {}, 'Fabricar una justificación de guerra'), h('small', {}, `${diasJustificacion(j, pais)} días · sube la tensión mundial`)));
  }
  const reclamos = diplomacia.reclamos.filter((r) => r.de === j && r.a === pais);
  if (reclamos.length) caja.append(h('p', { class: 'nota' }, `Reclamo: ${reclamos.map((r) => r.nombre).join(', ')}. Acorta la justificación.`));
  return caja;
}

// ------------------------------------------------------------------ Ejército

function estadoBrigada(b) {
  if (b.formacion) return `En formación: ${Math.ceil(b.formacion.horas / 24)} d`;
  if (b.operacion) return 'En operación';
  if (b.mov) return `Marchando (${Math.ceil(horasRestantes(b) / 24)} d)`;
  const z = zona(suministroEn(b.pais, b.provincia));
  return z === 'rojo' ? 'Sin suministro' : z === 'amarillo' ? 'Suministro justo' : 'Lista';
}

function pestanaEjercito(pais) {
  const e = economiaDe(pais);
  const ley = leyDe(pais);
  const propio = pais === jugador();
  const leyes = datos.reglas.ejercito.reclutamiento;
  const out = [];
  out.push(tarjetas([
    tarjeta('Mano de obra', miles(ejercito.manoDeObra[pais] ?? 0), 'hombres disponibles'),
    e ? tarjeta('Equipo', `${e.equipo} juegos`, 'para brigadas nuevas') : null,
    tarjeta('Entrenamiento', pct(ley.entrenamiento), `${ley.dias_formacion} días de formación`),
    tarjeta('Tanque', tanqueDe(pais).nombre, 'de las brigadas blindadas nuevas'),
  ]));
  if (propio) {
    out.push(h('label', { class: 'campo' }, h('span', {}, 'Ley de reclutamiento'),
      h('select', { onchange: (ev) => { datos.escenario.reclutamiento[pais] = ev.target.value; mensaje(`Nueva ley: ${leyes[ev.target.value].nombre.toLowerCase()}.`, 'info', pais); avisar('cambio'); repintar(); } },
        ...['servicio_militar', 'voluntarios'].map((k) => h('option', { value: k, selected: k === ley.clave }, leyes[k].nombre)))));
    out.push(h('p', { class: 'nota' }, 'Cada brigada nueva usa mano de obra y equipo (infantería y montaña 1 juego, mecanizada 3, blindada 4). Se recluta desde la ficha de una provincia propia.'));
  }
  for (const c of ejercito.cuerpos.filter((x) => x.pais === pais)) {
    const lista = ejercito.brigadas.filter((b) => b.cuerpo === c.id);
    if (!lista.length) continue;
    out.push(h('section', {},
      h('h3', {}, c.nombre, h('span', { class: 'estrellas', title: `Experiencia ${c.general.experiencia} de 5` }, '★'.repeat(c.general.experiencia) + '☆'.repeat(5 - c.general.experiencia))),
      h('div', { class: 'cuerpo' }, h('span', {}, c.general.nombre),
        propio ? h('button', { type: 'button', class: 'mini', onclick: () => { relevarGeneral(c); repintar(); } }, 'Relevar') : null),
      h('ul', { class: 'lista-tropas' }, ...lista.map((b) => h('li', { class: propio ? 'clicable' : '', onclick: propio ? () => acc.elegirYCentrar(b.id) : null },
        iconoUnidad(b.tipo, b.pais, tipos()[b.tipo].nombre),
        h('div', { class: 'tropa' },
          h('div', { class: 'tropa-nombre' }, b.nombre),
          h('div', { class: 'tropa-datos' }, `${miles(b.efectivos)} h · ${datos.provincias[b.provincia].nombre} · ${estadoBrigada(b)}`),
          h('div', { class: 'barra-org' }, h('i', { style: `width:${Math.round(b.organizacion * 100)}%` }))))))));
  }
  return out;
}

// ------------------------------------------------------------------ Aviación

function pestanaAviacion(pais) {
  const propio = pais === jugador();
  const p = aviacion.pilotos[pais] ?? { reserva: 0, prisioneros: 0 };
  const out = [];
  out.push(tarjetas([
    tarjeta('Aviones', String(avionesDe(pais)), `${escuadronesDe(pais).length} escuadrones`),
    tarjeta('Pilotos', miles(p.reserva), `en reserva${p.prisioneros ? ` · ${p.prisioneros} presos` : ''}`),
    economiaDe(pais) ? tarjeta('Repuestos', pct(Math.min(1, factorRepuestos(pais))), 'de disponibilidad') : null,
  ], true));
  if (propio) {
    out.push(h('div', { class: 'acciones fila' }, h('button', { type: 'button', class: 'boton principal', onclick: () => acc.elegirBlancoAereo() }, 'Armar un paquete de ataque…')));
    out.push(h('p', { class: 'nota' }, 'Tocá un escuadrón para elegirlo en el mapa: ahí podés cambiarlo de base o mandarlo a atacar.'));
  }
  out.push(h('ul', { class: 'lista-tropas tarjetas-avion' }, ...escuadronesDe(pais).map((e) => {
    const m = modelo(e.modelo);
    return h('li', {
      class: propio ? 'clicable' : '', onclick: propio ? () => acc.elegirEscuadron(e.id) : null,
      onmouseenter: () => acc.mostrarAlcance?.(e), onmouseleave: () => acc.mostrarAlcance?.(null),
    },
    iconoAvion(e),
    h('div', { class: 'tropa' },
      h('div', { class: 'tropa-nombre' }, m.nombre),
      h('div', { class: 'tropa-datos' }, `${e.aviones} aviones · ${disponibles(e)} listos · pilotos ${pct(e.experiencia)} · ${datos.bases[e.base].nombre}`),
      h('div', { class: 'mini-barras' }, ...[['Vel.', m.velocidad_kmh / 2350], ['Alc.', m.radio_km / 1300], ['Aire', m.aire / 1.5], ['Ataque', m.ataque / 1.25]].map(([t, v]) => h('span', {}, t, medidor(v))))),
    propio ? h('select', { 'aria-label': `Misión de ${e.nombre}`, onclick: (ev) => ev.stopPropagation(), onchange: (ev) => { fijarMision(e, ev.target.value); repintar(); } },
      h('option', { value: 'alerta', selected: e.mision === 'alerta' }, 'Alerta'),
      h('option', { value: 'reposo', selected: e.mision === 'reposo' }, 'Reposo')) : null);
  })));
  if (!escuadronesDe(pais).length) out.push(h('p', { class: 'nota' }, 'Sin aviones de combate.'));
  out.push(h('p', { class: 'nota' }, 'Inventarios de 1978 aproximados, a verificar. Aire y ataque salen de la misma fórmula para todos los aviones.'));
  return out;
}

// ------------------------------------------------------------------ Marina

const RESUMEN_BARCOS = (f) => Object.entries(f.barcos).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${datos.barcos.clases[k].nombre.toLowerCase()}${n > 1 ? (k.startsWith('submarino') ? '' : 's') : ''}`).join(' · ');

function pestanaMarina(pais) {
  const propio = pais === jugador();
  const flotas = flotasDe(pais);
  const controladas = Object.values(marina.control).filter((p) => p === pais).length;
  const out = [];
  out.push(tarjetas([
    tarjeta('Barcos', String(barcosDe(pais)), `${flotas.length} flotas`),
    tarjeta('Zonas', String(controladas), 'controladas'),
    tarjeta('Transporte', `${flotas.reduce((s, f) => s + (f.barcos.transporte ?? 0), 0)} buques`, 'llevan 1 brigada cada uno'),
  ], true));
  if (propio) out.push(h('p', { class: 'nota' }, 'Tocá una flota para elegirla en el mapa. Clic derecho en el mar la manda a otra zona. Con transportes y la zona controlada, tus tropas cruzan por mar y podés desembarcar.'));
  out.push(h('ul', { class: 'lista-tropas' }, ...flotas.map((f) => h('li', { class: propio ? 'clicable' : '', onclick: propio ? () => acc.elegirFlota?.(f.id) : null },
    h('span', { class: 'simbolo', style: `--pais:${datos.paises[f.pais]?.color}` }, svgPictograma('barco')),
    h('div', { class: 'tropa' },
      h('div', { class: 'tropa-nombre' }, f.nombre),
      h('div', { class: 'tropa-datos' }, `${datos.zonas[f.zona].nombre}${f.viaje ? ` → ${datos.zonas[f.viaje.ruta.at(-1)].nombre}` : ''} · ${datos.reglas.marina.misiones[f.mision].nombre}`),
      h('div', { class: 'tropa-datos' }, RESUMEN_BARCOS(f))),
    propio ? h('select', { 'aria-label': `Misión de ${f.nombre}`, onclick: (ev) => ev.stopPropagation(), onchange: (ev) => { fijarMisionFlota(f, ev.target.value); repintar(); } },
      ...Object.entries(datos.reglas.marina.misiones).map(([k, m]) => h('option', { value: k, selected: f.mision === k }, m.nombre))) : null))));
  if (!flotas.length) out.push(h('p', { class: 'nota' }, 'Sin flota de guerra.'));
  out.push(h('p', { class: 'nota' }, 'Flotas de 1978 aproximadas, a verificar con The Military Balance.'));
  return out;
}

// ------------------------------------------------------------------ Economía

function control(nombre, valor, min, max, paso, alCambiar, ayuda) {
  const salida = h('b', {}, `${dec(valor * 100, 1)} %`);
  const entrada = h('input', {
    type: 'range', min, max, step: paso, value: valor, 'aria-label': nombre,
    oninput: (ev) => { salida.textContent = `${dec(Number(ev.target.value) * 100, 1)} %`; },
    onchange: (ev) => alCambiar(Number(ev.target.value)),
  });
  return h('div', { class: 'control' }, h('div', { class: 'control-cabeza' }, h('span', {}, nombre), salida), entrada, h('small', {}, ayuda));
}

function pestanaEconomia(pais) {
  const e = economiaDe(pais);
  if (!e) return [h('p', { class: 'nota' }, `El territorio principal de ${nombrePais(pais)} está fuera del mapa: su economía no se simula.`)];
  const propio = pais === jugador();
  const pp = RE().presupuesto;
  const out = [];
  out.push(tarjetas([
    tarjeta('PBI', plata(e.pbi), `${e.crecimiento >= 0 ? '+' : ''}${dec(e.crecimiento * 100, 1)} % por año`),
    tarjeta('Fondos militares', plata(e.fondosMilitares), 'para contratos'),
    tarjeta('Tesoro', plata(e.tesoro), e.tesoro < 0 ? 'Deuda: baja la estabilidad' : 'para invertir'),
    tarjeta('Divisas', plata(e.divisas), 'para compras afuera'),
  ]));
  if (propio) {
    out.push(seccion('Presupuesto',
      control('Impuestos', e.impuestos, pp.impuestos_min, pp.impuestos_max, 0.01, (v) => { fijarImpuestos(pais, v); repintar(); }, 'Más impuestos: más plata en el tesoro, menos estabilidad.'),
      control('Gasto militar', e.gastoMilitar, pp.gasto_militar_min, pp.gasto_militar_max, 0.005, (v) => { fijarGastoMilitar(pais, v); repintar(); }, 'Más gasto: más fondos para contratos, menos crecimiento y estabilidad.')));
  }
  const costo = costoInversion(pais);
  out.push(seccion('Industria', h('ul', { class: 'sectores' }, ...Object.entries(RE().sectores).map(([clave, s]) => {
    const inv = e.inversiones.find((i) => i.sector === clave);
    return h('li', {},
      h('div', { class: 'sector-cabeza' }, h('b', {}, s.nombre), h('span', {}, `Nivel ${e.sectores[clave]} de 10`)),
      medidor(e.sectores[clave] / 10),
      h('small', {}, s.texto),
      propio ? (inv
        ? h('small', { class: 'tenue' }, `Inversión en marcha: ${Math.ceil(inv.dias / 30)} meses`)
        : h('button', { type: 'button', class: 'mini', disabled: e.sectores[clave] >= 10, title: 'Sube un nivel en 2 años', onclick: () => { const err = invertir(pais, clave); if (err) mensaje(err, 'malo', pais); repintar(); } }, `Invertir ${plata(costo)}`)) : null);
  }))));
  const consumo = consumoRepuestos(pais);
  out.push(seccion('Depósito', tarjetas([
    tarjeta('Equipo', `${e.equipo} juegos`, `estatal: ${dec(capacidad(pais, 'equipo') * 30, 1)} por mes`),
    tarjeta('Repuestos', `${miles(e.repuestos)} lotes`, `alcanzan ${consumo > 0 ? miles(e.repuestos / consumo) : '∞'} días`),
  ])));
  const contratos = economia.contratos.filter((c) => c.pais === pais && c.estado !== 'terminado');
  out.push(seccion('Contratos',
    contratos.length ? h('ul', { class: 'contratos' }, ...contratos.map((c) => h('li', {},
      h('div', { class: 'sector-cabeza' }, h('b', {}, `${textoProducto(c)} × ${c.cantidad}`), h('span', {}, `${c.entregados} entregados`)),
      medidor(c.entregados / c.cantidad, c.estado === 'suspendido' ? 'mal' : ''),
      h('small', {}, `${RE().contratos[c.tipo].nombre}${c.tipo === 'extranjera' ? ` · ${nombreProveedor(c.proveedor)}` : ''} · ${plata(c.costoUnitario)} c/u${c.estado === 'suspendido' ? ` · SUSPENDIDO: ${c.motivo}` : ''}`),
      propio ? h('button', { type: 'button', class: 'mini', onclick: () => { cancelarContrato(c); repintar(); } }, 'Cancelar') : null)))
      : h('p', { class: 'nota' }, 'Sin contratos en curso.'),
    propio ? formularioContrato(pais) : null));
  return out;
}

function formularioContrato(pais) {
  const modelosVisibles = Object.entries(datos.aviones.modelos).filter(([, m]) => !m.diseno || m.pais_diseno === pais).map(([k]) => k);
  const opciones = [
    ['equipo', null, RE().productos.equipo.nombre],
    ['repuestos', null, RE().productos.repuestos.nombre],
    ...modelosVisibles.map((k) => ['avion', k, `Avión: ${modelo(k).nombre}${modelo(k).diseno ? ' (diseño propio)' : ` (${nombreProveedor(modelo(k).origen)})`}`]),
  ];
  const clave = (p, m) => `${p}|${m ?? ''}`;
  if (pedido.producto === 'avion' && !pedido.modelo) pedido.modelo = modelosVisibles[0];
  const extranjeros = pedido.producto === 'avion' ? [modelo(pedido.modelo)?.origen] : RE().productos[pedido.producto].origen_extranjero;
  if (pedido.producto !== 'avion' && !extranjeros.includes(pedido.proveedor)) pedido.proveedor = extranjeros[0];
  const q = cotizar(pais, pedido);
  const caja = h('div', { class: 'formulario' });
  const rehacer = () => caja.replaceWith(formularioContrato(pais));
  caja.append(
    h('h4', {}, 'Nuevo contrato'),
    h('label', {}, 'Producto', h('select', { onchange: (ev) => { const [p, m] = ev.target.value.split('|'); pedido.producto = p; pedido.modelo = m || null; rehacer(); } },
      ...opciones.map(([p, m, t]) => h('option', { value: clave(p, m), selected: clave(p, m) === clave(pedido.producto, pedido.modelo) }, t)))),
    h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Tipo de contrato' }, ...['estatal', 'extranjera'].map((t) => h('button', {
      type: 'button', 'aria-pressed': String(pedido.tipo === t), title: RE().contratos[t].texto, onclick: () => { pedido.tipo = t; rehacer(); },
    }, RE().contratos[t].nombre))),
    h('small', { class: 'tenue' }, RE().contratos[pedido.tipo].texto),
    pedido.tipo === 'extranjera' && pedido.producto !== 'avion'
      ? h('label', {}, 'Proveedor', h('select', { onchange: (ev) => { pedido.proveedor = ev.target.value; rehacer(); } },
        ...extranjeros.map((p) => h('option', { value: p, selected: p === pedido.proveedor }, `${nombreProveedor(p)}${embargo(p, pais) ? ' (embargo)' : ''}`))))
      : null,
    h('label', {}, 'Cantidad', h('input', { type: 'number', min: 1, max: 200, value: pedido.cantidad, onchange: (ev) => { pedido.cantidad = Math.max(1, Number(ev.target.value) || 1); rehacer(); } })),
    pedido.producto === 'avion' ? h('label', {}, 'Base de destino', h('select', { onchange: (ev) => { pedido.base = Number(ev.target.value); } },
      ...basesDe(pais).map((b) => h('option', { value: b.indice, selected: b.indice === pedido.base }, b.nombre)))) : null,
    q.error ? h('p', { class: 'malo' }, q.error) : h('p', { class: 'cotizacion' }, `${plata(q.costo)}${pedido.tipo === 'extranjera' ? ' en divisas' : ''} · unos ${q.dias} días`),
    h('button', { type: 'button', class: 'boton principal', disabled: !!q.error, onclick: () => {
      if (pedido.producto === 'avion' && pedido.base == null) pedido.base = basesDe(pais)[0]?.indice ?? null;
      const err = firmarContrato(pais, pedido);
      if (err) mensaje(err, 'malo', pais);
      repintar();
    } }, 'Firmar contrato'),
  );
  return caja;
}

// ------------------------------------------------------------------ Suministro

function pestanaSuministro(pais) {
  const propio = pais === jugador();
  const capital = capitalDe(pais);
  const deps = depositosDe(pais);
  const out = [];
  const conteo = { verde: 0, amarillo: 0, rojo: 0 };
  for (const b of ejercito.brigadas.filter((x) => x.pais === pais)) conteo[zona(suministroEn(pais, b.provincia))]++;
  out.push(tarjetas([
    tarjeta('Depósitos', `${deps.length} de ${datos.reglas.suministro.depositos_maximos}`, capital >= 0 ? `central: ${datos.provincias[capital].nombre}` : 'sin capital'),
    tarjeta('Bien abastecidas', String(conteo.verde), 'brigadas en zona verde'),
    tarjeta('Justas', String(conteo.amarillo), 'brigadas en zona amarilla'),
    tarjeta('Sin suministro', String(conteo.rojo), 'brigadas en zona roja'),
  ]));
  out.push(h('p', { class: 'nota' }, 'El suministro sale de la capital y llega a cada depósito por tus provincias (por tren rinde mucho más, por mar si controlás la zona). Cada depósito cubre un radio. Fuera de la zona verde, en guerra, las tropas se desgastan.'));
  out.push(h('ul', { class: 'lista-tropas' }, ...deps.map((d) => h('li', {},
    h('span', { class: 'simbolo' }, svgPictograma('deposito')),
    h('div', { class: 'tropa' }, h('div', { class: 'tropa-nombre' }, datos.provincias[d.provincia].nombre), h('div', { class: 'tropa-datos' }, describirDeposito(d))),
    propio ? h('button', { type: 'button', class: 'mini', onclick: () => { quitarDeposito(d.id); repintar(); } }, 'Quitar') : null))));
  if (propio) {
    out.push(h('div', { class: 'acciones fila' }, h('button', { type: 'button', class: 'boton', onclick: () => acc.fijarVista('suministro') }, 'Ver el mapa de suministro')));
    out.push(h('p', { class: 'nota' }, 'Para armar un depósito, tocá una provincia tuya con tren o puerto y usá el botón de su ficha.'));
  }
  return out;
}

// ------------------------------------------------------------------ Diplomacia

function filaRelacion(a, b) {
  const v = relacion(a, b);
  const ancho = Math.abs(v) / 2;
  const barra = h('span', { class: 'barra-rel' }, h('i', { style: `left:${v >= 0 ? 50 : 50 - ancho}%;width:${ancho}%;background:${v >= 0 ? 'var(--bien)' : 'var(--peligro)'}` }));
  return h('li', {}, chipPais(b, () => abrirPais(b, 'resumen')), barra, h('b', {}, `${v > 0 ? '+' : ''}${Math.round(v)}`));
}

function pestanaDiplomacia(pais) {
  const out = [];
  out.push(tarjetas([
    tarjeta('Tensión mundial', `${Math.round(diplomacia.tension)} %`, 'Con mucha tensión, otros median', medidor(diplomacia.tension / 100, diplomacia.tension > 60 ? 'mal' : '')),
    tarjeta('Voluntad nacional', `${Math.round(voluntad(pais))} %`, '', medidor(voluntad(pais) / 100, voluntad(pais) < 30 ? 'mal' : 'bien')),
  ]));
  const otros = [...new Set(datos.duenos)].filter((p) => p !== pais).sort((a, b) => relacion(pais, a) - relacion(pais, b));
  out.push(seccion('Relaciones', h('ul', { class: 'relaciones' }, ...otros.map((o) => filaRelacion(pais, o)))));
  const reclamos = reclamosDe(pais);
  if (reclamos.length) {
    out.push(seccion('Reclamos territoriales', h('ul', { class: 'lista-tropas' }, ...reclamos.map((r) => h('li', {},
      h('div', { class: 'tropa' }, h('div', { class: 'tropa-nombre' }, r.nombre), h('div', { class: 'tropa-datos' }, `${nombrePais(r.de)} se los reclama a ${nombrePais(r.a)}`)))))));
  }
  const just = diplomacia.justificaciones.filter((j) => j.de === pais || j.contra === pais);
  if (just.length) {
    out.push(seccion('Justificaciones de guerra', datosDl(just.map((j) => [`${nombrePais(j.de)} → ${nombrePais(j.contra)}`, j.lista ? 'Lista' : `Faltan ${Math.ceil(j.horas / 24)} días`]))));
  }
  if (pais !== jugador()) out.push(accionesDiplomaticas(pais));
  else out.push(h('p', { class: 'nota' }, 'Para fabricar una justificación, declarar la guerra o negociar la paz, abrí el país del otro (tocá su nombre).'));
  return out;
}

// ------------------------------------------------------------------ Decisiones (árbol nacional)

function pestanaDecisiones(pais) {
  const arbol = datos.arbol;
  if (!arbol || arbol.pais !== pais) return [h('p', { class: 'nota' }, 'Este país todavía no tiene árbol propio para el escenario.')];
  const out = [h('p', { class: 'nota' }, 'Una decisión por rama a la vez. Cada una tarda días y cambia la situación del país.')];
  for (const [rama, nombre] of Object.entries(arbol.ramas)) {
    const enCurso = diplomacia.arbol.enCurso[rama];
    out.push(seccion(nombre, h('div', { class: 'arbol' }, ...arbol.nodos.filter((n) => n.rama === rama).map((n) => {
      const estado = estadoNodo(n);
      const curso = enCurso?.id === n.id ? enCurso : null;
      return h('div', { class: `nodo ${estado}` },
        h('b', {}, n.nombre),
        h('small', {}, n.texto),
        curso ? h('div', {}, medidor(1 - curso.horas / curso.total), h('small', {}, `Faltan ${Math.ceil(curso.horas / 24)} días`)) : null,
        estado === 'disponible' ? h('button', { type: 'button', class: 'mini', disabled: !!enCurso, title: enCurso ? 'Ya hay una decisión en curso en esta rama' : '', onclick: () => { const e = empezarNodo(n.id); if (e) mensaje(e, 'malo', pais); repintar(); } }, `Empezar · ${n.dias} días`) : null,
        estado === 'hecho' ? h('small', { class: 'tenue' }, 'Hecho') : null,
        estado === 'bloqueado' ? h('small', { class: 'tenue' }, n.requiere?.length ? `Requiere: ${n.requiere.map((id) => arbol.nodos.find((x) => x.id === id)?.nombre).join(', ')}` : 'Cerrado por otra decisión') : null);
    }))));
  }
  return out;
}

// ------------------------------------------------------------------ Diseño (paso 8)

function pestanaDiseno(pais) {
  const out = [];
  out.push(h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Tipo de equipo' }, ...[['avion', 'Aviones'], ['tanque', 'Tanques']].map(([k, t]) => h('button', {
    type: 'button', 'aria-pressed': String(diseno.tipo === k), onclick: () => { diseno = { tipo: k, base: null, nombre: '', motor: 'original', agregados: {} }; repintar(); },
  }, t))));
  return diseno.tipo === 'avion' ? [...out, ...disenoAvion(pais)] : [...out, ...disenoTanque(pais)];
}

function disenoAvion(pais) {
  const r = datos.reglas.disenador.avion;
  const bases = Object.entries(datos.aviones.modelos).filter(([, m]) => !m.diseno).map(([k]) => k);
  diseno.base ??= escuadronesDe(pais)[0]?.modelo && !modelo(escuadronesDe(pais)[0].modelo).diseno ? escuadronesDe(pais)[0].modelo : bases[0];
  const base = datos.aviones.modelos[diseno.base];
  const { modelo: m, puntos, errores } = calcularAvion(diseno.base, diseno);
  const disponiblesPts = puntosDisponibles(pais, 'avion');
  const out = [];
  out.push(h('p', { class: 'nota' }, 'Se parte de un avión real y se le cambian motor, armas y equipos. Cada cambio cuesta puntos de diseño (salen de la aeronáutica y de decisiones). El diseño nuevo se encarga por contrato o se usa para reconvertir escuadrones.'));
  out.push(h('label', { class: 'campo' }, h('span', {}, 'Avión base'), h('select', { onchange: (ev) => { diseno.base = ev.target.value; diseno.agregados = {}; diseno.motor = 'original'; repintar(); } },
    ...bases.map((k) => h('option', { value: k, selected: k === diseno.base }, `${datos.aviones.modelos[k].nombre} (${nombreProveedor(datos.aviones.modelos[k].origen)})`)))));
  out.push(h('div', { class: 'ficha-cabeza', style: 'margin-top:10px' },
    h('div', { class: 'silueta-grande', style: `--pais:${datos.paises[pais].color}` }, svgSilueta(base.silueta)),
    h('div', { class: 'cabeza-texto' }, h('b', {}, `Puntos: ${puntos} de ${disponiblesPts}`), medidor(puntos / Math.max(1, disponiblesPts), puntos > disponiblesPts ? 'mal' : ''), etiquetasAvion({ ...m, aire: 0, ataque: 0 }))));
  out.push(seccion('Motor', h('div', { class: 'posturas' }, ...Object.entries(r.motor).map(([k, o]) => h('label', { class: 'postura' },
    h('input', { type: 'radio', name: 'motor', checked: (diseno.motor ?? 'original') === k, onchange: () => { diseno.motor = k; repintar(); } }),
    h('span', {}, h('b', {}, `${o.nombre}${o.puntos ? ` · ${o.puntos} pts` : ''}`), o.texto ? h('small', {}, o.texto) : null))))));
  out.push(seccion('Armas y equipos', h('div', { class: 'posturas' }, ...Object.entries(r.agregados).map(([k, o]) => {
    const yaTiene = (k === 'radar' && base.todo_tiempo) || base[k] === true;
    return h('label', { class: 'fila-check' },
      h('input', { type: 'checkbox', checked: yaTiene || !!diseno.agregados[k], disabled: yaTiene, onchange: (ev) => { diseno.agregados[k] = ev.target.checked; repintar(); } }),
      h('span', {}, h('b', {}, `${o.nombre}${yaTiene ? ' (ya lo trae)' : ` · ${o.puntos} pts`}`), o.texto ? h('small', {}, o.texto) : null));
  }))));
  const calc = { ...m, ...modeloCalculado(m) };
  out.push(seccion('Resultado', barrasAvion(calc), h('p', { class: 'cotizacion' }, `Costo por avión: ${plata(m.costo)} (base ${plata(base.costo)})`)));
  if (errores.length) out.push(h('p', { class: 'malo' }, errores[0]));
  out.push(h('div', { class: 'formulario' },
    h('label', {}, 'Nombre del diseño', h('input', { type: 'text', value: diseno.nombre, placeholder: `${base.nombre} modernizado`, oninput: (ev) => { diseno.nombre = ev.target.value; } })),
    h('button', { type: 'button', class: 'boton principal', disabled: puntos > disponiblesPts || errores.length > 0, onclick: () => {
      const err = crearDisenoAvion(pais, diseno.base, diseno.nombre || `${base.nombre} modernizado`, diseno);
      if (err) mensaje(err, 'malo', pais);
      else diseno = { tipo: 'avion', base: diseno.base, nombre: '', motor: 'original', agregados: {} };
      repintar();
    } }, 'Crear el diseño')));
  // Diseños propios y reconversión
  const propios = disenosDe(pais, 'avion');
  if (propios.length) {
    out.push(seccion('Tus diseños', h('ul', { class: 'lista-tropas' }, ...propios.map((d) => {
      const cand = escuadronesDe(pais).filter((e) => !e.ocupado && (e.modelo === d.base || modelo(e.modelo).base === d.base) && e.modelo !== d.clave);
      return h('li', {},
        h('span', { class: 'icono-avion', style: `--pais:${datos.paises[pais].color}` }, svgSilueta(modelo(d.clave).silueta)),
        h('div', { class: 'tropa' }, h('div', { class: 'tropa-nombre' }, d.nombre), h('div', { class: 'tropa-datos' }, `Sobre el ${datos.aviones.modelos[d.base].nombre} · ${plata(modelo(d.clave).costo)} c/u`),
          cand.length ? h('div', { class: 'fila-controles' }, ...cand.map((e) => h('button', { type: 'button', class: 'mini', title: `${plata(costoReconversion(e, d.clave))} · ${datos.reglas.disenador.dias_reconversion} días`, onclick: () => { const err = reconvertir(e, d.clave); if (err) mensaje(err, 'malo', pais); repintar(); } }, `Reconvertir ${e.nombre.split('·')[0].trim()}`))) : null));
    }))));
  }
  return out;
}

// Valores de juego (aire, ataque) de un avión todavía no guardado.
function modeloCalculado(m) {
  const f = datos.reglas.aviacion.formula;
  return {
    aire: (m.velocidad_kmh / f.velocidad_referencia) * f.aire_velocidad + m.maniobra * f.aire_maniobra
      + (m.canones ? f.aire_canones : 0) + (m.misiles_cortos ? f.aire_misiles_cortos : 0) + (m.misiles_largos ? f.aire_misiles_largos : 0),
    ataque: m.carga_kg / f.carga_referencia + (m.rol === 'ataque_ligero' ? f.bonus_ataque_ligero : 0),
  };
}

function disenoTanque(pais) {
  const r = datos.reglas.disenador.tanque;
  const bases = Object.entries(datos.tanques.modelos).filter(([, t]) => !t.diseno).map(([k]) => k);
  diseno.base ??= disenador.tanqueEnUso[pais] && !datos.tanques.modelos[disenador.tanqueEnUso[pais]].diseno ? disenador.tanqueEnUso[pais] : bases[0];
  const base = datos.tanques.modelos[diseno.base];
  const { tanque: t, puntos } = calcularTanque(diseno.base, diseno);
  const disponiblesPts = puntosDisponibles(pais, 'tanque');
  const out = [];
  out.push(h('p', { class: 'nota' }, `En producción: ${tanqueDe(pais).nombre}. Las brigadas blindadas y mecanizadas nuevas usan ese tanque. Los puntos salen de la metalmecánica.`));
  out.push(h('label', { class: 'campo' }, h('span', {}, 'Tanque base'), h('select', { onchange: (ev) => { diseno.base = ev.target.value; diseno.agregados = {}; repintar(); } },
    ...bases.map((k) => h('option', { value: k, selected: k === diseno.base }, `${datos.tanques.modelos[k].nombre} (${nombreProveedor(datos.tanques.modelos[k].origen)})`)))));
  out.push(h('div', { class: 'tarjetas tres' },
    tarjeta('Ataque', dec(t.ataque), `base ${dec(base.ataque)}`),
    tarjeta('Defensa', dec(t.defensa), `base ${dec(base.defensa)}`),
    tarjeta('Velocidad', `${t.velocidad_kmh} km/h`, `cañón ${t.canon_mm} mm`)));
  out.push(h('p', {}, h('b', {}, `Puntos: ${puntos} de ${disponiblesPts}`), ' ', medidor(puntos / Math.max(1, disponiblesPts), puntos > disponiblesPts ? 'mal' : '')));
  out.push(seccion('Cambios', h('div', { class: 'posturas' }, ...Object.entries(r.agregados).map(([k, o]) => h('label', { class: 'fila-check' },
    h('input', { type: 'checkbox', checked: !!diseno.agregados[k], onchange: (ev) => { diseno.agregados[k] = ev.target.checked; repintar(); } }),
    h('span', {}, h('b', {}, `${o.nombre} · ${o.puntos} pts`), h('small', {}, o.texto)))))));
  out.push(h('div', { class: 'formulario' },
    h('label', {}, 'Nombre del diseño', h('input', { type: 'text', value: diseno.nombre, placeholder: `${base.nombre} mejorado`, oninput: (ev) => { diseno.nombre = ev.target.value; } })),
    h('button', { type: 'button', class: 'boton principal', disabled: puntos > disponiblesPts || !puntos, onclick: () => {
      const err = crearDisenoTanque(pais, diseno.base, diseno.nombre || `${base.nombre} mejorado`, diseno);
      if (err) mensaje(err, 'malo', pais);
      else diseno = { tipo: 'tanque', base: diseno.base, nombre: '', agregados: {} };
      repintar();
    } }, 'Crear el diseño')));
  const usables = Object.entries(datos.tanques.modelos).filter(([, x]) => !x.diseno || x.fabricable_en?.includes(pais));
  out.push(seccion('Poner en producción', h('ul', { class: 'lista-tropas' }, ...usables.map(([k, x]) => h('li', {},
    h('span', { class: 'simbolo', style: `--pais:${datos.paises[pais].color}` }, svgPictograma('blindada')),
    h('div', { class: 'tropa' }, h('div', { class: 'tropa-nombre' }, x.nombre), h('div', { class: 'tropa-datos' }, `Ataque ${dec(x.ataque)} · defensa ${dec(x.defensa)} · ${x.velocidad_kmh} km/h`)),
    disenador.tanqueEnUso[pais] === k ? h('small', { class: 'tenue' }, 'En uso') : h('button', { type: 'button', class: 'mini', onclick: () => { fijarTanque(pais, k); repintar(); } }, 'Usar'))))));
  return out;
}

