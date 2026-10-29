import { advancedDefaults, advancedTitles } from './advanced-recipes.js';
import { csv } from './notebook.js';
import { mountPython } from './python-client.js';
import { mountViewer, mountLagrange } from './viewer.js';
import { recipe } from './recipes.js';
import { asteroidDates, renderNASA } from './nasa-data.js';
import {
  validateTool,
  TOOL_ORIGIN,
} from '../../supabase/functions/_shared/science-tools.js';
const cleanups = new Map();
const titles = {
  ...advancedTitles,
  gaia: 'ESA Gaia DR3',
  esa: 'ESA XMM-Newton',
  simbad: 'SIMBAD',
  vizier: 'VizieR Gaia catalogue',
  exoplanets: 'NASA Exoplanet Archive',
  orbit: 'Orbit playground',
  hohmann: 'Hohmann transfer',
  rocket: 'Delta-v budget',
  spice: 'SPICE kernel query',
  horizons: 'JPL Horizons',
  mast: 'MAST archive',
  pds: 'Planetary Data System',
  asteroids: 'NASA Live Data · Asteroid approaches',
  weather: 'NASA / NOAA · Solar activity',
  launches: 'Launch schedule',
  lagrange: 'Lagrange points',
  python: 'Python workspace',
  'mast-products': 'Observation products',
};
const defaults = {
  ...advancedDefaults,
  gaia: { ra: 56.75, dec: 24.12, radius: 1 },
  esa: { ra: 83.633, dec: 22.0145, radius: 0.5 },
  simbad: { ra: 83.633, dec: 22.0145, radius: 0.02 },
  vizier: { ra: 56.75, dec: 24.12, radius: 0.1 },
  exoplanets: { query: 'Kepler-22' },
  orbit: { body: 'Earth', periapsis: 400, apoapsis: 1200, inclination: 51.6 },
  hohmann: { body: 'Earth', start: 400, end: 35786 },
  rocket: { isp: 320, wet: 10000, dry: 4000 },
  spice: { target: '301', observer: '399', epoch: '2026-01-01T00:00:00Z' },
  horizons: { target: '301', observer: '399', epoch: '2026-01-01T00:00:00Z' },
  mast: { ra: 83.633, dec: 22.0145, radius: 0.02 },
  pds: { query: 'Mars' },
  weather: {},
  launches: {},
  lagrange: { system: 'Earth–Moon' },
  python: {
    code: 'import numpy as np\nfrom astropy import units as u\n\n# Example: circular orbit speed at 400 km Earth altitude.\nmu = 398600.4418 * u.km**3 / u.s**2\nr = (6378.137 + 400) * u.km\nprint(np.sqrt(mu/r).to(u.km/u.s))\n',
  },
};
const labels = {
  start_date: 'Start date · UTC',
  end_date: 'End date · UTC',
  filename: 'Uploaded CSV filename',
  burns: 'Burns · m/s, comma separated',
  margin: 'Delta-v margin · %',
  minimum: 'Minimum period · days',
  maximum: 'Maximum period · days',
  duration: 'Transit duration · days',
  altitude: 'Initial altitude · km',
  days: 'Duration · days',
  ballistic: 'Mass / (Cd × area) · kg/m²',
  density: 'Initial atmospheric density · kg/m³',
  scale: 'Density scale height · km',
  body: 'Central body',
  start: 'Initial altitude · km',
  end: 'Final altitude · km',
  isp: 'Specific impulse · s',
  wet: 'Wet mass · kg',
  dry: 'Dry mass · kg',
  target: 'Target NAIF ID',
  observer: 'Observer NAIF ID',
  epoch: 'Epoch · UTC ISO 8601',
  ra: 'Right ascension · degrees',
  dec: 'Declination · degrees',
  radius: 'Cone radius · degrees',
  query: 'Dataset keywords',
  system: 'Two-body system',
};
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text) n.textContent = text;
  return n;
}
function button(text, fn, primary = false) {
  const b = el('button', primary ? 'primary' : 'secondary', text);
  b.type = 'button';
  b.onclick = fn;
  return b;
}
function download(data, name, type = 'application/json') {
  const a = document.createElement('a'),
    url = URL.createObjectURL(
      new Blob(
        [typeof data === 'string' ? data : JSON.stringify(data, null, 2)],
        { type },
      ),
    );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function link(url, text) {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    const a = el('a', null, text);
    a.href = u.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  } catch {
    return null;
  }
}
function renderData(host, data) {
  host.replaceChildren();
  host.append(
    el(
      'p',
      'science-status',
      `${data.provider} · Retrieved ${data.retrieved_at}${data.cached ? ' · Cached (up to 5 min)' : ''}`,
    ),
    el('p', 'science-note', data.note),
  );
  const source = link(
    data.kind === 'asteroids' ? 'https://api.nasa.gov/' : data.source,
    data.kind === 'asteroids' ? 'NASA NeoWs source ↗' : 'Open source ↗',
  );
  if (source) host.append(source);
  if (data.sources?.cmes)
    host.append(
      link('https://ccmc.gsfc.nasa.gov/tools/DONKI/', 'NASA DONKI source ↗'),
    );
  if (data.warnings?.length)
    host.append(el('p', 'notice', data.warnings.join(' ')));
  host.append(
    button('Download result', () =>
      download(data, 'spacemind-' + data.kind + '.json'),
    ),
  );
  if (['asteroids', 'weather'].includes(data.kind)) {
    if (Array.isArray(data.rows))
      host.append(
        button('Download CSV', () =>
          download(csv(data.rows), 'spacemind-asteroids.csv', 'text/csv'),
        ),
      );
    renderNASA(host, data, { el, link });
    return;
  }
  if (Array.isArray(data.rows)) {
    host.append(
      button('Download CSV', () =>
        download(csv(data.rows), 'spacemind-' + data.kind + '.csv', 'text/csv'),
      ),
    );
    if (data.kind === 'gaia' && data.rows.length > 1)
      host.append(
        button('Plot HR diagram', () => {
          const code = recipe('hrdiagram', {
            filename: 'spacemind-gaia.csv',
          }).replace(
            `data=Table.read("/work/spacemind-gaia.csv",format='ascii.csv')`,
            'import json\ndata=Table(rows=json.loads(' +
              JSON.stringify(JSON.stringify(data.rows)) +
              '))',
          );
          mountPython(host, code, {
            context: {
              kind: 'hrdiagram',
              provider: data.provider,
              source: data.source,
              retrieved_at: data.retrieved_at,
              note: data.note,
            },
          });
        }),
      );
    if (!data.rows.length) {
      host.append(
        el(
          'p',
          'muted',
          'No matching records were returned. Try a different query.',
        ),
      );
      return;
    }
    const scroll = el('div', 'science-table-scroll'),
      table = el('table', 'science-table');
    const keys = Object.keys(data.rows[0]).filter(
      (k) => !['files', 'labels', 'url'].includes(k),
    );
    const tr = el('tr');
    keys.forEach((k) => tr.append(el('th', null, k.replaceAll('_', ' '))));
    tr.append(el('th', null, 'Open'));
    const head = el('thead');
    head.append(tr);
    table.append(head);
    const tbody = el('tbody');
    for (const row of data.rows) {
      const r = el('tr');
      keys.forEach((k) => r.append(el('td', null, String(row[k] ?? '—'))));
      const action = el('td');
      if (data.kind === 'mast')
        action.append(
          button('Products', async () => {
            const resultHost = el('div');
            host.append(resultHost);
            await fetchData(resultHost, {
              kind: 'mast-products',
              params: { obsid: row.obsid },
            });
          }),
        );
      else {
        const a = link(row.url, 'Open ↗');
        if (a) action.append(a);
        for (const uri of [...(row.files || []), ...(row.labels || [])].slice(
          0,
          6,
        )) {
          const a = link(uri, 'File ↗');
          if (a) action.append(a);
        }
      }
      r.append(action);
      tbody.append(r);
    }
    table.append(tbody);
    scroll.append(table);
    host.append(scroll);
  } else {
    for (const [feed, rows] of Object.entries(data.rows || {})) {
      host.append(
        el('h4', null, feed),
        el('pre', 'science-json', JSON.stringify(rows, null, 2)),
      );
    }
  }
  if (data.raw) {
    const d = el('details'),
      summary = el('summary', null, 'Provider response and reference frame');
    d.append(summary, el('pre', 'science-json', data.raw));
    host.append(d);
  }
}
async function fetchData(host, tool, trigger) {
  if (host.getAttribute('aria-busy') === 'true') return;
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-busy', 'true');
  if (trigger) trigger.disabled = true;
  host.replaceChildren(
    el('p', 'pending', 'Querying the scientific data source…'),
  );
  try {
    const data = await window.SpaceMindBackend.request('/space-data', {
      method: 'POST',
      body: JSON.stringify(tool),
    });
    renderData(host, data);
  } catch (e) {
    host.replaceChildren(
      el('p', 'error', e.message),
      button('Retry', () => fetchData(host, tool, trigger)),
    );
  } finally {
    host.setAttribute('aria-busy', 'false');
    if (trigger) trigger.disabled = false;
  }
}
export function mountTool(host, input, { live = false, saved = true } = {}) {
  let tool;
  try {
    tool = validateTool(input);
  } catch {
    host.append(
      el(
        'p',
        'error',
        'This saved tool request is invalid. Open Mission lab to start a new calculation.',
      ),
    );
    return;
  }
  const card = el('section', 'science-card');
  card.append(
    el('p', 'eyebrow', 'RESEARCH TOOL'),
    el('h3', null, titles[tool.kind]),
  );
  host.append(card);
  const disposers = [];
  card.append(
    el(
      'p',
      'science-note',
      (saved
        ? 'Original tool inputs are saved with this conversation. '
        : 'Mission lab inputs are temporary. ') +
        'Python output and uploaded files are temporary; download results you want to keep.',
    ),
  );
  if (tool.kind === 'hohmann') {
    card.append(
      el(
        'p',
        'science-note',
        'Coplanar transfer between circular orbits. The full transfer ellipse and endpoint circles are shown; the transfer takes half a period. Interplanetary examples omit planetary escape/capture and launch-window phasing.',
      ),
    );
    disposers.push(
      mountViewer(card, {
        body: tool.params.body,
        periapsis: Math.min(tool.params.start, tool.params.end),
        apoapsis: Math.max(tool.params.start, tool.params.end),
        inclination: 0,
        transfer: true,
      }),
    );
  }
  if (tool.kind === 'orbit') {
    disposers.push(mountViewer(card, tool.params));
    const details = el('details'),
      summary = el('summary', null, 'Verify the original orbit in Python');
    details.append(summary);
    card.append(details);
    disposers.push(
      mountPython(details, recipe('orbit', tool.params), { context: tool }),
    );
  } else if (tool.kind === 'lagrange')
    disposers.push(mountLagrange(card, tool.params.system));
  else if (
    [
      'hohmann',
      'rocket',
      'spice',
      'python',
      ...Object.keys(advancedDefaults),
    ].includes(tool.kind)
  ) {
    if (tool.kind === 'spice') {
      card.append(
        el(
          'p',
          'notice',
          'Experimental browser SPICE. Upload matching .bsp and .tls kernels before running. Accuracy and available epochs depend on those kernels.',
        ),
      );
      const a = link(
        'https://naif.jpl.nasa.gov/naif/data.html',
        'NASA kernel archive ↗',
      );
      card.append(a);
    }
    disposers.push(
      mountPython(
        card,
        tool.kind === 'python'
          ? tool.params.code
          : recipe(tool.kind, tool.params),
        {
          auto: live && ['hohmann', 'rocket'].includes(tool.kind),
          context: tool,
        },
      ),
    );
  } else {
    const result = el('div', 'science-results');
    const fetchButton = button(
      'Fetch data',
      () => fetchData(result, tool, fetchButton),
      true,
    );
    card.append(fetchButton, result);
    if (live) fetchData(result, tool, fetchButton);
  }
  cleanups.set(card, () => disposers.forEach((fn) => fn?.()));
}
new MutationObserver(() => {
  for (const [card, dispose] of cleanups)
    if (!card.isConnected) {
      dispose();
      cleanups.delete(card);
    }
}).observe(document.documentElement, { childList: true, subtree: true });
function openLab(initialKind) {
  let dialog = document.getElementById('scienceDialog');
  if (dialog) {
    if (titles[initialKind]) {
      const select = dialog.querySelector('select[aria-label="Research tool"]');
      select.value = initialKind;
      select.onchange();
    }
    dialog.showModal();
    return;
  }
  dialog = el('dialog', 'science-dialog');
  dialog.id = 'scienceDialog';
  const heading = el('div', 'dialog-heading');
  heading.append(
    el('h2', null, 'Mission lab'),
    button('Close', () => dialog.close()),
  );
  const body = el('div', 'science-lab-body'),
    select = el('select');
  select.setAttribute('aria-label', 'Research tool');
  Object.entries(titles)
    .filter(([k]) => k !== 'mast-products')
    .forEach(([k, t]) => {
      const o = el('option', null, t);
      o.value = k;
      select.append(o);
    });
  const form = el('form'),
    fields = el('div', 'science-fields'),
    output = el('div'),
    notice = el(
      'p',
      'science-note',
      'Editable examples. Set the inputs for your own research before running.',
    );
  let values = {};
  function update() {
    output.replaceChildren();
    fields.replaceChildren();
    values =
      select.value === 'asteroids'
        ? asteroidDates()
        : { ...defaults[select.value] };
    notice.textContent =
      select.value === 'asteroids'
        ? 'NASA Live Data · Select up to seven calendar days, including both dates. Dates are UTC. These are catalogue forecasts, not live tracking.'
        : select.value === 'weather'
          ? 'NASA DONKI coronal mass ejections and NOAA solar flares, Kp and alerts. Source observations may lag; this is research data.'
          : 'Editable examples. Set the inputs for your own research before running.';
    open.textContent = ['asteroids', 'weather'].includes(select.value)
      ? 'Fetch NASA / NOAA data'
      : 'Open tool';
    if (['orbit', 'python'].includes(select.value)) return;
    for (const [key, value] of Object.entries(values)) {
      const label = el('label', null, labels[key] || key);
      let input;
      if (key === 'body' || key === 'system') {
        input = el('select');
        (key === 'body'
          ? ['Earth', 'Moon', 'Mars', 'Sun']
          : ['Earth–Moon', 'Sun–Earth']
        ).forEach((v) => {
          const o = el('option', null, v);
          o.value = v;
          input.append(o);
        });
      } else {
        input = el('input');
        input.type = key.endsWith('_date')
          ? 'date'
          : typeof value === 'number'
            ? 'number'
            : 'text';
        if (typeof value === 'number') input.step = 'any';
      }
      input.value = value;
      input.required = true;
      input.oninput = () =>
        (values[key] =
          typeof value === 'number' ? Number(input.value) : input.value);
      label.append(input);
      fields.append(label);
    }
  }
  const open = el('button', 'primary', 'Open tool');
  open.type = 'submit';
  const shortcuts = el('div', 'science-actions');
  for (const [kind, title] of [
    ['asteroids', 'NASA Live Data'],
    ['weather', 'Solar activity'],
  ]) {
    shortcuts.append(
      button(title, () => {
        select.value = kind;
        update();
      }),
    );
  }
  form.append(shortcuts, select, notice, fields, open);
  body.append(form, output);
  dialog.append(heading, body);
  document.body.append(dialog);
  select.onchange = update;
  form.onsubmit = (e) => {
    e.preventDefault();
    output.replaceChildren();
    try {
      mountTool(output, validateTool({ kind: select.value, params: values }), {
        saved: false,
        live: ['asteroids', 'weather'].includes(select.value),
      });
    } catch (err) {
      output.append(el('p', 'error', err.message));
    }
  };
  dialog.addEventListener('close', () => {
    output.replaceChildren();
    dialog.remove();
  });
  if (titles[initialKind]) select.value = initialKind;
  update();
  dialog.showModal();
}
window.SpaceMindScience = { mountTool, open: openLab, origin: TOOL_ORIGIN };
