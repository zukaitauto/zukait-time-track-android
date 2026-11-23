(function(){
  'use strict';
  function rev(v){const n=Number(v);return Number.isFinite(n)?n:0}
  function resolve(localEvent,server){
    if(!localEvent)return {decision:'server',reason:'no-local-event'};
    if(!server)return {decision:'local-pending',reason:'no-server-state'};
    const lr=rev(localEvent.serverRevision),sr=rev(server.revision??server.serverRevision);
    if(sr>lr)return {decision:'server',reason:'newer-server-revision'};
    if(localEvent.eventId&&server.lastEventId===localEvent.eventId)return {decision:'ack',reason:'same-event'};
    const lt=Date.parse(localEvent.clientTime||0)||0,st=Date.parse(server.updatedAt||server.serverTime||0)||0;
    if(sr===lr&&st>lt)return {decision:'server',reason:'server-newer-at-same-revision'};
    return {decision:'local-pending',reason:'await-server-ack'};
  }
  function reconcile(events,serverByEmployee){
    return (events||[]).filter(e=>e&&e.syncState!=='synced').map(e=>{
      const emp=e.payload?.employeeId||'';
      return {eventId:e.eventId,employeeId:emp,...resolve(e,serverByEmployee?.[emp])};
    });
  }
  window.zukaitV2=Object.assign(window.zukaitV2||{},{conflict:{resolve,reconcile}});
})();
