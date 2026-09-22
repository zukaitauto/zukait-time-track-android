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
window.supervisorOverview=function(rows){let open=(rows||[]).filter(a=>a&&!a.cancelled&&!a.completed&&a.job!==H),active=open.filter(a=>{let s=activeSession(a.emp);return s&&s.job===a.job}).length,paused=open.filter(a=>{try{return empStatus(a)==='Paused'}catch(_){return false}}).length,day=(()=>{let d=new Date();d.setHours(0,0,0,0);return d.getTime()})(),fin=(rows||[]).filter(a=>a&&!a.cancelled&&a.completed&&a.job!==H&&(a.completedAt||0)>=day).length,over=open.filter(a=>(+a.suggested||0)>0&&A(a)>+a.suggested).length,ot=(state.sessions||[]).filter(s=>!s.end&&s.job!==H).filter(s=>{try{return sessionOvertimeMinutes(s,Date.now())>0}catch(_){return false}}).length,r=READY().length,C=(i,l,n,c,k)=>'<div class="notice clickable glance-box '+k+'" onclick="'+c+'"><span class="v74-icon">'+i+'</span><div><b>'+l+'</b><div class="stat">'+n+'</div></div></div>';return'<div class="card"><h3><span class="live-dot"></span>Today at a Glance</h3><div class="v74-six">'+C('👷','Active Workers',active,'openActiveWorkers()','ga')+C('⏸','Paused Jobs',paused,"openGlanceList('paused')",'gp')+C('✅','Finished Jobs',fin,'openSupervisorFinishedWindow()','gf')+C('🚗✓','Ready for Delivery',r,"v74Ready(\'supervisor\')",'gr')+C('⏱','Overtime Now',ot,'v74OT()','go')+C('⚠','Over Allocated Time',over,"openGlanceList('over')",'gx')+'</div></div><div class="card v56-technician-board-card"><button class="v54-tech-button" onclick="openTechnicianBoardV56()"><span><span class="v54-icon">👷</span><b>TECHNICIAN BOARD</b><br><span class="small">Denting · Painting · Mechanical</span></span><span style="font-size:28px">›</span></button></div>'+v75EffSection()};
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
function v74ApplySupervisorFinal(){
 if(me?.role!=='Supervisor')return;
 let root=document.getElementById('supervisorView')||document.querySelector('[id*="supervisor"][id*="View"]');
 if(!root)return;
 // Replace the actual Today-at-a-Glance/Technician-Board block using the current assignment data.
 let cards=[...root.querySelectorAll('.card')];
 let glance=cards.find(x=>(x.querySelector('h3')?.textContent||'').includes('Today at a Glance'));
 if(glance){
   let board=cards.find(x=>x.classList.contains('v56-technician-board-card')||((x.textContent||'').includes('TECHNICIAN BOARD')));
   let oldEff=[...root.querySelectorAll('.v75-eff-section')];
   let wrap=document.createElement('div');wrap.className='v74-supervisor-final';wrap.innerHTML=window.supervisorOverview(state.assign||[]);
   glance.replaceWith(wrap);
   if(board&&board.isConnected)board.remove();
   oldEff.forEach(x=>{if(x.isConnected&&!wrap.contains(x))x.remove()});
   cards.forEach(x=>{if(x.isConnected&&/Finished Job Cards/i.test(x.textContent||'')){x.className='card clickable compact-control';x.setAttribute('onclick','openSupervisorJobCardList()');x.innerHTML='<div class="section-title"><h3>📋 Job Card List</h3><span class="pill">Click to open</span></div><div class="small muted">All Job Cards · filters · sorting · export</div>'}});
 }
}
function v74ApplyManagerFinal(){if(me?.role==='Manager')polish()}
const v74SupRender=window.renderSupervisor;
if(typeof v74SupRender==='function')window.renderSupervisor=function(){let r=v74SupRender.apply(this,arguments);setTimeout(v74ApplySupervisorFinal,0);return r};
const v74MgrRender=window.renderManager;
if(typeof v74MgrRender==='function')window.renderManager=function(){let r=v74MgrRender.apply(this,arguments);setTimeout(v74ApplyManagerFinal,0);return r};

