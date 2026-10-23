import assert from 'node:assert/strict';import fs from 'node:fs';
import {SourceTextModule,SyntheticModule} from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
import {mechanicalRoute,mechanicalLegacyDeliveryCheck} from '../supabase/functions/workshop-api/extensions/mechanical_route.js';
const id=n=>'75000000-0000-4000-8000-'+String(n).padStart(12,'0');
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const policy={flags:{mechanical:true},mechanicalStaff:{QA_SUP:['MC_CREATE']},mechanicalDepartment:'QA_MECH',manualJcDuplicateMode:'deny',mcNumbering:{minimumDigits:3}};
let handler,flag,qcFlag,deliveryFlag,invalid=false,role='Supervisor',revoke=false,authReads=0,calls=[],failCommit=false,guardError;
const admin={from:table=>{if(table!=='staff_sessions'&&guardError)throw Error(guardError);assert.equal(table,'staff_sessions');const chain={select(){return chain},eq(){return chain},maybeSingle:async()=>{authReads++;return {data:invalid||(revoke&&authReads===3)?null:{user_id:'QA_SUP',revoked_at:null,last_seen_at:new Date().toISOString(),staff_credentials:{user_id:'QA_SUP',display_name:'QA supervisor',role,department:'QA_MECH',active:true,must_change:false}}}}};return chain},
 rpc:async(name,p)=>{
  calls.push({name,p});assert.equal(p.p_actor,'QA_SUP');assert.match(p.p_session_hash,/^[0-9a-f]{64}$/);assert.notEqual(p.p_session_hash,'qa-synthetic-session');
  if(name==='zukait_mechanical_qc_overview_read')return {data:{actor:{id:'QA_SUP',role,active:true},policy,records:{revision:0,checklists:[],tasks:[],links:[]},snapshot:{revision:1,data:{jobs:[],assign:[],sessions:[],users:[]}},approvals:[]}};
  if(name==='zukait_mechanical_dashboard')return {data:{ok:true,checklists:[],nextAfter:null,detail:null,recordsRevision:0,workshopRevision:1}};
  if(name==='zukait_mechanical_delivery_lookup')return {data:{ok:true,registered:p.p_job_card==='QA_JC',...(p.p_job_card==='QA_JC'?{checklistId:id(1)}:{})}};
  if(name==='zukait_mechanical_qc_read')return {data:{policy:{...policy,qc:{mechanicalApproverId:'SUP003',mechanicalOnlyMode:'SOLE_MECHANICAL_APPROVER',mixedPaintingApproverId:'SUP002',mixedFinalApproverId:'SUP001',mixedMechanicalRequired:null}},records:{revision:0,checklists:[{id:id(1),manualJobCard:{number:'QA_JC'}}],tasks:[{id:id(3),checklistId:id(1),title:'Synthetic check'}],links:[{taskId:id(3),assignmentId:id(4),employeeId:'QA_A'}],receipts:[]},snapshot:{revision:1,data:{jobs:[{no:'QA_JC'}],users:[{id:'QA_A',department:'QA_MECH'}],assign:[{id:id(4),job:'QA_JC',emp:'QA_A',completed:true,mechanicalTaskId:id(3),mechanicalChecklistId:id(1)}],sessions:[]}},approval:null}};
  if(name==='zukait_mechanical_read'){
   if(p.p_kind==='policy')return {data:policy};
   if(p.p_kind==='receipt')return {data:null};
   assert.equal(p.p_kind,'context');return {data:{records:{revision:0,checklists:[],tasks:[],links:[],receipts:[],audit:[]},snapshot:{revision:1,data:{users:[],assign:[],sessions:[],jobs:[{no:'QA_JC'}]}},nextSequence:1}};
  }
  assert.equal(name,'zukait_mechanical_commit');return failCommit?{error:{message:'mechanical_invalid_session'}}:{data:{entityId:p.p_entity,number:'MC001',recordsRevision:1,workshopRevision:1}};
 }};
