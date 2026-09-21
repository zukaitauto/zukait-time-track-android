(function(){
'use strict';
const HOLD='ID001', RATE=2.5;
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const person=id=>{try{return user(id)||{id,name:id,department:''}}catch(_){return{id,name:id,department:''}}};
const jinfo=no=>{try{return job(no)||{no,vehicle:'',reg:''}}catch(_){return{no,vehicle:'',reg:''}}};
const status=a=>{try{return empStatus(a)}catch(_){return a?.completed?'Finished':'New'}};
const actual=a=>{try{return totalForAssignment(a)||0}catch(_){return 0}};
const fm=m=>{try{return fmt(Math.max(0,Number(m)||0))}catch(_){const n=Math.max(0,Math.round(Number(m)||0));return Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m'}};
const money=m=>'OMR '+((Math.max(0,Number(m)||0)/60)*RATE).toFixed(3);
const assignments=no=>(state.assign||[]).filter(a=>a&&a.job===no&&!a.cancelled);
const customerJobs=()=> (state.jobs||[]).filter(j=>j&&j.no!==HOLD);
const allFinished=no=>{const aa=assignments(no);return aa.length>0&&aa.every(a=>a.completed)};
const supModal=(title,body)=>{if(typeof showSupervisorModal==='function')return showSupervisorModal(title,body);if(typeof openModal==='function')return openModal('<div class="section-title"><h2>'+title+'</h2><button class="secondary" onclick="closeModal()">Close</button></div>'+body)};

function updateJobStatus(no){
 const j=jinfo(no);if(!j||no===HOLD)return;
 j.status=allFinished(no)?'Completed':'Open';
 if(j.status==='Completed')j.completedAt=Math.max(...assignments(no).map(a=>+a.completedAt||0),Date.now());
 else delete j.completedAt;
}
function exactAssignmentForSession(s){
 if(!s)return null;
 return (state.assign||[]).find(a=>a.id===s.assignmentId)||
   (state.assign||[]).filter(a=>a.job===s.job&&a.emp===s.emp&&!a.cancelled&&!a.completed).sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0))[0]||null;
}

/* ID001: fix missing latestOpen() regression and keep reusable one-open-card rule. */
const previousAssignJobCore=window.assignJobCore;
window.assignJobCore=function(no,emp,mins){
 if(no!==HOLD){
   if(typeof previousAssignJobCore==='function')return previousAssignJobCore(no,emp,mins);
   if(!Number.isFinite(mins)||mins<1)return alert('Enter valid allocated time. '+timeInputHint());
   state.assign.push({id:uid(),job:no,emp,suggested:mins,completed:false,rework:false,assignedBy:me.id,assignedAt:now()});
   save();render();return;
 }
 if(!me||me.role!=='Supervisor')return alert('Supervisor login is required.');
 if(!Number.isFinite(mins)||mins<1)return alert('Enter valid allocated time. '+timeInputHint());
 const open=(state.assign||[]).find(a=>a.job===HOLD&&a.emp===emp&&!a.cancelled&&!a.completed);
 if(open)return alert('ID001 is already assigned to '+person(emp).name+'. Finish / Stop the current ID001 before assigning it again.');
 state.assign.push({id:uid(),job:HOLD,emp,suggested:mins,completed:false,rework:false,assignedBy:me.id,assignedAt:now(),idealCard:true});
 if(typeof setLastAction==='function')setLastAction('Assigned ID001 to '+person(emp).name+' for '+fm(mins));
 save();render();
};

/* Employee Finish updates only the employee session and assignment.
   Job Card completion is derived from all live assignments. */
window.finish=function(){
 if(!me||me.role!=='Employee')return;
 const s=activeSession(me.id);if(!s)return alert('No active work to finish.');
 const a=exactAssignmentForSession(s);if(!a)return alert('Active assignment could not be found.');
 if(s.job===HOLD){
   if(!confirm('Stop ID001 Ideal Time Card?'))return;
 }else{
   const otherOpen=assignments(s.job).filter(x=>x.id!==a.id&&!x.completed).length;
   let msg='FINISH '+s.job+'?\n\nPlease confirm carefully. After Finish, this assignment can only be continued if the Supervisor REOPENS / REISSUES it.';
   if(otherOpen)msg+='\n\n'+otherOpen+' other technician assignment(s) are still open. The Job Card will remain in Assigned Jobs until all technicians finish.';
   else msg+='\n\nThis is the last open technician assignment. The Job Card will be shown as Finished after this action.';
   if(!confirm(msg))return;
 }
 s.end=now();s.finished=true;s.paused=false;
 a.completed=true;a.completedAt=s.end;
 if(typeof setLastAction==='function')setLastAction((s.job===HOLD?'Stopped ':'Finished ')+s.job);
 save();render();
};

/* Supervisor normal REOPEN / REISSUE — never marks it Repeat Work. */
window.v69ReissueJob=function(no){
 if(!me||me.role!=='Supervisor')return;
 const j=jinfo(no);if(!j||no===HOLD)return alert('Job Card not found.');
 const completed=assignments(no).filter(a=>a.completed&&!a.rework);
 if(!completed.length)return alert('There is no finished normal assignment to reopen on this Job Card.');
 const techs=users.filter(u=>u.role==='Employee');
 supModal('↻ Reopen / Reissue — '+E(no),
   '<div class="notice"><b>This is NORMAL WORK, not Repeat Work.</b><br>Previous worked hours remain unchanged in history.</div>'+
   '<div class="grid"><label><b>Technician</b><br><select id="v69ReissueTech">'+techs.map(u=>'<option value="'+E(u.id)+'">'+E(u.name)+' — '+E(u.department||'')+'</option>').join('')+'</select></label>'+
   '<label><b>New Allocated Time</b><br><input id="v69ReissueTime" value="1.00" inputmode="decimal"><div class="time-hint">'+timeInputHint()+'</div></label></div>'+
   '<p><button class="green" onclick="v69SaveReissue(\''+E(no)+'\')">REISSUE NORMAL WORK</button> <button class="secondary" onclick="closeSupervisorModal()">CANCEL</button></p>');
};
window.v69SaveReissue=function(no){
 const emp=document.getElementById('v69ReissueTech')?.value;
 const mins=parseWorkMinutes(document.getElementById('v69ReissueTime')?.value||'');
 if(!emp||person(emp).role!=='Employee')return alert('Select a technician.');
 if(!Number.isFinite(mins)||mins<1)return alert('Enter valid allocated time. '+timeInputHint());
 if(assignments(no).some(a=>a.emp===emp&&!a.completed))return alert(person(emp).name+' already has an open assignment on this Job Card.');
 const previous=assignments(no).filter(a=>a.completed&&!a.rework).sort((a,b)=>(b.completedAt||0)-(a.completedAt||0))[0];
 const a={id:uid(),job:no,emp,suggested:mins,completed:false,rework:false,reissued:true,reissuedFrom:previous?.id||null,assignedBy:me.id,assignedAt:now()};
 state.assign.push(a);updateJobStatus(no);
 state.reissueLogs=state.reissueLogs||[];state.reissueLogs.push({id:uid(),assignmentId:a.id,job:no,emp,minutes:mins,by:me.id,at:now()});
 if(typeof setLastAction==='function')setLastAction('Reissued normal work '+no+' to '+person(emp).name);
 save();
 if(typeof closeSupervisorModal==='function')closeSupervisorModal();else if(typeof closeModal==='function')closeModal();
 render();
};

/* Supervisor accidental-Finish correction: reopen the SAME assignment.
   Keeps employee, allocated time, prior actual minutes and assignment ID/history. */
window.v71ReopenSameAssignment=function(id){
 if(!me||me.role!=='Supervisor')return;
 const a=(state.assign||[]).find(x=>x&&x.id===id&&!x.cancelled);
 if(!a)return alert('Assignment not found.');
 if(a.job===HOLD)return alert('Use a new ID001 assignment instead.');
 if(a.rework)return alert('Repeat Work must be handled from Repeat Work controls.');
 if(!a.completed)return alert('This assignment is already open.');
 if((state.assign||[]).some(x=>x.id!==a.id&&x.job===a.job&&x.emp===a.emp&&!x.cancelled&&!x.completed)){
   return alert(person(a.emp).name+' already has an open assignment on this Job Card.');
 }
 const worked=actual(a),allocated=+a.suggested||0;
 const ok=confirm(
   'REOPEN SAME ASSIGNMENT?\n\nJob Card: '+a.job+
   '\nTechnician: '+person(a.emp).name+
   '\nAllocated Time: '+fm(allocated)+
   '\nExisting Actual Time: '+fm(worked)+
   '\n\nThis keeps the SAME employee, SAME allocated time and all previous worked time. It is NOT Repeat Work.'
 );
 if(!ok)return;
 const finishedAt=a.completedAt||null;
 a.completed=false;
 delete a.completedAt;
 a.reopened=true;
 a.lastReopenedAt=now();
 a.lastReopenedBy=me.id;
 state.reopenLogs=state.reopenLogs||[];
 state.reopenLogs.push({
   id:uid(),assignmentId:a.id,job:a.job,emp:a.emp,
   suggested:allocated,actualAtReopen:worked,
   previousCompletedAt:finishedAt,by:me.id,at:now()
 });
 const j=jinfo(a.job);if(j&&j.no){j.status='Open';delete j.completedAt;}
 if(typeof setLastAction==='function')setLastAction('Reopened same assignment '+a.job+' for '+person(a.emp).name);
 try{
   if(typeof addNotification==='function')addNotification([a.emp],'Supervisor reopened '+a.job+' with the same allocated time. Previous actual time is retained.',a.id);
 }catch(_){}
 save();
 if(typeof closeSupervisorModal==='function')closeSupervisorModal();
 render();
 alert(a.job+' reopened for '+person(a.emp).name+'. Existing actual time '+fm(worked)+' is retained.');
};

/* Robust Supervisor job detail. Fixes Need Attention -> View. */
window.openSupervisorJob=function(no){
 const j=jinfo(no);if(!j)return supModal('Job Card','<div class="notice">Job Card not found.</div>');
 const aa=assignments(no).slice().sort((a,b)=>(a.assignedAt||0)-(b.assignedAt||0));
 const totalS=aa.reduce((n,a)=>n+(+a.suggested||0),0),totalA=aa.reduce((n,a)=>n+actual(a),0);
 const rows=aa.length?'<div class="v69-table"><table><tr><th>Technician</th><th>Department</th><th>Type</th><th>Status</th><th>Allocated</th><th>Actual</th><th>Labour</th></tr>'+
   aa.map(a=>'<tr><td><b>'+E(person(a.emp).name)+'</b></td><td>'+E(person(a.emp).department||'—')+'</td><td>'+(a.rework?'Repeat':a.reissued?'Reissued':a.reopened?'Reopened':'Normal')+'</td><td>'+E(status(a))+(a.completed&&!a.rework?' <br><button class="green" style="margin-top:6px" onclick="v71ReopenSameAssignment(\\''+E(a.id)+'\\')">↻ REOPEN SAME</button>':'')+'</td><td>'+fm(+a.suggested||0)+'</td><td>'+fm(actual(a))+'</td><td>'+money(actual(a))+'</td></tr>').join('')+'</table></div>':'<div class="notice">No assignments.</div>';
 const canReissue=aa.some(a=>a.completed&&!a.rework);
 const buttons=(no===HOLD?'':'<p>'+(canReissue?'<button class="green" onclick="v69ReissueJob(\''+E(no)+'\')">↻ REOPEN / REISSUE</button> ':'')+
   '<button class="purple" onclick="addRepeatWork(\''+E(no)+'\')">🔁 REPEAT WORK</button></p>');
 supModal('Job Card '+E(no),
   '<div class="notice"><b>Vehicle:</b> '+E(j.vehicle||'—')+'<br><b>Registration:</b> '+E(j.reg||'—')+'<br><b>Total Allocated:</b> '+fm(totalS)+' · <b>Total Actual:</b> '+fm(totalA)+'<br><b>Job Card Status:</b> '+(allFinished(no)?'FINISHED':'ASSIGNED / OPEN')+'</div>'+rows+buttons);
};

/* Paused / Over Allocated lists — dependable handlers. */
function listTable(rows){
 if(!rows.length)return '<div class="notice">No matching Job Cards.</div>';
 return '<div class="v69-table"><table><tr><th>JC</th><th>Vehicle / Reg.</th><th>Technician</th><th>Department</th><th>Status</th><th>Allocated</th><th>Actual</th><th></th></tr>'+
 rows.map(a=>{const j=jinfo(a.job),u=person(a.emp);return '<tr><td><b>'+E(a.job)+'</b></td><td>'+E(j.vehicle||'—')+'<br><span class="small">'+E(j.reg||'—')+'</span></td><td>'+E(u.name)+'</td><td>'+E(u.department||'—')+'</td><td>'+E(status(a))+'</td><td>'+fm(+a.suggested||0)+'</td><td>'+fm(actual(a))+'</td><td><button class="blue" onclick="openSupervisorJob(\''+E(a.job)+'\')">VIEW</button></td></tr>'}).join('')+'</table></div>';
}
window.openGlanceList=function(type){
 const open=(state.assign||[]).filter(a=>a&&!a.cancelled&&!a.completed&&a.job!==HOLD);
 let rows=[],title='Job Cards';
 if(type==='paused'){rows=open.filter(a=>status(a)==='Paused');title='⏸ Paused Jobs'}
 else if(type==='over'||type==='overdue'){rows=open.filter(a=>{const sg=+a.suggested||0;return sg>0&&actual(a)>sg});title='⚠ Over Allocated Time'}
 else if(type==='completed'){return window.openSupervisorFinishedWindow()}
 else rows=open;
 supModal(title,listTable(rows));
};
window.v42SupervisorList=function(type){
 if(type==='paused'||type==='over')return window.openGlanceList(type);
 const open=(state.assign||[]).filter(a=>a&&!a.cancelled&&!a.completed);
 let rows=open,title='Assignments';
 if(type==='working'){rows=open.filter(a=>a.job!==HOLD&&status(a)==='Started');title='Working Now'}
 if(type==='new'){rows=open.filter(a=>a.job!==HOLD&&status(a)==='New');title='Not Started'}
 if(type==='repeat'){rows=open.filter(a=>a.rework);title='Repeat Work'}
 supModal(title,listTable(rows));
};

/* Assigned Jobs: simple Search placeholder; a JC stays here while any assignment is open. */
window.openSupervisorAssignedWindow=function(){
 const rows=(state.assign||[]).filter(a=>a&&!a.cancelled&&!a.completed).slice().sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0));
 supModal('📋 Assigned Job Cards',
   '<div class="row"><input id="v69AssignedSearch" style="flex:1;min-width:220px" placeholder="Search" oninput="v69FilterAssigned()"><span class="pill">'+rows.length+' OPEN</span></div>'+
   '<div id="v69AssignedRows" style="margin-top:12px">'+listTable(rows)+'</div>');
};
window.v69FilterAssigned=function(){
 const q=(document.getElementById('v69AssignedSearch')?.value||'').trim().toLowerCase();
 const rows=(state.assign||[]).filter(a=>a&&!a.cancelled&&!a.completed).filter(a=>{
   const j=jinfo(a.job),u=person(a.emp);
   return !q||[a.job,j.vehicle,j.reg,u.name,u.department,status(a)].join(' ').toLowerCase().includes(q);
 }).slice().sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0));
 const el=document.getElementById('v69AssignedRows');if(el)el.innerHTML=listTable(rows);
};

