import base64
import json
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import github_entry
import maintain_public


class Client:
    def __init__(self, current=False, conflict=False):
        self.calls = []
        self.head, self.conflict = 'before', conflict
        url = 'https://fresh-demo.trycloudflare.com' if current else 'https://old-demo.trycloudflare.com'
        self.files = {'README.md': 'intro\n<!-- PUBLIC_ENTRY_START -->\n[open]('+url+')\n<!-- PUBLIC_ENTRY_END -->\nconcurrent unrelated edits',
                      '打开出题网页.md': '[▶ 立即进入 Lecture Lab]('+url+')\nother notes'}

    def request(self, path, payload=None, method=None):
        self.calls.append((path, payload, method))
        if path == '/git/ref/heads/main': return {'object': {'sha': self.head}}
        if path.startswith('/git/commits/') and payload is None: return {'tree': {'sha': 'tree-before'}}
        if path.startswith('/contents/'):
            from urllib.parse import unquote
            filename = unquote(path.split('/contents/')[1].split('?')[0])
            return {'content': base64.b64encode(self.files[filename].encode()).decode()}
        if path == '/git/blobs': return {'sha': 'blob-'+str(len(self.calls))}
        if path == '/git/trees': return {'sha': 'tree-new'}
        if path == '/git/commits': return {'sha': 'after'}
        if path == '/git/refs/heads/main':
            if self.conflict: raise ValueError('HTTP 422 concurrent change')
            self.head = payload['sha']; return {}
        raise AssertionError(path)


class PublicPublishTests(unittest.TestCase):
    url = 'https://fresh-demo.trycloudflare.com'

    def test_only_two_links_are_published_in_one_nonforced_commit(self):
        client = Client()
        result = github_entry.publish(self.url, {'repository': 'owner/repo'}, client)
        self.assertEqual(result['status'], 'updated')
        tree = next(payload for path, payload, _ in client.calls if path == '/git/trees')
        self.assertEqual({entry['path'] for entry in tree['tree']}, set(client.files))
        blobs = [p['content'] for path, p, _ in client.calls if path == '/git/blobs']
        self.assertIn('concurrent unrelated edits', blobs[0])
        self.assertIn(self.url, blobs[0])
        ref = next(p for path, p, _ in client.calls if path == '/git/refs/heads/main')
        self.assertFalse(ref['force'])

    def test_unchanged_links_do_not_make_commits(self):
        client = Client(current=True)
        self.assertEqual(github_entry.publish(self.url, {'repository': 'owner/repo'}, client)['status'], 'current')
        self.assertFalse(any(payload is not None for _, payload, _ in client.calls))

    def test_concurrent_change_is_not_overwritten(self):
        client = Client(conflict=True)
        with self.assertRaises(ValueError): github_entry.publish(self.url, {'repository': 'owner/repo'}, client)
        self.assertEqual(client.head, 'before')

    def test_missing_markers_and_untrusted_urls_refused(self):
        with self.assertRaises(ValueError): github_entry.rewrite('README.md', 'no marker', self.url)
        with self.assertRaises(ValueError): github_entry.rewrite('server.py', 'do not edit', self.url)
        for url in ('http://demo.trycloudflare.com', 'https://demo.trycloudflare.com.evil.example', self.url+'\nsecret'):
            with self.assertRaises(ValueError): github_entry.publish(url, {}, Client())

    def test_helper_is_noninteractive_and_does_not_echo_secret(self):
        fake = type('Result', (), {'returncode': 0, 'stdout': 'username=owner\npassword=fake-secret\n'})()
        with patch.object(github_entry.subprocess, 'run', return_value=fake) as run:
            self.assertEqual(github_entry.credential({}), 'fake-secret')
            self.assertEqual(run.call_args.kwargs['env']['GCM_INTERACTIVE'], 'never')
        with patch.object(github_entry.subprocess, 'run', side_effect=OSError('fake-secret')):
            with self.assertRaises(ValueError) as error: github_entry.credential({})
            self.assertNotIn('fake-secret', str(error.exception))

    @unittest.skipUnless(sys.platform == 'win32', 'Windows supervisor lock')
    def test_bom_settings_and_supervisor_no_duplicate_spawn(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root/'config.json'
            config.write_text(json.dumps({'enabled':True,'repository':'owner/repo'}), encoding='utf-8-sig')
            with patch.object(github_entry, 'SETTINGS', config): self.assertTrue(github_entry.settings()['enabled'])
            with patch.object(maintain_public, 'ROOT', root), patch.object(maintain_public, 'STATE', root/'state.json'), \
                    patch.object(maintain_public, 'DISABLED', root/'disabled'), patch.object(maintain_public.github_entry, 'settings', return_value={}), \
                    patch.object(maintain_public, 'health', return_value={'public_url':self.url}), \
                    patch.object(maintain_public.github_entry, 'publish', return_value={'status':'current','commit':'abc'}), \
                    patch.object(maintain_public, 'spawn_host') as spawn:
                self.assertEqual(maintain_public.main(['--once']),0)
                spawn.assert_not_called()
                self.assertEqual(json.loads((root/'state.json').read_text())['status'],'online')


if __name__ == '__main__': unittest.main()
