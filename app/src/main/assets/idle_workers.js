(function(){'use strict';
const HOLD='ID001',MIN=60000;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayStart=t=>{const d=new Date(t);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()};
const dateKey=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const fmtTime=t=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',hour12:true});
const fmtDate=t=>new Date(t).toLocaleDateString([],{day:'2-digit',month:'short',year:'numeric'});
const fmtMinutes=m=>{m=Math.max(0,Math.round(m));const h=Math.floor(m/60),n=m%60;return h?(h+'h '+(n?String(n).padStart(2,'0')+'m':'')):(n+'m')};
function employees(){return (window.users||[]).filter(u=>u&&u.role==='Employee')}
function isPublicHoliday(ds){
 const key=dateKey(ds),lists=[state?.holidays,state?.publicHolidays,state?.holidayDates].filter(Array.isArray);
 return lists.some(list=>list.some(h=>{if(!h||h.cancelled||h.deleted)return false;const v=typeof h==='string'?h:(h.date||h.day||h.holidayDate||'');return String(v).slice(0,10)===key}));
}
function leaveIntervals(emp,from,to){
 return (state?.leaves||[]).filter(l=>l&&!l.cancelled&&l.emp===emp).map(l=>{
  const ds=dayStart(new Date(String(l.date||'')+'T12:00:00').getTime());
  const w=l.period==='AM'?[ds+8*3600000,ds+13*3600000]:l.period==='PM'?[ds+15*3600000,ds+19*3600000]:[ds+8*3600000,ds+19*3600000];
  return[Math.max(from,w[0]),Math.min(to,w[1])];
 }).filter(x=>x[1]>x[0]);
}
function busyIntervals(emp,from,to){
 const work=(state?.sessions||[]).filter(s=>s&&s.emp===emp&&s.start<to&&(s.end||Date.now())>from)
  .map(s=>[Math.max(from,+s.start),Math.min(to,+(s.end||Date.now()))]).filter(x=>x[1]>x[0]);
 return work.concat(leaveIntervals(emp,from,to)).sort((a,b)=>a[0]-b[0]);
}
function merge(rows){const out=[];for(const r of rows){const last=out[out.length-1];if(!last||r[0]>last[1])out.push(r.slice());else last[1]=Math.max(last[1],r[1]);}return out}
function idleIntervals(emp,from,to){
 const now=Date.now(),end=Math.min(to,now),out=[];if(end<=from)return out;
 for(let ds=dayStart(from);ds<end;ds+=86400000){
  if(new Date(ds).getDay()===5||isPublicHoliday(ds))continue;
  for(const [a,b] of [[8*60,13*60],[15*60,19*60]]){
   const ws=Math.max(from,ds+a*MIN),we=Math.min(end,ds+b*MIN);if(we<=ws)continue;
   const busy=merge(busyIntervals(emp,ws,we));let cur=ws;
   for(const r of busy){if(r[0]>cur)out.push([cur,r[0]]);cur=Math.max(cur,r[1]);}
   if(cur<we)out.push([cur,we]);
  }
 }
 return out;
}
function period(kind,date){
 const n=date?new Date(date+'T12:00:00'):new Date(),ds=dayStart(n);
 if(kind==='day'||kind==='date')return[ds,ds+86400000];
 if(kind==='week'){const wd=(n.getDay()+6)%7,st=ds-wd*86400000;return[st,st+7*86400000]}
 return[new Date(n.getFullYear(),n.getMonth(),1).getTime(),new Date(n.getFullYear(),n.getMonth()+1,1).getTime()];
}
function currentIdleCount(){
 const now=Date.now(),ds=dayStart(now),mins=(now-ds)/MIN;
 if(new Date(now).getDay()===5||isPublicHoliday(ds)||!((mins>=480&&mins<780)||(mins>=900&&mins<1140)))return 0;
 return employees().filter(u=>!leaveIntervals(u.id,now,now+1).length&&!(state?.sessions||[]).some(s=>s&&s.emp===u.id&&!s.end&&s.start<=now)).length;
}
function reportRows(kind,date){
 const [from,to]=period(kind,date);
 return employees().map(u=>{const gaps=idleIntervals(u.id,from,to),minutes=gaps.reduce((n,g)=>n+(g[1]-g[0])/MIN,0);return{u,gaps,minutes}})
  .filter(x=>x.minutes>0).sort((a,b)=>b.minutes-a.minutes);
}
function detailsHtml(x){
 return '<div class="idle-detail"><h3>'+esc(x.u.name)+' <span>'+esc(x.u.department||'')+'</span></h3>'+
 (x.gaps.length?'<table><tr><th>Date</th><th>Idle Period</th><th>Time</th></tr>'+x.gaps.map(g=>'<tr><td>'+fmtDate(g[0])+'</td><td>'+fmtTime(g[0])+' – '+fmtTime(g[1])+'</td><td><b>'+fmtMinutes((g[1]-g[0])/MIN)+'</b></td></tr>').join('')+'</table>':'<p>No idle periods.</p>')+'</div>';
}
function body(kind,date){
 const rows=reportRows(kind,date),total=rows.reduce((n,x)=>n+x.minutes,0);
 return '<div class="idle-filters"><button onclick="zukaitOpenIdleWorkers(\'day\')">Today</button><button onclick="zukaitOpenIdleWorkers(\'week\')">Week</button><button onclick="zukaitOpenIdleWorkers(\'month\')">Month</button><label>Particular Day <input type="date" value="'+esc(date||dateKey(Date.now()))+'" onchange="zukaitOpenIdleWorkers(\'date\',this.value)"></label></div>'+
 '<div class="idle-note">Read-only · JC activation gaps only · ID001, leave, Friday, holidays, lunch and off-duty time excluded.</div>'+
 '<div class="idle-total"><b>Total Idle Time</b><strong>'+fmtMinutes(total)+'</strong></div>'+
 (rows.length?rows.map(x=>'<details class="idle-worker"><summary><span><b>'+esc(x.u.name)+'</b><small>'+esc(x.u.department||'')+'</small></span><strong>'+fmtMinutes(x.minutes)+'</strong></summary>'+detailsHtml(x)+'</details>').join(''):'<div class="notice">No idle time in this period.</div>');
}
window.zukaitOpenIdleWorkers=function(kind='day',date=''){
 if(!window.me||!['Manager','Supervisor'].includes(me.role))return;
 const html='<div class="idle-head"><h2>◷ Idle Workers</h2><button class="secondary" onclick="closeModal()">✕ CLOSE</button></div>'+body(kind,date);
 if(typeof window.openModal==='function')return window.openModal(html);
 if(me.role==='Manager'&&typeof window.showManagerModal==='function')return window.showManagerModal('Idle Workers',body(kind,date));
 if(typeof window.showSupervisorModal==='function')return window.showSupervisorModal('Idle Workers',body(kind,date));
};
function inject(root){
 if(!root||root.querySelector('[data-idle-workers-card]'))return;
 const headings=[...root.querySelectorAll('h2,h3')],h=headings.find(x=>/Today at a Glance/i.test(x.textContent||''));if(!h)return;
 const section=h.closest('.card,.v67-section,section')||h.parentElement?.parentElement;if(!section)return;
 const grid=section.querySelector('.v143-glance,.glance-grid,.grid');if(!grid)return;
 const b=document.createElement('button');b.type='button';b.dataset.idleWorkersCard='1';b.className=grid.classList.contains('v143-glance')?'idle-glance-v143':'glance-box idle-glance clickable';
 b.onclick=()=>window.zukaitOpenIdleWorkers('day');
 b.innerHTML='<span class="idle-icon">◷</span><b>Idle Workers</b><strong class="stat" data-idle-workers-count>'+currentIdleCount()+'</strong>';
 grid.appendChild(b);
}
function apply(){if(!window.me||!['Manager','Supervisor'].includes(me.role))return;inject(document.getElementById(me.role==='Manager'?'managerView':'supervisorView'));document.querySelectorAll('[data-idle-workers-count]').forEach(x=>x.textContent=String(currentIdleCount()))}
const css=document.createElement('style');css.textContent='.idle-glance-v143,.idle-glance{background:#fff7ed!important;border:1px solid #fed7aa!important;color:#9a3412!important}.idle-glance-v143 .idle-icon,.idle-glance .idle-icon{font-size:22px}.idle-filters{display:flex;gap:7px;flex-wrap:wrap;align-items:end;margin:8px 0 12px}.idle-filters button,.idle-filters label{border:1px solid #d7e0ea;border-radius:10px;background:#f8fafc;padding:8px 10px;font-weight:800}.idle-filters input{margin-left:6px}.idle-note{font-size:12px;color:#64748b;margin:8px 0 12px}.idle-total{display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:12px;background:#fff7ed;color:#9a3412;margin-bottom:8px}.idle-total strong{font-size:20px}.idle-worker{border:1px solid #e2e8f0;border-radius:12px;margin:7px 0;background:#fff}.idle-worker summary{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;cursor:pointer}.idle-worker summary span b,.idle-worker summary span small{display:block}.idle-worker summary span small{color:#64748b;margin-top:2px}.idle-worker summary strong{color:#9a3412}.idle-detail{padding:0 10px 10px;overflow:auto}.idle-detail h3 span{font-size:12px;color:#64748b}.idle-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.idle-head h2{margin:0}@media(max-width:560px){.idle-filters{display:grid;grid-template-columns:repeat(2,1fr)}.idle-filters>*{min-width:0}.idle-detail table{font-size:12px}}';document.head.appendChild(css);
let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;apply()})}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('zukait-live-status',apply);window.addEventListener('DOMContentLoaded',apply);setTimeout(apply,0);
})();