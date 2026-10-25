# Upload CSV with time (days) and flux (relative units). No synthetic observations.
import numpy as np
import matplotlib.pyplot as plt
from astropy.timeseries import LombScargle, BoxLeastSquares
data = np.genfromtxt("lightcurve.csv", delimiter=',', names=True)
if not {'time','flux'}.issubset(data.dtype.names or []):
    raise ValueError('CSV needs time and flux columns.')
t, f = np.atleast_1d(data['time']), np.atleast_1d(data['flux'])
valid = np.isfinite(t) & np.isfinite(f)
err=np.atleast_1d(data['flux_err']) if 'flux_err' in data.dtype.names else None
if err is not None: valid &= np.isfinite(err) & (err>0)
if 'quality' in data.dtype.names: valid &= np.atleast_1d(data['quality'])==0
print('Input rows:',len(t),'quality/finite rows:',int(valid.sum()))
t, f = t[valid], f[valid]
if err is not None: err=err[valid]
if len(t)<30 or len(t)>20000 or np.ptp(t)<=0 or np.median(f)==0:
    raise ValueError('Use 30–20,000 finite measurements with nonzero time span and median flux.')
order=np.argsort(t); t=t[order]; median=float(np.median(f));f=f[order]/median
if err is not None: err=err[order]/abs(median)
print('Time values are preserved from the CSV. Supply the time system and reference epoch in your provenance; no UTC/TDB conversion is performed.')
print('No detrending is applied. Flux errors supplied:',err is not None)
plt.figure();plt.plot(t,f,'.',ms=2);plt.xlabel('Time (days)');plt.ylabel('Relative flux');plt.title('Uploaded light curve')
periods=np.linspace(2,3,2000)
if 3>np.ptp(t)/2:
    raise ValueError('Maximum period must allow at least two cycles in the observed baseline.')
model=BoxLeastSquares(t,f,dy=err)
power=model.power(periods,0.075)
i=int(np.nanargmax(power.power)); period=float(power.period[i]); epoch=float(power.transit_time[i])
print('Candidate period (days):',period,'depth:',float(power.depth[i]),'duration (days):',float(power.duration[i]))
print('Epoch in input time system (days):',epoch)
print('Period grid step (days), NOT a confidence interval:',float(periods[1]-periods[0]))
if err is not None: print('Conditional box-depth standard error:',float(power.depth_err[i]),'; excludes correlated noise, detrending and model uncertainty.')
else: print('Flux errors absent: no calibrated depth uncertainty is reported.')
phase=((t-epoch+period/2)%period)-period/2
plt.figure();plt.plot(phase,f,'.',ms=2);plt.xlabel('Phase time (days)');plt.ylabel('Relative flux');plt.title('BLS candidate — not a confirmed planet')
result_rows=[{'period_days':float(x),'bls_power':float(y)} for x,y in zip(power.period,power.power)]
print('Inspect aliases, systematics and eclipsing binaries; no detection significance or planet confirmation is inferred.')

