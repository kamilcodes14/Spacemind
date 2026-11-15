"""Fit a physical transit model to Kepler Q1 observations of TrES-2 b.

Run after scripts/fetch-observational.py and scripts/validate-observational.py.
Times are BKJD = BJD_TDB - 2454833, as verified from the source FITS headers.
The orbital period is fitted freely (not fixed to the archive value).
"""
from __future__ import annotations

import csv
import json
import pathlib
import sys

import batman
import emcee
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from astropy.io import fits

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "validation" / "observational"
FIT = DATA / "transit-fit"
FIT.mkdir(parents=True, exist_ok=True)
RNG = np.random.default_rng(20261116)
N_WALKERS = 40
N_STEPS = 2400
BURN_IN = 800
THIN = 8
LONG_CADENCE_DAYS = 29.4244 / 1440.0
SUPERSAMPLE = 7


def load_observations():
    results = json.loads((DATA / "results.json").read_text())
    epoch_guess = float(results["transit"]["epoch_bkjd_tdb_days"])
    period_guess = float(results["transit"]["period_days"])
    reference = results["transit"]["reference"]

    fits_path = DATA / "tres2-q1.fits"
    if not fits_path.exists():
        raise FileNotFoundError(
            f"{fits_path} missing; run python scripts/fetch-observational.py first."
        )

    with fits.open(fits_path, memmap=False) as hdus:
        header = hdus[1].header
        if header.get("TIMESYS") != "TDB" or header.get("BJDREFI") != 2454833:
            raise ValueError("Unexpected Kepler time metadata; refusing to assume BKJD/TDB.")
        table = hdus[1].data
        time = np.asarray(table["TIME"], dtype=float)
        flux = np.asarray(table["PDCSAP_FLUX"], dtype=float)
        error = np.asarray(table["PDCSAP_FLUX_ERR"], dtype=float)
        quality = np.asarray(table["SAP_QUALITY"], dtype=int)

    valid = (
        np.isfinite(time) & np.isfinite(flux) & np.isfinite(error)
        & (error > 0) & (quality == 0)
    )
    time, flux, error = time[valid], flux[valid], error[valid]
    order = np.argsort(time)
    time, flux, error = time[order], flux[order], error[order]
    if len(time) < 100:
        raise ValueError(f"Only {len(time)} valid cadences; expected a usable Q1 light curve.")

    # Use the BLS epoch/period only to identify windows. The physical fit below
    # varies both epoch and period, so the archive period is not imposed.
    event_number = np.rint((time - epoch_guess) / period_guess).astype(int)
    centers = epoch_guess + event_number * period_guess
    offset = time - centers
    keep = np.abs(offset) <= 0.16

    all_time, all_flux, all_error, event_ids = [], [], [], []
    for event in np.unique(event_number[keep]):
        select = keep & (event_number == event)
        dt = time[select] - (epoch_guess + event * period_guess)
        f = flux[select]
        e = error[select]
        oot = (np.abs(dt) >= 0.095) & (np.abs(dt) <= 0.16)
        if oot.sum() < 3 or len(dt) < 7:
            continue

        # Weighted local linear baseline, with conservative 3-sigma clipping.
        design = np.column_stack([np.ones(oot.sum()), dt[oot]])
        weights = 1.0 / np.square(e[oot])
        active = np.ones(oot.sum(), dtype=bool)
        for _ in range(3):
            x = design[active]
            w = weights[active]
            y = f[oot][active]
            covariance = np.linalg.pinv(x.T @ (w[:, None] * x))
            coefficients = covariance @ (x.T @ (w * y))
            residual = f[oot] - design @ coefficients
            scale = 1.4826 * np.median(np.abs(residual - np.median(residual)))
            if not np.isfinite(scale) or scale <= 0:
                break
            next_active = np.abs(residual) < 3.0 * scale
            if next_active.sum() < 3 or np.array_equal(next_active, active):
                break
            active = next_active

        x_all = np.column_stack([np.ones(len(dt)), dt])
        baseline = x_all @ coefficients
        baseline_variance = np.einsum("ij,jk,ik->i", x_all, covariance, x_all)
        if np.any(baseline <= 0):
            continue

        # Propagate both point-photometry and fitted-baseline uncertainty.
        normalized_flux = f / baseline
        normalized_error = np.sqrt(
            np.square(e / baseline)
            + np.square(f * np.sqrt(np.maximum(baseline_variance, 0.0)) / np.square(baseline))
        )
        all_time.append(time[select])
        all_flux.append(normalized_flux)
        all_error.append(normalized_error)
        event_ids.append(np.full(len(dt), event, dtype=int))

    if not all_time:
        raise RuntimeError("No complete transit windows survived the baseline selection.")

    t = np.concatenate(all_time)
    y = np.concatenate(all_flux)
    dy = np.concatenate(all_error)
    event = np.concatenate(event_ids)
    order = np.argsort(t)
    return t[order], y[order], dy[order], event[order], epoch_guess, period_guess, reference


