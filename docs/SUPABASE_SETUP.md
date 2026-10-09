# Supabase deployment

Existing project: **Spacemind**, reference `aqblctjucyxqjmylojgc`.
The workspace and paper migrations and three Edge Functions were installed in this project during this update. No project or paid plan was created. Frontend deployment and provider secret configuration still need completion.

## 1. Configure Auth

In Supabase Authentication, enable email/password signup. Set Site URL to your exact frontend URL and add that URL (with trailing `/`) to Redirect URLs. Add `http://localhost:3000/` only for local development. Keep email confirmation on and set minimum password length to 10. Configure an SMTP provider for production confirmation/reset delivery. Test both flows from the same browser that requested the email (this app uses PKCE).

`supabase/config.toml` configures the local stack; it does not automatically update hosted Auth settings. Anonymous sign-ins should remain disabled. Apply sensible signup rate limits/CAPTCHA before opening unrestricted public registrations; the research quota is per account, not an application-wide spending cap.

## Google and Apple sign-in

The hosted login screen includes both providers and checks Supabase's public Auth settings before redirecting. Disabled providers show a helpful message; email remains available. Provider credentials belong in Supabase Authentication / Sign In / Providers, never in Vercel or GitHub. Research API keys are unrelated to OAuth credentials.

1. Set Authentication / URL Configuration **Site URL** to `https://spacemind-frontend.vercel.app` and add `https://spacemind-frontend.vercel.app/` to **Redirect URLs**. Add exact additional frontend URLs only if needed.
2. **Google:** in Google Auth Platform, create a Web application OAuth client. Set authorized JavaScript origin to `https://spacemind-frontend.vercel.app` and authorized redirect URI to `https://aqblctjucyxqjmylojgc.supabase.co/auth/v1/callback`. Configure the consent screen with basic openid, email and profile scopes; add your test users while the app is in Testing. Copy the client ID and client secret into Supabase's Google provider and enable it. No additional frontend environment variable is needed.
3. **Apple:** use your Apple Developer account to configure a Sign in with Apple App ID, an associated Services ID and signing key. Set the web domain to `aqblctjucyxqjmylojgc.supabase.co` and return URL to `https://aqblctjucyxqjmylojgc.supabase.co/auth/v1/callback`. Generate the Apple OAuth client secret using your Team ID, Key ID and private `.p8` signing key; enter the Services ID first in Supabase Apple Client IDs and set the generated secret. Enable the provider. Rotate the OAuth secret before its six-month expiry. Keep signing keys private.
4. After the frontend update deploys, test each enabled provider in the same browser from sign-in through redirect back into the workspace. Cancel a provider prompt once to check the recoverable error message. Sign out and sign back in to check history persistence. Provider signup creates an account automatically.

The client uses the Supabase SDK's PKCE URL detection and code exchange; it never manually trusts URL tokens or provider profile fields for access. Redirect failures are shown safely and removed from the URL. Profiles and chats retain their existing RLS rules. Apple may not supply a name; users can edit their display name in Settings. Social-only users can use Forgot password with their account email to establish a password before password-protected account changes/deletion.

Email signup still requires confirmation. A resend button and neutral success notices explain delivery and the same-browser requirement. If email does not arrive, check spam, Auth logs and SMTP delivery settings; do not disable email confirmation to work around delivery errors.

Official setup: [Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 2. Add backend secrets

In Project Settings / Edge Functions / Secrets, add:

| Secret | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Required for generated answers; this is Groq, not xAI Grok |
| `GROQ_MODEL` | Optional; default `openai/gpt-oss-120b` |
| `TAVILY_API_KEY` | Live web research |
| `SEMANTIC_SCHOLAR_API_KEY` | Optional additional paper abstracts |
| `ALLOWED_ORIGINS` | Additional exact frontend origins, comma separated, without paths; e.g. `https://your-app.vercel.app,http://localhost:3000`. The production origin `https://spacemind-frontend.vercel.app` is included in the shared CORS configuration. |
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

## Tier 1 evidence pipeline

Apply the `trustworthy_retrieval` migration before deploying the updated `research`
and `embed-paper` functions. Research preserves JWT and conversation ownership
checks. No new public write privileges are introduced.

Optional Edge Function secrets: `COHERE_API_KEY` and `COHERE_RERANK_MODEL`
(default `rerank-v3.5`). Without Cohere, the existing Groq model performs a separate
relevance-ranking pass. Claim checking is another bounded Groq call. Both can
increase latency and provider usage; failed checks are visible and lower confidence.

Collect the hosted corpus (standard-library Python, no Chroma build required):

```bash
python scripts/collect_hosted_corpus.py --per-source 15
python scripts/import_supabase_papers.py --jsonl data/processed/hosted-corpus.jsonl --dry-run
python scripts/import_supabase_papers.py --jsonl data/processed/hosted-corpus.jsonl
```

The importer uses the existing operator-only `PAPER_IMPORT_TOKEN`; keep it out of
the browser and Git. Fresh additions are labelled abstracts. Existing PDF chunks
remain full-text excerpts. Metadata is fetched from archive APIs, not inferred.
The collection manifest reports incomplete source fetches and exits unsuccessfully
if any required source fails. Repeated imports keep stable IDs and refresh metadata.

Streaming clients send `Accept: text/event-stream` and `stream: true` with the
normal authenticated request. Events are `status`, `sources`, `delta`, `done`, and
`error`. Only `done` means the answer passed through verification and was saved;
check its `confident`, warnings and claim statuses. JSON clients remain supported.
