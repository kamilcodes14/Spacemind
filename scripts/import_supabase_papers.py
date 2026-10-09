"""Import the shipped Chroma document text into Supabase and re-embed with gte-small.

Dry run: python scripts/import_supabase_papers.py --dry-run
Requires SUPABASE_URL and PAPER_IMPORT_TOKEN only for a real import.
No original BGE vectors are reused: the embedding spaces are incompatible.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time
import urllib.request
import urllib.error


def chunks(text, length=1200, overlap=120):
    text=' '.join(text.split())
    start=0
    while start<len(text):
        end=min(start+length,len(text))
        if end<len(text):
            boundary=text.rfind(' ',start+length//2,end)
            if boundary>start:end=boundary
        yield text[start:end]
        if end==len(text):break
        start=max(start+1,end-overlap)


def rows(database):
    # Read-only SQLite access avoids requiring a compatible Chroma runtime.
    uri=database.resolve().as_uri()+'?mode=ro'
    with sqlite3.connect(uri,uri=True) as conn:
        for internal_id,text in conn.execute("select id,string_value from embedding_metadata where key='chroma:document' order by id"):
            metadata=dict(conn.execute('select key,string_value from embedding_metadata where id=?',(internal_id,)))
            source=metadata.get('source') or 'paper'
            file_name=metadata.get('file_name') or str(internal_id)
            doc_id=file_name[:-4] if file_name.endswith('.pdf') else file_name
            urls={'arxiv':'https://arxiv.org/abs/','ntrs':'https://ntrs.nasa.gov/citations/','ads':'https://ui.adsabs.harvard.edu/abs/','semantic_scholar':'https://www.semanticscholar.org/paper/'}
            for part in chunks(text or ''):
                digest=hashlib.sha256((source+'\0'+doc_id+'\0'+part).encode()).hexdigest()
                yield {'id':digest,'doc_id':source+':'+doc_id,'title':file_name,'origin':source,'url':urls[source]+doc_id if source in urls else None,'content':part}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,default=Path(__file__).resolve().parents[1]/'data/chroma_db/chroma.sqlite3')
    parser.add_argument('--jsonl',type=Path,help='Import collected JSONL, including bibliographic metadata.')
    parser.add_argument('--dry-run',action='store_true')
    parser.add_argument('--limit',type=int,default=0,help='Import only this many chunks; zero means all.')
    args=parser.parse_args()
    base=os.getenv('SUPABASE_URL','').rstrip('/')
    token=os.getenv('PAPER_IMPORT_TOKEN','')
    if not args.dry_run and (not base.startswith('https://') or len(token)<32):
        parser.error('Set HTTPS SUPABASE_URL and a random PAPER_IMPORT_TOKEN of at least 32 characters.')
    seen=set();count=0
    source=(json.loads(line) for line in args.jsonl.open() if line.strip()) if args.jsonl else rows(args.database)
    for item in source:
        if item['id'] in seen:continue
        seen.add(item['id'])
        if not args.dry_run:
            headers={'Content-Type':'application/json','Authorization':'Bearer '+token}
            public_key=os.getenv('SUPABASE_PUBLISHABLE_KEY') or os.getenv('SUPABASE_ANON_KEY')
            if public_key:headers['apikey']=public_key
            for attempt in range(3):
                try:
                    req=urllib.request.Request(base+'/functions/v1/embed-paper',data=json.dumps(item).encode(),headers=headers,method='POST')
                    with urllib.request.urlopen(req,timeout=90) as response:json.load(response)
                    break
                except urllib.error.HTTPError as exc:
                    if exc.code not in (429,502,503,504) or attempt==2:
                        raise SystemExit(f'Import stopped at chunk {count+1} (HTTP {exc.code}). Fix the configuration, then rerun; saved chunks are skipped.') from None
                    time.sleep(2**attempt)
            if count%25==0:print(f'Imported {count+1} chunks',flush=True)
        count+=1
        if args.limit and count>=args.limit:break
    print(('Dry run: ' if args.dry_run else 'Complete: ')+f'{count} unique chunks. No keys were printed.')

if __name__=='__main__':main()
