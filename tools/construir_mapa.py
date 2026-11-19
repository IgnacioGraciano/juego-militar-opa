#!/usr/bin/env python3
"""
Genera los datos del mapa del juego a partir de fuentes geográficas abiertas.

Fuentes (se descargan solas la primera vez y quedan en tools/.cache/):
  - Natural Earth 1:10m (dominio público): provincias, países, ciudades,
    puertos, ríos, lagos y regiones geográficas.
    https://github.com/nvkelso/natural-earth-vector
  - Relieve sombreado de Natural Earth (dominio público), tomado del paquete
    basemap-data de PyPI, que lo trae en 1/30 de grado por píxel.

Salida (no editar a mano: se pisa cada vez que se corre el script):
  data/mapa/geometria.json   contornos y fronteras de cada provincia
  data/mapa/provincias.json  nombre, país, área, vecinos de cada provincia
  data/mapa/ciudades.json, puertos.json, rios.json, lagos.json, regiones.json
  assets/mapa/relieve.jpg    imagen de relieve ya proyectada

Uso:
  pip install shapely numpy pillow
  python3 tools/construir_mapa.py

Proyección: Miller cilíndrica. x = lon * escala, y = -miller(lat) * escala,
con escala = unidades del mapa por grado (30 = 1 píxel del relieve).
El juego usa exactamente la misma fórmula (src/geo.js).
"""
from __future__ import annotations

import io
import json
import math
import os
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import (LineString, MultiLineString, MultiPolygon, Point,
                              Polygon, box, shape)
from shapely.ops import polylabel

from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

RAIZ = Path(__file__).resolve().parent.parent
CACHE = RAIZ / "tools" / ".cache"
SALIDA_DATOS = RAIZ / "data" / "mapa"
SALIDA_ASSETS = RAIZ / "assets" / "mapa"

NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{}.geojson"
FUENTE_NE = "Natural Earth 1:10m (naturalearthdata.com), dominio público"
FUENTE_RELIEVE = "Natural Earth Shaded Relief vía paquete basemap-data, dominio público"

CFG = json.loads((RAIZ / "tools" / "config_mapa.json").read_text(encoding="utf-8"))
K = float(CFG["escala"])
REG = CFG["region"]


# ---------------------------------------------------------------- proyección
def miller_y(lat):
    """Coordenada y de Miller en grados (acepta escalares o arrays)."""
    phi = np.radians(lat)
    return np.degrees(1.25 * np.log(np.tan(np.pi / 4 + 0.4 * phi)))


def miller_lat(y_deg):
    """Inversa: de y de Miller (grados) a latitud (grados)."""
    return np.degrees(2.5 * np.arctan(np.exp(0.8 * np.radians(y_deg))) - 0.625 * np.pi)


def proyectar_coords(xy: np.ndarray) -> np.ndarray:
    out = np.empty_like(xy, dtype=float)
    out[:, 0] = xy[:, 0] * K
    out[:, 1] = -miller_y(xy[:, 1]) * K
    return out


def proyectar(geom):
    return shapely.transform(geom, proyectar_coords)


def proyectar_punto(lon, lat):
    return float(lon * K), float(-miller_y(lat) * K)


X0 = REG["lon_min"] * K
X1 = REG["lon_max"] * K
Y0 = float(-miller_y(REG["lat_max"]) * K)
Y1 = float(-miller_y(REG["lat_min"]) * K)
CAJA_LONLAT = box(REG["lon_min"], REG["lat_min"], REG["lon_max"], REG["lat_max"])


# ---------------------------------------------------------------- descargas
def descargar(nombre: str) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    ruta = CACHE / f"{nombre}.geojson"
    if not ruta.exists():
        print(f"  descargando {nombre} ...")
        with urllib.request.urlopen(NE_URL.format(nombre)) as r:
            ruta.write_bytes(r.read())
    return json.loads(ruta.read_text(encoding="utf-8"))


