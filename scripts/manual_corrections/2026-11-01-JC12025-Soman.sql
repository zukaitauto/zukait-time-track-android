-- One-time owner-authorized ZUKAIT correction, 2026-11-01, Asia/Muscat.
-- Guarded by source revision and exact session IDs. Never run twice.
-- Run in BEGIN ... COMMIT via ZUKAIT workflow after validation.
do $jc12025$
declare
 d jsonb; r bigint; j jsonb; badwork jsonb; badidle jsonb; idlea jsonb;
 a_id text := gen_random_uuid()::text; s_id text := gen_random_uuid()::text;
 st bigint := floor(extract(epoch from timestamptz '2026-11-01 08:15:00+04:00')*1000)::bigint;
 void_time bigint; n bigint := floor(extract(epoch from clock_timestamp())*1000)::bigint;
 audit jsonb; evt jsonb; replacement jsonb; lrows jsonb; receipt jsonb;
 open_count int; other_work int;
begin
 void_time:=st-1000;
 if (clock_timestamp() at time zone 'Asia/Muscat')::date <> date '2026-11-01' then
   raise exception 'Correction date mismatch'; end if;
 select data,revision into d,r from public.workshop_state where id='main' for update;
 if r<>15481 then raise exception 'Workshop changed since inspection; revision %',r; end if;
 select value into j from jsonb_array_elements(d->'jobs') where value->>'no'='12025';
 if j is null or j->>'delivered'<>'true' or (j#>>'{qcWorkflow,revision}')::int<>3 then
   raise exception 'JC12025 delivered state or QC changed'; end if;
 select value into idlea from jsonb_array_elements(d->'assign') where value->>'id'='8f63137d-0e42-4679-a6a4-e8ad0829d8fb';
 select value into badidle from jsonb_array_elements(d->'sessions') where value->>'id'='4232100c-0eb2-420e-8810-c2dc55d7be87';
 select value into badwork from jsonb_array_elements(d->'sessions') where value->>'id'='ae2b7863-ea2c-4272-be2a-e58600490e3f';
 if idlea is null or idlea->>'emp'<>'EMP003' or idlea->>'job'<>'ID001' or idlea->>'completed'<>'false'
    or badidle is null or badidle->>'emp'<>'EMP003' or badidle->>'job'<>'ID001' or badidle->>'end' is not null
    or badwork is null or badwork->>'emp'<>'EMP003' or badwork->>'job'<>'12083'
    or badwork->>'start'<>'1793506633506' then
    raise exception 'Today mistaken work sessions changed'; end if;
 select count(*) into open_count from jsonb_array_elements(d->'sessions') t
 where t->>'emp'='EMP003' and t->>'end' is null and t->>'cancelled' is distinct from 'true';
 if open_count<>1 then raise exception 'Soman currently has % running sessions',open_count;end if;
 select count(*) into other_work from jsonb_array_elements(d->'sessions') t
 where t->>'emp'='EMP003' and (t->>'start')::bigint>=st
 and t->>'id' not in ('4232100c-0eb2-420e-8810-c2dc55d7be87','ae2b7863-ea2c-4272-be2a-e58600490e3f')
 and t->>'cancelled' is distinct from 'true';
 if other_work<>0 then raise exception 'Other Soman work exists after 08:15: %',other_work;end if;
 if (select count(*) from jsonb_array_elements(d->'assign') a
      where a->>'job'='12025' and a->>'emp'='EMP003' and a->>'completed'='true')<>1
 then raise exception 'Original Soman assignment not found';end if;
 audit:=jsonb_build_object('id',gen_random_uuid()::text,'type','OWNER_REQUEST_CORRECTION',
  'job','12025','emp','EMP003','by','OWNER_REQUEST_ADMIN_TOOL','at',n,
  'reason','Owner confirmed today JC12083 and ID001 were accidental. Soman starts JC12025 at 08:15 with a new eight-hour allocation.',
  'voidedWorkSession',badwork,'voidedIdleSession',badidle,'voidedIdleAssignment',idlea,
  'newAssignmentId',a_id,'newSessionId',s_id,'startAt',st,'allocatedMinutes',480);
 evt:=jsonb_build_object('operation','REOPEN_ADDITIONAL','at',n,
  'by','OWNER_REQUEST_ADMIN_TOOL','reason','Owner-requested additional work, not Repeat Work',
  'employeeId','EMP003','minutes',480,'assignmentId',a_id,
  'previousDelivery',jsonb_build_object('at',j->'deliveredAt','by',j->'deliveredBy','byName',j->'deliveredByName'),
  'invoiceAtReopen',jsonb_build_object('amount',j->'finalInvoiceAmount','date',j->'invoiceDate'));
 replacement:=((j-'deliveredAt'-'deliveredBy'-'deliveredByName'-'completedAt')
  || jsonb_build_object('status','Open','delivered',false,'qcPassed',false,
   'qcWorkflow',jsonb_build_object('revision',4,'history',
     coalesce(j#>'{qcWorkflow,history}','[]'::jsonb)||jsonb_build_array(evt)),
   'deliveryAudit',coalesce(j->'deliveryAudit','[]'::jsonb)||jsonb_build_array(evt),
   'workReopenAudit',coalesce(j->'workReopenAudit','[]'::jsonb)||jsonb_build_array(evt),
   'reopenedAt',n,'reopenedBy','OWNER_REQUEST_ADMIN_TOOL'));
 d:=jsonb_set(d,'{jobs}',(select jsonb_agg(case when item->>'no'='12025' then replacement else item end order by ord)
   from jsonb_array_elements(d->'jobs') with ordinality t(item,ord)));
 d:=jsonb_set(d,'{assign}',(select jsonb_agg(case when item->>'id'='8f63137d-0e42-4679-a6a4-e8ad0829d8fb'
    then item||jsonb_build_object('cancelled',true,'completed',true,'completedAt',void_time,
      'managerTimeCancellation',true,'managerTimeUpdatedAt',n,'managerTimeRevision',1,
      'voidedAt',n,'voidedBy','OWNER_REQUEST_ADMIN_TOOL') else item end order by ord)
    from jsonb_array_elements(d->'assign') with ordinality t(item,ord))
   ||jsonb_build_array(jsonb_build_object('id',a_id,'job','12025','emp','EMP003','suggested',480,
      'completed',false,'cancelled',false,'rework',false,'reissued',true,'additionalWork',true,
      'assignedAt',st,'createdAt',n,'assignedBy','OWNER_REQUEST_ADMIN_TOOL',
      'additionalWorkReason','Owner authorized correction and additional work')));
 d:=jsonb_set(d,'{sessions}',(select jsonb_agg(case when item->>'id' in
     ('4232100c-0eb2-420e-8810-c2dc55d7be87','ae2b7863-ea2c-4272-be2a-e58600490e3f')
    then item||jsonb_build_object('start',void_time,'end',void_time,'cancelled',true,'finished',true,'paused',false,
      'managerTimeRevision',1,'managerTimeUpdatedAt',n,'voidedAt',n,'voidedBy','OWNER_REQUEST_ADMIN_TOOL',
      'voidedOriginalStart',item->'start','voidedOriginalEnd',item->'end',
      'closeReason','OWNER_CONFIRMED_MISTAKEN_WORK') else item end order by ord)
    from jsonb_array_elements(d->'sessions') with ordinality t(item,ord))
   ||jsonb_build_array(jsonb_build_object('id',s_id,'assignmentId',a_id,'job','12025','emp','EMP003',
      'start',st,'end',null,'paused',false,'rework',false,'manualStartCorrection',true,
      'createdAt',n,'managerCorrectionBy','OWNER_REQUEST_ADMIN_TOOL')));
 d:=jsonb_set(d,'{additionalActions}',coalesce(d->'additionalActions','[]'::jsonb)||jsonb_build_array(audit),true);
 d:=jsonb_set(d,'{reopenLogs}',coalesce(d->'reopenLogs','[]'::jsonb)||jsonb_build_array(
    jsonb_build_object('id',gen_random_uuid()::text,'assignmentId',a_id,'job','12025',
      'emp','EMP003','suggested',480,'by','OWNER_REQUEST_ADMIN_TOOL','at',n)),true);
 select jsonb_agg(case when employee_id='EMP003' then to_jsonb(l)||
   jsonb_build_object('status','Working','job_no','12025','assignment_id',a_id,
     'session_id',s_id,'session_start',st,'suggested_minutes',480,
     'vehicle','Chevrolet Traverse','registration','4948 BS','overtime',false)
   else to_jsonb(l) end order by employee_id) into lrows from public.workshop_live_status l;
 if lrows is null or not exists(select 1 from public.workshop_live_status where employee_id='EMP003')
  then raise exception 'Soman live status projection missing';end if;
 select public.zukait_commit_workshop_state_v2(r,d,'OWNER_REQUEST_JC12025_CORRECTION',lrows) into receipt;
 if receipt->>'ok'<>'true' then raise exception 'Workshop revision CAS rejected: %',receipt->>'code';end if;
 if (select count(*) from jsonb_array_elements(d->'sessions') s
   where s->>'emp'='EMP003' and s->>'end' is null and s->>'cancelled' is distinct from 'true')<>1
   then raise exception 'Multiple active sessions after correction';end if;
 if (select count(*) from jsonb_array_elements(d->'sessions') s where
   s->>'id' in ('4232100c-0eb2-420e-8810-c2dc55d7be87','ae2b7863-ea2c-4272-be2a-e58600490e3f')
   and s->>'cancelled'='true' and (s->>'start')::bigint=(s->>'end')::bigint)<>2
   then raise exception 'Mistaken entries not fully voided';end if;
end;
$jc12025$;