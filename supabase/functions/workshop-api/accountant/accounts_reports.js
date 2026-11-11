import {day,key,milli,searchKey} from './finance_rules.js';
import {managerProfitReport} from './profit_performance.js';
const array=v=>Array.isArray(v)?v:[];
const money=v=>v===null?null:v/1000;
const numeric=v=>milli(v);
const matches=(value,query)=>!query||searchKey(value).includes(searchKey(query));
const names=rows=>[...new Set(rows.filter(Boolean).map(s=>String(s).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));

/**
 * Accounts financial reports share the Manager's per-Job-Card profit calculation.
 * These read-only cohorts never create receipts, modify invoices or alter the Manager screen.
 */
export function accountsPerformanceReport(context,financial,filters={},now=Date.now()){
 const all=managerProfitReport(context,financial,{
  all_months:true,include_credit:true,delivered_insurance_only:true,
  from:filters.from||'',to:filters.to||''
 },now).rows;
 const month=filters.from||filters.to?'':filters.month||day(now).slice(0,7);
 const period=all.filter(r=>(!month||r.date.startsWith(month))&&
  (!filters.from||r.date>=filters.from)&&(!filters.to||r.date<=filters.to));
 const facets={
  insurance:names(period.filter(r=>r.kind==='INSURANCE').map(r=>r.insurance_company)),
  credit:names(period.filter(r=>r.kind==='CREDIT').map(r=>r.company_name||r.customer)),
  corporate:names(period.filter(r=>r.kind==='CORPORATE').map(r=>r.company_name||r.customer))
 };
 const selected=period.filter(r=>(!filters.kind||filters.kind==='ALL'||r.kind===filters.kind)&&
  (!filters.insurance||r.kind==='INSURANCE'&&key(r.insurance_company)===key(filters.insurance))&&
  (!filters.customer||['CREDIT','CORPORATE'].includes(r.kind)&&key(r.company_name||r.customer)===key(filters.customer))&&
  matches([r.job_card,r.registration,r.vehicle,r.customer,r.company_name].join(' '),filters.query));
 const rows=selected.map((r,index)=>{
  const c=r.cost_breakdown_omr||{};
  return {...r,serial:index+1,job_type:r.kind,
   labour_cost_omr:c.labour??null,
   paint_cost_omr:c.paint??null,
   consumables_cost_omr:c.consumables??null,
   parts_cost_omr:c.parts??null,
   sublet_cost_omr:r.sublet_cost_omr??null,
   total_job_cost_omr:r.total_cost_omr??null,
   invoice_amount_omr:r.amount_omr,
   net_profit_omr:r.profit_omr,
   percentage:r.profit_percentage==null?null:Math.round(r.profit_percentage*100)/100
  };
 });
 const total=field=>rows.reduce((sum,r)=>sum+(numeric(r[field])||0),0);
 const pending=rows.filter(r=>!r.costs_complete||numeric(r.total_job_cost_omr)===null).length;
 const revenue=total('invoice_amount_omr');
 const cost=pending?null:total('total_job_cost_omr');
 const profit=cost===null?null:revenue-cost;
 return {
  rows,facets,period_month:month,
  summary:{records:rows.length,revenue_omr:money(revenue),total_cost_omr:money(cost),
   profit_omr:money(profit),profit_percentage:profit===null||revenue===0?null:profit/revenue*100,
   pending_cost_records:pending},
  notes:['Invoice and LPO amounts are not additional receipt entries.','Profit excludes overheads and unmodeled tax adjustments.','Pending expenses cannot be treated as zero.']
 };
}

/** Read-only view of the same leave history stored in workshop state for the Manager. */
export function accountsLeaveReport(financial,filters={}){
 const allRows=array(financial.rows.leave);
 const employees=[...new Map(allRows.filter(r=>r.employee_id).map(r=>[r.employee_id,{id:r.employee_id,name:r.employee||r.employee_id}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
 const rows=allRows.filter(r=>
  (!filters.month||String(r.date).startsWith(filters.month))&&
  (!filters.from||r.date>=filters.from)&&(!filters.to||r.date<=filters.to)&&
  (!filters.employee||r.employee_id===filters.employee)&&
  (!filters.status||filters.status==='active'?!r.cancelled:
   filters.status==='cancelled'?r.cancelled:true)&&
  (!filters.query||matches([r.employee,r.employee_id,r.date,r.period_label,r.remark].join(' '),filters.query))
 ).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(a.employee).localeCompare(String(b.employee)));
 return {rows,facets:{employees},summary:{records:rows.length,people:new Set(rows.map(r=>r.employee_id)).size,
   leave_total_days:rows.reduce((n,r)=>n+(Number(r.days)||0),0)},
   notes:['Leave Management is read-only in Accounts. Cancelled records remain in the history.']};
}
