# Legacy Python / Chroma / Render path

The supported hosted stack is the Vercel frontend with Supabase Auth, Postgres and Edge Functions. Use [Supabase setup](docs/SUPABASE_SETUP.md).

The Python server and Chroma workflow remain available as legacy code for local experimentation. Their accounts use separate SQLite storage and do not migrate automatically to Supabase Auth. Historical tests do not establish current hosted acceptance or scientific accuracy.

Retained paths include `src/`, `requirements.txt`, `requirements-dev.txt`, `Dockerfile`, `render.yaml`, and the ignored local `data/chroma_db/` location. No files have been moved or deleted. No workflow or deployment paths have changed.

See [local Python setup](docs/LOCAL_PYTHON_SETUP.md) and [original engine reference](docs/RESEARCH_ENGINE_REFERENCE.md). Existing limitations and historical evidence remain in their original documents. New hosted development targets Supabase + Vercel; legacy support is not an implied deployment recommendation.
