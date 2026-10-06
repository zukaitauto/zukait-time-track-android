/* Shared Manager/Supervisor leave history. Reads the leave-entry authority. */
(function(){'use strict';
 const rules=window.zukaitV2.leave;
 const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const allowed=()=>typeof me!=='undefined'&&['Manager','Supervisor'].includes(me?.role);
 const person=id=>(typeof users!=='undefined'?users:[]).find(u=>String(u.id)===String(id))||{id,name:id};
 let filters={month:'',employee:'',status:'active',day:''};
 const current=()=>rules.dashboard(typeof state==='undefined'?{}:state);
 const rows=()=>rules.history(filters);
 const patch=(id,html)=>{const el=document.getElementById(id);if(el&&el.innerHTML!==html)el.innerHTML=html};
 const monthLabel=m=>new Date(m+'-01T12:00:00+04:00').toLocaleDateString('en-GB',{timeZone:'Asia/Muscat',month:'long',year:'numeric'});
 function options(){
  const all=rules.rows().filter(Boolean),months=[...new Set([current().day.slice(0,7),filters.month,...all.map(l=>String(l.date||'').slice(0,7))])].filter(m=>/^\d{4}-\d{2}$/.test(m)).sort().reverse();
  patch('leaveHistoryMonth','<option value="">All months</option>'+months.map(m=>'<option value="'+E(m)+'" '+(filters.month===m?'selected':'')+'>'+E(monthLabel(m))+'</option>').join(''));
  const staff=[...new Set([filters.employee,...all.map(l=>String(l.emp))])].filter(Boolean).sort((a,b)=>String(person(a).name).localeCompare(String(person(b).name)));
  patch('leaveHistoryEmployee','<option value="">All employees / supervisors</option>'+staff.map(id=>'<option value="'+E(id)+'" '+(filters.employee===id?'selected':'')+'>'+E(person(id).name||id)+'</option>').join(''));
 }
 function table(list,actions=true){
  return list.length?'<div class="v78-leave-table"><table><thead><tr><th>Staff</th><th>Date</th><th>Leave</th><th>Status</th><th>Remark</th><th>Marked by</th>'+(actions&&me.role==='Manager'?'<th>Action</th>':'')+'</tr></thead><tbody>'+list.map(l=>'<tr><td>'+E(person(l.emp).name)+'</td><td>'+E(l.date)+'</td><td>'+E(rules.label(l))+'</td><td>'+E(l.cancelled?'Cancelled':'Recorded')+'</td><td>'+E(l.remark||'—')+'</td><td>'+E(person(l.by).name||'—')+'</td>'+(actions&&me.role==='Manager'?'<td>'+(l.cancelled?'':'<button type="button" data-leave-edit="'+E(l.id)+'">Edit</button>')+'</td>':'')+'</tr>').join('')+'</tbody></table></div>':'<div class="notice">No leave records match these filters.</div>';
 }
 function results(){
  const list=rows(),active=list.filter(l=>!l.cancelled),days=active.reduce((n,l)=>n+rules.days(l),0);
  return '<div class="v78-leave-summary"><span><b>'+new Set(list.map(l=>String(l.emp))).size+'</b> people</span><span><b>'+list.length+'</b> records</span><span><b>'+Number(days.toFixed(2))+'</b> leave days (excluding cancelled)</span></div>'+table(list);
 }
 function refresh(){
  if(!allowed())return;
  // Keep existing dashboard shells and draft fields mounted.
  const d=current();
  document.querySelectorAll('.v111-leave-today').forEach(el=>{if(el.textContent!==String(d.todayCount))el.textContent=String(d.todayCount)});
  document.querySelectorAll('[data-workshop-action="quick-leave"]').forEach(el=>{const n=el.querySelector('.wo-quick-number');if(n&&n.textContent!==String(d.todayCount))n.textContent=String(d.todayCount);const label='Today’s Leave · '+d.todayCount;if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label)});
  if(!document.getElementById('zukaitLeaveHistory'))return;
  options();patch('leaveHistoryResults',results());
  const health=window.zukaitCloud?.syncHealth;
  const status=health?.dirty?'Saved on this device · waiting to sync':health?.online===false?'Offline · showing saved leave history':health?.lastError?'Sync needs attention · refresh to retry':health?.ready?'Shared leave history':'Showing saved leave history';
  patch('leaveHistorySync',E(status));
 }
 function open(mode='history'){
  if(!allowed())return;
  const d=current();filters={month:mode==='month'?d.day.slice(0,7):'',employee:'',status:'active',day:mode==='today'?d.day:''};
  const title=mode==='today'?'Today’s Leave':'Leave History';
  openModal('<section id="zukaitLeaveHistory"><div class="section-title"><h2>'+title+'</h2><button type="button" class="secondary" onclick="closeModal()">Close</button></div>'+
   '<div class="grid"><label>Month<select id="leaveHistoryMonth" onchange="zukaitLeaveHistory.filter(\'month\',this.value)"></select></label><label>Staff<select id="leaveHistoryEmployee" onchange="zukaitLeaveHistory.filter(\'employee\',this.value)"></select></label><label>Status<select id="leaveHistoryStatus" onchange="zukaitLeaveHistory.filter(\'status\',this.value)"><option value="active">Non-cancelled</option><option value="all">All records</option><option value="cancelled">Cancelled only</option></select></label></div>'+
   '<div class="v74-actions"><button type="button" onclick="zukaitLeaveHistory.open(\'history\')">All Month History</button><button type="button" onclick="v755OpenLeaveHub()">Mark Leave</button><button type="button" onclick="zukaitLeaveHistory.sync()">Refresh</button><button type="button" onclick="zukaitLeaveHistory.print()">Print / PDF</button><button type="button" onclick="zukaitLeaveHistory.share()">WhatsApp</button></div>'+
   (filters.day?'<p id="leaveHistoryDayNote" class="notice">Showing '+E(filters.day)+' (Asia/Muscat). Choose a month or All Month History for other dates.</p>':'')+
   '<p id="leaveHistorySync" class="muted" role="status"></p><div id="leaveHistoryResults"></div></section>');
  refresh();
 }
 function filter(key,value){if(!allowed()||!['month','employee','status'].includes(key))return;filters[key]=value;if(key==='month'){filters.day='';const note=document.getElementById('leaveHistoryDayNote');if(note)note.textContent=''}refresh()}
 async function sync(){if(!allowed())return;try{await window.zukaitCloud?.syncNow?.()}catch(_){patch('leaveHistorySync','Unable to sync. Saved history is still available.');return}refresh()}
 function print(){if(!allowed())return;const list=rows(),title='Leave History — '+(filters.day|| (filters.month?monthLabel(filters.month):'All months'));
  const html='<html><head><title>'+E(title)+'</title><style>body{font:14px Arial}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:8px;text-align:left}</style></head><body><h2>Zukait Auto Services</h2><h3>'+E(title)+'</h3><p>'+list.length+' records</p>'+table(list,false)+'</body></html>';
  if(typeof window.v110ReportActions==='function')return window.v110ReportActions(html,'Zukait_Leave_History.pdf');
  const w=window.open('','_blank');if(w){w.document.write(html);w.document.close();w.print()}
 }
 function share(){if(!allowed())return;const text='Zukait Auto Services — Leave History\n'+rows().map(l=>[person(l.emp).name,l.date,rules.label(l),l.cancelled?'Cancelled':'Recorded',l.remark||''].join(' | ')).join('\n');window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank')}
 async function confirmSaved(id){
  let shared=false;
  try{if(navigator.onLine&&window.zukaitCloud){await window.zukaitCloud.syncNow();shared=!window.zukaitCloud.dirty&&window.zukaitCloud.ready}}catch(_){}
  refresh();
  const retained=!id||rules.rows().some(l=>l&&String(l.id)===String(id)&&!l.cancelled);
  const message=!retained?'This leave could not be confirmed after synchronization. Check Leave History before marking it again.':shared?'Leave synchronized. Manager and Supervisor can see it.':'Leave saved on this device. Waiting to synchronize with Manager and Supervisor; use Refresh to retry.';
  if(typeof window.v74Msg==='function')window.v74Msg(message,'Leave');else alert(message);
 }
 window.zukaitLeaveHistory={open,filter,refresh,sync,print,share,rows,confirmSaved};
 // Last-loaded authority prevents older decorators from overriding history.
 window.v755OpenLeaveList=open;
 window.v133OpenManagerLeave=()=>open('history');
 window.v133LeaveRows=rows;window.v133PrintLeave=print;window.v133ShareLeave=share;
 document.addEventListener('click',e=>{const b=e.target.closest?.('[data-leave-edit]');if(b&&allowed()&&me.role==='Manager')window.v114EditLeave(b.dataset.leaveEdit)});
 const prevPull=window.v42AfterCloudPull;window.v42AfterCloudPull=function(){const r=prevPull?.apply(this,arguments);refresh();return r};
 window.addEventListener('focus',refresh);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
 setInterval(()=>{if(document.visibilityState!=='hidden')refresh()},30000);
})();
