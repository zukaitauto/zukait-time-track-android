import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,webcrypto} from 'node:crypto';
import {JSDOM,VirtualConsole} from 'jsdom';
const html=fs.readFileSync('app/src/main/assets/receptionist.html','utf8');
const sessionSource=fs.readFileSync('app/src/main/assets/receptionist_session.js','utf8');
const receptionSource=fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8');
assert.ok(!/cloud_sync|secure_auth|estimate\/|spare_parts|consumables|production_pilot/.test(html));
const user={id:'QA-RC',name:'QA Receptionist',role:'Receptionist',department:'Reception'};
let delivered=false,lost=true,writes=0;
const requests=[],storageReads=[];
const record={rc_no:'RC-QA',revision:2,details:{make:'Toyota',model:'Camry',remarks:'Reception-only observation'},location:'VWC',approval_status:'APPROVED',can_edit:true};
const uuids=[];
async function fetch(url,options){
 const body=JSON.parse(options.body);requests.push(body);
 if(url.endsWith('/staff-auth'))return {ok:true,status:200,json:async()=>({ok:true,user,session_token:'qa-token',must_change:false})};
 assert.ok(['reception','receptionist_delivery_list','receptionist_deliver'].includes(body.action));
 assert.equal(options.headers['x-zukait-session'],'qa-token');
 let result;
 if(body.action==='reception'){
  const op=body.command.operation;
  if(op==='CAPABILITIES')result={ok:true,allowed:true,manager:false};
  else if(op==='MASTER')result={ok:true,companies:[{id:1,name:'QA insurance'}]};
  else if(op==='LIST')result={ok:true,rows:[]};
  else if(op==='GET')result={ok:true,record,insurance:{approval_valid:true,can_prepare:false,can_revoke:false},job_creation:{can_create:!record.job_card},movements:[],audit:[]};
  else throw Error('Unexpected Reception operation '+op);
 }else if(body.action==='receptionist_delivery_list')result={ok:true,rows:[{jobCard:'QA-JC',receptionNo:'RC-QA',vehicle:'Toyota Camry',registration:'QA123',stage:delivered?'DELIVERED':'DELIVERY',delivered,deliveryReady:!delivered,expectedQcRevision:2}]};
 else{
  uuids.push(body.request_id);
  if(!delivered){writes++;delivered=true;}
  if(lost){lost=false;throw Error('Connection lost after commit');}
  result={ok:true,duplicate:true,job:{jobCard:'QA-JC',delivered:true}};
 }
 return {ok:true,status:200,json:async()=>result};
}
const errors=[];
async function runtime(saved=[]){
 const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(html,{url:'https://qa.invalid/receptionist.html',runScripts:'outside-only',virtualConsole:console});const w=dom.window;
 Object.defineProperty(w,'crypto',{value:webcrypto});w.fetch=fetch;w.AbortController=AbortController;w.confirm=()=>true;
 for(const [key,value] of saved)w.localStorage.setItem(key,value);
 if(!saved.length)w.localStorage.setItem('zukait_secure_session_v42',JSON.stringify({user,token:'qa-token'}));
 w.localStorage.setItem('prior-manager-private-cache','PRIVATE-MANAGER-DATA');
 const get=w.Storage.prototype.getItem;w.Storage.prototype.getItem=function(key){storageReads.push(key);return get.call(this,key)};
 const listen=w.addEventListener.bind(w);w.addEventListener=(name,handler,options)=>{if(name!=='load')listen(name,handler,options)};
 w.eval(sessionSource);w.eval(receptionSource);await w.zukaitReceptionist.restore();
 return {dom,w};
}
let {dom,w}=await runtime();
assert.ok(w.document.getElementById('login').classList.contains('hidden'));
await w.zukaitReception.openRecord('RC-QA');
assert.equal(w.document.querySelector('[data-rc-action="outcome"]'),null);
assert.equal(w.document.querySelector('[data-rc-action="parts"]'),null);
assert.equal(w.document.querySelector('[data-rc-action="cancel-job"]'),null);
w.document.querySelector('[data-rc-action="insurance"]').click();
assert.ok(w.document.getElementById('rc-create-job'));
assert.equal(w.document.getElementById('rc-approval'),null);
assert.equal(w.document.getElementById('rc-link-estimate'),null);
assert.ok(!w.document.getElementById('workspace').textContent.includes('OMR'));
await w.zukaitReceptionist.deliveries();
const body={action:'receptionist_deliver',operation:'DELIVER',jobCard:'QA-JC',expectedQcRevision:2,request_id:randomUUID()};
await w.zukaitReceptionist.deliver(body);assert.equal(writes,1);assert.deepEqual(JSON.parse(JSON.stringify(w.zukaitReceptionist.pending())),body);
const saved=Object.entries(w.localStorage);w.me=null;dom.window.close();
({dom,w}=await runtime(saved));await w.zukaitReceptionist.deliveries();
assert.ok(w.document.getElementById('retry-delivery'));
assert.ok(!w.document.getElementById('workspace').textContent.includes('Deliver Vehicle'));
await w.zukaitReceptionist.deliver(w.zukaitReceptionist.pending());
assert.equal(writes,1);assert.deepEqual(uuids,[body.request_id,body.request_id]);assert.equal(w.zukaitReceptionist.pending(),null);
// No request starts when storage cannot preserve its identity.
const set=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(key,value){if(key.startsWith('zukait_receptionist_delivery_v1:'))throw Error('Storage unavailable');return set.call(this,key,value)};
const before=requests.length;await w.zukaitReceptionist.deliver({...body,request_id:randomUUID()});assert.equal(requests.length,before);
w.Storage.prototype.setItem=set;
Object.defineProperty(w.navigator,'onLine',{configurable:true,value:false});
const offline={...body,request_id:randomUUID()};await w.zukaitReceptionist.deliver(offline);assert.equal(requests.length,before);assert.deepEqual(JSON.parse(JSON.stringify(w.zukaitReceptionist.pending())),offline);
Object.defineProperty(w.navigator,'onLine',{configurable:true,value:true});await w.zukaitReceptionist.deliver(w.zukaitReceptionist.pending());assert.equal(w.zukaitReceptionist.pending(),null);
const key='zukait_receptionist_delivery_v1:https://pjknotnjkufadqavcmii.supabase.co/functions/v1/:QA-RC';w.localStorage.setItem(key,'broken');
const corruptionBefore=requests.length;await w.zukaitReceptionist.deliver({...body,request_id:randomUUID()});assert.equal(requests.length,corruptionBefore);assert.equal(w.localStorage.getItem(key),'broken');
assert.ok(!storageReads.includes('prior-manager-private-cache'));
assert.ok(!requests.some(r=>['load','save','qc_delivery'].includes(r.action)));
w.me=null;dom.window.close();assert.deepEqual(errors,[]);
console.log('Receptionist client DOM: dedicated workspace, no workshop-state/cache reads, approved Job Card controls, explicit restart retry with same UUID, offline journal, storage failure and corrupt-journal refusal passed.');
