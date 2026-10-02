"""Removes duplicate copies of papers from the SpaceMind index (data/chroma_db).

Older ingest runs indexed some papers more than once. This keeps ONE copy of
each paper and deletes the extra chunks. It does not re-embed anything and
loads no AI models, so it is quick and light on memory.

Usage:
  python dedupe_index.py            -> only shows what it WOULD remove
  python dedupe_index.py --apply    -> actually removes the duplicates
"""
import sys
from collections import defaultdict

import chromadb

apply_changes = "--apply" in sys.argv

col = chromadb.PersistentClient(path="data/chroma_db").get_collection("spacemind")
data = col.get(include=["metadatas"])

# paper -> {copy id -> [chunk ids]}   (a "copy" = one ingest run of that paper)
papers = defaultdict(lambda: defaultdict(list))
for chunk_id, m in zip(data["ids"], data["metadatas"]):
    if not m:
        continue
    paper = (m.get("source", "?"), m.get("file_name", "?"))
    papers[paper][m.get("doc_id", "?")].append(chunk_id)

to_delete = []
for (source, name), copies in sorted(papers.items()):
    if len(copies) < 2:
        continue
    keep = max(copies, key=lambda c: len(copies[c]))  # keep the biggest copy
    extra = [cid for c, ids in copies.items() if c != keep for cid in ids]
    to_delete += extra
    print(f"  {source:<10} {name:<28} {len(copies)} copies -> removing {len(extra)} extra chunks")

print(f"\nPapers: {len(papers)} | chunks now: {col.count()} | duplicate chunks: {len(to_delete)}")

if not to_delete:
    print("No duplicates found. Nothing to do.")
elif not apply_changes:
    print("This was a preview. Run:  python dedupe_index.py --apply   to remove them.")
else:
    for i in range(0, len(to_delete), 500):
        col.delete(ids=to_delete[i : i + 500])
    print(f"Done. Chunks now: {col.count()}")
