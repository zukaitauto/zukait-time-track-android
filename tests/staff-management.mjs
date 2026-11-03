import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const client=fs.readFileSync('app/src/main/assets/staff_management.js','utf8');
const auth=fs.readFileSync('supabase/functions/staff-auth/index.ts','utf8');
const schema=fs.readFileSync('supabase/migrations/20261103103000_manager_staff_status_audit.sql','utf8');
const page=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
new Function(client);
assert.ok(page.includes('staff_management.js'),'Manager status screen must be loaded in Android/web entrypoint');
assert.ok(auth.includes("action === \"manager_staff\""),'Server must expose authorized Manager staff operation');
assert.ok(auth.includes("session.user.role !== 'Manager'"),'Server requires a Manager session');
assert.ok(auth.includes("authUser(current.data?.login_id || session.user.id,c.manager_password)"),'Sensitive status change requires password confirmation');
assert.ok(auth.includes("'zukait_manager_staff_status'"),'Status changes must call atomic SQL RPC');
assert.ok(schema.includes('security invoker'),'Status-changing function must not bypass row protections');
assert.ok(schema.includes('revoke all on function public.zukait_manager_staff_status'),'Function cannot remain public');
assert.ok(schema.includes('to service_role;'),'Only server privilege receives access');
assert.ok(schema.includes('update public.staff_sessions set revoked_at = v_changed_at'),'Session revocation must be transactional');
assert.ok(schema.includes('insert into public.staff_status_audit'),'Every status change needs immutable audit evidence');
assert.ok(schema.includes("if p_active = false then"),'Reactivation cannot revive old sessions');
assert.ok(schema.includes("v_target_role not in ('Employee','Supervisor','Mechanical Supervisor','Purchaser','Receptionist')"),'Do not deactivate Manager or Accountant with this workflow');

const dom=new JSDOM('<div id="modal"></div>',{url:'https://qa.invalid',runScripts:'outside-only'});
const w=dom.window, requests=[];
const original=[{user_id:'EMP001',display_name:'Asha',role:'Employee',department:'Painter',active:true},
{user_id:'SUP001',display_name:'Sam',role:'Supervisor',department:'Supervisor',active:true},
{user_id:'EMP002',display_name:'Former Employee',role:'Employee',department:'Denter',active:false}];
let rows=structuredClone(original);
w.me={id:'MGR001',role:'Manager'};
let warning='';w.alert=value=>{warning=String(value)};
w.openModal=html=>w.document.getElementById('modal').innerHTML=html;
w.closeModal=()=>w.document.getElementById('modal').replaceChildren();
w.showCreateUserForm=()=>w.document.getElementById('userMgmtList').innerHTML='<form>Create User</form>';
w.resetPassword=()=>{throw Error('Unexpected reset')};
Object.defineProperty(w.navigator,'onLine',{configurable:true,value:true});
Object.defineProperty(w.crypto,'randomUUID',{configurable:true,value:()=> '9134b213-57ae-4d03-929b-0b8c64054a65'});
w.zukaitAuth={managerStaff:async(command,request_id)=>{
 requests.push({command:structuredClone(command),request_id});
 if(command.operation==='LIST')return {ok:true,users:structuredClone(rows)};
 assert.equal(command.target_id,'EMP001');
 assert.equal(command.active,false);
 assert.equal(command.reason,'Left the company');
 assert.equal(command.manager_password,'manager-test-password');
 rows=rows.map(r=>r.user_id==='EMP001'?{...r,active:false}:r);
 return {ok:true,target_id:'EMP001',active:false,changed_at:'2026-11-03T08:00:00+04:00'};
}};
w.eval(client);
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(resolve=>setImmediate(resolve));};
w.openUserManagement();
await settle();
assert.equal(w.document.querySelectorAll('#zum tbody tr').length,3);
assert.match(w.document.querySelector('#zum-totals').textContent,/2 active · 1 inactive/);
assert.equal(w.document.querySelectorAll('#zum .zum-inactive').length,1,'Existing inactive user must not appear as active');
assert.ok(w.document.querySelector('[data-id="EMP002"][data-active="true"]'),'Inactive users must have Reactivate');
const filters=w.document.querySelector('#userMgmtStatus');
filters.value='Inactive';filters.dispatchEvent(new w.Event('change',{bubbles:true}));
assert.equal(w.document.querySelectorAll('#zum tbody tr').length,1,'Inactive filter must reflect server state');
filters.value='All';filters.dispatchEvent(new w.Event('change',{bubbles:true}));
w.document.querySelector('[data-id="EMP001"][data-active="false"]').click();
const dialog=w.document.querySelector('.zum-dialog');
assert.ok(dialog,'Deactivation opens confirmation form');
assert.match(dialog.textContent,/Job Cards, assigned time, completed work and reports will be preserved/);
const form=w.document.querySelector('#zum-status-form');
form.elements.namedItem('reason').value='Left the company';
form.elements.namedItem('typed').value='WRONG';
form.elements.namedItem('password').value='manager-test-password';
form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
assert.equal(requests.filter(r=>r.command.operation==='STATUS').length,0,'Mismatched user ID must not change status');
form.elements.namedItem('typed').value='EMP001';
form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
const statusCalls=requests.filter(r=>r.command.operation==='STATUS');
assert.equal(statusCalls.length,1,'Confirm causes one controlled status request');
assert.equal(statusCalls[0].request_id,'9134b213-57ae-4d03-929b-0b8c64054a65');
assert.equal(w.document.querySelector('.zum-dialog'),null,'Dialog closes after server confirmation');
assert.match(w.document.querySelector('#zum-totals').textContent,/1 active · 2 inactive/);
assert.deepEqual(original,[{user_id:'EMP001',display_name:'Asha',role:'Employee',department:'Painter',active:true},
{user_id:'SUP001',display_name:'Sam',role:'Supervisor',department:'Supervisor',active:true},
{user_id:'EMP002',display_name:'Former Employee',role:'Employee',department:'Denter',active:false}],'No workshop data is changed by status UI');

w.me={id:'EMP001',role:'Employee'};
w.openUserManagement();
assert.equal(warning,'Manager access required.','Non-manager cannot open privileged User Management');
console.log('PASS: manager staff status, existing inactive accounts, filters, typed-ID/password confirmation, one mutation and history preservation');
