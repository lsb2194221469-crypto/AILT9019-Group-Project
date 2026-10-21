"""Retain PDF glyph positions as a supplemental reading aid, never a citation."""
import statistics


def layout_text(page):
    import pymupdf
    flags = pymupdf.TEXTFLAGS_RAWDICT & ~pymupdf.TEXT_PRESERVE_IMAGES
    blocks = page.get_text('rawdict', flags=flags, sort=True)['blocks']
    output = []
    for block in blocks:
        for line in block.get('lines', []):
            spans = line.get('spans', [])
            chars = [(c, span) for span in spans for c in span.get('chars', [])]
            if not chars:
                continue
            # Use the main font and baseline of this line; never infer powers
            # from a plain digit such as "x2" without position evidence.
            main_size = max(span['size'] for span in spans)
            main_chars = [(c, s) for c, s in chars if s['size'] >= main_size * .9]
            baseline = statistics.median(c['origin'][1] for c, _ in main_chars)
            parts, group, script = [], [], None
            def flush():
                nonlocal group
                if group:
                    parts.append((script + '{' + ''.join(group) + '}') if script else ''.join(group))
                    group = []
            previous = None
            for char, span in chars:
                glyph = char['c']
                delta = baseline - char['origin'][1]
                small = span['size'] <= main_size * .86
                adjacent = previous is not None and -main_size * .4 <= char['bbox'][0] - previous['bbox'][2] <= main_size * .6
                horizontal = abs(line.get('dir', (1, 0))[1]) < .05
                mode = None
                if horizontal and adjacent and small and glyph.strip():
                    if main_size * .15 < delta < main_size:
                        mode = '^'
                    elif -main_size * .6 < delta < -main_size * .12:
                        mode = '_'
                if mode != script:
                    flush()
                    script = mode
                group.append(glyph)
                previous = char
            flush()
            output.append(''.join(parts))
    return '\n'.join(output)[:16000]


def math_contexts(data):
    import pymupdf
    with pymupdf.open(stream=data, filetype='pdf') as document:
        return {index + 1: layout_text(page) for index, page in enumerate(document)}