/* Finished Jobs are unique by JC and appear only when ALL assignments are finished. */
window.openSupervisorFinishedWindow=function(){
 const rows=customerJobs().filter(j=>allFinished(j.no)).sort((a,b)=>{
   const at=no=>Math.max(0,...assignments(no).map(x=>+x.completedAt||0));
   return at(b.no)-at(a.no);
 });
 const body=rows.length?'<div class="v69-table"><table><tr><th>Job Card</th><th>Vehicle / Reg.</th><th>Worked Persons</th><th>Total Allocated</th><th>Total Actual</th><th></th></tr>'+
 rows.map(j=>{const aa=assignments(j.no),names=[...new Set(aa.map(a=>person(a.emp).name))],sg=aa.reduce((n,a)=>n+(+a.suggested||0),0),ac=aa.reduce((n,a)=>n+actual(a),0);return '<tr><td><b>'+E(j.no)+'</b></td><td>'+E(j.vehicle||'—')+'<br><span class="small">'+E(j.reg||'—')+'</span></td><td>'+names.map(E).join(', ')+'</td><td>'+fm(sg)+'</td><td>'+fm(ac)+'</td><td><button class="blue" onclick="openSupervisorJob(\''+E(j.no)+'\')">VIEW</button></td></tr>'}).join('')+'</table></div>':'<div class="notice">No fully finished Job Cards.</div>';
 supModal('✅ Finished Job Cards',body);
};

