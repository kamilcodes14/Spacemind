// Presentation only: all provider requests and credentials stay in space-data.
export function asteroidDates(now = new Date(), days = 7) {
  if (!Number.isInteger(days) || days < 1 || days > 7)
    throw new RangeError('Choose between one and seven calendar days.');
  const start = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z');
  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: new Date(start.getTime() + (days - 1) * 86400000)
      .toISOString()
      .slice(0, 10),
  };
}

export function asteroidDateRange({ start_date, end_date }) {
  const parse = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return NaN;
    const time = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
      ? time : NaN;
  };
  const start = parse(start_date), end = parse(end_date);
  const max_end_date = Number.isFinite(start)
    ? new Date(start + 6 * 86400000).toISOString().slice(0, 10) : '';
  if (!Number.isFinite(start) || !Number.isFinite(end))
    return { valid: false, days: null, max_end_date, message: 'Choose a valid start date and end date. Dates are UTC.' };
  const days = (end - start) / 86400000 + 1;
  if (days < 1)
    return { valid: false, days, max_end_date, message: `Choose an end date on or after ${start_date}. Dates are UTC.` };
  if (days > 7)
    return { valid: false, days, max_end_date, message: `${days} calendar days selected. Choose ${max_end_date} or earlier (maximum 7 days, including both dates).` };
  return { valid: true, days, max_end_date, message: `${days} of 7 calendar days selected · UTC · Both dates included.` };
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

