#!/usr/bin/env python3
"""
Sirve el juego en http://localhost:8000 para probarlo sin publicarlo.

index.html está escrito como fragmento (así lo publica claude.ai, que le agrega
<!doctype>, <head> y <body>). Este servidor le agrega lo mismo al servirlo.

Uso: python3 tools/servidor_local.py [puerto]
"""
import http.server
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ENVOLTURA = ('<!doctype html><html lang="es"><head><meta charset="utf-8">'
             '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
             '<style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}'
             'body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style>'
             '</head><body>{}</body></html>')


class Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(RAIZ), **k)

    def do_GET(self):
        if self.path.split("?")[0] in ("/", "/index.html"):
            cuerpo = ENVOLTURA.replace("{}", (RAIZ / "index.html").read_text(encoding="utf-8")).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)
        else:
            super().do_GET()


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Juego en http://localhost:{puerto}")
    http.server.ThreadingHTTPServer(("127.0.0.1", puerto), Manejador).serve_forever()