/* Active Workers: soft department colours, 3D effect, expandable technicians. */
window.openActiveWorkers=function(){
 const active=(state.sessions||[]).filter(s=>!s.end);
 const rows=active.map(s=>({s,a:exactAssignmentForSession(s),u:person(s.emp),j:jinfo(s.job)})).filter(x=>x.a);
 const deptName={Denter:'Denting',Painter:'Painting',Mechanic:'Mechanical'};
 const groups=['Denter','Painter','Mechanic'].map(dept=>{
   const list=rows.filter(x=>x.u.department===dept);
   return '<section class="v69-dept v69-'+dept.toLowerCase()+'"><div class="v69-dept-head"><b>'+deptName[dept]+'</b><span>'+list.length+'</span></div>'+
    (list.length?list.map(x=>'<details class="v69-worker"><summary>'+E(x.u.name)+' <small>'+E(x.s.job)+'</small></summary><div><b>Job Card:</b> '+E(x.s.job)+'<br><b>Vehicle:</b> '+E(x.j.vehicle||'—')+' · '+E(x.j.reg||'—')+'<br><b>Allocated:</b> '+fm(+x.a.suggested||0)+'<br><b>Actual:</b> '+fm(actual(x.a))+'<br><b>Status:</b> '+E(status(x.a))+'<br><button class="blue" onclick="openSupervisorJob(\''+E(x.s.job)+'\')">VIEW JOB</button></div></details>').join(''):'<div class="v69-empty">No active workers</div>')+'</section>';
 }).join('');
 supModal('👷 Active Workers','<div class="v69-dept-grid">'+groups+'</div>');
};

