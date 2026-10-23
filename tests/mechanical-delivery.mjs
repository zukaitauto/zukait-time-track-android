// Invoked only against the disposable Mechanical persistence fixture.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {mechanicalDeliveryRequest} from '../supabase/functions/workshop-api/extensions/mechanical_delivery_plan.js';
import {mechanicalQcReadiness} from '../supabase/functions/workshop-api/extensions/mechanical_qc_boundary.js';
import {qcTransition,preserveQcAuthority} from '../supabase/functions/workshop-api/qc_delivery_rules.js';
export async function mechanicalDeliveryTests({db,records,snapshot,checklist,actor,sessionHash,policy,approve,planQcFail,native,pg,config,database}){
 await db.exec(fs.readFileSync('experiments/mechanical-delivery.sql','utf8'));
 const scalar=async sql=>(await db.query(sql)).rows[0].n;
 assert.equal(await scalar('select count(*)::int n from zukait_mechanical.settings where not delivery_enabled'),1);
 await db.exec("insert into staff_credentials(user_id,display_name,role,department,password_hash,password_salt,must_change) values('QA_DEL_MGR','Synthetic Manager','Manager','','none','none',false),('QA_DEL_REC','Synthetic Receptionist','Receptionist','','none','none',false)");
 await db.query('insert into staff_sessions(token_hash,user_id) values($1,$2),($3,$4)',['d'.repeat(64),'QA_DEL_MGR','e'.repeat(64),'QA_DEL_REC']);
 await db.exec("update zukait_mechanical.settings set capabilities=capabilities||'{\"SUP003\":[\"MECHANICAL_QC\",\"MECHANICAL_DELIVER\"],\"QA_DEL_MGR\":[\"MECHANICAL_DELIVER\"],\"QA_DEL_REC\":[\"MECHANICAL_DELIVER\"]}'::jsonb");
 policy={...policy,mechanicalDeliveryEnabled:true,mechanicalStaff:{...policy.mechanicalStaff,SUP003:['MECHANICAL_QC','MECHANICAL_DELIVER'],QA_DEL_MGR:['MECHANICAL_DELIVER'],QA_DEL_REC:['MECHANICAL_DELIVER']}};
 let state=await snapshot();let job=state.data.jobs.find(j=>j.no==='QA_JC_11');Object.assign(job,{jobType:'CASH',amount:123.456,finalInvoiceAmount:123.456,invoiceDate:'2026-10-20',financialAudit:[{operation:'QA_EXISTING_INVOICE',amount:123.456}],receptionNo:'QA_REC'});
 await db.query("update workshop_state set data=$1::jsonb,revision=revision+1 where id='main'",[JSON.stringify(state.data)]);
 await approve();
 async function latest(){const e=(await db.query('select * from zukait_mechanical.qc_events where checklist_id=$1 order by records_revision desc limit 1',[checklist])).rows[0];return e&&{requestId:e.request_id,by:e.actor_id,result:e.result,workFingerprint:e.work_fingerprint}}
 const context={actor,sessionCurrent:true,online:true};
 async function prepare(who=actor){const r=await records(),s=await snapshot(),approval=await latest(),status=await mechanicalQcReadiness(r,s,'QA_JC_11',policy,approval);const command={operation:'MECHANICAL_DELIVER',requestId:randomUUID(),entityId:checklist,actorId:who.id,deviceId:'QA_DEVICE',expectedRevision:r.revision,expectedWorkshopRevision:s.revision,payload:{expectedFingerprint:status.workToken}};return {r,s,approval,command,plan:await mechanicalDeliveryRequest(r,s,command,{...context,actor:who},policy,approval)}}
 const sql='select public.zukait_mechanical_deliver($1,$2::uuid,$3,$4,$5,$6::uuid,$7,$8::jsonb,$9) r';
 const values=p=>[p.p_actor,p.p_request,p.p_fingerprint,p.p_expected_records,p.p_expected_workshop,p.p_entity,p.p_device,JSON.stringify(p.p_plan),p.p_session_hash??sessionHash];
 async function call(p){await db.exec('set role service_role');try{return (await db.query(sql,values(p))).rows[0].r}finally{await db.exec('reset role')}}
 async function legacy(data,by=actor.id,overrideLive=null){const current=await snapshot(),live=overrideLive??(await db.query('select * from workshop_live_status')).rows;await db.exec('set role service_role');try{return (await db.query('select public.zukait_commit_workshop_state_v2($1,$2::jsonb,$3,$4::jsonb) r',[current.revision,JSON.stringify(data),by,JSON.stringify(live)])).rows[0].r}finally{await db.exec('reset role')}}
 let p=await prepare();assert.equal(p.plan.ok,true,'SUP003 approval alone enables Mechanical-only planner without fake legacy QC');assert.ok(Buffer.byteLength(JSON.stringify(p.plan.request))<1400);assert.equal('qcWorkflow' in p.plan.request.p_plan,false);
 assert.equal((await mechanicalDeliveryRequest(p.r,p.s,p.command,context,{...policy,mechanicalDeliveryEnabled:false},p.approval)).code,'mechanical_delivery_disabled');
 assert.equal((await mechanicalDeliveryRequest(p.r,p.s,p.command,{...context,online:false},policy,p.approval)).code,'mechanical_delivery_requires_online');
 assert.equal((await mechanicalDeliveryRequest(p.r,p.s,{...p.command,payload:{...p.command.payload,amount:0}},context,policy,p.approval)).code,'invalid_mechanical_delivery');
 assert.equal((await mechanicalDeliveryRequest(p.r,p.s,p.command,context,policy,{...p.approval,result:'FAIL'})).code,'mechanical_delivery_not_ready');
 assert.equal((await prepare({id:'QA_DEL_MGR',role:'Manager',active:true})).plan.code,'mechanical_forbidden');
 assert.equal((await prepare({id:'QA_DEL_REC',role:'Receptionist',active:true})).plan.ok,true,'Existing Receptionist eligibility retained for linked Reception job');
 const noReception=structuredClone(p.s);delete noReception.data.jobs.find(j=>j.no==='QA_JC_11').receptionNo;assert.equal((await mechanicalDeliveryRequest(p.r,noReception,{...p.command,actorId:'QA_DEL_REC'},{...context,actor:{id:'QA_DEL_REC',role:'Receptionist',active:true}},policy,p.approval)).code,'qc_permission_denied');
 const repeat=structuredClone(p.s);repeat.data.assign.push({id:'QA_REPEAT_PENDING',job:'QA_JC_11',emp:'QA_A',completed:false,rework:true});assert.equal((await mechanicalDeliveryRequest(p.r,repeat,p.command,context,policy,p.approval)).code,'mechanical_qc_work_changed');
 // Explicit candidate mixed policies only: neither represents owner approval.
 const mixed=structuredClone(p.s);mixed.data.assign.push({id:'QA_MIXED_PAINT',job:'QA_JC_11',emp:'QA_OTHER',completed:true,completedAt:Date.now()});
 const mixedPolicy={...policy,employeeDepartments:{QA_OTHER:'Painter'}};
 assert.equal((await mechanicalDeliveryRequest(p.r,mixed,p.command,context,mixedPolicy,p.approval)).code,'mechanical_mixed_qc_policy_required');
 const triple={...mixedPolicy,qc:{...policy.qc,mixedMechanicalRequired:true}};let ready=await mechanicalQcReadiness(p.r,mixed,'QA_JC_11',triple);
 const mixedApproval={...p.approval,workFingerprint:ready.workToken},mixedCommand={...p.command,payload:{expectedFingerprint:ready.workToken}};
 assert.equal((await mechanicalDeliveryRequest(p.r,mixed,mixedCommand,context,triple,mixedApproval)).code,'mechanical_delivery_not_ready');
 const painted=qcTransition(mixed.data,{id:'SUP002',role:'Supervisor'},{operation:'PAINTING_QC',jobCard:'QA_JC_11',expectedQcRevision:0,result:'PASS'},Date.now());
 const finalized=qcTransition(painted.data,{id:'SUP001',role:'Supervisor'},{operation:'FINAL_QC',jobCard:'QA_JC_11',expectedQcRevision:1,result:'PASS'},Date.now());assert.equal(finalized.ok,true);const finishedMixed={...mixed,data:finalized.data};
 assert.equal((await mechanicalDeliveryRequest(p.r,finishedMixed,mixedCommand,context,triple,mixedApproval)).ok,true,'Explicit three-approval candidate keeps legacy two checks');
 const retained={...mixedPolicy,qc:{...policy.qc,mixedMechanicalRequired:false}};ready=await mechanicalQcReadiness(p.r,finishedMixed,'QA_JC_11',retained);const retainedPlan=await mechanicalDeliveryRequest(p.r,finishedMixed,{...p.command,payload:{expectedFingerprint:ready.workToken}},context,retained);assert.equal(retainedPlan.ok,true);assert.equal(retainedPlan.request.p_plan.qcRequestId,null);
 const paint=qcTransition(p.s.data,{id:'SUP002',role:'Supervisor'},{operation:'PAINTING_QC',jobCard:'QA_JC_11',expectedQcRevision:0,result:'PASS'},Date.now());assert.equal(paint.ok,true);
 const final=qcTransition(paint.data,{id:'SUP001',role:'Supervisor'},{operation:'FINAL_QC',jobCard:'QA_JC_11',expectedQcRevision:1,result:'PASS'},Date.now());const bypass=qcTransition(final.data,{id:'SUP001',role:'Supervisor'},{operation:'DELIVER',jobCard:'QA_JC_11',expectedQcRevision:2},Date.now());assert.equal(bypass.ok,true);
 await assert.rejects(legacy(bypass.data),/mechanical_delivery_authority_conflict/,'Legacy painting/final delivery cannot bypass normalized Mechanical permit');
 await db.exec('update zukait_mechanical.settings set enabled=false,qc_enabled=false');await assert.rejects(legacy(bypass.data),/mechanical_delivery_authority_conflict/,'Flag disable never disables registered-job authority');await db.exec('update zukait_mechanical.settings set enabled=true,qc_enabled=true');
 await assert.rejects(call(p.plan.request),/mechanical_delivery_disabled/);await db.exec('update zukait_mechanical.settings set delivery_enabled=true');
 await db.exec('begin');try{const receptionist=(await prepare({id:'QA_DEL_REC',role:'Receptionist',active:true})).plan.request;const result=await call({...receptionist,p_session_hash:'e'.repeat(64)});assert.equal(result.ok,true);assert.equal((await snapshot()).data.jobs.find(j=>j.no==='QA_JC_11').deliveredBy,'QA_DEL_REC')}finally{await db.exec('rollback')}
 assert.equal(await scalar('select count(*)::int n from zukait_mechanical.deliveries'),0,'Receptionist test transaction leaves no fixture delivery');
 await assert.rejects(call({...p.plan.request,p_plan:{...p.plan.request.p_plan,amount:0}}),/invalid_mechanical_delivery/);
 await assert.rejects(call({...p.plan.request,p_plan:{...p.plan.request.p_plan,qcRequestId:randomUUID()}}),/mechanical_delivery_not_ready/);
 await assert.rejects(call({...p.plan.request,p_actor:'QA_DEL_MGR',p_session_hash:'d'.repeat(64)}),/mechanical_forbidden/);
 await assert.rejects(call({...p.plan.request,p_session_hash:'f'.repeat(64)}),/mechanical_invalid_session/);
 // A FAIL that lands after planning must win over the planned PASS.
 await approve('FAIL','QA later defect');await assert.rejects(call(p.plan.request),/mechanical_revision_conflict/);await assert.rejects(call({...p.plan.request,p_expected_records:(await records()).revision}),/mechanical_delivery_not_ready/);await approve();p=await prepare();
 // A work revision after planning must reject; no stale reviewed status writes.
 await db.exec("update workshop_state set revision=revision+1 where id='main'");await assert.rejects(call(p.plan.request),/workshop_revision_conflict/);p=await prepare();
 const before=await snapshot(),beforeRecords=(await records()).revision,history=await scalar('select count(*)::int n from workshop_state_history');
 await db.exec("create function qa_fail_delivery_state() returns trigger language plpgsql as $$begin if new.data->'jobs' @> '[{\"no\":\"QA_JC_11\",\"delivered\":true}]'::jsonb then raise exception 'QA_DELIVERY_ROLLBACK';end if;return new;end$$;create trigger qa_fail_delivery_state after update on workshop_state for each row execute function qa_fail_delivery_state()");
 await assert.rejects(call(p.plan.request),/QA_DELIVERY_ROLLBACK/);assert.equal(await scalar('select count(*)::int n from zukait_mechanical.deliveries'),0);assert.equal(await scalar('select count(*)::int n from workshop_state_history'),history);assert.equal((await records()).revision,beforeRecords);assert.equal(JSON.stringify(await snapshot()),JSON.stringify(before));await db.exec('drop trigger qa_fail_delivery_state on workshop_state');
 if(native){
  const clients=Array.from({length:5},()=>new pg.Client({...config,database})),[a,b,c,d,e]=clients;
  const other=(await prepare()).plan.request,q=await planQcFail(),live=(await db.query('select * from workshop_live_status')).rows;
  await Promise.all(clients.map(c=>c.connect()));await Promise.all(clients.map(c=>c.query('set role service_role')));
  const outcome=p=>p.then(r=>({row:r.rows[0].r}),error=>({error}));
  async function blocked(waiter){for(let i=0;i<100;i++){const pids=(await db.query('select pg_blocking_pids($1::int) pids',[waiter.processID])).rows[0].pids;if(pids.some(pid=>clients.some(c=>c.processID===pid)))return;await new Promise(r=>setTimeout(r,20))}assert.fail('Expected overlapping delivery lock')}
  try{
   await a.query('begin');await a.query(sql,values(p.plan.request));
   const duplicate=outcome(b.query(sql,values(p.plan.request))),distinct=outcome(c.query(sql,values(other)));
   const failure=outcome(d.query('select public.zukait_mechanical_qc_commit($1,$2::uuid,$3,$4,$5,$6::uuid,$7,$8::jsonb,$9) r',[q.p_actor,q.p_request,q.p_fingerprint,q.p_expected_records,q.p_expected_workshop,q.p_entity,q.p_device,JSON.stringify(q.p_plan),sessionHash]));
   const work=outcome(e.query('select public.zukait_commit_workshop_state_v2($1,$2::jsonb,$3,$4::jsonb) r',[before.revision,JSON.stringify(before.data),actor.id,JSON.stringify(live)]));
   await Promise.all([blocked(b),blocked(c),blocked(d),blocked(e)]);await a.query('commit');
   assert.equal((await duplicate).row.duplicate,true);assert.match((await distinct).error.message,/mechanical_revision_conflict/);assert.equal((await work).row.code,'conflict');
   assert.match((await failure).error.message,/mechanical_revision_conflict/);
  }finally{await Promise.all(clients.map(c=>c.query('rollback')));await Promise.all(clients.map(c=>c.end()))}
 }else await call(p.plan.request);
 assert.equal((await call(p.plan.request)).duplicate,true,'Lost acknowledgement replays receipt without a second delivery/history write');await assert.rejects(call({...p.plan.request,p_fingerprint:'0'.repeat(64)}),/mechanical_request_reused/);
 await db.query('update staff_sessions set revoked_at=now() where token_hash=$1',[sessionHash]);await assert.rejects(call(p.plan.request),/mechanical_invalid_session/);await db.query('update staff_sessions set revoked_at=null where token_hash=$1',[sessionHash]);
 const after=await snapshot(),delivered=after.data.jobs.find(j=>j.no==='QA_JC_11'),original=before.data.jobs.find(j=>j.no==='QA_JC_11');assert.equal(delivered.delivered,true);assert.equal(delivered.deliveredBy,'SUP003');assert.equal(delivered.qcPassed,true);assert.ok(delivered.deliveredAt>0);assert.deepEqual(delivered.mechanicalDelivery,{requestId:p.plan.request.p_request,checklistId:checklist});
 for(const section of Object.keys(before.data).filter(k=>k!=='jobs'))assert.deepEqual(after.data[section],before.data[section],'Preserve '+section);
 for(const field of Object.keys(original).filter(k=>!['status','qcWorkflow','qcPassed'].includes(k)))assert.deepEqual(delivered[field],original[field],'Preserve original job '+field);
 assert.equal(after.revision,before.revision+1);assert.equal((await records()).revision,beforeRecords+1);assert.equal(await scalar('select count(*)::int n from workshop_state_history'),history+1);assert.equal(await scalar('select count(*)::int n from zukait_mechanical.deliveries'),1);
 const linkedAssignment=after.data.assign.find(a=>a.job==='QA_JC_11');
 for(const live of [{employee_id:'QA_A',status:'Working',job_no:' qa_jc_11 '},{employee_id:'QA_A',status:'Paused',assignment_id:linkedAssignment.id}])await assert.rejects(legacy(after.data,actor.id,[live]),/mechanical_delivery_authority_conflict/,'Identical-state retry cannot overwrite live status for delivered work');
 const reopened=structuredClone(after.data);reopened.assign.find(a=>a.id===linkedAssignment.id).completed=false;await assert.rejects(legacy(reopened),/mechanical_delivery_authority_conflict/);
 const running=structuredClone(after.data);running.sessions.push({id:'QA_OLD_CLIENT_RUNNING',emp:'QA_A',job:'QA_JC_11',assignmentId:linkedAssignment.id,start:Date.now()});await assert.rejects(legacy(running),/mechanical_delivery_authority_conflict/);
 const forged=structuredClone(after.data);delete forged.jobs.find(j=>j.no==='QA_JC_11').mechanicalDelivery;forged.jobs.find(j=>j.no==='QA_JC_11').delivered=false;await assert.rejects(legacy(forged),/mechanical_delivery_authority_conflict/);
 const stale=structuredClone(forged);preserveQcAuthority(stale,after.data,{id:'QA_DEL_MGR',role:'Manager'});assert.deepEqual(stale.jobs.find(j=>j.no==='QA_JC_11').mechanicalDelivery,delivered.mechanicalDelivery);assert.equal(stale.jobs.find(j=>j.no==='QA_JC_11').qcPassed,true);assert.equal((await legacy(stale)).ok,true,'Protected server full-save reconciliation remains usable');
 const correctedTime=structuredClone((await snapshot()).data);correctedTime.sessions.find(s=>s.id==='QA_QC_PRIVATE_PERIOD').end-=1000;assert.equal((await legacy(correctedTime)).ok,true,'Closed historical time corrections retain the delivered record');
 // Keep existing audited Manager delivery-date correction available.
 const current=await snapshot(),correction=qcTransition(current.data,{id:'QA_DEL_MGR',role:'Manager'},{operation:'DELIVERY_DATE_CORRECTION',jobCard:'QA_JC_11',expectedQcRevision:delivered.qcWorkflow.revision,deliveredAt:delivered.deliveredAt-60000,reason:'Synthetic date correction'},Date.now());assert.equal(correction.ok,true);assert.equal((await legacy(correction.data,'QA_DEL_MGR')).ok,true);
 const tampered=structuredClone((await snapshot()).data);tampered.jobs.find(j=>j.no==='QA_JC_11').deliveredAt-=1000;await assert.rejects(legacy(tampered),/mechanical_delivery_authority_conflict/);
 await db.exec('update zukait_mechanical.settings set enabled=false,qc_enabled=false,delivery_enabled=false');await assert.rejects(legacy(forged),/mechanical_delivery_authority_conflict/);await db.exec('update zukait_mechanical.settings set enabled=true,qc_enabled=true,delivery_enabled=true');
 for(const mutation of ['update zukait_mechanical.deliveries set projection=projection','delete from zukait_mechanical.deliveries','truncate zukait_mechanical.deliveries'])await assert.rejects(db.exec(mutation),/mechanical_append_only/);
 for(const role of ['anon','authenticated']){assert.equal(await scalar(`select has_function_privilege('${role}','public.zukait_mechanical_deliver(text,uuid,text,bigint,bigint,uuid,text,jsonb,text)','execute')::int n`),0);assert.equal(await scalar(`select has_table_privilege('${role}','zukait_mechanical.deliveries','SELECT')::int n`),0)}
 assert.equal(await scalar("select prosecdef::int n from pg_proc where oid='public.zukait_mechanical_deliver(text,uuid,text,bigint,bigint,uuid,text,jsonb,text)'::regprocedure"),0);
 assert.equal(await scalar("select relrowsecurity::int n from pg_class where oid='zukait_mechanical.deliveries'::regclass"),1);
 for(const action of ['UPDATE','DELETE','TRUNCATE'])assert.equal(await scalar(`select has_table_privilege('service_role','zukait_mechanical.deliveries','${action}')::int n`),0);
 console.log('PASS unrouted delivery backend: SUP003-only QC evidence, legacy/full-save bypass denial even with flags off, dual revisions/latest FAIL, atomic history/receipt/permit/audit rollback, safe retry'+(native?', overlapping requests':'')+', preserved labour/money and audited Manager date correction. No activation.');
}
