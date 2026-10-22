import assert from 'node:assert/strict';import fs from 'node:fs';
import {SourceTextModule,SyntheticModule} from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
import {mechanicalRoute} from '../supabase/functions/workshop-api/extensions/mechanical_route.js';
const id=n=>'75000000-0000-4000-8000-'+String(n).padStart(12,'0');
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const policy={flags:{mechanical:true},mechanicalStaff:{QA_SUP:['MC_CREATE']},mechanicalDepartment:'QA_MECH',manualJcDuplicateMode:'deny',mcNumbering:{minimumDigits:3}};
let handler,flag,invalid=false,role='Supervisor',revoke=false,authReads=0,calls=[],failCommit=false;
const admin={from:table=>{assert.equal(table,'staff_sessions');const chain={select(){return chain},eq(){return chain},maybeSingle:async()=>{authReads++;return {data:invalid||(revoke&&authReads===3)?null:{user_id:'QA_SUP',revoked_at:null,last_seen_at:new Date().toISOString(),staff_credentials:{user_id:'QA_SUP',display_name:'QA supervisor',role,department:'QA_MECH',active:true,must_change:false}}}}};return chain},
 rpc:async(name,p)=>{
  calls.push({name,p});assert.equal(p.p_actor,'QA_SUP');assert.match(p.p_session_hash,/^[0-9a-f]{64}$/);assert.notEqual(p.p_session_hash,'qa-synthetic-session');
  if(name==='zukait_mechanical_read'){
   if(p.p_kind==='policy')return {data:policy};
   if(p.p_kind==='receipt')return {data:null};
   assert.equal(p.p_kind,'context');return {data:{records:{revision:0,checklists:[],tasks:[],links:[],receipts:[],audit:[]},snapshot:{revision:1,data:{users:[],assign:[],sessions:[],jobs:[{no:'QA_JC'}]}},nextSequence:1}};
  }
  assert.equal(name,'zukait_mechanical_commit');return failCommit?{error:{message:'mechanical_invalid_session'}}:{data:{entityId:p.p_entity,number:'MC001',recordsRevision:1,workshopRevision:1}};
 }};
globalThis.Deno={env:{get:k=>k==='ZUKAIT_MECHANICAL_ENABLED'?flag:({SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'qa-service',SUPABASE_PUBLISHABLE_KEY:'qa-key'}[k])},serve:fn=>{handler=fn}};
const module=new SourceTextModule(stripTypeScriptTypes(source));
await module.link(async spec=>{const line=source.split('\n').find(s=>s.includes('from')&&s.includes(spec));const names=line?.match(/import\s*\{([^}]+)\}/)?.[1].split(',').map(s=>s.trim())||[];return new SyntheticModule(names,function(){for(const name of names)this.setExport(name,name==='createClient'?()=>admin:name==='mechanicalRoute'?mechanicalRoute:name==='accountantApi'?async()=>({status:200,body:{ok:true,accountant:true}}):()=>{throw Error('unexpected import '+name)})})});
await module.evaluate();
const command={operation:'MC_CREATE',entityId:id(1),requestId:id(2),deviceId:'QA_DEVICE',expectedRevision:0,expectedWorkshopRevision:1,payload:{manualJobCard:{number:'QA_JC',date:'2026-10-22'}}};
async function request(body={action:'mechanical_command',command},token='qa-synthetic-session'){
 calls=[];authReads=0;
 const res=await handler(new Request('https://example.invalid',{method:'POST',headers:{apikey:'qa-key','content-type':'application/json',...(token?{'x-zukait-session':token}:{})},body:JSON.stringify(body)}));return {status:res.status,body:await res.json()};
}
for(const value of [undefined,'false','TRUE','1']){flag=value;const r=await request();assert.equal(r.body.code,'extension_disabled');assert.equal(calls.length,0);assert.equal(authReads,1,'Existing authentication still runs while disabled');}
flag='true';invalid=true;assert.equal((await request()).status,401);assert.equal(calls.length,0);invalid=false;
assert.equal((await request(undefined,'')).status,401);assert.equal(calls.length,0);
for(const value of ['Employee','Receptionist','Accountant']){role=value;assert.equal((await request()).status,403);assert.equal(calls.length,0);}role='Supervisor';
assert.equal((await request({action:'mechanical_unknown',command})).status,400);assert.equal(calls.length,0);
assert.equal((await request({action:'mechanical_command',command,enabled:true})).status,400);assert.equal(calls.length,0);
assert.equal((await request({action:'mechanical_command',command:{...command,actorId:'QA_OTHER'}})).body.code,'invalid_command');assert.equal(calls.some(c=>c.name.endsWith('_commit')),false);
let r=await request();assert.equal(r.status,200);assert.equal(r.body.result.number,'MC001');assert.equal(authReads,3);assert.deepEqual(calls.map(c=>c.p.p_kind||'commit'),['policy','receipt','context','commit']);assert.ok(!JSON.stringify(r).includes('snapshot'));assert.ok(!JSON.stringify(r).includes('qa-synthetic-session'));
revoke=true;r=await request();assert.equal(r.status,401);assert.equal(calls.some(c=>c.name.endsWith('_commit')),false);revoke=false;
failCommit=true;r=await request();assert.equal(r.status,401);assert.equal(r.body.code,'invalid_session');failCommit=false;
role='Accountant';assert.equal((await request({action:'accountant_dashboard'})).body.accountant,true,'Existing Accountant routing remains available');
console.log('PASS real Edge handler: exact default-off environment flag, existing auth gate, role isolation, trusted hash binding, strict body, safe errors, no snapshot exposure, pre-commit revocation, existing Accountant route. Synthetic only.');
