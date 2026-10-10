import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {randomUUID, webcrypto} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {qcWork} from '../supabase/functions/workshop-api/qc_delivery_rules.js';
import {receptionistDeliveryList,receptionistDeliveryRow,receptionistDeliveryTransition} from '../supabase/functions/workshop-api/receptionist_delivery_rules.js';
const baseline={users:[{id:'QA-EMP',name:'QA Employee',role:'Employee',department:'Denter'}],jobs:[{no:'QA-JC',receptionNo:'RC-QA',vehicle:'QA Vehicle',reg:'QA123',jobType:'INSURANCE',status:'Open',amount:999}],assign:[{id:'A',emp:'QA-EMP',job:'QA-JC',completed:true,completedAt:10}],sessions:[{id:'S',emp:'QA-EMP',job:'QA-JC',start:1,end:10}],expenses:[{id:'E',amount:999}]};
baseline.jobs[0].qcWorkflow={revision:2,fingerprint:qcWork(baseline,'QA-JC').fingerprint,painting:{result:'PASS'},final:{result:'PASS'},history:[]};
let state,revision,reads,writes,attempts,mode,mustChange=false,serve;
const actor={user_id:'QA-RC',display_name:'QA Receptionist',role:'Receptionist',department:'Reception',active:true};
function reset(nextMode='normal'){state=structuredClone(baseline);revision=1;reads=0;writes=0;attempts=0;mode=nextMode;}
const admin={from(table){const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:{user_id:actor.user_id,last_seen_at:new Date().toISOString(),staff_credentials:{...actor,must_change:mustChange}}}),single:async()=>{assert.equal(table,'workshop_state');reads++;return {data:{data:structuredClone(state),revision},error:null}}};assert.ok(['staff_sessions','workshop_state'].includes(table));return chain;},async rpc(name,args){assert.equal(name,'zukait_commit_workshop_state_v2');assert.ok(args.p_live.length>0);assert.equal(args.p_changed_by,actor.user_id);attempts++;
 if(attempts===1&&['conflict','work-conflict'].includes(mode)){revision++;if(mode==='conflict')state.expenses.push({id:'CONCURRENT',amount:12});else state.sessions[0].end=0;return {data:{ok:false,code:'conflict'},error:null};}
 assert.equal(args.p_expected_revision,revision);state=structuredClone(args.p_data);revision++;writes++;
 if(mode==='lost'){mode='normal';return {data:null,error:{message:'Lost response after commit'}};}
 return {data:{ok:true,revision},error:null};
}};
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8').replace(/^import[^\n]*\n/gm,'');
vm.runInNewContext(stripTypeScriptTypes(source),{Deno:{env:{get:k=>k==='SUPABASE_PUBLISHABLE_KEY'?'qa-key':''},serve:f=>serve=f},createClient:()=>admin,crypto:webcrypto,TextEncoder,Response,Date,console:{error:()=>{}},receptionistDeliveryList,receptionistDeliveryRow,receptionistDeliveryTransition});
async function call(body){const res=await serve(new Request('https://qa.invalid',{method:'POST',headers:{apikey:'qa-key','x-zukait-session':'qa-session'},body:JSON.stringify(body)}));return {status:res.status,body:await res.json()};}
const request=()=>({action:'receptionist_deliver',operation:'DELIVER',jobCard:'QA-JC',expectedQcRevision:2,expectedVehicleIdentity:receptionistDeliveryRow(state,state.jobs[0]).expectedVehicleIdentity,request_id:randomUUID()});
const safeDeliveryFields=['jobCard','receptionNo','vehicle','registration','delivered','deliveredAt','stage','deliveryReady','expectedQcRevision','expectedVehicleIdentity'].sort();
reset();let r=await call({action:'receptionist_delivery_list'});assert.equal(r.status,200);assert.equal(r.body.rows[0].deliveryReady,true);assert.deepEqual(Object.keys(r.body.rows[0]).sort(),safeDeliveryFields,'Delivery list must contain only explicit nonfinancial fields');assert.equal(writes,0);
const body=request();r=await call(body);assert.equal(r.status,200);assert.equal(r.body.job.delivered,true);assert.deepEqual(Object.keys(r.body.job).sort(),safeDeliveryFields,'Delivered receipt must contain only explicit nonfinancial fields');assert.equal(writes,1);
r=await call(body);assert.equal(r.status,200);assert.equal(r.body.duplicate,true);assert.equal(writes,1);
reset('lost');const lost=request();r=await call(lost);assert.equal(r.status,500);assert.equal(writes,1);r=await call(lost);assert.equal(r.status,200);assert.equal(r.body.duplicate,true);assert.equal(writes,1);
reset('conflict');r=await call(request());assert.equal(r.status,200);assert.equal(attempts,2);assert.equal(writes,1);assert.ok(state.expenses.some(e=>e.id==='CONCURRENT'));
reset('work-conflict');r=await call(request());assert.equal(r.status,409);assert.equal(r.body.code,'work_not_finished');assert.equal(writes,0);assert.notEqual(state.jobs[0].delivered,true);
reset();state.users=[];r=await call(request());assert.equal(r.status,503);assert.equal(r.body.code,'receptionist_live_status_unavailable');assert.equal(attempts,0);
reset();r=await call({...request(),finalInvoiceAmount:0});assert.equal(r.status,403);assert.equal(reads,0);assert.equal(writes,0);
mustChange=true;r=await call({action:'receptionist_delivery_list'});assert.equal(r.status,401);mustChange=false;
console.log('Receptionist real Edge handler (mock transport): private delivery list, CAS retry, concurrent work rejection, lost-response replay, temporary-password denial and nonempty live-status safeguard passed.');
