# SpaceMind Mission lab

Open **Mission lab** in the workspace header, or ask in **Auto research** mode. Examples:

- “Calculate a Hohmann transfer from a 400 km Earth orbit to 35,786 km.”
- “Show a 400 × 1,200 km Earth orbit at 51.6° inclination.”
- “Get the Moon's position relative to Earth at 2026-01-01 00:00:00 UTC.”
- “Show recent solar flares and CMEs.”
- “Search PDS for Mars.”

The router returns validated tool inputs. It does not claim to have executed code. Known calculation templates run in the client when a new chat response arrives; custom/edited code requires Run. Reopening a conversation restores the original tool inputs without automatically re-running code or fetching data. Python results are not sent back to the language model. Papers-only and Web-research modes retain their existing retrieval behavior; use Auto or Mission lab for tools.

## Python and kernels

Pyodide 314.0.7 runs Python in a worker inside a sandboxed opaque-origin iframe. The frame receives no application credentials. Its CSP restricts network access to scientific package hosts; it cannot access the application's DOM, cookies or local storage. Stop/reset terminates the worker and clears its files. A 120-second execution limit includes initial loading. Large first loads may need retrying on a slow connection. Output and plots have size limits.

NumPy, SciPy, Astropy and Matplotlib load on first use. Skyfield 1.55 is an optional package. SpiceyPy 8.2.0 automatically loads for SPICE templates; browser SPICE is experimental. Poliastro is **not included** because its released Python/compiled-dependency requirements are incompatible with this runtime. The supported two-body transfer and orbit recipes use Astropy units, NumPy and SciPy instead.

Upload one file at a time, up to 64 MB each. SPICE state queries need a planetary/spacecraft BSP plus the TLS leap-second kernel and any additional supporting kernels appropriate to the mission. The [NASA NAIF archive](https://naif.jpl.nasa.gov/naif/data.html) provides kernels. The small planetary `de432s.bsp` and `naif0012.tls` support a Moon/Earth example within the SPK's coverage. Positions depend on kernel version, reference frame, aberration settings and epoch. The template uses J2000 geometric states (`NONE`), km and km/s, and reports the kernel filenames. Missing coverage produces a SPICE error, not an estimated answer.

## Visual models

Orbit controls change central body, apsides and inclination; the burn handle or sliders apply radial/prograde impulses at the original periapsis. The mint conic shows the resulting osculating trajectory. The visualization can show mathematically intersecting-body or unbound conics; it is not an impact or escape mission simulation. Constellation planes and coverage cones use spherical line-of-sight geometry. Earth ground tracks use approximate GMST; optional J2 applies nodal precession only.

Hohmann views show the full transfer ellipse and endpoint circles. Transfer time is half a period. Solar examples omit planetary escape/capture and launch-window phasing. Lagrange cards solve the circular restricted three-body equilibrium points and provide an interactive 3D view of their orbital plane. None of these models substitutes for operational trajectory validation.

## Data and deployment

The authenticated `space-data` Supabase function accesses fixed endpoints: JPL Horizons, STScI MAST, NASA PDS, NOAA SWPC, NASA CCMC DONKI, and The Space Devs Launch Library 2. It shares the existing account research quota, bounds request/response sizes, has upstream timeouts, caches for five minutes per isolate, and reports partial weather-feed failures. Outbound calls are serialized per isolate; this is not a global distributed provider rate limiter. Higher traffic needs a shared provider queue before increasing quotas.

Horizons returns geometric equatorial ICRF vectors with explicit input/output UT times (UTC since 1962; UT1 earlier). Ephemerides are modeled states, not spacecraft telemetry. MAST provides the first page of observations and raw/processed product metadata and links; downloading restricted products may require archive access. PDS keyword search follows the archive's own indexing, with a limited first page. A keyword can match descriptions that do not appear in the title. Launch schedules are community-maintained NET times. Source URLs, retrieval times, raw Horizons output, and JSON downloads are provided. No ESA-specific archive connector is included in this release.

Deploy `space-data` and the updated `research` function with `verify_jwt = true`, including their `_shared` dependencies. No database migration or new API secret is required. Deploy the frontend using the existing Vercel project's public Supabase configuration. Keep the existing origin allowlist; preview domains require an explicit `ALLOWED_ORIGINS` entry for authenticated API tests.

Run `npm run check`, `npm test`, `npm run test:db` and `npm run build` (with public Supabase configuration). The scientific tests cover known orbit/transfer benchmarks, conic geometry, Lagrange force balance, routing, provider parsing and authentication. Browser verification must additionally exercise real WASM loading, CSP isolation, cancellation, upload and WebGL controls.
