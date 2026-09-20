(function(){
  const API_URL='https://pjknotnjkufadqavcmii.supabase.co/functions/v1/workshop-api';
  const CLOUD_KEY='sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A';
  const REV_KEY='zukait_cloud_revision_v42';
  const DIRTY_KEY='zukait_cloud_dirty_v42';
  const PENDING_KEY='zukait_cloud_pending_conflict_v42';

  let cloudRevision=Number(localStorage.getItem(REV_KEY)||0)||0;
  let cloudDirty=localStorage.getItem(DIRTY_KEY)==='1';
  let cloudApplying=false;
  let cloudPushing=false;
  let pushTimer=null;
  let pollTimer=null;
  let initialDone=false;
  let conflictAlerted=false;

  function sessionToken(){return window.zukaitAuth?.getToken?.()||''}

  function status(text,kind){
    let el=document.getElementById('cloudStatus');
    if(!el){
      el=document.createElement('span');
      el.id='cloudStatus';
      el.style.cssText='float:right;margin-right:12px;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:800;background:#e5e7eb;color:#374151';
      const net=document.getElementById('net');
      if(net&&net.parentNode)net.parentNode.insertBefore(el,net);
    }
    el.textContent=text;
    const map={
      ok:['#dcfce7','#166534'],
      warn:['#fef3c7','#92400e'],
      bad:['#fee2e2','#991b1b'],
      info:['#dbeafe','#1e40af'],
      local:['#e5e7eb','#374151']
    };
    const c=map[kind]||map.local;
    el.style.background=c[0];el.style.color=c[1];
  }

  async function api(payload){
    const token=sessionToken();
    if(!token)throw new Error('NO_SESSION');
    let res;
    try{
      res=await fetch(API_URL,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'apikey':CLOUD_KEY,
          'x-zukait-session':token
        },
        body:JSON.stringify(payload)
      });
    }catch(e){
      throw new Error('NETWORK');
    }
    let body={};
    try{body=await res.json()}catch(_){}
    body._status=res.status;
    return body;
  }

  function payloadState(){
    const p=JSON.parse(JSON.stringify(state||{}));
    delete p.passwords;
    return p;
  }

  function ensureShape(){
    state.users=Array.isArray(state.users)?state.users:users;
    users=state.users;
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
    state.systemNotifications=state.systemNotifications||[];
    state.overtimeNotices=state.overtimeNotices||{};
    state.incentiveTargetMinutes=state.incentiveTargetMinutes||210*60;
  }

  function persistLocal(){
    try{
      state.users=users;
      delete state.passwords;
      localStorage.setItem(KEY,JSON.stringify(state));
    }catch(e){console.warn('Unable to cache workshop state locally',e)}
  }

  function normalizeRemote(remoteData){
    state=remoteData&&typeof remoteData==='object'?remoteData:{};
    ensureShape();
    persistLocal();
  }

  function clone(x){return JSON.parse(JSON.stringify(x))}

  function mergeById(remote,local,preferLocal){
    const out=(remote||[]).map(x=>clone(x));
    const pos=new Map(out.map((x,i)=>[String(x?.id??''),i]));
    for(const item of (local||[])){
      const id=String(item?.id??'');
      if(!id)continue;
      if(!pos.has(id)){out.push(clone(item));pos.set(id,out.length-1)}
      else if(preferLocal(item,out[pos.get(id)]))out[pos.get(id)]=clone(item);
    }
    return out;
  }

  function mergeEmployeeConflict(remote,local,emp){
    const merged=clone(remote||{});
    merged.sessions=mergeById(remote.sessions,local.sessions,(l)=>l.emp===emp);
    merged.assign=mergeById(remote.assign,local.assign,(l)=>l.emp===emp);
    const remoteReqIds=new Set((remote.requests||[]).map(x=>String(x.id)));
    merged.requests=[...(remote.requests||[]).map(clone),...(local.requests||[]).filter(x=>x.emp===emp&&!remoteReqIds.has(String(x.id))).map(clone)];
    merged.lastActions=Object.assign({},remote.lastActions||{});
    if(local.lastActions&&Object.prototype.hasOwnProperty.call(local.lastActions,emp))merged.lastActions[emp]=clone(local.lastActions[emp]);
    merged.systemNotifications=mergeById(remote.systemNotifications,local.systemNotifications,(l,r)=>l.target===emp&&l.read!==r.read);
    merged.notifications=mergeById(remote.notifications,local.notifications,(l)=>l.target===emp||l.emp===emp);
    merged.overtimeNotices=Object.assign({},remote.overtimeNotices||{},local.overtimeNotices||{});
    return merged;
  }

  async function pull(force){
    if(!sessionToken()){status('LOGIN REQUIRED','local');initialDone=true;return false}
    if(!navigator.onLine){status(cloudDirty?'OFFLINE — CHANGE QUEUED':'OFFLINE — LOCAL CACHE','warn');initialDone=true;return false}
    if(cloudDirty&&!force){status('CHANGE WAITING TO SYNC','warn');return false}
    status('SYNCING…','info');
    const before=clone(state||{});
    const r=await api({action:'load'});
    if(!r.ok){
      if(r.code==='invalid_session')status('LOGIN REQUIRED','bad');
      else status('SYNC ERROR','bad');
      throw new Error(r.code||'LOAD_FAILED');
    }
    const remoteRev=Number(r.revision||0);
    if(force||remoteRev!==cloudRevision){
      cloudApplying=true;
      try{
        normalizeRemote(r.data);
        cloudRevision=remoteRev;
        localStorage.setItem(REV_KEY,String(cloudRevision));
      }finally{cloudApplying=false}
      if(typeof window.v42AfterCloudPull==='function'){
        try{window.v42AfterCloudPull(before,clone(state),r)}catch(e){console.warn('Notification hook failed',e)}
      }
      if(me)try{render()}catch(e){console.error('Render after sync failed',e)}
    }
    status('SYNCED','ok');
    initialDone=true;
    conflictAlerted=false;
    return true;
  }

  async function push(retry=false){
    if(cloudPushing||!cloudDirty)return false;
    if(!sessionToken()){status('LOGIN REQUIRED','bad');return false}
    if(!navigator.onLine){status('OFFLINE — CHANGE QUEUED','warn');return false}
    cloudPushing=true;
    status('SAVING…','info');
    const localSnapshot=payloadState();
    try{
      const r=await api({action:'save',expected_revision:cloudRevision,data:localSnapshot});
      if(r.ok){
        cloudRevision=Number(r.revision||cloudRevision+1);
        localStorage.setItem(REV_KEY,String(cloudRevision));
        localStorage.removeItem(DIRTY_KEY);
        localStorage.removeItem(PENDING_KEY);
        cloudDirty=false;
        status('SYNCED','ok');
        conflictAlerted=false;
        return true;
      }

      if(r.code==='conflict'&&r.data){
        if(me?.role==='Employee'&&!retry){
          const merged=mergeEmployeeConflict(r.data,localSnapshot,me.id);
          cloudApplying=true;
          try{state=merged;ensureShape();persistLocal()}finally{cloudApplying=false}
          cloudRevision=Number(r.revision||cloudRevision);
          localStorage.setItem(REV_KEY,String(cloudRevision));
          cloudDirty=true;
          localStorage.setItem(DIRTY_KEY,'1');
          cloudPushing=false;
          return await push(true);
        }

        localStorage.setItem(PENDING_KEY,JSON.stringify({
          savedAt:Date.now(),user:me?.id||'',revision:cloudRevision,data:localSnapshot
        }));
        cloudDirty=false;
        localStorage.removeItem(DIRTY_KEY);
        cloudRevision=Number(r.revision||cloudRevision);
        cloudApplying=true;
        try{normalizeRemote(r.data)}finally{cloudApplying=false}
        status('SYNC CONFLICT — REVIEW','bad');
        if(me)try{render()}catch(_){}
        if(!conflictAlerted){
          conflictAlerted=true;
          alert('Another phone changed workshop data at the same moment. Latest data is shown. Your unsynced copy was saved on this phone for recovery; please repeat the last Supervisor/Manager action.');
        }
        return false;
      }

      if(r.code==='forbidden_change'){
        status('PERMISSION BLOCKED','bad');
        alert('This action is not permitted for your role. No workshop data was changed.');
        return false;
      }
      if(r.code==='invalid_session'){
        status('LOGIN REQUIRED','bad');
        alert('Your login was revoked. Please use Login again.');
        return false;
      }
      throw new Error(r.code||'SAVE_FAILED');
    }catch(e){
      console.error('Cloud save failed',e);
      cloudDirty=true;
      localStorage.setItem(DIRTY_KEY,'1');
      status(navigator.onLine?'SYNC ERROR — RETRYING':'OFFLINE — CHANGE QUEUED',navigator.onLine?'bad':'warn');
      return false;
    }finally{cloudPushing=false}
  }

  window.cloudScheduleSave=function(){
    if(cloudApplying)return;
    cloudDirty=true;
    localStorage.setItem(DIRTY_KEY,'1');
    clearTimeout(pushTimer);
    pushTimer=setTimeout(()=>push(false),220);
  };

  async function syncNow(){
    if(!navigator.onLine)return status('OFFLINE — CHANGE QUEUED','warn');
    if(cloudDirty)await push(false);
    if(!cloudDirty)await pull(true);
  }

  async function backupNow(){
    if(!me||me.role!=='Manager')return {ok:false,code:'forbidden'};
    if(cloudDirty)await push(false);
    return await api({action:'backup'});
  }
  async function backupList(){
    if(!me||me.role!=='Manager')return {ok:false,code:'forbidden'};
    return await api({action:'backup_list'});
  }

  const coreReset=window.resetData;
  window.resetData=function(){
    alert('Reset Test Data is disabled in the production pilot to protect shared workshop data.');
  };

  function removeSetupButton(){
    const b=document.getElementById('cloudSetupBtn');
    if(b&&b.parentNode)b.parentNode.remove();
  }

  async function init(force){
    removeSetupButton();
    clearInterval(pollTimer);
    if(!sessionToken()){
      status('LOGIN REQUIRED','local');
      initialDone=true;
      return false;
    }
    try{
      if(cloudDirty&&navigator.onLine)await push(false);
      if(!cloudDirty)await pull(!!force);
    }catch(e){
      console.error('Cloud initialization failed',e);
      status(navigator.onLine?'SYNC ERROR':'OFFLINE — LOCAL CACHE',navigator.onLine?'bad':'warn');
      initialDone=true;
    }
    pollTimer=setInterval(async()=>{
      if(!sessionToken()||!navigator.onLine||cloudDirty||cloudPushing)return;
      try{await pull(false)}catch(e){console.warn('Cloud poll failed',e);status('SYNC ERROR','bad')}
    },3000);
    return true;
  }

  function stop(){clearInterval(pollTimer);pollTimer=null;clearTimeout(pushTimer);pushTimer=null}

  window.addEventListener('online',()=>init(false));
  window.addEventListener('offline',()=>status(cloudDirty?'OFFLINE — CHANGE QUEUED':'OFFLINE — LOCAL CACHE','warn'));
  window.zukaitCloud={
    init,pull,push,stop,syncNow,backupNow,backupList,
    configured:()=>true,
    get revision(){return cloudRevision},
    get dirty(){return cloudDirty},
    get ready(){return initialDone},
    get pendingConflict(){try{return JSON.parse(localStorage.getItem(PENDING_KEY)||'null')}catch(_){return null}}
  };
})();