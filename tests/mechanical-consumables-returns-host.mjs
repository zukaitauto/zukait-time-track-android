import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountMechanicalConsumablesReturns} from '../app/src/main/assets/mechanical_consumables_returns_host.js';
import {readFileSync} from 'node:fs';
const source=readFileSync('app/src/main/assets/mechanical_supervisor.js','utf8');
assert.match(source,/mechanical_consumables_returns_host\.js/);
assert.match(source,/body\.command!=='MECHANICAL_RETURN'/);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const dom=new JSDOM('<main id="host"></main>',{url:'https://qa.invalid'});
const root=dom.window.document.getElementById('host'),doc=dom.window.document;
const get=id=>doc.getElementById(id);
const click=text=>{
 const button=[...root.querySelectorAll('button')].find(x=>x.textContent===text);
 assert.ok(button,'Missing button: '+text);button.click();return button;
};
let enabled=false,role='Mechanical Supervisor',fails=0,serial=0,back=0;
const calls=[],user=()=>({id:'MS001',role,key:'session-1'});
const options={
 getSession:user,isEnabled:()=>true,stockEnabled:()=>enabled,
 storage:dom.window.localStorage,online:()=>true,onBack:()=>{back++},
 uuid:()=> 'return-uuid-'+(++serial),
 stockRequest:async req=>{
   calls.push(structuredClone(req));
   if(req.operation==='MECHANICAL_RETURNABLE')
     return {ok:true,returnable:{page:0,hasMore:false,items:[
       {lineId:71,jobCard:'JC12500',name:'Engine Oil 5W-30',brand:'Brand A',
        brandId:'a',quantity:4.5,availableToReturn:2.5,unit:'Liter'},
       {lineId:72,jobCard:'JC12500',name:'WD-40',brand:'Brand B',
        brandId:'b',quantity:2,availableToReturn:1,unit:'Piece'}]}};
   if(req.operation==='WRITE'){
     assert.equal(req.command,'MECHANICAL_RETURN');
     if(fails++===0)throw Error('Simulated timeout');
     return {ok:true,receipt:{returnId:25,lineId:req.data.lineId,
       jobCard:req.data.jobCard,quantity:req.data.quantity,credit:5,final:true}};
   }
   throw Error('Unknown stock operation');
 }
};
let host=await mountMechanicalConsumablesReturns(root,options);
assert.match(root.textContent,/not activated/);
assert.equal(calls.length,0);
host.destroy();
enabled=true;
host=await mountMechanicalConsumablesReturns(root,options);
assert.equal(calls.length,0,'no stock read on initial screen; JC lookup is user initiated');
get('mc-return-jc').value='JC12500';
click('Find issued materials');await tick();
assert.equal(calls[0].operation,'MECHANICAL_RETURNABLE');
assert.equal(calls[0].page,0);
assert.match(root.textContent,/Engine Oil 5W-30/);
assert.match(root.textContent,/Brand A/);
assert.match(root.textContent,/2.5 Liter/);
get('mc-return-qty').value='3';
get('mc-return-reason').value='Unused oil';
click('RETURN MATERIAL');
assert.match(root.textContent,/exceeds the amount originally issued/);
assert.equal(calls.length,1);
get('mc-return-qty').value='1.5';
get('mc-return-reason').value='x';
click('RETURN MATERIAL');
assert.match(root.textContent,/short reason/);
get('mc-return-reason').value='Unused engine oil';
click('RETURN MATERIAL');await tick();
assert.match(root.textContent,/Return not confirmed/);
assert.equal(get('mc-return-jc').disabled,true,'no changes allowed after timeout');
const stored='zukait_mechanical_return_pending_v1:MS001';
assert.ok(dom.window.localStorage.getItem(stored));
host.destroy();
host=await mountMechanicalConsumablesReturns(root,options);
assert.match(root.textContent,/Retry the same request/);
assert.equal(get('mc-return-jc').disabled,true);
click('Retry unconfirmed return');await tick();
assert.match(root.textContent,/RETURNED/);
assert.match(root.textContent,/5.000 OMR/);
const writes=calls.filter(x=>x.operation==='WRITE');
assert.equal(writes.length,2);
assert.equal(writes[0].requestId,writes[1].requestId,'reloaded retry uses same return request ID');
assert.deepEqual(writes[0].data,{
 lineId:71,jobCard:'JC12500',quantity:1.5,reason:'Unused engine oil'
});
assert.equal(dom.window.localStorage.getItem(stored),null);
host.destroy();
role='Supervisor';
const wrong=await mountMechanicalConsumablesReturns(root,options);
assert.match(root.textContent,/Mechanical Supervisor access required/);
assert.equal(calls.length,3);
wrong.destroy();
dom.window.close();
console.log('Mechanical Returns UI: JC lookup, original brand, overreturn and reason guards, timeout persisted receipt, role denial PASS');
