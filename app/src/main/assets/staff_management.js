(function(){
 'use strict';
 // Real account status lives in staff_credentials, not workshop state.users.
 let accounts=[],loaded=false,loading=false,busy=false,sequence=0;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const manager=()=>window.me?.role==='Manager';
 const root=()=>document.getElementById('zum');
 const idPattern=/^[A-Z0-9][A-Z0-9_.-]{0,199}$/;
 function stamp(status){return '<span class="zum-status '+(status?'zum-active':'zum-inactive')+'">'+(status?'Active':'Inactive')+'</span>';}
 function css(){
  if(document.getElementById('zum-css'))return;
  const style=document.createElement('style');style.id='zum-css';style.textContent=[
  '#zum{color:#17354a;font-family:inherit;max-width:1050px;margin:0 auto}',
  '#zum .zum-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:15px}',
  '#zum .zum-head h2{margin:0;font-size:22px}#zum .zum-sub{font-size:13px;color:#58748a;margin:4px 0 0}',
  '#zum .zum-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
  '#zum button{min-height:37px;border-radius:9px;padding:8px 12px;font-weight:750;font-size:13px;cursor:pointer}',
  '#zum .zum-primary{background:#0c777e;color:#fff;border:1px solid #0c777e}',
  '#zum .zum-alt{background:#e9f3f8;color:#22495d;border:1px solid #bdd7e6}',
  '#zum .zum-stop{background:#fff3e7;color:#9c3e13;border:1px solid #f1bf9a}',
  '#zum .zum-start{background:#e3f7eb;color:#135735;border:1px solid #a3dfbe}',
  '#zum .zum-filters{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;background:#f0f7fb;border-radius:12px;border:1px solid #d2e6ef;padding:13px;margin-bottom:12px}',
  '#zum .zum-filters label{display:block;font-size:12px;font-weight:800;color:#36516c}',
  '#zum .zum-filters select,#zum .zum-filters input{width:100%;padding:9px 11px;min-height:39px;box-sizing:border-box;border:1px solid #afc6d7;border-radius:8px;background:#fff;color:#203e52;font-size:14px;margin-top:5px}',
  '#zum .zum-table-wrap{overflow-x:auto;border:1px solid #dae6ed;border-radius:12px;background:#fff}',
  '#zum table{border-collapse:collapse;width:100%;min-width:690px;background:#fff}',
  '#zum th{background:#193e55;color:#fff;text-align:left;font-size:12px;padding:11px}',
  '#zum td{border-bottom:1px solid #e2edf2;padding:11px;font-size:13px;vertical-align:middle}',
  '#zum td strong{font-size:14px}#zum td small{color:#647990;font-size:12px}',
  '#zum .zum-status{display:inline-block;padding:6px 10px;border-radius:20px;font-size:12px;font-weight:800}',
  '#zum .zum-active{background:#def6e9;color:#146036}#zum .zum-inactive{background:#ffe9e2;color:#962e12}',
  '#zum .zum-user-actions{display:flex;gap:5px;flex-wrap:wrap}',
  '#zum .zum-info{background:#f1f7fb;color:#425c6e;font-size:13px;border-radius:10px;padding:11px 13px;margin:12px 0;line-height:1.5}',
  '.zum-overlay{position:fixed;inset:0;background:#061b2eb9;display:grid;place-items:center;z-index:2147483100;padding:15px;overflow-y:auto}',
  '.zum-dialog{max-width:490px;width:100%;box-sizing:border-box;background:white;border-radius:18px;box-shadow:0 22px 76px #031a2b7a;overflow:hidden;color:#1d3d53}',
  '.zum-dialog-head{background:linear-gradient(125deg,#153b56,#0e7881);padding:20px;color:white}',
  '.zum-dialog-head h3{font-size:20px;color:white;margin:0 0 5px}.zum-dialog-head p{font-size:13px;margin:0;color:#e1f2f2}',
  '.zum-dialog-body{padding:20px}.zum-dialog-body label{display:block;font-size:13px;font-weight:750;margin:12px 0 5px}',
  '.zum-dialog-body input,.zum-dialog-body textarea{width:100%;box-sizing:border-box;border:1px solid #9cb9c8;border-radius:9px;padding:11px;font:inherit;font-size:14px;color:#16374a;background:white}',
  '.zum-dialog-body textarea{min-height:80px;resize:vertical}.zum-dialog-body .zum-warning{padding:11px;border-radius:10px;background:#fff5e6;color:#864814;font-size:13px;line-height:1.5}',
  '.zum-dialog-body .zum-dialog-error{min-height:19px;color:#ab2c2c;font-size:13px;margin-top:8px}',
  '.zum-dialog-buttons{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px}',
  '.zum-dialog-buttons button{border-radius:9px;padding:11px 15px;font-weight:750;min-height:43px}',
  '.zum-dialog-buttons .zum-cancel{background:#edf4f7;color:#325164;border:1px solid #bdccd5}',
  '.zum-dialog-buttons .zum-submit{background:#126d78;color:white;border:1px solid #126d78}',
  '@media(max-width:700px){#zum .zum-head{align-items:flex-start;flex-direction:column}#zum .zum-filters{grid-template-columns:1fr 1fr}#zum .zum-filters label:first-child{grid-column:1/-1}#zum .zum-actions{width:100%}}'
  ].join('');
  document.head.appendChild(style);
 }
 function renderList(){
  const panel=document.getElementById('userMgmtList');if(!panel)return;
  if(!loaded){if(loading)panel.innerHTML='<p class="zum-info" role="status">Loading server-verified staff accounts…</p>';return;}
  const search=String(document.getElementById('userMgmtSearch')?.value||'').toLowerCase().trim();
  const role=document.getElementById('userMgmtRole')?.value||'All';
  const status=document.getElementById('userMgmtStatus')?.value||'All';
  const rows=accounts.filter(a=>(!search||(a.user_id+' '+a.display_name).toLowerCase().includes(search))&&
       (role==='All'||role===a.role)&&(status==='All'||(status==='Active')===!!a.active));
  const active=accounts.filter(a=>a.active).length,inactive=accounts.length-active;
  const subtitle=document.getElementById('zum-totals');if(subtitle)subtitle.textContent=
    accounts.length+' managed accounts · '+active+' active · '+inactive+' inactive';
  panel.innerHTML='<div class="zum-table-wrap"><table><thead><tr><th>User</th><th>Role / Work Type</th><th>Status</th><th>Manager Actions</th></tr></thead><tbody>'+
    rows.map(a=>'<tr><td><strong>'+esc(a.display_name)+'</strong><div><small>'+esc(a.user_id)+'</small></div></td>'+
      '<td>'+esc(a.role)+'<div><small>'+esc(a.department||'—')+'</small></div></td>'+
      '<td>'+stamp(a.active)+'</td><td><div class="zum-user-actions">'+
      '<button type="button" class="'+(a.active?'zum-stop':'zum-start')+'" data-zum-action="status" data-id="'+esc(a.user_id)+'" data-active="'+(!a.active)+'">'+(a.active?'Deactivate':'Reactivate')+'</button>'+
      (a.active?'<button type="button" class="zum-alt" data-zum-action="reset" data-id="'+esc(a.user_id)+'">Reset Password</button>':'')+
      '</div></td></tr>').join('')+'</tbody></table></div>'+
    (rows.length?'':'<p class="zum-info">No user accounts match your selected filters.</p>');
 }
 async function refresh(){
  if(!manager()||!root())return;
  if(!navigator.onLine){loaded=false;loading=false;document.getElementById('userMgmtList').innerHTML='<p class="zum-info" role="alert">Connect to Server Live to manage staff accounts. No changes have been made.</p>';return;}
  const current=++sequence;
  loaded=false;loading=true;
  const panel=document.getElementById('userMgmtList');if(panel)panel.innerHTML='<p class="zum-info" role="status">Loading server-verified staff accounts…</p>';
  try{
   const r=await window.zukaitAuth?.managerStaff?.({operation:'LIST'});
   if(current!==sequence||!root())return;
   if(!r?.ok||!Array.isArray(r.users))throw Error(message(r));
   accounts=r.users.filter(a=>a?.user_id && ['Employee','Supervisor','Mechanical Supervisor','Purchaser','Receptionist'].includes(a.role))
     .map(a=>({...a,active:a.active===true}));
   loaded=true;loading=false;renderList();
  }catch(err){if(current!==sequence)return;loaded=false;loading=false;if(panel)panel.innerHTML='<p class="zum-info" role="alert">'+esc(err.message||'Staff Management server unavailable. No records were changed.')+'</p>';}
 }
 function message(response){
  const codes={
   invalid_session:'Manager session expired. Sign in again.',
   manager_required:'Only a Manager can manage staff access.',
   manager_password_invalid:'Manager password is incorrect.',
   staff_status_not_found:'This user no longer exists. Refresh User Management.',
   staff_status_self_forbidden:'You cannot deactivate your own Manager account.',
   staff_status_role_forbidden:'This account uses a different protected management workflow.',
   staff_status_unchanged:'This account status has already been updated. Refresh the list.',
   staff_status_request_conflict:'This request ID was already used with different details.',
   staff_status_unavailable:'Staff access management is not yet available on the server.',
   unknown_action:'Staff Management requires the matching server update. No records were changed.',
   invalid_action:'Staff Management requires the matching server update. No records were changed.'
  };
  return codes[response?.code]||(response?._status===404?'Staff Management requires the matching server update. No records were changed.':'The server could not confirm this change. No success has been assumed.');
 }
 function statusDialog(target,desired){
  const account=accounts.find(a=>a.user_id===target);
  if(!manager()||!account||busy||account.active===desired)return;
  const change=desired?'Reactivate':'Deactivate';
  const modal=document.createElement('div');modal.className='zum-overlay';
  modal.innerHTML='<div class="zum-dialog" role="dialog" aria-modal="true" aria-labelledby="zum-dialog-title">'+
    '<div class="zum-dialog-head"><h3 id="zum-dialog-title">'+change+' User ID</h3><p>'+esc(account.display_name)+' · '+esc(account.user_id)+'</p></div>'+
    '<div class="zum-dialog-body"><p class="zum-warning">'+
       (desired?'The user will be allowed to log in again with their existing credentials. Previous sessions will not be restored.':
       'New logins will be blocked and all current sessions revoked. Job Cards, assigned time, completed work and reports will be preserved.')+
     '</p><form id="zum-status-form"><label for="zum-reason">Reason for '+change.toLowerCase()+'</label>'+
     '<textarea id="zum-reason" name="reason" required maxlength="2000" placeholder="'+(desired?'Reason for reactivation':'e.g. Employee left the company')+'"></textarea>'+
     '<label for="zum-typed">Type User ID '+esc(account.user_id)+' to confirm</label>'+
     '<input id="zum-typed" name="typed" required autocomplete="off">'+
     '<label for="zum-password">Confirm your Manager password</label>'+
     '<input id="zum-password" name="password" type="password" autocomplete="current-password" required>'+
     '<div class="zum-dialog-error" role="alert"></div><div class="zum-dialog-buttons">'+
     '<button type="button" class="zum-cancel">Cancel</button>'+
     '<button type="submit" class="zum-submit">Confirm '+change+'</button></div></form></div></div>';
  document.body.appendChild(modal);
  const form=modal.querySelector('#zum-status-form'),error=modal.querySelector('.zum-dialog-error');
  const cancel=modal.querySelector('.zum-cancel'),submit=modal.querySelector('.zum-submit');
  const request_id=crypto.randomUUID();
  let saving=false;
  function close(){if(saving)return;document.removeEventListener('keydown',escapeKey);modal.remove();}
  function escapeKey(e){if(e.key==='Escape'){e.preventDefault();close();}}
  document.addEventListener('keydown',escapeKey);
  cancel.onclick=close;
  form.onsubmit=async e=>{
   e.preventDefault();if(saving||busy)return;
   const f=new FormData(form);
   const reason=String(f.get('reason')||'').trim();
   const typed=String(f.get('typed')||'').trim().toUpperCase();
   const manager_password=String(f.get('password')||'');
   if(typed!==target){error.textContent='User ID does not match. No changes were made.';return;}
   if(reason.length<3){error.textContent='Reason must contain at least 3 characters.';return;}
   if(!navigator.onLine){error.textContent='Server connection required. No changes were made.';return;}
   saving=busy=true;submit.disabled=true;cancel.disabled=true;
   try{
    const r=await window.zukaitAuth?.managerStaff?.({operation:'STATUS',target_id:target,active:desired,reason,manager_password},request_id);
    if(!r?.ok||r.target_id!==target||r.active!==desired)throw Error(message(r));
    saving=busy=false;
    close();
    await refresh();
   }catch(err){error.textContent=err.message||'Unable to confirm server status.';saving=busy=false;submit.disabled=false;cancel.disabled=false;}
   finally{form.elements.namedItem('password').value='';}
  };
  form.elements.namedItem('reason').focus();
 }
 function open(){
  if(!manager())return alert('Manager access required.');
  css();loaded=false;loading=false;accounts=[];
  window.openModal('<div id="zum">'+
   '<div class="zum-head"><div><h2>User Management</h2><p class="zum-sub" id="zum-totals">Server-verified access for workshop staff</p></div>'+
   '<div class="zum-actions"><button class="zum-primary" type="button" data-zum-action="create">+ Create User</button>'+
   '<button class="zum-alt" type="button" data-zum-action="refresh">Refresh</button>'+
   '<button class="zum-alt" type="button" data-zum-action="close">Close</button></div></div>'+
   '<div class="zum-filters"><label>Search by name / User ID<input id="userMgmtSearch" placeholder="Search staff"></label>'+
   '<label>Role<select id="userMgmtRole"><option selected>All</option><option>Employee</option><option>Supervisor</option><option>Mechanical Supervisor</option><option>Purchaser</option><option>Receptionist</option></select></label>'+
   '<label>Status<select id="userMgmtStatus"><option selected>All</option><option>Active</option><option>Inactive</option></select></label></div>'+
   '<p class="zum-info">Deactivation blocks access but does not delete any time logs, Job Cards, invoices, or employee history. Accountant accounts are managed separately.</p>'+
   '<div id="userMgmtList"></div></div>');
  const container=root();if(!container)return;
  container.addEventListener('input',e=>{if(e.target.matches('#userMgmtSearch'))renderList();});
  container.addEventListener('change',e=>{if(e.target.matches('#userMgmtRole,#userMgmtStatus'))renderList();});
  container.addEventListener('click',e=>{
   const btn=e.target.closest('[data-zum-action]');if(!btn)return;e.preventDefault();
   const action=btn.dataset.zumAction;
   if(action==='close')window.closeModal();
   if(action==='refresh')void refresh();
   if(action==='create')window.showCreateUserForm?.();
   if(action==='reset')window.resetPassword?.(btn.dataset.id);
   if(action==='status')statusDialog(btn.dataset.id,btn.dataset.active==='true');
  });
  void refresh();
 }
 window.openUserManagement=open;
 window.filterUserMgmt=()=>{if(root())void refresh();};
 window.zukaitStaffManagement={open,refresh};
})();