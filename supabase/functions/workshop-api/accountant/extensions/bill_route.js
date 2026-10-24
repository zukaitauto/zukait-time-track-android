import {fingerprint} from '../api.js';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x),exact=(x,keys)=>obj(x)&&Object.keys(x).every(k=>keys.includes(k));
const fail=(code,status=400)=>({status,body:{ok:false,code}});
export async function billRoute(admin,user,body,options={}){
 if(options.enabled!==true)return fail('extension_disabled',403);
 if(!user||!['Accountant','Manager'].includes(user.role))return fail('bill_forbidden',403);
 if(!/^[0-9a-f]{64}$/.test(options.sessionHash||''))return fail('invalid_session',401);
 if(!exact(body,['action','supplierId','sources','afterId','command']))return fail('bill_invalid');
 const kind={accountant_bill_preview:'preview',accountant_bill_post:'post',accountant_bill_list:'list'}[body.action];if(!kind)return fail('bill_invalid');
 let input,request=null,fp=null;
 if(kind==='post'){
  if(Object.keys(body).some(k=>!['action','command'].includes(k))||!exact(body.command,['requestId','entityId','supplierId','deviceId','reason','expectedSupplierRevision','expectedPayableRevision','expectedWorkshopRevision','invoiceReference','invoiceDate','transactionDate','dueDate','invoiceTotalMills','expectedMaterialMills','sources','invoiceReviewed'])||!uuid(body.command.requestId)||!uuid(body.command.entityId)||!uuid(body.command.supplierId)||JSON.stringify(body.command).length>16000||typeof options.secret!=='string'||options.secret.length<16)return fail('bill_invalid');
  request=body.command.requestId;input={...body.command};delete input.requestId;fp=await fingerprint({action:body.action,actorId:user.id,command:body.command},options.secret);
 }else{
  if(Object.keys(body).some(k=>!(kind==='list'?['action','supplierId','afterId']:['action','supplierId','sources']).includes(k))||!uuid(body.supplierId)||(body.afterId!==undefined&&!uuid(body.afterId)))return fail('bill_invalid');input={supplierId:body.supplierId,...(kind==='list'?{afterId:body.afterId??null}:{sources:body.sources})};
 }
 try{const {data,error}=await admin.rpc('zukait_bill_pipeline',{p_actor:user.id,p_hash:options.sessionHash,p_kind:kind,p_request:request,p_fingerprint:fp,p_input:input});if(error)throw error;return {status:200,body:data}}
 catch(e){const code=String(e?.message||''),known=['bill_disabled','bill_forbidden','invalid_session','bill_invalid','bill_revision_conflict','bill_period_review','bill_supplier_review','bill_receipt_review','bill_return_review','bill_scope_limit','bill_source_unsupported','bill_duplicate_source','bill_receipt_changed','bill_source_already_billed','bill_amount_review','bill_duplicate_invoice','request_conflict'];return known.includes(code)?fail(code,code==='invalid_session'?401:['bill_disabled','bill_forbidden'].includes(code)?403:code==='bill_invalid'?400:409):fail('bill_unavailable',503)}
}
