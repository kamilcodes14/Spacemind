-- Supabase can grant function privileges directly through default privileges.
-- Revoking PUBLIC alone does not remove those explicit role grants.
create schema if not exists spacemind_private;
revoke all on schema spacemind_private from public,anon,authenticated;
grant usage on schema spacemind_private to authenticated;
alter function public.create_profile_for_user() set schema spacemind_private;
revoke all on function spacemind_private.create_profile_for_user() from public,anon,authenticated;
alter function public.consume_research_quota() set schema spacemind_private;
revoke all on function spacemind_private.consume_research_quota() from public,anon,authenticated;
grant execute on function spacemind_private.consume_research_quota() to authenticated;
create function public.consume_research_quota() returns boolean
language sql security invoker set search_path='' as $$ select spacemind_private.consume_research_quota(); $$;
revoke all on function public.consume_research_quota() from public,anon,authenticated;
grant execute on function public.consume_research_quota() to authenticated;
revoke all on function public.save_research_turn(uuid,text,text,jsonb,jsonb,boolean,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.save_research_turn(uuid,text,text,jsonb,jsonb,boolean,boolean,jsonb) to authenticated;
revoke all on function public.match_papers(extensions.vector,text,integer) from public,anon,authenticated;
grant execute on function public.match_papers(extensions.vector,text,integer) to authenticated;
