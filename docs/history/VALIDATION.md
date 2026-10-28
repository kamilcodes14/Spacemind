> Latest evidence: [25 October 2026 phase status](REMAINING_PHASES_2026-10-25.md)
> and [real observational checks](../../validation/observational/README.md). Historical
> acceptance below does not imply that new workflows have passed signed-in testing.

# Supabase update validation — 3 October 2026

- 12 research/HTTP tests passed: input validation, forced Web routing, evidence handling, citation warnings, missing keys, bounded requests, authentication, chat ownership, quota and origin rejection.
- All three migrations passed in PGlite/Postgres with pgvector, including two-user isolation, forged ownership rejection, per-account quota, paper retrieval, anonymous denial and cascading deletion. Tests reproduce Supabase function default grants.
- Deno type checks passed for research, account and embed-paper entrypoints. Frontend JavaScript checks and production bundle build passed.
- Migrations applied to the existing Supabase Spacemind project; all five public tables have RLS. All three Edge Functions deployed ACTIVE. Live unauthenticated requests returned 401.
- Supabase security advisors returned no warning-level findings after explicit function permission hardening. One intentional informational finding remains: research_usage has no client policy because quota mutations run only through a bounded private function. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Existing Chroma import dry run identified 3,932 unique text chunks. Corpus import has not run; provider secrets, allowed frontend origin, hosted email settings and frontend deployment remain to configure.
- Browser flow passed using the actual bundled Supabase SDK with mocked HTTP responses: confirmation-required signup, login, research response, reload/history, saved settings, logout and mobile layout; no uncaught JavaScript errors.
- No live AI-provider calls or real email deliveries were tested. No private API keys were committed. The earlier video demonstrates the interface with sample responses.

# Local Python workspace validation

- Nine backend integration/regression tests passed. They cover sign-in/out, password hashing, session expiry and revocation, account isolation, persistence, export, deletion, CSRF rejection, rate limiting, missing-service errors, web-mode routing, and short astronomy queries.
- Desktop (1440 × 1000) and mobile (390 × 844) browser checks passed for sign-up, a two-turn conversation, reload/resume, rename/pin, saved settings, password change, export, logout/login, failure/retry controls, and chat/account deletion.
- No uncaught JavaScript errors occurred during the browser flow. The checked mobile layouts had no horizontal page overflow.
- JavaScript syntax checks and Python compilation passed.
- Model inference in tests used an explicit test fixture. Live Groq/Ollama and Tavily calls were not tested with production credentials. The supplied paper index and ingestion implementation were retained.
- The accompanying demo is an interface walkthrough using a sample account and sample response. No external account was created and no research answer is presented as a live model result.

These checks refer to the optional Python backend and the earlier interface demo, not a live Supabase end-to-end test.

## Social sign-in update (2026-10-03)

- Static build and JavaScript syntax checks passed.
- Actual bundled Supabase SDK tested in Chromium with mocked provider/Auth responses: Google and Apple PKCE challenge generation, code exchange, callback URL cleanup, persisted sessions after reload, disabled-provider feedback, cancelled callback, missing-verifier callback, confirmation signup, resend, password login, research, history, settings and logout passed.
- Desktop (1280 px) and mobile (390 px) screenshots reviewed; both provider buttons are visible, mobile has no horizontal overflow, and no page JavaScript errors occurred.
- Read-only check of live public Auth settings confirmed Google and Apple are disabled; email confirmations are enabled. Live provider login and email delivery are not verified. Enable the OAuth providers as described in docs/SUPABASE_SETUP.md before live acceptance testing.
- No database permissions, RLS policies, provider secrets, or hosted Auth settings were changed by this update.

## OAuth callback repair (2026-10-03)

- Replaced implicit SDK callback detection with one explicit, awaited PKCE code exchange before loading the user profile. PKCE verification remains enabled. Successful and failed callback parameters are removed from the address bar.
- Kept provider buttons disabled while navigating to prevent repeated taps from overwriting the pending verifier; returning with browser Back restores the buttons.
- Added a browser-storage preflight and distinct safe error identifiers for callback failures; no auth tokens or provider error descriptions are displayed.
- Static build and syntax checks passed. `tests/supabase/oauth-callback.cjs` executes the bundled SDK in a simulated browser with mocked Auth responses and checks one exchange, persisted session, logout, missing verifier, cancellation, blocked storage, rejected/incomplete responses, and password recovery.
- Run this regression with `SUPABASE_URL=https://example.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_test npm run build`, then `node tests/supabase/oauth-callback.cjs`. Rebuild with deployment settings before deployment.
- The local Chromium process could not launch in this execution environment (SIGSEGV); this update has not been visually retested or verified through the user's live Safari/Google account. Server logs show completed provider callbacks and one successful token response; the exact cause of the user's earlier generic error remains unconfirmed.

