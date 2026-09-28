import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const source=fs.readFileSync('app/src/main/assets/dashboard_diagnostics.js','utf8');
assert.match(html,/<script src="dashboard_diagnostics\.js\?v=\d+"><\/script>/);
for(const path of ['v63_updates.js','v65_updates.js']){
  const about=fs.readFileSync('app/src/main/assets/'+path,'utf8');
  assert.match(about,/zukaitDisplayDiagnostics\.open\(\)/,path+' must expose Display Check');
}

let online=true,originalCalls=0,modal='',observer;
const events={};
const root=id=>({id,classList:{contains:()=>false}});
const roots=Object.fromEntries(['employeeView','supervisorView','managerView'].map(id=>[id,root(id)]));
const window={render(...args){originalCalls++;return args[0]},addEventListener(event,fn){events[event]=fn}};
class MutationObserver{constructor(callback){this.callback=callback;observer=this}observe(target){assert.ok(roots[target.id])}}
const context={window,document:{getElementById:id=>roots[id]},navigator:{get onLine(){return online}},MutationObserver,openModal:s=>{modal=s},Date};
vm.runInNewContext(source,context);
assert.equal(window.render('kept'),'kept');
assert.equal(originalCalls,1);
assert.equal(window.zukaitDisplayDiagnostics.snapshot().renders,1);
observer.callback([{type:'childList',target:roots.employeeView,removedNodes:[{}]}]);
assert.equal(window.zukaitDisplayDiagnostics.snapshot().replacements,1);
online=false;events.offline();
assert.equal(window.zukaitDisplayDiagnostics.snapshot().networkChanges,1);
assert.equal(window.zukaitDisplayDiagnostics.snapshot().renders,1);
window.zukaitDisplayDiagnostics.open();
assert.match(modal,/Dashboard replacements<\/th><td>1/);
assert.match(modal,/Network changes<\/th><td>1/);
assert.doesNotMatch(modal,/employeeView|sessionToken/);

const start=html.indexOf('function refreshNetworkLabels(){');
const end=html.indexOf('\n\nfunction toggleEmployeeRequests()',start);
assert.ok(start>=0&&end>start);
const labels={headerOnlineText:{textContent:'Online'},net:{textContent:'Online'}};
let offline=false;
labels.headerOnlineStatus={classList:{contains:()=>offline,toggle(_,value){offline=value}}};
const networkEvents={};
const networkContext={window:{addEventListener(event,fn){networkEvents[event]=fn}},document:{getElementById:id=>labels[id]},navigator:{get onLine(){return online}},render(){throw Error('network event must not render dashboard')}};
vm.runInNewContext(html.slice(start,end),networkContext);
networkEvents.offline();
assert.equal(labels.headerOnlineText.textContent,'Offline');
assert.equal(labels.net.textContent,'OFFLINE');
assert.equal(offline,true);
online=true;networkEvents.online();
assert.equal(labels.headerOnlineText.textContent,'Online');
assert.equal(offline,false);
console.log('Display Check counters and network-only label refresh passed');