def relieve_fuente() -> Path:
    """Devuelve la ruta a shadedrelief.jpg (10800x5400) de basemap-data."""
    destino = CACHE / "shadedrelief.jpg"
    if destino.exists():
        return destino
    CACHE.mkdir(parents=True, exist_ok=True)
    print("  descargando relieve (paquete basemap-data, ~30 MB) ...")
    subprocess.check_call([sys.executable, "-m", "pip", "download", "--no-deps",
                           "-d", str(CACHE), "basemap-data==2.0.0"])
    rueda = next(CACHE.glob("basemap_data-*.whl"))
    with zipfile.ZipFile(rueda) as z:
        destino.write_bytes(z.read("mpl_toolkits/basemap_data/shadedrelief.jpg"))
    return destino


# ---------------------------------------------------------------- utilidades
def poligonos(geom) -> list[Polygon]:
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    if hasattr(geom, "geoms"):
        out = []
        for g in geom.geoms:
            out.extend(poligonos(g))
        return out
    return []


def lineas(geom) -> list[LineString]:
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, LineString):
        return [geom]
    if isinstance(geom, MultiLineString):
        return list(geom.geoms)
    if hasattr(geom, "geoms"):
        out = []
        for g in geom.geoms:
            out.extend(lineas(g))
        return out
    return []


def plano(coords, dec=2) -> list[float]:
    out = []
    for x, y in coords:
        out.append(round(float(x), dec))
        out.append(round(float(y), dec))
    return out


def area_km2(geom_lonlat) -> float:
    """Área geodésica aproximada (esfera) de un polígono en lon/lat."""
    R = 6371.0088

    def anillo(coords):
        c = np.radians(np.asarray(coords)[:, :2])
        lon, lat = c[:, 0], c[:, 1]
        lon2, lat2 = np.roll(lon, -1), np.roll(lat, -1)
        return abs(np.sum((lon2 - lon) * (2 + np.sin(lat) + np.sin(lat2)))) * R * R / 2

    total = 0.0
    for p in poligonos(geom_lonlat):
        total += anillo(p.exterior.coords)
        for h in p.interiors:
            total -= anillo(h.coords)
    return total


def anillos(geom, dec=1) -> list[list[float]]:
    """Contornos de cada polígono (exterior y agujeros), como listas planas x,y,x,y...
    Se dibujan y se prueban con la regla par-impar, así los agujeros quedan vacíos."""
    out = []
    for p in poligonos(geom):
        out.append(plano(p.exterior.coords[:-1], dec))
        for h in p.interiors:
            out.append(plano(h.coords[:-1], dec))
    return out


def punto_etiqueta(geom):
    partes = poligonos(geom)
    if not partes:
        return geom.centroid
    mayor = max(partes, key=lambda p: p.area)
    try:
        return polylabel(mayor, tolerance=0.5)
    except Exception:
        return mayor.representative_point()


def escribir(nombre: str, datos) -> None:
    SALIDA_DATOS.mkdir(parents=True, exist_ok=True)
    ruta = SALIDA_DATOS / nombre
    texto = json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
    ruta.write_text(texto, encoding="utf-8")
    print(f"  {ruta.relative_to(RAIZ)}  ({len(texto) / 1e6:.2f} MB)")


