# SpaceMind tier progress

Source: user-provided SpaceMind review and roadmap, 9 October 2026.

## Tier 1 — trustworthy answers (complete; production acceptance verified 18 October 2026 PKT)

- Expanded corpus collection: existing full text plus explicitly labelled arXiv and NASA NTRS abstracts. Requested categories: astro-ph.SR, CO, EP, HE.
- New `match_papers_hybrid` RPC combines lexical and semantic ranks with RRF (k=60), caps candidates, and limits chunks per document. No fixed similarity cutoff.
- Re-ranking uses Cohere when configured, otherwise an independent relevance-grading pass through the existing model. Failure retains retrieval order and reports a limitation. No new paid service is required.
- A separate claim verification pass checks cited sentences against only their cited snippets. Returned quotes must be exact normalized substrings; missing, invalid, partial or unsupported checks cannot produce a confident result. This is automated assistance, not a guarantee of correctness.
- Sources display title, authors, year when provided by the archive, arXiv ID, highlighted quotes and expandable excerpts. Verification results persist with citations.
- SSE carries genuine provider answer deltas, stage updates and final verified/saved results. Draft text is visibly provisional. Truncated or failed streams are errors; they are never presented as saved answers.

Validation: run `npm test`, `npm run test:db`, `npm run check`, and a configured `npm run build`. A live signed-in research request must still verify the complete UI → API → database → provider → UI flow before marking this tier complete.

## Tier 2 — research assistant (backend deployed; frontend release pending)

Implemented PDF text extraction with page citations, selected-paper chat/summary/comparison/literature/open-problems/equations/tables, BibTeX/APA exports, private collections and paper/chat notes, citation relationships and related papers, topic subscriptions and an in-app daily digest. Additional fixed astronomy archive adapters are included. ADS requires its optional provider token. Scanned PDFs need OCR outside this version; equation/table extraction depends on PDF text quality and selected-page coverage is explicitly bounded.

Production migrations match all six local SQL files by content hash. Version filenames now match live migration history. Supabase Edge Functions research v9, space-data v2, paper-discovery v1 and daily-digest v1 are ACTIVE. The digest authenticated job returned HTTP 200 and processed 100 abstracts; the cron runs at 07:15 Asia/Karachi. Digest records are lexical-only until separately embedded. The feed is limited to the first 100 newest papers, not exhaustive.

## Tier 3 — Mission Lab (implemented; browser acceptance and release pending)

Delta-v budget, existing rocket equation, light curves, transit search, Gaia HR diagrams and simplified orbital decay; attach executed code/output to chat; PNG/CSV and Jupyter notebook exports/import. Actual local Python execution passed synthetic numerical checks for all five new recipes. Browser/Pyodide execution and download acceptance remain open; local Python is not a substitute.

## Tier 4 — infrastructure (implemented; deployed-stack evaluation pending)

Small/large model routing and bounded fallbacks, public provider cache and global ephemeris lease, privacy-limited metrics and answer feedback, 50-question evaluation fixtures, CI and untracking local vector binaries. Existing Git history is not rewritten. Optional external fallback providers require configuration.

`npm run eval:live` now targets the deployed research API using a normal dedicated test account, preserves quota, checks answer persistence through RLS, and records answers, sources, scores, errors and p50/p95 latency in timestamped reports. No live score or before/after comparison exists yet. The direct-model diagnostic is separately available as `node scripts/evaluate.mjs --model-only`.

## Release gates — 12 October 2026

