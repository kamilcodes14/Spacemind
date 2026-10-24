# Evaluation status after patch review

No 50-question deployed quality baseline has been captured. Dedicated normal-account
EVAL_EMAIL / EVAL_PASSWORD remain unavailable in this runtime.

The contributed `eval-rubric.mjs` and `space-questions-v2.json` are retained as **lexical
diagnostics and extra candidate fixtures only**. They are not the official acceptance
score: review reproduced a negated claim receiving full lexical citation support.
The contributed sample tool is now `eval-heuristic-review.mjs`. Its agreement score does
not validate unreviewed responses or establish scientific accuracy.

The official `npm run eval:live` path uses `space-questions.json`, records response/source
hashes and review templates, and does not assign automatic scientific passes. See
[EVALUATION_PROTOCOL.md](EVALUATION_PROTOCOL.md) for independent sentence-level review,
metrics, dataset compatibility checks and before/after requirements.

Contributed corpus-reference answers are title-derived candidate fixtures and require
source review before adoption. Historical v1 keyword results and contributed lexical
scores must not be compared to independently reviewed acceptance scores.
