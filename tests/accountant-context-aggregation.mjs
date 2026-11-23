// Isolated PostgreSQL/PGlite only. No remote project URL, production data or credentials.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {accountantApi} from '../supabase/functions/workshop-api/accountant/api.js';
const native=process.env.ACCOUNTANT_CONTEXT_NATIVE==='1';let db,client,admin,database;
const root='experiments/accountant-context/',baseline=fs.readFileSync(root+'baseline.sql','utf8'),candidate=fs.readFileSync(root+'candidate.sql','utf8');
try{
 if(native){
  const {default:pg}=await import('pg');const host=process.env.PGHOST||'127.0.0.1';assert.ok(['127.0.0.1','localhost','::1'].includes(host),'Loopback only');
  const cfg={host,port:Number(process.env.PGPORT||5432),user:'postgres',password:process.env.PGPASSWORD};admin=new pg.Client({...cfg,database:'postgres'});await admin.connect();database='accountant_context_'+randomUUID().replaceAll('-','');await admin.query('create database "'+database+'"');client=new pg.Client({...cfg,database});await client.connect();db={exec:s=>client.query(s),query:(...args)=>client.query(...args)};
  const v=Number((await db.query('show server_version_num')).rows[0].server_version_num);assert.ok(v>=170000&&v<180000,'PostgreSQL17 required');
  for(const r of ['anon','authenticated','service_role'])if(!(await db.query('select 1 from pg_roles where rolname=$1',[r])).rows.length)await db.exec('create role '+r+' nologin'+(r==='service_role'?' bypassrls':''));
  const helper=fs.readFileSync('tests/helpers/accountant-db.mjs','utf8');const bootstrap=helper.slice(helper.indexOf('await db.exec(`')+15,helper.indexOf('`);'));
  await db.exec(bootstrap.replace(/create role (anon|authenticated|service_role)[^;]*;/g,''));
  for(const file of ['20261017195634_accountant_financial_ledger.sql','20261017202257_accountant_lpo_audit.sql','20261018092000_accountant_append_only_grants.sql','20261018093000_accountant_append_only_corrections.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 }else{const {accountantDb}=await import('./helpers/accountant-db.mjs');db=await accountantDb()}
 const applyBaseline=()=>db.exec('drop index if exists public.workshop_v2_events_accountant_order_idx;'+baseline);
 const applyCandidate=()=>db.exec('drop index if exists public.workshop_v2_events_accountant_order_idx;'+candidate);
 await db.exec('create unique index if not exists workshop_v2_events_pkey on workshop_v2_events(event_id)');
 const value=async actor=>(await db.query('select zukait_accountant_context($1) as value',[actor])).rows[0].value;
 const permissions=async()=> (await db.query("select proowner::regrole::text as owner,prosecdef,proconfig,proacl::text as acl from pg_proc where oid='public.zukait_accountant_context(text)'::regprocedure")).rows[0];
 const originalPermissions=await permissions();await applyBaseline();const baselineMd5=(await db.query("select md5(pg_get_functiondef('public.zukait_accountant_context(text)'::regprocedure)) as hash")).rows[0].hash;const initial=await value('A');assert.deepEqual(initial.entries,[]);assert.deepEqual(initial.events,[]);await applyCandidate();assert.deepEqual(await value('A'),initial);
 await db.exec(`insert into staff_credentials(user_id,role,active,must_change) values ('OFF','Accountant',false,false),('CHANGE','Accountant',true,true);
 insert into workshop_accounting_entries(id,request_id,actor_id,kind,job_card,transaction_date,amount,payment_method,payee,reason) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','A','CASH_IN','J1','2026-10-01',20.123,'CASH','QA','Fixture'),('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','A','CASH_OUT','J1','2026-10-02',1.001,'CASH','QA','Fixture');
 insert into workshop_v2_events(event_id,entity_id,event_type,revision,server_time,payload) values
 ('z','part1','SPARE_PART_LISTED',1,'2026-10-01T08:00Z','{"listNo":"PL1","jobCard":"J1","name":"Lamp","qty":2}'),
 ('a','part2','SPARE_PART_LISTED',2,'2026-10-01T08:00Z','{"listNo":"PL1","jobCard":"J1","name":"Mirror","qty":1}'),
 ('old','part0','SPARE_PART_LISTED',3,'2026-09-30T08:00Z','{"jobCard":"J1","name":"First","qty":1}'),
 ('null-time','part3','SPARE_PART_LISTED',4,null,'{}'),
 ('not-part','other','OTHER_EVENT',5,'2026-09-29T08:00Z','{"notIncluded":true}');`);
 await applyBaseline();const expected=await value('A');assert.deepEqual(expected.events.map(e=>e.event_id),['old','a','z','null-time']);
 const inputBefore=JSON.stringify(expected);
 await applyCandidate();assert.deepEqual(await value('A'),expected);assert.deepEqual(await value('M'),expected);assert.deepEqual(await permissions(),originalPermissions);
 for(const actor of ['E','OFF','CHANGE','MISSING',null])await assert.rejects(value(actor),/accountant_forbidden/);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(value('A'),/permission denied/);await db.exec('reset role')}
 await db.exec('set role service_role');assert.deepEqual(await value('A'),expected);await db.exec('reset role');
 const now=Date.parse('2026-10-12T08:00Z'),user={id:'A',role:'Accountant'};
 const project=async()=>{
  const apiDb={rpc:async name=>{assert.equal(name,'zukait_accountant_context');return {data:await value('A'),error:null}}};const output=[];
  for(const report of ['jobs','cash','cash_invoices','paint','parts','consumables','outstanding','monthly','accounts_performance','accounts_leave']){const r=await accountantApi(apiDb,user,{action:'accountant_report',report,filters:{month:'2026-10'},offset:0,limit:25},'QA-NOT-PRODUCTION',now);assert.equal(r.status,200,report+' must succeed');assert.equal(r.body.ok,true);output.push(r)}return output;
 };
 await applyBaseline();const financialBefore=await project();await applyCandidate();assert.deepEqual(await project(),financialBefore);assert.equal(JSON.stringify(await value('A')),inputBefore);
 await db.exec("delete from workshop_state where id='main'");await assert.rejects(value('A'),/snapshot_unavailable/);await db.exec("insert into workshop_state values('main','{\"jobs\":[]}',2,now(),'M')");
 console.log('PASS empty/nonempty contexts, deterministic event ties and null times, unchanged ledger order and all fields, role denials, ACL/owner/invoker/search_path, missing snapshot, ten financial reports and immutable source.');
 if(native){
  await db.exec("set work_mem='3500kB';set jit=off;create index workshop_v2_events_type_server_idx on workshop_v2_events(event_type,server_time desc,event_id desc);");
  const metrics=[];const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
  for(const count of [2000,10000]){
   await db.exec("truncate workshop_v2_events");
   await db.query(`insert into workshop_v2_events select 'event-'||lpad(g::text,8,'0'),'part-'||g,'SPARE_PART_LISTED',g,'2026-10-01'::timestamptz+((g%97)||' seconds')::interval,jsonb_build_object('jobCard','J1','name','Fixture','notes',(select string_agg(md5(g::text||'-'||j::text),'') from generate_series(1,48) j)) from generate_series(1,$1::integer) g`,[count]);await db.exec('analyze workshop_v2_events');
   const checks=[],cases={};
   for(const [label,sql] of [['baseline',baseline],['candidate',candidate]]){
    if(label==='baseline')await applyBaseline();else await applyCandidate();checks.push((await db.query("select md5(zukait_accountant_context('A')::text) as checksum")).rows[0].checksum);
    const samples=[];for(let i=0;i<5;i++){
     const plan=(await db.query("explain(analyze,buffers,format json,timing off) select jsonb_typeof(zukait_accountant_context('A'))")).rows[0]['QUERY PLAN'][0];samples.push({ms:plan['Execution Time'],temp:plan.Plan['Temp Written Blocks']||0});
    }
    cases[label]={medianMs:median(samples.map(x=>x.ms)),medianTempBlocks:median(samples.map(x=>x.temp)),samples};
   }
   assert.equal(checks[0],checks[1],'large fixture exact context equality');metrics.push({events:count,workMem:'3500kB',...cases});
  }
  console.log(JSON.stringify(metrics));
  const largest=metrics.at(-1);assert.ok(largest.baseline.medianTempBlocks>0,'baseline spill required for meaningful benchmark');assert.ok(largest.candidate.medianTempBlocks<largest.baseline.medianTempBlocks/2,'candidate must at least halve spill');
  fs.mkdirSync('artifacts/accountant-context',{recursive:true});fs.writeFileSync('artifacts/accountant-context/qualification.json',JSON.stringify({synthetic:true,productionSavingsVerified:false,baselineMd5,candidateMd5:(await db.query("select md5(pg_get_functiondef('public.zukait_accountant_context(text)'::regprocedure)) as hash")).rows[0].hash,sourceCommit:process.env.GITHUB_SHA||null,metrics},null,2)+'\n');console.log(JSON.stringify(metrics));
 }
}finally{if(native){if(client)await client.end();if(admin){if(database)await admin.query('drop database "'+database+'"');await admin.end()}}else if(db)await db.close()}
