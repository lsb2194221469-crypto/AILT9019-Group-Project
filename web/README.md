# Lecture Lab — Render / portable Node edition

This edition retains the Chinese PDF-to-quiz interface, browser PDF parsing, sample practice, scoring, citations and export. It runs on a regular Node HTTP server with no Sites, Cloudflare Workers, Python or local model requirement.

## Render deployment

The GitHub migration branch is `codex/render-online` in `lsb2194221469-crypto/AILT9019-Group-Project`. Application source is in `web/` and the root `render.yaml` selects that directory.

Connect Render to this private GitHub repository, create a Blueprint, and select that branch. Alternatively create a Node Web Service with Root Directory `web`, Build Command `npm ci && npm run build`, Start Command `npm start`, and Health Check Path `/healthz`.

The supplied configuration selects Free so applying it does not intentionally provision paid compute. Free services sleep after 15 idle minutes, take about a minute to wake, and have monthly limits. For an always-awake service, choose a paid compute instance after checking the account's displayed price. Do not describe this as guaranteed always available. See https://render.com/docs/free.

The deployment will return the actual `onrender.com` URL; a service name is not a verified URL. Test it in the owner's browser and network before confirming access. Publishing on Render makes the web service internet-accessible: the old Sites owner-only access setting does not carry over.

## Model configuration

Set `AI_BASE_URL` (HTTPS base, usually ending `/v1`), `AI_MODEL`, and secret `AI_API_KEY` in Render's Environment settings. Never commit credentials. The provider must support bearer authentication, JSON response format and Chat Completions. Until configured, the page reports a pending model and generation returns 503; PDF parsing and the explicitly labelled sample work.

Before distributing a public model-enabled service, use provider spending limits and add suitable access control/rate limits. The current server does not authenticate users or enforce per-user quotas.

PDF files are parsed in browser memory, up to 15 MB / 200 pages. Generation sends selected text (at most 22,000 characters) through the server to the chosen model provider. No PDF or quiz database is provisioned. Provider data retention follows its terms. Scanned documents require OCR.

## Local validation

Node >=22.13: `npm ci`, `npm run build`, `npm test`, `npm start`. Open http://127.0.0.1:3000. The three model variables can be supplied in the process environment. `.env.example` is documentation, not an automatically loaded file.

Tests cover source-quote validation, model input bounds, HTTP routes, source-file isolation, cross-origin rejection, missing-model behavior and a mocked provider response. A real cloud-model call and access from the user's network remain to be validated after deployment.
