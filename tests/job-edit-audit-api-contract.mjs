import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const start=source.indexOf('    if (action === "job_edit_audit_page" || action === "job_edit_audit_all_page") {');
const end=source.indexOf('    // Separate, default-off audited costing route.',start);
assert.ok(start>=0&&end>start);
assert.ok(source.lastIndexOf('if (!user) return reply({ ok: false, code: "invalid_session" }, 401);',start)>=0);
const route=new (Object.getPrototypeOf(async function(){}).constructor)('action','user','body','admin','reply',source.slice(start,end));
let calls=[],response={data:{ok:true,revision:7,rows:[],next_position:null}};
const admin={rpc:async(name,args)=>{calls.push({name,args});return response}};
const reply=(body,status=200)=>({body,status});
const run=(role,body)=>route(body.action,{role},body,admin,reply);
for(const role of ['Employee','Supervisor','Receptionist','Accountant','Purchaser','Mechanical Supervisor','Unknown']){
 for(const action of ['job_edit_audit_page','job_edit_audit_all_page']){
  const before=calls.length;const r=await run(role,{action,jobCard:'JC1'});assert.equal(r.status,403);assert.equal(calls.length,before);
 }
}
const all='job_edit_audit_all_page',job='job_edit_audit_page';
for(const body of [{action:all,jobCard:'JC1'},{action:all,limit:101},{action:all,before_position:4},{action:all,expected_revision:-1},{action:job,jobCard:''},{action:job,jobCard:'JC1',limit:0}]){
 const before=calls.length;assert.equal((await run('Manager',body)).status,400);assert.equal(calls.length,before);
}
assert.equal((await run('Manager',{action:all,limit:25})).status,200);
assert.deepEqual(calls.at(-1),{name:'zukait_job_edit_all_page',args:{p_before_position:null,p_limit:25,p_expected_revision:null}});
assert.equal((await run('Manager',{action:job,jobCard:' jc1 ',before_position:5,expected_revision:7})).status,200);
assert.deepEqual(calls.at(-1),{name:'zukait_job_edit_current_page',args:{p_job_no:'JC1',p_before_position:5,p_limit:50,p_expected_revision:7}});
response={data:{ok:false,code:'audit_revision_changed',revision:8}};
assert.equal((await run('Manager',{action:all})).status,409);
response={error:{message:'db unavailable'}};
assert.equal((await run('Manager',{action:all})).status,503);
console.log('Audit API route contract: role denials, request validation, RPC arguments, stale and unavailable responses passed (mock database/session boundary).');

const {jobEditWireState}=await import('../supabase/functions/workshop-api/extensions/job_edit_archive_wire.js');
const backupStart=source.indexOf('    if (action === "backup") {');
const backupEnd=source.indexOf('    if (action === "backup_list") {',backupStart);
assert.ok(backupStart>=0&&backupEnd>backupStart);
const backupRoute=new (Object.getPrototypeOf(async function(){}).constructor)('action','user','admin','reply','legacyWire',source.slice(backupStart,backupEnd));
const marker={snapshotRevision:100,prefixCount:2},a={job:'JC1',at:1},b={job:'JC2',at:2};
let snapshot={jobEditArchive:marker,jobEdits:[b],jobs:[{no:'JC1'}]},inserted=[],reads=0,prefixReads=0,prefixValid=true;
const backupAdmin={from(name){
 if(name==='workshop_state'){reads++;return {select(){return {eq(){return {single:async()=>({data:{revision:101,data:snapshot}})}}}}};}
 assert.equal(name,'workshop_backups');
 return {insert(row){inserted.push(row);return {select(){return {single:async()=>({data:{id:1,revision:row.revision}})}}}}};
}};
const backupRun=role=>backupRoute('backup',{role,id:'manager-qa'},backupAdmin,reply,data=>jobEditWireState(data,false,async(revision,count)=>{
 prefixReads++;return prefixValid?{ok:true,snapshotRevision:revision,prefixCount:count,entries:[a,a]}:{ok:false};
}));
assert.equal((await backupRun('Employee')).status,403);
assert.equal(reads,0);assert.equal(inserted.length,0);
assert.equal((await backupRun('Manager')).status,200);
assert.deepEqual(inserted[0],{created_by:'manager-qa',revision:101,data:{jobEdits:[a,a,b],jobs:[{no:'JC1'}]}});
assert.deepEqual(snapshot.jobEditArchive,marker);assert.deepEqual(snapshot.jobEdits,[b]);assert.equal(prefixReads,1);
prefixValid=false;
assert.equal((await backupRun('Manager')).status,503);assert.equal(inserted.length,1);
snapshot={jobEdits:[a,b],jobs:[]};
assert.equal((await backupRun('Manager')).status,200);assert.deepEqual(inserted[1].data,snapshot);
assert.equal(prefixReads,2);
console.log('Manager manual backup route: complete ordered history, duplicate preservation, unchanged source, legacy compatibility, fail-closed missing prefix and role denial passed.');