1. Backend deployment and migration-history parity: verified through the native Supabase deployment API (no duplicate CLI deployment needed).
2. Tier 1 import and real-session acceptance: OPEN. Original local corpus dry-run is 3,932 chunks versus 2,400 original-corpus chunks in production; 152 additional abstracts were embedded before the new digest. Missing import operator token prevents completion. Google sign-in from the verification browser reached a 502 connection-refused page; a fresh app tab remained signed out. Local two-user RLS tests pass, but a real-session read/write test is still required.
3. One frontend release for Tiers 2 and 3: OPEN. Vercel project access returned 403 for scope syed-kamil. Environment values and the release cannot be verified until the connection is reauthorized. Browser recipe/export acceptance must precede the production release, followed by Ctrl+Shift+R verification. Placeholder build artifacts are test-only and must never be deployed.
4. Tier 4 live evaluation: WAITING on the above gates. Use a confirmed dedicated test account via protected EVAL_EMAIL/EVAL_PASSWORD plus SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY. Existing 30/hour quota remains in place; a full run can span two hourly windows. CI stores reports as artifacts for comparison. It retains labeled evaluation conversations in the test account for audit; it never reads unrelated conversations.

No tier is marked fully released until its acceptance gates pass.

## 13 October follow-up

Vercel access restored. Production and combined preview bundles point to the intended Supabase project; their publishable keys were accepted by Auth settings. User reports no errors during mobile preview testing, without specifying each workflow tested. This is user-reported smoke-test evidence, not full acceptance.

A full-corpus workflow now restores the original text database from immutable revision bf6e16c4b39f18322c5b1369abc4896d247d68f0, checks 3,932 unique chunks, refreshes bibliographic metadata, and invokes the authenticated idempotent importer. It can run manually after registration on the default branch, or by adding run-full-corpus-import to this same-repository PR after all three repository secrets are configured. Existing vector data is never copied into Supabase. No successful full import is claimed.

Import-token rotation requires the owner to save one matching random value (at least 32 characters) in Supabase Edge Function secrets and GitHub Actions secrets. Current connectors have no secret-write operation. Browser credential changes require user handoff; do not embed tokens in source or weaken endpoint authentication.

## 16 October verification and blocked release

- Production corpus read-only verification: 3,670 arXiv + 262 NTRS full-text chunks (3,932 original chunks), all embedded. Total 4,432 rows; 4,187 embedded. The 245 unembedded arXiv abstracts remain lexical-only.
- Fresh local validation: 72 tests pass, database ownership/RLS tests pass, 50 offline fixtures pass (20 numerical checks); configured frontend build succeeds against the intended Supabase project. These are not a live model evaluation.
- Research v11 is ACTIVE with the exact first-party stable branch alias allowed. Live OPTIONS from that alias returns 204 and the matching CORS origin; unrelated.vercel.app returns 403. JWT verification remains enabled. No wildcard origin was added.
- Matching space-data and paper-discovery deployments were rejected by automatic approval review. Both still return 403 to the stable preview. No alternate deployment route was attempted.
- Local commit 04f5062 contains the allowlist change and regression test. Git push was rejected by automatic approval review; the branch update is not confirmed remote.
- Fresh acceptance browser is signed out. Full Explain result behavior and live 50-question evaluation have not been rerun. Dedicated evaluation credentials are not confirmed available.
- Production frontend release remains pending. No entire tier is marked complete.

Next approval needed: push the prepared fix to kamilcodes14/Spacemind branch codex/tier2-citation-exports and deploy the exact preview-origin change to space-data and paper-discovery in project aqblctjucyxqjmylojgc. Preserve JWT authentication and all other deployed source. Then restore a signed-in acceptance session, run remaining workflows/live evaluation, and resolve production-release approval separately from preview testing.

## 16 October approved follow-up

User explicitly approved pushing the prepared branch changes and deploying the exact stable-preview origin to space-data and paper-discovery. Both deployments succeeded: space-data v4 and paper-discovery v3 are ACTIVE with verify_jwt=true. Research remains v11. Standard git push had no HTTPS credentials; the authorized GitHub connector is used to publish the reviewed three-file change. Signed-in acceptance, the live evaluation, and final production frontend release remain pending.

## 16 October live acceptance follow-up

