CREATE OR REPLACE FUNCTION private.read_workshop_archive_pilot(p_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare checkpoint bigint; entry record; restored jsonb; steps integer:=0;
begin
  select max(revision) into checkpoint from private.workshop_archive_conversion_pilot
    where revision<=p_revision and is_checkpoint;
  if checkpoint is null then raise exception 'Missing archive pilot checkpoint'; end if;
  for entry in select revision,is_checkpoint,payload from private.workshop_archive_conversion_pilot
    where revision between checkpoint and p_revision order by revision limit 9
  loop
    steps:=steps+1;
    if steps>8 then raise exception 'Archive pilot group exceeds eight revisions'; end if;
    if entry.is_checkpoint then
      restored:=entry.payload;
    else
      select (restored-coalesce(array_agg(k) filter(where change @> '{"present":false}'),array[]::text[]))
        ||coalesce(jsonb_object_agg(k,
          case when change ? 'length' then (
            select coalesce(jsonb_agg(coalesce(i.item,o.item) order by n.pos),'[]')
            from generate_series(1,(change->>'length')::integer) n(pos)
            left join jsonb_array_elements(restored->k) with ordinality o(item,pos) on o.pos=n.pos
            left join jsonb_each(change->'items') i(key,item) on i.key=n.pos::text)
          else change->'value' end) filter(where not change @> '{"present":false}'),'{}')
      into restored from jsonb_each(entry.payload) e(k,change);
    end if;
  end loop;
  return restored;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.recover_workshop_revision(p_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  checkpoint_revision bigint;
  checkpoint_data jsonb;
  previous_revision bigint;
  manager_delta jsonb;
  time_delta jsonb;
  staged boolean;
begin
  -- Choose the nearest later full checkpoint, including the current state.
  select candidate.revision,candidate.data,candidate.staged into checkpoint_revision,checkpoint_data,staged
  from (
    (select h.revision,h.data,false as staged from public.workshop_state_history h
     where h.revision>=p_revision order by h.revision limit 1)
    union all
    (select p.revision,null::jsonb,true from private.workshop_archive_conversion_pilot p
     where p.revision>=p_revision order by p.revision limit 1)
    union all
    (select s.revision,s.data,false from public.workshop_state s
     where s.id='main' and s.revision>=p_revision)
  ) candidate
  order by candidate.revision,candidate.staged desc limit 1;
  if not found then return null; end if;

  if staged then checkpoint_data:=private.read_workshop_archive_pilot(checkpoint_revision); end if;

  while checkpoint_revision>p_revision loop
    previous_revision := checkpoint_revision-1;
    select delta into manager_delta from private.workshop_manager_edit_revision
      where prior_revision=previous_revision;
    if found then
      checkpoint_data := private.undo_workshop_manager_edit(checkpoint_data,manager_delta);
    elsif exists (select from private.workshop_job_notes_delta where prior_revision=previous_revision) then
      checkpoint_data := private.undo_workshop_job_notes(previous_revision,checkpoint_data);
    else
      select delta into time_delta from private.workshop_time_edit_revision where prior_revision=previous_revision;
      if not found then raise exception 'workshop_recovery_gap_at_revision_%',previous_revision; end if;
      if time_delta ? 'consumables' then
        checkpoint_data:=private.undo_workshop_consumables_edit(checkpoint_data,time_delta->'consumables');
      elsif time_delta ? 'paint' then
        checkpoint_data:=private.undo_workshop_paint_edit(checkpoint_data,time_delta->'paint');
      elsif time_delta ? 'reception_estimate' then
        checkpoint_data:=private.undo_workshop_reception_estimate(checkpoint_data,time_delta->'reception_estimate');
        if checkpoint_data is null then raise exception 'workshop_estimate_delta_does_not_match_at_revision_%',previous_revision; end if;
      else
      checkpoint_data:=private.undo_workshop_time_edit(checkpoint_data,time_delta);
      end if;
    end if;
    checkpoint_revision := previous_revision;
  end loop;
  return checkpoint_data;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.zukait_read_workshop_merge_base(p_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if p_revision is null or p_revision < 0 then return null; end if;
  return private.recover_workshop_revision(p_revision);
exception when raise_exception then
  -- Older unavailable bases use the existing stale-revision response.
  if sqlerrm ~ '^workshop_recovery_gap_at_revision_[0-9]+$' then return null; end if;
  raise;
end;
$function$
;