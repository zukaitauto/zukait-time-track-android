// Inactive server-only adapter; not imported by any route. Reuses existing HMAC.
import {fingerprint} from '../api.js';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),exact=(x,keys)=>object(x)&&Object.keys(x).every(k=>keys.includes(k));
const text=(v,n)=>typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
export function validateSupplierCommand(c){
 if(!exact(c,['requestId','entityId','deviceId','expectedRevision','operation','payload','reason'])||!uuid(c.requestId)||!uuid(c.entityId)||!text(c.deviceId,128)||!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0||!text(c.reason,1000)||c.reason.length<3)return false;
 if(['SUPPLIER_CREATE','SUPPLIER_UPDATE'].includes(c.operation))return exact(c.payload,['name','active'])&&text(c.payload.name,200)&&typeof c.payload.active==='boolean';
 return c.operation==='SUPPLIER_SOURCE_BIND'&&exact(c.payload,['sourceType','sourceId'])&&['PAINT_ORDER','SPARE_PART_LINE','CONSUMABLE_PURCHASE','VENDOR_BILL'].includes(c.payload.sourceType)&&text(c.payload.sourceId,128);
}
export async function supplierPersistenceRequest(command,context={},policy={},secret){
 const fail=code=>({ok:false,code});if(policy.enabled!==true)return fail('supplier_disabled');
 if(context.online!==true)return fail('financial_write_requires_online');if(context.sessionCurrent!==true)return fail('session_changed');
 const a=context.actor,roles=policy.roles??['Accountant','Manager'];if(!a||a.active!==true||a.mustChange!==false||!text(a.id,128)||!['Accountant','Manager'].includes(a.role)||!Array.isArray(roles)||!roles.includes(a.role))return fail('supplier_forbidden');
 if(!/^[0-9a-f]{64}$/.test(context.sessionHash||''))return fail('invalid_session');if(!validateSupplierCommand(command))return fail('invalid_supplier_command');if(typeof secret!=='string'||secret.length<16)return fail('supplier_fingerprint_key_required');
 const c=structuredClone(command),fp=await fingerprint({action:'accountant_supplier_command',actorId:a.id,command:c},secret);
 return {ok:true,request:{p_actor:a.id,p_session_hash:context.sessionHash,p_request:c.requestId,p_fingerprint:fp,p_expected:c.expectedRevision,p_operation:c.operation,p_entity:c.entityId,p_device:c.deviceId,p_payload:c.payload,p_reason:c.reason}};
}
