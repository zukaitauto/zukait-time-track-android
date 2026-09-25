(function(){
  'use strict';
  function rev(v){const n=Number(v);return Number.isFinite(n)?n:0}
  function decide(local,server){
    if(!server)return {action:'KEEP_LOCAL',reason:'server-missing'};
    if(!local)return {action:'ACCEPT_SERVER',reason:'local-missing'};
    const lr=rev(local.serverRevision),sr=rev(server.serverRevision??server.revision);
    if(sr>lr)return {action:'ACCEPT_SERVER',reason:'newer-server-revision'};
    if(lr>sr&&local.syncState!=='synced')return {action:'REPLAY_LOCAL',reason:'newer-pending-local'};
    const localActive=!local.end,serverActive=!server.end;
    if(localActive!==serverActive)return {action:'CONFLICT',reason:'active-state-mismatch'};
    const lt=Number(local.end||local.start||0),st=Number(server.end||server.start||0);
    if(sr===lr&&lt&&st&&lt!==st)return {action:'CONFLICT',reason:'same-revision-time-mismatch'};
    return {action:'ACCEPT_SERVER',reason:'server-authoritative'};
  }
  function reconcile(rows,serverRows){
    const byId=new Map((serverRows||[]).map(x=>[String(x.assignmentId||x.id||''),x]));
    return (rows||[]).map(local=>({local,server:byId.get(String(local.assignmentId||local.id||''))||null,decision:decide(local,byId.get(String(local.assignmentId||local.id||''))||null)}));
  }
  window.zukaitV2=Object.assign(window.zukaitV2||{},{reconnect:{decide,reconcile}});
})();
