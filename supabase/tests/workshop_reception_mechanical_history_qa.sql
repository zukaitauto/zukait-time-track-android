-- ZUKAIT isolated QA smoke test for legacy archive + compact shadow writes.
-- Prerequisites: compact foundation and read-compatibility migrations.
-- Mimics the existing Reception {jobs} and Mechanical {assign} snapshot/write
-- sequences using real workshop_state triggers. This does NOT replace separate
-- authenticated end-to-end workflow tests.
-- Entire test transaction must be rolled back.
begin;
update zukait_history.configuration set mode='dual' where singleton=true;

do $qa$
declare
 s public.workshop_state%rowtype;
 next_array jsonb;
 r public.workshop_state%rowtype;
 restored jsonb;
 section_name text;
begin
 for section_name in select unnest(array['jobs','assign']::text[]) loop
   select * into s from public.workshop_state where id='main' for update;
   select coalesce(jsonb_agg(
     case when pos=1
       then value || jsonb_build_object('_historyQaMarker',section_name)
       else value end order by pos),'[]'::jsonb)
   into next_array
   from jsonb_array_elements(coalesce(s.data->section_name,'[]'::jsonb))
   with ordinality t(value,pos);
   if next_array is not distinct from s.data->section_name then
     raise exception 'empty_fixture_for_%',section_name;
   end if;

   -- This matches the legacy archive-and-update pattern of the DB functions.
   insert into public.workshop_state_history(revision,data,updated_at,updated_by)
   values(s.revision,s.data,s.updated_at,s.updated_by)
   on conflict(revision) do nothing;
   update public.workshop_state
   set data=jsonb_set(s.data,array[section_name],next_array),
       revision=s.revision+1,
       updated_at=clock_timestamp(),
       updated_by='rollback_only_history_qa'
   where id='main';

   select * into r from public.workshop_state where id='main';
   if r.revision<>s.revision+1 then
     raise exception 'revision_not_incremented_for_%',section_name;
   end if;
   if not exists(select 1 from public.workshop_state_history
                 where revision=s.revision) then
     raise exception 'missing_legacy_revision_for_%',section_name;
   end if;
   restored:=zukait_history.reconstruct_state(r.revision);
   if restored is distinct from r.data then
     raise exception 'compact_reconstruction_failed_for_%',section_name;
   end if;
 end loop;
end $qa$;

rollback;
