export const advancedDefaults={budget:{burns:'1200, 850, 300',margin:10,isp:320,wet:10000,dry:4000},lightcurve:{filename:'lightcurve.csv'},transit:{filename:'lightcurve.csv',minimum:1,maximum:10,duration:.1},hrdiagram:{filename:'spacemind-gaia.csv'},decay:{altitude:400,days:30,ballistic:100,density:4e-12,scale:50}};
export const advancedTitles={budget:'Mission delta-v budget',lightcurve:'Light curve analysis',transit:'Transit search (BLS)',hrdiagram:'Gaia HR diagram',decay:'Orbit decay estimate'};
export function advancedRecipe(kind,p){
 const file=()=>{if(typeof p.filename!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}\.csv$/.test(p.filename))throw Error('Use a simple .csv filename.');return JSON.stringify('/work/'+p.filename);};
 if(kind==='budget')return `# Ideal rocket performance; user-specified burn budget. No automatic loss model.
import numpy as np
burns = np.array(${JSON.stringify(p.burns.split(',').map(Number))}, dtype=float)
margin = ${p.margin}/100
available = ${p.isp}*9.80665*np.log(${p.wet}/${p.dry})
required = burns.sum()*(1+margin)
propellant = ${p.wet}*(1-np.exp(-required/(${p.isp}*9.80665)))
assert np.all(burns >= 0) and available >= 0
result_rows = [{'required_m_s':float(required),'available_m_s':float(available),'reserve_m_s':float(available-required),'propellant_kg':float(propellant)}]
print(result_rows[0])
print('Feasible under these assumptions:', bool(available >= required))
print('Add gravity, drag and steering losses to the burn list if applicable.')
`;
 if(['lightcurve','transit'].includes(kind))return `# Upload CSV with time (days) and flux (relative units). No synthetic observations.
import numpy as np
import matplotlib.pyplot as plt
from astropy.timeseries import LombScargle, BoxLeastSquares
data = np.genfromtxt(${file()}, delimiter=',', names=True)
if not {'time','flux'}.issubset(data.dtype.names or []):
    raise ValueError('CSV needs time and flux columns.')
t, f = np.atleast_1d(data['time']), np.atleast_1d(data['flux'])
valid = np.isfinite(t) & np.isfinite(f)
t, f = t[valid], f[valid]
if len(t)<30 or len(t)>20000 or np.ptp(t)<=0 or np.median(f)==0:
    raise ValueError('Use 30–20,000 finite measurements with nonzero time span and median flux.')
order=np.argsort(t); t=t[order]; f=f[order]/np.median(f)
plt.figure();plt.plot(t,f,'.',ms=2);plt.xlabel('Time (days)');plt.ylabel('Relative flux');plt.title('Uploaded light curve')
${kind==='transit'?`periods=np.linspace(${p.minimum},${p.maximum},2000)
if ${p.maximum}>np.ptp(t)/2:
    raise ValueError('Maximum period must allow at least two cycles in the observed baseline.')
