import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=fs.readFileSync('app/src/main/assets/v2/features/notifications/center.js','utf8');
const storage=new Map(),badge={innerHTML:''},status={textContent:''};
const window={me:{id:'M1',role:'Manager'},users:[{id:'SUP1',role:'Supervisor'}],state:{consumables:{issues:Array.from({length:120},(_,i)=>({id:'material-'+i,createdBy:'SUP1',locked:true,type:'issued',department:'Painting',createdAt:Date.now()-10000-i}))}},zukaitV2:{},addEventListener(){}};
const document={addEventListener(){},querySelectorAll:q=>q==='.zukait-notify-btn'?[badge]:[],querySelector(){return null},getElementById:id=>id==='zukaitNotifyReadStatus'?status:null,documentElement:{}};
let modal='';const sandbox={window,document,navigator:{onLine:false},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},MutationObserver:class{observe(){}},setTimeout(){},setInterval(){},Date,console,openModal:html=>{modal=html}};
vm.createContext(sandbox);vm.runInContext(code,sandbox);const n=window.zukaitNotificationCenter;
const before=JSON.stringify(window.state);
assert.equal(n.unread(),120);n.open();assert.match(badge.innerHTML,/>120</);assert.match(modal,/zukaitNotificationCenter.markAllRead\(\)/);
n.markAllRead();assert.equal(n.unread(),0);assert.doesNotMatch(badge.innerHTML,/zukait-notify-badge/);assert.match(status.textContent,/marked as read/);assert.equal(n.all().length,120);assert.equal(JSON.stringify(window.state),before,'acknowledgement must never modify records');
// A fresh load on the same device retains acknowledgement, including records beyond the first 30.
vm.runInContext(code,sandbox);assert.equal(window.zukaitNotificationCenter.unread(),0);
window.state.consumables.issues.push({id:'new-material',createdBy:'SUP1',locked:true,type:'issued',createdAt:Date.now()});assert.equal(window.zukaitNotificationCenter.unread(),1);
window.me={id:'M2',role:'Manager'};assert.equal(window.zukaitNotificationCenter.unread(),121,'another account keeps its own unread state');
window.me={id:'M1',role:'Manager'};assert.equal(window.zukaitNotificationCenter.unread(),1);
console.log('Notification mark-all: 99+ clears, all 120 acknowledged, records retained, reload persistence, new alerts and account isolation passed.');


// Exercise the real privacy cleanup used by secure_auth during refresh/relogin.
// Earlier tests only reloaded center.js and missed removal of its storage keys.
const {JSDOM}=await import('jsdom');
for(const role of ['Manager','Supervisor']){
 const w=new JSDOM('<html><head></head><body><button class="zukait-notify-btn"></button></body></html>',{url:'https://qa.invalid',runScripts:'outside-only'}).window;
 const observers=[];
 try{
  Object.defineProperty(w.navigator,'onLine',{value:false});
  const NativeObserver=w.MutationObserver;w.MutationObserver=class extends NativeObserver{constructor(fn){super(fn);observers.push(this)}};
  w.fetch=async()=>{throw Error('No network permitted')};w.alert=()=>{};
  w.eval(fs.readFileSync('app/src/main/assets/session_privacy.js','utf8'));
  const owner={id:'QA-'+role,role};w.me=owner;w.openModal=()=>{};
  const records={systemNotifications:[{id:'opened',target:owner.id,message:'First',createdAt:1},{id:'unopened',target:owner.id,message:'Second',createdAt:2}]};
  w.state=records;const original=JSON.stringify(records);w.eval(code);
  w.zukaitNotificationCenter.open();assert.equal(w.zukaitNotificationCenter.unread(),2);
  w.zukaitNotificationCenter.openItem('system-opened');assert.equal(w.zukaitNotificationCenter.unread(),1);
  w.localStorage.setItem('zukait_cached_customer_snapshot','private business data');
  w.localStorage.setItem('zukait-notification-read-'+owner.id+'-payload','must not retain arbitrary cache');
  w.zukaitSessionPrivacy.clearCachedStorage();
  assert.equal(w.localStorage.getItem('zukait_cached_customer_snapshot'),null);
  assert.equal(w.localStorage.getItem('zukait-notification-read-'+owner.id+'-payload'),null);
  w.me=null;w.state={};w.eval(code);w.me=owner;w.state=JSON.parse(original);
  assert.equal(w.zukaitNotificationCenter.unread(),1,role+' refresh must preserve the selected acknowledgement');
  assert.equal(JSON.stringify(w.state),original,'business notifications remain unchanged');
  w.me={id:owner.id+'-OTHER',role};w.state.systemNotifications.forEach(n=>n.target=w.me.id);
  assert.equal(w.zukaitNotificationCenter.unread(),2,'another account must not inherit acknowledgement');
  w.me=owner;w.state=JSON.parse(original);
  if(role==='Manager'){
   w.state.consumables={issues:[{id:'paint-test',createdByRole:'Supervisor',locked:true,type:'issued',createdAt:Date.now()}]};
   w.consOpenNotificationMaterial=()=>true;await w.zukaitNotificationCenter.openPaintRecord('material-paint-test');
   assert.equal(w.zukaitNotificationCenter.unread(),1);w.zukaitSessionPrivacy.clearCachedStorage();w.eval(code);
   assert.equal(w.zukaitNotificationCenter.unread(),1,'material read marker survives authentication cleanup');
  }
  w.zukaitNotificationCenter.markAllRead();w.zukaitSessionPrivacy.clearCachedStorage();w.eval(code);
  assert.equal(w.zukaitNotificationCenter.unread(),0,'explicit mark-all also survives privacy cleanup');
 }finally{for(const observer of observers)observer.disconnect();w.close()}
}
console.log('PASS Manager and Supervisor read markers survive real authentication privacy cleanup; unrelated private caches removed and accounts isolated.');
