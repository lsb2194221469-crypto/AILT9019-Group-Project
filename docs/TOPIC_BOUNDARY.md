# Topic coverage boundary

Lecture Lab checks a non-empty requested topic against all supplied PDFs before requesting questions. It replaces the former prompt-only instruction about not creating official assessments. It does not claim to detect cheating or determine whether a document is an active exam. Other source, file and question checks remain in place.

## Behaviour

- A blank or whitespace-only topic skips the extra check. Questions are made from the uploaded notes as before.
- A non-empty topic triggers a separate model request with every accepted page's complete extracted text, math hints and page image. No pages are selected or shortened.
- Synonyms, translations and simple applications of formulas in the notes are allowed. Coverage can come from more than one PDF.
- All requested parts must be covered. A request combining a covered topic with a clearly unrelated topic is blocked rather than silently narrowed.
- A supported decision must include 1–4 source quotations with valid page IDs and matching raw PDF text. A missing or fabricated quote stops generation. Matching evidence does not prove semantic correctness.
- An unsupported decision stops before the question-generation request. The app shows a red **Topic not covered** alert and asks for a different topic or matching notes. No new quiz is saved; existing quizzes and PDF selections stay available.
- An uncertain, malformed or incomplete decision shows **Topic check could not finish** and stops. A network/account error remains a network/account error. Neither is labelled as confirmed topic mismatch. There is no automatic retry of the paid check.
- Background tasks preserve the error code across polling/reconnection. Retrying the same task ID does not repeat a model call; clicking Make my quiz again creates a new request.

The check itself uses provider quota, including when it refuses a topic. Accepted non-empty topics therefore use at least two model requests: one coverage check and one question request. Actual charges depend on the PDFs and provider. Leave the topic blank to skip the extra scope request; the usual grounding prompt and citation checks still apply.

## A simple demo

Use notes that explain only matrix addition, not probability. Enter **matrix addition** and generate a small quiz. Request **Bayes' theorem and conditional probability** using the same PDF: the red topic warning should appear and no questions should be generated. Then try **adding two tables of numbers entry by entry**, to check that an ordinary paraphrase can pass. The result depends on the model; keep the actual outcome in your recording.

## Verification

Run `python -m unittest discover -s tests -p "test_*.py"`. Topic-specific tests in `tests/test_topic_boundary.py` cover refusal before generation, supported and blank topics, malformed decisions, forged citations, multi-PDF inputs and background/HTTP error propagation. These automated tests use simulated provider responses; they are not live semantic-accuracy measurements.

For browser checks, set `LECTURE_LAB_PLAYWRIGHT` to the installed Playwright module (or install it normally) and run `node tests/test_topic_boundary_browser.cjs`. This uses the local fixture and makes no paid provider requests.

The [recorded live check](topic-boundary-verification.json) passed all six cases: covered, paraphrased, unrelated, partially unrelated, blank topic and coverage supplied by a second PDF. The two unrelated cases made no question-generation request. There were 9 provider requests in this run. The [automated check record](topic-boundary-automated.json) separately records 69 backend tests and browser checks. New public notes are in [examples/topic-boundary](../examples/topic-boundary/).

To repeat the paid six-case check, run `python tools/check_topic_boundary_live.py --live`. Use `--output` to choose a record path; never confuse a saved record with a new live run.

Recorded live checks are listed separately in `topic-boundary-verification.json`. They use author-written synthetic notes and limited individual runs, not a broad accuracy benchmark.

## Limits

Coverage is judged by a model. It can miss a topic or accept an insufficient connection, and can be affected by ambiguous wording or misleading instructions in source material. The system prompt treats document text and user topic as untrusted data; this reduces risk without guaranteeing resistance to every prompt injection. Source quotations are checked in code, but their relevance is not independently proved. This boundary does not certify answer correctness or prohibit all uses of generated questions in assessments.
