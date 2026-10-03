# SpaceMind

A private astronomy research workspace with email/password accounts, saved conversations, cited paper and web research, and an adjustable animated universe.

## Run the updated app

Use Python 3.11 or newer. From this project folder:

```bash
python -m venv .venv
```

Activate the environment:

```powershell
# Windows PowerShell
.venv\Scripts\Activate.ps1
```

```bash
# macOS / Linux
source .venv/bin/activate
```

Install dependencies and create your configuration:

```bash
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and set your model credentials. The existing query engine supports:

- Groq: `LLM_PROVIDER=groq` and `GROQ_API_KEY=...`.
- Local Ollama: `LLM_PROVIDER=ollama`, with the configured model running locally.
- Live web research additionally needs `TAVILY_API_KEY=...` and `WEB_SEARCH_ENABLED=true`.

Start the app:

```bash
uvicorn src.api.main:app --reload --port 8000
```

Open **http://localhost:8000**, choose **Create account**, and sign in. Accounts are created in your own database; there are no built-in passwords or demo accounts.

**Serve the frontend and API from this same application.** Opening `frontend/index.html` directly, or deploying only that folder to Vercel, will not provide authentication or research. For a separate frontend deployment, proxy `/auth`, `/chats`, `/ask`, `/export`, `/capabilities`, `/library`, `/learning-paths`, and `/assets` to this backend under the same browser origin. Do not put model keys in the frontend.

## What's included

- Real sign-up, sign-in, sign-out, password change, and account deletion.
- Scrypt password hashes, HttpOnly session cookies, server-side session expiry, and owner checks on every conversation operation.
- Durable conversations with the most recent 10 turns supplied as research context.
- New chat, title search, rename, pin/unpin, delete, and JSON data export.
- Account, appearance, research, and privacy settings saved per user.
- Auto, Web, and Papers modes; Simple or Technical explanations.
- Source links and excerpts, follow-up questions, copy answer, and retry controls.
- Four illustrated backgrounds: Living universe, Solar neighbourhood, Distant galaxies, and Nebula clouds. Planets, moons, galaxies, a black hole, stars, and occasional comets appear across the scenes.
- Animation pause, brightness, speed, quality, and text-size controls. Backgrounds respect reduced motion, pause while the page is hidden, and use fewer stars on mobile.
- Responsive sidebar and native accessible dialogs.

There are no premium tiers. Google sign-in, email verification/reset mail, and PDF uploads are not implemented in this version; no buttons pretend to provide those services.

## Research and data

The existing ingestion pipeline, Chroma index, provider configuration, scripts, and learning paths are retained. The original scientific-engine documentation is in [docs/RESEARCH_ENGINE_REFERENCE.md](docs/RESEARCH_ENGINE_REFERENCE.md); its old UI, authentication, and API examples are superseded by this README.

Explicit Web mode searches the web before touching the paper index. If web search is unavailable or has no usable results, the user sees that fact. Auto can fall back from papers to web. AI-provider errors do not create fake saved answers.

New conversations are private to the signed-in account. The old unauthenticated `/share/{id}` and `/session/{id}` routes have been removed. Existing `answers.db` content is retained in this archive, but is not served or imported into any account: those old answers have no trustworthy user ownership. Browser-local recent-question lists are also not automatically imported.

Questions and relevant conversation context go to the configured model provider. Search queries go to Tavily when web research is used. The animated background makes no network requests.

## Production configuration

1. Use HTTPS and set `COOKIE_SECURE=true`.
2. Put `WORKSPACE_DB_PATH` on a **persistent, writable disk**, e.g. `/var/data/spacemind/workspace.db`. Back up that database. A filesystem that disappears on redeploy will lose accounts and chats.
3. The included SQLite setup is intended for one application instance. Move to a shared database and shared rate-limit storage before scaling to multiple replicas.
4. Keep the frontend and API on one origin. `ALLOWED_ORIGINS` is an optional comma-separated explicit allowlist for API clients; it does not by itself make cross-origin frontend cookies work.
5. Keep `.env`, `workspace.db`, its WAL/SHM files, and exports out of Git and container images. The ignore files now cover the account database.
6. Configure the model and search keys on the server. This update does not activate external services or purchase hosting.

The existing `render.yaml` remains an example of the original service. Its free/ephemeral setup must not be used as durable account storage; choose persistent hosting and set `WORKSPACE_DB_PATH` before relying on saved accounts.

## API changes

All mutation requests need `X-SpaceMind: 1`. The browser app sends it automatically. Cookie-authenticated routes reject unauthenticated requests. Cross-origin mutations are rejected unless the exact origin is configured.

| Route | Purpose |
|---|---|
| `POST /auth/signup`, `/auth/login`, `/auth/logout` | Account sessions |
| `GET/PATCH/DELETE /auth/me` | Profile, settings, deletion |
| `POST /auth/password` | Password change; revokes other sessions |
| `GET/POST/DELETE /chats` | List, create, or delete all chats |
| `GET/PATCH/DELETE /chats/{id}` | Resume, rename/pin, or delete an owned chat |
| `POST /ask` | Research with required `chat_id`, question, depth and optional use_web |
| `GET /export` | Download this user's profile and conversations |
| `GET /library`, `/learning-paths`, `/capabilities` | Research resources |
| `GET /health` | Process liveness; not a model-readiness guarantee |

## Tests

```bash
pip install -r requirements-dev.txt
pytest -q
```

The integration suite uses temporary databases and an explicit stub for model inference. It covers authentication, per-user isolation, multi-turn persistence, export, deletion, password/session rotation, CSRF rejection, rate limits, and web-mode routing. Running these tests makes no paid model requests. Live answer quality still requires your real provider credentials and model/index dependencies.
