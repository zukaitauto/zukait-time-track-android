import fs from 'node:fs';
import assert from 'node:assert/strict';
import {sharedWorkshopSections} from '../supabase/functions/workshop-api/extensions/shared_workshop_sections.js';
import {jobEditSaveMode,jobEditWireState,COMPACT_JOB_EDIT_MODE} from '../supabase/functions/workshop-api/extensions/job_edit_archive_wire.js';
import {reconcileCompactJobEditAudit} from '../supabase/functions/workshop-api/extensions/compact_job_edit_audit.js';
const file=process.env.WORKSHOP_RELIABILITY_SOURCE||'supabase/functions/workshop-api/index.ts';
const source=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
const marker='// FINAL_SESSION_STATUS_BEGIN';
const normalizeCompletedSessionStatuses=source.includes(marker)
 ? new Function(source.split(marker)[1].split('// FINAL_SESSION_STATUS_END')[0]+';return normalizeCompletedSessionStatuses;')()
 : data=>data;
const start=source.indexOf('    if (action === "save") {');
const block=source.slice(start,source.indexOf('    if (action === "backup") {',start));
// Run the actual save route, keeping its authority order and CAS calls.
const {stripTypeScriptTypes}=await import('node:module');
const stripBody=body=>{const text=stripTypeScriptTypes('async function fixture(){\n'+body+'\n}',{mode:'strip'});return text.slice(text.indexOf('{')+1,text.lastIndexOf('}'));};
const code=stripBody(block);
const preserve=['preservePaintPurchasingHistory','preserveConsumablesHistory','preserveOperationalHistory','reconcileAutoOvertime','preserveClosedSessions','preserveEstimateHistory','preserveLeaveAuthority','preserveManagerTimeAuthority','preserveAuthoritativeReopens','preserveJobTypeAuthority','preserveReceptionPromiseAuthority','preserveJobEditAuthority','preserveQcAuthority','reconcilePaintOrderCosts'];
const args=['action','body','admin','user','reply','cloneValue','threeWayMerge','baseStateForRevision',...preserve,'validateConsumablesManagerCorrections','validatePaintManagerCorrections','paintOrderRules','computeLiveStatus','same','Date','id001AssignmentConflict','normalizeCompletedSessionStatuses','Deno','sharedWorkshopSections','jobEditSaveMode','jobEditWireState','COMPACT_JOB_EDIT_MODE','prefixReader','legacyWire','reconcileCompactJobEditAudit'];
const run=new (Object.getPrototypeOf(async function(){}).constructor)(...args,code);
async function scenario(mode,production=false){
 let reads=0,commits=0,at=0;const original={jobs:[{no:'QA1'}],users:[],assign:[],sublets:[],subletAudit:[]};
 const admin={from:table=>{assert.equal(table,'workshop_state');return {select:()=>({eq:()=>({single:async()=>{reads++;return {data:{revision:1,data:structuredClone(original)}}}})})}},rpc:async(name,params)=>{assert.equal(name,production?'zukait_commit_workshop_state_sections':'zukait_commit_workshop_state_v2');if(production){assert.deepEqual(params.p_sections,{});assert.deepEqual(params.p_removed,[]);assert.equal('p_data' in params,false);}assert.equal(params.p_expected_revision,1);commits++;if(mode==='slow')at+=6000;return {data:mode==='success'?{ok:true,revision:2}:{ok:false,code:'conflict'}}}};
 const result=await run('save',{expected_revision:1,data:original},admin,{id:'QA_MANAGER',role:'Manager'},(body,status=200)=>({body,status}),structuredClone,(_base,_current,proposed)=>proposed,async()=>original,...preserve.map(()=>x=>x),()=>null,()=>null,{validateNewOrders:()=>null},()=>[],(a,b)=>JSON.stringify(a)===JSON.stringify(b),{now:()=>at},()=>null,normalizeCompletedSessionStatuses,{env:{get:k=>production&&k==='SUPABASE_URL'?'https://pjknotnjkufadqavcmii.supabase.co':undefined}},sharedWorkshopSections,jobEditSaveMode,jobEditWireState,COMPACT_JOB_EDIT_MODE,async()=>{throw Error('unexpected archive read')},async data=>data,reconcileCompactJobEditAudit);
 return {result,reads,commits};
}
let r=await scenario('conflict');assert.equal(r.commits,3);assert.equal(r.reads,3);assert.equal(r.result.body.code,'conflict_busy');assert.equal(r.result.body.retryable,true);assert.equal(r.result.body.retry_after_ms,3000);
r=await scenario('slow');assert.equal(r.commits,1,'do not start another expensive rebase after the time budget');
r=await scenario('success');assert.equal(r.commits,1);assert.equal(r.result.body.ok,true);assert.equal(r.result.body.server_revision,2);assert.equal(r.result.body.attempts,1);
r=await scenario('success',true);assert.equal(r.commits,1);assert.equal(r.result.body.ok,true);
r=await scenario('conflict',true);assert.equal(r.commits,3);assert.equal(r.result.body.code,'conflict_busy');
// Exercise the real save route in both wire representations; DB and unrelated
// business authorities are mocked. The previous revision must remain exact.
const a={job:'QA1',at:1},b={job:'QA1',at:2},c={job:'QA1',at:3},d={job:'QA1',at:4};
const full={jobs:[{no:'QA1'}],assign:[],users:[],sublets:[],subletAudit:[],jobEdits:[a,b]};
const compact={...full,jobEditArchive:{snapshotRevision:1,prefixCount:1},jobEdits:[b,c]};
async function archivedSave({proposed,base=full,current=compact,revision=3,expected=2,capability=false}){
 let writes=0,stored=null;
 const prefixReader=async(rev,n)=>{assert.equal(rev,1);assert.equal(n,1);return {ok:true,snapshotRevision:1,prefixCount:1,entries:[a]}};
 const legacyWire=data=>jobEditWireState(data,false,prefixReader);
 const admin={from:()=>({select:()=>({eq:()=>({single:async()=>({data:{revision,data:structuredClone(current)}})})})}),
 rpc:async(name,p)=>{if(name==='zukait_job_edit_legacy_current'){assert.equal(p.p_expected_revision,revision);return {data:{ok:true,revision,jobEdits:[a,...current.jobEdits]}}}assert.equal(name,'zukait_commit_workshop_state_v2');assert.equal(p.p_expected_revision,revision);writes++;stored=p.p_data;return {data:{ok:true,revision:revision+1}}}};
 const result=await run('save',{expected_revision:expected,data:proposed,...(capability?{job_edit_sync_mode:'compact-v1'}:{})},admin,{id:'QA_MANAGER',role:'Manager'},(body,status=200)=>({body,status}),structuredClone,(_base,_current,p)=>structuredClone(p),async()=>base,...preserve.map(()=>x=>x),()=>null,()=>null,{validateNewOrders:()=>null},()=>[],(a,b)=>JSON.stringify(a)===JSON.stringify(b),{now:()=>0},()=>null,normalizeCompletedSessionStatuses,{env:{get:()=>undefined}},sharedWorkshopSections,jobEditSaveMode,jobEditWireState,COMPACT_JOB_EDIT_MODE,prefixReader,legacyWire,reconcileCompactJobEditAudit);
 return {result,writes,stored};
}
let ar=await archivedSave({proposed:{...full,jobEdits:[a,b,d]}});
assert.equal(ar.result.body.ok,true);assert.deepEqual(ar.stored.jobEdits,[b,c,d]);assert.deepEqual(ar.result.body.data.jobEdits,[a,b,c,d]);assert.equal(ar.result.body.data.jobEditArchive,undefined);
ar=await archivedSave({proposed:{...compact,jobEdits:[b,d]},base:{...compact,jobEdits:[b]},capability:true});
assert.equal(ar.result.body.ok,true);assert.deepEqual(ar.stored.jobEdits,[b,c,d]);assert.deepEqual(ar.result.body.data.jobEdits,[b,c,d]);assert.deepEqual(ar.result.body.data.jobEditArchive,compact.jobEditArchive);
ar=await archivedSave({proposed:{...full,jobEdits:[a,b,c]},expected:3});assert.equal(ar.result.body.ok,true);assert.deepEqual(ar.stored.jobEdits,[b,c]);
ar=await archivedSave({proposed:{...full,jobEdits:[a,b,c]}});assert.equal(ar.result.body.code,'audit_replay_ambiguous');assert.equal(ar.writes,0);
ar=await archivedSave({proposed:compact,current:full,capability:true});assert.equal(ar.result.body.code,'audit_refresh_required');assert.equal(ar.writes,0);
ar=await archivedSave({proposed:compact,base:null,capability:true});assert.equal(ar.result.body.code,'audit_refresh_required');assert.equal(ar.writes,0);
console.log('PASS: legacy and compact save/rebase, receipt representation, ambiguous replay, missing base, and restored-state rejection.');
for(const name of preserve)assert.ok(code.includes(name),'authority preserved: '+name);
const catchBlock=source.slice(source.lastIndexOf('  } catch (e) {'));
const busy=catchBlock.slice(catchBlock.indexOf('    const databaseCode'),catchBlock.indexOf('\n  }\n});'));
const handle=new Function('e','reply',stripBody(busy));
for(const errorCode of ['57014','55P03','53300','53400','PGRST003']){const result=handle({code:errorCode},(body,status)=>({body,status}));assert.equal(result.status,503);assert.equal(result.body.code,'database_busy');assert.equal(result.body.retry_after_ms,5000);}
assert.equal(handle({code:'23505'},(body,status)=>({body,status})).status,500,'unrelated failures must not be mislabeled as database pressure');
console.log('PASS: real save route bounds conflicting/slow rebases, preserves CAS and authorities, and classifies database pressure as retryable.');
