(function(){
'use strict';
const DAY=86400000,MIN=60000,DUTY=[[480,780],[900,1140]];
function num(v){v=Number(v);return Number.isFinite(v)?v:0}
function id(v){return String(v==null?'':v)}
function localParts(ts){const d=new Date(num(ts));return {y:d.getFullYear(),m:d.getMonth(),day:d.getDate(),dow:d.getDay(),minute:d.getHours()*60+d.getMinutes()}}
function dayStart(ts){const d=new Date(num(ts));d.setHours(0,0,0,0);return d.getTime()}
function dateKey(ts){const d=new Date(num(ts)),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())}
function holiday(state,ts){const key=dateKey(ts);return (state?.holidays||state?.publicHolidays||[]).some(h=>String(h?.date||h).slice(0,10)===key)}
function leave(state,emp,ts){const key=dateKey(ts);return (state?.leave||state?.leaves||[]).some(x=>id(x?.emp||x?.employeeId)===id(emp)&&String(x?.date||'').slice(0,10)===key&&!x.cancelled)}
function monthBounds(year,month){const start=new Date(year,month,1).getTime(),end=new Date(year,month+1,1).getTime();return {start,end}}
function currentMonthBounds(ts=Date.now()){const d=new Date(ts);return monthBounds(d.getFullYear(),d.getMonth())}
function eligibleSegments(start,end,state,emp,options={}){
 start=num(start);end=num(end);if(!(end>start))return [];
 const out=[];let cursor=dayStart(start),guard=0;
 while(cursor<end&&guard++<370){
  const p=localParts(cursor);
  if(p.dow!==5&&!holiday(state,cursor)&&(!options.excludeLeave||!leave(state,emp,cursor))){
   for(const [a,b] of DUTY){const s=Math.max(start,cursor+a*MIN),e=Math.min(end,cursor+b*MIN);if(e>s)out.push({start:s,end:e,minutes:(e-s)/MIN})}
  }
  const d=new Date(cursor);d.setDate(d.getDate()+1);cursor=d.getTime();
 }
 return out;
}
function eligibleMinutes(session,state,bounds,now=Date.now(),options={}){
 if(!session||id(session.job).toUpperCase()==='ID001')return 0;
 const start=Math.max(num(session.start),num(bounds?.start)||-Infinity);
 const rawEnd=session.end==null?now:num(session.end),end=Math.min(rawEnd,num(bounds?.end)||Infinity);
 return eligibleSegments(start,end,state,session.emp,options).reduce((n,x)=>n+x.minutes,0);
}
function assignmentSuggested(a){return Math.max(0,num(a?.suggestedMinutes??a?.suggested??a?.mins))}
function assignmentKey(a){return id(a?.id||[a?.job,a?.emp,a?.createdAt||a?.created||''].join('|'))}
function sessionAssignmentKey(s){return id(s?.assignmentId||s?.assignment||'')}
function sessionMatchesAssignment(s,a){const sk=sessionAssignmentKey(s);return sk?sk===id(a?.id):id(s?.job)===id(a?.job)&&id(s?.emp)===id(a?.emp)}
function summarize(state,bounds=currentMonthBounds(),options={}){
 const now=num(options.now)||Date.now(),assign=(state?.assign||state?.assignments||[]).filter(a=>a&&!a.cancelled&&id(a.job).toUpperCase()!=='ID001'),sessions=(state?.sessions||[]).filter(s=>s&&id(s.job).toUpperCase()!=='ID001');
 const rows=[],byAssignment=new Map();
 for(const a of assign){
  const key=assignmentKey(a),suggested=assignmentSuggested(a);
  const all=sessions.filter(s=>sessionMatchesAssignment(s,a)).sort((x,y)=>num(x.start)-num(y.start));
  let before=0,current=0;
  for(const s of all){
   before+=eligibleMinutes(s,state,{start:-Infinity,end:bounds.start},now,options);
   current+=eligibleMinutes(s,state,bounds,now,options);
  }
  const remainingAtStart=Math.max(0,suggested-before);
  const completed=!!(a.completed||a.finished||a.status==='Completed'||a.status==='Finished');
  const completionTs=num(a.completedAt||a.finishedAt||a.finishAt);
  // Only grant the full remaining suggested balance when completion is known to
  // belong to this reporting period. Missing legacy completion timestamps are
  // treated conservatively as unfinished for month-specific credit.
  const completedInPeriod=completed&&completionTs>=bounds.start&&completionTs<bounds.end;
  const suggestedCredit=completedInPeriod?remainingAtStart:Math.min(remainingAtStart,current);
  const row={assignmentId:id(a.id),job:id(a.job),employeeId:id(a.emp),department:id(a.department||a.workType||a.section||''),suggestedMinutes:suggestedCredit,actualMinutes:current,remainingSuggestedMinutes:Math.max(0,remainingAtStart-suggestedCredit),efficiency:current>0?suggestedCredit/current*100:(suggestedCredit===0?null:null),completedInPeriod,carryForward:before>0,overrunMinutes:Math.max(0,current-remainingAtStart),repeat:!!(a.rework||a.repeat)};
  rows.push(row);byAssignment.set(key,row);
 }
 // Preserve productive actual time even if an old/imported session has no assignment row.
 for(const s of sessions){
  if(assign.some(a=>sessionMatchesAssignment(s,a)))continue;
  const actual=eligibleMinutes(s,state,bounds,now,options);if(actual<=0)continue;
  rows.push({assignmentId:sessionAssignmentKey(s),job:id(s.job),employeeId:id(s.emp),department:id(s.department||s.workType||''),suggestedMinutes:0,actualMinutes:actual,remainingSuggestedMinutes:0,efficiency:0,completedInPeriod:false,carryForward:false,overrunMinutes:actual,repeat:!!s.repeat,orphanSession:true});
 }
 return aggregate(rows);
}
function aggregate(rows){
 const suggestedMinutes=rows.reduce((n,r)=>n+num(r.suggestedMinutes),0),actualMinutes=rows.reduce((n,r)=>n+num(r.actualMinutes),0);
 return {suggestedMinutes,actualMinutes,efficiency:actualMinutes>0?suggestedMinutes/actualMinutes*100:null,rows};
}
function group(summary,key){
 const m=new Map();for(const r of summary?.rows||[]){const k=id(typeof key==='function'?key(r):r[key])||'Unassigned';if(!m.has(k))m.set(k,[]);m.get(k).push(r)}
 return [...m].map(([name,rows])=>({name,...aggregate(rows)}));
}
function formatPercent(v){return Number.isFinite(Number(v))?Number(v).toFixed(2)+'%':'—'}
function selfTest(){
 const at=(y,m,d,h,min=0)=>new Date(y,m,d,h,min,0,0).getTime(),state={holidays:[],sessions:[],assign:[]};
 const bounds=monthBounds(2026,9),session=(start,end)=>({job:'JC',emp:'E1',start,end});
 const tests=[
  ['normal-window',eligibleMinutes(session(at(2026,9,1,8),at(2026,9,1,13)),state,bounds),300],
  ['lunch-clipped',eligibleMinutes(session(at(2026,9,1,12),at(2026,9,1,16)),state,bounds),120],
  ['overtime-clipped',eligibleMinutes(session(at(2026,9,1,18),at(2026,9,1,20)),state,bounds),60],
  ['friday-excluded',eligibleMinutes(session(at(2026,9,2,8),at(2026,9,2,12)),state,bounds),0]
 ];
 const holidayState={holidays:[{date:'2026-10-03'}]};
 tests.push(['holiday-excluded',eligibleMinutes(session(at(2026,9,3,8),at(2026,9,3,12)),holidayState,bounds),0]);
 return {ok:tests.every(x=>Math.abs(x[1]-x[2])<0.001),tests:tests.map(([name,actual,expected])=>({name,actual,expected,ok:Math.abs(actual-expected)<0.001}))};
}
window.zukaitV2=Object.assign(window.zukaitV2||{},{efficiency:{DUTY,monthBounds,currentMonthBounds,eligibleSegments,eligibleMinutes,summarize,aggregate,group,formatPercent,selfTest}});
})();