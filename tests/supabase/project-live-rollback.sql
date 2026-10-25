-- Administrative test harness for the deployed database; NOT a real sign-in test.
-- Transaction rolls back every fixture. Never point this at application user IDs.
begin;
select set_config('spacemind.test_a',gen_random_uuid()::text,true),set_config('spacemind.test_b',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('spacemind.test_a')::uuid),(current_setting('spacemind.test_b')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('spacemind.test_a'),true);
with p as (insert into public.research_projects(user_id,name) values(auth.uid(),'Acceptance fixture (rolled back)') returning id)
select set_config('spacemind.test_project',id::text,true) from p;
insert into public.research_project_items(user_id,project_id,title,execution) values(auth.uid(),current_setting('spacemind.test_project')::uuid,'Fixture','{"code":"print(42)","output":"42"}');
do $$ begin
 if (select count(*) from public.research_project_items)<>1 then raise exception 'Own record unavailable'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('spacemind.test_b'),true);
do $$ begin
 if exists(select 1 from public.research_projects) or exists(select 1 from public.research_project_items) then raise exception 'Foreign rows visible'; end if;
 begin
  insert into public.research_project_items(user_id,project_id,title,execution) values(auth.uid(),current_setting('spacemind.test_project')::uuid,'Foreign link','{"code":"print(42)","output":"42"}');
  raise exception 'Foreign project accepted';
 exception when foreign_key_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('spacemind.test_a'),true);
delete from public.research_projects where id=current_setting('spacemind.test_project')::uuid;
do $$ begin
 if exists(select 1 from public.research_project_items) then raise exception 'Cascade failed'; end if;
 if has_table_privilege('anon','public.research_projects','select') then raise exception 'Anonymous project access'; end if;
end $$;
rollback;
select 'PASS: own records, foreign read/link rejection, project cascade and anonymous denial; all fixtures rolled back' as result;
