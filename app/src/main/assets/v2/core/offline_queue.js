(function(){
  'use strict';
  const KEY='zukait_v2_event_queue_v1';
  function read(){try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch(_){return []}}
  function write(rows){localStorage.setItem(KEY,JSON.stringify(rows||[]));return rows}
  function enqueue(event){
    if(!event?.eventId)throw new Error('eventId required');
    const rows=read();
    if(rows.some(x=>x.eventId===event.eventId))return event;
    rows.push(Object.assign({},event,{syncState:event.syncState||'pending'}));write(rows);return event;
  }
  function pending(){return read().filter(x=>x.syncState!=='synced')}
  function markSynced(eventId,server={}){
    const rows=read().map(x=>x.eventId===eventId?Object.assign({},x,{syncState:'synced',serverTime:server.serverTime||x.serverTime||new Date().toISOString(),serverRevision:server.serverRevision??x.serverRevision}):x);
    write(rows);return rows.find(x=>x.eventId===eventId)||null;
  }
  function compact(maxSynced=200){
    const rows=read(),synced=rows.filter(x=>x.syncState==='synced'),open=rows.filter(x=>x.syncState!=='synced');
    return write(open.concat(synced.slice(-Math.max(0,maxSynced))));
  }
  window.zukaitV2=Object.assign(window.zukaitV2||{},{queue:{read,enqueue,pending,markSynced,compact}});
})();
