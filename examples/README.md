# Reproduce the assessed PDF-to-quiz workflow

This directory supplies a real PDF input and a recorded live-provider output for checking the core path. The PDF is original synthetic material written for this project; it contains no personal data. It is separate from the app's prewritten sample quiz.

## Input and expected result

- Input: [`math-notes.pdf`](math-notes.pdf), two pages about squares, derivatives and Bernoulli variables. [`source-notes.txt`](source-notes.txt) makes the facts readable without a PDF viewer.
- Settings: **1 multiple-choice, 1 true/false and 1 short-answer question**, with no topic filter.
- Expected: three questions, `sample: false`, actual counts `mcq=1, tf=1, short=1`, and citations to `math-notes.pdf` at physical pages 1 or 2. Each quoted passage must occur on the cited page.
- Reference: [`expected-output.json`](expected-output.json), recorded from a real configured DeepSeek request on 25 October 2026. It includes the input SHA-256, model, time and generated result, without credentials.

The recorded answers can be checked directly against the PDF:

| Recorded question | Expected answer | PDF source |
| --- | --- | --- |
| For f(x) = x squared, what is f'(3)? | 6 | Page 1: f'(x) = 2x, so f'(3) = 6 |
| At p = 0.25, is the Bernoulli variance 0.1875? | True | Page 2: p(1-p) = 0.25 × 0.75 = 0.1875 |
| What values can a Bernoulli variable take? | 0 and 1 | Page 2 states those two values |

Fresh model runs may phrase different questions or choose different supported facts. Compare counts, source identity, quotes and mathematical correctness rather than demanding identical wording. A changed provider, unavailable service or invalid output can cause a live run to fail; the saved result remains independently inspectable.

## Browser reproduction

1. Download `math-notes.pdf` from this folder.
2. Open the public application using the link at the top of the repository README, or follow the root README to run the source locally. The public link uses the project host's API; an independently hosted copy needs its own valid provider configuration.
3. Upload this PDF, set each of the three sliders to **1**, leave the topic empty and generate. Use the upload workflow, rather than the prewritten sample button.
4. Confirm that three questions appear with one of each type. Inspect the source filename, page and quoted passage, then compare the answers with the facts above.
5. Answer the questions and refresh. The saved quiz and answer state should remain in the same browser and origin. Generating a second set should add another quiz without replacing the first.

The host must be running for the public link. Local source setup requires Python 3.11+, the pinned requirements and a valid API configuration as described in the root README.

## Saved-output check without an API key

After installing the root `requirements.txt`, run from the repository root:

```sh
python tools/reproduce_example.py
```

Expected: exit code **0**, `passed: true`, `mode: "offline saved-output check"`, `input_pages: 2`, `questions: 3`, and counts of one per type. This extracts the committed PDF and validates the committed output's structure and source quotes. It does not call a model, generate new questions or independently establish semantic correctness; use the source-fact table above for that check.

## Generate again through the real provider

Configure your local `config.json` as described in the root README, then run:

```sh
python tools/reproduce_example.py --live --output .example-runs/latest.json
```

This calls the configured API and consumes its quota. Expected: exit code **0**, `mode: "live API"`, `api_called: true`, and the same counts and source-check results. The output is saved separately; the committed reference is protected against accidental overwrite. This CLI uses the production PDF extraction, source combination, generation and validation functions. The browser steps additionally exercise the UI and browser persistence.

Evidence for the checked run is in [`docs/MIDTERM_REPRODUCTION_CHECK.json`](../docs/MIDTERM_REPRODUCTION_CHECK.json). It covers one small, readable PDF; it is not a broad question-quality benchmark.
