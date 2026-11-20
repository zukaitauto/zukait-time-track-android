import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountMechanicalConsumablesHost} from '../app/src/main/assets/mechanical_consumables_host.js';

const records=[
  {materialId:'oil',name:'Engine Oil 5W-30',brandId:'a',brand:'Brand A',unit:'Liter',physical:15,reserved:2},
  {materialId:'oil',name:'Engine Oil 5W-30',brandId:'b',brand:'Brand B',unit:'Liter',physical:10,reserved:0},
  {materialId:'wd40',name:'WD-40 Can',brandId:'a',brand:'Brand A',unit:'Piece',physical:4,reserved:0}
];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const dom=new JSDOM('<div id="root"></div>',{url:'https://local.invalid'});
const doc=dom.window.document,root=doc.getElementById('root');
let role='Mechanical Supervisor',token='secure-test',active=true,flag=false;
const user=()=>({role,id:'MC003',key:token});
const calls=[];
let fails=0,serial=0;
const options={
  getSession:user,isEnabled:()=>active,stockEnabled:()=>flag,
  storage:dom.window.localStorage,online:()=>true,
  uuid:()=>String(++serial).padStart(6,'0'),
  onBack:()=>{},
  stockRequest:async body=>{
    calls.push(structuredClone(body));
    if(body.operation==='CATALOG')return {ok:true,items:records,hasMore:false};
    if(body.operation==='WRITE'){
      assert.equal(body.command,'MECHANICAL_ISSUE');
      if(fails++===0)throw Error('Simulated timeout');
      return {ok:true,receipt:{jobCard:body.data.jobCard,lineCount:body.data.lines.length,
        totalCost:27.5,final:true,issueId:100}};
    }
    throw Error('Unexpected stock request: '+body.operation);
  }
};
let host=await mountMechanicalConsumablesHost(root,options);
assert.match(root.textContent,/not yet activated/);
assert.equal(calls.length,0,'disabled Mechanical stock must not query anything');
host.destroy();
flag=true;
host=await mountMechanicalConsumablesHost(root,options);
assert.equal(calls.length,1,'one bounded stock catalog query per open');
assert.equal(calls[0].operation,'CATALOG');
assert.match(root.textContent,/Mechanical Job Card/);
assert.match(root.textContent,/Engine Oil 5W-30/);
assert.match(root.textContent,/Brand A/);
assert.match(root.textContent,/Available: 13.00 Liter/);
doc.getElementById('mc-stock-jc').value='JC12500';
doc.getElementById('mc-stock-quantity').value='2.5';
root.querySelector('button[data-missing]'); // no generic action/read route should fire
const submit=[...root.querySelectorAll('button')].find(b=>b.textContent==='ISSUE MATERIALS');
assert.equal(submit.disabled,false);
submit.click();await tick();
assert.match(root.textContent,/Issue not confirmed/);
const sent=calls.filter(x=>x.operation==='WRITE');
assert.equal(sent.length,1);
assert.deepEqual(sent[0].data,{jobCard:'JC12500',kind:'issued',
  lines:[{materialId:'oil',brandId:'a',quantity:2.5}]});
assert.ok(dom.window.localStorage.getItem('zukait_mechanical_issue_pending_v1:MC003'));
assert.equal(doc.getElementById('mc-stock-jc').disabled,true,'uncertain receipt locks input until retry');
host.destroy();
host=await mountMechanicalConsumablesHost(root,options);
assert.match(root.textContent,/earlier issue is awaiting confirmation/);
assert.equal([...root.querySelectorAll('button')].find(b=>b.textContent==='ISSUE MATERIALS').disabled,true);
const retry=[...root.querySelectorAll('button')].find(b=>b.textContent==='Retry unconfirmed issue');
assert.equal(retry.hidden,false);
retry.click();await tick();
assert.match(root.textContent,/ISSUED · JC12500/);
const writes=calls.filter(x=>x.operation==='WRITE');
assert.equal(writes.length,2);
assert.equal(writes[0].requestId,writes[1].requestId,'retry across reload uses original ID');
assert.equal(dom.window.localStorage.getItem('zukait_mechanical_issue_pending_v1:MC003'),null);
host.destroy();
role='Supervisor';
const denied=await mountMechanicalConsumablesHost(root,options);
assert.match(root.textContent,/Mechanical Supervisor access required/);
assert.equal(calls.filter(x=>x.operation==='WRITE').length,2);
denied.destroy();
dom.window.close();
console.log('Dedicated Mechanical host: default-off no reads, small catalog, final-on-issue, persisted timeout retry, non-Mechanical denial PASSED');
