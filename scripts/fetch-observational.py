import urllib.request,urllib.parse,pathlib,hashlib,json,concurrent.futures,datetime
root=pathlib.Path(__file__).resolve().parents[1]/'validation'/'observational';root.mkdir(parents=True,exist_ok=True)
gaia="SELECT TOP 200 source_id,ra,dec,parallax,parallax_error,parallax_over_error,phot_g_mean_mag,phot_g_mean_flux_over_error,bp_rp,ruwe FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',56.75,24.12,1)) AND parallax>0 AND parallax_over_error>10 AND bp_rp IS NOT NULL ORDER BY source_id"
urls={'tres2-q1.fits':'https://archive.stsci.edu/missions/kepler/lightcurves/0114/011446443/kplr011446443-2009166043257_llc.fits','gaia.csv':'https://gea.esac.esa.int/tap-server/tap/sync?'+urllib.parse.urlencode(dict(REQUEST='doQuery',LANG='ADQL',FORMAT='csv',QUERY=gaia)),'tres2-reference.json':'https://exoplanetarchive.ipac.caltech.edu/TAP/sync?'+urllib.parse.urlencode(dict(query="select pl_name,pl_orbper,pl_orbpererr1,pl_orbpererr2,pl_trandur,pl_trandep,pl_refname from ps where pl_name='TrES-2 b' and default_flag=1",format='json'))}
for kind in ['VECTORS','ELEMENTS']:
 params=dict(format='json',COMMAND="'301'",CENTER="'500@399'",MAKE_EPHEM="'YES'",EPHEM_TYPE="'"+kind+"'",TLIST="'2461041.5'",TLIST_TYPE="'JD'",TIME_TYPE="'TDB'",OUT_UNITS="'KM-S'",REF_PLANE="'FRAME'",REF_SYSTEM="'ICRF'",CSV_FORMAT="'YES'",OBJ_DATA="'YES'")
 if kind=='VECTORS': params.update(VEC_CORR="'NONE'",VEC_TABLE="'2'")
 urls['horizons-'+kind.lower()+'.json']='https://ssd.jpl.nasa.gov/api/horizons.api?'+urllib.parse.urlencode(params)
def fetch(item):
 name,url=item
 try:
  data=urllib.request.urlopen(url,timeout=55).read();(root/name).write_bytes(data)
  return name,dict(url=url,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data),retrieved_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
 except Exception as e:return name,dict(url=url,error=str(e))
results=dict(concurrent.futures.ThreadPoolExecutor(5).map(fetch,urls.items()));(root/'sources.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
