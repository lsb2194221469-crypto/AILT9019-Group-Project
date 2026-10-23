"""Owner-only login supervisor: restart the public host and publish changed visitor URLs."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

import github_entry

ROOT = Path(__file__).resolve().parent
STATE = ROOT / '.public-maintainer.json'
DISABLED = ROOT / '.public-autostart-disabled'


def health():
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open('http://127.0.0.1:8765/api/health', timeout=4) as response:
            data = json.load(response)
        return data if data.get('app') == 'lecture-lab-local' else {'foreign_service': True}
    except (OSError, ValueError):
        return None


def save_state(**data):
    temporary = STATE.with_suffix('.tmp')
    temporary.write_text(json.dumps({'pid': os.getpid(), 'updated_at': time.time(), **data}, ensure_ascii=False), encoding='utf-8')
    temporary.replace(STATE)


def spawn_host():
    with (ROOT / '.public-host.log').open('ab') as output:
        return subprocess.Popen([sys.executable, '-u', str(ROOT / 'public_host.py'), '--no-browser'],
            cwd=ROOT, stdout=output, stderr=output,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true', help='One supervisor cycle, for startup verification')
    args = parser.parse_args(argv)
    if sys.platform != 'win32':
        raise ValueError('Automatic owner startup currently supports Windows only.')
    import msvcrt
    lock = (ROOT / '.public-maintainer.lock').open('a+b')
    lock.seek(0); lock.write(b'1'); lock.flush(); lock.seek(0)
    try:
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        lock.close()
        return 0
    try:
        github_entry.settings()  # An explicit host-only opt-in, never included in archives.
        child, published, last_publish, restart_after = None, None, 0, 0
        while not DISABLED.exists():
            now, active = time.monotonic(), health()
            if active and active.get('public_url'):
                url = active['public_url']
                if published != url or now - last_publish >= 300:
                    try:
                        result = github_entry.publish(url)
                        published, last_publish = url, now
                        save_state(status='online', publication=result['status'], url=url, commit=result['commit'])
                    except ValueError as error:
                        save_state(status='publish_failed', url=url, error=str(error))
                        # Retry temporary outages without creating duplicate commits.
                        time.sleep(15)
            elif active and child is not None and child.poll() is None:
                save_state(status='starting', host_pid=child.pid)
            elif active:
                save_state(status='blocked', error='Port 8765 is in use by a local-only or other service. Close it before public startup.')
            elif (child is None or child.poll() is not None) and now >= restart_after:
                child = spawn_host()
                restart_after = now + 30
                save_state(status='starting', host_pid=child.pid)
            if args.once:
                break
            time.sleep(5)
        return 0
    finally:
        lock.seek(0)
        msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
        lock.close()


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        # pythonw has no terminal; surface a useful state without raw exceptions/secrets.
        save_state(status='failed', error='Public supervisor failed. Check host configuration, GitHub login and local port.')
        sys.exit(1)
