# Validation record — 20 October 2026

Environment: Python 3.13, pypdf 6.21.1, Node.js.

Passed:

- Seven Python unit tests: valid quote acceptance; fabricated quote and page rejection; duplicate and invalid answer rejection; MCQ option/answer constraints; blank/invalid PDF rejection; mocked local model generation; insufficient-source failure without sample fallback.
- `node --check static/app.js`.
- HTTP 200 for the HTML, JavaScript, CSS, model discovery and sample endpoints.
- A real local text PDF uploaded successfully and returned readable page text.
- Missing model selection returned HTTP 400.
- A cross-origin upload request returned HTTP 403.

Not yet verified:

- Browser rendering, responsive layout and full browser interaction (no browser runtime available in the execution environment).
- Live Ollama question generation (no running installed model was found).
- Three lecture PDFs / 12-question human evaluation against team-written answer keys.
- Independent setup on a teammate's Windows computer.

Automated quote checks establish text provenance, not semantic accuracy. Do not describe the sample fixture or mocked model test as live AI-generation evidence.
