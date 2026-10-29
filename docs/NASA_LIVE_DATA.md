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
Chat routing depends on the deployed research function containing the current
`_shared/science-tools.js`. Direct access through the NASA button does not depend
on model routing. The endpoint still requires a signed-in user and the existing
research quota. No schema or authentication-policy changes are needed.

## Verification limits

- Local regression suite: 143 passing Node tests, including UTC boundaries,
  invalid ranges, missing measurements, partial upstream failures, secret
  forwarding/redaction and replayable chat tool payloads. Providers are mocked.
- Syntax check and frontend build with public test configuration pass.
- No authenticated NASA response has yet been verified in this session. The test
  browser is at the SpaceMind sign-in screen. Deployment success and mocked tests
  are not evidence that the saved NASA key is accepted.

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
