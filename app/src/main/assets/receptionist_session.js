(function(){
 'use strict';
 const BASE='https://pjknotnjkufadqavcmii.supabase.co/functions/v1/',KEY='sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A';
 const SESSION='zukait_secure_session_v42';
 let token='',busy=false;
 const el=id=>document.getElementById(id);
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const error=e=>{el('message').textContent=e?.message||String(e)};
 const messages={invalid:'User ID or password is incorrect.',locked:'This account is temporarily locked. Try again later.',weak:'Password must be at least 8 characters.',forbidden:'This action is not allowed for this account.',
  invalid_session:'Your session has expired. Sign in again; saved actions are retained.',receptionist_forbidden:'This action is not available in Reception.',
  work_not_finished:'Work is still pending or active. Refresh Vehicle Delivery after it is complete.',both_qc_required:'Current painting and final QC must both pass before delivery.',
  qc_conflict:'The work or QC review changed. Refresh Vehicle Delivery and review again.',job_not_available:'This Job Card is not available for delivery.',already_delivered:'This vehicle has already been delivered.',
  receptionist_vehicle_changed:'Vehicle details changed. Refresh Vehicle Delivery and confirm the current vehicle.',receptionist_request_conflict:'The saved action conflicts with its server receipt. Keep this device data and ask the Manager to reconcile it.',
  receptionist_delivery_reconcile:'Delivery history needs review. Keep the saved action and ask the Manager to reconcile it.',receptionist_live_status_unavailable:'Live staff status could not be verified. Try again or ask the Manager.'};
 const bridge=()=>window.AndroidBridge && typeof window.AndroidBridge.getSecureSessionToken==='function'&&typeof window.AndroidBridge.saveSecureSessionToken==='function'?window.AndroidBridge:null;
 function savedSession(){
  const saved=JSON.parse(localStorage.getItem(SESSION)||'null');
  return saved?{...saved,token:bridge()?String(bridge().getSecureSessionToken()||saved.token||''):saved.token||''}:null;
 }
 function saveSession(value,user){
  if(!value||user?.role!=='Receptionist')throw Error('A Receptionist account is required.');
  const b=bridge(),saved={user,savedAt:Date.now()};
  if(b){if(b.saveSecureSessionToken(value)===false||String(b.getSecureSessionToken()||'')!==value)throw Error('Secure session storage is unavailable.');}
  else saved.token=value;
  localStorage.setItem(SESSION,JSON.stringify(saved));token=value;window.me=user;
 }
 function clear(){token='';window.me=null;try{bridge()?.clearSecureSessionToken?.()}catch(_){}localStorage.removeItem(SESSION);el('identity').textContent='';el('workspace').innerHTML='';el('reception-app').classList.add('hidden');el('login').classList.remove('hidden')}
 async function request(functionName,body){
  if(!navigator.onLine)throw Error('Offline. Reconnect before confirming a server action.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(BASE+functionName,{method:'POST',headers:{'Content-Type':'application/json',apikey:KEY,'x-zukait-session':token},body:JSON.stringify(body),signal:controller.signal});
   const result=await response.json();
   if(!response.ok||!result.ok){const e=Error(messages[result.code]||'The server action could not be confirmed. Check the connection and retry the saved action.');e.code=result.code;e.status=response.status;if(functionName==='workshop-api'&&response.status===401)clear();throw e;}
   return result;
  }finally{clearTimeout(timer)}
 }
 function password(){const first=prompt('New password (at least 8 characters)');if(first===null)return null;if(first.length<8)throw Error('Password must be at least 8 characters.');if(prompt('Confirm new password')!==first)throw Error('Passwords do not match.');return first;}
 async function open(user){
  window.me=user;el('identity').textContent=user.name+' · Receptionist';el('login').classList.add('hidden');el('reception-app').classList.remove('hidden');el('message').textContent='';
  await window.zukaitReception.open();
  if(pending())el('message').textContent='A delivery awaits confirmation. Open Vehicle Delivery and confirm the saved action.';
 }
 window.openModal=html=>{el('workspace').innerHTML=html};
 window.closeModal=()=>{el('workspace').innerHTML=''};
 window.zukaitAuth={getToken:()=>token};
 el('login').onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;const button=event.currentTarget.querySelector('button');button.disabled=true;
  const id=el('user-id').value.trim().toUpperCase(),current=el('password').value;
  try{
   let result=await request('staff-auth',{action:'login',user_id:id,password:current});
   if(result.user?.role!=='Receptionist'){await request('staff-auth',{action:'logout',session_token:result.session_token});throw Error('Use a Receptionist account for this workspace.');}
   if(result.must_change){const next=password();if(next===null){await request('staff-auth',{action:'logout',session_token:result.session_token});return;}const changed=await request('staff-auth',{action:'change_password',user_id:id,current_password:current,new_password:next});result={...result,session_token:changed.session_token};}
   saveSession(result.session_token,result.user);await open(result.user);
  }catch(e){error(e)}finally{el('password').value='';button.disabled=false;busy=false}
 };
 el('logout').onclick=async()=>{const old=token;clear();if(old)try{await request('staff-auth',{action:'logout',session_token:old})}catch(e){error(Error('Local sign-out complete. Ask the Manager to revoke the old session if the server could not be reached.'))}};
 el('change-password').onclick=async()=>{try{const current=prompt('Current password');if(current===null)return;const next=password();if(next===null)return;const user=window.me;const result=await request('staff-auth',{action:'change_password',user_id:user.id,current_password:current,new_password:next});saveSession(result.session_token,user)}catch(e){error(e)}};
 el('checklists').onclick=()=>window.zukaitReception.open().catch(error);
 const journalKey=()=>{if(!window.me?.id)throw Error('Sign in first.');return 'zukait_receptionist_delivery_v1:'+BASE+':'+window.me.id};
 function pending(){const raw=localStorage.getItem(journalKey());if(!raw)return null;try{const body=JSON.parse(raw);if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['action','operation','jobCard','expectedQcRevision','expectedVehicleIdentity','request_id'].includes(k))||body.action!=='receptionist_deliver'||body.operation!=='DELIVER'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.request_id)||typeof body.expectedVehicleIdentity!=='string'||typeof body.jobCard!=='string'||!body.jobCard.trim()||!Number.isSafeInteger(body.expectedQcRevision)||body.expectedQcRevision<0)throw Error();return body;}catch(_){throw Error('The saved delivery request is unreadable. Keep this device data and ask the Manager to reconcile it.');}}
 async function deliver(body){
  if(busy)return;if(!window.me?.id){error(Error('Sign in before confirming delivery.'));return;}const key=journalKey();busy=true;
  try{
   const saved=pending();if(saved&&JSON.stringify(saved)!==JSON.stringify(body))throw Error('Confirm the saved delivery action first.');
   if(!saved)localStorage.setItem(key,JSON.stringify(body));
   const result=await request('workshop-api',body);
   if(!result.job?.delivered)throw Error('Delivery was not confirmed by the server.');
   localStorage.removeItem(key);await deliveries();
  }catch(e){
   if(['work_not_finished','both_qc_required','qc_conflict','job_not_available','already_delivered','receptionist_invalid_delivery','receptionist_request_required','receptionist_vehicle_changed'].includes(e.code))localStorage.removeItem(key);
   try{await deliveries()}catch(_){}
   error(e);
  }finally{busy=false}
 }
 async function deliveries(){
  el('message').textContent='';const saved=pending();
  const root=el('workspace');root.innerHTML='<h2>Vehicle Delivery</h2><p>Delivery requires completed work and current passing painting and final QC. VWC is a location, not delivery.</p>'+(saved?'<div class="delivery-card"><p>Delivery awaits server confirmation: '+escape(saved.jobCard)+'</p><button id="retry-delivery">Confirm Saved Delivery</button></div>':'');
  if(saved)el('retry-delivery').onclick=()=>deliver(saved);
  const result=await request('workshop-api',{action:'receptionist_delivery_list'});
  const list=document.createElement('div');root.appendChild(list);
  for(const row of result.rows||[]){
   const card=document.createElement('div');card.className='delivery-card';card.innerHTML='<h3>'+escape(row.jobCard)+' · '+escape(row.receptionNo)+'</h3><p>'+escape(row.vehicle)+' · '+escape(row.registration)+'</p><p>'+escape(row.delivered?'Delivered':row.deliveryReady?'Ready for delivery':row.stage)+'</p>';
   if(row.deliveryReady&&!saved){const button=document.createElement('button');button.textContent='Deliver Vehicle';button.onclick=()=>{if(confirm('Confirm physical delivery of '+row.jobCard+' / '+row.registration+' to the customer?'))deliver({action:'receptionist_deliver',operation:'DELIVER',jobCard:row.jobCard,expectedQcRevision:row.expectedQcRevision,expectedVehicleIdentity:row.expectedVehicleIdentity,request_id:crypto.randomUUID()})};card.appendChild(button);}
   list.appendChild(card);
  }
  if(!result.rows?.length)list.textContent='No linked vehicles to show.';
 }
 el('deliveries').onclick=()=>deliveries().catch(error);
 async function restore(){
  try{const saved=savedSession();if(!saved?.token||saved.user?.role!=='Receptionist')return;token=saved.token;const result=await request('staff-auth',{action:'session',session_token:token});saveSession(token,result.user);await open(result.user);}
  catch(e){if(e.status===401)clear();error(e)}
 }
 window.zukaitReceptionist={deliver,deliveries,pending,restore};
 window.addEventListener('online',()=>{if(!window.me)restore();else el('message').textContent='Reconnected. Confirm any saved action before starting another.'});
 window.addEventListener('offline',()=>error(Error('Offline. Server actions cannot be confirmed until reconnection.')));
 window.addEventListener('load',restore,{once:true});
})();
