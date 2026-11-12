"""Restore the pre-redesign source; credentials and browser data stay intact."""
import argparse,hashlib,zipfile,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ARCHIVE=ROOT.parent/'backups/lecture-lab-before-minimal-2026-11-13.zip'
EXPECTED='4913728f87968d91315b358c0cdc23290c4d44cd2e1441754c67d14e64b81cf0'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply',action='store_true',help='Restore the baseline source. Stop the server first.')
args=parser.parse_args()
assert ARCHIVE.is_file(), 'Baseline archive is missing; see docs/MINIMAL_REDESIGN.md for GitHub rollback.'
assert hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()==EXPECTED, 'Backup hash mismatch'
with zipfile.ZipFile(ARCHIVE) as z:
    assert z.testzip() is None
    with tempfile.TemporaryDirectory(prefix='lecture-rollback-') as temporary:
        stage=Path(temporary)
        for item in z.infolist():
            target=(stage/item.filename).resolve()
            assert target.is_relative_to(stage.resolve())
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(z.read(item))
        assert all((stage/i.filename).read_bytes()==z.read(i) for i in z.infolist())
        if args.apply:
            for item in z.infolist():
                target=(ROOT/item.filename).resolve()
                assert target.is_relative_to(ROOT)
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes((stage/item.filename).read_bytes())
            for name in ['static/minimal.css','static/enhancements.js','tests/test_minimal_browser.cjs']:
                (ROOT/name).unlink(missing_ok=True)
print('Baseline source restored. Restart the app.' if args.apply else 'PASS: baseline hash, ZIP integrity, safe extraction and every restored byte verified. No live files changed.')
