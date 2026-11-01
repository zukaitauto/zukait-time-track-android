import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Use the existing app Paint UI harness, with real handlers and a synthetic PO.
const raw=fs.readFileSync('tests/paint-safety.mjs','utf8');
const harness=raw.split("Object.assign(el('ppJc')")[0].replace(/^import .*;\r?\n/gm,'');
const box={fs,vm,assert,console};
vm.createContext(box);
vm.runInContext(harness+"\nwindow.testContext=ctx;window.testState=state;window.testElement=el;window.testAlerts=alerts;",Object.assign(box,{window:box}));
const {testContext:app,testState:state,testElement:el,testAlerts:alerts}=box;
const receivedAt=Date.parse('2026-10-31T11:09:34+04:00');
const po={id:'paint-052',poNumber:'PO-Zi052',jobCard:'12105',vendor:'Zukait auto paint LLC',
 colorCode:'ZMW',status:'RECEIVED',createdAt:receivedAt-120000,
 receivedAt,receivedBy:'SUP001',receivedByName:'Vinayan',
 lines:[{id:'line-1',paintType:'Base Coat',quantity:0.5,pricePerLitre:8,lineTotal:4}],
 returns:[],supervisorName:'Vinayan'};
state.jobs.push({no:'12105',make:'Suzuki',model:'SX4',vehicle:'SUZUKI SX4',year:2014});
state.paintPurchasing.orders=[po];
app.document.querySelectorAll=selector=>({
 '.peType':[{value:'Base Coat'}],
 '.peQty':[{value:'0.5'}],
 '.pePrice':[{value:'8'}],
})[selector]||[];
const login=(id,role)=>vm.runInContext('me='+JSON.stringify({id,name:role==='Manager'?'Manager':'Supervisor',role}),app);
login('MGR001','Manager');
app.paintEditOrder(po.id);
assert.match(app.modal,/Received Date \(Oman\)/);
assert.match(app.modal,/id="peReceivedDate" type="date" value="2026-10-31"/);
assert.match(app.modal,/Received Date \(Oman\): 2026-10-31/);
el('peReason').value='Correct supplier receipt calendar date';
el('peReceivedDate').value='2026-10-30';
el('peVendor').value=po.vendor;
el('peColor').value=po.colorCode;
app.paintSaveEdit(po.id);
assert.equal(po.receivedAt,receivedAt-86400000,'Change only Oman calendar day, retain 11:09:34 receipt time');
assert.equal(po.receivedBy,'SUP001','Receipt author remains the original Supervisor');
assert.equal(po.receivedByName,'Vinayan');
assert.equal(state.paintPurchasing.audit.at(-1).type,'MANAGER_PAINT_CORRECTION');
assert.equal(state.paintPurchasing.audit.at(-1).before.receivedAt,receivedAt);
assert.equal(state.paintPurchasing.audit.at(-1).after.receivedAt,po.receivedAt);
assert.equal(state.paintPurchasing.audit.at(-1).reason,'Correct supplier receipt calendar date');
assert.equal(state.paintCosting['12105'].netPaintCost,4);
assert.equal(state.jobs.find(j=>j.no==='12105').paintCost,4);
assert.ok(app.saved,'Manager correction uses the shared persistent save');
app.paintRenderPOList();
assert.match(el('paintPOListRows').innerHTML,/Received Date: 2026-10-30/);
app.paintEditOrder(po.id);
assert.match(app.modal,/id="peReceivedDate" type="date" value="2026-10-30"/);

// Reject invalid and future dates without changing records or adding audit.
const count=state.paintPurchasing.audit.length,before=po.receivedAt;
el('peReason').value='Correct date';
el('peReceivedDate').value='2099-01-01';
app.paintSaveEdit(po.id);
assert.match(alerts.at(-1),/valid Received Date/);
assert.equal(po.receivedAt,before);
assert.equal(state.paintPurchasing.audit.length,count);
el('peReceivedDate').value='2026-02-30';
app.paintSaveEdit(po.id);
assert.equal(po.receivedAt,before);
assert.equal(state.paintPurchasing.audit.length,count);
el('peReceivedDate').value='2026-10-29';
el('peReason').value='';
app.paintSaveEdit(po.id);
assert.match(alerts.at(-1),/Edit Reason is required/);
assert.equal(po.receivedAt,before);
assert.equal(state.paintPurchasing.audit.length,count);

// Manager edit must not invent a receipt for a PO that is still waiting.
const pending={...po,id:'paint-pending',poNumber:'PO-Zi053',status:'PENDING',receivedAt:null};
state.paintPurchasing.orders.push(pending);
app.paintEditOrder(pending.id);
assert.match(app.modal,/Not received — finalize receipt first/);
assert.doesNotMatch(app.modal,/id="peReceivedDate"/);
el('peReason').value='Correct vendor';
app.paintSaveEdit(pending.id);
assert.equal(pending.receivedAt,null);

// Supervisor cannot open the Manager correction or change the date.
login('SUP001','Supervisor');
app.paintEditOrder(po.id);
const previous=po.receivedAt;
el('peReason').value='Unauthorized correction';
el('peReceivedDate').value='2026-10-25';
app.paintSaveEdit(po.id);
assert.equal(po.receivedAt,previous);

// Run the backend Manager-only correction guard as executable JS from source.
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const start=api.indexOf('function validatePaintManagerCorrections(');
const end=api.indexOf('// Derived cost projection',start);
assert.ok(start>=0&&end>start);
const js=api.slice(start,end).replace(/:\s*any\b/g,'');
const server=vm.createContext({same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),Date,Number,String,Map});
vm.runInContext(js,server);
const validate=(actor,first,second)=>vm.runInContext('validatePaintManagerCorrections(before,after,actor)',Object.assign(server,{
 actor,before:{paintPurchasing:{orders:[first]}},after:{paintPurchasing:{orders:[second]}}
}));
const base={...po,receivedAt,correctedAt:0};
const valid={...base,receivedAt:receivedAt-86400000,correctedAt:Date.now(),correctedBy:'MGR001',correctionReason:'Date verified'};
assert.equal(validate({id:'MGR001',role:'Manager'},base,valid),null);
assert.equal(validate({id:'SUP001',role:'Supervisor'},base,valid),'manager_required_to_correct_paint_received_date');
assert.equal(validate({id:'MGR001',role:'Manager'},base,{...valid,correctionReason:''}),'manager_required_to_correct_paint_received_date');
assert.equal(validate({id:'MGR001',role:'Manager'},base,{...valid,receivedAt:null}),'paint_received_date_invalid');
assert.equal(validate({id:'SUP001',role:'Supervisor'},{...base,receivedAt:null},{...base,receivedAt:receivedAt}),null,'Initial Supervisor receipt remains valid');
console.log('PASS: Paint PO received-date display, audited Manager correction, Oman clock preservation, no future/invalid dates, pending receipt unchanged and server guard');
