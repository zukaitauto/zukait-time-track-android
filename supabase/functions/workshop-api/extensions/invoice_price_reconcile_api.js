import C from './invoice_price_core.js';
const bad=(code,status=409)=>({body:{ok:false,code},status});
const good=body=>({body:{ok:true,...body},status:200});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeId=/^[a-zA-Z0-9_.:-]{1,128}$/;
const known=new Set(['MANAGER_ONLY','INVOICE_NOT_FOUND','INVOICE_CANCELLED','INVOICE_REVISION_CONFLICT','INVOICE_PRICE_APPLICATION_NOT_FOUND','INVOICE_PRICE_ALREADY_RECONCILED','INVOICE_PRICE_CHANGED_SINCE_APPLICATION','INVOICE_PRICE_ACTUAL_CHANGED_SINCE_APPLICATION','INVOICE_PRICE_RECONCILIATION_NO_FALLBACK','STALE_PRICE_RECONCILIATION_REVIEW','INVALID_PRICE_RECONCILIATION','INVALID_PRICE_APPLICATION','INVALID_INVOICE_CORRECTION','INVALID_INVOICE_DATE','INVALID_INVOICE_LINE','INVALID_LINE_TOTAL','INVALID_INVOICE_TOTAL','DUPLICATE_INVOICE','NO_INVOICE_CHANGE','REQUEST_ID_CONFLICT','INVOICE_STOCK_USED_OR_CHANGED','INVOICE_STOCK_CORRECTION_UNSAFE','STOCK_UNIT_CONFLICT','INVOICE_PAIR_SET_CHANGE_REQUIRES_REVIEW','DUPLICATE_MATERIAL_BRAND','PIECE_WHOLE_REQUIRED','WORKSHOP_PRICE_RECONCILIATION_COMMIT_FAILED']);
const fail=e=>{const code=String(e?.message||'');return bad(known.has(code)?code.toLowerCase():'invoice_price_reconciliation_failed',code==='MANAGER_ONLY'?403:known.has(code)?409:503)};
export async function invoicePriceReconcileApi(admin,user,body,{enabled=false,sessionHash='',computeLiveStatus}={}){
 if(!enabled)return bad('invoice_price_reconciliation_not_enabled',423);
 if(user?.role!=='Manager'||!user.id)return bad('manager_only',403);
 if(!sessionHash)return bad('stock_session_required',401);
 const d=body?.data,preview=body?.operation==='PREVIEW',apply=body?.operation==='APPLY';
 if((!preview&&!apply)||!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!['mode','correction','requestId','applicationRequestId','review'].includes(k))||
 !['header','lines','cancel'].includes(d.mode)||!d.correction||typeof d.correction!=='object'||Array.isArray(d.correction)||
 !uuid.test(d.correction.invoiceId||'')||!Number.isInteger(d.correction.expectedRevision)||d.correction.expectedRevision<1||
 typeof d.correction.reason!=='string'||d.correction.reason.trim().length<5||d.correction.reason.trim().length>500||
 JSON.stringify(d).length>240000||JSON.stringify(d.correction).length>65536||
 (apply&&(!safeId.test(d.requestId||'')||!safeId.test(d.applicationRequestId||'')||!d.review||typeof d.review!=='object'||Array.isArray(d.review))))
 return bad('invalid_price_reconciliation',400);
 const correction=d.correction,invoiceId=correction.invoiceId,revision=correction.expectedRevision;
 const keys=d.mode==='header'?['invoiceId','expectedRevision','reason','invoiceNumber','supplier','invoiceDate']:d.mode==='lines'?['invoiceId','expectedRevision','reason','lines']:['invoiceId','expectedRevision','reason'];
 if(Object.keys(correction).some(k=>!keys.includes(k)))return bad('invalid_invoice_correction',400);
 const fingerprint={mode:d.mode,correction,review:d.review};
 const commit=async extra=>{
  const {data,error}=await admin.rpc('zukait_invoice_price_reconcile_commit',{
   p_session_hash:sessionHash,p_invoice_id:invoiceId,p_invoice_revision:revision,p_application_request_id:d.applicationRequestId,p_request_id:d.requestId,p_mode:d.mode,p_correction:correction,p_fingerprint:fingerprint,...extra});
  if(error)return fail(error);
  if(data?.ok===true)return good(data);
  return bad(data?.code==='conflict'?'stale_workshop_revision':'invoice_price_reconciliation_unconfirmed',data?.code==='conflict'?409:503);
 };
 try{
  if(apply){
   const prior=await admin.from('zukait_invoice_price_reconciliations').select('request_id').eq('request_id',d.requestId).maybeSingle();
   if(prior.error)return bad('invoice_price_receipt_unavailable',503);
   if(prior.data)return await commit({p_expected_revision:0,p_consumables:{},p_receipt:{},p_live:[]});
  }
  const inv=await admin.from('zukait_purchase_invoices').select('id,revision,status,invoice_date').eq('id',invoiceId).maybeSingle();
  if(inv.error)return bad('invoice_price_source_unavailable',503);
  if(!inv.data)return bad('invoice_not_found',404);
  if(inv.data.status!=='posted')return bad('invoice_cancelled');
  if(inv.data.revision!==revision)return bad('invoice_revision_conflict');
  if(d.mode==='header'&&correction.invoiceDate===inv.data.invoice_date)return bad('invoice_reference_only_use_header_correction');
  const active=await admin.from('zukait_invoice_price_applications').select('request_id,receipt,invoice_revision').eq('invoice_id',invoiceId).is('reconciled_at',null).maybeSingle();
  if(active.error)return bad('invoice_price_source_unavailable',503);
  if(!active.data)return preview?good({required:false}):bad('invoice_price_application_not_found');
  if(apply&&active.data.request_id!==d.applicationRequestId)return bad('invoice_revision_conflict');
  const application={...active.data.receipt};
  delete application.ok;delete application.server_revision;delete application.replayed;
  const current=await admin.from('workshop_state').select('revision,data').eq('id','main').single();
  if(current.error||!current.data?.data||!Number.isSafeInteger(Number(current.data.revision)))return bad('workshop_state_unavailable',503);
  if(preview){
   const {review}=C.prepareInvoicePriceReconciliation(current.data.data,application,{},user);
   return good({required:true,applicationRequestId:active.data.request_id,review});
  }
  const staged=C.prepareInvoicePriceReconciliation(current.data.data,application,{requestId:d.requestId,reason:correction.reason,review:d.review},user);
  const live=computeLiveStatus({...current.data.data,consumables:staged.consumables},Number(current.data.revision)+1,user.id);
  if(!Array.isArray(live)||!live.length)return bad('invoice_price_live_status_unavailable',503);
  return await commit({p_expected_revision:Number(current.data.revision),p_consumables:staged.consumables,p_receipt:staged.receipt,p_live:live});
 }catch(e){return fail(e)}
}
