// Panel de la flota elegida y diálogos (eventos, mediación, propuestas de paz,
// combate naval y menú de partida).

import { datos, nombrePais } from './datos.js';
import { $, h, filasDatos } from './dom.js';
import { publicar } from './noticias.js';
import { svgPictograma } from './simbolos.js';
import { flotaPorId, totalBarcos, fijarMisionFlota, poderFlota, capacidadTransporte, marina } from './marina.js';
import { elegirOpcionEvento, firmarPaz } from './diplomacia.js';
import { guardarEnRanura, cargarRanura, leerRanura, codigoPartida, cargarCodigo } from './partida.js';

let acc = {};
export function iniciarPanelMarina(acciones) { acc = acciones; }

// ------------------------------------------------------------------ flota elegida

export function mostrarFlota(id) {
  const panel = $('flota');
  const f = id != null ? flotaPorId(id) : null;
  if (!f) { panel.hidden = true; return; }
  const propio = f.pais === datos.escenario.pais_jugador;
  const misiones = datos.reglas.marina.misiones;
  const control = marina.control[f.zona];
  panel.replaceChildren(
    h('div', { class: 'ficha-cabeza' },
      h('div', { class: 'silueta-grande', style: `--pais:${datos.paises[f.pais]?.color}` }, svgPictograma('barco')),
      h('div', { class: 'cabeza-texto' },
        h('div', { class: 'rotulo' }, `Flota · ${datos.zonas[f.zona].nombre}`),
        h('h2', {}, f.nombre),
        h('div', { class: 'etiquetas' },
          h('span', { class: 'etiqueta' }, misiones[f.mision].nombre),
          f.viaje ? h('span', { class: 'etiqueta' }, `Navegando a ${datos.zonas[f.viaje.ruta.at(-1)].nombre}`) : null,
          control ? h('span', { class: 'etiqueta' }, `Zona controlada por ${nombrePais(control)}`) : null)),
      h('button', { type: 'button', class: 'cerrar', 'aria-label': 'Soltar flota', onclick: () => acc.soltarFlota() }, '×')),
    h('ul', { class: 'lista-tropas' }, ...Object.entries(f.barcos).filter(([, n]) => n > 0).map(([k, n]) => h('li', {},
      h('span', { class: 'simbolo', style: `--pais:${datos.paises[f.pais]?.color}` }, svgPictograma('barco')),
      h('div', { class: 'tropa' }, h('div', { class: 'tropa-nombre' }, `${n} × ${datos.barcos.clases[k].nombre}`),
        h('div', { class: 'tropa-datos' }, descripcionClase(k)))))),
    h('dl', { class: 'datos' }, ...filasDatos([
      ['Defensa antiaérea', poderFlota(f, 'antiaereo').toFixed(1)],
      ['Ataque a barcos', poderFlota(f, 'antibuque').toFixed(1)],
      ['Transporte', capacidadTransporte(f) ? `${capacidadTransporte(f)} brigada(s)` : 'No'],
    ])),
    propio ? h('div', { class: 'controles-escuadron' },
      h('label', { class: 'campo' }, h('span', {}, 'Misión'), h('select', { onchange: (ev) => { fijarMisionFlota(f, ev.target.value); mostrarFlota(id); acc.alCambiarPanel?.(); } },
        ...Object.entries(misiones).map(([k, m]) => h('option', { value: k, selected: f.mision === k }, m.nombre)))),
      h('small', { class: 'tenue' }, misiones[f.mision].texto),
      h('p', { class: 'nota' }, 'Clic derecho en el mar: navegar a esa zona. Para desembarcar, controlá la zona con transportes y atacá una provincia costera desde una tuya de la misma zona.'))
      : h('p', { class: 'nota' }, `Flota de ${nombrePais(f.pais)} · ${totalBarcos(f)} barcos.`),
  );
  panel.hidden = false;
}

function descripcionClase(k) {
  const c = datos.barcos.clases[k];
  const t = [];
  if (c.hangar) t.push(`${c.hangar} aviones a bordo`);
  if (c.sigilo) t.push('se esconde bajo el agua');
  if (c.capacidad) t.push('lleva tropas');
  if (c.artilleria >= 3) t.push('artillería pesada');
  if (c.antiaereo >= 2.5) t.push('misiles antiaéreos');
  if (c.antisubmarino >= 2) t.push('caza submarinos');
  return t.join(' · ') || `${c.nudos} nudos`;
}

// ------------------------------------------------------------------ diálogos

// Los diálogos importantes salen como noticia del diario (pausan el juego).
export function dialogo({ rotulo, titulo, bajada, parrafos = [], filas = [], botones = [], tono }) {
  publicar({ seccion: rotulo, titular: titulo, bajada, parrafos, filas, tono,
    botones: botones.map(([t, f, cl]) => [t, () => { f?.(); acc.alCambiarPanel?.(); }, cl]) });
}

