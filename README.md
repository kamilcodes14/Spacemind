# SpaceMind

## Status and evidence

| Area | Status | Evidence |
| --- | --- | --- |
| Local regression checks | measured: 136 passing Node tests; local DB/check/build pass | [Workstream record](docs/WORKSTREAM_REPORT.md) |
| Hosted research and excerpt checks | implemented-not-measured for general answer accuracy | [Latest historical acceptance](docs/history/REMAINING_PHASES_2026-10-25.md) |
| Retrieval benchmark | implemented-not-measured; examples have no gold labels | [Dataset card](benchmarks/retrieval/DATASET_CARD.md), [tests](tests/evals/retrieval-benchmark.test.mjs) |
| Numeric catalogue labels | implemented-not-measured; mocked checks only | [Scope and limits](docs/CATALOGUE_VERIFIER.md), [tests](tests/supabase/catalogue.test.mjs) |
| Completed live 50-answer evaluation / before-after quality scores | not done | [Evaluation protocol](docs/EVALUATION_PROTOCOL.md), [historical blocker](docs/history/REMAINING_PHASES_2026-10-25.md) |
| New signed-in/browser acceptance | not done in this work | [Current status](docs/STATUS.md) |


A private space-research workspace with sign-in, saved chats, cited research, settings, and an animated universe. No premium tier.

## Supported stack: Vercel + Supabase

The hosted frontend is built from this repository. Supabase Auth handles accounts, Postgres stores private conversations with row-level security, and Edge Functions run research through Groq, Tavily, Semantic Scholar, and the imported paper corpus. The hosted path does not require Render or a running Python server.

**[Follow the Supabase setup guide](docs/SUPABASE_SETUP.md)** for deployment, secrets, email configuration, and importing the paper library.

```bash
npm ci
# Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in your environment first.
npm run build
```

Deploy `dist/`. On Vercel use the **repository root**, framework **Other**, build command **npm run build**, and output **dist**. Do not deploy the unbuilt `frontend/` folder. Public Supabase configuration is bundled at build time; model/search keys belong only in Edge Function secrets.

## Workspace

- Sign up, email confirmation, sign in, password reset/change, sign out, account deletion.
- New chat, saved history, search, rename, pin, deletion, JSON export.
- Account, appearance, research, and privacy settings stored per account.
- Auto, Web, and Papers research modes; Simple and Technical explanations.
- Source links/excerpts, evidence warnings, follow-up questions, copy and retry.
- Illustrated planets, moons, stars, galaxies, nebulae, black hole and comets; four scenes, motion/brightness/quality controls, reduced-motion support.
- Responsive mobile sidebar and a focused main screen.

Backgrounds are artistic illustrations, not a complete astronomical catalog or a simulation to scale. Google sign-in and text-PDF upload are implemented. Scanned PDFs require external OCR; extraction can lose complex equations and table layout. See the dated acceptance records in [dated tier history](docs/history/TIER_ROADMAP.md) for tested workflows and limitations.

## Research behavior

Web mode uses Tavily exclusively. Papers mode uses the imported corpus and optional Semantic Scholar abstracts. Auto can supplement papers with web results. Missing configuration, provider failures and insufficient evidence are surfaced. Citation checks include model-assisted claim verification against retrieved excerpts. They are not independent scientific validation, and source availability does not guarantee claim support.

The hosted backend uses Groq (not xAI/Grok). Existing configuration in this repository used `GROQ_API_KEY`. If your key is actually for xAI, a separate provider adapter is needed; the keys are not interchangeable.

Provider secrets never enter the browser bundle. Questions and relevant chat context go to the model provider; search queries go to the chosen search providers. Supabase manages sessions using its browser SDK. Database ownership checks protect chats even when someone calls the Data API directly. Research is limited to 30 requests per account per hour.

## Development and verification

```bash
npm run check
npm test
npm run test:db
```

The database suite applies the actual migrations in PGlite/Postgres with pgvector and checks ownership, permissions, quota and deletion. Provider calls in unit tests are mocked. See [historical validation log](docs/history/VALIDATION.md) for scope and deployment limits.

The original Python/Chroma ingestion and local Ollama/Groq research workflow is retained. **[Local Python setup](docs/LOCAL_PYTHON_SETUP.md)** uses its own SQLite accounts and same-origin API; those accounts do not automatically migrate into Supabase Auth. **[Research engine reference](docs/RESEARCH_ENGINE_REFERENCE.md)** documents the original pipeline. `render.yaml` is legacy local-backend deployment configuration and is not used by the Supabase build.

## Research-quality evaluation status

**No completed 50-question deployed baseline or before/after quality score is available.**
The 24 October 2026 attempt stopped at the dedicated-account credential preflight before
making research requests. Offline tests and historical synthetic Mission Lab acceptance
must not be described as measured model accuracy or observational validation.

The evaluation now uses 50 reference-answer cases with six explicit review dimensions,
including false-premise and future-date cases. Keyword matches no longer award passes.
Captured answers require independent sentence-level review, with exact source passages,
reviewer identity, response hashes and rationales. Auto mode is recorded explicitly.
See [evaluation protocol](docs/EVALUATION_PROTOCOL.md) and
[current evidence/status](docs/STATUS.md).

## Research projects and reproducibility

Library → Projects links private papers, chats, project notes and completed calculation
records. Mission Lab can export a reproducibility JSON bundle with executed code,
notebook, output, parameters, package versions and input checksums. Input bytes are
opt-in (16 MB total); saving a project calculation does not upload those bytes.
Use `python scripts/unpack-research-bundle.py bundle.json NEW_DIRECTORY` to verify
and unpack a bundle without executing its code.

Real observational checks and their limits are recorded in
[observational validation](validation/observational/README.md). These local checks
do not replace the blocked 50-answer deployed evaluation or signed-in acceptance.

## Legacy stack

The Python/Chroma/Render path is retained for historical reference and local experimentation, but is not the supported hosted stack. See [LEGACY.md](LEGACY.md) for boundaries and retained paths.
