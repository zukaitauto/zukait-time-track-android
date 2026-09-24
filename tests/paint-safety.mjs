import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const elements=new Map(),alerts=[];
const el=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',className:'',classList:{add(){},remove(){}}});return elements.get(id)};
let priceEls=[];
const state={
 jobs:[{no:'JC1',vehicle:'Toyota Camry',make:'Toyota',model:'Camry',year:2020,reg:'REG1'}],
 assign:[{id:'A1',job:'JC1',emp:'P1',assignedBy:'S1',assignedAt:Date.now()}],
 paintPurchasing:{orders:[],audit:[]},
 paintCosting:{}
};
const ctx={
 state,
 users:[{id:'P1',name:'Painter',department:'Painter',role:'Employee'},{id:'S1',name:'Supervisor One',role:'Supervisor'}],
 me:{id:'S1',name:'Supervisor One',role:'Supervisor'},
 console,
 navigator:{onLine:true},
 setTimeout:fn=>fn(),
 confirm:()=>true,
 alert:x=>alerts.push(String(x)),
 save(){ctx.saved=true},
 closeModal(){},
 openModal(html){ctx.modal=html},
 document:{
  head:{appendChild(){}},
  createElement(){return {textContent:'',style:{}}},
  getElementById:id=>el(id),
  querySelector(){return null},
  querySelectorAll(sel){return sel==='.paint-price'?priceEls:[]}
 },
 open(){return null}
};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext('let me=window.me; delete window.me;',ctx);
vm.runInContext(fs.readFileSync('app/src/main/assets/paint_module.js','utf8'),ctx);
ctx.paintPrintOrder=()=>{};

Object.assign(el('ppJc'),{value:'JC1'});ctx.paintLoadPOJob();
Object.assign(el('ppPo'),{value:'PO-Zi001'});Object.assign(el('ppVendor'),{value:'Paint Vendor'});Object.assign(el('ppType'),{value:'2K Paint'});Object.assign(el('ppQty'),{value:'1'});
ctx.paintAddPOLine();ctx.paintFinishPO();
assert.equal(state.paintPurchasing.orders.length,1);
const o=state.paintPurchasing.orders[0];
assert.equal(o.createdBy,'S1');
assert.equal(o.createdByName,'Supervisor One');
assert.equal(o.createdByRole,'Supervisor');

priceEls=[{value:'5'}];
ctx.paintReviewReceived(o.id);
assert.equal(o.receivedAt,undefined);
assert.match(ctx.modal,/FINAL CHECK BEFORE COSTING/);
assert.match(ctx.modal,/OMR 5\.000/);
ctx.paintConfirmReceived(o.id);
assert.ok(o.receivedAt);
assert.equal(o.receivedByName,'Supervisor One');
assert.equal(o.receivedByRole,'Supervisor');
assert.equal(state.paintCosting.JC1.netPaintCost,5);

const alertCount=alerts.length;
ctx.paintReviewReceived(o.id);
assert.equal(alerts.length,alertCount+1);
assert.match(alerts.at(-1),/already finalized/i);

const src=fs.readFileSync('app/src/main/assets/paint_module.js','utf8');
assert.match(src,/Possible duplicate Paint PO/);
assert.match(src,/Possible duplicate return/);
assert.match(src,/SERVER SYNCED/);
console.log('Paint safety tests passed: actor audit, review-before-costing, finalized duplicate protection and sync status');
