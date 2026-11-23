import fs from 'node:fs';import assert from 'node:assert/strict';import {accountantReadDb} from './helpers/accountant-read-db.mjs';import {sqlAdmin} from './helpers/accountant-admin.mjs';import {accountantApi} from '../supabase/functions/workshop-api/accountant/api.js';import {createAccountantContextReader} from '../supabase/functions/workshop-api/accountant/context_reader.js';
const {db,native,connect}=await accountantReadDb();let writer;
try{
 await db.exec(fs.readFileSync('experiments/accountant-read-coalescing/probe.sql','utf8'));
 const base=sqlAdmin(db),user={id:'A',role:'Accountant'},settings={enabled:true,readOnly:true,project:'isolated-primary'},services={coalesceContextReads:true,contextProject:'isolated-primary'},now=Date.parse('2026-10-12T08:00Z');
 const token=async actor=>(await base.rpc('zukait_accountant_read_snapshot',{p_actor_id:actor}));
 const before=(await token('A')).data;assert.equal(before.actor_id,'A');assert.equal(before.role,'Accountant');assert.match(before.snapshot,/^\d+:\d+:[\d,]*$/);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);const r=await token('A');assert.ok(r.error);await db.exec('reset role')}
 await assert.rejects(db.query('select zukait_accountant_read_snapshot($1::text)',[null]),/accountant_forbidden/);
 for(const id of ['E','UNKNOWN'])assert.match((await token(id)).error.message,/accountant_forbidden/);
 await db.exec("insert into staff_credentials(user_id,role,active,must_change) values('OFF','Accountant',false,false),('CHANGE','Accountant',true,true)");for(const id of ['OFF','CHANGE'])assert.match((await token(id)).error.message,/accountant_forbidden/);
 // Only tiny keys/role are returned; never account passwords or financial context.
 assert.deepEqual(Object.keys(before).sort(),['actor_id','database','instance','role','snapshot']);
 const reports=['jobs','cash','cash_invoices','parts','paint','consumables','outstanding','monthly','accounts_performance','accounts_leave'];
 for(const actor of [user,{id:'M',role:'Manager'}])for(const report of reports){const body={action:'accountant_report',report,filters:{month:'2026-10'},offset:0,limit:25};const ordinary=await accountantApi(base,actor,body,'QA-ONLY',now);const optimized=await accountantApi(base,actor,body,'QA-ONLY',now,services);assert.equal(optimized.status,200,report);assert.deepEqual(optimized,ordinary)}
 let calls={probe:0,full:0};let release;const gate=new Promise(resolve=>release=resolve);let loaded;const observed={...base,rpc:async(name,args)=>{calls[name==='zukait_accountant_context'?'full':'probe']++;const r=await base.rpc(name,args);if(name==='zukait_accountant_context'){loaded?.();await gate}return r}};
 const body={action:'accountant_report',report:'cash',filters:{month:'2026-10'}};
 const burst=Array.from({length:20},()=>accountantApi(observed,user,body,'QA-ONLY',now,services));
 // Wait for all real SQL probes, while holding the one full result in flight.
 const until=Date.now()+15000;while(calls.probe<19||calls.full<2){assert.ok(Date.now()<until,'probe barrier timed out');await new Promise(r=>setTimeout(r,5))}
 // Ensure probe promises have settled through the SQL client queue.
 await db.query('select 1');await new Promise(r=>setTimeout(r,10));release();const result=await Promise.all(burst);assert.ok(result.every(x=>x.status===200));assert.equal(calls.full,2);assert.equal(calls.probe,19);
 // Ledger-only, events-only and snapshot updates must invalidate the visibility token.
 let previous=(await token('A')).data.snapshot;
 for(const sql of ["insert into workshop_accounting_entries(id,request_id,actor_id,kind,transaction_date,amount,payment_method,payee,reason) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','A','CASH_IN','2026-10-01',1,'CASH','QA','fixture')","insert into workshop_v2_events values('QA-E','QA-P','SPARE_PART_LISTED',1,now(),'{}')","update workshop_state set revision=revision+1 where id='main'"]){await db.exec(sql);const next=(await token('A')).data.snapshot;assert.notEqual(next,previous);previous=next}
 if(native){
  writer=await connect();await writer.query('begin');await writer.query("update workshop_state set data=jsonb_set(data,'{jobs,0,finalInvoiceAmount}','222') where id='main'");
  const during=(await token('A')).data.snapshot;const read=createAccountantContextReader();let fullReads=0,held;const started=new Promise(r=>held=r);let finish;const hold=new Promise(r=>finish=r);
  const heldAdmin={rpc:async(name,args)=>{const r=await base.rpc(name,args);if(name==='zukait_accountant_context'){fullReads++;if(fullReads===2)held();if(fullReads<=2)await hold}return r}};
  const first=read(heldAdmin,user,settings);const older=read(heldAdmin,user,settings);await started;await writer.query('commit');const after=(await token('A')).data.snapshot;assert.notEqual(after,during,'commit of an already-active XID changes snapshot visibility');const newer=await read(heldAdmin,user,settings);assert.equal(newer.state.jobs[0].finalInvoiceAmount,222);finish();assert.equal((await older).state.jobs[0].finalInvoiceAmount,100);await first;assert.equal(fullReads,3,'post-commit reader never joins the older pending context');
  await writer.end();writer=null;
 }
 // Existing financial command behavior bypasses the new probe entirely.
 let commandProbes=0;const commandDb={...base,rpc:async(name,args)=>{if(name==='zukait_accountant_read_snapshot')commandProbes++;return base.rpc(name,args)}};const ctx=(await base.rpc('zukait_accountant_context',{p_actor_id:'A'})).data;
 const response=await accountantApi(commandDb,user,{action:'accountant_command',request_id:'30000000-0000-4000-8000-000000000001',command:{operation:'POST',kind:'CASH_IN',job_card:'J1',transaction_date:'2026-10-01',amount:'2.000',payment_method:'BANK',payee:'Fixture',reference:'READ-COALESCING-QA',reason:'Isolated fixture',expected_snapshot_revision:ctx.revision,expected_finance_revision:ctx.finance_revision}},'QA-ONLY',now,services);assert.equal(response.status,200);assert.equal(commandProbes,0);
 const evidence={nativePostgres17:native,concurrentRequests:20,fullLoads:2,probeRequests:19,completedContextsRetained:0,financialReportsPerRole:10,productionSavingsMeasured:false};if(native){fs.mkdirSync('artifacts/accountant-read-coalescing',{recursive:true});fs.writeFileSync('artifacts/accountant-read-coalescing/qualification.json',JSON.stringify(evidence,null,2)+'\n')}console.log('PASS '+JSON.stringify(evidence)+'; real SQL role permissions, financial equality, ledger/event/snapshot invalidation, command bypass'+(native?', active-transaction commit isolation':''));
}finally{if(writer){await writer.query('rollback');await writer.end()}await db.close()}
