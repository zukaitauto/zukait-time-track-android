import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {insuranceProjection} from '../supabase/functions/workshop-api/insurance_management_rules.js';
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
await sandbox.window.v251OpenCashPulse('out');assert.ok(modal.includes('Cash Vehicle Out'));assert.ok(modal.includes('OMR 35.000'));assert.ok(modal.includes('OMR 0.000'));assert.ok(modal.includes('zukaitOpenCashDetails'));assert.ok(!modal.includes('360°'));
await sandbox.window.v251OpenCashPendingAll();assert.ok(modal.includes('JC OLD'));assert.ok(!modal.includes('JC IN'));assert.ok(modal.includes('Not delivered'));
// Integration regression: identity display helpers must never overwrite financial fields.
const octoberJobs=[['12053',35],['11944',400],['12045',60],['12051',65],['12047',35],['12020',230],['12041',42],['12026',200]].map(([no,amount])=>job(no,start+1,amount,{delivered:true,deliveredAt:start+2,finalInvoiceAmount:amount}));
sandbox.fixture=octoberJobs;vm.runInContext('state={jobs:fixture}',ctx);
sandbox.window.zukaitJobCardMaster={display:(no,j)=>({...j,vehicle:'Current identity',amount:0,finalInvoiceAmount:0})};
for(const role of ['Manager','Supervisor']){
 sandbox.fixtureRole=role;vm.runInContext('me={role:fixtureRole}',ctx);
 assert.equal(pulse.rows('out').length,8);assert.equal(pulse.total(pulse.rows('out'),'out'),1067,'Identity overlay must not replace saved invoice amounts');
 await sandbox.window.v251OpenCashPulse('out');assert.ok(modal.includes('OMR 1067.000'));assert.ok(modal.includes('OMR 35.000'));
}
for(const invoice of [undefined,null,'','invalid',false]){sandbox.fixtureInvoice=invoice;vm.runInContext("state.jobs[0]={...state.jobs[0],finalInvoiceAmount:fixtureInvoice};",ctx);assert.equal(pulse.total(pulse.rows('out'),'out'),1067,'Unentered invoice must retain the cash amount fallback');}
vm.runInContext("state.jobs[0]={...state.jobs[0],finalInvoiceAmount:0};",ctx);
assert.equal(pulse.total(pulse.rows('out'),'out'),1032,'A genuinely recorded zero invoice must remain zero');
delete sandbox.window.zukaitJobCardMaster;
let reads=0;sandbox.window.zukaitCloud={async readLatest(){reads++;vm.runInContext("state.jobs.push({no:'12079',jobType:'CASH',amount:80,createdAt:"+start+"})",ctx)}};
await sandbox.window.v251OpenCashPendingAll();assert.equal(reads,1);assert.ok(modal.includes('JC 12079'));assert.ok(modal.includes('OMR 80.000'),'New Reception cash job must appear after confirmed read');
const confirmedModal=modal;let warning='';sandbox.window.alert=message=>warning=message;sandbox.window.zukaitCloud.readLatest=async()=>{throw Error('PENDING_LOCAL_CHANGES')};
await sandbox.window.v251OpenCashPulse('out');assert.equal(modal,confirmedModal,'An unconfirmed read cannot silently replace the list with stale records');assert.match(warning,/PENDING_LOCAL_CHANGES/);delete sandbox.window.zukaitCloud;

