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
  let lastSyncedState=null;
  let pullInFlight=false;
  let lastVisibleSyncAt=0;

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
    if(!navigator.onLine)throw new Error('NETWORK');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    let res;
    try{
      res=await fetch(API_URL,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'apikey':CLOUD_KEY,
          'x-zukait-session':token
        },
        body:JSON.stringify(payload),
        signal:controller.signal
      });
    }catch(e){
      throw new Error(e && e.name==='AbortError'?'TIMEOUT':'NETWORK');
    }finally{
      clearTimeout(timer);
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
    if(window.ZukaitConsumables&&typeof window.ZukaitConsumables.ensureState==='function')window.ZukaitConsumables.ensureState(state);
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

  function threeWayMerge(base,remote,local){
    if (same(local,base)) return clone(remote);
    if (same(remote,base)) return clone(local);
    if (Array.isArray(base)||Array.isArray(remote)||Array.isArray(local)) {
      const b=Array.isArray(base)?base:[], r=Array.isArray(remote)?remote:[], l=Array.isArray(local)?local:[];
      const idBased=[...b,...r,...l].every(x=>!x || typeof x!=='object' || Array.isArray(x) || x.id!=null);
      if(!idBased) return clone(l);
      const bm=new Map(b.filter(x=>x&&x.id!=null).map(x=>[String(x.id),x]));
      const rm=new Map(r.filter(x=>x&&x.id!=null).map(x=>[String(x.id),x]));
      const lm=new Map(l.filter(x=>x&&x.id!=null).map(x=>[String(x.id),x]));
      const ids=[...new Set([...bm.keys(),...rm.keys(),...lm.keys()])];
      const out=[];
      for(const id of ids){
        const bv=bm.get(id),rv=rm.get(id),lv=lm.get(id);
        if(bv===undefined){
          if(rv!==undefined&&lv!==undefined)out.push(threeWayMerge({},rv,lv));
          else if(lv!==undefined)out.push(clone(lv));
          else if(rv!==undefined)out.push(clone(rv));
          continue;
        }
        if(lv===undefined&&rv===undefined)continue;
        if(lv===undefined){
          if(same(rv,bv))continue;
          out.push(clone(rv));continue;
        }
        if(rv===undefined){
          if(same(lv,bv))continue;
          out.push(clone(lv));continue;
        }
        out.push(threeWayMerge(bv,rv,lv));
      }
      return out;
    }
    const bObj=base&&typeof base==='object',rObj=remote&&typeof remote==='object',lObj=local&&typeof local==='object';
    if(bObj&&rObj&&lObj){
      const out={};
      const keys=new Set([...Object.keys(base||{}),...Object.keys(remote||{}),...Object.keys(local||{})]);
      for(const k of keys){
        const bv=base?.[k],rv=remote?.[k],lv=local?.[k];
        if(lv===undefined&&rv===undefined)continue;
        if(lv===undefined){
          if(same(rv,bv))continue;
          out[k]=clone(rv);continue;
        }
        if(rv===undefined){
          if(same(lv,bv))continue;
          out[k]=clone(lv);continue;
        }
        out[k]=threeWayMerge(bv,rv,lv);
      }
      return out;
    }
    return clone(local);
  }

  function nativeNotify(title,message){
    try{if(window.AndroidBridge&&typeof AndroidBridge.notify==='function')AndroidBridge.notify(String(title||'Zukait Time Track'),String(message||''));}catch(_){}
  }
  window.v42AfterCloudPull=function(before,after){
    if(!me)return;
    const oldAssign=new Set((before?.assign||[]).filter(a=>a&&a.emp===me.id&&!a.cancelled).map(a=>String(a.id)));
    const newAssign=(after?.assign||[]).filter(a=>a&&a.emp===me.id&&!a.cancelled&&!a.completed&&!oldAssign.has(String(a.id)));
    for(const a of newAssign){const j=(after?.jobs||[]).find(x=>x.no===a.job)||{};nativeNotify('New Job Assigned',a.job+(j.vehicle?' — '+j.vehicle:'')+(j.reg?' · '+j.reg:''));}
    if(me.role==='Supervisor'||me.role==='Manager'){
      const oldReq=new Set((before?.requests||[]).map(r=>String(r.id)));
      const newReq=(after?.requests||[]).filter(r=>r&&r.status==='New'&&!oldReq.has(String(r.id)));
      for(const r of newReq){const u=(after?.users||[]).find(x=>x.id===r.emp)||{};nativeNotify('New Employee Request',(u.name||r.emp)+' — '+r.job+(r.message?' — '+r.message:''));}
    }
  };

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

  function reconcileEmployeeOpenSessions(data,emp){
    data.sessions=Array.isArray(data.sessions)?data.sessions:[];
    const open=data.sessions.filter(s=>s&&s.emp===emp&&!s.end).sort((a,b)=>(+b.start||0)-(+a.start||0)||String(b.id||'').localeCompare(String(a.id||'')));
    if(open.length<=1)return data;
    const keep=open[0],cut=Math.max(+keep.start||Date.now(),Date.now());
    for(const s of open.slice(1)){
      s.end=cut;s.paused=true;s.multiDeviceClosed=true;s.closeReason='MULTI_DEVICE_CONFLICT';
    }
    data.multiDeviceAudit=Array.isArray(data.multiDeviceAudit)?data.multiDeviceAudit:[];
    data.multiDeviceAudit.push({id:'md-'+Date.now()+'-'+emp,emp,keptSession:keep.id,closedSessions:open.slice(1).map(s=>s.id),at:Date.now()});
    return data;
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
    merged.leaves=mergeById(remote.leaves,local.leaves,(l)=>l.emp===emp);
    merged.leaveAudit=mergeById(remote.leaveAudit,local.leaveAudit,(l)=>l.by===emp);
    return reconcileEmployeeOpenSessions(merged,emp);
  }

  async function pull(force){
    if(pullInFlight)return false;
    if(!sessionToken()){status('LOGIN REQUIRED','local');initialDone=true;return false}
    if(!navigator.onLine){status(cloudDirty?'OFFLINE — CHANGE QUEUED':'OFFLINE — LOCAL CACHE','warn');initialDone=true;return false}
    if(cloudDirty&&!force){status('CHANGE WAITING TO SYNC','warn');return false}
    status('SYNCING…','info');
    pullInFlight=true;
    const before=clone(state||{});
    let r;
    try{r=await api({action:'load'})}finally{pullInFlight=false}
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
      lastSyncedState=clone(state||{});
      if(me)try{render()}catch(e){console.error('Render after sync failed',e)}
    } else if(!lastSyncedState) {
      lastSyncedState=clone(state||{});
    }
    status('SYNCED','ok');
    initialDone=true;
    conflictAlerted=false;
    return true;
  }

  async function push(retry=0){
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
        lastSyncedState=clone(localSnapshot);
        conflictAlerted=false;
        return true;
      }

      if(r.code==='conflict'&&r.data){
        const remote=clone(r.data||{});
        const base=lastSyncedState?clone(lastSyncedState):clone(remote);
        const merged=me?.role==='Employee'
          ? mergeEmployeeConflict(remote,localSnapshot,me.id)
          : threeWayMerge(base,remote,localSnapshot);
        cloudApplying=true;
        try{state=merged;ensureShape();persistLocal()}finally{cloudApplying=false}
        cloudRevision=Number(r.revision||cloudRevision);
        localStorage.setItem(REV_KEY,String(cloudRevision));
        lastSyncedState=remote;
        cloudDirty=true;
        localStorage.setItem(DIRTY_KEY,'1');
        status('SYNCING LATEST CHANGES…','info');
        if(me)try{render()}catch(_){}
        if(retry<3){
          cloudPushing=false;
          return await push(retry+1);
        }
        localStorage.setItem(PENDING_KEY,JSON.stringify({savedAt:Date.now(),user:me?.id||'',revision:cloudRevision,data:merged}));
        status('SYNC BUSY — RETRYING','warn');
        setTimeout(()=>{if(cloudDirty&&!cloudPushing)push(0)},700);
        return false;
      }

      if(r.code==='id001_update_required'){
        // The server rejected a legacy ID001 state. Discard the unsafe local queue and reload the clean shared state.
        cloudDirty=false;
        localStorage.removeItem(DIRTY_KEY);
        localStorage.removeItem(PENDING_KEY);
        status('RELOADING SAFE ID001 STATE…','info');
        cloudPushing=false;
        try{await pull(true)}catch(_){status('SYNC ERROR','bad')}
        return false;
      }

      if(r.code==='forbidden_change'){
        if(me?.role==='Employee'&&retry<2){
          try{
            const latest=await api({action:'load'});
            if(latest?.ok&&latest.data){
              const merged=mergeEmployeeConflict(latest.data,localSnapshot,me.id);
              cloudApplying=true;
              try{state=merged;ensureShape();persistLocal()}finally{cloudApplying=false}
              cloudRevision=Number(latest.revision||cloudRevision);
              localStorage.setItem(REV_KEY,String(cloudRevision));
              lastSyncedState=clone(latest.data);
              cloudDirty=true;
              localStorage.setItem(DIRTY_KEY,'1');
              status('SYNCING LATEST CHANGES…','info');
              cloudPushing=false;
              return await push(retry+1);
            }
          }catch(_){}
        }
        status('PERMISSION BLOCKED','bad');
        alert('This action could not be saved. Latest workshop data will be reloaded.');
        try{await pull(true)}catch(_){}
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
    pushTimer=setTimeout(()=>push(0),100);
  };

  async function syncNow(){
    if(!navigator.onLine)return status('OFFLINE — CHANGE QUEUED','warn');
    if(cloudDirty)await push(0);
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

  window.cloudSyncNow=syncNow;
  window.cloudBackupNow=backupNow;
  window.cloudBackupList=backupList;

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
      if(cloudDirty&&navigator.onLine)await push(0);
      if(!cloudDirty)await pull(!!force);
    }catch(e){
      console.error('Cloud initialization failed',e);
      status(navigator.onLine?'SYNC ERROR':'OFFLINE — LOCAL CACHE',navigator.onLine?'bad':'warn');
      initialDone=true;
    }
    pollTimer=setInterval(async()=>{
      if(!sessionToken()||!navigator.onLine||cloudDirty||cloudPushing||pullInFlight)return;
      try{await pull(false)}catch(e){console.warn('Cloud poll failed',e);status('SYNC ERROR','bad')}
    },1000);
    return true;
  }

  function stop(){clearInterval(pollTimer);pollTimer=null;clearTimeout(pushTimer);pushTimer=null}


  // V100 shared-dashboard consistency: every logged-in device refreshes immediately when the app becomes visible again.
  async function refreshVisibleSharedState(){
    if(!sessionToken()||!navigator.onLine||document.visibilityState==='hidden')return;
    const ts=Date.now();if(ts-lastVisibleSyncAt<700)return;lastVisibleSyncAt=ts;
    try{
      if(cloudDirty&&!cloudPushing)await push(0);
      if(!cloudDirty&&!cloudPushing&&!pullInFlight)await pull(true);
    }catch(e){console.warn('Visible shared-state refresh failed',e)}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshVisibleSharedState()});
  window.addEventListener('focus',refreshVisibleSharedState);

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