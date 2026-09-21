(function(){
'use strict';
const HOLD='ID001';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
function ensure(){state.leaves=state.leaves||[];state.leaveAudit=state.leaveAudit||[]}
ensure();
function startDay(ts){const d=new Date(ts);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()}
function leaveWindow(l){const d=startDay(new Date(l.date+'T12:00:00').getTime());if(l.period==='AM')return[d+8*3600000,d+13*3600000];if(l.period==='PM')return[d+15*3600000,d+19*3600000];return[d+8*3600000,d+19*3600000]}
function activeLeaves(emp,from,to){ensure();return state.leaves.filter(l=>!l.cancelled&&l.emp===emp).map(l=>({l,w:leaveWindow(l)})).filter(x=>x.w[1]>from&&x.w[0]<to)}
window.v63LeaveOverlapMinutes=function(emp,from,to){return activeLeaves(emp,from,to).reduce((n,x)=>n+Math.max(0,Math.min(to,x.w[1])-Math.max(from,x.w[0]))/60000,0)}
window.v63IsOnLeave=function(emp,ts=Date.now()){return activeLeaves(emp,ts,ts+1).length>0}
function hasWorkConflict(emp,w){return (state.sessions||[]).some(s=>s.emp===emp&&Math.min(s.end||Date.now(),w[1])>Math.max(s.start,w[0]))}
function leaveLabel(p){return p==='AM'?'Morning 8:00 AM–1:00 PM':p==='PM'?'Afternoon 3:00 PM–7:00 PM':'Full Day'}
function leaveRows(){ensure();return state.leaves.filter(l=>!l.cancelled).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))}
window.v63OpenLeave=function(emp){
 ensure(); const target=emp||me?.id;if(!target)return;
 const canManage=me&&(me.role==='Supervisor'||me.role==='Manager'), self=target===me?.id;
 if(!self&&!canManage)return alert('Leave management is not available for this employee.');
 const u=user(target),today=new Date().toISOString().slice(0,10);
 const rows=leaveRows().filter(l=>l.emp===target).slice(0,12);
 openModal('<div class="section-title"><h2>Leave — '+esc(u.name)+'</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+
 '<div class="grid"><label>Date<br><input type="date" id="v63LeaveDate" min="'+today+'" value="'+today+'"></label><label>Leave Period<br><select id="v63LeavePeriod"><option value="FULL">Full Day</option><option value="AM">Morning — 8:00 AM to 1:00 PM</option><option value="PM">Afternoon — 3:00 PM to 7:00 PM</option></select></label></div>'+
 '<label>Remark (optional)<br><input id="v63LeaveRemark" style="width:100%" placeholder="Leave remark"></label><p><button class="green" onclick="v63SaveLeave(\''+esc(target)+'\')">MARK LEAVE</button></p>'+
 '<h3>Leave Records</h3>'+(rows.length?'<div style="overflow:auto"><table><tr><th>Date</th><th>Period</th><th>Entered By</th><th>Remark</th><th></th></tr>'+rows.map(l=>'<tr><td>'+esc(l.date)+'</td><td>'+esc(leaveLabel(l.period))+'</td><td>'+esc(user(l.by).name)+'</td><td>'+esc(l.remark||'—')+'</td><td>'+(canManage?'<button class="danger" onclick="v63CancelLeave(\''+l.id+'\')">CANCEL</button>':'')+'</td></tr>').join('')+'</table></div>':'<div class="notice">No leave records.</div>'));
}
window.v63SaveLeave=function(emp){
 const date=document.getElementById('v63LeaveDate')?.value,period=document.getElementById('v63LeavePeriod')?.value,remark=document.getElementById('v63LeaveRemark')?.value.trim()||'';
 if(!date||!['FULL','AM','PM'].includes(period))return alert('Select leave date and period.');
 const l={id:uid(),emp,date,period,remark,by:me.id,createdAt:Date.now(),cancelled:false},w=leaveWindow(l);
 if(new Date(w[0]).getDay()===5)return alert('Friday is already a workshop holiday. Leave is not required.');
 if(hasWorkConflict(emp,w))return alert('Work time is already recorded during this leave period. Correct the work/leave conflict before marking leave.');
 if(leaveRows().some(x=>x.emp===emp&&x.date===date&&(x.period==='FULL'||period==='FULL'||x.period===period)))return alert('Leave is already recorded for this period.');
 state.leaves.push(l);state.leaveAudit.push({id:uid(),action:'ADD',leaveId:l.id,by:me.id,at:Date.now()});save();closeModal();render();
}
window.v63CancelLeave=function(id){const l=(state.leaves||[]).find(x=>x.id===id);if(!l)return;if(!confirm('Cancel this leave record?'))return;l.cancelled=true;l.cancelledBy=me.id;l.cancelledAt=Date.now();state.leaveAudit.push({id:uid(),action:'CANCEL',leaveId:id,by:me.id,at:Date.now()});save();closeModal();render();}

