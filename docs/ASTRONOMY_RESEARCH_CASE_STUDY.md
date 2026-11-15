# SpaceMind astronomy research case study

**Scope:** reproducible, local scientific checks using public observational and ephemeris data. This is a portfolio research exercise and software-validation record, not a peer-reviewed result or a claim of new astronomical discovery.

## Research questions

1. Can the SpaceMind Mission Lab transit recipe recover a known exoplanet's orbital period from a real Kepler light curve to a deliberately broad, predeclared tolerance?
2. Can a Gaia DR3 sample be filtered with explicit astrometric-quality cuts and have its absolute magnitudes calculated consistently with Astropy's distance modulus?
3. Does the application's osculating-element conversion reproduce a same-epoch JPL Horizons lunar state to numerical tolerance?

The three checks test different things: a data-analysis workflow, an astrometric calculation, and a numerical coordinate/state conversion. They should not be combined into one accuracy score.

## Data and provenance

| Investigation | Public source | Data used |
|---|---|---|
| TrES-2 b transit | [MAST Kepler archive](https://archive.stsci.edu/missions/kepler/) and [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/) | KIC 11446443 Q1 long-cadence FITS light curve; default planet solution for TrES-2 b |
| Gaia colour–magnitude sample | [Gaia DR3 TAP archive](https://gea.esac.esa.int/tap-server/) | Bounded 1-degree ICRS cone query centred at (56.75°, 24.12°), TOP 200 ordered by source ID |
| Lunar state | [JPL Horizons API](https://ssd.jpl.nasa.gov/horizons/) | Moon relative to Earth centres, DE441, JD 2461041.5 TDB, ICRF, geometric vectors (no aberration) and osculating elements |

Exact request URLs, retrieval timestamps, byte counts and SHA-256 hashes are recorded in [sources.json](../validation/observational/sources.json). The original FITS and API responses are fetched by the script; the committed provenance file records the reference run. A later fetch can legitimately produce different bytes or metadata.

## Methods

### 1. Exoplanet transit: TrES-2 b

- Read the archived FITS light curve and verify its time metadata (TIMESYS=TDB, BJDREFI=2454833).
- Use the pipeline-corrected PDCSAP_FLUX, supplied PDCSAP_FLUX_ERR and SAP_QUALITY.
- Retain finite cadences with quality flag zero; no synthetic transit is injected.
- Run the same transit recipe used by Mission Lab: a box least squares (BLS) period search over 2–3 days with a fixed 0.075-day box duration.
- Compare the recovered period with the NASA Exoplanet Archive default solution for TrES-2 b.

The acceptance threshold is an absolute period difference below 0.005 days, transit depth between 0.5% and 2.5%, and at least 1,000 accepted cadences. This is a broad recovery check, not a precision ephemeris requirement.

### 2. Gaia DR3 colour–magnitude sample

- Query a bounded cone for source ID, sky position, parallax and uncertainty, G magnitude, BP−RP colour and RUWE.
- Retain finite positive parallaxes, parallax-over-error greater than 10, finite photometry and RUWE below 1.4.
- Calculate absolute G magnitude using the inverse-parallax distance modulus.
- Independently calculate the distance modulus with astropy.coordinates.Distance and compare the two results.

The sample is a deterministic TOP 200 query, not a complete survey or a cluster-membership-selected population. The comparison checks implementation consistency, not the accuracy of Gaia measurements or the suitability of inverse parallax for every star.

### 3. Lunar state and orbital elements

- Retrieve a same-epoch DE441 geometric state and osculating elements from JPL Horizons.
- Convert the osculating elements to a position with the same Kepler solver and rotation convention used by the application.
- Compare the converted position with the Horizons vector and independently compare the two osculating periods using the Horizons Keplerian GM.

This is a same-epoch element/vector conversion check. It does not test long-term two-body propagation against a perturbed lunar ephemeris.

## Results

The committed reference run used CPython 3.12.14, NumPy 2.3.5, SciPy 1.17.0, Astropy 8.0.2 and Matplotlib 3.10.8. Machine-readable values and acceptance conditions are in [results.json](../validation/observational/results.json).

| Check | Result | Interpretation |
|---|---:|---|
| TrES-2 b accepted cadences | 1,410 / 1,639 | Quality-filtered real Kepler observations |
| BLS recovered period | 2.472236118 days | Compared with 2.470630 days in the archive |
| Absolute period difference | 0.001606118 days | Passes the broad 0.005-day criterion; larger than the archive's quoted 0.000010-day uncertainty |
| Transit depth | 0.010909 relative flux (about 1.09%) | Within the broad predeclared depth interval |
| Gaia rows retained | 193 / 200 | After stated quality cuts |
| Maximum difference in absolute G | 3.55 × 10⁻¹⁵ mag | Floating-point agreement between two implementations of the distance-modulus calculation |
| Lunar position difference | 4.67 × 10⁻¹⁰ km | Same-epoch element-to-vector numerical agreement |
| Lunar osculating-period difference | 9.31 × 10⁻¹⁰ s | Same-epoch period calculation agreement |

All three software checks pass their stated thresholds. That statement is limited to the recorded inputs, assumptions and comparisons.

## Limitations and interpretation

### TrES-2 b

- Only one quarter is analysed.
- The BLS box duration is fixed; no additional detrending or limb-darkening fit is performed.
- The recovered period difference is larger than the catalogue's quoted uncertainty. Passing the broad 0.005-day threshold must not be presented as precision ephemeris recovery.
- Grid spacing is not a confidence interval. The depth error is conditional on independent supplied photometric errors and excludes systematics.
- This check does not establish planet validation or a new measurement.

### Gaia DR3

- The TOP 200 sample is not complete and is not selected by cluster membership.
- Inverse parallaxes are used; no parallax zero-point or extinction correction, colour-excess cut, or photometric error propagation is applied.
- RUWE and parallax signal-to-noise cuts are quality filters, not proof that every retained source is astrophysically suitable.
- Near-zero agreement between the two absolute-magnitude calculations is a formula/implementation check, not an independent validation of catalogue accuracy.

### JPL Horizons

- The comparison is at one epoch and uses Horizons' combined Earth+Moon GM.
- It checks the element-to-state conversion, not the future accuracy of a two-body lunar trajectory.
- Horizons reference uncertainties are not supplied in this record; the tolerances measure numerical agreement only.

### General

- These are three targeted examples, not a representative astronomy benchmark.
- No peer review, independent astronomer assessment, or statistical uncertainty analysis is claimed.
- A passing numerical check does not validate the physical model, source assumptions or all application outputs.
- The separate 50-question deployed AI research evaluation remains unfinished; this case study does not provide an AI-answer accuracy score.

## Reproduction

Run from the repository root. Python 3.12.14 is the recorded environment.

```bash
npm ci
python -m venv .venv
# macOS / Linux
source .venv/bin/activate
# Windows PowerShell: .venv\\Scripts\\Activate.ps1
python -m pip install -r requirements-science.txt
python scripts/fetch-observational.py
python scripts/validate-observational.py
```

The fetch step needs network access to MAST, Gaia ESA TAP, the NASA Exoplanet Archive and JPL Horizons. Validation invokes Node.js to obtain the current Mission Lab recipes and orbital solver, then executes the generated Python recipes locally. Node.js dependencies must therefore be installed with npm ci.

The validation script verifies downloaded SHA-256 checksums before running. It writes generated Python, stdout, derived CSVs, plots and an updated results.json under validation/observational/. Preserve the original sources.json and results.json when you need to compare byte-identical inputs with the committed reference run. Do not compare a newly fetched run as though it used the original bytes.

## Software and tools

- Python 3.12 and NumPy for array-based data handling.
- Astropy for FITS, BLS periodograms (BoxLeastSquares), astronomical units, distances and coordinate-aware calculations.
- SciPy is pinned in the reproducible environment for the wider Mission Lab scientific-computing workflow; the three validation checks documented here do not directly call SciPy.
- Matplotlib for diagnostic plots.
- JavaScript/Node.js for the shared Mission Lab recipe and orbital-solver source.
- Public MAST, Gaia, NASA Exoplanet Archive and JPL Horizons data services.

Pandas is not listed as a dependency because the current reproducibility script uses NumPy/Astropy tables and does not require pandas. Add it only when a concrete tabular workflow needs it.

## Related project documentation

- [Observational validation record](../validation/observational/README.md)
- [Mission Lab and research status](STATUS.md)
- [Research evaluation protocol](EVALUATION_PROTOCOL.md)
- [Python local setup](LOCAL_PYTHON_SETUP.md)
