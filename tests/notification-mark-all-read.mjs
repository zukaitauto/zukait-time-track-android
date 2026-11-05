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
assert.equal(n.unread(),120);n.open();assert.match(badge.innerHTML,/99\+/);assert.match(modal,/zukaitNotificationCenter.markAllRead\(\)/);
n.markAllRead();assert.equal(n.unread(),0);assert.doesNotMatch(badge.innerHTML,/zukait-notify-badge/);assert.match(status.textContent,/marked as read/);assert.equal(n.all().length,120);assert.equal(JSON.stringify(window.state),before,'acknowledgement must never modify records');
// A fresh load on the same device retains acknowledgement, including records beyond the first 30.
vm.runInContext(code,sandbox);assert.equal(window.zukaitNotificationCenter.unread(),0);
window.state.consumables.issues.push({id:'new-material',createdBy:'SUP1',locked:true,type:'issued',createdAt:Date.now()});assert.equal(window.zukaitNotificationCenter.unread(),1);
window.me={id:'M2',role:'Manager'};assert.equal(window.zukaitNotificationCenter.unread(),121,'another account keeps its own unread state');
window.me={id:'M1',role:'Manager'};assert.equal(window.zukaitNotificationCenter.unread(),1);
console.log('Notification mark-all: 99+ clears, all 120 acknowledged, records retained, reload persistence, new alerts and account isolation passed.');
