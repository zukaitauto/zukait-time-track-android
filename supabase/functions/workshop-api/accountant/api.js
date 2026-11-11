import {financialReport,validateFilters,validDay,key,milli,day,searchKey} from './finance_rules.js';
import {managerProfitReport} from './profit_performance.js';
import {accountsPerformanceReport,accountsLeaveReport} from './accounts_reports.js';
const actions=new Set(['accountant_dashboard','accountant_jc_search','accountant_jc_detail','accountant_report','accountant_command']);
const reportNames=new Set(['jobs','consumables','paint','parts','leave','cash','lpo','outstanding','monthly','audit','labour','invoices','cash_invoices','manager_profit','accounts_performance','accounts_leave']);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export async function fingerprint(value,secret){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(JSON.stringify(canonical(value)))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function accountantApi(admin,user,body,secret,now=Date.now()){
 const fail=(code,status=400)=>({status,body:{ok:false,code}}),action=body?.action;
 if(!user||!['Accountant','Manager'].includes(user.role)||!actions.has(action))return fail('accountant_forbidden',403);
 if(Object.keys(body).some(k=>!['action','query','job_card','filters','report','offset','limit','request_id','command'].includes(k)))return fail('accountant_forbidden',403);
 const filters=body.filters||{};if(!validateFilters(filters))return fail('invalid_filters');
 if(body.offset!==undefined&&(!Number.isInteger(body.offset)||body.offset<0)||body.limit!==undefined&&(!Number.isInteger(body.limit)||body.limit<1||body.limit>500))return fail('invalid_pagination');
 if(action==='accountant_report'&&!reportNames.has(body.report))return fail('invalid_report');
 if(body.report==='manager_profit'&&(action!=='accountant_report'||user.role!=='Manager'))return fail('manager_required',403);
 if(body.report==='manager_profit'&&Object.keys(filters).some(k=>!['month','insurance','query','job_card','from','to'].includes(k)))return fail('invalid_filters');
 if(Object.keys(filters).some(k=>['kind','customer','status'].includes(k))&&!(action==='accountant_report'&&['accounts_performance','accounts_leave'].includes(body.report)))return fail('invalid_filters');
 if(action==='accountant_jc_search'&&(typeof body.query!=='string'||body.query.trim().length<2||body.query.length>80||searchKey(body.query).length<2))return fail('invalid_query');
 if(action==='accountant_jc_detail'&&(!/^[A-Z0-9_-]{1,40}$/.test(key(body.job_card))||body.query!==undefined))return fail('invalid_job_card');
 let fp;
 if(action==='accountant_command'){
  if(!uuid(body.request_id)||!body.command||typeof body.command!=='object'||Array.isArray(body.command))return fail('invalid_financial_command');
  fp=await fingerprint(body,secret);
  const receipt=await admin.from('workshop_accountant_commands').select('actor_id,fingerprint,result').eq('request_id',body.request_id).maybeSingle();if(receipt.error)throw receipt.error;
  if(receipt.data)return receipt.data.actor_id===user.id&&receipt.data.fingerprint===fp?{status:200,body:receipt.data.result}:fail('request_conflict',409);
 }
 const loaded=await admin.rpc('zukait_accountant_context',{p_actor_id:user.id});if(loaded.error)throw loaded.error;
 const context=loaded.data,full=financialReport(context,{},now),report=Object.keys(filters).length&&body.report!=='manager_profit'?financialReport(context,filters,now):full;
 const omanCurrentMonth=day(now).slice(0,7);
 const currentCashInvoices=full.rows.invoices.filter(i=>key(i.job_type)==='CASH'&&String(i.date||'').startsWith(omanCurrentMonth));
 const monthlyCashInvoiceTotal=currentCashInvoices.reduce((n,i)=>n+(milli(i.invoice_amount_omr)||0),0)/1000;
 // A CASH Job Card invoice is not proof of physical cash received.
 const enrichedSummary={...report.summary,cash_invoice_current_month:{
  amount_omr:monthlyCashInvoiceTotal,records:currentCashInvoices.length,
  pending_records:0,month:omanCurrentMonth
 }};

 if(action==='accountant_report'&&['accounts_performance','accounts_leave'].includes(body.report)){
  const projection=body.report==='accounts_performance'?accountsPerformanceReport(context,full,filters,now):accountsLeaveReport(full,filters);
  const off=body.offset||0,limit=body.limit||100;
  return {status:200,body:{ok:true,...projection,rows:projection.rows.slice(off,off+limit),total_count:projection.rows.length,next_offset:off+limit<projection.rows.length?off+limit:null,as_of:full.as_of,snapshot_revision:full.snapshot_revision,finance_revision:full.finance_revision}};
 }
 if(body.report==='manager_profit'){
  const result=managerProfitReport(context,full,filters,now),offset=body.offset||0,limit=body.limit||100;
  return {status:200,body:{ok:true,...result,rows:result.rows.slice(offset,offset+limit),total_count:result.rows.length,next_offset:offset+limit<result.rows.length?offset+limit:null,as_of:full.as_of,snapshot_revision:full.snapshot_revision,finance_revision:full.finance_revision}};
 }
 if(action==='accountant_command'){
  const c=body.command,allowed=['operation','expected_snapshot_revision','expected_finance_revision','transaction_date','kind','job_card','payee','payment_method','amount','category','reference','remarks','entry_id','reason','old_value','new_value'];
  if(Object.keys(c).some(k=>!allowed.includes(k))||!['POST','CORRECT','REVERSE','ADJUST_COST','CORRECT_INVOICE'].includes(c.operation)||typeof c.reason!=='string'||c.reason.trim().length<3||c.reason.length>2000||!validDay(c.transaction_date)||c.transaction_date>day(now)||!Number.isInteger(c.expected_snapshot_revision)||!Number.isInteger(c.expected_finance_revision))return fail('invalid_financial_command');
  if(c.expected_snapshot_revision!==full.snapshot_revision||c.expected_finance_revision!==full.finance_revision)return fail('financial_conflict',409);
  if(c.job_card&&(!/^[A-Z0-9_-]{1,40}$/.test(c.job_card)||!full.details.some(d=>d.job_card===c.job_card)))return fail('job_not_found',404);
  if(['POST','CORRECT'].includes(c.operation)){
   if(!['CASH_IN','CASH_OUT'].includes(c.kind)||!['CASH','CARD','BANK','CHEQUE'].includes(c.payment_method)||milli(c.amount)===null||!/^(0|[1-9]\d*)(\.\d{1,3})?$/.test(String(c.amount))||Number(c.amount)<=0||Number(c.amount)>1000000||typeof c.payee!=='string'||!c.payee.trim()||c.payee.length>200||c.kind==='CASH_OUT'&&!c.category)return fail('invalid_cash_entry');
  }
  if(['CORRECT','REVERSE'].includes(c.operation)&&!uuid(c.entry_id))return fail('invalid_entry_id');
  if(['ADJUST_COST','CORRECT_INVOICE'].includes(c.operation)){
   const d=full.details.find(d=>d.job_card===key(c.job_card)),field=c.operation==='CORRECT_INVOICE'?'invoice_amount_omr':{consumables:'consumables_cost_omr',paint:'paint_cost_omr',parts:'parts_cost_omr',labour:'labour_cost_omr'}[c.category];
   if(!d||!field||d[field]===null||milli(c.old_value)!==milli(d[field])||milli(c.new_value)===null||Number(c.new_value)<0||Number(c.new_value)>1000000||!/^\d+(\.\d{1,3})?$/.test(String(c.new_value)))return fail('invalid_financial_correction');
  }
  const posted=await admin.rpc('zukait_accountant_post',{p_actor_id:user.id,p_request_id:body.request_id,p_fingerprint:fp,p_command:c});if(posted.error)throw posted.error;return {status:200,body:posted.data};
 }
 if(action==='accountant_jc_detail'){
  const d=full.details.find(d=>d.job_card===key(body.job_card));
  if(!d)return fail('job_not_found',404);
  const sublets=(Array.isArray(context.state?.sublets)?context.state.sublets:[])
   .filter(v=>v&&!v.voided&&!v.cancelled&&key(v.jobCard)===d.job_card)
   .map(v=>({id:v.id||'',job_card:d.job_card,date:day(v.createdAt||v.date)||'',supplier:String(v.supplier||v.vendor||v.payee||''),description:String(v.description||v.workDescription||''),cost_omr:Number.isSafeInteger(v.amountMills)&&v.amountMills>=0?v.amountMills/1000:null}));
  const p=managerProfitReport(context,full,{all_months:true,include_credit:true,delivered_insurance_only:true,job_card:d.job_card},now).rows.find(r=>r.job_card===d.job_card);
  const subletPending=sublets.some(r=>r.cost_omr===null),subletCost=subletPending?null:sublets.reduce((n,r)=>n+r.cost_omr,0);
  const total=p?.total_cost_omr??(subletCost!==null&&milli(d.total_cost_omr)!==null?(milli(d.total_cost_omr)+milli(subletCost))/1000:null);
  const amount=p?.amount_omr??(d.job_type==='INSURANCE'?full.rows.lpo.find(x=>x.job_card===d.job_card&&x.lpo_status==='Received')?.lpo_amount_omr:d.invoice_amount_omr);
  const profit=total!==null&&milli(amount)!==null?(milli(amount)-milli(total))/1000:null;
  const detail={...d,sublet_cost_omr:p?.sublet_cost_omr??subletCost,job_total_cost_omr:total,job_invoice_amount_omr:amount??null,job_profit_omr:profit,job_profit_percentage:profit===null||!milli(amount)?null:profit/Number(amount)*100};
  const breakdown=Object.fromEntries(['consumables','paint','parts','labour'].map(k=>[k,full.rows[k].filter(r=>r.job_card===d.job_card)]));
  breakdown.sublet=sublets;
  return {status:200,body:{ok:true,detail,breakdown,snapshot_revision:full.snapshot_revision,finance_revision:full.finance_revision}};
 }
 let rows;
 if(action==='accountant_jc_search'){const q=searchKey(body.query);rows=full.details.filter(d=>[d.job_card,d.registration,d.vehicle,d.customer].some(v=>searchKey(v).includes(q))).map(d=>({job_card:d.job_card,registration:d.registration,vehicle:d.vehicle,customer:d.customer,job_type:d.job_type}));}
 else if(body.report==='cash_invoices'){
  // An invoice register is different from a receipt ledger. Include every
  // CASH-type Job Card with a verified final invoice, even when deposits
  // cover it and no synthetic cash-invoice receipt was generated.
  const byJob=new Map(full.details.map(d=>[d.job_card,d]));
  const selection=filters.month||(filters.from||filters.to?'':day(now).slice(0,7));
  const today=day(now);
  const rowsAll=full.rows.invoices.filter(i=>{
   if(key(i.job_type)!=='CASH'||!i.date||i.date>today)return false;
   if(selection&&!i.date.startsWith(selection))return false;
   if((filters.from&&i.date<filters.from)||(filters.to&&i.date>filters.to))return false;
   const d=byJob.get(i.job_card)||{};
   if(filters.job_card&&key(i.job_card)!==key(filters.job_card))return false;
   if(filters.query&&![i.job_card,i.customer,d.registration,d.vehicle].some(v=>searchKey(v).includes(searchKey(filters.query))))return false;
   return true;
  }).map(i=>{
   const d=byJob.get(i.job_card)||{};
   return {job_card:i.job_card,date:i.date,invoice_date:i.date,registration:d.registration||'',
    vehicle:d.vehicle||'',customer:i.customer||d.customer||'',
    invoice_amount_omr:i.invoice_amount_omr,source:'Final Cash invoice'};
  }).sort((a,b)=>b.date.localeCompare(a.date)||b.job_card.localeCompare(a.job_card,undefined,{numeric:true}));
  const totalMilli=rowsAll.reduce((n,r)=>n+(milli(r.invoice_amount_omr)||0),0);
  const offset=body.offset||0,limit=body.limit||100;
  return {status:200,body:{ok:true,rows:rowsAll.slice(offset,offset+limit),
   total_count:rowsAll.length,next_offset:offset+limit<rowsAll.length?offset+limit:null,
   invoice_total_omr:totalMilli/1000,invoice_count:rowsAll.length,
   period_month:selection,summary:enrichedSummary,as_of:full.as_of,
   notes:['Only final invoices entered for CASH-type Job Cards are included.','Invoice totals are not proof of physical cash, bank or cheque receipt.'],
   snapshot_revision:full.snapshot_revision,finance_revision:full.finance_revision}};
 }
 else if(body.report==='monthly'){
  const base=filters.month||day(now).slice(0,7),date=new Date(base+'-01T08:00:00Z');rows=[];
  for(let i=0;i<12;i++){const month=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-i,1)).toISOString().slice(0,7),r=financialReport(context,{...filters,month},now);if((filters.from&&month<filters.from.slice(0,7))||(filters.to&&month>filters.to.slice(0,7)))continue;rows.push({month,...Object.fromEntries(Object.entries(r.summary).filter(([,v])=>v&&typeof v==='object'&&'amount_omr' in v).map(([k,v])=>[k+'_omr',v.pending_records?null:v.amount_omr])),pending_cost_records:r.summary.total_job_cost.pending_records,lpo_pending_records:r.summary.lpo_pending_records,leave_days:r.summary.leave_total_days});}
 }else rows=report.rows[body.report||'jobs']||[];
 const offset=body.offset||0,limit=body.limit||100;
 return {status:200,body:{ok:true,rows:rows.slice(offset,offset+limit),total_count:rows.length,next_offset:offset+limit<rows.length?offset+limit:null,summary:enrichedSummary,as_of:report.as_of,notes:report.notes,snapshot_revision:report.snapshot_revision,finance_revision:report.finance_revision}};
}
export function accountantError(error){const msg=String(error?.message||error);const known=['accountant_forbidden','manager_required','request_conflict','financial_conflict','entry_not_correctable','duplicate_payment_reference','invalid_cash_entry','invalid_transaction_date','job_not_found','verified_invoice_required','cash_direction_change_forbidden','invalid_cost_adjustment','invalid_invoice_amount','expense_category_required'];const code=known.find(c=>msg.includes(c))||'accountant_unavailable';return {status:['accountant_forbidden','manager_required'].includes(code)?403:['request_conflict','financial_conflict','entry_not_correctable','duplicate_payment_reference'].includes(code)?409:code==='accountant_unavailable'?503:400,body:{ok:false,code}};}
