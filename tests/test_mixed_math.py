import json
import unittest
from unittest.mock import patch
import pymupdf
import server


class MixedMathTests(unittest.TestCase):
    def setUp(self):
        self.pages = [{'page': 1, 'text': 'The squared value is x2 and this sentence provides supporting source text.',
                       'math_context': 'The squared value is x^{2} and this sentence provides supporting source text.'}]
        self.base = {'question': 'Compute \\(x^{2}\\) for \\(x=2\\).', 'answer': '\\(4\\)',
                     'options': ['\\(4\\)', '\\(2\\)', '\\(6\\)', '\\(8\\)'],
                     'explanation': 'Because \\(2^{2}=4\\).', 'page': 1, 'quote': self.pages[0]['text'], 'type': 'mcq'}

    def test_mixed_quotas_duplicate_and_type_validation(self):
        counts = {'mcq': 1, 'tf': 1, 'short': 0}
        true_false = dict(self.base, type='tf', question='Is the value four?', answer='True')
        items = [self.base, dict(self.base, question='An extra MCQ'), true_false,
                 dict(self.base, type='short', question='Unrequested short'),
                 dict(self.base, type='invalid')]
        valid, actual = server.validate_mixed(items, self.pages, counts)
        self.assertEqual(actual, counts)
        self.assertEqual([q['type'] for q in valid], ['mcq', 'tf'])
        invalid, _ = server.validate_mixed([dict(self.base, quote='A completely invented source passage.')], self.pages, counts)
        self.assertEqual(invalid, [])

    def test_counts_zero_limits_and_invalid_types(self):
        for bad in ({'mcq':0,'tf':0,'short':0}, {'mcq':12,'tf':12,'short':1},
                    {'mcq':True,'tf':1,'short':0}, {'mcq':-1,'tf':1,'short':1}, {'mcq':1}):
            with self.assertRaises(ValueError): server.question_counts(bad)
        self.assertEqual(sum(server.question_counts({'mcq':0,'tf':12,'short':12}).values()),24)

    def test_generation_preserves_math_hints_and_reports_shortfall(self):
        with patch.object(server, 'read_config', return_value={'model':'test'}), patch.object(server, 'provider_request', return_value={'choices':[{'message':{'content':json.dumps({'questions':[self.base]})}}]}) as provider:
            result = server.generate(self.pages,'test','mcq',4,'',counts={'mcq':1,'tf':1,'short':1})
            payload = provider.call_args[0][1]
            user = json.loads(payload['messages'][1]['content'])
            self.assertEqual(user['counts'], {'mcq':1,'tf':1,'short':1})
            self.assertIn('x^{2}', user['source_pages'][0]['math_context'])
            self.assertEqual(result['actual_counts'], {'mcq':1,'tf':0,'short':0})
            self.assertIn('少于请求',result['notice'])
            self.assertEqual(result['questions'][0]['quote'], self.pages[0]['text'])

    def test_pdf_position_recovers_scripts_but_does_not_guess_plain_digits(self):
        with pymupdf.open() as pdf:
            page = pdf.new_page()
            prefix = 'Source notes: the squared value is x'
            page.insert_text((72,72),prefix,fontsize=12)
            x = 72 + pymupdf.get_text_length(prefix,fontsize=12)
            page.insert_text((x,67),'2',fontsize=8)
            page.insert_text((x+5,72),' and ordinary x2 is ambiguous.',fontsize=12)
            subprefix = 'Another example is x'
            page.insert_text((72,105),subprefix,fontsize=12)
            x = 72 + pymupdf.get_text_length(subprefix,fontsize=12)
            page.insert_text((x,109),'i',fontsize=8)
            page.insert_text((x+4,105),' with a lower index.',fontsize=12)
            data = server.extract_pdf(pdf.tobytes())[0]
        self.assertIn('x^{2}',data['math_context'])
        self.assertIn('x_{i}',data['math_context'])
        self.assertIn('ordinary x2',data['math_context'])
        self.assertNotIn('x^{2}',data['text'])


if __name__ == '__main__':
    unittest.main()
