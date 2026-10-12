import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {randomUUID,webcrypto} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {insuranceProjection,insuranceLpoTransition} from '../supabase/functions/workshop-api/insurance_management_rules.js';
let serve,state,revision,writes=0,attempts=0,mode='',role='Manager';
const baseline={users:[{id:'QA-EMP',name:'Employee',role:'Employee',department:'Denter'}],jobs:[{no:'JC100',jobType:'Insurance',insuranceCompany:'A',createdAt:Date.now()}],assign:[],sessions:[],expenses:[{id:'original'}]};
const admin={from(table){const chain={select:()=>chain,eq:()=>chain,order:()=>chain,
 maybeSingle:async()=>({data:{user_id:'QA-MGR',last_seen_at:new Date().toISOString(),staff_credentials:{user_id:'QA-MGR',display_name:'Manager',role,active:true,must_change:false}}}),
 single:async()=>({data:{revision,data:structuredClone(state)}}),range:async()=>({data:[]}),
 then:resolve=>resolve({data:table==='workshop_insurance_companies'?[{id:1,name:'A'}]:[]})};return chain;},async rpc(name,args){assert.equal(name,'zukait_commit_workshop_state_v2');assert.ok(args.p_live.length);attempts++;
 if(mode==='conflict'&&attempts===1){revision++;state.expenses.push({id:'concurrent'});return {data:{ok:false,code:'conflict'}};}
 assert.equal(args.p_expected_revision,revision);state=structuredClone(args.p_data);revision++;writes++;
 if(mode==='lost'){mode='';return {error:{message:'Lost response'}};}return {data:{ok:true,revision}};
}};
vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8').replace(/^import[^\n]*\n/gm,'')),{Deno:{env:{get:k=>k==='SUPABASE_PUBLISHABLE_KEY'?'qa-key':''},serve:f=>serve=f},createClient:()=>admin,crypto:webcrypto,TextEncoder,Response,Date,structuredClone,console:{error:()=>{}},insuranceProjection,insuranceLpoTransition});
const reset=m=>{state=structuredClone(baseline);revision=1;writes=0;attempts=0;mode=m||'';role='Manager';};
async function call(body){const res=await serve(new Request('https://qa.invalid',{method:'POST',headers:{apikey:'qa-key','x-zukait-session':'qa'},body:JSON.stringify(body)}));return {status:res.status,body:await res.json()};}
const request=()=>({action:'insurance_lpo',job_card:'JC100',amount:'25.125',received_date:'2026-10-10',expected_revision:0,request_id:randomUUID(),reason:''});
reset();for(const denied of ['Supervisor','Receptionist','Employee','Purchaser']){role=denied;assert.equal((await call(request())).status,403);assert.equal((await call({action:'insurance_dashboard'})).status,403);}assert.equal(writes,0);
reset();let r=await call({action:'insurance_dashboard',section:'pending',month:'2026-10'});assert.equal(r.status,200);assert.equal(r.body.rows.length,1);assert.equal(writes,0);
assert.equal((await call({action:'insurance_dashboard',role:'Manager'})).status,400);
reset('conflict');r=await call(request());assert.equal(r.status,200);assert.equal(attempts,2);assert.ok(state.expenses.some(x=>x.id==='concurrent'));assert.equal(writes,1);
reset('lost');const receipt=request();assert.equal((await call(receipt)).status,500);assert.equal(writes,1);r=await call(receipt);assert.equal(r.body.duplicate,true);assert.equal(writes,1);
reset();state.users=[];assert.equal((await call(request())).body.code,'insurance_live_status_unavailable');assert.equal(writes,0);
reset();const forged={...request(),actor_id:'QA-OTHER'};assert.equal((await call(forged)).body.code,'insurance_invalid_fields');assert.equal(writes,0);
console.log('PASS: actual Edge handler with mocked transport: Manager access, filter allowlist, CAS conflict preservation, lost-response replay, forged actor and live-status safeguard');
