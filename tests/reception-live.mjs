// Read-only deployed acceptance checks. Use dedicated short-lived QA identities;
// never load production staff tokens or create customer checklist records here.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const path=process.env.ZUKAIT_RECEPTION_QA_FIXTURES;
if(!path)throw Error('Set ZUKAIT_RECEPTION_QA_FIXTURES to the protected QA fixture file.');
const fixtures=JSON.parse(fs.readFileSync(path,'utf8'));
assert.ok(fixtures.every(f=>/^ZQA_RC_[a-f0-9]+_(manager|supervisor|employee|reception)$/.test(f.id)),'Dedicated QA identities required');
const byName=Object.fromEntries(fixtures.map(f=>[f.name,f]));
const root='https://pjknotnjkufadqavcmii.supabase.co';
const apikey='sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A';
async function call(name,command,extra={}){
 const response=await fetch(root+'/functions/v1/workshop-api',{method:'POST',headers:{'Content-Type':'application/json',apikey,'x-zukait-session':byName[name]?.token||''},body:JSON.stringify({action:'reception',command,...extra}),signal:AbortSignal.timeout(30000)});
 return {status:response.status,body:await response.json()};
}
if(process.env.ZUKAIT_RECEPTION_QA_EXPECT_REVOKED==='1'){
 for(const name of Object.keys(byName)){const r=await call(name,{operation:'CAPABILITIES'});assert.equal(r.status,401);assert.equal(r.body.code,'invalid_session')}
 console.log('All temporary reception QA sessions rejected after revocation.');process.exit(0);
}
for(const name of ['manager','supervisor','reception']){
 let r=await call(name,{operation:'CAPABILITIES'});assert.equal(r.status,200);assert.equal(r.body.allowed,true);
 r=await call(name,{operation:'MASTER'});assert.equal(r.status,200);assert.equal(r.body.companies.length,8);
 r=await call(name,{operation:'LIST',filter:'ALL'});assert.equal(r.status,200);assert.ok(Array.isArray(r.body.rows));assert.equal(r.body.rows.length,0,'Do not run fixture assertions after real customer reception starts.');
}
let r=await call('employee',{operation:'CAPABILITIES'});assert.equal(r.status,200);assert.equal(r.body.allowed,false);
r=await call('employee',{operation:'MASTER'});assert.equal(r.status,403);assert.equal(r.body.code,'reception_forbidden');
r=await call('employee',{operation:'LIST'},{p_actor_id:byName.manager.id,user:{id:byName.manager.id,role:'Manager'}});assert.equal(r.status,403);
r=await call('supervisor',{operation:'STAFF'});assert.equal(r.status,403);assert.equal(r.body.code,'reception_manager_required');
r=await call('manager',{operation:'GET',rc_no:'RC-DOES-NOT-EXIST'});assert.equal(r.status,404);
r=await call('manager',[]);assert.equal(r.status,400);
r=await call('guest',{operation:'MASTER'});assert.equal(r.status,401);
for(const action of ['revision','live_status']){
 const response=await fetch(root+'/functions/v1/workshop-api',{method:'POST',headers:{'Content-Type':'application/json',apikey,'x-zukait-session':byName.manager.token},body:JSON.stringify({action}),signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
}
const table=await fetch(root+'/rest/v1/workshop_receptions?select=rc_no',{headers:{apikey},signal:AbortSignal.timeout(30000)});assert.ok([401,403,404].includes(table.status),'Direct reception data must not be exposed');
const rpc=await fetch(root+'/rest/v1/rpc/zukait_reception_command',{method:'POST',headers:{apikey,'Content-Type':'application/json'},body:JSON.stringify({p_actor_id:byName.manager.id,p_command:{operation:'LIST'}}),signal:AbortSignal.timeout(30000)});assert.ok([401,403,404].includes(rpc.status),'Direct reception RPC must not be exposed');
console.log('Deployed reception acceptance passed: Manager/Supervisor/designated access, Employee and spoofing rejection, server master/list, malformed/guest requests, direct REST denial, existing revision/live-status endpoints. No RC records created.');
