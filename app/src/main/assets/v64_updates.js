(function(){
'use strict';
const HOLD='ID001';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day0=ts=>{const d=new Date(ts);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()};
const todayKey=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};

function leaveAdjustedDuty(emp,start,end){
 let total=0, base=day0(start);
 for(let d=base; d<end; d+=86400000){
   const dt=new Date(d); if(dt.getDay()===5) continue;
   for(const [a,b] of [[8,13],[15,19]]){
     const x=Math.max(start,d+a*3600000), y=Math.min(end,d+b*3600000);
     if(y>x){const leave=typeof window.v63LeaveOverlapMinutes==='function'?window.v63LeaveOverlapMinutes(emp,x,y):0;total+=Math.max(0,(y-x)/60000-leave)}
   }
 }
 return total;
}
window.idleMinutes=function(emp,ts=Date.now()){
 const ss=(typeof dailySessions==='function'?dailySessions(emp,ts):[]).slice().sort((a,b)=>a.start-b.start);
 let idle=0;
 for(let i=1;i<ss.length;i++){const a=ss[i-1].end||Date.now(),b=ss[i].start;if(b>a)idle+=leaveAdjustedDuty(emp,a,b)}
 return idle;
};
window.monthlyIdleMinutes=function(emp,ts=Date.now()){
 const d=new Date(ts),from=new Date(d.getFullYear(),d.getMonth(),1).getTime(),to=new Date(d.getFullYear(),d.getMonth()+1,1).getTime();
 let n=0;for(let x=from;x<to;x+=86400000)n+=window.idleMinutes(emp,x+12*3600000);return n;
};

function allRows(){return (state.assign||[]).filter(a=>a&&!a.cancelled)}
function currentStatus(a){try{return empStatus(a)}catch(_){return a.completed?'Finished':'New'}}
function actual(a){try{return totalForAssignment(a)||0}catch(_){return 0}}
function vehicle(a){try{return job(a.job)||{}}catch(_){return{}}}
function person(id){try{return user(id)||{id,name:id,department:''}}catch(_){return{id,name:id,department:''}}}
function sessionToday(a){const s=day0(Date.now()),t=s+86400000;return (state.sessions||[]).some(x=>x.emp===a.emp&&x.job===a.job&&x.start<t&&(x.end||Date.now())>s)}
function todayRows(){const d=day0(Date.now());return allRows().filter(a=>(a.assignedAt||0)>=d||sessionToday(a)||(a.completedAt||0)>=d)}
function waitingRows(){return (state.sessions||[]).filter(s=>s.job===HOLD&&!s.end)}
function todayLeaves(){const t=todayKey();return (state.leaves||[]).filter(l=>!l.cancelled&&l.date===t)}
function repeatRows(){return allRows().filter(a=>a.rework||(state.reworks||[]).some(r=>r.job===a.job&&(!r.emp||r.emp===a.emp)))}
function rowsFor(type){
 if(type==='today')return todayRows();
 if(type==='working')return allRows().filter(a=>!a.completed&&a.job!==HOLD&&currentStatus(a)==='Started');
 if(type==='notstarted')return allRows().filter(a=>!a.completed&&a.job!==HOLD&&currentStatus(a)==='New');
 if(type==='paused')return allRows().filter(a=>!a.completed&&a.job!==HOLD&&currentStatus(a)==='Paused');
 if(type==='completed')return allRows().filter(a=>a.completed&&(a.completedAt||0)>=day0(Date.now()));
 if(type==='repeat')return repeatRows();
 return [];
}
function controlCounts(){return{
 today:new Set(todayRows().map(a=>a.job)).size,
 working:rowsFor('working').length,
 notstarted:rowsFor('notstarted').length,
 paused:rowsFor('paused').length,
 leave:todayLeaves().length,
 completed:rowsFor('completed').length,
 repeat:repeatRows().filter(a=>!a.completed).length,
 waiting:waitingRows().length
}}
const labels={today:'Today Jobs',working:'Working Now',notstarted:'Not Started',paused:'Paused',leave:'On Leave',completed:'Completed Today',repeat:'Repeat Work',waiting:'Waiting / ID001'};

function jobTable(rows){
 if(!rows.length)return'<div class="notice">No records in this section.</div>';
 return '<div class="v64-scroll"><table><tr><th>JC</th><th>Vehicle</th><th>Department</th><th>Technician</th><th>Status</th><th>Allocated</th><th>Actual</th><th></th></tr>'+
 rows.map(a=>{const j=vehicle(a),u=person(a.emp);return '<tr class="v64-filter-row" data-search="'+e([a.job,j.vehicle,j.reg,u.name,u.department,currentStatus(a)].join(' ').toLowerCase())+'"><td><b>'+e(a.job)+'</b></td><td><b>'+e(j.vehicle||'—')+'</b><br><span class="small">'+e(j.reg||'—')+'</span></td><td>'+e(u.department||'—')+'</td><td>'+e(u.name)+'</td><td>'+e(currentStatus(a))+'</td><td>'+fmt(+a.suggested||0)+'</td><td>'+fmt(actual(a))+'</td><td><button class="blue" onclick="openManagerJobDetails(\''+e(a.job)+'\')">VIEW</button></td></tr>'}).join('')+'</table></div>';
}
window.v64Filter=function(){const q=(document.getElementById('v64Search')?.value||'').toLowerCase();document.querySelectorAll('.v64-filter-row').forEach(r=>r.style.display=!q||r.dataset.search.includes(q)?'':'none')};
window.v64OpenControl=function(type){
 let body='<input id="v64Search" class="v64-search" placeholder="Search JC / vehicle / technician / department" oninput="v64Filter()">';
 if(type==='leave'){const rows=todayLeaves();body+=rows.length?'<div class="v64-scroll"><table><tr><th>Employee</th><th>Department</th><th>Leave Period</th><th>Remark</th></tr>'+rows.map(l=>{const u=person(l.emp);return'<tr class="v64-filter-row" data-search="'+e((u.name+' '+u.department+' '+l.period).toLowerCase())+'"><td><b>'+e(u.name)+'</b></td><td>'+e(u.department||'—')+'</td><td>'+e(l.period==='AM'?'Morning 8–1':l.period==='PM'?'Afternoon 3–7':'Full Day')+'</td><td>'+e(l.remark||'—')+'</td></tr>'}).join('')+'</table></div>':'<div class="notice">No employees on leave today.</div>'}
 else if(type==='waiting'){const rows=waitingRows();body+=rows.length?'<div class="v64-scroll"><table><tr><th>Technician</th><th>Department</th><th>Waiting Since</th><th>Duration</th></tr>'+rows.map(s=>{const u=person(s.emp);return'<tr class="v64-filter-row" data-search="'+e((u.name+' '+u.department).toLowerCase())+'"><td><b>'+e(u.name)+'</b></td><td>'+e(u.department||'—')+'</td><td>'+e(new Date(s.start).toLocaleTimeString())+'</td><td>'+fmt((Date.now()-s.start)/60000)+'</td></tr>'}).join('')+'</table></div>':'<div class="notice">No technicians waiting now.</div>'}
 else body+=jobTable(rowsFor(type));
 showManagerModal(labels[type]||'Workshop Control',body);
};
function controlHTML(){const c=controlCounts(),types=['today','working','notstarted','paused','leave','completed','repeat','waiting'];return '<div class="v64-control-grid">'+types.map(t=>'<button class="v64-control '+t+'" onclick="v64OpenControl(\''+t+'\')"><span>'+labels[t]+'</span><b>'+c[t]+'</b><small>Tap to open</small></button>').join('')+'</div>'}

window.v64OpenAccount=function(){
 if(!me)return;
 openModal('<div class="section-title"><h2>'+e(me.name)+'</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="v64-account"><button class="blue" onclick="v42SyncNow? v42SyncNow():cloudSyncNow()">↻ SYNC</button><button class="secondary" onclick="v64OpenAbout()">ABOUT</button>'+(me.role==='Employee'?'<button class="amber" onclick="v63OpenLeave()">LEAVE</button>':'')+'<button class="danger v64-logout" onclick="logout()">LOGOUT</button></div>');
};
window.v64OpenAbout=function(){let version='Web';try{if(window.AndroidBridge)version=AndroidBridge.getAppVersion()}catch(_){}
 openModal('<div class="section-title"><h2>About</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="notice"><b>Zukait Time Track</b><br>Installed version: '+e(version)+'</div>'+(window.AndroidBridge?'<button class="blue big-action" onclick="v64CheckUpdate()">CHECK FOR UPDATES</button><div id="v64UpdateResult" class="muted"></div>':'<div class="muted">Web version updates automatically.</div>'));
};
window.v64CheckUpdate=function(){const x=document.getElementById('v64UpdateResult');if(x)x.textContent='Checking for updates…';try{AndroidBridge.checkForUpdates()}catch(_){if(x)x.textContent='Unable to check for updates.'}};
window.v64UpdateCheckResult=function(latestCode,latestName,error){
 const x=document.getElementById('v64UpdateResult');if(error){if(x)x.textContent='Update check failed. Please check internet connection.';return}
 let current=0;try{current=AndroidBridge.getAppVersionCode()}catch(_){}
 if(Number(latestCode)<=Number(current)){if(x)x.innerHTML='<b class="ok">App is up to date.</b>';return}
 if(x)x.innerHTML='<b>New version '+e(latestName)+' is available.</b><br><button class="green big-action" onclick="AndroidBridge.openUpdatePage()">DOWNLOAD & INSTALL UPDATE</button>';
};
window.v64OpenAdmin=function(){showManagerModal('Admin','<div class="v64-admin"><button class="blue" onclick="v42SyncNow? v42SyncNow():cloudSyncNow()">↻ SYNC NOW</button><button class="green" onclick="v63Backup()">☁ BACKUP NOW</button><button class="secondary" onclick="v63BackupHistory()">BACKUP HISTORY</button><button class="secondary" onclick="openUserManagement()">USER MANAGEMENT</button></div>')};

function removeLegacy(root){
 root.querySelectorAll('.v42-manager-tools').forEach(x=>x.remove());
 [...root.querySelectorAll('.manager-section')].forEach(x=>{if(/workshop status/i.test(x.textContent||''))x.remove()});
}
function decorateManager(){
 const root=document.getElementById('managerView');if(!root)return;removeLegacy(root);
 const hero=root.querySelector('.manager-hero');if(hero){let k=hero.querySelector('.manager-kpis');if(k){k.className='v64-control-host';k.innerHTML=controlHTML()}}
 const actions=root.querySelector('.manager-actions');if(actions){
   [...actions.querySelectorAll('button')].forEach(b=>{if(/^ADMIN$/i.test((b.textContent||'').trim()))b.remove()});
   if(!actions.querySelector('.v64-admin'))actions.insertAdjacentHTML('beforeend','<button class="manager-action manager-blue v64-admin" onclick="v64OpenAdmin()">⚙<br>ADMIN</button>');
 }
}
function decorateTop(){
 const row=document.querySelector('#app > .row'),w=document.getElementById('welcome');if(!row||!w)return;
 [...row.querySelectorAll('button')].forEach(b=>b.style.display='none');
 w.classList.add('v64-name');w.onclick=window.v64OpenAccount;w.title='Open account menu';
}
function decorateSupervisor(){
 const root=document.getElementById('supervisorView');if(!root)return;
 document.querySelectorAll('.v54-dept-box').forEach(b=>{const t=(b.textContent||'').toLowerCase();b.classList.toggle('v64-dent',t.includes('denting'));b.classList.toggle('v64-paint',t.includes('painting'));b.classList.toggle('v64-mech',t.includes('mechanical'))});
}
const oldDept=window.openTechnicianDeptV56;
if(typeof oldDept==='function')window.openTechnicianDeptV56=function(dept){oldDept(dept);setTimeout(decorateSupervisor,0)};

const css=document.createElement('style');css.textContent=`
.v64-control-host{margin-top:16px}.v64-control-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px}.v64-control{min-height:105px;border-radius:16px;padding:12px;color:#fff!important;text-align:left;box-shadow:0 7px 18px #0002}.v64-control span{display:block;font-weight:900;font-size:12px}.v64-control b{display:block;font-size:27px;margin:6px 0}.v64-control small{opacity:.9}.v64-control.today{background:#183b68}.v64-control.working{background:#166534}.v64-control.notstarted{background:#4c1d95}.v64-control.paused{background:#92400e}.v64-control.leave{background:#9f1239}.v64-control.completed{background:#065f46}.v64-control.repeat{background:#7e22ce}.v64-control.waiting{background:#374151}.v64-search{width:100%;box-sizing:border-box;margin:0 0 12px}.v64-scroll{overflow:auto}.v64-account,.v64-admin{display:grid;gap:10px}.v64-account button,.v64-admin button{min-height:54px;font-weight:800}.v64-logout{background:#b91c1c!important}.v64-name{cursor:pointer}.v54-dept-box.v64-dent{background:#4c1d95!important;color:#fff!important}.v54-dept-box.v64-paint{background:#9a3412!important;color:#fff!important}.v54-dept-box.v64-mech{background:#1e3a8a!important;color:#fff!important}.v54-dept-box.v64-dent *, .v54-dept-box.v64-paint *, .v54-dept-box.v64-mech *{color:#fff!important}@media(max-width:700px){.v64-control-grid{grid-template-columns:repeat(2,1fr)}}`;document.head.appendChild(css);

const prior=window.render;window.render=function(){prior();setTimeout(()=>{decorateTop();if(me?.role==='Manager')decorateManager();if(me?.role==='Supervisor')decorateSupervisor()},0)};
setTimeout(()=>{if(me){decorateTop();if(me.role==='Manager')decorateManager();if(me.role==='Supervisor')decorateSupervisor()}},0);
window.v64Ready=true;
})();