function employeeMinutes(emp,from,to){return (state.sessions||[]).filter(s=>s.emp===emp&&s.job!==HOLD).reduce((sum,s)=>{const st=Math.max(s.start,from),en=Math.min(s.end||Date.now(),to);if(en<=st)return sum;try{return sum+window.sessionNormalMinutes({start:st,end:en},en)}catch(_){return sum+(en-st)/60000}},0)}
function periodBounds(kind){const n=new Date(),ds=startDay(n);if(kind==='day')return[ds,ds+86400000,'Today'];if(kind==='week'){const wd=(n.getDay()+6)%7,st=ds-wd*86400000;return[st,st+7*86400000,'This Week']}const st=new Date(n.getFullYear(),n.getMonth(),1).getTime();return[st,new Date(n.getFullYear(),n.getMonth()+1,1).getTime(),'This Month']}
window.v63OpenHours=function(kind){const [from,to,title]=periodBounds(kind),rows=users.filter(u=>u.role==='Employee').map(u=>({u,m:employeeMinutes(u.id,from,to)})).sort((a,b)=>b.m-a.m),total=rows.reduce((n,x)=>n+x.m,0);showManagerModal(title+' — Actual Worked Hours','<div class="notice"><b>Total productive man-hours: '+fmt(total)+'</b></div><div style="overflow:auto"><table><tr><th>Technician</th><th>Department</th><th>Actual Productive Hours</th></tr>'+rows.map(x=>'<tr><td><b>'+esc(x.u.name)+'</b></td><td>'+esc(x.u.department||'')+'</td><td><b>'+fmt(x.m)+'</b></td></tr>').join('')+'</table></div>')}
function hoursCards(){return '<div class="v63-hours"><button class="v63-hour v63-day" onclick="v63OpenHours(\'day\')"><span>TODAY</span><b>'+fmt(employeeTotal('day'))+'</b><small>Tap for technicians</small></button><button class="v63-hour v63-week" onclick="v63OpenHours(\'week\')"><span>THIS WEEK</span><b>'+fmt(employeeTotal('week'))+'</b><small>Tap for technicians</small></button><button class="v63-hour v63-month" onclick="v63OpenHours(\'month\')"><span>THIS MONTH</span><b>'+fmt(employeeTotal('month'))+'</b><small>Tap for technicians</small></button></div>'}
function employeeTotal(k){const [f,t]=periodBounds(k);return users.filter(u=>u.role==='Employee').reduce((n,u)=>n+employeeMinutes(u.id,f,t),0)}

