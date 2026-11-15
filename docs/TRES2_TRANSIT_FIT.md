# TrES-2 b physical transit fit

This analysis extends the existing BLS period-recovery check with a physical
quadratic-limb-darkened transit model. It is a separate research script and does
not change the Mission Lab UI or hosted application.

## Run

From the repository root, with the documented Python environment:

```bash
npm ci
python -m venv .venv
# Activate .venv, then:
python -m pip install -r requirements-science.txt
python scripts/fetch-observational.py
python scripts/validate-observational.py
python scripts/fit-tres2-transit.py
```

The fetch and validation steps create/check the Q1 FITS file and reference record.
The fit writes:

- `validation/observational/transit-fit/fit-results.json`
- `validation/observational/transit-fit/posterior-samples.csv`
- `validation/observational/transit-fit/folded-transit-fit.png`

## Model and inference

- Input: Kepler Q1 long-cadence PDCSAP flux for TrES-2 b (KIC 11446443).
- Time: BKJD = BJD_TDB − 2454833 days, verified against FITS headers.
- Cadences: finite flux/error, positive error, SAP_QUALITY = 0.
- Per-event baseline: weighted local linear fit to out-of-transit data; its
  formal uncertainty is propagated into normalized point errors.
- Transit: `batman-package`, quadratic limb darkening, exposure integration
  with 7 sub-samples over the 29.4244-minute Kepler long cadence.
- Orbit: circular (`e=0`) is fixed; epoch and period are fitted freely.
- Limb darkening: q1/q2 parameterization with uniform [0,1] priors, mapping
  into physically allowed quadratic coefficients.
- Noise: Gaussian likelihood using supplied photometric errors plus fitted
  extra white-noise jitter.
- Uncertainties: 16th/50th/84th posterior percentiles from `emcee` MCMC. Total duration is derived from each posterior sample for a circular orbit.

The period prior is uniform from 2.45 to 2.49 days; this is deliberately broad
enough to test the Q1 observations against the archive ephemeris rather than
forcing the catalogue period. The reference archive period, transit depth, radius ratio, impact parameter and transit duration (when populated by the archive query) are recorded in the comparison section of the output JSON. Catalogue depth is
contextual: it may represent a different data combination and model.

## Scientific cautions

TrES-2 b is a near-grazing system. Published work emphasizes strong correlations
between the radius ratio, impact parameter and limb-darkening assumptions.
The posterior intervals are conditional on this one-quarter dataset, selected
baseline model, circular orbit, limb-darkening prior and white-noise likelihood.
They do not include a complete systematic-error budget, time-correlated noise,
third-light dilution or model-selection uncertainty.

The script does not claim a new measurement or discovery. The output must be
reviewed for MCMC convergence (chain length versus autocorrelation time,
acceptance fraction, posterior shape and residual structure) before quoting
numbers in a CV or research abstract. An astronomy researcher should review the
method and literature comparison.

## References

- Kreidberg (2015), `batman`: https://lkreidberg.github.io/batman/docs/html/index.html
- Kreidberg, `batman` quickstart and exposure integration API:
  https://lkreidberg.github.io/batman/docs/html/quickstart.html
- A consistent analysis of three years of ground- and space-based photometry
  of TrES-2: https://doi.org/10.1051/0004-6361/201118536
- Photometrically derived masses and radii of the planet and star in the
  TrES-2 system: https://doi.org/10.1088/0004-637X/761/1/53
- NASA Exoplanet Archive, TrES-2 b:
  https://exoplanetarchive.ipac.caltech.edu/overview/TrES-2


## Posterior diagnostic audit

After a fit has completed, run the separate audit without rerunning the sampler:

```bash
python scripts/diagnose-tres2-posterior.py
```

It reconstructs the saved walker trajectories from the flattened CSV and writes
`posterior-diagnostics.json`. The report includes rank-normalized and folded
split-\hat{R}, an approximate rank-normalized bulk effective sample size,
selected posterior correlations and walker-median outliers. It is intended to
make chain disagreement visible rather than relying on a single acceptance
fraction or a single autocorrelation-time estimate.

**Interpretation caveat:** walkers in an `emcee` ensemble are coupled and are
not independent chains in the usual MCMC sense. Therefore the split-\hat{R}
and ESS values produced here are screening diagnostics, not formally calibrated
convergence guarantees. A strong follow-up is to run multiple independently
initialized ensembles, compare their posterior distributions, inspect residuals
and test sensitivity to plausible baseline/noise and orbital assumptions.
Do not discard an outlying walker or narrow priors merely to improve a metric.
