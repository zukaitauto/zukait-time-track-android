// Inactive candidate. No tokens or raw material/customer records are persisted.
// Caller supplies the existing verified Accountant session and transport.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).every(k=>keys.includes(k));
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const text=(x,min,max)=>typeof x==='string'&&x===x.trim()&&x.length>=min&&x.length<=max&&!/[\x00-\x1f\x7f]/.test(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&x>='1900-01-01'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
export function validBillCommand(c){
 if(!exact(c,['requestId','entityId','supplierId','deviceId','reason','expectedSupplierRevision','expectedPayableRevision','expectedWorkshopRevision','invoiceReference','invoiceDate','transactionDate','dueDate','invoiceTotalMills','expectedMaterialMills','sources','invoiceReviewed']))return false;
 return ['requestId','entityId','supplierId'].every(k=>uuid(c[k]))&&text(c.deviceId,1,128)&&text(c.reason,3,1000)&&text(c.invoiceReference,1,200)
  &&['expectedSupplierRevision','expectedPayableRevision','expectedWorkshopRevision'].every(k=>integer(c[k]))
  &&integer(c.invoiceTotalMills)&&integer(c.expectedMaterialMills)&&c.expectedMaterialMills>0&&c.invoiceTotalMills>=c.expectedMaterialMills
  &&date(c.invoiceDate)&&date(c.transactionDate)&&c.invoiceDate<=c.transactionDate&&(c.dueDate==null||date(c.dueDate))&&c.invoiceReviewed===true
  &&Array.isArray(c.sources)&&c.sources.length>0&&c.sources.length<=20
  &&c.sources.every(s=>exact(s,['type','id','expectedReceiptDigest'])&&['PAINT_ORDER','SPARE_PART_LINE'].includes(s.type)&&text(s.id,1,200)&&/^[a-f0-9]{32}$/.test(s.expectedReceiptDigest||''))&&new Set(c.sources.map(s=>s.type+':'+s.id)).size===c.sources.length;
}
export function billIntents({storage,project,session,online,send,locks=globalThis.navigator?.locks}) {
 const identity=()=>{const s=session();if(!s||!s.verified||!['Accountant','Manager'].includes(s.role)||!s.id||!s.sessionId)throw Error('bill_session_required');return s;};
 const key=s=>'zukait_bill_intent_v1:'+encodeURIComponent(project)+':'+encodeURIComponent(s.id);
 const read=s=>{const raw=storage.getItem(key(s));if(raw===null)return null;let p;try{p=JSON.parse(raw)}catch{throw Error('bill_pending_corrupt')}
  if(raw.length>20000||!exact(p,['version','actor','project','body'])||p.version!==1||p.actor!==s.id||p.project!==project||!exact(p.body,['action','command'])||p.body.action!=='accountant_bill_post'||!validBillCommand(p.body.command))throw Error('bill_pending_corrupt');return {raw,p};};
 let busy=false;
 async function submit(command,{retry=false}={}) {
  if(busy)throw Error('bill_busy');const s=identity();if(!online())throw Error('bill_online_required');busy=true;
  try {
   if(typeof locks?.request!=='function')throw Error('bill_lock_unavailable');
   return await locks.request(key(s),{mode:'exclusive',ifAvailable:true},async lock=>{
   if(!lock)throw Error('bill_busy');
   const checked=identity();if(checked.id!==s.id||checked.role!==s.role||checked.sessionId!==s.sessionId)throw Error('bill_account_changed');
   let pending=read(s);
   if(retry){if(!pending)throw Error('bill_no_pending');}
   else {
    if(pending)throw Error('bill_pending_exists');
    // Serialize before the first await; callers cannot mutate a stored request.
    const raw=JSON.stringify({version:1,actor:s.id,project,body:{action:'accountant_bill_post',command}});
    const parsed=JSON.parse(raw);if(raw.length>20000||!validBillCommand(parsed.body.command))throw Error('bill_invalid_intent');
    storage.setItem(key(s),raw);if(storage.getItem(key(s))!==raw)throw Error('bill_storage_unavailable');pending={raw,p:parsed};
   }
   const sameSession=()=>{const now=identity();if(now.id!==s.id||now.role!==s.role||now.sessionId!==s.sessionId)throw Error('bill_account_changed');};
   sameSession();if(!online())throw Error('bill_online_required');
   const response=await send(JSON.parse(pending.raw).body);
   sameSession();
   // Never clear on timeout, rejection, or an ambiguous/non-success response.
   if(response?.ok!==true)throw Error(response?.code||'bill_confirmation_unknown');
   if(storage.getItem(key(s))!==pending.raw)throw Error('bill_pending_changed');
   storage.removeItem(key(s));return response;
   });
  } finally {busy=false;}
 }
 return {submit,retry:()=>submit(null,{retry:true}),pending:()=>read(identity())?.p.body??null};
}