export function mostrarEvento(ev) {
  dialogo({
    rotulo: 'Política',
    titulo: ev.titulo,
    parrafos: [ev.texto],
    botones: ev.opciones.map((o, k) => [o.texto, () => elegirOpcionEvento(ev, k), k === 0 ? 'principal' : '']),
  });
}

export function mostrarMediacion({ a, b }) {
  dialogo({
    rotulo: 'Diplomacia',
    titulo: 'El Vaticano y la ONU ofrecen mediar',
    bajada: 'Proponen un alto el fuego inmediato.',
    parrafos: [`Con la tensión mundial tan alta, los mediadores ofrecen un alto el fuego entre ${nombrePais(a)} y ${nombrePais(b)}. Cada uno se quedaría con lo que tiene.`],
    botones: [['Aceptar el alto el fuego', () => firmarPaz(a, b, 'alto_el_fuego'), 'principal'], ['Rechazar', null, '']],
  });
}

export function mostrarPropuestaPaz({ de, a, tipo }) {
  dialogo({
    rotulo: 'Diplomacia',
    titulo: `${nombrePais(de)} pide la paz`,
    bajada: tipo === 'cesion' ? 'Ofrece ceder las provincias ocupadas.' : 'Propone un alto el fuego.',
    parrafos: [tipo === 'cesion'
      ? `${nombrePais(de)} está quebrado y ofrece la paz cediéndote las provincias que ocupaste.`
      : `${nombrePais(de)} ofrece un alto el fuego: cada uno se queda con lo que tiene.`],
    botones: [['Aceptar', () => firmarPaz(de, a, tipo), 'principal'], ['Seguir la guerra', null, '']],
  });
}

export function mostrarCombateNaval(r) {
  dialogo({ rotulo: 'Guerra en el mar', titulo: `Combate naval en ${r.zona}`, parrafos: r.lineas, tono: 'malo' });
}

// ------------------------------------------------------------------ menú de partida

export function mostrarMenuPartida(camara) {
  const panel = $('menu-partida');
  const ranuras = [1, 2, 3].map((n) => {
    const r = leerRanura(n);
    return h('div', { class: 'ranura' },
      h('div', {}, h('b', {}, `Ranura ${n}`), h('small', {}, r ? `${r.fecha} · guardada el ${r.guardado}` : 'Vacía')),
      h('button', { type: 'button', class: 'mini', onclick: () => { const e = guardarEnRanura(n, camara); aviso(e ?? 'Partida guardada.'); mostrarMenuPartida(camara); } }, 'Guardar'),
      h('button', { type: 'button', class: 'mini', disabled: !r, onclick: () => { const e = cargarRanura(n, camara); aviso(e ?? 'Partida cargada.'); if (!e) acc.alCargar?.(); } }, 'Cargar'));
  });
  const area = h('textarea', { id: 'codigo-partida', placeholder: 'Pegá acá un código de partida para cargarla', 'aria-label': 'Código de partida' });
  const estado = h('p', { class: 'nota', id: 'partida-estado' });
  const aviso = (t) => { estado.textContent = t; };
  panel.replaceChildren(
    h('div', { class: 'ficha-cabeza' }, h('div', {}, h('div', { class: 'rotulo' }, 'Partida'), h('h2', {}, datos.escenario.nombre)),
      h('button', { type: 'button', class: 'cerrar', 'aria-label': 'Cerrar', onclick: () => { panel.hidden = true; } }, '×')),
    h('div', { class: 'ranuras' }, ...ranuras),
    h('section', {}, h('h3', {}, 'Código de partida'),
      h('p', { class: 'nota' }, 'Sirve para pasar la partida a otra compu: copiás el código y lo pegás allá.'),
      area,
      h('div', { class: 'acciones fila' },
        h('button', { type: 'button', class: 'boton', onclick: async () => {
          const c = await codigoPartida(camara);
          area.value = c;
          area.select();
          try { await navigator.clipboard.writeText(c); aviso('Código copiado.'); } catch { aviso('Código listo: seleccionalo y copialo.'); }
        } }, 'Copiar código'),
        h('button', { type: 'button', class: 'boton', onclick: async () => {
          try { await cargarCodigo(area.value, camara); aviso('Partida cargada.'); acc.alCargar?.(); } catch (e) { aviso(`No se pudo cargar: ${e.message}`); }
        } }, 'Cargar código'))),
    h('section', {}, h('div', { class: 'acciones fila' }, h('button', { type: 'button', class: 'boton peligro', onclick: () => location.reload() }, 'Nueva partida'))),
    estado,
  );
  panel.hidden = false;
}
