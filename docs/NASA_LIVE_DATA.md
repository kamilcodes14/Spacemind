# NASA Live Data — 30 October 2026

Open **NASA Live Data** in the signed-in workspace, or use **Mission lab**.
Choose asteroid approaches (up to seven calendar days, inclusive, in UTC) or
solar activity, then select **Fetch NASA / NOAA data**.

Asteroid results show NASA NeoWs close-approach time, miss distance (km), relative
speed (km/s), estimated diameter range (m), hazard classification and a JPL record
link. A potentially hazardous classification is not a collision prediction.
The initial range is today through six days later, calculated in UTC each time.

Solar activity separates NASA DONKI CME records from NOAA GOES flares, planetary
Kp and issued alerts. Missing feeds are marked unavailable, while available feeds
remain visible. An empty response does not mean all-clear. CME speed is shown only
from the analysis marked most accurate; missing measurements remain unknown.

Provider attribution, retrieval time, cached-result indication and scientific
limitations accompany results. JSON export retains the original returned data;
asteroid results also support CSV export. NASA credentials remain in Supabase
Edge Function secrets as `NASA_API_KEY`, never in the browser bundle.

The chat tool schema also supports `asteroids` with `start_date` and `end_date`.
Explicit requests to fetch/list/show asteroid approaches with one or two ISO dates
route directly to validated tool inputs; other wording uses the model router.
Chat routing depends on the deployed research function containing the current
`_shared/science-tools.js`. Direct access through the NASA button does not depend
on model routing. The endpoint still requires a signed-in user and the existing
research quota. No schema or authentication-policy changes are needed.

## Verification limits

- Local regression suite: 149 passing Node tests, including UTC boundaries,
  invalid ranges, missing measurements, partial upstream failures, secret
  forwarding/redaction and replayable chat tool payloads. Providers are mocked.
- Syntax check and frontend build with public test configuration pass.
- Authenticated uncached NeoWs request verified at 2026-10-29T19:16:18.224Z:
  six returned approaches for 29 October UTC. Seven inclusive days returned 37
  records; eight days were rejected. JSON and CSV exports each contained six
  records and no API-key or authorization fields.
- Explicit-date chat request verified at 2026-10-30T04:43:09.534Z: science tool
  rendered and fetched the same six NASA records, with source links and units.
- Solar activity verified at 2026-10-30T04:43:29.706Z: NASA DONKI CME records,
  NOAA GOES flares, Kp object records and alerts rendered in the signed-in UI.
  NASA's api.nasa.gov DONKI gateway returned HTTP 503 during testing. The
  backend now falls back to the documented public CCMC endpoint, identifies
  that fallback in the response and never forwards the NASA key to it.
- These are integration checks, not independent validation of upstream science
  or a general model-routing accuracy score. The 50-question evaluation remains
  separate and unfinished.

## Signed-in acceptance

1. Open NASA Live Data, choose a one-day range, fetch and check the NASA provider,
   timestamps and result rows (or an explicit empty result). A successful uncached
   NeoWs response verifies the configured NASA key; NOAA-only data does not.
2. Switch to Solar activity. Confirm the NASA DONKI section is available, check
   NOAA partial-failure notices, and open a source record.
3. Check seven inclusive days work and eight days are rejected before requesting.
4. Ask chat for asteroid approaches over an explicit one-day date range. Confirm
   the returned tool fetches records instead of inventing distances or risk.
5. Export JSON/CSV and verify dates, units, source attribution, and no API key.

This work does not complete the separate 50-question evaluation or Mission Lab
scientific-validation programme.

## Release record

PR #7 merged as `382f0bf948334c43bb2345d1591b0d56d3dd2e13` and deployed to
production. The Kp object-record display correction shipped as
`859cc90064dcfd9226858f71a34163714ee58410` (Vercel deployment
`dpl_2swCeFHaJATTUFwx6YmT1tq35nL3`, READY). Supabase `space-data` v7 adds
DONKI fallback; `research` v18 adds validated explicit-date asteroid routing.
Both Edge Functions retain JWT verification and existing account/quota checks.

The initial solar display error was caused by assuming NOAA Kp always used a
header-plus-rows array. Both that layout and object records are now tested.
The initial model-routed asteroid request asked for unrelated central-body
inputs; explicit ISO-date catalogue requests now bypass model argument creation.

NASA endpoint documentation: https://ccmc.gsfc.nasa.gov/DONKI/api/
