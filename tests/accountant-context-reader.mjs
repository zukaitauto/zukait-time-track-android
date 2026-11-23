import {accountantApi} from '../supabase/functions/workshop-api/accountant/api.js';
import {fixture} from './accountant-finance.mjs';
import assert from 'node:assert/strict';import {createAccountantContextReader} from '../supabase/functions/workshop-api/accountant/context_reader.js';
const actor={id:'A',role:'Accountant'},opts={enabled:true,project:'isolated-project',readOnly:true};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const context=()=>({state:{jobs:[{no:'QA',amount:1}]},revision:1,finance_revision:0,events:[],entries:[]});
function backend({snapshot='10:10:',database='1',instance='1.0',gate=null,error=null}={}){const calls={probe:0,full:0};return {calls,rpc:async(name,args)=>{if(name==='zukait_accountant_read_snapshot'){calls.probe++;return {data:{actor_id:args.p_actor_id,role:args.p_actor_id==='M'?'Manager':'Accountant',snapshot,database,instance},error:null}}assert.equal(name,'zukait_accountant_context');calls.full++;if(gate)await gate.promise;return {data:context(),error}}}}
const drain=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
{
 const read=createAccountantContextReader(),gate=deferred(),admin=backend({gate});const requests=Array.from({length:20},()=>read(admin,actor,opts));await drain();assert.equal(admin.calls.probe,19);assert.equal(admin.calls.full,2);gate.resolve();const results=await Promise.all(requests);assert.ok(results.slice(1).every(x=>x===results[1]));assert.throws(()=>results[1].state.jobs.push({}),TypeError);await read(admin,actor,opts);assert.equal(admin.calls.full,3,'completed reads are never cached');assert.equal(admin.calls.probe,19,'ordinary sequential reads add no probe');
}
{
 const read=createAccountantContextReader(),gate=deferred();const one=backend({gate}),changed=backend({gate,snapshot:'11:11:'}),otherDb=backend({gate,database:'2'}),restarted=backend({gate,instance:'2.0'});
 const requests=[read(one,actor,opts),read(changed,actor,opts),read(otherDb,actor,opts),read(restarted,actor,opts),read(one,{id:'M',role:'Manager'},opts),read(one,actor,{...opts,project:'another-project'})];await drain();assert.equal(one.calls.full,3);assert.equal(changed.calls.full,1);assert.equal(otherDb.calls.full,1);assert.equal(restarted.calls.full,1);gate.resolve();await Promise.all(requests);
}
{
 const read=createAccountantContextReader(),admin=backend();await read(admin,actor);await read(admin,actor,{...opts,readOnly:false});assert.deepEqual(admin.calls,{probe:0,full:2},'flag-off and write paths remain unchanged');
 const gate=deferred(),blocker=backend({gate});const first=read(blocker,actor,opts);await drain();
 for(const invalid of [null,{actor_id:'OTHER',role:'Accountant',database:'1',instance:'1.0',snapshot:'1:1:'},{actor_id:'A',role:'Manager',database:'1',instance:'1.0',snapshot:'1:1:'},{actor_id:'A',role:'Accountant',database:'1',instance:'1.0',snapshot:'invalid'}])await assert.rejects(read({rpc:async()=>({data:invalid})},actor,opts),/snapshot_invalid/);
 await assert.rejects(read({rpc:async()=>({error:Error('probe unavailable')})},actor,opts),/probe unavailable/);
 gate.resolve();await first;
}
{
 const read=createAccountantContextReader(),gate=deferred(),failure=Error('upstream unavailable'),admin=backend({gate,error:failure});const requests=[read(admin,actor,opts),read(admin,actor,opts)];await drain();assert.equal(admin.calls.full,2);gate.resolve();const results=await Promise.allSettled(requests);assert.ok(results.every(x=>x.status==='rejected'&&x.reason===failure));const good=backend();await read(good,actor,opts);assert.equal(good.calls.full,1,'failed load is removed');
}
{
 const read=createAccountantContextReader({maxInFlight:1}),gate=deferred(),admin=backend({gate});const one=read(admin,actor,opts);await drain();const two=read(admin,{id:'M',role:'Manager'},opts);await drain();assert.equal(admin.calls.full,2,'capacity overflow loads directly rather than queueing or sharing another actor');gate.resolve();await Promise.all([one,two]);
}
console.log('PASS 20 overlapping reads → 2 full loads; sequential reads keep the original single-RPC path; followers probe; no completed cache; actor/role/project/database/snapshot isolation, immutable shared data, commands/flag-off bypass, errors and capacity limits.');

// Rich source fixture includes parts events, paint/returns, actual materials, duty
// sessions, invoices and receipts: frozen shared input must remain read-only.
{
 const source=fixture(),before=JSON.stringify(source),now=Date.parse('2026-10-12T08:00Z');
 const admin={rpc:async(name,args)=>({error:null,data:name==='zukait_accountant_context'?source:{actor_id:args.p_actor_id,role:args.p_actor_id==='M'?'Manager':'Accountant',database:'1',instance:'1.0',snapshot:'10:10:'}})};
 await Promise.all([1,2].map(()=>accountantApi(admin,{id:'A',role:'Accountant'},{action:'accountant_dashboard'},'QA-ONLY',now,{coalesceContextReads:true,contextProject:'rich-fixture'})));assert.equal(Object.isFrozen(source.state.jobs),true);
 for(const actor of [{id:'A',role:'Accountant'},{id:'M',role:'Manager'}])for(const report of ['jobs','cash','cash_invoices','parts','paint','consumables','outstanding','monthly','accounts_performance','accounts_leave']){
  const body={action:'accountant_report',report,filters:{month:'2026-10'},offset:0,limit:25};
  const old=await accountantApi(admin,actor,body,'QA-ONLY',now);const next=await accountantApi(admin,actor,body,'QA-ONLY',now,{coalesceContextReads:true,contextProject:'rich-fixture'});assert.equal(next.status,200);assert.deepEqual(next,old);
 }
 for(const actor of [{id:'A',role:'Accountant'},{id:'M',role:'Manager'}])for(const body of [{action:'accountant_dashboard'},{action:'accountant_jc_search',query:'Toyota'},{action:'accountant_jc_detail',job_card:'J1'},...(actor.role==='Manager'?[{action:'accountant_report',report:'manager_profit',filters:{month:'2026-10'}}]:[])]){
  const ordinary=await accountantApi(admin,actor,body,'QA-ONLY',now);const optimized=await accountantApi(admin,actor,body,'QA-ONLY',now,{coalesceContextReads:true,contextProject:'rich-fixture'});assert.equal(optimized.status,200);assert.deepEqual(optimized,ordinary);
 }
 assert.equal(JSON.stringify(source),before);
}
console.log('PASS both-role reports on immutable rich parts/paint/material/session/invoice/receipt fixture.');
