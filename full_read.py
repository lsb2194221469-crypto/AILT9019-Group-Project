"""Complete PDF inputs or an explicit refusal; never select or trim passages."""
import base64
import json
import math

MAX_DOCUMENTS = 10
MAX_PAGES = 80
MAX_TEXT_BYTES = 300_000
MAX_REQUEST_BYTES = 32 * 1024 * 1024


def complete_sources(pages):
    if not pages or len(pages) > MAX_PAGES:
        raise ValueError(f'Choose up to {MAX_PAGES} pages in total. Use fewer files or split your PDFs. No pages will be skipped.')
    selected = [{key: value for key, value in page.items()
                 if key in ('page', 'text', 'math_context', 'source_id', 'source_name', 'source_page')}
                for page in pages]
    size = len(json.dumps(selected, ensure_ascii=False).encode('utf-8'))
    if size > MAX_TEXT_BYTES:
        raise ValueError('The text and math hints are over the 300 KB limit. Split your PDFs or use fewer files. Nothing was cut or sent to the model.')
    return selected


def page_images(data):
    import pymupdf
    images = {}
    with pymupdf.open(stream=data, filetype='pdf') as document:
        if len(document) > MAX_PAGES:
            raise ValueError(f'Use up to {MAX_PAGES} pages per group. Split larger PDFs before uploading.')
        total = 0
        for index, page in enumerate(document):
            edge = max(page.rect.width, page.rect.height)
            if not math.isfinite(edge) or edge <= 0:
                raise ValueError(f'Page {index + 1} has an invalid size. Please export the PDF again.')
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1536 / edge, 1536 / edge), alpha=False)
            encoded = base64.b64encode(pixmap.tobytes('jpeg', jpg_quality=85)).decode('ascii')
            total += len(encoded)
            if total > MAX_REQUEST_BYTES - MAX_TEXT_BYTES - 65536:
                raise ValueError('The PDF page images are too large. Split the PDF. No pages were skipped.')
            images[index + 1] = 'data:image/jpeg;base64,' + encoded
    return images


def user_content(pages, selected, counts, topic):
    overview = json.dumps({'counts': counts, 'topic_filter': topic,
                           'reading_mode': 'all_pages_no_truncation', 'source_pages': selected}, ensure_ascii=False)
    images = [p for p in pages if p.get('image_url')]
    if not images:
        return overview
    if len(images) != len(pages):
        raise ValueError('Some page images are missing. Upload all files again. Nothing was sent to the model.')
    content = [{'type': 'text', 'text': overview}]
    for page in pages:
        content.append({'type': 'text', 'text': f"Original PDF page image for citation page ID {page['page']}"})
        content.append({'type': 'image_url', 'image_url': {'url': page['image_url'], 'detail': 'high'}})
    return content


def check_request(payload):
    if len(json.dumps(payload, ensure_ascii=False).encode('utf-8')) > MAX_REQUEST_BYTES:
        raise ValueError('The page images and text are over the 32 MB limit. Use fewer files or split the PDFs. Nothing was cut or sent to the model.')
