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
  function departmentBody(dept){
    const team=(users||[]).filter(u=>u&&u.role==='Employee'&&u.department===dept);
    return team.length?team.map((u,i)=>{
      const {live,rows}=snapshot(u.id),working=rows.find(r=>r.status==='Working');
      return '<button type="button" class="tw-employee" data-tw-emp="'+esc(u.id)+'"><span class="tw-summary"><b>'+esc((i+1)+'. '+u.name)+'</b><span>'+esc(working?working.job.no+' · '+vehicle(working.job):'No current working JC')+'</span><small>Total '+rows.length+' JC</small></span><span class="tw-status">● '+esc(live.status)+'</span></button>';
    }).join(''):'<p class="notice">No technicians in this department.</p>';
  }
  function workloadBody(emp){
    const {rows}=snapshot(emp);
    return '<p class="tw-count">Present Jobs: '+rows.length+'</p>'+(rows.length?rows.map((r,i)=>{
      const suggested=r.assignments.reduce((n,a)=>n+(Number(a.suggested)||0),0);
      const worked=r.assignments.reduce((n,a)=>n+(Number(totalForAssignment(a))||0),0);
      return '<article class="tw-job"><h3>'+esc((i+1)+' · '+r.job.no)+'</h3><p>'+esc(vehicle(r.job))+'</p><p>Registration: <b>'+esc(r.job.reg||'—')+'</b></p><span class="tw-status">'+esc(r.status)+'</span><dl><div><dt>Suggested</dt><dd>'+esc(minutes(suggested))+'</dd></div><div><dt>Worked</dt><dd>'+esc(minutes(worked))+'</dd></div><div><dt>Remaining</dt><dd>'+esc(minutes(suggested-worked))+'</dd></div></dl></article>';
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
    showSupervisorModal(esc(departments[dept])+' Technicians','<div id="twDepartment">'+departmentBody(dept)+'</div>');
    const body=document.getElementById('twDepartment');
    body.onclick=e=>{const row=e.target.closest('[data-tw-emp]');if(row&&body.contains(row))window.openTechnicianWorkload(row.dataset.twEmp);};
    watch(body,()=>departmentBody(dept));
  };
  window.openTechnicianWorkload=function(emp){
    const u=person(emp);
    if(!supervisor()||!u||u.role!=='Employee'||!departments[u.department])return;
    stop();
    showSupervisorModal(esc(u.name)+' · '+esc(departments[u.department]),'<button type="button" id="twBack" class="secondary">← Back</button><div id="twWorkload">'+workloadBody(emp)+'</div>');
    document.getElementById('modal').classList.add('tw-fullscreen');
    const back=document.getElementById('twBack');
    back.onclick=()=>window.openTechnicianDepartment(u.department);
    back.focus();
    watch(document.getElementById('twWorkload'),()=>workloadBody(emp));
  };
  const style=document.createElement('style');
  style.textContent='#modal.tw-fullscreen{padding:0!important}#modal.tw-fullscreen>.modal-box{box-sizing:border-box;width:100%!important;max-width:none!important;height:100%!important;max-height:100%!important;margin:0!important;border-radius:0!important;padding:20px!important;overflow:auto!important}.tw-employee{box-sizing:border-box;width:100%;margin:6px 0;padding:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;background:#f5f8fc;color:#172033;border:1px solid #d5e1ed;border-radius:12px}.tw-summary{display:grid;gap:7px;min-width:0;overflow-wrap:anywhere}.tw-summary b{font-size:22px;font-weight:800}.tw-summary>span{font-size:15px}.tw-summary small{font-size:12px;color:#52657a}.tw-status{font-size:12px;font-weight:700;white-space:nowrap;color:#234a73}.tw-job{border:1px solid #d5e1ed;border-radius:12px;padding:16px;margin:12px 0;overflow-wrap:anywhere}.tw-job h3{margin:0;font-size:20px}.tw-job p{margin:8px 0}.tw-job dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.tw-job dt{font-size:12px;color:#52657a}.tw-job dd{font-size:18px;font-weight:bold;margin:6px 0}.tw-count{font-weight:bold}';
  document.head.appendChild(style);
})();
