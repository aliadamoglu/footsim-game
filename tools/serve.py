#!/usr/bin/env python3
"""Geliştirme sunucusu: statik dosyalar + önbellek KAPALI (Cache-Control: no-store).
Tarayıcı eski js/css'i önbellekten kullanmasın diye (python -m http.server başlık göndermez, eski sürüm görünebilir)."""
import http.server, socketserver, sys, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)) + '/..')

class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, *a):  # sessiz
        pass

socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('0.0.0.0', PORT), H) as httpd:
    print('serving on', PORT, flush=True)
    httpd.serve_forever()
