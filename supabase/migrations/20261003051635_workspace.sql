-- Account ownership is enforced in Postgres, including direct Data API calls.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) < 8192),
  created_at timestamptz not null default now()
);
create table public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat' check (char_length(btrim(title)) between 1 and 120),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id)
);
create index chats_owner_recent on public.chats(user_id,updated_at desc);
create table public.messages (
  id bigint generated always as identity primary key,
  chat_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 12000),
  answer text not null check (char_length(answer) between 1 and 50000),
  citations jsonb not null default '[]' check (jsonb_typeof(citations)='array' and octet_length(citations::text)<100000),
  follow_up_questions jsonb not null default '[]' check (jsonb_typeof(follow_up_questions)='array'),
  warnings jsonb not null default '[]' check (jsonb_typeof(warnings)='array' and octet_length(warnings::text)<10000),
  confident boolean not null default false,
  used_web boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key(chat_id,user_id) references public.chats(id,user_id) on delete cascade
);
create index messages_owner on public.messages(user_id);
create index messages_chat_order on public.messages(chat_id,id);
create table public.research_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null default 0,
  primary key(user_id,window_start)
);

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.research_usage enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy chats_own on public.chats for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy messages_own on public.messages for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
-- No direct client policy or grants for research_usage: only its bounded RPC writes it.
revoke all on public.profiles,public.chats,public.messages,public.research_usage from anon,authenticated;
grant select,update on public.profiles to authenticated;
grant select,insert,update,delete on public.chats to authenticated;
grant select,insert,delete on public.messages to authenticated;
grant usage,select on sequence public.messages_id_seq to authenticated;
grant all on public.profiles,public.chats,public.messages,public.research_usage to service_role;
grant usage,select on sequence public.messages_id_seq to service_role;

create function public.create_profile_for_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,name) values(new.id,coalesce(nullif(left(btrim(new.raw_user_meta_data->>'name'),80),''),'Researcher'));
  return new;
end; $$;
revoke all on function public.create_profile_for_user() from public;
create trigger create_spacemind_profile after insert on auth.users for each row execute function public.create_profile_for_user();

insert into public.profiles(id,name) select id,coalesce(nullif(left(btrim(raw_user_meta_data->>'name'),80),''),'Researcher') from auth.users on conflict(id) do nothing;

create function public.consume_research_quota() returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); current_window timestamptz:=date_trunc('hour',now()); n integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  delete from public.research_usage where user_id=uid and window_start<current_window;
  insert into public.research_usage(user_id,window_start,requests) values(uid,current_window,1)
  on conflict(user_id,window_start) do update set requests=public.research_usage.requests+1
    where public.research_usage.requests<30 returning requests into n;
  return n is not null;
end; $$;
revoke all on function public.consume_research_quota() from public;
grant execute on function public.consume_research_quota() to authenticated;

create function public.save_research_turn(p_chat_id uuid,p_question text,p_answer text,p_citations jsonb,p_follow_ups jsonb,p_confident boolean,p_used_web boolean,p_warnings jsonb default '[]')
returns bigint language plpgsql security invoker set search_path='' as $$
declare message_id bigint;
begin
  -- Lock and verify the owned conversation before persisting an answer.
  perform 1 from public.chats where id=p_chat_id and user_id=auth.uid() for update;
  if not found then raise exception 'Conversation not found'; end if;
  insert into public.messages(chat_id,user_id,question,answer,citations,follow_up_questions,confident,used_web,warnings)
    values(p_chat_id,auth.uid(),p_question,p_answer,p_citations,p_follow_ups,p_confident,p_used_web,p_warnings) returning id into message_id;
  update public.chats set updated_at=now(),title=case when title='New chat' then left(p_question,80) else title end where id=p_chat_id;
  return message_id;
end; $$;
revoke all on function public.save_research_turn(uuid,text,text,jsonb,jsonb,boolean,boolean,jsonb) from public;
grant execute on function public.save_research_turn(uuid,text,text,jsonb,jsonb,boolean,boolean,jsonb) to authenticated;
