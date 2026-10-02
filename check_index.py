"""Shows what is inside the SpaceMind index (data/chroma_db).
Usage:
  python check_index.py                  -> totals + list of papers
  python check_index.py 2609.37293v1     -> also shows a sample of that paper's text (id without .pdf)
Light on memory: it only reads the database (no AI models are loaded).
"""
import sys
from collections import Counter

import chromadb

col = chromadb.PersistentClient(path="data/chroma_db").get_collection("spacemind")
metas = col.get(include=["metadatas"])["metadatas"] or []

def paper_id(m):
    name = m.get("file_name", "?")
    return name[:-4] if name.lower().endswith(".pdf") else name


papers = Counter((m.get("source", "?"), paper_id(m)) for m in metas if m)
by_source = Counter(src for (src, _doc) in papers)

print(f"\nTotal chunks: {col.count()}")
print(f"Total papers: {len(papers)}")
for src, n in sorted(by_source.items()):
    print(f"  {src}: {n} papers")

print("\nPapers (source, id, chunks):")
for (src, doc), n in sorted(papers.items()):
    print(f"  {src:<17} {doc:<22} {n:>4}")

if len(sys.argv) > 1:
    wanted = sys.argv[1]
    got = col.get(where={"file_name": wanted + ".pdf"}, limit=2, include=["documents"])
    print(f"\nSample text from {wanted}:")
    for d in got["documents"]:
        print("-" * 60)
        print(d[:500])
    if not got["documents"]:
        print("  (no chunks found for that id)")
