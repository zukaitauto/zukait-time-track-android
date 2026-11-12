(function(){'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const config=window.ZUKAIT_ACCOUNTANT_CONFIG||{},url=config.url||'https://pjknotnjkufadqavcmii.supabase.co',publicKey=config.key||'sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A',sessionKey='zukait_secure_session_v42';
const modules=[['jobs','Job Card 360°'],['cash','Cash In'],['insurance_invoiced','Insurance Invoiced'],['leave','Leave Management'],['profit','Profit / Loss'],['consumables','Consumables'],['parts','Spare Parts'],['paint','Paint']];
const money=(title,key)=>[title,key,true],omanMonth=()=>new Date(Date.now()+14400000).toISOString().slice(0,7),common=[['JC','job_card'],['Date','date']];
const columns={jobs:[['JC','job_card'],['Registration','registration'],['Vehicle','vehicle'],['Customer','customer'],['Type','job_type'],money('Invoice OMR','invoice_amount_omr'),money('Total cost OMR','total_cost_omr'),money('Estimated GP OMR','estimated_gross_profit_omr')],consumables:[...common,['Material','material'],['Brand','brand'],['Actual quantity','quantity'],['Unit','unit'],money('Unit price OMR','unit_price_omr'),money('Cost OMR','cost_omr')],paint:[...common,['PO','po'],['Supplier','supplier'],['Status','status'],money('Paint amount OMR','gross_omr'),money('Returns OMR','returns_omr'),money('Net OMR','net_cost_omr')],parts:[...common,['PL','list_no'],['Part','part'],['Ordered quantity','quantity'],['Received quantity','received_quantity'],['Pending quantity','pending_quantity'],['Returned quantity','returned_quantity'],['Supplier','supplier'],['Status','status'],['Invoice reference','invoice_reference'],money('Purchase OMR','purchase_amount_omr'),money('Pending purchase OMR','pending_purchase_omr'),money('Returns OMR','returns_omr'),money('Net OMR','net_cost_omr')],leave:[['Employee','employee'],['Date','date'],['Period','period_label'],['Approval','approval_status'],['Days','days'],['Remark','remark']],cash:[['Invoice Date','invoice_date'],['JC','job_card'],['Registration','registration'],['Vehicle','vehicle'],['Customer','customer'],money('Invoice Amount OMR','invoice_amount_omr')],cash_ledger:[['Date','transaction_date'],['Source','receipt_source'],['Direction','kind'],['JC','job_card'],['Payer / payee','payee'],['Category','category'],['Method','payment_method'],money('Posted OMR','recorded_amount_omr'),money('Counted OMR','amount_omr'),['Reference','reference']],lpo:[['Insurance','insurance_company'],['JC','job_card'],['Claim','claim_number'],['LPO status','lpo_status'],['LPO document received','lpo_received_date'],money('LPO amount OMR','lpo_amount_omr'),money('Cash collected OMR','collected_amount_omr'),['Latest collection date','collection_date'],money('Balance OMR','outstanding_omr')],outstanding:[['JC','job_card'],['Customer','customer'],['Insurance','insurance_company'],['Invoice date','invoice_date'],['Delivery date','delivery_date'],money('Invoice OMR','invoice_amount_omr'),money('Verified receipts OMR','payment_received_omr'),money('Balance OMR','outstanding_omr'),['Status','payment_status']],monthly:[['Month','month'],...['cash_in','cash_out','invoiced_revenue','payments_received','consumables','paint','parts','labour','total_job_cost','estimated_gross_profit','outstanding','lpo_collected','lpo_documents_received'].map(k=>money(k.replaceAll('_',' ')+' OMR',k+'_omr')),['Pending cost records','pending_cost_records'],['Pending LPO documents','lpo_pending_records'],['Leave days','leave_days']]};

const financialColumns=[
 ['No.','serial'],['Date','date'],['JC','job_card'],['Vehicle','vehicle'],
 money('Labour OMR','labour_cost_omr'),money('Paint OMR','paint_cost_omr'),
 money('Consumables OMR','consumables_cost_omr'),money('Parts OMR','parts_cost_omr'),
 money('Sublet OMR','sublet_cost_omr'),money('Total Job Cost OMR','total_job_cost_omr'),
 money('LPO / Cash Amount OMR','invoice_amount_omr'),money('Net Profit / Loss OMR','net_profit_omr'),['Percentage','percentage']
];
columns.cash=financialColumns;
columns.insurance_invoiced=[...financialColumns.slice(0,4),['Insurance Company','insurance_company'],...financialColumns.slice(4)];
columns.profit=[...financialColumns.slice(0,4),['Category','kind'],['Company / Customer','company_name'],...financialColumns.slice(4)];
columns.leave=[['Employee','employee'],['Date','date'],['Leave','period_label'],['Status','approval_status'],['Days','days'],['Remark','remark'],['Marked By','marked_by'],['Cancellation By','cancelled_by'],['Cancellation Reason','cancel_reason']];
let user=null,report='jobs',labourMode='with',offset=0,next=null,result=null,generation=0,detailGeneration=0,busy=false,target=null,verified=false;
const saved=()=>{try{return JSON.parse(localStorage.getItem(sessionKey)||'null')}catch{return null}};
const token=()=>{const s=saved();if(!s||s.user?.id!==user?.id||s.user?.role!==user?.role||!['Accountant','Manager'].includes(s.user?.role)){invalidate();throw Error('ACCOUNT_CHANGED');}return String(s.token||window.AndroidBridge?.getSecureSessionToken?.()||'')};
let billClient=null,billBlocked=false,financialLockKey=null,billReview=null;
const billsEnabled=config.billsEnabled===true;
const pendingKey=()=> 'zukait_accountant_pending_v1:'+encodeURIComponent(url)+':'+encodeURIComponent(user?.id||'');
const say=text=>{$('message').textContent=text};
const pending=()=>{try{return JSON.parse(localStorage.getItem(pendingKey())||'null')}catch{return null}};
function showLegacyPending(){if(!verified){$('pending').replaceChildren();$('pending').hidden=true;return;}const p=pending();$('pending').hidden=!p;$('pending').replaceChildren();if(p){$('pending').append('A financial request is awaiting confirmation. Retry the exact request before entering another transaction. ');const b=document.createElement('button');b.type='button';b.textContent='Retry pending request';b.onclick=()=>submit(p.command,p);$('pending').append(b);}}
function hasBillPending(){if(!billsEnabled)return false;if(billBlocked||!billClient)return true;try{return billClient.pending()!==null}catch{return true}}
function showPending(){
 showLegacyPending();if(!verified||!billsEnabled)return;
 if(!hasBillPending())return;
 $('pending').hidden=false;
 const note=document.createElement('p');note.textContent=billBlocked?'Bill recovery is unavailable. Financial submissions are blocked until this is resolved.':'A supplier bill awaits confirmation. Retry the exact reviewed request; do not enter it again.';$('pending').append(note);
 if(billClient&&!billBlocked){const button=document.createElement('button');button.type='button';button.textContent='Retry pending supplier bill';button.disabled=busy||pending()!==null;button.onclick=()=>submitBill(null,true).catch(()=>{});$('pending').append(button);}
}
async function initializeBills(){
 if(!billsEnabled)return;
 try{const recovery=await import('./accountant_bill_intent.mjs');const {billIntents}=recovery;financialLockKey=recovery.financialLockKey;
  billClient=billIntents({storage:localStorage,project:url,session:()=>{if(!verified)return null;return {verified,id:user.id,role:user.role,sessionId:token()}},online:()=>navigator.onLine!==false,beforeSubmit:()=>{if(localStorage.getItem(pendingKey())!==null)throw Error('Resolve the pending financial request first.');},send:body=>request('workshop-api',body)});
  billClient.pending();billBlocked=false;
  const {mountBillReview}=await import('./accountant_bill_review.mjs');
  if(!verified)return;
  billReview=mountBillReview({root:$('accounts-home'),submitBill,request:body=>request('workshop-api',body),canReview:()=>verified&&!busy&&!hasBillPending()&&localStorage.getItem(pendingKey())===null});
 }catch{billBlocked=true;}
}
async function submitBill(command,retry=false){
 if(!billsEnabled||!billClient||billBlocked)throw Error('bill_recovery_unavailable');
 if(busy||!verified)throw Error('bill_busy');
 token();if(localStorage.getItem(pendingKey())!==null)throw Error('Resolve the pending financial request first.');
 busy=true;showPending();
 try{const response=await (retry?billClient.retry():billClient.submit(command));say('Supplier bill confirmed. Payments and full outstanding balance still require reconciliation.');return response;}
 catch(e){say(e.message);throw e;}
 finally{busy=false;showPending();}
}
function invalidate(){closeCashDialog();billReview?.reset();verified=false;generation++;closeDetail();result=null;target=null;$('app').hidden=true;for(const id of ['rows','detail','summary','pending'])$(id).replaceChildren();$('pending').hidden=true;window.dispatchEvent(new Event('zukait-accountant-session'));}
window.addEventListener('storage',e=>{if(verified&&billsEnabled&&(e.key===pendingKey()||e.key==='zukait_bill_intent_v1:'+encodeURIComponent(url)+':'+encodeURIComponent(user.id)))showPending();});
window.addEventListener('storage',e=>{if(e.key===sessionKey&&verified){try{token()}catch{say('Account changed. Sign in again.')}}});
async function request(endpoint,body){const t=token();if(!t)throw Error('Sign in required');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);let r;try{r=await fetch(url+'/functions/v1/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:publicKey,'x-zukait-session':t},body:JSON.stringify(body),signal:controller.signal})}catch(e){if(token()!==t){invalidate();throw Error('ACCOUNT_CHANGED');}throw e;}finally{clearTimeout(timeout)}const data=await r.json();if(token()!==t){invalidate();throw Error('ACCOUNT_CHANGED');}if(!r.ok||!data.ok){const error=new Error(data.code||'Request unavailable');error.status=r.status;throw error;}return data;}
function filters(){
 const used=['query','month','from','to'];
 if(report==='leave')used.push('employee');
 const out=Object.fromEntries(used.map(k=>[k,$(k).value.trim()]).filter(([,v])=>v));
 if(report==='cash')out.kind='CASH';
 if(report==='insurance_invoiced')out.kind='INSURANCE';
 if(report==='profit'){out.kind=$('category-filter').value||'ALL';out.labour_mode=labourMode;}
 if(['insurance_invoiced','profit'].includes(report)&&$('insurance-company').value)out.insurance=$('insurance-company').value;
 if(report==='profit'&&$('customer-filter').value)out.customer=$('customer-filter').value;
 if(report==='leave')out.status=$('leave-status').value;
 return out;
}
function display(v,isMoney=false){return window.zukaitAccountantExports.display(v,isMoney)}
function renderSummary(summary){
 const cards=[
  ['Cash Invoices','cash_invoice_current_month','cash','Current Oman month'],
  ['Cash Out','cash_out','cash','Payments'],
  ['Insurance LPO Collected','lpo_collected','lpo','Insurance'],
  ['Outstanding Payments','outstanding','outstanding','Receivables'],
  ['Recorded Expenses','total_expenses','monthly','Costs'],
  ['Estimated Gross Profit','estimated_gross_profit','monthly','Estimated result']
 ];
 $('summary').innerHTML=cards.map(([title,key,dest,category])=>{
  const s=summary?.[key],pending=Number(s?.pending_records||0),missing=s?.amount_omr===undefined||s?.amount_omr===null;
  const note=pending?esc(pending)+' source record'+(pending===1?'':'s')+' pending':missing?'Amount not yet verified':'Verified source records only';
  return '<button type="button" class="account-kpi account-kpi-'+key+'" data-report="'+dest+'" aria-label="'+esc(title)+' · '+esc(note)+'">'+
   '<span class="account-kpi-top"><span>'+esc(title)+'</span><span aria-hidden="true">↗</span></span>'+
   '<b>'+display(s?.amount_omr??null,true)+'</b>'+
   '<small class="account-kpi-note'+(pending?' account-kpi-pending':'')+'">'+
   (pending?'<span class="account-kpi-dot" aria-hidden="true"></span>':'')+note+'</small>'+
   '<span class="account-kpi-category">'+esc(category)+'</span></button>';
 }).join('');
}
// Display hours as hours/minutes only; retain original high-precision hours for cost calculations.
function formatNormalDutyHours(hours){
 if(hours===null||hours===undefined||hours===''||!Number.isFinite(Number(hours))||Number(hours)<0)return 'Not Available / Pending';
 const minutes=Math.round(Number(hours)*60);
 return Math.floor(minutes/60)+'h '+String(minutes%60).padStart(2,'0')+'m';
}
function table(rows,cols,actions=false,printMode=false){return '<div class="table-wrap"><table><thead><tr>'+cols.map(c=>'<th'+(c[2]?' class="money"':'')+'>'+esc(c[0])+'</th>').join('')+(actions?'<th>Actions</th>':'')+'</tr></thead><tbody>'+rows.map((r,i)=>'<tr>'+cols.map(c=>'<td'+(c[2]?' class="money"':'')+'>'+esc(c[1]==='normal_hours'?formatNormalDutyHours(r[c[1]]):printMode&&c[2]?display(r[c[1]],true).replace(/^OMR /,''):display(r[c[1]],c[2]))+'</td>').join('')+(actions?'<td>'+(['jobs','cash'].includes(report)?'<button type="button" data-job="'+esc(r.job_card)+'">'+(report==='jobs'?'Open financial view':'View JC')+'</button>':report==='cash_ledger'?(r.invoice_receipt?'<span>From Cash invoice</span>':'<button type="button" data-correct="'+i+'">Correct</button><button type="button" data-reverse="'+i+'">Reverse</button>'):'')+'</td>':'')+'</tr>').join('')+'</tbody></table></div>';}
let detailTrigger=null;
function closeDetail(){
 detailGeneration++;target=null;$('detail').hidden=true;$('correction').hidden=true;
 const modal=$('financial-detail-dialog'),wasOpen=modal?.open;
 if(wasOpen){try{if(typeof modal.close==='function')modal.close();else modal.removeAttribute('open');}catch{modal.removeAttribute('open');}}
 document.documentElement.classList.remove('financial-dialog-open');
 const trigger=detailTrigger;detailTrigger=null;
 if(wasOpen&&trigger?.isConnected&&typeof trigger.focus==='function')trigger.focus({preventScroll:true});
}
function showDetailDialog(){
 const modal=$('financial-detail-dialog');
 try{if(!modal.open){if(typeof modal.showModal==='function')modal.showModal();else modal.setAttribute('open','');}}
 catch{modal.setAttribute('open','');}
 document.documentElement.classList.add('financial-dialog-open');
 modal.scrollTop=0;
 $('close-detail')?.focus?.({preventScroll:true});
}
$('financial-detail-dialog').addEventListener('cancel',e=>{e.preventDefault();closeDetail();});
$('financial-detail-dialog').addEventListener('click',e=>{if(e.target===$('financial-detail-dialog'))closeDetail();});
function backendReport(name){return ['cash','insurance_invoiced','profit'].includes(name)?'accounts_performance':name==='leave'?'accounts_leave':name;}
function closeCashDialog(){
 const dialog=$('cash-entry-dialog');
 try{if(typeof dialog.close==='function'&&dialog.open)dialog.close();
 else dialog.removeAttribute('open');}
 catch{dialog.removeAttribute('open');}
 $('entry').hidden=true;
}

const performanceReports=new Set(['cash','insurance_invoiced','profit']);
const expenseReports=new Set(['consumables','parts','paint']);
const expenseSummaryKey={consumables:'consumables',parts:'parts',paint:'paint'};

const expenseViews={consumables:[['details','Detailed entries'],['material','Material-wise'],['brand','Brand-wise'],['monthly','Monthly consumption'],['job','Job Card-wise']],parts:[['details','Detailed entries'],['part','Part-wise'],['supplier','Supplier-wise'],['monthly','Monthly expense'],['job','Job Card-wise']],paint:[['details','Detailed entries'],['supplier','Supplier-wise'],['monthly','Monthly expense'],['job','Job Card-wise']]};
function expenseGroup(rows,kind,view){
 const fields={material:['material','brand','unit'],brand:['brand','unit'],monthly:['month'],job:['job_card'],supplier:['supplier'],part:['part']}[view];
 if(!fields)return {rows,cols:columns[kind]};
 const map=new Map(),costKey=kind==='consumables'?'cost_omr':'net_cost_omr';
 for(const r of rows){
  const values=fields.map(f=>f==='month'?String(r.date||'').slice(0,7)||'Date unavailable':String(r[f]||'Not recorded'));
  const key=JSON.stringify(values);if(!map.has(key))map.set(key,{values,entries:0,mills:0,missing:0,qty:0,knownQty:0});
  const g=map.get(key);g.entries++;
  if(r[costKey]==null||!Number.isFinite(Number(r[costKey])))g.missing++;else g.mills+=Math.round(Number(r[costKey])*1000);
  if(r.quantity!=null&&Number.isFinite(Number(r.quantity))){g.qty+=Number(r.quantity);g.knownQty++;}
 }
 const output=[...map.values()].map(g=>({...Object.fromEntries(fields.map((f,i)=>[f,g.values[i]])),entries:g.entries,quantity:g.knownQty===g.entries?Number(g.qty.toFixed(3)):null,known_expense_omr:g.mills/1000,pending_price_records:g.missing})).sort((a,b)=>String(a[fields[0]]).localeCompare(String(b[fields[0]])));
 const labels={month:'Month',job_card:'Job Card',material:'Material',brand:'Brand',unit:'Unit',supplier:'Supplier',part:'Part'};
 const cols=[...fields.map(f=>[labels[f],f])];
 if(kind==='consumables'&&['material','brand'].includes(view)||kind==='parts'&&view==='part')cols.push(['Quantity','quantity']);
 cols.push(['Entries','entries'],money('Known Expense OMR','known_expense_omr'),['Unpriced Entries','pending_price_records']);
 return {rows:output,cols};
}
async function allExpenseRows(kind,filter,ticket){
 const all=[];let cursor=0,snapshot,finance;
 do{
  const page=await request('workshop-api',{action:'accountant_report',report:kind,filters:filter,offset:cursor,limit:500});
  if(ticket!==generation)throw Error('Report changed');
  if(snapshot===undefined){snapshot=page.snapshot_revision;finance=page.finance_revision;}
  else if(snapshot!==page.snapshot_revision||finance!==page.finance_revision)throw Error('Financial records changed; refresh report');
  all.push(...page.rows);cursor=page.next_offset;
  if(all.length>5000||all.length===5000&&cursor!==null)throw Error('Too many records. Narrow the date range for a complete report.');
 }while(cursor!==null);
 return all;
}

function reportColumns(name=report,mode=labourMode){
 if(expenseReports.has(name)&&$('expense-view').value!=='details')return expenseGroup([],name,$('expense-view').value).cols;
 const labels={
  labour_cost_omr:'Labour OMR (excluded)',
  total_job_cost_omr:'Total Job Cost OMR (Without Labour)',
  net_profit_omr:'Net Profit / Loss OMR (Without Labour)',
  percentage:'Percentage (Without Labour)'
 };
 return name==='profit'&&mode==='without'?columns[name].map(c=>labels[c[1]]?[labels[c[1]],c[1],c[2]]:c):columns[name];
}
function updateLabourModeControls(){
 const active=report==='profit';
 $('profit-labour-toggle').hidden=!active;
 for(const [mode,id] of [['with','profit-with-labour'],['without','profit-without-labour']]){
  $(''+id).setAttribute('aria-pressed',String(active&&labourMode===mode));
 }
 $('profit-labour-help').textContent=labourMode==='without'?
  'Labour is excluded from job cost and profit calculations; source labour expenses remain unchanged.':
  'Labour is included in job cost and profit calculations.';
}
function renderPerformanceTable(rows){
 const cols=reportColumns(),costKeys=new Map([
  ['labour_cost_omr','labour'],['paint_cost_omr','paint'],
  ['consumables_cost_omr','consumables'],['parts_cost_omr','parts'],['sublet_cost_omr','sublet']
 ]);
 return '<div class="finance-report" role="region" aria-label="Job Card financial report" tabindex="0"><table><thead><tr>'+
 cols.map(c=>'<th scope="col"'+(c[2]?' class="number"':'')+'>'+esc(c[0])+'</th>').join('')+
 '</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>{
  const k=c[1],val=r[k],formatted=esc(k==='percentage'?(val===null||val===undefined?'—':Number(val).toFixed(2)+'%'):display(val,c[2]));
  if(k==='job_card')return '<td data-label="'+esc(c[0])+'"><button type="button" class="jc-link" data-job="'+esc(r.job_card)+'">'+formatted+'</button></td>';
  if(costKeys.has(k)){
   const estimate=k==='parts_cost_omr'&&r.parts_cost_estimated===true||k==='consumables_cost_omr'&&r.consumables_cost_estimated===true;
   const hint=estimate?(r.cost_partial?' Partial: unpriced items excluded from known expense total.':' Priced but unreceived parts are provisional.'):'';
   return '<td data-label="'+esc(c[0])+'" class="number"><button type="button" class="expense-link" data-job="'+esc(r.job_card)+'" data-expense="'+costKeys.get(k)+'" title="'+esc(hint.trim())+'" aria-label="View '+esc(c[0])+' details for JC '+esc(r.job_card)+esc(hint)+'">'+formatted+(estimate?'*':'')+'</button></td>';
  }
  const sign=k==='net_profit_omr'?(val===null?'pending':Number(val)<0?'loss':'profit'):'';
  const estimate=['total_job_cost_omr','net_profit_omr','percentage'].includes(k)&&r.cost_estimated===true;
  return '<td data-label="'+esc(c[0])+'" class="'+(c[2]?'number ':'')+sign+'" title="'+(estimate?'Provisional: missing item prices are excluded or parts not yet received':'')+'">'+formatted+(estimate?'*':'')+'</td>';
 }).join('')+'</tr>').join('')+'</tbody></table></div>';
}
function jobCardResults(rows){
 return '<section class="jc360-results" aria-label="Job Card search results">'+rows.map(r=>{
  const meta=[r.registration,r.vehicle,r.customer].filter(Boolean).map(esc).join(' · ');
  return '<article class="jc360-result-card"><div class="jc360-result-header">'+
   '<div><strong>JC '+esc(r.job_card)+'</strong><small>'+meta+'</small></div>'+
   '<span class="jc360-job-type">'+esc(r.job_type||'Job Card')+'</span></div>'+
   '<div class="jc360-metrics"><div class="jc360-metric"><small>Total Cost</small>'+
   '<strong>'+esc(display(r.total_cost_omr,true))+'</strong></div>'+
   '<div class="jc360-metric is-profit"><small>Estimated GP</small>'+
   '<strong>'+esc(display(r.estimated_gross_profit_omr,true))+'</strong></div></div>'+
   '<button type="button" class="jc360-open" data-job="'+esc(r.job_card)+'">Open financial view</button></article>';
 }).join('')+'</section>';
}
function fillSelect(id,values,allLabel){
 const el=$(id),selected=el.value;
 el.replaceChildren(new Option(allLabel,''));
 for(const value of values||[])el.add(new Option(value,value));
 if([...el.options].some(o=>o.value===selected))el.value=selected;
}
function showFinancialSummary(data){
 const isFinancial=performanceReports.has(report),area=$('accounts-kpis'),box=$('cash-invoice-total');
 const isExpense=expenseReports.has(report);
 area.hidden=!isFinancial;box.hidden=!(isFinancial||isExpense);
 if(isExpense){
  const summary=data.summary?.[expenseSummaryKey[report]]||{};
  $('accounts-report-total-label').textContent='Total '+modules.find(m=>m[0]===report)[1]+' Expense';
  $('cash-invoice-total-amount').textContent=display(summary.amount_omr,true);
  $('cash-invoice-total-count').textContent=String(summary.records??0)+' records';
  $('cash-invoice-total-period').textContent=data.period_month||($('month').value||($('from').value||$('to').value?'Selected period':'Current month'));
  $('accounts-report-total-caption').textContent=Number(summary.pending_records||0)>0?summary.pending_records+' records have pending costs; total includes only known amounts':'Based on verified recorded costs for the selected period';
  area.replaceChildren();return;
 }
 if(!isFinancial){area.replaceChildren();return;}
 const summary=data.summary||{},label=report==='cash'?'Total Cash Invoiced':report==='insurance_invoiced'?'Total Insurance Invoiced':'Total Invoiced';
 $('accounts-report-total-label').textContent=label;
 $('cash-invoice-total-amount').textContent=display(summary.revenue_omr,true);
 $('cash-invoice-total-count').textContent=String(summary.records||0)+' Job Cards';
 $('cash-invoice-total-period').textContent=data.period_month||($('from').value||$('to').value?'Selected period':'Current month');
 $('accounts-report-total-caption').textContent='Final invoice / LPO value; not a duplicate payment receipt';
 const withoutLabour=report==='profit'&&labourMode==='without';
 const figures=[
  [withoutLabour?'Total Job Cost (excl. Labour)':'Total Job Cost',summary.total_cost_omr,true],
  [withoutLabour?'Profit / Loss (excl. Labour)':'Profit / Loss',summary.profit_omr,true],
  [withoutLabour?'Profit % (excl. Labour)':'Profit Percentage',summary.profit_percentage,false],
  ['Pending Cost Jobs',summary.pending_cost_records||0,false]
 ];
 area.innerHTML=figures.map(([label,value,currency])=>'<div class="accounts-kpi"><small>'+esc(label)+'</small><b class="'+(label==='Profit / Loss'&&value!==null?(Number(value)<0?'negative':'positive'):'')+'">'+
  (currency?esc(display(value,true)):label.startsWith('Profit %')||label==='Profit Percentage'?(value===null?'Pending / —':Number(value).toFixed(2)+'%'):esc(value))+
  ((summary.partial_cost_records||0)>0&&label!=='Pending Cost Jobs'?'*':'')+'</b></div>').join('');
 if(data.facets){
  fillSelect('insurance-company',data.facets.insurance||[],'All Insurance Companies');
  fillSelect('customer-filter',[...(data.facets.credit||[]),...(data.facets.corporate||[])].filter((s,i,a)=>a.indexOf(s)===i),'All Credit / Corporate Customers');
 }
}
async function load(){
 if(!verified)return;
 closeDetail();result=null;
 $('pdf').disabled=true;$('excel').disabled=true;$('print').disabled=true;$('cash-entry').disabled=true;
 const ticket=++generation;
 try{
  say('Loading verified financial records…');
  const searching=report!=='jobs'||$('query').value.trim().length>=2,appliedFilters=filters();
  const grouped=expenseReports.has(report)&&$('expense-view').value!=='details';
  let r=await request('workshop-api',{action:searching?'accountant_report':'accountant_dashboard',report:backendReport(report),filters:appliedFilters,offset:grouped?0:offset,limit:searching?25:1});
  if(grouped){const source=await allExpenseRows(report,appliedFilters,ticket),group=expenseGroup(source,report,$('expense-view').value);r={...r,rows:group.rows.slice(offset,offset+25),total_count:group.rows.length,next_offset:offset+25<group.rows.length?offset+25:null};}
  if(ticket!==generation)return;
  if(report==='profit'&&r.labour_mode!==labourMode)throw Error('The server did not confirm the selected labour calculation. Releasing the backend update is required.');
  result={...r,appliedFilters,canExport:searching};
  const finance=performanceReports.has(report);
  $('cash-entry').hidden=report!=='cash';$('cash-entry').disabled=false;
  $('cash-ledger-toggle').hidden=true;
  updateLabourModeControls();
  showFinancialSummary(r);
  if(report==='leave'&&r.facets?.employees){
   const staff=$('employee'),selected=staff.value;
   staff.replaceChildren(new Option('All Employees / Supervisors',''));
   for(const employee of r.facets.employees)staff.add(new Option(employee.name,employee.id));
   if([...staff.options].some(o=>o.value===selected))staff.value=selected;
  }
  next=searching?r.next_offset:null;
  if(!finance&&report!=='leave')renderSummary(r.summary);
  $('title').textContent=modules.find(m=>m[0]===report)?.[1]||report;
  $('report-meta').textContent='As of '+new Date(r.as_of).toLocaleString('en-GB',{timeZone:'Asia/Muscat'})+' Oman time'+(report==='leave'?' · '+r.summary.leave_total_days+' leave days':'');
  // Keep detailed financial caveats in source drilldowns and exports, not in the Profit/Loss summary.
  const notesText=['jobs','profit'].includes(report)?'':report==='leave'?'Read-only Manager leave history. Cancelled leave does not count in leave days.':(r.notes||[]).join(' ');
  $('notes').textContent=notesText;
  $('notes').hidden=!notesText.trim();
  $('rows').innerHTML=!searching?'<p>Search for a job card or registration number (at least 2 characters), then click to open financial details.</p>':
   r.rows.length?(report==='jobs'?jobCardResults(r.rows):finance?renderPerformanceTable(r.rows):table(r.rows,reportColumns(),false)):
   '<p>No matching records in the selected period. Missing costs are not counted as zero.</p>';
  $('previous').parentElement.hidden=!searching;
  $('pdf').disabled=!searching;$('excel').disabled=!searching;$('print').disabled=!searching;
  $('refresh').textContent=report==='jobs'?'Search Job Card':'Apply filters';
  $('previous').disabled=offset===0;$('next').disabled=next===null;
  $('page-status').textContent=(r.rows.length?offset+1:0)+'–'+(offset+r.rows.length)+' of '+r.total_count;
  $('navigation').querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',!$('accounts-workspace').hidden&&b.dataset.report===report?'page':'false'));
  say('');showPending();
 }catch(e){if(ticket===generation)say(e.message==='ACCOUNT_CHANGED'?'Account changed. Sign in again.':e.message);}
}
function showHome(){
 $('accounts-home').hidden=false;$('accounts-workspace').hidden=true;
 closeCashDialog();closeDetail();report='jobs';offset=0;
 for(const k of ['query','month','from','to','employee','material','insurance'])$(k).value='';
 load();
}

function filterVisibility(){
 const kind=$('category-filter').value;
 const views=expenseViews[report]||[],selection=$('expense-view'),previous=selection.value;
 $('expense-view-filter').hidden=!views.length;
 selection.replaceChildren(...views.map(([value,label])=>new Option(label,value)));
 selection.value=views.some(([v])=>v===previous)?previous:'details';
 $('filter-kind').hidden=report!=='profit';
 $('filter-company').hidden=!(report==='insurance_invoiced'||report==='profit'&&['ALL','INSURANCE'].includes(kind));
 $('filter-customer').hidden=!(report==='profit'&&['ALL','CREDIT','CORPORATE'].includes(kind));
 $('filter-status').hidden=report!=='leave';
 $('filter-employee').hidden=report!=='leave';
 for(const id of ['month','from','to'])$(id).closest('label').hidden=report==='jobs';
}
function switchReport(name){
 if(!modules.some(m=>m[0]===name))return;
 report=name;labourMode='with';offset=0;$('accounts-workspace').dataset.report=name;
 $('accounts-home').hidden=true;$('accounts-workspace').hidden=false;closeCashDialog();
 for(const id of ['query','month','from','to','employee','material','insurance'])$(id).value='';
 for(const id of ['insurance-company','customer-filter'])$(id).value='';
 $('category-filter').value='ALL';$('leave-status').value='active';
 if(performanceReports.has(name)||expenseReports.has(name))$('month').value=omanMonth();
 $('module-label').textContent=modules.find(m=>m[0]===name)[1];
 updateLabourModeControls();filterVisibility();closeDetail();load();
 $('accounts-workspace').scrollIntoView?.({block:'start',behavior:'smooth'});
}
$('accounts-back').onclick=showHome;

const drilldownColumns={
 consumables:columns.consumables,paint:columns.paint,parts:columns.parts,
 labour:[['Employee','employee_name'],['JC','job_card'],['Date','date'],['Normal Duty Hours','normal_hours'],money('Labour Rate OMR/h','rate_omr'),money('Labour Cost OMR','labour_cost_omr')],
 sublet:[['Date','date'],['Supplier','supplier'],['Work Description','description'],money('Cost OMR','cost_omr')]
};
const expenseSpecs=[
 ['labour','Labour Cost','labour_cost_omr'],
 ['paint','Paint Expense','paint_cost_omr'],
 ['consumables','Consumables Expense','consumables_cost_omr'],
 ['parts','Parts Expense','parts_cost_omr'],
 ['sublet','Sublet Cost','sublet_cost_omr']
];
function expenseBreakdowns(b,d,preferredType=''){
 const ordered=preferredType?[...expenseSpecs].sort((a,b)=>Number(b[0]===preferredType)-Number(a[0]===preferredType)):expenseSpecs;
 return '<section class="expense-breakdowns" aria-label="Five financial expense breakdowns">'+
  ordered.map(([type,title,k])=>{
   const lines=b[type]||[];
   const icons={labour:'♧',paint:'◌',consumables:'⬡',parts:'⚙',sublet:'↗'};
   return '<details class="expense-breakdown expense-'+type+'"><summary>'+
    '<span class="expense-label"><span class="expense-glyph" aria-hidden="true">'+icons[type]+'</span><span>'+esc(title)+'</span></span>'+
    '<strong class="expense-amount">'+esc(display(d[k],true))+
    '</strong><span class="expense-chevron" aria-hidden="true">⌄</span></summary><div class="expense-lines">'+
    (lines.length?table(lines,drilldownColumns[type]):'<p>No finalized '+esc(title.toLowerCase())+' lines in the verified source. An unknown expense is shown as Pending.</p>')+
    (type==='labour'?'<p class="notice">Labour cost is the verified combined normal-duty total; unfinished sessions remain pending.</p>':'')+
    '</div></details>';
  }).join('')+'</section>';
}
function financialDocument(detail,breakdown,cleanPrint=false){
 const format=(k)=>esc(cleanPrint?display(detail[k],true).replace(/^OMR /,''):display(detail[k],true));
 const amounts=expenseSpecs.map(([type,name,k])=>'<tr><th>'+esc(name+(detail.labour_excluded&&type==='labour'?' (excluded from profit)':'')+(type==='parts'&&detail.parts_cost_estimated?' (Parts List estimated)':'')+(type==='consumables'&&detail.consumables_cost_estimated?' (Partial)':''))+'</th><td>'+format(k)+'</td></tr>').join('');
 const pieces=expenseSpecs.map(([type,title])=>'<h3>'+esc(title)+'</h3>'+((breakdown[type]||[]).length?table(breakdown[type],drilldownColumns[type],false,cleanPrint):'<p>No finalized source lines</p>')).join('');
 const income=detail.job_invoice_amount_omr??detail.invoice_amount_omr;
 return '<!doctype html><html><head><meta charset="utf-8"><title>JC '+esc(detail.job_card)+' Financial 360</title><style>body{font:12px/1.5 Arial,sans-serif;color:#20354b;margin:20px}table{border-collapse:collapse;width:100%;margin:8px 0 18px}th,td{border:1px solid #d1dce7;padding:8px;text-align:left}th{background:#eaf2fb}h2,h3{page-break-after:avoid}.table-wrap{overflow:visible}small{font-size:10px}</style></head><body>'+
 '<h2>ZUKAIT INTERNATIONAL LLC — JC Financial 360°'+(cleanPrint?' (OMR)':'')+'</h2>'+
 '<p>JC '+esc(detail.job_card)+' · '+esc(detail.registration)+' · '+esc(detail.vehicle)+' · '+esc(detail.job_type)+
 (detail.insurance_company?' · '+esc(detail.insurance_company):'')+'</p>'+
 '<table>'+amounts+'<tr><th>'+(detail.labour_excluded?'Total Job Cost (Without Labour)':'Total Job Cost')+'</th><td>'+format('job_total_cost_omr')+'</td></tr>'+
 '<tr><th>Invoice / LPO Amount</th><td>'+esc(cleanPrint?display(income,true).replace(/^OMR /,''):display(income,true))+'</td></tr>'+
 '<tr><th>Profit / Loss</th><td>'+format('job_profit_omr')+'</td></tr></table>'+
 pieces+(detail.cost_partial?'<p><strong>PARTIAL ESTIMATE:</strong> Only available item prices are included. Missing material/parts prices are excluded, not assumed zero. The shown profit may decrease as prices are added.</p>':'')+
 (cleanPrint?'':'<p>Amounts in OMR. '+(detail.labour_excluded?'Labour expense is excluded from the Profit / Loss calculation, but the recorded labour expense is unchanged. ':'')+'Estimated job-level profit excludes general overheads. Pending amounts are not zero.</p>')+'</body></html>';
}
async function exportJob(kind){
 if(!target?.detail||busy)return;
 const d=target.detail,breakdown=target.breakdown||{},name='Zukait_JC_'+String(d.job_card).replace(/[^A-Za-z0-9_-]/g,'')+'_Financial_360';
 try{
  const html=financialDocument(d,breakdown,kind==='print'||kind==='pdf');
  if(kind==='pdf')await window.zukaitReportPdf.share(html,name+'.pdf');
  else if(kind==='print'){const w=window.open('','_blank');if(!w)throw Error('Allow pop-ups for printing.');w.document.write(html);w.document.close();w.print();}
  else {
   const records=[...expenseSpecs.map(([type,label,k])=>({category:label+(d.labour_excluded&&type==='labour'?' (excluded)':''),details:'Category total',amount_omr:d[k]})),
    {category:d.labour_excluded?'Total Job Cost (Without Labour)':'Total Job Cost',details:'',amount_omr:d.job_total_cost_omr},
    {category:'Invoice / LPO',details:'',amount_omr:d.job_invoice_amount_omr},
    {category:'Profit / Loss',details:'',amount_omr:d.job_profit_omr},
    {category:'Cost status',details:d.cost_partial?'PARTIAL — missing item prices excluded':d.cost_estimated?'PROVISIONAL — unreceived parts':d.costs_complete?'COMPLETE':'PENDING',amount_omr:null}];
   for(const [type,label] of expenseSpecs)for(const line of breakdown[type]||[])records.push({category:label,details:[line.material,line.part,line.description,line.supplier,line.employee_name,line.normal_hours,line.quantity].filter(v=>v!==undefined&&v!==null).join(' · '),amount_omr:line.cost_omr??line.net_cost_omr??line.labour_cost_omr??null});
   const xml=window.zukaitAccountantExports.spreadsheet('JC '+d.job_card+' Financial 360',[['Category','category'],['Details','details'],money('OMR','amount_omr')],records);
   if(window.AndroidBridge?.saveExportFile){const bytes=new TextEncoder().encode(xml);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);window.AndroidBridge.saveExportFile(name+'.xml','application/vnd.ms-excel',btoa(binary));}
   else{const url=URL.createObjectURL(new Blob([xml],{type:'application/vnd.ms-excel'})),a=document.createElement('a');a.href=url;a.download=name+'.xml';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  say('Job Card financial report prepared.');
 }catch(e){say(e.message);}
}
async function openJob(no,expandType='',trigger=null){
 closeDetail();detailTrigger=trigger||document.activeElement;const ticket=detailGeneration;
 try{
  say('Loading Job Card financial details…');
  const r=await request('workshop-api',{action:'accountant_jc_detail',job_card:no});
  if(ticket!==detailGeneration||!verified)return;
  let d=r.detail;
  const selectedRow=report==='profit'&&labourMode==='without'?result?.rows?.find(row=>row.job_card===d.job_card):null;
  if(selectedRow){
   d={...d,job_total_cost_omr:selectedRow.total_job_cost_omr,
    job_invoice_amount_omr:selectedRow.invoice_amount_omr,
    job_profit_omr:selectedRow.net_profit_omr,
    job_profit_percentage:selectedRow.percentage,
    labour_excluded:true,cost_partial:selectedRow.cost_partial,cost_estimated:selectedRow.cost_estimated,
    costs_complete:selectedRow.costs_complete,consumables_cost_omr:selectedRow.consumables_cost_omr,
    parts_cost_omr:selectedRow.parts_cost_omr};
  }
  target={...r,detail:d};
  const amount=d.job_invoice_amount_omr??d.invoice_amount_omr;
  const cost=d.job_total_cost_omr;
  const profit=d.job_profit_omr;
  const resultLabel=profit===null?'Pending':Number(profit)<0?'Loss':'Profit';
  $('detail').innerHTML=
   '<div class="heading"><h2 id="financial-detail-title">JC '+esc(d.job_card)+' · Financial 360°</h2><div class="detail-actions">'+
   '<button type="button" id="job-pdf">PDF</button><button type="button" id="job-excel">Excel</button><button type="button" id="job-print">Print</button>'+
   '<button type="button" id="close-detail">Back to report</button></div></div>'+
   '<div class="detail-grid">'+[
    ...(d.cost_partial?[['Cost status','PARTIAL — MISSING ITEM PRICES']]:d.cost_estimated?[['Cost status','PROVISIONAL']]:[]),
    ...(d.labour_excluded?[['Calculation Mode','WITHOUT LABOUR']]:[]),['Registration',d.registration],['Vehicle',d.vehicle],['Job Type',d.job_type],['Insurance Company / Cash',d.insurance_company||d.job_type],['Invoice / LPO Amount',display(amount,true)],['Total Job Cost',display(cost,true)],
    [d.labour_excluded?'Profit / Loss without Labour':resultLabel,display(profit,true)],['Profit %',d.job_profit_percentage===null?'Pending':Number(d.job_profit_percentage).toFixed(2)+'%']
   ].map(([label,v])=>{
    const tone=/^Profit|^Loss/.test(label)?Number(profit)<0?' is-loss':' is-positive':
     label==='Total Job Cost'||label==='Invoice / LPO Amount'?' is-money':
     label==='Cost status'?' is-status':'';
    return '<div class="detail-value'+tone+'"><small>'+esc(label)+'</small><strong>'+esc(v??'—')+'</strong></div>';
   }).join('')+
   '</div><h3>'+(expandType?'Expense breakdown · '+esc(expandType.charAt(0).toUpperCase()+expandType.slice(1)):'Expense breakdown')+'</h3>'+expenseBreakdowns(r.breakdown||{},d,expandType)+
   (d.cost_partial?'<p class="financial-status-note">Partial estimate: missing parts or materials prices are excluded; profit may change.</p>':
    d.cost_estimated?'<p class="financial-status-note">Provisional cost: some parts have not yet been received.</p>':
    d.job_total_cost_omr===null?'<p class="financial-status-note">Some source costs are pending.</p>':'');
  $('detail').hidden=false;
  $('close-detail').onclick=closeDetail;
  $('job-pdf').onclick=()=>exportJob('pdf');$('job-excel').onclick=()=>exportJob('excel');$('job-print').onclick=()=>exportJob('print');
  if(expandType){const section=$('detail').querySelector('.expense-'+expandType);if(section)section.open=true;}
  showDetailDialog();say('');
 }catch(e){if(ticket===detailGeneration)say(e.message);}
}
async function submit(command,retry=null){
 if(!billsEnabled)return submitUnlocked(command,retry);
 if(!verified||busy)return;
 try{
  const actor=user.id,role=user.role,originalToken=token();
  if(!financialLockKey||typeof navigator.locks?.request!=='function')throw Error('Financial submission lock unavailable.');
  const frozenCommand=JSON.parse(JSON.stringify(command)),frozenRetry=retry?JSON.parse(JSON.stringify(retry)):null;
  await navigator.locks.request(financialLockKey(url,actor),{mode:'exclusive',ifAvailable:true},async lock=>{
   if(!lock)throw Error('Another tab is submitting a financial request. Retry after confirmation.');
   if(!verified||user.id!==actor||user.role!==role||token()!==originalToken)throw Error('ACCOUNT_CHANGED');
   if(frozenRetry&&localStorage.getItem(pendingKey())!==JSON.stringify(frozenRetry))throw Error('Pending financial request changed. Review recovery again.');
   return submitUnlocked(frozenCommand,frozenRetry);
  });
 }catch(e){say(e.message);showPending();}
}
async function submitUnlocked(command,retry=null){if(busy||!verified)return;try{token()}catch{say('Account changed. Sign in again.');return;}if(hasBillPending()){say('Resolve the pending supplier bill first.');showPending();return;}if(navigator.onLine===false){say('Financial writes require an online connection.');return;}const existing=pending();if(existing&&!retry){say('Resolve the pending request first.');showPending();return;}busy=true;const body=retry||{action:'accountant_command',request_id:crypto.randomUUID(),command};try{if(!retry){localStorage.setItem(pendingKey(),JSON.stringify(body));if(localStorage.getItem(pendingKey())!==JSON.stringify(body))throw Error('This device could not retain the retry. No financial request sent.');}say('Waiting for server confirmation…');await request('workshop-api',body);localStorage.removeItem(pendingKey());closeCashDialog();$('correction').hidden=true;say('Financial request confirmed with audit history.');showPending();await load();}catch(e){try{token()}catch{say('Account changed. Sign in again.');return;}if(e.status>=400&&e.status<500&&!['request_conflict','invalid_session'].includes(e.message))localStorage.removeItem(pendingKey());say(e.message==='financial_conflict'?'Another device changed the financial records. Refresh, review and submit again. Your inputs remain available.':e.message);showPending();}finally{busy=false;}}
function cashForm(row=null){
 $('entry').hidden=false;
 $('operation').value=row?'CORRECT':'POST';
 $('entry-title').textContent=row?'Correct transaction · original retained':'New cash transaction';
 $('entry-id').value=row?.id||'';
 for(const [id,key] of [['kind','kind'],['entry-job','job_card'],['payee','payee'],['amount','amount'],['method','payment_method'],['category','category'],['reference','reference'],['remarks','remarks']])
  $(id).value=row?.[key]??(id==='kind'?'CASH_IN':id==='method'?'CASH':'');
 $('transaction-date').value=row?.transaction_date||new Date(Date.now()+14400000).toISOString().slice(0,10);
 $('reason').value='';
 const dialog=$('cash-entry-dialog');
 try{if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();
 else dialog.setAttribute('open','');}
 catch{dialog.setAttribute('open','');}
 $('payee').focus?.();
}

function revision(){return {expected_snapshot_revision:result?.snapshot_revision,expected_finance_revision:result?.finance_revision};}
$('entry').onsubmit=e=>{e.preventDefault();const c={operation:$('operation').value,...revision(),transaction_date:$('transaction-date').value,kind:$('kind').value,job_card:$('entry-job').value.trim().toUpperCase(),payee:$('payee').value.trim(),amount:$('amount').value,payment_method:$('method').value,category:$('category').value.trim(),reference:$('reference').value.trim(),remarks:$('remarks').value.trim(),reason:$('reason').value.trim()};if(c.operation==='CORRECT')c.entry_id=$('entry-id').value;submit(c);};
$('correction').onsubmit=e=>{e.preventDefault();if(!target?.field)return;const d=target.detail,k=target.field,c={operation:k==='invoice_amount_omr'?'CORRECT_INVOICE':'ADJUST_COST',job_card:d.job_card,expected_snapshot_revision:target.snapshot_revision,expected_finance_revision:target.finance_revision,transaction_date:new Date(Date.now()+14400000).toISOString().slice(0,10),old_value:d[k],new_value:$('corrected-value').value,reason:$('correction-reason').value.trim()};if(c.operation==='ADJUST_COST')c.category={consumables_cost_omr:'consumables',paint_cost_omr:'paint',parts_cost_omr:'parts',labour_cost_omr:'labour'}[k];submit(c);};
$('detail').onclick=e=>{const b=e.target.closest('[data-adjust]');if(!b||!target)return;target.field=b.dataset.adjust;$('correction-target').textContent=target.detail.job_card+' · '+target.field.replaceAll('_',' ')+' · Original '+display(target.detail[target.field],true)+(target.field==='invoice_amount_omr'&&target.detail.job_type==='INSURANCE'?' · Linked LPO amount is also corrected; this does not record a cash receipt.':'');$('corrected-value').value=target.detail[target.field];$('correction-reason').value='';$('correction').hidden=false;};
$('rows').onclick=e=>{if(!result)return;const expense=e.target.closest('[data-expense]');if(expense)return openJob(expense.dataset.job,expense.dataset.expense,expense);const j=e.target.closest('[data-job]');if(j)return openJob(j.dataset.job,'',j);const c=e.target.closest('[data-correct]');if(c){const row=result.rows[Number(c.dataset.correct)];if(row&&!row.invoice_receipt)return cashForm(row);return;}const r=e.target.closest('[data-reverse]');if(r){const row=result.rows[Number(r.dataset.reverse)];if(!row||row.invoice_receipt)return;const reason=prompt('Reason for reversal? The original entry remains in history.');if(reason?.trim().length>=3)submit({operation:'REVERSE',entry_id:row.id,transaction_date:new Date(Date.now()+14400000).toISOString().slice(0,10),reason:reason.trim(),...revision()});}};
const moduleSvg=content=>'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+content+'</svg>';
const moduleDesign={
 jobs:[moduleSvg('<rect x="5" y="4" width="14" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m8 14 2.3 2.3L16 10.5"/>'),'Search registration or JC and inspect all five costs','blue'],
 cash:[moduleSvg('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 16v2c0 1.7 3.1 3 7 3s7-1.3 7-3v-2"/>'),'Manager Cash financial report with five cost columns','green'],
 insurance_invoiced:[moduleSvg('<path d="M12 2 4 5v6c0 5.2 3 8.6 8 11 5-2.4 8-5.8 8-11V5z"/><path d="m7.5 13 1-3h7l1 3M8 16v-3h8v3M9 16v1m6-1v1"/>'),'Delivered, invoiced insurance vehicles by company','indigo'],
 leave:[moduleSvg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 10h18"/>'),'Manager leave history — read-only','amber'],
 profit:[moduleSvg('<rect x="4" y="13" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="16" y="3" width="4" height="18" rx="1"/>'),'Cash, Insurance, Credit and Corporate combined','teal'],
 consumables:[moduleSvg('<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 2v6m6-6v6M8 12h8m-8 4h8"/>'),'Monthly material consumption, brand and costs','green'],
 parts:[moduleSvg('<path d="M14 4a6 6 0 0 0-7 7L3 15l6 6 4-4a6 6 0 0 0 7-7l-5 5-4-4z"/>'),'Monthly spare parts purchases and returns','blue'],
 paint:[moduleSvg('<path d="M5 13h14v7H5zM8 4h8l3 9H5zM12 4V2"/>'),'Monthly paint purchases and returns','indigo']
};
$('navigation').innerHTML=modules.map(([name,title])=>{const [icon,description,tone]=moduleDesign[name];return '<button type="button" class="module-card tone-'+tone+'" aria-label="'+esc(title)+'" data-report="'+name+'"><span class="module-icon" aria-hidden="true">'+icon+'</span><span class="module-copy"><strong>'+title+'</strong><small>'+description+'</small></span><span class="module-arrow" aria-hidden="true">›</span></button>';}).join('');for(const id of ['navigation','summary'])$(id).onclick=e=>{const b=e.target.closest('[data-report]');if(b)switchReport(b.dataset.report)};
$('query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();offset=0;$('detail').hidden=true;load()}});$('refresh').onclick=()=>{offset=0;$('detail').hidden=true;load()};$('clear').onclick=()=>{
 for(const id of ['query','month','from','to','employee','material','insurance','insurance-company','customer-filter'])$(id).value='';
 $('category-filter').value='ALL';$('leave-status').value='active';
 if(performanceReports.has(report)||expenseReports.has(report))$('month').value=omanMonth();
 filterVisibility();offset=0;$('detail').hidden=true;load();
};$('previous').onclick=()=>{offset=Math.max(0,offset-25);load()};$('next').onclick=()=>{if(next!==null){offset=next;load()}};$('cash-entry').onclick=()=>cashForm();
$('cash-ledger-toggle').onclick=()=>{report=report==='cash'?'cash_ledger':'cash';offset=0;$('module-label').textContent=report==='cash_ledger'?'Receipts / Cash Out':'Cash Invoices';load();};
$('cash-entry-dialog').addEventListener('close',()=>{$('entry').hidden=true;});
for(const id of ['from','to'])$(id).addEventListener('change',()=>{if((performanceReports.has(report)||expenseReports.has(report))&&$(id).value)$('month').value='';});
$('month').addEventListener('change',()=>{if((performanceReports.has(report)||expenseReports.has(report))&&$('month').value){$('from').value='';$('to').value='';}});
$('expense-view').onchange=()=>{if(expenseReports.has(report)){offset=0;load();}};
$('category-filter').onchange=()=>{filterVisibility();$('insurance-company').value='';$('customer-filter').value='';};
for(const [mode,id] of [['with','profit-with-labour'],['without','profit-without-labour']]){
 $(id).onclick=()=>{if(report!=='profit'||mode===labourMode)return;labourMode=mode;offset=0;updateLabourModeControls();load();};
}
$('cancel-entry').onclick=closeCashDialog;$('cancel-correction').onclick=()=>{$('correction').hidden=true};
async function exportRows(kind){if(!result?.canExport||busy)return;const printable=kind==='print'?window.open('','_blank'):null;if(kind==='print'&&!printable){say('Allow print pop-ups and try again.');return;}const exportGeneration=generation,exportReport=report,exportBackendReport=backendReport(report),exportFilters={...result.appliedFilters},exportMode=labourMode,
 exportColumns=performanceReports.has(report)?[...reportColumns(report,labourMode).slice(0,-1),['Cost status','cost_status'],reportColumns(report,labourMode).at(-1)]:reportColumns(report,labourMode);busy=true;try{say('Preparing complete report…');const all=[],expected=[result.snapshot_revision,result.finance_revision];let cursor=0;do{const r=await request('workshop-api',{action:'accountant_report',report:exportBackendReport,filters:exportFilters,offset:cursor,limit:500});if(exportGeneration!==generation)throw Error('Report changed during export. Export the selected report again.');if(r.snapshot_revision!==expected[0]||r.finance_revision!==expected[1])throw Error('Data changed during export. Refresh before exporting.');all.push(...r.rows.map(row=>({...row,cost_status:row.cost_partial?'PARTIAL — missing prices excluded':row.cost_estimated?'PROVISIONAL — unreceived parts':!row.costs_complete?'PENDING':'COMPLETE'})));cursor=r.next_offset;if(all.length>5000)throw Error('Narrow the date filter to export at most 5,000 rows.');}while(cursor!==null);if(expenseReports.has(exportReport)&&$('expense-view').value!=='details'){const grouped=expenseGroup(all,exportReport,$('expense-view').value);all.splice(0,all.length,...grouped.rows);}const title=(exportReport==='cash_ledger'?'Receipts / Cash Out':modules.find(m=>m[0]===exportReport)[1])+(exportReport==='profit'?(exportMode==='without'?' — Without Labour':' — With Labour'):''),name='Zukait_'+exportReport+(exportReport==='profit'?'_'+exportMode+'_labour':'')+'_'+new Date().toISOString().slice(0,10);if(kind==='pdf'){await window.zukaitReportPdf.share(window.zukaitAccountantExports.html(title,exportColumns,all,'',{cleanPrint:true}),name+'.pdf');}else if(kind==='print'){printable.document.write(window.zukaitAccountantExports.html(title,exportColumns,all,'',{cleanPrint:true}));printable.document.close();printable.print();}else{const xml=window.zukaitAccountantExports.spreadsheet(title,exportColumns,all);if(window.AndroidBridge?.saveExportFile){const bytes=new TextEncoder().encode(xml);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);window.AndroidBridge.saveExportFile(name+'.xml','application/vnd.ms-excel',btoa(binary));}else{const a=document.createElement('a'),u=URL.createObjectURL(new Blob([xml],{type:'application/vnd.ms-excel'}));a.href=u;a.download=name+'.xml';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}}say('Report prepared.');}catch(e){if(printable)try{printable.close()}catch{}say(e.message)}finally{busy=false;}}
$('pdf').onclick=()=>exportRows('pdf');$('excel').onclick=()=>exportRows('excel');$('print').onclick=()=>exportRows('print');
$('manager-back').onclick=()=>location.assign(location.protocol==='file:'||location.hostname==='appassets.androidplatform.net'?'offline_test.html':'index.html');
$('logout').onclick=()=>{if(window.zukaitSessionPrivacy){invalidate();return window.zukaitSessionPrivacy.signOut();}let t='';try{t=token()}catch{}invalidate();localStorage.removeItem(sessionKey);try{window.AndroidBridge?.clearSecureSessionToken?.()}catch{}if(t)fetch(url+'/functions/v1/staff-auth',{method:'POST',headers:{'Content-Type':'application/json',apikey:publicKey},body:JSON.stringify({action:'logout',session_token:t})}).catch(()=>{});location.replace(location.protocol==='file:'||location.hostname==='appassets.androidplatform.net'?'offline_test.html':'index.html');};
async function boot(){try{const s=saved();if(!['Accountant','Manager'].includes(s?.user?.role))throw Error('Manager or Accountant sign-in required.');user=s.user;const r=await request('staff-auth',{action:'session',session_token:token()});if(r.user?.id!==user.id||r.user.role!==user.role||!['Accountant','Manager'].includes(r.user.role))throw Error('Accountant session invalid');user=r.user;verified=true;await initializeBills();token();if(!verified)throw Error('ACCOUNT_CHANGED');$('manager-back').hidden=user.role!=='Manager';$('account-name').textContent=user.name||user.id;$('identity').textContent=user.role==='Manager'?'Manager · Accounts':'Accountant';$('app').hidden=false;window.zukaitSessionPrivacy?.unlock();window.dispatchEvent(new Event('zukait-accountant-session'));showPending();await load();}catch(e){$('app').hidden=true;say(e.message+' · Return to sign-in.');$('logout').textContent='Back to sign-in';}}
async function changePassword(currentPassword,newPassword){
 if(!verified||busy)throw Error('Finish the current request before changing your password.');
 const r=await request('staff-auth',{action:'change_password',session_token:token(),user_id:user.id,current_password:currentPassword,new_password:newPassword});
 if(typeof r.session_token!=='string'||!r.session_token)throw Error('Password confirmation unavailable. Sign in again.');
 try{
  const b=window.AndroidBridge,s={user,savedAt:Date.now()};
  if(typeof b?.saveSecureSessionToken==='function'&&typeof b?.getSecureSessionToken==='function'){
   if(b.saveSecureSessionToken(r.session_token)===false||String(b.getSecureSessionToken())!==r.session_token)throw Error('Secure storage unavailable');
  }else s.token=r.session_token;
  localStorage.setItem(sessionKey,JSON.stringify(s));
 }catch{invalidate();localStorage.removeItem(sessionKey);try{window.AndroidBridge?.clearSecureSessionToken?.()}catch{}throw Error('Password changed. Sign in again to continue.');}
 await load();
}
async function prepareForUpdate(){
 const clean=()=>verified&&!busy&&navigator.onLine!==false&&localStorage.getItem(pendingKey())===null&&!hasBillPending()&&$('entry').hidden&&!$('cash-entry-dialog').open&&$('correction').hidden&&$('account-password-form').hidden;
 try{if(!clean())return false;token();await request('workshop-api',{action:'accountant_dashboard',limit:1});return clean();}catch{return false;}
}
window.zukaitAccountant={load,openJob,switchReport,submit,exportRows,changePassword,prepareForUpdate,submitBill,getUser:()=>verified?{...user}:null,formatNormalDutyHours};boot();
})();
