(function(){
'use strict';
const HOLD='ID001';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const person=id=>{try{return user(id)||{id,name:id,department:''}}catch(_){return{id,name:id,department:''}}};
const jinfo=no=>{try{return job(no)||{no,vehicle:'',reg:''}}catch(_){return{no,vehicle:'',reg:''}}};
const status=a=>{try{return empStatus(a)}catch(_){return a?.completed?'Finished':'New'}};
const fmtSafe=m=>{try{return fmt(Math.max(0,Number(m)||0))}catch(_){return Math.round(Number(m)||0)+'m'}};
const startDay=ts=>{const d=new Date(ts);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()};

window.startAssignment=function(id){
 if(!me||me.role!=='Employee')return;
 if(activeSession(me.id))return alert('You already have an active job. Pause or finish it first.');
 const a=(state.assign||[]).find(x=>x.id===id&&!x.cancelled&&!x.completed&&x.emp===me.id);
 if(!a)return alert('This assignment is no longer available. Please refresh and try again.');
 if(typeof window.v63IsOnLeave==='function'&&window.v63IsOnLeave(me.id,Date.now()))return alert('You are marked On Leave for this duty period. Work cannot be started during leave.');
 state.sessions.push({id:uid(),assignmentId:a.id,job:a.job,emp:me.id,start:Date.now(),end:null,paused:false,rework:!!a.rework});
 setLastAction('Started '+a.job+(a.rework?' repeat work':''));
 save();
 render();
};

function actual(a){try{return totalForAssignment(a)||0}catch(_){return 0}}
function requestCount(){return (state.requests||[]).filter(r=>r.status==='New').length}
function attentionCount(){try{return typeof window.v66OpenAttention==='function'?(state.assign||[]).filter(a=>a&&!a.cancelled&&!a.completed&&a.job!==HOLD).filter(a=>{
 const ac=actual(a),sg=+a.suggested||0;
 const days=Math.floor((Date.now()-((a.assignedAt||jinfo(a.job).createdAt)||Date.now()))/86400000);
 return (sg>0&&ac>sg)||days>=4||a.rework||status(a)==='Paused';
}).length:0}catch(_){return 0}}

function rows(type){
 const all=(state.assign||[]).filter(a=>a&&!a.cancelled);
 const open=all.filter(a=>!a.completed);
 const d=startDay(Date.now());
 if(type==='today')return all.filter(a=>(a.assignedAt||0)>=d||(a.completedAt||0)>=d||(state.sessions||[]).some(s=>s.assignmentId===a.id&&s.start>=d));
 if(type==='working')return open.filter(a=>a.job!==HOLD&&status(a)==='Started');
 if(type==='notstarted')return open.filter(a=>a.job!==HOLD&&status(a)==='New');
 if(type==='paused')return open.filter(a=>a.job!==HOLD&&status(a)==='Paused');
 if(type==='completed')return all.filter(a=>a.completed&&(a.completedAt||0)>=d);
 if(type==='repeat')return open.filter(a=>a.rework);
 return [];
}
function leaveToday(){const key=new Date().toISOString().slice(0,10);return (state.leaves||[]).filter(l=>!l.cancelled&&l.date===key)}
function waitingNow(){return (state.sessions||[]).filter(s=>s.job===HOLD&&!s.end)}
function controlCounts(){return{
 today:new Set(rows('today').map(a=>a.job)).size,
 working:rows('working').length,
 notstarted:rows('notstarted').length,
 paused:rows('paused').length,
 leave:leaveToday().length,
 completed:rows('completed').filter(a=>a.job!==HOLD).length,
 repeat:new Set(rows('repeat').map(a=>a.job)).size,
 waiting:waitingNow().length
}}

function assignmentRowsHtml(list){
 if(!list.length)return'<div class="notice">No ongoing work.</div>';
 return '<div class="v67-table-wrap"><table><tr><th>JC</th><th>Vehicle</th><th>Registration</th><th>Technician</th><th>Department</th><th>Status</th><th>Allocated</th><th>Actual</th><th></th></tr>'+
 list.map(a=>{const j=jinfo(a.job),u=person(a.emp);return'<tr><td><b>'+esc(a.job)+'</b></td><td>'+esc(j.vehicle||'—')+'</td><td>'+esc(j.reg||'—')+'</td><td><b>'+esc(u.name)+'</b></td><td>'+esc(u.department||'—')+'</td><td>'+esc(status(a))+'</td><td>'+fmtSafe(+a.suggested||0)+'</td><td>'+fmtSafe(actual(a))+'</td><td><button class="v67-view-btn" onclick="openManagerJobDetails(\''+esc(a.job)+'\')">VIEW DETAILS</button></td></tr>'}).join('')+'</table></div>';
}
window.v67OpenActiveJobs=function(){
 const list=rows('working');
 openModal('<div class="section-title"><h2>Active Jobs</h2><button class="secondary" onclick="closeModal()">Close</button></div><p class="muted">Ongoing work. Use View Details to open the full Job Card production record.</p>'+assignmentRowsHtml(list));
};

function period(kind){
 const n=new Date(),d=startDay(n);
 if(kind==='day')return[d,d+86400000];
 if(kind==='week'){const wd=(n.getDay()+6)%7,from=d-wd*86400000;return[from,from+7*86400000]}
 return[new Date(n.getFullYear(),n.getMonth(),1).getTime(),new Date(n.getFullYear(),n.getMonth()+1,1).getTime()];
}
function worked(kind){
 const [from,to]=period(kind);
 return users.filter(u=>u.role==='Employee').reduce((sum,u)=>
   sum+(state.sessions||[]).filter(s=>s.emp===u.id&&s.job!==HOLD&&s.start<to&&(s.end||Date.now())>from).reduce((n,s)=>{
     const st=Math.max(s.start,from),en=Math.min(s.end||Date.now(),to);if(en<=st)return n;
     try{return n+window.sessionNormalMinutes({start:st,end:en},en)}catch(_){return n+(en-st)/60000}
   },0),0);
}

function smallHeader(){
 return '<div class="v67-minihead"><div><span>ZUKAIT TIME TRACK</span><b>Manager Dashboard</b></div><div class="v67-head-right"><small>'+new Date().toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})+'</small><span class="v67-live">● LIVE</span></div></div>';
}
function featureCard(cls,title,count,sub,click){
 return '<button class="v67-feature '+cls+'" onclick="'+click+'"><div><span>'+title+'</span><b>'+count+'</b><small>'+sub+'</small></div><em>›</em></button>';
}
function controlCard(type,label,count,cls){
 return '<button class="v67-control '+cls+'" onclick="v65OpenControl(\''+type+'\')"><span>'+label+'</span><b>'+count+'</b><small>View details</small><em>›</em></button>';
}
function roundHour(kind,label,cls){
 return '<button class="v67-round '+cls+'" onclick="v65OpenHours(\''+kind+'\')"><span>'+label+'</span><b>'+fmtSafe(worked(kind))+'</b><small>View technicians</small></button>';
}
function toolBox(cls,title,sub,buttons){
 return '<div class="v67-toolbox '+cls+'"><div class="v67-tool-head"><h4>'+title+'</h4><p>'+sub+'</p></div><div class="v67-tool-actions">'+buttons+'</div></div>';
}
function renderManager67(){
 const el=document.getElementById('managerView');if(!el||!me||me.role!=='Manager')return;
 const c=controlCounts();
 el.classList.remove('hidden');
 el.innerHTML=smallHeader()+
 '<div class="v67-first-row">'+
 featureCard('blue','Employee Requests',requestCount(),'New / pending requests','v65OpenRequests()')+
 featureCard('rose','Attention',attentionCount(),'Jobs needing review','v66OpenAttention()')+
 '</div>'+
 '<section class="v67-section"><div class="v67-section-title"><div><h3>Workshop Control Center</h3><p>Live workshop status</p></div></div><div class="v67-control-grid">'+
 controlCard('today','Today Jobs',c.today,'sky')+
 controlCard('working','Working Now',c.working,'mint')+
 controlCard('notstarted','Not Started',c.notstarted,'slate')+
 controlCard('paused','Paused',c.paused,'amber')+
 controlCard('leave','On Leave',c.leave,'rose')+
 controlCard('completed','Completed Today',c.completed,'teal')+
 controlCard('repeat','Repeat Work',c.repeat,'violet')+
 controlCard('waiting','Waiting / ID001',c.waiting,'gray')+
 '</div></section>'+
 '<section class="v67-section"><div class="v67-section-title"><div><h3>Actual Worked Hours</h3><p>Productive technician man-hours</p></div></div><div class="v67-round-row">'+
 roundHour('day','TODAY','round-blue')+
 roundHour('week','THIS WEEK','round-green')+
 roundHour('month','THIS MONTH','round-violet')+
 '</div></section>'+
 '<section class="v67-section"><div class="v67-section-title"><div><h3>Job / Production Tools</h3><p>Workshop control and performance</p></div></div><div class="v67-tools">'+
 toolBox('tool-blue','Job Card Tools','Workshop job control',
  '<button onclick="openJobCardManager(\'all\')">Job Card Manager</button><button onclick="v67OpenActiveJobs()">Active Jobs</button><button onclick="openManagerJobsPopup(\'completed\')">Completed Jobs</button><button onclick="openManagerTechniciansPopup()">Technicians</button>')+
 toolBox('tool-green','Production & Reports','Performance and history',
  '<button onclick="openCompletedJobProduction()">Job Production</button><button onclick="openManagerReports()">Reports</button><button onclick="openIncentiveList()">Incentive</button><button onclick="openManagerHistoryPopup()">History</button>')+
 '</div></section>'+
 '<section class="v67-admin-row"><div><h3>Admin</h3><p>Sync, backups and User Management</p></div><button onclick="v65OpenAdmin()">Open Admin ›</button></section>';
}
const css=document.createElement('style');css.id='v67ManagerStyle';css.textContent=`
#managerView{max-width:1180px;margin:auto}
.v67-minihead{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;border:1px solid #dfe7f1;border-radius:14px;background:#fff;box-shadow:0 3px 9px rgba(34,55,80,.05);margin-bottom:12px}.v67-minihead>div:first-child{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.v67-minihead span:first-child{font-size:9px;font-weight:900;letter-spacing:.12em;color:#7a8ba1}.v67-minihead b{font-size:18px;color:#213a59}.v67-head-right{display:flex;align-items:center;gap:10px;color:#6f7e91}.v67-live{font-size:10px!important;background:#edf9f3;color:#17714d!important;border:1px solid #caebd9;padding:5px 8px;border-radius:999px;font-weight:900}
.v67-first-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}.v67-feature{min-height:108px;border-radius:16px;border:1px solid;display:flex;justify-content:space-between;align-items:center;text-align:left;padding:16px;box-shadow:0 6px 14px rgba(37,55,80,.08),0 1px 2px rgba(37,55,80,.08);transition:.12s}.v67-feature:active{transform:translateY(2px);box-shadow:0 2px 6px rgba(37,55,80,.10)}.v67-feature span{display:block;font-size:13px;font-weight:900}.v67-feature b{display:block;font-size:32px;margin:6px 0}.v67-feature small{font-size:11px}.v67-feature em{font-size:30px;font-style:normal;font-weight:300}.v67-feature.blue{background:#eef5ff;color:#234f86;border-color:#cddff5}.v67-feature.rose{background:#fff1f3;color:#944454;border-color:#f0d4d9}
.v67-section{background:#fff;border:1px solid #e0e7ef;border-radius:17px;padding:15px;margin:12px 0;box-shadow:0 3px 10px rgba(34,55,80,.05)}.v67-section-title h3{margin:0;color:#223a57;font-size:17px}.v67-section-title p{margin:3px 0 12px;color:#8090a4;font-size:11px}
.v67-control-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.v67-control{min-height:95px;border-radius:14px;border:1px solid;display:grid;grid-template-columns:1fr auto;text-align:left;padding:13px;box-shadow:0 5px 12px rgba(34,55,80,.08),inset 0 1px rgba(255,255,255,.8);transition:.12s}.v67-control:active{transform:translateY(2px);box-shadow:0 2px 5px rgba(34,55,80,.08)}.v67-control span{font-size:11px;font-weight:900;text-transform:uppercase}.v67-control b{grid-column:1;font-size:27px;margin:4px 0}.v67-control small{grid-column:1;font-size:10px;opacity:.78}.v67-control em{grid-column:2;grid-row:1/4;align-self:center;font-style:normal;font-size:22px}
.v67-control.sky{background:#eef7ff;color:#245b8d;border-color:#cfe3f4}.v67-control.mint{background:#edf9f3;color:#21704e;border-color:#cce9d9}.v67-control.slate{background:#f1f4f7;color:#506173;border-color:#d9e0e7}.v67-control.amber{background:#fff7e8;color:#93621e;border-color:#f0dfbd}.v67-control.rose{background:#fff1f3;color:#984758;border-color:#f0d4d9}.v67-control.teal{background:#eef9f7;color:#2c746d;border-color:#cfe8e4}.v67-control.violet{background:#f5f0ff;color:#6d4a9d;border-color:#ded1f2}.v67-control.gray{background:#f3f5f7;color:#5d6874;border-color:#dce1e6}
.v67-round-row{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;justify-items:center;padding:5px 0}.v67-round{width:min(100%,210px);aspect-ratio:1/1;border-radius:50%;border:1px solid;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;box-shadow:0 8px 18px rgba(34,55,80,.10),inset 0 2px rgba(255,255,255,.85);transition:.12s;padding:20px}.v67-round:active{transform:translateY(3px);box-shadow:0 3px 8px rgba(34,55,80,.10)}.v67-round span{font-size:11px;font-weight:900}.v67-round b{font-size:25px;margin:7px 0}.v67-round small{font-size:10px}.v67-round.round-blue{background:#eff6ff;color:#285b95;border-color:#d2e1f4}.v67-round.round-green{background:#eef9f3;color:#2b7451;border-color:#d3eadc}.v67-round.round-violet{background:#f6f1ff;color:#70509d;border-color:#e2d8f2}
.v67-tools{display:grid;grid-template-columns:1fr 1fr;gap:12px}.v67-toolbox{border:1px solid;border-radius:16px;padding:15px;box-shadow:0 6px 14px rgba(34,55,80,.08),inset 0 1px rgba(255,255,255,.8)}.v67-toolbox.tool-blue{background:#f1f7ff;color:#2f5d8c;border-color:#d2e2f3}.v67-toolbox.tool-green{background:#f1faf5;color:#357255;border-color:#d4e9dd}.v67-tool-head h4{margin:0;font-size:16px}.v67-tool-head p{margin:4px 0 12px;font-size:11px;opacity:.78}.v67-tool-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.v67-tool-actions button{min-height:48px;border-radius:11px;background:rgba(255,255,255,.85);color:inherit;border:1px solid currentColor;font-weight:800;box-shadow:0 2px 6px rgba(34,55,80,.06);opacity:.95}.v67-tool-actions button:active{transform:translateY(1px)}
.v67-admin-row{display:flex;justify-content:space-between;align-items:center;gap:12px;background:#f7f9fc;border:1px solid #e0e6ed;border-radius:14px;padding:13px 15px;margin:12px 0}.v67-admin-row h3{margin:0;color:#35475d;font-size:16px}.v67-admin-row p{margin:3px 0 0;color:#8290a0;font-size:11px}.v67-admin-row button{background:#fff;color:#35475d;border:1px solid #ccd6e1;border-radius:10px;box-shadow:0 3px 8px rgba(34,55,80,.07);font-weight:800}
.v67-table-wrap{overflow:auto}.v67-view-btn{background:#eef5ff;color:#285b8d;border:1px solid #cbdff3;border-radius:8px;font-weight:800}
@media(max-width:780px){.v67-control-grid{grid-template-columns:repeat(2,1fr)}.v67-tools{grid-template-columns:1fr}.v67-round-row{gap:8px}.v67-round{width:min(100%,150px)}}
@media(max-width:560px){.v67-first-row{grid-template-columns:1fr 1fr}.v67-feature{min-height:95px;padding:12px}.v67-feature b{font-size:27px}.v67-round{width:110px}.v67-round b{font-size:18px}.v67-tool-actions{grid-template-columns:1fr}.v67-minihead b{font-size:16px}}
`;document.head.appendChild(css);

const prevRender=window.render;
window.render=function(){prevRender();setTimeout(()=>{if(me?.role==='Manager')renderManager67()},0)};
setTimeout(()=>{if(me?.role==='Manager')renderManager67()},80);
window.v67UpdateCheckResult=function(latestCode,latestName,error){if(typeof window.v66UpdateCheckResult==='function')return window.v66UpdateCheckResult(latestCode,latestName,error);};
window.v67Ready=true;
})();