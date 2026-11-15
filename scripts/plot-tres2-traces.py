"""Plot thinned per-walker traces from an existing TrES-2 b posterior CSV.

This does not rerun the sampler. It reconstructs the saved, thinned walker
trajectories from emcee's flattened chain ordering (step-major, walker-minor).
"""
from __future__ import annotations

import csv
import json
import pathlib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIT = ROOT / "validation" / "observational" / "transit-fit"


def main():
    report = json.loads((FIT / "fit-results.json").read_text())
    sampler = report["sampler"]
    nwalkers = int(sampler["walkers"])

    with (FIT / "posterior-samples.csv").open(newline="") as handle:
        reader = csv.reader(handle)
        names = next(reader)
        samples = np.asarray([[float(value) for value in row] for row in reader])

    if samples.ndim != 2 or samples.shape[1] != len(names):
        raise ValueError("Posterior CSV has an unexpected shape.")
    if len(samples) % nwalkers:
        raise ValueError(
            f"{len(samples)} saved samples cannot be divided evenly among "
            f"{nwalkers} walkers."
        )

    # emcee's get_chain(flat=True) flattens (steps, walkers, dimensions)
    # in C order, so restore the thinned step/walker axes.
    traces = samples.reshape(-1, nwalkers, len(names))
    x = np.arange(traces.shape[0]) * int(sampler["thin"]) + int(sampler["burn_in"])

    fig, axes = plt.subplots(
        len(names), 1, figsize=(12, max(14, 1.8 * len(names))),
        sharex=True, constrained_layout=True
    )
    for index, (name, ax) in enumerate(zip(names, axes)):
        ax.plot(x, traces[:, :, index], alpha=0.18, linewidth=0.45)
        ax.set_ylabel(name)
        ax.grid(alpha=0.2)
    axes[-1].set_xlabel("MCMC step (post burn-in; saved every thin steps)")
    fig.suptitle("TrES-2 b — saved walker traces (thinned posterior)")
    output = FIT / "walker-traces.png"
    fig.savefig(output, dpi=170)
    print(f"Saved {output}")
    print(
        f"Plotted {nwalkers} walkers, {traces.shape[0]} saved steps per walker, "
        f"{len(names)} parameters."
    )


if __name__ == "__main__":
    main()
