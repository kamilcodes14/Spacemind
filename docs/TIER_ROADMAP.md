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

## Tier 2 — real research assistant (pending)

PDF upload; paper comparison, literature reviews, open problems and citation exports; citation graph; saved collections and notes; personalized digest; additional astronomy archives.

## Tier 3 — Mission Lab upgrades (pending)

Delta-v budgets, rocket equation, light curves, transits, Gaia HR diagrams and orbit decay; result feedback to the model; PNG/CSV export and shareable notebooks.

## Tier 4 — models and infrastructure (pending)

Model routing/fallbacks; 50-question evaluation set in CI; vector index removal from git; shared infrastructure and observability.
