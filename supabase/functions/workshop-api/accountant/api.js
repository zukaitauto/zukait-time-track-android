import {financialReport,validateFilters,validDay,key,milli,day,searchKey} from './finance_rules.js';
const actions=new Set(['accountant_dashboard','accountant_jc_search','accountant_jc_detail','accountant_report','accountant_command']);
const reportNames=new Set(['jobs','consumables','paint','parts','leave','cash','lpo','outstanding','monthly','audit','labour','invoices']);
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
 const context=loaded.data,full=financialReport(context,{},now),report=Object.keys(filters).length?financialReport(context,filters,now):full;
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
 if(action==='accountant_jc_detail'){const d=full.details.find(d=>d.job_card===key(body.job_card));return d?{status:200,body:{ok:true,detail:d,snapshot_revision:full.snapshot_revision,finance_revision:full.finance_revision}}:fail('job_not_found',404);}
 let rows;
 if(action==='accountant_jc_search'){const q=searchKey(body.query);rows=full.details.filter(d=>[d.job_card,d.registration,d.vehicle,d.customer].some(v=>searchKey(v).includes(q))).map(d=>({job_card:d.job_card,registration:d.registration,vehicle:d.vehicle,customer:d.customer,job_type:d.job_type}));}
 else if(body.report==='monthly'){
  const base=filters.month||day(now).slice(0,7),date=new Date(base+'-01T08:00:00Z');rows=[];
  for(let i=0;i<12;i++){const month=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-i,1)).toISOString().slice(0,7),r=financialReport(context,{...filters,month},now);if((filters.from&&month<filters.from.slice(0,7))||(filters.to&&month>filters.to.slice(0,7)))continue;rows.push({month,...Object.fromEntries(Object.entries(r.summary).filter(([,v])=>v&&typeof v==='object'&&'amount_omr' in v).map(([k,v])=>[k+'_omr',v.pending_records?null:v.amount_omr])),pending_cost_records:r.summary.total_job_cost.pending_records,lpo_pending_records:r.summary.lpo_pending_records,leave_days:r.summary.leave_total_days});}
 }else rows=report.rows[body.report||'jobs']||[];
 const offset=body.offset||0,limit=body.limit||100;
 return {status:200,body:{ok:true,rows:rows.slice(offset,offset+limit),total_count:rows.length,next_offset:offset+limit<rows.length?offset+limit:null,summary:report.summary,as_of:report.as_of,notes:report.notes,snapshot_revision:report.snapshot_revision,finance_revision:report.finance_revision}};
}
export function accountantError(error){const msg=String(error?.message||error);const known=['accountant_forbidden','manager_required','request_conflict','financial_conflict','entry_not_correctable','duplicate_payment_reference','invalid_cash_entry','invalid_transaction_date','job_not_found','verified_invoice_required','cash_direction_change_forbidden','invalid_cost_adjustment','invalid_invoice_amount','expense_category_required'];const code=known.find(c=>msg.includes(c))||'accountant_unavailable';return {status:['accountant_forbidden','manager_required'].includes(code)?403:['request_conflict','financial_conflict','entry_not_correctable','duplicate_payment_reference'].includes(code)?409:code==='accountant_unavailable'?503:400,body:{ok:false,code}};}
