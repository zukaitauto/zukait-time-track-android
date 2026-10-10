import fs from "node:fs";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
const html='<div id="managerView"></div><div id="supervisorView" class="hidden"></div><div id="employeeView" class="hidden"></div><div id="modal"></div>';
const dom=new JSDOM(html,{url:"https://qa.invalid",runScripts:"outside-only"});
const w=dom.window,commands=[];w.me={id:"QA-MGR",name:"QA Manager",role:"Manager"};
w.zukaitAuth={getToken:()=>"QA-EXISTING-MANAGER-TOKEN"};
w.openModal=text=>w.document.getElementById("modal").innerHTML=text;
w.closeModal=()=>w.document.getElementById("modal").replaceChildren();
let promise="";
w.fetch=async(_url,args)=>{
 assert.equal(args.headers["x-zukait-session"],"QA-EXISTING-MANAGER-TOKEN");
 const body=JSON.parse(args.body);commands.push(body);
 let res={ok:true};
 if(body.action==="reception"&&body.command.operation==="CAPABILITIES")res={ok:true,allowed:true,manager:true};
 if(body.action==="reception"&&body.command.operation==="MASTER")res={ok:true,companies:[]};
 if(body.action==="reception"&&body.command.operation==="LIST")res={ok:true,rows:[]};
 if(body.action==="reception_dashboard"){
  const row={rc_no:"RC0012",sequence_no:12,job_card:"JC120",vehicle:"Toyota Camry 2024",
   registration:"QA 123",job_type:"INSURANCE",received_date:"2026-10-10",created_date:"2026-10-10",
   promise_date:promise,delivered_date:"",location:"VIW",status:"Open",delivered:false};
  res={ok:true,counts:{checklists:1,jobs:1,waiting:0,"vwc-checklists":0,"vwc-jobs":0,vwc:0,
   approved:0,ready:0,delivered:0,followup:1,no_promise_date:promise?0:1},
   section:body.section,rows:[row],page_size:50,total:1};
 }
 if(body.action==="reception_promise_date"){
   assert.equal(body.job_card,"JC120");assert.equal(body.expected_promise_date,"");
   assert.equal(body.promise_date,"2026-10-15");promise=body.promise_date;
   res={ok:true,promise_date:promise,job_card:"JC120"};
 }
 return {ok:true,json:async()=>structuredClone(res)};
};
Object.defineProperty(w.crypto,"randomUUID",{configurable:true,value:()=> "f474101c-73a4-4c0b-930d-5aa5cd6feb64"});
w.eval(fs.readFileSync("app/src/main/assets/v2/features/insurance/reception.js","utf8"));
w.eval(fs.readFileSync("app/src/main/assets/reception_dashboard.js","utf8"));
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));};
await w.zukaitReception.open();await settle();
let buttons=w.document.querySelectorAll("#rc-root [data-rdb=tile]");
assert.equal(buttons.length,10,"Reception home shows ten requested cards");
for(const [i,name] of ["Create Checklist","Create Job Card","Checklist List","Job Card List","Approval Waiting Insurance",
"Vehicle With Customer","Approved Vehicles","Ready to Deliver","Delivered Vehicle List","Delivery Follow-up"].entries())
 assert.ok(buttons[i].textContent.includes(name),name+" label missing");
