// ZUKAIT Consumables Stock read/write gateway.
// Feature flags default OFF; never accept staff identities/roles from request JSON.
// Uses small, paginated tables and one transactional RPC per write.
const roles = new Set(['Manager','Supervisor','Mechanical Supervisor']);
const managerActions = new Set(['OPENING','ADJUST','MINIMUM']);
const allowedCommands = new Set(['OPENING','PURCHASE','RESERVE','CHANGE','CANCEL','FINALISE','RETURN','ADJUST','MINIMUM','MECHANICAL_ISSUE','MECHANICAL_RETURN']);
const allowedKeys = new Set(['action','operation','command','requestId','data','materialId','brandId','jobCard','cursor','page','origin']);
const bad = (code,status=400) => ({status,body:{ok:false,code}});
const good = data => ({status:200,body:{ok:true,...data}});
function safeId(value, limit=120) {
  const s=String(value||'').trim();
  return s.length<=limit&&/^[a-zA-Z0-9_.:-]*$/.test(s)?s:'';
}
export async function consumablesStockApi(admin,user,body,{enabled=false,writesEnabled=false,mechanicalWritesEnabled=false,masterLinkEnabled=false,sessionHash=''}={}) {
  if(!roles.has(user?.role))return bad('stock_forbidden',403);
  if(!enabled)return bad('stock_not_enabled',503);
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!allowedKeys.has(k)))return bad('stock_invalid_request');
  const operation=String(body.operation||'LIST').trim().toUpperCase();
  // Mechanical Supervisors may only see the scoped Mechanical catalog and issue to it.
  // LIST/HISTORY/BALANCE/RESERVATIONS could otherwise disclose Bodyshop-only stock.
  if(user.role==='Mechanical Supervisor'&&!['CATALOG','WRITE','MECHANICAL_RETURNABLE','MECHANICAL_TOTALS'].includes(operation))
    return bad('mechanical_stock_forbidden',403);
  if(operation==='LEGACY_PREVIEW') {
    // One-time Manager review of the CURRENT saved master; at most 20 pairs.
    // No write to Stock or workshop_state, no automatic department inference.
    if(user.role!=='Manager')return bad('manager_only',403);
    if(!masterLinkEnabled)return bad('stock_master_link_not_enabled',423);
    if(!sessionHash)return bad('stock_session_required',401);
    if(!Number.isInteger(body.page)||body.page<0||body.page>49)
      return bad('invalid_preview_page');
    const {data,error}=await admin.rpc('zukait_stock_legacy_preview',{
      p_session_hash:sessionHash,p_page:body.page
    });
    if(error)return bad('legacy_preview_failed',503);
    return good({preview:data});
  }
  if(operation==='MASTER_LINK') {
    // Manager-only projection of one material+brand that is ALREADY committed
    // to the existing workshop Master; SQL rechecks saved IDs, price and role.
    if(user.role!=='Manager')return bad('manager_only',403);
    if(!masterLinkEnabled)return bad('stock_master_link_not_enabled',423);
    if(!sessionHash)return bad('stock_session_required',401);
    const materialId=safeId(body.materialId);
    const brandId=safeId(body.brandId);
    const origin=body.origin;
    if(!materialId||!brandId||!['Mechanical','Painting','Both'].includes(origin))
      return bad('invalid_master_link');
    const {data,error}=await admin.rpc('zukait_stock_link_master',{
      p_session_hash:sessionHash,p_material_id:materialId,p_brand_id:brandId,
      p_origin:origin
    });
    if(error){
      const code=String(error.message||'');
      const allowed=['MANAGER_ONLY','STOCK_FORBIDDEN','MASTER_NOT_SAVED',
        'STOCK_UNIT_CONFLICT','PAINT_ONLY_MASTER','INVALID_MASTER'];
      const mapped=allowed.includes(code)?code.toLowerCase():'stock_master_link_failed';
      return bad(mapped,mapped==='manager_only'||mapped==='stock_forbidden'?403:
        mapped==='stock_master_link_failed'?503:409);
    }
    return good({linked:data});
  }
  if(operation==='MECHANICAL_TOTALS') {
    if(!['Manager','Mechanical Supervisor'].includes(user.role))
      return bad('mechanical_stock_forbidden',403);
    // Off by default until the same isolated Mechanical stock release.
    if(!mechanicalWritesEnabled)return bad('mechanical_stock_not_enabled',423);
    if(!sessionHash)return bad('stock_session_required',401);
    const jc=String(body.jobCard||'').trim().toUpperCase();
    if(!/^[A-Z0-9_. -]{1,36}$/.test(jc))return bad('invalid_mechanical_job');
    if(!Number.isInteger(body.page)||body.page<0||body.page>49)
      return bad('invalid_totals_page');
    const {data,error}=await admin.rpc('zukait_stock_mechanical_job_totals',{
      p_session_hash:sessionHash,p_job_card:jc,p_page:body.page
    });
    if(error)return bad('mechanical_totals_read_failed',503);
    return good({totals:data});
  }
  if(operation==='MECHANICAL_RETURNABLE') {
    if(!['Manager','Mechanical Supervisor'].includes(user.role))
      return bad('mechanical_stock_forbidden',403);
    if(!mechanicalWritesEnabled)return bad('mechanical_stock_not_enabled',423);
    if(!sessionHash)return bad('stock_session_required',401);
    const jc=String(body.jobCard||'').trim().toUpperCase();
    if(!/^[A-Z0-9_. -]{1,36}$/.test(jc))return bad('invalid_mechanical_job');
    if(!Number.isInteger(body.page)||body.page<0||body.page>49)
      return bad('invalid_return_page');
    const {data,error}=await admin.rpc('zukait_stock_mechanical_returnable',{
      p_session_hash:sessionHash,p_job_card:jc,p_page:body.page
    });
    if(error)return bad('returnable_read_failed',503);
    return good({returnable:data});
  }
  if(operation==='CATALOG') {
    // One bounded indexed read; only stock catalog keys, never workshop_state.
    const page=Math.max(0,Math.min(20,Number.isInteger(body.page)?body.page:0));
    const {data,error}=await admin.from('zukait_stock_balances')
      .select('material_id,brand_id,unit,physical,reserved,material:zukait_stock_material_keys(display_name,department,active),brand:zukait_stock_brand_keys(display_name,active)')
      .order('material_id',{ascending:true}).order('brand_id',{ascending:true})
      .range(page*100,(page+1)*100);
    if(error)return bad('stock_catalog_failed',503);
    const raw=Array.isArray(data)?data:[];
    const items=raw.slice(0,100).filter(x=>{
      const m=Array.isArray(x.material)?x.material[0]:x.material;
      const b=Array.isArray(x.brand)?x.brand[0]:x.brand;
      return m?.active!==false&&b?.active!==false&&
        ['Mechanical','Both'].includes(m?.department)&&
        String(m?.display_name||'').length>0&&String(b?.display_name||'').length>0;
    }).map(x=>({
      materialId:x.material_id,brandId:x.brand_id,unit:x.unit,
      name:(Array.isArray(x.material)?x.material[0]:x.material).display_name,
      brand:(Array.isArray(x.brand)?x.brand[0]:x.brand).display_name,
      physical:x.physical,reserved:x.reserved
    }));
    return good({items,page,hasMore:raw.length>100});
  }
  if(operation==='BALANCE') {
    const materialId=safeId(body.materialId);
    const brandId=safeId(body.brandId);
    if(!materialId||!brandId)return bad('stock_item_required');
    const {data,error}=await admin.from('zukait_stock_balances')
      .select('material_id,brand_id,unit,physical,reserved,stock_value,minimum,updated_at')
      .eq('material_id',materialId).eq('brand_id',brandId).maybeSingle();
    if(error)return bad('stock_read_failed',503);
    return good({item:data||null});
  }
  if(operation==='REPORTS') {
    const {data,error}=await admin.rpc('zukait_stock_balance_report');
    if(error||!data)return bad('stock_report_failed',503);
    return good({report:data});
  }
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
    if(command==='MECHANICAL_ISSUE'||command==='MECHANICAL_RETURN') {
      if(!['Manager','Mechanical Supervisor'].includes(user.role))return bad('mechanical_stock_forbidden',403);
      if(!mechanicalWritesEnabled)return bad('mechanical_stock_not_enabled',423);
    }else if(!['Manager','Supervisor'].includes(user.role))return bad('stock_forbidden',403);
    const requestId=safeId(body.requestId,128);
    if(!requestId)return bad('stock_request_id_required');
    if(!sessionHash)return bad('stock_session_required',401);
    const data=body.data;
    if(!data||typeof data!=='object'||Array.isArray(data)||
       JSON.stringify(data).length>2048)return bad('stock_invalid_payload');
    const mechanical=command==='MECHANICAL_ISSUE'||command==='MECHANICAL_RETURN';
    const mechanicalRpc=command==='MECHANICAL_RETURN'?'zukait_stock_mechanical_return':'zukait_stock_mechanical_issue';
    const {data:receipt,error}=await admin.rpc(mechanical?mechanicalRpc:'zukait_stock_command',
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
        'DUPLICATE_MATERIAL_BRAND','PIECE_WHOLE_REQUIRED',
        'MECHANICAL_LINE_NOT_FOUND','RETURN_EXCEEDS_ISSUED',
        'RETURN_REASON_REQUIRED','INVALID_RETURN_LINE','INVALID_RETURN_QUANTITY',
        'STOCK_UNIT_CONFLICT']);
      const code=codes.has(message)?message.toLowerCase():'stock_write_failed';
      return bad(code,code==='stock_forbidden'||code==='manager_only'||code==='mechanical_stock_forbidden'?403:
        code==='stock_write_failed'?503:409);
    }
    return good({receipt});
  }
  return bad('stock_unknown_operation');
}
