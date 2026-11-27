import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const elements={
 mcConsReturnJc:{value:'MC123'},
 mcConsReturnResult:{innerHTML:'',textContent:''},
 mcConsReturnFind:{disabled:false},
 mcConsReturnForm:{innerHTML:'',textContent:''},
 mcConsReturnStatus:{textContent:''}
};
const calls=[];
let response={ok:true,returnable:{items:[{lineId:'line1',name:'<img src=x onerror=alert(1)>',brand:'Brand & Co',availableToReturn:2,unit:'L'}],hasMore:false}};
const window={
 ZUKAIT_MECHANICAL_STOCK_ENABLED:true,
 zukaitCloud:{stockRequest:async request=>{calls.push(request);return response}},
 localStorage:{getItem:()=>null},
 openModal(){}
};
const context=vm.createContext({window,document:{getElementById:id=>elements[id]||null},me:{id:'supervisor-1',role:'Mechanical Supervisor'},console});
vm.runInContext(fs.readFileSync('app/src/main/assets/mechanical_consumables_ui.js','utf8'),context);
assert.equal(typeof window.mechanicalConsumablesFindReturnable,'function');
await window.mechanicalConsumablesFindReturnable(0);
assert.equal(calls.length,1);
assert.equal(calls[0].operation,'MECHANICAL_RETURNABLE');
assert.equal(calls[0].jobCard,'MC123');
assert.equal(calls[0].page,0);
assert.doesNotMatch(elements.mcConsReturnResult.innerHTML,/<img/);
assert.match(elements.mcConsReturnResult.innerHTML,/&lt;img/);
assert.match(elements.mcConsReturnForm.innerHTML,/Return unused material/);
assert.equal(elements.mcConsReturnFind.disabled,false);
elements.mcConsReturnJc.value='bad@jc';
await window.mechanicalConsumablesFindReturnable(0);
assert.equal(calls.length,1);
elements.mcConsReturnJc.value='MC123';
response={ok:false,code:'mechanical_stock_not_enabled'};
await window.mechanicalConsumablesFindReturnable(0);
assert.match(elements.mcConsReturnResult.textContent,/Unable to verify/);
window.ZUKAIT_MECHANICAL_STOCK_ENABLED=false;
await window.mechanicalConsumablesFindReturnable(0);
assert.equal(calls.length,2);
window.ZUKAIT_MECHANICAL_STOCK_ENABLED=true;
vm.runInContext("me={id:'accountant-1',role:'Accountant'}",context);
await window.mechanicalConsumablesFindReturnable(0);
assert.equal(calls.length,2);
assert.equal(calls.some(x=>x.operation==='WRITE'),false,'read-only lookup must never write stock');
// A pending response must not populate a reused modal after staff session changes.
vm.runInContext("me={id:'supervisor-1',role:'Mechanical Supervisor'}",context);
let resolveSlow;
window.zukaitCloud.stockRequest=()=>new Promise(resolve=>{resolveSlow=resolve});
const before=elements.mcConsReturnResult.innerHTML;
const inflight=window.mechanicalConsumablesFindReturnable(0);
vm.runInContext("me={id:'other-supervisor',role:'Mechanical Supervisor'}",context);
resolveSlow({ok:true,returnable:{items:[{name:'LEAKED',availableToReturn:1,unit:'Piece'}]}});
await inflight;
assert.doesNotMatch(elements.mcConsReturnResult.innerHTML,/LEAKED/,'stale response must not render after session change');
console.log('Mechanical returnable integration regression PASS');
