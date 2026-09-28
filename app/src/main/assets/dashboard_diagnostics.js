/* Local, read-only display counters. No employee or job data leaves the device. */
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
  function snapshot(){
    let version='Web';
    try{if(window.AndroidBridge?.getAppVersion)version=String(window.AndroidBridge.getAppVersion())}catch(_){}
    return {version,seconds:Math.floor((Date.now()-started)/1000),online:navigator.onLine,
      ...counters,lastRender:age(last.render),lastReplacement:age(last.replacement),
      lastVisibility:age(last.visibility),lastNetwork:age(last.network)};
  }
  function open(){
    const s=snapshot();
    const rows=[['Version',s.version],['Open for',s.seconds+' seconds'],['Network',s.online?'Online':'Offline'],
      ['Dashboard renders',s.renders],['Dashboard replacements',s.replacements],
      ['Dashboard hide/show',s.visibilityChanges],['Network changes',s.networkChanges],
      ['Last render',s.lastRender],['Last replacement',s.lastReplacement],
      ['Last hide/show',s.lastVisibility],['Last network change',s.lastNetwork]];
    const table=rows.map(([label,value])=>'<tr><th style="text-align:left">'+label+'</th><td>'+value+'</td></tr>').join('');
    openModal('<div class="section-title"><h2>Display Check</h2><button class="secondary" onclick="closeModal()">Close</button></div><p class="muted">After the dashboard blinks, open this page and send a screenshot. Counters start when the app opens.</p><table>'+table+'</table><button class="secondary" onclick="zukaitDisplayDiagnostics.open()">REFRESH COUNTERS</button>');
  }
  window.zukaitDisplayDiagnostics={open,snapshot};
})();
