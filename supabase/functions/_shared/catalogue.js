import { cachedProvider } from './provider-cache.js';
const ENDPOINT = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
const NAME = String.raw`(?:Kepler-\d+|K2-\d+|TOI-\d+|WASP-\d+|HAT-P-\d+|HD\s+\d+|GJ\s+\d+|TRAPPIST-1)\s+[b-z]`;
const NUM = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`;
const key = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** Conservative v1 grammar: one planet and one explicit parameter per cited claim. */
export function parseClaim(text) {
  if (typeof text !== 'string' || text.length > 2000) return null;
  text = text.replace(/−/g, '-').replace(/\s*×\s*10\s*\^\s*([+-]?\d+)/g, 'e$1');
  const names = [...text.matchAll(new RegExp(`\\b${NAME}\\b`, 'gi'))];
  if (
    names.length !== 1 ||
    /\b(not|might|may|if|hypothetical|minimum|upper|lower|limit|approximately|about)\b|[<>?]/i.test(
      text,
    )
  )
    return null;
  const re = new RegExp(
    `^${NAME}(?:['’]s)?\\s+(?:has\\s+(?:an?\\s+)?)?(?:orbital\\s+)?(period|radius|mass)\\s*(?:is|of|=|:)\\s*(${NUM})(?:\\s*(?:±|\\+/-)\\s*(${NUM})|\\s*\\+(${NUM})\\s*-(${NUM}))?\\s*([A-Za-z_⊕♃]+(?:\\s+(?:radii|masses))?)\\s*(?:\\[\\d+\\]\\s*)*[.!]?$`,
    'i',
  );
  const m = text.trim().match(re);
  if (!m) return null;
  const value = Number(m[2]),
    plus =
      m[3] !== undefined
        ? Number(m[3])
        : m[4] !== undefined
          ? Number(m[4])
          : null,
    minus =
      m[3] !== undefined
        ? Number(m[3])
        : m[5] !== undefined
          ? Number(m[5])
          : null;
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    (plus !== null &&
      (!Number.isFinite(plus) ||
        !Number.isFinite(minus) ||
        plus < 0 ||
        minus < 0))
  )
    return null;
  return {
    name: names[0][0],
    parameter: m[1].toLowerCase(),
    value,
    plus,
    minus,
    unit: key(m[6]),
  };
}
/** Convert only explicit compatible units; choose native catalogue radius/mass units. */
export function conversion(parameter, unit) {
  const units = {
    period: {
      day: ['pl_orbper', 1],
      days: ['pl_orbper', 1],
      d: ['pl_orbper', 1],
      hours: ['pl_orbper', 1 / 24],
      h: ['pl_orbper', 1 / 24],
      seconds: ['pl_orbper', 1 / 86400],
      s: ['pl_orbper', 1 / 86400],
    },
    radius: {
      'earth radii': ['pl_rade', 1],
      r_earth: ['pl_rade', 1],
      'r⊕': ['pl_rade', 1],
      'jupiter radii': ['pl_radj', 1],
      r_jup: ['pl_radj', 1],
      'r♃': ['pl_radj', 1],
    },
    mass: {
      'earth masses': ['pl_masse', 1],
      m_earth: ['pl_masse', 1],
      'm⊕': ['pl_masse', 1],
      'jupiter masses': ['pl_massj', 1],
      m_jup: ['pl_massj', 1],
      'm♃': ['pl_massj', 1],
    },
  };
  return units[parameter]?.[unit] || null;
}
export function compare(claim, row) {
  const conversionPair = conversion(claim.parameter, claim.unit);
  const no = (reason) => ({ label: 'not comparable', reason });
  if (!conversionPair) return no('Units are not supported for this parameter.');
  const [column, factor] = conversionPair,
    value = row[column],
    hi = row[column + 'err1'],
    lo = row[column + 'err2'];
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    row[column + 'lim'] !== 0 ||
    !Number.isFinite(hi) ||
    !Number.isFinite(lo) ||
    hi < 0 ||
    lo > 0 ||
    claim.plus === null ||
    claim.minus === null
  )
    return no(
      'A measurement or explicit uncertainty is missing, or the catalogue value is a limit.',
    );
  const delta = claim.value * factor - value;
  const error = Math.hypot(
    (delta >= 0 ? claim.minus : claim.plus) * factor,
    delta >= 0 ? hi : -lo,
  );
  if (!(error > 0)) return no('No positive combined uncertainty.');
  const sigma = Math.abs(delta) / error;
  return {
    label: sigma > 3 ? 'tension' : 'agrees',
    sigma,
    reason:
      'Directional errors combined in quadrature; 3-sigma convention, independence assumed. This is not independent validation.',
  };
}
/** At most one cached TAP batch, 64 KB, 20 names/claims and a 3-second total budget. */
export async function verifyCatalogue(
  claims,
  { admin = null, fetcher = fetch } = {},
) {
  const parsed = claims
    .slice(0, 20)
    .map((c, i) => ({ i, claim: parseClaim(c.text) }))
    .filter((c) => c.claim);
  if (!parsed.length) return claims;
  const names = [...new Set(parsed.map((p) => key(p.claim.name)))].sort();
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Error('deadline'));
    }, 3000);
  });
  try {
    const result = await Promise.race([
      deadline,
      cachedProvider(
        admin,
        'catalogue-v1:' + names.join('|'),
        async () => {
          if (controller.signal.aborted) throw Error('deadline');
          const columns = [
            'pl_orbper',
            'pl_rade',
            'pl_radj',
            'pl_masse',
            'pl_massj',
          ].flatMap((c) => [c, c + 'err1', c + 'err2', c + 'lim']);
          const query = `SELECT TOP 21 pl_name,${columns.join(',')} FROM ps WHERE default_flag=1 AND LOWER(pl_name) IN (${names.map((n) => "'" + n.replaceAll("'", "''") + "'").join(',')})`;
          const url = new URL(ENDPOINT);
          url.search = new URLSearchParams({
            query,
            format: 'json',
          }).toString();
          const response = await fetcher(url.href, {
            signal: controller.signal,
            redirect: 'error',
          });
          if (!response.ok) throw Error('provider');
          const reader = response.body?.getReader();
          if (!reader) throw Error('empty');
          let size = 0,
            text = '';
          const decoder = new TextDecoder();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > 65536) throw Error('size');
              text += decoder.decode(value, { stream: true });
            }
            text += decoder.decode();
          } finally {
            await reader.cancel().catch(() => {});
          }
          const rows = JSON.parse(text);
          if (!Array.isArray(rows) || rows.length > 20) throw Error('rows');
          return { rows, retrieved_at: new Date().toISOString() };
        },
        { ttl: 3600 },
      ),
    ]);
    if (
      !Array.isArray(result.rows) ||
      !Number.isFinite(Date.parse(result.retrieved_at))
    )
      return claims;
    const output = claims.map((c) => ({ ...c }));
    for (const { i, claim } of parsed) {
      const matches = result.rows.filter(
        (r) =>
          typeof r?.pl_name === 'string' && key(r.pl_name) === key(claim.name),
      );
      if (matches.length !== 1) continue;
      output[i].catalogue_check = {
        ...compare(claim, matches[0]),
        parameter: claim.parameter,
        name: matches[0].pl_name,
        catalogue: 'NASA Exoplanet Archive',
        retrieved_at: result.retrieved_at,
        url:
          'https://exoplanetarchive.ipac.caltech.edu/overview/' +
          encodeURIComponent(matches[0].pl_name),
      };
    }
    return output;
  } catch {
    return claims;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
