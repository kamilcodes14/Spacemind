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