# ---------------------------------------------------------------- provincias
def cargar_provincias():
    ne = descargar("ne_10m_admin_1_states_provinces")
    paises = CFG["paises"]
    extra = {(e["adm0_a3"], e["iso_3166_2"]): e["pais"] for e in CFG["provincias_extra"]}
    fusiones = CFG["fusiones_1978"]

    crudas = {}  # clave -> dict
    for f in ne["features"]:
        p = f["properties"]
        a3, iso = p["adm0_a3"], p["iso_3166_2"]
        if a3 in paises:
            pais = paises[a3]
        elif (a3, iso) in extra:
            pais = extra[(a3, iso)]
        else:
            continue
        geom = shape(f["geometry"])
        if not geom.intersects(CAJA_LONLAT):
            continue
        geom = shapely.make_valid(geom).intersection(CAJA_LONLAT)
        if geom.is_empty:
            continue
        clave_nombre = f"{a3}-{p['name']}"
        usa_nombre = clave_nombre in fusiones or clave_nombre in CFG["ids"]
        clave = clave_nombre if usa_nombre else iso
        if clave in crudas:
            raise SystemExit(f"Clave de provincia repetida: {clave}. Agregala a 'fusiones_1978' o 'ids'.")
        crudas[clave] = {"clave": clave, "pais": pais, "geom": geom, "props": p}

    # Fusiones históricas (1978)
    def destino(c):
        vistos = set()
        while c in fusiones and c not in vistos:
            vistos.add(c)
            c = fusiones[c]
        return c

    grupos: dict[str, list[str]] = {}
    for clave in crudas:
        d = destino(clave)
        if d not in crudas:
            raise SystemExit(f"La fusión de {clave} apunta a {d}, que no existe.")
        grupos.setdefault(d, []).append(clave)

    provincias = []
    for d, miembros in grupos.items():
        base = crudas[d]
        geom = shapely.union_all([crudas[m]["geom"] for m in miembros])
        p = base["props"]
        nombre = CFG["nombres"].get(d) or p.get("name") or p.get("name_es") or d
        provincias.append({
            "clave": d,
            "id": CFG["ids"].get(d, d),
            "nombre": nombre,
            "pais": base["pais"],
            "tipo": CFG.get("tipos", {}).get(d) or p.get("type_en") or "",
            "geom_lonlat": geom,
            "fusionadas": sorted(m for m in miembros if m != d),
        })
    provincias.sort(key=lambda q: (q["pais"], q["nombre"]))
    return provincias


def procesar_provincias(provincias):
    print("Provincias:", len(provincias))
    proyectadas = [shapely.make_valid(proyectar(q["geom_lonlat"])) for q in provincias]
    proyectadas = [shapely.union_all(poligonos(g)) for g in proyectadas]

    # Simplificación que respeta los bordes compartidos entre provincias
    simples = list(shapely.coverage_simplify(np.array(proyectadas, dtype=object),
                                             CFG["simplificacion"]))
    # Sacar islas minúsculas (salvo la parte más grande de cada provincia)
    limpias = []
    for g in simples:
        partes = poligonos(shapely.make_valid(g))
        if not partes:
            limpias.append(g)
            continue
        mayor = max(partes, key=lambda p: p.area)
        partes = [p for p in partes if p is mayor or p.area >= CFG["area_minima_isla"]]
        limpias.append(MultiPolygon(partes) if len(partes) > 1 else partes[0])

    # Tierra de países que no están en el mapa (para distinguir frontera de costa)
    adm0 = descargar("ne_10m_admin_0_countries")
    incluidos = set(CFG["paises"].keys()) | {e["adm0_a3"] for e in CFG["provincias_extra"]}
    ajenas = []
    for f in adm0["features"]:
        if f["properties"]["ADM0_A3"] in incluidos:
            continue
        g = shape(f["geometry"])
        if g.intersects(CAJA_LONLAT):
            ajenas.append(proyectar(shapely.make_valid(g).intersection(CAJA_LONLAT)))
    tierra_ajena = shapely.union_all(ajenas).buffer(1.0) if ajenas else Polygon()

    # Fronteras compartidas y costas
    arbol = shapely.STRtree(limpias)
    bordes = [g.boundary for g in limpias]
    fronteras = []
    vecinos = [set() for _ in limpias]
    compartidas = [[] for _ in limpias]
    for i, g in enumerate(limpias):
        for j in arbol.query(g, predicate="intersects"):
            j = int(j)
            if j <= i:
                continue
            inter = shapely.intersection(bordes[i], bordes[j])
            ls = lineas(shapely.line_merge(shapely.union_all(lineas(inter)))) if not inter.is_empty else []
            ls = [l for l in ls if l.length > 0.05]
            if not ls:
                continue
            vecinos[i].add(j)
            vecinos[j].add(i)
            for l in ls:
                compartidas[i].append(l)
                compartidas[j].append(l)
                fronteras.append({"a": i, "b": j, "p": plano(l.coords, 1)})
    costeras = [False] * len(limpias)
    for i in range(len(limpias)):
        resto = bordes[i]
        if compartidas[i]:
            resto = resto.difference(shapely.union_all(compartidas[i]).buffer(0.02))
        for l in lineas(shapely.line_merge(resto) if not resto.is_empty else resto):
            if l.length < 0.3:
                continue
            # tramos que tocan tierra de un país fuera del mapa: frontera, no costa
            ajeno = l.intersection(tierra_ajena)
            mar = l.difference(tierra_ajena)
            for t in lineas(ajeno):
                if t.length >= 0.3:
                    fronteras.append({"a": i, "b": -2, "p": plano(t.coords, 1)})
            for t in lineas(mar):
                if t.length >= 0.3:
                    fronteras.append({"a": i, "b": -1, "p": plano(t.coords, 1)})
                    if t.length >= 1.0:
                        costeras[i] = True

    geometria = []
    datos = []
    for i, (q, g) in enumerate(zip(provincias, limpias)):
        geometria.append({"id": q["id"], "anillos": anillos(g)})
        c = punto_etiqueta(g)
        datos.append({
            "id": q["id"],
            "nombre": q["nombre"],
            "pais": q["pais"],
            "tipo": q["tipo"],
            "area_km2": round(area_km2(q["geom_lonlat"])),
            "centro": [round(c.x, 1), round(c.y, 1)],
            "costera": costeras[i],
            "vecinos": sorted(provincias[j]["id"] for j in vecinos[i]),
            **({"incluye": q["fusionadas"]} if q["fusionadas"] else {}),
        })
    return limpias, geometria, fronteras, datos, tierra_ajena


