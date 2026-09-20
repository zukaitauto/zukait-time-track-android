(function(){
  'use strict';

  const HOLD='ID001';
  const VOICE_API='https://pjknotnjkufadqavcmii.supabase.co/functions/v1/voice-api';
  const CLOUD_KEY='sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const empUsers=()=>users.filter(u=>u.role==='Employee');
  const assignmentActual=a=>{
    try{return typeof totalForAssignment==='function'?Math.max(0,totalForAssignment(a)||0):0}catch(_){return 0}
  };
  const assignmentStatus=a=>{
    try{return typeof empStatus==='function'?String(empStatus(a)||'New'):'New'}catch(_){return 'New'}
  };
  const getJob=no=>typeof job==='function'?job(no):(state.jobs||[]).find(j=>j.no===no);

  const css=document.createElement('style');
  css.id='v54ImprovementsCss';
  css.textContent=`
    /* V54 employee visual separation — layout unchanged */
    #employeeView>.v42-focus{
      background:#eff6ff!important;
      border:2px solid #93c5fd!important;
      box-shadow:0 8px 22px rgba(37,99,235,.10)!important;
    }
    #employeeView>.v52-assigned-open{
      background:#f0fdf4!important;
      border:2px solid #86efac!important;
      box-shadow:0 6px 18px rgba(21,128,61,.08)!important;
    }
    #employeeView>.v52-assigned-open>.section-title{
      background:#dcfce7;
      margin:-12px -12px 12px!important;
      padding:11px 12px;
      border-bottom:1px solid #bbf7d0;
    }
    #employeeView .v51-monthly{
      background:#faf5ff!important;
      border:1px solid #ddd6fe!important;
    }
    #employeeView .v51-monthly>summary{background:#f3e8ff}
    #employeeView .v42-focus-jc{
      font-size:38px!important;
      line-height:1.05!important;
      letter-spacing:.01em;
    }
    #employeeView .v42-focus-vehicle{
      font-size:22px!important;
      line-height:1.25!important;
      font-weight:1000!important;
      text-transform:uppercase;
    }
    #employeeView .employee-jobs .job-card h4{
      font-size:25px!important;
      line-height:1.1!important;
      margin-bottom:8px!important;
    }
    #employeeView .employee-jobs .job-card>p:first-of-type{
      font-size:19px!important;
      line-height:1.35!important;
      font-weight:850!important;
      text-transform:uppercase;
    }
    #employeeView .employee-jobs .job-card>p:first-of-type b{
      display:inline-block;
      font-size:23px!important;
      margin-top:3px;
      letter-spacing:.03em;
    }
    #employeeView .v42-sync-note{display:none!important}
    #employeeView .employee-month-kpi .small{display:none!important}

    /* Clean supervisor dashboard */
    #supervisorView>.v42-supervisor-priority{display:none!important}
    #supervisorView>.card>p.muted,
    #supervisorView .quick-entry>p.muted,
    #managerView>.card>p.muted{display:none!important}
    #supervisorView .glance-grid{
      display:grid!important;
      grid-template-columns:repeat(2,minmax(0,1fr))!important;
      gap:12px!important;
    }
    #supervisorView .glance-box{
      min-height:112px!important;
      border-radius:14px!important;
      padding:14px!important;
    }
    .v54-request-available{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:12px;
      margin:12px 0;
    }
    .v54-request-available>.card{margin:0!important;min-height:122px}
    .v54-compact-dashboard-btn{
      width:100%;
      height:100%;
      min-height:94px!important;
      border:0!important;
      border-radius:12px!important;
      padding:14px!important;
      text-align:left!important;
      display:flex!important;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      font-size:16px!important;
    }
    .v54-compact-dashboard-btn strong{
      display:block;
      font-size:30px;
      line-height:1;
      margin-top:6px;
    }
    .v54-request-btn{background:#eff6ff!important;color:#1e3a8a!important}
    .v54-available-btn{background:#f0fdf4!important;color:#166534!important}
    .v54-tech-button{
      width:100%;
      min-height:112px!important;
      background:#f8fafc!important;
      color:#0f1b2b!important;
      border:1px solid #cbd5e1!important;
      display:flex!important;
      align-items:center;
      justify-content:space-between;
      text-align:left!important;
      padding:16px!important;
    }
    .v54-tech-button .v54-icon{font-size:34px;margin-right:10px}
    .v54-dept-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .v54-dept-box{min-height:135px!important;text-align:center!important;font-size:17px!important}
    .v54-dept-box .v54-icon{display:block;font-size:38px;margin-bottom:8px}
    .v54-dept-box strong{display:block;font-size:24px;margin-top:5px}
    .v54-job-search{
      width:100%;
      margin:0 0 8px;
      font-weight:800;
      text-transform:uppercase;
    }

    /* Request / voice note */
    .v54-voice-panel{
      margin-top:12px;
      padding:12px;
      border:1px solid #cbd5e1;
      border-radius:12px;
      background:#fff;
    }
    .v54-voice-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .v54-voice-actions button{min-width:130px}
    .v54-voice-panel audio{width:100%;margin-top:10px}
    .v54-request-row{border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin:9px 0;background:#fff}
    .v54-request-meta{font-size:12px;color:#64748b;margin-top:4px}
    .v54-request-message{margin:8px 0;white-space:pre-wrap}
    .v54-manager-requests{border-left:4px solid #2563eb!important}

    /* Small network-only indicator; normal synced/syncing text is hidden */
    #cloudStatus,#net{display:none!important}
    #v54OnlineStatus{
      display:inline-flex;
      align-items:center;
      gap:5px;
      border-radius:999px;
      padding:5px 8px;
      min-height:28px;
      font-size:10px;
      font-weight:1000;
      letter-spacing:.04em;
      white-space:nowrap;
      margin-left:auto;
    }
    #v54OnlineStatus.online{background:#dcfce7;color:#166534;border:1px solid #86efac}
    #v54OnlineStatus.offline{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}
    #v54OnlineStatus .dot{width:7px;height:7px;border-radius:50%;background:currentColor}

    @media(max-width:620px){
      #employeeView .v42-focus-jc{font-size:34px!important}
      #employeeView .v42-focus-vehicle{font-size:20px!important}
      #employeeView .employee-jobs .job-card h4{font-size:23px!important}
      #employeeView .employee-jobs .job-card>p:first-of-type{font-size:18px!important}
      .v54-request-available{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .v54-compact-dashboard-btn{padding:10px!important;font-size:13px!important}
      .v54-compact-dashboard-btn strong{font-size:26px}
      .v54-dept-grid{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(css);

  // Keep underlying calculation field names intact; only the user-facing wording changes.
  const wording=[
    [/Total Suggested Time/g,'Total Allocated Time'],
    [/Remaining Suggested Time/g,'Remaining Allocated Time'],
    [/Over Suggested Time/g,'Over Allocated Time'],
    [/Suggested Time/g,'Allocated Time'],
    [/suggested time/g,'allocated time'],
    [/Suggested/g,'Allocated'],
    [/suggested/g,'allocated']
  ];
  function applyWording(root=document.body){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(n=>{
      const p=n.parentElement;
      if(!p||['SCRIPT','STYLE','TEXTAREA'].includes(p.tagName))return;
      let v=n.nodeValue||'',next=v;
      wording.forEach(([re,to])=>{next=next.replace(re,to)});
      if(next!==v)n.nodeValue=next;
    });
  }

  // New vehicle / registration data is stored uppercase; old records also display uppercase.
  function normalizeJobs(){
    if(!window.state||!Array.isArray(state.jobs))return;
    for(const j of state.jobs){
      if(!j||j.no===HOLD)continue;
      if(typeof j.vehicle==='string')j.vehicle=j.vehicle.trim().toUpperCase();
      if(typeof j.reg==='string')j.reg=j.reg.trim().toUpperCase();
    }
  }
  const originalSave=window.save;
  if(typeof originalSave==='function'){
    window.save=function(){
      if(me&&me.role!=='Employee')normalizeJobs();
      return originalSave.apply(this,arguments);
    };
  }
  document.addEventListener('input',e=>{
    const t=e.target;
    if(!(t instanceof HTMLInputElement))return;
    if(['newVehicle','newReg'].includes(t.id))t.value=t.value.toUpperCase();
  },true);

  // Simple online/offline indicator.
  function ensureOnlineIndicator(){
    const app=document.getElementById('app');
    if(!app||app.classList.contains('hidden'))return;
    const row=app.querySelector(':scope > .row');
    if(!row)return;
    let badge=document.getElementById('v54OnlineStatus');
    if(!badge){
      badge=document.createElement('span');
      badge.id='v54OnlineStatus';
      row.appendChild(badge);
    }
    const online=navigator.onLine;
    badge.className=online?'online':'offline';
    badge.innerHTML='<span class="dot"></span>'+(online?'ONLINE':'OFFLINE');
    badge.title=online?'Phone is connected to a network':'Phone is offline';
  }
  window.addEventListener('online',ensureOnlineIndicator);
  window.addEventListener('offline',ensureOnlineIndicator);
  setInterval(ensureOnlineIndicator,15000);

  function currentAssignmentFor(emp){
    const s=typeof activeSession==='function'?activeSession(emp):null;
    if(s){
      return (state.assign||[]).find(a=>a.id===s.assignmentId)||
        (state.assign||[]).find(a=>a.emp===emp&&a.job===s.job&&!a.cancelled&&!a.completed)||null;
    }
    return null;
  }

  // ---------- Employee request actual voice notes ----------
  let voice={stream:null,recorder:null,chunks:[],blob:null,url:null,timer:null,started:0};

  function clearVoice(){
    if(voice.timer)clearTimeout(voice.timer);
    if(voice.stream)voice.stream.getTracks().forEach(t=>t.stop());
    if(voice.url)URL.revokeObjectURL(voice.url);
    voice={stream:null,recorder:null,chunks:[],blob:null,url:null,timer:null,started:0};
  }
  function setVoiceStatus(text){const e=document.getElementById('v54VoiceStatus');if(e)e.textContent=text;}
  function stopTracks(){if(voice.stream){voice.stream.getTracks().forEach(t=>t.stop());voice.stream=null;}}

  window.v54StartVoice=async function(){
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
      alert('Voice recording is not supported on this device.');return;
    }
    clearVoice();
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      voice.stream=stream;
      const types=['audio/webm;codecs=opus','audio/webm','audio/ogg'];
      const mime=types.find(t=>typeof MediaRecorder.isTypeSupported!=='function'||MediaRecorder.isTypeSupported(t))||'';
      const rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
      voice.recorder=rec;voice.chunks=[];voice.started=Date.now();
      rec.ondataavailable=e=>{if(e.data&&e.data.size)voice.chunks.push(e.data)};
      rec.onstop=()=>{
        const type=(rec.mimeType||mime||'audio/webm').split(';')[0];
        voice.blob=new Blob(voice.chunks,{type});
        stopTracks();
        voice.url=URL.createObjectURL(voice.blob);
        const audio=document.getElementById('v54VoicePreview');
        if(audio){audio.src=voice.url;audio.classList.remove('hidden');}
        const send=document.getElementById('v54VoiceReady');
        if(send)send.textContent='Voice note ready · '+Math.max(1,Math.round((Date.now()-voice.started)/1000))+' sec';
        setVoiceStatus('Recorded. Play the preview, then send the request.');
        const start=document.getElementById('v54RecordBtn'),stop=document.getElementById('v54StopBtn');
        if(start){start.disabled=false;start.textContent='🎤 RECORD AGAIN';}
        if(stop)stop.disabled=true;
      };
      rec.start(250);
      const start=document.getElementById('v54RecordBtn'),stop=document.getElementById('v54StopBtn');
      if(start){start.disabled=true;start.textContent='● RECORDING...';}
      if(stop)stop.disabled=false;
      setVoiceStatus('Recording… maximum 60 seconds.');
      voice.timer=setTimeout(()=>{try{if(rec.state==='recording')rec.stop()}catch(_){}},60000);
    }catch(e){
      stopTracks();
      setVoiceStatus('Microphone permission was not granted.');
      alert('Microphone could not start. Please allow microphone permission and try again.');
    }
  };

  window.v54StopVoice=function(){
    try{
      if(voice.timer)clearTimeout(voice.timer);
      if(voice.recorder&&voice.recorder.state==='recording')voice.recorder.stop();
    }catch(_){}
  };

  async function blobBase64(blob){
    const buf=new Uint8Array(await blob.arrayBuffer());
    let binary='';
    const chunk=0x8000;
    for(let i=0;i<buf.length;i+=chunk){
      binary+=String.fromCharCode(...buf.subarray(i,Math.min(i+chunk,buf.length)));
    }
    return btoa(binary);
  }
  async function voiceApi(payload){
    const token=window.zukaitAuth?.getToken?.()||'';
    if(!token)throw new Error('LOGIN_REQUIRED');
    const res=await fetch(VOICE_API,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':CLOUD_KEY,'x-zukait-session':token},
      body:JSON.stringify(payload)
    });
    let body={};try{body=await res.json()}catch(_){}
    if(!res.ok||!body.ok)throw new Error(body.code||'VOICE_API_FAILED');
    return body;
  }

  window.openEmployeeRequest=function(no,type){
    clearVoice();
    const j=getJob(no);
    const a=(state.assign||[]).filter(x=>x.job===no&&x.emp===me.id&&!x.cancelled)
      .sort((x,y)=>(y.assignedAt||0)-(x.assignedAt||0))[0];
    if(!j||!a){alert('Job card assignment not found.');return;}
    const labels={more_time:'⏱ Additional Time Request',problem:'⚠ Job Card Problem',parts:'🔧 Spare Parts Required',correction:'📝 Information Correction',other:'📌 Other'};
    const title=labels[type]||'📩 Employee Request';
    const more=type==='more_time';
    const defaultMessage=more?'Please approve additional time for this job card.':'';
    const amount=more?'<label><b>Requested Additional Time</b><br><input id="reqMinutes" inputmode="decimal" placeholder="0.30" value="0.30"><div class="time-hint">'+(typeof timeInputHint==='function'?timeInputHint():'Enter H.MM or H:MM')+'</div></label>':'';
    const detail='<div class="job-detail-grid"><div class="job-detail-stat"><b>JOB CARD</b><strong>'+esc(no)+'</strong></div><div class="job-detail-stat"><b>VEHICLE</b><strong>'+esc(String(j.vehicle||'').toUpperCase())+' · '+esc(String(j.reg||'').toUpperCase())+'</strong></div><div class="job-detail-stat"><b>ALLOCATED</b><strong>'+fmt(a.suggested||0)+'</strong></div><div class="job-detail-stat"><b>ACTUAL</b><strong>'+fmt(assignmentActual(a))+'</strong></div></div>';
    openModal('<div class="section-title"><h3>'+title+'</h3><button class="secondary" onclick="v54CloseRequest()">Close</button></div>'+detail+
      '<div class="card" style="margin:12px 0;background:#f8fafc"><div class="grid">'+amount+
      '<label><b>Message / Details</b><br><textarea id="reqMessage" rows="3" style="width:100%;box-sizing:border-box" placeholder="Type a message, record a voice note, or use both">'+esc(defaultMessage)+'</textarea></label></div>'+
      '<div class="v54-voice-panel"><b>🎤 Voice Note</b><div class="v54-voice-actions" style="margin-top:8px">'+
      '<button type="button" class="blue" id="v54RecordBtn" onclick="v54StartVoice()">🎤 RECORD</button>'+
      '<button type="button" class="danger" id="v54StopBtn" onclick="v54StopVoice()" disabled>■ STOP</button>'+
      '<span id="v54VoiceReady" class="small"></span></div>'+
      '<div id="v54VoiceStatus" class="small muted" style="margin-top:7px">Optional. Record up to 60 seconds.</div>'+
      '<audio id="v54VoicePreview" class="hidden" controls preload="metadata"></audio></div></div>'+
      '<button class="green big-action" id="v54SendRequestBtn" onclick="v54SubmitEmployeeRequest(\''+esc(no)+'\',\''+esc(type)+'\')">SEND REQUEST</button>');
    applyWording(document.getElementById('modal'));
  };

  window.v54CloseRequest=function(){clearVoice();closeModal();};

  window.v54SubmitEmployeeRequest=async function(no,type){
    const a=(state.assign||[]).filter(x=>x.job===no&&x.emp===me.id&&!x.cancelled)
      .sort((x,y)=>(y.assignedAt||0)-(x.assignedAt||0))[0];
    if(!a){alert('Job card assignment not found.');return;}
    let mins=0;
    if(type==='more_time'){
      mins=parseWorkMinutes(document.getElementById('reqMinutes')?.value||'');
      if(!Number.isFinite(mins)||mins<1){alert('Enter a valid additional time. '+(typeof timeInputHint==='function'?timeInputHint():''));return;}
    }
    const message=(document.getElementById('reqMessage')?.value||'').trim();
    if(!message&&!voice.blob&&type!=='more_time'){alert('Please type a message or record a voice note.');return;}

    const btn=document.getElementById('v54SendRequestBtn');
    if(btn){btn.disabled=true;btn.textContent=voice.blob?'UPLOADING VOICE NOTE...':'SENDING...';}
    try{
      const requestId=uid();
      let voiceInfo=null;
      if(voice.blob){
        const base64=await blobBase64(voice.blob);
        voiceInfo=await voiceApi({
          action:'upload',request_id:requestId,job_no:no,
          mime_type:(voice.blob.type||'audio/webm').split(';')[0],base64
        });
      }
      state.requests=state.requests||[];
      state.requests.push({
        id:requestId,emp:me.id,job:no,type,minutes:mins,
        message:message||(type==='more_time'?'Additional time requested.':'Voice note'),
        status:'New',createdAt:now(),
        voiceRequestId:voiceInfo?requestId:null,
        voiceExpiresAt:voiceInfo?.expires_at||null,
        voiceMime:voiceInfo?.mime_type||null,
        managerCopy:true
      });
      if(typeof setLastAction==='function')setLastAction('Sent employee request for '+no);
      save();
      clearVoice();closeModal();render();
      alert('Request sent to Supervisor and copied to Manager.');
    }catch(e){
      console.error(e);
      alert('Request could not be sent. Check internet connection and try again.');
      if(btn){btn.disabled=false;btn.textContent='SEND REQUEST';}
    }
  };

  window.v54PlayVoice=async function(requestId,targetId){
    const target=document.getElementById(targetId);
    if(!target)return;
    target.innerHTML='<span class="small muted">Loading voice note…</span>';
    try{
      const r=await voiceApi({action:'play',request_id:requestId});
      target.innerHTML='<audio controls autoplay preload="metadata" src="'+esc(r.signed_url)+'" style="width:100%"></audio>';
    }catch(e){
      target.innerHTML='<span class="small" style="color:#b42318">Voice note unavailable or expired.</span>';
    }
  };

  function requestTypeLabel(type){
    return ({more_time:'⏱ Additional Time',problem:'⚠ Job Card Problem',parts:'🔧 Spare Parts',correction:'📝 Information Correction',other:'📌 Other'})[type]||'📩 Request';
  }
  function requestRows(mode){
    const rows=(state.requests||[]).slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    if(!rows.length)return '<p class="muted">No employee requests.</p>';
    return rows.map((r,i)=>{
      const st=r.status==='New'?'<span class="status new">NEW</span>':'<span class="status finish">'+esc(String(r.status||'').toUpperCase())+'</span>';
      let actions='';
      if(mode==='supervisor'&&r.status==='New'){
        actions=r.type==='more_time'
          ?'<button class="green" onclick="approveRequest(\''+r.id+'\')">Approve</button> <button class="danger" onclick="rejectRequest(\''+r.id+'\')">Reject</button>'
          :'<button class="blue" onclick="ackRequest(\''+r.id+'\')">Mark Read</button>';
      }
      const voiceHtml=r.voiceRequestId
        ?'<div style="margin-top:8px"><button class="purple" onclick="v54PlayVoice(\''+esc(r.voiceRequestId)+'\',\'v54voice-'+mode+'-'+i+'\')">▶ PLAY VOICE NOTE</button><div id="v54voice-'+mode+'-'+i+'" style="margin-top:6px"></div><div class="small muted">Audio automatically expires within 30 days.</div></div>'
        :'';
      return '<div class="v54-request-row"><div><b>'+esc(user(r.emp).name)+'</b> · <b>'+esc(r.job)+'</b> · '+requestTypeLabel(r.type)+' '+st+'</div>'+
        '<div class="v54-request-meta">'+new Date(r.createdAt).toLocaleString()+(r.minutes?' · +'+r.minutes+' min requested':'')+(mode==='manager'?' · Manager copy':'')+'</div>'+
        '<div class="v54-request-message">'+esc(r.message||'No text message')+'</div>'+
        voiceHtml+(r.response?'<div class="small"><b>Response:</b> '+esc(r.response)+'</div>':'')+
        (actions?'<div style="margin-top:8px">'+actions+'</div>':'')+'</div>';
    }).join('');
  }

  window.supervisorRequests=function(){return requestRows('supervisor');};
  window.openSupervisorRequestsWindow=function(){
    showSupervisorModal('🔔 Employee Requests',requestRows('supervisor'));
    applyWording(document.getElementById('modal'));
  };
  window.v54OpenManagerRequests=function(){
    showManagerModal('🔔 Employee Requests — Manager Copy',requestRows('manager'));
    applyWording(document.getElementById('modal'));
  };

  // ---------- Supervisor dashboard improvements ----------
  window.v54FilterJobCards=function(){
    const input=document.getElementById('v54JobSearch'),sel=document.getElementById('sj');
    if(!input||!sel)return;
    const q=input.value.trim().toUpperCase();
    const old=sel.value;
    const matches=(state.jobs||[]).filter(j=>{
      const text=[j.no,j.vehicle,j.reg].join(' ').toUpperCase();
      return !q||text.includes(q);
    }).sort((a,b)=>String(b.no).localeCompare(String(a.no),undefined,{numeric:true}));
    sel.innerHTML=matches.map(j=>'<option value="'+esc(j.no)+'">'+esc(j.no)+' — '+esc(String(j.vehicle||'').toUpperCase())+' — '+esc(String(j.reg||'').toUpperCase())+'</option>').join('');
    if(matches.some(j=>j.no===old))sel.value=old;
  };

  function availableEmployees(){
    return empUsers().filter(u=>!(typeof activeSession==='function'&&activeSession(u.id)));
  }
  window.v54OpenAvailableWorkers=function(){
    const rows=availableEmployees();
    const body=rows.length?'<table><tr><th>Employee</th><th>Department</th><th>Paused Jobs</th><th>Assigned Jobs</th></tr>'+
      rows.map(u=>{
        const open=(state.assign||[]).filter(a=>a.emp===u.id&&!a.cancelled&&!a.completed);
        const paused=open.filter(a=>assignmentStatus(a)==='Paused').length;
        return '<tr><td><b>'+esc(u.name)+'</b><br><span class="small">'+esc(u.id)+'</span></td><td>'+esc(u.department)+'</td><td>'+paused+'</td><td>'+open.length+'</td></tr>';
      }).join('')+'</table>':'<p class="muted">No workers are currently available.</p>';
    showSupervisorModal('✅ Available Workers',body);
  };

  const depts=[
    {key:'Denter',label:'Denting',icon:'🛠️'},
    {key:'Painter',label:'Painting',icon:'🎨'},
    {key:'Mechanic',label:'Mechanical',icon:'⚙️'}
  ];
  window.v54OpenTechnicianBoard=function(){
    const body='<div class="v54-dept-grid">'+depts.map(d=>{
      const team=empUsers().filter(u=>u.department===d.key);
      const active=team.filter(u=>typeof activeSession==='function'&&activeSession(u.id)).length;
      return '<button class="secondary v54-dept-box" onclick="v54OpenTechnicianDept(\''+d.key+'\')"><span class="v54-icon">'+d.icon+'</span>'+d.label+'<strong>'+active+' / '+team.length+'</strong><span class="small">working</span></button>';
    }).join('')+'</div>';
    showSupervisorModal('👷 Technician Board',body);
  };
  window.v54OpenTechnicianDept=function(dept){
    const cfg=depts.find(d=>d.key===dept)||{label:dept,icon:'👷'};
    const team=empUsers().filter(u=>u.department===dept);
    const body=team.length?'<div class="grid">'+team.map(u=>{
      const active=currentAssignmentFor(u.id);
      const open=(state.assign||[]).filter(a=>a.emp===u.id&&!a.cancelled&&!a.completed);
      const current=active||open.find(a=>assignmentStatus(a)==='Paused')||open[0]||null;
      const j=current?getJob(current.job):null;
      const ac=current?assignmentActual(current):0,al=current?Number(current.suggested||0):0;
      const remain=Math.max(0,al-ac);
      return '<div class="job-card"><h4>'+esc(u.name)+' <span class="small">'+esc(u.id)+'</span></h4>'+
        (current?'<p><b>'+esc(current.job)+'</b><br>'+esc(String(j?.vehicle||'').toUpperCase())+' · '+esc(String(j?.reg||'').toUpperCase())+'</p>'+
        statusHTML(assignmentStatus(current))+'<p>Allocated: <b>'+fmt(al)+'</b> · Actual: <b>'+fmt(ac)+'</b><br>Remaining: <b>'+fmt(remain)+'</b></p>'
        :'<p class="ok">AVAILABLE</p>')+
        '<button class="blue" onclick="openSupervisorTechnician(\''+u.id+'\')">VIEW JOBS</button></div>';
    }).join('')+'</div>':'<p class="muted">No technicians in this department.</p>';
    showSupervisorModal(cfg.icon+' '+cfg.label+' Technicians',body);
    applyWording(document.getElementById('modal'));
  };

  // Repeat Work assignment: assignment is allowed even when technician is active elsewhere.
  // The one-active-job rule still prevents them STARTING two jobs simultaneously.
  window.addRepeatWork=function(no){
    const j=getJob(no);if(!j)return alert('Job Card not found.');
    const workers=[...new Set((state.assign||[]).filter(a=>a.job===no&&!a.cancelled&&!a.rework).map(a=>a.emp))];
    const employees=empUsers();
    const options=employees.map(u=>'<option value="'+u.id+'">'+esc(u.name)+' — '+esc(u.department)+' ('+u.id+')</option>').join('');
    const mistakeOptions=(workers.length?employees.filter(u=>workers.includes(u.id)):employees)
      .map(u=>'<option value="'+u.id+'">'+esc(u.name)+' ('+u.id+')</option>').join('');
    showSupervisorModal('🔁 Repeat Work — '+esc(no),
      '<div class="grid"><label><b>Repeat Employee</b><br><select id="v54RepeatEmp" onchange="v54RepeatChanged()">'+options+'</select></label>'+
      '<label><b>Mistake Employee</b><br><select id="v54MistakeEmp" onchange="v54RepeatChanged()">'+mistakeOptions+'</select></label>'+
      '<label id="v54RepeatAllocatedWrap"><b>Allocated Time</b><br><input id="v54RepeatAllocated" value="1.00" inputmode="decimal"><div class="time-hint">Required only when another employee performs the repeat work.</div></label></div>'+
      '<label><b>Repeat Reason</b><br><textarea id="v54RepeatReason" style="width:100%" placeholder="Repeat complaint / correction"></textarea></label>'+
      '<p><button class="purple" onclick="v54AssignRepeat(\''+esc(no)+'\')">ASSIGN REPEAT WORK</button> <button class="secondary" onclick="closeSupervisorModal()">CANCEL</button></p>');
    setTimeout(window.v54RepeatChanged,0);
  };
  window.v54RepeatChanged=function(){
    const emp=document.getElementById('v54RepeatEmp')?.value;
    const mistake=document.getElementById('v54MistakeEmp')?.value;
    const wrap=document.getElementById('v54RepeatAllocatedWrap');
    if(wrap)wrap.style.display=emp&&mistake&&emp===mistake?'none':'';
  };
  window.v54AssignRepeat=function(no){
    const emp=document.getElementById('v54RepeatEmp')?.value;
    const mistake=document.getElementById('v54MistakeEmp')?.value;
    const reason=(document.getElementById('v54RepeatReason')?.value||'').trim();
    if(!emp||user(emp).role!=='Employee')return alert('Select Repeat Employee.');
    if(!mistake||user(mistake).role!=='Employee')return alert('Select Mistake Employee.');
    if(!reason)return alert('Repeat Reason is required.');

    const openRepeat=(state.assign||[]).find(a=>a.job===no&&a.emp===emp&&a.rework&&!a.cancelled&&!a.completed);
    if(openRepeat)return alert(user(emp).name+' already has an unfinished Repeat Work assignment on this Job Card.');

    const same=emp===mistake;
    let mins=0;
    if(!same){
      mins=parseWorkMinutes(document.getElementById('v54RepeatAllocated')?.value||'');
      if(!Number.isFinite(mins)||mins<1)return alert('Enter valid Allocated Time for the repeat employee. '+timeInputHint());
    }
    const a={id:uid(),job:no,emp,suggested:same?0:mins,completed:false,rework:true,repeatReason:reason,mistakeEmp:mistake,assignedBy:me.id,assignedAt:now(),repeatSameEmployee:same};
    state.assign.push(a);
    state.reworkLogs=state.reworkLogs||[];
    state.reworkLogs.push({id:uid(),assignmentId:a.id,job:no,emp,mistakeEmp:mistake,suggested:a.suggested,reason,by:me.id,at:now()});
    if(typeof setLastAction==='function')setLastAction('Assigned repeat work '+no+' to '+user(emp).name);
    save();closeSupervisorModal();render();
    alert('Repeat Work assigned to '+user(emp).name+'. Mistake employee: '+user(mistake).name+'.');
  };

  function enhanceSupervisor(){
    const root=document.getElementById('supervisorView');
    if(!root||root.classList.contains('hidden'))return;

    root.querySelector('.v42-supervisor-priority')?.remove();

    // Job Card search above the existing select.
    const sj=root.querySelector('#sj');
    if(sj&&!document.getElementById('v54JobSearch')){
      const input=document.createElement('input');
      input.id='v54JobSearch';input.className='v54-job-search';
      input.placeholder='SEARCH JC / VEHICLE / REGISTRATION';
      input.autocomplete='off';
      input.addEventListener('input',window.v54FilterJobCards);
      sj.parentElement?.insertBefore(input,sj);
      window.v54FilterJobCards();
    }

    // Compact Employee Requests + Available Workers side-by-side.
    const requestCard=root.querySelector('.request-compact');
    if(requestCard&&!requestCard.closest('.v54-request-available')){
      const holder=document.createElement('div');holder.className='v54-request-available';
      requestCard.parentNode.insertBefore(holder,requestCard);
      holder.appendChild(requestCard);
      const count=(state.requests||[]).filter(r=>r.status==='New').length;
      requestCard.innerHTML='<button class="v54-compact-dashboard-btn v54-request-btn" onclick="openSupervisorRequestsWindow()"><span>🔔 EMPLOYEE REQUESTS<strong>'+count+'</strong></span><span>›</span></button>';
      const available=document.createElement('div');available.className='card';
      available.innerHTML='<button class="v54-compact-dashboard-btn v54-available-btn" onclick="v54OpenAvailableWorkers()"><span>✅ AVAILABLE WORKERS<strong>'+availableEmployees().length+'</strong></span><span>›</span></button>';
      holder.appendChild(available);
    }

    // Replace the full live board with one clean Technician Board box.
    const techCard=[...root.querySelectorAll('.card')].find(c=>{
      const h=c.querySelector('h3');return h&&/TECHNICIAN BOARD/i.test(h.textContent||'');
    });
    if(techCard&&!techCard.classList.contains('v54-tech-card')){
      techCard.classList.add('v54-tech-card');
      techCard.innerHTML='<button class="v54-tech-button" onclick="v54OpenTechnicianBoard()"><span><span class="v54-icon">👷</span><b>TECHNICIAN BOARD</b><br><span class="small">Denting · Painting · Mechanical</span></span><span style="font-size:28px">›</span></button>';
    }
    applyWording(root);
  }

  function enhanceEmployee(){
    const root=document.getElementById('employeeView');if(!root||root.classList.contains('hidden'))return;
    root.querySelectorAll('.v42-focus-vehicle,.employee-jobs .job-card>p:first-of-type').forEach(e=>{e.style.textTransform='uppercase'});
    applyWording(root);
  }

  function enhanceManager(){
    const root=document.getElementById('managerView');if(!root||root.classList.contains('hidden'))return;
    if(!root.querySelector('.v54-manager-requests')){
      const count=(state.requests||[]).filter(r=>r.status==='New').length;
      const card=document.createElement('div');card.className='card v54-manager-requests clickable';
      card.innerHTML='<div class="section-title"><h3>🔔 Employee Requests — Manager Copy</h3><span class="request-badge">'+count+'</span></div><button class="blue" onclick="v54OpenManagerRequests()">VIEW REQUESTS</button>';
      root.insertBefore(card,root.firstChild);
    }
    applyWording(root);
  }

  const empBase=window.renderEmployee;
  if(typeof empBase==='function')window.renderEmployee=function(){empBase();enhanceEmployee();ensureOnlineIndicator();};
  const supBase=window.renderSupervisor;
  if(typeof supBase==='function')window.renderSupervisor=function(){supBase();enhanceSupervisor();ensureOnlineIndicator();};
  const mgrBase=window.renderManager;
  if(typeof mgrBase==='function')window.renderManager=function(){mgrBase();enhanceManager();ensureOnlineIndicator();};

  // Re-apply only when needed; all modifications are idempotent.
  let scheduled=false;
  const obs=new MutationObserver(()=>{
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      ensureOnlineIndicator();
      if(me?.role==='Employee')enhanceEmployee();
      else if(me?.role==='Supervisor')enhanceSupervisor();
      else if(me?.role==='Manager')enhanceManager();
    });
  });
  const app=document.getElementById('app');
  if(app)obs.observe(app,{childList:true,subtree:true});

  ensureOnlineIndicator();
  applyWording(document.body);
  window.v54Ready=true;
})();