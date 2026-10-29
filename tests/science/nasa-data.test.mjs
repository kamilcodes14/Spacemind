import test from 'node:test';
import assert from 'node:assert/strict';
import {
  asteroidDates,
  asteroidRows,
  measurement,
  weatherSections,
} from '../../frontend/science/nasa-data.js';
import { validateTool } from '../../supabase/functions/_shared/science-tools.js';
import { queryProvider } from '../../supabase/functions/space-data/providers.js';

test('NASA defaults use seven inclusive UTC days across month/year boundaries', () => {
  const params = asteroidDates(new Date('2026-12-31T23:30:00-05:00'));
  assert.deepEqual(params, {
    start_date: '2027-01-01',
    end_date: '2027-01-07',
  });
  assert.deepEqual(validateTool({ kind: 'asteroids', params }).params, params);
});

test('NASA dates reject impossible dates, reversed ranges and eight calendar days', () => {
  for (const [start_date, end_date] of [
    ['2026-02-29', '2026-03-01'],
    ['2026-10-30', '2026-10-29'],
    ['2026-10-30', '2026-11-06'],
    ['not-a-date', '2026-11-01'],
  ])
    assert.throws(() =>
      validateTool({ kind: 'asteroids', params: { start_date, end_date } }),
    );
  assert.doesNotThrow(() =>
    validateTool({
      kind: 'asteroids',
      params: { start_date: '2028-02-29', end_date: '2028-02-29' },
    }),
  );
});

test('NASA secret is required, sent only upstream, and absent from returned data', async () => {
  const input = {
    kind: 'asteroids',
    params: { start_date: '2026-10-30', end_date: '2026-10-30' },
  };
  await assert.rejects(
    () => queryProvider(input, () => assert.fail('no call without key')),
    /NASA_API_KEY/,
  );
  const secret = 'test-only-secret';
  const result = await queryProvider(
    input,
    async (url) => {
      const u = new URL(url);
      assert.equal(u.origin, 'https://api.nasa.gov');
      assert.equal(u.searchParams.get('api_key'), secret);
      assert.equal(u.searchParams.get('end_date'), '2026-10-30');
      return Response.json({
        links: { self: url },
        near_earth_objects: {
          '2026-10-30': [
            {
              id: '123',
              name: 'Test asteroid',
              is_potentially_hazardous_asteroid: false,
              estimated_diameter: {
                meters: {
                  estimated_diameter_min: 12,
                  estimated_diameter_max: 24,
                },
              },
              close_approach_data: [
                {
                  close_approach_date: '2026-10-30',
                  miss_distance: { kilometers: '123456.78' },
                  relative_velocity: { kilometers_per_second: '8.12345' },
                },
              ],
              nasa_jpl_url:
                'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=123',
            },
          ],
        },
      });
    },
    { NASA_API_KEY: secret },
  );
  assert.equal(result.rows.length, 1);
  assert.equal(JSON.stringify(result).includes(secret), false);
  const row = asteroidRows(result.rows)[0];
  assert.equal(row['Miss distance · km'], '123,456.78');
  assert.equal(row['Relative speed · km/s'], '8.123');
  assert.equal(row['Potentially hazardous classification'], 'No');
  assert.match(row.url, /^https:\/\/ssd.jpl.nasa.gov/);
});

test('missing measurements and CME analyses remain unknown, never zero', () => {
  for (const v of [null, undefined, '', 'invalid'])
    assert.equal(measurement(v), '—');
  assert.equal(measurement(0), '0');
  const [cmes, flares] = weatherSections({
    cmes: [{ activityID: 'event', cmeAnalyses: [] }],
  });
  assert.equal(cmes.rows[0]['Analyzed speed · km/s'], '—');
  assert.equal(cmes.available, true);
  assert.equal(flares.available, false);
  assert.equal(weatherSections({ cmes: [] })[0].available, true);
});

test('DONKI uses configured NASA key, preserves partial failure, and never leaks key', async () => {
  const secret = 'test-only-donki-secret';
  const result = await queryProvider(
    { kind: 'weather', params: {} },
    async (url) => {
      if (url.startsWith('https://api.nasa.gov/')) {
        assert.equal(new URL(url).searchParams.get('api_key'), secret);
        return Response.json([
          {
            activityID: 'CME-test',
            startTime: '2026-10-30T00:00Z',
            cmeAnalyses: [{ isMostAccurate: true, speed: 700, type: 'C' }],
          },
        ]);
      }
      return new Response('', { status: 503 });
    },
    { NASA_API_KEY: secret },
  );
  assert.equal(result.warnings.length, 3);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(
    weatherSections(result.rows)[0].rows[0]['Analyzed speed · km/s'],
    '700',
  );
});

test('NASA rejection is an error, not an empty successful asteroid response', async () => {
  await assert.rejects(
    () =>
      queryProvider(
        { kind: 'asteroids', params: asteroidDates() },
        async () => new Response('', { status: 403 }),
        { NASA_API_KEY: 'test-invalid' },
      ),
    (e) => e.status === 503,
  );
});
