(function(){
  'use strict';
  const FLAG='zukait_v2_shadow_events';
  function enabled(){try{return localStorage.getItem(FLAG)!=='0'}catch(_){return true}}
  function context(at){
    const actor=window.me||{};
    let deviceId='';try{deviceId=localStorage.getItem('zukait_device_id')||''}catch(_){}
    return {actorId:actor.id||'',deviceId,clientTime:new Date(at||Date.now()).toISOString(),syncState:'shadow'};
  }
  function record(type,a,at){
    if(!enabled()||!a||!window.zukaitV2?.work)return null;
    try{return window.zukaitV2.work.record(type,a,context(at))}catch(err){console.warn('V2 shadow event skipped',err);return null}
  }
  function wrap(name,typeFn){
    const original=window[name];if(typeof original!=='function'||original.__zukaitV2Shadow)return false;
    function wrapped(...args){
      const beforeSession=window.me&&typeof window.activeSession==='function'?window.activeSession(window.me.id):null;
      const beforeAssignment=beforeSession?(window.state?.assign||[]).find(a=>a.id===beforeSession.assignmentId):null;
      const result=original.apply(this,args);
      const afterSession=window.me&&typeof window.activeSession==='function'?window.activeSession(window.me.id):null;
      let a=beforeAssignment;
      if(name==='start'&&afterSession)a=(window.state?.assign||[]).find(x=>x.id===afterSession.assignmentId)||a;
      const type=typeFn({beforeSession,afterSession,assignment:a,args});
      if(type&&a)record(type,a,(afterSession?.start||beforeSession?.end||a.completedAt||Date.now()));
      return result;
    }
    wrapped.__zukaitV2Shadow=true;wrapped.__legacy=original;window[name]=wrapped;return true;
  }
  function install(){
    const T=window.zukaitV2?.work?.TYPES;if(!T)return false;
    wrap('start',({afterSession})=>afterSession?(afterSession.job==='ID001'?T.ID001_START:T.START):null);
    wrap('pause',({beforeSession})=>beforeSession&&beforeSession.end&&beforeSession.paused?T.PAUSE:null);
    wrap('finish',({beforeSession,assignment})=>assignment?.completed?(beforeSession?.job==='ID001'?T.ID001_STOP:T.FINISH):null);
    return true;
  }
  window.zukaitV2=Object.assign(window.zukaitV2||{},{shadow:{install,enabled,record}});
})();
