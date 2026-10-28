# Readability and research scaffolding workstream record

27 October 2026. Base: `1889b36`. Local branch: `codex/readability-workstream-c`. No push, deployment, ingestion, Chroma modification, live evaluation run or new Mission Lab validation. Existing 123 tests were retained. No paid service or new secret was configured. Package retrieval and official NASA documentation were accessible; catalogue tests used explicitly synthetic mocks. No recorded NASA fixture was fabricated.

| Workstream | Commit | Files/scope | Required local checks |
| --- | --- | --- | --- |
| C formatting | `dceb524` | `.prettierrc.json`, package/lockfile; 28 JS files under shared functions, science and frontend root | check, test (123), test:db, build pass |
| C JSDoc | `535a732` | evidence-quality.js, research.js, orbits.js; all 25 exports | check, test (123), test:db, build pass |
| D supported stack | `95062fb` | README.md, LEGACY.md only | check, test (123), test:db, build pass |
| B benchmark | `8d4de97` | benchmarks/retrieval schema, loader/scorer/runner, examples, template/card; tests/evals/retrieval-benchmark.test.mjs | check, test (127), test:db, build pass |
| A catalogue | `9cbfdfb` | shared/catalogue.js and research.js; research/handler.js; frontend app.js/evidence-view.js; catalogue test and scope document | check, test (136), test:db, build pass |
| E documentation | This documentation commit | README, STATUS, historical logs/links, CITATION.cff, report skeleton, local link checker, this record | check, test (136), test:db, build pass; local link check passes |

All builds used `SUPABASE_URL=https://example.supabase.co` and `SUPABASE_PUBLISHABLE_KEY=sb_publishable_test_only`, matching the repository's existing test convention. These are deliberately non-production placeholders, not working credentials. Build output is not deployable production configuration.

## Verified versus not verified

C: normalized parsed JavaScript structure and string/template values remained unchanged across all 28 formatted files. Prettier check passed. Build output set stayed at 212 files, but four assets changed bytes (`app.js`, `citation-export.js`, `evidence-view.js`, `science.js`) because source is copied/embedded. Strict byte-identical output was NOT achieved; JSDoc alone preserved all build bytes. No logic change is intended. Browser rendering not verified.

D: no workflow, Dockerfile or render.yaml path changed. No files moved/deleted in D.

B: four algorithm/schema/adapter tests added. Running the ten EXAMPLE items executed BM25 for ten items; dense, hybrid RRF and hybrid+rerank each skipped all ten because compatible embeddings were unavailable. All quality metrics are null: not measured. No scores are reported from examples. A mock adapter test exercises all arms with explicitly synthetic vectors, not recorded embeddings or measured retrieval quality. Reviewed relevance labels, corpus permission/license, embedding provenance and a real reranker remain open.

A: nine tests added, with mocked providers. They cover parsing/conversion, asymmetric errors, failure/ambiguity, size/deadline limits, cache timestamp retention, integration into persisted citation payload and DOM-free display metadata. This is software regression evidence, not a catalogue accuracy score. No live TAP acceptance or browser rendering was performed. Labels do not replace or improve the measured accuracy of excerpt checks; no accuracy gain is claimed. Scope and uncertainty assumptions are in [CATALOGUE_VERIFIER.md](CATALOGUE_VERIFIER.md).

E: dated logs moved with caveats retained; local Markdown paths and heading links checked across repository documents. Zero broken local links after updates. External URL availability is not checked by this script. Run `node scripts/check-doc-links.mjs` to reproduce. Technical report sections contain TBDs, not invented results. `CITATION.cff` deliberately has no license field; author listing is the project contributors rather than an unverified individual attribution.

## Deployment handoff

To publish A later: deploy the `research` Edge Function including `_shared/catalogue.js` and the revised shared research module/handler, then rebuild and release the Vercel frontend using existing production environment values. No migration, new secret or paper import is required. Other formatting-only shared files can travel with future routine function releases. B/D/E are repository tooling/documentation and need no service deployment. Nothing was deployed by this work.

## Open questions

Project/dataset/corpus licensing and redistribution rights; astronomer-authored reviewed gold labels; embedding provenance and reranker choice; live provider/browser acceptance; broader supported numeric grammar and SIMBAD (future work); acceptance of C's explicitly reported byte-output exception. Seven-phase gates remain as recorded in [STATUS.md](STATUS.md) and its historical sources.
