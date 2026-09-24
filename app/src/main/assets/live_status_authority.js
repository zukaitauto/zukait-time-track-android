(function(){'use strict';
  const ACTIVE=new Set(['Working','Overtime','ID001']);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function live(){
    const x=window.zukaitServerLive;
    if(!x||!x.fresh||!Array.isArray(x.rows)||!x.fetchedAt)return null;
    if(!navigator.onLine||Date.now()-Number(x.fetchedAt)>7000)return null;
    return x;
  }
  function rows(){return live()?.rows||null}
  function statusObject(r){
    const paused=r.status==='Paused';
    const hasSession=!!r.session_id;
    return {
      emp:r.employee_id,
      status:r.status,
      job:r.job_no||null,
      session:hasSession?{
        id:r.session_id,emp:r.employee_id,job:r.job_no,
        assignmentId:r.assignment_id||null,start:Number(r.session_start||0),
        end:paused?Date.now():null,paused,overtime:!!r.overtime
      }:null,
      assignment:r.assignment_id?{
        id:r.assignment_id,emp:r.employee_id,job:r.job_no,
        suggested:Number(r.suggested_minutes||0),completed:false,cancelled:false
      }:null,
      server:true
    };
  }
  function activeWorkerRow(r){
    return {
      u:{id:r.employee_id,name:r.employee_name,role:'Employee',department:r.department||''},
      s:{id:r.session_id,emp:r.employee_id,job:r.job_no,assignmentId:r.assignment_id,start:Number(r.session_start||0),end:null,paused:false,overtime:!!r.overtime},
      a:r.assignment_id?{id:r.assignment_id,emp:r.employee_id,job:r.job_no,suggested:Number(r.suggested_minutes||0),completed:false,cancelled:false}:null,
      j:{no:r.job_no,vehicle:r.vehicle||'',reg:r.registration||''},
      server:true
    };
  }

  const oldCurrentStaffStatus=window.currentStaffStatus;
  const oldCurrentStaffStatuses=window.currentStaffStatuses;
  const oldCurrentActiveWorkers=window.currentActiveWorkers;
  const oldV79Rows=window.v79CurrentWorkerRows;
  const oldUniqueRows=window.v756UniqueActiveWorkerRows;
  const oldTechState=window.v84TechState;
  const oldOpenActive=window.openActiveWorkers;
  const oldControl=window.v65OpenControl;

  window.currentStaffStatus=function(emp){
    const rr=rows();
    if(rr){
      const r=rr.find(x=>String(x.employee_id)===String(emp));
      return r?statusObject(r):{emp,status:'Available',session:null,assignment:null,job:null,server:true};
    }
    return typeof oldCurrentStaffStatus==='function'?oldCurrentStaffStatus.apply(this,arguments):null;
  };
  window.currentStaffStatuses=function(){
    const rr=rows();
    if(rr)return rr.map(statusObject);
    return typeof oldCurrentStaffStatuses==='function'?oldCurrentStaffStatuses.apply(this,arguments):[];
  };
  function serverActiveRows(){
    const rr=rows();
    return rr?rr.filter(r=>ACTIVE.has(r.status)).map(activeWorkerRow):null;
  }
  window.currentActiveWorkers=function(){
    const rr=serverActiveRows();
    if(rr)return rr;
    return typeof oldCurrentActiveWorkers==='function'?oldCurrentActiveWorkers.apply(this,arguments):[];
  };
  window.v79CurrentWorkerRows=function(){
    const rr=serverActiveRows();
    if(rr)return rr;
    return typeof oldV79Rows==='function'?oldV79Rows.apply(this,arguments):[];
  };
  window.v756UniqueActiveWorkerRows=function(){
    const rr=serverActiveRows();
    if(rr)return rr;
    return typeof oldUniqueRows==='function'?oldUniqueRows.apply(this,arguments):[];
  };
  window.v84TechState=function(u){
    const rr=rows();
    if(rr){
      const r=rr.find(x=>String(x.employee_id)===String(u?.id));
      if(r){const x=statusObject(r);return{session:x.session,status:x.status}}
    }
    return typeof oldTechState==='function'?oldTechState.apply(this,arguments):{session:null,status:'Available'};
  };

  function minutes(v){
    const n=Math.max(0,Number(v||0));
    try{return typeof fmt==='function'?fmt(n):Math.round(n)+'m'}catch(_){return Math.round(n)+'m'}
  }
  function workerTable(list,title){
    const body=list.length?'<div class="manager-scroll"><table><tr><th>Employee</th><th>Department</th><th>Status</th><th>Job Card</th><th>Vehicle</th><th>Reg.</th><th>Allocated</th></tr>'+
      list.map(r=>'<tr><td><b>'+esc(r.employee_name||r.employee_id)+'</b></td><td>'+esc(r.department||'')+'</td><td><span class="pill">'+esc(r.status)+'</span></td><td>'+esc(r.job_no||'—')+'</td><td>'+esc(r.vehicle||'—')+'</td><td>'+esc(r.registration||'—')+'</td><td>'+minutes(r.suggested_minutes)+'</td></tr>').join('')+
      '</table></div>':'<div class="notice">No matching workers right now.</div>';
    const html='<div class="section-title"><h2>'+esc(title)+'</h2><span class="pill">SERVER LIVE</span></div>'+body;
    if(window.me?.role==='Supervisor'&&typeof window.showSupervisorModal==='function')return window.showSupervisorModal(title,body);
    if(typeof window.openModal==='function')return window.openModal(html);
  }

  window.openActiveWorkers=function(){
    const rr=rows();
    if(rr)return workerTable(rr.filter(r=>ACTIVE.has(r.status)),'Active Workers — Server Live');
    return typeof oldOpenActive==='function'?oldOpenActive.apply(this,arguments):undefined;
  };
  window.v65OpenControl=function(type){
    const rr=rows();
    if(rr&&type==='working')return workerTable(rr.filter(r=>r.status==='Working'||r.status==='Overtime'),'Working Now — Server Live');
    return typeof oldControl==='function'?oldControl.apply(this,arguments):undefined;
  };

  function setCount(root,label,value){
    if(!root)return;
    const target=label.toLowerCase();
    [...root.querySelectorAll('button,.glance-box,.notice,.v67-control,.v143-resource,.v143-top')].forEach(el=>{
      if(!(el.textContent||'').toLowerCase().includes(target))return;
      const n=el.querySelector('.stat')||el.querySelector('strong');
      if(n)n.textContent=String(value);
    });
  }
  function applyDepartmentCounts(root,rr){
    if(!root)return;
    const map=[['Denter','denting'],['Painter','painting'],['Mechanic','mechanical']];
    [...root.querySelectorAll('.v84-dept,.v143-tech button')].forEach(el=>{
      const tx=(el.textContent||'').toLowerCase();
      const pair=map.find(x=>tx.includes(x[1]));
      if(!pair)return;
      const team=rr.filter(r=>r.department===pair[0]);
      const working=team.filter(r=>r.status==='Working'||r.status==='Overtime').length;
      const strong=el.querySelector('strong');
      if(strong)strong.innerHTML=working+' <em>/ '+team.length+'</em>';
    });
  }
  function apply(){
    const x=live();if(!x||!window.me)return;
    const rr=x.rows;
    const active=rr.filter(r=>ACTIVE.has(r.status)).length;
    const working=rr.filter(r=>r.status==='Working'||r.status==='Overtime').length;
    const waiting=rr.filter(r=>r.status==='ID001').length;
    const paused=rr.filter(r=>r.status==='Paused').length;
    const available=rr.filter(r=>r.status==='Available').length;
    const overtime=rr.filter(r=>r.status==='Overtime').length;

    if(me.role==='Supervisor'){
      const root=document.getElementById('supervisorView');
      setCount(root,'Active Workers',active);
      setCount(root,'Paused Jobs',paused);
      setCount(root,'Available Workers',available);
      setCount(root,'Overtime Now',overtime);
      applyDepartmentCounts(root,rr);
      root?.querySelectorAll('.v143-live,.v92-live-dot').forEach(b=>b.textContent='● SERVER LIVE');
    }
    if(me.role==='Manager'){
      const root=document.getElementById('managerView');
      setCount(root,'Working Now',working);
      setCount(root,'Waiting / ID001',waiting);
      setCount(root,'Work Paused',paused);
      setCount(root,'Free Tech',available+waiting);
      setCount(root,'Active Workers',active);
    }
  }

  window.addEventListener('zukait-live-status',apply);
  window.addEventListener('focus',apply);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)apply()});
  setInterval(apply,1000);
  setTimeout(apply,0);
  window.zukaitLiveStatusAuthority={apply,rows:()=>rows(),fresh:()=>!!live()};
})();