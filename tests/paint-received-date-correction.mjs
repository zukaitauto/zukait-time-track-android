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

// Exercise the list and detail renderers with the reported floating-point sum.
const example={...po,id:'paint-059',poNumber:'PO-Zi059',jobCard:'JC12086',vendor:'New Wishes Trading',
 createdAt:'2026-11-04T12:20:00Z',receivedAt:String(Date.parse('2026-11-04T12:22:00Z')),
 lines:[
  {paintType:'Base Coat',quantity:0.7,pricePerLitre:11,lineTotal:7.7},
  {paintType:'Pearl Coat',quantity:0.6,pricePerLitre:11,lineTotal:6.6}
 ]};
const overnight={...example,id:'overnight',poNumber:'PO-overnight',
 createdAt:Date.parse('2026-10-31T23:58:00+04:00'),receivedAt:'2026-11-01T00:02:00+04:00'};
const undated={...example,id:'undated',poNumber:'PO-undated',receivedAt:'invalid'};
state.paintPurchasing.orders=[example,overnight,undated,pending];
assert.equal(example.lines.reduce((total,line)=>total+line.quantity,0),1.2999999999999998);
const beforeDisplay=JSON.stringify(state.paintPurchasing);
app.saved=false;
el('paintPOListQuery').value=example.poNumber;
app.paintRenderPOList();
const list=el('paintPOListRows').innerHTML;
assert.match(list,/Created: 04\/11\/2026, 4:20:00 pm/i);
assert.match(list,/Received Date: 2026-11-04/);
assert.match(list,/Total Quantity: 1\.300 Liter/);
assert.match(list,/>Received<\/span>/);
app.paintOpenPORecord(example.id);
const details=el('psOut').innerHTML;
assert.match(details,/>0\.700 L</);
assert.match(details,/>0\.600 L</);
assert.match(details,/OMR 14\.300/);
assert.match(details,/Received By: Vinayan · 04\/11\/2026, 4:22:00 pm/i);
el('paintPOMonth').value='2026-10';
el('paintPOListQuery').value='';
app.paintRenderPOList();
assert.match(el('paintPOListRows').innerHTML,/PO-overnight.*Received Date: 2026-11-01/);
el('paintPOListQuery').value=pending.poNumber;
app.paintRenderPOList();
assert.match(el('paintPOListRows').innerHTML, /Waiting for Paint/);
assert.doesNotMatch(el('paintPOListRows').innerHTML,/Received Date:/);
el('paintReceivedMonth').value='2026-11';
app.paintRenderReceivedList();
const receipts=el('paintReceivedListRows').innerHTML;
assert.match(receipts,/PO-overnight.*01\/11\/2026, 12:02:00 am/i);
assert.doesNotMatch(receipts,/PO-undated/);
el('paintReceivedMonth').value='';
el('paintReceivedListQuery').value='PO-undated';
app.paintRenderReceivedList();
assert.match(el('paintReceivedListRows').innerHTML,/Date unavailable/);
assert.equal(JSON.stringify(state.paintPurchasing),beforeDisplay);
assert.equal(app.saved,false);

// Run the backend Manager-only correction guard as executable JS from source.
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const start=api.indexOf('function validatePaintManagerCorrections(');
const end=api.indexOf('// Derived cost projection',start);
assert.ok(start>=0&&end>start);
const js=api.slice(start,end).replace(/:\s*any\b/g,'');
const server=vm.createContext({same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),Date,Number,String,Map});
vm.runInContext(js,server);
const validate=(actor,first,second)=>vm.runInContext('validatePaintManagerCorrections(after,before,actor)',Object.assign(server,{
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