def make_model(t):
    params = batman.TransitParams()
    params.t0 = float(np.median(t))
    params.per = 2.47063
    params.rp = 0.125
    params.a = 7.5
    params.inc = 83.5
    params.ecc = 0.0
    params.w = 90.0
    params.u = [0.3, 0.2]
    params.limb_dark = "quadratic"
    model = batman.TransitModel(
        params, t, supersample_factor=SUPERSAMPLE, exp_time=LONG_CADENCE_DAYS
    )
    return params, model


def transform_limb_darkening(q1, q2):
    root = np.sqrt(q1)
    return 2.0 * root * q2, root * (1.0 - 2.0 * q2)


def log_probability(theta, t, y, dy, model, params, epoch_guess, period_guess):
    # theta = [t0, period, Rp/R*, a/R*, impact, q1, q2, ln(extra scatter)]
    t0, period, rp, a_rs, impact, q1, q2, ln_jitter = theta
    if not (
        epoch_guess - 0.2 < t0 < epoch_guess + 0.2
        and 2.45 < period < 2.49
        and 0.05 < rp < 0.20
        and 4.0 < a_rs < 20.0
        and 0.0 <= impact < 1.0 + rp
        and impact < a_rs
        and 0.0 < q1 < 1.0
        and 0.0 < q2 < 1.0
        and -16.0 < ln_jitter < -5.0
    ):
        return -np.inf

    u1, u2 = transform_limb_darkening(q1, q2)
    params.t0 = t0
    params.per = period
    params.rp = rp
    params.a = a_rs
    params.inc = float(np.degrees(np.arccos(impact / a_rs)))
    params.ecc = 0.0
    params.w = 90.0
    params.u = [float(u1), float(u2)]
    jitter = np.exp(ln_jitter)

    try:
        prediction = model.light_curve(params)
    except (ValueError, FloatingPointError):
        return -np.inf
    sigma = np.sqrt(np.square(dy) + jitter**2)
    residual = (y - prediction) / sigma
    return float(-0.5 * np.sum(residual**2 + np.log(2.0 * np.pi * sigma**2)))


def quantile_summary(samples, names):
    summary = {}
    for index, name in enumerate(names):
        low, median, high = np.quantile(samples[:, index], [0.16, 0.50, 0.84])
        summary[name] = {
            "median": float(median),
            "minus_1sigma": float(median - low),
            "plus_1sigma": float(high - median),
            "q16": float(low),
            "q50": float(median),
            "q84": float(high),
        }
    return summary


