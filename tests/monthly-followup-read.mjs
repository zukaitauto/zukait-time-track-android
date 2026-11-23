import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {stripTypeScriptTypes} from 'node:module';
const server=fs.readFileSync(process.env.MONTHLY_API_SOURCE||'supabase/functions/workshop-api/index.ts','utf8');
const start=server.indexOf('    if (action === "monthly_followup") {');assert.ok(start>0);
const wrapped=stripTypeScriptTypes('async function fixture(){\n'+server.slice(start,server.indexOf('    if (action === "load") {',start))+'\n}',{mode:'strip'});
const route=new (Object.getPrototypeOf(async function(){}).constructor)('action','user','admin','reply',wrapped.slice(wrapped.indexOf('{')+1,wrapped.lastIndexOf('}')));
const job={no:'QA1',jobType:'INSURANCE',amount:null,finalInvoiceAmount:0,insuranceLpo:{amount:42.125,receivedDate:'2026-10-01',audit:[{secret:'omit'}]},vehicle:'Toyota',reg:'ABC',createdAt:1,delivered:true,deliveredAt:2,sessions:Array(2000).fill({history:'irrelevant'}),customerMobile:'not-needed'};
let reads=0;const admin={from(table){
 assert.equal(table,'workshop_state');return {
  select(fields){assert.equal(fields,'revision,jobs:data->jobs');return this},
  eq(key,value){assert.equal(key,'id');assert.equal(value,'main');return this},
  async single(){reads++;return {data:{revision:12,jobs:[job]}}}
 };
}};
for(const role of ['Employee','Purchaser','Receptionist','Accountant']){const r=await route('monthly_followup',{role},admin,(body,status)=>({body,status}));assert.equal(r.status,403);}
assert.equal(reads,0,'authorization precedes reads');
for(const role of ['Manager','Supervisor']){const r=await route('monthly_followup',{role},admin,(body,status=200)=>({body,status}));assert.equal(r.status,200);assert.equal(r.body.revision,12);const out=r.body.data.jobs[0];assert.equal(out.amount,null);assert.equal(out.finalInvoiceAmount,0);assert.deepEqual(out.insuranceLpo,{amount:42.125,receivedDate:'2026-10-01'});assert.equal(out.sessions,undefined);assert.equal(out.customerMobile,undefined);assert.ok(JSON.stringify(r.body).length<JSON.stringify(job).length/20);}

const source=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const code=source.slice(source.indexOf('  let monthlyReadInFlight='),source.indexOf('  async function syncNow(){'));
let calls=0,legacy=0,release;const gate=new Promise(r=>release=r);
const c={navigator:{onLine:true},clone:structuredClone,state:{jobs:[{no:'LOCAL',amount:99}]},cloudDirty:true,cloudRevision:1,confirmedReadState:{jobs:[{no:'FULL_BASELINE'}]},
  api:async body=>{assert.equal(body.action,'monthly_followup');calls++;await gate;return {ok:true,revision:12,data:{jobs:[{no:'QA1',amount:0}]}}},readLatest:async()=>{legacy++;return {revision:1,data:{jobs:[]}}}};
vm.createContext(c);vm.runInContext(code+';globalThis.read=readMonthlyFollowup;',c);
const a=c.read(),b=c.read();release();const [one,two]=await Promise.all([a,b]);assert.equal(calls,1);assert.equal(one.data.jobs[0].amount,0);assert.deepEqual(one,two);
assert.equal(c.state.jobs[0].no,'LOCAL');assert.equal(c.cloudDirty,true);assert.equal(c.cloudRevision,1);assert.equal(c.confirmedReadState.jobs[0].no,'FULL_BASELINE','partial projection must not poison full-state merge baseline');
c.api=async()=>{throw Error('TIMEOUT')};await assert.rejects(c.read(),/TIMEOUT/);assert.equal(legacy,0,'timeout must not trigger another large download');
c.api=async()=>({ok:false,code:'unknown_action'});await c.read();assert.equal(legacy,1,'old server compatibility only');
c.api=async()=>({ok:false,code:'invalid_session'});await assert.rejects(c.read(),/invalid_session/);assert.equal(legacy,1);
console.log('PASS: scoped monthly endpoint permissions, exact financial values, payload reduction, shared reads, baseline/queue isolation and compatibility.');
