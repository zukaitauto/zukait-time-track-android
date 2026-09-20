(function(){
  const CFG_KEY='zukait_cloud_config_v1';
  const REV_KEY='zukait_cloud_revision_v1';
  let cloudConfig={url:'',key:''};
  let cloudRevision=Number(localStorage.getItem(REV_KEY)||0)||0;
  let cloudDirty=false;
  let cloudApplying=false;
  let cloudPushing=false;
  let pushTimer=null;
  let pollTimer=null;
  let initialDone=false;
  let conflictAlerted=false;

  function readConfig(){
    try{
      const saved=JSON.parse(localStorage.getItem(CFG_KEY)||'{}');
      cloudConfig={
        url:String(saved.url||'').trim().replace(/\/$/,''),
        key:String(saved.key||'').trim()
      };
    }catch(_){cloudConfig={url:'',key:''}}
    return cloudConfig;
  }

  function configured(){
    const c=readConfig();
    return /^https:\/\/.+\.supabase\.co$/i.test(c.url) && (c.key.startsWith('sb_publishable_') || c.key.startsWith('eyJ'));
  }

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
      info:['#dbeafe','#1e40af'],
      local:['#e5e7eb','#374151']
    };
    const c=map[kind]||map.local;
    el.style.background=c[0];el.style.color=c[1];
  }

  function injectSetupButton(){
    if(document.getElementById('cloudSetupBtn'))return;
    const login=document.getElementById('login');
    if(!login)return;
    const p=document.createElement('p');
    p.innerHTML='<button id="cloudSetupBtn" class="secondary" type="button">☁ Cloud Setup</button> <span id="cloudSetupHint" class="small muted"></span>';
    login.appendChild(p);
    document.getElementById('cloudSetupBtn').onclick=()=>window.openCloudSetup();
    refreshSetupHint();
  }

  function refreshSetupHint(){
    const h=document.getElementById('cloudSetupHint');
    if(!h)return;
    h.textContent=configured()?'Cloud configuration saved on this phone.':'Not configured — app runs local only.';
  }

  function headers(extra){
    const h=Object.assign({'apikey':readConfig().key,'Content-Type':'application/json'},extra||{});
    // Legacy anon keys are JWTs and may also be sent as Bearer tokens.
    if(cloudConfig.key.startsWith('eyJ'))h['Authorization']='Bearer '+cloudConfig.key;
    return h;
  }

  async function request(path,options){
    const c=readConfig();
    const opt=Object.assign({},options||{});
    opt.headers=headers(opt.headers);
    const res=await fetch(c.url+path,opt);
    if(!res.ok){
      const txt=await res.text().catch(()=> '');
      throw new Error('Cloud HTTP '+res.status+(txt?': '+txt.slice(0,220):''));
    }
    return res;
  }

  function payloadState(){
    const p=JSON.parse(JSON.stringify(state||{}));
    // V39 does not put workshop passwords into the cloud JSON.
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
    state.notifications=state.notifications||[];
  }

  async function pull(force){
    if(!configured()){status('LOCAL ONLY','local');initialDone=true;return false}
    if(!navigator.onLine){status('OFFLINE — LOCAL CACHE','warn');return false}
    status('CLOUD SYNCING…','info');
    const res=await request('/rest/v1/workshop_state?id=eq.main&select=revision,data,updated_at,updated_by',{method:'GET'});
    const rows=await res.json();
    if(!rows.length){
      cloudRevision=0;
      localStorage.setItem(REV_KEY,'0');
      await push(true);
      initialDone=true;
      return true;
    }
    const row=rows[0];
    const remoteRev=Number(row.revision||0);
    if((force||remoteRev>cloudRevision) && !cloudDirty){
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

  async function push(firstCreate){
    if(cloudPushing||!cloudDirty&&!firstCreate)return;
    if(!configured()){status('LOCAL ONLY','local');return}
    if(!navigator.onLine){status('OFFLINE — CHANGE QUEUED','warn');return}
    cloudPushing=true;
    status('CLOUD SAVING…','info');
    try{
      const expected=firstCreate?0:cloudRevision;
      const res=await request('/rest/v1/rpc/zukait_save_workshop_state',{
        method:'POST',
        body:JSON.stringify({
          p_expected_revision:expected,
          p_data:payloadState(),
          p_changed_by:(me&&me.id)||'SYSTEM'
        })
      });
      const result=await res.json();
      if(!result||result.ok!==true){
        cloudDirty=false;
        status('CLOUD CONFLICT','bad');
        await pull(true);
        if(!conflictAlerted){
          conflictAlerted=true;
          alert('Another phone changed workshop data at the same time. Latest cloud data was loaded. Please repeat your last action.');
        }
        return;
      }
      cloudRevision=Number(result.revision||cloudRevision+1);
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
    if(cloudApplying||!configured())return;
    cloudDirty=true;
    clearTimeout(pushTimer);
    pushTimer=setTimeout(()=>push(false),180);
  };

  window.openCloudSetup=async function(){
    const current=readConfig();
    const url=prompt('Supabase Project URL\nExample: https://xxxx.supabase.co',current.url||'');
    if(url===null)return;
    const key=prompt('Supabase Publishable Key\nUse sb_publishable_... (never use a secret key).',current.key||'');
    if(key===null)return;
    const cleanUrl=String(url).trim().replace(/\/$/,'');
    const cleanKey=String(key).trim();
    if(!/^https:\/\/.+\.supabase\.co$/i.test(cleanUrl))return alert('Invalid Supabase project URL.');
    if(!(cleanKey.startsWith('sb_publishable_')||cleanKey.startsWith('eyJ')))return alert('Use a Supabase publishable key (or legacy anon key). Never enter a secret/service-role key.');
    localStorage.setItem(CFG_KEY,JSON.stringify({url:cleanUrl,key:cleanKey}));
    cloudRevision=0;localStorage.setItem(REV_KEY,'0');
    refreshSetupHint();
    await init(true);
  };

  const coreReset=window.resetData;
  window.resetData=function(){
    if(configured())return alert('Reset Test Data is disabled while Cloud Mode is active, to protect the shared workshop data.');
    return coreReset.apply(this,arguments);
  };

  async function init(force){
    injectSetupButton();
    readConfig();
    if(!configured()){
      status('LOCAL ONLY','local');
      initialDone=true;
      refreshSetupHint();
      return;
    }
    try{await pull(!!force)}
    catch(e){console.error('Cloud initialization failed',e);status('CLOUD ERROR','bad');initialDone=true}
    clearInterval(pollTimer);
    pollTimer=setInterval(async()=>{
      if(!configured()||!navigator.onLine||cloudDirty||cloudPushing)return;
      try{await pull(false)}catch(e){console.warn('Cloud poll failed',e);status('CLOUD ERROR','bad')}
    },3000);
    refreshSetupHint();
  }

  window.addEventListener('online',()=>init(false));
  window.addEventListener('offline',()=>status(configured()?'OFFLINE — LOCAL CACHE':'LOCAL ONLY',configured()?'warn':'local'));
  window.zukaitCloud={init,pull,push,configured,get revision(){return cloudRevision},get dirty(){return cloudDirty},get ready(){return initialDone}};
  setTimeout(()=>init(false),0);
})();
