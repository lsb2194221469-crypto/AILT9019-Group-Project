import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class QuizTests(unittest.TestCase):
    def setUp(self):
        self.pages = [{'page': 2, 'text': 'The test set evaluates performance on unseen data and must not be used to train model parameters.'}]
        self.q = {'question': 'Should the test set train parameters?', 'answer': 'False',
                  'explanation': 'It evaluates unseen data.', 'page': 2,
                  'quote': self.pages[0]['text'], 'options': ['True', 'False']}

    def test_verified_quote_is_accepted(self):
        self.assertEqual(len(server.validate_questions([self.q], self.pages, 'tf', 1)), 1)

    def test_fabricated_quote_and_wrong_page_rejected(self):
        self.assertEqual(server.validate_questions([self.q | {'quote': 'Invented passage that does not occur.'}], self.pages, 'tf', 1), [])
        self.assertEqual(server.validate_questions([self.q | {'page': 1}], self.pages, 'tf', 1), [])

    def test_duplicate_and_invalid_answer_rejected(self):
        self.assertEqual(len(server.validate_questions([self.q, self.q], self.pages, 'tf', 4)), 1)
        self.assertEqual(server.validate_questions([self.q | {'answer': 'Maybe'}], self.pages, 'tf', 1), [])

    def test_mcq_requires_four_distinct_options_and_matching_answer(self):
        q = self.q | {'options': ['a', 'b', 'c', 'd'], 'answer': 'a'}
        self.assertEqual(len(server.validate_questions([q], self.pages, 'mcq', 1)), 1)
        self.assertEqual(server.validate_questions([q | {'answer': 'e'}], self.pages, 'mcq', 1), [])
        self.assertEqual(server.validate_questions([q | {'options': ['a','a','c','d']}], self.pages, 'mcq', 1), [])

    def test_pdf_blank_and_invalid_fail_safely(self):
        from pypdf import PdfWriter
        output = io.BytesIO()
        writer = PdfWriter()
        writer.add_blank_page(width=300, height=300)
        writer.write(output)
        with self.assertRaisesRegex(ValueError, 'OCR'):
            server.extract_pdf(output.getvalue())
        with self.assertRaises(ValueError):
            server.extract_pdf(b'not a pdf')

    def test_generation_uses_cloud_api_and_checks_provenance(self):
        with patch.object(server, 'read_config', return_value={'model': 'test-model'}), patch.object(server, 'provider_request', return_value={'choices': [{'message': {'content': json.dumps({'questions':[self.q]})}}]}) as mock:
            result = server.generate(self.pages, 'test-model', 'tf', 1, '')
            self.assertFalse(result['sample'])
            self.assertEqual(result['questions'][0]['page'], 2)
            self.assertEqual(mock.call_args[0][0], 'chat/completions')
            self.assertEqual(mock.call_args[0][1]['response_format'], {'type': 'json_object'})

    def test_unsupported_model_output_does_not_substitute_sample(self):
        with patch.object(server, 'read_config', return_value={'model': 'test-model'}), patch.object(server, 'provider_request', return_value={'choices': [{'message': {'content':'{"questions":[]}'}}]}):
            with self.assertRaisesRegex(ValueError, 'Not enough supported'):
                server.generate(self.pages, 'test-model', 'tf', 1, '')


if __name__ == '__main__':
    unittest.main()
