import fs from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
const candidatePath=process.argv[2]||'experiments/live-status-session-partition.sql';
const before=fs.readFileSync('tests/fixtures/live-status-refresh-before.sql','utf8');
const after=fs.readFileSync(candidatePath,'utf8');
assert.equal(process.env.ZUKAIT_TRAFFIC_ISOLATED,'1','Isolated test opt-in required');
const host=process.env.PGHOST||'127.0.0.1';
assert.ok(['127.0.0.1','localhost','::1'].includes(host),'Only loopback PostgreSQL is permitted');
const config={host,port:Number(process.env.PGPORT||5432),user:'postgres',password:process.env.PGPASSWORD||'traffic-test-only',connectionTimeoutMillis:10000};
const name='zukait_traffic_qa_'+randomUUID().replaceAll('-','');
const admin=new pg.Client({...config,database:'postgres'});await admin.connect();
await admin.query('create database "'+name+'"');
const client=new pg.Client({...config,database:name});await client.connect();
const db={query:(...args)=>client.query(...args),exec:s=>client.query(s),close:async()=>{await client.end();await admin.query('drop database "'+name+'" with (force)');await admin.end();}};
const version=Number((await db.query('show server_version_num')).rows[0].server_version_num);
assert.ok(version>=170000&&version<180000,'Native PostgreSQL 17 required');
try{
 console.log('Isolated native PostgreSQL engine:',(await db.query('select version() version')).rows[0].version);
 for(const role of ['anon','authenticated','service_role']){
  const found=(await db.query('select 1 from pg_roles where rolname=$1',[role])).rows.length;
  if(!found)await db.exec('create role '+role+' nologin'+(role==='service_role'?' bypassrls':''));
 }
 await db.exec(fs.readFileSync('tests/fixtures/reception-postgres17-baseline.sql','utf8').replace(/create role (anon|authenticated|service_role)[^;]+;/g,''));
 for(const file of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec(fs.readFileSync('tests/fixtures/workshop-save-live-functions.sql','utf8'));
 await db.exec("set work_mem='2184kB'; create table synthetic_probe(data jsonb); insert into staff_credentials(user_id,display_name,role,department,password_hash,password_salt) select 'E'||g,'Synthetic employee '||g,'Employee','','test-only','test-only' from generate_series(1,19)g;");
 await db.exec(`insert into synthetic_probe select jsonb_build_object(
 'users',(select jsonb_agg(jsonb_build_object('id','E'||g,'name','Synthetic employee '||g,'role','Employee')) from generate_series(1,19) g),
 'jobs',jsonb_build_array(jsonb_build_object('no','J1','vehicle','Synthetic','reg','QA')),
 'assign',(select jsonb_agg(jsonb_build_object('id','A'||g,'emp','E'||g,'job','J1','assignedAt',1,'completed',false,'cancelled',false,'suggested',60)) from generate_series(1,19)g),
 'sessions',(select jsonb_agg(jsonb_build_object('id','S'||lpad(g::text,6,'0'),'emp','E'||(1+(g%19)),'job','J1','assignmentId','A'||(1+(g%19)),'start',10000+g,'end',20000+g,'paused',true,'reason',repeat('Synthetic-only history. ',16))) from generate_series(1,7000)g));`);
 const bytes=(await db.query('select octet_length(data::text) n from synthetic_probe')).rows[0].n;
 const trials=[];let expected;
 for(let pair=0;pair<3;pair++)for(const [name,sql] of [['before',before],['after',after]]){
  await db.exec(sql);
  const r=await db.query(`explain(analyze,buffers,format json) select public.zukait_refresh_live_status_from_state(data,1,'QA') from synthetic_probe`);
  const plan=r.rows[0]['QUERY PLAN'][0];
  const rows=(await db.query(`select to_jsonb(l)-'updated_at' r from workshop_live_status l order by employee_id`)).rows.map(x=>x.r);
  if(!expected)expected=rows;else assert.deepEqual(rows,expected,'Baseline and optimized status output must match exactly');
  const item={pair,name,execution_ms:plan['Execution Time'],temp_read_blocks:plan.Plan['Temp Read Blocks']||0,temp_written_blocks:plan.Plan['Temp Written Blocks']||0};trials.push(item);console.log(JSON.stringify(item));
 }
 const median=a=>a.slice().sort((x,y)=>x-y)[1];
 const b=trials.filter(x=>x.name==='before'),a=trials.filter(x=>x.name==='after');
 const report={engine:'Native PostgreSQL 17; synthetic only; not production latency or physical Disk IO',synthetic_bytes:bytes,employees:19,sessions:7000,work_mem_kib:2184,output_identical:true,trials,before_median_ms:median(b.map(x=>x.execution_ms)),after_median_ms:median(a.map(x=>x.execution_ms)),before_temp_written_blocks:median(b.map(x=>x.temp_written_blocks)),after_temp_written_blocks:median(a.map(x=>x.temp_written_blocks))};
 report.time_reduction_pct=(1-report.after_median_ms/report.before_median_ms)*100;
 report.temp_block_reduction_pct=report.before_temp_written_blocks?(1-report.after_temp_written_blocks/report.before_temp_written_blocks)*100:null;

 // Compare exact output and legacy error handling, not only the large fixture.
 const base={users:[{id:'E1',name:'Employee',role:'Employee'},{id:'E2',name:'Second',role:'Employee'}],jobs:[{no:'J1',vehicle:'Synthetic',reg:'QA'}],assign:[{id:'A1',emp:'E1',job:'J1',assignedAt:1,completed:false,cancelled:false,suggested:60}],sessions:[]};
 const row={id:'S1',emp:'E1',job:'J1',assignmentId:'A1',start:100};
 const fixtures=[
 ['available',base],
 ['running-missing-end',{...base,sessions:[row]}],
 ['legacy-json-null-end',{...base,sessions:[{...row,end:null}]}],
 ['legacy-empty-end',{...base,sessions:[{...row,end:''}]}],
 ['legacy-string-null-end',{...base,sessions:[{...row,end:'null'}]}],
 ['paused',{...base,sessions:[{...row,end:200,paused:true}]}],
 ['finished',{...base,sessions:[{...row,end:200,finished:true}]}],
 ['cancelled-assignment',{...base,assign:[{...base.assign[0],cancelled:true}],sessions:[row]}],
 ['completed-assignment',{...base,assign:[{...base.assign[0],completed:true}],sessions:[row]}],
 ['fallback-assignment',{...base,sessions:[{...row,assignmentId:'missing'}]}],
 ['id001',{...base,assign:[{...base.assign[0],job:'ID001'}],sessions:[{...row,job:'ID001'}]}],
 ['overtime',{...base,sessions:[{...row,overtime:true}]}],
 ['tie-order',{...base,sessions:[{...row,id:'S2',paused:false},{...row,id:'S3',overtime:true}]}],
 ['unknown-employee-invalid-date',{...base,sessions:[row,{id:'unknown',emp:'not-an-employee',job:'J1',start:'bad-date'}]}],
 ['unused-closed-invalid-date',{...base,sessions:[row,{...row,id:'closed',start:'bad-date',end:150}]}],
 ['active-invalid-date',{...base,sessions:[{...row,start:'bad-date'}]}]
 ];
 for(const [name,data] of fixtures){
  const outcomes=[];
  for(const sql of [before,after]){
   await db.exec(sql);
   try{await db.query("select public.zukait_refresh_live_status_from_state($1::jsonb,2,'QA')",[JSON.stringify(data)]);outcomes.push({rows:(await db.query("select to_jsonb(l)-'updated_at' r from workshop_live_status l order by employee_id")).rows.map(x=>x.r)});}
   catch(e){outcomes.push({error:e.message});}
  }
  assert.deepEqual(outcomes[1],outcomes[0],name+' behavior changed');
 }
 report.parity_cases=fixtures.length;console.log('PASS '+fixtures.length+' legacy, active/paused/finished, ID001, assignment and invalid-date parity cases');

 // Exercise the complete live save routine and all state guard triggers.
 const payload=(await db.query('select data from synthetic_probe')).rows[0].data;
 await db.query("insert into workshop_state(id,revision,data,updated_by) values('main',1,$1::jsonb,'QA')",[JSON.stringify(payload)]);
 const fullTrials=[];
 for(let pair=0;pair<3;pair++)for(const [label,sql] of [['before',before],['after',after]]){
  await db.exec(sql);
  const old=(await db.query("select revision,data from workshop_state where id='main'")).rows[0];
  const proposed={...old.data,syntheticAcceptanceMarker:label+'-'+pair};
  const live=(await db.query("select coalesce(jsonb_agg(to_jsonb(l)),'[]') rows from workshop_live_status l")).rows[0].rows;
  const r=await db.query('explain(analyze,buffers,wal,format json) select public.zukait_commit_workshop_state_v2($1,$2::jsonb,$3,$4::jsonb)',[old.revision,JSON.stringify(proposed),'QA',JSON.stringify(live)]);
  const plan=r.rows[0]['QUERY PLAN'][0];
  const current=(await db.query("select revision,data from workshop_state where id='main'")).rows[0];
  assert.equal(Number(current.revision),Number(old.revision)+1);assert.deepEqual(current.data,proposed,'Full save changed unrelated payload');
  assert.equal(Number((await db.query('select count(*) n from workshop_state_history where revision=$1',[old.revision])).rows[0].n),1,'Prior snapshot retained exactly once');
  fullTrials.push({pair,name:label,execution_ms:plan['Execution Time'],temp_written_blocks:plan.Plan['Temp Written Blocks']||0});
 }
 await db.exec(after);
 const snap=(await db.query("select revision,data from workshop_state where id='main'")).rows[0];
 const live=(await db.query("select coalesce(jsonb_agg(to_jsonb(l)),'[]') rows from workshop_live_status l")).rows[0].rows;
 const noop=(await db.query('select public.zukait_commit_workshop_state_v2($1,$2::jsonb,$3,$4::jsonb) r',[snap.revision,JSON.stringify(snap.data),'QA',JSON.stringify(live)])).rows[0].r;
 assert.equal(Number(noop.revision),Number(snap.revision),'Identical save must not create a revision');
 const ca=new pg.Client({...config,database:name}),cb=new pg.Client({...config,database:name});await Promise.all([ca.connect(),cb.connect()]);
 try{
  await ca.query('begin');await cb.query('begin');
  const first=(await ca.query('select public.zukait_commit_workshop_state_v2($1,$2::jsonb,$3,$4::jsonb) r',[snap.revision,JSON.stringify({...snap.data,syntheticAcceptanceMarker:'winner'}),'QA',JSON.stringify(live)])).rows[0].r;
  const waiting=cb.query('select public.zukait_commit_workshop_state_v2($1,$2::jsonb,$3,$4::jsonb) r',[snap.revision,JSON.stringify({...snap.data,syntheticAcceptanceMarker:'stale'}),'QA',JSON.stringify(live)]);
  let blocked=false;const deadline=Date.now()+5000;
  while(Date.now()<deadline){if((await db.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[cb.processID,ca.processID])).rows[0].blocked){blocked=true;break;}await new Promise(r=>setTimeout(r,20));}
  assert.ok(blocked,'Second save must wait for the first transaction lock');await ca.query('commit');
  const second=(await waiting).rows[0].r;await cb.query('rollback');
  assert.equal(first.ok,true);assert.equal(second.code,'conflict');
  const current=(await db.query("select revision,data from workshop_state where id='main'")).rows[0];assert.equal(current.data.syntheticAcceptanceMarker,'winner');assert.equal(Number(current.revision),Number(snap.revision)+1);
 }finally{await ca.query('rollback');await cb.query('rollback');await Promise.all([ca.end(),cb.end()]);}
 report.full_save_trials=fullTrials;report.concurrent_save='PASS: lock, one winner, stale revision rejected';report.identical_save_guard='PASS: revision unchanged';
 console.log('PASS native complete-save triggers, history preservation, identical-save guard and overlapping-device CAS protection');
 fs.mkdirSync('artifacts/traffic-performance',{recursive:true});fs.writeFileSync('artifacts/traffic-performance/live-status-native-acceptance.json',JSON.stringify(report,null,2)+'\n');console.log('RESULT '+JSON.stringify(report));
}finally{await db.close();}
