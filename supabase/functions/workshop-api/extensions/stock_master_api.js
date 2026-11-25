import C from './invoice_price_core.js';
// Scoped master commands only. Browser never receives or submits workshop state.
const bad=(code,status=400)=>({status,body:{ok:false,code}});
const good=body=>({status:200,body:{ok:true,...body}});
const clone=x=>JSON.parse(JSON.stringify(x));
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(x);
const str=(x,max)=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=max;
const oman=t=>new Date(Number(t)+14400000).toISOString().slice(0,10);
const allowed=new Set(['MATERIAL_NAME_REQUIRED','INVALID_UNIT','INVALID_MATERIAL_DEPARTMENT','PAINT_ONLY_MATERIAL','MATERIAL_DUPLICATE','BRAND_DUPLICATE','BRAND_NAME_REQUIRED','MATERIAL_NOT_FOUND','BRAND_NOT_FOUND','INVALID_PRICE','EFFECTIVE_DATE_REQUIRED','REASON_REQUIRED','PRICE_DATE_DUPLICATE','PRICE_NOT_FOUND','INVOICE_PRICE_OWNED','MASTER_INVALID_INPUT','MASTER_NO_CHANGE','MASTER_SCOPE_MISMATCH','STOCK_UNIT_CONFLICT','PAINT_ONLY_MASTER','INVALID_MASTER','MASTER_NOT_SAVED']);
function prepare(data,d,user){
 const state=clone(data),c=C.ensureState(state);let row;
 if(!d||typeof d!=='object'||Array.isArray(d)||!str(d.reason,500)||d.reason.trim().length<5)throw Error('MASTER_INVALID_INPUT');
 const fields={CREATE_MATERIAL:['command','name','unit','category','department','reason'],SET_PRICE:['command','materialId','brandName','price','date','reason'],CORRECT_PRICE:['command','priceId','price','reason']}[d.command];
 if(!Array.isArray(fields)||Object.keys(d).some(k=>!fields.includes(k)))throw Error('MASTER_INVALID_INPUT');
 if(d.command==='CREATE_MATERIAL'){
  if(!str(d.name,120)||!['Liter','kg','Piece'].includes(d.unit)||!['Paint','Consumable'].includes(d.category)||!['Painting','Mechanical','Both'].includes(d.department))throw Error('MASTER_INVALID_INPUT');
  row=C.addMaterial(state,d,user);
 }else{
  if(typeof d.price!=='number'||!Number.isFinite(d.price)||d.price<0||d.price>999999999.999||Math.abs(d.price*1000-Math.round(d.price*1000))>0.0001)throw Error('INVALID_PRICE');
  if(d.command==='SET_PRICE'){
   if(!id(d.materialId)||!str(d.brandName,120)||typeof d.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d.date))throw Error('MASTER_INVALID_INPUT');
   const effectiveFrom=Date.parse(d.date+'T00:00:00+04:00');
   if(!Number.isFinite(effectiveFrom)||oman(effectiveFrom)!==d.date)throw Error('EFFECTIVE_DATE_REQUIRED');
   const matches=c.brands.filter(b=>b.active!==false&&String(b.name).trim().toLowerCase()===d.brandName.trim().toLowerCase());
   if(matches.length>1)throw Error('BRAND_DUPLICATE');
   const brand=matches[0]||C.addBrand(state,{name:d.brandName},user);
   if(c.prices.some(p=>!p.voided&&p.materialId===d.materialId&&p.brandId===brand.id&&oman(p.effectiveFrom)===d.date))throw Error('PRICE_DATE_DUPLICATE');
   row=C.setPrice(state,{materialId:d.materialId,brandId:brand.id,pricePerUnit:d.price,effectiveFrom,reason:d.reason},user);
  }else{
   if(!id(d.priceId))throw Error('MASTER_INVALID_INPUT');
   const before=c.prices.find(p=>p.id===d.priceId&&!p.voided);if(!before)throw Error('PRICE_NOT_FOUND');
   if(Number(before.pricePerUnit)===d.price)throw Error('MASTER_NO_CHANGE');
   row=C.managerCorrectPrice(state,d.priceId,d.price,user,d.reason);
  }
 }
 const old=new Map((data.consumables?.actuals||[]).map(a=>[a.id,a]));
 const impacted=c.actuals.filter(a=>old.has(a.id)&&!same(a,old.get(a.id)));
 const totals=xs=>Math.round(xs.reduce((sum,a)=>sum+Number(a.totalCost||0),0)*1000)/1000;
 return {state,row,impact:{affected:impacted.length,oldTotal:totals(impacted.map(a=>old.get(a.id))),newTotal:totals(impacted)}};
}
export async function stockMasterApi(admin,user,body,{enabled=false,sessionHash='',computeLiveStatus}={}){
 if(!enabled)return bad('stock_master_not_enabled',423);
 if(!['Manager','Accountant'].includes(user?.role)||!id(String(user.id||'')))return bad('stock_forbidden',403);
 if(!sessionHash)return bad('stock_session_required',401);
 if(!body||Object.keys(body).some(k=>!['action','operation','data','requestId','expectedRevision','impact','page','query','materialId'].includes(k)))return bad('master_invalid_input');
 const operation=body.operation;
 if(!['MASTER_LIST','MASTER_REVIEW','MASTER_SAVE'].includes(operation))return bad('master_invalid_input');
 try{
  const q=await admin.from('workshop_state').select('revision,data').eq('id','main').single();
  if(q.error||!q.data?.data||!Number.isSafeInteger(Number(q.data.revision)))return bad('workshop_state_unavailable',503);
  const data=q.data.data,revision=Number(q.data.revision),c=data.consumables||{};
  if(operation==='MASTER_LIST'){
   const page=body.page??0,query=String(body.query||'').trim().toLowerCase();
   if(!Number.isInteger(page)||page<0||page>100||query.length>120)return bad('master_invalid_input');
   const materials=(c.materials||[]).filter(m=>m.active!==false&&(!query||String(m.name).toLowerCase().includes(query))).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
   const m=body.materialId&&(c.materials||[]).find(m=>m.id===body.materialId&&m.active!==false);
   if(body.materialId&&!m)return bad('material_not_found',404);
   const prices=m?(c.prices||[]).filter(p=>p.materialId===m.id&&!p.voided).sort((a,b)=>Number(b.effectiveFrom)-Number(a.effectiveFrom)):[];
   const brands=new Map((c.brands||[]).map(b=>[b.id,b.name]));
   return good({revision,materials:materials.slice(page*100,page*100+100).map(({id,name,unit,category,department})=>({id,name,unit,category,department})),hasMore:materials.length>(page+1)*100,prices:prices.slice(page*100,page*100+100).map(p=>({id:p.id,brandName:brands.get(p.brandId)||p.brandId,price:p.pricePerUnit,date:oman(p.effectiveFrom),invoiceOwned:Boolean(C.activeInvoicePriceOwner(c,p.id))})),pricesHasMore:prices.length>(page+1)*100});
  }
  if(JSON.stringify(body.data||{}).length>4096)return bad('master_invalid_input');
  if(operation==='MASTER_SAVE'){
   if(!id(body.requestId)||!Number.isSafeInteger(body.expectedRevision))return bad('master_invalid_input');
   const prior=(c.audit||[]).find(a=>a.type==='STOCK_MASTER_COMMAND'&&a.requestId===body.requestId);
   if(prior){if(prior.by!==user.id||!same(prior.fingerprint,body.data))return bad('request_id_conflict',409);return good({receipt:prior.receipt});}
   if(revision!==body.expectedRevision)return bad('stale_workshop_revision',409);
  }
  const staged=prepare(data,body.data,user);
  if(operation==='MASTER_REVIEW')return good({revision,impact:staged.impact});
  if(!same(staged.impact,body.impact))return bad('stale_price_review',409);
  const receipt={id:staged.row.id,command:body.data.command,...staged.impact};
  staged.state.consumables.audit.push({id:'stock-master:'+body.requestId,type:'STOCK_MASTER_COMMAND',requestId:body.requestId,by:user.id,role:user.role,at:Date.now(),reason:body.data.reason,fingerprint:clone(body.data),receipt});
  const without=x=>Object.fromEntries(Object.entries(x).filter(([k])=>k!=='consumables'));
  if(!same(without(data),without(staged.state)))return bad('stock_master_scope_violation',500);
  const live=computeLiveStatus(staged.state,revision+1,user.id);
  if(!Array.isArray(live)||!live.length)return bad('stock_master_live_unavailable',503);
  const link=body.data.command!=='CREATE_MATERIAL';
  const saved=await admin.rpc('zukait_stock_master_commit',{p_session_hash:sessionHash,p_expected_revision:revision,p_consumables:staged.state.consumables,p_live:live,p_material_id:link?staged.row.materialId:null,p_brand_id:link?staged.row.brandId:null,p_price_id:link?staged.row.id:null});
  if(saved.error){const code=String(saved.error.message||'');return bad(allowed.has(code)?code.toLowerCase():code==='STOCK_FORBIDDEN'?'stock_forbidden':'stock_master_commit_failed',allowed.has(code)?409:code==='STOCK_FORBIDDEN'?403:503);}
  if(saved.data?.ok!==true)return bad(saved.data?.code==='conflict'?'stale_workshop_revision':'stock_master_unconfirmed',saved.data?.code==='conflict'?409:503);
  return good({receipt});
 }catch(e){const code=String(e?.message||'');return bad(allowed.has(code)?code.toLowerCase():'stock_master_unavailable',allowed.has(code)?409:503);}
}