// Insurance cards use authoritative job dates, valid received LPOs and eligibility.
const day=new Date(start+14400000).toISOString().slice(0,10),previousDay=new Date(start-1+14400000).toISOString().slice(0,10);
const ins=(no,extra={})=>job(no,start+1,999,{jobType:'INSURANCE',insuranceCompany:'Liva <Insurance>',claimNo:'CL-1',...extra});
const insurance=[ins('I-IN'),ins('I-OUT',{createdAt:start-1,delivered:true,deliveredAt:start,insuranceLpo:{amount:42.125,receivedDate:day}}),ins('I-ZERO',{delivered:true,deliveredAt:end-1,insuranceLpo:{amount:0,receivedDate:day}}),ins('I-OLD',{createdAt:start-1,delivered:true,deliveredAt:start-1,insuranceLpo:{amount:50,receivedDate:previousDay}}),ins('I-FUTURE',{createdAt:end,delivered:true,deliveredAt:end}),ins('I-DELETED',{deleted:true}),ins('I-ARCHIVED',{archived:true}),ins('I-CANCELLED',{cancelled:true}),ins('I-STATUS',{status:'CANCELLED'}),ins('ID001'),ins('I-IN',{createdAt:start-1}),ins('I-NIL',{insuranceLpo:{amount:null,receivedDate:day}}),ins('I-STRING',{insuranceLpo:{amount:'10',receivedDate:day}}),ins('I-INVALID',{insuranceLpo:{amount:90,receivedDate:'2026-02-30'}}),job('CASH-ONLY',start,200)];
sandbox.fixture=insurance;vm.runInContext('me={role:"Manager"};state={jobs:fixture}',ctx);
const ids=a=>Array.from(a,j=>j.no).sort();
for(const [kind,section] of [['in','jobs'],['out','delivered'],['collected','collected']]){
 const expected=insuranceProjection({jobs:insurance},[],{section,month:day.slice(0,7)});
 assert.deepEqual(ids(pulse.insuranceRows(kind)),expected.rows.map(r=>r.job_card).sort(),'Dashboard must match Insurance Management '+kind);
}
assert.equal(pulse.insuranceTotal(pulse.insuranceRows('collected')),42.125);
assert.equal(pulse.approximateRepairSummary(pulse.insuranceRows('in')).amount,4995);
assert.equal(pulse.approximateRepairSummary(pulse.insuranceRows('out')).amount,1998,'Approximate Out must use Amount, not final invoice or LPO');
for(const amount of [undefined,null,'','  ',false,{},[],'invalid',-1])assert.equal(pulse.approximateRepairValue({amount}),null);
assert.equal(pulse.approximateRepairValue({amount:0}),0);
assert.equal(pulse.approximateRepairValue({amount:'123.456',finalInvoiceAmount:9999,insuranceLpo:{amount:8888}}),123.456);
assert.equal(pulse.approximateRepairSummary([{amount:0.1},{amount:0.2},{amount:null}]).amount,0.3);
assert.equal(pulse.approximateRepairSummary([{amount:0.1},{amount:0.2},{amount:null}]).pending,1);
pulse.install();assert.equal((manager.children[1].innerHTML.match(/class="v251-followup-card insurance-/g)||[]).length,3);assert.match(manager.children[1].innerHTML,/Insurance Monthly Follow-up/);
await sandbox.window.v251OpenInsurancePulse('in');assert.match(modal,/JC I-IN/);assert.ok(!modal.includes('CASH-ONLY'));assert.match(modal,/Liva &lt;Insurance&gt;/);
await sandbox.window.v251OpenInsurancePulse('out');assert.match(modal,/JC I-OUT/);assert.match(modal,/OMR 1998.000/);assert.match(modal,/Approx. repair value/);assert.ok(!modal.includes('JC I-OLD'));assert.match(modal,/JC I-ZERO/);
await sandbox.window.v251OpenInsurancePulse('collected');assert.match(modal,/OMR 42.125/);assert.match(modal,/OMR 0.000/);assert.ok(!modal.includes('JC I-NIL'));assert.match(modal,/not cash payment receipts/);
sandbox.fixture=[ins('I-PENDING',{amount:null}),ins('I-VALUED',{amount:25,finalInvoiceAmount:999})];vm.runInContext('state={jobs:fixture}',ctx);
await sandbox.window.v251OpenInsurancePulse('in');assert.match(modal,/OMR 25.000/);assert.match(modal,/1 amount\(s\) pending/);assert.match(modal,/Pending/);assert.ok(!modal.includes('OMR 999.000'));
sandbox.fixture=[ins('I-PENDING',{amount:null})];vm.runInContext('state={jobs:fixture}',ctx);await sandbox.window.v251OpenInsurancePulse('in');assert.ok(!modal.includes('OMR 0.000'),'Missing repair value must not become zero');
const insuranceModal=modal;await sandbox.window.v251OpenInsurancePulse('invalid');assert.equal(modal,insuranceModal);
let insuranceWarning='';sandbox.window.alert=v=>insuranceWarning=v;sandbox.window.zukaitCloud={readLatest:async()=>{throw Error('NETWORK')}};
await sandbox.window.v251OpenInsurancePulse('in');assert.equal(modal,insuranceModal);assert.match(insuranceWarning,/server read failed/);delete sandbox.window.zukaitCloud;
vm.runInContext('me={role:"Supervisor"}',ctx);pulse.install();assert.ok(!supervisor.children[1].innerHTML.includes('Insurance Monthly Follow-up'));await sandbox.window.v251OpenInsurancePulse('in');assert.equal(modal,insuranceModal);
sandbox.fixture=[];vm.runInContext('me={role:"Manager"};state={jobs:fixture}',ctx);await sandbox.window.v251OpenInsurancePulse('in');assert.match(modal,/No insurance in records/);

vm.runInContext('me={role:"Employee"}',ctx);const before=modal;await sandbox.window.v251OpenCashPulse('in');assert.equal(modal,before);
const stable=fs.readFileSync('app/src/main/assets/supervisor_stable.js','utf8'),managerSource=fs.readFileSync('app/src/main/assets/v67_updates.js','utf8');
assert.ok(stable.includes("v251KpiHTML()+"));assert.ok(stable.includes('window.v251CashPulse?.install?.()'));assert.ok(managerSource.includes('id="managerCashPulseSlot"'));assert.ok(managerSource.includes('window.v251CashPulse?.install?.()'));
assert.ok(source.includes('grid-template-columns:repeat(3,minmax(0,1fr))'));
console.log('Cash dashboard: lexical state, cash boxes, manager insurance cards, source parity, monthly boundaries, live edits, final invoice, both roles and clickable lists passed');
