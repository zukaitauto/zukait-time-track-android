/* Local, read-only Manager System Health diagnostics. No employee or job data leaves the device. */
(()=>{
  'use strict';
  const started=Date.now();
  const counters={renders:0,replacements:0,visibilityChanges:0,networkChanges:0};
  const last={render:0,replacement:0,visibility:0,network:0};
  const roots=['employeeView','supervisorView','managerView'];
  const visible=new Map();
  const original=window.render;
  if(typeof original==='function')window.render=function(...args){
    counters.renders++;last.render=Date.now();
    return original.apply(this,args);
  };
  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='childList'&&record.removedNodes.length){
        counters.replacements++;last.replacement=Date.now();
      }
      if(record.type==='attributes'){
        const hidden=record.target.classList.contains('hidden');
        if(visible.get(record.target)!==hidden){
          visible.set(record.target,hidden);
          counters.visibilityChanges++;last.visibility=Date.now();
        }
      }
    }
  });
  for(const id of roots){
    const root=document.getElementById(id);
    if(!root)continue;
    visible.set(root,root.classList.contains('hidden'));
    observer.observe(root,{childList:true,attributes:true,attributeFilter:['class']});
  }
  function networkChange(){counters.networkChanges++;last.network=Date.now()}
  window.addEventListener('online',networkChange);
  window.addEventListener('offline',networkChange);
  function age(at){return at?Math.floor((Date.now()-at)/1000)+'s ago':'none'}
  function duration(ms){
    if(ms===null||ms===undefined||!Number.isFinite(Number(ms)))return 'Not yet';
    const sec=Math.max(0,Math.floor(Number(ms)/1000));
    if(sec<60)return sec+'s ago';
    const min=Math.floor(sec/60);if(min<60)return min+'m ago';
    return Math.floor(min/60)+'h '+(min%60)+'m ago';
  }
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function cloudHealth(){
    try{
      const h=window.zukaitCloud?.syncHealth;
      return h&&typeof h==='object'?h:null;
    }catch(_){return null}
  }
  function snapshot(){
    let version='Web',versionCode='';
    try{if(window.AndroidBridge?.getAppVersion)version=String(window.AndroidBridge.getAppVersion())}catch(_){}
    try{if(window.AndroidBridge?.getAppVersionCode)versionCode=String(window.AndroidBridge.getAppVersionCode())}catch(_){}
    const cloud=cloudHealth();
    const online=navigator.onLine;
    let level='healthy',summary='All monitored systems look healthy.';
    const problems=[];
    if(!online)problems.push('Device is offline');
    if(cloud){
      if(cloud.pendingConflict)problems.push('A sync conflict is waiting');
      if(cloud.lastError)problems.push('Last sync reported an error');
      if(Number(cloud.consecutiveErrors||0)>0)problems.push('Repeated sync errors: '+Number(cloud.consecutiveErrors||0));
      if(cloud.ready===false)problems.push('Cloud sync is not ready');
      if(cloud.dirty)problems.push('Local changes are waiting to sync');
      if(online&&cloud.ready&&cloud.liveFresh===false)problems.push('Realtime status is not fresh');
    }else if(online)problems.push('Cloud health status is not available yet');
    if(problems.length){level=(online&&cloud&&!cloud.pendingConflict&&!cloud.lastError&&Number(cloud.consecutiveErrors||0)===0)?'attention':'warning';summary=problems.join(' · ')}
    return {version,versionCode,seconds:Math.floor((Date.now()-started)/1000),online,cloud,level,summary,
      ...counters,lastRender:age(last.render),lastReplacement:age(last.replacement),
      lastVisibility:age(last.visibility),lastNetwork:age(last.network)};
  }
  function statusPill(text,kind){
    const bg=kind==='ok'?'#dcfce7':kind==='warn'?'#fef3c7':'#fee2e2';
    const fg=kind==='ok'?'#166534':kind==='warn'?'#92400e':'#991b1b';
    return '<span style="display:inline-block;padding:4px 9px;border-radius:999px;font-weight:800;background:'+bg+';color:'+fg+'">'+esc(text)+'</span>';
  }
  function open(){
    const s=snapshot(),h=s.cloud;
    const overall=s.level==='healthy'?statusPill('HEALTHY','ok'):s.level==='attention'?statusPill('ATTENTION','warn'):statusPill('CHECK REQUIRED','bad');
    const syncState=!h?'Waiting':h.pendingConflict?'Conflict':h.lastError?'Error':h.pushing?'Sending':h.pulling?'Receiving':h.dirty?'Pending':h.ready?'Ready':'Starting';
    const syncKind=!h?'warn':(h.pendingConflict||h.lastError)?'bad':(h.dirty||h.pushing||h.pulling||!h.ready)?'warn':'ok';
    const realtime=!s.online?'Offline':!h?'Waiting':h.liveFresh?'Fresh':'Stale';
    const realtimeKind=!s.online?'bad':h&&h.liveFresh?'ok':'warn';
    const rows=[
      ['Overall',overall],['App version',esc(s.version)+(s.versionCode?' ('+esc(s.versionCode)+')':'')],
      ['Network',statusPill(s.online?'ONLINE':'OFFLINE',s.online?'ok':'bad')],
      ['Cloud sync',statusPill(syncState,syncKind)],
      ['Last successful sync',h?duration(h.lastSyncAgeMs):'Waiting for sync module'],
      ['Cloud revision',h&&h.revision!==undefined?esc(h.revision):'—'],
      ['Realtime status',statusPill(realtime,realtimeKind)],
      ['Realtime age',h?duration(h.liveAgeMs):'—'],
      ['Pending local changes',h?statusPill(h.dirty?'YES':'NO',h.dirty?'warn':'ok'):'—'],
      ['Pending conflict',h?statusPill(h.pendingConflict?'YES':'NO',h.pendingConflict?'bad':'ok'):'—'],
      ['Sync errors',h?esc(Number(h.consecutiveErrors||0)):'—'],
      ['Last sync error',h&&h.lastError?esc(h.lastError):'None'],
      ['Open for',esc(s.seconds)+' seconds'],
      ['Dashboard renders',esc(s.renders)],['Dashboard replacements',esc(s.replacements)],
      ['Dashboard hide/show',esc(s.visibilityChanges)],['Network changes',esc(s.networkChanges)],
      ['Last render',esc(s.lastRender)],['Last replacement',esc(s.lastReplacement)],
      ['Last hide/show',esc(s.lastVisibility)],['Last network change',esc(s.lastNetwork)]
    ];
    const table=rows.map(([label,value])=>'<tr><th style="text-align:left;white-space:nowrap">'+label+'</th><td>'+value+'</td></tr>').join('');
    openModal('<div class="section-title"><h2>System Health</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+
      '<div style="padding:12px 14px;margin:10px 0;border-radius:14px;background:rgba(148,163,184,.12)"><div style="font-size:18px;font-weight:900;margin-bottom:5px">'+overall+'</div><div class="muted">'+esc(s.summary)+'</div></div>'+
      '<p class="muted">Read-only diagnostics. This check does not change job cards, employee time, parts, consumables or cloud data.</p>'+
      '<table>'+table+'</table><button class="secondary" onclick="zukaitDisplayDiagnostics.open()">RUN HEALTH CHECK</button>');
  }
  window.zukaitDisplayDiagnostics={open,snapshot};
})();