import {allocationToken,workedMinutes} from './time_management_rules.js?v=233';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const allowed=()=>typeof me!=='undefined'&&me&&['Supervisor','Manager'].includes(me.role);
const data=()=>({...state,users:typeof users!=='undefined'?users:state.users||[]});
const staff=id=>data().users.find(u=>String(u.id)===String(id));
const vehicle=j=>[j.vehicle||j.make||'',j.model||'',j.year||''].filter(Boolean).join(' ');
const fmtTime=m=>{const n=Math.max(0,Math.floor(Number(m)||0));return Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m'};
const get=id=>document.getElementById(id),active=a=>a&&!a.completed&&!a.cancelled&&!a.rework&&a.job!=='ID001';
let selectedJob='',request=null,busy=false,opening=0;
const errors={time_permission_denied:'Your login cannot change allocated time.',time_allocation_changed:'The first allocation changed on another device. Review the updated values.',time_target_changed:'The second allocation changed on another device. Review the updated values.',split_exceeds_remaining:'Only the remaining unworked time can be split. Reduce the transfer and review again.',time_assignment_inactive:'This assignment is no longer active. Select another assignment.',time_job_inactive:'This job card is no longer active.',split_technician_invalid:'Select a different technician.',split_target_ambiguous:'This technician has a repeat or duplicate assignment. Use the assignment controls to resolve it first.',time_reason_required:'Enter the reason for this time change.',invalid_time_change:'Enter valid hours and minutes. The new allocation cannot be negative.',TIME_SYNC_PENDING:'Workshop changes are still syncing. Try again after sync finishes.',NETWORK:'Connection unavailable. Reconnect and retry the same confirmation.',TIMEOUT:'The response timed out. Retry the same confirmation to check its result safely.',time_conflict:'The workshop is busy syncing. Retry the same confirmation.'};
function notice(text){const el=get('tmNotice');if(el)el.textContent=text}
function source(){return (state.assign||[]).find(a=>String(a.id)===get('tmSource')?.value)}
function target(){const a=source(),emp=get('tmTarget')?.value;return (state.assign||[]).find(x=>active(x)&&String(x.job)===String(a?.job)&&String(x.emp)===String(emp))||null}
function clearReview(){request=null;const el=get('tmReview');if(el){el.hidden=true;el.innerHTML=''}notice('')}
function setControlsDisabled(value){const fs=get('tmInputs');if(fs)fs.disabled=value;const confirm=get('tmConfirm');if(confirm)confirm.disabled=value}
function values(){const h=Number(get('tmHours')?.value),m=Number(get('tmMinutes')?.value);return Number.isInteger(h)&&h>=0&&Number.isInteger(m)&&m>=0&&m<60?h*60+m:NaN}
function preview(){
 const a=source(),el=get('tmPreview');if(!a||!el)return;const op=get('tmMode').value,mins=values(),worked=workedMinutes(data(),a),old=Number(a.suggested)||0,newValue=op==='ADD'?old+mins:old-mins;
 get('tmTargetLabel').hidden=op!=='SPLIT';get('tmReasonLabel').textContent=op==='SPLIT'?'Reason for Split (required)':'Reason (required)';
 get('tmMetrics').innerHTML=[['Allocated',old],['Worked',worked],['Remaining',Math.max(0,old-worked)]].map(([label,value])=>'<div><span>'+label+'</span><b>'+fmtTime(value)+'</b></div>').join('');
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
 if(!Number.isSafeInteger(minutes)||minutes<1||minutes>60000)return notice(errors.invalid_time_change);
 if(!reason||reason.length>500)return notice(errors.time_reason_required);
 if(op==='SPLIT'&&(!recipient||recipient===String(a.emp)))return notice(errors.split_technician_invalid);
 busy=true;setControlsDisabled(true);const host=get('tmPage');
 try{
  await window.zukaitCloud.syncNow();const health=window.zukaitCloud.syncHealth;
  if(!navigator.onLine||!health?.ready||health.dirty||health.pushing||health.pulling||health.pendingConflict||health.lastError)throw Error('TIME_SYNC_PENDING');
  if(get('tmPage')!==host||!allowed())return;
  const fresh=source();if(!active(fresh))throw Error('time_assignment_inactive');
  const worked=workedMinutes(data(),fresh),old=Number(fresh.suggested)||0,next=op==='ADD'?old+minutes:old-minutes;
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
 catch(e){if(get('tmPage')!==host)return;notice(errors[e.code||e.message]||'Could not confirm this time change. Retry the same confirmation.');if(['time_allocation_changed','time_target_changed','split_exceeds_remaining','time_assignment_inactive','time_job_inactive'].includes(e.code||e.message)){request=null;get('tmReview').hidden=true;preview();}}
 finally{busy=false;setControlsDisabled(false)}
};
window.zukaitOpenTimeManagement=async function(initialJob=''){
 if(!allowed()||busy)return;const token=++opening;
 try{if(!navigator.onLine)throw Error('NETWORK');await window.zukaitCloud.syncNow();const h=window.zukaitCloud.syncHealth;if(!h?.ready||h.dirty||h.pendingConflict||h.lastError)throw Error('TIME_SYNC_PENDING');}
 catch(e){return alert(errors[e.message]||'Sync the workshop before opening Time Management.')}
 if(token!==opening||!allowed())return;request=null;selectedJob='';
 openModal('<section id="tmPage" class="tm-page"><div class="tm-header"><h2>⏱ Time Management</h2><button type="button" class="tm-close" onclick="closeModal()">✕ Close</button></div><button type="button" class="tm-back" onclick="closeModal()">← Back</button><p>Add, reduce or split allocated time.</p><fieldset id="tmInputs"><label>Search JC / registration<div class="tm-search"><input id="tmSearch" type="search" oninput="zukaitTimeSearch()" onkeydown="if(event.key===\'Enter\'){event.preventDefault();zukaitTimeSearch()}"><button type="button" class="tm-back" onclick="zukaitTimeSearch()">Search</button></div></label><div id="tmSearchResults" class="tm-results"></div><div id="tmJob" class="tm-job"></div><div id="tmEditor" hidden><label>Currently assigned technician<select id="tmSource" onchange="zukaitTimeSourceChanged()"></select></label><div id="tmMetrics" class="tm-metrics"></div><label>Action<select id="tmMode" onchange="zukaitTimeChanged()"><option value="ADD">＋ Add Time</option><option value="REDUCE">− Reduce Time</option><option value="SPLIT">⇄ Split / Transfer Time</option></select></label><label id="tmTargetLabel" hidden>Assign time to technician<select id="tmTarget" onchange="zukaitTimeChanged()"></select></label><div class="tm-duration"><label>Hours<input id="tmHours" type="number" min="0" max="1000" step="1" inputmode="numeric" value="0" oninput="zukaitTimeChanged()"></label><label>Minutes<input id="tmMinutes" type="number" min="0" max="59" step="1" inputmode="numeric" value="30" oninput="zukaitTimeChanged()"></label></div><div id="tmPreview" class="tm-preview"></div><label><span id="tmReasonLabel">Reason (required)</span><textarea id="tmReason" maxlength="500" rows="3" oninput="zukaitTimeChanged()"></textarea></label><button type="button" class="tm-save" onclick="zukaitTimeReview()">Review & Confirm</button></div></fieldset><div id="tmNotice" class="tm-notice" role="status" aria-live="polite"></div><div id="tmReview" class="tm-review" hidden></div></section>');
 if(initialJob){get('tmSearch').value=String(initialJob);window.zukaitTimeSelectJob(String(initialJob))}else get('tmSearch').focus();
};
const style=document.createElement('style');style.textContent=`
.tm-page{color:#172b45}.tm-page fieldset{border:0;padding:0;margin:0;min-width:0}.tm-page [hidden]{display:none!important}.tm-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.tm-header h2{font-size:24px;margin:8px 0 14px}.tm-page label{display:grid;gap:7px;margin:14px 0;font-size:16px;font-weight:800}.tm-page input,.tm-page select,.tm-page textarea{box-sizing:border-box;min-width:0;width:100%;padding:12px;border:1px solid #c1d5e8;border-radius:12px;background:#fff;color:#172b45;font-size:16px;min-height:46px}.tm-page button{padding:12px 16px;border-radius:12px;font-size:16px;font-weight:800;min-height:46px;cursor:pointer}.tm-close{background:linear-gradient(145deg,#fff5f5,#ffe3e8)!important;color:#923247!important;border:1px solid #eab9c5!important;box-shadow:inset 0 2px #fff,0 3px #dfbac3}.tm-back{background:linear-gradient(145deg,#fff,#e2efff)!important;color:#24568b!important;border:1px solid #bbd1eb!important;box-shadow:inset 0 2px #fff,0 3px #c3d4e8}.tm-save{width:100%;background:linear-gradient(145deg,#53b989,#228257)!important;color:#fff!important;border:1px solid #248457!important;box-shadow:inset 0 2px #b7edd1,0 3px #1d6b4b}.tm-search,.tm-duration,.tm-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}.tm-duration{grid-template-columns:repeat(2,minmax(0,1fr))}.tm-results{display:grid;gap:7px}.tm-results button{display:grid;gap:4px;text-align:left;background:#f1f7ff;color:#213d61;border:1px solid #c9dcee}.tm-results button span{font-size:14px}.tm-job{display:grid;gap:6px;margin-top:12px;font-size:17px}.tm-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:16px 0}.tm-metrics>div{padding:13px 8px;border:1px solid #c6d7ea;border-radius:14px;background:linear-gradient(145deg,#fff,#eaf2ff);box-shadow:inset 0 2px #fff,0 3px #d1ddeb}.tm-metrics>div:nth-child(2){background:linear-gradient(145deg,#fff,#f1eaff)}.tm-metrics>div:nth-child(3){background:linear-gradient(145deg,#fff,#e5f6eb)}.tm-metrics span{display:block;font-size:13px;font-weight:700}.tm-metrics b{display:block;font-size:22px;margin-top:5px}.tm-preview,.tm-review{padding:16px;margin:16px 0;border:1px solid #c5d7e9;border-radius:16px;background:linear-gradient(145deg,#fff,#edf5ff);box-shadow:inset 0 2px #fff,0 3px #d2dfeb}.tm-preview span,.tm-preview b,.tm-preview small{display:block}.tm-preview b{font-size:24px;margin:5px 0}.tm-preview small{font-size:14px;line-height:1.4}.tm-notice{font-size:16px;font-weight:700;line-height:1.5;margin-top:14px;overflow-wrap:anywhere}.tm-page button:disabled{opacity:.55;cursor:wait}.tm-page button:focus-visible{outline:3px solid #327dc1;outline-offset:4px}@media(max-width:400px){.tm-header h2{font-size:20px}.tm-metrics b{font-size:18px}.tm-page button{padding:10px}.tm-actions{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;document.head.appendChild(style);
