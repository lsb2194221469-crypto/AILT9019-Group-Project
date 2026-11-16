# Complete PDF input

Every accepted document contributes every physical page. pypdf text and positional math hints are retained without character slicing. Each page is rendered as a JPEG with a 1536-pixel longest edge and included in the same model request as its complete extracted text. Source IDs and physical page IDs are retained. Topic preferences never select or remove pages.

Limits: 10 PDFs, 15 MB per PDF, 80 pages across the group, 300,000 UTF-8 bytes for serialized source text/metadata/math hints, and 32 MiB for the serialized request. Exceeding a limit raises an explicit error before a model call. Native text is required for checkable verbatim citations; image-only documents require OCR first. Page images may resolve diagrams or lost glyphs but do not replace quote validation against extracted text.

The current owner configuration uses deepseek-flash. Official image input format and provider limits: https://api-docs.deepseek.com/guides/vision/ . No page selection, summarisation or text-only fallback is used after rejection. Page submission is measurable; a model's perfect comprehension is not guaranteed.

Regression checks cover long-page tails beyond the former 16,000-character cap, short pages, blank pages, all page images, topic independence, more than 22,000 total characters, and page/text/image limits without provider calls. Run `python -m unittest discover -s tests -p "test_*.py"`.
