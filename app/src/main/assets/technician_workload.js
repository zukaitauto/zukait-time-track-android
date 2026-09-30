(function(){
  'use strict';
  // Match the dashboard and secure login's lexical session authority.
  const supervisor=()=>typeof me!=='undefined'&&me?.role==='Supervisor';
  const departments={Denter:'Denting',Painter:'Painting',Mechanic:'Mechanical'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const same=(a,b)=>String(a)===String(b);
  const person=id=>(users||[]).find(u=>u&&same(u.id,id));
  const vehicle=j=>[j.vehicle||[j.make||j.brand,j.model].filter(Boolean).join(' '),j.year&&!String(j.vehicle||'').includes(String(j.year))?j.year:''].filter(Boolean).join(' ')||'—';
  const minutes=n=>fmt(Math.max(0,Number(n)||0));
  let timer=null;

  // Read the existing synced projection; never create a second assignment store.
  function present(emp){
    const jobs=new Map((state.jobs||[]).filter(Boolean).map(j=>[String(j.no),j]));
    const grouped=new Map();
    for(const a of state.assign||[]){
      if(!a||!same(a.emp,emp)||a.completed||a.cancelled||a.job==='ID001')continue;
      const j=jobs.get(String(a.job));
      if(!j||j.delivered||j.archived)continue;
      if(!grouped.has(String(a.job)))grouped.set(String(a.job),{job:j,assignments:[]});
      grouped.get(String(a.job)).assignments.push(a);
    }
    return [...grouped.values()];
  }
  function matches(a,s){return !!s&&(s.assignmentId?same(a.id,s.assignmentId):same(a.emp,s.emp)&&same(a.job,s.job));}
  function status(row,live){
    if(row.assignments.some(a=>matches(a,live.session))){
      if(['Working','Overtime'].includes(live.status))return 'Working';
      if(live.status==='Paused')return 'Paused';
    }
    // Keep stale local running sessions from masquerading as live work.
    if(live.status==='Syncing'||live.status==='Unavailable')return 'Syncing';
    return row.assignments.some(a=>empStatus(a)==='Paused'||empStatus(a)==='Started')?'Paused':'Not Started';
  }
  function snapshot(emp){
    const u=person(emp),live=window.v84TechState(u)||{status:'Syncing',session:null};
    const rows=present(emp).map(row=>({...row,status:status(row,live)}));
    return {u,live,rows};
  }
  const statusClass=s=>'tw-status-'+String(s||'').toLowerCase().replace(/[^a-z]+/g,'-');
  const deptClass=d=>'tw-dept-'+String(d||'').toLowerCase().replace(/[^a-z]+/g,'-');
  function departmentBody(dept){
    const team=(users||[]).filter(u=>u&&u.role==='Employee'&&u.department===dept);
    return team.length?team.map((u,i)=>{
      const {live,rows}=snapshot(u.id),working=rows.find(r=>r.status==='Working');
      const liveLabel=live.status||'Available';
      return '<button type="button" class="tw-employee '+statusClass(liveLabel)+'" data-tw-emp="'+esc(u.id)+'"><span class="tw-index">'+esc(i+1)+'</span><span class="tw-summary"><b>'+esc(u.name)+'</b><span class="tw-current">'+esc(working?working.job.no+' · '+vehicle(working.job):'No active running JC')+'</span><small>Total '+rows.length+' JC</small></span><span class="tw-status '+statusClass(liveLabel)+'">● '+esc(liveLabel)+'</span></button>';
    }).join(''):'<p class="notice">No technicians in this department.</p>';
  }
  function workloadBody(emp){
    const {rows}=snapshot(emp);
    return '<div class="tw-workload-summary" data-summary="Present Jobs: '+rows.length+'"><span>Present Jobs</span><b>'+rows.length+'</b></div>'+(rows.length?rows.map((r,i)=>{
      const suggested=r.assignments.reduce((n,a)=>n+(Number(a.suggested)||0),0);
      const worked=r.assignments.reduce((n,a)=>n+(Number(totalForAssignment(a))||0),0);
      const remaining=Math.max(0,suggested-worked);
      return '<article class="tw-job '+statusClass(r.status)+'"><div class="tw-job-head"><h3>'+esc((i+1)+' · '+r.job.no)+'</h3><span class="tw-status '+statusClass(r.status)+'">● '+esc(r.status)+'</span></div><p class="tw-vehicle">'+esc(vehicle(r.job))+'</p><p class="tw-reg">Registration: <b>'+esc(r.job.reg||'—')+'</b></p><dl><div class="tw-metric tw-suggested"><dt>Suggested</dt><dd>'+esc(minutes(suggested))+'</dd></div><div class="tw-metric tw-worked"><dt>Worked</dt><dd>'+esc(minutes(worked))+'</dd></div><div class="tw-metric tw-remaining"><dt>Remaining</dt><dd>'+esc(minutes(remaining))+'</dd></div></dl></article>';
    }).join(''):'<p class="notice">No unfinished job cards assigned.</p>');
  }
  function stop(){if(timer!==null)clearInterval(timer);timer=null;}
  function watch(body,render){
    stop();
    let previous=body.innerHTML;
    timer=setInterval(()=>{
      if(!body.isConnected||!supervisor()){stop();return;}
      if(document.hidden)return;
      const next=render();
      if(next!==previous){body.innerHTML=next;previous=next;}
    },1000);
  }
  window.openTechnicianDepartment=function(dept){
    if(!supervisor()||!departments[dept])return;
    stop();
    showSupervisorModal(esc(departments[dept])+' Technicians','<div id="twDepartment" class="tw-department '+deptClass(dept)+'">'+departmentBody(dept)+'</div>');
    const body=document.getElementById('twDepartment');
    body.onclick=e=>{const row=e.target.closest('[data-tw-emp]');if(row&&body.contains(row))window.openTechnicianWorkload(row.dataset.twEmp);};
    watch(body,()=>departmentBody(dept));
  };
  window.openTechnicianWorkload=function(emp){
    const u=person(emp);
    if(!supervisor()||!u||u.role!=='Employee'||!departments[u.department])return;
    stop();
    showSupervisorModal(esc(u.name)+' · '+esc(departments[u.department]),'<div class="tw-workload-tools '+deptClass(u.department)+'"><button type="button" id="twBack" class="secondary tw-back">← Back</button></div><div id="twWorkload" class="'+deptClass(u.department)+'">'+workloadBody(emp)+'</div>');
    document.getElementById('modal').classList.add('tw-fullscreen');
    const back=document.getElementById('twBack');
    back.onclick=()=>window.openTechnicianDepartment(u.department);
    back.focus();
    watch(document.getElementById('twWorkload'),()=>workloadBody(emp));
  };
  const style=document.createElement('style');
  style.textContent='#modal.tw-fullscreen{padding:0!important}#modal.tw-fullscreen>.modal-box{box-sizing:border-box;width:100%!important;max-width:none!important;height:100%!important;max-height:100%!important;margin:0!important;border-radius:0!important;padding:20px!important;overflow:auto!important;background:#f7f9fc}.tw-department{--tw-accent:#4f7fb3;--tw-soft:#edf5ff;--tw-line:#bfd6ee}.tw-dept-denter{--tw-accent:#3f7fbe;--tw-soft:#edf5ff;--tw-line:#bdd7f0}.tw-dept-painter{--tw-accent:#c97832;--tw-soft:#fff4e9;--tw-line:#f0cfad}.tw-dept-mechanic{--tw-accent:#25877d;--tw-soft:#eaf8f5;--tw-line:#b8e0da}.tw-employee{position:relative;box-sizing:border-box;width:100%;margin:10px 0;padding:16px 16px 16px 14px;display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:12px;text-align:left;background:linear-gradient(145deg,#ffffff,#f4f7fb);color:#172033;border:1px solid #d9e3ee;border-left:4px solid var(--tw-accent,#4f7fb3);border-radius:16px;box-shadow:0 4px 12px rgba(23,48,77,.06);transition:transform .12s ease,box-shadow .12s ease}.tw-employee:active{transform:scale(.995)}.tw-index{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--tw-soft,#edf5ff);color:var(--tw-accent,#31577d);font-size:15px;font-weight:900}.tw-summary{display:grid;gap:6px;min-width:0;overflow-wrap:anywhere}.tw-summary b{font-size:24px;line-height:1.1;font-weight:900;letter-spacing:-.25px}.tw-current{font-size:15px;font-weight:700;color:#25364b}.tw-summary small{font-size:13px;font-weight:800;color:#68788b}.tw-status{display:inline-flex;align-items:center;justify-content:center;min-width:78px;padding:7px 10px;border-radius:999px;font-size:12px;font-weight:900;white-space:nowrap;background:#eef3f8;color:#516579;border:1px solid #d9e3ee}.tw-status-working{background:#eaf7ef!important;color:#187145!important;border-color:#bce1ca!important}.tw-status-paused{background:#fff4df!important;color:#9a5a00!important;border-color:#f1d397!important}.tw-status-available{background:#eaf3ff!important;color:#2d64a3!important;border-color:#bfd5ee!important}.tw-status-not-started{background:#f2f4f7!important;color:#5f6d7b!important;border-color:#d9dee5!important}.tw-status-syncing,.tw-status-unavailable{background:#f4f0ff!important;color:#6f55a3!important;border-color:#d8cbed!important}.tw-workload-tools{margin-bottom:12px}.tw-back{border-radius:12px!important;min-height:44px!important;padding:10px 16px!important}.tw-workload-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0 14px;padding:14px 16px;border:1px solid var(--tw-line,#d5e1ed);border-left:4px solid var(--tw-accent,#4f7fb3);border-radius:14px;background:var(--tw-soft,#edf5ff)}.tw-workload-summary span{font-size:14px;font-weight:800;color:#52657a}.tw-workload-summary b{font-size:24px;color:#172033}.tw-job{border:1px solid #d8e2ec;border-left:5px solid #b8c4cf;border-radius:16px;padding:16px;margin:14px 0;background:#fff;box-shadow:0 4px 14px rgba(23,48,77,.055);overflow-wrap:anywhere}.tw-job.tw-status-working{border-left-color:#42a46d!important}.tw-job.tw-status-paused{border-left-color:#e1a43a!important}.tw-job.tw-status-not-started{border-left-color:#97a4b1!important}.tw-job-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.tw-job h3{margin:0;font-size:21px;line-height:1.2}.tw-vehicle{margin:12px 0 6px!important;font-size:16px;font-weight:800;color:#25364b}.tw-reg{margin:6px 0 12px!important;color:#52657a}.tw-job dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0 0}.tw-metric{min-width:0;padding:11px 10px;border-radius:12px;border:1px solid #e0e7ef;background:#f7f9fc}.tw-suggested{background:#f2f6fb}.tw-worked{background:#eef8f2}.tw-remaining{background:#fff7e9}.tw-job dt{font-size:11px;font-weight:800;color:#6b7c8e}.tw-job dd{font-size:18px;font-weight:900;margin:5px 0 0;color:#172033}@media(max-width:480px){.tw-employee{grid-template-columns:34px minmax(0,1fr);padding:14px 12px}.tw-status{grid-column:2;justify-self:start}.tw-summary b{font-size:22px}.tw-job dl{gap:6px}.tw-metric{padding:9px 7px}.tw-job dd{font-size:16px}}';
  document.head.appendChild(style);
})();
