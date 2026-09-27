import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const elements=new Map(),alerts=[];
const el=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',className:'',classList:{add(){},remove(){}}});return elements.get(id)};
let priceEls=[],costEls=[];
const state={
 jobs:[{no:'JC1',vehicle:'Toyota Camry 2020',make:'Toyota',model:'Camry',vehicleYear:2020,reg:'REG1',colorCode:'040'}],
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
  querySelectorAll(sel){if(sel==='.paint-price')return priceEls;if(sel==='.paint-cost')return costEls;return []}
 },
 open(){return null}
};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext('let me=window.me; delete window.me;',ctx);
vm.runInContext(fs.readFileSync('app/src/main/assets/paint_module.js','utf8'),ctx);
ctx.paintPrintOrder=()=>{};

Object.assign(el('ppJc'),{value:'JC1'});ctx.paintLoadPOJob();assert.equal(el('ppYear').value,'2020','Model Year must auto-fill from the selected Job Card');assert.equal(el('ppColor').value,'040','Colour Code should load from the selected Job Card');
Object.assign(el('ppPo'),{value:'PO-Zi001'});Object.assign(el('ppVendor'),{value:'Paint Vendor'});Object.assign(el('ppType'),{value:'2K Paint'});Object.assign(el('ppQty'),{value:'0.600'});
ctx.paintAddPOLine();ctx.paintFinishPO();
assert.equal(state.paintPurchasing.orders.length,1);
const o=state.paintPurchasing.orders[0];
assert.equal(o.createdBy,'S1');
assert.equal(o.createdByName,'Supervisor One');
assert.equal(o.createdByRole,'Supervisor');

Object.assign(el('prJc'),{value:'JC1'});priceEls=[{value:'8.000'}];costEls=[{value:''}];
ctx.paintRecalcReceived(0,'price');assert.equal(costEls[0].value,'4.800','0.600 L × 8.000 OMR/L must calculate 4.800 OMR actual cost');
priceEls[0].value='';costEls[0].value='4.800';ctx.paintRecalcReceived(0,'cost');assert.equal(priceEls[0].value,'8.000','4.800 OMR ÷ 0.600 L must calculate 8.000 OMR/L');
ctx.paintReviewReceived(o.id);
assert.equal(o.receivedAt,undefined);
assert.match(ctx.modal,/FINAL CHECK BEFORE COSTING/);
assert.match(ctx.modal,/OMR 4\.800/);
ctx.paintConfirmReceived(o.id);
assert.ok(o.receivedAt);
assert.equal(o.receivedByName,'Supervisor One');
assert.equal(o.receivedByRole,'Supervisor');
assert.equal(o.lines[0].pricePerLitre,8);
assert.equal(o.lines[0].lineTotal,4.8);
assert.equal(state.paintCosting.JC1.netPaintCost,4.8);

const alertCount=alerts.length;
ctx.paintReviewReceived(o.id);
assert.equal(alerts.length,alertCount+1);
assert.match(alerts.at(-1),/already finalized/i);

const src=fs.readFileSync('app/src/main/assets/paint_module.js','utf8');
assert.match(src,/Possible duplicate Paint PO/);
assert.match(src,/Possible duplicate return/);
assert.match(src,/SERVER SYNCED/);
assert.match(src,/paint-color-code/,'Paint PO Color Code must have emphasized styling');
assert.match(src,/modelYearOf\(j\)/,'Paint PO must normalize Model Year from Job Card data');
assert.match(src,/class="paint-cost"/,'Received Paint must expose editable Actual Cost');
assert.match(src,/paintRecalcReceived/,'Received Paint must support two-way price/cost calculation');
assert.match(src,/paint-po-line-cards/,'Paint PO entry must use responsive line cards instead of a wide entry table');
assert.match(src,/paint-received-cards/,'Received Paint costing must use responsive cards');
assert.match(src,/paint-received-card/,'Received Paint must keep each paint line together on mobile');
console.log('Paint safety tests passed: auto Model Year, bold colour authority, two-way litre price/actual cost, actor audit and finalized costing');
