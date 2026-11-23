-- Isolated candidate, loaded AFTER mechanical-persistence.sql. Not a migration.
-- Reject stale full-state writes atomically; do not merge stale employee history.
create function zukait_mechanical.protect_assignment_authority() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
declare registered record; department text; by_id jsonb; old_by_id jsonb; link record; candidate jsonb; previous jsonb; field text; source_ids text[]; repeat_logs jsonb;
begin
 -- Disabling new commands must never disable protection of existing handovers.
 if new.data is not distinct from old.data then return new;end if;
 if not exists(select 1 from zukait_mechanical.checklists) then return new;end if;
 select s.department into department from zukait_mechanical.settings s where singleton;
 for registered in select c.job_card from zukait_mechanical.checklists c loop
  perform zukait_mechanical.assert_separate_job(new.data,registered.job_card,department);
 end loop;
 if jsonb_typeof(new.data->'assign') is distinct from 'array' then raise exception 'mechanical_authority_conflict';end if;
 if exists(select 1 from jsonb_array_elements(new.data->'assign') a group by a->>'id' having count(*)>1) then raise exception 'mechanical_authority_conflict';end if;
 select coalesce(jsonb_object_agg(a->>'id',a) filter(where a->>'id' is not null),'{}') into by_id from jsonb_array_elements(new.data->'assign') a;
 select coalesce(jsonb_object_agg(a->>'id',a) filter(where a->>'id' is not null),'{}') into old_by_id from jsonb_array_elements(coalesce(old.data->'assign','[]')) a;
 if exists(select 1 from zukait_mechanical.repeat_repairs) then
  if jsonb_typeof(new.data->'reworkLogs') is distinct from 'array' then raise exception 'mechanical_authority_conflict';end if;
  select coalesce(jsonb_object_agg(id,jsonb_build_object('count',n,'log',item)),'{}') into repeat_logs from (select r->>'id' id,count(*) n,jsonb_agg(r)->0 item from jsonb_array_elements(new.data->'reworkLogs') r where r->>'id' is not null group by r->>'id') x;
 end if;
 for link in select l.*,t.checklist_id,c.job_card,r.projection repeat_projection,r.log_projection,r.request_id repeat_request from zukait_mechanical.links l
  join zukait_mechanical.tasks t on t.id=l.task_id join zukait_mechanical.checklists c on c.id=t.checklist_id left join zukait_mechanical.repeat_repairs r on r.assignment_id=l.assignment_id
 loop
  candidate:=by_id->link.assignment_id::text;previous:=old_by_id->link.assignment_id::text;
  if candidate is null or candidate->>'emp' is distinct from link.employee_id
   or candidate->>'job' is distinct from link.job_card
   or candidate->>'mechanicalTaskId' is distinct from link.task_id::text
   or candidate->>'mechanicalChecklistId' is distinct from link.checklist_id::text
   or candidate->>'handoverFromAssignmentId' is distinct from link.predecessor_id::text
   or candidate->>'handedOverToAssignmentId' is distinct from link.successor_id::text
  then raise exception 'mechanical_authority_conflict';end if;
  if link.repeat_projection is not null then
   foreach field in array array['rework','repeatCycleId','repeatCycleNo','repeatReason','mistakeEmp','repeatSameEmployee','v125Cycle','assignedBy','assignedAt','mechanicalRepeatOfAssignmentId'] loop
    if candidate->field is distinct from link.repeat_projection->field then raise exception 'mechanical_authority_conflict';end if;
   end loop;
   if repeat_logs->link.repeat_request::text->'count' is distinct from '1'::jsonb or not coalesce((repeat_logs->link.repeat_request::text->'log') @> link.log_projection,false) then raise exception 'mechanical_authority_conflict';end if;
  end if;
  if link.successor_id is not null then
   if candidate->'completed' is distinct from 'true'::jsonb then raise exception 'mechanical_authority_conflict';end if;
   -- Once handed over, preserve the original allocation and completion stamp.
   -- Ordinary audited session corrections still belong to existing time rules.
   if previous->>'handedOverToAssignmentId'=link.successor_id::text then
    foreach field in array array['suggested','assignedBy','assignedAt','completedAt'] loop
     if candidate->field is distinct from previous->field then raise exception 'mechanical_authority_conflict';end if;
    end loop;
   end if;
  end if;
 end loop;
 -- Older full-state clients must not resume a completed handover source by
 -- inserting a fresh session while leaving completed=true on the assignment.
 select array_agg(assignment_id::text) into source_ids from zukait_mechanical.links where successor_id is not null;
 if source_ids is not null then
 if exists(select 1 from jsonb_array_elements(coalesce(new.data->'sessions','[]')) s
  where s->>'assignmentId'=any(source_ids) and not coalesce((s->>'cancelled')::boolean,false)
   and not coalesce((s->>'voided')::boolean,false) and not coalesce((s->>'deleted')::boolean,false)
   and case when coalesce(s->>'start','') ~ '^[0-9]+$' and coalesce(s->>'end','') ~ '^[0-9]+$'
     then (s->>'start')::numeric<=0 or (s->>'end')::numeric<(s->>'start')::numeric or
       (s->>'end')::numeric>(by_id->(s->>'assignmentId')->>'completedAt')::numeric
     else true end)
 then raise exception 'mechanical_authority_conflict';end if;
 end if;
 return new;
end $$;
revoke all on function zukait_mechanical.protect_assignment_authority() from public,anon,authenticated;
create trigger mechanical_assignment_authority before update of data on public.workshop_state
 for each row execute function zukait_mechanical.protect_assignment_authority();

-- The legacy commit RPC also accepts p_live AFTER writing workshop_state. An
-- identical-state retry can skip that UPDATE, so guard stale source pointers
-- independently rather than relying on the workshop-state trigger alone.
create function zukait_mechanical.protect_live_assignment() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 -- Existing non-UUID assignment identities are valid legacy data. Test their
 -- shape before casting; preserve the indexed UUID lookup for Mechanical IDs.
 if new.assignment_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  if exists(select 1 from zukait_mechanical.links l where l.assignment_id=new.assignment_id::uuid and l.successor_id is not null)
  then raise exception 'mechanical_live_authority_conflict';end if;
 end if;
 return new;
end $$;
revoke all on function zukait_mechanical.protect_live_assignment() from public,anon,authenticated;
create trigger mechanical_live_assignment_authority before insert or update on public.workshop_live_status
 for each row execute function zukait_mechanical.protect_live_assignment();
