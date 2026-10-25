# Gaia DR3 colour–magnitude diagram. Positive precise parallaxes only; no extinction correction.
import numpy as np
import matplotlib.pyplot as plt
from astropy.table import Table
data=Table.read("gaia.csv",format='ascii.csv')
required={'parallax','parallax_over_error','phot_g_mean_mag','bp_rp'}
if not required.issubset(data.colnames):
    raise ValueError('Use a SpaceMind Gaia CSV with parallax, parallax_over_error, phot_g_mean_mag and bp_rp.')
p=np.asarray(data['parallax'],float);snr=np.asarray(data['parallax_over_error'],float)
g=np.asarray(data['phot_g_mean_mag'],float);colour=np.asarray(data['bp_rp'],float)
valid=np.isfinite(p)&np.isfinite(g)&np.isfinite(colour)&np.isfinite(snr)&(p>0)&(snr>10)
if 'ruwe' in data.colnames:
    ruwe=np.asarray(data['ruwe'],float);valid &= np.isfinite(ruwe)&(ruwe<1.4)
    print('Additional quality cut: finite RUWE < 1.4 (selection criterion, not a guarantee of reliability).')
else: print('RUWE unavailable; astrometric-fit quality cut not applied.')
print('Input stars:',len(p),'accepted:',int(valid.sum()))
sigma_parallax=5/np.log(10)/snr[valid]
p,g,colour=p[valid],g[valid],colour[valid]
if len(p)<2: raise ValueError('At least two quality-filtered stars are needed.')
absolute=g+5*np.log10(p)-10
assert np.all(np.isfinite(absolute))
plt.figure();plt.scatter(colour,absolute,s=8,alpha=.7);plt.gca().invert_yaxis();plt.xlabel('Gaia BP − RP (mag)');plt.ylabel('Absolute G (mag)');plt.title('Gaia colour–magnitude diagram (uncorrected extinction)')
result_rows=[{'bp_rp':float(c),'absolute_g':float(m),'parallax_mas':float(q),'absolute_g_parallax_error_mag':float(s)} for c,m,q,s in zip(colour,absolute,p,sigma_parallax)]
print('Reported magnitude errors propagate parallax only; exclude photometric error, zero-point and extinction systematics.');print('Quality-filtered stars:',len(p));print('Distances use inverse parallax; no parallax zero-point or extinction correction. This is a sampled colour–magnitude diagram, not a complete stellar population.')

