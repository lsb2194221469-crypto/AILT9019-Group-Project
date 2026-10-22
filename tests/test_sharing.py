import http.client
import json
import threading
import unittest
from unittest.mock import patch

import server
import launch


class QuietHandler(server.Handler):
    def log_message(self, *args):
        pass


class SharingTests(unittest.TestCase):
    def setUp(self):
        self.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
        self.httpd.allowed_hosts = {'127.0.0.1:8765', '192.168.50.7:8765'}
        self.httpd.sharing = True
        self.httpd.share_urls = ['http://192.168.50.7:8765']
        self.worker = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.worker.start()

    def tearDown(self):
        self.httpd.shutdown(); self.httpd.server_close(); self.worker.join()

    def request(self, path, host='192.168.50.7:8765', data=None, origin=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.httpd.server_port)
        headers = {'Host': host}
        if origin:
            headers['Origin'] = origin
        connection.request('POST' if data is not None else 'GET', path,
                           body=json.dumps(data).encode() if data is not None else None, headers=headers)
        response = connection.getresponse()
        result = response.status, response.read()
        connection.close()
        return result

    def test_hosts_origins_and_private_files(self):
        self.assertEqual(self.request('/')[0], 200)
        self.assertEqual(self.request('/', host='attacker.example:8765')[0], 403)
        self.assertEqual(self.request('/config.json')[0], 404)
        self.assertEqual(self.request('/api/generate', data={'document_ids': []}, origin='http://evil.example')[0], 403)
        self.assertEqual(self.request('/api/generate', data={'document_ids': []}, origin='http://192.168.50.7:8765')[0], 400)
        status, body = self.request('/api/health')
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)['sharing'])

    def test_shared_generation_uses_server_key_without_returning_it(self):
        text = 'The test set evaluates performance on unseen data and is separate from training data.'
        question = {'type': 'tf', 'question': 'Does the test set evaluate unseen data?', 'answer': 'True',
                    'options': ['True', 'False'], 'explanation': 'It evaluates unseen data.', 'page': 1, 'quote': text}
        config = {'model': 'test-model', 'api_key': 'owner-fake-secret', 'base_url': 'https://example.invalid'}
        with patch.dict(server.DOCUMENTS, {'source-test': [{'page': 1, 'text': text}]}), \
                patch.object(server, 'read_config', return_value=config), \
                patch.object(server, 'provider_request', return_value={'choices': [{'message': {'content': json.dumps({'questions': [question]})}}]}) as provider:
            status, body = self.request('/api/generate', data={'document_ids': ['source-test'], 'document_names': ['Notes.pdf'],
                'model': 'test-model', 'counts': {'mcq': 0, 'tf': 1, 'short': 0}}, origin='http://192.168.50.7:8765')
            self.assertEqual(status, 200)
            self.assertEqual(provider.call_args.args[2]['api_key'], 'owner-fake-secret')
            self.assertNotIn(b'owner-fake-secret', body)
            self.assertEqual(json.loads(body)['questions'][0]['source_name'], 'Notes.pdf')

    def test_address_discovery_excludes_loopback_public_and_link_local(self):
        addresses = ['127.0.0.1', '192.168.50.7', '8.8.8.8', '169.254.1.2']
        with patch.object(launch.socket, 'getaddrinfo', return_value=[(None, None, None, None, (ip, 0)) for ip in addresses]), \
                patch.object(launch.socket, 'socket') as sock:
            sock.return_value.__enter__.return_value.getsockname.return_value = ('192.168.50.7', 0)
            self.assertEqual(launch.lan_addresses(), ['192.168.50.7'])


if __name__ == '__main__':
    unittest.main()
