(function(){
  'use strict';
  const HOLD='ID001';
  function isFriday(ts=Date.now()){return new Date(ts).getDay()===5}
  function minuteOfDay(ts=Date.now()){const d=new Date(ts);return d.getHours()*60+d.getMinutes()}
  function inDuty(ts=Date.now()){const m=minuteOfDay(ts);return (m>=480&&m<780)||(m>=900&&m<1140)}
  function publicHoliday(state,ts=Date.now()){
    const key=new Date(ts).toISOString().slice(0,10);
    return (state?.holidays||state?.publicHolidays||[]).some(h=>String(h?.date||h).slice(0,10)===key);
  }
  function onLeave(state,emp,ts=Date.now()){
    const key=new Date(ts).toISOString().slice(0,10);
    return (state?.leave||state?.leaves||[]).some(x=>String(x?.emp||x?.employeeId||'')===String(emp)&&String(x?.date||'').slice(0,10)===key&&!x.cancelled);
  }
  function activeSession(state,emp){return (state?.sessions||[]).find(s=>String(s.emp)===String(emp)&&!s.end)||null}
  function validate(type,assignment,state,ctx={}){
    const issues=[],ts=ctx.at||Date.now(),emp=assignment?.emp||ctx.employeeId,job=assignment?.job||ctx.job;
    if(!assignment||assignment.cancelled)issues.push('assignment-unavailable');
    if(type==='WORK_START'||type==='WORK_RESUME'||type==='ID001_START'){
      if(activeSession(state,emp))issues.push('employee-already-active');
      if(onLeave(state,emp,ts))issues.push('employee-on-leave');
      if(job===HOLD&&(isFriday(ts)||publicHoliday(state,ts)||!inDuty(ts)))issues.push('id001-outside-duty');
    }
    if(type==='WORK_PAUSE'&&job===HOLD)issues.push('id001-pause-not-allowed');
    return {ok:issues.length===0,issues};
  }
  window.zukaitV2=Object.assign(window.zukaitV2||{},{rules:{isFriday,inDuty,publicHoliday,onLeave,activeSession,validate}});
})();
