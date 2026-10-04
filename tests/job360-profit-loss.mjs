import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
let modal='',handlers=[];const state={jobs:[{no:'J1',vehicle:'Toyota',reg:'1234',jobType:'Cash',delivered:true,finalInvoiceAmount:100,invoiceDate:'2026-10-04'}],assign:[],sessions:[]};
let cost={parts:20,materials:10,paint:5,labour:30,total:65};
const context={fixture:state,window:{openModal(html){modal=html},closeModal(){},v128JobCostData(){return cost}},document:{addEventListener(type,fn){if(type==='click')handlers.push(fn)},createElement(){return{}},head:{appendChild(){}},body:{},getElementById(){return null},querySelector(){return null}},navigator:{onLine:true},MutationObserver:class{observe(){}},setTimeout(){},setInterval(){},console};
vm.createContext(context);vm.runInContext('let state=fixture;let users=[];let me={role:"Manager"};',context);vm.runInContext(fs.readFileSync('app/src/main/assets/workshop_overview.js','utf8'),context);
const click=action=>handlers.forEach(fn=>fn({target:{closest:selector=>selector.includes('=')&&selector!=='[data-workshop-action="'+action+'"]'?null:{dataset:{workshopAction:action,job:'J1'}}},preventDefault(){},stopPropagation(){}}));
const original=structuredClone(state);
for(const role of ['Manager','Supervisor'])for(const type of ['Cash','Credit','Insurance']){
 vm.runInContext('me={role:'+JSON.stringify(role)+'}',context);state.jobs[0].jobType=type;
 for(const [invoice,label,amount,style] of [[100,'Profit','35.000','profit'],[40,'Loss','25.000','loss'],[65,'Break Even','0.000','even'],[0,'Loss','65.000','loss']]){
  state.jobs[0].finalInvoiceAmount=invoice;context.window.zukaitWorkshopOverview.detail('J1');assert.match(modal,/PROFIT \/ LOSS/);assert.match(modal,new RegExp(label+' · OMR '+amount.replace('.','\\.')));assert.match(modal,new RegExp('wo-profit-'+style));assert.match(modal,/data-workshop-action="cost-profit"/);
  click('cost-profit');assert.match(modal,/Invoice Amount − Total Expense/);assert.match(modal,/Invoice Date · 2026-10-04/);assert.match(modal,/data-workshop-action="cost-total"/);assert.match(modal,new RegExp('OMR '+amount.replace('.','\\.')));
  click('detail');assert.match(modal,/Cost Summary/);
 }
}
state.jobs[0].finalInvoiceAmount=65.0004;context.window.zukaitWorkshopOverview.detail('J1');assert.match(modal,/Break Even · OMR 0\.000/);assert.doesNotMatch(modal,/Loss · OMR 0\.000/);
for(const amount of [undefined,null,'',NaN]){state.jobs[0].finalInvoiceAmount=amount;context.window.zukaitWorkshopOverview.detail('J1');assert.match(modal,/Invoice Pending/);click('cost-profit');assert.match(modal,/Save the invoice amount and date/);}
state.jobs[0].finalInvoiceAmount=100;for(const date of ['',undefined,'2026-02-30']){state.jobs[0].invoiceDate=date;context.window.zukaitWorkshopOverview.detail('J1');assert.match(modal,/Invoice Pending/);}
state.jobs[0].invoiceDate='2026-10-04';cost.total=NaN;context.window.zukaitWorkshopOverview.detail('J1');assert.match(modal,/Cost Unavailable/);
cost.total=65;state.jobs[0].delivered=false;context.window.zukaitWorkshopOverview.detail('J1');assert.match(modal,/Invoice Pending/);
vm.runInContext('me={role:"Employee"}',context);const before=modal;click('cost-profit');assert.equal(modal,before);
assert.deepEqual(state.assign,original.assign);assert.deepEqual(state.sessions,original.sessions);
console.log('360 Profit / Loss passed: three invoice types, both roles, profit/loss/break-even, explicit zero invoice, rounding, missing invoice/date/cost, clickable calculation and employee guard.');