# ---------------------------------------------------------------- terreno y ríos
def agregar_terreno_y_rios(provincias, datos_prov, fronteras, ciudades, rios):
    """Agrega a cada provincia: terreno, vecinos separados por un río y pasos por estrecho."""
    ct = CFG["terreno"]
    regiones = descargar("ne_10m_geography_regions_polys")
    montana, selva = [], []
    for f in regiones["features"]:
        n = f["properties"].get("NAME")
        if f["properties"].get("REGION") != "South America":
            continue
        if n in ct["regiones_montana"]:
            montana.append(shapely.make_valid(shape(f["geometry"])))
        elif n in ct["regiones_selva"]:
            selva.append(shapely.make_valid(shape(f["geometry"])))
    montana = shapely.union_all(montana)
    selva = shapely.union_all(selva)
    grandes = {}
    for c in ciudades["ciudades"]:
        if c["rango"] <= ct["ciudad_rango_maximo"]:
            grandes[c["provincia"]] = True
    manual = CFG.get("terreno_manual", {})
    for q, dp in zip(provincias, datos_prov):
        g = q["geom_lonlat"]
        area = g.area or 1.0
        f_mont = g.intersection(montana).area / area
        f_selva = g.intersection(selva).area / area
        if dp["id"] in manual or q["clave"] in manual:
            t = manual.get(dp["id"]) or manual.get(q["clave"])
        elif dp["area_km2"] <= ct["ciudad_area_maxima_km2"] and grandes.get(dp["id"]):
            t = "ciudad"
        elif f_mont >= ct["fraccion_montana"]:
            t = "montaña"
        elif f_selva >= ct["fraccion_selva"]:
            t = "selva"
        else:
            t = "llanura"
        dp["terreno"] = t

    # Fronteras que van por un río grande
    cr = CFG["rios_frontera"]
    lineas_rio = []
    for r in rios["rios"]:
        if r["rango"] <= cr["rango_maximo"]:
            pts = r["p"]
            lineas_rio.append(LineString(list(zip(pts[0::2], pts[1::2]))))
    zona_rio = shapely.union_all(lineas_rio).buffer(cr["distancia"])
    largo = {}
    sobre_rio = {}
    for f in fronteras:
        if f["b"] < 0:
            continue
        pts = f["p"]
        l = LineString(list(zip(pts[0::2], pts[1::2])))
        par = (min(f["a"], f["b"]), max(f["a"], f["b"]))
        largo[par] = largo.get(par, 0.0) + l.length
        sobre_rio[par] = sobre_rio.get(par, 0.0) + l.intersection(zona_rio).length
    for dp in datos_prov:
        dp["vecinos_rio"] = []
        dp["vecinos_estrecho"] = []
    for (a, b), L in largo.items():
        if L > 0 and sobre_rio[(a, b)] / L >= cr["fraccion"]:
            datos_prov[a]["vecinos_rio"].append(datos_prov[b]["id"])
            datos_prov[b]["vecinos_rio"].append(datos_prov[a]["id"])

    # Pasos por estrecho
    por_id = {dp["id"]: dp for dp in datos_prov}
    por_clave = {q["clave"]: dp for q, dp in zip(provincias, datos_prov)}
    for c in CFG.get("conexiones_extra", []):
        a = por_id.get(c["a"]) or por_clave.get(c["a"])
        b = por_id.get(c["b"]) or por_clave.get(c["b"])
        if a is None or b is None:
            raise SystemExit(f"Conexión con provincia desconocida: {c}")
        a["vecinos_estrecho"].append(b["id"])
        b["vecinos_estrecho"].append(a["id"])
    for dp in datos_prov:
        dp["vecinos_rio"].sort()
    cuenta = {}
    for dp in datos_prov:
        cuenta[dp["terreno"]] = cuenta.get(dp["terreno"], 0) + 1
    print("Terreno:", cuenta, "| fronteras de río:", sum(len(d["vecinos_rio"]) for d in datos_prov) // 2)


# ---------------------------------------------------------------- trenes
def procesar_trenes(geoms, datos_prov, fronteras, region_juego):
    """Vías de tren: líneas para dibujar, si cada provincia tiene tren y qué
    fronteras cruza una vía (para el suministro)."""
    ne = descargar("ne_10m_railroads")
    lineas_tren = []
    for f in ne["features"]:
        g = shape(f["geometry"])
        if not g.intersects(CAJA_LONLAT):
            continue
        g = proyectar(g.intersection(CAJA_LONLAT)).intersection(region_juego)
        lineas_tren.extend(l for l in lineas(g) if l.length > 0.3)
    red = shapely.union_all(lineas_tren) if lineas_tren else LineString()
    for i, g in enumerate(geoms):
        dentro = red.intersection(g).length if not red.is_empty else 0.0
        datos_prov[i]["tren"] = dentro >= 3.0
        datos_prov[i]["vecinos_tren"] = []
    zona = red.buffer(0.6) if not red.is_empty else Polygon()
    pares = set()
    for f in fronteras:
        if f["b"] < 0:
            continue
        pts = f["p"]
        l = LineString(list(zip(pts[0::2], pts[1::2])))
        if l.intersects(zona):
            pares.add((f["a"], f["b"]))
    for a, b in pares:
        if datos_prov[a]["tren"] and datos_prov[b]["tren"]:
            datos_prov[a]["vecinos_tren"].append(datos_prov[b]["id"])
            datos_prov[b]["vecinos_tren"].append(datos_prov[a]["id"])
    for d in datos_prov:
        d["vecinos_tren"] = sorted(set(d["vecinos_tren"]))
    salida = [plano(l.simplify(0.3).coords, 1) for l in lineas(shapely.line_merge(red))] if not red.is_empty else []
    print("Trenes:", sum(d["tren"] for d in datos_prov), "provincias con tren,", len(pares), "cruces")
    return {"fuente": FUENTE_NE + " (railroads). Red actual, no la de 1978.", "trenes": salida}


# ---------------------------------------------------------------- puntos
def provincia_de(punto, geoms, arbol, max_dist=4.0):
    cand = arbol.query(punto, predicate="intersects")
    if len(cand):
        return int(cand[0])
    j = arbol.nearest(punto)
    if j is not None and geoms[int(j)].distance(punto) <= max_dist:
        return int(j)
    return -1


def procesar_ciudades(geoms, arbol, datos_prov):
    ne = descargar("ne_10m_populated_places")
    out = []
    for f in ne["features"]:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"][:2]
        if not CAJA_LONLAT.contains(Point(lon, lat)):
            continue
        if p["SCALERANK"] > CFG["ciudades_rango_maximo"]:
            continue
        x, y = proyectar_punto(lon, lat)
        i = provincia_de(Point(x, y), geoms, arbol, 2.0)
        if i < 0:
            continue
        cla = p.get("FEATURECLA") or ""
        capital = "pais" if p.get("ADM0CAP") == 1 else ("provincia" if "Admin-1" in cla else "")
        pob_1980 = p.get("POP1980") or 0
        out.append({
            "nombre": p["NAME"],
            "provincia": datos_prov[i]["id"],
            "pos": [round(x, 2), round(y, 2)],
            "capital": capital,
            "rango": int(p["SCALERANK"]),
            "poblacion_actual": int(p.get("POP_MAX") or 0),
            **({"poblacion_1980": int(pob_1980)} if pob_1980 else {}),
        })
    out.sort(key=lambda c: (c["rango"], -c["poblacion_actual"]))
    print("Ciudades:", len(out))
    return {"fuente": FUENTE_NE + " (populated places). Población actual, no de 1978.",
            "ciudades": out}


def procesar_puertos(geoms, arbol, datos_prov):
    ne = descargar("ne_10m_ports")
    cand = []
    for e in CFG["puertos_extra"]:
        cand.append((e["nombre"], e["lon"], e["lat"], 3, "manual (a verificar)"))
    for f in ne["features"]:
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"][:2]
        if CAJA_LONLAT.contains(Point(lon, lat)):
            nombre = p["name"].split("/")[0].strip()
            cand.append((nombre, lon, lat, int(p.get("scalerank") or 9), "Natural Earth ports"))
    out = []
    for nombre, lon, lat, rango, fuente in cand:
        x, y = proyectar_punto(lon, lat)
        i = provincia_de(Point(x, y), geoms, arbol, 4.0)
        if i < 0:
            continue
        if any(math.dist((x, y), o["pos"]) < 4.0 for o in out):
            continue  # duplicado (ej. los cuatro puertos de Bahía Blanca)
        out.append({"nombre": nombre, "provincia": datos_prov[i]["id"],
                    "pos": [round(x, 2), round(y, 2)], "rango": rango, "fuente": fuente})
    print("Puertos:", len(out))
    return {"fuente": "Natural Earth ports + lista manual en tools/config_mapa.json", "puertos": out}


def procesar_rios(region_juego):
    ne = descargar("ne_10m_rivers_lake_centerlines")
    out = []
    for f in ne["features"]:
        p = f["properties"]
        if p.get("featurecla") not in ("River", "Lake Centerline"):
            continue
        if (p.get("scalerank") or 99) > CFG["rios_rango_maximo"]:
            continue
        g = shape(f["geometry"])
        if not g.intersects(CAJA_LONLAT):
            continue
        g = proyectar(g.intersection(CAJA_LONLAT)).intersection(region_juego)
        for l in lineas(g):
            l = l.simplify(0.15)
            if l.length < 1.0:
                continue
            out.append({"nombre": p.get("name") or "", "rango": int(p["scalerank"]),
                        "p": plano(l.coords, 1)})
    print("Ríos:", len(out))
    return {"fuente": FUENTE_NE + " (rivers + lake centerlines)", "rios": out}


def procesar_lagos(region_juego):
    ne = descargar("ne_10m_lakes")
    out = []
    for f in ne["features"]:
        p = f["properties"]
        if (p.get("scalerank") or 99) > CFG["lagos_rango_maximo"]:
            continue
        if p.get("featurecla") not in ("Lake", "Reservoir"):
            continue
        g = shape(f["geometry"])
        if not g.intersects(CAJA_LONLAT):
            continue
        g = shapely.make_valid(proyectar(g.intersection(CAJA_LONLAT)))
        if not g.intersects(region_juego):
            continue
        g = g.simplify(0.15)
        if g.area < 1.0:
            continue
        out.append({"nombre": p.get("name") or "", "rango": int(p["scalerank"]),
                    "anillos": anillos(g)})
    print("Lagos:", len(out))
    return {"fuente": FUENTE_NE + " (lakes)", "lagos": out}


def procesar_regiones():
    ne = descargar("ne_10m_geography_regions_polys")
    clases = {"Range/mtn": "montaña", "Plain": "llanura", "Plateau": "meseta",
              "Desert": "desierto", "Wetlands": "humedal", "Basin": "cuenca",
              "Geoarea": "región", "Foothills": "selva", "Valley": "valle"}
    out = []
    for f in ne["features"]:
        p = f["properties"]
        if p.get("REGION") != "South America" or p.get("FEATURECLA") not in clases:
            continue
        if p["SCALERANK"] > CFG["regiones_rango_maximo"]:
            continue
        g = shapely.make_valid(proyectar(shape(f["geometry"])))
        c = punto_etiqueta(g)
        x0, y0, x1, y1 = g.bounds
        nombre = " ".join(p["NAME"].split()).title().replace(" De ", " de ").replace(" Do ", " do ")
        out.append({"nombre": nombre, "clase": clases[p["FEATURECLA"]], "rango": int(p["SCALERANK"]),
                    "pos": [round(c.x, 1), round(c.y, 1)], "ancho": round(max(x1 - x0, y1 - y0), 1)})
    print("Regiones:", len(out))
    return {"fuente": FUENTE_NE + " (geography regions)", "regiones": out}


# ---------------------------------------------------------------- relieve
def construir_relieve(provincias_proj, tierra_ajena):
    fuente = Image.open(relieve_fuente()).convert("RGB")
    src = np.asarray(fuente, dtype=np.float32)  # 5400 x 10800 x 3, 30 px por grado
    res = src.shape[1] / 360.0

    ancho = int(round(X1 - X0))
    alto = int(math.ceil(Y1 - Y0))
    # columnas: lon lineal; filas: latitud por inversa de Miller
    xs = X0 + np.arange(ancho) + 0.5
    lon = xs / K
    col = np.clip((lon + 180.0) * res - 0.5, 0, src.shape[1] - 1)
    ys = Y0 + np.arange(alto) + 0.5
    lat = miller_lat(-ys / K)
    fila = np.clip((90.0 - lat) * res - 0.5, 0, src.shape[0] - 1)

    c0 = np.floor(col).astype(int)
    c1 = np.minimum(c0 + 1, src.shape[1] - 1)
    fc = (col - c0)[None, :, None]
    f0 = np.floor(fila).astype(int)
    f1 = np.minimum(f0 + 1, src.shape[0] - 1)
    ff = (fila - f0)[:, None, None]
    arriba = src[f0][:, c0] * (1 - fc) + src[f0][:, c1] * fc
    abajo = src[f1][:, c0] * (1 - fc) + src[f1][:, c1] * fc
    img = arriba * (1 - ff) + abajo * ff

    # Máscaras: tierra del juego y tierra ajena
    def mascara(geoms):
        m = Image.new("L", (ancho, alto), 0)
        d = ImageDraw.Draw(m)
        for g in geoms:
            for p in poligonos(g):
                d.polygon([(x - X0, y - Y0) for x, y in p.exterior.coords], fill=255)
                for h in p.interiors:
                    d.polygon([(x - X0, y - Y0) for x, y in h.coords], fill=0)
        return np.asarray(m, dtype=np.float32)[:, :, None] / 255.0

    # Se rasteriza la unión: así los enclaves (ej. Distrito Federal dentro de
    # Goiás) no quedan borrados por el agujero de la provincia que los rodea.
    m_juego = mascara([shapely.union_all(provincias_proj)])
    m_ajena = mascara([tierra_ajena.buffer(-1.0)]) * (1 - m_juego)
    tierra = np.clip(m_juego + m_ajena, 0, 1)

    # El relieve original tiene un halo claro en el mar junto a la costa. Donde la
    # máscara dice "tierra" pero el píxel es de ese halo (azulado), se usa el color
    # de la tierra vecina. Solo cerca de la costa, para no tocar glaciares.
    agua = (img[:, :, 2] > img[:, :, 0] + 12)[:, :, None] & (tierra > 0.5)
    cerca_costa = np.zeros_like(tierra, dtype=bool)
    mar = tierra < 0.5
    for dy in range(-5, 6):
        for dx in range(-5, 6):
            cerca_costa |= np.roll(np.roll(mar, dy, axis=0), dx, axis=1)
    malo = agua & cerca_costa
    for _ in range(8):
        if not malo.any():
            break
        bueno = (~malo) & (tierra > 0.5)
        suma = np.zeros_like(img)
        cuenta = np.zeros_like(tierra)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
            b_ = np.roll(np.roll(bueno, dy, axis=0), dx, axis=1)
            suma += np.roll(np.roll(img, dy, axis=0), dx, axis=1) * b_
            cuenta += b_
        arreglable = malo & (cuenta > 0)
        img = np.where(arreglable, suma / np.maximum(cuenta, 1), img)
        malo = malo & ~arreglable

    gris = img.mean(axis=2, keepdims=True)
    # Tierra del juego: un poco desaturada para que se lean los colores de país
    t_juego = gris + (img - gris) * 0.75
    # Tierra fuera del juego: gris oscuro
    t_ajena = gris * 0.55 + 20
    # Mar: tono azul pizarra, conservando las variaciones de profundidad del original
    prof = (img[:, :, 2:3] - 150.0) / 80.0
    mar = np.concatenate([38 + prof * 18, 58 + prof * 24, 78 + prof * 28], axis=2)

    out = mar * (1 - tierra) + t_juego * m_juego + t_ajena * m_ajena
    out = np.clip(out, 0, 255).astype(np.uint8)
    SALIDA_ASSETS.mkdir(parents=True, exist_ok=True)
    ruta = SALIDA_ASSETS / "relieve.jpg"
    Image.fromarray(out).save(ruta, quality=90, optimize=True)
    print(f"  {ruta.relative_to(RAIZ)}  {ancho}x{alto}")
    return ancho, alto


# ---------------------------------------------------------------- principal
def main():
    print("Cargando provincias ...")
    provincias = cargar_provincias()
    geoms, geometria, fronteras, datos_prov, tierra_ajena = procesar_provincias(provincias)
    arbol = shapely.STRtree(geoms)
    region_juego = shapely.union_all(geoms).buffer(2.0)

    ciudades = procesar_ciudades(geoms, arbol, datos_prov)
    puertos = procesar_puertos(geoms, arbol, datos_prov)
    rios = procesar_rios(region_juego)
    lagos = procesar_lagos(region_juego)
    regiones = procesar_regiones()
    agregar_terreno_y_rios(provincias, datos_prov, fronteras, ciudades, rios)
    trenes = procesar_trenes(geoms, datos_prov, fronteras, region_juego)

    print("Relieve ...")
    ancho, alto = construir_relieve(geoms, tierra_ajena)

    print("Escribiendo ...")
    proyeccion = {"tipo": "miller", "escala": K,
                  "limites": [round(X0, 2), round(Y0, 2), round(X1, 2), round(Y1, 2)],
                  "relieve": {"archivo": "assets/mapa/relieve.jpg", "ancho": ancho, "alto": alto,
                              "fuente": FUENTE_RELIEVE}}
    escribir("geometria.json", {
        "_aviso": "Generado por tools/construir_mapa.py. No editar a mano.",
        "fuente": FUENTE_NE + " (admin-1 states/provinces)",
        "proyeccion": proyeccion,
        "provincias": geometria,
        "_fronteras": "a, b = índices de provincia. b = -1: costa. b = -2: frontera con un país fuera del mapa.",
        "fronteras": fronteras,
    })
    escribir("provincias.json", {
        "_aviso": "Generado por tools/construir_mapa.py. Para cambios permanentes, editar el script o su config.",
        "fuente": FUENTE_NE + " (admin-1), con las provincias creadas después de 1978 fusionadas",
        "provincias": datos_prov,
    })
    escribir("ciudades.json", ciudades)
    escribir("puertos.json", puertos)
    escribir("rios.json", rios)
    escribir("lagos.json", lagos)
    escribir("regiones.json", regiones)
    escribir("trenes.json", trenes)
    print("Listo.")


if __name__ == "__main__":
    main()
