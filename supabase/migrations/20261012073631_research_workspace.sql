-- Private paper workspace. Composite foreign keys preserve ownership on links.
create table public.paper_collections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 100), created_at timestamptz not null default now(), unique(id,user_id), unique(user_id,name)
);
create table public.saved_papers (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 collection_id uuid, title text not null check(length(title) between 1 and 500), metadata jsonb not null default '{}' check(jsonb_typeof(metadata)='object' and octet_length(metadata::text)<50000),
 pages jsonb not null default '[]' check(jsonb_typeof(pages)='array' and jsonb_array_length(pages)<=100 and octet_length(pages::text)<700000),
 notes text not null default '' check(length(notes)<=20000), created_at timestamptz not null default now(), unique(id,user_id),
 foreign key(collection_id,user_id) references public.paper_collections(id,user_id)
);
create index saved_papers_owner on public.saved_papers(user_id,created_at desc);
create index saved_papers_collection on public.saved_papers(collection_id,user_id);
create table public.chat_notes (
 chat_id uuid primary key, user_id uuid not null references auth.users on delete cascade,
 note text not null default '' check(length(note)<=20000),
 foreign key(chat_id,user_id) references public.chats(id,user_id) on delete cascade
);
create index chat_notes_owner on public.chat_notes(user_id);
create table public.research_topics (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 topic text not null check(length(btrim(topic)) between 2 and 100), created_at timestamptz not null default now(), unique(user_id,topic), unique(id,user_id)
);
create table public.paper_alerts (
 id bigint generated always as identity primary key, user_id uuid not null references auth.users on delete cascade,
 topic_id uuid not null, doc_id text not null, title text not null, url text, created_at timestamptz not null default now(), seen boolean not null default false,
 foreign key(topic_id,user_id) references public.research_topics(id,user_id) on delete cascade, unique(topic_id,doc_id)
);
create index paper_alerts_owner on public.paper_alerts(user_id,created_at desc);
create table public.answer_feedback (
 message_id bigint primary key references public.messages(id) on delete cascade, user_id uuid not null references auth.users on delete cascade,
 rating integer not null check(rating in (-1,1)), created_at timestamptz not null default now()
);
create index answer_feedback_owner on public.answer_feedback(user_id);
do $$ declare t text; begin
 foreach t in array array['paper_collections','saved_papers','chat_notes','research_topics','paper_alerts','answer_feedback'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
 if t<>'paper_alerts' then
 execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid())=user_id)',t);
 end if;
 execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t);
 execute format('create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid())=user_id)',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 end loop;
end $$;
-- Feedback must point at the same user's message; identifiers alone grant nothing.
create policy feedback_message_owner on public.answer_feedback as restrictive for all to authenticated
 using (exists(select 1 from public.messages m where m.id=message_id and m.user_id=(select auth.uid())))
 with check (exists(select 1 from public.messages m where m.id=message_id and m.user_id=(select auth.uid())));
revoke insert on public.paper_alerts from authenticated;
revoke update on public.paper_alerts from authenticated;
grant update(seen) on public.paper_alerts to authenticated;
-- Internal data is service-only. No prompts, uploads or model answers enter cache/metrics.
create table public.provider_cache(key text primary key, value jsonb not null check(octet_length(value::text)<3000000), expires_at timestamptz not null);
create index provider_cache_expiry on public.provider_cache(expires_at);
create table public.provider_slots(key text primary key, leased_until timestamptz not null);
create table public.research_metrics(id bigint generated always as identity primary key, request_id uuid not null, created_at timestamptz not null default now(), latency_ms integer not null, source_count integer not null, outcome text not null, model text, empty_retrieval boolean not null default false);
alter table public.provider_cache enable row level security;
alter table public.provider_slots enable row level security;
alter table public.research_metrics enable row level security;
revoke all on public.provider_cache,public.provider_slots,public.research_metrics from anon,authenticated;
grant all on public.provider_cache,public.provider_slots,public.research_metrics to service_role;
grant usage,select on sequence public.research_metrics_id_seq to service_role;
create function public.lease_provider(p_key text,p_seconds integer default 30) returns boolean language plpgsql security invoker set search_path='' as $$
declare ok boolean; begin
 insert into public.provider_slots(key,leased_until) values(left(p_key,100),now()+make_interval(secs=>greatest(1,least(p_seconds,60))))
 on conflict(key) do update set leased_until=excluded.leased_until where public.provider_slots.leased_until<now() returning true into ok;
 return coalesce(ok,false); end $$;
revoke all on function public.lease_provider(text,integer) from public,anon,authenticated;
grant execute on function public.lease_provider(text,integer) to service_role;
-- Daily in-app alerts. Only new archive records after subscription are eligible;
-- unique(topic_id,doc_id) makes retries idempotent. Service role/cron only.
create function public.refresh_paper_alerts() returns integer language plpgsql security invoker set search_path='' as $$
declare n integer; begin
 insert into public.paper_alerts(user_id,topic_id,doc_id,title,url)
 select t.user_id,t.id,p.doc_id,min(p.title),min(p.url)
 from public.research_topics t join public.paper_chunks p on p.created_at>=t.created_at
 and p.origin='arxiv_abstract' and p.search_document @@ websearch_to_tsquery('english',t.topic)
 group by t.user_id,t.id,p.doc_id on conflict(topic_id,doc_id) do nothing;
 get diagnostics n=row_count; return n; end $$;
revoke all on function public.refresh_paper_alerts() from public,anon,authenticated;
grant execute on function public.refresh_paper_alerts() to service_role;
grant select on public.research_topics,public.paper_chunks to service_role;
grant insert,select on public.paper_alerts to service_role;
grant usage,select on sequence public.paper_alerts_id_seq to service_role;
