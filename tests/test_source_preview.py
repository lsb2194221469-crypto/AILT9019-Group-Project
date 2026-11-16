import base64
import http.client
import json
import threading
import unittest
import urllib.parse
from unittest.mock import patch

import pymupdf
import server
from source_preview import citation_clip, render_source


def math_pdf():
    with pymupdf.open() as pdf:
        page = pdf.new_page()
        page.insert_font(fontname='mathsymbols', fontbuffer=pymupdf.Font('symb').buffer)
        page.insert_text((50, 50), 'Course notes: expectation and probability', fontsize=13)
        page.insert_text((50, 200), 'Expectation of continuous rv: E[g(X)] =', fontsize=13)
        page.insert_text((65, 255), '\u222b', fontsize=32, fontname='mathsymbols')
        page.insert_text((65, 220), '\u221e', fontsize=9, fontname='mathsymbols')
        page.insert_text((57, 268), '-', fontsize=9)
        page.insert_text((62, 268), '\u221e', fontsize=9, fontname='mathsymbols')
        page.insert_text((94, 250), 'g(x) f(x) dx', fontsize=13)
        page.insert_text((50, 320), 'Pr(X <= x) denotes cumulative probability.', fontsize=13)
        page.insert_text((50, 350), 'x', fontsize=12)
        page.insert_text((57, 344), '2', fontsize=8)
        page.insert_text((50, 650), 'An unrelated paragraph should not be in the excerpt.', fontsize=13)
        return pdf.tobytes()


class SourcePreviewTests(unittest.TestCase):
    def test_aes_password_pdf_has_actionable_error_without_crypto_dependency(self):
        with pymupdf.open() as pdf:
            pdf.new_page()
            data=pdf.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256,owner_pw='test-owner',user_pw='test-reader')
        with self.assertRaisesRegex(ValueError, 'Password-protected'):
            server.extract_pdf(data)

    def test_lossy_extraction_displays_original_glyphs_not_rewritten_text(self):
        data = math_pdf()
        # Deliberately reproduce missing integral and split operator extraction.
        quote = 'Expectation of continuous rv: E[g(X)] = R g(x) f(x) dx'
        original = quote
        result = render_source(data, 1, quote)
        self.assertEqual(result['mode'], 'excerpt')
        self.assertEqual(quote, original)
        with pymupdf.open(stream=data, filetype='pdf') as document:
            page = document[0]
            clip, _ = citation_clip(page, quote)
            self.assertLess(clip.y0, 200)
            self.assertGreater(clip.y1, 268)  # both integral limits included
            self.assertLess(clip.y1, 650)
            # Padding must never expose only half an adjacent baseline, even
            # after a tall operator has expanded the original crop region.
            for block in page.get_text('dict')['blocks']:
                for line in block.get('lines', []):
                    box = pymupdf.Rect(line['bbox'])
                    if box.y0 < clip.y1 and box.y1 > clip.y0:
                        self.assertLessEqual(clip.y0, box.y0)
                        self.assertGreaterEqual(clip.y1, box.y1)
            scale = min(2., 1200 / clip.width, 2200 / clip.height,
                        (2_500_000 / (clip.width * clip.height)) ** .5)
            expected = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip,
                                       colorspace=pymupdf.csRGB, alpha=False).tobytes('png')
            self.assertEqual(base64.b64decode(result['image']), expected)

    def test_split_probability_name_still_locates_original_typography(self):
        result = render_source(math_pdf(), 1, 'P r ( X <= x ) denotes cumulative probability.')
        self.assertEqual(result['mode'], 'excerpt')

    def test_uncertain_or_absent_passage_shows_whole_page(self):
        for quote in ('', 'Completely absent quotation about a different scientific subject.'):
            result = render_source(math_pdf(), 1, quote)
            self.assertEqual(result['mode'], 'page')
            self.assertLessEqual(result['width'] * result['height'], 2_510_000)

    def test_duplicate_and_rotated_passages_do_not_guess_a_crop(self):
        quote = 'A repeated paragraph cannot be uniquely located.'
        with pymupdf.open() as document:
            page = document.new_page()
            page.insert_text((50, 100), quote)
            page.insert_text((50, 500), quote)
            self.assertEqual(citation_clip(page, quote)[1], 'page')
            page.set_rotation(90)
            data = document.tobytes()
        self.assertEqual(render_source(data, 1, quote)['mode'], 'page')

    def test_invalid_inputs_fail_without_model_calls(self):
        for data, page, quote in ((b'not pdf', 1, ''), (math_pdf(), 0, ''),
                                  (math_pdf(), True, ''), (math_pdf(), 2, ''),
                                  (math_pdf(), 1, 'x' * 4001), (b'%PDF-broken', 1, '')):
            with self.subTest(page=page, bytes=len(data)):
                with self.assertRaises(ValueError): render_source(data, page, quote)

    def test_http_preview_is_same_origin_and_does_not_use_provider(self):
        class Quiet(server.Handler):
            def log_message(self, *args): pass
        httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), Quiet)
        worker = threading.Thread(target=httpd.serve_forever, daemon=True)
        worker.start()
        def request(origin, page='1'):
            connection = http.client.HTTPConnection('127.0.0.1', httpd.server_port)
            connection.request('POST', '/api/source-preview?page=' + page, math_pdf(),
                               {'Host':'127.0.0.1:8765', 'Origin':origin,
                                'X-Source-Quote':urllib.parse.quote('P r ( X <= x ) denotes cumulative probability.')})
            response = connection.getresponse()
            result = response.status, json.loads(response.read())
            connection.close()
            return result
        try:
            with patch.object(server, 'provider_request', side_effect=AssertionError('No API call')):
                status, result = request('http://127.0.0.1:8765')
                self.assertEqual(status, 200)
                self.assertEqual(result['mode'], 'excerpt')
                self.assertTrue(base64.b64decode(result['image']).startswith(b'\x89PNG'))
                self.assertEqual(request('https://untrusted.invalid')[0], 403)
                self.assertEqual(request('http://127.0.0.1:8765', 'bad')[0], 400)
        finally:
            httpd.shutdown(); httpd.server_close(); worker.join()


if __name__ == '__main__':
    unittest.main()
