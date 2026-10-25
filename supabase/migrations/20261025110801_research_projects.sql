create table public.research_projects (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 100),
 notes text not null default '' check(length(notes)<=20000),
 created_at timestamptz not null default now(), unique(id,user_id)
);
create index research_projects_owner on public.research_projects(user_id);
create table public.research_project_items (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null, paper_id uuid, chat_id uuid,
 title text not null check(length(btrim(title)) between 1 and 500),
 execution jsonb,
 created_at timestamptz not null default now(),
 foreign key(project_id,user_id) references public.research_projects(id,user_id) on delete cascade,
 foreign key(paper_id,user_id) references public.saved_papers(id,user_id) on delete cascade,
 foreign key(chat_id,user_id) references public.chats(id,user_id) on delete cascade,
 check(num_nonnulls(paper_id,chat_id,execution)=1),
 check(execution is null or (jsonb_typeof(execution)='object' and execution ? 'code' and execution ? 'output' and jsonb_typeof(execution->'code')='string' and jsonb_typeof(execution->'output')='string' and octet_length(execution::text)<200000))
);
create index project_items_owner on public.research_project_items(user_id);
create index project_items_project on public.research_project_items(project_id,user_id);
create index project_items_paper on public.research_project_items(paper_id,user_id);
create index project_items_chat on public.research_project_items(chat_id,user_id);
create unique index project_paper_once on public.research_project_items(project_id,paper_id) where paper_id is not null;
create unique index project_chat_once on public.research_project_items(project_id,chat_id) where chat_id is not null;
alter table public.research_projects enable row level security;
alter table public.research_project_items enable row level security;
create policy owner_all on public.research_projects for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy owner_all on public.research_project_items for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.research_projects,public.research_project_items from public,anon,authenticated;
grant select,insert,update,delete on public.research_projects,public.research_project_items to authenticated;
grant all on public.research_projects,public.research_project_items to service_role;
create function public.bound_research_projects() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Authentication required'; end if;
 -- Serialize inserts for this owner; protect the cap against simultaneous requests.
 perform 1 from public.profiles where id=new.user_id for update;
 if tg_table_name='research_projects' and (select count(*) from public.research_projects where user_id=new.user_id)>=100 then raise exception 'Project limit reached (100)'; end if;
 if tg_table_name='research_project_items' and (select count(*) from public.research_project_items where user_id=new.user_id)>=500 then raise exception 'Project item limit reached (500)'; end if;
 return new;
end $$;
revoke all on function public.bound_research_projects() from public,anon,authenticated;
create trigger bound_projects before insert on public.research_projects for each row execute function public.bound_research_projects();
create trigger bound_project_items before insert on public.research_project_items for each row execute function public.bound_research_projects();
