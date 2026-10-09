import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<div id="modal"></div>',{url:'https://test.invalid',runScripts:'outside-only'}),w=dom.window;
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))};
w.me={id:'QA-MANAGER',role:'Manager'};w.zukaitAuth={getToken:()=> 'qa'};
w.openModal=h=>w.document.getElementById('modal').innerHTML=h;
w.state={jobs:[{no:'QA001',vehicle:'Toyota Camry',make:'Toyota',model:'Camry',jobType:'INSURANCE',receptionNo:'RC-QA',receptionLocation:'VIW',colorCode:'OLD'}],assign:[],sessions:[]};
let r={rc_no:'RC-QA',revision:1,location:'VIW',job_card:'QA001',can_edit:true,insurance_id:1,insurance_company:'QA Insurance',details:{make:'Toyota',model:'Camry',tools:[]}};
let pulls=0,fail=true;const calls=[],cache=new Map();
w.zukaitCloud={pull:async force=>{assert.equal(force,true);pulls++;assert.equal(w.state.jobs[0].vehicle,'Toyota Camry');w.state.jobs[0].receptionLocation=r.location}};
w.fetch=async(_url,args)=>{const c=JSON.parse(args.body).command;calls.push(c);let result={ok:true};
 if(c.operation==='GET')result={ok:true,record:r,movements:[],audit:[],insurance:{can_prepare:false,estimates:[],approvals:[]}};
 if(c.operation==='COMPANIES')result={ok:true,companies:[{id:1,name:'QA Insurance'}]};
 if(['EDIT','MOVE'].includes(c.operation)){
  if(!cache.has(c.request_id)){r={...r,revision:r.revision+1,...(c.operation==='EDIT'?{details:c.details}:{location:c.location})};cache.set(c.request_id,{ok:true,record:r})}
  result=cache.get(c.request_id);if(fail){fail=false;throw Error('Response lost')}
 }
 return {ok:true,json:async()=>structuredClone(result)};
};
w.eval(fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8'));
await w.zukaitReception.openRecord(r.rc_no);
w.document.querySelector('[data-rc-action="edit"]').click();await settle();
const form=w.document.getElementById('rc-form');assert.ok(form.elements.reason.required);
form.elements.model.value='Altima';form.elements.make.value='Nissan';form.elements.reason.value='Correct vehicle identity';
form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
assert.equal(pulls,0);assert.equal(w.state.jobs[0].vehicle,'Toyota Camry');
form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
const edits=calls.filter(c=>c.operation==='EDIT');assert.equal(edits.length,2);assert.equal(edits[0].request_id,edits[1].request_id);assert.equal(edits[0].reason,'Correct vehicle identity');assert.equal(pulls,1);
w.document.querySelector('[data-rc-action="movement"]').click();await settle();
const move=w.document.getElementById('rc-move');move.elements.reason.value='Customer took vehicle';fail=true;
move.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(w.state.jobs[0].receptionLocation,'VIW');assert.equal(pulls,1);
move.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
assert.equal(w.state.jobs[0].receptionLocation,'VWC');assert.equal(pulls,2);const moves=calls.filter(c=>c.operation==='MOVE');assert.equal(moves[0].request_id,moves[1].request_id);
w.alert=()=>{};w.eval(fs.readFileSync('app/src/main/assets/job_card_master.js','utf8'));
const master=w.zukaitJobCardMaster;assert.equal(master.identity('QA001').receptionLocation,'VWC');assert.match(master.locationBadge('QA001'),/VWC.*With customer/);
master.patchIdentity('QA001',{make:'Stale'});assert.equal(w.state.jobs[0].make,'Toyota');
master.patchIdentity('QA001',{colorCode:'NEW'},{source:'PAINT_PURCHASE_ORDER'});assert.equal(w.state.jobs[0].colorCode,'NEW');
w.state.jobs.push({no:'LEGACY',make:'Toyota',model:'Corolla'});assert.equal(master.locationBadge('LEGACY'),'');master.patchIdentity('LEGACY',{model:'Yaris'});assert.equal(w.state.jobs[1].model,'Yaris');
w.state.jobs[0].reg='QA001';w.state.jobs[0].year='2018';w.users=[];
w.eval(fs.readFileSync('app/src/main/assets/manager_job_edit.js','utf8'));
w.editJobManager('QA001');assert.equal(w.document.getElementById('mje-make').readOnly,true);assert.equal(w.document.getElementById('mje-jobType').disabled,true);assert.equal(w.document.getElementById('mje-colorCode').readOnly,false);assert.equal(w.document.getElementById('mje-notes').readOnly,false);
let opened;w.zukaitReception.openRecord=no=>opened=no;w.document.querySelector('.mje-form>button').click();assert.equal(opened,'RC-QA');
assert.equal(w.state.sessions.length,0);assert.equal(w.state.assign.length,0);assert.equal(w.state.jobs[0].delivered,undefined);
// Current display must override historical snapshots, including intentionally cleared fields.
Object.assign(w.state.jobs[0],{vehicle:'Nissan Altima',make:'Nissan',model:'Altima',year:'',reg:'',vin:''});
const display=master.display('QA001',{modelYear:'2015',VIN:'OLD',registrationNo:'OLD'});assert.equal(display.year,'');assert.equal(display.modelYear,undefined);assert.equal(display.VIN,undefined);
const cached=[{listNo:'PL-QA',jobCard:'QA001',vehicle:'Toyota',model:'Camry',year:'2015',registration:'OLD',items:[{id:'PART-QA',name:'Lamp',qty:3,status:'ORDERED'}]}];
const originalCache=JSON.stringify(cached);w.localStorage.setItem('zukait_v2_spare_parts_lists_v1',originalCache);
w.eval(fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8'));
const rows=w.zukaitV2.sparePartsMain.reportRows();assert.match(rows[0].vehicle,/Nissan.*Altima/);assert.doesNotMatch(rows[0].vehicle,/Toyota|Camry|2015|OLD/);assert.equal(rows[0].qty,3);assert.equal(rows[0].status,'ORDERED');assert.equal(w.localStorage.getItem('zukait_v2_spare_parts_lists_v1'),originalCache);
w.esc=v=>String(v??'');w.eval(fs.readFileSync('app/src/main/assets/paint_module.js','utf8').split('\n').find(line=>line.startsWith('function orderHead(o)'))+'\nwindow.qaOrderHead=orderHead;');
const paint=w.qaOrderHead({jobCard:'QA001',poNumber:'PO-QA',make:'Toyota Camry',modelYear:'2015'});assert.match(paint,/Nissan Altima/);assert.doesNotMatch(paint,/Toyota|Camry|2015/);
console.log('Linked vehicle corrections and movements: mandatory reason, stable lost-response retries, no optimistic identity/location, confirmed refresh, badges, legacy edits and Paint PO color updates passed.');
dom.window.close();
