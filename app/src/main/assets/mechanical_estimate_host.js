// An isolated document reuses the established quote editor and calculations.
// Only scoped Mechanical reads/writes enter this document; no full-state sync.
const key='zukait_secure_session_v42',url='https://pjknotnjkufadqavcmii.supabase.co/functions/v1/',publicKey='sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A';
const notice=document.getElementById('estimate-notice'),box=document.querySelector('.modal-box');let actor=null,sessionToken='',verified=false,busy=false,companies=[];
const saved=()=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
const allowed=user=>user?.role==='Manager'||user?.id==='SUP003'&&['Supervisor','Mechanical Supervisor'].includes(user.role);
function current(){const s=saved();return verified&&navigator.onLine&&allowed(actor)&&s?.user?.id===actor.id&&s.user.role===actor.role&&String(s.token||window.AndroidBridge?.getSecureSessionToken?.()||'')===sessionToken;}
function lock(){verified=false;document.documentElement.setAttribute('data-estimate-locked','');box.replaceChildren();window.state={jobs:[],estimates:[],estimateAudit:[]};notice.textContent='Reconnect and reopen Mechanical Estimate with the same account. Saved changes are retained.';}
async function request(endpoint,body,initial=false){if(!navigator.onLine||(!initial&&!current()))throw Error('Sign in again before continuing.');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);try{const response=await fetch(url+endpoint,{method:'POST',headers:{apikey:publicKey,'Content-Type':'application/json','x-zukait-session':sessionToken},body:JSON.stringify(body),signal:controller.signal});const result=await response.json();if(!initial&&!current()){lock();throw Error('Your login changed. Reopen Mechanical Estimate.');}if(!response.ok||!result.ok)throw Error(result.code||'The server did not confirm this change.');return result;}finally{clearTimeout(timer);}}
const api=command=>request('workshop-api',{action:'mechanical_section',command});
async function refresh(){const data=await api({operation:'READ',view:'estimates'});if(!current())throw Error('Your login changed.');companies=data.companies||[];const deleted=new Set((data.estimateDraftDeletes||[]).map(d=>d.estimateId));const drafts=(window.state?.estimates||[]).filter(e=>e.status!=='Saved'&&!deleted.has(e.id)&&!data.estimates.some(x=>x.id===e.id));window.state={jobs:data.jobs,estimates:[...data.estimates,...drafts],estimateAudit:data.estimateAudit||[],estimateDraftDeletes:data.estimateDraftDeletes||[]};return data;}
function pendingKey(id){return 'zukait_mechanical_estimate_pending_v1:'+actor.id+':'+id;}
async function mutate(command){
 const storageKey=pendingKey(command.client_key);let previous=JSON.parse(localStorage.getItem(storageKey)||'null');
 if(previous){const result=await api(previous);if(result.request_id!==previous.request_id)throw Error('The saved change is still unconfirmed. Retry it.');localStorage.removeItem(storageKey);if(previous.request_id===command.request_id)return result;if(result.estimate)command.expected_revision=result.estimate.revision;}
 localStorage.setItem(storageKey,JSON.stringify(command));const result=await api(command);if(result.request_id!==command.request_id)throw Error('The saved change is still unconfirmed. Retry it.');localStorage.removeItem(storageKey);return result;
}
window.openModal=html=>{if(!current())return lock();box.innerHTML=html;window.scrollTo(0,0);};
window.closeModal=()=>{if(window.parent!==window)window.parent.postMessage({mechanicalEstimateBack:true},location.protocol==='file:'?'*':location.origin);else location.href=actor?.role==='Mechanical Supervisor'?'mechanical_supervisor.html':'offline_test.html';};
window.save=()=>{};
window.zukaitMechanicalEstimate={active:current,save:async(estimate,revision)=>{
 if(busy)throw Error('A save is already being confirmed.');busy=true;try{return (await mutate({operation:'SAVE_ESTIMATE',request_id:crypto.randomUUID(),client_key:estimate.id,estimate,expected_revision:revision,reason:'Mechanical estimate saved'})).estimate;}finally{busy=false;}
}};
window.zukaitCloud={syncNow:refresh,allocateEstimateNo:async id=>(await mutate({operation:'ALLOCATE_ESTIMATE',request_id:crypto.randomUUID(),client_key:id})).estimate};
window.zukaitReception={call:async command=>{if(!current()||command.operation!=='MASTER')throw Error('Mechanical estimate access required.');return {companies};},action:async body=>{
 if(body.action!=='estimate_delete_draft')throw Error('Mechanical estimate action required.');const entry=window.state.estimates.find(e=>e.id===body.estimate_id);
 return mutate({operation:'DELETE_DRAFT',request_id:body.request_id,client_key:body.estimate_id,expected_revision:Number(entry?.revision||0),reason:'Delete Mechanical estimate draft'});
}};
window.addEventListener('storage',event=>{if(event.key===key&&!current())lock();});window.addEventListener('offline',lock);
try{
 document.documentElement.setAttribute('data-estimate-locked','');const s=saved();actor=s?.user;if(!allowed(actor))throw Error('Mechanical Estimate access required.');sessionToken=String(s.token||window.AndroidBridge?.getSecureSessionToken?.()||'');
 const auth=await request('staff-auth',{action:'session',session_token:sessionToken},true);if(auth.user?.id!==actor.id||auth.user.role!==actor.role)throw Error('Your login changed.');actor=auth.user;verified=true;window.me=actor;window.state={jobs:[],estimates:[],estimateAudit:[]};
 await import('./v2/features/estimate/main_module.js');if(!current())throw Error('Your login changed.');document.documentElement.removeAttribute('data-estimate-locked');notice.textContent='Mechanical records only';
 // Pending commands are never replayed merely because a document reopens.
 const pending=Object.keys(localStorage).filter(k=>k.startsWith('zukait_mechanical_estimate_pending_v1:'+actor.id+':'));
 if(pending.length){notice.textContent='A previous Mechanical estimate change needs confirmation.';const retry=document.createElement('button');retry.textContent='Retry saved change';retry.onclick=async()=>{try{const command=JSON.parse(localStorage.getItem(pending[0]));await mutate(command);await refresh();await window.zukaitEstimate.openFind();notice.textContent='Saved change confirmed.';retry.remove();}catch(error){notice.textContent=error.message;}};notice.after(retry);}
 if(new URLSearchParams(location.search).get('mode')==='new'&&!pending.length){await refresh();await window.zukaitEstimate.newEstimate();}else await window.zukaitEstimate.openFind();
}catch(error){lock();notice.textContent=error.message;}
