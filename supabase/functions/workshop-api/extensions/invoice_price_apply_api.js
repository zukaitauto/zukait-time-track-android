import C from './invoice_price_core.js';

// Server-only candidate. Browser supplies reviewed rows, never workshop state.
// A separate feature flag defaults off in the entrypoint.
const bad=(code,status=409)=>({body:{ok:false,code},status});
const good=receipt=>({body:receipt,status:200});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const allowed=new Set(['MANAGER_ONLY','REQUEST_ID_CONFLICT','INVOICE_NOT_FOUND','INVOICE_CANCELLED','INVOICE_REVISION_CONFLICT','INVOICE_PRICE_RECONCILIATION_REQUIRED','WORKSHOP_PRICE_COMMIT_FAILED','INVALID_PRICE_APPLICATION','STALE_PRICE_REVIEW','PRICE_REVIEW_BLOCKED','INVOICE_PRICE_SOURCE_CONFLICT','NO_PRICE_CHANGES','POSTED_INVOICE_REQUIRED','INVALID_INVOICE_DATE','INVALID_INVOICE_PRICE','INVOICE_PRICE_ALREADY_APPLIED_RECONCILIATION_REQUIRED']);
export async function invoicePriceApplyApi(admin,user,body,{enabled=false,sessionHash='',computeLiveStatus}={}){
 if(!enabled)return bad('invoice_price_apply_not_enabled',423);
 if(!['Manager','Accountant'].includes(user?.role)||!user.id)return bad('manager_only',403);
 if(!sessionHash)return bad('stock_session_required',401);
 const d=body?.data;
 // Read-only review from authoritative posted invoice and current master.
 if(body?.operation==='REVIEW'){
  if(!d||Object.keys(d).some(k=>!['invoiceId','invoiceRevision'].includes(k))||!uuid.test(d.invoiceId||'')||!Number.isInteger(d.invoiceRevision)||d.invoiceRevision<1)return bad('invalid_price_application',400);
  try{
   const inv=await admin.from('zukait_purchase_invoices').select('id,revision,status,invoice_date,lines').eq('id',d.invoiceId).maybeSingle();
   if(inv.error)return bad('invoice_price_source_unavailable',503);
   if(!inv.data)return bad('invoice_not_found',404);
   if(inv.data.status!=='posted')return bad('invoice_cancelled');
   if(inv.data.revision!==d.invoiceRevision)return bad('invoice_revision_conflict');
   const current=await admin.from('workshop_state').select('revision,data').eq('id','main').single();
   if(current.error||!current.data?.data)return bad('workshop_state_unavailable',503);
   return good({ok:true,review:C.invoicePriceReview(current.data.data,inv.data,user)});
  }catch(e){const code=String(e?.message||'');return bad(allowed.has(code)?code.toLowerCase():'invoice_price_review_failed',allowed.has(code)?409:503);}
 }
 if(body?.operation&&body.operation!=='APPLY')return bad('invalid_price_application',400);
 if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!['invoiceId','invoiceRevision','requestId','reason','review'].includes(k))||
 !uuid.test(d.invoiceId||'')||!Number.isInteger(d.invoiceRevision)||d.invoiceRevision<1||
 typeof d.requestId!=='string'||! /^[a-zA-Z0-9_.:-]{1,128}$/.test(d.requestId)||
 typeof d.reason!=='string'||d.reason.trim().length<5||d.reason.trim().length>500||
 !Array.isArray(d.review)||!d.review.length||d.review.length>50||JSON.stringify(d).length>200000)
 return bad('invalid_price_application',400);
 const fingerprint={reason:d.reason.trim(),review:d.review};
 const args={p_session_hash:sessionHash,p_invoice_id:d.invoiceId,p_invoice_revision:d.invoiceRevision,
 p_request_id:d.requestId,p_fingerprint:fingerprint};
 async function commit(extra){
  const {data,error}=await admin.rpc('zukait_invoice_price_apply_commit',{...args,...extra});
  if(error){const code=String(error.message||'');return bad(allowed.has(code)?code.toLowerCase():'invoice_price_commit_failed',code==='MANAGER_ONLY'?403:allowed.has(code)?409:503);}
  if(data?.ok===true)return good(data);
  return bad(data?.code==='conflict'?'stale_workshop_revision':'invoice_price_commit_unconfirmed',data?.code==='conflict'?409:503);
 }
 try{
  // Replay does not recalculate and is authorized again in the atomic RPC.
  const previous=await admin.from('zukait_invoice_price_applications').select('request_id').eq('request_id',d.requestId).maybeSingle();
  if(previous.error)return bad('invoice_price_receipt_unavailable',503);
  if(previous.data)return await commit({p_expected_revision:0,p_consumables:{},p_receipt:{},p_live:[]});
  const inv=await admin.from('zukait_purchase_invoices').select('id,revision,status,invoice_date,lines').eq('id',d.invoiceId).maybeSingle();
  if(inv.error)return bad('invoice_price_source_unavailable',503);
  if(!inv.data)return bad('invoice_not_found',404);
  if(inv.data.status!=='posted')return bad('invoice_cancelled');
  if(inv.data.revision!==d.invoiceRevision)return bad('invoice_revision_conflict');
  const current=await admin.from('workshop_state').select('revision,data').eq('id','main').single();
  if(current.error||!current.data?.data||!Number.isSafeInteger(Number(current.data.revision)))return bad('workshop_state_unavailable',503);
  const fresh=C.invoicePriceReview(current.data.data,inv.data,user);
  if(!same(fresh,d.review))return bad('stale_price_review');
  const staged=C.prepareInvoicePriceApply(current.data.data,inv.data,{requestId:d.requestId,reason:d.reason,review:fresh},user);
  if(staged.replayed)return bad('invoice_price_receipt_inconsistent',503);
  const candidate={...current.data.data,consumables:staged.consumables};
  const live=computeLiveStatus(candidate,Number(current.data.revision)+1,user.id);
  if(!Array.isArray(live)||!live.length)return bad('invoice_price_live_status_unavailable',503);
  return await commit({p_expected_revision:Number(current.data.revision),p_consumables:staged.consumables,p_receipt:staged.receipt,p_live:live});
 }catch(e){const code=String(e?.message||'');return bad(allowed.has(code)?code.toLowerCase():'invoice_price_apply_failed',code==='MANAGER_ONLY'?403:allowed.has(code)?409:503);}
}
