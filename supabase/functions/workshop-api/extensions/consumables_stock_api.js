// ZUKAIT Consumables Stock read/write gateway.
// Feature flags default OFF; never accept staff identities/roles from request JSON.
// Uses small, paginated tables and one transactional RPC per write.
const roles = new Set(['Manager','Supervisor','Mechanical Supervisor']);
const managerActions = new Set(['OPENING','ADJUST','MINIMUM']);
const allowedCommands = new Set(['OPENING','PURCHASE','RESERVE','CHANGE','CANCEL','FINALISE','RETURN','ADJUST','MINIMUM','MECHANICAL_ISSUE']);
const allowedKeys = new Set(['action','operation','command','requestId','data','materialId','brandId','jobCard','cursor','page']);
const bad = (code,status=400) => ({status,body:{ok:false,code}});
const good = data => ({status:200,body:{ok:true,...data}});
function safeId(value, limit=120) {
  const s=String(value||'').trim();
  return s.length<=limit&&/^[a-zA-Z0-9_.:-]*$/.test(s)?s:'';
}
export async function consumablesStockApi(admin,user,body,{enabled=false,writesEnabled=false,mechanicalWritesEnabled=false,sessionHash=''}={}) {
  if(!roles.has(user?.role))return bad('stock_forbidden',403);
  if(!enabled)return bad('stock_not_enabled',503);
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!allowedKeys.has(k)))return bad('stock_invalid_request');
  const operation=String(body.operation||'LIST').trim().toUpperCase();
  if(operation==='LIST') {
    const page=Math.max(0,Math.min(20,Number.isInteger(body.page)?body.page:0));
    const {data,error}=await admin.from('zukait_stock_balances')
      .select('material_id,brand_id,unit,physical,reserved,stock_value,minimum,updated_at')
      .order('material_id',{ascending:true}).order('brand_id',{ascending:true})
      .range(page*100,(page+1)*100);
    if(error)return bad('stock_read_failed',503);
    const rows=Array.isArray(data)?data:[];
    return good({items:rows.slice(0,100),page,hasMore:rows.length>100});
  }
  if(operation==='HISTORY') {
    const materialId=safeId(body.materialId);
    const brandId=safeId(body.brandId);
    if(body.materialId&&!materialId||body.brandId&&!brandId)return bad('stock_invalid_filter');
    const cursor=body.cursor==null?'':String(body.cursor);
    if(cursor&&!/^[1-9]\d{0,17}$/.test(cursor))return bad('stock_invalid_cursor');
    let query=admin.from('zukait_stock_movements')
      .select('id,material_id,brand_id,action,physical_delta,reserved_delta,cost_delta,job_card,actor_id,note,recorded_at')
      .order('id',{ascending:false}).limit(51);
    if(materialId)query=query.eq('material_id',materialId);
    if(brandId)query=query.eq('brand_id',brandId);
    if(cursor)query=query.lt('id',cursor);
    const {data,error}=await query;
    if(error)return bad('stock_history_failed',503);
    const rows=Array.isArray(data)?data:[];
    return good({history:rows.slice(0,50),hasMore:rows.length>50});
  }
  if(operation==='RESERVATIONS') {
    const jobCard=safeId(body.jobCard,36);
    if(!jobCard)return bad('stock_job_card_required');
    const {data,error}=await admin.from('zukait_stock_reservations')
      .select('id,job_card,material_id,brand_id,status,reserved_qty,actual_qty,final_cost,returned_qty,return_credit')
      .eq('job_card',jobCard.toUpperCase()).limit(100);
    if(error)return bad('stock_reservations_failed',503);
    return good({reservations:data||[]});
  }
  if(operation==='WRITE') {
    if(!writesEnabled)return bad('stock_write_not_enabled',423);
    const command=String(body.command||'').toUpperCase();
    if(!allowedCommands.has(command))return bad('stock_unknown_command');
    if(managerActions.has(command)&&user.role!=='Manager')return bad('manager_only',403);
    if(command==='MECHANICAL_ISSUE') {
      if(!['Manager','Mechanical Supervisor'].includes(user.role))return bad('mechanical_stock_forbidden',403);
      if(!mechanicalWritesEnabled)return bad('mechanical_stock_not_enabled',423);
    }else if(!['Manager','Supervisor'].includes(user.role))return bad('stock_forbidden',403);
    const requestId=safeId(body.requestId,128);
    if(!requestId)return bad('stock_request_id_required');
    if(!sessionHash)return bad('stock_session_required',401);
    const data=body.data;
    if(!data||typeof data!=='object'||Array.isArray(data)||
       JSON.stringify(data).length>2048)return bad('stock_invalid_payload');
    const mechanical=command==='MECHANICAL_ISSUE';
    const {data:receipt,error}=await admin.rpc(mechanical?'zukait_stock_mechanical_issue':'zukait_stock_command',
      mechanical?{p_session_hash:sessionHash,p_request_id:requestId,p_data:data}:
        {p_session_hash:sessionHash,p_request_id:requestId,p_action:command,p_data:data});
    if(error) {
      const message=String(error.message||'').trim();
      const codes=new Set(['STOCK_FORBIDDEN','MANAGER_ONLY','INSUFFICIENT_STOCK',
        'OPENING_STOCK_REQUIRED','STOCK_MASTER_KEY_NOT_FOUND','OPENING_ALREADY_RECORDED',
        'RESERVATION_CLOSED','RESERVATION_NOT_FOUND','FINALISATION_REQUIRED',
        'RETURN_EXCEEDS_ACTUAL','COUNT_BELOW_RESERVED','INVALID_ACTUAL_QUANTITY',
        'REQUEST_ID_CONFLICT','STOCK_VALUATION_CONFLICT','REASON_REQUIRED',
        'MECHANICAL_STOCK_FORBIDDEN','MECHANICAL_JOB_NOT_FOUND','INVALID_MECHANICAL_JOB',
        'INVALID_ISSUE_LINES','INVALID_ISSUE_LINE','INVALID_ISSUE_KIND',
        'DUPLICATE_MATERIAL_BRAND','PIECE_WHOLE_REQUIRED']);
      const code=codes.has(message)?message.toLowerCase():'stock_write_failed';
      return bad(code,code==='stock_forbidden'||code==='manager_only'?403:
        code==='stock_write_failed'?503:409);
    }
    return good({receipt});
  }
  return bad('stock_unknown_operation');
}
