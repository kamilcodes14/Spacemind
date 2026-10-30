// Presentation only: all provider requests and credentials stay in space-data.
export function asteroidDates(now = new Date()) {
  const start = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: new Date(start.getTime() + 6 * 86400000)
      .toISOString()
      .slice(0, 10),
  };
}

export function measurement(value, digits = 2) {
  if (value == null || value === '' || !Number.isFinite(Number(value)))
    return '—';
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: digits,
  });
}

export function asteroidRows(rows) {
  return rows.map((r) => ({
    Name: r.name ?? '—',
    'Close approach · UTC': r.close_approach_utc ?? r.date ?? '—',
    'Miss distance · km': measurement(r.miss_distance_km),
    'Relative speed · km/s': measurement(r.relative_velocity_km_s, 3),
    'Estimated diameter · m': `${measurement(r.estimated_diameter_min_m)} – ${measurement(r.estimated_diameter_max_m)}`,
    'Potentially hazardous classification':
      r.potentially_hazardous_asteroid === true
        ? 'Yes'
        : r.potentially_hazardous_asteroid === false
          ? 'No'
          : 'Unknown',
    url: r.source,
  }));
}

export function weatherSections(feeds = {}) {
  const array = (v) => (Array.isArray(v) ? v : []);
  return [
    {
      key: 'cmes',
      title: 'Coronal mass ejections · NASA DONKI',
      rows: array(feeds.cmes).map((r) => {
        const analysis = array(r.cmeAnalyses).find((a) => a.isMostAccurate);
        return {
          Event: r.activityID ?? '—',
          'Start · UTC': r.startTime ?? '—',
          'Analyzed speed · km/s': measurement(analysis?.speed),
          Type: analysis?.type ?? '—',
          url: r.link,
        };
      }),
    },
    {
      key: 'flares',
      title: 'Solar flares · NOAA GOES',
      rows: array(feeds.flares).map((r) => ({
        'Begin · UTC': r.begin_time ?? r.time_tag ?? '—',
        'Peak · UTC': r.max_time ?? '—',
        Class: r.max_class ?? '—',
        'End · UTC': r.end_time ?? '—',
      })),
    },
    {
      key: 'kp',
      title: 'Planetary Kp index · NOAA',
      // NOAA may return a header-plus-rows table or records keyed by field.
      // The legacy provider prepends the first item; keep only recent records.
      rows: Array.isArray(feeds.kp?.[0])
        ? array(feeds.kp)
            .slice(1)
            .filter(Array.isArray)
            .map((r) =>
              Object.fromEntries(
                feeds.kp[0].map((key, i) => [key, r[i] ?? '—']),
              ),
            )
        : array(feeds.kp)
            .filter((r) => r && typeof r === 'object')
            .slice(-12),
    },
    {
      key: 'alerts',
      title: 'Issued alerts · NOAA',
      rows: array(feeds.alerts).map((r) => ({
        Product: r.product_id ?? '—',
        'Issued · UTC': r.issue_datetime ?? '—',
        Message: r.message ?? '—',
      })),
    },
  ].map((s) => ({ ...s, available: Array.isArray(feeds[s.key]) }));
}

export function renderNASA(host, data, { el, link }) {
  function table(rows) {
    if (!rows.length) {
      host.append(
        el(
          'p',
          'science-note',
          'No records returned for this period. This is not an all-clear or an impact assessment.',
        ),
      );
      return;
    }
    const scroll = el('div', 'science-table-scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'Scrollable NASA and NOAA results');
    const t = el('table', 'science-table');
    const head = el('thead'),
      heading = el('tr'),
      body = el('tbody');
    const keys = Object.keys(rows[0]).filter((key) => key !== 'url');
    const hasLinks = rows.some((r) => r.url);
    for (const key of [...keys, ...(hasLinks ? ['Source record'] : [])]) {
      const th = el('th', null, key);
      th.scope = 'col';
      heading.append(th);
    }
    head.append(heading);
    for (const row of rows) {
      const tr = el('tr');
      for (const key of keys)
        tr.append(el('td', null, String(row[key] ?? '—')));
      if (hasLinks) {
        const td = el('td'),
          a = link(row.url, 'Open record ↗');
        if (a) td.append(a);
        else td.textContent = '—';
        tr.append(td);
      }
      body.append(tr);
    }
    t.append(head, body);
    scroll.append(t);
    host.append(scroll);
  }
  if (data.kind === 'asteroids') {
    host.append(
      el(
        'p',
        'science-status',
        `${data.request.start_date} → ${data.request.end_date} · UTC · ${data.rows.length} returned approaches`,
      ),
    );
    host.append(
      el(
        'p',
        'science-note',
        '“Potentially hazardous” is a catalogue classification, not a prediction that an asteroid will hit Earth.',
      ),
    );
    table(asteroidRows(data.rows));
  } else {
    for (const section of weatherSections(data.rows)) {
      host.append(el('h4', null, section.title));
      if (section.available) table(section.rows);
      else
        host.append(
          el(
            'p',
            'notice',
            'This feed is unavailable. Other available feeds are shown below.',
          ),
        );
    }
    const raw = el('details');
    raw.append(
      el('summary', null, 'Original provider records'),
      el('pre', 'science-json', JSON.stringify(data.rows, null, 2)),
    );
    host.append(raw);
  }
}
