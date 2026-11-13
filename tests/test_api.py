import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch, MagicMock
import server

class ApiTests(unittest.TestCase):
    def test_refused_local_proxy_uses_direct_connection_before_api_request(self):
        with patch.object(server.urllib.request, 'getproxies', return_value={'https':'http://127.0.0.1:7897'}), patch.object(server.urllib.request, 'proxy_bypass', return_value=False), patch.object(server.socket, 'create_connection', side_effect=ConnectionRefusedError), patch.object(server.urllib.request, 'build_opener') as build:
            server.model_opener('https://api.deepseek.com')
            handlers = build.call_args.args
            self.assertEqual(handlers[0].proxies, {})
            self.assertIsInstance(handlers[1], server.NoRedirect)

    def test_working_local_proxy_is_preserved(self):
        with patch.object(server.urllib.request, 'getproxies', return_value={'https':'http://localhost:7897'}), patch.object(server.urllib.request, 'proxy_bypass', return_value=False), patch.object(server.socket, 'create_connection') as connect, patch.object(server.urllib.request, 'build_opener') as build:
            server.model_opener('https://api.deepseek.com')
            self.assertEqual(len(build.call_args.args), 1)
            connect.assert_called_once()

    def test_unresponsive_local_proxy_uses_direct_before_sending_request(self):
        with patch.object(server.urllib.request, 'getproxies', return_value={'https':'http://127.0.0.1:7897'}), patch.object(server.urllib.request, 'proxy_bypass', return_value=False), patch.object(server.socket, 'create_connection', side_effect=TimeoutError), patch.object(server.urllib.request, 'build_opener') as build:
            server.model_opener('https://api.deepseek.com')
            self.assertEqual(build.call_args.args[0].proxies, {})

    def test_remote_proxy_is_never_probed_or_bypassed(self):
        with patch.object(server.urllib.request, 'getproxies', return_value={'https':'http://proxy.example:8080'}), patch.object(server.urllib.request, 'proxy_bypass', return_value=False), patch.object(server.socket, 'create_connection') as connect, patch.object(server.urllib.request, 'build_opener') as build:
            server.model_opener('https://api.deepseek.com')
            self.assertEqual(len(build.call_args.args), 1)
            connect.assert_not_called()

    def test_configuration_rejects_missing_key_and_insecure_endpoint(self):
        with tempfile.TemporaryDirectory(dir=server.ROOT / 'tests') as directory:
            path = Path(directory) / 'config.json'
            with patch.object(server, 'CONFIG_PATH', path):
                with self.assertRaises(ValueError): server.read_config()
                for config in ({'api_key':'','base_url':'https://api.deepseek.com','model':'test'},
                               {'api_key':'test','base_url':'http://example.com','model':'test'},
                               {'api_key':'test','base_url':'https://user:pass@example.com','model':'test'}):
                    path.write_text(json.dumps(config))
                    with self.assertRaises(ValueError): server.read_config()
                path.write_text(json.dumps({'api_key':'fake-secret','base_url':'https://api.deepseek.com/v1/','model':'test'}))
                self.assertEqual(server.read_config()['base_url'],'https://api.deepseek.com/v1')

    def test_request_bearer_and_json_and_sanitized_errors(self):
        config={'api_key':'fake-secret','base_url':'https://api.deepseek.com','model':'test'}
        opener=MagicMock()
        opener.open.return_value.__enter__.return_value.read.return_value=b'{"data":[]}'
        with patch.object(server.urllib.request, 'build_opener', return_value=opener):
            server.provider_request('models',config=config)
            request=opener.open.call_args[0][0]
            self.assertEqual(request.full_url,'https://api.deepseek.com/models')
            self.assertEqual(request.get_header('Authorization'),'Bearer fake-secret')
            for status in (401,402,403,404,429,500,302):
                opener.open.side_effect=urllib.error.HTTPError(request.full_url,status,'fake-secret',{},io.BytesIO(b'fake-secret'))
                with self.assertRaises(ValueError) as caught: server.provider_request('models',config=config)
                self.assertNotIn('fake-secret',str(caught.exception))

    def test_redirect_is_not_followed(self):
        self.assertIsNone(server.NoRedirect().redirect_request(None,None,302,'',{},'https://elsewhere.example'))

    def test_bad_model_output_is_actionable(self):
        with patch.object(server,'read_config',return_value={'model':'test'}), patch.object(server,'provider_request',return_value={'choices':[{'message':{'content':'[]'}}]}):
            with self.assertRaisesRegex(ValueError,'JSON'):
                server.generate([{'page':1,'text':'A source passage long enough to support a question.'}],'test','tf',1,'')
