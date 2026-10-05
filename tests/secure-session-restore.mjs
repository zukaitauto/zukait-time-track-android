import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('app/src/main/assets/secure_auth.js','utf8');
const key='zukait_secure_session_v42',user={id:'M1',role:'Manager'};
function boot(store,bridge,response={ok:true,user},online=true){
 const classes=new Map(),requests=[];
 const context={console,Date,JSON,String,AbortController,setTimeout(){},clearTimeout(){},MutationObserver:class{observe(){}},
  navigator:{onLine:online},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  document:{documentElement:{},querySelector:()=>null,getElementById:id=>({value:id==='uid'?'M1':id==='pw'?'test-only-password':'',classList:{add(){classes.set(id,true)},remove(){classes.set(id,false)},contains(){return false}}})},
  me:null,employeeClockTimer:null,liveSupervisorTimer:null,clearInterval(){},state:{},passwords:{},KEY:'state',render(){},fetch:async(_url,opts)=>{requests.push(JSON.parse(opts.body));return{status:response.status||200,json:async()=>response}},
  window:{AndroidBridge:bridge}};
 vm.runInNewContext(source,context);return{api:context.window.zukaitAuth,context,requests,classes};
}
for(const kind of ['browser','android']){
 const store=new Map([[key,JSON.stringify({user,token:'legacy'})]]);let native='';
 const bridge=kind==='android'?{saveSecureSessionToken(t){native=t;return true},getSecureSessionToken(){return native},clearSecureSessionToken(){native=''}}:undefined;
 let b=boot(store,bridge);assert.equal(b.api.getToken(),'legacy');
 assert.equal(Boolean(JSON.parse(store.get(key)).token),kind==='browser');
 b=boot(store,bridge);assert.equal(await b.api.restoreSession(),true);assert.equal(b.requests[0].session_token,'legacy');
 assert.equal(b.context.window.currentUser.id,user.id);assert.equal(b.classes.get('app'),false);
 b=boot(store,bridge,{ok:false,status:503});assert.equal(await b.api.restoreSession(),true);assert.equal(b.api.getToken(),'legacy');
 b=boot(store,bridge,{ok:false,code:'invalid_session',status:401});assert.equal(await b.api.restoreSession(),false);assert.equal(store.has(key),false);
 if(bridge)assert.equal(native,'');
}
const failed=new Map([[key,JSON.stringify({user,token:'keep'})]]);
const b=boot(failed,{saveSecureSessionToken(){throw Error('locked')},getSecureSessionToken(){return ''}});
assert.equal(b.api.getToken(),'keep');assert.equal(JSON.parse(failed.get(key)).token,'keep');
const missing=boot(new Map([[key,JSON.stringify({user})]]),undefined,{ok:false,status:503});
assert.equal(await missing.api.restoreSession(),false);
console.log('PASS: browser reload, Android secure migration/reload, failed migration retention, transient server failure, invalid session clearing, V2 user publication.');
// Start with empty storage and exercise the real login writer before reloads.
for(const kind of ['browser','android']){
 const store=new Map();let native='';
 const bridge=kind==='android'?{saveSecureSessionToken(t){native=t;return true},getSecureSessionToken(){return native},clearSecureSessionToken(){native=''}}:undefined;
 let b=boot(store,bridge,{ok:true,user,session_token:'fresh-session'});
 await b.context.window.login();
 assert.equal(b.classes.get('app'),false);
 assert.equal(Boolean(JSON.parse(store.get(key)).token),kind==='browser');
 for(let refresh=0;refresh<3;refresh++){
  b=boot(store,bridge);assert.equal(await b.api.restoreSession(),true);
  assert.equal(b.requests[0].session_token,'fresh-session');assert.equal(b.classes.get('login'),true);
 }
 await b.context.window.logout();
 b=boot(store,bridge);assert.equal(await b.api.restoreSession(),false);
 assert.equal(store.has(key),false);if(bridge)assert.equal(native,'');
}
console.log('PASS: fresh login persists through three reloads on browser and Android; explicit logout stays logged out.');
