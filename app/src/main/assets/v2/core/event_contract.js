(function(){
  'use strict';
  const NS='zukaitV2';
  function id(prefix='evt'){
    if(globalThis.crypto&&crypto.randomUUID)return prefix+'_'+crypto.randomUUID();
    return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
  }
  function envelope(type,entityId,payload,context={}){
    if(!type)throw new Error('event type required');
    return Object.freeze({
      schemaVersion:1,
      eventId:context.eventId||id(),
      type:String(type),
      entityId:String(entityId||''),
      actorId:String(context.actorId||''),
      deviceId:String(context.deviceId||''),
      clientTime:context.clientTime||new Date().toISOString(),
      serverTime:context.serverTime||null,
      serverRevision:context.serverRevision??null,
      syncState:context.syncState||'pending',
      payload:payload&&typeof payload==='object'?structuredCloneSafe(payload):{}
    });
  }
  function structuredCloneSafe(value){
    try{return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value))}
    catch(_){return JSON.parse(JSON.stringify(value||{}))}
  }
  function dedupe(events){
    const seen=new Set(),out=[];
    for(const e of events||[]){if(!e?.eventId||seen.has(e.eventId))continue;seen.add(e.eventId);out.push(e)}
    return out;
  }
  window[NS]=Object.assign(window[NS]||{},{event:{id,envelope,dedupe}});
})();
