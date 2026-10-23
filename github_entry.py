"""Publish only visitor links using this Windows user's existing Git credential helper."""
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
SETTINGS = ROOT / '.public-publish.json'
URL_PATTERN = re.compile(r'https://[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com')


def settings():
    try:
        value = json.loads(SETTINGS.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError):
        raise ValueError('Automatic GitHub publishing is not configured on this host.') from None
    if value.get('enabled') is not True or not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', value.get('repository', '')):
        raise ValueError('Invalid automatic publishing repository configuration.')
    if value.get('branch', 'main') != 'main':
        raise ValueError('Automatic publishing currently supports main only.')
    return value


def credential(config):
    # Capture the helper output only in memory. Disable any background login UI.
    try:
        result = subprocess.run([config.get('git', 'git'), 'credential', 'fill'],
            input='protocol=https\nhost=github.com\n\n', capture_output=True, text=True,
            timeout=30, env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'},
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    except (OSError, subprocess.TimeoutExpired):
        raise ValueError('GitHub credential helper is unavailable. Sign in to GitHub in Git Credential Manager.') from None
    fields = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    token = fields.get('password', '')
    if result.returncode or not token or any(char in token for char in '\r\n'):
        raise ValueError('GitHub login is missing or expired. Sign in again with Git Credential Manager.')
    return token


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class GitHub:
    def __init__(self, config):
        self.base = 'https://api.github.com/repos/' + config['repository']
        self.token = credential(config)
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, path, payload=None, method=None):
        request = urllib.request.Request(self.base + path,
            data=json.dumps(payload).encode() if payload is not None else None, method=method,
            headers={'Authorization': 'Bearer ' + self.token, 'Accept': 'application/vnd.github+json',
                     'Content-Type': 'application/json', 'User-Agent': 'Lecture-Lab-entry-sync'})
        try:
            with self.opener.open(request, timeout=25) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Never display a credential, raw request or provider error body.
            raise ValueError(f'GitHub entry update failed (HTTP {error.code}). Check repository write access and login.') from None
        except (OSError, ValueError):
            raise ValueError('GitHub entry update failed: network or response unavailable.') from None


def rewrite(path, text, url):
    if not URL_PATTERN.fullmatch(url):
        raise ValueError('Invalid public URL; refusing to publish.')
    if path == 'README.md':
        pattern = r'(<!-- PUBLIC_ENTRY_START -->)(.*?)(<!-- PUBLIC_ENTRY_END -->)'
        match = re.search(pattern, text, re.S)
        if not match:
            raise ValueError('README public entry markers are missing; refusing to replace other content.')
        block = URL_PATTERN.sub(url, match[2])
        if block == match[2] and url not in block:
            raise ValueError('README public link is missing.')
        return text[:match.start(2)] + block + text[match.end(2):]
    if path == '打开出题网页.md':
        updated, count = re.subn(r'(\[▶ 立即进入 Lecture Lab\]\()https://[a-z0-9-]+\.trycloudflare\.com(\))',
                                 lambda m: m[1] + url + m[2], text)
        if count != 1:
            raise ValueError('Visitor link marker is missing; refusing to replace other content.')
        return updated
    raise ValueError('Only the two visitor entry files may be automatically published.')


def publish(url, config=None, client=None):
    if not URL_PATTERN.fullmatch(url):
        raise ValueError('Invalid public URL; refusing to publish.')
    config = config or settings()
    client = client or GitHub(config)
    head = client.request('/git/ref/heads/main')['object']['sha']
    base = client.request('/git/commits/' + head)['tree']['sha']
    entries = []
    for path in ('README.md', '打开出题网页.md'):
        remote = client.request('/contents/' + urllib.parse.quote(path) + '?ref=' + head)
        text = base64.b64decode(remote['content']).decode('utf-8')
        updated = rewrite(path, text, url)
        if updated != text:
            blob = client.request('/git/blobs', {'content': updated, 'encoding': 'utf-8'})['sha']
            entries.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': blob})
    if not entries:
        return {'status': 'current', 'url': url, 'commit': head}
    tree = client.request('/git/trees', {'base_tree': base, 'tree': entries})['sha']
    commit = client.request('/git/commits', {'message': 'Refresh automatic public visitor URL',
                            'parents': [head], 'tree': tree})['sha']
    # A concurrent commit prevents this fast-forward, preserving all other work.
    client.request('/git/refs/heads/main', {'sha': commit, 'force': False}, method='PATCH')
    verified = client.request('/git/ref/heads/main')['object']['sha']
    if verified != commit:
        raise ValueError('GitHub head changed during verification; retry without overwriting other work.')
    return {'status': 'updated', 'url': url, 'commit': commit}
