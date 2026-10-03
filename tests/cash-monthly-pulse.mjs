import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
class Element {
 constructor(id=''){this.id=id;this.children=[];this.classList={contains:()=>false};this.writes=0;}
 prepend(el){if(el.parent)el.parent.children.splice(el.parent.children.indexOf(el),1);this.children.unshift(el);el.parent=this;}
 appendChild(el){this.children.push(el);el.parent=this;}
 get nextElementSibling(){return this.parent.children[this.parent.children.indexOf(this)+1];}
 insertAdjacentElement(_,el){if(el.parent)el.parent.children.splice(el.parent.children.indexOf(el),1);this.parent.children.splice(this.parent.children.indexOf(this)+1,0,el);el.parent=this.parent;}
 querySelector(q){if(q.startsWith('#'))return this.children.find(x=>x.id===q.slice(1));if(q.startsWith('.'))return this.children.find(x=>x.header);return this.markup?.includes('data-v251-cash-pulse')?{}:null;}
 set innerHTML(v){this.markup=v;this.writes++;}
 get innerHTML(){return this.markup;}
}
const manager=new Element('managerView'),supervisor=new Element('supervisorView');
for(const root of [manager,supervisor]){const header=new Element();header.header=true;root.appendChild(header);root.appendChild(new Element('search'));}
let modal='';
const sandbox={window:{addEventListener(){}},document:{head:new Element(),body:new Element(),getElementById:id=>({managerView:manager,supervisorView:supervisor}[id]),createElement:()=>new Element(),addEventListener(){}},MutationObserver:class{observe(){}},setTimeout(){},setInterval(){},openModal:html=>modal=html};
const ctx=vm.createContext(sandbox);
vm.runInContext(`let state={jobs:[]};let me={role:'Supervisor'};`,ctx);
const source=fs.readFileSync('app/src/main/assets/cash_monthly_pulse.js','utf8');
vm.runInContext(source,ctx);
const pulse=sandbox.window.v251CashPulse;
const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Muscat',year:'numeric',month:'numeric'}).formatToParts(new Date());
const year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value);
const start=Date.UTC(year,month-1,1)-14400000,end=Date.UTC(year,month,1)-14400000;
const job=(no,createdAt,amount,extra={})=>({no,createdAt,amount,jobType:'CASH',vehicle:'Corolla',reg:'123',...extra});
const jobs=[job('IN',start,10),job('OLD',start-1,20),job('OUT',start+1,30,{delivered:true,deliveredAt:start,finalInvoiceAmount:35}),job('ZERO',start+2,40,{delivered:true,deliveredAt:end-1,finalInvoiceAmount:0}),job('BEFORE',start-2,50,{delivered:true,deliveredAt:start-1}),job('FUTURE',end,60,{delivered:true,deliveredAt:end}),job('CREDIT',start,999,{jobType:'CREDIT'}),job('INSURANCE',start,999,{jobType:'INSURANCE'}),job('ID001',start,999),job('DELETED',start,999,{deleted:true}),job('ARCHIVED',start,999,{archived:true})];
sandbox.fixture=jobs;vm.runInContext('state={jobs:fixture}',ctx);
assert.equal(sandbox.window.state,undefined,'exercise the actual lexical application state');
assert.equal(pulse.rows('in').length,3);assert.equal(pulse.rows('out').length,2);assert.equal(pulse.total(pulse.rows('out'),'out'),35);assert.equal(pulse.pendingAll().length,2);
pulse.install();let slot=supervisor.children[1];assert.equal(slot.id,'supervisorCashPulseSlot');assert.equal((slot.innerHTML.match(/class="v251-cash-circle /g)||[]).length,3);assert.ok(slot.innerHTML.includes('OMR 80.000'));assert.ok(slot.innerHTML.includes('OMR 30.000'));assert.ok(slot.innerHTML.includes('OMR 35.000'));
const writes=slot.writes;pulse.install();assert.equal(slot.writes,writes,'unchanged refresh must not rebuild DOM');
vm.runInContext('state={jobs:state.jobs.map(j=>j.no==="IN"?{...j,amount:15}:j)}',ctx);pulse.install();assert.ok(slot.innerHTML.includes('OMR 85.000'));
vm.runInContext('state={jobs:state.jobs.map(j=>j.no==="IN"?{...j,jobType:"INSURANCE"}:j)}',ctx);pulse.install();assert.equal(pulse.rows('in').length,2);assert.equal(pulse.pendingAll().length,1);
vm.runInContext('me={role:"Manager"}',ctx);pulse.install();assert.equal(manager.children[1].id,'managerCashPulseSlot');assert.equal((manager.children[1].innerHTML.match(/class="v251-cash-circle /g)||[]).length,3);
sandbox.window.v251OpenCashPulse('out');assert.ok(modal.includes('Cash Vehicle Out'));assert.ok(modal.includes('OMR 35.000'));assert.ok(modal.includes('OMR 0.000'));assert.ok(modal.includes('zukaitOpenJob360'));
sandbox.window.v251OpenCashPendingAll();assert.ok(modal.includes('JC OLD'));assert.ok(!modal.includes('JC IN'));assert.ok(modal.includes('Not delivered'));
vm.runInContext('me={role:"Employee"}',ctx);const before=modal;sandbox.window.v251OpenCashPulse('in');assert.equal(modal,before);
const stable=fs.readFileSync('app/src/main/assets/supervisor_stable.js','utf8'),managerSource=fs.readFileSync('app/src/main/assets/v67_updates.js','utf8');
assert.ok(stable.includes("v251KpiHTML()+"));assert.ok(stable.includes('window.v251CashPulse?.install?.()'));assert.ok(managerSource.includes('id="managerCashPulseSlot"'));assert.ok(managerSource.includes('window.v251CashPulse?.install?.()'));
assert.ok(source.includes('grid-template-columns:repeat(3,minmax(0,1fr))'));
console.log('Cash dashboard: lexical state, three circles, monthly boundaries, live edits, final invoice, both roles and clickable lists passed');
