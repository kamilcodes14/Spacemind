# Current status — 27 October 2026

Supported hosted stack: Supabase + Vercel. [Legacy boundaries](../LEGACY.md).

This work completed readability, supported-stack documentation, retrieval benchmark scaffolding and a narrow numeric catalogue verifier. It does not complete or advance the seven-phase acceptance programme. Existing scientific and deployment caveats remain in the historical records.

- Local regression execution: measured, 136 passing Node tests; syntax, PGlite database suite and test-config build pass. This measures software regression results, not scientific accuracy.
- Benchmark: implemented-not-measured. No reviewed dataset or retrieval scores. Example BM25 execution has no gold; dense/hybrid arms skip without embeddings. [Dataset card](../benchmarks/retrieval/DATASET_CARD.md).
- Catalogue: implemented-not-measured. One bounded, cached NASA TAP lookup, conservative name/number grammar, explicit uncertainty limits. Browser rendering and live acceptance not verified. [Verifier limits](CATALOGUE_VERIFIER.md).
- Live 50-answer evaluation: not done; no new baseline, gold labels or before/after quality figures. [Protocol](EVALUATION_PROTOCOL.md).
- Mission Lab validation, paper ingestion, signed-in acceptance and hosted releases: not run or changed by this work. Historical results must not be upgraded by offline tests.

## Historical evidence

- [25 October phase status and remaining gates](history/REMAINING_PHASES_2026-10-25.md)
- [Dated tier history](history/TIER_ROADMAP.md)
- [Historical validation log](history/VALIDATION.md)
- [24 October independent patch review](history/RESEARCH_REVIEW_2026-10-24.md)
- [24 October ADS fallback record](history/DISCOVERY_FIX_2026-10-24.md)
- [Earlier evaluation limitations](EVALUATION.md)

## Deployment and open questions

Nothing was pushed or deployed. To release the new catalogue feature later, deploy the `research` Edge Function with its shared dependency files and rebuild/release the Vercel frontend using existing production configuration. No migration, new secret, paid service or ingestion is required. Do not deploy the local test-configuration build. Formatting-only shared files can be included in future routine function releases; no behavior change is intended there.

Open: project/corpus/dataset licensing and redistribution permission; astronomer-reviewed relevance labels and reviewer provenance; compatible embedding provenance and reranker choice; live provider and browser acceptance. SIMBAD, general aliases and broader numeric grammar are future work. The readability byte-identical build condition was not met: four formatted source-derived assets changed bytes, though parsed logic and the 212-file output set were unchanged. [Workstream evidence](WORKSTREAM_REPORT.md).
