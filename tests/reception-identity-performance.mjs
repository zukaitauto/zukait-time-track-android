import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const native=process.env.ZUKAIT_GUARD_NATIVE==='1';
let db,admin,client,config,database;
if(native){
 const {default:pg}=await import('pg');
 const host=process.env.PGHOST||'127.0.0.1';assert.ok(['127.0.0.1','localhost','::1'].includes(host));
 config={host,port:Number(process.env.PGPORT||5432),user:'postgres',password:process.env.PGPASSWORD||'traffic-test-only'};
 database='zukait_guard_qa_'+randomUUID().replaceAll('-','');
 admin=new pg.Client({...config,database:'postgres'});await admin.connect();await admin.query('create database "'+database+'"');
 client=new pg.Client({...config,database});await client.connect();db={exec:s=>client.query(s),query:(...a)=>client.query(...a)};
 assert.equal(Math.floor(Number((await db.query('show server_version_num')).rows[0].server_version_num)/10000),17);
 for(const role of ['anon','authenticated','service_role'])if(!(await db.query('select 1 from pg_roles where rolname=$1',[role])).rows.length)await db.exec('create role '+role+' nologin'+(role==='service_role'?' bypassrls':''));
}else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
const before=fs.readFileSync('tests/fixtures/reception-identity-guard-before.sql','utf8');
const after=fs.readFileSync('experiments/reception-identity-single-pass.sql','utf8');
try{
 let baseline=fs.readFileSync('tests/fixtures/reception-postgres17-baseline.sql','utf8');
 if(native)baseline=baseline.replace(/create role (anon|authenticated|service_role)[^;]+;/g,'');else baseline=baseline.replace('create extension if not exists pgcrypto;','');
 await db.exec(baseline);
 for(const file of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')&&!x.includes('optimize_live_status_session_partition')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec(fs.readFileSync('tests/fixtures/workshop-save-live-functions.sql','utf8'));
 // Use the deployed helper in both arms, so only the reception guard differs.
 await db.exec(fs.readFileSync('experiments/live-status-session-partition.sql','utf8'));
 await db.exec("set work_mem='2184kB'; insert into staff_credentials(user_id,display_name,role,department,password_hash,password_salt) values('QA-MGR','Manager','Manager','','none','none'),('QA-RC','Reception','Receptionist','','none','none'),('QA-SUP','Supervisor','Supervisor','','none','none'),('QA-EMP','Employee','Employee','','none','none'); insert into workshop_state(id,data,revision,updated_by) values('main','{\"jobs\":[],\"assign\":[],\"sessions\":[],\"estimates\":[]}',1,'QA-MGR');");
 const call=async c=>(await db.query('select zukait_reception_command($1,$2::jsonb) r',['QA-MGR',JSON.stringify({...c,request_id:randomUUID()})])).rows[0].r;
 for(let i=0;i<4;i++){
  let r=(await call({operation:'CREATE',job_type:'CASH',insurance_id:null,details:{make:'Toyota',model:'Camry',registration:'QA'+i,year:'2023',vin:'',customer:'Synthetic '+i}})).record;
  r=(await call({operation:'SET_APPROVED',rc_no:r.rc_no,expected_revision:r.revision,date:'2026-10-21',reason:'QA'})).record;
  await call({operation:'CREATE_CHECKLIST_JOB',rc_no:r.rc_no,expected_revision:r.revision,job_card:'QA'+i,reason:'QA'});
 }
 // Probe runs the exact guard without other triggers obscuring parity/errors.
 await db.exec('create table qa_identity_probe(id text,data jsonb); create trigger qa_identity before insert or update on qa_identity_probe for each row execute function zukait_reception_vehicle_state_guard();');
 const initial=(await db.query("select data from workshop_state where id='main'")).rows[0].data;
 const linked=initial.jobs;
 const cases=[['linked stale aliases',{...initial,jobs:linked.map(j=>({...j,vin:'forged',registrationNo:'old',phone:'old',custom:'keep'}))}],['missing linked job',{...initial,jobs:linked.slice(1)}],['duplicate linked job',{...initial,jobs:[...linked,linked[0]]}],['unrelated legacy rows',{...initial,jobs:[null,{},...linked,{no:'OTHER',registrationNo:'keep'}]}],['no estimates',{...initial,estimates:undefined}],['empty arrays',{jobs:[],estimates:[]}]];
 async function outcome(sql,data,id='main',update=false){
  await db.exec(sql);await db.exec('begin');
  try{
   if(update){await db.query('insert into qa_identity_probe values($1,$2::jsonb)',[id,JSON.stringify(initial)]);await db.query('update qa_identity_probe set data=$1::jsonb',[JSON.stringify(data)]);}
   else await db.query('insert into qa_identity_probe values($1,$2::jsonb)',[id,JSON.stringify(data)]);
   return {rows:(await db.query('select data from qa_identity_probe')).rows};
  }catch(e){return {error:e.message,code:e.code};}finally{await db.exec('rollback');}
 }
 for(const [name,data] of cases)for(const update of [false,true])assert.deepEqual(await outcome(after,data,'main',update),await outcome(before,data,'main',update),name+' update='+update);
 assert.deepEqual(await outcome(after,{jobs:123},'other'),await outcome(before,{jobs:123},'other'));
 // Add linked quote metadata and preserve missing/duplicate quote rejection.
 const rc=(await db.query('select rc_no,details from workshop_receptions order by rc_no limit 1')).rows[0];
 const q={id:'QA-QUOTE',jobCard:linked[0].no,makeModel:'stale',registration:'stale',custom:'preserve'};
 await db.query("insert into workshop_reception_estimates(id,rc_no,estimate_id,estimate_no,snapshot,identity_snapshot,linked_by) values($1,$2,$3,'QA-QUOTE-NO',$4::jsonb,'{}','QA-MGR')",[randomUUID(),rc.rc_no,q.id,JSON.stringify(q)]);
 for(const quotes of [[q],[],[q,q],[{...q,jobCard:'QA3'}]]){const data={...initial,estimates:quotes};assert.deepEqual(await outcome(after,data,'main',true),await outcome(before,data,'main',true),'linked quote parity');}
 await db.exec('delete from workshop_reception_estimates');
 await db.exec(after);
 // Existing business and permission regressions, candidate installed throughout.
 for(const group of [['reception-direct-job.sql','reception-cash-amount.sql'],['reception-create-job.sql','reception-vehicle-authority.sql'],['reception-create-job.sql','reception-additional.sql'],['reception-cancellation-fixture.sql','reception-cancellation.sql']]){
  await db.exec('begin');try{for(const file of [...group,'reception-trigger-privileges.sql'])await db.exec(fs.readFileSync('tests/'+file,'utf8'));}finally{await db.exec('rollback');}
 }
 await db.exec("insert into staff_credentials(user_id,display_name,role,department,password_hash,password_salt) select 'QAE'||g,'Employee '||g,'Employee','','none','none' from generate_series(1,19)g");
 const jobs=[...linked,...Array.from({length:996},(_,i)=>({no:'UNRELATED'+i,vehicle:'Synthetic',notes:'x'.repeat(160)}))];
 const payload={...initial,jobs,users:Array.from({length:19},(_,i)=>({id:'QAE'+(i+1),name:'Employee '+(i+1),role:'Employee'})),assign:Array.from({length:19},(_,i)=>({id:'A'+(i+1),emp:'QAE'+(i+1),job:'QA0',completed:false})),sessions:Array.from({length:7000},(_,i)=>({id:'S'+i,emp:'QAE'+(1+i%19),assignmentId:'A'+(1+i%19),job:'QA0',start:i+1,end:i+2,paused:true,reason:'synthetic '.repeat(12)}))};
 await db.query("update workshop_state set data=$1::jsonb where id='main'",[JSON.stringify(payload)]);
 const trials=[];
 for(let pair=0;pair<3;pair++)for(const [label,sql] of [['before',before],['after',after]]){
  await db.exec(sql);
  const old=(await db.query("select revision,data from workshop_state where id='main'")).rows[0];
  const proposed={...old.data,qaMarker:label+pair};
  const p=(await db.query("explain(analyze,buffers,wal,format json) select zukait_commit_workshop_state_v2($1,$2::jsonb,'QA-MGR','[]'::jsonb)",[old.revision,JSON.stringify(proposed)])).rows[0]['QUERY PLAN'][0];
  const saved=(await db.query("select revision,data from workshop_state where id='main'")).rows[0];
  assert.deepEqual(saved.data,proposed);assert.equal(Number(saved.revision),Number(old.revision)+1);
  assert.equal(Number((await db.query('select count(*) n from workshop_state_history where revision=$1',[old.revision])).rows[0].n),1);
  trials.push({pair,label,ms:p['Execution Time'],temp:p.Plan['Temp Written Blocks']||0});
 }
 const median=a=>a.sort((x,y)=>x-y)[1];
 const report={engine:native?'native PostgreSQL 17':'PGlite',synthetic_only:true,linked_receptions:4,jobs:1000,sessions:7000,parity_cases:17,trials,before_ms:median(trials.filter(x=>x.label==='before').map(x=>x.ms)),after_ms:median(trials.filter(x=>x.label==='after').map(x=>x.ms)),before_temp:median(trials.filter(x=>x.label==='before').map(x=>x.temp)),after_temp:median(trials.filter(x=>x.label==='after').map(x=>x.temp))};
 fs.mkdirSync('artifacts/reception-identity',{recursive:true});fs.writeFileSync('artifacts/reception-identity/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(native){await client.end();await admin.query('drop database "'+database+'" with (force)');await admin.end();}else await db.close();}
