// ZUKAIT Stock Phase 1: isolated, bounded read + opening/purchase only.
// Works only behind ZUKAIT_STOCK_PHASE1_ENABLED, OFF by default.
// No Workshop State snapshots, no Job Card issues, returns, adjustments or deductions.
const fail=(code,status=400)=>({status,body:{ok:false,code}});
const fields=(obj,allowed)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
  Object.keys(obj).every(k=>allowed.includes(k));
const text=v=>String(v??'').trim();
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:NaN;
const money=v=>Math.round((v+Number.EPSILON)*1000)/1000;
const itemFields='material_id,brand_id,unit,physical,reserved,stock_value,opening_at,updated_at';
const eventFields='id,kind,material_id,brand_id,unit,quantity,total_cost,unit_cost,physical_after,stock_value_after,actor_id,note,created_at';

function priceTotal(data){
 const quantity=num(data.quantity),price=num(data.price);
 if(!Number.isFinite(quantity)||quantity<0||quantity>100000||Math.abs(quantity*10000-Math.round(quantity*10000))>1e-7)
  return null;
 if(!Number.isFinite(price)||price<0||price>1000000)return null;
 if(!['total','unit'].includes(data.priceMethod))return null;
 const total=money(data.priceMethod==='total'?price:price*quantity);
 if(total>1000000||total<0||!Number.isFinite(total))return null;
 if(data.priceMethod==='total'&&Math.abs(total-price)>1e-7)return null;
 return {quantity,total};
}

export async function stockPhase1Api(admin,user,body,{enabled=false,sessionHash=''}={}){
 if(!enabled)return fail('stock_phase1_disabled',503);
 if(!['Manager','Supervisor'].includes(String(user?.role||'')))return fail('stock_forbidden',403);
 if(!fields(body,['action','operation','command','requestId','data']))return fail('stock_invalid_fields');
 const operation=text(body.operation).toUpperCase();
 if(operation==='LIST'){
  const page=body.data?.page??0;
  if(!fields(body.data||{},['page'])||!Number.isSafeInteger(page)||page<0||page>50)return fail('stock_invalid_page');
  const from=page*50;
  const {data,error}=await admin.from('workshop_stock_balances')
    .select(itemFields).order('material_id').order('brand_id')
    .range(from,from+50);
  if(error)return fail('stock_unavailable',503);
  return {status:200,body:{ok:true,items:(data||[]).slice(0,50),
    hasMore:(data||[]).length>50,page}};
 }
 if(operation==='BALANCE'){
  const d=body.data;
  if(!fields(d,['materialId','brandId'])||!text(d.materialId)||!text(d.brandId))
    return fail('stock_item_invalid');
  const {data,error}=await admin.from('workshop_stock_balances')
    .select(itemFields).eq('material_id',text(d.materialId)).eq('brand_id',text(d.brandId)).maybeSingle();
  if(error)return fail('stock_unavailable',503);
  return {status:200,body:{ok:true,item:data||null}};
 }
 if(operation==='HISTORY'){
  const cursor=body.data?.cursor??null;
  if(!fields(body.data||{},['cursor'])||(cursor!==null&&(!Number.isSafeInteger(cursor)||cursor<1)))
    return fail('stock_invalid_cursor');
  let q=admin.from('workshop_stock_events').select(eventFields).order('id',{ascending:false}).limit(51);
  if(cursor!==null)q=q.lt('id',cursor);
  const {data,error}=await q;
  if(error)return fail('stock_unavailable',503);
  return {status:200,body:{ok:true,history:(data||[]).slice(0,50),hasMore:(data||[]).length>50}};
 }
 if(operation!=='WRITE')return fail('stock_action_disabled',403);
 const kind=text(body.command).toUpperCase();
 if(!['OPENING','PURCHASE'].includes(kind))return fail('stock_action_disabled',403);
 if(kind==='OPENING'&&user.role!=='Manager')return fail('stock_manager_only',403);
 const d=body.data,price=priceTotal(d||{});
 if(!fields(d,['materialId','brandId','quantity','priceMethod','price','countConfirmed','reason','note'])||
   !price||!text(d.materialId)||!text(d.brandId))return fail('stock_input_invalid');
 if(kind==='OPENING'&&d.countConfirmed!==true)return fail('stock_count_not_confirmed');
 const reference=text(d.reason||d.note);
 if(reference.length<5||reference.length>200)return fail('stock_reference_required');
 if(kind==='PURCHASE'&&(price.quantity<=0||price.total<=0))return fail('stock_input_invalid');
 if(kind==='OPENING'&&price.quantity===0&&price.total!==0)return fail('stock_input_invalid');
 if(!/^[A-Za-z0-9_:.-]{16,128}$/.test(String(body.requestId||'')))return fail('stock_request_invalid');
 if(!/^[a-f0-9]{64}$/i.test(sessionHash))return fail('stock_session_invalid',401);
 const {data,error}=await admin.rpc('zukait_stock_phase1_write',{
  p_actor_id:String(user.id),p_session_hash:sessionHash,
  p_client_request_id:body.requestId,p_kind:kind,
  p_material_id:text(d.materialId),p_brand_id:text(d.brandId),
  p_quantity:price.quantity,p_total_cost:price.total,p_note:reference,
  p_count_confirmed:d.countConfirmed===true
 });
 if(error){
  const code=String(error.message||'').match(/\bstock_[a-z_]+\b/)?.[0]||'stock_unavailable';
  return fail(code,code==='stock_unavailable'?503:/forbidden|manager_only|action_disabled/.test(code)?403:409);
 }
 if(!data?.ok||data.requestId!==body.requestId||!data.materialId||!data.brandId)
  return fail('stock_receipt_invalid',503);
 return {status:200,body:{ok:true,receipt:data,duplicate:data.duplicate===true}};
}
