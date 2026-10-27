import {key,milli,day,validDay,searchKey} from './finance_rules.js';
const array=v=>Array.isArray(v)?v:[],money=n=>n===null?null:(n/1000).toFixed(3);
// Read-only invoice/LPO cohorts. Reuse verified financial costs, never ledger
// receipts as revenue here: the owner counts each final Cash invoice once.
export function managerProfitReport(context,financial,filters={},now=Date.now()){
 const month=filters.month||day(now).slice(0,7),today=day(now),s=context.state||{};
 const jobs=new Map(array(s.jobs).filter(j=>j&&!j.deleted&&!j.cancelled&&key(j.status)!=='CANCELLED').map(j=>[key(j.no),j]));
 const lpos=new Map(array(financial.rows?.lpo).filter(l=>l.lpo_status==='Received').map(l=>[key(l.job_card),l]));
 const rows=[],seen=new Set();let undated=0;
 for(const detail of financial.details||[]){
  const no=key(detail.job_card),j=jobs.get(no),kind=detail.job_type;if(!j||seen.has(no)||!['CASH','INSURANCE'].includes(kind))continue;seen.add(no);
  const lpo=lpos.get(no),date=kind==='CASH'?detail.invoice_date:lpo?.lpo_received_date;
  const amount=milli(kind==='CASH'?j.finalInvoiceAmount:lpo?.lpo_amount_omr);
  if(amount===null||amount<0)continue;
  if(!validDay(date)){undated++;continue;}
  if(!date.startsWith(month)||date>today||filters.from&&date<filters.from||filters.to&&date>filters.to)continue;
  const company=String(detail.insurance_company||'').trim();
  if(filters.insurance&&!key(company).includes(key(filters.insurance)))continue;
  if(filters.job_card&&no!==key(filters.job_card))continue;
  const baseVehicle=String(detail.vehicle||j.vehicle||[j.make,j.model].filter(Boolean).join(' ')).trim(),year=String(j.year||j.modelYear||j.vehicleYear||'').trim();
  const vehicle=year&&!baseVehicle.split(/\s+/).includes(year)?[baseVehicle,year].filter(Boolean).join(' '):baseVehicle;
  if(filters.query&&![no,vehicle,detail.registration,detail.customer].some(x=>searchKey(x).includes(searchKey(filters.query))))continue;
  let sublet=0,subletPending=false;const subletIds=new Map();
  for(const row of array(s.sublets).filter(x=>x&&!x.voided&&!x.cancelled&&key(x.jobCard)===no)){
   const id=String(row.id||'');if(!id){subletPending=true;continue;}
   if(subletIds.has(id)){if(subletIds.get(id)!==row.amountMills)subletPending=true;continue;}subletIds.set(id,row.amountMills);
   if(!Number.isSafeInteger(row.amountMills)||row.amountMills<0)subletPending=true;else sublet+=row.amountMills;
  }
  // An absent category is a verified zero only if the job has no source activity
  // for it. Unfinalized records must remain pending rather than silently zero.
  const sources={
   consumables:array(s.consumables?.actuals).filter(x=>x&&!x.voided&&key(x.jobCard)===no).concat(array(s.consumables?.issues).filter(x=>x&&!x.voided&&key(x.jobCard)===no)),
   paint:array(s.paintPurchasing?.orders).filter(x=>x&&!x.voided&&key(x.jobCard)===no),
   parts:array(financial.rows?.parts).filter(x=>key(x.job_card)===no)
  };
  const costFields={consumables:'consumables_cost_omr',paint:'paint_cost_omr',parts:'parts_cost_omr',labour:'labour_cost_omr'};
  const costs={},notes=[];
  for(const [category,field] of Object.entries(costFields)){
   const recorded=milli(detail[field]);
   const isAbsent=category!=='labour'&&sources[category].length===0;
   costs[category]=recorded===null&&isAbsent?0:recorded;
   if(costs[category]===null)notes.push(...array(detail.warnings).filter(w=>w===category+' cost pending'||w.toLowerCase().includes(category)));
   if(costs[category]===null&&!notes.includes(category+' cost pending'))notes.push(category+' cost pending');
  }
  // An unresolved parts receipt, running shift, or other explicit warning is
  // authoritative even if category totals are otherwise known.
  const incompleteParts=array(detail.warnings).some(w=>/spare parts receipts are incomplete/i.test(w));
  if(incompleteParts){costs.parts=null;notes.push('Spare parts receipts are incomplete');}
  const baseCost=Object.values(costs).some(v=>v===null)?null:Object.values(costs).reduce((a,b)=>a+b,0);
  const totalCost=baseCost===null||subletPending?null:baseCost+sublet;
  const profit=totalCost===null?null:amount-totalCost;
  rows.push({kind,job_card:no,date,vehicle,registration:detail.registration||'',insurance_company:company,amount_omr:money(amount),total_cost_omr:money(totalCost),sublet_cost_omr:subletPending?null:money(sublet),profit_omr:money(profit),profit_percentage:profit===null||amount===0?null:profit/amount*100,costs_complete:totalCost!==null,cost_breakdown_omr:Object.fromEntries(Object.entries(costs).map(([k,v])=>[k,money(v)])),cost_notes:[...new Set([...notes,...(subletPending?['Sublet cost pending']:[])])]});
 }
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.job_card.localeCompare(b.job_card,undefined,{numeric:true}));
 return {rows,month,undated_records:undated,basis:'Cash: final invoice date/amount counted once as received. Insurance: LPO document received date/amount, not insurer payment. Profit uses recorded job costs including sublet; overheads and tax adjustments are not included.'};
}
