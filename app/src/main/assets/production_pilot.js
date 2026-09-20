(function(){
  const HOLD='ID001';

  const css=document.createElement('style');
  css.textContent=`
    :root{--zt-navy:#101b2a;--zt-gold:#d9a72e;--zt-bg:#f5f7fa}
    body{background:var(--zt-bg)}
    header{background:#101b2a;color:#fff;padding:12px 16px;border-bottom:3px solid #d9a72e}
    .v42-brand{display:flex;align-items:center;gap:10px}
    .v42-brand img{width:42px;height:42px;object-fit:contain;background:#fff;border-radius:10px;padding:2px}
    .v42-brand-title{font-weight:900;line-height:1.05}
    .v42-brand-title small{display:block;font-size:11px;font-weight:600;opacity:.8;margin-top:3px}
    .v42-focus{border:2px solid #d9a72e;box-shadow:0 10px 28px rgba(16,27,42,.10);overflow:hidden}
    .v42-focus-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}
    .v42-focus-jc{font-size:30px;font-weight:1000;color:#101b2a}
    .v42-focus-vehicle{font-size:17px;font-weight:800;margin:4px 0 14px}
    .v42-times{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}
    .v42-time{border-radius:12px;padding:11px 8px;text-align:center;background:#f8fafc;border:1px solid #e5e7eb}
    .v42-time b{display:block;font-size:18px;margin-top:4px}
    .v42-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
    .v42-actions button{min-height:54px;font-size:17px;font-weight:900}
    .v42-actions .v42-wide{grid-column:1/-1}
    .v42-priority{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    .v42-priority button{min-height:92px;border:0;border-radius:14px;padding:12px;color:#fff;text-align:left;font-weight:900}
    .v42-priority button strong{display:block;font-size:26px;margin-top:7px}
    .v42-working{background:#15803d}.v42-paused{background:#ca8a04}.v42-new{background:#475569}
    .v42-over{background:#b91c1c}.v42-finished{background:#0f766e}.v42-repeat{background:#7c3aed}
    .v42-manager-tools{border:2px solid #d9a72e}
    .v42-sync-note{font-size:12px;color:#64748b;margin-top:6px}
    .v42-login-logo{display:block;width:min(310px,78vw);height:auto;margin:4px auto 18px}
    #resetDataBtn,.v42-hide-reset{display:none!important}
    @media(max-width:700px){
      main{padding:10px}
      .card{padding:13px}
      .v42-times{grid-template-columns:repeat(2,1fr)}
      .v42-priority{grid-template-columns:repeat(2,1fr)}
      .v42-focus-jc{font-size:26px}
      .v42-actions{grid-template-columns:1fr}
      .v42-actions .v42-wide{grid-column:auto}
      #app>.row{gap:7px;align-items:center}
      #app>.row h2{width:100%;font-size:19px;margin-bottom:2px}
    }
  `;
  document.head.appendChild(css);

  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function clone(x){return JSON.parse(JSON.stringify(x))}
  function nativeNotify(title,message){
    try{
      if(window.AndroidBridge&&typeof window.AndroidBridge.notify==='function'){
        window.AndroidBridge.notify(String(title||'Zukait Time Track'),String(message||''));
      }
    }catch(e){console.warn('Android notification unavailable',e)}
  }
  function findAssignmentForSession(s){
    if(!s)return null;
    return (state.assign||[]).find(a=>a.id===s.assignmentId)||
      (state.assign||[]).filter(a=>a.emp===s.emp&&a.job===s.job&&!a.cancelled).sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0))[0]||null;
  }
  function actualFor(a){
    if(!a)return 0;
    if(typeof window.totalForAssignment==='function')return Math.max(0,window.totalForAssignment(a)||0);
    return typeof total==='function'?Math.max(0,total(a.job,a.emp)||0):0;
  }
  function openFor(emp){
    return (state.assign||[]).filter(a=>a.emp===emp&&!a.cancelled&&!a.completed)
      .sort((a,b)=>(b.assignedAt||0)-(a.assignedAt||0));
  }

  window.v42AfterCloudPull=function(before,after){
    if(!me)return;
    const beforeA=new Set((before.assign||[]).map(a=>String(a.id)));
    const fresh=(after.assign||[]).filter(a=>a.emp===me.id&&!a.cancelled&&!a.completed&&!beforeA.has(String(a.id)));
    fresh.forEach(a=>{
      const j=(after.jobs||[]).find(x=>x.no===a.job)||{};
      nativeNotify('New Job Assigned',a.job+' · '+(j.vehicle||'')+(j.reg?' · '+j.reg:''));
    });

    const beforeN=new Set((before.systemNotifications||[]).map(n=>String(n.id)));
    (after.systemNotifications||[]).filter(n=>n.target===me.id&&!n.read&&!beforeN.has(String(n.id))).forEach(n=>{
      nativeNotify('Zukait Time Track',n.message||'New notification');
    });

    if(me.role==='Supervisor'){
      const oldReq=new Set((before.requests||[]).map(r=>String(r.id)));
      (after.requests||[]).filter(r=>r.status==='New'&&!oldReq.has(String(r.id))).forEach(r=>{
        const who=(after.users||[]).find(u=>u.id===r.emp)?.name||r.emp;
        nativeNotify('Employee Request',who+' · '+r.job+' · '+String(r.type||'request').replaceAll('_',' '));
      });
    }
  };

  function employeeStatusInfo(a,s,ac,sg){
    if(!a)return {key:'available',label:'AVAILABLE'};
    const over=a.job!==HOLD&&ac>sg;
    const paused=!s&&typeof empStatus==='function'&&String(empStatus(a)).toLowerCase()==='paused';
    if(a.rework){
      if(s)return {key:'repeat',label:'REPEAT • RUNNING'};
      if(paused)return {key:'repeat',label:'REPEAT • PAUSED'};
      return {key:'repeat',label:'REPEAT WORK'};
    }
    if(over)return {key:'over',label:'OVER SUGGESTED'};
    if(s)return {key:'running',label:'RUNNING'};
    if(paused)return {key:'paused',label:'PAUSED'};
    return {key:'new',label:'NEW'};
  }

  function focusHTML(){
    if(!me||me.role!=='Employee')return '';
    const s=activeSession(me.id);
    if(!s){
      return '<div class="card v42-focus v51-focus v52-no-work">'+
        '<div class="v51-status-strip"><span>NO WORK IS GOING ON</span></div>'+
        '<div class="v51-empty"><div class="v42-focus-jc">NO ACTIVE WORK</div>'+
        '<p>Select a job from <b>Assigned Jobs</b> below to start or resume work.</p></div>'+
        '<div class="v42-sync-note">Paused jobs remain in Assigned Jobs and can be resumed at any time.</div></div>';
    }

    const a=findAssignmentForSession(s);
    if(!a){
      return '<div class="card v42-focus v51-focus v52-no-work"><div class="v51-status-strip"><span>NO WORK IS GOING ON</span></div><div class="v51-empty"><div class="v42-focus-jc">NO ACTIVE WORK</div></div></div>';
    }

    const j=job(a.job)||{};
    const ac=actualFor(a),sg=Number(a.suggested||0);
    const rem=Math.max(0,sg-ac),over=a.job===HOLD?0:Math.max(0,ac-sg);
    const strip=a.rework?'REPEAT WORK • WORK IN PROGRESS':'WORK IN PROGRESS';

    let buttons='';
    if(a.job!==HOLD)buttons+='<button class="yellow v51-main-action" onclick="pause()">⏸ PAUSE</button>';
    buttons+='<button class="green v51-main-action" onclick="finish()">'+(a.job===HOLD?'■ STOP':'✓ FINISH')+'</button>';
    const requestButton=a.job===HOLD?'':'<button class="secondary v42-wide v51-request" onclick="openEmployeeRequestMenu(\''+esc(a.job)+'\')">📩 INFORM / REQUEST</button>';

    return '<div class="card v42-focus v51-focus '+(a.rework?'v51-status-repeat':'v51-status-running')+'">'+
      '<div class="v51-status-strip"><span>'+strip+'</span></div>'+
      '<div class="v42-focus-head"><div><div class="small muted">CURRENT JOB</div><div class="v42-focus-jc">'+esc(a.job)+'</div></div></div>'+
      '<div class="v42-focus-vehicle">'+esc(j.vehicle||'')+(j.reg?' <span>·</span> '+esc(j.reg):'')+'</div>'+
      '<div class="v42-times v51-times">'+
        '<div class="v42-time v51-suggested">Suggested<b>'+fmt(sg)+'</b></div>'+
        '<div class="v42-time v51-actual">Actual<b id="currentActual">'+fmt(ac)+'</b></div>'+
        '<div class="v42-time v51-remaining">Remaining<b id="currentRemaining">'+fmt(rem)+'</b></div>'+
        '<div class="v42-time v51-exceeded '+(over>0?'has-over':'')+'">Exceeded<b id="currentExceeded">'+fmt(over)+'</b></div>'+
      '</div>'+
      '<div class="v42-actions v51-actions">'+buttons+requestButton+'</div>'+
      '<div class="v42-sync-note">Timing continues if the app is closed or the phone is locked.</div></div>';
  }

  const employeeBase=window.renderEmployee;
  if(typeof employeeBase==='function'){
    window.renderEmployee=function(){
      employeeBase();
      const root=document.getElementById('employeeView');
      if(!root||!me)return;

      root.querySelector('.v42-focus')?.remove();
      root.insertAdjacentHTML('afterbegin',focusHTML());

      const oldCurrent=root.querySelector('.employee-current');
      if(oldCurrent)oldCurrent.style.display='none';

      const top=root.querySelector('.employee-top');
      const month=top?.querySelector('.month-summary');
      const jobs=root.querySelector('.employee-jobs');

      // Assigned Jobs must always remain open and directly below Current Work.
      if(jobs){
        jobs.classList.add('v52-assigned-open');
        const title=jobs.querySelector('.section-title h3');
        if(title)title.textContent='Assigned Jobs';
        const hint=jobs.querySelector('.section-title .pill');
        if(hint)hint.textContent='Choose a NEW job or RESUME a PAUSED job';
        const focus=root.querySelector('.v42-focus');
        if(focus)focus.insertAdjacentElement('afterend',jobs);
      }

      // Monthly performance stays below Assigned Jobs and collapsed.
      if(month){
        const d=document.createElement('details');
        d.className='card v51-collapse v51-monthly';
        d.innerHTML='<summary><span>📊 This Month</span><small>Performance summary</small></summary><div class="v51-collapse-body"></div>';
        d.querySelector('.v51-collapse-body').appendChild(month);
        if(jobs)jobs.insertAdjacentElement('afterend',d);
        else {
          const focus=root.querySelector('.v42-focus');
          if(focus)focus.insertAdjacentElement('afterend',d);
        }
      }

      const finished=root.querySelector('.employee-finished');
      if(finished){finished.classList.add('v51-secondary-detail');finished.open=false;}
      const history=root.querySelector('.employee-history');
      if(history){history.classList.add('v51-secondary-detail');history.open=false;}

      if(top && !top.querySelector('.month-summary'))top.style.display='none';
    };
  }

  window.v42SupervisorList=function(type){
    const rows=(state.assign||[]).filter(a=>!a.cancelled&&!a.completed);
    let match=rows,title='Assignments';
    if(type==='working'){match=rows.filter(a=>empStatus(a)==='Started');title='🟢 Working Now'}
    if(type==='paused'){return window.openGlanceList('paused')}
    if(type==='new'){match=rows.filter(a=>empStatus(a)==='New');title='⚪ Not Started'}
    if(type==='over'){return window.openGlanceList('over')}
    if(type==='repeat'){match=rows.filter(a=>a.rework);title='🔁 Open Repeat Work'}
    if(typeof showSupervisorModal==='function'&&typeof window.v38SupervisorRows==='function'){
      showSupervisorModal(title,window.v38SupervisorRows(match));
    }
  };

  function supervisorPriorityHTML(){
    const rows=(state.assign||[]).filter(a=>!a.cancelled&&!a.completed);
    const working=rows.filter(a=>empStatus(a)==='Started').length;
    const paused=rows.filter(a=>a.job!==HOLD&&empStatus(a)==='Paused').length;
    const fresh=rows.filter(a=>empStatus(a)==='New').length;
    const over=rows.filter(a=>typeof window.overStatus==='function'&&window.overStatus(a)).length;
    const repeat=rows.filter(a=>a.rework).length;
    const customerNos=[...new Set((state.jobs||[]).filter(j=>j.no!==HOLD).map(j=>j.no))];
    const finished=customerNos.filter(no=>{
      const aa=(state.assign||[]).filter(a=>a.job===no&&!a.cancelled);
      return aa.length&&aa.every(a=>a.completed)&&!aa.some(a=>a.rework&&!a.completed);
    }).length;
    return '<div class="card"><div class="section-title"><h3>Workshop Priority</h3><span class="pill">Live</span></div><div class="v42-priority">'+
      '<button class="v42-working" onclick="v42SupervisorList(\'working\')">WORKING NOW<strong>'+working+'</strong></button>'+
      '<button class="v42-paused" onclick="v42SupervisorList(\'paused\')">PAUSED<strong>'+paused+'</strong></button>'+
      '<button class="v42-new" onclick="v42SupervisorList(\'new\')">NOT STARTED<strong>'+fresh+'</strong></button>'+
      '<button class="v42-over" onclick="v42SupervisorList(\'over\')">OVER SUGGESTED<strong>'+over+'</strong></button>'+
      '<button class="v42-finished" onclick="openSupervisorFinishedWindow()">FINISHED<strong>'+finished+'</strong></button>'+
      '<button class="v42-repeat" onclick="v42SupervisorList(\'repeat\')">REPEAT WORK<strong>'+repeat+'</strong></button>'+
      '</div></div>';
  }

  const supervisorBase=window.renderSupervisor;
  if(typeof supervisorBase==='function'){
    window.renderSupervisor=function(){
      supervisorBase();
      const root=document.getElementById('supervisorView');if(!root||!me)return;
      root.querySelector('.v42-supervisor-priority')?.remove();
      const box=document.createElement('div');box.className='v42-supervisor-priority';box.innerHTML=supervisorPriorityHTML();
      root.insertBefore(box,root.firstChild);
    };
  }

  window.v42BackupNow=async function(){
    if(!me||me.role!=='Manager')return;
    const btn=document.getElementById('v42BackupBtn');if(btn){btn.disabled=true;btn.textContent='Backing up...'}
    try{
      const r=await window.zukaitCloud.backupNow();
      if(!r?.ok)return alert('Backup failed. Please check internet and try again.');
      alert('Cloud backup created successfully. Revision '+r.backup.revision+'.');
    }catch(e){alert('Backup failed: '+(e?.message||e))}
    finally{if(btn){btn.disabled=false;btn.textContent='☁ BACKUP NOW'}}
  };

  window.v42ShowBackups=async function(){
    if(!me||me.role!=='Manager')return;
    try{
      const r=await window.zukaitCloud.backupList();
      if(!r?.ok)return alert('Could not load backups.');
      const rows=r.backups||[];
      const body=rows.length?'<table><tr><th>Date</th><th>By</th><th>Revision</th></tr>'+rows.map(x=>'<tr><td>'+new Date(x.created_at).toLocaleString()+'</td><td>'+esc(x.created_by)+'</td><td>'+x.revision+'</td></tr>').join('')+'</table>':'<p class="muted">No backups yet.</p>';
      showManagerModal('☁ Workshop Backups',body);
    }catch(e){alert('Could not load backups.')}
  };

  window.v42SyncNow=async function(){
    try{await window.zukaitCloud.syncNow();}catch(e){alert('Sync could not complete. Check internet connection.')}
  };

  function managerToolsHTML(){
    return '<div class="card v42-manager-tools"><div class="section-title"><h3>Production Safety</h3><span class="pill">Cloud Protected</span></div>'+
      '<p class="muted">Manual backup, sync status and reports for live workshop testing.</p>'+
      '<div class="row"><button class="blue" onclick="v42SyncNow()">↻ SYNC NOW</button> '+
      '<button class="green" id="v42BackupBtn" onclick="v42BackupNow()">☁ BACKUP NOW</button> '+
      '<button class="secondary" onclick="v42ShowBackups()">BACKUP HISTORY</button> '+
      '<button class="purple" onclick="openManagerReports()">REPORTS</button></div></div>';
  }

  const managerBase=window.renderManager;
  if(typeof managerBase==='function'){
    window.renderManager=function(){
      managerBase();
      const root=document.getElementById('managerView');if(!root||!me)return;
      root.querySelector('.v42-manager-tools')?.remove();
      root.insertAdjacentHTML('afterbegin',managerToolsHTML());
    };
  }

  function ensureTopControls(){
    const app=document.getElementById('app');if(!app||app.classList.contains('hidden'))return;
    const row=app.querySelector(':scope > .row');if(!row)return;
    [...row.querySelectorAll('button')].forEach(b=>{
      if((b.textContent||'').toLowerCase().includes('reset test data')){b.style.display='none';b.classList.add('v42-hide-reset')}
    });
    if(!document.getElementById('v42SyncBtn')){
      const b=document.createElement('button');b.id='v42SyncBtn';b.className='secondary';b.textContent='↻ Sync';
      b.onclick=()=>window.v42SyncNow();
      const logout=[...row.querySelectorAll('button')].find(x=>(x.textContent||'').toLowerCase().includes('logout'));
      row.insertBefore(b,logout||null);
    }
  }

  function applyBranding(){
    const header=document.querySelector('header');
    if(header&&!header.querySelector('.v42-brand')){
      const net=document.getElementById('net');
      header.innerHTML='<div class="v42-brand"><img src="zukait_logo.webp" alt=""><div class="v42-brand-title">Zukait Time Track<small>Workshop Production & Time Tracking</small></div></div>';
      if(net)header.appendChild(net);
    }
    const login=document.getElementById('login');
    if(login&&!login.querySelector('.v42-login-logo')){
      const img=document.createElement('img');img.className='v42-login-logo';img.src='zukait_logo.webp';img.alt='Zukait Time Track';
      login.insertBefore(img,login.firstChild);
    }
  }

  const obs=new MutationObserver(()=>{ensureTopControls();applyBranding()});
  obs.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  applyBranding();
  ensureTopControls();
  window.v42NativeNotify=nativeNotify;
})();