(function(){
'use strict';
const RATE=2.5;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const fmtM=m=>{try{return fmt(Math.max(0,Number(m)||0))}catch(_){const n=Math.max(0,Math.round(Number(m)||0));return Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m'}};
const money=m=> 'OMR '+((Math.max(0,Number(m)||0)/60)*RATE).toFixed(3);
const jinfo=no=>{try{return job(no)||{no,vehicle:'',reg:''}}catch(_){return{no,vehicle:'',reg:''}}};
const person=id=>{try{return user(id)||{id,name:id,department:''}}catch(_){return{id,name:id,department:''}}};

function assignmentMinutes(a){
 try{return totalForAssignment(a)||0}catch(_){
  return (state.sessions||[]).filter(s=>s.assignmentId===a.id).reduce((n,s)=>n+Math.max(0,((s.end||Date.now())-s.start)/60000),0);
 }
}
function jcAssignments(no){return (state.assign||[]).filter(a=>a&&a.job===no&&!a.cancelled)}
function jcSessions(no){return (state.sessions||[]).filter(s=>s&&s.job===no)}
function uniqueWorkedPeople(no){
 return [...new Set(jcSessions(no).filter(s=>((s.end||Date.now())-s.start)>0).map(s=>s.emp))];
}
function aggregatePeople(no){
 const ids=[...new Set(jcAssignments(no).map(a=>a.emp))];
 return ids.map(id=>{
   const aa=jcAssignments(no).filter(a=>a.emp===id);
   const suggested=aa.reduce((n,a)=>n+(+a.suggested||0),0);
   const actual=aa.reduce((n,a)=>n+assignmentMinutes(a),0);
   return {id,u:person(id),suggested,actual,assignments:aa};
 }).filter(x=>x.actual>0||x.suggested>0);
}
function totals(no){
 const aa=jcAssignments(no);
 const suggested=aa.reduce((n,a)=>n+(+a.suggested||0),0);
 const actual=aa.reduce((n,a)=>n+assignmentMinutes(a),0);
 const original=aa.filter(a=>!a.rework).reduce((n,a)=>n+assignmentMinutes(a),0);
 const repeat=aa.filter(a=>a.rework).reduce((n,a)=>n+assignmentMinutes(a),0);
 return {suggested,actual,original,repeat,people:uniqueWorkedPeople(no).length};
}
function repeatRows(no){
 const aa=jcAssignments(no).filter(a=>a.rework);
 return aa.map(a=>{
   const log=(state.reworkLogs||[]).find(x=>x.assignmentId===a.id) || (state.reworks||[]).find(x=>x.assignmentId===a.id||x.id===a.id) || {};
   return {a,log,u:person(a.emp),mistake:person(a.mistakeEmp||log.mistakeEmp||log.mistake||''),actual:assignmentMinutes(a)};
 });
}
function relatedJobs(reg,current){
 const key=clean(reg);if(!key)return[];
 return (state.jobs||[]).filter(j=>j.no!==current&&clean(j.reg)===key).slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
function review(no){
 state.managerReviews=state.managerReviews||{};
 return state.managerReviews[no]||{flag:false,remark:'',updatedAt:null,updatedBy:null};
}
function saveReview(no){
 if(!me||me.role!=='Manager')return;
 const flag=!!document.getElementById('v68ReviewFlag')?.checked;
 const remark=(document.getElementById('v68ReviewRemark')?.value||'').trim();
 state.managerReviews=state.managerReviews||{};
 state.managerReviews[no]={flag,remark,updatedAt:Date.now(),updatedBy:me.id};
 save();
 v68OpenJobDetail(no);
}
function timeline(no){
 const items=[];
 jcAssignments(no).forEach(a=>{
   if(a.assignedAt)items.push({at:a.assignedAt,label:(a.rework?'Repeat Work assigned':'Assigned')+' to '+person(a.emp).name});
   if(a.completedAt)items.push({at:a.completedAt,label:(a.rework?'Repeat Work finished':'Work finished')+' — '+person(a.emp).name});
 });
 jcSessions(no).forEach(s=>{
   items.push({at:s.start,label:(s.rework?'Repeat ':'')+'Started — '+person(s.emp).name});
   if(s.end)items.push({at:s.end,label:(s.paused?'Paused':'Stopped / Finished')+' — '+person(s.emp).name+(s.pauseReason?' · '+s.pauseReason:'')});
 });
 return items.filter(x=>x.at).sort((a,b)=>a.at-b.at);
}

window.v68ManagerSearch=function(){
 if(!me||me.role!=='Manager')return;
 const raw=(document.getElementById('v68ManagerSearch')?.value||'').trim();
 const q=clean(raw);
 if(!q)return alert('Enter Job Card number or registration number.');
 const jobs=(state.jobs||[]).filter(j=>j.no!=='ID001');
 const exactJc=jobs.filter(j=>clean(j.no)===q);
 let matches=exactJc.length?exactJc:jobs.filter(j=>clean(j.reg)===q);
 if(!matches.length)matches=jobs.filter(j=>clean(j.no).includes(q)||clean(j.reg).includes(q));
 matches=matches.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 const rows=matches.map(j=>{
   const t=totals(j.no),hasRepeat=repeatRows(j.no).length>0;
   return '<button class="v68-result" onclick="v68OpenJobDetail(\''+esc(j.no)+'\')"><span><b>'+esc(j.no)+'</b><small>'+esc(j.vehicle||'—')+' · '+esc(j.reg||'—')+'</small></span><span class="v68-result-meta">'+fmtM(t.actual)+(hasRepeat?' · Repeat Work':'')+' ›</span></button>';
 }).join('');
 openModal('<div class="v68-search-modal"><div class="section-title"><h2>Job Card Search</h2><button class="secondary" onclick="closeModal()">Close</button></div><p class="muted">Search: <b>'+esc(raw)+'</b></p>'+(rows||'<div class="notice">No matching Job Card or registration number found.</div>')+'</div>');
};
window.v68SearchKey=function(e){if(e.key==='Enter')v68ManagerSearch()};

window.v68OpenVehicleHistory=function(reg){
 if(!me||me.role!=='Manager')return;
 const key=clean(reg);
 const list=(state.jobs||[]).filter(j=>j.no!=='ID001'&&clean(j.reg)===key).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
 const rows=list.map(j=>{const t=totals(j.no);return '<tr><td><button class="v68-link" onclick="v68OpenJobDetail(\''+esc(j.no)+'\')">'+esc(j.no)+'</button></td><td>'+esc(j.vehicle||'—')+'</td><td>'+new Date(j.createdAt||Date.now()).toLocaleDateString()+'</td><td>'+fmtM(t.actual)+'</td><td>'+money(t.actual)+'</td><td>'+(repeatRows(j.no).length?'YES':'NO')+'</td></tr>'}).join('');
 openModal('<div class="section-title"><h2>Vehicle History — '+esc(reg||'—')+'</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="v68-table"><table><tr><th>Job Card</th><th>Vehicle</th><th>Date</th><th>Actual Hours</th><th>Actual Labour Cost</th><th>Repeat</th></tr>'+rows+'</table></div>');
};

window.v68OpenJobDetail=function(no){
 if(!me||me.role!=='Manager')return;
 const j=jinfo(no),aa=jcAssignments(no),people=aggregatePeople(no),t=totals(no),repeats=repeatRows(no),rel=relatedJobs(j.reg,no),rv=review(no),tl=timeline(no);
 const tech=people.length?'<div class="v68-table"><table><tr><th>Worked Person</th><th>Department</th><th>Suggested</th><th>Actual</th><th>Suggested Cost</th><th>Actual Cost</th></tr>'+
 people.map(x=>'<tr><td><b>'+esc(x.u.name)+'</b></td><td>'+esc(x.u.department||'—')+'</td><td>'+fmtM(x.suggested)+'</td><td><b>'+fmtM(x.actual)+'</b></td><td>'+money(x.suggested)+'</td><td><b>'+money(x.actual)+'</b></td></tr>').join('')+'</table></div>':'<div class="notice">No technician work recorded yet.</div>';
 const rep=repeats.length?'<div class="v68-block repeat"><h3>Repeat Work</h3>'+repeats.map(x=>'<div class="v68-repeat-row"><div><b>Repeat Employee</b><span>'+esc(x.u.name)+'</span></div><div><b>Mistake Employee</b><span>'+esc(x.mistake.name||'—')+'</span></div><div><b>Allocated Repeat Time</b><span>'+fmtM(+x.a.suggested||0)+'</span></div><div><b>Actual Repeat Time</b><span>'+fmtM(x.actual)+'</span></div><div class="wide"><b>Repeat Reason</b><span>'+esc(x.a.reason||x.log.reason||'—')+'</span></div><div><b>Status</b><span>'+(x.a.completed?'Finished':'Open')+'</span></div></div>').join('')+'</div>':'<div class="v68-block"><h3>Repeat Work</h3><p class="muted">No Repeat Work recorded for this Job Card.</p></div>';
 const related=rel.length?rel.map(x=>'<button class="v68-related" onclick="v68OpenJobDetail(\''+esc(x.no)+'\')">'+esc(x.no)+' <small>'+new Date(x.createdAt||Date.now()).toLocaleDateString()+'</small></button>').join(''):'<span class="muted">No other Job Cards for this registration.</span>';
 const time=tl.length?tl.map(x=>'<div class="v68-time-row"><b>'+new Date(x.at).toLocaleString()+'</b><span>'+esc(x.label)+'</span></div>').join(''):'<span class="muted">No timeline recorded.</span>';
 openModal('<div class="v68-detail">'+
 '<div class="v68-detail-head"><div><span>MANAGER JOB CARD REVIEW</span><h2>'+esc(no)+'</h2><p>'+esc(j.vehicle||'—')+' · '+esc(j.reg||'—')+'</p></div><button class="secondary" onclick="closeModal()">Close</button></div>'+
 '<div class="v68-summary"><div><small>Persons Worked</small><b>'+t.people+'</b></div><div><small>Total Suggested</small><b>'+fmtM(t.suggested)+'</b></div><div><small>Total Actual</small><b>'+fmtM(t.actual)+'</b></div><div><small>Labour Rate</small><b>OMR 2.500/hr</b></div><div><small>Suggested Labour Cost</small><b>'+money(t.suggested)+'</b></div><div><small>Actual Labour Cost</small><b>'+money(t.actual)+'</b></div></div>'+
 '<div class="v68-block"><h3>Worked Persons</h3>'+tech+'</div>'+
 rep+
 '<div class="v68-two"><div class="v68-block"><h3>Work Timeline</h3>'+time+'</div><div class="v68-block"><h3>Other Job Cards — Same Registration</h3><div class="v68-related-list">'+related+'</div><p><button class="v68-light-btn" onclick="v68OpenVehicleHistory(\''+esc(j.reg||'')+'\')">VEHICLE HISTORY</button></p></div></div>'+
 '<div class="v68-block review"><h3>Management Review</h3><label class="v68-check"><input type="checkbox" id="v68ReviewFlag" '+(rv.flag?'checked':'')+'> Mark for Management Review</label><label>Manager Remark<br><textarea id="v68ReviewRemark" rows="3" placeholder="Optional management remark">'+esc(rv.remark||'')+'</textarea></label><p><button class="v68-light-btn" onclick="v68SaveReview(\''+esc(no)+'\')">SAVE REMARK</button></p></div>'+
 '<div class="v68-actions"><button class="v68-print" onclick="v68PrintSummary(\''+esc(no)+'\')">PRINT SUMMARY</button><button class="v68-share" onclick="v68FullReport(\''+esc(no)+'\')">FULL PDF / EMAIL / WHATSAPP</button></div>'+
 '</div>');
};
window.v68SaveReview=saveReview;

function reportStyle(){
 return '<style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#172033;margin:0;font-size:12px}h1{font-size:20px;margin:0}h2{font-size:15px;margin:18px 0 8px}p{margin:4px 0}.head{display:flex;justify-content:space-between;border-bottom:2px solid #1f3653;padding-bottom:10px;margin-bottom:12px}.muted{color:#667085}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.box{border:1px solid #d9e1ea;padding:10px;border-radius:8px}.box small{display:block;color:#667085;margin-bottom:4px}.box b{font-size:14px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #d9e1ea;padding:7px;text-align:left}th{background:#f3f6f9}.total{margin-top:14px;padding:12px;border:2px solid #1f3653;border-radius:8px;font-size:14px}.section{margin:14px 0;page-break-inside:avoid}.repeat{background:#faf7ff;padding:10px;border:1px solid #e4d9f3;border-radius:8px}.timeline div{padding:5px 0;border-bottom:1px solid #eee}.remark{white-space:pre-wrap;border:1px solid #ddd;padding:10px;min-height:45px}.footer{margin-top:24px;border-top:1px solid #ddd;padding-top:7px;color:#667085;font-size:10px}.no-print{margin-bottom:12px}.no-print button{padding:8px 12px;margin-right:6px}@media print{.no-print{display:none}}</style>';
}
function openReport(html,title){
 const w=window.open('','_blank');
 if(!w){alert('Popup blocked. Please allow popups for this site and try again.');return;}
 w.document.open();w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title>'+reportStyle()+'</head><body>'+html+'</body></html>');w.document.close();w.focus();
}
window.v68PrintSummary=function(no){
 const j=jinfo(no),people=aggregatePeople(no),t=totals(no);
 const rows=people.filter(x=>x.actual>0).map(x=>'<tr><td><b>'+esc(x.u.name)+'</b></td><td>'+fmtM(x.suggested)+'</td><td>'+fmtM(x.actual)+'</td><td>'+money(x.suggested)+'</td><td>'+money(x.actual)+'</td></tr>').join('');
 const html='<div class="no-print"><button onclick="window.print()">PRINT</button></div><div class="head"><div><h1>ZUKAIT AUTO</h1><p>JOB CARD LABOUR SUMMARY</p></div><div><b>JC '+esc(no)+'</b><p>'+esc(j.reg||'—')+'</p></div></div>'+
 '<table><tr><th>Worked Person</th><th>Suggested Hours</th><th>Actual Hours</th><th>Suggested Labour Cost</th><th>Actual Labour Cost</th></tr>'+rows+'</table>'+
 '<div class="total"><b>Total Actual Labour Time:</b> '+fmtM(t.actual)+'<br><b>Total Actual Labour Cost:</b> '+money(t.actual)+'</div>'+
 '<div class="footer">Labour rate: OMR 2.500/hour · Printed '+new Date().toLocaleString()+' · '+esc(me?.name||'Manager')+'</div>';
 openReport(html,'JC '+no+' Labour Summary');
};
window.v68FullReport=function(no){
 const j=jinfo(no),people=aggregatePeople(no),t=totals(no),repeats=repeatRows(no),rel=relatedJobs(j.reg,no),rv=review(no),tl=timeline(no);
 const tech=people.map(x=>'<tr><td>'+esc(x.u.name)+'</td><td>'+esc(x.u.department||'—')+'</td><td>'+fmtM(x.suggested)+'</td><td>'+fmtM(x.actual)+'</td><td>'+money(x.suggested)+'</td><td>'+money(x.actual)+'</td></tr>').join('');
 const rep=repeats.length?repeats.map(x=>'<div class="repeat"><b>Repeat Employee:</b> '+esc(x.u.name)+'<br><b>Mistake Employee:</b> '+esc(x.mistake.name||'—')+'<br><b>Reason:</b> '+esc(x.a.reason||x.log.reason||'—')+'<br><b>Allocated:</b> '+fmtM(+x.a.suggested||0)+' · <b>Actual:</b> '+fmtM(x.actual)+' · <b>Status:</b> '+(x.a.completed?'Finished':'Open')+'</div>').join(''):'<p>No Repeat Work recorded.</p>';
 const time=tl.map(x=>'<div><b>'+new Date(x.at).toLocaleString()+'</b> — '+esc(x.label)+'</div>').join('');
 const other=rel.length?'<table><tr><th>Job Card</th><th>Date</th><th>Actual Hours</th><th>Actual Cost</th></tr>'+rel.map(x=>{const z=totals(x.no);return'<tr><td>'+esc(x.no)+'</td><td>'+new Date(x.createdAt||Date.now()).toLocaleDateString()+'</td><td>'+fmtM(z.actual)+'</td><td>'+money(z.actual)+'</td></tr>'}).join('')+'</table>':'<p>No other Job Cards for this registration.</p>';
 const html='<div class="no-print"><button onclick="window.print()">SAVE AS PDF / SHARE</button></div>'+
 '<div class="head"><div><h1>ZUKAIT AUTO</h1><p>FULL JOB CARD MANAGEMENT REPORT</p></div><div><b>JC '+esc(no)+'</b><p>'+esc(j.vehicle||'—')+'</p><p>'+esc(j.reg||'—')+'</p></div></div>'+
 '<div class="summary"><div class="box"><small>Persons Worked</small><b>'+t.people+'</b></div><div class="box"><small>Total Suggested</small><b>'+fmtM(t.suggested)+'</b></div><div class="box"><small>Total Actual</small><b>'+fmtM(t.actual)+'</b></div><div class="box"><small>Original Actual</small><b>'+fmtM(t.original)+'</b></div><div class="box"><small>Repeat Actual</small><b>'+fmtM(t.repeat)+'</b></div><div class="box"><small>Total Actual Labour Cost</small><b>'+money(t.actual)+'</b></div></div>'+
 '<div class="section"><h2>Worked Persons</h2><table><tr><th>Name</th><th>Department</th><th>Suggested</th><th>Actual</th><th>Suggested Cost</th><th>Actual Cost</th></tr>'+tech+'</table></div>'+
 '<div class="section"><h2>Repeat Work</h2>'+rep+'</div>'+
 '<div class="section"><h2>Work Timeline</h2><div class="timeline">'+(time||'No timeline recorded.')+'</div></div>'+
 '<div class="section"><h2>Other Job Cards — Same Registration</h2>'+other+'</div>'+
 '<div class="section"><h2>Management Review</h2><p><b>Flagged:</b> '+(rv.flag?'YES':'NO')+'</p><div class="remark">'+esc(rv.remark||'No manager remark.')+'</div></div>'+
 '<div class="footer">Report generated '+new Date().toLocaleString()+' · Generated by '+esc(me?.name||'Manager')+' · Labour rate OMR 2.500/hour</div>';
 openReport(html,'JC '+no+' Full Management Report');
};

function injectSearch(){
 if(!me||me.role!=='Manager')return;
 const root=document.getElementById('managerView');if(!root)return;
 const titles=[...root.querySelectorAll('.v67-section-title')];
 const head=titles.find(x=>/Workshop Control Center/i.test(x.textContent||''));if(!head||head.querySelector('.v68-search-wrap'))return;
 head.classList.add('v68-control-head');
 const box=document.createElement('div');box.className='v68-search-wrap';
 box.innerHTML='<span>⌕</span><input id="v68ManagerSearch" placeholder="JC / Reg No." autocomplete="off" onkeydown="v68SearchKey(event)"><button onclick="v68ManagerSearch()">Search</button>';
 head.appendChild(box);
}
const css=document.createElement('style');css.id='v68SearchStyle';css.textContent=`
.v68-control-head{display:flex!important;justify-content:space-between;align-items:flex-start;gap:12px}.v68-search-wrap{display:flex;align-items:center;gap:5px;background:#f8fafc;border:1px solid #dbe3ed;border-radius:11px;padding:4px 5px 4px 9px;box-shadow:0 3px 8px rgba(34,55,80,.06);min-width:240px}.v68-search-wrap span{color:#6c7d91;font-size:16px}.v68-search-wrap input{border:0!important;background:transparent!important;box-shadow:none!important;padding:5px 3px!important;min-width:0;width:125px;color:#253b55}.v68-search-wrap input:focus{outline:none}.v68-search-wrap button{margin:0!important;padding:6px 9px!important;border-radius:8px!important;background:#eaf2fb!important;color:#315a85!important;border:1px solid #d0deed!important;font-size:11px!important;font-weight:900!important}.v68-search-modal{max-width:590px;margin:auto}.v68-result{width:100%;margin:5px 0!important;padding:11px 12px!important;border-radius:11px!important;background:#f8fafc!important;color:#243b57!important;border:1px solid #dce4ed!important;display:flex;justify-content:space-between;align-items:center;text-align:left;box-shadow:0 2px 6px rgba(34,55,80,.05)}.v68-result b,.v68-result small{display:block}.v68-result small{margin-top:3px;color:#718196}.v68-result-meta{font-size:11px;color:#536b85}.v68-detail-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:1px solid #e1e7ee;padding-bottom:11px}.v68-detail-head span{font-size:10px;font-weight:900;letter-spacing:.1em;color:#75869a}.v68-detail-head h2{margin:3px 0;color:#223b59}.v68-detail-head p{margin:0;color:#6f8094}.v68-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.v68-summary>div{background:#f7f9fc;border:1px solid #e0e6ed;border-radius:11px;padding:10px}.v68-summary small{display:block;color:#748398;font-size:10px;font-weight:800}.v68-summary b{display:block;margin-top:5px;color:#263d58}.v68-block{border:1px solid #e1e7ee;border-radius:12px;padding:12px;margin:10px 0;background:#fff}.v68-block h3{margin:0 0 9px;color:#2a415d;font-size:15px}.v68-block.repeat{background:#faf7ff;border-color:#e8def4}.v68-table{overflow:auto}.v68-table table{min-width:650px}.v68-repeat-row{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.v68-repeat-row>div{background:#fff;border:1px solid #e7e0ef;border-radius:9px;padding:8px}.v68-repeat-row .wide{grid-column:1/-1}.v68-repeat-row b,.v68-repeat-row span{display:block}.v68-repeat-row b{font-size:10px;color:#77658e}.v68-repeat-row span{margin-top:3px}.v68-two{display:grid;grid-template-columns:1.2fr .8fr;gap:10px}.v68-time-row{padding:7px 0;border-bottom:1px solid #edf0f4}.v68-time-row b,.v68-time-row span{display:block}.v68-time-row b{font-size:10px;color:#718197}.v68-related{display:block;width:100%;text-align:left;background:#f7f9fc!important;color:#304a68!important;border:1px solid #dce4ed!important;border-radius:8px!important;margin:5px 0!important}.v68-related small{float:right;color:#8090a2}.v68-light-btn{background:#edf4fb!important;color:#315c88!important;border:1px solid #cfdeed!important}.v68-check{display:block;margin-bottom:8px}.v68-block textarea{width:100%;box-sizing:border-box;margin-top:5px}.v68-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.v68-actions button{min-height:48px;font-weight:900;border-radius:11px}.v68-print{background:#eef5ff!important;color:#28588e!important;border:1px solid #cddff3!important}.v68-share{background:#eef9f3!important;color:#2e7251!important;border:1px solid #cee8d9!important}.v68-link{background:transparent!important;color:#2b5f96!important;padding:0!important;text-decoration:underline}.review{background:#fbfcfe}
@media(max-width:650px){.v68-control-head{align-items:stretch}.v68-search-wrap{min-width:0;width:47%;box-sizing:border-box}.v68-search-wrap input{width:100%}.v68-summary{grid-template-columns:repeat(2,1fr)}.v68-two{grid-template-columns:1fr}.v68-repeat-row{grid-template-columns:1fr}.v68-actions{grid-template-columns:1fr}}
`;document.head.appendChild(css);

const prevRender=window.render;
window.render=function(){prevRender();setTimeout(injectSearch,0)};
setTimeout(injectSearch,100);
window.v68UpdateCheckResult=function(latestCode,latestName,error){if(typeof window.v67UpdateCheckResult==='function')return window.v67UpdateCheckResult(latestCode,latestName,error);};
window.v68Ready=true;
})();