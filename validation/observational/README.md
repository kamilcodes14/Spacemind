# Observational benchmarks — 25 October 2026

These records are genuine local executions of the same recipe generator and orbital
solver used by Mission Lab. They are **not** signed-in browser/deployed-stack acceptance.
`results.json` records thresholds, results, units, time systems, assumptions and limits.
`sources.json` records exact archive requests, retrieval times and SHA256 checksums.

Reproduce from the repository root using the Python versions in `results.json`:

```sh
python scripts/fetch-observational.py
python scripts/validate-observational.py
```

Fetching again can change data/retrieval metadata. Preserve the committed sources.json
if comparing byte identity with this run. Original FITS and plots are not committed;
the fetch script retrieves the public FITS. Derived lightcurve.csv contains Kepler
TIME, PDCSAP_FLUX, PDCSAP_FLUX_ERR and SAP_QUALITY, without synthetic injections.
Other CSV/JSON files capture the actual bounded catalogue and reference responses.

- TrES-2 b (KIC 11446443), Kepler Q1: 1,410/1,639 quality=0 finite cadences.
  BLS recovers 2.472236118 days versus the archive's 2.470630 days. The absolute
  difference is 0.001606118 days, larger than the catalogue's quoted uncertainty.
  This passes the preregistered broad 0.005-day recovery check, **not** a precision
  ephemeris check. Fixed box duration, finite cadence and model mismatch matter;
  the 0.000500250-day grid spacing is not a confidence interval. Depth errors are
  conditional on independent supplied photometric errors, excluding systematics.
- Gaia DR3 cone sample: 193/200 retained, RUWE < 1.4 where supplied, parallax/error
  > 10. Absolute G agrees with Astropy distance modulus within 3.56e-15 mag.
  This checks the calculation, not catalogue accuracy, extinction, membership or
  completeness. The plotted sample has an apparent main sequence and outliers;
  neither is interpreted as a selected cluster population.
- Moon relative to Earth, JD 2461041.5 TDB, DE441 geometric ICRF vectors/elements:
  app Kepler solver plus explicit element rotations agrees within 4.67e-10 km;
  period within 9.32e-10 s. Uses Horizons' combined Earth+Moon GM. This is a
  same-epoch conversion benchmark, not evidence that a two-body future trajectory
  matches the perturbed lunar ephemeris. Reference uncertainty is not supplied.

The folded light curve and CMD were visually reviewed: transit morphology and axes
are readable, magnitude axis is inverted, and the captions retain model limitations.
No rating or generalized science-accuracy percentage is inferred.

Authoritative documentation:
- https://archive.stsci.edu/kepler/manuals/archive_manual.pdf
- https://spacetelescope.github.io/notebooks/notebooks/MAST/Kepler/Kepler_Lightcurve/kepler_lightcurve.html
- https://exoplanetarchive.ipac.caltech.edu/overview/TrES-2
- https://www.cosmos.esa.int/web/gaia/dr3
- https://www.cosmos.esa.int/web/gaia/dr3-software-tools
- https://ssd.jpl.nasa.gov/horizons/manual.html
- https://ssd-api.jpl.nasa.gov/doc/horizons.html
