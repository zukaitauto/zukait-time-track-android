(function(){
  'use strict';
  // A document is never trusted merely because it has a saved token or DOM.
  let generation=0,locked=true;
  const controllers=new Set(),root=document.documentElement;
  const style=document.createElement('style');
  style.textContent='html[data-session-locked] body>*{display:none!important}html[data-session-locked] body>#sessionPrivacyScreen{display:block!important}#sessionPrivacyScreen{display:none;padding:32px;font:18px system-ui;background:white;color:#172b3a;position:fixed;inset:0;z-index:2147483647}';
  document.head.appendChild(style);
  function screen(message){
    let panel=document.getElementById('sessionPrivacyScreen');
    if(!panel&&document.body){
      panel=document.createElement('div');panel.id='sessionPrivacyScreen';panel.setAttribute('role','status');
      const text=document.createElement('p');text.id='sessionPrivacyMessage';panel.appendChild(text);
      const retry=document.createElement('button');retry.textContent='Reconnect';retry.onclick=()=>location.reload();panel.appendChild(retry);
      const logout=document.createElement('button');logout.textContent='Sign out';logout.onclick=()=>signOut();panel.appendChild(logout);
      document.body.appendChild(panel);
    }
    const text=document.getElementById('sessionPrivacyMessage');if(text)text.textContent=message;
  }
  function lock(message='Connection unavailable. Reconnect to verify your session.'){
    locked=true;root.setAttribute('data-session-locked','');screen(message);
  }
  function unlock(){if(!navigator.onLine)return;locked=false;root.removeAttribute('data-session-locked');}
  function invalidate(){generation++;for(const c of controllers)c.abort();controllers.clear();lock();}
  const identity=()=>{try{const s=JSON.parse(localStorage.getItem('zukait_secure_session_v42')||'null');return JSON.stringify([s?.user?.id,s?.user?.role,s?.token||window.AndroidBridge?.getSecureSessionToken?.()||'']);}catch(_){return '';}};
  const originalFetch=window.fetch.bind(window);
  window.fetch=async function(input,options={}){
    const url=String(input?.url||input);
    if(!url.startsWith('https://pjknotnjkufadqavcmii.supabase.co/functions/v1/'))return originalFetch(input,options);
    if(!navigator.onLine)throw Error('CONNECTION_UNAVAILABLE');
    if(locked&&url.endsWith('/workshop-api')){
      const payload=JSON.parse(options.body||'{}'),action=payload.action;
      const receptionRead=action==='reception'&&['MASTER','STAFF','CAPABILITIES','LIST','GET'].includes(payload.command?.operation);
      if(!receptionRead&&!['load','revision','live_status','accountant_dashboard','accountant_report','receptionist_delivery_list','receptionist_live_status','reception_list','reception_get','reception_dashboard'].includes(action))throw Error('SESSION_NOT_READY');
    }
    const ticket=generation,actor=identity(),controller=new AbortController();controllers.add(controller);
    const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    const check=()=>{if(ticket!==generation||actor!==identity()||!navigator.onLine)throw Error('STALE_SESSION');};
    try{
      const response=await originalFetch(input,{...options,signal:controller.signal,cache:'no-store'});check();
      const json=response.json.bind(response);
      response.json=async()=>{try{const body=await json();check();if((response.status>=500||body?.code==='invalid_session')&&url.endsWith('/workshop-api'))lock('Server or session unavailable. Reconnect to verify your session.');return body;}catch(error){if(ticket===generation&&url.endsWith('/workshop-api'))lock();throw error;}finally{controllers.delete(controller);options.signal?.removeEventListener('abort',abort);}};
      return response;
    }catch(error){controllers.delete(controller);options.signal?.removeEventListener('abort',abort);if(url.endsWith('/workshop-api')&&ticket===generation)lock();throw error;}
  };
  // These are device settings or account-scoped idempotency journals, not a
  // renderable workshop cache. Retain journals to reconcile uncertain commits.
  function retained(key){return ['zukait_device_id','zukaitDeviceId','zukait_device_id_v42','zukait_v2_pilot_device','zukait_mechanical_device_v1'].includes(key)||/^(zukait_mechanical_pending_v1:|zukait_mechanical_tracking_pending_v1:|zukait_mechanical_delivery_pending_v1:|zukait_accountant_pending_v1:|zukait_receptionist_delivery_v1:|zukait_reception_unconfirmed_v1:|zukait_reception_estimate_pending:|zukait_quick_checklist_v1:|zukait_reception_promise_pending:)/.test(key);}
  function clearCachedStorage(){
    for(const key of Object.keys(localStorage))if(/^zukait/i.test(key)&&!retained(key)&&key!=='zukait_secure_session_v42')localStorage.removeItem(key);
    sessionStorage.clear();
  }
  async function clearPersistentCaches(){
    clearCachedStorage();
    if(navigator.serviceWorker?.getRegistrations)for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister();
    if(window.caches)for(const key of await caches.keys())await caches.delete(key);
    if(window.indexedDB&&!indexedDB.databases)throw Error('Device storage cleanup requires a newer Android System WebView. Update WebView and retry sign-out.');
    if(window.indexedDB?.databases)for(const db of await indexedDB.databases())if(db.name)await new Promise((resolve,reject)=>{
      const request=indexedDB.deleteDatabase(db.name);request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close other app windows and retry sign-out.'));
    });
    if(window.AndroidBridge?.clearPrivateWebData)await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Device cleanup did not finish. Restart the app before signing in.')),10000);
      window.zukaitPrivateDataCleared=success=>{clearTimeout(timer);if(success===false)reject(Error('Private device files could not be cleared. Restart the app and retry sign-out.'));else resolve();};window.AndroidBridge.clearPrivateWebData();
    });
  }
  async function signOut(){
    invalidate();window.zukaitCloud?.stop?.();
    let token='';try{const s=JSON.parse(localStorage.getItem('zukait_secure_session_v42')||'null');token=s?.token||window.AndroidBridge?.getSecureSessionToken?.()||'';}catch(_){}
    localStorage.removeItem('zukait_secure_session_v42');try{window.AndroidBridge?.clearSecureSessionToken?.();}catch(_){}
    // Revoke independently: local privacy must not wait for a slow network.
    if(token&&navigator.onLine)originalFetch('https://pjknotnjkufadqavcmii.supabase.co/functions/v1/staff-auth',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json',apikey:'sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A'},body:JSON.stringify({action:'logout',session_token:token})}).catch(()=>{});
    try{
      await clearPersistentCaches();
      // Destroy every module closure, timer, detached DOM and in-flight caller.
      location.replace(location.hostname==='appassets.androidplatform.net'||location.protocol==='file:'?'offline_test.html':'index.html');
    }catch(e){lock(e.message);}
  }
  window.zukaitSessionPrivacy={lock,unlock,invalidate,signOut,clearCachedStorage,get generation(){return generation},get locked(){return locked}};
  lock('Verifying session and server connection…');
  document.addEventListener('DOMContentLoaded',()=>{if(locked)screen(navigator.onLine?'Verifying session and server connection…':'Connection unavailable. Reconnect to verify your session.');});
  window.addEventListener('offline',()=>{invalidate();window.zukaitCloud?.stop?.();});
  // A fresh document verifies identity and reloads the snapshot on reconnect.
  window.addEventListener('online',()=>{if(locked)location.reload();});
  window.addEventListener('pageshow',event=>{if(event.persisted){invalidate();location.reload();}});
  window.addEventListener('storage',event=>{if(event.key===null||event.key==='zukait_secure_session_v42'){invalidate();location.reload();}});
})();
