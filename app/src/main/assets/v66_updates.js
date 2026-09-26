(function(){
'use strict';
const HOLD='ID001';
const AGE_DAYS=4;
const PAUSE_ALERT_HOURS=4;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const person=id=>{try{return user(id)||{id,name:id,department:''}}catch(_){return{id,name:id,department:''}}};
const jinfo=no=>{try{return job(no)||{no,vehicle:'',reg:''}}catch(_){return{no,vehicle:'',reg:''}}};
const status=a=>{try{return empStatus(a)}catch(_){return a?.completed?'Finished':'New'}};
const fmtSafe=m=>{try{return fmt(Math.max(0,Number(m)||0))}catch(_){return Math.round(Number(m)||0)+'m'}};
const startDay=ts=>{const d=new Date(ts);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()};

function assignmentCandidates(jobNo,emp,rework){
 return (state.assign||[]).filter(a=>a&&!a.cancelled&&a.job===jobNo&&a.emp===emp&&!!a.rework===!!rework);
}
function migrateSessionAssignmentIds(){
 let changed=false;
 for(const s of (state.sessions||[])){
   if(s.assignmentId)continue;
   const list=assignmentCandidates(s.job,s.emp,s.rework===true);
   if(list.length===1){s.assignmentId=list[0].id;changed=true;continue;}
   const timed=list.filter(a=>(a.assignedAt||0)<=s.start && (!a.completedAt||s.start<=a.completedAt+86400000));
   if(timed.length===1){s.assignmentId=timed[0].id;changed=true;}
 }
 if(changed)try{save()}catch(_){}
}
migrateSessionAssignmentIds();

function normalSessionMinutes(s,to=Date.now()){
 try{return window.sessionNormalMinutes(s,to)||0}catch(_){return Math.max(0,(Math.min(s.end||to,to)-s.start)/60000)}
}
window.totalForAssignment=function(a){
 if(!a)return 0;
 return (state.sessions||[]).filter(s=>s.assignmentId===a.id).reduce((n,s)=>n+normalSessionMinutes(s,Date.now()),0);
};
window.total=function(no,emp){
 return (state.sessions||[]).filter(s=>s.job===no&&s.emp===emp).reduce((n,s)=>n+normalSessionMinutes(s,Date.now()),0);
};

function currentOpenAssignment(no,emp){
 const candidates=(state.assign||[]).filter(a=>a.job===no&&a.emp===emp&&!a.cancelled&&!a.completed);
 if(candidates.length===1)return candidates[0];
 const regular=candidates.filter(a=>!a.rework),repeat=candidates.filter(a=>a.rework);
 return repeat[0]||regular[0]||null;
}
window.start=function(no){
 if(activeSession(me.id))return alert('You already have an active job. Pause or finish it first.');
 if(typeof window.v63IsOnLeave==='function'&&window.v63IsOnLeave(me.id,Date.now()))return alert('You are marked On Leave for this duty period. Work cannot be started during leave.');
 const a=currentOpenAssignment(no,me.id);
 if(!a)return alert('This job is not available for work.');
 state.sessions.push({id:uid(),job:no,emp:me.id,assignmentId:a.id,start:Date.now(),end:null,paused:false,rework:!!a.rework});
 setLastAction('Started '+no);save();render();
};
window.pause=function(){
 const s=activeSession(me.id);if(!s)return;
 if(s.job===HOLD)return alert('Waiting / ID001 uses START and STOP only.');
 let reason=prompt('Pause reason (optional). Leave blank if you do not want to add a reason.','');if(reason===null)reason='';
 s.end=Date.now();s.paused=true;s.pauseReason=reason.trim();
 const a=(state.assign||[]).find(a=>a.id===s.assignmentId)||currentOpenAssignment(s.job,me.id);
 if(a)a.pauseReason=s.pauseReason;
 setLastAction('Paused '+s.job);save();render();
};
window.finish=function(){
 const s=activeSession(me.id);if(!s)return;
 if(!confirm((s.job===HOLD?'Stop waiting':'Finish work')+' on '+s.job+'?'))return;
 s.end=Date.now();s.finished=true;s.paused=false;
 const a=(state.assign||[]).find(a=>a.id===s.assignmentId)||currentOpenAssignment(s.job,me.id);
 if(a){a.completed=true;a.completedAt=Date.now();}
 setLastAction((s.job===HOLD?'Stopped ':'Finished ')+s.job);save();render();
};

function leaveOverlap(emp,from,to){
 try{return window.v63LeaveOverlapMinutes?window.v63LeaveOverlapMinutes(emp,from,to):0}catch(_){return 0}
}
function dutyOverlap(from,to){
 try{return window.normalOverlapMinutes?window.normalOverlapMinutes(from,to):0}catch(_){return 0}
}
window.idleMinutes=function(emp,ts=Date.now()){
 const day=startDay(ts),end=day+86400000;
 const ss=(state.sessions||[]).filter(s=>s.emp===emp&&s.start<end&&(s.end||Date.now())>day).slice().sort((a,b)=>a.start-b.start);
 let idle=0;
 for(let i=1;i<ss.length;i++){
   const a=ss[i-1].end||Date.now(),b=ss[i].start;
   if(b>a)idle+=Math.max(0,dutyOverlap(a,b)-leaveOverlap(emp,a,b));
 }
 return Math.max(0,idle);
};
window.monthlyIdleMinutes=function(emp,ts=Date.now()){
 const d=new Date(ts),from=new Date(d.getFullYear(),d.getMonth(),1).getTime(),to=new Date(d.getFullYear(),d.getMonth()+1,1).getTime();
 let n=0;for(let day=from;day<to;day+=86400000)n+=window.idleMinutes(emp,day+12*3600000);return n;
};

function firstJobTime(no){
 const vals=(state.assign||[]).filter(a=>a.job===no&&!a.cancelled).map(a=>+a.assignedAt||0).filter(Boolean);
 const j=jinfo(no);if(j.createdAt)vals.push(+j.createdAt);
 return vals.length?Math.min(...vals):Date.now();
}
function ageDays(no){return Math.max(0,Math.floor((Date.now()-firstJobTime(no))/86400000))}
function lastPausedAt(a){
 const ss=(state.sessions||[]).filter(s=>(s.assignmentId===a.id||(!s.assignmentId&&s.emp===a.emp&&s.job===a.job))&&s.paused).sort((x,y)=>(y.end||y.start)-(x.end||x.start));
 return ss.length?(ss[0].end||ss[0].start):0;
}
function actual(a){return window.totalForAssignment(a)}
function attentionItems(){
 const map=new Map();
 (state.assign||[]).filter(a=>a&&!a.cancelled&&!a.completed&&a.job!==HOLD).forEach(a=>{
   const reasons=[],ac=actual(a),sg=+a.suggested||0,days=ageDays(a.job),st=status(a);
   if(sg>0&&ac>sg)reasons.push('Actual time exceeded allocated time by '+fmtSafe(ac-sg));
   if(days>=AGE_DAYS)reasons.push('Job Card open '+days+' days');
   if(st==='Paused'){const p=lastPausedAt(a);if(p&&Date.now()-p>=PAUSE_ALERT_HOURS*3600000)reasons.push('Paused for '+Math.floor((Date.now()-p)/3600000)+' hours');}
   if(a.rework)reasons.push('Repeat Work still open');
   if(!reasons.length)return;
   if(!map.has(a.job))map.set(a.job,{job:a.job,reasons:new Set(),assignments:[]});
   const x=map.get(a.job);reasons.forEach(r=>x.reasons.add(r));x.assignments.push(a);
 });
 return [...map.values()].sort((a,b)=>ageDays(b.job)-ageDays(a.job));
}
window.v66OpenAttention=function(){
 const rows=attentionItems();
 const body=rows.length?'<div class="v66-scroll"><table><tr><th>JC</th><th>Vehicle</th><th>Technician / Dept.</th><th>Reason</th><th>Allocated</th><th>Actual</th><th>Age</th><th></th></tr>'+
 rows.map(x=>{const j=jinfo(x.job),tech=[...new Set(x.assignments.map(a=>esc(person(a.emp).name)+' / '+esc(person(a.emp).department||'—')))].join('<br>'),sg=x.assignments.reduce((n,a)=>n+(+a.suggested||0),0),ac=x.assignments.reduce((n,a)=>n+actual(a),0);return'<tr><td><b>'+esc(x.job)+'</b></td><td><b>'+esc(j.vehicle||'—')+'</b><br><span class="small">'+esc(j.reg||'—')+'</span></td><td>'+tech+'</td><td>'+[...x.reasons].map(r=>'<div class="v66-reason">'+esc(r)+'</div>').join('')+'</td><td>'+fmtSafe(sg)+'</td><td>'+fmtSafe(ac)+'</td><td>'+ageDays(x.job)+' days</td><td><button class="blue" onclick="openManagerJobDetails(\''+esc(x.job)+'\')">VIEW</button></td></tr>'}).join('')+'</table></div>':'<div class="notice"><b>No Job Cards need attention.</b></div>';
 openModal('<div class="section-title"><h2>Attention</h2><button class="secondary" onclick="closeModal()">Close</button></div><p class="muted">Flags jobs open 4+ days, actual time over allocation, pauses of 4+ hours, and unresolved Repeat Work.</p>'+body);
};

function requestCount(){return (state.requests||[]).filter(r=>r.status==='New').length}
function workingCount(){return (state.assign||[]).filter(a=>a&&!a.cancelled&&!a.completed&&a.job!==HOLD&&status(a)==='Started').length}
function notStartedCount(){return (state.assign||[]).filter(a=>a&&!a.cancelled&&!a.completed&&a.job!==HOLD&&status(a)==='New').length}
function pausedCount(){return (state.assign||[]).filter(a=>a&&!a.cancelled&&!a.completed&&a.job!==HOLD&&status(a)==='Paused').length}
function leaveCount(){const key=new Date().toISOString().slice(0,10);return (state.leaves||[]).filter(l=>!l.cancelled&&l.date===key).length}
function completedTodayCount(){const d=startDay(Date.now());return new Set((state.assign||[]).filter(a=>a&&!a.cancelled&&a.completed&&(a.completedAt||0)>=d).map(a=>a.job)).size}
function repeatCount(){return new Set((state.assign||[]).filter(a=>a&&!a.cancelled&&!a.completed&&a.rework).map(a=>a.job)).size}
function waitingCount(){return (state.sessions||[]).filter(s=>s.job===HOLD&&!s.end).length}
function todayJobsCount(){const d=startDay(Date.now());return new Set((state.assign||[]).filter(a=>a&&!a.cancelled&&((a.assignedAt||0)>=d||(a.completedAt||0)>=d||(state.sessions||[]).some(s=>s.assignmentId===a.id&&s.start>=d))).map(a=>a.job)).size}

function controlCard(type,label,count,accent){
 if(type==='consumables')return '<button class="v66-raised v66-control v66-consumables" style="--accent:'+accent+'" onclick="openConsumablesModule()"><span class="v66-accent"></span><small>'+label+'</small><b>'+count+'</b><em>View details ›</em></button>';
 return '<button class="v66-raised v66-control" style="--accent:'+accent+'" onclick="v65OpenControl(\''+type+'\')"><span class="v66-accent"></span><small>'+label+'</small><b>'+count+'</b><em>View details ›</em></button>';
}
function hoursButton(kind,label){
 let val='—';try{
   const n=new Date(),day=startDay(n);let from,to;
   if(kind==='day'){from=day;to=day+86400000}
   else if(kind==='week'){const wd=(n.getDay()+6)%7;from=day-wd*86400000;to=from+7*86400000}
   else{from=new Date(n.getFullYear(),n.getMonth(),1).getTime();to=new Date(n.getFullYear(),n.getMonth()+1,1).getTime()}
   const mins=users.filter(u=>u.role==='Employee').reduce((sum,u)=>(state.sessions||[]).filter(s=>s.emp===u.id&&s.job!==HOLD&&s.start<to&&(s.end||Date.now())>from).reduce((z,s)=>z+normalSessionMinutes({start:Math.max(s.start,from),end:Math.min(s.end||Date.now(),to)},to),sum),0);
   val=fmtSafe(mins);
 }catch(_){}
 return '<button class="v66-raised v66-hour" onclick="v65OpenHours(\''+kind+'\')"><small>'+label+'</small><b>'+val+'</b><em>Technician details ›</em></button>';
}
function renderManager66(){
 const el=document.getElementById('managerView');if(!el||!me||me.role!=='Manager')return;
 el.classList.remove('hidden');
 el.innerHTML=
 '<div class="v66-hero"><div><span class="v66-eyebrow">ZUKAIT TIME TRACK</span><h2>Manager Dashboard</h2><p>Workshop overview · '+new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'</p></div><span class="v66-live">● LIVE</span></div>'+
 '<div class="v66-top-grid"><button class="v66-raised v66-feature request" onclick="v65OpenRequests()"><span>Employee Requests</span><b>'+requestCount()+'</b><small>New / pending requests</small></button><button class="v66-raised v66-feature attention" onclick="v66OpenAttention()"><span>Attention</span><b>'+attentionItems().length+'</b><small>Jobs needing management review</small></button></div>'+
 '<section class="v66-section"><div class="v66-section-head"><div><h3>Workshop Control Center</h3><p>Live status — tap any raised card</p></div></div><div class="v66-control-grid">'+
 controlCard('today','Today Jobs',todayJobsCount(),'#2563eb')+
 controlCard('working','Working Now',workingCount(),'#059669')+
 controlCard('notstarted','Not Started',notStartedCount(),'#64748b')+
 controlCard('paused','Paused',pausedCount(),'#d97706')+
 controlCard('consumables','Consumables','›','#be123c')+
 controlCard('completed','Completed Today',completedTodayCount(),'#0f766e')+
 controlCard('repeat','Repeat Work',repeatCount(),'#7c3aed')+
 controlCard('waiting','Waiting / ID001',waitingCount(),'#475569')+
 '</div></section>'+
 '<section class="v66-section"><div class="v66-section-head"><div><h3>Actual Worked Hours</h3><p>Productive technician man-hours</p></div></div><div class="v66-hours">'+hoursButton('day','TODAY')+hoursButton('week','THIS WEEK')+hoursButton('month','THIS MONTH')+'</div></section>'+
 '<section class="v66-section"><div class="v66-section-head"><div><h3>Job / Production Tools</h3><p>Organized work panels</p></div></div><div class="v66-tools"><div class="v66-toolbox"><h4>Job Card Tools</h4><p>Workshop job control</p><div><button onclick="openJobCardManager(\'all\')">Job Card Manager</button><button onclick="openManagerJobsPopup(\'active\')">Active Jobs</button><button onclick="openManagerJobsPopup(\'completed\')">Completed Jobs</button><button onclick="openManagerTechniciansPopup()">Technicians</button></div></div><div class="v66-toolbox"><h4>Production & Reports</h4><p>Performance and history</p><div><button onclick="openCompletedJobProduction()">Job Production</button><button onclick="openManagerReports()">Reports</button><button onclick="openIncentiveList()">Incentive</button><button onclick="openManagerHistoryPopup()">History</button></div></div></div></section>'+
 '<section class="v66-section v66-admin"><div><h3>Admin</h3><p>Sync, backups and User Management</p></div><button class="v66-raised v66-admin-btn" onclick="v65OpenAdmin()">Open Admin ›</button></section>';
}

function cleanManagerDuplicates(){
 const root=document.getElementById('managerView');if(!root)return;
 root.querySelectorAll('.v54-manager-requests,.v63-admin-btn,.v64-admin,.v63-manager-control,.v42-manager-tools').forEach(x=>x.remove());
}
function decorateAccount(){
 const app=document.getElementById('app'),row=app?.querySelector(':scope > .row'),w=document.getElementById('welcome');if(!row||!w||!me)return;
 row.querySelectorAll(':scope > button').forEach(b=>b.style.display='none');
 document.getElementById('v44AccountMenu')?.remove();
 w.className='v66-user';w.textContent=(me.name||me.id)+' — '+(me.role==='Employee'?(me.department||'Employee'):me.role)+' ▾';w.onclick=e=>{e.stopPropagation();v65OpenAccount()};w.title='Account / Logout';
}

const css=document.createElement('style');css.id='v66PremiumStyle';css.textContent=`
:root{--v66-bg:#f4f7fb;--v66-card:#ffffff;--v66-ink:#172033;--v66-muted:#6b778c;--v66-line:#dfe6ef;--v66-navy:#183153;--v66-shadow:0 9px 20px rgba(34,55,80,.12),0 2px 5px rgba(34,55,80,.08);--v66-shadow-press:0 3px 8px rgba(34,55,80,.12)}
body{background:linear-gradient(180deg,#f8fafc 0,#f2f6fb 100%)!important;color:var(--v66-ink)}
#managerView{max-width:1180px;margin:auto}
.v66-hero{background:linear-gradient(145deg,#fff,#f6f9fd);border:1px solid #d9e2ed;border-radius:20px;padding:22px;display:flex;justify-content:space-between;gap:16px;box-shadow:var(--v66-shadow);position:relative;overflow:hidden}.v66-hero:after{content:"";position:absolute;width:180px;height:180px;border-radius:50%;background:#dce8f6;right:-70px;top:-95px;opacity:.55}.v66-hero h2{font-size:28px;margin:5px 0;color:#152b49}.v66-hero p{margin:0;color:var(--v66-muted)}.v66-eyebrow{font-size:11px;font-weight:900;letter-spacing:.14em;color:#6380a3}.v66-live{z-index:1;background:#e8f7ef;color:#13714b;border:1px solid #bee8d2;border-radius:999px;padding:7px 11px;height:max-content;font-size:11px;font-weight:900}
.v66-raised{border:1px solid #d9e2ec!important;background:linear-gradient(145deg,#fff,#f7f9fc)!important;color:var(--v66-ink)!important;box-shadow:var(--v66-shadow)!important;transform:translateY(0);transition:transform .12s ease,box-shadow .12s ease,border-color .12s ease}.v66-raised:hover{transform:translateY(-2px);border-color:#c7d4e3!important}.v66-raised:active{transform:translateY(2px);box-shadow:var(--v66-shadow-press)!important}
.v66-top-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}.v66-feature{min-height:126px;border-radius:18px!important;padding:18px;text-align:left;position:relative;overflow:hidden}.v66-feature span{display:block;font-size:14px;font-weight:900}.v66-feature b{display:block;font-size:36px;margin:8px 0;color:#172033}.v66-feature small{color:var(--v66-muted)}.v66-feature.request{border-left:5px solid #315f9b!important}.v66-feature.attention{border-left:5px solid #b6495b!important}.v66-feature.attention:after,.v66-feature.request:after{content:"";position:absolute;width:100px;height:100px;border-radius:50%;right:-30px;bottom:-40px;opacity:.35}.v66-feature.request:after{background:#dbeafe}.v66-feature.attention:after{background:#ffe4e6}
.v66-section{background:rgba(255,255,255,.92);border:1px solid var(--v66-line);border-radius:20px;padding:18px;margin:15px 0;box-shadow:0 5px 16px rgba(34,55,80,.07)}.v66-section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.v66-section-head h3,.v66-admin h3{margin:0;color:#1d3553;font-size:19px}.v66-section-head p,.v66-admin p{margin:4px 0 0;color:var(--v66-muted);font-size:12px}
.v66-control-grid{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:12px}.v66-control{min-height:112px;border-radius:16px!important;padding:14px;text-align:left;position:relative}.v66-control .v66-accent{position:absolute;left:0;top:18px;bottom:18px;width:4px;border-radius:0 4px 4px 0;background:var(--accent)}.v66-control small{display:block;margin-left:5px;font-size:11px;font-weight:900;color:#66768a;text-transform:uppercase;letter-spacing:.03em}.v66-control b{display:block;margin:6px 0 4px 5px;font-size:30px;color:#172033}.v66-control em{font-style:normal;margin-left:5px;font-size:11px;color:#7a8798}
.v66-hours{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.v66-hour{min-height:105px;border-radius:16px!important;padding:15px;text-align:left}.v66-hour small{display:block;color:#6f7d90;font-weight:900}.v66-hour b{display:block;font-size:25px;margin:8px 0;color:#183153}.v66-hour em{font-size:11px;font-style:normal;color:#8793a4}
.v66-tools{display:grid;grid-template-columns:1fr 1fr;gap:14px}.v66-toolbox{background:linear-gradient(145deg,#fff,#f8fafc);border:1px solid #dce4ed;border-radius:17px;padding:16px;box-shadow:inset 0 1px #fff,0 5px 14px rgba(34,55,80,.06)}.v66-toolbox h4{margin:0;color:#233c5c;font-size:17px}.v66-toolbox p{margin:4px 0 13px;color:#7a8798;font-size:12px}.v66-toolbox>div{display:grid;grid-template-columns:1fr 1fr;gap:9px}.v66-toolbox button{min-height:51px;background:#fff;color:#263b55;border:1px solid #d7e0ea;border-radius:12px;font-weight:800;box-shadow:0 3px 8px rgba(34,55,80,.07)}.v66-toolbox button:active{transform:translateY(1px);box-shadow:0 1px 3px rgba(34,55,80,.1)}
.v66-admin{display:flex;justify-content:space-between;align-items:center;gap:14px}.v66-admin-btn{min-width:150px;min-height:48px;border-radius:13px!important;font-weight:900!important;color:#183153!important}
.v66-user{cursor:pointer!important;margin:0!important;padding:9px 13px;border:1px solid #d8e1ec;border-radius:13px;background:linear-gradient(145deg,#fff,#f7f9fc);color:#1b314e;font-size:15px;box-shadow:0 4px 10px rgba(34,55,80,.08)}
.v66-reason{background:#fff5f5;color:#9f3444;border:1px solid #f4d8dc;border-radius:8px;padding:4px 7px;margin:3px 0;font-size:11px;font-weight:800}.v66-scroll{overflow:auto}
@media(max-width:800px){.v66-control-grid{grid-template-columns:repeat(2,1fr)}.v66-tools,.v66-top-grid{grid-template-columns:1fr}.v66-hours{grid-template-columns:1fr}.v66-toolbox>div{grid-template-columns:1fr 1fr}}
@media(max-width:480px){.v66-control-grid,.v66-toolbox>div{grid-template-columns:1fr}.v66-admin{align-items:stretch;flex-direction:column}.v66-admin-btn{width:100%}}
`;document.head.appendChild(css);

const previousRender=window.render;
window.render=function(){
 previousRender();
 decorateAccount();
 cleanManagerDuplicates();
};
setTimeout(()=>{if(me){decorateAccount();cleanManagerDuplicates()}},80);
window.v66UpdateCheckResult=function(latestCode,latestName,error){if(typeof window.v65UpdateCheckResult==='function')return window.v65UpdateCheckResult(latestCode,latestName,error);};
window.v66Ready=true;
})();