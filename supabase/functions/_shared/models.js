// Existing Groq stack, with bounded per-model fallback. An optional independent
// provider is used only when all three explicit fallback settings are supplied.
export const LARGE_MODEL = 'openai/gpt-oss-120b';
export const SMALL_MODEL = 'openai/gpt-oss-20b';
export function modelCandidates(env) {
  const primary = env.GROQ_MODEL || LARGE_MODEL;
  const models = [
    primary,
    ...(
      env.GROQ_FALLBACK_MODELS ||
      (primary === SMALL_MODEL ? LARGE_MODEL : SMALL_MODEL)
    ).split(','),
  ]
    .map((x) => x.trim())
    .filter(Boolean);
  const candidates = [...new Set(models)].slice(0, 3).map((model) => ({
    model,
    key: env.GROQ_API_KEY,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    provider: 'groq',
  }));
  const hosts = {
    'openai': 'https://api.openai.com/v1/chat/completions',
    'together': 'https://api.together.xyz/v1/chat/completions',
  };
  if (
    env.FALLBACK_API_KEY &&
    env.FALLBACK_MODEL &&
    hosts[env.FALLBACK_PROVIDER]
  )
    candidates.push({
      model: env.FALLBACK_MODEL,
      key: env.FALLBACK_API_KEY,
      url: hosts[env.FALLBACK_PROVIDER],
      provider: env.FALLBACK_PROVIDER,
    });
  return candidates.filter((c) => c.key);
}
export const routerEnv = (env) => ({
  ...env,
  GROQ_MODEL: env.GROQ_ROUTER_MODEL || SMALL_MODEL,
});
export function completionBody(
  candidate,
  messages,
  { jsonMode = false, maxTokens = 4096, stream = false } = {},
) {
  const reasoning =
    candidate.provider === 'groq' &&
    /^openai\/gpt-oss-(20|120)b$/.test(candidate.model);
  return {
    model: candidate.model,
    messages,
    temperature: 0.2,
    ...(candidate.provider === 'together'
      ? { max_tokens: maxTokens }
      : {
          max_completion_tokens: reasoning
            ? Math.max(2048, maxTokens)
            : maxTokens,
        }),
    ...(stream ? { stream: true } : {}),
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    ...(reasoning ? { reasoning_effort: 'low', include_reasoning: false } : {}),
  };
}
