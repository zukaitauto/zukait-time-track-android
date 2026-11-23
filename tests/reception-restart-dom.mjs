import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
const source=fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8');
const requests=new Map(),commands=[];let record=null,creates=0,movements=0,lose='CREATE';
const runtimeErrors=[];
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
function start(saved=[]) {
  const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>runtimeErrors.push(error.message));
  const dom=new JSDOM('<div id="modal"></div>',{url:'https://acceptance.invalid',runScripts:'outside-only',virtualConsole}),w=dom.window;
  w.me={id:'QA-MANAGER',role:'Manager'};w.zukaitAuth={getToken:()=> 'qa'};
  w.openModal=h=>w.document.getElementById('modal').innerHTML=h;
  for(const [key,value] of saved)w.localStorage.setItem(key,value);
  w.fetch=async(_,args)=>{
    const c=JSON.parse(args.body).command;commands.push(c);let out={ok:true};
    if(c.operation==='CAPABILITIES')out={ok:true,allowed:true,manager:true};
    if(c.operation==='MASTER')out={ok:true,companies:[{id:1,name:'QA Insurance'}]};
    if(c.operation==='LIST')out={ok:true,rows:record?[record]:[]};
    if(c.operation==='GET')out={ok:true,record,movements:[],audit:[]};
    if(['CREATE','MOVE'].includes(c.operation)) {
      if(!requests.has(c.request_id)) {
        if(c.operation==='CREATE'){creates++;record={rc_no:'RC-QA',sequence_no:1,revision:1,location:'VIW',approval_status:'WAITING',insurance_company:'QA Insurance',details:c.details,can_edit:true};}
        else {movements++;record={...record,location:c.location,revision:record.revision+1};}
        requests.set(c.request_id,{ok:true,record:structuredClone(record)});
      }
      out=requests.get(c.request_id);
      if(lose===c.operation){lose=null;throw Error('Response lost after commit');}
    }
    return {ok:true,status:200,json:async()=>structuredClone(out)};
  };
  w.eval(source);
  return {dom,w};
}
const snapshot=w=>Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]);
const click=async(w,action)=>{w.document.querySelector(`[data-rc-action="${action}"]`).click();await settle();};
const submit=async(w,id)=>{w.document.getElementById(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();};
let {dom,w}=start();await w.zukaitReception.open();await click(w,'new');
for(const [name,value] of [['make','Toyota'],['model','Corolla'],['insurance_id','1']])w.document.querySelector(`[name="${name}"]`).value=value;
await submit(w,'rc-form');assert.equal(creates,1);assert.match(w.document.getElementById('rc-error').textContent,/Response lost/);
const create=commands.find(c=>c.operation==='CREATE'),saved=snapshot(w);w.me=null;dom.window.close();
({dom,w}=start(saved));await w.zukaitReception.open();assert.ok(w.document.querySelector('[data-rc-action="retry-pending"]'));
assert.equal(commands.filter(c=>c.operation==='CREATE').length,1,'Opening after restart does not replay automatically');
await click(w,'retry-pending');assert.equal(creates,1);assert.equal(commands.filter(c=>c.operation==='CREATE').at(-1).request_id,create.request_id);
assert.match(w.document.getElementById('rc-root').textContent,/RC-QA/);assert.equal(w.document.getElementById('rc-retry'),null);assert.equal(w.localStorage.length,0);
await click(w,'movement');w.document.querySelector('[name="reason"]').value='QA handover';lose='MOVE';await submit(w,'rc-move');
assert.equal(record.location,'VWC');assert.ok(w.document.getElementById('rc-move'),'No optimistic success after lost response');
const move=commands.find(c=>c.operation==='MOVE'),savedMove=snapshot(w);w.me=null;dom.window.close();
({dom,w}=start(savedMove));await w.zukaitReception.open();await click(w,'retry-pending');
assert.equal(movements,1);assert.equal(commands.filter(c=>c.operation==='MOVE').at(-1).request_id,move.request_id);
assert.match(w.document.getElementById('rc-root').textContent,/With customer/);assert.equal(w.localStorage.length,0);
w.me=null;dom.window.close();
await settle();assert.deepEqual(runtimeErrors,[],'UI runtime errors must fail acceptance tests');
console.log('Reception DOM restart recovery: persisted CREATE/MOVE, visible explicit retry, original UUIDs, one write each, no auto-replay/optimistic success and confirmed fresh view passed. Mocked transport only.');