/* Technician selector colour markers + remove unwanted helper/placeholder text. */
function polishSupervisor(){
 if(!me||me.role!=='Supervisor')return;
 const root=document.getElementById('supervisorView');if(!root)return;
 [...root.querySelectorAll('*')].forEach(el=>{
   if(el.children.length===0&&/Technicians are color coded/i.test(el.textContent||''))el.remove();
 });
 root.querySelectorAll('input[placeholder]').forEach(i=>{
   if(/search.*(jc|job card|vehicle|registration)/i.test(i.placeholder||''))i.placeholder='Search';
 });
 ['se','se2'].forEach(id=>{
   const sel=document.getElementById(id);if(!sel)return;
   [...sel.options].forEach(o=>{
     if(o.dataset.v69)return;o.dataset.v69='1';
     const u=person(o.value),dept=u.department||'';
     const mark=dept==='Denter'?'🟣':dept==='Painter'?'🟠':dept==='Mechanic'?'🔵':'⚪';
     if(!String(o.textContent||'').startsWith(mark))o.textContent=mark+' '+String(o.textContent||'');
     o.style.color=dept==='Denter'?'#5b21b6':dept==='Painter'?'#c2410c':dept==='Mechanic'?'#1d4ed8':'#334155';
     o.style.fontWeight='700';
   });
 });
}

