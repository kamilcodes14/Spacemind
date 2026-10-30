# Current status — 29 October 2026

Supported hosted stack: Supabase + Vercel. [Legacy boundaries](../LEGACY.md).

This work completed readability, supported-stack documentation, retrieval benchmark scaffolding and a narrow numeric catalogue verifier. The original work did not advance the seven-phase acceptance programme. A subsequent authorized browser acceptance session verified the specific paths recorded below; no whole phase is declared complete. Existing scientific and deployment caveats remain in the historical records.

- Local regression execution: measured, 136 passing Node tests; syntax, PGlite database suite and test-config build pass. This measures software regression results, not scientific accuracy.
- Benchmark: implemented-not-measured. No reviewed dataset or retrieval scores. Example BM25 execution has no gold; dense/hybrid arms skip without embeddings. [Dataset card](../benchmarks/retrieval/DATASET_CARD.md).
- Catalogue: implemented-not-measured. One bounded, cached NASA TAP lookup, conservative name/number grammar, explicit uncertainty limits. Browser rendering and live acceptance not verified. [Verifier limits](CATALOGUE_VERIFIER.md).
- Live 50-answer evaluation: not done; no new baseline, gold labels or before/after quality figures. [Protocol](EVALUATION_PROTOCOL.md).
- Signed-in acceptance: Google login, browser Python budget/Hohmann execution, notebook round-trip, saved calculation readback, session reload and a deployed NASA catalogue fetch observed on 29 October. Scope, defects and remaining gates: [browser evidence](../validation/browser-2026-10-29/README.md). No paper ingestion. Historical results must not be upgraded by offline tests.

## Historical evidence

- [25 October phase status and remaining gates](history/REMAINING_PHASES_2026-10-25.md)
- [Dated tier history](history/TIER_ROADMAP.md)
- [Historical validation log](history/VALIDATION.md)
- [24 October independent patch review](history/RESEARCH_REVIEW_2026-10-24.md)
- [24 October ADS fallback record](history/DISCOVERY_FIX_2026-10-24.md)
- [Earlier evaluation limitations](EVALUATION.md)

## Deployment and open questions

PR #6 was merged into main as `e5492092c011329bd6cb01f24efc198cc67ee7b6`. The research Edge Function was deployed as v15 with JWT verification enabled. Vercel production deployment `dpl_C7Cok35HiMXkAooLk7DV7j4UrfRZ` was confirmed READY and assigned to spacemind-frontend.vercel.app. These release observations do not establish scientific accuracy. No migration, new secret, paid service or ingestion is required. Do not deploy the local test-configuration build. Formatting-only shared files can be included in future routine function releases; no behavior change is intended there.

Open: project/corpus/dataset licensing and redistribution permission; astronomer-reviewed relevance labels and reviewer provenance; compatible embedding provenance and reranker choice; live provider and browser acceptance. SIMBAD, general aliases and broader numeric grammar are future work. The readability byte-identical build condition was not met: four formatted source-derived assets changed bytes, though parsed logic and the 212-file output set were unchanged. [Workstream evidence](WORKSTREAM_REPORT.md).

## NASA integration acceptance — 30 October 2026

NASA Live Data is deployed and the saved key is verified through an authenticated,
uncached NeoWs response. One-day and seven-day queries, eight-day rejection,
JSON/CSV exports, source attribution, explicit-date chat routing and solar-feed
rendering were observed on production. Live testing found and fixed NOAA Kp
object-record rendering and invalid model-generated asteroid arguments. DONKI's
API gateway returned 503; the official public NASA CCMC fallback returned CME
records and is explicitly labelled. Regression suite: 149 passing tests.
See [NASA usage, limits and dated evidence](NASA_LIVE_DATA.md). This does not
complete the separate scientific-validation or 50-answer evaluation programme.
