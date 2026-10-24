import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
const source=p=>fs.readFileSync('app/src/main/assets/'+p,'utf8');
const session='zukait_secure_session_v42',cache='zukait_offline_demo_v28_final';
const manager={id:'M1',role:'Manager'},supervisor={id:'S1',role:'Supervisor'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const tick=()=>new Promise(r=>setImmediate(r));
function boot({online=true,saved=null}={}){
  const dom=new JSDOM('<!doctype html><head></head><body><div id="login"><input id="uid" value="M1"><input id="pw" value="test-password"><button class="big-action">Login</button></div><div id="app" class="hidden"><div id="legacyAppHeader"></div><div id="employeeView"></div><div id="supervisorView">OLD SUPERVISOR</div><div id="managerView"></div></div><div id="modal">OLD DETAIL</div></body>',{url:'https://qa.invalid/index.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
  const w=dom.window;let native='',actor=manager,handler=null;const requests=[],renders=[],alerts=[];
  Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>online});
  w.setTimeout=()=>1;w.setInterval=()=>1;w.clearTimeout=()=>{};w.clearInterval=()=>{};w.alert=s=>alerts.push(s);
  w.AndroidBridge={getSecureSessionToken:()=>native,saveSecureSessionToken:t=>(native=t,true),clearSecureSessionToken:()=>{native=''},clearPrivateWebData:()=>w.zukaitPrivateDataCleared()};
  if(saved){native='saved-token';w.localStorage.setItem(session,JSON.stringify({user:saved}));}
  w.localStorage.setItem(cache,JSON.stringify({jobs:[{no:'SUPERVISOR-SECRET'}]}));
  w.fetch=async(url,options)=>{
    const body=JSON.parse(options.body);requests.push({url,body,token:options.headers['x-zukait-session']});
    if(handler){const result=handler(body,options);if(result)return result;}
    let result;
    if(body.action==='login')result={ok:true,user:actor,session_token:'token-'+actor.id};
    else if(body.action==='session')result={ok:true,user:actor};
    else if(body.action==='load')result={ok:true,user:actor,revision:5,data:{jobs:[{no:actor.id+'-SERVER'}],users:[actor]}};
    else result={ok:true,user:actor,rows:[],revision:5};
    return {status:200,ok:true,headers:{get:()=>null},json:async()=>result};
  };
  w.eval(source('session_privacy.js'));
  w.eval(`var KEY=${JSON.stringify(cache)},state={jobs:[{no:'OLD-IN-MEMORY'}]},users=[],passwords={},me=null,employeeClockTimer=null,liveSupervisorTimer=null;function closeModal(){document.getElementById('modal').replaceChildren()}function render(){recordRender(me,state)};`);
  w.recordRender=(who,state)=>renders.push(JSON.parse(JSON.stringify({who,state})));
  w.eval(source('cloud_sync.js'));w.eval(source('secure_auth.js'));w.eval(source('v2/core/offline_queue.js'));
  return {w,requests,renders,alerts,actor:x=>{actor=x},handler:x=>{handler=x},online:x=>{online=x;w.dispatchEvent(new w.Event(x?'online':'offline'))},native:()=>native,close:()=>dom.window.close()};
}
// Reproduce account switching with a deliberately slow fresh load.
{
 const b=boot(),hold=deferred();b.handler(body=>body.action==='load'?hold.promise:null);
 const login=b.w.login();await tick();
 assert.equal(b.w.zukaitSessionPrivacy.locked,true);assert.equal(b.renders.length,0);
 assert.equal(b.w.document.getElementById('supervisorView').textContent,'');
 assert.equal(b.w.localStorage.getItem(cache),null);
 hold.resolve({status:200,ok:true,json:async()=>({ok:true,user:manager,revision:2,data:{jobs:[{no:'MANAGER-ONLY'}],users:[manager]}})});
 await login;assert.equal(b.w.zukaitSessionPrivacy.locked,false);assert.equal(b.renders.length,1);
 assert.equal(b.renders[0].who.id,'M1');assert.equal(b.renders[0].state.jobs[0].no,'MANAGER-ONLY');
 b.close();
}
// Offline cold start and unreachable auth never disclose the saved snapshot.
{
 const b=boot(),hold=deferred();b.handler(body=>body.action==='login'?hold.promise:null);
 const login=b.w.login();await tick();await b.w.logout();
 hold.resolve({status:200,json:async()=>({ok:true,user:manager,session_token:'late-login'})});await login;
 assert.equal(b.w.localStorage.getItem(session),null);assert.equal(b.native(),'');assert.equal(b.renders.length,0);b.close();
}
// Same document simulation also proves Supervisor state cannot become the
// Manager's cache while the real app is navigating to its fresh document.
{
 const b=boot();b.actor(supervisor);b.w.document.getElementById('uid').value='S1';await b.w.login();
 assert.equal(b.renders.at(-1).who.id,'S1');await b.w.logout();
 b.actor(manager);b.w.document.getElementById('uid').value='M1';b.w.document.getElementById('pw').value='test-password';await b.w.login();
 assert.equal(b.renders.at(-1).who.id,'M1');assert.equal(b.renders.at(-1).state.jobs[0].no,'M1-SERVER');b.close();
}
for(const offline of [true,false]){
 const b=boot({online:!offline,saved:supervisor});
 if(!offline)b.handler(body=>body.action==='session'?Promise.reject(Error('network down')):null);
 assert.equal(await b.w.zukaitAuth.restoreSession(),false);assert.equal(b.renders.length,0);
 assert.equal(b.w.zukaitSessionPrivacy.locked,true);assert.equal(b.w.document.getElementById('app').classList.contains('hidden'),true);b.close();
}
// Server role/id mismatch and a failed workshop load stay hidden.
for(const result of [{ok:true,user:supervisor,revision:3,data:{jobs:[{no:'WRONG'}]}},{ok:false,code:'server_error'}]){
 const b=boot();b.handler(body=>body.action==='load'?Promise.resolve({status:result.ok?200:503,json:async()=>result}):null);
 await b.w.login();assert.equal(b.renders.length,0);assert.equal(b.w.zukaitSessionPrivacy.locked,true);assert.equal(b.w.document.getElementById('app').classList.contains('hidden'),true);b.close();
}
// Logout is local immediately, even when revocation never returns. A response
// whose JSON arrives after logout may neither write cache nor dirty/retry state.
for(const action of ['load','save','live_status']){
 const b=boot();await b.w.login();const hold=deferred();
 b.handler(body=>body.action===action?Promise.resolve({status:200,json:()=>hold.promise}):body.action==='logout'?new Promise(()=>{}):null);
 let old;
 if(action==='save'){b.w.eval('state.jobs.push({no:"UNCONFIRMED"})');b.w.cloudScheduleSave();old=b.w.zukaitCloud.push();}
 else old=action==='load'?b.w.zukaitCloud.pull(true).catch(()=>false):b.w.zukaitCloud.pullLiveStatus();
 await tick();const out=b.w.logout();
 assert.equal(b.w.localStorage.getItem(session),null);assert.equal(b.native(),'');assert.equal(b.w.zukaitSessionPrivacy.locked,true);
 hold.resolve({ok:true,user:manager,revision:99,data:{jobs:[{no:'OLD-RESPONSE'}]},rows:[{employee_id:'OLD'}]});await old;await out;
 assert.equal(b.w.localStorage.getItem(cache),null);assert.equal(b.w.localStorage.getItem('zukait_cloud_dirty_v42'),null);
 assert.equal(b.w.zukaitCloud.revision,0);assert.equal(b.w.zukaitCloud.dirty,false);assert.equal(b.w.zukaitCloud.confirmedState,null);
 assert.equal(b.w.zukaitServerLive.rows.length,0);b.close();
}
// All server mutations and offline queue entry points are blocked offline.
{
 const b=boot();await b.w.login();b.online(false);const before=b.requests.length;
 for(const action of ['employee_time_action','save','v2_commit_event','time_management','reception','accountant_command'])await assert.rejects(b.w.fetch('https://pjknotnjkufadqavcmii.supabase.co/functions/v1/workshop-api',{body:JSON.stringify({action})}));
 assert.throws(()=>b.w.zukaitV2.queue.enqueue({eventId:'OFFLINE-START'}),/SERVER_CONFIRMATION_REQUIRED/);
 assert.equal(b.requests.length,before);assert.equal(b.w.zukaitSessionPrivacy.locked,true);b.close();
}
// Cleanup removes general caches but retains author-scoped uncertain receipts.
{
 const b=boot();await b.w.login();const journal='zukait_accountant_pending_v1:qa:M1';b.w.localStorage.setItem(journal,'receipt');b.w.localStorage.setItem('zukait_v2_event_queue_v1','old');b.w.sessionStorage.setItem('detail','private');
 await b.w.logout();assert.equal(b.w.localStorage.getItem(journal),'receipt');assert.equal(b.w.localStorage.getItem('zukait_v2_event_queue_v1'),null);assert.equal(b.w.sessionStorage.length,0);b.close();
}
console.log('PASS account isolation: slow login, offline/failed verification, identity mismatch, late load/save/live responses, immediate logout, blocked offline commands and scoped receipts.');
