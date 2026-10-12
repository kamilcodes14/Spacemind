# SpaceMind tier progress

Source: user-provided SpaceMind review and roadmap, 9 October 2026.

## Tier 1 — trustworthy answers (implementation complete; release verification pending)

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
