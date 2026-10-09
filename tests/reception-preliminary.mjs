import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<div id="managerView"></div><div id="modal"></div>',{url:'https://test.invalid',runScripts:'outside-only'}),w=dom.window;
let record={rc_no:'RC0001',sequence_no:1,insurance_id:1,insurance_company:'Liva Insurance',details:{make:'Toyota',model:'Camry'},revision:1,location:'VWC',approval_status:'WAITING',can_edit:true},items=[],canEdit=true,fail=false;
const commands=[],requests=new Map();
w.me={id:'QA-MANAGER',role:'Manager'};w.zukaitAuth={getToken:()=> 'qa'};w.openModal=h=>w.document.getElementById('modal').innerHTML=h;w.closeModal=()=>{};
w.fetch=async(_url,args)=>{
 const c=JSON.parse(args.body).command;commands.push(c);let result={ok:true};
 if(c.operation==='CAPABILITIES')result={ok:true,allowed:true,manager:true};
 if(c.operation==='LIST')result={ok:true,rows:[record]};
 if(c.operation==='GET')result={ok:true,record,movements:[],audit:[],preliminary_parts:{items,can_edit:canEdit}};
 if(c.operation==='SAVE_PARTS'){
  if(requests.has(c.request_id))result=requests.get(c.request_id);
  else{items=structuredClone(c.items);record={...record,revision:record.revision+1};result={ok:true,record};requests.set(c.request_id,result)}
  if(fail){fail=false;throw Error('Response lost after save')}
 }
 return {ok:true,json:async()=>structuredClone(result)};
};
w.eval(fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8'));
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))};
const click=async(action)=>{w.document.querySelector(`[data-rc-action="${action}"]`).click();await settle()};
await w.zukaitReception.open();await click('view');await click('parts');
w.document.getElementById('rc-add-part').click();
const row=w.document.querySelector('#rc-parts-rows > div'),id=row.dataset.partId;
row.querySelector('[name="part_name"]').value='<script>bumper</script>';row.querySelector('[name="part_no"]').value='B100';row.querySelector('[name="part_qty"]').value='2';w.document.querySelector('[name="reason"]').value='Preliminary estimate';
const submit=async()=>{w.document.getElementById('rc-parts').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle()};
fail=true;await submit();assert.match(w.document.getElementById('rc-error').textContent,/Response lost/);assert.ok(w.document.getElementById('rc-parts'),'keep form for retry');
const request=commands.find(c=>c.operation==='SAVE_PARTS').request_id;
await submit();assert.equal(items.length,1);assert.equal(record.revision,2);assert.equal(commands.filter(c=>c.operation==='SAVE_PARTS').at(-1).request_id,request);assert.equal(items[0].id,id);assert.equal(record.location,'VWC');assert.equal(record.approval_status,'WAITING');assert.equal(record.job_card,undefined);
canEdit=false;await click('home');await click('view');await click('parts');assert.equal(w.document.getElementById('rc-parts'),null);assert.match(w.document.getElementById('rc-root').textContent,/<script>bumper<\/script>/);assert.equal(w.document.querySelectorAll('#rc-root script').length,0);
assert.ok(commands.every(c=>['CAPABILITIES','LIST','GET','SAVE_PARTS'].includes(c.operation)),'no operational event or allocation');
w.me=null;await settle();dom.window.close();console.log('Preliminary parts UI: stable item/request IDs, lost-response retry, preserved location/status, read-only access and escaping passed.');
