(function(){
  const HOLD='ID001';
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeStatus=a=>{
    try{return String(empStatus(a)||'Not Started')}catch(_){return 'Not Started'}
  };
  const actual=a=>{
    try{return Math.max(0,Number(totalForAssignment(a)||0))}catch(_){return 0}
  };
  const currentFor=emp=>{
    const active=(state.sessions||[]).find(s=>s.emp===emp&&!s.end);
    if(active){
      return (state.assign||[]).find(a=>a.id===active.assignmentId)||
        (state.assign||[]).filter(a=>a.emp===emp&&a.job===active.job&&!a.cancelled&&!a.completed)
          .sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0))[0]||null;
    }
    return (state.assign||[]).filter(a=>a.emp===emp&&!a.cancelled&&!a.completed)
      .sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0))[0]||null;
  };

  const css=document.createElement('style');
  css.id='v43ProfessionalCss';
  css.textContent=`
    :root{
      --zt-navy:#0f1b2b;--zt-navy2:#16263d;--zt-gold:#d5a62e;--zt-bg:#f4f6f9;
      --zt-green:#15803d;--zt-amber:#b7791f;--zt-red:#b42318;--zt-blue:#2563eb;
      --zt-purple:#7c3aed;--zt-slate:#475569;--zt-border:#dfe5ec;
    }
    *{box-sizing:border-box}
    body{background:var(--zt-bg);font-family:Arial,Helvetica,sans-serif}
    header{position:sticky;top:0;z-index:120;background:var(--zt-navy)!important;border-bottom:3px solid var(--zt-gold)!important}
    main{max-width:1440px}
    .card{border:1px solid var(--zt-border);box-shadow:0 3px 12px rgba(15,27,43,.06)}
    button{min-height:42px;border-radius:10px;font-weight:800;touch-action:manipulation}
    input,select,textarea{min-height:42px;background:#fff}
    input:focus,select:focus,textarea:focus{outline:2px solid #d5a62e55;border-color:var(--zt-gold)}
    #cloudStatus{font-weight:900!important;letter-spacing:.01em}
    .v42-focus{border:1px solid #dfc778!important;border-top:5px solid var(--zt-gold)!important;border-radius:16px!important}
    .v42-focus-jc{letter-spacing:.01em}
    .v42-time{background:#fff!important;border-color:#e4e8ee!important}
    .v42-time:nth-child(1){border-top:3px solid var(--zt-blue)!important}
    .v42-time:nth-child(2){border-top:3px solid var(--zt-green)!important}
    .v42-time:nth-child(3){border-top:3px solid var(--zt-amber)!important}
    .v42-time:nth-child(4){border-top:3px solid var(--zt-red)!important}
    .v42-actions button{border-radius:12px!important}
    .v43-live-board{border:0!important;background:linear-gradient(135deg,var(--zt-navy),var(--zt-navy2));color:#fff;border-radius:18px!important;box-shadow:0 10px 30px rgba(15,27,43,.16)!important}
    .v43-live-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .v43-live-head h2{margin:0;font-size:22px}
    .v43-live-head .v43-clock{margin-left:auto;font-weight:800;opacity:.8}
    .v43-kpis{display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:10px;margin-top:14px}
    .v43-kpi{border:1px solid #ffffff22;background:#ffffff10;border-radius:14px;padding:12px;cursor:pointer}
    .v43-kpi span{display:block;font-size:11px;font-weight:900;text-transform:uppercase;opacity:.82}
    .v43-kpi strong{display:block;font-size:28px;margin-top:5px}
    .v43-kpi.work strong{color:#7ee2a8}.v43-kpi.pause strong{color:#ffd772}.v43-kpi.new strong{color:#d7e0ea}
    .v43-kpi.over strong{color:#ff9b92}.v43-kpi.repeat strong{color:#c9a9ff}.v43-kpi.done strong{color:#74d9d2}
    .v43-live-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    .v43-live-actions button{background:#fff;color:var(--zt-navy);border:1px solid #ffffff44}
    .v43-team-card{border-radius:16px!important}
    .v43-team-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
    .v43-team-toolbar h3{margin:0 auto 0 0}
    .v43-team-search{min-width:260px;max-width:420px;flex:1}
    .v43-team-wrap{overflow:auto;max-height:52vh}
    .v43-team-table{min-width:980px}
    .v43-team-table thead th{position:sticky;top:0;background:#f8fafc;z-index:2}
    .v43-team-table tr.v43-working td:first-child{border-left:4px solid var(--zt-green)}
    .v43-team-table tr.v43-paused td:first-child{border-left:4px solid var(--zt-amber)}
    .v43-team-table tr.v43-over td:first-child{border-left:4px solid var(--zt-red)}
    .v43-team-table tr.v43-repeat td:first-child{border-left:4px solid var(--zt-purple)}
    .v43-team-table tr.v43-ready td:first-child{border-left:4px solid #cbd5e1}
    .v43-badge{display:inline-block;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:900}
    .v43-badge.working{background:#dcfce7;color:#166534}.v43-badge.paused{background:#fef3c7;color:#92400e}
    .v43-badge.new{background:#e2e8f0;color:#334155}.v43-badge.over{background:#fee2e2;color:#991b1b}
    .v43-badge.repeat{background:#ede9fe;color:#5b21b6}.v43-badge.ready{background:#f1f5f9;color:#64748b}
    .v43-small{font-size:11px;color:#64748b}
    .v43-report-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .v43-report-strip button{min-height:62px;background:#fff;color:var(--zt-navy);border:1px solid var(--zt-border);box-shadow:0 2px 8px rgba(15,27,43,.05)}
    #login{max-width:520px;margin:5vh auto!important;padding:24px!important;border-radius:18px!important}
    #login input{width:100%;margin-top:5px}
    #login .big-action{width:100%;min-height:56px}
    .v42-login-logo{width:min(250px,72vw)!important;margin-bottom:8px!important}

    @media(max-width:900px){
      main{padding:10px!important}
      header{position:sticky}
      #app>.row{position:sticky;top:60px;z-index:90;background:#f4f6f9;padding:8px 0;border-bottom:1px solid #e5e7eb}
      #app>.row button{font-size:12px;padding:8px 9px;min-height:38px}
      .v42-focus{padding:14px!important;margin-top:8px!important}
      .v42-focus-head{align-items:flex-start!important}
      .v42-focus-jc{font-size:28px!important}
      .v42-times{grid-template-columns:repeat(2,1fr)!important}
      .v42-time{min-height:74px;display:flex;flex-direction:column;justify-content:center}
      .v42-actions{position:sticky;bottom:8px;z-index:80;background:#fff;padding:8px;border-radius:14px;box-shadow:0 8px 24px rgba(15,27,43,.18);border:1px solid #e5e7eb}
      .v42-actions button{min-height:54px!important;font-size:16px!important}
      #employeeView table{font-size:12px}
      #employeeView details{border-radius:12px}
      .v43-live-board,.v43-team-card{display:none!important}
    }
    @media(min-width:901px){
      #app>.row{position:sticky;top:67px;z-index:95;background:#f4f6f9;padding:8px 0}
      #supervisorView>.v42-supervisor-priority{display:none}
      .v43-live-board{margin-top:8px}
      #managerView .v34-grid{margin-top:10px}
    }
    @media(max-width:620px){
      .v42-brand-title small{display:none!important}
      .v42-brand img{width:36px!important;height:36px!important}
      #cloudStatus{font-size:10px!important}
      .employee-month-grid{grid-template-columns:repeat(2,1fr)!important}
      .report-tabs{grid-template-columns:1fr 1fr!important}
      table{font-size:12px}
    }
  `;
  css.textContent += `
    #cloudStatus{
      font-size:11px!important;
      font-weight:900!important;
      padding:4px 8px!important;
      border-radius:999px!important;
      margin-right:8px!important;
    }
    #net{display:none!important}
    #app>.row{position:sticky;top:67px}
    #welcome.v44-user-button{
      cursor:pointer;
      width:auto!important;
      margin:0 auto 0 0!important;
      padding:8px 11px;
      border-radius:10px;
      background:#fff;
      border:1px solid #dfe5ec;
      box-shadow:0 1px 4px rgba(15,27,43,.05);
      font-size:15px!important;
      font-weight:900;
      color:#0f1b2b;
      user-select:none;
    }
    #welcome.v44-user-button:hover{background:#f8fafc}
    .v44-account-menu{
      display:none;
      position:absolute;
      top:52px;
      left:0;
      z-index:300;
      width:230px;
      background:#fff;
      border:1px solid #dfe5ec;
      border-radius:14px;
      box-shadow:0 12px 34px rgba(15,27,43,.18);
      padding:8px;
    }
    .v44-account-menu.open{display:block}
    .v44-account-head{padding:10px 10px 9px;border-bottom:1px solid #eef2f6;margin-bottom:5px}
    .v44-account-head b{display:block;color:#0f1b2b}
    .v44-account-head span{font-size:11px;color:#64748b}
    .v44-account-menu button{
      width:100%;
      display:block;
      text-align:left;
      background:#fff!important;
      color:#0f1b2b!important;
      border:0!important;
      min-height:42px;
      margin:2px 0!important;
      padding:9px 10px!important;
    }
    .v44-account-menu button:hover{background:#f1f5f9!important}
    .v44-account-menu .v44-logout{color:#b42318!important}
    @media(max-width:900px){
      #app>.row{top:60px!important;padding:6px 0!important}
      #welcome.v44-user-button{font-size:14px!important;padding:7px 9px}
      .v44-account-menu{top:46px}
    }
  `;
  document.head.appendChild(css);

  function stats(){
    const rows=(state.assign||[]).filter(a=>!a.cancelled&&!a.completed);
    const working=rows.filter(a=>safeStatus(a)==='Started').length;
    const paused=rows.filter(a=>a.job!==HOLD&&safeStatus(a)==='Paused').length;
    const notStarted=rows.filter(a=>safeStatus(a)==='New').length;
    const over=rows.filter(a=>a.job!==HOLD&&actual(a)>(+a.suggested||0)).length;
    const repeat=rows.filter(a=>a.rework).length;
    const finished=[...new Set((state.assign||[]).filter(a=>a.job!==HOLD&&!a.cancelled&&a.completed).map(a=>a.job))]
      .filter(no=>{
        const rr=(state.assign||[]).filter(a=>a.job===no&&!a.cancelled);
        return rr.length&&rr.every(a=>a.completed);
      }).length;
    return {working,paused,notStarted,over,repeat,finished};
  }

  function liveBoardHTML(role){
    const s=stats();
    return '<div class="card v43-live-board">'+
      '<div class="v43-live-head"><h2>Live Workshop Control Center</h2><span class="pill">AUTO SYNC</span><span class="v43-clock" id="v43Clock"></span></div>'+
      '<div class="v43-kpis">'+
      '<div class="v43-kpi work" onclick="v43OpenStatus(\'working\')"><span>Working Now</span><strong>'+s.working+'</strong></div>'+
      '<div class="v43-kpi pause" onclick="v43OpenStatus(\'paused\')"><span>Paused</span><strong>'+s.paused+'</strong></div>'+
      '<div class="v43-kpi new" onclick="v43OpenStatus(\'new\')"><span>Not Started</span><strong>'+s.notStarted+'</strong></div>'+
      '<div class="v43-kpi over" onclick="v43OpenStatus(\'over\')"><span>Over Suggested</span><strong>'+s.over+'</strong></div>'+
      '<div class="v43-kpi repeat" onclick="v43OpenStatus(\'repeat\')"><span>Repeat Work</span><strong>'+s.repeat+'</strong></div>'+
      '<div class="v43-kpi done" onclick="openSupervisorFinishedWindow()"><span>Finished</span><strong>'+s.finished+'</strong></div>'+
      '</div>'+
      '<div class="v43-live-actions">'+
        '<button onclick="openSupervisorAssignedWindow()">📋 Open Assignments</button>'+
        '<button onclick="openAdditionalTimeWindow()">⏱ Additional Time</button>'+
        (role==='Manager'?'<button onclick="openManagerReports()">📊 Reports</button><button onclick="openJobCardManager(\'all\')">🚗 Job Card Manager</button>':'')+
        '<button onclick="v42SyncNow()">↻ Sync Now</button>'+
      '</div></div>';
  }

  function rowClass(a){
    if(!a)return 'v43-ready';
    if(a.rework)return 'v43-repeat';
    const st=safeStatus(a);
    if(st==='Paused')return 'v43-paused';
    if(actual(a)>(+a.suggested||0)&&a.job!==HOLD)return 'v43-over';
    if(st==='Started')return 'v43-working';
    return 'v43-ready';
  }
  function badge(a){
    if(!a)return '<span class="v43-badge ready">AVAILABLE</span>';
    if(a.rework)return '<span class="v43-badge repeat">REPEAT</span>';
    const st=safeStatus(a);
    if(actual(a)>(+a.suggested||0)&&a.job!==HOLD)return '<span class="v43-badge over">OVER</span>';
    if(st==='Started')return '<span class="v43-badge working">WORKING</span>';
    if(st==='Paused')return '<span class="v43-badge paused">PAUSED</span>';
    return '<span class="v43-badge new">NOT STARTED</span>';
  }

  function teamTableHTML(){
    const people=(users||[]).filter(u=>u.role==='Employee');
    return '<div class="card v43-team-card"><div class="v43-team-toolbar"><h3>Technician Status Board</h3>'+
      '<input id="v43TeamSearch" class="v43-team-search" placeholder="Search employee / department / JC / vehicle" oninput="v43FilterTeam()">'+
      '<button class="secondary" onclick="v43FilterTeam(\'Denter\')">Denter</button>'+
      '<button class="secondary" onclick="v43FilterTeam(\'Painter\')">Painter</button>'+
      '<button class="secondary" onclick="v43FilterTeam(\'Mechanic\')">Mechanic</button>'+
      '<button class="secondary" onclick="v43FilterTeam(\'\')">All</button></div>'+
      '<div class="v43-team-wrap"><table class="v43-team-table"><thead><tr><th>Employee</th><th>Department</th><th>Current JC</th><th>Vehicle / Reg</th><th>Status</th><th>Suggested</th><th>Actual</th><th>Remaining / Exceeded</th></tr></thead><tbody>'+
      people.map(u=>{
        const a=currentFor(u.id),j=a?job(a.job):null,ac=a?actual(a):0,sg=a?(+a.suggested||0):0,rem=Math.max(0,sg-ac),over=Math.max(0,ac-sg);
        const search=[u.name,u.id,u.department,a?.job||'',j?.vehicle||'',j?.reg||'',safeStatus(a)].join(' ').toLowerCase();
        return '<tr class="v43-team-row '+rowClass(a)+'" data-search="'+esc(search)+'" data-dept="'+esc(u.department)+'">'+
          '<td><b>'+esc(u.name)+'</b><div class="v43-small">'+esc(u.id)+'</div></td>'+
          '<td>'+esc(u.department)+'</td>'+
          '<td>'+(a?'<button class="blue" style="min-height:34px" onclick="openSupervisorJob(\''+esc(a.job)+'\')">'+esc(a.job)+'</button>':'—')+'</td>'+
          '<td>'+(a?esc((j?.vehicle||'')+(j?.reg?' / '+j.reg:'')):'—')+'</td>'+
          '<td>'+badge(a)+'</td>'+
          '<td>'+(a?fmt(sg):'—')+'</td>'+
          '<td>'+(a?fmt(ac):'—')+'</td>'+
          '<td>'+(a?(over>0?'<span class="over-alert">+'+fmt(over)+'</span>':'<span class="remaining">'+fmt(rem)+'</span>'):'—')+'</td>'+
        '</tr>';
      }).join('')+'</tbody></table></div></div>';
  }

  window.v43FilterTeam=function(dept){
    const q=(dept!==undefined?String(dept):(document.getElementById('v43TeamSearch')?.value||'')).trim().toLowerCase();
    const input=document.getElementById('v43TeamSearch');
    if(dept!==undefined&&input)input.value=dept||'';
    document.querySelectorAll('.v43-team-row').forEach(r=>{
      r.style.display=!q||String(r.dataset.search||'').includes(q)?'':'none';
    });
  };

  window.v43OpenStatus=function(type){
    if(typeof window.v42SupervisorList==='function')return window.v42SupervisorList(type);
  };

  function reportStrip(){
    return '<div class="card"><div class="section-title"><h3>Quick Reports</h3><span class="pill">Manager</span></div>'+
      '<div class="v43-report-strip">'+
      '<button onclick="openManagerReports();setTimeout(()=>showReportTab(\'production\'),50)">📋 Production</button>'+
      '<button onclick="openManagerReports();setTimeout(()=>showReportTab(\'job\'),50)">🚗 Job Card</button>'+
      '<button onclick="openManagerReports();setTimeout(()=>showReportTab(\'employee\'),50)">👤 Employee</button>'+
      '<button onclick="openManagerReports();setTimeout(()=>showReportTab(\'monthly\'),50)">📅 Monthly Production</button>'+
      '</div></div>';
  }

  function injectDesktop(role){
    if(innerWidth<901)return;
    const root=document.getElementById(role==='Manager'?'managerView':'supervisorView');
    if(!root||root.classList.contains('hidden'))return;
    root.querySelectorAll('.v43-live-board,.v43-team-card,.v43-report-card').forEach(x=>x.remove());
    root.insertAdjacentHTML('afterbegin',teamTableHTML());
    root.insertAdjacentHTML('afterbegin',liveBoardHTML(role));
    if(role==='Manager'){
      const box=document.createElement('div');box.className='v43-report-card';box.innerHTML=reportStrip();
      const live=root.querySelector('.v43-live-board');
      if(live)live.insertAdjacentElement('afterend',box);
    }
    updateClock();
  }

  const baseSup=window.renderSupervisor;
  if(typeof baseSup==='function'){
    window.renderSupervisor=function(){
      baseSup();
      if(me?.role==='Supervisor')injectDesktop('Supervisor');
    };
  }
  const baseMgr=window.renderManager;
  if(typeof baseMgr==='function'){
    window.renderManager=function(){
      baseMgr();
      if(me?.role==='Manager')injectDesktop('Manager');
    };
  }

  function updateClock(){
    const el=document.getElementById('v43Clock');
    if(el)el.textContent=new Date().toLocaleString();
  }
  setInterval(updateClock,1000);

  function polishEmployee(){
    if(!me||me.role!=='Employee')return;
    const root=document.getElementById('employeeView');
    if(!root)return;
    const focus=root.querySelector('.v42-focus');
    if(focus&&!focus.dataset.v43){
      focus.dataset.v43='1';
      const note=focus.querySelector('.v42-sync-note');
      if(note)note.textContent='Login stays active until you press Logout. Closing or locking the phone does not stop work time.';
    }
    [...root.querySelectorAll('details')].forEach((d,i)=>{
      if(!d.dataset.v43){
        d.dataset.v43='1';
        if(i>0)d.open=false;
      }
    });
  }

  const obs=new MutationObserver(()=>{
    polishEmployee();
  });
  obs.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});

  window.addEventListener('resize',()=>{
    if(me?.role==='Supervisor')injectDesktop('Supervisor');
    if(me?.role==='Manager')injectDesktop('Manager');
  });

  setTimeout(()=>{
    polishEmployee();
    if(me?.role==='Supervisor')injectDesktop('Supervisor');
    if(me?.role==='Manager')injectDesktop('Manager');
  },150);

  function buildAccountMenu(){
    const app=document.getElementById('app');
    if(!app||app.classList.contains('hidden')||!me)return;
    const row=app.querySelector(':scope > .row');
    const welcome=document.getElementById('welcome');
    if(!row||!welcome)return;

    [...row.querySelectorAll('button')].forEach(b=>{
      if(['changePasswordBtn','v42SyncBtn'].includes(b.id) ||
         (b.textContent||'').toLowerCase().includes('logout')){
        b.style.display='none';
      }
    });

    welcome.classList.add('v44-user-button');
    welcome.textContent=(me.name||me.id)+' ▾';
    welcome.title='Account menu';
    welcome.onclick=(ev)=>{
      ev.stopPropagation();
      const menu=document.getElementById('v44AccountMenu');
      if(menu)menu.classList.toggle('open');
    };

    let menu=document.getElementById('v44AccountMenu');
    if(!menu){
      menu=document.createElement('div');
      menu.id='v44AccountMenu';
      menu.className='v44-account-menu';
      row.appendChild(menu);
    }
    if(menu.dataset.userId!==String(me.id||'')){
      menu.dataset.userId=String(me.id||'');
      menu.innerHTML=
        '<div class="v44-account-head"><b>'+esc(me.name||me.id)+'</b><span>'+esc(me.role||'')+'</span></div>'+
        '<button onclick="window.changeOwnPassword();document.getElementById(\'v44AccountMenu\')?.classList.remove(\'open\')">🔐 Change Password</button>'+
        '<button onclick="window.v42SyncNow();document.getElementById(\'v44AccountMenu\')?.classList.remove(\'open\')">↻ Sync Now</button>'+
        '<button class="v44-logout" onclick="window.logout()">↪ Logout</button>';
    }
  }

  document.addEventListener('click',e=>{
    const menu=document.getElementById('v44AccountMenu');
    const welcome=document.getElementById('welcome');
    if(menu&&welcome&&!menu.contains(e.target)&&e.target!==welcome)menu.classList.remove('open');
  });

  const v44Obs=new MutationObserver(()=>buildAccountMenu());
  v44Obs.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  setTimeout(buildAccountMenu,100);
})();