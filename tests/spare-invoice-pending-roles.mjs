import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src=fs.readFileSync('app/src/main/assets/v2/features/spare-parts/main_module.js','utf8');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const begin=src.indexOf('function invoiceAmountEligible('),end=src.indexOf('async function invoiceEntryClick(',begin);
assert.ok(begin>=0&&end>begin);
const block=src.slice(begin,end);
const startClick=src.indexOf('async function invoiceEntryClick('),endClick=src.indexOf('\n',startClick);
const rows=[{listNo:'PL001',jobCard:'JC001',items:[{id:'pending',name:'Front bumper',qty:2,status:'SUPERVISOR_VERIFIED',purchaseAmount:0},{id:'paid',name:'Paid part',qty:1,status:'SUPERVISOR_VERIFIED',purchaseAmount:25},{id:'unconfirmed',name:'Not arrived',qty:1,status:'ORDERED'}]}];
let activeRole='Purchaser',markup='',writes=0,reads=0;
const ctx={role:()=>activeRole,read:()=>rows,arrivedConfirmed:i=>i.status==='SUPERVISOR_VERIFIED',esc:v=>String(v??''),ensureSpareStatusFullPageStyle(){},document:{getElementById:id=>id==='v2SpInvoiceEntryStyle'?{}:{value:'12'}},hydrateAuthoritativeLists:async()=>{reads++},invoiceEntryVehicleIdentity:()=>({vehicle:'Toyota',registration:'123-A',year:'2020'}),openSpareModal:s=>{markup=s},withNav:s=>s,markSparePartsModal(){},spareBtn:()=>'',alert:()=>{throw Error('unexpected alert')},saveSupervisorInvoicePrice:async()=>{writes++;return {ok:false}}};
vm.runInNewContext(block+'\n'+src.slice(startClick,endClick)+'\nthis.openInvoiceEntry=openInvoiceEntry;this.openInvoiceEntryList=openInvoiceEntryList;this.invoiceEntryClick=invoiceEntryClick;',ctx);
for(const r of ['Purchaser','Supervisor','Manager','Employee','Accountant']){
 activeRole=r;markup='';const before=reads,allowed=['Purchaser','Supervisor','Manager'].includes(r),edit=['Supervisor','Manager'].includes(r);
 await ctx.openInvoiceEntry();assert.equal(reads,before+(allowed?1:0));if(allowed){assert.match(markup,/Invoice Pending/);assert.match(markup,/1 pending/)}
 markup='';await ctx.openInvoiceEntryList('PL001');assert.equal(Boolean(markup),allowed);
 if(allowed){assert.match(markup,/Front bumper/);assert.doesNotMatch(markup,/Paid part|Not arrived/);assert.equal(markup.includes('v2SpInvoicePrice_0'),edit);assert.equal(markup.includes('✓ Save'),edit);if(!edit)assert.match(markup,/READ ONLY/)}
 const prior=writes;await ctx.invoiceEntryClick({dataset:{list:'PL001',item:'pending',input:'price'}});assert.equal(writes,prior+(edit?1:0));
}
assert.equal((src.match(/'Invoice Pending',invoiceMissingItems\(rows\)\.length/g)||[]).length,3,'all three cards share pending count');
assert.match(api,/eventType==="SPARE_PART_FINAL_PRICE_RECORDED"[\s\S]{0,750}!\["Manager","Supervisor"\]\.includes\(callerRole\)/);
assert.match(src,/async function saveSupervisorInvoicePrice\([^\n]*\{if\(!\['Supervisor','Manager'\]\.includes\(role\(\)\)\)return/);
console.log('PASS: shared pending queue, Purchaser read only, Supervisor/Manager editable, other roles denied, server final price gate retained');
