import {managerCorrectionSessionToken} from './manager_time_correction_rules.js?v=1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=id=>document.getElementById(id);
const isManager=()=>typeof me!=='undefined'&&me&&me.role==='Manager';
const staff=()=>typeof users!=='undefined'?users:(state.users||[]);
const jobs=()=>state.jobs||[];
const assignments=()=>state.assign||[];
const sessions=()=>state.sessions||[];
let busy=false,request=null,selectedEmployee='';
const messages={manager_time_permission_denied:'Only a Manager can correct a missed start time.',manager_time_invalid:'Choose a valid start time from today and no more than 16 hours ago.',manager_time_reason_required:'Enter a reason for this correction.',manager_time_assignment_inactive:'That assignment is no longer active. Reload the latest data.',manager_time_job_inactive:'That job card is no longer active.',manager_time_employee_inactive:'That employee is no longer active.',manager_time_other_job_running:'This employee already has an active session for another job.',manager_time_multiple_open_sessions:'This employee has multiple active sessions. Resolve those first.',manager_time_overlap:'The corrected start overlaps another recorded session.',manager_time_session_changed:'The employee session changed on another device. Reload and review again.',manager_time_request_reused:'This correction ID was already used for a different change.',TIME_SYNC_PENDING:'Workshop changes are still syncing. Try again when sync completes.',NETWORK:'Connection unavailable. Reconnect and retry the same confirmation.',TIMEOUT:'The response timed out. Retry the same confirmation safely.',manager_time_conflict:'The workshop is busy syncing. Retry the same confirmation.'};
function notice(s){const x=get('mtcNotice');if(x)x.textContent=s}
function omanParts(ts=Date.now()){const d=new Date(ts+4*3600000);return{date:d.toISOString().slice(0,10),time:d.toISOString().slice(11,16)}}
function toTimestamp(date,time){
 const a=String(date||'').split('-').map(Number),b=String(time||'').split(':').map(Number);
 if(a.length!==3||b.length!==2||a.some(x=>!Number.isInteger(x))||b.some(x=>!Number.isInteger(x))||b[0]>23||b[1]>59)return NaN;
 const test=new Date(Date.UTC(a[0],a[1]-1,a[2]));
 if(test.getUTCFullYear()!==a[0]||test.getUTCMonth()!==a[1]-1||test.getUTCDate()!==a[2])return NaN;
 return Date.UTC(a[0],a[1]-1,a[2],b[0]-4,b[1]);
}
function activeAssignment(a){return a&&!a.completed&&!a.cancelled&&!a.rework&&String(a.job).toUpperCase()!=='ID001'}
function row(){return assignments().find(a=>String(a.id)===String(get('mtcAssignment')?.value))}
function activeOpenSession(a){return sessions().find(s=>s&&String(s.emp)===String(a?.emp)&&!Number(s.end||0))||null}
function employees(){
 return staff().filter(x=>x&&x.role==='Employee'&&x.active!==false).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id)));
}
function vehicle(j){return[j?.vehicle||j?.make||'',j?.model||'',j?.year||''].filter(Boolean).join(' ')}
window.zukaitManagerCorrectionEmployeeChanged=function(){
 if(busy)return;selectedEmployee=String(get('mtcEmployee')?.value||'');
 const rows=assignments().filter(a=>activeAssignment(a)&&String(a.emp)===selectedEmployee);
 const sel=get('mtcAssignment');if(!sel)return;
 sel.innerHTML='<option value="">Select an active job card</option>'+rows.map(a=>{const j=jobs().find(x=>String(x.no)===String(a.job));return '<option value="'+esc(a.id)+'">JC '+esc(a.job)+' · '+esc(vehicle(j)||j?.reg||'')+'</option>'}).join('');
 get('mtcAssignmentBox').hidden=!rows.length;get('mtcNoAssignments').hidden=!!rows.length;window.zukaitManagerCorrectionChanged();
};
window.zukaitManagerCorrectionChanged=function(){
 if(busy)return;request=null;const a=row();const info=get('mtcCurrent');if(!info)return;
 if(!a){info.textContent='Select an employee and active job card.';get('mtcReview').hidden=true;return}
 const s=activeOpenSession(a);const j=jobs().find(x=>String(x.no)===String(a.job));
 info.textContent=(s?'Current open session starts at '+new Date(Number(s.start)).toLocaleString('en-GB',{timeZone:'Asia/Muscat'}):'No active session. Saving will enter a new start time.')+' · '+(j?.reg||'');
 get('mtcReview').hidden=true;
};
function controls(disabled){for(const id of ['mtcInputs','mtcConfirm']){const x=get(id);if(x)x.disabled=disabled}}
window.zukaitManagerCorrectionReview=function(){
 if(busy||!isManager())return;const a=row();if(!activeAssignment(a))return notice('Select an active job card for this employee.');
 const startAt=toTimestamp(get('mtcDate')?.value,get('mtcTime')?.value),reason=String(get('mtcReason')?.value||'').trim(),now=Date.now();
 if(!Number.isSafeInteger(startAt)||startAt>now||now-startAt>16*60*60*1000)return notice(messages.manager_time_invalid);
 if(!reason||reason.length>500)return notice(messages.manager_time_reason_required);
 const employee=employees().find(x=>String(x.id)===String(a.emp)),job=jobs().find(x=>String(x.no)===String(a.job)),session=activeOpenSession(a);
 request={requestId:'mtc-'+crypto.randomUUID(),assignmentId:String(a.id),startAt,reason,expectedSessionToken:managerCorrectionSessionToken(session)};
 const when=new Date(startAt).toLocaleString('en-GB',{timeZone:'Asia/Muscat',dateStyle:'medium',timeStyle:'short'});
 get('mtcReview').hidden=false;get('mtcReview').innerHTML='<h3>Review missed start</h3><p><b>Employee:</b> '+esc(employee?.name||a.emp)+'</p><p><b>Job card:</b> JC '+esc(a.job)+' · '+esc(vehicle(job)||job?.reg||'')+'</p><p><b>Start time:</b> '+esc(when)+' (Oman time)</p><p><b>Change:</b> '+(session?'Correct existing open session':'Enter a missed start')+'</p><p><b>Reason:</b> '+esc(reason)+'</p><button id="mtcConfirm" type="button" onclick="zukaitManagerCorrectionConfirm()">Confirm correction</button>';
 notice('Review the details before saving.');
};
window.zukaitManagerCorrectionConfirm=async function(){
 if(busy||!request||!isManager())return;busy=true;controls(true);const host=get('mtcPage');
 try{
  const result=await window.zukaitCloud.managerTimeCorrection(request);
  if(get('mtcPage')!==host||!isManager())return;
  const duplicate=result.duplicate;request=null;get('mtcReview').hidden=true;get('mtcReason').value='';
  window.zukaitManagerCorrectionChanged();
  notice(duplicate?'This correction was already saved. Latest data loaded.':'Start time corrected and synchronized. The manager and reason are recorded.');
 }catch(e){
  if(get('mtcPage')!==host)return;
  const code=e.code||e.message;notice(messages[code]||'Could not save the correction. Retry the same confirmation.');
  if(['manager_time_assignment_inactive','manager_time_job_inactive','manager_time_employee_inactive','manager_time_other_job_running','manager_time_multiple_open_sessions','manager_time_overlap','manager_time_session_changed'].includes(code)){request=null;get('mtcReview').hidden=true}
 }finally{busy=false;controls(false)}
};
window.zukaitOpenManagerTimeCorrection=async function(){
 if(!isManager()||busy)return;
 try{if(!navigator.onLine)throw Error('NETWORK');await window.zukaitCloud.syncNow();const h=window.zukaitCloud.syncHealth;if(!h?.ready||h.dirty||h.pendingConflict||h.lastError)throw Error('TIME_SYNC_PENDING')}
 catch(e){return alert(messages[e.message]||'Sync the workshop before correcting a start time.')}
 if(!isManager())return;
 const now=omanParts();
 openModal('<section id="mtcPage" class="mtc-page"><header><div><h2>Correct missed start time</h2><p>For an employee who forgot to start an active job session.</p></div><button type="button" onclick="closeModal()">Close</button></header><button type="button" class="mtc-back" onclick="closeModal()">← Back</button><fieldset id="mtcInputs"><label>Employee<select id="mtcEmployee" onchange="zukaitManagerCorrectionEmployeeChanged()"><option value="">Select employee</option>'+employees().map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name||x.id)+'</option>').join('')+'</select></label><div id="mtcAssignmentBox" hidden><label>Active job card<select id="mtcAssignment" onchange="zukaitManagerCorrectionChanged()"></select></label></div><p id="mtcNoAssignments" hidden>No active job card assignments for this employee.</p><div id="mtcCurrent" class="mtc-current">Select an employee and active job card.</div><div class="mtc-time"><label>Date (Oman)<input id="mtcDate" type="date" max="'+now.date+'"></label><label>Start time (Oman)<input id="mtcTime" type="time" value="'+now.time+'"></label></div><label>Reason (required)<textarea id="mtcReason" maxlength="500" rows="3" placeholder="Example: employee forgot to tap Start"></textarea></label><button type="button" class="mtc-primary" onclick="zukaitManagerCorrectionReview()">Review correction</button></fieldset><div id="mtcNotice" role="status" aria-live="polite"></div><div id="mtcReview" hidden></div><p class="mtc-audit">The correction is saved with the manager, original time, new time and reason. It appears in the workshop audit history.</p></section>');
};
function ensureEntry(){
 const root=document.getElementById('managerView');if(!root||!isManager())return;
 if(root.querySelector('#managerTimeCorrectionEntry'))return;
 const box=document.createElement('section');box.id='managerTimeCorrectionEntry';box.className='mtc-launcher';
 box.innerHTML='<div><b>Missed start time?</b><span>Enter or correct an employee’s active job start with a reason and audit record.</span></div><button type="button" onclick="zukaitOpenManagerTimeCorrection()">Correct start time</button>';
 root.appendChild(box);
}
const style=document.createElement('style');style.textContent=`
.mtc-launcher{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:14px 0;padding:16px;border:1px solid #b8d0e7;border-radius:14px;background:linear-gradient(140deg,#fff,#eff7ff);color:#193654;box-shadow:0 3px 10px #16385a12}
.mtc-launcher div{display:grid;gap:5px}.mtc-launcher span{font-size:13px;color:#536b83}.mtc-launcher button,.mtc-page button{border:1px solid #b7cde2;border-radius:10px;padding:10px 14px;background:#f5f9ff;color:#244b73;font-weight:800;cursor:pointer}
.mtc-launcher button,.mtc-page .mtc-primary{background:#2479b8;color:#fff;border-color:#176aa7}.mtc-page{color:#18324e}.mtc-page header{display:flex;align-items:start;justify-content:space-between;gap:12px}.mtc-page h2{margin:4px 0;font-size:22px}.mtc-page header p{margin:5px 0 14px;color:#60748a}.mtc-page fieldset{border:0;padding:0;margin:0;min-width:0}.mtc-page [hidden]{display:none!important}.mtc-page label{display:grid;gap:7px;margin:14px 0;font-weight:800}.mtc-page input,.mtc-page select,.mtc-page textarea{box-sizing:border-box;width:100%;min-width:0;padding:11px;border:1px solid #c4d5e4;border-radius:10px;font:inherit;background:#fff}.mtc-time{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mtc-current,.mtc-page #mtcReview{padding:13px;margin:12px 0;border:1px solid #c9d9e7;border-radius:12px;background:#f4f8fc;line-height:1.5}.mtc-page #mtcReview p{margin:8px 0}.mtc-page #mtcNotice{margin-top:12px;font-weight:750;line-height:1.45}.mtc-page .mtc-audit{font-size:13px;color:#60748a;line-height:1.5}.mtc-page .mtc-primary{width:100%;min-height:46px}.mtc-page button:disabled{opacity:.6}.mtc-launcher button:focus-visible,.mtc-page button:focus-visible{outline:3px solid #3a91ce;outline-offset:3px}
@media(max-width:500px){.mtc-launcher{align-items:stretch;flex-direction:column}.mtc-time{grid-template-columns:1fr}}
`;document.head.appendChild(style);
const oldCompose=window.zukaitComposeManagerDashboard;
if(typeof oldCompose==='function'&&!oldCompose.__mtc){const wrapped=function(){const out=oldCompose.apply(this,arguments);ensureEntry();return out};wrapped.__mtc=true;window.zukaitComposeManagerDashboard=wrapped}
const originalRender=window.render;
if(typeof originalRender==='function'&&!originalRender.__mtc){const wrapped=function(){const out=originalRender.apply(this,arguments);ensureEntry();return out};wrapped.__mtc=true;window.render=wrapped}
const originalManager=window.renderManager;
if(typeof originalManager==='function'&&!originalManager.__mtc){const wrapped=function(){const out=originalManager.apply(this,arguments);ensureEntry();return out};wrapped.__mtc=true;window.renderManager=wrapped}
window.addEventListener('zukait-live-status',ensureEntry);
ensureEntry();
