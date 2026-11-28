/* Shared Manager/Supervisor leave history. Reads the leave-entry authority. */
(function(){'use strict';
 const rules=window.zukaitV2.leave;
 const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const allowed=()=>typeof me!=='undefined'&&['Manager','Supervisor'].includes(me?.role);
 const person=id=>(typeof users!=='undefined'?users:[]).find(u=>String(u.id)===String(id))||{id,name:id};
 let filters={month:'',employee:'',status:'active',day:''},view='grouped';
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
 // Presentation only: never coalesce or mutate canonical daily records.
 // Legacy records have no period ID or structured leave type. Infer only explicit
 // annual/medical remarks, and never assume a missing date was approved leave.
 function leaveKind(l){
  const remark=String(l.remark||'').trim().toLowerCase().replace(/\s+/g,' ');
  return remark==='annual leave'||remark==='annual'?'Annual leave':remark==='medical'||remark==='medical leave'?'Medical leave':'';
 }
 function grouped(list){
  if(view==='daily')return list.map(l=>[l]);
  const counts=new Map(),last=new Map(),out=[];
  const key=l=>JSON.stringify([String(l.emp),String(l.date)]);
  const dateMs=l=>/^\d{4}-\d{2}-\d{2}$/.test(String(l.date))?Date.parse(l.date+'T00:00:00Z'):NaN;
  for(const l of list)counts.set(key(l),(counts.get(key(l))||0)+1);
  for(const l of list){
   const emp=String(l.emp),kind=leaveKind(l),eligible=kind&&!l.cancelled&&l.period==='FULL'&&l.startAt==null&&counts.get(key(l))===1&&Number.isFinite(dateMs(l));
   const prev=last.get(emp),signature=JSON.stringify([kind,String(l.remark||'').trim().toLowerCase(),String(l.by||'')]);
   if(eligible&&prev&&prev.signature===signature&&dateMs(prev.group[prev.group.length-1])-dateMs(l)===86400000){
    prev.group.push(l);
   }else{
    const group=[l];out.push(group);
    if(eligible)last.set(emp,{group,signature});else last.delete(emp);
   }
  }
  return out;
 }
 const span=g=>g.length===1?g[0].date:g[g.length-1].date+' – '+g[0].date;
 const groupLabel=g=>g.length===1?rules.label(g[0]):leaveKind(g[0])+' · '+g.length+' days';
 const buttons=l=>'<button type="button" data-leave-edit="'+E(l.id)+'">Edit</button> <button type="button" class="danger" data-leave-delete="'+E(l.id)+'">Delete leave</button>';
 function details(g,manager){
  return '<details><summary>View '+g.length+' daily records</summary>'+g.map(l=>'<div>'+E(l.date)+(manager?' '+buttons(l):'')+'</div>').join('')+'</details>';
 }
 function table(list,actions=true){
  const manager=actions&&me.role==='Manager';
  return list.length?'<div class="v78-leave-table"><table><thead><tr><th>Staff</th><th>Date / period</th><th>Leave</th><th>Status</th><th>Remark</th><th>Marked by</th>'+(manager?'<th>Action</th>':'')+'</tr></thead><tbody>'+grouped(list).map(g=>{
   const l=g[0];return '<tr><td>'+E(person(l.emp).name)+'</td><td>'+E(span(g))+(actions&&!manager&&g.length>1?details(g,false):'')+'</td><td>'+E(groupLabel(g))+'</td><td>'+E(l.cancelled?'Cancelled':'Recorded')+'</td><td>'+E(l.remark||'—')+(l.cancelled?'<br><small>Deleted by '+E(person(l.cancelledBy).name)+' · '+E(l.cancelReason||'Correction')+'</small>':'')+'</td><td>'+E(person(l.by).name||'—')+'</td>'+(manager?'<td>'+(l.cancelled?'':g.length>1?details(g,true):buttons(l))+'</td>':'')+'</tr>';
  }).join('')+'</tbody></table></div>':'<div class="notice">No leave records match these filters.</div>';
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
  const d=current();view=mode==='today'?'daily':'grouped';filters={month:mode==='month'?d.day.slice(0,7):'',employee:'',status:'active',day:mode==='today'?d.day:''};
  const title=mode==='today'?'Today’s Leave':'Leave History';
  openModal('<section id="zukaitLeaveHistory"><div class="section-title"><h2>'+title+'</h2><button type="button" class="secondary" onclick="closeModal()">Close</button></div>'+
   '<div class="grid"><label>Month<select id="leaveHistoryMonth" onchange="zukaitLeaveHistory.filter(\'month\',this.value)"></select></label><label>Staff<select id="leaveHistoryEmployee" onchange="zukaitLeaveHistory.filter(\'employee\',this.value)"></select></label><label>Status<select id="leaveHistoryStatus" onchange="zukaitLeaveHistory.filter(\'status\',this.value)"><option value="active">Non-cancelled</option><option value="all">All records</option><option value="cancelled">Cancelled only</option></select></label><label>View<select id="leaveHistoryView" onchange="zukaitLeaveHistory.setView(this.value)"><option value="grouped" '+(view==='grouped'?'selected':'')+'>Grouped periods</option><option value="daily" '+(view==='daily'?'selected':'')+'>Daily records</option></select></label></div>'+
   '<div class="v74-actions"><button type="button" onclick="zukaitLeaveHistory.open(\'history\')">All Month History</button><button type="button" onclick="v755OpenLeaveHub()">'+(me.role==='Manager'?'Mark / Forgotten Leave':'Mark Leave')+'</button><button type="button" onclick="zukaitLeaveHistory.sync()">Refresh</button><button type="button" onclick="zukaitLeaveHistory.print()">Print / PDF</button><button type="button" onclick="zukaitLeaveHistory.share()">WhatsApp</button></div>'+
   (filters.day?'<p id="leaveHistoryDayNote" class="notice">Showing '+E(filters.day)+' (Asia/Muscat). Choose a month or All Month History for other dates.</p>':'')+
   '<p id="leaveHistorySync" class="muted" role="status"></p><div id="leaveHistoryResults"></div></section>');
  refresh();
 }
 function filter(key,value){if(!allowed()||!['month','employee','status'].includes(key))return;filters[key]=value;if(key==='month'){filters.day='';const note=document.getElementById('leaveHistoryDayNote');if(note)note.textContent=''}refresh()}
 function setView(value){if(!allowed()||!['grouped','daily'].includes(value))return;view=value;refresh()}
 async function sync(){if(!allowed())return;try{await window.zukaitCloud?.syncNow?.()}catch(_){patch('leaveHistorySync','Unable to sync. Saved history is still available.');return}refresh()}
 function print(){if(!allowed())return;const list=rows(),title='Leave History — '+(filters.day|| (filters.month?monthLabel(filters.month):'All months'));
  const html='<html><head><title>'+E(title)+'</title><style>body{font:14px Arial}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:8px;text-align:left}</style></head><body><h2>Zukait Auto Services</h2><h3>'+E(title)+'</h3><p>'+list.length+' daily records · '+grouped(list).length+' displayed rows</p>'+table(list,false)+'</body></html>';
  if(typeof window.v110ReportActions==='function')return window.v110ReportActions(html,'Zukait_Leave_History.pdf');
  const w=window.open('','_blank');if(w){w.document.write(html);w.document.close();w.print()}
 }
 function share(){if(!allowed())return;const text='Zukait Auto Services — Leave History\n'+grouped(rows()).map(g=>{const l=g[0];return [person(l.emp).name,span(g),groupLabel(g),l.cancelled?'Cancelled':'Recorded',l.remark||''].join(' | ')}).join('\n');window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank')}
 async function confirmSaved(id){
  let shared=false;
  try{if(navigator.onLine&&window.zukaitCloud){await window.zukaitCloud.syncNow();shared=!window.zukaitCloud.dirty&&window.zukaitCloud.ready}}catch(_){}
  refresh();
  const retained=!id||rules.rows().some(l=>l&&String(l.id)===String(id)&&!l.cancelled);
  const message=!retained?'This leave could not be confirmed after synchronization. Check Leave History before marking it again.':shared?'Leave synchronized. Manager and Supervisor can see it.':'Leave saved on this device. Waiting to synchronize with Manager and Supervisor; use Refresh to retry.';
  if(typeof window.v74Msg==='function')window.v74Msg(message,'Leave');else alert(message);
 }
 async function confirmDeleted(id){
  let shared=false;
  try{if(navigator.onLine&&window.zukaitCloud){await window.zukaitCloud.syncNow();shared=!window.zukaitCloud.dirty&&window.zukaitCloud.ready}}catch(_){}
  refresh();
  const retained=rules.rows().some(l=>l&&String(l.id)===String(id)&&l.cancelled);
  const message=!retained?'The deletion could not be confirmed. Refresh Leave History before retrying.':shared?'Leave deleted and synchronized. It no longer counts as leave; the correction remains in history.':'Leave deleted on this device. Waiting to synchronize; the correction remains in history.';
  if(typeof window.v74Msg==='function')window.v74Msg(message,'Leave');else alert(message);
 }
 window.zukaitLeaveHistory={open,filter,setView,refresh,sync,print,share,rows,confirmSaved,confirmDeleted};
 // Last-loaded authority prevents older decorators from overriding history.
 window.v755OpenLeaveList=open;
 window.v133OpenManagerLeave=()=>open('history');
 window.v133LeaveRows=rows;window.v133PrintLeave=print;window.v133ShareLeave=share;
 document.addEventListener('click',e=>{if(!allowed()||me.role!=='Manager')return;const del=e.target.closest?.('[data-leave-delete]');if(del){window.v114DeleteLeave(del.dataset.leaveDelete);return}const b=e.target.closest?.('[data-leave-edit]');if(b)window.v114EditLeave(b.dataset.leaveEdit)});
 const prevPull=window.v42AfterCloudPull;window.v42AfterCloudPull=function(){const r=prevPull?.apply(this,arguments);refresh();return r};
 window.addEventListener('focus',refresh);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
 setInterval(()=>{if(document.visibilityState!=='hidden')refresh()},30000);
})();

