import {key,milli} from './finance_rules.js';
const rows=v=>Array.isArray(v)?v:[];

/**
 * Read-only costing of the final per-item Parts List purchase price.
 * "purchase_amount_omr" is an item quantity x recorded purchase unit price,
 * not a quotation, supplier offer or an additional cash payment.
 * An unreceived item with a known recorded price is a PROVISIONAL job cost.
 * Unpriced outstanding items remain unknown: never interpret them as zero.
 */
export function availablePartsListCost(partRows,recordedPartsCost=null,adjustments=[]){
 const items=rows(partRows).filter(Boolean),recorded=milli(recordedPartsCost);
 if(!items.length)return {cost_omr:recordedPartsCost??null,provisional:false,pending:false,source:'No Parts List lines',items:0,priced_items:0};
 let sum=0,provisional=false,missing=false,priced=0;
 const seen=new Set();
 for(const item of items){
  const lineId=String(item.list_no||'')+':'+String(item.id||'');
  if(item.id&&seen.has(lineId))continue;
  if(item.id)seen.add(lineId);
  const status=key(item.status);
  if(status==='RETURNED')continue; // no retained purchased part on this JC
  const listed=milli(item.purchase_amount_omr);
  const confirmed=milli(item.net_cost_omr);
  const missingQty=Number(item.pending_quantity);
  const unreceived=Number.isFinite(missingQty)&&missingQty>0;
  // The Parts List records one purchased unit price multiplied by the full
  // ordered quantity. Do NOT add received and full listed totals together.
  if(listed!==null&&listed>=0){
   sum+=listed;priced++;if(unreceived)provisional=true;
  }else if(confirmed!==null&&confirmed>=0&&!unreceived){
   sum+=confirmed;priced++;
  }else missing=true;
 }
 const adjustmentsMilli=rows(adjustments).filter(e=>e&&e.kind==='COST_ADJUSTMENT'&&key(e.category)==='PARTS')
  .reduce((total,e)=>{
   const before=milli(e.old_value),after=milli(e.new_value);
   return total+(before!==null&&after!==null?after-before:0);
  },0);
 const calculated=sum+adjustmentsMilli;
 if(!Number.isSafeInteger(calculated)||calculated<0)missing=true;
 // Existing completed job costs include authorized financial adjustments.
 // Prefer exact verified values when the Parts List has no open receipts.
 const complete=!missing;
 const amount=complete?(!provisional&&recorded!==null&&recorded===calculated?recorded:calculated):null;
 return {
  cost_omr:amount===null?null:amount/1000,
  provisional:complete&&provisional,
  pending:!complete,
  source:complete?(provisional?'Parts List recorded purchase price (includes unreceived items)':'Parts List purchase cost'):'Parts List price missing',
  items:seen.size||items.length,priced_items:priced
 };
}
