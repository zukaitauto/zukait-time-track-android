import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {mountMechanicalConsumablesTotals} from '../app/src/main/assets/mechanical_consumables_totals_host.js';
const src=readFileSync('app/src/main/assets/mechanical_supervisor.js','utf8');
assert.match(src,/mechanical_consumables_totals_host\.js/);
assert.match(src,/body\?\.operation!=='MECHANICAL_TOTALS'/);
const dom=new JSDOM('<main id="host"></main>',{url:'https://qa.invalid'});
const root=dom.window.document.getElementById('host');
const click=name=>{
  const b=[...root.querySelectorAll('button')].find(x=>x.textContent===name);
  assert.ok(b,'missing '+name);b.click();
};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let flag=false,role='Mechanical Supervisor',back=0;
const calls=[];
const user=()=>({id:'MS001',role,key:'qa'});
const options={
 getSession:user,isEnabled:()=>true,stockEnabled:()=>flag,onBack:()=>{back++},
 stockRequest:async p=>{
   calls.push(structuredClone(p));
   if(p.operation!=='MECHANICAL_TOTALS')throw Error('Only JC cost read allowed');
   return {ok:true,totals:{
     readOnly:true,jobCard:'JC12500',page:p.page,hasMore:p.page===0,
     grossCost:43.22222222,returnCredit:14.11111111,netCost:29.11111111,
     lineCount:23,returnCount:4,
     items:p.page===0?[{lineId:1,name:'Engine Oil 5W-30',brand:'Brand A',
       issuedQty:4,returnedQty:1,netCost:15,unit:'Liter'}]:[
         {lineId:23,name:'WD-40',brand:'Brand B',issuedQty:1,
         returnedQty:1,unit:'Piece',netCost:0}]
   }};
 }
};
let host=await mountMechanicalConsumablesTotals(root,options);
assert.match(root.textContent,/not activated/);
assert.equal(calls.length,0);
host.destroy();
flag=true;host=await mountMechanicalConsumablesTotals(root,options);
assert.equal(calls.length,0,'No database fetch until JC requested');
root.querySelector('#mc-total-jc').value='JC12500';
click('Show Total');await tick();
assert.deepEqual(calls[0],{operation:'MECHANICAL_TOTALS',jobCard:'JC12500',page:0});
assert.match(root.textContent,/43\.222/);
assert.match(root.textContent,/14\.111/);
assert.match(root.textContent,/29\.111/);
assert.match(root.textContent,/Brand A/);
assert.match(root.textContent,/23 issued lines/);
click('Next 20');await tick();
assert.equal(calls[1].page,1);
assert.match(root.textContent,/WD-40/);
assert.match(root.textContent,/29\.111/,'Net total is identical across pages');
assert.equal(calls.length,2);
host.destroy();
role='Supervisor';
host=await mountMechanicalConsumablesTotals(root,options);
assert.match(root.textContent,/Mechanical Supervisor access required/);
assert.equal(calls.length,2);
host.destroy();dom.window.close();
console.log('Mechanical totals host: default-off, on-demand JC lookup, gross/return/net, pagination and role checks PASS');
