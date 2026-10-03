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
