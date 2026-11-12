import assert from 'node:assert/strict';
import {prepareLeaveMutation,accountantLeaveCommand} from '../supabase/functions/workshop-api/accountant/leave_commands.js';
const actor={id:'A',role:'Accountant'},manager={id:'M',role:'Manager'};
const now=Date.parse('2026-11-12T12:00:00+04:00');
let data={users:[{id:'E',name:'Employee',role:'Employee',active:true},{id:'S',name:'Supervisor',role:'Supervisor',active:true}],
 leaves:[],leaveAudit:[],sessions:[],workshopHolidays:['2026-11-17']},revision=4,commits=0;
const ids=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const admin={
 from(table){
  let target;
  return {select(){return this},eq(key,value){target=value;return this},
   async single(){assert.equal(table,'workshop_state');return {data:{revision,data:JSON.parse(JSON.stringify(data))},error:null}},
   async maybeSingle(){assert.equal(table,'staff_credentials');const p=data.users.find(x=>x.id===target);return {data:p?{user_id:p.id,role:p.role,active:p.active}:null,error:null}}};
 },
 async rpc(name,args){assert.equal(name,'zukait_commit_workshop_state_v2');if(args.p_expected_revision!==revision)return {data:{ok:false},error:null};
  assert.equal(args.p_changed_by,'A');assert.equal(args.p_live.revision,revision+1);
  data=args.p_data;revision++;commits++;return {data:{ok:true,revision},error:null};}
};
const live=(state,next)=>({revision:next,leaves:state.leaves.length});
const command=async(body,user=actor)=>accountantLeaveCommand(admin,user,body,now,live);
const add={operation:'ADD',emp:'E',date:'2026-11-14',period:'AM',remark:'Morning leave',reason:''};
let reply=await command({request_id:ids(1),expected_revision:revision,command:add});
assert.equal(reply.status,200);assert.equal(data.leaves.length,1);assert.equal(data.leaves[0].by,'A');
assert.equal(data.leaveAudit.length,1);assert.equal(data.leaveAudit[0].action,'ADD');
const original=JSON.stringify(data);
reply=await command({request_id:ids(1),expected_revision:4,command:add});assert.equal(reply.body.replayed,true);
assert.equal(commits,1);assert.equal(JSON.stringify(data),original,'replay does not duplicate records');
reply=await command({request_id:ids(1),expected_revision:revision,command:{...add,period:'PM'}});
assert.equal(reply.status,409,'same request ID with changed payload rejected');
reply=await command({request_id:ids(2),expected_revision:revision,command:add});assert.equal(reply.body.code,'duplicate_leave');
reply=await command({request_id:ids(3),expected_revision:revision,command:{...add,date:'2026-11-13'}});assert.equal(reply.body.code,'closed_leave_day');
reply=await command({request_id:ids(4),expected_revision:revision,command:{...add,date:'2026-11-17'}});assert.equal(reply.body.code,'closed_leave_day');
reply=await command({request_id:ids(5),expected_revision:revision-1,command:{...add,date:'2026-11-16'}});assert.equal(reply.body.code,'leave_revision_conflict');
reply=await command({request_id:ids(6),expected_revision:revision,command:{...add,emp:'A',date:'2026-11-16'}});assert.equal(reply.status,403,'Accountant cannot assign leave to self or Manager');
reply=await command({request_id:ids(7),expected_revision:revision,command:{...add,date:'2026-11-16'}},{id:'X',role:'Receptionist'});assert.equal(reply.status,403);
const leaveId=data.leaves[0].id;
reply=await command({request_id:ids(8),expected_revision:revision,command:{operation:'EDIT',leave_id:leaveId,emp:'S',date:'2026-11-16',period:'FULL',remark:'Edited',reason:'Corrected staff'}});
assert.equal(reply.status,200);assert.equal(data.leaves[0].emp,'S');assert.equal(data.leaves[0].period,'FULL');
assert.equal(data.leaveAudit.at(-1).action,'EDIT');assert.equal(data.leaveAudit.at(-1).before.emp,'E');
reply=await command({request_id:ids(9),expected_revision:revision,command:{operation:'CANCEL',leave_id:leaveId,reason:'Entered in error'}});
assert.equal(reply.status,200);assert.equal(data.leaves[0].cancelled,true);assert.equal(data.leaves[0].cancelledBy,'A');
assert.equal(data.leaveAudit.at(-1).action,'DELETE');
reply=await command({request_id:ids(10),expected_revision:revision,command:{operation:'CANCEL',leave_id:leaveId,reason:'Again'}});
assert.equal(reply.status,404,'cancelled leave cannot be cancelled twice');
data.sessions.push({id:'work',emp:'E',start:Date.parse('2026-11-14T08:00:00+04:00'),end:Date.parse('2026-11-14T10:00:00+04:00')});
const full={...add,period:'FULL',reason:'Authorized remaining duty'};
reply=await command({request_id:ids(11),expected_revision:revision,command:full});
assert.equal(reply.body.code,'work_conflict');
reply=await command({request_id:ids(12),expected_revision:revision,command:{...full,after_work:true}});
assert.equal(reply.status,200);
assert.equal(data.leaves.at(-1).startAt,Date.parse('2026-11-14T10:00:00+04:00'));
data.sessions.push({id:'active',emp:'E',start:Date.parse('2026-11-12T08:00:00+04:00'),end:null});
reply=await command({request_id:ids(13),expected_revision:revision,command:{...full,date:'2026-11-12',after_work:true}});
assert.equal(reply.body.code,'active_work_conflict');
const unchanged=JSON.stringify(data);
const result=prepareLeaveMutation(data,manager,{...full,date:'2026-11-13'},ids(14),now,'Employee');
assert.equal(result.status,409);assert.equal(JSON.stringify(data),unchanged,'failed checks never modify source workshop state');
console.log('Accountant Leave Management: scoped roles, duplicate/Friday/holiday/work conflicts, after-work, edit, cancellation, audit, version CAS and idempotent replay PASS');