globalThis.Deno={env:{get:k=>k==='ZUKAIT_MECHANICAL_ENABLED'?flag:k==='ZUKAIT_MECHANICAL_QC_ENABLED'?qcFlag:k==='ZUKAIT_MECHANICAL_DELIVERY_ENABLED'?deliveryFlag:({SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'qa-service',SUPABASE_PUBLISHABLE_KEY:'qa-key'}[k])},serve:fn=>{handler=fn}};
const module=new SourceTextModule(stripTypeScriptTypes(source));
await module.link(async spec=>{const line=source.split('\n').find(s=>s.includes('from')&&s.includes(spec));const names=line?.match(/import\s*\{([^}]+)\}/)?.[1].split(',').map(s=>s.trim())||[];return new SyntheticModule(names,function(){for(const name of names)this.setExport(name,name==='createClient'?()=>admin:name==='mechanicalRoute'?mechanicalRoute:name==='mechanicalLegacyDeliveryCheck'?mechanicalLegacyDeliveryCheck:name==='accountantApi'?async()=>({status:200,body:{ok:true,accountant:true}}):()=>{throw Error('unexpected import '+name)})})});
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
r=await request({action:'mechanical_dashboard',after:0});assert.equal(r.status,200);assert.deepEqual(r.body.checklists,[]);assert.equal(calls.length,1);assert.equal(calls[0].name,'zukait_mechanical_dashboard');
for(const value of [undefined,'false','TRUE','1']){qcFlag=value;assert.equal((await request({action:'mechanical_qc_readiness',checklistId:id(1)})).body.code,'extension_disabled');assert.equal(calls.length,0)}
for(const value of [undefined,'false','TRUE','1']){qcFlag=value;assert.equal((await request({action:'mechanical_qc_overview'})).body.code,'extension_disabled');assert.equal(calls.length,0)}
qcFlag='true';r=await request({action:'mechanical_qc_overview'});assert.equal(r.status,200);assert.equal(r.body.actorId,'QA_SUP');assert.equal(calls.length,1);assert.equal(calls[0].name,'zukait_mechanical_qc_overview_read');assert.equal('snapshot' in r.body,false);
for(const value of ['Receptionist','Accountant','Employee']){role=value;assert.equal((await request({action:'mechanical_qc_overview'})).status,403);assert.equal(calls.length,0)}role='Manager';assert.equal((await request({action:'mechanical_qc_overview'})).status,200);role='Supervisor';assert.equal((await request({action:'mechanical_qc_overview',actorId:'SUP003'})).status,400);assert.equal(calls.length,0);
qcFlag='true';r=await request({action:'mechanical_qc_readiness',checklistId:id(1)});assert.equal(r.status,200);assert.equal(r.body.status.workComplete,true);assert.match(r.body.status.workToken,/^[0-9a-f]{64}$/);assert.equal(calls[0].name,'zukait_mechanical_qc_read');assert.ok(!JSON.stringify(r).includes('Synthetic check'));assert.equal('snapshot' in r.body,false);qcFlag=undefined;
qcFlag='true';for(const value of [undefined,'false','TRUE','1']){deliveryFlag=value;assert.equal((await request({action:'mechanical_delivery_probe',jobCard:'QA_JC'})).body.code,'extension_disabled');assert.equal(calls.length,0)}
deliveryFlag='true';r=await request({action:'mechanical_delivery_probe',jobCard:'QA_JC'});assert.equal(r.body.registered,true);assert.equal(calls.length,1);
r=await request({action:'qc_delivery',operation:'DELIVER',jobCard:'QA_JC',finalInvoiceAmount:1});assert.equal(r.body.code,'mechanical_delivery_review_required');assert.equal(calls.length,1,'Legacy financial input must not be converted or written');
role='Receptionist';r=await request({action:'receptionist_deliver',operation:'DELIVER',jobCard:'QA_JC',expectedQcRevision:0,expectedVehicleIdentity:'QA_VEHICLE',request_id:id(50)});assert.equal(r.body.code,'mechanical_delivery_review_required');assert.equal(calls.length,1);role='Supervisor';deliveryFlag=undefined;qcFlag=undefined;
for(const extra of [{after:'0'},{after:-1},{after:1.5},{checklistId:'wrong'},{policy:{enabled:true}}]){assert.equal((await request({action:'mechanical_dashboard',...extra})).status,400);assert.equal(calls.length,0)}
revoke=true;r=await request();assert.equal(r.status,401);assert.equal(calls.some(c=>c.name.endsWith('_commit')),false);revoke=false;
failCommit=true;r=await request();assert.equal(r.status,401);assert.equal(r.body.code,'invalid_session');failCommit=false;
role='Accountant';assert.equal((await request({action:'accountant_dashboard'})).body.accountant,true,'Existing Accountant routing remains available');
role='Supervisor';for(const code of ['mechanical_authority_conflict','mechanical_live_authority_conflict','mechanical_delivery_authority_conflict']){guardError=code;r=await request({action:'load'});assert.equal(r.status,403);assert.equal(r.body.code,code);assert.equal(r.body.retryable,false);}guardError=null;
console.log('PASS real Edge handler: exact default-off environment flag, existing auth gate, role isolation, trusted hash binding, strict body, safe errors, no snapshot exposure, pre-commit revocation, existing Accountant route. Synthetic only.');