## Research browser connection repair (2026-10-04 PKT)

- Live function logs identified OPTIONS 403 responses before any AI request. The shared CORS allowlist now includes the exact production frontend origin without depending on an additional secret; configured origins are preserved.
- All 13 research unit tests passed, including a regression for production preflight without origin configuration and continued denial of unrelated origins and unauthenticated requests.
- Deployed the research function as version 4 with JWT verification enabled. Live HTTP checks: production preflight 204 with the exact allowed origin; unrelated-origin preflight 403; missing-auth POST 401.
- No provider keys, RLS policies, or authentication checks were removed. A complete answer through the user's authenticated session still needs live verification.

## Natural conversation update (2026-10-04 PKT)

- Common standalone greetings, informal check-ins (including `how r you`), thanks and goodbyes receive direct replies without search or model calls in any mode.
- Auto mode now routes broader casual conversation and everyday help to a natural answer using recent chat context. Astronomy facts and research follow-ups continue through source retrieval and citation checks. Explicit web/papers research modes remain research-oriented beyond basic pleasantries.
- Removed the 512-token reasoning bottleneck in follow-up rewriting. GPT-OSS requests use low reasoning effort, exclude reasoning from the response, and reserve at least 2,048 completion tokens. Truncated output gets one bounded retry; failed optional query rewriting uses the original question.
- All 20 research unit tests passed with mocked provider responses, covering shorthand, context-aware chat routing, research follow-ups, mixed greeting/research prompts, token exhaustion, bounded retries, and custom model compatibility. Auto mode displays a neutral Thinking status.
- Provider-generated conversational quality and live model output still need verification through an authenticated session; mocked tests do not establish live model quality.

## User-facing failure messages (2026-10-04 PKT)

- Removed provider names and key/setup instructions from research errors and warnings. Safe diagnostic event identifiers are written to backend logs without prompts, credentials or raw provider responses.
- Saved legacy warnings are translated in the frontend into a single reader-facing notice. Evidence uncertainty remains visible; duplicate citation/limited-evidence notices no longer stack.
- Added exact casual acknowledgement variants such as `ok perfect thanks`, without matching greetings followed by research questions.
- All 22 research tests, the static build, and legacy-notice translation checks passed. Browser rendering was not retested in this environment.

## Tier 2 citation exports — 11 October 2026 UTC

- Added BibTeX and plain-text APA draft downloads to the Sources section for new and saved research answers. Duplicate retrieval chunks are collapsed, tool records are excluded, unsafe source URLs are omitted, and missing publication fields are not invented.
- All 57 Node tests passed, including six citation-export cases covering escaping, deduplication, missing metadata, APA ordering/long author lists and the download lifecycle. Syntax checks and the static production build passed with explicit placeholder Supabase configuration; that build is for verification only and is not deployed.
- No database migration, provider call or authentication change is required for this increment. Browser rendering and live downloads have not been verified in this environment. APA output is labelled as a draft because family-name parsing, missing publication details and final typography need review.
- Tier 1 is still awaiting complete corpus-import confirmation and a live signed-in end-to-end research test; these unit tests do not close that release gate.

## Tiers 2–4 checkpoint — 12 October 2026

- 70 Node tests pass; local database tests pass private paper/collection/note ownership, restrictive feedback policy, forged ownership rejection and internal table/function denial. Syntax checks and build pass; build uses explicit placeholder configuration, not deployable production credentials.
- 50 offline fixtures validated, including 20 independent numeric regressions. This is not a live model score.
- Five new recipes executed with actual local NumPy/SciPy/Astropy/Matplotlib; injected three-day transit recovered within 0.03 day. PDF parser extracted the known text/table values from a two-page synthetic fixture. These do not establish browser-worker acceptance.
- Six production migration content hashes equal local files; version filenames reconciled to live history. Four deployed research/discovery/science/digest functions are ACTIVE. Digest job authenticated through Vault returned HTTP 200, 100 abstracts, zero matching alerts; both cron jobs active.
- Real sign-in blocked by Google OAuth 502 connection refusal. Fresh target tab remained signed out. No real-session RLS success claimed.
- Full original corpus import incomplete: local dry-run 3,932 unique chunks, live original-corpus rows 2,400 plus 152 additional embedded abstracts before digest run. Operator import token unavailable.
- Frontend release/env verification blocked by Vercel scope access 403. Recipes/exports browser acceptance and hard-refresh release check remain pending.
- Deployed-stack live eval runner prepared, not executed. Timestamped reports retain scores, citations, errors and latency for later comparisons; respects normal auth, RLS and quotas. No baseline was captured before this backend deployment; do not invent one.

