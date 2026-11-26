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
