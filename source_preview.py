"""Render citation evidence from PDF glyphs, without rewriting source text."""
import base64
import difflib
import math
import unicodedata


def _characters(page):
    import pymupdf
    flags = pymupdf.TEXTFLAGS_RAWDICT & ~pymupdf.TEXT_PRESERVE_IMAGES
    text, boxes = [], []
    for block in page.get_text('rawdict', flags=flags, sort=True)['blocks']:
        for line in block.get('lines', []):
            for span in line.get('spans', []):
                for char in span.get('chars', []):
                    for value in _normal(char['c']):
                        text.append(value)
                        boxes.append(pymupdf.Rect(char['bbox']))
    return ''.join(text), boxes


def _normal(text):
    return ''.join(char for char in unicodedata.normalize('NFKC', text).casefold()
                   if not char.isspace() and char not in '\u200b\u00ad\ufeff')


def citation_clip(page, quote):
    """Crop only a confidently located passage; otherwise show the whole page.

    The two extractors may disagree on math glyphs. Match surrounding characters,
    then include neighbouring baselines so large operators and limits stay intact.
    This does not change the stored quote or claim to repair missing Unicode.
    """
    import pymupdf
    target = _normal(quote)
    if len(target) < 20 or page.rotation:
        return page.rect, 'page'
    text, boxes = _characters(page)
    start = text.find(target)
    if start >= 0:
        end = start + len(target)
        if text.find(target, end) >= 0:
            return page.rect, 'page'
    else:
        # Anchor on a long contiguous match, not scattered common words.
        match = difflib.SequenceMatcher(None, target, text).find_longest_match()
        if match.size < max(20, len(target) * .65):
            return page.rect, 'page'
        start = max(0, match.b - match.a)
        end = min(len(text), start + len(target))
        if difflib.SequenceMatcher(None, target, text[start:end]).ratio() < .88:
            return page.rect, 'page'
    clip = pymupdf.Rect()
    for box in boxes[start:end]:
        clip |= box
    if clip.is_empty or clip.is_infinite:
        return page.rect, 'page'
    # Include complete nearby text lines, fraction bars and generous padding for
    # large operators/limits; avoid shrinking a short formula to a full-page width.
    top, bottom = clip.y0 - 28, clip.y1 + 28
    lines = [pymupdf.Rect(line['bbox']) for block in page.get_text('dict')['blocks']
             for line in block.get('lines', [])]
    # A newly included tall formula may reach another baseline beyond the
    # original padding. Close the vertical region over every touched line so
    # no adjacent text is left half-visible at a crop edge.
    for _ in range(len(lines) + 1):
        old_top, old_bottom = top, bottom
        for box in lines:
            if box.y0 < bottom and box.y1 > top:
                clip |= box
        top, bottom = min(top, clip.y0 - 3), max(bottom, clip.y1 + 3)
        if top == old_top and bottom == old_bottom:
            break
    clip = pymupdf.Rect(clip.x0 - 24, top, clip.x1 + 24, bottom) & page.rect
    return clip, 'excerpt' if clip.height < page.rect.height * .9 else 'page'


def render_source(data, page_number, quote=''):
    import pymupdf
    if not data.startswith(b'%PDF-'):
        raise ValueError('Choose a valid PDF file.')
    if type(page_number) is not int or page_number < 1:
        raise ValueError('That PDF page number is not valid.')
    if not isinstance(quote, str) or len(quote) > 4000:
        raise ValueError('The source passage is too long.')
    try:
        document = pymupdf.open(stream=data, filetype='pdf')
    except Exception:
        raise ValueError('Could not read the original PDF.') from None
    with document:
        if document.needs_pass or len(document) > 200 or page_number > len(document):
            raise ValueError('Could not open this PDF page. Check the page number or whether the file needs a password.')
        page = document[page_number - 1]
        clip, mode = citation_clip(page, quote)
        if clip.is_empty or not all(math.isfinite(value) for value in clip) or clip.width < 1 or clip.height < 1:
            raise ValueError('The PDF page size is not valid.')
        # Bound CPU/memory for very large or unusual page sizes.
        scale = min(2.0, 1200 / clip.width, 2200 / clip.height,
                    math.sqrt(2_500_000 / (clip.width * clip.height)))
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip,
                                 colorspace=pymupdf.csRGB, alpha=False)
        return {'image': base64.b64encode(pixmap.tobytes('png')).decode('ascii'),
                'width': pixmap.width, 'height': pixmap.height,
                'page': page_number, 'mode': mode}
