(function(){
  'use strict';
  const TYPE={START:'WORK_START',PAUSE:'WORK_PAUSE',FINISH:'WORK_FINISH',ID001_START:'ID001_START',ID001_STOP:'ID001_STOP'};
  function normTime(v){const n=Date.parse(v);return Number.isFinite(n)?n:null}
  function expected(action){
    const hold=String(action.job||'')==='ID001';
    const raw=String(action.type||'').toUpperCase();
    if(raw==='START')return hold?TYPE.ID001_START:TYPE.START;
    if(raw==='PAUSE')return TYPE.PAUSE;
    if(raw==='FINISH'||raw==='STOP_ID001')return hold?TYPE.ID001_STOP:TYPE.FINISH;
    return null;
  }
  function compare(action,event,toleranceMs=1000){
    const issues=[],want=expected(action);
    if(!want)issues.push('unsupported-action');
    else if(event?.type!==want)issues.push('type');
    if(String(event?.entityId||'')!==String(action.assignmentId||''))issues.push('assignment');
    if(String(event?.payload?.employeeId||'')!==String(action.emp||action.employeeId||''))issues.push('employee');
    if(String(event?.payload?.job||'')!==String(action.job||''))issues.push('job');
    const a=Number(action.at??action.time??0),e=normTime(event?.clientTime);
    if(a&&(!e||Math.abs(a-e)>toleranceMs))issues.push('timestamp');
    return {ok:issues.length===0,issues};
  }
  function audit(actions,events){
    const ev=events||window.zukaitV2?.queue?.read?.()||[];
    return (actions||[]).map(action=>{
      const candidates=ev.filter(e=>String(e.entityId||'')===String(action.assignmentId||'')&&e.type===expected(action));
      const match=candidates.find(e=>compare(action,e).ok)||null;
      return {action,match,comparison:match?compare(action,match):{ok:false,issues:['missing-event']}};
    });
  }
  window.zukaitV2=Object.assign(window.zukaitV2||{},{parity:{expected,compare,audit}});
})();
