-- Add bibliographic metadata without changing existing chunk identifiers.
alter table public.paper_chunks add column authors jsonb not null default '[]'::jsonb check(jsonb_typeof(authors)='array');
alter table public.paper_chunks add column year integer check(year between 1600 and 2200);
alter table public.paper_chunks add column arxiv_id text;
alter table public.paper_chunks add column categories text[] not null default '{}';

-- Independent candidate lists, then reciprocal rank fusion. No cosine cutoff:
-- a lexical match can survive even when its semantic similarity is low.
create function public.match_papers_hybrid(query_embedding extensions.vector(384),query_text text,match_count integer default 24)
returns table(id text,doc_id text,title text,origin text,url text,content text,authors jsonb,year integer,arxiv_id text,score real)
language sql stable security invoker set search_path=public,extensions as $$
with lexical_candidates as (
 select p.id,ts_rank_cd(p.search_document,websearch_to_tsquery('english',left(query_text,1000))) as relevance
 from public.paper_chunks p
 where p.search_document@@websearch_to_tsquery('english',left(query_text,1000))
 order by relevance desc,p.id limit 60
), lexical as (
 select id,row_number() over(order by relevance desc,id) as rank from lexical_candidates
), semantic_candidates as (
 select p.id,p.embedding<=>query_embedding as distance
 from public.paper_chunks p
 where query_embedding is not null and p.embedding is not null and p.embedding_model='gte-small'
 order by p.embedding<=>query_embedding limit 60
), semantic as (
 select id,row_number() over(order by distance,id) as rank from semantic_candidates
), fused as (
 select coalesce(l.id,s.id) as id,(coalesce(1.0/(60+l.rank),0)+coalesce(1.0/(60+s.rank),0))::real as score
 from lexical l full outer join semantic s on l.id=s.id
), diverse as (
 select p.*,f.score,row_number() over(partition by p.doc_id order by f.score desc,p.id) as document_rank
 from fused f join public.paper_chunks p on p.id=f.id
)
select d.id,d.doc_id,d.title,d.origin,d.url,d.content,d.authors,d.year,d.arxiv_id,d.score
from diverse d where d.document_rank<=3
order by d.score desc,d.id limit greatest(1,least(match_count,30));
$$;
revoke all on function public.match_papers_hybrid(extensions.vector,text,integer) from public,anon;
grant execute on function public.match_papers_hybrid(extensions.vector,text,integer) to authenticated,service_role;