/* Native Android voice recognition; browser speech is fallback only for PC/web. */
window.v69OnVoiceResult=function(text,error){
 const btn=document.getElementById('reqVoiceBtn'),st=document.getElementById('reqVoiceStatus'),box=document.getElementById('reqMessage');
 if(btn){btn.disabled=false;btn.textContent='🎤 VOICE INPUT'}
 if(error){if(st)st.textContent=error;return}
 const value=String(text||'').trim();
 if(value&&box)box.value=(box.value?box.value.trim()+' ':'')+value;
 if(st)st.textContent=value?'Voice text added — review before sending':'No speech detected';
};
window.startRequestVoice=function(){
 const btn=document.getElementById('reqVoiceBtn'),st=document.getElementById('reqVoiceStatus');
 try{
   if(window.AndroidBridge&&typeof AndroidBridge.startNativeVoiceRecognition==='function'){
     if(btn){btn.disabled=true;btn.textContent='🎤 LISTENING...'}
     if(st)st.textContent='Listening — speak now';
     AndroidBridge.startNativeVoiceRecognition();
     return;
   }
 }catch(e){if(btn){btn.disabled=false;btn.textContent='🎤 VOICE INPUT'}}
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){if(st)st.textContent='Voice recognition is not available on this device.';return}
 const box=document.getElementById('reqMessage');if(!box)return;
 const r=new SR();r.lang='en-US';r.interimResults=false;r.continuous=false;
 if(btn){btn.disabled=true;btn.textContent='🎤 LISTENING...'}if(st)st.textContent='Listening — speak now';
 r.onresult=e=>{const t=Array.from(e.results||[]).map(x=>x[0]?.transcript||'').join(' ').trim();window.v69OnVoiceResult(t,'')};
 r.onerror=e=>window.v69OnVoiceResult('','Voice recognition error: '+(e.error||'try again'));
 r.onend=()=>{if(btn){btn.disabled=false;btn.textContent='🎤 VOICE INPUT'}};
 try{r.start()}catch(_){window.v69OnVoiceResult('','Voice recognition could not start.')}
};

