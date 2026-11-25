-- STAGED ONLY. Do not apply to production or enable cron from this file.
-- Existing pilot scope <=17683. Four revisions maximum; verify each reconstruction.
-- Older snapshots convert descending, newer snapshots ascending to avoid stranded interior gaps.
CREATE OR REPLACE FUNCTION private.continue_workshop_archive_conversion()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog,pg_temp'
 SET lock_timeout TO '2s'
AS $function$
begin
 if not pg_try_advisory_xact_lock(hashtextextended('workshop_archive_conversion',0)) then return; end if;
 create temp table archive_trial_full(revision bigint primary key,payload jsonb not null) on commit drop;
insert into archive_trial_full select revision,data from public.workshop_state_history where revision <= 17683 and (case when exists(
 select from public.workshop_state_history where revision < (select min(revision) from private.workshop_archive_conversion_pilot)
) then revision < (select min(revision) from private.workshop_archive_conversion_pilot)
else revision > (select max(revision) from private.workshop_archive_conversion_pilot) end) order by case when revision < (select min(revision) from private.workshop_archive_conversion_pilot) then -revision else revision end limit 4;
declare
  original record;
  previous jsonb;
  restored jsonb;
  patch jsonb;
  batch_position integer:=0;
begin
  for original in select * from archive_trial_full order by revision loop
    if batch_position % 8 = 0 then
      insert into private.workshop_archive_conversion_pilot(revision,is_checkpoint,payload) values(original.revision,true,original.payload) returning payload into restored;
    else
      select coalesce(jsonb_object_agg(k,
        case when jsonb_typeof(old_value)='array' and jsonb_typeof(new_value)='array' then
          jsonb_build_object('length',jsonb_array_length(new_value),'items',(
            select coalesce(jsonb_object_agg(n.pos::text,n.item),'{}')
            from jsonb_array_elements(new_value) with ordinality n(item,pos)
            left join jsonb_array_elements(old_value) with ordinality o(item,pos) using(pos)
            where o.item is distinct from n.item))
        else jsonb_build_object('present',original.payload ? k,'value',new_value) end),'{}')
      into patch
      from jsonb_object_keys(previous||original.payload) k
      cross join lateral (select previous->k old_value,original.payload->k new_value) v
      where old_value is distinct from new_value;
      insert into private.workshop_archive_conversion_pilot(revision,is_checkpoint,payload) values(original.revision,false,patch) returning payload into patch;
      select (previous-coalesce(array_agg(k) filter(where change @> '{"present":false}'),array[]::text[]))
        ||coalesce(jsonb_object_agg(k,
          case when change ? 'length' then (
            select coalesce(jsonb_agg(coalesce(i.item,o.item) order by n.pos),'[]')
            from generate_series(1,(change->>'length')::integer) n(pos)
            left join jsonb_array_elements(previous->k) with ordinality o(item,pos) on o.pos=n.pos
            left join jsonb_each(change->'items') i(key,item) on i.key=n.pos::text)
          else change->'value' end) filter(where not change @> '{"present":false}'),'{}')
      into restored from jsonb_each(patch) e(k,change);
    end if;
    if restored is distinct from original.payload then raise exception 'Archive trial recovery mismatch at %',original.revision; end if;
    previous:=restored;
    batch_position:=batch_position+1;
  end loop;
end;
declare removed bigint;
begin
 if (select count(*) from archive_trial_full)>4 then raise exception 'Batch exceeds four revisions'; end if;
 lock table public.workshop_state_history in share row exclusive mode;
 if exists(select from pg_trigger where tgrelid='public.workshop_state_history'::regclass and not tgisinternal)
 or exists(select from pg_constraint where contype='f' and confrelid='public.workshop_state_history'::regclass)
 or exists(select from pg_rewrite where ev_class='public.workshop_state_history'::regclass)
 then raise exception 'Archive write dependencies changed'; end if;
 if exists(select from archive_trial_full t left join public.workshop_state_history h using(revision) where t.payload is distinct from h.data) then raise exception 'Originals changed during staging'; end if;
 update private.workshop_archive_conversion_pilot p set updated_at=h.updated_at,updated_by=h.updated_by,archived_at=h.archived_at
 from public.workshop_state_history h join archive_trial_full t using(revision) where p.revision=h.revision;
 delete from public.workshop_state_history h using archive_trial_full t where h.revision=t.revision;
 get diagnostics removed=row_count;
 if removed<>(select count(*) from archive_trial_full) or exists(
   select from archive_trial_full t
   where public.zukait_read_workshop_merge_base(t.revision) is distinct from t.payload
 ) then raise exception 'Recovery verification failed'; end if;
end;
 if not exists(select from public.workshop_state_history where revision<=17683) then
   perform cron.unschedule('workshop_archive_conversion_17683');
 elsif not exists(select from archive_trial_full) then
   raise exception 'Archive conversion cannot select remaining revisions';
 end if;
exception
 when lock_not_available then return;
 when others or query_canceled then
   perform cron.unschedule('workshop_archive_conversion_17683');
   raise warning 'Workshop archive conversion stopped: %',sqlstate;
end;
$function$
;
