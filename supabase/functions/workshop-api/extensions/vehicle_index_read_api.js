// Read-only catalogue RPC; no workshop_state or browser-supplied data.
const fail=(status,code)=>({status,body:{ok:false,code}});
export async function vehicleIndexReadApi(admin,user,body,{enabled=false,sessionHash=''}={}){
 if(!enabled)return fail(423,'vehicle_index_read_disabled');
 if(!user?.id||!(/^[a-f0-9]{64}$/).test(sessionHash))return fail(401,'invalid_session');
 if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['action','baseVersion'].includes(k))||!Number.isSafeInteger(body.baseVersion)||body.baseVersion<1)return fail(400,'invalid_request');
 try{
  const {data,error}=await admin.rpc('zukait_vehicle_index_read',{p_session_hash:sessionHash,p_base_version:body.baseVersion});
  if(error||!data)return fail(503,'catalogue_unavailable');
  if(data.ok!==true){
   const statuses={invalid_session:401,catalogue_not_initialized:423,catalogue_base_mismatch:409,catalogue_read_limit:503};
   return fail(statuses[data.code]||503,statuses[data.code]?data.code:'catalogue_unavailable');
  }
  if(!Number.isSafeInteger(data.version)||data.version<body.baseVersion||data.baseVersion!==body.baseVersion||!Array.isArray(data.changes)||data.changes.length!==data.version-body.baseVersion||data.changes.length>5000)return fail(503,'catalogue_unavailable');
  return {status:200,body:{ok:true,baseVersion:data.baseVersion,version:data.version,changes:data.changes}};
 }catch(_){return fail(503,'catalogue_unavailable')}
}