function statusRows(type){let rows=(state.assign||[]).filter(a=>a&&!a.cancelled),today=startDay(Date.now());if(type==='today')rows=rows.filter(a=>(a.assignedAt||0)>=today);if(type==='working')rows=rows.filter(a=>!a.completed&&empStatus(a)==='Started'&&a.job!==HOLD);if(type==='notstarted')rows=rows.filter(a=>!a.completed&&empStatus(a)==='New');if(type==='paused')rows=rows.filter(a=>!a.completed&&empStatus(a)==='Paused');return rows}
window.v63OpenControl=function(type){const titles={today:'Today Jobs',working:'Working Now',notstarted:'Not Started',paused:'Work Paused'},rows=statusRows(type);showManagerModal(titles[type],'<div class="row"><input id="v63ControlSearch" style="flex:1" placeholder="Search JC / vehicle / technician / department" oninput="v63FilterControl()"></div><div id="v63ControlRows" data-type="'+type+'">'+controlTable(rows)+'</div>')}
function controlTable(rows){if(!rows.length)return'<div class="notice">No Job Cards in this section.</div>';return'<div style="overflow:auto"><table><tr><th>JC</th><th>Vehicle</th><th>Department</th><th>Technician</th><th>Status</th><th>Suggested</th><th>Actual</th><th></th></tr>'+rows.map(a=>{const j=job(a.job)||{},u=user(a.emp);return'<tr><td><b>'+esc(a.job)+'</b></td><td>'+esc(j.vehicle||'')+'<br><span class="small">'+esc(j.reg||'')+'</span></td><td>'+esc(u.department||'')+'</td><td>'+esc(u.name)+'</td><td>'+esc(empStatus(a))+'</td><td>'+fmt(+a.suggested||0)+'</td><td>'+fmt(totalForAssignment(a)||0)+'</td><td><button class="blue" onclick="openManagerJobDetails(\''+esc(a.job)+'\')">VIEW</button></td></tr>'}).join('')+'</table></div>'}
window.v63FilterControl=function(){const el=document.getElementById('v63ControlRows'),q=(document.getElementById('v63ControlSearch')?.value||'').toLowerCase();if(!el)return;const rows=statusRows(el.dataset.type).filter(a=>{const j=job(a.job)||{},u=user(a.emp);return[a.job,j.vehicle,j.reg,u.name,u.department,empStatus(a)].join(' ').toLowerCase().includes(q)});el.innerHTML=controlTable(rows)}

window.v63OpenAccount=function(){
 if(!me)return;const version=(()=>{try{return AndroidBridge.getAppVersion()}catch(_){return'Web'}})();
 openModal('<div class="section-title"><h2>'+esc(me.name)+'</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="v63-account"><button onclick="cloudSyncNow&&cloudSyncNow()">SYNC</button><button onclick="v63OpenAbout()">ABOUT</button>'+(me.role==='Employee'?'<button onclick="v63OpenLeave()">LEAVE</button>':'')+'<button class="danger" onclick="logout()">LOGOUT</button></div>');
}
window.v63OpenAbout=function(){let version='Web';try{if(window.AndroidBridge)version=AndroidBridge.getAppVersion()}catch(_){}openModal('<div class="section-title"><h2>About</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="notice"><b>Zukait Time Track</b><br>'+esc(version)+'</div>'+(window.AndroidBridge?'<button class="blue big-action" onclick="v63CheckUpdate()">CHECK FOR UPDATES</button>':'<div class="muted">Web version updates automatically.</div>'))}
window.v63CheckUpdate=function(){try{AndroidBridge.openUpdatePage()}catch(_){alert('App is up to date.')}}

window.v63OpenLeaveTeam=function(){const people=users.filter(u=>u.role==='Employee');showManagerModal('Employee Leave','<div class="grid">'+people.map(u=>'<button class="secondary" onclick="v63OpenLeave(\''+u.id+'\')">'+esc(u.name)+'<br><span class="small">'+esc(u.department||'')+'</span></button>').join('')+'</div>')}

