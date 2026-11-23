-- ISOLATED QA ONLY. Synthetic fixture; never execute against production.
-- Exercises actual fixture save RPC across compact -> legacy -> compact.
-- Transaction rollback retains every pre-test row; no history deletion.
begin;
do $qa$
declare
 initial public.workshop_state%rowtype;
 expected jsonb[] := array[]::jsonb[];
 result jsonb;
 actual jsonb;
 rev bigint;
 i integer;
 legacy_before bigint;
 compact_before bigint;
 format text;
begin
 select * into strict initial from public.workshop_state where id='main';
 expected := array_append(expected, initial.data);
 select count(*) into legacy_before from public.workshop_state_history;
 select count(*) into compact_before from zukait_history.revisions;
 -- First compact period, two legacy saves (creating a compact-chain gap),
 -- resumed compact period, then rollback again with continued legacy saves.
 for i in 1..6 loop
  update zukait_history.configuration
  set mode=case when i in (2,3,6) then 'legacy' else 'compact' end,
      cutover_approved=true where singleton;
  rev:=initial.revision+i-1;
  actual:=jsonb_set(expected[i],'{_rollbackQa}',to_jsonb(i),true);
  result:=public.zukait_commit_workshop_state_v2(rev,actual,'isolated_rollback_qa','[]'::jsonb);
  if result->>'ok' is distinct from 'true' then raise exception 'rollback_save_failed_%: %',i,result; end if;
  expected:=array_append(expected,actual);
  if (select revision from public.workshop_state where id='main')<>rev+1 then
   raise exception 'rollback_revision_mismatch_%',i;
  end if;
 end loop;
 if (select count(*) from public.workshop_state_history)<>legacy_before+3 then
  raise exception 'legacy_rollback_archive_count';
 end if;
 if (select count(*) from zukait_history.revisions)<=compact_before then
  raise exception 'compact_capture_missing';
 end if;
 -- Every version must survive capture pauses and rollback, including revisions
 -- absent from the compact chain. Public RPC and private reader must agree.
 for i in 1..7 loop
  rev:=initial.revision+i-1;
  select h.data,h.storage_format into actual,format from zukait_history.read_revision(rev) h;
  if actual is distinct from expected[i] then raise exception 'rollback_private_read_mismatch_%',rev; end if;
  actual:=public.zukait_history_revision_data(rev);
  if actual is distinct from expected[i] then raise exception 'rollback_rpc_read_mismatch_%',rev; end if;
 end loop;
 -- A failed save must roll back its paired archive and compact capture too.
 select count(*) into legacy_before from public.workshop_state_history;
 select count(*) into compact_before from zukait_history.revisions;
 begin
  update zukait_history.configuration set mode='compact' where singleton;
  result:=public.zukait_commit_workshop_state_v2(initial.revision+6,
   jsonb_set(expected[7],'{_rollbackQa}','999'::jsonb,true),'isolated_rollback_qa','[]'::jsonb);
  if result->>'ok' is distinct from 'true' then raise exception 'fixture_save_failed'; end if;
  raise exception using errcode='ZQ001',message='simulate transaction failure after capture';
 exception when sqlstate 'ZQ001' then null;
 end;
 if (select revision from public.workshop_state where id='main')<>initial.revision+6
 or (select count(*) from public.workshop_state_history)<>legacy_before
 or (select count(*) from zukait_history.revisions)<>compact_before then
  raise exception 'failed_transaction_changed_history';
 end if;
end $qa$;
rollback;
