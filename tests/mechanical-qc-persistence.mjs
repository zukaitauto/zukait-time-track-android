// Invoked by mechanical-persistence.mjs against its disposable database only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {mechanicalQcCommandApi,mechanicalQcReadiness} from '../supabase/functions/workshop-api/extensions/mechanical_qc_boundary.js';
import {MECHANICAL_QC_OWNER_DECISIONS as qc} from '../supabase/functions/workshop-api/extensions/mechanical_qc_rules.js';
import {mechanicalRoute} from '../supabase/functions/workshop-api/extensions/mechanical_route.js';
export async function mechanicalQcPersistenceTests({db,records,snapshot,native,pg,config,database}){
 await db.exec(fs.readFileSync('experiments/mechanical-qc-persistence.sql','utf8'));
 await db.exec(fs.readFileSync('experiments/mechanical-qc-readers.sql','utf8'));
 const scalar=async sql=>(await db.query(sql)).rows[0].n;
 assert.equal(await scalar('select count(*)::int n from zukait_mechanical.settings where not qc_enabled and mixed_mechanical_qc_required is null'),1);
 const sessionHash='c'.repeat(64),actor={id:'SUP003',role:'Supervisor',active:true};
 await db.exec("insert into staff_credentials(user_id,display_name,role,department,password_hash,password_salt,must_change) values('SUP003','SYNTHETIC QC','Supervisor','QA_MECHANICAL','none','none',true)");
 await db.query('insert into staff_sessions(token_hash,user_id) values($1,$2)',[sessionHash,actor.id]);
 await db.exec("update zukait_mechanical.settings set capabilities=capabilities||'{\"SUP003\":[\"MECHANICAL_QC\"]}'::jsonb");
 const policy={flags:{mechanical:true},mechanicalDepartment:'QA_MECHANICAL',mechanicalStaff:{SUP003:['MECHANICAL_QC']},qc};
 const checklist=randomUUID(),task=randomUUID(),assignment=randomUUID();
 await db.query("insert into zukait_mechanical.checklists(id,number,sequence_no,job_card,manual_jc_date,created_by) values($1,'QA_MC_QC',99999,'QA_JC_11','2026-10-22','SUP003')",[checklist]);
 await db.query('insert into zukait_mechanical.tasks(id,checklist_id,title,created_by) values($1,$2,$3,$4)',[task,checklist,'Synthetic QC inspection',actor.id]);
 await db.query('insert into zukait_mechanical.links(assignment_id,task_id,employee_id,created_by) values($1,$2,$3,$4)',[assignment,task,'QA_A',actor.id]);
 const at=Date.parse('2026-10-23T08:00:00Z'),s=await snapshot();
 s.data.assign.push({id:assignment,job:'QA_JC_11',emp:'QA_A',completed:true,completedAt:at,mechanicalTaskId:task,mechanicalChecklistId:checklist});
 s.data.sessions.push({id:'QA_QC_PRIVATE_PERIOD',assignmentId:assignment,emp:'QA_A',job:'QA_JC_11',start:at-60000,end:at});
 await db.query("update workshop_state set data=$1::jsonb,revision=revision+1 where id='main'",[JSON.stringify(s.data)]);
 const sql='select public.zukait_mechanical_qc_commit($1,$2::uuid,$3,$4,$5,$6::uuid,$7,$8::jsonb,$9) r';
 const values=p=>[p.p_actor,p.p_request,p.p_fingerprint,p.p_expected_records,p.p_expected_workshop,p.p_entity,p.p_device,JSON.stringify(p.p_plan),p.p_session_hash??sessionHash];
 async function commit(plan){await db.exec('set role service_role');try{return (await db.query(sql,values(plan))).rows[0].r}finally{await db.exec('reset role')}}
 const server={enabled:true,qcEnabled:true,actor,policy,now:()=>at,verifySession:async()=>actor,
  readReceipt:async id=>{const r=(await db.query('select actor_id,fingerprint,result from zukait_mechanical.receipts where request_id=$1',[id])).rows[0];return r&&{actorId:r.actor_id,fingerprint:r.fingerprint,result:r.result}},
  readContext:async()=>({records:await records(),snapshot:await snapshot()}),commit};
 async function command(result='PASS',reason='Inspected'){
  const ready=await mechanicalQcReadiness(await records(),await snapshot(),'QA_JC_11',policy);
  assert.equal(ready.ok,true);assert.match(ready.workToken,/^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(ready).includes('QA_QC_PRIVATE_PERIOD'));
  return {operation:'MECHANICAL_QC',requestId:randomUUID(),entityId:checklist,deviceId:'QA_DEVICE',expectedRevision:ready.recordsRevision,expectedWorkshopRevision:ready.workshopRevision,payload:{result,reason,expectedFingerprint:ready.workToken}};
 }
 const first=await command();let calls=0;
 assert.equal((await mechanicalQcCommandApi(first,{...server,qcEnabled:false,readContext:async()=>{calls++}})).body.code,'extension_disabled');assert.equal(calls,0);
 assert.equal((await mechanicalQcCommandApi({...first,actorId:'SUP003'},server)).body.code,'invalid_command');
 assert.equal((await mechanicalQcCommandApi({...first,payload:{...first.payload,expectedFingerprint:'RAW_SESSION_ARRAY'}},server)).body.code,'invalid_mechanical_qc');
 await assert.rejects(mechanicalQcCommandApi(first,server),/mechanical_qc_disabled/);
 await db.exec('update zukait_mechanical.settings set qc_enabled=true');
 async function read(kind,entity=checklist,request=null){await db.exec('set role service_role');try{return (await db.query('select public.zukait_mechanical_qc_read($1,$2,$3,$4::uuid,$5::uuid) r',[actor.id,sessionHash,kind,entity,request])).rows[0].r}finally{await db.exec('reset role')}}
 const admin={rpc:async(name,p)=>{try{
  if(name==='zukait_mechanical_qc_read')return {data:await read(p.p_kind,p.p_entity,p.p_request)};
  assert.equal(name,'zukait_mechanical_qc_commit');return {data:await commit(p)};
 }catch(error){return {error}}}};
 const route=(body,options={})=>mechanicalRoute(admin,actor,body,{enabled:true,qcEnabled:true,sessionHash,verifySession:async()=>actor,...options});
 const body={action:'mechanical_qc_readiness',checklistId:checklist};
 assert.equal((await route(body,{qcEnabled:false})).body.code,'extension_disabled');
 assert.equal((await route({...body,approval:{result:'PASS'}})).status,400);
 const scoped=await read('context');assert.equal(scoped.snapshot.data.assign.length,1);assert.equal(scoped.snapshot.data.sessions.length,1);assert.equal(scoped.snapshot.data.jobs.length,1);assert.equal(scoped.snapshot.data.users.length,1);assert.equal(scoped.records.tasks.length,1);assert.equal(scoped.records.links.length,1);
 assert.ok(Buffer.byteLength(JSON.stringify(scoped))<10000,'Unrelated current history must not cross the QC adapter');
 await db.exec('set role service_role');try{const dashboard=(await db.query('select public.zukait_mechanical_dashboard($1,$2,0,$3::uuid) r',[actor.id,sessionHash,checklist])).rows[0].r;assert.deepEqual(dashboard.capabilities,['MECHANICAL_QC']);assert.equal(dashboard.qcAvailable,true)}finally{await db.exec('reset role')}
 assert.equal(scoped.snapshot.data.users[0].department,'QA_MECHANICAL');assert.ok(!JSON.stringify(scoped).includes('expenses'));assert.ok(!JSON.stringify(scoped).includes('password_hash'));assert.equal(scoped.policy.qc.mixedMechanicalRequired,null);
 const publicReady=await route(body);assert.equal(publicReady.status,200);assert.equal(publicReady.body.status.mechanicalPassed,false);assert.equal(publicReady.body.status.workToken,first.payload.expectedFingerprint);assert.ok(!JSON.stringify(publicReady).includes('QA_QC_PRIVATE_PERIOD'));assert.equal('snapshot' in publicReady.body,false);
 const stateBefore=JSON.stringify(await snapshot()),historyBefore=await scalar('select count(*)::int n from workshop_state_history');
 let savedPlan;
 await assert.rejects(mechanicalQcCommandApi(first,{...server,commit:async p=>{savedPlan=p;await commit(p);throw new Error('QA_LOST_QC_ACK')}}),/QA_LOST_QC_ACK/);
 assert.ok(Buffer.byteLength(JSON.stringify(savedPlan))<1200);assert.ok(!JSON.stringify(savedPlan).includes('QA_QC_PRIVATE_PERIOD'));assert.equal(savedPlan.p_plan.workFingerprint,first.payload.expectedFingerprint);
 const retry=await mechanicalQcCommandApi(first,{...server,readContext:async()=>assert.fail('Receipt retry must not scan current work'),commit:async()=>assert.fail('Receipt retry must not write')});
 assert.deepEqual(retry.body,{ok:true,duplicate:true,requestId:first.requestId,requiresReadinessRefresh:true});assert.equal((await commit(savedPlan)).duplicate,true);
 assert.equal(JSON.stringify(await snapshot()),stateBefore,'Approval cannot rewrite workshop, time, delivery or money');assert.equal(await scalar('select count(*)::int n from workshop_state_history'),historyBefore);
 async function latest(){const r=(await db.query('select * from zukait_mechanical.qc_events where checklist_id=$1 order by records_revision desc limit 1',[checklist])).rows[0];return r&&{by:r.actor_id,result:r.result,workFingerprint:r.work_fingerprint}}
 assert.equal((await mechanicalQcReadiness(await records(),await snapshot(),'QA_JC_11',policy,await latest())).deliveryReady,true);
 assert.equal((await mechanicalQcCommandApi({...first,payload:{...first.payload,reason:'Different'}},server)).body.code,'mechanical_request_reused');
 await db.exec("update staff_credentials set role='Manager' where user_id='SUP003'");await assert.rejects(commit(savedPlan),/mechanical_qc_approver_required/);await db.exec("update staff_credentials set role='Supervisor' where user_id='SUP003'");
 const freshPlan={...savedPlan,p_request:randomUUID(),p_expected_records:(await records()).revision};
 await assert.rejects(commit({...freshPlan,p_expected_records:freshPlan.p_expected_records-1}),/mechanical_revision_conflict/);
 await assert.rejects(commit({...freshPlan,p_plan:{...freshPlan.p_plan,route:'MIXED'}}),/mechanical_mixed_qc_policy_required/);
 await db.exec('update zukait_mechanical.settings set mixed_mechanical_qc_required=false');await assert.rejects(commit({...freshPlan,p_plan:{...freshPlan.p_plan,route:'MIXED'}}),/mechanical_mixed_qc_not_required/);await db.exec('update zukait_mechanical.settings set mixed_mechanical_qc_required=null');
 await assert.rejects(commit({...freshPlan,p_plan:{...freshPlan.p_plan,sessions:[]}}),/invalid_mechanical_qc_plan/);
 await assert.rejects(commit({...freshPlan,p_plan:{...freshPlan.p_plan,workFingerprint:'raw work'}}),/invalid_mechanical_qc_plan/);
 assert.equal((await mechanicalQcCommandApi({...first,requestId:randomUUID()},server)).body.code,'mechanical_revision_conflict');
 let next=await command();await db.exec("update workshop_state set revision=revision+1 where id='main'");
 assert.equal((await mechanicalQcCommandApi(next,server)).body.code,'workshop_revision_conflict');
 await assert.rejects(commit({...savedPlan,p_request:randomUUID(),p_expected_records:(await records()).revision}),/workshop_revision_conflict/);
 const failure=await command('FAIL','Brake noise');assert.equal((await mechanicalQcCommandApi(failure,server)).status,200);
 assert.equal((await mechanicalQcReadiness(await records(),await snapshot(),'QA_JC_11',policy,await latest())).deliveryReady,false,'Latest FAIL supersedes older PASS');
 assert.equal((await route(body)).body.status.mechanicalPassed,false,'Reader chooses latest FAIL rather than older PASS');
 const routed=await command();let r=await route({action:'mechanical_command',command:routed});assert.equal(r.status,200);assert.equal(r.body.requiresReadinessRefresh,true);r=await route({action:'mechanical_command',command:routed});assert.equal(r.body.duplicate,true);assert.equal((await route(body)).body.status.mechanicalPassed,true);
 assert.equal(JSON.stringify(await snapshot()),JSON.stringify({...JSON.parse(stateBefore),revision:(await snapshot()).revision}),'QC route leaves all business data unchanged');
 next=await command();let checks=0;assert.equal((await mechanicalQcCommandApi(next,{...server,verifySession:async()=>++checks===1?actor:null})).body.code,'session_changed');
 await db.query('update staff_sessions set revoked_at=now() where token_hash=$1',[sessionHash]);await assert.rejects(commit(savedPlan),/mechanical_invalid_session/);assert.equal((await route(body)).status,401);await db.query('update staff_sessions set revoked_at=null where token_hash=$1',[sessionHash]);
 const beforeRollback=await scalar('select count(*)::int n from zukait_mechanical.qc_events'),revisionBefore=(await records()).revision;
 await db.exec("create function qa_fail_qc_audit() returns trigger language plpgsql as $$begin if new.operation='MECHANICAL_QC' then raise exception 'QA_QC_ROLLBACK';end if;return new;end$$;create trigger qa_fail_qc_audit after insert on zukait_mechanical.audit for each row execute function qa_fail_qc_audit()");
 await assert.rejects(mechanicalQcCommandApi(next,server),/QA_QC_ROLLBACK/);assert.equal(await scalar('select count(*)::int n from zukait_mechanical.qc_events'),beforeRollback);assert.equal((await records()).revision,revisionBefore);assert.equal(await server.readReceipt(next.requestId),undefined);
 await db.exec('drop trigger qa_fail_qc_audit on zukait_mechanical.audit');
 for(const mutation of ['update zukait_mechanical.qc_events set reason=reason','delete from zukait_mechanical.qc_events','truncate zukait_mechanical.qc_events'])await assert.rejects(db.exec(mutation),/mechanical_append_only/);
 for(const role of ['anon','authenticated']){
  assert.equal(await scalar(`select has_function_privilege('${role}','public.zukait_mechanical_qc_commit(text,uuid,text,bigint,bigint,uuid,text,jsonb,text)','execute')::int n`),0);
  assert.equal(await scalar(`select has_function_privilege('${role}','public.zukait_mechanical_qc_read(text,text,text,uuid,uuid)','execute')::int n`),0);
  assert.equal(await scalar(`select has_table_privilege('${role}','zukait_mechanical.qc_events','SELECT')::int n`),0);
 }
 assert.equal(await scalar("select relrowsecurity::int n from pg_class where oid='zukait_mechanical.qc_events'::regclass"),1);
 for(const action of ['UPDATE','DELETE','TRUNCATE'])assert.equal(await scalar(`select has_table_privilege('service_role','zukait_mechanical.qc_events','${action}')::int n`),0);
 assert.equal(await scalar("select prosecdef::int n from pg_proc where oid='public.zukait_mechanical_qc_commit(text,uuid,text,bigint,bigint,uuid,text,jsonb,text)'::regprocedure"),0);
 // A work change invalidates the opaque token even when all work remains finished.
 const oldToken=(await command()).payload.expectedFingerprint;const modified=await snapshot();modified.data.sessions.find(x=>x.id==='QA_QC_PRIVATE_PERIOD').end-=1000;
 await db.query("update workshop_state set data=$1::jsonb,revision=revision+1 where id='main'",[JSON.stringify(modified.data)]);
 assert.equal((await route(body)).body.status.mechanicalPassed,false,'Trusted reader re-evaluates work after a previously valid approval');
 assert.equal((await mechanicalQcCommandApi({...await command(),payload:{result:'PASS',reason:'Inspected',expectedFingerprint:oldToken}},server)).body.code,'mechanical_qc_work_changed');
 if(native){
  const a=new pg.Client({...config,database}),b=new pg.Client({...config,database});await Promise.all([a.connect(),b.connect()]);await Promise.all([a.query('set role service_role'),b.query('set role service_role')]);
  async function prepare(){let p;await mechanicalQcCommandApi(await command(),{...server,commit:async plan=>{p=plan;return {ok:true,requestId:plan.p_request}}});return p;}
  async function race(p,q,duplicate){await a.query('begin');await b.query('begin');try{
   await a.query(sql,values(p));const waiting=b.query(sql,values(q)).then(r=>({row:r.rows[0].r}),error=>({error}));let blocked=false;
   for(let i=0;i<100;i++){if((await db.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[b.processID,a.processID])).rows[0].blocked){blocked=true;break}await new Promise(r=>setTimeout(r,20))}
   assert.ok(blocked,'QC writers must serialize');await a.query('commit');const r=await waiting;
   if(duplicate){assert.equal(r.row.duplicate,true);await b.query('commit')}else{assert.match(r.error.message,/mechanical_revision_conflict/);await b.query('rollback')}
  }finally{await a.query('rollback');await b.query('rollback')}}
  async function waitBlocked(waiter,holder){for(let i=0;i<100;i++){if((await db.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[waiter.processID,holder.processID])).rows[0].blocked)return;await new Promise(r=>setTimeout(r,20))}assert.fail('Expected QC session lock contention')}
  try{
   const p=await prepare();await race(p,p,true);await race(await prepare(),await prepare(),false);
   await a.query('begin');await a.query(sql,values(savedPlan));const revocation=b.query('update staff_sessions set revoked_at=now() where token_hash=$1',[sessionHash]);await waitBlocked(b,a);await a.query('commit');await revocation;await assert.rejects(commit(savedPlan),/mechanical_invalid_session/);await db.query('update staff_sessions set revoked_at=null where token_hash=$1',[sessionHash]);
   await b.query('begin');await b.query('update staff_sessions set revoked_at=now() where token_hash=$1',[sessionHash]);const waiting=a.query(sql,values(savedPlan)).then(()=>({ok:true}),error=>({error}));await waitBlocked(a,b);await b.query('commit');assert.match((await waiting).error.message,/mechanical_invalid_session/);await db.query('update staff_sessions set revoked_at=null where token_hash=$1',[sessionHash]);
  }finally{await Promise.all([a.query('rollback'),b.query('rollback')]);await Promise.all([a.end(),b.end()])}
 }
 console.log('PASS draft QC: scoped trusted reader/latest FAIL, SUP003-only dashboard/route, opaque readiness and session gates, atomic receipt/event/audit/revision, lost acknowledgement, invalidation, rollback, private invoker ACLs and append-only protection'+(native?', concurrent same/distinct requests':'')+'. Undeployed; delivery integration remains blocked.');
}