## Evaluation harness v2 — 24 October 2026
- Replaced keyword-only grading with reference answers and per-dimension rubrics; added `evals/space-questions-v2.json` (50 questions), `scripts/eval-rubric.mjs`, `scripts/eval-review.mjs` and 13 grader tests (88/88 repository tests pass, including a citation-splitting bug found by the self-consistency test). See `docs/EVALUATION.md`.
- Live read-only checks (Supabase project aqblctjucyxqjmylojgc): Edge Functions research v13, account v4, embed-paper v6, space-data v4, paper-discovery v4, daily-digest v2 are ACTIVE; zero evaluation conversations exist; `paper_chunks` holds 4,732 rows (30 full-text arXiv documents, 6 full-text NTRS documents, 622 arXiv and 15 NTRS abstract documents); 4,187 rows are embedded and 545 abstract rows are lexical-only.
- **No live baseline exists.** The deployed-stack run did not execute (no test-account credentials; sandbox cannot reach the deployed hosts). No result is claimed.

## Phase 2 retrieval and evidence — 24 October 2026 (implemented and tested locally; NOT deployed)
- Evidence on the production corpus (read-only SQL): all 30 full-text arXiv papers also exist as abstract records; 31 canonical arXiv ids appear more than once. With embeddings unavailable, the deployed keyword search returned 0 chunks for 5 of 6 natural-language paper questions (1 for the sixth) because it requires every query term. The new function returned the expected paper at rank 1 for all six (6-question sample written by the maintainer; keyword component only, since embeddings cannot be computed outside the Edge runtime; semantic ranking is unchanged).
- Migration `20261024000000_phase2_retrieval.sql`: strict AND + relaxed OR keyword lists + semantic list fused by RRF; per-paper cap on canonical arXiv id; full text preferred on ties at every ranking step. Same signature and columns, so research and paper-discovery are unaffected. PGlite tests cover relaxed recall, canonical cap, tie-break, stop-word-only queries, permissions.
- `_shared/evidence-quality.js`: source classification (full text / abstract / web / uploaded PDF / computed; "preprint" only for arXiv, never "published"), canonical identity, near-duplicate removal that keeps distinct passages, paper-first ordering with a relevance floor, evidence coverage with explicit warnings (abstract-only, no paper evidence, uncovered query terms, single-document), supporting-passage links (text-fragment links for web and abstract pages, page numbers for uploaded PDFs only), and a numeric guard that downgrades "supported" claims whose numbers are absent from the cited excerpt. Mutation checks confirmed the tests fail when the guard or the ordering is removed.
- UI: source cards show the evidence label, supporting quotes show an "Open at passage" or "Open source" link and a page for uploaded PDFs, the Sources section shows a one-line coverage summary, and claim labels distinguish numeric-guard downgrades.
- 104 Node tests and the database suite pass; syntax checks and a placeholder-configuration build pass. Not verified: live behaviour after deployment, browser rendering, or the effect on answer quality (the Phase 1 live baseline does not exist yet).
- Known limits: corpus full-text chunks carry no page numbers (the schema has no page column), so only uploaded PDFs show pages; text-fragment links depend on browser support and on the quote appearing verbatim on the target page; 545 abstract records remain unembedded (keyword-only) until the operator import/embedding step runs; the numeric guard checks only digits, not units or meaning.

## Independent patch review follow-up — 24 October 2026

The two preceding contributed entries describe the patch author's checks; their live
corpus counts and six-query findings were not independently reproduced here. Do not
interpret them as a deployed 50-question baseline. Independent review reproduced 104
original combined tests, found four gaps despite those passes, and added fixes and
Phase 3 extraction work. Now 119 tests, database suite, syntax/build and actual PDF parser
checks pass. Research v14 and retrieval migration are deployed; signed-in acceptance
remains open. See docs/history/RESEARCH_REVIEW_2026-10-24.md for exact before/after SQL evidence,
limitations and the independent evaluation protocol. No phase is declared fully complete.
