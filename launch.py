"""Start the local app and open the browser after binding succeeds."""
import json
import argparse
import ipaddress
import socket
import sys
import threading
import urllib.request
import webbrowser
from http.server import ThreadingHTTPServer
from server import Handler

URL = 'http://127.0.0.1:8765'

def lan_addresses():
    addresses = set()
    try:
        addresses.update(item[4][0] for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET))
    except OSError:
        pass
    try:
        # Select the local default-route address without sending a packet.
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
            route.connect(('192.0.2.1', 80))
            addresses.add(route.getsockname()[0])
    except OSError:
        pass
    return sorted(address for address in addresses if ipaddress.ip_address(address).is_private
                  and not ipaddress.ip_address(address).is_loopback
                  and not ipaddress.ip_address(address).is_link_local)

class LocalServer(ThreadingHTTPServer):
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

def main(argv=None):
    parser = argparse.ArgumentParser(description='Lecture Lab local server')
    parser.add_argument('--share', action='store_true', help='Allow devices on the same LAN to use this computer API configuration')
    args = parser.parse_args(argv)
    addresses = lan_addresses() if args.share else []
    share_urls = ['http://' + address + ':8765' for address in addresses]
    try:
        app = LocalServer(('0.0.0.0' if args.share else '127.0.0.1', 8765), Handler)
        app.sharing = args.share
        app.share_urls = share_urls
        app.allowed_hosts = {'127.0.0.1:8765', 'localhost:8765'}
        if args.share:
            app.allowed_hosts.update(address + ':8765' for address in addresses)
            app.allowed_hosts.add(socket.gethostname().lower() + ':8765')
    except OSError:
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(URL + '/api/health', timeout=2) as response:
                health = json.load(response)
                is_ours = health.get('app') == 'lecture-lab-local'
        except Exception:
            is_ours = False
        if is_ours:
            if args.share and not health.get('sharing'):
                print('Local-only service is already running. Close its startup window, then run share.bat again.')
                return 1
            webbrowser.open(URL)
            print('Lecture Lab is already running. Browser opened.')
            for share_url in health.get('share_urls', []):
                print('Same-network link: ' + share_url)
            return 0
        print('Port 8765 is occupied by another application. Close it and retry.')
        return 1
    print('Lecture Lab: ' + URL, flush=True)
    if args.share:
        for share_url in share_urls:
            print('Same-network link: ' + share_url, flush=True)
        if not share_urls:
            print('No private IPv4 address found. Connect to Wi-Fi or Ethernet and try again.', flush=True)
        print('All generation requests use this computer API account. Share links only work while this computer and service stay on.', flush=True)
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
