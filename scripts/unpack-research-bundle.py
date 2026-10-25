"""Verify and unpack a SpaceMind bundle. Does not execute downloaded code.
Usage: python scripts/unpack-research-bundle.py bundle.json NEW_DIRECTORY
"""
import base64,hashlib,json,pathlib,sys

def unpack(bundle,destination):
 if bundle.get('schema')!='spacemind.reproducibility.v1':raise ValueError('Unsupported bundle schema')
 files={}
 def add(name,data,expected):
  if not isinstance(name,str) or not name or name in ('.','..') or '/' in name or '\\' in name:raise ValueError('Unsafe filename')
  if hashlib.sha256(data).hexdigest()!=expected:raise ValueError('Checksum mismatch: '+name)
  if name in files:raise ValueError('Duplicate filename: '+name)
  files[name]=data
 for name,content in bundle['files'].items():add(name,content.encode('utf-8'),bundle['checksums'][name])
 inputs={}
 for item in bundle['execution'].get('inputs',[]):
  if 'base64' not in item:continue
  name=item['name']
  if not isinstance(name,str) or not name or name in ('.','..') or '/' in name or '\\' in name:raise ValueError('Unsafe input filename')
  data=base64.b64decode(item['base64'],validate=True)
  if hashlib.sha256(data).hexdigest()!=item['sha256']:raise ValueError('Input checksum mismatch: '+name)
  if name in inputs:raise ValueError('Duplicate input filename')
  inputs[name]=data
 destination=pathlib.Path(destination);destination.mkdir(exist_ok=False)
 for name,data in files.items():(destination/name).write_bytes(data)
 (destination/'inputs').mkdir()
 for name,data in inputs.items():(destination/'inputs'/name).write_bytes(data)
 (destination/'manifest.json').write_text(json.dumps({k:v for k,v in bundle.items() if k!='files'},indent=2))
 print('Verified and unpacked. Review the code, environment and /work input paths before execution.')

if __name__=='__main__':
 if len(sys.argv)!=3:raise SystemExit(__doc__)
 unpack(json.loads(pathlib.Path(sys.argv[1]).read_text()),sys.argv[2])
