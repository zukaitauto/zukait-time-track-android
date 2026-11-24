(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ZukaitConsumables=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DEPT='Painting';
  const TYPES={ISSUED:'issued',ADDITIONAL:'additional',ACTUAL:'actual'};
  const UNITS=['Liter','kg','Piece'];
  const CATEGORIES=['Paint','Consumable'];
  const MATERIAL_DEPARTMENTS=['Painting','Mechanical','Both'];
  // Older workshop materials have no department; never silently classify them.
  const availableToPainting=m=>!m?.department||m.department==='Unassigned'||['Painting','Both'].includes(m.department);
  const UNIT_ALIASES={Litre:'Liter',litre:'Liter',liter:'Liter',KG:'kg',Kg:'kg',piece:'Piece',PIECE:'Piece'};
  const normalizeUnit=unit=>UNIT_ALIASES[String(unit||'').trim()]||String(unit||'').trim();
  const clone=v=>JSON.parse(JSON.stringify(v));
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const money=v=>Math.round((num(v)+Number.EPSILON)*1000)/1000;
  const uid=(prefix,now=Date.now())=>{let r='';try{r=globalThis.crypto&&typeof globalThis.crypto.randomUUID==='function'?globalThis.crypto.randomUUID():''}catch(e){}return prefix+'-'+(r||now+'-'+Math.random().toString(36).slice(2,14))};
  const requestId=input=>String(input?.clientRequestId||'').trim();
  function ensureState(state){
    if(!state||typeof state!=='object')throw new Error('STATE_REQUIRED');
    state.consumables=state.consumables&&typeof state.consumables==='object'?state.consumables:{};
    const c=state.consumables;
    c.schemaVersion=1;
    c.materials=Array.isArray(c.materials)?c.materials:[];
    c.materials.forEach(m=>{if(m&&!CATEGORIES.includes(m.category))m.category='Consumable'});
    c.brands=Array.isArray(c.brands)?c.brands:[];
    c.prices=Array.isArray(c.prices)?c.prices:[];
    c.issues=Array.isArray(c.issues)?c.issues:[];
    c.actuals=Array.isArray(c.actuals)?c.actuals:[];
    c.audit=Array.isArray(c.audit)?c.audit:[];
    return c;
  }
  function assertRole(role,managerOnly=false){
    if(managerOnly&&role!=='Manager')throw new Error('MANAGER_ONLY');
    if(role!=='Manager'&&role!=='Supervisor')throw new Error('CONSUMABLES_FORBIDDEN');
  }
  function validUnit(unit){return UNITS.includes(normalizeUnit(unit))}
  function addMaterial(state,input,actor){
    assertRole(actor?.role,true); const c=ensureState(state);
    const name=String(input?.name||'').trim(); const unit=normalizeUnit(input?.unit); const category=CATEGORIES.includes(input?.category)?input.category:'Consumable';
    const requested=String(input?.department||'').trim();
    // Existing callers may leave older materials unassigned. The new Manager
    // form requires an explicit selection; no implicit Painting default.
    const department=requested||'Unassigned';
    if(!name)throw new Error('MATERIAL_NAME_REQUIRED'); if(!validUnit(unit))throw new Error('INVALID_UNIT');
    if(requested&&!MATERIAL_DEPARTMENTS.includes(requested))throw new Error('INVALID_MATERIAL_DEPARTMENT');
    if(category==='Paint'&&!['Painting','Unassigned'].includes(department))throw new Error('PAINT_ONLY_MATERIAL');
    if(c.materials.some(x=>x.active!==false&&x.name.toLowerCase()===name.toLowerCase()))throw new Error('MATERIAL_DUPLICATE');
    const row={id:uid('mat'),name,unit,category,department,active:true,createdAt:Date.now(),createdBy:actor.id};
    c.materials.push(row); return clone(row);
  }
  function addBrand(state,input,actor){
    assertRole(actor?.role,true); const c=ensureState(state);
    const name=String(input?.name||'').trim(); if(!name)throw new Error('BRAND_NAME_REQUIRED');
    if(c.brands.some(x=>x.active!==false&&x.name.toLowerCase()===name.toLowerCase()))throw new Error('BRAND_DUPLICATE');
    const row={id:uid('brand'),name,active:true,createdAt:Date.now(),createdBy:actor.id}; c.brands.push(row); return clone(row);
  }
  function setPrice(state,input,actor){
    assertRole(actor?.role,true); const c=ensureState(state);
    const material=c.materials.find(x=>x.id===input.materialId&&x.active!==false);
    const brand=c.brands.find(x=>x.id===input.brandId&&x.active!==false);
    if(!material)throw new Error('MATERIAL_NOT_FOUND'); if(!brand)throw new Error('BRAND_NOT_FOUND');
    const price=Number(input.pricePerUnit); if(!Number.isFinite(price)||price<0)throw new Error('INVALID_PRICE');
    const effectiveFrom=Number(input.effectiveFrom); if(!Number.isFinite(effectiveFrom))throw new Error('EFFECTIVE_DATE_REQUIRED');
    const reason=String(input.reason||'').trim(); if(!reason)throw new Error('REASON_REQUIRED');
    const duplicate=c.prices.find(x=>x.materialId===material.id&&x.brandId===brand.id&&x.effectiveFrom===effectiveFrom&&!x.voided);
    if(duplicate)throw new Error('PRICE_DATE_DUPLICATE');
    const previous=c.prices.filter(x=>!x.voided&&x.materialId===material.id&&x.brandId===brand.id&&x.effectiveFrom<effectiveFrom).sort((a,b)=>b.effectiveFrom-a.effectiveFrom||b.createdAt-a.createdAt)[0]||null;
    const row={id:uid('price'),materialId:material.id,brandId:brand.id,unit:material.unit,pricePerUnit:money(price),effectiveFrom,createdAt:Date.now(),createdBy:actor.id,reason};
    c.prices.push(row); c.audit.push({id:uid('audit'),type:previous?'PRICE_CHANGED':'PRICE_CREATED',entityId:row.id,by:actor.id,at:Date.now(),reason,before:previous?clone(previous):null,after:clone(row)});
    managerRecalculateActualPrices(state,row.id,actor,reason);
    return clone(row);
  }
  function managerCorrectPrice(state,priceId,newPrice,actor,reason){
    assertRole(actor?.role,true); const c=ensureState(state),why=String(reason||'').trim();
    if(!why)throw new Error('REASON_REQUIRED');
    const row=c.prices.find(x=>x.id===priceId&&!x.voided); if(!row)throw new Error('PRICE_NOT_FOUND');
    const price=Number(newPrice); if(!Number.isFinite(price)||price<0)throw new Error('INVALID_PRICE');
    const before=clone(row),now=Date.now();
    row.pricePerUnit=money(price); row.correctedAt=now; row.correctedBy=actor.id; row.correctedByName=String(actor?.name||actor?.id||''); row.correctedByRole=String(actor?.role||'');
    c.audit.push({id:uid('audit'),type:'PRICE_CORRECTED',entityId:row.id,entityType:'price',by:actor.id,at:now,reason:why,before,after:clone(row)});
    managerRecalculateActualPrices(state,row.id,actor,why);
    return clone(row);
  }
  function priceAt(state,materialId,brandId,at){
    const c=ensureState(state); const t=Number(at);
    const rows=c.prices.filter(x=>!x.voided&&x.materialId===materialId&&x.brandId===brandId&&x.effectiveFrom<=t).sort((a,b)=>b.effectiveFrom-a.effectiveFrom||b.createdAt-a.createdAt);
    return rows[0]?clone(rows[0]):null;
  }
  // Read-only proposal. Invoice purchase rates are not silently substituted
  // for effective-dated job costing. A Manager reviews the existing price path.
  function invoicePriceReview(state,invoice,actor){
    assertRole(actor?.role,true);
    if(!invoice?.id||invoice.status!=='posted'||!Number.isInteger(invoice.revision)||invoice.revision<1||!Array.isArray(invoice.lines)||!invoice.lines.length)throw Error('POSTED_INVOICE_REQUIRED');
    const date=String(invoice.invoice_date||''),effective=Date.parse(date+'T00:00:00+04:00');
    const omanDate=t=>new Date(Number(t)+14400000).toISOString().slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(effective)||omanDate(effective)!==date)throw Error('INVALID_INVOICE_DATE');
    const snapshot=clone(state),c=ensureState(snapshot),seen=new Set();
    return invoice.lines.map(l=>{
      const mid=l.materialId,bid=l.brandId,key=JSON.stringify([mid,bid]),rate=Number(l.unitPrice);
      if(seen.has(key)||!Number.isFinite(rate)||rate<=0||money(rate)!==rate)throw Error('INVALID_INVOICE_PRICE');
      seen.add(key);
      const m=c.materials.find(x=>x.id===mid&&x.active!==false),b=c.brands.find(x=>x.id===bid&&x.active!==false);
      const base={materialId:mid,brandId:bid,materialName:m?.name||l.materialName||mid,brandName:b?.name||l.brandName||bid,unit:l.unit,rate,date,effectiveFrom:effective,invoiceId:invoice.id,invoiceRevision:invoice.revision};
      if(!m||!b||m.unit!==l.unit)return {...base,action:'blocked',reason:'Material/brand missing or unit changed'};
      const periods=c.prices.filter(p=>!p.voided&&p.materialId===mid&&p.brandId===bid);
      if(periods.some(p=>!Number.isFinite(Number(p.effectiveFrom))))return {...base,action:'blocked',reason:'Invalid existing price history'};
      const same=periods.filter(p=>omanDate(p.effectiveFrom)===date);
      const current=priceAt(snapshot,mid,bid,effective);
      if(same.length>1)return {...base,action:'blocked',reason:'Multiple existing price periods on this date'};
      if(same.length===1&&money(same[0].pricePerUnit)===rate)return {...base,action:'unchanged',oldRate:rate,affected:0};
      if(!same.length&&current&&money(current.pricePerUnit)===rate)return {...base,action:'unchanged',oldRate:rate,affected:0};
      const action=same.length?'correct':'create',from=same.length?Number(same[0].effectiveFrom):effective;
      const next=periods.filter(p=>Number(p.effectiveFrom)>from).sort((a,b)=>Number(a.effectiveFrom)-Number(b.effectiveFrom))[0];
      const affected=c.actuals.filter(x=>!x.voided&&x.locked&&Number(x.actualAt)>=from&&(!next||Number(x.actualAt)<Number(next.effectiveFrom))&&(x.lines||[]).some(l=>l.materialId===mid&&l.brandId===bid&&money(l.unitPriceSnapshot)!==rate));
      return {...base,action,oldRate:same.length?Number(same[0].pricePerUnit):current?Number(current.pricePerUnit):null,priceId:same[0]?.id||null,affected:affected.length,jobCards:[...new Set(affected.map(x=>x.jobCard))],effectiveFrom:from};
    });
  }
  function cleanLines(state,lines){
    const c=ensureState(state); if(!Array.isArray(lines)||!lines.length)throw new Error('MATERIAL_LINES_REQUIRED');
    return lines.map((l,i)=>{
      const m=c.materials.find(x=>x.id===l.materialId&&x.active!==false),b=c.brands.find(x=>x.id===l.brandId&&x.active!==false),q=num(l.quantity);
      if(!m)throw new Error('MATERIAL_NOT_FOUND'); if(!b)throw new Error('BRAND_NOT_FOUND'); if(!(q>0))throw new Error('INVALID_QUANTITY');
      if(!availableToPainting(m))throw new Error('MATERIAL_DEPARTMENT_FORBIDDEN');
      return {no:i+1,materialId:m.id,brandId:b.id,unit:m.unit,quantity:q};
    });
  }
  function issue(state,input,actor,type=TYPES.ISSUED){
    assertRole(actor?.role); const c=ensureState(state);
    if(type!==TYPES.ISSUED&&type!==TYPES.ADDITIONAL)throw new Error('INVALID_ISSUE_TYPE');
    const jc=String(input?.jobCard||'').trim().toUpperCase(); if(!jc)throw new Error('JOB_CARD_REQUIRED');
    const rid=requestId(input); if(rid){const prior=c.issues.find(x=>x.clientRequestId===rid);if(prior)return clone(prior)}
    if(type===TYPES.ISSUED&&c.issues.some(x=>!x.voided&&x.type===TYPES.ISSUED&&x.jobCard===jc&&x.department===DEPT))throw new Error('ISSUED_ALREADY_FINISHED');
    if(c.actuals.some(x=>!x.voided&&x.jobCard===jc&&x.department===DEPT&&x.locked))throw new Error('ACTUAL_ALREADY_FINISHED');
    const row={id:uid(type),type,department:DEPT,jobCard:jc,vehicle:String(input.vehicle||''),colourCode:String(input.colourCode||''),mainPainterId:String(input.mainPainterId||''),allottedSupervisorId:String(input.allottedSupervisorId||actor.id||''),lines:cleanLines(state,input.lines),clientRequestId:rid||uid('req'),locked:true,createdAt:Date.now(),createdBy:actor.id,createdByName:String(actor?.name||actor?.id||''),createdByRole:String(actor?.role||'')};
    c.issues.push(row); return clone(row);
  }
  function allowance(state,jc){
    const c=ensureState(state),map=new Map();
    c.issues.filter(x=>!x.voided&&x.locked&&x.department===DEPT&&x.jobCard===String(jc).toUpperCase()).forEach(r=>r.lines.forEach(l=>{
      const k=l.materialId+'|'+l.brandId; const cur=map.get(k)||{materialId:l.materialId,brandId:l.brandId,unit:l.unit,quantity:0}; cur.quantity+=num(l.quantity); map.set(k,cur);
    }));
    return [...map.values()].map(x=>({...x,quantity:num(x.quantity)}));
  }
  function finishActual(state,input,actor){
    assertRole(actor?.role); const c=ensureState(state),jc=String(input?.jobCard||'').trim().toUpperCase(); if(!jc)throw new Error('JOB_CARD_REQUIRED');
    const rid=requestId(input); if(rid){const prior=c.actuals.find(x=>x.clientRequestId===rid);if(prior)return clone(prior)}
    const reopened=c.actuals.find(x=>!x.voided&&!x.locked&&x.managerReopen&&x.department===DEPT&&x.jobCard===jc);
    // Re-finalizing a previously locked financial record requires Manager approval.
    if(reopened)assertRole(actor?.role,true);
    if(c.actuals.some(x=>!x.voided&&x.department===DEPT&&x.jobCard===jc&&x!==reopened))throw new Error('ACTUAL_RECORD_EXISTS');
    const allowed=allowance(state,jc); if(!allowed.length)throw new Error('NO_ISSUED_MATERIALS');
    const actualAt=Number(input.actualAt)||Number(reopened?.actualAt)||Date.now();
    const wanted=Array.isArray(input.lines)&&input.lines.length?input.lines:allowed;
    const lines=wanted.map((l,i)=>{
      const a=allowed.find(x=>x.materialId===l.materialId&&x.brandId===l.brandId),m=c.materials.find(x=>x.id===l.materialId&&x.active!==false),b=c.brands.find(x=>x.id===l.brandId&&x.active!==false); if(!m)throw new Error('MATERIAL_NOT_FOUND'); if(!b)throw new Error('BRAND_NOT_FOUND');
      if(!availableToPainting(m))throw new Error('MATERIAL_DEPARTMENT_FORBIDDEN');
      const q=Number(l.quantity); if(!Number.isFinite(q)||q<0)throw new Error('INVALID_ACTUAL_QUANTITY');
      const p=priceAt(state,l.materialId,l.brandId,actualAt); if(!p)throw new Error('PRICE_NOT_FOUND');
      return {no:i+1,materialId:l.materialId,brandId:l.brandId,unit:m.unit,issuedQuantity:Number(a?.quantity||0),actualQuantity:q,actualOnly:!a,overIssued:!!a&&q>a.quantity+1e-9,priceId:p.id,unitPriceSnapshot:p.pricePerUnit,lineCost:money(q*p.pricePerUnit)};
    });
    const row={id:uid('actual'),department:DEPT,jobCard:jc,actualAt,lines,clientRequestId:rid||uid('req'),locked:true,totalCost:money(lines.reduce((s,l)=>s+l.lineCost,0)),createdAt:Date.now(),createdBy:actor.id,createdByName:String(actor?.name||actor?.id||''),createdByRole:String(actor?.role||'')};
    if(reopened){const before=clone(reopened),at=Date.now(),why=String(reopened.reopenReason||'Manager reopened actual');Object.assign(reopened,row,{id:reopened.id,createdAt:reopened.createdAt,createdBy:reopened.createdBy,createdByName:reopened.createdByName,createdByRole:reopened.createdByRole,refinalizedAt:at,refinalizedBy:actor.id,refinalizedByName:String(actor?.name||actor?.id||''),refinalizedByRole:String(actor?.role||''),correctedAt:at,correctedBy:actor.id,correctedByName:String(actor?.name||actor?.id||''),correctedByRole:String(actor?.role||''),correctionReason:why,managerReopen:false});auditChange(c,'ACTUAL_REFINALIZED',reopened,before,reopened,actor,why);return clone(reopened)}
    c.actuals.push(row); return clone(row);
  }
  function auditChange(c,type,entity,before,after,actor,reason){
    const why=String(reason||'').trim(); if(!why)throw new Error('REASON_REQUIRED');
    c.audit.push({id:uid('audit'),type,entityId:entity.id,entityType:entity.type||'actual',jobCard:entity.jobCard||'',by:actor.id,at:Date.now(),reason:why,before:clone(before),after:clone(after)});
  }
  function managerCorrectIssue(state,id,patch,actor,reason){
    assertRole(actor?.role); const c=ensureState(state),row=c.issues.find(x=>x.id===id&&!x.voided); if(!row)throw new Error('ISSUE_NOT_FOUND');
    if(!String(reason||'').trim())throw new Error('REASON_REQUIRED');
    const before=clone(row),next=clone(row);
    if(patch.colourCode!==undefined)next.colourCode=String(patch.colourCode||'');
    if(patch.mainPainterId!==undefined)next.mainPainterId=String(patch.mainPainterId||'');
    if(patch.allottedSupervisorId!==undefined)next.allottedSupervisorId=String(patch.allottedSupervisorId||'');
    if(patch.lines!==undefined)next.lines=cleanLines(state,patch.lines);
    next.correctedAt=Date.now(); next.correctedBy=actor.id; next.correctedByName=String(actor?.name||actor?.id||''); next.correctedByRole=String(actor?.role||''); next.correctionReason=String(reason||'').trim(); Object.assign(row,next);
    auditChange(c,'ISSUE_CORRECTED',row,before,row,actor,reason); return clone(row);
  }
  function managerCorrectActual(state,id,lines,actor,reason){
    assertRole(actor?.role,true); const c=ensureState(state),row=c.actuals.find(x=>x.id===id&&!x.voided); if(!row)throw new Error('ACTUAL_NOT_FOUND');
    if(!String(reason||'').trim())throw new Error('REASON_REQUIRED');
    const before=clone(row),allowed=allowance(state,row.jobCard);
    const nextLines=(Array.isArray(lines)?lines:[]).map((l,i)=>{
      const a=allowed.find(x=>x.materialId===l.materialId&&x.brandId===l.brandId);
      const previous=(row.lines||[]).find(x=>x.materialId===l.materialId&&x.brandId===l.brandId);
      // Corrections must retain the same flexibility as original Actual entry:
      // a finalized actual-only item or over-issued amount remains valid.
      if(!a&&!previous)throw new Error('ACTUAL_MATERIAL_NOT_FOUND');
      const q=Number(l.quantity); if(!Number.isFinite(q)||q<0)throw new Error('INVALID_ACTUAL_QUANTITY');
      const p=priceAt(state,l.materialId,l.brandId,row.actualAt); if(!p)throw new Error('PRICE_NOT_FOUND');
      const issuedQuantity=Number(a?.quantity||0);
      return {no:i+1,materialId:l.materialId,brandId:l.brandId,unit:a?.unit||previous?.unit||'',
        issuedQuantity,actualQuantity:q,actualOnly:!a,overIssued:!!a&&q>issuedQuantity+1e-9,
        priceId:p.id,unitPriceSnapshot:p.pricePerUnit,lineCost:money(q*p.pricePerUnit)};
    });
    row.lines=nextLines; row.totalCost=money(nextLines.reduce((n,l)=>n+l.lineCost,0)); row.correctedAt=Date.now(); row.correctedBy=actor.id; row.correctedByName=String(actor?.name||actor?.id||''); row.correctedByRole=String(actor?.role||''); row.correctionReason=String(reason||'').trim();
    auditChange(c,'ACTUAL_CORRECTED',row,before,row,actor,reason); return clone(row);
  }
  function managerRecalculateActualPrices(state,priceId,actor,reason){
    assertRole(actor?.role,true); const c=ensureState(state),why=String(reason||'').trim(); if(!why)throw new Error('REASON_REQUIRED');
    const price=c.prices.find(x=>x.id===priceId&&!x.voided); if(!price)throw new Error('PRICE_NOT_FOUND');
    const affected=c.actuals.filter(x=>!x.voided&&x.locked&&x.actualAt>=price.effectiveFrom&&x.lines.some(l=>l.materialId===price.materialId&&l.brandId===price.brandId));
    const changed=[]; affected.forEach(row=>{const applicable=priceAt(state,price.materialId,price.brandId,row.actualAt);if(!applicable||applicable.id!==price.id)return;const before=clone(row);let touched=false;row.lines=row.lines.map(l=>{if(l.materialId!==price.materialId||l.brandId!==price.brandId)return l;const q=num(l.actualQuantity??l.quantity);if(l.priceId===applicable.id&&num(l.unitPriceSnapshot)===num(applicable.pricePerUnit)&&num(l.lineCost)===money(q*applicable.pricePerUnit))return l;touched=true;return {...l,priceId:applicable.id,unitPriceSnapshot:applicable.pricePerUnit,lineCost:money(q*applicable.pricePerUnit)}});if(!touched)return;row.totalCost=money(row.lines.reduce((n,l)=>n+num(l.lineCost),0));row.priceRecalculatedAt=Date.now();row.priceRecalculatedBy=actor.id;row.correctedAt=row.priceRecalculatedAt;row.correctedBy=actor.id;row.correctedByName=String(actor?.name||actor?.id||'');row.correctedByRole=String(actor?.role||'');row.correctionReason=why;auditChange(c,'ACTUAL_PRICE_RECALCULATED',row,before,row,actor,why);changed.push(clone(row))});
    return changed;
  }
  function managerVoid(state,kind,id,actor,reason){
    assertRole(actor?.role,true); const c=ensureState(state),list=kind==='actual'?c.actuals:c.issues,row=list.find(x=>x.id===id&&!x.voided); if(!row)throw new Error('RECORD_NOT_FOUND');
    const why=String(reason||'').trim(); if(!why)throw new Error('REASON_REQUIRED');
    const before=clone(row); row.voided=true; row.voidedAt=Date.now(); row.voidedBy=actor.id; row.voidedByName=String(actor?.name||actor?.id||''); row.voidedByRole=String(actor?.role||''); row.voidReason=why;
    auditChange(c,kind==='actual'?'ACTUAL_VOIDED':'ISSUE_VOIDED',row,before,row,actor,why); return clone(row);
  }
  function managerReopenActual(state,id,actor,reason){
    assertRole(actor?.role,true); const c=ensureState(state),row=c.actuals.find(x=>x.id===id&&!x.voided); if(!row)throw new Error('ACTUAL_NOT_FOUND');
    const before=clone(row); const why=String(reason||'').trim(); if(!why)throw new Error('REASON_REQUIRED');
    row.locked=false; row.reopenedAt=Date.now(); row.reopenedBy=actor.id; row.reopenedByName=String(actor?.name||actor?.id||''); row.reopenedByRole=String(actor?.role||''); row.reopenReason=why; row.managerReopen=true;
    auditChange(c,'ACTUAL_REOPENED',row,before,row,actor,why); return clone(row);
  }
  function monthlyExpense(state,year,month){
    const c=ensureState(state),from=Date.UTC(year,month,1)-4*3600000,to=Date.UTC(year,month+1,1)-4*3600000;
    const rows=c.actuals.filter(x=>!x.voided&&x.locked&&x.actualAt>=from&&x.actualAt<to);
    return {jobCards:new Set(rows.map(x=>x.jobCard)).size,totalExpense:money(rows.reduce((s,x)=>s+num(x.totalCost),0)),records:rows.length};
  }
  function timeControlFingerprint(state){
    const keys=['jobs','assign','sessions','corrections','jobEdits','suggestedEdits','reworks','requests','additionalActions','lastActions','overtimeNotices','leaves','leaveAudit'];
    const out={}; for(const k of keys)out[k]=clone(state[k]===undefined?null:state[k]); return JSON.stringify(out);
  }
  return {DEPT,TYPES,UNITS,CATEGORIES,ensureState,addMaterial,addBrand,setPrice,invoicePriceReview,managerCorrectPrice,priceAt,issue,allowance,finishActual,managerCorrectIssue,managerCorrectActual,managerRecalculateActualPrices,managerVoid,managerReopenActual,monthlyExpense,timeControlFingerprint};
});