function freshnessLabel(data,feed) { const f=data.freshness?.[feed]; if(!f) return 'Freshness unknown'; if(f.age_minutes===null) return 'Observation timestamp unavailable'; return (f.stale?'STALE · ':'')+'Observation age '+f.age_minutes+' min'; }
function weatherMetric(host, title, value, unit, stamp, status='') {
 const card=document.createElement('article');card.className='sw-metric';
 const label=document.createElement('span');label.className='sw-label';label.textContent=title;
 const main=document.createElement('strong');main.className='sw-value';main.textContent=value==null?'Unavailable':String(value);
 const units=document.createElement('span');units.className='sw-unit';units.textContent=value==null?'No verified observation':unit;
 const time=document.createElement('small');time.className='sw-time';time.textContent=stamp?'Observed '+stamp:'Observation time unavailable';
 card.append(label,main,units,time);if(status){const note=document.createElement('small');note.className='sw-time';note.textContent=status;card.append(note);}host.append(card);
}
function chart(host,title,rows,key,label,unit) {
 const section=document.createElement('section');section.className='sw-chart';
 const h=document.createElement('h4');h.textContent=title;section.append(h);
 const values=rows.map(r=>Number(r?.[key])).filter(Number.isFinite);
 if(values.length<2){const p=document.createElement('p');p.className='science-note';p.textContent='Not enough valid observations for a historical plot.';section.append(p);host.append(section);return;}
 const w=620,hg=150,pad=12,min=Math.min(...values),max=Math.max(...values),span=max-min||1;
 const points=values.map((v,i)=>[pad+i*(w-2*pad)/(values.length-1),hg-pad-(v-min)*(hg-2*pad)/span]);
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${w} ${hg}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',`${title}, ${values.length} recent ${label} observations in ${unit}`);
 const path=document.createElementNS(ns,'polyline');path.setAttribute('points',points.map(p=>p.join(',')).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','2.5');path.setAttribute('vector-effect','non-scaling-stroke');svg.append(path);
 points.forEach(([x,y],i)=>{const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r','3.5');dot.setAttribute('fill','currentColor');dot.setAttribute('tabindex','0');const tip=document.createElementNS(ns,'title');tip.textContent=`Observation ${i+1}: ${values[i]} ${unit}`;dot.append(tip);svg.append(dot);});
 const range=document.createElement('p');range.className='science-note';range.textContent=`Recent ${values.length} records · ${min.toPrecision(3)}–${max.toPrecision(3)} ${unit}`;section.append(svg,range);host.append(section);
}
export function renderSpaceWeather(host,data,{el,link}) {
 const latest=data.latest||{},rows=data.rows||{};
 const grid=document.createElement('div');grid.className='sw-grid';
 const plasma=latest.plasma||{},mag=latest.mag||{},kp=latest.kp||{};
 const kpValue=kp.value;
 const kpClass=kpValue==null?'Unavailable':kpValue>=9?'G5 · Extreme':kpValue>=8?'G4 · Severe':kpValue>=7?'G3 · Strong':kpValue>=6?'G2 · Moderate':kpValue>=5?'G1 · Minor':'Below G1 threshold';
 weatherMetric(grid,'Solar wind speed',plasma.speed_km_s,'km/s',plasma.time_tag,freshnessLabel(data,'plasma'));
 weatherMetric(grid,'Proton density',plasma.density_cm3,'protons/cm³',plasma.time_tag,freshnessLabel(data,'plasma'));
 weatherMetric(grid,'Proton temperature',plasma.temperature_k,'K',plasma.time_tag,freshnessLabel(data,'plasma'));
 weatherMetric(grid,'Magnetic field |B|',mag.bt_nt,'nT',mag.time_tag,freshnessLabel(data,'mag'));
 weatherMetric(grid,'GSM Bz',mag.bz_gsm_nt,'nT',mag.time_tag,freshnessLabel(data,'mag')+' · Negative Bz can favor solar-wind coupling; context matters.');
 weatherMetric(grid,'Planetary Kp',kpValue,'0–9 index',kp.time_tag,kpClass+' · '+freshnessLabel(data,'kp'));
 host.append(grid);
 const plots=document.createElement('div');plots.className='sw-plots';
 chart(plots,'Solar-wind speed · last observations',rows.plasma,'speed','speed','km/s');
 chart(plots,'Proton density · last observations',rows.plasma,'density','density','protons/cm³');
 chart(plots,'Geomagnetic Kp · recent records',normalizeWeatherRows(rows.kp),'Kp','kp_index','index');
 chart(plots,'Magnetic field strength · recent observations',rows.mag,'bt','Bt','nT');
 chart(plots,'GSM Bz · recent observations',rows.mag,'bz_gsm','Bz','nT');
 host.append(plots);
 const flareRows=(rows.flares||[]).map(r=>({'Begin · UTC':r.begin_time??r.time_tag??'—','Peak · UTC':r.max_time??'—','Class':r.max_class??'—','End · UTC':r.end_time??'—'}));
 host.append(el('h4',null,'Solar flare events · NOAA GOES'));
 if(flareRows.length) renderSimpleTable(host,flareRows,el); else host.append(el('p','science-note','No flare records returned. This is not an all-clear.'));
 const freshness=el('p','science-status',`Retrieved ${data.retrieved_at||'unknown'} · UTC. Per-feed observation times are shown above. Retrieval time is not observation time.`);host.append(freshness);
 const note=el('p','science-note','Kp is a geomagnetic activity index; G1 begins at Kp 5. C/M/X are solar flare classes and are not geomagnetic storm levels. A solar flare alone does not establish an Earth-impacting storm. Measurements are observations, not forecasts.');host.append(note);
 for(const warning of data.warnings||[])host.append(el('p','notice',warning));
 const src=link('https://www.swpc.noaa.gov/','NOAA SWPC source ↗');if(src)host.append(src);
}
function normalizeWeatherRows(value) {
 if(!Array.isArray(value)) return [];
 if(Array.isArray(value[0])) return value.slice(1).map(r=>Object.fromEntries(value[0].map((k,i)=>[k,r[i]])));
 return value;
}
function renderSimpleTable(host,rows,el) {
 const scroll=el('div','science-table-scroll'),table=el('table','science-table'),head=el('thead'),tr=el('tr'),body=el('tbody');
 Object.keys(rows[0]).forEach(k=>tr.append(el('th',null,k)));head.append(tr);
 rows.forEach(row=>{const r=el('tr');Object.values(row).forEach(v=>r.append(el('td',null,String(v??'—'))));body.append(r);});
 table.append(head,body);scroll.append(table);host.append(scroll);
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
