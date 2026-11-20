// Pestaña Ejército del panel de país: todo junto.
//   Fuerzas: tierra (cuerpos y brigadas), aire (aviones por modelo, y al abrirlos, dónde
//   está cada escuadrón) y mar (flotas).
//   Producir y comprar: un pedido en cuatro pasos (qué, modelo, cómo, cuánto).
//   Diseño: el diseñador de aviones y tanques.

import { datos } from './datos.js';
import { h, miles, dec, pct, plata, iconoUnidad, medidor } from './dom.js';
import { svgPictograma, svgSilueta } from './simbolos.js';
import { ejercito, tipos, leyDe, horasRestantes, relevarGeneral, mensaje, avisar } from './ejercito.js';
import {
  economia, economiaDe, capacidad, cotizar, firmarContrato, cancelarContrato, textoProducto,
  factorRepuestos, consumoRepuestos, nombreProveedor, embargo,
} from './economia.js';
import { aviacion, escuadronesDe, modelo, disponibles, basesDe, fijarMision, avionesDe, ROLES } from './aviacion.js';
import { barrasAvion, etiquetasAvion } from './panel_aereo.js';
import { suministroEn, zona } from './suministro.js';
import { marina, flotasDe, barcosDe, fijarMisionFlota } from './marina.js';
import {
  disenador, puntosDisponibles, calcularAvion, crearDisenoAvion, disenosDe, reconvertir, costoReconversion,
  calcularTanque, crearDisenoTanque, fijarTanque, tanqueDe, tanquesGuardados,
} from './disenador.js';

let acc = {};
let repintar = () => {};
const jugador = () => datos.escenario.pais_jugador;
const RE = () => datos.reglas.economia;

let vista = 'fuerzas'; // 'fuerzas' | 'pedidos' | 'diseno'
const abiertos = new Set(); // grupos desplegados ('cuerpo:3', 'modelo:mirage3')
const PEDIDO_NUEVO = () => ({ paso: 'que', producto: null, modelo: null, tipo: null, proveedor: null, cantidad: null, base: null, rol: 'todos', origen: 'todos' });
let pedido = PEDIDO_NUEVO();
let diseno = { tipo: 'avion', base: null, nombre: '', motor: 'original', agregados: {} };

export function configurarEjercito(acciones, repintarPestana) {
  acc = acciones;
  repintar = repintarPestana;
}

// Para abrir directamente una vista ('fuerzas', 'pedidos', 'diseno').
export function fijarVistaEjercito(v) {
  if (v) vista = v;
}

const seccion = (titulo, ...hijos) => h('section', {}, h('h3', {}, titulo), ...hijos);
const tarjeta = (rotulo, valor, sub = '', extra = null) => h('div', { class: 'tarjeta' }, h('span', { class: 'rotulo' }, rotulo), h('b', { title: typeof valor === 'string' ? valor : null }, valor), sub ? h('small', { title: sub }, sub) : null, extra);
const tarjetas = (lista, tres = false) => h('div', { class: `tarjetas${tres ? ' tres' : ''}` }, ...lista.filter(Boolean));
const color = (pais) => datos.paises[pais]?.color ?? '#3d6d93';
const err = (e) => { if (e) mensaje(e, 'malo', jugador(), 'aviso'); repintar(); acc.alCambiarPanel?.(); };

// Grupo desplegable que recuerda si estaba abierto entre repintadas.
function grupo(clave, resumen, ...contenido) {
  const d = h('details', { class: 'grupo', open: abiertos.has(clave) }, h('summary', {}, ...resumen), h('div', { class: 'grupo-cuerpo' }, ...contenido));
  d.addEventListener('toggle', () => { if (d.open) abiertos.add(clave); else abiertos.delete(clave); });
  return d;
}

export function pestanaEjercito(pais) {
  const propio = pais === jugador();
  const out = [];
  if (propio) {
    out.push(h('div', { class: 'segmentado ancho', role: 'tablist', 'aria-label': 'Ejército' }, ...[['fuerzas', 'Fuerzas'], ['pedidos', 'Producir y comprar'], ['diseno', 'Diseño']].map(([k, t]) => h('button', {
      type: 'button', role: 'tab', 'aria-pressed': String(vista === k), 'data-vista-ejercito': k, onclick: () => { vista = k; repintar(); },
    }, t))));
  }
  if (!propio || vista === 'fuerzas') out.push(...fuerzas(pais, propio));
  else if (vista === 'pedidos') out.push(...pedidos(pais));
  else out.push(...pestanaDiseno(pais));
  return out;
}

