// Disposable fixture only, invoked by the existing persistence suite.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {mechanicalRoute} from '../supabase/functions/workshop-api/extensions/mechanical_route.js';
export async function mechanicalTrackingPersistence({db,records,snapshot,native,pg,config,database}){
 await db.exec(fs.readFileSync('experiments/mechanical-tracking.sql','utf8'));
 const actor={id:'QA_SUP',role:'Supervisor',active:true},sessionHash='a'.repeat(64),entity=(await records()).checklists.find(c=>c.manualJobCard.number==='QA_JC_0').id;
 const scalar=async sql=>(await db.query(sql)).rows[0].n,baseline=JSON.stringify(await snapshot()),history=await scalar('select count(*)::int n from workshop_state_history');
 assert.equal(await scalar('select count(*)::int n from zukait_mechanical.settings where not tracking_enabled and hold_mode is null and priority_values=\'[]\''),1);
 await db.exec("update zukait_mechanical.settings set tracking_enabled=true,priority_values='[\"NORMAL\",\"URGENT\"]',capabilities=capabilities||'{\"QA_SUP\":[\"PRIORITY_SET\",\"PROMISE_SET\",\"HOLD_SET\"]}'");
 const sql='select public.zukait_mechanical_tracking_commit($1,$2,$3,$4::uuid,$5,$6::uuid,$7,$8,$9,$10::jsonb) r',values=p=>[p.p_actor,p.p_session_hash,p.p_operation,p.p_request,p.p_fingerprint,p.p_entity,p.p_device,p.p_expected_records,p.p_expected_workshop,JSON.stringify(p.p_payload)];
 const admin={rpc:async(name,p)=>{await db.exec('set role service_role');try{const result=name==='zukait_mechanical_tracking_read'?await db.query('select public.zukait_mechanical_tracking_read($1,$2,$3,$4,$5::uuid,$6::uuid) r',[p.p_actor,p.p_session_hash,p.p_kind,p.p_operation,p.p_entity,p.p_request]):await db.query(sql,values(p));return {data:result.rows[0].r}}catch(error){return {error}}finally{await db.exec('reset role')}}};
 const route=(body,extra={})=>mechanicalRoute(admin,actor,body,{enabled:true,trackingEnabled:true,sessionHash,verifySession:async()=>actor,...extra});
 const view=async()=>(await route({action:'mechanical_tracking_view',checklistId:entity})).body;
 const command=async(operation,payload)=>{const s=await view();return {operation,entityId:entity,requestId:randomUUID(),deviceId:'QA',expectedRevision:s.recordsRevision,expectedWorkshopRevision:s.workshopRevision,payload}};
 const send=c=>route({action:'mechanical_tracking_command',command:c});
 assert.equal((await route({action:'mechanical_tracking_view',checklistId:entity},{trackingEnabled:false})).status,403);
 const publicView=await view();assert.ok(Buffer.byteLength(JSON.stringify(publicView))<1500);for(const privateField of ['sessions','expenses','fingerprint','token_hash','password','financialAudit'])assert.equal(JSON.stringify(publicView).includes(privateField),false);
 let c=await command('PRIORITY_SET',{priority:'URGENT',reason:'Confirmed booking'});const initialRevision=(await records()).revision;
 let result=await send(c);assert.equal(result.status,200,JSON.stringify(result));assert.equal((await view()).tracking.priority,'URGENT');assert.equal((await records()).revision,initialRevision+1);
 assert.equal((await send(c)).body.duplicate,true);assert.equal((await send(await command('PRIORITY_SET',{priority:'URGENT',reason:'Same value'}))).body.code,'tracking_no_change');assert.equal((await records()).revision,initialRevision+1);assert.equal((await send({...c,payload:{...c.payload,reason:'Altered'}})).status,409);
 assert.equal((await send(await command('HOLD_SET',{waiting:true,reason:'Parts pending'}))).body.code,'tracking_hold_policy_required');
 await db.exec("update zukait_mechanical.settings set hold_mode='STATUS_ONLY'");for(const waiting of [true,false]){result=await send(await command('HOLD_SET',{waiting,reason:waiting?'Parts pending':'Parts received'}));assert.equal(result.status,200,JSON.stringify(result));assert.equal((await view()).tracking.waitingForParts,waiting)}
 for(const date of ['2026-10-24',null])assert.equal((await send(await command('PROMISE_SET',{date,reason:'Schedule reviewed'}))).status,200);
 assert.equal((await send(await command('PROMISE_SET',{date:'2026-02-30',reason:'QA'}))).body.code,'invalid_promise_date');
 assert.equal((await send(await command('PRIORITY_SET',{priority:'UNKNOWN',reason:'QA'}))).body.code,'tracking_priority_policy_required');
 assert.equal((await send({...await command('PRIORITY_SET',{priority:'NORMAL',reason:'QA'}),expectedWorkshopRevision:0})).body.code,'workshop_revision_conflict');
 await db.query('update staff_sessions set revoked_at=now() where token_hash=$1',[sessionHash]);assert.equal((await send(c)).status,401);await db.query('update staff_sessions set revoked_at=null where token_hash=$1',[sessionHash]);
 // Force a failure after row/receipt inserts: all metadata/audit/revision effects roll back.
 const before=JSON.stringify(await view()),beforeRecords=(await records()).revision;
 await db.exec("create function qa_tracking_fail() returns trigger language plpgsql as $$begin if new.operation='PRIORITY_SET' then raise exception 'QA_TRACKING_ROLLBACK';end if;return new;end$$;create trigger qa_tracking_fail after insert on zukait_mechanical.audit for each row execute function qa_tracking_fail()");
 assert.equal((await send(await command('PRIORITY_SET',{priority:'NORMAL',reason:'QA'}))).status,503);assert.equal(JSON.stringify(await view()),before);assert.equal((await records()).revision,beforeRecords);await db.exec('drop trigger qa_tracking_fail on zukait_mechanical.audit');
 if(native){
  const a=new pg.Client({...config,database}),b=new pg.Client({...config,database});await Promise.all([a.connect(),b.connect()]);await Promise.all([a.query('set role service_role'),b.query('set role service_role')]);
  const cmd=await command('PRIORITY_SET',{priority:'NORMAL',reason:'QA concurrency'});let captured;const capturing={rpc:async(name,p)=>{if(name.endsWith('_commit')){captured=p;return {data:{ok:true,requestId:p.p_request}}}return admin.rpc(name,p)}};
  assert.equal((await mechanicalRoute(capturing,actor,{action:'mechanical_tracking_command',command:cmd},{enabled:true,trackingEnabled:true,sessionHash,verifySession:async()=>actor})).status,200);
  try{await a.query('begin');await a.query(sql,values(captured));const pending=b.query(sql,values(captured)).then(r=>r.rows[0].r);let blocked=false;for(let i=0;i<100;i++){if((await db.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[b.processID,a.processID])).rows[0].blocked){blocked=true;break}await new Promise(r=>setTimeout(r,20))}assert.ok(blocked);await a.query('commit');assert.equal((await pending).duplicate,true)}finally{await Promise.all([a.query('rollback'),b.query('rollback')]);await Promise.all([a.end(),b.end()])}
 }
 assert.equal(JSON.stringify(await snapshot()),baseline,'Metadata leaves all workshop work/QC/timers/money unchanged');assert.equal(await scalar('select count(*)::int n from workshop_state_history'),history,'No full-state history insert');
 for(const role of ['anon','authenticated']){for(const fn of ['public.zukait_mechanical_tracking_read(text,text,text,text,uuid,uuid)','public.zukait_mechanical_tracking_commit(text,text,text,uuid,text,uuid,text,bigint,bigint,jsonb)'])assert.equal(await scalar(`select has_function_privilege('${role}','${fn}','execute')::int n`),0);assert.equal(await scalar(`select has_table_privilege('${role}','zukait_mechanical.tracking','SELECT')::int n`),0)}
 for(const signature of ['public.zukait_mechanical_tracking_read(text,text,text,text,uuid,uuid)','public.zukait_mechanical_tracking_commit(text,text,text,uuid,text,uuid,text,bigint,bigint,jsonb)'])assert.equal(await scalar(`select prosecdef::int n from pg_proc where oid='${signature}'::regprocedure`),0);
 assert.equal(await scalar("select relrowsecurity::int n from pg_class where oid='zukait_mechanical.tracking'::regclass"),1);
 console.log('PASS tracking persistence: private session-bound actual route/SQL, priorities/promise dates/manual hold gating, exact retries, dual CAS, rollback, '+(native?'native overlapping duplicate, ':'')+'no shared-state/history/work/QC/financial changes. Synthetic policy only.');
}
