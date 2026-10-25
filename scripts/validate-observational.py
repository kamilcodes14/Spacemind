"""Run actual Mission Lab recipes on archived observations; fail closed on missing data.
Fetch: python scripts/fetch-observational.py. Then run this file from the repo root.
This is CPython validation of the shared recipe, NOT browser/deployed-stack acceptance.
"""
import contextlib,io,json,pathlib,subprocess,hashlib,platform,importlib.metadata as md
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from astropy.io import fits
from astropy.table import Table
from astropy.coordinates import Distance
from astropy import units as u
ROOT=pathlib.Path(__file__).resolve().parents[1];D=ROOT/'validation'/'observational'
sources=json.loads((D/'sources.json').read_text())
for name,record in sources.items():
 assert 'error' not in record,record
 assert hashlib.sha256((D/name).read_bytes()).hexdigest()==record['sha256'],name

def run_recipe(kind,params,filename):
 code=subprocess.check_output(['node','--input-type=module','-e',"import {recipe} from './frontend/science/recipes.js';console.log(recipe("+json.dumps(kind)+","+json.dumps(params)+"));"],cwd=ROOT,text=True)
 # Only the explicit input path is adapted for this CPython harness.
 code=code.replace('/work/'+params['filename'],filename);(D/(kind+'-executed.py')).write_text(code)
 output=io.StringIO();ns={}
 import os
 previous=os.getcwd()
 try:
  os.chdir(D)
  with contextlib.redirect_stdout(output):exec(compile(code,kind,'exec'),ns)
 finally:os.chdir(previous)
 (D/(kind+'-stdout.txt')).write_text(output.getvalue())
 for i,n in enumerate(plt.get_fignums()):plt.figure(n).savefig(D/(kind+'-'+str(i+1)+'.png'),dpi=120,bbox_inches='tight')
 plt.close('all');return ns,output.getvalue()

# TrES-2, KIC 11446443: pipeline-corrected flux, measured errors, conservative quality=0.
with fits.open(D/'tres2-q1.fits') as h:
 data=h[1].data;hdr=h[1].header
 assert hdr['TIMESYS']=='TDB' and hdr['BJDREFI']==2454833
 rows=np.column_stack([data['TIME'],data['PDCSAP_FLUX'],data['PDCSAP_FLUX_ERR'],data['SAP_QUALITY']])
 np.savetxt(D/'lightcurve.csv',rows,delimiter=',',header='time,flux,flux_err,quality',comments='')
 original_rows=len(rows)
ns,stdout=run_recipe('transit',dict(filename='lightcurve.csv',minimum=2,maximum=3,duration=.075),'lightcurve.csv')
ref=json.loads((D/'tres2-reference.json').read_text())[0];i=ns['i'];power=ns['power']
transit={'target':'TrES-2 b / KIC 11446443','input_rows':original_rows,'accepted_rows':len(ns['t']),
 'period_days':ns['period'],'reference_period_days':ref['pl_orbper'],'absolute_period_error_days':abs(ns['period']-ref['pl_orbper']),
 'grid_step_days':float(ns['periods'][1]-ns['periods'][0]),'depth_relative_flux':float(power.depth[i]),'conditional_depth_error':float(power.depth_err[i]),
 'epoch_bkjd_tdb_days':ns['epoch'],'time_system':'BJD_TDB - 2454833 days; original FITS headers verified','reference':ref,
 'acceptance':'absolute period difference < 0.005 d; depth in (0.005, 0.025); >= 1000 accepted cadences',
 'limits':'One quarter; fixed 0.075-day box duration; no additional detrending or limb darkening fit; error is conditional on independent supplied flux errors. Grid spacing is not period uncertainty. No planet-validation significance inferred.'}
assert transit['absolute_period_error_days']<.005 and .005<transit['depth_relative_flux']<.025 and transit['accepted_rows']>=1000,transit

ns,stdout=run_recipe('hrdiagram',dict(filename='gaia.csv'),'gaia.csv')
independent=ns['g']-Distance(parallax=ns['p']*u.mas).distmod.value
max_error=float(np.max(np.abs(independent-ns['absolute'])))
gaia={'catalogue':'Gaia DR3','input_rows':len(ns['data']),'accepted_rows':len(ns['p']),'max_absolute_magnitude_error_mag':max_error,
 'quality_cuts':'finite positive parallax; finite parallax/error > 10; finite G and BP-RP; finite RUWE < 1.4',
 'coordinates':'ICRS degrees, Gaia DR3 reference epoch J2016.0; one-degree cone at (56.75,24.12)',
 'acceptance':'>= 50 accepted stars and absolute-G agrees with Astropy distance modulus within 1e-10 mag',
 'limits':'TOP 200 ordered by source_id, not a complete or cluster-membership-selected population. Inverse parallaxes. No extinction/zero-point correction, colour-excess cut or photometric error propagation. Error column is parallax-only.'}
assert gaia['accepted_rows']>=50 and max_error<1e-10,gaia
Table(rows=ns['result_rows']).write(D/'gaia-results.csv',format='ascii.csv',overwrite=True)

orbit=json.loads(subprocess.check_output(['node','scripts/validate-orbit-reference.mjs'],cwd=ROOT,text=True))
report={'scope':'CPython execution of current Mission Lab recipes plus production JS orbital solver; not deployed authenticated UI validation',
 'environment':{'python':platform.python_version(),'packages':{x:md.version(x) for x in ['numpy','scipy','astropy','matplotlib']}},
 'transit':transit,'gaia':gaia,'orbit':orbit,'acceptance_passed':True}
(D/'results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
