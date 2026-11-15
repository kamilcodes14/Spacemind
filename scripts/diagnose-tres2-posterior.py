"""Diagnose an existing TrES-2 b emcee posterior without rerunning the fit.

Reads the flattened, step-major/walker-minor CSV written by fit-tres2-transit.py.
Reports rank-normalized split R-hat, bulk ESS, parameter correlations, and
walker-median outliers. These diagnostics are screening evidence, not a
substitute for checking model adequacy or independent runs.
"""
from __future__ import annotations

import csv
import json
import pathlib

import numpy as np
from scipy.special import ndtri
from scipy.stats import rankdata

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIT = ROOT / "validation" / "observational" / "transit-fit"
RANK_OFFSET = 3.0 / 8.0


def read_samples():
    report = json.loads((FIT / "fit-results.json").read_text())
    with (FIT / "posterior-samples.csv").open(newline="") as handle:
        reader = csv.reader(handle)
        names = next(reader)
        samples = np.asarray([[float(x) for x in row] for row in reader], dtype=float)
    nwalkers = int(report["sampler"]["walkers"])
    if samples.ndim != 2 or samples.shape[1] != len(names):
        raise ValueError("Posterior CSV shape does not match its header.")
    if len(samples) % nwalkers:
        raise ValueError("Posterior row count is not divisible by walker count.")
    if not np.all(np.isfinite(samples)):
        raise ValueError("Posterior contains non-finite values.")
    # emcee flat=True ordering is step-major, then walker.
    chains = samples.reshape(-1, nwalkers, len(names)).transpose(1, 0, 2)
    return report, names, samples, chains


def split_chains(chains):
    half = chains.shape[1] // 2
    if half < 4:
        raise ValueError("Too few saved draws per walker to split chains.")
    return np.concatenate(
        (chains[:, :half, :], chains[:, -half:, :]), axis=0
    )


def rank_normalize(values):
    flat = values.ravel()
    ranks = rankdata(flat, method="average")
    z = ndtri((ranks - RANK_OFFSET) / (len(ranks) - 2 * RANK_OFFSET + 1))
    return z.reshape(values.shape)


def basic_rhat(chains):
    m, n = chains.shape
    chain_means = chains.mean(axis=1)
    within = chains.var(axis=1, ddof=1).mean()
    between = n * chain_means.var(ddof=1)
    if within <= 0:
        return float("inf")
    var_hat = ((n - 1) / n) * within + between / n
    return float(np.sqrt(var_hat / within))


def rank_split_rhat(chains):
    ranked = rank_normalize(chains)
    rank_rhat = basic_rhat(ranked)
    folded = np.abs(chains - np.median(chains))
    folded_rank_rhat = basic_rhat(rank_normalize(folded))
    return max(rank_rhat, folded_rank_rhat), rank_rhat, folded_rank_rhat


def autocorrelation_fft(x):
    x = np.asarray(x, dtype=float)
    x = x - x.mean()
    n = len(x)
    size = 1 << (2 * n - 1).bit_length()
    spectrum = np.fft.rfft(x, n=size)
    acov = np.fft.irfft(spectrum * spectrum.conjugate(), n=size)[:n]
    if acov[0] <= 0:
        return np.ones(n)
    # Biased autocovariance normalization is suitable for this ESS estimate.
    return acov / acov[0]


def bulk_ess(chains):
    """Approximate bulk ESS using rank-normalized split chains and Geyer pairs."""
    ranked = rank_normalize(chains)
    acfs = np.asarray([autocorrelation_fft(c) for c in ranked])
    rho = acfs.mean(axis=0)
    # Geyer's initial-positive paired sequence: (rho_0+rho_1), (rho_2+rho_3), ...
    pair_sums = []
    for lag in range(0, len(rho) - 1, 2):
        pair = float(rho[lag] + rho[lag + 1])
        if pair <= 0:
            break
        pair_sums.append(pair)
    if not pair_sums:
        tau = 1.0
    else:
        # Enforce a non-increasing sequence of paired sums.
        for i in range(1, len(pair_sums)):
            pair_sums[i] = min(pair_sums[i], pair_sums[i - 1])
        tau = max(1.0, -1.0 + 2.0 * sum(pair_sums))
    return float(ranked.size / tau), float(tau)


