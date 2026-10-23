import http.client
import json
import secrets
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import server
from generation_jobs import GenerationJobs


class QuietHandler(server.Handler):
    def log_message(self, *args):
        pass


class BackgroundTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.jobs = GenerationJobs(self.directory.name)
        self.patch_jobs = patch.object(server, 'JOBS', self.jobs)
        self.patch_jobs.start()
        self.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
        self.worker = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.worker.start()
        self.body = {'job_id': secrets.token_urlsafe(24), 'document_ids': ['job-source'],
                     'document_names': ['Notes.pdf'], 'model': 'dummy-model', 'counts': {'mcq': 0, 'tf': 1, 'short': 0}}
        self.source = patch.dict(server.DOCUMENTS, {'job-source': [{'page': 1, 'text': 'Synthetic lecture text for a background generation test.'}]})
        self.source.start()

    def tearDown(self):
        self.httpd.shutdown(); self.httpd.server_close(); self.worker.join()
        self.patch_jobs.stop(); self.source.stop(); self.directory.cleanup()

    def request(self, path, body=None, origin=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.httpd.server_port, timeout=3)
        headers = {'Host': '127.0.0.1:8765'}
        if origin:
            headers['Origin'] = origin
        connection.request('POST' if body is not None else 'GET', path,
                           json.dumps(body).encode() if body is not None else None, headers)
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def finished(self, job_id):
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            result = self.jobs.get(job_id)
            if result and result['status'] in ('succeeded', 'failed'):
                return result
            time.sleep(.01)
        self.fail('Background task did not finish')

    def test_disconnect_and_retry_use_one_independent_task(self):
        started, release = threading.Event(), threading.Event()
        result = {'questions': [{'type': 'tf', 'question': 'Synthetic question'}], 'sample': False}
        def delayed(*args, **kwargs):
            started.set()
            release.wait(3)
            return result
        with patch.object(server, 'generate', side_effect=delayed) as generate:
            try:
                status, accepted = self.request('/api/jobs', self.body)
                self.assertEqual(status, 202)
                self.assertTrue(started.wait(1))
                self.assertIn(accepted['status'], ('queued', 'running'))
                # The POST connection is closed; task and unrelated requests continue.
                self.assertEqual(self.request('/api/health')[0], 200)
                server.DOCUMENTS.pop('job-source')
                self.assertEqual(self.request('/api/jobs', self.body)[0], 200)
                self.assertEqual(generate.call_count, 1)
                self.assertNotIn('fingerprint', accepted)
            finally:
                release.set()
            self.assertEqual(self.finished(self.body['job_id'])['result'], result)
            status, completed = self.request('/api/jobs/' + self.body['job_id'])
            self.assertEqual(status, 200); self.assertEqual(completed['status'], 'succeeded')
            self.assertEqual(self.request('/api/jobs', self.body)[1]['result'], result)
            self.assertEqual(generate.call_count, 1)
            recovered = GenerationJobs(self.directory.name).get(self.body['job_id'])
            self.assertEqual(recovered['result'], result)

    def test_invalid_or_conflicting_requests_do_not_generate(self):
        with patch.object(server, 'generate', return_value={'questions': []}) as generate:
            self.assertEqual(self.request('/api/jobs', self.body | {'job_id': '../invalid'})[0], 400)
            self.assertEqual(self.request('/api/jobs', self.body, origin='http://evil.example')[0], 403)
            self.assertEqual(self.request('/api/jobs/' + secrets.token_urlsafe(24))[0], 404)
            self.assertEqual(self.request('/api/jobs/../../config.json')[0], 404)
            self.assertEqual(generate.call_count, 0)
            self.assertEqual(self.request('/api/jobs', self.body)[0], 202)
            self.finished(self.body['job_id'])
            self.assertEqual(self.request('/api/jobs', self.body | {'topic': 'different'})[0], 400)
            self.assertEqual(generate.call_count, 1)

    def test_failed_task_returns_sanitized_error_without_replay(self):
        with patch.object(server, 'generate', side_effect=RuntimeError('owner-secret-do-not-return')) as generate:
            self.request('/api/jobs', self.body)
            job = self.finished(self.body['job_id'])
            self.assertEqual(job['status'], 'failed')
            self.assertNotIn('owner-secret', json.dumps(job))
            self.request('/api/jobs', self.body)
            self.assertEqual(generate.call_count, 1)

    def test_restart_marks_incomplete_task_failed_and_expires_old_results(self):
        job_id = self.body['job_id']
        self.jobs.get(job_id)  # Initialize the private test directory.
        job = {'id': job_id, 'status': 'running', 'fingerprint': 'dummy', 'created_at': time.time(), 'updated_at': time.time()}
        (Path(self.directory.name) / (job_id + '.json')).write_text(json.dumps(job), encoding='utf-8')
        recovered = GenerationJobs(self.directory.name)
        self.assertEqual(recovered.get(job_id)['status'], 'failed')
        with patch('generation_jobs.time.time', return_value=time.time() + 86401):
            self.assertIsNone(recovered.get(job_id))


if __name__ == '__main__':
    unittest.main()
