# Mathematical source evidence and feedback

Verified on 16 November 2026. PDF extraction is not faithful mathematical typesetting: an integral may be extracted as `R`, probability as `P r`, and limits, fractions, roots or scripts may be split across lines. Running that string through a formula renderer cannot recover missing glyph identities safely.

The source evidence now renders the original PDF page with PyMuPDF. A confidently matched quotation produces a padded excerpt; ambiguous matches, repeated passages or rotated pages use the full page. The original font glyphs, integral/sum/product signs, bounds, Greek letters, fractions, matrices and letter spacing are preserved as printed in that PDF. This is a visual facsimile, not OCR or a claim that the source itself is mathematically correct.

Citation matching still uses the unchanged extracted text. It is available under a separately collapsed “提取文本（不保留原页排版）” control, not presented as faithful formula typography. Existing quizzes use their browser-stored PDFs, so they do not need paid regeneration to obtain the corrected source view. If the original PDF is unavailable, the app says so; it never guesses that `R` means an integral or substitutes another PDF. Opening the original goes to the cited physical page.

Uploading/previewing and citation expansion render through the same-origin Python service. They do not call DeepSeek. Only the currently opened source is requested, successful previews are cached in browser memory, and image dimensions/cache size are bounded. No new dependency is introduced. Mobile excerpts can scroll horizontally rather than shrinking formulas to unreadable sizes. A failed preview offers retry and the original PDF link.

Question/option/answer/explanation LaTeX now canonicalises explicit named operators such as `Pr`, `\mathrm{P r}` and `\operatorname{V a r}`. Ordinary prose, raw quotations, products such as `P r(x)` and ambiguous `x2` are not rewritten. The generation prompt asks for correctly typeset operators and complete supporting quotations; it skips unresolved source formulas instead of inventing symbols.

Wrong objective answers show an explicit red “回答错误” banner, a red card border, the selected answer and the reference answer. The incorrect selected option also turns red, replacing the neutral green selection styling. The corresponding question number is marked red and labelled for assistive technology. Short answers remain self-assessed and are never automatically marked wrong.

The final crop check also closes the excerpt over every touched text baseline, including lines reached by padding around tall formulas. This avoids showing only the top or bottom of an adjacent line. The original PDF glyphs remain unchanged; additional context is shown when needed.

Checks: `python -m unittest discover -s tests -v`, `node tests/test_math_format.cjs`, `node tests/test_source_preview_browser.cjs` and `node tests/test_study_flow_browser.cjs`. Browser tests use a dummy provider, including legacy lossy quotes, integral limits, multiple PDFs sharing page 1, refresh, mobile, offline failure/retry and the wrong-answer feedback. Screenshots and the browser record are under `source-format-2026-11-16/`.
