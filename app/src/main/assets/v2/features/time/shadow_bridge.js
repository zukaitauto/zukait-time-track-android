(function(){
  'use strict';
  const FLAG='zukait_v2_shadow_events';
  function enabled(){try{return localStorage.getItem(FLAG)!=='0'}catch(_){return true}}
  function context(a,at,eventId){
    let deviceId='';try{deviceId=localStorage.getItem('zukait_device_id')||localStorage.getItem('zukait_device_id_v42')||''}catch(_){}
    return {eventId,actorId:String(a?.emp||''),deviceId,clientTime:new Date(at||Date.now()).toISOString(),syncState:'shadow'};
  }
  function record(type,a,at,eventId){
    if(!enabled()||!a||!window.zukaitV2?.work)return null;
    try{return window.zukaitV2.work.record(type,a,context(a,at,eventId))}catch(err){console.warn('V2 shadow event skipped',err);return null}
  }
  function install(){
    if(window.__zukaitV2ShadowInstalled)return true;
    const oldStart=window.start,oldPause=window.pause,oldFinish=window.finish;
    if(typeof oldStart!=='function'||typeof oldPause!=='function'||typeof oldFinish!=='function')return false;
    window.start=function(no){
      const before=(state.sessions||[]).length,result=oldStart.apply(this,arguments);
      const s=(state.sessions||[]).length>before?(state.sessions||[]).at(-1):null;
      if(s&&!s.end){const a=(state.assign||[]).find(x=>x.id===s.assignmentId);record(s.job==='ID001'?'ID001_START':'WORK_START',a,s.start,'shadow_start_'+s.id)}
      return result;
    };
    window.pause=function(){
      const s=me&&typeof activeSession==='function'?activeSession(me.id):null;if(!s)return oldPause.apply(this,arguments);
      const sid=s.id,result=oldPause.apply(this,arguments),ended=(state.sessions||[]).find(x=>x.id===sid);
      if(ended?.end&&ended.paused){const a=(state.assign||[]).find(x=>x.id===ended.assignmentId);record('WORK_PAUSE',a,ended.end,'shadow_pause_'+sid+'_'+ended.end)}
      return result;
    };
    window.finish=function(){
      const s=me&&typeof activeSession==='function'?activeSession(me.id):null;if(!s)return oldFinish.apply(this,arguments);
      const sid=s.id,result=oldFinish.apply(this,arguments),ended=(state.sessions||[]).find(x=>x.id===sid);
      if(ended?.end&&ended.finished){const a=(state.assign||[]).find(x=>x.id===ended.assignmentId);record(ended.job==='ID001'?'ID001_STOP':'WORK_FINISH',a,ended.end,'shadow_finish_'+sid+'_'+ended.end)}
      return result;
    };
    window.__zukaitV2ShadowInstalled=true;return true;
  }
  window.zukaitV2=Object.assign(window.zukaitV2||{},{shadow:{install,enabled,record}});
})();
