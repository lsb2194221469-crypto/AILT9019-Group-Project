# Lecture Lab / AILT9019 Group 61

Local lecture-to-quiz prototype: upload a PDF, extract text with page numbers, generate a quiz through a local Ollama model, answer questions, and inspect reference answers and verbatim source passages.

## Run on Windows

Install Python 3.11+ and double-click `start.bat`. Open http://127.0.0.1:8765 after the server prints its startup message. The first launch downloads the Python dependency; subsequent document processing is local. Close the server window to stop the app and clear its in-memory documents.

Manual setup (Windows PowerShell):

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe server.py
```

On macOS/Linux use `python3 -m venv .venv`, `.venv/bin/python -m pip install -r requirements.txt`, then `.venv/bin/python server.py`.

## Connect a local model

Install [Ollama](https://ollama.com), start it, and install a text model that fits your hardware, for example `ollama pull qwen2.5:3b`. Model download requires internet and disk space. Refresh the model selector in the app. Model calls go only to `127.0.0.1:11434`; the app has no cloud API fallback. The integration uses the [official Ollama chat API](https://github.com/ollama/ollama/blob/main/docs/api.md).

Without Ollama, click **体验示例测验**. This is a clearly labelled pre-generated fixture supported by `sample-notes.txt`, not AI output from an uploaded document.

## Main features

- PDF selection or drag-and-drop, page preview, replacement, readable-text validation.
- Multiple choice, true/false, or short-answer questions; 1–12 items; optional keyword topic filter.
- Installed model discovery, loading/error states, safe failure if no supported questions are returned.
- Independent answering, objective scoring, short-answer self-review, explanations and expandable source quotes.
- Quiz export as JSON; no persistent upload storage, account or paid API key.
- Responsive Chinese interface; generated questions follow the source language.

## Reproduce the core workflow

1. Run the server and connect an installed local model.
2. Upload a text-based lecture PDF, verify extracted text in the page preview.
3. Select a type and count (start with 2–4), optionally enter topic keywords, then generate.
4. Expected: questions containing answers, explanations, page numbers and passages that match the extracted text. Fewer questions may be returned when some fail validation. No sample replaces a failed generation.
5. Answer every question, submit, and expand the source passage. Short answers are self-reviewed, not automatically graded.

For a reproducible input without distributing course PDFs, print `sample-notes.txt` to PDF locally. Real-model output is nondeterministic and requires manual content review. For a deterministic UI walkthrough, use the sample button: choose “带有标签的数据”, choose “False”, and write a short definition of overfitting. Expected objective result: **2 / 2**, with one self-reviewed short answer.

## Verification

```powershell
python -m unittest discover -s tests -v
node --check static/app.js
```

Tests cover source provenance, incorrect page/quote rejection, duplicate questions, MCQ structure, unreadable PDFs, local-model response handling and insufficient-material failure. The model call is mocked in automated tests. A live Ollama generation and the proposal's 12-question human evaluation over three course PDFs must be completed separately.

## Scope and limitations

- Only personal study practice. No assignment grading or official assessment workflow.
- Text extraction only: scanned documents need OCR; tables, formulae and diagrams may be incomplete.
- At most 200 pages / 15 MB per upload; up to 10 documents in server memory; no disk upload persistence.
- Context uses at most 22,000 characters and 4,000 per selected page. Keyword ranking is a simple baseline; coverage is not guaranteed. Source preview shows the retained text (up to 16,000 characters per page).
- Quote matching verifies provenance, **not answer correctness**. The model can still misunderstand a passage. Users must review answers against sources.
- The prompt treats documents and topic fields as data and asks the model to skip unsupported material. This reduces risk but does not prove resistance to prompt injection. Adversarial testing remains outstanding.
- “Local” describes the app's endpoint routing. Use a locally installed model and inspect your Ollama configuration independently.
- No semantic topic refusal classifier, saved sessions, wrong-answer history or PDF visual page viewer in this first version.

## Next milestones

Before the 26 October midterm: run on a teammate's machine, evaluate 12 questions against three lecture PDFs and team-written keys, record a one-minute walkthrough, then fill the one-page status sheet with actual evidence, blockers, owners and three dated milestones. Team members must supply their own genuine contribution records.
