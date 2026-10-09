(function(){
  const AUTH_URL='https://pjknotnjkufadqavcmii.supabase.co/functions/v1/staff-auth';
  const PUBLISHABLE_KEY='sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A';
  const SESSION_KEY='zukait_secure_session_v42';
  let restoring=false;
  let nativeTokenCache='';

  function secureBridge(){
    const b=window.AndroidBridge;
    return b && typeof b.saveSecureSessionToken==='function' && typeof b.getSecureSessionToken==='function' ? b : null;
  }
  function persistNative(b,t){
    try{if(b.saveSecureSessionToken(t)===false)return false;return String(b.getSecureSessionToken()||'')===t}catch(_){return false}
  }

  function savedSession(){
    try{
      const s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
      if(!s)return null;
      const b=secureBridge();
      if(s.token){
        nativeTokenCache=String(s.token);
        if(b && persistNative(b,nativeTokenCache)){
          delete s.token;
          localStorage.setItem(SESSION_KEY,JSON.stringify(s));
        }
      }
      if(b && !nativeTokenCache){try{nativeTokenCache=String(b.getSecureSessionToken()||'')}catch(_){}}
      return Object.assign({},s,{token:nativeTokenCache});
    }catch(_){return null}
  }
  function saveSession(token,user){
    if(!token||!user)return;
    nativeTokenCache=String(token);
    const b=secureBridge();
    const s={user,savedAt:Date.now()};
    if(b){
      if(!persistNative(b,nativeTokenCache))throw new Error('Secure login storage is unavailable. Please try again.');
    }else{s.token=nativeTokenCache}
    localStorage.setItem(SESSION_KEY,JSON.stringify(s));
  }
  function clearSession(){
    nativeTokenCache='';
    try{window.AndroidBridge.clearSecureSessionToken()}catch(_){}
    localStorage.removeItem(SESSION_KEY);
  }
  function token(){return savedSession()?.token||''}

  async function callAuth(payload){
    if(!navigator.onLine)throw new Error('Phone is offline. Check Wi-Fi or mobile data.');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    let res;
    try{
      res=await fetch(AUTH_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':PUBLISHABLE_KEY},
        body:JSON.stringify(payload),
        signal:controller.signal
      });
    }catch(e){
      if(e && e.name==='AbortError')throw new Error('Login server did not respond within 15 seconds. Check internet and try again.');
      throw new Error('Cannot reach the login server. Check Wi-Fi/mobile data and try again.');
    }finally{
      clearTimeout(timer);
    }
    let body={};
    try{body=await res.json()}catch(_){}
    body._status=res.status;
    return body;
  }

  function authMessage(r){
    if(r?.code==='locked')return 'Too many incorrect attempts. This User ID is locked for 10 minutes.';
    if(r?.code==='weak')return 'Password must be at least 8 characters.';
    if(r?.code==='exists')return 'That User ID already exists.';
    if(r?.code==='not_found')return 'User ID not found.';
    if(r?.code==='forbidden')return 'Manager authorization required.';
    if(r?.code==='invalid_session')return 'This saved login is no longer valid. Please login again.';
    if(r?._status>=500)return 'Login server error. Please try again.';
    return 'Invalid User ID or password.';
  }

  function passwordPrompt(title){
    const a=prompt(title+'\nMinimum 8 characters.');
    if(a===null)return null;
    if(a.length<8){alert('Password must be at least 8 characters.');return null;}
    const b=prompt('Confirm new password');
    if(b===null)return null;
    if(a!==b){alert('Passwords do not match.');return null;}
    return a;
  }

  async function forceFirstChange(id,current){
    alert('This is your temporary password. You must create your own password before continuing.');
    const np=passwordPrompt('Create your new password');
    if(np===null)return null;
    const r=await callAuth({action:'change_password',user_id:id,current_password:current,new_password:np});
    if(!r.ok){alert(authMessage(r));return null;}
    alert('Password changed successfully.');
    return r.session_token||null;
  }

  function openApp(userObj){
    if(userObj?.role==='Receptionist'){window.location.replace('receptionist.html');return;}
    me=userObj;
    window.me=userObj;window.currentUser=userObj;
    const login=document.getElementById('login');
    const app=document.getElementById('app');
    if(login)login.classList.add('hidden');
    if(app)app.classList.remove('hidden');
  }
  function showLogin(){
    me=null;
    window.me=null;window.currentUser=null;
    const app=document.getElementById('app');
    const login=document.getElementById('login');
    if(app)app.classList.add('hidden');
    if(login)login.classList.remove('hidden');
  }

  window.login=async function(){
    const id=(document.getElementById('uid')?.value||'').trim().toUpperCase();
    const p=document.getElementById('pw')?.value||'';
    if(!id||!p)return alert('Enter User ID and password.');

    const btn=document.querySelector('#login button.big-action');
    if(btn){btn.disabled=true;btn.textContent='Checking...';}
    try{
      const r=await callAuth({action:'login',user_id:id,password:p});
      if(!r.ok){alert(authMessage(r));return;}
      let sessionToken=r.session_token||'';
      if(r.must_change){
        const replacement=await forceFirstChange(id,p);
        if(!replacement)return;
        sessionToken=replacement;
      }
      saveSession(sessionToken,r.user);
      openApp(r.user);
      if(r.user?.role==='Receptionist')return;
      try{render()}catch(err){
        console.error(err);
        alert('Dashboard loading error: '+(err?.message||err));
      }
      // Do not hold the login flow while cloud state initializes.
      if(window.zukaitCloud?.init){
        Promise.resolve(window.zukaitCloud.init(true)).then(async()=>{
          try{render()}catch(_){}
          try{await window.zukaitV2?.pilot?.autoClaim?.()}catch(e){console.warn('V2 pilot auto-claim failed',e)}
        }).catch(err=>console.warn('Cloud init after login failed',err));
      }
    }catch(err){
      console.error(err);
      alert(err?.message||'Login failed.');
    }finally{
      if(btn){btn.disabled=false;btn.textContent='Login';}
      const pw=document.getElementById('pw');if(pw)pw.value='';
    }
  };

  window.quickLogin=function(){alert('Quick Login is disabled. Use your individual User ID and password.');};

  window.logout=async function(){
    const s=savedSession();
    if(s?.token && navigator.onLine){
      try{await callAuth({action:'logout',session_token:s.token})}catch(_){}
    }
    clearSession();
    if(employeeClockTimer)clearInterval(employeeClockTimer);employeeClockTimer=null;
    if(liveSupervisorTimer)clearInterval(liveSupervisorTimer);liveSupervisorTimer=null;
    showLogin();
    if(window.zukaitCloud?.stop)window.zukaitCloud.stop();
  };

  window.changeOwnPassword=async function(){
    if(!me)return;
    const current=prompt('Enter your current password');
    if(current===null)return;
    const np=passwordPrompt('Enter your new password');
    if(np===null)return;
    const r=await callAuth({action:'change_password',user_id:me.id,current_password:current,new_password:np});
    if(!r.ok)return alert(authMessage(r));
    saveSession(r.session_token,me);
    alert('Your password has been changed successfully.');
  };

  window.resetPassword=async function(id){
    if(!me||me.role!=='Manager')return alert('Manager access required.');
    const np=passwordPrompt('New temporary password for '+id);
    if(np===null)return;
    const managerPassword=prompt('Enter Manager password to confirm reset');
    if(managerPassword===null)return;
    const r=await callAuth({
      action:'manager_reset',
      manager_id:me.id,
      manager_password:managerPassword,
      target_id:id,
      new_password:np
    });
    if(!r.ok)return alert(authMessage(r));
    alert('Password reset for '+id+'. The user must change this temporary password at next login.');
  };

  window.createUserSecure=async function(){
    if(!me||me.role!=='Manager')return alert('Manager access required.');
    if(!navigator.onLine||window.zukaitServerConnection?.state==='offline')return alert('Server connection required. Check Wi-Fi/internet and wait for Server Connected, then try again.');
    const btn=document.querySelector('[data-create-user-button]');
    const id=(document.getElementById('newUserCode')?.value||'').trim().toUpperCase();
    const name=(document.getElementById('newUserName')?.value||'').trim();
    const role=document.getElementById('newUserRole')?.value||'Employee';
    let department=document.getElementById('newUserDept')?.value||'';
    const password=document.getElementById('newUserPassword')?.value||'';
    if(!id||!name||!password)return alert('Enter all required fields.');
    if(password.length<8)return alert('Initial password must be at least 8 characters.');
    if(user(id).role!=='Unknown')return alert('That User ID already exists.');
    if(role==='Purchaser')department='Spare Parts';
    if(role==='Receptionist')department='Reception';
    const managerPassword=prompt('Enter Manager password to create this user');
    if(managerPassword===null)return;
    if(!managerPassword)return alert('Enter Manager password.');
    if(btn){btn.disabled=true;btn.textContent='CREATING...';}
    try{
      const r=await callAuth({
        action:'manager_create', manager_id:me.id, manager_password:managerPassword,
        user_id:id, display_name:name, role, department, password
      });
      if(!r.ok)return alert(authMessage(r));
      if(user(id).role==='Unknown')users.push({id,name,role,department});
      save();
      if(typeof filterUserMgmt==='function')filterUserMgmt();
      alert('User created. The initial password must be changed at first login.');
    }catch(err){
      console.error('Create user failed',err);
      alert(err?.message||'User could not be created. Please check the connection and try again.');
    }finally{
      if(btn&&document.body.contains(btn)){btn.disabled=false;btn.textContent='CREATE USER';}
    }
  };
  window.addUserFromPopup=window.createUserSecure;

    window.confirmDeleteJob=async function(no){
    if(!me||me.role!=='Manager')return alert('Manager access required.');
    const j=job(no);
    if(j?.receptionNo){if(window.zukaitReception?.openCancellation)return window.zukaitReception.openCancellation(j.receptionNo);return alert('Use Reception cancellation review for this linked insurance Job Card.');}
    const pw=document.getElementById('deleteJCPassword')?.value||'';
    const reason=document.getElementById('deleteJCReason')?.value.trim()||'';
    if(!j)return;
    if(!reason)return alert('Delete reason is required.');
    if(!pw)return alert('Enter Manager password.');
    const check=await callAuth({action:'verify_password',user_id:me.id,password:pw});
    if(!check.ok)return alert('Incorrect Manager Password.');

    const snapshot={
      job:structuredClone(j),
      assign:structuredClone(state.assign.filter(a=>a.job===no)),
      sessions:structuredClone(state.sessions.filter(s=>s.job===no)),
      reworks:structuredClone((state.reworks||[]).filter(r=>r.job===no))
    };
    state.jobDeletes=state.jobDeletes||[];
    state.jobDeletes.push({job:no,vehicle:j.vehicle,reg:j.reg,deletedBy:me.id,deletedAt:now(),reason,snapshot});
    state.jobs=state.jobs.filter(x=>x.no!==no);
    state.assign=state.assign.filter(a=>a.job!==no);
    state.sessions=state.sessions.filter(x=>x.job!==no);
    state.reworks=(state.reworks||[]).filter(x=>x.job!==no);
    save();closeModal();render();
  };

  async function restoreSession(){
    if(restoring)return;
    restoring=true;
    try{
      const s=savedSession();
      if(!s?.token||!s?.user){showLogin();return false;}
      if(!navigator.onLine){
        openApp(s.user);
        if(s.user?.role==='Receptionist')return true;
        try{render()}catch(e){console.warn('Offline restore render failed',e)}
        if(window.zukaitCloud?.init)window.zukaitCloud.init(false);
        return true;
      }
      const r=await callAuth({action:'session',session_token:s.token});
      if(!r.ok && (r.code==='invalid_session'||r._status===401)){
        clearSession();showLogin();return false;
      }
      if(!r.ok)throw new Error(authMessage(r));
      saveSession(s.token,r.user);
      openApp(r.user);
      if(r.user?.role==='Receptionist')return true;
      if(window.zukaitCloud?.init)await window.zukaitCloud.init(true);
      try{render()}catch(e){console.warn('Session restore render failed',e)}
      try{await window.zukaitV2?.pilot?.autoClaim?.()}catch(e){console.warn('V2 pilot auto-claim after session restore failed',e)}
      return true;
    }catch(e){
      console.warn('Session restore check failed',e);
      const s=savedSession();
      if(s?.token && s?.user){
        openApp(s.user);
        if(s.user?.role==='Receptionist')return true;
        try{render()}catch(_){}
        return true;
      }
      showLogin();return false;
    }finally{restoring=false}
  }

  try{
    passwords={};
    delete state.passwords;
    localStorage.setItem(KEY,JSON.stringify(state));
  }catch(e){console.warn('Credential cleanup warning',e)}

  const observer=new MutationObserver(()=>{
    const app=document.getElementById('app');
    if(!app||app.classList.contains('hidden'))return;
    const row=app.querySelector(':scope > .row');
    if(row&&!document.getElementById('changePasswordBtn')){
      const b=document.createElement('button');
      b.id='changePasswordBtn';
      b.className='secondary';
      b.textContent='🔐 Change Password';
      b.onclick=()=>window.changeOwnPassword();
      const logout=[...row.querySelectorAll('button')].find(x=>(x.textContent||'').toLowerCase().includes('logout'));
      row.insertBefore(b,logout||null);
    }
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});

  window.zukaitAuth={
    getToken:()=>token(),
    getSavedUser:()=>savedSession()?.user||null,
    restoreSession,
    clearSession
  };

  setTimeout(()=>restoreSession(),50);
})();

