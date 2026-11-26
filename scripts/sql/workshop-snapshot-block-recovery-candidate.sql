-- PRODUCTION CANDIDATE ONLY. Derived from actual live recovery definition.
-- Deploy only after backup and complete recovery-chain tests; preserve existing ACL.
-- Requires workshop-snapshot-block-pilot.sql and workshop-snapshot-block-reader.sql.
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
  shadow boolean;
  blocked boolean;
begin
  -- Choose the nearest later full checkpoint, including the current state.
  select candidate.revision,candidate.data,candidate.staged,candidate.shadow,candidate.blocked into checkpoint_revision,checkpoint_data,staged,shadow,blocked
  from (
    (select h.revision,h.data,false as staged,false as shadow,false as blocked from public.workshop_state_history h
     where h.revision>=p_revision order by h.revision limit 1)
    union all
    (select p.revision,null::jsonb,true,false,false from private.workshop_archive_conversion_pilot p
     where p.revision>=p_revision order by p.revision limit 1)
    union all
    (select h.revision,null::jsonb,false,true,false from private.workshop_consumables_shadow_history h
     where h.revision>=p_revision order by h.revision limit 1)
    union all
    (select m.revision,null::jsonb,false,false,true from private.workshop_snapshot_manifests m
     where m.revision>=p_revision order by m.revision limit 1)
    union all
    (select s.revision,s.data,false,false,false from public.workshop_state s
     where s.id='main' and s.revision>=p_revision)
  ) candidate
  order by candidate.revision,candidate.staged desc,candidate.blocked asc,candidate.shadow asc limit 1;
  if not found then return null; end if;

  if staged then checkpoint_data:=private.read_workshop_archive_pilot(checkpoint_revision); end if;
  if shadow then checkpoint_data:=private.read_workshop_consumables_shadow(checkpoint_revision)->'data'; end if;

  if blocked then checkpoint_data:=private.read_workshop_snapshot_blocks(checkpoint_revision)->'data'; end if;

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
