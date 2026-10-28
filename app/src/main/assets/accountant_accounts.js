(function(){'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cfg=window.ZUKAIT_ACCOUNTANT_CONFIG||{},url=cfg.url||'https://pjknotnjkufadqavcmii.supabase.co',key=cfg.key||'sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A';let busy=false,retry=null,auditOffset=0,roster=null,rosterOwner=null,rosterToken=null,rosterLoading=false,rosterHost=null,openGeneration=0,retryIdentity=null;
const current=()=> (typeof me!=='undefined'&&me)||window.me;
const token=()=>window.zukaitAuth?.getToken?.()||'';
const identity=()=>current()?.role==='Manager'?JSON.stringify([current().id,token()]):null;
function scopeRetry(){const id=identity();if(retryIdentity!==id){retry=null;retryIdentity=id;}}
function viewStamp(){const host=document.getElementById('modal');return {host,child:host?.firstChild,className:host?.className};}
function sameView(v){return !!v.host&&v.host===document.getElementById('modal')&&v.host.firstChild===v.child&&v.host.className===v.className;}
const msg=t=>{const e=document.getElementById('acc-manager-message');if(e)e.textContent=t};
async function request(command,payload=null){const user=current();if(user?.role!=='Manager')throw Error('Manager access required');const t=token(),owner=user.id;if(!t)throw Error('Sign in required');const body=payload||{action:'manager_accountant',session_token:t,request_id:crypto.randomUUID(),command};const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);let r;try{r=await fetch(url+'/functions/v1/staff-auth',{method:'POST',headers:{'Content-Type':'application/json',apikey:key},body:JSON.stringify(body),signal:c.signal})}finally{clearTimeout(timer)}const result=await r.json();if(current()?.id!==owner||current()?.role!=='Manager'||token()!==t)throw Error('Account changed');if(!r.ok||!result.ok)throw Object.assign(new Error(result.code||'Account request unavailable'),{status:r.status});return result;}
function auditTable(rows){return '<div style="overflow:auto"><table><tr><th>Date</th><th>Account</th><th>Operation</th><th>Manager</th><th>Old</th><th>New</th><th>Reason</th></tr>'+rows.map(a=>'<tr><td>'+esc(new Date(a.created_at).toLocaleString('en-GB',{timeZone:'Asia/Muscat'}))+'</td><td>'+esc(a.target_id)+'</td><td>'+esc(a.operation)+'</td><td>'+esc(a.actor_id)+'</td><td>'+esc(JSON.stringify(a.old_value))+'</td><td>'+esc(JSON.stringify(a.new_value))+'</td><td>'+esc(a.reason)+'</td></tr>').join('')+'</table></div>';}
async function open(){if(current()?.role!=='Manager')return;scopeRetry();const ticket=++openGeneration,view=viewStamp(),roleAtStart=current().id;try{const r=await request({operation:'LIST',audit_offset:auditOffset});if(current()?.id!==roleAtStart||ticket!==openGeneration||!sameView(view))return;window.openModal('<section id="accountant-accounts"><div class="section-title"><h2>User Management · Accountant Accounts</h2><button type="button" id="acc-back">← User Management</button><button type="button" onclick="closeModal()">Close</button></div><p>Accountant role · Accounts department · password change required at first login. Login changes keep the original internal ID and financial history.</p><p id="acc-manager-message" role="status"></p><form id="acc-create"><div class="grid"><label>Name<input id="acc-name" required maxlength="200"></label><label>Unique login ID<input id="acc-login" required maxlength="40" pattern="[A-Za-z0-9_-]+"></label><label>Temporary password<input id="acc-password" type="password" required minlength="8" autocomplete="new-password"></label><label>Reason<input id="acc-create-reason" required minlength="3" maxlength="2000"></label></div><button type="submit">Create Accountant</button></form><h3>Accountant accounts</h3><div style="overflow:auto"><table><tr><th>Internal ID</th><th>Login ID</th><th>Name</th><th>Status</th><th>Password</th><th>Actions</th></tr>'+r.accounts.map(a=>'<tr><td>'+esc(a.id)+'</td><td>'+esc(a.login_id)+'</td><td>'+esc(a.name)+'</td><td>'+(a.active?'Active':'Inactive')+'</td><td>'+(a.must_change?'Change required':'Set')+'</td><td><button type="button" data-op="RESET" data-id="'+esc(a.id)+'">Reset password</button><button type="button" data-op="RENAME" data-id="'+esc(a.id)+'">Change login ID</button><button type="button" data-op="ACTIVE" data-active="'+(!a.active)+'" data-id="'+esc(a.id)+'">'+(a.active?'Deactivate':'Activate')+'</button></td></tr>').join('')+'</table></div><h3>Account-management audit history</h3>'+auditTable(r.audit)+'<button type="button" id="acc-audit-previous" '+(auditOffset===0?'disabled':'')+'>Newer audit entries</button><button type="button" id="acc-audit-next" '+(r.audit.length<200?'disabled':'')+'>Older audit entries</button><button type="button" id="acc-retry" '+(retry?'':'hidden')+'>Retry previous account request</button></section>');
 document.getElementById('acc-back').onclick=()=>window.openUserManagement?.();
 document.getElementById('acc-audit-next').onclick=()=>{auditOffset+=200;open()};document.getElementById('acc-audit-previous').onclick=()=>{auditOffset=Math.max(0,auditOffset-200);open()};
 document.getElementById('acc-create').onsubmit=e=>{e.preventDefault();const login=document.getElementById('acc-login').value.trim().toUpperCase();mutate({operation:'CREATE',target_id:login,login_id:login,name:document.getElementById('acc-name').value.trim(),temporary_password:document.getElementById('acc-password').value,reason:document.getElementById('acc-create-reason').value.trim()});};
 document.getElementById('accountant-accounts').onclick=e=>{const b=e.target.closest('[data-op]');if(!b)return;const c={operation:b.dataset.op,target_id:b.dataset.id};if(c.operation==='RESET'){const p=prompt('New temporary password (at least 8 characters)');if(p===null)return;if(p.length<8)return msg('Minimum 8 characters required.');c.temporary_password=p;}if(c.operation==='RENAME'){const login=prompt('New login ID. The internal account ID and audit history will stay unchanged.');if(!login)return;c.login_id=login.trim().toUpperCase();}if(c.operation==='ACTIVE')c.active=b.dataset.active==='true';const reason=prompt('Reason for this account change?');if(!reason||reason.trim().length<3)return;c.reason=reason.trim();mutate(c);};
 document.getElementById('acc-retry').onclick=()=>mutate(retry?.command,retry);
 }catch(e){if(ticket!==openGeneration||!sameView(view)||current()?.id!==roleAtStart)return;msg(e.message);if(!document.getElementById('accountant-accounts'))window.alert(e.message)}}
async function mutate(command,payload=null){scopeRetry();if(busy||!command||current()?.role!=='Manager')return;const view=viewStamp(),owner=identity();if(retry&&!payload)return msg('Retry the previous request before another account change.');busy=true;const body=payload||{action:'manager_accountant',session_token:token(),request_id:crypto.randomUUID(),command};retry=body;try{msg('Waiting for the server…');await request(command,body);retry=null;roster=null;rosterHost=null;if(sameView(view)&&identity()===owner){await open();msg('Account change confirmed. Existing sessions were revoked.');}}catch(e){if(identity()!==owner){scopeRetry();return;}if(e.status>=400&&e.status<500)retry=null;if(!sameView(view))return;msg(e.message);const b=document.getElementById('acc-retry');if(b)b.hidden=!retry;}finally{busy=false;}}
function dashboardEntry(){
 if(typeof document==='undefined'||!document?.documentElement)return;
 for(const row of document.querySelectorAll('[data-accounts-row]')){const root=row.closest('#managerView');if(current()?.role!=='Manager'||!root||root.classList.contains('hidden')||!row.querySelector('[data-rc-menu]'))row.remove();}
 if(current()?.role!=='Manager')return;
 if(!document.getElementById('manager-department-row-style')){
  const style=document.createElement('style');style.id='manager-department-row-style';style.textContent=`
  #managerView [data-accounts-row]{display:grid;gap:10px;margin:10px 0;align-items:stretch}
  #managerView [data-accounts-row]>.rc-dashboard-launcher{box-sizing:border-box;min-width:0!important;width:100%!important;height:100%;min-height:96px!important;margin:0!important;padding:12px!important;white-space:normal!important;overflow-wrap:anywhere;border-radius:16px!important;box-shadow:inset 0 1px 1px #ffffffdf,0 4px 12px #17304d14!important}
  #managerView [data-accounts-row]>.rc-dashboard-launcher b{font-size:17px!important;line-height:1.3}
  #managerView [data-accounts-row]>.rc-dashboard-launcher small{font-size:11px!important;line-height:1.4}
  #managerView #manager-accounts-launcher{background:linear-gradient(135deg,#f5f1ff,#e8e8ff)!important;border-color:#c8bee8!important;color:#39305b!important}
  #managerView #manager-accounts-launcher small{color:#554c70!important}
  #managerView #manager-mechanical-launcher{background:linear-gradient(135deg,#fff7e8,#f8e7ce)!important;border-color:#e3c59c!important;color:#583d20!important}
  #managerView #manager-mechanical-launcher small{color:#705537!important}
  #managerView [data-accounts-row]>.rc-dashboard-launcher:focus-visible{outline:3px solid #147d92!important;outline-offset:2px}
  @media(max-width:480px){#managerView [data-accounts-row]{gap:7px}#managerView [data-accounts-row]>.rc-dashboard-launcher{padding:9px 7px!important;min-height:106px!important}#managerView [data-accounts-row]>.rc-dashboard-launcher b{font-size:13px!important}#managerView [data-accounts-row]>.rc-dashboard-launcher small{font-size:10px!important}}
  `;document.head.append(style);
 }
 for(const reception of document.querySelectorAll('#managerView:not(.hidden) [data-rc-menu]')){
  let row=reception.parentElement?.dataset.accountsRow?reception.parentElement:null;
  if(!row){
   row=document.createElement('div');row.dataset.accountsRow='1';
   reception.before(row);row.append(reception);
   const b=document.createElement('button');b.type='button';b.className='rc-dashboard-launcher';b.id='manager-accounts-launcher';b.innerHTML='<b>📊 Accounts</b><small>Financial reports · Payments · Expenses</small>';b.onclick=()=>{if(current()?.role==='Manager')location.assign('accountant.html')};row.append(b);
  }
  let mechanical=row.querySelector('#manager-mechanical-launcher');
  if(window.ZUKAIT_MECHANICAL_ENABLED===true&&!mechanical){
   const owner=current().id,b=document.createElement('button');b.type='button';b.className='rc-dashboard-launcher';b.id='manager-mechanical-launcher';b.innerHTML='<b>🔧 Mechanical</b><small>Checklists · Tasks · QC</small>';
   b.onclick=async()=>{if(current()?.role!=='Manager'||current()?.id!==owner||window.ZUKAIT_MECHANICAL_ENABLED!==true)return;b.disabled=true;try{if(typeof window.zukaitCloud?.openMechanicalWorkspace!=='function'||await window.zukaitCloud.openMechanicalWorkspace()===false)throw Error('Mechanical workspace unavailable');}catch{if(current()?.role==='Manager'&&current()?.id===owner)window.alert('Unable to open Mechanical Department. Sync and try again.');}finally{b.disabled=false}};
   row.append(b);mechanical=b;
  }else if(window.ZUKAIT_MECHANICAL_ENABLED!==true&&mechanical){mechanical.remove();mechanical=null;}
  row.style.gridTemplateColumns='repeat('+(mechanical?3:2)+',minmax(0,1fr))';
 }
}
async function createFromUserForm({id,name,password}){
 scopeRetry();const owner=identity();
 if(current()?.role!=='Manager')throw Error('Manager access required');
 if(busy)throw Error('An account request is already in progress');
 const command={operation:'CREATE',target_id:id,login_id:id,name,temporary_password:password,reason:'Manager Create User: Accountant account'};
 const body=retry||{action:'manager_accountant',session_token:token(),request_id:crypto.randomUUID(),command};
 if(retry&&JSON.stringify(retry.command)!==JSON.stringify(command))throw Error('Retry the previous account creation before changing these fields.');
 busy=true;retry=body;
 try{await request(command,body);retry=null;roster=null;rosterHost=null;}catch(e){if(identity()!==owner)scopeRetry();else if(e.status>=400&&e.status<500)retry=null;throw e;}finally{busy=false;}
}
function userListAccounts(){
 const host=document.getElementById('userMgmtList'),table=host?.querySelector('table'),role=document.getElementById('userMgmtRole');
 if(current()?.role!=='Manager'){roster=null;rosterHost=null;rosterOwner=null;rosterToken=null;return;}
 if(!host||!table||host.querySelector('#newUserRole'))return;
 if(role&&!Array.from(role.options).some(o=>o.value==='Accountant')){const o=document.createElement('option');o.value=o.textContent='Accountant';role.append(o);}
 const owner=current().id,t=token();
 if(rosterOwner!==owner||rosterToken!==t){roster=null;rosterHost=null;rosterOwner=owner;rosterToken=t;}
 if(!roster||rosterHost!==host){
  if(rosterLoading)return;rosterLoading=true;rosterHost=host;
  request({operation:'LIST',audit_offset:0}).then(r=>{if(current()?.id===owner&&current()?.role==='Manager'&&token()===t){roster=r.accounts;renderUserAccounts();}}).catch(()=>{if(document.contains(host)&&!host.querySelector('[data-accountant-load-error]')){const e=document.createElement('p');e.dataset.accountantLoadError='1';e.textContent='Accountant accounts could not be loaded. ';const b=document.createElement('button');b.textContent='Retry';b.onclick=()=>{e.remove();rosterHost=null;roster=null;userListAccounts()};e.append(b);host.append(e);}}).finally(()=>{rosterLoading=false;});
  return;
 }
 renderUserAccounts();
}
function renderUserAccounts(){
 const host=document.getElementById('userMgmtList'),table=host?.querySelector('table');
 if(current()?.role!=='Manager'||!table||!roster||rosterOwner!==current().id||rosterToken!==token())return;
 const q=(document.getElementById('userMgmtSearch')?.value||'').trim().toLowerCase(),role=document.getElementById('userMgmtRole')?.value||'All',status=document.getElementById('userMgmtStatus')?.value||'All';
 const signature=JSON.stringify([q,role,status,roster]);
 if(table.dataset.accountantRoster===signature)return;table.dataset.accountantRoster=signature;
 for(const row of [...table.rows].slice(1))if(row.dataset.accountantUser||row.cells[1]?.textContent.trim()==='Accountant')row.remove();
 if(!['All','Accountant'].includes(role))return;
 for(const a of roster.filter(a=>(!q||[a.name,a.id,a.login_id].join(' ').toLowerCase().includes(q))&&(status==='All'||(status==='Active')===a.active))){
  const row=table.insertRow();row.dataset.accountantUser=a.id;
  for(const v of [a.name+' · '+a.login_id,'Accountant','Accounts',a.active?'Active':'Inactive'])row.insertCell().textContent=v;
  const b=document.createElement('button');b.type='button';b.textContent='Manage account';b.onclick=()=>{if(current()?.role==='Manager'){auditOffset=0;open()}};row.insertCell().append(b);
 }
}
function inject(){if(typeof document==='undefined'||!document?.documentElement)return;scopeRetry();dashboardEntry();document.getElementById('accountant-accounts-entry')?.remove();userListAccounts();}
window.zukaitAccountantAccounts={open,createFromUserForm};new MutationObserver(inject).observe(document.body,{subtree:true,childList:true});inject();
})();