let s=document.createElement('style');s.textContent='.v74-d h2{margin-top:0}.v74-jc{padding:12px;background:#f8fafc;border-radius:10px;margin:10px 0}.v74-d textarea{width:100%;box-sizing:border-box}.v74-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}.v74-actions button{min-width:110px;min-height:46px}.v74-pause{background:#d97706}.v74-scroll{overflow:auto}.v74-scroll table{min-width:760px}.v74-six{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px}.v74-six .glance-box{min-height:92px;min-width:0;padding:10px 7px!important;display:flex;align-items:center;gap:10px;border-radius:14px;box-shadow:0 5px 12px #0f172214}.v74-icon{font-size:24px}.ga{background:#eaf3ff}.gp{background:#fff7df}.gf{background:#eaf9ef}.gr{background:#ecfdf5}.go{background:#f5f3ff}.gx{background:#ffecec}.v74-top{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important}.v74-ready{background:#ecfdf5!important;color:#166534!important}.v74-search{background:linear-gradient(#3b82f6,#1d4ed8)!important;color:#fff!important;box-shadow:0 5px 0 #1e3a8a,0 8px 14px #2563eb40!important;transform:translateY(-2px);font-weight:900!important}.v74-times{margin:14px 0;padding:12px;background:#eff6ff;border-radius:12px}.v74-jlfilters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px}.v74-jlfilters label{font-size:12px;font-weight:800}.v74-jlfilters input,.v74-jlfilters select{width:100%;box-sizing:border-box;margin-top:4px}.v74-export{display:flex;gap:8px;margin:10px 0 14px}.v74-times label{display:grid;grid-template-columns:1fr 110px;gap:6px;margin:8px 0}.v75-eff-head{align-items:center}.v75-eff-head label{font-size:12px;font-weight:800}.v75-eff-head input{margin-left:6px}.v75-eff-row{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:center}.v75-eff{background:transparent!important;color:#172033!important;box-shadow:none!important;display:flex;flex-direction:column;align-items:center;gap:8px}.v75-ring{width:178px;height:178px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:14px solid;box-shadow:inset 0 5px 14px #fff,0 9px 18px #0f172226,0 0 0 7px #ffffffaa}.v75-ring small{font-size:14px;font-weight:900;max-width:120px;line-height:1.15}.v75-ring b{font-size:36px;margin-top:8px}.v75-eff em{font-style:normal;font-weight:900}.v75-blue .v75-ring{background:#eaf3ff;border-color:#60a5fa;color:#123b72}.v75-green .v75-ring{background:#ecfdf3;border-color:#4ade80;color:#14532d}.v75-orange .v75-ring{background:#fff4e8;border-color:#fb923c;color:#7c2d12}.v75-delivery-ot{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.v75-delivery-ot .glance-box{margin:0}.v75-eff-logo{font-size:18px;font-weight:1000;line-height:1;margin-bottom:3px}.v75-ring{position:relative;box-shadow:inset 0 6px 15px #fff,inset 0 -6px 12px #00000014,0 10px 20px #0f17222b,0 0 0 7px #ffffffaa,0 14px 0 -7px #00000018!important}@media(max-width:700px){.v75-eff-row{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.v75-ring{width:96px;height:96px;border-width:8px}.v75-ring small{font-size:9px;max-width:76px}.v75-ring b{font-size:18px;margin-top:3px}.v75-eff-logo{font-size:13px}}@media(max-width:700px){.v74-top{gap:6px!important}.v74-top button{padding:8px!important}.v74-top button span{font-size:11px!important}.v74-top button small{display:none}}';document.head.appendChild(s);const reopen71=window.v71ReopenSameAssignment;window.v71ReopenSameAssignment=function(id){let a=(state.assign||[]).find(x=>x&&x.id===id&&!x.cancelled),no=a?.job,r=reopen71?.apply(this,arguments);if(no){let j=J(no),aa=AA(no);if(j&&aa.length&&!aa.every(x=>x.completed)){j.status='Open';delete j.completedAt;try{save()}catch(e){console.warn(e)}}}return r};window.v74Loaded=true})();

