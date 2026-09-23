(function(){'use strict';
const H='ID001',E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),P=id=>{try{return user(id)}catch(_){return{name:id,department:''}}},J=n=>{try{return job(n)}catch(_){return null}},A=a=>{try{return totalForAssignment(a)||0}catch(_){return 0}},F=m=>{try{return fmt(Math.max(0,+m||0))}catch(_){return Math.round(+m||0)+'m'}},AA=n=>(state.assign||[]).filter(a=>a&&!a.cancelled&&a.job===n),READY=()=>(state.jobs||[]).filter(x=>x&&x.no!==H&&!x.delivered&&!x.archived&&AA(x.no).length&&AA(x.no).every(a=>a.completed)),AS=s=>(state.assign||[]).find(a=>a.id===s?.assignmentId)||(state.assign||[]).filter(a=>a.job===s?.job&&a.emp===s?.emp&&!a.cancelled&&!a.completed).sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0))[0];
window.v74Msg=(m,t='Information')=>openModal('<div class="v74-d"><h2>'+E(t)+'</h2><div class="notice">'+E(m)+'</div><div class="v74-actions"><button class="blue" onclick="closeModal()">OK</button></div></div>');
window.pause=function(){if(!me||me.role!=='Employee')return;let s=activeSession(me.id);if(!s)return;if(s.job===H)return v74Msg('ID001 Ideal Time Card uses START / STOP only.','Ideal Time');openModal('<div class="v74-d"><h2>⏸ Pause Work</h2><div class="v74-jc">Job Card <b>'+E(s.job)+'</b> · '+E(P(me.id).name)+'</div><label>Pause reason <span class="muted">(optional)</span><textarea id="v74pr" rows="3" placeholder=""></textarea></label><div class="v74-actions"><button class="secondary" onclick="closeModal()">CANCEL</button><button class="v74-pause" onclick="v74Pause()">⏸ PAUSE</button></div></div>')};
window.v74Pause=function(){let s=activeSession(me.id);if(!s)return closeModal();if(s.job===H){closeModal();return v74Msg('ID001 Ideal Time Card cannot be paused. Use STOP.','Ideal Time')}let r=(document.getElementById('v74pr')?.value||'').trim();s.end=now();s.paused=true;s.pauseReason=r;let a=AS(s);if(a)a.pauseReason=r;if(typeof setLastAction==='function')setLastAction('Paused '+s.job);try{save()}catch(e){console.warn(e)}closeModal();render()};
window.finish=function(){if(!me||me.role!=='Employee')return;let s=activeSession(me.id),a=AS(s);if(!s||!a)return;let o=s.job===H?0:AA(s.job).filter(x=>x.id!==a.id&&!x.completed).length,n=s.job===H?'Stop the Ideal Time card?':o?o+' other employee assignment(s) remain open. This Job Card is not Ready for Delivery yet.':'This is the last open employee assignment. The Job Card will become Ready for Delivery.';openModal('<div class="v74-d"><h2>'+(s.job===H?'■ Stop':'✓ Finish Work')+'</h2><div class="v74-jc">Job Card <b>'+E(s.job)+'</b> · '+E(P(me.id).name)+'</div><div class="notice">'+E(n)+'</div><div class="v74-actions"><button class="secondary" onclick="closeModal()">CANCEL</button><button class="green" onclick="v74Finish()">✓ '+(s.job===H?'STOP':'FINISH')+'</button></div></div>')};
window.v74Finish=function(){let s=activeSession(me.id),a=AS(s);if(!s||!a)return closeModal();let t=now();s.end=t;s.finished=true;s.paused=false;a.completed=true;a.completedAt=t;if(s.job!==H){let j=J(s.job);if(j){let done=AA(s.job).length>0&&AA(s.job).every(x=>x.completed);j.status=done?'Completed':'Open';if(done)j.completedAt=Math.max(...AA(s.job).map(x=>+x.completedAt||0),t);else delete j.completedAt}}if(typeof setLastAction==='function')setLastAction((s.job===H?'Stopped ':'Finished ')+s.job);try{save()}catch(e){console.warn(e)}closeModal();render()};
function T(rows){if(!rows.length)return'<div class="notice">No matching work.</div>';return'<div class="v74-scroll"><table><tr><th>Employee</th><th>JC</th><th>Vehicle / Reg.</th><th>Department</th><th>Allocated</th><th>Actual</th><th>Completed</th><th></th></tr>'+rows.map(a=>{let x=J(a.job)||{},u=P(a.emp);return'<tr><td><b>'+E(u.name)+'</b></td><td><b>'+E(a.job)+'</b></td><td>'+E(x.vehicle||'—')+'<br>'+E(x.reg||'—')+'</td><td>'+E(u.department||'—')+'</td><td>'+F(a.suggested)+'</td><td>'+F(A(a))+'</td><td>'+E(a.completedAt?new Date(a.completedAt).toLocaleString():'—')+'</td><td><button class="blue" onclick="openSupervisorJob(\''+E(a.job)+'\')">VIEW</button></td></tr>'}).join('')+'</table></div>'}
window.openSupervisorFinishedWindow=()=>{let d=new Date();d.setHours(0,0,0,0);showSupervisorModal('✅ Finished Jobs Today — Individual Work',T((state.assign||[]).filter(a=>a&&!a.cancelled&&a.completed&&a.job!==H&&(a.completedAt||0)>=d.getTime()).sort((a,b)=>(b.completedAt||0)-(a.completedAt||0))))};
window.v74ManagerCompletedJobs=function(){let rows=(state.assign||[]).filter(a=>a&&!a.cancelled&&a.completed&&a.job!==H).sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));openModal('<div class="section-title"><h2>✓ Completed Job Cards — Individual Work</h2><button class="secondary" onclick="closeModal()">Close</button></div><p class="muted">Each completed employee assignment is shown separately. A Job Card may appear more than once when multiple employees completed work on it.</p>'+T(rows).replace(/openSupervisorJob/g,'openManagerJobDetails'))};
window.openManagerJobsPopup=(function(old){return function(type){if(type==='completed')return window.v74ManagerCompletedJobs();return typeof old==='function'?old.apply(this,arguments):undefined}})(window.openManagerJobsPopup);
window.v74Ready=function(mode){let rows=READY(),body=rows.length?'<div class="v74-scroll"><table><tr><th>JC</th><th>Vehicle / Reg.</th><th>Employees</th><th>Status</th><th></th></tr>'+rows.map(x=>'<tr><td><b>'+E(x.no)+'</b></td><td>'+E(x.vehicle||'—')+'<br>'+E(x.reg||'—')+'</td><td>'+[...new Set(AA(x.no).map(a=>P(a.emp).name))].map(E).join(', ')+'</td><td><b>ALL WORK COMPLETE</b></td><td><button class="blue" onclick="'+(mode==='manager'?'openManagerJobDetails':'openSupervisorJob')+'(\''+E(x.no)+'\')">VIEW</button></td></tr>').join('')+'</table></div>':'<div class="notice">No Job Cards are Ready for Delivery.</div>';mode==='manager'?openModal('<div class="section-title"><h2>🚗✓ Ready for Delivery</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+body):showSupervisorModal('🚗✓ Ready for Delivery',body)};
window.supervisorOverview=function(rows){let open=(rows||[]).filter(a=>a&&!a.cancelled&&!a.completed&&a.job!==H),active=open.filter(a=>{let s=activeSession(a.emp);return s&&s.job===a.job}).length,paused=open.filter(a=>{try{return empStatus(a)==='Paused'}catch(_){return false}}).length,day=(()=>{let d=new Date();d.setHours(0,0,0,0);return d.getTime()})(),fin=(rows||[]).filter(a=>a&&!a.cancelled&&a.completed&&a.job!==H&&(a.completedAt||0)>=day).length,over=open.filter(a=>(+a.suggested||0)>0&&A(a)>+a.suggested).length,ot=(state.sessions||[]).filter(s=>!s.end&&s.job!==H).filter(s=>{try{return sessionOvertimeMinutes(s,Date.now())>0}catch(_){return false}}).length,r=READY().length,C=(i,l,n,c,k)=>'<div class="notice clickable glance-box v83-glass '+k+'" onclick="'+c+'"><span class="v74-icon">'+i+'</span><div><b>'+l+'</b><div class="stat">'+n+'</div></div></div>';return'<div class="card"><h3><span class="live-dot"></span>Today at a Glance</h3><div class="v74-six">'+C('👷','Active Workers',active,'openActiveWorkers()','ga')+C('⏸','Paused Jobs',paused,"openGlanceList('paused')",'gp')+C('✅','Finished Jobs',fin,'openSupervisorFinishedWindow()','gf')+C('🚗✓','Ready for Delivery',r,"v74Ready(\'supervisor\')",'gr')+C('⏱','Overtime Now',ot,'v74OT()','go')+C('⚠','Over Allocated Time',over,"openGlanceList('over')",'gx')+'</div></div>'+v84TechnicianBoard()+'<div id="v84TechDetails"></div>'+v75EffSection()};
const v103SupervisorOverviewAuthority=window.supervisorOverview;
// Permanent Supervisor Technician Board authority: old V56 modal board is retired.
window.openTechnicianBoardV56=function(){if(me?.role==='Supervisor'){const b=document.querySelector('#supervisorView .v84-tech-board');if(b){b.scrollIntoView({behavior:'smooth',block:'center'});return}}};
window.openTechnicianDeptV56=function(dept){return window.v84OpenDept(dept)};
function v84TechState(u){let s=activeSession(u.id),st='Available';if(s){let ot=0;try{ot=sessionOvertimeMinutes(s,Date.now())}catch(_){}let a=AS(s),paused=false;try{paused=(a&&empStatus(a)==='Paused')||!!s.paused}catch(_){paused=!!s.paused}st=ot>0?'Overtime':(paused?'Paused':'Working')}return{session:s,status:st}}
function v84TechnicianBoard(){let ds=[['Denter','DENTING','🛠️','v84-denter'],['Painter','PAINTING','<span class="v113-spray" aria-label="Paint spray">▰<i>•••</i></span>','v84-painter'],['Mechanic','MECHANICAL','⚙️','v84-mechanic']];return '<div class="card v84-tech-board v92-tech-board"><div class="v92-tech-title"><div><h3>👷 Technician Board</h3><small>Live workshop status · tap a department</small></div><span class="v92-live-dot">● LIVE</span></div><div class="v84-depts v92-tech-depts">'+ds.map(d=>{let t=(users||[]).filter(u=>u.role==='Employee'&&u.department===d[0]),working=t.filter(u=>{let x=v84TechState(u);return x.status==='Working'||x.status==='Overtime'}).length;return '<button class="v84-dept v92-tech-dept '+d[3]+'" onclick="v84OpenDept(\''+d[0]+'\')"><span class="v92-dept-icon">'+d[2]+'</span><b>'+d[1]+'</b><strong>'+working+' <em>/ '+t.length+'</em></strong><small>WORKING / TOTAL</small><i>Tap to view ›</i></button>'}).join('')+'</div></div>'}
window.v84OpenDept=function(dept){let team=(users||[]).filter(u=>u.role==='Employee'&&u.department===dept),label=dept==='Denter'?'Denting':dept==='Painter'?'Painting':'Mechanical';let body='<div class="v84-tech-details"><div class="v84-tech-grid">'+(team.length?team.map(u=>{let x=v84TechState(u);return '<div class="v84-tech-card"><button class="v84-tech-name" onclick="v84ToggleTech(\''+u.id+'\',this)"><b>'+E(u.name)+'</b><span class="v84-status v84-status-'+E(x.status.toLowerCase())+'">● '+E(x.status)+'</span></button><div class="v84-tech-expand"></div></div>'}).join(''):'<div class="notice">No technicians in this department.</div>')+'</div></div>';showSupervisorModal('👷 '+E(label)+' Technicians',body)};
window.v84ToggleTech=function(emp,btn){
 let root=btn.closest('.v84-tech-details');if(!root)return;
 root.querySelectorAll('.v84-tech-expand').forEach(x=>{if(x!==btn.nextElementSibling)x.innerHTML=''});
 let out=btn.nextElementSibling;if(!out)return;if(out.innerHTML){out.innerHTML='';return}
 let open=(state.assign||[]).filter(a=>a&&a.emp===emp&&!a.cancelled&&!a.completed);
 let live=null;try{live=activeSession(emp)}catch(_){}
 let a=live?AS(live):null;
 if(!a||a.emp!==emp||a.cancelled||a.completed){
   a=open.find(x=>{try{return empStatus(x)==='Started'}catch(_){return false}})
     ||open.find(x=>{try{return empStatus(x)==='Paused'}catch(_){return false}})
     ||open.sort((x,y)=>(+y.assignedAt||0)-(+x.assignedAt||0))[0];
 }
 if(!a){out.innerHTML='<div class="v84-tech-body"><b>AVAILABLE</b><br>No active job card.</div>';return}
 let j=J(a.job)||{},ac=A(a),sg=+a.suggested||0,rm=Math.max(0,sg-ac),ex=Math.max(0,ac-sg),st='Assigned';
 try{st=empStatus(a);let ot=live&&live.job===a.job?sessionOvertimeMinutes(live,Date.now()):0;if(ot>0)st='Overtime'}catch(_){}
 out.innerHTML='<div class="v84-tech-body"><b>JC '+E(a.job)+'</b><br><b>Vehicle / Model:</b> '+E(j.vehicle||'—')+'<br><b>Registration:</b> '+E(j.reg||'—')+'<br><b>Status:</b> '+E(st)+'<br><b>Suggested / Allocated:</b> '+F(sg)+'<br><b>Actual:</b> '+F(ac)+'<br>'+(ex>0?'<b>Exceeded:</b> '+F(ex):'<b>Remaining:</b> '+F(rm))+'</div>';
};
window.v74OT=function(){let rows=(state.sessions||[]).filter(s=>!s.end&&s.job!==H).map(s=>({s,m:(()=>{try{return sessionOvertimeMinutes(s,Date.now())}catch(_){return 0}})()})).filter(x=>x.m>0);showSupervisorModal('⏱ Overtime Now',rows.length?'<table><tr><th>Employee</th><th>JC</th><th>Overtime</th></tr>'+rows.map(x=>'<tr><td>'+E(P(x.s.emp).name)+'</td><td>'+E(x.s.job)+'</td><td><b>'+F(x.m)+'</b></td></tr>').join('')+'</table>':'<div class="notice">No employee is in overtime now.</div>')};
function v74AttentionRows(){return (state.assign||[]).filter(a=>a&&!a.cancelled&&!a.completed&&a.job!==H).map(a=>{let rs=[],st='';try{st=empStatus(a)}catch(_){}let x=A(a),sg=+a.suggested||0,j=J(a.job)||{},d=Math.floor((Date.now()-((a.assignedAt||j.createdAt)||Date.now()))/86400000);if(sg&&x>sg)rs.push('Over allocated by '+F(x-sg));if(d>=4)rs.push('Open '+d+' days');if(st==='Paused')rs.push('Paused');if(a.rework)rs.push('Repeat Work open');return{a,rs}}).filter(x=>x.rs.length)}
window.v74AttentionCount=()=>v74AttentionRows().length;
window.v66OpenAttention=function(){let rows=v74AttentionRows(),body=rows.length?'<div class="v74-scroll"><table><tr><th>JC</th><th>Employee</th><th>Reason</th><th>Allocated</th><th>Actual</th><th></th></tr>'+rows.map(x=>'<tr><td><b>'+E(x.a.job)+'</b></td><td>'+E(P(x.a.emp).name)+'</td><td>'+x.rs.map(E).join('<br>')+'</td><td>'+F(x.a.suggested)+'</td><td>'+F(A(x.a))+'</td><td><button class="blue" onclick="openManagerJobDetails(\''+E(x.a.job)+'\')">VIEW</button></td></tr>').join('')+'</table></div>':'<div class="notice">No work needs attention.</div>';openModal('<div class="section-title"><h2>⚠ Attention</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+body)};
const OC=window.v65OpenControl;window.v65OpenControl=function(t){if(t!=='completed')return typeof OC==='function'?OC(t):undefined;let d=new Date();d.setHours(0,0,0,0);openModal('<div class="section-title"><h2>✅ Completed Today — Individual Work</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+T((state.assign||[]).filter(a=>a&&!a.cancelled&&a.completed&&a.job!==H&&(a.completedAt||0)>=d.getTime())))};
window.editJobManager=function(no){let x=J(no);if(!x||me?.role!=='Manager')return;let aa=AA(no);window.v74ea=aa.map(a=>a.id);openModal('<div class="section-title"><h3>Edit Job Card '+E(no)+'</h3><button class="secondary" onclick="closeModal()">Cancel</button></div><div class="grid"><label>Job Card Number<br><input id="editJCNo" value="'+E(x.no)+'"></label><label>Vehicle / Model<br><input id="editJCVehicle" value="'+E(x.vehicle||'')+'"></label><label>Registration Number<br><input id="editJCReg" value="'+E(x.reg||'')+'"></label><label>Work Assigned Date<br><input id="editJCDate" type="date" value="'+new Date(x.createdAt||Date.now()).toISOString().slice(0,10)+'"></label></div><div class="v74-times"><h4>Suggested Time by Employee</h4>'+aa.map((a,i)=>'<label><b>'+E(P(a.emp).name)+'</b><input id="v74s'+i+'" inputmode="decimal" value="'+Math.floor((+a.suggested||0)/60)+'.'+String(Math.round((+a.suggested||0)%60)).padStart(2,'0')+'"><span class="small muted">Actual '+F(A(a))+'</span></label>').join('')+'</div><div class="notice small">Actual worked time and history will not be changed.</div><button class="blue" onclick="v74SaveEdit(\''+E(no)+'\')">SAVE CHANGES</button>')};
window.v74SaveEdit=function(oldNo){let x=J(oldNo),n=(document.getElementById('editJCNo')?.value||'').trim().toUpperCase(),v=(document.getElementById('editJCVehicle')?.value||'').trim(),r=(document.getElementById('editJCReg')?.value||'').trim().toUpperCase(),ds=document.getElementById('editJCDate')?.value||'';if(!x||!n||!v||!r)return v74Msg('All Job Card fields are required.');if(n!==oldNo&&J(n))return v74Msg('That Job Card Number already exists.');let ch=[],vals=[];for(let i=0;i<(window.v74ea||[]).length;i++){let id=window.v74ea[i],a=(state.assign||[]).find(z=>z.id===id);if(!a)continue;let raw=(document.getElementById('v74s'+i)?.value||'').trim(),z=parseWorkMinutes(raw);if(!raw||!Number.isFinite(z)||z<=0)return v74Msg('Enter a valid Suggested Time for '+P(a.emp).name+'. Use hours.minutes, for example 1.30.','Suggested Time');vals.push({a,z})}vals.forEach(({a,z})=>{if(z!==+a.suggested){ch.push({assignmentId:a.id,emp:a.emp,oldMinutes:+a.suggested,newMinutes:z});a.suggested=z}});let old={no:x.no,vehicle:x.vehicle,reg:x.reg,assignedDate:x.createdAt};(state.assign||[]).filter(a=>a.job===oldNo).forEach(a=>{a.job=n;if(ds&&!a.assignedAt)a.assignedAt=new Date(ds+'T09:00:00').getTime()});(state.sessions||[]).forEach(s=>{if(s.job===oldNo)s.job=n});['reworks','requests','additionalActions','corrections'].forEach(k=>(state[k]||[]).forEach(z=>{if(z&&z.job===oldNo)z.job=n}));x.no=n;x.vehicle=v;x.reg=r;x.createdAt=ds?new Date(ds+'T09:00:00').getTime():(x.createdAt||now());state.jobEdits=state.jobEdits||[];state.jobEdits.push({old,newValue:{no:n,vehicle:v,reg:r,assignedDate:ds},suggestedChanges:ch,by:me.id,at:now()});state.suggestedEdits=state.suggestedEdits||[];ch.forEach(c=>state.suggestedEdits.push({...c,job:n,by:me.id,at:now()}));try{save()}catch(e){console.warn(e)}closeModal();render()};
const OS=window.v68ManagerSearch;window.v68ManagerSearch=function(){if(!(document.getElementById('v68ManagerSearch')?.value||'').trim())return v74Msg('Enter Job Card Number or Registration Number.','Job Card Search');return typeof OS==='function'?OS():undefined};

function v75MonthBounds(v){let d=v?new Date(v+'-01T00:00:00'):new Date(),y=d.getFullYear(),m=d.getMonth();return{from:new Date(y,m,1).getTime(),to:new Date(y,m+1,1).getTime(),key:y+'-'+String(m+1).padStart(2,'0')}}
function v75NormalMinutes(st,en){try{return window.sessionNormalMinutes({start:st,end:en},en)||0}catch(_){return Math.max(0,(en-st)/60000)}}
function v75EffRows(key){let b=v75MonthBounds(key),map={};(state.assign||[]).filter(a=>a&&!a.cancelled&&a.completed&&!a.rework&&a.job!==H&&+a.completedAt>=b.from&&+a.completedAt<b.to).forEach(a=>{let u=P(a.emp),r=map[a.emp]||(map[a.emp]={id:a.emp,name:u.name,department:u.department||'',jobs:0,suggested:0,actual:0});r.jobs++;r.suggested+=+a.suggested||0;(state.sessions||[]).filter(s=>s&&(s.assignmentId===a.id||(!s.assignmentId&&s.job===a.job&&s.emp===a.emp))&&s.rework!==true).forEach(s=>{let st=Math.max(+s.start||0,b.from),en=Math.min(+(s.end||s.start)||0,b.to);if(en>st)r.actual+=v75NormalMinutes(st,en)})});return Object.values(map).map(r=>({...r,eff:r.actual>0?r.suggested/r.actual*100:null}))}
function v75Group(rows,dept){let x=dept?rows.filter(r=>(r.department||'').toLowerCase()===dept.toLowerCase()):rows,sg=x.reduce((n,r)=>n+r.suggested,0),ac=x.reduce((n,r)=>n+r.actual,0);return{rows:x,eff:ac>0?sg/ac*100:null}}
function v75Pct(v){return v==null?'—':v.toFixed(1)+'%'}
function v75EffSection(key){let rows=v75EffRows(key),all=v75Group(rows),dent=v75Group(rows,'Denter'),paint=v75Group(rows,'Painter'),k=v75MonthBounds(key).key,g=(title,g,cls,mode)=>'<button class="v75-eff '+cls+'" onclick="v75OpenEfficiency(&quot;'+mode+'&quot;,&quot;'+k+'&quot;)"><span class="v75-ring"><span class="v75-eff-logo">↗</span><small>'+title+'</small><b>'+v75Pct(g.eff)+'</b></span></button>';return'<section class="v67-section v75-eff-section"><div class="v67-section-title v75-eff-head"><div><h3>Employee Efficiency</h3></div><label>Month <input id="v75EffMonth" type="month" value="'+k+'" onchange="v75ChangeEfficiency(this.value)"></label></div><div class="v75-eff-row">'+g('Monthly Efficiency',all,'v75-blue','all')+g('Denting Efficiency',dent,'v75-green','denter')+g('Painting Efficiency',paint,'v75-orange','painter')+'</div></section>'}
window.v75ChangeEfficiency=function(key){let old=document.querySelector('.v75-eff-section');if(old)old.outerHTML=v75EffSection(key)}
window.v75OpenEfficiency=function(mode,key){let rows=v75EffRows(key);if(mode==='denter')rows=rows.filter(r=>(r.department||'').toLowerCase()==='denter');if(mode==='painter')rows=rows.filter(r=>(r.department||'').toLowerCase()==='painter');rows.sort((a,b)=>(b.eff??-1)-(a.eff??-1));let title=mode==='all'?'Monthly Efficiency':mode==='denter'?'Denting Efficiency':'Painting Efficiency',body=rows.length?'<div class="v74-scroll"><table><tr><th>#</th><th>Employee</th><th>Department</th><th>Finished Jobs</th><th>Suggested</th><th>Actual</th><th>Efficiency</th></tr>'+rows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td><b>'+E(r.name)+'</b></td><td>'+E(r.department||'—')+'</td><td>'+r.jobs+'</td><td>'+F(r.suggested)+'</td><td>'+F(r.actual)+'</td><td><b>'+v75Pct(r.eff)+'</b></td></tr>').join('')+'</table></div>':'<div class="notice">No finished productive work for this month.</div>';openModal('<div class="section-title"><h2>'+E(title)+' — '+E(key)+'</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+body)}

function polish(){if(me?.role!=='Manager')return;let root=document.getElementById('managerView'),top=root?.querySelector('.v67-first-row'),att=top?.querySelector('button:nth-child(2) span');if(top&&!top.querySelector('.v74-ready')){top.classList.add('v74-top');let b=document.createElement('button');b.className='v67-feature v74-ready';b.onclick=()=>v74Ready('manager');b.innerHTML='<div><span>🚗✓ Ready for Delivery</span><b>'+READY().length+'</b><small>All work complete</small></div><em>›</em>';top.appendChild(b);let q=top.querySelector('button:first-child span');if(q&&!q.textContent.startsWith('📩'))q.textContent='📩 '+q.textContent;if(att&&!att.textContent.startsWith('⚠'))att.textContent='⚠ '+att.textContent}if(att){let n=att.closest('button')?.querySelector('b');if(n)n.textContent=String(v74AttentionCount())}if(top){let rb=top.querySelector('.v74-ready b');if(rb)rb.textContent=String(READY().length)}let cc=root?.querySelector('.v67-control.teal b');if(cc){let d=new Date();d.setHours(0,0,0,0);cc.textContent=String((state.assign||[]).filter(x=>x&&!x.cancelled&&x.completed&&x.job!==H&&(x.completedAt||0)>=d.getTime()).length)}root?.querySelectorAll('button[onclick*="v68ManagerSearch"]').forEach(b=>b.classList.add('v74-search'));if(root&&!root.querySelector('.v75-eff-section')){let hours=[...root.querySelectorAll('.v67-section')].find(x=>(x.querySelector('h3')?.textContent||'').includes('Actual Worked Hours'));if(hours)hours.insertAdjacentHTML('afterend',v75EffSection())}}
const OR=window.render;window.render=function(){OR();setTimeout(polish,0)};setTimeout(polish,100);
// V74 final dashboard rendering hook: apply the requested layout after the role view itself renders.
// This avoids later role-specific renderers replacing the V74 dashboard markup.
// Permanent authority: route the final Supervisor overview through one controlled path.
const v101SupervisorOverviewAuthority=v103SupervisorOverviewAuthority;
function v74ApplySupervisorFinal(){
 if(me?.role!=='Supervisor')return;
 let root=document.getElementById('supervisorView')||document.querySelector('[id*="supervisor"][id*="View"]');
 if(!root)return;
 // Lock the agreed Supervisor layout directly on the rendered DOM.
 const quick=root.querySelector('.quick-entry');
 if(quick){quick.classList.add('v89-quick-entry');const qg=quick.querySelector('.grid');if(qg)qg.classList.add('v89-two-col')}
 const assignPanel=[...root.querySelectorAll('.card')].find(x=>/Assign\s*\/\s*Update Job Card/i.test(x.textContent||''));
 if(assignPanel){assignPanel.classList.add('v89-assign-panel');const ag=assignPanel.querySelector('.grid');if(ag)ag.classList.add('v89-two-col')}
 // Rebuild the authoritative Supervisor overview every render. Never depend on a legacy
 // "Today at a Glance" card being present: older layers may already have replaced it.
 let cards=[...root.querySelectorAll('.card')];
 let glance=cards.find(x=>(x.querySelector('h3')?.textContent||'').includes('Today at a Glance'));
 let currentFinal=root.querySelector('.v74-supervisor-final');
 let wrap=document.createElement('div');
 wrap.className='v74-supervisor-final';
 wrap.innerHTML=v101SupervisorOverviewAuthority(state.assign||[]);
 if(currentFinal&&currentFinal.isConnected)currentFinal.replaceWith(wrap);
 else if(glance&&glance.isConnected)glance.replaceWith(wrap);
 else{
   const anchor=assignPanel||quick||root.querySelector('.v92-supervisor-top,.v91-role-identity')||root.firstElementChild;
   if(anchor&&anchor.parentNode)anchor.insertAdjacentElement('afterend',wrap);else root.prepend(wrap);
 }
 // Remove any duplicate legacy overview/board/efficiency surfaces left by earlier renderers.
 [...root.querySelectorAll('.card')].filter(x=>!wrap.contains(x)&&(x.querySelector('h3')?.textContent||'').includes('Today at a Glance')).forEach(x=>x.remove());
 [...root.querySelectorAll('.v56-technician-board-card,.v84-tech-board')].filter(x=>!wrap.contains(x)).forEach(x=>x.remove());
 // Remove every legacy Technician Board by heading/text, even when an old renderer used no known class.
 [...root.querySelectorAll('.card')].filter(x=>!wrap.contains(x)&&/Technician Board(?:\s*[—-]\s*Live)?/i.test(x.querySelector('h3')?.textContent||x.textContent||'')).forEach(x=>x.remove());
 [...root.querySelectorAll('.v75-eff-section')].filter(x=>!wrap.contains(x)).forEach(x=>x.remove());
 // Always apply the authoritative Supervisor panels/header after the overview is guaranteed.
 v84SupervisorPanels(root);
 v91RoleHeader('Supervisor');
 root.dataset.supervisorUi='v103-authoritative';
}
window.v92OpenAvailableWorkers=function(){let team=(users||[]).filter(u=>u.role==='Employee'&&!v84TechState(u).session),body=team.length?'<div class="v84-tech-grid">'+team.map(u=>'<div class="v84-tech-card"><div class="v84-tech-name"><b>'+E(u.name)+'</b><span class="v84-status v84-status-available">● Available</span></div><div class="small muted">'+E(u.department||'Technician')+'</div></div>').join('')+'</div>':'<div class="notice">No technicians are available now.</div>';showSupervisorModal('👷 Available Workers',body)};
function v84SupervisorPanels(root){
 const cards=[...root.querySelectorAll('.card')];
 const assignCard=cards.find(x=>{const h=x.querySelector('h3');return h&&/Assign\s*\/\s*Update Job Card/i.test(h.textContent||'')});if(assignCard)assignCard.classList.add('v91-assign-card');
 const byTitle=t=>cards.find(x=>{const h=x.querySelector('h3');return h&&new RegExp(t,'i').test((h.textContent||'').trim())});
 const req=[...root.querySelectorAll('.supervisor-request-top,.card')].find(x=>/EMPLOYEE REQUESTS/i.test(x.textContent||'')),att=byTitle('Need\\s*Attention');
 if(req){let oldRow=req.closest('.v88-alert-row,.v84-alert-row');if(oldRow&&att&&oldRow.contains(att))oldRow.parentNode.insertBefore(att,oldRow.nextSibling);let row=root.querySelector('.v92-supervisor-top');if(!row){row=document.createElement('div');row.className='v92-supervisor-top';const identity=root.querySelector('.v91-role-identity');(identity||root.firstChild).insertAdjacentElement(identity?'afterend':'beforebegin',row)}req.className='v92-top-card v92-request-card clickable';req.onclick=()=>window.openSupervisorRequestsWindow();row.appendChild(req);let av=row.querySelector('.v92-available-card');if(!av){av=document.createElement('button');av.className='v92-top-card v92-available-card clickable';row.appendChild(av)}av.classList.add('v104-incentive-top');av.onclick=()=>window.openIncentiveList();av.innerHTML='<span class="v92-top-icon">⭐</span><span><b>INCENTIVE</b><small>Target · Achieved · Incentive</small></span><strong>›</strong>';if(oldRow&&oldRow.isConnected&&!oldRow.children.length)oldRow.remove()}
 if(att){att.classList.add('v84-attention','clickable');att.onclick=()=>window.v66OpenAttention();}
 // Overtime belongs only in Today at a Glance. Remove any separate legacy Overtime card by its heading.
 [...root.querySelectorAll('.card')].filter(x=>{const h=x.querySelector('h3');return h&&/^\\s*(?:⏱\\s*)?OVERTIME(?:\\s+NOW)?\\s*$/i.test(h.textContent||'')&&!x.closest('.glance-grid,.v74-six')}).forEach(x=>x.remove());
 // Remove legacy duplicate action cards that are not part of the agreed four-card control area.
 [...root.querySelectorAll('.card')].filter(x=>{const h=x.querySelector('h3');return h&&/Finished Job Cards/i.test(h.textContent||'')}).forEach(x=>x.remove());
 const find=t=>[...root.querySelectorAll('.card')].find(x=>{const h=x.querySelector('h3');return h&&new RegExp(t,'i').test(h.textContent||'')});
 let job=find('Job Card Details');const legacyDetails=[...root.querySelectorAll('.card')].filter(x=>{const h=x.querySelector('h3');return h&&/^Details$/i.test((h.textContent||'').trim())});if(!job&&legacyDetails.length)job=legacyDetails.shift();legacyDetails.forEach(x=>x.remove());const assigned=find('Assigned Job Cards'),add=find('Additional Time'),inc=find('Incentive Hours');
 // Supervisor lower controls: one Job Card Details only. Assigned Job Cards and Additional Time open in modal boxes.
 // Create the authoritative Job Card Details tile when an older renderer does not provide one.
 if(!job){
   job=document.createElement('div');
   job.className='card v84-action v84-job-details clickable';
   const anchor=assigned||add||inc||root.querySelector('.v84-tech-board')||root.lastElementChild;
   if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(job,anchor);else root.appendChild(job);
 }
 if(job&&job.isConnected){job.className='card v84-action v84-job-details clickable';job.setAttribute('onclick','openSupervisorJobCardList()');job.innerHTML='<div class="section-title"><h3>📋 Job Card Details</h3><span class="pill">Click to open</span></div><div class="small muted">Full job information · search · status · working time</div>'}
 if(assigned){assigned.classList.add('clickable');assigned.setAttribute('onclick','openSupervisorAssignedWindow()');assigned.innerHTML='<div class="section-title"><h3>📋 Assigned Job Cards</h3><span class="pill">Click to open</span></div><div class="small muted">Open assignments · status · suggested / actual time</div>'}
 if(add){add.classList.add('clickable');add.setAttribute('onclick','manualAdditionalTime()');add.innerHTML='<div class="section-title"><h3>⏱ Additional Time</h3><span class="pill">Click to open</span></div><div class="small muted">Add extra suggested time for an employee</div>'}
 const id001=root.querySelector('#v753ID001Dashboard');
 if(inc&&inc.isConnected)inc.remove();
  const items=[job,assigned,add,id001].filter(x=>x&&x.isConnected);
 // Lower Supervisor area must be compact detail boxes, never a vertical list.
 let g=root.querySelector('.v84-action-grid');
 if(items.length&&!g){g=document.createElement('div');g.className='v84-action-grid';items[0].parentNode.insertBefore(g,items[0])}
 if(g)items.forEach((x,i)=>{x.classList.add('v84-action','v84-action-'+i,'clickable');g.appendChild(x)});
 // Remove empty/legacy detail tiles left behind by earlier Supervisor renderers.
 [...root.querySelectorAll('.v84-action-grid>.card,.v84-action-grid>section')].filter(x=>!(x.textContent||'').trim()).forEach(x=>x.remove());
}
function v91RoleHeader(role){
 const root=document.getElementById(role==='Supervisor'?'supervisorView':'managerView');if(!root||!me)return;
 document.body.classList.remove('employee-session');
 const gh=document.getElementById('globalBrandHeader');if(gh){gh.classList.remove('hidden');gh.style.removeProperty('display')}
 const lh=document.getElementById('legacyAppHeader');if(lh){lh.classList.add('hidden');lh.style.setProperty('display','none','important')}
 root.querySelectorAll('.v91-role-identity').forEach(x=>x.remove());
 const dept=String(me.department||role||'').trim();
 const row=document.createElement('div');row.className='v91-role-identity';const menuAction=role==='Manager'?'v135OpenManagerMenu()':'v65OpenAccount()';row.innerHTML='<b>'+E(me.name)+' · '+E(dept||role)+'</b><span class="v91-role-online"><i></i>ONLINE</span><button class="v91-role-menu" onclick="'+menuAction+'" aria-label="Open account menu">☰</button>';
 const top=root.querySelector('.v92-supervisor-top');if(role==='Supervisor'&&top)root.insertBefore(row,top);else root.insertBefore(row,root.firstChild);
 // Supervisor and Manager each own exactly one identity/status row.
 // Legacy/global identity and network badges must never coexist with the role header.
 if(role==='Supervisor'){
   if(gh)gh.style.setProperty('display','none','important');
   const net=document.getElementById('net');if(net){net.textContent='';net.style.setProperty('display','none','important')}
   const hos=document.getElementById('headerOnlineStatus');if(hos)hos.style.setProperty('display','none','important');
   root.querySelectorAll('.header-online-status,.v91-role-online').forEach(x=>{if(x!==row.querySelector('.v91-role-online'))x.remove()});
 }
}
function v74ApplyManagerFinal(){if(me?.role==='Manager'){polish();v91RoleHeader('Manager')}}
const v74SupRender=window.renderSupervisor;
if(typeof v74SupRender==='function')window.renderSupervisor=function(){let r=v74SupRender.apply(this,arguments);v74ApplySupervisorFinal();return r};
const v74MgrRender=window.renderManager;
if(typeof v74MgrRender==='function')window.renderManager=function(){let r=v74MgrRender.apply(this,arguments);setTimeout(v74ApplyManagerFinal,0);return r};

let s=document.createElement('style');s.textContent='.v91-role-identity{margin:0 0 10px;padding:10px 14px;display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #dce5ee;border-radius:16px;box-shadow:0 5px 14px #17324b14}.v91-role-identity>b{font-size:16px}.v91-role-online{margin-left:auto;background:#eaffea;border:1px solid #8cde96;border-radius:20px;padding:7px 10px;font-size:11px;font-weight:900;color:#174526}.v91-role-online i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#15953a;margin-right:5px}.v91-role-menu,.v91-identity-menu{margin-left:0!important;width:42px!important;height:38px!important;padding:0!important;border-radius:11px!important;background:#eef2f7!important;border:1px solid #d5dde8!important;color:#172033!important;font-size:23px!important;box-shadow:none!important}.v80-compact-identity .v91-identity-menu{margin-left:8px!important}.manager-hero .pill{display:none!important}'+'.quick-entry{background:linear-gradient(145deg,rgba(225,247,255,.96),rgba(239,250,255,.90))!important;border:1px solid #a9dff2!important;box-shadow:inset 0 1px 0 #fff,0 8px 18px #0e749018!important}.quick-entry h3{color:#075985!important}.quick-entry>.blue{background:linear-gradient(135deg,#0284c7,#0369a1)!important}.v91-assign-card{background:linear-gradient(145deg,rgba(244,239,255,.97),rgba(250,247,255,.92))!important;border:1px solid #d5c5f4!important;box-shadow:inset 0 1px 0 #fff,0 8px 18px #6d28d918!important}.v91-assign-card h3{color:#5b21b6!important}.v91-assign-card>.blue{background:linear-gradient(135deg,#7c3aed,#5b21b6)!important}.quick-entry input,.quick-entry select,.v91-assign-card input,.v91-assign-card select{background:#fff!important;border-color:#d8e4ee!important}.v89-two-col{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}.v89-two-col>label{min-width:0!important}.v89-two-col input,.v89-two-col select{width:100%!important;box-sizing:border-box!important}.v84-action-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}.v84-action-grid>.card{display:block!important;width:auto!important;margin:0!important}.v92-supervisor-top{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;margin:0 0 10px!important}.v92-top-card{min-height:58px!important;margin:0!important;padding:8px 9px!important;border-radius:11px!important;display:flex!important;align-items:center!important;gap:7px!important;text-align:left!important;box-shadow:0 4px 10px #17324b12!important}.v92-top-card b{display:block!important;font-size:9px!important;line-height:1.15!important}.v92-top-card small{display:block!important;font-size:7px!important;margin-top:2px!important;opacity:.72}.v92-top-card strong,.v92-top-card .request-number{margin-left:auto!important;font-size:18px!important;font-weight:900!important}.v92-top-icon,.v92-top-card .mini-icon{font-size:17px!important}.v92-request-card{background:#eaf3ff!important;border:1px solid #bfd7f2!important;color:#17324b!important}.v92-available-card{background:#eaf9ef!important;border:1px solid #b8e3c4!important;color:#174526!important;width:100%!important}.v92-request-card .small{font-size:7px!important}.v92-request-card .request-number{position:static!important}@media(max-width:360px){.v92-supervisor-top{gap:6px!important}.v92-top-card{padding:7px!important}.v92-top-card b{font-size:8px!important}}.v80-compact-identity .v91-identity-menu{background:linear-gradient(145deg,#26384b,#102235)!important;border:1px solid #071522!important;color:#fff!important;box-shadow:inset 0 1px 0 #ffffff32,0 4px 9px #10223542!important;font-weight:1000!important}.v80-compact-identity .v91-identity-menu:active{transform:translateY(1px)!important;background:#071b2e!important}.v93-employee-menu{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important;padding:12px!important;background:#eef3f7!important;border:1px solid #d3dee8!important;border-radius:16px!important}.v93-menu-action{min-height:58px!important;border-radius:13px!important;border:1px solid!important;font-size:18px!important;font-weight:1000!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;box-shadow:0 5px 11px #17324b14!important}.v93-menu-action span{font-size:11px!important}.v93-menu-sync{background:#e5f3ff!important;border-color:#a8d2f4!important;color:#075985!important}.v93-menu-leave{background:#fff4d9!important;border-color:#edcf83!important;color:#704500!important}.v93-menu-update{background:#f0eaff!important;border-color:#c9b7ef!important;color:#5b21b6!important}.v93-menu-logout{background:#ffe8e8!important;border-color:#efb5b5!important;color:#a51d1d!important}.v80-rpm-gauge{overflow:hidden!important;background:repeating-conic-gradient(from 225deg,rgba(23,50,75,.58) 0deg 1.4deg,transparent 1.4deg 8deg),conic-gradient(from 225deg,var(--g) var(--p),rgba(185,199,210,.45) 0)!important;border:2px solid rgba(31,50,67,.32)!important;box-shadow:inset 0 0 0 5px rgba(255,255,255,.34),inset 0 -12px 24px rgba(15,23,42,.08),0 10px 24px #17324b22!important}.v80-rpm-gauge:before{inset:19px!important;background:radial-gradient(circle at 50% 58%,rgba(255,255,255,.96),rgba(239,246,250,.80) 62%,rgba(214,225,233,.68) 100%)!important;border:1px solid rgba(23,50,75,.20)!important}.v80-rpm-gauge:after{left:25%!important;right:25%!important;top:11%!important;height:18%!important}.v93-rpm-redline{position:absolute;z-index:2;width:9px;height:26px;right:18px;top:48%;border-radius:5px;background:#dc2626;transform:rotate(80deg);box-shadow:0 0 8px #dc262677}.v93-rpm-needle{position:absolute;z-index:3;left:50%;bottom:50%;width:3px;height:37%;border-radius:3px;background:var(--g);transform-origin:50% 100%;transform:rotate(calc(-135deg + (var(--p) * .75)));box-shadow:0 0 5px color-mix(in srgb,var(--g) 60%,transparent);transition:transform .35s ease}.v93-rpm-hub{position:absolute;z-index:4;left:50%;top:50%;width:13px;height:13px;margin:-6.5px;border-radius:50%;background:#17324b;border:3px solid #dbe6ee;box-shadow:0 2px 5px #0004}.v80-rpm-gauge .v80-gauge-inner{z-index:5!important;padding-top:28px!important}.v80-rpm-gauge .v80-gauge-title{font-size:9px!important;letter-spacing:.08em!important}.v80-rpm-gauge b{font-size:25px!important;text-shadow:0 1px #fff}.v80-rpm-gauge small{font-size:9px!important}.v93-id001-action{margin:0!important;padding:10px!important;min-height:86px!important}.v93-id001-action .big-action{min-height:42px!important;font-size:10px!important;padding:8px!important}.v93-id001-action .small{font-size:7px!important;line-height:1.2!important}.v84-action-grid>:empty{display:none!important}.v92-tech-board{padding:13px!important;background:linear-gradient(145deg,#f8fbff,#eef5fb)!important;border:1px solid #d7e4ef!important;border-radius:18px!important;box-shadow:inset 0 1px #fff,0 8px 18px #17324b16!important}.v92-tech-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.v92-tech-title h3{margin:0;color:#17324b}.v92-tech-title small{display:block;margin-top:2px;color:#64748b;font-size:9px}.v92-live-dot{font-size:9px;font-weight:900;color:#15803d;background:#e9f9ef;border:1px solid #a7dfb4;border-radius:20px;padding:5px 8px}.v92-tech-depts{gap:9px!important}.v92-tech-dept{position:relative!important;min-height:126px!important;padding:11px 5px 9px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;transform:translateY(0);transition:transform .12s ease!important}.v92-tech-dept:active{transform:translateY(2px)!important}.v92-dept-icon{font-size:27px!important;line-height:1!important;margin-bottom:5px}.v92-tech-dept>b{font-size:11px!important;letter-spacing:.04em}.v92-tech-dept>strong{font-size:24px!important;line-height:1.05!important;margin-top:5px}.v92-tech-dept>strong em{font-size:13px;font-style:normal;opacity:.65}.v92-tech-dept>small{font-size:7px!important;letter-spacing:.03em}.v92-tech-dept>i{font-size:8px;font-style:normal;margin-top:6px;opacity:.72}.v92-tech-dept.v84-denter{background:linear-gradient(145deg,#eee7ff,#ddd0ff)!important;border-color:#c7b5f6!important}.v92-tech-dept.v84-painter{background:linear-gradient(145deg,#fff1e6,#ffd8bd)!important;border-color:#f3c39f!important}.v92-tech-dept.v84-mechanic{background:linear-gradient(145deg,#e5f4ff,#cce8ff)!important;border-color:#a9d5f5!important}.v84-tech-board{display:block!important}.v84-depts{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}.v84-dept{min-width:0;padding:12px 5px;border:1px solid #ffffffcc;border-radius:15px;color:#172033!important;box-shadow:inset 0 2px 3px #fff,0 7px 0 #00000014,0 10px 18px #0f17221f!important}.v84-dept span,.v84-dept b,.v84-dept strong,.v84-dept small{display:block}.v84-dept small{font-size:8px;margin-top:3px;opacity:.75}.v84-status{font-weight:800}.v84-status-working{color:#15803d!important}.v84-status-paused{color:#b45309!important}.v84-status-overtime{color:#b91c1c!important}.v84-status-available{color:#2563eb!important}.v84-dept span{font-size:22px}.v84-dept b{font-size:11px}.v84-dept strong{font-size:20px}.v84-denter{background:#efe9ff!important}.v84-painter{background:#fff0e5!important}.v84-mechanic{background:#e5f3ff!important}.v84-tech-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.v84-tech-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:13px;overflow:hidden;box-shadow:0 5px 12px #0f172214}.v84-tech-name{width:100%;background:#fff!important;color:#172033!important;box-shadow:none!important;text-align:left;padding:11px}.v84-tech-name b,.v84-tech-name span{display:block;color:#172033}.v84-tech-name span{font-size:11px;margin-top:3px}.v84-tech-body{padding:10px;font-size:12px;line-height:1.55}.v84-alert-row,.v84-action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}.v84-alert-row>*{margin:0!important;min-width:0}.v84-request{background:#eaf3ff!important;color:#172033!important}.v84-attention{background:#fff3df!important;color:#172033!important}.v84-action{margin:0!important;min-width:0;border-radius:15px!important;color:#172033!important;box-shadow:inset 0 2px 3px #fff,0 6px 0 #00000012,0 9px 16px #0f17221c!important}.v84-action-0{background:#e8f1ff!important}.v84-action-1{background:#e9f9ef!important}.v84-action-2{background:#fff2df!important}.v84-action-3{background:#f2eaff!important}.v84-action h3,.v84-action .small,.v84-action .muted{color:#172033!important}.v74-d h2{margin-top:0}.v74-jc{padding:12px;background:#f8fafc;border-radius:10px;margin:10px 0}.v74-d textarea{width:100%;box-sizing:border-box}.v74-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}.v74-actions button{min-width:110px;min-height:46px}.v74-pause{background:#d97706}.v74-scroll{overflow:auto}.v74-scroll table{min-width:760px}.v74-six{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px}.v74-six .glance-box{min-height:92px;min-width:0;padding:10px 7px!important;display:flex;align-items:center;gap:10px;border-radius:14px;box-shadow:0 5px 12px #0f172214}.v74-icon{font-size:24px}.ga{background:#eaf3ff}.gp{background:#fff7df}.gf{background:#eaf9ef}.gr{background:#ecfdf5}.go{background:#f5f3ff}.gx{background:#ffecec}.v74-top{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important}.v74-ready{background:#ecfdf5!important;color:#166534!important}.v74-search{background:linear-gradient(#3b82f6,#1d4ed8)!important;color:#fff!important;box-shadow:0 5px 0 #1e3a8a,0 8px 14px #2563eb40!important;transform:translateY(-2px);font-weight:900!important}.v74-times{margin:14px 0;padding:12px;background:#eff6ff;border-radius:12px}.v74-jlfilters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px}.v74-jlfilters label{font-size:12px;font-weight:800}.v74-jlfilters input,.v74-jlfilters select{width:100%;box-sizing:border-box;margin-top:4px}.v74-export{display:flex;gap:8px;margin:10px 0 14px}.v74-times label{display:grid;grid-template-columns:1fr 110px;gap:6px;margin:8px 0}.v75-eff-head{align-items:center}.v75-eff-head label{font-size:12px;font-weight:800}.v75-eff-head input{margin-left:6px}.v75-eff-row{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:center}.v75-eff{background:transparent!important;color:#172033!important;box-shadow:none!important;display:flex;flex-direction:column;align-items:center;gap:8px}.v75-ring{width:178px;height:178px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:14px solid;box-shadow:inset 0 5px 14px #fff,0 9px 18px #0f172226,0 0 0 7px #ffffffaa}.v75-ring small{font-size:14px;font-weight:900;max-width:120px;line-height:1.15}.v75-ring b{font-size:36px;margin-top:8px}.v75-eff em{font-style:normal;font-weight:900}.v75-blue .v75-ring{background:#eaf3ff;border-color:#60a5fa;color:#123b72}.v75-green .v75-ring{background:#ecfdf3;border-color:#4ade80;color:#14532d}.v75-orange .v75-ring{background:#fff4e8;border-color:#fb923c;color:#7c2d12}.v75-delivery-ot{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.v75-delivery-ot .glance-box{margin:0}.v75-eff-logo{font-size:18px;font-weight:1000;line-height:1;margin-bottom:3px}.v75-ring{position:relative;box-shadow:inset 0 6px 15px #fff,inset 0 -6px 12px #00000014,0 10px 20px #0f17222b,0 0 0 7px #ffffffaa,0 14px 0 -7px #00000018!important}@media(max-width:700px){.v75-eff-row{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.v75-ring{width:96px;height:96px;border-width:8px}.v75-ring small{font-size:9px;max-width:76px}.v75-ring b{font-size:18px;margin-top:3px}.v75-eff-logo{font-size:13px}}@media(max-width:700px){.v74-top{gap:6px!important}.v74-top button{padding:8px!important}.v74-top button span{font-size:11px!important}.v74-top button small{display:none}}';document.head.appendChild(s);const reopen71=window.v71ReopenSameAssignment;window.v71ReopenSameAssignment=function(id){let a=(state.assign||[]).find(x=>x&&x.id===id&&!x.cancelled),no=a?.job,r=reopen71?.apply(this,arguments);if(no){let j=J(no),aa=AA(no);if(j&&aa.length&&!aa.every(x=>x.completed)){j.status='Open';delete j.completedAt;try{save()}catch(e){console.warn(e)}}}return r};window.v74Loaded=true})();

/* V74 Supervisor complete Job Card Details */
const v74JLH='ID001',v74JLE=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),v74JLP=id=>{try{return user(id)}catch(_){return{name:id,department:''}}};
window.v74JobListRows=function(){
 const q=(document.getElementById('v74jlq')?.value||'').trim().toLowerCase(),from=document.getElementById('v74jlf')?.value,to=document.getElementById('v74jlt')?.value,st=document.getElementById('v74jls')?.value||'all',emp=document.getElementById('v74jle')?.value||'all',sort=document.getElementById('v74jlo')?.value||'date';
 let jobs=(state.jobs||[]).filter(j=>j&&j.no&&j.no!==v74JLH&&!j.cancelled).map(j=>{let aa=(state.assign||[]).filter(a=>a&&!a.cancelled&&a.job===j.no),ts=(()=>{let v=j.createdAt||j.date;if(v){let n=+v;if(Number.isFinite(n)&&n>0)return n;let d=new Date(v).getTime();if(Number.isFinite(d))return d}let ar=aa.map(a=>+a.assignedAt||0).filter(Boolean);return ar.length?Math.min(...ar):0})(),finished=aa.length>0&&aa.every(a=>a.completed),paused=aa.some(a=>{try{return !a.completed&&empStatus(a)==='Paused'}catch(_){return false}}),repeat=aa.some(a=>a.rework)||!!j.rework;return{j,aa,ts,finished,paused,repeat}});
 if(q)jobs=jobs.filter(x=>[x.j.no,x.j.reg,x.j.vehicle].join(' ').toLowerCase().includes(q));
 if(from){let t=new Date(from+'T00:00:00').getTime();jobs=jobs.filter(x=>x.ts>=t)}
 if(to){let t=new Date(to+'T23:59:59').getTime();jobs=jobs.filter(x=>x.ts<=t)}
 if(st==='finished')jobs=jobs.filter(x=>x.finished); if(st==='paused')jobs=jobs.filter(x=>x.paused); if(st==='repeat')jobs=jobs.filter(x=>x.repeat);
 if(emp!=='all')jobs=jobs.filter(x=>x.aa.some(a=>String(a.emp)===emp));
 jobs.sort(sort==='job'?((a,b)=>String(a.j.no).localeCompare(String(b.j.no),undefined,{numeric:true,sensitivity:'base'})):((a,b)=>b.ts-a.ts));
 return jobs;
};
window.v74JobListRender=function(){
 let el=document.getElementById('v74jlrows');if(!el)return;let rows=v74JobListRows();
 el.innerHTML=rows.length?'<div class="v74-scroll"><table><tr><th>Date</th><th>Job Card</th><th>Vehicle / Reg.</th><th>Employee</th><th>Status</th><th></th></tr>'+rows.map(x=>{let names=[...new Set(x.aa.map(a=>v74JLP(a.emp).name))],s=x.finished?'Finished':x.paused?'Paused':x.repeat?'Repeat':x.aa.some(a=>!a.completed)?'In Progress':'Unassigned';return'<tr><td>'+v74JLE(x.ts?new Date(x.ts).toLocaleDateString():'—')+'</td><td><b>'+v74JLE(x.j.no)+'</b></td><td>'+v74JLE(x.j.vehicle||'—')+'<br><span class="small">'+v74JLE(x.j.reg||'—')+'</span></td><td>'+v74JLE(names.join(', ')||'—')+'</td><td><b>'+v74JLE(s)+'</b></td><td><button class="blue" onclick="openSupervisorJob(\''+v74JLE(x.j.no)+'\')">VIEW</button></td></tr>'}).join('')+'</table></div>':'<div class="notice">No Job Cards match the selected filters.</div>';
};
window.openSupervisorJobCardList=function(){
 try{
 let emps=[...new Set((state.assign||[]).filter(a=>a&&!a.cancelled&&a.job!==v74JLH).map(a=>String(a.emp)))].sort((a,b)=>v74JLP(a).name.localeCompare(v74JLP(b).name));
 let body='<div class="v74-jlfilters"><label>From<input id="v74jlf" type="date" onchange="v74JobListRender()"></label><label>To<input id="v74jlt" type="date" onchange="v74JobListRender()"></label><label>Search<input id="v74jlq" placeholder="" oninput="v74JobListRender()"></label><label>Status<select id="v74jls" onchange="v74JobListRender()"><option value="all">All</option><option value="finished">Finished</option><option value="paused">Paused</option><option value="repeat">Repeat</option></select></label><label>Employee<select id="v74jle" onchange="v74JobListRender()"><option value="all">All Employees</option>'+emps.map(id=>'<option value="'+v74JLE(id)+'">'+v74JLE(v74JLP(id).name)+'</option>').join('')+'</select></label><label>Sort<select id="v74jlo" onchange="v74JobListRender()"><option value="date">By Date</option><option value="job">By Job Card Number</option></select></label></div><div class="v74-export"><button class="green" onclick="v74ExportJobListExcel()">EXPORT EXCEL</button><button class="blue" onclick="v74ExportJobListPDF()">EXPORT PDF</button></div><div id="v74jlrows"></div>';
 if(typeof showSupervisorModal==='function')showSupervisorModal('📋 Job Card Details — All Job Cards',body);else if(typeof openModal==='function')openModal('<div class="section-title"><h2>📋 Job Card Details — All Job Cards</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+body);setTimeout(v74JobListRender,0);
 }catch(err){console.error('Job Card Details',err);if(typeof v74Msg==='function')v74Msg('Job Card Details could not open. Please retry.','Job Card Details')}
};
function v74ExportData(){return v74JobListRows().map(x=>{let names=[...new Set(x.aa.map(a=>v74JLP(a.emp).name))],s=x.finished?'Finished':x.paused?'Paused':x.repeat?'Repeat':x.aa.some(a=>!a.completed)?'In Progress':'Unassigned';return[ x.ts?new Date(x.ts).toLocaleDateString():'',x.j.no||'',x.j.vehicle||'',x.j.reg||'',names.join(', '),s]})}
window.v74ExportJobListExcel=function(){let rows=[['Date','Job Card','Vehicle','Registration','Employee','Status'],...v74ExportData()],csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');if(window.AndroidBridge&&AndroidBridge.saveExportFile){AndroidBridge.saveExportFile('Zukait_Job_Card_List.csv','text/csv',btoa(unescape(encodeURIComponent(csv))));return}v74Msg('Export is not available on this device.','Excel Export')};
window.v74ExportJobListPDF=function(){let rows=v74ExportData(),html='<html><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:20px}h2{text-align:center}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#eee}</style></head><body><h2>ZUKAIT AUTO — JOB CARD LIST</h2><table><tr><th>Date</th><th>Job Card</th><th>Vehicle</th><th>Registration</th><th>Employee</th><th>Status</th></tr>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+v74JLE(v)+'</td>').join('')+'</tr>').join('')+'</table></body></html>';if(typeof window.v110ReportActions==='function'){window.v110ReportActions(html,'Zukait_Job_Card_List.pdf');return}if(window.AndroidBridge&&AndroidBridge.printHtml){AndroidBridge.printHtml(html)}else{let w=window.open('','_blank');if(w){w.document.write(html);w.document.close();w.print()}}};


/* V75.1 ID001 SAFE AUTHORITY — START/STOP only, isolated from productive KPIs, no auto-finish. */
(function(){'use strict';
 const H='ID001';
 const safeUser=id=>{try{return user(id)||{name:id}}catch(_){return{name:id}}};
 const openHold=emp=>(state.assign||[]).filter(a=>a&&a.job===H&&a.emp===emp&&!a.cancelled&&!a.completed).sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0))[0]||null;
 const openNormal=emp=>(state.assign||[]).filter(a=>a&&a.job!==H&&a.emp===emp&&!a.cancelled&&!a.completed);
 const availableForIdeal=emp=>!activeSession(emp)&&openNormal(emp).length===0&&!openHold(emp);
 window.v75IdealAvailableEmployees=()=>users.filter(u=>u&&u.role==='Employee'&&availableForIdeal(u.id));
 const assFor=s=>{if(!s)return null;return (state.assign||[]).find(a=>a&&a.id===s.assignmentId)||openHold(s.emp)};
 const isHoldAssignment=a=>!!a&&a.job===H;
 const isHoldSession=x=>!!x&&x.job===H;

 // Disable every older automatic ID001 completion path. ID001 stops only when the employee presses STOP.
 window.v38CheckID001=function(){return false};

 // Authoritative ID001 assignment creation. A technician can have only one open ID001 assignment.
 const oldAssign=window.assignJobCore;
 window.assignJobCore=function(no,emp,minutes){
   if(no!==H)return typeof oldAssign==='function'?oldAssign.apply(this,arguments):undefined;
   const m=Number(minutes);
   if(!Number.isFinite(m)||m<1){if(typeof v74Msg==='function')return v74Msg('Enter a valid allocated time for ID001.','Ideal Time');return alert('Enter a valid allocated time for ID001.');}
   const existing=openHold(emp);
   if(existing){const n=safeUser(emp).name||emp;if(typeof v74Msg==='function')return v74Msg('ID001 is already assigned to '+n+'. Stop/complete the existing Ideal Time card before assigning another.','Ideal Time');return alert('ID001 is already assigned to '+n);}
   const normalOpen=openNormal(emp),active=activeSession(emp);
   if(active||normalOpen.length){const n=safeUser(emp).name||emp;if(typeof v74Msg==='function')return v74Msg(n+' already has normal workshop work. ID001 is only for staff who currently have no job.','Ideal Time');return alert(n+' already has normal workshop work.');}
   state.assign=state.assign||[];
   const a={id:uid(),job:H,emp:emp,suggested:m,completed:false,cancelled:false,rework:false,idealCard:true,idealSafeVersion:1,assignedBy:me&&me.id?me.id:'SYSTEM',assignedAt:now()};
   state.assign.push(a);
   if(typeof setLastAction==='function')setLastAction('Assigned ID001 to '+(safeUser(emp).name||emp)+' for '+fmt(m));
   save();render();return a;
 };

 // The common ID001 card may be assigned to many available employees at the same time.
 // Each employee receives an independent assignment and independent START/STOP session.
 window.v75AssignIdealToAvailable=function(minutes,employeeIds){
   const m=Number(minutes);if(!Number.isFinite(m)||m<1)return {ok:false,reason:'invalid_time',assigned:[]};
   const wanted=Array.isArray(employeeIds)&&employeeIds.length?new Set(employeeIds.map(String)):null;
   const list=users.filter(u=>u&&u.role==='Employee'&&(!wanted||wanted.has(String(u.id)))&&availableForIdeal(u.id));
   if(!list.length)return {ok:false,reason:'none_available',assigned:[]};
   state.assign=state.assign||[];const ts=now(),by=me&&me.id?me.id:'SYSTEM',created=[];
   for(const u of list){const a={id:uid(),job:H,emp:u.id,suggested:m,completed:false,cancelled:false,rework:false,idealCard:true,idealSafeVersion:1,assignedBy:by,assignedAt:ts};state.assign.push(a);created.push(a);}
   if(typeof setLastAction==='function')setLastAction('Assigned ID001 to '+created.length+' available staff');
   save();render();return {ok:true,assigned:created.map(a=>a.emp)};
 };

 // Employee work controls: ID001 START / STOP only and exact assignmentId binding.
 const oldStart=window.start,oldPause=window.pause,oldFinish=window.finish;
 window.start=function(no){
   if(no!==H)return typeof oldStart==='function'?oldStart.apply(this,arguments):undefined;
   if(!me||me.role!=='Employee')return;
   if(activeSession(me.id)){if(typeof v74Msg==='function')return v74Msg('You already have an active job. Stop or finish it before starting ID001.','One Job at a Time');return alert('You already have an active job.');}
   const a=openHold(me.id);if(!a){if(typeof v74Msg==='function')return v74Msg('No open ID001 assignment was found for you.','Ideal Time');return alert('No open ID001 assignment was found.');}
   state.sessions=state.sessions||[];
   state.sessions.push({id:uid(),assignmentId:a.id,job:H,emp:me.id,start:now(),end:null,paused:false,rework:false,idealCard:true,idealSafeVersion:1});
   if(typeof setLastAction==='function')setLastAction('Started ID001');
   save();render();
 };
 window.pause=function(){
   const x=me&&activeSession(me.id);
   if(x&&x.job===H){if(typeof v74Msg==='function')return v74Msg('ID001 Ideal Time Card uses START / STOP only. Pause is not available.','Ideal Time');return alert('ID001 uses START / STOP only.');}
   return typeof oldPause==='function'?oldPause.apply(this,arguments):undefined;
 };
 window.finish=function(){
   const x=me&&activeSession(me.id);
   if(!x||x.job!==H)return typeof oldFinish==='function'?oldFinish.apply(this,arguments):undefined;
   const a=assFor(x);
   if(!a){if(typeof v74Msg==='function')return v74Msg('The active ID001 assignment could not be found. No data was changed.','Ideal Time');return;}
   const stop=()=>{const ts=now();x.end=ts;x.finished=true;x.paused=false;x.idealCard=true;a.completed=true;a.completedAt=ts;a.cancelled=false;if(typeof setLastAction==='function')setLastAction('Stopped ID001');save();if(typeof closeModal==='function')try{closeModal()}catch(_){}render();};
   if(typeof openModal==='function'){openModal('<div class="v74-d"><h2>■ Stop Ideal Time</h2><div class="notice">Stop ID001 Ideal Time Card now?</div><div class="v74-actions"><button class="secondary" onclick="closeModal()">CANCEL</button><button class="danger" id="v75id001stop">■ STOP</button></div></div>');setTimeout(()=>{const b=document.getElementById('v75id001stop');if(b)b.onclick=stop},0);return;}
   if(confirm('Stop ID001 Ideal Time Card?'))stop();
 };

 // ID001 is waiting/ideal time, never productive Actual, Efficiency, Incentive or Labour Cost.
 const oldLabour=window.labourCost;
 window.labourCost=function(a){if(isHoldAssignment(a))return 0;return typeof oldLabour==='function'?oldLabour.apply(this,arguments):0};

 const oldMonthlySuggested=window.monthlySuggestedMinutes;
 if(typeof oldMonthlySuggested==='function')window.monthlySuggestedMinutes=function(emp,from,to){
   return (state.assign||[]).filter(a=>a&&a.emp===emp&&a.job!==H&&!a.cancelled&&(a.assignedAt||0)>=from&&(a.assignedAt||0)<to).reduce((n,a)=>n+(+a.suggested||0),0);
 };
 const oldMonthlyActual=window.monthlyNormalActualMinutes;
 if(typeof oldMonthlyActual==='function')window.monthlyNormalActualMinutes=function(emp,from,to){
   return (state.sessions||[]).filter(x=>x&&x.emp===emp&&x.job!==H&&x.start<to&&(x.end||Date.now())>from).reduce((sum,x)=>{const st=Math.max(+x.start||0,from),en=Math.min(+(x.end||Date.now()),to);if(en<=st)return sum;try{return sum+(typeof window.sessionNormalMinutes==='function'?window.sessionNormalMinutes({start:st,end:en},en):(en-st)/60000)}catch(_){return sum+(en-st)/60000}},0);
 };

 // Replace the old ID001 refresh path so it can never auto-finish or recursively render all dashboards.
 const oldRefresh=window.refreshActiveRunningTime;
 window.refreshActiveRunningTime=function(){
   const x=me&&me.role==='Employee'?activeSession(me.id):null;
   if(!x||x.job!==H)return typeof oldRefresh==='function'?oldRefresh.apply(this,arguments):undefined;
   const a=assFor(x),elapsed=Math.max(0,(Date.now()-(+x.start||Date.now()))/60000),allocated=a?(+a.suggested||0):0;
   const put=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val};
   put('activeRunningTime',fmt(elapsed));put('currentSuggested',fmt(allocated));put('currentActual',fmt(elapsed));put('currentRemaining',fmt(Math.max(0,allocated-elapsed)));put('currentExceeded',fmt(0));
 };

 // Final UI safety: ID001 always shows STOP, never PAUSE. Any legacy renderer error is contained instead of blanking all staff screens.
 function decorate(){
   if(!me||me.role!=='Employee')return;
   const x=activeSession(me.id);
   if(!x||x.job!==H)return;
   const root=document.getElementById('employeeView');if(!root)return;
   root.querySelectorAll('button').forEach(b=>{const t=(b.textContent||'').toUpperCase();if(t.includes('PAUSE'))b.style.display='none';if(t.includes('FINISH')){b.textContent='■ STOP';b.classList.remove('green');b.classList.add('danger')}});
 }
 const wrap=(name,rootId)=>{
   const prev=window[name];if(typeof prev!=='function')return;
   window[name]=function(){try{const r=prev.apply(this,arguments);setTimeout(decorate,0);return r}catch(err){console.error('Safe render recovery',name,err);const root=document.getElementById(rootId);if(root){root.innerHTML='<div class="card"><h2>Zukait Time Track</h2><div class="notice"><b>Screen recovery mode</b><br>The shared data is safe. Please close and reopen this screen.</div></div>';}return undefined}};
 };
 wrap('renderEmployee','employeeView');wrap('renderSupervisor','supervisorView');wrap('renderManager','managerView');
 
 // Final screenshot-style Employee dashboard built on the stable renderer only.
 // No legacy renderEmployee chain is called here.
 window.renderEmployee=function(){
   if(!me||me.role!=='Employee')return;
   const root=document.getElementById('employeeView');if(!root)return;
   root.classList.remove('hidden');
   const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const fm=v=>{try{return fmt(Math.max(0,+v||0))}catch(_){return Math.round(+v||0)+'m'}};
   const jj=no=>{try{return job(no)||{no:no,vehicle:no===H?'Ideal Time Card':'—',reg:no===H?'Waiting':'—'}}catch(_){return{no:no,vehicle:'—',reg:'—'}}};
   const actual=a=>{try{return Math.max(0,totalForAssignment(a)||0)}catch(_){return 0}};
   const clock=t=>new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:true});
   const date=t=>new Date(t).toLocaleDateString([],{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
   const car=()=>'<div class="v75s-car v82-logo-fallback" aria-label="Unknown vehicle manufacturer"><span class="v80-generic-car">🚘</span></div>';
   const v82EV=v=>/(^|[\\s\\-_/])ev($|[\\s\\-_/])/i.test(String(v||''));
   const vehicleBrand=v=>{const s=String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[._/]+/g,' ').replace(/\s+/g,' ').trim();const brands=[
[/mercedes|merc|benz|c[ -]?class|e[ -]?class|s[ -]?class|g[ -]?class|gle|glc|gls|gla|glb|cla|cls|viano|vito|sprinter/,'Mercedes-Benz','mercedes-benz.svg'],[/\\bbmw\\b|\\b(?:x1|x3|x4|x5|x6|x7|m2|m3|m4|m5|m8|i4|i5|i7|ix|z4)\\b/,'BMW','bmw.svg'],[/land rover|range rover|defender|discovery|evoque|velar/,'Land Rover','land-rover.svg'],[/\\blexus\\b|\\b(?:es|is|ls|ux|nx|rx|gx|lx) ?(?:250|300|350|450|460|500|570|600)?\\b/,'Lexus','lexus.svg'],[/\\bjaguar\\b|f[ -]?pace|e[ -]?pace|i[ -]?pace|f[ -]?type|xe|xf|xj/,'Jaguar','jaguar.svg'],[/\\btoyota\\b|camry|corolla|land cruiser|landcruiser|lc ?(?:70|76|78|79|100|200|300)|prado|hilux|fortuner|hiace|rav ?4|yaris|avalon|innova|rush|raize|crown|supra/,'Toyota','toyota.svg'],[/\\bnissan\\b|patrol|super ?safari|safari|x[ -]?trail|rogue|pathfinder|navara|urvan|sunny|altima|maxima|kicks|qashqai|armada|murano|sentra|tiida|370 ?z/,'Nissan','nissan-logo.svg'],[/\\binfiniti\\b|\\b(?:q50|q60|q70|qx50|qx55|qx60|qx80)\\b/,'Infiniti','infiniti-logo.svg'],[/\\bporsche\\b|cayenne|macan|panamera|taycan|boxster|cayman/,'Porsche','porsche.svg'],[/\\baudi\\b|\\b(?:a3|a4|a5|a6|a7|a8|q2|q3|q5|q7|q8|e-tron)\\b/,'Audi','audi.svg'],[/volkswagen|\\bvw\\b|tiguan|touareg|teramont|passat|jetta|golf/,'Volkswagen','volkswagen.svg'],[/\\bvolvo\\b|\\b(?:xc40|xc60|xc90|s60|s90|v60|v90)\\b/,'Volvo','volvo.svg'],[/mitsubishi|pajero|montero|outlander|attrage|eclipse cross|xpander/,'Mitsubishi','mitsubishi.svg'],[/\\bmazda\\b|\\b(?:cx-?3|cx-?30|cx-?5|cx-?60|cx-?9|cx-?90|mazda ?3|mazda ?6|mx-?5)\\b/,'Mazda','mazda.svg'],[/\\bjeep\\b|wrangler|cherokee|compass|renegade|gladiator/,'Jeep','jeep.svg'],[/\\bhyundai\\b|tucson|santa fe|palisade|elantra|accent|sonata|creta|venue|ioniq/,'Hyundai','hyundai-logo.svg'],[/\\bkia\\b|\\b(?:picanto|rio|cerato|forte|k3|k4|k5|k8|k9|sportage|sorento|seltos|sonet|carens|carnival|telluride|stinger|niro|soul|optima|cadenza|mohave|pegas|ev3|ev4|ev5|ev6|ev9)\\b/,'Kia','kia-logo.svg'],[/\\bgenesis\\b|\\b(?:g70|g80|g90|gv60|gv70|gv80)\\b/,'Genesis','genesis-logo.svg'],[/\\bbyd\\b|atto ?3|seal(?:ion)? ?[5-7]?|dolphin|han|tang|song plus/,'BYD','byd-logo.svg'],[/\\bjetour\\b|x70|x90|t2/,'Jetour','jetour.svg'],[/\\bgeely\\b|coolray|monjaro|emgrand|okavango|starray/,'Geely','geely.svg'],[/\\blincoln\\b/,'Lincoln','lincoln.svg'],[/\\bchrysler\\b/,'Chrysler','chrysler.svg'],[/\\bisuzu\\b/,'Isuzu','isuzu.svg'],[/\\bram\\b/,'RAM','ram.svg'],[/\\bsuzuki\\b|jimny|vitara|ertiga|baleno|swift|dzire|ciaz/,'Suzuki','suzuki.svg'],[/\\brenault\\b|duster|koleos|megane|captur|symbol/,'Renault','renault.svg'],[/peugeot|\\b(?:2008|3008|5008)\\b/,'Peugeot','peugeot.svg'],[/citro[eë]n/,'Citroën','citroen.svg'],[/\\bskoda\\b|škoda/,'Škoda','skoda.svg'],[/\\bbentley\\b/,'Bentley','bentley.svg'],[/rolls[ -]?royce/,'Rolls-Royce','rolls-royce.svg'],[/aston[ -]?martin/,'Aston Martin','aston-martin.svg'],[/\\bferrari\\b/,'Ferrari','ferrari.svg'],[/mclaren/,'McLaren','mclaren.svg'],[/\\bman\\b/,'MAN','man.svg'],[/great wall|\\bgwm\\b/,'GWM','gwm.svg']
];for(const b of brands)if(b[0].test(s))return{name:b[1],file:b[2]};return null};
   const vehicleBadge=v=>{const b=vehicleBrand(v),ev=v82EV(v),evBadge=ev?'<span class="v82-ev-badge">⚡ EV</span>':'';if(!b)return'<div class="v82-vehicle-mark">'+car()+evBadge+'</div>';return'<div class="v82-vehicle-mark"><div class="v82-brand-logo" title="'+esc(b.name)+'"><img src="vehicle-logos/'+esc(b.file)+'" alt="'+esc(b.name)+' logo" onerror="this.parentElement.outerHTML=\'<div class=&quot;v75s-car v82-logo-fallback&quot; aria-label=&quot;Logo unavailable&quot;><span class=&quot;v80-generic-car&quot;>🚘</span></div>\'"></div>'+evBadge+'</div>'};
   const all=(state.assign||[]).filter(a=>a&&a.emp===me.id&&!a.cancelled);
   const open=all.filter(a=>!a.completed).sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0));
   const done=all.filter(a=>a.completed).sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
   const active=activeSession(me.id),aa=active?((state.assign||[]).find(a=>a&&a.id===active.assignmentId)||open.find(a=>a.job===active.job)):null;
   const j=active?jj(active.job):null,ac=aa?actual(aa):0,sg=aa?(+aa.suggested||0):0,remain=Math.max(0,sg-ac),over=Math.max(0,ac-sg),hold=!!active&&active.job===H;
   const startTime=active?clock(active.start):'—',running=active&&aa?fm(actual(aa)):'0h 00m';

   if(!document.getElementById('v75stableEmployeeStyle')){
     const st=document.createElement('style');st.id='v75stableEmployeeStyle';st.textContent=`
#employeeView.v75s{font-family:Arial,Helvetica,sans-serif;color:#071b3d;background:#eef5fa;padding:0 0 24px}
.v75s-brand{margin:-2px -2px 12px;padding:16px 18px;background:linear-gradient(145deg,#12324e,#061827);color:#fff;display:flex;align-items:center;gap:12px;border-radius:0 0 18px 18px;box-shadow:0 8px 18px #0b1d2c30}
.v82-vehicle-mark{display:flex;align-items:center;gap:5px;flex:0 0 auto;min-height:38px;margin:5px 0 7px}.v82-brand-logo{width:58px;height:38px;border-radius:9px;background:#fff;display:grid;place-items:center;padding:5px;box-sizing:border-box;box-shadow:inset 0 0 0 1px #d8e4ee,0 3px 7px #17324b18;overflow:hidden}.v82-brand-logo img{display:block;width:100%;height:100%;object-fit:contain}.v82-ev-badge{display:inline-flex;align-items:center;white-space:nowrap;padding:6px 8px;border-radius:12px;background:#e7f8ff;border:1px solid #76c9e8;color:#07577a;font-size:11px;font-weight:1000}.v82-logo-fallback{margin:0}.v75s-logo{width:46px;height:46px;border-radius:12px;background:#fff;color:#0d3153;display:grid;place-items:center;font-size:28px;font-weight:1000;font-style:italic;box-shadow:inset 0 -4px 0 #dce5ec,0 4px 10px #0003}
.v75s-brand h2{margin:0;font-size:21px}.v84-emp-account{margin-left:auto;width:46px;height:42px;padding:0;border-radius:12px;background:#ffffff18!important;border:1px solid #ffffff42!important;color:#fff!important;font-size:25px;line-height:1;box-shadow:none!important}.v75s-brand small{display:block;color:#cbd5e1;font-size:10px;letter-spacing:.08em;margin-top:2px}.v75s-menu{margin-left:auto;font-size:28px}
.v75s-identity{margin:0 10px 12px;background:linear-gradient(145deg,#fff,#f5f8fb);border:1px solid #dce5ee;border-radius:20px;min-height:58px;padding:0 18px;display:flex;align-items:center;box-shadow:0 7px 16px #17324b18,inset 0 1px #fff}
.v75s-identity b{font-size:19px}.v75s-online{margin-left:auto;background:#eaffea;border:1px solid #8cde96;border-radius:22px;padding:9px 13px;font-size:12px;font-weight:900;color:#174526;box-shadow:0 3px 8px #45b65b22}.v75s-online i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#15953a;margin-right:6px}
.v75s-shell{margin:0 10px 14px;padding:12px;background:linear-gradient(145deg,#fff,#f8fbfe);border:1px solid #d8e4ee;border-radius:22px;box-shadow:0 12px 24px #17324b20,0 2px 0 #fff inset}
.v75s-top{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(145px,.8fr);gap:12px}
.v75s-live{min-height:108px;padding:16px 17px;border-radius:19px;background:linear-gradient(145deg,#f3ffd8,#bceba9);display:flex;align-items:center;gap:12px;border:1px solid #b3de9c;box-shadow:inset 0 3px 8px #fff9,0 5px 10px #7daa6827}
.v75s-live.off{background:linear-gradient(135deg,#fff3c4 0%,#ffd46b 48%,#ffbd59 100%);border-color:#e9a62d!important;color:#603900;box-shadow:inset 0 2px 0 #fff9,inset 0 -10px 24px #f59e0b18,0 9px 22px #d88a263d!important}.v75s-live.off:after{background:linear-gradient(180deg,rgba(255,255,255,.42),rgba(255,255,255,0))!important}.v75s-live.off .v75s-gear{background:linear-gradient(145deg,#fffdf1,#fff0ad);color:#a94700;border:1px solid #efbd55;box-shadow:inset 0 2px 5px #fff,0 5px 13px #a947002c}.v75s-live.off h2{color:#873c00;letter-spacing:.025em;text-shadow:0 1px #fff8}.v75s-live.off p{color:#603900;font-weight:900}.v75s-gear{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:#fff8;font-size:28px;box-shadow:inset 0 -4px 8px #0001,0 4px 10px #0001}.v75s-live h2{margin:0;font-size:22px}.v75s-live p{margin:4px 0 0;font-size:13px}
.v75s-clock{border-radius:19px;background:linear-gradient(145deg,#fff9dc,#f6ddb1);padding:12px;display:flex;flex-direction:column;justify-content:center;text-align:center;border:1px solid #efcf91;box-shadow:inset 0 3px 8px #fff9,0 5px 10px #af864327}.v75s-clock b{font-size:21px}.v75s-clock small{font-size:10px;margin-top:4px}
.v75s-hero{margin:12px 0 10px;padding:12px 14px;border-radius:18px;background:linear-gradient(145deg,#fff,#f7fafc);border:1px solid #e1e8ef;display:flex;align-items:center;min-height:82px;box-shadow:inset 0 2px #fff,0 4px 10px #0f17220d}.v75s-jno{font-size:16px;font-weight:1000;color:#4b6478;letter-spacing:.04em}.v75s-vehicle{font-size:25px;font-weight:1000;margin-top:5px;line-height:1.05}.v75s-reg{font-size:15px;font-weight:800;color:#536779;margin-top:5px}.v75s-hero .v75s-car{margin-left:auto}
.v75s-car{position:relative;width:78px;height:46px;flex:0 0 78px}.v75s-car .body{position:absolute;left:5px;right:5px;bottom:9px;height:19px;background:#17324e;border-radius:13px 17px 7px 7px;box-shadow:inset 0 -5px #07182740}.v75s-car .roof{position:absolute;left:20px;top:6px;width:39px;height:18px;background:#385a74;transform:skew(-19deg);border-radius:9px 9px 2px 2px}.v75s-car b{position:absolute;bottom:2px;width:14px;height:14px;border-radius:50%;background:#101820;border:4px solid #d6dde3}.v75s-car .w1{left:14px}.v75s-car .w2{right:13px}
.v75s-timepair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:8px 0 12px;align-items:center}.v80-gauge{--g:#16a34a;--p:0deg;position:relative;aspect-ratio:1/1;max-width:190px;width:100%;margin:auto;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--g) var(--p),#dce6ee 0);box-shadow:0 7px 16px #17324b1f}.v80-gauge:before{content:'';position:absolute;inset:12px;border-radius:50%;background:#fff;box-shadow:inset 0 2px 8px #17324b14}.v80-gauge-inner{position:relative;z-index:1;text-align:center;padding:8px;line-height:1.05}.v80-gauge-title{display:block;font-size:10px;font-weight:1000;letter-spacing:.04em;color:#526779}.v80-gauge b{display:block;font-size:24px;margin:7px 0 5px;color:#071b3d}.v80-gauge small{display:block;font-size:9px;font-weight:900;color:var(--g)}.v80-gauge .v80-start{margin-top:5px;color:#64748b;font-size:8px;font-weight:800}.v80-green{--g:#16a34a}.v80-blue{--g:#2583d8}.v80-orange{--g:#e98613}.v80-red{--g:#dc2626}.v80-gauge.v80-red:before{background:rgba(255,247,247,.72)}.v80-gauge.v80-red b{color:#b91c1c}
/* V89 Liquid Glass gauges — preserve status colors while matching the Employee glass language. */
.v80-gauge{backdrop-filter:blur(18px) saturate(150%);-webkit-backdrop-filter:blur(18px) saturate(150%);background:conic-gradient(var(--g) var(--p),rgba(220,230,238,.56) 0);border:1px solid rgba(255,255,255,.48);box-shadow:inset 0 1px 0 rgba(255,255,255,.76),0 12px 28px rgba(15,23,42,.17)}
.v80-gauge:before{background:radial-gradient(circle at 32% 22%,rgba(255,255,255,.82),rgba(255,255,255,.56) 38%,rgba(244,249,252,.48) 100%);border:1px solid rgba(255,255,255,.60);box-shadow:inset 0 1px 0 rgba(255,255,255,.90),inset 0 -12px 24px rgba(148,163,184,.08)}
.v80-gauge:after{content:'';position:absolute;left:20%;right:20%;top:8%;height:22%;border-radius:50%;background:linear-gradient(180deg,rgba(255,255,255,.68),rgba(255,255,255,.04));pointer-events:none;z-index:1}
.v80-gauge-inner{z-index:2}.v80-gauge b{font-size:26px}.v80-gauge-title{font-size:11px}.v80-gauge small{font-size:10px}
/* V100 Employee gauge clarity: dashboard-style arc, clear USED/LEFT labels, status-coloured remaining time. */
.v80-rpm-gauge{overflow:hidden;background:conic-gradient(from 225deg,var(--g) 0 var(--p),rgba(203,213,225,.42) var(--p) 360deg)!important;border:2px solid rgba(255,255,255,.72);box-shadow:inset 0 0 0 5px rgba(15,23,42,.035),0 12px 26px rgba(15,23,42,.16)}
.v80-rpm-gauge:before{inset:15px!important;background:radial-gradient(circle at 50% 38%,#fff 0,#f8fbfd 62%,#edf3f7 100%)!important}
.v80-rpm-gauge:after{left:24%!important;right:24%!important;top:10%!important;height:16%!important}
.v80-rpm-gauge .v80-gauge-inner{margin-top:16px}.v80-rpm-gauge .v80-gauge-title{font-size:13px;font-weight:1000;letter-spacing:.055em}.v80-rpm-gauge b{font-size:29px!important;margin:6px 0 4px!important}.v80-rpm-gauge small{font-size:12px!important;font-weight:1000!important;letter-spacing:.035em}
.v80-rpm-gauge.v80-red b,.v80-rpm-gauge.v80-red small{color:#dc2626!important}
.v75s-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.v75s-metric{border-radius:17px;padding:14px 7px;min-height:68px;display:flex;flex-direction:column;justify-content:center;text-align:center;border:1px solid;box-shadow:inset 0 3px 6px #fff8,0 5px 10px #0000000f}.v75s-metric span{display:block;font-size:11px;font-weight:900;line-height:1.15}.v75s-metric b{display:block;font-size:21px;margin-top:7px;white-space:nowrap}.v75s-metric.alloc{background:#e8f2ff;border-color:#bad4f1}.v75s-metric.actual{background:#e7f8ea;border-color:#b8dfc0}.v75s-metric.remain{background:#fff7d9;border-color:#ecd487}.v75s-metric.over{background:#ffe7e7;border-color:#efb6b6}
.v75s-request{display:block;width:100%;margin:11px 0 0;padding:13px 10px;border-radius:14px;background:linear-gradient(#3587ef,#1768cc);font-weight:1000;font-size:15px;box-shadow:0 6px 0 #0d4f9e,0 10px 16px #1768cc36}
.v75s-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:11px}.v75s-actions.one{grid-template-columns:1fr}.v75s-actions button{min-height:55px;border-radius:15px;font-size:15px;font-weight:1000}.v75s-pause{background:linear-gradient(#f59e0b,#d97706)!important;box-shadow:0 6px 0 #a65304,0 10px 16px #d9770632}.v75s-finish{background:linear-gradient(#22a447,#128134)!important;box-shadow:0 6px 0 #086626,0 10px 16px #15803d32}
.v75s-allotted-head{margin:0 10px;padding:13px 14px;border-radius:18px;background:linear-gradient(145deg,#12324e,#061827);color:#fff;display:flex;align-items:center;gap:11px;box-shadow:0 7px 0 #04121f,0 12px 20px #0618272c}.v75s-allotted-head h2{margin:0;font-size:19px}.v75s-allotted-head p{margin:3px 0 0;color:#cbd5e1;font-size:10px}.v75s-count{margin-left:auto;background:#fff1;color:#fff;border:1px solid #ffffff33;border-radius:20px;padding:7px 10px;font-size:11px;font-weight:900}
.v75s-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 10px}.v75s-card{background:#fff;border:2px solid #c8d8e5;border-radius:18px;padding:11px;box-shadow:0 7px 14px #17324b18,inset 0 2px #fff}.v75s-card.running{border-color:#55bd6a;background:#f3fff5}.v75s-card.ideal{border-color:#cda66b;background:#fffaf0}.v75s-card-top{display:flex;gap:6px;align-items:center}.v75s-card-top b{font-size:13px}.v75s-badge{margin-left:auto;border-radius:12px;padding:4px 7px;font-size:8px;font-weight:1000;background:#e9eef3;color:#36495b}.v75s-card.running .v75s-badge{background:#dbf8df;color:#166534}.v75s-card h3{font-size:15px;margin:10px 0 4px}.v75s-card p{font-size:11px;color:#5b6e7c;margin:0 0 9px}.v75s-mini{display:grid;grid-template-columns:1fr 1fr;gap:6px}.v75s-mini div{background:#f3f6f9;border-radius:10px;padding:7px;text-align:center;font-size:9px}.v75s-mini b{display:block;font-size:13px;margin-top:3px}.v75s-start{width:100%;margin-top:9px;border-radius:11px;padding:10px;font-weight:1000;background:linear-gradient(#378bf5,#1d6fd4);box-shadow:0 4px 0 #1154a5}.v75s-start[disabled]{background:#d8e1e8;color:#64748b;box-shadow:none}.v75s-card .v75s-car{transform:scale(.62);transform-origin:left center;margin:5px 0 7px}.v75s-card .v82-vehicle-mark{height:38px;min-height:38px;margin:4px 0 8px;align-items:center;overflow:hidden}.v75s-card .v82-brand-logo{width:52px;height:32px;min-width:52px;max-width:52px;padding:4px;overflow:hidden}.v75s-card .v82-brand-logo img{display:block;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important}.v82-brand-logo[title="Kia"] img{transform:scale(1.18);transform-origin:center}.v82-brand-logo[title="Mercedes-Benz"] img{width:88%!important;height:88%!important;margin:auto!important;object-position:center center!important;transform:none!important}.v75s-card .v82-logo-fallback{height:32px;display:flex;align-items:center;overflow:hidden}.v75s-card .v80-generic-car{font-size:30px;line-height:1}
.v75s-warning{margin:0 10px 12px;padding:10px 12px;border-radius:14px;background:#fff7d6;border:1px solid #ebd177;color:#6e5312;font-size:11px;font-weight:800}
.v75s-section{margin:12px 10px 0}.v75s-section.card{border-radius:19px;box-shadow:0 7px 16px #17324b16}.v75s-history{overflow:auto}.v75s-history table{min-width:620px}
.v80-compact-brand{padding:10px 14px!important;margin-bottom:7px!important;border-radius:0 0 14px 14px!important}.v80-compact-brand .v75s-logo{width:38px;height:38px;font-size:23px}.v80-compact-brand h2{font-size:19px}.v80-compact-identity{min-height:46px!important;margin-bottom:7px!important;padding:0 14px!important;border-radius:14px!important}.v80-compact-identity b{font-size:16px!important}
.v80-brand-badge{margin-left:auto;min-width:74px;max-width:96px;min-height:58px;border-radius:16px;border:1px solid #d5e0e8;background:linear-gradient(145deg,#fff,#edf3f7);display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:inset 0 2px #fff,0 4px 10px #17324b18}.v80-brand-badge b{font-size:18px;line-height:1;color:#0d3153}.v80-brand-badge small{font-size:8px;font-weight:900;color:#536779;margin-top:5px;text-align:center}.v80-generic-car{font-size:42px;filter:grayscale(.15)}
.v81-month-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:8px 2px 4px}.v81-month-orb{--orb1:#2563eb;--orb2:#0f3f91;position:relative;aspect-ratio:1/1;max-width:170px;width:100%;margin:auto;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:15px;color:#fff;background:radial-gradient(circle at 32% 25%,rgba(255,255,255,.42) 0 5%,transparent 6% 100%),linear-gradient(145deg,var(--orb1),var(--orb2));border:1px solid rgba(255,255,255,.32);box-shadow:inset 0 7px 14px rgba(255,255,255,.22),inset 0 -10px 18px rgba(0,0,0,.20),0 9px 16px rgba(15,23,42,.20)}.v81-month-orb:after{content:'';position:absolute;inset:7px;border-radius:50%;border:1px solid rgba(255,255,255,.24);pointer-events:none}.v81-month-orb b{font-size:28px;line-height:1.05;text-shadow:0 2px 3px rgba(0,0,0,.28);z-index:1}.v81-month-orb span{font-size:12px;font-weight:900;line-height:1.2;letter-spacing:.02em;text-transform:uppercase;margin-top:9px;max-width:128px;z-index:1}.v81-m1{--orb1:#3978e8;--orb2:#174a9e}.v81-m2{--orb1:#18a874;--orb2:#087052}.v81-m3{--orb1:#16a6c7;--orb2:#0a6682}.v81-m4{--orb1:#7658d9;--orb2:#49339b}.v81-m5{--orb1:#e4a11b;--orb2:#a66309}.v81-m6{--orb1:#e46d32;--orb2:#a83b16}.v81-m7{--orb1:#d64b70;--orb2:#932748}.v81-m8{--orb1:#8b5bd6;--orb2:#5731a0}
.v81-month-orb{background:linear-gradient(145deg,var(--orb1),var(--orb2));background-color:var(--orb1)}
.v81-month-orb{backdrop-filter:blur(18px) saturate(150%);-webkit-backdrop-filter:blur(18px) saturate(150%);background:radial-gradient(circle at 30% 20%,rgba(255,255,255,.58) 0 4%,rgba(255,255,255,.20) 5% 20%,transparent 42%),linear-gradient(145deg,color-mix(in srgb,var(--orb1) 72%,transparent),color-mix(in srgb,var(--orb2) 78%,transparent));border:1px solid rgba(255,255,255,.46);box-shadow:inset 0 1px 0 rgba(255,255,255,.72),inset 0 -12px 24px rgba(255,255,255,.06),0 12px 28px rgba(15,23,42,.18)}
.v81-month-orb:before{content:'';position:absolute;left:15%;right:15%;top:9%;height:25%;border-radius:50%;background:linear-gradient(180deg,rgba(255,255,255,.48),rgba(255,255,255,.04));filter:blur(.2px);pointer-events:none}
.v75s-live,.v75s-hero,.v75s-timepair{backdrop-filter:blur(18px) saturate(145%);-webkit-backdrop-filter:blur(18px) saturate(145%);border-color:rgba(255,255,255,.38)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.58),0 10px 26px rgba(15,23,42,.14)!important}
.v75s-live:after,.v75s-hero:after{content:'';position:absolute;left:12px;right:12px;top:5px;height:24%;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.20),transparent);pointer-events:none}
.v75s-live,.v75s-hero{position:relative;overflow:hidden}.v81-month-leave{margin:12px 10px 0;width:calc(100% - 20px);border:1px solid #b9d8c5;border-radius:18px;padding:14px 16px;background:linear-gradient(145deg,#f0fff5,#dff4e7);color:#164e32;display:flex;align-items:center;gap:14px;text-align:left;box-shadow:0 7px 16px #17324b16}.v81-month-leave .v81-leave-icon{width:48px;height:48px;flex:0 0 48px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#15803d;font-size:24px;box-shadow:inset 0 2px #fff,0 4px 10px #16653422}.v81-month-leave .v81-leave-copy{flex:1}.v81-month-leave .v81-leave-copy span{display:block;font-size:11px;font-weight:900;letter-spacing:.04em}.v81-month-leave .v81-leave-copy b{display:block;font-size:24px;line-height:1.15;margin:2px 0}.v81-month-leave .v81-leave-copy small{font-size:10px;color:#47705a}.v81-month-leave .v81-leave-open{font-size:24px;font-weight:900}@media(max-width:380px){.v81-month-grid{gap:9px}.v81-month-orb{max-width:145px}.v81-month-orb b{font-size:24px}.v81-month-orb span{font-size:11px}}
@media(max-width:520px){.v75s-top{grid-template-columns:minmax(0,1.5fr) minmax(115px,.75fr)}.v75s-live{min-height:100px;padding:13px}.v75s-gear{width:44px;height:44px;font-size:22px}.v75s-live h2{font-size:17px}.v75s-clock b{font-size:16px}.v75s-vehicle{font-size:21px}.v75s-metrics{gap:7px}.v75s-metric{padding:12px 4px;min-height:64px}.v75s-metric span{font-size:9px}.v75s-metric b{font-size:17px}.v75s-grid{gap:7px}.v75s-card{padding:9px}.v75s-card h3{font-size:13px}.v75s-mini b{font-size:11px}.v75s-identity b{font-size:16px}}
.v89-employee-lower{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;margin-top:10px}.v89-employee-lower>.card{margin:0!important;min-width:0!important}.v89-employee-lower>.card:last-child:nth-child(odd){grid-column:1/-1}.v89-employee-control{min-height:92px!important}@media(max-width:380px){.v89-employee-lower{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important}.v89-employee-lower .section-title h3{font-size:12px!important}.v89-employee-lower .small{font-size:9px!important}}
`;document.head.appendChild(st);
   }
   root.classList.add('v75s');

   const dept=String(me.department||P(me.id).department||'Employee').trim()||'Employee';
   // Employee owns exactly one app-title header. Hide every legacy/global title source at render time.
   document.body.classList.add('employee-session');
   const globalHeader=document.getElementById('globalBrandHeader');if(globalHeader){globalHeader.classList.add('hidden');globalHeader.style.setProperty('display','none','important')}
   const legacyHeader=document.getElementById('legacyAppHeader');if(legacyHeader){legacyHeader.classList.add('hidden');legacyHeader.style.setProperty('display','none','important')}
   root.querySelectorAll('.v75s-brand,.v80-compact-brand').forEach(x=>x.remove());
   const brand='<div class="v75s-brand v80-compact-brand"><div class="v75s-logo">Z</div><div><h2>Zukait Time Track</h2></div></div>';
   const identity='<div class="v75s-identity v80-compact-identity"><b>'+esc(me.name)+' · '+esc(dept)+'</b><span class="v75s-online"><i></i>ONLINE</span><button class="v84-emp-account v91-identity-menu" onclick="v84EmployeeAccount()" aria-label="Open account menu">☰</button></div>';

   let runningHtml='<div class="v75s-shell"><div class="v75s-top"><div class="v75s-live '+(active?'':'off')+'"><div class="v75s-gear">'+(active?(hold?'◷':'⚙'):'⚠')+'</div><div><h2>'+(active?(hold?'IDEAL TIME':'RUNNING WORK'):'NO RUNNING WORK')+'</h2><p>'+(active?(hold?'Waiting Time Running...':'Work in Progress...'):'No job is running — select an allotted job below')+'</p></div></div><div class="v75s-clock"><b id="v75sClock">'+clock(Date.now())+'</b><small id="v75sDate">'+date(Date.now())+'</small></div></div>';
   if(active&&aa){
     runningHtml+='<div class="v75s-hero"><div><div class="v75s-jno">JOB NUMBER : <b>'+esc(active.job)+'</b></div><div class="v75s-vehicle">'+esc(hold?'IDEAL TIME':(j.vehicle||'—'))+'</div><div class="v75s-reg">'+esc(hold?'Waiting / No Assigned Work':(j.reg||'—'))+'</div></div>'+(hold?'<div class="v75s-gear" style="margin-left:auto">◷</div>':vehicleBadge(j.vehicle))+'</div>'+
       '<div class="v75s-timepair"><div id="v80RunningGauge" class="v80-gauge v80-rpm-gauge v80-green"><div class="v80-gauge-inner"><span class="v80-gauge-title">RUNNING TIME</span><b id="v75sRunning">'+esc(running)+'</b><small id="v80RunningPct">0% USED</small><span class="v80-start">Started '+esc(startTime)+'</span></div></div><div id="v80RemainingGauge" class="v80-gauge v80-rpm-gauge v80-green"><div class="v80-gauge-inner"><span id="v80RemainingTitle" class="v80-gauge-title">'+(sg>0?'REMAINING TIME':'NO ALLOCATED TIME')+'</span><b id="currentRemaining">'+(sg>0?fm(remain):'—')+'</b><small id="v80RemainingPct">'+(sg>0?'100% LEFT':'SET TIME')+'</small></div></div></div>'+
       '<div class="v75s-metrics"><div class="v75s-metric alloc"><span>Allocated Time</span><b>'+fm(sg)+'</b></div><div class="v75s-metric actual"><span>Actual Work Time</span><b id="currentActual">'+fm(ac)+'</b></div><div class="v75s-metric over"><span>Exceeded Time</span><b id="currentExceeded">'+fm(hold?0:over)+'</b></div></div>'+
       (hold?'':'<button class="v75s-request" onclick="openEmployeeRequestMenu(\''+esc(active.job)+'\')">● INFORM / REQUEST</button>')+
       '<div class="v75s-actions '+(hold?'one':'')+'">'+(hold?'':'<button class="v75s-pause" onclick="pause()">Ⅱ PAUSE WORK</button>')+'<button class="v75s-finish" onclick="finish()">'+(hold?'■ STOP':'✓ FINISH WORK')+'</button></div>';
   }
   runningHtml+='</div>';

   const cards=open.length?open.map(a=>{const x=jj(a.job),run=!!active&&((active.assignmentId&&active.assignmentId===a.id)||(!active.assignmentId&&active.job===a.job)),holdCard=a.job===H,worked=actual(a),remaining=Math.max(0,(+a.suggested||0)-worked),badge=run?'RUNNING':(worked>0?'PAUSED':'NOT STARTED');return '<div class="v75s-card '+(run?'running ':'')+(holdCard?'ideal':'')+'"><div class="v75s-card-top"><b>JOB : '+esc(a.job)+'</b><span class="v75s-badge">'+badge+'</span></div><h3>'+esc(holdCard?'IDEAL TIME':(x.vehicle||'—'))+'</h3><p>'+esc(holdCard?'Waiting / No Assigned Work':(x.reg||'—'))+'</p>'+(holdCard?'<div class="v75s-gear" style="width:40px;height:40px;font-size:20px">◷</div>':vehicleBadge(x.vehicle))+'<div class="v75s-mini"><div>Allocated<b>'+fm(a.suggested)+'</b></div><div>Remaining<b>'+fm(remaining)+'</b></div></div>'+(run?'<button class="v75s-start" disabled>CURRENTLY RUNNING</button>':active?'<button class="v75s-start" disabled>Pause current work first</button>':'<button class="v75s-start" onclick="start(\''+esc(a.job)+'\')">▶ START WORK</button>')+'</div>'}).join(''):'<div class="notice">No allotted job cards.</div>';
   const allotted='<div class="v75s-allotted-head"><div style="font-size:22px">▣</div><div><h2>ALLOTTED WORK</h2><p>Your assigned job cards (Pause current work to start another)</p></div><span class="v75s-count">'+open.length+' Job'+(open.length===1?'':'s')+'</span></div><div class="v75s-grid">'+cards+'</div>'+(active&&open.some(a=>!((active.assignmentId&&active.assignmentId===a.id)||(!active.assignmentId&&active.job===a.job)))?'<div class="v75s-warning">⚠ Please pause your current work before starting another job. You can work on only one job at a time.</div>':'');

   const nowTs=Date.now(),d=new Date(nowTs),mf=+new Date(d.getFullYear(),d.getMonth(),1),mt=+new Date(d.getFullYear(),d.getMonth()+1,1);
   const normalDone=done.filter(a=>a.job!==H&&(a.completedAt||0)>=mf&&(a.completedAt||0)<mt);
   // "Ideal Time" is the duty-hour gap metric. ID001 is waiting coverage and must not be displayed as Ideal Time.
   const idealMin=typeof window.monthlyIdealTimeMinutes==='function'?window.monthlyIdealTimeMinutes(me.id,mf,mt):0;
   const overtimeMin=(state.sessions||[]).filter(x=>x&&x.emp===me.id&&x.job!==H&&x.start<mt&&(x.end||nowTs)>mf).reduce((n,x)=>{const st=Math.max(+x.start||0,mf),en=Math.min(+(x.end||nowTs),mt);if(en<=st)return n;try{return n+(typeof window.sessionOvertimeMinutes==='function'?window.sessionOvertimeMinutes({start:st,end:en},en):0)}catch(_){return n}},0);
   const normalSg=normalDone.reduce((n,a)=>n+(+a.suggested||0),0),normalAc=normalDone.reduce((n,a)=>n+(typeof window.v107AssignmentNormal==='function'?window.v107AssignmentNormal(a,mf,mt):actual(a)),0),eff=normalAc?normalSg/normalAc*100:null;
   const monthSuggested=typeof window.monthlySuggestedMinutes==='function'?window.monthlySuggestedMinutes(me.id,mf,mt):(state.assign||[]).filter(a=>a&&a.emp===me.id&&a.job!==H&&!a.cancelled&&(a.assignedAt||0)>=mf&&(a.assignedAt||0)<mt).reduce((n,a)=>n+(+a.suggested||0),0),monthActual=typeof window.monthlyNormalActualMinutes==='function'?window.monthlyNormalActualMinutes(me.id,mf,mt):(state.sessions||[]).filter(x=>x&&x.emp===me.id&&x.job!==H&&x.start<mt&&(x.end||nowTs)>mf).reduce((n,x)=>n+Math.max(0,(Math.min(+(x.end||nowTs),mt)-Math.max(+x.start||0,mf))/60000),0),monthRemaining=monthSuggested-monthActual,monthInc=typeof window.incentiveFor==='function'?window.incentiveFor(me.id):{incentive:0},orb=(cl,val,label)=>'<div class="v81-month-orb '+cl+'"><b>'+val+'</b><span>'+label+'</span></div>';
   const progress='<div class="v104-month-progress"><div class="v104-progress target"><span>MONTHLY TARGET</span><b>'+fm(+monthInc.target||0)+'</b></div><div class="v104-progress achieved"><span>MONTHLY ACHIEVED</span><b>'+fm(+monthInc.eligible||+monthInc.actual||0)+'</b></div><div class="v104-progress excess"><span>EXCESS HOURS</span><b>'+fm(+monthInc.excess||0)+'</b></div><div class="v104-progress incentive"><span>INCENTIVE</span><b>'+fm(+monthInc.incentive||0)+'</b></div></div>'; const month='<div class="card month-summary v75s-section"><div class="section-title"><h3>📅 This Month</h3><span class="pill">MONTHLY</span></div>'+progress+'<div class="v81-month-grid">'+orb('v81-m1',String(normalDone.length),'Completed Jobs')+orb('v81-m2',eff==null?'—':eff.toFixed(1)+'%','Efficiency')+orb('v81-m3',fm(monthSuggested),'Suggested Time')+orb('v81-m4',fm(monthActual),'Actual Time')+orb('v81-m5',fm(Math.abs(monthRemaining)),monthRemaining>=0?'Remaining Time':'Over Suggested')+orb('v81-m6',fm(idealMin),'Ideal Time')+orb('v81-m7',fm(overtimeMin),'Overtime')+'</div></div>';
   const monthLeaveRows=((state.leaves||[]).filter(l=>l&&!l.cancelled&&String(l.emp)===String(me.id)&&String(l.date||'').startsWith(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'))),monthLeaveDays=monthLeaveRows.reduce((n,l)=>n+(l.period==='FULL'?1:.5),0);
   window.v81OpenMyMonthlyLeave=function(){const rows=((state.leaves||[]).filter(l=>l&&!l.cancelled&&String(l.emp)===String(me.id)&&String(l.date||'').startsWith(new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-'))).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))),label=p=>p==='AM'?'Morning Half Day':p==='PM'?'Afternoon Half Day':'Full Day',body=rows.length?'<div class="v75s-history"><table><tr><th>Date</th><th>Leave Type</th><th>Remark</th></tr>'+rows.map(l=>'<tr><td><b>'+esc(l.date)+'</b></td><td>'+esc(label(l.period))+'</td><td>'+esc(l.remark||'—')+'</td></tr>').join('')+'</table></div>':'<div class="notice">No leave taken this month.</div>';openModal('<div class="section-title"><h2>🗓 My Leave This Month</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="notice"><b>Total Leave: '+(rows.reduce((n,l)=>n+(l.period==='FULL'?1:.5),0)).toFixed(1).replace('.0','')+' day(s)</b></div>'+body)};
   const leaveBox='<button class="v81-month-leave" onclick="v81OpenMyMonthlyLeave()"><span class="v81-leave-icon">🗓</span><span class="v81-leave-copy"><span>LEAVE THIS MONTH</span><b>'+monthLeaveDays.toFixed(1).replace('.0','')+' day'+(monthLeaveDays===1?'':'s')+'</b><small>Tap to view date, leave type and remark</small></span><span class="v81-leave-open">›</span></button>';
   const finishedDone=done.filter(a=>a.job!==H);window.v89OpenEmployeeFinished=function(){const rows=finishedDone.slice(0,30),body=rows.length?'<div class="v75s-history"><table><tr><th>Job</th><th>Vehicle</th><th>Allocated</th><th>Actual</th><th>Finished</th></tr>'+rows.map(a=>{const x=jj(a.job);return '<tr><td><b>'+esc(a.job)+'</b></td><td>'+esc(x.vehicle||'—')+'</td><td>'+fm(a.suggested)+'</td><td>'+fm(actual(a))+'</td><td>'+esc(a.completedAt?new Date(a.completedAt).toLocaleString():'—')+'</td></tr>'}).join('')+'</table></div>':'<p class="muted">No finished jobs.</p>';openModal('<div class="section-title"><h2>✅ Finished Jobs</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+body)};const finished='<div class="card v75s-section clickable compact-control v89-employee-control" onclick="v89OpenEmployeeFinished()"><div class="section-title"><h3>✅ Finished Jobs</h3><span class="pill">'+finishedDone.length+'</span></div><div class="small muted">Tap to view completed job details</div></div>';
   const repeatJobs=(state.assign||[]).filter(a=>a&&a.job!==H&&!a.cancelled&&a.rework===true&&String(a.mistakeEmp||'')===String(me.id)).slice().sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0));
   window.v89OpenEmployeeRepeats=function(){const rows=repeatJobs.slice(0,30),body=rows.length?'<div class="v75s-history"><table><tr><th>Job</th><th>Vehicle</th><th>Allocated</th><th>Actual</th><th>Status</th></tr>'+rows.map(a=>{const x=jj(a.job),st=a.completed?'Finished':((state.sessions||[]).some(z=>z&&!z.end&&z.assignmentId===a.id)?'Running':'Assigned');return '<tr><td><b>'+esc(a.job)+'</b></td><td>'+esc(x.vehicle||'—')+'</td><td>'+fm(a.suggested)+'</td><td>'+fm(actual(a))+'</td><td><b>'+esc(st)+'</b>'+(String(a.emp)!==String(me.id)?'<br><small>Repair: '+esc(((users||[]).find(u=>String(u.id)===String(a.emp))||{}).name||a.emp)+'</small>':'')+'</td></tr>'}).join('')+'</table></div>':'<p class="muted">No repeat jobs.</p>';openModal('<div class="section-title"><h2>🔁 Repeat Jobs</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+body)};const repeatList='<div class="card v75s-section clickable compact-control v89-employee-control" onclick="v89OpenEmployeeRepeats()"><div class="section-title"><h3>🔁 Repeat Jobs</h3><span class="pill">'+repeatJobs.length+'</span></div><div class="small muted">Tap to view repeat-work details</div></div>';
   const historyRows=(state.sessions||[]).filter(x=>x&&x.emp===me.id).slice().sort((a,b)=>(b.start||0)-(a.start||0)).slice(0,30);
   window.v81OpenEmployeeHistory=function(){const rows=(state.sessions||[]).filter(x=>x&&x.emp===me.id).slice().sort((a,b)=>(b.start||0)-(a.start||0)).slice(0,30),body=rows.length?'<div class="v75s-history"><table><tr><th>Job</th><th>Start</th><th>End</th><th>Status</th><th>Time</th></tr>'+rows.map(x=>{const end=x.end||Date.now(),mins=Math.max(0,(end-(+x.start||end))/60000);return '<tr><td><b>'+esc(x.job)+'</b></td><td>'+esc(x.start?new Date(x.start).toLocaleString():'—')+'</td><td>'+esc(x.end?new Date(x.end).toLocaleString():'In progress')+'</td><td>'+esc(x.end?(x.paused?'Paused':'Finished'):'Running')+'</td><td>'+fm(mins)+'</td></tr>'}).join('')+'</table></div>':'<p class="muted">No work history yet.</p>';openModal('<div class="section-title"><h2>📊 Detailed Performance & Work History</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+body)};
   const history='<div class="card v75s-section clickable compact-control" onclick="v81OpenEmployeeHistory()"><div class="section-title"><h3>📊 Detailed Performance & Work History</h3><span class="pill">CLICK TO OPEN</span></div><div class="small muted">View the latest 30 work-history records in a separate window.</div></div>';

   const lower='<div class="v89-employee-lower">'+finished+repeatList+history+'</div>';root.innerHTML=brand+identity+runningHtml+allotted+month+leaveBox+lower;
    // V104: Target / Achieved / Incentive capsules are the only Employee incentive display.
    [...root.querySelectorAll('.employee-month-kpi,.card')].filter(x=>/^(?:Total\s+)?Incentive Hours$/i.test((x.querySelector('.kpi-label,h3')?.textContent||'').trim())).forEach(x=>x.remove());
   if(employeeClockTimer)clearInterval(employeeClockTimer);
   employeeClockTimer=setInterval(()=>{const c=document.getElementById('v75sClock'),dt=document.getElementById('v75sDate');if(c)c.textContent=clock(Date.now());if(dt)dt.textContent=date(Date.now());const x=activeSession(me.id);if(!x)return;const a=(state.assign||[]).find(z=>z&&z.id===x.assignmentId)||open.find(z=>z.job===x.job);if(!a)return;const worked=actual(a),alloc=+a.suggested||0,put=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};const rr=document.getElementById('v75sRunning');if(rr)rr.textContent=fm(worked);put('currentActual',fm(worked));const left=alloc-worked,hasAlloc=alloc>0,usedPct=hasAlloc?(worked/alloc*100):0,leftPct=hasAlloc?(left/alloc*100):0,overMin=x.job===H||!hasAlloc?0:Math.max(0,worked-alloc);put('currentRemaining',!hasAlloc?'—':left<=0?'+'+fm(Math.max(0,-left)):fm(left));put('currentExceeded',fm(overMin));const rg=document.getElementById('v80RunningGauge'),lg=document.getElementById('v80RemainingGauge'),rp=document.getElementById('v80RunningPct'),lp=document.getElementById('v80RemainingPct'),lt=document.getElementById('v80RemainingTitle');const cls=p=>p>=100?'v80-red':p>75?'v80-orange':p>50?'v80-blue':'v80-green';const apply=(el,k,p)=>{if(!el)return;el.classList.remove('v80-green','v80-blue','v80-orange','v80-red');el.classList.add(k);el.style.setProperty('--p',Math.max(0,Math.min(100,p))*3.6+'deg')};apply(rg,cls(usedPct),usedPct);apply(lg,!hasAlloc?'v80-green':left<=0?'v80-red':leftPct<25?'v80-orange':leftPct<50?'v80-blue':'v80-green',hasAlloc?Math.max(0,leftPct):0);if(rp)rp.textContent=hasAlloc?Math.round(usedPct)+'% USED':'TIME RUNNING';if(lp)lp.textContent=!hasAlloc?'SET TIME':left<=0?'OVER ALLOCATED TIME':Math.max(0,Math.round(leftPct))+'% LEFT';if(lt)lt.textContent=!hasAlloc?'NO ALLOCATED TIME':left<=0?'EXCEEDED':'REMAINING TIME'},1000);
 };

 // Employee account menu must remain available with Leave, Update and Logout after the custom dashboard renderer.
 window.v84EmployeeAccount=function(){
   if(!me||me.role!=='Employee')return;
   const name=String(me.name||me.id||'Employee').replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]});
   openModal('<div class="section-title"><h2>'+name+'</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="v63-account v93-employee-menu"><button class="v93-menu-action v93-menu-sync" onclick="v42SyncNow()">↻ <span>SYNC</span></button><button class="v93-menu-action v93-menu-leave" onclick="v84EmployeeLeave()">▣ <span>LEAVE</span></button><button class="v93-menu-action v93-menu-update" onclick="v63OpenAbout()">⬆ <span>ABOUT / UPDATE</span></button><button class="v93-menu-action v93-menu-logout" onclick="closeModal();logout()">↪ <span>LOGOUT</span></button></div>');
 };
 window.v84EmployeeLeave=function(){
   closeModal();
   if(typeof v755OpenLeaveHub==='function')return v755OpenLeaveHub();
   if(typeof v63OpenLeave==='function')return v63OpenLeave();
 };

 // Supervisor accidental-finish recovery uses in-app dialogs only; no browser page alert.
 window.v71ReopenSameAssignment=function(id){
   if(!me||me.role!=='Supervisor')return;
   const a=(state.assign||[]).find(x=>x&&x.id===id&&!x.cancelled);
   if(!a)return v74Msg('Assignment not found.','Reopen Work');
   if(a.job===H)return v74Msg('ID001 must use a new Ideal Time assignment.','Reopen Work');
   if(a.rework)return v74Msg('Repeat Work must be handled from Repeat Work controls.','Reopen Work');
   if(!a.completed)return v74Msg('This assignment is already open.','Reopen Work');
   if((state.assign||[]).some(x=>x&&x.id!==a.id&&x.job===a.job&&x.emp===a.emp&&!x.cancelled&&!x.completed))return v74Msg((safeUser(a.emp).name||a.emp)+' already has an open assignment on this Job Card.','Reopen Work');
   const worked=(()=>{try{return totalForAssignment(a)||0}catch(_){return 0}})(),allocated=+a.suggested||0;
   const doIt=()=>{const finishedAt=a.completedAt||null;a.completed=false;delete a.completedAt;a.reopened=true;a.lastReopenedAt=now();a.lastReopenedBy=me.id;state.reopenLogs=state.reopenLogs||[];state.reopenLogs.push({id:uid(),assignmentId:a.id,job:a.job,emp:a.emp,suggested:allocated,actualAtReopen:worked,previousCompletedAt:finishedAt,by:me.id,at:now()});if(typeof setLastAction==='function')setLastAction('Reopened same assignment '+a.job+' for '+(safeUser(a.emp).name||a.emp));try{if(typeof addNotification==='function')addNotification([a.emp],'Supervisor reopened '+a.job+' with the same allocated time. Previous actual time is retained.',a.id)}catch(_){};save();try{if(typeof closeSupervisorModal==='function')closeSupervisorModal()}catch(_){};render();setTimeout(()=>v74Msg(a.job+' reopened for '+(safeUser(a.emp).name||a.emp)+'. Existing actual time '+fm(worked)+' is retained.','Work Reopened'),0)};
   openModal('<div class="v74-d"><h2>↻ Reopen Same Assignment</h2><div class="notice"><b>Job Card:</b> '+String(a.job)+'<br><b>Technician:</b> '+String(safeUser(a.emp).name||a.emp)+'<br><b>Allocated:</b> '+fm(allocated)+'<br><b>Existing Actual:</b> '+fm(worked)+'</div><p>This keeps the same employee, same allocated time and previous worked time. It is not Repeat Work.</p><div class="v74-actions"><button class="secondary" onclick="closeModal()">CANCEL</button><button class="green" id="v75reopenconfirm">↻ REOPEN SAME</button></div></div>');
   setTimeout(()=>{const b=document.getElementById('v75reopenconfirm');if(b)b.onclick=doIt},0);
 };

 window.v75ID001Safe=true;
})();


/* V75.2 HOLIDAY + ID001 RUNTIME AUTHORITY
   Friday is always a workshop holiday.
   Manager may declare government/public holiday dates in Admin.
   Normal work is allowed on holidays but every worked minute is OVERTIME.
   ID001 is allowed only in normal duty windows on non-holiday working days. */
(function(){'use strict';
 const HOLD='ID001';
 const pad=n=>String(n).padStart(2,'0');
 const dateKey=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
 const entryKey=v=>{if(typeof v==='string')return v.slice(0,10);if(v&&typeof v==='object')return String(v.date||v.dateKey||v.day||'').slice(0,10);return''};
 const holidays=()=>{state.workshopHolidays=Array.isArray(state.workshopHolidays)?state.workshopHolidays:[];return state.workshopHolidays};
 const isFriday=ts=>new Date(ts).getDay()===5;
 const isPublicHoliday=ts=>{const k=dateKey(ts);return holidays().some(v=>entryKey(v)===k)};
 const isClosedDay=ts=>isFriday(ts)||isPublicHoliday(ts);
 const dayStart=ts=>{const d=new Date(ts);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()};
 const dutyWindow=ts=>{
   if(isClosedDay(ts))return null;
   const d=new Date(ts),m=d.getHours()*60+d.getMinutes()+d.getSeconds()/60,ds=dayStart(ts);
   if(m>=480&&m<780)return{start:ds+480*60000,end:ds+780*60000};
   if(m>=900&&m<1140)return{start:ds+900*60000,end:ds+1140*60000};
   return null;
 };
 const onLeave=(emp,ts=Date.now())=>{try{return typeof window.v63IsOnLeave==='function'&&!!window.v63IsOnLeave(emp,ts)}catch(_){return false}};
 const normalMinutes=(start,end)=>{
   start=+start||0;end=+end||0;if(end<=start)return 0;
   let total=0,cur=start;
   while(cur<end){
     const ds=dayStart(cur),de=ds+86400000,se=Math.min(end,de);
     if(!isClosedDay(cur)){
       for(const [a,b] of [[480,780],[900,1140]]){
         total+=Math.max(0,(Math.min(se,ds+b*60000)-Math.max(cur,ds+a*60000))/60000);
       }
     }
     cur=de;
   }
   return Math.max(0,total);
 };
 const overtimeMinutes=(start,end)=>{
   start=+start||0;end=+end||0;if(end<=start)return 0;
   let total=0,cur=start;
   while(cur<end){
     const ds=dayStart(cur),de=ds+86400000,se=Math.min(end,de);
     if(isClosedDay(cur)){
       total+=(se-cur)/60000;
     }else{
       total+=Math.max(0,(Math.min(se,ds+900*60000)-Math.max(cur,ds+780*60000))/60000);
       total+=Math.max(0,(se-Math.max(cur,ds+1140*60000))/60000);
     }
     cur=de;
   }
   return Math.max(0,total);
 };
 window.v75IsWorkshopHoliday=isPublicHoliday;
 window.v75IsClosedWorkshopDay=isClosedDay;
 window.v75IsID001DutyTime=ts=>!!dutyWindow(ts);
 window.sessionNormalMinutes=(session,to=Date.now())=>normalMinutes(session.start,Math.min(session.end||to,to));
 window.sessionOvertimeMinutes=(session,to=Date.now())=>overtimeMinutes(session.start,Math.min(session.end||to,to));
 window.overtimeForSession=window.sessionOvertimeMinutes;
 window.overtimeForEmployee=(emp,from,to)=>(state.sessions||[]).filter(x=>x&&x.emp===emp&&x.start<to&&(x.end||Date.now())>from).reduce((n,x)=>{const st=Math.max(+x.start||0,from),en=Math.min(+(x.end||Date.now()),to);return en>st?n+overtimeMinutes(st,en):n},0);
 window.monthlyNormalActualMinutes=(emp,from,to)=>(state.sessions||[]).filter(x=>x&&x.emp===emp&&x.start<to&&(x.end||Date.now())>from).reduce((n,x)=>{const st=Math.max(+x.start||0,from),en=Math.min(+(x.end||Date.now()),to);return en>st?n+normalMinutes(st,en):n},0);

 const normalAssignmentAvailableMinutes=(emp,gapStart,gapEnd,previousJob)=>{
   const intervals=(state.assign||[]).filter(a=>a&&a.emp===emp&&a.job!==HOLD&&a.job!==previousJob)
     .map(a=>{
       const st=Math.max(gapStart,+a.assignedAt||gapStart);
       const rawEnd=a.completedAt||a.cancelledAt||gapEnd;
       const en=Math.min(gapEnd,+rawEnd||gapEnd);
       return {start:st,end:en};
     }).filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start);
   if(!intervals.length)return 0;
   let total=0,cs=intervals[0].start,ce=intervals[0].end;
   for(let i=1;i<intervals.length;i++){
     const x=intervals[i];
     if(x.start<=ce)ce=Math.max(ce,x.end);
     else{total+=normalMinutes(cs,ce);cs=x.start;ce=x.end;}
   }
   total+=normalMinutes(cs,ce);
   return Math.max(0,total);
 };
 const idealGapMinutes=(emp,from,to)=>{
   const rows=(state.sessions||[]).filter(x=>x&&x.emp===emp&&x.start<to&&(x.end||Date.now())>from)
     .map(x=>({job:x.job,start:Math.max(+x.start||0,from),end:Math.min(+(x.end||Date.now()),to)}))
     .filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start);
   let sum=0,last=null;
   for(const x of rows){
     if(last&&x.start>last.end){
       // A gap is Ideal Time only when OTHER normal work was already available.
       // No-work waiting belongs to ID001 and is never charged as Ideal Time.
       sum+=normalAssignmentAvailableMinutes(emp,last.end,x.start,last.job);
     }
     if(!last||x.end>last.end)last={job:x.job,start:x.start,end:x.end};
   }
   return Math.max(0,sum);
 };
 window.v75NormalAssignmentAvailableMinutes=normalAssignmentAvailableMinutes;
 window.monthlyIdealTimeMinutes=idealGapMinutes;

 const id001Assignment=sess=>(state.assign||[]).find(a=>a&&a.id===sess?.assignmentId)||
   (state.assign||[]).filter(a=>a&&a.job===HOLD&&a.emp===sess?.emp&&!a.cancelled&&!a.completed).sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0))[0]||null;
 const id001StopBoundary=sess=>{
   if(!sess)return Date.now();
   const st=+sess.start||Date.now(),w=dutyWindow(st);
   return w?w.end:st;
 };
 function stopID001AtDutyEnd(){
   let changed=false,t=Date.now();
   (state.sessions||[]).filter(x=>x&&!x.end&&x.job===HOLD).forEach(sess=>{
     const boundary=id001StopBoundary(sess);
     if(t<boundary)return;
     const a=id001Assignment(sess);if(!a)return;
     sess.end=boundary;sess.finished=true;sess.paused=false;sess.autoStopped=true;sess.autoStopReason='ID001 duty window ended';
     a.completed=true;a.completedAt=boundary;a.autoStopped=true;a.autoStopReason='Duty hours ended';
     state.lastActions=state.lastActions||{};
     state.lastActions[sess.emp]={text:'Stopped ID001 automatically at duty end',at:boundary};
     changed=true;
   });
   if(changed){try{save()}catch(_){}}
   return changed;
 }
 window.v75StopID001AtDutyEnd=stopID001AtDutyEnd;

 const oldAssign=window.assignJobCore;
 window.assignJobCore=function(no,emp,minutes){
   if(no!==HOLD)return typeof oldAssign==='function'?oldAssign.apply(this,arguments):undefined;
   const t=Date.now();
   if(isClosedDay(t)){const m=isFriday(t)?'Friday is a workshop holiday. ID001 cannot be assigned.':'This date is marked as a Public Holiday. ID001 cannot be assigned.';return typeof window.v74Msg==='function'?window.v74Msg(m,'Ideal Time'):alert(m)}
   if(!dutyWindow(t)){const m='ID001 can be assigned only during duty hours: 08:00–13:00 and 15:00–19:00.';return typeof window.v74Msg==='function'?window.v74Msg(m,'Ideal Time'):alert(m)}
   if(onLeave(emp,t)){const m=(user(emp)?.name||emp)+' is on leave. ID001 cannot be assigned.';return typeof window.v74Msg==='function'?window.v74Msg(m,'Ideal Time'):alert(m)}
   return typeof oldAssign==='function'?oldAssign.apply(this,arguments):undefined;
 };

 const oldBulk=window.v75AssignIdealToAvailable;
 window.v75AssignIdealToAvailable=function(minutes,employeeIds){
   const t=Date.now();
   if(isClosedDay(t))return{ok:false,reason:'holiday',assigned:[]};
   if(!dutyWindow(t))return{ok:false,reason:'outside_duty',assigned:[]};
   let ids=Array.isArray(employeeIds)&&employeeIds.length?employeeIds.map(String):users.filter(u=>u&&u.role==='Employee').map(u=>String(u.id));
   ids=ids.filter(id=>!onLeave(id,t));
   if(!ids.length)return{ok:false,reason:'none_available',assigned:[]};
   return typeof oldBulk==='function'?oldBulk.call(this,minutes,ids):{ok:false,reason:'unavailable',assigned:[]};
 };

 const oldStart=window.start;
 window.start=function(no){
   if(no!==HOLD)return typeof oldStart==='function'?oldStart.apply(this,arguments):undefined;
   const t=Date.now();
   if(isClosedDay(t)){const m=isFriday(t)?'Friday is a workshop holiday. ID001 cannot run.':'This date is marked as a Public Holiday. ID001 cannot run.';return typeof window.v74Msg==='function'?window.v74Msg(m,'Ideal Time'):alert(m)}
   if(!dutyWindow(t)){const m='ID001 can run only during duty hours: 08:00–13:00 and 15:00–19:00.';return typeof window.v74Msg==='function'?window.v74Msg(m,'Ideal Time'):alert(m)}
   if(me&&onLeave(me.id,t)){const m='ID001 cannot run while you are on leave.';return typeof window.v74Msg==='function'?window.v74Msg(m,'Ideal Time'):alert(m)}
   return typeof oldStart==='function'?oldStart.apply(this,arguments):undefined;
 };

 function updateEmployeeMonthlyLive(){
   if(!me||me.role!=='Employee')return;
   const root=document.getElementById('employeeView');if(!root)return;
   const n=new Date(),from=new Date(n.getFullYear(),n.getMonth(),1).getTime(),to=new Date(n.getFullYear(),n.getMonth()+1,1).getTime();
   const values={'Total Ideal Time':idealGapMinutes(me.id,from,to),'Overtime':window.overtimeForEmployee(me.id,from,to)};
   root.querySelectorAll('.month-summary .notice').forEach(box=>{
     const label=(box.querySelector('b')?.textContent||'').trim(),stat=box.querySelector('.stat');
     if(stat&&Object.prototype.hasOwnProperty.call(values,label))stat.textContent=fmt(values[label]);
   });
 }
 const oldRefresh=window.refreshActiveRunningTime;
 window.refreshActiveRunningTime=function(){
   const stopped=stopID001AtDutyEnd();
   if(stopped){try{render()}catch(_){}return;}
   const out=typeof oldRefresh==='function'?oldRefresh.apply(this,arguments):undefined;
   const sess=me&&me.role==='Employee'?activeSession(me.id):null;
   if(sess&&sess.job===HOLD){
     const a=id001Assignment(sess),worked=a?(typeof totalForAssignment==='function'?Math.max(0,totalForAssignment(a)||0):normalMinutes(sess.start,Date.now())):0,allocated=+a?.suggested||0;
     const put=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
     put('currentActual',fmt(worked));put('currentRemaining',fmt(Math.max(0,allocated-worked)));put('currentExceeded',fmt(0));
   }
   updateEmployeeMonthlyLive();
   return out;
 };

 const oldRenderEmployee=window.renderEmployee;
 window.renderEmployee=function(){
   stopID001AtDutyEnd();
   const out=typeof oldRenderEmployee==='function'?oldRenderEmployee.apply(this,arguments):undefined;
   setTimeout(updateEmployeeMonthlyLive,0);
   return out;
 };
 if(window.v752EmployeeTimer)clearInterval(window.v752EmployeeTimer);
 window.v752EmployeeTimer=setInterval(()=>{if(me?.role==='Employee'){stopID001AtDutyEnd();updateEmployeeMonthlyLive()}},1000);

 // Reopen SAME assignment: reset the parent Job Card as Open immediately on confirmation.
 window.v71ReopenSameAssignment=function(id){
   if(!me||me.role!=='Supervisor')return;
   const a=(state.assign||[]).find(x=>x&&x.id===id&&!x.cancelled);
   const msg=(m,t='Reopen Work')=>typeof window.v74Msg==='function'?window.v74Msg(m,t):alert(m);
   if(!a)return msg('Assignment not found.');
   if(a.job===HOLD)return msg('ID001 must use a new Ideal Time assignment.');
   if(a.rework)return msg('Repeat Work must be handled from Repeat Work controls.');
   if(!a.completed)return msg('This assignment is already open.');
   if((state.assign||[]).some(x=>x&&x.id!==a.id&&x.job===a.job&&x.emp===a.emp&&!x.cancelled&&!x.completed))return msg((user(a.emp)?.name||a.emp)+' already has an open assignment on this Job Card.');
   const worked=(()=>{try{return totalForAssignment(a)||0}catch(_){return 0}})(),allocated=+a.suggested||0,finishedAt=a.completedAt||null;
   const doIt=()=>{
     a.completed=false;delete a.completedAt;a.reopened=true;a.lastReopenedAt=now();a.lastReopenedBy=me.id;
     const j=typeof job==='function'?job(a.job):null;if(j){j.status='Open';delete j.completedAt;j.reopenedAt=now();}
     state.reopenLogs=state.reopenLogs||[];state.reopenLogs.push({id:uid(),assignmentId:a.id,job:a.job,emp:a.emp,suggested:allocated,actualAtReopen:worked,previousCompletedAt:finishedAt,by:me.id,at:now()});
     if(typeof setLastAction==='function')setLastAction('Reopened same assignment '+a.job+' for '+(user(a.emp)?.name||a.emp));
     save();try{if(typeof closeSupervisorModal==='function')closeSupervisorModal();else closeModal()}catch(_){}
     render();setTimeout(()=>msg(a.job+' reopened for '+(user(a.emp)?.name||a.emp)+'. Existing actual time '+fmt(worked)+' is retained.','Work Reopened'),0);
   };
   openModal('<div class="v74-d"><h2>↻ Reopen Same Assignment</h2><div class="notice"><b>Job Card:</b> '+String(a.job)+'<br><b>Technician:</b> '+String(user(a.emp)?.name||a.emp)+'<br><b>Allocated:</b> '+fmt(allocated)+'<br><b>Existing Actual:</b> '+fmt(worked)+'</div><p>This keeps the same employee, same allocated time and previous worked time. It is not Repeat Work.</p><div class="v74-actions"><button class="secondary" onclick="closeModal()">CANCEL</button><button class="green" id="v752reopenconfirm">↻ REOPEN SAME</button></div></div>');
   setTimeout(()=>{const b=document.getElementById('v752reopenconfirm');if(b)b.onclick=doIt},0);
 };

 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.v75OpenPublicHolidays=function(){
   if(!me||me.role!=='Manager')return;
   const rows=holidays().slice().sort((a,b)=>entryKey(a).localeCompare(entryKey(b)));
   const body=rows.length?'<div class="v74-scroll"><table><tr><th>Date</th><th>Holiday</th><th>Action</th></tr>'+rows.map(h=>'<tr><td><b>'+esc(entryKey(h))+'</b></td><td>'+esc(typeof h==='object'?(h.name||'Public Holiday'):'Public Holiday')+'</td><td><button class="danger" onclick="v75RemovePublicHoliday(\''+esc(entryKey(h))+'\')">REMOVE</button></td></tr>').join('')+'</table></div>':'<div class="notice">No additional public holidays are configured.</div>';
   openModal('<div class="section-title"><h2>📅 Public Holidays</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="notice"><b>Friday is always a holiday.</b><br>On Friday or a Manager-declared public holiday, normal Job Card work is allowed but all worked time is OVERTIME. ID001 cannot be assigned or run.</div><div class="grid"><label>Holiday Date<br><input id="v75HolidayDate" type="date"></label><label>Holiday Name<br><input id="v75HolidayName" placeholder="Government Public Holiday"></label></div><p><button class="green" onclick="v75AddPublicHoliday()">+ ADD HOLIDAY</button></p>'+body);
 };
 window.v75AddPublicHoliday=function(){
   if(!me||me.role!=='Manager')return;
   const date=(document.getElementById('v75HolidayDate')?.value||'').trim(),name=(document.getElementById('v75HolidayName')?.value||'').trim()||'Public Holiday';
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return typeof window.v74Msg==='function'?window.v74Msg('Select a valid holiday date.','Public Holidays'):alert('Select a valid holiday date.');
   if(holidays().some(h=>entryKey(h)===date))return typeof window.v74Msg==='function'?window.v74Msg('That date is already marked as a holiday.','Public Holidays'):alert('Holiday already exists.');
   holidays().push({date,name,createdAt:Date.now(),createdBy:me.id});save();window.v75OpenPublicHolidays();
 };
 window.v75RemovePublicHoliday=function(date){
   if(!me||me.role!=='Manager')return;
   state.workshopHolidays=holidays().filter(h=>entryKey(h)!==String(date));save();window.v75OpenPublicHolidays();
 };
 window.v65OpenAdmin=function(){
   if(!me||me.role!=='Manager')return;
   openModal('<div class="section-title"><h2>Admin</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="v65-admin-grid"><button class="blue" onclick="v42SyncNow()">↻ SYNC NOW</button><button class="green" onclick="v63Backup()">☁ BACKUP NOW</button><button class="secondary" onclick="v63BackupHistory()">BACKUP HISTORY</button><button class="secondary" onclick="openUserManagement()">USER MANAGEMENT</button><button class="manager-action manager-amber" onclick="v75OpenPublicHolidays()">📅 PUBLIC HOLIDAYS</button></div><div class="notice"><b>Holiday rules</b><br>Friday is always a holiday. Manager-added public holidays are shared with all staff. Work on holidays is counted as overtime; ID001 is disabled.</div>');
 };

 window.v752HolidayRuntime=true;
})();


/* V75.3 ID001 REPORT + TIME BREAKDOWN
   - Work sessions start only after the employee presses START.
   - ID001 is excluded from every normal Finished Job Card view.
   - ID001 time is reported separately and counts as Actual Working Time,
     while Productive Actual remains normal Job Card work only.
   - Ideal Time is only uncovered duty-hour gaps between sessions. */
(function(){'use strict';
 const HOLD='ID001';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmtMin=m=>{try{return fmt(Math.max(0,+m||0))}catch(_){const n=Math.max(0,Math.round(+m||0));return Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m'}};
 const monthBounds=()=>{const d=new Date();return{from:new Date(d.getFullYear(),d.getMonth(),1).getTime(),to:new Date(d.getFullYear(),d.getMonth()+1,1).getTime()}};
 const dayStart=v=>{const d=new Date(v);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()};
 const sessionNormal=(s,from,to)=>{
   const st=Math.max(+s.start||0,from),en=Math.min(+(s.end||Date.now()),to);
   if(en<=st)return 0;
   try{return window.sessionNormalMinutes?Math.max(0,window.sessionNormalMinutes({start:st,end:en},en)||0):Math.max(0,(en-st)/60000)}catch(_){return Math.max(0,(en-st)/60000)}
 };
 const id001Minutes=(emp,from,to)=>(state.sessions||[]).filter(s=>s&&s.emp===emp&&s.job===HOLD&&s.start<to&&(s.end||Date.now())>from).reduce((n,s)=>n+sessionNormal(s,from,to),0);
 const productiveMinutes=(emp,from,to)=>(state.sessions||[]).filter(s=>s&&s.emp===emp&&s.job!==HOLD&&s.start<to&&(s.end||Date.now())>from).reduce((n,s)=>n+sessionNormal(s,from,to),0);
 const idealMinutes=(emp,from,to)=>{try{return typeof window.monthlyIdealTimeMinutes==='function'?Math.max(0,window.monthlyIdealTimeMinutes(emp,from,to)||0):0}catch(_){return 0}};
 const overtimeMinutes=(emp,from,to)=>{try{return typeof window.overtimeForEmployee==='function'?Math.max(0,window.overtimeForEmployee(emp,from,to)||0):0}catch(_){return 0}};
 window.v753ID001Minutes=id001Minutes;
 window.v753ProductiveMinutes=productiveMinutes;

 function cleanNormalFinishedLists(root=document){
   if(!root)return;
   root.querySelectorAll('table tr').forEach(tr=>{
     const cells=[...tr.querySelectorAll('td')].map(td=>(td.textContent||'').trim().toUpperCase());
     const hasID001=cells.some(v=>v===HOLD||v.startsWith(HOLD+' ')||v.includes(' '+HOLD+' '));
     if(hasID001){
       const section=tr.closest('.card,.manager-section,.v67-section,.v74-scroll,.report-table-wrap,.job-list-wrap')||tr.parentElement;
       const title=((section?.querySelector?.('h2,h3,h4')?.textContent||'')+' '+(section?.textContent||'')).toLowerCase();
       if(title.includes('finished')||title.includes('completed')||title.includes('production'))tr.remove();
     }
   });
 }
 window.v753CleanFinishedLists=cleanNormalFinishedLists;

 function addEmployeeTimeBreakdown(){
   if(!me||me.role!=='Employee')return;
   const root=document.getElementById('employeeView');if(!root)return;
   const {from,to}=monthBounds(),productive=productiveMinutes(me.id,from,to),id001=id001Minutes(me.id,from,to),actual=productive+id001,ideal=idealMinutes(me.id,from,to),ot=overtimeMinutes(me.id,from,to);
   const month=[...root.querySelectorAll('.month-summary')][0];if(!month)return;
   let grid=month.querySelector('.grid,.employee-month-grid');if(!grid)return;
   let box=document.getElementById('v753ActualBreakdown');
   const html='<div id="v753ActualBreakdown" class="notice v753-actual-breakdown"><b>Total Actual Working</b><div class="stat">'+fmtMin(actual)+'</div><span class="small">Productive + ID001</span></div>'+
     '<div id="v753ProductiveCard" class="notice"><b>Productive Actual</b><div class="stat">'+fmtMin(productive)+'</div><span class="small">Normal Job Card work</span></div>'+
     '<div id="v753ID001Card" class="notice"><b>ID001 Time</b><div class="stat">'+fmtMin(id001)+'</div><span class="small">Available / no work provided</span></div>';
   if(!box)grid.insertAdjacentHTML('beforeend',html);
   else{
     box.querySelector('.stat').textContent=fmtMin(actual);
     const p=document.querySelector('#v753ProductiveCard .stat');if(p)p.textContent=fmtMin(productive);
     const i=document.querySelector('#v753ID001Card .stat');if(i)i.textContent=fmtMin(id001);
   }
   root.querySelectorAll('.month-summary .notice').forEach(card=>{
     const label=(card.querySelector('b')?.textContent||'').trim();
     const stat=card.querySelector('.stat');
     if(!stat)return;
     if(label==='Total Ideal Time')stat.textContent=fmtMin(ideal);
     if(label==='Overtime')stat.textContent=fmtMin(ot);
   });
 }

 function filterBounds(){
   const f=document.getElementById('v753From')?.value||'',t=document.getElementById('v753To')?.value||'';
   const now=new Date(),defFrom=new Date(now.getFullYear(),now.getMonth(),1).getTime(),defTo=new Date(now.getFullYear(),now.getMonth()+1,1).getTime();
   const from=f?new Date(f+'T00:00:00').getTime():defFrom;
   const to=t?new Date(t+'T23:59:59.999').getTime()+1:defTo;
   return {from,to};
 }
 function id001Rows(from,to){
   return users.filter(u=>u&&u.role==='Employee').map(u=>{
     const sessions=(state.sessions||[]).filter(s=>s&&s.emp===u.id&&s.job===HOLD&&s.start<to&&(s.end||Date.now())>from);
     const minutes=sessions.reduce((n,s)=>n+sessionNormal(s,from,to),0);
     return {u,sessions,minutes};
   }).filter(x=>x.sessions.length||x.minutes>0).sort((a,b)=>b.minutes-a.minutes);
 }
 window.v753RenderID001Report=function(){
   const host=document.getElementById('v753ReportBody');if(!host)return;
   const {from,to}=filterBounds(),rows=id001Rows(from,to),total=rows.reduce((n,x)=>n+x.minutes,0);
   host.innerHTML='<div class="notice"><b>Total ID001 Hours</b><div class="stat">'+fmtMin(total)+'</div><span class="small">'+rows.length+' employee'+(rows.length===1?'':'s')+'</span></div>'+
     (rows.length?'<div class="v74-scroll"><table><tr><th>Employee</th><th>Department</th><th>Sessions</th><th>ID001 Hours</th><th></th></tr>'+
       rows.map(x=>'<tr><td><b>'+esc(x.u.name)+'</b><br><span class="small">'+esc(x.u.id)+'</span></td><td>'+esc(x.u.department||'—')+'</td><td>'+x.sessions.length+'</td><td><b>'+fmtMin(x.minutes)+'</b></td><td><button class="blue" onclick="v753OpenID001Employee(\''+esc(x.u.id)+'\')">DETAILS</button></td></tr>').join('')+'</table></div>':'<div class="notice">No ID001 time in the selected dates.</div>');
 };
 window.v753ReportFilter=window.v753ReportFilter||{from:'',to:''};
 window.v753SaveReportFilter=function(){
   const f=document.getElementById('v753From')?.value||window.v753ReportFilter.from||'';
   const t=document.getElementById('v753To')?.value||window.v753ReportFilter.to||'';
   window.v753ReportFilter={from:f,to:t};
 };
 window.v753OpenID001Employee=function(emp){
   window.v753SaveReportFilter();
   const {from,to}=filterBounds(),u=user(emp),rows=(state.sessions||[]).filter(s=>s&&s.emp===emp&&s.job===HOLD&&s.start<to&&(s.end||Date.now())>from).sort((a,b)=>b.start-a.start);
   const body=rows.length?'<div class="v74-scroll"><table><tr><th>Date</th><th>Start</th><th>Stop</th><th>ID001 Hours</th></tr>'+
     rows.map(s=>{const en=s.end||Date.now();return '<tr><td>'+esc(new Date(s.start).toLocaleDateString())+'</td><td>'+esc(new Date(s.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+'</td><td>'+esc(s.end?new Date(s.end).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Running')+'</td><td><b>'+fmtMin(sessionNormal(s,from,to))+'</b></td></tr>'}).join('')+'</table></div>':'<div class="notice">No ID001 sessions in the selected dates.</div>';
   openModal('<div class="section-title"><h2>ID001 — '+esc(u?.name||emp)+'</h2><button class="secondary" onclick="v753OpenID001Report(true)">Back</button></div>'+body);
 };
 window.v753OpenID001Report=function(preserve){
   if(!me||!['Supervisor','Manager'].includes(me.role))return;
   const d=new Date(),first=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01',today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
   const from=preserve&&window.v753ReportFilter.from?window.v753ReportFilter.from:first;
   const to=preserve&&window.v753ReportFilter.to?window.v753ReportFilter.to:today;
   window.v753ReportFilter={from,to};
   openModal('<div class="section-title"><h2>◷ ID001 Details</h2><div><button class="secondary" onclick="window.print()">Print</button> <button class="secondary" onclick="closeModal()">Close</button></div></div><div class="notice"><b>ID001 purpose</b><br>Time when an employee is available but no normal workshop work is provided. It counts toward Actual Working Time, but stays separate from productive Job Card work and never appears in Finished Job Cards.</div><div class="row"><label>From<br><input id="v753From" type="date" value="'+from+'" onchange="v753SaveReportFilter();v753RenderID001Report()"></label><label>To<br><input id="v753To" type="date" value="'+to+'" onchange="v753SaveReportFilter();v753RenderID001Report()"></label></div><div id="v753ReportBody" style="margin-top:12px"></div>');
   setTimeout(window.v753RenderID001Report,0);
 };

 function injectDashboardID001Button(){
   if(!me||!['Supervisor','Manager'].includes(me.role))return;
   const root=document.getElementById(me.role==='Manager'?'managerView':'supervisorView');if(!root||root.querySelector('#v753ID001Dashboard'))return;
   const b=document.createElement('section');
   b.id='v753ID001Dashboard';b.className='card v753-id001-dashboard';
   b.innerHTML='<button class="blue big-action" style="width:100%" onclick="v753OpenID001Report()">◷ ID001 DETAILS / HOURS</button><div class="small muted" style="margin-top:6px">Employee ID001 hours · From / To date filter · separate from Finished Job Cards</div>';
   // Keep ID001 as a compact lower action; never inject it near Quick Entry / Assign controls.
   const actionGrid=root.querySelector('.v84-action-grid');
   if(actionGrid){b.classList.add('v93-id001-action');actionGrid.appendChild(b)}else root.appendChild(b);
 }
 const oldRender=window.render;
 window.render=function(){
   const r=typeof oldRender==='function'?oldRender.apply(this,arguments):undefined;
   setTimeout(()=>{cleanNormalFinishedLists(document);addEmployeeTimeBreakdown();injectDashboardID001Button()},0);
   return r;
 };
 const oldRefresh=window.refreshActiveRunningTime;
 window.refreshActiveRunningTime=function(){
   const r=typeof oldRefresh==='function'?oldRefresh.apply(this,arguments):undefined;
   addEmployeeTimeBreakdown();return r;
 };
 if(window.v755EmployeeBreakdownTimer)clearInterval(window.v755EmployeeBreakdownTimer);window.v755EmployeeBreakdownTimer=setInterval(()=>{if(me?.role==='Employee')addEmployeeTimeBreakdown()},1000);

 // Reconcile stale ID001 sessions from ANY logged-in role/device.
 // If the employee app was closed at duty end, Supervisor/Manager opening or syncing
 // the app still closes the session at the exact 13:00/19:00 boundary.
 function reconcileID001Globally(){
   try{
     if(typeof window.v75StopID001AtDutyEnd==='function'){
       const changed=window.v75StopID001AtDutyEnd();
       if(changed)cleanNormalFinishedLists(document);
       return changed;
     }
   }catch(e){console.warn('ID001 duty-end reconcile failed',e)}
   return false;
 }
 window.v754ReconcileID001Globally=reconcileID001Globally;
 const priorCloudPull=window.v42AfterCloudPull;
 window.v42AfterCloudPull=function(before,after){
   let r;if(typeof priorCloudPull==='function')r=priorCloudPull.apply(this,arguments);
   setTimeout(()=>{if(reconcileID001Globally()){try{if(typeof window.cloudScheduleSave==='function')window.cloudScheduleSave()}catch(_){}}},0);
   return r;
 };
 if(window.v754ID001GlobalTimer)clearInterval(window.v754ID001GlobalTimer);
 window.v754ID001GlobalTimer=setInterval(reconcileID001Globally,15000);
 setTimeout(reconcileID001Globally,0);

 window.v753ManualStartOnly=true;
 window.v753ID001ReportReady=true;
 window.v754FinalRuntimeFixes=true;
})();


/* V75.5 LEAVE CONTROL + PAUSED-JOB ID001 AUTHORITY */
(function(){'use strict';
 const H='ID001';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dateKey=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
 const dayStartFromKey=k=>{const p=String(k||'').split('-').map(Number);return p.length===3?new Date(p[0],p[1]-1,p[2]).getTime():NaN};
 const periodLabel=p=>p==='AM'?'Morning Half Day — 8:00 AM to 1:00 PM':p==='PM'?'Afternoon Half Day — 3:00 PM to 7:00 PM':'Full Day — 8:00 AM to 1:00 PM + 3:00 PM to 7:00 PM';
 const leaveSegments=l=>{
   const d=dayStartFromKey(l?.date);if(!Number.isFinite(d))return[];
   if(l.period==='AM')return[[d+8*3600000,d+13*3600000]];
   if(l.period==='PM')return[[d+15*3600000,d+19*3600000]];
   return[[d+8*3600000,d+13*3600000],[d+15*3600000,d+19*3600000]];
 };
 const activeLeaveRows=()=>{state.leaves=state.leaves||[];return state.leaves.filter(l=>l&&!l.cancelled)};
 const leaveRowsFor=(emp,from,to)=>activeLeaveRows().filter(l=>l.emp===emp).filter(l=>leaveSegments(l).some(([a,b])=>b>from&&a<to));
 window.v63LeaveOverlapMinutes=function(emp,from,to){
   return leaveRowsFor(emp,from,to).reduce((sum,l)=>sum+leaveSegments(l).reduce((n,[a,b])=>n+Math.max(0,Math.min(to,b)-Math.max(from,a))/60000,0),0);
 };
 window.v63IsOnLeave=function(emp,ts=Date.now()){
   return activeLeaveRows().some(l=>l.emp===emp&&leaveSegments(l).some(([a,b])=>ts>=a&&ts<b));
 };

 function userSafe(id){try{return user(id)||{id,name:id,role:'',department:''}}catch(_){return{id,name:id,role:'',department:''}}}
 function canManageTarget(target){
   if(!me||!target)return false;
   if(String(target)===String(me.id))return true;
   const u=userSafe(target);
   if(me.role==='Manager')return u.role==='Employee'||u.role==='Supervisor';
   if(me.role==='Supervisor')return u.role==='Employee';
   return false;
 }
 function hasSessionConflict(emp,l){
   return (state.sessions||[]).some(s=>s&&s.emp===emp&&leaveSegments(l).some(([a,b])=>Math.min(s.end||Date.now(),b)>Math.max(s.start||0,a)));
 }
 function hasDuplicate(emp,l){
   return activeLeaveRows().some(x=>x.emp===emp&&x.date===l.date&&(x.period==='FULL'||l.period==='FULL'||x.period===l.period));
 }
 function closedLeaveDay(l){
   const seg=leaveSegments(l)[0];if(!seg)return false;
   const ts=seg[0];
   try{return typeof window.v75IsClosedWorkshopDay==='function'&&window.v75IsClosedWorkshopDay(ts)}catch(_){return new Date(ts).getDay()===5}
 }
 function notifyLeave(l){
   state.leaveNotifications=state.leaveNotifications||[];
   state.leaveNotifications.push({id:uid(),leaveId:l.id,emp:l.emp,period:l.period,date:l.date,by:l.by,at:Date.now(),cancelled:false});
   if(l.by===l.emp && userSafe(l.emp).role!=='Manager'){
     state.requests=state.requests||[];
     state.requests.push({id:uid(),type:'leave_notice',emp:l.emp,job:'',status:'New',message:(userSafe(l.emp).name||l.emp)+' marked '+periodLabel(l.period)+' leave for '+l.date+(l.remark?' — '+l.remark:''),createdAt:Date.now(),leaveId:l.id});
   }
 }

 window.v755OpenLeaveForm=function(target){
   target=target||me?.id;if(!target||!canManageTarget(target))return;
   const u=userSafe(target),today=dateKey(Date.now()),self=String(target)===String(me.id);
   const rows=activeLeaveRows().filter(l=>l.emp===target).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,12);
   openModal('<div class="section-title"><h2>Leave — '+esc(u.name)+'</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+
     '<div class="grid"><label>Date<br><input type="date" id="v755LeaveDate" min="'+today+'" value="'+today+'"></label><label>Leave Type<br><select id="v755LeavePeriod"><option value="FULL">Full Day</option><option value="AM">Morning Half Day — 8:00 AM to 1:00 PM</option><option value="PM">Afternoon Half Day — 3:00 PM to 7:00 PM</option></select></label></div>'+
     '<label>Remark / Reason (optional)<br><input id="v755LeaveRemark" style="width:100%" placeholder=""></label>'+
     '<p><button class="green big-action" onclick="v755SaveLeave(\''+esc(target)+'\')">'+(self?'MARK MY LEAVE':'MARK LEAVE')+'</button></p>'+
     '<h3>Recent Leave</h3>'+(rows.length?'<div style="overflow:auto"><table><tr><th>Date</th><th>Type</th><th>Marked By</th><th>Remark</th></tr>'+
       rows.map(l=>'<tr><td>'+esc(l.date)+'</td><td>'+esc(periodLabel(l.period))+'</td><td>'+esc(userSafe(l.by).name||l.by)+'</td><td>'+esc(l.remark||'—')+'</td></tr>').join('')+'</table></div>':'<div class="notice">No leave records.</div>'));
 };
 window.v755SaveLeave=function(emp){
   if(!canManageTarget(emp))return;
   const date=document.getElementById('v755LeaveDate')?.value,period=document.getElementById('v755LeavePeriod')?.value,remark=document.getElementById('v755LeaveRemark')?.value.trim()||'';
   if(!date||!['FULL','AM','PM'].includes(period))return alert('Select leave date and leave type.');
   const l={id:uid(),emp,date,period,remark,by:me.id,createdAt:Date.now(),cancelled:false};
   if(closedLeaveDay(l))return alert('Leave is not required on Friday or a workshop Public Holiday.');
   if(hasSessionConflict(emp,l))return alert('Work time is already recorded during this leave period. Correct the work/leave conflict before marking leave.');
   if(hasDuplicate(emp,l))return alert('Leave is already recorded for this date/period.');
   state.leaves=state.leaves||[];state.leaveAudit=state.leaveAudit||[];
   state.leaves.push(l);state.leaveAudit.push({id:uid(),action:'ADD',leaveId:l.id,by:me.id,at:Date.now()});notifyLeave(l);
   save();closeModal();render();
   setTimeout(()=>{try{typeof window.v74Msg==='function'?window.v74Msg('Leave marked successfully. Supervisor and Manager can see this leave.','Leave'):alert('Leave marked successfully.')}catch(_){}},0);
 };
 window.v63OpenLeave=function(emp){return window.v755OpenLeaveForm(emp||me?.id)};

 window.v755OpenLeaveHub=function(){
   if(!me)return;
   if(me.role==='Employee')return window.v755OpenLeaveForm(me.id);
   const allowed=users.filter(u=>u&&((me.role==='Manager'&&(u.role==='Employee'||u.role==='Supervisor'))||(me.role==='Supervisor'&&u.role==='Employee')));
   openModal('<div class="section-title"><h2>Leave</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+
     '<button class="green big-action" style="width:100%;margin-bottom:12px" onclick="v755OpenLeaveForm(\''+esc(me.id)+'\')">MY LEAVE</button>'+
     '<h3>Mark Staff Leave</h3><div class="grid">'+allowed.map(u=>'<button class="secondary" onclick="v755OpenLeaveForm(\''+esc(u.id)+'\')"><b>'+esc(u.name)+'</b><br><span class="small">'+esc(u.role+(u.department?' · '+u.department:''))+'</span></button>').join('')+'</div>');
 };

 if(!document.getElementById('v88-role-account-style')){let css=document.createElement('style');css.id='v88-role-account-style';css.textContent='.v88-role-account{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.v88-role-account button{min-height:48px;border-radius:13px!important;color:#172033!important;font-weight:900!important;border:1px solid rgba(255,255,255,.8)!important;box-shadow:inset 0 1px 2px #fff,0 5px 12px #0f172214!important}.v88-role-account .v88-sync{background:#e5f3ff!important}.v88-role-account .v88-about{background:#efe9ff!important}.v88-role-account .v88-leave{background:#e9f9ef!important}.v88-role-account .v88-logout{background:#ffe8e8!important;color:#991b1b!important}';document.head.appendChild(css)}
 window.v65OpenAccount=function(){
   if(!me)return;
   openModal('<div class="section-title"><h2>'+esc(me.name)+'</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+
     '<div class="v63-account v88-role-account"><button class="v88-sync" onclick="cloudSyncNow&&cloudSyncNow()">↻ SYNC</button><button class="v88-about" onclick="v63OpenAbout()">ℹ ABOUT</button><button class="v88-leave" onclick="v755OpenLeaveHub()">🗓 LEAVE</button><button class="v88-logout" onclick="logout()">↪ LOGOUT</button></div>');
 };

 function leaveToday(){const k=dateKey(Date.now());return activeLeaveRows().filter(l=>l.date===k)}
 function leaveMonth(){const d=new Date(),prefix=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-';return activeLeaveRows().filter(l=>String(l.date||'').startsWith(prefix))}
 function uniquePeople(rows){return new Set(rows.map(l=>String(l.emp))).size}
 function leaveListHtml(rows){
   const sorted=rows.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||(b.createdAt||0)-(a.createdAt||0));
   return sorted.length?'<div style="overflow:auto"><table><tr><th>Name</th><th>Role / Department</th><th>Date</th><th>Leave Type</th><th>Remark</th><th>Marked By</th></tr>'+
     sorted.map(l=>{const u=userSafe(l.emp),by=userSafe(l.by);return'<tr><td><b>'+esc(u.name)+'</b></td><td>'+esc(u.role+(u.department?' / '+u.department:''))+'</td><td>'+esc(l.date)+'</td><td>'+esc(periodLabel(l.period))+'</td><td>'+esc(l.remark||'—')+'</td><td>'+esc(by.name||l.by)+'</td></tr>'}).join('')+'</table></div>':'<div class="notice">No leave records.</div>';
 }
 window.v755OpenLeaveList=function(mode){
   const rows=mode==='month'?leaveMonth():leaveToday();
   openModal('<div class="section-title"><h2>'+(mode==='month'?'This Month Leave':'Today’s Leave')+'</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+leaveListHtml(rows));
 };
 window.v114EditLeave=function(id){
   if(!me||me.role!=='Manager')return;
   const l=(state.leaves||[]).find(x=>x&&String(x.id)===String(id)&&!x.cancelled);if(!l)return;
   const staff=(users||[]).filter(u=>u&&(u.role==='Employee'||u.role==='Supervisor'));
   openModal('<div class="section-title"><h2>Edit Leave</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+
    '<label>Staff<br><select id="v114LeaveEmp">'+staff.map(u=>'<option value="'+esc(u.id)+'" '+(String(u.id)===String(l.emp)?'selected':'')+'>'+esc(u.name)+'</option>').join('')+'</select></label>'+
    '<div class="grid"><label>Date<br><input type="date" id="v114LeaveDate" value="'+esc(l.date)+'"></label><label>Leave Type<br><select id="v114LeavePeriod"><option value="FULL" '+(l.period==='FULL'?'selected':'')+'>Full Day</option><option value="AM" '+(l.period==='AM'?'selected':'')+'>Morning Half Day</option><option value="PM" '+(l.period==='PM'?'selected':'')+'>Afternoon Half Day</option></select></label></div>'+
    '<label>Remark / Reason<br><input id="v114LeaveRemark" style="width:100%" value="'+esc(l.remark||'')+'"></label>'+
    '<div class="v74-actions"><button class="danger" onclick="v114DeleteLeave(\''+esc(l.id)+'\')">DELETE</button><button class="green" onclick="v114SaveLeaveEdit(\''+esc(l.id)+'\')">SAVE CHANGES</button></div>');
 };
 window.v114SaveLeaveEdit=function(id){
   if(!me||me.role!=='Manager')return;
   const l=(state.leaves||[]).find(x=>x&&String(x.id)===String(id)&&!x.cancelled);if(!l)return;
   const emp=document.getElementById('v114LeaveEmp')?.value,date=document.getElementById('v114LeaveDate')?.value,period=document.getElementById('v114LeavePeriod')?.value,remark=document.getElementById('v114LeaveRemark')?.value.trim()||'';
   if(!emp||!date||!['FULL','AM','PM'].includes(period))return alert('Select staff, date and leave type.');
   const candidate={...l,emp,date,period,remark};
   if(closedLeaveDay(candidate))return alert('Leave is not required on Friday or a workshop Public Holiday.');
   if(hasSessionConflict(emp,candidate))return alert('Work time is already recorded during this leave period. Correct the work/leave conflict first.');
   const duplicate=activeLeaveRows().some(x=>String(x.id)!==String(id)&&String(x.emp)===String(emp)&&x.date===date&&(x.period==='FULL'||period==='FULL'||x.period===period));
   if(duplicate)return alert('Leave is already recorded for this staff/date/period.');
   const before={emp:l.emp,date:l.date,period:l.period,remark:l.remark||''};Object.assign(l,{emp,date,period,remark,updatedAt:Date.now(),updatedBy:me.id});
   state.leaveAudit=state.leaveAudit||[];state.leaveAudit.push({id:uid(),action:'EDIT',leaveId:l.id,by:me.id,at:Date.now(),before,after:{emp,date,period,remark}});
   save();closeModal();render();
 };
 window.v114DeleteLeave=function(id){
   if(!me||me.role!=='Manager')return;
   const l=(state.leaves||[]).find(x=>x&&String(x.id)===String(id)&&!x.cancelled);if(!l)return;
   const reason=prompt('Reason for deleting/cancelling this leave record:','Correction');if(reason===null)return;if(!String(reason).trim())return alert('Enter a reason.');
   l.cancelled=true;l.cancelledAt=Date.now();l.cancelledBy=me.id;l.cancelReason=String(reason).trim();
   state.leaveAudit=state.leaveAudit||[];state.leaveAudit.push({id:uid(),action:'DELETE',leaveId:l.id,by:me.id,at:Date.now(),reason:l.cancelReason,before:{emp:l.emp,date:l.date,period:l.period,remark:l.remark||''}});
   save();closeModal();render();
 };
 const v114BaseLeaveListHtml=leaveListHtml;
 leaveListHtml=function(rows){
   if(!me||me.role!=='Manager')return v114BaseLeaveListHtml(rows);
   const sorted=rows.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||(b.createdAt||0)-(a.createdAt||0));
   return sorted.length?'<div style="overflow:auto"><table><tr><th>Name</th><th>Role / Department</th><th>Date</th><th>Leave Type</th><th>Remark</th><th>Marked By</th><th>Action</th></tr>'+
    sorted.map(l=>{const u=userSafe(l.emp),by=userSafe(l.by);return'<tr><td><b>'+esc(u.name)+'</b></td><td>'+esc(u.role+(u.department?' / '+u.department:''))+'</td><td>'+esc(l.date)+'</td><td>'+esc(periodLabel(l.period))+'</td><td>'+esc(l.remark||'—')+'</td><td>'+esc(by.name||l.by)+'</td><td><button class="blue" onclick="v114EditLeave(\''+esc(l.id)+'\')">EDIT</button></td></tr>'}).join('')+'</table></div>':'<div class="notice">No leave records.</div>';
 };
 window.v114ManagerLeaveCorrection=true;

 function injectManagerLeaveRow(){
   if(!me||me.role!=='Manager')return;
   const root=document.getElementById('managerView');if(!root)return;
   const section=[...root.querySelectorAll('.v67-section,.v65-section')].find(x=>/Workshop Control Center/i.test(x.querySelector('h3')?.textContent||''));
   if(!section)return;
   section.querySelectorAll('button').forEach(b=>{if(/^On Leave\b/i.test((b.textContent||'').trim()))b.style.display='none'});
   let row=section.querySelector('#v755LeaveControlRow');
   if(!row){row=document.createElement('div');row.id='v755LeaveControlRow';row.className='v755-leave-control-row';section.appendChild(row);}
   const today=leaveToday(),month=leaveMonth();
   row.innerHTML='<button class="v755-leave-card today" onclick="v133OpenManagerLeave()"><span>ON LEAVE</span><b>'+uniquePeople(today)+'</b><small>Today · tap for today + this month details</small></button>';
 }

 // Leave must never become Ideal Time. Full-day leave is 5h + 4h; lunch is excluded.
 const leaveAwareIdeal=(emp,from,to)=>{
   const rows=(state.sessions||[]).filter(x=>x&&x.emp===emp&&x.start<to&&(x.end||Date.now())>from)
     .map(x=>({job:x.job,start:Math.max(+x.start||0,from),end:Math.min(+(x.end||Date.now()),to)}))
     .filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start);
   let sum=0,last=null;
   for(const x of rows){
     if(last&&x.start>last.end){
       const avail=typeof window.v75NormalAssignmentAvailableMinutes==='function'?window.v75NormalAssignmentAvailableMinutes(emp,last.end,x.start,last.job):0;
       const leave=window.v63LeaveOverlapMinutes(emp,last.end,x.start);
       sum+=Math.max(0,avail-leave);
     }
     if(!last||x.end>last.end)last={job:x.job,start:x.start,end:x.end};
   }
   return Math.max(0,sum);
 };
 window.monthlyIdealTimeMinutes=leaveAwareIdeal;

 // ID001 may be assigned when all open normal work is PAUSED. Any active or ready/new normal work still blocks it.
 const openHold=emp=>(state.assign||[]).find(a=>a&&a.job===H&&a.emp===emp&&!a.cancelled&&!a.completed)||null;
 const openNormal=emp=>(state.assign||[]).filter(a=>a&&a.job!==H&&a.emp===emp&&!a.cancelled&&!a.completed);
 const normalStatus=a=>{try{return empStatus(a)}catch(_){return a?.completed?'Finished':'New'}};
 const pausedOnlyNormal=emp=>{const rows=openNormal(emp);return rows.length>0&&rows.every(a=>normalStatus(a)==='Paused')};
 const idealAvailable=emp=>!activeSession(emp)&&!openHold(emp)&&(openNormal(emp).length===0||pausedOnlyNormal(emp));
 window.v755PausedOnlyNormal=pausedOnlyNormal;
 window.v75IdealAvailableEmployees=()=>users.filter(u=>u&&u.role==='Employee'&&idealAvailable(u.id));

 const oldAssignCore=window.assignJobCore;
 window.assignJobCore=function(no,emp,minutes){
   if(no!==H)return typeof oldAssignCore==='function'?oldAssignCore.apply(this,arguments):undefined;
   const m=Number(minutes),t=Date.now(),n=userSafe(emp).name||emp;
   if(!Number.isFinite(m)||m<1)return typeof window.v74Msg==='function'?window.v74Msg('Enter a valid allocated time for ID001.','Ideal Time'):alert('Enter a valid allocated time for ID001.');
   if(typeof window.v75IsClosedWorkshopDay==='function'&&window.v75IsClosedWorkshopDay(t))return typeof window.v74Msg==='function'?window.v74Msg('ID001 cannot be assigned on Friday or a Public Holiday.','Ideal Time'):alert('ID001 cannot be assigned today.');
   if(typeof window.v75IsID001DutyTime==='function'&&!window.v75IsID001DutyTime(t))return typeof window.v74Msg==='function'?window.v74Msg('ID001 can be assigned only during duty hours: 08:00–13:00 and 15:00–19:00.','Ideal Time'):alert('Outside duty hours.');
   if(window.v63IsOnLeave(emp,t))return typeof window.v74Msg==='function'?window.v74Msg(n+' is on leave. ID001 cannot be assigned.','Ideal Time'):alert(n+' is on leave.');
   if(openHold(emp))return typeof window.v74Msg==='function'?window.v74Msg('ID001 is already assigned to '+n+'.','Ideal Time'):alert('ID001 is already assigned.');
   if(activeSession(emp))return typeof window.v74Msg==='function'?window.v74Msg(n+' has an active running job. ID001 cannot be assigned.','Ideal Time'):alert(n+' has an active job.');
   const blocking=openNormal(emp).filter(a=>normalStatus(a)!=='Paused');
   if(blocking.length)return typeof window.v74Msg==='function'?window.v74Msg(n+' has normal work available. ID001 is allowed only when normal work is paused and no other job is available.','Ideal Time'):alert(n+' has normal work available.');
   state.assign=state.assign||[];
   const a={id:uid(),job:H,emp,suggested:m,completed:false,cancelled:false,rework:false,idealCard:true,idealSafeVersion:2,assignedBy:me?.id||'SYSTEM',assignedAt:Date.now(),pausedJobFallback:pausedOnlyNormal(emp)};
   state.assign.push(a);if(typeof setLastAction==='function')setLastAction('Assigned ID001 to '+n+' for '+fmt(m));save();render();return a;
 };
 window.v75AssignIdealToAvailable=function(minutes,employeeIds){
   const m=Number(minutes),t=Date.now();if(!Number.isFinite(m)||m<1)return{ok:false,reason:'invalid_time',assigned:[]};
   if(typeof window.v75IsClosedWorkshopDay==='function'&&window.v75IsClosedWorkshopDay(t))return{ok:false,reason:'holiday',assigned:[]};
   if(typeof window.v75IsID001DutyTime==='function'&&!window.v75IsID001DutyTime(t))return{ok:false,reason:'outside_duty',assigned:[]};
   const wanted=Array.isArray(employeeIds)&&employeeIds.length?new Set(employeeIds.map(String)):null;
   const list=users.filter(u=>u&&u.role==='Employee'&&(!wanted||wanted.has(String(u.id)))&&!window.v63IsOnLeave(u.id,t)&&idealAvailable(u.id));
   if(!list.length)return{ok:false,reason:'none_available',assigned:[]};
   const created=[];
   for(const u of list){const a={id:uid(),job:H,emp:u.id,suggested:m,completed:false,cancelled:false,rework:false,idealCard:true,idealSafeVersion:2,assignedBy:me?.id||'SYSTEM',assignedAt:t,pausedJobFallback:pausedOnlyNormal(u.id)};state.assign.push(a);created.push(a);}
   if(typeof setLastAction==='function')setLastAction('Assigned ID001 to '+created.length+' available staff');save();render();return{ok:true,assigned:created.map(a=>a.emp)};
 };

 const priorRender=window.render;
 window.render=function(){
   const r=typeof priorRender==='function'?priorRender.apply(this,arguments):undefined;
   setTimeout(injectManagerLeaveRow,0);return r;
 };
 const priorRefresh=window.refreshActiveRunningTime;
 window.refreshActiveRunningTime=function(){
   const r=typeof priorRefresh==='function'?priorRefresh.apply(this,arguments):undefined;
   if(me?.role==='Employee'){
     const root=document.getElementById('employeeView'),n=new Date(),from=new Date(n.getFullYear(),n.getMonth(),1).getTime(),to=new Date(n.getFullYear(),n.getMonth()+1,1).getTime();
     root?.querySelectorAll('.month-summary .notice').forEach(box=>{if((box.querySelector('b')?.textContent||'').trim()==='Total Ideal Time'){const stat=box.querySelector('.stat');if(stat)stat.textContent=fmt(leaveAwareIdeal(me.id,from,to));}});
   }
   return r;
 };

 const css=document.createElement('style');css.id='v755LeaveStyle';css.textContent=
   '.v755-leave-control-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.v755-leave-card{min-height:95px;border-radius:14px;border:1px solid;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;text-align:left;padding:13px;box-shadow:0 5px 12px rgba(34,55,80,.08)}.v755-leave-card span{font-size:11px;font-weight:900}.v755-leave-card b{font-size:27px;margin:4px 0}.v755-leave-card small{font-size:10px}.v755-leave-card.today{background:#fff1f3;color:#984758;border-color:#f0d4d9}.v755-leave-card.month{background:#f5f0ff;color:#6d4a9d;border-color:#ded1f2}@media(max-width:620px){.v755-leave-control-row{grid-template-columns:1fr 1fr}}';
 document.head.appendChild(css);
 setTimeout(injectManagerLeaveRow,0);
 window.v755LeaveAndPausedID001Ready=true;
})();


/* V75.6 SUPERVISOR ACTIVE WORKERS — UNIQUE EMPLOYEES + ID001 COLOUR */
(function(){'use strict';
 const H='ID001';
 const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const P=id=>{try{return user(id)||{id,name:id,department:''}}catch(_){return{id,name:id,department:''}}};
 const J=no=>{try{return job(no)||{no,vehicle:'',reg:''}}catch(_){return{no,vehicle:'',reg:''}}};
 const F=m=>{try{return fmt(Math.max(0,Number(m)||0))}catch(_){return Math.round(Number(m)||0)+'m'}};
 const ass=s=>(state.assign||[]).find(a=>a&&a.id===s?.assignmentId)||
   (state.assign||[]).filter(a=>a&&a.emp===s?.emp&&a.job===s?.job&&!a.cancelled&&!a.completed).sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0))[0]||null;
 const actual=a=>{try{return totalForAssignment(a)||0}catch(_){try{return total(a.job,a.emp)||0}catch(__){return 0}}};
 const status=a=>{try{return empStatus(a)}catch(_){return a?.completed?'Finished':'Started'}};

 function uniqueActiveWorkerRows(){
   const byEmp=new Map();
   (state.sessions||[]).filter(s=>s&&!s.end).forEach(s=>{
     const key=String(s.emp||'');if(!key)return;
     const old=byEmp.get(key);
     // One employee must appear once. When stale overlapping sessions exist,
     // show the latest-started session as the current activity.
     if(!old||(+s.start||0)>(+old.start||0))byEmp.set(key,s);
   });
   return [...byEmp.values()].map(s=>({s,a:ass(s),u:P(s.emp),j:J(s.job)}));
 }
 window.v756UniqueActiveWorkerRows=uniqueActiveWorkerRows;

 window.openActiveWorkers=function(){
   const rows=uniqueActiveWorkerRows();
   const deptName={Denter:'Denting',Painter:'Painting',Mechanic:'Mechanical'};
   const depts=['Denter','Painter','Mechanic'];
   const groups=depts.map(dept=>{
     const list=rows.filter(x=>x.u.department===dept);
     return '<section class="v69-dept v69-'+dept.toLowerCase()+'"><div class="v69-dept-head"><b>'+deptName[dept]+'</b><span>'+list.length+'</span></div>'+
       (list.length?list.map(x=>{
         const hold=x.s.job===H,allocated=x.a?(+x.a.suggested||0):0,ac=x.a?actual(x.a):Math.max(0,(Date.now()-(+x.s.start||Date.now()))/60000);
         return '<details class="v69-worker '+(hold?'v756-id001-worker':'v756-normal-worker')+'"><summary>'+
           E(x.u.name)+' <small class="'+(hold?'v756-id001-badge':'')+'">'+(hold?'ID001 · WAITING':E(x.s.job))+'</small></summary><div>'+
           (hold
             ?'<div class="v756-id001-title">ID001 — AVAILABLE / WAITING</div><b>Allocated ID001:</b> '+F(allocated)+'<br><b>Current ID001 Time:</b> '+F(ac)+'<br><b>Status:</b> <span class="v756-id001-status">ACTIVE ID001</span>'
             :'<b>Job Card:</b> '+E(x.s.job)+'<br><b>Vehicle:</b> '+E(x.j.vehicle||'—')+' · '+E(x.j.reg||'—')+'<br><b>Allocated:</b> '+F(allocated)+'<br><b>Actual:</b> '+F(ac)+'<br><b>Status:</b> '+E(x.a?status(x.a):'Started')+'<br><button class="blue" onclick="openSupervisorJob(\''+E(x.s.job)+'\')">VIEW JOB</button>')+
           '</div></details>';
       }).join(''):'<div class="v69-empty">No active workers</div>')+'</section>';
   }).join('');
   showSupervisorModal('👷 Active Workers','<div class="v756-active-legend"><span class="v756-normal-dot"></span>Normal Job Card <span class="v756-id001-dot"></span>ID001 / Waiting</div><div class="v69-dept-grid">'+groups+'</div>');
 };

 // Today at a Glance: Active Workers means unique people with any current session,
 // including ID001. Never count the same employee twice.
 const prevOverview=window.supervisorOverview;
 window.supervisorOverview=function(rows){
   const html=typeof prevOverview==='function'?prevOverview.apply(this,arguments):'';
   if(!me||me.role!=='Supervisor'||!html)return html;
   const active=uniqueActiveWorkerRows().length;
   // Preserve the complete existing Supervisor overview (including Efficiency,
   // Technician Board, Ready for Delivery, etc.) and change only Active Workers count.
   return html.replace(/(<b>Active Workers<\/b><div class="stat">)\d+(<\/div>)/,'$1'+active+'$2');
 };

 const css=document.createElement('style');css.id='v756ActiveWorkersStyle';css.textContent=
   '.v756-active-legend{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:0 0 12px;font-size:12px;font-weight:800;color:#475569}.v756-normal-dot,.v756-id001-dot{width:11px;height:11px;border-radius:50%;display:inline-block;margin-right:5px}.v756-normal-dot{background:#2563eb}.v756-id001-dot{background:#7c3aed}.v756-id001-worker{background:#f5f0ff!important;border-color:#d8c8f3!important;box-shadow:0 5px 12px rgba(109,40,217,.12)!important}.v756-id001-worker summary{color:#6d28d9!important}.v756-id001-badge{display:inline-block;background:#ede9fe;color:#6d28d9;border:1px solid #c4b5fd;border-radius:999px;padding:2px 7px;font-weight:900!important}.v756-id001-title{font-weight:900;color:#6d28d9;margin-bottom:7px}.v756-id001-status{display:inline-block;background:#ede9fe;color:#6d28d9;border:1px solid #c4b5fd;border-radius:999px;padding:2px 7px;font-weight:900}';
 document.head.appendChild(css);
 window.v756ActiveWorkersReady=true;
})();


/* V77 IN-APP UPDATE CENTER — SINGLE DOWNLOAD + PROGRESS + INSTALL */
(function(){'use strict';
 const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.v77UpdateInfo=window.v77UpdateInfo||{current:'',latest:'',latestCode:0};

 function currentVersion(){try{return window.AndroidBridge?AndroidBridge.getAppVersion():'Web'}catch(_){return'Web'}}
 function currentCode(){try{return window.AndroidBridge?Number(AndroidBridge.getAppVersionCode()||0):0}catch(_){return 0}}
 function updateShell(){
   const cur=currentVersion();window.v77UpdateInfo.current=cur;
   return '<div class="v77-update-card">'+
     '<div class="v77-version-row"><div><span>Current Version</span><b id="v77CurrentVersion">'+E(cur)+'</b></div><div><span>New Version</span><b id="v77NewVersion">—</b></div></div>'+
     '<div id="v77UpdateState" class="v77-update-state muted">Check for updates to see the latest version.</div>'+
     '<div id="v77ProgressWrap" class="v77-progress-wrap" style="display:none"><div class="v77-progress-track"><div id="v77ProgressBar" class="v77-progress-bar" style="width:0%"></div></div><div class="v77-progress-meta"><b id="v77ProgressPct">0%</b><span id="v77ProgressText">Preparing download...</span></div></div>'+
     '<div class="v77-update-actions"><button id="v77CheckBtn" class="blue big-action" onclick="v77CheckUpdate()">CHECK FOR UPDATES</button><button id="v77DownloadBtn" class="green big-action" style="display:none" onclick="v77StartDownload()">DOWNLOAD UPDATE</button><button id="v77InstallBtn" class="green big-action" style="display:none" onclick="v77InstallUpdate()">INSTALL UPDATE</button></div>'+
     '</div>';
 }
 window.v63OpenAbout=function(){
   const version=currentVersion();
   openModal('<div class="section-title"><h2>About</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+
     '<div class="notice"><b>Zukait Time Track</b><br>Installed version: '+E(version)+'</div>'+
     (window.AndroidBridge?updateShell():'<div class="muted">Web version updates automatically.</div>'));
   setTimeout(()=>{try{AndroidBridge.requestUpdateDownloadStatus()}catch(_){}},120);
 };
 window.v77CheckUpdate=function(){
   const st=document.getElementById('v77UpdateState'),b=document.getElementById('v77CheckBtn');
   if(st)st.textContent='Checking for updates…';if(b)b.disabled=true;
   try{AndroidBridge.checkForUpdates()}catch(_){if(st)st.textContent='Unable to check for updates.';if(b)b.disabled=false}
 };
 window.v63CheckUpdate=window.v77CheckUpdate;

 window.v72UpdateCheckResult=function(latestCode,latestName,error){
   const st=document.getElementById('v77UpdateState'),check=document.getElementById('v77CheckBtn'),down=document.getElementById('v77DownloadBtn'),inst=document.getElementById('v77InstallBtn'),nv=document.getElementById('v77NewVersion');
   if(check)check.disabled=false;
   if(error){if(st)st.textContent='Update check failed. Please check internet connection.';return}
   const current=currentCode();window.v77UpdateInfo={current:currentVersion(),latest:String(latestName||''),latestCode:Number(latestCode||0)};
   if(nv)nv.textContent=latestName||'—';
   if(Number(latestCode)<=current){
     if(st)st.innerHTML='<b class="ok">App is up to date.</b>';
     if(down)down.style.display='none';if(inst)inst.style.display='none';
     return;
   }
   if(st)st.innerHTML='<b>Update available: '+E(currentVersion())+' → '+E(latestName||'New version')+'</b>';
   if(down){down.style.display='inline-block';down.disabled=false;down.textContent='DOWNLOAD UPDATE'}
   if(inst)inst.style.display='none';
   try{AndroidBridge.requestUpdateDownloadStatus()}catch(_){}
 };

 window.v77StartDownload=function(){
   const down=document.getElementById('v77DownloadBtn'),st=document.getElementById('v77UpdateState');
   if(down){down.disabled=true;down.textContent='STARTING…'}if(st)st.textContent='Preparing download…';
   try{AndroidBridge.startUpdateDownload()}catch(_){if(st)st.textContent='Unable to start download.';if(down){down.disabled=false;down.textContent='DOWNLOAD UPDATE'}}
 };
 window.v77InstallUpdate=function(){
   const st=document.getElementById('v77UpdateState'),inst=document.getElementById('v77InstallBtn');
   if(inst){inst.disabled=true;inst.textContent='OPENING ANDROID INSTALLER…'}
   if(st)st.innerHTML='<b>Starting native Android installer…</b>';
   try{
     if(!window.AndroidBridge||typeof AndroidBridge.installDownloadedUpdate!=='function') throw new Error('Native updater bridge unavailable');
     AndroidBridge.installDownloadedUpdate();
   }catch(error){
     if(st)st.textContent='Native updater bridge failed: '+String(error&&error.message||error||'unknown error');
     if(inst){inst.disabled=false;inst.textContent='RETRY INSTALL'}
   }
 };
 window.v77UpdateDownloadStatus=function(status,percent,downloaded,total,message){
   const wrap=document.getElementById('v77ProgressWrap'),bar=document.getElementById('v77ProgressBar'),pct=document.getElementById('v77ProgressPct'),txt=document.getElementById('v77ProgressText'),st=document.getElementById('v77UpdateState'),down=document.getElementById('v77DownloadBtn'),inst=document.getElementById('v77InstallBtn');
   const p=Math.max(0,Math.min(100,Number(percent)||0));
   if(['PENDING','DOWNLOADING','PAUSED','COMPLETE'].includes(status)){
     if(wrap)wrap.style.display='block';if(bar)bar.style.width=p+'%';if(pct)pct.textContent=p+'%';if(txt)txt.textContent=message||'Downloading update…';
   }
   if(status==='PENDING'||status==='DOWNLOADING'||status==='PAUSED'){
     if(st)st.textContent=message||'Downloading update…';
     if(down){down.style.display='inline-block';down.disabled=true;down.textContent=status==='PAUSED'?'DOWNLOAD PAUSED':'DOWNLOADING…'}
     if(inst)inst.style.display='none';
   }else if(status==='COMPLETE'){
     if(st)st.innerHTML='<b class="ok">Download complete. Ready to install.</b>';
     if(down)down.style.display='none';if(inst)inst.style.display='inline-block';
     if(bar)bar.style.width='100%';if(pct)pct.textContent='100%';
   }else if(status==='INSTALL_DIAGNOSTIC'){
     if(st)st.innerHTML='<b style="color:#b91c1c">INSTALLER DIAGNOSTIC</b><div style="margin-top:8px;word-break:break-word">'+E(message||'Unknown installer error')+'</div>';
     if(inst){inst.style.display='inline-block';inst.disabled=false;inst.textContent='RETRY INSTALL'}
     if(down)down.style.display='none';
   }else if(status==='FAILED'){
     if(st)st.textContent=message||'Download failed. Please try again.';
     if(down){down.style.display='inline-block';down.disabled=false;down.textContent='RETRY DOWNLOAD'}
     if(inst)inst.style.display='none';
   }else if(status==='UP_TO_DATE'){
     if(st)st.innerHTML='<b class="ok">App is already up to date.</b>';
     if(down)down.style.display='none';if(inst)inst.style.display='none';if(wrap)wrap.style.display='none';
   }else if(status==='IDLE'){
     if(inst)inst.style.display='none';
   }
 };
 const css=document.createElement('style');css.id='v77UpdateCenterStyle';css.textContent=
   '.v77-update-card{margin-top:12px;padding:14px;border:1px solid #dce4ee;border-radius:14px;background:#fff}.v77-version-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.v77-version-row>div{padding:12px;border:1px solid #e2e8f0;border-radius:11px;background:#f8fafc}.v77-version-row span{display:block;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase}.v77-version-row b{display:block;font-size:18px;color:#1e3a5f;margin-top:4px}.v77-update-state{margin:12px 0}.v77-progress-wrap{margin:12px 0}.v77-progress-track{height:12px;background:#e5e7eb;border-radius:999px;overflow:hidden}.v77-progress-bar{height:100%;background:#2563eb;border-radius:999px;transition:width .25s ease}.v77-progress-meta{display:flex;justify-content:space-between;gap:10px;margin-top:6px;font-size:11px;color:#475569}.v77-update-actions{display:grid;gap:8px}.v77-update-actions button{width:100%}@media(max-width:520px){.v77-version-row{grid-template-columns:1fr 1fr}}';
 document.head.appendChild(css);
 window.v77InAppUpdaterReady=true;
})();


/* V78 SUPERVISOR LEAVE STATUS + MANAGER PRINTABLE LEAVE REPORT */
(function(){'use strict';
 const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const localKey=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
 const person=id=>{try{return user(id)||{id,name:id,role:'',department:''}}catch(_){return{id,name:id,role:'',department:''}}};
 const activeLeaves=()=>{state.leaves=state.leaves||[];return state.leaves.filter(l=>l&&!l.cancelled)};
 const todayRows=()=>{const k=localKey(Date.now());return activeLeaves().filter(l=>l.date===k)};
 const monthRows=()=>{const d=new Date(),p=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-';return activeLeaves().filter(l=>String(l.date||'').startsWith(p))};
 const label=p=>p==='AM'?'Morning Half Day — 8:00 AM to 1:00 PM':p==='PM'?'Afternoon Half Day — 3:00 PM to 7:00 PM':'Full Day — 8:00 AM to 1:00 PM + 3:00 PM to 7:00 PM';
 const unique=rows=>new Set(rows.map(l=>String(l.emp))).size;
 const sorted=rows=>rows.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(+b.createdAt||0)-(+a.createdAt||0));

 function leaveTable(rows){
   const list=sorted(rows);
   return list.length?'<div class="v78-leave-table"><table><tr><th>Name</th><th>Role / Department</th><th>Date</th><th>Leave Type</th><th>Remark</th><th>Marked By</th></tr>'+
     list.map(l=>{const u=person(l.emp),by=person(l.by);return'<tr><td><b>'+E(u.name||l.emp)+'</b></td><td>'+E((u.role||'')+(u.department?' / '+u.department:''))+'</td><td>'+E(l.date||'—')+'</td><td>'+E(label(l.period))+'</td><td>'+E(l.remark||'—')+'</td><td>'+E(by.name||l.by||'—')+'</td></tr>'}).join('')+
     '</table></div>':'<div class="notice">No leave records.</div>';
 }

 function leavePrintHtml(mode,rows){
   const title=mode==='month'?'This Month Leave Report':'Today’s Leave Report';
   const period=mode==='month'?new Date().toLocaleDateString(undefined,{month:'long',year:'numeric'}):new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
   const list=sorted(rows);
   const table=list.length?'<table><thead><tr><th>#</th><th>Name</th><th>Role / Department</th><th>Date</th><th>Leave Type</th><th>Remark</th><th>Marked By</th></tr></thead><tbody>'+
     list.map((l,i)=>{const u=person(l.emp),by=person(l.by);return'<tr><td>'+(i+1)+'</td><td>'+E(u.name||l.emp)+'</td><td>'+E((u.role||'')+(u.department?' / '+u.department:''))+'</td><td>'+E(l.date||'—')+'</td><td>'+E(label(l.period))+'</td><td>'+E(l.remark||'—')+'</td><td>'+E(by.name||l.by||'—')+'</td></tr>'}).join('')+
     '</tbody></table>':'<p>No leave records.</p>';
   return '<!doctype html><html><head><meta charset="utf-8"><title>'+E(title)+'</title><style>'+
     '@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#111;font-size:11px}h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;margin:0 0 14px;color:#444}.summary{margin:8px 0 12px;font-weight:700}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:6px;vertical-align:top}th{background:#eee;text-align:left}footer{margin-top:18px;font-size:9px;color:#666}</style></head><body>'+
     '<h1>ZUKAIT TIME TRACK</h1><h2>'+E(title)+' — '+E(period)+'</h2><div class="summary">Total leave records: '+list.length+' &nbsp; | &nbsp; People on leave: '+unique(list)+'</div>'+table+
     '<footer>Printed from Zukait Time Track</footer></body></html>';
 }

 window.v78PrintLeave=function(mode){
   if(!me||me.role!=='Manager')return;
   const rows=mode==='month'?monthRows():todayRows();
   const html=leavePrintHtml(mode,rows);
   if(typeof window.v110ReportActions==='function'){window.v110ReportActions(html,mode==='month'?'Zukait_Monthly_Leave_Report.pdf':'Zukait_Todays_Leave_Report.pdf');return}
   try{
     if(window.AndroidBridge&&typeof AndroidBridge.printHtml==='function'){AndroidBridge.printHtml(html);return}
   }catch(_){}
   const w=window.open('','_blank');if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),250)}
 };

 window.v755OpenLeaveList=function(mode){
   const rows=mode==='month'?monthRows():todayRows();
   const title=mode==='month'?'This Month Leave':'Today’s Leave';
   const print=me?.role==='Manager'?'<button class="blue v78-print-leave" onclick="v78PrintLeave(\''+E(mode)+'\')">🖨 PRINT LEAVE REPORT</button>':'';
   const body='<div class="section-title"><h2>'+E(title)+'</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+
     '<div class="v78-leave-summary"><span><b>'+unique(rows)+'</b> people</span><span><b>'+rows.length+'</b> records</span></div>'+
     print+leaveTable(rows);
   if(me?.role==='Supervisor'&&typeof showSupervisorModal==='function')showSupervisorModal(title,body.replace(/^<div class="section-title">[\s\S]*?<\/div>/,''));
   else openModal(body);
 };

 function injectSupervisorLeaveRow(){
   if(!me||me.role!=='Supervisor')return;
   const root=document.getElementById('supervisorView');if(!root)return;
   let row=root.querySelector('#v78SupervisorLeaveRow');
   if(!row){
     row=document.createElement('div');
     row.id='v78SupervisorLeaveRow';
     row.className='v78-supervisor-leave-row';
     const glance=[...root.querySelectorAll('.card')].find(x=>/Today at a Glance/i.test(x.querySelector('h3')?.textContent||''));
     if(glance)glance.insertAdjacentElement('afterend',row);
     else root.insertAdjacentElement('afterbegin',row);
   }
   const t=todayRows(),m=monthRows();
   row.innerHTML='<button class="v755-leave-card today" onclick="v755OpenLeaveList(\'today\')"><span>TODAY’S LEAVE</span><b>'+unique(t)+'</b><small>Tap to see who is on leave</small></button>'+
     '<button class="v755-leave-card month" onclick="v755OpenLeaveList(\'month\')"><span>THIS MONTH LEAVE</span><b>'+m.length+'</b><small>Tap for monthly leave details</small></button>';
 }

 const previousRender=window.render;
 window.render=function(){
   const r=typeof previousRender==='function'?previousRender.apply(this,arguments):undefined;
   setTimeout(injectSupervisorLeaveRow,0);
   return r;
 };
 const prevCloud=window.v42AfterCloudPull;
 window.v42AfterCloudPull=function(){
   const r=typeof prevCloud==='function'?prevCloud.apply(this,arguments):undefined;
   setTimeout(injectSupervisorLeaveRow,0);
   return r;
 };
 setTimeout(injectSupervisorLeaveRow,150);

 const css=document.createElement('style');css.id='v78LeaveStyle';css.textContent=
   '.v78-supervisor-leave-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}.v78-leave-summary{display:flex;gap:10px;margin:0 0 10px}.v78-leave-summary span{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px}.v78-print-leave{margin:0 0 10px}.v78-leave-table{overflow:auto}.v78-leave-table table{min-width:760px}@media(max-width:620px){.v78-supervisor-leave-row{grid-template-columns:1fr 1fr}}';
 document.head.appendChild(css);
 window.v78SupervisorLeavePrintReady=true;
})();


/* V79 WORK SESSION INTEGRITY AUTHORITY
   One employee = one current session.
   Status/time are assignmentId-authoritative.
   Stale overlapping open sessions are reconciled so they cannot keep dashboards "Working". */
(function(){'use strict';
 const HOLD='ID001';
 const sessions=()=>Array.isArray(state.sessions)?state.sessions:(state.sessions=[]);
 const assigns=()=>Array.isArray(state.assign)?state.assign:(state.assign=[]);
 const byStart=(a,b)=>(+a.start||0)-(+b.start||0);
 const byAssigned=(a,b)=>(+a.assignedAt||0)-(+b.assignedAt||0);

 function assignmentForSessionV79(s){
   if(!s)return null;
   if(s.assignmentId){
     const direct=assigns().find(a=>a&&String(a.id)===String(s.assignmentId));
     if(direct)return direct;
   }
   const candidates=assigns().filter(a=>a&&a.emp===s.emp&&a.job===s.job&&!a.cancelled).slice().sort(byAssigned);
   if(!candidates.length)return null;
   let chosen=candidates[0];
   for(const a of candidates){
     if((+a.assignedAt||0)<= (+s.start||0))chosen=a; else break;
   }
   return chosen;
 }
 window.v79AssignmentForSession=assignmentForSessionV79;

 function assignmentSessionsV79(a){
   if(!a)return[];
   const direct=sessions().filter(s=>s&&s.assignmentId&&String(s.assignmentId)===String(a.id));
   const legacy=sessions().filter(s=>s&&!s.assignmentId&&s.emp===a.emp&&s.job===a.job&&assignmentForSessionV79(s)?.id===a.id);
   const map=new Map();
   [...direct,...legacy].forEach(s=>{if(s&&s.id)map.set(String(s.id),s)});
   return [...map.values()].sort(byStart);
 }
 window.v79AssignmentSessions=assignmentSessionsV79;

 function latestSessionForEmployee(emp){
   const rows=sessions().filter(s=>s&&s.emp===emp).slice().sort(byStart);
   return rows.length?rows[rows.length-1]:null;
 }
 function latestSessionForAssignment(a){
   const rows=assignmentSessionsV79(a);
   return rows.length?rows[rows.length-1]:null;
 }

 function reconcileEmployeeSessions(emp){
   const rows=sessions().filter(s=>s&&s.emp===emp).slice().sort(byStart);
   if(rows.length<2)return false;
   let changed=false;
   for(let i=0;i<rows.length-1;i++){
     const s=rows[i],next=rows[i+1];
     if(!s.end){
       const boundary=Math.max(+s.start||0,+next.start||0);
       s.end=boundary;
       s.reconciledStaleOpen=true;
       s.reconciledAt=Date.now();
       s.reconciledReason='Newer session exists';
       // Do not mark finished; this is a technical closure only.
       if(!s.finished)s.paused=true;
       changed=true;
     }else if((+s.end||0)>(+next.start||0)){
       // One employee cannot work two jobs at the same time. Clamp older overlap.
       s.end=Math.max(+s.start||0,+next.start||0);
       s.reconciledOverlap=true;
       s.reconciledAt=Date.now();
       s.reconciledReason='Overlap clamped to next session start';
       if(!s.finished)s.paused=true;
       changed=true;
     }
   }
   return changed;
 }
 function reconcileAllSessionsV79(){
   const emps=[...new Set(sessions().map(s=>s?.emp).filter(Boolean))];
   let changed=false;
   emps.forEach(emp=>{if(reconcileEmployeeSessions(emp))changed=true});
   if(changed){try{save()}catch(_){}}
   return changed;
 }
 window.v79ReconcileWorkSessions=reconcileAllSessionsV79;

 window.activeSession=function(emp){
   reconcileEmployeeSessions(emp);
   const latest=latestSessionForEmployee(emp);
   return latest&&!latest.end?latest:null;
 };

 window.empStatus=function(a){
   if(!a)return'New';
   if(a.completed)return'Finished';
   const latest=latestSessionForAssignment(a);
   if(!latest)return'New';
   // Only the exact latest employee session can make this assignment Working.
   const employeeLatest=latestSessionForEmployee(a.emp);
   if(employeeLatest&&employeeLatest.id===latest.id&&!latest.end)return'Started';
   if(latest.paused)return'Paused';
   if(latest.finished)return a.completed?'Finished':'Paused';
   return latest.end?'Paused':'New';
 };

 window.totalForAssignment=function(a){
   if(!a)return 0;
   return assignmentSessionsV79(a).reduce((n,s)=>{
     const end=s.end||Date.now();
     try{return n+(typeof window.sessionNormalMinutes==='function'?window.sessionNormalMinutes(s,end):Math.max(0,(end-(+s.start||end))/60000))}
     catch(_){return n+Math.max(0,(end-(+s.start||end))/60000)}
   },0);
 };

 window.v79OvertimeForAssignment=function(a,from=0,to=Number.MAX_SAFE_INTEGER){
   if(!a)return 0;
   return assignmentSessionsV79(a).reduce((n,s)=>{
     const st=Math.max(+s.start||0,from),en=Math.min(+(s.end||Date.now()),to);
     if(en<=st)return n;
     try{return n+(typeof window.sessionOvertimeMinutes==='function'?window.sessionOvertimeMinutes({start:st,end:en},en):0)}
     catch(_){return n}
   },0);
 };

 // Overtime must not count stale historical open sessions as "now".
 window.v79CurrentOvertimeRows=function(){
   const rows=[];
   for(const u of users.filter(x=>x&&x.role==='Employee')){
     const s=activeSession(u.id);
     if(!s||s.job===HOLD)continue;
     let m=0;try{m=window.sessionOvertimeMinutes(s,Date.now())||0}catch(_){}
     if(m>0)rows.push({s,m});
   }
   return rows;
 };
 window.v74OT=function(){
   const rows=window.v79CurrentOvertimeRows();
   const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const F=m=>{try{return fmt(Math.max(0,+m||0))}catch(_){return Math.round(+m||0)+'m'}};
   const P=id=>{try{return user(id)||{name:id}}catch(_){return{name:id}}};
   showSupervisorModal('⏱ Overtime Now',rows.length?'<table><tr><th>Employee</th><th>JC</th><th>Overtime</th></tr>'+rows.map(x=>'<tr><td>'+E(P(x.s.emp).name)+'</td><td>'+E(x.s.job)+'</td><td><b>'+F(x.m)+'</b></td></tr>').join('')+'</table>':'<div class="notice">No employee is in overtime now.</div>');
 };

 // Active Workers must use authoritative current sessions only.
 function currentWorkerRowsV79(){
   return users.filter(u=>u&&u.role==='Employee').map(u=>{
     const s=activeSession(u.id);if(!s)return null;
     const a=assignmentForSessionV79(s);
     let j={};try{j=job(s.job)||{}}catch(_){}
     return{s,a,u,j};
   }).filter(Boolean);
 }
 window.v79CurrentWorkerRows=currentWorkerRowsV79;
 window.v756UniqueActiveWorkerRows=currentWorkerRowsV79;

 window.openActiveWorkers=function(){
   const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const F=m=>{try{return fmt(Math.max(0,+m||0))}catch(_){return Math.round(+m||0)+'m'}};
   const rows=currentWorkerRowsV79(),deptName={Denter:'Denting',Painter:'Painting',Mechanic:'Mechanical'},depts=['Denter','Painter','Mechanic'];
   const groups=depts.map(dept=>{
     const list=rows.filter(x=>x.u.department===dept);
     return '<section class="v69-dept v69-'+dept.toLowerCase()+'"><div class="v69-dept-head"><b>'+deptName[dept]+'</b><span>'+list.length+'</span></div>'+
       (list.length?list.map(x=>{
         const hold=x.s.job===HOLD,allocated=+x.a?.suggested||0,ac=x.a?totalForAssignment(x.a):0;
         return '<details class="v69-worker '+(hold?'v756-id001-worker':'v756-normal-worker')+'"><summary>'+E(x.u.name)+' <small class="'+(hold?'v756-id001-badge':'')+'">'+(hold?'ID001 · WAITING':E(x.s.job))+'</small></summary><div>'+
           (hold?'<div class="v756-id001-title">ID001 — AVAILABLE / WAITING</div><b>Allocated ID001:</b> '+F(allocated)+'<br><b>Current ID001 Time:</b> '+F(ac)+'<br><b>Status:</b> <span class="v756-id001-status">ACTIVE ID001</span>':
           '<b>Job Card:</b> '+E(x.s.job)+'<br><b>Vehicle:</b> '+E(x.j.vehicle||'—')+' · '+E(x.j.reg||'—')+'<br><b>Allocated:</b> '+F(allocated)+'<br><b>Actual:</b> '+F(ac)+'<br><b>Status:</b> WORKING<br><button class="blue" onclick="openSupervisorJob(\''+E(x.s.job)+'\')">VIEW JOB</button>')+
           '</div></details>';
       }).join(''):'<div class="v69-empty">No active workers</div>')+'</section>';
   }).join('');
   showSupervisorModal('👷 Active Workers','<div class="v756-active-legend"><span class="v756-normal-dot"></span>Normal Job Card <span class="v756-id001-dot"></span>ID001 / Waiting</div><div class="v69-dept-grid">'+groups+'</div>');
 };

 // Patch Supervisor overview counts after all previous wrappers.
 const prevOverview79=window.supervisorOverview;
 window.supervisorOverview=function(rows){
   let html=typeof prevOverview79==='function'?prevOverview79.apply(this,arguments):'';
   if(!html||me?.role!=='Supervisor')return html;
   const open=(rows||state.assign||[]).filter(a=>a&&!a.cancelled&&!a.completed&&a.job!==HOLD);
   const active=currentWorkerRowsV79().filter(x=>x.s.job!==HOLD).length;
   const paused=open.filter(a=>empStatus(a)==='Paused').length;
   const ot=window.v79CurrentOvertimeRows().length;
   html=html.replace(/(<b>Active Workers<\/b><div class="stat">)\d+(<\/div>)/,'$1'+active+'$2');
   html=html.replace(/(<b>Paused Jobs<\/b><div class="stat">)\d+(<\/div>)/,'$1'+paused+'$2');
   html=html.replace(/(<b>Overtime Now<\/b><div class="stat">)\d+(<\/div>)/,'$1'+ot+'$2');
   return html;
 };

 // Prevent duplicate open assignment rows for the same employee + same JC unless it is explicit Repeat Work.
 function reconcileDuplicateOpenAssignments(){
   const groups=new Map();
   for(const a of assigns().filter(a=>a&&!a.cancelled&&!a.completed&&a.job!==HOLD&&!a.rework)){
     const k=String(a.emp)+'||'+String(a.job);
     if(!groups.has(k))groups.set(k,[]);
     groups.get(k).push(a);
   }
   let changed=false;
   for(const rows of groups.values()){
     if(rows.length<2)continue;
     rows.sort((a,b)=>(+b.assignedAt||0)-(+a.assignedAt||0));
     const keep=rows[0];
     for(const a of rows.slice(1)){
       // Only auto-close true duplicates that have no own session history.
       const own=assignmentSessionsV79(a);
       if(own.length===0){
         a.cancelled=true;a.cancelledAt=Date.now();a.cancelReason='Automatic duplicate-open cleanup';a.duplicateOf=keep.id;
         changed=true;
       }
     }
   }
   if(changed){try{save()}catch(_){}}
   return changed;
 }
 window.v79ReconcileDuplicateAssignments=reconcileDuplicateOpenAssignments;

 // Strong Start / Pause / Finish authority for normal jobs and ID001.
 const previousStart79=window.start;
 window.start=function(no){
   if(!me||me.role!=='Employee')return;
   reconcileEmployeeSessions(me.id);reconcileDuplicateOpenAssignments();
   if(activeSession(me.id))return typeof window.v74Msg==='function'?window.v74Msg('You already have an active job. Pause, finish or stop it before starting another job.','One Job at a Time'):alert('You already have an active job.');
   const candidates=assigns().filter(a=>a&&a.emp===me.id&&a.job===no&&!a.cancelled&&!a.completed).sort((a,b)=>(+b.assignedAt||0)-(+a.assignedAt||0));
   if(no===HOLD)return typeof previousStart79==='function'?previousStart79.apply(this,arguments):undefined;
   const a=candidates[0];
   if(!a)return typeof window.v74Msg==='function'?window.v74Msg('This Job Card is not available for work.','Start Work'):alert('This job is not available for work.');
   state.sessions.push({id:uid(),assignmentId:a.id,job:a.job,emp:me.id,start:now(),end:null,paused:false,finished:false,rework:a.rework===true,v79Integrity:true});
   if(typeof setLastAction==='function')setLastAction('Started '+a.job+(a.rework?' repeat work':''));
   save();render();
 };

 window.v74Pause=function(){
   if(!me||me.role!=='Employee')return closeModal();
   const s=activeSession(me.id);if(!s)return closeModal();
   if(s.job===HOLD){closeModal();return typeof window.v74Msg==='function'?window.v74Msg('ID001 cannot be paused. Use STOP.','Ideal Time'):undefined}
   const r=(document.getElementById('v74pr')?.value||'').trim(),t=now();
   s.end=t;s.paused=true;s.finished=false;s.pauseReason=r;s.v79Integrity=true;
   const a=assignmentForSessionV79(s);if(a)a.pauseReason=r;
   if(typeof setLastAction==='function')setLastAction('Paused '+s.job);
   save();closeModal();render();
 };

 window.v74Finish=function(){
   if(!me||me.role!=='Employee')return closeModal();
   const s=activeSession(me.id),a=assignmentForSessionV79(s);if(!s||!a)return closeModal();
   const t=now();s.end=t;s.finished=true;s.paused=false;s.v79Integrity=true;a.completed=true;a.completedAt=t;
   if(s.job!==HOLD){
     let j=null;try{j=job(s.job)}catch(_){}
     if(j){
       const aa=assigns().filter(x=>x&&!x.cancelled&&x.job===s.job);
       const done=aa.length>0&&aa.every(x=>x.completed);
       j.status=done?'Completed':'Open';if(done)j.completedAt=Math.max(...aa.map(x=>+x.completedAt||0),t);else delete j.completedAt;
     }
   }
   if(typeof setLastAction==='function')setLastAction((s.job===HOLD?'Stopped ':'Finished ')+s.job);
   save();closeModal();render();
 };

 // Run on load/render/cloud refresh so stale states cannot keep returning.
 const priorCloud79=window.v42AfterCloudPull;
 window.v42AfterCloudPull=function(){
   const r=typeof priorCloud79==='function'?priorCloud79.apply(this,arguments):undefined;
   reconcileAllSessionsV79();reconcileDuplicateOpenAssignments();return r;
 };
 const priorRender79=window.render;
 window.render=function(){
   reconcileAllSessionsV79();reconcileDuplicateOpenAssignments();
   return typeof priorRender79==='function'?priorRender79.apply(this,arguments):undefined;
 };
 setTimeout(()=>{reconcileAllSessionsV79();reconcileDuplicateOpenAssignments()},100);


 // Normal assignment guard: never create/reopen a duplicate same JC + employee silently.
 const priorAssignCore79=window.assignJobCore;
 window.assignJobCore=function(no,emp,minutes){
   if(no===HOLD)return typeof priorAssignCore79==='function'?priorAssignCore79.apply(this,arguments):undefined;
   const m=Number(minutes);
   if(!Number.isFinite(m)||m<1)return typeof window.v74Msg==='function'?window.v74Msg('Enter a valid allocated time.','Assign Job Card'):alert('Enter a valid allocated time.');
   reconcileDuplicateOpenAssignments();
   const same=assigns().filter(a=>a&&a.job===no&&a.emp===emp&&!a.cancelled&&!a.rework).sort((a,b)=>(+b.assignedAt||0)-(+a.assignedAt||0));
   const open=same.filter(a=>!a.completed);
   if(open.length){
     const a=open[0],old=+a.suggested||0;
     a.suggested=m;a.assignedBy=me?.id||a.assignedBy;a.updatedAt=Date.now();
     state.suggestedEdits=state.suggestedEdits||[];
     state.suggestedEdits.push({id:uid(),assignmentId:a.id,job:no,emp,old,newValue:m,by:me?.id||'',at:Date.now(),source:'Supervisor update existing open assignment'});
     if(typeof setLastAction==='function')setLastAction('Updated assignment '+no+' for '+(user(emp)?.name||emp));
     save();render();return a;
   }
   const completed=same.find(a=>a.completed);
   if(completed){
     const msg='This employee already completed this Job Card. Use Reopen Same Assignment for mistaken finish, or Repeat Work when it is repeat work.';
     return typeof window.v74Msg==='function'?window.v74Msg(msg,'Existing Completed Work'):alert(msg);
   }
   const a={id:uid(),job:no,emp,suggested:m,completed:false,cancelled:false,rework:false,assignedBy:me?.id||'SYSTEM',assignedAt:Date.now(),v79Integrity:true};
   assigns().push(a);
   if(typeof setLastAction==='function')setLastAction('Assigned '+no+' to '+(user(emp)?.name||emp));
   save();render();return a;
 };

 // Employee overtime/actual summaries reconcile first, so stale open sessions cannot keep accruing time.
 const oldOTEmployee79=window.overtimeForEmployee;
 window.overtimeForEmployee=function(emp,from,to){
   reconcileEmployeeSessions(emp);
   return sessions().filter(x=>x&&x.emp===emp&&x.start<to&&(x.end||Date.now())>from).reduce((n,x)=>{
     const st=Math.max(+x.start||0,from),en=Math.min(+(x.end||Date.now()),to);
     if(en<=st)return n;
     try{return n+(typeof window.sessionOvertimeMinutes==='function'?window.sessionOvertimeMinutes({start:st,end:en},en):0)}
     catch(_){return n}
   },0);
 };
 const oldMonthlyNormal79=window.monthlyNormalActualMinutes;
 window.monthlyNormalActualMinutes=function(emp,from,to){
   reconcileEmployeeSessions(emp);
   return sessions().filter(x=>x&&x.emp===emp&&x.job!==HOLD&&x.start<to&&(x.end||Date.now())>from).reduce((n,x)=>{
     const st=Math.max(+x.start||0,from),en=Math.min(+(x.end||Date.now()),to);
     if(en<=st)return n;
     try{return n+(typeof window.sessionNormalMinutes==='function'?window.sessionNormalMinutes({start:st,end:en},en):(en-st)/60000)}
     catch(_){return n+(en-st)/60000}
   },0);
 };
 window.v79WorkSessionIntegrityReady=true;
})();

/* V104 Employee compact status / gauge readability adjustment. */
(()=>{const s=document.createElement('style');s.textContent='.v75s-live{width:auto!important;max-width:62%!important;padding:8px 10px!important;gap:7px!important}.v75s-live .v75s-gear{width:34px!important;height:34px!important;font-size:18px!important}.v75s-live h2{font-size:14px!important;line-height:1.05!important}.v75s-live p{font-size:9px!important;margin-top:3px!important}.v75s-badge{padding:3px 6px!important;font-size:7px!important;max-width:74px!important}.v80-rpm-gauge .v80-gauge-title{font-size:13px!important}.v80-rpm-gauge b{font-size:29px!important}.v80-rpm-gauge small{font-size:12px!important}.v93-rpm-redline,.v93-rpm-needle,.v93-rpm-hub{display:none!important}';document.head.appendChild(s)})();

/* V104 Employee This Month: use compact capsule tiles for every monthly KPI. */
(()=>{const s=document.createElement('style');s.textContent='.v75s .month-summary .v81-month-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;padding:5px 0!important}.v75s .month-summary .v81-month-orb{aspect-ratio:auto!important;max-width:none!important;width:100%!important;min-height:54px!important;border-radius:999px!important;padding:8px 10px!important;box-sizing:border-box!important}.v75s .month-summary .v81-month-orb:after,.v75s .month-summary .v81-month-orb:before{display:none!important}.v75s .month-summary .v81-month-orb b{font-size:17px!important;line-height:1!important;margin:0!important}.v75s .month-summary .v81-month-orb span{font-size:8px!important;line-height:1.1!important;margin-top:5px!important;max-width:none!important;white-space:normal!important}.v75s .month-summary .v104-month-progress{margin:7px 0 9px!important}.v75s .month-summary .v104-progress{min-height:48px!important;display:flex!important;flex-direction:column!important;justify-content:center!important}@media(max-width:380px){.v75s .month-summary .v81-month-grid{gap:6px!important}.v75s .month-summary .v81-month-orb{min-height:50px!important;padding:7px 6px!important}.v75s .month-summary .v81-month-orb b{font-size:15px!important}.v75s .month-summary .v81-month-orb span{font-size:7px!important}}';document.head.appendChild(s)})();

/* V104 Employee monthly target/achieved/incentive capsules. */
(()=>{const s=document.createElement('style');s.textContent='.v104-month-progress{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:8px 0 12px}.v104-progress{min-width:0;border-radius:999px;padding:8px 6px;text-align:center;border:1px solid rgba(255,255,255,.58);box-shadow:inset 0 1px 0 rgba(255,255,255,.82),0 4px 10px rgba(15,23,42,.12)}.v104-progress span{display:block;font-size:8px;font-weight:1000;letter-spacing:.06em;white-space:nowrap}.v104-progress b{display:block;font-size:15px;line-height:1.1;margin-top:2px;white-space:nowrap}.v104-progress.target{background:#e8f2ff;color:#174ea6}.v104-progress.achieved{background:#e7f8ea;color:#166534}.v104-progress.excess{background:#fff3e0;color:#9a3412}.v104-progress.incentive{background:#f0e8ff;color:#6b21a8}@media(max-width:380px){.v104-month-progress{gap:5px}.v104-progress{padding:7px 4px}.v104-progress b{font-size:13px}.v104-progress span{font-size:7px}}';document.head.appendChild(s)})();


/* V121 MANAGER LOGIC AUTHORITY — keep Manager summaries aligned with final workshop rules. */
(function(){'use strict';
 const H='ID001',RATE=2.5;
 const monthBounds=()=>{const d=new Date();return{from:+new Date(d.getFullYear(),d.getMonth(),1),to:+new Date(d.getFullYear(),d.getMonth()+1,1)}};
 const normalActual=(emp,from,to)=>{try{return typeof window.monthlyNormalActualMinutes==='function'?Math.max(0,window.monthlyNormalActualMinutes(emp,from,to)||0):0}catch(_){return 0}};
 const suggested=(emp,from,to)=>{try{return typeof window.monthlySuggestedMinutes==='function'?Math.max(0,window.monthlySuggestedMinutes(emp,from,to)||0):0}catch(_){return 0}};
 window.v121ManagerMonthEmployee=function(emp){const {from,to}=monthBounds(),sg=suggested(emp,from,to),ac=normalActual(emp,from,to);return{suggested:sg,actual:ac,efficiency:ac?sg/ac*100:null,labourCost:ac*RATE/60}};
 window.v121ManagerMonthSummary=function(){const {from,to}=monthBounds(),emps=(users||[]).filter(u=>u&&u.role==='Employee');let sg=0,ac=0;for(const u of emps){sg+=suggested(u.id,from,to);ac+=normalActual(u.id,from,to)}return{suggested:sg,actual:ac,efficiency:ac?sg/ac*100:null,labourCost:ac*RATE/60}};
 // Manager must use the same final V107 incentive authority as Employee/Supervisor.
 const oldIncentive=window.openIncentiveList;window.openManagerIncentiveList=function(){if(!me||me.role!=='Manager')return;const rows=(users||[]).filter(u=>u&&u.role==='Employee').map(u=>({u,x:typeof window.incentiveFor==='function'?window.incentiveFor(u.id):{target:0,achieved:0,excess:0,repeat:0,incentive:0}})).sort((a,b)=>String(a.u.name||'').localeCompare(String(b.u.name||'')));const e=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),fm=v=>typeof window.fmt==='function'?window.fmt(Math.max(0,+v||0)):String(Math.max(0,+v||0));const body='<div class="section-title"><h2>⭐ Monthly Incentive</h2><button class="secondary" onclick="closeModal()">Close</button></div><p class="muted">Overtime and ID001 are excluded from achieved/incentive hours. Repeat actual time is deducted from the Mistake Employee.</p><div style="overflow:auto"><table><tr><th>Employee</th><th>Target</th><th>Achieved</th><th>Excess</th><th>Repeat Penalty</th><th>Incentive</th></tr>'+rows.map(r=>'<tr><td><b>'+e(r.u.name||r.u.id)+'</b></td><td>'+fm(r.x.target)+'</td><td>'+fm(r.x.achieved??r.x.eligible)+'</td><td>'+fm(r.x.excess)+'</td><td>'+fm(r.x.repeat)+'</td><td><b>'+fm(r.x.incentive)+'</b></td></tr>').join('')+'</table></div>';return typeof openModal==='function'?openModal(body):undefined};
 window.openIncentiveList=function(){if(me?.role==='Manager')return window.openManagerIncentiveList();return typeof oldIncentive==='function'?oldIncentive.apply(this,arguments):undefined};
 window.v121ManagerLogicAuthority=true;
})();

/* V124 ADDITIONAL TIME FINAL AUTHORITY — single safe mutation path. */
(function(){'use strict';
 const findAssignment=(jobNo,emp)=>(state.assign||[]).filter(a=>a&&!a.cancelled&&!a.completed&&a.job===jobNo&&String(a.emp)===String(emp)).sort((a,b)=>(+b.assignedAt||0)-(+a.assignedAt||0))[0]||null;
 function add(a,mins,source,request){
  mins=Number(mins);if(!a||a.cancelled||a.completed)return{ok:false,reason:'inactive'};if(!Number.isFinite(mins)||mins<1)return{ok:false,reason:'invalid'};
  if(request&&request.status!=='New')return{ok:false,reason:'handled'};
  const old=Math.max(0,+a.suggested||0),at=Date.now();a.suggested=old+mins;
  state.additionalActions=state.additionalActions||[];state.suggestedEdits=state.suggestedEdits||[];
  state.additionalActions.push({id:uid(),type:'Additional Time',assignmentId:a.id,job:a.job,emp:a.emp,minutes:mins,oldSuggested:old,newSuggested:a.suggested,by:me?.id||'SYSTEM',at,source});
  state.suggestedEdits.push({assignmentId:a.id,job:a.job,emp:a.emp,old,newValue:a.suggested,by:me?.id||'SYSTEM',at,source});
  if(request){request.status='Approved';request.respondedAt=at;request.responseBy=me?.id||'SYSTEM';request.approvedMinutes=mins;request.appliedAssignmentId=a.id;request.additionalActionApplied=true;request.response='Approved +'+mins+' minutes by supervisor'}
  if(typeof setLastAction==='function')setLastAction('Added '+mins+' min to '+a.job+' for '+((typeof user==='function'&&user(a.emp)?.name)||a.emp));
  save();render();return{ok:true,assignment:a};
 }
 window.v124AddAdditionalTime=add;
 const oldManual=window.manualAdditionalTime;window.manualAdditionalTime=function(){return typeof window.openAdditionalTimeWindow==='function'?window.openAdditionalTimeWindow():typeof oldManual==='function'?oldManual.apply(this,arguments):undefined};
 const oldAdd=window.addTimeToAssignment;window.addTimeToAssignment=function(id){const a=(state.assign||[]).find(x=>x&&x.id===id&&!x.cancelled&&!x.completed);if(!a)return alert('Assignment is no longer active.');const raw=prompt('Additional time approved by supervisor (H.MM or H:MM)','0.30');if(raw===null)return;const mins=typeof parseWorkMinutes==='function'?parseWorkMinutes(raw):NaN;if(!Number.isFinite(mins)||mins<1)return alert('Invalid time. '+(typeof timeInputHint==='function'?timeInputHint():''));const out=add(a,mins,'Supervisor Additional Time');if(out.ok&&typeof window.openAdditionalTimeWindow==='function')window.openAdditionalTimeWindow()};
 window.approveRequest=function(id){const r=(state.requests||[]).find(x=>x&&x.id===id);if(!r)return;if(r.status!=='New')return alert('This request has already been '+String(r.status||'handled').toLowerCase()+'. Additional time was not added again.');if(r.type!=='more_time')return alert('This request is not an additional-time request.');const a=findAssignment(r.job,r.emp);if(!a)return alert('Active assignment no longer exists.');const raw=prompt('Supervisor approved additional time for '+r.job+' / '+((typeof user==='function'&&user(r.emp)?.name)||r.emp)+'\\nRequested: '+fmt(Number(r.minutes)||0)+'\\nEnter approved time (H.MM or H:MM)',((Number(r.minutes)||30)/60).toFixed(2));if(raw===null)return;const mins=typeof parseWorkMinutes==='function'?parseWorkMinutes(raw):NaN;if(!Number.isFinite(mins)||mins<1)return alert('Enter valid approved time. '+(typeof timeInputHint==='function'?timeInputHint():''));const out=add(a,mins,'Employee Request Approved',r);if(!out.ok)return alert(out.reason==='handled'?'This request was already handled.':'Additional time could not be applied.');if(typeof window.openSupervisorRequestsWindow==='function')window.openSupervisorRequestsWindow()};
 window.v124AdditionalTimeAuthority=true;
})();

/* V125 REPEAT CYCLE AUTHORITY — every repeat issue is its own work cycle. */
(function(){'use strict';
 const H='ID001',live=no=>(state.assign||[]).filter(a=>a&&!a.cancelled&&a.job===no&&a.job!==H);
 const originals=no=>live(no).filter(a=>!a.rework);
 const repeats=no=>live(no).filter(a=>a.rework).sort((a,b)=>(+a.assignedAt||0)-(+b.assignedAt||0));
 const cycleKey=a=>String(a?.repeatCycleId||a?.id||'');
 function backfill(no){const rr=repeats(no);let changed=false;for(const a of rr){if(!a.repeatCycleId){a.repeatCycleId='legacy-repeat-'+a.id;a.repeatCycleNo=rr.indexOf(a)+1;changed=true}}return changed}
 function current(no){backfill(no);const rr=repeats(no);if(!rr.length)return originals(no);const last=rr[rr.length-1],key=cycleKey(last);return rr.filter(a=>cycleKey(a)===key)}
 function complete(no){const rows=current(no);return rows.length>0&&rows.every(a=>a.completed)}
 window.v125CurrentCycle=current;window.v125CycleComplete=complete;
 const previousAssign=window.assignRepeatWorkV56;window.assignRepeatWorkV56=function(no){
  const emp=document.getElementById('repeatEmployee')?.value,mistake=document.getElementById('repeatMistakeEmployee')?.value,mins=typeof parseWorkMinutes==='function'?parseWorkMinutes(document.getElementById('repeatAllocatedTime')?.value||''):NaN,reason=(document.getElementById('repeatReason')?.value||'').trim();
  if(!emp||!user(emp)||user(emp).role!=='Employee')return alert('Select Repeat Employee.');if(!mistake||!user(mistake)||user(mistake).role!=='Employee')return alert('Select Mistake Employee.');if(!Number.isFinite(mins)||mins<1)return alert('Enter valid Allocated Repeat Time. '+(typeof timeInputHint==='function'?timeInputHint():''));if(!reason)return alert('Repeat Reason is required.');
  const orig=originals(no);if(!orig.length||orig.some(a=>!a.completed))return alert('Repeat Work can only be issued after the original work is FINISHED.');const existing=repeats(no);if(existing.some(a=>!a.completed))return alert('An unfinished Repeat Work assignment already exists on this Job Card.');
  const cycleNo=(existing.reduce((m,a)=>Math.max(m,+a.repeatCycleNo||0),0)||existing.length)+1,cycleId='repeat-'+no+'-'+Date.now()+'-'+uid();
  const a={id:uid(),job:no,emp,suggested:mins,completed:false,cancelled:false,rework:true,repeatCycleId:cycleId,repeatCycleNo:cycleNo,repeatReason:reason,mistakeEmp:mistake,assignedBy:me.id,assignedAt:Date.now(),repeatSameEmployee:String(emp)===String(mistake),v125Cycle:true};
  state.assign.push(a);state.reworkLogs=state.reworkLogs||[];state.reworkLogs.push({id:uid(),assignmentId:a.id,repeatCycleId:cycleId,repeatCycleNo:cycleNo,job:no,emp,mistakeEmp:mistake,suggested:mins,reason,by:me.id,at:a.assignedAt});
  const j=typeof job==='function'?job(no):null;if(j){j.status='Open';delete j.completedAt;j.delivered=false;delete j.deliveredAt}
  if(typeof setLastAction==='function')setLastAction('Assigned repeat cycle '+cycleNo+' for '+no+' to '+(user(emp)?.name||emp));save();if(typeof closeSupervisorModal==='function')closeSupervisorModal();render();alert('Repeat Work cycle '+cycleNo+' assigned to '+(user(emp)?.name||emp)+' with '+fmt(mins)+' Allocated Time.');return a;
 };
 window.v125RepeatCycleAuthority=true;
})();

/* V120 FINISHED / READY DELIVERY CYCLE AUTHORITY */
(function(){'use strict';
 const H='ID001',esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const asg=no=>(state.assign||[]).filter(a=>a&&!a.cancelled&&a.job===no&&a.job!==H);
 const jobs=()=>state.jobs||[];
 function cycle(no){if(typeof window.v125CurrentCycle==='function')return window.v125CurrentCycle(no);const all=asg(no),repeats=all.filter(a=>a.rework===true),normal=all.filter(a=>a.rework!==true);return repeats.length?repeats:normal}
 function complete(no){const rows=cycle(no);return rows.length>0&&rows.every(a=>a.completed)}
 function completedAt(no){const rows=cycle(no);return complete(no)?Math.max(...rows.map(a=>+a.completedAt||0)):0}
 function finishedJobs(todayOnly){let day=0;if(todayOnly){const d=new Date();d.setHours(0,0,0,0);day=d.getTime()}return jobs().filter(j=>j&&j.no!==H&&!j.archived&&complete(j.no)&&(!todayOnly||completedAt(j.no)>=day)).sort((a,b)=>completedAt(b.no)-completedAt(a.no))}
 function readyJobs(){return finishedJobs(false).filter(j=>!j.delivered)}
 function table(rows,mode){
  if(!rows.length)return '<div class="notice">No matching Job Cards.</div>';
  return '<div class="v74-scroll"><table><tr><th>JC</th><th>Vehicle / Reg.</th><th>Employees</th><th>Completed</th><th></th></tr>'+rows.map(j=>{
   const r=cycle(j.no),names=[...new Set(r.map(a=>{try{return user(a.emp)?.name||a.emp}catch(_){return a.emp}}))];
   const openFn=mode==='manager'?'openManagerJobDetails':'openSupervisorJob';
   return '<tr><td><b>'+esc(j.no)+'</b></td><td>'+esc(j.vehicle||'—')+'<br>'+esc(j.reg||'—')+'</td><td>'+names.map(esc).join(', ')+'</td><td>'+esc(completedAt(j.no)?new Date(completedAt(j.no)).toLocaleString():'—')+'</td><td><button class="blue" data-job="'+esc(j.no)+'" onclick="'+openFn+'(this.dataset.job)">VIEW</button></td></tr>'
  }).join('')+'</table></div>'
}
 window.v120JobCycleAssignments=cycle;window.v120JobCycleComplete=complete;window.v120FinishedJobs=finishedJobs;window.v120ReadyJobs=readyJobs;
 window.openSupervisorFinishedWindow=function(){showSupervisorModal('✅ Finished Job Cards Today',table(finishedJobs(true),'supervisor'))};
 window.v74ManagerCompletedJobs=function(){openModal('<div class="section-title"><h2>✓ Completed Job Cards</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+table(finishedJobs(false),'manager'))};
 window.v74Ready=function(mode){const rows=readyJobs(),body=rows.length?table(rows,mode):'<div class="notice">No Job Cards are Ready for Delivery.</div>';mode==='manager'?openModal('<div class="section-title"><h2>🚗✓ Ready for Delivery</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+body):showSupervisorModal('🚗✓ Ready for Delivery',body)};
 const oldOverview=window.supervisorOverview;window.supervisorOverview=function(rows){let html=typeof oldOverview==='function'?oldOverview.apply(this,arguments):'';if(!html)return html;const fin=finishedJobs(true).length,ready=readyJobs().length;html=html.replace(/(<b>Finished Jobs<\/b><div class="stat">)\d+(<\/div>)/,'$1'+fin+'$2');html=html.replace(/(<b>Ready for Delivery<\/b><div class="stat">)\d+(<\/div>)/,'$1'+ready+'$2');return html};
 window.v120SyncJobLifecycle=function(no){const j=jobs().find(x=>x&&x.no===no);if(!j||no===H)return false;const done=complete(no),at=completedAt(no);j.status=done?'Completed':'Open';if(done)j.completedAt=at||Date.now();else delete j.completedAt;return done};
 const previousFinish=window.v74Finish;window.v74Finish=function(){const s=typeof activeSession==='function'&&me?activeSession(me.id):null,no=s?.job;const out=typeof previousFinish==='function'?previousFinish.apply(this,arguments):undefined;if(no&&no!==H){window.v120SyncJobLifecycle(no);try{save()}catch(_){}}return out};
 const previousReopen=window.v71ReopenSameAssignment;window.v71ReopenSameAssignment=function(id){const a=(state.assign||[]).find(x=>x&&x.id===id&&!x.cancelled),no=a?.job;const out=typeof previousReopen==='function'?previousReopen.apply(this,arguments):undefined;if(no&&no!==H)setTimeout(()=>{window.v120SyncJobLifecycle(no);try{save()}catch(_){}},0);return out};
 window.v120FinishedReadyAuthority=true;
})();

/* V122 MANAGER FINAL DOM / COUNTER AUTHORITY — one logical source for Manager cards. */
(function(){'use strict';
 const H='ID001';
 function apply(){
  if(!me||me.role!=='Manager')return;
  const root=document.getElementById('managerView');if(!root)return;
  const month=typeof window.v121ManagerMonthSummary==='function'?window.v121ManagerMonthSummary():null;
  if(month){
   const cards=[...root.querySelectorAll('.manager-kpi')];
   const find=t=>cards.find(x=>(x.textContent||'').toUpperCase().includes(t));
   const actual=find('MONTH ACTUAL'),eff=find('MONTH EFFICIENCY');
   if(actual){const n=actual.querySelector('.num'),s=actual.querySelector('.small:last-child');if(n)n.textContent=fmt(month.actual||0);if(s)s.textContent='Suggested '+fmt(month.suggested||0)}
   if(eff){const n=eff.querySelector('.num');if(n)n.textContent=month.efficiency==null?'—':month.efficiency.toFixed(1)+'%'}
  }
  // Completed and Ready counters are JOB CARD counts, never assignment counts.
  const today=typeof window.v120FinishedJobs==='function'?window.v120FinishedJobs(true).length:0;
  const ready=typeof window.v120ReadyJobs==='function'?window.v120ReadyJobs().length:0;
  root.querySelectorAll('button,.manager-kpi,.v67-control,.v67-feature').forEach(el=>{
   const txt=(el.textContent||'').toUpperCase();
   if(txt.includes('TODAY COMPLETED')||txt.includes('COMPLETED TODAY')){const n=el.querySelector('.num,.stat,b');if(n)n.textContent=String(today)}
   if(txt.includes('READY FOR DELIVERY')){const n=el.querySelector('.num,.stat,b');if(n)n.textContent=String(ready)}
  });
  // Remove accidental duplicate identity and incentive controls without changing approved layout.
  const ids=[...root.querySelectorAll('.v91-role-identity')];ids.slice(1).forEach(x=>x.remove());
  const inc=[...root.querySelectorAll('button')].filter(b=>(b.textContent||'').toUpperCase().includes('INCENTIVE'));
  inc.slice(1).forEach(x=>x.remove());
 }
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(apply,0);return r};
 window.v122ApplyManagerFinal=apply;window.v122ManagerFinalAuthority=true;
})();

/* V123 MANAGER WORKSHOP PERFORMANCE — compact drill-down, no duplicate controls. */
(function(){'use strict';
 const H='ID001',RATE=2.5,e=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 let range='month';
 const bounds=()=>{const d=new Date();if(range==='today'){const a=new Date(d);a.setHours(0,0,0,0);return{from:+a,to:+new Date(+a+86400000)}}return{from:+new Date(d.getFullYear(),d.getMonth(),1),to:+new Date(d.getFullYear(),d.getMonth()+1,1)}};
 const assignments=()=>(state.assign||[]).filter(a=>a&&!a.cancelled&&a.job!==H);
 const actual=(a,from,to)=>{try{return typeof window.v107AssignmentNormal==='function'?Math.max(0,window.v107AssignmentNormal(a,from,to)||0):0}catch(_){return 0}}; const totalNormal=a=>actual(a,0,Date.now());
 function data(){const {from,to}=bounds(),rows=assignments(),open=rows.filter(a=>!a.completed),jobs=new Set(open.map(a=>a.job)),over=new Set(open.filter(a=>(+a.suggested||0)>0&&totalNormal(a)>+a.suggested).map(a=>a.job)),repeat=new Set(rows.filter(a=>a.rework&&(a.assignedAt||a.completedAt||0)>=from&&(a.assignedAt||a.completedAt||0)<to).map(a=>a.job)),emps=(users||[]).filter(u=>u&&u.role==='Employee');let sg=0,ac=0;for(const u of emps){if(range==='month'&&typeof window.v121ManagerMonthEmployee==='function'){const x=window.v121ManagerMonthEmployee(u.id);sg+=x.suggested||0;ac+=x.actual||0}else{for(const a of rows.filter(x=>x.emp===u.id)){const m=actual(a,from,to);if(m>0){ac+=m;if(a.completed||m>0)sg+=Math.max(0,+a.suggested||0)}}}}return{jobs:jobs.size,ready:typeof window.v120ReadyJobs==='function'?window.v120ReadyJobs().length:0,over:over.size,repeat:repeat.size,sg,ac,eff:ac?sg/ac*100:null,cost:ac*RATE/60}}
 function open(type){const {from,to}=bounds(),rows=assignments();let body='',title='Workshop Performance';if(type==='progress'){const js=[...new Set(rows.filter(a=>!a.completed).map(a=>a.job))];body=js.length?js.map(n=>'<button class="secondary" style="width:100%;margin:4px 0" data-job="'+e(n)+'" onclick="openManagerJobDetails(this.dataset.job)">'+e(n)+'</button>').join(''):'<div class="notice">No jobs in progress.</div>';title='Jobs in Progress'}else if(type==='ready'){return typeof window.v74Ready==='function'?window.v74Ready('manager'):undefined}else if(type==='over'){const js=[...new Set(rows.filter(a=>!a.completed&&(+a.suggested||0)>0&&totalNormal(a)>+a.suggested).map(a=>a.job))];body=js.length?js.map(n=>'<button class="secondary" style="width:100%;margin:4px 0" data-job="'+e(n)+'" onclick="openManagerJobDetails(this.dataset.job)">'+e(n)+'</button>').join(''):'<div class="notice">No over-allocated jobs in this period.</div>';title='Over Allocated Jobs'}else if(type==='repeat'){const js=[...new Set(rows.filter(a=>a.rework&&(a.assignedAt||a.completedAt||0)>=from&&(a.assignedAt||a.completedAt||0)<to).map(a=>a.job))];body=js.length?js.map(n=>'<button class="secondary" style="width:100%;margin:4px 0" data-job="'+e(n)+'" onclick="openManagerJobDetails(this.dataset.job)">'+e(n)+'</button>').join(''):'<div class="notice">No repeat work in this period.</div>';title='Repeat Work'}else{const x=data();body='<div class="notice"><b>Suggested:</b> '+fmt(x.sg)+'<br><b>Actual:</b> '+fmt(x.ac)+'<br><b>Efficiency:</b> '+(x.eff==null?'—':x.eff.toFixed(1)+'%')+'<br><b>Labour Value:</b> '+x.cost.toFixed(3)+' OMR</div>';title=type==='cost'?'Labour Value':'Workshop Efficiency'}if(typeof openModal==='function')openModal('<div class="section-title"><h2>'+e(title)+'</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+body)}
 window.v123ManagerPerformanceOpen=open;
 window.v123ManagerPerformanceRange=function(v){range=v==='today'?'today':'month';apply()};
 function apply(){if(!me||me.role!=='Manager')return;const root=document.getElementById('managerView');if(!root)return;let box=root.querySelector('.v123-manager-performance');if(!box){box=document.createElement('section');box.className='card v123-manager-performance';const identity=root.querySelector('.v91-role-identity');(identity?.parentNode||root).insertBefore(box,identity?identity.nextSibling:root.firstChild)}const x=data(),card=(k,l,v)=>'<button class="v123-perf" onclick="v123ManagerPerformanceOpen(\''+k+'\')"><span>'+l+'</span><b>'+v+'</b></button>';box.innerHTML='<div class="v123-head"><div><h3>Workshop Performance</h3><small>Manager overview · tap any card for details</small></div><div class="v123-toggle"><button class="'+(range==='today'?'on':'')+'" onclick="v123ManagerPerformanceRange(\'today\')">Today</button><button class="'+(range==='month'?'on':'')+'" onclick="v123ManagerPerformanceRange(\'month\')">This Month</button></div></div><div class="v123-grid">'+card('progress','Jobs in Progress',x.jobs)+card('ready','Ready for Delivery',x.ready)+card('over','Over Allocated',x.over)+card('eff','Workshop Efficiency',x.eff==null?'—':x.eff.toFixed(1)+'%')+card('repeat','Repeat Work',x.repeat)+card('cost','Labour Value',x.cost.toFixed(3)+' OMR')+'</div>'}
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(apply,0);return r};window.v123ApplyManagerPerformance=apply;
 const s=document.createElement('style');s.textContent='.v123-manager-performance{margin:0 0 12px}.v123-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.v123-head h3{margin:0}.v123-head small{color:#667085}.v123-toggle{display:flex;background:#eef2f6;border-radius:999px;padding:3px}.v123-toggle button{border:0;background:transparent;padding:6px 9px;border-radius:999px;font-size:11px;font-weight:800}.v123-toggle button.on{background:#fff;box-shadow:0 1px 5px #0002}.v123-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}.v123-perf{min-width:0;border:1px solid #dce5ee;background:#fff;border-radius:14px;padding:10px 7px;text-align:left}.v123-perf span{display:block;font-size:10px;font-weight:800;color:#667085}.v123-perf b{display:block;font-size:17px;margin-top:4px;color:#172033}@media(max-width:520px){.v123-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.v123-head{align-items:flex-start;flex-direction:column}}';document.head.appendChild(s);
})();

/* V106 ID001 FINAL AUTHORITY — one authoritative Supervisor assignment path. */
(function(){'use strict';
 const H='ID001',SAFE=2;
 const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const msg=(text,title='Ideal Time')=>typeof window.v74Msg==='function'?window.v74Msg(text,title):alert(text);
 const openHold=emp=>(state.assign||[]).find(a=>a&&a.job===H&&a.emp===emp&&!a.cancelled&&!a.completed)||null;
 const openNormal=emp=>(state.assign||[]).filter(a=>a&&a.job!==H&&a.emp===emp&&!a.cancelled&&!a.completed);
 const normalStatus=a=>{try{return empStatus(a)}catch(_){return a?.completed?'Finished':'New'}};
 const pausedOnly=emp=>{const rows=openNormal(emp);return rows.length>0&&rows.every(a=>normalStatus(a)==='Paused')};
 const closed=t=>typeof window.v75IsClosedWorkshopDay==='function'&&window.v75IsClosedWorkshopDay(t);
 const duty=t=>typeof window.v75IsID001DutyTime!=='function'||window.v75IsID001DutyTime(t);
 const leave=(emp,t)=>typeof window.v63IsOnLeave==='function'&&window.v63IsOnLeave(emp,t);
 const eligibleEmp=(emp,t=Date.now())=>!closed(t)&&duty(t)&&!leave(emp,t)&&!activeSession(emp)&&!openHold(emp)&&(openNormal(emp).length===0||pausedOnly(emp));
 window.v75IdealAvailableEmployees=()=> (users||[]).filter(u=>u&&u.role==='Employee'&&eligibleEmp(u.id));
 window.v755PausedOnlyNormal=pausedOnly;

 const previousAssign=window.assignJobCore;
 window.assignJobCore=function(no,emp,minutes){
   if(no!==H)return typeof previousAssign==='function'?previousAssign.apply(this,arguments):undefined;
   const m=Number(minutes),t=Date.now(),n=(user(emp)||{}).name||emp;
   if(!Number.isFinite(m)||m<1)return msg('Enter a valid allocated time for ID001.');
   if(closed(t))return msg('ID001 cannot be assigned on Friday or a Public Holiday.');
   if(!duty(t))return msg('ID001 can be assigned only during duty hours: 08:00–13:00 and 15:00–19:00.');
   if(leave(emp,t))return msg(n+' is on leave. ID001 cannot be assigned.');
   if(openHold(emp))return msg('ID001 is already assigned to '+n+'. Stop/complete it before assigning another.');
   if(activeSession(emp))return msg(n+' has an active running job. ID001 cannot be assigned.');
   if(openNormal(emp).some(a=>normalStatus(a)!=='Paused'))return msg(n+' has normal work available. ID001 is allowed only when normal work is paused and no other job is available.');
   state.assign=state.assign||[];
   const a={id:uid(),job:H,emp,suggested:m,completed:false,cancelled:false,rework:false,idealCard:true,idealSafeVersion:SAFE,assignedBy:me?.id||'SYSTEM',assignedAt:t,pausedJobFallback:pausedOnly(emp)};
   state.assign.push(a);
   if(typeof setLastAction==='function')setLastAction('Assigned ID001 to '+n+' for '+fmt(m));
   save();render();return a;
 };
 window.v75AssignIdealToAvailable=function(minutes,employeeIds){
   const m=Number(minutes),t=Date.now();
   if(!Number.isFinite(m)||m<1)return{ok:false,reason:'invalid_time',assigned:[]};
   if(closed(t))return{ok:false,reason:'holiday',assigned:[]};
   if(!duty(t))return{ok:false,reason:'outside_duty',assigned:[]};
   const wanted=Array.isArray(employeeIds)&&employeeIds.length?new Set(employeeIds.map(String)):null;
   const list=(users||[]).filter(u=>u&&u.role==='Employee'&&(!wanted||wanted.has(String(u.id)))&&eligibleEmp(u.id,t));
   if(!list.length)return{ok:false,reason:'none_available',assigned:[]};
   const created=[];
   for(const u of list){
     const a={id:uid(),job:H,emp:u.id,suggested:m,completed:false,cancelled:false,rework:false,idealCard:true,idealSafeVersion:SAFE,assignedBy:me?.id||'SYSTEM',assignedAt:t,pausedJobFallback:pausedOnly(u.id)};
     state.assign.push(a);created.push(a);
   }
   if(typeof setLastAction==='function')setLastAction('Assigned ID001 to '+created.length+' available staff');
   save();render();return{ok:true,assigned:created.map(a=>a.emp)};
 };

 window.v106OpenAssignID001=function(){
   if(!me||me.role!=='Supervisor')return;
   const people=window.v75IdealAvailableEmployees();
   if(!people.length)return msg('No employee is currently available for ID001. The employee must have no running job and either no normal work or only paused normal work.','Assign ID001');
   const opts=people.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.name)+' — '+esc(u.department||'')+'</option>').join('');
   const html='<div class="v74-d"><div class="section-title"><h2>◷ Assign ID001</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+
     '<div class="notice">Assign the common Ideal Time card to an available employee.</div>'+
     '<div class="grid"><label>Employee<br><select id="v106IdealEmp">'+opts+'</select></label>'+
     '<label>Allocated Time<br><input id="v106IdealTime" inputmode="decimal" value="1.00"><div class="time-hint">'+(typeof timeInputHint==='function'?timeInputHint():'Use H.MM or H:MM')+'</div></label></div>'+
     '<div class="v74-actions"><button class="blue big-action" onclick="v106ConfirmAssignID001()">ASSIGN ID001</button></div></div>';
   if(typeof openModal==='function')openModal(html);else showSupervisorModal('Assign ID001',html);
 };
 window.v106ConfirmAssignID001=function(){
   const emp=document.getElementById('v106IdealEmp')?.value,raw=document.getElementById('v106IdealTime')?.value||'';
   const mins=typeof parseWorkMinutes==='function'?parseWorkMinutes(raw):Number(raw);
   if(!emp)return;
   const before=!!openHold(emp),result=window.assignJobCore(H,emp,mins),after=openHold(emp);
   if(!before&&after){
     try{if(typeof closeModal==='function')closeModal()}catch(_){}
     msg('ID001 assigned successfully to '+((user(emp)||{}).name||emp)+'.','Assign ID001');
   }
   return result;
 };
 // Backward-compatible names: all Supervisor buttons now route to the same final authority.
 window.v105OpenAssignID001=window.v106OpenAssignID001;
 window.v105ConfirmAssignID001=window.v106ConfirmAssignID001;

 // V112 owns the Supervisor ID001 quick-action placement. Keep V106 assignment logic only.
 window.v106ID001FinalAuthority=true;
})();


/* V107 INCENTIVE FINAL AUTHORITY — one monthly calculation for Employee, Supervisor and Manager. */
(function(){'use strict';
 const HOLD='ID001',DAY=86400000;
 const monthBounds=(ts=Date.now())=>{const d=new Date(ts);return [new Date(d.getFullYear(),d.getMonth(),1).getTime(),new Date(d.getFullYear(),d.getMonth()+1,1).getTime()]};
 const key=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
 const isHoliday=t=>(new Date(t).getDay()===5)||(state.workshopHolidays||[]).some(h=>String(typeof h==='object'?(h.date||h.day||''):h)===key(t));
 const assignmentFor=s=>(state.assign||[]).find(a=>a&&a.id===s.assignmentId)||(state.assign||[]).find(a=>a&&!a.cancelled&&a.job===s.job&&a.emp===s.emp&&!!a.rework===!!s.rework);
 const clippedNormal=(s,from,to)=>{const st=Math.max(+s.start||0,from),en=Math.min(+s.end||Date.now(),to);if(en<=st)return 0;return typeof window.normalOverlapMinutes==='function'?Math.max(0,window.normalOverlapMinutes(st,en)):Math.max(0,(en-st)/60000)};
 const assignmentNormal=(a,from,to)=>(state.sessions||[]).filter(s=>s&&String(s.emp)===String(a.emp)&&(s.assignmentId===a.id||(!s.assignmentId&&s.job===a.job&&!!s.rework===!!a.rework))&&(+s.start||0)<to&&(+s.end||Date.now())>from).reduce((n,s)=>n+clippedNormal(s,from,to),0);
 const targetFor=(emp,from,to)=>{
   let target=0,workDays=0,cleaningAllowance=0;
   for(let cur=from;cur<to;cur+=DAY){
     if(isHoliday(cur))continue;
     const leave=typeof window.v63LeaveOverlapMinutes==='function'?Math.max(0,window.v63LeaveOverlapMinutes(emp,cur,cur+DAY)||0):0;
     const dutyAfterLeave=Math.max(0,540-leave);
     if(dutyAfterLeave<=0)continue;
     workDays++;cleaningAllowance+=15;target+=Math.max(0,dutyAfterLeave-15);
   }
   return {target,workDays,cleaningAllowance};
 };
 const achievementFor=(a,from,to)=>{
   const current=assignmentNormal(a,from,to);
   if(current<=0)return {achieved:0,excess:0,actual:0};
   if(a.job===HOLD)return {achieved:0,excess:0,actual:current};
   const prior=assignmentNormal(a,0,from);
   const suggested=Math.max(0,+a.suggested||0);
   const remainingAtStart=Math.max(0,suggested-prior);
   const completedInPeriod=!!a.completed&&(+a.completedAt||to-1)>=from&&(+a.completedAt||to-1)<to;
   if(!completedInPeriod)return {achieved:current,excess:Math.max(0,current-remainingAtStart),actual:current};
   const excess=Math.max(0,current-remainingAtStart);
   return {achieved:Math.max(0,remainingAtStart-excess),excess,actual:current};
 };
 window.incentiveFor=function(emp,ts=Date.now()){
   const [from,to]=monthBounds(ts),t=targetFor(emp,from,to);
   let achieved=0,excess=0,actual=0;
   const assignments=(state.assign||[]).filter(a=>a&&!a.cancelled&&String(a.emp)===String(emp));
   for(const a of assignments){
     if(a.rework){
       // Repeat employee earns achievement only when correcting another employee's mistake.
       if(String(a.mistakeEmp||a.emp)!==String(emp)){const x=achievementFor(a,from,to);achieved+=x.achieved;excess+=x.excess;actual+=x.actual}
       continue;
     }
     const x=achievementFor(a,from,to);achieved+=x.achieved;excess+=x.excess;actual+=x.actual;
   }
   // Repeat penalty belongs to the Mistake Employee and always uses ACTUAL normal-duty repeat time.
   let repeat=0;
   for(const a of (state.assign||[]).filter(a=>a&&!a.cancelled&&a.rework&&String(a.mistakeEmp||a.emp)===String(emp)))repeat+=assignmentNormal(a,from,to);
   const incentive=Math.max(0,achieved-t.target-repeat);
   return {target:t.target,actual,eligible:achieved,achieved,excess,repeat,incentive,workDays:t.workDays,cleaningAllowance:t.cleaningAllowance};
 };
 window.v107AssignmentNormal=assignmentNormal;
 window.v107AchievementFor=achievementFor;
 window.v107IncentiveFinalAuthority=true;
})();


/* V108 retired: V111 is the single Employee monthly metrics UI authority. */

/* V110 REPORT ACTIONS — every print entry gets Print, Share PDF and Close. */
(function(){'use strict';
 let reportHtml='',reportName='Zukait_Report.pdf';
 window.v110ReportActions=function(html,name){
   reportHtml=String(html||'');reportName=String(name||'Zukait_Report.pdf');
   const body='<div class="section-title"><h2>Report Options</h2><button class="secondary" onclick="closeModal()">✕ CLOSE</button></div>'+
   '<div class="notice"><b>Choose what you want to do with this report.</b></div>'+
   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px"><button class="blue" onclick="v110PrintReport()">🖨 PRINT</button><button class="green" onclick="v110ShareReport()">📄 SHARE PDF / WHATSAPP</button></div>'+
   '<button class="secondary" style="width:100%;margin-top:10px" onclick="closeModal()">← BACK / CLOSE</button>';
   if(typeof openModal==='function')openModal(body);else if(typeof showSupervisorModal==='function')showSupervisorModal('Report Options',body);
 };
 window.v110PrintReport=function(){try{if(window.AndroidBridge&&typeof AndroidBridge.printHtml==='function'){AndroidBridge.printHtml(reportHtml);return}}catch(_){}const w=window.open('','_blank');if(w){w.document.write(reportHtml);w.document.close();setTimeout(()=>w.print(),250)}};
 window.v110ShareReport=function(){try{if(window.AndroidBridge&&typeof AndroidBridge.shareHtmlAsPdf==='function'){AndroidBridge.shareHtmlAsPdf(reportHtml,reportName);return}}catch(_){}alert('PDF sharing is available in the Android app.')};
 window.v110ReportActionsReady=true;
})();

/* V111 EMPLOYEE PERFORMANCE + SUPERVISOR PAINT + VEHICLE RECOGNITION UI */
(function(){'use strict';
 const style=document.createElement('style');style.id='v111PerformanceUI';style.textContent=
 '.v75s .month-summary .v104-month-progress{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;margin:12px 0 16px!important}'+
 '.v75s .month-summary .v104-progress{border-radius:18px!important;min-height:92px!important;padding:14px 10px!important;display:flex!important;flex-direction:column!important;justify-content:center!important;box-sizing:border-box!important}'+
 '.v75s .month-summary .v104-progress span{font-size:10px!important;letter-spacing:.055em!important;white-space:normal!important}'+
 '.v75s .month-summary .v104-progress b{font-size:24px!important;line-height:1.08!important;margin-top:7px!important;white-space:normal!important}'+
 '.v111-metric-icon{font-size:21px!important;line-height:1!important;margin-bottom:5px!important}'+
 '@media(max-width:380px){.v75s .month-summary .v104-month-progress{gap:9px!important}.v75s .month-summary .v104-progress{min-height:84px!important;padding:11px 7px!important}.v75s .month-summary .v104-progress b{font-size:20px!important}}';
 document.head.appendChild(style);
 const previousRender=window.render;
 window.render=function(){const out=typeof previousRender==='function'?previousRender.apply(this,arguments):undefined;setTimeout(()=>{if(!me||me.role!=='Employee')return;const row=document.querySelector('#employeeView .v104-month-progress');if(!row)return;const x=typeof window.incentiveFor==='function'?window.incentiveFor(me.id):null;if(!x)return;const values=[['target','🎯','TARGET HOURS',x.target],['achieved','🏆','ACHIEVED HOURS',x.achieved??x.eligible],['excess','⏱','EXCESS HOURS',x.excess],['incentive','⭐','INCENTIVE',x.incentive]];row.innerHTML=values.map(v=>'<div class="v104-progress '+v[0]+'"><i class="v111-metric-icon">'+v[1]+'</i><span>'+v[2]+'</span><b>'+fmt(Math.max(0,+v[3]||0))+'</b></div>').join('')},0);return out};
 window.v111PerformanceUI=true;
})();


/* V117 EMPLOYEE ACHIEVED / INCENTIVE PROGRESS — left-to-right fill and read-only detail windows. */
(function(){'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const fm=v=>typeof window.fmt==='function'?window.fmt(Math.max(0,+v||0)):((Math.floor((+v||0)/60))+'h '+String(Math.round((+v||0)%60)).padStart(2,'0')+'m');
 const css=document.createElement('style');css.textContent=
 '#employeeView .v104-progress.v117-fill{position:relative!important;overflow:hidden!important;isolation:isolate;cursor:pointer!important}'+
 '#employeeView .v104-progress.v117-fill:before{content:"";position:absolute;z-index:-1;left:0;top:0;bottom:0;width:var(--v117-fill,0%);transition:width .65s ease;border-radius:inherit;pointer-events:none}'+
 '#employeeView .v104-progress.achieved.v117-fill:before{background:rgba(34,197,94,.24)}'+
 '#employeeView .v104-progress.incentive.v117-fill:before{background:rgba(250,204,21,.28)}'+
 '#employeeView .v104-progress.v117-fill span,#employeeView .v104-progress.v117-fill b,#employeeView .v104-progress.v117-fill i{position:relative;z-index:1}';
 document.head.appendChild(css);
 function current(){return me&&typeof window.incentiveFor==='function'?window.incentiveFor(me.id):null}
 window.v117OpenAchievedDetails=function(){
   const x=current();if(!x)return;
   const now=new Date(),mf=new Date(now.getFullYear(),now.getMonth(),1).getTime(),mt=new Date(now.getFullYear(),now.getMonth()+1,1).getTime();
   const rows=(state.assign||[]).filter(a=>a&&!a.cancelled&&String(a.emp)===String(me.id)&&((a.assignedAt||a.completedAt||0)<mt)&&((a.completedAt||Date.now())>=mf)).map(a=>{
     const normal=typeof window.v107AssignmentNormal==='function'?window.v107AssignmentNormal(a,mf,mt):(typeof actual==='function'?actual(a):0);
     const metric=typeof window.v107AchievementFor==='function'?window.v107AchievementFor(a,mf,mt):null;let achieved=metric?metric.achieved:(a.job==='ID001'?0:(a.completedAt?Math.max(0,Math.min(Math.max(0,+a.suggested||0),2*Math.max(0,+a.suggested||0)-normal)):Math.max(0,normal)));
     return {a,normal,achieved};
   }).filter(r=>r.achieved>0);
   const body='<div class="section-title"><h2>🏆 Achieved Hours</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+
    '<div class="notice"><b>Target: '+fm(x.target)+'</b> &nbsp; Achieved: <b>'+fm(x.achieved??x.eligible)+'</b></div>'+
    (rows.length?'<div style="overflow:auto"><table><tr><th>Job Card</th><th>Suggested</th><th>Actual Normal</th><th>Achieved</th></tr>'+rows.map(r=>'<tr><td><b>'+esc(r.a.job)+'</b></td><td>'+fm(r.a.suggested)+'</td><td>'+fm(r.normal)+'</td><td><b>'+fm(r.achieved)+'</b></td></tr>').join('')+'</table></div>':'<div class="notice">No achieved-hour entries this month.</div>');
   if(typeof openModal==='function')openModal(body);
 };
 window.v117OpenIncentiveDetails=function(){
   const x=current();if(!x)return;
   const grossOver=Math.max(0,(+(x.achieved??x.eligible)||0)-(+x.target||0)),penalty=Math.max(0,+x.repeat||0),over=Math.max(0,grossOver-penalty);
   const body='<div class="section-title"><h2>⭐ Incentive Hours</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+
    '<div class="report-summary"><div class="notice"><b>Target</b><br>'+fm(x.target)+'</div><div class="notice"><b>Achieved</b><br>'+fm(x.achieved??x.eligible)+'</div><div class="notice"><b>Beyond Target After Repeat Penalty</b><br>'+fm(over)+'</div><div class="notice"><b>Repeat Penalty</b><br>'+fm(penalty)+'</div><div class="notice"><b>Incentive</b><br>'+fm(x.incentive)+'</div></div>';
   if(typeof openModal==='function')openModal(body);
 };
 function apply(){
   if(!me||me.role!=='Employee')return;const row=document.querySelector('#employeeView .v104-month-progress');if(!row)return;const x=current();if(!x)return;
   const achieved=Math.max(0,+(x.achieved??x.eligible)||0),target=Math.max(0,+x.target||0),inc=Math.max(0,+x.incentive||0);
   const ap=target>0?Math.min(100,achieved/target*100):0;
   const ip=achieved>target&&inc>0&&target>0?Math.min(100,inc/target*100):0;
   const ac=row.querySelector('.achieved'),ic=row.querySelector('.incentive');
   if(ac){ac.classList.add('v117-fill');ac.style.setProperty('--v117-fill',ap.toFixed(2)+'%');ac.onclick=window.v117OpenAchievedDetails;ac.title='Tap to view achieved-hour details'}
   if(ic){ic.classList.add('v117-fill');ic.style.setProperty('--v117-fill',ip.toFixed(2)+'%');ic.onclick=window.v117OpenIncentiveDetails;ic.title='Tap to view incentive-hour details'}
 }
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(apply,0);return r};
 window.v117EmployeeProgressDetails=true;
})();

/* V115 SUPERVISOR INCENTIVE WINDOW — authoritative click target and monthly staff detail. */
(function(){'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const fm=v=>typeof window.fmt==='function'?window.fmt(Math.max(0,+v||0)):((Math.floor((+v||0)/60))+'h '+String(Math.round((+v||0)%60)).padStart(2,'0')+'m');
 window.openIncentiveList=function(){
   if(!me||me.role!=='Supervisor')return;
   const rows=(users||[]).filter(u=>u&&u.role==='Employee').map(u=>{const x=typeof window.incentiveFor==='function'?window.incentiveFor(u.id):{target:0,achieved:0,excess:0,repeat:0,incentive:0};return {u,x}}).sort((a,b)=>String(a.u.name||'').localeCompare(String(b.u.name||'')));
   const body='<div class="section-title"><h2>⭐ Monthly Incentive</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+
    '<div style="overflow:auto"><table><tr><th>Employee</th><th>Target</th><th>Achieved</th><th>Excess</th><th>Repeat Penalty</th><th>Incentive</th></tr>'+
    rows.map(r=>'<tr><td><b>'+esc(r.u.name||r.u.id)+'</b><br><span class="small">'+esc(r.u.department||'')+'</span></td><td>'+fm(r.x.target)+'</td><td>'+fm(r.x.achieved??r.x.eligible)+'</td><td>'+fm(r.x.excess)+'</td><td>'+fm(r.x.repeat)+'</td><td><b>'+fm(r.x.incentive)+'</b></td></tr>').join('')+'</table></div>';
   if(typeof openModal==='function')return openModal(body);
   if(typeof showSupervisorModal==='function')return showSupervisorModal('Monthly Incentive',body);
 };
 window.v115SupervisorIncentiveWindow=true;
})();

/* V116 SUPERVISOR HEADER AUTHORITY — one fixed identity/online row, never floating or duplicated. */
(function(){'use strict';
 const apply=()=>{
   if(!me||me.role!=='Supervisor')return;
   const root=document.getElementById('supervisorView');if(!root)return;
   const rows=[...root.querySelectorAll('.v91-role-identity')];
   let row=rows.shift()||null;rows.forEach(x=>x.remove());
   if(!row&&typeof window.v91RoleHeader==='function'){try{window.v91RoleHeader('Supervisor')}catch(_){}} 
   row=root.querySelector('.v91-role-identity');if(!row)return;
   row.classList.add('v116-supervisor-header');
   row.style.position='static';row.style.inset='auto';row.style.transform='none';row.style.zIndex='auto';
   const top=root.querySelector('.v92-supervisor-top');if(top&&row.nextElementSibling!==top)root.insertBefore(row,top);
   const gh=document.getElementById('globalBrandHeader');if(gh)gh.style.setProperty('display','none','important');
   const net=document.getElementById('net');if(net)net.style.setProperty('display','none','important');
   const hos=document.getElementById('headerOnlineStatus');if(hos)hos.style.setProperty('display','none','important');
   root.querySelectorAll('.header-online-status').forEach(x=>x.style.setProperty('display','none','important'));
 };
 const s=document.createElement('style');s.textContent='#supervisorView .v116-supervisor-header{position:static!important;top:auto!important;right:auto!important;bottom:auto!important;left:auto!important;transform:none!important;width:auto!important;margin:0 0 10px!important;z-index:auto!important;box-shadow:none!important}';document.head.appendChild(s);
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(apply,0);return r};
 window.v116SupervisorHeaderAuthority=true;
})();

/* V113 NORMAL ASSIGNMENT SAFETY — neutral Technician placeholder must never create a blank employee assignment. */
(function(){'use strict';
 const H='ID001',previous=window.assignJobCore;
 window.assignJobCore=function(no,emp,minutes){
   if(no!==H&&!String(emp||'').trim()){
     const msg='Select a technician before assigning the Job Card.';
     return typeof window.v74Msg==='function'?window.v74Msg(msg,'Assign Job Card'):alert(msg);
   }
   return typeof previous==='function'?previous.apply(this,arguments):undefined;
 };
 window.v113NormalAssignmentEmployeeGuard=true;
})();

/* V112 Supervisor assignment UX authority */
(function(){
 'use strict';
 const HOLD='ID001';
 const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 function techPlaceholder(sel){
   if(!sel)return;
   let p=Array.from(sel.options).find(o=>o.value==='');
   if(!p){p=document.createElement('option');p.value='';p.textContent='Technicians';sel.insertBefore(p,sel.firstChild)}
   p.textContent='Technicians';p.disabled=true;p.selected=true;sel.value='';
 }
 function normalJobSelect(sel){
   if(!sel)return;
   Array.from(sel.options).forEach(o=>{if(String(o.value||o.textContent).trim().toUpperCase()===HOLD)o.remove()});
 }
 window.v112OpenID001Quick=function(){
   let eligible=typeof window.v75IdealAvailableEmployees==='function'?window.v75IdealAvailableEmployees():(users||[]).filter(u=>u&&u.role==='Employee');
   let opts='<option value="" selected disabled>Select Technician</option>'+eligible.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.name)+' · '+esc(u.department||'Technician')+'</option>').join('');
   let body='<div class="v74-d v112-id001-dialog"><h2>◷ ID001 · IDEAL TIME</h2><div class="notice">Assign common Ideal Time quickly.</div><label>Assign Staff<br><select id="v112IdealEmp" class="tech-select">'+opts+'</select></label><label>Time<br><input id="v112IdealTime" inputmode="decimal" placeholder="H.MM or H:MM"><div class="time-hint">Example: 1.30 or 1:30</div></label><div class="v74-actions"><button class="secondary" onclick="closeModal()">CANCEL</button><button class="blue" onclick="v112AssignID001()">ASSIGN</button></div></div>';
   openModal(body);
 };
 window.v112AssignID001=function(){
   let emp=document.getElementById('v112IdealEmp')?.value||'',raw=document.getElementById('v112IdealTime')?.value||'';
   let mins=typeof parseWorkMinutes==='function'?parseWorkMinutes(raw):NaN;
   if(!emp)return typeof window.v74Msg==='function'?window.v74Msg('Select a technician.','ID001 Ideal Time'):alert('Select a technician.');
   if(!Number.isFinite(mins)||mins<1)return typeof window.v74Msg==='function'?window.v74Msg('Enter a valid time.','ID001 Ideal Time'):alert('Enter a valid time.');
   window.assignJobCore(HOLD,emp,mins);
   try{closeModal()}catch(_){}
 };
 function apply(){
   if(!me||me.role!=='Supervisor')return;
   const root=document.getElementById('supervisorView');if(!root)return;
   techPlaceholder(root.querySelector('#se'));techPlaceholder(root.querySelector('#se2'));
   normalJobSelect(root.querySelector('#sj'));
   const cards=[...root.querySelectorAll('.card')];
   const assign=cards.find(x=>/Assign\s*\/\s*Update Job Card/i.test(x.querySelector('h3')?.textContent||''));
   if(!assign)return;
   let grid=assign.querySelector('.v112-assign-grid');
   if(!grid){
     grid=document.createElement('div');grid.className='v112-assign-grid';
     const movable=[...assign.children].filter(x=>x.tagName!=='H3'&&!x.classList.contains('section-title'));
     movable.forEach(x=>grid.appendChild(x));assign.appendChild(grid);
   }
   // Keep ID001 as its own prominent control, never inside Assign / Update Job Card.
   grid.querySelectorAll('#v112ID001Quick').forEach(x=>x.remove());
   let box=root.querySelector('#v109ID001Standalone');
   if(!box){box=document.createElement('section');box.id='v109ID001Standalone';box.className='card v109-id001-standalone';box.innerHTML='<button id="v109ID001Button" type="button"><b>◷ ID001</b><span>IDEAL TIME</span><small>ASSIGN ID001</small></button>';const btn=box.querySelector('button');btn.onclick=window.v112OpenID001Quick;assign.insertAdjacentElement('afterend',box)}
 }
 const style=document.createElement('style');
 style.textContent='.v113-spray{display:inline-flex;align-items:center;gap:1px;font-size:17px;transform:rotate(-8deg)}.v113-spray i{font-style:normal;font-size:10px;letter-spacing:-1px}#supervisorView .quick-entry{position:relative}.v112-assign-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;align-items:stretch}.v109-id001-standalone{padding:10px!important}.v109-id001-standalone #v109ID001Button{width:100%;min-height:96px;margin:0;padding:14px 18px;border:1px solid rgba(80,140,255,.40);border-radius:15px;background:rgba(80,140,255,.12);color:#163b68;cursor:pointer;text-align:center}.v109-id001-standalone #v109ID001Button b,.v109-id001-standalone #v109ID001Button span,.v109-id001-standalone #v109ID001Button small{display:block}.v109-id001-standalone #v109ID001Button b{font-size:24px;font-weight:950;line-height:1.1}.v109-id001-standalone #v109ID001Button span{font-size:14px;font-weight:900;letter-spacing:.8px;margin-top:5px}.v109-id001-standalone #v109ID001Button small{font-size:11px;font-weight:800;margin-top:5px;opacity:.78}.v112-id001-dialog label{display:block;margin-top:12px}';
 document.head.appendChild(style);
 const prior=window.render;
 window.render=function(){const r=typeof prior==='function'?prior.apply(this,arguments):undefined;setTimeout(apply,0);return r};
 setTimeout(apply,0);
 window.v112SupervisorAssignmentUX=true;
})();


/* V119 SUPERVISOR UI AUTHORITY — final mobile layout, no duplicate controls. */
(function(){'use strict';
 window.v119OpenAssignedJobs=function(){const el=document.getElementById('assignedRows');if(typeof window.openSupervisorAssignedWindow==='function')return window.openSupervisorAssignedWindow();if(el){el.scrollIntoView({behavior:'smooth',block:'start'});return}if(typeof window.openSupervisorJobCardList==='function')return window.openSupervisorJobCardList()};
 window.assignJobExisting=function(){const no=document.getElementById('sj')?.value?.trim()?.toUpperCase()||'',emp=document.getElementById('se2')?.value||'',s=typeof parseWorkMinutes==='function'?parseWorkMinutes(document.getElementById('st2')?.value||''):NaN;if(!no||!job(no))return alert('Select a valid Job Card.');if(!emp||!user(emp)||user(emp).role!=='Employee')return alert('Select a valid technician.');if(!Number.isFinite(s)||s<1)return alert('Enter valid allocated time.');return window.assignJobCore(no,emp,s)};
 const baseAssignCore=window.assignJobCore;window.assignJobCore=function(no,emp,s){no=String(no||'').trim().toUpperCase();emp=String(emp||'').trim();if(no==='ID001')return typeof baseAssignCore==='function'?baseAssignCore(no,emp,s):undefined;if(!no||!job(no))return alert('Select a valid Job Card.');const u=user(emp);if(!emp||!u||u.role!=='Employee')return alert('Select a valid technician.');if(!Number.isFinite(s)||s<1)return alert('Enter valid allocated time.');return typeof baseAssignCore==='function'?baseAssignCore(no,emp,s):undefined};
 const baseCreate=window.createAndAssignJob;window.createAndAssignJob=function(){const no=document.getElementById('newNo')?.value.trim().toUpperCase()||'',v=document.getElementById('newVehicle')?.value.trim()||'',year=document.getElementById('newYear')?.value.trim()||'',reg=document.getElementById('newReg')?.value.trim().toUpperCase()||'',emp=document.getElementById('se')?.value||'',s=typeof parseWorkMinutes==='function'?parseWorkMinutes(document.getElementById('st')?.value||''):NaN;if(!no||!v||!year||!reg||!emp||!user(emp)||user(emp).role!=='Employee'||!Number.isFinite(s)||s<1)return alert('Enter Job Card, Make / Model, Vehicle Year, Registration Number, technician and valid time.');if(!/^\\d{4}$/.test(year))return alert('Enter a valid 4-digit Vehicle Year.');if(job(no))return alert('Job Card Number already exists.');const detectedBrand=(window.v131VehicleBrandAuthority&&typeof window.v131VehicleBrandAuthority.infer==='function')?window.v131VehicleBrandAuthority.infer(v):'';state.jobs.push({no,vehicle:v,year:year,reg:reg,brand:detectedBrand,status:'Open',createdBy:me.id,createdAt:now()});const a=window.assignJobCore(no,emp,s);if(!a){state.jobs=state.jobs.filter(j=>j&&j.no!==no);return}setLastAction('Created and assigned '+no+' to '+user(emp).name);save();render()};
 function apply(){
  if(!me||me.role!=='Supervisor')return;
  const root=document.getElementById('supervisorView');if(!root)return;root.dataset.supervisorUi='v119-authoritative';const legacyID=root.querySelector('#v753ID001Dashboard');if(legacyID)legacyID.remove();
  [...root.querySelectorAll('.v91-role-identity')].slice(1).forEach(x=>x.remove());
  const top=root.querySelector('.v92-supervisor-top');if(top){[...top.children].slice(2).forEach(x=>x.remove());const inc=top.querySelector('.v104-incentive-top,.v92-available-card,.v118-incentive');if(inc){inc.classList.add('v119-incentive');inc.innerHTML='<span class="v92-top-icon">⭐</span><span><b>INCENTIVE</b><small>Target · Achieved · Incentive</small></span><strong>›</strong>';inc.onclick=()=>window.openIncentiveList()}}
  const quick=root.querySelector('.quick-entry');if(quick){quick.querySelectorAll('p.muted,.time-hint').forEach(x=>x.remove());const g=quick.querySelector('.grid');if(g){g.classList.add('v119-grid');const no=g.querySelector('#newNo')?.closest('label'),veh=g.querySelector('#newVehicle')?.closest('label'),reg=g.querySelector('#newReg')?.closest('label'),tech=g.querySelector('#se')?.closest('label'),time=g.querySelector('#st')?.closest('label');let year=g.querySelector('#newYear')?.closest('label');if(!year&&veh){year=document.createElement('label');year.className='v109-vehicle-year';year.innerHTML='📅 Vehicle Year <br><input id="newYear" inputmode="numeric" maxlength="4" placeholder="YYYY">';veh.insertAdjacentElement('afterend',year)}const a=[no,veh,year,reg,tech,time,quick.querySelector('.v107-create-assign,button[onclick*="createAndAssignJob"]')].filter(Boolean);const names=['📋 Job Card ','🚗 Vehicle / Make ','📅 Vehicle Year ','🔢 Registration Number ','👨‍🔧 Technician ','⏱ Time '];a.slice(0,6).forEach((x,n)=>{x.childNodes[0].textContent=names[n]});if(a[6]){a[6].classList.add('v119-primary');a[6].innerHTML='✓ Create Job + Assign'}a.forEach(x=>g.appendChild(x))}}
  const assign=[...root.querySelectorAll('.card')].find(x=>/Assign\s*\/\s*Update Job Card/i.test(x.querySelector('h3')?.textContent||''));if(assign){assign.classList.add('v119-assign');assign.querySelectorAll('p.muted,.time-hint').forEach(x=>x.remove());let g=assign.querySelector('.v112-assign-grid,.grid');if(g){g.classList.add('v119-grid');const j=g.querySelector('#sj')?.closest('label'),t=g.querySelector('#se2')?.closest('label'),tm=g.querySelector('#st2')?.closest('label'),b=assign.querySelector('.v107-assign,button[onclick*="assignJobExisting"]');if(j)j.childNodes[0].textContent='🔎 Job Card Search ';if(t)t.childNodes[0].textContent='👨‍🔧 Technician ';if(tm)tm.childNodes[0].textContent='⏱ Allocated Time ';if(b){b.classList.add('v119-primary');b.innerHTML='✓ Assign / Update'}g.querySelectorAll('#v112ID001Quick,#v119ID001History').forEach(x=>x.remove());[j,t,tm,b].filter(Boolean).forEach(x=>g.appendChild(x))}}
  root.querySelectorAll('.v118-action-grid,.v84-action-grid').forEach(x=>x.remove());let old=[...root.querySelectorAll('details.card')].find(x=>/Additional Action History/i.test(x.textContent||''));if(old)old.remove();let s=root.querySelector('#v119Actions');if(!s){s=document.createElement('section');s.id='v119Actions';s.className='card v119-actions'}const glance=[...root.querySelectorAll('.card')].find(x=>/Today at a Glance/i.test(x.querySelector('h3')?.textContent||''));if(glance&&glance.parentNode){if(glance.previousElementSibling!==s)glance.parentNode.insertBefore(s,glance)}else if(!s.isConnected)root.appendChild(s);s.innerHTML='<div class="v119-actions-grid"><button onclick="openSupervisorJobCardList()">📋<b>Job Card List</b><small>View job card details</small></button><button onclick="v119OpenAssignedJobs()">🗂<b>Assigned Job Cards</b><small>View active assignments</small></button><button onclick="manualAdditionalTime()">⏱<b>Additional Time</b><small>Add allocated time</small></button></div><button class="v119-history-open" onclick="v109OpenAdditionalActionHistory()"><span>🕘</span><b>Additional Action History</b><small>Time changes · Employee changes · Reopen · Repeat Work</small><strong>›</strong></button>';
  [...root.querySelectorAll('.card')].filter(x=>x!==s&&/^(Job Card Details|Assigned Job Cards|Additional Time)$/i.test((x.querySelector('h3')?.textContent||'').trim())).forEach(x=>x.remove());
 }
 const s=document.createElement('style');s.id='v119SupervisorStyle';s.textContent='#supervisorView .v119-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:11px!important;align-items:stretch!important}#supervisorView .v119-grid>*{min-width:0!important;width:100%!important;box-sizing:border-box!important;margin:0!important}#supervisorView .v119-grid label{font-size:12px!important;font-weight:850!important;color:#26384b!important}#supervisorView .v119-grid input,#supervisorView .v119-grid select{width:100%!important;min-height:45px!important;margin-top:5px!important;border-radius:11px!important;background:#fff!important}#supervisorView .v119-primary{min-height:68px!important;border-radius:13px!important;font-weight:900!important;font-size:13px!important;align-self:end!important;background:linear-gradient(135deg,#2563eb,#1747a6)!important;box-shadow:0 6px 14px #2563eb33!important}#supervisorView .v119-id{min-height:76px!important;border-radius:13px!important;border:1px solid #b9d2f2!important;background:linear-gradient(145deg,#f2f8ff,#e6f1ff)!important;color:#163b68!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:3px!important}#supervisorView .v119-id b{font-size:13px!important}#supervisorView .v119-id small{font-size:9px!important;opacity:.72!important}#supervisorView .v119-incentive b{font-size:13px!important}#supervisorView .v119-actions{padding:14px!important;border-radius:16px!important}#supervisorView .v119-history-open{width:100%!important;min-height:62px!important;margin:12px 0 0!important;padding:10px 12px!important;border-radius:13px!important;border:1px solid #dce5ee!important;background:#f8fafc!important;color:#23354a!important;display:grid!important;grid-template-columns:auto 1fr auto!important;grid-template-rows:auto auto!important;column-gap:9px!important;text-align:left!important;align-items:center!important}#supervisorView .v119-history-open>span{grid-row:1/3!important;font-size:21px!important}#supervisorView .v119-history-open>b{font-size:13px!important;font-weight:950!important}#supervisorView .v119-history-open>small{font-size:9px!important;font-weight:700!important;opacity:.72!important}#supervisorView .v119-history-open>strong{grid-column:3!important;grid-row:1/3!important;font-size:20px!important}#supervisorView .v119-actions-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:9px!important}#supervisorView .v119-actions-grid button{min-width:0!important;min-height:112px!important;margin:0!important;padding:12px 7px!important;border-radius:14px!important;background:#f8fafc!important;color:#23354a!important;border:1px solid #dce5ee!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:7px!important;font-size:25px!important;font-weight:900!important}#supervisorView .v119-actions-grid b{font-size:13px!important;line-height:1.2!important;font-weight:950!important;text-align:center!important}#supervisorView .v119-actions-grid small{font-size:10px!important;line-height:1.25!important;font-weight:700!important;opacity:.78!important;text-align:center!important}@media(max-width:370px){#supervisorView .v119-grid{gap:8px!important}#supervisorView .v119-actions-grid{gap:6px!important}}';document.head.appendChild(s);
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(apply,0);return r};setTimeout(apply,0);window.v119SupervisorUIAuthority=true;
})();

/* V109 SUPERVISOR ADDITIONAL ACTION HISTORY — unified audit viewer. */
(function(){'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const uname=id=>{try{return (user(id)||{}).name||id||'—'}catch(_){return id||'—'}};
 const stamp=t=>{try{return new Date(+t||Date.now()).toLocaleString()}catch(_){return'—'}};
 const ftime=m=>{try{return typeof fmt==='function'?fmt(+m||0):Math.round(+m||0)+' min'}catch(_){return Math.round(+m||0)+' min'}};
 window.v109OpenAdditionalActionHistory=function(){
  if(!me||me.role!=='Supervisor')return;
  const rows=[];
  (state.additionalActions||[]).forEach(x=>rows.push({at:x.at,type:x.type||'Additional Time',job:x.job,emp:x.emp,detail:(x.minutes?'Added '+ftime(x.minutes):'Time updated')+(x.source?' · '+x.source:''),by:x.by}));
  (state.suggestedEdits||[]).forEach(x=>{if(String(x.source||'').toLowerCase().includes('additional'))return;rows.push({at:x.at,type:'Allocated Time Changed',job:x.job,emp:x.emp,detail:ftime(x.old)+' → '+ftime(x.newValue),by:x.by})});
  (state.reopenLogs||[]).forEach(x=>rows.push({at:x.at,type:'Job Reopened',job:x.job,emp:x.emp,detail:'Same assignment reopened · Allocated '+ftime(x.suggested),by:x.by}));
  (state.reworkLogs||[]).forEach(x=>rows.push({at:x.at,type:'Repeat Work',job:x.job,emp:x.emp,detail:'Repeat employee: '+uname(x.emp)+' · Mistake employee: '+uname(x.mistakeEmp)+(x.reason?' · '+x.reason:''),by:x.by}));
  (state.reassignLogs||state.employeeChangeLogs||[]).forEach(x=>rows.push({at:x.at||x.changedAt,type:'Employee Changed',job:x.job||x.jobNo,emp:x.newEmp||x.emp,detail:'Employee changed'+(x.oldEmp?' from '+uname(x.oldEmp):'')+(x.newEmp?' to '+uname(x.newEmp):''),by:x.by||x.changedBy}));
  rows.sort((a,b)=>(+b.at||0)-(+a.at||0));
  const body=rows.length?'<div class="v109-history-list">'+rows.map(x=>'<div class="v109-history-row"><div><b>'+esc(x.type)+'</b><small>'+esc(stamp(x.at))+'</small></div><div><strong>'+esc(x.job||'—')+'</strong><span>'+esc(uname(x.emp))+'</span></div><p>'+esc(x.detail||'')+'</p><small>Supervisor: '+esc(uname(x.by))+'</small></div>').join('')+'</div>':'<div class="notice">No additional supervisor actions recorded yet.</div>';
  const html='<div class="section-title"><h2>🕘 Additional Action History</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="notice">Additional time, allocated-time changes, employee changes, reopened work and Repeat Work are shown here.</div>'+body;
  if(typeof openModal==='function')return openModal(html);
  if(typeof showSupervisorModal==='function')return showSupervisorModal('Additional Action History',html);
 };
 const s=document.createElement('style');s.id='v109AdditionalHistoryStyle';s.textContent='.v109-history-list{display:grid;gap:9px}.v109-history-row{padding:11px;border:1px solid #dce5ee;border-radius:13px;background:#f8fafc}.v109-history-row>div{display:flex;justify-content:space-between;gap:10px}.v109-history-row b{font-size:13px}.v109-history-row strong{font-size:12px}.v109-history-row span,.v109-history-row small{font-size:10px;color:#62748a}.v109-history-row p{margin:7px 0;font-size:11px;line-height:1.35;color:#34485d}';document.head.appendChild(s);
 window.v109AdditionalActionHistory=true;
})();

/* V126 ASSIGN / UPDATE UI AUTHORITY — exact agreed 3x2 supervisor layout. */
(function(){'use strict';
 function apply(){
  if(!me||me.role!=='Supervisor')return;
  const root=document.getElementById('supervisorView');if(!root)return;
  const assign=[...root.querySelectorAll('.card')].find(x=>/Assign\s*\/\s*Update Job Card/i.test(x.querySelector('h3')?.textContent||''));if(!assign)return;
  assign.classList.add('v126-assign-authority');
  let g=assign.querySelector('.v112-assign-grid,.grid');if(!g)return;
  g.classList.add('v126-assign-grid');
  const j=g.querySelector('#sj')?.closest('label'),t=g.querySelector('#se2')?.closest('label'),tm=g.querySelector('#st2')?.closest('label');
  const b=assign.querySelector('.v107-assign,button[onclick*="assignJobExisting"]');
  // ID001/default-job controls do not belong inside Assign / Update Job Card.
  g.querySelectorAll('#v112ID001Quick,#v119ID001History,.v126-id001-assign,.v126-id001-history').forEach(x=>x.remove());
  if(j){j.classList.add('v126-job');j.childNodes[0].textContent='🔎 Job Card Search '}
  if(t){t.classList.add('v126-tech');t.childNodes[0].textContent='👨‍🔧 Technician '}
  if(tm){tm.classList.add('v126-time');tm.childNodes[0].textContent='⏱ Allocated Time '}
  if(b){b.classList.add('v119-primary','v126-assign-button');b.innerHTML='✓ Assign / Update'}
  [j,t,tm,b].filter(Boolean).forEach(x=>g.appendChild(x));
 }
 const s=document.createElement('style');s.id='v126AssignUpdateStyle';s.textContent='#supervisorView .v126-assign-grid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;grid-template-areas:"job tech" "time assign"!important;gap:11px!important;align-items:stretch!important}#supervisorView .v126-assign-grid>.v126-job{grid-area:job!important}#supervisorView .v126-assign-grid>.v126-tech{grid-area:tech!important}#supervisorView .v126-assign-grid>.v126-time{grid-area:time!important}#supervisorView .v126-assign-grid>.v126-assign-button{grid-area:assign!important;min-height:68px!important;align-self:stretch!important}#supervisorView .v126-assign-grid>*{width:100%!important;min-width:0!important;margin:0!important;box-sizing:border-box!important}#supervisorView .v126-assign-grid label{display:flex!important;flex-direction:column!important;justify-content:flex-start!important}#supervisorView .v126-assign-grid input,#supervisorView .v126-assign-grid select{width:100%!important;min-height:45px!important;box-sizing:border-box!important}@media(max-width:350px){#supervisorView .v126-assign-grid{gap:8px!important}}';document.head.appendChild(s);
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(apply,0);return r};setTimeout(apply,0);window.v126AssignUpdateUIAuthority=true;
})();




/* V127 SUPERVISOR MOBILE HEADER AUTHORITY — one identity row only. */
(function(){'use strict';
 function apply(){
  if(!me||me.role!=='Supervisor')return;
  const root=document.getElementById('supervisorView');if(!root)return;
  const rows=[...root.querySelectorAll('.v91-role-identity')];let keep=rows[0]||null;rows.slice(1).forEach(x=>x.remove());
  const gh=document.getElementById('globalBrandHeader'),lh=document.getElementById('legacyAppHeader');
  if(gh){gh.classList.add('hidden');gh.style.setProperty('display','none','important')}
  if(lh){lh.classList.add('hidden');lh.style.setProperty('display','none','important')}
  const welcome=document.getElementById('welcome');if(welcome&&welcome!==keep){welcome.style.setProperty('display','none','important')}
  const net=document.getElementById('net');if(net)net.style.setProperty('display','none','important');
  const hos=document.getElementById('headerOnlineStatus');if(hos)hos.style.setProperty('display','none','important');
  document.querySelectorAll('.header-online-status').forEach(x=>{if(!keep?.contains(x))x.style.setProperty('display','none','important')});
  if(keep){keep.classList.add('v127-single-supervisor-header');const top=root.querySelector('.v92-supervisor-top');if(top&&keep.nextElementSibling!==top)root.insertBefore(keep,top)}
 }
 const s=document.createElement('style');s.id='v127SupervisorHeaderStyle';s.textContent='body:has(#supervisorView:not(.hidden)) #globalBrandHeader,body:has(#supervisorView:not(.hidden)) #legacyAppHeader,body:has(#supervisorView:not(.hidden)) #welcome{display:none!important}#supervisorView .v127-single-supervisor-header{display:flex!important;position:static!important;width:auto!important;margin:0 0 10px!important}';
 document.head.appendChild(s);
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(apply,0);return r};setTimeout(apply,0);window.v127SupervisorHeaderAuthority=true;
})();


/* V128 SUPERVISOR SURFACE LOCK — source-level guard against legacy header/layout resurrection. */
(function(){'use strict';
 function apply(){
  if(!me||me.role!=='Supervisor')return;const root=document.getElementById('supervisorView');if(!root)return;
  const gh=document.getElementById('globalBrandHeader'),lh=document.getElementById('legacyAppHeader');[gh,lh].filter(Boolean).forEach(x=>{x.classList.add('hidden');x.style.setProperty('display','none','important')});
  const ids=[...root.querySelectorAll('.v91-role-identity')];ids.slice(1).forEach(x=>x.remove());
  const keep=ids[0];if(keep){keep.classList.add('v128-header');const top=root.querySelector('.v92-supervisor-top');if(top&&keep.nextElementSibling!==top)root.insertBefore(keep,top)}
  const assign=[...root.querySelectorAll('.card')].find(x=>/Assign\s*\/\s*Update Job Card/i.test(x.querySelector('h3')?.textContent||''));if(!assign)return;
  let g=assign.querySelector('.v112-assign-grid,.grid');if(!g)return;g.classList.add('v128-assign-grid');
  const j=g.querySelector('#sj')?.closest('label'),t=g.querySelector('#se2')?.closest('label'),tm=g.querySelector('#st2')?.closest('label'),b=assign.querySelector('.v107-assign,button[onclick*="assignJobExisting"]');
  [[j,'job'],[t,'tech'],[tm,'time'],[b,'assign']].forEach(([x,a])=>{if(x){x.dataset.v128area=a;g.appendChild(x)}});
 }
 const s=document.createElement('style');s.id='v128SupervisorSurfaceStyle';s.textContent='#globalBrandHeader.v128-supervisor-hide,#legacyAppHeader.v128-supervisor-hide{display:none!important}#supervisorView .v128-assign-grid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;grid-template-areas:"job tech" "time assign"!important;gap:11px!important}#supervisorView .v128-assign-grid>[data-v128area="job"]{grid-area:job!important}#supervisorView .v128-assign-grid>[data-v128area="tech"]{grid-area:tech!important}#supervisorView .v128-assign-grid>[data-v128area="time"]{grid-area:time!important}#supervisorView .v128-assign-grid>[data-v128area="assign"]{grid-area:assign!important}#supervisorView .v128-assign-grid>[data-v128area="id"]{grid-area:id!important;grid-column:auto!important}#supervisorView .v128-assign-grid>[data-v128area="history"]{grid-area:history!important}#supervisorView .v128-assign-grid>*{min-width:0!important;width:100%!important;margin:0!important;box-sizing:border-box!important}';document.head.appendChild(s);
 let busy=false;const obs=new MutationObserver(()=>{if(busy||!me||me.role!=='Supervisor')return;busy=true;requestAnimationFrame(()=>{try{apply()}finally{busy=false}})});obs.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(apply,0);return r};setTimeout(apply,0);window.v128SupervisorSurfaceLock=true;
})();

/* V129 EMPLOYEE MONTHLY LIQUID GLASS — larger readable seven KPI capsules. */
(()=>{const s=document.createElement('style');s.id='v129EmployeeMonthlyGlass';s.textContent=`
.v75s .month-summary .v81-month-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;padding:10px 0 4px!important}
.v75s .month-summary .v81-month-orb{position:relative!important;overflow:hidden!important;isolation:isolate!important;width:100%!important;min-height:88px!important;border-radius:28px!important;padding:15px 14px!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;border:1px solid rgba(255,255,255,.72)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.95),inset 0 -1px 0 rgba(255,255,255,.22),0 10px 24px rgba(31,41,55,.12)!important;backdrop-filter:blur(16px) saturate(145%)!important;-webkit-backdrop-filter:blur(16px) saturate(145%)!important}
.v75s .month-summary .v81-month-orb:before{content:''!important;display:block!important;position:absolute!important;inset:0!important;z-index:-1!important;background:linear-gradient(145deg,rgba(255,255,255,.64),rgba(255,255,255,.12))!important;pointer-events:none!important}
.v75s .month-summary .v81-month-orb:after{content:''!important;display:block!important;position:absolute!important;left:12%!important;right:12%!important;top:7px!important;height:24px!important;border-radius:999px!important;background:linear-gradient(180deg,rgba(255,255,255,.65),rgba(255,255,255,0))!important;filter:blur(1px)!important;pointer-events:none!important}
.v75s .month-summary .v81-month-orb b{font-size:22px!important;line-height:1.05!important;font-weight:900!important;letter-spacing:-.02em!important;margin:0!important;color:#172033!important;text-shadow:0 1px 0 rgba(255,255,255,.7)!important}
.v75s .month-summary .v81-month-orb span{font-size:11px!important;line-height:1.18!important;font-weight:850!important;letter-spacing:.025em!important;margin-top:7px!important;color:#344054!important;white-space:normal!important;text-align:center!important}
.v75s .month-summary #v81-m1{background:linear-gradient(135deg,rgba(219,234,254,.88),rgba(239,246,255,.58))!important}
.v75s .month-summary #v81-m2{background:linear-gradient(135deg,rgba(209,250,229,.88),rgba(236,253,245,.58))!important}
.v75s .month-summary #v81-m3{background:linear-gradient(135deg,rgba(224,231,255,.88),rgba(238,242,255,.58))!important}
.v75s .month-summary #v81-m4{background:linear-gradient(135deg,rgba(207,250,254,.88),rgba(236,254,255,.58))!important}
.v75s .month-summary #v81-m5{background:linear-gradient(135deg,rgba(254,243,199,.90),rgba(255,251,235,.60))!important}
.v75s .month-summary #v81-m6{background:linear-gradient(135deg,rgba(243,232,255,.90),rgba(250,245,255,.60))!important}
.v75s .month-summary #v81-m7{background:linear-gradient(135deg,rgba(255,228,230,.90),rgba(255,241,242,.60))!important}
.v75s .month-summary .v81-month-orb:last-child:nth-child(odd){grid-column:1/-1!important;max-width:calc(50% - 6px)!important;justify-self:center!important}
@media(max-width:380px){.v75s .month-summary .v81-month-grid{gap:9px!important}.v75s .month-summary .v81-month-orb{min-height:80px!important;border-radius:24px!important;padding:12px 9px!important}.v75s .month-summary .v81-month-orb b{font-size:20px!important}.v75s .month-summary .v81-month-orb span{font-size:10px!important}}
`;document.head.appendChild(s);window.v129EmployeeMonthlyGlass=true})();

/* V130 KIA LOGO RELIABILITY — current-style inline fallback, never generic car. */
(()=>{const kia='<svg viewBox="0 0 240 96" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Kia"><path d="M16 73V23h13v18l34-18h21L45 45l39 28H62L29 50v23H16zm75 0 31-50h17l31 50h-16l-8-13h-31l-8 13H91zm31-25h17l-8-14-9 14zm55 25V23h14l33 50h-17l-23-35v35h-7z" fill="currentColor"/></svg>';window.v130KiaInlineSvg=kia;const fallback=box=>{if(!box)return;box.innerHTML=kia;box.classList.add('v130-kia-inline')};const fix=()=>document.querySelectorAll('.v82-brand-logo[title="Kia"]').forEach(box=>{const img=box.querySelector('img');if(!img||img.complete&&img.naturalWidth===0)fallback(box)});document.addEventListener('error',e=>{const img=e.target,box=img?.closest?.('.v82-brand-logo[title="Kia"]');if(img?.tagName==='IMG'&&box)fallback(box)},true);const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(fix,0);return r};const s=document.createElement('style');s.id='v130KiaLogoStyle';s.textContent='.v82-brand-logo[title="Kia"].v130-kia-inline svg{width:100%;height:100%;display:block;color:#111827}.v82-brand-logo[title="Kia"] img{transform:none!important;object-fit:contain!important}';document.head.appendChild(s);setTimeout(fix,0);window.v130KiaLogoReliability=true})();

/* V131 VEHICLE BRAND AUTHORITY — explicit Job Card brand selection owns dashboard logo. */
(function(){'use strict';
 const brands=['','Toyota','Nissan','Infiniti','Lexus','Mercedes-Benz','BMW','Land Rover','Porsche','Audi','Volkswagen','Volvo','Mitsubishi','Mazda','Jeep','Hyundai','Kia','Genesis','Honda','Ford','Chevrolet','GMC','Cadillac','BYD','Jetour','Geely','Lincoln','Chrysler','Isuzu','RAM','Suzuki','Renault','Peugeot','Citroën','Škoda','Bentley','Rolls-Royce','Aston Martin','Ferrari','McLaren','MAN','GWM'];
 const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const opts=sel=>brands.map(b=>'<option value="'+esc(b)+'" '+(b===sel?'selected':'')+'>'+(b||'Auto detect / Other')+'</option>').join('');
 const infer=v=>{v=String(v||'').toLowerCase();const map=[['kia',/\bkia\b|sportage|sorento|seltos|sonet|carens|carnival|telluride|stinger|niro|picanto|cerato|\bk[34589]\b|ev[34569]/],['Toyota',/toyota|corolla|camry|land cruiser|prado|hilux|fortuner/],['Nissan',/nissan|patrol|x[ -]?trail|rogue|pathfinder|sunny|altima/],['Mercedes-Benz',/mercedes|benz|\bgle\b|\bglc\b|\bgls\b|viano|vito/],['BMW',/\bbmw\b/],['Hyundai',/hyundai|tucson|santa fe|palisade|elantra|accent/],['Honda',/honda|civic|accord|cr-?v|hr-?v/],['Land Rover',/land rover|range rover|defender|discovery|evoque/],['Porsche',/porsche|cayenne|macan|panamera|taycan/],['Audi',/\baudi\b/],['Volkswagen',/volkswagen|\bvw\b|tiguan|touareg|golf/],['Lexus',/lexus/],['Mazda',/mazda/],['Mitsubishi',/mitsubishi|pajero|outlander|attrage/],['Ford',/\bford\b|mustang|explorer|expedition|ranger/],['Chevrolet',/chevrolet|\bchevy\b|tahoe|suburban|camaro/],['BYD',/\bbyd\b|atto|dolphin/],['Geely',/geely|coolray|monjaro|emgrand/],['Jetour',/jetour/],['Isuzu',/isuzu/]];for(const [n,r] of map)if(r.test(v))return n==='kia'?'Kia':n;return ''};
 window.v131SetBrand=function(no,brand){const j=(state.jobs||[]).find(x=>x&&x.no===no);if(!j)return;j.brand=String(brand||'').trim();try{save()}catch(_){}render()};
 const logoFiles={'Toyota':'toyota.svg','Nissan':'nissan-logo.svg','Infiniti':'infiniti-logo.svg','Lexus':'lexus.svg','Mercedes-Benz':'mercedes-benz.svg','BMW':'bmw.svg','Land Rover':'land-rover.svg','Porsche':'porsche.svg','Audi':'audi.svg','Volkswagen':'volkswagen.svg','Volvo':'volvo.svg','Mitsubishi':'mitsubishi.svg','Mazda':'mazda.svg','Jeep':'jeep.svg','Hyundai':'hyundai-logo.svg','Kia':'kia-logo.svg','Genesis':'genesis-logo.svg','Honda':'honda.svg','Ford':'ford.svg','Chevrolet':'chevrolet.svg','GMC':'gmc.svg','Cadillac':'cadillac.svg','BYD':'byd-logo.svg','Jetour':'jetour.svg','Geely':'geely.svg','Lincoln':'lincoln.svg','Chrysler':'chrysler.svg','Isuzu':'isuzu.svg','RAM':'ram.svg','Suzuki':'suzuki.svg','Renault':'renault.svg','Peugeot':'peugeot.svg','Citroën':'citroen.svg','Škoda':'skoda.svg','Bentley':'bentley.svg','Rolls-Royce':'rolls-royce.svg','Aston Martin':'aston-martin.svg','Ferrari':'ferrari.svg','McLaren':'mclaren.svg','MAN':'man.svg','GWM':'gwm.svg'};
 function bindQuickLogo(root){if(me?.role!=='Supervisor')return;const input=root.querySelector('#newVehicle');if(!input||input.dataset.v109BrandBound)return;input.dataset.v109BrandBound='1';const label=input.closest('label');if(!label)return;let preview=label.querySelector('.v109-brand-preview');if(!preview){preview=document.createElement('span');preview.className='v109-brand-preview';label.appendChild(preview)}const update=()=>{const b=infer(input.value),f=logoFiles[b];preview.innerHTML=b&&f?'<img src="vehicle-logos/'+f+'" alt="'+esc(b)+' logo">':'';preview.title=b?'Detected '+b:''};input.addEventListener('input',update);input.addEventListener('change',update);update()}

 function inject(){if(!me)return;const root=document.getElementById(me.role==='Supervisor'?'supervisorView':me.role==='Manager'?'managerView':'employeeView');if(!root)return;
  // V109 Supervisor Quick Entry authority: Make / Model is the only vehicle identity input here.
  // Never inject the legacy Brand / Auto Detect Brand selector into Quick Job Card Entry.
  if(me.role==='Supervisor'){root.querySelectorAll('#v131NewBrand,.v131-brand-field').forEach(x=>(x.closest('label')||x).remove());bindQuickLogo(root)}
 }
 // Brand inference remains available for logo presentation elsewhere, but Quick Entry has no brand control.
 const oldCreate=window.createAndAssignQuick||window.quickCreateAssign; // preserve existing authority if present
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(inject,0);return r};setTimeout(inject,0);
 if(!document.getElementById('v109QuickBrandLogoStyle')){const st=document.createElement('style');st.id='v109QuickBrandLogoStyle';st.textContent='#supervisorView .v109-brand-preview{display:flex;align-items:center;gap:7px;min-height:25px;margin-top:5px;font-size:10px;font-weight:900;color:#334155}#supervisorView .v109-brand-preview:empty{display:none}#supervisorView .v109-brand-preview img{width:30px;height:22px;object-fit:contain;background:#fff;border-radius:6px;padding:2px}';document.head.appendChild(st)}
 window.v131VehicleBrandAuthority={brands,infer,options:opts};
})();

/* V132 JOB BRAND -> EMPLOYEE LOGO + MANAGER EDIT AUTHORITY. */
(function(){'use strict';
 const files={'Toyota':'toyota.svg','Nissan':'nissan-logo.svg','Infiniti':'infiniti-logo.svg','Lexus':'lexus.svg','Mercedes-Benz':'mercedes-benz.svg','BMW':'bmw.svg','Land Rover':'land-rover.svg','Porsche':'porsche.svg','Audi':'audi.svg','Volkswagen':'volkswagen.svg','Volvo':'volvo.svg','Mitsubishi':'mitsubishi.svg','Mazda':'mazda.svg','Jeep':'jeep.svg','Hyundai':'hyundai-logo.svg','Kia':'kia-logo.svg','Genesis':'genesis-logo.svg','Honda':'honda.svg','Ford':'ford.svg','Chevrolet':'chevrolet.svg','GMC':'gmc.svg','Cadillac':'cadillac.svg','BYD':'byd-logo.svg','Jetour':'jetour.svg','Geely':'geely.svg','Lincoln':'lincoln.svg','Chrysler':'chrysler.svg','Isuzu':'isuzu.svg','RAM':'ram.svg','Suzuki':'suzuki.svg','Renault':'renault.svg','Peugeot':'peugeot.svg','Citroën':'citroen.svg','Škoda':'skoda.svg','Bentley':'bentley.svg','Rolls-Royce':'rolls-royce.svg','Aston Martin':'aston-martin.svg','Ferrari':'ferrari.svg','McLaren':'mclaren.svg','MAN':'man.svg','GWM':'gwm.svg'};
 const brandInfo=j=>{if(!j)return null;const n=String(j.brand||'').trim();return n&&files[n]?{name:n,file:files[n]}:null};window.v132JobBrandInfo=brandInfo;
 function applyEmployee(){if(!me||me.role!=='Employee')return;document.querySelectorAll('#employeeView .v75s-card[data-job],#employeeView [data-job]').forEach(card=>{const no=card.dataset.job,j=(state.jobs||[]).find(x=>x&&x.no===no),b=brandInfo(j);if(!b)return;const box=card.querySelector('.v82-brand-logo,.v82-logo-fallback');if(!box)return;box.outerHTML='<div class="v82-brand-logo v132-explicit-brand" title="'+b.name+'"><img src="vehicle-logos/'+b.file+'" alt="'+b.name+' logo"></div>'});const s=activeSession?.(me.id);if(s){const j=(state.jobs||[]).find(x=>x&&x.no===s.job),b=brandInfo(j),mark=document.querySelector('#employeeView .v75s-shell .v82-vehicle-mark');if(b&&mark){const ev=mark.querySelector('.v82-ev-badge')?.outerHTML||'';mark.innerHTML='<div class="v82-brand-logo v132-explicit-brand" title="'+b.name+'"><img src="vehicle-logos/'+b.file+'" alt="'+b.name+' logo"></div>'+ev}}}
 const oldEdit=window.editJobManager;if(typeof oldEdit==='function'&&!oldEdit.v132){const w=function(no){const r=oldEdit.apply(this,arguments);setTimeout(()=>{const j=(state.jobs||[]).find(x=>x&&x.no===no),v=document.getElementById('editJCVehicle');if(!v||document.getElementById('v132EditBrand'))return;const lab=document.createElement('label');lab.innerHTML='Vehicle Brand<br><select id="v132EditBrand">'+window.v131VehicleBrandAuthority.options(j?.brand||window.v131VehicleBrandAuthority.infer(j?.vehicle||''))+'</select>';v.closest('label')?.insertAdjacentElement('afterend',lab)},0);return r};w.v132=true;window.editJobManager=w}
 const oldSave=window.saveJobManagerEdit;if(typeof oldSave==='function'&&!oldSave.v132){const w=function(){const no=document.getElementById('editJCNo')?.value?.trim()?.toUpperCase(),brand=document.getElementById('v132EditBrand')?.value;const r=oldSave.apply(this,arguments);const j=(state.jobs||[]).find(x=>x&&x.no===no);if(j&&brand!==undefined){j.brand=brand;try{save()}catch(_){}}return r};w.v132=true;window.saveJobManagerEdit=w}
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(applyEmployee,0);return r};setTimeout(applyEmployee,0);window.v132JobBrandLogoAuthority=true;
})();

/* V133 MANAGER READABILITY + LEAVE CONTROL — today count, today/month detail, edit authority. */
(function(){'use strict';
 const E=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 const active=()=>((state.leaves||[]).filter(l=>l&&!l.cancelled));const person=id=>{try{return user(id)||{name:id,department:''}}catch(_){return{name:id,department:''}}};const label=p=>p==='AM'?'Morning Half Day':p==='PM'?'Afternoon Half Day':'Full Day';
 const today=()=>active().filter(l=>l.date===key(new Date()));const month=()=>{const d=new Date(),p=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-';return active().filter(l=>String(l.date||'').startsWith(p))};
 const table=rows=>rows.length?'<div class="v133-leave-scroll"><table><tr><th>Employee</th><th>Department</th><th>Date</th><th>Leave</th><th>Remark</th><th>Action</th></tr>'+rows.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(l=>{const u=person(l.emp);return'<tr><td><b>'+E(u.name)+'</b></td><td>'+E(u.department||'—')+'</td><td>'+E(l.date)+'</td><td>'+E(label(l.period))+'</td><td>'+E(l.remark||'—')+'</td><td><button class="v133-edit-leave" onclick="v114EditLeave(\''+E(l.id)+'\')">Edit</button></td></tr>'}).join('')+'</table></div>':'<div class="notice">No leave records.</div>';
 window.v133LeaveEmployee='';
 window.v133LeaveRows=function(){const all=month();return window.v133LeaveEmployee?all.filter(x=>String(x.emp)===String(window.v133LeaveEmployee)):all};
 window.v133PrintLeave=function(){const rows=window.v133LeaveRows(),title=window.v133LeaveEmployee?'Employee Leave Report':'Monthly Leave Report';const w=window.open('','_blank');if(!w)return alert('Allow pop-ups to print the leave report.');w.document.write('<html><head><title>'+title+'</title><style>body{font-family:Arial;padding:24px}h2{margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#eee}</style></head><body><h2>ZUKAIT AUTO</h2><div>'+title+'</div>'+table(rows)+'</body></html>');w.document.close();w.focus();setTimeout(()=>w.print(),250)};
 window.v133ShareLeave=function(){const rows=window.v133LeaveRows();if(!rows.length)return alert('No leave records to share.');const lines=rows.map(l=>{const u=person(l.emp);return [u.name,l.date,label(l.period),l.remark||'—'].join(' | ')});const msg='ZUKAIT AUTO - Leave Report\\n'+lines.join('\\n');const url='https://wa.me/?text='+encodeURIComponent(msg);window.open(url,'_blank')};
 window.v133FilterLeave=function(v){window.v133LeaveEmployee=v||'';window.v133OpenManagerLeave(true)};
 window.v133OpenManagerLeave=function(preserve){if(!me||me.role!=='Manager')return;if(!preserve)window.v133LeaveEmployee='';const t=today(),m=month(),staff=(users||[]).filter(u=>u&&(u.role==='Employee'||u.role==='Supervisor')),sel=window.v133LeaveEmployee,filtered=sel?m.filter(x=>String(x.emp)===String(sel)):m,days=filtered.reduce((n,l)=>n+(l.period==='FULL'?1:.5),0);openModal('<div class="section-title"><h2>🗓 Leave Management</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="v133-leave-tools"><label>Employee<br><select onchange="v133FilterLeave(this.value)"><option value="">All Employees</option>'+staff.map(u=>'<option value="'+E(u.id)+'" '+(String(u.id)===String(sel)?'selected':'')+'>'+E(u.name)+'</option>').join('')+'</select></label><div class="v133-leave-actions"><button onclick="v133PrintLeave()">🖨 PRINT / PDF</button><button onclick="v133ShareLeave()">◉ SEND WHATSAPP</button></div></div><div class="v133-leave-summary"><div><span>ON LEAVE TODAY</span><b>'+new Set(t.filter(x=>!sel||String(x.emp)===String(sel)).map(x=>x.emp)).size+'</b></div><div><span>SELECTED MONTH</span><b>'+days.toFixed(1).replace('.0','')+' days</b></div></div><h3>This Month</h3>'+table(filtered))};
 function apply(){if(!me||me.role!=='Manager')return;const root=document.getElementById('managerView');if(!root)return;const t=today(),count=new Set(t.map(x=>String(x.emp))).size;
   // V109 authority: remove every legacy Manager leave dashboard injection first.
   root.querySelectorAll('#v755LeaveControlRow,.v755-leave-control-row,.v133-manager-leave').forEach(x=>x.remove());
   root.querySelectorAll('button').forEach(b=>{const tx=(b.textContent||'').trim();if(/^(TODAY[’']?S? LEAVE|THIS MONTH LEAVE|ON LEAVE)\b/i.test(tx)&&!b.closest('.modal'))b.remove()});
   // Keep this Manager dashboard position as a future Consumables module; Leave Control stays in the header menu.
   const btn=document.createElement('button');btn.className='v133-manager-leave v109-manager-consumables';btn.onclick=function(){alert('Consumables details will be added later.')};btn.innerHTML='<span>📦 CONSUMABLES</span><b>›</b><small>Workshop consumables · details coming later</small>';
   const perf=root.querySelector('.v123-manager-performance');(perf?.parentNode||root).insertBefore(btn,perf?perf.nextSibling:root.firstChild);
 }
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(apply,0);return r};
 const s=document.createElement('style');s.id='v133ManagerReadableStyle';s.textContent='.v123-manager-performance{background:linear-gradient(145deg,#f8fbff,#eef5ff)!important;border:1px solid #cbdcf3!important}.v123-head h3{color:#102a43!important;font-size:18px!important}.v123-head small{color:#486581!important}.v123-perf{background:#fff!important;border:1px solid #b9cbe0!important;box-shadow:0 5px 13px rgba(31,65,102,.10)!important;min-height:72px!important}.v123-perf span{color:#334e68!important;font-size:11px!important}.v123-perf b{color:#102a43!important;font-size:19px!important}.v123-toggle{background:#dbeafe!important}.v123-toggle button{color:#334e68!important}.v123-toggle button.on{background:#173f6b!important;color:#fff!important}.v133-manager-leave{width:100%;margin:0 0 12px;padding:13px 16px;border-radius:16px;border:1px solid #b8d5c2;background:linear-gradient(135deg,#ecfdf3,#f7fff9);color:#174a2c;display:grid;grid-template-columns:1fr auto;align-items:center;text-align:left;box-shadow:0 5px 13px #17324b16}.v133-manager-leave span{font-size:12px;font-weight:900}.v133-manager-leave b{grid-row:1/3;grid-column:2;font-size:27px}.v133-manager-leave small{font-weight:700;color:#47745a}.v133-leave-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0 16px}.v133-leave-summary div{padding:12px;border-radius:14px;background:#f3f8fc;border:1px solid #d7e3ed}.v133-leave-summary span{display:block;font-size:10px;font-weight:900;color:#52677a}.v133-leave-summary b{display:block;font-size:22px;margin-top:4px}.v133-leave-scroll{overflow:auto}.v133-leave-scroll table{min-width:690px}.v133-edit-leave{background:#173f6b!important;color:#fff!important;font-weight:900!important}';document.head.appendChild(s);setTimeout(apply,0);window.v133ManagerLeaveControl=true;
})();

/* V134 MANAGER AVAILABLE CAPACITY TODAY — leave/session/ID001 aware production planning. */
(function(){'use strict';
 const H='ID001',emps=()=>((users||[]).filter(u=>u&&u.role==='Employee'));
 const onLeave=(id,t)=>{try{return typeof window.v63IsOnLeave==='function'&&window.v63IsOnLeave(id,t)}catch(_){return false}};
 const session=id=>{try{return activeSession(id)}catch(_){return null}};
 const hold=id=>(state.assign||[]).some(a=>a&&a.emp===id&&a.job===H&&!a.cancelled&&!a.completed);
 const openNormal=id=>(state.assign||[]).filter(a=>a&&a.emp===id&&a.job!==H&&!a.cancelled&&!a.completed);
 const status=a=>{try{return empStatus(a)}catch(_){return a?.completed?'Finished':'New'}};
 function data(){const t=Date.now(),all=emps(),leave=all.filter(u=>onLeave(u.id,t)),working=all.filter(u=>{const s=session(u.id);return s&&s.job!==H}),ideal=all.filter(u=>hold(u.id)||session(u.id)?.job===H),available=all.filter(u=>!onLeave(u.id,t)&&!session(u.id)&&!hold(u.id)&&openNormal(u.id).length===0),paused=all.filter(u=>!onLeave(u.id,t)&&!session(u.id)&&openNormal(u.id).length>0&&openNormal(u.id).every(a=>status(a)==='Paused'));return{all,leave,working,ideal,available,paused}}
 const names=rows=>rows.length?rows.map(u=>'<div class="v134-person"><b>'+String(u.name||u.id).replace(/[&<>"']/g,'')+'</b><span>'+String(u.department||'Employee').replace(/[&<>"']/g,'')+'</span></div>').join(''):'<div class="notice">None</div>';
 window.v134OpenCapacity=function(){if(!me||me.role!=='Manager')return;const x=data();openModal('<div class="section-title"><h2>Available Capacity Today</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="v134-cap-summary"><div><span>Available</span><b>'+x.available.length+'</b></div><div><span>Working</span><b>'+x.working.length+'</b></div><div><span>ID001</span><b>'+x.ideal.length+'</b></div><div><span>Leave</span><b>'+x.leave.length+'</b></div></div><h3>Available for New Work</h3>'+names(x.available)+'<h3>Paused Work — Review Next Job</h3>'+names(x.paused)+'<h3>Currently on ID001</h3>'+names(x.ideal))};
 function apply(){if(!me||me.role!=='Manager')return;const box=document.querySelector('#managerView .v123-manager-performance .v123-grid');if(!box)return;let b=box.querySelector('.v134-capacity');if(!b){b=document.createElement('button');b.className='v123-perf v134-capacity';b.onclick=window.v134OpenCapacity;box.appendChild(b)}const x=data();b.innerHTML='<span>Available Capacity Today</span><b>'+x.available.length+' / '+x.all.length+'</b><small>'+x.ideal.length+' ID001 · '+x.leave.length+' leave</small>'}
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(apply,0);return r};const s=document.createElement('style');s.id='v134CapacityStyle';s.textContent='.v134-capacity{background:linear-gradient(135deg,#eefcf7,#f8fffc)!important;border-color:#b8ddce!important}.v134-capacity small{display:block;margin-top:4px;color:#477565;font-size:9px;font-weight:800}.v134-cap-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px}.v134-cap-summary div{padding:11px;border-radius:13px;background:#f5f9fc;border:1px solid #dbe5ed}.v134-cap-summary span{font-size:10px;font-weight:850;color:#52677a}.v134-cap-summary b{display:block;font-size:20px;color:#183b56}.v134-person{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;border-bottom:1px solid #e6edf3}.v134-person span{color:#627d98;font-size:11px}';document.head.appendChild(s);setTimeout(apply,0);window.v134ManagerCapacity=true;
})();

/* V135 MODERN MANAGER MENU — compact, non-floating, full account controls preserved. */
(function(){'use strict';
 function menu(){if(!me||me.role!=='Manager')return;const n=String(me.name||'Manager').replace(/[&<>"']/g,'');openModal('<div class="v135-menu-head"><div><small>ACCOUNT</small><h2>'+n+'</h2></div><button class="v135-close" onclick="closeModal()">×</button></div><div class="v135-manager-menu"><button class="v135-action sync" onclick="v42SyncNow();closeModal()"><i>↻</i><span><b>Synchronize</b><small>Sync workshop data</small></span></button><button class="v135-action leave" onclick="closeModal();v133OpenManagerLeave()"><i>▣</i><span><b>Leave Control</b><small>Today & monthly leave</small></span></button><button class="v135-action update" onclick="closeModal();v63OpenAbout()"><i>⬆</i><span><b>About / Update</b><small>Check software version</small></span></button><button class="v135-action logout" onclick="closeModal();logout()"><i>↪</i><span><b>Logout</b><small>Sign out safely</small></span></button></div>')}
 window.v135OpenManagerMenu=menu;
 // V110 Manager authority: expose the Manager menu immediately so Logout and About / Update are never dependent on a later render callback.
 window.v110OpenManagerMenu=menu;
 function apply(){if(!me||me.role!=='Manager')return;const root=document.getElementById('managerView');if(!root)return;
   // V109 authority: old Manager identity/header/status layers are removed before rebuilding.
   [...root.querySelectorAll('.v91-role-identity')].forEach(x=>x.remove());
   root.querySelectorAll('.header-online-status').forEach(x=>x.remove());
   const gh=document.getElementById('globalBrandHeader');if(gh)gh.style.setProperty('display','none','important');
   const lh=document.getElementById('legacyAppHeader');if(lh)lh.style.setProperty('display','none','important');
   const net=document.getElementById('net');if(net){net.textContent='';net.style.setProperty('display','none','important')}
   const hos=document.getElementById('headerOnlineStatus');if(hos)hos.style.setProperty('display','none','important');
   if(typeof window.v91RoleHeader==='function'){try{window.v91RoleHeader('Manager')}catch(_){}}
   let row=root.querySelector('.v91-role-identity');if(!row)return;row.classList.add('v135-manager-header');row.style.position='static';row.style.inset='auto';row.style.transform='none';row.style.zIndex='auto';const b=row.querySelector('b');if(b)b.textContent='Manager';let online=row.querySelector('.v91-role-online');if(online)online.innerHTML='<i></i>ONLINE';let mb=row.querySelector('.v91-role-menu,.v91-identity-menu');if(!mb){mb=document.createElement('button');row.appendChild(mb)}mb.className='v91-role-menu v135-menu-button';mb.innerHTML='<span>MENU</span><b>☰</b>';mb.onclick=menu;mb.setAttribute('aria-label','Open Manager menu');row.onclick=function(e){if(e.target.closest('button'))return;menu()};row.setAttribute('role','button');row.setAttribute('tabindex','0');row.setAttribute('aria-label','Open Manager menu');row.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();menu()}};const perf=root.querySelector('.v123-manager-performance');if(perf&&row.nextElementSibling!==perf)root.insertBefore(row,perf);}
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(apply,0);return r};const s=document.createElement('style');s.id='v135ManagerMenuStyle';s.textContent='#managerView .v135-manager-header{cursor:pointer!important;transition:transform .16s ease,box-shadow .16s ease!important;position:static!important;top:auto!important;left:auto!important;right:auto!important;width:auto!important;min-height:52px!important;margin:0 0 12px!important;padding:8px 10px 8px 14px!important;border-radius:17px!important;background:linear-gradient(135deg,rgba(255,255,255,.97),rgba(244,249,255,.94))!important;border:1px solid #d5e1ed!important;box-shadow:0 6px 16px rgba(23,50,75,.09)!important;backdrop-filter:blur(12px)}#managerView .v135-manager-header>b{font-size:17px!important;color:#183b56!important}#managerView .v135-manager-header .v91-role-online{margin-left:auto!important;padding:6px 9px!important;font-size:10px!important}.v135-menu-button{width:auto!important;min-width:70px!important;height:36px!important;padding:0 9px!important;display:flex!important;gap:7px!important;align-items:center!important;justify-content:center!important;background:#173f6b!important;color:#fff!important;border-color:#173f6b!important}.v135-menu-button span{font-size:9px;font-weight:900;letter-spacing:.5px}.v135-menu-button b{font-size:16px}.v135-menu-head{display:flex;justify-content:space-between;align-items:center;padding:4px 2px 12px}.v135-menu-head small{font-size:9px;font-weight:900;color:#6b7f91;letter-spacing:1px}.v135-menu-head h2{margin:2px 0 0;color:#183b56}.v135-close{width:38px!important;height:38px!important;border-radius:12px!important;padding:0!important;background:#edf3f8!important;color:#183b56!important;font-size:25px!important}.v135-manager-menu{display:grid;grid-template-columns:1fr 1fr;gap:10px}.v135-action{min-height:82px!important;border-radius:16px!important;padding:12px!important;text-align:left!important;display:flex!important;align-items:center!important;gap:10px!important;border:1px solid!important;box-shadow:0 5px 12px rgba(23,50,75,.08)!important}.v135-action i{font-style:normal;font-size:22px}.v135-action span{display:flex;flex-direction:column;gap:3px}.v135-action b{font-size:12px}.v135-action small{font-size:9px;opacity:.76}.v135-action.sync{background:#eaf5ff!important;border-color:#b9d8f2!important;color:#075985!important}.v135-action.leave{background:#ecfbf2!important;border-color:#b8dec6!important;color:#17633a!important}.v135-action.update{background:#f2edff!important;border-color:#cfc0ef!important;color:#5b36a5!important}.v135-action.logout{background:#fff0f0!important;border-color:#edc0c0!important;color:#a12b2b!important}@media(max-width:370px){.v135-manager-menu{grid-template-columns:1fr}.v135-menu-button span{display:none}.v135-menu-button{min-width:42px!important}}';document.head.appendChild(s);setTimeout(apply,0);window.v135ModernManagerMenu=true;
})();

/* V110 SUPERVISOR ID001 REPORT — paired with standalone ID001 assignment control. */
(function(){'use strict';
 const H='ID001', esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const usr=id=>{try{return user(id)||{name:id,department:''}}catch(_){return{name:id,department:''}}};
 const fm=m=>{try{return typeof fmt==='function'?fmt(Math.max(0,+m||0)):Math.round(Math.max(0,+m||0))+' min'}catch(_){return Math.round(Math.max(0,+m||0))+' min'}};
 function day(v,end){if(!v)return null;const d=new Date(v+(end?'T23:59:59.999':'T00:00:00'));return +d}
 function rows(){
   const emp=document.getElementById('v110ID001Emp')?.value||'',from=day(document.getElementById('v110ID001From')?.value,false),to=day(document.getElementById('v110ID001To')?.value,true);
   return (state.sessions||[]).filter(s=>s&&s.job===H&&(!emp||String(s.emp)===String(emp))&&(!from||(+s.start||0)>=from)&&(!to||(+s.start||0)<=to)).slice().sort((a,b)=>(+b.start||0)-(+a.start||0));
 }
 function body(rs){let total=0;const tr=rs.map(s=>{const en=+(s.end||Date.now()),mins=Math.max(0,(en-(+s.start||en))/60000);total+=mins;const u=usr(s.emp);return'<tr><td>'+esc(u.name)+'</td><td>'+esc(u.department||'—')+'</td><td>'+esc(s.start?new Date(+s.start).toLocaleDateString():'—')+'</td><td>'+esc(s.start?new Date(+s.start).toLocaleTimeString():'—')+'</td><td>'+esc(s.end?new Date(+s.end).toLocaleTimeString():'Running')+'</td><td><b>'+esc(fm(mins))+'</b></td></tr>'}).join('');return'<div class="v110-id001-total"><span>TOTAL ID001 TIME</span><b>'+esc(fm(total))+'</b></div><div class="v75s-history"><table><tr><th>Employee</th><th>Department</th><th>Date</th><th>Start</th><th>Stop</th><th>ID001 Time</th></tr>'+(tr||'<tr><td colspan="6">No ID001 usage found for this filter.</td></tr>')+'</table></div>'}
 window.v110RefreshID001Report=function(){const out=document.getElementById('v110ID001Rows');if(out)out.innerHTML=body(rows())};
 window.v110PrintID001Report=function(){const rs=rows(),html='<html><head><title>ZUKAIT AUTO - ID001 Report</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #bbb;padding:7px;text-align:left}.v110-id001-total{font-size:18px;margin:12px 0}</style></head><body><h2>ZUKAIT AUTO</h2><h3>ID001 Ideal Time Report</h3>'+body(rs)+'</body></html>';if(typeof window.v110ReportActions==='function')return window.v110ReportActions(html,'Zukait_ID001_Report.pdf');if(window.AndroidBridge&&AndroidBridge.printHtml)return AndroidBridge.printHtml(html);const w=window.open('','_blank');if(!w)return alert('Allow pop-ups to print the ID001 report.');w.document.write(html);w.document.close();w.focus();setTimeout(()=>w.print(),250)};
 window.v110OpenID001Report=function(){if(!me||me.role!=='Supervisor')return;const staff=(users||[]).filter(u=>u&&u.role==='Employee').slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));openModal('<div class="section-title"><h2>◷ ID001 Report</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="v110-id001-filters"><label>Employee<br><select id="v110ID001Emp" onchange="v110RefreshID001Report()"><option value="">All Employees</option>'+staff.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.name)+'</option>').join('')+'</select></label><label>From Date<br><input id="v110ID001From" type="date" onchange="v110RefreshID001Report()"></label><label>To Date<br><input id="v110ID001To" type="date" onchange="v110RefreshID001Report()"></label><button onclick="v110PrintID001Report()">🖨 PRINT / PDF</button></div><div id="v110ID001Rows">'+body((state.sessions||[]).filter(s=>s&&s.job===H).slice().sort((a,b)=>(+b.start||0)-(+a.start||0)))+'</div>')};
 function apply(){if(!me||me.role!=='Supervisor')return;const root=document.getElementById('supervisorView'),box=root?.querySelector('#v109ID001Standalone');if(!box)return;box.querySelectorAll('#v110ID001ReportButton').forEach(x=>x.remove());box.classList.add('v110-id001-pair');const b=document.createElement('button');b.id='v110ID001ReportButton';b.type='button';b.onclick=window.v110OpenID001Report;b.innerHTML='<b>▤ ID001</b><span>REPORT</span><small>VIEW · FILTER · PRINT</small>';box.appendChild(b)}
 const old=window.render;window.render=function(){const r=typeof old==='function'?old.apply(this,arguments):undefined;setTimeout(apply,0);return r};setTimeout(apply,0);
 const s=document.createElement('style');s.id='v110ID001ReportStyle';s.textContent='#supervisorView .v110-id001-pair{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}#supervisorView .v110-id001-pair>button{width:100%;min-height:96px!important;margin:0!important;padding:14px 18px!important;border-radius:15px!important}#v110ID001ReportButton{border:1px solid rgba(28,126,93,.4)!important;background:rgba(28,126,93,.11)!important;color:#145a43!important}#v110ID001ReportButton b,#v110ID001ReportButton span,#v110ID001ReportButton small{display:block}.v110-id001-filters{display:grid;grid-template-columns:1.2fr 1fr 1fr auto;gap:8px;align-items:end;margin:10px 0}.v110-id001-filters select,.v110-id001-filters input{width:100%}.v110-id001-total{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:12px;background:rgba(80,140,255,.10);margin:10px 0}@media(max-width:700px){.v110-id001-filters{grid-template-columns:1fr 1fr}.v110-id001-filters label:first-child{grid-column:1/-1}}';document.head.appendChild(s)
})();



/* V111 MANAGER LAYOUT AUTHORITY — header menu + dashboard Leave Management; Workshop Control Center On Leave becomes Consumables. */
(function(){'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 window.v111OpenManagerMenu=function(){if(!me||me.role!=='Manager')return;openModal('<div class="v135-menu-head"><div><small>MANAGER ACCOUNT</small><h2>'+esc(me.name||'Manager')+'</h2></div><button class="v135-close" onclick="closeModal()">×</button></div><div class="v135-manager-menu"><button class="v135-action sync" onclick="v42SyncNow();closeModal()"><i>↻</i><span><b>Synchronize</b><small>Sync workshop data</small></span></button><button class="v135-action update" onclick="closeModal();v63OpenAbout()"><i>⬆</i><span><b>About / Update</b><small>Check software version</small></span></button><button class="v135-action logout" onclick="closeModal();logout()"><i>↪</i><span><b>Logout</b><small>Sign out safely</small></span></button></div>')};
 window.v135OpenManagerMenu=window.v111OpenManagerMenu;window.v110OpenManagerMenu=window.v111OpenManagerMenu;
 function apply(){if(!me||me.role!=='Manager')return;const root=document.getElementById('managerView');if(!root)return;
   root.querySelectorAll('.v91-role-identity').forEach(x=>x.remove());
   const row=document.createElement('div');row.className='v91-role-identity v135-manager-header v111-manager-header';row.setAttribute('role','button');row.setAttribute('tabindex','0');row.setAttribute('aria-label','Open Manager menu');row.innerHTML='<b>Manager</b><span class="v91-role-online"><i></i>ONLINE</span><button type="button" class="v91-role-menu v135-menu-button" aria-label="Open Manager menu"><span>MENU</span><b>☰</b></button>';
   const open=e=>{if(e)e.preventDefault();window.v111OpenManagerMenu()};row.onclick=function(e){if(e.target.closest('.v135-menu-button'))return;open(e)};row.onkeydown=function(e){if(e.key==='Enter'||e.key===' ')open(e)};row.querySelector('.v135-menu-button').onclick=open;
   const perf=root.querySelector('.v123-manager-performance');root.insertBefore(row,perf||root.firstChild);

   // The standalone dashboard card is Leave Management and opens the full leave window (filter, edit, Print/PDF, WhatsApp).
   root.querySelectorAll('.v109-manager-consumables').forEach(x=>x.remove());
   let leave=root.querySelector('.v111-manager-leave');
   if(!leave){leave=document.createElement('button');leave.type='button';leave.className='v133-manager-leave v111-manager-leave';const pp=root.querySelector('.v123-manager-performance');(pp?.parentNode||root).insertBefore(leave,pp?pp.nextSibling:root.firstChild)}
   leave.onclick=()=>window.v133OpenManagerLeave();leave.innerHTML='<span>🗓 LEAVE MANAGEMENT</span><b>›</b><small>Employee leave · filter · edit · print / PDF · WhatsApp</small>';

   // Workshop Control Center keeps the same tile position but ON LEAVE is repurposed as CONSUMABLES.
   root.querySelectorAll('#v755LeaveControlRow,.v755-leave-control-row').forEach(x=>x.remove());
   const sections=[...root.querySelectorAll('.v67-section,.v65-section')];const control=sections.find(x=>/Workshop Control Center/i.test(x.querySelector('h3')?.textContent||''));
   if(control){let target=[...control.querySelectorAll('button')].find(b=>/^(ON LEAVE|CONSUMABLES)\b/i.test((b.textContent||'').trim()));if(!target){target=document.createElement('button');control.appendChild(target)}target.className=(target.className||'')+' v111-control-consumables';target.onclick=()=>alert('Consumables details will be added later.');target.innerHTML='<span>📦 CONSUMABLES</span><b>›</b><small>Workshop consumables · details coming later</small>'}
 }
 const prev=window.render;window.render=function(){const r=typeof prev==='function'?prev.apply(this,arguments):undefined;setTimeout(apply,0);return r};
 const prevManager=window.renderManager;if(typeof prevManager==='function')window.renderManager=function(){const r=prevManager.apply(this,arguments);apply();setTimeout(apply,0);return r};
 let guard=0;function settle(){if(!me||me.role!=='Manager'||guard++>5)return;apply();setTimeout(settle,60)}setTimeout(settle,0);
})();
