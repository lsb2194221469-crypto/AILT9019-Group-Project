# Lecture Lab project showcase

Public page: https://lsb2194221469-crypto.github.io/AILT9019-Group-Project/

The showcase is a static GitHub Pages site served from `main:/docs`. It introduces the problem, current features, PDF-to-quiz workflow, recorded demonstration, evaluation limits and four team members. It remains separate from the optional live app on the owner's computer. No Python service, model credentials, remote font service or analytics are needed to view the showcase.

## Design and navigation

- Warm paper background, dark green workflow section, coral accents, mint and lilac feature panels.
- System sans-serif body text and Georgia headings, with responsive layouts for phones, tablets and desktops.
- Native video controls and English captions, readable result notes and keyboard-operated disclosure panels.
- Click a screenshot to enlarge it. Escape or Close returns focus to its link. Without JavaScript, the same link opens the image directly.
- Reduced-motion preferences disable smooth scrolling and transitions.

The entry file is `index.html`; its styles and optional image viewer are in `showcase.css` and `showcase.js`. The existing `.nojekyll` keeps publication buildless.

## Evidence and its limits

The English screenshots in `showcase-2026-11/` were captured using the author's own public `examples/math-notes.pdf` and a simulated provider replay of the saved `examples/expected-output.json` questions. No new live request was made for these screenshots. The original saved response was recorded on 25 October 2026. See `showcase-2026-11/screenshot-record.json`.

The embedded MP4 is the real 16 November demo already published in this repository. It uses the earlier Chinese interface and earlier input pipeline, automated browser actions and synthetic English narration. These facts are disclosed next to the player. It is not the four-member final presentation. Final presentation and demo YouTube links still need to be supplied in `submission_links.txt`; embedding this MP4 does not replace that submission requirement.

The main result panels use `full-reading-verification.json` for 39 pages included in one real request and two accepted questions out of three requested. The current count of 69 backend tests is recorded in `topic-boundary-automated.json` and independently rerun in the fresh-source/dependency check `fresh-reproduction-2026-11-19.json`. The six live scope cases remain a small integration check, not a broad accuracy measure. The earlier prompt comparison is separately dated and explicitly labelled as using the earlier input pipeline. Source-quote matching is not semantic accuracy; independent human content review is still pending.

## Check the page

The source page can be previewed with any static HTTP server rooted at `docs/`. No model call is involved.

For the automated browser check, install Node.js, Playwright and a Chromium browser in a development environment, then run from the repository root:

```sh
node tools/check_showcase.cjs
```

`LECTURE_LAB_PLAYWRIGHT` can identify an existing Playwright module. `LECTURE_LAB_CHROME` can identify an installed Chrome/Chromium executable. On Windows, the script defaults to the usual Chrome location; on other platforms it uses Playwright's bundled Chromium. `LECTURE_LAB_SHOWCASE_QA_DIR` selects where to save screenshots and `verification.json`; otherwise they go into `.showcase-checks/`. Keep that generated directory local.

The check starts a loopback-only static server on port 8777 and closes it on completion. It covers English content, internal anchors and assets, widths 320/390/768/1024/1440, expanded results, keyboard FAQ controls, screenshot focus restoration, video playback/captions, reduced motion, solid-background text contrast and a JavaScript-disabled fallback. It neither reads the app's private configuration nor calls a model. This is a browser check of the showcase, not a new backend or question-quality evaluation.

## Updating and reverting

Publish reviewed page assets to `main:/docs` while preserving the current optional app link in the root README. Supply final YouTube URLs only after they are available and verified; do not invent links or claim the existing recording is the team presentation.

The redesign is isolated in its own Git commit. To undo it later, revert that showcase commit with Git or GitHub's revert flow, preserving later unrelated commits. The app's generation code, saved browser work and API configuration are outside this change.