/* V74 Supervisor complete Job Card List */
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
 if(typeof showSupervisorModal==='function')showSupervisorModal('📋 Job Card List — All Job Cards',body);else if(typeof openModal==='function')openModal('<div class="section-title"><h2>📋 Job Card List — All Job Cards</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+body);setTimeout(v74JobListRender,0);
 }catch(err){console.error('Job Card List',err);if(typeof v74Msg==='function')v74Msg('Job Card List could not open. Please retry.','Job Card List')}
};
function v74ExportData(){return v74JobListRows().map(x=>{let names=[...new Set(x.aa.map(a=>v74JLP(a.emp).name))],s=x.finished?'Finished':x.paused?'Paused':x.repeat?'Repeat':x.aa.some(a=>!a.completed)?'In Progress':'Unassigned';return[ x.ts?new Date(x.ts).toLocaleDateString():'',x.j.no||'',x.j.vehicle||'',x.j.reg||'',names.join(', '),s]})}
window.v74ExportJobListExcel=function(){let rows=[['Date','Job Card','Vehicle','Registration','Employee','Status'],...v74ExportData()],csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');if(window.AndroidBridge&&AndroidBridge.saveExportFile){AndroidBridge.saveExportFile('Zukait_Job_Card_List.csv','text/csv',btoa(unescape(encodeURIComponent(csv))));return}v74Msg('Export is not available on this device.','Excel Export')};
window.v74ExportJobListPDF=function(){let rows=v74ExportData(),html='<html><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:20px}h2{text-align:center}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#eee}</style></head><body><h2>ZUKAIT AUTO — JOB CARD LIST</h2><table><tr><th>Date</th><th>Job Card</th><th>Vehicle</th><th>Registration</th><th>Employee</th><th>Status</th></tr>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+v74JLE(v)+'</td>').join('')+'</tr>').join('')+'</table></body></html>';if(window.AndroidBridge&&AndroidBridge.printHtml){AndroidBridge.printHtml(html)}else{let w=window.open('','_blank');if(w){w.document.write(html);w.document.close();w.print()}}};


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
   const car=()=>'<div class="v75s-car" aria-hidden="true"><i class="roof"></i><i class="body"></i><b class="w1"></b><b class="w2"></b></div>';
   const all=(state.assign||[]).filter(a=>a&&a.emp===me.id&&!a.cancelled);
   const open=all.filter(a=>!a.completed).sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0));
   const done=all.filter(a=>a.completed).sort((a,b)=>(b.completedAt||0)-(a.completedAt||0));
   const active=activeSession(me.id),aa=active?((state.assign||[]).find(a=>a&&a.id===active.assignmentId)||open.find(a=>a.job===active.job)):null;
   const j=active?jj(active.job):null,ac=aa?actual(aa):0,sg=aa?(+aa.suggested||0):0,remain=Math.max(0,sg-ac),over=Math.max(0,ac-sg),hold=!!active&&active.job===H;
   const startTime=active?clock(active.start):'—',running=active?fm((Date.now()-active.start)/60000):'0h 00m';

   if(!document.getElementById('v75stableEmployeeStyle')){
     const st=document.createElement('style');st.id='v75stableEmployeeStyle';st.textContent=`
#employeeView.v75s{font-family:Arial,Helvetica,sans-serif;color:#071b3d;background:#eef5fa;padding:0 0 24px}
.v75s-brand{margin:-2px -2px 12px;padding:16px 18px;background:linear-gradient(145deg,#12324e,#061827);color:#fff;display:flex;align-items:center;gap:12px;border-radius:0 0 18px 18px;box-shadow:0 8px 18px #0b1d2c30}
.v75s-logo{width:46px;height:46px;border-radius:12px;background:#fff;color:#0d3153;display:grid;place-items:center;font-size:28px;font-weight:1000;font-style:italic;box-shadow:inset 0 -4px 0 #dce5ec,0 4px 10px #0003}
.v75s-brand h2{margin:0;font-size:21px}.v75s-brand small{display:block;color:#cbd5e1;font-size:10px;letter-spacing:.08em;margin-top:2px}.v75s-menu{margin-left:auto;font-size:28px}
.v75s-identity{margin:0 10px 12px;background:linear-gradient(145deg,#fff,#f5f8fb);border:1px solid #dce5ee;border-radius:20px;min-height:58px;padding:0 18px;display:flex;align-items:center;box-shadow:0 7px 16px #17324b18,inset 0 1px #fff}
.v75s-identity b{font-size:19px}.v75s-online{margin-left:auto;background:#eaffea;border:1px solid #8cde96;border-radius:22px;padding:9px 13px;font-size:12px;font-weight:900;color:#174526;box-shadow:0 3px 8px #45b65b22}.v75s-online i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#15953a;margin-right:6px}
.v75s-shell{margin:0 10px 14px;padding:12px;background:linear-gradient(145deg,#fff,#f8fbfe);border:1px solid #d8e4ee;border-radius:22px;box-shadow:0 12px 24px #17324b20,0 2px 0 #fff inset}
.v75s-top{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(145px,.8fr);gap:12px}
.v75s-live{min-height:92px;padding:12px 15px;border-radius:19px;background:linear-gradient(145deg,#f3ffd8,#bceba9);display:flex;align-items:center;gap:12px;border:1px solid #b3de9c;box-shadow:inset 0 3px 8px #fff9,0 5px 10px #7daa6827}
.v75s-live.off{background:linear-gradient(145deg,#eff4f8,#dfe8ef);border-color:#d0dde6}.v75s-gear{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:#fff8;font-size:28px;box-shadow:inset 0 -4px 8px #0001,0 4px 10px #0001}.v75s-live h2{margin:0;font-size:22px}.v75s-live p{margin:4px 0 0;font-size:13px}
.v75s-clock{border-radius:19px;background:linear-gradient(145deg,#fff9dc,#f6ddb1);padding:12px;display:flex;flex-direction:column;justify-content:center;text-align:center;border:1px solid #efcf91;box-shadow:inset 0 3px 8px #fff9,0 5px 10px #af864327}.v75s-clock b{font-size:21px}.v75s-clock small{font-size:10px;margin-top:4px}
.v75s-hero{margin:12px 0 10px;padding:12px 14px;border-radius:18px;background:linear-gradient(145deg,#fff,#f7fafc);border:1px solid #e1e8ef;display:flex;align-items:center;min-height:82px;box-shadow:inset 0 2px #fff,0 4px 10px #0f17220d}.v75s-jno{font-size:12px;font-weight:900;color:#4b6478;letter-spacing:.04em}.v75s-vehicle{font-size:25px;font-weight:1000;margin-top:5px;line-height:1.05}.v75s-reg{font-size:15px;font-weight:800;color:#536779;margin-top:5px}.v75s-hero .v75s-car{margin-left:auto}
.v75s-car{position:relative;width:78px;height:46px;flex:0 0 78px}.v75s-car .body{position:absolute;left:5px;right:5px;bottom:9px;height:19px;background:#17324e;border-radius:13px 17px 7px 7px;box-shadow:inset 0 -5px #07182740}.v75s-car .roof{position:absolute;left:20px;top:6px;width:39px;height:18px;background:#385a74;transform:skew(-19deg);border-radius:9px 9px 2px 2px}.v75s-car b{position:absolute;bottom:2px;width:14px;height:14px;border-radius:50%;background:#101820;border:4px solid #d6dde3}.v75s-car .w1{left:14px}.v75s-car .w2{right:13px}
.v75s-timepair{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}.v75s-time{border-radius:17px;padding:10px 12px;text-align:center;border:1px solid;box-shadow:inset 0 3px 6px #fff8,0 5px 10px #00000010}.v75s-time.blue{background:linear-gradient(145deg,#e8f3ff,#bddcff);border-color:#9fc9f7}.v75s-time.gold{background:linear-gradient(145deg,#fff7d9,#f2dca4);border-color:#e5c77d}.v75s-time span{display:block;font-size:12px;font-weight:900}.v75s-time b{display:block;font-size:22px;margin-top:5px}
.v75s-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.v75s-metric{border-radius:15px;padding:9px 5px;text-align:center;border:1px solid;box-shadow:inset 0 3px 6px #fff8,0 5px 10px #0000000f}.v75s-metric span{display:block;font-size:10px;font-weight:900}.v75s-metric b{display:block;font-size:18px;margin-top:5px}.v75s-metric.alloc{background:#e8f2ff;border-color:#bad4f1}.v75s-metric.actual{background:#e7f8ea;border-color:#b8dfc0}.v75s-metric.remain{background:#fff7d9;border-color:#ecd487}.v75s-metric.over{background:#ffe7e7;border-color:#efb6b6}
.v75s-request{display:block;width:100%;margin:11px 0 0;padding:13px 10px;border-radius:14px;background:linear-gradient(#3587ef,#1768cc);font-weight:1000;font-size:15px;box-shadow:0 6px 0 #0d4f9e,0 10px 16px #1768cc36}
.v75s-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:11px}.v75s-actions.one{grid-template-columns:1fr}.v75s-actions button{min-height:55px;border-radius:15px;font-size:15px;font-weight:1000}.v75s-pause{background:linear-gradient(#f59e0b,#d97706)!important;box-shadow:0 6px 0 #a65304,0 10px 16px #d9770632}.v75s-finish{background:linear-gradient(#22a447,#128134)!important;box-shadow:0 6px 0 #086626,0 10px 16px #15803d32}
.v75s-allotted-head{margin:0 10px;padding:13px 14px;border-radius:18px;background:linear-gradient(145deg,#12324e,#061827);color:#fff;display:flex;align-items:center;gap:11px;box-shadow:0 7px 0 #04121f,0 12px 20px #0618272c}.v75s-allotted-head h2{margin:0;font-size:19px}.v75s-allotted-head p{margin:3px 0 0;color:#cbd5e1;font-size:10px}.v75s-count{margin-left:auto;background:#fff1;color:#fff;border:1px solid #ffffff33;border-radius:20px;padding:7px 10px;font-size:11px;font-weight:900}
.v75s-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 10px}.v75s-card{background:#fff;border:2px solid #c8d8e5;border-radius:18px;padding:11px;box-shadow:0 7px 14px #17324b18,inset 0 2px #fff}.v75s-card.running{border-color:#55bd6a;background:#f3fff5}.v75s-card.ideal{border-color:#cda66b;background:#fffaf0}.v75s-card-top{display:flex;gap:6px;align-items:center}.v75s-card-top b{font-size:13px}.v75s-badge{margin-left:auto;border-radius:12px;padding:4px 7px;font-size:8px;font-weight:1000;background:#e9eef3;color:#36495b}.v75s-card.running .v75s-badge{background:#dbf8df;color:#166534}.v75s-card h3{font-size:15px;margin:10px 0 4px}.v75s-card p{font-size:11px;color:#5b6e7c;margin:0 0 9px}.v75s-mini{display:grid;grid-template-columns:1fr 1fr;gap:6px}.v75s-mini div{background:#f3f6f9;border-radius:10px;padding:7px;text-align:center;font-size:9px}.v75s-mini b{display:block;font-size:13px;margin-top:3px}.v75s-start{width:100%;margin-top:9px;border-radius:11px;padding:10px;font-weight:1000;background:linear-gradient(#378bf5,#1d6fd4);box-shadow:0 4px 0 #1154a5}.v75s-start[disabled]{background:#d8e1e8;color:#64748b;box-shadow:none}.v75s-card .v75s-car{transform:scale(.72);transform-origin:left center;margin-top:3px}
.v75s-warning{margin:0 10px 12px;padding:10px 12px;border-radius:14px;background:#fff7d6;border:1px solid #ebd177;color:#6e5312;font-size:11px;font-weight:800}
.v75s-section{margin:12px 10px 0}.v75s-section.card{border-radius:19px;box-shadow:0 7px 16px #17324b16}.v75s-history{overflow:auto}.v75s-history table{min-width:620px}
@media(max-width:520px){.v75s-top{grid-template-columns:minmax(0,1.5fr) minmax(115px,.75fr)}.v75s-live{min-height:82px;padding:10px}.v75s-gear{width:44px;height:44px;font-size:22px}.v75s-live h2{font-size:17px}.v75s-clock b{font-size:16px}.v75s-vehicle{font-size:21px}.v75s-metrics{gap:5px}.v75s-metric{padding:8px 3px}.v75s-metric span{font-size:8px}.v75s-metric b{font-size:14px}.v75s-grid{gap:7px}.v75s-card{padding:9px}.v75s-card h3{font-size:13px}.v75s-mini b{font-size:11px}.v75s-identity b{font-size:16px}}
`;document.head.appendChild(st);
   }
   root.classList.add('v75s');

   const brand='<div class="v75s-brand"><div class="v75s-logo">Z</div><div><h2>Zukait Time Track</h2><small>WORK SMARTER • BETTER TOMORROW</small></div><div class="v75s-menu">☰</div></div>';
   const identity='<div class="v75s-identity"><b>'+esc(me.name)+' – Employee</b><span class="v75s-online"><i></i>ONLINE</span></div>';

   let runningHtml='<div class="v75s-shell"><div class="v75s-top"><div class="v75s-live '+(active?'':'off')+'"><div class="v75s-gear">'+(active?(hold?'◷':'⚙'):'○')+'</div><div><h2>'+(active?(hold?'IDEAL TIME':'RUNNING WORK'):'NO RUNNING WORK')+'</h2><p>'+(active?(hold?'Waiting Time Running...':'Work in Progress...'):'Select an allotted job below')+'</p></div></div><div class="v75s-clock"><b id="v75sClock">'+clock(Date.now())+'</b><small id="v75sDate">'+date(Date.now())+'</small></div></div>';
   if(active&&aa){
     runningHtml+='<div class="v75s-hero"><div><div class="v75s-jno">JOB NUMBER : <b>'+esc(active.job)+'</b></div><div class="v75s-vehicle">'+esc(hold?'IDEAL TIME':(j.vehicle||'—'))+'</div><div class="v75s-reg">'+esc(hold?'Waiting / No Assigned Work':(j.reg||'—'))+'</div></div>'+(hold?'<div class="v75s-gear" style="margin-left:auto">◷</div>':car())+'</div>'+
       '<div class="v75s-timepair"><div class="v75s-time blue"><span>◷ Start Time</span><b>'+esc(startTime)+'</b></div><div class="v75s-time gold"><span>◷ Running Time</span><b id="v75sRunning">'+esc(running)+'</b></div></div>'+
       '<div class="v75s-metrics"><div class="v75s-metric alloc"><span>Allocated Time</span><b>'+fm(sg)+'</b></div><div class="v75s-metric actual"><span>Actual Work Time</span><b id="currentActual">'+fm(ac)+'</b></div><div class="v75s-metric remain"><span>Time Remaining</span><b id="currentRemaining">'+fm(remain)+'</b></div><div class="v75s-metric over"><span>Exceeded Time</span><b id="currentExceeded">'+fm(hold?0:over)+'</b></div></div>'+
       (hold?'':'<button class="v75s-request" onclick="openEmployeeRequestMenu(\''+esc(active.job)+'\')">● INFORM / REQUEST</button>')+
       '<div class="v75s-actions '+(hold?'one':'')+'">'+(hold?'':'<button class="v75s-pause" onclick="pause()">Ⅱ PAUSE WORK</button>')+'<button class="v75s-finish" onclick="finish()">'+(hold?'■ STOP':'✓ FINISH WORK')+'</button></div>';
   }
   runningHtml+='</div>';

   const cards=open.length?open.map(a=>{const x=jj(a.job),run=!!active&&((active.assignmentId&&active.assignmentId===a.id)||(!active.assignmentId&&active.job===a.job)),holdCard=a.job===H,worked=actual(a),remaining=Math.max(0,(+a.suggested||0)-worked),badge=run?'RUNNING':(worked>0?'PAUSED':'NOT STARTED');return '<div class="v75s-card '+(run?'running ':'')+(holdCard?'ideal':'')+'"><div class="v75s-card-top"><b>JOB : '+esc(a.job)+'</b><span class="v75s-badge">'+badge+'</span></div><h3>'+esc(holdCard?'IDEAL TIME':(x.vehicle||'—'))+'</h3><p>'+esc(holdCard?'Waiting / No Assigned Work':(x.reg||'—'))+'</p>'+(holdCard?'<div class="v75s-gear" style="width:40px;height:40px;font-size:20px">◷</div>':car())+'<div class="v75s-mini"><div>Allocated<b>'+fm(a.suggested)+'</b></div><div>Remaining<b>'+fm(remaining)+'</b></div></div>'+(run?'<button class="v75s-start" disabled>CURRENTLY RUNNING</button>':active?'<button class="v75s-start" disabled>Pause current work first</button>':'<button class="v75s-start" onclick="start(\''+esc(a.job)+'\')">▶ START WORK</button>')+'</div>'}).join(''):'<div class="notice">No allotted job cards.</div>';
   const allotted='<div class="v75s-allotted-head"><div style="font-size:22px">▣</div><div><h2>ALLOTTED WORK</h2><p>Your assigned job cards (Pause current work to start another)</p></div><span class="v75s-count">'+open.length+' Job'+(open.length===1?'':'s')+'</span></div><div class="v75s-grid">'+cards+'</div>'+(active&&open.some(a=>!((active.assignmentId&&active.assignmentId===a.id)||(!active.assignmentId&&active.job===a.job)))?'<div class="v75s-warning">⚠ Please pause your current work before starting another job. You can work on only one job at a time.</div>':'');

   const nowTs=Date.now(),d=new Date(nowTs),mf=+new Date(d.getFullYear(),d.getMonth(),1),mt=+new Date(d.getFullYear(),d.getMonth()+1,1);
   const normalDone=done.filter(a=>a.job!==H&&(a.completedAt||0)>=mf&&(a.completedAt||0)<mt);
   const idealMin=(state.sessions||[]).filter(x=>x&&x.emp===me.id&&x.job===H&&x.start<mt&&(x.end||nowTs)>mf).reduce((n,x)=>n+(Math.min(x.end||nowTs,mt)-Math.max(x.start,mf))/60000,0);
   const overtimeMin=(state.sessions||[]).filter(x=>x&&x.emp===me.id&&x.job!==H&&x.start<mt&&(x.end||nowTs)>mf).reduce((n,x)=>{const st=Math.max(+x.start||0,mf),en=Math.min(+(x.end||nowTs),mt);if(en<=st)return n;try{return n+(typeof window.sessionOvertimeMinutes==='function'?window.sessionOvertimeMinutes({start:st,end:en},en):0)}catch(_){return n}},0);
   const normalSg=normalDone.reduce((n,a)=>n+(+a.suggested||0),0),normalAc=normalDone.reduce((n,a)=>n+actual(a),0),eff=normalAc?normalSg/normalAc*100:null;
   const month='<div class="card month-summary v75s-section"><div class="section-title"><h3>📅 This Month</h3><span class="pill">MONTHLY</span></div><div class="grid"><div class="notice"><b>Completed Jobs</b><div class="stat">'+normalDone.length+'</div></div><div class="notice"><b>Efficiency</b><div class="stat">'+(eff==null?'—':eff.toFixed(1)+'%')+'</div></div><div class="notice"><b>Total Ideal Time</b><div class="stat">'+fm(idealMin)+'</div></div><div class="notice"><b>Overtime</b><div class="stat">'+fm(overtimeMin)+'</div><span class="small">Monitoring only · excluded from efficiency and incentive</span></div></div></div>';
   const finished='<div class="card v75s-section"><div class="section-title"><h3>✅ Finished Jobs</h3><span class="pill">'+done.length+'</span></div>'+(done.length?'<div class="v75s-history"><table><tr><th>Job</th><th>Vehicle</th><th>Allocated</th><th>Actual</th><th>Finished</th></tr>'+done.slice(0,20).map(a=>{const x=jj(a.job);return '<tr><td><b>'+esc(a.job)+'</b></td><td>'+esc(a.job===H?'Ideal Time':(x.vehicle||'—'))+'</td><td>'+fm(a.suggested)+'</td><td>'+fm(actual(a))+'</td><td>'+esc(a.completedAt?new Date(a.completedAt).toLocaleString():'—')+'</td></tr>'}).join('')+'</table></div>':'<p class="muted">No finished jobs.</p>')+'</div>';
   const historyRows=(state.sessions||[]).filter(x=>x&&x.emp===me.id).slice().sort((a,b)=>(b.start||0)-(a.start||0)).slice(0,30);
   const history='<div class="card v75s-section"><div class="section-title"><h3>📊 Detailed Performance & Work History</h3><span class="pill">LATEST 30</span></div>'+(historyRows.length?'<div class="v75s-history"><table><tr><th>Job</th><th>Start</th><th>End</th><th>Status</th><th>Time</th></tr>'+historyRows.map(x=>{const end=x.end||Date.now(),mins=Math.max(0,(end-(+x.start||end))/60000);return '<tr><td><b>'+esc(x.job)+'</b></td><td>'+esc(x.start?new Date(x.start).toLocaleString():'—')+'</td><td>'+esc(x.end?new Date(x.end).toLocaleString():'In progress')+'</td><td>'+esc(x.end?(x.paused?'Paused':'Finished'):'Running')+'</td><td>'+fm(mins)+'</td></tr>'}).join('')+'</table></div>':'<p class="muted">No work history yet.</p>')+'</div>';

   root.innerHTML=brand+identity+runningHtml+allotted+month+finished+history;
   if(employeeClockTimer)clearInterval(employeeClockTimer);
   employeeClockTimer=setInterval(()=>{const c=document.getElementById('v75sClock'),dt=document.getElementById('v75sDate');if(c)c.textContent=clock(Date.now());if(dt)dt.textContent=date(Date.now());const x=activeSession(me.id);if(!x)return;const a=(state.assign||[]).find(z=>z&&z.id===x.assignmentId)||open.find(z=>z.job===x.job);if(!a)return;const worked=actual(a),alloc=+a.suggested||0,put=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};const rr=document.getElementById('v75sRunning');if(rr)rr.textContent=fm((Date.now()-x.start)/60000);put('currentActual',fm(worked));put('currentRemaining',fm(Math.max(0,alloc-worked)));put('currentExceeded',fm(x.job===H?0:Math.max(0,worked-alloc)))},1000);
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

 const idealGapMinutes=(emp,from,to)=>{
   const rows=(state.sessions||[]).filter(x=>x&&x.emp===emp&&x.start<to&&(x.end||Date.now())>from)
     .map(x=>({start:Math.max(+x.start||0,from),end:Math.min(+(x.end||Date.now()),to)}))
     .filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start);
   let sum=0,lastEnd=null;
   for(const x of rows){
     if(lastEnd!==null&&x.start>lastEnd)sum+=normalMinutes(lastEnd,x.start);
     lastEnd=lastEnd===null?x.end:Math.max(lastEnd,x.end);
   }
   return Math.max(0,sum);
 };
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
