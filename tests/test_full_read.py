import json
import unittest
from unittest.mock import patch
import pymupdf
import server
import full_read


class FullReadTests(unittest.TestCase):
    def test_long_page_short_page_and_last_page_survive_extraction(self):
        with pymupdf.open() as pdf:
            page=pdf.new_page(width=700,height=1500)
            for i in range(130):
                page.insert_text((10,20+i*8),f'{i:03d} '+('read all the source text. '*7),fontsize=4)
            page.insert_text((10,1200),'LATE_MARKER_AFTER_16000',fontsize=9)
            pdf.new_page().insert_text((30,30),'Short title',fontsize=12)
            pdf.new_page().insert_text((30,30),'LAST_PAGE_MARKER with enough supporting context for a citation.',fontsize=10)
            pages=server.extract_pdf(pdf.tobytes())
        self.assertEqual(len(pages),3)
        self.assertGreater(len(pages[0]['text']),16000)
        self.assertIn('LATE_MARKER_AFTER_16000',pages[0]['text'])
        self.assertGreater(len(pages[0]['math_context']),16000)
        self.assertIn('Short title',pages[1]['text'])
        self.assertIn('LAST_PAGE_MARKER',pages[2]['text'])
        self.assertTrue(all(p['image_url'].startswith('data:image/jpeg;base64,') for p in pages))

    def test_generation_sends_every_page_image_and_complete_text_despite_topic(self):
        pages=[{'page':i+1,'text':f'PAGE {i+1} '+('Complete context. '*500),'math_context':'x^{2} '*3000,
                'image_url':f'data:image/jpeg;base64,PAGE{i+1}'} for i in range(3)]
        q={'type':'tf','question':'Is context supplied?','answer':'True','explanation':'It is included.',
           'page':3,'quote':'Complete context. Complete context.','options':[]}
        decision = {'status':'supported','evidence':[{'page':1,'quote':'Complete context. Complete context.'}]}
        responses = [{'choices':[{'message':{'content':json.dumps(item)}}]} for item in (decision, {'questions':[q]})]
        with patch.object(server,'read_config',return_value={'model':'deepseek-flash'}),patch.object(server,'provider_request',side_effect=responses) as provider:
            result=server.generate(pages,'deepseek-flash','tf',1,'PAGE 1')
        self.assertEqual(provider.call_count, 2)
        self.assertEqual(provider.call_args_list[0].args[1]['messages'][1]['content'], provider.call_args.args[1]['messages'][1]['content'])
        parts=provider.call_args.args[1]['messages'][1]['content']
        sent=json.loads(parts[0]['text'])['source_pages']
        self.assertEqual([p['text'] for p in sent],[p['text'] for p in pages])
        self.assertEqual([p['math_context'] for p in sent],[p['math_context'] for p in pages])
        self.assertEqual([p['image_url']['url'] for p in parts if p['type']=='image_url'],[p['image_url'] for p in pages])
        self.assertEqual(result['pages_used'],[1,2,3])
        self.assertEqual(result['reading']['page_images'],3)

    def test_combined_page_limit_refuses_before_calling_model(self):
        pages=[{'page':i+1,'text':'source text'} for i in range(full_read.MAX_PAGES+1)]
        self.assert_refused(pages,'80')

    def test_combined_text_limit_refuses_before_calling_model(self):
        self.assert_refused([{'page':1,'text':'汉'*(full_read.MAX_TEXT_BYTES//3+1)}],'300 KB')

    def test_combined_image_limit_refuses_before_calling_model(self):
        with patch.object(full_read,'MAX_REQUEST_BYTES',1024):
            self.assert_refused([{'page':1,'text':'Source material','image_url':'x'*2048}],'32 MB')

    def test_missing_page_image_refuses_instead_of_sending_partial_visual_input(self):
        self.assert_refused([{'page':1,'text':'Source material','image_url':'image'}, {'page':2,'text':'More material'}],'page images are missing')

    def assert_refused(self,pages,message):
        with patch.object(server,'read_config',return_value={'model':'deepseek-flash'}),patch.object(server,'provider_request') as provider:
            with self.assertRaisesRegex(ValueError,message):
                server.generate(pages,'deepseek-flash','tf',1,'')
            provider.assert_not_called()

    def test_blank_middle_page_is_present_not_silently_skipped(self):
        with pymupdf.open() as pdf:
            pdf.new_page().insert_text((30,30),'This readable first page supplies sufficient citation text.')
            pdf.new_page()
            pages=server.extract_pdf(pdf.tobytes())
        self.assertEqual([p['page'] for p in pages],[1,2])
        self.assertEqual(pages[1]['text'],'')
        self.assertTrue(pages[1]['image_url'])


if __name__=='__main__':unittest.main()