function decorate(){
 return; // V65 owns all final dashboard/account decoration.
 const top=document.querySelector('#app>.row'),welcome=document.getElementById('welcome');if(top&&welcome){welcome.classList.add('v63-name');welcome.onclick=window.v63OpenAccount;[...top.querySelectorAll('button')].forEach(b=>{if(/update app|logout/i.test(b.textContent))b.style.display='none'})}
 if(me?.role==='Manager'){const root=document.getElementById('managerView');if(root){root.querySelector('.v62-hours-wrap')?.closest('.card')?.remove();const hero=root.querySelector('.manager-hero');if(hero){hero.querySelectorAll('.manager-kpi').forEach((k,i)=>{if(i<4){k.onclick=()=>v63OpenControl(['today','working','notstarted','paused'][i]);k.style.cursor='pointer'}});if(!root.querySelector('.v63-hours'))hero.insertAdjacentHTML('afterend','<div class="card"><div class="section-title"><h3>Actual Worked Hours</h3><span class="pill">PRODUCTIVE MAN-HOURS</span></div>'+hoursCards()+'</div>')}const actions=root.querySelector('.manager-actions');if(actions&&!root.querySelector('.v63-admin-btn'))actions.insertAdjacentHTML('beforeend','<button class="manager-action manager-blue v63-admin-btn" onclick="v63OpenAdmin()">⚙<br>ADMIN</button><button class="manager-action manager-amber" onclick="v63OpenLeaveTeam()">🏖<br>LEAVE</button>')}}
 if(me?.role==='Supervisor'){const root=document.getElementById('supervisorView');if(root&&!root.querySelector('.v63-leave-team'))root.insertAdjacentHTML('afterbegin','<div class="card v63-leave-team"><button class="amber" onclick="v63OpenLeaveTeam()">🏖 EMPLOYEE LEAVE</button></div>')}
}
window.v63OpenAdmin=function(){showManagerModal('Admin','<div class="grid"><button class="secondary" onclick="v63Backup()">BACKUP NOW</button><button class="secondary" onclick="v63BackupHistory()">BACKUP HISTORY</button><button class="secondary" onclick="openUserManagement()">USER MANAGEMENT</button></div>')}
window.v63Backup=async function(){if(typeof cloudBackupNow!=='function')return alert('Backup service unavailable.');const r=await cloudBackupNow();alert(r?.ok?'Backup completed.':'Backup could not be completed.')}
window.v63BackupHistory=async function(){if(typeof cloudBackupList!=='function')return alert('Backup history unavailable.');const r=await cloudBackupList();const rows=r?.backups||r?.items||[];showManagerModal('Backup History',rows.length?'<table><tr><th>Date</th><th>Revision</th></tr>'+rows.map(x=>'<tr><td>'+esc(new Date(x.created_at||x.createdAt||Date.now()).toLocaleString())+'</td><td>'+esc(x.revision||'—')+'</td></tr>').join('')+'</table>':'<div class="notice">No backups found.</div>')}

const css=document.createElement('style');css.textContent='.v63-hours{display:flex;gap:18px;justify-content:center;flex-wrap:wrap}.v63-hour{width:176px;height:176px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;border:8px solid #fff;box-shadow:0 8px 24px #0f172a28;transition:.15s}.v63-hour:hover{transform:translateY(-2px)}.v63-hour span{font-size:12px;font-weight:900}.v63-hour b{font-size:24px;margin:7px 0}.v63-hour small{font-size:10px}.v63-day{background:linear-gradient(145deg,#2563eb,#1d4ed8)}.v63-week{background:linear-gradient(145deg,#16a34a,#15803d)}.v63-month{background:linear-gradient(145deg,#f97316,#c2410c)}.v63-name{cursor:pointer!important}.v63-account{display:grid;gap:9px}.v63-account button{min-height:52px}@media(max-width:600px){.v63-hour{width:138px;height:138px;border-width:6px}.v63-hour b{font-size:19px}}';document.head.appendChild(css);
const oldRender=window.render;window.render=function(){oldRender();setTimeout(decorate,0)}
setTimeout(()=>{if(me)decorate()},0);
window.v63Ready=true;
})();