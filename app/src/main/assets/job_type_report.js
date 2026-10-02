/* V250 Job Type monthly report. Read-only; amounts come from the authoritative Job Card value. */
(function(){'use strict';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'OMR '+Number(v||0).toFixed(3);
function jobs(){return (window.state?.jobs||[]).filter(j=>j&&j.no!=='ID001'&&!j.deleted&&!j.archived)}
function monthBounds(y,m){return{from:+new Date(y,m,1),to:+new Date(y,m+1,1)}}
function cashRows(y,m){
 const {from,to}=monthBounds(y,m),cash=jobs().filter(j=>String(j.jobType||'').toUpperCase()==='CASH');
 const received=cash.filter(j=>Number(j.createdAt||0)>=from&&Number(j.createdAt||0)<to);
 const delivered=cash.filter(j=>j.delivered&&Number(j.deliveredAt||0)>=from&&Number(j.deliveredAt||0)<to);
 const pending=cash.filter(j=>Number(j.createdAt||0)<to&&(!j.delivered||Number(j.deliveredAt||0)>=to));
 return{received,delivered,pending};
}
function total(rows){return rows.reduce((n,j)=>n+(Number(j.amount)||0),0)}
function table(rows,dateField){
 if(!rows.length)return '<p class="muted">No matching Cash jobs.</p>';
 return '<div class="manager-scroll"><table><tr><th>JC</th><th>Date</th><th>Registration</th><th>Vehicle</th><th>Status</th><th>Amount</th></tr>'+rows.slice().sort((a,b)=>Number(b[dateField]||b.createdAt||0)-Number(a[dateField]||a.createdAt||0)).map(j=>'<tr><td><b>'+E(j.no)+'</b></td><td>'+E(new Date(Number(j[dateField]||j.createdAt||0)).toLocaleDateString('en-GB',{timeZone:'Asia/Muscat'}))+'</td><td>'+E(j.reg||'—')+'</td><td>'+E(j.vehicle||'—')+'</td><td>'+E(j.delivered?'Delivered':'Open')+'</td><td><b>'+money(j.amount)+'</b></td></tr>').join('')+'</table></div>';
}
function render(){
 const y=Number(document.getElementById('v250JobYear')?.value),m=Number(document.getElementById('v250JobMonth')?.value);
 if(!Number.isInteger(y)||!Number.isInteger(m))return;
 const r=cashRows(y,m),host=document.getElementById('v250JobReportBody');if(!host)return;
 const card=(label,rows,kind)=>'<button class="v250-job-kpi '+kind+'" onclick="v250OpenCashList(\''+kind+'\')"><span>'+label+'</span><strong>'+rows.length+'</strong><b>'+money(total(rows))+'</b><small>Click for Job Cards</small></button>';
 host.innerHTML='<div class="v250-job-grid">'+card('Cash Received',r.received,'received')+card('Cash Delivered',r.delivered,'delivered')+card('Cash Pending',r.pending,'pending')+'</div><p class="muted">Received uses the Job Card received/created month. Delivered uses the actual delivery month. Amount always uses the latest accurate Job Card amount.</p>';
 window.__v250CashReport=r;
}
window.v250OpenJobTypeReport=function(){
 if(window.me?.role!=='Manager')return;
 const d=new Date(),months=Array.from({length:12},(_,i)=>'<option value="'+i+'"'+(i===d.getMonth()?' selected':'')+'>'+new Date(2000,i,1).toLocaleString('en',{month:'long'})+'</option>').join('');
 const years=Array.from({length:5},(_,i)=>d.getFullYear()-i).map(y=>'<option value="'+y+'"'+(y===d.getFullYear()?' selected':'')+'>'+y+'</option>').join('');
 openModal('<div class="section-title"><h2>Job Type Report</h2><button class="secondary" onclick="closeModal()">Close</button></div><div class="v250-report-filter"><label>Month<select id="v250JobMonth" onchange="v250RefreshJobTypeReport()">'+months+'</select></label><label>Year<select id="v250JobYear" onchange="v250RefreshJobTypeReport()">'+years+'</select></label></div><div id="v250JobReportBody"></div>');
 render();
};
window.v250RefreshJobTypeReport=render;
window.v250OpenCashList=function(kind){const r=window.__v250CashReport||{},rows=r[kind]||[],dateField=kind==='delivered'?'deliveredAt':'createdAt';openModal('<div class="section-title"><h2>Cash '+E(kind.charAt(0).toUpperCase()+kind.slice(1))+'</h2><button class="secondary" onclick="v250OpenJobTypeReport()">← Back</button></div><p><b>'+rows.length+' jobs · '+money(total(rows))+'</b></p>'+table(rows,dateField))};
const s=document.createElement('style');s.textContent='.v250-report-filter{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0 14px}.v250-report-filter select{width:100%}.v250-job-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.v250-job-kpi{min-height:115px;padding:12px;border-radius:14px;border:1px solid;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;text-align:left}.v250-job-kpi span{font-weight:900}.v250-job-kpi strong{font-size:27px;margin:3px 0}.v250-job-kpi b{font-size:14px}.v250-job-kpi small{margin-top:4px;opacity:.72}.v250-job-kpi.received{background:#eef7ff;color:#245b8d;border-color:#cfe3f4}.v250-job-kpi.delivered{background:#edf9f3;color:#21704e;border-color:#cce9d9}.v250-job-kpi.pending{background:#fff7e8;color:#93621e;border-color:#f0dfbd}@media(max-width:560px){.v250-job-grid{grid-template-columns:1fr}.v250-report-filter{grid-template-columns:1fr 1fr}}';document.head.appendChild(s);
})();