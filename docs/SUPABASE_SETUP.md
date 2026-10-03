# Supabase deployment

Existing project: **Spacemind**, reference `aqblctjucyxqjmylojgc`.
The workspace and paper migrations and three Edge Functions were installed in this project during this update. No project or paid plan was created. Frontend deployment and provider secret configuration still need completion.

## 1. Configure Auth

In Supabase Authentication, enable email/password signup. Set Site URL to your exact frontend URL and add that URL (with trailing `/`) to Redirect URLs. Add `http://localhost:3000/` only for local development. Keep email confirmation on and set minimum password length to 10. Configure an SMTP provider for production confirmation/reset delivery. Test both flows from the same browser that requested the email (this app uses PKCE).

`supabase/config.toml` configures the local stack; it does not automatically update hosted Auth settings. Anonymous sign-ins should remain disabled. Apply sensible signup rate limits/CAPTCHA before opening unrestricted public registrations; the research quota is per account, not an application-wide spending cap.

## 2. Add backend secrets

In Project Settings / Edge Functions / Secrets, add:

| Secret | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Required for generated answers; this is Groq, not xAI Grok |
| `GROQ_MODEL` | Optional; default `openai/gpt-oss-120b` |
| `TAVILY_API_KEY` | Live web research |
| `SEMANTIC_SCHOLAR_API_KEY` | Optional additional paper abstracts |
| `ALLOWED_ORIGINS` | Exact frontend origins, comma separated, without paths; e.g. `https://your-app.vercel.app,http://localhost:3000` |
| `PAPER_IMPORT_TOKEN` | Random operator-only token, at least 32 characters, for corpus imports |

Create an import token locally with `python -c "import secrets; print(secrets.token_urlsafe(48))"` and keep it in your local environment and Supabase secrets. Never commit it. Supabase provides its URL, anon key and service-role key inside hosted functions automatically. Do not put service-role, Groq, Tavily, Semantic Scholar or import credentials in frontend variables.

`supabase/functions/.env.example` contains names only. If using CLI secret upload, copy it to the ignored `.env` file, populate privately, and run `supabase secrets set --env-file supabase/functions/.env` after linking the project.

The connected GitHub repository did not contain usable provider keys. Existing Render secrets do not migrate automatically. GitHub Actions secrets also are not runtime Supabase secrets.

## 3. Build your existing Vercel frontend

Set these Vercel environment variables:

- `SUPABASE_URL=https://aqblctjucyxqjmylojgc.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: copy the publishable key from Supabase Project Settings / API Keys.

Use repo root as Root Directory, Other framework, `npm run build`, output `dist`. Redeploy after changing either variable. The build rejects secret/service-role keys. The public key is intentionally included in the bundle; authorization comes from Auth and RLS.

Keep any existing deployment access protection until you are ready to publish. App account authentication is separate from Vercel deployment protection.

## 4. Import the existing paper corpus

The existing Chroma vectors use a different embedding model. They must not be copied into the new vector column. This importer reads Chroma text read-only, splits it into bounded chunks, and requests new normalized `gte-small` embeddings from Supabase.

```bash
python scripts/import_supabase_papers.py --dry-run
# Export SUPABASE_URL and PAPER_IMPORT_TOKEN privately, then:
python scripts/import_supabase_papers.py --limit 5
python scripts/import_supabase_papers.py
```

The repository corpus produces about 3,932 unique chunks. Imports consume Edge Function/inference resources and can be rerun; unchanged chunks are skipped. The supplied importer does not delete old corpus entries. Review your project usage limits before importing everything. Web research and Semantic Scholar can work before import; Papers mode otherwise has no local evidence. Paper import is manual, not an artificial keep-awake job. The original weekly re-ingestion workflow updates Chroma only; rerun this import to sync new text.

## 5. Future backend deployment

Install the official Supabase CLI and inspect `supabase --help` for your version. Authenticate, link the existing project, and deploy from repo root:

```bash
supabase login
supabase link --project-ref aqblctjucyxqjmylojgc
supabase db push
supabase functions deploy research
supabase functions deploy account
supabase functions deploy embed-paper
```

Research and account functions require a user JWT and independently validate the user through Auth. `embed-paper` deliberately disables gateway JWT verification because it checks the separate operator token in its handler. It fails closed if the token is not configured. Never change it to accept arbitrary unauthenticated imports.

## Hosting limitations

Supabase Free projects can pause after one week of inactivity. Edge Functions can have cold starts and execution limits. This removes dependency on Render's sleeping Python process; it is not a guarantee of permanently warm or unlimited hosting. No paid upgrade or keepalive automation is included.

After configuring secrets, test sign-up/confirmation, sign-in, two users' isolated chat histories, a cited Web answer, paper import/search, settings, password reset and deletion. Automated tests use synthetic provider responses and do not verify the validity of your private provider keys.
