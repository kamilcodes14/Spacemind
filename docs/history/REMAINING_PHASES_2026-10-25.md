# Research acceptance status — 25 October 2026

No whole phase is newly declared complete. Feature implementation, local numerical
validation, deployed configuration and end-to-end acceptance are different checks.

| Phase | New work/evidence | Remaining gate |
| --- | --- | --- |
| 1 Evaluation | Existing reference-answer/manual-review harness retained; credential presence checked, absent | Dedicated confirmed test account; 50 actual responses; independent reviews; p50/p95; fixes and genuine rerun |
| 2 Retrieval | Existing deployed research v14/discovery v5 retained | Signed-in evidence coverage and relevance evaluation; no measured ranking gain claimed |
| 3 Papers | Extracted-page viewer; private-paper BibTeX/APA; uploaded-document identity kept separate in exports; unsaved-note guards | Real-paper upload/summary/comparison/equation/table acceptance through production; faithful extraction remains limited by PDF text |
| 4 Mission Lab | Real Kepler TrES-2, Gaia DR3 and Horizons checks executed; see validation/observational | Browser Pyodide and deployed archive path acceptance; precision transit inference and uncertainty calibration remain outside this box-search check |
| 5 Reproducibility | JSON container with code, notebook, output, CSV, package versions, parameters, input SHA256, optional permitted input bytes; verified unpacker; saved snapshots exclude bytes | Browser round-trip execution, large-file interruption and clean-environment reproduction |
| 6 Workflow | Projects link owned papers/chats, notes and saved calculation records; streaming stop aborts client request; guards against old-account responses | Signed-in desktop/mobile/accessibility and reload tests; stopping the client does not promise server cancellation |
| 7 Security/docs | 123 Node tests; actual migrations tested with two local users, foreign links/ownership rejected, 100-project/500-item caps, cascade/anonymous checks; production RLS/grants inspected | Real two-account login/API isolation and account deletion/recovery acceptance |

## Evidence and limitations

Local tests: npm test (123 pass); npm run test:db; npm run check; npm run eval
(50 schemas/20 analytic checks); placeholder-config production build; three archive
benchmarks run through shared recipe/solver code. Offline tests are not model accuracy.
Local database tests exercise actual SQL migrations, not mocked access decisions.

Migration `20261025110801_research_projects` was applied to the existing Supabase
project. Both new tables have RLS enabled and anon has no SELECT privilege; owned
USING/WITH CHECK predicates and composite ownership foreign keys are present.
The production rollback-fixture RLS test was attempted twice; the connector returned
`Invalid or expired requestState`, so **no passing live two-user test is recorded**.
No application account credentials were retrieved or fabricated. The SQL harness is
available in tests/supabase/project-live-rollback.sql for a later authorized rerun.

Production security scan after migration: no new findings. Existing warning: leaked
password protection disabled; unchanged. Five internal service-only tables intentionally
have RLS with no client policies. See
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

A Supabase CLI telemetry attempt was rejected by automatic review. No telemetry retry
was attempted. The already-generated migration file was populated with tested SQL;
the connected migration tool applied it, and the filename was reconciled with the
actual deployed migration timestamp.

Research exports are inspectable JSON, not ZIP. `scripts/unpack-research-bundle.py`
verifies checksums and filenames without executing code. Input inclusion is opt-in,
limited to 16 MB. Unincluded inputs retain names/hashes and an omission reason.
Original recipes use /work paths; review/adjust these in a copy outside the browser.
Project exports are indexes plus saved calculation records; use account export for
full linked papers and conversations. No file bytes or plots are silently uploaded
when saving a calculation to a project.
