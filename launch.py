"""Start the local app and open the browser after binding succeeds."""
import json
import socket
import sys
import threading
import urllib.request
import webbrowser
from http.server import ThreadingHTTPServer
from server import Handler

URL = 'http://127.0.0.1:8765'

class LocalServer(ThreadingHTTPServer):
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

def main():
    try:
        app = LocalServer(('127.0.0.1', 8765), Handler)
    except OSError:
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(URL + '/api/health', timeout=2) as response:
                is_ours = json.load(response).get('app') == 'lecture-lab-local'
        except Exception:
            is_ours = False
        if is_ours:
            webbrowser.open(URL)
            print('Lecture Lab is already running. Browser opened.')
            return 0
        print('Port 8765 is occupied by another application. Close it and retry.')
        return 1
    print('Lecture Lab: ' + URL, flush=True)
    print('Keep this window open. Press Ctrl+C or close it to stop.', flush=True)
    threading.Timer(0.5, lambda: webbrowser.open(URL)).start()
    try:
        app.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        app.server_close()
    return 0

if __name__ == '__main__':
    sys.exit(main())