const click=async(selector)=>{const b=w.document.querySelector(selector);assert.ok(b,selector);b.click();await settle();};
await click('#rc-root [data-rdb=tile][data-section=jobs]');
assert.equal(w.document.querySelectorAll(".rdb-row").length,1);
assert.equal(w.document.querySelector("#rc-root [data-rdb-promise]")?.value,"");
const input=w.document.querySelector("#rc-root [data-rdb-promise]");
input.value="2026-10-15";
await click('#rc-root [data-rdb=promise]');
assert.equal(promise,"2026-10-15");
assert.equal(commands.filter(x=>x.action==="reception_promise_date").length,1);
assert.equal(w.document.querySelector("#rc-root [data-rdb-promise]")?.value,"2026-10-15");
await click('#rc-root [data-rdb=tile][data-section=followup]');
const from=w.document.querySelector("[data-rdb-filter=from]");from.value="2026-10-10";
from.dispatchEvent(new w.Event("change",{bubbles:true}));await settle();
const to=w.document.querySelector("[data-rdb-filter=to]");to.value="2026-10-15";
to.dispatchEvent(new w.Event("change",{bubbles:true}));await settle();
assert.ok(commands.some(x=>x.action==="reception_dashboard"&&x.section==="followup"&&x.from==="2026-10-10"&&x.to==="2026-10-15"));
await click('#rc-root [data-rdb=tile][data-section=create-job]');
assert.ok(w.document.querySelector("#rc-direct-job"));
assert.ok(w.document.querySelector('#rc-direct-job input[name=promise_date]'),"Manager has optional date at JC creation");
await w.zukaitReception.open();await settle();
await click('#rc-root [data-rdb=tile][data-section=new]');
assert.ok(w.document.querySelector("#rc-form"),"New checklist launches existing server workflow");
// Real production-like Phase 1 response must retain the ten-card layout.
w.zukaitReceptionForceBackendProbe=true;
w.zukaitAuth={getToken:()=>"PHASE1-SESSION"};
const phase1Requests=[];
w.fetch=async(_url,args)=>{
 const body=JSON.parse(args.body);phase1Requests.push(body);
 if(body.action==="reception_dashboard")return {ok:false,json:async()=>({ok:false,code:"unsupported_action"})};
 assert.equal(body.action,"reception","No Phase 2 mutation can be sent in compatibility mode");
 const c=body.command;
 const result=c.operation==="CAPABILITIES"?{allowed:true,manager:true}:c.operation==="MASTER"?{companies:[{id:1,name:"Existing Insurer"}]}:c.operation==="LIST"?{rows:[]}:{};
 return {ok:true,json:async()=>({ok:true,...result})};
};
await w.zukaitReception.open();await settle();
buttons=w.document.querySelectorAll("#rc-root [data-rdb=tile]");
assert.equal(buttons.length,10,"Production Phase 1 must not revert to old home");
assert.ok(buttons[9].textContent.includes("10. Delivery Follow-up"));
assert.equal(w.document.querySelectorAll("#rdb-results").length,0,"Unavailable data must not appear as an empty list");
assert.ok([...w.document.querySelectorAll('.rdb-count')].every(x=>x.textContent===''),"No invented counts");
const probeCount=phase1Requests.length;
for(const key of ['create-job','jobs','waiting','vwc','approved','ready','delivered','followup']){
 await click('#rc-root [data-rdb=tile][data-section='+key+']');
 assert.match(w.document.querySelector('#rdb-unavailable').textContent,/needs the Reception server update/);
}
assert.equal(phase1Requests.length,probeCount,"Unavailable sections never call unsupported endpoints");
await assert.rejects(()=>w.zukaitReceptionDashboard.savePromise('JC120','2026-10-15',''),/server update/);
await click('#rc-root [data-rdb=tile][data-section=checklists]');
assert.equal(w.document.querySelector('.rc-topbar h3').textContent,'Checklist List');
await click('#rc-root [data-rc-action=back]');
assert.equal(w.document.querySelectorAll('#rc-root [data-rdb=tile]').length,10,"Back from list returns to new dashboard");
await click('#rc-root [data-rdb=tile][data-section=new]');
assert.ok(w.document.querySelector('#rc-form'));
assert.equal(w.document.querySelectorAll('#rc-form option[value=CASH]').length,0);
await click('#rc-root [data-rc-action=back]');
assert.equal(w.document.querySelectorAll('#rc-root [data-rdb=tile]').length,10,"Back from intake returns to new dashboard");
assert.equal(phase1Requests.filter(x=>x.action==='reception_dashboard').length,1,"Only the read-only capability probe runs");
dom.window.close();
console.log("Reception dashboard UI: ten tiles, Manager session reuse, category list, date-range filtering, optional Job Card promise field and confirmed promise save passed.");
