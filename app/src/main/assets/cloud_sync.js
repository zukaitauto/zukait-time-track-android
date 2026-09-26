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
  let livePollTimer=null;
  let liveInFlight=false;
  let liveStatusRows=[];
  let liveStatusRevision=0;
  let liveStatusLastFetchedAt=0;
  let liveStatusServerTime=0;
  let initialDone=false;
  let conflictAlerted=false;
  let lastSyncedState=null;
  let pullInFlight=false;
  let lastVisibleSyncAt=0;
  let lastSuccessfulSyncAt=0;
  let lastSyncError='';
  let consecutiveSyncErrors=0;

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

  async function v2PilotStatus(deviceId){
    const r=await api({action:'v2_pilot_status',device_id:String(deviceId||'').trim()});
    if(!r.ok){const e=new Error(r.code||'V2_PILOT_STATUS_FAILED');e.code=r.code||'V2_PILOT_STATUS_FAILED';throw e;}
    return r;
  }
  async function v2PilotClaim(deviceId){
    const r=await api({action:'v2_pilot_claim',device_id:String(deviceId||'').trim()});
    if(!r.ok){const e=new Error(r.code||'V2_PILOT_CLAIM_FAILED');e.code=r.code||'V2_PILOT_CLAIM_FAILED';throw e;}
    return r;
  }
  async function v2AllocateSparePartList(jobCard){
    const r=await api({action:'v2_allocate_spare_part_list',job_card:String(jobCard||'').trim().toUpperCase()});
    if(!r.ok){const e=new Error(r.code||'V2_SPARE_LIST_ALLOCATE_FAILED');e.code=r.code||'V2_SPARE_LIST_ALLOCATE_FAILED';throw e;}
    return r.list;
  }
  async function v2CommitEvent(event){
    const r=await api({action:'v2_commit_event',event});
    if(!r.ok){const e=new Error(r.code||'V2_EVENT_COMMIT_FAILED');e.code=r.code||'V2_EVENT_COMMIT_FAILED';throw e;}
    return r;
  }
  async function flushV2EventQueue(){
    const q=window.zukaitV2?.queue;if(!q||!sessionToken()||!navigator.onLine)return {synced:0,pending:q?.pending?.().length||0};
    let synced=0;
    for(const event of q.pending()){
      try{const r=await v2CommitEvent(event);q.markSynced(event.eventId,{serverTime:r.server_time,serverRevision:r.server_revision});synced++;}
      catch(e){
        const code=String(e?.code||e?.message||'V2_EVENT_COMMIT_FAILED');
        if(code==='NETWORK'||code==='TIMEOUT'||code==='NO_SESSION'){console.warn('V2 event sync deferred',event.eventId,e);break;}
        q.markConflict?.(event.eventId,code);console.warn('V2 event quarantined for reconciliation',event.eventId,code);
      }
    }
    q.compact();return {synced,pending:q.pending().length};
  }
  window.zukaitV2Transport={commitEvent:v2CommitEvent,allocateSparePartList:v2AllocateSparePartList,pilotStatus:v2PilotStatus,pilotClaim:v2PilotClaim,flush:flushV2EventQueue};

  async function v2EventPage({cursor=null,limit=100,filters={}}={}){
    const r=await api({action:'v2_event_history',before:cursor?.before||cursor||null,before_id:cursor?.before_id||null,limit:Math.max(1,Math.min(Number(limit)||100,500)),entity_id:filters.entityId||filters.entity_id||null,event_type:filters.eventType||filters.event_type||null});
    if(!r.ok)throw new Error(r.code||'V2_HISTORY_FAILED');
    const rows=Array.isArray(r.rows)?r.rows:[];
    return {rows,nextCursor:r.next_cursor||null,hasMore:!!r.next_cursor,source:'server'};
  }
  window.zukaitServerHistory={page:v2EventPage};
  window.zukaitServerRecent={page:opts=>v2EventPage({...opts,cursor:null})};

  async function v2ReportPage({report,cursor=null,limit=100,filters={}}={}){
    const r=await api({action:'v2_report_page',report:String(report||'').toUpperCase(),before:cursor?.before||cursor||null,before_id:cursor?.before_id||null,limit:Math.max(1,Math.min(Number(limit)||100,500)),filters:filters||{}});
    if(!r.ok)throw new Error(r.code||'V2_REPORT_FAILED');
    const rows=Array.isArray(r.rows)?r.rows:[];
    return {rows,nextCursor:r.next_cursor||null,hasMore:!!r.next_cursor,source:'server'};
  }
  async function v2SearchJobCards({query,cursor=null,limit=50}={}){
    const q=String(query||'').trim();
    if(!q)return {rows:[],nextCursor:null,hasMore:false,source:'empty-query'};
    const r=await api({action:'v2_search_jobcards',query:q,before:cursor?.before||cursor||null,before_id:cursor?.before_id||null,limit:Math.max(1,Math.min(Number(limit)||50,500))});
    if(!r.ok)throw new Error(r.code||'V2_JOB_SEARCH_FAILED');
    const rows=Array.isArray(r.rows)?r.rows:[];
    return {rows,nextCursor:r.next_cursor||null,hasMore:!!r.next_cursor,source:'server'};
  }
  window.zukaitServerReports={page:v2ReportPage,searchJobCards:v2SearchJobCards};

  function liveRole(){
    return !!me && (me.role==='Supervisor'||me.role==='Manager');
  }

  function publishLiveStatus(fresh){
    window.zukaitServerLive={
      rows:clone(liveStatusRows||[]),
      revision:liveStatusRevision,
      fetchedAt:liveStatusLastFetchedAt,
      serverTime:liveStatusServerTime,
      fresh:!!fresh
    };
    try{
      window.dispatchEvent(new CustomEvent('zukait-live-status',{detail:window.zukaitServerLive}));
    }catch(_){}
  }

  async function pullLiveStatus(){
    if(liveInFlight||!sessionToken()||!navigator.onLine||!liveRole())return false;
    liveInFlight=true;
    try{
      const r=await api({action:'live_status'});
      if(!r.ok)throw new Error(r.code||'LIVE_STATUS_FAILED');
      liveStatusRows=Array.isArray(r.rows)?r.rows:[];
      liveStatusRevision=Number(r.revision||0);
      liveStatusLastFetchedAt=Date.now();
      liveStatusServerTime=Number(r.server_time||0);
      publishLiveStatus(true);
      return true;
    }catch(e){
      console.warn('Authoritative live-status refresh failed',e);
      publishLiveStatus(false);
      return false;
    }finally{
      liveInFlight=false;
    }
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

  function reconcileConsumablesDuplicates(s){
    const c=s&&s.consumables;if(!c||typeof c!=='object')return s;
    function dedupe(list){
      if(!Array.isArray(list))return[];
      const seen=new Map(),out=[];
      list.forEach(row=>{
        if(!row||row.voided){out.push(row);return}
        const rid=String(row.clientRequestId||'').trim();
        const semantic=String(row.department||'')+'|'+String(row.type||'actual')+'|'+String(row.jobCard||'').toUpperCase();
        const key=rid?'request|'+rid:semantic;
        if(!seen.has(key)){seen.set(key,row);out.push(row);return}
        const keep=seen.get(key);
        if(Number(row.createdAt||row.actualAt||0)<Number(keep.createdAt||keep.actualAt||0)){
          const i=out.indexOf(keep);if(i>=0)out[i]=row;seen.set(key,row)
        }
      });
      return out
    }
    c.issues=dedupe(c.issues);
    c.actuals=dedupe(c.actuals);
    return s
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

  function employeeActionTime(x){return Number(x?.finishDeviceTime||x?.pauseDeviceTime||x?.end||x?.startDeviceTime||x?.start||0)}
  function preferEmployeeSession(localItem,remoteItem,emp){
    if(localItem?.emp!==emp)return false;
    const lt=employeeActionTime(localItem),rt=employeeActionTime(remoteItem);
    if(localItem.end&&(!remoteItem?.end||lt>=rt))return true;
    if(remoteItem?.end&&!localItem.end)return false;
    return lt>=rt;
  }
  function reconcileOfflineActionLog(data,emp){
    data.offlineActionLog=Array.isArray(data.offlineActionLog)?data.offlineActionLog:[];
    const seen=new Map();
    for(const x of data.offlineActionLog){if(!x||x.emp!==emp)continue;const k=String(x.id||[x.type,x.assignmentId,x.sessionId,x.at].join('|'));if(!seen.has(k))seen.set(k,x)}
    const other=data.offlineActionLog.filter(x=>x&&x.emp!==emp);
    data.offlineActionLog=[...other,...seen.values()].sort((a,b)=>(+a.at||0)-(+b.at||0));
    return data;
  }
  function finalizeEmployeeOfflineMarkers(data,emp){
    const pending=(data.offlineActionLog||[]).filter(x=>x&&x.emp===emp);
    const keys=new Set(pending.map(x=>String(x.assignmentId||'')));
    for(const a of (data.assign||[])){if(!a||a.emp!==emp||!keys.has(String(a.id||''))){delete a.pendingOfflineStart;delete a.pendingOfflineStartAt;delete a.pendingOfflinePause;delete a.pendingOfflinePauseAt;delete a.pendingOfflineFinish;delete a.pendingOfflineFinishAt}}
    return data;
  }
  function mergeEmployeeConflict(remote,local,emp){
    const merged=clone(remote||{});
    merged.sessions=mergeById(remote.sessions,local.sessions,(l,r)=>preferEmployeeSession(l,r,emp));
    merged.assign=mergeById(remote.assign,local.assign,(l,r)=>l.emp===emp&&Number(l.completedAt||l.pendingOfflineFinishAt||l.pendingOfflinePauseAt||l.pendingOfflineStartAt||0)>=Number(r.completedAt||r.pendingOfflineFinishAt||r.pendingOfflinePauseAt||r.pendingOfflineStartAt||0));
    const remoteReqIds=new Set((remote.requests||[]).map(x=>String(x.id)));
    merged.requests=[...(remote.requests||[]).map(clone),...(local.requests||[]).filter(x=>x.emp===emp&&!remoteReqIds.has(String(x.id))).map(clone)];
    merged.lastActions=Object.assign({},remote.lastActions||{});
    if(local.lastActions&&Object.prototype.hasOwnProperty.call(local.lastActions,emp))merged.lastActions[emp]=clone(local.lastActions[emp]);
    merged.systemNotifications=mergeById(remote.systemNotifications,local.systemNotifications,(l,r)=>l.target===emp&&l.read!==r.read);
    merged.notifications=mergeById(remote.notifications,local.notifications,(l)=>l.target===emp||l.emp===emp);
    merged.overtimeNotices=Object.assign({},remote.overtimeNotices||{},local.overtimeNotices||{});
    merged.leaves=mergeById(remote.leaves,local.leaves,(l)=>l.emp===emp);
    merged.leaveAudit=mergeById(remote.leaveAudit,local.leaveAudit,(l)=>l.by===emp);
    merged.offlineActionLog=mergeById(remote.offlineActionLog,local.offlineActionLog,(l)=>l.emp===emp);
    reconcileOfflineActionLog(merged,emp);
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
    lastSuccessfulSyncAt=Date.now();lastSyncError='';consecutiveSyncErrors=0;
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
        // New sync protocol: a server-rebased write returns the authoritative
        // merged snapshot plus server_revision. Apply it immediately so this
        // device cannot remain locally stale after a successful save.
        cloudRevision=Number(r.server_revision||r.revision||cloudRevision+1);
        localStorage.setItem(REV_KEY,String(cloudRevision));
        localStorage.removeItem(DIRTY_KEY);
        localStorage.removeItem(PENDING_KEY);
        cloudDirty=false;
        if(r.data&&typeof r.data==='object'){
          cloudApplying=true;
          try{normalizeRemote(reconcileConsumablesDuplicates(clone(r.data)))}finally{cloudApplying=false}
          if(me?.role==='Employee')finalizeEmployeeOfflineMarkers(state,me.id);
          lastSyncedState=clone(state||{});
          if(me)try{render()}catch(_){}
        }else{
          lastSyncedState=clone(localSnapshot);
        }
        status('SYNCED','ok');
        conflictAlerted=false;
        if(r.force_pull&&!r.data){
          setTimeout(()=>{if(!cloudDirty)pull(true).catch(e=>console.warn('Post-rebase refresh failed',e))},0);
        }
        return true;
      }

      if(r.code==='conflict'&&r.data){
        const remote=clone(r.data||{});
        const base=lastSyncedState?clone(lastSyncedState):clone(remote);
        const merged=me?.role==='Employee'
          ? mergeEmployeeConflict(remote,localSnapshot,me.id)
          : threeWayMerge(base,remote,localSnapshot);
        try{if(me?.role==='Employee')window.zukaitV2?.reconnectAudit?.record?.({assignmentId:'snapshot:'+me.id,employeeId:me.id,serverRevision:cloudRevision,syncState:'pending'},{assignmentId:'snapshot:'+me.id,employeeId:me.id,serverRevision:Number(r.revision||cloudRevision)},'LEGACY_CONFLICT_MERGE')}catch(e){console.warn('V2 reconnect shadow audit skipped',e)}
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
        // A full-state client can contain harmless stale fields from another device.
        // Rebase the intended local change onto the latest authoritative state once
        // for every role, then retry. This prevents one stale snapshot from putting
        // the whole workshop into a permission/reload loop.
        if(retry<2){
          try{
            const latest=await api({action:'load'});
            if(latest?.ok&&latest.data){
              const remote=clone(latest.data||{});
              const base=lastSyncedState?clone(lastSyncedState):clone(remote);
              const merged=me?.role==='Employee'
                ? mergeEmployeeConflict(remote,localSnapshot,me.id)
                : threeWayMerge(base,remote,localSnapshot);
              try{if(me?.role==='Employee')window.zukaitV2?.reconnectAudit?.record?.({assignmentId:'snapshot:'+me.id,employeeId:me.id,serverRevision:cloudRevision,syncState:'pending'},{assignmentId:'snapshot:'+me.id,employeeId:me.id,serverRevision:Number(latest.revision||cloudRevision)},'LEGACY_PERMISSION_REBASE')}catch(e){console.warn('V2 reconnect shadow audit skipped',e)}
              cloudApplying=true;
              try{state=merged;ensureShape();persistLocal()}finally{cloudApplying=false}
              cloudRevision=Number(latest.revision||cloudRevision);
              localStorage.setItem(REV_KEY,String(cloudRevision));
              lastSyncedState=remote;
              cloudDirty=true;
              localStorage.setItem(DIRTY_KEY,'1');
              status('SYNCING LATEST CHANGES…','info');
              cloudPushing=false;
              return await push(retry+1);
            }
          }catch(e){console.warn('Permission rebase failed',e)}
        }
        // Do not keep retrying an unauthorized full snapshot. Clear the dirty
        // snapshot before pulling so every device returns to one clean revision.
        cloudDirty=false;
        localStorage.removeItem(DIRTY_KEY);
        localStorage.removeItem(PENDING_KEY);
        status('REFRESHING WORKSHOP DATA…','info');
        cloudPushing=false;
        try{await pull(true)}catch(_){status('SYNC ERROR','bad')}
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
    if(liveRole())await pullLiveStatus();
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
    clearTimeout(pollTimer);
    clearTimeout(livePollTimer);
    if(!sessionToken()){
      status('LOGIN REQUIRED','local');
      initialDone=true;
      return false;
    }
    try{
      if(cloudDirty&&navigator.onLine)await push(0);
      if(!cloudDirty)await pull(!!force);
      if(liveRole())await pullLiveStatus();
    }catch(e){
      console.error('Cloud initialization failed',e);
      status(navigator.onLine?'SYNC ERROR':'OFFLINE — LOCAL CACHE',navigator.onLine?'bad':'warn');
      initialDone=true;
    }
    const pollMs=()=>document.visibilityState==='hidden'?30000:5000;
    const liveMs=()=>document.visibilityState==='hidden'?30000:3000;
    const schedulePoll=()=>{clearTimeout(pollTimer);pollTimer=setTimeout(async()=>{if(sessionToken()&&navigator.onLine&&!cloudDirty&&!cloudPushing&&!pullInFlight)try{await pull(false)}catch(e){console.warn('Cloud poll failed',e);status('SYNC ERROR','bad')}schedulePoll()},pollMs())};
    const scheduleLive=()=>{clearTimeout(livePollTimer);livePollTimer=setTimeout(()=>{if(sessionToken()&&navigator.onLine&&liveRole())pullLiveStatus();scheduleLive()},liveMs())};
    schedulePoll();scheduleLive();
    return true;
  }

  function stop(){
    clearTimeout(pollTimer);pollTimer=null;
    clearTimeout(livePollTimer);livePollTimer=null;
    clearTimeout(pushTimer);pushTimer=null;
  }


  // V100 shared-dashboard consistency: every logged-in device refreshes immediately when the app becomes visible again.
  async function refreshVisibleSharedState(){
    if(!sessionToken()||!navigator.onLine||document.visibilityState==='hidden')return;
    const ts=Date.now();if(ts-lastVisibleSyncAt<700)return;lastVisibleSyncAt=ts;
    try{
      if(cloudDirty&&!cloudPushing)await push(0);
      if(!cloudDirty&&!cloudPushing&&!pullInFlight)await pull(true);
      if(liveRole())await pullLiveStatus();
    }catch(e){console.warn('Visible shared-state refresh failed',e)}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshVisibleSharedState()});
  window.addEventListener('focus',refreshVisibleSharedState);

  window.addEventListener('online',async()=>{status(cloudDirty?'ONLINE — SYNCING QUEUED CHANGES':'ONLINE','info');try{await init(false)}catch(e){console.warn('Reconnect sync failed',e)}});
  window.addEventListener('pagehide',()=>{if(cloudDirty)try{localStorage.setItem(PENDING_KEY,JSON.stringify({savedAt:Date.now(),user:me?.id||'',revision:cloudRevision,data:payloadState()}))}catch(_){}});
  window.addEventListener('beforeunload',()=>{if(cloudDirty)try{localStorage.setItem(PENDING_KEY,JSON.stringify({savedAt:Date.now(),user:me?.id||'',revision:cloudRevision,data:payloadState()}))}catch(_){} });
  window.addEventListener('offline',()=>{
    status(cloudDirty?'OFFLINE — CHANGE QUEUED':'OFFLINE — LOCAL CACHE','warn');
    publishLiveStatus(false);
  });
  window.zukaitCloud={
    init,pull,push,pullLiveStatus,stop,syncNow,backupNow,backupList,v2CommitEvent,allocateSparePartList:v2AllocateSparePartList,v2PilotStatus,v2PilotClaim,
    configured:()=>true,
    get revision(){return cloudRevision},
    get dirty(){return cloudDirty},
    get ready(){return initialDone},
    get liveRevision(){return liveStatusRevision},
    get liveFresh(){return liveStatusLastFetchedAt>0&&Date.now()-liveStatusLastFetchedAt<7000&&navigator.onLine},
    get lastSuccessfulSyncAt(){return lastSuccessfulSyncAt},
    get lastSyncAgeMs(){return lastSuccessfulSyncAt?Math.max(0,Date.now()-lastSuccessfulSyncAt):null},
    get syncHealth(){return {online:navigator.onLine,revision:cloudRevision,dirty:cloudDirty,pushing:cloudPushing,pulling:pullInFlight,ready:initialDone,lastSuccessfulSyncAt,lastSyncAgeMs:lastSuccessfulSyncAt?Math.max(0,Date.now()-lastSuccessfulSyncAt):null,lastError:lastSyncError,consecutiveErrors:consecutiveSyncErrors,pendingConflict:!!localStorage.getItem(PENDING_KEY),liveFresh:liveStatusLastFetchedAt>0&&Date.now()-liveStatusLastFetchedAt<7000&&navigator.onLine,liveAgeMs:liveStatusLastFetchedAt?Math.max(0,Date.now()-liveStatusLastFetchedAt):null}},
    get pendingConflict(){try{return JSON.parse(localStorage.getItem(PENDING_KEY)||'null')}catch(_){return null}}
  };
})();