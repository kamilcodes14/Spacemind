import { HttpError } from './http.js';
export async function cachedProvider(
  admin,
  key,
  load,
  { serialized = false, ttl = 300 } = {},
) {
  if (!admin) return load();
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const cached = await admin
    .from('provider_cache')
    .select('value')
    .eq('key', hash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (cached.data) return { ...cached.data.value, cached: true };
  if (serialized) {
    const lease = await admin.rpc('lease_provider', {
      p_key: 'horizons',
      p_seconds: 35,
    });
    if (lease.error)
      throw new HttpError(503, 'This data source is temporarily unavailable.');
    if (!lease.data)
      throw new HttpError(
        429,
        'The ephemeris service is busy. Please retry in a moment.',
      );
  }
  try {
    const data = await load();
    const write = await admin.from('provider_cache').upsert({
      key: hash,
      value: data,
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
    });
    if (write.error)
      console.warn(JSON.stringify({ event: 'provider_cache_write_failed' }));
    return data;
  } finally {
    if (serialized)
      await admin.from('provider_slots').delete().eq('key', 'horizons');
  }
}
export function serviceClient(createClient, env) {
  return env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
}
