// Read-only port of labour_history.js periods; parity-tested against that source.
const key=v=>String(v??'').trim().toUpperCase();
export function mechanicalPeriods(st,no,emp,now=Date.now(),context={}){
 const rows=[],seen=new Set();let invalid=0;
 for(const s of st.sessions||[]){
  if(!s||String(s.emp)!==String(emp)||s.cancelled||s.voided||s.deleted)continue;
  if(s.preliminaryLinkedJob?key(s.preliminaryLinkedJob)!==key(no):key(s.job)!==key(no))continue;
  if(s.preliminaryLinkedJob&&!s.end)continue;
  if(context.assignmentId){
   if(s.preliminaryLinkedJob)continue;
   if(s.assignmentId?String(s.assignmentId)!==String(context.assignmentId):(st.assign||[]).filter(a=>a&&!a.cancelled&&key(a.job)===key(no)&&String(a.emp)===String(emp)).length!==1)continue;
  }
  const assignment=(st.assign||[]).find(a=>s.assignmentId&&String(a.id)===String(s.assignmentId));
  if(assignment?.cancelled)continue;
  if(s.id){if(seen.has(String(s.id)))continue;seen.add(String(s.id));}
  const start=Number(s.start),ended=s.end!==null&&s.end!==undefined&&s.end!=='',end=ended?Number(s.end):now;
  if(!Number.isFinite(start)||start<=0||!Number.isFinite(end)||end<start||end>now||start>now){invalid++;continue;}
  let cursor=start;
  const pauses=(Array.isArray(s.pauses)?s.pauses:[]).map(p=>({start:Number(p.start||p.pause),end:Number(p.end||p.resume)})).sort((a,b)=>a.start-b.start);
  const push=(a,b,status)=>{if(b>a)rows.push({start:a,end:b,status,reason:String(s.pauseReason||''),preliminary:!!s.preliminaryLinkedJob,rework:!!s.rework,integrity:!!(s.recoveryClosed||s.reconciledStaleOpen)});};
  for(const p of pauses){
   if(!Number.isFinite(p.start)||p.start<start||p.start>end){invalid++;continue;}
   if(cursor!==null&&p.start>=cursor)push(cursor,p.start,'Paused');
   if(p.end>p.start&&p.end<=end)cursor=Math.max(cursor??start,p.end);else if(!p.end)cursor=null;else{invalid++;cursor=null;}
  }
  if(cursor!==null)push(cursor,end,ended?(s.paused?'Paused':s.finished?'Finished':'Ended'):'Running');
 }
 rows.sort((a,b)=>a.start-b.start);
 return {rows,totalMs:rows.reduce((n,r)=>n+r.end-r.start,0),invalid};
}