// ------------------------------------------------------------------ Fuerzas

function estadoBrigada(b) {
  if (b.formacion) return `En formación: ${Math.ceil(b.formacion.horas / 24)} d`;
  if (b.operacion) return 'En operación';
  if (b.mov) return `Marchando (${Math.ceil(horasRestantes(b) / 24)} d)`;
  const z = zona(suministroEn(b.pais, b.provincia));
  return z === 'rojo' ? 'Sin suministro' : z === 'amarillo' ? 'Suministro justo' : 'Lista';
}

function fuerzas(pais, propio) {
  const out = [];
  const e = economiaDe(pais);
  const ley = leyDe(pais);
  const leyes = datos.reglas.ejercito.reclutamiento;

  // Tierra
  const brigadas = ejercito.brigadas.filter((b) => b.pais === pais);
  const tierra = [tarjetas([
    tarjeta('Brigadas', String(brigadas.length), `${miles(brigadas.reduce((s, b) => s + b.efectivos, 0))} hombres`),
    tarjeta('Mano de obra', miles(ejercito.manoDeObra[pais] ?? 0), 'para reclutar y reponer'),
    e ? tarjeta('Equipo', `${e.equipo} juegos`, 'para brigadas nuevas') : null,
    tarjeta('Tanque', tanqueDe(pais).nombre, 'de las brigadas nuevas'),
  ])];
  if (propio) {
    tierra.push(h('label', { class: 'campo', style: 'margin-top:10px' }, h('span', {}, `Ley de reclutamiento · entrenamiento ${pct(ley.entrenamiento)}, ${ley.dias_formacion} días de formación`),
      h('select', { onchange: (ev) => { datos.escenario.reclutamiento[pais] = ev.target.value; avisar('cambio'); repintar(); } },
        ...['servicio_militar', 'voluntarios'].map((k) => h('option', { value: k, selected: k === ley.clave }, leyes[k].nombre)))));
  }
  const cuerpos = ejercito.cuerpos.filter((x) => x.pais === pais).map((c) => ({ c, lista: brigadas.filter((b) => b.cuerpo === c.id) })).filter((x) => x.lista.length);
  tierra.push(h('div', { class: 'grupos' }, ...cuerpos.map(({ c, lista }) => {
    const porTipo = Object.keys(tipos()).map((t) => [t, lista.filter((b) => b.tipo === t).length]).filter(([, n]) => n);
    const org = lista.reduce((s, b) => s + b.organizacion, 0) / lista.length;
    return grupo(`cuerpo:${c.id}`, [
      h('span', { class: 'grupo-titulo' }, h('b', {}, c.nombre), h('small', {}, `${c.general.nombre} `, h('span', { class: 'estrellas' }, '★'.repeat(c.general.experiencia)))),
      h('span', { class: 'grupo-iconos' }, ...porTipo.map(([t, n]) => h('span', { class: 'mini-tipo', title: tipos()[t].nombre }, iconoUnidad(t, pais), n > 1 ? h('i', {}, `×${n}`) : null))),
      h('span', { class: 'grupo-barra', title: `Organización ${pct(org)}` }, medidor(org, org < 0.4 ? 'mal' : 'bien')),
    ],
    propio ? h('div', { class: 'cuerpo' }, h('span', {}, `General: ${c.general.nombre}`), h('button', { type: 'button', class: 'mini', onclick: () => { relevarGeneral(c); repintar(); } }, 'Relevar')) : null,
    h('ul', { class: 'lista-tropas' }, ...lista.map((b) => h('li', { class: propio ? 'clicable' : '', onclick: propio ? () => acc.elegirYCentrar(b.id) : null },
      iconoUnidad(b.tipo, b.pais, tipos()[b.tipo].nombre),
      h('div', { class: 'tropa' },
        h('div', { class: 'tropa-nombre' }, b.nombre),
        h('div', { class: 'tropa-datos' }, `${miles(b.efectivos)} h · ${datos.provincias[b.provincia].nombre} · ${estadoBrigada(b)}`),
        h('div', { class: 'barra-org' }, h('i', { style: `width:${Math.round(b.organizacion * 100)}%` })))))));
  })));
  if (propio) tierra.push(h('p', { class: 'nota' }, 'Se recluta desde la ficha de una provincia propia. Tocá una brigada para elegirla en el mapa.'));
  out.push(seccion('Tierra', ...tierra));

  // Aire: por modelo
  const escuadrones = escuadronesDe(pais);
  const pil = aviacion.pilotos[pais] ?? { reserva: 0, prisioneros: 0 };
  const aire = [tarjetas([
    tarjeta('Aviones', String(avionesDe(pais)), `${escuadrones.length} escuadrones`),
    tarjeta('Pilotos', miles(pil.reserva), `en reserva${pil.prisioneros ? ` · ${pil.prisioneros} presos` : ''}`),
    e ? tarjeta('Repuestos', pct(Math.min(1, factorRepuestos(pais))), 'de disponibilidad') : null,
  ], true)];
  const porModelo = new Map();
  for (const x of escuadrones) { if (!porModelo.has(x.modelo)) porModelo.set(x.modelo, []); porModelo.get(x.modelo).push(x); }
  const ordenRol = Object.keys(ROLES);
  const modelos = [...porModelo].sort((a, b) => ordenRol.indexOf(modelo(a[0]).rol) - ordenRol.indexOf(modelo(b[0]).rol));
  aire.push(h('div', { class: 'grupos' }, ...modelos.map(([k, lista]) => {
    const m = modelo(k);
    const total = lista.reduce((s, x) => s + x.aviones, 0);
    return grupo(`modelo:${k}`, [
      h('span', { class: 'icono-avion', style: `--pais:${color(pais)}` }, svgSilueta(m.silueta, m.nombre)),
      h('span', { class: 'grupo-titulo' }, h('b', {}, m.nombre), h('small', {}, `${ROLES[m.rol]} · ${m.diseno ? 'diseño propio' : nombreProveedor(m.origen)}`)),
      h('span', { class: 'grupo-cifra' }, h('b', {}, String(total)), h('small', {}, lista.length === 1 ? '1 base' : `${new Set(lista.map((x) => x.base)).size} bases`)),
    ],
    etiquetasAvion(m),
    barrasAvion(m),
    h('div', { class: 'rotulo', style: 'margin-top:10px' }, 'Dónde están'),
    h('ul', { class: 'lista-tropas' }, ...lista.map((x) => h('li', {
      class: propio ? 'clicable' : '', onclick: propio ? () => acc.elegirEscuadron(x.id) : null,
      onmouseenter: () => acc.mostrarAlcance?.(x), onmouseleave: () => acc.mostrarAlcance?.(null),
    },
    h('div', { class: 'tropa' },
      h('div', { class: 'tropa-nombre' }, datos.bases[x.base].nombre),
      h('div', { class: 'tropa-datos' }, `${x.aviones} aviones · ${disponibles(x)} listos · pilotos ${pct(x.experiencia)}${x.ocupado ? ' · en misión' : ''}`)),
    propio ? h('select', { 'aria-label': `Misión de ${x.nombre}`, onclick: (ev) => ev.stopPropagation(), onchange: (ev) => { fijarMision(x, ev.target.value); repintar(); } },
      h('option', { value: 'alerta', selected: x.mision === 'alerta' }, 'Alerta'),
      h('option', { value: 'reposo', selected: x.mision === 'reposo' }, 'Reposo')) : null))));
  })));
  if (!escuadrones.length) aire.push(h('p', { class: 'nota' }, 'Sin aviones de combate.'));
  if (propio && escuadrones.length) aire.push(h('div', { class: 'acciones fila' }, h('button', { type: 'button', class: 'boton', onclick: () => acc.elegirBlancoAereo() }, 'Armar un paquete de ataque…')));
  out.push(seccion('Aire', ...aire));

  // Mar
  const flotas = flotasDe(pais);
  const controladas = Object.values(marina.control).filter((p) => p === pais).length;
  const mar = [tarjetas([
    tarjeta('Barcos', String(barcosDe(pais)), `${flotas.length} flotas`),
    tarjeta('Zonas', String(controladas), 'controladas'),
    tarjeta('Transporte', `${flotas.reduce((s, f) => s + (f.barcos.transporte ?? 0), 0)}`, 'buques, 1 brigada c/u'),
  ], true)];
  mar.push(h('ul', { class: 'lista-tropas' }, ...flotas.map((f) => h('li', { class: propio ? 'clicable' : '', onclick: propio ? () => acc.elegirFlota?.(f.id) : null },
    h('span', { class: 'simbolo', style: `--pais:${color(f.pais)}` }, svgPictograma('barco')),
    h('div', { class: 'tropa' },
      h('div', { class: 'tropa-nombre' }, f.nombre),
      h('div', { class: 'tropa-datos' }, `${datos.zonas[f.zona].nombre}${f.viaje ? ` → ${datos.zonas[f.viaje.ruta.at(-1)].nombre}` : ''}`),
      h('div', { class: 'tropa-datos' }, Object.entries(f.barcos).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${datos.barcos.clases[k].nombre.toLowerCase()}`).join(' · '))),
    propio ? h('select', { 'aria-label': `Misión de ${f.nombre}`, onclick: (ev) => ev.stopPropagation(), onchange: (ev) => { fijarMisionFlota(f, ev.target.value); repintar(); } },
      ...Object.entries(datos.reglas.marina.misiones).map(([k, m]) => h('option', { value: k, selected: f.mision === k }, m.nombre))) : null))));
  if (!flotas.length) mar.push(h('p', { class: 'nota' }, 'Sin flota de guerra.'));
  out.push(seccion('Mar', ...mar));
  out.push(h('p', { class: 'nota' }, 'Inventarios de 1978 aproximados, a verificar con The Military Balance.'));
  return out;
}

// ------------------------------------------------------------------ Producir y comprar

const CATEGORIAS = {
  equipo: { nombre: 'Equipo para brigadas', icono: () => svgPictograma('infanteria'), unidad: 'juegos', presets: [5, 10, 20, 40] },
  repuestos: { nombre: 'Repuestos', icono: () => svgPictograma('deposito'), unidad: 'lotes', presets: [50, 100, 250, 500] },
  avion: { nombre: 'Aviones', icono: () => svgSilueta('delta'), unidad: 'aviones', presets: [2, 4, 8, 12] },
  tanque: { nombre: 'Tanques', icono: () => svgPictograma('blindada'), unidad: 'compañías de 10', presets: [1, 3, 5, 10] },
};
const PASOS = [['que', 'Qué'], ['modelo', 'Modelo'], ['como', 'Cómo'], ['cuanto', 'Cuánto']];

const tieneModelo = () => pedido.producto === 'avion' || pedido.producto === 'tanque';
const datosModelo = (k = pedido.modelo) => (pedido.producto === 'avion' ? modelo(k) : datos.tanques.modelos[k]);
const origenDe = (k) => datosModelo(k)?.origen;
const fabricable = (pais, k) => (datosModelo(k)?.fabricable_en ?? []).includes(pais);

function pedidos(pais) {
  const e = economiaDe(pais);
  const out = [];
  out.push(tarjetas([
    tarjeta('Fondos militares', plata(e.fondosMilitares), 'pagan todo pedido'),
    tarjeta('Divisas', plata(e.divisas), 'además, para compras afuera'),
  ]));
  out.push(h('div', { class: 'pedido' }, migas(), pasoActual(pais)));
  const contratos = economia.contratos.filter((c) => c.pais === pais && c.estado !== 'terminado');
  out.push(seccion(`Pedidos en curso${contratos.length ? ` (${contratos.length})` : ''}`,
    contratos.length ? h('ul', { class: 'contratos' }, ...contratos.map((c) => h('li', { class: 'contrato' },
      h('div', { class: 'sector-cabeza' }, h('b', {}, `${textoProducto(c)} × ${c.cantidad}`),
        h('button', { type: 'button', class: 'quitar', title: 'Cancelar el pedido', 'aria-label': 'Cancelar el pedido', onclick: () => { cancelarContrato(c); repintar(); } }, '×')),
      medidor(c.entregados / c.cantidad, c.estado === 'suspendido' ? 'mal' : ''),
      h('small', {}, `${c.entregados} de ${c.cantidad} · ${c.tipo === 'extranjera' ? `compra a ${nombreProveedor(c.proveedor)}` : 'fabricación propia'}${c.estado === 'suspendido' ? ` · SUSPENDIDO: ${c.motivo}` : ''}`))))
      : h('p', { class: 'nota' }, 'No hay pedidos en curso.')));
  return out;
}

function migas() {
  const orden = PASOS.map(([k]) => k);
  const actual = orden.indexOf(pedido.paso);
  return h('ol', { class: 'pasos' }, ...PASOS.filter(([k]) => k !== 'modelo' || tieneModelo() || !pedido.producto).map(([k, t]) => {
    const i = orden.indexOf(k);
    const hecho = i < actual;
    return h('li', { class: i === actual ? 'actual' : hecho ? 'hecho' : '' },
      hecho ? h('button', { type: 'button', onclick: () => { pedido.paso = k; repintar(); } }, t) : h('span', {}, t));
  }));
}

function pasoActual(pais) {
  if (pedido.paso === 'que') return pasoQue(pais);
  if (pedido.paso === 'modelo') return pasoModelo(pais);
  if (pedido.paso === 'como') return pasoComo(pais);
  return pasoCuanto(pais);
}

function pasoQue(pais) {
  const e = economiaDe(pais);
  const consumo = consumoRepuestos(pais);
  const sub = {
    equipo: `Tenés ${e.equipo} juegos`,
    repuestos: `Alcanzan ${consumo > 0 ? miles(e.repuestos / consumo) : '∞'} días`,
    avion: `${avionesDe(pais)} en servicio`,
    tanque: `En uso: ${tanqueDe(pais).nombre}`,
  };
  return h('div', { class: 'categorias' }, ...Object.entries(CATEGORIAS).map(([k, c]) => h('button', {
    type: 'button', class: 'categoria', 'data-categoria': k,
    onclick: () => { pedido = { ...PEDIDO_NUEVO(), producto: k, paso: k === 'avion' || k === 'tanque' ? 'modelo' : 'como' }; repintar(); },
  }, h('span', { class: 'categoria-icono', style: `--pais:${color(pais)}` }, c.icono()), h('b', {}, c.nombre), h('small', {}, sub[k]))));
}

function pasoModelo(pais) {
  const avion = pedido.producto === 'avion';
  const catalogo = avion ? datos.aviones.modelos : datos.tanques.modelos;
  let claves = Object.keys(catalogo).filter((k) => !catalogo[k].diseno || catalogo[k].pais_diseno === pais || catalogo[k].fabricable_en?.includes(pais));
  const roles = avion ? ['todos', ...Object.keys(ROLES).filter((r) => claves.some((k) => modelo(k).rol === r))] : [];
  if (avion && pedido.rol !== 'todos') claves = claves.filter((k) => modelo(k).rol === pedido.rol);
  if (pedido.origen === 'propio') claves = claves.filter((k) => fabricable(pais, k));
  if (pedido.origen === 'afuera') claves = claves.filter((k) => !fabricable(pais, k));
  const chips = (lista, actual, poner) => h('div', { class: 'chips-filtro' }, ...lista.map(([k, t]) => h('button', {
    type: 'button', 'aria-pressed': String(actual === k), onclick: () => { poner(k); repintar(); },
  }, t)));
  const max = avion
    ? { aire: Math.max(...Object.keys(catalogo).map((k) => modelo(k).aire)), ataque: Math.max(...Object.keys(catalogo).map((k) => modelo(k).ataque)) }
    : { ataque: Math.max(...Object.values(catalogo).map((t) => t.ataque)), defensa: Math.max(...Object.values(catalogo).map((t) => t.defensa)) };
  return h('div', {},
    avion ? chips(roles.map((r) => [r, r === 'todos' ? 'Todos' : ROLES[r]]), pedido.rol, (k) => { pedido.rol = k; }) : null,
    chips([['todos', 'Todo origen'], ['propio', 'Se fabrica acá'], ['afuera', 'Se compra afuera']], pedido.origen, (k) => { pedido.origen = k; }),
    claves.length ? h('div', { class: 'modelos' }, ...claves.map((k) => {
      const m = avion ? modelo(k) : catalogo[k];
      const barras = avion
        ? [['Aire', m.aire / max.aire], ['Ataque', m.ataque / max.ataque]]
        : [['Ataque', m.ataque / max.ataque], ['Defensa', m.defensa / max.defensa]];
      return h('button', {
        type: 'button', class: `modelo-tarjeta${pedido.modelo === k ? ' elegido' : ''}`, 'data-modelo': k,
        onclick: () => { pedido.modelo = k; pedido.tipo = null; pedido.paso = 'como'; repintar(); },
      },
      h('span', { class: 'modelo-icono', style: `--pais:${color(pais)}` }, avion ? svgSilueta(m.silueta) : svgPictograma('blindada')),
      h('span', { class: 'modelo-texto' },
        h('b', {}, m.nombre),
        h('small', {}, `${avion ? `${ROLES[m.rol]} · ` : `${m.canon_mm} mm · ${m.velocidad_kmh} km/h · `}${m.diseno ? 'diseño propio' : nombreProveedor(m.origen)}`),
        h('span', { class: 'mini-barras dos' }, ...barras.map(([t, v]) => h('span', {}, t, medidor(v))))),
      h('span', { class: 'modelo-precio' }, plata(m.costo), h('small', {}, avion ? 'c/u' : 'compañía'), fabricable(pais, k) ? h('span', { class: 'etiqueta' }, 'Se fabrica acá') : null));
    })) : h('p', { class: 'nota' }, 'Ningún modelo con esos filtros.'));
}

function pasoComo(pais) {
  const p = pedido.producto;
  const c = CATEGORIAS[p];
  const cabeza = h('div', { class: 'pedido-cabeza' },
    h('span', { class: 'modelo-icono', style: `--pais:${color(pais)}` }, p === 'avion' ? svgSilueta(modelo(pedido.modelo).silueta) : p === 'tanque' ? svgPictograma('blindada') : c.icono()),
    h('div', {}, h('b', {}, tieneModelo() ? datosModelo().nombre : c.nombre), h('small', {}, tieneModelo() ? c.nombre : `por ${c.unidad.replace(/s$/, '')}`)));
  const opcion = (tipo, titulo, texto, error, extra = null) => h('div', { class: `opcion-como${error ? ' bloqueada' : ''}` },
    h('button', { type: 'button', class: 'opcion-boton', disabled: !!error, 'data-tipo': tipo, onclick: () => { pedido.tipo = tipo; pedido.paso = 'cuanto'; repintar(); } },
      h('b', {}, titulo), h('small', {}, texto), error ? h('small', { class: 'malo' }, error) : null),
    extra);
  // Fabricar
  const cap = capacidad(pais, p, pedido.modelo);
  const qe = cotizar(pais, { producto: p, modelo: pedido.modelo, tipo: 'estatal', cantidad: 1 });
  const fabricar = opcion('estatal', 'Fabricar en el país',
    cap > 0 ? `${plata(qe.costo)} por ${unidadSola(p)} · ${ritmo(cap, p)}` : RE().contratos.estatal.texto,
    cap > 0 ? null : (tieneModelo() ? 'Tu industria no fabrica este modelo.' : 'Tu industria no tiene capacidad.'));
  // Comprar afuera
  let comprar;
  if (tieneModelo()) {
    const prov = origenDe(pedido.modelo);
    const propio = prov === pais || datosModelo().diseno;
    const emb = propio ? null : embargo(prov, pais);
    const q = cotizar(pais, { producto: p, modelo: pedido.modelo, tipo: 'extranjera', cantidad: 1, proveedor: prov });
    comprar = opcion('extranjera', propio ? 'Comprar afuera' : `Comprar a ${nombreProveedor(prov)}`,
      `${plata(q.costo ?? 0)} por ${unidadSola(p)}, en divisas · llega en unos ${RE().contratos.extranjera.dias_entrega} días`,
      propio ? 'Es de fabricación propia.' : emb);
  } else {
    const lista = RE().productos[p].origen_extranjero;
    if (!pedido.proveedor || !lista.includes(pedido.proveedor)) pedido.proveedor = lista.find((x) => !embargo(x, pais)) ?? lista[0];
    const emb = embargo(pedido.proveedor, pais);
    const q = cotizar(pais, { producto: p, tipo: 'extranjera', cantidad: 1, proveedor: pedido.proveedor });
    comprar = opcion('extranjera', `Comprar a ${nombreProveedor(pedido.proveedor)}`,
      `${plata(q.costo ?? 0)} por ${unidadSola(p)}, en divisas · más caro pero rápido`, emb,
      h('div', { class: 'chips-filtro' }, ...lista.map((x) => h('button', {
        type: 'button', 'aria-pressed': String(pedido.proveedor === x), title: embargo(x, pais) ?? '', class: embargo(x, pais) ? 'con-embargo' : '',
        onclick: () => { pedido.proveedor = x; repintar(); },
      }, nombreProveedor(x)))));
  }
  return h('div', {}, cabeza, h('div', { class: 'opciones-como' }, fabricar, comprar));
}

const unidadSola = (p) => ({ equipo: 'juego', repuestos: 'lote', avion: 'avión', tanque: 'compañía' }[p]);
function ritmo(porDia, p) {
  const mes = porDia * 30;
  return mes >= 1 ? `unos ${dec(mes, mes < 10 ? 1 : 0)} ${CATEGORIAS[p].unidad.split(' ')[0]} por mes` : `uno cada ${Math.round(1 / porDia)} días`;
}

function pasoCuanto(pais) {
  const p = pedido.producto;
  const c = CATEGORIAS[p];
  pedido.cantidad ??= c.presets[1];
  if (p === 'avion' && pedido.base == null) pedido.base = basesDe(pais)[0]?.indice ?? null;
  const q = cotizar(pais, pedido);
  const e = economiaDe(pais);
  const cambiar = (n) => { pedido.cantidad = Math.max(1, Math.min(999, n)); repintar(); };
  const titulo = tieneModelo() ? datosModelo().nombre : c.nombre;
  const extranjera = pedido.tipo === 'extranjera';
  const faltan = !q.error && (q.costo > e.fondosMilitares || (extranjera && q.costo > e.divisas));
  return h('div', {},
    h('div', { class: 'pedido-cabeza' },
      h('span', { class: 'modelo-icono', style: `--pais:${color(pais)}` }, p === 'avion' ? svgSilueta(modelo(pedido.modelo).silueta) : p === 'tanque' ? svgPictograma('blindada') : c.icono()),
      h('div', {}, h('b', {}, titulo), h('small', {}, extranjera ? `Compra a ${nombreProveedor(q.proveedor ?? pedido.proveedor)}` : 'Fabricación propia'))),
    h('div', { class: 'cantidad' },
      h('button', { type: 'button', class: 'reloj-boton', 'aria-label': 'Menos', onclick: () => cambiar(pedido.cantidad - 1) }, '−'),
      h('div', { class: 'cantidad-valor' }, h('b', {}, String(pedido.cantidad)), h('small', {}, c.unidad)),
      h('button', { type: 'button', class: 'reloj-boton', 'aria-label': 'Más', onclick: () => cambiar(pedido.cantidad + 1) }, '+')),
    h('div', { class: 'chips-filtro centrado' }, ...c.presets.map((n) => h('button', { type: 'button', 'aria-pressed': String(pedido.cantidad === n), onclick: () => cambiar(n) }, String(n)))),
    p === 'avion' ? h('label', { class: 'campo' }, h('span', {}, 'Base de destino'), h('select', { onchange: (ev) => { pedido.base = Number(ev.target.value); } },
      ...basesDe(pais).map((b) => h('option', { value: b.indice, selected: b.indice === pedido.base }, b.nombre)))) : null,
    q.error ? h('p', { class: 'malo' }, q.error) : tarjetas([
      tarjeta('Costo', plata(q.costo), extranjera ? 'en fondos y en divisas' : 'en fondos militares'),
      tarjeta('Llega en', `${q.dias} días`, extranjera ? 'en una sola entrega' : 'se entrega de a poco'),
    ]),
    faltan ? h('p', { class: 'nota' }, 'No alcanza la plata para pagarlo todo ahora: se va pagando a medida que se entrega, y si falta, se demora.') : null,
    h('div', { class: 'acciones fila' },
      h('button', { type: 'button', class: 'boton principal', disabled: !!q.error, onclick: () => {
        const error = firmarContrato(pais, pedido);
        if (error) { err(error); return; }
        mensaje(`Pedido firmado: ${titulo} × ${pedido.cantidad}.`, 'bueno', pais, 'aviso');
        pedido = PEDIDO_NUEVO();
        repintar();
      } }, 'Firmar el pedido'),
      h('button', { type: 'button', class: 'boton', onclick: () => { pedido = PEDIDO_NUEVO(); repintar(); } }, 'Empezar de nuevo')));
}

// ------------------------------------------------------------------ Diseño

function pestanaDiseno(pais) {
  const out = [];
  out.push(h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Tipo de equipo', style: 'margin-top:10px' }, ...[['avion', 'Aviones'], ['tanque', 'Tanques']].map(([k, t]) => h('button', {
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
  out.push(h('p', { class: 'nota' }, 'Se parte de un avión real y se le cambian motor, armas y equipos. Cada cambio cuesta puntos de diseño (salen de la aeronáutica y de decisiones). El diseño nuevo se encarga en "Producir y comprar" o se usa para reconvertir escuadrones.'));
  out.push(h('label', { class: 'campo' }, h('span', {}, 'Avión base'), h('select', { onchange: (ev) => { diseno.base = ev.target.value; diseno.agregados = {}; diseno.motor = 'original'; repintar(); } },
    ...bases.map((k) => h('option', { value: k, selected: k === diseno.base }, `${datos.aviones.modelos[k].nombre} (${nombreProveedor(datos.aviones.modelos[k].origen)})`)))));
  out.push(h('div', { class: 'ficha-cabeza', style: 'margin-top:10px' },
    h('div', { class: 'silueta-grande', style: `--pais:${color(pais)}` }, svgSilueta(base.silueta)),
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
      const error = crearDisenoAvion(pais, diseno.base, diseno.nombre || `${base.nombre} modernizado`, diseno);
      if (error) err(error);
      else { diseno = { tipo: 'avion', base: diseno.base, nombre: '', motor: 'original', agregados: {} }; repintar(); }
    } }, 'Crear el diseño')));
  const propios = disenosDe(pais, 'avion');
  if (propios.length) {
    out.push(seccion('Tus diseños', h('ul', { class: 'lista-tropas' }, ...propios.map((d) => {
      const cand = escuadronesDe(pais).filter((e) => !e.ocupado && (e.modelo === d.base || modelo(e.modelo).base === d.base) && e.modelo !== d.clave);
      return h('li', {},
        h('span', { class: 'icono-avion', style: `--pais:${color(pais)}` }, svgSilueta(modelo(d.clave).silueta)),
        h('div', { class: 'tropa' }, h('div', { class: 'tropa-nombre' }, d.nombre), h('div', { class: 'tropa-datos' }, `Sobre el ${datos.aviones.modelos[d.base].nombre} · ${plata(modelo(d.clave).costo)} c/u`),
          cand.length ? h('div', { class: 'fila-controles' }, ...cand.map((e) => h('button', { type: 'button', class: 'mini', title: `${plata(costoReconversion(e, d.clave))} · ${datos.reglas.disenador.dias_reconversion} días`, onclick: () => err(reconvertir(e, d.clave)) }, `Reconvertir el de ${datos.bases[e.base].nombre}`))) : null));
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
  out.push(h('p', { class: 'nota' }, `En uso: ${tanqueDe(pais).nombre}. Las brigadas blindadas y mecanizadas nuevas usan ese tanque. Los puntos salen de la metalmecánica.`));
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
      const error = crearDisenoTanque(pais, diseno.base, diseno.nombre || `${base.nombre} mejorado`, diseno);
      if (error) err(error);
      else { diseno = { tipo: 'tanque', base: diseno.base, nombre: '', agregados: {} }; repintar(); }
    } }, 'Crear el diseño')));
  const guardados = Object.entries(tanquesGuardados(pais)).filter(([, n]) => n > 0);
  const usables = Object.entries(datos.tanques.modelos).filter(([, x]) => !x.diseno || x.fabricable_en?.includes(pais));
  out.push(seccion('Tanque de las brigadas nuevas', h('ul', { class: 'lista-tropas' }, ...usables.map(([k, x]) => h('li', {},
    h('span', { class: 'simbolo', style: `--pais:${color(pais)}` }, svgPictograma('blindada')),
    h('div', { class: 'tropa' }, h('div', { class: 'tropa-nombre' }, x.nombre), h('div', { class: 'tropa-datos' }, `Ataque ${dec(x.ataque)} · defensa ${dec(x.defensa)} · ${x.velocidad_kmh} km/h`)),
    disenador.tanqueEnUso[pais] === k ? h('small', { class: 'tenue' }, 'En uso') : h('button', { type: 'button', class: 'mini', onclick: () => { fijarTanque(pais, k); repintar(); } }, 'Usar'))))),
  guardados.length ? h('p', { class: 'nota' }, `Guardados sin asignar: ${guardados.map(([k, n]) => `${n} compañía(s) de ${datos.tanques.modelos[k].nombre}`).join(', ')}.`) : null);
  return out;
}

