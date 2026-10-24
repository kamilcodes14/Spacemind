-- Phase 2 retrieval. Same signature and return columns as the previous match_papers_hybrid,
-- so research and paper-discovery need no change. Differences:
--  1. A relaxed OR lexical list is fused with the strict AND list. websearch_to_tsquery requires
--     every term, so natural-language questions matched few or no chunks.
--  2. The per-paper cap uses the canonical paper (arXiv id without version suffix), not doc_id,
--     so version variants of one paper cannot crowd out other papers.
--  3. Ties prefer full text over abstract records.
create or replace function public.match_papers_hybrid(query_embedding extensions.vector(384),query_text text,match_count integer default 24)
returns table(id text,doc_id text,title text,origin text,url text,content text,authors jsonb,year integer,arxiv_id text,score real)
language sql stable security invoker set search_path=public,extensions as $$
with q as (
 select websearch_to_tsquery('english',left(query_text,1000)) as strict_q,
        nullif(replace(plainto_tsquery('english',left(query_text,1000))::text,' & ',' | '),'')::tsquery as relaxed_q
), strict_candidates as (
 select p.id,ts_rank_cd(p.search_document,q.strict_q) as relevance,case when p.origin in ('arxiv','ntrs') then 0 else 1 end as tier
 from public.paper_chunks p,q where p.search_document@@q.strict_q
 order by relevance desc,tier,p.id limit 60
), strict_ranked as (
 select id,row_number() over(order by relevance desc,tier,id) as rank from strict_candidates
), relaxed_candidates as (
 select p.id,ts_rank_cd(p.search_document,q.relaxed_q) as relevance,case when p.origin in ('arxiv','ntrs') then 0 else 1 end as tier
 from public.paper_chunks p,q where q.relaxed_q is not null and p.search_document@@q.relaxed_q
 order by relevance desc,tier,p.id limit 60
), relaxed_ranked as (
 select id,row_number() over(order by relevance desc,tier,id) as rank from relaxed_candidates
), semantic_candidates as (
 select p.id,p.embedding<=>query_embedding as distance
 from public.paper_chunks p
 where query_embedding is not null and p.embedding is not null and p.embedding_model='gte-small'
 order by p.embedding<=>query_embedding limit 60
), semantic as (
 select id,row_number() over(order by distance,id) as rank from semantic_candidates
), fused as (
 select coalesce(s.id,r.id,m.id) as id,
  (coalesce(1.0/(60+s.rank),0)+0.5*coalesce(1.0/(60+r.rank),0)+coalesce(1.0/(60+m.rank),0))::real as score
 from strict_ranked s full outer join relaxed_ranked r on s.id=r.id
 full outer join semantic m on m.id=coalesce(s.id,r.id)
), diverse as (
 select p.*,f.score,
  row_number() over(partition by coalesce(nullif(regexp_replace(coalesce(p.arxiv_id,''),'v[0-9]+$',''),''),p.doc_id)
   order by f.score desc,case when p.origin in ('arxiv','ntrs') then 0 else 1 end,p.id) as paper_rank
 from fused f join public.paper_chunks p on p.id=f.id
)
select d.id,d.doc_id,d.title,d.origin,d.url,d.content,d.authors,d.year,d.arxiv_id,d.score
from diverse d where d.paper_rank<=3
order by d.score desc,case when d.origin in ('arxiv','ntrs') then 0 else 1 end,d.id
limit greatest(1,least(match_count,30));
$$;
revoke all on function public.match_papers_hybrid(extensions.vector,text,integer) from public,anon;
grant execute on function public.match_papers_hybrid(extensions.vector,text,integer) to authenticated,service_role;