model=BoxLeastSquares(t,f)
power=model.power(periods,${p.duration})
i=int(np.nanargmax(power.power)); period=float(power.period[i]); epoch=float(power.transit_time[i])
print('Candidate period (days):',period,'depth:',float(power.depth[i]),'duration (days):',float(power.duration[i]))
phase=((t-epoch+period/2)%period)-period/2
plt.figure();plt.plot(phase,f,'.',ms=2);plt.xlabel('Phase time (days)');plt.ylabel('Relative flux');plt.title('BLS candidate — not a confirmed planet')
result_rows=[{'period_days':float(x),'bls_power':float(y)} for x,y in zip(power.period,power.power)]
print('Inspect aliases, systematics and eclipsing binaries; no detection significance or planet confirmation is inferred.')`:`frequency,power=LombScargle(t,f).autopower(samples_per_peak=5,maximum_frequency=min(20,10*len(t)/np.ptp(t)))
i=int(np.nanargmax(power));print('Strongest sampled period (days):',float(1/frequency[i]))
plt.figure();plt.plot(1/frequency,power);plt.xscale('log');plt.xlabel('Period (days)');plt.ylabel('Lomb–Scargle power')
result_rows=[{'time_days':float(x),'relative_flux':float(y)} for x,y in zip(t,f)]
print('No detrending, instrumental correction or false-alarm significance is inferred.')`}
`;
 if(kind==='hrdiagram')return `# Gaia DR3 colour–magnitude diagram. Positive precise parallaxes only; no extinction correction.
import numpy as np
import matplotlib.pyplot as plt
from astropy.table import Table
data=Table.read(${file()},format='ascii.csv')
required={'parallax','parallax_over_error','phot_g_mean_mag','bp_rp'}
if not required.issubset(data.colnames):
    raise ValueError('Use a SpaceMind Gaia CSV with parallax, parallax_over_error, phot_g_mean_mag and bp_rp.')
p=np.asarray(data['parallax'],float);snr=np.asarray(data['parallax_over_error'],float)
g=np.asarray(data['phot_g_mean_mag'],float);colour=np.asarray(data['bp_rp'],float)
valid=np.isfinite(p)&np.isfinite(g)&np.isfinite(colour)&(p>0)&(snr>10)
p,g,colour=p[valid],g[valid],colour[valid]
if len(p)<2: raise ValueError('At least two quality-filtered stars are needed.')
absolute=g+5*np.log10(p)-10
assert np.all(np.isfinite(absolute))
plt.figure();plt.scatter(colour,absolute,s=8,alpha=.7);plt.gca().invert_yaxis();plt.xlabel('Gaia BP − RP (mag)');plt.ylabel('Absolute G (mag)');plt.title('Gaia colour–magnitude diagram (uncorrected extinction)')
result_rows=[{'bp_rp':float(c),'absolute_g':float(m),'parallax_mas':float(q)} for c,m,q in zip(colour,absolute,p)]
print('Quality-filtered stars:',len(p));print('Distances use inverse parallax; no parallax zero-point or extinction correction. This is a sampled colour–magnitude diagram, not a complete stellar population.')
`;
 if(kind==='decay')return `# Illustrative circular Earth-orbit decay; constant ballistic coefficient and exponential density.
# Not suitable for operational re-entry prediction. Atmospheric activity can dominate uncertainty.
import numpy as np
import matplotlib.pyplot as plt
from scipy.integrate import solve_ivp
mu=3.986004418e14; R=6378137.; h0=${p.altitude}*1000
B=${p.ballistic} # mass/(Cd*A), kg/m^2
rho0=${p.density}; H=${p.scale}*1000
# Energy balance: da/dt = -rho*sqrt(mu*a)/B for a circular orbit.
def rate(t,a):
    rho=rho0*np.exp(np.clip((h0-(a[0]-R))/H,-50,50))
    return [-rho*np.sqrt(mu*max(a[0],R))/B]
def stop(t,a): return a[0]-R-120000
stop.terminal=True;stop.direction=-1
sol=solve_ivp(rate,[0,${p.days}*86400],[R+h0],events=stop,rtol=1e-8,atol=.01,max_step=3600,dense_output=True)
if not sol.success: raise ValueError(sol.message)
t=np.linspace(0,sol.t[-1],400);alt=(sol.sol(t)[0]-R)/1000
assert np.all(np.diff(alt)<=1e-5)
plt.figure();plt.plot(t/86400,alt);plt.xlabel('Elapsed days');plt.ylabel('Altitude (km)');plt.title('Simplified atmospheric-drag scenario')
result_rows=[{'days':float(x/86400),'altitude_km':float(y)} for x,y in zip(t,alt)]
print('Final model altitude (km):',float(alt[-1]));print('Stopped at 120 km boundary:',bool(len(sol.t_events[0])))
print('Assumes a circular orbit, stationary atmosphere and prescribed density. No solar activity, winds, lift, tumbling or third-body perturbations.')
`;
 throw Error('Unknown advanced recipe.');
}
