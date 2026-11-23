// Inactive server boundary. No route imports it. Never accepts client source facts.
import {canonical} from '../api.js';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),text=(x,n)=>typeof x==='string'&&x.length>0&&x.length<=n&&x===x.trim()&&!/[\u0000-\u001f\u007f]/.test(x),uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x),types=['PAINT_ORDER','SPARE_PART_LINE','CONSUMABLE_PURCHASE','VENDOR_BILL'];
function request(input){if(!obj(input))return null;const allowed={list:['kind','afterId'],detail:['kind','supplierId'],links:['kind','supplierId','after'],source:['kind','sourceType','sourceId']}[input.kind];if(!allowed||Object.keys(input).some(k=>!allowed.includes(k)))return null;const p={p_kind:input.kind,p_supplier:null,p_after_id:null,p_source_type:null,p_source_id:null};
 if(input.kind==='list'){if(input.afterId!==undefined&&!uuid(input.afterId))return null;p.p_after_id=input.afterId??null}
 if(['detail','links'].includes(input.kind)){if(!uuid(input.supplierId))return null;p.p_supplier=input.supplierId}
 if(input.kind==='links'&&input.after!==undefined){if(!obj(input.after)||Object.keys(input.after).some(k=>!['type','id'].includes(k))||!types.includes(input.after.type)||!text(input.after.id,128))return null;p.p_source_type=input.after.type;p.p_source_id=input.after.id}
 if(input.kind==='source'){if(!types.includes(input.sourceType)||!text(input.sourceId,128))return null;p.p_source_type=input.sourceType;p.p_source_id=input.sourceId}return p;
}
export async function verifySupplierSource(result){
 if(!obj(result)||result.ok!==true||!Number.isSafeInteger(result.revision)||result.revision<0||!text(result.sourceId,128)||!['PAINT_ORDER','SPARE_PART_LINE'].includes(result.sourceType)||!obj(result.source)||result.source.id!==result.sourceId)return {ok:false,code:'supplier_source_review'};
 const s=result.source,validString=v=>v===null||v===undefined||text(v,200);if(!text(s.jobCard,40)||s.jobCard.trim().toUpperCase()==='ID001'||!validString(s.reference)||!validString(s.status))return {ok:false,code:'supplier_source_review'};
 if(result.sourceType==='PAINT_ORDER'){
  if(!Number.isSafeInteger(result.workshopRevision)||result.workshopRevision<0||[s.voided,s.nilPurchase,s.locked].some(v=>v!==null&&v!==undefined&&typeof v!=='boolean')||!validString(s.supplierLabel))return {ok:false,code:'supplier_source_review'};
  if(s.voided===true||s.nilPurchase===true)return {ok:false,code:'supplier_source_inactive'};
 }else if(!Number.isSafeInteger(s.revision)||s.revision<0||!text(s.eventId,128)||![s.orderedQuantity,s.receivedQuantity].every(n=>Number.isFinite(n)&&n>=0)||s.orderedQuantity<=0||s.receivedQuantity>s.orderedQuantity||['DELETED','RETURNED','CANCELLED','VOIDED'].includes(String(s.status).toUpperCase()))return {ok:false,code:'supplier_source_review'};
 const m=result.mappedSupplier;if(m!==null&&(!obj(m)||!uuid(m.id)||!text(m.name,200)||typeof m.active!=='boolean'))return {ok:false,code:'supplier_source_review'};
 const facts={sourceType:result.sourceType,sourceId:result.sourceId,source:s,workshopRevision:result.workshopRevision,mappedSupplier:m,supplierRevision:result.revision},digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(facts))));
 return {ok:true,schema:'zukait-supplier-source-preview-v1',sourceType:result.sourceType,sourceId:result.sourceId,jobCard:s.jobCard,reference:s.reference||'',status:s.status||'',mappedSupplier:m,verification:'SOURCE_EXISTS_ONLY',billingStatus:'REVIEW_REQUIRED',sourceDigest:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''),revision:result.revision,notes:['Source existence does not establish receipt, invoice, supplier-credit or bill amount.','Supplier identity requires an explicit reviewed link; displayed vendor text never assigns identity.']};
}
export async function supplierRead(input,server={}){
 const fail=code=>({ok:false,code});if(server.enabled!==true||server.readEnabled!==true)return fail('supplier_read_disabled');const p=request(input);if(!p)return fail('invalid_supplier_read');
 if(typeof server.read!=='function'||typeof server.verifySession!=='function')return fail('supplier_read_adapter_required');try{const a=await server.verifySession(),roles=server.roles??['Accountant','Manager'];if(!a||a.active!==true||a.mustChange!==false||!uuidOrStaff(a.id)||!['Accountant','Manager'].includes(a.role)||!Array.isArray(roles)||!roles.includes(a.role)||a.id!==server.actor?.id||a.role!==server.actor?.role)return fail('supplier_forbidden');
 const r=await server.read(p),again=await server.verifySession();if(!again||again.active!==true||again.mustChange!==false||again.id!==a.id||again.role!==a.role)return fail('session_changed');return input.kind==='source'?await verifySupplierSource(r):r}catch(e){const code=String(e?.message||'');return fail(['supplier_read_disabled','supplier_forbidden','invalid_session','invalid_supplier_read','supplier_not_found','supplier_source_missing','supplier_source_review','supplier_source_limit','supplier_source_unsupported'].includes(code)?code:'supplier_unavailable')}
}
const uuidOrStaff=x=>text(x,128);
