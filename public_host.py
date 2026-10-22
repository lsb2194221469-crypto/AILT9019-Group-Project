"""Expose the owner's local app through a verified, temporary HTTPS tunnel."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

from launch import LocalServer
from server import Handler, read_config

ROOT = Path(__file__).resolve().parent
STATE = ROOT / '.public-session.json'
LOCAL = 'http://127.0.0.1:8765'
VERSION = '2026.10.1'
TUNNEL_SHA256 = '4d2490e74082c5d48dbfedaf92576fa5bd1702379ab88eb7faa0cfbe8dc891b6'
DOWNLOAD = f'https://github.com/cloudflare/cloudflared/releases/download/{VERSION}/cloudflared-windows-amd64.exe'
URL_PATTERN = re.compile(r'https://[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com')


def local_request(path, data=None, headers=None):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    request = urllib.request.Request(LOCAL + path, data=data, headers=headers or {})
    with opener.open(request, timeout=4) as response:
        return json.load(response)


def ensure_tunnel():
    if sys.platform != 'win32':
        raise ValueError('This launcher currently supports Windows x64. Use a platform-specific cloudflared build elsewhere.')
    binary = ROOT / 'runtime/cloudflared.exe'
    binary.parent.mkdir(parents=True, exist_ok=True)
    if not binary.exists():
        print('Downloading verified public-access helper (first start only)...', flush=True)
        temporary = binary.with_suffix('.download')
        try:
            with urllib.request.urlopen(DOWNLOAD, timeout=120) as response, temporary.open('wb') as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
            if hashlib.sha256(temporary.read_bytes()).hexdigest() != TUNNEL_SHA256:
                raise ValueError('Public-access helper checksum mismatch; refusing to execute it.')
            temporary.replace(binary)
        finally:
            temporary.unlink(missing_ok=True)
    if hashlib.sha256(binary.read_bytes()).hexdigest() != TUNNEL_SHA256:
        raise ValueError('Public-access helper checksum mismatch; refusing to execute it.')
    return binary


def activate(server, url, cloud_pid):
    if not URL_PATTERN.fullmatch(url):
        raise ValueError('Invalid public tunnel URL')
    server.public_origin = url
    server.allowed_hosts.add(urllib.parse.urlsplit(url).netloc)
    state = {'url': url, 'owner_pid': os.getpid(), 'tunnel_pid': cloud_pid,
             'stop_token': server.owner_stop_token, 'started_at': time.time()}
    temporary = STATE.with_suffix('.tmp')
    temporary.write_text(json.dumps(state), encoding='utf-8')
    temporary.replace(STATE)
    # This generated file contains only a public URL, never credentials.
    (ROOT / '打开出题网页.url').write_text('[InternetShortcut]\nURL=' + url + '\n', encoding='utf-8')
    refresh_entry(url)
    print('PUBLIC_URL=' + url, flush=True)
    print('Visitors can open this HTTPS link without installing software or entering an API key.', flush=True)
    print('Keep this computer and launcher running. Closing them stops public access.', flush=True)
    print('The public URL changes after restarting the tunnel; update the GitHub README entry then.', flush=True)


def refresh_entry(url):
    """Update local visitor links; publishing changes to GitHub remains an owner action."""
    if not URL_PATTERN.fullmatch(url):
        raise ValueError('Invalid public tunnel URL')
    block = ('<!-- PUBLIC_ENTRY_START -->\n'
             '## [▶ 打开出题网页](' + url + ')\n\n'
             '访客点击上方链接即可上传 PDF、生成练习。无需下载项目、安装 Python 或填写 API Key。\n\n'
             '出题使用项目主机的 API 额度。主机和外网服务须保持运行；临时地址重启后会变化。\n'
             '<!-- PUBLIC_ENTRY_END -->')
    readme = ROOT / 'README.md'
    try:
        if readme.exists():
            text = readme.read_text(encoding='utf-8')
            pattern = r'<!-- PUBLIC_ENTRY_START -->.*?<!-- PUBLIC_ENTRY_END -->'
            if re.search(pattern, text, re.S):
                text = re.sub(pattern, lambda _: block, text, flags=re.S)
            else:
                heading, separator, rest = text.partition('\n')
                text = heading + separator + '\n' + block + '\n' + rest
            readme.write_text(text, encoding='utf-8')
        (ROOT / '打开出题网页.md').write_text('# 打开出题网页\n\n[▶ 立即进入 Lecture Lab](' + url + ')\n\n'
            '打开后上传 PDF 即可生成练习。无需下载程序、安装 Python、配置 API Key。\n\n'
            '主机电脑和外网服务需保持运行。地址更新时以仓库首页入口为准。\n', encoding='utf-8')
    except OSError:
        print('Could not update local visitor links. Copy PUBLIC_URL to the GitHub README manually.', flush=True)


def stop():
    try:
        state = json.loads(STATE.read_text(encoding='utf-8'))
        local_request('/api/owner/shutdown', data=b'', headers={'X-Lecture-Owner': state['stop_token']})
        print('Public service is stopping.')
        return 0
    except (OSError, ValueError, KeyError):
        print('No active public service could be stopped.')
        return 1


def main(argv=None):
    parser = argparse.ArgumentParser(description='Run the owner API service behind a temporary public HTTPS URL')
    parser.add_argument('--stop', action='store_true')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args(argv)
    if args.stop:
        return stop()
    try:
        read_config()  # Validate in the owner process; never print or persist the key elsewhere.
        binary = ensure_tunnel()
        try:
            app = LocalServer(('127.0.0.1', 8765), Handler)
        except OSError:
            health = local_request('/api/health')
            if health.get('app') == 'lecture-lab-local' and health.get('public_url'):
                print('PUBLIC_URL=' + health['public_url'], flush=True)
                if not args.no_browser:
                    webbrowser.open(health['public_url'])
                return 0
            raise ValueError('Close the existing local startup window, then run public.bat again.')
    except (OSError, ValueError) as error:
        print(str(error), flush=True)
        return 1
    app.allowed_hosts = {'127.0.0.1:8765', 'localhost:8765'}
    app.public_origin = None
    app.owner_stop_token = secrets.token_urlsafe(32)
    app.stop_requested = threading.Event()
    worker = threading.Thread(target=app.serve_forever, daemon=True)
    worker.start()
    process = None
    try:
        process = subprocess.Popen([str(binary), 'tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', LOCAL],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace',
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        lines = queue.Queue()
        def collect():
            for line in process.stdout:
                lines.put(line)
        threading.Thread(target=collect, daemon=True).start()
        deadline = time.monotonic() + 90
        while not app.stop_requested.is_set():
            if process.poll() is not None:
                raise ValueError('Public tunnel stopped. Run public.bat again to reconnect.')
            try:
                line = lines.get(timeout=0.3)
            except queue.Empty:
                line = ''
            match = URL_PATTERN.search(line)
            if match and not app.public_origin:
                activate(app, match.group(), process.pid)
                if not args.no_browser:
                    webbrowser.open(LOCAL)
            if not app.public_origin and time.monotonic() > deadline:
                raise ValueError('Could not create a public link. Check the network and try again.')
        return 0
    except KeyboardInterrupt:
        return 0
    except (OSError, ValueError) as error:
        print(str(error), flush=True)
        return 1
    finally:
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        app.shutdown(); app.server_close(); worker.join()
        STATE.unlink(missing_ok=True)


if __name__ == '__main__':
    sys.exit(main())
