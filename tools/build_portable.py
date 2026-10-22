"""Build a Windows x64 ZIP with a blank config; never read config.json."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PYTHON_VERSION = '3.13.16'
PYTHON_SHA256 = '97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297'
SOURCE_FILES = [
    'server.py', 'pdf_math.py', 'launch.py', 'public_host.py', 'start.bat', 'share.bat',
    'public.bat', 'stop_public.bat', 'configure.bat',
    'check_connection.py', 'check_connection.bat', 'config.example.json',
    'requirements.txt', 'sample.json', 'sample-notes.txt', 'README.md',
    '使用说明.txt', '打开出题网页.md', 'THIRD_PARTY.txt', 'VALIDATION.md', '.gitignore',
]


def download(url, expected_sha256=None):
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read()
    if expected_sha256 and hashlib.sha256(data).hexdigest() != expected_sha256:
        raise ValueError('SHA-256 mismatch: ' + url)
    return data


def unpack(data, destination):
    destination = destination.resolve()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for item in archive.infolist():
            if not (destination / item.filename).resolve().is_relative_to(destination):
                raise ValueError('Unsafe archive path')
        archive.extractall(destination)


def fetch_runtime(destination):
    name = f'python-{PYTHON_VERSION}-embed-amd64.zip'
    url = f'https://www.python.org/ftp/python/{PYTHON_VERSION}/{name}'
    print('Downloading verified Python runtime...', flush=True)
    unpack(download(url, PYTHON_SHA256), destination)
    (destination / 'python313._pth').write_text('python313.zip\n.\n..\nsite-packages\n', encoding='utf-8')
    for requirement in (ROOT / 'requirements.txt').read_text().splitlines():
        if not requirement.strip() or requirement.startswith('#'):
            continue
        package, version = requirement.strip().split('==')
        metadata = json.loads(download(f'https://pypi.org/pypi/{package}/{version}/json'))
        candidates = [entry for entry in metadata['urls'] if entry['filename'].endswith('.whl')
                      and (entry['filename'].endswith('-py3-none-any.whl')
                           or entry['filename'].endswith('-cp311-abi3-win_amd64.whl'))]
        if len(candidates) != 1:
            raise ValueError('Expected one compatible wheel for ' + requirement)
        wheel = candidates[0]
        print('Downloading verified ' + wheel['filename'], flush=True)
        unpack(download(wheel['url'], wheel['digests']['sha256']), destination / 'site-packages')


def build(output, runtime=None):
    template = (ROOT / 'config.example.json').read_bytes()
    if json.loads(template).get('api_key') != '':
        raise ValueError('The example configuration must have a blank API key')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='lecture-lab-build-', dir=output.parent) as temporary:
        if not Path(temporary).resolve().is_relative_to(output.parent.resolve()):
            raise ValueError('Build staging must remain inside the output directory')
        stage = Path(temporary) / 'Lecture-Lab'
        stage.mkdir()
        for filename in SOURCE_FILES:
            shutil.copy2(ROOT / filename, stage / filename)
        for directory in ('static', 'tests', 'docs', 'tools'):
            shutil.copytree(ROOT / directory, stage / directory,
                            ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        if runtime:
            if not (runtime / 'python.exe').is_file() or not (runtime / 'site-packages/pymupdf').is_dir():
                raise ValueError('Use a complete Windows runtime containing Python, pypdf and PyMuPDF')
            shutil.copytree(runtime, stage / 'runtime', ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        else:
            fetch_runtime(stage / 'runtime')
        (stage / 'config.json').write_bytes(template)
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in sorted(stage.rglob('*')):
                if path.is_file():
                    archive.write(path, path.relative_to(stage.parent).as_posix())
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None or json.loads(archive.read('Lecture-Lab/config.json'))['api_key'] != '':
            raise ValueError('Package verification failed')
    print(f'Created {output} ({output.stat().st_size / 1024 / 1024:.1f} MB), blank API key.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, help='Reuse an existing complete Windows runtime')
    parser.add_argument('--output', type=Path, default=ROOT / 'dist/Lecture-Lab-DeepSeek-Windows.zip')
    args = parser.parse_args()
    build(args.output.resolve(), args.runtime.resolve() if args.runtime else None)
