-- Stage only. Direct Job Cards retain an internal reception audit row but are never
-- presented as checklists. Protect the marker through subsequent Manager edits.
-- Dynamic drift checks prevent executing against unreviewed function versions.
begin;
do $separate$
declare definition text; old_text text; new_text text;
begin
 definition:=pg_get_functiondef('public.zukait_reception_command(text,jsonb)'::regprocedure);
 old_text:='select * into r from public.workshop_receptions where rc_no=intake->''record''->>''rc_no'' for update;';
 new_text:=old_text||E'\n   update public.workshop_receptions set details=details||jsonb_build_object(''direct_job_only'',true) where rc_no=r.rc_no returning * into r;';
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'direct_job_marker_drift'; end if;
 execute replace(definition,old_text,new_text);

 definition:=pg_get_functiondef('public.zukait_reception_phase1_command(text,jsonb)'::regprocedure);
 old_text:='where (nullif(p_command->>''before_sequence'','''') is null or r.sequence_no<(p_command->>''before_sequence'')::bigint)';
 new_text:='where coalesce(r.details->>''direct_job_only'',''false'')<>''true'' and (nullif(p_command->>''before_sequence'','''') is null or r.sequence_no<(p_command->>''before_sequence'')::bigint)';
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'direct_job_list_filter_drift'; end if;
 definition:=replace(definition,old_text,new_text);
 old_text:='update public.workshop_receptions set details=v_details,insurance_id=v_ins,updated_by=p_actor_id where rc_no=v_rc;';
 new_text:='update public.workshop_receptions set details=case when coalesce(v_old.details->>''direct_job_only'',''false'')=''true'' then v_details||jsonb_build_object(''direct_job_only'',true) else v_details end,insurance_id=v_ins,updated_by=p_actor_id where rc_no=v_rc;';
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'direct_job_edit_marker_drift'; end if;
 execute replace(definition,old_text,new_text);
end
$separate$;
commit;
