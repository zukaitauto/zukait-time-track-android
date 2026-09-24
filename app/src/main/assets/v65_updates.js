(function(){
'use strict';
const HOLD='ID001';
const AGE_DAYS=3;
const PAUSE_ALERT_HOURS=4;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const startDay=ts=>{const d=new Date(ts);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()};
const fmtSafe=m=>{try{return fmt(Math.max(0,Number(m)||0))}catch(_){return Math.round(Number(m)||0)+'m'}};
const person=id=>{try{return user(id)||{id,name:id,department:''}}catch(_){return{id,name:id,department:''}}};
const jinfo=no=>{try{return job(no)||{no,vehicle:'',reg:''}}catch(_){return{no,vehicle:'',reg:''}}};
const status=a=>{try{return empStatus(a)}catch(_){return a?.completed?'Finished':'New'}};
const actual=a=>{try{return totalForAssignment(a)||0}catch(_){try{return total(a.job,a.emp)||0}catch(__){return 0}}};
const liveRows=()=> (state.assign||[]).filter(a=>a&&!a.cancelled);
const openRows=()=> liveRows().filter(a=>!a.completed);
const todayKey=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};

function firstJobTime(no){
 const a=liveRows().filter(x=>x.job===no).map(x=>+x.assignedAt||0).filter(Boolean);
 const j=jinfo(no); if(j.createdAt)a.push(+j.createdAt);
 return a.length?Math.min(...a):Date.now();
}
function ageDays(no){return Math.max(0,Math.floor((Date.now()-firstJobTime(no))/86400000))}
function lastPausedAt(a){
 const ss=(state.sessions||[]).filter(s=>s.emp===a.emp&&s.job===a.job&&s.paused).sort((x,y)=>(y.end||y.start)-(x.end||x.start));
 return ss.length?(ss[0].end||ss[0].start):0;
}
function attentionItems(){
 const byJob=new Map();
 openRows().forEach(a=>{
   if(a.job===HOLD)return;
   const reasons=[];
   const ac=actual(a),sg=+a.suggested||0,st=status(a),days=ageDays(a.job);
   if(sg>0&&ac>sg)reasons.push('Actual time exceeded allocated time by '+fmtSafe(ac-sg));
   if(days>=AGE_DAYS)reasons.push('Job Card open '+days+' days');
   if(st==='Paused'){const p=lastPausedAt(a);if(p&&Date.now()-p>=PAUSE_ALERT_HOURS*3600000)reasons.push('Paused for '+Math.floor((Date.now()-p)/3600000)+' hours');}
   if(a.rework||(state.reworks||[]).some(r=>r.job===a.job))reasons.push('Repeat Work still open');
   if(!reasons.length)return;
   if(!byJob.has(a.job))byJob.set(a.job,{job:a.job,reasons:new Set(),assignments:[]});
   const x=byJob.get(a.job);reasons.forEach(r=>x.reasons.add(r));x.assignments.push(a);
 });
 return [...byJob.values()].sort((a,b)=>ageDays(b.job)-ageDays(a.job));
}

function requestCount(){return (state.requests||[]).filter(r=>r.status==='New').length}
function attentionCount(){return attentionItems().length}

window.v65OpenRequests=function(){
 const rows=(state.requests||[]).slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 const body=rows.length?rows.map(r=>{
   const u=person(r.emp),st=r.status||'New';
   let actions='';
   if(st==='New'){
     if(r.type==='more_time')actions='<button class="green" onclick="approveRequest(\''+esc(r.id)+'\')">APPROVE</button><button class="danger" onclick="rejectRequest(\''+esc(r.id)+'\')">REJECT</button>';
     else actions='<button class="blue" onclick="ackRequest(\''+esc(r.id)+'\')">MARK READ</button>';
   }
   return '<div class="v65-list-item"><div><b>'+esc(u.name)+'</b> · <b>'+esc(r.job||'—')+'</b><br><span class="small">'+esc(String(r.type||'request').replaceAll('_',' '))+' · '+esc(st)+' · '+esc(r.createdAt?new Date(r.createdAt).toLocaleString():'')+'</span></div><p>'+esc(r.message||'No text message')+'</p>'+actions+'</div>';
 }).join(''):'<div class="notice">No employee requests.</div>';
 openModal('<div class="section-title"><h2>Employee Requests</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+body);
};

window.v65OpenAttention=function(){
 const items=attentionItems();
 const body=items.length?'<div class="v65-scroll"><table><tr><th>JC</th><th>Vehicle</th><th>Technician / Dept.</th><th>Reason</th><th>Allocated</th><th>Actual</th><th>Age</th><th></th></tr>'+
 items.map(x=>{const j=jinfo(x.job),tech=[...new Set(x.assignments.map(a=>person(a.emp).name+' / '+(person(a.emp).department||'—')))].join('<br>'),sg=x.assignments.reduce((n,a)=>n+(+a.suggested||0),0),ac=x.assignments.reduce((n,a)=>n+actual(a),0);
 return '<tr><td><b>'+esc(x.job)+'</b></td><td><b>'+esc(j.vehicle||'—')+'</b><br><span class="small">'+esc(j.reg||'—')+'</span></td><td>'+tech+'</td><td>'+[...x.reasons].map(r=>'<div class="v65-reason">'+esc(r)+'</div>').join('')+'</td><td>'+fmtSafe(sg)+'</td><td>'+fmtSafe(ac)+'</td><td>'+ageDays(x.job)+' days</td><td><button class="blue" onclick="openManagerJobDetails(\''+esc(x.job)+'\')">VIEW</button></td></tr>'}).join('')+'</table></div>':'<div class="notice"><b>No Job Cards need attention.</b></div>';
 openModal('<div class="section-title"><h2>Attention</h2><button class="secondary" onclick="closeModal()">Close</button></div><p class="muted">Shows over-time jobs, Job Cards open 3+ days, long pauses, and unresolved Repeat Work.</p>'+body);
};

function leaveToday(){return (state.leaves||[]).filter(l=>!l.cancelled&&l.date===todayKey())}
function waitingNow(){return (state.sessions||[]).filter(s=>s.job===HOLD&&!s.end)}
function rowsFor(type){
 const all=liveRows(),open=openRows(),d=startDay(Date.now());
 if(type==='today')return all.filter(a=>(a.assignedAt||0)>=d||(a.completedAt||0)>=d||(state.sessions||[]).some(s=>s.emp===a.emp&&s.job===a.job&&s.start>=d));
 if(type==='working')return open.filter(a=>a.job!==HOLD&&status(a)==='Started');
 if(type==='notstarted')return open.filter(a=>a.job!==HOLD&&status(a)==='New');
 if(type==='paused')return open.filter(a=>a.job!==HOLD&&status(a)==='Paused');
 if(type==='completed')return all.filter(a=>a.completed&&(a.completedAt||0)>=d);
 if(type==='repeat')return open.filter(a=>a.rework||(state.reworks||[]).some(r=>r.job===a.job));
 return [];
}
function controlCounts(){return{
 today:new Set(rowsFor('today').map(a=>a.job)).size,
 working:rowsFor('working').length,
 notstarted:rowsFor('notstarted').length,
 paused:rowsFor('paused').length,
 leave:leaveToday().length,
 completed:new Set(rowsFor('completed').map(a=>a.job)).size,
 repeat:new Set(rowsFor('repeat').map(a=>a.job)).size,
 waiting:waitingNow().length
}}
const controlLabels={today:'Today Jobs',working:'Working Now',notstarted:'Not Started',paused:'Paused',leave:'Consumables',completed:'Completed Today',repeat:'Repeat Work',waiting:'Waiting / ID001'};

function controlTable(rows){
 if(!rows.length)return'<div class="notice">No records in this section.</div>';
 return '<div class="v65-scroll"><table><tr><th>JC</th><th>Vehicle</th><th>Department</th><th>Technician</th><th>Status</th><th>Allocated</th><th>Actual</th><th></th></tr>'+
 rows.map(a=>{const j=jinfo(a.job),u=person(a.emp);return'<tr class="v65-filter-row" data-search="'+esc([a.job,j.vehicle,j.reg,u.name,u.department,status(a)].join(' ').toLowerCase())+'"><td><b>'+esc(a.job)+'</b></td><td><b>'+esc(j.vehicle||'—')+'</b><br><span class="small">'+esc(j.reg||'—')+'</span></td><td>'+esc(u.department||'—')+'</td><td>'+esc(u.name)+'</td><td>'+esc(status(a))+'</td><td>'+fmtSafe(+a.suggested||0)+'</td><td>'+fmtSafe(actual(a))+'</td><td><button class="blue" onclick="openManagerJobDetails(\''+esc(a.job)+'\')">VIEW</button></td></tr>'}).join('')+'</table></div>';
}
window.v65FilterControl=function(){const q=(document.getElementById('v65ControlSearch')?.value||'').toLowerCase();document.querySelectorAll('.v65-filter-row').forEach(r=>r.style.display=!q||r.dataset.search.includes(q)?'':'none')};
window.v65OpenControl=function(type){
 let body='<input id="v65ControlSearch" class="v65-search" placeholder="" oninput="v65FilterControl()">';
 if(type==='leave'){
   const rows=leaveToday();body+=rows.length?'<div class="v65-scroll"><table><tr><th>Employee</th><th>Department</th><th>Period</th><th>Remark</th></tr>'+rows.map(l=>{const u=person(l.emp);return'<tr class="v65-filter-row" data-search="'+esc((u.name+' '+u.department+' '+l.period).toLowerCase())+'"><td><b>'+esc(u.name)+'</b></td><td>'+esc(u.department||'—')+'</td><td>'+esc(l.period==='AM'?'Morning 8–1':l.period==='PM'?'Afternoon 3–7':'Full Day')+'</td><td>'+esc(l.remark||'—')+'</td></tr>'}).join('')+'</table></div>':'<div class="notice">No employees on leave today.</div>';
 } else if(type==='waiting'){
   const rows=waitingNow();body+=rows.length?'<div class="v65-scroll"><table><tr><th>Technician</th><th>Department</th><th>Waiting Since</th><th>Duration</th></tr>'+rows.map(s=>{const u=person(s.emp);return'<tr class="v65-filter-row" data-search="'+esc((u.name+' '+u.department).toLowerCase())+'"><td><b>'+esc(u.name)+'</b></td><td>'+esc(u.department||'—')+'</td><td>'+esc(new Date(s.start).toLocaleTimeString())+'</td><td>'+fmtSafe((Date.now()-s.start)/60000)+'</td></tr>'}).join('')+'</table></div>':'<div class="notice">No technicians waiting now.</div>';
 } else body+=controlTable(rowsFor(type));
 openModal('<div class="section-title"><h2>'+esc(controlLabels[type]||'Workshop Control')+'</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+body);
};

function controlGrid(){
 const c=controlCounts(),types=['today','working','notstarted','paused','leave','completed','repeat','waiting'];
 return '<div class="v65-control-grid">'+types.map(t=>t==='leave'?'<button class="v65-control leave v65-consumables" onclick="openConsumablesModule()"><span>Consumables</span><b>›</b><small>View details</small></button>':'<button class="v65-control '+t+'" onclick="v65OpenControl(\''+t+'\')"><span>'+controlLabels[t]+'</span><b>'+c[t]+'</b><small>Tap for details</small></button>').join('')+'</div>';
}

function employeeMinutes(emp,from,to){return (state.sessions||[]).filter(s=>s.emp===emp&&s.job!==HOLD).reduce((n,s)=>{const a=Math.max(+s.start||0,from),b=Math.min(+(s.end||Date.now()),to);if(b<=a)return n;try{return n+sessionNormalMinutes({start:a,end:b},b)}catch(_){return n+(b-a)/60000}},0)}
function periodBounds(kind){const n=new Date(),d=startDay(n);if(kind==='day')return[d,d+86400000,'Today'];if(kind==='week'){const wd=(n.getDay()+6)%7,a=d-wd*86400000;return[a,a+7*86400000,'This Week']}return[new Date(n.getFullYear(),n.getMonth(),1).getTime(),new Date(n.getFullYear(),n.getMonth()+1,1).getTime(),'This Month']}
function hourTotal(kind){const [a,b]=periodBounds(kind);return users.filter(u=>u.role==='Employee').reduce((n,u)=>n+employeeMinutes(u.id,a,b),0)}
window.v65OpenHours=function(kind){const[a,b,title]=periodBounds(kind),rows=users.filter(u=>u.role==='Employee').map(u=>({u,m:employeeMinutes(u.id,a,b)})).sort((x,y)=>y.m-x.m),total=rows.reduce((n,x)=>n+x.m,0);openModal('<div class="section-title"><h2>'+title+' — Actual Worked Hours</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="notice"><b>Total productive man-hours: '+fmtSafe(total)+'</b></div><div class="v65-scroll"><table><tr><th>Technician</th><th>Department</th><th>Actual Productive Hours</th></tr>'+rows.map(x=>'<tr><td><b>'+esc(x.u.name)+'</b></td><td>'+esc(x.u.department||'—')+'</td><td><b>'+fmtSafe(x.m)+'</b></td></tr>').join('')+'</table></div>')};
function hoursHTML(){return '<div class="v65-hours"><button onclick="v65OpenHours(\'day\')"><span>TODAY</span><b>'+fmtSafe(hourTotal('day'))+'</b></button><button onclick="v65OpenHours(\'week\')"><span>THIS WEEK</span><b>'+fmtSafe(hourTotal('week'))+'</b></button><button onclick="v65OpenHours(\'month\')"><span>THIS MONTH</span><b>'+fmtSafe(hourTotal('month'))+'</b></button></div>'}

window.v65OpenAdmin=function(){openModal('<div class="section-title"><h2>Admin</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="v65-admin-grid"><button class="blue" onclick="v42SyncNow()">↻ SYNC NOW</button><button class="green" onclick="v63Backup()">☁ BACKUP NOW</button><button class="secondary" onclick="v63BackupHistory()">BACKUP HISTORY</button><button class="secondary" onclick="openUserManagement()">USER MANAGEMENT</button></div>')};

window.v65OpenAccount=function(){
 if(!me)return;
 let items='<button class="secondary" onclick="changeOwnPassword()">🔐 CHANGE PASSWORD</button><button class="blue" onclick="v42SyncNow()">↻ SYNC</button><button class="secondary" onclick="v65OpenAbout()">ABOUT</button>';
 if(me.role==='Employee')items+='<button class="v65-leave-btn" onclick="v63OpenLeave()">LEAVE</button>';
 items+='<button class="danger v65-logout" onclick="closeModal();logout()">LOGOUT</button>';
 openModal('<div class="section-title"><h2>'+esc(me.name)+'</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="v65-account">'+items+'</div>');
};
window.v65OpenAbout=function(){let version='Web';try{if(window.AndroidBridge)version=AndroidBridge.getAppVersion()}catch(_){}
 openModal('<div class="section-title"><h2>About</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="notice"><b>Zukait Time Track</b><br>Installed version: '+esc(version)+'</div>'+(window.AndroidBridge?'<button class="blue big-action" onclick="v65CheckUpdate()">CHECK FOR UPDATES</button><div id="v65UpdateResult" class="muted"></div>':'<div class="muted">Web version updates automatically.</div>'));
};
window.v65CheckUpdate=function(){const x=document.getElementById('v65UpdateResult');if(x)x.textContent='Checking for updates…';try{AndroidBridge.checkForUpdates()}catch(_){if(x)x.textContent='Unable to check for updates.'}};
window.v65UpdateCheckResult=function(latestCode,latestName,error){const x=document.getElementById('v65UpdateResult');if(!x)return;if(error){x.textContent='Update check failed. Please check internet connection.';return}let current=0;try{current=AndroidBridge.getAppVersionCode()}catch(_){}if(Number(latestCode)<=Number(current)){x.innerHTML='<b class="ok">App is up to date.</b>';return}x.innerHTML='<b>New version '+esc(latestName)+' is available.</b><br><button class="green big-action" onclick="AndroidBridge.openUpdatePage()">DOWNLOAD & INSTALL UPDATE</button>'};
window.v64UpdateCheckResult=window.v65UpdateCheckResult;

function toolsHTML(){
 return '<div class="v65-tools-grid">'+
 '<div class="v65-tool-panel"><div class="v65-panel-head"><h3>Job Card Tools</h3><span>Workshop jobs</span></div><div class="v65-panel-actions"><button onclick="openJobCardManager(\'all\')">JOB CARD MANAGER</button><button onclick="openManagerJobsPopup(\'active\')">ACTIVE JOBS</button><button onclick="openManagerJobsPopup(\'completed\')">COMPLETED JOBS</button><button onclick="openManagerTechniciansPopup()">TECHNICIANS</button></div></div>'+
 '<div class="v65-tool-panel"><div class="v65-panel-head"><h3>Production & Reports</h3><span>Performance and history</span></div><div class="v65-panel-actions"><button onclick="openCompletedJobProduction()">JOB PRODUCTION</button><button onclick="openManagerReports()">REPORTS</button><button onclick="openIncentiveList()">INCENTIVE</button><button onclick="openManagerHistoryPopup()">HISTORY</button></div></div>'+
 '</div>';
}
function renderManager65(){
 const el=document.getElementById('managerView');if(!el||!me||me.role!=='Manager')return;
 el.classList.remove('hidden');
 el.innerHTML=
 '<div class="v65-manager-head"><div><div class="v65-eyebrow">ZUKAIT TIME TRACK</div><h2>Manager Dashboard</h2><p>'+new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'</p></div><span class="v65-live">LIVE</span></div>'+
 '<div class="v65-top-pair"><button class="v65-summary requests" onclick="v65OpenRequests()"><span>Employee Requests</span><b>'+requestCount()+'</b><small>New / pending requests</small></button><button class="v65-summary attention" onclick="v65OpenAttention()"><span>Attention</span><b>'+attentionCount()+'</b><small>Jobs needing management review</small></button></div>'+
 '<section class="v65-section"><div class="v65-section-title"><div><h3>Workshop Control Center</h3><p>Live workshop status — tap any card</p></div></div>'+controlGrid()+'</section>'+
 '<section class="v65-section"><div class="v65-section-title"><div><h3>Actual Worked Hours</h3><p>Productive technician man-hours</p></div></div>'+hoursHTML()+'</section>'+
 '<section class="v65-section"><div class="v65-section-title"><div><h3>Job / Production Tools</h3><p>Organized into two work panels</p></div></div>'+toolsHTML()+'</section>'+
 '<section class="v65-section v65-admin-section"><div class="v65-section-title"><div><h3>Admin</h3><p>Sync, backups and User Management</p></div><button class="v65-admin-open" onclick="v65OpenAdmin()">OPEN ADMIN</button></div></section>';
}

function decorateTop(){
 const app=document.getElementById('app'),row=app?.querySelector(':scope > .row'),w=document.getElementById('welcome');if(!row||!w||!me)return;
 // Employee V75+ dashboard has its own brand/identity header. Keep the legacy account row hidden to prevent duplicate headers.
 if(me.role==='Employee'){row.style.setProperty('display','none','important');return}else{row.style.removeProperty('display')}
 row.querySelectorAll(':scope > button').forEach(b=>b.style.display='none');
 document.getElementById('v44AccountMenu')?.remove();
 w.className='v65-user';
 w.textContent=(me.name||me.id)+' — '+(me.role==='Employee'?(me.department||'Employee'):me.role)+' ▾';
 w.onclick=ev=>{ev.stopPropagation();v65OpenAccount()};
 w.title='Account';
}

function decorateSupervisor(){
 const root=document.getElementById('supervisorView');if(!root||!me||me.role!=='Supervisor')return;
 document.querySelectorAll('.v54-dept-box').forEach(b=>{const t=(b.textContent||'').toLowerCase();b.classList.remove('v65-dent','v65-paint','v65-mech');if(t.includes('denting'))b.classList.add('v65-dent');else if(t.includes('painting'))b.classList.add('v65-paint');else if(t.includes('mechanical'))b.classList.add('v65-mech')});
}
window.assignmentTable=function(rows,rowClass=''){
 if(!rows.length)return'<p class="muted">No job cards found.</p>';
 return '<div class="v65-scroll"><table><tr><th>Job Card</th><th>Vehicle</th><th>Registration</th><th>Status</th><th>Suggested</th><th>Actual</th><th>Assigned By</th><th>Pause Reason</th></tr>'+rows.slice().sort((a,b)=>assignmentSortValue(a)-assignmentSortValue(b)).map(a=>{const j=jinfo(a.job);return'<tr class="'+rowClass+'" data-search="'+esc([a.job,j.vehicle,j.reg,person(a.emp).name].join(' ').toLowerCase())+'"><td><b>'+esc(a.job)+'</b></td><td><b>'+esc(j.vehicle||'—')+'</b></td><td>'+esc(j.reg||'—')+'</td><td>'+statusHTML(status(a))+'</td><td>'+fmtSafe(+a.suggested||0)+'</td><td>'+fmtSafe(actual(a))+'</td><td>'+esc(person(a.assignedBy).name||'—')+'</td><td>'+esc(a.pauseReason||'—')+'</td></tr>'}).join('')+'</table></div>';
};
const oldDept=window.openTechnicianDeptV56;if(typeof oldDept==='function')window.openTechnicianDeptV56=function(dept){oldDept(dept);setTimeout(decorateSupervisor,0)};

const css=document.createElement('style');css.id='v65Style';css.textContent=`
:root{--v65-navy:#0f172a;--v65-surface:#ffffff;--v65-bg:#f6f8fb;--v65-border:#e2e8f0;--v65-text:#172033;--v65-muted:#64748b;--v65-blue:#1d4ed8;--v65-green:#047857;--v65-amber:#b45309;--v65-rose:#be123c;--v65-purple:#6d28d9;--v65-teal:#0f766e;--v65-slate:#334155}
body{background:var(--v65-bg)!important;color:var(--v65-text)}
.v65-user{cursor:pointer!important;margin:0!important;padding:9px 13px;border:1px solid var(--v65-border);border-radius:12px;background:#fff;color:var(--v65-text);font-size:15px;box-shadow:0 2px 8px #0f172a0c}
.v65-manager-head{background:var(--v65-navy);color:#fff;border-radius:18px;padding:22px;display:flex;justify-content:space-between;align-items:flex-start;box-shadow:0 12px 30px #0f172a18}.v65-manager-head h2{margin:4px 0;font-size:28px}.v65-manager-head p{margin:0;color:#cbd5e1}.v65-eyebrow{font-size:11px;font-weight:900;letter-spacing:.12em;color:#94a3b8}.v65-live{background:#064e3b;color:#d1fae5;padding:7px 10px;border-radius:999px;font-size:11px;font-weight:900}
.v65-top-pair{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}.v65-summary{min-height:120px;border-radius:16px;padding:18px;text-align:left;color:#fff;box-shadow:0 8px 20px #0f172a12}.v65-summary span{display:block;font-size:14px;font-weight:900}.v65-summary b{display:block;font-size:34px;margin:8px 0}.v65-summary small{opacity:.9}.v65-summary.requests{background:#1e3a8a}.v65-summary.attention{background:#9f1239}
.v65-section{background:#fff;border:1px solid var(--v65-border);border-radius:18px;padding:18px;margin:14px 0;box-shadow:0 4px 16px #0f172a0b}.v65-section-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.v65-section-title h3{margin:0;font-size:19px}.v65-section-title p{margin:4px 0 0;color:var(--v65-muted);font-size:12px}
.v65-control-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px}.v65-control{min-height:108px;border-radius:15px;padding:13px;color:#fff!important;text-align:left;border:0;box-shadow:none}.v65-control span{display:block;font-size:12px;font-weight:900}.v65-control b{display:block;font-size:28px;margin:6px 0}.v65-control small{opacity:.9}.v65-control.today{background:#1e3a8a}.v65-control.working{background:#047857}.v65-control.notstarted{background:#334155}.v65-control.paused{background:#b45309}.v65-control.leave{background:#be123c}.v65-control.completed{background:#0f766e}.v65-control.repeat{background:#6d28d9}.v65-control.waiting{background:#475569}
.v65-hours{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.v65-hours button{min-height:100px;border-radius:15px;background:#f8fafc;color:#0f172a;border:1px solid var(--v65-border);text-align:left;padding:15px}.v65-hours span{display:block;font-size:11px;font-weight:900;color:#64748b}.v65-hours b{display:block;font-size:25px;margin-top:7px;color:#0f172a}
.v65-tools-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.v65-tool-panel{border:1px solid var(--v65-border);background:#f8fafc;border-radius:16px;padding:15px}.v65-panel-head h3{margin:0}.v65-panel-head span{font-size:12px;color:#64748b}.v65-panel-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:13px}.v65-panel-actions button{min-height:52px;background:#fff;color:#172033;border:1px solid #cbd5e1;border-radius:11px;font-weight:800}
.v65-admin-section{padding:16px 18px}.v65-admin-open{background:#0f172a;color:#fff;border-radius:11px;padding:12px 18px;font-weight:900}.v65-admin-grid,.v65-account{display:grid;gap:10px}.v65-admin-grid button,.v65-account button{min-height:54px;font-weight:900;color:#fff!important}.v65-account button:nth-child(1){background:#6d28d9!important}.v65-account button:nth-child(2){background:#0f766e!important}.v65-account button:nth-child(3){background:#2563eb!important}.v65-account .v65-leave-btn{background:#d97706!important;color:#fff!important}.v65-account .v65-logout{background:#dc2626!important;color:#fff!important}
.v65-search{width:100%;box-sizing:border-box;margin:0 0 12px}.v65-scroll{overflow:auto}.v65-list-item{border:1px solid var(--v65-border);border-radius:13px;padding:13px;margin:8px 0;background:#fff}.v65-reason{background:#fff1f2;color:#9f1239;border-radius:7px;padding:4px 7px;margin:3px 0;font-size:11px;font-weight:800}
.v54-dept-box.v65-dent{background:#4c1d95!important;color:#fff!important}.v54-dept-box.v65-paint{background:#9a3412!important;color:#fff!important}.v54-dept-box.v65-mech{background:#1e3a8a!important;color:#fff!important}.v54-dept-box.v65-dent *,.v54-dept-box.v65-paint *,.v54-dept-box.v65-mech *{color:#fff!important}
@media(max-width:760px){.v65-control-grid{grid-template-columns:repeat(2,1fr)}.v65-tools-grid,.v65-top-pair{grid-template-columns:1fr}.v65-hours{grid-template-columns:1fr}.v65-panel-actions{grid-template-columns:1fr 1fr}}
`;document.head.appendChild(css);

const priorRender=window.render;
window.render=function(){priorRender();setTimeout(()=>{decorateTop();if(me?.role==='Manager')renderManager65();if(me?.role==='Supervisor')decorateSupervisor()},0)};
setTimeout(()=>{if(me){decorateTop();if(me.role==='Manager')renderManager65();if(me.role==='Supervisor')decorateSupervisor()}},50);
window.v65Ready=true;
})();