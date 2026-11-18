import http.client
import json
import secrets
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

import server
from generation_jobs import GenerationJobs
from topic_guard import TopicBoundaryError


def response(content, finish='stop'):
    return {'choices': [{'message': {'content': json.dumps(content) if not isinstance(content, str) else content}, 'finish_reason': finish}]}


TEXT = 'Add matrices of the same shape by adding their corresponding entries.'
PAGES = [{'page': 1, 'text': TEXT, 'math_context': ''}]
SUPPORTED = {'status': 'supported', 'evidence': [{'page': 1, 'quote': TEXT}]}
UNSUPPORTED = {'status': 'unsupported', 'evidence': []}
QUESTION = {'type': 'tf', 'question': 'Are matching entries added?', 'answer': 'True',
            'explanation': 'The notes say to add corresponding entries.', 'page': 1, 'quote': TEXT}


class TopicBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.config = patch.object(server, 'read_config', return_value={'model': 'test'})
        self.config.start()
        self.addCleanup(self.config.stop)

    def generate(self, topic='matrix addition', pages=None):
        return server.generate(pages or PAGES, 'test', 'tf', 1, topic)

    def test_supported_topic_checks_then_generates(self):
        with patch.object(server, 'provider_request', side_effect=[response(SUPPORTED), response({'questions': [QUESTION]})]) as provider:
            result = self.generate()
        self.assertEqual(provider.call_count, 2)
        self.assertEqual(result['topic_check']['status'], 'supported')
        self.assertEqual(len(result['questions']), 1)
        first = provider.call_args_list[0].args[1]
        self.assertIn('Do not generate questions', first['messages'][0]['content'])
        self.assertEqual(json.loads(first['messages'][1]['content'])['topic_filter'], 'matrix addition')

    def test_unsupported_topic_never_reaches_question_generation(self):
        with patch.object(server, 'provider_request', return_value=response(UNSUPPORTED)) as provider:
            with self.assertRaises(TopicBoundaryError) as caught:
                self.generate("Bayes' theorem")
        self.assertEqual(caught.exception.code, 'topic_not_covered')
        self.assertEqual(caught.exception.status, 422)
        self.assertEqual(provider.call_count, 1)

    def test_blank_topic_skips_extra_request(self):
        for topic in ('', '  \n\t'):
            with self.subTest(topic=topic), patch.object(server, 'provider_request', return_value=response({'questions': [QUESTION]})) as provider:
                result = self.generate(topic)
                self.assertEqual(provider.call_count, 1)
                self.assertEqual(result['topic_check']['status'], 'not_requested')

    def test_invalid_or_uncertain_decision_stops_without_claiming_mismatch(self):
        cases = ['not JSON', [], {}, {'status': 'supported', 'evidence': []},
                 {'status': 'uncertain', 'evidence': []},
                 {'status': 'supported', 'evidence': [{'page': 99, 'quote': TEXT}]},
                 {'status': 'supported', 'evidence': [{'page': True, 'quote': TEXT}]},
                 {'status': 'supported', 'evidence': [{'page': 1, 'quote': 'Invented quotation that is absent from the source.'}]},
                 {'status': 'unsupported', 'evidence': [{'page': 1, 'quote': TEXT}]}]
        for content in cases:
            with self.subTest(content=content), patch.object(server, 'provider_request', return_value=response(content)) as provider:
                with self.assertRaises(TopicBoundaryError) as caught:
                    self.generate()
                self.assertEqual(caught.exception.code, 'topic_check_failed')
                self.assertNotIn('Invented', str(caught.exception))
                self.assertEqual(provider.call_count, 1)

    def test_truncated_or_filtered_check_never_generates(self):
        for finish in ('length', 'content_filter'):
            with self.subTest(finish=finish), patch.object(server, 'provider_request', return_value=response(SUPPORTED, finish)) as provider:
                with self.assertRaises(TopicBoundaryError):
                    self.generate()
                self.assertEqual(provider.call_count, 1)

    def test_provider_failure_is_not_reported_as_topic_mismatch(self):
        with patch.object(server, 'provider_request', side_effect=ValueError('Model account has no credit')) as provider:
            with self.assertRaisesRegex(ValueError, 'no credit') as caught:
                self.generate()
        self.assertNotIsInstance(caught.exception, TopicBoundaryError)
        self.assertEqual(provider.call_count, 1)

    def test_all_pdf_pages_and_images_reach_both_requests(self):
        pages = server.combine_sources([
            {'id': 'first', 'name': 'A.pdf', 'pages': [dict(PAGES[0], image_url='data:image/jpeg;base64,AA')]},
            {'id': 'second', 'name': 'B.pdf', 'pages': [dict(PAGES[0], image_url='data:image/jpeg;base64,BB')]}])
        decision = {'status': 'supported', 'evidence': [{'page': 2, 'quote': TEXT}]}
        with patch.object(server, 'provider_request', side_effect=[response(decision), response({'questions': [QUESTION]})]) as provider:
            self.generate(pages=pages)
        for call in provider.call_args_list:
            content = call.args[1]['messages'][1]['content']
            overview = json.loads(content[0]['text'])
            self.assertEqual([p['source_id'] for p in overview['source_pages']], ['first', 'second'])
            self.assertEqual([p['image_url']['url'] for p in content if p['type'] == 'image_url'], ['data:image/jpeg;base64,AA', 'data:image/jpeg;base64,BB'])


class TopicHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.jobs = GenerationJobs(self.temp.name)
        self.patches = [patch.object(server, 'JOBS', self.jobs),
                        patch.dict(server.DOCUMENTS, {'topic-source': PAGES}),
                        patch.object(server, 'read_config', return_value={'model': 'test'}),
                        patch.object(server, 'provider_request', return_value=response(UNSUPPORTED))]
        for item in self.patches:
            item.start()
        self.provider = server.provider_request
        class Quiet(server.Handler):
            def log_message(self, *args):
                pass
        self.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), Quiet)
        self.thread = threading.Thread(target=self.httpd.serve_forever, kwargs={'poll_interval': 0.05}, daemon=True)
        self.thread.start()
        self.body = {'document_ids': ['topic-source'], 'document_names': ['Matrix.pdf'],
                     'counts': {'mcq': 0, 'tf': 1, 'short': 0}, 'model': 'test', 'topic': "Bayes' theorem"}

    def tearDown(self):
        self.httpd.shutdown(); self.httpd.server_close(); self.thread.join()
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def post(self, path, body):
        connection = http.client.HTTPConnection('127.0.0.1', self.httpd.server_port, timeout=3)
        connection.request('POST', path, json.dumps(body), {'Host': '127.0.0.1:8765'})
        reply = connection.getresponse()
        result = reply.status, json.loads(reply.read())
        connection.close()
        return result

    def test_direct_endpoint_returns_explicit_refusal(self):
        status, body = self.post('/api/generate', self.body)
        self.assertEqual(status, 422)
        self.assertEqual(body['code'], 'topic_not_covered')
        self.assertNotIn('questions', body)
        self.assertEqual(self.provider.call_count, 1)

    def test_background_refusal_survives_retry_and_reload(self):
        body = self.body | {'job_id': secrets.token_urlsafe(24)}
        self.assertEqual(self.post('/api/jobs', body)[0], 202)
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            job = self.jobs.get(body['job_id'])
            if job['status'] == 'failed':
                break
            time.sleep(0.01)
        self.assertEqual(job['code'], 'topic_not_covered')
        self.assertNotIn('result', job)
        self.assertEqual(self.post('/api/jobs', body)[1]['code'], 'topic_not_covered')
        self.assertEqual(self.provider.call_count, 1)
        self.assertEqual(GenerationJobs(self.temp.name).get(body['job_id'])['code'], 'topic_not_covered')


if __name__ == '__main__':
    unittest.main()
