// Recovery of an unconfirmed PAUSE must never generate a second START.
// Run: node tests/employee-pause-journal-recovery.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
const start=src.indexOf('/* V300 SERVER-AUTHORITATIVE EMPLOYEE TIME CONTROLS');
const end=src.indexOf('/* EMPLOYEE OCEAN TIMER',start);
assert.ok(start>=0&&end>start,'V300 work controls must exist');
const block=src.slice(start,end);
const server=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
assert.match(server,/if\(type==="PAUSE"&&session\.paused===true\) status="Paused"/,
 'Replaying the original PAUSE to an already-paused session must be idempotent');
function fixture({reject=false,actor='EMP002',type='PAUSE',job='12109',session='CLOSED12109'}={}){
 const journalKey='zukait_employee_time_pending_v1:'+actor;
 const command={event_type:type,action_id:'original-action-id',device_id:'device-1',
  client_time:Date.parse('2026-10-31T17:32:35+04:00'),
  job,assignment_id:'J12109-AKHIL',session_id:session,reason:''};
 const storage=new Map([[journalKey,JSON.stringify({actor,command,label:'Pausing 12109'})]]);
 const calls=[],messages=[],elems=new Map(),disabled=[];
 const live={employee_id:actor,status:'Working',job_no:'12086',session_id:'CURRENT12086',
  assignment_id:'JC12086-AKHIL',session_start:Date.parse('2026-11-01T08:30:00+04:00')};
 const doc={
   getElementById:id=>elems.get(id)||null,
   querySelectorAll:()=>disabled,
   createElement:tag=>({tagName:tag,style:{},dataset:{},remove(){elems.delete(this.id)}}),
   body:{appendChild:e=>elems.set(e.id,e)}
 };
 const me={id:actor,name:'Akhil',role:'Employee'};
 const state={assign:[{id:'JC12086-AKHIL',emp:actor,job:'12086',completed:false}],
  sessions:[{id:'CLOSED12109',emp:actor,job:'12109',end:Date.parse('2026-10-31T17:32:35+04:00'),paused:true},
            {id:'CURRENT12086',emp:actor,job:'12086',end:null,start:live.session_start}]};
 const cloud={
   employeeTimeAction:async payload=>{
     calls.push(payload);
     if(reject){const error=Error('NETWORK');error.code='NETWORK';throw error}
     return {ok:true,audit:{confirmed:true,id:payload.action_id,emp:actor,type:payload.event_type},
      live_row:live,server_revision:100};
   },
   pull:async()=>true,pullLiveStatus:async()=>true
 };
 const win={
   zukaitCloud:cloud,zukaitServerLive:{rows:[live]},v74Msg:(message,title)=>{messages.push({message,title});return {message,title}},
   v74Pause(){},v74Finish(){},finish(){}
 };
 const ctx={
   window:win,me,state,document:doc,localStorage:{
     getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)
   },activeSession:emp=>state.sessions.find(s=>s.emp===emp&&s.end==null)||null,
   render:()=>{},closeModal:()=>{},openModal:()=>{},crypto:{randomUUID:()=> 'NEW-ID'},console
 };
 vm.runInNewContext(block,ctx);
 return {ctx,win,storage,journalKey,calls,messages,state,live,command};
}
{
 const f=fixture();
 await f.win.start('12086');
 assert.equal(f.calls.length,1,'exactly one server request');
 assert.equal(f.calls[0].event_type,'PAUSE','replay original PAUSE; do not dispatch START');
 assert.equal(f.calls[0].action_id,'original-action-id','retain old action ID for idempotency');
 assert.equal(f.calls[0].session_id,'CLOSED12109','target prior JC session, not currently running work');
 assert.equal(f.storage.has(f.journalKey),false,'delete journal only after valid PAUSE receipt');
 assert.equal(f.live.status,'Working','currently running JC remains unchanged');
 assert.equal(f.live.job_no,'12086');
 assert.equal(f.state.sessions.length,2,'no new productive or waiting session');
 assert.equal(f.messages.at(-1).title,'Work Recovered');
 assert.match(f.messages.at(-1).message,/12109 is now confirmed/);
 assert.match(f.messages.at(-1).message,/12086 as Working/);
 await f.win.start('12086');
 assert.equal(f.calls.length,1,'second Resume cannot accidentally duplicate active JC start');
 assert.match(f.messages.at(-1).message,/Server shows active work on 12086/);
}
{
 const f=fixture({reject:true});
 await f.win.start('12086');
 assert.equal(f.calls.length,1,'one retry request only');
 assert.equal(f.calls[0].event_type,'PAUSE');
 assert.equal(f.storage.has(f.journalKey),true,'network failure must retain original pending command');
 assert.equal(JSON.parse(f.storage.get(f.journalKey)).command.action_id,'original-action-id');
 assert.equal(f.state.sessions.length,2,'no new start on unconfirmed response');
 assert.equal(f.messages.at(-1).title,'Not Confirmed');
}
{
 const f=fixture({type:'FINISH'});
 await f.win.start('12086');
 assert.equal(f.calls.length,0,'conflicting FINISH journal must not be replaced by new START');
 assert.equal(f.storage.has(f.journalKey),true);
 assert.match(f.messages.at(-1).message,/Retry pending FINISH/);
}
{
 const f=fixture();
 f.win.zukaitCloud.employeeTimeAction=async payload=>{
   f.calls.push(payload);
   return {ok:true,audit:{confirmed:true,id:'WRONG-ID',emp:'EMP002',type:'PAUSE'}};
 };
 await f.win.start('12086');
 assert.equal(f.calls.length,1);
 assert.equal(f.storage.has(f.journalKey),true,'wrong action ID receipt must never remove journal');
 assert.equal(f.messages.at(-1).title,'Not Confirmed');
}
{
 const f=fixture();
 const c=JSON.parse(f.storage.get(f.journalKey));c.actor='OTHER';f.storage.set(f.journalKey,JSON.stringify(c));
 await f.win.start('12086');
 assert.equal(f.calls.length,0,'cross-user journal not replayed');
 assert.equal(f.storage.has(f.journalKey),true,'invalid ownership not deleted');
}
console.log('Employee stale PAUSE recovery after server-confirmed JC change: exact-ID retry, no duplicate START, fail-closed on network/receipt/actor mismatch PASS');
