import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {mechanicalTransition,mechanicalCommandFingerprint} from '../supabase/functions/workshop-api/extensions/mechanical_rules.js';
import {mechanicalPersistenceRequest} from '../supabase/functions/workshop-api/extensions/mechanical_persistence_plan.js';
import {mechanicalCommandApi} from '../supabase/functions/workshop-api/extensions/mechanical_api.js';
import {mechanicalRoute} from '../supabase/functions/workshop-api/extensions/mechanical_route.js';
import {mechanicalQcPersistenceTests} from './mechanical-qc-persistence.mjs';
import {stripTypeScriptTypes} from 'node:module';
import {qcWork,qcStatus,qcTransition} from '../supabase/functions/workshop-api/qc_delivery_rules.js';
import {managerTimeTransition} from '../supabase/functions/workshop-api/time_management_rules.js';
const apiSource=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const employeeTransition=new Function('cloneValue','crypto',stripTypeScriptTypes(apiSource.slice(apiSource.indexOf('function employeeTimeTransition('),apiSource.indexOf('// ID001_ASSIGNMENT_RULE_BEGIN')))+';return employeeTimeTransition;')(structuredClone,globalThis.crypto);
import {allocationToken,employeeTimeToken,workedMinutes} from '../supabase/functions/workshop-api/time_management_rules.js';
const native=process.env.ZUKAIT_MECHANICAL_NATIVE==='1';let db,client,admin,config,database,pg;
if(native){
 ({default:pg}=await import('pg'));const host=process.env.PGHOST||'127.0.0.1';assert.ok(['127.0.0.1','localhost','::1'].includes(host),'Loopback fixture only');
 config={host,port:Number(process.env.PGPORT||5432),user:'postgres',password:process.env.PGPASSWORD||'mechanical-test-only'};database='zukait_mechanical_qa_'+randomUUID().replaceAll('-','');
 admin=new pg.Client({...config,database:'postgres'});await admin.connect();await admin.query('create database "'+database+'"');client=new pg.Client({...config,database});await client.connect();db={exec:s=>client.query(s),query:(...args)=>client.query(...args)};
 assert.ok(Number((await db.query('show server_version_num')).rows[0].server_version_num)>=170000&&Number((await db.query('show server_version_num')).rows[0].server_version_num)<180000);
 for(const role of ['anon','authenticated','service_role'])if(!(await db.query('select 1 from pg_roles where rolname=$1',[role])).rows.length)await db.exec('create role '+role+' nologin'+(role==='service_role'?' bypassrls':''));
}else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
const sessionHash='a'.repeat(64); // Synthetic hash only, never a production token.
const rpcSql='select public.zukait_mechanical_commit($1,$2::uuid,$3,$4,$5,$6,$7::uuid,$8,$9::jsonb,$10) r';
const values=p=>[p.p_actor,p.p_request,p.p_fingerprint,p.p_expected_records,p.p_expected_workshop,p.p_operation,p.p_entity,p.p_device,JSON.stringify(p.p_plan),Object.hasOwn(p,'p_session_hash')?p.p_session_hash:sessionHash];
const call=p=>db.query(rpcSql,values(p)).then(r=>r.rows[0].r);
const scalar=async sql=>(await db.query(sql)).rows[0].n;
let at=Date.parse('2026-10-19T04:00:00Z');
try{
 let base=fs.readFileSync('tests/fixtures/reception-postgres17-baseline.sql','utf8');base=native?base.replace(/create role (anon|authenticated|service_role)[^;]+;/g,''):base.replace('create extension if not exists pgcrypto;','');await db.exec(base);
 for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec(fs.readFileSync('tests/fixtures/workshop-save-live-functions.sql','utf8'));await db.exec(fs.readFileSync('experiments/live-status-session-partition.sql','utf8'));
 await db.exec("insert into staff_credentials(user_id,display_name,role,department,password_hash,password_salt,must_change) values('QA_SUP','QA supervisor','Supervisor','QA_MECHANICAL','none','none',false),('QA_A','QA mechanic A','Employee','QA_MECHANICAL','none','none',false),('QA_B','QA mechanic B','Employee','QA_MECHANICAL','none','none',false),('QA_OTHER','Other','Employee','OTHER','none','none',false)");
 // Minimal schema-only session fixture, matched to read-only live metadata.
 await db.exec('create table public.staff_sessions(token_hash text primary key,user_id text not null references public.staff_credentials(user_id),created_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),revoked_at timestamptz);alter table public.staff_sessions enable row level security;grant all on public.staff_sessions to service_role');
 await db.query('insert into staff_sessions(token_hash,user_id) values($1,$2),($3,$4)',[sessionHash,'QA_SUP','b'.repeat(64),'QA_A']);
 const initial={users:[{id:'QA_A',role:'Employee',department:'QA_MECHANICAL'},{id:'QA_B',role:'Employee',department:'QA_MECHANICAL'}],jobs:Array.from({length:12},(_,i)=>({no:'QA_JC_'+i,status:'Open'})),assign:[],sessions:[],expenses:[{id:'preserve',amount:12.345}],leaves:[{emp:'OTHER'}]};
 await db.query("insert into workshop_state(id,revision,data,updated_by) values('main',1,$1::jsonb,'QA_SUP')",[JSON.stringify(initial)]);
 await db.exec(fs.readFileSync('experiments/mechanical-persistence.sql','utf8'));
 await db.exec(fs.readFileSync('experiments/mechanical-authority-guard.sql','utf8'));
 await db.exec(fs.readFileSync('experiments/mechanical-readers.sql','utf8'));
 await db.exec(fs.readFileSync('experiments/mechanical-dashboard.sql','utf8'));
 // Trusted fixture only. Production defaults must remain disabled and unmapped.
 assert.equal(await scalar('select count(*)::int n from zukait_mechanical.settings where not enabled'),1);
 const policy={flags:{mechanical:true},mechanicalDepartment:'QA_MECHANICAL',manualJcDuplicateMode:'deny',mcNumbering:{minimumDigits:3},mechanicalStaff:{QA_SUP:['MC_CREATE','TASK_CREATE','TASK_ASSIGN','TASK_HANDOVER']}};
 async function snapshot(){return (await db.query("select revision::float8 revision,data from workshop_state where id='main'")).rows[0];}
 async function records(){const tables=['checklists','tasks','links','receipts','audit'];const r={revision:Number((await db.query('select revision from zukait_mechanical.control')).rows[0].revision)};for(const table of tables){const rows=(await db.query('select * from zukait_mechanical.'+table)).rows;r[table]=rows.map(x=>table==='checklists'?{id:x.id,number:x.number,manualJobCard:{number:x.job_card,date:x.manual_jc_date instanceof Date?x.manual_jc_date.toISOString().slice(0,10):String(x.manual_jc_date).slice(0,10)}}:table==='tasks'?{id:x.id,checklistId:x.checklist_id,title:x.title}:table==='links'?{taskId:x.task_id,assignmentId:x.assignment_id,employeeId:x.employee_id,...(x.successor_id?{handedOverTo:x.successor_id}:{})}:table==='receipts'?{requestId:x.request_id,actorId:x.actor_id,fingerprint:x.fingerprint,result:x.result}:x);}return r;}
 async function prepare(operation,entityId,payload,requestId=randomUUID()){
  const r=await records(),s=await snapshot(),cmd={operation,entityId,payload,actorId:'QA_SUP',requestId,deviceId:'QA_DEVICE',expectedRevision:r.revision,expectedWorkshopRevision:s.revision};
  const context={actor:{id:'QA_SUP',role:'Supervisor',active:true},sessionCurrent:true,online:true,timeSnapshotConfirmed:true,commandFingerprint:await mechanicalCommandFingerprint(cmd)};
  if(operation==='MC_CREATE'){const seq=Number((await db.query('select next_sequence from zukait_mechanical.control')).rows[0].next_sequence);context.allocationVerified=true;context.allocatedChecklist={requestId,id:entityId,sequence:seq,number:'MC'+String(seq).padStart(3,'0')};}
  const transition=mechanicalTransition(r,s,cmd,context,policy,at);assert.equal(transition.ok,true,JSON.stringify(transition));const plan=await mechanicalPersistenceRequest(r,s,cmd,transition);assert.ok(!('workshopData' in plan.p_plan));assert.ok(!('expectedEmployeeSessions' in plan.p_plan));assert.match(plan.p_fingerprint,/^[0-9a-f]{64}$/);assert.ok(Buffer.byteLength(JSON.stringify(plan))<12000,'Small command delta, not full historical JSON');return plan;
 }
 const firstId=randomUUID();const first=await prepare('MC_CREATE',firstId,{manualJobCard:{number:'QA_JC_0',date:'2026-10-19'}});
 await assert.rejects(call(first),/mechanical_disabled/);
 await db.query('update zukait_mechanical.settings set enabled=true,department=$1,capabilities=$2::jsonb',['QA_MECHANICAL',JSON.stringify(policy.mechanicalStaff)]);
 await db.exec('set role service_role');const firstResult=await call(first);assert.equal(firstResult.number,'MC001');assert.equal((await call(first)).duplicate,true);await db.exec('reset role');
 assert.equal(Number(await scalar('select next_sequence n from zukait_mechanical.control')),2);assert.equal(Number(await scalar('select count(*) n from workshop_state_history')),0,'Metadata creates do not archive/write the full snapshot');
 await assert.rejects(call({...first,p_fingerprint:'f'.repeat(64)}),/mechanical_request_reused/);
 const bad=await prepare('MC_CREATE',randomUUID(),{manualJobCard:{number:'QA_JC_1',date:'2026-10-19'}});bad.p_plan.record.manualJobCard.number='QA_JC_0';await assert.rejects(call(bad),/manual_jc_duplicate/);assert.equal(Number(await scalar('select next_sequence n from zukait_mechanical.control')),2);
 // Failure after allocation/receipt insert must roll back all rows and number advancement.
 await db.exec("create function qa_fail_mechanical() returns trigger language plpgsql as $$begin raise exception 'QA_FAIL_AT_AUDIT';end$$;create trigger qa_fail after insert on zukait_mechanical.audit for each row execute function qa_fail_mechanical()");
 const second=await prepare('MC_CREATE',randomUUID(),{manualJobCard:{number:'QA_JC_1',date:'2026-10-19'}});await assert.rejects(call(second),/QA_FAIL_AT_AUDIT/);assert.equal(Number(await scalar('select next_sequence n from zukait_mechanical.control')),2);assert.equal(Number(await scalar('select count(*) n from zukait_mechanical.checklists')),1);await db.exec('drop trigger qa_fail on zukait_mechanical.audit');assert.equal((await call(second)).number,'MC002');
 const task=randomUUID();await call(await prepare('TASK_CREATE',task,{checklistId:firstId,title:'Synthetic task'}));const sourceId=randomUUID();await call(await prepare('TASK_ASSIGN',task,{employeeId:'QA_A',assignmentId:sourceId,suggestedMinutes:60}));
 let s=await snapshot();assert.equal(s.data.assign.length,1);assert.deepEqual(s.data.expenses,initial.expenses);assert.equal(Number(await scalar('select count(*) n from workshop_state_history')),1);assert.equal(Number(await scalar('select count(*) n from workshop_live_status')),2,'Existing live-status trigger remains active');
 // Server-confirmed synthetic pause; never create fixtures against the live project.
 at+=7200000;s.data.sessions=[{id:'QA_SESSION',emp:'QA_A',job:'QA_JC_0',assignmentId:sourceId,start:at-3600000,end:at,paused:true}];
 s.data.sessions.push(...Array.from({length:400},(_,i)=>({id:'QA_HISTORY_'+i,emp:'QA_A',job:'QA_OTHER_HISTORY',assignmentId:'QA_OLD_'+i,start:at-(i+1)*86400000,end:at-(i+1)*86400000+60000,notes:'Synthetic history '.repeat(20)})));await db.query("update workshop_state set data=$1::jsonb,revision=revision+1 where id='main'",[JSON.stringify(s.data)]);
 s=await snapshot();const originalSessions=JSON.stringify(s.data.sessions),source=s.data.assign[0],successor=randomUUID();const h=await prepare('TASK_HANDOVER',task,{sourceAssignmentId:sourceId,targetEmployeeId:'QA_B',successorAssignmentId:successor,suggestedMinutes:30,reason:'QA audited handover',expectedSource:allocationToken(source),expectedEmployeeSessions:employeeTimeToken(s.data,'QA_A')});
 const forged=structuredClone(h);forged.p_plan.sourceAfter.emp='QA_B';await assert.rejects(call(forged),/handover_history_protected/);assert.equal(Number(await scalar('select count(*) n from zukait_mechanical.links')),1);
 // Exercise the boundary against the real SQL receipt, not only a mock store.
 const clientHandover={operation:'TASK_HANDOVER',entityId:task,requestId:h.p_request,deviceId:'QA_DEVICE',expectedRevision:h.p_expected_records,expectedWorkshopRevision:h.p_expected_workshop,payload:{sourceAssignmentId:sourceId,targetEmployeeId:'QA_B',successorAssignmentId:successor,suggestedMinutes:30,reason:'QA audited handover'}};
 let apiPlan;const apiActor={id:'QA_SUP',role:'Supervisor',active:true};
 const apiServer={enabled:true,actor:apiActor,policy,now:()=>at,verifySession:async()=>apiActor,
  readReceipt:async requestId=>{const row=(await db.query('select actor_id,fingerprint,result from zukait_mechanical.receipts where request_id=$1::uuid',[requestId])).rows[0];return row&&{actorId:row.actor_id,fingerprint:row.fingerprint,result:row.result}},
  readContext:async()=>({records:await records(),snapshot:await snapshot()}),
  commit:async plan=>{apiPlan=plan;await call(plan);throw new Error('QA_REAL_SQL_LOST_ACK')}
 };
 await assert.rejects(mechanicalCommandApi(clientHandover,apiServer),/QA_REAL_SQL_LOST_ACK/);
 const recovered=await mechanicalCommandApi(clientHandover,{...apiServer,readContext:async()=>{throw new Error('Retry must not read history')}});
 assert.equal(recovered.body.duplicate,true);assert.equal(recovered.body.result.assignmentId,successor);assert.equal((await call(apiPlan)).duplicate,true);
 await assert.rejects(call(h),/mechanical_request_reused/,'Internal enriched command cannot replace the stable client identity');
 s=await snapshot();assert.equal(JSON.stringify(s.data.sessions),originalSessions);assert.equal(s.data.assign[0].emp,'QA_A');assert.equal(s.data.assign[0].completed,true);assert.equal(workedMinutes(s.data,s.data.assign[0],at),60);assert.equal(s.data.assign[1].handoverFromAssignmentId,sourceId);assert.deepEqual(s.data.expenses,initial.expenses);assert.deepEqual(s.data.leaves,initial.leaves);
 assert.equal(Number(await scalar('select count(*) n from zukait_mechanical.links')),2);assert.equal(Number(await scalar('select count(*) n from workshop_state_history')),2);
 // Current-revision old-app payloads still cannot undo normalized authority.
 // Exercise the REAL full-save RPC, including its later p_live override stage.
 const saved=await snapshot(),liveBefore=(await db.query('select * from workshop_live_status order by employee_id')).rows;
 const historyBefore=Number(await scalar('select count(*) n from workshop_state_history'));
 const staleVariants=[
  d=>{d.assign[0].completed=false;delete d.assign[0].handedOverToAssignmentId},
  d=>{d.assign=d.assign.filter(a=>a.id!==successor)},
  d=>{delete d.assign[1].mechanicalTaskId},
  d=>{d.assign[0].emp='QA_B'},
  d=>{d.assign[0].suggested=0},
  d=>{d.assign[0].completedAt+=1},
  d=>{d.assign.push(structuredClone(d.assign[0]))},
  d=>{d.sessions.push({id:'QA_OLD_PHONE_RESUME',assignmentId:sourceId,emp:'QA_A',job:'QA_JC_0',start:at,end:null})},
  d=>{d.sessions.push({id:'QA_OLD_PHONE_LATE_WORK',assignmentId:sourceId,emp:'QA_A',job:'QA_JC_0',start:at,end:at+60000})}
 ];
 await db.exec('set role service_role');
 for(const mutate of staleVariants){
  const staleData=structuredClone(saved.data);mutate(staleData);
  await assert.rejects(db.query('select public.zukait_commit_workshop_state_v2($1,$2::jsonb,$3,$4::jsonb)',[saved.revision,JSON.stringify(staleData),'QA_SUP',JSON.stringify([{employee_id:'QA_A',status:'Working',assignment_id:sourceId,job_no:'QA_JC_0'}])]),/mechanical_authority_conflict/);
  assert.deepEqual(await snapshot(),saved,'Rejected stale save cannot alter revision or any business data');
  assert.deepEqual((await db.query('select * from workshop_live_status order by employee_id')).rows,liveBefore,'Rejected save cannot reach/retain a stale live-status override');
  assert.equal(Number(await scalar('select count(*) n from workshop_state_history')),historyBefore,'Archive insertion rolls back too');
 }
 await db.exec('reset role');
 await db.exec('update zukait_mechanical.settings set enabled=false');
 const undo=structuredClone(saved.data);undo.assign[0].completed=false;
 await assert.rejects(db.query("update workshop_state set data=$1::jsonb where id='main'",[JSON.stringify(undo)]),/mechanical_authority_conflict/,'Turning off new commands must preserve existing handovers');
 await db.exec('update zukait_mechanical.settings set enabled=true');
 await db.exec('set role service_role');
 await assert.rejects(db.query('select public.zukait_commit_workshop_state_v2($1,$2::jsonb,$3,$4::jsonb)',[saved.revision,JSON.stringify(saved.data),'QA_SUP',JSON.stringify([{employee_id:'QA_A',status:'Working',assignment_id:sourceId,job_no:'QA_JC_0'}])]),/mechanical_live_authority_conflict/,'Identical-state RPC retry cannot revive a handed-over source through p_live');
 assert.deepEqual((await db.query('select * from workshop_live_status order by employee_id')).rows,liveBefore);
 const fresh=structuredClone(saved.data);fresh.expenses.push({id:'QA_UNRELATED',amount:1.234});
 const ordinary=(await db.query('select public.zukait_commit_workshop_state_v2($1,$2::jsonb,$3,$4::jsonb) r',[saved.revision,JSON.stringify(fresh),'QA_SUP',JSON.stringify(liveBefore)])).rows[0].r;
 assert.equal(ordinary.ok,true,'Fresh ordinary full save preserves linked assignments and succeeds');
 assert.deepEqual((await snapshot()).data.sessions,saved.data.sessions);
 await db.exec('reset role');
 assert.equal(Number(await scalar("select count(*) n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='zukait_mechanical' and c.relkind='r' and c.relrowsecurity")),7);
 await assert.rejects(db.exec("update zukait_mechanical.audit set actor_id='QA_SUP'"),/mechanical_append_only/,'append-only trigger also rejects owner updates');
 // Both revisions are checked before any metadata or shared writes.
 const stale=await prepare('TASK_CREATE',randomUUID(),{checklistId:firstId,title:'Stale'});await db.exec("update workshop_state set revision=revision+1 where id='main'");const count=Number(await scalar('select count(*) n from zukait_mechanical.tasks'));await assert.rejects(call(stale),/workshop_revision_conflict/);assert.equal(Number(await scalar('select count(*) n from zukait_mechanical.tasks')),count);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from zukait_mechanical.receipts'),/permission denied/);await assert.rejects(call(first),/permission denied/);await db.exec('reset role');}
 await db.exec('set role service_role');await assert.rejects(db.exec("update zukait_mechanical.links set employee_id='QA_B'"),/permission denied/,'original employee link is not updateable');for(const table of ['audit','receipts'])for(const statement of ['update '+table+" set actor_id='QA_SUP'",'delete from '+table,'truncate '+table])await assert.rejects(db.exec(statement.replace(table,'zukait_mechanical.'+table)),/permission denied|mechanical_append_only/);await assert.rejects(db.exec('update zukait_mechanical.settings set enabled=true'),/permission denied/);await db.exec('reset role');
 // A receipt is never an authentication bypass. No raw session tokens enter SQL.
 for(const hash of [null,'raw-token','f'.repeat(64),'b'.repeat(64)])await assert.rejects(call({...first,p_session_hash:hash}),/mechanical_invalid_session/);
 await db.query('update staff_sessions set revoked_at=now() where token_hash=$1',[sessionHash]);await assert.rejects(call(first),/mechanical_invalid_session/);await db.query('update staff_sessions set revoked_at=null where token_hash=$1',[sessionHash]);
 await db.exec("update staff_credentials set active=false where user_id='QA_SUP'");await assert.rejects(call(first),/mechanical_forbidden/);await db.exec("update staff_credentials set active=true,role='Employee' where user_id='QA_SUP'");await assert.rejects(call(first),/mechanical_forbidden/);await db.exec("update staff_credentials set role='Supervisor' where user_id='QA_SUP'");
 const readSql='select public.zukait_mechanical_read($1,$2,$3,$4,$5::uuid,$6::uuid,$7::jsonb) r';
 const read=async(kind,op='TASK_CREATE',entity=task,payload={checklistId:firstId},request=null)=>(await db.query(readSql,['QA_SUP',sessionHash,op,kind,request,entity,JSON.stringify(payload)])).rows[0].r;
 const scoped=await read('context');assert.equal(scoped.records.checklists.length,1);assert.equal(scoped.records.tasks.length,1);assert.equal(scoped.records.links.length,2);assert.deepEqual(scoped.records.receipts,[]);assert.deepEqual(scoped.records.audit,[]);
 assert.equal((await read('policy')).mechanicalStaff.QA_SUP.includes('TASK_HANDOVER'),true);assert.equal((await read('receipt','MC_CREATE',null,{},first.p_request)).result.number,'MC001');
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(read('policy'),/permission denied/);await db.exec('reset role');}
 // Use the same service RPC adapter as the disabled router, against real SQL.
 let routeCalls=0;const routeAdmin={rpc:async(name,p)=>{routeCalls++;try{return {data:name==='zukait_mechanical_read'?(await db.query(readSql,[p.p_actor,p.p_session_hash,p.p_operation,p.p_kind,p.p_request,p.p_entity,JSON.stringify(p.p_payload)])).rows[0].r:await call(p)}}catch(error){return {error:{message:error.message}}}}};
 const routeActor={id:'QA_SUP',role:'Supervisor'};
 const routeContext=await read('context');const routeCommand={operation:'TASK_CREATE',entityId:randomUUID(),requestId:randomUUID(),deviceId:'QA_ROUTE',expectedRevision:routeContext.records.revision,expectedWorkshopRevision:routeContext.snapshot.revision,payload:{checklistId:firstId,title:'API adapter SQL acceptance'}};
 const routeBody={action:'mechanical_command',command:routeCommand};
 assert.equal((await mechanicalRoute(routeAdmin,routeActor,routeBody)).body.code,'extension_disabled');assert.equal(routeCalls,0);
 const routeOptions={enabled:true,sessionHash,verifySession:async()=>routeActor};
 await db.exec('set role service_role');const routeResult=await mechanicalRoute(routeAdmin,routeActor,routeBody,routeOptions);assert.equal(routeResult.status,200,JSON.stringify(routeResult));assert.equal(routeResult.body.result.entityId,routeCommand.entityId);assert.ok(!JSON.stringify(routeResult).includes('snapshot'));
 assert.equal((await mechanicalRoute(routeAdmin,routeActor,routeBody,routeOptions)).body.duplicate,true);
 await db.exec('reset role');await db.query('update staff_sessions set revoked_at=now() where token_hash=$1',[sessionHash]);assert.equal((await mechanicalRoute(routeAdmin,routeActor,routeBody,routeOptions)).status,401);await db.query('update staff_sessions set revoked_at=null where token_hash=$1',[sessionHash]);
 // Existing shared time rules operate on the linked successor; the source
 // retains its original hours. This does not invent Mechanical QC mapping.
 let flow=(await snapshot()).data;
 assert.equal(employeeTransition(flow,{id:'QA_A',role:'Employee'},{event_type:'START',action_id:'QA_BAD_RESTART',assignment_id:sourceId,job:'QA_JC_0'},at+1000).code,'employee_time_assignment_not_open');
 const sourceAssignment=flow.assign.find(a=>a.id===sourceId);
 const tmRequest={operation:'REOPEN',assignmentId:sourceId,requestId:'tm-'+randomUUID(),reason:'Do not undo handover',expectedSource:allocationToken(sourceAssignment),expectedSessions:employeeTimeToken(flow,'QA_A')};
 assert.equal(managerTimeTransition(flow,{id:'QA_MANAGER',role:'Manager'},tmRequest,at+1000).code,'time_handover_source_locked');
 const historic=flow.sessions.find(s=>s.id==='QA_SESSION');
 const correction={...tmRequest,operation:'CORRECT_SESSION',sessionId:historic.id,start:historic.start+60000,end:historic.end};
 assert.equal(managerTimeTransition(flow,{id:'QA_MANAGER',role:'Manager'},correction,at+1000).ok,true,'Existing audited closed-history correction remains available');
 assert.equal(managerTimeTransition(flow,{id:'QA_MANAGER',role:'Manager'},{...correction,end:sourceAssignment.completedAt+60000},at+120000).code,'time_handover_cutoff');
 const commitFlow=async(data,live)=>{const current=await snapshot();const r=(await db.query('select public.zukait_commit_workshop_state_v2($1,$2::jsonb,$3,$4::jsonb) r',[current.revision,JSON.stringify(data),'QA_SUP',JSON.stringify(live)])).rows[0].r;assert.equal(r.ok,true);return (await snapshot()).data};
 const action=(data,type,actionId,extra={},now=at+60000)=>employeeTransition(data,{id:'QA_B',role:'Employee'},{event_type:type,action_id:actionId,assignment_id:successor,job:'QA_JC_0',...extra},now);
 const started=action(flow,'START','QA_SUCCESSOR_START',{new_session_id:'QA_SUCCESSOR_PERIOD'});assert.equal(started.ok,true);
 flow=await commitFlow(started.data,[{employee_id:'QA_A',status:'Available'},{employee_id:'QA_B',status:'Working',assignment_id:successor,session_id:started.session.id,session_start:started.session.start,job_no:'QA_JC_0'}]);
 const repeated=action(flow,'START','QA_SUCCESSOR_ALREADY_ACTIVE',{new_session_id:'QA_MUST_NOT_CREATE'});assert.equal(repeated.ok,true);assert.equal(repeated.data.sessions.filter(s=>s.emp==='QA_B'&&s.end==null).length,1);
 assert.equal(action(flow,'START','QA_SECOND_JOB_DENIED',{assignment_id:'QA_OTHER_ASSIGNMENT'}).code,'employee_time_already_active');
 assert.equal(flow.sessions.filter(s=>s.emp==='QA_B'&&s.end==null).length,1);assert.equal(workedMinutes(flow,flow.assign.find(a=>a.id===sourceId),at+60000),60);
 assert.equal(qcWork(flow,'QA_JC_0').complete,false);assert.equal(qcTransition(flow,{id:'SUP002',role:'Supervisor'},{operation:'PAINTING_QC',jobCard:'QA_JC_0',expectedQcRevision:0,result:'PASS'},at+60000).code,'work_not_finished');
 const paused=action(flow,'PAUSE','QA_SUCCESSOR_PAUSE',{session_id:started.session.id},at+1860000);assert.equal(paused.ok,true);flow=await commitFlow(paused.data,[{employee_id:'QA_A',status:'Available'},{employee_id:'QA_B',status:'Paused',assignment_id:successor,job_no:'QA_JC_0'}]);
 const resumed=action(flow,'START','QA_SUCCESSOR_RESUME',{new_session_id:'QA_SUCCESSOR_SECOND'},at+1920000);assert.equal(resumed.ok,true);flow=await commitFlow(resumed.data,[{employee_id:'QA_A',status:'Available'},{employee_id:'QA_B',status:'Working',assignment_id:successor,session_id:resumed.session.id,session_start:resumed.session.start,job_no:'QA_JC_0'}]);
 const finished=action(flow,'FINISH','QA_SUCCESSOR_FINISH',{session_id:resumed.session.id},at+2520000);assert.equal(finished.ok,true);flow=await commitFlow(finished.data,[{employee_id:'QA_A',status:'Available'},{employee_id:'QA_B',status:'Available'}]);
 assert.equal(action(flow,'FINISH','QA_SUCCESSOR_FINISH',{session_id:resumed.session.id},at+2520000).duplicate,true);
 assert.equal(workedMinutes(flow,flow.assign.find(a=>a.id===sourceId),at+2520000),60);assert.equal(workedMinutes(flow,flow.assign.find(a=>a.id===successor),at+2520000),40);
 assert.equal(qcWork(flow,'QA_JC_0').complete,true);assert.equal(qcStatus(flow,flow.jobs.find(j=>j.no==='QA_JC_0')).deliveryReady,false);
 assert.equal(qcTransition(flow,{id:'QA_SUP',role:'Supervisor'},{operation:'PAINTING_QC',jobCard:'QA_JC_0',expectedQcRevision:0,result:'PASS'},at+2520000).code,'qc_permission_denied','No guessed Mechanical supervisor/QC bypass');
 const qc=qcTransition(flow,{id:'SUP002',role:'Supervisor'},{operation:'PAINTING_QC',jobCard:'QA_JC_0',expectedQcRevision:0,result:'PASS'},at+2520000);assert.equal(qc.ok,true,'Existing painting gate remains');
 assert.equal(qcTransition(qc.data,{id:'SUP002',role:'Supervisor'},{operation:'FINAL_QC',jobCard:'QA_JC_0',expectedQcRevision:1,result:'PASS'},at+2520000).code,'qc_permission_denied');
 const reopened=structuredClone(qc.data);reopened.assign.find(a=>a.id===successor).completed=false;assert.equal(qcStatus(reopened,reopened.jobs.find(j=>j.no==='QA_JC_0')).painting,false,'Changed work invalidates existing QC fingerprint');
 // Bounded foreground responses with 2k/10k current synthetic history. No
 // historical workshop_state_history JSON is read or exported by this test.
 const dashboardSql='select public.zukait_mechanical_dashboard($1,$2,$3,$4::uuid) r';
 const dashboard=async(after=0,checklist=firstId)=>(await db.query(dashboardSql,['QA_SUP',sessionHash,after,checklist])).rows[0].r;
 await db.exec('set role service_role');const display=await dashboard();assert.equal(display.detail.checklist.number,'MC001');assert.equal(display.detail.assignments.length,2);assert.ok(!JSON.stringify(display).includes('password'));assert.ok(!JSON.stringify(display).includes('QA_SESSION'));await db.exec('reset role');
 // Synthetic pagination fixtures only; never inserted into a live project.
 for(let i=0;i<27;i++)await db.query("insert into zukait_mechanical.checklists(id,number,sequence_no,job_card,manual_jc_date,created_by) values($1::uuid,$2,$3,$4,'2026-10-22','QA_SUP')",[randomUUID(),'MC'+(1000+i),1000+i,'QA_PAGE_'+i]);
 const firstPage=await dashboard(0,null);assert.equal(firstPage.checklists.length,25);assert.ok(firstPage.nextAfter>0);const secondPage=await dashboard(firstPage.nextAfter,null);assert.equal(secondPage.checklists.length,4);assert.equal(secondPage.nextAfter,null);assert.equal(new Set([...firstPage.checklists,...secondPage.checklists].map(c=>c.id)).size,29);
 await db.query('update staff_sessions set revoked_at=now() where token_hash=$1',[sessionHash]);await assert.rejects(dashboard(),/mechanical_invalid_session/);await db.query('update staff_sessions set revoked_at=null where token_hash=$1',[sessionHash]);
 for(const size of [2000,10000]){
  const large=(await snapshot()).data;large.sessions=large.sessions.filter(s=>!String(s.id).startsWith('QA_LARGE_HISTORY_'));
  large.sessions.push(...Array.from({length:size},(_,i)=>({id:'QA_LARGE_HISTORY_'+i,emp:'QA_OTHER',job:'QA_UNRELATED',assignmentId:'QA_UNRELATED_'+i,start:at-(i+1)*86400000,end:at-(i+1)*86400000+60000,notes:'Synthetic unrelated period '.repeat(8)})));
  const startMs=performance.now();await commitFlow(large,[{employee_id:'QA_A',status:'Available'},{employee_id:'QA_B',status:'Available'}]);const saveMs=performance.now()-startMs;
  const readMs=performance.now(),view=await dashboard(),metadata=await read('context','TASK_CREATE',randomUUID(),{checklistId:firstId});
  assert.equal(metadata.snapshot.data.sessions.length,0);assert.equal(metadata.snapshot.data.assign.length,0);
  const viewBytes=Buffer.byteLength(JSON.stringify(view)),metadataBytes=Buffer.byteLength(JSON.stringify(metadata));assert.ok(viewBytes<16000);assert.ok(metadataBytes<16000);assert.ok(!JSON.stringify({view,metadata}).includes('QA_LARGE_HISTORY_'));
  assert.equal(workedMinutes((await snapshot()).data,sourceAssignment,at+2520000),60);
  console.log(JSON.stringify({fixture:'synthetic current history',periods:size,dashboardBytes:viewBytes,metadataContextBytes:metadataBytes,readMs:Number((performance.now()-readMs).toFixed(2)),saveMs:Number(saveMs.toFixed(2)),productionSavingsVerified:false}));
 }
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(dashboard(),/permission denied/);await db.exec('reset role');}
 if(native){
  // Real concurrent retries/different requests with observable lock contention.
  const a=new pg.Client({...config,database}),b=new pg.Client({...config,database});await Promise.all([a.connect(),b.connect()]);await Promise.all([a.query('set role service_role'),b.query('set role service_role')]);
  try{
  async function blocked(waiter,holder){for(let i=0;i<100;i++){if((await db.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[waiter.processID,holder.processID])).rows[0].blocked)return;await new Promise(r=>setTimeout(r,20));}assert.fail('Expected session/credential lock contention');}
  // Valid command owns a shared session lock until its transaction commits.
  await a.query('begin');await a.query(rpcSql,values(first));const revoke=b.query('update staff_sessions set revoked_at=now() where token_hash=$1',[sessionHash]);await blocked(b,a);await a.query('commit');await revoke;await assert.rejects(call(first),/mechanical_invalid_session/);await db.query('update staff_sessions set revoked_at=null where token_hash=$1',[sessionHash]);
  // If revocation wins first, a command waits, rechecks the changed row and fails.
  await b.query('begin');await b.query('update staff_sessions set revoked_at=now() where token_hash=$1',[sessionHash]);const waiting=a.query(rpcSql,values(first)).then(()=>({ok:true}),error=>({error}));await blocked(a,b);await b.query('commit');assert.match((await waiting).error.message,/mechanical_invalid_session/);await db.query('update staff_sessions set revoked_at=null where token_hash=$1',[sessionHash]);
  async function race(p1,p2,duplicate){await a.query('begin');await b.query('begin');try{const one=(await a.query(rpcSql,values(p1))).rows[0].r;const pending=b.query(rpcSql,values(p2)).then(r=>({row:r.rows[0].r}),error=>({error}));let blocked=false;for(let i=0;i<100;i++){if((await db.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[b.processID,a.processID])).rows[0].blocked){blocked=true;break}await new Promise(r=>setTimeout(r,20));}assert.ok(blocked,'Second writer must wait on the tested lock');await a.query('commit');const two=await pending;if(duplicate){assert.equal(two.row.duplicate,true);assert.equal(two.row.number,one.number);await b.query('commit')}else{assert.match(two.error.message,/mechanical_revision_conflict/);await b.query('rollback')}}finally{await a.query('rollback');await b.query('rollback')}}
  const p=await prepare('MC_CREATE',randomUUID(),{manualJobCard:{number:'QA_JC_2',date:'2026-10-19'}});await race(p,p,true);const p1=await prepare('MC_CREATE',randomUUID(),{manualJobCard:{number:'QA_JC_3',date:'2026-10-19'}}),p2=await prepare('MC_CREATE',randomUUID(),{manualJobCard:{number:'QA_JC_4',date:'2026-10-19'}});await race(p1,p2,false);assert.equal((await call(await prepare('MC_CREATE',randomUUID(),{manualJobCard:{number:'QA_JC_4',date:'2026-10-19'}}))).number,'MC005');}finally{await Promise.all([a.query('rollback'),b.query('rollback')]);await Promise.all([a.end(),b.end()]);}
 }
 await mechanicalQcPersistenceTests({db,records,snapshot,native,pg,config,database});
 console.log('PASS '+(native?'native PostgreSQL 17 concurrent':'PGlite')+' persistence: MC001/MC002, retry identity, one JC/MC, rollback/no consumed number, metadata without full-state writes, atomic assignment/handover/history/live triggers, dual revision checks, append-only and private service ACL. No production access.');
}finally{if(native){await client.end();await admin.query('drop database "'+database+'" with (force)');await admin.end();}else await db.close();}
