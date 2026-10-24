# Deployed research evaluation v2

This protocol measures the deployed stack, not a standalone model. No score exists until
real responses are captured and independently reviewed. Do not report schema validation,
synthetic fixtures, model self-verification, or keyword matching as accuracy.

## Capture

Use a confirmed normal account dedicated to evaluation. Configure EVAL_EMAIL and
EVAL_PASSWORD through protected GitHub Actions secrets; never put them in chat, commits,
CLI arguments or reports. SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are also required.
Set EVAL_BACKEND_REVISION to the observed research function version and bundle hash.
Run `npm run eval:live`. The existing workflow uses the same command.

The runner creates a separate test chat per question, uses Auto mode as recorded in each
case, respects 30/hour quota, refreshes the normal session, and checks persisted answer
text through that account's RLS. It does not read other users' chats. Evaluation chats
are retained for audit; delete them through the test account when no longer needed.
A 50-question capture may cross an hourly quota boundary. Reports checkpoint after each
question and before waiting; automatic restart/resume is not implemented. An interrupted
capture is incomplete and must not be presented as a 50-question baseline.

Exit 2 means captured but awaiting review; exit 1 means preflight/runtime failure.
Reports include UTC execution date, source revision, dataset hash, modes, captured
passages, warnings, application claim checks (not ground truth), attempts and latency.
No raw auth/provider exceptions are logged. Backend revision must be recorded from the
actual deployment rather than inferred from the repository head.

## Review

Copy a report to a review file and fill its `review` fields. Use an independent human
reviewer; do not copy the application's own support labels as the review. Check reference
answers too, recording corrections by versioning the dataset before the baseline.
The dataset contains 20 numerical, 25 conceptual and 5 challenge cases; this is a small,
non-exhaustive benchmark, not a representative sample of all research tasks.

Each case has detailed 0/1/2 rubrics for factual correctness, numerical accuracy/units,
citation support, uncertainty, false-premise handling and refusal correctness. Use `na`
only with a written reason where allowed. Equivalent wording/units are valid. Judge the
final requested numerical quantity, not any matching number elsewhere in the answer.
Reject contradictory prose even if a correct number is present. The numerical reference
values are analytical two-body fixtures, not an ephemeris accuracy benchmark.

Review every segmented sentence. Segmentation is only a convenience (abbreviations and
equations may span segments); assess each segment in context. `factual` here means an
external factual assertion requiring source support. For transparent derivations from
prompt inputs, mark false with a rationale and assess the numerical dimension. A factual
claim must be supported, partial or unsupported; nonfactual text may be not_applicable.
Positive support requires a verbatim quote from the captured cited snippet and a source
URL/page/section locator. Inspect the linked document where available. A matching quote
alone does not establish entailment: the reviewer must assess whether it supports every
part of the claim. Never invent a page number. Abstract-only evidence cannot support
methods/results absent from that abstract. Report inaccessible full text honestly.

`representative_sample` is fixed before outcomes: two cases per ordinary stratum, all
challenge cases. Manually inspect at least that sample and all failures; this version
requires all 50 to have completed independent rubric reviews for the quality gate.
Reviewer name/date and answer/source hashes prevent accidentally reusing stale reviews.
Run `npm run eval:review -- path/to/reviewed-report.json`. It validates coverage, quotes,
required dimensions and contradictions between aggregate and sentence support scores.
It cannot replace scientific judgment or authenticate the reviewer's identity.

## Metrics and comparison

Report each dimension separately, including reviewed denominator and missing reviews.
Citation precision = fully supported externally factual cited segments / all reviewed
externally factual cited segments. Coverage additionally includes uncited factual segments
in the denominator. Partial support is not full support. These are segment-level metrics,
not reference-count precision. Empty denominators remain null, never 100%.

Latency uses nearest-rank p50/p95 of successful requests from start through parsed body;
it excludes quota waiting and persistence readback. Report failures separately and total
elapsed time; never label successful-request latency as all-request latency.

Quality pass requires 50 successful, fully reviewed responses scoring 2 in every applicable
dimension. Capture can succeed while quality fails. Fix failures only after preserving
the baseline. Rerun the SAME dataset/rubric/modes and record both backend versions.
`npm run eval:compare -- baseline.json rerun.json` rejects incompatible or unreviewed runs.
Do not compare v2 scores to the retired keyword grader; v2 also adds five challenge cases.
One before/after run cannot establish statistical significance or a 9.5/10 product rating.

Reference starting points (reviewers must inspect claim-specific evidence):
- JPL astrodynamic units: https://ssd.jpl.nasa.gov/astro_par.html
- NASA exoplanet methods: https://science.nasa.gov/exoplanets/how-we-find-and-characterize/
- NASA dark-matter overview: https://science.nasa.gov/dark-matter/