def main():
    t, y, dy, event_ids, epoch_guess, period_guess, reference = load_observations()
    params, model = make_model(t)
    names = ["t0_bkjd_tdb", "period_days", "rp_over_rstar", "a_over_rstar",
             "impact_parameter", "q1", "q2", "ln_jitter"]
    center = np.array([
        epoch_guess, period_guess, 0.125, 7.5, 0.84, 0.30, 0.50, np.log(2e-4)
    ])
    scales = np.array([2e-4, 2e-5, 8e-4, 0.08, 0.015, 0.025, 0.025, 0.12])
    initial = []
    while len(initial) < N_WALKERS:
        proposal = center + RNG.normal(size=len(center)) * scales
        if np.isfinite(log_probability(
            proposal, t, y, dy, model, params, epoch_guess, period_guess
        )):
            initial.append(proposal)
    sampler = emcee.EnsembleSampler(
        N_WALKERS, len(names), log_probability,
        args=(t, y, dy, model, params, epoch_guess, period_guess),
    )
    sampler.run_mcmc(np.asarray(initial), N_STEPS, progress=True)
    samples = sampler.get_chain(discard=BURN_IN, thin=THIN, flat=True)
    if len(samples) < 1000:
        raise RuntimeError("Too few posterior samples; increase N_STEPS or reduce THIN.")

    summary = quantile_summary(samples, names)
    period_ref = float(reference["pl_orbper"])
    depth_ref = reference.get("pl_trandep")
    best = np.median(samples, axis=0)
    t0, period, rp, a_rs, impact, q1, q2, ln_jitter = best
    u1, u2 = transform_limb_darkening(q1, q2)
    inclination = np.degrees(np.arccos(impact / a_rs))
    params.t0, params.per, params.rp, params.a = t0, period, rp, a_rs
    params.inc, params.u = float(inclination), [float(u1), float(u2)]
    dense_time = np.linspace(t0 - 0.12, t0 + 0.12, 1500)
    dense_model = batman.TransitModel(params, dense_time, supersample_factor=SUPERSAMPLE, exp_time=LONG_CADENCE_DAYS)
    dense_flux = dense_model.light_curve(params)
    fitted_depth_percent = float((1.0 - np.min(dense_flux)) * 100.0)
    duration_days = (period / np.pi) * np.arcsin(
        np.sqrt(np.maximum((1.0 + samples[:, 2])**2 - samples[:, 4]**2, 0.0))
        / (samples[:, 3] * np.sqrt(1.0 - np.square(samples[:, 4] / samples[:, 3])))
    )
    duration_hours = duration_days * 24.0

    try:
        autocorr = sampler.get_autocorr_time(tol=0)
        autocorr_values = [float(x) for x in autocorr]
    except Exception:
        autocorr_values = None

    acceptance = float(np.mean(sampler.acceptance_fraction))
    report = {
        "target": "TrES-2 b / KIC 11446443",
        "data": {
            "source_file": "tres2-q1.fits",
            "cadences_used": int(len(t)),
            "transit_events_used": int(len(np.unique(event_ids))),
            "time_system": "BKJD = BJD_TDB - 2454833 days",
            "flux": "PDCSAP_FLUX, locally normalized per transit",
            "quality": "SAP_QUALITY == 0; finite positive uncertainties",
            "exposure_integration": {
                "cadence_minutes": 29.4244,
                "supersample_factor": SUPERSAMPLE
            }
        },
        "model": {
            "package": "batman-package",
            "limb_darkening": "quadratic; q1/q2 parameterization with uniform [0,1] priors",
            "eccentricity": 0.0,
            "eccentricity_assumption": "fixed circular orbit",
            "period": "fitted freely with uniform prior 2.45–2.49 days",
            "baseline": "weighted local linear fit to out-of-transit points for each event",
            "likelihood": "Gaussian with supplied flux errors plus fitted extra white-noise jitter"
        },
        "sampler": {
            "package": "emcee",
            "walkers": N_WALKERS,
            "steps": N_STEPS,
            "burn_in": BURN_IN,
            "thin": THIN,
            "posterior_samples": int(len(samples)),
            "mean_acceptance_fraction": acceptance,
            "autocorrelation_time_steps": autocorr_values,
            "random_seed": 20261116
        },
        "posterior": summary,
        "derived": {
            "inclination_degrees": {
                "median": float(inclination),
                "q16": float(np.quantile(np.degrees(np.arccos(samples[:, 4] / samples[:, 3])), 0.16)),
                "q84": float(np.quantile(np.degrees(np.arccos(samples[:, 4] / samples[:, 3])), 0.84))
            },
            "fitted_model_depth_percent": fitted_depth_percent,
            "fitted_limb_darkening_u1": float(u1),
            "fitted_limb_darkening_u2": float(u2),
            "total_transit_duration_hours": {
                "median": float(np.median(duration_hours)),
                "q16": float(np.quantile(duration_hours, 0.16)),
                "q84": float(np.quantile(duration_hours, 0.84))
            }
        },
        "literature_comparison": {
            "archive": "NASA Exoplanet Archive default planet solution included in the fetched reference record",
            "reference_period_days": period_ref,
            "fitted_period_days": summary["period_days"]["median"],
            "period_difference_days": float(summary["period_days"]["median"] - period_ref),
            "reference_transit_depth_percent": float(depth_ref) if depth_ref is not None else None,
            "fitted_model_depth_percent": fitted_depth_percent,
            "fitted_radius_ratio": summary["rp_over_rstar"]["median"],
            "published_radius_ratio": reference.get("pl_ratror"),
            "radius_ratio_difference": (
                float(summary["rp_over_rstar"]["median"] - float(reference["pl_ratror"]))
                if reference.get("pl_ratror") is not None else None
            ),
            "fitted_impact_parameter": summary["impact_parameter"]["median"],
            "published_impact_parameter": reference.get("pl_imppar"),
            "impact_parameter_difference": (
                float(summary["impact_parameter"]["median"] - float(reference["pl_imppar"]))
                if reference.get("pl_imppar") is not None else None
            ),
            "fitted_duration_hours": float(np.median(duration_hours)),
            "published_duration_hours": reference.get("pl_trandur"),
            "duration_difference_hours": (
                float(np.median(duration_hours) - float(reference["pl_trandur"]))
                if reference.get("pl_trandur") is not None else None
            ),
            "depth_difference_percentage_points": (
                float(fitted_depth_percent - float(depth_ref))
                if depth_ref is not None else None
            ),
            "note": "Archive parameters are a catalogue default solution and may combine different data/assumptions; compare as context, not as a same-instrument repeat measurement. pl_trandep is interpreted in percent and pl_trandur in hours per Exoplanet Archive column units."
        },
        "limitations": [
            "Only one Kepler Q1 long-cadence quarter is fitted.",
            "The circular orbit assumption is fixed; eccentricity is not measured.",
            "The quadratic limb-darkening law is fitted with broad physically transformed priors, but stellar-atmosphere-informed priors are not applied.",
            "TrES-2 b is near-grazing; radius ratio, impact parameter and limb darkening can be strongly correlated.",
            "The local linear normalization and its propagated formal uncertainty do not fully capture correlated stellar/instrumental systematics.",
            "The Gaussian likelihood plus white-noise jitter does not model time-correlated noise.",
            "The posterior intervals are conditional on the stated model, priors, data selection and normalization; they are not a complete systematic-error budget.",
            "Third-light dilution is not fitted.",
            "The result is a reproducible analysis exercise, not a new discovery or peer-reviewed measurement."
        ]
    }
    (FIT / "fit-results.json").write_text(json.dumps(report, indent=2))
    with (FIT / "posterior-samples.csv").open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(names)
        writer.writerows(samples)

    # Fold on the fitted ephemeris for a diagnostic plot; the fit itself used
    # the un-folded times so period/epoch information is retained.
    phase = ((t - t0 + period / 2.0) % period) - period / 2.0
    order = np.argsort(phase)
    phase_grid = np.linspace(-0.14, 0.14, 1200)
    folded_params = batman.TransitParams()
    folded_params.t0, folded_params.per = 0.0, period
    folded_params.rp, folded_params.a = rp, a_rs
    folded_params.inc = float(inclination)
    folded_params.ecc, folded_params.w = 0.0, 90.0
    folded_params.u, folded_params.limb_dark = [float(u1), float(u2)], "quadratic"
    folded_model = batman.TransitModel(folded_params, phase_grid, supersample_factor=SUPERSAMPLE, exp_time=LONG_CADENCE_DAYS)
    curve = folded_model.light_curve(folded_params)

    fig, (ax, residual_ax) = plt.subplots(
        2, 1, figsize=(9, 7), sharex=True, gridspec_kw={"height_ratios": [3, 1]}
    )
    ax.errorbar(phase, y, yerr=dy, fmt=".", ms=3, alpha=0.45, lw=0.5, label="Kepler Q1 data")
    ax.plot(phase_grid, curve, lw=2, label="batman posterior-median model")
    ax.set_ylabel("Normalized relative flux")
    ax.legend()
    ax.set_title("TrES-2 b — Kepler Q1 transit fit")
    residual_ax.errorbar(
        phase, y - model.light_curve(params), yerr=dy, fmt=".", ms=3, alpha=0.5, lw=0.5
    )
    residual_ax.axhline(0.0, lw=1)
    residual_ax.set_xlabel("Time from fitted transit centre (days)")
    residual_ax.set_ylabel("Residual")
    fig.tight_layout()
    fig.savefig(FIT / "folded-transit-fit.png", dpi=180)
    plt.close(fig)

    print(json.dumps({
        "output": str(FIT),
        "period_days": summary["period_days"],
        "rp_over_rstar": summary["rp_over_rstar"],
        "impact_parameter": summary["impact_parameter"],
        "acceptance_fraction": acceptance,
        "posterior_samples": int(len(samples))
    }, indent=2))


if __name__ == "__main__":
    main()