- Approved CORS changes are published in commit 39cbab1. The prior approval-review blocks are resolved.
- Real Google-authenticated browser session: Python mission budget ran successfully (2,585 m/s required; 2,875.4376 m/s available); Explain result persisted and reopened. Research v12 corrects final-mass interpretation and preserves document/page identity in evidence. Its live explanation retest correctly distinguished dry mass from dry mass plus remaining propellant.
- Uploaded synthetic paper summary returned its 3-day period with citations. Private collection and notes persisted. Page-count wording was corrected in model evidence context; the revised summary wording still needs live acceptance.
- NASA Exoplanet Archive returned live catalogue rows, including Kepler-22 b, through the signed-in preview. CSV/result download controls are present; download contents are not yet verified.
- Semantic Scholar returned a provider outage/rate-limit error. Paper-discovery v4 now falls back to authenticated imported-corpus search with explicit source warning; it does not fabricate citation-graph edges. Frontend now displays that warning and prevents stale tab responses from replacing a newly selected paper-library view.
- 75 automated tests pass; configured frontend build succeeds. The 50 offline fixtures are not a completed live evaluation.
- Remaining gates: complete export and remaining paper-workflow browser acceptance; dedicated-account 50-question live evaluation (credentials not confirmed); final production frontend release approval. No full tier is declared released on partial acceptance evidence.


## 17 October signed-in acceptance

Google-authenticated preview checks passed: archive outage fallback returns imported papers with an explicit non-live warning; private paper/collection/notes persist; the revised summary treats its two cited pages as one synthetic fixture. BibTeX and APA downloads contain one deduplicated reference with missing metadata left unspecified. Browser mission-budget CSV contains 2,585 m/s required, 2,875.4376018347784 m/s available, and 5,612.122654799894 kg propellant. Exported notebook validates as nbformat 4, includes code/output, and reopens in SpaceMind. Browser BLS recovered 3.0010005002501248 days from a synthetic 3-day signal (depth 0.01934012118762932; duration 0.1 days). PNG plot download is valid. This synthetic acceptance is not scientific validation on observational data.

The 50-question live evaluation remains unrun: no dedicated EVAL_EMAIL/EVAL_PASSWORD is configured in this runtime, and protected CI credential availability is unconfirmed. Additional paper comparison/extraction workflows and remaining recipe acceptance are still open. Production frontend release remains pending. Latest application commit 031246a passed GitHub validation and its Vercel preview is READY.


## 18 October Tier 1 production acceptance — COMPLETE

Tier 1 acceptance is closed on the existing production frontend https://spacemind-frontend.vercel.app/ (Vercel deployment dpl_4K15y9cYzddFRY56CoxZ915gBiPe, main commit bf6e16c4b39f18322c5b1369abc4896d247d68f0), with the currently deployed research backend. No combined Tiers 2–4 release is implied.

- Read-only corpus verification: 3,670 arXiv and 262 NTRS original chunks, all 3,932 embedded. Total 4,432 rows, 4,187 embedded; 245 supplemental abstracts remain lexical-only.
- Real Google-authenticated production UI request in Papers only mode completed retrieval, ranking, answer generation, claim checks, and persistence. The indexed halo-based intrinsic-alignment paper was returned first with rerank_score 0.95, author/year/arXiv metadata and exact supporting quotes. Saved acceptance message 42 contains the 1,044-character answer and eight retrieval-source records. Three cited claims were supported and one remained unverified; the UI retained its uncertainty notice and confident=false.
- Negative coverage check on Enceladus explicitly stated that supplied evidence was insufficient instead of inventing evidence; saved message 41 has confident=false and used_web=false.
- After a new sign-in/session, the production history reopened message 42 with the same answer, references, highlighted supporting quotations, and unverified-claim warning. This confirms the real UI-to-provider-to-database-to-UI path and authenticated history readback.
- Ownership policies on chats/messages remain authenticated-user scoped with auth.uid() in USING and WITH CHECK; no auth/RLS changes were made.

This is Tier 1 functional acceptance, not a general scientific-accuracy score. Corpus coverage is limited; unrelated retrieval candidates may remain in the source list, and automated claim checking can leave claims unverified. The Tier 4 50-question live evaluation and remaining Tiers 2–3 acceptance/release work remain open. Earlier dated OPEN statements above are historical and superseded for Tier 1 by this entry.
