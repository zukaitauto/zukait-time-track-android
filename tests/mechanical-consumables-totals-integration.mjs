import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const elements = {
 mcConsTotalsJc:{value:'MC123'},
 mcConsTotalsResult:{innerHTML:'',textContent:''},
 mcConsTotalsGo:{disabled:false}
};
let calls=[], response={ok:true,totals:{readOnly:true,jobCard:'MC123',grossCost:12.5,returnCredit:2.5,netCost:10,items:[{name:'Oil',brand:'Brand A',issuedQty:2,returnedQty:1,unit:'L',netCost:10}],hasMore:false}};
const window={
 ZUKAIT_MECHANICAL_STOCK_ENABLED:true,
 zukaitCloud:{stockRequest:async data=>{calls.push(data);return response}},
 localStorage:{getItem:()=>null},
 openModal(){}
};
const context=vm.createContext({window,document:{getElementById:id=>elements[id]||null},me:{id:'supervisor-1',role:'Mechanical Supervisor'},console});
const source=fs.readFileSync('app/src/main/assets/mechanical_consumables_ui.js','utf8');
vm.runInContext(source,context);
assert.equal(typeof window.mechanicalConsumablesShowTotals,'function');
await window.mechanicalConsumablesShowTotals(0);
assert.equal(calls.length,1);
assert.equal(calls[0].operation,'MECHANICAL_TOTALS');
assert.equal(calls[0].jobCard,'MC123');
assert.equal(calls[0].page,0);
assert.match(elements.mcConsTotalsResult.innerHTML,/Net consumables: OMR 10\.000/);
assert.match(elements.mcConsTotalsResult.innerHTML,/Returned unused: − OMR 2\.500/);
assert.equal(elements.mcConsTotalsGo.disabled,false);

elements.mcConsTotalsJc.value='invalid@jc';
await window.mechanicalConsumablesShowTotals(0);
assert.equal(calls.length,1,'invalid JC must not make an API request');
elements.mcConsTotalsJc.value='MC123';
response={ok:false,code:'mechanical_stock_not_enabled'};
await window.mechanicalConsumablesShowTotals(0);
assert.match(elements.mcConsTotalsResult.textContent,/Unable to verify/);
window.ZUKAIT_MECHANICAL_STOCK_ENABLED=false;
await window.mechanicalConsumablesShowTotals(0);
assert.equal(calls.length,2,'disabled flag must block API requests');
window.ZUKAIT_MECHANICAL_STOCK_ENABLED=true;
vm.runInContext("me={id:'accountant-1',role:'Accountant'}",context);
await window.mechanicalConsumablesShowTotals(0);
assert.equal(calls.length,2,'Accountant must not use Mechanical totals endpoint');
vm.runInContext("me={id:'supervisor-1',role:'Mechanical Supervisor'}",context);
response={ok:true,totals:{readOnly:true,jobCard:'MC123',grossCost:1,returnCredit:0,netCost:1,items:[{name:'<img src=x onerror=alert(1)>',brand:'A&B',issuedQty:1,returnedQty:0,unit:'L',netCost:1}]}};
await window.mechanicalConsumablesShowTotals(0);
assert.doesNotMatch(elements.mcConsTotalsResult.innerHTML,/<img/,'material names must be escaped');
assert.match(elements.mcConsTotalsResult.innerHTML,/&lt;img/);
console.log('Mechanical totals integration regression PASS');
