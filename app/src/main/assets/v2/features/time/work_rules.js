(function(){
  'use strict';
  const HOLD='ID001';
  const OMAN_TZ='Asia/Muscat';
  function omanParts(ts=Date.now()){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:OMAN_TZ,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ts));
    const out={};for(const p of parts)if(p.type!=='literal')out[p.type]=p.value;return out;
  }
  function omanDateKey(ts=Date.now()){const p=omanParts(ts);return p.year+'-'+p.month+'-'+p.day}
  function isFriday(ts=Date.now()){return omanParts(ts).weekday==='Fri'}
  function minuteOfDay(ts=Date.now()){const p=omanParts(ts);return Number(p.hour||0)*60+Number(p.minute||0)}
  function inDuty(ts=Date.now()){const m=minuteOfDay(ts);return (m>=480&&m<780)||(m>=900&&m<1140)}
  function publicHoliday(state,ts=Date.now()){
    const key=omanDateKey(ts);
    return (state?.holidays||state?.publicHolidays||[]).some(h=>String(h?.date||h).slice(0,10)===key);
  }
  function onLeave(state,emp,ts=Date.now()){
    if(window.zukaitV2?.leave)return window.zukaitV2.leave.isOnLeave(state?.leaves||state?.leave||[],emp,ts);
    const key=omanDateKey(ts);
    return (state?.leaves||state?.leave||[]).some(x=>String(x?.emp||x?.employeeId||'')===String(emp)&&String(x?.date||'').slice(0,10)===key&&!x.cancelled);
  }
  function activeSession(state,emp){return (state?.sessions||[]).find(s=>String(s.emp)===String(emp)&&!s.end)||null}
  function validate(type,assignment,state,ctx={}){
    const issues=[],ts=ctx.at||Date.now(),emp=assignment?.emp||ctx.employeeId,job=assignment?.job||ctx.job;
    if(!assignment||assignment.cancelled)issues.push('assignment-unavailable');
    if(type==='WORK_START'||type==='WORK_RESUME'||type==='ID001_START'){
      const active=activeSession(state,emp);
      if(active)issues.push('employee-already-active');
      if(type==='WORK_RESUME'){
        const prior=(state?.sessions||[]).filter(s=>String(s.emp)===String(emp)&&String(s.assignmentId||'')===String(assignment?.id||'')&&s.paused&&s.end).sort((a,b)=>Number(b.end||0)-Number(a.end||0))[0];
        if(!prior)issues.push('resume-requires-paused-session');
      }
      if(onLeave(state,emp,ts))issues.push('employee-on-leave');
      if(job===HOLD&&(isFriday(ts)||publicHoliday(state,ts)||!inDuty(ts)))issues.push('id001-outside-duty');
    }
    if(type==='WORK_PAUSE'&&job===HOLD)issues.push('id001-pause-not-allowed');
    if((type==='WORK_PAUSE'||type==='WORK_FINISH'||type==='ID001_STOP')&&!activeSession(state,emp))issues.push('active-session-required');
    if(type==='ID001_START'&&job!==HOLD)issues.push('id001-job-required');
    if(type==='WORK_START'&&job===HOLD)issues.push('use-id001-start');
    return {ok:issues.length===0,issues};
  }
  window.zukaitV2=Object.assign(window.zukaitV2||{},{rules:{isFriday,inDuty,publicHoliday,onLeave,activeSession,validate}});
})();
