import {allocationToken,workedMinutes,employeeTimeToken,assignmentHasStarted} from './time_management_rules.js?v=2026102701';
const displayWorkedMinutes=(s,a)=>window.zukaitJobCardMaster?.actualMinutes?.(a)??workedMinutes(s,a);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const allowed=()=>typeof me!=='undefined'&&me&&['Supervisor','Manager'].includes(me.role);
const data=()=>({...state,users:typeof users!=='undefined'?users:state.users||[]});
const staff=id=>data().users.find(u=>String(u.id)===String(id));
const vehicle=j=>[j.vehicle||j.make||'',j.model||'',j.year||''].filter(Boolean).join(' ');
const fmtTime=m=>{const n=Math.max(0,Math.floor(Number(m)||0));return Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m'};
const get=id=>document.getElementById(id),active=a=>a&&!a.completed&&!a.cancelled&&!a.rework&&a.job!=='ID001';
let selectedJob='',request=null,busy=false,opening=0;
const errors={time_work_already_started:'This work has already started and cannot be cancelled.',time_sessions_changed:'Work records changed on another phone. Reload and review the assignment.',time_permission_denied:'Your login cannot change allocated time.',time_allocation_changed:'The first allocation changed on another device. Review the updated values.',time_target_changed:'The second allocation changed on another device. Review the updated values.',split_exceeds_remaining:'Only the remaining unworked time can be split. Reduce the transfer and review again.',time_assignment_inactive:'This assignment is no longer active. Select another assignment.',time_job_inactive:'This job card is no longer active.',split_technician_invalid:'Select a different technician.',split_target_ambiguous:'This technician has a repeat or duplicate assignment. Use the assignment controls to resolve it first.',time_reason_required:'Enter the reason for this time change.',invalid_time_change:'Enter valid hours and minutes. The new allocation cannot be negative.',TIME_SYNC_PENDING:'Workshop changes are still syncing. Try again after sync finishes.',NETWORK:'Connection unavailable. Reconnect and retry the same confirmation.',TIMEOUT:'The response timed out. Retry the same confirmation to check its result safely.',time_conflict:'The workshop is busy syncing. Retry the same confirmation.'};
function notice(text){const el=get('tmNotice');if(el)el.textContent=text}
function source(){return (state.assign||[]).find(a=>String(a.id)===get('tmSource')?.value)}
function target(){const a=source(),emp=get('tmTarget')?.value;return (state.assign||[]).find(x=>active(x)&&String(x.job)===String(a?.job)&&String(x.emp)===String(emp))||null}
function clearReview(){request=null;const el=get('tmReview');if(el){el.hidden=true;el.innerHTML=''}notice('')}
function setControlsDisabled(value){const fs=get('tmInputs');if(fs)fs.disabled=value;const confirm=get('tmConfirm');if(confirm)confirm.disabled=value}
function values(){const h=Number(get('tmHours')?.value),m=Number(get('tmMinutes')?.value);return Number.isInteger(h)&&h>=0&&Number.isInteger(m)&&m>=0&&m<60?h*60+m:NaN}
function preview(){
 const a=source(),el=get('tmPreview');if(!a||!el)return;const op=get('tmMode').value,mins=values(),worked=displayWorkedMinutes(data(),a),old=Number(a.suggested)||0,newValue=op==='ADD'?old+mins:old-mins;
 const cancelOption=get('tmMode').querySelector?.('option[value="CANCEL_UNSTARTED"]');if(cancelOption)cancelOption.disabled=assignmentHasStarted(data(),a);
 const duration=get('tmPage')?.querySelector?.('.tm-duration');if(duration)duration.hidden=op==='CANCEL_UNSTARTED';
 get('tmTargetLabel').hidden=op!=='SPLIT';get('tmReasonLabel').textContent=op==='SPLIT'?'Reason for Split (required)':'Reason (required)';
 get('tmMetrics').innerHTML=[['Allocated',old],['Worked',worked],['Remaining',Math.max(0,old-worked)]].map(([label,value])=>'<div><span>'+label+'</span><b>'+fmtTime(value)+'</b></div>').join('');
 if(op==='CANCEL_UNSTARTED'){el.textContent=assignmentHasStarted(data(),a)?errors.time_work_already_started:'Cancel this unstarted allocation only. The job card and other technicians are unchanged.';return}
 if(!Number.isFinite(mins)||mins<1){el.textContent='Enter the time to '+(op==='ADD'?'add':op==='REDUCE'?'reduce':'split')+'.';return}
 if(newValue<0){el.textContent='The new allocation cannot be negative.';return}
 const t=target(),targetTotal=(Number(t?.suggested)||0)+mins;
 el.innerHTML='<span>'+esc(staff(a.emp)?.name||a.emp)+' · New allocation</span><b>'+fmtTime(newValue)+'</b><small>'+(newValue<worked?'Exceeded: '+fmtTime(worked-newValue):'New remaining: '+fmtTime(newValue-worked))+'</small>'+(op==='SPLIT'?'<hr><span>'+esc(staff(get('tmTarget').value)?.name||'Select another technician')+' · New allocation</span><b>'+fmtTime(targetTotal)+'</b><small>Total job allocation stays unchanged. Both technicians may work simultaneously.</small>':'');
}
window.zukaitTimeChanged=function(){if(busy)return;clearReview();preview()};
window.zukaitTimeSourceChanged=function(){
 if(busy)return;const a=source(),sel=get('tmTarget');if(!sel)return;
 const previous=sel.value;sel.innerHTML='<option value="">Select another technician</option>'+data().users.filter(u=>u&&u.role==='Employee'&&u.active!==false&&String(u.id)!==String(a?.emp)).map(u=>'<option value="'+esc(u.id)+'">'+esc(u.name||u.id)+' · '+esc(u.department||'Technician')+'</option>').join('');
 if([...sel.options].some(o=>o.value===previous))sel.value=previous;
 window.zukaitTimeChanged();
};
window.zukaitTimeSearch=function(){
 if(busy||!allowed())return;clearReview();const q=String(get('tmSearch')?.value||'').trim().toLowerCase(),norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const matches=q?(state.jobs||[]).filter(j=>j&&j.no!=='ID001'&&!j.delivered&&!j.archived&&!j.deleted&&[j.no,j.reg,vehicle(j)].some(v=>String(v||'').toLowerCase().includes(q)||(norm(q)&&norm(v).includes(norm(q))))).sort((a,b)=>Number(String(b.no).toLowerCase()===q)-Number(String(a.no).toLowerCase()===q)):[];
 get('tmSearchResults').innerHTML=matches.length?matches.slice(0,30).map(j=>'<button type="button" data-jc="'+esc(j.no)+'" onclick="zukaitTimeSelectJob(this.dataset.jc)"><b>JC '+esc(j.no)+'</b><span>'+esc(vehicle(j))+' · '+esc(j.reg||'—')+'</span></button>').join(''):'<p>'+(q?'No active job cards match.':'Enter a job card or registration.')+'</p>';
};
window.zukaitTimeSelectJob=function(no){
 if(busy||!allowed())return;const j=(state.jobs||[]).find(j=>String(j.no)===String(no));if(!j)return;selectedJob=String(no);clearReview();get('tmSearchResults').innerHTML='';
 get('tmJob').innerHTML='<b>JC '+esc(j.no)+' · '+esc(vehicle(j))+'</b><span>Registration: '+esc(j.reg||'—')+'</span>';
 const rows=(state.assign||[]).filter(a=>active(a)&&String(a.job)===selectedJob),sel=get('tmSource');sel.innerHTML=rows.map(a=>'<option value="'+esc(a.id)+'">'+esc(staff(a.emp)?.name||a.emp)+' · '+esc(staff(a.emp)?.department||'Technician')+'</option>').join('');
 get('tmEditor').hidden=!rows.length;if(!rows.length)notice('No unfinished normal assignments. Assign a technician first. ID001 and repeat work use their own controls.');else window.zukaitTimeSourceChanged();
};
window.zukaitTimeReview=async function(){
 if(busy||!allowed())return;const a=source();if(!active(a))return notice('Select an active technician assignment.');
 const op=get('tmMode').value,minutes=values(),reason=String(get('tmReason').value||'').trim(),recipient=get('tmTarget').value;
 if(op==='CANCEL_UNSTARTED'&&assignmentHasStarted(data(),a))return notice(errors.time_work_already_started);
 if(op!=='CANCEL_UNSTARTED'&&(!Number.isSafeInteger(minutes)||minutes<1||minutes>60000))return notice(errors.invalid_time_change);
 if(!reason||reason.length>500)return notice(errors.time_reason_required);
 if(op==='SPLIT'&&(!recipient||recipient===String(a.emp)))return notice(errors.split_technician_invalid);
 busy=true;setControlsDisabled(true);const host=get('tmPage');
 try{
  await window.zukaitCloud.syncNow();const health=window.zukaitCloud.syncHealth;
  if(!navigator.onLine||!health?.ready||health.dirty||health.pushing||health.pulling||health.pendingConflict||health.lastError)throw Error('TIME_SYNC_PENDING');
  if(get('tmPage')!==host||!allowed())return;
  const fresh=source();if(!active(fresh))throw Error('time_assignment_inactive');
  if(op==='CANCEL_UNSTARTED'){
   if(assignmentHasStarted(data(),fresh))throw Error('time_work_already_started');
   request={requestId:'tm-'+crypto.randomUUID(),operation:op,assignmentId:String(fresh.id),reason,expectedSource:allocationToken(fresh),expectedSessions:employeeTimeToken(data(),fresh.emp)};
   get('tmReview').hidden=false;get('tmReview').innerHTML='<h3>Cancel Allotted Work?</h3><p>JC '+esc(fresh.job)+' · '+esc(staff(fresh.emp)?.name||fresh.emp)+'</p><p>Only this unstarted assignment will be cancelled.</p><p><b>Reason:</b> '+esc(reason)+'</p><div class="tm-actions"><button type="button" class="tm-back" onclick="zukaitTimeEdit()">← Back</button><button id="tmConfirm" type="button" class="tm-close" onclick="zukaitTimeConfirm()">Confirm Cancellation</button></div>';notice('Review the assignment and confirm cancellation.');return;
  }
  const worked=displayWorkedMinutes(data(),fresh),old=Number(fresh.suggested)||0,next=op==='ADD'?old+minutes:old-minutes;
  if(next<0)throw Error('invalid_time_change');if(op==='SPLIT'&&minutes>Math.max(0,old-worked)+0.000001)throw Error('split_exceeds_remaining');
  const targetRow=target();request={requestId:'tm-'+crypto.randomUUID(),operation:op,assignmentId:String(fresh.id),targetEmployeeId:op==='SPLIT'?recipient:'',minutes,reason,expectedSource:allocationToken(fresh),expectedTarget:allocationToken(targetRow)};
  preview();get('tmReview').hidden=false;get('tmReview').innerHTML='<h3>Review '+(op==='SPLIT'?'Split Time':op==='REDUCE'?'Reduce Time':'Add Time')+'</h3><p>'+esc(staff(fresh.emp)?.name||fresh.emp)+': '+fmtTime(old)+' → <b>'+fmtTime(next)+'</b></p>'+(op==='SPLIT'?'<p>'+esc(staff(recipient)?.name||recipient)+': '+fmtTime(Number(targetRow?.suggested)||0)+' → <b>'+fmtTime((Number(targetRow?.suggested)||0)+minutes)+'</b></p>':'')+'<p><b>Reason:</b> '+esc(reason)+'</p><p>Recorded worked time stays unchanged.</p><div class="tm-actions"><button type="button" class="tm-back" onclick="zukaitTimeEdit()">← Edit</button><button id="tmConfirm" type="button" class="tm-save" onclick="zukaitTimeConfirm()">✓ Confirm Save</button></div>';
  notice('Review the allocations and confirm to save.');
 }catch(e){notice(errors[e.message]||'Could not load the latest workshop data. Please sync and try again.')}finally{busy=false;setControlsDisabled(false)}
};
window.zukaitTimeEdit=function(){if(!busy)clearReview()};
window.zukaitTimeConfirm=async function(){
 if(busy||!request||!allowed())return;busy=true;setControlsDisabled(true);const host=get('tmPage');
 try{const result=await window.zukaitCloud.timeManagement(request);if(get('tmPage')!==host||!allowed())return;busy=false;clearReview();window.zukaitTimeSelectJob(selectedJob);notice(result.duplicate?'This time change was already saved. Latest data loaded.':'Time change saved and synchronized.');}
 catch(e){if(get('tmPage')!==host)return;notice(errors[e.code||e.message]||'Could not confirm this time change. Retry the same confirmation.');if(['time_id001_conflict','time_employee_invalid','time_work_already_started','time_sessions_changed','time_allocation_changed','time_target_changed','split_exceeds_remaining','time_assignment_inactive','time_job_inactive'].includes(e.code||e.message)){request=null;get('tmReview').hidden=true;preview();}}
 finally{busy=false;setControlsDisabled(false)}
};
window.zukaitOpenTimeManagement=async function(initialJob=''){
 if(!allowed()||busy)return;const health=window.zukaitCloud.syncHealth;if(health?.dirty||health?.pendingConflict||health?.lastError)return alert('Pending workshop changes are preserved. Resolve the pending save using Sync before editing time.');const token=++opening;
 try{if(!navigator.onLine)throw Error('NETWORK');await window.zukaitCloud.syncNow();const h=window.zukaitCloud.syncHealth;if(!h?.ready||h.dirty||h.pendingConflict||h.lastError)throw Error('TIME_SYNC_PENDING');}
 catch(e){return alert(errors[e.message]||'Sync the workshop before opening Time Management.')}
 if(token!==opening||!allowed())return;request=null;selectedJob='';
 openModal('<section id="tmPage" class="tm-page"><div class="tm-header"><h2>⏱ Time Management</h2><button type="button" class="tm-close" onclick="closeModal()">✕ Close</button></div><button type="button" class="tm-back" onclick="closeModal()">← Back</button><p>Add, reduce or split allotted time, or cancel work that has not started.</p><button type="button" class="tm-back" onclick="zukaitOpenJobTimeInspection()">🔎 Job Card Time Inspection · JC / Registration</button><fieldset id="tmInputs"><label>Search JC / registration<div class="tm-search"><input id="tmSearch" type="search" oninput="zukaitTimeSearch()" onkeydown="if(event.key===\'Enter\'){event.preventDefault();zukaitTimeSearch()}"><button type="button" class="tm-back" onclick="zukaitTimeSearch()">Search</button></div></label><div id="tmSearchResults" class="tm-results"></div><div id="tmJob" class="tm-job"></div><div id="tmEditor" hidden><label>Currently assigned technician<select id="tmSource" onchange="zukaitTimeSourceChanged()"></select></label><div id="tmMetrics" class="tm-metrics"></div><label>Action<select id="tmMode" onchange="zukaitTimeChanged()"><option value="ADD">＋ Add Time</option><option value="REDUCE">− Reduce Time</option><option value="SPLIT">⇄ Split / Transfer Time</option><option value="CANCEL_UNSTARTED">✕ Cancel Allotted Work (not started)</option></select></label><label id="tmTargetLabel" hidden>Assign time to technician<select id="tmTarget" onchange="zukaitTimeChanged()"></select></label><div class="tm-duration"><label>Hours<input id="tmHours" type="number" min="0" max="1000" step="1" inputmode="numeric" value="0" oninput="zukaitTimeChanged()"></label><label>Minutes<input id="tmMinutes" type="number" min="0" max="59" step="1" inputmode="numeric" value="30" oninput="zukaitTimeChanged()"></label></div><div id="tmPreview" class="tm-preview"></div><label><span id="tmReasonLabel">Reason (required)</span><textarea id="tmReason" maxlength="500" rows="3" oninput="zukaitTimeChanged()"></textarea></label><button type="button" class="tm-save" onclick="zukaitTimeReview()">Review & Confirm</button></div></fieldset><div id="tmNotice" class="tm-notice" role="status" aria-live="polite"></div><div id="tmReview" class="tm-review" hidden></div></section>');
 if(initialJob){get('tmSearch').value=String(initialJob);window.zukaitTimeSelectJob(String(initialJob))}else get('tmSearch').focus();
};
const style=document.createElement('style');style.textContent=`
.tm-page{color:#172b45}.tm-page fieldset{border:0;padding:0;margin:0;min-width:0}.tm-page [hidden]{display:none!important}.tm-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.tm-header h2{font-size:24px;margin:8px 0 14px}.tm-page label{display:grid;gap:7px;margin:14px 0;font-size:16px;font-weight:800}.tm-page input,.tm-page select,.tm-page textarea{box-sizing:border-box;min-width:0;width:100%;padding:12px;border:1px solid #c1d5e8;border-radius:12px;background:#fff;color:#172b45;font-size:16px;min-height:46px}.tm-page button{padding:12px 16px;border-radius:12px;font-size:16px;font-weight:800;min-height:46px;cursor:pointer}.tm-close{background:linear-gradient(145deg,#fff5f5,#ffe3e8)!important;color:#923247!important;border:1px solid #eab9c5!important;box-shadow:inset 0 2px #fff,0 3px #dfbac3}.tm-back{background:linear-gradient(145deg,#fff,#e2efff)!important;color:#24568b!important;border:1px solid #bbd1eb!important;box-shadow:inset 0 2px #fff,0 3px #c3d4e8}.tm-save{width:100%;background:linear-gradient(145deg,#53b989,#228257)!important;color:#fff!important;border:1px solid #248457!important;box-shadow:inset 0 2px #b7edd1,0 3px #1d6b4b}.tm-search,.tm-duration,.tm-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}.tm-duration{grid-template-columns:repeat(2,minmax(0,1fr))}.tm-results{display:grid;gap:7px}.tm-results button{display:grid;gap:4px;text-align:left;background:#f1f7ff;color:#213d61;border:1px solid #c9dcee}.tm-results button span{font-size:14px}.tm-job{display:grid;gap:6px;margin-top:12px;font-size:17px}.tm-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:16px 0}.tm-metrics>div{padding:13px 8px;border:1px solid #c6d7ea;border-radius:14px;background:linear-gradient(145deg,#fff,#eaf2ff);box-shadow:inset 0 2px #fff,0 3px #d1ddeb}.tm-metrics>div:nth-child(2){background:linear-gradient(145deg,#fff,#f1eaff)}.tm-metrics>div:nth-child(3){background:linear-gradient(145deg,#fff,#e5f6eb)}.tm-metrics span{display:block;font-size:13px;font-weight:700}.tm-metrics b{display:block;font-size:22px;margin-top:5px}.tm-preview,.tm-review{padding:16px;margin:16px 0;border:1px solid #c5d7e9;border-radius:16px;background:linear-gradient(145deg,#fff,#edf5ff);box-shadow:inset 0 2px #fff,0 3px #d2dfeb}.tm-preview span,.tm-preview b,.tm-preview small{display:block}.tm-preview b{font-size:24px;margin:5px 0}.tm-preview small{font-size:14px;line-height:1.4}.tm-notice{font-size:16px;font-weight:700;line-height:1.5;margin-top:14px;overflow-wrap:anywhere}.tm-page button:disabled{opacity:.55;cursor:wait}.tm-page button:focus-visible{outline:3px solid #327dc1;outline-offset:4px}@media(max-width:400px){.tm-header h2{font-size:20px}.tm-metrics b{font-size:18px}.tm-page button{padding:10px}.tm-actions{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;document.head.appendChild(style);

// Manager hub is separate from the established Supervisor allocation editor.
const manager=()=>typeof me!=='undefined'&&me?.role==='Manager';
const managerLabels={CANCEL_UNSTARTED:'Cancel Allotted Work',CORRECT_SESSION:'Time Correction',ADD_SESSION:'Add Missing Time',CANCEL_SESSION:'Delete / Cancel Time Entry',CANCEL_ASSIGNMENT:'Cancel Allotted Work',SET_ALLOCATION:'Edit Allocated Time',REOPEN:'Reopen Work',REASSIGN:'Reassign Work'};
const managerErrors={...errors,time_id001_conflict:'The employee has running ID001 time. Review and resolve it before continuing work.',time_employee_invalid:'Select an active employee.',time_after_job_closed:'Missing time must finish on or before the recorded delivery/archive time.',invalid_work_status:'Choose Pause, Finished or Continue Working.',time_later_session:'Select the latest work session to change its status. Later work must be preserved.',time_reopen_required:'This assignment is completed. Use Reopen Work first to make it resumable.',time_assignment_ambiguous:'This legacy session needs its assignment verified before changing status.',time_sessions_changed:'Work records changed on another device. Open the action again and review.',time_session_inactive:'Select a finished, valid work session. Running sessions must be stopped first.',invalid_session_time:'Enter valid start and finish times in the past, with finish after start (maximum seven days).',time_session_overlap:'This time overlaps another work session for the employee.',time_work_running:'The employee is working on this assignment. Ask them to pause or finish before changing it.',time_reassign_work_logged:'Reassignment is available before work is recorded. Use Split Time for remaining work.',time_request_reused:'This confirmation was changed. Open the action and review again.'};
let managerRequest=null,managerBusy=false,managerAssignment='',managerOpening=0,managerView=null,managerViewer='';
// Retain only an uncertain Manager Continue command, never renderable workshop data.
const managerTimeJournalKey=()=> 'zukait_manager_time_pending_v1:'+String(me?.id||'');
function managerTimeJournal(){
 if(typeof localStorage==='undefined')return null;
 const raw=localStorage.getItem(managerTimeJournalKey());if(!raw)return null;
 const saved=JSON.parse(raw);
 if(saved.actor!==String(me.id)||saved.command?.operation!=='ADD_SESSION'||saved.command?.workStatus!=='CONTINUE'||!/^tm-[a-zA-Z0-9-]{16,100}$/.test(saved.command.requestId||''))throw Error('time_pending_invalid');
 return saved.command;
}
function keepManagerTimeJournal(command){const prior=managerTimeJournal();if(prior&&JSON.stringify(prior)!==JSON.stringify(command))throw Error('time_request_reused');localStorage.setItem(managerTimeJournalKey(),JSON.stringify({actor:String(me.id),command}));}
window.zukaitManagerTimeRetry=function(){
 if(!manager()||managerBusy)return;
 try{const command=managerTimeJournal();if(!command)return;managerRequest=command;managerAssignment=command.assignmentId;
 openModal(managerHead('Confirm pending Continue Working')+'<p>A previous save is unconfirmed. Retry the same command to reconcile its server receipt.</p><p>'+esc(new Date(command.start).toLocaleString())+' → Running</p><p>Reason: '+esc(command.reason)+'</p><div id="mtNotice" role="status"></div><div id="mtReview"><button id="mtConfirm" type="button" onclick="zukaitManagerTimeConfirm()">Retry same confirmation</button></div></section>');
 }catch{alert('The pending time change could not be read. Preserve device data and ask the Manager to reconcile it.');}
};
const managerData=()=>managerView&&managerViewer===String(me?.id||'')?managerView:{users:[],jobs:[],assign:[],sessions:[]};
const managerStaff=id=>(managerData().users||[]).find(u=>String(u.id)===String(id));
const managerPending=()=>{const h=window.zukaitCloud.syncHealth;return !h?.ready||h.dirty||h.pushing||h.pulling||h.pendingConflict||h.lastError};
const pendingMessage='Pending workshop changes are preserved on this device. Work history is available. Resolve the pending save using Sync before editing time.';

const localTime=t=>{if(!t)return '';const d=new Date(Number(t));return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const managerRow=()=> (managerData().assign||[]).find(a=>String(a.id)===managerAssignment);
const managerSessions=a=>(managerData().sessions||[]).filter(s=>s&&String(s.emp)===String(a.emp)&&(s.assignmentId?String(s.assignmentId)===String(a.id):String(s.job)===String(a.job))).slice().sort((a,b)=>Number(b.start)-Number(a.start));
function managerHead(title){return '<section class="tm-page"><div class="tm-header"><h2>'+esc(title)+'</h2><button type="button" class="tm-close" onclick="closeModal()">✕ Close</button></div><button type="button" class="tm-back" onclick="zukaitOpenManagerTimeManagement()">← Time Management</button>'}
window.zukaitOpenManagerTimeManagement=async function(){
 if(!manager()||managerBusy)return;const token=++managerOpening,actor=String(me.id);managerView=null;managerViewer='';
 try{
  if(!navigator.onLine)throw Error('NETWORK');
  // Navigation reads confirmed records; it must never retry an unrelated pending save.
  const result=await window.zukaitCloud.readLatest();
  if(token!==managerOpening||!manager()||String(me.id)!==actor)return;
  managerView=result.data;managerViewer=actor;
 }catch(e){if(token===managerOpening&&manager()&&String(me.id)===actor)alert(managerErrors[e.code||e.message]||'Could not load work history. Please try again.');return}
 managerRequest=null;
 try{if(managerTimeJournal()){window.zukaitManagerTimeRetry();return}}catch{alert('The pending time change could not be read. Preserve device data and ask the Manager to reconcile it.');return}
 openModal(managerHead('⏱ Time Management')+(managerPending()?'<p class="tm-notice" role="status">'+esc(pendingMessage)+'</p>':'')+'<p>Select the work to correct. Every saved change requires a reason and is kept in audit history.</p><div class="tm-actions"><button type="button" class="tm-back" onclick="zukaitOpenJobTimeInspection()">🔎 Job Card Time Inspection</button><button type="button" class="tm-back" onclick="zukaitOpenTimeManagement()">Add / Reduce / Split Time</button><button type="button" class="tm-back" onclick="zukaitManagerTimeHistory()">Work History / Audit</button></div><label>Search employee / JC / registration<input id="mtSearch" type="search" oninput="zukaitManagerTimeSearch()"></label><div id="mtRows" class="tm-results"></div></section>');
 window.zukaitManagerTimeSearch();
};
window.zukaitManagerTimeSearch=function(){
 if(!manager()||managerBusy)return;const out=get('mtRows');if(!out)return;const q=String(get('mtSearch')?.value||'').trim().toLowerCase();
 const rows=(managerData().assign||[]).filter(a=>{const j=(managerData().jobs||[]).find(j=>String(j.no)===String(a.job))||{},u=managerStaff(a.emp)||{};return [a.job,j.reg,vehicle(j),a.emp,u.name].join(' ').toLowerCase().includes(q)}).slice().sort((a,b)=>Number(b.assignedAt)-Number(a.assignedAt));
 out.innerHTML=(rows.length?rows.slice(0,100).map(a=>'<button type="button" data-id="'+esc(a.id)+'" onclick="zukaitManagerTimeSelect(this.dataset.id)"><b>JC '+esc(a.job)+' · '+esc(managerStaff(a.emp)?.name||a.emp)+'</b><span>'+esc(a.cancelled?'Cancelled':a.completed?'Completed':'Open')+' · Allocated '+fmtTime(a.suggested)+'</span></button>').join(''):'<p>No matching work.</p>')+(rows.length>100?'<p>Showing 100 assignments. Refine the search.</p>':'');
};
window.zukaitManagerTimeSelect=function(id){
 if(!manager()||managerBusy)return;const a=(managerData().assign||[]).find(a=>String(a.id)===String(id));if(!a)return;managerAssignment=String(id);managerRequest=null;
 const ss=managerSessions(a),normal=a.job!=='ID001'&&!a.rework,j=(managerData().jobs||[]).find(j=>String(j.no)===String(a.job))||{},editable=!a.cancelled&&!j.deleted;
 const button=op=>'<button type="button" class="tm-back" data-operation="'+op+'" onclick="zukaitManagerTimeAction(this.dataset.operation)">'+esc(managerLabels[op])+'</button>';
 const cancelUnstarted=!a.completed&&normal&&!assignmentHasStarted(managerData(),a)?button('CANCEL_ASSIGNMENT'):'';
 const allocations=editable&&!j.delivered&&!j.archived?(a.completed?(normal?button('REOPEN'):''):(normal?button('SET_ALLOCATION')+button('REASSIGN'):'')+cancelUnstarted):'';
 openModal(managerHead('JC '+a.job+' · '+(managerStaff(a.emp)?.name||a.emp))+'<div class="tm-job"><b>'+esc(a.cancelled?'Cancelled assignment':a.completed?'Completed work':'Allocated work')+'</b><span>Allocated '+fmtTime(a.suggested)+' · Worked '+fmtTime(workedMinutes(managerData(),a))+'</span></div><div class="tm-actions">'+allocations+(editable?button('ADD_SESSION'):'')+'</div><h3>Work History</h3><div class="tm-results">'+(ss.length?ss.map(s=>'<div class="tm-preview"><b>'+esc(s.cancelled?'Cancelled':s.end?(s.finished?'Finished':s.paused?'Paused':'Finished'):'Running')+'</b><span>'+esc(new Date(s.start).toLocaleString())+' → '+esc(s.end?new Date(s.end).toLocaleString():'In progress')+'</span>'+(editable&&s.end&&!s.cancelled?'<div class="tm-actions"><button type="button" class="tm-back" data-id="'+esc(s.id)+'" onclick="zukaitManagerTimeAction(\'CORRECT_SESSION\',this.dataset.id)">Edit / Correct Time</button><button type="button" class="tm-close" data-id="'+esc(s.id)+'" onclick="zukaitManagerTimeAction(\'CANCEL_SESSION\',this.dataset.id)">Delete / Cancel Time Entry</button></div>':'')+'</div>').join(''):'<p>No work sessions recorded.</p>')+'</div><button type="button" class="tm-back" onclick="zukaitManagerTimeHistory(true)">View Audit History</button></section>');
};
window.zukaitManagerTimeAction=function(op,sessionId=''){
 if(!manager()||managerBusy||!managerLabels[op])return;try{if(managerTimeJournal()){window.zukaitManagerTimeRetry();return}}catch{return alert('Pending time change needs reconciliation. Preserve device data.')}if(managerPending())return alert(pendingMessage);const a=managerRow();if(!a||a.cancelled)return;const s=managerSessions(a).find(s=>String(s.id)===String(sessionId));
 if(op==='CANCEL_ASSIGNMENT'&&(!active(a)||assignmentHasStarted(managerData(),a)))return alert(errors.time_work_already_started);
 managerRequest={requestId:'tm-'+crypto.randomUUID(),operation:op==='CANCEL_ASSIGNMENT'?'CANCEL_UNSTARTED':op,assignmentId:String(a.id),sessionId:String(sessionId),expectedSource:allocationToken(a),expectedSessions:employeeTimeToken(managerData(),a.emp)};
 const j=(managerData().jobs||[]).find(j=>String(j.no)===String(a.job))||{},historicalAdd=op==='ADD_SESSION'&&!!(j.delivered||j.archived);
 const statusOptions=historicalAdd?'<option value="FINISHED">Finished — record historical time only</option>':'<option value="">Select Pause or Finished</option><option value="PAUSED">Pause — keep available to resume</option><option value="FINISHED">Finished — complete technician assignment</option>'+((op==='ADD_SESSION'&&!a.completed&&a.job!=='ID001')?'<option value="CONTINUE">Continue Working — start running work</option>':'');
 const times=['CORRECT_SESSION','ADD_SESSION'].includes(op)?'<label>Start<input id="mtStart" type="datetime-local" value="'+esc(localTime(s?.start))+'"></label><label id="mtEndLabel">Finish / Pause<input id="mtEnd" type="datetime-local" value="'+esc(localTime(s?.end))+'"></label>':'';
 const allocation=op==='SET_ALLOCATION'?'<div class="tm-duration"><label>Hours<input id="mtHours" type="number" min="0" max="1000" step="1" value="'+Math.floor((Number(a.suggested)||0)/60)+'"></label><label>Minutes<input id="mtMinutes" type="number" min="0" max="59" step="1" value="'+((Number(a.suggested)||0)%60)+'"></label></div>':'';
 const recipient=op==='REASSIGN'?'<label>New technician<select id="mtRecipient"><option value="">Select technician</option>'+managerData().users.filter(u=>u.role==='Employee'&&u.active!==false&&String(u.id)!==String(a.emp)).map(u=>'<option value="'+esc(u.id)+'">'+esc(u.name||u.id)+'</option>').join('')+'</select></label>':'';
 const explanation=op==='CANCEL_ASSIGNMENT'?'Only this unstarted assignment will be cancelled. The job card and other technicians are unchanged.':op==='CANCEL_SESSION'?'This incorrect interval will count as zero time. Its original values remain in audit history.':op==='REASSIGN'?'Only work with no recorded sessions can be reassigned.':op==='REOPEN'?'The same assignment and previous worked time will be retained.':'Review the corrected values before saving.';
 openModal(managerHead(managerLabels[op])+'<p>JC '+esc(a.job)+' · '+esc(managerStaff(a.emp)?.name||a.emp)+'</p><p>'+explanation+'</p>'+(historicalAdd?'<p>This job is delivered or archived. Add missing historical time as Finished; the job stays closed.</p>':'')+'<fieldset id="mtInputs">'+times+(['CORRECT_SESSION','ADD_SESSION'].includes(op)?'<label>Work status (required)<select id="mtWorkStatus" onchange="zukaitManagerTimeStatusChanged()">'+statusOptions+'</select></label>':'')+allocation+recipient+'<label>Reason (required)<textarea id="mtReason" maxlength="500" rows="3"></textarea></label><button type="button" class="tm-save" onclick="zukaitManagerTimeReview()">Review Change</button></fieldset><div id="mtNotice" class="tm-notice" role="status" aria-live="polite"></div><div id="mtReview" hidden></div></section>');
};
window.zukaitManagerTimeStatusChanged=function(){const continuing=get('mtWorkStatus')?.value==='CONTINUE';if(get('mtEndLabel'))get('mtEndLabel').hidden=continuing;if(get('mtEnd'))get('mtEnd').disabled=continuing;};
window.zukaitManagerTimeReview=function(){
 if(!manager()||managerBusy||!managerRequest)return;try{if(managerTimeJournal()){window.zukaitManagerTimeRetry();return}}catch{return alert('Pending time change needs reconciliation. Preserve device data.')}const reason=String(get('mtReason')?.value||'').trim(),out=get('mtNotice');if(!reason)return out.textContent=errors.time_reason_required;
 const req={...managerRequest,reason};
 if(['CORRECT_SESSION','ADD_SESSION'].includes(req.operation)){req.workStatus=get('mtWorkStatus')?.value;if(!['PAUSED','FINISHED','CONTINUE'].includes(req.workStatus)||(req.workStatus==='CONTINUE'&&req.operation!=='ADD_SESSION'))return out.textContent=managerErrors.invalid_work_status;}
 if(['ADD_SESSION','CORRECT_SESSION'].includes(req.operation)){req.start=new Date(get('mtStart').value).getTime();req.end=req.workStatus==='CONTINUE'?null:new Date(get('mtEnd').value).getTime();if(!Number.isSafeInteger(req.start)||req.start>Date.now()||(req.workStatus!=='CONTINUE'&&(!Number.isSafeInteger(req.end)||req.end<=req.start||req.end>Date.now())))return out.textContent=managerErrors.invalid_session_time;}
 if(req.operation==='SET_ALLOCATION'){const h=Number(get('mtHours').value),m=Number(get('mtMinutes').value);if(!Number.isInteger(h)||h<0||!Number.isInteger(m)||m<0||m>59)return out.textContent=errors.invalid_time_change;req.minutes=h*60+m;}
 if(req.operation==='REASSIGN'){req.targetEmployeeId=get('mtRecipient').value;if(!req.targetEmployeeId)return out.textContent=errors.split_technician_invalid;}
 managerRequest=req;get('mtInputs').disabled=true;out.textContent='';const review=get('mtReview');review.hidden=false;
 review.innerHTML='<div class="tm-review"><h3>Confirm '+esc(managerLabels[req.operation])+'</h3>'+(req.start?'<p>'+esc(new Date(req.start).toLocaleString())+' → '+(req.end===null?'Running — no end time':esc(new Date(req.end).toLocaleString()))+'</p>':'')+(req.minutes!==undefined?'<p>New allocation: '+fmtTime(req.minutes)+'</p>':'')+(req.targetEmployeeId?'<p>New technician: '+esc(managerStaff(req.targetEmployeeId)?.name||req.targetEmployeeId)+'</p>':'')+(req.workStatus?'<p><b>Work status:</b> '+(req.workStatus==='CONTINUE'?'Continue Working — timer runs from the entered start time.':req.workStatus==='FINISHED'?'Finished — removed from active work; hours retained for costing.':'Paused — available to resume.')+'</p>':'')+'<p><b>Reason:</b> '+esc(reason)+'</p><div class="tm-actions"><button type="button" class="tm-back" onclick="zukaitManagerTimeEdit()">← Edit</button><button id="mtConfirm" type="button" class="tm-save" onclick="zukaitManagerTimeConfirm()">Confirm Save</button></div></div>';
};
window.zukaitManagerTimeEdit=function(){if(!manager()||managerBusy)return;try{if(managerTimeJournal()){window.zukaitManagerTimeRetry();return}}catch{return alert('Pending time change needs reconciliation. Preserve device data.')}get('mtInputs').disabled=false;get('mtReview').hidden=true};
window.zukaitManagerTimeConfirm=async function(){
 if(!manager()||managerBusy||!managerRequest||get('mtReview')?.hidden!==false)return;managerBusy=true;const host=get('mtReview'),req=managerRequest,actor=String(me.id);get('mtConfirm').disabled=true;
 try{const continuing=req.operation==='ADD_SESSION'&&req.workStatus==='CONTINUE';if(managerPending()&&!continuing)throw Error('TIME_SYNC_PENDING');if(continuing)keepManagerTimeJournal(req);const result=await window.zukaitCloud.timeManagement(req);if(continuing){if(result?.audit?.id!==req.requestId||String(result?.audit?.by)!==actor)throw Error('time_receipt_unconfirmed');localStorage.removeItem('zukait_manager_time_pending_v1:'+actor);}if(!manager()||String(me.id)!==actor||get('mtReview')!==host)return;managerView=JSON.parse(JSON.stringify({...state,users:typeof users!=='undefined'?users:state.users||[]}));managerViewer=actor;managerRequest=null;managerBusy=false;window.zukaitManagerTimeSelect(req.assignmentId);}
 catch(e){if(get('mtReview')!==host)return;get('mtNotice').textContent=managerErrors[e.code||e.message]||'Could not confirm this change. Retry the same confirmation.';if(['time_id001_conflict','time_employee_invalid','time_work_already_started','time_sessions_changed','time_allocation_changed','time_assignment_inactive','time_target_changed','time_session_inactive','time_job_inactive','time_work_running','time_session_overlap','invalid_session_time','time_reassign_work_logged','time_later_session','time_reopen_required','time_assignment_ambiguous','invalid_work_status'].includes(e.code||e.message)){if(req.workStatus==='CONTINUE')localStorage.removeItem('zukait_manager_time_pending_v1:'+actor);managerRequest=null;host.hidden=true;if(get('mtInputs'))get('mtInputs').disabled=true;get('mtNotice').textContent+=' Go back to Time Management and review the latest work.';}}
 finally{managerBusy=false;if(get('mtConfirm'))get('mtConfirm').disabled=false;}
};
window.zukaitManagerTimeHistory=function(selected=false){
 if(!manager()||managerBusy)return;const a=selected?managerRow():null;
 const rows=(managerData().additionalActions||[]).filter(x=>x&&(x.managerTime||x.source==='Time Management')&&(!a||String(x.assignmentId)===String(a.id))).slice().sort((a,b)=>Number(b.at)-Number(a.at));
 const corrections=(managerData().corrections||[]).filter(x=>!rows.some(y=>y.id===x.id)&&(!a||managerSessions(a).some(s=>String(s.id)===String(x.session))));
 openModal(managerHead('Work History / Audit')+(a?'<button type="button" class="tm-back" data-id="'+esc(a.id)+'" onclick="zukaitManagerTimeSelect(this.dataset.id)">← Assignment Work History</button>':'<p>Search an employee or JC in Time Management to view individual work sessions.</p>')+'<div class="tm-results">'+[...rows,...corrections.map(x=>({...x,type:'Time Correction',before:{start:x.oldStart,end:x.oldEnd},after:{start:x.newStart,end:x.newEnd}}))].sort((a,b)=>Number(b.at)-Number(a.at)).map(x=>'<div class="tm-preview"><b>'+esc(x.type)+' · '+esc(x.job||'')+'</b><span>'+esc(new Date(x.at).toLocaleString())+' · '+esc(managerStaff(x.by)?.name||x.by)+'</span><p>Reason: '+esc(x.reason||'—')+'</p><details><summary>Original / changed values</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(JSON.stringify(x.before!==undefined?{before:x.before,after:x.after,...(x.assignmentBefore?{assignmentBefore:x.assignmentBefore,assignmentAfter:x.assignmentAfter}:{})}:{allocatedBefore:x.oldSuggested,allocatedAfter:x.newSuggested,targetBefore:x.targetOldSuggested,targetAfter:x.targetNewSuggested},null,2))+'</pre></details></div>').join('')+'<p>'+(!rows.length&&!corrections.length?'No time changes recorded.':'Original records and reasons are retained.')+'</p></div></section>');
};


/* V377 Job Card Time Inspection.
   Read-only server snapshot for Manager and Supervisor.
   Never changes allocations or sessions; Repeat Work is shown separately. */
let inspectionSnapshot=null,inspectionActor='',inspectionRequest=0,inspectionQuery='',inspectionJob='';
const inspectionData=()=>allowed()&&inspectionActor===String(me?.id||'')?inspectionSnapshot:null;
const inspectionKey=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const inspectionMinutes=(d,a)=>{
 try{
  const n=Number(workedMinutes(d,a,Date.now()));
  return Number.isFinite(n)?Math.max(0,n):0;
 }catch(_){return 0;}
};
const inspectionFormat=n=>fmtTime(Math.max(0,Math.round(Number(n)||0)));
const inspectionAssignments=(d,no)=>(d.assign||[]).filter(a=>a&&!a.cancelled&&String(a.job)===String(no)&&String(a.job).toUpperCase()!=='ID001');
const inspectionEmployeeRows=(d,no)=>{
 const groups=new Map();
 for(const a of inspectionAssignments(d,no)){
  const id=String(a.emp||'');if(!id)continue;
  if(!groups.has(id)){
   const u=(d.users||[]).find(x=>x&&String(x.id)===id)||{};
   groups.set(id,{id,name:u.name||id,department:u.department||'Technician',assigned:0,actual:0,repeat:0,repeatAssigned:0,assignments:[],running:false});
  }
  const row=groups.get(id),minutes=inspectionMinutes(d,a);
  if(a.rework){row.repeat+=minutes;row.repeatAssigned+=Math.max(0,Number(a.suggested)||0);}
  else{row.assigned+=Math.max(0,Number(a.suggested)||0);row.actual+=minutes;}
  row.assignments.push(a);
  if(!a.completed&&(d.sessions||[]).some(s=>s&&s.end==null&&!s.cancelled&&String(s.assignmentId||'')===String(a.id)))row.running=true;
 }
 return [...groups.values()].map(x=>({...x,remaining:Math.max(0,x.assigned-x.actual),exceeded:Math.max(0,x.actual-x.assigned)}))
   .sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
};
const inspectionMetricIcons={
 assigned:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 18h3"/>',
 actual:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 3"/>',
 remaining:'<path d="M6 3h12M6 21h12M7 3c0 5 5 5 5 9s-5 4-5 9M17 3c0 5-5 5-5 9s5 4 5 9"/>',
 exceeded:'<path d="M10.6 4.2a1.7 1.7 0 0 1 2.8 0l8 14a1.7 1.7 0 0 1-1.4 2.6H4a1.7 1.7 0 0 1-1.4-2.6zM12 9v5M12 18h.01"/>',
 repeat:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 5M4 12l1 5a8 8 0 0 0 14-2"/>',
 neutral:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 3"/>'
};
const inspectionMetric=(name,value)=>{
 const key=({'Assigned Time':'assigned','Total Assigned':'assigned','Actual Time':'actual','Total Actual':'actual','Remaining Time':'remaining','Exceeded Time':Number(value)>0?'exceeded':'neutral','Repeat Hours':'repeat'})[name]||'neutral';
 return '<div class="tm-inspect-metric tm-inspect-metric--'+key+'"><span class="tm-inspect-metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+inspectionMetricIcons[key]+'</svg></span><span class="tm-inspect-metric-text"><span>'+esc(name)+'</span><b>'+inspectionFormat(value)+'</b></span></div>';
};
const inspectionJobOf=(d,no)=>(d.jobs||[]).find(j=>j&&String(j.no)===String(no)&&String(j.no)!=='ID001')||null;
const inspectionBack=()=>'<button type="button" class="tm-back" onclick="zukaitTimeInspectSearchPage()">← Back to Search</button>';
const inspectionShell=(title,body,appearance='')=>openModal('<section class="tm-page tm-inspection'+(appearance==='employee'?' tm-inspection-employee':'')+'"><div class="tm-header"><h2>'+esc(title)+'</h2><button type="button" class="tm-close" onclick="closeModal()">✕ Close</button></div>'+body+'</section>');
window.zukaitOpenJobTimeInspection=async function(query=''){
 if(!allowed())return;
 const ticket=++inspectionRequest,actor=String(me.id);
 try{
  if(!navigator.onLine||typeof window.zukaitCloud?.readLatest!=='function')throw Error('OFFLINE');
  const result=await window.zukaitCloud.readLatest();
  if(ticket!==inspectionRequest||!allowed()||String(me.id)!==actor)return;
  if(!result?.data||!Array.isArray(result.data.jobs)||!Array.isArray(result.data.assign)||!Array.isArray(result.data.sessions))throw Error('INVALID_SERVER_RECORDS');
  inspectionSnapshot=result.data;inspectionActor=actor;inspectionQuery=String(query||'');inspectionJob='';
  window.zukaitTimeInspectSearchPage();
 }catch(e){
  if(ticket===inspectionRequest&&allowed()&&String(me.id)===actor)alert('Could not load confirmed Job Card time records from the server. Connect and retry.');
 }
};
window.zukaitTimeInspectionReturn=function(){
 inspectionSnapshot=null;inspectionActor='';inspectionJob='';inspectionQuery='';
 ++inspectionRequest;
 if(me?.role==='Manager')return window.zukaitOpenManagerTimeManagement();
 return window.zukaitOpenTimeManagement();
};
window.zukaitTimeInspectSearchPage=function(){
 if(!inspectionData())return;
 inspectionJob='';
 inspectionShell('Job Card Time Inspection','<button type="button" class="tm-back" onclick="zukaitTimeInspectionReturn()">← Time Management</button>'+
  '<p>Read-only server records. Search any JC number or registration, including finished and delivered jobs.</p>'+
  '<label>Search JC Number / Registration Number<input id="tmInspectQuery" type="search" autocomplete="off" placeholder="Enter JC or registration" value="'+esc(inspectionQuery)+'" oninput="zukaitTimeInspectSearch()"></label>'+
  '<button type="button" class="tm-back" onclick="zukaitOpenJobTimeInspection(document.getElementById(\'tmInspectQuery\')?.value||\'\')">↻ Refresh from Server</button>'+
  '<div id="tmInspectResults" class="tm-results" aria-live="polite"></div>');
 window.zukaitTimeInspectSearch();
};
window.zukaitTimeInspectSearch=function(){
 const d=inspectionData(),out=get('tmInspectResults');if(!d||!out)return;
 inspectionQuery=String(get('tmInspectQuery')?.value||'').trim();
 const q=inspectionKey(inspectionQuery);
 if(!q){out.innerHTML='<p>Enter a Job Card or vehicle registration number to inspect working hours.</p>';return;}
 const matches=(d.jobs||[]).filter(j=>j&&j.no&&String(j.no)!=='ID001'&&!j.deleted&&
  [j.no,j.reg,j.registration].some(v=>inspectionKey(v).includes(q)))
  .sort((a,b)=>{
   const ae=inspectionKey(a.no)===q?1:0,be=inspectionKey(b.no)===q?1:0;
   return be-ae||Number(b.createdAt||0)-Number(a.createdAt||0)||String(b.no).localeCompare(String(a.no),undefined,{numeric:true});
  });
 out.innerHTML=matches.length?matches.slice(0,50).map(j=>{
  const people=inspectionEmployeeRows(d,j.no);
  const status=j.delivered?'Delivered':j.archived?'Archived':j.cancelled?'Cancelled':people.length&&people.every(p=>p.assignments.every(a=>a.completed))?'Finished':'In Progress';
  return '<button type="button" data-jc="'+esc(j.no)+'" onclick="zukaitTimeInspectJob(this.dataset.jc)"><b>JC '+esc(j.no)+' · '+esc(status)+'</b><span>'+esc(vehicle(j)||'Vehicle')+' · '+esc(j.reg||j.registration||'—')+' · '+people.length+' technician(s)</span></button>';
 }).join(''):'<p>No matching Job Cards.</p>';
 if(matches.length>50)out.innerHTML+='<p>Showing the first 50 matches. Enter more of the JC or registration number.</p>';
};
window.zukaitTimeInspectJob=function(no){
 const d=inspectionData(),j=d&&inspectionJobOf(d,no);if(!j)return;
 inspectionJob=String(j.no);
 const people=inspectionEmployeeRows(d,j.no);
 const normal=people.reduce((n,p)=>n+p.assigned,0),actual=people.reduce((n,p)=>n+p.actual,0),repeat=people.reduce((n,p)=>n+p.repeat,0);
 inspectionShell('JC '+esc(j.no)+' · Employee Time',inspectionBack()+
  '<div class="tm-job"><b>'+esc(vehicle(j)||'Vehicle')+'</b><span>Registration: '+esc(j.reg||j.registration||'—')+'</span></div>'+
  '<div class="tm-inspect-metrics">'+inspectionMetric('Total Assigned',normal)+inspectionMetric('Total Actual',actual)+inspectionMetric('Repeat Hours',repeat)+'</div>'+
  '<h3>Assigned Employees</h3><p>Select an employee to inspect their working time.</p>'+
  '<div class="tm-results">'+(people.length?people.map(p=>
   '<button type="button" data-emp="'+esc(p.id)+'" onclick="zukaitTimeInspectEmployee(this.dataset.emp)"><b>'+esc(p.name)+'</b><span>'+esc(p.department)+' · Assigned '+inspectionFormat(p.assigned)+' · Actual '+inspectionFormat(p.actual)+(p.running?' · Working':'')+'</span></button>'
   ).join(''):'<p>No technician assignments recorded for this Job Card.</p>')+'</div>');
};
window.zukaitTimeInspectEmployee=function(employeeId){
 const d=inspectionData(),j=d&&inspectionJobOf(d,inspectionJob);if(!j)return;
 const person=inspectionEmployeeRows(d,j.no).find(p=>p.id===String(employeeId));if(!person)return;
 const rows=person.assignments.slice().sort((a,b)=>Number(a.assignedAt||0)-Number(b.assignedAt||0));
 inspectionShell(esc(person.name)+' · JC '+esc(j.no),
  '<button type="button" class="tm-back" data-jc="'+esc(j.no)+'" onclick="zukaitTimeInspectJob(this.dataset.jc)">← Assigned Employees</button>'+
  '<div class="tm-job tm-inspect-vehicle"><span class="tm-inspect-car" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 11l2-5h10l2 5"/><rect x="3" y="10" width="18" height="9" rx="2"/><path d="M7 19v2M17 19v2M7 15h.01M17 15h.01"/></svg></span><span class="tm-inspect-vehicle-copy"><b>'+esc(vehicle(j)||'Vehicle')+' · '+esc(j.reg||j.registration||'—')+'</b><span>'+esc(person.department)+'</span></span></div>'+
  '<div class="tm-inspect-metrics">'+inspectionMetric('Assigned Time',person.assigned)+inspectionMetric('Actual Time',person.actual)+inspectionMetric('Remaining Time',person.remaining)+inspectionMetric('Exceeded Time',person.exceeded)+inspectionMetric('Repeat Hours',person.repeat)+'</div>'+
  '<p class="tm-inspect-note"><span class="tm-inspect-info" aria-hidden="true">i</span><span>Normal duty work is compared with the normal allocation. Repeat work is displayed separately and is not double-counted. ID001 and overtime are excluded from these duty-hour figures.</span></p>'+
  '<h3 class="tm-inspect-section-title"><span class="tm-inspect-layers" aria-hidden="true">▱</span>Assignment Breakdown</h3><div class="tm-results tm-inspect-assignments">'+rows.map(a=>
   '<div class="tm-inspect-assignment"><b>'+(a.rework?'Repeat Work':'Normal Work')+' · '+esc(a.completed?'Finished':'Open')+'</b><span>Assigned '+inspectionFormat(a.suggested)+' · Actual '+inspectionFormat(inspectionMinutes(d,a))+'</span></div>'
  ).join('')+'</div>','employee');
};
const inspectionCss=document.createElement('style');inspectionCss.textContent='.tm-inspection .tm-inspect-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:9px;margin:14px 0}.tm-inspection .tm-inspect-metric{background:#f3f7fc;border:1px solid #cad9e8;border-radius:12px;padding:12px 10px}.tm-inspection .tm-inspect-metric span,.tm-inspection .tm-inspect-metric b{display:block}.tm-inspection .tm-inspect-metric span{font-size:12px;font-weight:700}.tm-inspection .tm-inspect-metric b{font-size:19px;margin-top:5px}.tm-inspection .tm-inspect-assignment{background:#f8fafc;border:1px solid #d3dfeb;border-radius:12px;padding:12px;display:grid;gap:5px}.tm-inspection .tm-inspect-assignment span{font-size:14px}.tm-inspection .tm-inspect-note{font-size:13px;color:#52667b;line-height:1.5}';inspectionCss.textContent+="\n/* V380: premium Job Card Time Inspection employee detail; scoped to read-only page only. */\n.tm-inspection-employee{--tm-navy:#112742;--tm-line:#d8e5f3;box-sizing:border-box;max-width:100%;padding:clamp(14px,3vw,24px);border-radius:24px;background:radial-gradient(circle at 90% 0,#dcedff 0,transparent 36%),linear-gradient(155deg,#fff,#f9fbff 95%);color:var(--tm-navy);box-shadow:0 20px 44px rgba(20,48,85,.12)}\n.tm-inspection-employee *{box-sizing:border-box}\n.tm-inspection-employee .tm-header{align-items:center;gap:8px;margin-bottom:16px}\n.tm-inspection-employee .tm-header h2{font-size:clamp(19px,4.5vw,25px);line-height:1.2;letter-spacing:-.035em;margin:0;font-weight:850;color:#112442;min-width:0;overflow-wrap:anywhere}\n.tm-inspection-employee .tm-header .tm-close{font-size:13px;white-space:nowrap;min-width:86px;min-height:42px;padding:9px 12px;border-radius:14px;box-shadow:0 5px 12px rgba(169,60,82,.10)}\n.tm-inspection-employee>.tm-back{margin:0 0 18px;min-height:44px;font-size:14px;border-radius:14px;box-shadow:0 4px 12px rgba(37,99,235,.12)}\n.tm-inspection-employee .tm-inspect-vehicle{display:flex;align-items:center;gap:12px;margin:0 0 20px;padding:6px 0 16px;border-bottom:1px solid var(--tm-line);font-size:16px}\n.tm-inspection-employee .tm-inspect-car{display:grid;place-items:center;flex:0 0 46px;width:46px;height:46px;border-radius:13px;background:linear-gradient(145deg,#e7effa,#d7e5f7);color:#194a7d}\n.tm-inspection-employee .tm-inspect-car svg{width:25px;height:25px}\n.tm-inspection-employee .tm-inspect-vehicle-copy{display:grid;gap:4px;min-width:0}\n.tm-inspection-employee .tm-inspect-vehicle-copy b{font-size:16px;line-height:1.35;overflow-wrap:anywhere;color:#12233e}\n.tm-inspection-employee .tm-inspect-vehicle-copy>span{font-size:14px;color:#526780}\n.tm-inspection-employee .tm-inspect-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0 20px}\n.tm-inspection-employee .tm-inspect-metric{display:flex;align-items:center;gap:10px;min-height:92px;padding:14px 12px;border:1px solid transparent;border-left-width:5px;border-radius:17px;box-shadow:0 7px 15px rgba(28,65,115,.08)}\n.tm-inspection-employee .tm-inspect-metric-icon{display:grid;place-items:center;flex:0 0 31px;width:31px;height:31px}\n.tm-inspection-employee .tm-inspect-metric-icon svg{width:29px;height:29px;display:block}\n.tm-inspection-employee .tm-inspect-metric-text{min-width:0;display:grid;gap:4px}\n.tm-inspection-employee .tm-inspect-metric-text>span{font-size:12px;font-weight:800;line-height:1.25;color:#152c49}\n.tm-inspection-employee .tm-inspect-metric-text b{font-size:clamp(19px,3.9vw,25px);font-weight:850;line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap;color:#102d53;margin:0}\n.tm-inspection-employee .tm-inspect-metric--assigned{background:linear-gradient(115deg,#e8f2ff,#dcecff);border-color:#c9ddfa;border-left-color:#2377ec;color:#1267d8}\n.tm-inspection-employee .tm-inspect-metric--actual{background:linear-gradient(115deg,#e4fbf7,#ccf3ec);border-color:#b9ece1;border-left-color:#27bba7;color:#087f76}\n.tm-inspection-employee .tm-inspect-metric--remaining{background:linear-gradient(115deg,#edf7ff,#dff0ff);border-color:#c9e5fc;border-left-color:#77bcf7;color:#29699d}\n.tm-inspection-employee .tm-inspect-metric--exceeded{background:linear-gradient(115deg,#fff1eb,#ffe6e0);border-color:#ffd5c6;border-left-color:#ffa681;color:#cb4c21}\n.tm-inspection-employee .tm-inspect-metric--exceeded .tm-inspect-metric-text>span,.tm-inspection-employee .tm-inspect-metric--exceeded b{color:#9d291d}\n.tm-inspection-employee .tm-inspect-metric--repeat,.tm-inspection-employee .tm-inspect-metric--neutral{background:linear-gradient(115deg,#f3f7fc,#e8eff7);border-color:#d9e2ee;border-left-color:#bccbdf;color:#4a617d}\n.tm-inspection-employee .tm-inspect-note{display:flex;gap:12px;align-items:flex-start;margin:19px 0 24px;padding:3px 0 3px 13px;border-left:3px solid #18b8aa;font-size:13px;line-height:1.65;color:#34465e}\n.tm-inspection-employee .tm-inspect-info{display:grid;place-items:center;flex:0 0 20px;width:20px;height:20px;margin-top:1px;border:2px solid #12a99b;border-radius:50%;font-size:12px;font-weight:900;color:#0b998e}\n.tm-inspection-employee .tm-inspect-section-title{display:flex;align-items:center;gap:9px;margin:20px 0 12px;font-size:19px;line-height:1.3;color:#102541}\n.tm-inspection-employee .tm-inspect-layers{font-size:25px;line-height:1;color:#174a81;font-weight:700}\n.tm-inspection-employee .tm-inspect-assignments{gap:9px}\n.tm-inspection-employee .tm-inspect-assignment{background:linear-gradient(130deg,#eaf3ff,#e1effc);border:1px solid #cfdef0;border-radius:16px;box-shadow:0 4px 12px rgba(24,66,119,.05);padding:15px 16px;display:grid;gap:7px}\n.tm-inspection-employee .tm-inspect-assignment b{color:#152b49;font-size:15px}\n.tm-inspection-employee .tm-inspect-assignment span{font-size:13px;color:#4b617a}\n.tm-inspection-employee button:focus-visible{outline:3px solid #1b78ef;outline-offset:3px}\n@media(max-width:390px){.tm-inspection-employee{padding:14px 12px}.tm-inspection-employee .tm-inspect-metrics{gap:8px}.tm-inspection-employee .tm-inspect-metric{padding:11px 7px;gap:6px;min-height:85px}.tm-inspection-employee .tm-inspect-metric-icon{flex-basis:24px;width:24px}.tm-inspection-employee .tm-inspect-metric-icon svg{width:23px;height:23px}.tm-inspection-employee .tm-inspect-metric-text>span{font-size:11px}.tm-inspection-employee .tm-inspect-metric-text b{font-size:clamp(17px,5vw,21px)}}\n";document.head.appendChild(inspectionCss);
