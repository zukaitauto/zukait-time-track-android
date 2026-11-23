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
 // Partial values are lower bounds on expense, NOT final costs. Never invent
 // an unpriced item's price or use a supplier quotation as a purchase price.
 const partial=!complete&&priced>0&&Number.isSafeInteger(calculated)&&calculated>=0;
 const amount=complete?(!provisional&&recorded!==null&&recorded===calculated?recorded:calculated):partial?calculated:null;
 return {
  cost_omr:amount===null?null:amount/1000,
  provisional:(complete&&provisional)||partial,
  pending:!complete,
  partial,
  source:partial?'Partial Parts List cost — missing item prices excluded':complete?(provisional?'Parts List recorded purchase price (includes unreceived items)':'Parts List purchase cost'):'Parts List price missing',
  items:seen.size||items.length,priced_items:priced
 };
}

/**
 * Use finalized Actual consumable/material source lines only. Each priced
 * item contributes once; missing prices remain flagged (not priced as zero).
 * The recorded aggregate is retained when all source lines are priced,
 * preserving authorized adjustments and original rounding.
 */
export function availableConsumablesCost(materialRows,recordedCost=null){
 const items=rows(materialRows).filter(Boolean);
 if(!items.length)return {cost_omr:recordedCost??null,pending:recordedCost==null,partial:false,items:0,priced_items:0};
 let known=0,priced=0,missing=false,seen=new Set();
 for(const item of items){
  const id=String(item.id||'');
  if(id&&seen.has(id))continue;
  if(id)seen.add(id);
  let cost=milli(item.cost_omr);
  if(cost===null){
   const price=milli(item.unit_price_omr),quantity=Number(item.quantity);
   if(price!==null&&price>=0&&item.quantity!=null&&Number.isFinite(quantity)&&quantity>=0)cost=Math.round(price*quantity);
  }
  if(cost===null||!Number.isSafeInteger(cost)){missing=true;continue;}
  known+=cost;priced++;
 }
 const recorded=milli(recordedCost),partial=missing&&priced>0;
 const amount=partial?known:missing?null:recorded!==null?recorded:known;
 return {cost_omr:amount===null?null:amount/1000,pending:missing,partial,items:items.length,priced_items:priced};
}
