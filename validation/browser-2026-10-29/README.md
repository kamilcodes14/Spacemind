# Production browser acceptance — 29 October 2026

Observed against https://spacemind-frontend.vercel.app/ after release of main
`e5492092c011329bd6cb01f24efc198cc67ee7b6`. These are bounded software acceptance
checks, not a completed scientific evaluation or a claim that all seven phases pass.
The user authorized resuming acceptance after the original C/D/B/A/E work.

## Observed results

| Check | Result and boundary |
| --- | --- |
| Google login | Completed through the normal account chooser; signed-in workspace visible. No credential or token was exported. |
| Session reload | Reload returned to the signed-in workspace. Persistence across replacement cloud-browser sessions was not established. |
| Browser Python | Default mission budget loaded NumPy/Astropy/SciPy and executed in Pyodide. Required 2585 m/s, available 2875.4376018347784 m/s, reserve 290.43760183477843 m/s. These are example inputs, not mission observations. |
| Hohmann recipe | Earth 400 km to 35786 km: total 3.853959 km/s, transfer 5.291267 hours. Built-in quadrature/half-period check passed. This retains circular, coplanar, impulsive, two-body assumptions. |
| 3D view | The application reported 3D graphics unavailable on this device. Rendering and interaction of the 3D orbit are NOT verified. |
| Bundle export | Downloaded the actual executed [budget bundle](budget-bundle.json); the existing unpacker verified its checksums and extracted Python, notebook, CSV, output and manifest. No input files or images were present in this example. |
| Reproduction | Inspected and ran the extracted Python locally; the printed numerical values matched. Imported the exported notebook into the browser and ran it; the same budget values were printed. This is not a clean pinned-environment or external-data reproduction test. |
| Project save/readback | Saved the executed budget to the existing acceptance project. Reopened that project and downloaded its [saved calculation](saved-budget.json). Code, output, context, environment and completion timestamp exactly matched the execution. A final project-detail readback after full reload was not completed. |
| Deployed archive path | Mission Lab's NASA Exoplanet Archive query for `Kepler-22` returned 33 rows, a source link and retrieval time. [Observation metadata and download hash](archive-observation.json). It is a substring search, so rows include similarly prefixed names. This is NOT acceptance of the separate research claim-verifier path. |
| Paper viewer | Opened an existing paper's saved excerpt; title, original-source link and extraction caveat rendered. This does not verify full-PDF extraction, equation/table fidelity, summarization or comparison. No papers were ingested. |
| Live research smoke test | One normal Auto-mode question returned an answer. Final circular speed rounded to 7.67 km/s, consistent with independent calculation 7.668558175407055 km/s. However, its intermediate mu/r was printed as 58.842 instead of 58.80678448960238, and the supplied radius was described as mean radius. Raw TeX delimiters were visible in the answer. This is a defect observation, not a passing accuracy result. |

## Evaluation blocker

The scheduled [GitHub run 40344476569](https://github.com/kamilcodes14/Spacemind/actions/runs/40344476569)
failed at preflight on 26 October before evaluation. Its job log reported missing
required configuration/test-account credentials. On 29 October the repository's
Actions secrets page showed `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, but no
`EVAL_EMAIL` or `EVAL_PASSWORD`. Only names were inspected; values were not read.
The earlier run also received an empty `EVAL_BACKEND_REVISION`.

Use a dedicated confirmed normal account and configure its credentials privately
as Actions secrets. Set the backend revision variable to the observed function
version/bundle hash before capture. Never put passwords in chat or commits. A Google
browser session is not a password for the headless evaluation runner. See the
[evaluation protocol](../../docs/EVALUATION_PROTOCOL.md) for capture, quota handling,
independent human review and comparable reruns. No 50-answer run, independent review,
accuracy percentage, retrieval-quality score or before/after gain was produced here.

## Regression checks and remaining gates

`npm run check`, `npm test`, `npm run test:db` and the placeholder-config
`npm run build` passed. An explicit TAP rerun confirmed 136 tests, 136 passes,
zero failures/skips. Build placeholders were `https://example.supabase.co` and
`sb_publishable_test_only`; that local build must not be deployed.

Remaining: independent 50-answer baseline/review/rerun; retrieval relevance and
coverage evaluation; full paper workflows; all Mission Lab recipes and SPICE;
hardware-supported 3D verification; mobile/accessibility, large-input interruption
and pinned-environment reproduction; real two-account isolation and account lifecycle
acceptance; live claim-catalogue labels. Historical scientific caveats and licensing
questions remain open. No new secret, migration, paid service, paper ingestion or
Chroma change was made. This evidence/documentation update requires no service deploy.
