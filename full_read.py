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
        raise ValueError(f'本组 PDF 合计最多 {MAX_PAGES} 页。请减少文件或拆分 PDF；本次不会只读取部分页面。')
    selected = [{key: value for key, value in page.items()
                 if key in ('page', 'text', 'math_context', 'source_id', 'source_name', 'source_page')}
                for page in pages]
    size = len(json.dumps(selected, ensure_ascii=False).encode('utf-8'))
    if size > MAX_TEXT_BYTES:
        raise ValueError('本组 PDF 全文超过 300 KB 的文字与公式提示上限。请减少文件或拆分 PDF；没有截断或调用模型。')
    return selected


def page_images(data):
    import pymupdf
    images = {}
    with pymupdf.open(stream=data, filetype='pdf') as document:
        if len(document) > MAX_PAGES:
            raise ValueError(f'每组最多 {MAX_PAGES} 页，请拆分 PDF 后上传。')
        total = 0
        for index, page in enumerate(document):
            edge = max(page.rect.width, page.rect.height)
            if not math.isfinite(edge) or edge <= 0:
                raise ValueError(f'第 {index + 1} 页尺寸无效，请重新导出 PDF。')
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1536 / edge, 1536 / edge), alpha=False)
            encoded = base64.b64encode(pixmap.tobytes('jpeg', jpg_quality=85)).decode('ascii')
            total += len(encoded)
            if total > MAX_REQUEST_BYTES - MAX_TEXT_BYTES - 65536:
                raise ValueError('PDF 整页图像超过请求上限，请拆分 PDF；没有省略页面。')
            images[index + 1] = 'data:image/jpeg;base64,' + encoded
    return images


def user_content(pages, selected, counts, topic):
    overview = json.dumps({'counts': counts, 'topic_filter': topic,
                           'reading_mode': 'all_pages_no_truncation', 'source_pages': selected}, ensure_ascii=False)
    images = [p for p in pages if p.get('image_url')]
    if not images:
        return overview
    if len(images) != len(pages):
        raise ValueError('部分 PDF 页面缺少整页图像，请重新上传全部文件；没有调用模型。')
    content = [{'type': 'text', 'text': overview}]
    for page in pages:
        content.append({'type': 'text', 'text': f"Original PDF page image for citation page ID {page['page']}"})
        content.append({'type': 'image_url', 'image_url': {'url': page['image_url'], 'detail': 'high'}})
    return content


def check_request(payload):
    if len(json.dumps(payload, ensure_ascii=False).encode('utf-8')) > MAX_REQUEST_BYTES:
        raise ValueError('全部 PDF 的整页图像和文字合计超过 32 MB 请求上限。请减少文件或拆分 PDF；没有截断或调用模型。')
