(function(){
 const V2=window.zukaitV2=window.zukaitV2||{}, leave=V2.leave=V2.leave||{};
 const dayStart=k=>{const p=String(k||'').split('-').map(Number);return p.length===3?new Date(p[0],p[1]-1,p[2]).getTime():NaN};
 // Global leave authority: every module reads the same canonical state collection.
 leave.rows=function(){const s=window.state||{};s.leaves=Array.isArray(s.leaves)?s.leaves:[];return s.leaves};
 leave.active=function(){return leave.rows().filter(l=>l&&!l.cancelled)};
 leave.forEmployee=function(emp){return leave.active().filter(l=>String(l.emp)===String(emp))};
 leave.forDate=function(date){return leave.active().filter(l=>String(l.date||'')===String(date||''))};
 leave.history=function(){return leave.active().slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0))};
 leave.baseSegments=function(l){const d=dayStart(l&&l.date);if(!Number.isFinite(d))return[];if(l.period==='AM')return[[d+8*3600000,d+13*3600000]];if(l.period==='PM')return[[d+15*3600000,d+19*3600000]];if(l.period==='FULL')return[[d+8*3600000,d+13*3600000],[d+15*3600000,d+19*3600000]];return[]};
 // A remaining-day leave clips the selected duty period at an exact timestamp.
 leave.segments=function(l){const xs=leave.baseSegments(l);if(l?.startAt==null)return xs;const t=Number(l.startAt);if(!Number.isFinite(t))return[];return xs.map(([a,b])=>[Math.max(a,t),b]).filter(([a,b])=>b>a)};
 leave.label=function(l){if(l?.startAt!=null)return 'Remaining '+(l.period==='AM'?'Morning':l.period==='PM'?'Afternoon':'Day')+' — from '+new Date(Number(l.startAt)).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',hour12:true});return l?.period==='AM'?'Morning Half Day':l?.period==='PM'?'Afternoon Half Day':'Full Day'};
 leave.days=function(l){return l?.startAt!=null?leave.segments(l).reduce((n,[a,b])=>n+(b-a)/60000,0)/540:(l?.period==='FULL'?1:.5)};
 leave.afterWork=function(input,ctx={}){
  const l={...input},base=leave.baseSegments(l),sessions=(ctx.sessions||[]).filter(s=>s&&String(s.emp)===String(l.emp));
  if(!base.length)return{ok:false,code:'BAD_DATE'};
  const overlap=s=>base.some(([a,b])=>Math.min(Number(s.end||ctx.now||Date.now()),b)>Math.max(Number(s.start||0),a));
  if(sessions.some(s=>!s.end&&overlap(s)))return{ok:false,code:'ACTIVE_WORK'};
  const ends=sessions.filter(overlap).map(s=>Number(s.end)).filter(Number.isFinite);
  if(ends.length){const last=Math.max(...ends);l.startAt=Math.max(Number(l.startAt||0),last);l.afterWork=true;}
  if(!leave.segments(l).length)return{ok:false,code:'NO_REMAINING_DUTY'};
  return{ok:true,leave:l};
 };
 leave.canManage=function(actor,target,targetRole){if(!actor||!target)return false;if(String(actor.id)===String(target))return true;if(actor.role==='Manager')return targetRole==='Employee'||targetRole==='Supervisor';if(actor.role==='Supervisor')return targetRole==='Employee';return false};
 leave.overlapMinutes=function(leaves,emp,from,to){return (leaves||[]).filter(l=>l&&!l.cancelled&&String(l.emp)===String(emp)).reduce((sum,l)=>sum+leave.segments(l).reduce((n,[a,b])=>n+Math.max(0,Math.min(to,b)-Math.max(from,a))/60000,0),0)};
 leave.isOnLeave=function(leaves,emp,ts){return (leaves||[]).some(l=>l&&!l.cancelled&&String(l.emp)===String(emp)&&leave.segments(l).some(([a,b])=>ts>=a&&ts<b))};
 leave.validate=function(input,ctx){const l=input||{},c=ctx||{};if(!l.emp||!l.date||!['FULL','AM','PM'].includes(l.period))return{ok:false,code:'BAD_LEAVE'};if(c.closedDay===true)return{ok:false,code:'CLOSED_DAY'};const seg=leave.segments(l);if(!seg.length)return{ok:false,code:'BAD_DATE'};if((c.sessions||[]).some(s=>s&&String(s.emp)===String(l.emp)&&seg.some(([a,b])=>Math.min(s.end||c.now||Date.now(),b)>Math.max(s.start||0,a))))return{ok:false,code:'WORK_CONFLICT'};if((c.leaves||[]).some(x=>x&&!x.cancelled&&String(x.emp)===String(l.emp)&&x.date===l.date&&(x.period==='FULL'||l.period==='FULL'||x.period===l.period)))return{ok:false,code:'DUPLICATE'};return{ok:true}};
 leave.build=function(input,meta){const x=input||{},m=meta||{},v=leave.validate(x,m);if(!v.ok)return v;const at=Number(m.at||Date.now()),id=String(m.id||('leave-'+at));return{ok:true,leave:{id,emp:String(x.emp),date:String(x.date),period:x.period,remark:String(x.remark||''),by:String(m.actorId||''),createdAt:at,cancelled:false,...(x.startAt!=null?{startAt:Number(x.startAt),afterWork:!!x.afterWork}:{})},audit:{id:String(m.auditId||('leave-audit-'+at)),action:'ADD',leaveId:id,by:String(m.actorId||''),at}}};
 leave.cancel=function(record,meta){if(!record)return{ok:false,code:'NOT_FOUND'};const m=meta||{},at=Number(m.at||Date.now());return{ok:true,leave:Object.assign({},record,{cancelled:true,cancelledBy:String(m.actorId||''),cancelledAt:at}),audit:{id:String(m.auditId||('leave-audit-'+at)),action:'CANCEL',leaveId:String(record.id),by:String(m.actorId||''),at}}};
})();
