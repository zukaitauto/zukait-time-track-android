import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const storage=new Map(),calls=[];
let failOnce=true;
const elements={
 mcConsReturnJc:{value:'MC123'},
 mcConsReturnResult:{innerHTML:'',textContent:''},
 mcConsReturnFind:{disabled:false},
 mcConsReturnForm:{innerHTML:'',textContent:''},
 mcConsReturnStatus:{textContent:''},
 mcConsReturnLine:{value:'0'},
 mcConsReturnQty:{value:'1'},
 mcConsReturnReason:{value:'Unused material returned'}
};
const window={
 ZUKAIT_MECHANICAL_STOCK_ENABLED:true,
 localStorage:{
  getItem:key=>storage.get(key)||null,
  setItem:(key,value)=>storage.set(key,value),
  removeItem:key=>storage.delete(key)
 },
 zukaitCloud:{stockRequest:async request=>{
  calls.push(request);
  if(request.operation==='MECHANICAL_RETURNABLE')return {ok:true,returnable:{items:[{lineId:'line-1',name:'Oil',brand:'B',availableToReturn:2,unit:'L'}],hasMore:false}};
  if(failOnce){failOnce=false;throw Error('network timeout')}
  return {ok:true,receipt:{final:true,lineId:'line-1',jobCard:'MC123',quantity:1,credit:1.25}};
 }},
 openModal(){}
};
const context=vm.createContext({window,document:{getElementById:id=>elements[id]||null},me:{id:'supervisor-1',role:'Mechanical Supervisor'},console});
vm.runInContext(fs.readFileSync('app/src/main/assets/mechanical_consumables_ui.js','utf8'),context);
await window.mechanicalConsumablesFindReturnable(0);
await window.mechanicalConsumablesSubmitReturn();
const writes=()=>calls.filter(x=>x.operation==='WRITE');
assert.equal(writes().length,1);
assert.equal(writes()[0].command,'MECHANICAL_RETURN');
assert.equal(writes()[0].data.jobCard,'MC123');
assert.equal(writes()[0].data.lineId,'line-1');
assert.equal(writes()[0].data.quantity,1);
assert.equal(storage.size,1,'timeout must preserve original request for retry');
await window.mechanicalConsumablesSubmitReturn();
assert.equal(writes().length,2,'pending submit may only retry original request');
assert.equal(writes()[1].requestId,writes()[0].requestId);
assert.equal(storage.size,0,'confirmed receipt clears pending request');
assert.match(elements.mcConsReturnStatus.textContent,/RETURNED/);
await window.mechanicalConsumablesSubmitReturn();
assert.equal(writes().length,2,'completed return must require a fresh original-issue lookup');
console.log('Mechanical audited return retry regression PASS');
