# Final exploratory evaluation

Run date: 16 November 2026. Actual results: [machine-readable summary](final-evaluation-2026-11-16.json).

## Question and method

Can the real PDF-to-quiz path return the requested mixture with traceable source passages, and what problems remain? Three selected lecture excerpts from SDST2601 were evaluated: discrete random variables (13 pages), continuous distributions (14 pages), and distribution properties (12 pages). Cover/administrative pages and student assignments were excluded. Each single-document batch requested two MCQs, two true/false and two short answers; one combined batch requested one of each. Physical input pages map to original lecture pages in the local manifest. This is an exploratory development set, not a held-out test or a learning-outcome study.

All eight batches below called the configured DeepSeek service through the production PDF extraction, source-combination, generation and validation functions. Two prompt variants used the same inputs/settings. The second variant requests complete supporting quotations, varied true/false statements, plausible distractors and applications where supported. No model was trained or fine-tuned. Single runs cannot establish that the prompt change caused the observed difference.

| Batch | Requested | Initial accepted | Revised accepted |
| --- | ---: | ---: | ---: |
| Discrete | 6 | 6 | 6 |
| Continuous | 6 | 5 | 6 |
| Properties | 6 | 6 | 6 |
| Three PDFs combined | 3 | 3 | 3 |
| Total | 21 | 20 | 21 |

Exact requested mixtures were returned in 3/4 initial batches and 4/4 revised batches. Each variant made five provider calls across four batches. Timing remains in the original machine-readable record; it is not used as an evaluation outcome here.

## Content audit and limitations

Every accepted item passed structural and verbatim-source checks by construction. This is not independent evidence of answer correctness. An AI-assisted inspection flagged three initial discrete questions whose quotes stopped before the defining answer/formula. Revised outputs supplied fuller quotations, but one revised MCQ used “finite” as a distractor for “countable”; finite support also suffices for discreteness, so the item is potentially ambiguous. The raw result is retained without silently fixing it. Human review is pending; no independently validated semantic-accuracy percentage is claimed.

The revised result therefore demonstrates a complete workflow, not guaranteed high-quality questions. The checkable improvement target is to replace sufficient-but-nondefining distractors and have members review every selected item. A separate 41-row local review sheet contains both variants, source identities and blank human-review fields. Original course PDFs, derived excerpts and private member contributions are not in this repository; course-material redistribution permission has not been established. The author's own public [math example](../examples/README.md) remains available for independent reproduction.

## Boundary and failure evidence

Five actual local parser cases were checked: non-PDF bytes, blank PDF, image-only scanned PDF, AES-password-protected PDF and 201-page PDF. All now reject with an appropriate explanation. The scan case requests OCR; no OCR is claimed. The AES case initially raised a missing optional crypto-dependency error before `is_encrypted` could be checked. The handler now reports that locked PDFs are unsupported, without adding an unnecessary crypto dependency. See the summary for the observed messages.

An actual lecture formula was extracted with an `R` instead of its integral and split bounds; the original PDF still contains the correct glyph. The app now displays the original page/excerpt rather than guessing a replacement. [Formatting evidence and tests](SOURCE_FORMAT.md) cover this repair.

Live generation also exposed a listening local proxy returning HTTP 403 to HTTPS CONNECT. A preflight before credentials/source submission now bypasses a local proxy refusing the tunnel; direct provider access was verified. Working/remote proxies and redirect protection remain covered by tests. This is distinct from retrying a possibly billable generation after an ambiguous response.

## Follow-up checks, 18–19 November

The [real topic-scope check](topic-boundary-verification.json) used two author-written PDFs for six cases. Covered, paraphrased, blank and second-PDF-supported topics generated questions; unrelated and partly unrelated topics were blocked before question generation. All six matched expectations, using nine provider calls. These are a few development cases, not a general topic-detection accuracy score. [Behaviour and repeat steps](TOPIC_BOUNDARY.md) describe the extra quota and possible misclassification.

A further AI-assisted reread covered all 41 saved lecture questions and recorded 13 revision or clarification proposals. They include incomplete quotations, an ambiguous distractor, missing positive-variance conditions in a standardised Chebyshev statement, and survival explanations that blur strict and non-strict inequalities. Some are wording or evidence issues rather than wrong reference answers. The [public aggregate](content-review-2026-11-19.json) contains no course excerpts. Detailed proposals remain local and never replace the original live results. No independent human review or semantic accuracy percentage is claimed.

For example, when X is constant and k=2, sigma=0 makes the event |X-mu|>=k sigma certain, so the standardised bound of 1/4 cannot apply. Adding sigma>0 is necessary. Likewise, for X=1 and t=1, P(X>t)=0 whereas P(X>=t)=1. These examples show why a matching source quote alone is not sufficient quality assurance.

The [19 November reproduction record](fresh-reproduction-2026-11-19.json) and [test log](fresh-reproduction-2026-11-19.log) verify a new public clone with freshly installed dependencies in a new Windows x64 / Python 3.12 environment: all 69 backend tests and the offline public example passed. No API key or new model call was used. The first clone exposed Windows line-ending conversion of an ASCII-only PDF; `.gitattributes` now preserves its bytes, verified in a second fresh clone. The record lists the source commit and installed transitive versions.

The old boundary summary records the then-current 200-page cap. Current 80-page limits and complete-input checks are recorded separately in [FULL_READING.md](FULL_READING.md); historical logs were kept intact.

## Reproduce

Use the root README for installation/configuration and run `python tools/reproduce_example.py` to check the public saved example without a key. `--live` makes a real, billed provider request. Synthetic unit/browser checks use mocks and must not be described as live model evaluation. A [fresh remote-source record](fresh-reproduction-2026-11-16.json) and [captured test output](fresh-reproduction-2026-11-16.log) verify source snapshot e75bf826: 53 tests and the offline saved-example check passed. The Windows Python runtime and pinned dependencies were reused; a clean dependency installation was not repeated. No API key or live generation was used for this reproduction.

For authorised holders of the original lecture files, `python tools/evaluate_lectures.py --source-dir "PATH_TO_SDST2601"` prepares the same selected pages without calling a model. Add `--live --prompt initial` or `--live --prompt revised` for a paid comparison; choose a separate output directory for each new run. This reproduces the procedure, not identical model wording or guaranteed counts. Outputs default to the ignored `.evaluation-runs/` folder.
