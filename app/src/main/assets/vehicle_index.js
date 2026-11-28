/* Catalogue-only foundation. Deliberately not loaded by production hosts yet. */
(function(root){
 'use strict';
 const key=value=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g,' ');
 const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=160;
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
 function validate(input){
  const data=JSON.parse(JSON.stringify(input));
  if(data.schemaVersion!==1||!Number.isSafeInteger(data.version)||data.version<1||!Array.isArray(data.makes)||!Array.isArray(data.models)||!Array.isArray(data.aliases)||!Array.isArray(data.sources))throw Error('invalid_catalogue');
  const sources=new Set(),ids=new Set(),makes=new Map(),models=new Map(),names=new Set();
  for(const s of data.sources){
   if(!text(s.id)||sources.has(s.id)||!['CC0-1.0','US-PUBLIC-DOMAIN','INTERNAL-MANAGER','FACTUAL-NAMES'].includes(s.license)||!/^https:\/\//.test(s.url)||!/^\d{4}-\d{2}-\d{2}$/.test(s.retrievedAt))throw Error('invalid_source');
   if(s.license==='INTERNAL-MANAGER'&&(s.id!=='zukait-manager-approval'||s.url!=='https://zukaitauto.github.io/zukait-time-track-android/'))throw Error('invalid_internal_source');
   if(s.license==='FACTUAL-NAMES'&&(!s.id.startsWith('oman-names-')||!/^https:\/\//.test(s.url)))throw Error('invalid_name_source');
   sources.add(s.id);
  }
  function row(r,type){
   if(!text(r.id)||ids.has(r.id)||!text(r.name)||!sources.has(r.sourceId)||!text(r.sourceRecord))throw Error('invalid_'+type);
   if(data.sources.find(s=>s.id===r.sourceId)?.license==='INTERNAL-MANAGER'&&(!r.id.startsWith('local:')||!text(r.approvedBy)||!text(r.approvedAt)||!text(r.sourceRecord)||!r.sourceRecord.startsWith('approval:')))throw Error('invalid_internal_approval');
   const origin=data.sources.find(s=>s.id===r.sourceId);
   if(origin?.license==='FACTUAL-NAMES'&&(r.sourceRecord!==origin.url||!(r.id.startsWith('make:oman:')||r.id.startsWith('series:oman:'))))throw Error('invalid_name_provenance');
   ids.add(r.id);
  }
  for(const m of data.makes){row(m,'make');if(m.searchTerms!==undefined&&(!Array.isArray(m.searchTerms)||m.searchTerms.length>12||m.searchTerms.some(x=>!text(x))))throw Error('invalid_make_search_terms');const name=key(m.name);if(names.has(name))throw Error('duplicate_make');names.add(name);makes.set(m.id,m)}
  names.clear();
  for(const m of data.models){
   row(m,'model');if(!makes.has(m.makeId))throw Error('unknown_make');
   const name=m.makeId+'\n'+key(m.name);if(names.has(name))throw Error('duplicate_model');names.add(name);models.set(m.id,m);
  }
  names.clear();
  for(const a of data.aliases){
   const target=a.kind==='make'?makes.get(a.targetId):a.kind==='model'?models.get(a.targetId):null;
   if(!target||!text(a.value)||a.status!=='APPROVED'||!text(a.approvedBy)||!text(a.approvedAt))throw Error('unapproved_alias');
   const scope=a.kind==='make'?'make':target.makeId;
   const name=scope+'\n'+key(a.value);
   if(names.has(name))throw Error('duplicate_alias');names.add(name);
   const canonical=a.kind==='make'?[...makes.values()]:[...models.values()].filter(m=>m.makeId===target.makeId);
   if(canonical.some(m=>key(m.name)===key(a.value)))throw Error('alias_shadows_name');
  }
  return freeze(data);
 }
 function create(input){
  const data=validate(input);
  function search(kind,query,makeId,limit=20){
   const q=key(query);if(!q)return [];
   const size=Number.isInteger(limit)?Math.max(1,Math.min(limit,100)):20;
   const rows=kind==='make'?data.makes:data.models.filter(m=>m.makeId===makeId);
   return rows.map(r=>{
    const aliases=data.aliases.filter(a=>a.kind===kind&&a.targetId===r.id);
    const terms=[r.name,...(kind==='make'?r.searchTerms||[]:[]),...aliases.map(a=>a.value)].map(key);
    const compact=s=>s.replace(/[\s\-]+/g,'');
    const modelCodeMatch=kind==='model'&&/^[a-z]+[\s\-]*\d+[a-z0-9]*$/i.test(q)&&terms.some(t=>compact(t)===compact(q));
    const rank=terms.includes(q)||modelCodeMatch?0:terms.some(t=>t.startsWith(q))?1:terms.some(t=>t.includes(q))?2:3;
    return {r,rank};
   }).filter(x=>x.rank<3).sort((a,b)=>a.rank-b.rank||a.r.name.localeCompare(b.r.name,'en')||a.r.id.localeCompare(b.r.id)).slice(0,size).map(x=>x.r);
  }
  function resolve(make,model){
   const mk=data.makes.find(m=>key(m.name)===key(make))||data.makes.find(m=>data.aliases.some(a=>a.kind==='make'&&a.targetId===m.id&&key(a.value)===key(make)));
   const md=mk&&(data.models.find(m=>m.makeId===mk.id&&key(m.name)===key(model))||data.models.find(m=>m.makeId===mk.id&&data.aliases.some(a=>a.kind==='model'&&a.targetId===m.id&&key(a.value)===key(model))));
   // Unknown text is preserved for a future server-authorized review queue.
   return md?{status:'MATCH',makeId:mk.id,modelId:md.id,make:mk.name,model:md.name}:{status:'REVIEW_REQUIRED',enteredMake:String(make??''),enteredModel:String(model??'')};
  }
  return Object.freeze({version:data.version,searchMakes:(q,n)=>search('make',q,null,n),searchModels:(id,q,n)=>search('model',q,id,n),resolve});
 }
 function load(bundled,storage){
  const fallback=validate(bundled),cacheKey='zukait.vehicleCatalogue.v1';let selected=fallback;
  try{const raw=storage?.getItem(cacheKey);if(raw){const cached=validate(JSON.parse(raw));if(cached.version===fallback.version&&JSON.stringify(cached)===JSON.stringify(fallback))selected=cached}}catch(_){}
  // Only the reviewed bundled version is trusted; local data cannot approve aliases.
  try{storage?.setItem(cacheKey,JSON.stringify(selected))}catch(_){}
  return create(selected);
 }
 const api=Object.freeze({validate,create,load});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.zukaitVehicleIndex=api;
})(typeof window!=='undefined'?window:globalThis);
