(function(){'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const config=window.ZUKAIT_ACCOUNTANT_CONFIG||{},url=config.url||'https://pjknotnjkufadqavcmii.supabase.co',publicKey=config.key||'sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A',sessionKey='zukait_secure_session_v42';
const modules=[['jobs','Job Card 360°'],['cash','Cash In'],['insurance_invoiced','Insurance Invoiced'],['leave','Leave Management'],['profit','Profit / Loss']];
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
let user=null,report='jobs',offset=0,next=null,result=null,generation=0,detailGeneration=0,busy=false,target=null,verified=false;
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
 if(report==='profit')out.kind=$('category-filter').value||'ALL';
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
function table(rows,cols,actions=false){return '<div class="table-wrap"><table><thead><tr>'+cols.map(c=>'<th'+(c[2]?' class="money"':'')+'>'+esc(c[0])+'</th>').join('')+(actions?'<th>Actions</th>':'')+'</tr></thead><tbody>'+rows.map((r,i)=>'<tr>'+cols.map(c=>'<td'+(c[2]?' class="money"':'')+'>'+esc(display(r[c[1]],c[2]))+'</td>').join('')+(actions?'<td>'+(['jobs','cash'].includes(report)?'<button type="button" data-job="'+esc(r.job_card)+'">'+(report==='jobs'?'Open financial view':'View JC')+'</button>':report==='cash_ledger'?(r.invoice_receipt?'<span>From Cash invoice</span>':'<button type="button" data-correct="'+i+'">Correct</button><button type="button" data-reverse="'+i+'">Reverse</button>'):'')+'</td>':'')+'</tr>').join('')+'</tbody></table></div>';}
function closeDetail(){detailGeneration++;target=null;$('detail').hidden=true;$('correction').hidden=true;}
function backendReport(name){return ['cash','insurance_invoiced','profit'].includes(name)?'accounts_performance':name==='leave'?'accounts_leave':name;}
function closeCashDialog(){
 const dialog=$('cash-entry-dialog');
 try{if(typeof dialog.close==='function'&&dialog.open)dialog.close();
 else dialog.removeAttribute('open');}
 catch{dialog.removeAttribute('open');}
 $('entry').hidden=true;
}

const performanceReports=new Set(['cash','insurance_invoiced','profit']);
function renderPerformanceTable(rows){
 const cols=columns[report],costKeys=new Map([
  ['labour_cost_omr','labour'],['paint_cost_omr','paint'],
  ['consumables_cost_omr','consumables'],['parts_cost_omr','parts'],['sublet_cost_omr','sublet']
 ]);
 return '<div class="finance-report" role="region" aria-label="Job Card financial report" tabindex="0"><table><thead><tr>'+
 cols.map(c=>'<th scope="col"'+(c[2]?' class="number"':'')+'>'+esc(c[0])+'</th>').join('')+
 '</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>{
  const k=c[1],val=r[k],formatted=esc(k==='percentage'?(val===null||val===undefined?'—':Number(val).toFixed(2)+'%'):display(val,c[2]));
  if(k==='job_card')return '<td><button type="button" class="jc-link" data-job="'+esc(r.job_card)+'">'+formatted+'</button></td>';
  if(costKeys.has(k))return '<td class="number"><button type="button" class="expense-link" data-job="'+esc(r.job_card)+'" data-expense="'+costKeys.get(k)+'" aria-label="View '+esc(c[0])+' details for JC '+esc(r.job_card)+'">'+formatted+'</button></td>';
  const sign=k==='net_profit_omr'?(val===null?'pending':Number(val)<0?'loss':'profit'):'';
  return '<td class="'+(c[2]?'number ':'')+sign+'">'+formatted+'</td>';
 }).join('')+'</tr>').join('')+'</tbody></table></div>';
}
function fillSelect(id,values,allLabel){
 const el=$(id),selected=el.value;
 el.replaceChildren(new Option(allLabel,''));
 for(const value of values||[])el.add(new Option(value,value));
 if([...el.options].some(o=>o.value===selected))el.value=selected;
}
function showFinancialSummary(data){
 const isFinancial=performanceReports.has(report),area=$('accounts-kpis'),box=$('cash-invoice-total');
 area.hidden=!isFinancial;box.hidden=!isFinancial;
 if(!isFinancial){area.replaceChildren();return;}
 const summary=data.summary||{},label=report==='cash'?'Total Cash Invoiced':report==='insurance_invoiced'?'Total Insurance Invoiced':'Total Invoiced';
 $('accounts-report-total-label').textContent=label;
 $('cash-invoice-total-amount').textContent=display(summary.revenue_omr,true);
 $('cash-invoice-total-count').textContent=String(summary.records||0)+' Job Cards';
 $('cash-invoice-total-period').textContent=data.period_month||($('from').value||$('to').value?'Selected period':'Current month');
 $('accounts-report-total-caption').textContent='Final invoice / LPO value; not a duplicate payment receipt';
 const figures=[
  ['Total Job Cost',summary.total_cost_omr,true],
  ['Profit / Loss',summary.profit_omr,true],
  ['Profit Percentage',summary.profit_percentage,false],
  ['Pending Cost Jobs',summary.pending_cost_records||0,false]
 ];
 area.innerHTML=figures.map(([label,value,currency])=>'<div class="accounts-kpi"><small>'+esc(label)+'</small><b class="'+(label==='Profit / Loss'&&value!==null?(Number(value)<0?'negative':'positive'):'')+'">'+
  (currency?esc(display(value,true)):label==='Profit Percentage'?(value===null?'Pending / —':Number(value).toFixed(2)+'%'):esc(value))+'</b></div>').join('');
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
  const r=await request('workshop-api',{action:searching?'accountant_report':'accountant_dashboard',report:backendReport(report),filters:appliedFilters,offset,limit:searching?25:1});
  if(ticket!==generation)return;
  result={...r,appliedFilters,canExport:searching};
  const finance=performanceReports.has(report);
  $('cash-entry').hidden=report!=='cash';$('cash-entry').disabled=false;
  $('cash-ledger-toggle').hidden=true;
  showFinancialSummary(r);
  next=searching?r.next_offset:null;
  if(!finance&&report!=='leave')renderSummary(r.summary);
  $('title').textContent=modules.find(m=>m[0]===report)?.[1]||report;
  $('report-meta').textContent='As of '+new Date(r.as_of).toLocaleString('en-GB',{timeZone:'Asia/Muscat'})+' Oman time'+(report==='leave'?' · '+r.summary.leave_total_days+' leave days':'');
  $('notes').textContent=report==='leave'?'Read-only Manager leave history. Cancelled leave does not count in leave days.':(r.notes||[]).join(' ');
  $('rows').innerHTML=!searching?'<p>Search by Job Card or registration number (at least 2 characters), then click to open financial details.</p>':
   r.rows.length?(finance?renderPerformanceTable(r.rows):table(r.rows,columns[report],report==='jobs')):
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
 $('filter-kind').hidden=report!=='profit';
 $('filter-company').hidden=!(report==='insurance_invoiced'||report==='profit'&&['ALL','INSURANCE'].includes(kind));
 $('filter-customer').hidden=!(report==='profit'&&['ALL','CREDIT','CORPORATE'].includes(kind));
 $('filter-status').hidden=report!=='leave';
 $('filter-employee').hidden=report!=='leave';
 for(const id of ['month','from','to'])$(id).closest('label').hidden=report==='jobs';
}
function switchReport(name){
 if(!modules.some(m=>m[0]===name))return;
 report=name;offset=0;
 $('accounts-home').hidden=true;$('accounts-workspace').hidden=false;closeCashDialog();
 for(const id of ['query','month','from','to','employee','material','insurance'])$(id).value='';
 for(const id of ['insurance-company','customer-filter'])$(id).value='';
 $('category-filter').value='ALL';$('leave-status').value='active';
 if(performanceReports.has(name))$('month').value=omanMonth();
 $('module-label').textContent=modules.find(m=>m[0]===name)[1];
 filterVisibility();closeDetail();load();
 $('accounts-workspace').scrollIntoView?.({block:'start',behavior:'smooth'});
}
$('accounts-back').onclick=showHome;
function expenseBreakdowns(b,d){return '<section class="expense-breakdowns" aria-label="Job Card expense details">'+[['consumables','Consumables','consumables_cost_omr'],['parts','Spare Parts','parts_cost_omr'],['paint','Paint','paint_cost_omr']].map(([key,title,cost])=>'<details class="expense-breakdown expense-'+key+'"><summary><span>'+title+' <small>'+((b[key]||[]).length)+' item(s)</small></span><strong>'+display(d[cost],true)+'</strong><span aria-hidden="true">⌄</span></summary><div class="expense-lines">'+((b[key]||[]).length?table(b[key],columns[key]):'<p>No recorded items. Check whether actual costs still need to be entered.</p>')+'</div></details>').join('')+'</section>';}
async function openJob(no){closeDetail();const ticket=detailGeneration;try{say('Loading complete financial view…');const r=await request('workshop-api',{action:'accountant_jc_detail',job_card:no});if(ticket!==detailGeneration||!verified)return;const d=r.detail;target={...r,detail:d};const values=[['Invoice','invoice_amount_omr'],['Actual consumables','consumables_cost_omr'],['Net paint','paint_cost_omr'],['Net spare parts','parts_cost_omr'],['Normal-duty labour','labour_cost_omr'],['Total JC cost','total_cost_omr'],['Estimated gross profit','estimated_gross_profit_omr'],['Verified payment received','payment_received_omr'],['Outstanding balance','outstanding_omr']];$('detail').innerHTML='<div class="heading"><h2>JC '+esc(d.job_card)+' · Financial 360°</h2><button type="button" id="close-detail">Close details</button></div><p>'+esc([d.vehicle,d.registration,d.customer,d.job_type].filter(Boolean).join(' · '))+'</p>'+(d.cash_invoice_paid?'<p class="notice">Cash invoice confirms full payment. Existing Cash In entries are reconciled to prevent double counting.</p>':'')+'<div class="detail-grid">'+values.map(([label,k])=>'<div class="detail-value"><small>'+label+'</small><strong>'+display(d[k],true)+'</strong>'+(['invoice_amount_omr','consumables_cost_omr','paint_cost_omr','parts_cost_omr','labour_cost_omr'].includes(k)&&d[k]!==null?'<button type="button" data-adjust="'+k+'">Record correction</button>':'')+'</div>').join('')+'</div><p class="notice">'+esc(d.warnings.join(' · ')||'All mapped source costs are available. Estimated gross profit excludes overheads.')+'</p>'+expenseBreakdowns(r.breakdown||{},d)+'<h3>Transactions and correction history</h3>'+table(d.history,[['Record ID','id'],['Replaces','replaces_id'],['Reverses','reverses_id'],['Operation','operation'],['Kind','kind'],['Payee','payee'],['Method','payment_method'],['Reference','reference'],['Actor','actor_id'],['When','created_at'],money('Old OMR','old_value'),money('New OMR','new_value'),['Reason','reason']]);$('detail').hidden=false;$('close-detail').onclick=closeDetail;$('detail').scrollIntoView?.({behavior:'smooth',block:'start'});say('');}catch(e){if(ticket===detailGeneration)say(e.message)}}
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
$('rows').onclick=e=>{if(!result)return;const j=e.target.closest('[data-job]');if(j)return openJob(j.dataset.job);const c=e.target.closest('[data-correct]');if(c){const row=result.rows[Number(c.dataset.correct)];if(row&&!row.invoice_receipt)return cashForm(row);return;}const r=e.target.closest('[data-reverse]');if(r){const row=result.rows[Number(r.dataset.reverse)];if(!row||row.invoice_receipt)return;const reason=prompt('Reason for reversal? The original entry remains in history.');if(reason?.trim().length>=3)submit({operation:'REVERSE',entry_id:row.id,transaction_date:new Date(Date.now()+14400000).toISOString().slice(0,10),reason:reason.trim(),...revision()});}};
const moduleDesign={
 jobs:['⌕','Search registration or JC and inspect all five costs','blue'],
 cash:['▤','Manager Cash financial report with five cost columns','green'],
 insurance_invoiced:['▣','Delivered, invoiced insurance vehicles by company','indigo'],
 leave:['▦','Manager leave history — read-only','amber'],
 profit:['◒','Cash, Insurance, Credit and Corporate combined','teal']
};
$('navigation').innerHTML=modules.map(([name,title])=>{const [icon,description,tone]=moduleDesign[name];return '<button type="button" class="module-card tone-'+tone+'" aria-label="'+esc(title)+'" data-report="'+name+'"><span class="module-icon" aria-hidden="true">'+icon+'</span><span class="module-copy"><strong>'+title+'</strong><small>'+description+'</small></span><span class="module-arrow" aria-hidden="true">›</span></button>';}).join('');for(const id of ['navigation','summary'])$(id).onclick=e=>{const b=e.target.closest('[data-report]');if(b)switchReport(b.dataset.report)};
$('query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();offset=0;$('detail').hidden=true;load()}});$('refresh').onclick=()=>{offset=0;$('detail').hidden=true;load()};$('clear').onclick=()=>{for(const k of ['query','month','from','to','employee','material','insurance'])$(k).value='';if(['cash','cash_ledger'].includes(report))$('month').value=omanMonth();offset=0;$('detail').hidden=true;load()};$('previous').onclick=()=>{offset=Math.max(0,offset-25);load()};$('next').onclick=()=>{if(next!==null){offset=next;load()}};$('cash-entry').onclick=()=>cashForm();
$('cash-ledger-toggle').onclick=()=>{report=report==='cash'?'cash_ledger':'cash';offset=0;$('module-label').textContent=report==='cash_ledger'?'Receipts / Cash Out':'Cash Invoices';load();};
$('cash-entry-dialog').addEventListener('close',()=>{$('entry').hidden=true;});
for(const id of ['from','to'])$(id).addEventListener('change',()=>{if(['cash','cash_ledger'].includes(report)&&$(id).value)$('month').value='';});
$('month').addEventListener('change',()=>{if(['cash','cash_ledger'].includes(report)&&$('month').value){$('from').value='';$('to').value='';}});
$('cancel-entry').onclick=closeCashDialog;$('cancel-correction').onclick=()=>{$('correction').hidden=true};
async function exportRows(kind){if(!result?.canExport||busy)return;const exportGeneration=generation,exportReport=report,exportBackendReport=backendReport(report),exportFilters={...result.appliedFilters},exportColumns=columns[report];busy=true;try{say('Preparing complete report…');const all=[],expected=[result.snapshot_revision,result.finance_revision];let cursor=0;do{const r=await request('workshop-api',{action:'accountant_report',report:exportBackendReport,filters:exportFilters,offset:cursor,limit:500});if(exportGeneration!==generation)throw Error('Report changed during export. Export the selected report again.');if(r.snapshot_revision!==expected[0]||r.finance_revision!==expected[1])throw Error('Data changed during export. Refresh before exporting.');all.push(...r.rows);cursor=r.next_offset;if(all.length>5000)throw Error('Narrow the date filter to export at most 5,000 rows.');}while(cursor!==null);const title=exportReport==='cash_ledger'?'Receipts / Cash Out':modules.find(m=>m[0]===exportReport)[1],name='Zukait_'+exportReport+'_'+new Date().toISOString().slice(0,10);if(kind==='pdf'){await window.zukaitReportPdf.share(window.zukaitAccountantExports.html(title,exportColumns,all,JSON.stringify(exportFilters)),name+'.pdf');}else{const xml=window.zukaitAccountantExports.spreadsheet(title,exportColumns,all);if(window.AndroidBridge?.saveExportFile){const bytes=new TextEncoder().encode(xml);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);window.AndroidBridge.saveExportFile(name+'.xml','application/vnd.ms-excel',btoa(binary));}else{const a=document.createElement('a'),u=URL.createObjectURL(new Blob([xml],{type:'application/vnd.ms-excel'}));a.href=u;a.download=name+'.xml';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}}say('Report prepared.');}catch(e){say(e.message)}finally{busy=false;}}
$('pdf').onclick=()=>exportRows('pdf');$('excel').onclick=()=>exportRows('excel');
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
window.zukaitAccountant={load,openJob,switchReport,submit,exportRows,changePassword,prepareForUpdate,submitBill,getUser:()=>verified?{...user}:null};boot();
})();
