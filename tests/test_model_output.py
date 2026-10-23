import json
import unittest
from unittest.mock import patch
import server


def response(content, reason='stop'):
    return {'choices': [{'finish_reason': reason, 'message': {'content': content}}]}


class OutputTests(unittest.TestCase):
    def setUp(self):
        self.pages = [{'page': 1, 'text': 'The test set measures performance on unseen data and is separate from training.'}]
        self.question = {'type': 'tf', 'question': 'Is test data separate from training?',
                         'options': ['True', 'False'], 'answer': 'True', 'explanation': 'They are separate.',
                         'quote': self.pages[0]['text'], 'page': 1}

    def test_empty_then_valid_retries_once_with_more_room(self):
        with patch.object(server, 'read_config', return_value={'model': 'test'}), patch.object(server, 'provider_request',
                side_effect=[response('', 'length'), response(json.dumps({'questions': [self.question]}))]) as provider:
            result = server.generate(self.pages, 'test', 'tf', 1, '')
            self.assertEqual(len(result['questions']), 1)
            self.assertEqual(provider.call_count, 2)
            self.assertGreaterEqual(provider.call_args.args[1]['max_tokens'], 16000)

    def test_incomplete_output_keeps_only_complete_supported_questions(self):
        content = '{"questions":[' + json.dumps(self.question) + ',{"question":"unfinished'
        with patch.object(server, 'read_config', return_value={'model': 'test'}), patch.object(server, 'provider_request',
                return_value=response(content, 'length')) as provider:
            result = server.generate(self.pages, 'test', 'tf', 2, '')
            self.assertEqual(len(result['questions']), 1)
            self.assertEqual(result['questions'][0]['quote'], self.pages[0]['text'])
            self.assertIn('长度限制', result['notice'])
            self.assertEqual(provider.call_count, 1)

    def test_truncated_fabricated_quote_still_fails_validation(self):
        invalid = self.question | {'quote': 'Fabricated material absent from the document.'}
        with patch.object(server, 'read_config', return_value={'model': 'test'}), patch.object(server, 'provider_request',
                return_value=response('{"questions":[' + json.dumps(invalid) + ',', 'length')):
            with self.assertRaisesRegex(ValueError, 'source-quote'):
                server.generate(self.pages, 'test', 'tf', 2, '')

    def test_invalid_json_is_bounded_and_reasoning_is_not_parsed(self):
        malformed = response('{"questions":[{"question":"\\(x^2\\)"}]}')
        malformed['choices'][0]['message']['reasoning_content'] = json.dumps({'questions': [self.question]})
        with patch.object(server, 'read_config', return_value={'model': 'test'}), patch.object(server, 'provider_request', return_value=malformed) as provider:
            with self.assertRaisesRegex(ValueError, 'JSON'):
                server.generate(self.pages, 'test', 'tf', 1, '')
            self.assertEqual(provider.call_count, 2)

    def test_fences_and_math_survive_without_repairs(self):
        q = self.question | {'question': r'Is \(x^{2}\) a square?'}
        items, truncated = server.model_questions(response('```json\n'+json.dumps({'questions': [q]})+'\n```'))
        self.assertEqual(items[0]['question'], q['question'])
        self.assertFalse(truncated)
        with self.assertRaises(server.ModelOutputError):
            server.model_questions(response('{"questions":[', 'stop'))

    def test_network_failures_are_not_retried_as_format_errors(self):
        with patch.object(server, 'read_config', return_value={'model': 'test'}), patch.object(server, 'provider_request', side_effect=ValueError('API Key 无效')) as provider:
            with self.assertRaisesRegex(ValueError, 'API Key'):
                server.generate(self.pages, 'test', 'tf', 1, '')
            self.assertEqual(provider.call_count, 1)


if __name__ == '__main__':
    unittest.main()
