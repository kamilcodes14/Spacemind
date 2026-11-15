# Observational benchmarks — 25 October 2026

**Full research write-up:** [SpaceMind astronomy research case study](../../docs/ASTRONOMY_RESEARCH_CASE_STUDY.md).

These records are genuine local executions of the same recipe generator and orbital
solver used by Mission Lab. They are **not** signed-in browser/deployed-stack acceptance.
`results.json` records thresholds, results, units, time systems, assumptions and limits.
`sources.json` records exact archive requests, retrieval times and SHA256 checksums.

## Existing observational checks

Reproduce from the repository root:

```sh
python scripts/fetch-observational.py
python scripts/validate-observational.py
```

- TrES-2 b (KIC 11446443), Kepler Q1: 1,410/1,639 quality=0 finite cadences.
  BLS recovers 2.472236118 days versus the archive's 2.470630 days. The absolute
  difference is 0.001606118 days, larger than the catalogue's quoted uncertainty.
  This passes the broad 0.005-day recovery check, **not** a precision ephemeris check.
- Gaia DR3 cone sample: 193/200 retained; absolute G agrees with Astropy distance
  modulus within 3.56e-15 mag. This checks formula implementation, not Gaia accuracy.
- Moon relative to Earth, JD 2461041.5 TDB, DE441: same-epoch element-to-vector
  numerical agreement within 4.67e-10 km. This is not future two-body propagation.

## Physical TrES-2 b transit fit

A separate physical transit fit is implemented in
[`scripts/fit-tres2-transit.py`](../../scripts/fit-tres2-transit.py) and documented in
[`docs/TRES2_TRANSIT_FIT.md`](../../docs/TRES2_TRANSIT_FIT.md).

After the existing fetch and validation steps, run:

```sh
python scripts/fit-tres2-transit.py
```

The script uses `batman-package` with Kepler long-cadence exposure integration and
`emcee` to sample the posterior for epoch, orbital period, planet/star radius ratio,
scaled semimajor axis, impact parameter and quadratic limb-darkening parameters.
It writes posterior samples, a JSON report and a folded light-curve/residual plot under
`validation/observational/transit-fit/`.

**Important:** no fitted values are committed as measured results until the script is
run against the downloaded FITS file and the MCMC chain is checked for convergence.
The inference assumes a circular orbit and a specified local-baseline/noise model.
TrES-2 b is near-grazing, so radius ratio, impact parameter and limb darkening can be
strongly correlated. The output is a research workflow, not a peer-reviewed result.

The original FITS and plots are not committed; the fetch script retrieves the public FITS.
The source FITS headers are checked for TIMESYS=TDB and BJDREFI=2454833. The original
reference run's source hashes and detailed limitations remain recorded in
`sources.json` and `results.json`.

## Provenance and limits

The exact request URLs, retrieval timestamps, byte counts and SHA-256 hashes are in
`sources.json`. Fetching again can change bytes or metadata. Preserve the committed
provenance file when comparing byte identity with the reference run.

The Gaia TOP 200 sample is not complete or cluster-membership selected; no extinction
or parallax zero-point correction is applied. The lunar comparison uses Horizons'
combined Earth+Moon GM and is a same-epoch conversion check. No generalized science
accuracy score is inferred.

Authoritative documentation:
- https://archive.stsci.edu/missions/kepler/manuals/archive_manual.pdf
- https://spacetelescope.github.io/notebooks/notebooks/MAST/Kepler/Kepler_Lightcurve/kepler_lightcurve.html
- https://exoplanetarchive.ipac.caltech.edu/overview/TrES-2
- https://www.cosmos.esa.int/web/gaia/dr3
- https://ssd.jpl.nasa.gov/horizons/manual.html
- https://ssd-api.jpl.nasa.gov/doc/horizons.html
