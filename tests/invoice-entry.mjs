import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
const source=fs.readFileSync('app/src/main/assets/qc_delivery_rules.js','utf8');assert.equal(source,fs.readFileSync('supabase/functions/workshop-api/qc_delivery_rules.js','utf8'));
const {qcTransition,invoiceComplete,invoiceDateValid,preserveQcAuthority,qcStatus}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const manager={id:'MGR1',role:'Manager',name:'Manager'},supervisor={id:'SUP001',role:'Supervisor',name:'Shine'},employee={id:'E1',role:'Employee'};
const base={jobs:['Cash','Credit','Insurance'].map((jobType,i)=>({no:String(i+1),jobType,delivered:true,amount:25,qcWorkflow:{revision:3,history:[]}})),assign:[{id:'A',emp:'E1',job:'1',completed:true}],sessions:[{id:'S',emp:'E1',job:'1',start:1,end:100}],consumables:{actuals:[{id:'C'}]}};
const request={jobCard:'1',operation:'FINAL_INVOICE_ENTRY',amount:'100.125',invoiceDate:'2026-10-04',expectedQcRevision:3};
assert.equal(invoiceComplete(base.jobs[0]),false);assert.equal(invoiceDateValid('2026-02-30'),false);assert.equal(invoiceDateValid('2024-02-29'),true);
for(const user of [manager,supervisor])for(const no of ['1','2','3']){const r=qcTransition(base,user,{...request,jobCard:no},1000);assert.equal(r.ok,true);assert.equal(invoiceComplete(r.job),true);assert.equal(r.job.invoiceDate,'2026-10-04');assert.equal(r.job.finalInvoiceAmount,100.125);assert.equal(r.job.invoiceEnteredBy,user.id);assert.equal(r.job.financialAudit[0].toDate,'2026-10-04');assert.equal(r.job.amount,no==='1'?100.125:25);assert.deepEqual(r.data.assign,base.assign);assert.deepEqual(r.data.sessions,base.sessions);assert.deepEqual(r.data.consumables,base.consumables);assert.equal(qcTransition(r.data,user,{...request,jobCard:no,expectedQcRevision:4},1001).code,'final_invoice_already_entered');}
assert.equal(qcTransition(base,employee,request,1000).code,'qc_permission_denied');
for(const amount of ['',null,'   ','invalid',-1,1000001])assert.equal(qcTransition(base,manager,{...request,amount},1000).code,'final_invoice_amount_required');
for(const invoiceDate of ['',null,'2026-02-30','04/10/2026'])assert.equal(qcTransition(base,manager,{...request,invoiceDate},1000).code,'invoice_date_required');
assert.equal(qcTransition(base,manager,{...request,expectedQcRevision:2},1000).code,'qc_conflict');
let missing=structuredClone(base);delete missing.jobs[0].jobType;assert.equal(qcTransition(missing,manager,request,1000).code,'invoice_job_type_required');missing.jobs[0].jobType='Cash';missing.jobs[0].delivered=false;assert.equal(qcTransition(missing,manager,request,1000).code,'delivery_required');
let legacy=structuredClone(base);legacy.jobs[0].finalInvoiceAmount=80;
assert.equal(qcTransition(legacy,supervisor,{...request,amount:80},1000).ok,true);
assert.equal(qcTransition(legacy,supervisor,request,1000).code,'manager_required');
assert.equal(qcTransition(legacy,manager,request,1000).code,'financial_correction_reason_required');
assert.equal(qcTransition(legacy,manager,{...request,reason:'Invoice checked'},1000).ok,true);
let saved=qcTransition(base,supervisor,request,1000).data;
assert.equal(qcTransition(saved,supervisor,{...request,operation:'FINAL_INVOICE_CORRECTION',expectedQcRevision:4,reason:'Fix'},1001).code,'qc_permission_denied');
for(const no of ['1','2','3']){let r=qcTransition(base,manager,{...request,jobCard:no,operation:'FINAL_INVOICE_CORRECTION',reason:'Invoice reviewed'},1001);assert.equal(r.ok,true);assert.equal(r.job.financialAudit[0].reason,'Invoice reviewed');assert.equal(r.job.invoiceDate,'2026-10-04');}
let stale=structuredClone(base);stale.jobs[0].invoiceDate='2000-01-01';preserveQcAuthority(stale,saved);assert.equal(stale.jobs[0].invoiceDate,'2026-10-04');assert.equal(stale.jobs[0].finalInvoiceAmount,100.125);assert.equal(stale.jobs[0].invoiceEnteredBy,'SUP001');
let forged=structuredClone(base);forged.jobs[0].invoiceDate='2026-10-04';preserveQcAuthority(forged,base);assert.equal(forged.jobs[0].invoiceDate,undefined);
const ui=fs.readFileSync('app/src/main/assets/qc_delivery.js','utf8').replace(/^import[^\n]+\n/,'');
class Element{constructor(){this.dataset={};this.children=[];this.innerHTML='';this.className=''}get textContent(){return this.innerHTML.replace(/<[^>]*>/g,' ')}set textContent(value){this.innerHTML=value}appendChild(child){child.remove();this.children.push(child);child.parentElement=this}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null}removeAttribute(){}closest(){return this.parentElement}querySelector(selector){if(selector.includes('.v67-control-grid')||selector==='.v143-two')return this;if(selector.startsWith('[data-')){const key=selector.slice(6,-1).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return this.children.find(x=>key in x.dataset)||null}return null}querySelectorAll(selector){return selector==='button'?this.children:[]}}
for(const user of [manager,supervisor,employee]){
 let modal='',calls=0;const dashboard=new Element(),events={};const nodes={managerView:dashboard,supervisorView:dashboard,invoiceBody:{innerHTML:''},invoiceSearch:{value:''},invoiceEntryAmount:{value:'100.125'},invoiceEntryDate:{value:'2026-10-04'},qcRows:{innerHTML:''}};
 const ctx={invoiceComplete,invoiceDateValid,qcStatus,state:structuredClone(base),me:user,window:{addEventListener(name,fn){events[name]=fn},zukaitAuth:{getToken(){return 'test'}},zukaitCloud:{syncHealth:{ready:true},async syncNow(){}}},navigator:{onLine:true},document:{getElementById(id){return nodes[id]||null},createElement(){return new Element()},head:{appendChild(){}}},openModal(html){modal=html},closeModal(){},alert(message){throw Error(message)},Date,console,async fetch(url,opts){calls++;let body=JSON.parse(opts.body);assert.equal(body.invoiceDate,'2026-10-04');assert.equal(body.operation,'FINAL_INVOICE_ENTRY');let result=qcTransition(ctx.state,user,body,1000);assert.equal(result.ok,true);ctx.state=result.data;return{ok:true,async json(){return result}}}};
 vm.runInNewContext(ui+'\nwindow.testPending=invoicePending;window.testRow=row;',ctx);
 ctx.window.zukaitOpenInvoiceEntry();assert.equal(modal.includes('Invoice Entry'),user.role!=='Employee');
 if(user.role==='Employee'){await ctx.window.zukaitSaveInvoiceEntry('1');assert.equal(calls,0);continue;}
 const launcher=dashboard.querySelector('[data-invoice-entry]');assert.ok(launcher);assert.equal(launcher.dataset.qcCount,'3');launcher.onclick();assert.match(modal,/Invoice Entry/);ctx.window.render();assert.equal(dashboard.children.filter(x=>x.dataset.invoiceEntry).length,1);
 assert.equal((nodes.invoiceBody.innerHTML.match(/class="invoice-circle /g)||[]).length,3);
 ctx.window.zukaitOpenInvoiceEntry('Cash');assert.match(nodes.invoiceBody.innerHTML,/JC 1/);assert.doesNotMatch(nodes.invoiceBody.innerHTML,/JC 2/);
 ctx.window.zukaitOpenInvoiceJob('1');assert.match(modal,/Invoice Date/);assert.match(modal,/Save Invoice/);assert.match(modal,/Back to pending list/);
 await ctx.window.zukaitSaveInvoiceEntry('1');assert.equal(calls,1);assert.equal(ctx.window.testPending().length,2);assert.match(nodes.invoiceBody.innerHTML,/No pending invoices/);assert.equal(ctx.state.jobs[0].delivered,true);
 ctx.window.v42AfterCloudPull();assert.equal(launcher.dataset.qcCount,'2');events['zukait-live-status']();assert.equal(dashboard.children.filter(x=>x.dataset.invoiceEntry).length,1);
 ctx.window.zukaitOpenDeliveredRecord('1');assert.match(modal,/Invoice Saved/);assert.match(modal,/100\.125/);assert.match(modal,/2026-10-04/);
 assert.equal(ctx.window.testRow(ctx.state.jobs[1],'delivered').includes('Correct Final Invoice'),user.role==='Manager');
 ctx.window.zukaitOpenInvoiceJob('2');nodes.invoiceEntryDate.value='';assert.throws(()=>ctx.window.zukaitSaveInvoiceEntry('2'),/Invoice Date/);assert.equal(calls,1);
}
console.log('Invoice Entry passed: all three types, roles, date/amount validation, legacy amount protection, audit, concurrency, pending navigation, saved delivery details and stale-client protection.');
