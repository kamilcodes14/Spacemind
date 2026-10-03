# SpaceMind

A private space-research workspace with sign-in, saved chats, cited research, settings, and an animated universe. No premium tier.

## Hosted app: Vercel + Supabase

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

Backgrounds are artistic illustrations, not a complete astronomical catalog or a simulation to scale. Google login and PDF upload are not included.

## Research behavior

Web mode uses Tavily exclusively. Papers mode uses the imported corpus and optional Semantic Scholar abstracts. Auto can supplement papers with web results. Missing configuration, provider failures and insufficient evidence are surfaced. Citation-number checks flag missing or invalid references; they do not prove scientific correctness.

The hosted backend uses Groq (not xAI/Grok). Existing configuration in this repository used `GROQ_API_KEY`. If your key is actually for xAI, a separate provider adapter is needed; the keys are not interchangeable.

Provider secrets never enter the browser bundle. Questions and relevant chat context go to the model provider; search queries go to the chosen search providers. Supabase manages sessions using its browser SDK. Database ownership checks protect chats even when someone calls the Data API directly. Research is limited to 30 requests per account per hour.

## Development and verification

```bash
npm run check
npm test
npm run test:db
```

The database suite applies the actual migrations in PGlite/Postgres with pgvector and checks ownership, permissions, quota and deletion. Provider calls in unit tests are mocked. See [VALIDATION.md](VALIDATION.md) for scope and deployment limits.

The original Python/Chroma ingestion and local Ollama/Groq research workflow is retained. **[Local Python setup](docs/LOCAL_PYTHON_SETUP.md)** uses its own SQLite accounts and same-origin API; those accounts do not automatically migrate into Supabase Auth. **[Research engine reference](docs/RESEARCH_ENGINE_REFERENCE.md)** documents the original pipeline. `render.yaml` is legacy local-backend deployment configuration and is not used by the Supabase build.
