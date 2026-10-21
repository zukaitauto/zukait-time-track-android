import fs from 'node:fs';
import assert from 'node:assert/strict';
const file=process.env.WORKSHOP_RELIABILITY_SOURCE||'supabase/functions/workshop-api/index.ts';
const source=fs.readFileSync(file,'utf8');
const start=source.indexOf('    if (action === "save") {');
const block=source.slice(start,source.indexOf('    if (action === "backup") {',start));
// Run the actual save route, keeping its authority order and CAS calls.
const {stripTypeScriptTypes}=await import('node:module');
const stripBody=body=>{const text=stripTypeScriptTypes('async function fixture(){\n'+body+'\n}',{mode:'strip'});return text.slice(text.indexOf('{')+1,text.lastIndexOf('}'));};
const code=stripBody(block);
const preserve=['preservePaintPurchasingHistory','preserveConsumablesHistory','preserveOperationalHistory','reconcileAutoOvertime','preserveClosedSessions','preserveEstimateHistory','preserveLeaveAuthority','preserveManagerTimeAuthority','preserveAuthoritativeReopens','preserveJobTypeAuthority','preserveReceptionPromiseAuthority','preserveJobEditAuthority','preserveQcAuthority','reconcilePaintOrderCosts'];
const args=['action','body','admin','user','reply','cloneValue','threeWayMerge','baseStateForRevision',...preserve,'validateConsumablesManagerCorrections','validatePaintManagerCorrections','paintOrderRules','computeLiveStatus','same','Date','id001AssignmentConflict'];
const run=new (Object.getPrototypeOf(async function(){}).constructor)(...args,code);
async function scenario(mode){
 let reads=0,commits=0,at=0;const original={jobs:[{no:'QA1'}],users:[],assign:[]};
 const admin={from:table=>{assert.equal(table,'workshop_state');return {select:()=>({eq:()=>({single:async()=>{reads++;return {data:{revision:1,data:structuredClone(original)}}}})})}},rpc:async(name,params)=>{assert.equal(name,'zukait_commit_workshop_state_v2');assert.equal(params.p_expected_revision,1);commits++;if(mode==='slow')at+=6000;return {data:mode==='success'?{ok:true,revision:2}:{ok:false,code:'conflict'}}}};
 const result=await run('save',{expected_revision:1,data:original},admin,{id:'QA_MANAGER',role:'Manager'},(body,status=200)=>({body,status}),structuredClone,(_base,_current,proposed)=>proposed,async()=>original,...preserve.map(()=>x=>x),()=>null,()=>null,{validateNewOrders:()=>null},()=>[],(a,b)=>JSON.stringify(a)===JSON.stringify(b),{now:()=>at},()=>null);
 return {result,reads,commits};
}
let r=await scenario('conflict');assert.equal(r.commits,3);assert.equal(r.reads,3);assert.equal(r.result.body.code,'conflict_busy');assert.equal(r.result.body.retryable,true);assert.equal(r.result.body.retry_after_ms,3000);
r=await scenario('slow');assert.equal(r.commits,1,'do not start another expensive rebase after the time budget');
r=await scenario('success');assert.equal(r.commits,1);assert.equal(r.result.body.ok,true);assert.equal(r.result.body.server_revision,2);assert.equal(r.result.body.attempts,1);
for(const name of preserve)assert.ok(code.includes(name),'authority preserved: '+name);
const catchBlock=source.slice(source.lastIndexOf('  } catch (e) {'));
const busy=catchBlock.slice(catchBlock.indexOf('    const databaseCode'),catchBlock.indexOf('\n  }\n});'));
const handle=new Function('e','reply',stripBody(busy));
for(const errorCode of ['57014','55P03','53300','53400','PGRST003']){const result=handle({code:errorCode},(body,status)=>({body,status}));assert.equal(result.status,503);assert.equal(result.body.code,'database_busy');assert.equal(result.body.retry_after_ms,5000);}
assert.equal(handle({code:'23505'},(body,status)=>({body,status})).status,500,'unrelated failures must not be mislabeled as database pressure');
console.log('PASS: real save route bounds conflicting/slow rebases, preserves CAS and authorities, and classifies database pressure as retryable.');
