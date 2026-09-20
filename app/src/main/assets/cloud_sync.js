(function(){
  const CLOUD_URL='https://pjknotnjkufadqavcmii.supabase.co';
  const CLOUD_KEY='sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A';
  const REV_KEY='zukait_cloud_revision_v40';
  let cloudRevision=Number(localStorage.getItem(REV_KEY)||0)||0;
  let cloudDirty=false;
  let cloudApplying=false;
  let cloudPushing=false;
  let pushTimer=null;
  let pollTimer=null;
  let initialDone=false;
  let conflictAlerted=false;

  function status(text,kind){
    let el=document.getElementById('cloudStatus');
    if(!el){
      el=document.createElement('span');
      el.id='cloudStatus';
      el.style.cssText='float:right;margin-right:12px;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:700;background:#e5e7eb;color:#374151';
      const net=document.getElementById('net');
      if(net&&net.parentNode)net.parentNode.insertBefore(el,net);
    }
    el.textContent=text;
    const map={
      ok:['#dcfce7','#166534'],
      warn:['#fef3c7','#92400e'],
      bad:['#fee2e2','#991b1b'],
      info:['#dbeafe','#1e40af']
    };
    const c=map[kind]||map.info;
    el.style.background=c[0];el.style.color=c[1];
  }

  function headers(extra){
    return Object.assign({
      apikey:CLOUD_KEY,
      'Content-Type':'application/json'
    },extra||{});
  }

  async function request(path,options){
    const opt=Object.assign({},options||{});
    opt.headers=headers(opt.headers);
    const res=await fetch(CLOUD_URL+path,opt);
    if(!res.ok){
      const txt=await res.text().catch(()=> '');
      throw new Error('Cloud HTTP '+res.status+(txt?': '+txt.slice(0,220):''));
    }
    return res;
  }

  function payloadState(){
    const p=JSON.parse(JSON.stringify(state||{}));
    // Test passwords remain local to each APK; never upload them into workshop data.
    delete p.passwords;
    return p;
  }

  function persistRemoteLocally(){
    try{
      state.users=users;
      state.passwords=passwords;
      localStorage.setItem(KEY,JSON.stringify(state));
    }catch(e){console.warn('Unable to cache cloud state locally',e)}
  }

  function normalizeRemote(remoteData){
    const localPasswords=passwords;
    state=remoteData&&typeof remoteData==='object'?remoteData:{};
    state.users=Array.isArray(state.users)?state.users:users;
    users=state.users;
    passwords=localPasswords;
    state.passwords=passwords;
    state.jobs=state.jobs||[];
    state.assign=state.assign||[];
    state.sessions=state.sessions||[];
    state.corrections=state.corrections||[];
    state.jobEdits=state.jobEdits||[];
    state.suggestedEdits=state.suggestedEdits||[];
    state.reworks=state.reworks||[];
    state.requests=state.requests||[];
    state.additionalActions=state.additionalActions||[];
    state.attentionDismissed=state.attentionDismissed||[];
    state.lastActions=state.lastActions||{};
    state.jobDeletes=state.jobDeletes||[];
    state.cancelledAssignments=state.cancelledAssignments||[];
    state.deletedJobAudit=state.deletedJobAudit||[];
    state.reworkLogs=state.reworkLogs||[];
    state.notifications=state.notifications||[];
    state.overtimeNotices=state.overtimeNotices||{};
    state.incentiveTargetMinutes=state.incentiveTargetMinutes||210*60;
  }

  async function pull(force){
    if(!navigator.onLine){status('OFFLINE — LOCAL CACHE','warn');return false}
    status('CLOUD SYNCING…','info');
    const res=await request('/rest/v1/workshop_state?id=eq.main&select=revision,data,updated_at,updated_by',{method:'GET'});
    const rows=await res.json();
    if(!rows.length)throw new Error('Shared workshop state is missing.');
    const row=rows[0];
    const remoteRev=Number(row.revision||0);
    if((force||remoteRev!==cloudRevision) && !cloudDirty){
      cloudApplying=true;
      try{
        normalizeRemote(row.data);
        cloudRevision=remoteRev;
        localStorage.setItem(REV_KEY,String(cloudRevision));
        persistRemoteLocally();
      }finally{cloudApplying=false}
      if(me)try{render()}catch(e){console.error('Render after cloud pull failed',e)}
    }
    status('CLOUD SYNCED R'+cloudRevision,'ok');
    initialDone=true;
    conflictAlerted=false;
    return true;
  }

  async function push(){
    if(cloudPushing||!cloudDirty)return;
    if(!navigator.onLine){status('OFFLINE — CHANGE QUEUED','warn');return}
    cloudPushing=true;
    status('CLOUD SAVING…','info');
    try{
      const nextRevision=cloudRevision+1;
      const res=await request('/rest/v1/workshop_state?id=eq.main&revision=eq.'+encodeURIComponent(cloudRevision),{
        method:'PATCH',
        headers:{Prefer:'return=representation'},
        body:JSON.stringify({
          revision:nextRevision,
          data:payloadState(),
          updated_at:new Date().toISOString(),
          updated_by:(me&&me.id)||'SYSTEM'
        })
      });
      const rows=await res.json();
      if(!Array.isArray(rows)||rows.length!==1){
        cloudDirty=false;
        status('CLOUD CONFLICT','bad');
        await pull(true);
        if(!conflictAlerted){
          conflictAlerted=true;
          alert('Another phone changed workshop data at the same time. Latest cloud data was loaded. Please repeat your last action.');
        }
        return;
      }
      cloudRevision=Number(rows[0].revision||nextRevision);
      localStorage.setItem(REV_KEY,String(cloudRevision));
      cloudDirty=false;
      status('CLOUD SYNCED R'+cloudRevision,'ok');
      conflictAlerted=false;
    }catch(e){
      console.error('Cloud save failed',e);
      status(navigator.onLine?'CLOUD ERROR':'OFFLINE — CHANGE QUEUED',navigator.onLine?'bad':'warn');
    }finally{cloudPushing=false}
  }

  window.cloudScheduleSave=function(){
    if(cloudApplying)return;
    cloudDirty=true;
    clearTimeout(pushTimer);
    pushTimer=setTimeout(push,180);
  };

  const coreReset=window.resetData;
  window.resetData=function(){
    alert('Reset Test Data is disabled in the All-Staff Cloud Test to protect shared workshop data.');
  };

  // Cloud setup is preconfigured in V40. If an older setup button exists, remove it.
  function removeSetupButton(){
    const b=document.getElementById('cloudSetupBtn');
    if(b&&b.parentNode)b.parentNode.remove();
  }

  async function init(force){
    removeSetupButton();
    try{
      await pull(!!force);
    }catch(e){
      console.error('Cloud initialization failed',e);
      status(navigator.onLine?'CLOUD ERROR':'OFFLINE — LOCAL CACHE',navigator.onLine?'bad':'warn');
      initialDone=true;
    }
    clearInterval(pollTimer);
    pollTimer=setInterval(async()=>{
      if(!navigator.onLine||cloudDirty||cloudPushing)return;
      try{await pull(false)}catch(e){console.warn('Cloud poll failed',e);status('CLOUD ERROR','bad')}
    },3000);
  }

  window.addEventListener('online',()=>init(false));
  window.addEventListener('offline',()=>status('OFFLINE — LOCAL CACHE','warn'));
  window.zukaitCloud={
    init,pull,push,
    configured:()=>true,
    get revision(){return cloudRevision},
    get dirty(){return cloudDirty},
    get ready(){return initialDone}
  };
  setTimeout(()=>init(true),0);
})();
