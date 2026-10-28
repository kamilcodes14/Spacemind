# Patch review and release evidence — 24 October 2026

Both user-supplied patches applied to main 834faaa. Their combined original suite passed
104 Node tests plus the local database suite. Review nevertheless reproduced defects:
negated fusion claim labelled supported by lexical overlap; 2 accepted inside 12;
same-title uploaded document identities collapsed; arXiv inferred as unpublished.

Corrections: independent human review gates replace lexical quality acceptance; signed
whole-number/exponent matching; separate uploaded UUID identities; publication status
unverified without metadata; full-text quotes no longer generate passage links to
abstract landing pages; coverage summaries persist inside the citation payload.
The contributed heuristics remain explicitly diagnostic, not scientific grading.

Phase 3 started: SHA256 PDF identity, parser version/time/byte provenance, reading progress
and cancellation, exact-duplicate detection, explicit sparse-page/OCR warnings, oversized
page rejection instead of truncation, and no invented PDF pages for saved abstracts.
Selected excerpts record truncation and extraction warnings for the answer generator.
No paid services, auth changes, background or hosting changes were introduced.

Verification: 119 Node tests passed, local database/RLS suite passed, syntax checks and
placeholder-config production build passed, official 50-case rubric schema and 20
numeric regressions passed. A real two-page synthetic PDF parsed through pdfjs 6.4.299:
period text retained, blank page 2 reported, three progress events, byte checksum captured.
Node emitted a standard-font path warning; browser assets are copied by the normal build.
This is parser functionality, not observational science validation.

## Deployed backend

Migration 20261024120946_phase2_retrieval applied to the existing project. Research v14
ACTIVE with JWT verification retained; bundle SHA256
 d70235f6cb270fe4c0d5ebdc8a18fba8f5a6219dd7310bb46d5ac6e09b199871.
Only research.js and paper-tools.js were replaced in the read-back v13 bundle, with the
new evidence-quality.js added. Other live dependencies were preserved.

Three fixed, title-informed lexical-only database probes, before -> after:

| Query target | Candidate count (top 8) | Expected paper rank |
| --- | --- | --- |
| halo intrinsic alignment 2609.37254 | 1 -> 8 | 1 -> 1 |
| AthenaK tidal disruptions 2609.37859 | 3 -> 8 | 1 -> 1 |
| SPHEREx PAH map 2609.37878 | 3 -> 5 | 1 -> 1 |

All three already ranked the expected paper first. Broader retrieval is observed, but
no ranking-quality improvement is established by this small sample. Probes used admin
SQL with null embeddings; they are not signed-in RLS or model-answer acceptance.

## Remaining acceptance

Phase 1 remains BLOCKED: no dedicated confirmed test credentials, no 50 live answers,
independent answer review, latency measurements or genuine before/after quality scores.
User subsequently authorized patch deployment and starting Phase 3; future evaluation
must identify v14 as its baseline and must not invent a pre-v14 answer baseline.
Phase 2 deployed code still needs signed-in answer and mobile/desktop acceptance.
Phase 3 first increment implemented; real-paper summaries/comparisons/extraction and
account-backed upload/reload acceptance remain open. Phases 4–7 remain as requested;
historical synthetic tests do not close observational validation or live isolation gates.

Pre-release security advisory reports leaked-password protection disabled. This existing
Auth setting was not changed; no paid feature enabled. Internal service-only tables have
RLS and intentionally no client policies. See Supabase's guidance:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
