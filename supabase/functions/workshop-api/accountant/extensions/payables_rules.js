// Inactive read-only domain candidate. Not imported by existing API or UI.
// Context is a bounded trusted projection, never a client financial command.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),id=x=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=128;
const exact=(x,keys)=>object(x)&&Object.keys(x).every(k=>keys.includes(k));
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const mills=x=>Number.isSafeInteger(x)&&x>=0;
const sourceTypes=new Set(['PAINT_ORDER','SPARE_PART_LINE','CONSUMABLE_PURCHASE','VENDOR_BILL']);
const sourceKey=x=>{if(!exact(x,['type','id'])||!sourceTypes.has(x.type)||!id(x.id))throw Error('invalid_supplier_source');return JSON.stringify([x.type,x.id])};
const sum=xs=>{const n=xs.reduce((a,x)=>a+BigInt(x),0n);if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER))throw Error('payable_amount_overflow');return Number(n)};
const unique=(rows,name)=>{const map=new Map();for(const row of rows){if(!object(row)||!id(row.id)||map.has(row.id))throw Error('duplicate_or_invalid_'+name);map.set(row.id,row)}return map};
export function parseOMRMills(value){if(typeof value!=='string'||value.length>32||!/^(0|[1-9]\d*)(\.\d{1,3})?$/.test(value))return null;const [a,b='']=value.split('.'),n=BigInt(a)*1000n+BigInt(b.padEnd(3,'0'));return n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):null}
export function formatOMRMills(value){if(!mills(value))throw Error('invalid_omr_mills');const n=BigInt(value);return String(n/1000n)+'.'+String(n%1000n).padStart(3,'0')}
function registry(context){
 const suppliers=unique(context.suppliers,'supplier'),mapping=new Map();for(const s of suppliers.values())if(!exact(s,['id','name','active'])||typeof s.name!=='string'||!s.name.trim()||s.name.length>200||typeof s.active!=='boolean')throw Error('invalid_supplier');
 for(const link of context.sourceLinks){if(!exact(link,['source','supplierId'])||!suppliers.has(link.supplierId))throw Error('invalid_supplier_link');const key=sourceKey(link.source);if(mapping.has(key))throw Error('duplicate_supplier_link');mapping.set(key,link.supplierId)}return {suppliers,mapping};
}
export function resolveSupplier(source,context){try{if(!Array.isArray(context?.suppliers)||context.suppliers.length>2000||!Array.isArray(context.sourceLinks)||context.sourceLinks.length>5000)throw Error('payable_context_limit');const r=registry(context),supplierId=r.mapping.get(sourceKey(source));return supplierId?{ok:true,supplierId,active:r.suppliers.get(supplierId).active}:{ok:false,code:'supplier_mapping_required'}}catch(e){return {ok:false,code:e.message}}}
export function recordedBillBalances(context,filters={},policy={}){
 try{
  if(policy.enabled!==true)return {ok:false,code:'payables_disabled'};
  if(!exact(filters,['asOf','supplierId'])||!day(filters.asOf)||(filters.supplierId!==undefined&&!id(filters.supplierId)))throw Error('invalid_payable_filters');
  if(!exact(context,['suppliers','sourceLinks','bills','credits','settlementLinks','entries']))throw Error('invalid_payable_context');
  for(const [key,max]of [['suppliers',2000],['sourceLinks',5000],['bills',2000],['credits',2000],['settlementLinks',5000],['entries',10000]])if(!Array.isArray(context[key])||context[key].length>max)throw Error('payable_context_limit');
  const {suppliers,mapping}=registry(context),bills=unique(context.bills,'bill'),credits=unique(context.credits,'credit'),entries=unique(context.entries,'journal_entry');unique(context.settlementLinks,'settlement_link');
  if(filters.supplierId&&!suppliers.has(filters.supplierId))throw Error('supplier_not_found');
  const invoiceKeys=new Set(),sources=new Set(),selected=new Map(),paymentUsed=new Map(),perBillCredits=new Map(),perBillPayments=new Map(),supplierCredits=new Map(),supplierPayments=new Map();
  for(const b of bills.values()){
   if(!exact(b,['id','supplierId','invoiceReference','transactionDate','dueDate','amountMills','status','sourceRefs'])||!suppliers.has(b.supplierId)||typeof b.invoiceReference!=='string'||!b.invoiceReference.trim()||b.invoiceReference.length>200||!day(b.transactionDate)||(b.dueDate!==null&&!day(b.dueDate))||(b.amountMills!==null&&!mills(b.amountMills))||!['DRAFT','APPROVED'].includes(b.status)||!Array.isArray(b.sourceRefs)||b.sourceRefs.length>100)throw Error('invalid_supplier_bill');
   // Deliberately retain punctuation: fuzzy name/invoice matching may merge debts.
   const invoiceKey=JSON.stringify([b.supplierId,b.invoiceReference.trim().toUpperCase()]);if(invoiceKeys.has(invoiceKey))throw Error('duplicate_supplier_invoice');invoiceKeys.add(invoiceKey);
   for(const ref of b.sourceRefs){const k=sourceKey(ref);if(mapping.get(k)!==b.supplierId)throw Error('bill_supplier_source_mismatch');if(sources.has(k))throw Error('duplicate_bill_source');sources.add(k)}
   if(b.status==='APPROVED'&&b.transactionDate<=filters.asOf)selected.set(b.id,b);
  }
  for(const c of credits.values()){
   if(!exact(c,['id','supplierId','transactionDate','amountMills','status','allocations'])||!suppliers.has(c.supplierId)||!day(c.transactionDate)||!mills(c.amountMills)||c.amountMills===0||!['DRAFT','APPROVED'].includes(c.status)||!Array.isArray(c.allocations)||c.allocations.length>100)throw Error('invalid_supplier_credit');
   const allocated=new Set();let used=0;for(const a of c.allocations){const b=bills.get(a.billId);if(!exact(a,['billId','amountMills','effectiveDate'])||!b||b.supplierId!==c.supplierId||!mills(a.amountMills)||a.amountMills===0||!day(a.effectiveDate)||a.effectiveDate<c.transactionDate||a.effectiveDate<b.transactionDate||allocated.has(a.billId))throw Error('invalid_credit_allocation');allocated.add(a.billId);used=sum([used,a.amountMills]);if(c.status==='APPROVED'&&a.effectiveDate<=filters.asOf){if(!selected.has(b.id)||b.amountMills===null)throw Error('credit_bill_not_approved');perBillCredits.set(b.id,sum([perBillCredits.get(b.id)||0,a.amountMills]))}}
   if(used>c.amountMills)throw Error('credit_overallocated');if(c.status==='APPROVED'&&c.transactionDate<=filters.asOf)supplierCredits.set(c.supplierId,sum([supplierCredits.get(c.supplierId)||0,c.amountMills]));
  }
  // Existing journal is authoritative. Reverse only on the reversal's Oman date.
  const reversed=new Set(),reversalTargets=new Set();for(const e of entries.values()){if(!day(e.transaction_date))throw Error('invalid_journal_date');if(e.kind==='REVERSAL'){const original=entries.get(e.reverses_id);if(!original||!['CASH_IN','CASH_OUT'].includes(original.kind)||e.transaction_date<original.transaction_date||reversalTargets.has(e.reverses_id))throw Error('invalid_journal_reversal');reversalTargets.add(e.reverses_id);if(e.transaction_date<=filters.asOf)reversed.add(e.reverses_id)}}
  const supplierForEntry=new Map();for(const l of context.settlementLinks){
   const e=entries.get(l.entryId),b=l.billId===null?null:bills.get(l.billId);if(!exact(l,['id','supplierId','entryId','billId','amountMills','effectiveDate'])||!suppliers.has(l.supplierId)||!e||e.kind!=='CASH_OUT'||!mills(l.amountMills)||l.amountMills===0||!day(l.effectiveDate)||l.effectiveDate<e.transaction_date||(l.billId!==null&&(!b||b.supplierId!==l.supplierId||l.effectiveDate<b.transactionDate)))throw Error('invalid_settlement_link');
   if(supplierForEntry.has(e.id)&&supplierForEntry.get(e.id)!==l.supplierId)throw Error('settlement_supplier_mismatch');supplierForEntry.set(e.id,l.supplierId);
   const amount=parseOMRMills(typeof e.amount==='number'?String(e.amount):e.amount);if(amount===null||amount===0)throw Error('invalid_settlement_amount');paymentUsed.set(e.id,sum([paymentUsed.get(e.id)||0,l.amountMills]));if(paymentUsed.get(e.id)>amount)throw Error('settlement_overallocated');
   if(e.transaction_date>filters.asOf||l.effectiveDate>filters.asOf||reversed.has(e.id))continue;
   if(b){if(!selected.has(b.id)||b.amountMills===null)throw Error('settlement_bill_not_approved');perBillPayments.set(b.id,sum([perBillPayments.get(b.id)||0,l.amountMills]))}supplierPayments.set(l.supplierId,sum([supplierPayments.get(l.supplierId)||0,l.amountMills]));
  }
  const rows=[];for(const b of selected.values()){const credit=perBillCredits.get(b.id)||0,paid=perBillPayments.get(b.id)||0;if(b.amountMills!==null&&sum([credit,paid])>b.amountMills)throw Error('bill_overallocated');if(filters.supplierId&&b.supplierId!==filters.supplierId)continue;const remaining=b.amountMills===null?null:b.amountMills-credit-paid;rows.push({id:b.id,supplierId:b.supplierId,supplier:suppliers.get(b.supplierId).name,invoiceReference:b.invoiceReference,transactionDate:b.transactionDate,dueDate:b.dueDate,amountMills:b.amountMills,creditMills:credit,settledMills:paid,remainingMills:remaining,overdue:b.dueDate===null?null:b.dueDate<filters.asOf&&remaining!==null&&remaining>0})}
  rows.sort((a,b)=>a.transactionDate.localeCompare(b.transactionDate)||a.id.localeCompare(b.id));const supplierRows=[];
  for(const s of suppliers.values()){if(filters.supplierId&&s.id!==filters.supplierId)continue;const xs=rows.filter(b=>b.supplierId===s.id),credited=supplierCredits.get(s.id)||0,paid=supplierPayments.get(s.id)||0,known=sum(xs.filter(b=>b.amountMills!==null).map(b=>b.amountMills)),pending=xs.some(b=>b.amountMills===null),allocatedCredit=sum(xs.map(b=>b.creditMills)),allocatedPayment=sum(xs.map(b=>b.settledMills));supplierRows.push({supplierId:s.id,name:s.name,active:s.active,billCount:xs.length,knownApprovedBillMills:known,approvedCreditMills:credited,linkedSettlementMills:paid,unappliedCreditMills:credited-allocatedCredit,unappliedSettlementMills:paid-allocatedPayment,recordedNetMills:pending?null:sum([known,-credited,-paid]),totalOutstandingMills:null,openingBalanceStatus:'NOT_INCLUDED',pendingBillAmounts:pending})}
  return {ok:true,schema:'zukait-recorded-bill-balances-v1',filters:{asOf:filters.asOf,supplierId:filters.supplierId||null},rows,suppliers:supplierRows,scope:'APPROVED_RECORDED_BILLS_ONLY',expenseEffect:'NONE_READ_ONLY',notes:['Opening balances and unmatched historical purchases/payments are not included. Total supplier outstanding remains Pending.','Purchase costs and physical returns do not automatically create bills or credits.','Supplier links and settlement allocations require explicit reviewed identity; no display-name matching.','This is transaction-date as-of reporting, not a reconstruction of what was known at that historical time.']};
 }catch(e){return {ok:false,code:e.message}}
}
