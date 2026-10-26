import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
import {jobNumberCodec,jobNumberChange} from '../supabase/functions/workshop-api/job_number_rules.js';
import * as edits from '../supabase/functions/workshop-api/job_edit_rules.js';
const rows=['11965','12965'].map(number=>({number,stable_job:'11965',current_number:'12965'})),codec=jobNumberCodec(rows);
const internal={jobs:[{no:'11965',make:'BYD',reg:'11965',notes:'11965'}],assign:[{job:'11965'}],sessions:[{job:'11965',preliminaryLinkedJob:'11965'}],consumables:{actuals:[{jobCard:'11965'}]},paintPurchasing:{orders:[{jobCard:'11965'}]},sublets:[{jobCard:'11965'}],paintCosting:{11965:{netPaintCost:10}},managerReviews:{11965:{flag:true}},ledger:[{job_card:'11965',reference:'11965',amount:11965}],live:[{job_no:'11965'}]};
const visible=codec.toPublic(internal);assert.equal(visible.jobs[0].no,'12965');assert.equal(visible.jobs[0].reg,'11965');assert.equal(visible.jobs[0].notes,'11965');assert.equal(visible.ledger[0].reference,'11965');assert.equal(visible.ledger[0].amount,11965);assert.equal(visible.paintCosting['12965'].netPaintCost,10);assert.deepEqual(codec.toInternal(visible),internal);
for(const path of [visible.assign[0].job,visible.sessions[0].job,visible.sessions[0].preliminaryLinkedJob,visible.consumables.actuals[0].jobCard,visible.paintPurchasing.orders[0].jobCard,visible.sublets[0].jobCard,visible.ledger[0].job_card,visible.live[0].job_no])assert.equal(path,'12965');
assert.equal(codec.toInternal({expectedJob:{no:'12965'},expectedJobNumber:'12965',newJobNumber:'13965'}).expectedJob.no,'11965');
assert.equal(codec.toInternal({expectedJobNumber:'12965'}).expectedJobNumber,'12965');
assert.equal(codec.toInternal({command:{payload:{manualJobCard:{number:'12965',date:'2026-10-26'}}}}).command.payload.manualJobCard.number,'11965');
assert.equal(codec.toPublic({manualJobCard:{number:'11965'},number:'MC001'}).manualJobCard.number,'12965');
assert.equal(codec.toPublic({manualJobCard:{number:'11965'},number:'MC001'}).number,'MC001','MC identity is never a JC alias');
assert.equal(jobNumberChange({}),null);assert.equal(jobNumberChange({newJobNumber:'123'}).code,'job_number_confirmation_required');
for(const number of ['0','00123','ID001','1.5','-3','1e3','12345678901'])assert.equal(jobNumberChange({newJobNumber:number}).code,'job_number_invalid');
assert.equal(jobNumberChange({newJobNumber:'123',expectedJobNumber:'11965',numberChangeConfirmed:true}).ok,true);
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');assert.ok(source.includes(fs.readFileSync('supabase/functions/workshop-api/job_number_rules.js','utf8').replace(/export /g,'').trim()),'deployed codec matches tested module');
let serve,actor={user_id:'M',display_name:'Manager',role:'Manager',active:true},numberRows=structuredClone(rows),requests=[],rejectNumber=false;
let state={jobs:[{no:'11965',make:'BYD',model:'Leopard',reg:'2970-R',jobType:'Cash',editRevision:0}],assign:[],sessions:[],users:[]};
const admin={from(table){const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{user_id:actor.user_id,last_seen_at:new Date().toISOString(),staff_credentials:actor,job_numbers:numberRows}}),single:async()=>({data:{data:structuredClone(state),jobs:state.jobs,revision:1}})};return q;},async rpc(name,args){requests.push({name,args});if(name==='zukait_manager_numbered_job_edit'){if(rejectNumber)return {error:{message:'job_number_duplicate'}};assert.equal(args.p_job_card,'11965');assert.equal(args.p_expected_number,'12965');assert.equal(args.p_new_number,'13965');state=args.p_data;numberRows=[...rows,{number:'13965',stable_job:'11965'}].map(r=>({...r,current_number:'13965'}));return {data:{ok:true,revision:2,job:state.jobs[0],data:state,number_rows:numberRows}};}throw Error(name);}};
vm.runInNewContext(stripTypeScriptTypes(source.replace(/^import[^\n]*\n/gm,'')),{...edits,Deno:{env:{get:k=>k==='SUPABASE_PUBLISHABLE_KEY'?'qa-key':''},serve:f=>serve=f},createClient:()=>admin,crypto:webcrypto,TextEncoder,Response,Date,console:{error:e=>{throw e}}});
const call=async body=>{const r=await serve(new Request('https://qa.invalid',{method:'POST',headers:{apikey:'qa-key','x-zukait-session':'qa'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}};
let result=await call({action:'job_card_edit',operation:'GET',jobCard:'12965'});assert.equal(result.status,200);assert.equal(result.body.job.no,'12965');assert.equal(result.body.job.reg,'2970-R');assert.equal(result.body.user?._jobNumbers,undefined);
result=await call({action:'manager_job_full_edit',operation:'FULL_EDIT',jobCard:'12965',expectedEditRevision:0,expectedJob:{...state.jobs[0],no:'12965'},expectedAssignments:[],allocations:[],patch:{notes:'Correction'},reason:'Correct imported number',newJobNumber:'13965',expectedJobNumber:'12965',numberChangeConfirmed:true});assert.equal(result.status,200);assert.equal(result.body.job.no,'13965');assert.equal(result.body.data.jobs[0].no,'13965');assert.equal(state.jobs[0].no,'11965');assert.equal(result.body.number_rows,undefined);
rejectNumber=true;result=await call({action:'manager_job_full_edit',operation:'FULL_EDIT',jobCard:'13965',expectedEditRevision:1,expectedJob:{...state.jobs[0],no:'13965'},expectedAssignments:[],allocations:[],patch:{},reason:'Duplicate check',newJobNumber:'14965',expectedJobNumber:'13965',numberChangeConfirmed:true});assert.equal(result.status,409);assert.equal(result.body.code,'job_number_duplicate');assert.equal(state.jobs[0].no,'11965');
for(const role of ['Supervisor','Receptionist','Employee']){actor={...actor,role};result=await call({action:'manager_job_full_edit',operation:'FULL_EDIT',jobCard:'13965',newJobNumber:'14965'});assert.notEqual(result.status,200);}
console.log('Job numbers: reference round-trip, immutable amounts/text, dictionaries, confirmation, format, real API normalization, exact edit RPC and role restrictions passed.');
// A device with an offline part update must adopt the server's current number
// while retaining its queued part update, rather than leaving a detached cache.
const cache=new Map(),box={window:{me:{id:'M',role:'Manager'}},localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)},navigator:{onLine:true},document:{getElementById:()=>null},alert:()=>{},Date,console};
vm.createContext(box);vm.runInContext(fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8'),box);
cache.set('zukait_v2_spare_parts_lists_v1',JSON.stringify([{listNo:'PL001',jobCard:'11965',items:[{id:'part-1',name:'Bumper',qty:1,status:'ORDERED',pendingSync:true,pendingEventId:'offline-1'}]}]));
box.window.zukaitV2.sparePartsMain.hydrateFromServerRows([{event_type:'SPARE_PART_LIST_CREATED',list_no:'PL001',job_card:'12965',payload:{listNo:'PL001',jobCard:'12965'}}]);
const cached=JSON.parse(cache.get('zukait_v2_spare_parts_lists_v1'))[0];assert.equal(cached.jobCard,'12965');assert.equal(cached.items[0].pendingEventId,'offline-1');assert.equal(cached.items[0].status,'ORDERED');
console.log('Pending Spare Parts cache adopts corrected number without losing queued work.');
