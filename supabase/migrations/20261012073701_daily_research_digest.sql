create table public.scheduled_job_keys(job text primary key, token_hash text not null, leased_until timestamptz, last_success timestamptz);
alter table public.scheduled_job_keys enable row level security;
revoke all on public.scheduled_job_keys from public,anon,authenticated;
grant select,update on public.scheduled_job_keys to service_role;
create function public.claim_digest_job(p_hash text) returns boolean language plpgsql security invoker set search_path='' as $$
declare ok boolean; begin
 update public.scheduled_job_keys set leased_until=now()+interval '10 minutes'
 where job='daily-digest' and token_hash=p_hash and (leased_until is null or leased_until<now()) and (last_success is null or last_success<now()-interval '20 hours') returning true into ok;
 return coalesce(ok,false); end $$;
revoke all on function public.claim_digest_job(text) from public,anon,authenticated;
grant execute on function public.claim_digest_job(text) to service_role;
-- Production Supabase has these extensions. Local test engines may not.
-- The secret is generated in the database, held in Vault and never in Git.
do $$ declare secret text; begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') and exists(select 1 from pg_available_extensions where name='pg_net') and exists(select 1 from pg_namespace where nspname='vault') then
  create extension if not exists pg_cron;
  create extension if not exists pg_net with schema extensions;
  secret:=gen_random_uuid()::text||gen_random_uuid()::text;
  perform vault.create_secret(secret,'spacemind_daily_digest_token','SpaceMind daily digest job authentication');
  insert into public.scheduled_job_keys(job,token_hash) values('daily-digest',encode(sha256(convert_to(secret,'UTF8')),'hex'));
  perform cron.schedule('spacemind-daily-digest','15 2 * * *',$job$
   select net.http_post(
    url:='https://aqblctjucyxqjmylojgc.supabase.co/functions/v1/daily-digest',
    headers:=jsonb_build_object('Content-Type','application/json','x-job-token',(select decrypted_secret from vault.decrypted_secrets where name='spacemind_daily_digest_token' limit 1)),
    body:='{}'::jsonb,timeout_milliseconds:=120000
   );
  $job$);
  perform cron.schedule('spacemind-maintenance','40 2 * * *',$job$
   delete from public.provider_cache where expires_at<now();
   delete from public.research_metrics where created_at<now()-interval '30 days';
   delete from public.research_usage where window_start<now()-interval '7 days';
  $job$);
 end if;
end $$;