const css=document.createElement('style');css.id='v69Style';css.textContent=`
.v69-table{overflow:auto}.v69-table table{min-width:760px}
.v69-dept-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.v69-dept{border-radius:16px;padding:12px;border:1px solid;box-shadow:0 8px 18px rgba(34,55,80,.10),inset 0 1px rgba(255,255,255,.9)}.v69-dept-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.v69-dept-head b{font-size:15px}.v69-dept-head span{background:rgba(255,255,255,.72);border:1px solid currentColor;border-radius:999px;padding:3px 8px;font-weight:900}.v69-denter{background:#f4efff;color:#5b21b6;border-color:#dfd2f7}.v69-painter{background:#fff2e8;color:#c2410c;border-color:#f5d7c0}.v69-mechanic{background:#edf5ff;color:#1d4ed8;border-color:#cedff7}.v69-worker{background:rgba(255,255,255,.72);border:1px solid rgba(100,116,139,.25);border-radius:10px;margin:7px 0;padding:8px}.v69-worker summary{cursor:pointer;font-weight:900}.v69-worker summary small{float:right;font-weight:700}.v69-worker>div{padding:9px 2px 2px;line-height:1.65;color:#243247}.v69-empty{background:rgba(255,255,255,.55);border-radius:9px;padding:10px;font-size:12px}
@media(max-width:760px){.v69-dept-grid{grid-template-columns:1fr}}
`;document.head.appendChild(css);

const prevRender=window.render;
window.render=function(){prevRender();setTimeout(polishSupervisor,0)};
setTimeout(polishSupervisor,100);
window.v69UpdateCheckResult=function(latestCode,latestName,error){if(typeof window.v68UpdateCheckResult==='function')return window.v68UpdateCheckResult(latestCode,latestName,error)};
window.v69Ready=true;
})();