"""QA server uses only dummy configuration and a synthetic provider response."""
import sys
import json
import tempfile
import threading
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from generation_jobs import GenerationJobs
test_directory = tempfile.TemporaryDirectory(prefix='lecture-fixture-jobs-')
server.JOBS = GenerationJobs(test_directory.name)
provider_state = {'calls': 0, 'delay_ms': 0}
provider_lock = threading.Lock()
server.read_config = lambda: {'model':'fixture-model','api_key':'dummy','base_url':'https://example.invalid'}

def provider(path,payload,config):
    with provider_lock:
        provider_state['calls'] += 1
        delay = provider_state['delay_ms']
    time.sleep(delay / 1000)
    content = payload['messages'][1]['content']
    request = json.loads(content[0]['text'] if isinstance(content,list) else content)
    source = request['source_pages'][0]
    assert 'x^{2}' in source['math_context']
    questions = []
    for kind,count in request['counts'].items():
        for index in range(count):
            source = request['source_pages'][len(questions) % len(request['source_pages'])]
            common = {'type':kind,'page':source['page'],'quote':source['text'],
                      'explanation':r'Using \(x^{2}=x\times x\), with \(x=2\), gives \(4\). Units use \(\mathrm{m}^{2}\), and functions use \(\sin x\).'}
            if kind == 'mcq':
                common.update(question=rf'Question {index+1}: if \(x=2\), \(x^{{2}}\) equals what?',answer=r'\(4\)',options=[r'\(4\)',r'\(2\)',r'\(\frac{1}{2}\)',r'\(\sqrt{2}\)'])
            elif kind == 'tf':
                common.update(question=r'True or false: \(x=2\) when, \(x^{2}=4\).',answer='True',options=['True','False'])
            else:
                common.update(question=r'Find the derivative and explain: \[\frac{d}{dx}x^{2}=2x\] Also explain what x^2 and x_i mean.<img src=x onerror="window.pwned=1">',answer=r'\(2x\)',options=[])
            questions.append(common)
    return {'choices':[{'message':{'content':json.dumps({'questions':questions})}}]}

server.provider_request = provider
class FixtureHandler(server.Handler):
    def normalize_headers(self):
        self.headers.replace_header('Host','127.0.0.1:8765')
        if self.headers.get('Origin') == 'http://127.0.0.1:8766':
            self.headers.replace_header('Origin','http://127.0.0.1:8765')
    def do_GET(self):
        self.normalize_headers()
        if self.path == '/api/test/metrics':
            with provider_lock:
                self.reply(200, dict(provider_state))
            return
        super().do_GET()
    def do_POST(self):
        self.normalize_headers()
        if self.path == '/api/test/provider':
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            with provider_lock:
                provider_state['delay_ms'] = body.get('delay_ms', 0)
            self.reply(200, {'ok': True})
            return
        if self.path == '/api/test/reset-documents':
            with server.LOCK:
                server.DOCUMENTS.clear()
            self.reply(200, {'cleared': True})
            return
        super().do_POST()
httpd = server.ThreadingHTTPServer(('127.0.0.1',8766),FixtureHandler)
print('Fixture server ready',flush=True)
httpd.serve_forever()
