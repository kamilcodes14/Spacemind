create schema if not exists extensions;
create extension if not exists vector with schema extensions;
grant usage on schema extensions to authenticated,service_role;
create table public.paper_chunks (
  id text primary key,
  doc_id text not null,
  title text not null,
  origin text not null,
  url text,
  content text not null check(char_length(content) between 1 and 6000),
  embedding extensions.vector(384),
  embedding_model text not null default 'gte-small',
  search_document tsvector generated always as(to_tsvector('english',title||' '||content)) stored,
  created_at timestamptz not null default now(),
  constraint supported_embedding check(embedding_model='gte-small')
);
create index paper_chunks_vector on public.paper_chunks using hnsw(embedding extensions.vector_cosine_ops);
create index paper_chunks_text on public.paper_chunks using gin(search_document);
create index paper_chunks_document on public.paper_chunks(doc_id);
alter table public.paper_chunks enable row level security;
create policy read_research_papers on public.paper_chunks for select to authenticated using(true);
revoke all on public.paper_chunks from anon,authenticated;
grant select on public.paper_chunks to authenticated;
grant all on public.paper_chunks to service_role;

create view public.paper_library with(security_invoker=true) as
select doc_id,min(title) as title,min(origin) as origin,min(url) as url,count(*) as chunks
from public.paper_chunks group by doc_id;
revoke all on public.paper_library from anon;
grant select on public.paper_library to authenticated,service_role;

create function public.match_papers(query_embedding extensions.vector(384),query_text text,match_count integer default 5)
returns table(id text,doc_id text,title text,origin text,url text,content text,score real)
language sql stable security invoker set search_path=public,extensions as $$
  select p.id,p.doc_id,p.title,p.origin,p.url,p.content,
    (case when query_embedding is not null and p.embedding is not null then 1-(p.embedding<=>query_embedding)
     else ts_rank_cd(p.search_document,websearch_to_tsquery('english',left(query_text,1000))) end)::real as score
  from public.paper_chunks p
  where p.embedding_model='gte-small' and
    ((query_embedding is not null and p.embedding is not null and 1-(p.embedding<=>query_embedding)>.65)
     or p.search_document@@websearch_to_tsquery('english',left(query_text,1000)))
  order by score desc limit greatest(1,least(match_count,8));
$$;
revoke all on function public.match_papers(extensions.vector,text,integer) from public;
grant execute on function public.match_papers(extensions.vector,text,integer) to authenticated;
