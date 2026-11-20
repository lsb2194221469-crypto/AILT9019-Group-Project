# Lecture Lab project showcase

Public page: https://lsb2194221469-crypto.github.io/AILT9019-Group-Project/

The showcase is a static GitHub Pages site served from `main:/docs`. It introduces the problem, current features, PDF-to-quiz workflow, recorded demonstration, evaluation limits and four team members. It remains separate from the optional live app on the owner's computer. No Python service, model credentials, remote font service or analytics are needed to view the showcase.

## Design and navigation

- Warm paper background, dark green workflow section, coral accents, mint and lilac feature panels.
- System sans-serif body text and Georgia headings, with responsive layouts for phones, tablets and desktops.
- A clear demo overview, readable result notes and keyboard-operated disclosure panels.
- Click a screenshot to enlarge it. Escape or Close returns focus to its link. Without JavaScript, the same link opens the image directly.
- Reduced-motion preferences disable smooth scrolling and transitions.

The entry file is `index.html`; its styles and optional image viewer are in `showcase.css` and `showcase.js`. The existing `.nojekyll` keeps publication buildless.

## Evidence and its limits

The English screenshots in `showcase-2026-11/` were captured using the author's own public `examples/math-notes.pdf` and a simulated provider replay of the saved `examples/expected-output.json` questions. No new live request was made for these screenshots. The original saved response was recorded on 25 October 2026. See `showcase-2026-11/screenshot-record.json`.

The demo section describes PDF selection, question counts, generated questions, reference answers and source passages, followed by refusal when the requested topic is outside the PDF. The final notice requires both YouTube URLs in submission_links.txt. It does not explicitly require a video link or player on the showcase; the earlier teaching clarification lists a demo link as a recommendation. Following the user’s preference, the page uses a text overview without attaching the recording. Existing run screenshots, source links and result records remain available.

The main result panels use `full-reading-verification.json` for 39 pages included in one real request and two accepted questions out of three requested. The current count of 69 backend tests is recorded in `topic-boundary-automated.json` and independently rerun in the fresh-source/dependency check `fresh-reproduction-2026-11-19.json`. The six live scope cases remain a small integration check, not a broad accuracy measure. The earlier prompt comparison is separately dated and explicitly labelled as using the earlier input pipeline. Source-quote matching is not semantic accuracy; independent human content review is still pending.

## Check the page

The source page can be previewed with any static HTTP server rooted at `docs/`. No model call is involved.

For the automated browser check, install Node.js, Playwright and a Chromium browser in a development environment, then run from the repository root:

```sh
node tools/check_showcase.cjs
```

`LECTURE_LAB_PLAYWRIGHT` can identify an existing Playwright module. `LECTURE_LAB_CHROME` can identify an installed Chrome/Chromium executable. On Windows, the script defaults to the usual Chrome location; on other platforms it uses Playwright's bundled Chromium. `LECTURE_LAB_SHOWCASE_QA_DIR` selects where to save screenshots and `verification.json`; otherwise they go into `.showcase-checks/`. Keep that generated directory local.

The check starts a loopback-only static server on port 8777 and closes it on completion. It covers English content, internal anchors and assets, widths 320/390/768/1024/1440, expanded results, keyboard FAQ controls, screenshot focus restoration, the demo overview without attached media, reduced motion, solid-background text contrast and a JavaScript-disabled fallback. It neither reads the app's private configuration nor calls a model. This is a browser check of the showcase, not a new backend or question-quality evaluation.

## Updating and reverting

Publish reviewed page assets to `main:/docs` while preserving the current optional app link in the root README. The two YouTube URLs belong in submission_links.txt. Keep media off the showcase unless the user changes that preference or an explicit course requirement calls for it.

The redesign is isolated in its own Git commit. To undo it later, revert that showcase commit with Git or GitHub's revert flow, preserving later unrelated commits. The app's generation code, saved browser work and API configuration are outside this change.