def main():
    report, names, samples, chains = read_samples()
    split = split_chains(chains)
    rows = {}
    print("TR ES-2 b POSTERIOR DIAGNOSTICS")
    print(f"Walkers: {chains.shape[0]} | saved draws/walker: {chains.shape[1]}")
    print(f"Split chains: {split.shape[0]} | draws/split chain: {split.shape[1]}")
    print("\nParameter                 rank-Rhat   bulk-ESS   tau-est")
    for j, name in enumerate(names):
        rhat, rank_rhat, folded_rhat = rank_split_rhat(split[:, :, j])
        ess, tau = bulk_ess(split[:, :, j])
        rows[name] = {
            "rank_normalized_split_rhat": rhat,
            "rank_rhat": rank_rhat,
            "folded_rank_rhat": folded_rhat,
            "approx_bulk_ess": ess,
            "tau_estimate_saved_draws": tau,
        }
        print(f"{name:24s} {rhat:9.4f} {ess:10.0f} {tau:9.2f}")

    focus = [n for n in ("rp_over_rstar", "a_over_rstar",
                         "impact_parameter", "q1", "q2") if n in names]
    indices = [names.index(n) for n in focus]
    corr = np.corrcoef(samples[:, indices], rowvar=False)
    correlations = {
        focus[i]: {focus[j]: float(corr[i, j]) for j in range(len(focus))}
        for i in range(len(focus))
    }

    walker_outliers = {}
    print("\nWalker-median outliers (absolute standardized offset > 1):")
    for name in ("a_over_rstar", "impact_parameter", "q1"):
        if name not in names:
            continue
        j = names.index(name)
        medians = np.median(chains[:, :, j], axis=1)
        scale = float(np.std(samples[:, j]))
        z = (medians - np.median(samples[:, j])) / scale if scale else np.zeros_like(medians)
        flagged = [
            {"walker_1based": int(i + 1), "median_z": float(value)}
            for i, value in enumerate(z) if abs(value) > 1.0
        ]
        walker_outliers[name] = flagged
        print(f"{name}: " + (", ".join(
            f"walker {x['walker_1based']} ({x['median_z']:+.2f} sigma)" for x in flagged
        ) if flagged else "none"))

    rhat_max = max(x["rank_normalized_split_rhat"] for x in rows.values())
    ess_min = min(x["approx_bulk_ess"] for x in rows.values())
    result = {
        "target": "TrES-2 b / KIC 11446443",
        "source": "existing posterior-samples.csv; sampler was not rerun",
        "draws_per_walker": int(chains.shape[1]),
        "split_chains": int(split.shape[0]),
        "draws_per_split_chain": int(split.shape[1]),
        "parameters": rows,
        "max_rank_normalized_split_rhat": float(rhat_max),
        "min_approx_bulk_ess": float(ess_min),
        "correlations": correlations,
        "walker_median_outliers": walker_outliers,
        "screening": {
            "rhat_below_1_01_for_all_parameters": bool(rhat_max < 1.01),
            "bulk_ess_at_least_400_for_all_parameters": bool(ess_min >= 400),
            "interpretation": "These thresholds are diagnostics, not proof of model adequacy or scientific validity."
        }
    }
    output = FIT / "posterior-diagnostics.json"
    output.write_text(json.dumps(result, indent=2))
    print("\nOverall screening:")
    print(f"Maximum rank-normalized split-Rhat: {rhat_max:.4f}")
    print(f"Minimum approximate bulk ESS: {ess_min:.0f}")
    print(f"Saved {output}")
    print("Do not treat a passing diagnostic as proof that the transit model is physically adequate.")


if __name__ == "__main__":
    main()
