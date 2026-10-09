import {BODIES,elements,finite} from './orbits.js';
export function recipe(kind,p){
 if(kind==='spice'){
  for(const k of ['target','observer'])if(!/^-?\d{1,9}$/.test(String(p[k])))throw Error('Use numeric NAIF target and observer IDs.');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(p.epoch)||!Number.isFinite(Date.parse(p.epoch)))throw Error('Enter an ISO UTC epoch, for example 2026-01-01T00:00:00Z.');
  return `# SPICE geometric state, J2000, km and km/s. Upload a .bsp and .tls first.\nimport os, json\nimport spiceypy as spice\nspice.kclear()\nfiles = sorted(os.listdir('/work'))\nif not any(f.endswith('.bsp') for f in files) or not any(f.endswith('.tls') for f in files):\n    raise ValueError('Upload a BSP ephemeris and a TLS leap-second kernel first.')\ntry:\n    for name in files:\n        if name.endswith(('.bsp', '.tls', '.tpc', '.tf', '.bc', '.tsc')):\n            spice.furnsh('/work/' + name)\n    et = spice.str2et(${JSON.stringify(p.epoch)})\n    state, light_time = spice.spkezr(${JSON.stringify(String(p.target))}, et, 'J2000', 'NONE', ${JSON.stringify(String(p.observer))})\n    print(json.dumps({'epoch_utc': ${JSON.stringify(p.epoch)}, 'frame':'J2000', 'aberration':'NONE', 'position_km':state[:3].tolist(), 'velocity_km_s':state[3:].tolist(), 'one_way_light_time_s':light_time, 'kernels':files}, indent=2))\nfinally:\n    spice.kclear()\n`;
 }
 if(kind==='hohmann'){
  const b=BODIES[p.body];if(!b)throw Error('Unknown central body.');finite(p.start,1,1e10,'Initial altitude');finite(p.end,1,1e10,'Final altitude');
  return `# Circular coplanar orbits; instantaneous burns; no drag or third bodies.\nimport numpy as np\nfrom astropy import units as u\nfrom scipy.integrate import quad\nmu = ${b.mu} * u.km**3 / u.s**2\nr1 = ${b.radius+p.start} * u.km\nr2 = ${b.radius+p.end} * u.km\na = (r1+r2)/2\ndv1 = np.sqrt(mu*(2/r1-1/a)) - np.sqrt(mu/r1)\ndv2 = np.sqrt(mu/r2) - np.sqrt(mu*(2/r2-1/a))\ntof = np.pi*np.sqrt(a**3/mu)\n# Independent time-of-flight check: integrate dt/dE over half the ellipse.\ne = abs((r2-r1)/(r2+r1)).value\ncheck, err = quad(lambda E: (1-e*np.cos(E)), 0, np.pi)\ncheck_seconds = check*np.sqrt(a**3/mu).to_value(u.s)\nassert np.isclose(check_seconds, tof.to_value(u.s), rtol=1e-10)\nprint(f'Central body: ${p.body}')\nprint(f'Burn 1 (signed tangential): {dv1.to_value(u.km/u.s):.6f} km/s')\nprint(f'Burn 2 (signed tangential): {dv2.to_value(u.km/u.s):.6f} km/s')\nprint(f'Total delta-v: {(abs(dv1)+abs(dv2)).to_value(u.km/u.s):.6f} km/s')\nprint(f'Transfer time: {tof.to_value(u.hour):.6f} hours')\nprint('Check passed: integrated time agrees with Kepler half-period.')\n`;
 }
 if(kind==='rocket'){
  finite(p.isp,1,100000,'Specific impulse (s)');finite(p.wet,1,1e12,'Wet mass (kg)');finite(p.dry,1,1e12,'Dry mass (kg)');if(p.dry>p.wet)throw Error('Dry mass cannot exceed wet mass.');
  return `# Ideal rocket equation; constant Isp; excludes gravity and drag losses.\nimport numpy as np\nfrom astropy import units as u\nisp=${p.isp}*u.s\nwet=${p.wet}*u.kg\ndry=${p.dry}*u.kg\ng0=9.80665*u.m/u.s**2\ndv=isp*g0*np.log((wet/dry).value)\nrecovered=wet/np.exp((dv/(isp*g0)).value)\nassert np.isclose(recovered.to_value(u.kg),dry.to_value(u.kg),rtol=1e-12)\nprint(f'Ideal delta-v: {dv.to_value(u.km/u.s):.6f} km/s')\nprint(f'Propellant: {(wet-dry).to_value(u.kg):.3f} kg')\nprint('Check passed: inverse equation recovers dry mass.')\n`;
 }
 if(kind==='orbit'){
  const el=elements(p);
  return `# Two-body orbit; altitude above a spherical ${p.body}.\nimport numpy as np\nfrom astropy import units as u\nmu=${el.mu}*u.km**3/u.s**2\nrp=${el.rp}*u.km\nra=${el.ra}*u.km\na=(rp+ra)/2\ne=((ra-rp)/(ra+rp)).value\nvp=np.sqrt(mu*(2/rp-1/a))\nva=np.sqrt(mu*(2/ra-1/a))\nperiod=2*np.pi*np.sqrt(a**3/mu)\nassert np.isclose((rp*vp).value,(ra*va).value,rtol=1e-12)\nprint(f'Semimajor axis: {a.value:.3f} km')\nprint(f'Eccentricity: {e:.8f}')\nprint(f'Period: {period.to_value(u.min):.4f} minutes')\nprint(f'Periapsis speed: {vp.to_value(u.km/u.s):.6f} km/s')\nprint(f'Apoapsis speed: {va.to_value(u.km/u.s):.6f} km/s')\nprint('Check passed: angular momentum conserved at both apsides.')\n`;
 }
 throw Error('Unknown calculation.');
}
