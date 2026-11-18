#!/usr/bin/env python3
"""
Genera data/historico/poder_militar.json: militares, gasto militar, acero y
población de cada país, año por año.

Fuente: Correlates of War, National Material Capabilities v6 (1816-2016,
extendido hasta 2022 en el paquete peacesciencer). Se descarga de
https://github.com/svmiller/peacesciencer (archivo data/cow_nmc.rda).

Unidades (las de la fuente): militares y población en miles de personas, gasto
militar en miles de dólares corrientes, acero en miles de toneladas. Los años
sin dato (-9 en la fuente) se omiten.

Uso:
  pip install rdata
  python3 tools/construir_poder_militar.py
"""
import json
import urllib.request
from pathlib import Path

import rdata

RAIZ = Path(__file__).resolve().parent.parent
CACHE = RAIZ / "tools" / ".cache"
URL = "https://raw.githubusercontent.com/svmiller/peacesciencer/master/data/cow_nmc.rda"
SALIDA = RAIZ / "data" / "historico" / "poder_militar.json"

# Código de país de Correlates of War -> etiqueta del juego
CODIGOS = {100: "COL", 101: "VEN", 110: "GUY", 115: "SUR", 130: "ECU", 135: "PER", 140: "BRA",
           145: "BOL", 150: "PRY", 155: "CHL", 160: "ARG", 165: "URY", 200: "GBR", 220: "FRA"}
ANIO_DESDE = 1900


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    ruta = CACHE / "cow_nmc.rda"
    if not ruta.exists():
        print("descargando Correlates of War ...")
        ruta.write_bytes(urllib.request.urlopen(URL).read())
    df = list(rdata.conversion.convert(rdata.parser.parse_file(ruta)).values())[0]
    paises = {}
    for fila in df.itertuples():
        etiqueta = CODIGOS.get(int(fila.ccode))
        if etiqueta is None or fila.year < ANIO_DESDE:
            continue
        reg = {}
        for campo, nombre in (("milper", "militares"), ("milex", "gasto"), ("irst", "acero"), ("tpop", "poblacion")):
            v = getattr(fila, campo)
            if v is not None and v == v and v >= 0:
                reg[nombre] = round(float(v), 1)
        if reg:
            paises.setdefault(etiqueta, {})[str(int(fila.year))] = reg
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps({
        "_aviso": "Generado por tools/construir_poder_militar.py. No editar a mano.",
        "fuente": "Correlates of War, National Material Capabilities (v6, extendido a 2022 por peacesciencer)",
        "unidades": {"militares": "miles de personas", "gasto": "miles de dólares corrientes",
                     "acero": "miles de toneladas", "poblacion": "miles de personas"},
        "paises": paises,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{SALIDA.relative_to(RAIZ)}: {len(paises)} países, {SALIDA.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
